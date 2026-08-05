import { createHash, randomUUID } from 'node:crypto';
import type {
  BankStatementLine,
  CollectionActivity,
  CommitBankStatementInput,
  ConfirmBankMatchInput,
  CreateBankAccountInput,
  CreateWithholdingPolicyInput,
  DecideCreditLimitInput,
  DecideWriteOffInput,
  DecideZeroRatedSupplyInput,
  DunningCase,
  ExcludeBankLineInput,
  OpenReceivableDisputeInput,
  PrepareZeroRatedSupplyInput,
  PreviewBankStatementInput,
  ProposeCreditLimitInput,
  ReceivableDispute,
  RecordCollectionActivityInput,
  RecordWithholdingEntryInput,
  RequestWriteOffInput,
  ResolveReceivableDisputeInput,
  RunDunningInput,
  TransitionWithholdingEntryInput,
  WithholdingEntry,
} from '../shared/collections-finance-contracts';
import type { AccountingJournalDraft, JournalLine, Receivable, RevenueOpsState } from '../shared/revenue-ops-contracts';
import { validateGstin } from './revenue-ops';

const money = (value: number): number => Math.round(value * 100) / 100;
const digest = (value: unknown): string => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
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
const mutate = (state: RevenueOpsState): RevenueOpsState => { const next = structuredClone(state); next.revision += 1; return next; };

function journal(sourceType: AccountingJournalDraft['sourceType'], sourceId: string, sourceNumber: string, postingDate: string, lines: JournalLine[], id: string = randomUUID()): AccountingJournalDraft {
  const normalized = lines.map((line) => ({ ...line, debit: money(line.debit), credit: money(line.credit) }));
  const totalDebit = money(normalized.reduce((total, line) => total + line.debit, 0));
  const totalCredit = money(normalized.reduce((total, line) => total + line.credit, 0));
  if (totalDebit !== totalCredit) throw new Error('Accounting handoff is not balanced.');
  const unsigned = { sourceType, sourceId, sourceNumber, postingDate, lines: normalized, totalDebit, totalCredit };
  return { id, ...unsigned, status: 'ready', checksum: digest(unsigned), version: 1 };
}

function activeDisputedAmount(state: RevenueOpsState, receivableId: string): number {
  return money(state.receivableDisputes.filter((item) => item.receivableId === receivableId && ['open', 'under-review'].includes(item.status)).reduce((total, item) => total + item.amount, 0));
}

function receivableStatus(receivable: Receivable, today: string): Receivable['status'] {
  if (receivable.outstandingAmount === 0) return (receivable.writtenOffAmount ?? 0) > 0 ? 'written-off' : 'paid';
  if (receivable.paidAmount || receivable.withheldAmount) return 'partially-paid';
  return receivable.dueDate < today ? 'overdue' : receivable.dueDate === today ? 'due' : 'current';
}

export function assertCreditAvailable(state: RevenueOpsState, accountId: string, proposedAmount: number): void {
  const control = state.creditLimitControls.find(({ accountId: candidate, status }) => candidate === accountId && status === 'approved');
  if (!control?.blockNewOrders) return;
  const exposure = money(state.receivables.filter(({ accountId: candidate, status }) => candidate === accountId && !['paid', 'written-off'].includes(status)).reduce((total, item) => total + item.outstandingAmount, 0));
  if (exposure + proposedAmount > control.creditLimit) throw new Error(`Credit hold: proposed exposure exceeds the approved INR ${control.creditLimit.toFixed(2)} limit.`);
  const overdueBeyondGrace = state.receivables.some(({ accountId: candidate, outstandingAmount, dueDate, status }) => candidate === accountId && outstandingAmount > 0 && !['paid', 'written-off'].includes(status) && (Date.now() - Date.parse(`${dueDate}T00:00:00.000Z`)) / 86400000 > control.graceDays);
  if (overdueBeyondGrace) throw new Error('Credit hold: account has receivables beyond the approved grace period.');
}

export function proposeCreditLimit(state: RevenueOpsState, input: ProposeCreditLimitInput, actorId: string, activeAccountIds: string[], id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  if (!activeAccountIds.includes(input.accountId)) throw new Error('Credit control requires an active account.');
  if (!Number.isFinite(input.creditLimit) || input.creditLimit < 0 || input.creditLimit > 1_000_000_000_000) throw new Error('Credit limit must be between zero and INR 1 trillion.');
  if (input.warningThresholdPercent < 1 || input.warningThresholdPercent > 100 || !Number.isInteger(input.graceDays) || input.graceDays < 0 || input.graceDays > 365) throw new Error('Credit warning threshold or grace days are invalid.');
  if (state.creditLimitControls.some(({ accountId, status }) => accountId === input.accountId && status === 'pending')) throw new Error('This account already has a pending credit-limit review.');
  const next = mutate(state);
  next.creditLimitControls.unshift({ id, number: fiscalNumber('CRL', state.creditLimitControls.length + 1, now), accountId: input.accountId, currency: 'INR', creditLimit: money(input.creditLimit), warningThresholdPercent: input.warningThresholdPercent, graceDays: input.graceDays, blockNewOrders: input.blockNewOrders, riskGrade: input.riskGrade, rationale: clean(input.rationale, 'Credit rationale', 8, 500), status: 'pending', requestedBy: actorId, requestedAt: now, version: 1 });
  return next;
}

