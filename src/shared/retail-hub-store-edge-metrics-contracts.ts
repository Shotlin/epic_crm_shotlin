/** Renderer-safe request for the Hub's scope-bound Store Edge worker health. */
export interface FetchRetailHubStoreEdgeWorkerMetricsInput {
  /** Credential-free HTTPS base URL; auth is supplied by the deployment adapter. */
  baseUrl: string;
}

export interface RetailHubStoreEdgeWorkerMetrics {
  runs: number;
  claimed: number;
  completed: number;
  retryable: number;
  deadLetter: number;
  lastRunAt?: string;
}

export interface RetailHubStoreEdgeWorkerMetricsReport {
  metrics: RetailHubStoreEdgeWorkerMetrics;
  observedAt: string;
  writeBackAllowed: false;
}
