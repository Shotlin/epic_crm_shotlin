export type ReleaseArtifactPlatform = 'win32' | 'darwin' | 'linux';

export type ReleaseArtifactEvidenceStatus = 'submitted' | 'verified' | 'rejected';

export interface ReleaseArtifactEvidence {
  id: string;
  platform: ReleaseArtifactPlatform;
  version: string;
  artifactReference: string;
  artifactSha256: string;
  smokeTestReference: string;
  signingReference: string;
  notarisationReference?: string;
  /** Injected by the main process; legacy records without it are not current-release evidence. */
  releaseIdentitySha256?: string;
  status: ReleaseArtifactEvidenceStatus;
  submittedBy: string;
  submittedAt: string;
  verifiedBy?: string;
  verifiedAt?: string;
  notes?: string;
}

export interface RecordReleaseArtifactEvidenceInput {
  platform: ReleaseArtifactPlatform;
  version: string;
  artifactReference: string;
  artifactSha256: string;
  smokeTestReference: string;
  signingReference: string;
  notarisationReference?: string;
  notes?: string;
}

export interface DecideReleaseArtifactEvidenceInput {
  id: string;
  decision: Extract<ReleaseArtifactEvidenceStatus, 'verified' | 'rejected'>;
  notes?: string;
}
