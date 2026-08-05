import { createHash } from 'node:crypto';
import type { AccountingJournalDraft, RevenueOpsState } from '../shared/revenue-ops-contracts';
import type {
  CreateRetailCustomerVisitInput,
  CreateRetailSalesCommissionInput,
  CreateRetailCommissionPayoutBatchInput,
  DecideRetailCommissionPayoutBatchInput,
  DecideRetailSalesCommissionInput,
  LinkRetailCustomerVisitInput,
  PayRetailSalesCommissionInput,
  ReleaseRetailCommissionPayoutBatchInput,
  RetailCustomerVisit,
  RetailSalesCommission,
} from '../shared/retail-customer-ops-contracts';

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const clean = (value: string, label: string, minimum = 2, maximum = 300): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
};
const sameScope = (state: RevenueOpsState, value: { scope?: RevenueOpsState['scope'] }): boolean => {
  const scope = value.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};
const mutate = (state: RevenueOpsState): RevenueOpsState => ({ ...structuredClone(state), revision: state.revision + 1 });
const fiscalNumber = (prefix: string, sequence: number, at: string): string => {
  const date = new Date(`${at.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf())) throw new Error('Payout date is invalid.');
  const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${prefix}-${String(year).slice(-2)}-${String(year + 1).slice(-2)}-${String(sequence).padStart(5, '0')}`;
};
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const payoutJournal = (batch: RevenueOpsState['retailCommissionPayoutBatches'][number], releaseReference: string, id: string): AccountingJournalDraft => {
  const lines = [
    { accountCode: 'employee-expense' as const, debit: batch.totalAmount, credit: 0, memo: `${batch.number} commission expense` },
    { accountCode: 'cash-at-bank' as const, debit: 0, credit: batch.totalAmount, memo: `${batch.number} paid ${releaseReference}` },
  ];
  const totalDebit = money(lines.reduce((total, line) => total + line.debit, 0));
  const totalCredit = money(lines.reduce((total, line) => total + line.credit, 0));
  const unsigned = { sourceType: 'retail-commission-payout' as const, sourceId: batch.id, sourceNumber: batch.number, postingDate: batch.payoutDate, lines, totalDebit, totalCredit };
  return { id, ...unsigned, status: 'ready', externalReference: releaseReference, checksum: digest(unsigned), version: 1 };
};

const assertCommissionSourceSettlement = (state: RevenueOpsState, commission: RetailSalesCommission): void => {
  const sale = state.retailSales.find((candidate) => candidate.id === commission.saleId && sameScope(state, candidate));
  if (!sale || sale.status !== 'completed') throw new Error('Commission payout requires a completed source sale in the active branch.');
  const receiptIds = [...new Set(sale.paymentReceiptIds ?? [])];
  if (!receiptIds.length) throw new Error('Commission payout requires reconciled settlement evidence for the source sale.');
  const receipts = receiptIds.map((receiptId) => state.paymentReceipts.find((candidate) => candidate.id === receiptId && sameScope(state, candidate)));
  if (receipts.some((receipt) => !receipt || receipt.retailSaleId !== sale.id)) throw new Error('Commission payout settlement evidence does not match the source sale.');
  if (receipts.some((receipt) => receipt?.status !== 'reconciled')) throw new Error('Commission payout requires reconciled settlement evidence for the source sale.');
};

export function createRetailCustomerVisit(
  state: RevenueOpsState,
  input: CreateRetailCustomerVisitInput,
  staffUserId: string,
  id: string = crypto.randomUUID(),
): RevenueOpsState {
  if (!staffUserId.trim()) throw new Error('Retail visit requires a staff user.');
  if (!input.customerAccountId && !input.contactId) throw new Error('Retail visit requires a customer account or contact.');
  const visitedAt = new Date(input.visitedAt);
  if (Number.isNaN(visitedAt.valueOf())) throw new Error('Retail visit date is invalid.');
  const visit: RetailCustomerVisit = {
    id,
    customerAccountId: input.customerAccountId?.trim() || undefined,
    contactId: input.contactId?.trim() || undefined,
    visitedAt: visitedAt.toISOString(),
    channel: input.channel,
    purpose: input.purpose,
    staffUserId: staffUserId.trim(),
    sourceReference: input.sourceReference?.trim() || undefined,
    notes: input.notes?.trim() ? clean(input.notes, 'Visit notes', 2, 500) : undefined,
    scope: structuredClone(state.scope),
    version: 1,
  };
  const next = mutate(state);
  next.retailCustomerVisits = [visit, ...next.retailCustomerVisits];
  return next;
}

export function createRetailSalesCommission(
  state: RevenueOpsState,
  input: CreateRetailSalesCommissionInput,
  id: string = crypto.randomUUID(),
  now = new Date().toISOString(),
): RevenueOpsState {
  const sale = state.retailSales.find((candidate) => candidate.id === input.saleId && sameScope(state, candidate));
  if (!sale || sale.status !== 'completed') throw new Error('Commission requires a completed retail sale in the active branch.');
  if (!input.salespersonUserId.trim()) throw new Error('Commission requires a salesperson.');
  if (!Number.isFinite(input.ratePercent) || input.ratePercent <= 0 || input.ratePercent > 100) throw new Error('Commission rate must be greater than 0 and no more than 100 percent.');
  if (state.retailSalesCommissions.some((commission) => commission.saleId === sale.id && commission.salespersonUserId === input.salespersonUserId && commission.status !== 'void')) throw new Error('An active commission already exists for this sale and salesperson.');
  const basisAmount = money(input.basisAmount ?? sale.taxPreview.taxableValue);
  if (basisAmount <= 0 || basisAmount > sale.taxPreview.taxableValue) throw new Error('Commission basis must be positive and cannot exceed the net taxable sale value.');
  const commission: RetailSalesCommission = {
    id,
    saleId: sale.id,
    salespersonUserId: input.salespersonUserId.trim(),
    basisAmount,
    ratePercent: money(input.ratePercent),
    commissionAmount: money(basisAmount * input.ratePercent / 100),
    status: 'pending',
    createdAt: now,
    scope: structuredClone(state.scope),
    version: 1,
  };
  const next = mutate(state);
  next.retailSalesCommissions = [commission, ...next.retailSalesCommissions];
  return next;
}

export function linkRetailCustomerVisitToSale(
  state: RevenueOpsState,
  input: LinkRetailCustomerVisitInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  if (!actorId.trim()) throw new Error('Visit attribution requires an accountable user.');
  const visit = state.retailCustomerVisits.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!visit) throw new Error('Retail customer visit not found in the active branch.');
  if (visit.version !== input.expectedVersion) throw new Error('Customer visit changed. Refresh and retry.');
  if (visit.convertedSaleId) throw new Error('This customer visit is already attributed to a sale.');
  const sale = state.retailSales.find((candidate) => candidate.id === input.saleId && sameScope(state, candidate));
  if (!sale || sale.status !== 'completed') throw new Error('Visit attribution requires a completed retail sale in the active branch.');
  if (visit.customerAccountId && visit.customerAccountId !== sale.customerAccountId) throw new Error('The visit customer and sale customer do not match.');
  if (Date.parse(visit.visitedAt) > Date.parse(sale.saleAt)) throw new Error('A visit cannot be attributed to a sale that occurred before the visit.');
  const next = mutate(state);
  next.retailCustomerVisits = next.retailCustomerVisits.map((candidate) => candidate.id === visit.id
    ? { ...candidate, convertedSaleId: sale.id, convertedAt: now, version: candidate.version + 1 }
    : candidate);
  return next;
}

