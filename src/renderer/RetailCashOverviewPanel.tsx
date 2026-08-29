import { AlertTriangle, ArrowRight, Banknote, CircleDollarSign, ReceiptText, ShieldCheck } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { computeRetailCashOverview, type RetailCashOverviewRow, type RetailCashRisk } from '../domain/retail-cash-overview';
import { computeRetailTenderSettlementReconciliation } from '../domain/retail-reports';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { RetailCashierShift, RetailCounter, RetailSale } from '../shared/retail-pos-contracts';
import { TrendLineChart, type ChartDatum } from './ExecutiveCharts';

type CashFilter = 'all' | 'review' | 'open' | 'clear';
export type RetailCashDestination = 'cash' | 'close' | 'settlements';
const cashLabels: Record<CashFilter, string> = { all: 'All till evidence', review: 'Needs review', open: 'Open now', clear: 'Closed cleanly' };
const riskLabels: Record<RetailCashRisk, string> = { clear: 'Clear', open: 'Open', review: 'Review' };
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export interface RetailCashOverviewPanelProps {
  shifts: readonly RetailCashierShift[];
  counters: readonly RetailCounter[];
  sales: readonly RetailSale[];
  receipts: NonNullable<RevenueOpsSnapshot['paymentReceipts']>;
  bankLines?: NonNullable<RevenueOpsSnapshot['bankStatementLines']>;
  onOpenAdvanced?: () => void;
  onOpenDestination?: (destination: RetailCashDestination) => void;
}

function saleDate(sale: RetailSale): string | undefined { return sale.completedAt ?? sale.saleAt; }

/**
 * A store-close decision surface. Calculations remain read-only here; the
 * governed close workflow retains maker/checker and tender evidence controls.
 */
