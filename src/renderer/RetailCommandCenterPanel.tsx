import { AlertTriangle, IndianRupee, PackageSearch, ShoppingBag, Store, Users } from 'lucide-react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { computeRetailCommandCenter } from '../domain/retail-command-center';

type Props = { revenue: RevenueOpsSnapshot; onOpenCommerce?: () => void };

const inr = (amount: number) => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** A truthful store-operations view: every number comes from the current governed revenue snapshot. */
export function RetailCommandCenterPanel({ revenue, onOpenCommerce }: Props) {
  const command = computeRetailCommandCenter(revenue);

  return <section className="panel" aria-labelledby="retail-command-center-title">
    <div className="panel__header">
      <div>
        <span className="eyebrow">Retail command centre · {command.period}</span>
        <h2 id="retail-command-center-title">Run every store from one clear view</h2>
        <p>Sales, profit, cash variance, stock risk and online orders are separated so a manager can act without guessing.</p>
      </div>
      <Store size={21} aria-hidden="true" />
    </div>
    <div className="metric-grid" aria-label="Retail command metrics">
      <article className="metric-card"><span><IndianRupee size={14} /> Gross sales</span><strong>{inr(command.aggregateGrossSales)}</strong><small>{command.totalStoresCount} store{command.totalStoresCount === 1 ? '' : 's'}</small></article>
      <article className="metric-card"><span><IndianRupee size={14} /> Known gross profit</span><strong>{inr(command.aggregateNetProfit)}</strong><small>{command.profitCostCoveragePct.toFixed(0)}% cost coverage · {command.overallMarginPct.toFixed(1)}% margin</small></article>
      <article className="metric-card"><span><ShoppingBag size={14} /> Online queue</span><strong>{command.onlinePendingOrdersCount}</strong><small>{inr(command.onlinePendingOrderValue)} awaiting action</small></article>
      <article className="metric-card"><span><PackageSearch size={14} /> Stock attention</span><strong>{command.totalStockoutCount + command.totalExpiryRiskItemsCount}</strong><small>{command.totalStockoutCount} stockout · {command.totalExpiryRiskItemsCount} expiry risk</small></article>
    </div>
    <article className="retail-command-priority panel panel--nested" aria-label="Priority action queue">
      <div className="panel__header"><div><span className="eyebrow">Priority action queue</span><h3>What needs attention first</h3><p>Signals are ranked from governed store evidence. INR exposure is an indicator, not a booked loss.</p></div><AlertTriangle size={17} aria-hidden="true" /></div>
      {command.attentionQueue.length ? <ol className="retail-command-priority__list">{command.attentionQueue.map((item) => <li key={item.id} data-severity={item.severity}><span className="retail-command-priority__rank">{item.priorityScore.toFixed(0)}</span><div><strong>{item.summary}</strong><small>{item.action}</small></div><b>{item.amount > 0 ? inr(item.amount) : `${item.count} item${item.count === 1 ? '' : 's'}`}</b></li>)}</ol> : <p className="people-empty">No store exceptions in the current scope.</p>}
    </article>
    <article className="panel panel--nested" aria-label="Unified omnichannel queue"><div className="panel__header"><div><span className="eyebrow">Unified order desk</span><h3>Every channel, one queue</h3><p>Imported demand is grouped by source before reservation and fulfilment.</p></div><ShoppingBag size={17} aria-hidden="true" /></div><div className="metric-grid"><article className="metric-card"><span>Marketplace</span><strong>{command.channelPendingOrders.marketplace.count}</strong><small>{inr(command.channelPendingOrders.marketplace.value)}</small></article><article className="metric-card"><span>ONDC</span><strong>{command.channelPendingOrders.ondc.count}</strong><small>{inr(command.channelPendingOrders.ondc.value)}</small></article><article className="metric-card"><span>Website</span><strong>{command.channelPendingOrders.website.count}</strong><small>{inr(command.channelPendingOrders.website.value)}</small></article><article className="metric-card"><span>WhatsApp</span><strong>{command.channelPendingOrders.whatsapp.count}</strong><small>{inr(command.channelPendingOrders.whatsapp.value)}</small></article></div></article>
    <div className="insight-grid">
      <article className="panel panel--nested">
        <div className="panel__header"><div><span className="eyebrow">Store performance</span><h3>Revenue and accountability</h3></div><Users size={17} aria-hidden="true" /></div>
        {command.storePerformance.length ? <div className="table-wrap"><table><thead><tr><th>Store</th><th>Sales</th><th>Profit</th><th>Margin</th><th>Variance</th></tr></thead><tbody>{command.storePerformance.map((store) => <tr key={store.storeId}><td><strong>{store.storeName}</strong><small>{store.totalOrdersCount} completed sale{store.totalOrdersCount === 1 ? '' : 's'}</small></td><td>{inr(store.grossSalesAmount)}</td><td>{inr(store.grossProfitAmount)}</td><td>{store.grossMarginPct.toFixed(1)}%</td><td>{inr(store.cashVarianceAmount)}</td></tr>)}</tbody></table></div> : <p className="people-empty">Create a counter and complete a sale to see store performance.</p>}
      </article>
      <article className="panel panel--nested">
        <div className="panel__header"><div><span className="eyebrow">Next actions</span><h3>Attention items</h3></div><AlertTriangle size={17} aria-hidden="true" /></div>
        {command.attentionItems.length ? <ul className="attention-list">{command.attentionItems.map((item) => <li key={item}><AlertTriangle size={14} aria-hidden="true" /><span>{item}</span></li>)}</ul> : <p className="people-empty">No store exceptions in the current scope.</p>}
        {command.onlinePendingOrdersCount > 0 && onOpenCommerce ? <button type="button" className="button button--primary" onClick={onOpenCommerce}>Open online fulfilment queue</button> : null}
      </article>
    </div>
  </section>;
}
