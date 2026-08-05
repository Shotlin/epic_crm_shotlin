import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { SalesReadAccessDecision, SalesReadCollection, SalesReadProjection } from '../shared/sales-read-projection-contracts';

type ScopedRecord = { scope?: { companyId: string; branchId: string } };
type SalesReadSource = Pick<RevenueOpsState, 'scope' | SalesReadCollection>
  | Pick<RevenueOpsSnapshot, 'scope' | SalesReadCollection>;

export const SALES_READ_COLLECTIONS = [
  ['taxCodes', 'sales.catalog'], ['products', 'sales.catalog'],
  ['priceLists', 'sales.pricing'], ['priceListEntries', 'sales.pricing'],
  ['priceListApprovalRequests', 'sales.pricing'], ['discountPolicies', 'sales.pricing'],
  ['quotes', 'sales.commercial'], ['quoteApprovalRequests', 'sales.commercial'],
  ['salesOrders', 'sales.commercial'], ['fulfilmentTasks', 'sales.commercial'],
  ['quoteDocuments', 'sales.commercial'], ['deliveryEvidence', 'sales.commercial'],
  ['serviceMilestones', 'sales.commercial'], ['paymentTerms', 'finance.receivable'],
] as const satisfies ReadonlyArray<readonly [SalesReadCollection, string]>;

const SALES_COLLECTION_METRICS: Record<SalesReadCollection, readonly string[]> = {
  taxCodes: [], products: [], priceLists: [], priceListEntries: [], priceListApprovalRequests: ['pendingApprovals'],
  discountPolicies: [], quotes: ['quoteValue', 'pendingApprovals'], quoteApprovalRequests: ['pendingApprovals'],
  salesOrders: ['confirmedOrderValue'], fulfilmentTasks: [], quoteDocuments: [], paymentTerms: [],
  deliveryEvidence: [], serviceMilestones: [],
};

const SALES_FIELD_METRICS: Record<string, readonly string[]> = {
  'sales.commercial.subtotal': ['quoteValue', 'confirmedOrderValue'],
  'sales.commercial.discountTotal': ['quoteValue', 'confirmedOrderValue'],
  'sales.commercial.taxPreview': ['quoteValue', 'confirmedOrderValue'],
  'sales.pricing.unitPrice': ['quoteValue', 'confirmedOrderValue'],
};

function isInScope(record: ScopedRecord, scope: SalesReadSource['scope']): boolean {
  return record.scope?.companyId === scope.companyId && record.scope?.branchId === scope.branchId;
}

function redact<T extends object>(record: T, fields: readonly string[]): T {
  const copy = { ...record } as Record<string, unknown>;
  for (const field of fields) delete copy[field];
  return copy as T;
}

/**
 * The commercial `DiscountPolicy.scope` field describes pricing behaviour, so
 * its branch provenance is deliberately stored in `operatingScope`.
 */
function isSalesRecordInScope(collection: SalesReadCollection, record: ScopedRecord & { operatingScope?: ScopedRecord['scope'] }, scope: SalesReadSource['scope']): boolean {
  if (collection === 'discountPolicies') {
    return record.operatingScope?.companyId === scope.companyId && record.operatingScope?.branchId === scope.branchId;
  }
  return isInScope(record, scope);
}

export function createSalesReadProjection(
  source: SalesReadSource,
  getDecision: (resource: string) => SalesReadAccessDecision,
  generatedAt = new Date().toISOString(),
): SalesReadProjection {
  const projected = {} as Record<SalesReadCollection, unknown[]>;
  const hiddenCollections: string[] = [];
  const redactedFields: Record<string, string[]> = {};
  const redactedMetrics: string[] = [];
  const records = source as unknown as Record<SalesReadCollection, Array<ScopedRecord & { operatingScope?: ScopedRecord['scope'] }>>;

  for (const [collection, resource] of SALES_READ_COLLECTIONS) {
    const decision = getDecision(resource);
    if (!decision.allowed) {
      projected[collection] = [];
      hiddenCollections.push(collection);
      redactedMetrics.push(...SALES_COLLECTION_METRICS[collection]);
      continue;
    }
    if (decision.deniedFields.length) {
      redactedFields[resource] = [...new Set([...(redactedFields[resource] ?? []), ...decision.deniedFields])];
      for (const field of decision.deniedFields) redactedMetrics.push(...(SALES_FIELD_METRICS[`${resource}.${field}`] ?? []));
    }
    projected[collection] = records[collection]
      .filter((record) => isSalesRecordInScope(collection, record, source.scope))
      .map((record) => redact(record, decision.deniedFields));
  }

  return {
    scope: structuredClone(source.scope), generatedAt, hiddenCollections, redactedFields,
    redactedMetrics: [...new Set(redactedMetrics)],
    ...projected,
  } as SalesReadProjection;
}
