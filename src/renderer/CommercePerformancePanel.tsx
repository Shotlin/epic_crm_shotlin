import {
  ArrowRight,
  BadgeIndianRupee,
  CalendarDays,
  ChartNoAxesCombined,
  PackageCheck,
  ReceiptIndianRupee,
  ShoppingBasket,
  UsersRound,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  buildCommercePerformance,
  type CommercePerformancePeriodInput,
  type CommercePerformanceMeasure,
  type CommercePerformanceSection,
  type CommerceTopCustomer,
  type CommerceTopProduct,
} from '../domain/commerce-performance';
import type { CommerceInsightRoute } from '../domain/commerce-insights';
import type { DashboardSnapshot } from '../shared/contracts';
import type { PartySnapshot } from '../shared/party-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export interface CommercePerformancePanelProps {
  dashboard: DashboardSnapshot;
  revenue: RevenueOpsSnapshot;
  party: PartySnapshot;
  onNavigate: (route: CommerceInsightRoute) => void;
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const fullInrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

type PerformancePeriodPreset = 'this-month' | 'last-month' | 'custom';

function isPlainIndiaDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-');
  const year = Number(parts[0] ?? '');
  const month = Number(parts[1] ?? '');
  const day = Number(parts[2] ?? '');
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function customPeriodIssue(start: string, end: string): string | null {
  if (!isPlainIndiaDate(start) || !isPlainIndiaDate(end)) {
    return 'Enter both India business dates in YYYY-MM-DD form.';
  }
  if (start > end) return 'The start date must be on or before the end date.';
  return null;
}

function formatPeriodDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatComparison(measure: CommercePerformanceMeasure): string {
  if (measure.state === 'restricted') return 'Protected by role policy';
  if (measure.state === 'empty') return measure.emptyMessage;
  if (measure.changePercent === null) {
    return measure.previousDocumentCount ? 'Prior-period comparison is not available.' : 'New evidence in this period.';
  }
  const sign = measure.changePercent > 0 ? '+' : '';
  return `${sign}${measure.changePercent.toLocaleString('en-IN', { maximumFractionDigits: 1 })}% vs prior period`;
}

function formatDocuments(measure: CommercePerformanceMeasure, noun: string): string {
  if (measure.documentCount === null) return 'Source withheld';
  if (measure.documentCount === 0) return 'No matching document';
  return `${measure.documentCount.toLocaleString('en-IN')} ${noun}${measure.documentCount === 1 ? '' : 's'}`;
}

function PerformancePeriodSelector({
  preset,
  onPresetChange,
  thisMonth,
  lastMonth,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  customIssue,
}: {
  preset: PerformancePeriodPreset;
  onPresetChange: (preset: PerformancePeriodPreset) => void;
  thisMonth: CommercePerformancePeriodInput;
  lastMonth: CommercePerformancePeriodInput;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  customIssue: string | null;
}): ReactNode {
  return (
    <fieldset className="commerce-performance__period-selector" aria-describedby="commerce-performance-period-help">
      <legend>Reporting period</legend>
      <div className="commerce-performance__period-options">
        <label>
          <input
            aria-label="This month"
            checked={preset === 'this-month'}
            name="commerce-performance-period"
            onChange={() => onPresetChange('this-month')}
            type="radio"
            value="this-month"
          />
          <span><strong>This month</strong><small>{formatPeriodDate(thisMonth.start)} – {formatPeriodDate(thisMonth.end)}</small></span>
        </label>
        <label>
          <input
            aria-label="Last month"
            checked={preset === 'last-month'}
            name="commerce-performance-period"
            onChange={() => onPresetChange('last-month')}
            type="radio"
            value="last-month"
          />
          <span><strong>Last month</strong><small>{formatPeriodDate(lastMonth.start)} – {formatPeriodDate(lastMonth.end)}</small></span>
        </label>
        <label>
          <input
            aria-label="Custom range"
            checked={preset === 'custom'}
            name="commerce-performance-period"
            onChange={() => onPresetChange('custom')}
            type="radio"
            value="custom"
          />
          <span><strong>Custom range</strong><small>Inclusive business dates</small></span>
        </label>
      </div>
      {preset === 'custom' ? <div className="commerce-performance__custom-dates" data-invalid={customIssue ? 'true' : undefined}>
        <label>Start date<input aria-describedby={customIssue ? 'commerce-performance-period-error' : undefined} onChange={(event) => onCustomStartChange(event.target.value)} type="date" value={customStart} /></label>
        <label>End date<input aria-describedby={customIssue ? 'commerce-performance-period-error' : undefined} onChange={(event) => onCustomEndChange(event.target.value)} type="date" value={customEnd} /></label>
        {customIssue ? <p id="commerce-performance-period-error" role="status">{customIssue} The view is retaining this month until the range is valid.</p> : null}
      </div> : null}
      <p id="commerce-performance-period-help">All boundaries are inclusive Asia/Kolkata business dates.</p>
    </fieldset>
  );
}

