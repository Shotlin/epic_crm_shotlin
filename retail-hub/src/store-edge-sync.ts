import { createHash, randomUUID } from 'node:crypto';
import type { ShadowImportScope } from './shadow-import-postgres-repository';

const MAX_PAYLOAD_BYTES = 96 * 1024;
const SECRET_KEY_PATTERN = /(password|secret|token|authorization|api[_-]?key|access[_-]?token|private[_-]?key)/i;

export type StoreEdgeSyncOutcome = 'recorded' | 'idempotent' | 'conflicted';

export interface StoreEdgeSyncEventInput {
  eventId: string;
  eventType: string;
  aggregateId: string;
  transactionKey: string;
  sequence: number;
  producedAt: string;
  payloadChecksum: string;
  payload: Record<string, unknown>;
}

export interface StoreEdgeSyncReceipt {
  id: string;
  eventId: string;
  eventType: string;
  aggregateId: string;
  transactionKey: string;
  sequence: number;
  payloadChecksum: string;
  outcome: StoreEdgeSyncOutcome;
  actorId: string;
  receivedAt: string;
  scope: ShadowImportScope;
  detail?: string;
}

export interface StoreEdgeSyncRecord extends StoreEdgeSyncEventInput {
  scope: ShadowImportScope;
  receivedAt: string;
  receivedBy: string;
}

export interface StoreEdgeSyncAcceptResult {
  outcome: StoreEdgeSyncOutcome;
  receipt: StoreEdgeSyncReceipt;
  record?: StoreEdgeSyncRecord;
}

/** Result returned by a durable inbox/outbox transaction. */
export interface StoreEdgeSyncAtomicAcceptResult extends StoreEdgeSyncAcceptResult {
  /** Durable worker item created or reused in the same transaction. */
  workItemId?: string;
}

export interface StoreEdgeSyncInbox {
  accept(input: StoreEdgeSyncEventInput, scope: ShadowImportScope, actorId: string, now?: string): Promise<StoreEdgeSyncAcceptResult>;
  list(scope: ShadowImportScope): Promise<readonly StoreEdgeSyncReceipt[]>;
}

export class StoreEdgeSyncValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'StoreEdgeSyncValidationError';
  }
}

export function checksumStoreEdgePayload(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function parseStoreEdgeSyncEvent(value: unknown): StoreEdgeSyncEventInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StoreEdgeSyncValidationError('Store Edge sync body must be an object.');
  const input = value as Record<string, unknown>;
  const eventId = boundedText(input.eventId, 'eventId', 3, 160);
  const eventType = boundedText(input.eventType, 'eventType', 3, 80);
  const aggregateId = boundedText(input.aggregateId, 'aggregateId', 1, 160);
  const transactionKey = boundedText(input.transactionKey, 'transactionKey', 3, 160);
  const sequence = boundedInteger(input.sequence, 'sequence', 1, Number.MAX_SAFE_INTEGER);
  const producedAt = boundedTimestamp(input.producedAt, 'producedAt');
  const payloadChecksum = boundedText(input.payloadChecksum, 'payloadChecksum', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(payloadChecksum)) throw new StoreEdgeSyncValidationError('payloadChecksum must be a SHA-256 hexadecimal digest.');
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw new StoreEdgeSyncValidationError('payload must be a JSON object.');
  const payload = structuredClone(input.payload) as Record<string, unknown>;
  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (payloadBytes > MAX_PAYLOAD_BYTES) throw new StoreEdgeSyncValidationError(`Store Edge payload cannot exceed ${MAX_PAYLOAD_BYTES} bytes.`);
  rejectSecretKeys(payload);
  if (checksumStoreEdgePayload(payload) !== payloadChecksum) throw new StoreEdgeSyncValidationError('payloadChecksum does not match the supplied payload.');
  return { eventId, eventType, aggregateId, transactionKey, sequence, producedAt, payloadChecksum, payload };
}

