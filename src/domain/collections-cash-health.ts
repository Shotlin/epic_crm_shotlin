import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

/**
 * A renderer-safe, evidence-only view of Indian collections and cash-control
 * health. It deliberately keeps customer receipt records, receivable exposure,
 * bank-statement matching and treasury settlement exceptions separate:
 * recording a receipt is not evidence of a bank or UPI settlement.
 *
 * Date-only values are India business dates. Timestamp values are converted
 * only when they include an explicit offset, so a device time zone can never
 * move a receipt into a different reporting period.
 */
export const COLLECTIONS_CASH_TIME_ZONE = 'Asia/Kolkata' as const;

export type CollectionsCashHealthState = 'ready' | 'empty' | 'restricted';

export interface CollectionsCashPeriodInput {
  /** Inclusive India business date in YYYY-MM-DD form. */
  start: string;
  /** Inclusive India business date in YYYY-MM-DD form. */
  end: string;
}

export interface CollectionsCashPeriod extends CollectionsCashPeriodInput {
  timeZone: typeof COLLECTIONS_CASH_TIME_ZONE;
}

export interface CollectionsCashAmountMeasure {
  state: CollectionsCashHealthState;
  /** An INR value, or null when its source was withheld. */
  amount: number | null;
  /** Source-document count represented by the amount, or null when withheld. */
  recordCount: number | null;
  emptyMessage: string;
  restrictedCollections: string[];
  restrictedFields: string[];
}

export interface CollectionsCashCountMeasure {
  state: CollectionsCashHealthState;
  count: number | null;
  emptyMessage: string;
  restrictedCollections: string[];
  restrictedFields: string[];
}

export interface CollectionsCashSection<Row> {
  state: CollectionsCashHealthState;
  rows: Row[];
  emptyMessage: string;
  restrictedCollections: string[];
  restrictedFields: string[];
}

export type ReceiptMethod = 'bank-transfer' | 'upi' | 'cheque' | 'cash' | 'other';

export interface ReceiptMethodMixRow {
  method: ReceiptMethod;
  receiptCount: number;
  /** Recorded/reconciled receipt amounts dated inside the selected period. */
  recordedAmount: number;
  /** Documented allocation lines; no allocation is inferred. */
  allocatedAmount: number;
  /** Documented unapplied amount; no unapplied cash is inferred. */
  unappliedAmount: number;
  /** Receipts whose recorded amount does not equal allocation plus unapplied cash. */
  allocationMismatchCount: number;
}

export type ReceivableAgingBucket = 'not-due' | '1-30' | '31-60' | '61-90' | 'over-90';

export interface ReceivableAgingRow {
  bucket: ReceivableAgingBucket;
  label: string;
  receivableCount: number;
  outstandingAmount: number;
}

export interface DunningStageRow {
  stage: 'reminder' | 'notice' | 'final-demand' | 'credit-hold';
  caseCount: number;
  actionableAmount: number;
}

export interface DunningWorkQueueRow {
  id: string;
  number: string;
  receivableId: string;
  accountId: string;
  stage: 'reminder' | 'notice' | 'final-demand' | 'credit-hold';
  status: 'open' | 'paused';
  daysOverdue: number;
  actionableAmount: number;
  nextActionAt: string;
}

export interface DisputeCategoryRow {
  category: 'billing' | 'quality' | 'delivery' | 'tax' | 'contract' | 'other';
  disputeCount: number;
  disputedAmount: number;
}

export interface BankMatchStatusRow {
  matchStatus: 'unmatched' | 'suggested' | 'matched' | 'excluded';
  lineCount: number;
  inboundAmount: number;
  outboundAmount: number;
}

export interface SettlementExceptionCodeRow {
  code: 'not-received' | 'rejected' | 'duplicate' | 'amount-mismatch' | 'bank-charge' | 'other';
  exceptionCount: number;
  amount: number;
}

type CollectionsCashRevenueSource = Pick<
  RevenueOpsSnapshot,
  | 'generatedAt'
  | 'revision'
  | 'scope'
  | 'readProjection'
  | 'receivables'
  | 'paymentReceipts'
  | 'dunningCases'
  | 'receivableDisputes'
  | 'bankStatementLines'
  | 'settlementExceptions'
>;

export interface BuildCollectionsCashHealthInput {
  /** The existing governed snapshot for the active company, branch and user. */
  revenue: CollectionsCashRevenueSource;
  /** Defaults to the India calendar month containing `asOfDate`. */
  period?: CollectionsCashPeriodInput;
  /**
   * Defaults to the India business date of `revenue.generatedAt`. It ages the
   * current snapshot's open receivables; it does not reconstruct a historical
   * ledger balance from later changes.
   */
  asOfDate?: string;
}

