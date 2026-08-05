import type { OperatingRecordScope, RevenueOpsSnapshot } from './revenue-ops-contracts';

export interface SalesReadAccessDecision {
  allowed: boolean;
  deniedFields: string[];
}

export const SALES_READ_COLLECTION_NAMES = [
  'taxCodes', 'products', 'priceLists', 'priceListEntries', 'priceListApprovalRequests',
  'discountPolicies', 'quotes', 'quoteApprovalRequests', 'salesOrders', 'fulfilmentTasks',
  'quoteDocuments', 'paymentTerms', 'deliveryEvidence', 'serviceMilestones',
] as const;

export type SalesReadCollection = typeof SALES_READ_COLLECTION_NAMES[number];

export type SalesReadProjection = {
  scope: OperatingRecordScope;
  generatedAt: string;
  hiddenCollections: string[];
  redactedFields: Record<string, string[]>;
  redactedMetrics: string[];
} & Pick<RevenueOpsSnapshot, SalesReadCollection>;
