import type { ShadowImportScope } from './shadow-import-postgres-repository';
import type { StoreEdgeSyncRecord } from './store-edge-sync';

export type StoreEdgeSyncWorkStatus = 'pending' | 'leased' | 'retryable' | 'completed' | 'dead-letter';

export interface StoreEdgeSyncWorkItem {
  id: string;
  eventId: string;
  scope: ShadowImportScope;
  status: StoreEdgeSyncWorkStatus;
  attempts: number;
  availableAt: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  /** Unique fencing token for this lease; stale workers cannot acknowledge a re-leased item. */
  leaseToken?: string;
  lastError?: string;
  completedAt?: string;
  requeueCount?: number;
  lastRecoveryAt?: string;
  lastRecoveryBy?: string;
  lastRecoveryReason?: string;
  lastRecoveryReference?: string;
}

export interface StoreEdgeSyncWorkClaimOptions {
  workerId: string;
  now?: string;
  leaseMs?: number;
  limit?: number;
}

export interface StoreEdgeSyncWorkStore {
  enqueue(record: StoreEdgeSyncRecord, now?: string): Promise<StoreEdgeSyncWorkItem>;
  claim(scope: ShadowImportScope, options: StoreEdgeSyncWorkClaimOptions): Promise<readonly StoreEdgeSyncWorkItem[]>;
  renew(scope: ShadowImportScope, id: string, workerId: string, now?: string, leaseMs?: number, leaseToken?: string): Promise<StoreEdgeSyncWorkItem>;
  requeueDeadLetter(scope: ShadowImportScope, id: string, operatorId: string, reason: string, reference: string, now?: string): Promise<StoreEdgeSyncWorkItem>;
  complete(scope: ShadowImportScope, id: string, workerId: string, now?: string, leaseToken?: string): Promise<StoreEdgeSyncWorkItem>;
  retry(scope: ShadowImportScope, id: string, workerId: string, error: string, now?: string, backoffMs?: number, maxAttempts?: number, leaseToken?: string): Promise<StoreEdgeSyncWorkItem>;
  list(scope: ShadowImportScope): Promise<readonly StoreEdgeSyncWorkItem[]>;
}

export class StoreEdgeSyncWorkerValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'StoreEdgeSyncWorkerValidationError';
  }
}

export function createInMemoryStoreEdgeSyncWorkStore(createId = () => cryptoRandomId()): StoreEdgeSyncWorkStore {
  const items = new Map<string, StoreEdgeSyncWorkItem>();
  return {
    async enqueue(record, now = new Date().toISOString()) {
      const scope = normalizeScope(record.scope);
      const existing = [...items.values()].find((candidate) => sameScope(candidate.scope, scope) && candidate.eventId === record.eventId);
      if (existing) return structuredClone(existing);
      const item: StoreEdgeSyncWorkItem = { id: createId(), eventId: nonBlank(record.eventId, 'Store Edge event ID'), scope, status: 'pending', attempts: 0, availableAt: validTimestamp(now, 'Store Edge work available time') };
      items.set(key(scope, item.id), item);
      return structuredClone(item);
    },

    async claim(scope, options) {
      const normalizedScope = normalizeScope(scope);
      const workerId = nonBlank(options.workerId, 'Store Edge worker ID');
      const now = validTimestamp(options.now ?? new Date().toISOString(), 'Store Edge claim time');
      const leaseMs = boundedInteger(options.leaseMs ?? 60_000, 'Store Edge lease duration', 1_000, 15 * 60_000);
      const limit = boundedInteger(options.limit ?? 10, 'Store Edge claim limit', 1, 100);
      const nowMs = Date.parse(now);
      const candidates = [...items.values()]
        .filter((item) => sameScope(item.scope, normalizedScope) && isClaimable(item, now, nowMs))
        .sort((left, right) => left.availableAt.localeCompare(right.availableAt) || left.id.localeCompare(right.id))
        .slice(0, limit);
      const leased = candidates.map((item) => {
        item.status = 'leased';
        item.attempts += 1;
        item.leaseOwner = workerId;
        item.leaseExpiresAt = new Date(nowMs + leaseMs).toISOString();
        item.leaseToken = cryptoRandomId();
        return structuredClone(item);
      });
      return leased;
    },

    async renew(scope, id, workerId, now = new Date().toISOString(), leaseMs = 60_000, leaseToken) {
      const item = ownedLease(items, scope, id, workerId, now, leaseToken);
      const normalizedLeaseMs = boundedInteger(leaseMs, 'Store Edge lease duration', 1_000, 15 * 60_000);
      const nowMs = Date.parse(validTimestamp(now, 'Store Edge lease renewal time'));
      item.leaseExpiresAt = new Date(nowMs + normalizedLeaseMs).toISOString();
      return structuredClone(item);
    },

    async requeueDeadLetter(scope, id, operatorId, reason, reference, now = new Date().toISOString()) {
      const normalizedScope = normalizeScope(scope);
      const normalizedId = nonBlank(id, 'Store Edge dead-letter work ID');
      const item = items.get(key(normalizedScope, normalizedId));
      if (!item || !sameScope(item.scope, normalizedScope)) throw new StoreEdgeSyncWorkerValidationError('Store Edge dead-letter work item is missing or outside the requested scope.');
      if (item.status !== 'dead-letter') throw new StoreEdgeSyncWorkerValidationError('Only a dead-letter Store Edge item can be requeued.');
      const normalizedOperator = nonBlank(operatorId, 'Store Edge recovery operator');
      const normalizedReason = boundedText(reason, 'Store Edge recovery reason', 10, 500);
      const normalizedReference = boundedText(reference, 'Store Edge recovery reference', 3, 200);
      const normalizedNow = validTimestamp(now, 'Store Edge recovery time');
      item.status = 'retryable';
      item.attempts = 0;
      item.availableAt = normalizedNow;
      item.leaseOwner = undefined;
      item.leaseExpiresAt = undefined;
      item.leaseToken = undefined;
      item.requeueCount = (item.requeueCount ?? 0) + 1;
      item.lastRecoveryAt = normalizedNow;
      item.lastRecoveryBy = normalizedOperator;
      item.lastRecoveryReason = normalizedReason;
      item.lastRecoveryReference = normalizedReference;
      return structuredClone(item);
    },

    async complete(scope, id, workerId, now = new Date().toISOString(), leaseToken) {
      const item = ownedLease(items, scope, id, workerId, now, leaseToken);
      item.status = 'completed';
      item.completedAt = validTimestamp(now, 'Store Edge completion time');
      item.leaseOwner = undefined;
      item.leaseExpiresAt = undefined;
      item.leaseToken = undefined;
      item.lastError = undefined;
      return structuredClone(item);
    },

    async retry(scope, id, workerId, error, now = new Date().toISOString(), backoffMs = 5_000, maxAttempts = 5, leaseToken) {
      const item = ownedLease(items, scope, id, workerId, now, leaseToken);
      const normalizedError = nonBlank(error, 'Store Edge retry error');
      const normalizedBackoff = boundedInteger(backoffMs, 'Store Edge retry backoff', 0, 24 * 60 * 60 * 1000);
      const normalizedMaxAttempts = boundedInteger(maxAttempts, 'Store Edge maximum attempts', 1, 100);
      const nowMs = Date.parse(validTimestamp(now, 'Store Edge retry time'));
      item.lastError = normalizedError.slice(0, 500);
      item.leaseOwner = undefined;
      item.leaseExpiresAt = undefined;
      item.leaseToken = undefined;
      if (item.attempts >= normalizedMaxAttempts) {
        item.status = 'dead-letter';
        item.availableAt = new Date(nowMs).toISOString();
      } else {
        item.status = 'retryable';
        item.availableAt = new Date(nowMs + normalizedBackoff).toISOString();
      }
      return structuredClone(item);
    },

    async list(scope) {
      const normalizedScope = normalizeScope(scope);
      return [...items.values()].filter((item) => sameScope(item.scope, normalizedScope)).sort((left, right) => right.availableAt.localeCompare(left.availableAt)).map((item) => structuredClone(item));
    },
  };
}

