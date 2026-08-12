import { randomUUID } from 'node:crypto';
import type { ShadowImportScope, ShadowImportSqlClient } from './shadow-import-postgres-repository';
import { parseStoreEdgeSyncEvent, type StoreEdgeSyncAtomicAcceptResult, type StoreEdgeSyncEventInput, type StoreEdgeSyncInbox, type StoreEdgeSyncReceipt, type StoreEdgeSyncRecord } from './store-edge-sync';
import { createPostgresStoreEdgeSyncWorkerRepository } from './store-edge-sync-worker-postgres-repository';

export type StoreEdgeSyncPostgresRepository = StoreEdgeSyncInbox & {
  acceptAndEnqueue(input: StoreEdgeSyncEventInput, scope: ShadowImportScope, actorId: string, now?: string): Promise<StoreEdgeSyncAtomicAcceptResult>;
};

/**
 * Durable Store Edge inbox adapter. The caller injects a PostgreSQL client;
 * this module never opens a pool or chooses tenant/company/branch scope.
 * Deployments should provide `withScope` so the SQL runs inside one
 * transaction-local RLS context.
 */
export function createPostgresStoreEdgeSyncRepository(client: ShadowImportSqlClient): StoreEdgeSyncPostgresRepository {
  return {
    async accept(input, scope, actorId, now = new Date().toISOString()) {
      const normalized = parseStoreEdgeSyncEvent(input);
      const normalizedScope = normalizeScope(scope);
      const normalizedActor = nonBlank(actorId, 'Store Edge actor ID');
      const normalizedNow = validTimestamp(now, 'Store Edge receipt time');
      return runScoped(client, normalizedScope, async (scopedClient) => {
        // Serialize acceptance per tenant/company/branch for the lifetime of this
        // transaction. Without this lock, two concurrent writers can both observe
        // the same MAX(sequence) and race through the monotonicity check before
        // either insert is visible. The lock is transaction-scoped and therefore
        // cannot outlive the RLS transaction supplied by `withScope`.
        await scopedClient.query(
          `SELECT pg_advisory_xact_lock(
             hashtextextended($1 || ':' || $2 || ':' || $3, 0)
           )`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId],
        );
        const existingResult = await scopedClient.query<{ event_json: unknown; payload_checksum: string }>(
          `SELECT event_json, payload_checksum
             FROM retail_store_edge_sync_events
            WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3 AND event_id = $4`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalized.eventId],
        );
        const existingRow = existingResult.rows[0];
        if (existingRow) {
          const existing = parseStoredRecord(existingRow.event_json);
          const outcome = existing.payloadChecksum === normalized.payloadChecksum ? 'idempotent' as const : 'conflicted' as const;
          const detail = outcome === 'idempotent'
            ? 'The Store Edge event was already accepted with the same checksum.'
            : 'The event ID was already recorded with a different payload checksum.';
          const receipt = await appendReceipt(scopedClient, normalized, normalizedScope, normalizedActor, normalizedNow, outcome, detail);
          return { outcome, receipt, record: outcome === 'idempotent' ? existing : undefined };
        }
        const transactionResult = await scopedClient.query<{ payload_checksum: string }>(
          `SELECT payload_checksum
             FROM retail_store_edge_sync_events
            WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3 AND transaction_key = $4
            ORDER BY sequence DESC
            LIMIT 1`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalized.transactionKey],
        );
        if (transactionResult.rows[0] && transactionResult.rows[0].payload_checksum !== normalized.payloadChecksum) {
          const receipt = await appendReceipt(scopedClient, normalized, normalizedScope, normalizedActor, normalizedNow, 'conflicted', 'The transaction key was already recorded with a different payload checksum.');
          return { outcome: 'conflicted' as const, receipt };
        }
        const sequenceResult = await scopedClient.query<{ sequence: number | string }>(
          `SELECT MAX(sequence) AS sequence
             FROM retail_store_edge_sync_events
            WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId],
        );
        const previousSequence = sequenceResult.rows[0]?.sequence === null || sequenceResult.rows[0]?.sequence === undefined ? undefined : Number(sequenceResult.rows[0].sequence);
        if (previousSequence !== undefined && normalized.sequence <= previousSequence) {
          const receipt = await appendReceipt(scopedClient, normalized, normalizedScope, normalizedActor, normalizedNow, 'conflicted', `Sequence ${normalized.sequence} is not greater than the last accepted sequence ${previousSequence}.`);
          return { outcome: 'conflicted' as const, receipt };
        }
        const inserted = await scopedClient.query<{ event_json: unknown; payload_checksum: string }>(
          `INSERT INTO retail_store_edge_sync_events
            (tenant_id, company_id, branch_id, event_id, event_type, aggregate_id, transaction_key, sequence, produced_at, payload_checksum, event_json, received_at, received_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
           ON CONFLICT DO NOTHING
           RETURNING event_json, payload_checksum`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalized.eventId, normalized.eventType, normalized.aggregateId, normalized.transactionKey, normalized.sequence, normalized.producedAt, normalized.payloadChecksum, JSON.stringify({ ...normalized, scope: normalizedScope, receivedAt: normalizedNow, receivedBy: normalizedActor }), normalizedNow, normalizedActor],
        );
        if (!inserted.rows[0]) {
          const authoritative = await scopedClient.query<{ event_json: unknown; payload_checksum: string }>(
            `SELECT event_json, payload_checksum
               FROM retail_store_edge_sync_events
              WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3 AND event_id = $4`,
            [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalized.eventId],
          );
          if (authoritative.rows[0]) {
            const existing = parseStoredRecord(authoritative.rows[0].event_json);
            const outcome = existing.payloadChecksum === normalized.payloadChecksum ? 'idempotent' as const : 'conflicted' as const;
            const detail = outcome === 'idempotent'
              ? 'The Store Edge event was accepted concurrently with the same checksum.'
              : 'The event ID was accepted concurrently with a different payload checksum.';
            const receipt = await appendReceipt(scopedClient, normalized, normalizedScope, normalizedActor, normalizedNow, outcome, detail);
            return { outcome, receipt, record: outcome === 'idempotent' ? existing : undefined };
          }
          const transaction = await scopedClient.query<{ event_json: unknown }>(
            `SELECT event_json
               FROM retail_store_edge_sync_events
              WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3 AND transaction_key = $4 AND sequence = $5`,
            [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId, normalized.transactionKey, normalized.sequence],
          );
          if (transaction.rows[0]) {
            const receipt = await appendReceipt(scopedClient, normalized, normalizedScope, normalizedActor, normalizedNow, 'conflicted', 'The transaction key and sequence were accepted concurrently by another event.');
            return { outcome: 'conflicted' as const, receipt, record: undefined };
          }
          throw new Error('Store Edge event insert race produced no authoritative row.');
        }
        const receipt = await appendReceipt(scopedClient, normalized, normalizedScope, normalizedActor, normalizedNow, 'recorded');
        const record: StoreEdgeSyncRecord = { ...normalized, scope: structuredClone(normalizedScope), receivedAt: normalizedNow, receivedBy: normalizedActor };
        return { outcome: 'recorded' as const, receipt, record };
      });
    },

    async acceptAndEnqueue(input, scope, actorId, now = new Date().toISOString()) {
      const normalizedScope = normalizeScope(scope);
      return runScoped(client, normalizedScope, async (transactionClient) => {
        // Reuse both repositories against the already-open transaction. The
        // nested scope wrapper deliberately does not open another transaction;
        // an event, receipt, and work item therefore commit or roll back as one
        // inbox/outbox unit.
        const sameTransactionClient: ShadowImportSqlClient = {
          ...transactionClient,
          withScope: async (_scope, operation) => operation(transactionClient),
        };
        const accepted = await createPostgresStoreEdgeSyncRepository(sameTransactionClient).accept(input, normalizedScope, actorId, now);
        if (accepted.outcome === 'conflicted' || !accepted.record) return accepted;
        const work = await createPostgresStoreEdgeSyncWorkerRepository(sameTransactionClient).enqueue(accepted.record, accepted.receipt.receivedAt);
        return { ...accepted, workItemId: work.id };
      });
    },

    async list(scope) {
      const normalizedScope = normalizeScope(scope);
      return runScoped(client, normalizedScope, async (scopedClient) => {
        const result = await scopedClient.query<{ receipt_json: unknown }>(
          `SELECT receipt_json
             FROM retail_store_edge_sync_receipts
            WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
            ORDER BY received_at DESC, receipt_id ASC`,
          [normalizedScope.tenantId, normalizedScope.companyId, normalizedScope.branchId],
        );
        return result.rows.map((row) => parseStoredReceipt(row.receipt_json));
      });
    },
  };
}

async function appendReceipt(client: ShadowImportSqlClient, input: StoreEdgeSyncEventInput, scope: ShadowImportScope, actorId: string, now: string, outcome: StoreEdgeSyncReceipt['outcome'], detail?: string): Promise<StoreEdgeSyncReceipt> {
  const receipt: StoreEdgeSyncReceipt = {
    id: randomUUID(),
    eventId: input.eventId,
    eventType: input.eventType,
    aggregateId: input.aggregateId,
    transactionKey: input.transactionKey,
    sequence: input.sequence,
    payloadChecksum: input.payloadChecksum,
    outcome,
    actorId,
    receivedAt: now,
    scope: structuredClone(scope),
    ...(detail === undefined ? {} : { detail }),
  };
  await client.query(
    `INSERT INTO retail_store_edge_sync_receipts
      (tenant_id, company_id, branch_id, receipt_id, event_id, outcome, actor_id, received_at, receipt_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (tenant_id, company_id, branch_id, receipt_id) DO NOTHING`,
    [scope.tenantId, scope.companyId, scope.branchId, receipt.id, receipt.eventId, receipt.outcome, receipt.actorId, receipt.receivedAt, JSON.stringify(receipt)],
  );
  return receipt;
}

async function runScoped<T>(client: ShadowImportSqlClient, scope: ShadowImportScope, operation: (scopedClient: ShadowImportSqlClient) => Promise<T>): Promise<T> {
  if (!client.withScope) throw new Error('Store Edge persistence requires a transaction-scoped SQL client.');
  return client.withScope(scope, operation);
}

function parseStoredRecord(value: unknown): StoreEdgeSyncRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stored Store Edge event is malformed.');
  const record = value as Record<string, unknown>;
  const event = parseStoreEdgeSyncEvent(record);
  const scope = normalizeScope(record.scope);
  const receivedAt = validTimestamp(record.receivedAt, 'Stored Store Edge receivedAt');
  const receivedBy = nonBlank(record.receivedBy, 'Stored Store Edge receivedBy');
  return { ...event, scope, receivedAt, receivedBy };
}

function parseStoredReceipt(value: unknown): StoreEdgeSyncReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stored Store Edge receipt is malformed.');
  const receipt = value as Record<string, unknown>;
  const scope = normalizeScope(receipt.scope);
  const outcome = receipt.outcome;
  if (outcome !== 'recorded' && outcome !== 'idempotent' && outcome !== 'conflicted') throw new Error('Stored Store Edge receipt outcome is invalid.');
  return {
    id: nonBlank(receipt.id, 'Stored Store Edge receipt ID'),
    eventId: nonBlank(receipt.eventId, 'Stored Store Edge receipt event ID'),
    eventType: nonBlank(receipt.eventType, 'Stored Store Edge receipt event type'),
    aggregateId: nonBlank(receipt.aggregateId, 'Stored Store Edge receipt aggregate ID'),
    transactionKey: nonBlank(receipt.transactionKey, 'Stored Store Edge receipt transaction key'),
    sequence: Number(receipt.sequence),
    payloadChecksum: nonBlank(receipt.payloadChecksum, 'Stored Store Edge receipt checksum'),
    outcome,
    actorId: nonBlank(receipt.actorId, 'Stored Store Edge receipt actor ID'),
    receivedAt: validTimestamp(receipt.receivedAt, 'Stored Store Edge receipt time'),
    scope,
    ...(receipt.detail === undefined ? {} : { detail: nonBlank(receipt.detail, 'Stored Store Edge receipt detail') }),
  };
}

function normalizeScope(value: unknown): ShadowImportScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Store Edge scope is required.');
  const candidate = value as Record<string, unknown>;
  return {
    tenantId: nonBlank(candidate.tenantId, 'Store Edge tenant ID'),
    companyId: nonBlank(candidate.companyId, 'Store Edge company ID'),
    branchId: nonBlank(candidate.branchId, 'Store Edge branch ID'),
  };
}

function nonBlank(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 240) throw new Error(`${label} is required.`);
  return value.trim();
}

function validTimestamp(value: unknown, label: string): string {
  const normalized = nonBlank(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${label} must be a valid timestamp.`);
  return normalized;
}
