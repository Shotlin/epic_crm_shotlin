import type {
  RevenueOpsSnapshot,
  RevenueOpsState,
} from '../shared/revenue-ops-contracts';
import type {
  PeopleReadAccessDecision,
  PeopleReadProjection,
} from '../shared/people-read-projection-contracts';

type ScopedRecord = { scope?: { companyId: string; branchId: string } };

export const PEOPLE_READ_COLLECTIONS = [
  ['workforceProfiles', 'workforce.profile'],
  ['workforceAvailabilities', 'workforce.availability'],
  ['workforceAllocations', 'workforce.allocation'],
  ['employerRegistrations', 'payroll.employer-registration'],
  ['payrollPolicies', 'payroll.policy'],
  ['payrollCompensations', 'payroll.compensation'],
  ['benefitPlans', 'payroll.benefit-plan'],
  ['benefitEnrollments', 'payroll.benefit-enrollment'],
  ['payrollRuns', 'payroll.run'],
  ['payrollSlips', 'payroll.payslip'],
  ['payrollStatutoryObligations', 'payroll.obligation'],
  ['expenseClaims', 'payroll.expense-claim'],
  ['attendanceRecords', 'workforce.attendance'],
  ['leaveTypes', 'workforce.leave-type'],
  ['leaveApplications', 'workforce.leave-application'],
  ['payrollAdjustments', 'payroll.adjustment'],
  ['taxDeclarations', 'payroll.tax-declaration'],
  ['payslipDeliveries', 'payroll.payslip'],
] as const;

type PeopleCollection = typeof PEOPLE_READ_COLLECTIONS[number][0];
type PeopleReadSource = Pick<RevenueOpsState, 'scope' | PeopleCollection>
  | Pick<RevenueOpsSnapshot, 'scope' | PeopleCollection>;

const PEOPLE_COLLECTION_METRICS: Record<PeopleCollection, readonly string[]> = {
  workforceProfiles: ['activeWorkforce', 'fieldEligibleWorkforce'],
  workforceAvailabilities: ['approvedUnavailableHours'],
  workforceAllocations: ['reservedWorkforceHours'],
  employerRegistrations: [],
  payrollPolicies: [],
  payrollCompensations: [],
  benefitPlans: [],
  benefitEnrollments: ['activeBenefitEnrollments'],
  payrollRuns: ['payrollAwaitingApproval', 'payrollFinalizedThisMonth'],
  payrollSlips: ['releasedPayslipsUndelivered'],
  payrollStatutoryObligations: ['statutoryObligationsOpen'],
  expenseClaims: ['expensesAwaitingApproval', 'expensesAwaitingReimbursement'],
  attendanceRecords: ['attendanceAwaitingReview'],
  leaveTypes: [],
  leaveApplications: ['leaveAwaitingReview', 'approvedLeaveDaysThisYear'],
  payrollAdjustments: ['payrollAdjustmentsAwaitingApproval'],
  taxDeclarations: ['taxDeclarationsAwaitingReview'],
  payslipDeliveries: ['releasedPayslipsUndelivered'],
};

const PEOPLE_FIELD_METRICS: Record<string, readonly string[]> = {
  'payroll.run.totalNetPay': ['payrollNetPayThisMonth'],
};

function isInScope(record: ScopedRecord, scope: PeopleReadSource['scope']): boolean {
  return record.scope?.companyId === scope.companyId && record.scope?.branchId === scope.branchId;
}

function redact<T extends object>(record: T, fields: readonly string[]): T {
  const copy = { ...record } as Record<string, unknown>;
  for (const field of fields) delete copy[field];
  return copy as T;
}

export function createPeopleReadProjection(
  state: PeopleReadSource,
  getDecision: (resource: string) => PeopleReadAccessDecision,
  generatedAt = new Date().toISOString(),
): PeopleReadProjection {
  const projected = {} as Record<PeopleCollection, unknown[]>;
  const hiddenCollections: string[] = [];
  const redactedFields: Record<string, string[]> = {};
  const redactedMetrics: string[] = [];
  const stateRecord = state as unknown as Record<PeopleCollection, ScopedRecord[]>;

  for (const [collection, resource] of PEOPLE_READ_COLLECTIONS) {
    const decision = getDecision(resource);
    if (!decision.allowed) {
      projected[collection] = [];
      hiddenCollections.push(collection);
      redactedMetrics.push(...PEOPLE_COLLECTION_METRICS[collection]);
      continue;
    }
    if (decision.deniedFields.length) {
      redactedFields[resource] = [...decision.deniedFields];
      for (const field of decision.deniedFields) {
        redactedMetrics.push(...(PEOPLE_FIELD_METRICS[`${resource}.${field}`] ?? []));
      }
    }
    projected[collection] = stateRecord[collection]
      .filter((record) => isInScope(record, state.scope))
      .map((record) => redact(record, decision.deniedFields));
  }

  return {
    scope: structuredClone(state.scope),
    generatedAt,
    hiddenCollections,
    redactedFields,
    redactedMetrics: [...new Set(redactedMetrics)],
    workforceProfiles: projected.workforceProfiles as PeopleReadProjection['workforceProfiles'],
    workforceAvailabilities: projected.workforceAvailabilities as PeopleReadProjection['workforceAvailabilities'],
    workforceAllocations: projected.workforceAllocations as PeopleReadProjection['workforceAllocations'],
    employerRegistrations: projected.employerRegistrations as PeopleReadProjection['employerRegistrations'],
    payrollPolicies: projected.payrollPolicies as PeopleReadProjection['payrollPolicies'],
    payrollCompensations: projected.payrollCompensations as PeopleReadProjection['payrollCompensations'],
    benefitPlans: projected.benefitPlans as PeopleReadProjection['benefitPlans'],
    benefitEnrollments: projected.benefitEnrollments as PeopleReadProjection['benefitEnrollments'],
    payrollRuns: projected.payrollRuns as PeopleReadProjection['payrollRuns'],
    payrollSlips: projected.payrollSlips as PeopleReadProjection['payrollSlips'],
    payrollStatutoryObligations: projected.payrollStatutoryObligations as PeopleReadProjection['payrollStatutoryObligations'],
    expenseClaims: projected.expenseClaims as PeopleReadProjection['expenseClaims'],
    attendanceRecords: projected.attendanceRecords as PeopleReadProjection['attendanceRecords'],
    leaveTypes: projected.leaveTypes as PeopleReadProjection['leaveTypes'],
    leaveApplications: projected.leaveApplications as PeopleReadProjection['leaveApplications'],
    payrollAdjustments: projected.payrollAdjustments as PeopleReadProjection['payrollAdjustments'],
    taxDeclarations: projected.taxDeclarations as PeopleReadProjection['taxDeclarations'],
    payslipDeliveries: projected.payslipDeliveries as PeopleReadProjection['payslipDeliveries'],
  };
}
