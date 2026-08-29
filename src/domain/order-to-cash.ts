import { createHash, randomUUID } from 'node:crypto';
import type {
  AccountingJournalDraft,
  ApplyUnappliedReceiptInput,
  CreateCreditDebitNoteInput,
  CreateInvoiceDraftInput,
  CreatePaymentTermInput,
  CreateServiceMilestoneInput,
  CreditDebitNote,
  DeliveryEvidence,
  ExportJournalInput,
  InvoiceDocumentReceipt,
  IssueInvoiceInput,
  JournalLine,
  PaymentReceipt,
  PaymentTerm,
  QuoteLine,
  QuoteTaxPreview,
  Receivable,
  RecordDeliveryEvidenceInput,
  RecordPaymentInput,
  ReconcilePaymentInput,
  RevenueOpsState,
  ServiceMilestone,
  ServiceMilestoneStatus,
  TaxInvoice,
  TransitionServiceMilestoneInput,
} from '../shared/revenue-ops-contracts';

function clean(value: string, label: string, minimum = 2, maximum = 300): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
}

function code(value: string, label: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(normalized)) throw new Error(`${label} must use 2-32 letters, numbers, dashes, or underscores.`);
  return normalized;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) throw new Error('Document date is invalid.');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fiscalNumber(prefix: string, index: number, dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() + 1 >= 4 ? year : year - 1;
  return `${prefix}-${String(start).slice(-2)}-${String(start + 1).slice(-2)}-${String(index).padStart(5, '0')}`;
}