export function decideCreditLimit(state: RevenueOpsState, input: DecideCreditLimitInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const control = state.creditLimitControls.find(({ id }) => id === input.id);
  if (!control || control.version !== input.expectedVersion || control.status !== 'pending') throw new Error('Credit-limit review is stale or no longer pending.');
  if (control.requestedBy === actorId) throw new Error('Credit-limit maker cannot approve the same request.');
  const next = mutate(state);
  if (input.decision === 'approved') next.creditLimitControls = next.creditLimitControls.map((item) => item.accountId === control.accountId && item.status === 'approved' ? { ...item, status: 'superseded', version: item.version + 1 } : item);
  next.creditLimitControls = next.creditLimitControls.map((item) => item.id === control.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Credit decision remarks', 4, 500), version: item.version + 1 } : item);
  return next;
}

const dunningStage = (days: number): DunningCase['stage'] => days >= 31 ? 'credit-hold' : days >= 16 ? 'final-demand' : days >= 8 ? 'notice' : 'reminder';

export function runDunning(state: RevenueOpsState, input: RunDunningInput, activeUserIds: string[], now = new Date().toISOString()): RevenueOpsState {
  const asOf = validDate(input.asOfDate, 'Dunning date');
  if (!activeUserIds.includes(input.ownerId)) throw new Error('Dunning owner must be an active user.');
  const next = mutate(state);
  next.receivables = next.receivables.map((item) => ({ ...item, status: receivableStatus(item, asOf) }));
  for (const receivable of next.receivables.filter(({ outstandingAmount, dueDate, status }) => outstandingAmount > 0 && dueDate < asOf && !['paid', 'written-off'].includes(status))) {
    const disputed = activeDisputedAmount(next, receivable.id);
    const actionableAmount = money(receivable.outstandingAmount - disputed);
    if (actionableAmount <= 0) continue;
    const daysOverdue = Math.floor((Date.parse(`${asOf}T00:00:00.000Z`) - Date.parse(`${receivable.dueDate}T00:00:00.000Z`)) / 86400000);
    const stage = dunningStage(daysOverdue);
    const existing = next.dunningCases.find(({ receivableId, status }) => receivableId === receivable.id && status !== 'resolved');
    const nextAction = new Date(`${asOf}T00:00:00.000Z`); nextAction.setUTCDate(nextAction.getUTCDate() + (stage === 'reminder' ? 7 : stage === 'notice' ? 5 : stage === 'final-demand' ? 3 : 1));
    if (existing) next.dunningCases = next.dunningCases.map((item) => item.id === existing.id ? { ...item, stage, daysOverdue, actionableAmount, ownerId: input.ownerId, nextActionAt: nextAction.toISOString(), updatedAt: now, version: item.version + 1 } : item);
    else next.dunningCases.unshift({ id: randomUUID(), number: fiscalNumber('DUN', next.dunningCases.length + 1, asOf), receivableId: receivable.id, accountId: receivable.accountId, stage, status: 'open', daysOverdue, actionableAmount, ownerId: input.ownerId, nextActionAt: nextAction.toISOString(), createdAt: now, updatedAt: now, version: 1 });
  }
  return next;
}

export function recordCollectionActivity(state: RevenueOpsState, input: RecordCollectionActivityInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const record = state.dunningCases.find(({ id: caseId }) => caseId === input.dunningCaseId);
  if (!record || record.version !== input.expectedVersion || record.status === 'resolved') throw new Error('Dunning case is stale or resolved.');
  if (input.outcome === 'promised-to-pay' && (!input.promisedDate || input.promisedDate <= now.slice(0, 10) || !input.promisedAmount || input.promisedAmount <= 0 || input.promisedAmount > record.actionableAmount)) throw new Error('Promise-to-pay requires a future date and valid promised amount.');
  const activity: CollectionActivity = { id, dunningCaseId: record.id, channel: input.channel, outcome: input.outcome, notes: clean(input.notes, 'Collection notes', 4, 500), promisedAmount: input.promisedAmount ? money(input.promisedAmount) : undefined, promisedDate: input.promisedDate, performedBy: actorId, performedAt: now };
  const status = input.outcome === 'paid' ? 'resolved' as const : input.outcome === 'promised-to-pay' || input.outcome === 'dispute-raised' ? 'paused' as const : 'open' as const;
  const nextAction = input.promisedDate ? `${input.promisedDate}T09:00:00.000Z` : record.nextActionAt;
  const next = mutate(state); next.collectionActivities.unshift(activity); next.dunningCases = next.dunningCases.map((item) => item.id === record.id ? { ...item, status, nextActionAt: nextAction, updatedAt: now, version: item.version + 1 } : item); return next;
}

export function openReceivableDispute(state: RevenueOpsState, input: OpenReceivableDisputeInput, actorId: string, activeUserIds: string[], id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const receivable = state.receivables.find(({ id: receivableId }) => receivableId === input.receivableId);
  if (!receivable || receivable.outstandingAmount <= 0) throw new Error('Open receivable not found.');
  if (!activeUserIds.includes(input.ownerId)) throw new Error('Dispute owner must be an active user.');
  if (input.amount <= 0 || activeDisputedAmount(state, receivable.id) + input.amount > receivable.outstandingAmount) throw new Error('Disputed amount exceeds the available receivable balance.');
  const dispute: ReceivableDispute = { id, number: fiscalNumber('DSP', state.receivableDisputes.length + 1, now), receivableId: receivable.id, accountId: receivable.accountId, category: input.category, amount: money(input.amount), reason: clean(input.reason, 'Dispute reason', 8, 500), evidenceReference: clean(input.evidenceReference, 'Dispute evidence', 3, 200), ownerId: input.ownerId, status: 'open', openedBy: actorId, openedAt: now, version: 1 };
  const next = mutate(state); next.receivableDisputes.unshift(dispute); next.receivables = next.receivables.map((item) => item.id === receivable.id ? { ...item, status: 'disputed', version: item.version + 1 } : item); next.dunningCases = next.dunningCases.map((item) => item.receivableId === receivable.id && item.status === 'open' ? { ...item, status: 'paused', updatedAt: now, version: item.version + 1 } : item); return next;
}

export function resolveReceivableDispute(state: RevenueOpsState, input: ResolveReceivableDisputeInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const dispute = state.receivableDisputes.find(({ id }) => id === input.id);
  if (!dispute || dispute.version !== input.expectedVersion || !['open', 'under-review'].includes(dispute.status)) throw new Error('Dispute is stale or already closed.');
  if (dispute.openedBy === actorId) throw new Error('Dispute opener cannot resolve the same dispute.');
  if (input.resolution === 'credit-note' && !state.creditDebitNotes.some(({ invoiceId, number, totalAmount }) => invoiceId === state.receivables.find(({ id }) => id === dispute.receivableId)?.invoiceId && number === input.resolutionReference && totalAmount >= dispute.amount)) throw new Error('Credit-note resolution requires a sufficient linked credit note.');
  if (input.resolution === 'write-off' && !state.writeOffRequests.some(({ receivableId, number, status, amount }) => receivableId === dispute.receivableId && number === input.resolutionReference && status === 'approved' && amount >= dispute.amount)) throw new Error('Write-off resolution requires an approved write-off reference.');
  const status: ReceivableDispute['status'] = input.resolution === 'rejected' ? 'rejected' : input.resolution === 'withdrawn' ? 'withdrawn' : 'resolved';
  const next = mutate(state); next.receivableDisputes = next.receivableDisputes.map((item) => item.id === dispute.id ? { ...item, status, resolution: input.resolution, resolutionReference: clean(input.resolutionReference, 'Resolution reference', 3, 200), resolvedBy: actorId, resolvedAt: now, version: item.version + 1 } : item);
  const receivable = next.receivables.find(({ id }) => id === dispute.receivableId)!;
  if (!next.receivableDisputes.some((item) => item.receivableId === dispute.receivableId && ['open', 'under-review'].includes(item.status))) next.receivables = next.receivables.map((item) => item.id === receivable.id ? { ...item, status: receivableStatus(item, now.slice(0, 10)), version: item.version + 1 } : item);
  return next;
}

export function requestWriteOff(state: RevenueOpsState, input: RequestWriteOffInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const receivable = state.receivables.find(({ id: receivableId }) => receivableId === input.receivableId);
  if (!receivable || receivable.outstandingAmount <= 0) throw new Error('Open receivable not found.');
  const pending = state.writeOffRequests.filter(({ receivableId, status }) => receivableId === receivable.id && status === 'pending').reduce((total, item) => total + item.amount, 0);
  if (input.amount <= 0 || pending + input.amount > receivable.outstandingAmount) throw new Error('Write-off amount exceeds the available receivable balance.');
  const next = mutate(state); next.writeOffRequests.unshift({ id, number: fiscalNumber('WOF', state.writeOffRequests.length + 1, now), receivableId: receivable.id, accountId: receivable.accountId, amount: money(input.amount), reason: clean(input.reason, 'Write-off reason', 8, 500), evidenceReference: clean(input.evidenceReference, 'Write-off evidence', 3, 200), status: 'pending', requestedBy: actorId, requestedAt: now, version: 1 }); return next;
}

export function decideWriteOff(state: RevenueOpsState, input: DecideWriteOffInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const request = state.writeOffRequests.find(({ id }) => id === input.id);
  if (!request || request.version !== input.expectedVersion || request.status !== 'pending') throw new Error('Write-off request is stale or no longer pending.');
  if (request.requestedBy === actorId) throw new Error('Write-off requester cannot approve the same request.');
  const next = mutate(state);
  let journalId: string | undefined;
  if (input.decision === 'approved') {
    const receivable = next.receivables.find(({ id }) => id === request.receivableId);
    if (!receivable || request.amount > receivable.outstandingAmount) throw new Error('Receivable changed and can no longer support this write-off.');
    const outstandingAmount = money(receivable.outstandingAmount - request.amount);
    const updated = { ...receivable, outstandingAmount, writtenOffAmount: money((receivable.writtenOffAmount ?? 0) + request.amount), status: outstandingAmount === 0 ? 'written-off' as const : 'partially-paid' as const, version: receivable.version + 1 };
    next.receivables = next.receivables.map((item) => item.id === receivable.id ? updated : item);
    next.invoices = next.invoices.map((invoice) => invoice.id === receivable.invoiceId && outstandingAmount === 0 ? { ...invoice, status: 'written-off', version: invoice.version + 1 } : invoice);
    const draft = journal('write-off', request.id, request.number, now.slice(0, 10), [{ accountCode: 'bad-debt-expense', debit: request.amount, credit: 0, memo: request.number }, { accountCode: 'accounts-receivable', debit: 0, credit: request.amount, memo: request.number }]);
    journalId = draft.id; next.journalDrafts.unshift(draft);
  }
  next.writeOffRequests = next.writeOffRequests.map((item) => item.id === request.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Write-off decision remarks', 4, 500), journalId, version: item.version + 1 } : item);
  return next;
}

export function createWithholdingPolicy(state: RevenueOpsState, input: CreateWithholdingPolicyInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,23}$/.test(code) || state.withholdingPolicies.some((item) => item.code === code)) throw new Error('Withholding policy code is invalid or already exists.');
  validDate(input.effectiveFrom, 'Effective-from date'); if (input.effectiveTo) validDate(input.effectiveTo, 'Effective-to date');
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new Error('Withholding policy effective range is invalid.');
  const transition = '2026-04-01';
  if (input.effectiveFrom < transition && (!input.effectiveTo || input.effectiveTo >= transition)) throw new Error('A withholding policy cannot straddle the 1 April 2026 Income Tax Act transition.');
  if (input.effectiveFrom >= transition && input.lawVersion !== 'income-tax-act-2025') throw new Error('Events from 1 April 2026 require Income Tax Act, 2025 policy references.');
  if (input.effectiveFrom < transition && input.lawVersion !== 'income-tax-act-1961') throw new Error('Events before 1 April 2026 require Income Tax Act, 1961 policy references.');
  if (input.lawVersion === 'income-tax-act-2025' && (input.kind === 'TDS' ? !/^393\b/.test(input.sectionReference.trim()) : !/^394\b/.test(input.sectionReference.trim()))) throw new Error(`${input.kind} under the 2025 Act must reference section ${input.kind === 'TDS' ? '393' : '394'}.`);
  if (input.lawVersion === 'income-tax-act-2025' && !input.tableItem?.trim()) throw new Error('Income Tax Act, 2025 policy requires the applicable table item.');
  if (input.ratePercent < 0 || input.ratePercent > 100 || input.thresholdAmount < 0) throw new Error('Withholding rate or threshold is invalid.');
  if (!/^https:\/\//i.test(input.sourceUrl)) throw new Error('Withholding authority source must use HTTPS.');
  const next = mutate(state); next.withholdingPolicies.unshift({ id, code, name: clean(input.name, 'Policy name'), kind: input.kind, lawVersion: input.lawVersion, sectionReference: clean(input.sectionReference, 'Section reference', 3, 120), tableItem: input.tableItem?.trim(), trigger: input.trigger, ratePercent: input.ratePercent, thresholdAmount: money(input.thresholdAmount), effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, sourceUrl: input.sourceUrl.trim(), active: true, createdBy: actorId, createdAt: now, version: 1 }); return next;
}

export function recordWithholdingEntry(state: RevenueOpsState, input: RecordWithholdingEntryInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const policy = state.withholdingPolicies.find(({ id: policyId, active, effectiveFrom, effectiveTo }) => policyId === input.policyId && active && effectiveFrom <= input.eventDate && (!effectiveTo || effectiveTo >= input.eventDate));
  if (!policy) throw new Error('Effective withholding policy not found for the event date.');
  if ((input.direction === 'company-collected-tcs') !== (policy.kind === 'TCS')) throw new Error('Withholding direction does not match the TDS/TCS policy kind.');
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(input.counterpartyPan.trim().toUpperCase())) throw new Error('Counterparty PAN must use the official ten-character structure.');
  if (input.baseAmount <= 0 || input.baseAmount < policy.thresholdAmount) throw new Error('Withholding base does not meet the effective policy threshold.');
  const taxAmount = money(input.baseAmount * policy.ratePercent / 100);
  const receivable = input.receivableId ? state.receivables.find(({ id: receivableId, accountId }) => receivableId === input.receivableId && accountId === input.accountId) : undefined;
  if (input.receivableId && !receivable) throw new Error('Linked receivable does not belong to the account.');
  if (input.direction === 'customer-deducted-tds' && (!receivable || taxAmount > receivable.outstandingAmount)) throw new Error('Customer TDS requires sufficient linked receivable balance.');
  const entry: WithholdingEntry = { id, number: fiscalNumber(policy.kind, state.withholdingEntries.length + 1, input.eventDate), policyId: policy.id, accountId: input.accountId, receivableId: receivable?.id, direction: input.direction, eventDate: input.eventDate, baseAmount: money(input.baseAmount), ratePercent: policy.ratePercent, taxAmount, counterpartyPan: input.counterpartyPan.trim().toUpperCase(), certificateOrChallanReference: input.certificateOrChallanReference?.trim(), status: 'recognized', recordedBy: actorId, recordedAt: now, version: 1 };
  const next = mutate(state); next.withholdingEntries.unshift(entry);
  if (receivable && input.direction === 'customer-deducted-tds') {
    const outstandingAmount = money(receivable.outstandingAmount - taxAmount); const updated = { ...receivable, outstandingAmount, withheldAmount: money((receivable.withheldAmount ?? 0) + taxAmount), status: outstandingAmount === 0 ? 'paid' as const : 'partially-paid' as const, version: receivable.version + 1 };
    next.receivables = next.receivables.map((item) => item.id === receivable.id ? updated : item); next.invoices = next.invoices.map((invoice) => invoice.id === receivable.invoiceId ? { ...invoice, status: outstandingAmount === 0 ? 'paid' : 'partially-paid', version: invoice.version + 1 } : invoice);
    const draft = journal('withholding', entry.id, entry.number, entry.eventDate, [{ accountCode: 'tds-receivable', debit: taxAmount, credit: 0, memo: entry.number }, { accountCode: 'accounts-receivable', debit: 0, credit: taxAmount, memo: entry.number }]); entry.journalId = draft.id; next.withholdingEntries[0] = entry; next.journalDrafts.unshift(draft);
  }
  if (receivable && input.direction === 'company-collected-tcs') {
    const outstandingAmount = money(receivable.outstandingAmount + taxAmount); next.receivables = next.receivables.map((item) => item.id === receivable.id ? { ...item, outstandingAmount, adjustmentAmount: money(item.adjustmentAmount + taxAmount), version: item.version + 1 } : item);
    const draft = journal('withholding', entry.id, entry.number, entry.eventDate, [{ accountCode: 'accounts-receivable', debit: taxAmount, credit: 0, memo: entry.number }, { accountCode: 'tcs-payable', debit: 0, credit: taxAmount, memo: entry.number }]); entry.journalId = draft.id; next.withholdingEntries[0] = entry; next.journalDrafts.unshift(draft);
  }
  return next;
}

