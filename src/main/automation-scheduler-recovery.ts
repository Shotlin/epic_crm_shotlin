import { buildSchedulerOperations } from '../domain/automation-scheduler-operations';
import { proposeAutomationRun, type AutomationRun } from '../domain/workflow-execution';
import type { KernelSnapshot } from '../shared/kernel-contracts';
import type { OperatingRecordScope } from '../shared/revenue-ops-contracts';
import type { AutomationRunStore } from './automation-run-store';
import type { AutomationScheduleStore } from './automation-schedule-store';

export function executeSchedulerRetry(scope: OperatingRecordScope, failureId: string, actorId: string, reason: string, scheduleStore: AutomationScheduleStore, runStore: AutomationRunStore, snapshot: Pick<KernelSnapshot, 'workflowDefinitions' | 'workflowInstances' | 'approvalPolicies'>, now = new Date()): AutomationRun {
  if (!actorId.trim() || !reason.trim()) throw new Error('Scheduler retry requires an accountable operator and reason.');
  const failures = scheduleStore.listFailures(scope, 'open');
  const failure = failures.find(({ id }) => id === failureId);
  if (!failure) throw new Error('Scheduler failure is outside the active scope or already resolved.');
  const operations = buildSchedulerOperations(scheduleStore.list(scope), failures, now.toISOString());
  const operation = operations.actions.find(({ failureId: id }) => id === failureId);
  if (operation?.action !== 'retry') throw new Error('This scheduler failure is not currently eligible for retry; review the escalation or monitor action.');
  const schedule = scheduleStore.list(scope).find(({ id }) => id === failure.scheduleId);
  if (!schedule) throw new Error('The schedule referenced by this failure no longer exists.');
  const trigger = scheduleStore.getFailureTrigger(scope, failureId);
  const proposal = proposeAutomationRun({ idempotencyKey: trigger.idempotencyKey, workflowInstanceId: schedule.workflowInstanceId, transitionId: schedule.transitionId, scope, requestedBy: actorId, now: now.toISOString() }, snapshot);
  const saved = runStore.save(scope, proposal);
  scheduleStore.persistTrigger(scope, trigger);
  scheduleStore.resolveFailure(scope, failureId, `Retry proposal ${saved.id} created: ${reason.trim()}`, now.toISOString());
  scheduleStore.recordAction(scope, failureId, 'retry', actorId, reason, now.toISOString());
  return saved;
}

export function acknowledgeSchedulerEscalation(scope: OperatingRecordScope, failureId: string, actorId: string, reason: string, scheduleStore: AutomationScheduleStore, now = new Date()): ReturnType<AutomationScheduleStore['recordAction']> {
  if (!actorId.trim() || !reason.trim()) throw new Error('Escalation acknowledgement requires an accountable operator and reason.');
  const failures = scheduleStore.listFailures(scope, 'open');
  if (!failures.some(({ id }) => id === failureId)) throw new Error('Scheduler failure is outside the active scope or already resolved.');
  const operations = buildSchedulerOperations(scheduleStore.list(scope), failures, now.toISOString());
  if (operations.actions.find(({ failureId: id }) => id === failureId)?.action !== 'escalate') throw new Error('This scheduler failure is not currently escalated.');
  return scheduleStore.recordAction(scope, failureId, 'escalate', actorId, reason, now.toISOString());
}
