import type {
  FetchRetailHubShadowImportPreflightInput,
  RetailHubShadowImportPreflight,
} from '../shared/retail-hub-shadow-import-contracts';
export type { FetchRetailHubShadowImportPreflightInput } from '../shared/retail-hub-shadow-import-contracts';

const BATCH_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/u;

export interface RetailHubShadowImportHttpResponse {
  status: number;
  contentType?: string;
  body: Uint8Array;
}

export interface RetailHubShadowImportClientOptions {
  request?: (url: string, signal: AbortSignal) => Promise<RetailHubShadowImportHttpResponse>;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Main-process-only GET transport for the Hub shadow-import gate. The
 * renderer supplies only a credential-free base URL and batch selector; the
 * Hub's authenticated server boundary remains authoritative.
 */
export async function fetchRetailHubShadowImportPreflight(
  input: FetchRetailHubShadowImportPreflightInput,
  options: RetailHubShadowImportClientOptions = {},
): Promise<RetailHubShadowImportPreflight> {
  const url = buildShadowImportPreflightUrl(input);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 512 * 1024;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) throw new Error('Retail Hub shadow-import timeout must be between 1000 and 60000 milliseconds.');
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 5 * 1024 * 1024) throw new Error('Retail Hub shadow-import response limit is invalid.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.request ?? defaultRequest)(url, controller.signal);
    if (!Number.isInteger(response.status) || response.status !== 200) throw new Error(`Retail Hub shadow-import preflight returned HTTP ${response.status}; no evidence was accepted.`);
    if (!response.contentType || !/^application\/json(?:\s*;|$)/iu.test(response.contentType)) throw new Error('Retail Hub shadow-import preflight response must be application/json.');
    if (!response.body || typeof response.body.byteLength !== 'number' || response.body.byteLength > maxResponseBytes) throw new Error('Retail Hub shadow-import preflight response exceeds the safety limit.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(response.body));
    } catch {
      throw new Error('Retail Hub shadow-import preflight response is not valid JSON.');
    }
    return validatePreflight(parsed);
  } finally {
    clearTimeout(timer);
  }
}

export function buildShadowImportPreflightUrl(input: FetchRetailHubShadowImportPreflightInput): string {
  if (!input || typeof input.baseUrl !== 'string' || input.baseUrl.trim() === '') throw new Error('Retail Hub base URL is required.');
  if (typeof input.batchId !== 'string' || !BATCH_ID.test(input.batchId)) throw new Error('Retail Hub shadow-import batch ID is invalid.');
  let base: URL;
  try {
    base = new URL(input.baseUrl.trim());
  } catch {
    throw new Error('Retail Hub base URL is invalid.');
  }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Retail Hub base URL must be a credential-free HTTPS URL without query or fragment data.');
  const pathname = base.pathname.replace(/\/+$/u, '');
  const url = new URL(`${pathname}/v1/shadow-imports/preflight`, base.origin);
  url.searchParams.set('batchId', input.batchId);
  return url.toString();
}

async function defaultRequest(url: string, signal: AbortSignal): Promise<RetailHubShadowImportHttpResponse> {
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal });
  return { status: response.status, contentType: response.headers.get('content-type') ?? undefined, body: new Uint8Array(await response.arrayBuffer()) };
}

function validatePreflight(value: unknown): RetailHubShadowImportPreflight {
  const candidate = isRecord(value) && isRecord(value.preflight) ? value.preflight : value;
  if (!isRecord(candidate)) throw new Error('Retail Hub shadow-import preflight response must be a JSON object.');
  if (candidate.status !== 'ready-for-review' && candidate.status !== 'hold') throw new Error('Retail Hub shadow-import preflight status is invalid.');
  if (candidate.writeBackAllowed !== false) throw new Error('Retail Hub shadow-import preflight cannot enable write-back.');
  if (!Array.isArray(candidate.checks) || !candidate.checks.every(isCheck) || !stringArray(candidate.blockers)) throw new Error('Retail Hub shadow-import preflight checks are invalid.');
  return candidate as unknown as RetailHubShadowImportPreflight;
}

function isCheck(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id.trim().length > 0 && (value.status === 'pass' || value.status === 'hold') && typeof value.summary === 'string' && value.summary.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string'); }
