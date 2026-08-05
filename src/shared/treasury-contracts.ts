export type TreasuryPositionSource = 'bank-statement' | 'treasury-control';

/** A dated, evidence-backed balance. It is intentionally separate from bank setup. */
export interface TreasuryPosition {
  scope?: OperatingRecordScope;
  id: string;
  bankAccountId: string;
  asOfDate: string;
  availableBalance: number;
  source: TreasuryPositionSource;
  evidenceReference: string;
  recordedBy: string;
  recordedAt: string;
  version: number;
}

export type CashForecastScenario = 'base' | 'conservative' | 'upside';

export interface CashForecastLine {
  date: string;
  inflows: number;
  outflows: number;
  closingBalance: number;
  drivers: Array<'receivable' | 'supplier-invoice' | 'payment-proposal' | 'liquidity-sweep'>;
}

export interface CashForecastAssumptions {
  receiptCollectionFactor: number;
  plannedOutflowCoverageFactor: number;
  sourceEvidence: string[];
}

export interface CashForecastRun {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  asOfDate: string;
  horizonDays: number;
  scenario: CashForecastScenario;
  openingBalance: number;
  projectedInflows: number;
  projectedOutflows: number;
  projectedClosingBalance: number;
  lowPoint: number;
  lines: CashForecastLine[];
  generatedBy: string;
  generatedAt: string;
  /** Explicit inputs used to derive the scenario; legacy records may omit this manifest. */
  assumptions?: CashForecastAssumptions;
  /** SHA-256 of the immutable forecast inputs and output lines. */
  checksum?: string;
  version: number;
}

export type PaymentProposalStatus = 'submitted' | 'approved' | 'rejected' | 'released' | 'settled' | 'failed' | 'cancelled';

/** Payment release records an externally performed banking step; no credential is stored here. */
export interface PaymentProposal {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  supplierInvoiceId: string;
  supplierId: string;
  bankAccountId: string;
  paymentDate: string;
  amount: number;
  paymentReference: string;
  purpose: string;
  status: PaymentProposalStatus;
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalRemarks?: string;
  releasedBy?: string;
  releasedAt?: string;
  bankReleaseReference?: string;
  settledAt?: string;
  settlementReference?: string;
  actualAmount?: number;
  journalId?: string;
  version: number;
}

export interface BankCharge {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  bankAccountId: string;
  chargeDate: string;
  category: 'transaction-fee' | 'interest' | 'gst' | 'other';
  amount: number;
  taxAmount: number;
  reference: string;
  status: 'recorded' | 'reconciled';
  recordedBy: string;
  recordedAt: string;
  reconciledBy?: string;
  reconciledAt?: string;
  journalId: string;
  version: number;
}

export type SettlementExceptionCode = 'not-received' | 'rejected' | 'duplicate' | 'amount-mismatch' | 'bank-charge' | 'other';

export interface SettlementException {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  paymentProposalId: string;
  code: SettlementExceptionCode;
  amount: number;
  details: string;
  status: 'open' | 'under-review' | 'resolved' | 'written-off';
  ownerId: string;
  openedBy: string;
  openedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
  version: number;
}

export interface LiquiditySweep {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  fromBankAccountId: string;
  toBankAccountId: string;
  amount: number;
  effectiveDate: string;
  rationale: string;
  status: 'submitted' | 'approved' | 'rejected' | 'released' | 'settled' | 'failed' | 'cancelled';
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalRemarks?: string;
  releasedBy?: string;
  releasedAt?: string;
  releaseReference?: string;
  settledBy?: string;
  settledAt?: string;
  settlementReference?: string;
  releaseJournalId?: string;
  settlementJournalId?: string;
  version: number;
}

export interface RecordTreasuryPositionInput { bankAccountId: string; asOfDate: string; availableBalance: number; source: TreasuryPositionSource; evidenceReference: string }
export interface RunCashForecastInput { asOfDate: string; horizonDays: number; scenario: CashForecastScenario }
export interface CreatePaymentProposalInput { supplierInvoiceId: string; bankAccountId: string; paymentDate: string; amount: number; paymentReference: string; purpose: string }
export interface DecidePaymentProposalInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface ReleasePaymentProposalInput { id: string; bankReleaseReference: string; expectedVersion: number }
export interface SettlePaymentProposalInput { id: string; outcome: 'settled' | 'failed'; settlementReference: string; settledAt: string; actualAmount: number; expectedVersion: number }
export interface RecordBankChargeInput { bankAccountId: string; chargeDate: string; category: BankCharge['category']; amount: number; taxAmount: number; reference: string }
export interface ReconcileBankChargeInput { id: string; expectedVersion: number }
export interface OpenSettlementExceptionInput { paymentProposalId: string; code: SettlementExceptionCode; amount: number; details: string; ownerId: string }
export interface ResolveSettlementExceptionInput { id: string; resolution: string; expectedVersion: number; writtenOff?: boolean }
export interface CreateLiquiditySweepInput { fromBankAccountId: string; toBankAccountId: string; amount: number; effectiveDate: string; rationale: string }
export interface DecideLiquiditySweepInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface ReleaseLiquiditySweepInput { id: string; releaseReference: string; expectedVersion: number }
export interface SettleLiquiditySweepInput { id: string; outcome: 'settled' | 'failed'; settlementReference: string; expectedVersion: number }
import type { OperatingRecordScope } from './revenue-ops-contracts';
