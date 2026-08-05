import { randomUUID } from 'node:crypto';
import type { DecideReleaseUpdateEvidenceInput, RecordReleaseUpdateEvidenceInput, ReleaseUpdateEvidence } from '../shared/release-update-contracts';
import type { BuildProvenance } from '../shared/release-control-contracts';
import type { BusinessDatabase } from './database';
import { isReleaseGradeBuildRevision } from './build-provenance';

export class ReleaseUpdateStore {
  public constructor(private readonly database: BusinessDatabase) {}

  public list(): ReleaseUpdateEvidence[] {
    return this.database.listReleaseUpdateEvidence();
  }

  public record(input: RecordReleaseUpdateEvidenceInput, submittedBy: string, activeBuild: Pick<BuildProvenance, 'platform' | 'version' | 'buildRevision' | 'releaseIdentitySha256'>, submittedAt = new Date().toISOString()): ReleaseUpdateEvidence {
    const manifestSha256 = input.manifestSha256.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(manifestSha256)) throw new Error('Update manifest SHA-256 must be exactly 64 hexadecimal characters.');
    const currentVersion = input.currentVersion.trim();
    const targetVersion = input.targetVersion.trim();
    const rollbackVersion = input.rollbackVersion.trim();
    if (!currentVersion || !targetVersion || !rollbackVersion) throw new Error('Update evidence requires current, target, and rollback versions.');
    if (input.platform !== activeBuild.platform) throw new Error('Update evidence must be recorded from its active release platform. Build the other platform in its native release environment.');
    if (currentVersion !== activeBuild.version) throw new Error('Update evidence must describe the active release version. Evidence from another build cannot be reused.');
    if (!isReleaseGradeBuildRevision(activeBuild.buildRevision)) throw new Error('Update evidence requires an immutable build revision. Build with a source revision before submitting update evidence.');
    if (!/^[a-f0-9]{64}$/i.test(activeBuild.releaseIdentitySha256)) throw new Error('The active release identity is invalid. Reopen the release control room before recording evidence.');
    if (!reference(input.manifestReference, 'Manifest reference') || !reference(input.signatureReference, 'Signature reference') || !reference(input.rollbackTestReference, 'Rollback-test reference')) throw new Error('Manifest, signature, and rollback-test references are required before submitting update evidence.');
    if (this.list().some((record) => record.channel === input.channel && record.platform === input.platform && record.targetVersion === targetVersion)) throw new Error(`Update evidence for ${input.channel} ${input.platform} ${targetVersion} already exists.`);
    const record: ReleaseUpdateEvidence = {
      id: randomUUID(),
      channel: input.channel,
      platform: input.platform,
      currentVersion,
      targetVersion,
      rollbackVersion,
      manifestReference: input.manifestReference.trim(),
      manifestSha256,
      signatureReference: input.signatureReference.trim(),
      rollbackTestReference: input.rollbackTestReference.trim(),
      sourceReleaseIdentitySha256: activeBuild.releaseIdentitySha256.toLowerCase(),
      status: 'submitted',
      submittedBy,
      submittedAt,
      notes: input.notes?.trim() || undefined,
    };
    this.database.insertReleaseUpdateEvidence(record);
    return record;
  }

  public decide(input: DecideReleaseUpdateEvidenceInput, verifiedBy: string, activeBuild: Pick<BuildProvenance, 'platform' | 'version' | 'buildRevision' | 'releaseIdentitySha256'>, verifiedAt = new Date().toISOString()): ReleaseUpdateEvidence {
    const existing = this.list().find((candidate) => candidate.id === input.id);
    if (!existing) throw new Error('Update evidence was already decided or could not be found.');
    if (existing?.submittedBy === verifiedBy) throw new Error('Update evidence maker cannot verify their own submission.');
    if (existing.sourceReleaseIdentitySha256?.toLowerCase() !== activeBuild.releaseIdentitySha256.toLowerCase() || existing.platform !== activeBuild.platform || existing.currentVersion !== activeBuild.version) throw new Error('Update evidence is stale for the active release identity; submit evidence again for this build.');
    if (!isReleaseGradeBuildRevision(activeBuild.buildRevision)) throw new Error('Update evidence verification requires an immutable active build revision.');
    const record = this.database.decideReleaseUpdateEvidence(input.id, input.decision, verifiedBy, verifiedAt, input.notes?.trim() || undefined);
    if (!record) throw new Error('Update evidence was already decided or could not be found.');
    return record;
  }
}

function reference(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || value.trim().length < 3) throw new Error(`${label} is required before submitting update evidence.`);
  return value.trim();
}
