import { randomUUID } from 'node:crypto';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { RecordSupplierInvoiceInput } from '../shared/procurement-contracts';
import { recordSupplierInvoice } from './procurement';
import type {
  ConfigureRetailCommerceCredentialsInput,
  ConvertRetailPurchaseOcrInput,
  CreateRetailCommerceConnectorInput,
  CreateRetailCommerceSyncInput,
  CreateRetailPurchaseOcrInput,
  CreateRetailSettlementReconciliationInput,
  DecideRetailPurchaseOcrInput,
  DecideRetailSettlementReconciliationInput,
  ImportRetailCommerceOrderInput,
  HandoffRetailCommerceOrderInput,
  RecordRetailCommerceSyncInput,
  RecordRetailCommerceRemoteStatusInput,
  RetailCommerceCapability,
  RetailCommerceConnector,
  RetailCommerceOrder,
  RetailCommerceOrderStatus,
  RetailCommerceSyncRun,
  RetailPurchaseOcrDocument,
  RetailSettlementReconciliation,
} from '../shared/retail-commerce-contracts';
import { retailCommerceCredentialRevision } from '../shared/retail-commerce-contracts';
import { normalizeRetailPurchaseOcrExtraction } from './retail-ocr-normalization';
import { resolveRetailCommerceCatalogMapping } from './retail-commerce-mapping';

const money = (value: number) => Math.round(value * 100) / 100;
const mutate = (state: RevenueOpsState) => ({ ...structuredClone(state), revision: state.revision + 1 });
const clean = (value: string, label: string, min = 2, max = 240) => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`);
  return normalized;
};
const validDate = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) throw new Error(`${label} must use YYYY-MM-DD.`);
  return value;
};
const sha256 = (value: string, label: string) => {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`${label} must be a SHA-256 checksum.`);
  return value.toLowerCase();
};
const cursorValue = (value: string | undefined) => value?.trim() || undefined;
const cursorRegresses = (next: string, previous: string): boolean => {
  if (next === previous) return true;
  if (/^\d+$/.test(next) && /^\d+$/.test(previous)) return BigInt(next) <= BigInt(previous);
  return false;
};
const scoped = (state: RevenueOpsState, record?: { scope?: RevenueOpsState['scope'] }) => {
  const scope = record?.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};
const fiscalNumber = (prefix: string, sequence: number, at: string) => {
  const date = new Date(at); const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${prefix}/${String(year).slice(-2)}-${String(year + 1).slice(-2)}/${String(sequence).padStart(5, '0')}`;
};
const orderStatuses = new Set<RetailCommerceOrderStatus>(['imported', 'confirmed', 'fulfilled', 'cancelled', 'return-requested', 'returned', 'rto']);

