import { describe, expect, it } from 'vitest';
import { createInitialCrmState } from './crm';
import { createInitialPartyState } from './party';
import { createInitialRevenueOpsState, createQuote } from './revenue-ops';
import {
  convertQuoteToSalesOrder,
  createCatalogProduct,
  createDiscountPolicy,
  createGstTaxCode,
  createPriceList,
  createPriceListEntry,
  decidePriceListApproval,
  decideQuoteApproval,
  submitPriceListForApproval,
  submitQuoteForApproval,
  transitionSalesOrder,
  updateFulfilmentTask,
} from './commercial';

function context() {
  const crm = createInitialCrmState();
  const party = createInitialPartyState();
  return { opportunities: crm.opportunities, accounts: party.accounts, contacts: party.contacts, addresses: party.addresses, activeUserIds: ['user-avery', 'user-priya', 'user-lee'] };
}

function pricedQuote() {
  const initial = createInitialRevenueOpsState();
  const state = { ...initial, profile: { ...initial.profile, gstRegistered: true, gstin: '27ABCDE1234F1Z5' } };
  return createQuote(state, { opportunityId: 'opp-211', placeOfSupplyStateCode: '27', recipientTreatment: 'unregistered', recipientGstin: '', validUntil: '2026-08-31', priceListId: 'price-list-india-direct-2627', discountPolicyIds: ['discount-partner-launch-2627'] }, context(), 'user-avery', 'quote-commercial-1', '2026-07-15T12:00:00.000Z');
}

