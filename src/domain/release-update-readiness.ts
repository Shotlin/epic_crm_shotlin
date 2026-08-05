import type { ReleaseArtifactReadinessReport, ReleaseArtifactPlatform } from './cross-platform-artifact-readiness';
import type { BuildProvenance } from '../shared/release-control-contracts';
import type { ReleaseUpdateChannel, ReleaseUpdateEvidence, ReleaseUpdatePlatform } from '../shared/release-update-contracts';

export type ReleaseUpdateReadinessStatus = 'ready' | 'blocked' | 'external-certification';

export interface ReleaseUpdateReadinessRow {
  channel: ReleaseUpdateChannel;
  platform: ReleaseUpdatePlatform;
  artifactStatus: 'ready' | 'blocked' | 'external-certification' | 'missing';
  evidenceStatus: 'missing' | 'invalid' | 'submitted' | 'verified' | 'rejected';
  status: ReleaseUpdateReadinessStatus;
  nextAction: string;
}

export interface ReleaseUpdateReadinessReport {
  status: ReleaseUpdateReadinessStatus;
  goNoGo: 'go' | 'hold';
  readyCount: number;
  blockedCount: number;
  externalCertificationCount: number;
  rows: ReleaseUpdateReadinessRow[];
  nextActions: string[];
}

export interface ReleaseUpdateReadinessInput {
  buildProvenance: Pick<BuildProvenance, 'version' | 'platform' | 'releaseIdentitySha256'> | null;
  artifactReadiness: ReleaseArtifactReadinessReport;
  evidence?: ReleaseUpdateEvidence[];
}

const channels: ReleaseUpdateChannel[] = ['stable', 'beta'];
const platforms: ReleaseUpdatePlatform[] = ['win32', 'darwin', 'linux'];

function versionParts(value: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(value.trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

function compareVersions(left: string, right: string): number | null {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return null;
  for (let index = 0; index < a.length; index += 1) {
    const leftPart = a[index] ?? 0;
    const rightPart = b[index] ?? 0;
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function latestEvidence(records: ReleaseUpdateEvidence[], channel: ReleaseUpdateChannel, platform: ReleaseUpdatePlatform): ReleaseUpdateEvidence | undefined {
  return records
    .filter((record) => record.channel === channel && record.platform === platform)
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0];
}

function artifactStatus(report: ReleaseArtifactReadinessReport, platform: ReleaseArtifactPlatform): ReleaseUpdateReadinessRow['artifactStatus'] {
  return report.rows.find((row) => row.platform === platform)?.status ?? 'missing';
}

export function computeReleaseUpdateReadiness({ buildProvenance, artifactReadiness, evidence = [] }: ReleaseUpdateReadinessInput): ReleaseUpdateReadinessReport {
  const rows = channels.flatMap((channel) => platforms.map((platform): ReleaseUpdateReadinessRow => {
    const artifact = artifactStatus(artifactReadiness, platform);
    const candidate = latestEvidence(evidence, channel, platform);
    let evidenceStatus: ReleaseUpdateReadinessRow['evidenceStatus'] = candidate?.status ?? 'missing';
    const currentVersion = buildProvenance?.version ?? '';
    const versionValid = Boolean(candidate && compareVersions(candidate.currentVersion, currentVersion) === 0 && compareVersions(candidate.targetVersion, candidate.currentVersion) === 1 && compareVersions(candidate.rollbackVersion, candidate.currentVersion) !== null && compareVersions(candidate.rollbackVersion, candidate.targetVersion)! < 0);
    const referencesValid = Boolean(candidate?.manifestReference.trim() && /^[a-f0-9]{64}$/i.test(candidate.manifestSha256) && candidate.signatureReference.trim() && candidate.rollbackTestReference.trim());
    const identityValid = Boolean(candidate?.sourceReleaseIdentitySha256 && /^[a-f0-9]{64}$/i.test(candidate.sourceReleaseIdentitySha256) && candidate.sourceReleaseIdentitySha256.toLowerCase() === buildProvenance?.releaseIdentitySha256.toLowerCase());
    if (candidate && (!versionValid || !referencesValid || !identityValid)) evidenceStatus = 'invalid';
    const status: ReleaseUpdateReadinessStatus = !candidate || evidenceStatus === 'invalid' || evidenceStatus === 'rejected' || artifact === 'blocked' || artifact === 'missing'
      ? 'blocked'
      : evidenceStatus !== 'verified' || artifact === 'external-certification'
        ? 'external-certification'
        : 'ready';
    const nextAction = !candidate
      ? `Submit a ${channel} update manifest, signature, and rollback-drill reference for ${platform}.`
      : evidenceStatus === 'invalid'
        ? 'Correct the manifest checksum, source-build identity, version progression, or rollback evidence from another build.'
        : evidenceStatus === 'rejected'
          ? 'Replace the rejected update evidence with a reviewed release candidate.'
          : evidenceStatus !== 'verified'
            ? 'Obtain independent release-operator verification for the submitted update evidence.'
            : artifact === 'blocked' || artifact === 'missing'
              ? 'Complete the platform artifact package and integrity evidence first.'
              : artifact === 'external-certification'
                ? 'Complete platform signing/notarisation evidence before enabling updates.'
                : 'Update channel is ready for controlled rollout.';
    return { channel, platform, artifactStatus: artifact, evidenceStatus, status, nextAction };
  }));
  const nextActions = rows.filter((row) => row.status !== 'ready').map((row) => row.nextAction).filter((action, index, values) => values.indexOf(action) === index);
  const status: ReleaseUpdateReadinessStatus = rows.some((row) => row.status === 'blocked') ? 'blocked' : rows.some((row) => row.status === 'external-certification') ? 'external-certification' : 'ready';
  return {
    status,
    goNoGo: status === 'ready' ? 'go' : 'hold',
    readyCount: rows.filter((row) => row.status === 'ready').length,
    blockedCount: rows.filter((row) => row.status === 'blocked').length,
    externalCertificationCount: rows.filter((row) => row.status === 'external-certification').length,
    rows,
    nextActions,
  };
}
