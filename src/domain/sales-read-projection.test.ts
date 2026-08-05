import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createSalesReadProjection } from './sales-read-projection';

const allowed = () => ({ allowed: true, deniedFields: [] });

function controlledState() {
  const state = createInitialRevenueOpsState();
  const taxCode = state.taxCodes[0]!;
  const discountPolicy = state.discountPolicies[0]!;
  state.taxCodes = [{
    ...taxCode, id: 'tax-current', scope: structuredClone(state.scope),
  }, {
    ...taxCode, id: 'tax-legacy', code: '998319',
  }];
  state.quotes = [{
    id: 'quote-current', number: 'QT-001', opportunityId: 'opp-1', accountId: 'account-1',
    placeOfSupplyStateCode: '27', recipientTreatment: 'registered', recipientGstin: '27ABCDE1234F1Z5',
    currency: 'INR', status: 'draft', validUntil: '2026-08-01', lines: [],
    taxPreview: { treatment: 'intra-state', taxableValue: 100, cgst: 9, sgst: 9, igst: 0, totalTax: 18, grandTotal: 118, determination: 'commercial-estimate' },
    discountPolicyIds: [], subtotal: 100, discountTotal: 0, pricingAsOf: '2026-07-17', revisionNumber: 1,
    createdBy: 'user-1', createdAt: '2026-07-17T09:00:00.000Z', scope: structuredClone(state.scope), version: 1,
  }, {
    id: 'quote-unscoped', number: 'QT-002', opportunityId: 'opp-2', accountId: 'account-2',
    placeOfSupplyStateCode: '27', recipientTreatment: 'registered', recipientGstin: '27ABCDE1234F1Z5',
    currency: 'INR', status: 'draft', validUntil: '2026-08-01', lines: [],
    taxPreview: { treatment: 'intra-state', taxableValue: 200, cgst: 18, sgst: 18, igst: 0, totalTax: 36, grandTotal: 236, determination: 'commercial-estimate' },
    discountPolicyIds: [], subtotal: 200, discountTotal: 0, pricingAsOf: '2026-07-17', revisionNumber: 1,
    createdBy: 'user-1', createdAt: '2026-07-17T09:00:00.000Z', version: 1,
  }];
  state.discountPolicies = [{
    ...discountPolicy, id: 'discount-current', operatingScope: structuredClone(state.scope),
  }, {
    ...discountPolicy, id: 'discount-unscoped', code: 'LEGACY',
  }];
  return state;
}

describe('sales read projection', () => {
  it('returns only exact branch-owned sales records and excludes unscoped legacy records', () => {
    const projection = createSalesReadProjection(controlledState(), allowed);
    expect(projection.taxCodes.map(({ id }) => id)).toEqual(['tax-current']);
    expect(projection.quotes.map(({ id }) => id)).toEqual(['quote-current']);
    expect(projection.discountPolicies.map(({ id }) => id)).toEqual(['discount-current']);
  });

  it('hides commercial records and their aggregates without sales read access', () => {
    const projection = createSalesReadProjection(controlledState(), (resource) => (
      resource === 'sales.commercial' ? { allowed: false, deniedFields: [] } : allowed()
    ));
    expect(projection.quotes).toEqual([]);
    expect(projection.salesOrders).toEqual([]);
    expect(projection.hiddenCollections).toEqual(expect.arrayContaining(['quotes', 'salesOrders']));
    expect(projection.redactedMetrics).toEqual(expect.arrayContaining(['quoteValue', 'confirmedOrderValue']));
  });

  it('redacts sensitive commercial amounts and removes their dependent aggregates', () => {
    const projection = createSalesReadProjection(controlledState(), (resource) => (
      resource === 'sales.commercial' ? { allowed: true, deniedFields: ['subtotal', 'taxPreview'] } : allowed()
    ));
    expect(projection.quotes[0]).not.toHaveProperty('subtotal');
    expect(projection.quotes[0]).not.toHaveProperty('taxPreview');
    expect(projection.redactedMetrics).toContain('quoteValue');
  });
});
