import { createHash } from 'node:crypto';
import type { KernelSnapshot } from '../shared/kernel-contracts';
import type { OperatingRecordScope } from '../shared/revenue-ops-contracts';

export type AutomationRunStatus = 'proposed' | 'approved' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface AutomationRun {
  id: string;
  idempotencyKey: string;
  workflowInstanceId: string;
  workflowId: string;
  transitionId: string;
  scope: OperatingRecordScope;
  requestedBy: string;
  requiresIndependentApproval: boolean;
  status: AutomationRunStatus;
  attempt: number;
  version: number;
  proposedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  startedAt?: string;
  completedAt?: string;
  outcomeReference?: string;
  failureReason?: string;
  retryReason?: string;
}

export interface AutomationRunOutcome {
  status: 'succeeded' | 'failed' | 'cancelled';
  completedAt: string;
  outcomeReference: string;
  failureReason?: string;
  expectedVersion: number;
}

export interface AutomationOperationalSummary {
  generatedAt: string;
  total: number;
  proposed: number;
  approved: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  staleRunning: number;
  nextActions: Array<{ runId: string; action: 'approve' | 'start' | 'retry' | 'inspect'; reason: string }>;
}

function runId(idempotencyKey: string): string {
  return `automation-run-${createHash('sha256').update(idempotencyKey, 'utf8').digest('hex').slice(0, 24)}`;
}

function validDate(value: string): boolean { return Number.isFinite(Date.parse(value)); }

/** Plans a workflow transition; it never mutates the workflow instance itself. */
export function proposeAutomationRun(input: { idempotencyKey: string; workflowInstanceId: string; transitionId: string; scope: OperatingRecordScope; requestedBy: string; now?: string }, snapshot: Pick<KernelSnapshot, 'workflowDefinitions' | 'workflowInstances' | 'approvalPolicies'>): AutomationRun {
  const proposedAt = input.now ?? new Date().toISOString();
  if (!input.idempotencyKey.trim()) throw new Error('Automation idempotency key is required.');
  if (!input.requestedBy.trim()) throw new Error('Automation requester is required.');
  if (!validDate(proposedAt)) throw new Error('Automation proposal timestamp is invalid.');
  const instance = snapshot.workflowInstances.find(({ id }) => id === input.workflowInstanceId);
  const workflow = instance && snapshot.workflowDefinitions.find(({ id }) => id === instance.workflowId);
  const transition = workflow?.transitions.find(({ id }) => id === input.transitionId);
  if (!instance || !workflow || !transition || instance.state !== transition.from) throw new Error('Workflow transition is not available for automation.');
  const policy = transition.approvalPolicyId ? snapshot.approvalPolicies.find(({ id }) => id === transition.approvalPolicyId) : undefined;
  if (transition.approvalPolicyId && (!policy || policy.approverRoleIds.length === 0 || policy.allowSelfApproval)) throw new Error('Automation requires an independent, valid approval policy.');
  return { id: runId(input.idempotencyKey), idempotencyKey: input.idempotencyKey.trim(), workflowInstanceId: instance.id, workflowId: workflow.id, transitionId: transition.id, scope: { ...input.scope }, requestedBy: input.requestedBy.trim(), requiresIndependentApproval: Boolean(transition.approvalPolicyId), status: transition.approvalPolicyId ? 'proposed' : 'approved', attempt: 0, version: 1, proposedAt, ...(transition.approvalPolicyId ? {} : { approvedBy: input.requestedBy.trim(), approvedAt: proposedAt }) };
}

export function approveAutomationRun(run: AutomationRun, approverId: string, approvedAt = new Date().toISOString()): AutomationRun {
  if (run.status !== 'proposed') throw new Error('Only proposed automation runs can be approved.');
  if (!approverId.trim() || approverId.trim() === run.requestedBy) throw new Error('Automation approval requires an independent approver.');
  if (!validDate(approvedAt)) throw new Error('Automation approval timestamp is invalid.');
  return { ...run, status: 'approved', version: run.version + 1, approvedBy: approverId.trim(), approvedAt };
}

