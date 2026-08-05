import { createHash, randomUUID } from 'node:crypto';
import type {
  BankCharge,
  CashForecastLine,
  CashForecastRun,
  CreateLiquiditySweepInput,
  CreatePaymentProposalInput,
  DecideLiquiditySweepInput,
  DecidePaymentProposalInput,
  LiquiditySweep,
  OpenSettlementExceptionInput,
  PaymentProposal,
  RecordBankChargeInput,
  RecordTreasuryPositionInput,
  ReconcileBankChargeInput,
  ReleaseLiquiditySweepInput,
  ReleasePaymentProposalInput,
  ResolveSettlementExceptionInput,
  RunCashForecastInput,
  SettleLiquiditySweepInput,
  SettlePaymentProposalInput,
} from '../shared/treasury-contracts';
import type { AccountingJournalDraft, JournalLine, RevenueOpsState } from '../shared/revenue-ops-contracts';

const money = (value: number): number => Math.round(value * 100) / 100;
const digest = (value: unknown): string => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const mutate = (state: RevenueOpsState): RevenueOpsState => { const next = structuredClone(state); next.revision += 1; return next; };
const clean = (value: string, label: string, min = 2, max = 300): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`);
  return normalized;
};
const validDate = (value: string, label: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) throw new Error(`${label} must use YYYY-MM-DD.`);
  return value;
};
const fiscalNumber = (prefix: string, sequence: number, at: string): string => {
  const date = new Date(`${at.slice(0, 10)}T00:00:00.000Z`); const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${prefix}-${String(year).slice(-2)}-${String(year + 1).slice(-2)}-${String(sequence).padStart(5, '0')}`;
};

function journal(sourceType: AccountingJournalDraft['sourceType'], sourceId: string, sourceNumber: string, postingDate: string, lines: JournalLine[]): AccountingJournalDraft {
  const normalized = lines.map((line) => ({ ...line, debit: money(line.debit), credit: money(line.credit) }));
  const totalDebit = money(normalized.reduce((total, line) => total + line.debit, 0));
  const totalCredit = money(normalized.reduce((total, line) => total + line.credit, 0));
  if (totalDebit !== totalCredit) throw new Error('Treasury accounting handoff is not balanced.');
  const unsigned = { sourceType, sourceId, sourceNumber, postingDate, lines: normalized, totalDebit, totalCredit };
  return { id: randomUUID(), ...unsigned, status: 'ready', checksum: digest(unsigned), version: 1 };
}

function activeBank(state: RevenueOpsState, id: string): void {
  if (!state.bankAccounts.some(({ id: candidate, active }) => candidate === id && active)) throw new Error('Treasury action requires an active bank account.');
}

function addDays(date: string, amount: number): string {
  const next = new Date(`${date}T00:00:00.000Z`); next.setUTCDate(next.getUTCDate() + amount); return next.toISOString().slice(0, 10);
}

function supplierInvoiceOutstanding(state: RevenueOpsState, supplierInvoiceId: string): number {
  const invoice = state.supplierInvoices.find(({ id }) => id === supplierInvoiceId);
  if (!invoice) return 0;
  const committed = state.paymentProposals.filter((proposal) => proposal.supplierInvoiceId === supplierInvoiceId && ['submitted', 'approved', 'released', 'settled'].includes(proposal.status)).reduce((total, proposal) => total + proposal.amount, 0);
  return money(Math.max(0, invoice.totalAmount - committed));
}

function paymentEligible(state: RevenueOpsState, supplierInvoiceId: string): boolean {
  return state.threeWayMatches.some(({ supplierInvoiceId: candidate, status }) => candidate === supplierInvoiceId && ['matched', 'approved'].includes(status));
}