export function transitionWithholdingEntry(state: RevenueOpsState, input: TransitionWithholdingEntryInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const entry = state.withholdingEntries.find(({ id }) => id === input.id);
  if (!entry || entry.version !== input.expectedVersion) throw new Error('Withholding entry changed. Refresh and retry.');
  const allowed: Record<WithholdingEntry['status'], WithholdingEntry['status'][]> = { recognized: entry.direction === 'customer-deducted-tds' ? ['reconciled'] : ['deposited'], deposited: ['filed'], filed: ['reconciled'], reconciled: [] };
  if (!allowed[entry.status].includes(input.toStatus)) throw new Error(`Withholding entry cannot move from ${entry.status} to ${input.toStatus}.`);
  const next = mutate(state); next.withholdingEntries = next.withholdingEntries.map((item) => item.id === entry.id ? { ...item, status: input.toStatus, certificateOrChallanReference: clean(input.reference, 'Certificate or challan reference', 3, 160), updatedBy: actorId, updatedAt: now, version: item.version + 1 } : item); return next;
}

export function prepareZeroRatedSupply(state: RevenueOpsState, input: PrepareZeroRatedSupplyInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const invoice = state.invoices.find(({ id: invoiceId }) => invoiceId === input.invoiceId);
  if (!invoice || invoice.status !== 'draft') throw new Error('Zero-rated review requires a draft invoice.');
  if (state.zeroRatedSupplyReviews.some(({ invoiceId, status }) => invoiceId === invoice.id && status !== 'rejected')) throw new Error('This invoice already has an active zero-rated review.');
  const isExport = input.supplyType.startsWith('export-'); const isSez = input.supplyType.startsWith('sez-');
  if (isExport && invoice.recipientTreatment !== 'export') throw new Error('Export review requires an export-classified quotation and invoice.');
  if (isExport && !/^[A-Z]{2}$/.test(input.destinationCountryCode ?? '') ) throw new Error('Export review requires a two-letter destination country code.');
  if (isSez) {
    if (!input.sezGstin || validateGstin(input.sezGstin) !== invoice.recipientGstin) throw new Error('SEZ review requires the invoice recipient GSTIN.');
    if (!input.authorisedOperationsEvidence) throw new Error('SEZ zero rating requires authorised-operations evidence.');
  }
  if (input.taxRoute === 'lut-bond-without-payment' && (!input.lutBondNumber || !input.lutBondDate || !input.lutBondValidUntil || input.lutBondDate > invoice.invoiceDate || input.lutBondValidUntil < invoice.invoiceDate)) throw new Error('LUT/Bond route requires a reference valid on the invoice date.');
  const invoiceEndorsement = isSez
    ? input.taxRoute === 'igst-paid-refund'
      ? 'SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS ON PAYMENT OF IGST'
      : 'SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF IGST'
    : input.taxRoute === 'igst-paid-refund'
      ? 'SUPPLY MEANT FOR EXPORT ON PAYMENT OF IGST'
      : 'SUPPLY MEANT FOR EXPORT UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF IGST';
  const next = mutate(state); next.zeroRatedSupplyReviews.unshift({ id, number: fiscalNumber('ZRS', state.zeroRatedSupplyReviews.length + 1, invoice.invoiceDate), invoiceId: invoice.id, accountId: invoice.accountId, supplyType: input.supplyType, taxRoute: input.taxRoute, destinationCountryCode: input.destinationCountryCode?.toUpperCase(), recipientName: clean(input.recipientName, 'Recipient name', 2, 200), recipientAddress: clean(input.recipientAddress, 'Recipient address', 5, 500), sezGstin: input.sezGstin?.toUpperCase(), lutBondNumber: input.lutBondNumber?.trim(), lutBondDate: input.lutBondDate, lutBondValidUntil: input.lutBondValidUntil, shippingBillNumber: input.shippingBillNumber?.trim(), portCode: input.portCode?.trim().toUpperCase(), authorisedOperationsEvidence: input.authorisedOperationsEvidence?.trim(), invoiceEndorsement, status: 'pending', requestedBy: actorId, requestedAt: now, version: 1 }); return next;
}

