import type { ShadowImportPlan } from './shadow-import';
import type { ShadowImportScope } from './shadow-import-postgres-repository';
import type { ShadowImportPullResult } from './shadow-import-source-adapter';

export interface ShadowImportPullReceipt {
  id: string;
  source: 'bakaloo';
  batchId: string;
  scope: ShadowImportScope;
  observedAt: string;
  registeredAt: string;
  credentialRevision?: number;
  pagesFetched: number;
  recordsFetched: number;
  planChecksum: string;
  writeBackAllowed: false;
  version: 1;
}

export function createShadowImportPullReceipt(
  result: ShadowImportPullResult,
  scope: ShadowImportScope,
  registeredAt: string,
): ShadowImportPullReceipt {
  const normalizedScope = normalizeScope(scope);
  const normalizedRegisteredAt = timestamp(registeredAt);
  const planChecksum = result.plan.batch.integrity.computedChecksum;
  return {
    id: `shadow-pull:${result.plan.batch.id}:${planChecksum.slice(0, 16)}`,
    source: 'bakaloo',
    batchId: result.plan.batch.id,
    scope: normalizedScope,
    observedAt: timestamp(result.evidence.observedAt),
    registeredAt: normalizedRegisteredAt,
    ...(result.evidence.credentialRevision === undefined ? {} : { credentialRevision: result.evidence.credentialRevision }),
    pagesFetched: bounded(result.pagesFetched, 'Pages fetched'),
    recordsFetched: bounded(result.recordsFetched, 'Records fetched'),
    planChecksum,
    writeBackAllowed: false,
    version: 1,
  };
}

export function assertShadowImportPullReceipt(receipt: ShadowImportPullReceipt, plan?: ShadowImportPlan): ShadowImportPullReceipt {
  if (!receipt || receipt.source !== 'bakaloo' || receipt.writeBackAllowed !== false || receipt.version !== 1) throw new Error('Shadow-import pull receipt is invalid or attempts to authorize write-back.');
  const normalized = createShadowImportPullReceipt({
    evidence: { batchId: receipt.batchId, source: 'bakaloo', observedAt: receipt.observedAt, cursor: { value: 'receipt', observedAt: receipt.observedAt }, declaredCounts: {}, records: [], ...(receipt.credentialRevision === undefined ? {} : { credentialRevision: receipt.credentialRevision }), declaredChecksum: '' },
    plan: plan ?? ({ batch: { id: receipt.batchId, integrity: { computedChecksum: receipt.planChecksum } } } as ShadowImportPlan),
    pagesFetched: receipt.pagesFetched,
    recordsFetched: receipt.recordsFetched,
  }, receipt.scope, receipt.registeredAt);
  if (normalized.id !== receipt.id || normalized.planChecksum !== receipt.planChecksum) throw new Error('Shadow-import pull receipt checksum or identity is invalid.');
  return structuredClone(receipt);
}

function normalizeScope(scope: ShadowImportScope): ShadowImportScope { return { tenantId: nonBlank(scope.tenantId, 'Tenant scope'), companyId: nonBlank(scope.companyId, 'Company scope'), branchId: nonBlank(scope.branchId, 'Branch scope') }; }
function nonBlank(value: string, label: string): string { if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must not be blank.`); return value.trim(); }
function timestamp(value: string): string { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error('Shadow-import receipt time must be valid.'); return date.toISOString(); }
function bounded(value: number, label: string): number { if (!Number.isInteger(value) || value < 0 || value > 5_000_000) throw new Error(`${label} must be an integer from 0 to 5000000.`); return value; }
