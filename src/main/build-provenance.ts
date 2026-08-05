import { createHash } from 'node:crypto';
import type { BuildProvenance } from '../shared/release-control-contracts';

export interface BuildProvenanceInput {
  productName: string;
  version: string;
  platform: NodeJS.Platform;
  buildRevision: string;
  schemaRevision: number;
}

/**
 * Release evidence may only be bound to a revision that can be traced to a
 * source/build invocation. Local labels are useful for development diagnostics,
 * but they are not stable approval subjects for a packaged release.
 */
export function isReleaseGradeBuildRevision(buildRevision: string): boolean {
  const normalized = buildRevision.trim();
  return /^(?:[a-f0-9]{7,64}|ci-[a-z0-9][a-z0-9._-]{1,127})$/i.test(normalized);
}

/** Creates the artifact identity used by release evidence and support tickets. */
export function createBuildProvenance(input: BuildProvenanceInput, generatedAt: string): BuildProvenance {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('Build provenance timestamp is invalid.');
  if (!input.productName.trim() || !input.version.trim() || !input.buildRevision.trim() || !Number.isInteger(input.schemaRevision) || input.schemaRevision < 1) {
    throw new Error('Build provenance identity is incomplete.');
  }
  const releaseIdentityJson = JSON.stringify({
    productName: input.productName,
    version: input.version,
    buildRevision: input.buildRevision,
    schemaRevision: input.schemaRevision,
  });
  const releaseIdentitySha256 = createHash('sha256').update(releaseIdentityJson, 'utf8').digest('hex');
  const canonicalJson = JSON.stringify({ ...input, releaseIdentitySha256, generatedAt });
  return { ...input, releaseIdentitySha256, generatedAt, canonicalJson, sha256: createHash('sha256').update(canonicalJson, 'utf8').digest('hex') };
}
