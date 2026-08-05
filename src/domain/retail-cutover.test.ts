import { describe, expect, it } from 'vitest';
import { advanceRetailCutover, createRetailCutoverPlan, createRetailCutoverPlanFromHubAssessment, cutoverPlanChecksum, evaluateRetailCutoverReadiness } from './retail-cutover';

const sha = (letter: string) => letter.repeat(64);
const scope = { companyId: 'company-bakaloo', branchId: 'branch-main' };
const baseInput = (differenceCount = 0) => ({
  id: 'cutover-orders-001',
  capability: 'orders' as const,
  scope,
  baselineChecksum: sha('a'),
  reconciliation: {
    remoteRecordCount: 12,
    localRecordCount: 12,
    differenceCount,
    remoteChecksum: sha('b'),
    localChecksum: sha('c'),
    reconciliationChecksum: sha('d'),
  },
});

describe('retail capability cutover', () => {
  it('requires a clean parallel reconciliation and independent approval before cutover', () => {
    let plan = createRetailCutoverPlan(baseInput(), 'maker', '2026-08-04T10:00:00.000Z');
    expect(plan.transitions).toMatchObject([{ fromPhase: 'new', toPhase: 'shadow', decision: 'create', fromVersion: 0, toVersion: 1, actorId: 'maker' }]);
    expect(evaluateRetailCutoverReadiness(plan).nextAction).toMatch(/parallel/i);
    plan = advanceRetailCutover(plan, { decision: 'start-parallel', expectedVersion: 1 }, 'maker', '2026-08-04T10:01:00.000Z');
    plan = advanceRetailCutover(plan, { decision: 'reconciled', expectedVersion: 2, evidenceReference: 'RECON-001' }, 'checker', '2026-08-04T10:02:00.000Z');
    expect(() => advanceRetailCutover(plan, { decision: 'approved', expectedVersion: 3, evidenceReference: 'APPROVAL-001' }, 'maker', '2026-08-04T10:03:00.000Z')).toThrow(/independent/i);
    plan = advanceRetailCutover(plan, { decision: 'approved', expectedVersion: 3, evidenceReference: 'APPROVAL-001' }, 'approver', '2026-08-04T10:03:00.000Z');
    plan = advanceRetailCutover(plan, { decision: 'cutover', expectedVersion: 4, rollbackWindowHours: 2, evidenceReference: 'CUTOVER-001' }, 'operator', '2026-08-04T10:04:00.000Z');
    expect(plan.transitions).toHaveLength(5);
    expect(plan.transitions?.at(-1)).toMatchObject({ fromPhase: 'approved', toPhase: 'rollback-window', decision: 'cutover', actorId: 'operator', evidenceReference: 'CUTOVER-001' });
    expect(plan.phase).toBe('rollback-window');
    expect(evaluateRetailCutoverReadiness(plan, '2026-08-04T11:00:00.000Z').goNoGo).toBe('go');
    expect(cutoverPlanChecksum(plan)).toMatch(/^[a-f0-9]{64}$/);
    expect(() => advanceRetailCutover(plan, { decision: 'retire', expectedVersion: 5 }, 'operator', '2026-08-04T11:00:00.000Z')).toThrow(/rollback window/i);
  });

  it('fails closed when reconciliation differences remain and never resumes a blocked plan', () => {
    let plan = createRetailCutoverPlan(baseInput(2), 'maker', '2026-08-04T10:00:00.000Z');
    plan = advanceRetailCutover(plan, { decision: 'start-parallel', expectedVersion: 1 }, 'maker', '2026-08-04T10:01:00.000Z');
    expect(() => advanceRetailCutover(plan, { decision: 'reconciled', expectedVersion: 2, evidenceReference: 'RECON-DRIFT' }, 'checker', '2026-08-04T10:02:00.000Z')).toThrow(/difference/i);
    plan = advanceRetailCutover(plan, { decision: 'block', expectedVersion: 2, reason: 'Remote order and local order counts disagree.', evidenceReference: 'INCIDENT-001' }, 'checker', '2026-08-04T10:03:00.000Z');
    expect(plan.phase).toBe('blocked');
    expect(() => advanceRetailCutover(plan, { decision: 'start-parallel', expectedVersion: 3 }, 'maker')).toThrow(/new plan/i);
  });

  it('allows rollback only inside the recorded window and rejects stale writes', () => {
    let plan = createRetailCutoverPlan(baseInput(), 'maker', '2026-08-04T10:00:00.000Z');
    plan = advanceRetailCutover(plan, { decision: 'start-parallel', expectedVersion: 1 }, 'maker');
    plan = advanceRetailCutover(plan, { decision: 'reconciled', expectedVersion: 2, evidenceReference: 'RECON-002' }, 'checker');
    plan = advanceRetailCutover(plan, { decision: 'approved', expectedVersion: 3, evidenceReference: 'APPROVAL-002' }, 'approver');
    plan = advanceRetailCutover(plan, { decision: 'cutover', expectedVersion: 4, rollbackWindowHours: 1, evidenceReference: 'CUTOVER-002' }, 'operator', '2026-08-04T10:00:00.000Z');
    expect(() => advanceRetailCutover(plan, { decision: 'rollback', expectedVersion: 4, evidenceReference: 'ROLLBACK-STALE' }, 'operator')).toThrow(/stale/i);
    const rolledBack = advanceRetailCutover(plan, { decision: 'rollback', expectedVersion: 5, evidenceReference: 'ROLLBACK-002' }, 'recovery', '2026-08-04T10:30:00.000Z');
    expect(rolledBack.phase).toBe('rolled-back');
    expect(() => advanceRetailCutover(plan, { decision: 'rollback', expectedVersion: 5, evidenceReference: 'ROLLBACK-LATE' }, 'recovery', '2026-08-04T12:00:00.000Z')).toThrow(/window has closed/i);
  });

  it('converts only a clean, read-only Hub assessment into a scoped shadow plan', () => {
    const checksum = sha('e');
    const plan = createRetailCutoverPlanFromHubAssessment({
      scope,
      evidenceReference: 'HUB-ASSESSMENT-001',
      assessment: {
        source: 'bakaloo',
        scope: { tenantId: 'tenant-1', ...scope },
        capability: 'orders',
        status: 'ready-for-parallel-run',
        blockers: [],
        requiredEntities: ['order'],
        planId: 'hub-orders-001',
        planChecksum: checksum,
        remoteRecordCount: 4,
        localRecordCount: 4,
        differenceCount: 0,
        remoteChecksum: checksum,
        localChecksum: sha('f'),
        reconciliationChecksum: sha('1'),
        approvalDecisionId: 'decision-1',
        credentialRevision: 3,
        rollbackReference: 'rollback-1',
        writeBackAllowed: false,
      },
    }, 'maker', '2026-08-04T10:00:00.000Z');
    expect(plan).toMatchObject({ id: 'hub-orders-001', capability: 'orders', phase: 'shadow', baselineChecksum: checksum, reconciliation: { remoteRecordCount: 4, localRecordCount: 4, differenceCount: 0, evidenceReference: 'HUB-ASSESSMENT-001' } });
  });

  it('fails closed for blocked, mismatched, or checksum-drifting Hub assessments', () => {
    const assessment = { source: 'bakaloo' as const, scope: { tenantId: 'tenant-1', ...scope }, capability: 'orders' as const, status: 'blocked' as const, blockers: ['stale'], requiredEntities: ['order'], planId: 'hub-orders-002', planChecksum: sha('a'), remoteRecordCount: 1, localRecordCount: 0, differenceCount: 1, remoteChecksum: sha('a'), localChecksum: sha('b'), reconciliationChecksum: sha('c'), writeBackAllowed: false as const };
    expect(() => createRetailCutoverPlanFromHubAssessment({ assessment, scope, evidenceReference: 'HUB-002' }, 'maker')).toThrow(/blocked/i);
    expect(() => createRetailCutoverPlanFromHubAssessment({ assessment: { ...assessment, status: 'ready-for-parallel-run', blockers: [], differenceCount: 0 }, scope: { companyId: 'other', branchId: scope.branchId }, evidenceReference: 'HUB-002' }, 'maker')).toThrow(/scope/i);
    expect(() => createRetailCutoverPlanFromHubAssessment({ assessment: { ...assessment, status: 'ready-for-parallel-run', blockers: [], differenceCount: 0, remoteChecksum: sha('d') }, scope, evidenceReference: 'HUB-002' }, 'maker')).toThrow(/checksums/i);
  });
});
