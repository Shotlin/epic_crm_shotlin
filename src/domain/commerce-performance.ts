import type { DashboardSnapshot } from '../shared/contracts';
import type { PartySnapshot } from '../shared/party-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

/**
 * A read-only, period-aware performance projection for the India commerce
 * workspace.  It intentionally does not combine pipeline, orders, invoices
 * and cash: each represents a different commercial fact with a different
 * source document.
 *
 * This module is renderer-safe. It uses only platform JavaScript APIs and
 * treats every date boundary as an Asia/Kolkata business date.
 */
export const COMMERCE_PERFORMANCE_TIME_ZONE = 'Asia/Kolkata' as const;

export type CommercePerformanceState = 'ready' | 'empty' | 'restricted';

export interface CommercePerformancePeriodInput {
  /** Inclusive India business date in YYYY-MM-DD form. */
  start: string;
  /** Inclusive India business date in YYYY-MM-DD form. */
  end: string;
}

export interface CommercePerformancePeriod extends CommercePerformancePeriodInput {
  timeZone: typeof COMMERCE_PERFORMANCE_TIME_ZONE;
}

export interface CommercePerformanceMeasure {
  /** `restricted` means the active RevenueOps read projection withheld evidence. */
  state: CommercePerformanceState;
  /** Current-period value. `null` is intentionally reserved for restricted data. */
  current: number | null;
  /** Equivalent prior-period value. `null` is intentionally reserved for restricted data. */
  previous: number | null;
  /** `current - previous`, or `null` when a source is restricted. */
  delta: number | null;
  /** Percentage change. `null` when the prior period is zero or evidence is restricted. */
  changePercent: number | null;
  /** Number of source documents included in the selected period. */
  documentCount: number | null;
  /** Number of source documents included in the equivalent prior period. */
  previousDocumentCount: number | null;
  emptyMessage: string;
  /** Withheld source collections; `scope-mismatch` means the supplied snapshot is not self-consistent. */
  restrictedCollections: string[];
  /** Withheld source fields, expressed as `resource.field`. */
  restrictedFields: string[];
}

export interface CommercePerformanceSection<Row> {
  state: CommercePerformanceState;
  rows: Row[];
  emptyMessage: string;
  restrictedCollections: string[];
  restrictedFields: string[];
}

export interface CommerceTopProduct {
  id: string;
  productId?: string;
  sku?: string;
  name: string;
  /** Post-discount taxable value from issued invoice lines. It is not an order or cash amount. */
  taxableValue: number;
  quantity: number;
  invoiceCount: number;
}

export interface CommerceTopCustomer {
  id: string;
  accountId: string;
  name: string;
  /** Issued invoice grand total, including GST where applicable. */
  issuedBilling: number;
  invoiceCount: number;
}

type CommerceRevenueSource = Pick<
  RevenueOpsSnapshot,
  | 'generatedAt'
  | 'revision'
  | 'scope'
  | 'readProjection'
  | 'salesOrders'
  | 'invoices'
  | 'paymentReceipts'
  | 'products'
>;

export interface BuildCommercePerformanceInput {
  /** Used only as a deterministic fallback for the default period and source freshness metadata. */
  dashboard: Pick<DashboardSnapshot, 'generatedAt' | 'revision'>;
  /** The already-governed RevenueOps snapshot is the sole source of commercial values. */
  revenue: CommerceRevenueSource;
  /** Party master is used only to resolve customer labels for issued billing. */
  party: Pick<PartySnapshot, 'revision' | 'accounts'>;
  /** Defaults to the Asia/Kolkata calendar month containing the snapshot timestamp. */
  period?: CommercePerformancePeriodInput;
}

