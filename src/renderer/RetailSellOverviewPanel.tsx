import { ArrowRight, Banknote, CheckCircle2, CirclePlus, ReceiptIndianRupee, ShoppingCart, Store, WalletCards } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { computeRetailSellOverview } from '../domain/retail-sell-overview';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { RetailCashierShift, RetailCounter, RetailSale } from '../shared/retail-pos-contracts';

export interface RetailSellOverviewPanelProps {
  counters: readonly RetailCounter[];
  shifts: readonly RetailCashierShift[];
  sales: readonly RetailSale[];
  offlineQueue?: RevenueOpsSnapshot['retailOfflineSaleQueue'];
  onOpenAdvanced: () => void;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** Simple POS front door; scanning, tendering, and posting stay governed. */
export function RetailSellOverviewPanel({ counters, shifts, sales, offlineQueue = [], onOpenAdvanced }: RetailSellOverviewPanelProps): ReactNode {
  const report = useMemo(() => computeRetailSellOverview({ counters: [...counters], shifts: [...shifts], sales: [...sales], offlineQueue }), [counters, offlineQueue, sales, shifts]);
  return <section className="retail-sell-overview" data-testid="retail-sell-overview" aria-labelledby="retail-sell-overview-title">
    <header className="retail-sell-overview__header"><div><span className="eyebrow"><ShoppingCart size={14} aria-hidden="true" /> Sell / POS</span><h2 id="retail-sell-overview-title">Sell simply, record correctly</h2><p>Open the counter, scan products, collect an INR tender, and issue a governed receipt. Existing advanced POS controls remain one click away.</p></div><button type="button" className="button button--primary" onClick={onOpenAdvanced}><CirclePlus size={15} aria-hidden="true" /> Start a sale <ArrowRight size={14} aria-hidden="true" /></button></header>
    <div className="retail-sell-overview__metrics" aria-label="POS overview"><div><Store size={17} aria-hidden="true" /><span>Active counters</span><strong>{report.summary.activeCounters}</strong><small>configured sell points</small></div><div><Banknote size={17} aria-hidden="true" /><span>Open shifts</span><strong>{report.summary.openShifts}</strong><small>cash custody in progress</small></div><div><ReceiptIndianRupee size={17} aria-hidden="true" /><span>Completed sales</span><strong>{report.summary.completedSales}</strong><small>local receipt evidence</small></div><div><WalletCards size={17} aria-hidden="true" /><span>Average basket</span><strong>{inr.format(report.summary.averageBasket)}</strong><small>{inr.format(report.summary.billedValue)} billed total</small></div></div>
    {(report.summary.offlineQueued || report.summary.offlineConflicts) ? <div className="retail-sell-overview__offline" data-alert={report.summary.offlineConflicts > 0}><div><strong>Offline checkout needs attention</strong><span>{report.summary.offlineQueued} sale{report.summary.offlineQueued === 1 ? '' : 's'} waiting to sync · {report.summary.offlineConflicts} conflict{report.summary.offlineConflicts === 1 ? '' : 's'} · {report.summary.offlineRecoveryAttempts} recovery attempt{report.summary.offlineRecoveryAttempts === 1 ? '' : 's'}</span></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Review recovery <ArrowRight size={14} aria-hidden="true" /></button></div> : null}
    <div className="retail-sell-overview__body"><article className="retail-sell-overview__recent"><header><div><span className="eyebrow">Latest receipts</span><h3>What was sold recently</h3></div><ReceiptIndianRupee size={18} aria-hidden="true" /></header>{report.recentSales.length ? <div className="retail-sell-overview__sales">{report.recentSales.map((sale) => <div key={sale.id}><div><strong>{sale.number}</strong><small>{sale.counterLabel} · {new Date(sale.saleAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</small></div><div><strong>{inr.format(sale.value)}</strong><small>{sale.tenderMethods.join(' · ')}</small></div></div>)}</div> : <div className="bharat-empty"><ReceiptIndianRupee size={22} aria-hidden="true" /><strong>No completed sales yet</strong><span>Start a governed sale when the counter is ready.</span></div>}</article><aside className="retail-sell-overview__guide"><header><span className="eyebrow">Counter checklist</span><h3>Ready for the next customer?</h3></header><ol><li><span>01</span><div><strong>Open a shift</strong><small>Confirm the opening float and assigned counter.</small></div></li><li><span>02</span><div><strong>Scan or search</strong><small>Use the catalog and barcode evidence, not free-text prices.</small></div></li><li><span>03</span><div><strong>Collect and issue</strong><small>Every tender must match the GST total before receipt.</small></div></li></ol><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open full POS controls <ArrowRight size={14} aria-hidden="true" /></button></aside></div>
    <footer className="retail-sell-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> This front door does not create a sale. The governed POS workbench owns stock, GST, receipt, tender, and offline-sync writes.</footer>
  </section>;
}

export function RetailSellOverviewFromRevenue({ revenue, onOpenAdvanced }: { revenue: RevenueOpsSnapshot; onOpenAdvanced: () => void }): ReactNode {
  return <RetailSellOverviewPanel counters={revenue.retailCounters} shifts={revenue.retailCashierShifts} sales={revenue.retailSales} offlineQueue={revenue.retailOfflineSaleQueue} onOpenAdvanced={onOpenAdvanced} />;
}