function latestBalance(state: RevenueOpsState, bankAccountId: string, asOfDate: string): number {
  const recorded = state.treasuryPositions.filter((item) => item.bankAccountId === bankAccountId && item.asOfDate <= asOfDate).sort((left, right) => `${right.asOfDate}${right.recordedAt}`.localeCompare(`${left.asOfDate}${left.recordedAt}`))[0];
  if (recorded) return recorded.availableBalance;
  const statement = state.bankStatementImports.filter((item) => item.bankAccountId === bankAccountId && item.status === 'committed' && item.periodTo <= asOfDate).sort((left, right) => `${right.periodTo}${right.committedAt ?? ''}`.localeCompare(`${left.periodTo}${left.committedAt ?? ''}`))[0];
  return statement?.closingBalance ?? 0;
}

function paymentJournal(proposal: PaymentProposal, date: string): AccountingJournalDraft {
  return journal('treasury-payment', proposal.id, proposal.number, date, [
    { accountCode: 'accounts-payable', debit: proposal.amount, credit: 0, memo: proposal.number },
    { accountCode: 'cash-at-bank', debit: 0, credit: proposal.amount, memo: proposal.bankReleaseReference ?? proposal.number },
  ]);
}

function sweepReleaseJournal(sweep: LiquiditySweep, date: string): AccountingJournalDraft {
  return journal('liquidity-sweep-release', sweep.id, sweep.number, date, [
    { accountCode: 'cash-in-transit', debit: sweep.amount, credit: 0, memo: `${sweep.number} release` },
    { accountCode: 'cash-at-bank', debit: 0, credit: sweep.amount, memo: sweep.releaseReference ?? sweep.number },
  ]);
}

function sweepSettlementJournal(sweep: LiquiditySweep, date: string): AccountingJournalDraft {
  return journal('liquidity-sweep-settlement', sweep.id, sweep.number, date, [
    { accountCode: 'cash-at-bank', debit: sweep.amount, credit: 0, memo: `${sweep.number} settlement` },
    { accountCode: 'cash-in-transit', debit: 0, credit: sweep.amount, memo: sweep.settlementReference ?? sweep.number },
  ]);
}

export function recordTreasuryPosition(state: RevenueOpsState, input: RecordTreasuryPositionInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  activeBank(state, input.bankAccountId); validDate(input.asOfDate, 'Position date');
  if (!Number.isFinite(input.availableBalance) || Math.abs(input.availableBalance) > 1_000_000_000_000) throw new Error('Available balance is outside the supported treasury range.');
  const next = mutate(state);
  next.treasuryPositions.unshift({ id, bankAccountId: input.bankAccountId, asOfDate: input.asOfDate, availableBalance: money(input.availableBalance), source: input.source, evidenceReference: clean(input.evidenceReference, 'Balance evidence reference', 4, 160), recordedBy: actorId, recordedAt: now, version: 1 });
  return next;
}

