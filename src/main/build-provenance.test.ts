import { describe, expect, it } from 'vitest';
import { createBuildProvenance, isReleaseGradeBuildRevision } from './build-provenance';

describe('build provenance', () => {
  it('creates a stable release identity while keeping each generated support packet distinct', () => {
    const input = { productName: 'Epic BOS', version: '0.1.0', platform: process.platform, buildRevision: 'local-test', schemaRevision: 9 } as const;
    const first = createBuildProvenance(input, '2026-07-18T00:00:00.000Z');
    const second = createBuildProvenance(input, '2026-07-18T00:00:00.000Z');
    const later = createBuildProvenance(input, '2026-07-18T00:01:00.000Z');
    expect(first.sha256).toHaveLength(64);
    expect(first.sha256).toBe(second.sha256);
    expect(first.releaseIdentitySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.releaseIdentitySha256).toBe(later.releaseIdentitySha256);
    expect(first.sha256).not.toBe(later.sha256);
    expect(first.canonicalJson).toContain('"schemaRevision":9');
  });

  it('rejects incomplete artifact identity', () => {
    expect(() => createBuildProvenance({ productName: '', version: '0.1.0', platform: process.platform, buildRevision: 'x', schemaRevision: 9 }, '2026-07-18T00:00:00.000Z')).toThrow('identity is incomplete');
  });

  it('recognises immutable release revisions and rejects mutable local labels', () => {
    expect(isReleaseGradeBuildRevision('abcdef1234567890')).toBe(true);
    expect(isReleaseGradeBuildRevision('ci-2026.08.03.17')).toBe(true);
    expect(isReleaseGradeBuildRevision('local')).toBe(false);
    expect(isReleaseGradeBuildRevision('unversioned-local')).toBe(false);
  });
});
