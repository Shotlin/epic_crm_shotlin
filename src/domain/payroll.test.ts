import { describe, expect, it } from 'vitest';
import {
  createBenefitEnrollment,
  createBenefitPlan,
  createEmployerRegistration,
  createExpenseClaim,
  createPayrollCompensation,
  createPayrollPolicy,
  createPayrollRun,
  decideBenefitEnrollment,
  decideBenefitPlan,
  decideEmployerRegistration,
  decideExpenseClaim,
  decidePayrollCompensation,
  decidePayrollPolicy,
  decidePayrollRun,
  finalizePayrollRun,
  reimburseExpenseClaim,
  updatePayrollObligation,
} from './payroll';
import { createInitialRevenueOpsState } from './revenue-ops';
import {
  acknowledgePayslip,
  createLeaveApplication,
  createLeaveType,
  createPayrollAdjustment,
  createTaxDeclaration,
  decideAttendance,
  decideLeaveApplication,
  decideLeaveType,
  decidePayrollAdjustment,
  decideTaxDeclaration,
  publishPayslip,
  recordAttendance,
} from './workforce-ledger';

const T0 = '2026-07-15T08:00:00.000Z';

function controlledPayrollState() {
  let state = createInitialRevenueOpsState();
  state = createEmployerRegistration(state, { authority: 'epfo', registrationCode: 'PF-ESTABLISHMENT-TEST', legalEntityName: 'Epic Bharat Systems Private Limited', effectiveFrom: '2026-07-01' }, 'user-avery', 'registration-1', T0);
  expect(() => decideEmployerRegistration(state, { id: 'registration-1', decision: 'active', remarks: 'Independent registration review.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker');
  state = decideEmployerRegistration(state, { id: 'registration-1', decision: 'active', remarks: 'Independent registration review.', expectedVersion: 1 }, 'user-priya', T0);
  state = createPayrollPolicy(state, { code: 'PF-EE', name: 'Reviewed employee provident-fund contribution', authority: 'epfo', componentKind: 'employee-deduction', calculationBase: 'basic', calculationMethod: 'percentage', rate: 12, effectiveFrom: '2026-07-01', sourceReference: 'https://example.test/reviewed-policy/pf-ee', requiredForFinalization: true }, 'user-avery', 'policy-1', T0);
  state = decidePayrollPolicy(state, { id: 'policy-1', decision: 'active', remarks: 'Effective date, authority, source and rate independently reviewed.', expectedVersion: 1 }, 'user-priya', T0);
  state = createPayrollCompensation(state, { workforceProfileId: 'workforce-avery', monthlyBasic: 30000, monthlyAllowances: 5000, paymentMethod: 'bank-transfer', paymentReferenceToken: 'vault://payee/avery', effectiveFrom: '2026-07-01' }, 'user-avery', 'compensation-1', T0);
  state = decidePayrollCompensation(state, { id: 'compensation-1', decision: 'active', remarks: 'Pay basis and payment rail independently reviewed.', expectedVersion: 1 }, 'user-priya', T0);
  state = createBenefitPlan(state, { code: 'MEAL-01', name: 'Meal card', category: 'meal', employerMonthlyCost: 1000, employeeMonthlyContribution: 200, effectiveFrom: '2026-07-01', providerReference: 'BENEFIT-CONTRACT-2026-01' }, 'user-avery', 'benefit-1', T0);
  state = decideBenefitPlan(state, { id: 'benefit-1', decision: 'active', remarks: 'Provider, cost and scope independently reviewed.', expectedVersion: 1 }, 'user-priya', T0);
  state = createBenefitEnrollment(state, { benefitPlanId: 'benefit-1', workforceProfileId: 'workforce-avery', effectiveFrom: '2026-07-01' }, 'user-avery', 'enrollment-1', T0);
  return decideBenefitEnrollment(state, { id: 'enrollment-1', decision: 'active', remarks: 'Employee eligibility independently reviewed.', expectedVersion: 1 }, 'user-priya', T0);
}

describe('People Ledger payroll controls', () => {
  it('freezes policy evidence, applies benefits, posts a balanced payroll journal, and reconciles the statutory trail', () => {
    let state = controlledPayrollState();
    state = createPayrollRun(state, { periodFrom: '2026-07-01', periodTo: '2026-07-31', paymentDate: '2026-08-01', workforceProfileIds: ['workforce-avery'] }, 'user-avery', 'run-1', T0);
    expect(state.payrollRuns[0]).toMatchObject({ number: 'PAY-26-27-00001', status: 'submitted', totalGrossPay: 35000, totalEmployeeDeductions: 3800, totalEmployerContributions: 1000, totalNetPay: 31200 });
    expect(state.payrollSlips[0]?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PF-EE', kind: 'employee-deduction', amount: 3600 }),
      expect.objectContaining({ code: 'MEAL-01-EE', kind: 'employee-deduction', amount: 200 }),
      expect.objectContaining({ code: 'MEAL-01-ER', kind: 'employer-contribution', amount: 1000 }),
    ]));
    expect(() => decidePayrollRun(state, { id: 'run-1', decision: 'approved', remarks: 'Independent payroll review.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker');
    state = decidePayrollRun(state, { id: 'run-1', decision: 'approved', remarks: 'Employee scope, pay basis and frozen policy source independently checked.', expectedVersion: 1 }, 'user-priya', T0);
    state = finalizePayrollRun(state, { id: 'run-1', paymentReference: 'BANK-PAYROLL-202607', expectedVersion: 2 }, 'user-lee', 'journal-1', T0);
    expect(state.payrollRuns[0]).toMatchObject({ status: 'finalized', journalDraftId: 'journal-1', finalizedBy: 'user-lee' });
    expect(state.payrollSlips[0]).toMatchObject({ status: 'released' });
    expect(state.journalDrafts[0]).toMatchObject({ sourceType: 'payroll-finalization', totalDebit: 36000, totalCredit: 36000, status: 'ready' });
    expect(state.payrollStatutoryObligations[0]).toMatchObject({ payrollPolicyId: 'policy-1', amount: 3600, status: 'calculated', employerRegistrationId: 'registration-1' });
    state = updatePayrollObligation(state, { id: state.payrollStatutoryObligations[0]!.id, status: 'reported', externalReference: 'EPFO-ECR-202607', expectedVersion: 1 }, 'user-lee', T0);
    state = updatePayrollObligation(state, { id: state.payrollStatutoryObligations[0]!.id, status: 'paid', externalReference: 'EPFO-CHALLAN-202607', expectedVersion: 2 }, 'user-lee', T0);
    state = updatePayrollObligation(state, { id: state.payrollStatutoryObligations[0]!.id, status: 'reconciled', externalReference: 'EPFO-RECON-202607', expectedVersion: 3 }, 'user-lee', T0);
    expect(state.payrollStatutoryObligations[0]).toMatchObject({ status: 'reconciled', version: 4 });
  });

  it('requires a separate approver and finance releaser for an employee expense claim', () => {
    let state = createInitialRevenueOpsState();
    state = createExpenseClaim(state, { workforceProfileId: 'workforce-avery', expenseDate: '2026-07-10', category: 'travel', merchant: 'Metro Rail', amount: 240, receiptReference: 'RECEIPT-DEL-240', businessPurpose: 'Client implementation site visit in Delhi.' }, 'user-avery', 'expense-1', T0);
    expect(() => decideExpenseClaim(state, { id: 'expense-1', decision: 'approved', remarks: 'Receipt and purpose checked.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker');
    state = decideExpenseClaim(state, { id: 'expense-1', decision: 'approved', remarks: 'Receipt and purpose independently checked.', expectedVersion: 1 }, 'user-priya', T0);
    expect(() => reimburseExpenseClaim(state, { id: 'expense-1', paymentReference: 'BANK-EXP-240', expectedVersion: 2 }, 'user-priya', 'expense-journal-1', T0)).toThrow('independent');
    state = reimburseExpenseClaim(state, { id: 'expense-1', paymentReference: 'BANK-EXP-240', expectedVersion: 2 }, 'user-lee', 'expense-journal-1', T0);
    expect(state.expenseClaims[0]).toMatchObject({ status: 'reimbursed', journalDraftId: 'expense-journal-1' });
    expect(state.journalDrafts[0]).toMatchObject({ sourceType: 'expense-reimbursement', totalDebit: 240, totalCredit: 240 });
  });

  it('reviews leave-backed attendance independently and enforces the configured leave entitlement', () => {
    let state = createInitialRevenueOpsState();
    state = createLeaveType(state, { code: 'CASUAL', name: 'Casual leave', annualEntitlementDays: 2, paid: true, effectiveFrom: '2026-04-01' }, 'user-avery', 'leave-type-1', T0);
    expect(() => decideLeaveType(state, { id: 'leave-type-1', decision: 'active', remarks: 'Independent leave policy review.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker');
    state = decideLeaveType(state, { id: 'leave-type-1', decision: 'active', remarks: 'Independent leave policy review.', expectedVersion: 1 }, 'user-priya', T0);
    state = createLeaveApplication(state, { leaveTypeId: 'leave-type-1', workforceProfileId: 'workforce-avery', startDate: '2026-07-20', endDate: '2026-07-21', dayCount: 2, reason: 'Planned personal commitments.', evidenceReference: 'LEAVE-EVIDENCE-01' }, 'user-avery', 'leave-1', T0);
    state = decideLeaveApplication(state, { id: 'leave-1', decision: 'approved', remarks: 'Entitlement and staffing coverage independently reviewed.', expectedVersion: 1 }, 'user-priya', T0);
    state = recordAttendance(state, { workforceProfileId: 'workforce-avery', attendanceDate: '2026-07-20', status: 'paid-leave', source: 'self-attested', evidenceReference: 'LEAVE-EVIDENCE-01' }, 'user-avery', 'attendance-1', T0);
    expect(() => decideAttendance(state, { id: 'attendance-1', decision: 'approved', remarks: 'Self review is not permitted.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker');
    state = decideAttendance(state, { id: 'attendance-1', decision: 'approved', remarks: 'Leave evidence and workday state independently reviewed.', expectedVersion: 1 }, 'user-priya', T0);
    expect(state.attendanceRecords[0]).toMatchObject({ status: 'paid-leave', payableFraction: 1, statusReview: 'approved' });
    state = createLeaveApplication(state, { leaveTypeId: 'leave-type-1', workforceProfileId: 'workforce-avery', startDate: '2026-07-25', endDate: '2026-07-25', dayCount: 1, reason: 'Additional personal commitment.', evidenceReference: 'LEAVE-EVIDENCE-02' }, 'user-avery', 'leave-2', T0);
    expect(() => decideLeaveApplication(state, { id: 'leave-2', decision: 'approved', remarks: 'This would exceed the configured annual leave allowance.', expectedVersion: 1 }, 'user-priya', T0)).toThrow('entitlement');
  });

  it('consumes an approved arrear exactly once, preserves declaration review, and privately delivers a released payslip', () => {
    let state = controlledPayrollState();
    state = createPayrollAdjustment(state, { workforceProfileId: 'workforce-avery', payrollPeriod: '2026-07-31', kind: 'arrear-earning', amount: 750, reason: 'Approved prior-period adjustment.', evidenceReference: 'ARREAR-EVIDENCE-01' }, 'user-avery', 'adjustment-1', T0);
    state = decidePayrollAdjustment(state, { id: 'adjustment-1', decision: 'approved', remarks: 'Source calculation independently reviewed.', expectedVersion: 1 }, 'user-priya', T0);
    state = createTaxDeclaration(state, { workforceProfileId: 'workforce-avery', financialYear: '2026-27', taxRegime: 'new', items: [{ sectionCode: 'DECLARATION-ONLY', declaredAmount: 10000, evidenceReference: 'TAX-EVIDENCE-01' }] }, 'user-avery', 'declaration-1', T0);
    state = decideTaxDeclaration(state, { id: 'declaration-1', decision: 'verified', remarks: 'Evidence recorded; no tax calculation implied.', expectedVersion: 1 }, 'user-priya', T0);
    state = createPayrollRun(state, { periodFrom: '2026-07-01', periodTo: '2026-07-31', paymentDate: '2026-08-01', workforceProfileIds: ['workforce-avery'] }, 'user-avery', 'run-adjusted', T0);
    expect(state.payrollRuns[0]).toMatchObject({ adjustmentIds: ['adjustment-1'], totalGrossPay: 35750 });
    expect(state.payrollAdjustments[0]).toMatchObject({ status: 'applied', appliedPayrollRunId: 'run-adjusted' });
    expect(state.payrollSlips[0]?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ARREAR', sourceType: 'adjustment', amount: 750 })]));
    state = decidePayrollRun(state, { id: 'run-adjusted', decision: 'approved', remarks: 'Payroll sources independently reviewed.', expectedVersion: 1 }, 'user-priya', T0);
    state = finalizePayrollRun(state, { id: 'run-adjusted', paymentReference: 'BANK-PAYROLL-ADJUSTED', expectedVersion: 2 }, 'user-lee', 'adjusted-journal', T0);
    state = publishPayslip(state, { payrollSlipId: state.payrollSlips[0]!.id, channel: 'secure-in-app', documentReference: 'PAYSLIP-SECURE-01' }, 'user-priya', 'delivery-1', T0);
    expect(state.payslipDeliveries[0]).toMatchObject({ status: 'available', userId: 'user-avery' });
    state = acknowledgePayslip(state, { id: 'delivery-1', expectedVersion: 1 }, 'user-avery', T0);
    expect(state.taxDeclarations[0]).toMatchObject({ status: 'verified', totalDeclaredAmount: 10000 });
    expect(state.payslipDeliveries[0]).toMatchObject({ status: 'acknowledged', version: 2 });
  });
});
