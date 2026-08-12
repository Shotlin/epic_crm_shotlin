import type { ShadowImportScope, ShadowImportSqlClient } from './shadow-import-postgres-repository';
import { StoreEdgeSyncWorkerValidationError } from './store-edge-sync-worker';
import { emptyStoreEdgeSyncWorkerMetrics, type StoreEdgeSyncWorkerMetrics, type StoreEdgeSyncWorkerMetricsStore } from './store-edge-sync-worker-runtime';

export type StoreEdgeSyncWorkerMetricsPostgresRepository = StoreEdgeSyncWorkerMetricsStore;

/**
 * Durable Store Edge worker metrics projection. Metrics are deliberately kept
 * separate from the work queue: a reporting outage must never mutate queue
 * ownership, and an app restart can reconstruct the projection from this row.
 * The injected SQL client must provide a transaction-local RLS scope.
 */
export function createPostgresStoreEdgeSyncWorkerMetricsRepository(client: ShadowImportSqlClient): StoreEdgeSyncWorkerMetricsPostgresRepository {
  return {
    async load(scope) {
      const normalizedScope = normalizeScope(scope);
      const result = await runScoped(client, normalizedScope, (scoped) => scoped.query<{ metrics_json: unknown }>(
        `SELECT metrics_json
           FROM retail_store_edge_sync_worker_metrics
          WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId],
      ));
      if (!result.rows[0]) return emptyStoreEdgeSyncWorkerMetrics();
      return parseStoredMetrics(result.rows[0].metrics_json);
    },

    async save(scope, metrics) {
      const normalizedScope = normalizeScope(scope);
      const normalizedMetrics = parseStoredMetrics(metrics);
      await runScoped(client, normalizedScope, (scoped) => scoped.query(
        `INSERT INTO retail_store_edge_sync_worker_metrics
          (tenant_id, company_id, branch_id, metrics_json)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (tenant_id, company_id, branch_id)
         DO UPDATE SET metrics_json = EXCLUDED.metrics_json, updated_at = now()`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, JSON.stringify(normalizedMetrics)],
      ));
    },
  };
}

async function runScoped<T>(client: ShadowImportSqlClient, scope: ShadowImportScope, operation: (scoped: ShadowImportSqlClient) => Promise<T>): Promise<T> {
  if (!client.withScope) throw new StoreEdgeSyncWorkerValidationError('Store Edge worker metrics persistence requires a transaction-scoped SQL client.');
  return client.withScope(scope, operation);
}

function parseStoredMetrics(value: unknown): StoreEdgeSyncWorkerMetrics {
  let candidate: unknown = value;
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate); } catch { throw new StoreEdgeSyncWorkerValidationError('Stored Store Edge worker metrics are not valid JSON.'); }
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new StoreEdgeSyncWorkerValidationError('Stored Store Edge worker metrics are malformed.');
  const record = candidate as Record<string, unknown>;
  const normalized = {} as StoreEdgeSyncWorkerMetrics;
  for (const field of ['runs', 'claimed', 'completed', 'retryable', 'deadLetter'] as const) {
    const numberValue = record[field];
    if (typeof numberValue !== 'number' || !Number.isSafeInteger(numberValue) || numberValue < 0) throw new StoreEdgeSyncWorkerValidationError(`Stored Store Edge worker metric ${field} is invalid.`);
    normalized[field] = numberValue;
  }
  if (record.lastRunAt !== undefined) {
    if (typeof record.lastRunAt !== 'string' || !record.lastRunAt.trim() || !Number.isFinite(Date.parse(record.lastRunAt))) throw new StoreEdgeSyncWorkerValidationError('Stored Store Edge worker last run time is invalid.');
    normalized.lastRunAt = record.lastRunAt.trim();
  }
  return normalized;
}

function normalizeScope(scope: ShadowImportScope): ShadowImportScope {
  if (!scope || typeof scope !== 'object') throw new StoreEdgeSyncWorkerValidationError('Store Edge worker metrics scope is required.');
  const candidate = scope as unknown as Record<string, unknown>;
  return {
    tenantId: nonBlank(candidate.tenantId, 'Tenant scope'),
    companyId: nonBlank(candidate.companyId, 'Company scope'),
    branchId: nonBlank(candidate.branchId, 'Branch scope'),
  };
}

function nonBlank(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new StoreEdgeSyncWorkerValidationError(`${label} must not be blank.`);
  return value.trim();
}
