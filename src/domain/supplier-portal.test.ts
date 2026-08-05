import { describe, expect, it } from 'vitest';
import { buildSupplierPortalSnapshot } from './supplier-portal';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createSupplier, decideSupplier } from './procurement';

describe('supplier portal projection', () => {
  it('exposes only the approved supplier commitment and reconciliation evidence', () => {
    let state = createInitialRevenueOpsState();
    state = createSupplier(state, { code: 'ACME', legalName: 'Acme Industrial Supplies', stateCode: '27', email: 'ops@acme.example', paymentTermDays: 30, categories: ['MRO'], riskRating: 'low', qualificationEvidence: 'Qualification complete.' }, 'maker', 'supplier-1', '2026-07-01T00:00:00.000Z');
    state = decideSupplier(state, { id: 'supplier-1', decision: 'approved', remarks: 'Approved.', expectedVersion: 1 }, 'checker', '2026-07-02T00:00:00.000Z');
    state = {
      ...state,
      purchaseOrders: [{ id: 'po-1', number: 'PO-1', supplierId: 'supplier-1', warehouseId: 'wh-1', deliveryBy: '2026-07-10', paymentTermDays: 30, status: 'approved', lines: [{ id: 'line-1', itemVariantId: 'variant-1', description: 'Filter', quantity: 10, unitPrice: 100, gstRate: 18, taxableValue: 1000, taxAmount: 180, totalAmount: 1180, receivedQuantity: 5, invoicedQuantity: 0 }], taxableValue: 1000, taxAmount: 180, totalAmount: 1180, createdBy: 'internal-user', createdAt: '2026-07-01T00:00:00.000Z', scope: state.scope, version: 1 }],
      goodsReceipts: [{ id: 'grn-1', number: 'GRN-1', purchaseOrderId: 'po-1', supplierId: 'supplier-1', warehouseId: 'wh-1', receivingBinId: 'bin-1', receivedAt: '2026-07-09', lines: [{ id: 'grn-line', purchaseOrderLineId: 'line-1', itemVariantId: 'variant-1', quantity: 5, unitPrice: 100, inventoryReference: 'INV-1', serialNumbers: [] }], status: 'received', receivedBy: 'warehouse', receivedAtRecorded: '2026-07-09T00:00:00.000Z', scope: state.scope, version: 1 }],
      threeWayMatches: [{ id: 'match-1', number: '3WM-1', purchaseOrderId: 'po-1', goodsReceiptId: 'grn-1', supplierInvoiceId: 'inv-1', quantityVariance: 0, priceVariance: 0, status: 'matched', tolerancePercent: 2, createdBy: 'internal-user', createdAt: '2026-07-09T00:00:00.000Z', scope: state.scope, version: 1 }],
    };
    const projection = buildSupplierPortalSnapshot(state, 'supplier-1', '2026-07-15T00:00:00.000Z');
    expect(projection).toMatchObject({ supplierId: 'supplier-1', supplierCode: 'ACME', generatedAt: '2026-07-15T00:00:00.000Z', purchaseOrders: [{ number: 'PO-1', status: 'approved', totalAmount: 1180 }], receipts: [{ number: 'GRN-1', status: 'received' }], matches: [{ number: '3WM-1', status: 'matched' }] });
    expect(projection?.purchaseOrders[0]).not.toHaveProperty('createdBy');
    expect(projection?.receipts[0]).not.toHaveProperty('warehouseId');
    expect(projection?.matches[0]).not.toHaveProperty('createdBy');
  });

  it('excludes another supplier and refuses an out-of-scope identity', () => {
    let state = createInitialRevenueOpsState();
    state = createSupplier(state, { code: 'ACME', legalName: 'Acme', stateCode: '27', email: 'ops@acme.example', paymentTermDays: 30, categories: ['MRO'], riskRating: 'low', qualificationEvidence: 'Qualification complete.' }, 'maker', 'supplier-1', '2026-07-01T00:00:00.000Z');
    state = decideSupplier(state, { id: 'supplier-1', decision: 'approved', remarks: 'Approved.', expectedVersion: 1 }, 'checker', '2026-07-02T00:00:00.000Z');
    state = createSupplier(state, { code: 'OTHER', legalName: 'Other', stateCode: '27', email: 'ops@other.example', paymentTermDays: 30, categories: ['MRO'], riskRating: 'low', qualificationEvidence: 'Qualification complete.' }, 'maker', 'supplier-2', '2026-07-01T00:00:00.000Z');
    state = decideSupplier(state, { id: 'supplier-2', decision: 'approved', remarks: 'Approved.', expectedVersion: 1 }, 'checker', '2026-07-02T00:00:00.000Z');
    state = { ...state, purchaseOrders: [{ id: 'po-other', number: 'PO-OTHER', supplierId: 'supplier-2', warehouseId: 'wh-1', deliveryBy: '2026-07-10', paymentTermDays: 30, status: 'approved', lines: [], taxableValue: 0, taxAmount: 0, totalAmount: 0, createdBy: 'internal', createdAt: '2026-07-01T00:00:00.000Z', scope: state.scope, version: 1 }] };
    expect(buildSupplierPortalSnapshot(state, 'supplier-1')?.purchaseOrders).toEqual([]);
    expect(buildSupplierPortalSnapshot(state, 'missing')).toBeNull();
    const otherScope = { ...state, suppliers: state.suppliers.map((supplier) => supplier.id === 'supplier-1' ? { ...supplier, scope: { companyId: 'other-company', branchId: 'other-branch' } } : supplier) };
    expect(buildSupplierPortalSnapshot(otherScope, 'supplier-1')).toBeNull();
  });
});