export function decideRetailSalesCommission(state: RevenueOpsState, input: DecideRetailSalesCommissionInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const commission = state.retailSalesCommissions.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!commission) throw new Error('Retail commission not found.');
  if (commission.version !== input.expectedVersion) throw new Error('Commission changed. Refresh and retry.');
  if (commission.status !== 'pending') throw new Error('Only pending commissions can be decided.');
  if (commission.salespersonUserId === actorId) throw new Error('Segregation of duties requires an independent commission approver.');
  clean(input.remarks, 'Commission decision remarks', 3, 300);
  const next = mutate(state);
  next.retailSalesCommissions = next.retailSalesCommissions.map((candidate) => candidate.id === commission.id
    ? { ...candidate, status: input.decision, approvedBy: actorId, approvedAt: now, version: candidate.version + 1 }
    : candidate);
  return next;
}

export function payRetailSalesCommission(state: RevenueOpsState, input: PayRetailSalesCommissionInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  void now;
  const commission = state.retailSalesCommissions.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!commission) throw new Error('Retail commission not found.');
  if (commission.version !== input.expectedVersion) throw new Error('Commission changed. Refresh and retry.');
  if (commission.status !== 'approved') throw new Error('Only approved commissions can be paid.');
  if (!input.payoutReference.trim()) throw new Error('Commission payout requires an evidence reference.');
  if (commission.salespersonUserId === actorId) throw new Error('Salespersons cannot pay their own commission.');
  const next = mutate(state);
  next.retailSalesCommissions = next.retailSalesCommissions.map((candidate) => candidate.id === commission.id
    ? { ...candidate, status: 'paid', payoutReference: clean(input.payoutReference, 'Payout reference', 3, 120), version: candidate.version + 1 }
    : candidate);
  return next;
}

