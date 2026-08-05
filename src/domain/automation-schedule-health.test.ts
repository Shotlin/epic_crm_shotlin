import { describe, expect, it } from 'vitest';
import { buildAutomationScheduleHealth } from './automation-schedule-health';
import type { AutomationSchedule, ScheduleTriggerRecord } from './automation-schedules';

const scope = { companyId: 'c1', branchId: 'b1' } as const;
const schedule: AutomationSchedule = { id: 's1', name: 'Daily', workflowInstanceId: 'i1', transitionId: 't1', scope, frequency: 'daily', timeZone: 'UTC', windowStart: '09:00', windowEnd: '18:00', enabled: true, version: 1 };
const trigger: ScheduleTriggerRecord = { scheduleId: 's1', slotKey: '2026-07-18', idempotencyKey: 'schedule:s1:2026-07-18', dueAt: '2026-07-18T10:00:00.000Z', decision: 'due', reason: 'Cadence and execution window are satisfied.' };

describe('automation schedule health', () => {
  it('classifies enabled schedules with trigger evidence as healthy', () => { expect(buildAutomationScheduleHealth([schedule], [trigger])[0]).toMatchObject({ status: 'healthy', triggerCount: 1, nextAction: 'review-trigger' }); });
  it('fails closed for disabled and incomplete definitions', () => { expect(buildAutomationScheduleHealth([{ ...schedule, enabled: false }], [])[0]?.nextAction).toBe('enable'); expect(buildAutomationScheduleHealth([{ ...schedule, transitionId: '' }], [])[0]?.status).toBe('blocked'); });
});