export function RetailCashOverviewPanel({ shifts, counters, sales, receipts, bankLines = [], onOpenAdvanced, onOpenDestination }: RetailCashOverviewPanelProps): ReactNode {
  const [filter, setFilter] = useState<CashFilter>('all');
  const report = useMemo(() => computeRetailCashOverview({ shifts: [...shifts], counters: [...counters], sales: [...sales], receipts: [...receipts] }), [counters, receipts, sales, shifts]);
  const settlement = useMemo(() => computeRetailTenderSettlementReconciliation({ receipts: [...receipts], bankLines: [...bankLines] }), [bankLines, receipts]);
  const rows = filter === 'all' ? report.rows : report.rows.filter((row) => row.risk === filter);
  const completedSales = useMemo(() => sales.filter((sale) => sale.status === 'completed'), [sales]);
  const salesValue = completedSales.reduce((sum, sale) => sum + sale.taxPreview.grandTotal, 0);
  const expectedCash = report.rows.reduce((sum, row) => sum + (row.expectedCash ?? row.cashTenderValue), 0);
  const electronicExceptions = settlement.rows.filter((row) => row.status === 'needs-action').length;
  const exceptionCount = report.summary.reviewCount + electronicExceptions;
  const gstOutput = completedSales.reduce((sum, sale) => sum + sale.taxPreview.totalTax, 0);
  const salesTrend = useMemo<ChartDatum[]>(() => {
    const byDay = new Map<string, number>();
    for (const sale of completedSales) {
      const date = saleDate(sale)?.slice(0, 10);
      if (!date) continue;
      byDay.set(date, (byDay.get(date) ?? 0) + sale.taxPreview.grandTotal);
    }
    return [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-7).map(([date, value]) => ({ label: date.slice(5), value }));
  }, [completedSales]);
  const closedShifts = report.rows.filter((row) => row.status === 'closed').length;
  const declaredShifts = report.rows.filter((row) => row.declaredCash !== undefined).length;
  const settledPercent = settlement.totalRecordedElectronicAmount > 0
    ? Math.round((settlement.totalBankMatchedElectronicAmount / settlement.totalRecordedElectronicAmount) * 1000) / 10
    : undefined;
  const checklist = [
    { label: 'POS shifts closed', value: `${closedShifts} / ${report.rows.length}`, state: report.rows.length > 0 && closedShifts === report.rows.length ? 'ready' : 'review', detail: report.rows.length ? 'Recorded close evidence' : 'No shifts recorded' },
    { label: 'Cash counted', value: `${declaredShifts} / ${report.rows.length}`, state: report.rows.length > 0 && declaredShifts === report.rows.length ? 'ready' : 'review', detail: 'Tender declaration evidence' },
    { label: 'Electronic receipts matched', value: settledPercent === undefined ? '—' : `${settledPercent}%`, state: settlement.actionRequired ? 'review' : 'ready', detail: settlement.actionRequired ? 'Bank evidence needs review' : 'Recorded settlement evidence matched' },
    { label: 'Cash variance reviewed', value: report.summary.reviewCount ? `${report.summary.reviewCount} open` : '0 open', state: report.summary.reviewCount ? 'review' : 'ready', detail: 'Independent decision required if open' },
    { label: 'GST output recorded', value: inr.format(gstOutput), state: completedSales.length ? 'ready' : 'review', detail: 'Recorded sale tax only—not a filing status' },
  ] as const;
  const metrics = [
    { label: 'Recorded sales', value: inr.format(salesValue), detail: `${completedSales.length} completed bill${completedSales.length === 1 ? '' : 's'}`, tone: 'blue', Icon: CircleDollarSign },
    { label: 'Expected cash', value: inr.format(expectedCash), detail: `${report.summary.openShifts} shift${report.summary.openShifts === 1 ? '' : 's'} open`, tone: 'green', Icon: Banknote },
    { label: 'Unsettled electronic', value: inr.format(settlement.totalUnmatchedElectronicAmount), detail: `${electronicExceptions} tender rail${electronicExceptions === 1 ? '' : 's'} need review`, tone: settlement.totalUnmatchedElectronicAmount ? 'amber' : 'green', Icon: ReceiptText },
    { label: 'Exceptions', value: exceptionCount.toLocaleString('en-IN'), detail: exceptionCount ? 'Requires a recorded decision' : 'No recorded exception', tone: exceptionCount ? 'red' : 'green', Icon: AlertTriangle },
    { label: 'GST output', value: inr.format(gstOutput), detail: 'Completed retail sales', tone: 'purple', Icon: ShieldCheck },
  ] as const;
  const openDestination = (destination: RetailCashDestination): void => {
    if (onOpenDestination) {
      onOpenDestination(destination);
      return;
    }
    onOpenAdvanced?.();
  };

  return <section className="retail-cash-overview" data-testid="retail-cash-overview" aria-labelledby="retail-cash-overview-title">
    <header className="retail-cash-overview__header"><div><span className="eyebrow"><CircleDollarSign size={14} aria-hidden="true" /> Cash and settlement</span><h1 id="retail-cash-overview-title" className="retail-front-door__title">Close the day by exception, not by spreadsheet.</h1><p>Cash, UPI, cards, bank settlement and GST evidence remain connected to their source records.</p></div><button type="button" className="button button--quiet" onClick={() => openDestination('cash')}>Open money controls <ArrowRight size={14} aria-hidden="true" /></button></header>

    <div className="retail-cash-overview__metrics" aria-label="Money and close summary" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>{metrics.map(({ label, value, detail, tone, Icon }) => <div key={label} data-alert={tone === 'red' || tone === 'amber'}><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</div>

    <div className="retail-cash-overview__body">
      <section className="retail-cash-overview__list" aria-labelledby="day-close-checklist-title">
        <header style={{ padding: '17px 17px 5px' }}><span className="eyebrow">Day close checklist</span><h3 id="day-close-checklist-title">Review what needs a decision</h3></header>
        {checklist.map((item) => <article key={item.label} className="retail-cash-overview__row" data-risk={item.state === 'review' ? 'review' : 'clear'}>
          <div className="retail-cash-overview__row-title"><span className="retail-cash-overview__risk">{item.state === 'ready' ? 'Ready' : 'Review'}</span><strong>{item.label}</strong><small>{item.detail}</small></div><div className="retail-cash-overview__value"><strong>{item.value}</strong></div>
        </article>)}
        <div style={{ padding: 14 }}><button type="button" className="button button--primary" style={{ width: '100%' }} onClick={() => openDestination('close')}>Continue day close <ArrowRight size={14} aria-hidden="true" /></button></div>
      </section>
      <section className="retail-cash-overview__detail" aria-labelledby="money-sales-trend-title"><span className="eyebrow">Net sales · recorded days</span><h3 id="money-sales-trend-title">Sales trend</h3><TrendLineChart title="Recorded sales by day" data={salesTrend} formatValue={(value) => inr.format(value)} /><small>Only completed local retail sale evidence is plotted. No projected close total is shown.</small></section>
    </div>

    <section className="retail-cash-overview__settlement" aria-labelledby="retail-cash-settlement-title"><header><div><span className="eyebrow">Settlement exceptions</span><h3 id="retail-cash-settlement-title">Recorded versus bank matched</h3></div><button type="button" className="button button--quiet" onClick={() => openDestination('settlements')}>Open bank matching <ArrowRight size={13} aria-hidden="true" /></button></header><div className="retail-cash-overview__settlement-list" role="list">{settlement.rows.filter(({ method }) => method !== 'cash').map((row) => <div key={row.method} data-status={row.status} role="listitem"><div><strong>{row.method === 'bank-transfer' ? 'Bank transfer' : row.method.toUpperCase()}</strong><small>{row.receiptCount} receipt{row.receiptCount === 1 ? '' : 's'} · {row.reconciledReceiptCount} reconciled</small></div><span><b>{inr.format(row.bankMatchedAmount)}</b> / {inr.format(row.recordedAmount)} matched</span><em>{row.status === 'not-applicable' ? 'Not in scope' : row.status === 'ready' ? 'Matched' : `${inr.format(row.gapAmount)} gap`}</em></div>)}</div><p>{settlement.actionRequired ? settlement.nextActions[0] : 'All electronic tender evidence in scope is reconciled to imported bank lines.'}</p></section>

    <details className="retail-cash-overview__detail"><summary>Inspect individual till evidence</summary><nav className="retail-cash-overview__filters" aria-label="Cash filters">{(Object.keys(cashLabels) as CashFilter[]).map((value) => <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value}>{cashLabels[value]}</button>)}</nav><div className="retail-cash-overview__list" role="list" aria-label="Cashier shifts">{rows.map((row) => <CashRow key={row.shiftId} row={row} />)}{!rows.length ? <div className="bharat-empty"><Banknote size={22} aria-hidden="true" /><strong>No tills in this view</strong><span>When a governed shift is opened, its cash evidence will appear here.</span></div> : null}</div></details>

    <footer className="retail-cash-overview__footer"><ShieldCheck size={14} aria-hidden="true" /> Closing requires tender-by-tender declarations and independent approval. This view never closes a till or changes a payment.</footer>
  </section>;
}

function CashRow({ row }: { row: RetailCashOverviewRow }): ReactNode {
  return <article className="retail-cash-overview__row" data-risk={row.risk} role="listitem"><div className="retail-cash-overview__row-title"><span className="retail-cash-overview__risk">{riskLabels[row.risk]}</span><strong>{row.shiftNumber}</strong><small>{row.counterLabel} · {row.status.replaceAll('-', ' ')}</small></div><div className="retail-cash-overview__value"><strong>{inr.format(row.salesValue)}</strong><span>{row.saleCount} sale{row.saleCount === 1 ? '' : 's'}</span></div><div className="retail-cash-overview__row-meta"><span>Cash {inr.format(row.cashTenderValue)}</span>{row.expectedCash !== undefined ? <span>Expected {inr.format(row.expectedCash)}</span> : null}{row.variance !== undefined ? <span>Variance {inr.format(row.variance)}</span> : null}</div><p>{row.nextAction}</p></article>;
}

export function RetailCashOverviewFromRevenue({ revenue, onOpenAdvanced, onOpenDestination }: { revenue: RevenueOpsSnapshot; onOpenAdvanced?: () => void; onOpenDestination?: (destination: RetailCashDestination) => void }): ReactNode {
  return <RetailCashOverviewPanel shifts={revenue.retailCashierShifts} counters={revenue.retailCounters} sales={revenue.retailSales} receipts={revenue.paymentReceipts} bankLines={revenue.bankStatementLines} onOpenAdvanced={onOpenAdvanced} onOpenDestination={onOpenDestination} />;
}
