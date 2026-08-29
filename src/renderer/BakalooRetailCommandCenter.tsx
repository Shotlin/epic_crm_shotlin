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
import { useMemo, useState, type ReactNode } from 'react';
import {
  computeRetailCommandCenter,
  type RetailCommandAttention,
} from '../domain/retail-command-center';
import { computeCategorySales } from '../domain/retail-reports';
import { toIndiaBusinessDate } from '../shared/india-business-date';
import type { RetailCommerceChannel } from '../shared/retail-commerce-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { BarChart, TrendLineChart, type ChartDatum } from './ExecutiveCharts';
import { RetailDeliveryMapSurface } from './RetailDeliveryMapSurface';

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

type DashboardPeriod = 'today' | 'week' | 'month' | 'year';

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

function indiaHour(value: string): string | undefined {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const hour = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
    .formatToParts(parsed)
    .find((part) => part.type === 'hour')?.value;
  return hour === undefined ? undefined : `${hour}:00`;
}

function saleFallsInPeriod(saleAt: string, generatedAt: string, period: DashboardPeriod): boolean {
  const saleDate = safeIndiaBusinessDate(saleAt);
  const today = safeIndiaBusinessDate(generatedAt);
  if (!saleDate || !today) return false;
  if (period === 'today') return saleDate === today;
  if (period === 'month') return saleDate.slice(0, 7) === today.slice(0, 7);
  if (period === 'year') return saleDate.slice(0, 4) === today.slice(0, 4);
  const start = new Date(`${today}T00:00:00+05:30`);
  start.setUTCDate(start.getUTCDate() - 6);
  return saleDate >= start.toISOString().slice(0, 10) && saleDate <= today;
}

