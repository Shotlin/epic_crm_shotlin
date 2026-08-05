import { describe, expect, it } from 'vitest';
import type { DeliveryContext, SlaTarget } from '../shared/delivery-contracts';
import { createInitialRevenueOpsState } from './revenue-ops';
import {
  createFieldServiceJob,
  createProject,
  createProjectTask,
  createServiceAgreement,
  createSupportTicket,
  decideProject,
  decideServiceAgreement,
  decideTimeEntry,
  recordTimeEntry,
  transitionFieldServiceJob,
  transitionProject,
  transitionProjectTask,
  transitionSupportTicket,
} from './delivery';

const T0 = '2026-07-15T08:00:00.000Z';
const context: DeliveryContext = { activeAccountIds: ['account-alpha'], activeAddressIds: ['address-alpha', 'address-beta'], addressAccountIds: { 'address-alpha': 'account-alpha', 'address-beta': 'account-beta' }, activeUserIds: ['user-avery', 'user-priya', 'user-lee'], workforceProfiles: [{ userId: 'user-avery', workforceProfileId: 'workforce-avery', standardDailyHours: 8, hourlyCost: 1250, fieldEligible: true }, { userId: 'user-priya', workforceProfileId: 'workforce-priya', standardDailyHours: 8, hourlyCost: 1050, fieldEligible: false }, { userId: 'user-lee', workforceProfileId: 'workforce-lee', standardDailyHours: 8, hourlyCost: 780, fieldEligible: true }], approvedAvailabilityHours: {}, reservedAllocationHours: {} };
const targets: SlaTarget[] = [
  { priority: 'critical', responseMinutes: 30, resolutionMinutes: 240 },
  { priority: 'high', responseMinutes: 60, resolutionMinutes: 480 },
  { priority: 'normal', responseMinutes: 240, resolutionMinutes: 1_440 },
  { priority: 'low', responseMinutes: 480, resolutionMinutes: 2_880 },
];

function activeProject() {
  let state = createInitialRevenueOpsState();
  state = createProject(state, { accountId: 'account-alpha', name: 'Branch launch delivery', deliveryModel: 'fixed-price', budgetAmount: 500000, plannedHours: 80, startDate: '2026-07-15', targetDate: '2026-08-15', managerUserId: 'user-avery' }, 'user-avery', context, 'project-1', T0);
  return decideProject(state, { id: 'project-1', decision: 'active', remarks: 'Commercial scope, manager and delivery budget independently confirmed.', expectedVersion: 1 }, 'user-priya', T0);
}

function activeAgreement() {
  let state = activeProject();
  state = createServiceAgreement(state, { accountId: 'account-alpha', projectId: 'project-1', name: 'Branch launch hypercare', coverage: 'hybrid', effectiveFrom: '2026-07-01', effectiveTo: '2026-12-31', includedHours: 40, targets }, 'user-avery', context, 'agreement-1', T0);
  return decideServiceAgreement(state, { id: 'agreement-1', decision: 'active', remarks: 'Coverage, customer scope and priority targets independently accepted.', expectedVersion: 1 }, 'user-priya', T0);
}

