import { describe, expect, it } from 'vitest';
import { buildShadowImportPlan, checksumShadowImportEvidence } from './shadow-import';
import { createInMemoryShadowImportReviewStore, createShadowImportReviewDecision, projectShadowImportReviewApprovalState } from './shadow-import-review';

const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

function plan(status: 'reconciled' | 'needs-review' = 'reconciled', credentialRevision?: number) {
  const evidence = {
    batchId: status === 'reconciled' ? 'batch-ok' : 'batch-review',
    source: 'bakaloo' as const,
    observedAt: '2026-08-03T09:00:00.000Z',
    cursor: { value: 'orders:1', observedAt: '2026-08-03T09:00:00.000Z' },
    declaredCounts: status === 'reconciled' ? { customer: 1 } : { customer: 2 },
    records: [{ entity: 'customer' as const, externalId: 'customer-1', epicBosId: 'party-1', payload: { name: 'Asha' } }],
  };
  const withRevision = credentialRevision === undefined ? evidence : { ...evidence, credentialRevision };
  return buildShadowImportPlan({ ...withRevision, declaredChecksum: checksumShadowImportEvidence(withRevision) });
}

describe('shadow-import review decisions', () => {
  it('accepts only a reconciled batch and persists an actor-bound decision', async () => {
    const decision = createShadowImportReviewDecision(plan(), { batchId: 'batch-ok', decision: 'accepted', reason: 'Counts and identity maps reviewed against the source export.' }, { actorId: 'manager-1', scope, now: '2026-08-03T10:00:00Z', id: 'decision-1' });
    expect(decision).toMatchObject({ batchId: 'batch-ok', decision: 'accepted', actorId: 'manager-1', writeBackAllowed: false });
    const store = createInMemoryShadowImportReviewStore();
    await store.append(scope, decision);
    expect(await store.list(scope, 'batch-ok')).toEqual([decision]);
  });

  it('rejects acceptance of a batch that still needs review', () => {
    expect(() => createShadowImportReviewDecision(plan('needs-review'), { batchId: 'batch-review', decision: 'accepted', reason: 'Reviewed.' }, { actorId: 'manager-1', scope, now: '2026-08-03T10:00:00Z', id: 'decision-2' })).toThrow(/fully reconciled/i);
  });

  it('requires a reason and keeps scope isolated', async () => {
    expect(() => createShadowImportReviewDecision(plan(), { batchId: 'batch-ok', decision: 'rejected', reason: ' ' }, { actorId: 'manager-1', scope, now: '2026-08-03T10:00:00Z', id: 'decision-3' })).toThrow(/reason/i);
    const decision = createShadowImportReviewDecision(plan(), { batchId: 'batch-ok', decision: 'rejected', reason: 'Identity map evidence is incomplete.' }, { actorId: 'manager-1', scope, now: '2026-08-03T10:00:00Z', id: 'decision-4' });
    const store = createInMemoryShadowImportReviewStore([decision]);
    expect(await store.list({ tenantId: 'other', companyId: 'company-1', branchId: 'branch-1' })).toEqual([]);
  });

  it('allows a rejection trail but prevents a second accepted decision for the same batch', async () => {
    const store = createInMemoryShadowImportReviewStore();
    const accepted = createShadowImportReviewDecision(plan(), { batchId: 'batch-ok', decision: 'accepted', reason: 'Reconciled and approved.' }, { actorId: 'manager-1', scope, now: '2026-08-03T10:00:00Z', id: 'decision-accepted-1' });
    await store.append(scope, accepted);
    const duplicateAcceptance = createShadowImportReviewDecision(plan(), { batchId: 'batch-ok', decision: 'accepted', reason: 'Duplicate approval attempt.' }, { actorId: 'manager-2', scope, now: '2026-08-03T10:01:00Z', id: 'decision-accepted-2' });
    await expect(store.append(scope, duplicateAcceptance)).rejects.toThrow(/only one accepted/i);
  });

  it('requires the current credential generation before accepting versioned evidence', () => {
    const versioned = plan('reconciled', 4);
    expect(() => createShadowImportReviewDecision(versioned, { batchId: 'batch-ok', decision: 'accepted', reason: 'Reviewed.' }, { actorId: 'manager-1', scope, now: '2026-08-03T10:00:00Z', id: 'decision-5', currentCredentialRevision: 3 })).toThrow(/credential revision/i);
    const decision = createShadowImportReviewDecision(versioned, { batchId: 'batch-ok', decision: 'accepted', reason: 'Reviewed after matching the active credential generation.' }, { actorId: 'manager-1', scope, now: '2026-08-03T10:00:00Z', id: 'decision-6', currentCredentialRevision: 4 });
    expect(decision.credentialRevision).toBe(4);
  });

  it('keeps historical approval but marks it stale or unverified after rotation', () => {
    const accepted = createShadowImportReviewDecision(plan('reconciled', 4), { batchId: 'batch-ok', decision: 'accepted', reason: 'Reviewed.' }, { actorId: 'manager-1', scope, now: '2026-08-03T10:00:00Z', id: 'decision-7', currentCredentialRevision: 4 });
    expect(projectShadowImportReviewApprovalState(accepted, 4).approvalState).toBe('active');
    expect(projectShadowImportReviewApprovalState(accepted, 5).approvalState).toBe('stale');
    expect(projectShadowImportReviewApprovalState(accepted, undefined).approvalState).toBe('unverified');
    expect(projectShadowImportReviewApprovalState(accepted, 5).id).toBe(accepted.id);
  });
});
