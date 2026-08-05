import type { OperatingRecordScope } from './revenue-ops-contracts';
import type { CheckoutRetailSaleInput } from './retail-pos-contracts';

export type RetailOfflineSaleQueueStatus = 'queued' | 'syncing' | 'synced' | 'conflict' | 'discarded';

/**
 * Immutable recovery evidence for one offline-sale transition.  This record
 * deliberately contains metadata and checksums only; tender payloads and
 * other sale details never get copied into the journal.
 */
export type RetailOfflineSyncReceiptStatus = 'queued' | 'syncing' | 'synced' | 'conflict' | 'requeued' | 'discarded';

export interface RetailOfflineSyncReceipt {
  id: string;
  queueItemId: string;
  transactionKey: string;
  status: RetailOfflineSyncReceiptStatus;
  actorId: string;
  occurredAt: string;
  attempt: number;
  queueVersion: number;
  payloadChecksum: string;
  evidenceReference?: string;
  syncedSaleId?: string;
  reason?: string;
  scope?: OperatingRecordScope;
}

export interface RetailOfflineSaleQueueItem {
  id: string;
  transactionKey: string;
  input: CheckoutRetailSaleInput;
  payloadChecksum: string;
  status: RetailOfflineSaleQueueStatus;
  queuedBy: string;
  queuedAt: string;
  attempts: number;
  lastAttemptAt?: string;
  /** Set when a supervisor resumes a cashier queue after power/network recovery. */
  lastSyncActorId?: string;
  lastSyncMode?: 'cashier' | 'recovery';
  lastSyncEvidenceReference?: string;
  syncedSaleId?: string;
  conflictReason?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionReason?: string;
  /** Independent supervisor evidence retained for a conflict decision. */
  resolutionEvidenceReference?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface SyncRetailOfflineSaleInput {
  id: string;
  expectedVersion: number;
  /** Required when an independent supervisor recovers another cashier's queue. */
  recoveryEvidenceReference?: string;
}

/** Starts a bounded background sync for sales queued by the active cashier session. */
export interface SyncRetailOfflineQueueInput {
  /** Maximum number of queued sales to attempt in this pass. */
  limit: number;
  /** Required for an independent store-recovery pass; persisted with every attempt. */
  recoveryEvidenceReference?: string;
}

export interface ResolveRetailOfflineSaleInput {
  id: string;
  resolution: 'requeue' | 'discard';
  reason: string;
  /** Required for any conflict decision after a store outage or sync failure. */
  recoveryEvidenceReference: string;
  expectedVersion: number;
}

export interface RetailOfflineSyncPlan {
  generatedAt: string;
  ready: string[];
  conflicts: string[];
  synced: string[];
  discarded: string[];
}
