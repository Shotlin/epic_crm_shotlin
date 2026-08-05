import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createInventoryItem, createItemVariant } from './inventory-warehouse';
import { configureRetailCommerceCredentials, createRetailCommerceConnector, createRetailPurchaseOcrDocument, decideRetailPurchaseOcr, handoffRetailCommerceOrder, importRetailCommerceOrder } from './retail-commerce';
import { configureRetailOcrProvider, createRetailCommerceConformanceCase, createRetailOcrProviderProfile, decideRetailCommercePushBatch, planRetailCommerceConformancePack, prepareRetailCommercePushBatch, prepareRetailSettlementJournal, recordRetailCommerceConformance, reserveRetailCommerceOrder, resolveRetailPurchaseException, scanRetailPurchaseExceptions, testRetailOcrProvider, transitionRetailCommerceOrder } from './retail-commerce-advanced';
import { createRetailCommerceCatalogMapping, decideRetailCommerceCatalogMapping, disableRetailCommerceCatalogMapping, resolveRetailCommerceCatalogMapping } from './retail-commerce-mapping';
import { computeRetailCertificationFreshness } from './retail-certification-freshness';

const checksum = 'a'.repeat(64);
const realChecksum = 'b'.repeat(64);

function stateWithSku() {
  let state = createInitialRevenueOpsState();
  state = { ...state, products: [{ id: 'product-tea', sku: 'TEA-1KG', name: 'Assam tea', description: 'Retail grocery item', kind: 'goods', uom: 'KG', taxCodeId: 'tax-default', effectiveFrom: '2026-04-01', active: true, version: 1 }] };
  state = createInventoryItem(state, { productId: 'product-tea', code: 'TEA-1KG', name: 'Assam tea', baseUomId: 'uom-kg', tracking: 'batch', valuationMethod: 'fifo' }, 'item-tea');
  return createItemVariant(state, { itemId: 'item-tea', sku: 'TEA-1KG-REG', name: 'Assam tea regular', attributes: { pack: '1kg' } }, 'variant-tea');
}

