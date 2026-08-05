import type { OperatingRecordScope } from './revenue-ops-contracts';

export type RetailCreditNoteReconciliationStatus = 'prepared' | 'matched' | 'drift' | 'rejected' | 'missing';

/** Frozen return GST evidence plus provider response evidence. This never claims a portal filing occurred by itself. */
export interface RetailCreditNoteReconciliation {
  id: string;
  number: string;
  retailReturnId: string;
  retailReturnNumber: string;
  gstCreditEvidenceId: string;
  gstCreditEvidenceNumber: string;
  sourceInvoiceId: string;
  sourceInvoiceNumber: string;
  filingPeriod: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  totalCredit: number;
  payloadChecksum: string;
  status: RetailCreditNoteReconciliationStatus;
  externalReference?: string;
  portalPayloadChecksum?: string;
  responseMessage?: string;
  requestedBy: string;
  requestedAt: string;
  submittedAt?: string;
  reconciledBy?: string;
  reconciledAt?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface PrepareRetailCreditNoteReconciliationInput {
  retailReturnId: string;
  filingPeriod: string;
}

export interface RecordRetailCreditNotePortalResponseInput {
  id: string;
  expectedVersion: number;
  remoteStatus: 'accepted' | 'rejected' | 'missing';
  externalReference?: string;
  remotePayloadChecksum?: string;
  responseMessage?: string;
}
