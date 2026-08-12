import type {
  FetchRetailHubShadowImportPullReceiptsInput,
  FetchRetailHubShadowImportSourceStatusInput,
  RetailHubShadowImportPullReceipt,
  RetailHubShadowImportPullReceiptsReport,
  RetailHubShadowImportSourceStatusReport,
} from '../shared/retail-hub-shadow-import-contracts';

const BATCH_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/u;
const SHA256 = /^[a-f0-9]{64}$/iu;
const SOURCE_STATUSES = ['unconfigured', 'configured', 'reachable', 'unreachable'] as const;

export interface RetailHubShadowImportStatusHttpResponse {
  status: number;
  contentType?: string;
  body: Uint8Array;
}

export interface RetailHubShadowImportStatusClientOptions {
  request?: (url: string, signal: AbortSignal) => Promise<RetailHubShadowImportStatusHttpResponse>;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export async function fetchRetailHubShadowImportSourceStatus(
  input: FetchRetailHubShadowImportSourceStatusInput,
  options: RetailHubShadowImportStatusClientOptions = {},
): Promise<RetailHubShadowImportSourceStatusReport> {
  return fetchJson(buildSourceStatusUrl(input), validateSourceStatus, 'source status', options);
}

export async function fetchRetailHubShadowImportPullReceipts(
  input: FetchRetailHubShadowImportPullReceiptsInput,
  options: RetailHubShadowImportStatusClientOptions = {},
): Promise<RetailHubShadowImportPullReceiptsReport> {
  return fetchJson(buildPullReceiptsUrl(input), validatePullReceipts, 'pull receipts', options);
}

export function buildSourceStatusUrl(input: FetchRetailHubShadowImportSourceStatusInput): string {
  const base = parseBaseUrl(input.baseUrl);
  const pathname = base.pathname.replace(/\/+$/u, '');
  return new URL(`${pathname}/v1/shadow-imports/source-status`, base.origin).toString();
}

export function buildPullReceiptsUrl(input: FetchRetailHubShadowImportPullReceiptsInput): string {
  const base = parseBaseUrl(input.baseUrl);
  if (input.batchId !== undefined && !BATCH_ID.test(input.batchId)) throw new Error('Retail Hub shadow-import batch ID is invalid.');
  const pathname = base.pathname.replace(/\/+$/u, '');
  const url = new URL(`${pathname}/v1/shadow-imports/pull-receipts`, base.origin);
  if (input.batchId !== undefined) url.searchParams.set('batchId', input.batchId);
  return url.toString();
}

async function fetchJson<T>(
  url: string,
  validate: (value: unknown) => T,
  label: string,
  options: RetailHubShadowImportStatusClientOptions,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 512 * 1024;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) throw new Error(`Retail Hub ${label} timeout must be between 1000 and 60000 milliseconds.`);
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 5 * 1024 * 1024) throw new Error(`Retail Hub ${label} response limit is invalid.`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.request ?? defaultRequest)(url, controller.signal);
    if (!Number.isInteger(response.status) || response.status !== 200) throw new Error(`Retail Hub ${label} returned HTTP ${response.status}; no evidence was accepted.`);
    if (!response.contentType || !/^application\/json(?:\s*;|$)/iu.test(response.contentType)) throw new Error(`Retail Hub ${label} response must be application/json.`);
    if (!response.body || typeof response.body.byteLength !== 'number' || response.body.byteLength > maxResponseBytes) throw new Error(`Retail Hub ${label} response exceeds the safety limit.`);
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder().decode(response.body)); } catch { throw new Error(`Retail Hub ${label} response is not valid JSON.`); }
    return validate(parsed);
  } finally {
    clearTimeout(timer);
  }
}

