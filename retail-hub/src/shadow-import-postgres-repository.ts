import type { ShadowImportPlan } from './shadow-import';
import type { ShadowImportReviewDecision, ShadowImportReviewStore } from './shadow-import-review';
import { assertShadowImportPullReceipt, type ShadowImportPullReceipt } from './shadow-import-pull-receipt';

export interface ShadowImportScope {
  tenantId: string;
  companyId: string;
  branchId: string;
}

export interface ShadowImportSqlClient {
  query<T = Record<string, unknown>>(sql: string, parameters?: readonly unknown[]): Promise<{ rows: T[] }>;
  /** Optional trusted transaction wrapper that sets transaction-local RLS scope. */
  withScope?<T>(scope: ShadowImportScope, operation: (client: ShadowImportSqlClient) => Promise<T>): Promise<T>;
}

export interface ShadowImportTransactionPool {
  /** The implementation must commit on success and roll back on failure. */
  withTransaction<T>(operation: (client: ShadowImportSqlClient) => Promise<T>): Promise<T>;
}

/**
 * Adapt an approved PostgreSQL transaction pool to the repository's RLS
 * contract. Direct unscoped queries fail closed; every scoped operation first
 * sets transaction-local tenant/company/branch settings with parameters.
 */
export function createRlsScopedSqlClient(pool: ShadowImportTransactionPool): ShadowImportSqlClient {
  return {
    query: async () => {
      throw new Error('Retail Hub SQL requires an authenticated transaction scope.');
    },
    async withScope(scope, operation) {
      const normalizedScope = normalizeScope(scope);
      return pool.withTransaction(async (transaction) => {
        await transaction.query(
          `SELECT set_config('epic_bos.tenant_id', $1, true),
                  set_config('epic_bos.company_id', $2, true),
                  set_config('epic_bos.branch_id', $3, true)`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId],
        );
        const activeScope = await transaction.query<{ tenant_id: string | null; company_id: string | null; branch_id: string | null }>(
          `SELECT current_setting('epic_bos.tenant_id', true) AS tenant_id,
                  current_setting('epic_bos.company_id', true) AS company_id,
                  current_setting('epic_bos.branch_id', true) AS branch_id`,
        );
        const activeRow = activeScope.rows[0];
        if (activeRow?.tenant_id !== normalizedScope.tenantId
          || activeRow.company_id !== normalizedScope.companyId
          || activeRow.branch_id !== normalizedScope.branchId) {
          throw new Error('Retail Hub transaction scope verification failed.');
        }
        return operation(transaction);
      });
    },
  };
}

export interface ShadowImportPostgresRepository {
  listPlans(scope: ShadowImportScope): Promise<readonly ShadowImportPlan[]>;
  getPlan(scope: ShadowImportScope, batchId: string): Promise<ShadowImportPlan | undefined>;
  /** Immutable durable registration; duplicate batches are rejected. */
  registerPlan?: (scope: ShadowImportScope, plan: ShadowImportPlan) => Promise<void>;
  replacePlan(scope: ShadowImportScope, plan: ShadowImportPlan): Promise<void>;
  /** Optional immutable pull-audit receipt persistence. */
  registerPullReceipt?: (scope: ShadowImportScope, receipt: ShadowImportPullReceipt) => Promise<void>;
  /** Atomic plan + receipt registration for durable pull orchestration. */
  registerPlanAndPullReceipt?: (scope: ShadowImportScope, plan: ShadowImportPlan, receipt: ShadowImportPullReceipt) => Promise<void>;
  listPullReceipts?: (scope: ShadowImportScope, batchId?: string) => Promise<readonly ShadowImportPullReceipt[]>;
}

