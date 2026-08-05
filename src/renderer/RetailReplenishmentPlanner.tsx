import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, IndianRupee, Sparkles, Wallet } from 'lucide-react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { buildRetailReplenishmentPlan, deriveRetailReplenishmentItems } from '../domain/retail-replenishment-plan';
import type { IndianFestivalSeason } from '../domain/retail-forecasting';
import './RetailReplenishmentPlanner.css';

type Props = { revenue: RevenueOpsSnapshot };

const formatInr = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export function RetailReplenishmentPlanner({ revenue }: Props): ReactNode {
  const [festival, setFestival] = useState<IndianFestivalSeason>('none');
  const [horizonDays, setHorizonDays] = useState(30);
  const [budgetInr, setBudgetInr] = useState(100000);
  const asOf = useMemo(() => new Date().toISOString(), []);
  const inboundByVariant = useMemo(() => revenue.purchaseOrders.reduce<Record<string, number>>((inbound, purchaseOrder) => {
    if (!['submitted', 'approved', 'partially-received'].includes(purchaseOrder.status)) return inbound;
    for (const line of purchaseOrder.lines) inbound[line.itemVariantId] = (inbound[line.itemVariantId] ?? 0) + Math.max(0, line.quantity - line.receivedQuantity);
    return inbound;
  }, {}), [revenue.purchaseOrders]);
  const items = useMemo(() => deriveRetailReplenishmentItems({
    asOf,
    defaultLeadTimeDays: 7,
    expirySafetyDays: 14,
    inboundByVariant,
    variants: revenue.itemVariants,
    sales: revenue.retailSales,
    balances: revenue.binBalances.map((balance) => {
      const batch = balance.batchId ? revenue.inventoryBatches.find((candidate) => candidate.id === balance.batchId) : undefined;
      return { ...balance, expiresAt: batch?.status === 'expired' ? asOf : batch?.expiresAt };
    }),
  }), [asOf, inboundByVariant, revenue.binBalances, revenue.inventoryBatches, revenue.itemVariants, revenue.retailSales]);
  const plan = useMemo(() => buildRetailReplenishmentPlan({
    items,
    festival,
    forecastPeriodDays: horizonDays,
    cashBudgetInr: budgetInr,
  }), [budgetInr, festival, horizonDays, items]);
  const criticalCount = plan.rows.filter((row) => row.forecast.urgency === 'critical-reorder').length;
  const deferredQuantity = plan.rows.reduce((total, row) => total + row.deferredQuantity, 0);

  return <section className="retail-replenishment-planner" aria-label="Smart replenishment planner">
    <header className="retail-replenishment-planner__header">
      <div><span><Sparkles size={14} aria-hidden="true" /> 10 / Demand intelligence</span><h4>Plan stock before the shelf goes empty</h4><p>Uses completed sales, expiry-safe stock, open purchase orders, supplier lead time and India-season demand. Recommendations are budget-aware and never create a purchase order automatically.</p></div>
      <div className="retail-replenishment-planner__controls">
        <label>Season<select value={festival} onChange={(event) => setFestival(event.target.value as IndianFestivalSeason)}><option value="none">Normal trading</option><option value="diwali-dhanteras">Diwali / Dhanteras</option><option value="navratri-durga">Navratri / Durga Puja</option><option value="eid-ul-fitr">Eid</option><option value="new-year-xmas">New year / Christmas</option></select></label>
        <label>Look ahead<input aria-label="Forecast horizon days" type="number" min="1" max="365" value={horizonDays} onChange={(event) => setHorizonDays(Math.min(365, Math.max(1, Number(event.target.value) || 1)))} /></label>
        <label>Buy budget (₹)<input aria-label="Replenishment budget in rupees" type="number" min="0" step="1000" value={budgetInr} onChange={(event) => setBudgetInr(Math.max(0, Number(event.target.value) || 0))} /></label>
      </div>
    </header>
    <div className="retail-replenishment-planner__metrics">
      <article><span><Wallet size={15} aria-hidden="true" /> Planned purchase</span><strong>{formatInr(plan.plannedCostInr)}</strong><small>{formatInr(plan.remainingBudgetInr)} remains from the stated budget</small></article>
      <article data-alert={criticalCount > 0 ? 'true' : undefined}><span><AlertTriangle size={15} aria-hidden="true" /> Critical stockouts</span><strong>{criticalCount}</strong><small>Prioritised before standard reorders</small></article>
      <article><span><IndianRupee size={15} aria-hidden="true" /> Deferred quantity</span><strong>{deferredQuantity.toLocaleString('en-IN')}</strong><small>Waiting for cost confirmation or budget approval</small></article>
    </div>
    {plan.rows.length ? <div className="retail-replenishment-planner__table-wrap"><table><thead><tr><th>SKU / recommendation</th><th>Demand signal</th><th>Coverage</th><th>Suggested</th><th>Budgeted</th><th>Next controlled action</th></tr></thead><tbody>{plan.rows.map((row) => <tr key={row.itemVariantId} data-status={row.status}><td><strong>{row.name}</strong><small>{row.sku} · {row.forecast.activeFestival === 'none' ? 'Normal season' : row.forecast.activeFestival.replaceAll('-', ' ')}</small></td><td><span className="retail-replenishment-planner__pill" data-urgency={row.forecast.urgency}>{row.forecast.urgency.replaceAll('-', ' ')}</span><small>{row.forecast.dailySalesVelocity}/day · stockout in {row.forecast.stockoutRiskDays === 999 ? '—' : `${row.forecast.stockoutRiskDays} days`}</small><small data-trend={row.forecast.trendDirection}>{row.forecast.trendDirection} demand ({row.forecast.trendPercent > 0 ? '+' : ''}{row.forecast.trendPercent}%) · {row.forecast.confidence} confidence</small></td><td><strong>{row.forecast.safeAvailableQty.toLocaleString('en-IN')} safe</strong><small>{row.forecast.inboundQty.toLocaleString('en-IN')} inbound · {row.forecast.expiryRiskQty.toLocaleString('en-IN')} expiry-risk</small></td><td><strong>{row.candidateQuantity.toLocaleString('en-IN')} units</strong><small>{formatInr(row.candidateCostInr)} estimated</small></td><td><strong>{row.plannedQuantity.toLocaleString('en-IN')} units</strong><small>{formatInr(row.plannedCostInr)} · {row.status.replaceAll('-', ' ')}</small></td><td><span>{row.nextAction}</span></td></tr>)}</tbody></table></div> : <p className="retail-replenishment-planner__empty">No active catalogue SKU is available for demand planning in this company scope.</p>}
    <footer>Planning boundary: completed counter sales, expiry-safe bin balances and open purchase-order quantities are evidence, not a supplier commitment, bank payment or external marketplace promise.</footer>
  </section>;
}
