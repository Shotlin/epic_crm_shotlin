import type { ShadowImportPlan } from './shadow-import';
import type { ShadowImportScope } from './shadow-import-postgres-repository';

export type ShadowImportReviewDecisionKind = 'accepted' | 'rejected';
export type ShadowImportReviewApprovalState = 'active' | 'stale' | 'unverified';

export interface ShadowImportReviewDecisionInput {
  batchId: string;
  decision: ShadowImportReviewDecisionKind;
  reason: string;
}

export interface ShadowImportReviewDecision {
  id: string;
  batchId: string;
  source: 'bakaloo';
  decision: ShadowImportReviewDecisionKind;
  reason: string;
  actorId: string;
  scope: ShadowImportScope;
  decidedAt: string;
  planStatus: ShadowImportPlan['reconciliation']['status'];
  planChecksum: string;
  /** Credential generation used by the approved evidence, when source auth is versioned. */
  credentialRevision?: number;
  /** Historical acceptance state projected against the current trusted credential generation. */
  approvalState?: ShadowImportReviewApprovalState;
  writeBackAllowed: false;
}

export interface ShadowImportReviewStore {
  list(scope: ShadowImportScope, batchId?: string): Promise<readonly ShadowImportReviewDecision[]>;
  append(scope: ShadowImportScope, decision: ShadowImportReviewDecision): Promise<void>;
}

export function createShadowImportReviewDecision(
  plan: ShadowImportPlan,
  input: ShadowImportReviewDecisionInput,
  context: { actorId: string; scope: ShadowImportScope; now: string; id: string; currentCredentialRevision?: number },
): ShadowImportReviewDecision {
  const batchId = nonBlank(input.batchId, 'Batch ID');
  if (batchId !== plan.batch.id) throw new Error('Review decision batch does not match the loaded shadow-import plan.');
  const actorId = nonBlank(context.actorId, 'Actor ID');
  const reason = nonBlank(input.reason, 'Review reason');
  if (reason.length > 500) throw new Error('Review reason must be 500 characters or fewer.');
  if (input.decision === 'accepted' && plan.reconciliation.status !== 'reconciled') {
    throw new Error('Only a fully reconciled shadow-import batch can be accepted.');
  }
  const credentialRevision = plan.batch.credentialRevision;
  if (credentialRevision !== undefined && (!isPositiveInteger(credentialRevision) || (input.decision === 'accepted' && context.currentCredentialRevision !== credentialRevision))) {
    if (input.decision === 'accepted') throw new Error('Current shadow-import credential revision is required and must match the evidence; re-pull after credential rotation.');
    throw new Error('Shadow-import credential revision must be a positive integer.');
  }
  if (context.currentCredentialRevision !== undefined && !isPositiveInteger(context.currentCredentialRevision)) {
    throw new Error('Current shadow-import credential revision must be a positive integer.');
  }
  return {
    id: nonBlank(context.id, 'Review decision ID'),
    batchId,
    source: 'bakaloo',
    decision: input.decision,
    reason,
    actorId,
    scope: normalizeScope(context.scope),
    decidedAt: timestamp(context.now),
    planStatus: plan.reconciliation.status,
    planChecksum: plan.batch.integrity.computedChecksum,
    ...(credentialRevision === undefined ? {} : { credentialRevision, ...(input.decision === 'accepted' ? { approvalState: 'active' as const } : {}) }),
    writeBackAllowed: false,
  };
}

/**
 * Projects historical decisions without deleting audit evidence. A rotated
 * credential makes the old acceptance stale; an unavailable resolver is never
 * treated as proof that the acceptance is still active.
 */
export function projectShadowImportReviewApprovalState(
  decision: ShadowImportReviewDecision,
  currentCredentialRevision: number | undefined,
): ShadowImportReviewDecision {
  if (decision.decision !== 'accepted' || decision.credentialRevision === undefined) return clone(decision);
  const approvalState: ShadowImportReviewApprovalState = currentCredentialRevision === undefined
    ? 'unverified'
    : currentCredentialRevision === decision.credentialRevision ? 'active' : 'stale';
  return { ...clone(decision), approvalState };
}

export function createInMemoryShadowImportReviewStore(
  initial: readonly ShadowImportReviewDecision[] = [],
): ShadowImportReviewStore {
  const records = new Map<string, ShadowImportReviewDecision>();
  for (const decision of initial) records.set(decisionKey(decision.scope, decision.id), clone(decision));
  return {
    async list(scope, batchId) {
      const normalized = normalizeScope(scope);
      return [...records.values()]
        .filter((decision) => sameScope(decision.scope, normalized) && (batchId === undefined || decision.batchId === batchId))
        .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
        .map(clone);
    },
    async append(scope, decision) {
      const normalized = normalizeScope(scope);
      if (!sameScope(decision.scope, normalized)) throw new Error('Review decision scope does not match the requested scope.');
      const key = decisionKey(normalized, decision.id);
      if (records.has(key)) throw new Error('Review decision ID already exists in this scope.');
      const existingForBatch = [...records.values()].filter((candidate) => sameScope(candidate.scope, normalized) && candidate.batchId === decision.batchId);
      if (existingForBatch.some((candidate) => candidate.decision === 'accepted')) throw new Error('A shadow-import batch can have only one accepted review decision in this scope.');
      records.set(key, clone(decision));
    },
  };
}

function normalizeScope(scope: ShadowImportScope): ShadowImportScope {
  return {
    tenantId: nonBlank(scope.tenantId, 'Tenant scope'),
    companyId: nonBlank(scope.companyId, 'Company scope'),
    branchId: nonBlank(scope.branchId, 'Branch scope'),
  };
}

function sameScope(left: ShadowImportScope, right: ShadowImportScope): boolean {
  return left.tenantId === right.tenantId && left.companyId === right.companyId && left.branchId === right.branchId;
}

function decisionKey(scope: ShadowImportScope, id: string): string {
  return `${scope.tenantId}:${scope.companyId}:${scope.branchId}:${id}`;
}

function nonBlank(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must not be blank.`);
  return value.trim();
}

function timestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Review decision time must be a valid timestamp.');
  return date.toISOString();
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
