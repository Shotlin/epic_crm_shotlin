import { describe, expect, it } from 'vitest';
import {
  createProjectContractVariation,
  createProjectCurrencyProfile,
  createProjectExchangeRate,
  createProjectResourcePlan,
  createProjectRetainer,
  createRetainerDrawdown,
  decideProjectContractVariation,
  decideProjectCurrencyProfile,
  decideProjectExchangeRate,
  decideProjectResourcePlan,
  decideProjectRetainer,
  decideRetainerDrawdown,
  generateProjectMarginReview,
  reviewProjectMargin,
} from './project-commercial';
import { createInitialRevenueOpsState } from './revenue-ops';

const T0 = '2026-07-16T08:00:00.000Z';

function commercialState() {
  const state = createInitialRevenueOpsState();
  state.deliveryProjects = [{ id: 'project-1', number: 'PRJ-1', accountId: 'account-alpha', name: 'Global delivery', deliveryModel: 'time-and-materials', budgetAmount: 120000, plannedHours: 120, startDate: '2026-07-01', targetDate: '2026-09-30', managerUserId: 'user-avery', status: 'active', requestedBy: 'user-avery', requestedAt: T0, version: 1 }];
  state.workforceProfiles = [{ id: 'workforce-lee', number: 'EMP-1', userId: 'user-lee', employeeCode: 'LEE-01', department: 'Delivery', jobTitle: 'Implementation consultant', employmentType: 'employee', standardDailyHours: 8, hourlyCost: 750, fieldEligible: false, skills: ['implementation'], effectiveFrom: '2026-07-01', status: 'active', requestedBy: 'user-avery', requestedAt: T0, decidedBy: 'user-priya', decidedAt: T0, decisionRemarks: 'Active.', version: 2 }];
  state.timeEntries = [{ id: 'time-1', number: 'TIM-1', projectId: 'project-1', projectTaskId: 'task-1', workDate: '2026-07-16', hours: 4, billable: true, hourlyCost: 750, costAmount: 3000, notes: 'Approved customer implementation evidence.', status: 'approved', submittedBy: 'user-lee', submittedAt: T0, decidedBy: 'user-avery', decidedAt: T0, decisionRemarks: 'Approved.', version: 2 }];
  return state;
}

