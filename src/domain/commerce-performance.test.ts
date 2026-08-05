import { describe, expect, it } from 'vitest';
import { getDashboardSnapshot, createInitialCrmState } from './crm';
import { buildCommercePerformance } from './commerce-performance';
import { createInitialPartyState } from './party';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from './revenue-ops';
import type { PaymentReceipt, SalesOrder, TaxInvoice } from '../shared/revenue-ops-contracts';

const scope = { companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' };

function line(id: string, description: string, taxableValue: number, quantity: number) {
  return {
    id,
    productInterestId: `interest-${id}`,
    description,
    hsnSac: '8471',
    quantity,
    unitPrice: taxableValue / quantity,
    taxableValue,
    gstRate: 18,
  };
}

function taxPreview(taxableValue: number, totalTax: number) {
  return {
    treatment: 'intra-state' as const,
    taxableValue,
    cgst: totalTax / 2,
    sgst: totalTax / 2,
    igst: 0,
    totalTax,
    grandTotal: taxableValue + totalTax,
    determination: 'commercial-estimate' as const,
  };
}

function order(id: string, orderDate: string, taxableValue: number, discountTotal = 0, status: SalesOrder['status'] = 'confirmed'): SalesOrder {
  const discountedValue = taxableValue - discountTotal;
  const totalTax = discountedValue * 0.18;
  return {
    id,
    number: `SO-${id}`,
    quoteId: `quote-${id}`,
    quoteNumber: `Q-${id}`,
    accountId: 'account-kestrel',
    currency: 'INR',
    orderDate,
    requiredBy: '2026-08-01',
    status,
    fulfilmentStatus: 'planned',
    lines: [line(`line-${id}`, `Order ${id}`, discountedValue, 1)],
    subtotal: taxableValue,
    discountTotal,
    taxPreview: taxPreview(discountedValue, totalTax),
    approvedQuoteVersion: 1,
    createdBy: 'user-avery',
    createdAt: `${orderDate}T04:00:00.000Z`,
    scope,
    version: 1,
  };
}

function invoice(
  id: string,
  invoiceDate: string,
  taxableValue: number,
  discountTotal = 0,
  status: TaxInvoice['status'] = 'issued',
  accountId = 'account-kestrel',
  productDescription = 'India performance product',
): TaxInvoice {
  const totalTax = taxableValue * 0.18;
  return {
    id,
    number: `INV-${id}`,
    documentKind: 'tax-invoice',
    salesOrderId: `order-${id}`,
    quoteId: `quote-${id}`,
    accountId,
    recipientTreatment: 'registered',
    recipientGstin: '27ABCDE1234F1Z5',
    placeOfSupplyStateCode: '27',
    reverseCharge: false,
    currency: 'INR',
    invoiceDate,
    dueDate: '2026-08-01',
    paymentTermId: 'payment-term-net-30',
    status,
    irpStatus: 'not-applicable',
    serviceMilestoneIds: [],
    shipmentPackageIds: [],
    lines: [line(`line-${id}`, productDescription, taxableValue, 1)],
    subtotal: taxableValue + discountTotal,
    discountTotal,
    taxPreview: taxPreview(taxableValue, totalTax),
    amountDue: taxableValue + totalTax,
    createdBy: 'user-avery',
    createdAt: `${invoiceDate}T04:00:00.000Z`,
    issuedBy: 'user-avery',
    issuedAt: `${invoiceDate}T04:00:00.000Z`,
    scope,
    version: 1,
  };
}

function receipt(id: string, receivedAt: string, amount: number, status: PaymentReceipt['status'] = 'recorded'): PaymentReceipt {
  return {
    id,
    number: `RCPT-${id}`,
    accountId: 'account-kestrel',
    receivedAt,
    method: 'upi',
    reference: `UPI-${id}`,
    amount,
    allocations: [],
    unappliedAmount: amount,
    status,
    recordedBy: 'user-avery',
    scope,
    version: 1,
  };
}

function snapshots() {
  const crm = createInitialCrmState();
  const party = createInitialPartyState();
  const revenue = getRevenueOpsSnapshot(createInitialRevenueOpsState(), {
    opportunities: crm.opportunities,
    accounts: party.accounts,
    contacts: party.contacts,
    addresses: party.addresses,
    activeUserIds: ['user-avery', 'user-priya', 'user-lee'],
  }, '2026-07-21T09:00:00.000Z');
  return {
    dashboard: getDashboardSnapshot(crm, '2026-07-21T09:00:00.000Z'),
    party: { revision: party.revision, accounts: party.accounts },
    revenue,
  };
}

describe('Commerce Performance Pack', () => {
  it('separates orders, issued billing, GST, discounts and collections without counting draft, cancelled or reversed documents', () => {
    const base = snapshots();
    const revenue = {
      ...base.revenue,
      salesOrders: [
        order('current', '2026-07-05', 1_000, 100),
        order('previous', '2026-06-05', 500, 0),
        order('cancelled', '2026-07-08', 9_000, 0, 'cancelled'),
      ],
      invoices: [
        invoice('current-a', '2026-07-05', 1_000, 100, 'issued', 'account-kestrel', 'Turmeric starter kit'),
        invoice('current-b', '2026-07-18', 500, 10, 'paid', 'account-luma', 'Coriander starter kit'),
        invoice('previous', '2026-06-10', 1_000, 40, 'partially-paid', 'account-kestrel', 'Turmeric starter kit'),
        invoice('draft', '2026-07-12', 9_000, 0, 'draft'),
        invoice('cancelled', '2026-07-13', 9_000, 0, 'cancelled'),
      ],
      paymentReceipts: [
        // 20:00 UTC is 01:30 on 1 July in India: this proves period boundaries
        // are India business dates rather than the host machine's local time.
        receipt('kolkata-boundary', '2026-06-30T20:00:00.000Z', 900, 'reconciled'),
        receipt('previous', '2026-06-10T04:00:00.000Z', 100),
        receipt('reversed', '2026-07-10T04:00:00.000Z', 9_000, 'reversed'),
      ],
    };

    const performance = buildCommercePerformance({
      ...base,
      revenue,
      period: { start: '2026-07-01', end: '2026-07-31' },
    });

    expect(performance.period).toMatchObject({ start: '2026-07-01', end: '2026-07-31', timeZone: 'Asia/Kolkata' });
    expect(performance.priorPeriod).toMatchObject({ start: '2026-06-01', end: '2026-06-30' });
    expect(performance.summary.orderedValue).toMatchObject({ current: 1_062, previous: 590, documentCount: 1, previousDocumentCount: 1, changePercent: 80 });
    expect(performance.summary.issuedBilling).toMatchObject({ current: 1_770, previous: 1_180, documentCount: 2, previousDocumentCount: 1, changePercent: 50 });
    expect(performance.summary.issuedGst).toMatchObject({ current: 270, previous: 180 });
    expect(performance.summary.orderDiscounts).toMatchObject({ current: 100, previous: 0 });
    expect(performance.summary.billingDiscounts).toMatchObject({ current: 110, previous: 40 });
    expect(performance.summary.recordedCollections).toMatchObject({ current: 900, previous: 100, documentCount: 1, previousDocumentCount: 1 });
    expect(performance.summary.orderAov).toMatchObject({ current: 1_062, previous: 590 });
    expect(performance.summary.issuedBillingAov).toMatchObject({ current: 885, previous: 1_180 });
    expect(performance.topProducts).toMatchObject({ state: 'ready' });
    expect(performance.topProducts.rows[0]).toMatchObject({ name: 'Turmeric starter kit', taxableValue: 1_000, quantity: 1, invoiceCount: 1 });
    expect(performance.topCustomers.rows[0]).toMatchObject({ name: 'Aranya Industrial Systems', issuedBilling: 1_180, invoiceCount: 1 });
  });

  it('reports withheld invoice evidence as restricted instead of rendering a false empty result', () => {
    const base = snapshots();
    const performance = buildCommercePerformance({
      ...base,
      revenue: {
        ...base.revenue,
        readProjection: {
          ...base.revenue.readProjection,
          hiddenCollections: ['invoices'],
          redactedMetrics: ['billedValue'],
        },
      },
      period: { start: '2026-07-01', end: '2026-07-31' },
    });

    expect(performance.summary.issuedBilling).toMatchObject({ state: 'restricted', current: null, restrictedCollections: ['invoices'] });
    expect(performance.summary.issuedGst).toMatchObject({ state: 'restricted', current: null });
    expect(performance.summary.billingDiscounts).toMatchObject({ state: 'restricted', current: null });
    expect(performance.topProducts).toMatchObject({ state: 'restricted', rows: [] });
    expect(performance.topCustomers).toMatchObject({ state: 'restricted', rows: [] });
  });
});
