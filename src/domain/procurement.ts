import { createHash, randomUUID } from 'node:crypto';
import type {
  AwardRfqInput,
  CreateLandedCostInput,
  CreatePurchaseOrderFromReorderInput,
  CreatePurchaseOrderFromRfqInput,
  CreatePurchaseRequisitionInput,
  CreateRfqFromRequisitionInput,
  CreateRfqInput,
  CreateSupplierInput,
  DecideLandedCostInput,
  DecidePurchaseOrderInput,
  DecidePurchaseRequisitionInput,
  DecideSupplierInput,
  DecideThreeWayMatchInput,
  GoodsReceipt,
  IssueRfqInput,
  RecordGoodsReceiptInput,
  RecordSupplierInvoiceInput,
  RecordSupplierQuotationInput,
} from '../shared/procurement-contracts';
import type { AccountingJournalDraft, JournalLine, RevenueOpsState } from '../shared/revenue-ops-contracts';
import { receiveInventory } from './inventory-warehouse';
import { isIndiaStateCode, validateGstin } from './revenue-ops';

const money = (value: number): number => Math.round(value * 100) / 100;
const clean = (value: string, label: string, min = 2, max = 300): string => {
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length < min || text.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`);
  return text;
};
const validDate = (value: string, label: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) throw new Error(`${label} must use YYYY-MM-DD.`);
  return value;
};
const fiscalNumber = (prefix: string, sequence: number, at: string): string => {
  const date = new Date(`${at.slice(0, 10)}T00:00:00.000Z`);
  const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${prefix}-${String(year).slice(-2)}-${String(year + 1).slice(-2)}-${String(sequence).padStart(5, '0')}`;
};
const mutate = (state: RevenueOpsState): RevenueOpsState => ({ ...structuredClone(state), revision: state.revision + 1 });
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function assertSameProcurementScope(
  state: RevenueOpsState,
  records: Array<{ scope?: RevenueOpsState['scope'] }>,
  label: string,
): void {
  const scope = records[0]?.scope ?? state.scope;
  if (records.some((record) => {
    const candidate = record.scope ?? state.scope;
    return candidate.companyId !== scope.companyId || candidate.branchId !== scope.branchId;
  })) {
    throw new Error(`${label} must belong to one company and branch scope.`);
  }
}

function purchaseJournal(sourceType: AccountingJournalDraft['sourceType'], sourceId: string, sourceNumber: string, date: string, lines: JournalLine[]): AccountingJournalDraft {
  const totalDebit = money(lines.reduce((total, line) => total + line.debit, 0));
  const totalCredit = money(lines.reduce((total, line) => total + line.credit, 0));
  if (totalDebit !== totalCredit) throw new Error('Procurement accounting handoff is not balanced.');
  const unsigned = { sourceType, sourceId, sourceNumber, postingDate: date, lines, totalDebit, totalCredit };
  return { id: randomUUID(), ...unsigned, status: 'ready', checksum: digest(unsigned), version: 1 };
}

function supplierInvoiceJournal(state: RevenueOpsState, sourceId: string, invoice: { number: string; supplierId: string; invoiceDate: string; lines: Array<{ quantity: number; unitPrice: number }>; totalAmount: number }): AccountingJournalDraft {
  const taxable = money(invoice.lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0));
  const tax = money(invoice.totalAmount - taxable);
  const vendor = state.suppliers.find(({ id }) => id === invoice.supplierId);
  const inputTaxLines: JournalLine[] = !tax ? [] : vendor?.stateCode === state.profile.defaultStateCode
    ? [{ accountCode: 'input-cgst', debit: money(tax / 2), credit: 0, memo: invoice.number }, { accountCode: 'input-sgst', debit: money(tax - money(tax / 2)), credit: 0, memo: invoice.number }]
    : [{ accountCode: 'input-igst', debit: tax, credit: 0, memo: invoice.number }];
  return purchaseJournal('supplier-invoice', sourceId, invoice.number, invoice.invoiceDate, [{ accountCode: 'inventory-asset', debit: taxable, credit: 0, memo: invoice.number }, ...inputTaxLines, { accountCode: 'accounts-payable', debit: 0, credit: invoice.totalAmount, memo: invoice.number }]);
}

function supplier(state: RevenueOpsState, id: string) {
  const item = state.suppliers.find((candidate) => candidate.id === id && candidate.status === 'approved');
  if (!item) throw new Error('An approved supplier is required.');
  return item;
}

function assertDifferentMaker(maker: string, actorId: string, label: string): void {
  if (maker === actorId) throw new Error(`${label} maker cannot approve the same record.`);
}

function itemDescription(state: RevenueOpsState, itemVariantId: string): string {
  const variant = state.itemVariants.find(({ id, active }) => id === itemVariantId && active);
  if (!variant) throw new Error('Active item variant not found.');
  return variant.name;
}

