import { describe, expect, it } from 'vitest';
import type { RevenueOpsState, StatutoryExchange } from '../shared/revenue-ops-contracts';
import { createInitialRevenueOpsState } from './revenue-ops';
import {
  applyPortalReconciliation,
  configureStatutoryAdapter,
  markStatutoryCredentials,
  prepareConsolidatedEwayBill,
  prepareStatutoryOperation,
  recordConsolidatedEwayBillResponse,
  recordStatutoryOperationResponse,
  submitConsolidatedEwayBill,
  submitStatutoryOperation,
} from './statutory-control';

function exchange(id: string, kind: StatutoryExchange['kind'], externalNumber: string, acknowledgedAt = '2026-07-16T10:00:00.000Z'): StatutoryExchange {
  return { id, kind, sourceId: kind === 'e-way-bill' ? `shipment-${id}` : `invoice-${id}`, sourceNumber: `SOURCE-${id}`, gstRegistrationId: 'gst-mh', idempotencyKey: `gst:${id}`, payloadChecksum: 'a'.repeat(64), status: 'acknowledged', externalNumber, acknowledgementNumber: `ACK-${id}`, acknowledgedAt, validUntil: kind === 'e-way-bill' ? '2026-07-17T10:00:00.000Z' : undefined, portalStatus: 'unknown', reconciliationState: 'unverified', preparedBy: 'maker', preparedAt: acknowledgedAt, submittedBy: 'checker', submittedAt: acknowledgedAt, version: 3 };
}

function controlled(): RevenueOpsState {
  const initial = createInitialRevenueOpsState();
  let state: RevenueOpsState = {
    ...initial,
    gstRegistrations: [{ id: 'gst-mh', label: 'Maharashtra', gstin: '27ABCDE1234F1Z5', stateCode: '27', branchCode: 'MUM', address: 'Mumbai 400013', primary: true, active: true, version: 1 }],
    shipmentPackages: [
      { id: 'shipment-ewb-1', number: 'SHP-1', salesOrderId: 'so-1', fromLocationId: 'loc-1', items: [], grossWeightKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1, status: 'delivered', ewayBillRequired: true, createdBy: 'maker', createdAt: '2026-07-16T08:00:00.000Z', version: 1 },
      { id: 'shipment-ewb-2', number: 'SHP-2', salesOrderId: 'so-2', fromLocationId: 'loc-1', items: [], grossWeightKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1, status: 'in-transit', ewayBillRequired: true, createdBy: 'maker', createdAt: '2026-07-16T08:00:00.000Z', version: 1 },
    ],
    statutoryExchanges: [exchange('ewb-1', 'e-way-bill', '181000000001'), exchange('ewb-2', 'e-way-bill', '181000000002'), exchange('irn-1', 'e-invoice', 'IRN-20260716-0001')],
  };
  state = configureStatutoryAdapter(state, { code: 'GSP-ONE', name: 'Primary GSP and IRP', provider: 'Example Provider', environment: 'sandbox', baseUrl: 'https://gsp.example.in', statusPathTemplate: '/v1/status/{kind}/{number}', healthPath: '/v1/health', capabilities: ['cancel-irn', 'cancel-ewb', 'close-ewb', 'extend-ewb', 'consolidated-ewb', 'status-pull', 'signature-verify'] }, 'admin', 'adapter-1', '2026-07-16T09:00:00.000Z');
  return markStatutoryCredentials(state, 'adapter-1', 'f00dcafe11223344');
}

