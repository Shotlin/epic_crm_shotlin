import { createHash, randomUUID } from 'node:crypto';
import type { ShadowImportScope } from './shadow-import-postgres-repository';

export const retailHubChannelOrderPermissions = ['channel-orders:ingest', 'channel-orders:read'] as const;
export type RetailHubChannelOrderPermission = (typeof retailHubChannelOrderPermissions)[number];

export const retailHubChannelOrderChannels = ['pos', 'website', 'app', 'whatsapp', 'ondc', 'marketplace'] as const;
export type RetailHubChannelOrderChannel = (typeof retailHubChannelOrderChannels)[number];

export const retailHubChannelOrderStatuses = ['received', 'accepted', 'picking', 'packed', 'fulfilled', 'cancelled', 'return-requested', 'returned', 'rto'] as const;
export type RetailHubChannelOrderStatus = (typeof retailHubChannelOrderStatuses)[number];
export type RetailHubChannelOrderIngestionMode = 'shadow' | 'governed';
export type RetailHubChannelOrderOutcome = 'recorded' | 'idempotent' | 'conflicted';
export const retailHubPaymentEvidenceStatuses = ['pending', 'authorized', 'captured', 'failed', 'refunded'] as const;
export type RetailHubPaymentEvidenceStatus = (typeof retailHubPaymentEvidenceStatuses)[number];

export interface RetailHubChannelOrderEvent {
  channel: RetailHubChannelOrderChannel;
  connectionId: string;
  externalOrderId: string;
  externalEventId: string;
  occurredAt: string;
  status: RetailHubChannelOrderStatus;
  currency: 'INR';
  totalAmountPaise: number;
  lines: RetailHubChannelOrderLine[];
  paymentEvidence?: RetailHubPaymentEvidence;
  identityKey: string;
  sourceDigest: string;
}

/**
 * Provider-neutral payment evidence. It is an attested reference and payload
 * checksum only; the Hub does not treat it as proof until the provider adapter
 * and settlement workpaper are certified in production.
 */
export interface RetailHubPaymentEvidence {
  status: RetailHubPaymentEvidenceStatus;
  provider: string;
  providerEventId: string;
  paymentReference: string;
  amountPaise: number;
  currency: 'INR';
  payloadChecksum: string;
}

export interface RetailHubChannelOrderLine {
  externalLineId: string;
  sku: string;
  quantity: number;
  unitAmountPaise: number;
}

export interface RetailHubChannelOrderEnvelope {
  mode: RetailHubChannelOrderIngestionMode;
  event: RetailHubChannelOrderEvent;
}

export interface RetailHubChannelOrderReceipt {
  id: string;
  eventId: string;
  identityKey: string;
  sourceDigest: string;
  mode: RetailHubChannelOrderIngestionMode;
  outcome: RetailHubChannelOrderOutcome;
  actorId: string;
  receivedAt: string;
  scope: ShadowImportScope;
  detail?: string;
}

export interface RetailHubChannelOrderRecord {
  event: RetailHubChannelOrderEvent;
  mode: RetailHubChannelOrderIngestionMode;
  scope: ShadowImportScope;
  receivedAt: string;
  receivedBy: string;
  receipts: RetailHubChannelOrderReceipt[];
}

export interface RetailHubChannelOrderAcceptResult {
  outcome: RetailHubChannelOrderOutcome;
  receipt: RetailHubChannelOrderReceipt;
  record?: RetailHubChannelOrderRecord;
}

export interface RetailHubChannelOrderTransportStore {
  accept(envelope: RetailHubChannelOrderEnvelope, scope: ShadowImportScope, actorId: string, now?: string): Promise<RetailHubChannelOrderAcceptResult>;
  list(scope: ShadowImportScope): Promise<readonly RetailHubChannelOrderReceipt[]>;
}

export class RetailHubChannelOrderValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RetailHubChannelOrderValidationError';
  }
}

const MAX_PAISA = 1_000_000_000_000;

/**
 * Parses the transport envelope used by the authenticated Hub route. The
 * transport intentionally accepts normalized evidence only; provider secrets,
 * signed payloads and arbitrary source blobs never cross this boundary.
 */
export function parseRetailHubChannelOrderEnvelope(value: unknown): RetailHubChannelOrderEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RetailHubChannelOrderValidationError('Channel-order body must be an object.');
  const input = value as Record<string, unknown>;
  const mode = input.mode;
  if (mode !== 'shadow' && mode !== 'governed') throw new RetailHubChannelOrderValidationError('mode must be shadow or governed.');
  if (!input.event || typeof input.event !== 'object' || Array.isArray(input.event)) throw new RetailHubChannelOrderValidationError('event must be an object.');
  return { mode, event: normalizeRetailHubChannelOrderEvent(input.event) };
}

