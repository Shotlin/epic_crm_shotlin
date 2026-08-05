import type { KernelSnapshot, WorkflowDefinition } from '../shared/kernel-contracts';

export type AutomationReadiness = 'ready' | 'degraded' | 'blocked';

export interface WorkflowAutomationAssessment {
  workflowId: string;
  name: string;
  resource: string;
  readiness: AutomationReadiness;
  transitionCount: number;
  approvalTransitionCount: number;
  pendingRequests: number;
  staleInstances: number;
  blockers: string[];
  nextAction: 'monitor' | 'configure-approval-policy' | 'repair-instance' | 'review-self-approval';
}

export interface AutomationReadinessSummary {
  generatedAt: string;
  total: number;
  ready: number;
  degraded: number;
  blocked: number;
  assessments: WorkflowAutomationAssessment[];
}

function assessWorkflow(snapshot: KernelSnapshot, workflow: WorkflowDefinition): WorkflowAutomationAssessment {
  const approvalTransitions = workflow.transitions.filter(({ approvalPolicyId }) => Boolean(approvalPolicyId));
  const policies = approvalTransitions.map(({ approvalPolicyId }) => snapshot.approvalPolicies.find(({ id }) => id === approvalPolicyId));
  const missingPolicy = approvalTransitions.some((_, index) => !policies[index]);
  const invalidPolicy = policies.some((policy) => !policy || policy.approverRoleIds.length === 0 || policy.approvalsRequired < 1);
  const selfApprovalRisk = policies.some((policy) => policy?.allowSelfApproval);
  const instances = snapshot.workflowInstances.filter(({ workflowId }) => workflowId === workflow.id);
  const staleInstances = instances.filter(({ state }) => !workflow.states.includes(state)).length;
  const pendingRequests = snapshot.approvalRequests.filter((request) => request.status === 'pending' && instances.some(({ id }) => id === request.workflowInstanceId)).length;
  const blockers: string[] = [];
  if (missingPolicy || invalidPolicy) blockers.push('One or more approval transitions lack a valid independent approval policy.');
  if (staleInstances) blockers.push(`${staleInstances} workflow instance${staleInstances === 1 ? '' : 's'} use an unknown state.`);
  if (selfApprovalRisk) blockers.push('A configured approval policy permits self-approval; independent review is not enforced.');
  const readiness: AutomationReadiness = missingPolicy || invalidPolicy || staleInstances ? 'blocked' : selfApprovalRisk ? 'degraded' : 'ready';
  const nextAction: WorkflowAutomationAssessment['nextAction'] = missingPolicy || invalidPolicy ? 'configure-approval-policy' : staleInstances ? 'repair-instance' : selfApprovalRisk ? 'review-self-approval' : 'monitor';
  return { workflowId: workflow.id, name: workflow.name, resource: workflow.resource, readiness, transitionCount: workflow.transitions.length, approvalTransitionCount: approvalTransitions.length, pendingRequests, staleInstances, blockers, nextAction };
}

/** Validates automation safety without executing a workflow transition or business write. */
export function buildAutomationReadiness(snapshot: Pick<KernelSnapshot, 'workflowDefinitions' | 'approvalPolicies' | 'workflowInstances' | 'approvalRequests'>, generatedAt = new Date().toISOString()): AutomationReadinessSummary {
  const assessments = snapshot.workflowDefinitions.map((workflow) => assessWorkflow(snapshot as KernelSnapshot, workflow)).sort((left, right) => left.name.localeCompare(right.name));
  return { generatedAt, total: assessments.length, ready: assessments.filter(({ readiness }) => readiness === 'ready').length, degraded: assessments.filter(({ readiness }) => readiness === 'degraded').length, blocked: assessments.filter(({ readiness }) => readiness === 'blocked').length, assessments };
}
