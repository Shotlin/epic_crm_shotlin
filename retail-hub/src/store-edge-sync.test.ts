import { describe, expect, it } from 'vitest';
import { checksumStoreEdgePayload, createInMemoryStoreEdgeSyncInbox, parseStoreEdgeSyncEvent, StoreEdgeSyncValidationError, type StoreEdgeSyncEventInput } from './store-edge-sync';

const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };
const otherScope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-2' };

function event(overrides: Partial<StoreEdgeSyncEventInput> = {}): StoreEdgeSyncEventInput {
  const payload = { saleNumber: 'POS/26-27/00001', status: 'completed', grandTotalInr: 118 };
  return {
    eventId: 'evt-001',
    eventType: 'retail.sale.completed',
    aggregateId: 'sale-001',
    transactionKey: 'POS-OFFLINE-001',
    sequence: 1,
    producedAt: '2026-08-06T10:00:00.000Z',
    payloadChecksum: checksumStoreEdgePayload(payload),
    payload,
    ...overrides,
  };
}

describe('Store Edge to Hub sync inbox', () => {
  it('validates a checksum-bound INR event and records it by scope', async () => {
    const inbox = createInMemoryStoreEdgeSyncInbox(() => 'receipt-1');
    const result = await inbox.accept(event(), scope, 'cashier-1', '2026-08-06T10:01:00.000Z');
    expect(result).toMatchObject({ outcome: 'recorded', receipt: { id: 'receipt-1', eventId: 'evt-001', payloadChecksum: event().payloadChecksum } });
    expect(await inbox.list(scope)).toHaveLength(1);
    expect(await inbox.list(otherScope)).toHaveLength(0);
  });

  it('is idempotent for the same event and checksum without duplicating the record', async () => {
    const inbox = createInMemoryStoreEdgeSyncInbox(() => 'receipt');
    await inbox.accept(event(), scope, 'cashier-1', '2026-08-06T10:01:00.000Z');
    const retry = await inbox.accept(event(), scope, 'hub-retry', '2026-08-06T10:02:00.000Z');
    expect(retry.outcome).toBe('idempotent');
    expect(await inbox.list(scope)).toHaveLength(2);
  });

  it('turns event-id and transaction-key drift into explicit conflicts', async () => {
    const inbox = createInMemoryStoreEdgeSyncInbox(() => 'receipt');
    await inbox.accept(event(), scope, 'cashier-1');
    const changedPayload = { saleNumber: 'POS/26-27/00001', status: 'completed', grandTotalInr: 119 };
    const driftedEvent = event({ payload: changedPayload, payloadChecksum: checksumStoreEdgePayload(changedPayload) });
    expect((await inbox.accept(driftedEvent, scope, 'cashier-1')).outcome).toBe('conflicted');
    const differentEvent = event({ eventId: 'evt-002', payload: changedPayload, payloadChecksum: checksumStoreEdgePayload(changedPayload) });
    expect((await inbox.accept(differentEvent, scope, 'cashier-1')).outcome).toBe('conflicted');
  });

  it('rejects stale or duplicate sequence numbers without replacing accepted evidence', async () => {
    const inbox = createInMemoryStoreEdgeSyncInbox(() => 'receipt');
    await inbox.accept(event(), scope, 'cashier-1');
    const stale = event({ eventId: 'evt-002', transactionKey: 'POS-OFFLINE-002', aggregateId: 'sale-002', sequence: 1 });
    const result = await inbox.accept(stale, scope, 'cashier-1');
    expect(result).toMatchObject({ outcome: 'conflicted', receipt: { detail: expect.stringContaining('Sequence') } });
  });

  it('keeps independent branches isolated while allowing each sequence to start at one', async () => {
    const inbox = createInMemoryStoreEdgeSyncInbox(() => 'receipt');
    expect((await inbox.accept(event(), scope, 'cashier-1')).outcome).toBe('recorded');
    expect((await inbox.accept(event(), otherScope, 'cashier-2')).outcome).toBe('recorded');
    expect(await inbox.list(scope)).toHaveLength(1);
    expect(await inbox.list(otherScope)).toHaveLength(1);
  });

  it('fails closed for checksum drift, secret-like fields, malformed values, and oversized payloads', () => {
    expect(() => parseStoreEdgeSyncEvent({ ...event(), payloadChecksum: '0'.repeat(64) })).toThrow(StoreEdgeSyncValidationError);
    expect(() => parseStoreEdgeSyncEvent({ ...event({ payload: { sale: { accessToken: 'never' } } }), payloadChecksum: checksumStoreEdgePayload({ sale: { accessToken: 'never' } }) })).toThrow(/not allowed/i);
    expect(() => parseStoreEdgeSyncEvent({ ...event(), sequence: 0 })).toThrow(/sequence/i);
    const payload = { notes: 'x'.repeat(96 * 1024) };
    expect(() => parseStoreEdgeSyncEvent({ ...event({ payload }), payloadChecksum: checksumStoreEdgePayload(payload) })).toThrow(/cannot exceed/i);
  });
});
