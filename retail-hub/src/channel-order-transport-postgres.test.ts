import { describe, expect, it } from 'vitest';
import {
  createPostgresRetailHubChannelOrderTransport,
  retailHubChannelOrderPostgresSchema,
} from './channel-order-transport-postgres';
import { normalizeRetailHubChannelOrderEvent } from './channel-order-transport';
import type { ShadowImportScope, ShadowImportSqlClient } from './shadow-import-postgres-repository';

const scope: ShadowImportScope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

function envelope(status: 'received' | 'accepted' | 'picking' = 'received') {
  return {
    mode: 'shadow' as const,
    event: normalizeRetailHubChannelOrderEvent({
      channel: 'website' as const,
      connectionId: 'bakaloo-web',
      externalOrderId: 'WEB-100',
      externalEventId: `WEB-100-${status}`,
      occurredAt: '2026-08-08T10:00:00.000Z',
      status,
      currency: 'INR' as const,
      totalAmountPaise: 14900,
      lines: [{ externalLineId: 'line-1', sku: 'RICE-5KG', quantity: 1, unitAmountPaise: 14900 }],
    }),
  };
}

function createFakeClient(): ShadowImportSqlClient {
  const records = new Map<string, Record<string, unknown>>();
  const receipts: Record<string, unknown>[] = [];
  const key = (params: readonly unknown[]) => `${params[0]}/${params[1]}/${params[2]}/${params[3]}`;
  const query = async <T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[] }> => {
    if (sql.includes('INSERT INTO retail_channel_order_records')) {
      const identity = key(params);
      if (records.has(identity)) return { rows: [] };
      const row = {
        tenant_id: params[0], company_id: params[1], branch_id: params[2], identity_key: params[3],
        event_id: params[4], source_digest: params[5], observed_status: params[6], mode: params[7],
        event_json: JSON.parse(String(params[8])), received_at: params[9], received_by: params[10],
      };
      records.set(identity, row);
      return { rows: [row as T] };
    }
    if (sql.includes('SELECT tenant_id, company_id, branch_id, identity_key')) {
      const row = records.get(key(params));
      return { rows: row ? [row as T] : [] };
    }
    if (sql.includes('UPDATE retail_channel_order_records')) {
      const identity = key(params);
      const row = records.get(identity);
      if (!row) return { rows: [] };
      Object.assign(row, { event_id: params[4], source_digest: params[5], observed_status: params[6], mode: row.mode === 'shadow' && params[7] === 'governed' ? 'governed' : row.mode, event_json: JSON.parse(String(params[8])), received_at: params[9], received_by: params[10] });
      return { rows: [row as T] };
    }
    if (sql.includes('INSERT INTO retail_channel_order_receipts')) {
      receipts.push(JSON.parse(String(params[11])));
      return { rows: [] };
    }
    if (sql.includes('SELECT receipt_json')) return { rows: receipts.map((receipt_json) => ({ receipt_json }) as T) };
    throw new Error(`Unexpected SQL in fake client: ${sql.slice(0, 80)}`);
  };
  const scopedClient = { query };
  return { query: async () => { throw new Error('unscoped query'); }, withScope: async (_scope, operation) => operation(scopedClient) };
}

describe('durable channel-order PostgreSQL transport', () => {
  it('requires a scope-aware client and exposes RLS schema', () => {
    expect(() => createPostgresRetailHubChannelOrderTransport({ client: { query: async () => ({ rows: [] }) } })).toThrow(/scope-aware/);
    expect(retailHubChannelOrderPostgresSchema).toMatch(/FORCE ROW LEVEL SECURITY/g);
    expect(retailHubChannelOrderPostgresSchema).toMatch(/retail_channel_order_records/);
    expect(retailHubChannelOrderPostgresSchema).toMatch(/retail_channel_order_receipts/);
  });

  it('persists idempotent/conflict outcomes and lists only scoped receipts', async () => {
    let receipt = 0;
    const transport = createPostgresRetailHubChannelOrderTransport({ client: createFakeClient(), createId: () => `receipt-${++receipt}`, now: () => '2026-08-08T10:01:00.000Z' });
    const first = await transport.accept(envelope(), scope, 'actor-1');
    const retry = await transport.accept(envelope(), scope, 'actor-2');
    const conflict = await transport.accept({ mode: 'shadow', event: normalizeRetailHubChannelOrderEvent({ ...envelope('received').event, totalAmountPaise: 15000 }) }, scope, 'actor-3');

    expect(first.outcome).toBe('recorded');
    expect(retry.outcome).toBe('idempotent');
    expect(conflict.outcome).toBe('conflicted');
    expect(await transport.list(scope)).toHaveLength(3);
  });

  it('advances a valid lifecycle transition while keeping evidence durable', async () => {
    let receipt = 0;
    const transport = createPostgresRetailHubChannelOrderTransport({ client: createFakeClient(), createId: () => `receipt-${++receipt}`, now: () => '2026-08-08T10:01:00.000Z' });
    await transport.accept(envelope(), scope, 'actor-1');
    const advanced = await transport.accept(envelope('accepted'), scope, 'actor-1');
    expect(advanced.outcome).toBe('recorded');
    expect(advanced.record?.event.status).toBe('accepted');
  });
});