export function runCashForecast(state: RevenueOpsState, input: RunCashForecastInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const asOf = validDate(input.asOfDate, 'Forecast date');
  if (!Number.isInteger(input.horizonDays) || input.horizonDays < 7 || input.horizonDays > 180) throw new Error('Forecast horizon must be 7-180 days.');
  const days = Array.from({ length: input.horizonDays + 1 }, (_unused, index) => addDays(asOf, index));
  const buckets = new Map(days.map((date) => [date, { date, inflows: 0, outflows: 0, drivers: new Set<CashForecastLine['drivers'][number]>() }]));
  const bucket = (date: string) => buckets.get(date < asOf ? asOf : date > days.at(-1)! ? days.at(-1)! : date)!;
  const receiptFactor = input.scenario === 'conservative' ? 0.8 : input.scenario === 'upside' ? 1.08 : 1;
  const openReceivables = state.receivables.filter(({ outstandingAmount, status }) => outstandingAmount > 0 && !['paid', 'written-off'].includes(status));
  for (const receivable of openReceivables) {
    const item = bucket(receivable.dueDate); item.inflows = money(item.inflows + receivable.outstandingAmount * receiptFactor); item.drivers.add('receivable');
  }
  const plannedByInvoice = new Map<string, number>();
  const activePaymentProposals = state.paymentProposals.filter(({ status }) => ['submitted', 'approved', 'released'].includes(status));
  for (const proposal of activePaymentProposals) {
    const item = bucket(proposal.paymentDate); item.outflows = money(item.outflows + proposal.amount); item.drivers.add('payment-proposal');
    plannedByInvoice.set(proposal.supplierInvoiceId, money((plannedByInvoice.get(proposal.supplierInvoiceId) ?? 0) + proposal.amount));
  }
  const eligibleSupplierInvoices = state.supplierInvoices.filter((item) => paymentEligible(state, item.id));
  for (const invoice of eligibleSupplierInvoices) {
    const order = state.purchaseOrders.find(({ id }) => id === invoice.purchaseOrderId);
    const dueDate = addDays(invoice.invoiceDate, order?.paymentTermDays ?? 0);
    const settled = state.paymentProposals.filter((proposal) => proposal.supplierInvoiceId === invoice.id && proposal.status === 'settled').reduce((total, proposal) => total + proposal.amount, 0);
    const unplanned = money(Math.max(0, invoice.totalAmount - settled - (plannedByInvoice.get(invoice.id) ?? 0)));
    if (unplanned > 0) { const item = bucket(dueDate); item.outflows = money(item.outflows + unplanned); item.drivers.add('supplier-invoice'); }
  }
  const activeLiquiditySweeps = state.liquiditySweeps.filter(({ status }) => ['approved', 'released'].includes(status));
  for (const sweep of activeLiquiditySweeps) {
    const item = bucket(sweep.effectiveDate); item.outflows = money(item.outflows + sweep.amount); item.inflows = money(item.inflows + sweep.amount); item.drivers.add('liquidity-sweep');
  }
  const openingBalance = money(state.bankAccounts.filter(({ active }) => active).reduce((total, account) => total + latestBalance(state, account.id, asOf), 0));
  let running = openingBalance;
  const lines: CashForecastLine[] = days.map((date) => { const item = buckets.get(date)!; running = money(running + item.inflows - item.outflows); return { date, inflows: item.inflows, outflows: item.outflows, closingBalance: running, drivers: [...item.drivers] }; });
  const unsigned: Omit<CashForecastRun, 'checksum'> = { id, number: fiscalNumber('CFR', state.cashForecastRuns.length + 1, now), asOfDate: asOf, horizonDays: input.horizonDays, scenario: input.scenario, openingBalance, projectedInflows: money(lines.reduce((total, line) => total + line.inflows, 0)), projectedOutflows: money(lines.reduce((total, line) => total + line.outflows, 0)), projectedClosingBalance: lines.at(-1)!.closingBalance, lowPoint: Math.min(openingBalance, ...lines.map(({ closingBalance }) => closingBalance)), lines, generatedBy: actorId, generatedAt: now, assumptions: { receiptCollectionFactor: receiptFactor, plannedOutflowCoverageFactor: 1, sourceEvidence: [`receivables:${openReceivables.length}`, `supplier-invoices:${eligibleSupplierInvoices.length}`, `payment-proposals:${activePaymentProposals.length}`, `liquidity-sweeps:${activeLiquiditySweeps.length}`, `positions:${state.treasuryPositions.length}`] }, version: 1 };
  const run: CashForecastRun = { ...unsigned, checksum: digest(unsigned) };
  const next = mutate(state); next.cashForecastRuns.unshift(run); return next;
}

export function verifyCashForecastChecksum(run: CashForecastRun): boolean {
  if (!run.checksum) return false;
  const { checksum, ...unsigned } = run;
  return digest(unsigned) === checksum;
}

