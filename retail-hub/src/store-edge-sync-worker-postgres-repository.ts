import type { ShadowImportScope, ShadowImportSqlClient } from './shadow-import-postgres-repository';
import { type StoreEdgeSyncWorkItem, StoreEdgeSyncWorkerValidationError, type StoreEdgeSyncWorkStore } from './store-edge-sync-worker';

export type StoreEdgeSyncWorkerPostgresRepository = StoreEdgeSyncWorkStore;

/** Durable lease/ retry adapter for Store Edge events. Pooling and transaction
 * ownership remain injected through ShadowImportSqlClient.withScope. */
export function createPostgresStoreEdgeSyncWorkerRepository(client: ShadowImportSqlClient): StoreEdgeSyncWorkerPostgresRepository {
  return {
    async enqueue(record, now = new Date().toISOString()) {
      const normalizedScope = normalizeScope(record.scope);
      const normalizedNow = validTimestamp(now, 'Store Edge work available time');
      const existing = await runScoped(client, normalizedScope, (scoped) => scoped.query<{ work_json: unknown }>(
        `SELECT work_json
           FROM retail_store_edge_sync_work
          WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3 AND event_id = $4`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, record.eventId],
      ));
      if (existing.rows[0]) return parseStoredWork(existing.rows[0].work_json);
      const work: StoreEdgeSyncWorkItem = { id: `${record.eventId}:work`, eventId: record.eventId, scope: structuredClone(normalizedScope), status: 'pending', attempts: 0, availableAt: normalizedNow };
      await runScoped(client, normalizedScope, (scoped) => scoped.query(
        `INSERT INTO retail_store_edge_sync_work
          (tenant_id, company_id, branch_id, work_id, event_id, status, attempts, available_at, lease_token, work_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9::jsonb)
         ON CONFLICT (tenant_id, company_id, branch_id, event_id) DO NOTHING`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, work.id, work.eventId, work.status, work.attempts, work.availableAt, JSON.stringify(work)],
      ));
      // A concurrent enqueue may have won the INSERT ... DO NOTHING race.
      // Read the authoritative row before returning so callers never receive
      // a synthetic pending item for work that is already leased/completed.
      const authoritative = await runScoped(client, normalizedScope, (scoped) => scoped.query<{ work_json: unknown }>(
        `SELECT work_json
           FROM retail_store_edge_sync_work
          WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3 AND event_id = $4`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, record.eventId],
      ));
      if (!authoritative.rows[0]) {
        throw new StoreEdgeSyncWorkerValidationError('Store Edge work insert race produced no authoritative row.');
      }
      return parseStoredWork(authoritative.rows[0].work_json);
    },

    async claim(scope, options) {
      const normalizedScope = normalizeScope(scope);
      const workerId = nonBlank(options.workerId, 'Store Edge worker ID');
      const now = validTimestamp(options.now ?? new Date().toISOString(), 'Store Edge claim time');
      const leaseMs = boundedInteger(options.leaseMs ?? 60_000, 'Store Edge lease duration', 1_000, 15 * 60_000);
      const limit = boundedInteger(options.limit ?? 10, 'Store Edge claim limit', 1, 100);
      const leaseExpiresAt = new Date(Date.parse(now) + leaseMs).toISOString();
      return runScoped(client, normalizedScope, async (scoped) => {
        const result = await scoped.query<{ work_json: unknown }>(
          `WITH candidates AS (
             SELECT work_id
               FROM retail_store_edge_sync_work
              WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
                AND available_at <= $4
                AND (status IN ('pending', 'retryable') OR (status = 'leased' AND lease_expires_at <= $4))
              ORDER BY available_at ASC, work_id ASC
              FOR UPDATE SKIP LOCKED
              LIMIT $5
           )
           UPDATE retail_store_edge_sync_work AS work
              SET status = 'leased', attempts = work.attempts + 1,
                  lease_owner = $6, lease_expires_at = $7,
                  lease_token = md5(work.work_id || ':' || $6::text || ':' || $7::text || ':' || (work.attempts + 1)::text),
                  work_json = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(work.work_json, '{status}', to_jsonb('leased'::text)), '{attempts}', to_jsonb(work.attempts + 1)), '{leaseOwner}', to_jsonb($6::text)), '{leaseExpiresAt}', to_jsonb($7::text)), '{leaseToken}', to_jsonb(md5(work.work_id || ':' || $6::text || ':' || $7::text || ':' || (work.attempts + 1)::text)))
             FROM candidates
            WHERE work.tenant_id = $1 AND work.company_id = $2 AND work.branch_id = $3 AND work.work_id = candidates.work_id
            RETURNING work.work_json`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, now, limit, workerId, leaseExpiresAt],
        );
        return result.rows.map((row) => {
          // The SQL statement returns the post-update JSON document. Do not
          // read lease fields from synthetic result columns that PostgreSQL did
          // not return; doing so silently stripped ownership from real claims.
          return parseStoredWork(row.work_json);
        });
      });
    },

    async renew(scope, id, workerId, now = new Date().toISOString(), leaseMs = 60_000, leaseToken) {
      const normalizedLeaseMs = boundedInteger(leaseMs, 'Store Edge lease duration', 1_000, 15 * 60_000);
      const normalizedNow = validTimestamp(now, 'Store Edge lease renewal time');
      const expiresAt = new Date(Date.parse(normalizedNow) + normalizedLeaseMs).toISOString();
      return updateLease(client, scope, id, workerId, normalizedNow, leaseToken, (item) => ({ ...item, leaseExpiresAt: expiresAt }));
    },

    async requeueDeadLetter(scope, id, operatorId, reason, reference, now = new Date().toISOString()) {
      const normalizedScope = normalizeScope(scope);
      const normalizedId = nonBlank(id, 'Store Edge dead-letter work ID');
      const normalizedOperator = nonBlank(operatorId, 'Store Edge recovery operator');
      const normalizedReason = boundedText(reason, 'Store Edge recovery reason', 10, 500);
      const normalizedReference = boundedText(reference, 'Store Edge recovery reference', 3, 200);
      const normalizedNow = validTimestamp(now, 'Store Edge recovery time');
      return runScoped(client, normalizedScope, async (scoped) => {
        const result = await scoped.query<{ work_json: unknown }>(
          `SELECT work_json
             FROM retail_store_edge_sync_work
            WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3 AND work_id = $4
              AND status = 'dead-letter'
            FOR UPDATE`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalizedId],
        );
        const current = result.rows[0] ? parseStoredWork(result.rows[0].work_json) : undefined;
        if (!current) throw new StoreEdgeSyncWorkerValidationError('Only a dead-letter Store Edge item in the requested scope can be requeued.');
        const next: StoreEdgeSyncWorkItem = {
          ...current,
          status: 'retryable',
          attempts: 0,
          availableAt: normalizedNow,
          leaseOwner: undefined,
          leaseExpiresAt: undefined,
          leaseToken: undefined,
          requeueCount: (current.requeueCount ?? 0) + 1,
          lastRecoveryAt: normalizedNow,
          lastRecoveryBy: normalizedOperator,
          lastRecoveryReason: normalizedReason,
          lastRecoveryReference: normalizedReference,
        };
        await scoped.query(
          `UPDATE retail_store_edge_sync_work
              SET status = $5, attempts = $6, available_at = $7, lease_owner = NULL,
                  lease_expires_at = NULL, lease_token = NULL, last_error = $8,
                  completed_at = NULL, work_json = $9::jsonb
            WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3 AND work_id = $4
              AND status = 'dead-letter'`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalizedId, next.status, next.attempts, next.availableAt, next.lastError ?? null, JSON.stringify(next)],
        );
        return next;
      });
    },

    async complete(scope, id, workerId, now = new Date().toISOString(), leaseToken) {
      return updateLease(client, scope, id, workerId, now, leaseToken, (item) => ({ ...item, status: 'completed', completedAt: now, leaseOwner: undefined, leaseExpiresAt: undefined, leaseToken: undefined, lastError: undefined }));
    },

    async retry(scope, id, workerId, error, now = new Date().toISOString(), backoffMs = 5_000, maxAttempts = 5, leaseToken) {
      const normalizedError = nonBlank(error, 'Store Edge retry error').slice(0, 500);
      const normalizedBackoff = boundedInteger(backoffMs, 'Store Edge retry backoff', 0, 24 * 60 * 60 * 1000);
      const normalizedMaxAttempts = boundedInteger(maxAttempts, 'Store Edge maximum attempts', 1, 100);
      return updateLease(client, scope, id, workerId, now, leaseToken, (item) => ({
        ...item,
        status: item.attempts >= normalizedMaxAttempts ? 'dead-letter' : 'retryable',
        availableAt: new Date(Date.parse(now) + (item.attempts >= normalizedMaxAttempts ? 0 : normalizedBackoff)).toISOString(),
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        lastError: normalizedError,
      }));
    },

    async list(scope) {
      const normalizedScope = normalizeScope(scope);
      const result = await runScoped(client, normalizedScope, (scoped) => scoped.query<{ work_json: unknown }>(
        `SELECT work_json
           FROM retail_store_edge_sync_work
          WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
          ORDER BY available_at DESC, work_id ASC`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId],
      ));
      return result.rows.map((row) => parseStoredWork(row.work_json));
    },
  };
}

