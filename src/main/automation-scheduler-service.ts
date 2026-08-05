import type { AutomationSchedule, ScheduleTriggerRecord } from '../domain/automation-schedules';
import { proposeAutomationRun } from '../domain/workflow-execution';
import type { KernelSnapshot } from '../shared/kernel-contracts';
import type { OperatingRecordScope } from '../shared/revenue-ops-contracts';
import type { AutomationRunStore } from './automation-run-store';
import type { AutomationScheduleStore } from './automation-schedule-store';

export type ScheduledAutomationTickResult = ScheduleTriggerRecord & { automationRunId?: string; failureId?: string; failureReason?: string };

/**
 * Evaluates every active schedule and creates only a durable automation proposal.
 * It deliberately never approves, starts, or executes the workflow transition.
 */
export function runAutomationSchedulerTick(
  scope: OperatingRecordScope,
  scheduleStore: AutomationScheduleStore,
  runStore: AutomationRunStore,
  snapshot: Pick<KernelSnapshot, 'workflowDefinitions' | 'workflowInstances' | 'approvalPolicies'>,
  requestedBy: string,
  now = new Date(),
): ScheduledAutomationTickResult[] {
  return scheduleStore.list(scope).map((schedule: AutomationSchedule) => {
    const preview = scheduleStore.preview(scope, schedule.id, now);
    if (preview.decision !== 'due') return preview;
    try {
      const proposal = proposeAutomationRun({
        idempotencyKey: preview.idempotencyKey,
        workflowInstanceId: schedule.workflowInstanceId,
        transitionId: schedule.transitionId,
        scope,
        requestedBy,
        now: preview.dueAt,
      }, snapshot);
      const saved = runStore.save(scope, proposal);
      const persisted = scheduleStore.persistTrigger(scope, preview);
      return { ...persisted, automationRunId: saved.id };
    } catch (errorValue) {
      const reason = errorValue instanceof Error ? errorValue.message : 'Automation proposal creation failed.';
      const failure = scheduleStore.recordFailure(scope, preview, reason, now.toISOString());
      return { ...preview, decision: 'blocked', reason: `Proposal creation failed and was dead-lettered: ${reason}`, failureId: failure.id, failureReason: failure.reason };
    }
  });
}