export interface CommercePerformancePack {
  generatedAt: string;
  currency: 'INR';
  state: CommercePerformanceState;
  period: CommercePerformancePeriod;
  priorPeriod: CommercePerformancePeriod;
  source: {
    revenueRevision: number;
    dashboardRevision: number;
    partyRevision: number;
    scope: { companyId: string; branchId: string };
  };
  summary: {
    /** Non-cancelled sales-order grand totals. An order is not issued billing. */
    orderedValue: CommercePerformanceMeasure;
    /** Issued, partially-paid, paid or written-off invoice grand totals; drafts and cancellations are excluded. */
    issuedBilling: CommercePerformanceMeasure;
    /** GST shown on issued invoices only. Credit/debit notes remain in their statutory workbench. */
    issuedGst: CommercePerformanceMeasure;
    /** Discounts applied to non-cancelled sales orders. */
    orderDiscounts: CommercePerformanceMeasure;
    /** Discounts applied to issued invoices. */
    billingDiscounts: CommercePerformanceMeasure;
    /** Recorded or reconciled receipts, including recorded unapplied cash; reversals are excluded. */
    recordedCollections: CommercePerformanceMeasure;
    /** Ordered value divided by eligible sales-order count. */
    orderAov: CommercePerformanceMeasure;
    /** Issued billing divided by eligible invoice count. */
    issuedBillingAov: CommercePerformanceMeasure;
  };
  /** Ranked only from issued invoice lines in the selected period. */
  topProducts: CommercePerformanceSection<CommerceTopProduct>;
  /** Ranked only from issued invoice grand totals in the selected period. */
  topCustomers: CommercePerformanceSection<CommerceTopCustomer>;
  /** All sources intentionally unavailable to this projection. */
  restrictedSources: string[];
}

interface Restriction {
  restricted: boolean;
  collections: string[];
  fields: string[];
}

interface PeriodTotals {
  current: number;
  previous: number;
  currentCount: number;
  previousCount: number;
}

interface InvoicePeriodRecord {
  invoice: CommerceRevenueSource['invoices'][number];
  localDate: string;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const OFFSET_TIMESTAMP_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/i;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parsedDate(value: string): { year: number; month: number; day: number } | undefined {
  const match = DATE_PATTERN.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) return undefined;
  return { year, month, day };
}

function normalisePlainDate(value: string): string | undefined {
  const parts = parsedDate(value);
  if (!parts) return undefined;
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * Converts a timestamp to an India business date. Date-only values are
 * already business dates; date-times without an explicit offset are rejected
 * rather than being interpreted in the device's local time zone.
 */
function indiaBusinessDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const plainDate = normalisePlainDate(value);
  if (plainDate) return plainDate;
  if (!OFFSET_TIMESTAMP_PATTERN.test(value)) return undefined;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return undefined;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COMMERCE_PERFORMANCE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epoch));
  const part = (type: Intl.DateTimeFormatPartTypes): string | undefined => parts.find((item) => item.type === type)?.value;
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

function inclusiveDayCount(start: string, end: string): number {
  const startParts = parsedDate(start);
  const endParts = parsedDate(end);
  if (!startParts || !endParts) throw new RangeError('Period dates must be valid YYYY-MM-DD values.');
  const startTime = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const endTime = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  return Math.floor((endTime - startTime) / DAY_MS) + 1;
}

function isCompleteCalendarMonth(start: string, end: string): boolean {
  const startParts = parsedDate(start);
  const endParts = parsedDate(end);
  if (!startParts || !endParts || startParts.year !== endParts.year || startParts.month !== endParts.month || startParts.day !== 1) return false;
  const lastDay = new Date(Date.UTC(startParts.year, startParts.month, 0)).getUTCDate();
  return endParts.day === lastDay;
}

