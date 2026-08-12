/** Renderer-safe selector for a main-process request to the Hub's
 * server-owned, read-only shadow-import preflight. */
export interface FetchRetailHubShadowImportPreflightInput {
  baseUrl: string;
  batchId: string;
}

export type RetailHubShadowImportPreflightStatus = 'ready-for-review' | 'hold';
export type RetailHubShadowImportPreflightCheckStatus = 'pass' | 'hold';

export interface RetailHubShadowImportPreflightCheck {
  id: string;
  status: RetailHubShadowImportPreflightCheckStatus;
  summary: string;
}

export interface RetailHubShadowImportPreflight {
  status: RetailHubShadowImportPreflightStatus;
  writeBackAllowed: false;
  checks: readonly RetailHubShadowImportPreflightCheck[];
  blockers: readonly string[];
}

export type RetailHubShadowImportSourceStatus = 'unconfigured' | 'configured' | 'reachable' | 'unreachable';

export interface FetchRetailHubShadowImportSourceStatusInput {
  baseUrl: string;
}

export interface RetailHubShadowImportSourceStatusReport {
  sourceStatus: {
    status: RetailHubShadowImportSourceStatus;
    credentialRevision?: number;
    checkedAt?: string;
    message?: string;
  };
  writeBackAllowed: false;
}

export interface FetchRetailHubShadowImportPullReceiptsInput {
  baseUrl: string;
  batchId?: string;
}

/** Safe receipt projection for the renderer; tenant/company/branch scope is
 * intentionally retained inside the authenticated Hub only. */
export interface RetailHubShadowImportPullReceipt {
  id: string;
  source: 'bakaloo';
  batchId: string;
  observedAt: string;
  registeredAt: string;
  credentialRevision?: number;
  pagesFetched: number;
  recordsFetched: number;
  planChecksum: string;
  writeBackAllowed: false;
  version: 1;
}

export interface RetailHubShadowImportPullReceiptsReport {
  receipts: readonly RetailHubShadowImportPullReceipt[];
  writeBackAllowed: false;
}
