import { describe, expect, it, vi } from 'vitest';
import { shadowImportPostgresSchema, type ShadowImportScope, type ShadowImportSqlClient } from './shadow-import-postgres-repository';
import { createPostgresStoreEdgeSyncWorkerMetricsRepository } from './store-edge-sync-worker-metrics-postgres-repository';

const scope: ShadowImportScope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

describe('PostgreSQL Store Edge worker metrics repository', () => {
  it('loads an empty projection and upserts only the requested legal scope', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const scopes: ShadowImportScope[] = [];
    const client: ShadowImportSqlClient = {
      query,
      withScope: async (requestedScope, operation) => {
        scopes.push(requestedScope);
        return operation({ query });
      },
    };
    const repository = createPostgresStoreEdgeSyncWorkerMetricsRepository(client);
    await expect(repository.load(scope)).resolves.toEqual({ runs: 0, claimed: 0, completed: 0, retryable: 0, deadLetter: 0 });
    await repository.save(scope, { runs: 4, claimed: 8, completed: 7, retryable: 1, deadLetter: 0, lastRunAt: '2026-08-07T10:00:00.000Z' });
    expect(scopes).toEqual([scope, scope]);
    expect(query.mock.calls[0]?.[0]).toMatch(/FROM retail_store_edge_sync_worker_metrics/);
    expect(query.mock.calls[0]?.[1]).toEqual([scope.tenantId, scope.companyId, scope.branchId]);
    expect(query.mock.calls[1]?.[0]).toContain('ON CONFLICT (tenant_id, company_id, branch_id)');
    expect(query.mock.calls[1]?.[1]).toEqual([scope.tenantId, scope.companyId, scope.branchId, expect.stringContaining('"runs":4')]);
  });

  it('parses stored JSON and rejects malformed or unscoped metrics', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ metrics_json: JSON.stringify({ runs: 2, claimed: 2, completed: 2, retryable: 0, deadLetter: 0 }) }] });
    const repository = createPostgresStoreEdgeSyncWorkerMetricsRepository({ query, withScope: async (_scope, operation) => operation({ query }) });
    await expect(repository.load(scope)).resolves.toMatchObject({ runs: 2, completed: 2 });
    const malformedQuery = vi.fn().mockResolvedValue({ rows: [{ metrics_json: { runs: -1, claimed: 0, completed: 0, retryable: 0, deadLetter: 0 } }] });
    const malformed = createPostgresStoreEdgeSyncWorkerMetricsRepository({ query: malformedQuery, withScope: async (_scope, operation) => operation({ query: malformedQuery }) });
    await expect(malformed.load(scope)).rejects.toThrow(/metric runs/i);
    await expect(repository.load({ ...scope, branchId: ' ' })).rejects.toThrow(/branch/i);
  });

  it('requires the RLS transaction wrapper before touching SQL', async () => {
    const query = vi.fn();
    const repository = createPostgresStoreEdgeSyncWorkerMetricsRepository({ query });
    await expect(repository.load(scope)).rejects.toThrow(/transaction-scoped/i);
    await expect(repository.save(scope, { runs: 1, claimed: 0, completed: 0, retryable: 0, deadLetter: 0 })).rejects.toThrow(/transaction-scoped/i);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('Store Edge worker metrics schema', () => {
  it('is force-RLS protected with a scoped primary key', () => {
    expect(shadowImportPostgresSchema).toMatch(/CREATE TABLE (IF NOT EXISTS )?retail_store_edge_sync_worker_metrics/i);
    expect(shadowImportPostgresSchema).toMatch(/PRIMARY KEY \(tenant_id, company_id, branch_id\)/i);
    expect(shadowImportPostgresSchema).toMatch(/retail_store_edge_sync_worker_metrics_scope_policy/i);
  });
});
