import { createHash } from 'node:crypto';
import type { OperatingRecordScope } from '../shared/revenue-ops-contracts';

export type AutomationScheduleFrequency = 'hourly' | 'daily' | 'weekly';
export type ScheduleTriggerDecision = 'due' | 'not-due' | 'outside-window' | 'disabled' | 'deduplicated' | 'blocked';

export interface AutomationSchedule {
  id: string;
  name: string;
  workflowInstanceId: string;
  transitionId: string;
  scope: OperatingRecordScope;
  frequency: AutomationScheduleFrequency;
  timeZone: 'UTC' | 'Asia/Kolkata';
  windowStart: string;
  windowEnd: string;
  enabled: boolean;
  version: number;
}

export interface ScheduleTriggerRecord {
  scheduleId: string;
  slotKey: string;
  idempotencyKey: string;
  dueAt: string;
  decision: ScheduleTriggerDecision;
  reason: string;
}

export interface AutomationSchedulerFailure {
  id: string;
  scheduleId: string;
  slotKey: string;
  reason: string;
  attempts: number;
  status: 'open' | 'resolved';
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolutionReference?: string;
}

export interface AutomationSchedulerAction {
  id: string;
  failureId: string;
  action: 'retry' | 'escalate' | 'resolve';
  actorId: string;
  reason: string;
  createdAt: string;
}

function minutes(value: string): number {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) throw new Error(`Invalid schedule time: ${value}.`);
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function localParts(date: Date, timeZone: AutomationSchedule['timeZone']): { day: string; hour: number; minute: number; weekday: number } {
  const shifted = new Date(date.getTime() + (timeZone === 'Asia/Kolkata' ? 330 : 0) * 60_000);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes(), weekday: shifted.getUTCDay() };
}

function slotKey(schedule: AutomationSchedule, date: Date): string {
  const parts = localParts(date, schedule.timeZone);
  if (schedule.frequency === 'hourly') return `${parts.day}T${String(parts.hour).padStart(2, '0')}`;
  if (schedule.frequency === 'weekly') return `${parts.day}-w${parts.weekday}`;
  return parts.day;
}

function isFrequencyDue(schedule: AutomationSchedule, date: Date): boolean {
  const parts = localParts(date, schedule.timeZone);
  if (schedule.frequency === 'hourly') return parts.minute === 0;
  if (schedule.frequency === 'weekly') return parts.weekday === 1;
  return true;
}

/** Evaluates one scheduler tick. It only emits a trigger decision; it never starts a workflow run. */
export function evaluateAutomationSchedule(schedule: AutomationSchedule, now = new Date(), consumedSlotKeys: ReadonlySet<string> = new Set()): ScheduleTriggerRecord {
  if (!Number.isFinite(now.getTime())) throw new Error('Schedule evaluation time is invalid.');
  const start = minutes(schedule.windowStart);
  const end = minutes(schedule.windowEnd);
  const parts = localParts(now, schedule.timeZone);
  const currentMinutes = parts.hour * 60 + parts.minute;
  const withinWindow = start <= end ? currentMinutes >= start && currentMinutes <= end : currentMinutes >= start || currentMinutes <= end;
  const slot = slotKey(schedule, now);
  const idempotencyKey = `schedule:${schedule.id}:${slot}`;
  const dueAt = now.toISOString();
  if (!schedule.enabled) return { scheduleId: schedule.id, slotKey: slot, idempotencyKey, dueAt, decision: 'disabled', reason: 'Schedule is disabled.' };
  if (!withinWindow) return { scheduleId: schedule.id, slotKey: slot, idempotencyKey, dueAt, decision: 'outside-window', reason: `Current ${schedule.timeZone} time is outside the configured execution window.` };
  if (!isFrequencyDue(schedule, now)) return { scheduleId: schedule.id, slotKey: slot, idempotencyKey, dueAt, decision: 'not-due', reason: `The ${schedule.frequency} cadence is not due at this scheduler tick.` };
  if (consumedSlotKeys.has(slot)) return { scheduleId: schedule.id, slotKey: slot, idempotencyKey, dueAt, decision: 'deduplicated', reason: 'This schedule slot already produced a trigger.' };
  return { scheduleId: schedule.id, slotKey: slot, idempotencyKey, dueAt, decision: 'due', reason: 'Cadence and execution window are satisfied.' };
}

export function scheduleDefinitionChecksum(schedule: AutomationSchedule): string {
  return createHash('sha256').update(JSON.stringify(schedule), 'utf8').digest('hex');
}
