import type { ReleaseArtifactPlatform } from './release-artifact-contracts';

export type { ReleaseArtifactPlatform } from './release-artifact-contracts';

export interface ReleaseArtifactManifest {
  schemaVersion: 1;
  productName: string;
  version: string;
  platform: ReleaseArtifactPlatform;
  arch: string;
  buildRevision: string;
  schemaRevision: number;
  releaseIdentitySha256: string;
  artifactReference: string;
  artifactSha256: string;
  generatedAt: string;
  canonicalJson: string;
  manifestSha256: string;
}
