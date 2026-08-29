import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  CheckCircle2,
  ClipboardList,
  IndianRupee,
  PackageCheck,
  PackageSearch,
  ShoppingBag,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import {
  computeRetailCommandCenter,
  type RetailCommandAttention,
} from '../domain/retail-command-center';
import { toIndiaBusinessDate } from '../shared/india-business-date';
import type { RetailCommerceChannel } from '../shared/retail-commerce-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { TrendLineChart, type ChartDatum } from './ExecutiveCharts';

export interface BakalooRetailCommandCenterProps {
  /** The governed local retail projection. The component never invents values. */
  revenue: RevenueOpsSnapshot;
  onPos: () => void;
  onOrders: () => void;
  onStock: () => void;
  onDelivery: () => void;
  onCash: () => void;
  onCustomers: () => void;
  onSetup: () => void;
}

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  actionLabel: string;
  onOpen: () => void;
  tone?: 'attention' | 'positive' | 'danger';
}

interface OrderFlowStage {
  id: string;
  label: string;
  value: number;
  detail: string;
  tone?: 'attention' | 'positive';
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

const channelLabels: Record<RetailCommerceChannel, string> = {
  marketplace: 'Marketplace',
  ondc: 'ONDC',
  website: 'Website',
  whatsapp: 'WhatsApp',
};

function safeIndiaBusinessDate(value: string): string | undefined {
  try {
    return toIndiaBusinessDate(value);
  } catch {
    return undefined;
  }
}

function formatRecordedMoment(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recorded time unavailable';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(parsed);
}

function MetricCard({ icon: Icon, label, value, detail, actionLabel, onOpen, tone }: MetricCardProps): ReactNode {
  return (
    <article className="bakaloo-command__metric" data-emphasis={tone}>
      <div className="bakaloo-command__metric-heading">
        <span className="bakaloo-command__metric-icon"><Icon size={18} aria-hidden="true" /></span>
        <h3>{label}</h3>
      </div>
      <strong className="bakaloo-command__metric-value">{value}</strong>
      <p>{detail}</p>
      <button type="button" className="bakaloo-command__card-action" onClick={onOpen}>
        {actionLabel} <ArrowRight size={15} aria-hidden="true" />
      </button>
    </article>
  );
}

function AttentionAction({ attention, onCash, onStock, onOrders }: {
  attention: RetailCommandAttention;
  onCash: () => void;
  onStock: () => void;
  onOrders: () => void;
}): ReactNode {
  const action = attention.kind === 'cash-variance'
    ? { label: 'Review cash', onClick: onCash }
    : attention.kind === 'omnichannel'
      ? { label: 'Open orders', onClick: onOrders }
      : { label: 'Review stock', onClick: onStock };
  return (
    <li className="bakaloo-command__attention-item" data-severity={attention.severity}>
      <span className="bakaloo-command__attention-signal" aria-hidden="true"><AlertTriangle size={16} /></span>
      <div>
        <strong>{attention.summary}</strong>
        <small>{attention.action}</small>
      </div>
      <button type="button" className="bakaloo-command__text-action" onClick={action.onClick}>
        {action.label} <ArrowRight size={14} aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * The Home route is intentionally a decision surface rather than a second
 * dashboard. Every figure is derived from the governed local projection and
 * each action routes to the workbench that owns the eventual write.
 */
export function BakalooRetailCommandCenter({
  revenue,
  onPos,
  onOrders,
  onStock,
  onDelivery,
  onCash,
  onCustomers,
  onSetup,
}: BakalooRetailCommandCenterProps): ReactNode {
  const command = useMemo(() => computeRetailCommandCenter(revenue), [revenue]);
  const today = safeIndiaBusinessDate(revenue.generatedAt);
  const storeName = revenue.profile.tradeName.trim() || revenue.profile.legalName.trim() || 'Your store';

  const todaySales = useMemo(() => {
    const completed = today
      ? revenue.retailSales.filter((sale) => sale.status === 'completed' && safeIndiaBusinessDate(sale.saleAt) === today)
      : [];
    return {
      count: completed.length,
      total: completed.reduce((sum, sale) => sum + sale.taxPreview.grandTotal, 0),
    };
  }, [revenue.retailSales, today]);

  const delivery = useMemo(() => {
    const active = revenue.deliveryPromises.filter((promise) => promise.status === 'active');
    return {
      active,
      overdue: today ? active.filter((promise) => promise.deliveryTo < today) : [],
      fulfilled: revenue.deliveryPromises.filter((promise) => promise.status === 'fulfilled'),
    };
  }, [revenue.deliveryPromises, today]);

  const stockoutCount = command.totalStockoutCount;
  const stockAttentionCount = stockoutCount + command.totalExpiryRiskItemsCount;
  const completedSales = revenue.retailSales.filter((sale) => sale.status === 'completed');
  const totalRevenue = completedSales.reduce((sum, sale) => sum + sale.taxPreview.grandTotal, 0);
  const customerCount = new Set(completedSales.map((sale) => sale.customerAccountId).filter(Boolean)).size;
  const totalOrders = completedSales.length + revenue.retailCommerceOrders.length;
  const activeRiders = revenue.retailDeliveryMapSignals
    ? new Set(revenue.retailDeliveryMapSignals.filter((signal) => signal.status === 'live-evidence').map((signal) => signal.riderId)).size
    : undefined;
  const collectedCod = revenue.codCollectionCases
    .filter((caseFile) => ['carrier-collected', 'remitted', 'bank-matched'].includes(caseFile.status))
    .reduce((sum, caseFile) => sum + caseFile.expectedAmount, 0);
  const averageOrderValue = completedSales.length ? totalRevenue / completedSales.length : undefined;

  const salesTrend = useMemo(() => {
    const daily = new Map<string, number>();
    for (const sale of revenue.retailSales) {
      if (sale.status !== 'completed') continue;
      const businessDate = safeIndiaBusinessDate(sale.saleAt);
      if (!businessDate) continue;
      daily.set(businessDate, (daily.get(businessDate) ?? 0) + sale.taxPreview.grandTotal);
    }
    return [...daily.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-7)
      .map(([date, value]): ChartDatum => ({ label: date.slice(5), value }));
  }, [revenue.retailSales]);

  const orderFlow = useMemo<OrderFlowStage[]>(() => {
    const orders = revenue.retailCommerceOrders;
    const awaitingReview = orders.filter((order) => order.status === 'imported').length;
    const confirmed = orders.filter((order) => order.status === 'confirmed').length;
    const inDelivery = delivery.active.length;
    const complete = orders.filter((order) => order.status === 'fulfilled').length + delivery.fulfilled.length;
    return [
      { id: 'review', label: 'To review', value: awaitingReview, detail: 'Imported online orders', tone: awaitingReview ? 'attention' : undefined },
      { id: 'confirmed', label: 'Confirmed', value: confirmed, detail: 'Ready for fulfilment' },
      { id: 'delivery', label: 'Out for delivery', value: inDelivery, detail: 'Active delivery promises', tone: delivery.overdue.length ? 'attention' : undefined },
      { id: 'complete', label: 'Completed', value: complete, detail: 'Fulfilled order evidence', tone: complete ? 'positive' : undefined },
    ];
  }, [delivery.active.length, delivery.fulfilled.length, delivery.overdue.length, revenue.retailCommerceOrders]);

  const latestOrders = useMemo(() => {
    const connectorById = new Map(revenue.retailCommerceConnectors.map((connector) => [connector.id, connector]));
    return [...revenue.retailCommerceOrders]
      .sort((left, right) => right.importedAt.localeCompare(left.importedAt))
      .slice(0, 4)
      .map((order) => ({
        id: order.id,
        number: order.orderNumber,
        channel: connectorById.get(order.connectorId)?.channel,
        value: order.totalAmount,
        status: order.status,
        recordedAt: order.importedAt,
      }));
  }, [revenue.retailCommerceConnectors, revenue.retailCommerceOrders]);

  const localStatus = revenue.retailHubStoreEdgeSyncPolicy?.enabled
    ? 'Local-first sync enabled'
    : 'Local records';

  return (
    <section className="bakaloo-command bakaloo-command--retail-front" aria-labelledby="bakaloo-command-title" data-testid="bakaloo-retail-command-center">
      <header className="bakaloo-command__header bakaloo-command__header--retail-front">
        <div className="bakaloo-command__header-copy">
          <span className="bakaloo-command__eyebrow">Store performance</span>
          <h1 id="bakaloo-command-title" className="retail-front-door__title">Dashboard</h1>
          <p>Overview of your store performance</p>
        </div>
        <div className="bakaloo-command__scope" aria-label="Current retail workspace status">
          <Store size={18} aria-hidden="true" />
          <span>{storeName}</span>
          <small>{localStatus} · generated {formatRecordedMoment(revenue.generatedAt)}</small>
        </div>
      </header>

      <section className="bakaloo-command__metrics bakaloo-command__metrics--ten" aria-label="Store performance metrics">
        <MetricCard
          icon={IndianRupee}
          label="Total revenue"
          value={inrFormatter.format(totalRevenue)}
          detail={`${numberFormatter.format(completedSales.length)} completed counter receipt${completedSales.length === 1 ? '' : 's'} in this local projection.`}
          actionLabel="Open sales"
          onOpen={onPos}
          tone={completedSales.length ? 'positive' : undefined}
        />
        <MetricCard
          icon={ShoppingBag}
          label="Total orders"
          value={numberFormatter.format(totalOrders)}
          detail={`${numberFormatter.format(completedSales.length)} counter receipts · ${numberFormatter.format(revenue.retailCommerceOrders.length)} imported channel order${revenue.retailCommerceOrders.length === 1 ? '' : 's'}.`}
          actionLabel="Open orders"
          onOpen={onOrders}
        />
        <MetricCard
          icon={Boxes}
          label="Products"
          value={numberFormatter.format(revenue.itemVariants.length)}
          detail={`${numberFormatter.format(revenue.inventoryItems.length)} governed inventory item${revenue.inventoryItems.length === 1 ? '' : 's'} in the active scope.`}
          actionLabel="Open products"
          onOpen={onStock}
        />
        <MetricCard
          icon={Users}
          label="Customers"
          value={numberFormatter.format(customerCount)}
          detail={customerCount ? 'Unique customer accounts on completed local receipts.' : 'No customer is linked to a completed local receipt.'}
          actionLabel="Open customers"
          onOpen={onCustomers}
        />
        <MetricCard
          icon={PackageCheck}
          label="Pending orders"
          value={numberFormatter.format(command.onlinePendingOrdersCount)}
          detail={command.onlinePendingOrdersCount ? `${inrFormatter.format(command.onlinePendingOrderValue)} awaiting confirmation or fulfilment.` : 'No online order needs review.'}
          actionLabel="Review orders"
          onOpen={onOrders}
          tone={command.onlinePendingOrdersCount ? 'attention' : undefined}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Low stock items"
          value={numberFormatter.format(stockAttentionCount)}
          detail={stockAttentionCount ? `${stockoutCount} stockout${stockoutCount === 1 ? '' : 's'} and ${command.totalExpiryRiskItemsCount} expiry risk${command.totalExpiryRiskItemsCount === 1 ? '' : 's'} recorded.` : 'No stock exception is recorded.'}
          actionLabel="Review stock"
          onOpen={onStock}
          tone={stockAttentionCount ? 'attention' : undefined}
        />
        <MetricCard
          icon={Truck}
          label="Online riders"
          value={activeRiders === undefined ? 'Unavailable' : numberFormatter.format(activeRiders)}
          detail={activeRiders === undefined ? 'No authenticated rider-location projection is connected.' : 'Only fresh, verified rider device signals are counted.'}
          actionLabel="Open delivery"
          onOpen={onDelivery}
          tone={activeRiders ? 'positive' : undefined}
        />
        <MetricCard
          icon={IndianRupee}
          label="Today’s revenue"
          value={inrFormatter.format(todaySales.total)}
          detail={todaySales.count ? `${numberFormatter.format(todaySales.count)} completed sale${todaySales.count === 1 ? '' : 's'} recorded today.` : 'No completed sales recorded today.'}
          actionLabel="Open POS"
          onOpen={onPos}
          tone={todaySales.count ? 'positive' : undefined}
        />
        <MetricCard
          icon={ShoppingBag}
          label="Average order value"
          value={averageOrderValue === undefined ? '—' : inrFormatter.format(averageOrderValue)}
          detail={averageOrderValue === undefined ? 'Available after the first completed local receipt.' : 'Completed local receipt average; channel orders are not mixed in.'}
          actionLabel="Open sales"
          onOpen={onPos}
        />
        <MetricCard
          icon={Banknote}
          label="COD collections"
          value={inrFormatter.format(collectedCod)}
          detail={`${numberFormatter.format(revenue.codCollectionCases.filter((caseFile) => ['carrier-collected', 'remitted', 'bank-matched'].includes(caseFile.status)).length)} recorded collection case${revenue.codCollectionCases.length === 1 ? '' : 's'} across carrier, remittance or bank evidence.`}
          actionLabel="Review cash"
          onOpen={onCash}
        />
      </section>

      <div className="bakaloo-command__primary-grid">
        <section className="bakaloo-command__sheet bakaloo-command__sheet--sales" aria-labelledby="bakaloo-sales-title">
          <header>
            <div>
              <span className="bakaloo-command__eyebrow">Sales today</span>
              <h3 id="bakaloo-sales-title">Sales by recorded day</h3>
              <p>Completed local receipts only. A line appears after the first governed sale.</p>
            </div>
            <button type="button" className="bakaloo-command__text-action" onClick={onPos}>
              Start sale <ArrowRight size={15} aria-hidden="true" />
            </button>
          </header>
          <TrendLineChart title="Sales by recorded day" data={salesTrend} formatValue={(value) => inrFormatter.format(value)} />
        </section>

        <section className="bakaloo-command__sheet bakaloo-command__sheet--attention" aria-labelledby="bakaloo-attention-title">
          <header>
            <div>
              <span className="bakaloo-command__eyebrow">Needs attention</span>
              <h3 id="bakaloo-attention-title">Make the next decision clear</h3>
              <p>Only recorded exceptions appear here. Nothing is estimated or fabricated.</p>
            </div>
          </header>
          {command.attentionQueue.length ? (
            <ul className="bakaloo-command__attention-list" aria-label="Recorded retail exceptions">
              {command.attentionQueue.slice(0, 4).map((attention) => (
                <AttentionAction key={attention.id} attention={attention} onCash={onCash} onStock={onStock} onOrders={onOrders} />
              ))}
            </ul>
          ) : (
            <div className="bakaloo-command__empty" role="status">
              <CheckCircle2 size={20} aria-hidden="true" />
              <div><strong>No recorded exception needs a decision.</strong><span>Keep recording sales, stock, cash and delivery evidence to maintain this view.</span></div>
            </div>
          )}
        </section>
      </div>

      <div className="bakaloo-command__work-grid">
        <section className="bakaloo-command__sheet bakaloo-command__sheet--orders" aria-labelledby="bakaloo-order-flow-title">
          <header>
            <div>
              <span className="bakaloo-command__eyebrow">Order flow</span>
              <h3 id="bakaloo-order-flow-title">See every handoff</h3>
              <p>Online order status and delivery promise evidence stay separate until the real fulfilment workbench confirms them.</p>
            </div>
            <button type="button" className="bakaloo-command__text-action" onClick={onOrders}>
              Open orders <ArrowRight size={15} aria-hidden="true" />
            </button>
          </header>
          <div className="bakaloo-command__flow-strip" aria-label="Online order flow">
            {orderFlow.map((stage) => (
              <div key={stage.id} data-tone={stage.tone}>
                <strong>{numberFormatter.format(stage.value)}</strong>
                <span>{stage.label}</span>
                <small>{stage.detail}</small>
              </div>
            ))}
          </div>
          {latestOrders.length ? (
            <div className="bakaloo-command__order-table" role="table" aria-label="Latest governed online orders">
              <div role="row" className="bakaloo-command__order-table-heading"><span role="columnheader">Order</span><span role="columnheader">Channel</span><span role="columnheader">Recorded</span><span role="columnheader">Status</span></div>
              {latestOrders.map((order) => (
                <div role="row" key={order.id}>
                  <strong role="cell">{order.number}</strong>
                  <span role="cell">{order.channel ? channelLabels[order.channel] : 'Channel unmapped'}</span>
                  <span role="cell">{formatRecordedMoment(order.recordedAt)}</span>
                  <span role="cell" className="bakaloo-command__status-pill">{order.status.replace('-', ' ')}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bakaloo-command__empty bakaloo-command__empty--compact">
              <ShoppingBag size={20} aria-hidden="true" />
              <div><strong>No governed online order is in this scope.</strong><span>Connect a channel and shadow-import only when source credentials and reconciliation evidence are ready.</span></div>
            </div>
          )}
        </section>

        <section className="bakaloo-command__sheet bakaloo-command__sheet--quick-actions" aria-labelledby="bakaloo-quick-actions-title">
          <header>
            <div>
              <span className="bakaloo-command__eyebrow">Quick actions</span>
              <h3 id="bakaloo-quick-actions-title">Start with one clear task</h3>
              <p>Each action opens the accountable workbench. Nothing is posted from this overview.</p>
            </div>
          </header>
          <div className="bakaloo-command__quick-actions">
            <button type="button" onClick={onPos}><ShoppingBag size={18} aria-hidden="true" /><span><strong>Start sale</strong><small>Open the POS counter</small></span><ArrowRight size={15} aria-hidden="true" /></button>
            <button type="button" onClick={onOrders}><PackageCheck size={18} aria-hidden="true" /><span><strong>Pack orders</strong><small>Review online fulfilment</small></span><ArrowRight size={15} aria-hidden="true" /></button>
            <button type="button" onClick={onStock}><Boxes size={18} aria-hidden="true" /><span><strong>Check stock</strong><small>Review stock exceptions</small></span><ArrowRight size={15} aria-hidden="true" /></button>
            <button type="button" onClick={onCash}><Banknote size={18} aria-hidden="true" /><span><strong>Close cash</strong><small>Review shifts and variance</small></span><ArrowRight size={15} aria-hidden="true" /></button>
            <button type="button" onClick={onCustomers}><Users size={18} aria-hidden="true" /><span><strong>Find customer</strong><small>Open customer 360</small></span><ArrowRight size={15} aria-hidden="true" /></button>
            <button type="button" onClick={onSetup}><ClipboardList size={18} aria-hidden="true" /><span><strong>Set up store</strong><small>Finish safe operating basics</small></span><ArrowRight size={15} aria-hidden="true" /></button>
          </div>
          <footer className="bakaloo-command__source-note">
            <PackageSearch size={14} aria-hidden="true" /> Local governed records · no demo sales, no fabricated map or sync state.
          </footer>
        </section>
      </div>
    </section>
  );
}
