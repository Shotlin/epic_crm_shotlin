import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { ManufacturingReadAccessDecision, ManufacturingReadCollection, ManufacturingReadProjection } from '../shared/manufacturing-read-projection-contracts';
type ScopedRecord = { scope?: { companyId: string; branchId: string } };
export const MANUFACTURING_READ_COLLECTIONS = [
  ['workCenters', 'manufacturing.engineering'], ['bomRevisions', 'manufacturing.engineering'],
  ['qualityPlans', 'manufacturing.engineering'], ['workOrders', 'manufacturing.execution'],
  ['productionMaterialIssues', 'manufacturing.execution'], ['qualityInspections', 'manufacturing.quality'],
  ['nonconformances', 'manufacturing.quality'], ['productionOutputs', 'manufacturing.execution'],
] as const satisfies ReadonlyArray<readonly [ManufacturingReadCollection, string]>;
type Source = Pick<RevenueOpsState, 'scope' | ManufacturingReadCollection> | Pick<RevenueOpsSnapshot, 'scope' | ManufacturingReadCollection>;
const METRICS: Record<ManufacturingReadCollection, readonly string[]> = {
  workCenters: ['capacityLoadPercent'], bomRevisions: [], qualityPlans: [],
  workOrders: ['productionReleased', 'productionInProgress', 'capacityLoadPercent', 'qualityHolds'],
  productionMaterialIssues: [], qualityInspections: [], nonconformances: ['openNonconformances'],
  productionOutputs: ['productionOutputValue'],
};
const FIELD_METRICS: Record<string, readonly string[]> = {
  'manufacturing.execution.unitCost': ['productionOutputValue'],
  'manufacturing.execution.totalCost': ['productionOutputValue'],
  'manufacturing.engineering.costRatePerHour': ['capacityLoadPercent'],
};
const inScope = (record: ScopedRecord, scope: Source['scope']) => record.scope?.companyId === scope.companyId && record.scope?.branchId === scope.branchId;
function redact<T extends object>(record: T, fields: readonly string[]): T { const copy = { ...record } as Record<string, unknown>; for (const field of fields) delete copy[field]; return copy as T; }
export function createManufacturingReadProjection(state: Source, getDecision: (resource: string) => ManufacturingReadAccessDecision, generatedAt = new Date().toISOString()): ManufacturingReadProjection {
  const projected = {} as Record<ManufacturingReadCollection, unknown[]>; const hiddenCollections: string[] = []; const redactedFields: Record<string, string[]> = {}; const redactedMetrics: string[] = [];
  const records = state as unknown as Record<ManufacturingReadCollection, ScopedRecord[]>;
  for (const [collection, resource] of MANUFACTURING_READ_COLLECTIONS) {
    const decision = getDecision(resource);
    if (!decision.allowed) { projected[collection] = []; hiddenCollections.push(collection); redactedMetrics.push(...METRICS[collection]); continue; }
    if (decision.deniedFields.length) { redactedFields[resource] = [...decision.deniedFields]; for (const field of decision.deniedFields) redactedMetrics.push(...(FIELD_METRICS[`${resource}.${field}`] ?? [])); }
    projected[collection] = records[collection].filter((record) => inScope(record, state.scope)).map((record) => redact(record, decision.deniedFields));
  }
  return { scope: structuredClone(state.scope), generatedAt, hiddenCollections, redactedFields, redactedMetrics: [...new Set(redactedMetrics)], ...projected } as ManufacturingReadProjection;
}
