import { describe, expect, it, vi } from 'vitest';
import { configureRetailCommerceCredentials, createRetailCommerceConnector, createRetailCommerceSyncRun, importRetailCommerceOrder } from '../domain/retail-commerce';
import { configureRetailOcrProvider, createRetailOcrProviderProfile, testRetailOcrProvider } from '../domain/retail-commerce-advanced';
import { createInitialRevenueOpsState } from '../domain/revenue-ops';
import { buildRetailHubStoreEdgeSaleEvent } from '../domain/retail-offline-sync';
import type { RetailSale } from '../shared/retail-pos-contracts';
import { configureProviderConnector } from '../domain/provider-control';
import type { PartySnapshot } from '../shared/party-contracts';
import { BusinessDatabase } from './database';
import type { CrmDepthStore } from './crm-depth-store';
import type { CrmStore } from './crm-store';
import { ProviderGatewayService } from './provider-gateway-service';
import { RevenueOpsStore } from './revenue-ops-store';
import type { KernelStore } from './kernel-store';
import type { StatutoryGatewayService } from './statutory-gateway-service';

const connectorId = '00000000-0000-4000-8000-000000000071';
const runId = '00000000-0000-4000-8000-000000000072';
const settlementConnectorId = '00000000-0000-4000-8000-000000000073';
const settlementRunId = '00000000-0000-4000-8000-000000000074';
const ocrProviderId = '00000000-0000-4000-8000-000000000076';
const retryConnectorId = '00000000-0000-4000-8000-000000000077';
const retryRunId = '00000000-0000-4000-8000-000000000078';
const checksum = 'a'.repeat(64);
const realChecksum = 'b'.repeat(64);