describe('effective-dated commercial foundry', () => {
  it('resolves price-list, discount, and verified GST versions into a quote snapshot', () => {
    const state = pricedQuote();
    const quote = state.quotes[0]!;
    expect(quote).toMatchObject({ priceListId: 'price-list-india-direct-2627', subtotal: 4800000, discountTotal: 120000, pricingAsOf: '2026-07-15' });
    expect(quote.scope).toEqual(state.scope);
    expect(quote.lines[0]).toMatchObject({ catalogProductId: 'product-distributor-platform', taxCodeId: 'tax-sac-998314-2026', priceListEntryId: 'price-bos-dist-in-2627', listUnitPrice: 4800000, taxableValue: 4680000, gstRate: 18 });
    expect(quote.taxPreview).toMatchObject({ cgst: 421200, sgst: 421200, totalTax: 842400, grandTotal: 5522400 });
  });

  it('rejects overlapping tax and price versions while allowing new governed masters', () => {
    const initial = createInitialRevenueOpsState();
    expect(() => createGstTaxCode(initial, { code: '998314', kind: 'SAC', description: 'Overlapping service classification', gstRate: 18, cessRate: 0, effectiveFrom: '2026-06-01', sourceLabel: 'GST Portal', sourceUrl: 'https://www.gst.gov.in/', reviewStatus: 'verified' }, 'tax-overlap')).toThrow('overlapping');
    expect(() => createPriceListEntry(initial, { priceListId: 'price-list-india-direct-2627', productId: 'product-distributor-platform', unitPrice: 5000000, minimumQuantity: 1, effectiveFrom: '2026-10-01' }, 'price-overlap')).toThrow('overlapping');
    const tax = createGstTaxCode(initial, { code: '84713010', kind: 'HSN', description: 'Portable digital processing machine reference', gstRate: 18, cessRate: 0, effectiveFrom: '2027-04-01', sourceLabel: 'GST Portal master review', sourceUrl: 'https://services.gst.gov.in/services/searchhsnsac', reviewStatus: 'verified' }, 'tax-new');
    const product = createCatalogProduct(tax, { sku: 'FIELD-DEVICE', name: 'Field operations device', description: 'Managed handheld field operations terminal.', kind: 'goods', uom: 'NOS', taxCodeId: 'tax-new', effectiveFrom: '2027-04-01' }, 'product-new');
    const list = createPriceList(product, { code: 'INDIA-2728', name: 'India direct FY 2027-28', channel: 'direct', effectiveFrom: '2027-04-01', effectiveTo: '2028-03-31' }, 'list-new');
    const entry = createPriceListEntry(list, { priceListId: 'list-new', productId: 'product-new', unitPrice: 42000, minimumQuantity: 1, effectiveFrom: '2027-04-01', effectiveTo: '2028-03-31' }, 'entry-new');
    const discount = createDiscountPolicy(entry, { code: 'VOLUME-2728', name: 'Field device volume concession', scope: 'product', productId: 'product-new', method: 'percentage', value: 3, minimumTaxableValue: 200000, maximumDiscountAmount: 50000, stackable: false, approvalThresholdPercent: 2, effectiveFrom: '2027-04-01', effectiveTo: '2028-03-31' }, 'discount-new');
    expect(discount).toMatchObject({ revision: initial.revision + 5 });
  });

  it('requires an independent finance decision before a new price book becomes quote-ready', () => {
    const initial = createInitialRevenueOpsState();
    const listed = createPriceList(initial, { code: 'PARTNER-2728', name: 'Partner FY 2027-28', channel: 'partner', effectiveFrom: '2027-04-01', effectiveTo: '2028-03-31' }, 'price-list-approval');
    const tiered = createPriceListEntry(listed, { priceListId: 'price-list-approval', productId: 'product-distributor-platform', unitPrice: 4500000, minimumQuantity: 1, effectiveFrom: '2027-04-01', effectiveTo: '2028-03-31' }, 'price-tier-approval');
    const submitted = submitPriceListForApproval(tiered, { id: 'price-list-approval', expectedVersion: 1, reason: 'Partner price tiers ready for finance activation.' }, 'user-avery', ['user-avery', 'user-priya'], 'price-approval-1', '2026-07-16T09:00:00.000Z');
    expect(submitted.priceLists.find(({ id }) => id === 'price-list-approval')).toMatchObject({ status: 'submitted', active: false, version: 2, approvalRequestId: 'price-approval-1' });
    expect(() => decidePriceListApproval(submitted, { requestId: 'price-approval-1', decision: 'approved', remarks: 'Self approval', expectedVersion: 1 }, 'user-avery')).toThrow('independent approver');
    const approved = decidePriceListApproval(submitted, { requestId: 'price-approval-1', decision: 'approved', remarks: 'Pricing tiers and dates verified.', expectedVersion: 1 }, 'user-priya', '2026-07-16T10:00:00.000Z');
    expect(approved.priceLists.find(({ id }) => id === 'price-list-approval')).toMatchObject({ status: 'active', active: true, activatedBy: 'user-priya', version: 3 });
    expect(approved.priceListApprovalRequests[0]).toMatchObject({ status: 'approved', decidedBy: 'user-priya', version: 2 });
  });

  it('preserves GST-inclusive retail shelf prices as a governed price-tier choice', () => {
    const initial = createInitialRevenueOpsState();
    const retailList = createPriceList(initial, { code: 'STORE-RETAIL-2728', name: 'Store shelf prices FY 2027-28', channel: 'retail', effectiveFrom: '2027-04-01', effectiveTo: '2028-03-31' }, 'retail-list');
    const tiered = createPriceListEntry(retailList, { priceListId: 'retail-list', productId: 'product-distributor-platform', unitPrice: 118, taxMode: 'inclusive', minimumQuantity: 1, effectiveFrom: '2027-04-01', effectiveTo: '2028-03-31' }, 'retail-price');

    expect(tiered.priceLists.find(({ id }) => id === 'retail-list')).toMatchObject({ channel: 'retail', status: 'draft' });
    expect(tiered.priceListEntries.find(({ id }) => id === 'retail-price')).toMatchObject({ taxMode: 'inclusive', unitPrice: 118 });
  });

  it('enforces independent quote approval and creates an atomic order fulfilment handoff', () => {
    const submitted = submitQuoteForApproval(pricedQuote(), { id: 'quote-commercial-1', expectedVersion: 1, reason: 'Approve partner launch terms and GST preview.' }, 'user-avery', ['user-avery', 'user-priya'], 'approval-1', '2026-07-15T13:00:00.000Z');
    expect(submitted.quotes[0]).toMatchObject({ status: 'submitted', version: 2, approvalRequestId: 'approval-1' });
    expect(() => decideQuoteApproval(submitted, { requestId: 'approval-1', decision: 'approved', remarks: 'Self approval', expectedVersion: 1 }, 'user-avery')).toThrow('independent approver');
    const approved = decideQuoteApproval(submitted, { requestId: 'approval-1', decision: 'approved', remarks: 'Commercial terms approved.', expectedVersion: 1 }, 'user-priya', '2026-07-15T14:00:00.000Z');
    const converted = convertQuoteToSalesOrder(approved, { quoteId: 'quote-commercial-1', expectedVersion: 3, orderDate: '2026-07-16', requiredBy: '2026-09-30' }, 'user-avery', 'user-avery', 'order-1', '2026-07-16T06:00:00.000Z');
    expect(converted.quotes[0]).toMatchObject({ status: 'converted', version: 4 });
    expect(converted.salesOrders[0]).toMatchObject({ id: 'order-1', number: 'SO-26-27-00001', status: 'confirmed', fulfilmentStatus: 'planned', approvedQuoteVersion: 3 });
    expect(converted.salesOrders[0]?.scope).toEqual(converted.quotes[0]?.scope);
    expect(converted.fulfilmentTasks.map(({ kind }) => kind)).toEqual(['kickoff', 'service-delivery', 'acceptance']);
    const fulfilling = transitionSalesOrder(converted, { id: 'order-1', toStatus: 'fulfilling', expectedVersion: 1 });
    expect(() => transitionSalesOrder(fulfilling, { id: 'order-1', toStatus: 'completed', expectedVersion: 2 })).toThrow('fulfilment task');
    const first = converted.fulfilmentTasks[0]!;
    const ready = updateFulfilmentTask(fulfilling, { id: first.id, toStatus: 'ready', expectedVersion: 1 });
    const inProgress = updateFulfilmentTask(ready, { id: first.id, toStatus: 'in-progress', expectedVersion: 2 });
    const completed = updateFulfilmentTask(inProgress, { id: first.id, toStatus: 'completed', expectedVersion: 3 });
    expect(completed.fulfilmentTasks.find(({ id }) => id === first.id)).toMatchObject({ status: 'completed', version: 4 });
    expect(completed.salesOrders[0]).toMatchObject({ status: 'fulfilling', version: 5 });
  });
});