export function createPaymentProposal(state: RevenueOpsState, input: CreatePaymentProposalInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const invoice = state.supplierInvoices.find(({ id: candidate }) => candidate === input.supplierInvoiceId);
  if (!invoice || !paymentEligible(state, invoice.id)) throw new Error('Payment proposal requires a matched or approved supplier invoice.');
  activeBank(state, input.bankAccountId); validDate(input.paymentDate, 'Payment date');
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000_000 || input.amount > supplierInvoiceOutstanding(state, invoice.id)) throw new Error('Payment amount exceeds the available matched supplier-invoice balance.');
  const next = mutate(state);
  next.paymentProposals.unshift({ id, number: fiscalNumber('PAY', state.paymentProposals.length + 1, now), supplierInvoiceId: invoice.id, supplierId: invoice.supplierId, bankAccountId: input.bankAccountId, paymentDate: input.paymentDate, amount: money(input.amount), paymentReference: clean(input.paymentReference, 'Payment reference', 3, 120), purpose: clean(input.purpose, 'Payment purpose', 6, 300), status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 });
  return next;
}

export function decidePaymentProposal(state: RevenueOpsState, input: DecidePaymentProposalInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const proposal = state.paymentProposals.find(({ id }) => id === input.id);
  if (!proposal || proposal.version !== input.expectedVersion || proposal.status !== 'submitted') throw new Error('Payment proposal is stale or no longer awaiting approval.');
  if (proposal.requestedBy === actorId) throw new Error('Payment maker cannot approve the same proposal.');
  const next = mutate(state); next.paymentProposals = next.paymentProposals.map((item) => item.id === proposal.id ? { ...item, status: input.decision, approvedBy: actorId, approvedAt: now, approvalRemarks: clean(input.remarks, 'Payment decision remarks', 4, 500), version: item.version + 1 } : item); return next;
}

export function releasePaymentProposal(state: RevenueOpsState, input: ReleasePaymentProposalInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const proposal = state.paymentProposals.find(({ id }) => id === input.id);
  if (!proposal || proposal.version !== input.expectedVersion || proposal.status !== 'approved') throw new Error('Payment proposal is stale or not approved for release.');
  if (proposal.requestedBy === actorId || proposal.approvedBy === actorId) throw new Error('Payment release requires a user separate from both maker and approver.');
  const released = { ...proposal, status: 'released' as const, releasedBy: actorId, releasedAt: now, bankReleaseReference: clean(input.bankReleaseReference, 'Bank release reference', 4, 160) };
  const paymentJournalDraft = paymentJournal(released, now.slice(0, 10));
  const next = mutate(state); next.paymentProposals = next.paymentProposals.map((item) => item.id === proposal.id ? { ...released, journalId: paymentJournalDraft.id, version: item.version + 1 } : item); next.journalDrafts.unshift(paymentJournalDraft); return next;
}

export function settlePaymentProposal(state: RevenueOpsState, input: SettlePaymentProposalInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const proposal = state.paymentProposals.find(({ id }) => id === input.id);
  if (!proposal || proposal.version !== input.expectedVersion || proposal.status !== 'released') throw new Error('Only a released payment proposal can be settled.');
  validDate(input.settledAt, 'Settlement date');
  if (!Number.isFinite(input.actualAmount) || input.actualAmount < 0 || input.actualAmount > 1_000_000_000_000) throw new Error('Actual settlement amount is invalid.');
  const next = mutate(state); next.paymentProposals = next.paymentProposals.map((item) => item.id === proposal.id ? { ...item, status: input.outcome, settledAt: `${input.settledAt}T12:00:00.000Z`, settlementReference: clean(input.settlementReference, 'Settlement reference', 4, 160), actualAmount: money(input.actualAmount), version: item.version + 1 } : item);
  if (input.outcome === 'failed' || money(input.actualAmount) !== proposal.amount) {
    const code = input.outcome === 'failed' ? 'rejected' : 'amount-mismatch';
    next.settlementExceptions.unshift({ id: randomUUID(), number: fiscalNumber('SETX', next.settlementExceptions.length + 1, now), paymentProposalId: proposal.id, code, amount: money(Math.abs(proposal.amount - input.actualAmount)), details: input.outcome === 'failed' ? 'External banking evidence records a failed payment.' : 'External banking evidence differs from the released proposal amount.', status: 'open', ownerId: actorId, openedBy: actorId, openedAt: now, version: 1 });
  }
  return next;
}

