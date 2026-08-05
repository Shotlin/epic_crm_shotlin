import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createInventoryItem, createItemVariant } from './inventory-warehouse';
import { configureRetailCommerceCredentials, createRetailCommerceConnector, createRetailSettlementReconciliation, importRetailCommerceOrder, decideRetailSettlementReconciliation } from './retail-commerce';
import { transitionRetailCommerceOrder } from './retail-commerce-advanced';
import { createRetailSettlementAllocationPack, decideRetailSettlementAllocationPack, proposeRetailSettlementAllocations } from './retail-settlement-allocation';

const checksum = 'a'.repeat(64);
const connectorId = '00000000-0000-4000-8000-000000000041';
const orderId = '00000000-0000-4000-8000-000000000042';
const settlementId = '00000000-0000-4000-8000-000000000043';
const packId = '00000000-0000-4000-8000-000000000044';

describe('retail settlement allocation evidence', () => {
  it('proposes aggregate RTO refunds only against returned orders and preserves provider totals', () => {
    let state = createInitialRevenueOpsState();
    state = {
      ...state,
      retailCommerceConnectors: [{ id: connectorId, code: 'RTO-PROPOSAL', name: 'RTO proposal connector', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['settlement-pull'], credentialStatus: 'configured', status: 'configured', createdBy: 'maker', createdAt: '2026-07-31T09:00:00.000Z', version: 1, scope: state.scope }],
      retailCommerceOrders: [
        { id: orderId, connectorId, remoteOrderId: 'REMOTE-RTO-PROPOSAL', orderNumber: 'MKT-RTO-PROPOSAL', status: 'rto', lines: [], totalAmount: 105, remoteCreatedAt: '2026-07-31T09:01:00.000Z', remotePayloadChecksum: checksum, importedBy: 'maker', importedAt: '2026-07-31T09:01:00.000Z', statusUpdatedBy: 'checker', statusUpdatedAt: '2026-07-31T09:02:00.000Z', statusEvidence: 'Carrier RTO scan', rtoReference: 'RTO-PROPOSAL-1', retailReturnId: 'return-rto-proposal', creditNoteReconciliationId: 'credit-rto-proposal', inventoryEvidenceReference: 'inventory-rto-proposal', version: 2, scope: state.scope },
      ],
      retailSettlementReconciliations: [{ id: settlementId, number: 'RSET/26-27/00001', connectorId, settlementReference: 'RTO-PROPOSAL-SETTLE', periodFrom: '2026-07-30', periodTo: '2026-07-31', grossAmount: 105, refundAmount: 20, feeAmount: 5, taxWithheldAmount: 0, netAmount: 80, localNetAmount: 80, varianceAmount: 0, orderIds: [orderId], remotePayloadChecksum: checksum, status: 'matched', requestedBy: 'maker', requestedAt: '2026-07-31T09:03:00.000Z', version: 1, scope: state.scope }],
    };
    const proposal = proposeRetailSettlementAllocations(state, settlementId);
    expect(proposal).toEqual([{ orderId, grossAmount: 105, refundAmount: 20, feeAmount: 5, taxWithheldAmount: 0, netAmount: 80 }]);
  });

  it('requires an approved order allocation pack before variance resolution', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, products: [{ id: 'product-tea', sku: 'TEA-1KG', name: 'Assam tea', description: 'Retail grocery item', kind: 'goods', uom: 'KG', taxCodeId: 'tax-default', effectiveFrom: '2026-04-01', active: true, version: 1 }] };
    state = createInventoryItem(state, { productId: 'product-tea', code: 'TEA-1KG', name: 'Assam tea', baseUomId: 'uom-kg', tracking: 'batch', valuationMethod: 'fifo' }, 'item-tea');
    state = createItemVariant(state, { itemId: 'item-tea', sku: 'TEA-1KG-REG', name: 'Assam tea regular', attributes: { pack: '1kg' } }, 'variant-tea');
    state = createRetailCommerceConnector(state, { code: 'SETTLE-ALLOC', name: 'Settlement allocation connector', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull', 'settlement-pull'] }, 'maker', connectorId, '2026-07-31T10:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId, fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId, remoteOrderId: 'REMOTE-1', orderNumber: 'MKT-1', remoteCreatedAt: '2026-07-31T10:01:00.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-tea', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'operator', orderId, '2026-07-31T10:01:00.000Z');
    state = createRetailSettlementReconciliation(state, { connectorId, settlementReference: 'SETTLE-1', periodFrom: '2026-07-30', periodTo: '2026-07-31', grossAmount: 105, feeAmount: 0, taxWithheldAmount: 0, localNetAmount: 100, orderIds: [orderId], remotePayloadChecksum: checksum }, 'maker', settlementId, '2026-07-31T10:02:00.000Z');
    expect(() => decideRetailSettlementReconciliation(state, { id: settlementId, decision: 'resolved', evidence: 'No allocation pack', expectedVersion: 1 }, 'checker')).toThrow('allocation pack');
    expect(() => createRetailSettlementAllocationPack(state, { settlementId, allocations: [{ orderId: 'unrelated-order', grossAmount: 105, refundAmount: 0, feeAmount: 0, taxWithheldAmount: 0, netAmount: 105 }] }, 'maker')).toThrow('every provider-linked order');
    state = createRetailSettlementAllocationPack(state, { settlementId, allocations: [{ orderId, grossAmount: 105, refundAmount: 0, feeAmount: 0, taxWithheldAmount: 0, netAmount: 105 }] }, 'maker', packId, '2026-07-31T10:03:00.000Z');
    expect(() => decideRetailSettlementAllocationPack(state, { id: packId, decision: 'approved', evidence: 'Order membership and settlement total independently checked', expectedVersion: 1 }, 'maker')).toThrow('maker');
    expect(() => decideRetailSettlementAllocationPack(state, { id: packId, decision: 'approved', evidence: 'Order membership and settlement total independently checked', expectedVersion: 1 }, 'checker', '2026-07-31T10:04:00.000Z')).toThrow(/terminal/i);
    state = { ...state, retailCommerceOrders: state.retailCommerceOrders.map((order) => order.id === orderId ? { ...order, status: 'fulfilled' as const, statusUpdatedBy: 'operator', statusUpdatedAt: '2026-07-31T10:04:30.000Z', statusEvidence: 'Carrier delivery confirmation' } : order) };
    state = decideRetailSettlementAllocationPack(state, { id: packId, decision: 'approved', evidence: 'Order membership and settlement total independently checked', expectedVersion: 1 }, 'checker', '2026-07-31T10:04:45.000Z');
    state = decideRetailSettlementReconciliation(state, { id: settlementId, decision: 'resolved', evidence: 'Approved order allocation pack reconciles marketplace payout', expectedVersion: 2 }, 'checker', '2026-07-31T10:05:00.000Z');
    expect(state.retailSettlementReconciliations[0]).toMatchObject({ status: 'resolved', allocationPackId: packId });
  });

  it('does not approve an RTO settlement allocation that hides the provider refund', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, products: [{ id: 'product-rto-tea', sku: 'RTO-TEA-1KG', name: 'Assam tea', description: 'Retail grocery item', kind: 'goods', uom: 'KG', taxCodeId: 'tax-default', effectiveFrom: '2026-04-01', active: true, version: 1 }] };
    state = createInventoryItem(state, { productId: 'product-rto-tea', code: 'RTO-TEA-1KG', name: 'Assam tea', baseUomId: 'uom-kg', tracking: 'batch', valuationMethod: 'fifo' }, 'item-rto-tea');
    state = createItemVariant(state, { itemId: 'item-rto-tea', sku: 'RTO-TEA-1KG-REG', name: 'Assam tea regular', attributes: { pack: '1kg' } }, 'variant-rto-tea');
    state = createRetailCommerceConnector(state, { code: 'RTO-ALLOC', name: 'RTO allocation connector', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull', 'settlement-pull'] }, 'maker', connectorId, '2026-07-31T12:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId, fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId, remoteOrderId: 'REMOTE-RTO-1', orderNumber: 'MKT-RTO-1', remoteCreatedAt: '2026-07-31T12:01:00.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-rto-tea', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'operator', orderId, '2026-07-31T12:01:00.000Z');
    state = transitionRetailCommerceOrder(state, { id: orderId, status: 'confirmed', evidence: 'Marketplace confirmation callback', expectedVersion: 1 }, 'operator', '2026-07-31T12:01:30.000Z');
    state = transitionRetailCommerceOrder(state, { id: orderId, status: 'rto', rtoReference: 'RTO-ALLOC-1', evidence: 'Carrier RTO scan callback', expectedVersion: 2 }, 'operator', '2026-07-31T12:02:00.000Z');
    state = { ...state, retailCommerceOrders: state.retailCommerceOrders.map((order) => order.id === orderId ? { ...order, retailReturnId: 'return-rto-1', creditNoteReconciliationId: 'credit-note-rto-1', inventoryEvidenceReference: 'inventory-rto-1' } : order) };
    state = createRetailSettlementReconciliation(state, { connectorId, settlementReference: 'RTO-SETTLE-1', periodFrom: '2026-07-30', periodTo: '2026-07-31', grossAmount: 105, refundAmount: 20, feeAmount: 5, taxWithheldAmount: 0, localNetAmount: 80, orderIds: [orderId], remotePayloadChecksum: checksum }, 'maker', settlementId, '2026-07-31T12:03:00.000Z');
    state = createRetailSettlementAllocationPack(state, { settlementId, allocations: [{ orderId, grossAmount: 85, refundAmount: 0, feeAmount: 5, taxWithheldAmount: 0, netAmount: 80 }] }, 'maker', packId, '2026-07-31T12:04:00.000Z');
    expect(() => decideRetailSettlementAllocationPack(state, { id: packId, decision: 'approved', evidence: 'RTO order and settlement totals independently checked', expectedVersion: 1 }, 'checker')).toThrow(/refund/i);
  });
});