describe('customer delivery command', () => {
  it('governs a project through independent activation, task execution and independent time approval', () => {
    let state = activeProject();
    expect(state.deliveryProjects[0]).toMatchObject({ number: 'PRJ-26-27-00001', status: 'active', decidedBy: 'user-priya' });
    state = createProjectTask(state, { projectId: 'project-1', title: 'Configure branch operating model', description: 'Configure the governed processes, operators and branch work queues.', plannedHours: 12, billable: true, assigneeUserId: 'user-lee', dueDate: '2026-07-20' }, 'user-avery', context, 'task-1', T0);
    state = transitionProjectTask(state, { id: 'task-1', toStatus: 'in-progress', expectedVersion: 1 }, 'user-lee', T0);
    state = recordTimeEntry(state, { projectTaskId: 'task-1', workDate: '2026-07-16', hours: 6.5, notes: 'Configured the branch delivery queue and evidence templates.' }, 'user-lee', context, 'time-1', T0);
    expect(state.timeEntries[0]).toMatchObject({ hourlyCost: 780, costAmount: 5070 });
    expect(() => decideTimeEntry(state, { id: 'time-1', decision: 'approved', remarks: 'Work evidence and billable effort reviewed.', expectedVersion: 1 }, 'user-lee', T0)).toThrow('independent');
    state = decideTimeEntry(state, { id: 'time-1', decision: 'approved', remarks: 'Work evidence and billable effort reviewed.', expectedVersion: 1 }, 'user-avery', T0);
    expect(state.projectTasks[0]).toMatchObject({ actualApprovedHours: 6.5, status: 'in-progress' });
    state = transitionProjectTask(state, { id: 'task-1', toStatus: 'completed', expectedVersion: 3 }, 'user-lee', T0);
    state = transitionProject(state, { id: 'project-1', toStatus: 'completed', reason: 'All scoped delivery tasks and time reviews are complete.', expectedVersion: 2 }, 'user-avery', T0);
    expect(state.deliveryProjects[0]).toMatchObject({ status: 'completed', completedAt: T0 });
  });

  it('enforces active SLA scope, response clocks, assigned support ownership and field-service completion evidence', () => {
    let state = activeAgreement();
    expect(state.serviceAgreements[0]).toMatchObject({ number: 'SVC-26-27-00001', status: 'active' });
    expect(state.serviceAgreements[0]?.targets.find(({ priority }) => priority === 'critical')).toMatchObject({ responseMinutes: 30, resolutionMinutes: 240 });
    expect(() => createServiceAgreement(state, { accountId: 'account-alpha', projectId: 'project-1', name: 'Overlapping agreement', coverage: 'remote', effectiveFrom: '2026-08-01', effectiveTo: '2026-10-01', includedHours: 10, targets }, 'user-lee', context, 'agreement-2', T0)).not.toThrow();
    const overlapping = createServiceAgreement(state, { accountId: 'account-alpha', projectId: 'project-1', name: 'Overlapping agreement', coverage: 'remote', effectiveFrom: '2026-08-01', effectiveTo: '2026-10-01', includedHours: 10, targets }, 'user-lee', context, 'agreement-2', T0);
    expect(() => decideServiceAgreement(overlapping, { id: 'agreement-2', decision: 'active', remarks: 'This must be rejected due to overlapping active scope.', expectedVersion: 1 }, 'user-priya', T0)).toThrow('may not overlap');
    expect(() => createSupportTicket(state, { agreementId: 'agreement-1', addressId: 'address-beta', title: 'Wrong customer site', details: 'This address must not be accepted for another customer.', channel: 'phone', priority: 'normal' }, 'user-avery', context, 'ticket-wrong-site', T0)).toThrow('same customer');
    state = createSupportTicket(state, { agreementId: 'agreement-1', projectId: 'project-1', addressId: 'address-alpha', title: 'Branch scanner is offline', details: 'The primary scanner cannot reach the configured inventory endpoint.', channel: 'phone', priority: 'high' }, 'user-avery', context, 'ticket-1', T0);
    expect(state.supportTickets[0]).toMatchObject({ number: 'SUP-26-27-00001', responseDueAt: '2026-07-15T09:00:00.000Z', resolutionDueAt: '2026-07-15T16:00:00.000Z', status: 'new' });
    state = transitionSupportTicket(state, { id: 'ticket-1', toStatus: 'triaged', assignedTo: 'user-lee', expectedVersion: 1 }, 'user-avery', context, T0);
    state = transitionSupportTicket(state, { id: 'ticket-1', toStatus: 'in-progress', expectedVersion: 2 }, 'user-lee', context, T0);
    const deskOnlyContext: DeliveryContext = { ...context, workforceProfiles: context.workforceProfiles.map((profile) => profile.userId === 'user-lee' ? { ...profile, fieldEligible: false } : profile) };
    expect(() => createFieldServiceJob(state, { ticketId: 'ticket-1', addressId: 'address-alpha', technicianUserId: 'user-lee', scheduledStart: '2026-07-16T09:00:00.000Z', scheduledEnd: '2026-07-16T11:00:00.000Z' }, 'user-lee', deskOnlyContext, 'field-desk-only', T0)).toThrow('field-eligible');
    const capacityLockedContext: DeliveryContext = { ...context, approvedAvailabilityHours: { 'user-lee:2026-07-16': 4 }, reservedAllocationHours: { 'user-lee:2026-07-16': 4 } };
    expect(() => createFieldServiceJob(state, { ticketId: 'ticket-1', addressId: 'address-alpha', technicianUserId: 'user-lee', scheduledStart: '2026-07-16T09:00:00.000Z', scheduledEnd: '2026-07-16T11:00:00.000Z' }, 'user-lee', capacityLockedContext, 'field-over-capacity', T0)).toThrow('capacity');
    state = createFieldServiceJob(state, { ticketId: 'ticket-1', addressId: 'address-alpha', technicianUserId: 'user-lee', scheduledStart: '2026-07-16T09:00:00.000Z', scheduledEnd: '2026-07-16T11:00:00.000Z' }, 'user-lee', context, 'field-1', T0);
    state = transitionFieldServiceJob(state, { id: 'field-1', toStatus: 'dispatched', expectedVersion: 1 }, 'user-lee', T0);
    state = transitionFieldServiceJob(state, { id: 'field-1', toStatus: 'on-site', expectedVersion: 2 }, 'user-lee', T0);
    expect(() => transitionFieldServiceJob(state, { id: 'field-1', toStatus: 'completed', expectedVersion: 3 }, 'user-lee', T0)).toThrow('completion evidence');
    state = transitionFieldServiceJob(state, { id: 'field-1', toStatus: 'completed', report: 'Restored scanner network settings, verified endpoint reachability and captured user confirmation.', completionEvidenceReference: 'CUSTOMER-SIGN-260716', expectedVersion: 3 }, 'user-lee', T0);
    state = transitionSupportTicket(state, { id: 'ticket-1', toStatus: 'resolved', resolution: 'Field technician restored the endpoint and verified the scanner with branch staff.', rootCause: 'Local network profile was changed outside the approved branch template.', expectedVersion: 3 }, 'user-lee', context, T0);
    state = transitionSupportTicket(state, { id: 'ticket-1', toStatus: 'closed', expectedVersion: 4 }, 'user-avery', context, T0);
    expect(state.fieldServiceJobs[0]).toMatchObject({ status: 'completed', completionEvidenceReference: 'CUSTOMER-SIGN-260716' });
    expect(state.supportTickets[0]).toMatchObject({ status: 'closed', assignedTo: 'user-lee', rootCause: 'Local network profile was changed outside the approved branch template.' });
  });
});
