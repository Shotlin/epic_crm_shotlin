import { describe, expect, it } from 'vitest';
import { createInitialCrmState } from './crm';
import { createInitialPartyState } from './party';
import { convertQuoteToSalesOrder, decideQuoteApproval, submitQuoteForApproval } from './commercial';
import { createInitialRevenueOpsState, createQuote } from './revenue-ops';
import { createInvoiceDraft, issueInvoice } from './order-to-cash';
import {
  createGstRegistration,
  createPlaceOfSupplyReview,
  createReturnAuthorization,
  createShipmentPackage,
  createStockLocation,
  decidePlaceOfSupplyReview,
  decideReturnAuthorization,
  inspectReturn,
  prepareStatutoryExchange,
  receiveReturn,
  recordStatutoryResponse,
  recordStockMovement,
  reserveStock,
  submitStatutoryExchange,
  transitionShipment,
} from './fulfilment-control';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

function context() {
  const crm = createInitialCrmState();
  const party = createInitialPartyState();
  return { opportunities: crm.opportunities, accounts: party.accounts, contacts: party.contacts, addresses: party.addresses, activeUserIds: ['user-avery', 'user-priya', 'user-lee'] };
}

function goodsOrder(): RevenueOpsState {
  const initial = createInitialRevenueOpsState();
  const goods: RevenueOpsState = {
    ...initial,
    profile: { ...initial.profile, gstRegistered: true, gstin: '27ABCDE1234F1Z5' },
    products: initial.products.map((product) => product.id === 'product-distributor-platform' ? { ...product, kind: 'goods' as const, uom: 'UNIT' } : product),
    productInterests: initial.productInterests.map((interest) => interest.id === 'interest-sahyadri-platform' ? { ...interest, kind: 'goods' as const, quantity: 10, unitPrice: 480000 } : interest),
  };
  const quoted = createQuote(goods, { opportunityId: 'opp-211', placeOfSupplyStateCode: '27', recipientTreatment: 'registered', recipientGstin: '27AAECS1234K1Z2', validUntil: '2026-08-31', priceListId: 'price-list-india-direct-2627', discountPolicyIds: ['discount-partner-launch-2627'] }, context(), 'user-avery', 'quote-ship-1', '2026-07-15T12:00:00.000Z');
  const submitted = submitQuoteForApproval(quoted, { id: 'quote-ship-1', expectedVersion: 1, reason: 'Approve governed goods order.' }, 'user-avery', ['user-priya'], 'approval-ship-1', '2026-07-15T13:00:00.000Z');
  const approved = decideQuoteApproval(submitted, { requestId: 'approval-ship-1', decision: 'approved', remarks: 'Approved for fulfilment.', expectedVersion: 1 }, 'user-priya', '2026-07-15T14:00:00.000Z');
  return convertQuoteToSalesOrder(approved, { quoteId: 'quote-ship-1', expectedVersion: 3, orderDate: '2026-07-16', requiredBy: '2026-08-31' }, 'user-avery', 'user-avery', 'order-ship-1', '2026-07-16T06:00:00.000Z');
}

function stocked(): RevenueOpsState {
  const registered = createGstRegistration(goodsOrder(), { label: 'Maharashtra principal place', gstin: '27ABCDE1234F1Z5', stateCode: '27', branchCode: 'MH-MUM', address: '27 Maker Tower, Lower Parel, Mumbai 400013', primary: true }, 'gst-mh');
  const located = createStockLocation(registered, { code: 'MUM-FG', name: 'Mumbai finished goods', stateCode: '27', gstRegistrationId: 'gst-mh' }, 'location-mum');
  return recordStockMovement(located, { locationId: 'location-mum', productId: 'product-distributor-platform', type: 'receipt', quantity: 10, reference: 'GRN-2026-0001', occurredAt: '2026-07-16T07:00:00.000Z' }, 'user-avery', 'movement-grn');
}

function reviewed(state: RevenueOpsState): RevenueOpsState {
  const requested = createPlaceOfSupplyReview(state, { salesOrderId: 'order-ship-1', supplierRegistrationId: 'gst-mh', shipFromStateCode: '27', shipToStateCode: '27', placeOfSupplyStateCode: '27', basis: 'movement-terminates', rationale: 'Goods movement terminates at the registered recipient delivery location in Maharashtra.' }, 'user-avery', 'pos-review-1', '2026-07-16T08:00:00.000Z');
  return decidePlaceOfSupplyReview(requested, { id: 'pos-review-1', decision: 'approved', evidence: 'Recipient GSTIN and ship-to address verified against the order.', expectedVersion: 1 }, 'user-priya', '2026-07-16T08:30:00.000Z');
}