export function createRetailPurchaseOcrDocument(state: RevenueOpsState, input: CreateRetailPurchaseOcrInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const fileName = clean(input.fileName, 'OCR file name', 3, 180);
  const fileChecksum = sha256(input.fileChecksum, 'OCR file checksum');
  const normalized = normalizeRetailPurchaseOcrExtraction(input);
  if (!Number.isFinite(normalized.extractionConfidence) || normalized.extractionConfidence < 0 || normalized.extractionConfidence > 1) throw new Error('OCR confidence must be between 0 and 1.');
  if (!input.lines.length || input.lines.length > 100) throw new Error('OCR document requires 1-100 extracted lines.');
  const supplier = input.supplierId ? state.suppliers.find((item) => item.id === input.supplierId && item.status === 'approved' && scoped(state, item)) : undefined;
  if (input.supplierId && !supplier) throw new Error('OCR supplier must be an approved supplier in the active branch.');
  const ocrProvider = input.ocrProviderProfileId ? state.retailOcrProviderProfiles.find((item) => item.id === input.ocrProviderProfileId && item.status === 'certified' && scoped(state, item)) : undefined;
  if (input.ocrProviderProfileId && !ocrProvider) throw new Error('OCR provider profile must be certified before it can be used.');
  const lines = normalized.lines.map((line) => {
    if (!(line.quantity > 0) || !(line.unitPrice >= 0) || line.gstRate < 0 || line.gstRate > 100 || line.confidence < 0 || line.confidence > 1) throw new Error('OCR line quantity, pricing, GST, or confidence is invalid.');
    if (line.itemVariantId && !state.itemVariants.some((variant) => variant.id === line.itemVariantId && variant.active && scoped(state, variant))) throw new Error('OCR line SKU is not active in the current branch.');
    return { ...line, id: randomUUID(), description: clean(line.description, 'OCR line description', 1, 180), quantity: Number(line.quantity), unitPrice: money(line.unitPrice), gstRate: Number(line.gstRate), confidence: Number(line.confidence) };
  });
  if (normalized.extractedInvoiceDate) validDate(normalized.extractedInvoiceDate, 'OCR invoice date');
  const providerResponseReference = input.providerResponseReference ? clean(input.providerResponseReference, 'OCR provider response reference', 4, 300) : undefined;
  const providerResponseChecksum = input.providerResponseChecksum ? sha256(input.providerResponseChecksum, 'OCR provider response checksum') : undefined;
  if (input.providerResponseByteLength !== undefined && (!Number.isInteger(input.providerResponseByteLength) || input.providerResponseByteLength <= 0)) throw new Error('OCR provider response byte length must be a positive integer.');
  const next = mutate(state);
  const document: RetailPurchaseOcrDocument = { id, number: fiscalNumber('POCR', state.retailPurchaseOcrDocuments.length + 1, now), source: input.source, fileName, fileChecksum, supplierId: supplier?.id, purchaseOrderId: input.purchaseOrderId, goodsReceiptId: input.goodsReceiptId, ocrProviderProfileId: ocrProvider?.id, providerResponseReference, providerResponseChecksum, providerResponseByteLength: input.providerResponseByteLength, extractedInvoiceNumber: normalized.extractedInvoiceNumber, extractedInvoiceDate: normalized.extractedInvoiceDate, extractedSupplierGstin: normalized.extractedSupplierGstin, extractedTotalAmount: normalized.extractedTotalAmount, extractionConfidence: normalized.extractionConfidence, lines, status: 'review', submittedBy: actorId, submittedAt: now, scope: structuredClone(next.scope), version: 1 };
  next.retailPurchaseOcrDocuments.unshift(document);
  return next;
}

export function decideRetailPurchaseOcr(state: RevenueOpsState, input: DecideRetailPurchaseOcrInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const document = state.retailPurchaseOcrDocuments.find((item) => item.id === input.id && scoped(state, item));
  if (!document || document.status !== 'review' || document.version !== input.expectedVersion) throw new Error('Purchase OCR document is stale or no longer awaiting review.');
  if (document.submittedBy === actorId) throw new Error('OCR maker cannot review the same document.');
  const next = mutate(state); next.retailPurchaseOcrDocuments = next.retailPurchaseOcrDocuments.map((item) => item.id === document.id ? { ...item, status: input.decision, reviewedBy: actorId, reviewedAt: now, reviewEvidence: clean(input.evidence, 'OCR review evidence', 4, 500), version: item.version + 1 } : item); return next;
}

export function convertRetailPurchaseOcr(state: RevenueOpsState, input: ConvertRetailPurchaseOcrInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const document = state.retailPurchaseOcrDocuments.find((item) => item.id === input.id && scoped(state, item));
  if (!document || document.status !== 'approved' || document.version !== input.expectedVersion) throw new Error('Only an approved OCR document can be converted.');
  if (document.reviewedBy === actorId) throw new Error('OCR approver cannot create the supplier invoice from the same document.');
  const mapping = state.retailPurchaseOcrMappings.find((item) => item.id === input.mappingId && item.ocrDocumentId === document.id && item.status === 'applied' && scoped(state, item));
  if (!mapping) throw new Error('An applied OCR-to-PO mapping is required before supplier-invoice conversion.');
  if (document.purchaseOrderId && document.purchaseOrderId !== input.purchaseOrderId) throw new Error('Conversion purchase order does not match the approved OCR document.');
  if (document.goodsReceiptId && document.goodsReceiptId !== input.goodsReceiptId) throw new Error('Conversion goods receipt does not match the approved OCR document.');
  if (input.lines.length !== mapping.mappings.length || input.lines.some((line) => !mapping.mappings.some((candidate) => candidate.purchaseOrderLineId === line.purchaseOrderLineId))) throw new Error('Supplier-invoice lines must exactly follow the applied OCR-to-PO mapping.');
  const next = recordSupplierInvoice(state, { purchaseOrderId: input.purchaseOrderId, goodsReceiptId: input.goodsReceiptId, supplierInvoiceNumber: input.supplierInvoiceNumber, invoiceDate: input.invoiceDate, lines: input.lines } satisfies RecordSupplierInvoiceInput, actorId, randomUUID(), now);
  const invoice = next.supplierInvoices.find((item) => item.supplierInvoiceNumber === input.supplierInvoiceNumber.trim().toUpperCase());
  if (!invoice) throw new Error('Converted supplier invoice was not created.');
  next.retailPurchaseOcrDocuments = next.retailPurchaseOcrDocuments.map((item) => item.id === document.id ? { ...item, status: 'converted' as const, convertedSupplierInvoiceId: invoice.id, purchaseOrderId: input.purchaseOrderId, goodsReceiptId: input.goodsReceiptId, version: item.version + 1 } : item);
  return next;
}