function createPeriods(
  input: CommercePerformancePeriodInput | undefined,
  revenueGeneratedAt: string,
  dashboardGeneratedAt: string,
): { period: CommercePerformancePeriod; priorPeriod: CommercePerformancePeriod } {
  let start: string;
  let end: string;
  if (input) {
    start = normalisePlainDate(input.start) ?? '';
    end = normalisePlainDate(input.end) ?? '';
    if (!start || !end || start > end) {
      throw new RangeError('Commerce performance periods require valid inclusive YYYY-MM-DD start and end dates.');
    }
  } else {
    const reference = indiaBusinessDate(revenueGeneratedAt) ?? indiaBusinessDate(dashboardGeneratedAt);
    if (!reference) {
      throw new RangeError('A valid snapshot timestamp or an explicit India business period is required.');
    }
    const parsed = parsedDate(reference);
    if (!parsed) throw new RangeError('Unable to resolve the snapshot month.');
    start = `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}-01`;
    end = addDays(`${String(parsed.year).padStart(4, '0')}-${String(parsed.month + 1).padStart(2, '0')}-01`, -1);
  }
  const previousEnd = addDays(start, -1);
  // A calendar-month view should compare with the preceding calendar month
  // (July compares with June), not with an artificial 31-day window. Custom
  // periods retain same-day-count comparability.
  const previousStart = isCompleteCalendarMonth(start, end)
    ? `${previousEnd.slice(0, 8)}01`
    : addDays(previousEnd, -(inclusiveDayCount(start, end) - 1));
  return {
    period: { start, end, timeZone: COMMERCE_PERFORMANCE_TIME_ZONE },
    priorPeriod: { start: previousStart, end: previousEnd, timeZone: COMMERCE_PERFORMANCE_TIME_ZONE },
  };
}

function inPeriod(date: string | undefined, period: CommercePerformancePeriod): boolean {
  return Boolean(date && date >= period.start && date <= period.end);
}

function restriction(
  revenue: CommerceRevenueSource,
  collection: string,
  resource: string,
  requiredFields: readonly string[],
  requiredMetrics: readonly string[] = [],
): Restriction {
  const hidden = new Set(revenue.readProjection.hiddenCollections);
  const redactedFields = new Set(revenue.readProjection.redactedFields[resource] ?? []);
  const redactedMetrics = new Set(revenue.readProjection.redactedMetrics);
  const fields = requiredFields
    .filter((field) => redactedFields.has(field))
    .map((field) => `${resource}.${field}`);
  const metricWithheld = requiredMetrics.some((metric) => redactedMetrics.has(metric));
  return {
    restricted: hidden.has(collection) || metricWithheld || fields.length > 0,
    collections: hidden.has(collection) || metricWithheld ? [collection] : [],
    fields,
  };
}

function scopeRestriction(revenue: CommerceRevenueSource): Restriction | undefined {
  const projection = revenue.readProjection;
  if (
    projection.companyId !== revenue.scope.companyId
    || projection.branchId !== revenue.scope.branchId
  ) {
    return { restricted: true, collections: ['scope-mismatch'], fields: [] };
  }
  return undefined;
}

function combineRestrictions(...items: Restriction[]): Restriction {
  return {
    restricted: items.some((item) => item.restricted),
    collections: [...new Set(items.flatMap((item) => item.collections))],
    fields: [...new Set(items.flatMap((item) => item.fields))],
  };
}

function measure(
  totals: PeriodTotals,
  blocked: Restriction,
  emptyMessage: string,
): CommercePerformanceMeasure {
  if (blocked.restricted) {
    return {
      state: 'restricted', current: null, previous: null, delta: null, changePercent: null,
      documentCount: null, previousDocumentCount: null, emptyMessage,
      restrictedCollections: blocked.collections, restrictedFields: blocked.fields,
    };
  }
  const state: CommercePerformanceState = totals.currentCount > 0 ? 'ready' : 'empty';
  const changePercent = totals.previous === 0 ? null : Number((((totals.current - totals.previous) / totals.previous) * 100).toFixed(2));
  return {
    state,
    current: totals.current,
    previous: totals.previous,
    delta: totals.current - totals.previous,
    changePercent,
    documentCount: totals.currentCount,
    previousDocumentCount: totals.previousCount,
    emptyMessage,
    restrictedCollections: [],
    restrictedFields: [],
  };
}