export interface CollectionsCashHealth {
  generatedAt: string;
  currency: 'INR';
  asOfDate: string;
  period: CollectionsCashPeriod;
  source: {
    revenueRevision: number;
    scope: { companyId: string; branchId: string };
  };
  state: CollectionsCashHealthState;
  /** Customer receipts in the selected period. Reversed receipts are excluded. */
  receipts: {
    recorded: CollectionsCashAmountMeasure;
    allocated: CollectionsCashAmountMeasure;
    unapplied: CollectionsCashAmountMeasure;
    allocationMismatchCount: CollectionsCashCountMeasure;
    methodMix: CollectionsCashSection<ReceiptMethodMixRow>;
  };
  /** Open snapshot receivable exposure, aged using the selected India business date. */
  receivables: {
    openOutstanding: CollectionsCashAmountMeasure;
    aging: CollectionsCashSection<ReceivableAgingRow>;
    unclassifiableAging: CollectionsCashAmountMeasure;
  };
  /** Live dunning cases, not an estimated recovery forecast. */
  dunning: {
    activeCaseCount: CollectionsCashCountMeasure;
    actionableAmount: CollectionsCashAmountMeasure;
    byStage: CollectionsCashSection<DunningStageRow>;
    workQueue: CollectionsCashSection<DunningWorkQueueRow>;
  };
  /** Open or under-review receivable disputes only. */
  disputes: {
    openCount: CollectionsCashCountMeasure;
    openAmount: CollectionsCashAmountMeasure;
    byCategory: CollectionsCashSection<DisputeCategoryRow>;
  };
  /** Bank-statement matching is evidence from imported bank lines, not receipt status. */
  bankReconciliation: {
    unmatchedInbound: CollectionsCashAmountMeasure;
    suggestedInbound: CollectionsCashAmountMeasure;
    byMatchStatus: CollectionsCashSection<BankMatchStatusRow>;
  };
  /** Treasury payment settlement exceptions; they are not customer collections. */
  settlementExceptions: {
    openCount: CollectionsCashCountMeasure;
    openAmount: CollectionsCashAmountMeasure;
    byCode: CollectionsCashSection<SettlementExceptionCodeRow>;
  };
  /** Source collections withheld by the active read projection. */
  restrictedSources: string[];
}

interface Restriction {
  restricted: boolean;
  collections: string[];
  fields: string[];
}

interface ReceiptAllocationEvidence {
  allocatedAmount: number;
  unappliedAmount: number;
  mismatch: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const OFFSET_TIMESTAMP_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/i;
const RECEIPT_METHODS: readonly ReceiptMethod[] = ['bank-transfer', 'upi', 'cheque', 'cash', 'other'];
const AGING_BUCKETS: ReadonlyArray<{ bucket: ReceivableAgingBucket; label: string }> = [
  { bucket: 'not-due', label: 'Not due' },
  { bucket: '1-30', label: '1–30 days overdue' },
  { bucket: '31-60', label: '31–60 days overdue' },
  { bucket: '61-90', label: '61–90 days overdue' },
  { bucket: 'over-90', label: 'Over 90 days overdue' },
];
const DUNNING_STAGES: readonly DunningStageRow['stage'][] = ['reminder', 'notice', 'final-demand', 'credit-hold'];
const DISPUTE_CATEGORIES: readonly DisputeCategoryRow['category'][] = ['billing', 'quality', 'delivery', 'tax', 'contract', 'other'];
const BANK_MATCH_STATUSES: readonly BankMatchStatusRow['matchStatus'][] = ['unmatched', 'suggested', 'matched', 'excluded'];
const SETTLEMENT_CODES: readonly SettlementExceptionCodeRow['code'][] = ['not-received', 'rejected', 'duplicate', 'amount-mismatch', 'bank-charge', 'other'];

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parsedDate(value: string): { year: number; month: number; day: number } | undefined {
  const match = DATE_PATTERN.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return undefined;
  return { year, month, day };
}

function normalisePlainDate(value: string): string | undefined {
  const parts = parsedDate(value);
  if (!parts) return undefined;
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function indiaBusinessDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const dateOnly = normalisePlainDate(value);
  if (dateOnly) return dateOnly;
  if (!OFFSET_TIMESTAMP_PATTERN.test(value)) return undefined;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return undefined;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COLLECTIONS_CASH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epoch));
  const part = (kind: Intl.DateTimeFormatPartTypes): string | undefined => parts.find((item) => item.type === kind)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const result = year && month && day ? `${year}-${month}-${day}` : undefined;
  return result && normalisePlainDate(result) ? result : undefined;
}