describe('retail commerce provider execution', () => {
  it('creates an independent conflict pack when a canonical order pull has local mapping exceptions', async () => {
    const database = new BusinessDatabase(':memory:');
    await database.initialize();
    let state = createInitialRevenueOpsState();
    state = { ...state, itemVariants: [{ id: 'variant-order', itemId: 'item-order', sku: 'LOCAL-ORDER', name: 'Local order item', attributes: {}, active: true, scope: structuredClone(state.scope), version: 1 }] };
    state = createRetailCommerceConnector(state, { code: 'MKT-EXEC', name: 'Marketplace execution', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull'] }, 'maker', connectorId, '2026-08-01T10:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId, fingerprint: checksum });
    state = createRetailCommerceSyncRun(state, { connectorId, kind: 'orders', requestChecksum: checksum }, 'maker', runId, '2026-08-01T10:01:00.000Z');
    database.saveState('revenue-ops-india', state.schemaVersion, state.revision, state);
    const responseBody = JSON.stringify({ status: 'completed', evidenceReference: 'MKT-ORDER-PULL-1', recordsRead: 1, recordsAccepted: 1, recordsRejected: 0, orders: [{ remoteOrderId: 'remote-unmapped', orderNumber: 'MKT-1001', remoteCreatedAt: '2026-08-01T10:02:00.000Z', lines: [{ remoteSku: 'REMOTE-NOT-MAPPED', quantity: 1, unitPrice: 100, gstRate: 5 }] }] });
    const providerGateway = { requestJson: vi.fn().mockResolvedValue({ statusCode: 200, ok: true, bodyText: responseBody, responseChecksum: 'b'.repeat(64), responseByteLength: Buffer.byteLength(responseBody, 'utf8') }) } as unknown as ProviderGatewayService;
    const party = { accounts: [], contacts: [], addresses: [] } as unknown as PartySnapshot;
    const store = new RevenueOpsStore(database, { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore, { getSnapshot: () => party } as unknown as import('./party-store').PartyStore, { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore, {} as CrmDepthStore, {} as StatutoryGatewayService, providerGateway);
    try {
      await store.initialize();
      const snapshot = await store.executeRetailCommerceSync({ id: runId, method: 'GET', path: '/v1/orders', applyOrders: true, expectedVersion: 1 }, 'checker');
      expect(snapshot.retailCommerceSyncRuns[0]).toMatchObject({ status: 'completed-with-exceptions', recordsRead: 1, recordsAccepted: 0, recordsRejected: 1 });
      expect(snapshot.retailCommerceOrders).toHaveLength(0);
      expect(snapshot.retailCommerceConflictResolutions[0]).toMatchObject({ kind: 'sync-exceptions', sourceId: runId, status: 'prepared', decision: 'accepted' });
    } finally {
      database.close();
    }
  });

  it('reconciles a later provider status pull without overwriting local order custody', async () => {
    const database = new BusinessDatabase(':memory:');
    await database.initialize();
    let state = createInitialRevenueOpsState();
    state = { ...state, itemVariants: [{ id: 'variant-status', itemId: 'item-status', sku: 'LOCAL-STATUS', name: 'Status item', attributes: {}, active: true, scope: structuredClone(state.scope), version: 1 }] };
    const statusConnectorId = '00000000-0000-4000-8000-000000000081';
    const statusRunId = '00000000-0000-4000-8000-000000000082';
    const statusOrderId = '00000000-0000-4000-8000-000000000083';
    state = createRetailCommerceConnector(state, { code: 'MKT-STATUS', name: 'Marketplace status execution', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull'] }, 'maker', statusConnectorId, '2026-08-01T10:05:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: statusConnectorId, fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId: statusConnectorId, remoteOrderId: 'remote-status', orderNumber: 'MKT-STATUS-1', remoteCreatedAt: '2026-08-01T10:05:30.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-status', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'maker', statusOrderId, '2026-08-01T10:05:31.000Z');
    state = createRetailCommerceSyncRun(state, { connectorId: statusConnectorId, kind: 'orders', requestChecksum: realChecksum }, 'maker', statusRunId, '2026-08-01T10:06:00.000Z');
    database.saveState('revenue-ops-india', state.schemaVersion, state.revision, state);
    const responseBody = JSON.stringify({ status: 'completed', evidenceReference: 'MKT-STATUS-PULL-1', recordsRead: 1, recordsAccepted: 1, recordsRejected: 0, orders: [{ remoteOrderId: 'remote-status', orderNumber: 'MKT-STATUS-1', remoteCreatedAt: '2026-08-01T10:05:30.000Z', remoteStatus: 'cancelled', lines: [{ itemVariantId: 'variant-status', quantity: 1, unitPrice: 100, gstRate: 5 }] }] });
    const providerGateway = { requestJson: vi.fn().mockResolvedValue({ statusCode: 200, ok: true, bodyText: responseBody, responseChecksum: 'c'.repeat(64), responseByteLength: Buffer.byteLength(responseBody, 'utf8') }) } as unknown as ProviderGatewayService;
    const party = { accounts: [], contacts: [], addresses: [] } as unknown as PartySnapshot;
    const store = new RevenueOpsStore(database, { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore, { getSnapshot: () => party } as unknown as import('./party-store').PartyStore, { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore, {} as CrmDepthStore, {} as StatutoryGatewayService, providerGateway);
    try {
      await store.initialize();
      const snapshot = await store.executeRetailCommerceSync({ id: statusRunId, method: 'GET', path: '/v1/orders', applyOrders: true, expectedVersion: 1 }, 'checker');
      expect(snapshot.retailCommerceSyncRuns[0]).toMatchObject({ status: 'completed', recordsAccepted: 1, recordsRejected: 0 });
      expect(snapshot.retailCommerceOrders[0]).toMatchObject({ id: statusOrderId, status: 'imported', remoteStatus: 'cancelled', remoteStatusEvidence: 'MKT-STATUS-PULL-1 · checker' });
    } finally {
      database.close();
    }
  });

  it('imports canonical settlement pulls and computes local net evidence from known orders', async () => {
    const database = new BusinessDatabase(':memory:');
    await database.initialize();
    let state = createInitialRevenueOpsState();
    state = { ...state, itemVariants: [{ id: 'variant-settlement', itemId: 'item-settlement', sku: 'LOCAL-SETTLEMENT', name: 'Settlement item', attributes: {}, active: true, scope: structuredClone(state.scope), version: 1 }] };
    state = createRetailCommerceConnector(state, { code: 'MKT-SETTLE', name: 'Marketplace settlement', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull', 'settlement-pull'] }, 'maker', settlementConnectorId, '2026-08-01T10:10:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: settlementConnectorId, fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId: settlementConnectorId, remoteOrderId: 'remote-1', orderNumber: 'MKT-1001', remoteCreatedAt: '2026-08-01T10:10:30.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-settlement', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'maker', '00000000-0000-4000-8000-000000000075', '2026-08-01T10:10:31.000Z');
    state = createRetailCommerceSyncRun(state, { connectorId: settlementConnectorId, kind: 'settlement', requestChecksum: checksum }, 'maker', settlementRunId, '2026-08-01T10:11:00.000Z');
    database.saveState('revenue-ops-india', state.schemaVersion, state.revision, state);
    const responseBody = JSON.stringify({ status: 'completed', evidenceReference: 'MKT-SETTLEMENT-1', recordsRead: 1, recordsAccepted: 1, recordsRejected: 0, settlements: [{ settlementReference: 'SETTLE-1001', periodFrom: '2026-07-01', periodTo: '2026-07-31', grossAmount: 105, feeAmount: 5, taxWithheldAmount: 0, remoteOrderIds: ['remote-1'] }] });
    const providerGateway = { requestJson: vi.fn().mockResolvedValue({ statusCode: 200, ok: true, bodyText: responseBody, responseChecksum: 'c'.repeat(64), responseByteLength: Buffer.byteLength(responseBody, 'utf8') }) } as unknown as ProviderGatewayService;
    const party = { accounts: [], contacts: [], addresses: [] } as unknown as PartySnapshot;
    const store = new RevenueOpsStore(database, { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore, { getSnapshot: () => party } as unknown as import('./party-store').PartyStore, { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore, {} as CrmDepthStore, {} as StatutoryGatewayService, providerGateway);
    try {
      await store.initialize();
      const snapshot = await store.executeRetailCommerceSync({ id: settlementRunId, method: 'GET', path: '/v1/settlements', applySettlements: true, expectedVersion: 1 }, 'checker');
      expect(snapshot.retailCommerceSyncRuns[0]).toMatchObject({ status: 'completed', recordsAccepted: 1, recordsRejected: 0 });
      expect(snapshot.retailSettlementReconciliations[0]).toMatchObject({ settlementReference: 'SETTLE-1001', grossAmount: 105, feeAmount: 5, taxWithheldAmount: 0, localNetAmount: 105, status: 'variance-review' });
      expect(snapshot.retailSettlementAllocationPacks[0]).toMatchObject({ settlementId: snapshot.retailSettlementReconciliations[0]!.id, status: 'prepared', allocatedGrossAmount: 105, allocatedFeeAmount: 5, allocatedNetAmount: 100 });
    } finally {
      database.close();
    }
  });

  it('rejects a settlement that references an order not imported in the active branch', async () => {
    const database = new BusinessDatabase(':memory:');
    await database.initialize();
    let state = createInitialRevenueOpsState();
    state = createRetailCommerceConnector(state, { code: 'MKT-SETTLE-GATE', name: 'Settlement membership gate', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['settlement-pull'] }, 'maker', '00000000-0000-4000-8000-000000000079', '2026-08-01T10:40:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: '00000000-0000-4000-8000-000000000079', fingerprint: checksum });
    state = createRetailCommerceSyncRun(state, { connectorId: '00000000-0000-4000-8000-000000000079', kind: 'settlement', requestChecksum: checksum }, 'maker', '00000000-0000-4000-8000-000000000080', '2026-08-01T10:41:00.000Z');
    database.saveState('revenue-ops-india', state.schemaVersion, state.revision, state);
    const responseBody = JSON.stringify({ status: 'completed', evidenceReference: 'MKT-SETTLEMENT-MISSING-ORDER', recordsRead: 1, recordsAccepted: 1, recordsRejected: 0, settlements: [{ settlementReference: 'SETTLE-MISSING-ORDER', periodFrom: '2026-07-01', periodTo: '2026-07-31', grossAmount: 105, feeAmount: 5, taxWithheldAmount: 0, remoteOrderIds: ['remote-not-imported'] }] });
    const providerGateway = { requestJson: vi.fn().mockResolvedValue({ statusCode: 200, ok: true, bodyText: responseBody, responseChecksum: 'c'.repeat(64), responseByteLength: Buffer.byteLength(responseBody, 'utf8') }) } as unknown as ProviderGatewayService;
    const party = { accounts: [], contacts: [], addresses: [] } as unknown as PartySnapshot;
    const store = new RevenueOpsStore(database, { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore, { getSnapshot: () => party } as unknown as import('./party-store').PartyStore, { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore, {} as CrmDepthStore, {} as StatutoryGatewayService, providerGateway);
    try {
      await store.initialize();
      const snapshot = await store.executeRetailCommerceSync({ id: '00000000-0000-4000-8000-000000000080', method: 'GET', path: '/v1/settlements', applySettlements: true, expectedVersion: 1 }, 'checker');
      expect(snapshot.retailCommerceSyncRuns[0]).toMatchObject({ status: 'completed-with-exceptions', recordsAccepted: 0, recordsRejected: 1 });
      expect(snapshot.retailSettlementReconciliations).toHaveLength(0);
      expect(snapshot.retailCommerceConflictResolutions[0]).toMatchObject({ kind: 'sync-exceptions', sourceId: '00000000-0000-4000-8000-000000000080', status: 'prepared' });
    } finally {
      database.close();
    }
  });

  it('executes a certified OCR adapter and preserves provider response evidence on the review document', async () => {
    const database = new BusinessDatabase(':memory:');
    await database.initialize();
    let state = createInitialRevenueOpsState();
    state = createRetailOcrProviderProfile(state, { code: 'OCR-API', name: 'Certified invoice OCR', mode: 'api', baseUrl: 'https://ocr.example', supportedDocumentKinds: ['supplier-invoice'] }, 'maker', ocrProviderId, '2026-08-01T10:20:00.000Z');
    state = configureRetailOcrProvider(state, { id: ocrProviderId, credentialFingerprint: realChecksum });
    state = testRetailOcrProvider(state, { id: ocrProviderId, evidence: 'Real sandbox invoice response was replayed and GST totals were independently checked.', expectedVersion: 2 }, 'checker', '2026-08-01T10:21:00.000Z');
    database.saveState('revenue-ops-india', state.schemaVersion, state.revision, state);
    const responseBody = JSON.stringify({ status: 'completed', evidenceReference: 'OCR-RESPONSE-1', document: { extractedInvoiceNumber: 'SUP-1001', extractedInvoiceDate: '2026-08-01', extractedSupplierGstin: '27ABCDE1234F1Z5', extractedTotalAmount: 118, extractionConfidence: 0.94, lines: [{ description: 'Assam tea', quantity: 1, unitPrice: 100, gstRate: 18, confidence: 0.98 }] } });
    const providerGateway = { requestJson: vi.fn().mockResolvedValue({ statusCode: 200, ok: true, bodyText: responseBody, responseChecksum: 'e'.repeat(64), responseByteLength: Buffer.byteLength(responseBody, 'utf8') }) } as unknown as ProviderGatewayService;
    const party = { accounts: [], contacts: [], addresses: [] } as unknown as PartySnapshot;
    const store = new RevenueOpsStore(database, { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore, { getSnapshot: () => party } as unknown as import('./party-store').PartyStore, { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore, {} as CrmDepthStore, {} as StatutoryGatewayService, providerGateway);
    try {
      await store.initialize();
      const snapshot = await store.executeRetailOcr({ providerId: ocrProviderId, method: 'POST', path: '/v1/invoices/parse', payloadJson: JSON.stringify({ fileChecksum: realChecksum }), source: 'upload', fileName: 'supplier-invoice.pdf', fileChecksum: realChecksum, expectedProviderVersion: 3 }, 'operator');
      expect(snapshot.retailPurchaseOcrDocuments[0]).toMatchObject({ status: 'review', ocrProviderProfileId: ocrProviderId, providerResponseReference: 'OCR-RESPONSE-1', providerResponseChecksum: 'e'.repeat(64), providerResponseByteLength: Buffer.byteLength(responseBody, 'utf8'), extractedInvoiceNumber: 'SUP-1001' });
    } finally {
      database.close();
    }
  });

  it('requeues a failed provider sync only after an independent retry approval', async () => {
    const database = new BusinessDatabase(':memory:');
    await database.initialize();
    let state = createInitialRevenueOpsState();
    state = createRetailCommerceConnector(state, { code: 'MKT-RETRY', name: 'Marketplace retry', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull'] }, 'maker', retryConnectorId, '2026-08-01T10:30:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: retryConnectorId, fingerprint: realChecksum });
    state = createRetailCommerceSyncRun(state, { connectorId: retryConnectorId, kind: 'orders', requestChecksum: realChecksum }, 'maker', retryRunId, '2026-08-01T10:31:00.000Z');
    database.saveState('revenue-ops-india', state.schemaVersion, state.revision, state);
    const providerGateway = { requestJson: vi.fn().mockResolvedValue({ statusCode: 503, ok: false, bodyText: 'provider unavailable', responseChecksum: 'f'.repeat(64), responseByteLength: 19 }) } as unknown as ProviderGatewayService;
    const party = { accounts: [], contacts: [], addresses: [] } as unknown as PartySnapshot;
    const store = new RevenueOpsStore(database, { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore, { getSnapshot: () => party } as unknown as import('./party-store').PartyStore, { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore, {} as CrmDepthStore, {} as StatutoryGatewayService, providerGateway);
    try {
      await store.initialize();
      const failed = await store.executeRetailCommerceSync({ id: retryRunId, method: 'GET', path: '/v1/orders', expectedVersion: 1 }, 'checker');
      const resolution = failed.retailCommerceConflictResolutions[0]!;
      expect(resolution).toMatchObject({ kind: 'sync-failed', decision: 'retry', status: 'prepared' });
      const retried = await store.decideRetailCommerceConflictResolution({ id: resolution.id, decision: 'approved', evidence: 'Independent operations reviewer approved a bounded provider retry.', expectedVersion: resolution.version }, 'approver');
      expect(retried.retailCommerceSyncRuns[0]).toMatchObject({ status: 'prepared', kind: 'orders', requestedBy: 'approver' });
      expect(retried.retailCommerceSyncRuns).toHaveLength(2);
    } finally {
      database.close();
    }
  });

  it('records diagnostic provider preflight evidence without activating the connector', async () => {
    const database = new BusinessDatabase(':memory:');
    await database.initialize();
    let state = createInitialRevenueOpsState();
    state = configureProviderConnector(state, { code: 'BANK-PREFLIGHT', name: 'Sandbox banking preflight', providerLegalName: 'Sandbox Bank', domain: 'banking', environment: 'sandbox', baseUrl: 'https://bank.example', statusPathTemplate: '/v1/status/{reference}', capabilities: ['statement-pull'], specificationVersion: 'v1' }, 'maker', connectorId, '2026-08-01T11:00:00.000Z');
    database.saveState('revenue-ops-india', state.schemaVersion, state.revision, state);
    const responseBody = JSON.stringify({ status: 'ok' });
    const providerGateway = { configureCredentials: vi.fn().mockReturnValue(realChecksum), requestJson: vi.fn().mockResolvedValue({ statusCode: 200, ok: true, bodyText: responseBody, responseChecksum: 'd'.repeat(64), responseByteLength: Buffer.byteLength(responseBody, 'utf8') }) } as unknown as ProviderGatewayService;
    const party = { accounts: [], contacts: [], addresses: [] } as unknown as PartySnapshot;
    const kernel = { getSnapshot: () => ({ users: [{ id: 'approver', status: 'active', roleIds: ['role-finance-approver'] }] }), isBootstrapWorkspaceOwner: () => false } as unknown as KernelStore;
    const store = new RevenueOpsStore(database, { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore, { getSnapshot: () => party } as unknown as import('./party-store').PartyStore, kernel, {} as CrmDepthStore, {} as StatutoryGatewayService, providerGateway);
    try {
      await store.initialize();
      const configured = await store.configureProviderCredentials({ connectorId, apiKey: 'sandbox-secret' }, 'approver');
      const snapshot = await store.executeProviderPreflight({ connectorId, method: 'GET', path: '/v1/health', evidenceReference: 'SANDBOX-HEALTH-1', expectedConnectorVersion: configured.providerConnectors[0]!.version }, 'approver');
      expect(snapshot.providerPreflightEvidence[0]).toMatchObject({ connectorId, method: 'GET', path: '/v1/health', status: 'succeeded', statusCode: 200, responseChecksum: 'd'.repeat(64), evidenceReference: 'SANDBOX-HEALTH-1' });
      expect(snapshot.providerConnectors[0]).toMatchObject({ conformanceStatus: 'draft', credentialStatus: 'configured' });
      expect(providerGateway.requestJson).toHaveBeenCalledWith(connectorId, 'https://bank.example', '/v1/health', 'GET', undefined, expect.any(String));
    } finally {
      database.close();
    }
  });

  it('persists Store Edge → Hub receipt and cursor evidence across reloads', async () => {
    const database = new BusinessDatabase(':memory:');
    await database.initialize();
    const base = createInitialRevenueOpsState();
    const sale = {
      id: 'sale-hub-001', number: 'INV-HUB-001', counterId: 'counter-store', cashierShiftId: 'shift-store', cashierId: 'cashier-1', customerAccountId: 'walk-in',
      transactionKey: 'POS-HUB-001', requestChecksum: 'a'.repeat(64), saleAt: '2026-08-02T10:00:00.000Z', invoiceId: 'invoice-hub-001', paymentReceiptIds: ['payment-hub-001'],
      lines: [{ id: 'line-hub-001', itemVariantId: 'variant-tea', catalogProductId: 'product-tea', binId: 'bin-shelf', serialUnitIds: [], description: 'Tea', hsnSac: '0902', quantity: 1, listUnitPrice: 100, unitPrice: 100, taxableValue: 100, gstRate: 5, taxCodeId: 'gst-5', priceListEntryId: 'price-1', discountAmount: 0, cessRate: 0, cessAmount: 0, lineTotal: 105, costValue: 60 }],
      subtotal: 100, discountTotal: 0, taxPreview: { treatment: 'intra-state', taxableValue: 100, cgst: 2.5, sgst: 2.5, igst: 0, totalTax: 5, grandTotal: 105, determination: 'commercial-estimate' },
      tenders: [{ id: 'tender-hub-001', method: 'cash', amount: 105, reference: 'CASH-HUB-001' }], costTotal: 60, status: 'completed', completedAt: '2026-08-02T10:00:02.000Z', scope: structuredClone(base.scope), version: 1,
    } satisfies RetailSale;
    database.saveState('revenue-ops-india', base.schemaVersion, base.revision, { ...base, retailSales: [sale] });
    const response = JSON.stringify({ outcome: 'recorded', receipt: { id: 'hub-receipt-001', eventId: 'retail-sale:sale-hub-001:v1', eventType: 'retail.sale.completed', aggregateId: sale.id, transactionKey: sale.transactionKey, sequence: 1, payloadChecksum: buildRetailHubStoreEdgeSaleEvent(sale, 1).payloadChecksum, outcome: 'recorded', actorId: 'hub-worker', receivedAt: '2026-08-02T10:00:03.000Z', scope: { tenantId: 'tenant-bakaloo', companyId: base.scope.companyId, branchId: base.scope.branchId } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 202, headers: new Headers({ 'content-type': 'application/json' }), arrayBuffer: async () => new TextEncoder().encode(response).buffer }));
    const providerGateway = {} as ProviderGatewayService;
    const party = { accounts: [], contacts: [], addresses: [] } as unknown as PartySnapshot;
    const store = new RevenueOpsStore(database, { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore, { getSnapshot: () => party } as unknown as import('./party-store').PartyStore, { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore, {} as CrmDepthStore, {} as StatutoryGatewayService, providerGateway);
    try {
      await store.initialize();
      const event = buildRetailHubStoreEdgeSaleEvent(sale, 1);
      const snapshot = await store.sendRetailHubStoreEdgeSync({ baseUrl: 'https://hub.example', event }, 'cashier-1');
      expect(snapshot.retailHubStoreEdgeSyncReceipts?.[0]).toMatchObject({ status: 'sent', hubReceiptId: 'hub-receipt-001', sequence: 1, actorId: 'cashier-1' });
      expect(snapshot.retailHubStoreEdgeSyncCursor).toMatchObject({ nextSequence: 2, lastAcceptedSequence: 1, lastAcceptedEventId: event.eventId });
      const reloaded = new RevenueOpsStore(database, { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore, { getSnapshot: () => party } as unknown as import('./party-store').PartyStore, { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore, {} as CrmDepthStore, {} as StatutoryGatewayService, providerGateway);
      await reloaded.initialize();
      expect(reloaded.getSnapshot().retailHubStoreEdgeSyncReceipts?.[0]).toMatchObject({ status: 'sent', hubReceiptId: 'hub-receipt-001' });
    } finally {
      vi.unstubAllGlobals();
      database.close();
    }
  });

  it('replays a bounded Store Edge batch, isolates failures, and reuses the local ledger', async () => {
    const database = new BusinessDatabase(':memory:');
    await database.initialize();
    const base = createInitialRevenueOpsState();
    const sale = (id: string, number: string, completedAt: string): RetailSale => ({
      id, number, counterId: 'counter-store', cashierShiftId: 'shift-store', cashierId: 'cashier-1', customerAccountId: 'walk-in',
      transactionKey: `POS-${id}`, requestChecksum: 'a'.repeat(64), saleAt: completedAt, invoiceId: `invoice-${id}`, paymentReceiptIds: [`payment-${id}`],
      lines: [{ id: `line-${id}`, itemVariantId: 'variant-tea', catalogProductId: 'product-tea', binId: 'bin-shelf', serialUnitIds: [], description: 'Tea', hsnSac: '0902', quantity: 1, listUnitPrice: 100, unitPrice: 100, taxableValue: 100, gstRate: 5, taxCodeId: 'gst-5', priceListEntryId: 'price-1', discountAmount: 0, cessRate: 0, cessAmount: 0, lineTotal: 105, costValue: 60 }],
      subtotal: 100, discountTotal: 0, taxPreview: { treatment: 'intra-state', taxableValue: 100, cgst: 2.5, sgst: 2.5, igst: 0, totalTax: 5, grandTotal: 105, determination: 'commercial-estimate' },
      tenders: [{ id: `tender-${id}`, method: 'cash', amount: 105, reference: `CASH-${id}` }], costTotal: 60, status: 'completed', completedAt, scope: structuredClone(base.scope), version: 1,
    });
    const first = sale('sale-batch-001', 'INV-BATCH-001', '2026-08-02T10:00:00.000Z');
    const second = sale('sale-batch-002', 'INV-BATCH-002', '2026-08-02T10:01:00.000Z');
    database.saveState('revenue-ops-india', base.schemaVersion, base.revision, { ...base, retailSales: [second, first] });
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      calls += 1;
      if (calls === 1) return { status: 503, headers: new Headers({ 'content-type': 'text/plain' }), arrayBuffer: async () => new TextEncoder().encode('offline').buffer };
      const event = JSON.parse(String(init.body)) as Record<string, unknown>;
      const response = JSON.stringify({ outcome: 'recorded', receipt: { ...event, id: 'hub-batch-receipt-002', outcome: 'recorded', actorId: 'hub-worker', receivedAt: '2026-08-02T10:02:00.000Z', scope: { tenantId: 'tenant-bakaloo', companyId: base.scope.companyId, branchId: base.scope.branchId } } });
      return { status: 202, headers: new Headers({ 'content-type': 'application/json' }), arrayBuffer: async () => new TextEncoder().encode(response).buffer };
    }));
    const store = new RevenueOpsStore(database, { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore, { getSnapshot: () => ({ accounts: [], contacts: [], addresses: [] }) } as unknown as import('./party-store').PartyStore, { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore, {} as CrmDepthStore, {} as StatutoryGatewayService, {} as ProviderGatewayService);
    try {
      await store.initialize();
      const snapshot = await store.syncRetailHubStoreEdgeQueue({ baseUrl: 'https://hub.example', limit: 2 }, 'cashier-1');
      expect(calls).toBe(2);
      expect(snapshot.retailHubStoreEdgeSyncReceipts).toHaveLength(2);
      expect(snapshot.retailHubStoreEdgeSyncReceipts?.map((receipt) => receipt.status)).toEqual(['sent', 'failed']);
      expect(snapshot.retailHubStoreEdgeSyncReceipts?.find((receipt) => receipt.aggregateId === first.id)).toMatchObject({ status: 'failed', sequence: 1 });
      expect(snapshot.retailHubStoreEdgeSyncReceipts?.find((receipt) => receipt.aggregateId === second.id)).toMatchObject({ status: 'sent', sequence: 2 });
      expect(snapshot.retailHubStoreEdgeSyncRuns?.[0]).toMatchObject({ status: 'completed-with-errors', attempted: 2, sent: 1, failed: 1, conflicted: 0, baseUrlOrigin: 'https://hub.example' });
    } finally {
      vi.unstubAllGlobals();
      database.close();
    }
  });

  it('persists an opt-in retry policy without retaining URL credentials or query material', async () => {
    const database = new BusinessDatabase(':memory:');
    await database.initialize();
    const store = new RevenueOpsStore(database, { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore, { getSnapshot: () => ({ accounts: [], contacts: [], addresses: [] }) } as unknown as import('./party-store').PartyStore, { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore, {} as CrmDepthStore, {} as StatutoryGatewayService, {} as ProviderGatewayService);
    try {
      await store.initialize();
      const saved = await store.saveRetailHubStoreEdgeSyncPolicy({ enabled: true, baseUrl: 'https://hub.example/path', intervalMinutes: 30, batchLimit: 10 }, 'manager-1');
      expect(saved.retailHubStoreEdgeSyncPolicy).toMatchObject({ enabled: true, baseUrl: 'https://hub.example', intervalMinutes: 30, batchLimit: 10, updatedBy: 'manager-1', version: 1 });
      const reloaded = new RevenueOpsStore(database, { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore, { getSnapshot: () => ({ accounts: [], contacts: [], addresses: [] }) } as unknown as import('./party-store').PartyStore, { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore, {} as CrmDepthStore, {} as StatutoryGatewayService, {} as ProviderGatewayService);
      await reloaded.initialize();
      expect(reloaded.getSnapshot().retailHubStoreEdgeSyncPolicy).toMatchObject({ enabled: true, baseUrl: 'https://hub.example', intervalMinutes: 30, batchLimit: 10 });
      await expect(reloaded.saveRetailHubStoreEdgeSyncPolicy({ enabled: true, baseUrl: 'http://hub.example', intervalMinutes: 5, batchLimit: 10 }, 'manager-1')).rejects.toThrow(/HTTPS/i);
      await expect(reloaded.saveRetailHubStoreEdgeSyncPolicy({ enabled: true, baseUrl: 'https://hub.example?secret=never-store', intervalMinutes: 5, batchLimit: 10 }, 'manager-1')).rejects.toThrow(/query/i);
    } finally {
      database.close();
    }
  });
});
