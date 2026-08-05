import {
  ArrowRight,
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
import { computeRetailCommandCenter } from '../domain/retail-command-center';
import { toIndiaBusinessDate } from '../shared/india-business-date';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { DonutChart, TrendLineChart, type ChartDatum } from './ExecutiveCharts';

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
  title: string;
  value: string;
  detail: string;
  actionLabel: string;
  onOpen: () => void;
  emphasis?: 'attention' | 'positive';
}

interface SetupStep {
  id: string;
  title: string;
  detail: string;
  ready: boolean;
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

const channelLabels = {
  marketplace: 'Marketplace',
  ondc: 'ONDC',
  website: 'Website',
  whatsapp: 'WhatsApp',
} as const;

function safeIndiaBusinessDate(value: string): string | undefined {
  try {
    return toIndiaBusinessDate(value);
  } catch {
    return undefined;
  }
}

function MetricCard({
  icon: Icon,
  title,
  value,
  detail,
  actionLabel,
  onOpen,
  emphasis,
}: MetricCardProps): ReactNode {
  return (
    <article className="bakaloo-command__metric" data-emphasis={emphasis}>
      <div className="bakaloo-command__metric-heading">
        <span className="bakaloo-command__metric-icon"><Icon size={18} aria-hidden="true" /></span>
        <h3>{title}</h3>
      </div>
      <strong className="bakaloo-command__metric-value">{value}</strong>
      <p>{detail}</p>
      <button type="button" className="bakaloo-command__card-action" onClick={onOpen}>
        {actionLabel} <ArrowRight size={15} aria-hidden="true" />
      </button>
    </article>
  );
}

/**
 * A retailer-first command centre that intentionally uses only local,
 * governed records. It gives a new operator clear, small next actions while
 * retaining one route to each existing retail workbench.
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

  const todaySales = useMemo(() => {
    const completed = today
      ? revenue.retailSales.filter((sale) => sale.status === 'completed' && safeIndiaBusinessDate(sale.saleAt) === today)
      : [];
    return {
      count: completed.length,
      total: completed.reduce((sum, sale) => sum + sale.taxPreview.grandTotal, 0),
    };
  }, [revenue.retailSales, today]);

  const activePromises = revenue.deliveryPromises.filter((promise) => promise.status === 'active');
  const overduePromises = today
    ? activePromises.filter((promise) => promise.deliveryTo < today)
    : [];
  const stockAttentionCount = command.totalStockoutCount + command.totalExpiryRiskItemsCount;
  const loyaltyPoints = revenue.retailLoyaltyAccounts.reduce((sum, account) => sum + account.pointsBalance, 0);
  const configuredConnectors = revenue.retailCommerceConnectors.filter((connector) => (
    connector.status === 'configured' || connector.status === 'certified'
  )).length;
  const setupSteps: SetupStep[] = [
    {
      id: 'counter',
      title: 'Set up a counter',
      detail: revenue.retailCounters.length
        ? `${numberFormatter.format(revenue.retailCounters.length)} counter${revenue.retailCounters.length === 1 ? '' : 's'} configured.`
        : 'Set up a counter to begin selling.',
      ready: revenue.retailCounters.length > 0,
    },
    {
      id: 'catalog',
      title: 'Add products',
      detail: revenue.products.length
        ? `${numberFormatter.format(revenue.products.length)} product${revenue.products.length === 1 ? '' : 's'} in the catalog.`
        : 'Add products and a price before the first sale.',
      ready: revenue.products.length > 0,
    },
    {
      id: 'channel',
      title: 'Connect online selling',
      detail: configuredConnectors
        ? `${numberFormatter.format(configuredConnectors)} connector${configuredConnectors === 1 ? '' : 's'} configured locally.`
        : 'Connect a channel only when its credentials and evidence are ready.',
      ready: configuredConnectors > 0,
    },
    {
      id: 'customers',
      title: 'Start customer loyalty',
      detail: revenue.retailLoyaltyAccounts.length
        ? `${numberFormatter.format(revenue.retailLoyaltyAccounts.length)} loyalty member${revenue.retailLoyaltyAccounts.length === 1 ? '' : 's'} recorded.`
        : 'Add a named customer to start loyalty safely.',
      ready: revenue.retailLoyaltyAccounts.length > 0,
    },
  ];
  const channelTotal = Math.max(command.onlinePendingOrdersCount, 1);
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

  return (
    <section className="bakaloo-command" aria-labelledby="bakaloo-command-title" data-testid="bakaloo-retail-command-center">
      <header className="bakaloo-command__header">
        <div className="bakaloo-command__header-copy">
          <span className="bakaloo-command__eyebrow">Retail command centre</span>
          <h2 id="bakaloo-command-title">Your store, made simple.</h2>
          <p>See what needs doing now: sell, pack, restock, deliver, close cash, and look after customers.</p>
        </div>
        <div className="bakaloo-command__scope" aria-label="Current scope">
          <Store size={18} aria-hidden="true" />
          <span>Local retail view</span>
          <small>All money is shown in INR</small>
        </div>
      </header>

      <div className="bakaloo-command__metrics" aria-label="Retail activities">
        <MetricCard
          icon={IndianRupee}
          title="Today’s sales"
          value={inrFormatter.format(todaySales.total)}
          detail={todaySales.count
            ? `${numberFormatter.format(todaySales.count)} completed sale${todaySales.count === 1 ? '' : 's'} recorded today.`
            : 'No completed sales recorded today.'}
          actionLabel="Open POS"
          onOpen={onPos}
          emphasis={todaySales.count ? 'positive' : undefined}
        />
        <MetricCard
          icon={ShoppingBag}
          title="Orders to pack"
          value={numberFormatter.format(command.onlinePendingOrdersCount)}
          detail={command.onlinePendingOrdersCount
            ? `${inrFormatter.format(command.onlinePendingOrderValue)} waiting for confirmation or fulfilment.`
            : 'No online orders are waiting to be packed.'}
          actionLabel="Open orders"
          onOpen={onOrders}
          emphasis={command.onlinePendingOrdersCount ? 'attention' : undefined}
        />
        <MetricCard
          icon={PackageSearch}
          title="Stock to check"
          value={numberFormatter.format(stockAttentionCount)}
          detail={stockAttentionCount
            ? `${command.totalStockoutCount} stockout${command.totalStockoutCount === 1 ? '' : 's'} and ${command.totalExpiryRiskItemsCount} expiry risk${command.totalExpiryRiskItemsCount === 1 ? '' : 's'} recorded.`
            : 'No stock exceptions recorded in this retail view.'}
          actionLabel="Review stock"
          onOpen={onStock}
          emphasis={stockAttentionCount ? 'attention' : undefined}
        />
        <MetricCard
          icon={Truck}
          title="Delivery watch"
          value={numberFormatter.format(activePromises.length)}
          detail={overduePromises.length
            ? `${numberFormatter.format(overduePromises.length)} promise${overduePromises.length === 1 ? '' : 's'} past the recorded delivery date.`
            : activePromises.length
              ? `${numberFormatter.format(activePromises.length)} active delivery promise${activePromises.length === 1 ? '' : 's'} to follow.`
              : 'No active delivery promises recorded.'}
          actionLabel="Open delivery"
          onOpen={onDelivery}
          emphasis={overduePromises.length ? 'attention' : undefined}
        />
        <MetricCard
          icon={PackageCheck}
          title="Cash to close"
          value={numberFormatter.format(command.activeCashierShiftsCount)}
          detail={command.unresolvedVarianceCount
            ? `${numberFormatter.format(command.unresolvedVarianceCount)} drawer variance${command.unresolvedVarianceCount === 1 ? '' : 's'} need review.`
            : command.activeCashierShiftsCount
              ? `${numberFormatter.format(command.activeCashierShiftsCount)} open cash shift${command.activeCashierShiftsCount === 1 ? '' : 's'} recorded.`
              : 'No cash shift is open.'}
          actionLabel="Close cash"
          onOpen={onCash}
          emphasis={command.unresolvedVarianceCount ? 'attention' : undefined}
        />
        <MetricCard
          icon={Users}
          title="Customers & loyalty"
          value={numberFormatter.format(revenue.retailLoyaltyAccounts.length)}
          detail={revenue.retailLoyaltyAccounts.length
            ? `${numberFormatter.format(loyaltyPoints)} loyalty point${loyaltyPoints === 1 ? '' : 's'} available to customers.`
            : 'No loyalty members recorded yet.'}
          actionLabel="Open customers"
          onOpen={onCustomers}
          emphasis={revenue.retailLoyaltyAccounts.length ? 'positive' : undefined}
        />
      </div>

      <div className="bakaloo-command__work-grid">
        <article className="bakaloo-command__sheet bakaloo-command__sheet--channels" aria-labelledby="bakaloo-command-channels-title">
          <header>
            <div>
              <span className="bakaloo-command__eyebrow">Unified order queue</span>
              <h3 id="bakaloo-command-channels-title">One queue for every online channel</h3>
              <p>Orders stay visible by source before stock is reserved or fulfilment is confirmed.</p>
            </div>
            <button type="button" className="bakaloo-command__text-action" onClick={onOrders}>
              View order queue <ArrowRight size={15} aria-hidden="true" />
            </button>
          </header>
          {command.onlinePendingOrdersCount ? (
            <ul className="bakaloo-command__channel-list" aria-label="Pending online orders by channel">
              {Object.entries(command.channelPendingOrders).map(([channel, queue]) => {
                const width = Math.max(0, Math.min(100, (queue.count / channelTotal) * 100));
                return (
                  <li key={channel}>
                    <div>
                      <strong>{channelLabels[channel as keyof typeof channelLabels]}</strong>
                      <span>{numberFormatter.format(queue.count)} order{queue.count === 1 ? '' : 's'} · {inrFormatter.format(queue.value)}</span>
                    </div>
                    <span className="bakaloo-command__channel-progress" aria-hidden="true"><b data-empty={queue.count === 0 ? 'true' : undefined} style={{ width: `${width}%` }} /></span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="bakaloo-command__empty">
              <ShoppingBag size={20} aria-hidden="true" />
              <div><strong>Your online queue is clear.</strong><span>Connect a channel when you are ready to bring online orders into the same stock view.</span></div>
            </div>
          )}
        </article>

        <article className="bakaloo-command__sheet bakaloo-command__sheet--setup" aria-labelledby="bakaloo-command-setup-title">
          <header>
            <div>
              <span className="bakaloo-command__eyebrow">Start here</span>
              <h3 id="bakaloo-command-setup-title">A simple retail setup checklist</h3>
              <p>Complete the basics in order. Nothing is assumed or switched on silently.</p>
            </div>
            <button type="button" className="bakaloo-command__text-action" onClick={onSetup}>
              Open setup <ArrowRight size={15} aria-hidden="true" />
            </button>
          </header>
          <ol className="bakaloo-command__setup-list">
            {setupSteps.map((step, index) => {
              const StatusIcon = step.ready ? PackageCheck : PackageSearch;
              return (
                <li key={step.id} data-ready={step.ready}>
                  <span className="bakaloo-command__setup-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="bakaloo-command__setup-state" aria-label={step.ready ? 'Ready' : 'Needs setup'}>
                    <StatusIcon size={16} aria-hidden="true" />
                  </span>
                  <div><strong>{step.title}</strong><small>{step.detail}</small></div>
                </li>
              );
            })}
          </ol>
        </article>
      </div>
      <section className="epic-visual-analytics" aria-labelledby="command-visual-analytics-title"><header className="epic-visual-analytics__header"><div><span className="bakaloo-command__eyebrow">Store pulse</span><h3 id="command-visual-analytics-title">Sales and tender at a glance</h3><p>Only completed local sales are shown. Empty visuals stay empty until your store has governed records.</p></div></header><div className="epic-visual-analytics__grid"><TrendLineChart title="Sales by recorded day" data={chartData.trend} formatValue={(value) => inrFormatter.format(value)} /><DonutChart title="Tender mix" data={chartData.tenderSplit} formatValue={(value) => inrFormatter.format(value)} /></div></section>
    </section>
  );
}
