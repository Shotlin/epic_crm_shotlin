import type {
  RetailCommerceConflictResolution,
  RetailCommerceConnector,
  RetailCommerceOrder,
  RetailCommerceSyncRun,
  RetailSettlementReconciliation,
} from '../shared/retail-commerce-contracts';

export type RetailChannelConflictKind =
  | 'connector-not-certified'
  | 'sync-failed'
  | 'sync-exceptions'
  | 'sync-pending'
  | 'sync-cursor-replay'
  | 'duplicate-remote-order'
  | 'order-status-conflict'
  | 'order-not-handed-off'
  | 'return-evidence-gap'
  | 'settlement-variance'
  | 'settlement-pending';

export type RetailChannelConflictSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface RetailChannelConflict {
  id: string;
  kind: RetailChannelConflictKind;
  severity: RetailChannelConflictSeverity;
  connectorId: string;
  connectorCode: string;
  channel: RetailCommerceConnector['channel'];
  sourceId: string;
  sourceType: 'connector' | 'sync-run' | 'order' | 'settlement';
  title: string;
  detail: string;
  suggestedAction: string;
  occurredAt: string;
}

export interface RetailChannelHealthReport {
  generatedAt: string;
  connectorCount: number;
  certifiedConnectorCount: number;
  syncRunCount: number;
  orderCount: number;
  settlementCount: number;
  settlementVarianceTotal: number;
  openConflictCount: number;
  conflicts: RetailChannelConflict[];
}

export interface RetailChannelHealthInput {
  connectors: RetailCommerceConnector[];
  syncRuns: RetailCommerceSyncRun[];
  orders: RetailCommerceOrder[];
  settlements: RetailSettlementReconciliation[];
  resolutions?: RetailCommerceConflictResolution[];
  generatedAt?: string;
}

const severityRank: Record<RetailChannelConflictSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const money = (value: number): number => Math.round(value * 100) / 100;

function addConflict(conflicts: RetailChannelConflict[], conflict: RetailChannelConflict): void {
  conflicts.push(conflict);
}

