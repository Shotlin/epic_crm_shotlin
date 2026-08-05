import { AlertTriangle, ArrowRight, BarChart3, Boxes, CheckCircle2, CircleDollarSign, ClipboardList, Sparkles, TrendingUp } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { buildIndiaCommerceInsights, type ProductDemandInsightRow } from '../domain/commerce-insights';
import type { DashboardSnapshot } from '../shared/contracts';
import type { PartySnapshot } from '../shared/party-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { BarChart, DonutChart, TrendLineChart, type ChartDatum } from './ExecutiveCharts';

export interface RetailInsightsOverviewPanelProps {
  dashboard: DashboardSnapshot;
  revenue: RevenueOpsSnapshot;
  party: Pick<PartySnapshot, 'accounts'>;
  onOpenAdvanced: () => void;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });

/** Visual, read-only retail intelligence front door. */
export function RetailInsightsOverviewPanel({ dashboard, revenue, party, onOpenAdvanced }: RetailInsightsOverviewPanelProps): ReactNode {
  const report = useMemo(() => buildIndiaCommerceInsights({ dashboard, revenue, party }), [dashboard, party, revenue]);
  const billed = report.productDemand.billed;
  const topProducts = billed.rows.slice(0, 5);
  const totalBilled = billed.rows.reduce((sum, row) => sum + row.amount, 0);
  const stockExceptions = report.stockExceptions.rows;
  const fulfilment = report.fulfilment.rows;
  const collectionRows = report.collections.rows;
  const chartData = useMemo(() => {
    const daily = new Map<string, number>();
    const tenders = new Map<string, number>();
    for (const sale of revenue.retailSales.filter(({ status }) => status === 'completed')) {
      const date = sale.saleAt.slice(0, 10);
      daily.set(date, (daily.get(date) ?? 0) + sale.taxPreview.grandTotal);
      for (const tender of sale.tenders) tenders.set(tender.method, (tenders.get(tender.method) ?? 0) + tender.amount);
    }
    const trend: ChartDatum[] = [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-7).map(([date, value]) => ({ label: date.slice(5), value }));
    const tenderSplit: ChartDatum[] = [...tenders.entries()].sort(([, left], [, right]) => right - left).map(([label, value]) => ({ label: label.replace('-', ' '), value }));
    return { trend, tenderSplit };
  }, [revenue.retailSales]);
  const categoryData: ChartDatum[] = topProducts.map((row) => ({ label: row.name, value: row.amount }));
  return <section className="retail-insights-overview" data-testid="retail-insights-overview" aria-labelledby="retail-insights-overview-title">
    <header className="retail-insights-overview__header"><div><span className="eyebrow"><Sparkles size={14} aria-hidden="true" /> Insights / Retail intelligence</span><h2 id="retail-insights-overview-title">See what needs your attention</h2><p>A visual summary of governed sales, stock, fulfilment, and collections evidence. Open the detailed intelligence workbench for drill-downs.</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open detailed insights <ArrowRight size={14} aria-hidden="true" /></button></header>
    <div className="retail-insights-overview__metrics" aria-label="Retail insights overview"><div><CircleDollarSign size={17} aria-hidden="true" /><span>Billed demand</span><strong>{inr.format(totalBilled)}</strong><small>{billed.rows.length ? `${billed.rows.length} product groups` : 'No billed evidence recorded'}</small></div><div data-alert={stockExceptions.length > 0}><Boxes size={17} aria-hidden="true" /><span>Stock exceptions</span><strong>{stockExceptions.length}</strong><small>{stockExceptions.length ? 'review before replenishment or picking' : 'No stock exception recorded'}</small></div><div data-alert={fulfilment.length > 0}><ClipboardList size={17} aria-hidden="true" /><span>Fulfilment queue</span><strong>{fulfilment.length}</strong><small>{fulfilment.length ? 'orders or tasks need evidence' : 'No open fulfilment evidence'}</small></div><div data-alert={collectionRows.length > 0}><TrendingUp size={17} aria-hidden="true" /><span>Collections queue</span><strong>{collectionRows.length}</strong><small>{collectionRows.length ? 'receivables need follow-up' : 'No collection exception recorded'}</small></div></div>
    <div className="retail-insights-overview__grid"><article className="retail-insights-overview__chart"><header><div><span className="eyebrow">Sales signal</span><h3>Top billed products</h3></div><BarChart3 size={18} aria-hidden="true" /></header>{topProducts.length ? <div className="retail-insights-overview__bars" aria-label="Top billed products chart">{topProducts.map((row) => <InsightBar key={row.id} row={row} max={topProducts[0]?.amount ?? 0} />)}</div> : <div className="bharat-empty"><BarChart3 size={22} aria-hidden="true" /><strong>No sales chart yet</strong><span>Connect or record governed sales to see a real chart.</span></div>}</article><article className="retail-insights-overview__attention"><header><div><span className="eyebrow">Decision brief</span><h3>Start with the riskiest queue</h3></div><AlertTriangle size={18} aria-hidden="true" /></header>{stockExceptions.length || fulfilment.length || collectionRows.length ? <div className="retail-insights-overview__queue">{[...stockExceptions.slice(0, 2).map((row) => ({ key: `stock-${row.id}`, label: row.title, detail: row.detail, kind: 'Stock' })), ...fulfilment.slice(0, 2).map((row) => ({ key: `fulfilment-${row.id}`, label: row.title, detail: row.detail, kind: 'Fulfilment' })), ...collectionRows.slice(0, 2).map((row) => ({ key: `collections-${row.id}`, label: row.accountName, detail: `${row.invoiceNumber} · ${inr.format(row.outstandingAmount)} outstanding`, kind: 'Collections' }))].map((item) => <div key={item.key}><span>{item.kind}</span><strong>{item.label}</strong><small>{item.detail}</small></div>)}</div> : <div className="retail-insights-overview__empty"><CheckCircle2 size={20} aria-hidden="true" /><strong>Nothing is asking for attention</strong><span>This view stays quiet until governed evidence creates a real decision.</span></div>}</article></div>
    <section className="epic-visual-analytics" aria-labelledby="retail-visual-analytics-title"><header className="epic-visual-analytics__header"><div><span className="eyebrow">Decision visuals</span><h3 id="retail-visual-analytics-title">See the store in three simple charts</h3><p>Every point comes from completed local sales; empty charts stay honest until records exist.</p></div></header><div className="epic-visual-analytics__grid"><TrendLineChart title="Sales by recorded day" data={chartData.trend} formatValue={(value) => inr.format(value)} /><DonutChart title="Tender mix" data={chartData.tenderSplit} formatValue={(value) => inr.format(value)} /></div><BarChart title="Billed demand by product" data={categoryData} formatValue={(value) => inr.format(value)} /></section>
    <footer className="retail-insights-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> Charts and queues are derived from local read projections. No forecast, trend, or alert is shown without source records.</footer>
  </section>;
}

function InsightBar({ row, max }: { row: ProductDemandInsightRow; max: number }): ReactNode {
  const width = max > 0 ? Math.max(6, Math.round((row.amount / max) * 100)) : 0;
  return <div className="retail-insights-overview__bar"><div><strong>{row.name}</strong><span>{inr.format(row.amount)}</span></div><span className="retail-insights-overview__bar-track"><i style={{ width: `${width}%` }} /></span><small>{row.quantity.toLocaleString('en-IN')} unit{row.quantity === 1 ? '' : 's'} · {row.recordCount} sale{row.recordCount === 1 ? '' : 's'}</small></div>;
}