/** Durable review-evidence store; decisions never mutate source or business records. */
export function createPostgresShadowImportReviewStore(
  client: ShadowImportSqlClient,
): ShadowImportReviewStore {
  return {
    async list(scope, batchId) {
      const normalizedScope = normalizeScope(scope);
      const normalizedBatchId = batchId === undefined ? undefined : nonBlank(batchId, 'Shadow-import batch ID');
      const result = await queryInScope<{ decision_json: unknown }>(client, normalizedScope,
        `SELECT decision_json
           FROM retail_shadow_import_review_decisions
          WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
            AND ($4::text IS NULL OR batch_id = $4)
          ORDER BY decided_at DESC, decision_id ASC`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalizedBatchId ?? null],
      );
      return result.rows.map((row) => parseStoredDecision(row.decision_json));
    },

    async append(scope, decision) {
      const normalizedScope = normalizeScope(scope);
      const normalizedDecision = parseStoredDecision(decision);
      if (!sameScope(normalizedDecision.scope, normalizedScope)) throw new Error('Review decision scope does not match the requested scope.');
      await queryInScope(client, normalizedScope,
        `INSERT INTO retail_shadow_import_review_decisions
          (tenant_id, company_id, branch_id, decision_id, batch_id, actor_id, decision, reason, decided_at, plan_status, plan_checksum, decision_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
         ON CONFLICT (tenant_id, company_id, branch_id, decision_id) DO NOTHING`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalizedDecision.id, normalizedDecision.batchId, normalizedDecision.actorId, normalizedDecision.decision, normalizedDecision.reason, normalizedDecision.decidedAt, normalizedDecision.planStatus, normalizedDecision.planChecksum, JSON.stringify(normalizedDecision)],
      );
    },
  };
}

/**
 * SQL adapter boundary for the future Retail Hub persistence service. The
 * client is injected so schema, pooling, migrations, and transaction policy
 * stay outside the importer and remain testable without a live database.
 */