export function createRetailCommissionPayoutBatch(
  state: RevenueOpsState,
  input: CreateRetailCommissionPayoutBatchInput,
  actorId: string,
  id: string = crypto.randomUUID(),
  now = new Date().toISOString(),
): RevenueOpsState {
  if (!actorId.trim()) throw new Error('Payout batch requires an accountable maker.');
  const payoutDate = input.payoutDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payoutDate) || !Number.isFinite(Date.parse(`${payoutDate}T00:00:00.000Z`))) throw new Error('Payout date must use YYYY-MM-DD.');
  const commissionIds = [...new Set(input.commissionIds.map((value) => value.trim()).filter(Boolean))];
  if (!commissionIds.length || commissionIds.length > 500 || commissionIds.length !== input.commissionIds.length) throw new Error('Payout batch requires 1-500 unique commission records.');
  const commissions = commissionIds.map((commissionId) => state.retailSalesCommissions.find((candidate) => candidate.id === commissionId && sameScope(state, candidate)));
  if (commissions.some((commission) => !commission)) throw new Error('Payout batch contains an unknown commission in the active branch.');
  const eligible = commissions as RetailSalesCommission[];
  if (eligible.some((commission) => commission.status !== 'approved')) throw new Error('Only independently approved commissions can enter a payout batch.');
  if (eligible.some((commission) => commission.payoutBatchId)) throw new Error('A commission already belongs to a payout batch.');
  const batch: RevenueOpsState['retailCommissionPayoutBatches'][number] = {
    id,
    number: fiscalNumber('PAYB', state.retailCommissionPayoutBatches.length + 1, payoutDate),
    commissionIds,
    payoutDate,
    totalAmount: money(eligible.reduce((total, commission) => total + commission.commissionAmount, 0)),
    notes: clean(input.notes, 'Payout batch notes', 4, 500),
    status: 'submitted',
    submittedBy: actorId.trim(),
    submittedAt: now,
    scope: structuredClone(state.scope),
    version: 1,
  };
  const next = mutate(state);
  next.retailCommissionPayoutBatches = [batch, ...next.retailCommissionPayoutBatches];
  next.retailSalesCommissions = next.retailSalesCommissions.map((commission) => commissionIds.includes(commission.id)
    ? { ...commission, payoutBatchId: batch.id, version: commission.version + 1 }
    : commission);
  return next;
}

export function decideRetailCommissionPayoutBatch(
  state: RevenueOpsState,
  input: DecideRetailCommissionPayoutBatchInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const batch = state.retailCommissionPayoutBatches.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!batch) throw new Error('Retail commission payout batch not found.');
  if (batch.version !== input.expectedVersion) throw new Error('Payout batch changed. Refresh and retry.');
  if (batch.status !== 'submitted') throw new Error('Only submitted payout batches can be decided.');
  if (batch.submittedBy === actorId) throw new Error('Payout batch approval requires an independent checker.');
  const next = mutate(state);
  const approved = input.decision === 'approved';
  next.retailCommissionPayoutBatches = next.retailCommissionPayoutBatches.map((candidate) => candidate.id === batch.id
    ? { ...candidate, status: input.decision, approvedBy: approved ? actorId : undefined, approvedAt: approved ? now : undefined, decisionRemarks: clean(input.remarks, 'Payout batch decision remarks', 4, 500), version: candidate.version + 1 }
    : candidate);
  if (!approved) next.retailSalesCommissions = next.retailSalesCommissions.map((commission) => batch.commissionIds.includes(commission.id) && commission.payoutBatchId === batch.id
    ? { ...commission, payoutBatchId: undefined, version: commission.version + 1 }
    : commission);
  return next;
}

export function releaseRetailCommissionPayoutBatch(
  state: RevenueOpsState,
  input: ReleaseRetailCommissionPayoutBatchInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const batch = state.retailCommissionPayoutBatches.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!batch) throw new Error('Retail commission payout batch not found.');
  if (batch.version !== input.expectedVersion) throw new Error('Payout batch changed. Refresh and retry.');
  if (batch.status !== 'approved') throw new Error('Only approved payout batches can be released.');
  if (batch.submittedBy === actorId || batch.approvedBy === actorId) throw new Error('Payout release requires a third independent operator.');
  const releaseReference = clean(input.releaseReference, 'Payout release reference', 4, 160);
  const commissions = batch.commissionIds.map((commissionId) => state.retailSalesCommissions.find((candidate) => candidate.id === commissionId && sameScope(state, candidate)));
  if (commissions.some((commission) => !commission || commission.status !== 'approved' || commission.payoutBatchId !== batch.id)) throw new Error('Payout batch commissions changed or are no longer approved.');
  (commissions as RetailSalesCommission[]).forEach((commission) => assertCommissionSourceSettlement(state, commission));
  const next = mutate(state);
  const journalDraftId = crypto.randomUUID();
  const draftBatch = { ...batch, status: 'released' as const, releasedBy: actorId, releasedAt: now, releaseReference, journalDraftId, version: batch.version + 1 };
  next.retailCommissionPayoutBatches = next.retailCommissionPayoutBatches.map((candidate) => candidate.id === batch.id
    ? draftBatch
    : candidate);
  next.retailSalesCommissions = next.retailSalesCommissions.map((commission) => batch.commissionIds.includes(commission.id)
    ? { ...commission, status: 'paid', payoutReference: `${releaseReference} / ${batch.number}`, version: commission.version + 1 }
    : commission);
  next.journalDrafts.unshift(payoutJournal(draftBatch, releaseReference, journalDraftId));
  return next;
}
