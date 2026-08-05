export type EmploymentType = 'employee' | 'contractor' | 'consultant';
export type WorkforceProfileStatus = 'submitted' | 'active' | 'rejected' | 'suspended';
export type AvailabilityKind = 'working' | 'leave' | 'holiday' | 'training' | 'unavailable';

export interface WorkforceProfile {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  userId: string;
  employeeCode: string;
  department: string;
  jobTitle: string;
  employmentType: EmploymentType;
  standardDailyHours: number;
  hourlyCost: number;
  fieldEligible: boolean;
  skills: string[];
  effectiveFrom: string;
  status: WorkforceProfileStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface WorkforceAvailability {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  workforceProfileId: string;
  userId: string;
  workDate: string;
  kind: AvailabilityKind;
  availableHours: number;
  reason: string;
  status: 'submitted' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface WorkforceAllocation {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  workforceProfileId: string;
  userId: string;
  projectId: string;
  projectTaskId: string;
  workDate: string;
  allocatedHours: number;
  status: 'reserved' | 'cancelled';
  createdBy: string;
  createdAt: string;
  cancelledAt?: string;
  cancellationReason?: string;
  version: number;
}

export interface WorkforceContext {
  activeUserIds: string[];
}

export interface WorkforceCapacityProfile {
  userId: string;
  workforceProfileId: string;
  standardDailyHours: number;
  hourlyCost: number;
  fieldEligible: boolean;
}

export interface CreateWorkforceProfileInput {
  userId: string;
  employeeCode: string;
  department: string;
  jobTitle: string;
  employmentType: EmploymentType;
  standardDailyHours: number;
  hourlyCost: number;
  fieldEligible: boolean;
  skills: string[];
  effectiveFrom: string;
}

export interface DecideWorkforceProfileInput {
  id: string;
  decision: 'active' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface RecordWorkforceAvailabilityInput {
  workforceProfileId: string;
  workDate: string;
  kind: AvailabilityKind;
  availableHours: number;
  reason: string;
}

export interface DecideWorkforceAvailabilityInput {
  id: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreateWorkforceAllocationInput {
  workforceProfileId: string;
  projectTaskId: string;
  workDate: string;
  allocatedHours: number;
}

export interface CancelWorkforceAllocationInput {
  id: string;
  reason: string;
  expectedVersion: number;
}
import type { OperatingRecordScope } from './revenue-ops-contracts';
