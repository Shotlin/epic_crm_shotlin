import type { ShadowImportScope } from './shadow-import-postgres-repository';
import type { StoreEdgeSyncWorkItem, StoreEdgeSyncWorkStore } from './store-edge-sync-worker';

export interface StoreEdgeSyncWorkerRunOptions {
  scope: ShadowImportScope;
  workerId: string;
  now?: string;
  leaseMs?: number;
  /** Renew an active lease while its processor is running. Defaults to half the lease. */
  leaseHeartbeatMs?: number;
  limit?: number;
  backoffMs?: number;
  maxAttempts?: number;
}

export interface StoreEdgeSyncWorkerRunReport {
  workerId: string;
  startedAt: string;
  finishedAt: string;
  claimed: number;
  completed: number;
  retryable: number;
  deadLetter: number;
  failures: Array<{ workId: string; eventId: string; error: string; status: 'retryable' | 'dead-letter' }>;
}

export interface StoreEdgeSyncWorkerMetrics {
  runs: number;
  claimed: number;
  completed: number;
  retryable: number;
  deadLetter: number;
  lastRunAt?: string;
}

/** Durable, legal-scope-bound metrics projection used by the worker runtime.
 * Implementations must persist only the supplied tenant/company/branch scope. */
export interface StoreEdgeSyncWorkerMetricsStore {
  load(scope: ShadowImportScope): Promise<StoreEdgeSyncWorkerMetrics>;
  save(scope: ShadowImportScope, metrics: StoreEdgeSyncWorkerMetrics): Promise<void>;
}

export type StoreEdgeSyncWorkProcessor = (item: StoreEdgeSyncWorkItem) => Promise<void>;

export interface StoreEdgeSyncWorkerRuntime {
  runOnce(options: StoreEdgeSyncWorkerRunOptions, process: StoreEdgeSyncWorkProcessor): Promise<StoreEdgeSyncWorkerRunReport>;
  metrics(scope?: ShadowImportScope): StoreEdgeSyncWorkerMetrics;
  /** Read the durable projection before a worker run, when configured. */
  loadMetrics(scope: ShadowImportScope): Promise<StoreEdgeSyncWorkerMetrics>;
}

export function createStoreEdgeSyncWorkerRuntime(
  store: StoreEdgeSyncWorkStore,
  clock: () => string = () => new Date().toISOString(),
  metricsStore?: StoreEdgeSyncWorkerMetricsStore,
): StoreEdgeSyncWorkerRuntime {
  const metricsByScope = new Map<string, StoreEdgeSyncWorkerMetrics>();
  let lastScopeKey: string | undefined;
  const loadMetrics = async (scope: ShadowImportScope): Promise<StoreEdgeSyncWorkerMetrics> => {
    const normalizedScope = normalizeScope(scope);
    const scopeKey = scopeIdentity(normalizedScope);
    const loaded = metricsStore ? await metricsStore.load(normalizedScope) : metricsByScope.get(scopeKey) ?? emptyMetrics();
    const normalized = normalizeMetrics(loaded);
    metricsByScope.set(scopeKey, structuredClone(normalized));
    lastScopeKey = scopeKey;
    return structuredClone(normalized);
  };
  return {
    async runOnce(options, process) {
      if (typeof process !== 'function') throw new Error('Store Edge worker processor is required.');
      const startedAt = validTimestamp(options.now ?? clock(), 'Store Edge worker start time');
      const normalizedScope = normalizeScope(options.scope);
      const scopeKey = scopeIdentity(normalizedScope);
      const metricsState = await loadMetrics(normalizedScope);
      const leaseMs = boundedInteger(options.leaseMs ?? 60_000, 'Store Edge lease duration', 1_000, 15 * 60_000);
      const heartbeatMs = boundedInteger(options.leaseHeartbeatMs ?? Math.max(250, Math.floor(leaseMs / 2)), 'Store Edge lease heartbeat', 250, leaseMs - 1);
      const claimed = await store.claim(options.scope, { workerId: options.workerId, now: startedAt, leaseMs, limit: options.limit });
      let completed = 0;
      let retryable = 0;
      let deadLetter = 0;
      const failures: StoreEdgeSyncWorkerRunReport['failures'] = [];
      for (const item of claimed) {
        let heartbeatError: unknown;
        const heartbeat = setInterval(() => {
          void store.renew(options.scope, item.id, options.workerId, clock(), leaseMs, item.leaseToken).catch((error: unknown) => {
            heartbeatError ??= error;
          });
        }, heartbeatMs);
        try {
          await process(item);
          if (heartbeatError) throw heartbeatError;
          await store.complete(options.scope, item.id, options.workerId, clock(), item.leaseToken);
          completed += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Store Edge worker processing failed.';
          const retried = await store.retry(options.scope, item.id, options.workerId, message, clock(), options.backoffMs, options.maxAttempts, item.leaseToken);
          const failureStatus = retried.status === 'dead-letter' ? 'dead-letter' as const : 'retryable' as const;
          if (failureStatus === 'dead-letter') deadLetter += 1;
          else retryable += 1;
          failures.push({ workId: item.id, eventId: item.eventId, error: message.slice(0, 500), status: failureStatus });
        } finally {
          clearInterval(heartbeat);
        }
      }
      const finishedAt = validTimestamp(clock(), 'Store Edge worker finish time');
      metricsState.runs += 1;
      metricsState.claimed += claimed.length;
      metricsState.completed += completed;
      metricsState.retryable += retryable;
      metricsState.deadLetter += deadLetter;
      metricsState.lastRunAt = finishedAt;
      metricsByScope.set(scopeKey, structuredClone(metricsState));
      lastScopeKey = scopeKey;
      if (metricsStore) await metricsStore.save(normalizedScope, metricsState);
      return { workerId: options.workerId, startedAt, finishedAt, claimed: claimed.length, completed, retryable, deadLetter, failures };
    },
    metrics(scope) {
      const scopeKey = scope === undefined ? lastScopeKey : scopeIdentity(normalizeScope(scope));
      return structuredClone(scopeKey === undefined ? emptyMetrics() : metricsByScope.get(scopeKey) ?? emptyMetrics());
    },
    loadMetrics,
  };
}

