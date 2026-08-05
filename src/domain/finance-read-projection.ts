import type {
  RevenueOpsSnapshot,
  RevenueOpsState,
} from '../shared/revenue-ops-contracts';
import type {
  FinanceReadAccessDecision,
  FinanceReadProjection,
} from '../shared/finance-read-projection-contracts';

type ScopedRecord = { scope?: { companyId: string; branchId: string } };

export const FINANCE_READ_COLLECTIONS = [
  ['invoices', 'finance.receivable'],
  ['creditDebitNotes', 'finance.receivable'],
  ['receivables', 'finance.receivable'],
  ['paymentReceipts', 'finance.receivable'],
  ['creditLimitControls', 'finance.credit-limit'],
  ['dunningCases', 'finance.dunning'],
  ['collectionActivities', 'finance.collection-activity'],
  ['receivableDisputes', 'finance.receivable-dispute'],
  ['writeOffRequests', 'finance.write-off'],
  ['withholdingPolicies', 'finance.withholding-policy'],
  ['withholdingEntries', 'finance.withholding-entry'],
  ['zeroRatedSupplyReviews', 'finance.zero-rated-supply-review'],
  ['bankAccounts', 'finance.bank-account'],
  ['bankStatementImports', 'finance.bank-statement-import'],
  ['bankStatementLines', 'finance.bank-reconciliation'],
  ['codCollectionCases', 'finance.bank-reconciliation'],
  ['treasuryPositions', 'treasury.cash-position'],
  ['cashForecastRuns', 'treasury.cash-forecast'],
  ['paymentProposals', 'treasury.payment'],
  ['bankCharges', 'treasury.bank-charge'],
  ['settlementExceptions', 'treasury.settlement-exception'],
  ['liquiditySweeps', 'treasury.liquidity-sweep'],
] as const;

type FinanceCollection = typeof FINANCE_READ_COLLECTIONS[number][0];
type FinanceReadSource = Pick<RevenueOpsState, 'scope' | FinanceCollection>
  | Pick<RevenueOpsSnapshot, 'scope' | FinanceCollection>;

const FINANCE_COLLECTION_METRICS: Record<FinanceCollection, readonly string[]> = {
  invoices: ['billedValue'],
  creditDebitNotes: [],
  receivables: ['outstandingReceivables', 'overdueReceivables', 'collectionsAtRisk', 'creditLimitBreaches'],
  paymentReceipts: ['unappliedCash'],
  creditLimitControls: ['creditLimitBreaches'],
  dunningCases: ['collectionsAtRisk'],
  collectionActivities: [],
  receivableDisputes: ['openDisputes'],
  writeOffRequests: ['pendingWriteOffs'],
  withholdingPolicies: [],
  withholdingEntries: ['withholdingOpen'],
  zeroRatedSupplyReviews: ['zeroRatedPending'],
  bankAccounts: ['liquidityAvailable'],
  bankStatementImports: ['liquidityAvailable'],
  bankStatementLines: ['bankUnmatched'],
  codCollectionCases: [],
  treasuryPositions: ['liquidityAvailable'],
  cashForecastRuns: ['forecastLowPoint'],
  paymentProposals: ['paymentAwaitingApproval', 'paymentAwaitingRelease'],
  bankCharges: ['bankChargesMonth'],
  settlementExceptions: ['settlementExceptionsOpen'],
  liquiditySweeps: [],
};

const FINANCE_FIELD_METRICS: Record<string, readonly string[]> = {
  'finance.receivable.outstandingAmount': ['outstandingReceivables', 'overdueReceivables', 'collectionsAtRisk', 'creditLimitBreaches'],
  'finance.receivable.unappliedAmount': ['unappliedCash'],
  'treasury.cash-position.availableBalance': ['liquidityAvailable'],
  'treasury.cash-forecast.lowPoint': ['forecastLowPoint'],
};

