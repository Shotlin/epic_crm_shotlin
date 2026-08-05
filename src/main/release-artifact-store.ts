import { randomUUID } from 'node:crypto';
import type {
  DecideReleaseArtifactEvidenceInput,
  RecordReleaseArtifactEvidenceInput,
  ReleaseArtifactEvidence,
} from '../shared/release-artifact-contracts';
import type { BuildProvenance } from '../shared/release-control-contracts';
import type { BusinessDatabase } from './database';
import { isReleaseGradeBuildRevision } from './build-provenance';

export class ReleaseArtifactStore {
  public constructor(private readonly database: BusinessDatabase) {}

  public list(): ReleaseArtifactEvidence[] {
    return this.database.listReleaseArtifactEvidence();
  }

  public record(input: RecordReleaseArtifactEvidenceInput, submittedBy: string, activeBuild: Pick<BuildProvenance, 'platform' | 'version' | 'buildRevision' | 'releaseIdentitySha256'>, submittedAt = new Date().toISOString()): ReleaseArtifactEvidence {
    const artifactSha256 = input.artifactSha256.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(artifactSha256)) throw new Error('Artifact SHA-256 must be exactly 64 hexadecimal characters.');
    if (input.platform !== activeBuild.platform) throw new Error('Artifact evidence must be recorded from its active release platform. Build the other platform in its native release environment.');
    if (input.version.trim() !== activeBuild.version) throw new Error('Artifact evidence must describe the active release version. Evidence from another build cannot be reused.');
    if (!isReleaseGradeBuildRevision(activeBuild.buildRevision)) throw new Error('Artifact evidence requires an immutable build revision. Build with a source revision before submitting release evidence.');
    if (!/^[a-f0-9]{64}$/i.test(activeBuild.releaseIdentitySha256)) throw new Error('The active release identity is invalid. Reopen the release control room before recording evidence.');
    if (!reference(input.artifactReference, 'Artifact reference') || !reference(input.smokeTestReference, 'Smoke-test reference') || !reference(input.signingReference, 'Signing reference')) throw new Error('Artifact, smoke-test, and signing references are required before submitting evidence.');
    if (input.platform === 'darwin' && !input.notarisationReference?.trim()) throw new Error('macOS evidence requires an Apple notarisation reference.');
    if (this.list().some((record) => record.platform === input.platform && record.version === input.version.trim())) {
      throw new Error(`Evidence for ${input.platform} ${input.version.trim()} already exists. Record a new version instead.`);
    }
    const record: ReleaseArtifactEvidence = {
      id: randomUUID(),
      platform: input.platform,
      version: input.version.trim(),
      artifactReference: input.artifactReference.trim(),
      artifactSha256,
      smokeTestReference: input.smokeTestReference.trim(),
      signingReference: input.signingReference.trim(),
      notarisationReference: input.notarisationReference?.trim() || undefined,
      releaseIdentitySha256: activeBuild.releaseIdentitySha256.toLowerCase(),
      status: 'submitted',
      submittedBy,
      submittedAt,
      notes: input.notes?.trim() || undefined,
    };
    this.database.insertReleaseArtifactEvidence(record);
    return record;
  }

  public decide(input: DecideReleaseArtifactEvidenceInput, verifiedBy: string, activeBuild: Pick<BuildProvenance, 'platform' | 'version' | 'buildRevision' | 'releaseIdentitySha256'>, verifiedAt = new Date().toISOString()): ReleaseArtifactEvidence {
    const existing = this.list().find((candidate) => candidate.id === input.id);
    if (!existing) throw new Error('Artifact evidence was already decided or could not be found.');
    if (existing?.submittedBy === verifiedBy) throw new Error('Artifact evidence maker cannot verify their own submission.');
    if (existing.releaseIdentitySha256?.toLowerCase() !== activeBuild.releaseIdentitySha256.toLowerCase() || existing.platform !== activeBuild.platform || existing.version !== activeBuild.version) throw new Error('Artifact evidence is stale for the active release identity; submit evidence again for this build.');
    if (!isReleaseGradeBuildRevision(activeBuild.buildRevision)) throw new Error('Artifact evidence verification requires an immutable active build revision.');
    const record = this.database.decideReleaseArtifactEvidence(input.id, input.decision, verifiedBy, verifiedAt, input.notes?.trim() || undefined);
    if (!record) throw new Error('Artifact evidence was already decided or could not be found.');
    return record;
  }
}

function reference(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || value.trim().length < 3) throw new Error(`${label} is required before submitting evidence.`);
  return value.trim();
}
