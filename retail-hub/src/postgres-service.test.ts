import { describe, expect, it, vi } from 'vitest';
import { buildShadowImportPlan, checksumShadowImportEvidence } from './shadow-import';
import { createPostgresRetailHubService } from './postgres-service';
import type { ShadowImportPostgresRepository } from './shadow-import-postgres-repository';
import { createInMemoryShadowImportReviewStore } from './shadow-import-review';
import type { ShadowImportPullReceipt } from './shadow-import-pull-receipt';

const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

function verifiedPlan(credentialRevision?: number) {
  const evidence = {
    batchId: 'batch-1', source: 'bakaloo' as const, observedAt: '2026-08-03T09:00:00.000Z',
    cursor: { value: 'orders:1', observedAt: '2026-08-03T09:00:00.000Z' }, declaredCounts: { customer: 1 },
    records: [{ entity: 'customer' as const, externalId: 'customer-1', epicBosId: 'party-1', payload: { name: 'Asha' } }],
  };
  const withRevision = credentialRevision === undefined ? evidence : { ...evidence, credentialRevision };
  return buildShadowImportPlan({ ...withRevision, declaredChecksum: checksumShadowImportEvidence(withRevision) });
}

describe('durable Retail Hub HTTP service', () => {
  it('reads scoped PostgreSQL evidence through the same read-only resource vocabulary', async () => {
    const plan = verifiedPlan();
    const receipt: ShadowImportPullReceipt = { id: `shadow-pull:batch-1:${plan.batch.integrity.computedChecksum.slice(0, 16)}`, source: 'bakaloo', batchId: 'batch-1', scope, observedAt: plan.batch.observedAt, registeredAt: '2026-08-03T10:00:00.000Z', pagesFetched: 1, recordsFetched: 1, planChecksum: plan.batch.integrity.computedChecksum, writeBackAllowed: false, version: 1 };
    const repository: ShadowImportPostgresRepository = {
      listPlans: vi.fn(async () => [plan]),
      getPlan: vi.fn(async () => plan),
      listPullReceipts: vi.fn(async () => [receipt]),
      replacePlan: vi.fn(),
    };
    const service = createPostgresRetailHubService({ repository, resolveScope: () => scope });

    expect(await service.handle({ method: 'GET', url: '/health' })).toMatchObject({ status: 200, body: { mode: 'durable-read-only-shadow-import', liveSourceConnected: false } });
    expect(await service.handle({ method: 'GET', url: '/v1/shadow-imports/batches' })).toMatchObject({ status: 200, body: { batches: [expect.objectContaining({ id: 'batch-1' })] } });
    expect(repository.listPlans).toHaveBeenCalledWith(scope);
    expect(await service.handle({ method: 'GET', url: '/v1/shadow-imports/batches/batch-1' })).toMatchObject({ status: 200, body: { batch: { id: 'batch-1' } } });
    expect(repository.getPlan).toHaveBeenCalledWith(scope, 'batch-1');
    expect(await service.handle({ method: 'GET', url: '/v1/shadow-imports/pull-receipts?batchId=batch-1' })).toMatchObject({ status: 200, body: { receipts: [expect.objectContaining({ id: receipt.id, writeBackAllowed: false })] } });
  });

  it('exposes only server-owned, non-secret source status and never claims reachability by default', async () => {
    const repository: ShadowImportPostgresRepository = { listPlans: vi.fn(async () => []), getPlan: vi.fn(), replacePlan: vi.fn() };
    const service = createPostgresRetailHubService({
      repository,
      resolveScope: () => scope,
      resolveShadowImportSourceStatus: () => ({ status: 'reachable', credentialRevision: 7, checkedAt: '2026-08-04T12:00:00.000Z', message: 'GET-only source probe passed.' }),
    });
    expect(await service.handle({ method: 'GET', url: '/health' })).toMatchObject({ status: 200, body: { liveSourceConnected: true, sourceStatus: { status: 'reachable', credentialRevision: 7 } } });
    expect(await service.handle({ method: 'GET', url: '/v1/shadow-imports/source-status' })).toMatchObject({ status: 200, body: { sourceStatus: { status: 'reachable', credentialRevision: 7 } } });
  });

  it('rejects an invalid server source status instead of publishing ambiguous readiness', async () => {
    const repository: ShadowImportPostgresRepository = { listPlans: vi.fn(async () => []), getPlan: vi.fn(), replacePlan: vi.fn() };
    const service = createPostgresRetailHubService({ repository, resolveScope: () => scope, resolveShadowImportSourceStatus: () => ({ status: 'reachable', credentialRevision: 0 } as never) });
    await expect(service.handle({ method: 'GET', url: '/health' })).rejects.toThrow(/credential revision/i);
  });

  it('fails closed when an authenticated scope is not supplied and rejects every write verb', async () => {
    const repository: ShadowImportPostgresRepository = { listPlans: vi.fn(), getPlan: vi.fn(), replacePlan: vi.fn() };
    const service = createPostgresRetailHubService({ repository, resolveScope: () => undefined });

    expect(await service.handle({ method: 'GET', url: '/v1/shadow-imports/batches' })).toMatchObject({ status: 403, body: { error: 'scope_required' } });
    expect(await service.handle({ method: 'POST', url: '/v1/shadow-imports/batches' })).toMatchObject({ status: 405, headers: { allow: 'GET, HEAD, OPTIONS' } });
    expect(repository.listPlans).not.toHaveBeenCalled();
    expect(repository.replacePlan).not.toHaveBeenCalled();
  });

  it('does not trust a renderer-supplied scope value', async () => {
    const repository: ShadowImportPostgresRepository = { listPlans: vi.fn(), getPlan: vi.fn(), replacePlan: vi.fn() };
    const service = createPostgresRetailHubService({ repository, resolveScope: (request) => request.scope });
    const response = await service.handle({ method: 'GET', url: '/health', scope: undefined });
    expect(response.status).toBe(403);
  });

  it('requires the explicit shadow-import read permission when authorization is wired', async () => {
    const repository: ShadowImportPostgresRepository = { listPlans: vi.fn(), getPlan: vi.fn(), replacePlan: vi.fn() };
    const service = createPostgresRetailHubService({
      repository,
      resolveScope: () => scope,
      resolveAuthorization: () => ({ actorId: 'cashier-1', scope, permissions: [] }),
    });

    const response = await service.handle({ method: 'GET', url: '/v1/shadow-imports/batches' });
    expect(response).toMatchObject({ status: 403, body: { error: 'permission_required' } });
    expect(repository.listPlans).not.toHaveBeenCalled();
  });

  it('uses the trusted authorization scope instead of a renderer-provided scope', async () => {
    const plan = verifiedPlan();
    const repository: ShadowImportPostgresRepository = {
      listPlans: vi.fn(async () => [plan]),
      getPlan: vi.fn(async () => plan),
      replacePlan: vi.fn(),
    };
    const trustedScope = { tenantId: 'trusted-tenant', companyId: 'trusted-company', branchId: 'trusted-branch' };
    const service = createPostgresRetailHubService({
      repository,
      resolveScope: () => ({ tenantId: 'renderer-tenant', companyId: 'renderer-company', branchId: 'renderer-branch' }),
      resolveAuthorization: () => ({ actorId: 'manager-1', scope: trustedScope, permissions: ['shadow-import:read'] }),
    });

    const response = await service.handle({ method: 'GET', url: '/v1/shadow-imports/batches', scope });
    expect(response.status).toBe(200);
    expect(repository.listPlans).toHaveBeenCalledWith(trustedScope);
  });

  it('records an accepted reconciliation decision only with reviewer permission', async () => {
    const plan = verifiedPlan();
    const repository: ShadowImportPostgresRepository = {
      listPlans: vi.fn(async () => [plan]),
      getPlan: vi.fn(async () => plan),
      replacePlan: vi.fn(),
    };
    const reviewStore = createInMemoryShadowImportReviewStore();
    const service = createPostgresRetailHubService({
      repository,
      reviewStore,
      now: () => '2026-08-03T10:00:00.000Z',
      createId: () => 'decision-1',
      resolveScope: () => scope,
      resolveAuthorization: () => ({ actorId: 'manager-1', scope, permissions: ['shadow-import:review'] }),
    });

    const created = await service.handle({ method: 'POST', url: '/v1/shadow-imports/review-decisions', body: { batchId: 'batch-1', decision: 'accepted', reason: 'Source counts and identity maps reviewed.' } });
    expect(created).toMatchObject({ status: 201, body: { decision: { id: 'decision-1', decision: 'accepted', writeBackAllowed: false } } });
    expect(await service.handle({ method: 'GET', url: '/v1/shadow-imports/review-decisions?batchId=batch-1' })).toMatchObject({ status: 200, body: { decisions: [expect.objectContaining({ actorId: 'manager-1' })] } });
  });

  it('rejects review writes without the review permission and leaves the store untouched', async () => {
    const plan = verifiedPlan();
    const repository: ShadowImportPostgresRepository = { listPlans: vi.fn(async () => [plan]), getPlan: vi.fn(async () => plan), replacePlan: vi.fn() };
    const reviewStore = createInMemoryShadowImportReviewStore();
    const service = createPostgresRetailHubService({
      repository,
      reviewStore,
      resolveScope: () => scope,
      resolveAuthorization: () => ({ actorId: 'cashier-1', scope, permissions: ['shadow-import:read'] }),
    });
    expect(await service.handle({ method: 'POST', url: '/v1/shadow-imports/review-decisions', body: { batchId: 'batch-1', decision: 'accepted', reason: 'Not authorized.' } })).toMatchObject({ status: 403, body: { error: 'permission_required' } });
    expect(await reviewStore.list(scope)).toEqual([]);
  });

  it('rejects an acceptance when the trusted source credential generation has rotated', async () => {
    const plan = verifiedPlan(4);
    const repository: ShadowImportPostgresRepository = { listPlans: vi.fn(async () => [plan]), getPlan: vi.fn(async () => plan), replacePlan: vi.fn() };
    const reviewStore = createInMemoryShadowImportReviewStore();
    const service = createPostgresRetailHubService({
      repository,
      reviewStore,
      resolveScope: () => scope,
      resolveAuthorization: () => ({ actorId: 'manager-1', scope, permissions: ['shadow-import:review'] }),
      resolveShadowImportCredentialRevision: () => 5,
    });
    const response = await service.handle({ method: 'POST', url: '/v1/shadow-imports/review-decisions', body: { batchId: 'batch-1', decision: 'accepted', reason: 'Attempted approval after a credential rotation.' } });
    expect(response).toMatchObject({ status: 400, body: { error: 'invalid_request' } });
    expect(JSON.stringify(response.body)).toMatch(/credential revision/i);
    expect(await reviewStore.list(scope)).toEqual([]);
  });

  it('projects an accepted decision as stale after the trusted credential generation rotates', async () => {
    const plan = verifiedPlan(4);
    const repository: ShadowImportPostgresRepository = { listPlans: vi.fn(async () => [plan]), getPlan: vi.fn(async () => plan), replacePlan: vi.fn() };
    const reviewStore = createInMemoryShadowImportReviewStore();
    let currentRevision = 4;
    const service = createPostgresRetailHubService({
      repository,
      reviewStore,
      resolveScope: () => scope,
      resolveAuthorization: () => ({ actorId: 'manager-1', scope, permissions: ['shadow-import:review', 'shadow-import:read'] }),
      resolveShadowImportCredentialRevision: () => currentRevision,
      createId: () => 'decision-rotation',
    });
    expect((await service.handle({ method: 'POST', url: '/v1/shadow-imports/review-decisions', body: { batchId: 'batch-1', decision: 'accepted', reason: 'Approved against revision four.' } })).status).toBe(201);
    currentRevision = 5;
    const response = await service.handle({ method: 'GET', url: '/v1/shadow-imports/review-decisions?batchId=batch-1' });
    expect(response).toMatchObject({ status: 200, body: { decisions: [expect.objectContaining({ decision: 'accepted', credentialRevision: 4, approvalState: 'stale' })] } });
  });

  it('exposes a scoped capability cutover assessment without adding a write route', async () => {
    const plan = verifiedPlan(4);
    const repository: ShadowImportPostgresRepository = { listPlans: vi.fn(async () => [plan]), getPlan: vi.fn(async () => plan), replacePlan: vi.fn() };
    const reviewStore = createInMemoryShadowImportReviewStore();
    const decisionService = createPostgresRetailHubService({
      repository, reviewStore, resolveScope: () => scope,
      resolveAuthorization: () => ({ actorId: 'manager-1', scope, permissions: ['shadow-import:review', 'shadow-import:read'] }),
      resolveShadowImportCredentialRevision: () => 4, createId: () => 'cutover-approval',
    });
    await decisionService.handle({ method: 'POST', url: '/v1/shadow-imports/review-decisions', body: { batchId: 'batch-1', decision: 'accepted', reason: 'Reconciled customer evidence approved.' } });
    const response = await decisionService.handle({ method: 'GET', url: '/v1/shadow-imports/cutover?batchId=batch-1&capability=customers' });
    expect(response).toMatchObject({ status: 200, body: { assessment: { capability: 'customers', status: 'blocked', writeBackAllowed: false } } });
    expect((response.body as { assessment: { blockers: string[] } }).assessment.blockers.join(' ')).toMatch(/missing reconciliation|missing identity|customers/i);
    expect(await decisionService.handle({ method: 'POST', url: '/v1/shadow-imports/cutover', body: {} })).toMatchObject({ status: 405, body: { error: 'read_only_boundary' } });
  });
});
