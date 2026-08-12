import { createHash } from 'node:crypto';
import type { ShadowImportScope } from './shadow-import-postgres-repository';
import type { BakalooShadowCredentialVault } from './bakaloo-shadow-credential-vault';
import { serializeRetailHubCoverageMapProjection } from '../../src/shared/retail-hub-coverage-map-contracts';

const SHOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CREDENTIAL_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/u;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export interface RetailHubCoverageMapShop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  pincode: string;
  isActive: boolean;
}

export interface RetailHubCoverageMapCustomer {
  userId: string;
  name: string | null;
  initial: string;
  lat: number;
  lng: number;
  pincode: string | null;
  hasActiveOrder: boolean;
}

export interface RetailHubCoverageMapBoundary {
  pincode: string;
  count: number;
  polygon: Array<[number, number]>;
}

/** Safe projection returned to the Electron client; provider secrets never enter it. */
export interface RetailHubCoverageMapProjection {
  schema: 'epic-bos-retail-hub-coverage-map.v1';
  source: 'bakaloo';
  writeBackAllowed: false;
  observedAt: string;
  projectionChecksum: string;
  scope: ShadowImportScope;
  shop: RetailHubCoverageMapShop;
  serviceablePincodes: string[];
  uncoveredPincodes: string[];
  customers: RetailHubCoverageMapCustomer[];
  boundaries: RetailHubCoverageMapBoundary[];
  totalCustomers: number;
}

export interface BakalooCoverageMapRequest {
  method: 'GET';
  url: string;
  headers: Readonly<Record<string, string>>;
}

export interface BakalooCoverageMapResponse {
  status: number;
  contentType?: string;
  body: unknown;
  byteLength?: number;
}

export type BakalooCoverageMapRequester = (request: BakalooCoverageMapRequest) => Promise<BakalooCoverageMapResponse>;

export interface BakalooCoverageMapProviderOptions {
  baseUrl: string;
  credentialRef: string;
  vault: BakalooShadowCredentialVault;
  requester: BakalooCoverageMapRequester;
  maxResponseBytes?: number;
  now?: () => string;
}

/**
 * Creates a server-owned coverage-map provider. The shop ID and operating
 * scope come from the authenticated Hub route; the secret is resolved only
 * from the Hub vault and is bound to one credential generation per request.
 */
export function createBakalooCoverageMapProviderFromVault(
  options: BakalooCoverageMapProviderOptions,
): (scope: ShadowImportScope, shopId: string) => Promise<RetailHubCoverageMapProjection> {
  const baseUrl = safeBaseUrl(options.baseUrl);
  const credentialRef = safeCredentialRef(options.credentialRef);
  if (!options.vault || typeof options.vault.resolve !== 'function') throw new Error('Bakaloo coverage-map credential vault is required.');
  if (typeof options.requester !== 'function') throw new Error('Bakaloo coverage-map requester is required.');
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 50 * 1024 * 1024) throw new Error('Bakaloo coverage-map response limit is invalid.');

  return async (scope, shopId) => {
    const normalizedScope = normalizeScope(scope);
    if (!SHOP_ID.test(shopId)) throw new Error('Bakaloo coverage-map shop ID must be a UUID.');
    const initial = await resolveCredential(options.vault, normalizedScope, credentialRef);
    const url = buildBakalooCoverageMapUrl(baseUrl.toString(), shopId);
    const response = await options.requester({
      method: 'GET',
      url,
      headers: { ...initial.headers, accept: 'application/json' },
    });
    const current = await resolveCredential(options.vault, normalizedScope, credentialRef);
    if (current.revision !== initial.revision) throw new Error('Bakaloo coverage-map credentials rotated during the request; discard this projection and retry.');
    if (!Number.isInteger(response.status) || response.status !== 200) throw new Error(`Bakaloo coverage-map source returned HTTP ${response.status}; no map evidence was accepted.`);
    if (response.contentType && !/^application\/json(?:\s*;|$)/iu.test(response.contentType)) throw new Error('Bakaloo coverage-map source must return application/json.');
    const serialized = JSON.stringify(response.body);
    if (serialized === undefined) throw new Error('Bakaloo coverage-map source returned an unserializable response.');
    const byteLength = response.byteLength ?? Buffer.byteLength(serialized, 'utf8');
    if (!Number.isInteger(byteLength) || byteLength < 0 || byteLength > maxResponseBytes) throw new Error('Bakaloo coverage-map response exceeds the safety limit.');
    const projection = validateCoverageMap(response.body, normalizedScope, options.now?.() ?? new Date().toISOString());
    return { ...projection, projectionChecksum: checksumProjection(projection) };
  };
}

