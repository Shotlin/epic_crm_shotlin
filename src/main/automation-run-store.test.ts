import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInitialKernelState } from '../domain/kernel';
import { proposeAutomationRun } from '../domain/workflow-execution';
import { BusinessDatabase } from './database';
import { AutomationRunStore } from './automation-run-store';

let directory = '';
let database: BusinessDatabase;
const scope = { companyId: 'c1', branchId: 'b1' } as const;
beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-automation-')); database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3')); await database.initialize(); });
afterEach(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });

describe('automation run persistence', () => {
  it('persists idempotent runs and their evidence-backed lifecycle', () => {
    const state = createInitialKernelState(); const instance = state.workflowInstances[0]!; const workflow = state.workflowDefinitions.find(({ id }) => id === instance.workflowId)!; const transition = workflow.transitions.find(({ from }) => from === instance.state)!;
    const run = proposeAutomationRun({ idempotencyKey: 'persisted-run-1', workflowInstanceId: instance.id, transitionId: transition.id, scope, requestedBy: 'maker', now: '2026-07-18T00:00:00.000Z' }, state);
    const store = new AutomationRunStore(database); store.save(scope, run, '2026-07-18T00:00:00.000Z');
    expect(store.list(scope)).toHaveLength(1);
    const next = run.requiresIndependentApproval ? store.approve(scope, run.id, 'checker', '2026-07-18T01:00:00.000Z') : run;
    const started = store.start(scope, next.id, 'executor', '2026-07-18T02:00:00.000Z');
    const completed = store.complete(scope, started.id, { status: 'succeeded', completedAt: '2026-07-18T03:00:00.000Z', outcomeReference: 'RESULT-1', expectedVersion: started.version });
    expect(completed.status).toBe('succeeded'); expect(store.get(scope, run.id)?.outcomeReference).toBe('RESULT-1');
  });

  it('refuses cross-scope access', () => {
    const state = createInitialKernelState(); const instance = state.workflowInstances[0]!; const workflow = state.workflowDefinitions.find(({ id }) => id === instance.workflowId)!; const transition = workflow.transitions.find(({ from }) => from === instance.state)!;
    const run = proposeAutomationRun({ idempotencyKey: 'scoped-run', workflowInstanceId: instance.id, transitionId: transition.id, scope, requestedBy: 'maker' }, state); const store = new AutomationRunStore(database); store.save(scope, run);
    expect(store.get({ companyId: 'c2', branchId: 'b1' }, run.id)).toBeNull();
  });
});
