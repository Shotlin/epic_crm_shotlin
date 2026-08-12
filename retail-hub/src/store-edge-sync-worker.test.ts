import { describe, expect, it } from 'vitest';
import type { ShadowImportScope } from './shadow-import-postgres-repository';
import { checksumStoreEdgePayload, type StoreEdgeSyncRecord } from './store-edge-sync';
import { createInMemoryStoreEdgeSyncWorkStore, StoreEdgeSyncWorkerValidationError } from './store-edge-sync-worker';

const scope: ShadowImportScope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

function record(eventId = 'evt-001'): StoreEdgeSyncRecord {
  const payload = { saleNumber: eventId, status: 'completed', grandTotalInr: 118 };
  return {
    eventId,
    eventType: 'retail.sale.completed',
    aggregateId: `sale-${eventId}`,
    transactionKey: `POS-${eventId}`,
    sequence: 1,
    producedAt: '2026-08-06T10:00:00.000Z',
    payloadChecksum: checksumStoreEdgePayload(payload),
    payload,
    scope,
    receivedAt: '2026-08-06T10:00:01.000Z',
    receivedBy: 'cashier-1',
  };
}

describe('Store Edge sync worker leases', () => {
  it('enqueues idempotently and claims work with a bounded lease', async () => {
    const store = createInMemoryStoreEdgeSyncWorkStore(() => 'work-1');
    const first = await store.enqueue(record(), '2026-08-06T10:01:00.000Z');
    const duplicate = await store.enqueue(record(), '2026-08-06T10:02:00.000Z');
    expect(first).toEqual(duplicate);
    const claimed = await store.claim(scope, { workerId: 'hub-worker-1', now: '2026-08-06T10:03:00.000Z', leaseMs: 60_000, limit: 10 });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ id: 'work-1', status: 'leased', attempts: 1, leaseOwner: 'hub-worker-1' });
    expect((await store.claim(scope, { workerId: 'hub-worker-2', now: '2026-08-06T10:03:10.000Z' }))).toHaveLength(0);
  });

  it('allows the same work to be reclaimed after lease expiry but rejects stale completion', async () => {
    const store = createInMemoryStoreEdgeSyncWorkStore(() => 'work-1');
    await store.enqueue(record(), '2026-08-06T10:01:00.000Z');
    const firstClaim = await store.claim(scope, { workerId: 'hub-worker-1', now: '2026-08-06T10:03:00.000Z', leaseMs: 1_000 });
    await expect(store.complete(scope, 'work-1', 'hub-worker-1', '2026-08-06T10:04:01.000Z', firstClaim[0]?.leaseToken)).rejects.toThrow(/expired/i);
    const reclaimed = await store.claim(scope, { workerId: 'hub-worker-2', now: '2026-08-06T10:04:02.000Z', leaseMs: 1_000 });
    expect(reclaimed[0]).toMatchObject({ status: 'leased', attempts: 2, leaseOwner: 'hub-worker-2' });
  });

  it('renews an active fenced lease without changing its attempt or owner', async () => {
    const store = createInMemoryStoreEdgeSyncWorkStore(() => 'work-1');
    await store.enqueue(record(), '2026-08-06T10:01:00.000Z');
    const claimed = await store.claim(scope, { workerId: 'hub-worker-1', now: '2026-08-06T10:03:00.000Z', leaseMs: 1_000 });
    const renewed = await store.renew(scope, 'work-1', 'hub-worker-1', '2026-08-06T10:03:00.500Z', 5_000, claimed[0]?.leaseToken);
    expect(renewed).toMatchObject({ status: 'leased', attempts: 1, leaseOwner: 'hub-worker-1', leaseExpiresAt: '2026-08-06T10:03:05.500Z' });
    await expect(store.renew(scope, 'work-1', 'hub-worker-1', '2026-08-06T10:03:00.600Z', 5_000, 'stale-token')).rejects.toThrow(/fencing token|leased/i);
  });

  it('fences a stale lease even when the worker id is reused', async () => {
    const store = createInMemoryStoreEdgeSyncWorkStore(() => 'work-1');
    await store.enqueue(record(), '2026-08-06T10:01:00.000Z');
    const first = await store.claim(scope, { workerId: 'hub-worker-1', now: '2026-08-06T10:03:00.000Z', leaseMs: 1_000 });
    const second = await store.claim(scope, { workerId: 'hub-worker-1', now: '2026-08-06T10:04:02.000Z', leaseMs: 1_000 });
    expect(first[0]?.leaseToken).toBeTruthy();
    expect(second[0]?.leaseToken).toBeTruthy();
    expect(second[0]?.leaseToken).not.toBe(first[0]?.leaseToken);
    await expect(store.complete(scope, 'work-1', 'hub-worker-1', '2026-08-06T10:04:02.500Z', first[0]?.leaseToken)).rejects.toThrow(/fencing token|leased/i);
    await expect(store.complete(scope, 'work-1', 'hub-worker-1', '2026-08-06T10:04:02.500Z', second[0]?.leaseToken)).resolves.toMatchObject({ status: 'completed' });
  });

  it('completes only the active lease and clears retry error evidence', async () => {
    const store = createInMemoryStoreEdgeSyncWorkStore(() => 'work-1');
    await store.enqueue(record(), '2026-08-06T10:01:00.000Z');
    const claimed = await store.claim(scope, { workerId: 'hub-worker-1', now: '2026-08-06T10:03:00.000Z' });
    const completed = await store.complete(scope, 'work-1', 'hub-worker-1', '2026-08-06T10:03:30.000Z', claimed[0]?.leaseToken);
    expect(completed).toMatchObject({ status: 'completed', attempts: 1, completedAt: '2026-08-06T10:03:30.000Z' });
    await expect(store.complete(scope, 'work-1', 'hub-worker-1', '2026-08-06T10:03:31.000Z', claimed[0]?.leaseToken)).rejects.toThrow(StoreEdgeSyncWorkerValidationError);
  });

  it('backs off retryable work and dead-letters after the configured attempts', async () => {
    const store = createInMemoryStoreEdgeSyncWorkStore(() => 'work-1');
    await store.enqueue(record(), '2026-08-06T10:01:00.000Z');
    const firstClaim = await store.claim(scope, { workerId: 'hub-worker-1', now: '2026-08-06T10:03:00.000Z' });
    const retry = await store.retry(scope, 'work-1', 'hub-worker-1', 'Temporary Hub timeout', '2026-08-06T10:03:10.000Z', 5_000, 2, firstClaim[0]?.leaseToken);
    expect(retry).toMatchObject({ status: 'retryable', attempts: 1, availableAt: '2026-08-06T10:03:15.000Z', lastError: 'Temporary Hub timeout' });
    expect((await store.claim(scope, { workerId: 'hub-worker-2', now: '2026-08-06T10:03:14.000Z' }))).toHaveLength(0);
    const secondClaim = await store.claim(scope, { workerId: 'hub-worker-2', now: '2026-08-06T10:03:15.000Z' });
    const dead = await store.retry(scope, 'work-1', 'hub-worker-2', 'Second failure', '2026-08-06T10:03:16.000Z', 5_000, 2, secondClaim[0]?.leaseToken);
    expect(dead).toMatchObject({ status: 'dead-letter', attempts: 2, lastError: 'Second failure' });
  });

  it('requeues only a dead letter with explicit operator evidence and resets its retry budget', async () => {
    const store = createInMemoryStoreEdgeSyncWorkStore(() => 'work-1');
    await store.enqueue(record(), '2026-08-06T10:01:00.000Z');
    const claimed = await store.claim(scope, { workerId: 'hub-worker-1', now: '2026-08-06T10:03:00.000Z' });
    const dead = await store.retry(scope, 'work-1', 'hub-worker-1', 'Permanent Hub rejection', '2026-08-06T10:03:01.000Z', 0, 1, claimed[0]?.leaseToken);
    expect(dead.status).toBe('dead-letter');
    const recovered = await store.requeueDeadLetter(scope, 'work-1', 'manager-1', 'Provider issue corrected and replay approved.', 'INC-2026-0007', '2026-08-06T10:04:00.000Z');
    expect(recovered).toMatchObject({ status: 'retryable', attempts: 0, requeueCount: 1, lastRecoveryBy: 'manager-1', lastRecoveryReference: 'INC-2026-0007' });
    await expect(store.requeueDeadLetter(scope, 'work-1', 'manager-1', 'Another recovery attempt.', 'INC-2026-0008', '2026-08-06T10:04:01.000Z')).rejects.toThrow(/dead-letter/i);
  });

  it('keeps scopes isolated and validates lease/claim bounds', async () => {
    const store = createInMemoryStoreEdgeSyncWorkStore(() => 'work-1');
    await store.enqueue(record(), '2026-08-06T10:01:00.000Z');
    expect(await store.list({ ...scope, branchId: 'branch-2' })).toHaveLength(0);
    await expect(store.claim(scope, { workerId: 'hub-worker-1', leaseMs: 500 })).rejects.toThrow(/lease duration/i);
    await expect(store.claim(scope, { workerId: 'hub-worker-1', limit: 101 })).rejects.toThrow(/claim limit/i);
    await expect(store.claim(scope, { workerId: ' ', limit: 1 })).rejects.toThrow(/worker/i);
  });
});
