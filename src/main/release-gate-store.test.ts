import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BusinessDatabase } from './database';
import { ReleaseGateStore } from './release-gate-store';

let directory = '';
let database: BusinessDatabase;

beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-gates-')); database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3')); await database.initialize(); });
afterEach(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });

describe('release gate persistence', () => {
  it('persists and updates signed gate evidence', () => {
    const store = new ReleaseGateStore(database);
    store.record({ id: 'provider-certification', label: 'Provider certification', status: 'deferred', evidenceReference: 'CONTRACTS-PENDING', checkedAt: '2026-07-17T00:00:00.000Z' });
    expect(store.list()[0]?.status).toBe('deferred');
    store.record({ id: 'provider-certification', label: 'Provider certification', status: 'passed', evidenceReference: 'CERT-001', checkedAt: '2026-07-18T00:00:00.000Z' });
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.evidenceReference).toBe('CERT-001');
    expect(store.readiness().status).toBe('blocked');
  });

  it('fingerprints non-restore evidence and blocks a tampered fingerprint', () => {
    const store = new ReleaseGateStore(database);
    const recorded = store.record({ id: 'typecheck', label: 'TypeScript', status: 'passed', evidenceReference: 'CI-TS-001', checkedAt: '2026-07-18T00:00:00.000Z' });
    expect(recorded.evidenceChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(store.list()[0]?.evidenceChecksum).toBe(recorded.evidenceChecksum);

    database.upsertReleaseGateEvidence({ ...recorded, evidenceReference: 'CI-TS-TAMPERED' });
    expect(store.readiness().invalidGateIds).toContain('typecheck');
    expect(store.readiness().status).toBe('blocked');
  });

  it('does not synthesize a restore-drill artifact checksum', () => {
    const store = new ReleaseGateStore(database);
    const recorded = store.record({ id: 'backup-restore', label: 'Backup restore', status: 'passed', evidenceReference: 'DRILL-001', checkedAt: '2026-07-18T00:00:00.000Z' });
    expect(recorded.evidenceChecksum).toBeUndefined();
    expect(store.readiness().invalidGateIds).toContain('backup-restore');
  });
});
