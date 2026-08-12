import { createHash } from 'node:crypto';
import type {
  FetchRetailHubCoverageMapInput,
  RetailHubCoverageMap,
  RetailHubCoverageMapBoundary,
  RetailHubCoverageMapCustomer,
  RetailHubCoverageMapShop,
} from '../shared/retail-hub-coverage-map-contracts';
import { serializeRetailHubCoverageMapProjection } from '../shared/retail-hub-coverage-map-contracts';

export interface RetailHubCoverageMapHttpResponse {
  status: number;
  contentType?: string;
  body: Uint8Array;
}

export interface RetailHubCoverageMapClientOptions {
  request?: (url: string, signal: AbortSignal) => Promise<RetailHubCoverageMapHttpResponse>;
  timeoutMs?: number;
  maxResponseBytes?: number;
  /** Maximum age accepted for a Hub observation. Defaults to 30 minutes. */
  maxAgeMs?: number;
  /** Clock skew tolerated when a Hub observation is slightly in the future. */
  maxFutureSkewMs?: number;
  now?: () => string;
}

const DEFAULT_MAX_AGE_MS = 30 * 60 * 1_000;
const DEFAULT_MAX_FUTURE_SKEW_MS = 2 * 60 * 1_000;

/**
 * Main-process-only read transport for Bakaloo's existing coverage map.
 * Credentials and headers are deliberately not renderer-controlled; the Hub
 * remains responsible for authenticating the request and scoping the shop.
 */
export async function fetchRetailHubCoverageMap(
  input: FetchRetailHubCoverageMapInput,
  options: RetailHubCoverageMapClientOptions = {},
): Promise<RetailHubCoverageMap> {
  const url = buildRetailHubCoverageMapUrl(input);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 5 * 1024 * 1024;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const maxFutureSkewMs = options.maxFutureSkewMs ?? DEFAULT_MAX_FUTURE_SKEW_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) throw new Error('Retail Hub coverage-map timeout must be between 1000 and 60000 milliseconds.');
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 10 * 1024 * 1024) throw new Error('Retail Hub coverage-map response limit is invalid.');
  if (!Number.isInteger(maxAgeMs) || maxAgeMs < 60_000 || maxAgeMs > 24 * 60 * 60 * 1_000) throw new Error('Retail Hub coverage-map freshness window must be between 1 minute and 24 hours.');
  if (!Number.isInteger(maxFutureSkewMs) || maxFutureSkewMs < 0 || maxFutureSkewMs > 60 * 60 * 1_000) throw new Error('Retail Hub coverage-map future clock-skew window is invalid.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.request ?? defaultRequest)(url, controller.signal);
    if (!Number.isInteger(response.status) || response.status !== 200) throw new Error(`Retail Hub coverage map returned HTTP ${response.status}; no map evidence was accepted.`);
    if (!response.contentType || !/^application\/json(?:\s*;|$)/iu.test(response.contentType)) throw new Error('Retail Hub coverage-map response must be application/json.');
    if (!response.body || typeof response.body.byteLength !== 'number' || response.body.byteLength > maxResponseBytes) throw new Error('Retail Hub coverage-map response exceeds the safety limit.');
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder().decode(response.body)); } catch { throw new Error('Retail Hub coverage-map response is not valid JSON.'); }
    return validateCoverageMap(parsed, input.scope, options.now?.() ?? new Date().toISOString(), maxAgeMs, maxFutureSkewMs);
  } finally {
    clearTimeout(timer);
  }
}

export function buildRetailHubCoverageMapUrl(input: FetchRetailHubCoverageMapInput): string {
  if (!input || typeof input.baseUrl !== 'string' || input.baseUrl.trim() === '') throw new Error('Retail Hub base URL is required.');
  if (typeof input.shopId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.shopId)) throw new Error('Retail Hub coverage-map shop ID must be a UUID.');
  validateScope(input.scope);
  let base: URL;
  try { base = new URL(input.baseUrl.trim()); } catch { throw new Error('Retail Hub base URL is invalid.'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Retail Hub base URL must be a credential-free HTTPS URL without query or fragment data.');
  const pathname = base.pathname.replace(/\/+$/u, '');
  return new URL(`${pathname}/v1/admin/coverage-map/${encodeURIComponent(input.shopId)}`, base.origin).toString();
}

async function defaultRequest(url: string, signal: AbortSignal): Promise<RetailHubCoverageMapHttpResponse> {
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal });
  return { status: response.status, contentType: response.headers.get('content-type') ?? undefined, body: new Uint8Array(await response.arrayBuffer()) };
}

