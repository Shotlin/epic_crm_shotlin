import { createHash, randomUUID } from 'node:crypto';
import type { AccountingJournalDraft, JournalLine, RevenueOpsState } from '../shared/revenue-ops-contracts';
import type {
  ApplyRetailPurchaseOcrMappingInput,
  ConfigureRetailOcrProviderInput,
  CreateRetailCommerceConformanceCaseInput,
  CreateRetailOcrProviderProfileInput,
  DecideRetailCommercePushInput,
  PrepareRetailCommercePushInput,
  PrepareRetailPurchaseOcrMappingInput,
  PlanRetailCommerceConformancePackInput,
  RecordRetailCommerceConformanceInput,
  PrepareRetailSettlementJournalInput,
  LinkRetailCommerceReturnInput,
  ResolveRetailPurchaseExceptionInput,
  RetailCommerceConformanceCase,
  RetailCommerceCapability,
  RetailCommercePushBatch,
  RetailOcrProviderProfile,
  RetailOcrDocumentKind,
  RetailPurchaseException,
  RetailPurchaseOcrMapping,
  ReserveRetailCommerceOrderInput,
  ScanRetailPurchaseExceptionsInput,
  TestRetailOcrProviderInput,
  TransitionRetailCommerceOrderInput,
} from '../shared/retail-commerce-contracts';
import { retailCommerceConformanceMatchesCredentialRevision, retailCommerceCredentialRevision } from '../shared/retail-commerce-contracts';
import { normalizeRetailPurchaseOcrExtraction } from './retail-ocr-normalization';
import { mappingForRetailCommerceVariant } from './retail-commerce-mapping';
import { assertRetailSettlementOrderClosure } from './retail-commerce';
import { releaseStockReservation, reserveStock } from './fulfilment-control';