function journal(sourceType: AccountingJournalDraft['sourceType'], sourceId: string, sourceNumber: string, postingDate: string, lines: JournalLine[], status: AccountingJournalDraft['status'] = 'ready', id: string = randomUUID()): AccountingJournalDraft {
  const normalized = lines.map((line) => ({ ...line, debit: money(line.debit), credit: money(line.credit) }));
  const totalDebit = money(normalized.reduce((total, line) => total + line.debit, 0));
  const totalCredit = money(normalized.reduce((total, line) => total + line.credit, 0));
  if (totalDebit !== totalCredit) throw new Error('Accounting handoff is not balanced.');
  const unsigned = { sourceType, sourceId, sourceNumber, postingDate, lines: normalized, totalDebit, totalCredit };
  return { id, ...unsigned, status, checksum: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'), version: 1 };
}

function isPositiveMoney(value: number): boolean {
  return Number.isFinite(value) && value > 0 && money(value) === value;
}

function sameScope(
  left: { companyId: string; branchId: string },
  right: { companyId: string; branchId: string },
): boolean {
  return left.companyId === right.companyId && left.branchId === right.branchId;
}

function paymentJournalLines(receipt: PaymentReceipt): JournalLine[] {
  const allocated = money(receipt.allocations.reduce((total, allocation) => total + allocation.amount, 0));
  // Existing receipts predate tender clearing metadata and intentionally retain
  // their bank-clearing behavior. New receipts receive a controlled account at
  // creation, so cash is never silently represented as bank cash.
  const clearingAccount = receipt.settlementAccount ?? 'bank-clearing';
  const lines: JournalLine[] = [{ accountCode: clearingAccount, debit: receipt.amount, credit: 0, memo: receipt.number }];
  if (allocated) lines.push({ accountCode: 'accounts-receivable', debit: 0, credit: allocated, memo: receipt.number });
  if (receipt.unappliedAmount) lines.push({ accountCode: 'unapplied-cash', debit: 0, credit: receipt.unappliedAmount, memo: receipt.number });
  return lines;
}

/**
 * Verifies the payment handoff has not been reworked outside the governed
 * receipt flow. Applications intentionally replace this exact draft in place
 * rather than creating a duplicate cash journal.
 */
function assertCanonicalPaymentJournal(draft: AccountingJournalDraft, receipt: PaymentReceipt): void {
  const expected = journal(
    'payment',
    receipt.id,
    receipt.number,
    receipt.receivedAt.slice(0, 10),
    paymentJournalLines(receipt),
    'draft',
    draft.id,
  );
  if (
    draft.sourceType !== 'payment' ||
    draft.sourceId !== receipt.id ||
    draft.sourceNumber !== receipt.number ||
    draft.postingDate !== receipt.receivedAt.slice(0, 10) ||
    draft.totalDebit !== expected.totalDebit ||
    draft.totalCredit !== expected.totalCredit ||
    draft.checksum !== expected.checksum
  ) {
    throw new Error('Payment journal evidence no longer matches the recorded receipt. Refresh and resolve the accounting handoff before applying cash.');
  }
}

function taxPreview(lines: QuoteLine[], treatment: QuoteTaxPreview['treatment'], gstRegistered: boolean, reverseCharge: boolean): QuoteTaxPreview {
  const taxableValue = money(lines.reduce((total, line) => total + line.taxableValue, 0));
  // Recompute only from the line-level frozen rates and round every line
  // before aggregation. That makes a draft invoice reconcile to its source
  // quote/retail sale instead of inventing a document-level rounding delta.
  const gstTotal = gstRegistered ? money(lines.reduce((total, line) => total + money(line.taxableValue * line.gstRate / 100), 0)) : 0;
  const cess = gstRegistered ? money(lines.reduce((total, line) => total + money(line.taxableValue * (line.cessRate ?? 0) / 100), 0)) : 0;
  const totalTax = money(gstTotal + cess);
  const cgst = treatment === 'intra-state' ? money(gstTotal / 2) : 0;
  const sgst = treatment === 'intra-state' ? money(gstTotal - cgst) : 0;
  const igst = treatment === 'inter-state' ? gstTotal : 0;
  return { treatment, taxableValue, cgst, sgst, igst, cess, totalTax, grandTotal: money(taxableValue + (reverseCharge ? 0 : totalTax)), determination: 'commercial-estimate' };
}

export function createPaymentTerm(state: RevenueOpsState, input: CreatePaymentTermInput, id: string = randomUUID()): RevenueOpsState {
  const normalizedCode = code(input.code, 'Payment-term code');
  if (state.paymentTerms.some((term) => term.code === normalizedCode)) throw new Error('Payment-term code already exists.');
  if (!Number.isInteger(input.dueDays) || input.dueDays < 0 || input.dueDays > 3650 || !Number.isInteger(input.earlyPaymentDays) || input.earlyPaymentDays < 0 || input.earlyPaymentDays > input.dueDays || input.earlyPaymentDiscountPercent < 0 || input.earlyPaymentDiscountPercent > 100) throw new Error('Payment-term day or discount values are invalid.');
  const term: PaymentTerm = { id, code: normalizedCode, name: clean(input.name, 'Payment-term name'), dueDays: input.dueDays, earlyPaymentDays: input.earlyPaymentDays, earlyPaymentDiscountPercent: input.earlyPaymentDiscountPercent, active: true, scope: structuredClone(state.scope), version: 1 };
  return { ...state, revision: state.revision + 1, paymentTerms: [term, ...state.paymentTerms] };
}

export function recordDeliveryEvidence(state: RevenueOpsState, input: RecordDeliveryEvidenceInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const order = state.salesOrders.find(({ id: orderId }) => orderId === input.salesOrderId);
  if (!order || order.status === 'cancelled') throw new Error('Active sales order not found.');
  if (input.fulfilmentTaskId && !state.fulfilmentTasks.some(({ id: taskId, salesOrderId }) => taskId === input.fulfilmentTaskId && salesOrderId === order.id)) throw new Error('Fulfilment task does not belong to the sales order.');
  const reference = clean(input.reference, 'Evidence reference', 3, 120);
  if (state.deliveryEvidence.some((item) => item.type === input.type && item.reference.toLowerCase() === reference.toLowerCase())) throw new Error('Delivery evidence reference already exists.');
  const evidence: DeliveryEvidence = { id, salesOrderId: order.id, fulfilmentTaskId: input.fulfilmentTaskId, type: input.type, reference, occurredAt: input.occurredAt, notes: clean(input.notes, 'Evidence notes', 3, 500), capturedBy: actorId, capturedAt: now, scope: structuredClone(order.scope ?? state.scope) };
  return { ...state, revision: state.revision + 1, deliveryEvidence: [evidence, ...state.deliveryEvidence] };
}

export function createServiceMilestone(state: RevenueOpsState, input: CreateServiceMilestoneInput, id: string = randomUUID()): RevenueOpsState {
  const order = state.salesOrders.find(({ id: orderId }) => orderId === input.salesOrderId);
  const line = order?.lines.find(({ id: lineId }) => lineId === input.lineId);
  if (!order || !line) throw new Error('Sales-order line not found.');
  const product = line.catalogProductId ? state.products.find(({ id: productId }) => productId === line.catalogProductId) : undefined;
  if (product?.kind === 'goods') throw new Error('Service milestones cannot be attached to goods lines.');
  if (input.percentage <= 0 || input.percentage > 100) throw new Error('Milestone percentage must be greater than 0 and no more than 100.');
  const allocated = state.serviceMilestones.filter(({ salesOrderId, lineId }) => salesOrderId === order.id && lineId === line.id).reduce((total, item) => total + item.percentage, 0);
  if (allocated + input.percentage > 100) throw new Error('Service milestones cannot exceed 100% of the order line.');
  const milestone: ServiceMilestone = { id, salesOrderId: order.id, lineId: line.id, name: clean(input.name, 'Milestone name'), percentage: input.percentage, dueDate: input.dueDate, status: 'planned', scope: structuredClone(order.scope ?? state.scope), version: 1 };
  return { ...state, revision: state.revision + 1, serviceMilestones: [...state.serviceMilestones, milestone] };
}

const MILESTONE_TRANSITIONS: Record<ServiceMilestoneStatus, ServiceMilestoneStatus[]> = { planned: ['ready'], ready: ['accepted'], accepted: [], invoiced: [] };

export function transitionServiceMilestone(state: RevenueOpsState, input: TransitionServiceMilestoneInput): RevenueOpsState {
  const milestone = state.serviceMilestones.find(({ id }) => id === input.id);
  if (!milestone) throw new Error('Service milestone not found.');
  if (milestone.version !== input.expectedVersion) throw new Error('The service milestone changed. Refresh and retry.');
  if (!MILESTONE_TRANSITIONS[milestone.status].includes(input.toStatus)) throw new Error(`Service milestone cannot move from ${milestone.status} to ${input.toStatus}.`);
  if (input.toStatus === 'accepted' && !input.acceptanceReference?.trim()) throw new Error('Customer acceptance requires an evidence reference.');
  const updated = { ...milestone, status: input.toStatus, acceptanceReference: input.toStatus === 'accepted' ? clean(input.acceptanceReference ?? '', 'Acceptance reference', 3, 120) : milestone.acceptanceReference, version: milestone.version + 1 };
  return { ...state, revision: state.revision + 1, serviceMilestones: state.serviceMilestones.map((item) => item.id === milestone.id ? updated : item) };
}

function invoiceLines(state: RevenueOpsState, input: CreateInvoiceDraftInput): { lines: QuoteLine[]; milestoneIds: string[]; shipmentPackageIds: string[]; projectBillingClaimIds: string[] } {
  const order = state.salesOrders.find(({ id }) => id === input.salesOrderId)!;
  if (input.basis === 'order-completion') {
    const tasks = state.fulfilmentTasks.filter(({ salesOrderId }) => salesOrderId === order.id);
    if (tasks.some(({ status }) => status !== 'completed') && order.status !== 'completed') throw new Error('Order-completion invoicing requires every fulfilment task to be completed.');
    const goodsLines = order.lines.filter((line) => state.products.find(({ id }) => id === line.catalogProductId)?.kind === 'goods');
    if (goodsLines.length && !state.deliveryEvidence.some(({ salesOrderId, type }) => salesOrderId === order.id && type === 'delivery')) throw new Error('Goods invoicing requires delivery evidence.');
    return { lines: structuredClone(order.lines), milestoneIds: [], shipmentPackageIds: [], projectBillingClaimIds: [] };
  }
  if (input.basis === 'shipment-package') {
    const packageIds = [...new Set(input.shipmentPackageIds ?? [])];
    const packages = packageIds.map((id) => state.shipmentPackages.find((shipment) => shipment.id === id));
    if (!packages.length || packages.some((shipment) => !shipment || shipment.salesOrderId !== order.id || !['planned', 'packed', 'ready-to-dispatch'].includes(shipment.status))) throw new Error('Package invoicing requires active shipment packages from this sales order.');
    if (packages.some((shipment) => state.invoices.some((invoice) => invoice.status !== 'cancelled' && invoice.shipmentPackageIds?.includes(shipment!.id)))) throw new Error('A shipment package is already invoiced.');
    const lines = packages.flatMap((shipment) => shipment!.items.map((item) => {
      const source = order.lines.find(({ id }) => id === item.lineId);
      if (!source || item.quantity > source.quantity) throw new Error('Shipment package item no longer matches the sales order.');
      const ratio = item.quantity / source.quantity;
      const taxableValue = money(source.taxableValue * ratio);
      return { ...structuredClone(source), id: randomUUID(), description: `${source.description} - ${shipment!.number}`, quantity: item.quantity, listUnitPrice: source.listUnitPrice ?? source.unitPrice, unitPrice: source.unitPrice, taxableValue, discountAmount: money((source.discountAmount ?? 0) * ratio) };
    }));
    return { lines, milestoneIds: [], shipmentPackageIds: packageIds, projectBillingClaimIds: [] };
  }
  if (input.basis === 'project-claims') {
    const claimIds = [...new Set(input.projectBillingClaimIds ?? [])];
    const claims = claimIds.map((id) => state.projectBillingClaims.find((item) => item.id === id));
    if (!claims.length || claims.some((claim) => !claim || claim.salesOrderId !== order.id || claim.status !== 'recognized')) throw new Error('Project-claim invoicing requires recognized claims from this sales order.');
    if (claims.some((claim) => state.invoices.some((invoice) => invoice.status !== 'cancelled' && invoice.projectBillingClaimIds?.includes(claim!.id)))) throw new Error('A recognized project billing claim is already invoiced.');
    const lines = claims.map((claim) => {
      const source = order.lines.find(({ id }) => id === claim!.salesOrderLineId);
      if (!source) throw new Error('Project billing claim source line is no longer available.');
      const taxableValue = money(claim!.recognizedAmount);
      return { ...structuredClone(source), id: randomUUID(), description: `${source.description} - ${claim!.number}`, quantity: 1, listUnitPrice: taxableValue, unitPrice: taxableValue, taxableValue, discountAmount: 0 };
    });
    return { lines, milestoneIds: [], shipmentPackageIds: [], projectBillingClaimIds: claimIds };
  }
  const selected = [...new Set(input.milestoneIds)].map((id) => state.serviceMilestones.find((item) => item.id === id));
  if (!selected.length || selected.some((item) => !item || item.salesOrderId !== order.id || item.status !== 'accepted')) throw new Error('Milestone invoicing requires accepted milestones from this sales order.');
  if (selected.some((item) => state.invoices.some((invoice) => invoice.status !== 'cancelled' && invoice.serviceMilestoneIds.includes(item!.id)))) throw new Error('An accepted milestone is already invoiced.');
  if (selected.some((item) => state.projectBillingClaims.some((claim) => claim.status !== 'rejected' && claim.milestoneIds.includes(item!.id)))) throw new Error('A milestone governed by a project billing claim must be invoiced through that recognized claim.');
  const lines = selected.map((milestone) => {
    const source = order.lines.find(({ id }) => id === milestone!.lineId)!;
    const taxableValue = money(source.taxableValue * milestone!.percentage / 100);
    const discountAmount = money((source.discountAmount ?? 0) * milestone!.percentage / 100);
    return { ...structuredClone(source), id: randomUUID(), description: `${source.description} - ${milestone!.name}`, quantity: 1, listUnitPrice: money((source.listUnitPrice ?? source.unitPrice) * source.quantity * milestone!.percentage / 100), unitPrice: taxableValue, taxableValue, discountAmount };
  });
  return { lines, milestoneIds: selected.map((item) => item!.id), shipmentPackageIds: [], projectBillingClaimIds: [] };
}

export function createInvoiceDraft(state: RevenueOpsState, input: CreateInvoiceDraftInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const order = state.salesOrders.find(({ id: orderId }) => orderId === input.salesOrderId);
  if (!order || order.status === 'cancelled') throw new Error('Active sales order not found.');
  if (state.accountingClosePeriods.some((period) => period.status === 'closed' && period.periodFrom <= input.invoiceDate && input.invoiceDate <= period.periodTo)) throw new Error('Invoice drafts cannot be dated inside a closed accounting period.');
  if (input.documentKind === 'tax-invoice' && (!state.profile.gstRegistered || !state.profile.gstin)) throw new Error('A tax invoice requires a configured GST-registered supplier profile.');
  if (input.documentKind === 'bill-of-supply' && state.profile.gstRegistered) throw new Error('Bill-of-supply selection requires an exempt/composition decision workflow that is not enabled for a GST-registered profile.');
  const term = state.paymentTerms.find(({ id: termId, active }) => termId === input.paymentTermId && active);
  if (!term) throw new Error('Active payment term not found.');
  const quote = state.quotes.find(({ id }) => id === order.quoteId);
  if (!quote) throw new Error('Source quotation snapshot not found.');
  const selected = invoiceLines(state, input);
  const taxable = input.documentKind === 'tax-invoice';
  const lines = selected.lines.map((line) => ({ ...line, gstRate: taxable ? line.gstRate : 0, cessRate: taxable ? line.cessRate : 0 }));
  const preview = taxPreview(lines, quote.taxPreview.treatment, taxable, input.reverseCharge);
  const subtotal = money(lines.reduce((total, line) => total + (line.listUnitPrice ?? line.unitPrice) * line.quantity, 0));
  const discountTotal = money(lines.reduce((total, line) => total + (line.discountAmount ?? 0), 0));
  const invoice: TaxInvoice = { id, number: `DRAFT-${id.slice(0, 8).toUpperCase()}`, documentKind: input.documentKind, sourceKind: 'sales-order', salesOrderId: order.id, quoteId: quote.id, accountId: order.accountId, contactId: order.contactId, recipientTreatment: quote.recipientTreatment, recipientGstin: quote.recipientGstin, placeOfSupplyStateCode: quote.placeOfSupplyStateCode, reverseCharge: input.reverseCharge, currency: 'INR', invoiceDate: input.invoiceDate, dueDate: addDays(input.invoiceDate, term.dueDays), paymentTermId: term.id, status: 'draft', irpStatus: 'not-applicable', serviceMilestoneIds: selected.milestoneIds, shipmentPackageIds: selected.shipmentPackageIds, projectBillingClaimIds: selected.projectBillingClaimIds, lines, subtotal, discountTotal, taxPreview: preview, amountDue: preview.grandTotal, createdBy: actorId, createdAt: now, scope: structuredClone(order.scope ?? state.scope), version: 1 };
  return { ...state, revision: state.revision + 1, invoices: [invoice, ...state.invoices] };
}

export function issueInvoice(state: RevenueOpsState, input: IssueInvoiceInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const invoice = state.invoices.find(({ id }) => id === input.id);
  if (!invoice) throw new Error('Invoice draft not found.');
  if (invoice.version !== input.expectedVersion) throw new Error('The invoice draft changed. Refresh and retry.');
  if (invoice.status !== 'draft') throw new Error('Only invoice drafts can be issued.');
  if (state.accountingClosePeriods.some((period) => period.status === 'closed' && period.periodFrom <= invoice.invoiceDate && invoice.invoiceDate <= period.periodTo)) throw new Error('Invoices cannot be issued into a closed accounting period.');
  const retailProcessingSale = invoice.sourceKind === 'retail-sale' && invoice.retailSaleId
    ? state.retailSales.find(({ id }) => id === invoice.retailSaleId)
    : undefined;
  if (invoice.createdBy === actorId && (!retailProcessingSale || retailProcessingSale.status !== 'processing' || retailProcessingSale.cashierId !== actorId)) {
    throw new Error('Segregation of duties requires an independent invoice issuer.');
  }
  if (invoice.documentKind === 'tax-invoice' && (!state.profile.gstRegistered || !state.profile.gstin)) throw new Error('Supplier GST registration must be configured before issue.');
  if (invoice.recipientTreatment === 'registered' && !invoice.recipientGstin) throw new Error('Registered recipients require GSTIN evidence before issue.');
  if (invoice.recipientTreatment === 'export' && (!invoice.zeroRatedSupplyId || !state.zeroRatedSupplyReviews.some(({ id, status }) => id === invoice.zeroRatedSupplyId && status === 'approved'))) throw new Error('Export invoice issue requires an independently approved zero-rated supply review.');
  const number = fiscalNumber(invoice.documentKind === 'tax-invoice' ? 'INV' : 'BOS', state.invoices.filter(({ status, number: existing }) => status !== 'draft' && existing.startsWith(invoice.documentKind === 'tax-invoice' ? 'INV-' : 'BOS-')).length + 1, invoice.invoiceDate);
  const irpStatus = invoice.documentKind === 'tax-invoice' && (invoice.recipientTreatment === 'registered' || invoice.recipientTreatment === 'export') ? 'required-review' as const : 'not-applicable' as const;
  const issued = { ...invoice, number, status: 'issued' as const, irpStatus, issuedBy: actorId, issuedAt: now, version: invoice.version + 1 };
  const receivable: Receivable = { id: randomUUID(), invoiceId: invoice.id, accountId: invoice.accountId, invoiceNumber: number, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, originalAmount: invoice.amountDue, adjustmentAmount: 0, paidAmount: 0, outstandingAmount: invoice.amountDue, status: invoice.dueDate <= invoice.invoiceDate ? 'due' : 'current', scope: structuredClone(invoice.scope ?? state.scope), version: 1 };
  const lines: JournalLine[] = [
    { accountCode: 'accounts-receivable', debit: invoice.amountDue, credit: 0, memo: number },
    { accountCode: invoice.projectBillingClaimIds?.length ? 'unbilled-revenue' : 'sales-revenue', debit: 0, credit: invoice.taxPreview.taxableValue, memo: number },
  ];
  if (!invoice.reverseCharge && invoice.taxPreview.cgst) lines.push({ accountCode: 'output-cgst', debit: 0, credit: invoice.taxPreview.cgst, memo: number });
  if (!invoice.reverseCharge && invoice.taxPreview.sgst) lines.push({ accountCode: 'output-sgst', debit: 0, credit: invoice.taxPreview.sgst, memo: number });
  if (!invoice.reverseCharge && invoice.taxPreview.igst) lines.push({ accountCode: 'output-igst', debit: 0, credit: invoice.taxPreview.igst, memo: number });
  if (!invoice.reverseCharge && invoice.taxPreview.cess) lines.push({ accountCode: 'output-cess', debit: 0, credit: invoice.taxPreview.cess, memo: number });
  const draft = journal('invoice', invoice.id, number, invoice.invoiceDate, lines);
  const milestoneIds = new Set(invoice.serviceMilestoneIds);
  const claimIds = new Set(invoice.projectBillingClaimIds ?? []);
  return { ...state, revision: state.revision + 1, invoices: state.invoices.map((item) => item.id === invoice.id ? issued : item), receivables: [receivable, ...state.receivables], journalDrafts: [draft, ...state.journalDrafts], serviceMilestones: state.serviceMilestones.map((item) => milestoneIds.has(item.id) ? { ...item, status: 'invoiced', version: item.version + 1 } : item), projectBillingClaims: state.projectBillingClaims.map((item) => claimIds.has(item.id) ? { ...item, status: 'invoiced', invoiceId: invoice.id, version: item.version + 1 } : item) };
}

export function createCreditDebitNote(state: RevenueOpsState, input: CreateCreditDebitNoteInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const invoice = state.invoices.find(({ id: invoiceId }) => invoiceId === input.invoiceId);
  const receivable = state.receivables.find(({ invoiceId }) => invoiceId === input.invoiceId);
  if (!invoice || !receivable || invoice.status === 'draft' || invoice.status === 'cancelled') throw new Error('Issued invoice receivable not found.');
  if (input.taxableValue <= 0 || input.gstRate < 0 || input.gstRate > 100) throw new Error('Adjustment value or GST rate is invalid.');
  const taxAmount = money(input.taxableValue * input.gstRate / 100);
  const totalAmount = money(input.taxableValue + taxAmount);
  if (input.type === 'credit' && totalAmount > receivable.outstandingAmount) throw new Error('Credit note cannot exceed the outstanding receivable.');
  const prefix = input.type === 'credit' ? 'CRN' : 'DBN';
  const note: CreditDebitNote = { id, number: fiscalNumber(prefix, state.creditDebitNotes.filter(({ type }) => type === input.type).length + 1, input.noteDate), type: input.type, invoiceId: invoice.id, reason: clean(input.reason, 'Adjustment reason', 4, 300), taxableValue: money(input.taxableValue), gstRate: input.gstRate, taxAmount, totalAmount, noteDate: input.noteDate, irpStatus: invoice.irpStatus === 'required-review' || invoice.irpStatus === 'registered' ? 'required-review' : 'not-applicable', createdBy: actorId, createdAt: now, scope: structuredClone(invoice.scope ?? state.scope), version: 1 };
  const direction = input.type === 'debit' ? 1 : -1;
  const outstandingAmount = money(receivable.outstandingAmount + direction * totalAmount);
  const adjusted = { ...receivable, adjustmentAmount: money(receivable.adjustmentAmount + direction * totalAmount), outstandingAmount, status: outstandingAmount === 0 ? 'paid' as const : receivable.paidAmount ? 'partially-paid' as const : receivable.status, version: receivable.version + 1 };
  const adjustmentLines: JournalLine[] = input.type === 'debit'
    ? [{ accountCode: 'accounts-receivable', debit: totalAmount, credit: 0, memo: note.number }, { accountCode: 'sales-adjustment', debit: 0, credit: input.taxableValue, memo: note.number }]
    : [{ accountCode: 'sales-adjustment', debit: input.taxableValue, credit: 0, memo: note.number }, { accountCode: 'accounts-receivable', debit: 0, credit: totalAmount, memo: note.number }];
  const taxAccount = invoice.taxPreview.treatment === 'intra-state' ? ['output-cgst', 'output-sgst'] as const : ['output-igst'] as const;
  let allocatedTax = 0;
  taxAccount.forEach((accountCode, index) => {
    const share = index === taxAccount.length - 1
      ? money(taxAmount - allocatedTax)
      : money(taxAmount / taxAccount.length);
    allocatedTax = money(allocatedTax + share);
    adjustmentLines.splice(input.type === 'debit' ? adjustmentLines.length - 1 : 1, 0, {
      accountCode,
      debit: input.type === 'credit' ? share : 0,
      credit: input.type === 'debit' ? share : 0,
      memo: note.number,
    });
  });
  const draft = journal(input.type === 'credit' ? 'credit-note' : 'debit-note', note.id, note.number, note.noteDate, adjustmentLines);
  return { ...state, revision: state.revision + 1, creditDebitNotes: [note, ...state.creditDebitNotes], receivables: state.receivables.map((item) => item.id === receivable.id ? adjusted : item), journalDrafts: [draft, ...state.journalDrafts] };
}

export function recordPayment(state: RevenueOpsState, input: RecordPaymentInput, actorId: string, id: string = randomUUID()): RevenueOpsState {
  if (input.amount <= 0) throw new Error('Payment amount must be positive.');
  const allocations = input.allocations.filter(({ amount }) => amount > 0);
  if (new Set(allocations.map(({ receivableId }) => receivableId)).size !== allocations.length) throw new Error('Payment allocations must be unique per receivable.');
  const allocated = money(allocations.reduce((total, item) => total + item.amount, 0));
  if (allocated > input.amount) throw new Error('Payment allocations cannot exceed the receipt amount.');
  const allocationReceivables = allocations.map((allocation) => {
    const receivable = state.receivables.find(({ id }) => id === allocation.receivableId);
    if (!receivable || receivable.accountId !== input.accountId) throw new Error('Payment allocation belongs to another account.');
    if (allocation.amount > receivable.outstandingAmount) throw new Error('Payment allocation exceeds the receivable outstanding amount.');
    return receivable;
  });
  const receiptScope = allocationReceivables[0]?.scope ?? state.scope;
  if (allocationReceivables.some(({ scope }) => {
    const receivableScope = scope ?? state.scope;
    return receivableScope.companyId !== receiptScope.companyId || receivableScope.branchId !== receiptScope.branchId;
  })) {
    throw new Error('Payment allocations must belong to one company and branch scope.');
  }
  const settlementAccount = input.settlementAccount ?? (input.method === 'cash'
    ? 'cash-on-hand'
    : input.method === 'upi'
      ? 'upi-clearing'
      : input.method === 'card'
        ? 'card-clearing'
        : 'bank-clearing');
  if (
    (input.method === 'cash' && settlementAccount !== 'cash-on-hand') ||
    (input.method === 'upi' && settlementAccount !== 'upi-clearing') ||
    (input.method === 'card' && settlementAccount !== 'card-clearing') ||
    (!['cash', 'upi', 'card'].includes(input.method) && settlementAccount !== 'bank-clearing')
  ) throw new Error('Payment tender must use its controlled clearing account.');
  const number = fiscalNumber('RCPT', state.paymentReceipts.length + 1, input.receivedAt.slice(0, 10));
  const receipt: PaymentReceipt = { id, number, accountId: input.accountId, receivedAt: input.receivedAt, method: input.method, settlementAccount, retailSaleId: input.retailSaleId, retailCashierShiftId: input.retailCashierShiftId, reference: clean(input.reference, 'Payment reference', 3, 120), amount: money(input.amount), allocations: structuredClone(allocations), unappliedAmount: money(input.amount - allocated), status: 'recorded', recordedBy: actorId, unappliedCashApplications: [], scope: structuredClone(receiptScope), version: 1 };
  const receivables = state.receivables.map((receivable) => {
    const allocation = allocations.find(({ receivableId }) => receivableId === receivable.id);
    if (!allocation) return receivable;
    const paidAmount = money(receivable.paidAmount + allocation.amount);
    const outstandingAmount = money(receivable.outstandingAmount - allocation.amount);
    return { ...receivable, paidAmount, outstandingAmount, status: outstandingAmount === 0 ? 'paid' as const : 'partially-paid' as const, version: receivable.version + 1 };
  });
  const invoices = state.invoices.map((invoice) => {
    const receivable = receivables.find(({ invoiceId }) => invoiceId === invoice.id);
    if (!receivable) return invoice;
    const status = receivable.status === 'paid' ? 'paid' as const : receivable.status === 'partially-paid' ? 'partially-paid' as const : invoice.status;
    return status === invoice.status ? invoice : { ...invoice, status, version: invoice.version + 1 };
  });
  const lines: JournalLine[] = [{ accountCode: settlementAccount, debit: input.amount, credit: 0, memo: number }];
  if (allocated) lines.push({ accountCode: 'accounts-receivable', debit: 0, credit: allocated, memo: number });
  if (receipt.unappliedAmount) lines.push({ accountCode: 'unapplied-cash', debit: 0, credit: receipt.unappliedAmount, memo: number });
  const draft = journal('payment', receipt.id, number, input.receivedAt.slice(0, 10), lines, 'draft');
  return { ...state, revision: state.revision + 1, paymentReceipts: [receipt, ...state.paymentReceipts], receivables, invoices, journalDrafts: [draft, ...state.journalDrafts] };
}

/**
 * Applies cash already held in unapplied-cash to open receivables. This is a
 * reclassification inside the existing payment journal, never a second cash
 * receipt or a second journal. It is deliberately available only while the
 * receipt/journal remain in their un-reconciled draft state.
 */
export function applyUnappliedReceipt(
  state: RevenueOpsState,
  input: ApplyUnappliedReceiptInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const receipt = state.paymentReceipts.find(({ id }) => id === input.id);
  if (!receipt) throw new Error('Payment receipt not found.');
  if (receipt.version !== input.expectedVersion) throw new Error('The payment receipt changed. Refresh and retry.');
  if (receipt.status !== 'recorded') throw new Error('Only recorded, unreconciled payment receipts can have unapplied cash applied.');
  if (!receipt.scope || !sameScope(receipt.scope, state.scope)) {
    throw new Error('Payment receipt scope does not match the active operating state.');
  }
  const receiptScope = receipt.scope;
  if (!isPositiveMoney(receipt.unappliedAmount)) throw new Error('This payment receipt has no unapplied cash available.');
  if (!input.allocations.length || input.allocations.length > 500) throw new Error('At least one and no more than 500 receivable allocations are required.');
  const evidenceReference = clean(input.evidenceReference, 'Cash application evidence reference', 3, 120);
  if (receipt.unappliedCashApplications?.some((application) => application.evidenceReference.toLowerCase() === evidenceReference.toLowerCase())) {
    throw new Error('Cash application evidence reference is already recorded for this receipt.');
  }
  if (new Set(input.allocations.map(({ receivableId }) => receivableId)).size !== input.allocations.length) {
    throw new Error('Cash applications must be unique per receivable.');
  }
  if (input.allocations.some(({ amount, expectedVersion }) => !isPositiveMoney(amount) || !Number.isInteger(expectedVersion) || expectedVersion < 1)) {
    throw new Error('Cash application amounts and receivable versions are invalid.');
  }
  const allocationTotal = money(input.allocations.reduce((total, allocation) => total + allocation.amount, 0));
  if (allocationTotal > receipt.unappliedAmount) throw new Error('Cash applications cannot exceed the receipt unapplied amount.');
  const existingAllocated = money(receipt.allocations.reduce((total, allocation) => total + allocation.amount, 0));
  if (
    !isPositiveMoney(receipt.amount) ||
    receipt.allocations.some(({ amount }) => !isPositiveMoney(amount)) ||
    new Set(receipt.allocations.map(({ receivableId }) => receivableId)).size !== receipt.allocations.length ||
    money(existingAllocated + receipt.unappliedAmount) !== receipt.amount
  ) {
    throw new Error('Payment receipt allocation evidence is inconsistent. Refresh and resolve the receipt before applying cash.');
  }

  const journals = state.journalDrafts.filter((draft) => draft.sourceType === 'payment' && draft.sourceId === receipt.id);
  if (journals.length !== 1) throw new Error('Payment receipt must have exactly one accounting journal handoff before cash can be applied.');
  const paymentJournal = journals[0]!;
  if (paymentJournal.version !== input.expectedJournalVersion) throw new Error('The payment journal changed. Refresh and retry.');
  if (paymentJournal.status !== 'draft') throw new Error('The payment journal is locked by reconciliation or export and cannot be reclassified.');
  assertCanonicalPaymentJournal(paymentJournal, receipt);

  const targets = input.allocations.map((allocation) => {
    const receivable = state.receivables.find(({ id }) => id === allocation.receivableId);
    if (!receivable) throw new Error('Receivable not found.');
    if (receivable.version !== allocation.expectedVersion) throw new Error('A receivable changed. Refresh and retry.');
    if (!receivable.scope || !sameScope(receivable.scope, receiptScope)) throw new Error('Cash applications must stay within the payment receipt company and branch scope.');
    if (receivable.accountId !== receipt.accountId) throw new Error('Cash applications must stay within the payment receipt customer account.');
    if (!['current', 'due', 'overdue', 'partially-paid'].includes(receivable.status) || !isPositiveMoney(receivable.outstandingAmount)) {
      throw new Error('Cash can only be applied to an open, undisputed receivable.');
    }
    if (allocation.amount > receivable.outstandingAmount) throw new Error('Cash application exceeds the receivable outstanding amount.');
    return { allocation, receivable };
  });

  const targetIds = new Set(targets.map(({ receivable }) => receivable.id));
  const receivables = state.receivables.map((receivable) => {
    const target = targets.find(({ receivable: candidate }) => candidate.id === receivable.id);
    if (!target) return receivable;
    const paidAmount = money(receivable.paidAmount + target.allocation.amount);
    const outstandingAmount = money(receivable.outstandingAmount - target.allocation.amount);
    return {
      ...receivable,
      paidAmount,
      outstandingAmount,
      status: outstandingAmount === 0 ? 'paid' as const : 'partially-paid' as const,
      version: receivable.version + 1,
    };
  });
  const applicationAllocations = targets.map(({ allocation, receivable }) => {
    const updated = receivables.find(({ id }) => id === receivable.id)!;
    return {
      receivableId: receivable.id,
      amount: allocation.amount,
      receivableVersionBefore: receivable.version,
      receivableVersionAfter: updated.version,
      outstandingAmountBefore: receivable.outstandingAmount,
      outstandingAmountAfter: updated.outstandingAmount,
    };
  });
  const applicationAmounts = new Map(input.allocations.map(({ receivableId, amount }) => [receivableId, amount]));
  const existingAllocationIds = new Set(receipt.allocations.map(({ receivableId }) => receivableId));
  const updatedAllocations = [
    ...receipt.allocations.map((allocation) => ({
      ...allocation,
      amount: money(allocation.amount + (applicationAmounts.get(allocation.receivableId) ?? 0)),
    })),
    ...input.allocations
      .filter(({ receivableId }) => !existingAllocationIds.has(receivableId))
      .map(({ receivableId, amount }) => ({ receivableId, amount })),
  ];
  const updatedReceipt: PaymentReceipt = {
    ...receipt,
    allocations: updatedAllocations,
    unappliedAmount: money(receipt.unappliedAmount - allocationTotal),
    unappliedCashApplications: [
      ...(receipt.unappliedCashApplications ?? []).map((application) => structuredClone(application)),
      {
        id: randomUUID(),
        evidenceReference,
        appliedBy: actorId,
        appliedAt: now,
        paymentJournalId: paymentJournal.id,
        journalVersionBefore: paymentJournal.version,
        journalVersionAfter: paymentJournal.version + 1,
        allocations: applicationAllocations,
      },
    ],
    version: receipt.version + 1,
  };
  const updatedJournal = {
    ...journal(
      'payment',
      updatedReceipt.id,
      updatedReceipt.number,
      updatedReceipt.receivedAt.slice(0, 10),
      paymentJournalLines(updatedReceipt),
      'draft',
      paymentJournal.id,
    ),
    version: paymentJournal.version + 1,
  };
  const invoices = state.invoices.map((invoice) => {
    const receivable = receivables.find(({ invoiceId }) => invoiceId === invoice.id);
    if (!receivable || !targetIds.has(receivable.id)) return invoice;
    const status = receivable.status === 'paid' ? 'paid' as const : 'partially-paid' as const;
    return invoice.status === status ? invoice : { ...invoice, status, version: invoice.version + 1 };
  });
  return {
    ...state,
    revision: state.revision + 1,
    paymentReceipts: state.paymentReceipts.map((item) => item.id === receipt.id ? updatedReceipt : item),
    receivables,
    invoices,
    journalDrafts: state.journalDrafts.map((draft) => draft.id === paymentJournal.id ? updatedJournal : draft),
  };
}

export function reconcilePayment(state: RevenueOpsState, input: ReconcilePaymentInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const receipt = state.paymentReceipts.find(({ id }) => id === input.id);
  if (!receipt) throw new Error('Payment receipt not found.');
  if (receipt.version !== input.expectedVersion) throw new Error('The payment receipt changed. Refresh and retry.');
  if (receipt.status !== 'recorded') throw new Error('Only recorded payments can be reconciled.');
  const updated = { ...receipt, status: 'reconciled' as const, reconciledBy: actorId, reconciledAt: now, version: receipt.version + 1 };
  return { ...state, revision: state.revision + 1, paymentReceipts: state.paymentReceipts.map((item) => item.id === receipt.id ? updated : item), journalDrafts: state.journalDrafts.map((item) => item.sourceType === 'payment' && item.sourceId === receipt.id ? { ...item, status: 'ready', version: item.version + 1 } : item) };
}

export function exportJournal(state: RevenueOpsState, input: ExportJournalInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const draft = state.journalDrafts.find(({ id }) => id === input.id);
  if (!draft) throw new Error('Accounting journal handoff not found.');
  if (draft.version !== input.expectedVersion) throw new Error('The accounting handoff changed. Refresh and retry.');
  if (draft.status !== 'ready') throw new Error('Only ready, balanced journals can be exported.');
  const updated = { ...draft, status: 'exported' as const, externalReference: clean(input.externalReference, 'External accounting reference', 3, 120), exportedAt: now, exportedBy: actorId, version: draft.version + 1 };
  return { ...state, revision: state.revision + 1, journalDrafts: state.journalDrafts.map((item) => item.id === draft.id ? updated : item) };
}

export function recordInvoiceDocument(state: RevenueOpsState, receipt: InvoiceDocumentReceipt): RevenueOpsState {
  if (!state.invoices.some(({ id, version }) => id === receipt.invoiceId && version === receipt.invoiceVersion)) throw new Error('Invoice changed before the PDF receipt could be recorded.');
  return { ...state, revision: state.revision + 1, invoiceDocuments: [receipt, ...state.invoiceDocuments] };
}
