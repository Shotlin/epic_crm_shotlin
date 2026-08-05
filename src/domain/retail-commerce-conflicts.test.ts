import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { configureRetailCommerceCredentials, createRetailCommerceConnector, createRetailCommerceSyncRun, createRetailSettlementReconciliation, importRetailCommerceOrder } from './retail-commerce';
import { createRetailCommerceConflictResolution, decideRetailCommerceConflictResolution } from './retail-commerce-conflicts';
import { computeRetailChannelHealth } from './retail-channel-health';
import { createInventoryItem, createItemVariant } from './inventory-warehouse';

const checksum = 'a'.repeat(64);
const connectorId = '00000000-0000-4000-8000-000000000051';
const runId = '00000000-0000-4000-8000-000000000052';
const resolutionId = '00000000-0000-4000-8000-000000000053';

describe('retail channel conflict resolution', () => {
  it('requires a scoped source and independent approval before hiding a queue conflict', () => {
    let state = createInitialRevenueOpsState();
    state = createRetailCommerceConnector(state, { code: 'CONFLICT-OPS', name: 'Conflict operations', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull'] }, 'maker', connectorId, '2026-07-31T11:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId, fingerprint: checksum });
    state = createRetailCommerceSyncRun(state, { connectorId, kind: 'orders', requestChecksum: checksum }, 'maker', runId, '2026-07-31T11:01:00.000Z');
    const conflictId = `sync-pending:${runId}`;
    expect(() => createRetailCommerceConflictResolution(state, { conflictId, kind: 'sync-pending', sourceId: runId, connectorId, decision: 'retry', evidence: 'Retry queued after provider timeout review' }, 'maker', resolutionId)).not.toThrow();
    state = createRetailCommerceConflictResolution(state, { conflictId, kind: 'sync-pending', sourceId: runId, connectorId, decision: 'retry', evidence: 'Retry queued after provider timeout review' }, 'maker', resolutionId, '2026-07-31T11:02:00.000Z');
    expect(state.retailCommerceConflictResolutions[0]).toMatchObject({ sourcePayloadChecksum: checksum });
    expect(computeRetailChannelHealth({ connectors: state.retailCommerceConnectors, syncRuns: state.retailCommerceSyncRuns, orders: state.retailCommerceOrders, settlements: state.retailSettlementReconciliations, resolutions: state.retailCommerceConflictResolutions }).openConflictCount).toBe(2);
    expect(() => decideRetailCommerceConflictResolution(state, { id: resolutionId, decision: 'approved', evidence: 'maker cannot approve own retry', expectedVersion: 1 }, 'maker')).toThrow('maker');
    state = decideRetailCommerceConflictResolution(state, { id: resolutionId, decision: 'approved', evidence: 'Operations reviewer approved provider retry disposition', expectedVersion: 1 }, 'checker');
    expect(state.retailCommerceSyncRuns.find((run) => run.id === runId)).toMatchObject({ channelConflictResolutionId: resolutionId, channelConflictDecision: 'retry', channelConflictResolvedBy: 'checker', channelConflictResolutionEvidence: 'Operations reviewer approved provider retry disposition' });
    expect(computeRetailChannelHealth({ connectors: state.retailCommerceConnectors, syncRuns: state.retailCommerceSyncRuns, orders: state.retailCommerceOrders, settlements: state.retailSettlementReconciliations, resolutions: state.retailCommerceConflictResolutions }).openConflictCount).toBe(1);
  });

  it('refuses to prepare an order conflict resolution when provider payload evidence is missing', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, products: [{ id: 'product-conflict', sku: 'CONFLICT-TEA', name: 'Conflict tea', description: 'Retail item', kind: 'goods', uom: 'KG', taxCodeId: 'tax-default', effectiveFrom: '2026-04-01', active: true, version: 1 }] };
    state = createInventoryItem(state, { productId: 'product-conflict', code: 'CONFLICT-TEA', name: 'Conflict tea', baseUomId: 'uom-kg', tracking: 'batch', valuationMethod: 'fifo' }, 'item-conflict');
    state = createItemVariant(state, { itemId: 'item-conflict', sku: 'CONFLICT-TEA-REG', name: 'Conflict tea regular', attributes: { pack: '1kg' } }, 'variant-conflict');
    state = createRetailCommerceConnector(state, { code: 'CONFLICT-ORDER', name: 'Order conflict operations', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull'] }, 'maker', connectorId, '2026-07-31T11:10:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId, fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId, remoteOrderId: 'REMOTE-NO-CHECKSUM', orderNumber: 'MKT-NO-CHECKSUM', remoteCreatedAt: '2026-07-31T11:11:00.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-conflict', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'operator', '00000000-0000-4000-8000-000000000054', '2026-07-31T11:11:00.000Z');
    state = { ...state, retailCommerceOrders: state.retailCommerceOrders.map((order) => ({ ...order, remotePayloadChecksum: '' })) };
    expect(() => createRetailCommerceConflictResolution(state, { conflictId: 'order-not-handed-off:00000000-0000-4000-8000-000000000054', kind: 'order-not-handed-off', sourceId: '00000000-0000-4000-8000-000000000054', connectorId, decision: 'accepted', evidence: 'Order ownership reviewed without provider checksum' }, 'maker', '00000000-0000-4000-8000-000000000055')).toThrow(/payload checksum/i);
  });

  it('binds status-conflict approval to the latest remote-status checksum', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, products: [{ id: 'product-status', sku: 'STATUS-TEA', name: 'Status tea', description: 'Retail item', kind: 'goods', uom: 'KG', taxCodeId: 'tax-default', effectiveFrom: '2026-04-01', active: true, version: 1 }] };
    state = createInventoryItem(state, { productId: 'product-status', code: 'STATUS-TEA', name: 'Status tea', baseUomId: 'uom-kg', tracking: 'batch', valuationMethod: 'fifo' }, 'item-status');
    state = createItemVariant(state, { itemId: 'item-status', sku: 'STATUS-TEA-REG', name: 'Status tea regular', attributes: { pack: '1kg' } }, 'variant-status');
    state = createRetailCommerceConnector(state, { code: 'STATUS-CONFLICT', name: 'Status conflict operations', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull'] }, 'maker', connectorId, '2026-07-31T11:15:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId, fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId, remoteOrderId: 'REMOTE-STATUS-CONFLICT', orderNumber: 'MKT-STATUS-CONFLICT', remoteCreatedAt: '2026-07-31T11:16:00.000Z', remotePayloadChecksum: checksum, remoteStatus: 'cancelled', remoteStatusEvidence: 'Provider cancellation evidence', remoteStatusChecksum: 'c'.repeat(64), lines: [{ itemVariantId: 'variant-status', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'operator', '00000000-0000-4000-8000-000000000056', '2026-07-31T11:16:00.000Z');
    state = createRetailCommerceConflictResolution(state, { conflictId: 'order-status-conflict:00000000-0000-4000-8000-000000000056', kind: 'order-status-conflict', sourceId: '00000000-0000-4000-8000-000000000056', connectorId, decision: 'accepted', evidence: 'Provider cancellation is queued for governed local transition.' }, 'maker', '00000000-0000-4000-8000-000000000057');
    expect(state.retailCommerceConflictResolutions[0]).toMatchObject({ kind: 'order-status-conflict', sourcePayloadChecksum: 'c'.repeat(64) });
  });

  it('records an approved settlement exception disposition on the settlement source', () => {
    let state = createInitialRevenueOpsState();
    const settlementConnectorId = '00000000-0000-4000-8000-000000000061';
    const settlementId = '00000000-0000-4000-8000-000000000062';
    state = createRetailCommerceConnector(state, { code: 'SETTLE-OPS', name: 'Settlement exception operations', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://settlement.example', capabilities: ['settlement-pull'] }, 'maker', settlementConnectorId, '2026-07-31T11:20:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: settlementConnectorId, fingerprint: checksum });
    state = createRetailSettlementReconciliation(state, { connectorId: settlementConnectorId, settlementReference: 'SETTLE-EX-1', periodFrom: '2026-07-30', periodTo: '2026-07-31', grossAmount: 1000, feeAmount: 40, taxWithheldAmount: 0, localNetAmount: 900, orderIds: [], remotePayloadChecksum: checksum }, 'maker', settlementId, '2026-07-31T11:21:00.000Z');
    state = createRetailCommerceConflictResolution(state, { conflictId: `settlement-variance:${settlementId}`, kind: 'settlement-variance', sourceId: settlementId, connectorId: settlementConnectorId, decision: 'accepted', evidence: 'Provider fee variance accepted for documented settlement exception.' }, 'maker', '00000000-0000-4000-8000-000000000063', '2026-07-31T11:22:00.000Z');
    state = decideRetailCommerceConflictResolution(state, { id: '00000000-0000-4000-8000-000000000063', decision: 'approved', evidence: 'Finance reviewer approved exception treatment with variance evidence.', expectedVersion: 1 }, 'checker', '2026-07-31T11:23:00.000Z');
    expect(state.retailSettlementReconciliations.find((settlement) => settlement.id === settlementId)).toMatchObject({ channelConflictResolutionId: '00000000-0000-4000-8000-000000000063', channelConflictDecision: 'accepted', channelConflictResolvedBy: 'checker' });
  });
});