function averageMeasure(
  totals: PeriodTotals,
  blocked: Restriction,
  emptyMessage: string,
): CommercePerformanceMeasure {
  if (blocked.restricted) return measure(totals, blocked, emptyMessage);
  const current = totals.currentCount ? totals.current / totals.currentCount : 0;
  const previous = totals.previousCount ? totals.previous / totals.previousCount : 0;
  return measure({
    current,
    previous,
    currentCount: totals.currentCount,
    previousCount: totals.previousCount,
  }, blocked, emptyMessage);
}

function periodTotals<Record>(
  records: readonly Record[],
  period: CommercePerformancePeriod,
  priorPeriod: CommercePerformancePeriod,
  dateFor: (record: Record) => string | undefined,
  amountFor: (record: Record) => number | undefined,
): PeriodTotals {
  const totals: PeriodTotals = { current: 0, previous: 0, currentCount: 0, previousCount: 0 };
  for (const record of records) {
    const date = dateFor(record);
    const amount = amountFor(record);
    if (amount === undefined || !date) continue;
    if (inPeriod(date, period)) {
      totals.current += amount;
      totals.currentCount += 1;
    } else if (inPeriod(date, priorPeriod)) {
      totals.previous += amount;
      totals.previousCount += 1;
    }
  }
  return totals;
}

function eligibleOrders(revenue: CommerceRevenueSource): CommerceRevenueSource['salesOrders'] {
  return revenue.salesOrders.filter((order) => order.status !== 'cancelled');
}

function eligibleInvoices(revenue: CommerceRevenueSource): CommerceRevenueSource['invoices'] {
  return revenue.invoices.filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'cancelled');
}

function eligibleReceipts(revenue: CommerceRevenueSource): CommerceRevenueSource['paymentReceipts'] {
  return revenue.paymentReceipts.filter((receipt) => receipt.status === 'recorded' || receipt.status === 'reconciled');
}

function invoiceRows(
  invoices: CommerceRevenueSource['invoices'],
  period: CommercePerformancePeriod,
): InvoicePeriodRecord[] {
  return invoices.flatMap((invoice) => {
    const localDate = indiaBusinessDate(invoice.invoiceDate);
    return inPeriod(localDate, period) && localDate ? [{ invoice, localDate }] : [];
  });
}

