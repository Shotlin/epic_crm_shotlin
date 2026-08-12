import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildRetailHubStoreEdgeSyncUrl, sendRetailHubStoreEdgeSync } from './retail-hub-store-edge-sync-client';

const scope = { tenantId: 'tenant-bakaloo', companyId: 'company-bakaloo', branchId: 'branch-pune' };
const payload = { saleId: 'sale-001', totalInr: 249, tender: 'upi', source: 'store-edge' };
const event = {
  eventId: 'event-001', eventType: 'retail.sale.completed', aggregateId: 'sale-001', transactionKey: 'POS-PUNE-001', sequence: 1,
  producedAt: '2026-08-06T15:00:00.000Z', payloadChecksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), payload,
};
const response = (status: number, outcome: 'recorded' | 'idempotent' | 'conflicted') => ({
  status, contentType: 'application/json; charset=utf-8', body: new TextEncoder().encode(JSON.stringify({ outcome, receipt: { id: 'receipt-001', eventId: event.eventId, eventType: event.eventType, aggregateId: event.aggregateId, transactionKey: event.transactionKey, sequence: event.sequence, payloadChecksum: event.payloadChecksum, outcome, actorId: 'hub-store-edge', receivedAt: '2026-08-06T15:00:01.000Z', scope } })),
});

describe('Retail Hub Store Edge sync client', () => {
  it('builds only credential-free HTTPS sync URLs', () => {
    expect(buildRetailHubStoreEdgeSyncUrl('https://hub.example.in/')).toBe('https://hub.example.in/v1/store-edge/sync');
    expect(() => buildRetailHubStoreEdgeSyncUrl('http://hub.example.in')).toThrow(/HTTPS/i);
    expect(() => buildRetailHubStoreEdgeSyncUrl('https://user:pass@hub.example.in')).toThrow(/credential-free/i);
    expect(() => buildRetailHubStoreEdgeSyncUrl('https://hub.example.in?token=bad')).toThrow(/credential-free/i);
  });

  it('sends a checksum-bound event through the injected main-process adapter', async () => {
    let captured: { url: string; body: unknown } | undefined;
    const result = await sendRetailHubStoreEdgeSync({ baseUrl: 'https://hub.example.in', event }, {
      request: async (url, body) => { captured = { url, body: JSON.parse(new TextDecoder().decode(body)) }; return response(202, 'recorded'); },
    });
    expect(captured).toMatchObject({ url: 'https://hub.example.in/v1/store-edge/sync', body: event });
    expect(result).toMatchObject({ httpStatus: 202, outcome: 'recorded', receipt: { eventId: event.eventId, scope } });
  });

  it('accepts idempotent replay and surfaces Hub conflicts without hiding them', async () => {
    await expect(sendRetailHubStoreEdgeSync({ baseUrl: 'https://hub.example.in', event }, { request: async () => response(200, 'idempotent') })).resolves.toMatchObject({ httpStatus: 200, outcome: 'idempotent' });
    await expect(sendRetailHubStoreEdgeSync({ baseUrl: 'https://hub.example.in', event }, { request: async () => response(409, 'conflicted') })).resolves.toMatchObject({ httpStatus: 409, outcome: 'conflicted' });
  });

  it('rejects payload tampering, secret fields and mismatched server receipts', async () => {
    await expect(sendRetailHubStoreEdgeSync({ baseUrl: 'https://hub.example.in', event: { ...event, payload: { ...payload, totalInr: 999 } } }, { request: async () => response(202, 'recorded') })).rejects.toThrow(/checksum/i);
    const secretPayload = { ...payload, apiKey: 'never-here' };
    const secretEvent = { ...event, payload: secretPayload, payloadChecksum: createHash('sha256').update(JSON.stringify(secretPayload)).digest('hex') };
    await expect(sendRetailHubStoreEdgeSync({ baseUrl: 'https://hub.example.in', event: secretEvent }, { request: async () => response(202, 'recorded') })).rejects.toThrow(/not allowed/i);
    await expect(sendRetailHubStoreEdgeSync({ baseUrl: 'https://hub.example.in', event }, { request: async () => {
      const body = JSON.parse(new TextDecoder().decode(response(202, 'recorded').body)) as { receipt: { eventId: string } };
      body.receipt.eventId = 'event-other';
      return { status: 202, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify(body)) };
    } })).rejects.toThrow(/does not match/i);
  });

  it('fails closed on unauthenticated or malformed Hub responses', async () => {
    await expect(sendRetailHubStoreEdgeSync({ baseUrl: 'https://hub.example.in', event }, { request: async () => ({ status: 403, contentType: 'application/json', body: new Uint8Array() }) })).rejects.toThrow(/HTTP 403/i);
    await expect(sendRetailHubStoreEdgeSync({ baseUrl: 'https://hub.example.in', event }, { request: async () => ({ status: 202, contentType: 'text/plain', body: new Uint8Array() }) })).rejects.toThrow(/application\/json/i);
  });
});