export function computeRetailChannelHealth({ connectors, syncRuns, orders, settlements, resolutions = [], generatedAt = new Date().toISOString() }: RetailChannelHealthInput): RetailChannelHealthReport {
  const connectorById = new Map(connectors.map((connector) => [connector.id, connector]));
  const conflicts: RetailChannelConflict[] = [];
  const connectorLabel = (connectorId: string) => {
    const connector = connectorById.get(connectorId);
    return { connectorId, connectorCode: connector?.code ?? connectorId, channel: connector?.channel ?? 'marketplace' as const };
  };

  connectors.forEach((connector) => {
    if (connector.status === 'certified' && connector.credentialStatus === 'configured') return;
    const severity: RetailChannelConflictSeverity = connector.status === 'suspended' ? 'critical' : connector.credentialStatus === 'missing' ? 'high' : 'medium';
    addConflict(conflicts, { id: `connector-not-certified:${connector.id}`, kind: 'connector-not-certified', severity, connectorId: connector.id, connectorCode: connector.code, channel: connector.channel, sourceId: connector.id, sourceType: 'connector', title: `${connector.code} is not production-certified`, detail: `${connector.name} is ${connector.status} with ${connector.credentialStatus} credentials in ${connector.environment}.`, suggestedAction: connector.credentialStatus === 'missing' ? 'Configure protected credentials, then complete the declared sandbox or production conformance pack.' : 'Complete independent conformance evidence before accepting remote outcomes.', occurredAt: connector.lastSyncAt ?? connector.createdAt });
  });

  syncRuns.forEach((run) => {
    const connector = connectorLabel(run.connectorId);
    if (run.status === 'failed') addConflict(conflicts, { id: `sync-failed:${run.id}`, kind: 'sync-failed', severity: 'critical', ...connector, sourceId: run.id, sourceType: 'sync-run', title: `${run.number} failed`, detail: `${run.kind} sync failed after reading ${run.recordsRead} record${run.recordsRead === 1 ? '' : 's'}.`, suggestedAction: 'Review the provider response evidence and retry only with a new idempotent request checksum.', occurredAt: run.completedAt ?? run.requestedAt });
    else if (run.status === 'completed-with-exceptions') addConflict(conflicts, { id: `sync-exceptions:${run.id}`, kind: 'sync-exceptions', severity: 'high', ...connector, sourceId: run.id, sourceType: 'sync-run', title: `${run.number} completed with exceptions`, detail: `${run.recordsRejected} record${run.recordsRejected === 1 ? '' : 's'} were rejected during ${run.kind} sync.`, suggestedAction: 'Resolve rejected records against the provider payload before the next push or pull.', occurredAt: run.completedAt ?? run.requestedAt });
    else if (run.status === 'prepared') addConflict(conflicts, { id: `sync-pending:${run.id}`, kind: 'sync-pending', severity: 'medium', ...connector, sourceId: run.id, sourceType: 'sync-run', title: `${run.number} awaits provider response`, detail: `${run.kind} handoff is prepared with ${run.recordsRead} record${run.recordsRead === 1 ? '' : 's'} declared.`, suggestedAction: 'Record the provider response or explicitly fail the handoff; do not infer acceptance locally.', occurredAt: run.requestedAt });
  });

  // A repeated provider cursor may be a harmless no-op, but it can also mean
  // that the adapter replayed an already-consumed page. Surface it for review
  // before operators treat the pull as a fresh page of authoritative data.
  const successfulCursorSeen = new Map<string, string>();
  syncRuns
    .filter((run) => run.status === 'completed' || run.status === 'completed-with-exceptions')
    .sort((left, right) => (left.completedAt ?? left.requestedAt).localeCompare(right.completedAt ?? right.requestedAt))
    .forEach((run) => {
      const cursor = run.remoteCursor?.trim();
      if (!cursor) return;
      const key = `${run.connectorId}:${run.kind}`;
      if (successfulCursorSeen.get(key) === cursor) {
        const connector = connectorLabel(run.connectorId);
        addConflict(conflicts, { id: `sync-cursor-replay:${run.id}`, kind: 'sync-cursor-replay', severity: 'high', ...connector, sourceId: run.id, sourceType: 'sync-run', title: `${run.number} repeated provider cursor`, detail: `The ${run.kind} pull reused cursor ${cursor.slice(0, 80)} for ${connector.connectorCode}; the page may already have been consumed.`, suggestedAction: 'Compare request and response checksums with the prior run, then approve a retry or document the provider no-op.', occurredAt: run.completedAt ?? run.requestedAt });
      }
      successfulCursorSeen.set(key, cursor);
    });

  const duplicateKeys = new Set(orders.map((order) => `${order.connectorId}|${order.remoteOrderId}`).filter((key, index, all) => all.indexOf(key) !== index));
  orders.forEach((order) => {
    const connector = connectorLabel(order.connectorId);
    const key = `${order.connectorId}|${order.remoteOrderId}`;
    if (duplicateKeys.has(key)) addConflict(conflicts, { id: `duplicate-remote-order:${order.id}`, kind: 'duplicate-remote-order', severity: 'critical', ...connector, sourceId: order.id, sourceType: 'order', title: `Duplicate remote order ${order.remoteOrderId}`, detail: `${order.orderNumber} appears more than once for connector ${connector.connectorCode}; local stock must not be fulfilled twice.`, suggestedAction: 'Compare payload checksums, retain one canonical import, and record an independent duplicate-resolution decision.', occurredAt: order.importedAt });
    if (order.remoteStatus && ['fulfilled', 'cancelled', 'returned', 'rto'].includes(order.remoteStatus) && order.remoteStatus !== order.status) addConflict(conflicts, { id: `order-status-conflict:${order.id}`, kind: 'order-status-conflict', severity: 'critical', ...connector, sourceId: order.id, sourceType: 'order', title: `${order.orderNumber} has a provider/local status conflict`, detail: `Provider reports ${order.remoteStatus}, while the governed local lifecycle remains ${order.status}. Stock, GST, and return evidence were not overwritten.`, suggestedAction: 'Review the provider evidence and apply the allowed local lifecycle transition, or document an independent conflict decision.', occurredAt: order.remoteStatusUpdatedAt ?? order.importedAt });
    if (['imported', 'confirmed', 'fulfilled'].includes(order.status) && !order.localSalesOrderId) addConflict(conflicts, { id: `order-not-handed-off:${order.id}`, kind: 'order-not-handed-off', severity: order.status === 'fulfilled' ? 'high' : 'medium', ...connector, sourceId: order.id, sourceType: 'order', title: `${order.orderNumber} has no local sales-order handoff`, detail: `Remote order is ${order.status} but has no governed local sales-order reference.`, suggestedAction: 'Map the remote order to a local sales order before fulfilment or document why the channel order is intentionally excluded.', occurredAt: order.importedAt });
    if (['returned', 'rto'].includes(order.status) && (!order.retailReturnId || !order.creditNoteReconciliationId || !order.inventoryEvidenceReference)) addConflict(conflicts, { id: `return-evidence-gap:${order.id}`, kind: 'return-evidence-gap', severity: 'high', ...connector, sourceId: order.id, sourceType: 'order', title: `${order.orderNumber} is ${order.status} without a complete evidence bridge`, detail: 'The remote return/RTO lacks one or more local return, GST credit-note, or inventory evidence references.', suggestedAction: 'Link an approved local return, reconciled GST credit-note workpaper, and posted inventory evidence before closing the channel case.', occurredAt: order.statusUpdatedAt ?? order.importedAt });
  });

  settlements.forEach((settlement) => {
    const connector = connectorLabel(settlement.connectorId);
    if (settlement.status === 'variance-review') addConflict(conflicts, { id: `settlement-variance:${settlement.id}`, kind: 'settlement-variance', severity: 'critical', ...connector, sourceId: settlement.id, sourceType: 'settlement', title: `${settlement.settlementReference} has settlement variance`, detail: `Remote net ${money(settlement.netAmount)} differs from local net ${money(settlement.localNetAmount)} by ${money(settlement.varianceAmount)} INR.`, suggestedAction: 'Reconcile fees, TDS/TCS, refunds, and order membership, then record an independent resolution.', occurredAt: settlement.requestedAt });
    else if (settlement.status === 'prepared') addConflict(conflicts, { id: `settlement-pending:${settlement.id}`, kind: 'settlement-pending', severity: 'medium', ...connector, sourceId: settlement.id, sourceType: 'settlement', title: `${settlement.settlementReference} awaits reconciliation`, detail: `Settlement for ${settlement.periodFrom} to ${settlement.periodTo} has not received authoritative provider evidence.`, suggestedAction: 'Pull the provider settlement response and reconcile it against imported order and fee evidence.', occurredAt: settlement.requestedAt });
  });

  const approvedResolutionIds = new Set(resolutions.filter((resolution) => resolution.status === 'approved').map((resolution) => resolution.conflictId));
  const visibleConflicts = conflicts.filter((conflict) => !approvedResolutionIds.has(conflict.id));
  visibleConflicts.sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id));
  return { generatedAt, connectorCount: connectors.length, certifiedConnectorCount: connectors.filter((connector) => connector.status === 'certified' && connector.credentialStatus === 'configured').length, syncRunCount: syncRuns.length, orderCount: orders.length, settlementCount: settlements.length, settlementVarianceTotal: money(settlements.filter(({ status }) => status === 'variance-review').reduce((total, settlement) => total + Math.abs(settlement.varianceAmount), 0)), openConflictCount: visibleConflicts.length, conflicts: visibleConflicts };
}