const capabilityForKind: Record<CreateRetailCommerceSyncInput['kind'], RetailCommerceCapability> = { catalog: 'catalog-push', inventory: 'inventory-push', orders: 'order-pull', settlement: 'settlement-pull' };

export function createRetailCommerceConnector(state: RevenueOpsState, input: CreateRetailCommerceConnectorInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,23}$/.test(code) || state.retailCommerceConnectors.some((item) => item.code === code && scoped(state, item))) throw new Error('Retail commerce connector code is invalid or already exists.');
  const base = new URL(input.baseUrl); if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Retail commerce connector URL must be a credential-free HTTPS origin or path.');
  const capabilities = [...new Set(input.capabilities)]; if (!capabilities.length) throw new Error('Retail commerce connector needs at least one capability.');
  const next = mutate(state); const connector: RetailCommerceConnector = { id, code, name: clean(input.name, 'Retail commerce connector name'), channel: input.channel, environment: input.environment, baseUrl: base.toString().replace(/\/$/, ''), capabilities, credentialStatus: 'missing', credentialRevision: 0, status: 'draft', createdBy: actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }; next.retailCommerceConnectors.unshift(connector); return next;
}

export function configureRetailCommerceCredentials(state: RevenueOpsState, input: ConfigureRetailCommerceCredentialsInput): RevenueOpsState {
  const connector = state.retailCommerceConnectors.find((item) => item.id === input.connectorId && scoped(state, item)); if (!connector || connector.status === 'suspended') throw new Error('Retail commerce connector is missing or suspended.');
  const fingerprint = sha256(input.fingerprint ?? '', 'Retail connector credential fingerprint'); const unchanged = connector.credentialStatus === 'configured' && connector.credentialFingerprint === fingerprint; const next = mutate(state); next.retailCommerceConnectors = next.retailCommerceConnectors.map((item) => item.id === connector.id ? { ...item, credentialStatus: 'configured' as const, credentialFingerprint: fingerprint, credentialRevision: unchanged ? Math.max(1, retailCommerceCredentialRevision(item)) : retailCommerceCredentialRevision(item) + 1, status: unchanged ? item.status : 'configured' as const, version: item.version + 1 } : item); return next;
}

export function createRetailCommerceSyncRun(state: RevenueOpsState, input: CreateRetailCommerceSyncInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const connector = state.retailCommerceConnectors.find((item) => item.id === input.connectorId && scoped(state, item)); const capability = capabilityForKind[input.kind];
  if (!connector || !['configured', 'certified'].includes(connector.status) || connector.credentialStatus !== 'configured' || !connector.capabilities.includes(capability)) throw new Error('A configured connector with the requested capability is required.');
  const requestChecksum = sha256(input.requestChecksum, 'Commerce sync request checksum'); const next = mutate(state); const run: RetailCommerceSyncRun = { id, number: fiscalNumber('RCX', state.retailCommerceSyncRuns.length + 1, now), connectorId: connector.id, kind: input.kind, status: 'prepared', requestChecksum, recordsRead: 0, recordsAccepted: 0, recordsRejected: 0, requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }; next.retailCommerceSyncRuns.unshift(run); return next;
}