function parseBaseUrl(value: string): URL {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Retail Hub base URL is required.');
  let base: URL;
  try { base = new URL(value.trim()); } catch { throw new Error('Retail Hub base URL is invalid.'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Retail Hub base URL must be a credential-free HTTPS URL without query or fragment data.');
  return base;
}

async function defaultRequest(url: string, signal: AbortSignal): Promise<RetailHubShadowImportStatusHttpResponse> {
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal });
  return { status: response.status, contentType: response.headers.get('content-type') ?? undefined, body: new Uint8Array(await response.arrayBuffer()) };
}

function validateSourceStatus(value: unknown): RetailHubShadowImportSourceStatusReport {
  const candidate = isRecord(value) && isRecord(value.sourceStatus) ? value : undefined;
  if (!candidate || candidate.writeBackAllowed !== false || !isRecord(candidate.sourceStatus)) throw new Error('Retail Hub source status response is not a read-only report.');
  const sourceStatus = candidate.sourceStatus;
  if (typeof sourceStatus.status !== 'string' || !SOURCE_STATUSES.includes(sourceStatus.status as typeof SOURCE_STATUSES[number])) throw new Error('Retail Hub source status is invalid.');
  const credentialRevision = sourceStatus.credentialRevision;
  if (credentialRevision !== undefined && (typeof credentialRevision !== 'number' || !Number.isInteger(credentialRevision) || credentialRevision < 1)) throw new Error('Retail Hub source credential revision is invalid.');
  if (sourceStatus.checkedAt !== undefined && typeof sourceStatus.checkedAt !== 'string') throw new Error('Retail Hub source status timestamp is invalid.');
  if (sourceStatus.message !== undefined && typeof sourceStatus.message !== 'string') throw new Error('Retail Hub source status message is invalid.');
  return {
    writeBackAllowed: false,
    sourceStatus: {
      status: sourceStatus.status as RetailHubShadowImportSourceStatusReport['sourceStatus']['status'],
      ...(typeof credentialRevision === 'number' ? { credentialRevision } : {}),
      ...(sourceStatus.checkedAt === undefined ? {} : { checkedAt: sourceStatus.checkedAt.slice(0, 80) }),
      ...(sourceStatus.message === undefined ? {} : { message: sourceStatus.message.slice(0, 500) }),
    },
  };
}

function validatePullReceipts(value: unknown): RetailHubShadowImportPullReceiptsReport {
  if (!isRecord(value) || value.writeBackAllowed !== false || !Array.isArray(value.receipts)) throw new Error('Retail Hub pull-receipts response is not a read-only report.');
  return { writeBackAllowed: false, receipts: value.receipts.map(validateReceipt) };
}

function validateReceipt(value: unknown): RetailHubShadowImportPullReceipt {
  if (!isRecord(value) || value.source !== 'bakaloo' || value.writeBackAllowed !== false || value.version !== 1 || !nonBlank(value.id) || !nonBlank(value.batchId) || !nonBlank(value.observedAt) || !nonBlank(value.registeredAt) || !SHA256.test(String(value.planChecksum))) throw new Error('Retail Hub pull receipt is invalid or attempts to enable write-back.');
  for (const field of ['pagesFetched', 'recordsFetched']) if (!Number.isInteger(value[field]) || Number(value[field]) < 0) throw new Error(`Retail Hub pull receipt ${field} is invalid.`);
  const credentialRevision = value.credentialRevision;
  if (credentialRevision !== undefined && (typeof credentialRevision !== 'number' || !Number.isInteger(credentialRevision) || credentialRevision < 1)) throw new Error('Retail Hub pull receipt credential revision is invalid.');
  return {
    id: String(value.id), source: 'bakaloo', batchId: String(value.batchId), observedAt: String(value.observedAt), registeredAt: String(value.registeredAt),
    ...(typeof credentialRevision === 'number' ? { credentialRevision } : {}),
    pagesFetched: value.pagesFetched as number, recordsFetched: value.recordsFetched as number, planChecksum: String(value.planChecksum), writeBackAllowed: false, version: 1,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function nonBlank(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
