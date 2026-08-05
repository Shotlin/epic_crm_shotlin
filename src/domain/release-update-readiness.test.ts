import { describe, expect, it } from 'vitest';
import { computeCrossPlatformArtifactReadiness } from './cross-platform-artifact-readiness';
import { computeReleaseUpdateReadiness } from './release-update-readiness';

const sha = 'c'.repeat(64);
const artifact = computeCrossPlatformArtifactReadiness({
  buildProvenance: { platform: 'win32', version: '0.1.0', releaseIdentitySha256: 'f'.repeat(64) },
  packageGate: { status: 'passed', evidenceReference: 'PACKAGE-WIN' },
  artifactEvidence: { win32: { sha256: sha, releaseIdentitySha256: 'f'.repeat(64), smokeTested: true, signed: true } },
});

const evidence = {
  id: 'update-1',
  channel: 'stable' as const,
  platform: 'win32' as const,
  currentVersion: '0.1.0',
  targetVersion: '0.2.0',
  rollbackVersion: '0.1.0',
  manifestReference: 'MANIFEST-WIN-002',
  manifestSha256: sha,
  signatureReference: 'SIGN-WIN-002',
  rollbackTestReference: 'ROLLBACK-WIN-002',
  status: 'verified' as const,
  sourceReleaseIdentitySha256: 'f'.repeat(64),
  submittedBy: 'builder',
  submittedAt: '2026-08-02T08:00:00.000Z',
};

describe('release update readiness', () => {
  it('keeps update channels blocked until manifest evidence exists', () => {
    const report = computeReleaseUpdateReadiness({ buildProvenance: { platform: 'win32', version: '0.1.0', releaseIdentitySha256: 'f'.repeat(64) }, artifactReadiness: artifact });
    expect(report.status).toBe('blocked');
    expect(report.rows.find(({ channel, platform }) => channel === 'stable' && platform === 'win32')).toMatchObject({ evidenceStatus: 'missing', status: 'blocked' });
  });

  it('requires independent verification before a channel can be enabled', () => {
    const submitted = computeReleaseUpdateReadiness({ buildProvenance: { platform: 'win32', version: '0.1.0', releaseIdentitySha256: 'f'.repeat(64) }, artifactReadiness: artifact, evidence: [{ ...evidence, status: 'submitted' }] });
    expect(submitted.rows.find(({ channel, platform }) => channel === 'stable' && platform === 'win32')).toMatchObject({ evidenceStatus: 'submitted', status: 'external-certification' });
    const verified = computeReleaseUpdateReadiness({ buildProvenance: { platform: 'win32', version: '0.1.0', releaseIdentitySha256: 'f'.repeat(64) }, artifactReadiness: artifact, evidence: [evidence] });
    expect(verified.rows.find(({ channel, platform }) => channel === 'stable' && platform === 'win32')).toMatchObject({ evidenceStatus: 'verified', status: 'ready' });
  });

  it('rejects malformed version progression or manifest integrity', () => {
    const report = computeReleaseUpdateReadiness({ buildProvenance: { platform: 'win32', version: '0.1.0', releaseIdentitySha256: 'f'.repeat(64) }, artifactReadiness: artifact, evidence: [{ ...evidence, targetVersion: '0.1.0', manifestSha256: 'bad' }] });
    expect(report.rows.find(({ channel, platform }) => channel === 'stable' && platform === 'win32')).toMatchObject({ evidenceStatus: 'invalid', status: 'blocked' });
  });

  it('does not let a verified update pack survive a release-identity change', () => {
    const report = computeReleaseUpdateReadiness({ buildProvenance: { platform: 'win32', version: '0.1.0', releaseIdentitySha256: 'a'.repeat(64) }, artifactReadiness: artifact, evidence: [evidence] });
    expect(report.rows.find(({ channel, platform }) => channel === 'stable' && platform === 'win32')).toMatchObject({ evidenceStatus: 'invalid', status: 'blocked' });
    expect(report.rows.find(({ channel, platform }) => channel === 'stable' && platform === 'win32')?.nextAction).toContain('another build');
  });
});
