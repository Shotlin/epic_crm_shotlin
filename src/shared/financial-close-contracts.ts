export type ProjectBillingModel = 'time-and-materials' | 'milestone';

export interface ProjectBillingPlan {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  projectId: string;
  salesOrderId: string;
  salesOrderLineId: string;
  billingModel: ProjectBillingModel;
  billRate: number;
  effectiveFrom: string;
  effectiveTo: string;
  status: 'submitted' | 'active' | 'rejected' | 'cancelled';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface ProjectBillingClaim {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  planId: string;
  projectId: string;
  salesOrderId: string;
  salesOrderLineId: string;
  billingPeriodFrom: string;
  billingPeriodTo: string;
  timeEntryIds: string[];
  milestoneIds: string[];
  recognizedAmount: number;
  status: 'submitted' | 'recognized' | 'rejected' | 'invoiced';
  requestedBy: string;
  requestedAt: string;
  recognizedBy?: string;
  recognizedAt?: string;
  recognitionRemarks?: string;
  recognitionEventId?: string;
  invoiceId?: string;
  version: number;
}

export interface RevenueRecognitionEvent {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  claimId: string;
  projectId: string;
  recognitionDate: string;
  amount: number;
  journalDraftId: string;
  recognizedBy: string;
  recognizedAt: string;
  version: number;
}

export interface ServiceEntitlementUsage {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  serviceAgreementId: string;
  timeEntryId: string;
  projectId: string;
  hours: number;
  status: 'included' | 'overage';
  consumedBy: string;
  consumedAt: string;
  version: number;
}

export interface AccountingClosePeriod {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  name: string;
  periodFrom: string;
  periodTo: string;
  status: 'submitted' | 'closed' | 'rejected' | 'reopened';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  reopenedBy?: string;
  reopenedAt?: string;
  reopenReason?: string;
  version: number;
}

export interface CreateProjectBillingPlanInput {
  projectId: string;
  salesOrderId: string;
  salesOrderLineId: string;
  billingModel: ProjectBillingModel;
  billRate: number;
  effectiveFrom: string;
  effectiveTo: string;
}

export interface DecideProjectBillingPlanInput {
  id: string;
  decision: 'active' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreateProjectBillingClaimInput {
  planId: string;
  billingPeriodFrom: string;
  billingPeriodTo: string;
  timeEntryIds: string[];
  milestoneIds: string[];
}

export interface DecideProjectBillingClaimInput {
  id: string;
  decision: 'recognized' | 'rejected';
  recognitionDate: string;
  remarks: string;
  expectedVersion: number;
}

export interface ConsumeServiceEntitlementInput {
  serviceAgreementId: string;
  timeEntryId: string;
}

export interface CreateAccountingClosePeriodInput {
  name: string;
  periodFrom: string;
  periodTo: string;
}

export interface DecideAccountingClosePeriodInput {
  id: string;
  decision: 'closed' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface ReopenAccountingClosePeriodInput {
  id: string;
  reason: string;
  expectedVersion: number;
}
import type { OperatingRecordScope } from './revenue-ops-contracts';