async function updateLease(client: ShadowImportSqlClient, scope: ShadowImportScope, id: string, workerId: string, now: string, leaseToken: string | undefined, transform: (item: StoreEdgeSyncWorkItem) => StoreEdgeSyncWorkItem): Promise<StoreEdgeSyncWorkItem> {
  const normalizedScope = normalizeScope(scope);
  const normalizedId = nonBlank(id, 'Store Edge work ID');
  const normalizedWorker = nonBlank(workerId, 'Store Edge worker ID');
  const normalizedLeaseToken = nonBlank(leaseToken, 'Store Edge lease fencing token');
  const normalizedNow = validTimestamp(now, 'Store Edge worker time');
  return runScoped(client, normalizedScope, async (scoped) => {
    const result = await scoped.query<{ work_json: unknown }>(
      `SELECT work_json
         FROM retail_store_edge_sync_work
        WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3 AND work_id = $4
          AND status = 'leased' AND lease_owner = $5 AND lease_expires_at > $6 AND lease_token = $7
        FOR UPDATE`,
      [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalizedId, normalizedWorker, normalizedNow, normalizedLeaseToken],
    );
    const current = result.rows[0] ? parseStoredWork(result.rows[0].work_json) : undefined;
    if (!current) throw new StoreEdgeSyncWorkerValidationError('Store Edge work item is missing, expired, or leased to another worker.');
    const next = transform(current);
    await scoped.query(
      `UPDATE retail_store_edge_sync_work
          SET status = $5, attempts = $6, available_at = $7, lease_owner = $8,
              lease_expires_at = $9, lease_token = $10, last_error = $11, completed_at = $12, work_json = $13::jsonb
        WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3 AND work_id = $4`,
      [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalizedId, next.status, next.attempts, next.availableAt, next.leaseOwner ?? null, next.leaseExpiresAt ?? null, next.leaseToken ?? null, next.lastError ?? null, next.completedAt ?? null, JSON.stringify(next)],
    );
    return next;
  });
}

