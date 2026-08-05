import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BusinessDatabase } from './database';
import { ReleaseArtifactStore } from './release-artifact-store';

let directory = '';
let database: BusinessDatabase;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-artifacts-'));
  database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3'));
  await database.initialize();
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

const evidence = {
  platform: 'win32' as const,
  version: '0.1.0',
  artifactReference: 'local/Epic-BOS-win32.zip',
  artifactSha256: 'a'.repeat(64),
  smokeTestReference: 'SMOKE-WIN-001',
  signingReference: 'SIGN-WIN-PENDING',
};

const activeBuild = { platform: 'win32' as const, version: '0.1.0', buildRevision: 'abcdef1234567890', releaseIdentitySha256: 'e'.repeat(64) };

describe('release artifact evidence persistence', () => {
  it('keeps submitted evidence separate from verified release readiness', () => {
    const store = new ReleaseArtifactStore(database);
    const submitted = store.record(evidence, 'builder', activeBuild);
    expect(submitted.status).toBe('submitted');
    expect(submitted.releaseIdentitySha256).toBe(activeBuild.releaseIdentitySha256);
    expect(store.list()).toHaveLength(1);
    expect(() => store.decide({ id: submitted.id, decision: 'verified' }, 'builder', activeBuild)).toThrow('maker cannot verify');
    const verified = store.decide({ id: submitted.id, decision: 'verified', notes: 'Independent launch check passed.' }, 'release-reviewer', activeBuild);
    expect(verified).toMatchObject({ status: 'verified', verifiedBy: 'release-reviewer' });
  });

  it('requires macOS notarisation evidence and prevents duplicate platform versions', () => {
    const store = new ReleaseArtifactStore(database);
    expect(() => store.record({ ...evidence, platform: 'darwin' }, 'builder', activeBuild)).toThrow('active release platform');
    expect(() => store.record({ ...evidence, version: '0.2.0' }, 'builder', activeBuild)).toThrow('active release version');
  });

  it('rejects malformed checksums before persistence', () => {
    const store = new ReleaseArtifactStore(database);
    expect(() => store.record({ ...evidence, artifactSha256: 'bad' }, 'builder', activeBuild)).toThrow('64 hexadecimal');
    expect(store.list()).toHaveLength(0);
  });

  it('rejects incomplete references and stale-build verification', () => {
    const store = new ReleaseArtifactStore(database);
    expect(() => store.record({ ...evidence, smokeTestReference: ' ' }, 'builder', activeBuild)).toThrow('Smoke-test reference is required');
    const submitted = store.record(evidence, 'builder', activeBuild);
    expect(() => store.decide({ id: submitted.id, decision: 'verified' }, 'release-reviewer', { ...activeBuild, releaseIdentitySha256: 'f'.repeat(64) })).toThrow('stale');
    expect(store.list()[0]?.status).toBe('submitted');
  });

  it('refuses to bind release evidence to an unversioned local build', () => {
    const store = new ReleaseArtifactStore(database);
    expect(() => store.record(evidence, 'builder', { ...activeBuild, buildRevision: 'unversioned-local' })).toThrow('immutable build revision');
    expect(store.list()).toHaveLength(0);
  });
});
