import { randomUUID } from 'node:crypto';
import {
  normalizeRetailHubChannelOrderEvent,
  parseRetailHubChannelOrderEnvelope,
  type RetailHubChannelOrderAcceptResult,
  type RetailHubChannelOrderEnvelope,
  type RetailHubChannelOrderEvent,
  type RetailHubChannelOrderReceipt,
  type RetailHubChannelOrderRecord,
  type RetailHubChannelOrderTransportStore,
} from './channel-order-transport';
import type { ShadowImportScope, ShadowImportSqlClient } from './shadow-import-postgres-repository';

export interface RetailHubChannelOrderPostgresStoreOptions {
  /** A scope-aware client created with createRlsScopedSqlClient. */
  client: ShadowImportSqlClient;
  createId?: () => string;
  now?: () => string;
}

interface StoredChannelOrderRecord {
  tenant_id: string;
  company_id: string;
  branch_id: string;
  identity_key: string;
  event_id: string;
  source_digest: string;
  observed_status: string;
  mode: 'shadow' | 'governed';
  event_json: unknown;
  received_at: string;
  received_by: string;
}

/**
 * Durable, scope-bound channel-order transport for the Retail Hub.
 *
 * This is evidence storage only. It never creates a local order, reserves
 * stock, captures money, calls a provider, or changes the Bakaloo backend.
 * Every query runs through the RLS transaction wrapper and repeats the scope
 * predicates so a misconfigured deployment fails closed rather than leaking
 * another branch's order evidence.
 */
export function createPostgresRetailHubChannelOrderTransport(
  options: RetailHubChannelOrderPostgresStoreOptions,
): RetailHubChannelOrderTransportStore {
  if (!options?.client || typeof options.client.withScope !== 'function') {
    throw new Error('Retail Hub channel-order PostgreSQL storage requires a scope-aware SQL client.');
  }
  const withScope = options.client.withScope.bind(options.client);
  const createId = options.createId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async accept(envelope, scope, actorId, observedAt = now()): Promise<RetailHubChannelOrderAcceptResult> {
      const normalizedScope = normalizeScope(scope);
      const parsed = parseRetailHubChannelOrderEnvelope(envelope);
      const normalizedActor = requiredText(actorId, 'actorId', 160);
      const normalizedObservedAt = validTimestamp(observedAt);

      return withScope(normalizedScope, async (client) => {
        const insert = await client.query<StoredChannelOrderRecord>(
          `INSERT INTO retail_channel_order_records
             (tenant_id, company_id, branch_id, identity_key, event_id,
              source_digest, observed_status, mode, event_json, received_at, received_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
           ON CONFLICT (tenant_id, company_id, branch_id, identity_key) DO NOTHING
           RETURNING tenant_id, company_id, branch_id, identity_key, event_id,
                     source_digest, observed_status, mode, event_json,
                     received_at, received_by`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId,
            parsed.event.identityKey, parsed.event.externalEventId, parsed.event.sourceDigest,
            parsed.event.status, parsed.mode, JSON.stringify(parsed.event), normalizedObservedAt, normalizedActor],
        );

        if (insert.rows.length > 0) {
          const insertedRow = insert.rows[0];
          if (!insertedRow) throw new Error('Retail Hub channel-order insert returned an empty row.');
          const record = formatRecord(insertedRow, normalizedScope);
          const receipt = makeReceipt(createId(), parsed, normalizedScope, normalizedActor, normalizedObservedAt, 'recorded');
          await insertReceipt(client, receipt);
          return { outcome: 'recorded', receipt, record };
        }

        const existingResult = await client.query<StoredChannelOrderRecord>(
          `SELECT tenant_id, company_id, branch_id, identity_key, event_id,
                  source_digest, observed_status, mode, event_json,
                  received_at, received_by
             FROM retail_channel_order_records
            WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
              AND identity_key = $4
            FOR UPDATE`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, parsed.event.identityKey],
        );
        const existing = existingResult.rows[0];
        if (!existing) throw new Error('Retail Hub channel-order insert raced without an authoritative row.');
        const priorEvent = normalizeRetailHubChannelOrderEvent(parseJson(existing.event_json, 'stored channel-order event'));

        if (existing.event_id === parsed.event.externalEventId) {
          const outcome = existing.source_digest === parsed.event.sourceDigest ? 'idempotent' : 'conflicted';
          const detail = outcome === 'idempotent'
            ? 'The event was already accepted with the same source digest.'
            : 'The event ID was already recorded with a different source digest.';
          const receipt = makeReceipt(createId(), parsed, normalizedScope, normalizedActor, normalizedObservedAt, outcome, detail);
          await insertReceipt(client, receipt);
          return { outcome, receipt, ...(outcome === 'idempotent' ? { record: formatRecord(existing, normalizedScope) } : {}) };
        }

        if (!isStatusTransitionAllowed(priorEvent.status, parsed.event.status)) {
          const receipt = makeReceipt(createId(), parsed, normalizedScope, normalizedActor, normalizedObservedAt, 'conflicted', `Cannot move ${priorEvent.status} to ${parsed.event.status}.`);
          await insertReceipt(client, receipt);
          return { outcome: 'conflicted', receipt, record: formatRecord(existing, normalizedScope) };
        }

        const updated = await client.query<StoredChannelOrderRecord>(
          `UPDATE retail_channel_order_records
              SET event_id = $5,
                  source_digest = $6,
                  observed_status = $7,
                  mode = CASE WHEN mode = 'shadow' AND $8 = 'governed' THEN 'governed' ELSE mode END,
                  event_json = $9::jsonb,
                  received_at = $10,
                  received_by = $11,
                  updated_at = now()
            WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
              AND identity_key = $4
            RETURNING tenant_id, company_id, branch_id, identity_key, event_id,
                      source_digest, observed_status, mode, event_json,
                      received_at, received_by`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId,
            parsed.event.identityKey, parsed.event.externalEventId, parsed.event.sourceDigest,
            parsed.event.status, parsed.mode, JSON.stringify(parsed.event), normalizedObservedAt, normalizedActor],
        );
        const row = updated.rows[0];
        if (!row) throw new Error('Retail Hub channel-order update did not return an authoritative row.');
        const receipt = makeReceipt(createId(), parsed, normalizedScope, normalizedActor, normalizedObservedAt, 'recorded');
        await insertReceipt(client, receipt);
        return { outcome: 'recorded', receipt, record: formatRecord(row, normalizedScope) };
      });
    },

    async list(scope): Promise<readonly RetailHubChannelOrderReceipt[]> {
      const normalizedScope = normalizeScope(scope);
      return withScope(normalizedScope, async (client) => {
        const result = await client.query<{ receipt_json: unknown }>(
          `SELECT receipt_json
             FROM retail_channel_order_receipts
            WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
            ORDER BY received_at DESC, receipt_id ASC`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId],
        );
        return result.rows.map((row) => parseStoredReceipt(row.receipt_json));
      });
    },
  };
}