function validateCoverageMap(value: unknown, scope: FetchRetailHubCoverageMapInput['scope'], receivedAt: string, maxAgeMs: number, maxFutureSkewMs: number): RetailHubCoverageMap {
  const envelope = isRecord(value) && isRecord(value.data) ? value : undefined;
  if (envelope && envelope.success !== true) throw new Error('Retail Hub coverage-map response did not report success.');
  const candidate = envelope?.data ?? value;
  if (!isRecord(candidate) || !isRecord(candidate.shop)) throw new Error('Retail Hub coverage-map data is invalid.');
  if (!isIsoTimestamp(receivedAt)) throw new Error('Retail Hub coverage-map receipt time is invalid.');
  const observedAt = validateFreshness(candidate.observedAt, receivedAt, maxAgeMs, maxFutureSkewMs);
  const shop = validateShop(candidate.shop);
  const customers = validateCustomers(candidate.customers);
  const boundaries = validateBoundaries(candidate.boundaries);
  const serviceablePincodes = validatePincodeList(candidate.serviceablePincodes, 'serviceable');
  const uncoveredPincodes = validatePincodeList(candidate.uncoveredPincodes, 'uncovered');
  if (!nonNegativeInteger(candidate.totalCustomers) || candidate.totalCustomers !== customers.length) throw new Error('Retail Hub coverage-map customer total is invalid.');
  const projection = {
    schema: 'epic-bos-retail-hub-coverage-map.v1', source: 'bakaloo', writeBackAllowed: false,
    observedAt: new Date(observedAt).toISOString(), scope: { companyId: scope.companyId.trim(), branchId: scope.branchId.trim() },
    shop, serviceablePincodes, uncoveredPincodes, customers, boundaries, totalCustomers: candidate.totalCustomers,
  } as const;
  const projectionChecksum = candidate.projectionChecksum;
  if (typeof projectionChecksum !== 'string' || !/^[a-f0-9]{64}$/iu.test(projectionChecksum)) throw new Error('Retail Hub coverage-map projection checksum is invalid.');
  const expectedChecksum = createHash('sha256').update(serializeRetailHubCoverageMapProjection(projection), 'utf8').digest('hex');
  if (projectionChecksum.toLowerCase() !== expectedChecksum) throw new Error('Retail Hub coverage-map projection checksum does not match the validated payload.');
  return { ...projection, projectionChecksum: projectionChecksum.toLowerCase() };
}

function validateShop(value: Record<string, unknown>): RetailHubCoverageMapShop {
  const lat = latitude(value.lat, 'shop latitude');
  const lng = longitude(value.lng, 'shop longitude');
  rejectPlaceholder(lat, lng, 'shop coordinates');
  return {
    id: nonBlank(value.id, 'shop ID'), name: boundedString(value.name, 'shop name', 160), lat, lng,
    city: boundedString(value.city, 'shop city', 120), state: boundedString(value.state, 'shop state', 120), pincode: boundedString(value.pincode, 'shop pincode', 20), isActive: value.isActive === true,
  };
}

function validateCustomers(value: unknown): RetailHubCoverageMapCustomer[] {
  if (!Array.isArray(value) || value.length > 10_000) throw new Error('Retail Hub coverage-map customers are invalid.');
  return value.map((item) => {
    if (!isRecord(item)) throw new Error('Retail Hub coverage-map customer is invalid.');
    const lat = latitude(item.lat, 'customer latitude');
    const lng = longitude(item.lng, 'customer longitude');
    rejectPlaceholder(lat, lng, 'customer coordinates');
    return { userId: nonBlank(item.userId, 'customer ID'), name: item.name === null ? null : boundedString(item.name, 'customer name', 160), initial: boundedString(item.initial, 'customer initial', 4), lat, lng, pincode: item.pincode === null ? null : boundedString(item.pincode, 'customer pincode', 20), hasActiveOrder: item.hasActiveOrder === true };
  });
}

function validateBoundaries(value: unknown): RetailHubCoverageMapBoundary[] {
  if (!Array.isArray(value) || value.length > 2_000) throw new Error('Retail Hub coverage-map boundaries are invalid.');
  return value.map((item) => {
    if (!isRecord(item) || !nonNegativeInteger(item.count) || !Array.isArray(item.polygon) || item.polygon.length < 3 || item.polygon.length > 720) throw new Error('Retail Hub coverage-map boundary is invalid.');
    return { pincode: boundedString(item.pincode, 'boundary pincode', 20), count: item.count, polygon: item.polygon.map((point) => { if (!Array.isArray(point) || point.length !== 2) throw new Error('Retail Hub coverage-map boundary point is invalid.'); const lat = latitude(point[0], 'boundary latitude'); const lng = longitude(point[1], 'boundary longitude'); rejectPlaceholder(lat, lng, 'boundary coordinates'); return [lat, lng] as [number, number]; }) };
  });
}

function validatePincodeList(value: unknown, label: string): string[] { if (!Array.isArray(value) || value.length > 20_000 || !value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 20)) throw new Error(`Retail Hub coverage-map ${label} pincodes are invalid.`); return [...new Set(value.map((item) => item.trim()))]; }
function validateScope(value: unknown): asserts value is { companyId: string; branchId: string } { if (!isRecord(value) || !nonBlank(value.companyId, 'company scope') || !nonBlank(value.branchId, 'branch scope')) throw new Error('Retail Hub coverage-map scope is invalid.'); }
function latitude(value: unknown, label: string): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < -90 || value > 90) throw new Error(`${label} is invalid.`); return value; }
function longitude(value: unknown, label: string): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < -180 || value > 180) throw new Error(`${label} is invalid.`); return value; }
function rejectPlaceholder(latitudeValue: number, longitudeValue: number, label: string): void { if (latitudeValue === 0 && longitudeValue === 0) throw new Error(`${label} cannot use the 0,0 placeholder.`); }
function boundedString(value: unknown, label: string, maximum: number): string { const result = nonBlank(value, label); if (result.length > maximum) throw new Error(`${label} is too long.`); return result; }
function nonBlank(value: unknown, label: string): string { if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} is required.`); return value.trim(); }
function nonNegativeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
function isIsoTimestamp(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function validateFreshness(value: unknown, receivedAt: string, maxAgeMs: number, maxFutureSkewMs: number): string {
  if (!isIsoTimestamp(value)) throw new Error('Retail Hub coverage-map observation time is invalid.');
  const observedMs = Date.parse(value);
  const receivedMs = Date.parse(receivedAt);
  const ageMs = receivedMs - observedMs;
  if (ageMs < -maxFutureSkewMs) throw new Error('Retail Hub coverage-map observation is from the future beyond the allowed clock-skew window.');
  if (ageMs > maxAgeMs) throw new Error('Retail Hub coverage-map observation is stale; fetch a fresh map snapshot.');
  return new Date(observedMs).toISOString();
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
