import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  IndianRupee,
  PackageCheck,
  PackageSearch,
  Truck,
  Warehouse,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { computeRetailOmnichannelInventoryTruth } from '../domain/retail-omnichannel-inventory-truth';
import { computeRetailStockOverview, type RetailStockOverviewRow, type RetailStockRisk } from '../domain/retail-stock-overview';
import type { BinBalance, InventoryBatch, ItemVariant, ReorderPolicy, ReorderProposal, WarehouseTask } from '../shared/inventory-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { BarChart, type ChartDatum } from './ExecutiveCharts';

export type StockWorkspaceTab = 'health' | 'replenishment' | 'purchase' | 'receiving' | 'counts' | 'transfers' | 'expiry';

export type RetailStockDestination = 'warehouse' | 'procurement' | 'expiry';

const stockTabs: Array<{ id: StockWorkspaceTab; label: string }> = [
  { id: 'health', label: 'Stock health' },
  { id: 'replenishment', label: 'Replenishment' },
  { id: 'purchase', label: 'Purchase plan' },
  { id: 'receiving', label: 'Receiving' },
  { id: 'counts', label: 'Counts' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'expiry', label: 'Expiry' },
];

const riskTone: Record<RetailStockRisk, string> = {
  clear: 'Healthy',
  reorder: 'Reorder',
  attention: 'Attention',
  expired: 'Expired',
};

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export interface RetailStockOverviewPanelProps {
  variants: readonly ItemVariant[];
  balances: readonly BinBalance[];
  policies: readonly ReorderPolicy[];
  proposals: readonly ReorderProposal[];
  batches: readonly InventoryBatch[];
  tasks: readonly WarehouseTask[];
  inventoryTransfers?: RevenueOpsSnapshot['inventoryTransfers'];
  cycleCountPlans?: RevenueOpsSnapshot['cycleCountPlans'];
  commerceOrders?: RevenueOpsSnapshot['retailCommerceOrders'];
  commerceConnectors?: RevenueOpsSnapshot['retailCommerceConnectors'];
  initialTab?: StockWorkspaceTab;
  onOpenAdvanced: () => void;
  onOpenDestination?: (destination: RetailStockDestination) => void;
}

function formatQuantity(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(parsed);
}

function retailDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/** Plain-language stock front door. It never edits quantities or approves proposals. */
export function RetailStockOverviewPanel({
  variants,
  balances,
  policies,
  proposals,
  batches,
  tasks,
  inventoryTransfers = [],
  cycleCountPlans = [],
  commerceOrders = [],
  commerceConnectors = [],
  initialTab = 'health',
  onOpenAdvanced,
  onOpenDestination,
}: RetailStockOverviewPanelProps): ReactNode {
  const [activeTab, setActiveTab] = useState<StockWorkspaceTab>(initialTab);
  useEffect(() => setActiveTab(initialTab), [initialTab]);
  const report = useMemo(
    () => computeRetailStockOverview({ variants: [...variants], balances: [...balances], policies: [...policies], proposals: [...proposals], batches: [...batches], tasks: [...tasks] }),
    [balances, batches, policies, proposals, tasks, variants],
  );
  const channelTruth = useMemo(
    () => computeRetailOmnichannelInventoryTruth({ orders: commerceOrders, connectors: commerceConnectors, variants, balances }),
    [balances, commerceConnectors, commerceOrders, variants],
  );
  const currentDate = retailDate();
  const stockoutCount = report.rows.filter((row) => row.availableQuantity <= 0).length;
  const availableSkuCount = report.rows.filter((row) => row.availableQuantity > 0).length;
  const inventoryValue = balances.reduce((sum, balance) => sum + balance.inventoryValue, 0);
  const nearExpiryBatches = batches.filter((batch) => batch.status === 'released' && batch.expiresAt && batch.expiresAt >= currentDate && batch.expiresAt <= addDays(currentDate, 14));
  const inTransitTransfers = inventoryTransfers.filter((transfer) => transfer.status === 'in-transit');
  const inTransitUnits = inTransitTransfers.reduce((sum, transfer) => sum + transfer.lines.reduce((lineTotal, line) => lineTotal + line.quantity, 0), 0);
  const healthChart = useMemo<ChartDatum[]>(() => [
    { label: 'Healthy', value: report.rows.filter((row) => row.risk === 'clear').length, color: '#16866b' },
    { label: 'Reorder', value: report.rows.filter((row) => row.risk === 'reorder').length, color: '#d97706' },
    { label: 'Attention', value: report.rows.filter((row) => row.risk === 'attention').length, color: '#ea580c' },
    { label: 'Expired', value: report.rows.filter((row) => row.risk === 'expired').length, color: '#c53f52' },
  ].filter((entry) => entry.value > 0), [report.rows]);

  const rowsByVariantId = useMemo(() => new Map(report.rows.map((row) => [row.itemVariantId, row])), [report.rows]);
  const variantNameById = useMemo(() => new Map(variants.map((variant) => [variant.id, variant.name || variant.sku])), [variants]);
  const policyById = useMemo(() => new Map(policies.map((policy) => [policy.id, policy])), [policies]);
  const openDestination = (destination: RetailStockDestination): void => {
    if (onOpenDestination) onOpenDestination(destination);
    else onOpenAdvanced();
  };

  return (
    <section className="retail-stock-overview retail-stock-overview--retail-front" data-testid="retail-stock-overview" aria-labelledby="retail-stock-overview-title">
      <header className="retail-stock-overview__header retail-stock-overview__header--retail-front">
        <div>
          <span className="eyebrow"><Boxes size={14} aria-hidden="true" /> Inventory control</span>
          <h1 id="retail-stock-overview-title" className="retail-front-door__title">Know what you have, what is risky, and what to buy.</h1>
          <p>On-hand, reserved, expiry and replenishment evidence are shown together. Changes stay in the governed stock workbench.</p>
        </div>
        <div className="retail-stock-overview__status" role="status" data-alert={stockoutCount > 0 || nearExpiryBatches.length > 0}>
          <PackageCheck size={16} aria-hidden="true" />
          <span>{stockoutCount || nearExpiryBatches.length ? 'Review needed' : 'Local evidence clear'}</span>
          <small>{report.summary.openTaskCount} open warehouse task{report.summary.openTaskCount === 1 ? '' : 's'}</small>
        </div>
      </header>

      <div className="retail-stock-overview__metrics retail-stock-overview__metrics--five" aria-label="Stock overview">
        <div><IndianRupee size={17} aria-hidden="true" /><span>Inventory value</span><strong>{inr.format(inventoryValue)}</strong><small>recorded bin value</small></div>
        <div><PackageSearch size={17} aria-hidden="true" /><span>Available SKUs</span><strong>{formatQuantity(availableSkuCount)}</strong><small>with available units</small></div>
        <div data-alert={stockoutCount > 0}><AlertTriangle size={17} aria-hidden="true" /><span>Stockouts</span><strong>{formatQuantity(stockoutCount)}</strong><small>variants with no available unit</small></div>
        <div data-alert={nearExpiryBatches.length > 0}><ClipboardCheck size={17} aria-hidden="true" /><span>Near expiry</span><strong>{formatQuantity(nearExpiryBatches.length)}</strong><small>released batches within 14 days</small></div>
        <div><Truck size={17} aria-hidden="true" /><span>In transit</span><strong>{formatQuantity(inTransitUnits)}</strong><small>{inTransitTransfers.length} transfer{inTransitTransfers.length === 1 ? '' : 's'} in transit</small></div>
      </div>

      <nav className="retail-stock-overview__filters retail-stock-overview__tabs" aria-label="Stock work areas">
        {stockTabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={activeTab === tab.id ? 'is-active' : ''}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'health' ? (
        <StockHealthView
          rows={report.rows}
          healthChart={healthChart}
          channelAtRisk={channelTruth.summary.atRiskVariants}
          channelOpenOrders={channelTruth.summary.openOrders}
          onOpenAdvanced={() => openDestination('warehouse')}
        />
      ) : null}
      {activeTab === 'replenishment' ? <ReplenishmentView rows={report.rows} onOpenAdvanced={() => openDestination('warehouse')} /> : null}
      {activeTab === 'purchase' ? <PurchasePlanView proposals={proposals} policyById={policyById} rowsByVariantId={rowsByVariantId} onOpenAdvanced={() => openDestination('procurement')} /> : null}
      {activeTab === 'receiving' ? <ReceivingView tasks={tasks} variantNameById={variantNameById} onOpenAdvanced={() => openDestination('procurement')} /> : null}
      {activeTab === 'counts' ? <CountView countPlans={cycleCountPlans} onOpenAdvanced={() => openDestination('warehouse')} /> : null}
      {activeTab === 'transfers' ? <TransferView transfers={inventoryTransfers} onOpenAdvanced={() => openDestination('warehouse')} /> : null}
      {activeTab === 'expiry' ? <ExpiryView batches={batches} variantNameById={variantNameById} currentDate={currentDate} onOpenAdvanced={() => openDestination('expiry')} /> : null}

      <section className="retail-stock-overview__channel-truth" aria-label="Omnichannel inventory truth">
        <header>
          <div>
            <span className="eyebrow">Omnichannel inventory</span>
            <h3>Can we promise every channel order?</h3>
          </div>
          <strong data-alert={channelTruth.summary.atRiskVariants > 0}>{channelTruth.summary.atRiskVariants ? `${channelTruth.summary.atRiskVariants} at risk` : 'No open risk'}</strong>
        </header>
        {channelTruth.summary.openOrders ? (
          <>
            <div className="retail-stock-overview__channel-metrics"><span>{channelTruth.summary.openOrders} open order{channelTruth.summary.openOrders === 1 ? '' : 's'}</span><span>{formatQuantity(channelTruth.summary.unreservedDemandUnits)} unreserved units</span><span>{formatQuantity(channelTruth.summary.shortageUnits)} short / unmapped</span></div>
            <div className="retail-stock-overview__channel-list">
              {channelTruth.rows.slice(0, 6).map((row) => (
                <div key={row.itemVariantId} data-risk={row.risk}>
                  <div><strong>{row.label}</strong><small>{row.sku} · {row.channels.join(' · ')}</small></div>
                  <span>{formatQuantity(row.unreservedDemand)} demand · {formatQuantity(row.availableUnits)} available</span>
                  <em>{row.risk === 'covered' ? 'covered' : row.risk === 'short' ? `short ${row.shortageUnits}` : 'map SKU'}</em>
                </div>
              ))}
            </div>
          </>
        ) : <p className="retail-stock-overview__channel-empty">No open website, marketplace, ONDC or WhatsApp order demand is in the current evidence scope.</p>}
      </section>

      <footer className="retail-stock-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> Quantities are a local evidence projection. This screen does not silently adjust stock, approve a purchase or reserve an order.</footer>
    </section>
  );
}

