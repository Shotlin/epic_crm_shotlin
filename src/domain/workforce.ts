import { randomUUID } from 'node:crypto';
import type {
  CancelWorkforceAllocationInput,
  CreateWorkforceAllocationInput,
  CreateWorkforceProfileInput,
  DecideWorkforceAvailabilityInput,
  DecideWorkforceProfileInput,
  RecordWorkforceAvailabilityInput,
  WorkforceCapacityProfile,
  WorkforceContext,
  WorkforceProfile,
} from '../shared/workforce-contracts';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

const mutate = (state: RevenueOpsState): RevenueOpsState => { const next = structuredClone(state); next.revision += 1; return next; };
const clean = (value: string, label: string, min = 2, max = 160): string => { const normalized = value.trim().replace(/\s+/g, ' '); if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`); return normalized; };
const validDate = (value: string, label: string): string => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) throw new Error(`${label} must use YYYY-MM-DD.`); return value; };
const hours = (value: number): number => Number(value.toFixed(4));
const money = (value: number): number => Math.round(value * 100) / 100;
const fiscalNumber = (prefix: string, sequence: number, at: string): string => { const date = new Date(at); const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1; return `${prefix}-${String(year).slice(-2)}-${String(year + 1).slice(-2)}-${String(sequence).padStart(5, '0')}`; };

function activeUser(context: WorkforceContext, userId: string): void { if (!context.activeUserIds.includes(userId)) throw new Error('Workforce record requires an active kernel user.'); }
function profileForUser(state: RevenueOpsState, userId: string): WorkforceProfile | undefined { return state.workforceProfiles.find((profile) => profile.userId === userId && profile.status === 'active'); }
function activeProfile(state: RevenueOpsState, id: string): WorkforceProfile { const profile = state.workforceProfiles.find(({ id: candidate, status }) => candidate === id && status === 'active'); if (!profile) throw new Error('Workforce profile is inactive or unavailable.'); return profile; }

function fieldHoursForDate(state: RevenueOpsState, userId: string, workDate: string): number {
  return state.fieldServiceJobs.filter((job) => job.technicianUserId === userId && !['completed', 'cancelled'].includes(job.status) && job.scheduledStart.slice(0, 10) === workDate).reduce((total, job) => total + Math.max(0, Date.parse(job.scheduledEnd) - Date.parse(job.scheduledStart)) / 3_600_000, 0);
}

function availableHoursFor(state: RevenueOpsState, profile: WorkforceProfile, workDate: string): number {
  const exception = state.workforceAvailabilities.find((entry) => entry.workforceProfileId === profile.id && entry.workDate === workDate && entry.status === 'approved');
  return exception ? exception.availableHours : profile.standardDailyHours;
}

function capacityRemaining(state: RevenueOpsState, profile: WorkforceProfile, workDate: string): number {
  const allocated = state.workforceAllocations.filter((allocation) => allocation.workforceProfileId === profile.id && allocation.workDate === workDate && allocation.status === 'reserved').reduce((total, allocation) => total + allocation.allocatedHours, 0);
  return hours(Math.max(0, availableHoursFor(state, profile, workDate) - allocated - fieldHoursForDate(state, profile.userId, workDate)));
}

export function workforceCapacityProfiles(state: RevenueOpsState): WorkforceCapacityProfile[] {
  return state.workforceProfiles.filter(({ status }) => status === 'active').map((profile) => ({ userId: profile.userId, workforceProfileId: profile.id, standardDailyHours: profile.standardDailyHours, hourlyCost: profile.hourlyCost, fieldEligible: profile.fieldEligible }));
}

export function createWorkforceProfile(state: RevenueOpsState, input: CreateWorkforceProfileInput, actorId: string, context: WorkforceContext, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  activeUser(context, input.userId);
  const employeeCode = clean(input.employeeCode, 'Employee code', 3, 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(employeeCode) || state.workforceProfiles.some((profile) => profile.employeeCode === employeeCode)) throw new Error('Employee code must be unique and use uppercase letters, digits, or hyphens.');
  if (state.workforceProfiles.some((profile) => profile.userId === input.userId && !['rejected', 'suspended'].includes(profile.status))) throw new Error('This user already has a current workforce profile.');
  const effectiveFrom = validDate(input.effectiveFrom, 'Workforce effective-from date');
  if (!Number.isFinite(input.standardDailyHours) || input.standardDailyHours <= 0 || input.standardDailyHours > 24 || !Number.isFinite(input.hourlyCost) || input.hourlyCost < 0 || input.hourlyCost > 10_000_000) throw new Error('Standard daily hours or hourly cost are invalid.');
  const skills = [...new Set(input.skills.map((skill) => clean(skill, 'Workforce skill', 2, 80)))];
  const next = mutate(state); next.workforceProfiles.unshift({ id, number: fiscalNumber('EMP', state.workforceProfiles.length + 1, now), userId: input.userId, employeeCode, department: clean(input.department, 'Department'), jobTitle: clean(input.jobTitle, 'Job title'), employmentType: input.employmentType, standardDailyHours: hours(input.standardDailyHours), hourlyCost: money(input.hourlyCost), fieldEligible: input.fieldEligible, skills, effectiveFrom, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 }); return next;
}

export function decideWorkforceProfile(state: RevenueOpsState, input: DecideWorkforceProfileInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const profile = state.workforceProfiles.find(({ id }) => id === input.id);
  if (!profile || profile.status !== 'submitted' || profile.version !== input.expectedVersion) throw new Error('Workforce profile is stale or no longer awaiting activation.');
  if (profile.requestedBy === actorId) throw new Error('Workforce-profile maker cannot activate the same profile.');
  if (input.decision === 'active' && profileForUser(state, profile.userId)) throw new Error('A user may have only one active workforce profile.');
  const next = mutate(state); next.workforceProfiles = next.workforceProfiles.map((item) => item.id === profile.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Workforce decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function recordWorkforceAvailability(state: RevenueOpsState, input: RecordWorkforceAvailabilityInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const profile = activeProfile(state, input.workforceProfileId);
  if (profile.userId !== actorId) throw new Error('Only the workforce member can submit their availability exception.');
  const workDate = validDate(input.workDate, 'Availability work date');
  if (!Number.isFinite(input.availableHours) || input.availableHours < 0 || input.availableHours > profile.standardDailyHours) throw new Error('Availability hours exceed the active workforce profile capacity.');
  if (state.workforceAvailabilities.some((entry) => entry.workforceProfileId === profile.id && entry.workDate === workDate && entry.status !== 'rejected')) throw new Error('Only one current availability exception is allowed per workforce member and day.');
  const next = mutate(state); next.workforceAvailabilities.unshift({ id, number: fiscalNumber('AVL', state.workforceAvailabilities.length + 1, now), workforceProfileId: profile.id, userId: profile.userId, workDate, kind: input.kind, availableHours: hours(input.availableHours), reason: clean(input.reason, 'Availability reason', 4), status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 }); return next;
}

export function decideWorkforceAvailability(state: RevenueOpsState, input: DecideWorkforceAvailabilityInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const entry = state.workforceAvailabilities.find(({ id }) => id === input.id);
  if (!entry || entry.status !== 'submitted' || entry.version !== input.expectedVersion) throw new Error('Availability exception is stale or no longer awaiting review.');
  if (entry.requestedBy === actorId) throw new Error('Availability requester cannot decide the same exception.');
  const profile = activeProfile(state, entry.workforceProfileId);
  if (input.decision === 'approved') {
    const reserved = state.workforceAllocations.filter((allocation) => allocation.workforceProfileId === profile.id && allocation.workDate === entry.workDate && allocation.status === 'reserved').reduce((total, allocation) => total + allocation.allocatedHours, 0);
    const field = fieldHoursForDate(state, profile.userId, entry.workDate);
    if (reserved + field > entry.availableHours) throw new Error('Approved availability cannot reduce capacity below reserved project or field work.');
  }
  const next = mutate(state); next.workforceAvailabilities = next.workforceAvailabilities.map((item) => item.id === entry.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Availability decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createWorkforceAllocation(state: RevenueOpsState, input: CreateWorkforceAllocationInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const profile = activeProfile(state, input.workforceProfileId); const task = state.projectTasks.find(({ id }) => id === input.projectTaskId); const project = task && state.deliveryProjects.find(({ id }) => id === task.projectId);
  if (!task || !project || !['active', 'on-hold'].includes(project.status) || ['completed', 'cancelled'].includes(task.status) || task.assigneeUserId !== profile.userId || actorId !== project.managerUserId) throw new Error('Workforce allocation must be created by the active project manager for the assigned worker.');
  const workDate = validDate(input.workDate, 'Allocation work date');
  if (workDate < project.startDate || workDate > project.targetDate || !Number.isFinite(input.allocatedHours) || input.allocatedHours <= 0 || input.allocatedHours > 24) throw new Error('Workforce allocation schedule or hours are invalid.');
  const allocatedToTask = state.workforceAllocations.filter((allocation) => allocation.projectTaskId === task.id && allocation.status === 'reserved').reduce((total, allocation) => total + allocation.allocatedHours, 0);
  if (allocatedToTask + input.allocatedHours > task.plannedHours || input.allocatedHours > capacityRemaining(state, profile, workDate)) throw new Error('Workforce allocation exceeds task plan or approved daily capacity.');
  const next = mutate(state); next.workforceAllocations.unshift({ id, number: fiscalNumber('WAL', state.workforceAllocations.length + 1, now), workforceProfileId: profile.id, userId: profile.userId, projectId: project.id, projectTaskId: task.id, workDate, allocatedHours: hours(input.allocatedHours), status: 'reserved', createdBy: actorId, createdAt: now, version: 1 }); return next;
}

export function cancelWorkforceAllocation(state: RevenueOpsState, input: CancelWorkforceAllocationInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const allocation = state.workforceAllocations.find(({ id }) => id === input.id); const project = allocation && state.deliveryProjects.find(({ id }) => id === allocation.projectId);
  if (!allocation || !project || allocation.status !== 'reserved' || allocation.version !== input.expectedVersion || actorId !== project.managerUserId) throw new Error('Only the project manager may cancel a current workforce allocation.');
  const next = mutate(state); next.workforceAllocations = next.workforceAllocations.map((item) => item.id === allocation.id ? { ...item, status: 'cancelled', cancelledAt: now, cancellationReason: clean(input.reason, 'Allocation cancellation reason', 4), version: item.version + 1 } : item); return next;
}
