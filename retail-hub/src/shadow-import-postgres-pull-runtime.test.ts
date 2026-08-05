import { describe, expect, it, vi } from 'vitest';
import { pullAndRegisterScopedShadowImport } from './shadow-import-postgres-pull-runtime';
import type { ShadowImportPostgresRepository, ShadowImportScope } from './shadow-import-postgres-repository';
import type { ShadowImportSourceAdapter } from './shadow-import-source-adapter';
import type { ShadowImportPlan } from './shadow-import';

const scope: ShadowImportScope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

function adapter(batchId: string): ShadowImportSourceAdapter {
  return {
    source: 'bakaloo', credentialRevision: 8,
    async pullPage() {
      return { cursor: { value: `${batchId}:final`, observedAt: '2026-08-04T11:00:00.000Z' }, observedAt: '2026-08-04T11:00:00.000Z', declaredCounts: { customer: 1 }, records: [{ entity: 'customer', externalId: `${batchId}:customer`, epicBosId: 'party-1', payload: { name: 'Asha' } }], done: true };
    },
  };
}

function repository(existing?: ShadowImportPlan): ShadowImportPostgresRepository {
  return { listPlans: vi.fn(async () => existing ? [existing] : []), getPlan: vi.fn(async () => existing), registerPlan: vi.fn(async () => undefined), registerPullReceipt: vi.fn(async () => undefined), replacePlan: vi.fn() };
}

describe('scoped PostgreSQL shadow-import pull runtime', () => {
  it('pulls and registers only inside the trusted scope', async () => {
    const durable = repository();
    const result = await pullAndRegisterScopedShadowImport(adapter('pg-batch-1'), durable, scope, { batchId: 'pg-batch-1', observedAt: '2026-08-04T11:00:00.000Z' }, '2026-08-04T11:01:00Z');
    expect(result).toMatchObject({ registeredAt: '2026-08-04T11:01:00.000Z', scope, plan: { batch: { id: 'pg-batch-1', credentialRevision: 8 } }, receipt: { batchId: 'pg-batch-1', credentialRevision: 8, pagesFetched: 1, recordsFetched: 1, writeBackAllowed: false } });
    expect(durable.getPlan).toHaveBeenCalledWith(scope, 'pg-batch-1');
    expect(durable.registerPlan).toHaveBeenCalledWith(scope, result.plan);
    expect(durable.registerPullReceipt).toHaveBeenCalledWith(scope, result.receipt);
  });

  it('fails before contacting the source when the scoped batch already exists', async () => {
    const durable = repository({ batch: { id: 'pg-batch-2' } } as ShadowImportPlan);
    let pullCalls = 0;
    const source = { ...adapter('pg-batch-2'), pullPage: async () => { pullCalls += 1; return adapter('pg-batch-2').pullPage({}); } };
    await expect(pullAndRegisterScopedShadowImport(source, durable, scope, { batchId: 'pg-batch-2', observedAt: '2026-08-04T11:00:00.000Z' })).rejects.toThrow(/already exists/i);
    expect(pullCalls).toBe(0);
    expect(durable.registerPlan).not.toHaveBeenCalled();
  });

  it('refuses a repository without immutable registration', async () => {
    const durable = repository();
    delete durable.registerPlan;
    await expect(pullAndRegisterScopedShadowImport(adapter('pg-batch-3'), durable, scope, { batchId: 'pg-batch-3', observedAt: '2026-08-04T11:00:00.000Z' })).rejects.toThrow(/immutable registration/i);
    expect(durable.getPlan).not.toHaveBeenCalled();
  });

  it('prefers atomic plan-and-receipt registration when the repository provides it', async () => {
    const durable = repository();
    durable.registerPlanAndPullReceipt = vi.fn(async () => undefined);
    const result = await pullAndRegisterScopedShadowImport(adapter('pg-batch-4'), durable, scope, { batchId: 'pg-batch-4', observedAt: '2026-08-04T11:00:00.000Z' }, '2026-08-04T11:01:00Z');
    expect(durable.registerPlanAndPullReceipt).toHaveBeenCalledWith(scope, result.plan, result.receipt);
    expect(durable.registerPlan).not.toHaveBeenCalled();
    expect(durable.registerPullReceipt).not.toHaveBeenCalled();
  });
});