export const retailHubChannelOrderPostgresSchema = `
CREATE TABLE IF NOT EXISTS retail_channel_order_records (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  branch_id text NOT NULL,
  identity_key text NOT NULL,
  event_id text NOT NULL,
  source_digest char(64) NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  observed_status text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('shadow', 'governed')),
  event_json jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  received_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, company_id, branch_id, identity_key)
);
CREATE INDEX IF NOT EXISTS retail_channel_order_records_scope_observed_idx
  ON retail_channel_order_records (tenant_id, company_id, branch_id, received_at DESC);
ALTER TABLE retail_channel_order_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_channel_order_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retail_channel_order_records_scope_policy ON retail_channel_order_records;
CREATE POLICY retail_channel_order_records_scope_policy ON retail_channel_order_records
  USING (tenant_id = current_setting('epic_bos.tenant_id', true)
     AND company_id = current_setting('epic_bos.company_id', true)
     AND branch_id = current_setting('epic_bos.branch_id', true))
  WITH CHECK (tenant_id = current_setting('epic_bos.tenant_id', true)
     AND company_id = current_setting('epic_bos.company_id', true)
     AND branch_id = current_setting('epic_bos.branch_id', true));

CREATE TABLE IF NOT EXISTS retail_channel_order_receipts (
  tenant_id text NOT NULL,
  company_id text NOT NULL,
  branch_id text NOT NULL,
  receipt_id text NOT NULL,
  event_id text NOT NULL,
  identity_key text NOT NULL,
  source_digest char(64) NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  mode text NOT NULL CHECK (mode IN ('shadow', 'governed')),
  outcome text NOT NULL CHECK (outcome IN ('recorded', 'idempotent', 'conflicted')),
  actor_id text NOT NULL,
  received_at timestamptz NOT NULL,
  receipt_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, company_id, branch_id, receipt_id)
);
CREATE INDEX IF NOT EXISTS retail_channel_order_receipts_scope_received_idx
  ON retail_channel_order_receipts (tenant_id, company_id, branch_id, received_at DESC);
ALTER TABLE retail_channel_order_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_channel_order_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retail_channel_order_receipts_scope_policy ON retail_channel_order_receipts;
CREATE POLICY retail_channel_order_receipts_scope_policy ON retail_channel_order_receipts
  USING (tenant_id = current_setting('epic_bos.tenant_id', true)
     AND company_id = current_setting('epic_bos.company_id', true)
     AND branch_id = current_setting('epic_bos.branch_id', true))
  WITH CHECK (tenant_id = current_setting('epic_bos.tenant_id', true)
     AND company_id = current_setting('epic_bos.company_id', true)
     AND branch_id = current_setting('epic_bos.branch_id', true));
`;

