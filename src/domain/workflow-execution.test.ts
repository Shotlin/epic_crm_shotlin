import { describe, expect, it } from 'vitest';
import { approveAutomationRun, buildAutomationOperationalSummary, completeAutomationRun, proposeAutomationRun, retryAutomationRun, sameAutomationIdempotencyKey, startAutomationRun } from './workflow-execution';
import { createInitialKernelState } from './kernel';

describe('governed workflow execution', () => {
  it('requires independent approval and produces an evidence-backed outcome', () => {
    const state = createInitialKernelState();
    const instance = state.workflowInstances[0]!;
    const workflow = state.workflowDefinitions.find(({ id }) => id === instance.workflowId)!;
    const transition = workflow.transitions.find(({ from }) => from === instance.state)!;
    const run = proposeAutomationRun({ idempotencyKey: 'approval-po-1007-v1', workflowInstanceId: instance.id, transitionId: transition.id, scope: { companyId: 'c1', branchId: 'b1' }, requestedBy: 'maker', now: '2026-07-18T00:00:00.000Z' }, state);
    const approved = transition.approvalPolicyId ? approveAutomationRun(run, 'checker', '2026-07-18T01:00:00.000Z') : run;
    const started = startAutomationRun(approved, 'executor', '2026-07-18T02:00:00.000Z');
    const completed = completeAutomationRun(started, { status: 'succeeded', completedAt: '2026-07-18T03:00:00.000Z', outcomeReference: 'JOB-RESULT-001', expectedVersion: started.version });
    expect(completed).toMatchObject({ status: 'succeeded', attempt: 1, outcomeReference: 'JOB-RESULT-001', version: started.version + 1 });
  });

  it('fails closed for self-approval, stale outcomes, and failed runs without evidence', () => {
    const state = createInitialKernelState();
    const instance = state.workflowInstances[0]!;
    const workflow = state.workflowDefinitions.find(({ id }) => id === instance.workflowId)!;
    const transition = workflow.transitions.find(({ from }) => from === instance.state)!;
    const run = proposeAutomationRun({ idempotencyKey: 'approval-po-1007-v2', workflowInstanceId: instance.id, transitionId: transition.id, scope: { companyId: 'c1', branchId: 'b1' }, requestedBy: 'maker', now: '2026-07-18T00:00:00.000Z' }, state);
    if (run.requiresIndependentApproval) expect(() => approveAutomationRun(run, 'maker', '2026-07-18T01:00:00.000Z')).toThrow('independent');
    const started = startAutomationRun(run.requiresIndependentApproval ? approveAutomationRun(run, 'checker') : run, 'executor');
    expect(() => completeAutomationRun(started, { status: 'failed', completedAt: '2026-07-18T03:00:00.000Z', outcomeReference: '', expectedVersion: started.version })).toThrow('evidence');
    expect(() => completeAutomationRun(started, { status: 'succeeded', completedAt: '2026-07-18T03:00:00.000Z', outcomeReference: 'RESULT', expectedVersion: started.version - 1 })).toThrow('stale');
  });

  it('derives idempotent run identity from the caller key', () => {
    const state = createInitialKernelState();
    const instance = state.workflowInstances[0]!;
    const workflow = state.workflowDefinitions.find(({ id }) => id === instance.workflowId)!;
    const transition = workflow.transitions.find(({ from }) => from === instance.state)!;
    const one = proposeAutomationRun({ idempotencyKey: 'same-key', workflowInstanceId: instance.id, transitionId: transition.id, scope: { companyId: 'c1', branchId: 'b1' }, requestedBy: 'maker' }, state);
    const two = proposeAutomationRun({ idempotencyKey: 'same-key', workflowInstanceId: instance.id, transitionId: transition.id, scope: { companyId: 'c1', branchId: 'b1' }, requestedBy: 'maker' }, state);
    expect(sameAutomationIdempotencyKey(one, two)).toBe(true);
  });

  it('requeues failed runs through approval and surfaces stale operational work', () => {
    const state = createInitialKernelState(); const instance = state.workflowInstances[0]!; const workflow = state.workflowDefinitions.find(({ id }) => id === instance.workflowId)!; const transition = workflow.transitions.find(({ from }) => from === instance.state)!;
    const run = proposeAutomationRun({ idempotencyKey: 'retry-key', workflowInstanceId: instance.id, transitionId: transition.id, scope: { companyId: 'c1', branchId: 'b1' }, requestedBy: 'maker' }, state); const approved = run.requiresIndependentApproval ? approveAutomationRun(run, 'checker') : run; const started = startAutomationRun(approved, 'executor'); const failed = completeAutomationRun(started, { status: 'failed', completedAt: '2026-07-18T01:00:00.000Z', outcomeReference: 'FAIL-1', failureReason: 'Provider timeout.', expectedVersion: started.version });
    const retried = retryAutomationRun(failed, 'executor-2', 'Provider recovered; retry after confirmed timeout.');
    expect(retried).toMatchObject({ status: run.requiresIndependentApproval ? 'proposed' : 'approved', retryReason: expect.stringContaining('Provider recovered') });
    const summary = buildAutomationOperationalSummary([retried, { ...started, status: 'running', startedAt: '2026-07-17T00:00:00.000Z' }], '2026-07-18T00:00:00.000Z', 30);
    expect(summary).toMatchObject({ total: 2, staleRunning: 1, nextActions: expect.arrayContaining([expect.objectContaining({ action: 'approve' }), expect.objectContaining({ action: 'inspect' })]) });
  });
});
