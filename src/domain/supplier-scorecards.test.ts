import { describe, expect, it } from 'vitest';
import { buildSupplierScorecards } from './supplier-scorecards';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createSupplier, decideSupplier } from './procurement';

describe('supplier scorecards', () => {
  it('derives an explainable preferred score from on-time, fully matched evidence', () => {
    let state = createInitialRevenueOpsState();
    state = createSupplier(state, { code: 'ACME', legalName: 'Acme Industrial Supplies', stateCode: '27', email: 'ops@acme.example', paymentTermDays: 30, categories: ['MRO'], riskRating: 'low', qualificationEvidence: 'GST and quality evidence reviewed.' }, 'maker', 'supplier-1', '2026-07-01T00:00:00.000Z');
    state = decideSupplier(state, { id: 'supplier-1', decision: 'approved', remarks: 'Independent qualification approved.', expectedVersion: 1 }, 'checker', '2026-07-02T00:00:00.000Z');
    state = { ...state, purchaseOrders: [{ id: 'po-1', number: 'PO-1', supplierId: 'supplier-1', warehouseId: 'wh-1', deliveryBy: '2026-07-10', paymentTermDays: 30, status: 'received', lines: [{ id: 'line-1', itemVariantId: 'variant-1', description: 'Filter', quantity: 10, unitPrice: 100, gstRate: 18, taxableValue: 1000, taxAmount: 180, totalAmount: 1180, receivedQuantity: 10, invoicedQuantity: 10 }], taxableValue: 1000, taxAmount: 180, totalAmount: 1180, createdBy: 'maker', createdAt: '2026-07-01T00:00:00.000Z', scope: state.scope, version: 1 }], goodsReceipts: [{ id: 'grn-1', number: 'GRN-1', purchaseOrderId: 'po-1', supplierId: 'supplier-1', warehouseId: 'wh-1', receivingBinId: 'bin-1', receivedAt: '2026-07-09', lines: [], status: 'costed', receivedBy: 'warehouse', receivedAtRecorded: '2026-07-09T00:00:00.000Z', scope: state.scope, version: 1 }], threeWayMatches: [{ id: 'match-1', number: '3WM-1', purchaseOrderId: 'po-1', goodsReceiptId: 'grn-1', supplierInvoiceId: 'inv-1', quantityVariance: 0, priceVariance: 0, status: 'matched', tolerancePercent: 2, createdBy: 'maker', createdAt: '2026-07-09T00:00:00.000Z', scope: state.scope, version: 1 }] };
    const [scorecard] = buildSupplierScorecards(state, '2026-07-15T00:00:00.000Z');
    expect(scorecard).toMatchObject({ supplierId: 'supplier-1', awardedPurchaseOrders: 1, onTimeReceipts: 1, receiptCompletionPercent: 100, onTimeDeliveryPercent: 100, qualityPassPercent: 100, priceDisciplinePercent: 100, band: 'preferred', recommendation: 'retain', asOf: '2026-07-15T00:00:00.000Z' });
  });

  it('excludes suppliers and evidence from another operating scope', () => {
    let state = createInitialRevenueOpsState();
    state = createSupplier(state, { code: 'OTHER', legalName: 'Other Scope Supplier', stateCode: '27', email: 'ops@other.example', paymentTermDays: 30, categories: ['MRO'], riskRating: 'low', qualificationEvidence: 'Independent evidence reviewed.' }, 'maker', 'supplier-other', '2026-07-01T00:00:00.000Z');
    state = decideSupplier(state, { id: 'supplier-other', decision: 'approved', remarks: 'Independent qualification approved.', expectedVersion: 1 }, 'checker', '2026-07-02T00:00:00.000Z');
    state = { ...state, suppliers: state.suppliers.map((supplier) => ({ ...supplier, scope: { companyId: 'other-company', branchId: 'other-branch' } })) };
    expect(buildSupplierScorecards(state)).toEqual([]);
  });
});