export function recordBankCharge(state: RevenueOpsState, input: RecordBankChargeInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  activeBank(state, input.bankAccountId); validDate(input.chargeDate, 'Bank charge date');
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !Number.isFinite(input.taxAmount) || input.taxAmount < 0 || input.taxAmount > input.amount) throw new Error('Bank charge amount or tax amount is invalid.');
  const record: Omit<BankCharge, 'journalId'> = { id, number: fiscalNumber('BCH', state.bankCharges.length + 1, now), bankAccountId: input.bankAccountId, chargeDate: input.chargeDate, category: input.category, amount: money(input.amount), taxAmount: money(input.taxAmount), reference: clean(input.reference, 'Bank charge reference', 4, 160), status: 'recorded', recordedBy: actorId, recordedAt: now, version: 1 };
  const expense = money(record.amount - record.taxAmount);
  const lines: JournalLine[] = [{ accountCode: 'bank-charges-expense', debit: expense, credit: 0, memo: record.number }];
  if (record.taxAmount) lines.push({ accountCode: 'input-igst', debit: record.taxAmount, credit: 0, memo: `${record.number} tax` });
  lines.push({ accountCode: 'cash-at-bank', debit: 0, credit: record.amount, memo: record.reference });
  const chargeJournal = journal('bank-charge', id, record.number, record.chargeDate, lines);
  const next = mutate(state); next.bankCharges.unshift({ ...record, journalId: chargeJournal.id }); next.journalDrafts.unshift(chargeJournal); return next;
}

export function reconcileBankCharge(state: RevenueOpsState, input: ReconcileBankChargeInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const charge = state.bankCharges.find(({ id }) => id === input.id);
  if (!charge || charge.version !== input.expectedVersion || charge.status !== 'recorded') throw new Error('Bank charge is stale or already reconciled.');
  const next = mutate(state); next.bankCharges = next.bankCharges.map((item) => item.id === charge.id ? { ...item, status: 'reconciled', reconciledBy: actorId, reconciledAt: now, version: item.version + 1 } : item); return next;
}

export function openSettlementException(state: RevenueOpsState, input: OpenSettlementExceptionInput, actorId: string, activeUserIds: string[], id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  if (!state.paymentProposals.some(({ id: candidate, status }) => candidate === input.paymentProposalId && ['released', 'settled', 'failed'].includes(status))) throw new Error('Settlement exception requires a released or settled payment proposal.');
  if (!activeUserIds.includes(input.ownerId)) throw new Error('Settlement exception owner must be active.');
  if (!Number.isFinite(input.amount) || input.amount < 0 || input.amount > 1_000_000_000_000) throw new Error('Settlement exception amount is invalid.');
  const next = mutate(state); next.settlementExceptions.unshift({ id, number: fiscalNumber('SETX', state.settlementExceptions.length + 1, now), paymentProposalId: input.paymentProposalId, code: input.code, amount: money(input.amount), details: clean(input.details, 'Settlement exception details', 4, 500), status: 'open', ownerId: input.ownerId, openedBy: actorId, openedAt: now, version: 1 }); return next;
}

export function resolveSettlementException(state: RevenueOpsState, input: ResolveSettlementExceptionInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const exception = state.settlementExceptions.find(({ id }) => id === input.id);
  if (!exception || exception.version !== input.expectedVersion || !['open', 'under-review'].includes(exception.status)) throw new Error('Settlement exception is stale or closed.');
  if (exception.openedBy === actorId) throw new Error('Settlement exception maker cannot resolve the same exception.');
  const next = mutate(state); next.settlementExceptions = next.settlementExceptions.map((item) => item.id === exception.id ? { ...item, status: input.writtenOff ? 'written-off' : 'resolved', resolvedBy: actorId, resolvedAt: now, resolution: clean(input.resolution, 'Settlement resolution', 4, 500), version: item.version + 1 } : item); return next;
}

