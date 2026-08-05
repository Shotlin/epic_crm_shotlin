import { randomUUID } from 'node:crypto';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { CreateRetailCommerceConflictResolutionInput, DecideRetailCommerceConflictResolutionInput, RetailCommerceConflictResolution } from '../shared/retail-commerce-contracts';

const kinds = new Set(['connector-not-certified', 'sync-failed', 'sync-exceptions', 'sync-pending', 'sync-cursor-replay', 'duplicate-remote-order', 'order-status-conflict', 'order-not-handed-off', 'return-evidence-gap', 'settlement-variance', 'settlement-pending']);
const syncKinds = new Set(['sync-failed', 'sync-exceptions', 'sync-pending', 'sync-cursor-replay']);
const mutate = (state: RevenueOpsState) => ({ ...structuredClone(state), revision: state.revision + 1 });
const scoped = (state: RevenueOpsState, record?: { scope?: RevenueOpsState['scope'] }) => {
  const scope = record?.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};
const evidence = (value: string, label: string) => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 4 || normalized.length > 500) throw new Error(`${label} must contain 4-500 characters.`);
  return normalized;
};
const checksumForSource = (state: RevenueOpsState, kind: string, sourceId: string, connectorId: string): string | undefined => {
  if (syncKinds.has(kind)) {
    const run = state.retailCommerceSyncRuns.find((item) => item.id === sourceId && item.connectorId === connectorId && scoped(state, item));
    return run?.responseChecksum ?? run?.requestChecksum;
  }
  if (kind === 'order-status-conflict') {
    const order = state.retailCommerceOrders.find((item) => item.id === sourceId && item.connectorId === connectorId && scoped(state, item));
    return order?.remoteStatusChecksum ?? order?.remotePayloadChecksum;
  }
  if (kind.includes('order') || kind === 'return-evidence-gap') return state.retailCommerceOrders.find((item) => item.id === sourceId && item.connectorId === connectorId && scoped(state, item))?.remotePayloadChecksum;
  if (kind.includes('settlement')) return state.retailSettlementReconciliations.find((item) => item.id === sourceId && item.connectorId === connectorId && scoped(state, item))?.remotePayloadChecksum;
  return undefined;
};

export function createRetailCommerceConflictResolution(state: RevenueOpsState, input: CreateRetailCommerceConflictResolutionInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  if (!kinds.has(input.kind)) throw new Error('Unsupported retail channel conflict kind.');
  if (input.decision === 'retry' && !syncKinds.has(input.kind)) throw new Error('Retry resolution is only valid for provider sync conflicts.');
  const connector = state.retailCommerceConnectors.find((item) => item.id === input.connectorId && scoped(state, item));
  if (!connector) throw new Error('Conflict connector is unavailable in the current branch.');
  const sourceMatches = input.kind === 'connector-not-certified'
    ? connector.id === input.sourceId
    : syncKinds.has(input.kind)
      ? state.retailCommerceSyncRuns.some((run) => run.id === input.sourceId && run.connectorId === connector.id && scoped(state, run))
      : input.kind.includes('order') || input.kind === 'return-evidence-gap'
        ? state.retailCommerceOrders.some((order) => order.id === input.sourceId && order.connectorId === connector.id && scoped(state, order))
        : state.retailSettlementReconciliations.some((settlement) => settlement.id === input.sourceId && settlement.connectorId === connector.id && scoped(state, settlement));
  if (!sourceMatches) throw new Error('Conflict source does not belong to the declared connector and scope.');
  const sourcePayloadChecksum = checksumForSource(state, input.kind, input.sourceId, connector.id);
  if (['duplicate-remote-order', 'order-status-conflict', 'order-not-handed-off', 'return-evidence-gap', 'settlement-variance', 'settlement-pending'].includes(input.kind) && !sourcePayloadChecksum) throw new Error('Conflict resolution requires the source provider payload checksum.');
  if (state.retailCommerceConflictResolutions.some((resolution) => resolution.conflictId === input.conflictId && resolution.status !== 'rejected' && scoped(state, resolution))) throw new Error('This conflict already has an active resolution pack.');
  const next = mutate(state);
  const resolution: RetailCommerceConflictResolution = { id, conflictId: input.conflictId.trim(), kind: input.kind, sourceId: input.sourceId, connectorId: connector.id, decision: input.decision, status: 'prepared', sourcePayloadChecksum, requestedBy: actorId, requestedAt: now, evidence: evidence(input.evidence, 'Conflict resolution evidence'), scope: structuredClone(next.scope), version: 1 };
  next.retailCommerceConflictResolutions.unshift(resolution);
  return next;
}

export function decideRetailCommerceConflictResolution(state: RevenueOpsState, input: DecideRetailCommerceConflictResolutionInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const resolution = state.retailCommerceConflictResolutions.find((item) => item.id === input.id && item.status === 'prepared' && scoped(state, item));
  if (!resolution || resolution.version !== input.expectedVersion) throw new Error('Conflict resolution pack is stale or already decided.');
  if (resolution.requestedBy === actorId) throw new Error('Conflict-resolution maker cannot decide the same pack.');
  const currentSourceChecksum = checksumForSource(state, resolution.kind, resolution.sourceId, resolution.connectorId);
  if (resolution.sourcePayloadChecksum && currentSourceChecksum !== resolution.sourcePayloadChecksum) throw new Error('Conflict source provider evidence changed; prepare a fresh resolution pack.');
  if (['duplicate-remote-order', 'order-status-conflict', 'order-not-handed-off', 'return-evidence-gap', 'settlement-variance', 'settlement-pending'].includes(resolution.kind) && !currentSourceChecksum) throw new Error('Conflict approval requires the current source provider payload checksum.');
  const next = mutate(state);
  const decisionEvidence = evidence(input.evidence, 'Conflict decision evidence');
  next.retailCommerceConflictResolutions = next.retailCommerceConflictResolutions.map((item) => item.id === resolution.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionEvidence, version: item.version + 1 } : item);
  // Keep the approved disposition on the affected source record. This makes
  // “accepted” and “waived” settlement/order outcomes auditable instead of
  // merely disappearing from the health queue; retry keeps the old run linked
  // to the new run created by the main-process store.
  const sourceMeta = { channelConflictResolutionId: resolution.id, channelConflictDecision: resolution.decision, channelConflictResolvedBy: actorId, channelConflictResolvedAt: now, channelConflictResolutionEvidence: decisionEvidence };
  if (syncKinds.has(resolution.kind)) next.retailCommerceSyncRuns = next.retailCommerceSyncRuns.map((run) => run.id === resolution.sourceId ? { ...run, ...sourceMeta } : run);
  else if (resolution.kind.includes('order') || resolution.kind === 'return-evidence-gap') next.retailCommerceOrders = next.retailCommerceOrders.map((order) => order.id === resolution.sourceId ? { ...order, ...sourceMeta } : order);
  else if (resolution.kind.includes('settlement')) next.retailSettlementReconciliations = next.retailSettlementReconciliations.map((settlement) => settlement.id === resolution.sourceId ? { ...settlement, ...sourceMeta } : settlement);
  return next;
}
