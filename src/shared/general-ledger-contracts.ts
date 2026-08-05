export type LedgerAccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'income'
  | 'expense';

export type LedgerNormalBalance = 'debit' | 'credit';
export type LedgerJournalStatus = 'draft' | 'posted';
export type LedgerJournalKind = 'manual' | 'reversal' | 'source';

export interface LedgerCompanyBinding {
  profileId: string;
  companyId: string;
  branchId: string;
  currencyCode: string;
  boundBy: string;
  boundAt: string;
}

export interface LedgerAccount {
  id: string;
  companyId: string;
  code: string;
  name: string;
  accountType: LedgerAccountType;
  normalBalance: LedgerNormalBalance;
  isPostable: boolean;
  active: boolean;
}

export interface LedgerPeriod {
  id: string;
  companyId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'soft-closed' | 'closed';
}

export interface LedgerJournalLine {
  id: string;
  lineNumber: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string;
  costCenterId: string | null;
  profitCenterId: string | null;
  departmentId: string | null;
  projectId: string | null;
}

export interface LedgerJournal {
  id: string;
  companyId: string;
  branchId: string;
  number: string;
  postingDate: string;
  periodId: string;
  sourceType: string;
  sourceId: string | null;
  sourceNumber: string | null;
  sourceChecksum: string | null;
  kind: LedgerJournalKind;
  currencyCode: string;
  memo: string;
  status: LedgerJournalStatus;
  createdBy: string;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  reversesJournalId: string | null;
  previousHash: string | null;
  hash: string | null;
  version: number;
  totalDebit: number;
  totalCredit: number;
  lines: LedgerJournalLine[];
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: LedgerAccountType;
  normalBalance: LedgerNormalBalance;
  debit: number;
  credit: number;
  balance: number;
}

export interface FinancialStatementLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface FinancialStatements {
  asOfDate: string;
  profitAndLoss: {
    income: FinancialStatementLine[];
    expenses: FinancialStatementLine[];
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
  };
  balanceSheet: {
    assets: FinancialStatementLine[];
    liabilities: FinancialStatementLine[];
    equity: FinancialStatementLine[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    balanceCheck: number;
  };
  cashFlow: {
    operating: number;
    investing: number;
    financing: number;
    netChange: number;
    evidenceJournalCount: number;
  };
}

export interface SubledgerRollforward {
  opening: number;
  additions: number;
  settlements: number;
  adjustments: number;
  closing: number;
  evidenceCount: number;
}

export interface GstWorkpaper {
  outwardTaxable: number;
  outputCgst: number;
  outputSgst: number;
  outputIgst: number;
  inwardTaxable: number;
  inputCgst: number;
  inputSgst: number;
  inputIgst: number;
  netPayable: number;
  invoiceEvidenceCount: number;
  supplierEvidenceCount: number;
}

/**
 * Current-book roll-forward assembled only from the immutable posted chain.
 * Manual fixed-asset movements remain visible as unresolved reconciliation
 * exceptions rather than being silently attributed to an asset subledger.
 */
export interface FixedAssetRollforward {
  asOfDate: string | null;
  capitalizedCost: number;
  retiredCost: number;
  manualGrossCostMovement: number;
  endingGrossCost: number;
  depreciationCharge: number;
  retirementAccumulatedDepreciationRelease: number;
  manualAccumulatedDepreciationMovement: number;
  endingAccumulatedDepreciation: number;
  retirementLoss: number;
  endingNetBookValue: number;
  sourceJournalCounts: {
    capitalizations: number;
    depreciationRuns: number;
    retirements: number;
  };
  unlinkedFixedAssetJournalCount: number;
  reconciliationStatus: 'reconciled' | 'attention';
}

export type LedgerCloseBlockerCode =
  | 'source-handoff'
  | 'unposted-journal'
  | 'orphan-reversal';

export interface LedgerCloseBlocker {
  code: LedgerCloseBlockerCode;
  reference: string;
  detail: string;
}

/**
 * Read-only, aggregate close evidence for one date window. This is deliberately
 * calculated from the canonical journal chain and the source handoff ledger;
 * a UI status or an exported CSV is never treated as posting evidence.
 */
export interface LedgerCloseReadiness {
  periodFrom: string;
  periodTo: string;
  status: 'ready' | 'blocked';
  sourceDrafts: number;
  sourceHandoffsReady: number;
  sourceHandoffsBlocked: number;
  journals: number;
  postedJournals: number;
  unpostedJournals: number;
  reversalDrafts: number;
  orphanReversals: number;
  blockerCount: number;
  blockers: LedgerCloseBlocker[];
}

export interface GeneralLedgerSnapshot {
  generatedAt: string;
  profileId: string;
  binding: LedgerCompanyBinding | null;
  status: 'binding-required' | 'ready';
  blockingReason: string | null;
  accounts: LedgerAccount[];
  periods: LedgerPeriod[];
  journals: LedgerJournal[];
  trialBalance: TrialBalanceRow[];
  financialStatements?: FinancialStatements;
  accountsReceivableRollforward?: SubledgerRollforward;
  accountsPayableRollforward?: SubledgerRollforward;
  gstWorkpaper?: GstWorkpaper;
  fixedAssetRollforward?: FixedAssetRollforward;
  closeReadiness?: LedgerCloseReadiness[];
  totals: {
    debit: number;
    credit: number;
    netAssets: number;
    netIncome: number;
  };
  integrityVerified: boolean;
}

export interface BindLedgerCompanyInput {
  companyId: string;
  branchId: string;
}

export interface CreateLedgerJournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
  memo: string;
  costCenterId?: string;
  profitCenterId?: string;
  departmentId?: string;
  projectId?: string;
}