async function insertReceipt(client: ShadowImportSqlClient, receipt: RetailHubChannelOrderReceipt): Promise<void> {
  await client.query(
    `INSERT INTO retail_channel_order_receipts
       (tenant_id, company_id, branch_id, receipt_id, event_id, identity_key,
        source_digest, mode, outcome, actor_id, received_at, receipt_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     ON CONFLICT (tenant_id, company_id, branch_id, receipt_id) DO NOTHING`,
    [receipt.scope.tenantId, receipt.scope.companyId, receipt.scope.branchId, receipt.id,
      receipt.eventId, receipt.identityKey, receipt.sourceDigest, receipt.mode,
      receipt.outcome, receipt.actorId, receipt.receivedAt, JSON.stringify(receipt)],
  );
}

function formatRecord(row: StoredChannelOrderRecord, scope: ShadowImportScope): RetailHubChannelOrderRecord {
  return {
    event: normalizeRetailHubChannelOrderEvent(parseJson(row.event_json, 'stored channel-order event')),
    mode: row.mode,
    scope: { ...scope },
    receivedAt: validTimestamp(row.received_at),
    receivedBy: row.received_by,
    receipts: [],
  };
}

function parseStoredReceipt(value: unknown): RetailHubChannelOrderReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stored channel-order receipt is invalid.');
  const receipt = value as Partial<RetailHubChannelOrderReceipt>;
  if (typeof receipt.id !== 'string' || typeof receipt.eventId !== 'string' || typeof receipt.identityKey !== 'string'
    || typeof receipt.sourceDigest !== 'string' || typeof receipt.mode !== 'string' || typeof receipt.outcome !== 'string'
    || typeof receipt.actorId !== 'string' || typeof receipt.receivedAt !== 'string' || !receipt.scope) {
    throw new Error('Stored channel-order receipt is incomplete.');
  }
  return {
    id: receipt.id,
    eventId: receipt.eventId,
    identityKey: receipt.identityKey,
    sourceDigest: receipt.sourceDigest,
    mode: receipt.mode as RetailHubChannelOrderReceipt['mode'],
    outcome: receipt.outcome as RetailHubChannelOrderReceipt['outcome'],
    actorId: receipt.actorId,
    receivedAt: validTimestamp(receipt.receivedAt),
    scope: normalizeScope(receipt.scope),
    ...(typeof receipt.detail === 'string' ? { detail: receipt.detail } : {}),
  };
}

function parseJson(value: unknown, label: string): unknown {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as unknown; } catch { throw new Error(`${label} is not valid JSON.`); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function makeReceipt(id: string, envelope: RetailHubChannelOrderEnvelope, scope: ShadowImportScope, actorId: string, receivedAt: string, outcome: RetailHubChannelOrderReceipt['outcome'], detail?: string): RetailHubChannelOrderReceipt {
  return { id: requiredText(id, 'receipt id', 200), eventId: envelope.event.externalEventId, identityKey: envelope.event.identityKey, sourceDigest: envelope.event.sourceDigest, mode: envelope.mode, outcome, actorId, receivedAt, scope: { ...scope }, ...(detail === undefined ? {} : { detail }) };
}

function isStatusTransitionAllowed(current: RetailHubChannelOrderEvent['status'], next: RetailHubChannelOrderEvent['status']): boolean {
  const allowed: Record<RetailHubChannelOrderEvent['status'], readonly RetailHubChannelOrderEvent['status'][]> = {
    received: ['received', 'accepted', 'cancelled'], accepted: ['accepted', 'picking', 'cancelled'], picking: ['picking', 'packed', 'cancelled'], packed: ['packed', 'fulfilled', 'cancelled', 'rto'], fulfilled: ['fulfilled', 'return-requested', 'returned', 'rto'], cancelled: ['cancelled'], 'return-requested': ['return-requested', 'returned', 'rto'], returned: ['returned'], rto: ['rto'],
  };
  return allowed[current].includes(next);
}

function normalizeScope(scope: ShadowImportScope): ShadowImportScope {
  return { tenantId: requiredText(scope?.tenantId, 'tenantId', 160), companyId: requiredText(scope?.companyId, 'companyId', 160), branchId: requiredText(scope?.branchId, 'branchId', 160) };
}

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > max) throw new Error(`${label} must be non-empty text.`);
  return value.trim();
}

function validTimestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('channel-order timestamp is invalid.');
  return parsed.toISOString();
}
