import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BusinessDatabase } from './database';
import { AutomationRunStore } from './automation-run-store';
import { AutomationScheduleStore } from './automation-schedule-store';
import { acknowledgeSchedulerEscalation, executeSchedulerRetry } from './automation-scheduler-recovery';
import { runAutomationSchedulerTick } from './automation-scheduler-service';

let directory = ''; let database: BusinessDatabase;
const scope = { companyId: 'c1', branchId: 'b1' } as const;
const snapshot = { workflowDefinitions: [{ id: 'wf-1', resource: 'operations', name: 'Workflow', version: 1, transitions: [{ id: 'transition-1', from: 'draft', to: 'approved', label: 'Approve', approvalPolicyId: 'policy-1' }] }], workflowInstances: [{ id: 'instance-1', workflowId: 'wf-1', resource: 'operations', resourceId: 'record-1', state: 'draft', version: 1, updatedAt: '2026-07-17T00:00:00.000Z' }], approvalPolicies: [{ id: 'policy-1', name: 'Independent review', approverRoleIds: ['reviewer'], allowSelfApproval: false, version: 1 }] } as never;
beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-scheduler-recovery-')); database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3')); await database.initialize(); });
afterEach(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });

describe('scheduler recovery', () => {
  it('executes an eligible retry with action evidence', () => {
    const schedules = new AutomationScheduleStore(database); const runs = new AutomationRunStore(database);
    schedules.save(scope, { id: 's1', name: 'Broken then fixed', workflowInstanceId: 'missing', transitionId: 'missing', scope, frequency: 'daily', timeZone: 'UTC', windowStart: '09:00', windowEnd: '18:00', enabled: true, version: 1 });
    runAutomationSchedulerTick(scope, schedules, runs, snapshot, 'requester', new Date('2026-07-18T10:00:00.000Z'));
    schedules.save(scope, { id: 's1', name: 'Fixed', workflowInstanceId: 'instance-1', transitionId: 'transition-1', scope, frequency: 'daily', timeZone: 'UTC', windowStart: '09:00', windowEnd: '18:00', enabled: true, version: 2 }, '2026-07-18T10:05:00.000Z');
    const retry = executeSchedulerRetry(scope, 's1:2026-07-18', 'operator-2', 'Workflow repaired and independently reviewed.', schedules, runs, snapshot, new Date('2026-07-18T10:20:00.000Z'));
    expect(retry.status).toBe('proposed'); expect(schedules.listFailures(scope)[0]?.status).toBe('resolved'); expect(schedules.listActions(scope)[0]?.action).toBe('retry');
  });

  it('requires an escalated operation before acknowledgement', () => {
    const schedules = new AutomationScheduleStore(database); const runs = new AutomationRunStore(database);
    schedules.save(scope, { id: 's2', name: 'Broken', workflowInstanceId: 'missing', transitionId: 'missing', scope, frequency: 'daily', timeZone: 'UTC', windowStart: '09:00', windowEnd: '18:00', enabled: true, version: 1 });
    runAutomationSchedulerTick(scope, schedules, runs, snapshot, 'requester', new Date('2026-07-18T10:00:00.000Z'));
    expect(() => acknowledgeSchedulerEscalation(scope, 's2:2026-07-18', 'operator-2', 'Escalation reviewed.', schedules, new Date('2026-07-18T10:20:00.000Z'))).toThrow('not currently escalated');
  });
});
