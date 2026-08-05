import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { BusinessDatabase } from './database';
import { AutomationScheduleStore } from './automation-schedule-store';
import { AutomationRunStore } from './automation-run-store';
import { runAutomationSchedulerTick } from './automation-scheduler-service';

let directory = '';
let database: BusinessDatabase;
const scope = { companyId: 'c1', branchId: 'b1' } as const;
const snapshot = {
  workflowDefinitions: [{ id: 'wf-1', resource: 'operations', name: 'Workflow', version: 1, transitions: [{ id: 'transition-1', from: 'draft', to: 'approved', label: 'Approve', approvalPolicyId: 'policy-1' }] }],
  workflowInstances: [{ id: 'instance-1', workflowId: 'wf-1', resource: 'operations', resourceId: 'record-1', state: 'draft', version: 1, updatedAt: '2026-07-17T00:00:00.000Z' }],
  approvalPolicies: [{ id: 'policy-1', name: 'Independent review', approverRoleIds: ['reviewer'], allowSelfApproval: false, version: 1 }],
} as never;

beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-scheduler-service-')); database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3')); await database.initialize(); });
afterEach(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });

describe('automation scheduler service', () => {
  it('creates a proposal but never approves or starts it', () => {
    const scheduleStore = new AutomationScheduleStore(database);
    const runStore = new AutomationRunStore(database);
    scheduleStore.save(scope, { id: 'schedule-1', name: 'Daily review', workflowInstanceId: 'instance-1', transitionId: 'transition-1', scope, frequency: 'daily', timeZone: 'UTC', windowStart: '09:00', windowEnd: '18:00', enabled: true, version: 1 });
    const result = runAutomationSchedulerTick(scope, scheduleStore, runStore, snapshot, 'requester-1', new Date('2026-07-18T10:00:00.000Z'))[0]!;
    expect(result.decision).toBe('due');
    expect(result.automationRunId).toBeTruthy();
    expect(runStore.list(scope)[0]?.status).toBe('proposed');
  });

  it('is idempotent on the next tick for the same slot', () => {
    const scheduleStore = new AutomationScheduleStore(database);
    const runStore = new AutomationRunStore(database);
    scheduleStore.save(scope, { id: 'schedule-2', name: 'Daily review', workflowInstanceId: 'instance-1', transitionId: 'transition-1', scope, frequency: 'daily', timeZone: 'UTC', windowStart: '09:00', windowEnd: '18:00', enabled: true, version: 1 });
    const now = new Date('2026-07-18T10:00:00.000Z');
    runAutomationSchedulerTick(scope, scheduleStore, runStore, snapshot, 'requester-1', now);
    const second = runAutomationSchedulerTick(scope, scheduleStore, runStore, snapshot, 'requester-1', now)[0]!;
    expect(second.decision).toBe('deduplicated');
    expect(runStore.list(scope)).toHaveLength(1);
  });

  it('dead-letters a due schedule when proposal creation fails and permits explicit resolution', () => {
    const scheduleStore = new AutomationScheduleStore(database);
    const runStore = new AutomationRunStore(database);
    scheduleStore.save(scope, { id: 'schedule-failure', name: 'Broken review', workflowInstanceId: 'missing-instance', transitionId: 'missing-transition', scope, frequency: 'daily', timeZone: 'UTC', windowStart: '09:00', windowEnd: '18:00', enabled: true, version: 1 });
    const [result] = runAutomationSchedulerTick(scope, scheduleStore, runStore, snapshot, 'requester-1', new Date('2026-07-18T10:00:00.000Z'));
    expect(result?.decision).toBe('blocked');
    const failure = scheduleStore.listFailures(scope)[0]!;
    expect(failure.status).toBe('open');
    expect(scheduleStore.resolveFailure(scope, failure.id, 'Workflow repaired by operations')).toMatchObject({ status: 'resolved', resolutionReference: 'Workflow repaired by operations' });
  });
});
