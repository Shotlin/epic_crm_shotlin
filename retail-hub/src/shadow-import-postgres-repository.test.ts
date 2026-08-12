import { describe, expect, it, vi } from 'vitest';
import { buildShadowImportPlan, checksumShadowImportEvidence } from './shadow-import';
import { createPostgresShadowImportRepository, createPostgresShadowImportReviewStore, createRlsScopedSqlClient, shadowImportPostgresSchema, type ShadowImportSqlClient, type ShadowImportTransactionPool } from './shadow-import-postgres-repository';
import { createShadowImportReviewDecision } from './shadow-import-review';
import type { ShadowImportPullReceipt } from './shadow-import-pull-receipt';

const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };
const plan = buildShadowImportPlan((() => {
  const evidence = {
    batchId: 'batch-1', source: 'bakaloo' as const, observedAt: '2026-08-03T09:00:00.000Z',
    cursor: { value: 'orders:1', observedAt: '2026-08-03T09:00:00.000Z' }, declaredCounts: { order: 1 },
    records: [{ entity: 'order' as const, externalId: 'order-1', epicBosId: 'sales-order-1', payload: { totalInr: 250 } }],
  };
  return { ...evidence, declaredChecksum: checksumShadowImportEvidence(evidence) };
})());

describe('PostgreSQL shadow-import repository boundary', () => {
  it('sets transaction-local RLS scope and rejects direct unscoped SQL', async () => {
    const transactionQuery = vi.fn();
    transactionQuery.mockImplementation(async (sql: string) => sql.includes('current_setting')
      ? { rows: [{ tenant_id: scope.tenantId, company_id: scope.companyId, branch_id: scope.branchId }] }
      : { rows: [] });
    const withTransactionMock = vi.fn(async (operation: (client: ShadowImportSqlClient) => Promise<unknown>) => operation({ query: transactionQuery as unknown as ShadowImportSqlClient['query'] }));
    const withTransaction = withTransactionMock as unknown as ShadowImportTransactionPool['withTransaction'];
    const scopedClient = createRlsScopedSqlClient({ withTransaction });

    await expect(scopedClient.query('SELECT 1')).rejects.toThrow(/authenticated transaction scope/i);
    await scopedClient.withScope?.(scope, async (transaction) => {
      await transaction.query('SELECT plan_json FROM retail_shadow_import_batches');
      return 'ok';
    });

    expect(withTransactionMock).toHaveBeenCalledTimes(1);
    expect(transactionQuery.mock.calls[0]?.[0]).toMatch(/set_config\('epic_bos\.tenant_id', \$1, true\)/);
    expect(transactionQuery.mock.calls[0]?.[1]).toEqual([scope.tenantId, scope.companyId, scope.branchId]);
    expect(transactionQuery.mock.calls[1]?.[0]).toMatch(/current_setting\('epic_bos\.tenant_id', true\)/);
    expect(transactionQuery.mock.calls[2]?.[0]).toContain('SELECT plan_json');
  });

  it('fails closed when the connection reports a different active RLS scope', async () => {
    const transactionQuery = vi.fn();
    transactionQuery.mockImplementation(async (sql: string) => sql.includes('current_setting')
      ? { rows: [{ tenant_id: scope.tenantId, company_id: 'other-company', branch_id: scope.branchId }] }
      : { rows: [] });
    const operation = vi.fn(async () => 'must-not-run');
    const scopedClient = createRlsScopedSqlClient({
      withTransaction: async (callback) => callback({ query: transactionQuery as unknown as ShadowImportSqlClient['query'] }),
    });
    await expect(scopedClient.withScope?.(scope, operation)).rejects.toThrow(/scope verification/i);
    expect(operation).not.toHaveBeenCalled();
  });

  it('propagates operation failures so the transaction pool can roll back', async () => {
    const transactionQuery = vi.fn();
    transactionQuery.mockImplementation(async (sql: string) => sql.includes('current_setting')
      ? { rows: [{ tenant_id: scope.tenantId, company_id: scope.companyId, branch_id: scope.branchId }] }
      : { rows: [] });
    const rollbackError = new Error('operation failed');
    let poolObservedFailure = false;
    const scopedClient = createRlsScopedSqlClient({
      withTransaction: async (callback) => {
        try {
        return await callback({ query: transactionQuery as unknown as ShadowImportSqlClient['query'] });
        } catch (error) {
          poolObservedFailure = error === rollbackError;
          throw error;
        }
      },
    });
    await expect(scopedClient.withScope?.(scope, async () => { throw rollbackError; })).rejects.toBe(rollbackError);
    expect(poolObservedFailure).toBe(true);
  });

  it('does not open a transaction for an invalid scope', async () => {
    const withTransactionMock = vi.fn();
    const withTransaction = withTransactionMock as unknown as ShadowImportTransactionPool['withTransaction'];
    const scopedClient = createRlsScopedSqlClient({ withTransaction });
    await expect(scopedClient.withScope?.({ ...scope, companyId: ' ' }, async () => 'never')).rejects.toThrow(/company/i);
    expect(withTransactionMock).not.toHaveBeenCalled();
  });

  it('writes plans with explicit tenant/company/branch scope and upsert semantics', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = createPostgresShadowImportRepository({ query } satisfies ShadowImportSqlClient);
    await repository.replacePlan(scope, plan);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, readonly unknown[]];
    expect(sql).toMatch(/INSERT INTO retail_shadow_import_batches/);
    expect(sql).toMatch(/ON CONFLICT \(tenant_id, company_id, branch_id, batch_id\)/);
    expect(params.slice(0, 4)).toEqual([scope.tenantId, scope.companyId, scope.branchId, plan.batch.id]);
    expect(params[7]).toContain('shadow-read-only');
  });

  it('registers a durable plan immutably and rejects a duplicate returned by PostgreSQL', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ batch_id: plan.batch.id }] });
    const repository = createPostgresShadowImportRepository({ query } satisfies ShadowImportSqlClient);
    await repository.registerPlan?.(scope, plan);
    expect(query.mock.calls[0]?.[0]).toMatch(/DO NOTHING/i);
    expect(query.mock.calls[0]?.[0]).toMatch(/RETURNING batch_id/i);

    const duplicateQuery = vi.fn().mockResolvedValueOnce({ rows: [] });
    const duplicateRepository = createPostgresShadowImportRepository({ query: duplicateQuery } satisfies ShadowImportSqlClient);
    await expect(duplicateRepository.registerPlan?.(scope, plan)).rejects.toThrow(/already exists/i);
  });

  it('persists immutable pull receipts in the same legal scope', async () => {
    const receipt: ShadowImportPullReceipt = { id: `shadow-pull:batch-1:${plan.batch.integrity.computedChecksum.slice(0, 16)}`, source: 'bakaloo', batchId: 'batch-1', scope, observedAt: '2026-08-03T09:00:00.000Z', registeredAt: '2026-08-03T09:01:00.000Z', credentialRevision: 4, pagesFetched: 2, recordsFetched: 1, planChecksum: plan.batch.integrity.computedChecksum, writeBackAllowed: false, version: 1 };
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ receipt_id: receipt.id }] }).mockResolvedValueOnce({ rows: [{ receipt_json: JSON.stringify(receipt) }] });
    const repository = createPostgresShadowImportRepository({ query } satisfies ShadowImportSqlClient);
    await repository.registerPullReceipt?.(scope, receipt);
    const listed = await repository.listPullReceipts?.(scope, 'batch-1');
    expect(query.mock.calls[0]?.[0]).toMatch(/INSERT INTO retail_shadow_import_pull_receipts/);
    expect(query.mock.calls[0]?.[0]).toMatch(/RETURNING receipt_id/i);
    expect(query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([scope.tenantId, scope.companyId, scope.branchId, receipt.id, receipt.batchId]));
    expect(listed).toEqual([receipt]);
  });

  it('offers one-statement atomic plan-and-receipt registration', async () => {
    const receipt: ShadowImportPullReceipt = { id: `shadow-pull:batch-1:${plan.batch.integrity.computedChecksum.slice(0, 16)}`, source: 'bakaloo', batchId: 'batch-1', scope, observedAt: '2026-08-03T09:00:00.000Z', registeredAt: '2026-08-03T09:01:00.000Z', credentialRevision: 4, pagesFetched: 2, recordsFetched: 1, planChecksum: plan.batch.integrity.computedChecksum, writeBackAllowed: false, version: 1 };
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ receipt_id: receipt.id }] });
    const repository = createPostgresShadowImportRepository({ query } satisfies ShadowImportSqlClient);
    await repository.registerPlanAndPullReceipt?.(scope, plan, receipt);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toMatch(/WITH inserted_plan AS/i);
    expect(query.mock.calls[0]?.[0]).toMatch(/INSERT INTO retail_shadow_import_pull_receipts/i);
    expect(query.mock.calls[0]?.[0]).toMatch(/RETURNING receipt_id/i);
  });

  it('lists and reads only the requested legal scope and clones stored JSON', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ plan_json: JSON.stringify(plan) }] })
      .mockResolvedValueOnce({ rows: [{ plan_json: JSON.stringify(plan) }] });
    const repository = createPostgresShadowImportRepository({ query } satisfies ShadowImportSqlClient);
    const listed = await repository.listPlans(scope);
    const fetched = await repository.getPlan(scope, plan.batch.id);

    expect(listed).toHaveLength(1);
    expect(fetched?.batch.id).toBe(plan.batch.id);
    expect(query.mock.calls[0]?.[1]).toEqual([scope.tenantId, scope.companyId, scope.branchId]);
    expect(query.mock.calls[1]?.[1]).toEqual([scope.tenantId, scope.companyId, scope.branchId, plan.batch.id]);
    listed[0]!.batch.status = 'blocked';
    expect(fetched?.batch.status).toBe('ready-for-review');
  });

  it('uses the trusted transaction scope wrapper when a deployment supplies one', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ plan_json: JSON.stringify(plan) }] });
    const scopes: Array<typeof scope> = [];
    const withScope: NonNullable<ShadowImportSqlClient['withScope']> = async (receivedScope, operation) => {
      scopes.push(receivedScope);
      return operation({ query });
    };
    const repository = createPostgresShadowImportRepository({ query, withScope } satisfies ShadowImportSqlClient);
    await repository.listPlans(scope);
    expect(scopes).toEqual([scope]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('fails before SQL when scope or batch identity is blank', async () => {
    const query = vi.fn();
    const repository = createPostgresShadowImportRepository({ query } satisfies ShadowImportSqlClient);
    await expect(repository.listPlans({ ...scope, branchId: ' ' })).rejects.toThrow(/branch/i);
    await expect(repository.getPlan(scope, ' ')).rejects.toThrow(/batch/i);
    await expect(repository.replacePlan(scope, { ...plan, batch: { ...plan.batch, id: ' ' } })).rejects.toThrow(/batch/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('persists review decisions with the same legal-entity scope', async () => {
    const decision = createShadowImportReviewDecision(plan, { batchId: 'batch-1', decision: 'accepted', reason: 'Reviewed against the source evidence.' }, { actorId: 'manager-1', scope, now: '2026-08-03T10:00:00Z', id: 'decision-1' });
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ decision_json: JSON.stringify(decision) }] });
    const store = createPostgresShadowImportReviewStore({ query } satisfies ShadowImportSqlClient);
    await store.append(scope, decision);
    expect(query.mock.calls[0]?.[0]).toMatch(/INSERT INTO retail_shadow_import_review_decisions/);
    expect(query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([scope.tenantId, scope.companyId, scope.branchId, decision.id]));
    const listed = await store.list(scope, 'batch-1');
    expect(listed).toEqual([decision]);
    expect(query.mock.calls[1]?.[1]).toEqual([scope.tenantId, scope.companyId, scope.branchId, 'batch-1']);
  });
});

