import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createProjectFinanceReadProjection } from './project-finance-read-projection';

function controlledState() {
  const state = createInitialRevenueOpsState();
  state.accountingClosePeriods = [{ id: 'close-current', number: 'CLOSE-1', name: 'July close', periodFrom: '2026-07-01', periodTo: '2026-07-31', status: 'submitted', requestedBy: 'user-avery', requestedAt: '2026-07-17T09:00:00.000Z', scope: structuredClone(state.scope), version: 1 }, { id: 'close-legacy', number: 'CLOSE-OLD', name: 'Legacy close', periodFrom: '2026-06-01', periodTo: '2026-06-30', status: 'closed', requestedBy: 'user-avery', requestedAt: '2026-06-30T09:00:00.000Z', version: 1 }];
  return state;
}
const allowed = () => ({ allowed: true, deniedFields: [] });

describe('project-finance read projection', () => {
  it('filters financial-close rows by exact company and branch and excludes unscoped legacy records', () => {
    const projection = createProjectFinanceReadProjection(controlledState(), allowed);
    expect(projection.accountingClosePeriods.map(({ id }) => id)).toEqual(['close-current']);
  });

  it('hides all project-finance records and dependent metrics without finance journal read authority', () => {
    const projection = createProjectFinanceReadProjection(controlledState(), () => ({ allowed: false, deniedFields: [] }));
    expect(projection.accountingClosePeriods).toEqual([]);
    expect(projection.hiddenCollections).toEqual(expect.arrayContaining(['projectBillingPlans', 'projectMarginReviews', 'accountingClosePeriods']));
    expect(projection.redactedMetrics).toEqual(expect.arrayContaining(['activeBillingPlans', 'closedClosePeriods', 'projectMarginAtRisk']));
  });

  it('keeps the source state unchanged when permitted records are projected', () => {
    const state = controlledState(); const projection = createProjectFinanceReadProjection(state, allowed);
    expect(projection.accountingClosePeriods[0]).not.toBe(state.accountingClosePeriods[0]);
    expect(state.accountingClosePeriods[0]).toHaveProperty('name', 'July close');
  });
});