export function createPostgresShadowImportRepository(
  client: ShadowImportSqlClient,
): ShadowImportPostgresRepository {
  return {
    async listPlans(scope) {
      const normalizedScope = normalizeScope(scope);
      const result = await queryInScope<{ plan_json: unknown }>(client, normalizedScope,
        `SELECT plan_json
           FROM retail_shadow_import_batches
          WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
          ORDER BY observed_at DESC, batch_id ASC`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId],
      );
      return result.rows.map((row) => parseStoredPlan(row.plan_json));
    },

    async getPlan(scope, batchId) {
      const normalizedScope = normalizeScope(scope);
      const normalizedBatchId = nonBlank(batchId, 'Shadow-import batch ID');
      const result = await queryInScope<{ plan_json: unknown }>(client, normalizedScope,
        `SELECT plan_json
           FROM retail_shadow_import_batches
          WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3 AND batch_id = $4`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalizedBatchId],
      );
      const row = result.rows[0];
      return row === undefined ? undefined : parseStoredPlan(row.plan_json);
    },

    async registerPlan(scope, plan) {
      const normalizedScope = normalizeScope(scope);
      const batchId = nonBlank(plan.batch.id, 'Shadow-import batch ID');
      const result = await queryInScope<{ batch_id: string }>(client, normalizedScope,
        `INSERT INTO retail_shadow_import_batches
          (tenant_id, company_id, branch_id, batch_id, source, observed_at, status, plan_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (tenant_id, company_id, branch_id, batch_id) DO NOTHING
         RETURNING batch_id`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, batchId, plan.batch.source, plan.batch.observedAt, plan.batch.status, JSON.stringify(plan)],
      );
      if (result.rows.length === 0) throw new Error(`Shadow-import batch already exists: ${batchId}`);
    },

    async replacePlan(scope, plan) {
      const normalizedScope = normalizeScope(scope);
      const batchId = nonBlank(plan.batch.id, 'Shadow-import batch ID');
      await queryInScope(client, normalizedScope,
        `INSERT INTO retail_shadow_import_batches
          (tenant_id, company_id, branch_id, batch_id, source, observed_at, status, plan_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (tenant_id, company_id, branch_id, batch_id)
         DO UPDATE SET source = EXCLUDED.source,
                       observed_at = EXCLUDED.observed_at,
                       status = EXCLUDED.status,
                       plan_json = EXCLUDED.plan_json,
                       updated_at = now()`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, batchId, plan.batch.source, plan.batch.observedAt, plan.batch.status, JSON.stringify(plan)],
      );
    },

    async registerPullReceipt(scope, receipt) {
      const normalizedScope = normalizeScope(scope);
      const normalizedReceipt = assertShadowImportPullReceipt(receipt);
      if (!sameScope(normalizedReceipt.scope, normalizedScope)) throw new Error('Pull receipt scope does not match the requested scope.');
      const result = await queryInScope<{ receipt_id: string }>(client, normalizedScope,
        `INSERT INTO retail_shadow_import_pull_receipts
          (tenant_id, company_id, branch_id, receipt_id, batch_id, observed_at, registered_at, credential_revision, pages_fetched, records_fetched, plan_checksum, receipt_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
         ON CONFLICT (tenant_id, company_id, branch_id, receipt_id) DO NOTHING
         RETURNING receipt_id`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalizedReceipt.id, normalizedReceipt.batchId, normalizedReceipt.observedAt, normalizedReceipt.registeredAt, normalizedReceipt.credentialRevision ?? null, normalizedReceipt.pagesFetched, normalizedReceipt.recordsFetched, normalizedReceipt.planChecksum, JSON.stringify(normalizedReceipt)],
      );
      if (result.rows.length === 0) throw new Error(`Shadow-import pull receipt already exists: ${normalizedReceipt.id}`);
    },

    async registerPlanAndPullReceipt(scope, plan, receipt) {
      const normalizedScope = normalizeScope(scope);
      const batchId = nonBlank(plan.batch.id, 'Shadow-import batch ID');
      const normalizedReceipt = assertShadowImportPullReceipt(receipt, plan);
      if (!sameScope(normalizedReceipt.scope, normalizedScope)) throw new Error('Pull receipt scope does not match the requested scope.');
      if (normalizedReceipt.batchId !== batchId) throw new Error('Pull receipt batch does not match the shadow-import plan.');
      const result = await queryInScope<{ receipt_id: string }>(client, normalizedScope,
        `WITH inserted_plan AS (
           INSERT INTO retail_shadow_import_batches
             (tenant_id, company_id, branch_id, batch_id, source, observed_at, status, plan_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
           ON CONFLICT (tenant_id, company_id, branch_id, batch_id) DO NOTHING
           RETURNING batch_id
         )
         INSERT INTO retail_shadow_import_pull_receipts
           (tenant_id, company_id, branch_id, receipt_id, batch_id, observed_at, registered_at, credential_revision, pages_fetched, records_fetched, plan_checksum, receipt_json)
         SELECT $1, $2, $3, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb
           FROM inserted_plan
         ON CONFLICT (tenant_id, company_id, branch_id, receipt_id) DO NOTHING
         RETURNING receipt_id`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, batchId, plan.batch.source, plan.batch.observedAt, plan.batch.status, JSON.stringify(plan), normalizedReceipt.id, normalizedReceipt.batchId, normalizedReceipt.observedAt, normalizedReceipt.registeredAt, normalizedReceipt.credentialRevision ?? null, normalizedReceipt.pagesFetched, normalizedReceipt.recordsFetched, normalizedReceipt.planChecksum, JSON.stringify(normalizedReceipt)],
      );
      if (result.rows.length === 0) throw new Error(`Shadow-import batch or pull receipt already exists: ${batchId}`);
    },

    async listPullReceipts(scope, batchId) {
      const normalizedScope = normalizeScope(scope);
      const normalizedBatchId = batchId === undefined ? undefined : nonBlank(batchId, 'Shadow-import batch ID');
      const result = await queryInScope<{ receipt_json: unknown }>(client, normalizedScope,
        `SELECT receipt_json
           FROM retail_shadow_import_pull_receipts
          WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
            AND ($4::text IS NULL OR batch_id = $4)
          ORDER BY registered_at DESC, receipt_id ASC`,
        [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalizedBatchId ?? null],
      );
      return result.rows.map((row) => parseStoredReceipt(row.receipt_json));
    },
  };
}

