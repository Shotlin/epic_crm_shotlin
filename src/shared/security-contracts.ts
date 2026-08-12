export interface ArtifactKeyRotationReport {
  targetVersion: number;
  migrated: {
    providerCredentials: number;
    statutoryCredentials: number;
    mfaFactors: number;
    attachments: number;
  };
  remainingLegacy: number;
  verified: boolean;
  completedAt: string;
}