export function buildBakalooCoverageMapUrl(baseUrl: string, shopId: string): string {
  if (!SHOP_ID.test(shopId)) throw new Error('Bakaloo coverage-map shop ID must be a UUID.');
  const base = safeBaseUrl(baseUrl);
  const path = base.pathname.replace(/\/+$/u, '');
  return new URL(`${path}/v1/admin/coverage-map/${encodeURIComponent(shopId)}`, base.origin).toString();
}

function validateCoverageMap(value: unknown, scope: ShadowImportScope, observedAt: string): Omit<RetailHubCoverageMapProjection, 'projectionChecksum'> {
  const envelope = isRecord(value) && isRecord(value.data) ? value : undefined;
  if (envelope && envelope.success !== true) throw new Error('Bakaloo coverage-map response did not report success.');
  const candidate = envelope?.data ?? value;
  if (!isRecord(candidate) || !isRecord(candidate.shop)) throw new Error('Bakaloo coverage-map response data is invalid.');
  const timestamp = parseTimestamp(observedAt);
  const shop = validateShop(candidate.shop);
  const customers = validateCustomers(candidate.customers);
  const boundaries = validateBoundaries(candidate.boundaries);
  const serviceablePincodes = validatePincodeList(candidate.serviceablePincodes, 'serviceable');
  const uncoveredPincodes = validatePincodeList(candidate.uncoveredPincodes, 'uncovered');
  if (!nonNegativeInteger(candidate.totalCustomers) || candidate.totalCustomers !== customers.length) throw new Error('Bakaloo coverage-map customer total is invalid.');
  return {
    schema: 'epic-bos-retail-hub-coverage-map.v1',
    source: 'bakaloo',
    writeBackAllowed: false,
    observedAt: timestamp,
    scope,
    shop,
    serviceablePincodes,
    uncoveredPincodes,
    customers,
    boundaries,
    totalCustomers: candidate.totalCustomers,
  };
}

function checksumProjection(value: Omit<RetailHubCoverageMapProjection, 'projectionChecksum'>): string {
  return createHash('sha256').update(serializeRetailHubCoverageMapProjection(value), 'utf8').digest('hex');
}

function validateShop(value: Record<string, unknown>): RetailHubCoverageMapShop {
  const lat = latitude(value.lat, 'shop latitude');
  const lng = longitude(value.lng, 'shop longitude');
  rejectPlaceholder(lat, lng, 'shop coordinates');
  return {
    id: boundedString(value.id, 'shop ID', 160),
    name: boundedString(value.name, 'shop name', 160),
    lat,
    lng,
    city: boundedString(value.city, 'shop city', 120),
    state: boundedString(value.state, 'shop state', 120),
    pincode: boundedString(value.pincode, 'shop pincode', 20),
    isActive: value.isActive === true,
  };
}

function validateCustomers(value: unknown): RetailHubCoverageMapCustomer[] {
  if (!Array.isArray(value) || value.length > 10_000) throw new Error('Bakaloo coverage-map customers are invalid.');
  return value.map((item) => {
    if (!isRecord(item)) throw new Error('Bakaloo coverage-map customer is invalid.');
    const lat = latitude(item.lat, 'customer latitude');
    const lng = longitude(item.lng, 'customer longitude');
    rejectPlaceholder(lat, lng, 'customer coordinates');
    return {
      userId: boundedString(item.userId, 'customer ID', 160),
      name: item.name === null ? null : boundedString(item.name, 'customer name', 160),
      initial: boundedString(item.initial, 'customer initial', 4),
      lat,
      lng,
      pincode: item.pincode === null ? null : boundedString(item.pincode, 'customer pincode', 20),
      hasActiveOrder: item.hasActiveOrder === true,
    };
  });
}

