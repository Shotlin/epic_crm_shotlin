import { describe, expect, it } from 'vitest';
import type { ShadowImportScope } from './shadow-import-postgres-repository';
import { checksumStoreEdgePayload, type StoreEdgeSyncRecord } from './store-edge-sync';
import { createInMemoryStoreEdgeSyncWorkStore } from './store-edge-sync-worker';
import { createStoreEdgeSyncWorkerRuntime, type StoreEdgeSyncWorkerMetrics, type StoreEdgeSyncWorkerMetricsStore } from './store-edge-sync-worker-runtime';

const scope: ShadowImportScope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };
const otherScope: ShadowImportScope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-2' };

function createDurableMetricsStore(): StoreEdgeSyncWorkerMetricsStore {
  const values = new Map<string, StoreEdgeSyncWorkerMetrics>();
  const key = (requestedScope: ShadowImportScope) => JSON.stringify([requestedScope.tenantId, requestedScope.companyId, requestedScope.branchId]);
  return {
    async load(requestedScope) {
      const stored = values.get(key(requestedScope));
      return stored ? structuredClone(stored) : { runs: 0, claimed: 0, completed: 0, retryable: 0, deadLetter: 0 };
    },
    async save(requestedScope, metrics) { values.set(key(requestedScope), structuredClone(metrics)); },
  };
}

function record(eventId: string): StoreEdgeSyncRecord {
  const payload = { saleNumber: eventId, status: 'completed', grandTotalInr: 118 };
  return {
    eventId, eventType: 'retail.sale.completed', aggregateId: `sale-${eventId}`, transactionKey: `POS-${eventId}`, sequence: Number(eventId.slice(-1)) || 1,
    producedAt: '2026-08-06T10:00:00.000Z', payloadChecksum: checksumStoreEdgePayload(payload), payload, scope,
    receivedAt: '2026-08-06T10:00:01.000Z', receivedBy: 'cashier-1',
  };
}