function isInScope(record: ScopedRecord, scope: FinanceReadSource['scope']): boolean {
  return record.scope?.companyId === scope.companyId && record.scope?.branchId === scope.branchId;
}

function redact<T extends object>(record: T, fields: readonly string[]): T {
  const copy = { ...record } as Record<string, unknown>;
  for (const field of fields) delete copy[field];
  return copy as T;
}

export function createFinanceReadProjection(
  state: FinanceReadSource,
  getDecision: (resource: string) => FinanceReadAccessDecision,
  generatedAt = new Date().toISOString(),
): FinanceReadProjection {
  const projected = {} as Record<FinanceCollection, unknown[]>;
  const hiddenCollections: string[] = [];
  const redactedFields: Record<string, string[]> = {};
  const redactedMetrics: string[] = [];
  const stateRecord = state as unknown as Record<FinanceCollection, ScopedRecord[]>;

  for (const [collection, resource] of FINANCE_READ_COLLECTIONS) {
    const decision = getDecision(resource);
    if (!decision.allowed) {
      projected[collection] = [];
      hiddenCollections.push(collection);
      redactedMetrics.push(...FINANCE_COLLECTION_METRICS[collection]);
      continue;
    }
    if (decision.deniedFields.length) {
      redactedFields[resource] = [...decision.deniedFields];
      for (const field of decision.deniedFields) {
        redactedMetrics.push(...(FINANCE_FIELD_METRICS[`${resource}.${field}`] ?? []));
      }
    }
    projected[collection] = stateRecord[collection]
      .filter((record) => isInScope(record, state.scope))
      .map((record) => redact(record, decision.deniedFields));
  }

  return {
    scope: structuredClone(state.scope), generatedAt, hiddenCollections, redactedFields,
    redactedMetrics: [...new Set(redactedMetrics)],
    invoices: projected.invoices as FinanceReadProjection['invoices'],
    creditDebitNotes: projected.creditDebitNotes as FinanceReadProjection['creditDebitNotes'],
    receivables: projected.receivables as FinanceReadProjection['receivables'],
    paymentReceipts: projected.paymentReceipts as FinanceReadProjection['paymentReceipts'],
    creditLimitControls: projected.creditLimitControls as FinanceReadProjection['creditLimitControls'],
    dunningCases: projected.dunningCases as FinanceReadProjection['dunningCases'],
    collectionActivities: projected.collectionActivities as FinanceReadProjection['collectionActivities'],
    receivableDisputes: projected.receivableDisputes as FinanceReadProjection['receivableDisputes'],
    writeOffRequests: projected.writeOffRequests as FinanceReadProjection['writeOffRequests'],
    withholdingPolicies: projected.withholdingPolicies as FinanceReadProjection['withholdingPolicies'],
    withholdingEntries: projected.withholdingEntries as FinanceReadProjection['withholdingEntries'],
    zeroRatedSupplyReviews: projected.zeroRatedSupplyReviews as FinanceReadProjection['zeroRatedSupplyReviews'],
    bankAccounts: projected.bankAccounts as FinanceReadProjection['bankAccounts'],
    bankStatementImports: projected.bankStatementImports as FinanceReadProjection['bankStatementImports'],
    bankStatementLines: projected.bankStatementLines as FinanceReadProjection['bankStatementLines'],
    codCollectionCases: projected.codCollectionCases as FinanceReadProjection['codCollectionCases'],
    treasuryPositions: projected.treasuryPositions as FinanceReadProjection['treasuryPositions'],
    cashForecastRuns: projected.cashForecastRuns as FinanceReadProjection['cashForecastRuns'],
    paymentProposals: projected.paymentProposals as FinanceReadProjection['paymentProposals'],
    bankCharges: projected.bankCharges as FinanceReadProjection['bankCharges'],
    settlementExceptions: projected.settlementExceptions as FinanceReadProjection['settlementExceptions'],
    liquiditySweeps: projected.liquiditySweeps as FinanceReadProjection['liquiditySweeps'],
  };
}
