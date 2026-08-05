import type { OperatingRecordScope, RevenueOpsSnapshot } from './revenue-ops-contracts';

export interface StatutoryProviderReadAccessDecision { allowed: boolean; deniedFields: string[]; }

export const STATUTORY_PROVIDER_READ_COLLECTION_NAMES = [
  'statutoryExchanges', 'statutoryAdapters', 'statutoryOperations', 'consolidatedEwayBills',
  'digitalSignatureEvidence', 'portalReconciliationRuns', 'providerConnectors',
  'providerConformanceCases', 'providerSubmissions', 'providerReconciliationRuns',
] as const;

export type StatutoryProviderReadCollection = typeof STATUTORY_PROVIDER_READ_COLLECTION_NAMES[number];
export type StatutoryProviderReadProjection = {
  scope: OperatingRecordScope;
  generatedAt: string;
  hiddenCollections: string[];
  redactedFields: Record<string, string[]>;
  redactedMetrics: string[];
} & Pick<RevenueOpsSnapshot, StatutoryProviderReadCollection>;
