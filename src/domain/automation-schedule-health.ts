import type { AutomationSchedule, ScheduleTriggerRecord } from './automation-schedules';

export interface AutomationScheduleHealth {
  scheduleId: string;
  status: 'healthy' | 'attention' | 'blocked';
  enabled: boolean;
  triggerCount: number;
  lastTriggeredAt?: string;
  nextAction: 'monitor' | 'enable' | 'repair-schedule' | 'review-trigger';
  reason: string;
}

/** Produces review-only schedule health; it never evaluates or executes a schedule. */
export function buildAutomationScheduleHealth(schedules: AutomationSchedule[], triggers: ScheduleTriggerRecord[], now = new Date()): AutomationScheduleHealth[] {
  if (!Number.isFinite(now.getTime())) throw new Error('Schedule health timestamp is invalid.');
  return schedules.map((schedule) => {
    const history = triggers.filter((trigger) => trigger.scheduleId === schedule.id).sort((left, right) => Date.parse(right.dueAt) - Date.parse(left.dueAt));
    if (!schedule.enabled) return { scheduleId: schedule.id, status: 'attention', enabled: false, triggerCount: history.length, lastTriggeredAt: history[0]?.dueAt, nextAction: 'enable', reason: 'Schedule is disabled and will not produce proposals.' };
    if (!schedule.workflowInstanceId.trim() || !schedule.transitionId.trim()) return { scheduleId: schedule.id, status: 'blocked', enabled: true, triggerCount: history.length, lastTriggeredAt: history[0]?.dueAt, nextAction: 'repair-schedule', reason: 'Workflow instance and transition are required.' };
    if (history.length === 0) return { scheduleId: schedule.id, status: 'attention', enabled: true, triggerCount: 0, nextAction: 'monitor', reason: 'No trigger evidence has been recorded yet.' };
    return { scheduleId: schedule.id, status: 'healthy', enabled: true, triggerCount: history.length, lastTriggeredAt: history[0]?.dueAt, nextAction: 'review-trigger', reason: 'Recent trigger evidence is available for workflow review.' };
  });
}
