import { describe, expect, it } from 'vitest';
import { normalizeRetailCommercePushResponse, normalizeRetailCommerceResponse } from './retail-commerce-gateway';

const response = (bodyText: string, statusCode = 200) => ({ statusCode, ok: statusCode >= 200 && statusCode < 300, bodyText, responseChecksum: 'f'.repeat(64), responseByteLength: Buffer.byteLength(bodyText, 'utf8') });

describe('retail commerce adapter response boundary', () => {
  it('accepts only an explicit canonical success envelope and preserves transport evidence', () => {
    const result = normalizeRetailCommerceResponse(response(JSON.stringify({ status: 'completed', evidenceReference: 'ONDC-ACK-001', providerReference: 'ONDC-001', remoteCursor: 'cursor-2', recordsRead: 4, recordsAccepted: 3, recordsRejected: 1 })));
    expect(result).toMatchObject({ status: 'completed', evidenceReference: 'ONDC-ACK-001', providerReference: 'ONDC-001', remoteCursor: 'cursor-2', recordsRead: 4, recordsAccepted: 3, recordsRejected: 1, responseChecksum: 'f'.repeat(64) });
  });

  it('turns a non-success HTTP response into an evidenced failure without inventing records', () => {
    expect(normalizeRetailCommerceResponse(response('provider rejected request', 409))).toMatchObject({ status: 'failed', evidenceReference: 'HTTP-409', recordsRead: 0, recordsAccepted: 0, recordsRejected: 0 });
  });

  it('normalizes mapped remote orders only when the provider declares the canonical order envelope', () => {
    const result = normalizeRetailCommerceResponse(response(JSON.stringify({ status: 'completed', evidenceReference: 'ONDC-ORDERS-001', recordsRead: 1, recordsAccepted: 1, recordsRejected: 0, orders: [{ remoteOrderId: 'remote-1', orderNumber: 'ONDC-ORDER-1', remoteCreatedAt: '2026-08-01T10:00:00.000Z', remoteStatus: 'cancelled', lines: [{ remoteSku: 'SKU-RED-1', quantity: 2, unitPrice: 120, gstRate: 5 }] }] })));
    expect(result.orders).toEqual([{ remoteOrderId: 'remote-1', orderNumber: 'ONDC-ORDER-1', remoteCreatedAt: '2026-08-01T10:00:00.000Z', remoteStatus: 'cancelled', lines: [{ remoteSku: 'SKU-RED-1', quantity: 2, unitPrice: 120, gstRate: 5 }] }]);
  });

  it('rejects an arbitrary 2xx payload instead of treating it as a successful sync', () => {
    expect(() => normalizeRetailCommerceResponse(response(JSON.stringify({ ok: true })))).toThrow(/canonical/i);
  });

  it('normalizes settlement pulls with bounded dates and amounts', () => {
    const result = normalizeRetailCommerceResponse(response(JSON.stringify({ status: 'completed', evidenceReference: 'MKT-SETTLEMENT-1', recordsRead: 1, recordsAccepted: 1, recordsRejected: 0, settlements: [{ settlementReference: 'SETTLE-1001', periodFrom: '2026-07-01', periodTo: '2026-07-31', grossAmount: 1000, refundAmount: 80, feeAmount: 25.5, taxWithheldAmount: 10, remoteOrderIds: ['remote-1'] }] })));
    expect(result.settlements).toEqual([{ settlementReference: 'SETTLE-1001', periodFrom: '2026-07-01', periodTo: '2026-07-31', grossAmount: 1000, refundAmount: 80, feeAmount: 25.5, taxWithheldAmount: 10, remoteOrderIds: ['remote-1'] }]);
  });

  it('accepts a push only when the provider acknowledges the exact payload and all records', () => {
    const payloadChecksum = 'b'.repeat(64);
    const result = normalizeRetailCommercePushResponse(response(JSON.stringify({ status: 'acknowledged', evidenceReference: 'ONDC-PUSH-001', providerReference: 'ONDC-ACK-001', payloadChecksum, recordsAccepted: 2 })), payloadChecksum, 2);
    expect(result).toMatchObject({ status: 'acknowledged', payloadChecksum, recordsAccepted: 2, providerReference: 'ONDC-ACK-001' });
    expect(() => normalizeRetailCommercePushResponse(response(JSON.stringify({ status: 'acknowledged', evidenceReference: 'ONDC-PUSH-WRONG', payloadChecksum: 'c'.repeat(64), recordsAccepted: 2 })), payloadChecksum, 2)).toThrow(/different prepared payload/i);
    expect(() => normalizeRetailCommercePushResponse(response(JSON.stringify({ status: 'acknowledged', evidenceReference: 'ONDC-PUSH-PARTIAL', payloadChecksum, recordsAccepted: 1 })), payloadChecksum, 2)).toThrow(/every prepared SKU/i);
  });
});