describe('shadow-import PostgreSQL schema', () => {
  it('contains scoped primary key, JSON evidence, and row-level security policy hooks', () => {
    expect(shadowImportPostgresSchema).toMatch(/CREATE TABLE (IF NOT EXISTS )?retail_shadow_import_batches/i);
    expect(shadowImportPostgresSchema).toMatch(/PRIMARY KEY \(tenant_id, company_id, branch_id, batch_id\)/);
    expect(shadowImportPostgresSchema).toMatch(/plan_json JSONB NOT NULL/i);
    expect(shadowImportPostgresSchema).toMatch(/retail_shadow_import_review_decisions/i);
    expect(shadowImportPostgresSchema).toMatch(/decision_json JSONB NOT NULL/i);
    expect(shadowImportPostgresSchema).toMatch(/retail_shadow_import_review_decisions_one_accept_idx/i);
    expect(shadowImportPostgresSchema).toMatch(/retail_shadow_import_pull_receipts/i);
    expect(shadowImportPostgresSchema).toMatch(/WHERE decision = 'accepted'/i);
    expect(shadowImportPostgresSchema).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(shadowImportPostgresSchema.match(/FORCE ROW LEVEL SECURITY/g)).toHaveLength(7);
    expect(shadowImportPostgresSchema.match(/CREATE POLICY/g)).toHaveLength(7);
    expect(shadowImportPostgresSchema.match(/current_setting\('epic_bos\.tenant_id', true\)/g)).toHaveLength(14);
    expect(shadowImportPostgresSchema.match(/current_setting\('epic_bos\.company_id', true\)/g)).toHaveLength(14);
    expect(shadowImportPostgresSchema.match(/current_setting\('epic_bos\.branch_id', true\)/g)).toHaveLength(14);
  });
});
