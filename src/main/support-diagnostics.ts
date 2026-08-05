import { createHash } from 'node:crypto';
import type { OperationalHealthSnapshot } from '../shared/kernel-contracts';
import type { BuildProvenance, ReleaseReadiness, SupportDiagnostics } from '../shared/release-control-contracts';

export function createSupportDiagnostics(health: OperationalHealthSnapshot, readiness: ReleaseReadiness, provenance: BuildProvenance, generatedAt: string): SupportDiagnostics {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('Support diagnostics timestamp is invalid.');
  const payload = {
    generatedAt,
    health: { ...health },
    readiness: { ...readiness, invalidGateIds: [...readiness.invalidGateIds], gates: readiness.gates.map(({ id, label, status, evidenceReference, checkedAt }) => ({ id, label, status, evidenceReference, checkedAt })) },
    provenance: { productName: provenance.productName, version: provenance.version, platform: provenance.platform, buildRevision: provenance.buildRevision, schemaRevision: provenance.schemaRevision, releaseIdentitySha256: provenance.releaseIdentitySha256, generatedAt: provenance.generatedAt, sha256: provenance.sha256 },
    redactionVersion: 1 as const,
  };
  const canonicalJson = JSON.stringify(payload);
  return { ...payload, canonicalJson, sha256: createHash('sha256').update(canonicalJson, 'utf8').digest('hex') };
}
