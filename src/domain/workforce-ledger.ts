import { randomUUID } from 'node:crypto';
import type {
  AcknowledgePayslipInput,
  AttendanceRecord,
  AttendanceStatus,
  CreateLeaveApplicationInput,
  CreateLeaveTypeInput,
  CreatePayrollAdjustmentInput,
  CreateTaxDeclarationInput,
  DecideAttendanceInput,
  DecideLeaveApplicationInput,
  DecideLeaveTypeInput,
  DecidePayrollAdjustmentInput,
  DecideTaxDeclarationInput,
  LeaveApplication,
  LeaveType,
  PayrollAdjustment,
  PublishPayslipInput,
  RecordAttendanceInput,
  TaxDeclaration,
} from '../shared/payroll-contracts';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

const mutate = (state: RevenueOpsState): RevenueOpsState => { const next = structuredClone(state); next.revision += 1; return next; };
const money = (value: number): number => Math.round(value * 100) / 100;
const clean = (value: string, label: string, min = 2, max = 500): string => { const normalized = value.trim().replace(/\s+/g, ' '); if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`); return normalized; };
const validDate = (value: string, label: string): string => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) throw new Error(`${label} must use YYYY-MM-DD.`); return value; };
const fiscalNumber = (prefix: string, sequence: number, at: string): string => { const date = new Date(`${at.slice(0, 10)}T00:00:00.000Z`); const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1; return `${prefix}-${String(year).slice(-2)}-${String(year + 1).slice(-2)}-${String(sequence).padStart(5, '0')}`; };
const effective = (from: string, to: string | undefined, date: string): boolean => from <= date && (!to || date <= to);
const overlaps = (leftFrom: string, leftTo: string | undefined, rightFrom: string, rightTo: string | undefined): boolean => leftFrom <= (rightTo ?? '9999-12-31') && rightFrom <= (leftTo ?? '9999-12-31');
const payableFraction: Record<AttendanceStatus, number> = { present: 1, absent: 0, 'half-day': 0.5, 'paid-leave': 1, 'unpaid-leave': 0, holiday: 1, 'weekly-off': 1 };

function activeProfile(state: RevenueOpsState, workforceProfileId: string) {
  const profile = state.workforceProfiles.find((item) => item.id === workforceProfileId && item.status === 'active');
  if (!profile) throw new Error('This action requires an active workforce profile.');
  return profile;
}

function activeEmployee(state: RevenueOpsState, workforceProfileId: string) {
  const profile = activeProfile(state, workforceProfileId);
  if (profile.employmentType !== 'employee') throw new Error('This payroll action requires an active employee workforce profile.');
  return profile;
}

function fiscalYearStart(date: string): number { const year = Number(date.slice(0, 4)); return Number(date.slice(5, 7)) >= 4 ? year : year - 1; }

function leaveTypeFor(state: RevenueOpsState, id: string, date: string): LeaveType {
  const leaveType = state.leaveTypes.find((item) => item.id === id && item.status === 'active' && effective(item.effectiveFrom, item.effectiveTo, date));
  if (!leaveType) throw new Error('Leave type is inactive or unavailable for the requested period.');
  return leaveType;
}

export function recordAttendance(state: RevenueOpsState, input: RecordAttendanceInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const profile = activeProfile(state, input.workforceProfileId); const attendanceDate = validDate(input.attendanceDate, 'Attendance date');
  if (input.source === 'self-attested' && profile.userId !== actorId) throw new Error('Only the workforce member can self-attest their attendance.');
  if (input.source !== 'self-attested' && profile.userId === actorId) throw new Error('Use self-attested attendance for your own record.');
  if (state.attendanceRecords.some((item) => item.workforceProfileId === profile.id && item.attendanceDate === attendanceDate && item.statusReview !== 'rejected')) throw new Error('Only one current attendance record is allowed per workforce member and day.');
  if (input.status === 'paid-leave' || input.status === 'unpaid-leave') {
    const leave = state.leaveApplications.find((item) => item.workforceProfileId === profile.id && item.status === 'approved' && item.startDate <= attendanceDate && attendanceDate <= item.endDate);
    const leaveType = leave ? state.leaveTypes.find((item) => item.id === leave.leaveTypeId) : undefined;
    if (!leave || !leaveType || (input.status === 'paid-leave') !== leaveType.paid) throw new Error('Paid or unpaid leave attendance requires a matching approved leave application.');
  }
  const record: AttendanceRecord = { id, number: fiscalNumber('ATT', state.attendanceRecords.length + 1, attendanceDate), workforceProfileId: profile.id, userId: profile.userId, attendanceDate, status: input.status, payableFraction: payableFraction[input.status], source: input.source, evidenceReference: clean(input.evidenceReference, 'Attendance evidence reference', 4, 300), statusReview: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.attendanceRecords.unshift(record); return next;
}

export function decideAttendance(state: RevenueOpsState, input: DecideAttendanceInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const record = state.attendanceRecords.find((item) => item.id === input.id);
  if (!record || record.statusReview !== 'submitted' || record.version !== input.expectedVersion) throw new Error('Attendance record is stale or no longer awaiting review.');
  if (record.requestedBy === actorId) throw new Error('Attendance-record maker cannot decide the same record.');
  const next = mutate(state); next.attendanceRecords = next.attendanceRecords.map((item) => item.id === record.id ? { ...item, statusReview: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Attendance decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createLeaveType(state: RevenueOpsState, input: CreateLeaveTypeInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const code = clean(input.code, 'Leave type code', 2, 32).toUpperCase(); const effectiveFrom = validDate(input.effectiveFrom, 'Leave-type effective-from date'); const effectiveTo = input.effectiveTo ? validDate(input.effectiveTo, 'Leave-type effective-to date') : undefined;
  if (!/^[A-Z][A-Z0-9-]*$/.test(code) || state.leaveTypes.some((item) => item.code === code && item.status !== 'rejected')) throw new Error('Leave-type code must be unique and use uppercase letters, digits, or dashes.');
  if (effectiveTo && effectiveTo < effectiveFrom || !Number.isFinite(input.annualEntitlementDays) || input.annualEntitlementDays < 0 || input.annualEntitlementDays > 366) throw new Error('Leave-type date range or annual entitlement is invalid.');
  const leaveType: LeaveType = { id, number: fiscalNumber('LVT', state.leaveTypes.length + 1, effectiveFrom), code, name: clean(input.name, 'Leave type name'), annualEntitlementDays: Number(input.annualEntitlementDays.toFixed(2)), paid: input.paid, effectiveFrom, effectiveTo, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.leaveTypes.unshift(leaveType); return next;
}

export function decideLeaveType(state: RevenueOpsState, input: DecideLeaveTypeInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const leaveType = state.leaveTypes.find((item) => item.id === input.id);
  if (!leaveType || leaveType.status !== 'submitted' || leaveType.version !== input.expectedVersion) throw new Error('Leave type is stale or no longer awaiting review.');
  if (leaveType.requestedBy === actorId) throw new Error('Leave-type maker cannot decide the same leave type.');
  if (input.decision === 'active' && state.leaveTypes.some((item) => item.id !== leaveType.id && item.code === leaveType.code && item.status === 'active' && overlaps(item.effectiveFrom, item.effectiveTo, leaveType.effectiveFrom, leaveType.effectiveTo))) throw new Error('An active leave type already overlaps this leave code.');
  const next = mutate(state); next.leaveTypes = next.leaveTypes.map((item) => item.id === leaveType.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Leave-type decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createLeaveApplication(state: RevenueOpsState, input: CreateLeaveApplicationInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const profile = activeProfile(state, input.workforceProfileId); const startDate = validDate(input.startDate, 'Leave start date'); const endDate = validDate(input.endDate, 'Leave end date');
  if (profile.userId !== actorId || startDate > endDate || fiscalYearStart(startDate) !== fiscalYearStart(endDate) || !Number.isFinite(input.dayCount) || input.dayCount <= 0 || input.dayCount > 366) throw new Error('Leave must be submitted by the workforce member, fit in one fiscal year, and have a valid day count.');
  const daySpan = Math.floor((Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000) + 1;
  if (input.dayCount > daySpan) throw new Error('Leave day count cannot exceed the inclusive requested date range.');
  const leaveType = leaveTypeFor(state, input.leaveTypeId, startDate);
  if (!effective(leaveType.effectiveFrom, leaveType.effectiveTo, endDate) || state.leaveApplications.some((item) => item.workforceProfileId === profile.id && !['rejected', 'cancelled'].includes(item.status) && item.startDate <= endDate && startDate <= item.endDate)) throw new Error('Leave type is not effective for the full request or overlaps another current leave application.');
  const leave: LeaveApplication = { id, number: fiscalNumber('LVE', state.leaveApplications.length + 1, startDate), leaveTypeId: leaveType.id, workforceProfileId: profile.id, userId: profile.userId, startDate, endDate, dayCount: Number(input.dayCount.toFixed(2)), reason: clean(input.reason, 'Leave reason', 4), evidenceReference: input.evidenceReference ? clean(input.evidenceReference, 'Leave evidence reference', 4, 300) : undefined, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.leaveApplications.unshift(leave); return next;
}

export function decideLeaveApplication(state: RevenueOpsState, input: DecideLeaveApplicationInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const leave = state.leaveApplications.find((item) => item.id === input.id);
  if (!leave || leave.version !== input.expectedVersion || !['submitted', 'approved'].includes(leave.status)) throw new Error('Leave application is stale or cannot be decided.');
  if (leave.requestedBy === actorId) throw new Error('Leave-application maker cannot decide the same leave.');
  if (leave.status === 'approved' && input.decision !== 'cancelled') throw new Error('An approved leave application can only be cancelled.');
  if (leave.status === 'submitted' && input.decision === 'approved') {
    const type = leaveTypeFor(state, leave.leaveTypeId, leave.startDate); const used = state.leaveApplications.filter((item) => item.id !== leave.id && item.workforceProfileId === leave.workforceProfileId && item.leaveTypeId === leave.leaveTypeId && item.status === 'approved' && fiscalYearStart(item.startDate) === fiscalYearStart(leave.startDate)).reduce((total, item) => total + item.dayCount, 0);
    if (used + leave.dayCount > type.annualEntitlementDays) throw new Error('Leave approval exceeds the active leave type annual entitlement.');
  }
  const next = mutate(state); next.leaveApplications = next.leaveApplications.map((item) => item.id === leave.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Leave decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createPayrollAdjustment(state: RevenueOpsState, input: CreatePayrollAdjustmentInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const profile = activeEmployee(state, input.workforceProfileId); const payrollPeriod = validDate(input.payrollPeriod, 'Payroll adjustment period');
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000) throw new Error('Payroll adjustment amount is invalid.');
  const adjustment: PayrollAdjustment = { id, number: fiscalNumber('ADJ', state.payrollAdjustments.length + 1, payrollPeriod), workforceProfileId: profile.id, userId: profile.userId, payrollPeriod, kind: input.kind, amount: money(input.amount), reason: clean(input.reason, 'Payroll adjustment reason', 4), evidenceReference: clean(input.evidenceReference, 'Payroll adjustment evidence reference', 4, 300), status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.payrollAdjustments.unshift(adjustment); return next;
}

export function decidePayrollAdjustment(state: RevenueOpsState, input: DecidePayrollAdjustmentInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const adjustment = state.payrollAdjustments.find((item) => item.id === input.id);
  if (!adjustment || adjustment.status !== 'submitted' || adjustment.version !== input.expectedVersion) throw new Error('Payroll adjustment is stale or no longer awaiting review.');
  if (adjustment.requestedBy === actorId) throw new Error('Payroll-adjustment maker cannot decide the same adjustment.');
  const next = mutate(state); next.payrollAdjustments = next.payrollAdjustments.map((item) => item.id === adjustment.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Payroll adjustment decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createTaxDeclaration(state: RevenueOpsState, input: CreateTaxDeclarationInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const profile = activeEmployee(state, input.workforceProfileId); const financialYear = input.financialYear.trim();
  if (profile.userId !== actorId || !/^20\d{2}-\d{2}$/.test(financialYear) || Number(financialYear.slice(5)) !== (Number(financialYear.slice(2, 4)) + 1) % 100 || !input.items.length || input.items.length > 50) throw new Error('Tax declaration requires the employee, a valid financial year, and 1-50 declaration items.');
  const items = input.items.map((item) => ({ sectionCode: clean(item.sectionCode, 'Tax declaration section', 2, 30).toUpperCase(), declaredAmount: money(item.declaredAmount), evidenceReference: clean(item.evidenceReference, 'Tax declaration evidence reference', 4, 300) }));
  if (items.some((item) => !Number.isFinite(item.declaredAmount) || item.declaredAmount < 0 || item.declaredAmount > 1_000_000_000) || new Set(items.map((item) => item.sectionCode)).size !== items.length) throw new Error('Tax declaration amounts or section codes are invalid.');
  if (state.taxDeclarations.some((item) => item.workforceProfileId === profile.id && item.financialYear === financialYear && item.status === 'submitted')) throw new Error('A tax declaration for this employee and financial year already awaits review.');
  const declaration: TaxDeclaration = { id, number: fiscalNumber('TAX', state.taxDeclarations.length + 1, `${financialYear.slice(0, 4)}-04-01`), workforceProfileId: profile.id, userId: profile.userId, financialYear, taxRegime: input.taxRegime, items, totalDeclaredAmount: money(items.reduce((total, item) => total + item.declaredAmount, 0)), status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 };
  const next = mutate(state); next.taxDeclarations.unshift(declaration); return next;
}

export function decideTaxDeclaration(state: RevenueOpsState, input: DecideTaxDeclarationInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const declaration = state.taxDeclarations.find((item) => item.id === input.id);
  if (!declaration || declaration.status !== 'submitted' || declaration.version !== input.expectedVersion) throw new Error('Tax declaration is stale or no longer awaiting review.');
  if (declaration.requestedBy === actorId) throw new Error('Tax-declaration maker cannot decide the same declaration.');
  const next = mutate(state); if (input.decision === 'verified') next.taxDeclarations = next.taxDeclarations.map((item) => item.workforceProfileId === declaration.workforceProfileId && item.financialYear === declaration.financialYear && item.status === 'verified' ? { ...item, status: 'superseded', version: item.version + 1 } : item);
  next.taxDeclarations = next.taxDeclarations.map((item) => item.id === declaration.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Tax declaration decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function publishPayslip(state: RevenueOpsState, input: PublishPayslipInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const slip = state.payrollSlips.find((item) => item.id === input.payrollSlipId && item.status === 'released');
  if (!slip || state.payslipDeliveries.some((item) => item.payrollSlipId === input.payrollSlipId && item.status !== 'failed')) throw new Error('Only a released slip without a current delivery record can be published.');
  const delivery = { id, number: fiscalNumber('PSL', state.payslipDeliveries.length + 1, now.slice(0, 10)), payrollSlipId: slip.id, payrollRunId: slip.payrollRunId, workforceProfileId: slip.workforceProfileId, userId: slip.userId, channel: input.channel, status: 'available' as const, documentReference: clean(input.documentReference, 'Payslip document reference', 4, 300), publishedBy: actorId, publishedAt: now, version: 1 };
  const next = mutate(state); next.payslipDeliveries.unshift(delivery); return next;
}

export function acknowledgePayslip(state: RevenueOpsState, input: AcknowledgePayslipInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const delivery = state.payslipDeliveries.find((item) => item.id === input.id);
  if (!delivery || delivery.userId !== actorId || delivery.status !== 'available' || delivery.version !== input.expectedVersion) throw new Error('Only the payslip recipient can acknowledge the current secure delivery.');
  const next = mutate(state); next.payslipDeliveries = next.payslipDeliveries.map((item) => item.id === delivery.id ? { ...item, status: 'acknowledged', acknowledgedAt: now, version: item.version + 1 } : item); return next;
}
