import { describe, expect, it } from 'vitest';
import { buildWarehouseFulfilmentReadiness } from './warehouse-fulfilment';
import { createInitialRevenueOpsState } from './revenue-ops';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

const order = (scope: RevenueOpsState['scope']) => ({ id: 'order-1', number: 'SO-1', quoteId: 'quote-1', quoteNumber: 'Q-1', accountId: 'account-1', currency: 'INR' as const, orderDate: '2026-07-01', requiredBy: '2026-07-10', status: 'fulfilling' as const, fulfilmentStatus: 'in-progress' as const, lines: [{ id: 'line-1', productInterestId: 'interest-1', description: 'Filter', hsnSac: '8421', quantity: 5, unitPrice: 100, taxableValue: 500, gstRate: 18 }], subtotal: 500, discountTotal: 0, taxPreview: { treatment: 'intra-state' as const, taxableValue: 500, cgst: 45, sgst: 45, igst: 0, totalTax: 90, grandTotal: 590, determination: 'commercial-estimate' as const }, approvedQuoteVersion: 1, createdBy: 'maker', createdAt: '2026-07-01T00:00:00.000Z', scope, version: 1 });

describe('warehouse fulfilment readiness', () => {
  it('fails closed before reservation and advances evidence as the physical chain completes', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, salesOrders: [order(state.scope)] };
    expect(buildWarehouseFulfilmentReadiness(state)[0]).toMatchObject({ readiness: 'blocked', nextAction: 'reserve', blockers: ['Reservation coverage is incomplete.', 'Warehouse pick evidence is incomplete.', 'Package quantity does not cover every order line.', 'No shipment package is linked.'] });
    const reserved = { id: 'reservation-1', salesOrderId: 'order-1', lineId: 'line-1', locationId: 'location-1', productId: 'product-1', quantity: 5, status: 'packed' as const, reservedBy: 'warehouse', reservedAt: '2026-07-02T00:00:00.000Z', version: 1 };
    const shipment = { id: 'shipment-1', number: 'PKG-1', salesOrderId: 'order-1', fromLocationId: 'location-1', items: [{ reservationId: reserved.id, lineId: 'line-1', productId: 'product-1', quantity: 5 }], grossWeightKg: 1, lengthCm: 10, widthCm: 10, heightCm: 10, status: 'delivered' as const, ewayBillRequired: false, createdBy: 'warehouse', createdAt: '2026-07-03T00:00:00.000Z', version: 1 };
    state = { ...state, stockReservations: [reserved], shipmentPackages: [shipment], deliveryEvidence: [{ id: 'evidence-1', salesOrderId: 'order-1', type: 'delivery' as const, reference: 'POD-1', occurredAt: '2026-07-04', notes: 'Delivered', capturedBy: 'warehouse', capturedAt: '2026-07-04T00:00:00.000Z', scope: state.scope }] };
    expect(buildWarehouseFulfilmentReadiness(state)[0]).toMatchObject({ readiness: 'ready', nextAction: 'complete', packageCount: 1, lines: [{ orderedQuantity: 5, reservedQuantity: 5, packedQuantity: 5, shippedQuantity: 5 }] });
  });

  it('does not use another branch order as a fulfilment candidate', () => {
    const state = createInitialRevenueOpsState();
    const otherScope = { companyId: 'other-company', branchId: 'other-branch' };
    expect(buildWarehouseFulfilmentReadiness({ ...state, salesOrders: [order(otherScope)] })).toEqual([]);
  });
});
