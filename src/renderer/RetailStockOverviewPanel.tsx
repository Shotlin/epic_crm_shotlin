import { AlertTriangle, ArrowRight, Boxes, CheckCircle2, ClipboardList, PackageSearch, RefreshCw, Warehouse } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { computeRetailStockOverview, type RetailStockOverviewRow, type RetailStockRisk } from '../domain/retail-stock-overview';
import { computeRetailOmnichannelInventoryTruth } from '../domain/retail-omnichannel-inventory-truth';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { BinBalance, InventoryBatch, ItemVariant, ReorderPolicy, ReorderProposal, WarehouseTask } from '../shared/inventory-contracts';

type StockFilter = 'all' | 'reorder' | 'attention' | 'expired';

const riskLabels: Record<StockFilter, string> = { all: 'All stock', reorder: 'Replenishment', attention: 'Warehouse attention', expired: 'Expired batches' };
const riskTone: Record<RetailStockRisk, string> = { clear: 'Clear', reorder: 'Replenish', attention: 'Attention', expired: 'Expired' };

export interface RetailStockOverviewPanelProps {
  variants: readonly ItemVariant[];
  balances: readonly BinBalance[];
  policies: readonly ReorderPolicy[];
  proposals: readonly ReorderProposal[];
  batches: readonly InventoryBatch[];
  tasks: readonly WarehouseTask[];
  onOpenAdvanced: () => void;
  commerceOrders?: RevenueOpsSnapshot['retailCommerceOrders'];
  commerceConnectors?: RevenueOpsSnapshot['retailCommerceConnectors'];
}

/** Plain-language stock front door. It never edits quantities or approves proposals. */
export function RetailStockOverviewPanel({ variants, balances, policies, proposals, batches, tasks, commerceOrders = [], commerceConnectors = [], onOpenAdvanced }: RetailStockOverviewPanelProps): ReactNode {
  const [filter, setFilter] = useState<StockFilter>('all');
  const report = useMemo(() => computeRetailStockOverview({ variants: [...variants], balances: [...balances], policies: [...policies], proposals: [...proposals], batches: [...batches], tasks: [...tasks] }), [balances, batches, policies, proposals, tasks, variants]);
  const channelTruth = useMemo(() => computeRetailOmnichannelInventoryTruth({ orders: commerceOrders, connectors: commerceConnectors, variants, balances }), [balances, commerceConnectors, commerceOrders, variants]);
  const rows = filter === 'all' ? report.rows : report.rows.filter((row) => row.risk === filter);
  const selected = rows[0];
  return <section className="retail-stock-overview" data-testid="retail-stock-overview" aria-labelledby="retail-stock-overview-title">
    <header className="retail-stock-overview__header"><div><span className="eyebrow"><Boxes size={14} aria-hidden="true" /> Stock / Control</span><h2 id="retail-stock-overview-title">Know what is available</h2><p>See stock risk, replenishment, and warehouse work in one calm view. Open advanced controls only when a governed action is needed.</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open stock controls <ArrowRight size={14} aria-hidden="true" /></button></header>
    <div className="retail-stock-overview__metrics" aria-label="Stock overview"><div><Boxes size={17} aria-hidden="true" /><span>Tracked variants</span><strong>{report.summary.variants}</strong><small>with local stock evidence</small></div><div><PackageSearch size={17} aria-hidden="true" /><span>Available units</span><strong>{report.summary.availableUnits.toLocaleString('en-IN')}</strong><small>after recorded reservations</small></div><div data-alert={report.summary.reorderCount > 0}><RefreshCw size={17} aria-hidden="true" /><span>Replenishment</span><strong>{report.summary.reorderCount}</strong><small>below an active reorder policy</small></div><div data-alert={report.summary.expiredBatchCount > 0}><AlertTriangle size={17} aria-hidden="true" /><span>Expired batches</span><strong>{report.summary.expiredBatchCount}</strong><small>requires quarantine evidence</small></div></div>
    <section className="retail-stock-overview__channel-truth" aria-label="Omnichannel inventory truth"><header><div><span className="eyebrow">Omnichannel inventory</span><h3>Can we promise every channel order?</h3></div><strong data-alert={channelTruth.summary.atRiskVariants > 0}>{channelTruth.summary.atRiskVariants ? `${channelTruth.summary.atRiskVariants} at risk` : 'No open risk'}</strong></header>{channelTruth.summary.openOrders ? <><div className="retail-stock-overview__channel-metrics"><span>{channelTruth.summary.openOrders} open order{channelTruth.summary.openOrders === 1 ? '' : 's'}</span><span>{channelTruth.summary.unreservedDemandUnits.toLocaleString('en-IN')} unreserved units</span><span>{channelTruth.summary.shortageUnits.toLocaleString('en-IN')} short / unmapped</span></div><div className="retail-stock-overview__channel-list">{channelTruth.rows.slice(0, 6).map((row) => <div key={row.itemVariantId} data-risk={row.risk}><div><strong>{row.label}</strong><small>{row.sku} · {row.channels.join(' · ')}</small></div><span>{row.unreservedDemand.toLocaleString('en-IN')} demand · {row.availableUnits.toLocaleString('en-IN')} available</span><em>{row.risk === 'covered' ? 'covered' : row.risk === 'short' ? `short ${row.shortageUnits}` : 'map SKU'}</em></div>)}</div></> : <p className="retail-stock-overview__channel-empty">No open website, marketplace, ONDC, or WhatsApp order demand is in the current evidence scope.</p>}</section>
    <nav className="retail-stock-overview__filters" aria-label="Stock filters">{(Object.keys(riskLabels) as StockFilter[]).map((value) => <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value}>{riskLabels[value]}</button>)}</nav>
    <div className="retail-stock-overview__body"><div className="retail-stock-overview__list" role="list" aria-label="Stock items">{rows.map((row) => <StockRow key={row.itemVariantId} row={row} selected={selected?.itemVariantId === row.itemVariantId} />)}{!rows.length ? <div className="bharat-empty"><Warehouse size={22} aria-hidden="true" /><strong>No stock records in this view</strong><span>Import or record governed inventory evidence before making a replenishment decision.</span></div> : null}</div>{selected ? <StockDetail row={selected} onOpenAdvanced={onOpenAdvanced} /> : null}</div>
    <footer className="retail-stock-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> Quantities are a local evidence projection. This screen does not silently adjust stock or approve a purchase.</footer>
  </section>;
}

