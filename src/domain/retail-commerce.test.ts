import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createInventoryItem, createItemVariant } from './inventory-warehouse';
import { configureRetailCommerceCredentials, createRetailCommerceConnector, createRetailCommerceSyncRun, createRetailPurchaseOcrDocument, createRetailSettlementReconciliation, decideRetailPurchaseOcr, decideRetailSettlementReconciliation, importRetailCommerceOrder, recordRetailCommerceRemoteStatus, recordRetailCommerceSync } from './retail-commerce';
import { createRetailSettlementAllocationPack, decideRetailSettlementAllocationPack } from './retail-settlement-allocation';

const checksum = 'a'.repeat(64);

function retailCommerceState() {
  let state = createInitialRevenueOpsState();
  state = { ...state, products: [{ id: 'product-tea', sku: 'TEA-1KG', name: 'Assam tea 1 kg', description: 'Retail grocery item', kind: 'goods', uom: 'KG', taxCodeId: 'tax-default', effectiveFrom: '2026-04-01', active: true, version: 1 }] };
  state = createInventoryItem(state, { productId: 'product-tea', code: 'TEA-1KG', name: 'Assam tea 1 kg', baseUomId: 'uom-kg', tracking: 'batch', valuationMethod: 'fifo' }, 'item-tea');
  return createItemVariant(state, { itemId: 'item-tea', sku: 'TEA-1KG-REG', name: 'Assam tea 1 kg regular', attributes: { pack: '1kg' } }, 'variant-tea');
}

