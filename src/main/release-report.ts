import { createHash } from 'node:crypto';
import type { BuildProvenance, ReleaseReadiness, ReleaseReadinessReport } from '../shared/release-control-contracts';

/**
 * Creates a stable, reviewable release packet. The caller supplies the clock so
 * tests and external evidence can reproduce the exact checksum.
 */
export function createReleaseReadinessReport(readiness: ReleaseReadiness, generatedAt: string, buildProvenance: BuildProvenance): ReleaseReadinessReport {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('Release report timestamp is invalid.');
  const payload = {
    generatedAt,
    status: readiness.status,
    passed: readiness.passed,
    failed: readiness.failed,
    deferred: readiness.deferred,
    missingGateIds: [...readiness.missingGateIds].sort(),
    invalidGateIds: [...readiness.invalidGateIds].sort(),
    gates: [...readiness.gates].sort((left, right) => left.id.localeCompare(right.id)).map((gate) => ({ ...gate })),
    buildProvenanceSha256: buildProvenance.sha256,
  };
  const canonicalJson = JSON.stringify(payload);
  return {
    ...payload,
    canonicalJson,
    sha256: createHash('sha256').update(canonicalJson, 'utf8').digest('hex'),
  };
}
