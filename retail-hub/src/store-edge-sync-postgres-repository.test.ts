import { describe, expect, it, vi } from 'vitest';
import { shadowImportPostgresSchema, type ShadowImportScope, type ShadowImportSqlClient } from './shadow-import-postgres-repository';
import { checksumStoreEdgePayload, type StoreEdgeSyncEventInput } from './store-edge-sync';
import { createPostgresStoreEdgeSyncRepository } from './store-edge-sync-postgres-repository';

const scope: ShadowImportScope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

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

describe('durable Store Edge sync repository', () => {
  it('registers a checksum-bound event and receipt through the trusted scoped client', async () => {
    const calls: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const client = fakeClient(calls);
    const repository = createPostgresStoreEdgeSyncRepository(client);
    const result = await repository.accept(event(), scope, 'cashier-1', '2026-08-06T10:01:00.000Z');
    expect(result.outcome).toBe('recorded');
    expect(result.record).toMatchObject({ eventId: 'evt-001', receivedBy: 'cashier-1', scope });
    expect(calls.find(({ sql }) => sql.includes('pg_advisory_xact_lock'))).toMatchObject({
      parameters: [scope.tenantId, scope.companyId, scope.branchId],
    });
    expect(calls.some(({ sql }) => sql.includes('INSERT INTO retail_store_edge_sync_events'))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes('INSERT INTO retail_store_edge_sync_receipts'))).toBe(true);
  });

  it('returns idempotent evidence for a durable existing event with the same checksum', async () => {
    const stored = event();
    const eventJson = { ...stored, scope, receivedAt: '2026-08-06T10:01:00.000Z', receivedBy: 'cashier-1' };
    const calls: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const client = fakeClient(calls, { eventRows: [{ event_json: eventJson, payload_checksum: stored.payloadChecksum }] });
    const repository = createPostgresStoreEdgeSyncRepository(client);
    const result = await repository.accept(stored, scope, 'hub-retry', '2026-08-06T10:02:00.000Z');
    expect(result.outcome).toBe('idempotent');
    expect(result.record).toMatchObject({ receivedBy: 'cashier-1' });
    expect(calls.some(({ sql }) => sql.includes('INSERT INTO retail_store_edge_sync_events'))).toBe(false);
  });

  it('resolves an insert race from the authoritative event row', async () => {
    const stored = event();
    const storedJson = { ...stored, scope, receivedAt: '2026-08-06T10:01:00.000Z', receivedBy: 'cashier-1' };
    let eventLookups = 0;
    const scoped: ShadowImportSqlClient = {
      async query<T = Record<string, unknown>>(sql: string) {
        if (sql.includes('FROM retail_store_edge_sync_events') && sql.includes('event_id')) {
          eventLookups += 1;
          return { rows: eventLookups === 1 ? [] as T[] : [{ event_json: storedJson, payload_checksum: stored.payloadChecksum }] as T[] };
        }
        if (sql.includes('FROM retail_store_edge_sync_events') && sql.includes('transaction_key')) return { rows: [] as T[] };
        if (sql.includes('MAX(sequence)')) return { rows: [{ sequence: null }] as T[] };
        if (sql.includes('INSERT INTO retail_store_edge_sync_events')) return { rows: [] as T[] };
        return { rows: [] as T[] };
      },
    };
    const client: ShadowImportSqlClient = { ...scoped, withScope: async (_scope, operation) => operation(scoped) };
    const result = await createPostgresStoreEdgeSyncRepository(client).accept(stored, scope, 'hub-retry', '2026-08-06T10:02:00.000Z');
    expect(result.outcome).toBe('idempotent');
    expect(result.record).toMatchObject({ eventId: stored.eventId, receivedBy: 'cashier-1' });
    expect(eventLookups).toBe(2);
  });

  it('commits the event, receipt, and worker item through one transaction wrapper', async () => {
    const calls: string[] = [];
    let withScopeCalls = 0;
    let workLookups = 0;
    const storedJson = { ...event(), scope, receivedAt: '2026-08-06T10:01:00.000Z', receivedBy: 'cashier-1' };
    const workJson = { id: 'evt-001:work', eventId: 'evt-001', scope, status: 'pending', attempts: 0, availableAt: '2026-08-06T10:01:00.000Z' };
    const scoped: ShadowImportSqlClient = {
      async query<T = Record<string, unknown>>(sql: string) {
        calls.push(sql);
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [] as T[] };
        if (sql.includes('FROM retail_store_edge_sync_events') && sql.includes('event_id')) return { rows: [] as T[] };
        if (sql.includes('FROM retail_store_edge_sync_events') && sql.includes('transaction_key')) return { rows: [] as T[] };
        if (sql.includes('MAX(sequence)')) return { rows: [{ sequence: null }] as T[] };
        if (sql.includes('INSERT INTO retail_store_edge_sync_events')) return { rows: [{ event_json: storedJson, payload_checksum: event().payloadChecksum }] as T[] };
        if (sql.includes('FROM retail_store_edge_sync_work') && sql.includes('event_id')) {
          workLookups += 1;
          return { rows: workLookups === 1 ? [] as T[] : [{ work_json: workJson }] as T[] };
        }
        if (sql.includes('INSERT INTO retail_store_edge_sync_work')) return { rows: [] as T[] };
        return { rows: [] as T[] };
      },
    };
    const client: ShadowImportSqlClient = {
      ...scoped,
      withScope: async (requestedScope, operation) => {
        withScopeCalls += 1;
        expect(requestedScope).toEqual(scope);
        return operation(scoped);
      },
    };
    const result = await createPostgresStoreEdgeSyncRepository(client).acceptAndEnqueue(event(), scope, 'cashier-1', '2026-08-06T10:01:00.000Z');
    expect(result).toMatchObject({ outcome: 'recorded', workItemId: 'evt-001:work' });
    expect(withScopeCalls).toBe(1);
    expect(calls.some((sql) => sql.includes('INSERT INTO retail_store_edge_sync_receipts'))).toBe(true);
    expect(calls.some((sql) => sql.includes('INSERT INTO retail_store_edge_sync_work'))).toBe(true);
  });

  it('keeps the sync migration scope-bound and force-encrypted by RLS policies', () => {
    expect(shadowImportPostgresSchema).toContain('retail_store_edge_sync_events');
    expect(shadowImportPostgresSchema).toContain('retail_store_edge_sync_receipts');
    expect((shadowImportPostgresSchema.match(/ALTER TABLE retail_store_edge_sync_(?:events|receipts) FORCE ROW LEVEL SECURITY/g) ?? []).length).toBe(2);
    expect(shadowImportPostgresSchema).toContain("current_setting('epic_bos.tenant_id', true)");
  });

  it('fails closed when a deployment omits the transaction scope wrapper', async () => {
    const client: ShadowImportSqlClient = { query: vi.fn() };
    await expect(createPostgresStoreEdgeSyncRepository(client).list(scope)).rejects.toThrow(/transaction-scoped/i);
    expect(client.query).not.toHaveBeenCalled();
  });
});

