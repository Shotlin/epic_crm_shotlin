import { createHash } from 'node:crypto';
import type { ReleaseGateEvidence, ReleaseReadiness } from '../shared/release-control-contracts';

const REQUIRED_GATE_IDS: ReleaseGateEvidence['id'][] = ['typecheck', 'lint', 'tests', 'package', 'backup-restore', 'provider-certification'];

/**
 * Creates a deterministic fingerprint for the human-supplied release evidence.
 * The fingerprint deliberately excludes evidenceChecksum so it can be recomputed
 * from the persisted record during support and audit review.
 */
export function createReleaseGateEvidenceChecksum(gate: Pick<ReleaseGateEvidence, 'id' | 'label' | 'status' | 'evidenceReference' | 'checkedAt' | 'notes'>): string {
  const canonicalJson = JSON.stringify({
    id: gate.id,
    label: gate.label,
    status: gate.status,
    evidenceReference: gate.evidenceReference,
    checkedAt: gate.checkedAt,
    notes: gate.notes ?? null,
  });
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

function isValidEvidence(gate: ReleaseGateEvidence): boolean {
  return Boolean(
    gate.label.trim()
    && gate.evidenceReference.trim()
    && Number.isFinite(Date.parse(gate.checkedAt))
    && (gate.status === 'passed' || gate.status === 'failed' || gate.status === 'deferred')
    && (gate.id !== 'backup-restore' || gate.status !== 'passed' || /^[a-f0-9]{64}$/i.test(gate.evidenceChecksum ?? ''))
    && (gate.id === 'backup-restore' || !gate.evidenceChecksum || gate.evidenceChecksum === createReleaseGateEvidenceChecksum(gate)),
  );
}

export function evaluateReleaseReadiness(gates: ReleaseGateEvidence[]): ReleaseReadiness {
  const latest = new Map<ReleaseGateEvidence['id'], ReleaseGateEvidence>();
  for (const gate of gates) {
    if (!REQUIRED_GATE_IDS.includes(gate.id)) continue;
    const previous = latest.get(gate.id);
    if (!previous || Date.parse(gate.checkedAt) >= Date.parse(previous.checkedAt) || !Number.isFinite(Date.parse(previous.checkedAt))) latest.set(gate.id, { ...gate });
  }
  const canonical = REQUIRED_GATE_IDS.flatMap((id) => latest.has(id) ? [latest.get(id)!] : []);
  const invalidGateIds = canonical.filter((gate) => !isValidEvidence(gate)).map(({ id }) => id);
  const valid = canonical.filter((gate) => !invalidGateIds.includes(gate.id));
  const passed = valid.filter(({ status }) => status === 'passed').length;
  const failed = valid.filter(({ status }) => status === 'failed').length;
  const missing = REQUIRED_GATE_IDS.filter((id) => !latest.has(id));
  const deferred = valid.filter(({ status }) => status === 'deferred').length + missing.length;
  return { status: failed === 0 && deferred === 0 && invalidGateIds.length === 0 ? 'ready' : 'blocked', passed, failed, deferred, missingGateIds: missing, invalidGateIds, gates: canonical };
}