export function decideZeroRatedSupply(state: RevenueOpsState, input: DecideZeroRatedSupplyInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const review = state.zeroRatedSupplyReviews.find(({ id }) => id === input.id);
  if (!review || review.version !== input.expectedVersion || review.status !== 'pending') throw new Error('Zero-rated review is stale or no longer pending.');
  if (review.requestedBy === actorId) throw new Error('Zero-rated review maker cannot approve the same request.');
  const invoice = state.invoices.find(({ id }) => id === review.invoiceId);
  if (!invoice || invoice.status !== 'draft') throw new Error('Invoice is no longer eligible for zero-rated approval.');
  const next = mutate(state); next.zeroRatedSupplyReviews = next.zeroRatedSupplyReviews.map((item) => item.id === review.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Zero-rated decision remarks', 4, 500), version: item.version + 1 } : item);
  if (input.decision === 'approved') {
    let taxPreview = invoice.taxPreview;
    if (review.taxRoute === 'lut-bond-without-payment') taxPreview = { ...taxPreview, cgst: 0, sgst: 0, igst: 0, totalTax: 0, grandTotal: taxPreview.taxableValue };
    else taxPreview = { ...taxPreview, cgst: 0, sgst: 0, igst: taxPreview.totalTax, treatment: 'inter-state' };
    next.invoices = next.invoices.map((item) => item.id === invoice.id ? { ...item, taxPreview, amountDue: taxPreview.grandTotal, zeroRatedSupplyId: review.id, exportEndorsement: review.invoiceEndorsement, destinationCountryCode: review.destinationCountryCode, lutBondNumber: review.lutBondNumber, version: item.version + 1 } : item);
  }
  return next;
}

export function createBankAccount(state: RevenueOpsState, input: CreateBankAccountInput, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const code = input.code.trim().toUpperCase(); const ifsc = input.ifsc.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,19}$/.test(code) || state.bankAccounts.some((item) => item.code === code)) throw new Error('Bank account code is invalid or already exists.');
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new Error('IFSC must use the official eleven-character structure.');
  if (!/^\*{4,12}\d{4}$/.test(input.maskedAccountNumber)) throw new Error('Store only a masked bank account number ending in four digits.');
  const next = mutate(state); next.bankAccounts.push({ id, code, name: clean(input.name, 'Bank account name'), bankName: clean(input.bankName, 'Bank name'), maskedAccountNumber: input.maskedAccountNumber, ifsc, currency: 'INR', active: true, createdAt: now, version: 1 }); return next;
}

