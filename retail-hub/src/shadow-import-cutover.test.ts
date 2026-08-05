import { describe, expect, it } from 'vitest';
import { buildShadowImportPlan, checksumShadowImportEvidence } from './shadow-import';
import { assessShadowImportCutover } from './shadow-import-cutover';
import { createShadowImportReviewDecision } from './shadow-import-review';

const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

function plan(credentialRevision?: number) {
  const evidence = {
    batchId: 'cutover-batch-1', source: 'bakaloo' as const, observedAt: '2026-08-04T12:00:00.000Z',
    cursor: { value: 'customers:final', observedAt: '2026-08-04T12:00:00.000Z' }, declaredCounts: { customer: 1, address: 1 },
    records: [
      { entity: 'customer' as const, externalId: 'customer-1', epicBosId: 'party-1', payload: { name: 'Asha' } },
      { entity: 'address' as const, externalId: 'address-1', epicBosId: 'address-1', payload: { city: 'Pune' } },
    ],
    ...(credentialRevision === undefined ? {} : { credentialRevision }),
  };
  return buildShadowImportPlan({ ...evidence, declaredChecksum: checksumShadowImportEvidence(evidence) });
}

describe('shadow-import capability cutover assessment', () => {
  it('allows only a fully mapped, reconciled, actively approved capability for parallel run', () => {
    const loaded = plan(8);
    const decision = createShadowImportReviewDecision(loaded, { batchId: loaded.batch.id, decision: 'accepted', reason: 'Customer and address evidence reconciled.' }, { actorId: 'manager-1', scope, now: '2026-08-04T12:10:00Z', id: 'approval-1', currentCredentialRevision: 8 });
    const result = assessShadowImportCutover({ plan: loaded, decisions: [decision], scope, capability: 'customers', currentCredentialRevision: 8, rollbackReference: 'ROLLBACK-CUSTOMERS-001' });
    expect(result).toMatchObject({ status: 'ready-for-parallel-run', capability: 'customers', approvalDecisionId: 'approval-1', credentialRevision: 8, rollbackReference: 'ROLLBACK-CUSTOMERS-001', writeBackAllowed: false, planId: loaded.batch.id, remoteRecordCount: 2, localRecordCount: 2, differenceCount: 0 });
    expect(result.remoteChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.localChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.reconciliationChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.blockers).toEqual([]);
  });

  it('blocks stale approvals and never treats a rotated credential as a cutover approval', () => {
    const loaded = plan(8);
    const decision = createShadowImportReviewDecision(loaded, { batchId: loaded.batch.id, decision: 'accepted', reason: 'Approved against the original credential.' }, { actorId: 'manager-1', scope, now: '2026-08-04T12:10:00Z', id: 'approval-2', currentCredentialRevision: 8 });
    const result = assessShadowImportCutover({ plan: loaded, decisions: [decision], scope, capability: 'customers', currentCredentialRevision: 9 });
    expect(result.status).toBe('blocked');
    expect(result.blockers.join(' ')).toMatch(/credential generation|stale/i);
  });

  it('blocks missing mappings, unresolved entities, and cross-scope approvals', () => {
    const loaded = plan();
    const decision = createShadowImportReviewDecision(loaded, { batchId: loaded.batch.id, decision: 'accepted', reason: 'Review recorded in another scope.' }, { actorId: 'manager-1', scope: { ...scope, branchId: 'other-branch' }, now: '2026-08-04T12:10:00Z', id: 'approval-3' });
    const incomplete = { ...loaded, externalIdMaps: loaded.externalIdMaps.filter((map) => map.entity !== 'address'), reconciliation: { ...loaded.reconciliation, entities: loaded.reconciliation.entities.map((entity) => entity.entity === 'address' ? { ...entity, status: 'needs-review' as const } : entity), status: 'needs-review' as const } };
    const result = assessShadowImportCutover({ plan: incomplete, decisions: [decision], scope, capability: 'customers' });
    expect(result.status).toBe('blocked');
    expect(result.blockers.join(' ')).toMatch(/needs review|identity maps|accepted review/i);
  });

  it('blocks a reconciled capability when no tested rollback reference is supplied', () => {
    const loaded = plan(8);
    const decision = createShadowImportReviewDecision(loaded, { batchId: loaded.batch.id, decision: 'accepted', reason: 'Evidence reviewed.' }, { actorId: 'manager-1', scope, now: '2026-08-04T12:10:00Z', id: 'approval-4', currentCredentialRevision: 8 });
    const result = assessShadowImportCutover({ plan: loaded, decisions: [decision], scope, capability: 'customers', currentCredentialRevision: 8 });
    expect(result.status).toBe('blocked');
    expect(result.blockers.join(' ')).toMatch(/rollback/i);
  });
});
