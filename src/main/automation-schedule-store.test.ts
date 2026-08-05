import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BusinessDatabase } from './database';
import { AutomationScheduleStore } from './automation-schedule-store';
import type { AutomationSchedule } from '../domain/automation-schedules';

let directory = '';
let database: BusinessDatabase;
const scope = { companyId: 'c1', branchId: 'b1' } as const;
const schedule: AutomationSchedule = { id: 'sched-persisted', name: 'Daily control', workflowInstanceId: 'instance-1', transitionId: 'transition-1', scope, frequency: 'daily', timeZone: 'Asia/Kolkata', windowStart: '09:00', windowEnd: '18:00', enabled: true, version: 1 };
beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-schedule-')); database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3')); await database.initialize(); });
afterEach(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });

describe('automation schedule persistence', () => {
  it('persists a schedule and deduplicates a due slot across evaluations', () => {
    const store = new AutomationScheduleStore(database); store.save(scope, schedule, '2026-07-18T00:00:00.000Z');
    const first = store.evaluate(scope, schedule.id, new Date('2026-07-18T06:30:00.000Z'));
    const second = store.evaluate(scope, schedule.id, new Date('2026-07-18T06:30:00.000Z'));
    expect(first.decision).toBe('due'); expect(second.decision).toBe('deduplicated');
    expect(store.listTriggerHistory(scope)).toHaveLength(1);
    expect(store.listTriggerHistory(scope)[0]?.scheduleId).toBe(schedule.id);
  });

  it('refuses schedules outside the active scope', () => {
    const store = new AutomationScheduleStore(database); expect(() => store.save(scope, { ...schedule, scope: { companyId: 'c2', branchId: 'b1' } })).toThrow('scope');
  });
});
