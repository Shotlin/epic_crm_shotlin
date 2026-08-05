import type { BuildProvenance, ReleaseGateEvidence } from '../shared/release-control-contracts';

export type ReleaseArtifactPlatform = 'win32' | 'darwin' | 'linux';
export type ReleaseArtifactStatus = 'ready' | 'blocked' | 'external-certification';

export interface ReleaseArtifactReadinessRow {
  platform: ReleaseArtifactPlatform;
  label: string;
  currentRuntime: boolean;
  packageStatus: 'verified' | 'missing' | 'failed';
  artifactChecksumStatus: 'verified' | 'missing' | 'invalid';
  smokeTestStatus: 'verified' | 'missing';
  releaseIdentityStatus: 'verified' | 'missing' | 'mismatched';
  signingStatus: 'verified' | 'missing';
  notarisationStatus: 'verified' | 'missing' | 'not-applicable';
  evidenceVerificationStatus: 'missing' | 'submitted' | 'verified' | 'rejected';
  status: ReleaseArtifactStatus;
  nextAction: string;
}

export interface ReleaseArtifactReadinessReport {
  status: ReleaseArtifactStatus;
  goNoGo: 'go' | 'hold';
  readyPlatformCount: number;
  blockedPlatformCount: number;
  externalCertificationPlatformCount: number;
  actionRequired: boolean;
  nextActions: string[];
  rows: ReleaseArtifactReadinessRow[];
}

export interface CrossPlatformArtifactReadinessInput {
  buildProvenance: Pick<BuildProvenance, 'platform' | 'version' | 'releaseIdentitySha256'> | null;
  packageGate: Pick<ReleaseGateEvidence, 'status' | 'evidenceReference'> | null;
  artifactEvidence?: Partial<Record<ReleaseArtifactPlatform, {
    sha256?: string;
    releaseIdentitySha256?: string;
    smokeTested?: boolean;
    signed?: boolean;
    notarised?: boolean;
    verificationStatus?: 'submitted' | 'verified' | 'rejected';
  }>>;
}

const platforms: Array<{ platform: ReleaseArtifactPlatform; label: string }> = [
  { platform: 'win32', label: 'Windows' },
  { platform: 'darwin', label: 'macOS' },
  { platform: 'linux', label: 'Linux' },
];

/**
 * Creates a truthful release matrix from the evidence currently available to
 * the control room. A package gate is not treated as an executable checksum,
 * smoke test, code signature, or macOS notarisation proof.
 */
export function computeCrossPlatformArtifactReadiness({ buildProvenance, packageGate, artifactEvidence = {} }: CrossPlatformArtifactReadinessInput): ReleaseArtifactReadinessReport {
  const rows = platforms.map(({ platform, label }): ReleaseArtifactReadinessRow => {
    const currentRuntime = buildProvenance?.platform === platform;
    const evidence = artifactEvidence[platform];
    const packageStatus: ReleaseArtifactReadinessRow['packageStatus'] = !currentRuntime || !packageGate ? 'missing' : packageGate.status === 'passed' ? 'verified' : packageGate.status === 'failed' ? 'failed' : 'missing';
    const artifactChecksumStatus: ReleaseArtifactReadinessRow['artifactChecksumStatus'] = !evidence?.sha256 ? 'missing' : /^[a-f0-9]{64}$/i.test(evidence.sha256) ? 'verified' : 'invalid';
    const releaseIdentityStatus: ReleaseArtifactReadinessRow['releaseIdentityStatus'] = !evidence?.releaseIdentitySha256 || !/^[a-f0-9]{64}$/i.test(evidence.releaseIdentitySha256)
      ? 'missing'
      : evidence.releaseIdentitySha256.toLowerCase() === buildProvenance?.releaseIdentitySha256.toLowerCase()
        ? 'verified'
        : 'mismatched';
    const smokeTestStatus: ReleaseArtifactReadinessRow['smokeTestStatus'] = evidence?.smokeTested ? 'verified' : 'missing';
    const signingStatus: ReleaseArtifactReadinessRow['signingStatus'] = evidence?.signed ? 'verified' : 'missing';
    const notarisationStatus: ReleaseArtifactReadinessRow['notarisationStatus'] = platform === 'darwin' ? evidence?.notarised ? 'verified' : 'missing' : 'not-applicable';
    const evidenceVerificationStatus: ReleaseArtifactReadinessRow['evidenceVerificationStatus'] = !evidence ? 'missing' : evidence.verificationStatus ?? 'verified';
    const status: ReleaseArtifactStatus = packageStatus !== 'verified' || artifactChecksumStatus !== 'verified' || releaseIdentityStatus !== 'verified' || smokeTestStatus !== 'verified' || evidenceVerificationStatus === 'rejected'
      ? 'blocked'
      : evidenceVerificationStatus !== 'verified' || signingStatus !== 'verified' || (platform === 'darwin' && notarisationStatus !== 'verified')
        ? 'external-certification'
        : 'ready';
    const nextAction = !currentRuntime
      ? `Build and smoke-test the ${label} artifact in its native release environment.`
      : packageStatus !== 'verified'
        ? 'Record a passed package gate for this platform.'
        : artifactChecksumStatus !== 'verified'
          ? 'Record the executable/archive SHA-256 from the packaged artifact.'
          : releaseIdentityStatus !== 'verified'
            ? 'Record artifact evidence from the active release build; evidence from another build cannot be reused.'
          : smokeTestStatus !== 'verified'
            ? 'Record a clean install and launch smoke-test reference.'
          : evidenceVerificationStatus !== 'verified'
            ? 'Obtain independent reviewer verification for the submitted artifact evidence.'
            : signingStatus !== 'verified'
              ? `Record ${label} code-signing evidence from the release pipeline.`
              : platform === 'darwin' && notarisationStatus !== 'verified'
                ? 'Record Apple notarisation and staple verification evidence.'
                : 'Platform artifact is ready.';
    return { platform, label, currentRuntime, packageStatus, artifactChecksumStatus, releaseIdentityStatus, smokeTestStatus, signingStatus, notarisationStatus, evidenceVerificationStatus, status, nextAction };
  });
  const nextActions = rows.filter((row) => row.status !== 'ready').map((row) => row.nextAction).filter((action, index, values) => values.indexOf(action) === index);
  const status: ReleaseArtifactStatus = rows.some((row) => row.status === 'blocked') ? 'blocked' : rows.some((row) => row.status === 'external-certification') ? 'external-certification' : 'ready';
  return {
    status,
    goNoGo: status === 'ready' ? 'go' : 'hold',
    readyPlatformCount: rows.filter((row) => row.status === 'ready').length,
    blockedPlatformCount: rows.filter((row) => row.status === 'blocked').length,
    externalCertificationPlatformCount: rows.filter((row) => row.status === 'external-certification').length,
    actionRequired: status !== 'ready',
    nextActions,
    rows,
  };
}
