import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createInventoryItem, createItemVariant } from './inventory-warehouse';
import { configureRetailCommerceCredentials, createRetailCommerceConnector, createRetailSettlementReconciliation, decideRetailSettlementReconciliation, importRetailCommerceOrder } from './retail-commerce';
import { createRetailSettlementAllocationPack, decideRetailSettlementAllocationPack } from './retail-settlement-allocation';
import { createRetailSettlementWithholdingEvidence, decideRetailSettlementWithholdingEvidence } from './retail-settlement-withholding';

const checksum = 'a'.repeat(64);
const connectorId = '00000000-0000-4000-8000-000000000071';
const orderId = '00000000-0000-4000-8000-000000000072';
const settlementId = '00000000-0000-4000-8000-000000000073';
const allocationId = '00000000-0000-4000-8000-000000000074';
const withholdingId = '00000000-0000-4000-8000-000000000075';

describe('retail settlement withholding evidence', () => {
  it('requires approved TDS/TCS certificate evidence before settlement closure', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, products: [{ id: 'product-tea', sku: 'TEA-1KG', name: 'Assam tea', description: 'Retail grocery item', kind: 'goods', uom: 'KG', taxCodeId: 'tax-default', effectiveFrom: '2026-04-01', active: true, version: 1 }] };
    state = createInventoryItem(state, { productId: 'product-tea', code: 'TEA-1KG', name: 'Assam tea', baseUomId: 'uom-kg', tracking: 'batch', valuationMethod: 'fifo' }, 'item-tea');
    state = createItemVariant(state, { itemId: 'item-tea', sku: 'TEA-1KG-REG', name: 'Assam tea regular', attributes: { pack: '1kg' } }, 'variant-tea');
    state = createRetailCommerceConnector(state, { code: 'TDS-GATE', name: 'TDS gate connector', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull', 'settlement-pull'] }, 'maker', connectorId, '2026-07-31T13:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId, fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId, remoteOrderId: 'REMOTE-TDS', orderNumber: 'MKT-TDS', remoteCreatedAt: '2026-07-31T13:01:00.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-tea', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'operator', orderId, '2026-07-31T13:01:00.000Z');
    state = createRetailSettlementReconciliation(state, { connectorId, settlementReference: 'SETTLE-TDS', periodFrom: '2026-07-01', periodTo: '2026-07-31', grossAmount: 105, feeAmount: 0, taxWithheldAmount: 5, localNetAmount: 95, orderIds: [orderId], remotePayloadChecksum: checksum }, 'maker', settlementId, '2026-07-31T13:02:00.000Z');
    state = createRetailSettlementAllocationPack(state, { settlementId, allocations: [{ orderId, grossAmount: 105, refundAmount: 0, feeAmount: 0, taxWithheldAmount: 5, netAmount: 100 }] }, 'maker', allocationId, '2026-07-31T13:03:00.000Z');
    state = { ...state, retailCommerceOrders: state.retailCommerceOrders.map((order) => order.id === orderId ? { ...order, status: 'fulfilled' as const, statusUpdatedBy: 'operator', statusUpdatedAt: '2026-07-31T13:03:30.000Z', statusEvidence: 'Carrier delivery confirmation' } : order) };
    state = decideRetailSettlementAllocationPack(state, { id: allocationId, decision: 'approved', evidence: 'Order and payout allocation independently reconciled', expectedVersion: 1 }, 'checker');
    expect(() => decideRetailSettlementReconciliation(state, { id: settlementId, decision: 'resolved', evidence: 'Missing certificate', expectedVersion: 2 }, 'checker')).toThrow('withholding evidence');
    state = createRetailSettlementWithholdingEvidence(state, { settlementId, taxType: 'tds', periodFrom: '2026-07-01', periodTo: '2026-07-31', amount: 5, certificateReference: 'TDS-CERT-2026-07', challanReference: 'CHALLAN-2026-07' }, 'maker', withholdingId, '2026-07-31T13:04:00.000Z');
    state = decideRetailSettlementWithholdingEvidence(state, { id: withholdingId, decision: 'approved', evidence: 'TDS certificate and challan reconciled to settlement withholding', expectedVersion: 1 }, 'checker', '2026-07-31T13:05:00.000Z');
    state = decideRetailSettlementReconciliation(state, { id: settlementId, decision: 'resolved', evidence: 'Allocation, fees and approved TDS certificate reconciled', expectedVersion: 3 }, 'checker', '2026-07-31T13:06:00.000Z');
    expect(state.retailSettlementReconciliations[0]).toMatchObject({ status: 'resolved', withholdingEvidenceId: withholdingId });
  });
});