function PerformanceMetric({
  label,
  detail,
  noun,
  measure,
  onClick,
}: {
  label: string;
  detail: string;
  noun: string;
  measure: CommercePerformanceMeasure;
  onClick: () => void;
}): ReactNode {
  const value = measure.state === 'ready' && measure.current !== null
    ? fullInrFormatter.format(measure.current)
    : measure.state === 'restricted' ? 'Restricted' : 'Awaiting evidence';

  return (
    <button
      className="commerce-performance__metric"
      type="button"
      data-state={measure.state}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      <em>{formatDocuments(measure, noun)}</em>
      <i>{formatComparison(measure)}</i>
    </button>
  );
}

function SectionNotice<Row>({ section }: { section: CommercePerformanceSection<Row> }): ReactNode | null {
  if (section.state === 'ready') return null;
  if (section.state === 'restricted') {
    return <p className="commerce-performance__notice" data-state="restricted">Protected evidence is not displayed in this view. Open the accountable workbench with the required role.</p>;
  }
  return <p className="commerce-performance__notice">{section.emptyMessage}</p>;
}

function ProductRankings({
  section,
  onNavigate,
}: {
  section: CommercePerformanceSection<CommerceTopProduct>;
  onNavigate: () => void;
}): ReactNode {
  const maximum = Math.max(1, ...section.rows.map((row) => row.taxableValue));
  return (
    <article className="commerce-performance__rank-card">
      <header>
        <span className="commerce-performance__icon"><ShoppingBasket size={17} aria-hidden="true" /></span>
        <div><span>ISSUED INVOICE LINES</span><h3>Top billed products</h3></div>
        <button type="button" onClick={onNavigate}>Open products <ArrowRight size={14} aria-hidden="true" /></button>
      </header>
      {section.state === 'ready' ? <ol>
        {section.rows.map((row) => <li key={row.id}>
          <div className="commerce-performance__rank-copy"><strong>{row.name}</strong><small>{row.quantity.toLocaleString('en-IN')} units · {row.invoiceCount} issued invoice{row.invoiceCount === 1 ? '' : 's'}</small><span aria-hidden="true"><i style={{ width: `${Math.max(8, Math.round((row.taxableValue / maximum) * 100))}%` }} /></span></div>
          <b>{inrFormatter.format(row.taxableValue)}</b>
        </li>)}
      </ol> : <SectionNotice section={section} />}
    </article>
  );
}

function CustomerRankings({
  section,
  onNavigate,
}: {
  section: CommercePerformanceSection<CommerceTopCustomer>;
  onNavigate: () => void;
}): ReactNode {
  const maximum = Math.max(1, ...section.rows.map((row) => row.issuedBilling));
  return (
    <article className="commerce-performance__rank-card">
      <header>
        <span className="commerce-performance__icon"><UsersRound size={17} aria-hidden="true" /></span>
        <div><span>ISSUED CUSTOMER BILLING</span><h3>Customer concentration</h3></div>
        <button type="button" onClick={onNavigate}>Open collections <ArrowRight size={14} aria-hidden="true" /></button>
      </header>
      {section.state === 'ready' ? <ol>
        {section.rows.map((row) => <li key={row.id}>
          <div className="commerce-performance__rank-copy"><strong>{row.name}</strong><small>{row.invoiceCount} issued invoice{row.invoiceCount === 1 ? '' : 's'} · GST-inclusive billing</small><span aria-hidden="true"><i style={{ width: `${Math.max(8, Math.round((row.issuedBilling / maximum) * 100))}%` }} /></span></div>
          <b>{inrFormatter.format(row.issuedBilling)}</b>
        </li>)}
      </ol> : <SectionNotice section={section} />}
    </article>
  );
}

/**
 * A compact, evidence-first performance view derived from governed Epic BOS
 * sources. It is intentionally read-only: drill-through goes to the workbench
 * accountable for recording or changing the underlying business event.
 */