function parseCsv(content: string): string[][] {
  if (content.length > 5_000_000) throw new Error('Bank statement CSV exceeds 5 MB.');
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let index = 0; index < content.length; index += 1) { const char = content[index]!; if (quoted) { if (char === '"' && content[index + 1] === '"') { field += '"'; index += 1; } else if (char === '"') quoted = false; else field += char; } else if (char === '"') quoted = true; else if (char === ',') { row.push(field); field = ''; } else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; } else field += char; }
  if (quoted) throw new Error('Bank statement CSV contains an unclosed quoted field.');
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter((candidate) => candidate.some((value) => value.trim()));
}

export function previewBankStatement(state: RevenueOpsState, input: PreviewBankStatementInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  if (!state.bankAccounts.some(({ id: accountId, active }) => accountId === input.bankAccountId && active)) throw new Error('Active bank account not found.');
  const checksum = digest(input.csvContent.replace(/\r\n/g, '\n'));
  if (state.bankStatementImports.some((item) => item.bankAccountId === input.bankAccountId && item.checksum === checksum)) throw new Error('This bank statement file was already imported.');
  const rows = parseCsv(input.csvContent); if (rows.length < 2 || rows.length > 10001) throw new Error('Bank statement requires a header and 1-10,000 rows.');
  const expected = ['transactiondate', 'valuedate', 'description', 'reference', 'debit', 'credit', 'balance']; const header = rows[0]!.map((value) => value.toLowerCase().replace(/[^a-z]/g, ''));
  if (expected.some((value, index) => header[index] !== value)) throw new Error(`Bank CSV columns must be: ${expected.join(', ')}.`);
  const importId = id; const lines: BankStatementLine[] = rows.slice(1).map((values, index) => {
    if (values.length !== expected.length) throw new Error(`Bank row ${index + 2} has ${values.length} columns; expected ${expected.length}.`);
    const transactionDate = validDate(values[0]!.trim(), `Bank row ${index + 2} transaction date`); const valueDate = validDate(values[1]!.trim(), `Bank row ${index + 2} value date`);
    const debit = money(Number(values[4] || 0)); const credit = money(Number(values[5] || 0)); const balance = money(Number(values[6]));
    if (!Number.isFinite(debit) || !Number.isFinite(credit) || !Number.isFinite(balance) || debit < 0 || credit < 0 || (debit > 0) === (credit > 0)) throw new Error(`Bank row ${index + 2} must contain one positive debit or credit and a valid balance.`);
    const description = clean(values[2]!, `Bank row ${index + 2} description`, 2, 500); const reference = values[3]!.trim().slice(0, 200);
    const fingerprint = digest({ bankAccountId: input.bankAccountId, transactionDate, valueDate, description, reference, debit, credit, balance });
    if (state.bankStatementLines.some((item) => item.fingerprint === fingerprint)) throw new Error(`Bank row ${index + 2} duplicates an existing transaction.`);
    const candidates = state.paymentReceipts.filter(({ id: receiptId, status, amount, receivedAt }) => status === 'recorded' && credit === amount && Math.abs(Date.parse(`${transactionDate}T00:00:00.000Z`) - Date.parse(receivedAt)) <= 3 * 86400000 && !state.bankStatementLines.some(({ matchedPaymentReceiptId }) => matchedPaymentReceiptId === receiptId));
    const normalizedReference = reference.toLowerCase().replace(/[^a-z0-9]/g, ''); const best = candidates.sort((left, right) => (normalizedReference.includes(right.reference.toLowerCase().replace(/[^a-z0-9]/g, '')) ? 1 : 0) - (normalizedReference.includes(left.reference.toLowerCase().replace(/[^a-z0-9]/g, '')) ? 1 : 0))[0];
    const referenceMatch = best ? normalizedReference.includes(best.reference.toLowerCase().replace(/[^a-z0-9]/g, '')) : false;
    return { scope: structuredClone(state.scope), id: randomUUID(), statementImportId: importId, transactionDate, valueDate, description, reference, debit, credit, balance, fingerprint, matchStatus: best ? 'suggested' : 'unmatched', suggestedPaymentReceiptId: best?.id, confidence: best ? referenceMatch ? 100 : 70 : undefined, matchReason: best ? referenceMatch ? 'Exact amount, date window and reference token.' : 'Exact amount inside three-day date window.' : undefined, version: 1 };
  });
  for (let index = 1; index < lines.length; index += 1) { const prior = lines[index - 1]!; const current = lines[index]!; if (money(prior.balance - current.debit + current.credit) !== current.balance) throw new Error(`Bank row ${index + 2} does not reconcile to the preceding balance.`); }
  const first = lines[0]!; const openingBalance = money(first.balance + first.debit - first.credit); const closingBalance = lines.at(-1)!.balance;
  const next = mutate(state); next.bankStatementImports.unshift({ scope: structuredClone(state.scope), id: importId, number: fiscalNumber('BNK', state.bankStatementImports.length + 1, lines[0]!.transactionDate), bankAccountId: input.bankAccountId, fileName: clean(input.fileName, 'Bank statement filename', 3, 160), periodFrom: lines.map(({ transactionDate }) => transactionDate).sort()[0]!, periodTo: lines.map(({ transactionDate }) => transactionDate).sort().at(-1)!, openingBalance, closingBalance, rowCount: lines.length, checksum, status: 'preview', importedBy: actorId, importedAt: now, version: 1 }); next.bankStatementLines.unshift(...lines); return next;
}