export function createSupplier(state: RevenueOpsState, input: CreateSupplierInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,19}$/.test(code) || state.suppliers.some((item) => item.code === code)) throw new Error('Supplier code is invalid or already exists.');
  if (!isIndiaStateCode(input.stateCode)) throw new Error('Supplier state code is unsupported.');
  const gstin = input.gstin?.trim().toUpperCase();
  if (gstin) validateGstin(gstin, input.stateCode);
  const pan = input.pan?.trim().toUpperCase();
  if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) throw new Error('Supplier PAN has an invalid structure.');
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new Error('Supplier email is invalid.');
  if (!Number.isInteger(input.paymentTermDays) || input.paymentTermDays < 0 || input.paymentTermDays > 365) throw new Error('Supplier payment terms must be 0-365 days.');
  const categories = [...new Set(input.categories.map((value) => clean(value, 'Supplier category', 2, 50)))];
  if (!categories.length || categories.length > 12) throw new Error('Supplier needs 1-12 procurement categories.');
  const next = mutate(state);
  next.suppliers.unshift({ id, code, legalName: clean(input.legalName, 'Supplier legal name'), tradeName: input.tradeName?.trim() || undefined, gstin, pan, stateCode: input.stateCode, email: input.email.trim().toLowerCase(), paymentTermDays: input.paymentTermDays, categories, riskRating: input.riskRating, qualificationEvidence: clean(input.qualificationEvidence, 'Qualification evidence', 6, 300), status: 'pending', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function decideSupplier(state: RevenueOpsState, input: DecideSupplierInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const record = state.suppliers.find(({ id }) => id === input.id);
  if (!record || record.status !== 'pending' || record.version !== input.expectedVersion) throw new Error('Supplier qualification is stale or no longer pending.');
  assertDifferentMaker(record.requestedBy, actorId, 'Supplier qualification');
  const next = mutate(state);
  next.suppliers = next.suppliers.map((item) => item.id === record.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Supplier decision remarks', 4, 500), version: item.version + 1 } : item);
  return next;
}

export function createPurchaseRequisition(state: RevenueOpsState, input: CreatePurchaseRequisitionInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const warehouse = state.warehouses.find(({ id: warehouseId, active }) => warehouseId === input.warehouseId && active);
  if (!warehouse) throw new Error('Purchase requisition requires an active warehouse.');
  assertSameProcurementScope(state, [warehouse], 'Purchase requisition');
  if (!['low', 'normal', 'high'].includes(input.priority)) throw new Error('Purchase requisition priority is invalid.');
  validDate(input.neededBy, 'Requisition needed-by date');
  if (input.neededBy < now.slice(0, 10)) throw new Error('Requisition needed-by date cannot be in the past.');
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 50) throw new Error('Purchase requisition needs 1-50 demand lines.');
  if (new Set(input.lines.map(({ itemVariantId }) => itemVariantId)).size !== input.lines.length) throw new Error('Purchase requisition cannot repeat an item variant.');
  const lines = input.lines.map((line) => {
    const quantity = Number(line.quantity); const estimatedUnitPrice = Number(line.estimatedUnitPrice);
    if (!(quantity > 0) || !(estimatedUnitPrice >= 0)) throw new Error('Requisition line quantity must be positive and estimated price non-negative.');
    return { id: randomUUID(), itemVariantId: line.itemVariantId, description: itemDescription(state, line.itemVariantId), quantity, estimatedUnitPrice: money(estimatedUnitPrice), estimatedValue: money(quantity * estimatedUnitPrice) };
  });
  const next = mutate(state);
  next.purchaseRequisitions.unshift({ id, number: fiscalNumber('PR', state.purchaseRequisitions.length + 1, now), title: clean(input.title, 'Requisition title'), warehouseId: input.warehouseId, priority: input.priority, neededBy: input.neededBy, justification: clean(input.justification, 'Requisition justification', 6, 500), lines, estimatedValue: money(lines.reduce((total, line) => total + line.estimatedValue, 0)), status: 'submitted', requestedBy: actorId, requestedAt: now, scope: structuredClone(warehouse.scope ?? next.scope), version: 1 });
  return next;
}

export function decidePurchaseRequisition(state: RevenueOpsState, input: DecidePurchaseRequisitionInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const record = state.purchaseRequisitions.find(({ id }) => id === input.id);
  if (!record || record.status !== 'submitted' || record.version !== input.expectedVersion) throw new Error('Purchase requisition is stale or no longer awaiting approval.');
  assertDifferentMaker(record.requestedBy, actorId, 'Purchase requisition');
  const next = mutate(state);
  next.purchaseRequisitions = next.purchaseRequisitions.map((item) => item.id === record.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Requisition decision remarks', 4, 500), version: item.version + 1 } : item);
  return next;
}

export function createRfqFromRequisition(state: RevenueOpsState, input: CreateRfqFromRequisitionInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const requisition = state.purchaseRequisitions.find(({ id }) => id === input.requisitionId);
  if (!requisition || requisition.status !== 'approved' || requisition.version !== input.expectedVersion) throw new Error('An approved purchase requisition is required to source an RFQ.');
  if (requisition.convertedRfqId) throw new Error('Purchase requisition was already sourced into an RFQ.');
  const next = createRfq(state, { title: requisition.title, warehouseId: requisition.warehouseId, supplierIds: input.supplierIds, lines: requisition.lines.map((line) => ({ itemVariantId: line.itemVariantId, quantity: line.quantity })), requiredBy: input.requiredBy }, actorId, id, now);
  const rfq = next.requestForQuotations.find((candidate) => candidate.id === id);
  next.purchaseRequisitions = next.purchaseRequisitions.map((item) => item.id === requisition.id ? { ...item, status: 'converted', convertedRfqId: rfq?.id, version: item.version + 1 } : item);
  return next;
}

export function createRfq(state: RevenueOpsState, input: CreateRfqInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const warehouse = state.warehouses.find(({ id: warehouseId, active }) => warehouseId === input.warehouseId && active);
  if (!warehouse) throw new Error('RFQ requires an active warehouse.');
  const supplierIds = [...new Set(input.supplierIds)];
  if (!supplierIds.length || supplierIds.length > 12 || supplierIds.some((supplierId) => !state.suppliers.some(({ id, status }) => id === supplierId && status === 'approved'))) throw new Error('RFQ needs 1-12 approved suppliers.');
  assertSameProcurementScope(state, [warehouse, ...supplierIds.map((supplierId) => state.suppliers.find(({ id }) => id === supplierId)!)], 'RFQ');
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 50) throw new Error('RFQ needs 1-50 requested item lines.');
  if (new Set(input.lines.map(({ itemVariantId }) => itemVariantId)).size !== input.lines.length) throw new Error('RFQ cannot repeat an item variant.');
  validDate(input.requiredBy, 'RFQ required-by date');
  if (input.requiredBy < now.slice(0, 10)) throw new Error('RFQ required-by date cannot be in the past.');
  const next = mutate(state);
  next.requestForQuotations.unshift({ id, number: fiscalNumber('RFQ', state.requestForQuotations.length + 1, now), title: clean(input.title, 'RFQ title'), warehouseId: input.warehouseId, supplierIds, lines: input.lines.map((line) => ({ id: randomUUID(), itemVariantId: line.itemVariantId, description: itemDescription(state, line.itemVariantId), quantity: Number(line.quantity) > 0 ? Number(line.quantity) : (() => { throw new Error('RFQ quantity must be positive.'); })() })), requiredBy: input.requiredBy, status: 'draft', createdBy: actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function issueRfq(state: RevenueOpsState, input: IssueRfqInput): RevenueOpsState {
  const rfq = state.requestForQuotations.find(({ id }) => id === input.id);
  if (!rfq || rfq.status !== 'draft' || rfq.version !== input.expectedVersion) throw new Error('RFQ is stale or cannot be issued.');
  const next = mutate(state);
  next.requestForQuotations = next.requestForQuotations.map((item) => item.id === rfq.id ? { ...item, status: 'issued', version: item.version + 1 } : item);
  return next;
}

export function recordSupplierQuotation(state: RevenueOpsState, input: RecordSupplierQuotationInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const rfq = state.requestForQuotations.find(({ id, status }) => id === input.rfqId && status === 'issued');
  if (!rfq || !rfq.supplierIds.includes(input.supplierId)) throw new Error('Supplier quotation requires an issued RFQ addressed to the supplier.');
  const vendor = supplier(state, input.supplierId);
  assertSameProcurementScope(state, [rfq, vendor], 'Supplier quotation');
  validDate(input.validUntil, 'Quotation validity');
  if (input.validUntil < now.slice(0, 10) || !Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0 || input.leadTimeDays > 730) throw new Error('Supplier quotation validity or lead time is invalid.');
  if (state.supplierQuotations.some(({ rfqId, supplierId, status }) => rfqId === rfq.id && supplierId === input.supplierId && status === 'submitted')) throw new Error('Supplier already has an active quotation for this RFQ.');
  if (input.lines.length !== rfq.lines.length || new Set(input.lines.map(({ rfqLineId }) => rfqLineId)).size !== input.lines.length) throw new Error('Supplier quotation must price every RFQ line once.');
  const lines = rfq.lines.map((rfqLine) => {
    const proposed = input.lines.find(({ rfqLineId }) => rfqLineId === rfqLine.id);
    if (!proposed || proposed.unitPrice <= 0 || proposed.gstRate < 0 || proposed.gstRate > 100) throw new Error('Supplier quotation line is invalid.');
    const taxableValue = money(rfqLine.quantity * proposed.unitPrice); const taxAmount = money(taxableValue * proposed.gstRate / 100);
    return { rfqLineId: rfqLine.id, itemVariantId: rfqLine.itemVariantId, quantity: rfqLine.quantity, unitPrice: money(proposed.unitPrice), gstRate: proposed.gstRate, taxableValue, taxAmount, totalAmount: money(taxableValue + taxAmount) };
  });
  const next = mutate(state);
  next.supplierQuotations.unshift({ id, number: fiscalNumber('SQ', state.supplierQuotations.length + 1, now), rfqId: rfq.id, supplierId: input.supplierId, validUntil: input.validUntil, leadTimeDays: input.leadTimeDays, lines, totalAmount: money(lines.reduce((total, line) => total + line.totalAmount, 0)), commercialRemarks: input.commercialRemarks?.trim() || undefined, status: 'submitted', submittedBy: actorId, submittedAt: now, scope: structuredClone(rfq.scope ?? next.scope), version: 1 });
  return next;
}

export function awardRfq(state: RevenueOpsState, input: AwardRfqInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const rfq = state.requestForQuotations.find(({ id }) => id === input.rfqId);
  const quote = state.supplierQuotations.find(({ id }) => id === input.supplierQuotationId);
  // Preserve the segregation-of-duties boundary as the first actionable
  // decision. A maker must never be able to probe or bypass the award path,
  // even when the quotation has also become stale since it was issued.
  if (rfq?.createdBy === actorId) throw new Error('RFQ maker cannot award the same sourcing event.');
  if (!rfq || rfq.status !== 'issued' || rfq.version !== input.expectedVersion || !quote || quote.rfqId !== rfq.id || quote.status !== 'submitted' || quote.validUntil < now.slice(0, 10)) throw new Error('RFQ award is stale, invalid or expired.');
  assertSameProcurementScope(state, [rfq, quote], 'RFQ award');
  const next = mutate(state);
  next.requestForQuotations = next.requestForQuotations.map((item) => item.id === rfq.id ? { ...item, status: 'awarded', awardedQuotationId: quote.id, version: item.version + 1 } : item);
  next.supplierQuotations = next.supplierQuotations.map((item) => item.rfqId === rfq.id ? { ...item, status: item.id === quote.id ? 'awarded' : 'lost', version: item.version + 1 } : item);
  return next;
}

function createPurchaseOrder(state: RevenueOpsState, supplierId: string, warehouseId: string, source: { rfqId?: string; supplierQuotationId?: string; reorderProposalId?: string }, lines: Array<{ itemVariantId: string; quantity: number; unitPrice: number; gstRate: number }>, deliveryBy: string, actorId: string, id: string, now: string): RevenueOpsState {
  const vendor = supplier(state, supplierId);
  const warehouse = state.warehouses.find(({ id: candidate, active }) => candidate === warehouseId && active);
  if (!warehouse) throw new Error('Purchase order needs an active warehouse.');
  assertSameProcurementScope(state, [vendor, warehouse], 'Purchase order');
  validDate(deliveryBy, 'Purchase delivery-by date');
  if (deliveryBy < now.slice(0, 10)) throw new Error('Purchase delivery-by date cannot be in the past.');
  if (!lines.length || lines.length > 50) throw new Error('Purchase order needs 1-50 lines.');
  const poLines = lines.map((line) => {
    if (line.quantity <= 0 || line.unitPrice <= 0 || line.gstRate < 0 || line.gstRate > 100) throw new Error('Purchase-order line is invalid.');
    const taxableValue = money(line.quantity * line.unitPrice); const taxAmount = money(taxableValue * line.gstRate / 100);
    return { id: randomUUID(), itemVariantId: line.itemVariantId, description: itemDescription(state, line.itemVariantId), quantity: line.quantity, unitPrice: money(line.unitPrice), gstRate: line.gstRate, taxableValue, taxAmount, totalAmount: money(taxableValue + taxAmount), receivedQuantity: 0, invoicedQuantity: 0 };
  });
  const next = mutate(state);
  next.purchaseOrders.unshift({ id, number: fiscalNumber('PO', state.purchaseOrders.length + 1, now), supplierId: vendor.id, warehouseId, ...source, deliveryBy, paymentTermDays: vendor.paymentTermDays, status: 'submitted', lines: poLines, taxableValue: money(poLines.reduce((total, line) => total + line.taxableValue, 0)), taxAmount: money(poLines.reduce((total, line) => total + line.taxAmount, 0)), totalAmount: money(poLines.reduce((total, line) => total + line.totalAmount, 0)), createdBy: actorId, createdAt: now, scope: structuredClone(warehouse.scope ?? next.scope), version: 1 });
  return next;
}

export function createPurchaseOrderFromRfq(state: RevenueOpsState, input: CreatePurchaseOrderFromRfqInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const rfq = state.requestForQuotations.find(({ id, status }) => id === input.rfqId && status === 'awarded');
  const quote = state.supplierQuotations.find(({ id, status }) => id === input.supplierQuotationId && status === 'awarded');
  if (!rfq || !quote || quote.rfqId !== rfq.id || rfq.awardedQuotationId !== quote.id) throw new Error('Purchase order requires the awarded RFQ quotation.');
  if (state.purchaseOrders.some(({ supplierQuotationId }) => supplierQuotationId === quote.id)) throw new Error('Awarded quotation was already converted into a purchase order.');
  return createPurchaseOrder(state, quote.supplierId, rfq.warehouseId, { rfqId: rfq.id, supplierQuotationId: quote.id }, quote.lines.map((line) => ({ itemVariantId: line.itemVariantId, quantity: line.quantity, unitPrice: line.unitPrice, gstRate: line.gstRate })), input.deliveryBy, actorId, id, now);
}

export function createPurchaseOrderFromReorder(state: RevenueOpsState, input: CreatePurchaseOrderFromReorderInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const proposal = state.reorderProposals.find(({ id, status }) => id === input.reorderProposalId && status === 'approved');
  if (!proposal || proposal.recommendedQuantity <= 0 || proposal.decidedBy === actorId) throw new Error('An independently approved reorder proposal is required.');
  const policy = state.reorderPolicies.find(({ id }) => id === proposal.policyId);
  if (!policy || policy.warehouseId !== input.warehouseId) throw new Error('Reorder proposal does not match the selected warehouse.');
  assertSameProcurementScope(state, [proposal, policy], 'Reorder purchase order');
  if (state.purchaseOrders.some(({ reorderProposalId }) => reorderProposalId === proposal.id)) throw new Error('Reorder proposal was already converted.');
  const next = createPurchaseOrder(state, input.supplierId, input.warehouseId, { reorderProposalId: proposal.id }, [{ itemVariantId: policy.itemVariantId, quantity: proposal.recommendedQuantity, unitPrice: input.unitPrice, gstRate: input.gstRate }], input.deliveryBy, actorId, id, now);
  next.reorderProposals = next.reorderProposals.map((item) => item.id === proposal.id ? { ...item, status: 'converted', version: item.version + 1 } : item);
  return next;
}

export function decidePurchaseOrder(state: RevenueOpsState, input: DecidePurchaseOrderInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const po = state.purchaseOrders.find(({ id }) => id === input.id);
  if (!po || po.status !== 'submitted' || po.version !== input.expectedVersion) throw new Error('Purchase order is stale or no longer awaiting approval.');
  assertDifferentMaker(po.createdBy, actorId, 'Purchase order');
  const next = mutate(state);
  next.purchaseOrders = next.purchaseOrders.map((item) => item.id === po.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Purchase-order decision remarks', 4, 500), version: item.version + 1 } : item);
  return next;
}

export function recordGoodsReceipt(state: RevenueOpsState, input: RecordGoodsReceiptInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const po = state.purchaseOrders.find(({ id, status }) => id === input.purchaseOrderId && ['approved', 'partially-received'].includes(status));
  const bin = state.storageBins.find(({ id }) => id === input.receivingBinId);
  if (!po || !bin) throw new Error('Goods receipt requires an approved purchase order and receiving bin.');
  assertSameProcurementScope(state, [po, bin], 'Goods receipt');
  validDate(input.receivedAt, 'Goods receipt date');
  if (!input.lines.length || new Set(input.lines.map(({ purchaseOrderLineId }) => purchaseOrderLineId)).size !== input.lines.length) throw new Error('Goods receipt must contain unique purchase-order lines.');
  const number = fiscalNumber('GRN', state.goodsReceipts.length + 1, input.receivedAt);
  let next = structuredClone(state);
  const lines: GoodsReceipt['lines'] = [];
  for (const [index, inputLine] of input.lines.entries()) {
    const poLine = po.lines.find(({ id: lineId }) => lineId === inputLine.purchaseOrderLineId);
    if (!poLine || inputLine.quantity <= 0 || inputLine.quantity > money(poLine.quantity - poLine.receivedQuantity)) throw new Error('Goods receipt quantity exceeds the open purchase-order quantity.');
    const inventoryReference = `${number}-${String(index + 1).padStart(2, '0')}`;
    next = receiveInventory(next, { warehouseId: po.warehouseId, receivingBinId: input.receivingBinId, itemVariantId: poLine.itemVariantId, quantity: inputLine.quantity, uomId: next.inventoryItems.find((item) => item.id === next.itemVariants.find(({ id }) => id === poLine.itemVariantId)?.itemId)?.baseUomId ?? '', unitCost: poLine.unitPrice, reference: inventoryReference, receivedAt: `${input.receivedAt}T12:00:00.000Z`, batchNumber: inputLine.batchNumber, manufacturedAt: inputLine.manufacturedAt, expiresAt: inputLine.expiresAt, serialNumbers: inputLine.serialNumbers }, actorId, now);
    lines.push({ id: randomUUID(), purchaseOrderLineId: poLine.id, itemVariantId: poLine.itemVariantId, quantity: inputLine.quantity, unitPrice: poLine.unitPrice, inventoryReference, batchNumber: inputLine.batchNumber?.trim().toUpperCase(), serialNumbers: inputLine.serialNumbers.map((serial) => serial.trim().toUpperCase()) });
  }
  next.revision += 1;
  next.goodsReceipts.unshift({ id, number, purchaseOrderId: po.id, supplierId: po.supplierId, warehouseId: po.warehouseId, receivingBinId: input.receivingBinId, receivedAt: input.receivedAt, lines, status: 'cost-pending', receivedBy: actorId, receivedAtRecorded: now, scope: structuredClone(po.scope ?? next.scope), version: 1 });
  next.purchaseOrders = next.purchaseOrders.map((order) => order.id === po.id ? { ...order, lines: order.lines.map((line) => ({ ...line, receivedQuantity: money(line.receivedQuantity + (lines.find(({ purchaseOrderLineId }) => purchaseOrderLineId === line.id)?.quantity ?? 0)) })), status: order.lines.every((line) => money(line.receivedQuantity + (lines.find(({ purchaseOrderLineId }) => purchaseOrderLineId === line.id)?.quantity ?? 0)) >= line.quantity) ? 'received' : 'partially-received', version: order.version + 1 } : order);
  return next;
}

export function createLandedCost(state: RevenueOpsState, input: CreateLandedCostInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const receipt = state.goodsReceipts.find(({ id, status }) => id === input.goodsReceiptId && status === 'cost-pending');
  if (!receipt || state.landedCostAllocations.some(({ goodsReceiptId, status }) => goodsReceiptId === input.goodsReceiptId && status === 'pending')) throw new Error('Goods receipt is unavailable for landed-cost allocation.');
  if (!input.charges.length || input.charges.length > 20) throw new Error('Landed cost requires 1-20 positive charge lines.');
  const charges = input.charges.map((charge) => ({ description: clean(charge.description, 'Landed-cost description'), amount: money(charge.amount) }));
  if (charges.some(({ amount }) => amount <= 0)) throw new Error('Landed-cost charges must be positive.');
  const totalAmount = money(charges.reduce((total, charge) => total + charge.amount, 0));
  const denominator = receipt.lines.reduce((total, line) => total + (input.basis === 'value' ? line.quantity * line.unitPrice : line.quantity), 0);
  const allocations = receipt.lines.map((line, index) => {
    const weight = input.basis === 'value' ? line.quantity * line.unitPrice : line.quantity;
    const amount = index === receipt.lines.length - 1 ? money(totalAmount - receipt.lines.slice(0, index).reduce((total, prior) => total + (input.basis === 'value' ? prior.quantity * prior.unitPrice : prior.quantity) / denominator * totalAmount, 0)) : money(weight / denominator * totalAmount);
    return { goodsReceiptLineId: line.id, amount, adjustedUnitCost: money(line.unitPrice + amount / line.quantity) };
  });
  const next = mutate(state);
  next.landedCostAllocations.unshift({ id, number: fiscalNumber('LCA', state.landedCostAllocations.length + 1, now), goodsReceiptId: receipt.id, basis: input.basis, charges, totalAmount, allocations, status: 'pending', requestedBy: actorId, requestedAt: now, scope: structuredClone(receipt.scope ?? next.scope), version: 1 });
  return next;
}

export function decideLandedCost(state: RevenueOpsState, input: DecideLandedCostInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const allocation = state.landedCostAllocations.find(({ id }) => id === input.id);
  if (!allocation || allocation.status !== 'pending' || allocation.version !== input.expectedVersion) throw new Error('Landed-cost allocation is stale or no longer pending.');
  assertDifferentMaker(allocation.requestedBy, actorId, 'Landed-cost allocation');
  const receipt = state.goodsReceipts.find(({ id }) => id === allocation.goodsReceiptId);
  if (!receipt) throw new Error('Related goods receipt is unavailable.');
  const next = mutate(state);
  if (input.decision === 'approved') {
    for (const item of allocation.allocations) {
      const receiptLine = receipt.lines.find(({ id }) => id === item.goodsReceiptLineId)!;
      const layer = next.inventoryCostLayers.find(({ sourceReference, remainingQuantity }) => sourceReference === receiptLine.inventoryReference && remainingQuantity >= receiptLine.quantity);
      const ledger = next.inventoryLedger.find(({ reference, type }) => reference === receiptLine.inventoryReference && type === 'receipt');
      if (!layer || !ledger) throw new Error('Landed cost must be approved before received inventory is consumed or moved.');
      next.inventoryCostLayers = next.inventoryCostLayers.map((candidate) => candidate.id === layer.id ? { ...candidate, unitCost: item.adjustedUnitCost, version: candidate.version + 1 } : candidate);
      const balance = next.binBalances.find(({ binId, itemVariantId, batchId }) => binId === ledger.binId && itemVariantId === ledger.itemVariantId && batchId === ledger.batchId);
      if (balance) next.binBalances = next.binBalances.map((candidate) => candidate.id === balance.id ? { ...candidate, inventoryValue: money(candidate.inventoryValue + item.amount), unitCost: money((candidate.inventoryValue + item.amount) / candidate.quantity), version: candidate.version + 1 } : candidate);
    }
    next.goodsReceipts = next.goodsReceipts.map((item) => item.id === receipt.id ? { ...item, status: 'costed', version: item.version + 1 } : item);
    next.journalDrafts.unshift(purchaseJournal('landed-cost', allocation.id, allocation.number, now.slice(0, 10), [{ accountCode: 'inventory-asset', debit: allocation.totalAmount, credit: 0, memo: allocation.number }, { accountCode: 'landed-cost-clearing', debit: 0, credit: allocation.totalAmount, memo: allocation.number }]));
  }
  next.landedCostAllocations = next.landedCostAllocations.map((item) => item.id === allocation.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Landed-cost decision remarks', 4, 500), version: item.version + 1 } : item);
  return next;
}

export function recordSupplierInvoice(state: RevenueOpsState, input: RecordSupplierInvoiceInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const po = state.purchaseOrders.find(({ id, status }) => id === input.purchaseOrderId && ['partially-received', 'received'].includes(status));
  const receipt = state.goodsReceipts.find(({ id, purchaseOrderId }) => id === input.goodsReceiptId && purchaseOrderId === input.purchaseOrderId);
  if (!po || !receipt || state.supplierInvoices.some(({ supplierId, supplierInvoiceNumber }) => supplierId === po.supplierId && supplierInvoiceNumber === input.supplierInvoiceNumber.trim().toUpperCase())) throw new Error('Supplier invoice requires a received purchase order and unique supplier invoice number.');
  assertSameProcurementScope(state, [po, receipt], 'Supplier invoice');
  validDate(input.invoiceDate, 'Supplier invoice date');
  if (!input.lines.length || new Set(input.lines.map(({ purchaseOrderLineId }) => purchaseOrderLineId)).size !== input.lines.length) throw new Error('Supplier invoice needs unique purchase-order lines.');
  const lines = input.lines.map((line) => {
    const poLine = po.lines.find(({ id }) => id === line.purchaseOrderLineId);
    if (!poLine || line.quantity <= 0 || line.quantity > money(poLine.receivedQuantity - poLine.invoicedQuantity) || line.unitPrice <= 0 || line.gstRate < 0 || line.gstRate > 100) throw new Error('Supplier invoice line exceeds received or uninvoiced quantity.');
    const taxable = money(line.quantity * line.unitPrice); return { purchaseOrderLineId: line.purchaseOrderLineId, quantity: line.quantity, unitPrice: money(line.unitPrice), gstRate: line.gstRate, totalAmount: money(taxable + taxable * line.gstRate / 100) };
  });
  const totalAmount = money(lines.reduce((total, line) => total + line.totalAmount, 0));
  const invoice = { id, number: fiscalNumber('VIN', state.supplierInvoices.length + 1, now), supplierId: po.supplierId, purchaseOrderId: po.id, goodsReceiptId: receipt.id, supplierInvoiceNumber: input.supplierInvoiceNumber.trim().toUpperCase(), invoiceDate: input.invoiceDate, lines, totalAmount, recordedBy: actorId, recordedAt: now, scope: structuredClone(po.scope ?? state.scope), version: 1 };
  const expectedQuantity = po.lines.reduce((total, line) => total + line.quantity, 0); const actualQuantity = lines.reduce((total, line) => total + line.quantity, 0);
  const expectedTaxable = po.lines.filter((line) => lines.some(({ purchaseOrderLineId }) => purchaseOrderLineId === line.id)).reduce((total, line) => total + line.unitPrice * (lines.find(({ purchaseOrderLineId }) => purchaseOrderLineId === line.id)?.quantity ?? 0), 0);
  const actualTaxable = lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
  const quantityVariance = money(expectedQuantity - actualQuantity); const priceVariance = money(actualTaxable - expectedTaxable);
  const tolerancePercent = 1;
  const status = Math.abs(priceVariance) <= Math.max(1, expectedTaxable * tolerancePercent / 100) && quantityVariance === 0 ? 'matched' : 'variance-review';
  const matchId = randomUUID();
  const next = mutate(state);
  next.supplierInvoices.unshift(invoice);
  next.purchaseOrders = next.purchaseOrders.map((order) => order.id === po.id ? { ...order, lines: order.lines.map((line) => ({ ...line, invoicedQuantity: money(line.invoicedQuantity + (lines.find(({ purchaseOrderLineId }) => purchaseOrderLineId === line.id)?.quantity ?? 0)) })), version: order.version + 1 } : order);
  const journal = status === 'matched' ? supplierInvoiceJournal(state, matchId, invoice) : undefined;
  next.threeWayMatches.unshift({ id: matchId, number: fiscalNumber('3WM', state.threeWayMatches.length + 1, now), purchaseOrderId: po.id, goodsReceiptId: receipt.id, supplierInvoiceId: invoice.id, quantityVariance, priceVariance, status, tolerancePercent, createdBy: actorId, createdAt: now, journalId: journal?.id, scope: structuredClone(invoice.scope), version: 1 });
  if (journal) next.journalDrafts.unshift(journal);
  return next;
}

export function decideThreeWayMatch(state: RevenueOpsState, input: DecideThreeWayMatchInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const match = state.threeWayMatches.find(({ id }) => id === input.id);
  if (!match || match.status !== 'variance-review' || match.version !== input.expectedVersion) throw new Error('Three-way match is stale or does not require a decision.');
  assertDifferentMaker(match.createdBy, actorId, 'Three-way match');
  const invoice = state.supplierInvoices.find(({ id }) => id === match.supplierInvoiceId);
  if (!invoice) throw new Error('Supplier invoice is unavailable.');
  const journal = input.decision === 'approved' ? supplierInvoiceJournal(state, match.id, invoice) : undefined;
  const next = mutate(state);
  next.threeWayMatches = next.threeWayMatches.map((item) => item.id === match.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Three-way decision remarks', 4, 500), journalId: journal?.id, version: item.version + 1 } : item);
  if (journal) next.journalDrafts.unshift(journal);
  return next;
}

export interface RetailMarginEvaluation {
  itemVariantId: string;
  catalogProductId: string;
  landedUnitCost: number;
  currentRetailUnitPrice?: number;
  grossMarginPercent?: number;
  targetMarginPercent: number;
  isBelowTarget: boolean;
  recommendedUnitPrice?: number;
}

export function evaluateRetailLandedMargin(
  state: RevenueOpsState,
  itemVariantId: string,
  landedUnitCost: number,
  targetMarginPercent = 25.0,
): RetailMarginEvaluation {
  const variant = state.itemVariants.find(({ id }) => id === itemVariantId);
  if (!variant) throw new Error('Item variant not found.');
  const item = state.inventoryItems.find(({ id }) => id === variant.itemId);
  const product = item && state.products.find(({ id }) => id === item.productId);
  if (!product) throw new Error('Catalog product not found for item variant.');

  const priceList = state.priceLists.find(({ channel, active, status }) => active && status === 'active' && (channel === 'retail' || channel === 'all'));
  const entry = priceList && state.priceListEntries.find(({ priceListId, productId }) => priceListId === priceList.id && productId === product.id);

  const currentRetailUnitPrice = entry?.unitPrice;
  let grossMarginPercent: number | undefined;
  let isBelowTarget = false;

  if (currentRetailUnitPrice && currentRetailUnitPrice > 0) {
    grossMarginPercent = money(((currentRetailUnitPrice - landedUnitCost) / currentRetailUnitPrice) * 100);
    isBelowTarget = grossMarginPercent < targetMarginPercent;
  } else {
    isBelowTarget = true;
  }

  const recommendedUnitPrice = money(landedUnitCost / Math.max(0.01, (1 - targetMarginPercent / 100)));

  return {
    itemVariantId,
    catalogProductId: product.id,
    landedUnitCost,
    currentRetailUnitPrice,
    grossMarginPercent,
    targetMarginPercent,
    isBelowTarget,
    recommendedUnitPrice,
  };
}

export function updateRetailPriceForTargetMargin(
  state: RevenueOpsState,
  itemVariantId: string,
  targetUnitPrice: number,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const variant = state.itemVariants.find(({ id }) => id === itemVariantId);
  if (!variant) throw new Error('Item variant not found.');
  const item = state.inventoryItems.find(({ id }) => id === variant.itemId);
  const product = item && state.products.find(({ id }) => id === item.productId);
  if (!product) throw new Error('Catalog product not found for item variant.');

  const priceList = state.priceLists.find(({ channel, active, status }) => active && status === 'active' && (channel === 'retail' || channel === 'all'));
  if (!priceList) throw new Error('Active retail price book not found.');

  const next = mutate(state);
  const existingIndex = next.priceListEntries.findIndex(({ priceListId, productId }) => priceListId === priceList.id && productId === product.id);

  if (existingIndex >= 0) {
    const existing = next.priceListEntries[existingIndex]!;
    next.priceListEntries[existingIndex] = {
      ...existing,
      unitPrice: money(targetUnitPrice),
      version: existing.version + 1,
    };
  } else {
    next.priceListEntries.unshift({
      id: randomUUID(),
      priceListId: priceList.id,
      productId: product.id,
      minimumQuantity: 1,
      unitPrice: money(targetUnitPrice),
      effectiveFrom: now.slice(0, 10),
      effectiveTo: '2029-12-31',
      version: 1,
    });
  }

  return next;
}
