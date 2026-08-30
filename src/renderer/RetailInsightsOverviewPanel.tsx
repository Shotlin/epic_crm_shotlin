import { AlertTriangle, ArrowRight, BarChart3, Boxes, CheckCircle2, CircleDollarSign, HandCoins, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { buildIndiaCommerceInsights } from '../domain/commerce-insights';
import type { DashboardSnapshot } from '../shared/contracts';
import type { PartySnapshot } from '../shared/party-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { BarChart, DonutChart, TrendLineChart, type ChartDatum } from './ExecutiveCharts';

export interface RetailInsightsOverviewPanelProps {
  dashboard: DashboardSnapshot;
  revenue: RevenueOpsSnapshot;
  party: Pick<PartySnapshot, 'accounts'>;
  view?: 'overview' | 'stock-risk' | 'outlet-comparison';
  onOpenAdvanced: () => void;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });

function saleDate(sale: RevenueOpsSnapshot['retailSales'][number]): string | undefined { return sale.completedAt ?? sale.saleAt; }

/**
 * Executive retail intelligence that exposes source-backed decisions. It does
 * not manufacture trends, trust scores, forecasts, or outlet comparisons.
 */
export function RetailInsightsOverviewPanel({ dashboard, revenue, party, view = 'overview', onOpenAdvanced }: RetailInsightsOverviewPanelProps): ReactNode {
  const report = useMemo(() => buildIndiaCommerceInsights({ dashboard, revenue, party }), [dashboard, party, revenue]);
  const completedSales = useMemo(() => revenue.retailSales.filter((sale) => sale.status === 'completed'), [revenue.retailSales]);
  const netSales = completedSales.reduce((sum, sale) => sum + sale.taxPreview.grandTotal, 0);
  const valuedSales = completedSales.filter((sale) => Number.isFinite(sale.costTotal) && sale.costTotal > 0);
  const valuedRevenue = valuedSales.reduce((sum, sale) => sum + sale.taxPreview.grandTotal, 0);
  const grossMargin = valuedRevenue > 0
    ? ((valuedRevenue - valuedSales.reduce((sum, sale) => sum + sale.costTotal, 0)) / valuedRevenue) * 100
    : undefined;
  const inventoryValue = revenue.binBalances.reduce((sum, balance) => sum + balance.inventoryValue, 0);
  const openReceivables = revenue.receivables.reduce((sum, receivable) => sum + (receivable.outstandingAmount ?? 0), 0);
  const stockExceptions = report.stockExceptions.rows;
  const fulfilment = report.fulfilment.rows;
  const collectionRows = report.collections.rows;
  const attentionCount = stockExceptions.length + fulfilment.length + collectionRows.length;
  const trend = useMemo<ChartDatum[]>(() => {
    const daily = new Map<string, number>();
    for (const sale of completedSales) {
      const date = saleDate(sale)?.slice(0, 10);
      if (!date) continue;
      daily.set(date, (daily.get(date) ?? 0) + sale.taxPreview.grandTotal);
    }
    return [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-7).map(([date, value]) => ({ label: date.slice(5), value }));
  }, [completedSales]);
  const marginByProduct = useMemo<ChartDatum[]>(() => {
    const totals = new Map<string, { revenue: number; cost: number }>();
    for (const sale of valuedSales) {
      for (const line of sale.lines ?? []) {
        if (!Number.isFinite(line.lineCostTotal) || line.lineCostTotal <= 0) continue;
        const label = line.description?.trim() || 'Unspecified item';
        const existing = totals.get(label) ?? { revenue: 0, cost: 0 };
        totals.set(label, { revenue: existing.revenue + line.lineTotal, cost: existing.cost + line.lineCostTotal });
      }
    }
    return [...totals.entries()]
      .map(([label, value]) => ({ label, value: value.revenue > 0 ? Math.max(0, ((value.revenue - value.cost) / value.revenue) * 100) : 0, color: '#7257D5' }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 5);
  }, [valuedSales]);
  const evidenceData: ChartDatum[] = [
    { label: 'Ready queues', value: Math.max(0, 4 - [stockExceptions.length > 0, fulfilment.length > 0, collectionRows.length > 0, report.productDemand.billed.state !== 'ready'].filter(Boolean).length), color: '#168A6B' },
    { label: 'Review queues', value: [stockExceptions.length > 0, fulfilment.length > 0, collectionRows.length > 0, report.productDemand.billed.state !== 'ready'].filter(Boolean).length, color: '#D98516' },
  ];
  const decisions = [
    ...stockExceptions.slice(0, 2).map((row) => ({ key: `stock-${row.id}`, label: row.title, detail: row.detail, kind: 'Stock', tone: row.severity === 'critical' ? 'critical' : 'attention' })),
    ...fulfilment.slice(0, 2).map((row) => ({ key: `fulfilment-${row.id}`, label: row.title, detail: row.detail, kind: 'Fulfilment', tone: 'attention' })),
    ...collectionRows.slice(0, 2).map((row) => ({ key: `collection-${row.id}`, label: row.accountName, detail: `${row.invoiceNumber} · ${inr.format(row.outstandingAmount)} outstanding`, kind: 'Collections', tone: 'attention' })),
  ];
  const evidenceRows = [
    { source: 'Retail sales', records: completedSales.length, status: completedSales.length ? 'Recorded' : 'No record' },
    { source: 'Inventory balances', records: revenue.binBalances.length, status: revenue.binBalances.length ? 'Recorded' : 'No record' },
    { source: 'Fulfilment', records: fulfilment.length, status: fulfilment.length ? 'Review' : report.fulfilment.state === 'ready' ? 'Clear' : 'No record' },
    { source: 'Collections', records: collectionRows.length, status: collectionRows.length ? 'Review' : report.collections.state === 'ready' ? 'Clear' : 'No record' },
  ];
  const metrics = [
    { label: 'Net sales', value: inr.format(netSales), detail: `${completedSales.length} completed sale${completedSales.length === 1 ? '' : 's'}`, Icon: CircleDollarSign, alert: false },
    { label: 'Gross margin', value: grossMargin === undefined ? '—' : `${grossMargin.toFixed(1)}%`, detail: grossMargin === undefined ? 'Valued sale lines needed' : `${valuedSales.length} valued sale${valuedSales.length === 1 ? '' : 's'}`, Icon: TrendingUp, alert: false },
    { label: 'Inventory', value: inr.format(inventoryValue), detail: `${revenue.binBalances.length} balance${revenue.binBalances.length === 1 ? '' : 's'}`, Icon: Boxes, alert: false },
    { label: 'Open receivables', value: inr.format(openReceivables), detail: `${collectionRows.length} collection item${collectionRows.length === 1 ? '' : 's'}`, Icon: HandCoins, alert: collectionRows.length > 0 },
    { label: 'Needs review', value: attentionCount.toLocaleString('en-IN'), detail: attentionCount ? 'Source-backed exceptions' : 'No current exception', Icon: ShieldCheck, alert: attentionCount > 0 },
  ] as const;

  if (view === 'stock-risk') return <section className="retail-insights-overview" data-testid="retail-insights-stock-risk" aria-labelledby="retail-insights-stock-risk-title"><header className="retail-insights-overview__header"><div><span className="eyebrow"><Boxes size={14} aria-hidden="true" /> Inventory intelligence</span><h1 id="retail-insights-stock-risk-title" className="retail-front-door__title">Stock & expiry</h1><p>Review source-backed inventory exceptions before opening warehouse controls.</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open stock controls <ArrowRight size={14} aria-hidden="true" /></button></header><article className="retail-insights-overview__attention"><header><div><span className="eyebrow">Stock exceptions</span><h3>What needs review now</h3></div><AlertTriangle size={18} aria-hidden="true" /></header>{stockExceptions.length ? <div className="retail-insights-overview__queue">{stockExceptions.map((row) => <div key={row.id} data-severity={row.severity === 'critical' ? 'critical' : 'attention'}><span>Stock</span><strong>{row.title}</strong><small>{row.detail}</small></div>)}</div> : <div className="retail-insights-overview__empty"><CheckCircle2 size={20} aria-hidden="true" /><strong>No stock exception is recorded</strong><span>Risk appears here only after governed inventory evidence identifies it.</span></div>}</article><footer className="retail-insights-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> This view cannot change stock, approve a transfer or dispose a batch.</footer></section>;

  if (view === 'outlet-comparison') return <section className="retail-insights-overview" data-testid="retail-insights-outlets" aria-labelledby="retail-insights-outlets-title"><header className="retail-insights-overview__header"><div><span className="eyebrow"><BarChart3 size={14} aria-hidden="true" /> Multi-store intelligence</span><h1 id="retail-insights-outlets-title" className="retail-front-door__title">Outlets & team</h1><p>Compare stores only after every outlet has reconciled, isolated operating evidence.</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open detailed insights <ArrowRight size={14} aria-hidden="true" /></button></header><article className="retail-insights-overview__attention"><header><div><span className="eyebrow">Comparison status</span><h3>Outlet comparison is not connected</h3></div><ShieldCheck size={18} aria-hidden="true" /></header><div className="retail-insights-overview__empty"><Boxes size={20} aria-hidden="true" /><strong>This workspace has the current store scope only</strong><span>It does not receive replicated multi-store records, staff attribution, or reconciled outlet sales. Epic BOS will not rank stores or people from partial data.</span></div></article><article className="retail-insights-overview__chart"><header><div><span className="eyebrow">Required evidence</span><h3>Before comparison can be enabled</h3></div><CheckCircle2 size={18} aria-hidden="true" /></header><div className="retail-insights-overview__queue"><div data-severity="attention"><span>1</span><strong>Connect each outlet through Retail Hub</strong><small>Each store must retain its own company and branch scope.</small></div><div data-severity="attention"><span>2</span><strong>Reconcile sales, stock, cash and delivery events</strong><small>Unresolved conflicts stay visible instead of being merged into a score.</small></div><div data-severity="attention"><span>3</span><strong>Confirm staff attribution and access scope</strong><small>Only approved, role-scoped evidence can power team performance views.</small></div></div></article><footer className="retail-insights-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> No outlet ranking or staff score is calculated until those controls are evidenced.</footer></section>;

  return <section className="retail-insights-overview" data-testid="retail-insights-overview" aria-labelledby="retail-insights-overview-title">
    <header className="retail-insights-overview__header"><div><span className="eyebrow"><Sparkles size={14} aria-hidden="true" /> Retail performance</span><h1 id="retail-insights-overview-title" className="retail-front-door__title">See the business. Then see the reason behind the numbers.</h1><p>Sales, margin, stock, customer and operating evidence with a clear source before every drill-down.</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open detailed insights <ArrowRight size={14} aria-hidden="true" /></button></header>

    <div className="retail-insights-overview__metrics" aria-label="Retail performance metrics" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>{metrics.map(({ label, value, detail, Icon, alert }) => <div key={label} data-alert={alert}><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</div>

    <section className="epic-visual-analytics" aria-labelledby="retail-visual-analytics-title"><header className="epic-visual-analytics__header"><div><span className="eyebrow">Decision visuals</span><h3 id="retail-visual-analytics-title">The evidence behind today’s work</h3><p>Charts remain empty until governed records exist; nothing is projected or fabricated.</p></div></header><div className="epic-visual-analytics__grid"><TrendLineChart title="Net sales by recorded day" data={trend} formatValue={(value) => inr.format(value)} /><BarChart title="Gross margin by valued item" data={marginByProduct} formatValue={(value) => `${value.toFixed(1)}%`} /><DonutChart title="Operating evidence state" data={evidenceData} formatValue={(value) => `${value} queue${value === 1 ? '' : 's'}`} /></div></section>

    <div className="retail-insights-overview__grid">
      <article className="retail-insights-overview__attention"><header><div><span className="eyebrow">What needs attention—and why</span><h3>Start with a source-backed decision</h3></div><AlertTriangle size={18} aria-hidden="true" /></header>{decisions.length ? <div className="retail-insights-overview__queue">{decisions.map((item) => <div key={item.key} data-severity={item.tone}><span>{item.kind}</span><strong>{item.label}</strong><small>{item.detail}</small></div>)}</div> : <div className="retail-insights-overview__empty"><CheckCircle2 size={20} aria-hidden="true" /><strong>Nothing is asking for attention</strong><span>This view stays quiet until governed evidence creates a decision.</span></div>}</article>
      <article className="retail-insights-overview__chart"><header><div><span className="eyebrow">Evidence coverage</span><h3>What this workspace can compare</h3></div><BarChart3 size={18} aria-hidden="true" /></header><div role="table" aria-label="Evidence coverage"><div role="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 12, paddingBottom: 8, fontSize: 10, color: 'var(--muted)' }}><span role="columnheader">Source</span><span role="columnheader">Records</span><span role="columnheader">State</span></div>{evidenceRows.map((row) => <div key={row.source} role="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)', fontSize: 11 }}><strong role="cell">{row.source}</strong><span role="cell">{row.records.toLocaleString('en-IN')}</span><em role="cell" className="customer360__consent">{row.status}</em></div>)}</div><small>Multi-store comparison appears only after isolated store data is connected and reconciled.</small></article>
    </div>

    <footer className="retail-insights-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> Charts and decisions derive from local read projections. No forecast, outlet ranking, or trust score is shown without source records.</footer>
  </section>;
}
