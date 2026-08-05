import { createHash } from 'node:crypto';
import type {
  AdvanceRetailCutoverInput,
  CreateRetailCutoverPlanInput,
  CreateRetailCutoverPlanFromAssessmentInput,
  RetailCutoverPlan,
  RetailCutoverReadiness,
  RetailCutoverTransition,
} from '../shared/retail-cutover-contracts';

const SHA256 = /^[a-f0-9]{64}$/iu;

function clean(value: string | undefined, label: string, minimum = 2): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length < minimum) throw new Error(`${label} is required.`);
  return normalized;
}

function checksum(value: string, label: string): string {
  const normalized = clean(value, label, 64).toLowerCase();
  if (!SHA256.test(normalized)) throw new Error(`${label} must be a SHA-256 checksum.`);
  return normalized;
}

function timestamp(value: string, label: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be a valid timestamp.`);
  return value;
}

function nowIso(value?: string): string {
  return timestamp(value ?? new Date().toISOString(), 'Cutover timestamp');
}

function independent(actorId: string, otherId: string | undefined, label: string): void {
  if (otherId && actorId === otherId) throw new Error(`${label} requires an independent actor.`);
}

function assertVersion(plan: RetailCutoverPlan, expectedVersion: number): void {
  if (plan.version !== expectedVersion) throw new Error('Cutover plan is stale. Refresh before advancing it.');
}

function assertEvidence(value: string | undefined, label = 'Cutover evidence reference'): string {
  return clean(value, label, 4);
}

export function createRetailCutoverPlan(input: CreateRetailCutoverPlanInput, actorId: string, now = new Date().toISOString()): RetailCutoverPlan {
  const reconciliation = input.reconciliation;
  if (!Number.isInteger(reconciliation.remoteRecordCount) || reconciliation.remoteRecordCount < 0) throw new Error('Remote record count must be a non-negative integer.');
  if (!Number.isInteger(reconciliation.localRecordCount) || reconciliation.localRecordCount < 0) throw new Error('Local record count must be a non-negative integer.');
  if (!Number.isInteger(reconciliation.differenceCount) || reconciliation.differenceCount < 0) throw new Error('Reconciliation difference count must be a non-negative integer.');
  const scope = { companyId: clean(input.scope.companyId, 'Cutover company'), branchId: clean(input.scope.branchId, 'Cutover branch') };
  const preparedBy = clean(actorId, 'Cutover maker');
  const preparedAt = nowIso(now);
  const transition: RetailCutoverTransition = {
    fromPhase: 'new',
    toPhase: 'shadow',
    decision: 'create',
    fromVersion: 0,
    toVersion: 1,
    actorId: preparedBy,
    at: preparedAt,
  };
  return {
    id: clean(input.id, 'Cutover plan ID'),
    capability: input.capability,
    sourceSystem: 'bakaloo',
    targetSystem: 'epic-bos',
    scope,
    phase: 'shadow',
    version: 1,
    baselineChecksum: checksum(input.baselineChecksum, 'Baseline checksum'),
    reconciliation: {
      ...reconciliation,
      remoteChecksum: checksum(reconciliation.remoteChecksum, 'Remote checksum'),
      localChecksum: checksum(reconciliation.localChecksum, 'Local checksum'),
      reconciliationChecksum: checksum(reconciliation.reconciliationChecksum, 'Reconciliation checksum'),
      completedAt: reconciliation.completedAt ? timestamp(reconciliation.completedAt, 'Reconciliation completion time') : undefined,
      completedBy: reconciliation.completedBy?.trim() || undefined,
      evidenceReference: reconciliation.evidenceReference?.trim() || undefined,
    },
    preparedBy,
    preparedAt,
    transitions: [transition],
  };
}

/** Converts only a ready, read-only Hub assessment into the local shadow phase. */
export function createRetailCutoverPlanFromHubAssessment(input: CreateRetailCutoverPlanFromAssessmentInput, actorId: string, now = new Date().toISOString()): RetailCutoverPlan {
  const assessment = input.assessment;
  if (assessment.source !== 'bakaloo' || assessment.writeBackAllowed !== false) throw new Error('Only a read-only Bakaloo assessment can create a cutover plan.');
  if (assessment.status !== 'ready-for-parallel-run' || assessment.blockers.length > 0) throw new Error('The Hub assessment is blocked; resolve every blocker before registering a plan.');
  if (assessment.scope.companyId !== input.scope.companyId || assessment.scope.branchId !== input.scope.branchId) throw new Error('Hub assessment scope must match the active company and branch.');
  if (assessment.differenceCount !== 0) throw new Error('The Hub assessment still contains reconciliation differences.');
  const baseline = checksum(assessment.planChecksum, 'Hub plan checksum');
  const remoteChecksum = checksum(assessment.remoteChecksum, 'Hub remote checksum');
  if (baseline !== remoteChecksum) throw new Error('Hub plan and remote checksums do not match.');
  return createRetailCutoverPlan({
    id: assessment.planId,
    capability: mapHubCapability(assessment.capability),
    scope: input.scope,
    baselineChecksum: baseline,
    reconciliation: {
      remoteRecordCount: assessment.remoteRecordCount,
      localRecordCount: assessment.localRecordCount,
      differenceCount: assessment.differenceCount,
      remoteChecksum,
      localChecksum: checksum(assessment.localChecksum, 'Hub local checksum'),
      reconciliationChecksum: checksum(assessment.reconciliationChecksum, 'Hub reconciliation checksum'),
      evidenceReference: clean(input.evidenceReference, 'Hub assessment evidence reference', 4),
    },
  }, actorId, now);
}

function mapHubCapability(capability: CreateRetailCutoverPlanFromAssessmentInput['assessment']['capability']): RetailCutoverPlan['capability'] {
  switch (capability) {
    case 'catalog':
    case 'inventory':
      return 'catalog-inventory';
    case 'customers':
    case 'campaigns':
    case 'storefront':
      return 'analytics';
    case 'settlements':
      return 'finance';
    case 'orders':
      return 'orders';
    case 'delivery':
      return 'delivery';
  }
}

/**
 * Advances only one governed capability. It never calls Bakaloo or changes a
 * storefront; the returned plan is durable-ready evidence for an authorized
 * repository/IPC layer to persist after its own audit transaction.
 */
export function advanceRetailCutover(plan: RetailCutoverPlan, input: AdvanceRetailCutoverInput, actorId: string, now = new Date().toISOString()): RetailCutoverPlan {
  assertVersion(plan, input.expectedVersion);
  const at = nowIso(now);
  const actor = clean(actorId, 'Cutover actor');
  const evidence = input.evidenceReference ? assertEvidence(input.evidenceReference) : undefined;
  const transitions = plan.transitions ?? [];
  const append = (next: RetailCutoverPlan, reason?: string): RetailCutoverPlan => ({
    ...next,
    transitions: [...transitions, {
      fromPhase: plan.phase,
      toPhase: next.phase,
      decision: input.decision,
      fromVersion: plan.version,
      toVersion: next.version,
      actorId: actor,
      at,
      evidenceReference: evidence,
      reason,
    }],
  });
  if (plan.phase === 'retired' || plan.phase === 'rolled-back') throw new Error('A finished cutover plan cannot be changed.');

  if (input.decision === 'block') {
    const reason = clean(input.reason, 'Cutover block reason', 8);
    return append({ ...plan, phase: 'blocked', blockedReason: reason, version: plan.version + 1 }, reason);
  }
  if (plan.phase === 'blocked') throw new Error('Blocked cutover plans require a new plan; they cannot be resumed in place.');

  switch (input.decision) {
    case 'start-parallel':
      if (plan.phase !== 'shadow') throw new Error('Parallel run can start only from the shadow phase.');
      return append({ ...plan, phase: 'parallel', version: plan.version + 1 });
    case 'reconciled':
      if (plan.phase !== 'parallel') throw new Error('Reconciliation can be recorded only after a parallel run.');
      if (plan.reconciliation.differenceCount !== 0) throw new Error('Cutover is blocked while reconciliation differences remain.');
      return append({ ...plan, phase: 'reconciled', reconciliation: { ...plan.reconciliation, completedAt: at, completedBy: actor, evidenceReference: evidence ?? plan.reconciliation.evidenceReference ?? assertEvidence(undefined) }, version: plan.version + 1 });
    case 'approved':
      if (plan.phase !== 'reconciled') throw new Error('Independent approval requires a reconciled plan.');
      independent(actor, plan.preparedBy, 'Cutover approval');
      return append({ ...plan, phase: 'approved', approvedBy: actor, approvedAt: at, approvalEvidenceReference: evidence ?? assertEvidence(undefined), version: plan.version + 1 });
    case 'cutover': {
      if (plan.phase !== 'approved') throw new Error('Cutover requires an approved plan.');
      independent(actor, plan.approvedBy, 'Cutover execution');
      const hours = input.rollbackWindowHours ?? 24;
      if (!Number.isInteger(hours) || hours < 1 || hours > 720) throw new Error('Rollback window must be between 1 and 720 whole hours.');
      const rollbackUntil = new Date(Date.parse(at) + hours * 60 * 60 * 1000).toISOString();
      return append({ ...plan, phase: 'rollback-window', cutoverAt: at, rollbackUntil, rollbackReference: evidence ?? assertEvidence(undefined), version: plan.version + 1 });
    }
    case 'retire':
      if (plan.phase !== 'rollback-window') throw new Error('A capability can retire only from its rollback window.');
      if (!plan.rollbackUntil || Date.parse(at) < Date.parse(plan.rollbackUntil)) throw new Error('The rollback window is still open.');
      return append({ ...plan, phase: 'retired', retiredAt: at, version: plan.version + 1 });
    case 'rollback':
      if (plan.phase !== 'rollback-window') throw new Error('Rollback is available only during the rollback window.');
      if (plan.rollbackUntil && Date.parse(at) >= Date.parse(plan.rollbackUntil)) throw new Error('The rollback window has closed. Create a reviewed rollback incident instead.');
      return append({ ...plan, phase: 'rolled-back', rollbackReference: evidence ?? assertEvidence(undefined), version: plan.version + 1 });
    default:
      return unreachable(input.decision);
  }
}

export function evaluateRetailCutoverReadiness(plan: RetailCutoverPlan, now = new Date().toISOString()): RetailCutoverReadiness {
  const blockers: string[] = [];
  let nextAction = 'No further action is required.';
  if (plan.phase === 'shadow') nextAction = 'Start a read-only parallel run for this capability.';
  if (plan.phase === 'parallel') {
    if (plan.reconciliation.differenceCount) blockers.push(`${plan.reconciliation.differenceCount} reconciliation difference(s) remain.`);
    nextAction = blockers.length ? 'Resolve every difference and rerun reconciliation.' : 'Record independent reconciliation evidence.';
  }
  if (plan.phase === 'reconciled') { blockers.push('Independent approval is still required.'); nextAction = 'Have a different reviewer approve the reconciled capability.'; }
  if (plan.phase === 'approved') { blockers.push('Controlled cutover has not been executed.'); nextAction = 'Execute cutover with a recorded rollback window.'; }
  if (plan.phase === 'rollback-window') {
    const open = Boolean(plan.rollbackUntil && Date.parse(now) < Date.parse(plan.rollbackUntil));
    nextAction = open ? `Monitor the rollback window until ${plan.rollbackUntil}.` : 'Retire the old capability after the rollback window closes.';
  }
  if (plan.phase === 'blocked') { blockers.push(plan.blockedReason ?? 'A cutover block reason is required.'); nextAction = 'Create a corrected plan after resolving the block.'; }
  if (plan.phase === 'rolled-back') nextAction = 'Reconcile the rollback incident before preparing a new plan.';
  return { capability: plan.capability, phase: plan.phase, canAdvance: blockers.length === 0 && !['retired', 'rolled-back'].includes(plan.phase), goNoGo: blockers.length ? 'hold' : 'go', blockers, nextAction };
}

export function cutoverPlanChecksum(plan: RetailCutoverPlan): string {
  const stable: Record<string, unknown> = { ...plan };
  delete stable.version;
  return createHash('sha256').update(JSON.stringify(stable), 'utf8').digest('hex');
}

function unreachable(value: never): never { throw new Error(`Unsupported cutover decision: ${String(value)}`); }
