import { collectShadowImportEvidence, type CollectShadowImportEvidenceInput, type ShadowImportPullResult, type ShadowImportSourceAdapter } from './shadow-import-source-adapter';
import type { ShadowImportRegistry } from './shadow-import-registry';

export interface RegisterShadowImportPullInput extends CollectShadowImportEvidenceInput {
  /** A bounded source pull must never silently replace an existing evidence batch. */
  allowExistingBatch?: false;
}

export interface RegisteredShadowImportPull extends ShadowImportPullResult {
  registeredAt: string;
}

/**
 * Executes the approved server-side read path and registers a new immutable
 * review plan. The adapter remains GET-only and credential-owned by the Hub;
 * this function never writes to Bakaloo or to business records.
 */
export async function pullAndRegisterShadowImport(
  adapter: ShadowImportSourceAdapter,
  registry: ShadowImportRegistry,
  input: RegisterShadowImportPullInput,
  registeredAt = new Date().toISOString(),
): Promise<RegisteredShadowImportPull> {
  const normalizedRegisteredAt = timestamp(registeredAt);
  const batchId = nonBlank(input.batchId, 'Batch ID');
  if (registry.getPlan(batchId) !== undefined) {
    throw new Error('Shadow-import batch already exists; use a new batch ID instead of replacing reviewed evidence.');
  }
  const result = await collectShadowImportEvidence(adapter, input);
  if (registry.getPlan(result.plan.batch.id) !== undefined) {
    throw new Error('Shadow-import batch already exists; use a new batch ID instead of replacing reviewed evidence.');
  }
  registry.registerPlan(result.plan);
  return { ...result, registeredAt: normalizedRegisteredAt };
}

function timestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Shadow-import registration time must be a valid timestamp.');
  return date.toISOString();
}

function nonBlank(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must not be blank.`);
  return value.trim();
}