export function createInMemoryStoreEdgeSyncInbox(createId = () => cryptoRandomId()): StoreEdgeSyncInbox {
  const records = new Map<string, StoreEdgeSyncRecord>();
  const receipts: StoreEdgeSyncReceipt[] = [];
  const latestSequence = new Map<string, number>();

  return {
    async accept(input, scope, actorId, now = new Date().toISOString()) {
      const normalized = parseStoreEdgeSyncEvent(input);
      const scopeKey = scopeKeyOf(scope);
      const eventKey = `${scopeKey}:${normalized.eventId}`;
      const existing = records.get(eventKey);
      if (existing) {
        if (existing.payloadChecksum === normalized.payloadChecksum) {
          const receipt = receiptOf(createId(), normalized, scope, actorId, now, 'idempotent', 'The Store Edge event was already accepted with the same checksum.');
          receipts.push(receipt);
          return { outcome: 'idempotent', receipt, record: existing };
        }
        const receipt = receiptOf(createId(), normalized, scope, actorId, now, 'conflicted', 'The event ID was already recorded with a different payload checksum.');
        receipts.push(receipt);
        return { outcome: 'conflicted', receipt };
      }
      const transactionConflict = [...records.values()].find((record) => scopeKeyOf(record.scope) === scopeKey && record.transactionKey === normalized.transactionKey && record.payloadChecksum !== normalized.payloadChecksum);
      if (transactionConflict) {
        const receipt = receiptOf(createId(), normalized, scope, actorId, now, 'conflicted', 'The transaction key was already recorded with a different payload checksum.');
        receipts.push(receipt);
        return { outcome: 'conflicted', receipt };
      }
      const previousSequence = latestSequence.get(scopeKey);
      if (previousSequence !== undefined && normalized.sequence <= previousSequence) {
        const receipt = receiptOf(createId(), normalized, scope, actorId, now, 'conflicted', `Sequence ${normalized.sequence} is not greater than the last accepted sequence ${previousSequence}.`);
        receipts.push(receipt);
        return { outcome: 'conflicted', receipt };
      }
      const record: StoreEdgeSyncRecord = { ...normalized, scope: structuredClone(scope), receivedAt: now, receivedBy: actorId };
      records.set(eventKey, record);
      latestSequence.set(scopeKey, normalized.sequence);
      const receipt = receiptOf(createId(), normalized, scope, actorId, now, 'recorded');
      receipts.push(receipt);
      return { outcome: 'recorded', receipt, record };
    },
    async list(scope) {
      const key = scopeKeyOf(scope);
      return receipts.filter((receipt) => scopeKeyOf(receipt.scope) === key).map((receipt) => structuredClone(receipt));
    },
  };
}

function receiptOf(id: string, input: StoreEdgeSyncEventInput, scope: ShadowImportScope, actorId: string, now: string, outcome: StoreEdgeSyncOutcome, detail?: string): StoreEdgeSyncReceipt {
  return { id, eventId: input.eventId, eventType: input.eventType, aggregateId: input.aggregateId, transactionKey: input.transactionKey, sequence: input.sequence, payloadChecksum: input.payloadChecksum, outcome, actorId, receivedAt: now, scope: structuredClone(scope), ...(detail === undefined ? {} : { detail }) };
}

function boundedText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new StoreEdgeSyncValidationError(`${label} must be text.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new StoreEdgeSyncValidationError(`${label} must contain ${min}-${max} characters.`);
  return normalized;
}

function boundedInteger(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new StoreEdgeSyncValidationError(`${label} must be an integer from ${min} to ${max}.`);
  return value;
}

function boundedTimestamp(value: unknown, label: string): string {
  const normalized = boundedText(value, label, 10, 40);
  if (!Number.isFinite(Date.parse(normalized))) throw new StoreEdgeSyncValidationError(`${label} must be a valid ISO timestamp.`);
  return normalized;
}

function rejectSecretKeys(value: unknown, path = 'payload'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSecretKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) throw new StoreEdgeSyncValidationError(`${path}.${key} is not allowed in Store Edge sync payloads.`);
    rejectSecretKeys(child, `${path}.${key}`);
  }
}

function scopeKeyOf(scope: ShadowImportScope): string {
  return `${scope.tenantId}/${scope.companyId}/${scope.branchId}`;
}

function cryptoRandomId(): string {
  return randomUUID();
}