export function recordRetailCommerceSync(state: RevenueOpsState, input: RecordRetailCommerceSyncInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const run = state.retailCommerceSyncRuns.find((item) => item.id === input.id && scoped(state, item)); if (!run || run.status !== 'prepared' || run.version !== input.expectedVersion) throw new Error('Commerce sync run is stale or no longer awaiting provider evidence.');
  const connector = state.retailCommerceConnectors.find((item) => item.id === run.connectorId && scoped(state, item)); if (!connector) throw new Error('Commerce sync connector is missing from the active branch.');
  if (run.requestedBy === actorId) throw new Error('Sync maker cannot certify the same provider result.');
  if (![input.recordsRead, input.recordsAccepted, input.recordsRejected].every((value) => Number.isInteger(value) && value >= 0) || input.recordsAccepted + input.recordsRejected > input.recordsRead) throw new Error('Sync record counts are inconsistent.');
  const evidenceReference = clean(input.evidenceReference, 'Commerce sync evidence', 4, 300);
  const providerReference = input.providerReference ? clean(input.providerReference, 'Provider response reference', 4, 180) : undefined;
  const responseChecksum = input.responseChecksum ? sha256(input.responseChecksum, 'Provider response checksum') : undefined;
  if (input.status !== 'failed' && (!responseChecksum || !Number.isInteger(input.responseByteLength) || (input.responseByteLength ?? 0) <= 0)) throw new Error('A completed provider sync requires the real response SHA-256 and positive response byte length.');
  if (input.responseByteLength !== undefined && (!Number.isInteger(input.responseByteLength) || input.responseByteLength < 0)) throw new Error('Provider response byte length must be a non-negative integer.');
  const remoteCursor = cursorValue(input.remoteCursor);
  const previousRun = state.retailCommerceSyncRuns
    .filter((item) => item.id !== run.id && item.connectorId === run.connectorId && item.kind === run.kind && item.status !== 'prepared' && scoped(state, item) && item.remoteCursor)
    .sort((left, right) => (right.completedAt ?? '').localeCompare(left.completedAt ?? ''))[0];
  const previousCursor = connector.lastSyncCursorKind === run.kind ? connector.lastSyncCursor : previousRun?.remoteCursor;
  if (remoteCursor && previousCursor && cursorRegresses(remoteCursor, previousCursor)) throw new Error(`Provider cursor ${remoteCursor} replays or moves behind the last accepted ${run.kind} cursor ${previousCursor}. Prepare a cursor-conflict resolution before retrying.`);
  const next = mutate(state);
  next.retailCommerceSyncRuns = next.retailCommerceSyncRuns.map((item) => item.id === run.id ? { ...item, status: input.status, evidenceReference, responseChecksum, responseByteLength: input.responseByteLength, providerReference, remoteCursor, recordsRead: input.recordsRead, recordsAccepted: input.recordsAccepted, recordsRejected: input.recordsRejected, completedAt: now, version: item.version + 1 } : item);
  // A provider response proves only that this sync was assessed. It must not
  // promote the connector to certified; certification is an independent,
  // capability-complete conformance decision recorded separately.
  next.retailCommerceConnectors = next.retailCommerceConnectors.map((item) => item.id === run.connectorId ? { ...item, lastSyncAt: now, ...(remoteCursor ? { lastSyncCursor: remoteCursor, lastSyncCursorKind: run.kind, lastSyncRunId: run.id } : {}), version: item.version + 1 } : item);
  return next;
}

export function importRetailCommerceOrder(state: RevenueOpsState, input: ImportRetailCommerceOrderInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const connector = state.retailCommerceConnectors.find((item) => item.id === input.connectorId && scoped(state, item) && ['configured', 'certified'].includes(item.status) && item.capabilities.includes('order-pull')); if (!connector) throw new Error('An active order-pull commerce connector is required.');
  if (state.retailCommerceOrders.some((item) => item.connectorId === connector.id && item.remoteOrderId === input.remoteOrderId && scoped(state, item))) throw new Error('Remote order was already imported for this connector.');
  const remotePayloadChecksum = sha256(input.remotePayloadChecksum, 'Remote order payload checksum'); if (!input.lines.length || input.lines.length > 100) throw new Error('Marketplace order needs 1-100 lines.');
  const lines = input.lines.map((line) => { const normalizedRemoteSku = line.remoteSku?.trim().toUpperCase(); const mapping = normalizedRemoteSku ? resolveRetailCommerceCatalogMapping(state, connector.id, normalizedRemoteSku) : undefined; if (normalizedRemoteSku && !mapping) throw new Error('Remote SKU has no active connector mapping.'); const variantId = mapping?.itemVariantId ?? line.itemVariantId; const variant = variantId ? state.itemVariants.find((item) => item.id === variantId && item.active && scoped(state, item)) : undefined; if (!variant || line.quantity <= 0 || line.unitPrice < 0 || line.gstRate < 0 || line.gstRate > 100) throw new Error('Marketplace order line is invalid or unmapped.'); const taxableValue = money(line.quantity * line.unitPrice); return { itemVariantId: variant.id, remoteSku: normalizedRemoteSku, quantity: line.quantity, unitPrice: money(line.unitPrice), taxableValue, gstRate: line.gstRate }; });
  const remoteStatus = input.remoteStatus;
  if (remoteStatus !== undefined && !orderStatuses.has(remoteStatus)) throw new Error('Remote order status is not a supported canonical lifecycle status.');
  const remoteStatusEvidence = remoteStatus === undefined ? undefined : clean(input.remoteStatusEvidence ?? '', 'Remote order status evidence', 4, 300);
  const remoteStatusChecksum = remoteStatus === undefined ? undefined : sha256(input.remoteStatusChecksum ?? remotePayloadChecksum, 'Remote order status checksum');
  const next = mutate(state); const order: RetailCommerceOrder = { id, connectorId: connector.id, remoteOrderId: clean(input.remoteOrderId, 'Remote order ID', 2, 120), orderNumber: clean(input.orderNumber, 'Marketplace order number', 2, 120), status: 'imported', remoteStatus, remoteStatusUpdatedAt: remoteStatus ? now : undefined, remoteStatusEvidence, remoteStatusChecksum, lines, totalAmount: money(lines.reduce((sum, line) => sum + line.taxableValue + line.taxableValue * line.gstRate / 100, 0)), remoteCreatedAt: input.remoteCreatedAt, remotePayloadChecksum, importedBy: actorId, importedAt: now, scope: structuredClone(next.scope), version: 1 }; next.retailCommerceOrders.unshift(order); return next;
}

