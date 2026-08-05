import type { DatabaseBackupReceipt } from './storage-contracts';

/**
 * A deliberately explicit acknowledgement for converting the known generic
 * Epic BOS demo into an empty Bakaloo retail starter. It is not a general
 * data-deletion API.
 */
export const BAKALOO_RETAIL_DEMO_RESET_CONFIRMATION = 'RESET BAKALOO';

export interface BakalooRetailDemoResetRecordGroup {
  id: string;
  label: string;
  count: number;
  detail: string;
}

export interface BakalooRetailDemoResetPreview {
  eligible: boolean;
  confirmationPhrase: typeof BAKALOO_RETAIL_DEMO_RESET_CONFIRMATION;
  recordGroups: BakalooRetailDemoResetRecordGroup[];
  blockedReason?: string;
}

export interface ApplyBakalooRetailDemoResetInput {
  confirmation: string;
}

export interface ApplyBakalooRetailDemoResetResult {
  applied: boolean;
  backup: DatabaseBackupReceipt | null;
  message: string;
}

export interface BakalooRetailWorkspaceBridge {
  getDemoResetPreview: () => Promise<BakalooRetailDemoResetPreview>;
  applyDemoReset: (
    input: ApplyBakalooRetailDemoResetInput,
  ) => Promise<ApplyBakalooRetailDemoResetResult>;
}