export function normalizeRetailHubChannelOrderEvent(value: unknown): RetailHubChannelOrderEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RetailHubChannelOrderValidationError('event must be an object.');
  const input = value as Record<string, unknown>;
  const channel = boundedText(input.channel, 'channel', 2, 30).toLowerCase();
  if (!retailHubChannelOrderChannels.includes(channel as RetailHubChannelOrderChannel)) throw new RetailHubChannelOrderValidationError('channel is not supported.');
  const status = boundedText(input.status, 'status', 3, 30).toLowerCase();
  if (!retailHubChannelOrderStatuses.includes(status as RetailHubChannelOrderStatus)) throw new RetailHubChannelOrderValidationError('status is not supported.');
  const currency = boundedText(input.currency ?? 'INR', 'currency', 3, 3).toUpperCase();
  if (currency !== 'INR') throw new RetailHubChannelOrderValidationError('only INR channel orders are supported.');
  const linesInput = input.lines;
  if (!Array.isArray(linesInput) || linesInput.length < 1 || linesInput.length > 500) throw new RetailHubChannelOrderValidationError('lines must contain between 1 and 500 entries.');
  const lineIds = new Set<string>();
  const lines = linesInput.map((line, index) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw new RetailHubChannelOrderValidationError(`lines[${index}] must be an object.`);
    const candidate = line as Record<string, unknown>;
    const externalLineId = boundedText(candidate.externalLineId, `lines[${index}].externalLineId`, 1, 160);
    if (lineIds.has(externalLineId)) throw new RetailHubChannelOrderValidationError('externalLineId must be unique.');
    lineIds.add(externalLineId);
    return {
      externalLineId,
      sku: boundedText(candidate.sku, `lines[${index}].sku`, 1, 160),
      quantity: positiveInteger(candidate.quantity, `lines[${index}].quantity`, 1_000_000),
      unitAmountPaise: nonNegativePaise(candidate.unitAmountPaise, `lines[${index}].unitAmountPaise`),
    };
  });
  const normalized = {
    channel: channel as RetailHubChannelOrderChannel,
    connectionId: boundedText(input.connectionId, 'connectionId', 1, 160),
    externalOrderId: boundedText(input.externalOrderId, 'externalOrderId', 1, 200),
    externalEventId: boundedText(input.externalEventId, 'externalEventId', 1, 200),
    occurredAt: boundedTimestamp(input.occurredAt, 'occurredAt'),
    status: status as RetailHubChannelOrderStatus,
    currency: 'INR' as const,
    totalAmountPaise: positivePaise(input.totalAmountPaise, 'totalAmountPaise'),
    lines,
  };
  const paymentEvidence = normalizePaymentEvidence(input.paymentEvidence);
  if (paymentEvidence) Object.assign(normalized, { paymentEvidence });
  const sourceDigest = channelOrderDigest(normalized);
  return { ...normalized, identityKey: `${normalized.channel}:${normalized.connectionId}:${normalized.externalOrderId}`, sourceDigest };
}

function normalizePaymentEvidence(value: unknown): RetailHubPaymentEvidence | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new RetailHubChannelOrderValidationError('paymentEvidence must be an object.');
  const input = value as Record<string, unknown>;
  const status = boundedText(input.status, 'paymentEvidence.status', 3, 20).toLowerCase();
  if (!retailHubPaymentEvidenceStatuses.includes(status as RetailHubPaymentEvidenceStatus)) throw new RetailHubChannelOrderValidationError('paymentEvidence.status is not supported.');
  const currency = boundedText(input.currency ?? 'INR', 'paymentEvidence.currency', 3, 3).toUpperCase();
  if (currency !== 'INR') throw new RetailHubChannelOrderValidationError('paymentEvidence must use INR.');
  const payloadChecksum = typeof input.payloadChecksum === 'string' ? input.payloadChecksum.trim().toLowerCase() : '';
  if (!/^[a-f0-9]{64}$/.test(payloadChecksum)) throw new RetailHubChannelOrderValidationError('paymentEvidence.payloadChecksum must be a SHA-256 checksum.');
  return {
    status: status as RetailHubPaymentEvidenceStatus,
    provider: boundedText(input.provider, 'paymentEvidence.provider', 1, 80),
    providerEventId: boundedText(input.providerEventId, 'paymentEvidence.providerEventId', 1, 240),
    paymentReference: boundedText(input.paymentReference, 'paymentEvidence.paymentReference', 1, 240),
    amountPaise: positivePaise(input.amountPaise, 'paymentEvidence.amountPaise'),
    currency: 'INR',
    payloadChecksum,
  };
}