describe('project commercial controls', () => {
  it('keeps FX evidence, scope, retainer drawdown, staffing and margin review independently governed', () => {
    let state = commercialState();
    expect(() => createProjectCurrencyProfile(state, { projectId: 'project-1', contractCurrency: 'USD', contractBaselineAmount: 1500, conversionBasis: 'contractual' }, 'user-avery', 'profile-missing', T0)).toThrow('verified INR exchange-rate');

    state = createProjectExchangeRate(state, { sourceCurrency: 'USD', rate: 80, effectiveFrom: '2026-07-01', effectiveTo: '2026-09-30', sourceReference: 'Treasury rate sheet 2026-07', evidenceReference: 'ATT-FX-001' }, 'user-finance', 'fx-1', T0);
    expect(() => decideProjectExchangeRate(state, { id: 'fx-1', decision: 'verified', remarks: 'Independent rate verification complete.', expectedVersion: 1 }, 'user-finance', T0)).toThrow('maker');
    state = decideProjectExchangeRate(state, { id: 'fx-1', decision: 'verified', remarks: 'Independent rate verification complete.', expectedVersion: 1 }, 'user-priya', T0);

    state = createProjectCurrencyProfile(state, { projectId: 'project-1', contractCurrency: 'USD', contractBaselineAmount: 1500, conversionBasis: 'contractual', exchangeRateId: 'fx-1' }, 'user-avery', 'profile-1', T0);
    state = decideProjectCurrencyProfile(state, { id: 'profile-1', decision: 'active', remarks: 'Contract currency and source rate checked.', expectedVersion: 1 }, 'user-priya', T0);
    expect(state.projectCurrencyProfiles[0]).toMatchObject({ baselineAmountInr: 120000, status: 'active' });

    state = createProjectContractVariation(state, { projectId: 'project-1', title: 'Regional rollout scope', kind: 'scope', amountDelta: 200, effectiveDate: '2026-07-16', rationale: 'Customer requested a separately authorised regional rollout.', evidenceReference: 'CR-2026-07' }, 'user-avery', 'variation-1', T0);
    state = decideProjectContractVariation(state, { id: 'variation-1', decision: 'approved', remarks: 'Signed scope evidence and commercial delta reviewed.', expectedVersion: 1 }, 'user-priya', T0);
    expect(state.projectContractVariations[0]).toMatchObject({ amountDeltaInr: 16000, currency: 'USD', status: 'approved' });

    state = createProjectRetainer(state, { projectId: 'project-1', name: 'Rollout success cover', contractAmount: 800, includedHours: 10, effectiveFrom: '2026-07-01', effectiveTo: '2026-09-30', billingCadence: 'monthly', evidenceReference: 'RET-2026-07' }, 'user-avery', 'retainer-1', T0);
    state = decideProjectRetainer(state, { id: 'retainer-1', decision: 'active', remarks: 'Retainer hours, cadence and contract schedule checked.', expectedVersion: 1 }, 'user-priya', T0);

    state = createRetainerDrawdown(state, { retainerId: 'retainer-1', timeEntryIds: ['time-1'] }, 'user-avery', 'drawdown-1', T0);
    expect(state.retainerDrawdowns[0]).toMatchObject({ hours: 4, amount: 320, amountInr: 25600, status: 'submitted' });
    expect(() => createRetainerDrawdown(state, { retainerId: 'retainer-1', timeEntryIds: ['time-1'] }, 'user-avery', 'drawdown-duplicate', T0)).toThrow('only once');
    expect(() => decideRetainerDrawdown(state, { id: 'drawdown-1', decision: 'approved', remarks: 'Approved billable time and drawdown balance reviewed.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker');
    state = decideRetainerDrawdown(state, { id: 'drawdown-1', decision: 'approved', remarks: 'Approved billable time and drawdown balance reviewed.', expectedVersion: 1 }, 'user-priya', T0);

    state = createProjectResourcePlan(state, { projectId: 'project-1', workforceProfileId: 'workforce-lee', periodFrom: '2026-07-16', periodTo: '2026-07-31', plannedHours: 20, billable: true }, 'user-avery', 'resource-1', T0);
    state = decideProjectResourcePlan(state, { id: 'resource-1', decision: 'active', remarks: 'Delivery capacity and cost snapshot reviewed.', expectedVersion: 1 }, 'user-priya', T0);

    state = generateProjectMarginReview(state, { projectId: 'project-1', asOfDate: '2026-07-16' }, 'user-avery', 'margin-1', T0);
    expect(state.projectMarginReviews[0]).toMatchObject({ forecastRevenueInr: 136000, approvedDeliveryCostInr: 3000, plannedResourceCostInr: 15000, forecastCostInr: 15000, forecastMarginInr: 121000, forecastMarginPercent: 88.97, status: 'generated' });
    expect(() => reviewProjectMargin(state, { id: 'margin-1', decision: 'reviewed', remarks: 'Forecast scope and delivery evidence reviewed.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker');
    state = reviewProjectMargin(state, { id: 'margin-1', decision: 'reviewed', remarks: 'Forecast scope and delivery evidence reviewed.', expectedVersion: 1 }, 'user-priya', T0);
    expect(state.projectMarginReviews[0]).toMatchObject({ status: 'reviewed', reviewedBy: 'user-priya' });
  });

  it('will not activate staffing plans that exceed planned workforce capacity', () => {
    let state = commercialState();
    state = createProjectResourcePlan(state, { projectId: 'project-1', workforceProfileId: 'workforce-lee', periodFrom: '2026-07-16', periodTo: '2026-07-16', plannedHours: 8, billable: true }, 'user-avery', 'resource-1', T0);
    state = createProjectResourcePlan(state, { projectId: 'project-1', workforceProfileId: 'workforce-lee', periodFrom: '2026-07-16', periodTo: '2026-07-16', plannedHours: 8, billable: true }, 'user-avery', 'resource-2', T0);
    state = decideProjectResourcePlan(state, { id: 'resource-1', decision: 'active', remarks: 'One day of capacity independently reviewed.', expectedVersion: 1 }, 'user-priya', T0);
    expect(() => decideProjectResourcePlan(state, { id: 'resource-2', decision: 'active', remarks: 'Attempting to overbook a full workforce day.', expectedVersion: 1 }, 'user-priya', T0)).toThrow('capacity');
  });
});
