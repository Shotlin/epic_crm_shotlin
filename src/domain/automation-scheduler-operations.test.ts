import { describe, expect, it } from 'vitest';
import { buildSchedulerOperations } from './automation-scheduler-operations';
import type { AutomationSchedule, AutomationSchedulerFailure } from './automation-schedules';

const scope = { companyId: 'c1', branchId: 'b1' } as const;
const schedule: AutomationSchedule = { id: 's1', name: 'Daily', workflowInstanceId: 'i1', transitionId: 't1', scope, frequency: 'daily', timeZone: 'UTC', windowStart: '09:00', windowEnd: '18:00', enabled: true, version: 1 };
const failure: AutomationSchedulerFailure = { id: 's1:2026-07-18', scheduleId: 's1', slotKey: '2026-07-18', reason: 'Transition unavailable', attempts: 1, status: 'open', createdAt: '2026-07-18T08:00:00.000Z', updatedAt: '2026-07-18T08:00:00.000Z' };

describe('automation scheduler operations', () => {
  it('opens a retry action after the retry delay', () => { const report = buildSchedulerOperations([schedule], [failure], '2026-07-18T08:20:00.000Z'); expect(report.retryable).toBe(1); expect(report.actions[0]?.action).toBe('retry'); expect(report.checksum).toHaveLength(64); });
  it('escalates exhausted failures and disabled schedules', () => { expect(buildSchedulerOperations([schedule], [{ ...failure, attempts: 3 }], '2026-07-18T08:20:00.000Z').actions[0]?.action).toBe('escalate'); expect(buildSchedulerOperations([{ ...schedule, enabled: false }], [failure], '2026-07-18T08:20:00.000Z').actions[0]?.action).toBe('resolve'); });
  it('builds an owned queue, audit timeline, and reliability evidence', () => { const report = buildSchedulerOperations([schedule], [failure], '2026-07-18T08:20:00.000Z', undefined, [{ ...({ scheduleId: 's1', slotKey: '2026-07-18', idempotencyKey: 'k', dueAt: '2026-07-18T08:00:00.000Z', decision: 'due', reason: 'due' }) }], [{ id: 'a1', failureId: failure.id, action: 'escalate', actorId: 'ops', reason: 'Reviewed', createdAt: '2026-07-18T08:19:00.000Z' }]); expect(report.auditTimeline[0]?.actorId).toBe('ops'); expect(report.workQueue[0]?.ownerRole).toBe('operations'); expect(report.reliability[0]?.reliabilityPercent).toBe(50); });
});