export function createInMemoryRetailHubChannelOrderTransport(createId = () => randomUUID()): RetailHubChannelOrderTransportStore {
  const records = new Map<string, RetailHubChannelOrderRecord>();
  const receipts: RetailHubChannelOrderReceipt[] = [];

  return {
    async accept(envelope, scope, actorId, now = new Date().toISOString()) {
      const normalizedScope = normalizeScope(scope);
      const parsed = parseRetailHubChannelOrderEnvelope(envelope);
      const scopeKey = scopeKeyOf(normalizedScope);
      const key = `${scopeKey}:${parsed.event.identityKey}`;
      const existing = records.get(key);
      if (!existing) {
        const record: RetailHubChannelOrderRecord = { event: structuredClone(parsed.event), mode: parsed.mode, scope: structuredClone(normalizedScope), receivedAt: now, receivedBy: actorId, receipts: [] };
        records.set(key, record);
        const receipt = makeReceipt(createId(), parsed, normalizedScope, actorId, now, 'recorded');
        record.receipts.push(receipt);
        receipts.push(receipt);
        return { outcome: 'recorded', receipt, record: structuredClone(record) };
      }
      if (existing.event.externalEventId === parsed.event.externalEventId) {
        if (existing.event.sourceDigest === parsed.event.sourceDigest) {
          const receipt = makeReceipt(createId(), parsed, normalizedScope, actorId, now, 'idempotent', 'The event was already accepted with the same source digest.');
          existing.receipts.push(receipt);
          receipts.push(receipt);
          return { outcome: 'idempotent', receipt, record: structuredClone(existing) };
        }
        const receipt = makeReceipt(createId(), parsed, normalizedScope, actorId, now, 'conflicted', 'The event ID was already recorded with a different source digest.');
        receipts.push(receipt);
        return { outcome: 'conflicted', receipt };
      }
      if (!isStatusTransitionAllowed(existing.event.status, parsed.event.status)) {
        const receipt = makeReceipt(createId(), parsed, normalizedScope, actorId, now, 'conflicted', `Cannot move ${existing.event.status} to ${parsed.event.status}.`);
        receipts.push(receipt);
        return { outcome: 'conflicted', receipt, record: structuredClone(existing) };
      }
      existing.event = structuredClone(parsed.event);
      if (existing.mode === 'shadow' && parsed.mode === 'governed') existing.mode = 'governed';
      existing.receivedAt = now;
      existing.receivedBy = actorId;
      const receipt = makeReceipt(createId(), parsed, normalizedScope, actorId, now, 'recorded');
      existing.receipts.push(receipt);
      receipts.push(receipt);
      return { outcome: 'recorded', receipt, record: structuredClone(existing) };
    },
    async list(scope) {
      const key = scopeKeyOf(normalizeScope(scope));
      return receipts.filter((receipt) => scopeKeyOf(receipt.scope) === key).map((receipt) => structuredClone(receipt));
    },
  };
}

function makeReceipt(id: string, envelope: RetailHubChannelOrderEnvelope, scope: ShadowImportScope, actorId: string, now: string, outcome: RetailHubChannelOrderOutcome, detail?: string): RetailHubChannelOrderReceipt {
  return { id, eventId: envelope.event.externalEventId, identityKey: envelope.event.identityKey, sourceDigest: envelope.event.sourceDigest, mode: envelope.mode, outcome, actorId, receivedAt: now, scope: structuredClone(scope), ...(detail === undefined ? {} : { detail }) };
}

function isStatusTransitionAllowed(current: RetailHubChannelOrderStatus, next: RetailHubChannelOrderStatus): boolean {
  const allowed: Record<RetailHubChannelOrderStatus, readonly RetailHubChannelOrderStatus[]> = {
    received: ['received', 'accepted', 'cancelled'], accepted: ['accepted', 'picking', 'cancelled'], picking: ['picking', 'packed', 'cancelled'], packed: ['packed', 'fulfilled', 'cancelled', 'rto'], fulfilled: ['fulfilled', 'return-requested', 'returned', 'rto'], cancelled: ['cancelled'], 'return-requested': ['return-requested', 'returned', 'rto'], returned: ['returned'], rto: ['rto'],
  };
  return allowed[current].includes(next);
}

function channelOrderDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => { result[key] = canonicalize((value as Record<string, unknown>)[key]); return result; }, {});
  return value;
}

function boundedText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new RetailHubChannelOrderValidationError(`${label} must be text.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new RetailHubChannelOrderValidationError(`${label} must contain ${min}-${max} characters.`);
  return normalized;
}

function positiveInteger(value: unknown, label: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) throw new RetailHubChannelOrderValidationError(`${label} must be a positive integer.`);
  return value;
}

function positivePaise(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > MAX_PAISA) throw new RetailHubChannelOrderValidationError(`${label} must be a positive paise integer.`);
  return value;
}

function nonNegativePaise(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_PAISA) throw new RetailHubChannelOrderValidationError(`${label} must be a non-negative paise integer.`);
  return value;
}

function boundedTimestamp(value: unknown, label: string): string {
  const normalized = boundedText(value, label, 10, 40);
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) throw new RetailHubChannelOrderValidationError(`${label} must be a valid timestamp.`);
  return date.toISOString();
}

function normalizeScope(scope: ShadowImportScope): ShadowImportScope {
  return { tenantId: boundedText(scope.tenantId, 'tenantId', 1, 160), companyId: boundedText(scope.companyId, 'companyId', 1, 160), branchId: boundedText(scope.branchId, 'branchId', 1, 160) };
}

function scopeKeyOf(scope: ShadowImportScope): string {
  return `${scope.tenantId}/${scope.companyId}/${scope.branchId}`;
}