describe('Store Edge sync worker runtime', () => {
  it('processes a bounded batch and records completion metrics', async () => {
    let id = 0;
    const store = createInMemoryStoreEdgeSyncWorkStore(() => `work-${++id}`);
    await store.enqueue(record('evt-1'), '2026-08-06T10:01:00.000Z');
    await store.enqueue(record('evt-2'), '2026-08-06T10:01:01.000Z');
    const clockValue = '2026-08-06T10:03:00.000Z';
    const runtime = createStoreEdgeSyncWorkerRuntime(store, () => clockValue);
    const processed: string[] = [];
    const report = await runtime.runOnce({ scope, workerId: 'worker-1', now: clockValue, limit: 1 }, async (item) => { processed.push(item.eventId); });
    expect(report).toMatchObject({ workerId: 'worker-1', claimed: 1, completed: 1, retryable: 0, deadLetter: 0 });
    expect(processed).toEqual(['evt-1']);
    expect(runtime.metrics()).toMatchObject({ runs: 1, claimed: 1, completed: 1, retryable: 0, deadLetter: 0, lastRunAt: clockValue });
  });

  it('converts processor failures into retryable work with evidence', async () => {
    const store = createInMemoryStoreEdgeSyncWorkStore(() => 'work');
    await store.enqueue(record('evt-1'), '2026-08-06T10:01:00.000Z');
    const runtime = createStoreEdgeSyncWorkerRuntime(store, () => '2026-08-06T10:03:00.000Z');
    const report = await runtime.runOnce({ scope, workerId: 'worker-1', now: '2026-08-06T10:03:00.000Z', backoffMs: 5_000, maxAttempts: 3 }, async () => { throw new Error('Provider temporarily unavailable'); });
    expect(report).toMatchObject({ claimed: 1, completed: 0, retryable: 1, deadLetter: 0, failures: [{ error: 'Provider temporarily unavailable', status: 'retryable' }] });
    expect((await store.list(scope))[0]).toMatchObject({ status: 'retryable', lastError: 'Provider temporarily unavailable' });
  });

  it('renews a long-running lease before acknowledging the work item', async () => {
    let id = 0;
    const baseStore = createInMemoryStoreEdgeSyncWorkStore(() => `work-${++id}`);
    let renewals = 0;
    const store = {
      ...baseStore,
      async renew(...args: Parameters<typeof baseStore.renew>) {
        renewals += 1;
        return baseStore.renew(...args);
      },
    };
    await store.enqueue(record('evt-1'), '2026-08-06T10:01:00.000Z');
    const runtime = createStoreEdgeSyncWorkerRuntime(store, () => '2026-08-06T10:03:00.000Z');
    const report = await runtime.runOnce(
      { scope, workerId: 'worker-1', now: '2026-08-06T10:03:00.000Z', leaseMs: 1_000, leaseHeartbeatMs: 250 },
      async () => { await new Promise((resolve) => setTimeout(resolve, 1_100)); },
    );
    expect(report).toMatchObject({ claimed: 1, completed: 1, retryable: 0, deadLetter: 0 });
    expect(renewals).toBeGreaterThan(0);
  });

  it('reports dead letters without swallowing the failing event identity', async () => {
    const store = createInMemoryStoreEdgeSyncWorkStore(() => 'work');
    await store.enqueue(record('evt-1'), '2026-08-06T10:01:00.000Z');
    const runtime = createStoreEdgeSyncWorkerRuntime(store, () => '2026-08-06T10:02:00.000Z');
    const report = await runtime.runOnce({ scope, workerId: 'worker-1', now: '2026-08-06T10:02:00.000Z', maxAttempts: 1 }, async () => { throw new Error('permanent failure'); });
    expect(report).toMatchObject({ claimed: 1, deadLetter: 1, failures: [{ eventId: 'evt-1', status: 'dead-letter' }] });
    expect((await store.list(scope))[0]).toMatchObject({ status: 'dead-letter' });
  });

  it('rejects missing processors before claiming work', async () => {
    const store = createInMemoryStoreEdgeSyncWorkStore();
    const runtime = createStoreEdgeSyncWorkerRuntime(store);
    await expect(runtime.runOnce({ scope, workerId: 'worker-1' }, undefined as never)).rejects.toThrow(/processor/i);
    expect(runtime.metrics().runs).toBe(0);
  });

  it('restores metrics after a runtime restart and never mixes branch scopes', async () => {
    let id = 0;
    const store = createInMemoryStoreEdgeSyncWorkStore(() => `work-${++id}`);
    await store.enqueue(record('evt-1'), '2026-08-06T10:01:00.000Z');
    const metricsStore = createDurableMetricsStore();
    const firstRuntime = createStoreEdgeSyncWorkerRuntime(store, () => '2026-08-06T10:03:00.000Z', metricsStore);
    await firstRuntime.runOnce({ scope, workerId: 'worker-1', now: '2026-08-06T10:03:00.000Z' }, async () => undefined);

    const secondRuntime = createStoreEdgeSyncWorkerRuntime(store, () => '2026-08-06T10:04:00.000Z', metricsStore);
    expect(secondRuntime.metrics(scope)).toEqual({ runs: 0, claimed: 0, completed: 0, retryable: 0, deadLetter: 0 });
    await expect(secondRuntime.loadMetrics(scope)).resolves.toMatchObject({ runs: 1, claimed: 1, completed: 1 });
    await secondRuntime.runOnce({ scope, workerId: 'worker-2', now: '2026-08-06T10:04:00.000Z' }, async () => undefined);
    expect(secondRuntime.metrics(scope)).toMatchObject({ runs: 2, claimed: 1, completed: 1 });
    expect(secondRuntime.metrics(otherScope)).toEqual({ runs: 0, claimed: 0, completed: 0, retryable: 0, deadLetter: 0 });
  });

  it('fails closed when durable metrics are malformed', async () => {
    const store = createInMemoryStoreEdgeSyncWorkStore();
    const metricsStore: StoreEdgeSyncWorkerMetricsStore = {
      async load() { return { runs: -1, claimed: 0, completed: 0, retryable: 0, deadLetter: 0 }; },
      async save() { throw new Error('must not save'); },
    };
    const runtime = createStoreEdgeSyncWorkerRuntime(store, undefined, metricsStore);
    await expect(runtime.runOnce({ scope, workerId: 'worker-1' }, async () => undefined)).rejects.toThrow(/metric runs/i);
  });
});
