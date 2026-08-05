import { describe, expect, it } from 'vitest';
import { buildRetailReadiness } from './retail-readiness';
import { createInitialRevenueOpsState } from './revenue-ops';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

const order = (scope: RevenueOpsState['scope']) => ({ id: 'order-1', number: 'SO-1', quoteId: 'quote-1', quoteNumber: 'Q-1', accountId: 'account-1', currency: 'INR' as const, orderDate: '2026-07-01', requiredBy: '2026-07-02', status: 'confirmed' as const, fulfilmentStatus: 'planned' as const, lines: [{ id: 'line-1', productInterestId: 'interest-1', description: 'Retail item', hsnSac: '8421', quantity: 1, unitPrice: 100, taxableValue: 100, gstRate: 18, catalogProductId: 'product-1' }], subtotal: 100, discountTotal: 0, taxPreview: { treatment: 'intra-state' as const, taxableValue: 100, cgst: 9, sgst: 9, igst: 0, totalTax: 18, grandTotal: 118, determination: 'commercial-estimate' as const }, approvedQuoteVersion: 1, createdBy: 'maker', createdAt: '2026-07-01T00:00:00.000Z', scope, version: 1 });

describe('retail readiness', () => {
  it('requires barcode and verified tax evidence before checkout', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, salesOrders: [order(state.scope)], products: [{ id: 'product-1', sku: 'SKU-001', name: 'Retail item', description: 'Goods', kind: 'goods' as const, uom: 'EA', taxCodeId: 'tax-1', effectiveFrom: '2026-01-01', active: true, scope: state.scope, version: 1 }], taxCodes: [{ id: 'tax-1', code: '8421', kind: 'HSN' as const, description: 'Filter', gstRate: 18, cessRate: 0, effectiveFrom: '2026-01-01', sourceLabel: 'GST', sourceUrl: 'https://gst.gov.in', reviewStatus: 'draft' as const, scope: state.scope, version: 1 }] };
    expect(buildRetailReadiness(state)[0]).toMatchObject({ readiness: 'blocked', barcodeLineCount: 1, taxReadyLineCount: 0, nextAction: 'tax-review' });
    state = { ...state, taxCodes: [{ ...state.taxCodes[0]!, reviewStatus: 'verified' as const }] };
    expect(buildRetailReadiness(state)[0]).toMatchObject({ readiness: 'ready', taxReadyLineCount: 1, nextAction: 'checkout' });
  });

  it('flags recorded-but-unreconciled UPI evidence and cross-scope orders are excluded', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, salesOrders: [order(state.scope)], products: [{ id: 'product-1', sku: 'SKU-001', name: 'Retail item', description: 'Goods', kind: 'goods' as const, uom: 'EA', taxCodeId: 'tax-1', effectiveFrom: '2026-01-01', active: true, scope: state.scope, version: 1 }], taxCodes: [{ id: 'tax-1', code: '8421', kind: 'HSN' as const, description: 'Filter', gstRate: 18, cessRate: 0, effectiveFrom: '2026-01-01', sourceLabel: 'GST', sourceUrl: 'https://gst.gov.in', reviewStatus: 'verified' as const, scope: state.scope, version: 1 }], invoices: [{ id: 'invoice-1', number: 'INV-1', documentKind: 'tax-invoice' as const, salesOrderId: 'order-1', quoteId: 'quote-1', accountId: 'account-1', recipientTreatment: 'unregistered' as const, recipientGstin: '', placeOfSupplyStateCode: '27', reverseCharge: false, currency: 'INR' as const, invoiceDate: '2026-07-01', dueDate: '2026-07-31', paymentTermId: 'term-1', status: 'issued' as const, irpStatus: 'not-applicable' as const, serviceMilestoneIds: [], shipmentPackageIds: [], lines: order(state.scope).lines, subtotal: 100, discountTotal: 0, taxPreview: order(state.scope).taxPreview, amountDue: 118, createdBy: 'maker', createdAt: '2026-07-01T00:00:00.000Z', scope: state.scope, version: 1 }], receivables: [{ id: 'receivable-1', invoiceId: 'invoice-1', accountId: 'account-1', invoiceNumber: 'INV-1', invoiceDate: '2026-07-01', dueDate: '2026-07-31', originalAmount: 118, adjustmentAmount: 0, paidAmount: 0, outstandingAmount: 0, status: 'paid' as const, scope: state.scope, version: 1 }], paymentReceipts: [{ id: 'receipt-1', number: 'RCPT-1', accountId: 'account-1', receivedAt: '2026-07-02T00:00:00.000Z', method: 'upi' as const, reference: 'UPI-123', amount: 118, allocations: [{ receivableId: 'receivable-1', amount: 118 }], unappliedAmount: 0, status: 'recorded' as const, recordedBy: 'maker', scope: state.scope, version: 1 }] };
    expect(buildRetailReadiness(state)[0]).toMatchObject({ readiness: 'review', paymentMethods: ['upi'], nextAction: 'reconcile-payment' });
    expect(buildRetailReadiness({ ...state, salesOrders: [order({ companyId: 'other-company', branchId: 'other-branch' })] })).toEqual([]);
  });
});
