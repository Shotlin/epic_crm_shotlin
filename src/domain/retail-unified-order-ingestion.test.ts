import { describe, expect, it } from 'vitest';
import {
  createRetailOrderIngestionState,
  decideRetailOrderFulfilmentHandoff,
  digestRetailOrderSourceEvent,
  ingestRetailOrderSourceEvent,
  prepareRetailOrderFulfilmentHandoff,
  prepareRetailOrderForGovernedHandoff,
  prepareRetailOrderHubHandoff,
  recordRetailOrderHubHandoffResult,
  reserveRetailUnifiedOrderStock,
  createRetailUnifiedOrderPickTasks,
  completeRetailUnifiedOrderPickTasks,
  createRetailUnifiedOrderShipmentPackage,
  completeRetailUnifiedOrderShipmentPackage,
  prepareRetailUnifiedOrderDispatch,
  dispatchRetailUnifiedOrder,
  confirmRetailUnifiedOrderDelivery,
  reconcileRetailUnifiedOrderRto,
  reconcileRetailUnifiedOrderReturn,
  recordRetailUnifiedOrderCarrierCallback,
  type RetailOrderSourceEvent,
} from './retail-unified-order-ingestion';
import { createInitialRevenueOpsState } from './revenue-ops';
import { transitionWarehouseTask } from './inventory-warehouse';
import { createShipmentPackage } from './fulfilment-control';

const event = (overrides: Partial<RetailOrderSourceEvent> = {}): RetailOrderSourceEvent => ({
  source: {
    channel: 'website',
    connectionId: 'bakaloo-storefront-production',
  },
  externalOrderId: 'order-1001',
  externalEventId: 'event-1001',
  occurredAt: '2026-08-03T08:00:00.000Z',
  status: 'accepted',
  currency: 'INR',
  totalAmountPaise: 12_500,
  lines: [
    {
      externalLineId: 'line-1',
      sku: 'BAK-APPLE-1KG',
      itemVariantId: 'variant-apple-1kg',
      quantity: 1,
      unitAmountPaise: 12_500,
    },
  ],
  ...overrides,
});

