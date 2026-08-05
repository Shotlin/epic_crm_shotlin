import { describe, expect, it } from 'vitest';
import { computeCrossPlatformArtifactReadiness } from './cross-platform-artifact-readiness';

const sha = 'b'.repeat(64);
const releaseIdentity = 'c'.repeat(64);

describe('cross-platform artifact readiness', () => {
  it('does not infer other platform builds from the current runtime package', () => {
    const report = computeCrossPlatformArtifactReadiness({
      buildProvenance: { platform: 'win32', version: '0.1.0', releaseIdentitySha256: releaseIdentity },
      packageGate: { status: 'passed', evidenceReference: 'WIN-PACKAGE-001' },
      artifactEvidence: { win32: { sha256: sha, releaseIdentitySha256: releaseIdentity, smokeTested: true, signed: true } },
    });
    expect(report.rows.find(({ platform }) => platform === 'win32')).toMatchObject({ status: 'ready', packageStatus: 'verified', artifactChecksumStatus: 'verified', smokeTestStatus: 'verified', signingStatus: 'verified' });
    expect(report.rows.find(({ platform }) => platform === 'darwin')).toMatchObject({ status: 'blocked', currentRuntime: false, packageStatus: 'missing' });
    expect(report.rows.find(({ platform }) => platform === 'linux')).toMatchObject({ status: 'blocked', currentRuntime: false, packageStatus: 'missing' });
    expect(report.status).toBe('blocked');
  });

  it('keeps signing and notarisation as distinct external certification gates', () => {
    const report = computeCrossPlatformArtifactReadiness({
      buildProvenance: { platform: 'darwin', version: '0.1.0', releaseIdentitySha256: releaseIdentity },
      packageGate: { status: 'passed', evidenceReference: 'MAC-PACKAGE-001' },
      artifactEvidence: { darwin: { sha256: sha, releaseIdentitySha256: releaseIdentity, smokeTested: true, signed: true } },
    });
    expect(report.rows.find(({ platform }) => platform === 'darwin')).toMatchObject({ status: 'external-certification', signingStatus: 'verified', notarisationStatus: 'missing' });
    expect(report.rows.find(({ platform }) => platform === 'darwin')?.nextAction).toContain('notarisation');
  });

  it('holds a platform when package or artifact integrity evidence is absent', () => {
    const report = computeCrossPlatformArtifactReadiness({ buildProvenance: { platform: 'win32', version: '0.1.0', releaseIdentitySha256: releaseIdentity }, packageGate: { status: 'deferred', evidenceReference: 'PENDING' } });
    expect(report.rows.find(({ platform }) => platform === 'win32')).toMatchObject({ status: 'blocked', packageStatus: 'missing', artifactChecksumStatus: 'missing', smokeTestStatus: 'missing' });
    expect(report.nextActions).toEqual(expect.arrayContaining(['Record a passed package gate for this platform.']));
  });

  it('fails closed when a verified artifact belongs to another release identity', () => {
    const report = computeCrossPlatformArtifactReadiness({
      buildProvenance: { platform: 'win32', version: '0.2.0', releaseIdentitySha256: releaseIdentity },
      packageGate: { status: 'passed', evidenceReference: 'WIN-PACKAGE-002' },
      artifactEvidence: { win32: { sha256: sha, releaseIdentitySha256: 'd'.repeat(64), smokeTested: true, signed: true, verificationStatus: 'verified' } },
    });
    expect(report.rows.find(({ platform }) => platform === 'win32')).toMatchObject({ status: 'blocked', releaseIdentityStatus: 'mismatched' });
    expect(report.rows.find(({ platform }) => platform === 'win32')?.nextAction).toContain('another build');
  });
});
