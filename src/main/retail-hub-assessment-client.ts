import type { FetchRetailHubCutoverAssessmentInput, RetailHubCutoverAssessment, RetailHubCutoverCapability } from '../shared/retail-cutover-contracts';
export type { FetchRetailHubCutoverAssessmentInput } from '../shared/retail-cutover-contracts';

const SHA256 = /^[a-f0-9]{64}$/iu;
const CAPABILITIES: readonly RetailHubCutoverCapability[] = ['catalog', 'inventory', 'customers', 'orders', 'delivery', 'settlements', 'campaigns', 'storefront'];

export interface RetailHubAssessmentHttpResponse {
  status: number;
  contentType?: string;
  body: Uint8Array;
}

export interface RetailHubAssessmentClientOptions {
  request?: (url: string, signal: AbortSignal) => Promise<RetailHubAssessmentHttpResponse>;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Main-process-only GET transport. It accepts no headers or credentials from
 * the renderer and returns only a validated read-only assessment. The Hub's
 * own authenticated middleware remains the authority for access.
 */
export async function fetchRetailHubCutoverAssessment(
  input: FetchRetailHubCutoverAssessmentInput,
  options: RetailHubAssessmentClientOptions = {},
): Promise<RetailHubCutoverAssessment> {
  const url = buildAssessmentUrl(input);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 512 * 1024;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) throw new Error('Retail Hub assessment timeout must be between 1000 and 60000 milliseconds.');
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 5 * 1024 * 1024) throw new Error('Retail Hub assessment response limit is invalid.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.request ?? defaultRequest)(url, controller.signal);
    if (!Number.isInteger(response.status) || response.status !== 200) throw new Error(`Retail Hub assessment request returned HTTP ${response.status}; no evidence was accepted.`);
    if (!response.contentType || !/^application\/json(?:\s*;|$)/iu.test(response.contentType)) throw new Error('Retail Hub assessment response must be application/json.');
    if (!response.body || typeof response.body.byteLength !== 'number' || response.body.byteLength > maxResponseBytes) throw new Error('Retail Hub assessment response exceeds the safety limit.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(response.body));
    } catch {
      throw new Error('Retail Hub assessment response is not valid JSON.');
    }
    return validateAssessment(parsed);
  } finally {
    clearTimeout(timer);
  }
}

export function buildAssessmentUrl(input: FetchRetailHubCutoverAssessmentInput): string {
  if (!input || typeof input.baseUrl !== 'string' || input.baseUrl.trim() === '') throw new Error('Retail Hub base URL is required.');
  if (!input.batchId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/u.test(input.batchId)) throw new Error('Retail Hub assessment batch ID is invalid.');
  if (!CAPABILITIES.includes(input.capability)) throw new Error('Retail Hub assessment capability is invalid.');
  let base: URL;
  try {
    base = new URL(input.baseUrl.trim());
  } catch {
    throw new Error('Retail Hub base URL is invalid.');
  }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Retail Hub base URL must be a credential-free HTTPS URL without query or fragment data.');
  const pathname = base.pathname.replace(/\/+$/u, '');
  const url = new URL(`${pathname}/v1/shadow-imports/cutover`, base.origin);
  url.searchParams.set('batchId', input.batchId);
  url.searchParams.set('capability', input.capability);
  return url.toString();
}

async function defaultRequest(url: string, signal: AbortSignal): Promise<RetailHubAssessmentHttpResponse> {
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal });
  return { status: response.status, contentType: response.headers.get('content-type') ?? undefined, body: new Uint8Array(await response.arrayBuffer()) };
}

function validateAssessment(value: unknown): RetailHubCutoverAssessment {
  const candidate = isRecord(value) && isRecord(value.assessment) ? value.assessment : value;
  if (!isRecord(candidate)) throw new Error('Retail Hub assessment response must be a JSON object.');
  const scope = candidate.scope;
  if (!isRecord(scope) || !nonBlank(scope.tenantId) || !nonBlank(scope.companyId) || !nonBlank(scope.branchId)) throw new Error('Retail Hub assessment scope is invalid.');
  if (candidate.source !== 'bakaloo' || candidate.writeBackAllowed !== false) throw new Error('Retail Hub returned an assessment that is not read-only Bakaloo evidence.');
  if (typeof candidate.capability !== 'string' || !CAPABILITIES.includes(candidate.capability as RetailHubCutoverCapability)) throw new Error('Retail Hub assessment capability is invalid.');
  if (candidate.status !== 'ready-for-parallel-run' && candidate.status !== 'blocked') throw new Error('Retail Hub assessment status is invalid.');
  if (!stringArray(candidate.blockers) || !stringArray(candidate.requiredEntities)) throw new Error('Retail Hub assessment evidence lists are invalid.');
  if (!nonBlank(candidate.planId)) throw new Error('Retail Hub assessment plan ID is missing.');
  for (const field of ['planChecksum', 'remoteChecksum', 'localChecksum', 'reconciliationChecksum']) if (typeof candidate[field] !== 'string' || !SHA256.test(candidate[field])) throw new Error(`Retail Hub assessment ${field} must be a SHA-256 checksum.`);
  for (const field of ['remoteRecordCount', 'localRecordCount', 'differenceCount']) if (!nonNegativeInteger(candidate[field])) throw new Error(`Retail Hub assessment ${field} must be a non-negative integer.`);
  if (candidate.approvalDecisionId !== undefined && !nonBlank(candidate.approvalDecisionId)) throw new Error('Retail Hub assessment approval reference is invalid.');
  if (candidate.credentialRevision !== undefined && (typeof candidate.credentialRevision !== 'number' || !Number.isInteger(candidate.credentialRevision) || candidate.credentialRevision < 1)) throw new Error('Retail Hub assessment credential revision is invalid.');
  if (candidate.rollbackReference !== undefined && !nonBlank(candidate.rollbackReference)) throw new Error('Retail Hub assessment rollback reference is invalid.');
  return candidate as unknown as RetailHubCutoverAssessment;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function nonBlank(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function stringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string'); }
function nonNegativeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