function StockHealthView({
  rows,
  healthChart,
  channelAtRisk,
  channelOpenOrders,
  onOpenAdvanced,
}: {
  rows: readonly RetailStockOverviewRow[];
  healthChart: readonly ChartDatum[];
  channelAtRisk: number;
  channelOpenOrders: number;
  onOpenAdvanced: () => void;
}): ReactNode {
  const decisions = rows.filter((row) => row.risk !== 'clear').slice(0, 4);
  return (
    <>
      <div className="retail-stock-overview__decision-grid">
        <article className="retail-stock-overview__sheet" aria-labelledby="retail-stock-health-title">
          <header><div><span className="eyebrow">SKU health</span><h3 id="retail-stock-health-title">What needs a closer look</h3></div></header>
          <BarChart title="SKU health" data={healthChart} formatValue={(value) => `${formatQuantity(value)} SKU${value === 1 ? '' : 's'}`} />
        </article>
        <article className="retail-stock-overview__sheet retail-stock-overview__replenishment-sheet" aria-labelledby="retail-stock-decisions-title">
          <header>
            <div><span className="eyebrow">Replenishment decisions</span><h3 id="retail-stock-decisions-title">Buy, move or quarantine</h3></div>
            <button type="button" className="retail-stock-overview__open-link" onClick={onOpenAdvanced}>Open stock controls <ArrowRight size={14} aria-hidden="true" /></button>
          </header>
          {decisions.length ? <div className="retail-stock-overview__decision-list">{decisions.map((row) => <StockDecision key={row.itemVariantId} row={row} />)}</div> : <StockEmpty title="No replenishment decision is recorded" detail="Stock health will appear here after inventory, expiry or policy evidence identifies a real exception." />}
          {channelOpenOrders ? <p className="retail-stock-overview__channel-note" data-alert={channelAtRisk > 0}>{channelAtRisk ? `${channelAtRisk} channel SKU${channelAtRisk === 1 ? '' : 's'} need inventory review before promising ${channelOpenOrders} open online order${channelOpenOrders === 1 ? '' : 's'}.` : `${channelOpenOrders} open online order${channelOpenOrders === 1 ? '' : 's'} currently have no recorded inventory risk.`}</p> : null}
        </article>
      </div>
      <StockLedger rows={rows} onOpenAdvanced={onOpenAdvanced} />
    </>
  );
}

