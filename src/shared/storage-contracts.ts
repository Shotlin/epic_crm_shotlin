import type { AttachmentMetadata } from './kernel-contracts';

export interface AttachmentTarget {
  resource: string;
  resourceId: string;
}

export interface ExportAttachmentInput {
  id: string;
}

export interface DatabaseBackupReceipt {
  fileName: string;
  createdAt: string;
  sha256: string;
  size: number;
  verifiedAt: string;
  /** 0 = unencrypted legacy file, 1 = legacy direct-key envelope, 2 = active namespace key. */
  keyVersion: number;
}

export type BackupInventoryStatus = 'active-v2' | 'legacy-v1' | 'plaintext' | 'invalid';

export interface BackupInventoryEntry {
  fileName: string;
  status: BackupInventoryStatus;
  keyVersion: number;
  sha256?: string;
  size?: number;
  message?: string;
}

export interface BackupRewrapReceipt {
  scanned: number;
  migrated: number;
  remainingLegacy: number;
  invalid: number;
  verified: boolean;
  entries: BackupInventoryEntry[];
  completedAt: string;
}

export interface RestoreReceipt {
  fileName: string;
  safetyBackupFileName: string;
  verifiedAt: string;
  restartScheduled: boolean;
}

/** Result of an isolated backup -> copy -> integrity/schema verification drill. */
export interface RestoreDrillReceipt {
  id: string;
  startedAt: string;
  status: 'passed' | 'failed';
  isolated: true;
  sourceBackup?: DatabaseBackupReceipt;
  restoredCopy?: DatabaseBackupReceipt;
  verifiedAt: string;
  message: string;
}

export interface RestoreDrillRecord extends RestoreDrillReceipt {
  actorId: string;
}

export interface StorageBridge {
  listAttachments: (target: AttachmentTarget) => Promise<AttachmentMetadata[]>;
  addAttachment: (target: AttachmentTarget) => Promise<AttachmentMetadata | null>;
  exportAttachment: (input: ExportAttachmentInput) => Promise<boolean>;
  createDatabaseBackup: () => Promise<DatabaseBackupReceipt | null>;
  restoreDatabaseBackup: () => Promise<RestoreReceipt | null>;
  listRestoreDrills: () => Promise<RestoreDrillRecord[]>;
  runRestoreDrill: () => Promise<RestoreDrillReceipt>;
  rewrapLocalBackups?: () => Promise<BackupRewrapReceipt>;
}
