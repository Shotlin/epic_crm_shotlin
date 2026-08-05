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
      const result = await client.query<{ decision_json: unknown }>(
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
      await client.query(
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
      const result = await client.query<{ plan_json: unknown }>(
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
      const result = await client.query<{ plan_json: unknown }>(
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
      const result = await client.query<{ batch_id: string }>(
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
      await client.query(
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
      const result = await client.query<{ receipt_id: string }>(
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
      const result = await client.query<{ receipt_id: string }>(
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
      const result = await client.query<{ receipt_json: unknown }>(
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
`;

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