function StockRow({ row, selected }: { row: RetailStockOverviewRow; selected: boolean }): ReactNode {
  return <article className={`retail-stock-overview__row${selected ? ' is-selected' : ''}`} data-risk={row.risk} role="listitem"><div className="retail-stock-overview__row-title"><span className="retail-stock-overview__risk">{riskTone[row.risk]}</span><strong>{row.label}</strong><small>{row.sku || 'Variant identity recorded locally'}</small></div><div className="retail-stock-overview__quantity"><strong>{row.availableQuantity.toLocaleString('en-IN')}</strong><span>available</span></div><div className="retail-stock-overview__row-meta"><span>{row.reservedQuantity.toLocaleString('en-IN')} reserved</span><span>{row.binCount} bin{row.binCount === 1 ? '' : 's'}</span><span>{row.openTaskCount} open task{row.openTaskCount === 1 ? '' : 's'}</span></div><p>{row.nextAction}</p></article>;
}

function StockDetail({ row, onOpenAdvanced }: { row: RetailStockOverviewRow; onOpenAdvanced: () => void }): ReactNode {
  return <article className="retail-stock-overview__detail" aria-label={`Stock details for ${row.label}`}><span className="eyebrow">Selected item</span><h3>{row.label}</h3><p>{row.sku || 'Variant identity recorded locally'}</p><dl><div><dt>Available</dt><dd>{row.availableQuantity.toLocaleString('en-IN')} units</dd></div><div><dt>Reserved</dt><dd>{row.reservedQuantity.toLocaleString('en-IN')} units</dd></div><div><dt>Policy reorder point</dt><dd>{row.reorderQuantity ? row.reorderQuantity.toLocaleString('en-IN') : 'Not configured'}</dd></div><div><dt>Evidence</dt><dd>{row.binCount} bin{row.binCount === 1 ? '' : 's'} · {row.openTaskCount} open task{row.openTaskCount === 1 ? '' : 's'}</dd></div></dl>{row.expiredBatchCount ? <div className="retail-stock-overview__warning"><AlertTriangle size={15} aria-hidden="true" /><span>{row.expiredBatchCount} expired batch{row.expiredBatchCount === 1 ? '' : 'es'} needs quarantine/disposition evidence.</span></div> : row.proposedReorder ? <div className="retail-stock-overview__notice"><ClipboardList size={15} aria-hidden="true" /><span>A replenishment proposal is waiting for governed review.</span></div> : <p className="retail-stock-overview__clear"><CheckCircle2 size={15} aria-hidden="true" /> No exception is recorded for this item.</p>}<button type="button" className="button button--primary" onClick={onOpenAdvanced}>Open governed stock action <ArrowRight size={14} aria-hidden="true" /></button></article>;
}

export function RetailStockOverviewFromRevenue({ revenue, onOpenAdvanced }: { revenue: RevenueOpsSnapshot; onOpenAdvanced: () => void }): ReactNode {
  return <RetailStockOverviewPanel variants={revenue.itemVariants} balances={revenue.binBalances} policies={revenue.reorderPolicies} proposals={revenue.reorderProposals} batches={revenue.inventoryBatches} tasks={revenue.warehouseTasks} commerceOrders={revenue.retailCommerceOrders} commerceConnectors={revenue.retailCommerceConnectors} onOpenAdvanced={onOpenAdvanced} />;
}