/** Stores a provider lifecycle update without overwriting local stock, GST, or return custody state. */
export function recordRetailCommerceRemoteStatus(state: RevenueOpsState, input: RecordRetailCommerceRemoteStatusInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const order = state.retailCommerceOrders.find((item) => item.id === input.id && scoped(state, item));
  if (!order || order.version !== input.expectedVersion) throw new Error('Remote order status evidence is stale or unavailable.');
  if (!orderStatuses.has(input.remoteStatus)) throw new Error('Remote order status is not a supported canonical lifecycle status.');
  const remoteStatusChecksum = sha256(input.remoteStatusChecksum, 'Remote order status checksum');
  const evidence = clean(input.evidence, 'Remote order status evidence', 4, 300);
  if (order.remoteStatus === input.remoteStatus && order.remoteStatusChecksum === remoteStatusChecksum) return state;
  const next = mutate(state);
  next.retailCommerceOrders = next.retailCommerceOrders.map((item) => item.id === order.id ? { ...item, remoteStatus: input.remoteStatus, remoteStatusUpdatedAt: now, remoteStatusEvidence: `${evidence} · ${actorId}`, remoteStatusChecksum, version: item.version + 1 } : item);
  return next;
}

/** Creates an explicit remote-order to local sales-order handoff after amount and scope reconciliation. */
export function handoffRetailCommerceOrder(state: RevenueOpsState, input: HandoffRetailCommerceOrderInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const order = state.retailCommerceOrders.find((item) => item.id === input.orderId && scoped(state, item));
  const salesOrder = state.salesOrders.find((item) => item.id === input.salesOrderId && scoped(state, item));
  if (!order || order.version !== input.expectedVersion || order.localSalesOrderId) throw new Error('Remote order is stale, already handed off, or unavailable.');
  if (!['imported', 'confirmed'].includes(order.status)) throw new Error('Only imported or confirmed remote orders can be handed off.');
  if (!salesOrder || salesOrder.status === 'cancelled') throw new Error('A non-cancelled local sales order is required for the handoff.');
  const salesOrderTotal = money(salesOrder.taxPreview.grandTotal);
  if (Math.abs(salesOrderTotal - order.totalAmount) > 0.01) throw new Error(`Sales-order total ${salesOrderTotal.toFixed(2)} does not reconcile to remote order total ${order.totalAmount.toFixed(2)}.`);
  const handoffEvidence = clean(input.evidence, 'Remote order handoff evidence', 4, 500);
  const next = mutate(state);
  next.retailCommerceOrders = next.retailCommerceOrders.map((item) => item.id === order.id ? { ...item, localSalesOrderId: salesOrder.id, salesOrderHandoffEvidence: handoffEvidence, salesOrderHandoffBy: actorId, salesOrderHandoffAt: now, version: item.version + 1 } : item);
  return next;
}