/** Migration input for the approved Hub database; execution belongs to the migration runner. */
export const shadowImportPostgresSchema = `
CREATE TABLE IF NOT EXISTS retail_shadow_import_batches (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  branch_id text NOT NULL,
  batch_id text NOT NULL,
  source text NOT NULL CHECK (source = 'bakaloo'),
  observed_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('ready-for-review', 'blocked')),
  plan_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, company_id, branch_id, batch_id)
);
CREATE INDEX IF NOT EXISTS retail_shadow_import_batches_scope_observed_idx
  ON retail_shadow_import_batches (tenant_id, company_id, branch_id, observed_at DESC);
ALTER TABLE retail_shadow_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_shadow_import_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retail_shadow_import_batches_scope_policy ON retail_shadow_import_batches;
CREATE POLICY retail_shadow_import_batches_scope_policy ON retail_shadow_import_batches
  USING (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  );

CREATE TABLE IF NOT EXISTS retail_shadow_import_review_decisions (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  branch_id text NOT NULL,
  decision_id text NOT NULL,
  batch_id text NOT NULL,
  actor_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  reason text NOT NULL,
  decided_at timestamptz NOT NULL,
  plan_status text NOT NULL CHECK (plan_status IN ('reconciled', 'needs-review', 'blocked')),
  plan_checksum text NOT NULL,
  decision_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, company_id, branch_id, decision_id)
);
CREATE INDEX IF NOT EXISTS retail_shadow_import_review_decisions_scope_batch_idx
  ON retail_shadow_import_review_decisions (tenant_id, company_id, branch_id, batch_id, decided_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS retail_shadow_import_review_decisions_one_accept_idx
  ON retail_shadow_import_review_decisions (tenant_id, company_id, branch_id, batch_id)
  WHERE decision = 'accepted';
ALTER TABLE retail_shadow_import_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_shadow_import_review_decisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retail_shadow_import_review_decisions_scope_policy ON retail_shadow_import_review_decisions;
CREATE POLICY retail_shadow_import_review_decisions_scope_policy ON retail_shadow_import_review_decisions
  USING (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  );

CREATE TABLE IF NOT EXISTS retail_shadow_import_pull_receipts (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  branch_id text NOT NULL,
  receipt_id text NOT NULL,
  batch_id text NOT NULL,
  observed_at timestamptz NOT NULL,
  registered_at timestamptz NOT NULL,
  credential_revision integer,
  pages_fetched integer NOT NULL CHECK (pages_fetched >= 0),
  records_fetched integer NOT NULL CHECK (records_fetched >= 0),
  plan_checksum text NOT NULL,
  receipt_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, company_id, branch_id, receipt_id),
  UNIQUE (tenant_id, company_id, branch_id, batch_id)
);
CREATE INDEX IF NOT EXISTS retail_shadow_import_pull_receipts_scope_registered_idx
  ON retail_shadow_import_pull_receipts (tenant_id, company_id, branch_id, registered_at DESC);
ALTER TABLE retail_shadow_import_pull_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_shadow_import_pull_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retail_shadow_import_pull_receipts_scope_policy ON retail_shadow_import_pull_receipts;
CREATE POLICY retail_shadow_import_pull_receipts_scope_policy ON retail_shadow_import_pull_receipts
  USING (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  );

CREATE TABLE IF NOT EXISTS retail_store_edge_sync_events (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  branch_id text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  aggregate_id text NOT NULL,
  transaction_key text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  produced_at timestamptz NOT NULL,
  payload_checksum text NOT NULL CHECK (payload_checksum ~ '^[a-f0-9]{64}$'),
  event_json jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  received_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, company_id, branch_id, event_id),
  UNIQUE (tenant_id, company_id, branch_id, transaction_key, sequence)
);
CREATE INDEX IF NOT EXISTS retail_store_edge_sync_events_scope_sequence_idx
  ON retail_store_edge_sync_events (tenant_id, company_id, branch_id, sequence DESC);
CREATE INDEX IF NOT EXISTS retail_store_edge_sync_events_scope_transaction_idx
  ON retail_store_edge_sync_events (tenant_id, company_id, branch_id, transaction_key, sequence DESC);
ALTER TABLE retail_store_edge_sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_store_edge_sync_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retail_store_edge_sync_events_scope_policy ON retail_store_edge_sync_events;
CREATE POLICY retail_store_edge_sync_events_scope_policy ON retail_store_edge_sync_events
  USING (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  );

CREATE TABLE IF NOT EXISTS retail_store_edge_sync_receipts (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  branch_id text NOT NULL,
  receipt_id text NOT NULL,
  event_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('recorded', 'idempotent', 'conflicted')),
  actor_id text NOT NULL,
  received_at timestamptz NOT NULL,
  receipt_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, company_id, branch_id, receipt_id)
);
CREATE INDEX IF NOT EXISTS retail_store_edge_sync_receipts_scope_received_idx
  ON retail_store_edge_sync_receipts (tenant_id, company_id, branch_id, received_at DESC);
ALTER TABLE retail_store_edge_sync_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_store_edge_sync_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retail_store_edge_sync_receipts_scope_policy ON retail_store_edge_sync_receipts;
CREATE POLICY retail_store_edge_sync_receipts_scope_policy ON retail_store_edge_sync_receipts
  USING (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  );

CREATE TABLE IF NOT EXISTS retail_store_edge_sync_work (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  branch_id text NOT NULL,
  work_id text NOT NULL,
  event_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'leased', 'retryable', 'completed', 'dead-letter')),
  attempts integer NOT NULL CHECK (attempts >= 0),
  available_at timestamptz NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  lease_token text,
  last_error text,
  completed_at timestamptz,
  work_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, company_id, branch_id, work_id),
  UNIQUE (tenant_id, company_id, branch_id, event_id)
);
ALTER TABLE retail_store_edge_sync_work
  ADD COLUMN IF NOT EXISTS lease_token text;
CREATE INDEX IF NOT EXISTS retail_store_edge_sync_work_claim_idx
  ON retail_store_edge_sync_work (tenant_id, company_id, branch_id, status, available_at, work_id);
ALTER TABLE retail_store_edge_sync_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_store_edge_sync_work FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retail_store_edge_sync_work_scope_policy ON retail_store_edge_sync_work;
CREATE POLICY retail_store_edge_sync_work_scope_policy ON retail_store_edge_sync_work
  USING (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  );

CREATE TABLE IF NOT EXISTS retail_store_edge_sync_worker_metrics (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  branch_id text NOT NULL,
  metrics_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, company_id, branch_id)
);
ALTER TABLE retail_store_edge_sync_worker_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_store_edge_sync_worker_metrics FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retail_store_edge_sync_worker_metrics_scope_policy ON retail_store_edge_sync_worker_metrics;
CREATE POLICY retail_store_edge_sync_worker_metrics_scope_policy ON retail_store_edge_sync_worker_metrics
  USING (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  )
  WITH CHECK (
    tenant_id = current_setting('epic_bos.tenant_id', true)
    AND company_id = current_setting('epic_bos.company_id', true)
    AND branch_id = current_setting('epic_bos.branch_id', true)
  );
`;