describe('statutory lifecycle control', () => {
  it('enforces the 24-hour cancellation limit and independent submission', () => {
    let state = prepareStatutoryOperation(controlled(), { kind: 'cancel-ewb', exchangeId: 'ewb-1', adapterId: 'adapter-1', reasonCode: '2', remarks: 'Duplicate movement document' }, 'maker', 'operation-1', '2026-07-16T12:00:00.000Z');
    expect(() => submitStatutoryOperation(state, { id: 'operation-1', requestReference: 'REQ-SELF', expectedVersion: 1 }, 'maker')).toThrow('independent submitter');
    state = submitStatutoryOperation(state, { id: 'operation-1', requestReference: 'REQ-CANCEL-1', expectedVersion: 1 }, 'checker', '2026-07-16T12:05:00.000Z');
    state = recordStatutoryOperationResponse(state, { id: 'operation-1', outcome: 'acknowledged', externalReference: 'PORTAL-CANCEL-1', acknowledgedAt: '2026-07-16T12:06:00.000Z', expectedVersion: 2 });
    expect(state.statutoryOperations[0]).toMatchObject({ status: 'acknowledged', submittedBy: 'checker' });
    expect(state.statutoryExchanges.find(({ id }) => id === 'ewb-1')).toMatchObject({ status: 'cancelled', portalStatus: 'cancelled', reconciliationState: 'unverified' });
    expect(() => prepareStatutoryOperation(controlled(), { kind: 'cancel-irn', exchangeId: 'irn-1', adapterId: 'adapter-1', reasonCode: '1', remarks: 'Incorrect invoice details' }, 'maker', 'late', '2026-07-18T12:00:00.000Z')).toThrow('within 24 hours');
  });

  it('permits validity extension only in the expiry window and records the new boundary', () => {
    let state = prepareStatutoryOperation(controlled(), { kind: 'extend-ewb', exchangeId: 'ewb-1', adapterId: 'adapter-1', reasonCode: '99', remarks: 'Route blocked by monsoon', requestedValidUntil: '2026-07-18T10:00:00.000Z', transportMode: 'road', vehicleNumber: 'MH12AB1234', fromPlace: 'Pune', fromStateCode: '27', fromPincode: '411001', remainingDistanceKm: 460 }, 'maker', 'extension-1', '2026-07-17T03:00:00.000Z');
    state = submitStatutoryOperation(state, { id: 'extension-1', requestReference: 'REQ-EXTEND-1', expectedVersion: 1 }, 'checker', '2026-07-17T03:05:00.000Z');
    state = recordStatutoryOperationResponse(state, { id: 'extension-1', outcome: 'acknowledged', externalReference: 'PORTAL-EXTEND-1', acknowledgedAt: '2026-07-17T03:06:00.000Z', validUntil: '2026-07-18T10:00:00.000Z', expectedVersion: 2 });
    expect(state.statutoryExchanges.find(({ id }) => id === 'ewb-1')?.validUntil).toBe('2026-07-18T10:00:00.000Z');
    expect(() => prepareStatutoryOperation(controlled(), { kind: 'extend-ewb', exchangeId: 'ewb-1', adapterId: 'adapter-1', reasonCode: '99', remarks: 'Premature extension attempt', requestedValidUntil: '2026-07-18T10:00:00.000Z', transportMode: 'road', vehicleNumber: 'MH12AB1234', fromPlace: 'Pune', fromStateCode: '27', fromPincode: '411001', remainingDistanceKm: 460 }, 'maker', 'early', '2026-07-16T20:00:00.000Z')).toThrow('8 hours before');
  });

  it('closes delivered movements and consolidates only active EWBs with checker evidence', () => {
    let state = prepareStatutoryOperation(controlled(), { kind: 'close-ewb', exchangeId: 'ewb-1', adapterId: 'adapter-1', reasonCode: 'DELIVERED', remarks: 'Delivery proof independently verified', effectiveDate: '2026-07-17T00:00:00.000Z' }, 'maker', 'closure-1', '2026-07-17T12:00:00.000Z');
    expect(state.statutoryOperations[0]).toMatchObject({ kind: 'close-ewb', status: 'prepared' });
    state = prepareConsolidatedEwayBill(controlled(), { adapterId: 'adapter-1', gstRegistrationId: 'gst-mh', exchangeIds: ['ewb-1', 'ewb-2'], transportMode: 'road', vehicleNumber: 'MH12AB1234', fromPlace: 'Mumbai', fromStateCode: '27' }, 'maker', 'consolidated-1', '2026-07-16T12:00:00.000Z');
    expect(() => submitConsolidatedEwayBill(state, { id: 'consolidated-1', requestReference: 'REQ-SELF', expectedVersion: 1 }, 'maker')).toThrow('independent submitter');
    state = submitConsolidatedEwayBill(state, { id: 'consolidated-1', requestReference: 'REQ-CEWB-1', expectedVersion: 1 }, 'checker');
    state = recordConsolidatedEwayBillResponse(state, { id: 'consolidated-1', outcome: 'acknowledged', externalNumber: '181999999999', generatedAt: '2026-07-16T12:05:00.000Z', expectedVersion: 2 });
    expect(state.consolidatedEwayBills[0]).toMatchObject({ status: 'acknowledged', externalNumber: '181999999999', submittedBy: 'checker' });
  });

  it('treats pulled portal state as authoritative evidence and exposes drift', () => {
    const state = applyPortalReconciliation(controlled(), 'adapter-1', [
      { exchangeId: 'ewb-1', remoteStatus: 'cancelled', externalNumber: '181000000001', remotePayloadChecksum: 'b'.repeat(64) },
      { exchangeId: 'ewb-2', remoteStatus: 'active', externalNumber: '181000000002', acknowledgementNumber: 'ACK-ewb-2', acknowledgedAt: '2026-07-16T10:00:00.000Z', validUntil: '2026-07-17T10:00:00.000Z' },
    ], 'reconciler', 'run-1', '2026-07-16T14:00:00.000Z');
    expect(state.portalReconciliationRuns[0]).toMatchObject({ status: 'completed-with-exceptions', requestedBy: 'reconciler' });
    expect(state.portalReconciliationRuns[0]!.items.map(({ result }) => result)).toEqual(['drift', 'matched']);
    expect(state.statutoryExchanges.find(({ id }) => id === 'ewb-1')).toMatchObject({ status: 'cancelled', portalStatus: 'cancelled', reconciliationState: 'drift' });
    expect(state.statutoryAdapters[0]).toMatchObject({ health: 'healthy', lastPullAt: '2026-07-16T14:00:00.000Z' });
  });
});
