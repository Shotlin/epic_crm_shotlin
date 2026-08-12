import { createHash, randomUUID } from 'node:crypto';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { CheckoutRetailSaleInput, RetailSale } from '../shared/retail-pos-contracts';
import type { RetailHubStoreEdgeSyncEvent } from '../shared/retail-hub-store-edge-sync-contracts';
import { buildRetailHubStoreEdgeSalePayload } from '../shared/retail-hub-store-edge-sync-projection';
import type { ResolveRetailOfflineSaleInput, RetailOfflineSaleQueueItem, RetailOfflineSyncPlan, RetailOfflineSyncReceiptStatus, SyncRetailOfflineQueueInput, SyncRetailOfflineSaleInput } from '../shared/retail-offline-sync-contracts';
import { checkoutRetailSale } from './retail-pos';

const checksum = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value: string, label: string, minimum = 8, maximum = 120) => {
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
};
const sameScope = (state: RevenueOpsState, record: { scope?: RevenueOpsState['scope'] }) => {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};
const inputChecksum = (input: CheckoutRetailSaleInput) => checksum(input);

function appendSyncReceipt(
  state: RevenueOpsState,
  item: RetailOfflineSaleQueueItem,
  status: RetailOfflineSyncReceiptStatus,
  actorId: string,
  occurredAt: string,
  details: { evidenceReference?: string; syncedSaleId?: string; reason?: string } = {},
): RevenueOpsState {
  const receipt = {
    id: randomUUID(),
    queueItemId: item.id,
    transactionKey: item.transactionKey,
    status,
    actorId,
    occurredAt,
    attempt: item.attempts,
    queueVersion: item.version,
    payloadChecksum: item.payloadChecksum,
    evidenceReference: details.evidenceReference,
    syncedSaleId: details.syncedSaleId,
    reason: details.reason,
    scope: structuredClone(state.scope),
  };
  return { ...state, retailOfflineSyncReceipts: [...(state.retailOfflineSyncReceipts ?? []), receipt] };
}

function validateOfflineInput(input: CheckoutRetailSaleInput): CheckoutRetailSaleInput {
  clean(input.transactionKey, 'Offline transaction key');
  const voucherCode = input.voucherCode?.trim();
  if (Boolean(voucherCode) !== (input.voucherVersion !== undefined)) {
    throw new Error('Offline voucher code and version must be supplied together.');
  }
  if (voucherCode && (input.voucherVersion === undefined || !Number.isInteger(input.voucherVersion) || input.voucherVersion <= 0)) {
    throw new Error('Offline voucher version must be a positive integer.');
  }
  if (!Number.isFinite(Date.parse(input.saleAt))) throw new Error('Offline sale time must be a valid ISO timestamp.');
  if (!input.lines.length || input.lines.length > 100) throw new Error('Offline sale requires between 1 and 100 lines.');
  if (input.lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) throw new Error('Offline sale quantities must be positive.');
  if (!input.tenders.length || input.tenders.some((tender) => !Number.isFinite(tender.amount) || tender.amount < 0)) throw new Error('Offline sale tenders must be non-negative and include at least one tender.');
  const normalized = structuredClone(input);
  if (voucherCode) normalized.voucherCode = clean(voucherCode, 'Offline voucher code', 2, 64).toUpperCase();
  return normalized;
}

export function enqueueRetailOfflineSale(state: RevenueOpsState, input: CheckoutRetailSaleInput, actorId: string, now = new Date().toISOString(), id: string = randomUUID()): RevenueOpsState {
  const normalized = validateOfflineInput(input);
  const payloadChecksum = inputChecksum(normalized);
  const existing = state.retailOfflineSaleQueue.find((item) => item.transactionKey === normalized.transactionKey && sameScope(state, item));
  if (existing) {
    if (existing.payloadChecksum !== payloadChecksum) throw new Error('Offline transaction key was already used with a different payload.');
    return state;
  }
  const next = structuredClone(state);
  next.revision += 1;
  const item: RetailOfflineSaleQueueItem = {
    id,
    transactionKey: normalized.transactionKey,
    input: normalized,
    payloadChecksum,
    status: 'queued',
    queuedBy: actorId,
    queuedAt: now,
    attempts: 0,
    scope: structuredClone(next.scope),
    version: 1,
  };
  next.retailOfflineSaleQueue.unshift(item);
  return appendSyncReceipt(next, item, 'queued', actorId, now);
}

