import { createHash, randomUUID } from 'node:crypto';
import type { AccountingJournalDraft, JournalLine, RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { RetailExchange, CreateRetailExchangeInput, DecideRetailExchangeInput, RetailExchangeReplacementLine } from '../shared/retail-exchange-contracts';
import type { RetailReturn, RetailReturnFinancialCredit, RetailReturnSettlement, RetailStoreCredit } from '../shared/retail-pos-contracts';
import { checkoutRetailSale, priceRetailReplacementLines } from './retail-pos';
import { toIndiaBusinessDate } from '../shared/india-business-date';

const money = (value: number) => Math.round(value * 100) / 100;
const checksum = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value: string, label: string, min = 2, max = 180) => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`);
  return normalized;
};
const positiveMoney = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0 || money(value) !== value) throw new Error(`${label} must be a positive amount in paise.`);
  return value;
};
const sameScope = (state: RevenueOpsState, record: { scope?: RevenueOpsState['scope'] }) => {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};
const fiscalNumber = (prefix: string, index: number, at: string) => {
  const [yearToken, monthToken] = toIndiaBusinessDate(at).split('-');
  const year = Number(yearToken); const month = Number(monthToken); const start = month >= 4 ? year : year - 1;
  return `${prefix}/${String(start).slice(-2)}-${String(start + 1).slice(-2)}/${String(index).padStart(5, '0')}`;
};
const mutate = (state: RevenueOpsState) => { const next = structuredClone(state); next.revision += 1; return next; };

function creditWithBalances(credit: RetailReturnFinancialCredit, settlements: RetailReturnSettlement[]): RetailReturnFinancialCredit {
  const settledAmount = money(settlements.filter((s) => ['cash-refunded', 'provider-refunded', 'store-credit-issued'].includes(s.status)).reduce((n, s) => n + s.amount, 0));
  const reservedAmount = money(settlements.filter((s) => ['requested', 'provider-refund-pending'].includes(s.status)).reduce((n, s) => n + s.amount, 0));
  const availableAmount = money(credit.issuedAmount - settledAmount - reservedAmount);
  if (availableAmount < 0) throw new Error('Retail return financial credit cannot be over-settled.');
  return { ...credit, settlements, settledAmount, reservedAmount, availableAmount, status: availableAmount === 0 && reservedAmount === 0 ? 'settled' : settledAmount || reservedAmount ? 'partially-settled' : 'open', version: credit.version + 1 };
}

function requiredReturn(state: RevenueOpsState, id: string): RetailReturn {
  const value = state.retailReturns.find((candidate) => candidate.id === id && sameScope(state, candidate));
  if (!value) throw new Error('Retail return was not found in the active branch.');
  return value;
}

function replacementLines(state: RevenueOpsState, input: CreateRetailExchangeInput, at: string): { lines: RetailExchangeReplacementLine[]; priced: ReturnType<typeof priceRetailReplacementLines> } {
  if (!input.replacementLines.length) throw new Error('Exchange requires at least one replacement item.');
  const priced = priceRetailReplacementLines(state, { counterId: input.counterId, saleAt: at, lines: input.replacementLines });
  return { priced, lines: priced.lines.map((line) => ({ ...line, id: line.id, lineCostTotal: 0 })) };
}

function requestChecksum(input: CreateRetailExchangeInput, lines: RetailExchangeReplacementLine[], creditVersion: number): string {
  return checksum({ retailReturnId: input.retailReturnId, counterId: input.counterId, cashierShiftId: input.cashierShiftId, transactionKey: input.transactionKey, creditVersion, lines: lines.map((line) => ({ itemVariantId: line.itemVariantId, binId: line.binId, batchId: line.batchId ?? '', serialUnitIds: [...line.serialUnitIds].sort(), quantity: line.quantity })) , topUpTender: input.topUpTender ?? null });
}

export function createRetailExchange(state: RevenueOpsState, input: CreateRetailExchangeInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const transactionKey = clean(input.transactionKey, 'Exchange transaction key', 8, 120);
  const source = requiredReturn(state, input.retailReturnId);
  if (source.status !== 'approved' || !source.financialCredit) throw new Error('Exchange requires an approved return with an open GST credit.');
  if (source.requestedBy === actorId || source.inspectedBy === actorId || source.approvedBy === actorId) throw new Error('Exchange request must be created by an operator independent of return approval.');
  const shift = state.retailCashierShifts.find((candidate) => candidate.id === input.cashierShiftId && sameScope(state, candidate));
  if (!shift || shift.counterId !== input.counterId || shift.status !== 'open' || shift.cashierId !== actorId) throw new Error('Exchange requires the assigned cashier\'s open shift at the selected counter.');
  const existing = state.retailExchanges.find((candidate) => candidate.transactionKey === transactionKey && sameScope(state, candidate));
  const { priced, lines } = replacementLines(state, input, now);
  const requestHash = requestChecksum(input, lines, source.financialCredit.version);
  if (existing) { if (existing.requestChecksum !== requestHash) throw new Error('Exchange idempotency key was reused with different data.'); return state; }
  const creditApplied = money(Math.min(source.financialCredit.availableAmount, priced.taxPreview.grandTotal));
  const netTopUp = money(priced.taxPreview.grandTotal - creditApplied);
  let topUpTender: RetailExchange['topUpTender'];
  if (netTopUp > 0) {
    if (!input.topUpTender || input.topUpTender.method === 'store-credit' || money(input.topUpTender.amount) !== netTopUp) throw new Error('Exchange top-up must equal the exact replacement shortfall and cannot use store credit.');
    topUpTender = { id: randomUUID(), method: input.topUpTender.method, amount: positiveMoney(input.topUpTender.amount, 'Exchange top-up'), reference: clean(input.topUpTender.reference, 'Exchange top-up reference', 3, 120).toUpperCase() };
  } else if (input.topUpTender) throw new Error('Top-up tender is not allowed when the return credit covers the replacement.');
  const exchange: RetailExchange = {
    id, number: fiscalNumber('EXCH', state.retailExchanges.length + 1, now), retailReturnId: source.id, retailReturnNumber: source.number,
    financialCreditId: source.financialCredit.id, sourceCreditVersion: source.financialCredit.version, counterId: input.counterId, cashierShiftId: input.cashierShiftId,
    cashierId: actorId, customerAccountId: source.customerAccountId, transactionKey, requestChecksum: requestHash, replacementLines: lines,
    replacementSubtotal: priced.subtotal, replacementTaxPreview: priced.taxPreview, replacementGrandTotal: priced.taxPreview.grandTotal, replacementCostTotal: 0,
    creditApplied, netTopUp, topUpTender, status: 'requested', requestedBy: actorId, requestedAt: now, scope: structuredClone(state.scope), version: 1,
  };
  const next = mutate(state); next.retailExchanges.unshift(exchange); return next;
}

function exchangeJournal(exchange: RetailExchange, at: string): AccountingJournalDraft {
  const amount = exchange.creditApplied;
  const lines: JournalLine[] = [
    { accountCode: 'unapplied-cash', debit: amount, credit: 0, memo: `${exchange.number} applied return credit` },
    { accountCode: 'accounts-receivable', debit: 0, credit: amount, memo: `${exchange.number} replacement invoice credit application` },
  ];
  return { id: randomUUID(), sourceType: 'retail-return-settlement', sourceId: exchange.id, sourceNumber: exchange.number, postingDate: toIndiaBusinessDate(at), lines, totalDebit: amount, totalCredit: amount, status: 'ready', checksum: checksum({ sourceId: exchange.id, lines }), version: 1 };
}

export function decideRetailExchange(state: RevenueOpsState, input: DecideRetailExchangeInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const exchange = state.retailExchanges.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!exchange || exchange.status !== 'requested' || exchange.version !== input.expectedVersion) throw new Error('Exchange is stale or no longer awaiting approval.');
  const evidence = clean(input.evidenceReference, 'Exchange decision evidence', 3, 180);
  if (exchange.requestedBy === actorId) throw new Error('Exchange approval requires an independent reviewer.');
  if (input.decision === 'rejected') {
    const next = mutate(state); next.retailExchanges = next.retailExchanges.map((candidate) => candidate.id === exchange.id ? { ...candidate, status: 'rejected' as const, rejectedBy: actorId, rejectedAt: now, rejectionReason: evidence, version: candidate.version + 1 } : candidate); return next;
  }
  const source = requiredReturn(state, exchange.retailReturnId);
  const credit = source.financialCredit;
  if (source.status !== 'approved' || !credit || credit.id !== exchange.financialCreditId || credit.version !== exchange.sourceCreditVersion) throw new Error('Source return credit changed; refresh the exchange before approval.');
  if (credit.availableAmount < exchange.creditApplied) throw new Error('Source return credit no longer covers this exchange.');
  const bridgeCredit: RetailStoreCredit = { id: randomUUID(), number: fiscalNumber('SCEX', state.retailStoreCredits.length + 1, now), retailReturnId: source.id, retailReturnSettlementId: exchange.id, customerAccountId: source.customerAccountId, issuedAmount: exchange.creditApplied, availableAmount: exchange.creditApplied, status: 'active', evidenceReference: evidence, issuedBy: actorId, issuedAt: now, scope: structuredClone(state.scope), version: 1 };
  let next = mutate(state); next.retailStoreCredits.unshift(bridgeCredit);
  const saleInput = { counterId: exchange.counterId, cashierShiftId: exchange.cashierShiftId, customerAccountId: exchange.customerAccountId, transactionKey: `exchange:${exchange.transactionKey}`, saleAt: now, lines: exchange.replacementLines.map((line) => ({ itemVariantId: line.itemVariantId, binId: line.binId, batchId: line.batchId, serialUnitIds: [...line.serialUnitIds], quantity: line.quantity })), discountPolicyIds: [], tenders: [{ method: 'store-credit' as const, amount: exchange.creditApplied, reference: bridgeCredit.number }, ...(exchange.topUpTender ? [{ method: exchange.topUpTender.method, amount: exchange.topUpTender.amount, reference: exchange.topUpTender.reference }] : [])] };
  next = checkoutRetailSale(next, saleInput, exchange.cashierId, now);
  const sale = next.retailSales.find((candidate) => candidate.transactionKey === saleInput.transactionKey)!;
  const settlement: RetailReturnSettlement = { id: randomUUID(), number: fiscalNumber('RSET', credit.settlements.length + 1, now), retailReturnId: source.id, financialCreditId: credit.id, transactionKey: `exchange-credit:${exchange.transactionKey}`, requestChecksum: checksum({ exchangeId: exchange.id, amount: exchange.creditApplied }), method: 'store-credit', amount: exchange.creditApplied, storeCreditId: bridgeCredit.id, status: 'store-credit-issued', requestedBy: exchange.requestedBy, requestedAt: exchange.requestedAt, requestEvidenceReference: evidence, decidedBy: actorId, decidedAt: now, decisionEvidenceReference: evidence, version: 1 };
  const updatedCredit = creditWithBalances(credit, [...credit.settlements, settlement]);
  next.retailReturns = next.retailReturns.map((candidate) => candidate.id === source.id ? { ...candidate, financialCredit: updatedCredit, version: candidate.version + 1 } : candidate);
  const remainder = money(credit.availableAmount - exchange.creditApplied);
  let remainderStoreCreditId: string | undefined;
  if (remainder > 0) { const remainderCredit: RetailStoreCredit = { ...bridgeCredit, id: randomUUID(), number: fiscalNumber('STCR', next.retailStoreCredits.length + 1, now), issuedAmount: remainder, availableAmount: remainder, evidenceReference: `${evidence} / remainder`, version: 1 }; next.retailStoreCredits.unshift(remainderCredit); remainderStoreCreditId = remainderCredit.id; }
  const draft = exchangeJournal(exchange, now); next.journalDrafts.unshift(draft);
  next.retailExchanges = next.retailExchanges.map((candidate) => candidate.id === exchange.id ? { ...candidate, status: 'approved' as const, approvedBy: actorId, approvedAt: now, approvalEvidenceReference: evidence, replacementSaleId: sale.id, replacementInvoiceId: sale.invoiceId, replacementPaymentReceiptIds: [...sale.paymentReceiptIds], replacementCostTotal: sale.costTotal, replacementCostJournalDraftId: draft.id, remainderStoreCreditId, version: candidate.version + 1 } : candidate);
  return next;
}
