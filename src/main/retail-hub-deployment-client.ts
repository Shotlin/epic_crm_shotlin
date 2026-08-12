import type { FetchRetailHubDeploymentPreflightInput, RetailHubDeploymentPreflight } from '../shared/retail-hub-deployment-contracts';
export type { FetchRetailHubDeploymentPreflightInput, RetailHubDeploymentPreflight } from '../shared/retail-hub-deployment-contracts';

export interface RetailHubDeploymentHttpResponse {
  status: number;
  contentType?: string;
  body: Uint8Array;
}

export interface RetailHubDeploymentClientOptions {
  request?: (url: string, signal: AbortSignal) => Promise<RetailHubDeploymentHttpResponse>;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Main-process-only read transport for the Hub deployment gate. It accepts no
 * credentials or renderer headers and returns only the value-free preflight
 * projection produced by the server.
 */
export async function fetchRetailHubDeploymentPreflight(
  input: FetchRetailHubDeploymentPreflightInput,
  options: RetailHubDeploymentClientOptions = {},
): Promise<RetailHubDeploymentPreflight> {
  const url = buildDeploymentPreflightUrl(input);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 256 * 1024;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) throw new Error('Retail Hub deployment timeout must be between 1000 and 60000 milliseconds.');
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 5 * 1024 * 1024) throw new Error('Retail Hub deployment response limit is invalid.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.request ?? defaultRequest)(url, controller.signal);
    if (!Number.isInteger(response.status) || response.status !== 200) throw new Error(`Retail Hub deployment request returned HTTP ${response.status}; no readiness evidence was accepted.`);
    if (!response.contentType || !/^application\/json(?:\s*;|$)/iu.test(response.contentType)) throw new Error('Retail Hub deployment response must be application/json.');
    if (!response.body || typeof response.body.byteLength !== 'number' || response.body.byteLength > maxResponseBytes) throw new Error('Retail Hub deployment response exceeds the safety limit.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(response.body));
    } catch {
      throw new Error('Retail Hub deployment response is not valid JSON.');
    }
    return validateDeploymentPreflight(parsed);
  } finally {
    clearTimeout(timer);
  }
}

export function buildDeploymentPreflightUrl(input: FetchRetailHubDeploymentPreflightInput): string {
  if (!input || typeof input.baseUrl !== 'string' || input.baseUrl.trim() === '') throw new Error('Retail Hub base URL is required.');
  let base: URL;
  try {
    base = new URL(input.baseUrl.trim());
  } catch {
    throw new Error('Retail Hub base URL is invalid.');
  }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Retail Hub base URL must be a credential-free HTTPS URL without query or fragment data.');
  const pathname = base.pathname.replace(/\/+$/u, '');
  return new URL(`${pathname}/v1/deployment/preflight`, base.origin).toString();
}

async function defaultRequest(url: string, signal: AbortSignal): Promise<RetailHubDeploymentHttpResponse> {
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal });
  return { status: response.status, contentType: response.headers.get('content-type') ?? undefined, body: new Uint8Array(await response.arrayBuffer()) };
}

function validateDeploymentPreflight(value: unknown): RetailHubDeploymentPreflight {
  if (!isRecord(value)) throw new Error('Retail Hub deployment response must be a JSON object.');
  if (value.schema !== 'epic-bos-retail-hub-deployment-preflight') throw new Error('Retail Hub deployment response schema is invalid.');
  if (value.status !== 'ready' && value.status !== 'hold') throw new Error('Retail Hub deployment status is invalid.');
  if (!['development', 'staging', 'production'].includes(String(value.environment))) throw new Error('Retail Hub deployment environment is invalid.');
  if (value.writeBackAllowed !== false) throw new Error('Retail Hub deployment response cannot authorize write-back.');
  if (typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))) throw new Error('Retail Hub deployment timestamp is invalid.');
  if (!stringArray(value.invalidKeys) || !stringArray(value.blockers)) throw new Error('Retail Hub deployment blocker lists are invalid.');
  if (!Array.isArray(value.checks) || !value.checks.every(isCheck)) throw new Error('Retail Hub deployment checks are invalid.');
  return value as unknown as RetailHubDeploymentPreflight;
}

function isCheck(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && value.id.trim().length > 0 && (value.status === 'pass' || value.status === 'hold') && typeof value.summary === 'string' && value.summary.trim().length > 0;
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string'); }
