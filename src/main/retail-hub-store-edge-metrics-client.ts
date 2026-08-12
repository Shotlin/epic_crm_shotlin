import type {
  FetchRetailHubStoreEdgeWorkerMetricsInput,
  RetailHubStoreEdgeWorkerMetrics,
  RetailHubStoreEdgeWorkerMetricsReport,
} from '../shared/retail-hub-store-edge-metrics-contracts';

const MAX_RESPONSE_BYTES = 64 * 1024;

export interface RetailHubStoreEdgeWorkerMetricsHttpResponse {
  status: number;
  contentType?: string;
  body: Uint8Array;
}

export interface RetailHubStoreEdgeWorkerMetricsClientOptions {
  /** Main-process deployment adapter; it may attach mTLS or vaulted auth. */
  request?: (url: string, signal: AbortSignal) => Promise<RetailHubStoreEdgeWorkerMetricsHttpResponse>;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Fetches only server-owned, scope-bound worker counters. The renderer never
 * supplies scope or credentials and a malformed/unauthenticated response is
 * rejected instead of being displayed as health evidence.
 */
export async function fetchRetailHubStoreEdgeWorkerMetrics(
  input: FetchRetailHubStoreEdgeWorkerMetricsInput,
  options: RetailHubStoreEdgeWorkerMetricsClientOptions = {},
): Promise<RetailHubStoreEdgeWorkerMetricsReport> {
  const url = buildRetailHubStoreEdgeWorkerMetricsUrl(input.baseUrl);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) throw new Error('Retail Hub worker metrics timeout must be between 1000 and 60000 milliseconds.');
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 5 * 1024 * 1024) throw new Error('Retail Hub worker metrics response limit is invalid.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.request ?? defaultRequest)(url, controller.signal);
    if (response.status !== 200) throw new Error(`Retail Hub worker metrics returned HTTP ${response.status}; no health evidence was accepted.`);
    if (!response.contentType || !/^application\/json(?:\s*;|$)/iu.test(response.contentType)) throw new Error('Retail Hub worker metrics response must be application/json.');
    if (!response.body || typeof response.body.byteLength !== 'number' || response.body.byteLength > maxResponseBytes) throw new Error('Retail Hub worker metrics response exceeds the safety limit.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(response.body));
    } catch {
      throw new Error('Retail Hub worker metrics response is not valid JSON.');
    }
    return validateReport(parsed);
  } finally {
    clearTimeout(timer);
  }
}

export function buildRetailHubStoreEdgeWorkerMetricsUrl(baseUrl: string): string {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) throw new Error('Retail Hub base URL is required.');
  let base: URL;
  try {
    base = new URL(baseUrl.trim());
  } catch {
    throw new Error('Retail Hub base URL is invalid.');
  }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Retail Hub base URL must be a credential-free HTTPS URL without query or fragment data.');
  const pathname = base.pathname.replace(/\/+$/u, '');
  return new URL(`${pathname}/v1/store-edge/worker/metrics`, base.origin).toString();
}

function validateReport(value: unknown): RetailHubStoreEdgeWorkerMetricsReport {
  if (!isRecord(value) || value.writeBackAllowed !== false || !isRecord(value.metrics) || typeof value.observedAt !== 'string') throw new Error('Retail Hub worker metrics response is not a read-only report.');
  const observedAt = boundedTimestamp(value.observedAt, 'observedAt');
  const metrics = value.metrics;
  const result: RetailHubStoreEdgeWorkerMetrics = {
    runs: boundedCounter(metrics.runs, 'metrics.runs'),
    claimed: boundedCounter(metrics.claimed, 'metrics.claimed'),
    completed: boundedCounter(metrics.completed, 'metrics.completed'),
    retryable: boundedCounter(metrics.retryable, 'metrics.retryable'),
    deadLetter: boundedCounter(metrics.deadLetter, 'metrics.deadLetter'),
    ...(metrics.lastRunAt === undefined ? {} : { lastRunAt: boundedTimestamp(metrics.lastRunAt, 'metrics.lastRunAt') }),
  };
  if (result.completed > result.claimed || result.retryable + result.deadLetter > result.claimed) throw new Error('Retail Hub worker metrics counters are inconsistent.');
  return { metrics: result, observedAt, writeBackAllowed: false };
}

function boundedCounter(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer.`);
  return value;
}

function boundedTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length < 10 || value.trim().length > 40 || !Number.isFinite(Date.parse(value))) throw new Error(`${label} must be a valid timestamp.`);
  return value.trim();
}

async function defaultRequest(url: string, signal: AbortSignal): Promise<RetailHubStoreEdgeWorkerMetricsHttpResponse> {
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal });
  return { status: response.status, contentType: response.headers.get('content-type') ?? undefined, body: new Uint8Array(await response.arrayBuffer()) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
