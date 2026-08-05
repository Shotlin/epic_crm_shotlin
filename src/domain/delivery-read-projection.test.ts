import { describe, expect, it } from 'vitest';
import { createProject } from './delivery';
import { createDeliveryReadProjection } from './delivery-read-projection';
import { createInitialRevenueOpsState } from './revenue-ops';

const context = {
  activeAccountIds: ['account-alpha'],
  activeAddressIds: [],
  addressAccountIds: {},
  activeUserIds: ['user-avery'],
  workforceProfiles: [],
  approvedAvailabilityHours: {},
  reservedAllocationHours: {},
};

function controlledState() {
  let state = createInitialRevenueOpsState();
  state = createProject(state, {
    accountId: 'account-alpha',
    name: 'Branch rollout',
    deliveryModel: 'fixed-price',
    budgetAmount: 500_000,
    plannedHours: 80,
    startDate: '2026-07-16',
    targetDate: '2026-08-16',
    managerUserId: 'user-avery',
  }, 'user-avery', context, 'project-current', '2026-07-16T09:00:00.000Z');
  const project = state.deliveryProjects[0];
  if (!project) throw new Error('Seeded project is required for this test.');
  state.deliveryProjects.push({
    ...project,
    id: 'project-other',
    number: 'PRJ-OTHER',
    scope: { companyId: 'company-other', branchId: 'branch-other' },
  });
  state.timeEntries = [{
    id: 'time-current',
    number: 'TIM-26-27-00001',
    projectId: project.id,
    projectTaskId: 'task-current',
    workDate: '2026-07-16',
    hours: 6,
    billable: true,
    hourlyCost: 850,
    costAmount: 5100,
    notes: 'Configured the governed branch delivery queue.',
    status: 'approved',
    submittedBy: 'user-avery',
    submittedAt: '2026-07-16T09:00:00.000Z',
    scope: structuredClone(state.scope),
    version: 1,
  }, {
    id: 'time-legacy',
    number: 'TIM-LEGACY',
    projectId: project.id,
    projectTaskId: 'task-current',
    workDate: '2026-07-15',
    hours: 2,
    billable: false,
    hourlyCost: 850,
    costAmount: 1700,
    notes: 'Legacy time without durable scope is excluded.',
    status: 'approved',
    submittedBy: 'user-avery',
    submittedAt: '2026-07-15T09:00:00.000Z',
    version: 1,
  }];
  return state;
}

const readAllowed = () => ({ allowed: true, deniedFields: [] });

describe('delivery read projection', () => {
  it('filters delivery rows by exact company and branch and excludes legacy rows without scope', () => {
    const projection = createDeliveryReadProjection(controlledState(), readAllowed);

    expect(projection.deliveryProjects.map(({ id }) => id)).toEqual(['project-current']);
    expect(projection.timeEntries.map(({ id }) => id)).toEqual(['time-current']);
  });

  it('hides all project delivery collections and their aggregates on a denied resource', () => {
    const projection = createDeliveryReadProjection(controlledState(), (resource) => (
      resource === 'delivery.project' ? { allowed: false, deniedFields: [] } : readAllowed()
    ));

    expect(projection.deliveryProjects).toEqual([]);
    expect(projection.timeEntries).toEqual([]);
    expect(projection.hiddenCollections).toEqual([
      'deliveryProjects',
      'projectTasks',
      'timeEntries',
    ]);
    expect(projection.redactedMetrics).toContain('approvedDeliveryCost');
  });

  it('removes internal time cost fields without mutating the stored entries', () => {
    const state = controlledState();
    const projection = createDeliveryReadProjection(state, (resource) => (
      resource === 'delivery.project'
        ? { allowed: true, deniedFields: ['hourlyCost', 'costAmount'] }
        : readAllowed()
    ));

    expect(projection.timeEntries[0]).not.toHaveProperty('hourlyCost');
    expect(projection.timeEntries[0]).not.toHaveProperty('costAmount');
    expect(projection.redactedMetrics).toContain('approvedDeliveryCost');
    expect(state.timeEntries[0]).toHaveProperty('hourlyCost', 850);
    expect(state.timeEntries[0]).toHaveProperty('costAmount', 5100);
  });
});
