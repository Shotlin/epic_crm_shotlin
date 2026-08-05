import { randomUUID } from 'node:crypto';
import type {
  CreateFieldServiceJobInput,
  CreateProjectInput,
  CreateProjectTaskInput,
  CreateServiceAgreementInput,
  CreateSupportTicketInput,
  DecideProjectInput,
  DecideServiceAgreementInput,
  DecideTimeEntryInput,
  DeliveryContext,
  DeliveryPriority,
  FieldServiceJob,
  RecordTimeEntryInput,
  SlaTarget,
  TransitionFieldServiceJobInput,
  TransitionProjectInput,
  TransitionProjectTaskInput,
  TransitionSupportTicketInput,
} from '../shared/delivery-contracts';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

const money = (value: number): number => Math.round(value * 100) / 100;
const hours = (value: number): number => Number(value.toFixed(4));
const mutate = (state: RevenueOpsState): RevenueOpsState => { const next = structuredClone(state); next.revision += 1; return next; };
const clean = (value: string, label: string, min = 2, max = 500): string => { const normalized = value.trim().replace(/\s+/g, ' '); if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`); return normalized; };
const validDate = (value: string, label: string): string => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) throw new Error(`${label} must use YYYY-MM-DD.`); return value; };
const validTimestamp = (value: string, label: string): string => { const parsed = Date.parse(value); if (!Number.isFinite(parsed) || !value.includes('T')) throw new Error(`${label} must be an ISO timestamp.`); return new Date(parsed).toISOString(); };
const fiscalNumber = (prefix: string, sequence: number, at: string): string => { const date = new Date(at); const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1; return `${prefix}-${String(year).slice(-2)}-${String(year + 1).slice(-2)}-${String(sequence).padStart(5, '0')}`; };
const datesOverlap = (leftFrom: string, leftTo: string, rightFrom: string, rightTo: string): boolean => leftFrom <= rightTo && rightFrom <= leftTo;
const minutesFrom = (at: string, minutes: number): string => new Date(Date.parse(at) + minutes * 60_000).toISOString();

function activeAccount(context: DeliveryContext, accountId: string): void { if (!context.activeAccountIds.includes(accountId)) throw new Error('Customer-delivery record requires an active account.'); }
function activeUser(context: DeliveryContext, userId: string): void { if (!context.activeUserIds.includes(userId)) throw new Error('Assigned delivery user must be active.'); }
function activeServiceAddress(context: DeliveryContext, addressId: string, accountId: string, label: string): void { if (!context.activeAddressIds.includes(addressId) || context.addressAccountIds[addressId] !== accountId) throw new Error(`${label} must be an active address for the same customer.`); }
function activeWorkforceProfile(context: DeliveryContext, userId: string, fieldRequired = false) { const profile = context.workforceProfiles.find((candidate) => candidate.userId === userId); if (!profile || (fieldRequired && !profile.fieldEligible)) throw new Error(fieldRequired ? 'Field-service technician requires an active field-eligible workforce profile.' : 'Delivery assignee requires an active workforce profile.'); return profile; }
function validTargets(targets: SlaTarget[]): SlaTarget[] {
  const priorities: DeliveryPriority[] = ['critical', 'high', 'normal', 'low'];
  if (targets.length !== priorities.length || new Set(targets.map(({ priority }) => priority)).size !== priorities.length || priorities.some((priority) => !targets.some((target) => target.priority === priority))) throw new Error('Service agreement must specify one SLA target for every priority.');
  return targets.map((target) => {
    if (!Number.isInteger(target.responseMinutes) || target.responseMinutes < 5 || target.responseMinutes > 1_000_000 || !Number.isInteger(target.resolutionMinutes) || target.resolutionMinutes < target.responseMinutes || target.resolutionMinutes > 10_000_000) throw new Error('SLA response and resolution targets are invalid.');
    return { ...target };
  }).sort((left, right) => priorities.indexOf(left.priority) - priorities.indexOf(right.priority));
}

export function createProject(state: RevenueOpsState, input: CreateProjectInput, actorId: string, context: DeliveryContext, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  if (input.accountId) activeAccount(context, input.accountId); activeUser(context, input.managerUserId);
  if (input.deliveryModel !== 'internal' && !input.accountId) throw new Error('Customer-delivery projects require an active account.');
  const order = input.salesOrderId ? state.salesOrders.find(({ id, status }) => id === input.salesOrderId && !['cancelled'].includes(status)) : undefined;
  if (input.salesOrderId && (!order || (input.accountId && order.accountId !== input.accountId))) throw new Error('Project sales order is missing, cancelled, or belongs to another account.');
  const startDate = validDate(input.startDate, 'Project start date'); const targetDate = validDate(input.targetDate, 'Project target date');
  if (targetDate < startDate || !Number.isFinite(input.budgetAmount) || input.budgetAmount < 0 || input.budgetAmount > 1_000_000_000_000 || !Number.isFinite(input.plannedHours) || input.plannedHours <= 0 || input.plannedHours > 10_000_000) throw new Error('Project schedule, budget, or planned hours are invalid.');
  const next = mutate(state); next.deliveryProjects.unshift({ id, number: fiscalNumber('PRJ', state.deliveryProjects.length + 1, now), accountId: input.accountId, salesOrderId: input.salesOrderId, name: clean(input.name, 'Project name'), deliveryModel: input.deliveryModel, budgetAmount: money(input.budgetAmount), plannedHours: hours(input.plannedHours), startDate, targetDate, managerUserId: input.managerUserId, status: 'submitted', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }); return next;
}

export function decideProject(state: RevenueOpsState, input: DecideProjectInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const project = state.deliveryProjects.find(({ id }) => id === input.id);
  if (!project || project.status !== 'submitted' || project.version !== input.expectedVersion) throw new Error('Project is stale or no longer awaiting approval.');
  if (project.requestedBy === actorId) throw new Error('Project maker cannot approve the same project.');
  const next = mutate(state); next.deliveryProjects = next.deliveryProjects.map((item) => item.id === project.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Project decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function transitionProject(state: RevenueOpsState, input: TransitionProjectInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const project = state.deliveryProjects.find(({ id }) => id === input.id);
  if (!project || project.version !== input.expectedVersion || !['active', 'on-hold'].includes(project.status)) throw new Error('Only a current active or on-hold project can transition.');
  if (actorId !== project.managerUserId) throw new Error('Only the project manager can change delivery state.');
  if (input.toStatus === 'completed' && (state.projectTasks.some(({ projectId, status }) => projectId === project.id && !['completed', 'cancelled'].includes(status)) || state.timeEntries.some(({ projectId, status }) => projectId === project.id && status === 'submitted'))) throw new Error('Project completion requires every task terminal and no time entry awaiting approval.');
  if (input.toStatus === 'completed' && (state.projectContractVariations.some(({ projectId, status }) => projectId === project.id && status === 'submitted') || state.projectRetainers.some(({ projectId, status }) => projectId === project.id && status === 'submitted') || state.retainerDrawdowns.some(({ projectId, status }) => projectId === project.id && status === 'submitted') || state.projectResourcePlans.some(({ projectId, status }) => projectId === project.id && status === 'submitted') || state.projectMarginReviews.some(({ projectId, status }) => projectId === project.id && status === 'generated'))) throw new Error('Project completion requires every pending commercial change, drawdown, capacity plan and margin review to be independently decided.');
  const next = mutate(state); next.deliveryProjects = next.deliveryProjects.map((item) => item.id === project.id ? { ...item, status: input.toStatus, holdReason: input.toStatus === 'on-hold' ? clean(input.reason, 'Project hold reason', 4) : undefined, completedAt: input.toStatus === 'completed' ? now : undefined, version: item.version + 1 } : item); return next;
}

export function createProjectTask(state: RevenueOpsState, input: CreateProjectTaskInput, actorId: string, context: DeliveryContext, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const project = state.deliveryProjects.find(({ id, status }) => id === input.projectId && status === 'active');
  if (!project || actorId !== project.managerUserId) throw new Error('Only the manager of an active project can add a delivery task.'); activeUser(context, input.assigneeUserId); activeWorkforceProfile(context, input.assigneeUserId);
  const dueDate = validDate(input.dueDate, 'Task due date'); if (dueDate < project.startDate || dueDate > project.targetDate || !Number.isFinite(input.plannedHours) || input.plannedHours <= 0 || input.plannedHours > 1_000_000) throw new Error('Task schedule or planned effort is invalid.');
  const next = mutate(state); const sequence = state.projectTasks.filter(({ projectId }) => projectId === project.id).length + 1; next.projectTasks.unshift({ id, number: fiscalNumber('TSK', state.projectTasks.length + 1, now), projectId: project.id, sequence, title: clean(input.title, 'Task title'), description: input.description ? clean(input.description, 'Task description', 4) : undefined, plannedHours: hours(input.plannedHours), actualApprovedHours: 0, billable: input.billable, assigneeUserId: input.assigneeUserId, dueDate, status: 'planned', createdBy: actorId, createdAt: now, scope: structuredClone(project.scope ?? next.scope), version: 1 }); return next;
}

export function transitionProjectTask(state: RevenueOpsState, input: TransitionProjectTaskInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const task = state.projectTasks.find(({ id }) => id === input.id); const project = task && state.deliveryProjects.find(({ id }) => id === task.projectId);
  if (!task || !project || task.version !== input.expectedVersion || project.status !== 'active') throw new Error('Task or project is stale, inactive, or unavailable.');
  if (![task.assigneeUserId, project.managerUserId].includes(actorId)) throw new Error('Only the assigned user or project manager can transition a task.');
  const allowed: Record<typeof task.status, Array<typeof task.status>> = { planned: ['in-progress', 'blocked', 'cancelled'], 'in-progress': ['blocked', 'completed'], blocked: ['in-progress', 'cancelled'], completed: [], cancelled: [] };
  if (!allowed[task.status].includes(input.toStatus) || (input.toStatus === 'blocked' && !input.blockedReason)) throw new Error('Task transition is not allowed or lacks a blocked reason.');
  const next = mutate(state); next.projectTasks = next.projectTasks.map((item) => item.id === task.id ? { ...item, status: input.toStatus, blockedReason: input.toStatus === 'blocked' ? clean(input.blockedReason!, 'Task blocked reason', 4) : undefined, completedAt: input.toStatus === 'completed' ? now : undefined, version: item.version + 1 } : item); return next;
}

export function recordTimeEntry(state: RevenueOpsState, input: RecordTimeEntryInput, actorId: string, context: DeliveryContext, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const task = state.projectTasks.find(({ id, status }) => id === input.projectTaskId && status === 'in-progress'); const project = task && state.deliveryProjects.find(({ id, status }) => id === task.projectId && ['active', 'on-hold'].includes(status));
  if (!task || !project || actorId !== task.assigneeUserId) throw new Error('Only the assigned user can submit time against an in-progress project task.'); validDate(input.workDate, 'Time-entry work date');
  if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > 24) throw new Error('Time entry must be between zero and 24 hours.');
  const profile = activeWorkforceProfile(context, actorId); const next = mutate(state); next.timeEntries.unshift({ id, number: fiscalNumber('TIM', state.timeEntries.length + 1, now), projectId: project.id, projectTaskId: task.id, workDate: input.workDate, hours: hours(input.hours), billable: task.billable, hourlyCost: profile.hourlyCost, costAmount: money(input.hours * profile.hourlyCost), notes: clean(input.notes, 'Time-entry notes', 4), status: 'submitted', submittedBy: actorId, submittedAt: now, scope: structuredClone(project.scope ?? next.scope), version: 1 }); return next;
}

export function decideTimeEntry(state: RevenueOpsState, input: DecideTimeEntryInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const entry = state.timeEntries.find(({ id }) => id === input.id); const task = entry && state.projectTasks.find(({ id }) => id === entry.projectTaskId); const project = entry && state.deliveryProjects.find(({ id }) => id === entry.projectId);
  if (!entry || !task || !project || entry.status !== 'submitted' || entry.version !== input.expectedVersion) throw new Error('Time entry is stale or no longer awaiting review.');
  if (entry.submittedBy === actorId || actorId !== project.managerUserId) throw new Error('Time entry needs an independent project-manager decision.');
  const next = mutate(state); next.timeEntries = next.timeEntries.map((item) => item.id === entry.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Time decision remarks', 4), version: item.version + 1 } : item);
  if (input.decision === 'approved') next.projectTasks = next.projectTasks.map((item) => item.id === task.id ? { ...item, actualApprovedHours: hours(item.actualApprovedHours + entry.hours), version: item.version + 1 } : item); return next;
}

export function createServiceAgreement(state: RevenueOpsState, input: CreateServiceAgreementInput, actorId: string, context: DeliveryContext, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  activeAccount(context, input.accountId); const project = input.projectId ? state.deliveryProjects.find(({ id, status }) => id === input.projectId && ['active', 'on-hold'].includes(status)) : undefined;
  if (input.projectId && (!project || project.accountId !== input.accountId)) throw new Error('Service agreement project is inactive or belongs to another account.'); const effectiveFrom = validDate(input.effectiveFrom, 'Agreement effective-from date'); const effectiveTo = validDate(input.effectiveTo, 'Agreement effective-to date');
  if (effectiveTo < effectiveFrom || !Number.isFinite(input.includedHours) || input.includedHours < 0 || input.includedHours > 10_000_000) throw new Error('Service agreement coverage window or included hours are invalid.'); const targets = validTargets(input.targets);
  const next = mutate(state); next.serviceAgreements.unshift({ id, number: fiscalNumber('SVC', state.serviceAgreements.length + 1, now), accountId: input.accountId, projectId: input.projectId, name: clean(input.name, 'Service agreement name'), coverage: input.coverage, effectiveFrom, effectiveTo, includedHours: hours(input.includedHours), targets, status: 'submitted', requestedBy: actorId, requestedAt: now, scope: structuredClone(project?.scope ?? next.scope), version: 1 }); return next;
}

export function decideServiceAgreement(state: RevenueOpsState, input: DecideServiceAgreementInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const agreement = state.serviceAgreements.find(({ id }) => id === input.id);
  if (!agreement || agreement.status !== 'submitted' || agreement.version !== input.expectedVersion) throw new Error('Service agreement is stale or no longer awaiting activation.'); if (agreement.requestedBy === actorId) throw new Error('Service-agreement maker cannot activate the same agreement.');
  if (input.decision === 'active' && state.serviceAgreements.some((item) => item.id !== agreement.id && item.status === 'active' && item.accountId === agreement.accountId && item.projectId === agreement.projectId && datesOverlap(item.effectiveFrom, item.effectiveTo, agreement.effectiveFrom, agreement.effectiveTo))) throw new Error('Active service-agreement periods may not overlap for the same customer scope.');
  const next = mutate(state); next.serviceAgreements = next.serviceAgreements.map((item) => item.id === agreement.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Service agreement decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createSupportTicket(state: RevenueOpsState, input: CreateSupportTicketInput, actorId: string, context: DeliveryContext, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const agreement = state.serviceAgreements.find(({ id, status }) => id === input.agreementId && status === 'active'); const today = now.slice(0, 10);
  if (!agreement || agreement.effectiveFrom > today || agreement.effectiveTo < today) throw new Error('Support ticket requires a currently active service agreement.'); activeAccount(context, agreement.accountId);
  const project = input.projectId ? state.deliveryProjects.find(({ id: candidate, accountId, status }) => candidate === input.projectId && accountId === agreement.accountId && ['active', 'on-hold'].includes(status)) : undefined; if (input.projectId && !project) throw new Error('Support-ticket project is inactive or belongs to another account.'); if (input.addressId) activeServiceAddress(context, input.addressId, agreement.accountId, 'Support-ticket address');
  const target = agreement.targets.find(({ priority }) => priority === input.priority); if (!target) throw new Error('Service agreement is missing a target for this priority.'); const next = mutate(state); next.supportTickets.unshift({ id, number: fiscalNumber('SUP', state.supportTickets.length + 1, now), agreementId: agreement.id, accountId: agreement.accountId, projectId: input.projectId, addressId: input.addressId, title: clean(input.title, 'Support ticket title'), details: clean(input.details, 'Support ticket details', 8), channel: input.channel, priority: input.priority, reportedBy: actorId, reportedAt: now, responseDueAt: minutesFrom(now, target.responseMinutes), resolutionDueAt: minutesFrom(now, target.resolutionMinutes), status: 'new', scope: structuredClone(agreement.scope ?? next.scope), version: 1 }); return next;
}

export function transitionSupportTicket(state: RevenueOpsState, input: TransitionSupportTicketInput, actorId: string, context: DeliveryContext, now = new Date().toISOString()): RevenueOpsState {
  const ticket = state.supportTickets.find(({ id }) => id === input.id); if (!ticket || ticket.version !== input.expectedVersion) throw new Error('Support ticket is stale or unavailable.');
  const allowed: Record<typeof ticket.status, Array<typeof ticket.status>> = { new: ['triaged', 'cancelled'], triaged: ['in-progress', 'cancelled'], 'in-progress': ['pending-customer', 'resolved', 'cancelled'], 'pending-customer': ['in-progress', 'resolved', 'cancelled'], resolved: ['closed'], closed: [], cancelled: [] };
  if (!allowed[ticket.status].includes(input.toStatus)) throw new Error('Support-ticket transition is not allowed.'); const assignedTo = input.assignedTo ?? ticket.assignedTo;
  if (['triaged', 'in-progress'].includes(input.toStatus) && !assignedTo) throw new Error('Triaged or in-progress support tickets require an assignee.'); if (assignedTo) activeUser(context, assignedTo);
  if (input.toStatus === 'resolved' && !input.resolution) throw new Error('Resolved support tickets require a resolution statement.'); if (ticket.assignedTo && actorId !== ticket.assignedTo && input.toStatus !== 'closed') throw new Error('Only the assigned support owner can progress this ticket.');
  const next = mutate(state); next.supportTickets = next.supportTickets.map((item) => item.id === ticket.id ? { ...item, status: input.toStatus, assignedTo, respondedAt: ['triaged', 'in-progress'].includes(input.toStatus) && !item.respondedAt ? now : item.respondedAt, resolvedAt: input.toStatus === 'resolved' ? now : item.resolvedAt, resolution: input.toStatus === 'resolved' ? clean(input.resolution!, 'Support resolution', 6) : item.resolution, rootCause: input.rootCause ? clean(input.rootCause, 'Support root cause', 4) : item.rootCause, version: item.version + 1 } : item); return next;
}

export function createFieldServiceJob(state: RevenueOpsState, input: CreateFieldServiceJobInput, actorId: string, context: DeliveryContext, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const ticket = state.supportTickets.find(({ id, status }) => id === input.ticketId && ['triaged', 'in-progress', 'pending-customer'].includes(status)); if (!ticket) throw new Error('Field-service job needs an active triaged or in-progress support ticket.'); activeServiceAddress(context, input.addressId, ticket.accountId, 'Field-service job address'); activeUser(context, input.technicianUserId); const profile = activeWorkforceProfile(context, input.technicianUserId, true);
  const scheduledStart = validTimestamp(input.scheduledStart, 'Field-service start'); const scheduledEnd = validTimestamp(input.scheduledEnd, 'Field-service end'); if (scheduledEnd <= scheduledStart) throw new Error('Field-service end must follow its scheduled start.');
  const dayKey = `${input.technicianUserId}:${scheduledStart.slice(0, 10)}`; const available = context.approvedAvailabilityHours[dayKey] ?? profile.standardDailyHours; const reserved = context.reservedAllocationHours[dayKey] ?? 0; if (reserved + (Date.parse(scheduledEnd) - Date.parse(scheduledStart)) / 3_600_000 > available) throw new Error('Field-service booking exceeds approved workforce capacity after project allocations.');
  if (state.fieldServiceJobs.some((job) => job.technicianUserId === input.technicianUserId && !['completed', 'cancelled'].includes(job.status) && Date.parse(job.scheduledStart) < Date.parse(scheduledEnd) && Date.parse(scheduledStart) < Date.parse(job.scheduledEnd))) throw new Error('Technician already has a controlled field-service booking in this time window.');
  const next = mutate(state); next.fieldServiceJobs.unshift({ id, number: fiscalNumber('FSJ', state.fieldServiceJobs.length + 1, now), ticketId: ticket.id, accountId: ticket.accountId, projectId: ticket.projectId, addressId: input.addressId, technicianUserId: input.technicianUserId, scheduledStart, scheduledEnd, status: 'planned', createdBy: actorId, createdAt: now, scope: structuredClone(ticket.scope ?? next.scope), version: 1 }); return next;
}

export function transitionFieldServiceJob(state: RevenueOpsState, input: TransitionFieldServiceJobInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const job = state.fieldServiceJobs.find(({ id }) => id === input.id); if (!job || job.version !== input.expectedVersion) throw new Error('Field-service job is stale or unavailable.'); if (actorId !== job.technicianUserId) throw new Error('Only the assigned technician can update this field-service job.');
  const allowed: Record<FieldServiceJob['status'], FieldServiceJob['status'][]> = { planned: ['dispatched', 'cancelled'], dispatched: ['on-site', 'cancelled'], 'on-site': ['completed', 'cancelled'], completed: [], cancelled: [] };
  if (!allowed[job.status].includes(input.toStatus) || (input.toStatus === 'completed' && (!input.report || !input.completionEvidenceReference))) throw new Error('Field-service transition is not allowed or lacks completion evidence.');
  const next = mutate(state); next.fieldServiceJobs = next.fieldServiceJobs.map((item) => item.id === job.id ? { ...item, status: input.toStatus, dispatchedAt: input.toStatus === 'dispatched' ? now : item.dispatchedAt, arrivedAt: input.toStatus === 'on-site' ? now : item.arrivedAt, completedAt: input.toStatus === 'completed' ? now : item.completedAt, report: input.toStatus === 'completed' ? clean(input.report!, 'Field-service report', 8) : item.report, completionEvidenceReference: input.toStatus === 'completed' ? clean(input.completionEvidenceReference!, 'Completion evidence reference', 4, 160) : item.completionEvidenceReference, version: item.version + 1 } : item); return next;
}
