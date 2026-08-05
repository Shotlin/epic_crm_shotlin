import type {
  OperatingRecordScope,
  ProjectedPayrollCompensation,
  ProjectedPayrollRun,
  ProjectedPayrollSlip,
  ProjectedTaxDeclaration,
  ProjectedWorkforceProfile,
} from './revenue-ops-contracts';
import type {
  AttendanceRecord,
  BenefitEnrollment,
  BenefitPlan,
  EmployerRegistration,
  ExpenseClaim,
  LeaveApplication,
  LeaveType,
  PayrollAdjustment,
  PayrollPolicy,
  PayrollStatutoryObligation,
  PayslipDelivery,
} from './payroll-contracts';
import type { WorkforceAllocation, WorkforceAvailability } from './workforce-contracts';

export interface PeopleReadAccessDecision {
  allowed: boolean;
  deniedFields: string[];
}

export type {
  ProjectedPayrollCompensation,
  ProjectedPayrollRun,
  ProjectedPayrollSlip,
  ProjectedTaxDeclaration,
  ProjectedWorkforceProfile,
} from './revenue-ops-contracts';

export interface PeopleReadProjection {
  scope: OperatingRecordScope;
  generatedAt: string;
  hiddenCollections: string[];
  redactedFields: Record<string, string[]>;
  redactedMetrics: string[];
  workforceProfiles: ProjectedWorkforceProfile[];
  workforceAvailabilities: WorkforceAvailability[];
  workforceAllocations: WorkforceAllocation[];
  employerRegistrations: EmployerRegistration[];
  payrollPolicies: PayrollPolicy[];
  payrollCompensations: ProjectedPayrollCompensation[];
  benefitPlans: BenefitPlan[];
  benefitEnrollments: BenefitEnrollment[];
  payrollRuns: ProjectedPayrollRun[];
  payrollSlips: ProjectedPayrollSlip[];
  payrollStatutoryObligations: PayrollStatutoryObligation[];
  expenseClaims: ExpenseClaim[];
  attendanceRecords: AttendanceRecord[];
  leaveTypes: LeaveType[];
  leaveApplications: LeaveApplication[];
  payrollAdjustments: PayrollAdjustment[];
  taxDeclarations: ProjectedTaxDeclaration[];
  payslipDeliveries: PayslipDelivery[];
}