function packaged(): RevenueOpsState {
  const state = reviewed(stocked());
  const lineId = state.salesOrders[0]!.lines[0]!.id;
  const reserved = reserveStock(state, { salesOrderId: 'order-ship-1', lineId, locationId: 'location-mum', quantity: 10 }, 'user-avery', 'reservation-1', '2026-07-16T09:00:00.000Z');
  const packageState = createShipmentPackage(reserved, { salesOrderId: 'order-ship-1', fromLocationId: 'location-mum', reservationIds: ['reservation-1'], grossWeightKg: 120, lengthCm: 80, widthCm: 60, heightCm: 50, ewayBillRequired: true }, 'user-avery', 'shipment-1', '2026-07-16T09:30:00.000Z');
  return transitionShipment(packageState, { id: 'shipment-1', toStatus: 'packed', location: 'Mumbai finished goods', notes: 'Tamper seal SHP-001 applied after pack verification.', expectedVersion: 1 }, 'user-avery', '2026-07-16T10:00:00.000Z');
}

function invoiced(state: RevenueOpsState): RevenueOpsState {
  const drafted = createInvoiceDraft(state, { salesOrderId: 'order-ship-1', documentKind: 'tax-invoice', invoiceDate: '2026-07-16', paymentTermId: 'payment-term-net-30', reverseCharge: false, basis: 'shipment-package', milestoneIds: [], shipmentPackageIds: ['shipment-1'] }, 'user-avery', 'invoice-ship-1', '2026-07-16T10:30:00.000Z');
  return issueInvoice(drafted, { id: 'invoice-ship-1', expectedVersion: 1 }, 'user-priya', '2026-07-16T11:00:00.000Z');
}

function acknowledged(state: RevenueOpsState, kind: 'e-invoice' | 'e-way-bill', sourceId: string, exchangeId: string): RevenueOpsState {
  const prepared = prepareStatutoryExchange(state, { kind, sourceId, gstRegistrationId: 'gst-mh' }, 'user-priya', exchangeId, '2026-07-16T11:10:00.000Z');
  const submitted = submitStatutoryExchange(prepared, { id: exchangeId, requestReference: `REQ-${exchangeId}`, expectedVersion: 1 }, 'user-priya', '2026-07-16T11:11:00.000Z');
  return recordStatutoryResponse(submitted, { id: exchangeId, outcome: 'acknowledged', externalNumber: kind === 'e-invoice' ? 'IRN-ABC-20260716' : '181000000001', acknowledgementNumber: `ACK-${exchangeId}`, acknowledgedAt: '2026-07-16T11:12:00.000Z', qrPayload: kind === 'e-invoice' ? 'SIGNED-QR-PAYLOAD' : undefined, expectedVersion: 2 });
}

function dispatched(): RevenueOpsState {
  let state = invoiced(packaged());
  state = acknowledged(state, 'e-invoice', 'invoice-ship-1', 'exchange-irp');
  state = transitionShipment(state, { id: 'shipment-1', toStatus: 'ready-to-dispatch', carrierAdapterId: 'carrier-manual', trackingNumber: 'LR-MUM-260716-01', vehicleNumber: 'MH12AB1234', location: 'Mumbai dispatch bay', notes: 'Invoice and place-of-supply review reconciled; movement particulars frozen for Part B.', expectedVersion: 2 }, 'user-priya', '2026-07-16T11:30:00.000Z');
  state = acknowledged(state, 'e-way-bill', 'shipment-1', 'exchange-ewb');
  return transitionShipment(state, { id: 'shipment-1', toStatus: 'dispatched', carrierAdapterId: 'carrier-manual', trackingNumber: 'LR-MUM-260716-01', vehicleNumber: 'MH12AB1234', location: 'Mumbai dispatch gate', notes: 'Carrier handover completed against signed manifest.', expectedVersion: 3 }, 'user-avery', '2026-07-16T12:00:00.000Z');
}

