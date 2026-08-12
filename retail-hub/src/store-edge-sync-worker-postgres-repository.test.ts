import { describe, expect, it, vi } from 'vitest';
import type { ShadowImportScope, ShadowImportSqlClient } from './shadow-import-postgres-repository';
import { checksumStoreEdgePayload, type StoreEdgeSyncRecord } from './store-edge-sync';
import { createPostgresStoreEdgeSyncWorkerRepository } from './store-edge-sync-worker-postgres-repository';
import type { StoreEdgeSyncWorkItem } from './store-edge-sync-worker';

const scope: ShadowImportScope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

function record(): StoreEdgeSyncRecord {
  const payload = { saleNumber: 'POS/26-27/00001', status: 'completed', grandTotalInr: 118 };
  return {
    eventId: 'evt-001', eventType: 'retail.sale.completed', aggregateId: 'sale-001', transactionKey: 'POS-OFFLINE-001', sequence: 1,
    producedAt: '2026-08-06T10:00:00.000Z', payloadChecksum: checksumStoreEdgePayload(payload), payload, scope,
    receivedAt: '2026-08-06T10:00:01.000Z', receivedBy: 'cashier-1',
  };
}

function work(): StoreEdgeSyncWorkItem {
  return { id: 'evt-001:work', eventId: 'evt-001', scope, status: 'leased', attempts: 1, availableAt: '2026-08-06T10:01:00.000Z', leaseOwner: 'worker-1', leaseExpiresAt: '2026-08-06T10:02:00.000Z', leaseToken: 'lease-token-1' };
}

