import { describe, expect, it } from 'vitest';
import { evaluateAutomationSchedule, scheduleDefinitionChecksum, type AutomationSchedule } from './automation-schedules';

const base: AutomationSchedule = { id: 'sched-1', name: 'Morning approvals', workflowInstanceId: 'instance-1', transitionId: 'transition-1', scope: { companyId: 'c1', branchId: 'b1' }, frequency: 'daily', timeZone: 'Asia/Kolkata', windowStart: '09:00', windowEnd: '18:00', enabled: true, version: 1 };

describe('automation schedules', () => {
  it('emits one deterministic due slot inside the configured India window', () => {
    const result = evaluateAutomationSchedule(base, new Date('2026-07-18T06:30:00.000Z'));
    expect(result).toMatchObject({ decision: 'due', slotKey: '2026-07-18', idempotencyKey: 'schedule:sched-1:2026-07-18' });
    expect(scheduleDefinitionChecksum(base)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails closed outside the window, when disabled, and on a consumed slot', () => {
    expect(evaluateAutomationSchedule(base, new Date('2026-07-18T02:00:00.000Z')).decision).toBe('outside-window');
    expect(evaluateAutomationSchedule({ ...base, enabled: false }, new Date('2026-07-18T06:30:00.000Z')).decision).toBe('disabled');
    expect(evaluateAutomationSchedule(base, new Date('2026-07-18T06:30:00.000Z'), new Set(['2026-07-18'])).decision).toBe('deduplicated');
  });

  it('respects hourly and weekly cadence boundaries', () => {
    const hourly = { ...base, frequency: 'hourly' as const, windowStart: '09:00', windowEnd: '18:00' };
    expect(evaluateAutomationSchedule(hourly, new Date('2026-07-18T06:15:00.000Z')).decision).toBe('not-due');
    expect(evaluateAutomationSchedule(hourly, new Date('2026-07-18T06:30:00.000Z')).decision).toBe('due');
    const weekly = { ...base, frequency: 'weekly' as const };
    expect(evaluateAutomationSchedule(weekly, new Date('2026-07-20T06:30:00.000Z')).decision).toBe('due');
    expect(evaluateAutomationSchedule(weekly, new Date('2026-07-19T06:30:00.000Z')).decision).toBe('not-due');
  });
});
