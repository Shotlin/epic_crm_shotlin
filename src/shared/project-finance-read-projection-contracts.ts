import type { OperatingRecordScope, RevenueOpsSnapshot } from './revenue-ops-contracts';
export interface ProjectFinanceReadAccessDecision { allowed: boolean; deniedFields: string[]; }
export const PROJECT_FINANCE_READ_COLLECTION_NAMES = [
  'projectBillingPlans', 'projectBillingClaims', 'revenueRecognitionEvents', 'serviceEntitlementUsage',
  'accountingClosePeriods', 'projectExchangeRates', 'projectCurrencyProfiles', 'projectContractVariations',
  'projectRetainers', 'retainerDrawdowns', 'projectResourcePlans', 'projectMarginReviews',
] as const;
export type ProjectFinanceReadCollection = typeof PROJECT_FINANCE_READ_COLLECTION_NAMES[number];
export type ProjectFinanceReadProjection = {
  scope: OperatingRecordScope; generatedAt: string; hiddenCollections: string[];
  redactedFields: Record<string, string[]>; redactedMetrics: string[];
} & Pick<RevenueOpsSnapshot, ProjectFinanceReadCollection>;
