import { collectShadowImportEvidence, type CollectShadowImportEvidenceInput, type ShadowImportPullResult, type ShadowImportSourceAdapter } from './shadow-import-source-adapter';
import type { ShadowImportPostgresRepository, ShadowImportScope } from './shadow-import-postgres-repository';
import { createShadowImportPullReceipt, type ShadowImportPullReceipt } from './shadow-import-pull-receipt';

export interface RegisterScopedShadowImportPullInput extends CollectShadowImportEvidenceInput {
  /** A durable pull may only create a new batch; replacement is not supported. */
  allowExistingBatch?: false;
}

export interface RegisteredScopedShadowImportPull extends ShadowImportPullResult {
  registeredAt: string;
  scope: ShadowImportScope;
  receipt: ShadowImportPullReceipt;
}

/**
 * Durable server-side orchestration for a credentialed Bakaloo shadow pull.
 * Scope is supplied by trusted Hub code, never by renderer input. The source
 * is read only, and the repository must implement immutable registration.
 */
export async function pullAndRegisterScopedShadowImport(
  adapter: ShadowImportSourceAdapter,
  repository: ShadowImportPostgresRepository,
  scope: ShadowImportScope,
  input: RegisterScopedShadowImportPullInput,
  registeredAt = new Date().toISOString(),
): Promise<RegisteredScopedShadowImportPull> {
  const registerPlan = repository.registerPlan;
  if (!registerPlan) throw new Error('Durable shadow-import repository does not expose immutable registration.');
  const normalizedRegisteredAt = timestamp(registeredAt);
  const batchId = nonBlank(input.batchId, 'Batch ID');
  if (await repository.getPlan(scope, batchId)) throw new Error('Shadow-import batch already exists; use a new batch ID instead of replacing reviewed evidence.');

  const result = await collectShadowImportEvidence(adapter, input);
  if (await repository.getPlan(scope, result.plan.batch.id)) throw new Error('Shadow-import batch already exists; use a new batch ID instead of replacing reviewed evidence.');
  const normalizedScope = normalizeScope(scope);
  const receipt = createShadowImportPullReceipt(result, normalizedScope, normalizedRegisteredAt);
  if (repository.registerPlanAndPullReceipt) {
    await repository.registerPlanAndPullReceipt(normalizedScope, result.plan, receipt);
  } else {
    await registerPlan.call(repository, scope, result.plan);
    if (repository.registerPullReceipt) await repository.registerPullReceipt(normalizedScope, receipt);
  }
  return { ...result, registeredAt: normalizedRegisteredAt, scope: normalizedScope, receipt };
}

function normalizeScope(scope: ShadowImportScope): ShadowImportScope {
  return { tenantId: nonBlank(scope.tenantId, 'Tenant scope'), companyId: nonBlank(scope.companyId, 'Company scope'), branchId: nonBlank(scope.branchId, 'Branch scope') };
}

function nonBlank(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must not be blank.`);
  return value.trim();
}

function timestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Shadow-import registration time must be a valid timestamp.');
  return date.toISOString();
}
