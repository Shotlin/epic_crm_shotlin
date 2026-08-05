import type { ReleaseGateEvidence, ReleaseGateId, ReleaseReadiness } from '../shared/release-control-contracts';
import type { BusinessDatabase } from './database';
import { createReleaseGateEvidenceChecksum, evaluateReleaseReadiness } from './release-readiness';

export class ReleaseGateStore {
  public constructor(private readonly database: BusinessDatabase) {}

  public list(): ReleaseGateEvidence[] {
    return this.database.listReleaseGateEvidence().map((gate) => ({ ...gate, id: gate.id as ReleaseGateId }));
  }

  public record(input: ReleaseGateEvidence): ReleaseGateEvidence {
    // Restore evidence is sourced from an isolated backup artifact and must
    // carry its externally computed checksum. Other gates receive a stable
    // fingerprint at write time so later reviews can detect record drift.
    const record = input.id === 'backup-restore' || input.evidenceChecksum
      ? input
      : { ...input, evidenceChecksum: createReleaseGateEvidenceChecksum(input) };
    this.database.upsertReleaseGateEvidence(record);
    return record;
  }

  public readiness(): ReleaseReadiness {
    return evaluateReleaseReadiness(this.list());
  }
}
