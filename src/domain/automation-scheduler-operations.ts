import { createHash } from 'node:crypto';
import type { AutomationSchedule, AutomationSchedulerAction, AutomationSchedulerFailure, ScheduleTriggerRecord } from './automation-schedules';

export interface AutomationRetryPolicy {
  maxAttempts: number;
  retryAfterMinutes: number;
  escalateAfterMinutes: number;
}

export type SchedulerFailureAction = 'retry' | 'monitor' | 'escalate' | 'resolve';

export interface SchedulerFailureOperation {
  failureId: string;
  scheduleId: string;
  action: SchedulerFailureAction;
  attempts: number;
  ageMinutes: number;
  reason: string;
}

export interface SchedulerOperationsReport {
  generatedAt: string;
  policy: AutomationRetryPolicy;
  openFailures: number;
  retryable: number;
  escalated: number;
  disabledSchedules: number;
  actions: SchedulerFailureOperation[];
  auditTimeline: Array<{ id: string; failureId: string; action: string; actorId: string; reason: string; occurredAt: string }>;
  workQueue: Array<{ failureId: string; scheduleId: string; priority: 'high' | 'medium' | 'low'; ownerRole: 'operations' | 'workflow-admin'; action: SchedulerFailureAction; reason: string }>;
  reliability: Array<{ scheduleId: string; triggerCount: number; failureCount: number; recoveryCount: number; reliabilityPercent: number }>;
  checksum: string;
}

function validPolicy(policy: AutomationRetryPolicy): void {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) throw new Error('Scheduler max attempts must be a positive integer.');
  if (!Number.isFinite(policy.retryAfterMinutes) || policy.retryAfterMinutes < 0) throw new Error('Scheduler retry delay is invalid.');
  if (!Number.isFinite(policy.escalateAfterMinutes) || policy.escalateAfterMinutes < policy.retryAfterMinutes) throw new Error('Scheduler escalation window is invalid.');
}

/** Review-only retry/escalation plan. It does not retry or mutate any failure. */
export function buildSchedulerOperations(schedules: AutomationSchedule[], failures: AutomationSchedulerFailure[], generatedAt = new Date().toISOString(), policy: AutomationRetryPolicy = { maxAttempts: 3, retryAfterMinutes: 15, escalateAfterMinutes: 120 }, triggers: ScheduleTriggerRecord[] = [], actionsLedger: AutomationSchedulerAction[] = []): SchedulerOperationsReport {
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(generated)) throw new Error('Scheduler operations timestamp is invalid.');
  validPolicy(policy);
  const scheduleById = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  const open = failures.filter(({ status }) => status === 'open');
  const actions = open.map((failure) => {
    const ageMinutes = Math.max(0, Math.floor((generated - Date.parse(failure.updatedAt)) / 60_000));
    const schedule = scheduleById.get(failure.scheduleId);
    const action: SchedulerFailureAction = !schedule || !schedule.enabled ? 'resolve' : failure.attempts >= policy.maxAttempts || ageMinutes >= policy.escalateAfterMinutes ? 'escalate' : ageMinutes >= policy.retryAfterMinutes ? 'retry' : 'monitor';
    const reason = action === 'retry' ? 'Retry window is open and the schedule remains enabled.' : action === 'escalate' ? 'Failure exceeded the retry or escalation budget; independent operations review is required.' : action === 'resolve' ? 'The schedule is missing or disabled; resolve with a repair decision before re-enabling.' : 'Retry window has not opened yet.';
    return { failureId: failure.id, scheduleId: failure.scheduleId, action, attempts: failure.attempts, ageMinutes, reason };
  }).sort((left, right) => left.failureId.localeCompare(right.failureId));
  const auditTimeline = actionsLedger.map((action) => ({ id: action.id, failureId: action.failureId, action: action.action, actorId: action.actorId, reason: action.reason, occurredAt: action.createdAt })).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id));
  const workQueue = actions.map((operation) => ({ failureId: operation.failureId, scheduleId: operation.scheduleId, priority: operation.action === 'escalate' ? 'high' as const : operation.action === 'retry' ? 'medium' as const : 'low' as const, ownerRole: operation.action === 'escalate' ? 'workflow-admin' as const : 'operations' as const, action: operation.action, reason: operation.reason }));
  const reliability = schedules.map((schedule) => { const triggerCount = triggers.filter(({ scheduleId, decision }) => scheduleId === schedule.id && decision === 'due').length; const failureCount = failures.filter(({ scheduleId }) => scheduleId === schedule.id).length; const recoveryCount = actionsLedger.filter(({ failureId, action }) => failures.some((failure) => failure.id === failureId && failure.scheduleId === schedule.id) && ['retry', 'resolve'].includes(action)).length; const denominator = triggerCount + failureCount; return { scheduleId: schedule.id, triggerCount, failureCount, recoveryCount, reliabilityPercent: denominator ? Math.round((triggerCount / denominator) * 100) : 100 }; });
  const payload = JSON.stringify({ generatedAt, policy, openFailures: open.length, actions, auditTimeline, workQueue, reliability });
  return { generatedAt, policy, openFailures: open.length, retryable: actions.filter(({ action }) => action === 'retry').length, escalated: actions.filter(({ action }) => action === 'escalate').length, disabledSchedules: schedules.filter(({ enabled }) => !enabled).length, actions, auditTimeline, workQueue, reliability, checksum: createHash('sha256').update(payload, 'utf8').digest('hex') };
}