async function queryInScope<T>(
  client: ShadowImportSqlClient,
  scope: ShadowImportScope,
  sql: string,
  parameters: readonly unknown[] = [],
): Promise<{ rows: T[] }> {
  if (client.withScope) {
    return client.withScope(scope, (scopedClient) => scopedClient.query<T>(sql, parameters));
  }
  return client.query<T>(sql, parameters);
}

function normalizeScope(scope: ShadowImportScope): ShadowImportScope {
  return {
    tenantId: nonBlank(scope.tenantId, 'Tenant scope'),
    companyId: nonBlank(scope.companyId, 'Company scope'),
    branchId: nonBlank(scope.branchId, 'Branch scope'),
  };
}

function nonBlank(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must not be blank.`);
  return value.trim();
}

function parseStoredPlan(value: unknown): ShadowImportPlan {
  if (typeof value === 'string') {
    try { return clone(JSON.parse(value) as ShadowImportPlan); } catch { throw new Error('Stored shadow-import plan is not valid JSON.'); }
  }
  if (!value || typeof value !== 'object') throw new Error('Stored shadow-import plan is missing.');
  return clone(value as ShadowImportPlan);
}

function parseStoredDecision(value: unknown): ShadowImportReviewDecision {
  if (typeof value === 'string') {
    try { return clone(JSON.parse(value) as ShadowImportReviewDecision); } catch { throw new Error('Stored shadow-import review decision is not valid JSON.'); }
  }
  if (!value || typeof value !== 'object') throw new Error('Stored shadow-import review decision is missing.');
  return clone(value as ShadowImportReviewDecision);
}

function parseStoredReceipt(value: unknown): ShadowImportPullReceipt {
  if (typeof value === 'string') {
    try { return clone(JSON.parse(value) as ShadowImportPullReceipt); } catch { throw new Error('Stored shadow-import pull receipt is not valid JSON.'); }
  }
  if (!value || typeof value !== 'object') throw new Error('Stored shadow-import pull receipt is missing.');
  return clone(value as ShadowImportPullReceipt);
}

function sameScope(left: ShadowImportScope, right: ShadowImportScope): boolean {
  return left.tenantId === right.tenantId && left.companyId === right.companyId && left.branchId === right.branchId;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
