import { describe, expect, it } from 'vitest';
import { buildWorkforceLifecycleAssessments } from './workforce-lifecycle';
import { createInitialRevenueOpsState } from './revenue-ops';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

const profile = (scope: RevenueOpsState['scope']) => ({ scope, id: 'profile-1', number: 'WF-1', userId: 'user-1', employeeCode: 'EMP-001', department: 'Service', jobTitle: 'Engineer', employmentType: 'employee' as const, standardDailyHours: 8, hourlyCost: 500, fieldEligible: true, skills: ['field-service'], effectiveFrom: '2026-07-01', status: 'active' as const, requestedBy: 'maker', requestedAt: '2026-07-01T00:00:00.000Z', version: 1 });

describe('workforce lifecycle', () => {
  it('surfaces onboarding and payroll gaps before declaring an employee ready', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, workforceProfiles: [profile(state.scope)] };
    expect(buildWorkforceLifecycleAssessments(state, '2026-07-15')[0]).toMatchObject({ status: 'onboarding', payrollReady: false, nextAction: 'configure-payroll' });
    state = { ...state, payrollCompensations: [{ scope: state.scope, id: 'comp-1', number: 'COMP-1', workforceProfileId: 'profile-1', userId: 'user-1', monthlyBasic: 30000, monthlyAllowances: 5000, paymentMethod: 'bank-transfer' as const, paymentReferenceToken: 'vault-token', effectiveFrom: '2026-07-01', status: 'active' as const, requestedBy: 'maker', requestedAt: '2026-07-01T00:00:00.000Z', version: 1 }], payrollPolicies: [{ scope: state.scope, id: 'policy-1', number: 'POL-1', code: 'PF', name: 'Provident fund', authority: 'epfo' as const, componentKind: 'employer-contribution' as const, calculationBase: 'basic' as const, calculationMethod: 'percentage' as const, rate: 12, effectiveFrom: '2026-07-01', sourceReference: 'EPFO', requiredForFinalization: true, status: 'active' as const, requestedBy: 'maker', requestedAt: '2026-07-01T00:00:00.000Z', version: 1 }], employerRegistrations: [{ scope: state.scope, id: 'reg-1', number: 'REG-1', authority: 'epfo' as const, registrationCode: 'EPFO-001', legalEntityName: 'Epic', effectiveFrom: '2026-07-01', status: 'active' as const, requestedBy: 'maker', requestedAt: '2026-07-01T00:00:00.000Z', version: 1 }] };
    expect(buildWorkforceLifecycleAssessments(state, '2026-07-15')[0]).toMatchObject({ status: 'ready', payrollReady: true, skillCount: 1, nextAction: 'ready' });
  });

  it('excludes a profile from another scope', () => {
    const state = createInitialRevenueOpsState();
    expect(buildWorkforceLifecycleAssessments({ ...state, workforceProfiles: [profile({ companyId: 'other-company', branchId: 'other-branch' })] })).toEqual([]);
  });
});