function StockDecision({ row }: { row: RetailStockOverviewRow }): ReactNode {
  return <div className="retail-stock-overview__decision" data-risk={row.risk}><span><AlertTriangle size={15} aria-hidden="true" /></span><div><strong>{row.label}</strong><small>{row.nextAction}</small></div><em>{riskTone[row.risk]}</em></div>;
}

function StockLedger({ rows, onOpenAdvanced }: { rows: readonly RetailStockOverviewRow[]; onOpenAdvanced: () => void }): ReactNode {
  return (
    <section className="retail-stock-overview__ledger" aria-labelledby="retail-stock-ledger-title">
      <header>
        <div><span className="eyebrow">Stock ledger view</span><h3 id="retail-stock-ledger-title">Availability by SKU</h3></div>
        <button type="button" className="retail-stock-overview__open-link" onClick={onOpenAdvanced}>Full ledger <ArrowRight size={14} aria-hidden="true" /></button>
      </header>
      {rows.length ? (
        <div className="retail-stock-overview__ledger-scroll">
          <table>
            <thead><tr><th>Product</th><th>SKU</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Policy</th><th>Risk</th><th>Next step</th></tr></thead>
            <tbody>{rows.slice(0, 12).map((row) => <tr key={row.itemVariantId} data-risk={row.risk}><td><strong>{row.label}</strong></td><td>{row.sku || '—'}</td><td>{formatQuantity(row.availableQuantity + row.reservedQuantity)}</td><td>{formatQuantity(row.reservedQuantity)}</td><td>{formatQuantity(row.availableQuantity)}</td><td>{row.reorderQuantity ? formatQuantity(row.reorderQuantity) : 'Not set'}</td><td><span className="retail-stock-overview__risk">{riskTone[row.risk]}</span></td><td>{row.nextAction}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <StockEmpty title="No stock ledger record is available" detail="Import or record governed inventory evidence before using stock decisions." />}
    </section>
  );
}

function ReplenishmentView({ rows, onOpenAdvanced }: { rows: readonly RetailStockOverviewRow[]; onOpenAdvanced: () => void }): ReactNode {
  const decisions = rows.filter((row) => row.risk === 'reorder' || row.risk === 'attention' || row.risk === 'expired');
  return <StockWorkspacePanel title="Replenishment decisions" description="Review a real policy or exception before proposing a purchase or transfer." action="Open replenishment controls" onOpenAdvanced={onOpenAdvanced}>{decisions.length ? <div className="retail-stock-overview__workspace-list">{decisions.map((row) => <StockDecision key={row.itemVariantId} row={row} />)}</div> : <StockEmpty title="No replenishment decision is pending" detail="Reorder policies and approved inventory evidence will surface here." />}</StockWorkspacePanel>;
}

function PurchasePlanView({ proposals, policyById, rowsByVariantId, onOpenAdvanced }: { proposals: readonly ReorderProposal[]; policyById: ReadonlyMap<string, ReorderPolicy>; rowsByVariantId: ReadonlyMap<string, RetailStockOverviewRow>; onOpenAdvanced: () => void }): ReactNode {
  const activeProposals = proposals.filter((proposal) => proposal.status === 'proposed');
  return <StockWorkspacePanel title="Purchase plan" description="These are proposed replenishment quantities, not approved purchase orders." action="Open purchase controls" onOpenAdvanced={onOpenAdvanced}>{activeProposals.length ? <div className="retail-stock-overview__workspace-list">{activeProposals.map((proposal) => { const policy = policyById.get(proposal.policyId); const row = policy ? rowsByVariantId.get(policy.itemVariantId) : undefined; return <div key={proposal.id} className="retail-stock-overview__workspace-row"><div><strong>{row?.label ?? proposal.policyId}</strong><small>{proposal.reason} · required {formatDate(proposal.requiredBy)}</small></div><span>{formatQuantity(proposal.recommendedQuantity)} recommended</span><em>Proposed</em></div>; })}</div> : <StockEmpty title="No proposed purchase is waiting" detail="A proposal appears only after an active reorder policy identifies a supported shortage." />}</StockWorkspacePanel>;
}

function ReceivingView({ tasks, variantNameById, onOpenAdvanced }: { tasks: readonly WarehouseTask[]; variantNameById: ReadonlyMap<string, string>; onOpenAdvanced: () => void }): ReactNode {
  const receivingTasks = tasks.filter((task) => task.type === 'putaway' && task.status !== 'completed' && task.status !== 'cancelled');
  return <StockWorkspacePanel title="Receiving" description="Open putaway work is shown from warehouse task evidence." action="Open receiving controls" onOpenAdvanced={onOpenAdvanced}>{receivingTasks.length ? <div className="retail-stock-overview__workspace-list">{receivingTasks.map((task) => <div key={task.id} className="retail-stock-overview__workspace-row" data-status={task.status}><div><strong>{variantNameById.get(task.itemVariantId) ?? task.itemVariantId}</strong><small>{task.number} · due {formatDate(task.dueAt)} · {task.priority} priority</small></div><span>{formatQuantity(task.quantity)} units</span><em>{task.status.replace('-', ' ')}</em></div>)}</div> : <StockEmpty title="No open receiving task" detail="Goods receipt and putaway work will appear after the governed warehouse process creates it." />}</StockWorkspacePanel>;
}

function CountView({ countPlans, onOpenAdvanced }: { countPlans: RevenueOpsSnapshot['cycleCountPlans']; onOpenAdvanced: () => void }): ReactNode {
  const openPlans = countPlans.filter((plan) => !['posted', 'cancelled'].includes(plan.status));
  return <StockWorkspacePanel title="Cycle counts" description="Count plans remain separate from quantity posting and independent review." action="Open count controls" onOpenAdvanced={onOpenAdvanced}>{openPlans.length ? <div className="retail-stock-overview__workspace-list">{openPlans.map((plan) => <div key={plan.id} className="retail-stock-overview__workspace-row" data-status={plan.status}><div><strong>{plan.number}</strong><small>{plan.lines.length} line{plan.lines.length === 1 ? '' : 's'} · scheduled {formatDate(plan.scheduledAt)}</small></div><span>{plan.blindCount ? 'Blind count' : 'Visible count'}</span><em>{plan.status}</em></div>)}</div> : <StockEmpty title="No cycle count is in progress" detail="Create a governed count plan when a store or warehouse needs a verified stock check." />}</StockWorkspacePanel>;
}

function TransferView({ transfers, onOpenAdvanced }: { transfers: RevenueOpsSnapshot['inventoryTransfers']; onOpenAdvanced: () => void }): ReactNode {
  const currentTransfers = transfers.filter((transfer) => !['received', 'cancelled'].includes(transfer.status));
  return <StockWorkspacePanel title="Transfers" description="Move inventory only through a documented release, transit and receipt trail." action="Open transfer controls" onOpenAdvanced={onOpenAdvanced}>{currentTransfers.length ? <div className="retail-stock-overview__workspace-list">{currentTransfers.map((transfer) => <div key={transfer.id} className="retail-stock-overview__workspace-row" data-status={transfer.status}><div><strong>{transfer.number}</strong><small>{transfer.lines.length} line{transfer.lines.length === 1 ? '' : 's'} · created {formatDate(transfer.createdAt)}</small></div><span>{formatQuantity(transfer.lines.reduce((sum, line) => sum + line.quantity, 0))} units</span><em>{transfer.status.replace('-', ' ')}</em></div>)}</div> : <StockEmpty title="No transfer is open" detail="Released or in-transit inventory moves will appear here until they are received or cancelled." />}</StockWorkspacePanel>;
}

function ExpiryView({ batches, variantNameById, currentDate, onOpenAdvanced }: { batches: readonly InventoryBatch[]; variantNameById: ReadonlyMap<string, string>; currentDate: string; onOpenAdvanced: () => void }): ReactNode {
  const expiryBatches = batches.filter((batch) => batch.status === 'expired' || (batch.status === 'released' && batch.expiresAt && batch.expiresAt <= addDays(currentDate, 30)));
  return <StockWorkspacePanel title="Expiry watch" description="Released batches approaching expiry and already-expired batches require a traceable disposition." action="Open batch controls" onOpenAdvanced={onOpenAdvanced}>{expiryBatches.length ? <div className="retail-stock-overview__workspace-list">{expiryBatches.map((batch) => <div key={batch.id} className="retail-stock-overview__workspace-row" data-status={batch.status}><div><strong>{variantNameById.get(batch.itemVariantId) ?? batch.itemVariantId}</strong><small>Batch {batch.batchNumber} · expires {formatDate(batch.expiresAt)}</small></div><span>{batch.status === 'expired' ? 'Quarantine required' : 'Review soon'}</span><em>{batch.status}</em></div>)}</div> : <StockEmpty title="No expiry risk is recorded" detail="Expiry watch is based on released batch evidence, not estimated shelf-life values." />}</StockWorkspacePanel>;
}

function StockWorkspacePanel({ title, description, action, onOpenAdvanced, children }: { title: string; description: string; action: string; onOpenAdvanced: () => void; children: ReactNode }): ReactNode {
  return <section className="retail-stock-overview__workspace-panel" data-testid={`retail-stock-tab-${title.toLowerCase().replaceAll(' ', '-')}`}><header><div><span className="eyebrow">Stock work area</span><h3>{title}</h3><p>{description}</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>{action} <ArrowRight size={14} aria-hidden="true" /></button></header>{children}</section>;
}

function StockEmpty({ title, detail }: { title: string; detail: string }): ReactNode {
  return <div className="bharat-empty retail-stock-overview__empty"><Warehouse size={22} aria-hidden="true" /><strong>{title}</strong><span>{detail}</span></div>;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function RetailStockOverviewFromRevenue({ revenue, initialTab, onOpenAdvanced, onOpenDestination }: { revenue: RevenueOpsSnapshot; initialTab?: StockWorkspaceTab; onOpenAdvanced: () => void; onOpenDestination?: (destination: RetailStockDestination) => void }): ReactNode {
  return <RetailStockOverviewPanel
    variants={revenue.itemVariants}
    balances={revenue.binBalances}
    policies={revenue.reorderPolicies}
    proposals={revenue.reorderProposals}
    batches={revenue.inventoryBatches}
    tasks={revenue.warehouseTasks}
    inventoryTransfers={revenue.inventoryTransfers}
    cycleCountPlans={revenue.cycleCountPlans}
    commerceOrders={revenue.retailCommerceOrders}
    commerceConnectors={revenue.retailCommerceConnectors}
    initialTab={initialTab}
    onOpenAdvanced={onOpenAdvanced}
    onOpenDestination={onOpenDestination}
  />;
}
