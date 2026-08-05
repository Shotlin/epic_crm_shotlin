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
}