function addDays(value: string, days: number): string {
  const parsed = parsedDate(value);
  if (!parsed) throw new RangeError(`Invalid India business date: ${value}`);
  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day) + days * DAY_MS);
  return `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function defaultPeriod(asOfDate: string): CollectionsCashPeriod {
  const parsed = parsedDate(asOfDate);
  if (!parsed) throw new RangeError('Unable to resolve an India business reporting month.');
  const start = `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}-01`;
  const nextMonthStart = parsed.month === 12
    ? `${String(parsed.year + 1).padStart(4, '0')}-01-01`
    : `${String(parsed.year).padStart(4, '0')}-${String(parsed.month + 1).padStart(2, '0')}-01`;
  return { start, end: addDays(nextMonthStart, -1), timeZone: COLLECTIONS_CASH_TIME_ZONE };
}

function resolveInput(input: BuildCollectionsCashHealthInput): { asOfDate: string; period: CollectionsCashPeriod } {
  const asOfDate = input.asOfDate
    ? normalisePlainDate(input.asOfDate)
    : indiaBusinessDate(input.revenue.generatedAt);
  if (!asOfDate) throw new RangeError('Collections cash health requires a valid India business as-of date or snapshot timestamp.');
  if (!input.period) return { asOfDate, period: defaultPeriod(asOfDate) };
  const start = normalisePlainDate(input.period.start);
  const end = normalisePlainDate(input.period.end);
  if (!start || !end || start > end) throw new RangeError('Collections cash periods require valid inclusive YYYY-MM-DD start and end dates.');
  return { asOfDate, period: { start, end, timeZone: COLLECTIONS_CASH_TIME_ZONE } };
}

function inPeriod(date: string | undefined, period: CollectionsCashPeriod): boolean {
  return Boolean(date && date >= period.start && date <= period.end);
}

function hasMember<T>(values: readonly T[], value: unknown): value is T {
  return values.includes(value as T);
}

function scopeMatches(revenue: CollectionsCashRevenueSource): boolean {
  return revenue.readProjection.companyId === revenue.scope.companyId
    && revenue.readProjection.branchId === revenue.scope.branchId;
}

function restriction(
  revenue: CollectionsCashRevenueSource,
  collection: string,
  resource: string,
  requiredFields: readonly string[],
  requiredMetrics: readonly string[] = [],
): Restriction {
  const hidden = new Set(revenue.readProjection.hiddenCollections ?? []);
  const fields = new Set(revenue.readProjection.redactedFields?.[resource] ?? []);
  const metrics = new Set(revenue.readProjection.redactedMetrics ?? []);
  const restrictedFields = requiredFields.filter((field) => fields.has(field)).map((field) => `${resource}.${field}`);
  const hiddenCollection = hidden.has(collection);
  const metricWithheld = requiredMetrics.some((metric) => metrics.has(metric));
  return {
    restricted: hiddenCollection || metricWithheld || restrictedFields.length > 0,
    collections: hiddenCollection || metricWithheld ? [collection] : [],
    fields: restrictedFields,
  };
}

function combineRestrictions(...items: Restriction[]): Restriction {
  return {
    restricted: items.some((item) => item.restricted),
    collections: [...new Set(items.flatMap((item) => item.collections))],
    fields: [...new Set(items.flatMap((item) => item.fields))],
  };
}

function scopedRestriction(revenue: CollectionsCashRevenueSource, item: Restriction): Restriction {
  if (scopeMatches(revenue)) return item;
  return combineRestrictions({ restricted: true, collections: ['scope-mismatch'], fields: [] }, item);
}

function isRecordInScope(
  record: { scope?: { companyId: string; branchId: string } },
  revenue: CollectionsCashRevenueSource,
): boolean {
  return record.scope?.companyId === revenue.scope.companyId
    && record.scope?.branchId === revenue.scope.branchId;
}

function amountMeasure(
  amount: number,
  recordCount: number,
  blocked: Restriction,
  emptyMessage: string,
): CollectionsCashAmountMeasure {
  if (blocked.restricted) {
    return {
      state: 'restricted', amount: null, recordCount: null, emptyMessage,
      restrictedCollections: blocked.collections, restrictedFields: blocked.fields,
    };
  }
  return {
    state: recordCount ? 'ready' : 'empty', amount, recordCount, emptyMessage,
    restrictedCollections: [], restrictedFields: [],
  };
}

function countMeasure(
  count: number,
  blocked: Restriction,
  emptyMessage: string,
): CollectionsCashCountMeasure {
  if (blocked.restricted) {
    return {
      state: 'restricted', count: null, emptyMessage,
      restrictedCollections: blocked.collections, restrictedFields: blocked.fields,
    };
  }
  return {
    state: count ? 'ready' : 'empty', count, emptyMessage,
    restrictedCollections: [], restrictedFields: [],
  };
}

function section<Row>(rows: Row[], blocked: Restriction, emptyMessage: string): CollectionsCashSection<Row> {
  if (blocked.restricted) {
    return {
      state: 'restricted', rows: [], emptyMessage,
      restrictedCollections: blocked.collections, restrictedFields: blocked.fields,
    };
  }
  return {
    state: rows.length ? 'ready' : 'empty', rows, emptyMessage,
    restrictedCollections: [], restrictedFields: [],
  };
}

function receiptAllocationEvidence(receipt: CollectionsCashRevenueSource['paymentReceipts'][number]): ReceiptAllocationEvidence | undefined {
  const unappliedAmount = finiteNonNegative(receipt.unappliedAmount);
  if (unappliedAmount === undefined || !Array.isArray(receipt.allocations)) return undefined;
  let allocatedAmount = 0;
  for (const allocation of receipt.allocations) {
    const amount = finiteNonNegative(allocation.amount);
    if (!allocation.receivableId || amount === undefined) return undefined;
    allocatedAmount += amount;
  }
  const receiptAmount = finiteNonNegative(receipt.amount);
  if (receiptAmount === undefined) return undefined;
  return {
    allocatedAmount,
    unappliedAmount,
    mismatch: Math.abs(receiptAmount - allocatedAmount - unappliedAmount) > 0.005,
  };
}

function receiptRows(
  revenue: CollectionsCashRevenueSource,
  period: CollectionsCashPeriod,
): CollectionsCashRevenueSource['paymentReceipts'] {
  return revenue.paymentReceipts.filter((receipt) => (
    isRecordInScope(receipt, revenue)
    && (receipt.status === 'recorded' || receipt.status === 'reconciled')
    && finiteNonNegative(receipt.amount) !== undefined
    && inPeriod(indiaBusinessDate(receipt.receivedAt), period)
  ));
}

function buildReceiptMix(
  receipts: CollectionsCashRevenueSource['paymentReceipts'],
): ReceiptMethodMixRow[] {
  const rows = new Map<ReceiptMethod, ReceiptMethodMixRow>();
  for (const receipt of receipts) {
    if (!hasMember(RECEIPT_METHODS, receipt.method)) continue;
    const amount = finiteNonNegative(receipt.amount);
    const allocation = receiptAllocationEvidence(receipt);
    if (amount === undefined || !allocation) continue;
    const existing = rows.get(receipt.method);
    if (existing) {
      existing.receiptCount += 1;
      existing.recordedAmount += amount;
      existing.allocatedAmount += allocation.allocatedAmount;
      existing.unappliedAmount += allocation.unappliedAmount;
      existing.allocationMismatchCount += allocation.mismatch ? 1 : 0;
      continue;
    }
    rows.set(receipt.method, {
      method: receipt.method,
      receiptCount: 1,
      recordedAmount: amount,
      allocatedAmount: allocation.allocatedAmount,
      unappliedAmount: allocation.unappliedAmount,
      allocationMismatchCount: allocation.mismatch ? 1 : 0,
    });
  }
  return [...rows.values()].sort((left, right) => right.recordedAmount - left.recordedAmount || left.method.localeCompare(right.method, 'en-IN'));
}

function daysOverdue(dueDate: string, asOfDate: string): number | undefined {
  const due = parsedDate(dueDate);
  const asOf = parsedDate(asOfDate);
  if (!due || !asOf) return undefined;
  const difference = (Date.UTC(asOf.year, asOf.month - 1, asOf.day) - Date.UTC(due.year, due.month - 1, due.day)) / DAY_MS;
  return Number.isInteger(difference) ? Math.max(0, difference) : undefined;
}

function agingBucket(days: number): ReceivableAgingBucket {
  if (days === 0) return 'not-due';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return 'over-90';
}

function activeReceivables(revenue: CollectionsCashRevenueSource) {
  return revenue.receivables.filter((receivable) => (
    isRecordInScope(receivable, revenue)
    && !['paid', 'written-off'].includes(receivable.status)
    && finiteNonNegative(receivable.outstandingAmount) !== undefined
    && (finiteNonNegative(receivable.outstandingAmount) ?? 0) > 0
  ));
}

function buildAgingRows(
  receivables: ReturnType<typeof activeReceivables>,
  asOfDate: string,
): { rows: ReceivableAgingRow[]; unclassifiableAmount: number; unclassifiableCount: number } {
  const totals = new Map<ReceivableAgingBucket, ReceivableAgingRow>(AGING_BUCKETS.map(({ bucket, label }) => [
    bucket,
    { bucket, label, receivableCount: 0, outstandingAmount: 0 },
  ]));
  let unclassifiableAmount = 0;
  let unclassifiableCount = 0;
  for (const receivable of receivables) {
    const amount = finiteNonNegative(receivable.outstandingAmount);
    const days = daysOverdue(receivable.dueDate, asOfDate);
    if (amount === undefined || days === undefined) {
      if (amount !== undefined) {
        unclassifiableAmount += amount;
        unclassifiableCount += 1;
      }
      continue;
    }
    const row = totals.get(agingBucket(days));
    if (!row) continue;
    row.receivableCount += 1;
    row.outstandingAmount += amount;
  }
  return {
    rows: [...totals.values()].filter((row) => row.receivableCount > 0),
    unclassifiableAmount,
    unclassifiableCount,
  };
}

function activeDunning(revenue: CollectionsCashRevenueSource) {
  return revenue.dunningCases.filter((item) => (
    isRecordInScope(item, revenue)
    && (item.status === 'open' || item.status === 'paused')
    && hasMember(DUNNING_STAGES, item.stage)
    && finiteNonNegative(item.actionableAmount) !== undefined
    && finiteNonNegative(item.daysOverdue) !== undefined
    && typeof item.nextActionAt === 'string'
    && item.nextActionAt.length > 0
  ));
}

function buildDunningStages(cases: ReturnType<typeof activeDunning>): DunningStageRow[] {
  const rows = new Map<DunningStageRow['stage'], DunningStageRow>();
  for (const item of cases) {
    const actionableAmount = finiteNonNegative(item.actionableAmount);
    if (actionableAmount === undefined || !hasMember(DUNNING_STAGES, item.stage)) continue;
    const current = rows.get(item.stage);
    if (current) {
      current.caseCount += 1;
      current.actionableAmount += actionableAmount;
      continue;
    }
    rows.set(item.stage, { stage: item.stage, caseCount: 1, actionableAmount });
  }
  const rank = new Map(DUNNING_STAGES.map((stage, index) => [stage, index]));
  return [...rows.values()].sort((left, right) => (rank.get(right.stage) ?? 0) - (rank.get(left.stage) ?? 0));
}

function buildDunningQueue(cases: ReturnType<typeof activeDunning>): DunningWorkQueueRow[] {
  const rank = new Map(DUNNING_STAGES.map((stage, index) => [stage, index]));
  return cases
    .map((item): DunningWorkQueueRow => ({
      id: item.id,
      number: item.number,
      receivableId: item.receivableId,
      accountId: item.accountId,
      stage: item.stage,
      // `activeDunning` admits only these two statuses. Keep the narrowing
      // explicit so a resolved case cannot leak into this renderer-facing row.
      status: item.status === 'open' ? 'open' : 'paused',
      daysOverdue: item.daysOverdue,
      actionableAmount: finiteNonNegative(item.actionableAmount) ?? 0,
      nextActionAt: item.nextActionAt,
    }))
    .sort((left, right) => (
      (rank.get(right.stage) ?? 0) - (rank.get(left.stage) ?? 0)
      || right.daysOverdue - left.daysOverdue
      || left.nextActionAt.localeCompare(right.nextActionAt, 'en-IN')
      || left.number.localeCompare(right.number, 'en-IN')
    ))
    .slice(0, 10);
}

function activeDisputes(revenue: CollectionsCashRevenueSource) {
  return revenue.receivableDisputes.filter((item) => (
    isRecordInScope(item, revenue)
    && (item.status === 'open' || item.status === 'under-review')
    && hasMember(DISPUTE_CATEGORIES, item.category)
    && finiteNonNegative(item.amount) !== undefined
  ));
}

function buildDisputeCategories(disputes: ReturnType<typeof activeDisputes>): DisputeCategoryRow[] {
  const rows = new Map<DisputeCategoryRow['category'], DisputeCategoryRow>();
  for (const dispute of disputes) {
    const amount = finiteNonNegative(dispute.amount);
    if (amount === undefined || !hasMember(DISPUTE_CATEGORIES, dispute.category)) continue;
    const current = rows.get(dispute.category);
    if (current) {
      current.disputeCount += 1;
      current.disputedAmount += amount;
      continue;
    }
    rows.set(dispute.category, { category: dispute.category, disputeCount: 1, disputedAmount: amount });
  }
  return [...rows.values()].sort((left, right) => right.disputedAmount - left.disputedAmount || left.category.localeCompare(right.category, 'en-IN'));
}

function eligibleBankLines(revenue: CollectionsCashRevenueSource, asOfDate: string) {
  return revenue.bankStatementLines.filter((item) => {
    const transactionDate = normalisePlainDate(item.transactionDate);
    return isRecordInScope(item, revenue)
      && Boolean(transactionDate && transactionDate <= asOfDate)
      && hasMember(BANK_MATCH_STATUSES, item.matchStatus)
      && finiteNonNegative(item.credit) !== undefined
      && finiteNonNegative(item.debit) !== undefined;
  });
}

function buildBankStatusRows(lines: ReturnType<typeof eligibleBankLines>): BankMatchStatusRow[] {
  const rows = new Map<BankMatchStatusRow['matchStatus'], BankMatchStatusRow>();
  for (const line of lines) {
    if (!hasMember(BANK_MATCH_STATUSES, line.matchStatus)) continue;
    const inbound = finiteNonNegative(line.credit);
    const outbound = finiteNonNegative(line.debit);
    if (inbound === undefined || outbound === undefined) continue;
    const current = rows.get(line.matchStatus);
    if (current) {
      current.lineCount += 1;
      current.inboundAmount += inbound;
      current.outboundAmount += outbound;
      continue;
    }
    rows.set(line.matchStatus, {
      matchStatus: line.matchStatus,
      lineCount: 1,
      inboundAmount: inbound,
      outboundAmount: outbound,
    });
  }
  const rank = new Map(BANK_MATCH_STATUSES.map((status, index) => [status, index]));
  return [...rows.values()].sort((left, right) => (rank.get(left.matchStatus) ?? 0) - (rank.get(right.matchStatus) ?? 0));
}

function activeSettlementExceptions(revenue: CollectionsCashRevenueSource) {
  return revenue.settlementExceptions.filter((item) => (
    isRecordInScope(item, revenue)
    && (item.status === 'open' || item.status === 'under-review')
    && hasMember(SETTLEMENT_CODES, item.code)
    && finiteNonNegative(item.amount) !== undefined
  ));
}

function buildSettlementCodeRows(exceptions: ReturnType<typeof activeSettlementExceptions>): SettlementExceptionCodeRow[] {
  const rows = new Map<SettlementExceptionCodeRow['code'], SettlementExceptionCodeRow>();
  for (const exception of exceptions) {
    const amount = finiteNonNegative(exception.amount);
    if (amount === undefined || !hasMember(SETTLEMENT_CODES, exception.code)) continue;
    const current = rows.get(exception.code);
    if (current) {
      current.exceptionCount += 1;
      current.amount += amount;
      continue;
    }
    rows.set(exception.code, { code: exception.code, exceptionCount: 1, amount });
  }
  return [...rows.values()].sort((left, right) => right.amount - left.amount || left.code.localeCompare(right.code, 'en-IN'));
}

function overallState(items: Array<{ state: CollectionsCashHealthState }>): CollectionsCashHealthState {
  if (items.some((item) => item.state === 'ready')) return 'ready';
  if (items.some((item) => item.state === 'restricted')) return 'restricted';
  return 'empty';
}

/**
 * Builds the Collections & Cash Health projection without mutating, estimating
 * or submitting any financial record. A mismatched projection scope is
 * treated as restricted across the entire pack rather than as an empty view.
 */
export function buildCollectionsCashHealth(input: BuildCollectionsCashHealthInput): CollectionsCashHealth {
  const { revenue } = input;
  const { asOfDate, period } = resolveInput(input);

  const receiptsRecordedAccess = scopedRestriction(revenue, restriction(
    revenue, 'paymentReceipts', 'finance.receivable', ['receivedAt', 'status', 'amount'],
  ));
  const receiptsAllocationAccess = scopedRestriction(revenue, restriction(
    revenue, 'paymentReceipts', 'finance.receivable', ['receivedAt', 'status', 'amount', 'allocations', 'unappliedAmount'], ['unappliedCash'],
  ));
  const receivableExposureAccess = scopedRestriction(revenue, restriction(
    revenue, 'receivables', 'finance.receivable', ['status', 'outstandingAmount'], ['outstandingReceivables'],
  ));
  const receivableAgingAccess = scopedRestriction(revenue, restriction(
    revenue, 'receivables', 'finance.receivable', ['status', 'outstandingAmount', 'dueDate'], ['overdueReceivables', 'collectionsAtRisk'],
  ));
  const dunningAccess = scopedRestriction(revenue, restriction(
    revenue, 'dunningCases', 'finance.dunning', ['status', 'stage', 'actionableAmount', 'daysOverdue', 'nextActionAt'],
  ));
  const disputeAccess = scopedRestriction(revenue, restriction(
    revenue, 'receivableDisputes', 'finance.receivable-dispute', ['status', 'category', 'amount'], ['openDisputes'],
  ));
  const bankAccess = scopedRestriction(revenue, restriction(
    revenue, 'bankStatementLines', 'finance.bank-reconciliation', ['transactionDate', 'matchStatus', 'credit', 'debit'], ['bankUnmatched'],
  ));
  const settlementAccess = scopedRestriction(revenue, restriction(
    revenue, 'settlementExceptions', 'treasury.settlement-exception', ['status', 'code', 'amount'], ['settlementExceptionsOpen'],
  ));

  const receipts = receiptRows(revenue, period);
  const completeReceiptAllocations = receipts.flatMap((receipt) => {
    const evidence = receiptAllocationEvidence(receipt);
    return evidence ? [{ receipt, evidence }] : [];
  });
  const receiptMix = buildReceiptMix(receipts);
  const activeReceivableRows = activeReceivables(revenue);
  const aging = buildAgingRows(activeReceivableRows, asOfDate);
  const dunningCases = activeDunning(revenue);
  const disputes = activeDisputes(revenue);
  const bankLines = eligibleBankLines(revenue, asOfDate);
  const settlementExceptions = activeSettlementExceptions(revenue);

  const receiptRecorded = amountMeasure(
    receipts.reduce((total, receipt) => total + (finiteNonNegative(receipt.amount) ?? 0), 0),
    receipts.length,
    receiptsRecordedAccess,
    'No recorded or reconciled customer receipt falls inside the selected period.',
  );
  const receiptAllocated = amountMeasure(
    completeReceiptAllocations.reduce((total, item) => total + item.evidence.allocatedAmount, 0),
    completeReceiptAllocations.length,
    receiptsAllocationAccess,
    'No complete receipt-allocation evidence falls inside the selected period.',
  );
  const receiptUnapplied = amountMeasure(
    completeReceiptAllocations.reduce((total, item) => total + item.evidence.unappliedAmount, 0),
    completeReceiptAllocations.length,
    receiptsAllocationAccess,
    'No complete receipt-allocation evidence falls inside the selected period.',
  );
  const receiptMismatchCount = countMeasure(
    completeReceiptAllocations.filter((item) => item.evidence.mismatch).length,
    receiptsAllocationAccess,
    'No receipt allocation variance is present in the selected period.',
  );
  const receiptMethodMix = section(
    receiptMix,
    receiptsAllocationAccess,
    'No complete customer receipt allocation is available for a payment-method mix.',
  );

  const openOutstanding = amountMeasure(
    activeReceivableRows.reduce((total, receivable) => total + (finiteNonNegative(receivable.outstandingAmount) ?? 0), 0),
    activeReceivableRows.length,
    receivableExposureAccess,
    'No open receivable is available in this company and branch scope.',
  );
  const receivableAging = section(
    aging.rows,
    receivableAgingAccess,
    'No dated open receivable is available for the selected as-of date.',
  );
  const unclassifiableAging = amountMeasure(
    aging.unclassifiableAmount,
    aging.unclassifiableCount,
    receivableAgingAccess,
    'Every open receivable has a valid due date for aging.',
  );

  const dunningActiveCases = countMeasure(
    dunningCases.length,
    dunningAccess,
    'No active dunning case is waiting in this company and branch scope.',
  );
  const dunningActionableAmount = amountMeasure(
    dunningCases.reduce((total, item) => total + (finiteNonNegative(item.actionableAmount) ?? 0), 0),
    dunningCases.length,
    dunningAccess,
    'No active dunning case is waiting in this company and branch scope.',
  );
  const dunningByStage = section(
    buildDunningStages(dunningCases),
    dunningAccess,
    'No active dunning case is waiting in this company and branch scope.',
  );
  const dunningWorkQueue = section(
    buildDunningQueue(dunningCases),
    dunningAccess,
    'No active dunning case is waiting in this company and branch scope.',
  );

  const disputeOpenCount = countMeasure(
    disputes.length,
    disputeAccess,
    'No open or under-review receivable dispute is available in this scope.',
  );
  const disputeOpenAmount = amountMeasure(
    disputes.reduce((total, item) => total + (finiteNonNegative(item.amount) ?? 0), 0),
    disputes.length,
    disputeAccess,
    'No open or under-review receivable dispute is available in this scope.',
  );
  const disputeByCategory = section(
    buildDisputeCategories(disputes),
    disputeAccess,
    'No open or under-review receivable dispute is available in this scope.',
  );

  const unmatchedInbound = amountMeasure(
    bankLines.filter((line) => line.matchStatus === 'unmatched').reduce((total, line) => total + (finiteNonNegative(line.credit) ?? 0), 0),
    bankLines.filter((line) => line.matchStatus === 'unmatched' && (finiteNonNegative(line.credit) ?? 0) > 0).length,
    bankAccess,
    'No unmatched incoming bank-statement line is available through the selected as-of date.',
  );
  const suggestedInbound = amountMeasure(
    bankLines.filter((line) => line.matchStatus === 'suggested').reduce((total, line) => total + (finiteNonNegative(line.credit) ?? 0), 0),
    bankLines.filter((line) => line.matchStatus === 'suggested' && (finiteNonNegative(line.credit) ?? 0) > 0).length,
    bankAccess,
    'No suggested incoming bank-statement match is available through the selected as-of date.',
  );
  const bankByMatchStatus = section(
    buildBankStatusRows(bankLines),
    bankAccess,
    'No bank-statement line is available through the selected as-of date.',
  );

  const settlementOpenCount = countMeasure(
    settlementExceptions.length,
    settlementAccess,
    'No open treasury settlement exception is available in this scope.',
  );
  const settlementOpenAmount = amountMeasure(
    settlementExceptions.reduce((total, item) => total + (finiteNonNegative(item.amount) ?? 0), 0),
    settlementExceptions.length,
    settlementAccess,
    'No open treasury settlement exception is available in this scope.',
  );
  const settlementByCode = section(
    buildSettlementCodeRows(settlementExceptions),
    settlementAccess,
    'No open treasury settlement exception is available in this scope.',
  );

  const topLevelItems = [
    receiptRecorded,
    receiptAllocated,
    openOutstanding,
    receivableAging,
    dunningActiveCases,
    disputeOpenCount,
    unmatchedInbound,
    settlementOpenCount,
  ];
  const allItems = [
    ...topLevelItems,
    receiptUnapplied,
    receiptMismatchCount,
    receiptMethodMix,
    unclassifiableAging,
    dunningActionableAmount,
    dunningByStage,
    dunningWorkQueue,
    disputeOpenAmount,
    disputeByCategory,
    suggestedInbound,
    bankByMatchStatus,
    settlementOpenAmount,
    settlementByCode,
  ];

  return {
    generatedAt: revenue.generatedAt,
    currency: 'INR',
    asOfDate,
    period,
    source: {
      revenueRevision: revenue.revision,
      scope: { companyId: revenue.scope.companyId, branchId: revenue.scope.branchId },
    },
    state: overallState(topLevelItems),
    receipts: {
      recorded: receiptRecorded,
      allocated: receiptAllocated,
      unapplied: receiptUnapplied,
      allocationMismatchCount: receiptMismatchCount,
      methodMix: receiptMethodMix,
    },
    receivables: {
      openOutstanding,
      aging: receivableAging,
      unclassifiableAging,
    },
    dunning: {
      activeCaseCount: dunningActiveCases,
      actionableAmount: dunningActionableAmount,
      byStage: dunningByStage,
      workQueue: dunningWorkQueue,
    },
    disputes: {
      openCount: disputeOpenCount,
      openAmount: disputeOpenAmount,
      byCategory: disputeByCategory,
    },
    bankReconciliation: {
      unmatchedInbound,
      suggestedInbound,
      byMatchStatus: bankByMatchStatus,
    },
    settlementExceptions: {
      openCount: settlementOpenCount,
      openAmount: settlementOpenAmount,
      byCode: settlementByCode,
    },
    restrictedSources: [...new Set(allItems.flatMap((item) => item.restrictedCollections))],
  };
}
