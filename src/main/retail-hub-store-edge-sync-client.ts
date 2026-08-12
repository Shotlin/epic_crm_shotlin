import { createHash } from 'node:crypto';
import type {
  RetailHubStoreEdgeSyncEvent,
  RetailHubStoreEdgeSyncReceipt,
  RetailHubStoreEdgeSyncResult,
  RetailHubStoreEdgeSyncScope,
  SendRetailHubStoreEdgeSyncInput,
} from '../shared/retail-hub-store-edge-sync-contracts';

const MAX_PAYLOAD_BYTES = 96 * 1024;
const MAX_RESPONSE_BYTES = 512 * 1024;
const SECRET_KEY_PATTERN = /(password|secret|token|authorization|api[_-]?key|access[_-]?token|private[_-]?key|signing[_-]?key)/iu;

export interface RetailHubStoreEdgeSyncHttpResponse {
  status: number;
  contentType?: string;
  body: Uint8Array;
}

export interface RetailHubStoreEdgeSyncClientOptions {
  /** Main-process deployment adapter. It may attach mTLS or vaulted auth. */
  request?: (url: string, body: Uint8Array, signal: AbortSignal) => Promise<RetailHubStoreEdgeSyncHttpResponse>;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Sends exactly one checksum-bound Store Edge event to the Hub. No credential
 * can enter the input; an authenticated deployment must provide the request
 * adapter. A 403/5xx is an error and never becomes a local success receipt.
 */
export async function sendRetailHubStoreEdgeSync(
  input: SendRetailHubStoreEdgeSyncInput,
  options: RetailHubStoreEdgeSyncClientOptions = {},
): Promise<RetailHubStoreEdgeSyncResult> {
  const url = buildRetailHubStoreEdgeSyncUrl(input.baseUrl);
  const event = validateEvent(input.event);
  const body = new TextEncoder().encode(JSON.stringify(event));
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) throw new Error('Retail Hub Store Edge sync timeout must be between 1000 and 60000 milliseconds.');
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 5 * 1024 * 1024) throw new Error('Retail Hub Store Edge sync response limit is invalid.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.request ?? defaultRequest)(url, body, controller.signal);
    if (response.status !== 200 && response.status !== 202 && response.status !== 409) {
      throw new Error(`Retail Hub Store Edge sync returned HTTP ${response.status}; no receipt was accepted.`);
    }
    if (!response.contentType || !/^application\/json(?:\s*;|$)/iu.test(response.contentType)) throw new Error('Retail Hub Store Edge sync response must be application/json.');
    if (!response.body || typeof response.body.byteLength !== 'number' || response.body.byteLength > maxResponseBytes) throw new Error('Retail Hub Store Edge sync response exceeds the safety limit.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(response.body));
    } catch {
      throw new Error('Retail Hub Store Edge sync response is not valid JSON.');
    }
    const result = validateResult(parsed, response.status);
    if (result.receipt.payloadChecksum !== event.payloadChecksum || result.receipt.eventId !== event.eventId) throw new Error('Retail Hub Store Edge sync receipt does not match the submitted event.');
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export function buildRetailHubStoreEdgeSyncUrl(baseUrl: string): string {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) throw new Error('Retail Hub base URL is required.');
  let base: URL;
  try {
    base = new URL(baseUrl.trim());
  } catch {
    throw new Error('Retail Hub base URL is invalid.');
  }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Retail Hub base URL must be a credential-free HTTPS URL without query or fragment data.');
  const pathname = base.pathname.replace(/\/+$/u, '');
  return new URL(`${pathname}/v1/store-edge/sync`, base.origin).toString();
}