export function createRetailSettlementReconciliation(state: RevenueOpsState, input: CreateRetailSettlementReconciliationInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const connector = state.retailCommerceConnectors.find((item) => item.id === input.connectorId && scoped(state, item) && ['configured', 'certified'].includes(item.status) && item.capabilities.includes('settlement-pull')); if (!connector) throw new Error('A settlement-pull commerce connector is required.');
  validDate(input.periodFrom, 'Settlement period start'); validDate(input.periodTo, 'Settlement period end'); if (input.periodFrom > input.periodTo) throw new Error('Settlement period is inverted.');
  const refundAmount = input.refundAmount ?? 0;
  if (![input.grossAmount, refundAmount, input.feeAmount, input.taxWithheldAmount, input.localNetAmount].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Settlement amounts must be finite and non-negative.');
  const netAmount = money(input.grossAmount - refundAmount - input.feeAmount - input.taxWithheldAmount); if (netAmount < 0) throw new Error('Refunds, fees and withholding cannot exceed gross amount.');
  const remotePayloadChecksum = sha256(input.remotePayloadChecksum, 'Settlement payload checksum'); const varianceAmount = money(netAmount - input.localNetAmount); const next = mutate(state); const reconciliation: RetailSettlementReconciliation = { id, number: fiscalNumber('RSET', state.retailSettlementReconciliations.length + 1, now), connectorId: connector.id, settlementReference: clean(input.settlementReference, 'Settlement reference', 3, 160), periodFrom: input.periodFrom, periodTo: input.periodTo, grossAmount: money(input.grossAmount), refundAmount: money(refundAmount), feeAmount: money(input.feeAmount), taxWithheldAmount: money(input.taxWithheldAmount), netAmount, localNetAmount: money(input.localNetAmount), varianceAmount, orderIds: [...new Set(input.orderIds)], remotePayloadChecksum, status: Math.abs(varianceAmount) <= 0.01 ? 'matched' : 'variance-review', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }; next.retailSettlementReconciliations.unshift(reconciliation); return next;
}

/** Requires every order explicitly included in a provider settlement to have a terminal, evidenced lifecycle. */
export function assertRetailSettlementOrderClosure(state: RevenueOpsState, settlement: RetailSettlementReconciliation): void {
  if (!settlement.orderIds.length) return;
  const orders = settlement.orderIds.map((orderId) => state.retailCommerceOrders.find((order) => order.id === orderId && order.connectorId === settlement.connectorId && scoped(state, order)));
  if (orders.some((order) => !order)) throw new Error('Settlement order closure is incomplete: every provider order must exist in the active branch and connector.');
  for (const order of orders) {
    if (!order || !['fulfilled', 'cancelled', 'returned', 'rto'].includes(order.status)) throw new Error('Settlement order closure requires every linked order to reach a terminal lifecycle status.');
    if (!order.statusUpdatedBy || !order.statusUpdatedAt || !order.statusEvidence) throw new Error('Settlement order closure requires lifecycle evidence for every linked order.');
    if (['returned', 'rto'].includes(order.status) && (!order.retailReturnId || !order.creditNoteReconciliationId || !order.inventoryEvidenceReference)) throw new Error('Settlement order closure requires approved return, GST credit-note, and inventory evidence for returned or RTO orders.');
  }
}

export function decideRetailSettlementReconciliation(state: RevenueOpsState, input: DecideRetailSettlementReconciliationInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const record = state.retailSettlementReconciliations.find((item) => item.id === input.id && scoped(state, item)); if (!record || record.status !== 'variance-review' || record.version !== input.expectedVersion) throw new Error('Settlement reconciliation is stale or does not require review.'); if (record.requestedBy === actorId) throw new Error('Settlement maker cannot resolve the same variance.'); if (input.decision === 'resolved' && !state.retailSettlementAllocationPacks.some((pack) => pack.id === record.allocationPackId && pack.status === 'approved' && scoped(state, pack))) throw new Error('Settlement variance cannot be resolved until an order-level allocation pack is independently approved.'); if (input.decision === 'resolved' && record.taxWithheldAmount > 0 && !state.retailSettlementWithholdingEvidence.some((item) => item.id === record.withholdingEvidenceId && item.status === 'approved' && scoped(state, item))) throw new Error('Settlement with TDS/TCS cannot be resolved until withholding evidence is independently approved.'); if (input.decision === 'resolved') assertRetailSettlementOrderClosure(state, record);
  const next = mutate(state); next.retailSettlementReconciliations = next.retailSettlementReconciliations.map((item) => item.id === record.id ? { ...item, status: input.decision === 'resolved' ? 'resolved' as const : 'rejected' as const, decidedBy: actorId, decidedAt: now, decisionEvidence: clean(input.evidence, 'Settlement variance evidence', 4, 500), version: item.version + 1 } : item); return next;
}
