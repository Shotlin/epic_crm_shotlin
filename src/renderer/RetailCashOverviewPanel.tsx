import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, CircleDollarSign, Clock3, ReceiptText, ShieldCheck } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { computeRetailCashOverview, type RetailCashOverviewRow, type RetailCashRisk } from '../domain/retail-cash-overview';
import { computeRetailTenderSettlementReconciliation } from '../domain/retail-reports';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { RetailCashierShift, RetailCounter, RetailSale } from '../shared/retail-pos-contracts';

type CashFilter = 'all' | 'review' | 'open' | 'clear';
const cashLabels: Record<CashFilter, string> = { all: 'All tills', review: 'Needs review', open: 'Open now', clear: 'Closed cleanly' };
const riskLabels: Record<RetailCashRisk, string> = { clear: 'Clear', open: 'Open', review: 'Review' };
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export interface RetailCashOverviewPanelProps {
  shifts: readonly RetailCashierShift[];
  counters: readonly RetailCounter[];
  sales: readonly RetailSale[];
  receipts: NonNullable<RevenueOpsSnapshot['paymentReceipts']>;
  bankLines?: NonNullable<RevenueOpsSnapshot['bankStatementLines']>;
  onOpenAdvanced: () => void;
}

/** Simple cash front door. Closing and reconciliation remain governed actions. */
export function RetailCashOverviewPanel({ shifts, counters, sales, receipts, bankLines = [], onOpenAdvanced }: RetailCashOverviewPanelProps): ReactNode {
  const [filter, setFilter] = useState<CashFilter>('all');
  const report = useMemo(() => computeRetailCashOverview({ shifts: [...shifts], counters: [...counters], sales: [...sales], receipts: [...receipts] }), [counters, receipts, sales, shifts]);
  const settlement = useMemo(() => computeRetailTenderSettlementReconciliation({ receipts: [...receipts], bankLines: [...bankLines] }), [bankLines, receipts]);
  const rows = filter === 'all' ? report.rows : report.rows.filter((row) => row.risk === filter);
  const selected = rows[0];
  return <section className="retail-cash-overview" data-testid="retail-cash-overview" aria-labelledby="retail-cash-overview-title">
    <header className="retail-cash-overview__header"><div><span className="eyebrow"><CircleDollarSign size={14} aria-hidden="true" /> Money / Cash</span><h2 id="retail-cash-overview-title">Close cash with confidence</h2><p>See every till, tender total, close request, and recorded variance before you open the detailed finance controls.</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open money controls <ArrowRight size={14} aria-hidden="true" /></button></header>
    <div className="retail-cash-overview__metrics" aria-label="Cash overview"><div><Banknote size={17} aria-hidden="true" /><span>Open tills</span><strong>{report.summary.openShifts}</strong><small>cash custody still active</small></div><div data-alert={report.summary.closeRequests > 0}><Clock3 size={17} aria-hidden="true" /><span>Close requests</span><strong>{report.summary.closeRequests}</strong><small>waiting for independent review</small></div><div data-alert={report.summary.reviewCount > 0}><AlertTriangle size={17} aria-hidden="true" /><span>Variance reviews</span><strong>{report.summary.reviewCount}</strong><small>tender evidence needs attention</small></div><div><ReceiptText size={17} aria-hidden="true" /><span>Unreconciled receipts</span><strong>{report.summary.unresolvedReceipts}</strong><small>recorded, not yet reconciled</small></div></div>
    <div className="retail-cash-overview__tenders" aria-label="Tender totals">{Object.entries(report.summary.tenderTotals).filter(([, value]) => value > 0).map(([method, value]) => <div key={method}><span>{method.replaceAll('-', ' ')}</span><strong>{inr.format(value)}</strong></div>)}{!Object.values(report.summary.tenderTotals).some((value) => value > 0) ? <span>No tender evidence recorded.</span> : null}</div>
    <section className="retail-cash-overview__settlement" aria-labelledby="retail-cash-settlement-title"><header><div><span className="eyebrow">Electronic settlement</span><h3 id="retail-cash-settlement-title">Recorded versus bank matched</h3></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open bank matching <ArrowRight size={13} aria-hidden="true" /></button></header><div className="retail-cash-overview__settlement-list">{settlement.rows.filter(({ method }) => method !== 'cash').map((row) => <div key={row.method} data-status={row.status}><div><strong>{row.method === 'bank-transfer' ? 'Bank transfer' : row.method.toUpperCase()}</strong><small>{row.receiptCount} receipt{row.receiptCount === 1 ? '' : 's'} · {row.reconciledReceiptCount} reconciled</small></div><span><b>{inr.format(row.bankMatchedAmount)}</b> / {inr.format(row.recordedAmount)} matched</span><em>{row.status === 'not-applicable' ? 'Not in scope' : row.status === 'ready' ? 'Matched' : `${inr.format(row.gapAmount)} gap`}</em></div>)}</div><p>{settlement.actionRequired ? settlement.nextActions[0] : 'All electronic tender evidence in scope is reconciled to imported bank lines.'}</p></section>
    <nav className="retail-cash-overview__filters" aria-label="Cash filters">{(Object.keys(cashLabels) as CashFilter[]).map((value) => <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value}>{cashLabels[value]}</button>)}</nav>
    <div className="retail-cash-overview__body"><div className="retail-cash-overview__list" role="list" aria-label="Cashier shifts">{rows.map((row) => <CashRow key={row.shiftId} row={row} selected={selected?.shiftId === row.shiftId} />)}{!rows.length ? <div className="bharat-empty"><Banknote size={22} aria-hidden="true" /><strong>No tills in this view</strong><span>When a governed shift is opened, its cash evidence will appear here.</span></div> : null}</div>{selected ? <CashDetail row={selected} onOpenAdvanced={onOpenAdvanced} /> : null}</div>
    <footer className="retail-cash-overview__footer"><ShieldCheck size={14} aria-hidden="true" /> Closing requires tender-by-tender declarations and independent approval. This view never closes a till or changes a payment.</footer>
  </section>;
}