export function planRetailOfflineSync(state: RevenueOpsState, generatedAt = new Date().toISOString()): RetailOfflineSyncPlan {
  const plan: RetailOfflineSyncPlan = { generatedAt, ready: [], conflicts: [], synced: [], discarded: [] };
  for (const item of state.retailOfflineSaleQueue.filter((candidate) => sameScope(state, candidate))) {
    if (item.status === 'queued') plan.ready.push(item.id);
    else if (item.status === 'conflict') plan.conflicts.push(item.id);
    else if (item.status === 'synced') plan.synced.push(item.id);
    else if (item.status === 'discarded') plan.discarded.push(item.id);
  }
  return plan;
}

/**
 * Projects one completed local sale into the Hub's append-only event shape.
 * The projection is deliberately narrow: no credentials or renderer-only
 * state can cross the Store Edge boundary, and the caller supplies the
 * branch-local sequence allocated by its outbox coordinator.
 */
export function buildRetailHubStoreEdgeSaleEvent(
  sale: RetailSale,
  sequence: number,
  eventId = `retail-sale:${sale.id}:v${sale.version}`,
): RetailHubStoreEdgeSyncEvent {
  if (sale.status !== 'completed') throw new Error('Only a completed retail sale can be projected to the Retail Hub.');
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Retail Hub sale event sequence must be a positive safe integer.');
  const payload = buildRetailHubStoreEdgeSalePayload(sale);
  return {
    eventId,
    eventType: 'retail.sale.completed',
    aggregateId: sale.id,
    transactionKey: sale.transactionKey,
    sequence,
    producedAt: sale.completedAt ?? sale.saleAt,
    payloadChecksum: checksum(payload),
    payload,
  };
}

export function syncRetailOfflineSale(state: RevenueOpsState, input: SyncRetailOfflineSaleInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const item = state.retailOfflineSaleQueue.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!item || item.version !== input.expectedVersion) throw new Error('Offline sale queue item is stale or missing. Refresh before synchronizing.');
  if (item.status !== 'queued') throw new Error('Only queued offline sales can be synchronized.');
  const recoveryEvidenceReference = item.queuedBy === actorId
    ? undefined
    : clean(input.recoveryEvidenceReference ?? '', 'Offline store-recovery evidence reference', 8, 240);
  const syncMode = recoveryEvidenceReference ? 'recovery' as const : 'cashier' as const;
  let working = structuredClone(state);
  working.revision += 1;
  working.retailOfflineSaleQueue = working.retailOfflineSaleQueue.map((candidate) => candidate.id === item.id ? { ...candidate, status: 'syncing' as const, attempts: candidate.attempts + 1, lastAttemptAt: now, lastSyncActorId: actorId, lastSyncMode: syncMode, lastSyncEvidenceReference: recoveryEvidenceReference, version: candidate.version + 1 } : candidate);
  const syncingItem = working.retailOfflineSaleQueue.find((candidate) => candidate.id === item.id)!;
  working = appendSyncReceipt(working, syncingItem, 'syncing', actorId, now, { evidenceReference: recoveryEvidenceReference });
  if (inputChecksum(item.input) !== item.payloadChecksum) {
    const conflictReason = 'Offline payload checksum does not match persisted queue evidence.';
    const conflicted = { ...working, retailOfflineSaleQueue: working.retailOfflineSaleQueue.map((candidate) => candidate.id === item.id ? { ...candidate, status: 'conflict' as const, conflictReason, version: candidate.version + 1 } : candidate) };
    return appendSyncReceipt(conflicted, conflicted.retailOfflineSaleQueue.find((candidate) => candidate.id === item.id)!, 'conflict', actorId, now, { evidenceReference: recoveryEvidenceReference, reason: conflictReason });
  }
  try {
    working = checkoutRetailSale(working, item.input, actorId, now);
    const sale = working.retailSales.find((candidate) => candidate.transactionKey === item.transactionKey && sameScope(working, candidate));
    if (!sale) throw new Error('Checkout completed without a sale record.');
    const synced = { ...working, retailOfflineSaleQueue: working.retailOfflineSaleQueue.map((candidate) => candidate.id === item.id ? { ...candidate, status: 'synced' as const, syncedSaleId: sale.id, version: candidate.version + 1 } : candidate) };
    return appendSyncReceipt(synced, synced.retailOfflineSaleQueue.find((candidate) => candidate.id === item.id)!, 'synced', actorId, now, { evidenceReference: recoveryEvidenceReference, syncedSaleId: sale.id });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Offline sale synchronization failed.';
    const conflicted = { ...working, retailOfflineSaleQueue: working.retailOfflineSaleQueue.map((candidate) => candidate.id === item.id ? { ...candidate, status: 'conflict' as const, conflictReason: reason, version: candidate.version + 1 } : candidate) };
    return appendSyncReceipt(conflicted, conflicted.retailOfflineSaleQueue.find((candidate) => candidate.id === item.id)!, 'conflict', actorId, now, { evidenceReference: recoveryEvidenceReference, reason });
  }
}

