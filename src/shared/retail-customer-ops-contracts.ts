import type { OperatingRecordScope } from './revenue-ops-contracts';

export type RetailVisitChannel = 'store' | 'phone' | 'web';
export type RetailVisitPurpose = 'purchase' | 'enquiry' | 'service' | 'return';

export interface RetailCustomerVisit {
  id: string;
  customerAccountId?: string;
  contactId?: string;
  visitedAt: string;
  channel: RetailVisitChannel;
  purpose: RetailVisitPurpose;
  staffUserId: string;
  sourceReference?: string;
  notes?: string;
  convertedSaleId?: string;
  convertedAt?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreateRetailCustomerVisitInput {
  customerAccountId?: string;
  contactId?: string;
  visitedAt: string;
  channel: RetailVisitChannel;
  purpose: RetailVisitPurpose;
  sourceReference?: string;
  notes?: string;
}

export interface LinkRetailCustomerVisitInput {
  id: string;
  saleId: string;
  expectedVersion: number;
}

export type RetailCommissionStatus = 'pending' | 'approved' | 'paid' | 'void';

export interface RetailSalesCommission {
  id: string;
  saleId: string;
  salespersonUserId: string;
  basisAmount: number;
  ratePercent: number;
  commissionAmount: number;
  status: RetailCommissionStatus;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  payoutReference?: string;
  payoutBatchId?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreateRetailSalesCommissionInput {
  saleId: string;
  salespersonUserId: string;
  basisAmount?: number;
  ratePercent: number;
}

export interface DecideRetailSalesCommissionInput {
  id: string;
  decision: 'approved' | 'void';
  expectedVersion: number;
  remarks: string;
}

export interface PayRetailSalesCommissionInput {
  id: string;
  payoutReference: string;
  expectedVersion: number;
}

export type RetailCommissionPayoutBatchStatus = 'submitted' | 'approved' | 'rejected' | 'released';

export interface RetailCommissionPayoutBatch {
  id: string;
  number: string;
  commissionIds: string[];
  payoutDate: string;
  totalAmount: number;
  notes: string;
  status: RetailCommissionPayoutBatchStatus;
  submittedBy: string;
  submittedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  decisionRemarks?: string;
  releasedBy?: string;
  releasedAt?: string;
  releaseReference?: string;
  /** Ready accounting handoff created atomically with the payout release. */
  journalDraftId?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreateRetailCommissionPayoutBatchInput {
  commissionIds: string[];
  payoutDate: string;
  notes: string;
}

export interface DecideRetailCommissionPayoutBatchInput {
  id: string;
  decision: 'approved' | 'rejected';
  expectedVersion: number;
  remarks: string;
}

export interface ReleaseRetailCommissionPayoutBatchInput {
  id: string;
  releaseReference: string;
  expectedVersion: number;
}