function CashRow({ row, selected }: { row: RetailCashOverviewRow; selected: boolean }): ReactNode {
  return <article className={`retail-cash-overview__row${selected ? ' is-selected' : ''}`} data-risk={row.risk} role="listitem"><div className="retail-cash-overview__row-title"><span className="retail-cash-overview__risk">{riskLabels[row.risk]}</span><strong>{row.shiftNumber}</strong><small>{row.counterLabel} · {row.status.replaceAll('-', ' ')}</small></div><div className="retail-cash-overview__value"><strong>{inr.format(row.salesValue)}</strong><span>{row.saleCount} sale{row.saleCount === 1 ? '' : 's'}</span></div><div className="retail-cash-overview__row-meta"><span>Cash {inr.format(row.cashTenderValue)}</span>{row.expectedCash !== undefined ? <span>Expected {inr.format(row.expectedCash)}</span> : null}{row.variance !== undefined ? <span>Variance {inr.format(row.variance)}</span> : null}</div><p>{row.nextAction}</p></article>;
}

function CashDetail({ row, onOpenAdvanced }: { row: RetailCashOverviewRow; onOpenAdvanced: () => void }): ReactNode {
  return <article className="retail-cash-overview__detail" aria-label={`Cash details for ${row.shiftNumber}`}><span className="eyebrow">Selected till</span><h3>{row.shiftNumber}</h3><p>{row.counterLabel} · {row.status.replaceAll('-', ' ')}</p><dl><div><dt>Sales recorded</dt><dd>{inr.format(row.salesValue)} · {row.saleCount} sale{row.saleCount === 1 ? '' : 's'}</dd></div><div><dt>Cash tender</dt><dd>{inr.format(row.cashTenderValue)}</dd></div><div><dt>Expected / declared</dt><dd>{row.expectedCash === undefined ? 'Not requested' : `${inr.format(row.expectedCash)} / ${row.declaredCash === undefined ? 'Not declared' : inr.format(row.declaredCash)}`}</dd></div><div><dt>Variance</dt><dd>{row.variance === undefined ? 'Not calculated' : inr.format(row.variance)}</dd></div></dl>{row.risk === 'review' ? <div className="retail-cash-overview__warning"><AlertTriangle size={15} aria-hidden="true" /><span>{row.nextAction}</span></div> : row.risk === 'open' ? <div className="retail-cash-overview__notice"><Clock3 size={15} aria-hidden="true" /><span>{row.nextAction}</span></div> : <p className="retail-cash-overview__clear"><CheckCircle2 size={15} aria-hidden="true" /> {row.nextAction}</p>}<button type="button" className="button button--primary" onClick={onOpenAdvanced}>Open governed cash action <ArrowRight size={14} aria-hidden="true" /></button></article>;
}

export function RetailCashOverviewFromRevenue({ revenue, onOpenAdvanced }: { revenue: RevenueOpsSnapshot; onOpenAdvanced: () => void }): ReactNode {
  return <RetailCashOverviewPanel shifts={revenue.retailCashierShifts} counters={revenue.retailCounters} sales={revenue.retailSales} receipts={revenue.paymentReceipts} bankLines={revenue.bankStatementLines} onOpenAdvanced={onOpenAdvanced} />;
}
