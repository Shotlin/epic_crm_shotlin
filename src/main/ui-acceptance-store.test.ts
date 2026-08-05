import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BusinessDatabase } from './database';
import { UiAcceptanceStore } from './ui-acceptance-store';
import { UI_ACCEPTANCE_CATALOG, createUiAcceptanceScenarioFingerprint } from '../domain/ui-acceptance-readiness';

let directory = '';
let database: BusinessDatabase;
let store: UiAcceptanceStore;
const build = { releaseIdentitySha256: 'a'.repeat(64) };

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-uat-'));
  database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3'));
  await database.initialize();
  store = new UiAcceptanceStore(database);
});
afterEach(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });

describe('UI acceptance evidence store', () => {
  it('binds a submitted journey to the active build and requires an independent reviewer', () => {
    const scenario = UI_ACCEPTANCE_CATALOG.find((candidate) => candidate.id === 'retail-pos-open-shift')!;
    const submitted = store.record({ scenarioId: scenario.id, result: 'passed', evidenceReference: 'UAT-POS-OPEN-001', notes: 'Shift opened on a configured counter.' }, 'cashier-1', build, '2026-08-02T10:00:00.000Z');

    expect(submitted).toMatchObject({ scenarioId: scenario.id, releaseIdentitySha256: build.releaseIdentitySha256, scenarioFingerprint: createUiAcceptanceScenarioFingerprint(scenario), status: 'submitted', submittedBy: 'cashier-1', version: 1 });
    expect(() => store.decide({ id: submitted.id, decision: 'verified' }, 'cashier-1', build, '2026-08-02T10:02:00.000Z')).toThrow(/cannot verify/i);

    const verified = store.decide({ id: submitted.id, decision: 'verified', notes: 'Receipt and shift record reviewed.' }, 'manager-1', build, '2026-08-02T10:03:00.000Z');
    expect(verified).toMatchObject({ status: 'verified', verifiedBy: 'manager-1', version: 2 });
    expect(store.list()).toHaveLength(1);
  });

  it('rejects unknown UAT journeys and malformed active build identities', () => {
    expect(() => store.record({ scenarioId: 'invented-journey', result: 'passed', evidenceReference: 'UAT-INVALID-001' }, 'admin-1', build)).toThrow(/unknown/i);
    expect(() => store.record({ scenarioId: 'retail-pos-open-shift', result: 'passed', evidenceReference: 'UAT-INVALID-002' }, 'admin-1', { releaseIdentitySha256: 'not-a-sha' })).toThrow(/release identity/i);
  });

  it('does not verify an acceptance record against a different release identity', () => {
    const submitted = store.record({ scenarioId: 'retail-pos-open-shift', result: 'passed', evidenceReference: 'UAT-POS-OPEN-002' }, 'cashier-1', build);
    expect(() => store.decide({ id: submitted.id, decision: 'verified' }, 'manager-1', { releaseIdentitySha256: 'b'.repeat(64) })).toThrow(/stale/i);
    expect(store.list()[0]?.status).toBe('submitted');
  });
});