function fakeClient(
  calls: Array<{ sql: string; parameters: readonly unknown[] }>,
  options: { eventRows?: Array<{ event_json: unknown; payload_checksum: string }>; receiptRows?: Array<{ receipt_json: unknown }> } = {},
): ShadowImportSqlClient {
  const eventRows = options.eventRows ?? [];
  const receiptRows = options.receiptRows ?? [];
  const scoped: ShadowImportSqlClient = {
    async query<T = Record<string, unknown>>(sql: string, parameters: readonly unknown[] = []) {
      calls.push({ sql, parameters });
      if (sql.includes('FROM retail_store_edge_sync_events') && sql.includes('event_id')) return { rows: eventRows as T[] };
      if (sql.includes('FROM retail_store_edge_sync_events') && sql.includes('transaction_key')) return { rows: [] as T[] };
      if (sql.includes('MAX(sequence)')) return { rows: [{ sequence: null }] as T[] };
      if (sql.includes('INSERT INTO retail_store_edge_sync_events')) {
        const stored = event();
        return { rows: [{ event_json: { ...stored, scope, receivedAt: '2026-08-06T10:01:00.000Z', receivedBy: 'cashier-1' }, payload_checksum: stored.payloadChecksum }] as T[] };
      }
      if (sql.includes('FROM retail_store_edge_sync_receipts')) return { rows: receiptRows as T[] };
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