function validateBoundaries(value: unknown): RetailHubCoverageMapBoundary[] {
  if (!Array.isArray(value) || value.length > 2_000) throw new Error('Bakaloo coverage-map boundaries are invalid.');
  return value.map((item) => {
    if (!isRecord(item) || !nonNegativeInteger(item.count) || !Array.isArray(item.polygon) || item.polygon.length < 3 || item.polygon.length > 720) throw new Error('Bakaloo coverage-map boundary is invalid.');
    return {
      pincode: boundedString(item.pincode, 'boundary pincode', 20),
      count: item.count,
      polygon: item.polygon.map((point) => {
        if (!Array.isArray(point) || point.length !== 2) throw new Error('Bakaloo coverage-map boundary point is invalid.');
        const lat = latitude(point[0], 'boundary latitude');
        const lng = longitude(point[1], 'boundary longitude');
        rejectPlaceholder(lat, lng, 'boundary coordinates');
        return [lat, lng] as [number, number];
      }),
    };
  });
}

function validatePincodeList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 20_000 || !value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 20)) throw new Error(`Bakaloo coverage-map ${label} pincodes are invalid.`);
  return [...new Set(value.map((item) => item.trim()))];
}

async function resolveCredential(vault: BakalooShadowCredentialVault, scope: ShadowImportScope, credentialRef: string): Promise<{ revision: number; headers: Readonly<Record<string, string>> }> {
  const material = await vault.resolve({ scope, credentialRef });
  if (!material) throw new Error('Bakaloo coverage-map credential reference is not configured in the server vault.');
  if (!Number.isInteger(material.revision) || material.revision < 1) throw new Error('Bakaloo coverage-map vault returned an invalid credential revision.');
  if (!material.headers || typeof material.headers !== 'object' || Array.isArray(material.headers) || !Object.keys(material.headers).length) throw new Error('Bakaloo coverage-map vault returned no credential headers.');
  for (const [key, value] of Object.entries(material.headers)) {
    if (!/^[A-Za-z0-9-]{1,80}$/u.test(key) || typeof value !== 'string' || value.length > 2_000) throw new Error('Bakaloo coverage-map vault returned invalid credential headers.');
  }
  return material;
}

function normalizeScope(value: ShadowImportScope): ShadowImportScope {
  if (!value || !nonBlank(value.tenantId) || !nonBlank(value.companyId) || !nonBlank(value.branchId)) throw new Error('Bakaloo coverage-map scope is invalid.');
  return { tenantId: value.tenantId.trim(), companyId: value.companyId.trim(), branchId: value.branchId.trim() };
}

function safeBaseUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Bakaloo coverage-map base URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Bakaloo coverage-map base URL must be a credential-free HTTPS URL without query or fragment data.');
  return url;
}

function safeCredentialRef(value: string): string {
  const normalized = value.trim();
  if (!CREDENTIAL_REF.test(normalized)) throw new Error('Bakaloo coverage-map credential reference must be a non-secret vault identifier.');
  return normalized;
}

function parseTimestamp(value: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Bakaloo coverage-map observation time is invalid.');
  return new Date(value).toISOString();
}
function latitude(value: unknown, label: string): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < -90 || value > 90) throw new Error(`${label} is invalid.`); return value; }
function longitude(value: unknown, label: string): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < -180 || value > 180) throw new Error(`${label} is invalid.`); return value; }
function rejectPlaceholder(lat: number, lng: number, label: string): void { if (lat === 0 && lng === 0) throw new Error(`${label} cannot use the 0,0 placeholder.`); }
function boundedString(value: unknown, label: string, maximum: number): string { if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximum) throw new Error(`${label} is invalid.`); return value.trim(); }
function nonBlank(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function nonNegativeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