/**
 * Runs a bounded background sync for the active cashier's queued sales.
 * Each item still passes through the normal idempotent checkout boundary; a
 * failure becomes an explicit conflict and does not stop later items.
 */
export function syncRetailOfflineQueue(state: RevenueOpsState, input: SyncRetailOfflineQueueInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) throw new Error('Offline sync batch limit must be an integer from 1 to 50.');
  const recoveryEvidenceReference = input.recoveryEvidenceReference
    ? clean(input.recoveryEvidenceReference, 'Offline store-recovery evidence reference', 8, 240)
    : undefined;
  const ids = state.retailOfflineSaleQueue
    .filter((item) => item.status === 'queued' && sameScope(state, item) && (item.queuedBy === actorId || Boolean(recoveryEvidenceReference)))
    .slice(0, input.limit)
    .map((item) => ({ id: item.id, expectedVersion: item.version }));
  let next = state;
  for (const item of ids) next = syncRetailOfflineSale(next, { ...item, recoveryEvidenceReference }, actorId, now);
  return next;
}

export function resolveRetailOfflineSale(state: RevenueOpsState, input: ResolveRetailOfflineSaleInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const item = state.retailOfflineSaleQueue.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!item || item.version !== input.expectedVersion || item.status !== 'conflict') throw new Error('Only the current offline conflict can be resolved.');
  if (item.queuedBy === actorId) throw new Error('The cashier who queued an offline sale cannot resolve its conflict; an independent supervisor is required.');
  const reason = clean(input.reason, 'Offline conflict resolution reason', 4, 240);
  const resolutionEvidenceReference = clean(input.recoveryEvidenceReference, 'Offline conflict recovery evidence reference', 8, 240);
  const next = structuredClone(state);
  next.revision += 1;
  next.retailOfflineSaleQueue = next.retailOfflineSaleQueue.map((candidate) => candidate.id === item.id ? {
    ...candidate,
    status: input.resolution === 'requeue' ? 'queued' as const : 'discarded' as const,
    conflictReason: undefined,
    resolvedBy: actorId,
    resolvedAt: now,
    resolutionReason: reason,
    resolutionEvidenceReference,
    version: candidate.version + 1,
  } : candidate);
  const resolved = next.retailOfflineSaleQueue.find((candidate) => candidate.id === item.id)!;
  return appendSyncReceipt(next, resolved, input.resolution === 'requeue' ? 'requeued' : 'discarded', actorId, now, { evidenceReference: resolutionEvidenceReference, reason });
}