function boundedInteger(value: number, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

export function emptyStoreEdgeSyncWorkerMetrics(): StoreEdgeSyncWorkerMetrics {
  return emptyMetrics();
}

function emptyMetrics(): StoreEdgeSyncWorkerMetrics {
  return { runs: 0, claimed: 0, completed: 0, retryable: 0, deadLetter: 0 };
}

function normalizeMetrics(value: StoreEdgeSyncWorkerMetrics): StoreEdgeSyncWorkerMetrics {
  if (!value || typeof value !== 'object') throw new Error('Store Edge worker metrics are malformed.');
  const candidate = value as unknown as Record<string, unknown>;
  const fields = ['runs', 'claimed', 'completed', 'retryable', 'deadLetter'] as const;
  const normalized = {} as StoreEdgeSyncWorkerMetrics;
  for (const field of fields) {
    const numberValue = candidate[field];
    if (typeof numberValue !== 'number' || !Number.isSafeInteger(numberValue) || numberValue < 0) throw new Error(`Store Edge worker metric ${field} is invalid.`);
    normalized[field] = numberValue;
  }
  if (candidate.lastRunAt !== undefined) {
    if (typeof candidate.lastRunAt !== 'string') throw new Error('Store Edge worker last run time is invalid.');
    normalized.lastRunAt = validTimestamp(candidate.lastRunAt, 'Store Edge worker last run time');
  }
  return normalized;
}

function normalizeScope(scope: ShadowImportScope): ShadowImportScope {
  if (!scope || typeof scope !== 'object') throw new Error('Store Edge worker scope is required.');
  const candidate = scope as unknown as Record<string, unknown>;
  return {
    tenantId: nonBlank(candidate.tenantId, 'Tenant scope'),
    companyId: nonBlank(candidate.companyId, 'Company scope'),
    branchId: nonBlank(candidate.branchId, 'Branch scope'),
  };
}

function scopeIdentity(scope: ShadowImportScope): string {
  return JSON.stringify([scope.tenantId, scope.companyId, scope.branchId]);
}

function nonBlank(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must not be blank.`);
  return value.trim();
}

function validTimestamp(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || !Number.isFinite(Date.parse(normalized))) throw new Error(`${label} must be a valid timestamp.`);
  return normalized;
}