describe('precision fulfilment control', () => {
  it('governs multi-GSTIN place-of-supply review and allocation-safe stock reservations', () => {
    let state = stocked();
    expect(state.gstRegistrations[0]).toMatchObject({ gstin: '27ABCDE1234F1Z5', primary: true });
    expect(state.stockPositions[0]).toMatchObject({ onHand: 10, reserved: 0, available: 10 });
    const requested = createPlaceOfSupplyReview(state, { salesOrderId: 'order-ship-1', supplierRegistrationId: 'gst-mh', shipFromStateCode: '27', shipToStateCode: '29', placeOfSupplyStateCode: '29', basis: 'movement-terminates', rationale: 'Movement terminates at the customer warehouse in Karnataka.' }, 'user-avery', 'pos-review-x');
    expect(requested.placeOfSupplyReviews[0]).toMatchObject({ treatment: 'inter-state', status: 'pending' });
    expect(() => decidePlaceOfSupplyReview(requested, { id: 'pos-review-x', decision: 'approved', evidence: 'Self review attempt.', expectedVersion: 1 }, 'user-avery')).toThrow('cannot approve');
    state = decidePlaceOfSupplyReview(requested, { id: 'pos-review-x', decision: 'approved', evidence: 'Destination and GST registration independently verified.', expectedVersion: 1 }, 'user-priya');
    const lineId = state.salesOrders[0]!.lines[0]!.id;
    state = reserveStock(state, { salesOrderId: 'order-ship-1', lineId, locationId: 'location-mum', quantity: 6 }, 'user-avery', 'reservation-x');
    expect(state.stockPositions[0]).toMatchObject({ onHand: 10, reserved: 6, available: 4 });
    expect(() => reserveStock(state, { salesOrderId: 'order-ship-1', lineId, locationId: 'location-mum', quantity: 5 }, 'user-avery')).toThrow('sales-order line quantity');
  });

  it('separates package invoicing, portal acknowledgement, and physical dispatch', () => {
    let state = invoiced(packaged());
    expect(state.invoices[0]).toMatchObject({ status: 'issued', irpStatus: 'required-review', shipmentPackageIds: ['shipment-1'] });
    state = acknowledged(state, 'e-invoice', 'invoice-ship-1', 'exchange-irp');
    expect(state.invoices[0]).toMatchObject({ irpStatus: 'registered', irn: 'IRN-ABC-20260716' });
    state = transitionShipment(state, { id: 'shipment-1', toStatus: 'ready-to-dispatch', carrierAdapterId: 'carrier-manual', trackingNumber: 'LR-2026-001', vehicleNumber: 'MH12AB1234', location: 'Dispatch bay', notes: 'Movement and Part B particulars frozen before portal submission.', expectedVersion: 2 }, 'user-priya');
    state = acknowledged(state, 'e-way-bill', 'shipment-1', 'exchange-ewb');
    state = transitionShipment(state, { id: 'shipment-1', toStatus: 'dispatched', carrierAdapterId: 'carrier-manual', trackingNumber: 'LR-2026-001', vehicleNumber: 'MH12AB1234', location: 'Mumbai gate', notes: 'Goods handed to carrier against manifest.', expectedVersion: 3 }, 'user-avery');
    expect(state.shipmentPackages[0]).toMatchObject({ status: 'dispatched', trackingNumber: 'LR-2026-001' });
    expect(state.stockPositions[0]).toMatchObject({ onHand: 0, reserved: 0, available: 0 });
    expect(state.stockReservations[0]).toMatchObject({ status: 'consumed' });
    expect(state.statutoryExchanges).toHaveLength(2);
  });

  it('records adapter failure without claiming registration and supports evidence-preserving retry', () => {
    let state = invoiced(packaged());
    state = prepareStatutoryExchange(state, { kind: 'e-invoice', sourceId: 'invoice-ship-1', gstRegistrationId: 'gst-mh' }, 'user-priya', 'exchange-fail');
    state = submitStatutoryExchange(state, { id: 'exchange-fail', requestReference: 'IRP-REQ-FAIL-1', expectedVersion: 1 }, 'user-priya');
    state = recordStatutoryResponse(state, { id: 'exchange-fail', outcome: 'failed', errorCode: 'IRP-2150', errorMessage: 'Recipient registration validation failed at the adapter boundary.', expectedVersion: 2 });
    expect(state.statutoryExchanges[0]).toMatchObject({ status: 'failed', errorCode: 'IRP-2150', version: 3 });
    expect(state.invoices[0]).toMatchObject({ irpStatus: 'failed' });
    state = submitStatutoryExchange(state, { id: 'exchange-fail', requestReference: 'IRP-REQ-RETRY-2', expectedVersion: 3 }, 'user-priya');
    state = recordStatutoryResponse(state, { id: 'exchange-fail', outcome: 'acknowledged', externalNumber: 'IRN-RETRY-SUCCESS', acknowledgementNumber: 'ACK-RETRY-2', acknowledgedAt: '2026-07-16T12:00:00.000Z', expectedVersion: 4 });
    expect(state.statutoryExchanges[0]).toMatchObject({ status: 'acknowledged', externalNumber: 'IRN-RETRY-SUCCESS', version: 5 });
  });

  it('restocks only an independently authorised delivered return', () => {
    let state = dispatched();
    state = transitionShipment(state, { id: 'shipment-1', toStatus: 'in-transit', location: 'Pune linehaul hub', notes: 'Carrier scan received through the neutral event boundary.', expectedVersion: 4 }, 'user-avery', '2026-07-16T16:00:00.000Z');
    state = transitionShipment(state, { id: 'shipment-1', toStatus: 'delivered', location: 'Customer receiving dock', notes: 'Proof of delivery reference captured.', expectedVersion: 5 }, 'user-avery', '2026-07-17T10:00:00.000Z');
    const line = state.salesOrders[0]!.lines[0]!;
    state = createReturnAuthorization(state, { shipmentPackageId: 'shipment-1', reason: 'Two sealed units rejected after receiving inspection.', items: [{ lineId: line.id, productId: line.catalogProductId!, quantity: 2 }] }, 'user-avery', 'return-1', '2026-07-18T09:00:00.000Z');
    expect(() => decideReturnAuthorization(state, { id: 'return-1', decision: 'approved', expectedVersion: 1 }, 'user-avery')).toThrow('cannot decide');
    state = decideReturnAuthorization(state, { id: 'return-1', decision: 'approved', expectedVersion: 1 }, 'user-priya', '2026-07-18T10:00:00.000Z');
    state = receiveReturn(state, { id: 'return-1', reference: 'RTN-GRN-2026-01', receivedAt: '2026-07-19T11:00:00.000Z', expectedVersion: 2 }, 'user-avery');
    expect(state.returnAuthorizations[0]).toMatchObject({ status: 'received', inspectionStatus: 'pending', receivedBy: 'user-avery' });
    state = inspectReturn(state, { id: 'return-1', disposition: 'restock', evidenceReference: 'QC-RMA-001', notes: 'Sealed units passed receiving inspection.', expectedVersion: 3 }, 'user-priya', '2026-07-19T13:00:00.000Z');
    expect(state.stockPositions[0]).toMatchObject({ onHand: 2, reserved: 0, available: 2 });
    expect(state.returnAuthorizations[0]).toMatchObject({ status: 'closed', inspectionStatus: 'passed', disposition: 'restock', inspectedBy: 'user-priya', version: 4 });
    expect(state.shipmentPackages[0]).toMatchObject({ status: 'returned' });
  });

  it('removes failed returned goods from saleable stock under an independent disposition', () => {
    let state = dispatched();
    state = transitionShipment(state, { id: 'shipment-1', toStatus: 'in-transit', location: 'Pune linehaul hub', notes: 'Carrier scan received.', expectedVersion: 4 }, 'user-avery', '2026-07-16T16:00:00.000Z');
    state = transitionShipment(state, { id: 'shipment-1', toStatus: 'delivered', location: 'Customer dock', notes: 'Proof of delivery captured.', expectedVersion: 5 }, 'user-avery', '2026-07-17T10:00:00.000Z');
    const line = state.salesOrders[0]!.lines[0]!;
    state = createReturnAuthorization(state, { shipmentPackageId: 'shipment-1', reason: 'Damaged packaging on arrival.', items: [{ lineId: line.id, productId: line.catalogProductId!, quantity: 1 }] }, 'user-avery', 'return-quarantine', '2026-07-18T09:00:00.000Z');
    state = decideReturnAuthorization(state, { id: 'return-quarantine', decision: 'approved', expectedVersion: 1 }, 'user-priya', '2026-07-18T10:00:00.000Z');
    state = receiveReturn(state, { id: 'return-quarantine', reference: 'RTN-GRN-2026-02', receivedAt: '2026-07-19T11:00:00.000Z', expectedVersion: 2 }, 'user-avery');
    state = inspectReturn(state, { id: 'return-quarantine', disposition: 'quarantine', evidenceReference: 'QC-RMA-002', notes: 'Seal broken; hold for supplier disposition.', expectedVersion: 3 }, 'user-priya', '2026-07-19T13:00:00.000Z');
    expect(state.returnAuthorizations[0]).toMatchObject({ status: 'closed', inspectionStatus: 'failed', disposition: 'quarantine' });
    expect(state.stockPositions[0]).toMatchObject({ onHand: 0, available: 0 });
    expect(state.stockMovements[0]).toMatchObject({ type: 'adjustment-out', reference: 'RMA-RMA-26-27-00001 / quarantine' });
  });
});