const checksum = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const clean = (value: string, label: string, min = 2, max = 300) => { const normalized = value.trim().replace(/\s+/g, ' '); if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`); return normalized; };
const sha256 = (value: string, label: string) => { if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`${label} must be a SHA-256 checksum.`); if (/^a{64}$/i.test(value)) throw new Error(`${label} must come from a real provider response, not a placeholder.`); return value.toLowerCase(); };
const externalEvidence = (value: string, label: string) => { const normalized = clean(value, label); const placeholders = new Set(['Sample supplier invoice parsed and reconciled against GST and totals', 'Provider payload accepted in certified sandbox replay', 'Provider sandbox case pack and callback replay attached']); if (placeholders.has(normalized)) throw new Error(`${label} must reference real assessed provider evidence, not the built-in sample.`); return normalized; };
const mutate = (state: RevenueOpsState) => ({ ...structuredClone(state), revision: state.revision + 1 });
const scoped = (state: RevenueOpsState, record?: { scope?: RevenueOpsState['scope'] }) => { const scope = record?.scope ?? state.scope; return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId; };
const fiscalNumber = (prefix: string, sequence: number, at: string) => { const date = new Date(at); const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1; return `${prefix}/${String(year).slice(-2)}-${String(year + 1).slice(-2)}/${String(sequence).padStart(5, '0')}`; };

export function createRetailOcrProviderProfile(state: RevenueOpsState, input: CreateRetailOcrProviderProfileInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const code = input.code.trim().toUpperCase(); if (!/^[A-Z][A-Z0-9-]{1,23}$/.test(code) || state.retailOcrProviderProfiles.some((item) => item.code === code && scoped(state, item))) throw new Error('OCR provider code is invalid or already exists.');
  if (!input.supportedDocumentKinds.length) throw new Error('OCR provider must declare at least one document kind.');
  let baseUrl: string | undefined;
  if (input.mode === 'api') {
    if (!input.baseUrl) throw new Error('An API OCR provider requires a credential-free HTTPS base URL.');
    const parsed = new URL(input.baseUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('OCR provider base URL must be a credential-free HTTPS origin.');
    baseUrl = parsed.toString().replace(/\/$/, '');
  }
  const next = mutate(state); const profile: RetailOcrProviderProfile = { id, code, name: clean(input.name, 'OCR provider name'), mode: input.mode, baseUrl, status: 'draft', credentialStatus: 'missing', credentialRevision: 0, supportedDocumentKinds: [...new Set(input.supportedDocumentKinds)], createdBy: actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }; next.retailOcrProviderProfiles.unshift(profile); return next;
}

export function configureRetailOcrProvider(state: RevenueOpsState, input: ConfigureRetailOcrProviderInput): RevenueOpsState {
  const profile = state.retailOcrProviderProfiles.find((item) => item.id === input.id && scoped(state, item)); if (!profile || profile.status === 'suspended') throw new Error('OCR provider profile is missing or suspended.');
  const fingerprint = sha256(input.credentialFingerprint ?? '', 'OCR credential fingerprint'); const unchanged = profile.credentialStatus === 'configured' && profile.credentialFingerprint === fingerprint; const next = mutate(state); next.retailOcrProviderProfiles = next.retailOcrProviderProfiles.map((item) => item.id === profile.id ? { ...item, credentialStatus: 'configured' as const, credentialFingerprint: fingerprint, credentialRevision: unchanged ? Math.max(1, retailCommerceCredentialRevision(item)) : retailCommerceCredentialRevision(item) + 1, status: unchanged ? item.status : 'configured' as const, version: item.version + 1 } : item); return next;
}

export function testRetailOcrProvider(state: RevenueOpsState, input: TestRetailOcrProviderInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const profile = state.retailOcrProviderProfiles.find((item) => item.id === input.id && scoped(state, item)); if (!profile || profile.status === 'suspended' || profile.credentialStatus !== 'configured' || profile.version !== input.expectedVersion) throw new Error('OCR provider must be configured and current before testing.'); if (profile.createdBy === actorId) throw new Error('OCR provider profile maker cannot assess the same provider test.');
  if (input.documentKind && !profile.supportedDocumentKinds.includes(input.documentKind)) throw new Error('OCR document kind is not declared by this provider profile.');
  const evidence = externalEvidence(input.evidence, 'OCR provider test evidence');
  const lastTestChecksum = createHash('sha256').update(JSON.stringify({ providerId: profile.id, evidence, actorId, testedAt: now })).digest('hex');
  const documentKind: RetailOcrDocumentKind = input.documentKind ?? 'supplier-invoice';
  const testEvidenceByDocumentKind = { ...(profile.testEvidenceByDocumentKind ?? {}), [documentKind]: { evidence, testedAt: now, testedBy: actorId, checksum: lastTestChecksum, credentialRevision: retailCommerceCredentialRevision(profile) } };
  state = { ...state, retailOcrProviderProfiles: state.retailOcrProviderProfiles.map((item) => item.id === profile.id ? { ...item, testEvidenceByDocumentKind } : item) };
  const next = mutate(state); next.retailOcrProviderProfiles = next.retailOcrProviderProfiles.map((item) => item.id === profile.id ? { ...item, status: 'certified' as const, lastTestEvidence: `${evidence} · ${actorId}`, lastTestedAt: now, lastTestedBy: actorId, lastTestChecksum, version: item.version + 1 } : item); return next;
}

export function prepareRetailPurchaseOcrMapping(state: RevenueOpsState, input: PrepareRetailPurchaseOcrMappingInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const document = state.retailPurchaseOcrDocuments.find((item) => item.id === input.ocrDocumentId && item.status === 'approved' && scoped(state, item)); if (!document) throw new Error('An approved OCR document is required for PO-line mapping.');
  if (!input.mappings.length || input.mappings.length !== document.lines.length || new Set(input.mappings.map((item) => item.ocrLineId)).size !== input.mappings.length) throw new Error('PO-line mapping must cover every OCR line exactly once.');
  const mappings = input.mappings.map((mapping) => { if (!document.lines.some((line) => line.id === mapping.ocrLineId)) throw new Error('PO-line mapping references an OCR line outside the document.'); if (!state.purchaseOrders.some((po) => scoped(state, po) && po.lines.some((line) => line.id === mapping.purchaseOrderLineId))) throw new Error('PO-line mapping references an unavailable purchase-order line.'); if (!state.itemVariants.some((variant) => variant.id === mapping.itemVariantId && variant.active && scoped(state, variant))) throw new Error('PO-line mapping SKU is inactive or out of scope.'); return { ...mapping }; });
  const next = mutate(state); const record: RetailPurchaseOcrMapping = { id, ocrDocumentId: document.id, mappings, status: 'prepared', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }; next.retailPurchaseOcrMappings.unshift(record); return next;
}

export function applyRetailPurchaseOcrMapping(state: RevenueOpsState, input: ApplyRetailPurchaseOcrMappingInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const mapping = state.retailPurchaseOcrMappings.find((item) => item.id === input.id && item.status === 'prepared' && scoped(state, item)); if (!mapping || mapping.version !== input.expectedVersion) throw new Error('OCR mapping is stale or no longer awaiting review.'); if (mapping.requestedBy === actorId) throw new Error('OCR mapping maker cannot apply the same mapping.');
  const next = mutate(state); next.retailPurchaseOcrDocuments = next.retailPurchaseOcrDocuments.map((document) => document.id === mapping.ocrDocumentId ? { ...document, lines: document.lines.map((line) => { const matched = mapping.mappings.find((candidate) => candidate.ocrLineId === line.id); return matched ? { ...line, itemVariantId: matched.itemVariantId, purchaseOrderLineId: matched.purchaseOrderLineId } : line; }), purchaseOrderId: document.purchaseOrderId ?? state.purchaseOrders.find((po) => po.lines.some((line) => mapping.mappings.some((candidate) => candidate.purchaseOrderLineId === line.id)))?.id, version: document.version + 1 } : document);
  next.retailPurchaseOcrMappings = next.retailPurchaseOcrMappings.map((item) => item.id === mapping.id ? { ...item, status: 'applied' as const, appliedBy: actorId, appliedAt: now, evidence: clean(input.evidence, 'OCR mapping evidence'), version: item.version + 1 } : item); return next;
}

export function prepareRetailCommercePushBatch(state: RevenueOpsState, input: PrepareRetailCommercePushInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const connector = state.retailCommerceConnectors.find((item) => item.id === input.connectorId && ['configured', 'certified'].includes(item.status) && item.credentialStatus === 'configured' && scoped(state, item)); if (!connector) throw new Error('A configured commerce connector is required for a push.'); const capability = input.kind === 'catalog' ? 'catalog-push' : 'inventory-push'; if (!connector.capabilities.includes(capability)) throw new Error('Connector does not declare the requested push capability.');
  if (!input.itemVariantIds.length || input.itemVariantIds.length > 500 || new Set(input.itemVariantIds).size !== input.itemVariantIds.length) throw new Error('Push batch requires 1-500 unique SKUs.');
  const records = input.itemVariantIds.map((id) => { const variant = state.itemVariants.find((item) => item.id === id && item.active && scoped(state, item)); if (!variant) throw new Error('Push batch contains an inactive or out-of-scope SKU.'); const mapping = mappingForRetailCommerceVariant(state, connector.id, variant.id); if (!mapping) throw new Error(`SKU ${variant.sku} has no active remote mapping for this connector.`); const inventory = state.binBalances.filter((balance) => balance.itemVariantId === variant.id && scoped(state, balance)).reduce((total, balance) => total + balance.available, 0); const item = state.inventoryItems.find((candidate) => candidate.id === variant.itemId); const product = item && state.products.find((candidate) => candidate.id === item.productId); const priceList = state.priceLists.find((candidate) => candidate.active && (candidate.channel === 'retail' || candidate.channel === 'all')); const price = product && priceList ? state.priceListEntries.find((entry) => entry.priceListId === priceList.id && entry.productId === product.id && scoped(state, entry))?.unitPrice : undefined; const tax = product && state.taxCodes.find((code) => code.id === product.taxCodeId && scoped(state, code))?.gstRate; return { itemVariantId: variant.id, sku: variant.sku, remoteSku: mapping.remoteSku, name: variant.name, quantity: Math.max(0, inventory), unitPrice: price, gstRate: tax }; });
  const payloadChecksum = checksum({ connectorId: connector.id, kind: input.kind, records }); const next = mutate(state); const batch: RetailCommercePushBatch = { id, number: fiscalNumber('RPUSH', state.retailCommercePushBatches.length + 1, now), connectorId: connector.id, kind: input.kind, records, payloadChecksum, status: 'prepared', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }; next.retailCommercePushBatches.unshift(batch); return next;
}

export function decideRetailCommercePushBatch(state: RevenueOpsState, input: DecideRetailCommercePushInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const batch = state.retailCommercePushBatches.find((item) => item.id === input.id && item.status === 'prepared' && scoped(state, item)); if (!batch || batch.version !== input.expectedVersion) throw new Error('Commerce push batch is stale or not awaiting provider evidence.'); if (batch.requestedBy === actorId) throw new Error('Push batch maker cannot acknowledge the same provider delivery.');
  const evidence = externalEvidence(input.evidence, 'Push delivery evidence');
  const providerPayloadChecksum = sha256(input.providerPayloadChecksum, 'Provider push payload checksum');
  if (input.decision === 'acknowledged' && providerPayloadChecksum !== batch.payloadChecksum) throw new Error('Provider acknowledgement does not match the prepared push payload checksum.');
  const responseChecksum = input.responseChecksum ? sha256(input.responseChecksum, 'Provider push response checksum') : undefined;
  if (input.decision === 'acknowledged' && (!responseChecksum || !Number.isInteger(input.responseByteLength) || (input.responseByteLength ?? 0) <= 0)) throw new Error('An acknowledged push requires the real provider response checksum and byte length.');
  if (input.responseByteLength !== undefined && (!Number.isInteger(input.responseByteLength) || input.responseByteLength < 0)) throw new Error('Provider push response byte length must be a non-negative integer.');
  const providerReference = input.providerReference ? clean(input.providerReference, 'Provider push reference', 3, 180) : undefined;
  const next = mutate(state); next.retailCommercePushBatches = next.retailCommercePushBatches.map((item) => item.id === batch.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, evidence, responseChecksum, responseByteLength: input.responseByteLength, providerReference, version: item.version + 1 } : item); return next;
}

const orderTransitions: Record<'imported' | 'confirmed' | 'fulfilled' | 'cancelled' | 'return-requested' | 'returned' | 'rto', string[]> = { imported: ['confirmed', 'cancelled'], confirmed: ['fulfilled', 'cancelled', 'return-requested', 'rto'], fulfilled: ['return-requested', 'returned', 'rto'], cancelled: [], 'return-requested': ['returned', 'rto'], returned: [], rto: [] };

/** Reserves the exact local sales-order quantities backing a confirmed remote order. */
export function reserveRetailCommerceOrder(state: RevenueOpsState, input: ReserveRetailCommerceOrderInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const order = state.retailCommerceOrders.find((candidate) => candidate.id === input.orderId && scoped(state, candidate));
  if (!order || order.version !== input.expectedVersion) throw new Error('Remote order is stale or unavailable. Refresh and retry.');
  if (order.status !== 'confirmed' || !order.localSalesOrderId) throw new Error('A confirmed remote order must be handed off to a local sales order before reservation.');
  if (order.inventoryReservationIds?.length) throw new Error('Remote order already has an inventory reservation plan.');
  const salesOrder = state.salesOrders.find((candidate) => candidate.id === order.localSalesOrderId && scoped(state, candidate) && !['cancelled', 'completed'].includes(candidate.status));
  if (!salesOrder) throw new Error('The handed-off local sales order is missing or no longer reservable.');
  if (!state.stockLocations.some((location) => location.id === input.locationId && location.active && scoped(state, location))) throw new Error('An active in-scope dispatch stock location is required.');
  const lineQuantities = new Map(salesOrder.lines.map((line) => [line.id, 0]));
  const allocation: Array<{ lineId: string; quantity: number }> = [];
  for (const remoteLine of order.lines) {
    const variant = state.itemVariants.find((candidate) => candidate.id === remoteLine.itemVariantId && candidate.active && scoped(state, candidate));
    const inventoryItem = variant && state.inventoryItems.find((candidate) => candidate.id === variant.itemId && candidate.active && scoped(state, candidate));
    const productId = inventoryItem?.productId;
    const line = productId ? salesOrder.lines.find((candidate) => candidate.catalogProductId === productId && (lineQuantities.get(candidate.id) ?? 0) + remoteLine.quantity <= candidate.quantity) : undefined;
    if (!line || !productId) throw new Error(`Remote SKU ${remoteLine.remoteSku ?? remoteLine.itemVariantId} cannot be reconciled to a reservable local sales-order line.`);
    lineQuantities.set(line.id, (lineQuantities.get(line.id) ?? 0) + remoteLine.quantity);
    allocation.push({ lineId: line.id, quantity: remoteLine.quantity });
  }
  let next = state;
  const reservationIds: string[] = [];
  for (const line of allocation) {
    const id = randomUUID();
    next = reserveStock(next, { salesOrderId: salesOrder.id, lineId: line.lineId, locationId: input.locationId, quantity: line.quantity }, actorId, id, now);
    reservationIds.push(id);
  }
  const evidence = clean(input.evidence, 'Inventory reservation evidence', 4, 500);
  const reservedAt = now;
  next = mutate(next);
  next.retailCommerceOrders = next.retailCommerceOrders.map((candidate) => candidate.id === order.id ? { ...candidate, inventoryReservationIds: reservationIds, inventoryReservationLocationId: input.locationId, inventoryReservedAt: reservedAt, inventoryEvidenceReference: evidence, version: candidate.version + 1 } : candidate);
  return next;
}

export function transitionRetailCommerceOrder(state: RevenueOpsState, input: TransitionRetailCommerceOrderInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const order = state.retailCommerceOrders.find((item) => item.id === input.id && scoped(state, item)); if (!order || order.version !== input.expectedVersion || !orderTransitions[order.status].includes(input.status)) throw new Error('Remote order status transition is stale or not allowed.'); if (input.status === 'rto' && !input.rtoReference) throw new Error('RTO transition requires a carrier or marketplace RTO reference.');
  const reservationIds = [...new Set(order.inventoryReservationIds ?? [])];
  const reservations = reservationIds.map((reservationId) => state.stockReservations.find((reservation) => reservation.id === reservationId && scoped(state, reservation)));
  if (input.status === 'fulfilled') {
    if (!reservationIds.length || reservations.some((reservation) => !reservation || !['packed', 'consumed'].includes(reservation.status))) throw new Error('Remote order cannot be fulfilled until every local reservation is packed or issued.');
  }
  if (input.status === 'cancelled' && reservations.some((reservation) => reservation && ['packed', 'consumed'].includes(reservation.status))) {
    throw new Error('Remote order cannot be cancelled after stock is packed or issued; record the provider return or RTO workflow instead.');
  }
  let next = state;
  if (input.status === 'cancelled') {
    for (const reservationId of reservationIds) {
      const reservation = next.stockReservations.find((candidate) => candidate.id === reservationId && scoped(next, candidate));
      if (reservation?.status === 'reserved') next = releaseStockReservation(next, { id: reservation.id, expectedVersion: reservation.version }, actorId, now);
    }
  }
  next = mutate(next); next.retailCommerceOrders = next.retailCommerceOrders.map((item) => item.id === order.id ? { ...item, status: input.status, statusUpdatedBy: actorId, statusUpdatedAt: now, statusEvidence: clean(input.evidence, 'Order status evidence'), rtoReference: input.rtoReference?.trim() || item.rtoReference, version: item.version + 1 } : item); return next;
}

/** Links a returned/RTO marketplace order to the locally approved return, GST credit-note pack and physical receipt evidence. */
export function linkRetailCommerceReturn(state: RevenueOpsState, input: LinkRetailCommerceReturnInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  void now;
  const order = state.retailCommerceOrders.find((candidate) => candidate.id === input.orderId && scoped(state, candidate));
  const returnCase = state.retailReturns.find((candidate) => candidate.id === input.retailReturnId && scoped(state, candidate));
  const creditNote = state.retailCreditNoteReconciliations.find((candidate) => candidate.id === input.creditNoteReconciliationId && scoped(state, candidate));
  const evidence = clean(input.inventoryEvidenceReference, 'Inventory receipt evidence reference', 3, 160);
  if (!order || order.version !== input.expectedVersion) throw new Error('Marketplace order is stale or unavailable. Refresh and retry.');
  if (!['returned', 'rto'].includes(order.status)) throw new Error('Only returned or RTO marketplace orders can be linked to return evidence.');
  if (!returnCase || returnCase.status !== 'approved' || !returnCase.financialCredit) throw new Error('An independently approved local return with frozen customer credit is required.');
  if (!creditNote || creditNote.retailReturnId !== returnCase.id || !['prepared', 'matched', 'drift'].includes(creditNote.status)) throw new Error('The credit-note reconciliation pack must reference the same approved return.');
  if (returnCase.approvedBy === actorId || creditNote.requestedBy === actorId) throw new Error('Return evidence linking requires an independent finance reconciler.');
  if (!state.inventoryLedger.some((entry) => entry.reference === evidence && scoped(state, entry))) throw new Error('Inventory receipt evidence was not found in the current operating scope.');
  const next = mutate(state);
  next.retailCommerceOrders = next.retailCommerceOrders.map((candidate) => candidate.id === order.id ? { ...candidate, retailReturnId: returnCase.id, creditNoteReconciliationId: creditNote.id, inventoryEvidenceReference: evidence, version: candidate.version + 1 } : candidate);
  return next;
}

export function createRetailCommerceConformanceCase(state: RevenueOpsState, input: CreateRetailCommerceConformanceCaseInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const connector = state.retailCommerceConnectors.find((item) => item.id === input.connectorId && scoped(state, item));
  if (!connector) throw new Error('Commerce connector not found for conformance.');
  const capability = input.capability ?? (connector.capabilities.length === 1 ? connector.capabilities[0] : undefined);
  if (capability && !connector.capabilities.includes(capability)) throw new Error('Conformance capability is not declared by this connector.');
  const next = mutate(state);
  const record: RetailCommerceConformanceCase = { id, connectorId: connector.id, capability, credentialRevision: retailCommerceCredentialRevision(connector), suiteName: clean(input.suiteName, 'Conformance suite'), suiteVersion: clean(input.suiteVersion, 'Conformance suite version', 1, 80), scenario: clean(input.scenario, 'Conformance scenario', 8, 500), result: 'planned', preparedBy: actorId, preparedAt: now, scope: structuredClone(next.scope), version: 1 };
  next.retailCommerceConformanceCases.unshift(record);
  return next;
}

/**
 * Creates the smallest complete provider test pack for the connector. Existing
 * planned or passed capability cases are preserved, so pressing the action
 * again is idempotent. This is preparation evidence only; an independent
 * assessor must still record real provider responses before certification.
 */
export function planRetailCommerceConformancePack(state: RevenueOpsState, input: PlanRetailCommerceConformancePackInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const connector = state.retailCommerceConnectors.find((item) => item.id === input.connectorId && scoped(state, item));
  if (!connector) throw new Error('Commerce connector not found for conformance pack.');
  const suiteName = clean(input.suiteName, 'Conformance suite');
  const suiteVersion = clean(input.suiteVersion, 'Conformance suite version', 1, 80);
  const scenarioByCapability: Record<RetailCommerceCapability, string> = {
    'catalog-push': 'Catalog payload acceptance, SKU identity, tax and idempotent replay',
    'inventory-push': 'Inventory availability, reservation boundary and idempotent replay',
    'order-pull': 'Order import, duplicate protection, cancellation and return lifecycle',
    'settlement-pull': 'Settlement pull, fees, withholding, refund/RTO and allocation evidence',
  };
  let next = state;
  for (const capability of connector.capabilities) {
    const existing = next.retailCommerceConformanceCases.some((item) => item.connectorId === connector.id && item.capability === capability && retailCommerceConformanceMatchesCredentialRevision(connector, item) && ['planned', 'passed'].includes(item.result) && scoped(next, item));
    if (existing) continue;
    next = createRetailCommerceConformanceCase(next, { connectorId: connector.id, capability, suiteName, suiteVersion, scenario: scenarioByCapability[capability] }, actorId, randomUUID(), now);
  }
  return next;
}

export function recordRetailCommerceConformance(state: RevenueOpsState, input: RecordRetailCommerceConformanceInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const record = state.retailCommerceConformanceCases.find((item) => item.id === input.id && item.result === 'planned' && scoped(state, item));
  if (!record || record.version !== input.expectedVersion) throw new Error('Commerce conformance case is stale or already assessed.');
  const currentConnector = state.retailCommerceConnectors.find((item) => item.id === record.connectorId && scoped(state, item));
  if (!currentConnector || currentConnector.credentialStatus !== 'configured' || !retailCommerceConformanceMatchesCredentialRevision(currentConnector, record)) throw new Error('Commerce conformance case belongs to an older credential revision. Plan a fresh capability replay.');
  if (record.preparedBy === actorId) throw new Error('Conformance case maker cannot assess the same case.');
  const resultChecksum = sha256(input.resultChecksum, 'Conformance result checksum');
  const evidenceReference = externalEvidence(input.evidenceReference, 'Conformance evidence');
  const next = mutate(state);
  next.retailCommerceConformanceCases = next.retailCommerceConformanceCases.map((item) => item.id === record.id ? { ...item, result: input.result, evidenceReference, resultChecksum, assessedBy: actorId, assessedAt: now, version: item.version + 1 } : item);
  if (input.result === 'passed') {
    const connector = next.retailCommerceConnectors.find((item) => item.id === record.connectorId && scoped(next, item));
    if (connector) {
      const passed = next.retailCommerceConformanceCases.filter((item) => item.connectorId === connector.id && item.result === 'passed' && retailCommerceConformanceMatchesCredentialRevision(connector, item));
      const allCapabilitiesCovered = connector.capabilities.every((requiredCapability: RetailCommerceCapability) => passed.some((item) => item.capability === requiredCapability || (!item.capability && connector.capabilities.length === 1)));
      if (allCapabilitiesCovered && connector.credentialStatus === 'configured') next.retailCommerceConnectors = next.retailCommerceConnectors.map((item) => item.id === connector.id ? { ...item, status: 'certified' as const, version: item.version + 1 } : item);
    }
  }
  return next;
}

const exceptionKey = (documentId: string, kind: RetailPurchaseException['kind'], lineId?: string) => `${documentId}:${kind}:${lineId ?? 'document'}`;

export function scanRetailPurchaseExceptions(state: RevenueOpsState, input: ScanRetailPurchaseExceptionsInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const documents = state.retailPurchaseOcrDocuments.filter((document) => (!input.ocrDocumentId || document.id === input.ocrDocumentId) && scoped(state, document));
  if (!documents.length) throw new Error('No in-scope OCR document was found for exception scanning.');
  const next = mutate(state);
  for (const document of documents) {
    const findings: Array<Omit<RetailPurchaseException, 'id' | 'number' | 'requestedBy' | 'requestedAt' | 'scope' | 'version'>> = [];
    const normalized = normalizeRetailPurchaseOcrExtraction({ extractedInvoiceNumber: document.extractedInvoiceNumber, extractedInvoiceDate: document.extractedInvoiceDate, extractedSupplierGstin: document.extractedSupplierGstin, extractedTotalAmount: document.extractedTotalAmount, extractionConfidence: document.extractionConfidence, lines: document.lines });
    for (const finding of normalized.findings) {
      const line = finding.lineIndex === undefined ? undefined : document.lines[finding.lineIndex];
      const suggestedAction = finding.kind === 'invalid-gstin' ? 'Verify the supplier GSTIN on the source invoice and GST master before approval.' : finding.kind === 'invoice-date' ? 'Correct the invoice date against the source document before statutory posting.' : finding.kind === 'total-mismatch' ? 'Reconcile taxable values, GST rate, cess and rounding against the source invoice.' : 'Compare the extracted field or line to the source invoice before approval.';
      findings.push({ ocrDocumentId: document.id, ocrLineId: line?.id, kind: finding.kind, severity: finding.severity, status: 'open', message: finding.message, suggestedAction });
    }
    if (document.extractedInvoiceNumber && state.supplierInvoices.some((invoice) => invoice.supplierInvoiceNumber === document.extractedInvoiceNumber && scoped(state, invoice))) findings.push({ ocrDocumentId: document.id, kind: 'duplicate-invoice', severity: 'critical', status: 'open', message: `Invoice ${document.extractedInvoiceNumber} already exists in supplier invoices.`, suggestedAction: 'Confirm whether this is a duplicate upload or a legitimate correction before conversion.' });
    for (const line of document.lines) {
      if (!line.itemVariantId || !line.purchaseOrderLineId) findings.push({ ocrDocumentId: document.id, ocrLineId: line.id, kind: 'unmapped-line', severity: 'high', status: 'open', message: `OCR line “${line.description}” is missing a controlled SKU or purchase-order line.`, suggestedAction: 'Map the line to an active SKU and the exact approved purchase-order line.' });
      const variant = line.itemVariantId ? state.itemVariants.find((candidate) => candidate.id === line.itemVariantId && scoped(state, candidate)) : undefined;
      const inventoryItem = variant ? state.inventoryItems.find((candidate) => candidate.id === variant.itemId) : undefined;
      const product = inventoryItem ? state.products.find((candidate) => candidate.id === inventoryItem.productId) : undefined;
      const tax = product ? state.taxCodes.find((candidate) => candidate.id === product.taxCodeId && scoped(state, candidate)) : undefined;
      if (tax && Math.abs(tax.gstRate - line.gstRate) > 0.01) findings.push({ ocrDocumentId: document.id, ocrLineId: line.id, kind: 'tax-mismatch', severity: 'critical', status: 'open', message: `OCR GST ${line.gstRate}% differs from the controlled HSN/GST rate ${tax.gstRate}%.`, suggestedAction: 'Verify the supplier tax classification and controlled HSN/GST master before approval.' });
      const purchaseOrderLine = line.purchaseOrderLineId ? state.purchaseOrders.flatMap((order) => order.lines).find((candidate) => candidate.id === line.purchaseOrderLineId) : undefined;
      if (purchaseOrderLine && line.quantity > purchaseOrderLine.quantity) findings.push({ ocrDocumentId: document.id, ocrLineId: line.id, kind: 'quantity-variance', severity: 'high', status: 'open', message: `OCR quantity ${line.quantity} exceeds PO quantity ${purchaseOrderLine.quantity}.`, suggestedAction: 'Obtain an approved PO amendment or reduce the invoice quantity before conversion.' });
    }
    for (const finding of findings) {
      const key = exceptionKey(finding.ocrDocumentId, finding.kind, finding.ocrLineId);
      const existing = next.retailPurchaseExceptions.find((candidate) => exceptionKey(candidate.ocrDocumentId, candidate.kind, candidate.ocrLineId) === key && ['open', 'acknowledged'].includes(candidate.status));
      if (existing) continue;
      const exception: RetailPurchaseException = { ...finding, id: randomUUID(), number: fiscalNumber('RPEX', next.retailPurchaseExceptions.length + 1, now), requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 };
      next.retailPurchaseExceptions.unshift(exception);
    }
  }
  return next;
}

export function resolveRetailPurchaseException(state: RevenueOpsState, input: ResolveRetailPurchaseExceptionInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const exception = state.retailPurchaseExceptions.find((candidate) => candidate.id === input.id && candidate.status === 'open' && scoped(state, candidate));
  if (!exception || exception.version !== input.expectedVersion) throw new Error('Purchase exception is stale or no longer open.');
  if (exception.requestedBy === actorId) throw new Error('Exception maker cannot resolve the same exception.');
  const next = mutate(state); next.retailPurchaseExceptions = next.retailPurchaseExceptions.map((candidate) => candidate.id === exception.id ? { ...candidate, status: input.decision, resolvedBy: actorId, resolvedAt: now, resolutionEvidence: clean(input.evidence, 'Exception resolution evidence', 4, 500), version: candidate.version + 1 } : candidate); return next;
}

export function prepareRetailSettlementJournal(state: RevenueOpsState, input: PrepareRetailSettlementJournalInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  void actorId;
  void now;
  const settlement = state.retailSettlementReconciliations.find((candidate) => candidate.id === input.id && scoped(state, candidate));
  if (!settlement || settlement.version !== input.expectedVersion) throw new Error('Marketplace settlement is stale or unavailable.');
  if (!['matched', 'resolved'].includes(settlement.status)) throw new Error('Only matched or independently resolved marketplace settlements can create a journal handoff.');
  if (settlement.orderIds.length) {
    assertRetailSettlementOrderClosure(state, settlement);
    if (!state.retailSettlementAllocationPacks.some((pack) => pack.id === settlement.allocationPackId && pack.status === 'approved' && scoped(state, pack))) throw new Error('Settlement journal requires an independently approved order-level allocation pack.');
  }
  if (settlement.journalDraftId) return state;
  const lines = ([
    { accountCode: 'bank-clearing', debit: settlement.netAmount, credit: 0, memo: settlement.number },
    { accountCode: 'sales-returns', debit: settlement.refundAmount ?? 0, credit: 0, memo: `${settlement.number} marketplace refunds` },
    { accountCode: 'bank-charges-expense', debit: settlement.feeAmount, credit: 0, memo: `${settlement.number} marketplace fees` },
    { accountCode: 'tds-receivable', debit: settlement.taxWithheldAmount, credit: 0, memo: `${settlement.number} withholding` },
    { accountCode: 'sales-revenue', debit: 0, credit: settlement.grossAmount, memo: `${settlement.number} marketplace gross` },
  ] as JournalLine[]).filter((line) => line.debit > 0 || line.credit > 0);
  const totalDebit = money(lines.reduce((total, line) => total + line.debit, 0));
  const totalCredit = money(lines.reduce((total, line) => total + line.credit, 0));
  if (totalDebit <= 0 || totalDebit !== totalCredit) throw new Error('Marketplace settlement journal is not exactly balanced.');
  const unsigned = { sourceType: 'retail-commerce-settlement' as const, sourceId: settlement.id, sourceNumber: settlement.number, postingDate: settlement.periodTo, lines, totalDebit, totalCredit };
  const journal: AccountingJournalDraft = { id: randomUUID(), ...unsigned, status: 'ready', checksum: checksum(unsigned), version: 1 };
  const next = mutate(state); next.journalDrafts.unshift(journal); next.retailSettlementReconciliations = next.retailSettlementReconciliations.map((candidate) => candidate.id === settlement.id ? { ...candidate, journalDraftId: journal.id, version: candidate.version + 1 } : candidate); return next;
}
