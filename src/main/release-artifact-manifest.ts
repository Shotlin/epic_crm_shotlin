import { createHash } from 'node:crypto';
import type { ReleaseArtifactBuildEnvironment, ReleaseArtifactManifest, ReleaseArtifactPlatform } from '../shared/release-artifact-manifest-contracts';
import { isReleaseGradeBuildRevision } from './build-provenance';

export interface CreateReleaseArtifactManifestInput {
  productName: string;
  version: string;
  platform: ReleaseArtifactPlatform;
  arch: string;
  buildRevision: string;
  buildEnvironment: ReleaseArtifactBuildEnvironment;
  schemaRevision: number;
  releaseIdentitySha256: string;
  artifactReference: string;
  artifactSha256: string;
  generatedAt: string;
}

const checksumPattern = /^[a-f0-9]{64}$/i;

function assertChecksum(value: string, label: string): void {
  if (!checksumPattern.test(value)) throw new Error(`Release artifact manifest ${label} checksum is invalid.`);
}

/** Creates the canonical, sidecar-safe identity for one packaged artifact. */
export function createReleaseArtifactManifest(input: CreateReleaseArtifactManifestInput): ReleaseArtifactManifest {
  if (!input.productName.trim() || !input.version.trim() || !input.arch.trim() || !input.artifactReference.trim()) {
    throw new Error('Release artifact manifest identity is incomplete.');
  }
  if (!['win32', 'darwin', 'linux'].includes(input.platform)) {
    throw new Error('Release artifact manifest platform is invalid.');
  }
  if (!Number.isInteger(input.schemaRevision) || input.schemaRevision < 1) {
    throw new Error('Release artifact manifest schema revision is invalid.');
  }
  if (!isReleaseGradeBuildRevision(input.buildRevision)) {
    throw new Error('Release artifact manifest requires an immutable build revision.');
  }
  if (!['native', 'cross', 'unknown'].includes(input.buildEnvironment)) {
    throw new Error('Release artifact manifest build environment is invalid.');
  }
  assertChecksum(input.releaseIdentitySha256, 'release identity');
  assertChecksum(input.artifactSha256, 'artifact');
  if (!Number.isFinite(Date.parse(input.generatedAt))) {
    throw new Error('Release artifact manifest timestamp is invalid.');
  }

  const canonicalPayload = {
    schemaVersion: 2 as const,
    productName: input.productName,
    version: input.version,
    platform: input.platform,
    arch: input.arch,
    buildRevision: input.buildRevision,
    buildEnvironment: input.buildEnvironment,
    schemaRevision: input.schemaRevision,
    releaseIdentitySha256: input.releaseIdentitySha256,
    artifactReference: input.artifactReference,
    artifactSha256: input.artifactSha256,
    generatedAt: input.generatedAt,
  };
  const canonicalJson = JSON.stringify(canonicalPayload);
  return {
    ...canonicalPayload,
    canonicalJson,
    manifestSha256: createArtifactSha256(new TextEncoder().encode(canonicalJson)),
  };
}

export function createArtifactSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