function ownedLease(items: Map<string, StoreEdgeSyncWorkItem>, scope: ShadowImportScope, id: string, workerId: string, now: string, leaseToken?: string): StoreEdgeSyncWorkItem {
  const normalizedScope = normalizeScope(scope);
  const item = items.get(key(normalizedScope, nonBlank(id, 'Store Edge work ID')));
  const normalizedNow = validTimestamp(now, 'Store Edge worker time');
  if (!item || !sameScope(item.scope, normalizedScope)) throw new StoreEdgeSyncWorkerValidationError('Store Edge work item is missing or outside the requested scope.');
  if (item.status !== 'leased' || item.leaseOwner !== nonBlank(workerId, 'Store Edge worker ID')) throw new StoreEdgeSyncWorkerValidationError('Store Edge work item is not leased to this worker.');
  if (!item.leaseToken || item.leaseToken !== nonBlank(leaseToken, 'Store Edge lease fencing token')) throw new StoreEdgeSyncWorkerValidationError('Store Edge work lease fencing token is missing or stale.');
  if (!item.leaseExpiresAt || Date.parse(item.leaseExpiresAt) <= Date.parse(normalizedNow)) throw new StoreEdgeSyncWorkerValidationError('Store Edge work lease has expired.');
  return item;
}

function isClaimable(item: StoreEdgeSyncWorkItem, now: string, nowMs: number): boolean {
  if (item.status === 'pending' || item.status === 'retryable') return Date.parse(item.availableAt) <= nowMs;
  return item.status === 'leased' && Boolean(item.leaseExpiresAt) && Date.parse(item.leaseExpiresAt!) <= Date.parse(now);
}

function key(scope: ShadowImportScope, id: string): string {
  return `${scope.tenantId}/${scope.companyId}/${scope.branchId}/${id}`;
}

function sameScope(left: ShadowImportScope, right: ShadowImportScope): boolean {
  return left.tenantId === right.tenantId && left.companyId === right.companyId && left.branchId === right.branchId;
}

function normalizeScope(value: ShadowImportScope): ShadowImportScope {
  return { tenantId: nonBlank(value.tenantId, 'Tenant scope'), companyId: nonBlank(value.companyId, 'Company scope'), branchId: nonBlank(value.branchId, 'Branch scope') };
}

function nonBlank(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 500) throw new StoreEdgeSyncWorkerValidationError(`${label} is required.`);
  return value.trim();
}

function validTimestamp(value: string, label: string): string {
  const normalized = nonBlank(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new StoreEdgeSyncWorkerValidationError(`${label} must be a valid timestamp.`);
  return normalized;
}

function boundedInteger(value: number, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new StoreEdgeSyncWorkerValidationError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

function boundedText(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > maximum) throw new StoreEdgeSyncWorkerValidationError(`${label} must be between ${minimum} and ${maximum} characters.`);
  return value.trim();
}

function cryptoRandomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
