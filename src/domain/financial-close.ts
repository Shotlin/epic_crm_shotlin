import { createHash, randomUUID } from 'node:crypto';
import type {
  AccountingClosePeriod,
  ConsumeServiceEntitlementInput,
  CreateAccountingClosePeriodInput,
  CreateProjectBillingClaimInput,
  CreateProjectBillingPlanInput,
  DecideAccountingClosePeriodInput,
  DecideProjectBillingClaimInput,
  DecideProjectBillingPlanInput,
  ProjectBillingClaim,
  ProjectBillingPlan,
  ReopenAccountingClosePeriodInput,
  RevenueRecognitionEvent,
  ServiceEntitlementUsage,
} from '../shared/financial-close-contracts';
import type { AccountingJournalDraft, JournalLine, RevenueOpsState } from '../shared/revenue-ops-contracts';

const money = (value: number): number => Math.round(value * 100) / 100;
const mutate = (state: RevenueOpsState): RevenueOpsState => { const next = structuredClone(state); next.revision += 1; return next; };
const clean = (value: string, label: string, min = 2, max = 500): string => { const normalized = value.trim().replace(/\s+/g, ' '); if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`); return normalized; };
const validDate = (value: string, label: string): string => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) throw new Error(`${label} must use YYYY-MM-DD.`); return value; };
const fiscalNumber = (prefix: string, sequence: number, at: string): string => { const date = new Date(`${at.slice(0, 10)}T00:00:00.000Z`); const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1; return `${prefix}-${String(year).slice(-2)}-${String(year + 1).slice(-2)}-${String(sequence).padStart(5, '0')}`; };
const datesOverlap = (leftFrom: string, leftTo: string, rightFrom: string, rightTo: string): boolean => leftFrom <= rightTo && rightFrom <= leftTo;

function journal(sourceId: string, sourceNumber: string, postingDate: string, lines: JournalLine[], id: string = randomUUID()): AccountingJournalDraft {
  const normalized = lines.map((line) => ({ ...line, debit: money(line.debit), credit: money(line.credit) }));
  const totalDebit = money(normalized.reduce((total, line) => total + line.debit, 0));
  const totalCredit = money(normalized.reduce((total, line) => total + line.credit, 0));
  if (totalDebit !== totalCredit) throw new Error('Revenue-recognition journal must balance.');
  const unsigned = { sourceType: 'revenue-recognition' as const, sourceId, sourceNumber, postingDate, lines: normalized, totalDebit, totalCredit };
  return { id, ...unsigned, status: 'ready', checksum: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'), version: 1 };
}

function closedPeriod(state: RevenueOpsState, date: string): AccountingClosePeriod | undefined {
  return state.accountingClosePeriods.find((period) => period.status === 'closed' && period.periodFrom <= date && date <= period.periodTo);
}

function planFor(state: RevenueOpsState, id: string): ProjectBillingPlan {
  const plan = state.projectBillingPlans.find((item) => item.id === id);
  if (!plan) throw new Error('Project billing plan not found.');
  return plan;
}

export function createProjectBillingPlan(state: RevenueOpsState, input: CreateProjectBillingPlanInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const project = state.deliveryProjects.find((item) => item.id === input.projectId && ['active', 'on-hold'].includes(item.status));
  const order = state.salesOrders.find((item) => item.id === input.salesOrderId && item.status !== 'cancelled');
  const line = order?.lines.find((item) => item.id === input.salesOrderLineId);
  if (!project || !order || !line || project.salesOrderId !== order.id || (project.accountId && project.accountId !== order.accountId)) throw new Error('Billing plan must point to the project’s active sales order and order line.');
  if (actorId !== project.managerUserId) throw new Error('Only the project manager can submit a billing plan.');
  const product = line.catalogProductId ? state.products.find((item) => item.id === line.catalogProductId) : undefined;
  if (product?.kind === 'goods') throw new Error('Project billing plans can only reference service lines.');
  const effectiveFrom = validDate(input.effectiveFrom, 'Billing-plan effective-from date');
  const effectiveTo = validDate(input.effectiveTo, 'Billing-plan effective-to date');
  if (effectiveFrom > effectiveTo || effectiveFrom < project.startDate || effectiveTo > project.targetDate || !Number.isFinite(input.billRate) || input.billRate < 0 || input.billRate > 1_000_000_000) throw new Error('Billing plan dates or rate are invalid.');
  if (input.billingModel === 'time-and-materials' && input.billRate <= 0) throw new Error('Time-and-materials billing requires a positive hourly bill rate.');
  if (input.billingModel === 'milestone' && input.billRate !== 0) throw new Error('Milestone billing must use the contracted order-line value, not an hourly bill rate.');
  const plan: ProjectBillingPlan = { id, number: fiscalNumber('BPL', state.projectBillingPlans.length + 1, effectiveFrom), projectId: project.id, salesOrderId: order.id, salesOrderLineId: line.id, billingModel: input.billingModel, billRate: money(input.billRate), effectiveFrom, effectiveTo, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.projectBillingPlans.unshift(plan); return next;
}

export function decideProjectBillingPlan(state: RevenueOpsState, input: DecideProjectBillingPlanInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const plan = planFor(state, input.id);
  if (plan.status !== 'submitted' || plan.version !== input.expectedVersion) throw new Error('Billing plan is stale or no longer awaiting approval.');
  if (plan.requestedBy === actorId) throw new Error('Billing-plan maker cannot decide the same plan.');
  if (input.decision === 'active' && state.projectBillingPlans.some((item) => item.id !== plan.id && item.status === 'active' && item.projectId === plan.projectId && item.salesOrderLineId === plan.salesOrderLineId && datesOverlap(item.effectiveFrom, item.effectiveTo, plan.effectiveFrom, plan.effectiveTo))) throw new Error('An active billing plan already overlaps this project order line.');
  const next = mutate(state); next.projectBillingPlans = next.projectBillingPlans.map((item) => item.id === plan.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Billing-plan decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createProjectBillingClaim(state: RevenueOpsState, input: CreateProjectBillingClaimInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const plan = planFor(state, input.planId);
  const project = state.deliveryProjects.find((item) => item.id === plan.projectId);
  if (plan.status !== 'active' || !project || actorId !== project.managerUserId) throw new Error('Only the project manager can submit a claim against an active billing plan.');
  const billingPeriodFrom = validDate(input.billingPeriodFrom, 'Claim period-from date');
  const billingPeriodTo = validDate(input.billingPeriodTo, 'Claim period-to date');
  if (billingPeriodFrom > billingPeriodTo || billingPeriodFrom < plan.effectiveFrom || billingPeriodTo > plan.effectiveTo) throw new Error('Billing claim period must fall inside the active billing plan.');
  const timeEntryIds = [...new Set(input.timeEntryIds)];
  const milestoneIds = [...new Set(input.milestoneIds)];
  let recognizedAmount = 0;
  if (plan.billingModel === 'time-and-materials') {
    if (!timeEntryIds.length || milestoneIds.length) throw new Error('Time-and-materials claims require approved billable time entries only.');
    const entries = timeEntryIds.map((entryId) => state.timeEntries.find((item) => item.id === entryId));
    if (entries.some((entry) => !entry || entry.status !== 'approved' || !entry.billable || entry.projectId !== plan.projectId || entry.workDate < billingPeriodFrom || entry.workDate > billingPeriodTo)) throw new Error('Every time entry must be approved, billable, project-matched, and inside the claim period.');
    if (state.projectBillingClaims.some((claim) => claim.status !== 'rejected' && claim.timeEntryIds.some((entryId) => timeEntryIds.includes(entryId)))) throw new Error('A selected time entry is already governed by another billing claim.');
    recognizedAmount = money(entries.reduce((total, entry) => total + entry!.hours * plan.billRate, 0));
  } else {
    if (!milestoneIds.length || timeEntryIds.length) throw new Error('Milestone claims require accepted service milestones only.');
    const milestones = milestoneIds.map((milestoneId) => state.serviceMilestones.find((item) => item.id === milestoneId));
    if (milestones.some((milestone) => !milestone || milestone.status !== 'accepted' || milestone.salesOrderId !== plan.salesOrderId || milestone.lineId !== plan.salesOrderLineId)) throw new Error('Every milestone must be accepted and belong to the plan’s order line.');
    if (state.projectBillingClaims.some((claim) => claim.status !== 'rejected' && claim.milestoneIds.some((milestoneId) => milestoneIds.includes(milestoneId)))) throw new Error('A selected milestone is already governed by another billing claim.');
    const line = state.salesOrders.find((item) => item.id === plan.salesOrderId)?.lines.find((item) => item.id === plan.salesOrderLineId);
    if (!line) throw new Error('Billing-plan sales-order line is no longer available.');
    recognizedAmount = money(milestones.reduce((total, milestone) => total + line.taxableValue * milestone!.percentage / 100, 0));
  }
  if (recognizedAmount <= 0) throw new Error('Billing claim must recognize a positive amount.');
  const claim: ProjectBillingClaim = { id, number: fiscalNumber('BCL', state.projectBillingClaims.length + 1, billingPeriodTo), planId: plan.id, projectId: plan.projectId, salesOrderId: plan.salesOrderId, salesOrderLineId: plan.salesOrderLineId, billingPeriodFrom, billingPeriodTo, timeEntryIds, milestoneIds, recognizedAmount, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.projectBillingClaims.unshift(claim); return next;
}

export function decideProjectBillingClaim(state: RevenueOpsState, input: DecideProjectBillingClaimInput, actorId: string, id: string = randomUUID(), journalId: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const claim = state.projectBillingClaims.find((item) => item.id === input.id);
  if (!claim || claim.status !== 'submitted' || claim.version !== input.expectedVersion) throw new Error('Billing claim is stale or no longer awaiting recognition.');
  if (claim.requestedBy === actorId) throw new Error('Billing-claim maker cannot recognize the same claim.');
  const recognitionDate = validDate(input.recognitionDate, 'Recognition date');
  if (input.decision === 'recognized' && closedPeriod(state, recognitionDate)) throw new Error('Revenue recognition cannot post into a closed accounting period.');
  const next = mutate(state);
  if (input.decision === 'rejected') {
    next.projectBillingClaims = next.projectBillingClaims.map((item) => item.id === claim.id ? { ...item, status: 'rejected', recognizedBy: actorId, recognizedAt: now, recognitionRemarks: clean(input.remarks, 'Recognition remarks', 4), version: item.version + 1 } : item);
    return next;
  }
  const event: RevenueRecognitionEvent = { id, number: fiscalNumber('RRE', state.revenueRecognitionEvents.length + 1, recognitionDate), claimId: claim.id, projectId: claim.projectId, recognitionDate, amount: claim.recognizedAmount, journalDraftId: journalId, recognizedBy: actorId, recognizedAt: now, version: 1 };
  const draft = journal(claim.id, event.number, recognitionDate, [
    { accountCode: 'unbilled-revenue', debit: claim.recognizedAmount, credit: 0, memo: event.number },
    { accountCode: 'sales-revenue', debit: 0, credit: claim.recognizedAmount, memo: event.number },
  ], journalId);
  next.projectBillingClaims = next.projectBillingClaims.map((item) => item.id === claim.id ? { ...item, status: 'recognized', recognizedBy: actorId, recognizedAt: now, recognitionRemarks: clean(input.remarks, 'Recognition remarks', 4), recognitionEventId: event.id, version: item.version + 1 } : item);
  next.revenueRecognitionEvents.unshift(event);
  next.journalDrafts.unshift(draft);
  return next;
}

export function consumeServiceEntitlement(state: RevenueOpsState, input: ConsumeServiceEntitlementInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const agreement = state.serviceAgreements.find((item) => item.id === input.serviceAgreementId && item.status === 'active');
  const entry = state.timeEntries.find((item) => item.id === input.timeEntryId && item.status === 'approved');
  const project = entry ? state.deliveryProjects.find((item) => item.id === entry.projectId) : undefined;
  if (!agreement || !entry || !project || actorId !== project.managerUserId) throw new Error('Service entitlement consumption requires an active agreement, approved time, and project-manager action.');
  if ((agreement.projectId && agreement.projectId !== project.id) || (project.accountId && project.accountId !== agreement.accountId)) throw new Error('Service agreement does not cover the selected time entry.');
  if (entry.workDate < agreement.effectiveFrom || entry.workDate > agreement.effectiveTo) throw new Error('Time entry falls outside the service agreement coverage period.');
  if (state.serviceEntitlementUsage.some((usage) => usage.timeEntryId === entry.id)) throw new Error('Time entry has already been consumed by a service entitlement.');
  const used = state.serviceEntitlementUsage.filter((usage) => usage.serviceAgreementId === agreement.id).reduce((total, usage) => total + usage.hours, 0);
  const usage: ServiceEntitlementUsage = { id, number: fiscalNumber('ENT', state.serviceEntitlementUsage.length + 1, entry.workDate), serviceAgreementId: agreement.id, timeEntryId: entry.id, projectId: project.id, hours: entry.hours, status: used + entry.hours <= agreement.includedHours ? 'included' : 'overage', consumedBy: actorId, consumedAt: now, version: 1 };
  const next = mutate(state); next.serviceEntitlementUsage.unshift(usage); return next;
}

export function createAccountingClosePeriod(state: RevenueOpsState, input: CreateAccountingClosePeriodInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const periodFrom = validDate(input.periodFrom, 'Close-period from date');
  const periodTo = validDate(input.periodTo, 'Close-period to date');
  if (periodFrom > periodTo) throw new Error('Close-period end date must not precede its start date.');
  if (state.accountingClosePeriods.some((period) => period.status !== 'rejected' && datesOverlap(period.periodFrom, period.periodTo, periodFrom, periodTo))) throw new Error('Accounting close periods cannot overlap.');
  const period: AccountingClosePeriod = { id, number: fiscalNumber('CLS', state.accountingClosePeriods.length + 1, periodTo), name: clean(input.name, 'Close-period name'), periodFrom, periodTo, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.accountingClosePeriods.unshift(period); return next;
}

export function decideAccountingClosePeriod(
  state: RevenueOpsState,
  input: DecideAccountingClosePeriodInput,
  actorId: string,
  now = new Date().toISOString(),
  isJournalCloseComplete: (draft: AccountingJournalDraft) => boolean = (draft) => draft.status === 'exported',
): RevenueOpsState {
  const period = state.accountingClosePeriods.find((item) => item.id === input.id);
  if (!period || period.status !== 'submitted' || period.version !== input.expectedVersion) throw new Error('Accounting close period is stale or no longer awaiting decision.');
  if (period.requestedBy === actorId) throw new Error('Close-period maker cannot decide the same close.');
  if (input.decision === 'closed') {
    const readyJournal = state.journalDrafts.find((draft) => draft.postingDate >= period.periodFrom && draft.postingDate <= period.periodTo && !isJournalCloseComplete(draft));
    const openClaim = state.projectBillingClaims.find((claim) => claim.billingPeriodFrom <= period.periodTo && claim.billingPeriodTo >= period.periodFrom && claim.status === 'submitted');
    const openPayroll = state.payrollRuns.find((run) => run.periodFrom <= period.periodTo && run.periodTo >= period.periodFrom && ['submitted', 'approved'].includes(run.status));
    const approvedExpense = state.expenseClaims.find((expense) => expense.expenseDate >= period.periodFrom && expense.expenseDate <= period.periodTo && expense.status === 'approved');
    const openObligation = state.payrollStatutoryObligations.find((obligation) => {
      const run = state.payrollRuns.find((item) => item.id === obligation.payrollRunId);
      return run && run.paymentDate >= period.periodFrom && run.paymentDate <= period.periodTo && obligation.status !== 'reconciled';
    });
    if (readyJournal) throw new Error(`Close is blocked: journal ${readyJournal.sourceNumber} must be exported first.`);
    if (openClaim) throw new Error(`Close is blocked: billing claim ${openClaim.number} still awaits recognition.`);
    if (openPayroll) throw new Error(`Close is blocked: payroll run ${openPayroll.number} still awaits finalization.`);
    if (approvedExpense) throw new Error(`Close is blocked: expense claim ${approvedExpense.number} still awaits reimbursement.`);
    if (openObligation) throw new Error(`Close is blocked: payroll obligation ${openObligation.number} still awaits reconciliation.`);
  }
  const next = mutate(state); next.accountingClosePeriods = next.accountingClosePeriods.map((item) => item.id === period.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Close-period decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function reopenAccountingClosePeriod(state: RevenueOpsState, input: ReopenAccountingClosePeriodInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const period = state.accountingClosePeriods.find((item) => item.id === input.id);
  if (!period || period.status !== 'closed' || period.version !== input.expectedVersion) throw new Error('Only the current closed accounting period can be reopened.');
  if (period.decidedBy === actorId) throw new Error('Close-period approver cannot reopen the same period.');
  const next = mutate(state); next.accountingClosePeriods = next.accountingClosePeriods.map((item) => item.id === period.id ? { ...item, status: 'reopened', reopenedBy: actorId, reopenedAt: now, reopenReason: clean(input.reason, 'Close-period reopen reason', 4), version: item.version + 1 } : item); return next;
}
