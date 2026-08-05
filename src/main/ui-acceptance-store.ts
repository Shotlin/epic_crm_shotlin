import { randomUUID } from 'node:crypto';
import { UI_ACCEPTANCE_CATALOG, createUiAcceptanceScenarioFingerprint, type UiAcceptanceEvidence } from '../domain/ui-acceptance-readiness';
import type { BuildProvenance } from '../shared/release-control-contracts';
import type { DecideUiAcceptanceEvidenceInput, RecordUiAcceptanceEvidenceInput } from '../shared/ui-acceptance-contracts';
import type { BusinessDatabase } from './database';

const clean = (value: string, label: string, minimum: number, maximum: number): string => {
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
};

export class UiAcceptanceStore {
  public constructor(private readonly database: BusinessDatabase) {}

  public list(): UiAcceptanceEvidence[] {
    return this.database.listUiAcceptanceEvidence();
  }

  public record(input: RecordUiAcceptanceEvidenceInput, submittedBy: string, activeBuild: Pick<BuildProvenance, 'releaseIdentitySha256'>, submittedAt = new Date().toISOString()): UiAcceptanceEvidence {
    const scenario = UI_ACCEPTANCE_CATALOG.find((candidate) => candidate.id === input.scenarioId);
    if (!scenario) throw new Error('The requested UI acceptance journey is unknown. Refresh the release control room and choose a current journey.');
    if (!/^[a-f0-9]{64}$/i.test(activeBuild.releaseIdentitySha256)) throw new Error('The active release identity is invalid. Reopen the release control room before recording acceptance evidence.');
    const record: UiAcceptanceEvidence = {
      id: randomUUID(),
      scenarioId: scenario.id,
      scenarioFingerprint: createUiAcceptanceScenarioFingerprint(scenario),
      releaseIdentitySha256: activeBuild.releaseIdentitySha256.toLowerCase(),
      result: input.result,
      evidenceReference: clean(input.evidenceReference, 'Acceptance evidence reference', 4, 240),
      notes: input.notes ? clean(input.notes, 'Acceptance notes', 4, 1_000) : undefined,
      submittedBy: clean(submittedBy, 'Acceptance tester', 1, 160),
      submittedAt,
      status: 'submitted',
      version: 1,
    };
    this.database.insertUiAcceptanceEvidence(record);
    return record;
  }

  public decide(input: DecideUiAcceptanceEvidenceInput, verifiedBy: string, activeBuild: Pick<BuildProvenance, 'releaseIdentitySha256'>, verifiedAt = new Date().toISOString()): UiAcceptanceEvidence {
    const existing = this.list().find((candidate) => candidate.id === input.id);
    if (!existing) throw new Error('UI acceptance evidence could not be found.');
    if (existing.submittedBy === verifiedBy) throw new Error('The tester who submitted UI acceptance evidence cannot verify it.');
    if (!/^[a-f0-9]{64}$/i.test(activeBuild.releaseIdentitySha256) || existing.releaseIdentitySha256.toLowerCase() !== activeBuild.releaseIdentitySha256.toLowerCase()) throw new Error('UI acceptance evidence is stale for the active release identity; repeat the journey on this build.');
    const record = this.database.decideUiAcceptanceEvidence(input.id, input.decision, clean(verifiedBy, 'Acceptance reviewer', 1, 160), verifiedAt, input.notes?.trim() || undefined);
    if (!record) throw new Error('UI acceptance evidence was already decided or could not be verified.');
    return record;
  }
}
