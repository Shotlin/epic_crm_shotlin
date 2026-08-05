import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';

export type WorkforceLifecycleStatus = 'ready' | 'onboarding' | 'blocked' | 'suspended';

export interface WorkforceLifecycleAssessment {
  workforceProfileId: string;
  userId: string;
  employeeCode: string;
  displayName?: string;
  status: WorkforceLifecycleStatus;
  payrollReady: boolean;
  skillCount: number;
  fieldEligible: boolean;
  reservedHours: number;
  blockers: string[];
  nextAction: 'activate-profile' | 'complete-skills' | 'configure-payroll' | 'review-capacity' | 'ready';
}

type WorkforceLifecycleSource = Pick<RevenueOpsSnapshot, 'scope' | 'workforceProfiles' | 'payrollCompensations' | 'payrollPolicies' | 'employerRegistrations' | 'workforceAvailabilities' | 'workforceAllocations'> & { displayNames?: Record<string, string> };

function inScope(state: WorkforceLifecycleSource, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

/** Evaluates onboarding, skills, capacity and payroll prerequisites without changing workforce state. */
export function buildWorkforceLifecycleAssessments(state: WorkforceLifecycleSource, asOf = new Date().toISOString().slice(0, 10)): WorkforceLifecycleAssessment[] {
  const activePolicies = state.payrollPolicies.filter((policy) => policy.status === 'active' && inScope(state, policy));
  const activeRegistrations = state.employerRegistrations.filter((registration) => registration.status === 'active' && inScope(state, registration));
  return state.workforceProfiles.filter((profile) => inScope(state, profile)).map((profile) => {
    const blockers: string[] = [];
    if (profile.status === 'suspended') blockers.push('Profile is suspended by an independent decision.');
    if (profile.status === 'submitted') blockers.push('Profile is awaiting independent activation.');
    if (profile.status === 'rejected') blockers.push('Profile was rejected and needs correction.');
    if (!profile.skills.length) blockers.push('Skills and qualification evidence are incomplete.');
    if (profile.effectiveFrom > asOf) blockers.push(`Effective from ${profile.effectiveFrom}; not active for this date.`);
    const compensation = state.payrollCompensations.find((item) => item.workforceProfileId === profile.id && item.status === 'active' && inScope(state, item));
    const payrollReady = profile.employmentType !== 'employee' || (Boolean(compensation) && activePolicies.some((policy) => policy.requiredForFinalization) && activeRegistrations.length > 0);
    if (profile.employmentType === 'employee' && !compensation) blockers.push('Active payroll compensation is not configured.');
    if (profile.employmentType === 'employee' && !activePolicies.some((policy) => policy.requiredForFinalization)) blockers.push('Required payroll policies are not active.');
    if (profile.employmentType === 'employee' && !activeRegistrations.length) blockers.push('Employer statutory registration is not active.');
    const reservedHours = state.workforceAllocations.filter((allocation) => allocation.workforceProfileId === profile.id && allocation.status === 'reserved' && allocation.workDate === asOf && inScope(state, allocation)).reduce((sum, allocation) => sum + allocation.allocatedHours, 0);
    const availability = state.workforceAvailabilities.filter((item) => item.workforceProfileId === profile.id && item.workDate === asOf && item.status === 'approved' && inScope(state, item)).reduce((sum, item) => sum + item.availableHours, 0);
    if (reservedHours > profile.standardDailyHours + availability) blockers.push('Reserved capacity exceeds the approved daily runway.');
    const status: WorkforceLifecycleStatus = profile.status === 'suspended' ? 'suspended' : blockers.length ? (profile.status === 'active' && payrollReady && profile.skills.length ? 'blocked' : 'onboarding') : 'ready';
    const nextAction: WorkforceLifecycleAssessment['nextAction'] = profile.status !== 'active' ? 'activate-profile' : !profile.skills.length ? 'complete-skills' : profile.employmentType === 'employee' && !payrollReady ? 'configure-payroll' : reservedHours > profile.standardDailyHours + availability ? 'review-capacity' : 'ready';
    return { workforceProfileId: profile.id, userId: profile.userId, employeeCode: profile.employeeCode, displayName: state.displayNames?.[profile.userId], status, payrollReady, skillCount: profile.skills.length, fieldEligible: profile.fieldEligible, reservedHours, blockers: [...new Set(blockers)], nextAction };
  }).sort((left, right) => left.employeeCode.localeCompare(right.employeeCode));
}
