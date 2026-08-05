import { describe, expect, it } from 'vitest';
import { buildAutomationReadiness } from './automation-readiness';
import { createInitialKernelState } from './kernel';

describe('automation readiness', () => {
  it('blocks missing approval policy and flags self-approval risk without executing writes', () => {
    const state = createInitialKernelState();
    const workflow = state.workflowDefinitions[0]!;
    const snapshot = { workflowDefinitions: [{ ...workflow, transitions: [{ ...workflow.transitions[0]!, approvalPolicyId: 'missing-policy' }] }], approvalPolicies: state.approvalPolicies, workflowInstances: state.workflowInstances, approvalRequests: state.approvalRequests };
    expect(buildAutomationReadiness(snapshot, '2026-07-18T00:00:00.000Z')).toMatchObject({ total: 1, blocked: 1, assessments: [{ nextAction: 'configure-approval-policy', approvalTransitionCount: 1 }] });
  });

  it('reports healthy workflows and stale instances explicitly', () => {
    const state = createInitialKernelState();
    const workflow = state.workflowDefinitions[0]!;
    const clean = buildAutomationReadiness({ workflowDefinitions: [workflow], approvalPolicies: state.approvalPolicies, workflowInstances: [], approvalRequests: [] });
    expect(clean).toMatchObject({ ready: 1, blocked: 0 });
    const stale = buildAutomationReadiness({ workflowDefinitions: [workflow], approvalPolicies: state.approvalPolicies, workflowInstances: [{ ...state.workflowInstances[0]!, state: 'unknown' }], approvalRequests: [] });
    expect(stale.assessments[0]).toMatchObject({ readiness: 'blocked', staleInstances: 1, nextAction: 'repair-instance' });
  });
});
