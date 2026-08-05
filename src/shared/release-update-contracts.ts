export type ReleaseUpdateChannel = 'stable' | 'beta';
export type ReleaseUpdatePlatform = 'win32' | 'darwin' | 'linux';
export type ReleaseUpdateEvidenceStatus = 'submitted' | 'verified' | 'rejected';

export interface ReleaseUpdateEvidence {
  id: string;
  channel: ReleaseUpdateChannel;
  platform: ReleaseUpdatePlatform;
  currentVersion: string;
  targetVersion: string;
  rollbackVersion: string;
  manifestReference: string;
  manifestSha256: string;
  signatureReference: string;
  rollbackTestReference: string;
  /** Injected by the main process; pins this update evidence to its source release line. */
  sourceReleaseIdentitySha256?: string;
  status: ReleaseUpdateEvidenceStatus;
  submittedBy: string;
  submittedAt: string;
  verifiedBy?: string;
  verifiedAt?: string;
  notes?: string;
}

export interface RecordReleaseUpdateEvidenceInput {
  channel: ReleaseUpdateChannel;
  platform: ReleaseUpdatePlatform;
  currentVersion: string;
  targetVersion: string;
  rollbackVersion: string;
  manifestReference: string;
  manifestSha256: string;
  signatureReference: string;
  rollbackTestReference: string;
  notes?: string;
}

export interface DecideReleaseUpdateEvidenceInput {
  id: string;
  decision: Extract<ReleaseUpdateEvidenceStatus, 'verified' | 'rejected'>;
  notes?: string;
}