describe('durable Store Edge worker repository', () => {
  it('enqueues through the scoped SQL boundary and returns an existing work item idempotently', async () => {
    const calls: string[] = [];
    const client = fakeClient(calls, { authoritativeRows: [{ work_json: { id: 'evt-001:work', eventId: 'evt-001', scope, status: 'pending', attempts: 0, availableAt: '2026-08-06T10:01:00.000Z' } }] });
    const repository = createPostgresStoreEdgeSyncWorkerRepository(client);
    const created = await repository.enqueue(record(), '2026-08-06T10:01:00.000Z');
    expect(created).toMatchObject({ id: 'evt-001:work', status: 'pending', attempts: 0 });
    expect(calls.some((sql) => sql.includes('INSERT INTO retail_store_edge_sync_work'))).toBe(true);
    const existingClient = fakeClient([], { workRows: [{ work_json: created }] });
    const existing = await createPostgresStoreEdgeSyncWorkerRepository(existingClient).enqueue(record(), '2026-08-06T10:02:00.000Z');
    expect(existing).toEqual(created);
  });

  it('claims a bounded lease and updates completion only for an active worker', async () => {
    const calls: string[] = [];
    const client = fakeClient(calls, { claimRows: [{ work_json: { ...work(), status: 'leased', attempts: 2, leaseOwner: 'worker-2', leaseExpiresAt: '2026-08-06T10:04:00.000Z' } }] });
    const repository = createPostgresStoreEdgeSyncWorkerRepository(client);
    const claimed = await repository.claim(scope, { workerId: 'worker-2', now: '2026-08-06T10:03:00.000Z', leaseMs: 60_000, limit: 5 });
    expect(claimed[0]).toMatchObject({ status: 'leased', attempts: 2, leaseOwner: 'worker-2' });
    expect(calls.some((sql) => sql.includes('FOR UPDATE SKIP LOCKED'))).toBe(true);
    const completeClient = fakeClient([], { leaseRows: [{ work_json: work() }] });
    const completed = await createPostgresStoreEdgeSyncWorkerRepository(completeClient).complete(scope, 'evt-001:work', 'worker-1', '2026-08-06T10:01:30.000Z', 'lease-token-1');
    expect(completed).toMatchObject({ status: 'completed', completedAt: '2026-08-06T10:01:30.000Z' });
  });

  it('renews a fenced lease through the scoped SQL update boundary', async () => {
    const calls: string[] = [];
    const renewed = await createPostgresStoreEdgeSyncWorkerRepository(fakeClient(calls, { leaseRows: [{ work_json: work() }] })).renew(
      scope, 'evt-001:work', 'worker-1', '2026-08-06T10:01:30.000Z', 5_000, 'lease-token-1',
    );
    expect(renewed).toMatchObject({ status: 'leased', leaseOwner: 'worker-1', leaseExpiresAt: '2026-08-06T10:01:35.000Z', leaseToken: 'lease-token-1' });
    expect(calls.some((sql) => sql.includes('lease_token = $10'))).toBe(true);
  });

  it('returns the authoritative row when a concurrent enqueue wins the insert race', async () => {
    let eventLookups = 0;
    const authoritative = { ...work(), status: 'leased' as const, attempts: 1, leaseOwner: 'other-worker', leaseExpiresAt: '2026-08-06T10:05:00.000Z' };
    const scoped: ShadowImportSqlClient = {
      async query<T = Record<string, unknown>>(sql: string) {
        if (sql.includes('FROM retail_store_edge_sync_work') && sql.includes('event_id')) {
          eventLookups += 1;
          return { rows: eventLookups === 1 ? [] as T[] : [{ work_json: authoritative }] as T[] };
        }
        return { rows: [] as T[] };
      },
    };
    const client: ShadowImportSqlClient = {
      ...scoped,
      withScope: async (_requestedScope, operation) => operation(scoped),
    };
    const created = await createPostgresStoreEdgeSyncWorkerRepository(client).enqueue(record(), '2026-08-06T10:01:00.000Z');
    expect(created).toMatchObject({ status: 'leased', leaseOwner: 'other-worker' });
    expect(eventLookups).toBe(2);
  });

  it('fails closed when an enqueue insert has no authoritative row', async () => {
    await expect(createPostgresStoreEdgeSyncWorkerRepository(fakeClient([])).enqueue(record(), '2026-08-06T10:01:00.000Z')).rejects.toThrow(/no authoritative row/i);
  });

  it('fails closed when a deployment omits the transaction scope wrapper', async () => {
    const client: ShadowImportSqlClient = { query: vi.fn() };
    await expect(createPostgresStoreEdgeSyncWorkerRepository(client).list(scope)).rejects.toThrow(/transaction-scoped/i);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('persists retry/dead-letter transitions and exposes scope-bound work rows', async () => {
    const retryClient = fakeClient([], { leaseRows: [{ work_json: work() }] });
    const retried = await createPostgresStoreEdgeSyncWorkerRepository(retryClient).retry(scope, 'evt-001:work', 'worker-1', 'timeout', '2026-08-06T10:01:30.000Z', 5000, 3, 'lease-token-1');
    expect(retried).toMatchObject({ status: 'retryable', availableAt: '2026-08-06T10:01:35.000Z', lastError: 'timeout' });
    const listed = await createPostgresStoreEdgeSyncWorkerRepository(fakeClient([], { listRows: [{ work_json: retried }] })).list(scope);
    expect(listed).toEqual([retried]);
  });

  it('requeues a dead letter through a scope-locked, evidence-bound update', async () => {
    const calls: string[] = [];
    const dead = { ...work(), status: 'dead-letter' as const, attempts: 3, lastError: 'provider rejected' };
    const recovered = await createPostgresStoreEdgeSyncWorkerRepository(fakeClient(calls, { leaseRows: [{ work_json: dead }] })).requeueDeadLetter(
      scope, 'evt-001:work', 'manager-1', 'Provider issue corrected and replay approved.', 'INC-2026-0007', '2026-08-06T10:04:00.000Z',
    );
    expect(recovered).toMatchObject({ status: 'retryable', attempts: 0, requeueCount: 1, lastRecoveryBy: 'manager-1', lastRecoveryReference: 'INC-2026-0007' });
    expect(calls.some((sql) => sql.includes("status = 'dead-letter'") && sql.includes('FOR UPDATE'))).toBe(true);
  });
});

function fakeClient(calls: string[], options: { workRows?: Array<{ work_json: unknown }>; authoritativeRows?: Array<{ work_json: unknown }>; claimRows?: Array<{ work_json: unknown }>; leaseRows?: Array<{ work_json: unknown }>; listRows?: Array<{ work_json: unknown }> } = {}): ShadowImportSqlClient {
  let eventLookupCount = 0;
  const scoped: ShadowImportSqlClient = {
    async query<T = Record<string, unknown>>(sql: string) {
      calls.push(sql);
      if (sql.includes('SELECT work_json') && sql.includes('event_id')) {
        eventLookupCount += 1;
        if (options.workRows) return { rows: options.workRows as T[] };
        return { rows: eventLookupCount === 1 ? [] as T[] : (options.authoritativeRows ?? []) as T[] };
      }
      if (sql.includes('RETURNING work.work_json')) return { rows: (options.claimRows ?? []) as T[] };
      if (sql.includes('SELECT work_json') && sql.includes('ORDER BY available_at')) return { rows: (options.listRows ?? []) as T[] };
      if (sql.includes('SELECT work_json') && sql.includes('work_id')) return { rows: (options.leaseRows ?? []) as T[] };
      return { rows: [] as T[] };
    },
  };
  return {
    ...scoped,
    async withScope(requestedScope, operation) {
      expect(requestedScope).toEqual(scope);
      return operation(scoped);
    },
  };
}