export function createLiquiditySweep(state: RevenueOpsState, input: CreateLiquiditySweepInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  activeBank(state, input.fromBankAccountId); activeBank(state, input.toBankAccountId); validDate(input.effectiveDate, 'Liquidity effective date');
  if (input.fromBankAccountId === input.toBankAccountId || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > latestBalance(state, input.fromBankAccountId, input.effectiveDate)) throw new Error('Liquidity sweep needs distinct accounts and an amount within the evidenced source balance.');
  const next = mutate(state); next.liquiditySweeps.unshift({ id, number: fiscalNumber('LSW', state.liquiditySweeps.length + 1, now), fromBankAccountId: input.fromBankAccountId, toBankAccountId: input.toBankAccountId, amount: money(input.amount), effectiveDate: input.effectiveDate, rationale: clean(input.rationale, 'Liquidity rationale', 8, 500), status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 }); return next;
}

export function decideLiquiditySweep(state: RevenueOpsState, input: DecideLiquiditySweepInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const sweep = state.liquiditySweeps.find(({ id }) => id === input.id);
  if (!sweep || sweep.version !== input.expectedVersion || sweep.status !== 'submitted') throw new Error('Liquidity sweep is stale or no longer awaiting approval.');
  if (sweep.requestedBy === actorId) throw new Error('Liquidity sweep maker cannot approve the same sweep.');
  const next = mutate(state); next.liquiditySweeps = next.liquiditySweeps.map((item) => item.id === sweep.id ? { ...item, status: input.decision, approvedBy: actorId, approvedAt: now, approvalRemarks: clean(input.remarks, 'Liquidity decision remarks', 4, 500), version: item.version + 1 } : item); return next;
}

export function releaseLiquiditySweep(state: RevenueOpsState, input: ReleaseLiquiditySweepInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const sweep = state.liquiditySweeps.find(({ id }) => id === input.id);
  if (!sweep || sweep.version !== input.expectedVersion || sweep.status !== 'approved') throw new Error('Liquidity sweep is stale or not approved for release.');
  if (sweep.requestedBy === actorId || sweep.approvedBy === actorId) throw new Error('Liquidity release requires a user separate from both maker and approver.');
  const released = { ...sweep, status: 'released' as const, releasedBy: actorId, releasedAt: now, releaseReference: clean(input.releaseReference, 'Liquidity release reference', 4, 160) };
  const releaseJournal = sweepReleaseJournal(released, now.slice(0, 10));
  const next = mutate(state); next.liquiditySweeps = next.liquiditySweeps.map((item) => item.id === sweep.id ? { ...released, releaseJournalId: releaseJournal.id, version: item.version + 1 } : item); next.journalDrafts.unshift(releaseJournal); return next;
}

export function settleLiquiditySweep(state: RevenueOpsState, input: SettleLiquiditySweepInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const sweep = state.liquiditySweeps.find(({ id }) => id === input.id);
  if (!sweep || sweep.version !== input.expectedVersion || sweep.status !== 'released') throw new Error('Only a released liquidity sweep can be settled.');
  const settlementReference = clean(input.settlementReference, 'Liquidity settlement reference', 4, 160);
  const next = mutate(state);
  if (input.outcome === 'settled') {
    const settled = { ...sweep, status: 'settled' as const, settledBy: actorId, settledAt: now, settlementReference };
    const settlementJournal = sweepSettlementJournal(settled, now.slice(0, 10));
    next.liquiditySweeps = next.liquiditySweeps.map((item) => item.id === sweep.id ? { ...settled, settlementJournalId: settlementJournal.id, version: item.version + 1 } : item); next.journalDrafts.unshift(settlementJournal);
  } else next.liquiditySweeps = next.liquiditySweeps.map((item) => item.id === sweep.id ? { ...item, status: 'failed', settledBy: actorId, settledAt: now, settlementReference, version: item.version + 1 } : item);
  return next;
}
