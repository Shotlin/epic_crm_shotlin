import type { OperatingRecordScope, RevenueOpsSnapshot } from './revenue-ops-contracts';

export interface ManufacturingReadAccessDecision { allowed: boolean; deniedFields: string[]; }
export const MANUFACTURING_READ_COLLECTION_NAMES = [
  'workCenters', 'bomRevisions', 'qualityPlans', 'workOrders', 'productionMaterialIssues',
  'qualityInspections', 'nonconformances', 'productionOutputs',
] as const;
export type ManufacturingReadCollection = typeof MANUFACTURING_READ_COLLECTION_NAMES[number];
export type ManufacturingReadProjection = {
  scope: OperatingRecordScope; generatedAt: string; hiddenCollections: string[];
  redactedFields: Record<string, string[]>; redactedMetrics: string[];
} & Pick<RevenueOpsSnapshot, ManufacturingReadCollection>;