describe('retail commerce advanced controls', () => {
  it('rejects placeholder credential and provider evidence instead of certifying a local sample', () => {
    let state = stateWithSku();
    state = createRetailOcrProviderProfile(state, { code: 'PLACEHOLDER-OCR', name: 'Placeholder OCR', mode: 'manual', supportedDocumentKinds: ['supplier-invoice'] }, 'maker', '00000000-0000-4000-8000-000000000100', '2026-07-30T09:00:00.000Z');
    expect(() => configureRetailOcrProvider(state, { id: '00000000-0000-4000-8000-000000000100', credentialFingerprint: checksum })).toThrow(/real provider/i);
  });

  it('keeps a rejected mapping out of remote order and push resolution', () => {
    let state = stateWithSku();
    state = createRetailCommerceConnector(state, { code: 'MAP-GATE', name: 'Mapping gate', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://mapping.example', capabilities: ['order-pull'] }, 'maker', '00000000-0000-4000-8000-000000000101', '2026-07-30T09:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: '00000000-0000-4000-8000-000000000101', fingerprint: realChecksum });
    state = createRetailCommerceCatalogMapping(state, { connectorId: '00000000-0000-4000-8000-000000000101', remoteSku: 'REMOTE-REJECTED', itemVariantId: 'variant-tea' }, 'maker', '00000000-0000-4000-8000-000000000102', '2026-07-30T09:01:00.000Z');
    state = decideRetailCommerceCatalogMapping(state, { id: '00000000-0000-4000-8000-000000000102', decision: 'rejected', evidence: 'Remote catalogue identity did not match the local HSN item.', expectedVersion: 1 }, 'checker');
    expect(state.retailCommerceCatalogMappings[0]?.status).toBe('rejected');
    expect(resolveRetailCommerceCatalogMapping(state, '00000000-0000-4000-8000-000000000101', 'REMOTE-REJECTED')).toBeUndefined();
  });

  it('certifies OCR profiles and gates provider-backed OCR usage', () => {
    let state = stateWithSku();
    state = createRetailOcrProviderProfile(state, { code: 'MANUAL-OCR', name: 'Manual supplier OCR', mode: 'manual', supportedDocumentKinds: ['supplier-invoice'] }, 'maker', '00000000-0000-4000-8000-000000000010', '2026-07-30T09:00:00.000Z');
    expect(() => testRetailOcrProvider(state, { id: '00000000-0000-4000-8000-000000000010', evidence: 'not configured', expectedVersion: 1 }, 'checker')).toThrow('configured');
    state = configureRetailOcrProvider(state, { id: '00000000-0000-4000-8000-000000000010', credentialFingerprint: realChecksum });
    expect(() => testRetailOcrProvider(state, { id: '00000000-0000-4000-8000-000000000010', evidence: 'maker cannot certify', expectedVersion: 2 }, 'maker')).toThrow(/maker/i);
    expect(() => testRetailOcrProvider(state, { id: '00000000-0000-4000-8000-000000000010', evidence: 'Sample supplier invoice parsed and reconciled against GST and totals', expectedVersion: 2 }, 'checker')).toThrow(/built-in sample/i);
    state = testRetailOcrProvider(state, { id: '00000000-0000-4000-8000-000000000010', evidence: 'sample supplier invoice reconciled', expectedVersion: 2 }, 'checker', '2026-07-30T09:00:00.000Z');
    expect(state.retailOcrProviderProfiles[0]).toMatchObject({ status: 'certified', credentialStatus: 'configured', lastTestedAt: '2026-07-30T09:00:00.000Z', lastTestedBy: 'checker', lastTestChecksum: expect.stringMatching(/^[a-f0-9]{64}$/), testEvidenceByDocumentKind: { 'supplier-invoice': { testedBy: 'checker', checksum: expect.stringMatching(/^[a-f0-9]{64}$/) } } });
  });

  it('keeps old marketplace and OCR evidence auditable but invalid after a credential rotation', () => {
    let state = stateWithSku();
    const commerceId = '00000000-0000-4000-8000-000000000110';
    state = createRetailCommerceConnector(state, { code: 'ROTATE-ONDC', name: 'Credential rotation ONDC', channel: 'ondc', environment: 'production', baseUrl: 'https://ondc.example', capabilities: ['order-pull'] }, 'maker', commerceId, '2026-08-02T09:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: commerceId, fingerprint: realChecksum });
    state = createRetailCommerceConformanceCase(state, { connectorId: commerceId, capability: 'order-pull', suiteName: 'ONDC production', suiteVersion: '1.0', scenario: 'Order pull with canonical lifecycle evidence' }, 'maker', '00000000-0000-4000-8000-000000000111', '2026-08-02T09:02:00.000Z');
    state = recordRetailCommerceConformance(state, { id: '00000000-0000-4000-8000-000000000111', result: 'passed', evidenceReference: 'ONDC-REPLAY-V1', resultChecksum: 'c'.repeat(64), expectedVersion: 1 }, 'checker', '2026-08-02T09:03:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: commerceId, fingerprint: 'd'.repeat(64) });

    expect(state.retailCommerceConnectors[0]).toMatchObject({ credentialRevision: 2, status: 'configured' });
    expect(state.retailCommerceConformanceCases[0]).toMatchObject({ credentialRevision: 1, result: 'passed' });
    state = planRetailCommerceConformancePack(state, { connectorId: commerceId, suiteName: 'ONDC production', suiteVersion: '1.1' }, 'maker', '2026-08-02T09:04:00.000Z');
    expect(state.retailCommerceConformanceCases[0]).toMatchObject({ credentialRevision: 2, capability: 'order-pull', result: 'planned' });

    const ocrId = '00000000-0000-4000-8000-000000000112';
    state = createRetailOcrProviderProfile(state, { code: 'ROTATE-OCR', name: 'Credential rotation OCR', mode: 'api', baseUrl: 'https://ocr.example', supportedDocumentKinds: ['supplier-invoice', 'credit-note'] }, 'maker', ocrId, '2026-08-02T09:05:00.000Z');
    state = configureRetailOcrProvider(state, { id: ocrId, credentialFingerprint: realChecksum });
    state = testRetailOcrProvider(state, { id: ocrId, documentKind: 'supplier-invoice', evidence: 'Independent supplier invoice replay against production adapter.', expectedVersion: 2 }, 'checker', '2026-08-02T09:06:00.000Z');
    state = testRetailOcrProvider(state, { id: ocrId, documentKind: 'credit-note', evidence: 'Independent credit note replay against production adapter.', expectedVersion: 3 }, 'checker', '2026-08-02T09:07:00.000Z');
    state = configureRetailOcrProvider(state, { id: ocrId, credentialFingerprint: 'e'.repeat(64) });

    expect(state.retailOcrProviderProfiles[0]).toMatchObject({ credentialRevision: 2, status: 'configured', testEvidenceByDocumentKind: { 'supplier-invoice': { credentialRevision: 1 }, 'credit-note': { credentialRevision: 1 } } });
    const freshness = computeRetailCertificationFreshness({ commerceConnectors: state.retailCommerceConnectors, commerceCases: state.retailCommerceConformanceCases, ocrProviders: state.retailOcrProviderProfiles, providerConnectors: [], providerCases: [], asOfDate: '2026-08-02' });
    expect(freshness.rows.filter((row) => row.ownerId === commerceId)).toEqual([expect.objectContaining({ capability: 'order-pull', status: 'missing' })]);
    expect(freshness.rows.filter((row) => row.ownerId === ocrId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'supplier-invoice', status: 'missing' }),
      expect.objectContaining({ capability: 'credit-note', status: 'missing' }),
    ]));
  });

  it('scans OCR documents into idempotent purchase exceptions and requires an independent resolution', () => {
    let state = stateWithSku();
    state = createRetailPurchaseOcrDocument(state, { source: 'upload', fileName: 'invoice.pdf', fileChecksum: checksum, extractedInvoiceNumber: 'SUP-DUP-1', extractedTotalAmount: 500, extractionConfidence: 0.6, lines: [{ description: 'Unmapped tea line', quantity: 1, unitPrice: 100, gstRate: 5, confidence: 0.55 }] }, 'maker', '00000000-0000-4000-8000-000000000017', '2026-07-30T09:07:00.000Z');
    state = decideRetailPurchaseOcr(state, { id: '00000000-0000-4000-8000-000000000017', decision: 'approved', evidence: 'Header reviewed; exceptions intentionally remain open for control queue.', expectedVersion: 1 }, 'checker');
    state = scanRetailPurchaseExceptions(state, { ocrDocumentId: '00000000-0000-4000-8000-000000000017' }, 'maker', '2026-07-30T09:08:00.000Z');
    expect(state.retailPurchaseExceptions.map((item) => item.kind)).toEqual(expect.arrayContaining(['low-confidence', 'unmapped-line', 'total-mismatch']));
    const first = state.retailPurchaseExceptions[0]!;
    const count = state.retailPurchaseExceptions.length;
    state = scanRetailPurchaseExceptions(state, { ocrDocumentId: '00000000-0000-4000-8000-000000000017' }, 'maker');
    expect(state.retailPurchaseExceptions).toHaveLength(count);
    expect(() => resolveRetailPurchaseException(state, { id: first.id, decision: 'resolved', evidence: 'maker cannot resolve', expectedVersion: first.version }, 'maker')).toThrow('maker');
    state = resolveRetailPurchaseException(state, { id: first.id, decision: 'resolved', evidence: 'Invoice evidence and controlled master reviewed', expectedVersion: first.version }, 'checker', '2026-07-30T09:09:00.000Z');
    expect(state.retailPurchaseExceptions.find((item) => item.id === first.id)).toMatchObject({ status: 'resolved', resolvedBy: 'checker' });
  });

  it('builds checksummed catalog/inventory pushes and enforces maker-checker acknowledgement', () => {
    let state = stateWithSku();
    state = createRetailCommerceConnector(state, { code: 'ONDC-SELLER', name: 'ONDC seller', channel: 'ondc', environment: 'sandbox', baseUrl: 'https://sandbox.ondc.example', capabilities: ['catalog-push', 'inventory-push', 'order-pull'] }, 'maker', '00000000-0000-4000-8000-000000000011', '2026-07-30T09:01:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: '00000000-0000-4000-8000-000000000011', fingerprint: checksum });
    state = createRetailCommerceCatalogMapping(state, { connectorId: '00000000-0000-4000-8000-000000000011', remoteSku: 'ONDC-TEA-1KG', itemVariantId: 'variant-tea', remoteTitle: 'Assam tea 1kg' }, 'maker', '00000000-0000-4000-8000-000000000010', '2026-07-30T09:01:30.000Z');
    expect(() => decideRetailCommerceCatalogMapping(state, { id: '00000000-0000-4000-8000-000000000010', decision: 'approved', evidence: 'maker cannot approve own mapping', expectedVersion: 1 }, 'maker')).toThrow('maker');
    state = decideRetailCommerceCatalogMapping(state, { id: '00000000-0000-4000-8000-000000000010', decision: 'approved', evidence: 'Remote SKU, local GST item and connector identity independently reconciled', expectedVersion: 1 }, 'checker');
    state = prepareRetailCommercePushBatch(state, { connectorId: '00000000-0000-4000-8000-000000000011', kind: 'catalog', itemVariantIds: ['variant-tea'] }, 'maker', '00000000-0000-4000-8000-000000000012', '2026-07-30T09:02:00.000Z');
    expect(state.retailCommercePushBatches[0]).toMatchObject({ id: '00000000-0000-4000-8000-000000000012', status: 'prepared', records: [{ sku: 'TEA-1KG-REG', remoteSku: 'ONDC-TEA-1KG', quantity: 0 }] });
    const preparedPayloadChecksum = state.retailCommercePushBatches[0]!.payloadChecksum;
    expect(() => decideRetailCommercePushBatch(state, { id: '00000000-0000-4000-8000-000000000012', decision: 'acknowledged', evidence: 'maker cannot acknowledge', providerPayloadChecksum: preparedPayloadChecksum, responseChecksum: 'b'.repeat(64), responseByteLength: 64, expectedVersion: 1 }, 'maker')).toThrow('maker');
    expect(() => decideRetailCommercePushBatch(state, { id: '00000000-0000-4000-8000-000000000012', decision: 'acknowledged', evidence: 'Provider payload accepted in certified sandbox replay', providerPayloadChecksum: preparedPayloadChecksum, responseChecksum: 'b'.repeat(64), responseByteLength: 64, expectedVersion: 1 }, 'checker')).toThrow(/built-in sample/i);
    state = decideRetailCommercePushBatch(state, { id: '00000000-0000-4000-8000-000000000012', decision: 'acknowledged', evidence: 'sandbox payload accepted', providerPayloadChecksum: preparedPayloadChecksum, responseChecksum: 'b'.repeat(64), responseByteLength: 64, providerReference: 'ONDC-PUSH-001', expectedVersion: 1 }, 'checker');
    expect(state.retailCommercePushBatches[0]!.status).toBe('acknowledged');
  });

  it('supports remote order confirmation, fulfilment, returns and RTO evidence', () => {
    let state = stateWithSku();
    state = createRetailCommerceConnector(state, { code: 'MARKETPLACE', name: 'Marketplace', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull'] }, 'maker', '00000000-0000-4000-8000-000000000013', '2026-07-30T09:03:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: '00000000-0000-4000-8000-000000000013', fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId: '00000000-0000-4000-8000-000000000013', remoteOrderId: 'remote-1', orderNumber: 'MKT-1', remoteCreatedAt: '2026-07-30T09:04:00.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-tea', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'operator', '00000000-0000-4000-8000-000000000014', '2026-07-30T09:04:01.000Z');
    state = transitionRetailCommerceOrder(state, { id: '00000000-0000-4000-8000-000000000014', status: 'confirmed', evidence: 'marketplace confirmation callback', expectedVersion: 1 }, 'operator');
    expect(() => transitionRetailCommerceOrder(state, { id: '00000000-0000-4000-8000-000000000014', status: 'rto', evidence: 'missing RTO reference', expectedVersion: 2 }, 'operator')).toThrow('RTO');
    state = transitionRetailCommerceOrder(state, { id: '00000000-0000-4000-8000-000000000014', status: 'rto', evidence: 'carrier RTO scan callback', rtoReference: 'RTO-1', expectedVersion: 2 }, 'operator');
    expect(state.retailCommerceOrders[0]).toMatchObject({ status: 'rto', rtoReference: 'RTO-1' });
  });

  it('plans one complete, idempotent capability pack for an ONDC connector', () => {
    let state = stateWithSku();
    state = createRetailCommerceConnector(state, { code: 'ONDC-PACK', name: 'ONDC capability pack', channel: 'ondc', environment: 'sandbox', baseUrl: 'https://sandbox.ondc.example', capabilities: ['catalog-push', 'inventory-push', 'order-pull', 'settlement-pull'] }, 'maker', '00000000-0000-4000-8000-000000000070', '2026-07-30T09:10:00.000Z');
    state = planRetailCommerceConformancePack(state, { connectorId: '00000000-0000-4000-8000-000000000070', suiteName: 'ONDC India seller pack', suiteVersion: '1.0', }, 'maker', '2026-07-30T09:11:00.000Z');
    expect(state.retailCommerceConformanceCases).toHaveLength(4);
    expect(state.retailCommerceConformanceCases.map((item) => item.capability)).toEqual(expect.arrayContaining(['catalog-push', 'inventory-push', 'order-pull', 'settlement-pull']));
    expect(state.retailCommerceConformanceCases.every((item) => item.result === 'planned')).toBe(true);
    const replay = planRetailCommerceConformancePack(state, { connectorId: '00000000-0000-4000-8000-000000000070', suiteName: 'ONDC India seller pack', suiteVersion: '1.0' }, 'maker', '2026-07-30T09:12:00.000Z');
    expect(replay.retailCommerceConformanceCases).toHaveLength(4);
  });

  it('reserves handed-off marketplace stock atomically and releases it on cancellation', () => {
    let state = stateWithSku();
    state = {
      ...state,
      stockLocations: [{ id: 'location-marketplace', code: 'MKT', name: 'Marketplace dispatch', stateCode: '27', active: true, scope: { ...state.scope }, version: 1 }],
      stockPositions: [{ id: 'position-tea', locationId: 'location-marketplace', productId: 'product-tea', onHand: 5, reserved: 0, available: 5, scope: { ...state.scope }, version: 1 }],
    };
    state = createRetailCommerceConnector(state, { code: 'MKT-RESERVE', name: 'Marketplace reservation', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull'] }, 'maker', '00000000-0000-4000-8000-000000000041', '2026-07-30T09:30:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: '00000000-0000-4000-8000-000000000041', fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId: '00000000-0000-4000-8000-000000000041', remoteOrderId: 'REMOTE-RESERVE', orderNumber: 'MKT-RESERVE', remoteCreatedAt: '2026-07-30T09:31:00.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-tea', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'operator', '00000000-0000-4000-8000-000000000042', '2026-07-30T09:31:00.000Z');
    const salesOrder = { id: 'sales-order-reserve', number: 'SO-MKT-1', accountId: 'account-marketplace', currency: 'INR', orderDate: '2026-07-30', requiredBy: '2026-08-01', status: 'confirmed', fulfilmentStatus: 'planned', lines: [{ id: 'sales-line-tea', productInterestId: 'interest-tea', description: 'Assam tea regular', hsnSac: '0902', quantity: 1, unitPrice: 100, taxableValue: 100, gstRate: 5, catalogProductId: 'product-tea' }], subtotal: 100, discountTotal: 0, taxPreview: { treatment: 'intra-state', taxableValue: 100, cgst: 2.5, sgst: 2.5, totalTax: 5, grandTotal: 105, determination: 'commercial-estimate' }, approvedQuoteVersion: 1, createdBy: 'maker', createdAt: '2026-07-30T09:31:00.000Z', scope: { ...state.scope }, version: 1 } as const;
    state = { ...state, salesOrders: [salesOrder] as never[] };
    state = handoffRetailCommerceOrder(state, { orderId: '00000000-0000-4000-8000-000000000042', salesOrderId: salesOrder.id, evidence: 'Marketplace amount and GST reconciled to local order', expectedVersion: 1 }, 'operator');
    state = transitionRetailCommerceOrder(state, { id: '00000000-0000-4000-8000-000000000042', status: 'confirmed', evidence: 'Marketplace confirmation callback reconciled to local order', expectedVersion: 2 }, 'operator', '2026-07-30T09:31:30.000Z');
    state = reserveRetailCommerceOrder(state, { orderId: '00000000-0000-4000-8000-000000000042', locationId: 'location-marketplace', evidence: 'Available stock reserved for marketplace fulfilment', expectedVersion: 3 }, 'operator', '2026-07-30T09:32:00.000Z');
    expect(state.stockPositions[0]).toMatchObject({ reserved: 1, available: 4 });
    expect(state.retailCommerceOrders[0]).toMatchObject({ inventoryReservationIds: [expect.any(String)], inventoryReservationLocationId: 'location-marketplace', version: 4 });
    expect(() => transitionRetailCommerceOrder(state, { id: '00000000-0000-4000-8000-000000000042', status: 'fulfilled', evidence: 'Provider fulfilled before physical dispatch', expectedVersion: 4 }, 'operator', '2026-07-30T09:32:30.000Z')).toThrow(/packed or issued/i);
    const packedState = { ...state, stockReservations: state.stockReservations.map((reservation) => ({ ...reservation, status: 'packed' as const })) };
    expect(() => transitionRetailCommerceOrder(packedState, { id: '00000000-0000-4000-8000-000000000042', status: 'cancelled', evidence: 'Provider cancellation after packing', expectedVersion: 4 }, 'operator', '2026-07-30T09:32:45.000Z')).toThrow(/packed or issued/i);
    state = transitionRetailCommerceOrder(state, { id: '00000000-0000-4000-8000-000000000042', status: 'cancelled', evidence: 'Marketplace cancellation callback received', expectedVersion: 4 }, 'operator', '2026-07-30T09:33:00.000Z');
    expect(state.stockPositions[0]).toMatchObject({ reserved: 0, available: 5 });
    expect(state.stockReservations[0]?.status).toBe('released');
  });

  it('blocks remote fulfilment until local stock has been reserved', () => {
    let state = stateWithSku();
    state = createRetailCommerceConnector(state, { code: 'MKT-GATE', name: 'Marketplace fulfilment gate', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull'] }, 'maker', '00000000-0000-4000-8000-000000000051', '2026-07-30T09:40:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: '00000000-0000-4000-8000-000000000051', fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId: '00000000-0000-4000-8000-000000000051', remoteOrderId: 'REMOTE-GATE', orderNumber: 'MKT-GATE', remoteCreatedAt: '2026-07-30T09:41:00.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-tea', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'operator', '00000000-0000-4000-8000-000000000052', '2026-07-30T09:41:00.000Z');
    state = transitionRetailCommerceOrder(state, { id: '00000000-0000-4000-8000-000000000052', status: 'confirmed', evidence: 'Marketplace confirmation callback', expectedVersion: 1 }, 'operator');
    expect(() => transitionRetailCommerceOrder(state, { id: '00000000-0000-4000-8000-000000000052', status: 'fulfilled', evidence: 'Provider says fulfilled', expectedVersion: 2 }, 'operator')).toThrow('reservation');
  });

  it('resolves remote marketplace SKUs only through connector mappings and protects mapping retirement', () => {
    let state = stateWithSku();
    state = createRetailCommerceConnector(state, { code: 'MKT-MAP', name: 'Marketplace mapping', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull'] }, 'maker', '00000000-0000-4000-8000-000000000021', '2026-07-30T09:11:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: '00000000-0000-4000-8000-000000000021', fingerprint: checksum });
    expect(() => importRetailCommerceOrder(state, { connectorId: '00000000-0000-4000-8000-000000000021', remoteOrderId: 'REMOTE-UNMAPPED', orderNumber: 'MKT-UNMAPPED', remoteCreatedAt: '2026-07-30T09:11:00.000Z', remotePayloadChecksum: checksum, lines: [{ remoteSku: 'REMOTE-TEA', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'operator')).toThrow('no active connector mapping');
    state = createRetailCommerceCatalogMapping(state, { connectorId: '00000000-0000-4000-8000-000000000021', remoteSku: 'REMOTE-TEA', itemVariantId: 'variant-tea' }, 'maker', '00000000-0000-4000-8000-000000000022', '2026-07-30T09:12:00.000Z');
    state = decideRetailCommerceCatalogMapping(state, { id: '00000000-0000-4000-8000-000000000022', decision: 'approved', evidence: 'Remote marketplace SKU independently reconciled to local tea variant', expectedVersion: 1 }, 'checker');
    state = importRetailCommerceOrder(state, { connectorId: '00000000-0000-4000-8000-000000000021', remoteOrderId: 'REMOTE-MAPPED', orderNumber: 'MKT-MAPPED', remoteCreatedAt: '2026-07-30T09:12:00.000Z', remotePayloadChecksum: checksum, lines: [{ remoteSku: 'remote-tea', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'operator', '00000000-0000-4000-8000-000000000023', '2026-07-30T09:12:01.000Z');
    expect(state.retailCommerceOrders[0]!.lines[0]).toMatchObject({ itemVariantId: 'variant-tea', remoteSku: 'REMOTE-TEA' });
    expect(() => disableRetailCommerceCatalogMapping(state, { id: '00000000-0000-4000-8000-000000000022', expectedVersion: 2, evidence: 'maker cannot disable own mapping' }, 'maker')).toThrow('maker');
    state = disableRetailCommerceCatalogMapping(state, { id: '00000000-0000-4000-8000-000000000022', expectedVersion: 2, evidence: 'Remote catalogue identity retired after independent review' }, 'checker');
    expect(state.retailCommerceCatalogMappings[0]).toMatchObject({ status: 'disabled', disabledBy: 'checker', version: 3 });
  });

  it('certifies ONDC conformance only from an independent result checksum', () => {
    let state = stateWithSku();
    state = createRetailCommerceConnector(state, { code: 'ONDC-CASE', name: 'ONDC case', channel: 'ondc', environment: 'sandbox', baseUrl: 'https://sandbox.ondc.example', capabilities: ['order-pull'] }, 'maker', '00000000-0000-4000-8000-000000000015', '2026-07-30T09:05:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: '00000000-0000-4000-8000-000000000015', fingerprint: realChecksum });
    state = createRetailCommerceConformanceCase(state, { connectorId: '00000000-0000-4000-8000-000000000015', suiteName: 'ONDC seller', suiteVersion: '1.0', scenario: 'order callback and cancellation replay' }, 'maker', '00000000-0000-4000-8000-000000000016', '2026-07-30T09:06:00.000Z');
    expect(() => recordRetailCommerceConformance(state, { id: '00000000-0000-4000-8000-000000000016', result: 'passed', evidenceReference: 'maker cannot assess', resultChecksum: checksum, expectedVersion: 1 }, 'maker')).toThrow('maker');
    expect(() => recordRetailCommerceConformance(state, { id: '00000000-0000-4000-8000-000000000016', result: 'passed', evidenceReference: 'Provider sandbox case pack and callback replay attached', resultChecksum: realChecksum, expectedVersion: 1 }, 'checker')).toThrow(/built-in sample/i);
    state = recordRetailCommerceConformance(state, { id: '00000000-0000-4000-8000-000000000016', result: 'passed', evidenceReference: 'ONDC sandbox evidence pack', resultChecksum: realChecksum, expectedVersion: 1 }, 'checker');
    expect(state.retailCommerceConformanceCases[0]!.result).toBe('passed');
    expect(state.retailCommerceConnectors[0]!.status).toBe('certified');
  });

  it('does not certify a multi-capability connector until every declared capability passes', () => {
    let state = stateWithSku();
    const connectorId = '00000000-0000-4000-8000-000000000061';
    state = createRetailCommerceConnector(state, { code: 'MKT-MULTI', name: 'Marketplace multi capability', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://sandbox.marketplace.example', capabilities: ['order-pull', 'settlement-pull'] }, 'maker', connectorId, '2026-07-30T10:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId, fingerprint: checksum });
    state = createRetailCommerceConformanceCase(state, { connectorId, capability: 'order-pull', suiteName: 'Marketplace seller', suiteVersion: '1.0', scenario: 'order pull replay' }, 'maker', '00000000-0000-4000-8000-000000000062', '2026-07-30T10:01:00.000Z');
    state = recordRetailCommerceConformance(state, { id: '00000000-0000-4000-8000-000000000062', result: 'passed', evidenceReference: 'Order pull sandbox evidence', resultChecksum: realChecksum, expectedVersion: 1 }, 'checker', '2026-07-30T10:02:00.000Z');
    expect(state.retailCommerceConnectors[0]!.status).toBe('configured');
    state = createRetailCommerceConformanceCase(state, { connectorId, capability: 'settlement-pull', suiteName: 'Marketplace seller', suiteVersion: '1.0', scenario: 'settlement pull replay' }, 'maker', '00000000-0000-4000-8000-000000000063', '2026-07-30T10:03:00.000Z');
    state = recordRetailCommerceConformance(state, { id: '00000000-0000-4000-8000-000000000063', result: 'passed', evidenceReference: 'Settlement pull sandbox evidence', resultChecksum: realChecksum, expectedVersion: 1 }, 'checker', '2026-07-30T10:04:00.000Z');
    expect(state.retailCommerceConnectors[0]!.status).toBe('certified');
  });

  it('requires amount-reconciled local sales-order handoff before channel fulfilment', () => {
    let state = stateWithSku();
    state = createRetailCommerceConnector(state, { code: 'MKT-HANDOFF', name: 'Marketplace handoff', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull'] }, 'maker', '00000000-0000-4000-8000-000000000031', '2026-07-30T09:20:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: '00000000-0000-4000-8000-000000000031', fingerprint: checksum });
    state = importRetailCommerceOrder(state, { connectorId: '00000000-0000-4000-8000-000000000031', remoteOrderId: 'REMOTE-HANDOFF', orderNumber: 'MKT-HANDOFF', remoteCreatedAt: '2026-07-30T09:21:00.000Z', remotePayloadChecksum: checksum, lines: [{ itemVariantId: 'variant-tea', quantity: 1, unitPrice: 100, gstRate: 5 }] }, 'operator', '00000000-0000-4000-8000-000000000032', '2026-07-30T09:21:00.000Z');
    const salesOrder = { id: 'sales-order-channel-1', number: 'SO-26-27-00001', accountId: 'account-channel', currency: 'INR', orderDate: '2026-07-30', requiredBy: '2026-08-01', status: 'confirmed', fulfilmentStatus: 'planned', lines: [], subtotal: 100, discountTotal: 0, taxPreview: { treatment: 'intra-state', taxableValue: 100, cgst: 3, sgst: 3, totalTax: 6, grandTotal: 106, determination: 'commercial-estimate' }, approvedQuoteVersion: 1, createdBy: 'maker', createdAt: '2026-07-30T09:21:00.000Z', scope: { ...state.scope }, version: 1 } as const;
    state = { ...state, salesOrders: [salesOrder] as never[] };
    expect(() => handoffRetailCommerceOrder(state, { orderId: '00000000-0000-4000-8000-000000000032', salesOrderId: salesOrder.id, evidence: 'Amount and GST checked', expectedVersion: 1 }, 'operator')).toThrow('does not reconcile');
    const imported = state.retailCommerceOrders[0]!;
    const matchingOrder = { ...imported, totalAmount: 105 };
    state = { ...state, retailCommerceOrders: [matchingOrder], salesOrders: [{ ...salesOrder, taxPreview: { ...salesOrder.taxPreview, cgst: 2.5, sgst: 2.5, totalTax: 5, grandTotal: 105 } }] as never[] };
    state = handoffRetailCommerceOrder(state, { orderId: matchingOrder.id, salesOrderId: salesOrder.id, evidence: 'Remote order amount and GST reconciled to local sales order', expectedVersion: 1 }, 'operator');
    expect(state.retailCommerceOrders[0]).toMatchObject({ localSalesOrderId: salesOrder.id, salesOrderHandoffBy: 'operator', version: 2 });
  });

  it('creates one balanced marketplace settlement journal handoff after reconciliation', () => {
    const state = { ...stateWithSku(), retailSettlementReconciliations: [{ id: 'settlement-1', number: 'RSET/26-27/00001', connectorId: 'connector-1', settlementReference: 'PAYOUT-1', periodFrom: '2026-07-01', periodTo: '2026-07-30', grossAmount: 100, feeAmount: 5, taxWithheldAmount: 0, netAmount: 95, localNetAmount: 95, varianceAmount: 0, orderIds: [], remotePayloadChecksum: checksum, status: 'matched' as const, requestedBy: 'maker', requestedAt: '2026-07-30T09:00:00.000Z', scope: { ...stateWithSku().scope }, version: 1 }] };
    const prepared = prepareRetailSettlementJournal(state, { id: 'settlement-1', expectedVersion: 1 }, 'maker', '2026-07-30T09:10:00.000Z');
    expect(prepared.journalDrafts[0]).toMatchObject({ sourceType: 'retail-commerce-settlement', sourceId: 'settlement-1', totalDebit: 100, totalCredit: 100, status: 'ready' });
    expect(prepared.retailSettlementReconciliations[0]).toMatchObject({ journalDraftId: prepared.journalDrafts[0]!.id, version: 2 });
    expect(prepareRetailSettlementJournal(prepared, { id: 'settlement-1', expectedVersion: 2 }, 'maker').journalDrafts).toHaveLength(1);
  });

  it('does not prepare a journal while a linked marketplace order is still open', () => {
    const state = {
      ...stateWithSku(),
      retailCommerceOrders: [{ id: 'open-order-1', connectorId: 'connector-1', remoteOrderId: 'REMOTE-OPEN-1', orderNumber: 'MKT-OPEN-1', status: 'imported' as const, lines: [], totalAmount: 100, remoteCreatedAt: '2026-07-01T10:00:00.000Z', remotePayloadChecksum: checksum, importedBy: 'maker', importedAt: '2026-07-01T10:00:00.000Z', scope: { ...stateWithSku().scope }, version: 1 }],
      retailSettlementReconciliations: [{ id: 'settlement-open-order', number: 'RSET/26-27/00004', connectorId: 'connector-1', settlementReference: 'PAYOUT-OPEN-1', periodFrom: '2026-07-01', periodTo: '2026-07-30', grossAmount: 100, feeAmount: 5, taxWithheldAmount: 0, netAmount: 95, localNetAmount: 95, varianceAmount: 0, orderIds: ['open-order-1'], remotePayloadChecksum: checksum, status: 'matched' as const, requestedBy: 'maker', requestedAt: '2026-07-30T09:00:00.000Z', scope: { ...stateWithSku().scope }, version: 1 }],
    };
    expect(() => prepareRetailSettlementJournal(state, { id: 'settlement-open-order', expectedVersion: 1 }, 'maker')).toThrow(/terminal/i);
  });

  it('keeps marketplace refund deductions visible and balanced in the settlement journal', () => {
    const state = { ...stateWithSku(), retailSettlementReconciliations: [{ id: 'settlement-refund', number: 'RSET/26-27/00002', connectorId: 'connector-1', settlementReference: 'PAYOUT-REFUND-1', periodFrom: '2026-07-01', periodTo: '2026-07-30', grossAmount: 100, refundAmount: 20, feeAmount: 5, taxWithheldAmount: 5, netAmount: 70, localNetAmount: 70, varianceAmount: 0, orderIds: [], remotePayloadChecksum: checksum, status: 'matched' as const, requestedBy: 'maker', requestedAt: '2026-07-30T09:00:00.000Z', scope: { ...stateWithSku().scope }, version: 1 }] };
    const prepared = prepareRetailSettlementJournal(state, { id: 'settlement-refund', expectedVersion: 1 }, 'maker', '2026-07-30T09:11:00.000Z');
    expect(prepared.journalDrafts[0]).toMatchObject({ totalDebit: 100, totalCredit: 100, status: 'ready' });
    expect(prepared.journalDrafts[0]!.lines).toEqual(expect.arrayContaining([{ accountCode: 'sales-returns', debit: 20, credit: 0, memo: 'RSET/26-27/00002 marketplace refunds' }]));
  });
});
