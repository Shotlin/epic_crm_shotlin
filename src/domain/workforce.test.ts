import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import {
  cancelWorkforceAllocation,
  createWorkforceAllocation,
  createWorkforceProfile,
  decideWorkforceAvailability,
  decideWorkforceProfile,
  recordWorkforceAvailability,
  workforceCapacityProfiles,
} from './workforce';
import { createProject, createProjectTask, decideProject } from './delivery';
import type { DeliveryContext } from '../shared/delivery-contracts';

const T0 = '2026-07-16T08:00:00.000Z';
const workforceContext = { activeUserIds: ['user-avery', 'user-priya', 'user-lee', 'user-nadia'] };

function deliveryContext(state = createInitialRevenueOpsState()): DeliveryContext {
  return { activeAccountIds: ['account-alpha'], activeAddressIds: ['address-alpha'], addressAccountIds: { 'address-alpha': 'account-alpha' }, activeUserIds: workforceContext.activeUserIds, workforceProfiles: workforceCapacityProfiles(state), approvedAvailabilityHours: {}, reservedAllocationHours: {} };
}

function projectWithTask() {
  let state = createInitialRevenueOpsState();
  state = createProject(state, { accountId: 'account-alpha', name: 'Capacity-governed rollout', deliveryModel: 'time-and-materials', budgetAmount: 300000, plannedHours: 40, startDate: '2026-07-16', targetDate: '2026-07-31', managerUserId: 'user-avery' }, 'user-avery', deliveryContext(state), 'project-capacity', T0);
  state = decideProject(state, { id: 'project-capacity', decision: 'active', remarks: 'Delivery owner and capacity boundary independently reviewed.', expectedVersion: 1 }, 'user-priya', T0);
  state = createProjectTask(state, { projectId: 'project-capacity', title: 'Run branch readiness workshop', plannedHours: 6, billable: true, assigneeUserId: 'user-lee', dueDate: '2026-07-18' }, 'user-avery', deliveryContext(state), 'task-capacity', T0);
  return state;
}

describe('workforce capacity command', () => {
  it('independently activates employee capacity and prevents the requester from approving their own availability exception', () => {
    let state = createInitialRevenueOpsState();
    state = createWorkforceProfile(state, { userId: 'user-nadia', employeeCode: 'EBI-004', department: 'Service Delivery', jobTitle: 'Customer Success Lead', employmentType: 'employee', standardDailyHours: 7.5, hourlyCost: 920, fieldEligible: false, skills: ['onboarding', 'adoption'], effectiveFrom: '2026-07-16' }, 'user-avery', workforceContext, 'profile-nadia', T0);
    expect(() => decideWorkforceProfile(state, { id: 'profile-nadia', decision: 'active', remarks: 'Independent profile review is required.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker');
    state = decideWorkforceProfile(state, { id: 'profile-nadia', decision: 'active', remarks: 'Employment capacity and rate independently approved.', expectedVersion: 1 }, 'user-priya', T0);
    state = recordWorkforceAvailability(state, { workforceProfileId: 'profile-nadia', workDate: '2026-07-20', kind: 'leave', availableHours: 0, reason: 'Approved personal leave request.' }, 'user-nadia', 'availability-nadia', T0);
    expect(() => decideWorkforceAvailability(state, { id: 'availability-nadia', decision: 'approved', remarks: 'Availability exception reviewed independently.', expectedVersion: 1 }, 'user-nadia', T0)).toThrow('requester');
    state = decideWorkforceAvailability(state, { id: 'availability-nadia', decision: 'approved', remarks: 'Availability exception reviewed independently.', expectedVersion: 1 }, 'user-priya', T0);
    expect(state.workforceProfiles.find(({ id }) => id === 'profile-nadia')).toMatchObject({ status: 'active', hourlyCost: 920 });
    expect(state.workforceAvailabilities[0]).toMatchObject({ kind: 'leave', availableHours: 0, status: 'approved' });
  });

  it('reserves project effort only inside approved capacity and allows accountable cancellation', () => {
    let state = projectWithTask();
    state = recordWorkforceAvailability(state, { workforceProfileId: 'workforce-lee', workDate: '2026-07-17', kind: 'training', availableHours: 4, reason: 'Mandatory product-certification session.' }, 'user-lee', 'availability-lee', T0);
    state = decideWorkforceAvailability(state, { id: 'availability-lee', decision: 'approved', remarks: 'Training availability reduction accepted.', expectedVersion: 1 }, 'user-priya', T0);
    state = createWorkforceAllocation(state, { workforceProfileId: 'workforce-lee', projectTaskId: 'task-capacity', workDate: '2026-07-17', allocatedHours: 4 }, 'user-avery', 'allocation-1', T0);
    expect(() => createWorkforceAllocation(state, { workforceProfileId: 'workforce-lee', projectTaskId: 'task-capacity', workDate: '2026-07-17', allocatedHours: 1 }, 'user-avery', 'allocation-over-capacity', T0)).toThrow('capacity');
    state = cancelWorkforceAllocation(state, { id: 'allocation-1', reason: 'Customer workshop moved to the following day.', expectedVersion: 1 }, 'user-avery', T0);
    expect(state.workforceAllocations[0]).toMatchObject({ status: 'cancelled', cancellationReason: 'Customer workshop moved to the following day.' });
  });
});
