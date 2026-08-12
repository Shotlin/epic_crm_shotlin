/**
 * Credential-free contract shared by Store Edge and the main-process Hub
 * transport. Authentication is deliberately supplied by the deployment
 * adapter, never by the renderer or by this payload.
 */
export type RetailHubStoreEdgeSyncOutcome = 'recorded' | 'idempotent' | 'conflicted';

export interface RetailHubStoreEdgeSyncScope {
  tenantId: string;
  companyId: string;
  branchId: string;
}

export interface RetailHubStoreEdgeSyncEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  transactionKey: string;
  sequence: number;
  producedAt: string;
  payloadChecksum: string;
  payload: Record<string, unknown>;
}

export interface RetailHubStoreEdgeSyncReceipt {
  id: string;
  eventId: string;
  eventType: string;
  aggregateId: string;
  transactionKey: string;
  sequence: number;
  payloadChecksum: string;
  outcome: RetailHubStoreEdgeSyncOutcome;
  actorId: string;
  receivedAt: string;
  scope: RetailHubStoreEdgeSyncScope;
  detail?: string;
}

export interface RetailHubStoreEdgeSyncResult {
  httpStatus: 200 | 202 | 409;
  outcome: RetailHubStoreEdgeSyncOutcome;
  receipt: RetailHubStoreEdgeSyncReceipt;
}

export interface SendRetailHubStoreEdgeSyncInput {
  baseUrl: string;
  event: RetailHubStoreEdgeSyncEvent;
}

/**
 * Bounded Store Edge replay request. The renderer supplies only the deployed
 * Hub URL and a small batch limit; sale payloads and event identities are
 * derived from the local immutable ledger in the main process.
 */
export interface SyncRetailHubStoreEdgeQueueInput {
  baseUrl: string;
  limit: number;
}

export type RetailHubStoreEdgeSyncIntervalMinutes = 5 | 15 | 30 | 60;

/** Explicitly opt-in policy for restart-safe, renderer-driven retry ticks. */
export interface RetailHubStoreEdgeSyncPolicy {
  enabled: boolean;
  baseUrl: string;
  intervalMinutes: RetailHubStoreEdgeSyncIntervalMinutes;
  batchLimit: number;
  updatedAt: string;
  updatedBy: string;
  scope: { companyId: string; branchId: string };
  version: number;
}

export interface SaveRetailHubStoreEdgeSyncPolicyInput {
  enabled: boolean;
  baseUrl: string;
  intervalMinutes: RetailHubStoreEdgeSyncIntervalMinutes;
  batchLimit: number;
}

/**
 * Local append-only evidence for each Store Edge → Hub attempt.  The record
 * intentionally stores metadata and checksums only; the sale payload remains
 * in the local sale aggregate and is never duplicated into the receipt log.
 */
export type RetailHubStoreEdgeSyncLocalStatus = 'sent' | 'idempotent' | 'conflicted' | 'failed';

export interface RetailHubStoreEdgeSyncLocalReceipt {
  id: string;
  eventId: string;
  eventType: string;
  aggregateId: string;
  transactionKey: string;
  sequence: number;
  payloadChecksum: string;
  status: RetailHubStoreEdgeSyncLocalStatus;
  httpStatus?: 200 | 202 | 409;
  hubReceiptId?: string;
  actorId: string;
  attemptedAt: string;
  hubReceivedAt?: string;
  reason?: string;
  scope?: { companyId: string; branchId: string };
  version: number;
}

/**
 * Durable branch-local cursor.  It is advisory for replay (the Hub remains
 * authoritative); keeping it locally prevents sequence reuse after restart
 * and gives operators an auditable last accepted event.
 */
export interface RetailHubStoreEdgeSyncCursor {
  nextSequence: number;
  lastAttemptedSequence?: number;
  lastAcceptedSequence?: number;
  lastAcceptedEventId?: string;
  updatedAt: string;
  scope?: { companyId: string; branchId: string };
}

/** Append-only local summary for one bounded replay invocation. */
export interface RetailHubStoreEdgeSyncRun {
  id: string;
  startedAt: string;
  completedAt: string;
  actorId: string;
  baseUrlOrigin: string;
  limit: number;
  attempted: number;
  sent: number;
  idempotent: number;
  conflicted: number;
  failed: number;
  status: 'completed' | 'completed-with-errors' | 'no-work';
  scope: { companyId: string; branchId: string };
  version: number;
}
