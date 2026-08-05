import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BusinessDatabase } from './database';
import { ReleaseUpdateStore } from './release-update-store';

let directory = '';
let database: BusinessDatabase;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-update-'));
  database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3'));
  await database.initialize();
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

const evidence = {
  channel: 'stable' as const,
  platform: 'win32' as const,
  currentVersion: '0.1.0',
  targetVersion: '0.2.0',
  rollbackVersion: '0.1.0',
  manifestReference: 'MANIFEST-WIN-002',
  manifestSha256: 'd'.repeat(64),
  signatureReference: 'SIGN-WIN-002',
  rollbackTestReference: 'ROLLBACK-WIN-002',
};

const activeBuild = { platform: 'win32' as const, version: '0.1.0', buildRevision: 'abcdef1234567890', releaseIdentitySha256: 'e'.repeat(64) };

describe('release update evidence persistence', () => {
  it('persists a submitted update pack and enforces maker-checker verification', () => {
    const store = new ReleaseUpdateStore(database);
    const submitted = store.record(evidence, 'builder', activeBuild);
    expect(submitted.status).toBe('submitted');
    expect(submitted.sourceReleaseIdentitySha256).toBe(activeBuild.releaseIdentitySha256);
    expect(() => store.decide({ id: submitted.id, decision: 'verified' }, 'builder', activeBuild)).toThrow('maker cannot verify');
    expect(store.decide({ id: submitted.id, decision: 'verified' }, 'release-reviewer', activeBuild)).toMatchObject({ status: 'verified', verifiedBy: 'release-reviewer' });
  });

  it('prevents silently replacing the same target version', () => {
    const store = new ReleaseUpdateStore(database);
    store.record(evidence, 'builder', activeBuild);
    expect(() => store.record(evidence, 'builder', activeBuild)).toThrow('already exists');
  });

  it('rejects malformed manifest checksums', () => {
    const store = new ReleaseUpdateStore(database);
    expect(() => store.record({ ...evidence, manifestSha256: 'bad' }, 'builder', activeBuild)).toThrow('64 hexadecimal');
    expect(store.list()).toHaveLength(0);
  });

  it('rejects evidence that does not describe the active platform and version', () => {
    const store = new ReleaseUpdateStore(database);
    expect(() => store.record({ ...evidence, platform: 'darwin' }, 'builder', activeBuild)).toThrow('active release platform');
    expect(() => store.record({ ...evidence, currentVersion: '0.0.9' }, 'builder', activeBuild)).toThrow('active release version');
  });

  it('refuses to bind update evidence to an unversioned local build', () => {
    const store = new ReleaseUpdateStore(database);
    expect(() => store.record(evidence, 'builder', { ...activeBuild, buildRevision: 'unversioned-local' })).toThrow('immutable build revision');
    expect(store.list()).toHaveLength(0);
  });

  it('rejects incomplete references and stale-build verification', () => {
    const store = new ReleaseUpdateStore(database);
    expect(() => store.record({ ...evidence, rollbackTestReference: ' ' }, 'builder', activeBuild)).toThrow('Rollback-test reference is required');
    const submitted = store.record(evidence, 'builder', activeBuild);
    expect(() => store.decide({ id: submitted.id, decision: 'verified' }, 'release-reviewer', { ...activeBuild, releaseIdentitySha256: 'f'.repeat(64) })).toThrow('stale');
    expect(store.list()[0]?.status).toBe('submitted');
  });
});