function RevenueOrdersComparison({ data }: { data: ReadonlyArray<{ label: string; revenue: number; orders: number }> }): ReactNode {
  if (!data.length) {
    return <div className="bakaloo-command__comparison-empty" role="status">No governed completed sales yet.</div>;
  }
  const maxRevenue = Math.max(...data.map((item) => item.revenue), 1);
  const maxOrders = Math.max(...data.map((item) => item.orders), 1);
  return <div className="bakaloo-command__comparison" role="img" aria-label={`Revenue versus orders: ${data.map((item) => `${item.label}: ${inrFormatter.format(item.revenue)}, ${numberFormatter.format(item.orders)} orders`).join('; ')}`}>
    {data.map((item) => <div className="bakaloo-command__comparison-row" key={item.label}>
      <span>{item.label}</span>
      <div><i data-series="revenue" style={{ width: `${(item.revenue / maxRevenue) * 100}%` }} /><i data-series="orders" style={{ width: `${(item.orders / maxOrders) * 100}%` }} /></div>
      <small>{inrFormatter.format(item.revenue)} · {numberFormatter.format(item.orders)}</small>
    </div>)}
    <footer><span><i data-series="revenue" /> Revenue</span><span><i data-series="orders" /> Orders</span></footer>
  </div>;
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
  const [period, setPeriod] = useState<DashboardPeriod>('today');
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

  const completedSales = revenue.retailSales.filter((sale) => sale.status === 'completed');
  const periodSales = useMemo(() => completedSales.filter((sale) => saleFallsInPeriod(sale.saleAt, revenue.generatedAt, period)), [completedSales, period, revenue.generatedAt]);
  const periodCommerceOrders = useMemo(() => revenue.retailCommerceOrders.filter((order) => saleFallsInPeriod(order.remoteCreatedAt, revenue.generatedAt, period)), [period, revenue.generatedAt, revenue.retailCommerceOrders]);
  const stockoutCount = command.totalStockoutCount;
  const stockAttentionCount = stockoutCount;
  const totalRevenue = periodSales.reduce((sum, sale) => sum + sale.taxPreview.grandTotal, 0);
  const customerCount = new Set(periodSales.map((sale) => sale.customerAccountId).filter(Boolean)).size;
  const totalOrders = periodSales.length + periodCommerceOrders.length;
  const activeRiders = revenue.retailDeliveryMapSignals
    ? new Set(revenue.retailDeliveryMapSignals.filter((signal) => signal.status === 'live-evidence').map((signal) => signal.riderId)).size
    : undefined;
  const collectedCod = revenue.codCollectionCases
    .filter((caseFile) => ['carrier-collected', 'remitted', 'bank-matched'].includes(caseFile.status))
    .reduce((sum, caseFile) => sum + caseFile.expectedAmount, 0);
  const averageOrderValue = periodSales.length ? totalRevenue / periodSales.length : undefined;

  const salesTrend = useMemo(() => {
    const daily = new Map<string, number>();
    for (const sale of periodSales) {
      const businessDate = safeIndiaBusinessDate(sale.saleAt);
      if (!businessDate) continue;
      daily.set(businessDate, (daily.get(businessDate) ?? 0) + sale.taxPreview.grandTotal);
    }
    return [...daily.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-7)
      .map(([date, value]): ChartDatum => ({ label: date.slice(5), value }));
  }, [periodSales]);

  const dashboardVisuals = useMemo(() => {
    const daily = new Map<string, { revenue: number; orders: number }>();
    const hourly = new Map<string, number>();
    const products = new Map<string, number>();
    for (const sale of periodSales) {
      const day = safeIndiaBusinessDate(sale.saleAt);
      if (day) {
        const current = daily.get(day) ?? { revenue: 0, orders: 0 };
        daily.set(day, { revenue: current.revenue + sale.taxPreview.grandTotal, orders: current.orders + 1 });
      }
      const hour = indiaHour(sale.saleAt);
      if (hour) hourly.set(hour, (hourly.get(hour) ?? 0) + 1);
      for (const line of sale.lines) {
        const label = line.description.trim() || 'Unnamed product';
        products.set(label, (products.get(label) ?? 0) + line.lineTotal);
      }
    }
    const variantsById = Object.fromEntries(revenue.itemVariants.map((variant) => [variant.id, variant.itemId]));
    const dates = [...daily.keys()].sort();
    const categoryRows = dates.length
      ? computeCategorySales({
        allSales: periodSales,
        fromDate: dates[0]!,
        toDate: dates.at(-1)!,
        merchandisingProfiles: revenue.retailMerchandisingProfiles,
        categories: revenue.retailCatalogCategories,
        variantItemMap: variantsById,
      }).rows
      : [];
    return {
      categoryRevenue: categoryRows.slice(0, 6).map((row) => ({ label: row.categoryName, value: row.revenue, color: '#1A7A3C' })),
      revenueVsOrders: dates.slice(-7).map((date) => ({ label: date.slice(5), ...daily.get(date)! })),
      ordersByHour: [...hourly.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([label, value]) => ({ label, value, color: '#3B82F6' })),
      topProducts: [...products.entries()].map(([label, value]) => ({ label, value, color: '#158034' })).sort((left, right) => right.value - left.value).slice(0, 6),
      stockAlerts: command.attentionQueue.filter((item) => item.kind === 'stockout' || item.kind === 'expiry'),
    };
  }, [command.attentionQueue, periodSales, revenue.itemVariants, revenue.retailCatalogCategories, revenue.retailMerchandisingProfiles]);

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
        <div className="bakaloo-command__periods" role="group" aria-label="Dashboard reporting period">
          {([['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}
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
          detail={`${numberFormatter.format(periodSales.length)} completed counter receipt${periodSales.length === 1 ? '' : 's'} in the selected period.`}
          actionLabel="Open sales"
          onOpen={onPos}
          tone={completedSales.length ? 'positive' : undefined}
        />
        <MetricCard
          icon={ShoppingBag}
          label="Total orders"
          value={numberFormatter.format(totalOrders)}
          detail={`${numberFormatter.format(periodSales.length)} counter receipts · ${numberFormatter.format(periodCommerceOrders.length)} imported channel order${periodCommerceOrders.length === 1 ? '' : 's'} in the selected period.`}
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
          detail={customerCount ? 'Unique customer accounts on selected completed local receipts.' : 'No customer is linked to a selected completed local receipt.'}
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
          detail={stockAttentionCount ? `${stockoutCount} unavailable item${stockoutCount === 1 ? '' : 's'} across active retail bins.` : 'No unavailable item is recorded.'}
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
          detail={averageOrderValue === undefined ? 'Available after the first selected completed local receipt.' : 'Selected completed local receipt average; channel orders are not mixed in.'}
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

      <section className="bakaloo-command__abandoned-carts" aria-labelledby="bakaloo-abandoned-carts-title">
        <div>
          <span className="bakaloo-command__eyebrow">Customer recovery</span>
          <h2 id="bakaloo-abandoned-carts-title">Abandoned carts</h2>
          <p>No governed cart-recovery feed is connected. Connect a consent-aware website/app cart source before customers are contacted or recovery value is reported.</p>
        </div>
        <button type="button" className="bakaloo-command__text-action" onClick={onCustomers}>Open customer recovery <ArrowRight size={15} aria-hidden="true" /></button>
      </section>

      <div className="bakaloo-command__primary-grid">
        <section className="bakaloo-command__sheet bakaloo-command__sheet--sales" aria-labelledby="bakaloo-sales-title">
          <header>
            <div>
              <span className="bakaloo-command__eyebrow">Sales today</span>
              <h3 id="bakaloo-sales-title">Revenue trend</h3>
              <p>Completed local receipts only. A line appears after the first governed sale.</p>
            </div>
            <button type="button" className="bakaloo-command__text-action" onClick={onPos}>
              Start sale <ArrowRight size={15} aria-hidden="true" />
            </button>
          </header>
          <TrendLineChart title="Revenue trend" data={salesTrend} formatValue={(value) => inrFormatter.format(value)} />
        </section>

        <section className="bakaloo-command__sheet" aria-labelledby="bakaloo-category-revenue-title">
          <header><div><span className="bakaloo-command__eyebrow">Sales mix</span><h3 id="bakaloo-category-revenue-title">Revenue by category</h3><p>Category comes from the controlled retail merchandising profile, never from a guessed product name.</p></div></header>
          <BarChart title="Revenue by category" data={dashboardVisuals.categoryRevenue} formatValue={(value) => inrFormatter.format(value)} />
        </section>

        <section className="bakaloo-command__sheet bakaloo-command__sheet--attention" aria-labelledby="bakaloo-attention-title">
          <header>
            <div>
              <span className="bakaloo-command__eyebrow">Needs attention</span>
              <h3 id="bakaloo-attention-title">Pending actions</h3>
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

      <div className="bakaloo-command__visual-grid">
        <section className="bakaloo-command__sheet" aria-labelledby="bakaloo-revenue-orders-title">
          <header><div><span className="bakaloo-command__eyebrow">Trading pattern</span><h3 id="bakaloo-revenue-orders-title">Revenue vs orders</h3><p>Both measures derive from the same completed receipt evidence and remain distinct.</p></div></header>
          <RevenueOrdersComparison data={dashboardVisuals.revenueVsOrders} />
        </section>
        <section className="bakaloo-command__sheet" aria-labelledby="bakaloo-orders-hour-title">
          <header><div><span className="bakaloo-command__eyebrow">Checkout pattern</span><h3 id="bakaloo-orders-hour-title">Orders by hour</h3><p>Completed receipt count in India business time.</p></div></header>
          <BarChart title="Orders by hour" data={dashboardVisuals.ordersByHour} formatValue={(value) => `${numberFormatter.format(value)} order${value === 1 ? '' : 's'}`} />
        </section>
      </div>

      <div className="bakaloo-command__work-grid">
        <section className="bakaloo-command__sheet" aria-labelledby="bakaloo-top-products-title">
          <header><div><span className="bakaloo-command__eyebrow">Product demand</span><h3 id="bakaloo-top-products-title">Top products</h3><p>Ranked by completed local receipt value, not an assumed catalogue ranking.</p></div><button type="button" className="bakaloo-command__text-action" onClick={onStock}>Open products <ArrowRight size={15} aria-hidden="true" /></button></header>
          <BarChart title="Top products" data={dashboardVisuals.topProducts} formatValue={(value) => inrFormatter.format(value)} />
        </section>
        <section className="bakaloo-command__sheet bakaloo-command__sheet--orders" aria-labelledby="bakaloo-order-flow-title">
          <header>
            <div>
              <span className="bakaloo-command__eyebrow">Order flow</span>
              <h3 id="bakaloo-order-flow-title">Recent orders</h3>
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

      <div className="bakaloo-command__visual-grid">
        <section className="bakaloo-command__sheet" aria-labelledby="bakaloo-low-stock-title">
          <header><div><span className="bakaloo-command__eyebrow">Inventory risk</span><h3 id="bakaloo-low-stock-title">Low stock alerts</h3><p>Only counter-bin stockouts and released near-expiry batches are surfaced.</p></div><button type="button" className="bakaloo-command__text-action" onClick={onStock}>Review stock <ArrowRight size={15} aria-hidden="true" /></button></header>
          {dashboardVisuals.stockAlerts.length ? <ul className="bakaloo-command__attention-list" aria-label="Low stock alerts">{dashboardVisuals.stockAlerts.map((attention) => <AttentionAction key={attention.id} attention={attention} onCash={onCash} onStock={onStock} onOrders={onOrders} />)}</ul> : <div className="bakaloo-command__empty bakaloo-command__empty--compact"><CheckCircle2 size={20} aria-hidden="true" /><div><strong>No low-stock alert is recorded.</strong><span>Record a governed bin balance or batch expiry before this decision surface changes.</span></div></div>}
        </section>
        <section className="bakaloo-command__sheet bakaloo-command__sheet--map" aria-labelledby="bakaloo-rider-map-title">
          <header><div><span className="bakaloo-command__eyebrow">Delivery evidence</span><h3 id="bakaloo-rider-map-title">Live rider map</h3><p>Coordinates appear only after consent, freshness and evidence checks pass.</p></div><button type="button" className="bakaloo-command__text-action" onClick={onDelivery}>Open delivery <ArrowRight size={15} aria-hidden="true" /></button></header>
          <RetailDeliveryMapSurface signals={revenue.retailDeliveryMapSignals} now={revenue.generatedAt} />
        </section>
      </div>
    </section>
  );
}