describe('retail commerce integrations', () => {
  it('keeps purchase OCR review and conversion maker-checker gated', () => {
    let state = retailCommerceState();
    state = createRetailPurchaseOcrDocument(state, { source: 'upload', fileName: 'supplier-invoice.pdf', fileChecksum: checksum, extractedInvoiceNumber: 'SUP-100', extractedInvoiceDate: '2026-07-30', extractedTotalAmount: 118, extractionConfidence: 0.93, lines: [{ description: 'Assam tea', itemVariantId: 'variant-tea', quantity: 10, unitPrice: 10, gstRate: 18, confidence: 0.91 }] }, 'maker', '00000000-0000-4000-8000-000000000001', '2026-07-30T08:00:00.000Z');
    expect(state.retailPurchaseOcrDocuments[0]).toMatchObject({ id: '00000000-0000-4000-8000-000000000001', status: 'review', extractionConfidence: 0.93 });
    expect(() => decideRetailPurchaseOcr(state, { id: '00000000-0000-4000-8000-000000000001', decision: 'approved', evidence: 'maker cannot approve', expectedVersion: 1 }, 'maker')).toThrow('maker');
    state = decideRetailPurchaseOcr(state, { id: '00000000-0000-4000-8000-000000000001', decision: 'approved', evidence: 'Invoice totals and GST reviewed', expectedVersion: 1 }, 'checker', '2026-07-30T08:01:00.000Z');
    expect(state.retailPurchaseOcrDocuments[0]).toMatchObject({ status: 'approved', reviewedBy: 'checker' });
  });

  it('requires credentialed connector evidence before sync, imports orders once, and reconciles settlement variance', () => {
    let state = retailCommerceState();
    state = createRetailCommerceConnector(state, { code: 'ONDC-SELLER', name: 'ONDC seller adapter', channel: 'ondc', environment: 'sandbox', baseUrl: 'https://sandbox.ondc.example', capabilities: ['catalog-push', 'inventory-push', 'order-pull', 'settlement-pull'] }, 'maker', '00000000-0000-4000-8000-000000000002', '2026-07-30T08:02:00.000Z');
    expect(() => createRetailCommerceSyncRun(state, { connectorId: '00000000-0000-4000-8000-000000000002', kind: 'orders', requestChecksum: checksum }, 'maker')).toThrow('configured connector');
    state = configureRetailCommerceCredentials(state, { connectorId: '00000000-0000-4000-8000-000000000002', fingerprint: checksum });
    state = createRetailCommerceSyncRun(state, { connectorId: '00000000-0000-4000-8000-000000000002', kind: 'orders', requestChecksum: checksum }, 'maker', '00000000-0000-4000-8000-000000000003', '2026-07-30T08:03:00.000Z');
    expect(() => recordRetailCommerceSync(state, { id: '00000000-0000-4000-8000-000000000003', status: 'completed', evidenceReference: 'maker cannot certify provider evidence', recordsRead: 1, recordsAccepted: 1, recordsRejected: 0, responseChecksum: checksum, responseByteLength: 512, expectedVersion: 1 }, 'maker')).toThrow('maker');
    expect(() => recordRetailCommerceSync(state, { id: '00000000-0000-4000-8000-000000000003', status: 'completed', evidenceReference: 'Missing provider payload evidence', recordsRead: 1, recordsAccepted: 1, recordsRejected: 0, expectedVersion: 1 }, 'checker')).toThrow(/response SHA-256/i);
    state = recordRetailCommerceSync(state, { id: '00000000-0000-4000-8000-000000000003', status: 'completed', evidenceReference: 'Sandbox cursor replay matched', providerReference: 'ONDC-SYNC-100', responseChecksum: checksum, responseByteLength: 512, recordsRead: 1, recordsAccepted: 1, recordsRejected: 0, expectedVersion: 1 }, 'checker', '2026-07-30T08:04:00.000Z');
    expect(state.retailCommerceConnectors[0]).toMatchObject({ status: 'configured', credentialStatus: 'configured' });
    state = importRetailCommerceOrder(state, { connectorId: '00000000-0000-4000-8000-000000000002', remoteOrderId: 'REMOTE-1', orderNumber: 'ONDC-1', remoteCreatedAt: '2026-07-30T08:05:00.000Z', remotePayloadChecksum: checksum, remoteStatus: 'cancelled', remoteStatusEvidence: 'ONDC order pull status assessed', lines: [{ itemVariantId: 'variant-tea', quantity: 2, unitPrice: 100, gstRate: 5 }] }, 'operator', '00000000-0000-4000-8000-000000000004', '2026-07-30T08:05:30.000Z');
    expect(state.retailCommerceOrders[0]).toMatchObject({ remoteStatus: 'cancelled', remoteStatusEvidence: 'ONDC order pull status assessed' });
    expect(() => importRetailCommerceOrder(state, { connectorId: '00000000-0000-4000-8000-000000000002', remoteOrderId: 'REMOTE-1', orderNumber: 'ONDC-1', remoteCreatedAt: '2026-07-30T08:05:00.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-tea', quantity: 2, unitPrice: 100, gstRate: 5 }] }, 'operator')).toThrow('already imported');
    state = createRetailSettlementReconciliation(state, { connectorId: '00000000-0000-4000-8000-000000000002', settlementReference: 'SETTLE-1', periodFrom: '2026-07-29', periodTo: '2026-07-30', grossAmount: 210, feeAmount: 10, taxWithheldAmount: 0, localNetAmount: 180, orderIds: ['00000000-0000-4000-8000-000000000004'], remotePayloadChecksum: checksum }, 'maker', '00000000-0000-4000-8000-000000000005', '2026-07-30T08:06:00.000Z');
    expect(state.retailSettlementReconciliations[0]).toMatchObject({ status: 'variance-review', netAmount: 200, varianceAmount: 20 });
    state = createRetailSettlementAllocationPack(state, { settlementId: '00000000-0000-4000-8000-000000000005', allocations: [{ orderId: '00000000-0000-4000-8000-000000000004', grossAmount: 210, refundAmount: 0, feeAmount: 10, taxWithheldAmount: 0, netAmount: 200 }] }, 'maker', '00000000-0000-4000-8000-000000000006', '2026-07-30T08:06:30.000Z');
    state = { ...state, retailCommerceOrders: state.retailCommerceOrders.map((order) => order.id === '00000000-0000-4000-8000-000000000004' ? { ...order, status: 'fulfilled' as const, statusUpdatedBy: 'operator', statusUpdatedAt: '2026-07-30T08:06:40.000Z', statusEvidence: 'Carrier delivery confirmation' } : order) };
    state = decideRetailSettlementAllocationPack(state, { id: '00000000-0000-4000-8000-000000000006', decision: 'approved', evidence: 'Order membership, fee and payout net independently reconciled', expectedVersion: 1 }, 'checker', '2026-07-30T08:06:45.000Z');
    expect(() => decideRetailSettlementReconciliation(state, { id: '00000000-0000-4000-8000-000000000005', decision: 'resolved', evidence: 'maker cannot resolve variance', expectedVersion: 2 }, 'maker')).toThrow('maker');
    state = decideRetailSettlementReconciliation(state, { id: '00000000-0000-4000-8000-000000000005', decision: 'resolved', evidence: 'Fee invoice and order ledger reviewed', expectedVersion: 2 }, 'checker', '2026-07-30T08:07:00.000Z');
    expect(state.retailSettlementReconciliations[0]).toMatchObject({ status: 'resolved', decidedBy: 'checker' });
  });

  it('subtracts provider refunds from marketplace net instead of hiding them in variance', () => {
    let state = createInitialRevenueOpsState();
    state = createRetailCommerceConnector(state, { code: 'REFUND-SETTLE', name: 'Refund settlement', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['settlement-pull'] }, 'maker', '00000000-0000-4000-8000-000000000071', '2026-07-30T09:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: '00000000-0000-4000-8000-000000000071', fingerprint: checksum });
    state = createRetailSettlementReconciliation(state, { connectorId: '00000000-0000-4000-8000-000000000071', settlementReference: 'REFUND-1', periodFrom: '2026-07-30', periodTo: '2026-07-30', grossAmount: 1000, refundAmount: 80, feeAmount: 25, taxWithheldAmount: 10, localNetAmount: 885, orderIds: [], remotePayloadChecksum: checksum }, 'maker', '00000000-0000-4000-8000-000000000072', '2026-07-30T09:01:00.000Z');
    expect(state.retailSettlementReconciliations[0]).toMatchObject({ refundAmount: 80, netAmount: 885, localNetAmount: 885, varianceAmount: 0, status: 'matched' });
  });

  it('rejects replayed and numerically regressed provider cursors before checkpoint advancement', () => {
    let state = createInitialRevenueOpsState();
    const connectorId = '00000000-0000-4000-8000-000000000081';
    state = createRetailCommerceConnector(state, { code: 'CURSOR-GATE', name: 'Cursor-safe marketplace', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://cursor.example', capabilities: ['order-pull'] }, 'maker', connectorId, '2026-07-30T10:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId, fingerprint: checksum });
    state = createRetailCommerceSyncRun(state, { connectorId, kind: 'orders', requestChecksum: checksum }, 'maker', '00000000-0000-4000-8000-000000000082', '2026-07-30T10:01:00.000Z');
    state = recordRetailCommerceSync(state, { id: '00000000-0000-4000-8000-000000000082', status: 'completed', evidenceReference: 'Provider cursor 100 assessed', providerReference: 'CURSOR-100', responseChecksum: checksum, responseByteLength: 128, recordsRead: 0, recordsAccepted: 0, recordsRejected: 0, remoteCursor: '100', expectedVersion: 1 }, 'checker', '2026-07-30T10:02:00.000Z');
    expect(state.retailCommerceConnectors[0]).toMatchObject({ lastSyncCursor: '100', lastSyncCursorKind: 'orders', lastSyncRunId: '00000000-0000-4000-8000-000000000082' });
    state = createRetailCommerceSyncRun(state, { connectorId, kind: 'orders', requestChecksum: 'b'.repeat(64) }, 'maker', '00000000-0000-4000-8000-000000000083', '2026-07-30T10:03:00.000Z');
    expect(() => recordRetailCommerceSync(state, { id: '00000000-0000-4000-8000-000000000083', status: 'completed', evidenceReference: 'Provider cursor replay assessed', providerReference: 'CURSOR-100-REPLAY', responseChecksum: 'b'.repeat(64), responseByteLength: 128, recordsRead: 0, recordsAccepted: 0, recordsRejected: 0, remoteCursor: '100', expectedVersion: 1 }, 'checker', '2026-07-30T10:04:00.000Z')).toThrow(/replays|behind/i);
    expect(() => recordRetailCommerceSync(state, { id: '00000000-0000-4000-8000-000000000083', status: 'completed', evidenceReference: 'Provider cursor regression assessed', providerReference: 'CURSOR-099', responseChecksum: 'b'.repeat(64), responseByteLength: 128, recordsRead: 0, recordsAccepted: 0, recordsRejected: 0, remoteCursor: '99', expectedVersion: 1 }, 'checker', '2026-07-30T10:04:00.000Z')).toThrow(/replays|behind/i);
  });

  it('treats WhatsApp orders as a first-class channel while retaining the same identity and GST controls', () => {
    let state = retailCommerceState();
    state = createRetailCommerceConnector(state, { code: 'WA-ORDERS', name: 'WhatsApp Business orders', channel: 'whatsapp', environment: 'sandbox', baseUrl: 'https://sandbox.whatsapp.example', capabilities: ['order-pull'] }, 'maker', '00000000-0000-4000-8000-000000000007', '2026-07-30T08:08:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: '00000000-0000-4000-8000-000000000007', fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId: '00000000-0000-4000-8000-000000000007', remoteOrderId: 'WA-REMOTE-1', orderNumber: 'WA-1001', remoteCreatedAt: '2026-07-30T08:09:00.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-tea', quantity: 1, unitPrice: 150, gstRate: 5 }] }, 'operator');
    expect(state.retailCommerceConnectors[0]).toMatchObject({ channel: 'whatsapp', credentialStatus: 'configured' });
    expect(state.retailCommerceOrders[0]).toMatchObject({ connectorId: '00000000-0000-4000-8000-000000000007', orderNumber: 'WA-1001', status: 'imported' });
  });

  it('captures a live provider status without overwriting local custody state', () => {
    let state = retailCommerceState();
    const connectorId = '00000000-0000-4000-8000-000000000091';
    const orderId = '00000000-0000-4000-8000-000000000092';
    state = createRetailCommerceConnector(state, { code: 'STATUS-PULL', name: 'Status pull connector', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://status.example', capabilities: ['order-pull'] }, 'maker', connectorId, '2026-07-30T12:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId, fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId, remoteOrderId: 'REMOTE-STATUS-1', orderNumber: 'MKT-STATUS-1', remoteCreatedAt: '2026-07-30T12:01:00.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-tea', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'operator', orderId, '2026-07-30T12:01:00.000Z');
    state = recordRetailCommerceRemoteStatus(state, { id: orderId, remoteStatus: 'fulfilled', remoteStatusChecksum: 'b'.repeat(64), evidence: 'Provider status cursor 101 independently assessed.', expectedVersion: 1 }, 'checker', '2026-07-30T12:02:00.000Z');
    expect(state.retailCommerceOrders[0]).toMatchObject({ status: 'imported', remoteStatus: 'fulfilled', remoteStatusChecksum: 'b'.repeat(64), remoteStatusUpdatedAt: '2026-07-30T12:02:00.000Z' });
  });
});
