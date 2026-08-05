import type { WorkforceCapacityProfile } from './workforce-contracts';
import type { OperatingRecordScope } from './revenue-ops-contracts';

export type DeliveryPriority = 'critical' | 'high' | 'normal' | 'low';

export interface DeliveryContext {
  activeAccountIds: string[];
  activeAddressIds: string[];
  addressAccountIds: Record<string, string | undefined>;
  activeUserIds: string[];
  workforceProfiles: WorkforceCapacityProfile[];
  approvedAvailabilityHours: Record<string, number>;
  reservedAllocationHours: Record<string, number>;
}

export interface DeliveryProject {
  id: string;
  number: string;
  accountId?: string;
  salesOrderId?: string;
  name: string;
  deliveryModel: 'fixed-price' | 'time-and-materials' | 'internal';
  budgetAmount: number;
  plannedHours: number;
  startDate: string;
  targetDate: string;
  managerUserId: string;
  status: 'submitted' | 'active' | 'on-hold' | 'completed' | 'cancelled' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  holdReason?: string;
  completedAt?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface ProjectTask {
  id: string;
  number: string;
  projectId: string;
  sequence: number;
  title: string;
  description?: string;
  plannedHours: number;
  actualApprovedHours: number;
  billable: boolean;
  assigneeUserId: string;
  dueDate: string;
  status: 'planned' | 'in-progress' | 'blocked' | 'completed' | 'cancelled';
  blockedReason?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface TimeEntry {
  id: string;
  number: string;
  projectId: string;
  projectTaskId: string;
  workDate: string;
  hours: number;
  billable: boolean;
  hourlyCost: number;
  costAmount: number;
  notes: string;
  status: 'submitted' | 'approved' | 'rejected';
  submittedBy: string;
  submittedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface SlaTarget {
  priority: DeliveryPriority;
  responseMinutes: number;
  resolutionMinutes: number;
}

export interface ServiceAgreement {
  id: string;
  number: string;
  accountId: string;
  projectId?: string;
  name: string;
  coverage: 'remote' | 'on-site' | 'hybrid';
  effectiveFrom: string;
  effectiveTo: string;
  includedHours: number;
  targets: SlaTarget[];
  status: 'submitted' | 'active' | 'rejected' | 'cancelled';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface SupportTicket {
  id: string;
  number: string;
  agreementId: string;
  accountId: string;
  projectId?: string;
  addressId?: string;
  title: string;
  details: string;
  channel: 'portal' | 'email' | 'phone' | 'field';
  priority: DeliveryPriority;
  reportedBy: string;
  reportedAt: string;
  responseDueAt: string;
  resolutionDueAt: string;
  respondedAt?: string;
  resolvedAt?: string;
  assignedTo?: string;
  resolution?: string;
  rootCause?: string;
  status: 'new' | 'triaged' | 'in-progress' | 'pending-customer' | 'resolved' | 'closed' | 'cancelled';
  scope?: OperatingRecordScope;
  version: number;
}

export interface FieldServiceJob {
  id: string;
  number: string;
  ticketId: string;
  accountId: string;
  projectId?: string;
  addressId: string;
  technicianUserId: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: 'planned' | 'dispatched' | 'on-site' | 'completed' | 'cancelled';
  dispatchedAt?: string;
  arrivedAt?: string;
  completedAt?: string;
  report?: string;
  completionEvidenceReference?: string;
  createdBy: string;
  createdAt: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreateProjectInput { accountId?: string; salesOrderId?: string; name: string; deliveryModel: DeliveryProject['deliveryModel']; budgetAmount: number; plannedHours: number; startDate: string; targetDate: string; managerUserId: string }
export interface DecideProjectInput { id: string; decision: 'active' | 'rejected'; remarks: string; expectedVersion: number }
export interface TransitionProjectInput { id: string; toStatus: 'on-hold' | 'completed' | 'cancelled'; reason: string; expectedVersion: number }
export interface CreateProjectTaskInput { projectId: string; title: string; description?: string; plannedHours: number; billable: boolean; assigneeUserId: string; dueDate: string }
export interface TransitionProjectTaskInput { id: string; toStatus: ProjectTask['status']; blockedReason?: string; expectedVersion: number }
export interface RecordTimeEntryInput { projectTaskId: string; workDate: string; hours: number; notes: string }
export interface DecideTimeEntryInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface CreateServiceAgreementInput { accountId: string; projectId?: string; name: string; coverage: ServiceAgreement['coverage']; effectiveFrom: string; effectiveTo: string; includedHours: number; targets: SlaTarget[] }
export interface DecideServiceAgreementInput { id: string; decision: 'active' | 'rejected'; remarks: string; expectedVersion: number }
export interface CreateSupportTicketInput { agreementId: string; projectId?: string; addressId?: string; title: string; details: string; channel: SupportTicket['channel']; priority: DeliveryPriority }
export interface TransitionSupportTicketInput { id: string; toStatus: SupportTicket['status']; assignedTo?: string; resolution?: string; rootCause?: string; expectedVersion: number }
export interface CreateFieldServiceJobInput { ticketId: string; addressId: string; technicianUserId: string; scheduledStart: string; scheduledEnd: string }
export interface TransitionFieldServiceJobInput { id: string; toStatus: FieldServiceJob['status']; report?: string; completionEvidenceReference?: string; expectedVersion: number }