function validateEvent(value: unknown): RetailHubStoreEdgeSyncEvent {
  if (!isRecord(value)) throw new Error('Store Edge sync event must be an object.');
  const event: RetailHubStoreEdgeSyncEvent = {
    eventId: boundedText(value.eventId, 'eventId', 3, 160),
    eventType: boundedText(value.eventType, 'eventType', 3, 80),
    aggregateId: boundedText(value.aggregateId, 'aggregateId', 1, 160),
    transactionKey: boundedText(value.transactionKey, 'transactionKey', 3, 160),
    sequence: boundedInteger(value.sequence, 'sequence'),
    producedAt: boundedTimestamp(value.producedAt, 'producedAt'),
    payloadChecksum: boundedText(value.payloadChecksum, 'payloadChecksum', 64, 64).toLowerCase(),
    payload: value.payload as Record<string, unknown>,
  };
  if (!/^[a-f0-9]{64}$/u.test(event.payloadChecksum)) throw new Error('payloadChecksum must be a SHA-256 hexadecimal digest.');
  if (!isRecord(value.payload)) throw new Error('Store Edge sync payload must be a JSON object.');
  rejectSecretKeys(event.payload);
  const payloadBytes = Buffer.byteLength(JSON.stringify(event.payload), 'utf8');
  if (payloadBytes > MAX_PAYLOAD_BYTES) throw new Error(`Store Edge payload cannot exceed ${MAX_PAYLOAD_BYTES} bytes.`);
  if (checksum(event.payload) !== event.payloadChecksum) throw new Error('payloadChecksum does not match the supplied payload.');
  return event;
}

function validateResult(value: unknown, status: number): RetailHubStoreEdgeSyncResult {
  if (!isRecord(value) || !isRecord(value.receipt)) throw new Error('Retail Hub Store Edge sync response is missing its receipt.');
  const outcome = value.outcome;
  if (outcome !== 'recorded' && outcome !== 'idempotent' && outcome !== 'conflicted') throw new Error('Retail Hub Store Edge sync outcome is invalid.');
  if ((status === 202 && outcome !== 'recorded') || (status === 200 && outcome !== 'idempotent') || (status === 409 && outcome !== 'conflicted')) throw new Error('Retail Hub Store Edge sync HTTP status and outcome disagree.');
  const receipt = validateReceipt(value.receipt);
  return { httpStatus: status as 200 | 202 | 409, outcome, receipt };
}

function validateReceipt(value: unknown): RetailHubStoreEdgeSyncReceipt {
  if (!isRecord(value)) throw new Error('Store Edge sync receipt is invalid.');
  const outcome = value.outcome;
  if (outcome !== 'recorded' && outcome !== 'idempotent' && outcome !== 'conflicted') throw new Error('Store Edge sync receipt outcome is invalid.');
  const scope = value.scope;
  if (!isRecord(scope)) throw new Error('Store Edge sync receipt scope is invalid.');
  return {
    id: boundedText(value.id, 'receipt.id', 1, 160),
    eventId: boundedText(value.eventId, 'receipt.eventId', 3, 160),
    eventType: boundedText(value.eventType, 'receipt.eventType', 3, 80),
    aggregateId: boundedText(value.aggregateId, 'receipt.aggregateId', 1, 160),
    transactionKey: boundedText(value.transactionKey, 'receipt.transactionKey', 3, 160),
    sequence: boundedInteger(value.sequence, 'receipt.sequence'),
    payloadChecksum: boundedText(value.payloadChecksum, 'receipt.payloadChecksum', 64, 64).toLowerCase(),
    outcome,
    actorId: boundedText(value.actorId, 'receipt.actorId', 1, 160),
    receivedAt: boundedTimestamp(value.receivedAt, 'receipt.receivedAt'),
    scope: validateScope(scope),
    ...(value.detail === undefined ? {} : { detail: boundedText(value.detail, 'receipt.detail', 1, 500) }),
  };
}

function validateScope(value: Record<string, unknown>): RetailHubStoreEdgeSyncScope {
  return {
    tenantId: boundedText(value.tenantId, 'scope.tenantId', 1, 160),
    companyId: boundedText(value.companyId, 'scope.companyId', 1, 160),
    branchId: boundedText(value.branchId, 'scope.branchId', 1, 160),
  };
}

function rejectSecretKeys(value: unknown, path = 'payload'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSecretKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) throw new Error(`${path}.${key} is not allowed in Store Edge sync payloads.`);
    rejectSecretKeys(child, `${path}.${key}`);
  }
}

function boundedText(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
}

function boundedInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}

function boundedTimestamp(value: unknown, label: string): string {
  const normalized = boundedText(value, label, 10, 40);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${label} must be a valid ISO timestamp.`);
  return normalized;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function defaultRequest(url: string, body: Uint8Array, signal: AbortSignal): Promise<RetailHubStoreEdgeSyncHttpResponse> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: Buffer.from(body), redirect: 'error', signal });
  return { status: response.status, contentType: response.headers.get('content-type') ?? undefined, body: new Uint8Array(await response.arrayBuffer()) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