export function commitBankStatement(state: RevenueOpsState, input: CommitBankStatementInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const record = state.bankStatementImports.find(({ id }) => id === input.id);
  if (!record || record.version !== input.expectedVersion || record.status !== 'preview') throw new Error('Bank statement preview is stale or already committed.');
  const next = mutate(state); next.bankStatementImports = next.bankStatementImports.map((item) => item.id === record.id ? { ...item, status: 'committed', committedBy: actorId, committedAt: now, version: item.version + 1 } : item); return next;
}

export function confirmBankMatch(state: RevenueOpsState, input: ConfirmBankMatchInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const line = state.bankStatementLines.find(({ id }) => id === input.lineId); const receipt = state.paymentReceipts.find(({ id }) => id === input.paymentReceiptId);
  if (!line || line.version !== input.expectedVersion || !['unmatched', 'suggested'].includes(line.matchStatus)) throw new Error('Bank line is stale or already resolved.');
  const lineScope = line.scope ?? state.scope; const receiptScope = receipt?.scope ?? state.scope;
  const statement = state.bankStatementImports.find(({ id }) => id === line.statementImportId);
  const statementScope = statement?.scope ?? state.scope;
  if (![lineScope, receiptScope, statementScope].every((scope) => scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId)) throw new Error('Bank matching is limited to the active company and branch.');
  if (!statement || statement.status !== 'committed') throw new Error('Commit the bank statement before matching.');
  if (line.credit <= 0 || line.debit !== 0) throw new Error('Only positive bank credits can reconcile a payment receipt.');
  if (!receipt || receipt.status !== 'recorded' || line.credit !== receipt.amount) throw new Error('Bank credit and recorded receipt must have the same amount.');
  if (receipt.method === 'cash' || receipt.method === 'store-credit') throw new Error('Cash and store-credit receipts must be reconciled through the counter or customer ledger, not bank evidence.');
  const expectedSettlementAccount = receipt.method === 'upi' ? 'upi-clearing' : receipt.method === 'card' ? 'card-clearing' : 'bank-clearing';
  if (receipt.settlementAccount && receipt.settlementAccount !== expectedSettlementAccount) throw new Error(`Receipt settlement account must be ${expectedSettlementAccount} for ${receipt.method}.`);
  if (receipt.recordedBy === actorId) throw new Error('Payment recorder cannot confirm the same bank match.');
  if (state.bankStatementLines.some(({ matchedPaymentReceiptId }) => matchedPaymentReceiptId === receipt.id)) throw new Error('Payment receipt is already matched to another bank line.');
  const days = Math.abs(Date.parse(`${line.transactionDate}T00:00:00.000Z`) - Date.parse(receipt.receivedAt)) / 86400000; if (days > 7) throw new Error('Bank match date falls outside the seven-day confirmation boundary.');
  const next = mutate(state); next.bankStatementLines = next.bankStatementLines.map((item) => item.id === line.id ? { ...item, matchStatus: 'matched', matchedPaymentReceiptId: receipt.id, matchedBy: actorId, matchedAt: now, confidence: item.suggestedPaymentReceiptId === receipt.id ? item.confidence : 60, matchReason: item.suggestedPaymentReceiptId === receipt.id ? item.matchReason : 'Manually selected exact-amount receipt inside seven-day window.', version: item.version + 1 } : item); next.paymentReceipts = next.paymentReceipts.map((item) => item.id === receipt.id ? { ...item, status: 'reconciled', reconciledBy: actorId, reconciledAt: now, version: item.version + 1 } : item); next.journalDrafts = next.journalDrafts.map((item) => item.sourceType === 'payment' && item.sourceId === receipt.id ? { ...item, status: 'ready', version: item.version + 1 } : item); return next;
}

export function excludeBankLine(state: RevenueOpsState, input: ExcludeBankLineInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const line = state.bankStatementLines.find(({ id }) => id === input.lineId);
  if (!line || line.version !== input.expectedVersion || !['unmatched', 'suggested'].includes(line.matchStatus)) throw new Error('Bank line is stale or already resolved.');
  const next = mutate(state); next.bankStatementLines = next.bankStatementLines.map((item) => item.id === line.id ? { ...item, matchStatus: 'excluded', exclusionReason: `${clean(input.reason, 'Exclusion reason', 4, 300)} [${actorId} @ ${now}]`, suggestedPaymentReceiptId: undefined, confidence: undefined, version: item.version + 1 } : item); return next;
}
