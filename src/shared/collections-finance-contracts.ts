export type CreditRiskGrade = 'A' | 'B' | 'C' | 'D' | 'watchlist';

export interface CreditLimitControl {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  accountId: string;
  currency: 'INR';
  creditLimit: number;
  warningThresholdPercent: number;
  graceDays: number;
  blockNewOrders: boolean;
  riskGrade: CreditRiskGrade;
  rationale: string;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface DunningCase {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  receivableId: string;
  accountId: string;
  stage: 'reminder' | 'notice' | 'final-demand' | 'credit-hold';
  status: 'open' | 'paused' | 'resolved';
  daysOverdue: number;
  actionableAmount: number;
  ownerId: string;
  nextActionAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CollectionActivity {
  scope?: OperatingRecordScope;
  id: string;
  dunningCaseId: string;
  channel: 'email' | 'phone' | 'whatsapp' | 'letter' | 'visit';
  outcome: 'promised-to-pay' | 'no-contact' | 'dispute-raised' | 'paid' | 'escalated';
  notes: string;
  promisedAmount?: number;
  promisedDate?: string;
  performedBy: string;
  performedAt: string;
}

export interface ReceivableDispute {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  receivableId: string;
  accountId: string;
  category: 'billing' | 'quality' | 'delivery' | 'tax' | 'contract' | 'other';
  amount: number;
  reason: string;
  evidenceReference: string;
  ownerId: string;
  status: 'open' | 'under-review' | 'resolved' | 'rejected' | 'withdrawn';
  resolution?: 'credit-note' | 'write-off' | 'settled' | 'rejected' | 'withdrawn';
  resolutionReference?: string;
  openedBy: string;
  openedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  version: number;
}

export interface WriteOffRequest {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  receivableId: string;
  accountId: string;
  amount: number;
  reason: string;
  evidenceReference: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  journalId?: string;
  version: number;
}

export interface WithholdingPolicy {
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  kind: 'TDS' | 'TCS';
  lawVersion: 'income-tax-act-1961' | 'income-tax-act-2025';
  sectionReference: string;
  tableItem?: string;
  trigger: 'earlier-credit-payment' | 'receipt' | 'debit-or-receipt';
  ratePercent: number;
  thresholdAmount: number;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceUrl: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  version: number;
}

export interface WithholdingEntry {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  policyId: string;
  accountId: string;
  receivableId?: string;
  direction: 'customer-deducted-tds' | 'company-deducted-tds' | 'company-collected-tcs';
  eventDate: string;
  baseAmount: number;
  ratePercent: number;
  taxAmount: number;
  counterpartyPan: string;
  certificateOrChallanReference?: string;
  status: 'recognized' | 'deposited' | 'filed' | 'reconciled';
  journalId?: string;
  recordedBy: string;
  recordedAt: string;
  updatedBy?: string;
  updatedAt?: string;
  version: number;
}

export interface ZeroRatedSupplyReview {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  invoiceId: string;
  accountId: string;
  supplyType: 'export-goods' | 'export-services' | 'sez-unit' | 'sez-developer';
  taxRoute: 'lut-bond-without-payment' | 'igst-paid-refund';
  destinationCountryCode?: string;
  recipientName: string;
  recipientAddress: string;
  sezGstin?: string;
  lutBondNumber?: string;
  lutBondDate?: string;
  lutBondValidUntil?: string;
  shippingBillNumber?: string;
  portCode?: string;
  authorisedOperationsEvidence?: string;
  invoiceEndorsement: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface BankAccountControl {
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  bankName: string;
  maskedAccountNumber: string;
  ifsc: string;
  currency: 'INR';
  active: boolean;
  createdAt: string;
  version: number;
}

export interface BankStatementLine {
  scope?: OperatingRecordScope;
  id: string;
  statementImportId: string;
  transactionDate: string;
  valueDate: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  fingerprint: string;
  matchStatus: 'unmatched' | 'suggested' | 'matched' | 'excluded';
  suggestedPaymentReceiptId?: string;
  matchedPaymentReceiptId?: string;
  confidence?: number;
  matchReason?: string;
  matchedBy?: string;
  matchedAt?: string;
  exclusionReason?: string;
  version: number;
}

export interface BankStatementImport {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  bankAccountId: string;
  fileName: string;
  periodFrom: string;
  periodTo: string;
  openingBalance: number;
  closingBalance: number;
  rowCount: number;
  checksum: string;
  status: 'preview' | 'committed';
  importedBy: string;
  importedAt: string;
  committedBy?: string;
  committedAt?: string;
  version: number;
}

export interface ProposeCreditLimitInput { accountId: string; creditLimit: number; warningThresholdPercent: number; graceDays: number; blockNewOrders: boolean; riskGrade: CreditRiskGrade; rationale: string }
export interface DecideCreditLimitInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface RunDunningInput { asOfDate: string; ownerId: string }
export interface RecordCollectionActivityInput { dunningCaseId: string; channel: CollectionActivity['channel']; outcome: CollectionActivity['outcome']; notes: string; promisedAmount?: number; promisedDate?: string; expectedVersion: number }
export interface OpenReceivableDisputeInput { receivableId: string; category: ReceivableDispute['category']; amount: number; reason: string; evidenceReference: string; ownerId: string }
export interface ResolveReceivableDisputeInput { id: string; resolution: NonNullable<ReceivableDispute['resolution']>; resolutionReference: string; expectedVersion: number }
export interface RequestWriteOffInput { receivableId: string; amount: number; reason: string; evidenceReference: string }
export interface DecideWriteOffInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface CreateWithholdingPolicyInput { code: string; name: string; kind: WithholdingPolicy['kind']; lawVersion: WithholdingPolicy['lawVersion']; sectionReference: string; tableItem?: string; trigger: WithholdingPolicy['trigger']; ratePercent: number; thresholdAmount: number; effectiveFrom: string; effectiveTo?: string; sourceUrl: string }
export interface RecordWithholdingEntryInput { policyId: string; accountId: string; receivableId?: string; direction: WithholdingEntry['direction']; eventDate: string; baseAmount: number; counterpartyPan: string; certificateOrChallanReference?: string }
export interface TransitionWithholdingEntryInput { id: string; toStatus: 'deposited' | 'filed' | 'reconciled'; reference: string; expectedVersion: number }
export interface PrepareZeroRatedSupplyInput { invoiceId: string; supplyType: ZeroRatedSupplyReview['supplyType']; taxRoute: ZeroRatedSupplyReview['taxRoute']; destinationCountryCode?: string; recipientName: string; recipientAddress: string; sezGstin?: string; lutBondNumber?: string; lutBondDate?: string; lutBondValidUntil?: string; shippingBillNumber?: string; portCode?: string; authorisedOperationsEvidence?: string }
export interface DecideZeroRatedSupplyInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface CreateBankAccountInput { code: string; name: string; bankName: string; maskedAccountNumber: string; ifsc: string }
export interface PreviewBankStatementInput { bankAccountId: string; fileName: string; csvContent: string }
export interface CommitBankStatementInput { id: string; expectedVersion: number }
export interface ConfirmBankMatchInput { lineId: string; paymentReceiptId: string; expectedVersion: number }
export interface ExcludeBankLineInput { lineId: string; reason: string; expectedVersion: number }
import type { OperatingRecordScope } from './revenue-ops-contracts';