describe('retail unified order ingestion', () => {
  it('records a shadow-imported external order with a source digest and never reserves stock', () => {
    const sourceEvent = event();
    const result = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), sourceEvent, {
      mode: 'shadow',
      receivedAt: '2026-08-03T08:01:00.000Z',
    });

    expect(result.outcome).toBe('recorded');
    expect(result.state.orders).toHaveLength(1);
    expect(result.state.orders[0]).toMatchObject({
      externalOrderId: 'order-1001',
      observedStatus: 'accepted',
      handlingState: 'shadow-observed',
      sourceDigest: digestRetailOrderSourceEvent(sourceEvent),
    });
    expect(result.state.reservationIntents).toEqual([]);
    expect(result.state.hubHandoffs).toEqual([]);
  });

  it('is idempotent when the same source event is received again', () => {
    const sourceEvent = event();
    const first = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), sourceEvent, { mode: 'shadow' });
    const replay = ingestRetailOrderSourceEvent(first.state, sourceEvent, { mode: 'shadow' });

    expect(replay.outcome).toBe('idempotent');
    expect(replay.state).toBe(first.state);
    expect(replay.state.orders[0]?.sourceEvents).toHaveLength(1);
  });

  it('keeps a changed payload for the same source event out of the order and raises an auditable conflict', () => {
    const first = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event(), { mode: 'shadow' });
    const changedPayload = event({ totalAmountPaise: 13_500 });
    const result = ingestRetailOrderSourceEvent(first.state, changedPayload, { mode: 'shadow' });

    expect(result.outcome).toBe('conflicted');
    expect(result.state.orders[0]).toMatchObject({ totalAmountPaise: 12_500, observedStatus: 'accepted' });
    expect(result.state.conflicts[0]).toMatchObject({
      kind: 'source-event-digest-mismatch',
      externalOrderId: 'order-1001',
      externalEventId: 'event-1001',
      status: 'open',
    });
  });

  it('creates a governed reservation intent only for mapped accepted stock, without mutating stock', () => {
    const result = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event(), {
      mode: 'governed',
      receivedAt: '2026-08-03T08:01:00.000Z',
    });

    expect(result.outcome).toBe('recorded');
    expect(result.state.orders[0]).toMatchObject({ handlingState: 'awaiting-stock-reservation' });
    expect(result.state.reservationIntents).toEqual([
      expect.objectContaining({
        externalOrderId: 'order-1001',
        status: 'pending',
        lines: [{ itemVariantId: 'variant-apple-1kg', quantity: 1 }],
      }),
    ]);
  });

  it('blocks a governed stock boundary when an accepted line is not mapped locally', () => {
    const result = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event({
      lines: [{ externalLineId: 'line-1', sku: 'BAK-UNKNOWN', quantity: 1, unitAmountPaise: 12_500 }],
    }), { mode: 'governed' });

    expect(result.outcome).toBe('conflicted');
    expect(result.state.reservationIntents).toEqual([]);
    expect(result.state.conflicts[0]).toMatchObject({ kind: 'unmapped-stock-line', status: 'open' });
  });

  it('plans cancellation, return, and RTO reconciliation without directly changing stock, money, or provider state', () => {
    const cancelled = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event({ status: 'cancelled' }), { mode: 'shadow' });
    const returned = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event({ externalOrderId: 'order-1002', externalEventId: 'event-1002', status: 'returned' }), { mode: 'shadow' });
    const rto = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event({ externalOrderId: 'order-1003', externalEventId: 'event-1003', status: 'rto' }), { mode: 'shadow' });

    expect(cancelled.state.reconciliationRequirements[0]).toMatchObject({ kind: 'cancellation', status: 'required', actions: ['release-or-confirm-no-stock-reservation', 'reconcile-payment-or-wallet-reversal'] });
    expect(returned.state.reconciliationRequirements[0]).toMatchObject({ kind: 'return', status: 'required', actions: ['inspect-and-receive-stock', 'reconcile-credit-note-or-refund'] });
    expect(rto.state.reconciliationRequirements[0]).toMatchObject({ kind: 'rto', status: 'required', actions: ['confirm-returned-custody', 'reconcile-carrier-and-payment'] });
    expect([...cancelled.state.reservationIntents, ...returned.state.reservationIntents, ...rto.state.reservationIntents]).toEqual([]);
  });

  it('closes an authoritative RTO with four evidence references only, without stock, payment, or tax mutation', () => {
    const observed = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event({ externalOrderId: 'order-rto-1001', externalEventId: 'event-rto-1001', status: 'rto' }), { mode: 'shadow', actorId: 'observer' });
    const order = observed.state.orders[0]!;
    const base = createInitialRevenueOpsState();
    const state = {
      ...base,
      retailUnifiedOrderIngestion: {
        ...observed.state,
        fulfilmentHandoffs: [{ id: 'fulfilment-rto-1001', orderId: order.id, sourceDigest: order.sourceDigest, salesOrderId: 'sales-order-rto-1001', status: 'approved', preparedBy: 'mapper', preparedAt: '2026-08-03T08:10:00.000Z', evidenceReference: 'mapping-rto-1001', version: 1 } as never],
        carrierDispatchExecutions: [{ id: 'dispatch-rto-1001', orderId: order.id, sourceDigest: order.sourceDigest, salesOrderId: 'sales-order-rto-1001', shipmentPackageId: 'shipment-rto-1001', status: 'dispatched', handoverEvidenceReference: 'handover-rto-1001', dispatchedBy: 'carrier-operator', dispatchedAt: '2026-08-03T08:30:00.000Z', version: 1 } as never],
        rtoReconciliationExecutions: [],
        returnReconciliationExecutions: [],
      },
    };
    const before = { stock: structuredClone(state.stockReservations), payments: structuredClone(state.paymentReceipts), tax: structuredClone(state.creditDebitNotes), delivery: structuredClone(state.deliveryEvidence) };
    const reconciled = reconcileRetailUnifiedOrderRto(state, {
      orderId: order.id,
      expectedSourceDigest: order.sourceDigest,
      carrierRtoReference: 'carrier-rto-manifest-1001',
      inventoryEvidenceReference: 'return-receipt-1001',
      paymentEvidenceReference: 'refund-review-1001',
      taxEvidenceReference: 'credit-note-workpaper-1001',
    }, 'rto-reviewer', '2026-08-03T13:00:00.000Z');
    expect(reconciled.retailUnifiedOrderIngestion?.rtoReconciliationExecutions[0]).toMatchObject({ status: 'reconciled', carrierRtoReference: 'carrier-rto-manifest-1001', inventoryEvidenceReference: 'return-receipt-1001', paymentEvidenceReference: 'refund-review-1001', taxEvidenceReference: 'credit-note-workpaper-1001', reconciledBy: 'rto-reviewer' });
    expect(reconciled.retailUnifiedOrderIngestion?.orders[0]).toMatchObject({ handlingState: 'rto-reconciled' });
    expect({ stock: reconciled.stockReservations, payments: reconciled.paymentReceipts, tax: reconciled.creditDebitNotes, delivery: reconciled.deliveryEvidence }).toEqual(before);
    expect(reconcileRetailUnifiedOrderRto(reconciled, { orderId: order.id, expectedSourceDigest: order.sourceDigest, carrierRtoReference: 'ignored-on-replay', inventoryEvidenceReference: 'ignored-on-replay', paymentEvidenceReference: 'ignored-on-replay', taxEvidenceReference: 'ignored-on-replay' }, 'rto-reviewer')).toBe(reconciled);
    expect(() => reconcileRetailUnifiedOrderRto(state, { orderId: order.id, expectedSourceDigest: order.sourceDigest, carrierRtoReference: 'carrier-rto-manifest-1001', inventoryEvidenceReference: 'return-receipt-1001', paymentEvidenceReference: 'refund-review-1001', taxEvidenceReference: 'credit-note-workpaper-1001' }, 'carrier-operator')).toThrow(/maker/i);
  });

  it('links an external returned order to completed local refund and matched GST workpaper without repeating mutations', () => {
    const observed = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event({ externalOrderId: 'order-return-1001', externalEventId: 'event-return-1001', status: 'returned' }), { mode: 'shadow', actorId: 'observer' });
    const order = observed.state.orders[0]!;
    const base = createInitialRevenueOpsState();
    const returnCaseId = 'return-local-1001';
    const returnCaseNumber = 'RTRN/26-27/00001';
    const returnCase = {
      id: 'return-local-1001', number: 'RTRN/26-27/00001', retailSaleId: 'sale-local-1001', retailSaleNumber: 'POS/26-27/00001', invoiceId: 'invoice-local-1001', counterId: 'counter-local-1001', warehouseId: 'warehouse-local-1001', customerAccountId: 'customer-local-1001', transactionKey: 'return-key-local-1001', requestChecksum: 'return-request-checksum', reason: 'External order returned', lines: [], taxPreview: { treatment: 'intra-state', taxableValue: 100, cgst: 9, sgst: 9, igst: 0, cess: 0, totalTax: 18, grandTotal: 118, determination: 'commercial-estimate' }, status: 'approved', requestedBy: 'return-requester', inspectedBy: 'return-inspector', approvedBy: 'return-approver', requestedAt: '2026-08-03T08:00:00.000Z', approvedAt: '2026-08-03T09:00:00.000Z', scope: base.scope, version: 4, financialCredit: { id: 'credit-local-1001', number: 'RTRC/26-27/00001', retailReturnId: 'return-local-1001', customerAccountId: 'customer-local-1001', issuedAmount: 118, availableAmount: 0, reservedAmount: 0, settledAmount: 118, status: 'settled', issuedBy: 'return-approver', issuedAt: '2026-08-03T09:00:00.000Z', scope: base.scope, version: 3, settlements: [{ id: 'settlement-local-1001', number: 'RTRS/26-27/00001', retailReturnId: 'return-local-1001', financialCreditId: 'credit-local-1001', transactionKey: 'settlement-key-local-1001', requestChecksum: 'settlement-request-checksum', method: 'provider-refund', amount: 118, providerMethod: 'upi', providerReference: 'upi-request-local-1001', status: 'provider-refunded', requestedBy: 'settlement-requester', requestedAt: '2026-08-03T09:10:00.000Z', decidedBy: 'settlement-approver', decidedAt: '2026-08-03T09:15:00.000Z', confirmedBy: 'payment-reconciler', confirmedAt: '2026-08-03T09:20:00.000Z', requestEvidenceReference: 'settlement-request-evidence', providerConfirmationReference: 'upi-confirmation-local-1001', version: 3 }], gstCreditEvidence: { id: 'gst-local-1001', number: 'RTGSTC/26-27/00001', retailReturnId: 'return-local-1001', retailReturnNumber: 'RTRN/26-27/00001', sourceInvoiceId: 'invoice-local-1001', sourceInvoiceNumber: 'INV/26-27/00001', sourceInvoiceDate: '2026-08-03', supplierGstin: '27ABCDE1234F1Z5', treatment: 'intra-state', taxableValue: 100, cgst: 9, sgst: 9, igst: 0, cess: 0, totalTax: 18, totalCredit: 118, lines: [], frozenBy: 'return-approver', frozenAt: '2026-08-03T09:00:00.000Z', checksum: 'gst-checksum-local-1001' } },
    } as never;
    const creditNoteId = 'credit-note-local-1001';
    const creditNote = { id: creditNoteId, number: 'RCN/202608/00001', retailReturnId: returnCaseId, retailReturnNumber: returnCaseNumber, gstCreditEvidenceId: 'gst-local-1001', gstCreditEvidenceNumber: 'RTGSTC/26-27/00001', sourceInvoiceId: 'invoice-local-1001', sourceInvoiceNumber: 'INV/26-27/00001', filingPeriod: '2026-08', taxableValue: 100, cgst: 9, sgst: 9, igst: 0, cess: 0, totalTax: 18, totalCredit: 118, payloadChecksum: 'credit-note-payload-checksum', status: 'matched', externalReference: 'GST-PORTAL-CN-1001', portalPayloadChecksum: 'credit-note-payload-checksum', requestedBy: 'tax-maker', requestedAt: '2026-08-03T09:30:00.000Z', submittedAt: '2026-08-03T10:00:00.000Z', reconciledBy: 'tax-reconciler', reconciledAt: '2026-08-03T10:01:00.000Z', scope: base.scope, version: 2 } as never;
    const state = { ...base, retailReturns: [returnCase], retailCreditNoteReconciliations: [creditNote], retailUnifiedOrderIngestion: { ...observed.state, returnReconciliationExecutions: [] } };
    const reconciled = reconcileRetailUnifiedOrderReturn(state, { orderId: order.id, expectedSourceDigest: order.sourceDigest, retailReturnId: returnCaseId, settlementId: 'settlement-local-1001', creditNoteReconciliationId: creditNoteId, settlementEvidenceReference: 'UPI settlement confirmation local 1001', evidenceReference: 'External return close review local 1001' }, 'omnichannel-reviewer', '2026-08-03T11:00:00.000Z');
    expect(reconciled.retailUnifiedOrderIngestion?.returnReconciliationExecutions[0]).toMatchObject({ status: 'reconciled', retailReturnNumber: 'RTRN/26-27/00001', settlementNumber: 'RTRS/26-27/00001', creditNoteNumber: 'RCN/202608/00001', amount: 118, reconciledBy: 'omnichannel-reviewer' });
    expect(reconciled.retailUnifiedOrderIngestion?.orders[0]).toMatchObject({ handlingState: 'return-reconciled' });
    expect(reconcileRetailUnifiedOrderReturn(reconciled, { orderId: order.id, expectedSourceDigest: order.sourceDigest, retailReturnId: returnCaseId, settlementId: 'settlement-local-1001', creditNoteReconciliationId: creditNoteId, settlementEvidenceReference: 'ignored replay', evidenceReference: 'ignored replay' }, 'omnichannel-reviewer')).toBe(reconciled);
    expect(() => reconcileRetailUnifiedOrderReturn(state, { orderId: order.id, expectedSourceDigest: order.sourceDigest, retailReturnId: returnCaseId, settlementId: 'settlement-local-1001', creditNoteReconciliationId: creditNoteId, settlementEvidenceReference: 'UPI settlement confirmation local 1001', evidenceReference: 'External return close review local 1001' }, 'payment-reconciler')).toThrow(/independent reviewer/i);
  });

  it('records provider callback evidence idempotently without changing local custody', () => {
    const observed = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event({ externalOrderId: 'order-callback-1001', externalEventId: 'event-callback-1001' }), { mode: 'shadow', actorId: 'observer' });
    const order = observed.state.orders[0]!;
    const base = createInitialRevenueOpsState();
    const state = {
      ...base,
      retailUnifiedOrderIngestion: {
        ...observed.state,
        carrierDispatchExecutions: [{ id: 'dispatch-callback-1001', orderId: order.id, sourceDigest: order.sourceDigest, salesOrderId: 'sales-order-callback-1001', shipmentPackageId: 'shipment-callback-1001', status: 'dispatched', handoverEvidenceReference: 'handover-callback-1001', dispatchedBy: 'dispatch-maker', dispatchedAt: '2026-08-04T08:00:00.000Z', version: 1 } as never],
        carrierCallbackEvidence: [],
      },
    };
    const input = { orderId: order.id, expectedSourceDigest: order.sourceDigest, providerEventId: 'provider-event-1001', providerStatus: 'out-for-delivery' as const, callbackReference: 'carrier-webhook-receipt-1001', payloadChecksum: 'a'.repeat(64) };
    const recorded = recordRetailUnifiedOrderCarrierCallback(state, input, 'callback-reviewer', '2026-08-04T08:05:00.000Z');
    expect(recorded.retailUnifiedOrderIngestion?.carrierCallbackEvidence).toMatchObject([{ providerEventId: 'provider-event-1001', providerStatus: 'out-for-delivery', callbackReference: 'carrier-webhook-receipt-1001', payloadChecksum: 'a'.repeat(64), recordedBy: 'callback-reviewer' }]);
    expect(recorded.retailUnifiedOrderIngestion?.orders[0]?.handlingState).toBe(order.handlingState);
    expect(recorded.shipmentPackages).toEqual(state.shipmentPackages);
    expect(recordRetailUnifiedOrderCarrierCallback(recorded, input, 'callback-reviewer')).toBe(recorded);
    expect(() => recordRetailUnifiedOrderCarrierCallback(recorded, { ...input, payloadChecksum: 'b'.repeat(64) }, 'callback-reviewer')).toThrow(/different callback evidence/i);
    expect(() => recordRetailUnifiedOrderCarrierCallback(state, input, 'dispatch-maker')).toThrow(/maker/i);
    expect(() => recordRetailUnifiedOrderCarrierCallback(state, { ...input, payloadChecksum: '0'.repeat(64) }, 'callback-reviewer')).toThrow(/non-placeholder/i);
  });

  it('does not let an impossible lifecycle update overwrite the last reconciled source status', () => {
    const first = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event({ status: 'accepted' }), { mode: 'shadow' });
    const result = ingestRetailOrderSourceEvent(first.state, event({
      externalEventId: 'event-1002',
      occurredAt: '2026-08-03T08:05:00.000Z',
      status: 'returned',
    }), { mode: 'shadow' });

    expect(result.outcome).toBe('conflicted');
    expect(result.state.orders[0]).toMatchObject({ observedStatus: 'accepted' });
    expect(result.state.conflicts[0]).toMatchObject({ kind: 'invalid-status-transition', status: 'open' });
  });

  it('requires refreshed source evidence before a shadow-imported order can accept a governed lifecycle update', () => {
    const shadow = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event(), { mode: 'shadow' });
    const handoff = prepareRetailOrderForGovernedHandoff(shadow.state, {
      orderId: shadow.state.orders[0]!.id,
      expectedSourceDigest: shadow.state.orders[0]!.sourceDigest,
      approvedBy: 'retail-supervisor',
      approvalEvidenceReference: 'cutover-review-2026-08-03',
    }, '2026-08-03T08:02:00.000Z');
    const result = ingestRetailOrderSourceEvent(handoff.state, event({
      externalEventId: 'event-1002',
      occurredAt: '2026-08-03T08:05:00.000Z',
      status: 'picking',
    }), { mode: 'governed' });

    expect(result.outcome).toBe('conflicted');
    expect(result.state.orders[0]).toMatchObject({ observedStatus: 'accepted' });
    expect(result.state.reservationIntents).toHaveLength(1);
    expect(result.state.conflicts[0]).toMatchObject({ kind: 'stale-governed-handoff', status: 'open' });
  });

  it('supersedes a pending stock boundary when shadow evidence changes, then creates a fresh intent after re-approval', () => {
    const shadow = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event(), { mode: 'shadow' });
    const firstHandoff = prepareRetailOrderForGovernedHandoff(shadow.state, {
      orderId: shadow.state.orders[0]!.id,
      expectedSourceDigest: shadow.state.orders[0]!.sourceDigest,
      approvedBy: 'retail-supervisor',
      approvalEvidenceReference: 'cutover-review-accepted',
    }, '2026-08-03T08:02:00.000Z');
    const refreshedShadow = ingestRetailOrderSourceEvent(firstHandoff.state, event({
      externalEventId: 'event-1002',
      occurredAt: '2026-08-03T08:05:00.000Z',
      status: 'picking',
    }), { mode: 'shadow', receivedAt: '2026-08-03T08:06:00.000Z' });
    const refreshedOrder = refreshedShadow.state.orders[0]!;
    const finalHandoff = prepareRetailOrderForGovernedHandoff(refreshedShadow.state, {
      orderId: refreshedOrder.id,
      expectedSourceDigest: refreshedOrder.sourceDigest,
      approvedBy: 'retail-supervisor',
      approvalEvidenceReference: 'cutover-review-picking',
    }, '2026-08-03T08:07:00.000Z');

    expect(refreshedShadow.state.reservationIntents).toEqual([
      expect.objectContaining({ status: 'superseded', sourceDigest: shadow.state.orders[0]!.sourceDigest }),
    ]);
    expect(finalHandoff.state.reservationIntents).toEqual([
      expect.objectContaining({ status: 'pending', sourceDigest: refreshedOrder.sourceDigest }),
      expect.objectContaining({ status: 'superseded', sourceDigest: shadow.state.orders[0]!.sourceDigest }),
    ]);
  });

  it('keeps the source observer from approving the same governed handoff', () => {
    const observed = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event(), {
      mode: 'shadow',
      actorId: 'store-observer',
    });

    expect(() => prepareRetailOrderForGovernedHandoff(observed.state, {
      orderId: observed.state.orders[0]!.id,
      expectedSourceDigest: observed.state.orders[0]!.sourceDigest,
      approvedBy: 'store-observer',
      approvalEvidenceReference: 'same-person-review',
    })).toThrow('source observer cannot approve');
  });

  it('creates a checksum-bound Retail Hub outbox record only after independent approval', () => {
    const observed = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event(), {
      mode: 'shadow',
      actorId: 'store-observer',
      receivedAt: '2026-08-03T08:01:00.000Z',
    });
    const approved = prepareRetailOrderForGovernedHandoff(observed.state, {
      orderId: observed.state.orders[0]!.id,
      expectedSourceDigest: observed.state.orders[0]!.sourceDigest,
      approvedBy: 'retail-supervisor',
      approvalEvidenceReference: 'approval-1001',
    }, '2026-08-03T08:02:00.000Z');
    const prepared = prepareRetailOrderHubHandoff(approved.state, {
      orderId: approved.state.orders[0]!.id,
      expectedSourceDigest: approved.state.orders[0]!.sourceDigest,
    }, 'hub-dispatcher', '2026-08-03T08:03:00.000Z');

    expect(prepared.outcome).toBe('recorded');
    expect(prepared.state.hubHandoffs[0]).toMatchObject({
      target: 'retail-hub',
      status: 'prepared',
      preparedBy: 'hub-dispatcher',
      attempt: 1,
      version: 1,
      envelopeChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(() => prepareRetailOrderHubHandoff(approved.state, {
      orderId: approved.state.orders[0]!.id,
      expectedSourceDigest: approved.state.orders[0]!.sourceDigest,
    }, 'retail-supervisor', '2026-08-03T08:03:00.000Z')).toThrow('approver cannot prepare');
  });

  it('requires a different reviewer and an expected version to record Hub response evidence', () => {
    const observed = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event(), { mode: 'shadow', actorId: 'observer' });
    const approved = prepareRetailOrderForGovernedHandoff(observed.state, {
      orderId: observed.state.orders[0]!.id,
      expectedSourceDigest: observed.state.orders[0]!.sourceDigest,
      approvedBy: 'approver',
      approvalEvidenceReference: 'approval-1001',
    });
    const prepared = prepareRetailOrderHubHandoff(approved.state, {
      orderId: approved.state.orders[0]!.id,
      expectedSourceDigest: approved.state.orders[0]!.sourceDigest,
    }, 'dispatcher', '2026-08-03T08:03:00.000Z');
    const handoff = prepared.state.hubHandoffs[0]!;
    expect(() => recordRetailOrderHubHandoffResult(prepared.state, {
      id: handoff.id,
      expectedVersion: handoff.version,
      outcome: 'acknowledged',
      responseReference: 'provider-test-1001',
      responseChecksum: 'a'.repeat(64),
    }, 'dispatcher', '2026-08-03T08:04:00.000Z')).toThrow('cannot record its own');
    expect(() => recordRetailOrderHubHandoffResult(prepared.state, {
      id: handoff.id,
      expectedVersion: handoff.version - 1,
      outcome: 'acknowledged',
      responseReference: 'provider-test-1001',
      responseChecksum: 'a'.repeat(64),
    }, 'reviewer', '2026-08-03T08:04:00.000Z')).toThrow('stale');
    const recorded = recordRetailOrderHubHandoffResult(prepared.state, {
      id: handoff.id,
      expectedVersion: handoff.version,
      outcome: 'acknowledged',
      responseReference: 'provider-test-1001',
      responseChecksum: 'a'.repeat(64),
    }, 'reviewer', '2026-08-03T08:04:00.000Z');
    expect(recorded.state.hubHandoffs[0]).toMatchObject({ status: 'acknowledged', responseReference: 'provider-test-1001', version: 2, attempts: [expect.objectContaining({ attempt: 1, status: 'acknowledged', responseReference: 'provider-test-1001' })] });
    expect(prepareRetailOrderHubHandoff(recorded.state, {
      orderId: approved.state.orders[0]!.id,
      expectedSourceDigest: approved.state.orders[0]!.sourceDigest,
    }, 'dispatcher', '2026-08-03T08:05:00.000Z').outcome).toBe('idempotent');
  });

  it('preserves retryable Hub attempts when a fresh local retry is prepared', () => {
    const observed = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event(), { mode: 'shadow', actorId: 'observer' });
    const approved = prepareRetailOrderForGovernedHandoff(observed.state, {
      orderId: observed.state.orders[0]!.id,
      expectedSourceDigest: observed.state.orders[0]!.sourceDigest,
      approvedBy: 'approver',
      approvalEvidenceReference: 'approval-1001',
    });
    const first = prepareRetailOrderHubHandoff(approved.state, {
      orderId: approved.state.orders[0]!.id,
      expectedSourceDigest: approved.state.orders[0]!.sourceDigest,
    }, 'dispatcher', '2026-08-03T08:03:00.000Z');
    const retryable = recordRetailOrderHubHandoffResult(first.state, {
      id: first.state.hubHandoffs[0]!.id,
      expectedVersion: 1,
      outcome: 'retryable',
      responseReference: 'provider-timeout-1001',
      responseChecksum: 'b'.repeat(64),
    }, 'reviewer', '2026-08-03T08:04:00.000Z');
    const second = prepareRetailOrderHubHandoff(retryable.state, {
      orderId: approved.state.orders[0]!.id,
      expectedSourceDigest: approved.state.orders[0]!.sourceDigest,
    }, 'dispatcher-2', '2026-08-03T08:05:00.000Z');

    expect(second.state.hubHandoffs[0]).toMatchObject({ status: 'prepared', attempt: 2, version: 3 });
    expect(second.state.hubHandoffs[0]!.attempts?.map((item) => item.status)).toEqual(['retryable', 'prepared']);
    expect(second.state.hubHandoffs[0]!.attempts?.[0]).toMatchObject({ attempt: 1, status: 'retryable', responseReference: 'provider-timeout-1001', version: 2 });
    expect(second.state.hubHandoffs[0]!.attempts?.[1]).toMatchObject({ attempt: 2, preparedBy: 'dispatcher-2', version: 3 });
  });

  it('maps an approved external order to an existing sales order with independent evidence only', () => {
    const observed = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event(), { mode: 'shadow', actorId: 'observer' });
    const approved = prepareRetailOrderForGovernedHandoff(observed.state, {
      orderId: observed.state.orders[0]!.id,
      expectedSourceDigest: observed.state.orders[0]!.sourceDigest,
      approvedBy: 'approver',
      approvalEvidenceReference: 'approval-1001',
    });
    const prepared = prepareRetailOrderFulfilmentHandoff(approved.state, {
      orderId: approved.state.orders[0]!.id,
      expectedSourceDigest: approved.state.orders[0]!.sourceDigest,
      salesOrderId: 'sales-order-1001',
      evidenceReference: 'mapping-review-1001',
    }, { id: 'sales-order-1001', status: 'confirmed' }, 'mapper', '2026-08-03T08:06:00.000Z');

    expect(prepared.state.fulfilmentHandoffs[0]).toMatchObject({ status: 'prepared', salesOrderId: 'sales-order-1001', preparedBy: 'mapper', version: 1 });
    expect(() => decideRetailOrderFulfilmentHandoff(prepared.state, {
      id: prepared.state.fulfilmentHandoffs[0]!.id,
      expectedVersion: 1,
      decision: 'approved',
      remarks: 'same maker',
    }, 'mapper')).toThrow('cannot decide');
    const decided = decideRetailOrderFulfilmentHandoff(prepared.state, {
      id: prepared.state.fulfilmentHandoffs[0]!.id,
      expectedVersion: 1,
      decision: 'approved',
      remarks: 'Independent mapping review completed.',
    }, 'reviewer', '2026-08-03T08:07:00.000Z');
    expect(decided.state.fulfilmentHandoffs[0]).toMatchObject({ status: 'approved', decidedBy: 'reviewer', version: 2 });
    expect(decided.state.orders[0]).not.toHaveProperty('salesOrderId');
    expect(decided.state.reservationIntents).toEqual([expect.objectContaining({ status: 'pending', sourceDigest: approved.state.orders[0]!.sourceDigest })]);
  });

  it('reserves exact local stock only after approved fulfilment mapping and remains idempotent', () => {
    const shadow = ingestRetailOrderSourceEvent(createRetailOrderIngestionState(), event(), { mode: 'shadow', actorId: 'observer' });
    const firstApproval = prepareRetailOrderForGovernedHandoff(shadow.state, {
      orderId: shadow.state.orders[0]!.id,
      expectedSourceDigest: shadow.state.orders[0]!.sourceDigest,
      approvedBy: 'approver',
      approvalEvidenceReference: 'approval-1001',
    });
    const refreshed = ingestRetailOrderSourceEvent(firstApproval.state, event({ externalEventId: 'event-1002', status: 'picking', occurredAt: '2026-08-03T08:05:00.000Z' }), { mode: 'shadow' });
    const governed = prepareRetailOrderForGovernedHandoff(refreshed.state, {
      orderId: refreshed.state.orders[0]!.id,
      expectedSourceDigest: refreshed.state.orders[0]!.sourceDigest,
      approvedBy: 'approver',
      approvalEvidenceReference: 'approval-picking-1001',
    });
    const mapped = prepareRetailOrderFulfilmentHandoff(governed.state, {
      orderId: governed.state.orders[0]!.id,
      expectedSourceDigest: governed.state.orders[0]!.sourceDigest,
      salesOrderId: 'sales-order-1001',
      evidenceReference: 'mapping-review-1001',
    }, { id: 'sales-order-1001', status: 'confirmed' }, 'mapper');
    const decided = decideRetailOrderFulfilmentHandoff(mapped.state, {
      id: mapped.state.fulfilmentHandoffs[0]!.id,
      expectedVersion: 1,
      decision: 'approved',
      remarks: 'Sales order identity and external lines independently checked.',
    }, 'reviewer');
    const base = createInitialRevenueOpsState();
    const scope = base.scope;
    const state = {
      ...base,
      salesOrders: [{ id: 'sales-order-1001', status: 'confirmed', lines: [{ id: 'sales-line-1', catalogProductId: 'product-apple', quantity: 1 }], scope } as never],
      products: [{ id: 'product-apple', kind: 'goods', active: true, scope } as never],
      inventoryItems: [{ id: 'inventory-item-apple', productId: 'product-apple', active: true, scope } as never],
      itemVariants: [{ id: 'variant-apple-1kg', itemId: 'inventory-item-apple', sku: 'APPLE-1KG', active: true, scope } as never],
      stockLocations: [{ id: 'location-store', code: 'STORE', name: 'Store', active: true, scope } as never],
      stockPositions: [{ id: 'position-apple', locationId: 'location-store', productId: 'product-apple', onHand: 2, reserved: 0, available: 2, scope, version: 1 } as never],
      retailUnifiedOrderIngestion: decided.state,
    };
    const reserved = reserveRetailUnifiedOrderStock(state, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      locationId: 'location-store',
      evidenceReference: 'stock-check-1001',
    }, 'allocator', '2026-08-03T08:10:00.000Z');

    expect(reserved.stockReservations).toHaveLength(1);
    expect(reserved.stockReservations[0]).toMatchObject({ salesOrderId: 'sales-order-1001', lineId: 'sales-line-1', productId: 'product-apple', quantity: 1, status: 'reserved' });
    expect(reserved.stockPositions[0]).toMatchObject({ reserved: 1, available: 1 });
    const reservedIngestion = reserved.retailUnifiedOrderIngestion!;
    expect(reservedIngestion.stockReservationExecutions[0]).toMatchObject({ status: 'completed', salesOrderId: 'sales-order-1001', locationId: 'location-store', reservationIds: [reserved.stockReservations[0]!.id] });
    expect(reservedIngestion.reservationIntents[0]).toMatchObject({ status: 'executed', executionId: reservedIngestion.stockReservationExecutions[0]!.id });
    expect(reserveRetailUnifiedOrderStock(reserved, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      locationId: 'location-store',
      evidenceReference: 'stock-check-1001',
    }, 'allocator', '2026-08-03T08:11:00.000Z')).toBe(reserved);
    const pickReady = {
      ...reserved,
      warehouses: [{ id: 'warehouse-store', stockLocationId: 'location-store', active: true, scope } as never],
      warehouseZones: [{ id: 'zone-picking', warehouseId: 'warehouse-store', purpose: 'picking', active: true, scope } as never],
      storageBins: [{ id: 'bin-picking', zoneId: 'zone-picking', status: 'available', pickSequence: 1, scope } as never],
      binBalances: [{ id: 'balance-apple', binId: 'bin-picking', itemVariantId: 'variant-apple-1kg', quantity: 1, reserved: 0, picked: 0, available: 1, unitCost: 10, inventoryValue: 10, scope } as never],
    };
    const planned = createRetailUnifiedOrderPickTasks(pickReady, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      evidenceReference: 'pick-wave-1001',
      dueAt: '2026-08-03T09:00:00.000Z',
      priority: 'normal',
    }, 'picker');
    expect(planned.warehouseTasks[0]).toMatchObject({ type: 'pick', sourceId: reserved.stockReservations[0]!.id, itemVariantId: 'variant-apple-1kg', fromBinId: 'bin-picking', quantity: 1, status: 'planned', assignedTo: 'picker' });
    expect(planned.retailUnifiedOrderIngestion?.pickTaskExecutions[0]).toMatchObject({ status: 'planned', taskIds: [planned.warehouseTasks[0]!.id], evidenceReference: 'pick-wave-1001' });
    expect(() => createShipmentPackage(planned, { salesOrderId: 'sales-order-1001', fromLocationId: 'location-store', reservationIds: [reserved.stockReservations[0]!.id], grossWeightKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1, ewayBillRequired: false }, 'picker')).toThrow('every directed pick task is completed');
    expect(createRetailUnifiedOrderPickTasks(planned, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      evidenceReference: 'pick-wave-1001',
      dueAt: '2026-08-03T09:00:00.000Z',
      priority: 'normal',
    }, 'picker')).toBe(planned);
    const started = transitionWarehouseTask(planned, { id: planned.warehouseTasks[0]!.id, toStatus: 'in-progress', expectedVersion: 1 }, 'picker', '2026-08-03T09:10:00.000Z');
    const picked = transitionWarehouseTask(started, { id: planned.warehouseTasks[0]!.id, toStatus: 'completed', expectedVersion: 2 }, 'picker', '2026-08-03T09:20:00.000Z');
    const closed = completeRetailUnifiedOrderPickTasks(picked, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      evidenceReference: 'pick-close-1001',
    }, 'supervisor', '2026-08-03T09:25:00.000Z');
    expect(closed.retailUnifiedOrderIngestion?.pickTaskExecutions[0]).toMatchObject({ status: 'completed', completedBy: 'supervisor', completionEvidenceReference: 'pick-close-1001' });
    expect(closed.retailUnifiedOrderIngestion?.orders[0]).toMatchObject({ handlingState: 'awaiting-pack' });
    expect(completeRetailUnifiedOrderPickTasks(closed, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      evidenceReference: 'pick-close-1001',
    }, 'supervisor')).toBe(closed);
    expect(createShipmentPackage(closed, { salesOrderId: 'sales-order-1001', fromLocationId: 'location-store', reservationIds: [reserved.stockReservations[0]!.id], grossWeightKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1, ewayBillRequired: false }, 'picker').shipmentPackages[0]).toMatchObject({ salesOrderId: 'sales-order-1001', status: 'planned' });
    const packagedUnified = createRetailUnifiedOrderShipmentPackage(closed, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      fromLocationId: 'location-store',
      grossWeightKg: 1,
      lengthCm: 1,
      widthCm: 1,
      heightCm: 1,
      ewayBillRequired: false,
      evidenceReference: 'package-slip-1001',
    }, 'packer', '2026-08-03T09:30:00.000Z');
    expect(packagedUnified.shipmentPackages[0]).toMatchObject({ id: expect.any(String), salesOrderId: 'sales-order-1001', status: 'planned' });
    expect(packagedUnified.retailUnifiedOrderIngestion?.shipmentPackageExecutions[0]).toMatchObject({ status: 'created', salesOrderId: 'sales-order-1001', evidenceReference: 'package-slip-1001' });
    expect(packagedUnified.retailUnifiedOrderIngestion?.orders[0]).toMatchObject({ handlingState: 'awaiting-dispatch' });
    expect(createRetailUnifiedOrderShipmentPackage(packagedUnified, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      fromLocationId: 'location-store',
      grossWeightKg: 1,
      lengthCm: 1,
      widthCm: 1,
      heightCm: 1,
      ewayBillRequired: false,
      evidenceReference: 'package-slip-1001',
    }, 'packer')).toBe(packagedUnified);
    const packedUnified = completeRetailUnifiedOrderShipmentPackage(packagedUnified, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      evidenceReference: 'seal-1001',
    }, 'pack-supervisor', '2026-08-03T09:35:00.000Z');
    expect(packedUnified.shipmentPackages[0]).toMatchObject({ status: 'packed' });
    expect(packedUnified.retailUnifiedOrderIngestion?.shipmentPackageExecutions[0]).toMatchObject({ status: 'packed', packedBy: 'pack-supervisor', packingEvidenceReference: 'seal-1001' });
    expect(completeRetailUnifiedOrderShipmentPackage(packedUnified, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      evidenceReference: 'seal-1001',
    }, 'pack-supervisor')).toBe(packedUnified);
    const dispatchReady = prepareRetailUnifiedOrderDispatch({
      ...packedUnified,
      carrierAdapters: [{ id: 'carrier-manual', code: 'MANUAL', name: 'Controlled carrier handoff', status: 'configured', scope, version: 1 } as never],
      placeOfSupplyReviews: [{ salesOrderId: 'sales-order-1001', status: 'approved' } as never],
      invoices: [{ salesOrderId: 'sales-order-1001', status: 'issued' } as never],
    }, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      carrierAdapterId: 'carrier-manual',
      trackingNumber: 'LR-1001',
      vehicleNumber: 'MH12AB1234',
      eventLocation: 'Mumbai dispatch staging',
      evidenceReference: 'dispatch-review-1001',
    }, 'dispatch-supervisor', '2026-08-03T09:40:00.000Z');
    expect(dispatchReady.shipmentPackages[0]).toMatchObject({ status: 'ready-to-dispatch', trackingNumber: 'LR-1001', vehicleNumber: 'MH12AB1234' });
    expect(dispatchReady.retailUnifiedOrderIngestion?.dispatchReadinessExecutions[0]).toMatchObject({ status: 'ready', evidenceReference: 'dispatch-review-1001' });
    expect(dispatchReady.retailUnifiedOrderIngestion?.orders[0]).toMatchObject({ handlingState: 'awaiting-carrier-dispatch' });
    expect(prepareRetailUnifiedOrderDispatch(dispatchReady, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      eventLocation: 'Mumbai dispatch staging',
      evidenceReference: 'dispatch-review-1001',
    }, 'dispatch-supervisor')).toBe(dispatchReady);
    const handedOff = dispatchRetailUnifiedOrder(dispatchReady, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      expectedDispatchReadinessVersion: dispatchReady.retailUnifiedOrderIngestion!.dispatchReadinessExecutions[0]!.version,
      eventLocation: 'Mumbai carrier dock',
      handoverEvidenceReference: 'signed-manifest-1001',
    }, 'carrier-supervisor', '2026-08-03T09:45:00.000Z');
    expect(handedOff.shipmentPackages[0]).toMatchObject({ status: 'dispatched', carrierAdapterId: 'carrier-manual', trackingNumber: 'LR-1001' });
    expect(handedOff.retailUnifiedOrderIngestion?.carrierDispatchExecutions[0]).toMatchObject({ status: 'dispatched', handoverEvidenceReference: 'signed-manifest-1001', dispatchedBy: 'carrier-supervisor' });
    expect(handedOff.retailUnifiedOrderIngestion?.orders[0]).toMatchObject({ handlingState: 'awaiting-delivery' });
    expect(dispatchRetailUnifiedOrder(handedOff, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      expectedDispatchReadinessVersion: dispatchReady.retailUnifiedOrderIngestion!.dispatchReadinessExecutions[0]!.version,
      eventLocation: 'Mumbai carrier dock',
      handoverEvidenceReference: 'signed-manifest-1001',
    }, 'carrier-supervisor')).toBe(handedOff);
    const delivered = confirmRetailUnifiedOrderDelivery(handedOff, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      expectedCarrierDispatchVersion: handedOff.retailUnifiedOrderIngestion!.carrierDispatchExecutions[0]!.version,
      eventLocation: 'Customer receiving desk',
      proofOfDeliveryReference: 'POD-1001',
      recipientName: 'Asha Sharma',
      deliveryNotes: 'Signed receipt and recipient identity checked.',
    }, 'delivery-supervisor', '2026-08-03T12:00:00.000Z');
    expect(delivered.shipmentPackages[0]).toMatchObject({ status: 'delivered', deliveredAt: '2026-08-03T12:00:00.000Z' });
    expect(delivered.deliveryEvidence[0]).toMatchObject({ salesOrderId: 'sales-order-1001', type: 'delivery', reference: 'POD-1001', capturedBy: 'delivery-supervisor' });
    expect(delivered.retailUnifiedOrderIngestion?.deliveryExecutions[0]).toMatchObject({ status: 'delivered', proofOfDeliveryReference: 'POD-1001', recipientName: 'Asha Sharma' });
    expect(delivered.retailUnifiedOrderIngestion?.orders[0]).toMatchObject({ handlingState: 'delivered' });
    expect(confirmRetailUnifiedOrderDelivery(delivered, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      expectedCarrierDispatchVersion: handedOff.retailUnifiedOrderIngestion!.carrierDispatchExecutions[0]!.version,
      eventLocation: 'Customer receiving desk',
      proofOfDeliveryReference: 'POD-1001',
      deliveryNotes: 'Signed receipt and recipient identity checked.',
    }, 'delivery-supervisor')).toBe(delivered);
    expect(() => confirmRetailUnifiedOrderDelivery(handedOff, {
      orderId: decided.state.orders[0]!.id,
      expectedSourceDigest: decided.state.orders[0]!.sourceDigest,
      expectedCarrierDispatchVersion: handedOff.retailUnifiedOrderIngestion!.carrierDispatchExecutions[0]!.version,
      eventLocation: 'Customer receiving desk',
      proofOfDeliveryReference: 'POD-1002',
      deliveryNotes: 'Duplicate maker check should fail.',
    }, 'carrier-supervisor')).toThrow(/maker/i);
  });
});