export function CommercePerformancePanel({ dashboard, revenue, party, onNavigate }: CommercePerformancePanelProps): ReactNode {
  const thisMonthPerformance = useMemo(
    () => buildCommercePerformance({ dashboard, revenue, party }),
    [dashboard, party, revenue],
  );
  const [periodPreset, setPeriodPreset] = useState<PerformancePeriodPreset>('this-month');
  const [customStart, setCustomStart] = useState(() => thisMonthPerformance.period.start);
  const [customEnd, setCustomEnd] = useState(() => thisMonthPerformance.period.end);
  const customIssue = customPeriodIssue(customStart, customEnd);
  const requestedPeriod = useMemo<CommercePerformancePeriodInput>(() => {
    if (periodPreset === 'last-month') {
      return {
        start: thisMonthPerformance.priorPeriod.start,
        end: thisMonthPerformance.priorPeriod.end,
      };
    }
    if (periodPreset === 'custom' && !customIssue) {
      return { start: customStart, end: customEnd };
    }
    return {
      start: thisMonthPerformance.period.start,
      end: thisMonthPerformance.period.end,
    };
  }, [customEnd, customIssue, customStart, periodPreset, thisMonthPerformance.period.end, thisMonthPerformance.period.start, thisMonthPerformance.priorPeriod.end, thisMonthPerformance.priorPeriod.start]);
  const performance = useMemo(
    () => buildCommercePerformance({ dashboard, revenue, party, period: requestedPeriod }),
    [dashboard, party, requestedPeriod, revenue],
  );
  const { summary } = performance;

  return (
    <section className="commerce-performance" aria-labelledby="commerce-performance-title" data-testid="commerce-performance">
      <header className="commerce-performance__masthead">
        <div className="commerce-performance__masthead-copy">
          <span className="commerce-performance__eyebrow"><span /> Commerce performance</span>
          <h2 id="commerce-performance-title">A clean view of what the business actually recorded.</h2>
          <p data-testid="commerce-performance-selected-period">Selected period: {formatPeriodDate(performance.period.start)} – {formatPeriodDate(performance.period.end)} · Asia/Kolkata. Orders, invoicing, GST and collections remain separate evidence streams.</p>
          <PerformancePeriodSelector
            customEnd={customEnd}
            customIssue={customIssue}
            customStart={customStart}
            lastMonth={thisMonthPerformance.priorPeriod}
            onCustomEndChange={setCustomEnd}
            onCustomStartChange={setCustomStart}
            onPresetChange={setPeriodPreset}
            preset={periodPreset}
            thisMonth={thisMonthPerformance.period}
          />
        </div>
        <div className="commerce-performance__period"><CalendarDays size={16} aria-hidden="true" /><span>Prior comparison</span><strong>{formatPeriodDate(performance.priorPeriod.start)} – {formatPeriodDate(performance.priorPeriod.end)}</strong></div>
      </header>

      <div className="commerce-performance__signal-bar" aria-label="Commerce evidence boundary">
        <span><BadgeIndianRupee size={15} aria-hidden="true" /> INR domestic reporting</span>
        <span><ChartNoAxesCombined size={15} aria-hidden="true" /> Source revisions {performance.source.revenueRevision} / {performance.source.dashboardRevision}</span>
        <span><PackageCheck size={15} aria-hidden="true" /> Read-only decision view</span>
      </div>

      <div className="commerce-performance__metrics" aria-label="Period performance measures">
        <PerformanceMetric label="Ordered value" detail="Non-cancelled sales orders" noun="order" measure={summary.orderedValue} onClick={() => onNavigate('fulfilment')} />
        <PerformanceMetric label="Issued billing" detail="Issued tax invoices only" noun="invoice" measure={summary.issuedBilling} onClick={() => onNavigate('cash')} />
        <PerformanceMetric label="GST on billing" detail="Tax on issued invoices" noun="invoice" measure={summary.issuedGst} onClick={() => onNavigate('cash')} />
        <PerformanceMetric label="Recorded collections" detail="Recorded / reconciled receipts" noun="receipt" measure={summary.recordedCollections} onClick={() => onNavigate('collections')} />
      </div>

      <div className="commerce-performance__metrics commerce-performance__metrics--secondary" aria-label="Commercial-quality measures">
        <PerformanceMetric label="Order concessions" detail="Discounts on eligible orders" noun="order" measure={summary.orderDiscounts} onClick={() => onNavigate('commerce')} />
        <PerformanceMetric label="Billing concessions" detail="Discounts on issued invoices" noun="invoice" measure={summary.billingDiscounts} onClick={() => onNavigate('cash')} />
        <PerformanceMetric label="Order AOV" detail="Ordered value per eligible order" noun="order" measure={summary.orderAov} onClick={() => onNavigate('fulfilment')} />
        <PerformanceMetric label="Billing AOV" detail="Issued billing per invoice" noun="invoice" measure={summary.issuedBillingAov} onClick={() => onNavigate('cash')} />
      </div>

      <div className="commerce-performance__rankings">
        <ProductRankings section={performance.topProducts} onNavigate={() => onNavigate('commerce')} />
        <CustomerRankings section={performance.topCustomers} onNavigate={() => onNavigate('collections')} />
      </div>

      <footer className="commerce-performance__boundary"><ReceiptIndianRupee size={16} aria-hidden="true" /><span>Collections mean receipts recorded inside Epic BOS; they are not a claim that a bank, UPI provider or payment gateway has independently settled a transaction.</span></footer>
    </section>
  );
}
