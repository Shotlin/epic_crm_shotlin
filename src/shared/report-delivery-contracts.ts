import type { OperatingRecordScope } from './revenue-ops-contracts';

export type RetailReportDeliveryChannel = 'email' | 'whatsapp';
export type RetailReportDeliveryFrequency = 'daily' | 'weekly' | 'monthly';
export type RetailReportDeliveryPlanStatus = 'draft' | 'approved' | 'rejected' | 'paused';
export type RetailReportDeliveryAttemptStatus = 'prepared' | 'handed-off' | 'acknowledged' | 'failed';

export interface RetailReportDeliveryRecipient {
  id: string;
  kind: 'internal-user' | 'customer-contact';
  label: string;
  destination: string;
  consentId?: string;
}

export interface RetailReportDeliveryPlan {
  scope: OperatingRecordScope;
  id: string;
  number: string;
  reportPackId: string;
  channel: RetailReportDeliveryChannel;
  /** Provider-fabric connector required for certified external delivery. */
  providerConnectorId?: string;
  frequency: RetailReportDeliveryFrequency;
  runDay?: number;
  timeZone: 'Asia/Kolkata';
  windowStart: string;
  windowEnd: string;
  effectiveFrom: string;
  effectiveTo?: string;
  recipients: RetailReportDeliveryRecipient[];
  notes: string;
  status: RetailReportDeliveryPlanStatus;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface RetailReportDeliveryAttempt {
  scope: OperatingRecordScope;
  id: string;
  number: string;
  planId: string;
  reportPackId: string;
  channel: RetailReportDeliveryChannel;
  slotKey: string;
  idempotencyKey: string;
  recipientCount: number;
  payloadChecksum: string;
  status: RetailReportDeliveryAttemptStatus;
  preparedBy: string;
  preparedAt: string;
  handedOffAt?: string;
  acknowledgedAt?: string;
  externalReference?: string;
  responseChecksum?: string;
  errorMessage?: string;
  version: number;
}

export interface RetailReportDeliveryState {
  plans: RetailReportDeliveryPlan[];
  attempts: RetailReportDeliveryAttempt[];
}

export interface CreateRetailReportDeliveryPlanInput {
  reportPackId: string;
  channel: RetailReportDeliveryChannel;
  providerConnectorId?: string;
  frequency: RetailReportDeliveryFrequency;
  runDay?: number;
  windowStart: string;
  windowEnd: string;
  effectiveFrom: string;
  effectiveTo?: string;
  recipients: RetailReportDeliveryRecipient[];
  notes: string;
}

export interface DecideRetailReportDeliveryPlanInput {
  id: string;
  decision: 'approved' | 'rejected';
  expectedVersion: number;
  remarks: string;
}

export interface PrepareRetailReportDeliveryAttemptInput {
  id: string;
  expectedVersion: number;
  now?: string;
}

export interface RecordRetailReportDeliveryResultInput {
  id: string;
  outcome: Exclude<RetailReportDeliveryAttemptStatus, 'prepared'>;
  externalReference?: string;
  responseChecksum?: string;
  errorMessage?: string;
  expectedVersion: number;
}