function section<Row>(
  rows: Row[],
  blocked: Restriction,
  emptyMessage: string,
): CommercePerformanceSection<Row> {
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

function buildTopProducts(
  revenue: CommerceRevenueSource,
  period: CommercePerformancePeriod,
  blocked: Restriction,
): CommercePerformanceSection<CommerceTopProduct> {
  if (blocked.restricted) return section([], blocked, 'Issued invoice-line evidence is unavailable for this period.');
  const productsVisible = !new Set(revenue.readProjection.hiddenCollections).has('products');
  const catalogById = productsVisible ? new Map(revenue.products.map((product) => [product.id, product])) : new Map();
  const grouped = new Map<string, CommerceTopProduct & { invoiceIds: Set<string> }>();
  for (const { invoice } of invoiceRows(eligibleInvoices(revenue), period)) {
    for (const line of invoice.lines ?? []) {
      const taxableValue = finiteNumber(line.taxableValue);
      const quantity = finiteNumber(line.quantity);
      if (taxableValue === undefined || quantity === undefined) continue;
      const catalog = line.catalogProductId ? catalogById.get(line.catalogProductId) : undefined;
      const name = catalog?.name ?? line.description?.trim();
      if (!name) continue;
      const id = catalog ? `catalog:${catalog.id}` : `line:${line.catalogProductId ?? name.toLocaleLowerCase('en-IN')}`;
      const current = grouped.get(id);
      if (current) {
        current.taxableValue += taxableValue;
        current.quantity += quantity;
        current.invoiceIds.add(invoice.id);
        continue;
      }
      grouped.set(id, {
        id,
        productId: catalog?.id ?? line.catalogProductId,
        sku: catalog?.sku,
        name,
        taxableValue,
        quantity,
        invoiceCount: 0,
        invoiceIds: new Set([invoice.id]),
      });
    }
  }
  const rows = [...grouped.values()]
    .map(({ invoiceIds, ...row }) => ({ ...row, invoiceCount: invoiceIds.size }))
    .sort((left, right) => right.taxableValue - left.taxableValue || left.name.localeCompare(right.name, 'en-IN'))
    .slice(0, 5);
  return section(rows, blocked, 'No issued invoice line falls inside the selected period.');
}

function buildTopCustomers(
  revenue: CommerceRevenueSource,
  party: Pick<PartySnapshot, 'accounts'>,
  period: CommercePerformancePeriod,
  blocked: Restriction,
): CommercePerformanceSection<CommerceTopCustomer> {
  if (blocked.restricted) return section([], blocked, 'Issued customer billing evidence is unavailable for this period.');
  const accounts = new Map(party.accounts.map((account) => [account.id, account]));
  const grouped = new Map<string, CommerceTopCustomer>();
  for (const { invoice } of invoiceRows(eligibleInvoices(revenue), period)) {
    const issuedBilling = finiteNumber(invoice.taxPreview?.grandTotal);
    if (issuedBilling === undefined || !invoice.accountId) continue;
    const current = grouped.get(invoice.accountId);
    if (current) {
      current.issuedBilling += issuedBilling;
      current.invoiceCount += 1;
      continue;
    }
    grouped.set(invoice.accountId, {
      id: `account:${invoice.accountId}`,
      accountId: invoice.accountId,
      name: accounts.get(invoice.accountId)?.displayName ?? 'Unlinked customer',
      issuedBilling,
      invoiceCount: 1,
    });
  }
  const rows = [...grouped.values()]
    .sort((left, right) => right.issuedBilling - left.issuedBilling || left.name.localeCompare(right.name, 'en-IN'))
    .slice(0, 5);
  return section(rows, blocked, 'No issued customer invoice falls inside the selected period.');
}

function overallState(items: Array<{ state: CommercePerformanceState }>): CommercePerformanceState {
  if (items.some((item) => item.state === 'ready')) return 'ready';
  if (items.some((item) => item.state === 'restricted')) return 'restricted';
  return 'empty';
}

/**
 * Builds a renderer-ready India Commerce Performance Pack from governed,
 * already-scoped snapshots. It never creates, mutates or estimates records.
 *
 * The function deliberately refuses to use a RevenueOps snapshot whose scope
 * and read-projection scope disagree. This prevents a dashboard from showing
 * values from an ambiguous company or branch context.
 */
export function buildCommercePerformance({
  dashboard,
  revenue,
  party,
  period: requestedPeriod,
}: BuildCommercePerformanceInput): CommercePerformancePack {
  const { period, priorPeriod } = createPeriods(requestedPeriod, revenue.generatedAt, dashboard.generatedAt);
  const scopeBlocked = scopeRestriction(revenue);
  const ordersValueAccess = combineRestrictions(
    ...(scopeBlocked ? [scopeBlocked] : []),
    restriction(revenue, 'salesOrders', 'sales.commercial', ['orderDate', 'status', 'taxPreview'], ['confirmedOrderValue']),
  );
  const ordersDiscountAccess = combineRestrictions(
    ...(scopeBlocked ? [scopeBlocked] : []),
    restriction(revenue, 'salesOrders', 'sales.commercial', ['orderDate', 'status', 'discountTotal']),
  );
  const invoicesValueAccess = combineRestrictions(
    ...(scopeBlocked ? [scopeBlocked] : []),
    restriction(revenue, 'invoices', 'finance.receivable', ['invoiceDate', 'status', 'taxPreview'], ['billedValue']),
  );
  const invoiceDiscountAccess = combineRestrictions(
    ...(scopeBlocked ? [scopeBlocked] : []),
    restriction(revenue, 'invoices', 'finance.receivable', ['invoiceDate', 'status', 'discountTotal']),
  );
  const receiptsAccess = combineRestrictions(
    ...(scopeBlocked ? [scopeBlocked] : []),
    restriction(revenue, 'paymentReceipts', 'finance.receivable', ['receivedAt', 'status', 'amount']),
  );
  const topProductsAccess = combineRestrictions(
    ...(scopeBlocked ? [scopeBlocked] : []),
    restriction(revenue, 'invoices', 'finance.receivable', ['invoiceDate', 'status', 'lines']),
  );
  const topCustomersAccess = combineRestrictions(
    ...(scopeBlocked ? [scopeBlocked] : []),
    restriction(revenue, 'invoices', 'finance.receivable', ['invoiceDate', 'status', 'accountId', 'taxPreview'], ['billedValue']),
  );

  const orders = eligibleOrders(revenue);
  const invoices = eligibleInvoices(revenue);
  const receipts = eligibleReceipts(revenue);
  const orderedValue = periodTotals(orders, period, priorPeriod, (order) => indiaBusinessDate(order.orderDate), (order) => finiteNumber(order.taxPreview?.grandTotal));
  const orderDiscounts = periodTotals(orders, period, priorPeriod, (order) => indiaBusinessDate(order.orderDate), (order) => finiteNumber(order.discountTotal));
  const issuedBilling = periodTotals(invoices, period, priorPeriod, (invoice) => indiaBusinessDate(invoice.invoiceDate), (invoice) => finiteNumber(invoice.taxPreview?.grandTotal));
  const issuedGst = periodTotals(invoices, period, priorPeriod, (invoice) => indiaBusinessDate(invoice.invoiceDate), (invoice) => finiteNumber(invoice.taxPreview?.totalTax));
  const billingDiscounts = periodTotals(invoices, period, priorPeriod, (invoice) => indiaBusinessDate(invoice.invoiceDate), (invoice) => finiteNumber(invoice.discountTotal));
  const recordedCollections = periodTotals(receipts, period, priorPeriod, (receipt) => indiaBusinessDate(receipt.receivedAt), (receipt) => finiteNumber(receipt.amount));

  const summary = {
    orderedValue: measure(orderedValue, ordersValueAccess, 'No non-cancelled sales order falls inside the selected period.'),
    issuedBilling: measure(issuedBilling, invoicesValueAccess, 'No issued invoice falls inside the selected period.'),
    issuedGst: measure(issuedGst, invoicesValueAccess, 'No issued invoice GST falls inside the selected period.'),
    orderDiscounts: measure(orderDiscounts, ordersDiscountAccess, 'No non-cancelled sales-order discount falls inside the selected period.'),
    billingDiscounts: measure(billingDiscounts, invoiceDiscountAccess, 'No issued-invoice discount falls inside the selected period.'),
    recordedCollections: measure(recordedCollections, receiptsAccess, 'No recorded or reconciled customer receipt falls inside the selected period.'),
    orderAov: averageMeasure(orderedValue, ordersValueAccess, 'No non-cancelled sales order falls inside the selected period.'),
    issuedBillingAov: averageMeasure(issuedBilling, invoicesValueAccess, 'No issued invoice falls inside the selected period.'),
  };
  const topProducts = buildTopProducts(revenue, period, topProductsAccess);
  const topCustomers = buildTopCustomers(revenue, party, period, topCustomersAccess);
  const items = [...Object.values(summary), topProducts, topCustomers];
  const restrictedSources = [...new Set(items.flatMap((item) => item.restrictedCollections))];

  return {
    generatedAt: revenue.generatedAt,
    currency: 'INR',
    state: overallState(items),
    period,
    priorPeriod,
    source: {
      revenueRevision: revenue.revision,
      dashboardRevision: dashboard.revision,
      partyRevision: party.revision,
      scope: { companyId: revenue.scope.companyId, branchId: revenue.scope.branchId },
    },
    summary,
    topProducts,
    topCustomers,
    restrictedSources,
  };
}
