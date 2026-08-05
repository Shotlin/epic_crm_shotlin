export type EmployerAuthority = 'income-tax' | 'epfo' | 'esic' | 'labour';
export type PayrollComponentKind = 'employee-deduction' | 'employer-contribution';
export type PayrollCalculationBase = 'basic' | 'gross';
export type PayrollCalculationMethod = 'percentage' | 'fixed';

export interface EmployerRegistration {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  authority: EmployerAuthority;
  registrationCode: string;
  legalEntityName: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'submitted' | 'active' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface PayrollPolicy {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  code: string;
  name: string;
  authority?: EmployerAuthority;
  componentKind: PayrollComponentKind;
  calculationBase: PayrollCalculationBase;
  calculationMethod: PayrollCalculationMethod;
  rate: number;
  wageCeiling?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceReference: string;
  requiredForFinalization: boolean;
  status: 'submitted' | 'active' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface PayrollCompensation {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  workforceProfileId: string;
  userId: string;
  monthlyBasic: number;
  monthlyAllowances: number;
  paymentMethod: 'bank-transfer' | 'upi' | 'other';
  paymentReferenceToken: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'submitted' | 'active' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface BenefitPlan {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  code: string;
  name: string;
  category: 'health' | 'insurance' | 'meal' | 'transport' | 'wellbeing' | 'other';
  employerMonthlyCost: number;
  employeeMonthlyContribution: number;
  effectiveFrom: string;
  effectiveTo?: string;
  providerReference: string;
  status: 'submitted' | 'active' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface BenefitEnrollment {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  benefitPlanId: string;
  workforceProfileId: string;
  userId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'submitted' | 'active' | 'rejected' | 'cancelled';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface PayrollSlipLine {
  code: string;
  label: string;
  kind: 'earning' | PayrollComponentKind;
  amount: number;
  sourceType: 'compensation' | 'policy' | 'benefit' | 'adjustment';
  sourceId: string;
}

export interface PayrollSlip {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  payrollRunId: string;
  workforceProfileId: string;
  userId: string;
  compensationId: string;
  lines: PayrollSlipLine[];
  grossPay: number;
  employeeDeductions: number;
  employerContributions: number;
  netPay: number;
  status: 'generated' | 'released' | 'held';
  version: number;
}

export interface PayrollPolicySnapshot {
  policyId: string;
  code: string;
  sourceReference: string;
  version: number;
}

export interface PayrollRun {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  periodFrom: string;
  periodTo: string;
  paymentDate: string;
  workforceProfileIds: string[];
  policySnapshots: PayrollPolicySnapshot[];
  adjustmentIds: string[];
  slipIds: string[];
  totalGrossPay: number;
  totalEmployeeDeductions: number;
  totalEmployerContributions: number;
  totalNetPay: number;
  status: 'submitted' | 'approved' | 'rejected' | 'finalized' | 'cancelled';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  finalizedBy?: string;
  finalizedAt?: string;
  paymentReference?: string;
  journalDraftId?: string;
  version: number;
}

export interface PayrollStatutoryObligation {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  payrollRunId: string;
  payrollPolicyId: string;
  employerRegistrationId: string;
  authority: EmployerAuthority;
  amount: number;
  status: 'calculated' | 'reported' | 'paid' | 'reconciled';
  externalReference?: string;
  updatedBy: string;
  updatedAt: string;
  version: number;
}

export interface ExpenseClaim {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  workforceProfileId: string;
  userId: string;
  expenseDate: string;
  category: 'travel' | 'lodging' | 'meals' | 'supplies' | 'client-service' | 'other';
  merchant: string;
  amount: number;
  receiptReference: string;
  businessPurpose: string;
  status: 'submitted' | 'approved' | 'rejected' | 'reimbursed';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  reimbursedBy?: string;
  reimbursedAt?: string;
  paymentReference?: string;
  journalDraftId?: string;
  version: number;
}

export type AttendanceStatus = 'present' | 'absent' | 'half-day' | 'paid-leave' | 'unpaid-leave' | 'holiday' | 'weekly-off';

export interface AttendanceRecord {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  workforceProfileId: string;
  userId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  payableFraction: number;
  source: 'self-attested' | 'manager-recorded' | 'imported';
  evidenceReference: string;
  statusReview: 'submitted' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface LeaveType {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  code: string;
  name: string;
  annualEntitlementDays: number;
  paid: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'submitted' | 'active' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface LeaveApplication {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  leaveTypeId: string;
  workforceProfileId: string;
  userId: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  reason: string;
  evidenceReference?: string;
  status: 'submitted' | 'approved' | 'rejected' | 'cancelled';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface PayrollAdjustment {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  workforceProfileId: string;
  userId: string;
  payrollPeriod: string;
  kind: 'arrear-earning' | 'recovery-deduction';
  amount: number;
  reason: string;
  evidenceReference: string;
  status: 'submitted' | 'approved' | 'rejected' | 'applied' | 'cancelled';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  appliedPayrollRunId?: string;
  appliedAt?: string;
  version: number;
}

export interface TaxDeclarationItem {
  sectionCode: string;
  declaredAmount: number;
  evidenceReference: string;
}

export interface TaxDeclaration {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  workforceProfileId: string;
  userId: string;
  financialYear: string;
  taxRegime: 'old' | 'new' | 'undecided';
  items: TaxDeclarationItem[];
  totalDeclaredAmount: number;
  status: 'submitted' | 'verified' | 'rejected' | 'superseded';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface PayslipDelivery {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  payrollSlipId: string;
  payrollRunId: string;
  workforceProfileId: string;
  userId: string;
  channel: 'secure-in-app' | 'email-adapter';
  status: 'available' | 'acknowledged' | 'failed';
  documentReference: string;
  publishedBy: string;
  publishedAt: string;
  acknowledgedAt?: string;
  version: number;
}

export interface CreateEmployerRegistrationInput {
  authority: EmployerAuthority;
  registrationCode: string;
  legalEntityName: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface DecideEmployerRegistrationInput {
  id: string;
  decision: 'active' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreatePayrollPolicyInput {
  code: string;
  name: string;
  authority?: EmployerAuthority;
  componentKind: PayrollComponentKind;
  calculationBase: PayrollCalculationBase;
  calculationMethod: PayrollCalculationMethod;
  rate: number;
  wageCeiling?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceReference: string;
  requiredForFinalization: boolean;
}

export interface DecidePayrollPolicyInput {
  id: string;
  decision: 'active' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreatePayrollCompensationInput {
  workforceProfileId: string;
  monthlyBasic: number;
  monthlyAllowances: number;
  paymentMethod: 'bank-transfer' | 'upi' | 'other';
  paymentReferenceToken: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface DecidePayrollCompensationInput {
  id: string;
  decision: 'active' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreateBenefitPlanInput {
  code: string;
  name: string;
  category: BenefitPlan['category'];
  employerMonthlyCost: number;
  employeeMonthlyContribution: number;
  effectiveFrom: string;
  effectiveTo?: string;
  providerReference: string;
}

export interface DecideBenefitPlanInput {
  id: string;
  decision: 'active' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreateBenefitEnrollmentInput {
  benefitPlanId: string;
  workforceProfileId: string;
  effectiveFrom: string;
}

export interface DecideBenefitEnrollmentInput {
  id: string;
  decision: 'active' | 'rejected' | 'cancelled';
  remarks: string;
  expectedVersion: number;
}

export interface CreatePayrollRunInput {
  periodFrom: string;
  periodTo: string;
  paymentDate: string;
  workforceProfileIds: string[];
}

export interface DecidePayrollRunInput {
  id: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface FinalizePayrollRunInput {
  id: string;
  paymentReference: string;
  expectedVersion: number;
}

export interface UpdatePayrollObligationInput {
  id: string;
  status: 'reported' | 'paid' | 'reconciled';
  externalReference: string;
  expectedVersion: number;
}

export interface CreateExpenseClaimInput {
  workforceProfileId: string;
  expenseDate: string;
  category: ExpenseClaim['category'];
  merchant: string;
  amount: number;
  receiptReference: string;
  businessPurpose: string;
}

export interface DecideExpenseClaimInput {
  id: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface ReimburseExpenseClaimInput {
  id: string;
  paymentReference: string;
  expectedVersion: number;
}

export interface RecordAttendanceInput {
  workforceProfileId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  source: AttendanceRecord['source'];
  evidenceReference: string;
}

export interface DecideAttendanceInput {
  id: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreateLeaveTypeInput {
  code: string;
  name: string;
  annualEntitlementDays: number;
  paid: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface DecideLeaveTypeInput {
  id: string;
  decision: 'active' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreateLeaveApplicationInput {
  leaveTypeId: string;
  workforceProfileId: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  reason: string;
  evidenceReference?: string;
}

export interface DecideLeaveApplicationInput {
  id: string;
  decision: 'approved' | 'rejected' | 'cancelled';
  remarks: string;
  expectedVersion: number;
}

export interface CreatePayrollAdjustmentInput {
  workforceProfileId: string;
  payrollPeriod: string;
  kind: PayrollAdjustment['kind'];
  amount: number;
  reason: string;
  evidenceReference: string;
}

export interface DecidePayrollAdjustmentInput {
  id: string;
  decision: 'approved' | 'rejected' | 'cancelled';
  remarks: string;
  expectedVersion: number;
}

export interface CreateTaxDeclarationInput {
  workforceProfileId: string;
  financialYear: string;
  taxRegime: TaxDeclaration['taxRegime'];
  items: TaxDeclarationItem[];
}

export interface DecideTaxDeclarationInput {
  id: string;
  decision: 'verified' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface PublishPayslipInput {
  payrollSlipId: string;
  channel: PayslipDelivery['channel'];
  documentReference: string;
}

export interface AcknowledgePayslipInput {
  id: string;
  expectedVersion: number;
}
import type { OperatingRecordScope } from './revenue-ops-contracts';