export interface CreateLedgerJournalInput {
  postingDate: string;
  memo: string;
  lines: CreateLedgerJournalLineInput[];
}

export interface PostLedgerJournalInput {
  id: string;
  expectedVersion: number;
}

/**
 * Prepares one issued Revenue Ledger invoice handoff as a replay-safe
 * canonical general-ledger draft. Posting stays a separate checker action.
 */
export interface PrepareRevenueInvoicePostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Prepares one independently reconciled customer receipt for canonical posting. */
export interface PrepareCashReceiptPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes an independently approved receivable write-off into canonical GL. */
export interface PrepareWriteOffPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes a recognized TDS/TCS entry into canonical GL. */
export interface PrepareWithholdingPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes a released treasury payment, bank charge, or liquidity sweep. */
export interface PrepareTreasuryPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes a production material issue or production output into canonical inventory/WIP GL. */
export interface PrepareManufacturingPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes an independently approved landed-cost allocation into inventory GL. */
export interface PrepareLandedCostPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes an immutable retail stock-cost handoff into canonical COGS / inventory GL. */
export interface PrepareRetailSaleCostPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes an approved counter-return stock receipt into canonical inventory / COGS GL. */
export interface PrepareRetailReturnCostPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes a matched or resolved marketplace settlement into canonical GL. */
export interface PrepareRetailCommerceSettlementPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes a released retail commission payout into the canonical expense/bank GL. */
export interface PrepareRetailCommissionPayoutPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes finalized payroll or reimbursed employee expense into canonical GL. */
export interface PreparePeoplePostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

export interface PrepareCommercialAdjustmentPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/**
 * Promotes one matched or independently approved supplier invoice into the
 * canonical accounts-payable draft. Posting remains a separate checker step.
 */
export interface PrepareSupplierInvoicePostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes an approved procurement-to-asset request into canonical GL. */
export interface PrepareAssetCapitalizationPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes an independently approved monthly depreciation run into canonical GL. */
export interface PrepareAssetDepreciationPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes an approved no-proceeds asset-retirement event into canonical GL. */
export interface PrepareAssetRetirementPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes an approved sale-for-proceeds asset disposal into canonical GL. */
export interface PrepareAssetSaleDisposalPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/** Promotes an approved impairment or revaluation adjustment into canonical GL. */
export interface PrepareAssetLifecyclePostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

/**
 * Prepares a finance-approved project revenue-recognition event as one
 * replay-safe canonical general-ledger draft. Posting remains a separate
 * independent checker action.
 */
export interface PrepareProjectRevenueRecognitionPostingInput {
  journalDraftId: string;
  expectedVersion: number;
  expectedChecksum: string;
}

export interface ReverseLedgerJournalInput {
  id: string;
  expectedVersion: number;
  postingDate: string;
  reason: string;
}

export interface CancelLedgerJournalInput {
  id: string;
  expectedVersion: number;
  reason: string;
}
