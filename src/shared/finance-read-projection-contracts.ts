import type {
  BankAccountControl,
  BankStatementImport,
  BankStatementLine,
  CollectionActivity,
  CreditLimitControl,
  DunningCase,
  ReceivableDispute,
  WithholdingEntry,
  WithholdingPolicy,
  WriteOffRequest,
  ZeroRatedSupplyReview,
} from './collections-finance-contracts';
import type {
  CreditDebitNote,
  CodCollectionCase,
  OperatingRecordScope,
  PaymentReceipt,
  Receivable,
  TaxInvoice,
} from './revenue-ops-contracts';
import type {
  BankCharge,
  CashForecastRun,
  LiquiditySweep,
  PaymentProposal,
  SettlementException,
  TreasuryPosition,
} from './treasury-contracts';

export interface FinanceReadAccessDecision {
  allowed: boolean;
  deniedFields: string[];
}

export interface FinanceReadProjection {
  scope: OperatingRecordScope;
  generatedAt: string;
  hiddenCollections: string[];
  redactedFields: Record<string, string[]>;
  redactedMetrics: string[];
  invoices: TaxInvoice[];
  creditDebitNotes: CreditDebitNote[];
  receivables: Receivable[];
  paymentReceipts: PaymentReceipt[];
  creditLimitControls: CreditLimitControl[];
  dunningCases: DunningCase[];
  collectionActivities: CollectionActivity[];
  receivableDisputes: ReceivableDispute[];
  writeOffRequests: WriteOffRequest[];
  withholdingPolicies: WithholdingPolicy[];
  withholdingEntries: WithholdingEntry[];
  zeroRatedSupplyReviews: ZeroRatedSupplyReview[];
  bankAccounts: BankAccountControl[];
  bankStatementImports: BankStatementImport[];
  bankStatementLines: BankStatementLine[];
  codCollectionCases: CodCollectionCase[];
  treasuryPositions: TreasuryPosition[];
  cashForecastRuns: CashForecastRun[];
  paymentProposals: PaymentProposal[];
  bankCharges: BankCharge[];
  settlementExceptions: SettlementException[];
  liquiditySweeps: LiquiditySweep[];
}
