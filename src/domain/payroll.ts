import { createHash, randomUUID } from 'node:crypto';
import type {
  BenefitEnrollment,
  BenefitPlan,
  CreateBenefitEnrollmentInput,
  CreateBenefitPlanInput,
  CreateEmployerRegistrationInput,
  CreateExpenseClaimInput,
  CreatePayrollCompensationInput,
  CreatePayrollPolicyInput,
  CreatePayrollRunInput,
  DecideBenefitEnrollmentInput,
  DecideBenefitPlanInput,
  DecideEmployerRegistrationInput,
  DecideExpenseClaimInput,
  DecidePayrollCompensationInput,
  DecidePayrollPolicyInput,
  DecidePayrollRunInput,
  EmployerAuthority,
  EmployerRegistration,
  ExpenseClaim,
  FinalizePayrollRunInput,
  PayrollCompensation,
  PayrollAdjustment,
  PayrollPolicy,
  PayrollRun,
  PayrollSlip,
  PayrollSlipLine,
  PayrollStatutoryObligation,
  ReimburseExpenseClaimInput,
  UpdatePayrollObligationInput,
} from '../shared/payroll-contracts';
import type { AccountingJournalDraft, JournalLine, RevenueOpsState } from '../shared/revenue-ops-contracts';

const money = (value: number): number => Math.round(value * 100) / 100;
const mutate = (state: RevenueOpsState): RevenueOpsState => { const next = structuredClone(state); next.revision += 1; return next; };
const clean = (value: string, label: string, min = 2, max = 500): string => { const normalized = value.trim().replace(/\s+/g, ' '); if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`); return normalized; };
const validDate = (value: string, label: string): string => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) throw new Error(`${label} must use YYYY-MM-DD.`); return value; };
const validDateRange = (from: string, to: string | undefined, label: string): { from: string; to?: string } => { const start = validDate(from, `${label} effective-from date`); const end = to ? validDate(to, `${label} effective-to date`) : undefined; if (end && end < start) throw new Error(`${label} end date must not precede its start date.`); return { from: start, to: end }; };
const fiscalNumber = (prefix: string, sequence: number, at: string): string => { const date = new Date(`${at.slice(0, 10)}T00:00:00.000Z`); const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1; return `${prefix}-${String(year).slice(-2)}-${String(year + 1).slice(-2)}-${String(sequence).padStart(5, '0')}`; };
const isEffective = (from: string, to: string | undefined, date: string): boolean => from <= date && (!to || date <= to);
const datesOverlap = (leftFrom: string, leftTo: string | undefined, rightFrom: string, rightTo: string | undefined): boolean => leftFrom <= (rightTo ?? '9999-12-31') && rightFrom <= (leftTo ?? '9999-12-31');

function activeEmployee(state: RevenueOpsState, workforceProfileId: string) {
  const profile = state.workforceProfiles.find((item) => item.id === workforceProfileId && item.status === 'active' && item.employmentType === 'employee');
  if (!profile) throw new Error('Payroll requires an active employee workforce profile.');
  return profile;
}

function currentCompensation(state: RevenueOpsState, workforceProfileId: string, date: string): PayrollCompensation {
  const compensation = state.payrollCompensations.find((item) => item.workforceProfileId === workforceProfileId && item.status === 'active' && isEffective(item.effectiveFrom, item.effectiveTo, date));
  if (!compensation) throw new Error('Each payroll employee needs an active compensation schedule covering the payroll period.');
  return compensation;
}

function closedPeriod(state: RevenueOpsState, date: string): boolean {
  return state.accountingClosePeriods.some((period) => period.status === 'closed' && period.periodFrom <= date && date <= period.periodTo);
}

function journal(sourceType: AccountingJournalDraft['sourceType'], sourceId: string, sourceNumber: string, postingDate: string, lines: JournalLine[], id: string = randomUUID()): AccountingJournalDraft {
  const normalized = lines.filter((line) => line.debit || line.credit).map((line) => ({ ...line, debit: money(line.debit), credit: money(line.credit) }));
  const totalDebit = money(normalized.reduce((total, line) => total + line.debit, 0));
  const totalCredit = money(normalized.reduce((total, line) => total + line.credit, 0));
  if (totalDebit !== totalCredit) throw new Error('Payroll journal must balance.');
  const unsigned = { sourceType, sourceId, sourceNumber, postingDate, lines: normalized, totalDebit, totalCredit };
  return { id, ...unsigned, status: 'ready', checksum: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'), version: 1 };
}

function activePolicies(state: RevenueOpsState, date: string): PayrollPolicy[] {
  return state.payrollPolicies.filter((item) => item.status === 'active' && isEffective(item.effectiveFrom, item.effectiveTo, date));
}

function registrationFor(state: RevenueOpsState, authority: EmployerAuthority, date: string): EmployerRegistration {
  const registration = state.employerRegistrations.find((item) => item.authority === authority && item.status === 'active' && isEffective(item.effectiveFrom, item.effectiveTo, date));
  if (!registration) throw new Error(`An active ${authority} employer registration is required before payroll can be finalized.`);
  return registration;
}

export function createEmployerRegistration(state: RevenueOpsState, input: CreateEmployerRegistrationInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const registrationCode = clean(input.registrationCode, 'Employer registration code', 3, 80).toUpperCase();
  const range = validDateRange(input.effectiveFrom, input.effectiveTo, 'Employer registration');
  if (state.employerRegistrations.some((item) => item.authority === input.authority && item.registrationCode === registrationCode && item.status !== 'rejected')) throw new Error('This employer registration is already recorded.');
  const registration: EmployerRegistration = { id, number: fiscalNumber('REG', state.employerRegistrations.length + 1, range.from), authority: input.authority, registrationCode, legalEntityName: clean(input.legalEntityName, 'Legal entity name'), effectiveFrom: range.from, effectiveTo: range.to, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.employerRegistrations.unshift(registration); return next;
}

export function decideEmployerRegistration(state: RevenueOpsState, input: DecideEmployerRegistrationInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const registration = state.employerRegistrations.find((item) => item.id === input.id);
  if (!registration || registration.status !== 'submitted' || registration.version !== input.expectedVersion) throw new Error('Employer registration is stale or no longer awaiting review.');
  if (registration.requestedBy === actorId) throw new Error('Employer-registration maker cannot decide the same registration.');
  if (input.decision === 'active' && state.employerRegistrations.some((item) => item.id !== registration.id && item.authority === registration.authority && item.status === 'active' && datesOverlap(item.effectiveFrom, item.effectiveTo, registration.effectiveFrom, registration.effectiveTo))) throw new Error('An active registration already overlaps this authority period.');
  const next = mutate(state); next.employerRegistrations = next.employerRegistrations.map((item) => item.id === registration.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Registration decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createPayrollPolicy(state: RevenueOpsState, input: CreatePayrollPolicyInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const code = clean(input.code, 'Payroll policy code', 2, 32).toUpperCase();
  const range = validDateRange(input.effectiveFrom, input.effectiveTo, 'Payroll policy');
  if (!/^[A-Z][A-Z0-9-]*$/.test(code) || state.payrollPolicies.some((item) => item.code === code && item.status !== 'rejected')) throw new Error('Payroll policy code must be unique and use uppercase letters, digits, or dashes.');
  if (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > 1_000_000_000 || (input.calculationMethod === 'percentage' && input.rate > 100) || (input.wageCeiling !== undefined && (!Number.isFinite(input.wageCeiling) || input.wageCeiling <= 0 || input.wageCeiling > 1_000_000_000))) throw new Error('Payroll policy rate or wage ceiling is invalid.');
  if (input.requiredForFinalization && !input.authority) throw new Error('A required payroll policy must name its authoritative employer registration boundary.');
  const policy: PayrollPolicy = { id, number: fiscalNumber('POL', state.payrollPolicies.length + 1, range.from), code, name: clean(input.name, 'Payroll policy name'), authority: input.authority, componentKind: input.componentKind, calculationBase: input.calculationBase, calculationMethod: input.calculationMethod, rate: money(input.rate), wageCeiling: input.wageCeiling === undefined ? undefined : money(input.wageCeiling), effectiveFrom: range.from, effectiveTo: range.to, sourceReference: clean(input.sourceReference, 'Policy source reference', 8, 500), requiredForFinalization: input.requiredForFinalization, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.payrollPolicies.unshift(policy); return next;
}

export function decidePayrollPolicy(state: RevenueOpsState, input: DecidePayrollPolicyInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const policy = state.payrollPolicies.find((item) => item.id === input.id);
  if (!policy || policy.status !== 'submitted' || policy.version !== input.expectedVersion) throw new Error('Payroll policy is stale or no longer awaiting review.');
  if (policy.requestedBy === actorId) throw new Error('Payroll-policy maker cannot decide the same policy.');
  if (input.decision === 'active' && state.payrollPolicies.some((item) => item.id !== policy.id && item.code === policy.code && item.status === 'active' && datesOverlap(item.effectiveFrom, item.effectiveTo, policy.effectiveFrom, policy.effectiveTo))) throw new Error('An active policy already overlaps this policy code.');
  const next = mutate(state); next.payrollPolicies = next.payrollPolicies.map((item) => item.id === policy.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Policy decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createPayrollCompensation(state: RevenueOpsState, input: CreatePayrollCompensationInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const profile = activeEmployee(state, input.workforceProfileId); const range = validDateRange(input.effectiveFrom, input.effectiveTo, 'Compensation');
  if (!Number.isFinite(input.monthlyBasic) || input.monthlyBasic < 0 || !Number.isFinite(input.monthlyAllowances) || input.monthlyAllowances < 0 || input.monthlyBasic + input.monthlyAllowances <= 0 || input.monthlyBasic + input.monthlyAllowances > 1_000_000_000) throw new Error('Monthly basic and allowances must form a positive valid compensation.');
  const compensation: PayrollCompensation = { id, number: fiscalNumber('CMP', state.payrollCompensations.length + 1, range.from), workforceProfileId: profile.id, userId: profile.userId, monthlyBasic: money(input.monthlyBasic), monthlyAllowances: money(input.monthlyAllowances), paymentMethod: input.paymentMethod, paymentReferenceToken: clean(input.paymentReferenceToken, 'Payment reference token', 4, 160), effectiveFrom: range.from, effectiveTo: range.to, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.payrollCompensations.unshift(compensation); return next;
}

export function decidePayrollCompensation(state: RevenueOpsState, input: DecidePayrollCompensationInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const compensation = state.payrollCompensations.find((item) => item.id === input.id);
  if (!compensation || compensation.status !== 'submitted' || compensation.version !== input.expectedVersion) throw new Error('Compensation schedule is stale or no longer awaiting review.');
  if (compensation.requestedBy === actorId) throw new Error('Compensation-schedule maker cannot decide the same schedule.');
  if (input.decision === 'active' && state.payrollCompensations.some((item) => item.id !== compensation.id && item.workforceProfileId === compensation.workforceProfileId && item.status === 'active' && datesOverlap(item.effectiveFrom, item.effectiveTo, compensation.effectiveFrom, compensation.effectiveTo))) throw new Error('An active compensation schedule already overlaps this employee period.');
  const next = mutate(state); next.payrollCompensations = next.payrollCompensations.map((item) => item.id === compensation.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Compensation decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createBenefitPlan(state: RevenueOpsState, input: CreateBenefitPlanInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const code = clean(input.code, 'Benefit plan code', 2, 32).toUpperCase(); const range = validDateRange(input.effectiveFrom, input.effectiveTo, 'Benefit plan');
  if (!/^[A-Z][A-Z0-9-]*$/.test(code) || state.benefitPlans.some((item) => item.code === code && item.status !== 'rejected')) throw new Error('Benefit-plan code must be unique and use uppercase letters, digits, or dashes.');
  if (![input.employerMonthlyCost, input.employeeMonthlyContribution].every((value) => Number.isFinite(value) && value >= 0 && value <= 1_000_000_000)) throw new Error('Benefit costs are invalid.');
  const plan: BenefitPlan = { id, number: fiscalNumber('BEN', state.benefitPlans.length + 1, range.from), code, name: clean(input.name, 'Benefit plan name'), category: input.category, employerMonthlyCost: money(input.employerMonthlyCost), employeeMonthlyContribution: money(input.employeeMonthlyContribution), effectiveFrom: range.from, effectiveTo: range.to, providerReference: clean(input.providerReference, 'Benefit provider reference', 4, 300), status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.benefitPlans.unshift(plan); return next;
}

export function decideBenefitPlan(state: RevenueOpsState, input: DecideBenefitPlanInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const plan = state.benefitPlans.find((item) => item.id === input.id);
  if (!plan || plan.status !== 'submitted' || plan.version !== input.expectedVersion) throw new Error('Benefit plan is stale or no longer awaiting review.');
  if (plan.requestedBy === actorId) throw new Error('Benefit-plan maker cannot decide the same plan.');
  const next = mutate(state); next.benefitPlans = next.benefitPlans.map((item) => item.id === plan.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Benefit decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createBenefitEnrollment(state: RevenueOpsState, input: CreateBenefitEnrollmentInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const profile = activeEmployee(state, input.workforceProfileId); const plan = state.benefitPlans.find((item) => item.id === input.benefitPlanId && item.status === 'active');
  if (!plan || actorId !== profile.userId) throw new Error('Only an active employee can request an active benefit plan for themselves.');
  const effectiveFrom = validDate(input.effectiveFrom, 'Benefit enrollment effective-from date');
  if (!isEffective(plan.effectiveFrom, plan.effectiveTo, effectiveFrom) || state.benefitEnrollments.some((item) => item.workforceProfileId === profile.id && item.benefitPlanId === plan.id && !['rejected', 'cancelled'].includes(item.status))) throw new Error('Benefit plan is unavailable or already has a current enrollment.');
  const enrollment: BenefitEnrollment = { id, number: fiscalNumber('ENR', state.benefitEnrollments.length + 1, effectiveFrom), benefitPlanId: plan.id, workforceProfileId: profile.id, userId: profile.userId, effectiveFrom, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.benefitEnrollments.unshift(enrollment); return next;
}

export function decideBenefitEnrollment(state: RevenueOpsState, input: DecideBenefitEnrollmentInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const enrollment = state.benefitEnrollments.find((item) => item.id === input.id);
  if (!enrollment || !['submitted', 'active'].includes(enrollment.status) || enrollment.version !== input.expectedVersion) throw new Error('Benefit enrollment is stale or cannot be decided.');
  if (enrollment.requestedBy === actorId) throw new Error('Benefit-enrollment maker cannot decide the same enrollment.');
  if (enrollment.status === 'active' && input.decision !== 'cancelled') throw new Error('An active benefit enrollment can only be cancelled.');
  const next = mutate(state); next.benefitEnrollments = next.benefitEnrollments.map((item) => item.id === enrollment.id ? { ...item, status: input.decision, effectiveTo: input.decision === 'cancelled' ? now.slice(0, 10) : item.effectiveTo, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Benefit enrollment decision remarks', 4), version: item.version + 1 } : item); return next;
}

function slipFor(state: RevenueOpsState, runId: string, profileId: string, periodTo: string, policies: PayrollPolicy[], adjustments: PayrollAdjustment[], id: string): PayrollSlip {
  const profile = activeEmployee(state, profileId); const compensation = currentCompensation(state, profile.id, periodTo);
  const lines: PayrollSlipLine[] = [
    { code: 'BASIC', label: 'Monthly basic', kind: 'earning', amount: compensation.monthlyBasic, sourceType: 'compensation', sourceId: compensation.id },
    { code: 'ALLOW', label: 'Monthly allowances', kind: 'earning', amount: compensation.monthlyAllowances, sourceType: 'compensation', sourceId: compensation.id },
  ];
  const arrears = adjustments.filter((adjustment) => adjustment.kind === 'arrear-earning');
  const recoveries = adjustments.filter((adjustment) => adjustment.kind === 'recovery-deduction');
  const grossPay = money(compensation.monthlyBasic + compensation.monthlyAllowances + arrears.reduce((total, adjustment) => total + adjustment.amount, 0));
  for (const policy of policies) {
    const basis = policy.calculationBase === 'basic' ? compensation.monthlyBasic : grossPay;
    const cappedBasis = policy.wageCeiling === undefined ? basis : Math.min(basis, policy.wageCeiling);
    const amount = money(policy.calculationMethod === 'percentage' ? cappedBasis * policy.rate / 100 : policy.rate);
    if (amount) lines.push({ code: policy.code, label: policy.name, kind: policy.componentKind, amount, sourceType: 'policy', sourceId: policy.id });
  }
  for (const adjustment of arrears) lines.push({ code: 'ARREAR', label: adjustment.reason, kind: 'earning', amount: adjustment.amount, sourceType: 'adjustment', sourceId: adjustment.id });
  for (const adjustment of recoveries) lines.push({ code: 'RECOVERY', label: adjustment.reason, kind: 'employee-deduction', amount: adjustment.amount, sourceType: 'adjustment', sourceId: adjustment.id });
  const enrollments = state.benefitEnrollments.filter((item) => item.workforceProfileId === profile.id && item.status === 'active' && isEffective(item.effectiveFrom, item.effectiveTo, periodTo));
  for (const enrollment of enrollments) {
    const plan = state.benefitPlans.find((item) => item.id === enrollment.benefitPlanId && item.status === 'active' && isEffective(item.effectiveFrom, item.effectiveTo, periodTo));
    if (!plan) continue;
    if (plan.employeeMonthlyContribution) lines.push({ code: `${plan.code}-EE`, label: `${plan.name} employee contribution`, kind: 'employee-deduction', amount: plan.employeeMonthlyContribution, sourceType: 'benefit', sourceId: plan.id });
    if (plan.employerMonthlyCost) lines.push({ code: `${plan.code}-ER`, label: `${plan.name} employer cost`, kind: 'employer-contribution', amount: plan.employerMonthlyCost, sourceType: 'benefit', sourceId: plan.id });
  }
  const employeeDeductions = money(lines.filter((item) => item.kind === 'employee-deduction').reduce((total, item) => total + item.amount, 0));
  const employerContributions = money(lines.filter((item) => item.kind === 'employer-contribution').reduce((total, item) => total + item.amount, 0));
  return { id, number: fiscalNumber('SLP', state.payrollSlips.length + 1, periodTo), payrollRunId: runId, workforceProfileId: profile.id, userId: profile.userId, compensationId: compensation.id, lines, grossPay, employeeDeductions, employerContributions, netPay: money(grossPay - employeeDeductions), status: 'generated', version: 1 };
}

export function createPayrollRun(state: RevenueOpsState, input: CreatePayrollRunInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const periodFrom = validDate(input.periodFrom, 'Payroll period-from date'); const periodTo = validDate(input.periodTo, 'Payroll period-to date'); const paymentDate = validDate(input.paymentDate, 'Payroll payment date');
  if (periodFrom > periodTo || periodFrom.slice(0, 7) !== periodTo.slice(0, 7) || paymentDate < periodTo) throw new Error('Payroll run must cover one calendar month and have a payment date on or after its end.');
  const workforceProfileIds = [...new Set(input.workforceProfileIds)];
  if (!workforceProfileIds.length || workforceProfileIds.length > 2_000) throw new Error('Select 1-2,000 active employee workforce profiles for a payroll run.');
  if (state.payrollRuns.some((run) => !['rejected', 'cancelled'].includes(run.status) && datesOverlap(run.periodFrom, run.periodTo, periodFrom, periodTo) && run.workforceProfileIds.some((profileId) => workforceProfileIds.includes(profileId)))) throw new Error('A current payroll run already overlaps one or more selected employees.');
  const policies = activePolicies(state, periodTo);
  if (!policies.length || !policies.some((policy) => policy.requiredForFinalization)) throw new Error('At least one independently approved, required payroll policy must be active before a payroll run can be submitted.');
  const adjustments = state.payrollAdjustments.filter((adjustment) => adjustment.status === 'approved' && adjustment.payrollPeriod === periodTo && workforceProfileIds.includes(adjustment.workforceProfileId));
  const slips = workforceProfileIds.map((profileId) => slipFor(state, id, profileId, periodTo, policies, adjustments.filter((adjustment) => adjustment.workforceProfileId === profileId), randomUUID()));
  const run: PayrollRun = { id, number: fiscalNumber('PAY', state.payrollRuns.length + 1, periodTo), periodFrom, periodTo, paymentDate, workforceProfileIds, policySnapshots: policies.map((policy) => ({ policyId: policy.id, code: policy.code, sourceReference: policy.sourceReference, version: policy.version })), adjustmentIds: adjustments.map((adjustment) => adjustment.id), slipIds: slips.map((slip) => slip.id), totalGrossPay: money(slips.reduce((total, slip) => total + slip.grossPay, 0)), totalEmployeeDeductions: money(slips.reduce((total, slip) => total + slip.employeeDeductions, 0)), totalEmployerContributions: money(slips.reduce((total, slip) => total + slip.employerContributions, 0)), totalNetPay: money(slips.reduce((total, slip) => total + slip.netPay, 0)), status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.payrollRuns.unshift(run); next.payrollSlips.unshift(...slips); next.payrollAdjustments = next.payrollAdjustments.map((adjustment) => adjustments.some(({ id: adjustmentId }) => adjustmentId === adjustment.id) ? { ...adjustment, status: 'applied', appliedPayrollRunId: id, appliedAt: now, version: adjustment.version + 1 } : adjustment); return next;
}

export function decidePayrollRun(state: RevenueOpsState, input: DecidePayrollRunInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const run = state.payrollRuns.find((item) => item.id === input.id);
  if (!run || run.status !== 'submitted' || run.version !== input.expectedVersion) throw new Error('Payroll run is stale or no longer awaiting approval.');
  if (run.requestedBy === actorId) throw new Error('Payroll-run maker cannot decide the same payroll run.');
  const next = mutate(state); next.payrollRuns = next.payrollRuns.map((item) => item.id === run.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Payroll decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function finalizePayrollRun(state: RevenueOpsState, input: FinalizePayrollRunInput, actorId: string, journalId: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const run = state.payrollRuns.find((item) => item.id === input.id);
  if (!run || run.status !== 'approved' || run.version !== input.expectedVersion || run.decidedBy === actorId) throw new Error('A current approved payroll run must be finalized by an independent finance operator.');
  if (closedPeriod(state, run.paymentDate)) throw new Error('Payroll cannot finalize into a closed accounting period.');
  const snapshotPolicies = run.policySnapshots.map((snapshot) => state.payrollPolicies.find((item) => item.id === snapshot.policyId && item.version === snapshot.version && item.status === 'active'));
  if (snapshotPolicies.some((policy) => !policy)) throw new Error('An approved payroll policy changed after this run was calculated; create a new run.');
  const policies = snapshotPolicies as PayrollPolicy[];
  for (const policy of policies.filter((item) => item.requiredForFinalization && item.authority)) registrationFor(state, policy.authority!, run.periodTo);
  const slips = state.payrollSlips.filter((slip) => slip.payrollRunId === run.id);
  const policyObligations = policies.filter((policy) => policy.authority).map((policy) => {
    const amount = money(slips.flatMap((slip) => slip.lines).filter((line) => line.sourceType === 'policy' && line.sourceId === policy.id).reduce((total, line) => total + line.amount, 0));
    return { policy, amount };
  }).filter(({ amount }) => amount > 0);
  const obligations: PayrollStatutoryObligation[] = policyObligations.map(({ policy, amount }) => { const registration = registrationFor(state, policy.authority!, run.periodTo); return { id: randomUUID(), number: fiscalNumber('OBL', state.payrollStatutoryObligations.length + 1, run.periodTo), payrollRunId: run.id, payrollPolicyId: policy.id, employerRegistrationId: registration.id, authority: policy.authority!, amount, status: 'calculated', updatedBy: actorId, updatedAt: now, version: 1 }; });
  const draft = journal('payroll-finalization', run.id, run.number, run.paymentDate, [
    { accountCode: 'payroll-expense', debit: run.totalGrossPay, credit: 0, memo: run.number },
    { accountCode: 'employer-contribution-expense', debit: run.totalEmployerContributions, credit: 0, memo: run.number },
    { accountCode: 'payroll-payable', debit: 0, credit: run.totalNetPay, memo: run.number },
    { accountCode: 'statutory-payable', debit: 0, credit: money(run.totalEmployeeDeductions + run.totalEmployerContributions), memo: run.number },
  ], journalId);
  const next = mutate(state); next.payrollRuns = next.payrollRuns.map((item) => item.id === run.id ? { ...item, status: 'finalized', finalizedBy: actorId, finalizedAt: now, paymentReference: clean(input.paymentReference, 'Payroll payment reference', 4, 160), journalDraftId: draft.id, version: item.version + 1 } : item); next.payrollSlips = next.payrollSlips.map((slip) => slip.payrollRunId === run.id ? { ...slip, status: 'released', version: slip.version + 1 } : slip); next.payrollStatutoryObligations.unshift(...obligations); next.journalDrafts.unshift(draft); return next;
}

export function updatePayrollObligation(state: RevenueOpsState, input: UpdatePayrollObligationInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const obligation = state.payrollStatutoryObligations.find((item) => item.id === input.id);
  const transitions: Record<PayrollStatutoryObligation['status'], PayrollStatutoryObligation['status'][]> = { calculated: ['reported', 'paid'], reported: ['paid'], paid: ['reconciled'], reconciled: [] };
  if (!obligation || obligation.version !== input.expectedVersion || !transitions[obligation.status].includes(input.status)) throw new Error('Payroll statutory obligation is stale or cannot make that transition.');
  const next = mutate(state); next.payrollStatutoryObligations = next.payrollStatutoryObligations.map((item) => item.id === obligation.id ? { ...item, status: input.status, externalReference: clean(input.externalReference, 'Statutory obligation reference', 4, 160), updatedBy: actorId, updatedAt: now, version: item.version + 1 } : item); return next;
}

export function createExpenseClaim(state: RevenueOpsState, input: CreateExpenseClaimInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const profile = state.workforceProfiles.find((item) => item.id === input.workforceProfileId && item.status === 'active');
  if (!profile || profile.userId !== actorId) throw new Error('Only an active workforce member can submit their own expense claim.');
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000) throw new Error('Expense amount is invalid.');
  const expense: ExpenseClaim = { id, number: fiscalNumber('EXP', state.expenseClaims.length + 1, input.expenseDate), workforceProfileId: profile.id, userId: profile.userId, expenseDate: validDate(input.expenseDate, 'Expense date'), category: input.category, merchant: clean(input.merchant, 'Merchant', 2, 160), amount: money(input.amount), receiptReference: clean(input.receiptReference, 'Receipt reference', 4, 300), businessPurpose: clean(input.businessPurpose, 'Business purpose', 8, 500), status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.expenseClaims.unshift(expense); return next;
}

export function decideExpenseClaim(state: RevenueOpsState, input: DecideExpenseClaimInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const expense = state.expenseClaims.find((item) => item.id === input.id);
  if (!expense || expense.status !== 'submitted' || expense.version !== input.expectedVersion) throw new Error('Expense claim is stale or no longer awaiting approval.');
  if (expense.requestedBy === actorId) throw new Error('Expense-claim maker cannot decide the same claim.');
  const next = mutate(state); next.expenseClaims = next.expenseClaims.map((item) => item.id === expense.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Expense decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function reimburseExpenseClaim(state: RevenueOpsState, input: ReimburseExpenseClaimInput, actorId: string, journalId: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const expense = state.expenseClaims.find((item) => item.id === input.id);
  if (!expense || expense.status !== 'approved' || expense.version !== input.expectedVersion || expense.decidedBy === actorId) throw new Error('An approved expense claim must be reimbursed by an independent finance operator.');
  if (closedPeriod(state, now.slice(0, 10))) throw new Error('Expense reimbursement cannot post into a closed accounting period.');
  const draft = journal('expense-reimbursement', expense.id, expense.number, now.slice(0, 10), [{ accountCode: 'employee-expense', debit: expense.amount, credit: 0, memo: expense.number }, { accountCode: 'cash-at-bank', debit: 0, credit: expense.amount, memo: expense.number }], journalId);
  const next = mutate(state); next.expenseClaims = next.expenseClaims.map((item) => item.id === expense.id ? { ...item, status: 'reimbursed', reimbursedBy: actorId, reimbursedAt: now, paymentReference: clean(input.paymentReference, 'Expense payment reference', 4, 160), journalDraftId: draft.id, version: item.version + 1 } : item); next.journalDrafts.unshift(draft); return next;
}
