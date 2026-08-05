import type { UiAcceptanceEvidence, UiAcceptanceEvidenceStatus, UiAcceptanceResult } from '../domain/ui-acceptance-readiness';

export interface RecordUiAcceptanceEvidenceInput {
  scenarioId: string;
  result: UiAcceptanceResult;
  evidenceReference: string;
  notes?: string;
}

export interface DecideUiAcceptanceEvidenceInput {
  id: string;
  decision: Extract<UiAcceptanceEvidenceStatus, 'verified' | 'rejected'>;
  notes?: string;
}

export type { UiAcceptanceEvidence };