export function startAutomationRun(run: AutomationRun, operatorId: string, startedAt = new Date().toISOString()): AutomationRun {
  if (run.status !== 'approved') throw new Error('Only approved automation runs can start.');
  if (!operatorId.trim()) throw new Error('Automation operator is required.');
  if (run.requiresIndependentApproval && operatorId.trim() === run.requestedBy) throw new Error('The requester cannot execute an independently approved automation run.');
  if (!validDate(startedAt)) throw new Error('Automation start timestamp is invalid.');
  return { ...run, status: 'running', attempt: run.attempt + 1, version: run.version + 1, startedAt };
}

export function completeAutomationRun(run: AutomationRun, outcome: AutomationRunOutcome): AutomationRun {
  if (run.status !== 'running') throw new Error('Only running automation runs can complete.');
  if (outcome.expectedVersion !== run.version) throw new Error('Automation outcome is stale.');
  if (!outcome.outcomeReference.trim()) throw new Error('Automation outcome evidence is required.');
  if (!validDate(outcome.completedAt)) throw new Error('Automation completion timestamp is invalid.');
  if (outcome.status === 'failed' && !outcome.failureReason?.trim()) throw new Error('Failed automation runs require a failure reason.');
  return { ...run, status: outcome.status, version: run.version + 1, completedAt: outcome.completedAt, outcomeReference: outcome.outcomeReference.trim(), ...(outcome.failureReason ? { failureReason: outcome.failureReason.trim() } : {}) };
}

/** Requeues a failed run; independent-approval workflows return to proposed, never straight to execution. */
export function retryAutomationRun(run: AutomationRun, operatorId: string, reason: string, retriedAt = new Date().toISOString()): AutomationRun {
  if (run.status !== 'failed') throw new Error('Only failed automation runs can be retried.');
  if (!operatorId.trim() || operatorId.trim() === run.requestedBy) throw new Error('An independent operator is required for retry.');
  if (!reason.trim()) throw new Error('A retry reason is required.');
  if (!validDate(retriedAt)) throw new Error('Automation retry timestamp is invalid.');
  return { ...run, status: run.requiresIndependentApproval ? 'proposed' : 'approved', version: run.version + 1, retryReason: reason.trim(), approvedBy: run.requiresIndependentApproval ? undefined : operatorId.trim(), approvedAt: run.requiresIndependentApproval ? undefined : retriedAt, startedAt: undefined, completedAt: undefined, outcomeReference: undefined };
}

/** Creates an operational queue without executing or mutating any run. */
export function buildAutomationOperationalSummary(runs: AutomationRun[], generatedAt = new Date().toISOString(), staleAfterMinutes = 30): AutomationOperationalSummary {
  if (!validDate(generatedAt)) throw new Error('Automation summary timestamp is invalid.');
  const counts = { proposed: 0, approved: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };
  runs.forEach((run) => { counts[run.status] += 1; });
  const staleCutoff = Date.parse(generatedAt) - staleAfterMinutes * 60_000;
  const staleRunning = runs.filter((run) => run.status === 'running' && run.startedAt && Date.parse(run.startedAt) <= staleCutoff).length;
  const nextActions: AutomationOperationalSummary['nextActions'] = [];
  for (const run of runs) {
    if (run.status === 'proposed') nextActions.push({ runId: run.id, action: 'approve', reason: 'Independent approval is required before execution.' });
    else if (run.status === 'approved') nextActions.push({ runId: run.id, action: 'start', reason: 'Approved run is waiting for an operator.' });
    else if (run.status === 'failed') nextActions.push({ runId: run.id, action: 'retry', reason: run.failureReason ?? 'Execution failed; capture a retry reason.' });
    else if (run.status === 'running' && run.startedAt && Date.parse(run.startedAt) <= staleCutoff) nextActions.push({ runId: run.id, action: 'inspect', reason: 'Run has exceeded the operational running-time budget.' });
  }
  return { generatedAt, total: runs.length, ...counts, staleRunning, nextActions };
}

export function sameAutomationIdempotencyKey(left: AutomationRun, right: AutomationRun): boolean { return left.id === right.id && left.idempotencyKey === right.idempotencyKey; }