async function runScoped<T>(client: ShadowImportSqlClient, scope: ShadowImportScope, operation: (scoped: ShadowImportSqlClient) => Promise<T>): Promise<T> {
  if (!client.withScope) throw new StoreEdgeSyncWorkerValidationError('Store Edge worker persistence requires a transaction-scoped SQL client.');
  return client.withScope(scope, operation);
}

function parseStoredWork(value: unknown): StoreEdgeSyncWorkItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StoreEdgeSyncWorkerValidationError('Stored Store Edge work item is malformed.');
  const item = value as Record<string, unknown>;
  const status = item.status;
  if (status !== 'pending' && status !== 'leased' && status !== 'retryable' && status !== 'completed' && status !== 'dead-letter') throw new StoreEdgeSyncWorkerValidationError('Stored Store Edge work status is invalid.');
  if (status === 'leased' && (typeof item.leaseToken !== 'string' || !item.leaseToken.trim())) throw new StoreEdgeSyncWorkerValidationError('Stored leased Store Edge work is missing its fencing token.');
  const attempts = Number(item.attempts);
  if (!Number.isSafeInteger(attempts) || attempts < 0) throw new StoreEdgeSyncWorkerValidationError('Stored Store Edge work attempts are invalid.');
  return {
    id: nonBlank(item.id, 'Stored Store Edge work ID'),
    eventId: nonBlank(item.eventId, 'Stored Store Edge work event ID'),
    scope: normalizeScope(item.scope),
    status,
    attempts,
    availableAt: validTimestamp(item.availableAt, 'Stored Store Edge available time'),
    ...(item.leaseOwner == null ? {} : { leaseOwner: nonBlank(item.leaseOwner, 'Stored Store Edge lease owner') }),
    ...(item.leaseExpiresAt == null ? {} : { leaseExpiresAt: validTimestamp(item.leaseExpiresAt, 'Stored Store Edge lease expiry') }),
    ...(item.leaseToken == null ? {} : { leaseToken: nonBlank(item.leaseToken, 'Stored Store Edge lease fencing token') }),
    ...(item.lastError == null ? {} : { lastError: nonBlank(item.lastError, 'Stored Store Edge last error') }),
    ...(item.completedAt == null ? {} : { completedAt: validTimestamp(item.completedAt, 'Stored Store Edge completion time') }),
    ...(item.requeueCount == null ? {} : { requeueCount: boundedInteger(Number(item.requeueCount), 'Stored Store Edge requeue count', 0, 1_000_000) }),
    ...(item.lastRecoveryAt == null ? {} : { lastRecoveryAt: validTimestamp(item.lastRecoveryAt, 'Stored Store Edge recovery time') }),
    ...(item.lastRecoveryBy == null ? {} : { lastRecoveryBy: nonBlank(item.lastRecoveryBy, 'Stored Store Edge recovery operator') }),
    ...(item.lastRecoveryReason == null ? {} : { lastRecoveryReason: nonBlank(item.lastRecoveryReason, 'Stored Store Edge recovery reason') }),
    ...(item.lastRecoveryReference == null ? {} : { lastRecoveryReference: nonBlank(item.lastRecoveryReference, 'Stored Store Edge recovery reference') }),
  };
}

function normalizeScope(value: unknown): ShadowImportScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StoreEdgeSyncWorkerValidationError('Store Edge scope is required.');
  const candidate = value as Record<string, unknown>;
  return { tenantId: nonBlank(candidate.tenantId, 'Tenant scope'), companyId: nonBlank(candidate.companyId, 'Company scope'), branchId: nonBlank(candidate.branchId, 'Branch scope') };
}

function nonBlank(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 500) throw new StoreEdgeSyncWorkerValidationError(`${label} is required.`);
  return value.trim();
}

function validTimestamp(value: unknown, label: string): string {
  const normalized = nonBlank(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new StoreEdgeSyncWorkerValidationError(`${label} must be a valid timestamp.`);
  return normalized;
}

function boundedInteger(value: number, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new StoreEdgeSyncWorkerValidationError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

function boundedText(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > maximum) throw new StoreEdgeSyncWorkerValidationError(`${label} must be between ${minimum} and ${maximum} characters.`);
  return value.trim();
}
