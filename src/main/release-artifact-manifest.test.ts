import { describe, expect, it } from 'vitest';
import { createArtifactSha256, createReleaseArtifactManifest } from './release-artifact-manifest';

const input = {
  productName: 'Epic BOS',
  version: '0.1.0',
  platform: 'win32' as const,
  arch: 'x64',
  buildRevision: 'ci-2026.08.03.03',
  buildEnvironment: 'native' as const,
  schemaRevision: 24,
  releaseIdentitySha256: 'a'.repeat(64),
  artifactReference: 'out/make/squirrel.windows/x64/Epic-BOS-0.1.0 Setup.exe',
  artifactSha256: 'b'.repeat(64),
  generatedAt: '2026-08-03T12:00:00.000Z',
};

describe('release artifact manifests', () => {
  it('creates a deterministic manifest bound to the immutable release identity and artifact hash', () => {
    const first = createReleaseArtifactManifest(input);
    const second = createReleaseArtifactManifest(input);

    expect(first.schemaVersion).toBe(2);
    expect(first.releaseIdentitySha256).toBe(input.releaseIdentitySha256);
    expect(first.artifactSha256).toBe(input.artifactSha256);
    expect(first.buildEnvironment).toBe('native');
    expect(first.canonicalJson).toContain('"schemaRevision":24');
    expect(first.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toEqual(second);
  });

  it('changes the manifest hash when the artifact digest changes', () => {
    const first = createReleaseArtifactManifest(input);
    const changed = createReleaseArtifactManifest({ ...input, artifactSha256: 'c'.repeat(64) });
    expect(changed.manifestSha256).not.toBe(first.manifestSha256);
  });

  it('hashes artifact bytes with SHA-256', () => {
    expect(createArtifactSha256(new TextEncoder().encode('Epic BOS artifact'))).toBe(
      '2cbcde1813afe182de05f4ea2f9d9b07597c0a4fd8207e171d2c0436290d87b0',
    );
  });

  it('rejects local revisions and malformed release checksums', () => {
    expect(() => createReleaseArtifactManifest({ ...input, buildRevision: 'unversioned-local' })).toThrow('immutable build revision');
    expect(() => createReleaseArtifactManifest({ ...input, artifactSha256: 'not-a-sha' })).toThrow('artifact checksum');
    expect(() => createReleaseArtifactManifest({ ...input, releaseIdentitySha256: 'not-a-sha' })).toThrow('release identity checksum');
    expect(() => createReleaseArtifactManifest({ ...input, buildEnvironment: 'host' as never })).toThrow('build environment');
  });
});
