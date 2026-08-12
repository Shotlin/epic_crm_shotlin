import { createHmac } from 'node:crypto';

/**
 * Envelope keys are versioned independently from the OS-protected master key.
 * v1 is retained so a migration can read records written by older builds; v2
 * is the active derived key for new writes.  This is deliberately not a
 * replacement for native SQLCipher/page encryption or OS master-key rotation.
 */
export const LEGACY_ARTIFACT_KEY_VERSION = 1;
export const ACTIVE_ARTIFACT_KEY_VERSION = 2;
export const SUPPORTED_ARTIFACT_KEY_VERSIONS = [
  LEGACY_ARTIFACT_KEY_VERSION,
  ACTIVE_ARTIFACT_KEY_VERSION,
] as const;

export type ArtifactKeyVersion = (typeof SUPPORTED_ARTIFACT_KEY_VERSIONS)[number];

export function assertSupportedArtifactKeyVersion(version: number): asserts version is ArtifactKeyVersion {
  if (!SUPPORTED_ARTIFACT_KEY_VERSIONS.includes(version as ArtifactKeyVersion)) {
    throw new Error(`Unsupported key version ${version}.`);
  }
}

export function deriveArtifactKey(masterKey: Buffer, namespace: string, version: number): Buffer {
  if (masterKey.length !== 32) throw new Error('Artifact vault requires a 256-bit master key.');
  assertSupportedArtifactKeyVersion(version);
  const normalizedNamespace = namespace.trim();
  if (!normalizedNamespace || normalizedNamespace.includes('\0')) {
    throw new Error('Artifact key namespace is invalid.');
  }
  return createHmac('sha256', masterKey)
    .update(`${normalizedNamespace}/v${version}`, 'utf8')
    .digest();
}
