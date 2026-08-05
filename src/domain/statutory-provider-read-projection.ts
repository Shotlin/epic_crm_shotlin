import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { StatutoryProviderReadAccessDecision, StatutoryProviderReadCollection, StatutoryProviderReadProjection } from '../shared/statutory-provider-read-projection-contracts';

type ScopedRecord = { scope?: { companyId: string; branchId: string } };

export const STATUTORY_PROVIDER_READ_COLLECTIONS = [
  ['statutoryExchanges', 'statutory.exchange'], ['statutoryAdapters', 'statutory.adapter'],
  ['statutoryOperations', 'statutory.operation'], ['consolidatedEwayBills', 'statutory.consolidated-eway-bill'],
  ['digitalSignatureEvidence', 'statutory.signature'], ['portalReconciliationRuns', 'statutory.portal-reconciliation'],
  ['providerConnectors', 'provider.connector'], ['providerConformanceCases', 'provider.conformance-case'],
  ['providerSubmissions', 'provider.submission'], ['providerReconciliationRuns', 'provider.reconciliation'],
] as const satisfies ReadonlyArray<readonly [StatutoryProviderReadCollection, string]>;

type Source = Pick<RevenueOpsState, 'scope' | StatutoryProviderReadCollection> | Pick<RevenueOpsSnapshot, 'scope' | StatutoryProviderReadCollection>;
const METRICS: Record<StatutoryProviderReadCollection, readonly string[]> = {
  statutoryExchanges: ['statutoryExceptions', 'portalDrift', 'expiringEwayBills', 'unverifiedSignatures'],
  statutoryAdapters: ['statutoryCredentialGaps'], statutoryOperations: [], consolidatedEwayBills: [],
  digitalSignatureEvidence: ['unverifiedSignatures'], portalReconciliationRuns: ['portalDrift'],
  providerConnectors: ['providerCredentialGaps', 'providerConformanceGaps'],
  providerConformanceCases: [], providerSubmissions: ['providerHandoffsAwaitingEvidence'],
  providerReconciliationRuns: ['providerReconciliationExceptions'],
};
const FIELD_METRICS: Record<string, readonly string[]> = {
  'statutory.adapter.credentialStatus': ['statutoryCredentialGaps'],
  'provider.connector.credentialStatus': ['providerCredentialGaps'],
};
const inScope = (record: ScopedRecord, scope: Source['scope']) => record.scope?.companyId === scope.companyId && record.scope?.branchId === scope.branchId;
function redact<T extends object>(record: T, fields: readonly string[]): T { const copy = { ...record } as Record<string, unknown>; for (const field of fields) delete copy[field]; return copy as T; }

export function createStatutoryProviderReadProjection(state: Source, getDecision: (resource: string) => StatutoryProviderReadAccessDecision, generatedAt = new Date().toISOString()): StatutoryProviderReadProjection {
  const projected = {} as Record<StatutoryProviderReadCollection, unknown[]>;
  const hiddenCollections: string[] = []; const redactedFields: Record<string, string[]> = {}; const redactedMetrics: string[] = [];
  const records = state as unknown as Record<StatutoryProviderReadCollection, ScopedRecord[]>;
  for (const [collection, resource] of STATUTORY_PROVIDER_READ_COLLECTIONS) {
    const decision = getDecision(resource);
    if (!decision.allowed) { projected[collection] = []; hiddenCollections.push(collection); redactedMetrics.push(...METRICS[collection]); continue; }
    if (decision.deniedFields.length) { redactedFields[resource] = [...decision.deniedFields]; for (const field of decision.deniedFields) redactedMetrics.push(...(FIELD_METRICS[`${resource}.${field}`] ?? [])); }
    projected[collection] = records[collection].filter((record) => inScope(record, state.scope)).map((record) => redact(record, decision.deniedFields));
  }
  return { scope: structuredClone(state.scope), generatedAt, hiddenCollections, redactedFields, redactedMetrics: [...new Set(redactedMetrics)], ...projected } as StatutoryProviderReadProjection;
}
