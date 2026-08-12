import {
  ArrowRight,
  Banknote,
  BarChart3,
  CreditCard,
  IndianRupee,
  Landmark,
  Package,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  UsersRound,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import {
  buildIndiaExecutivePulse,
  type ExecutivePulseAction,
  type ExecutivePulseMetric,
  type ExecutivePulseSeverity,
  type ExecutivePulseWorkspace,
} from '../domain/executive-pulse';
import type { DashboardSnapshot } from '../shared/contracts';
import type { KernelSnapshot } from '../shared/kernel-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export interface IndiaExecutiveDashboardProps {
  dashboard: DashboardSnapshot;
  revenue: RevenueOpsSnapshot;
  kernel: KernelSnapshot;
  onNavigate: (workspace: ExecutivePulseWorkspace) => void;
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const compactInrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const workspaceIcons: Record<ExecutivePulseWorkspace, LucideIcon> = {
  command: ShieldCheck,
  sales: TrendingUp,
  finance: Landmark,
  operations: Warehouse,
  people: UsersRound,
  service: Wrench,
  intelligence: Sparkles,
};

const QuickActionIcons = {
  pos: ShoppingCart,
  stock: Package,
  returns: RefreshCcw,
  payments: CreditCard,
  payouts: Banknote,
  reports: BarChart3,
} as const;

function formatMetric(metric: ExecutivePulseMetric): string {
  if (metric.restricted || metric.value === undefined) return 'Restricted';
  if (metric.format === 'currency') return inrFormatter.format(metric.value);
  if (metric.format === 'percentage') return `${metric.value}%`;
  return new Intl.NumberFormat('en-IN').format(metric.value);
}

function formatSignal(value: number | undefined, format: 'number' | 'percentage', restricted: boolean): string {
  if (restricted || value === undefined) return 'Restricted';
  return format === 'percentage'
    ? `${value}%`
    : new Intl.NumberFormat('en-IN').format(value);
}

function severityLabel(severity: ExecutivePulseSeverity): string {
  if (severity === 'critical') return 'Immediate';
  if (severity === 'attention') return 'Attention';
  return 'Review';
}

function actionMeasure(action: ExecutivePulseAction): string {
  if (action.amount !== undefined) return compactInrFormatter.format(action.amount);
  if (action.count !== undefined) return new Intl.NumberFormat('en-IN').format(action.count);
  return 'Open';
}

/**
 * The owner’s compact operating room. It adapts Bakaloo-style decision
 * patterns (live queue, demand ranking, replenishment and activity signals)
 * to actual India-first Epic BOS records and routes every item to its governed
 * source workbench.
 */
export function IndiaExecutiveDashboard({
  dashboard,
  revenue,
  kernel,
  onNavigate,
}: IndiaExecutiveDashboardProps): ReactNode {
  const pulse = useMemo(
    () => buildIndiaExecutivePulse({ dashboard, revenue, kernel }),
    [dashboard, kernel, revenue],
  );
  const largestDemand = Math.max(...pulse.priorityDemand.map(({ value }) => value), 1);
  const generatedAt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  }).format(new Date(pulse.generatedAt));

  return (
    <section className="india-pulse" aria-labelledby="india-pulse-title" data-testid="india-executive-pulse">
      <header className="india-pulse__masthead">
        <div>
          <span className="india-pulse__eyebrow"><span /> India operating pulse</span>
          <h2 id="india-pulse-title">See the business before the business sees you.</h2>
          <p>One accountable view of cash, demand, stock and commitments—drawn only from the workbenches your role can access.</p>
        </div>
        <div className="india-pulse__freshness">
          <span>LIVE LOCAL VIEW</span>
          <strong>{generatedAt} IST</strong>
          <small>{pulse.restrictedMetricCount ? `${pulse.restrictedMetricCount} protected metric${pulse.restrictedMetricCount === 1 ? '' : 's'}` : 'All core metrics available'}</small>
        </div>
      </header>

      {/* Bakaloo-Inspired Ultra-Clean Quick Action Hub */}
      <div className="india-pulse__quick-hub" aria-label="Quick Action Hub">
        <button type="button" className="india-pulse__quick-tile india-pulse__quick-tile--pos" onClick={() => onNavigate('sales')}>
          <div className="india-pulse__quick-badge">01</div>
          <div className="india-pulse__quick-icon"><QuickActionIcons.pos size={20} aria-hidden="true" /></div>
          <div className="india-pulse__quick-text">
            <strong>Counter POS</strong>
            <small>Sell items &amp; print receipt</small>
          </div>
        </button>

        <button type="button" className="india-pulse__quick-tile india-pulse__quick-tile--stock" onClick={() => onNavigate('operations')}>
          <div className="india-pulse__quick-badge">02</div>
          <div className="india-pulse__quick-icon"><QuickActionIcons.stock size={20} aria-hidden="true" /></div>
          <div className="india-pulse__quick-text">
            <strong>Inventory Stock</strong>
            <small>Bins, counts &amp; reorder</small>
          </div>
        </button>

        <button type="button" className="india-pulse__quick-tile india-pulse__quick-tile--returns" onClick={() => onNavigate('sales')}>
          <div className="india-pulse__quick-badge">03</div>
          <div className="india-pulse__quick-icon"><QuickActionIcons.returns size={20} aria-hidden="true" /></div>
          <div className="india-pulse__quick-text">
            <strong>Returns &amp; Exchanges</strong>
            <small>Inspect &amp; replace items</small>
          </div>
        </button>

        <button type="button" className="india-pulse__quick-tile india-pulse__quick-tile--finance" onClick={() => onNavigate('finance')}>
          <div className="india-pulse__quick-badge">04</div>
          <div className="india-pulse__quick-icon"><QuickActionIcons.payments size={20} aria-hidden="true" /></div>
          <div className="india-pulse__quick-text">
            <strong>Collect Payments</strong>
            <small>Customer credit &amp; AR</small>
          </div>
        </button>

        <button type="button" className="india-pulse__quick-tile india-pulse__quick-tile--payouts" onClick={() => onNavigate('finance')}>
          <div className="india-pulse__quick-badge">05</div>
          <div className="india-pulse__quick-icon"><QuickActionIcons.payouts size={20} aria-hidden="true" /></div>
          <div className="india-pulse__quick-text">
            <strong>Vendor Payouts</strong>
            <small>Pay suppliers &amp; TDS</small>
          </div>
        </button>

        <button type="button" className="india-pulse__quick-tile india-pulse__quick-tile--reports" onClick={() => onNavigate('intelligence')}>
          <div className="india-pulse__quick-badge">06</div>
          <div className="india-pulse__quick-icon"><QuickActionIcons.reports size={20} aria-hidden="true" /></div>
          <div className="india-pulse__quick-text">
            <strong>Reports &amp; X/Z</strong>
            <small>Live sales &amp; GST tax</small>
          </div>
        </button>
      </div>

      <div className="india-pulse__metrics" aria-label="Executive business measures">
        {pulse.metrics.map((metric) => {
          const Icon = workspaceIcons[metric.workspace];
          return (
            <button
              className="india-pulse__metric"
              type="button"
              key={metric.id}
              onClick={() => onNavigate(metric.workspace)}
              aria-label={`Open ${metric.label} in ${metric.workspace}`}
              data-restricted={metric.restricted || undefined}
            >
              <span className="india-pulse__metric-icon"><Icon size={17} aria-hidden="true" /></span>
              <span>{metric.label}</span>
              <strong>{formatMetric(metric)}</strong>
              <small>{metric.restricted ? 'Your role can open the source desk, but not this value.' : metric.context}</small>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="india-pulse__decision-grid">
        <article className="india-pulse__sheet india-pulse__demand">
          <header>
            <div>
              <span>DEMAND RADAR</span>
              <h3>Priority commercial opportunities</h3>
            </div>
            <button type="button" onClick={() => onNavigate('sales')}>Open sales <ArrowRight size={14} /></button>
          </header>
          {pulse.priorityDemand.length ? (
            <ol className="india-pulse__demand-list">
              {pulse.priorityDemand.map((opportunity, index) => (
                <li key={opportunity.id}>
                  <span className="india-pulse__rank">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{opportunity.title}</strong>
                    <small>{opportunity.account} · {opportunity.probability}% confidence</small>
                    <i aria-hidden="true"><b style={{ width: `${Math.max(8, (opportunity.value / largestDemand) * 100)}%` }} /></i>
                  </div>
                  <span className="india-pulse__amount" data-health={opportunity.health}>{compactInrFormatter.format(opportunity.value)}</span>
                </li>
              ))}
            </ol>
          ) : <p className="india-pulse__empty">No INR opportunity is currently available in this scope.</p>}
        </article>

        <article className="india-pulse__sheet india-pulse__actions">
          <header>
            <div>
              <span>OWNER QUEUE</span>
              <h3>What needs a decision</h3>
            </div>
            <ShieldCheck size={18} aria-hidden="true" />
          </header>
          {pulse.actions.length ? (
            <div className="india-pulse__action-list">
              {pulse.actions.slice(0, 6).map((action) => {
                const Icon = workspaceIcons[action.workspace];
                return (
                  <button key={action.id} type="button" onClick={() => onNavigate(action.workspace)} data-severity={action.severity}>
                    <span className="india-pulse__action-icon"><Icon size={15} aria-hidden="true" /></span>
                    <span><strong>{action.label}</strong><small>{action.detail}</small></span>
                    <em>{severityLabel(action.severity)}</em>
                    <b>{actionMeasure(action)}</b>
                  </button>
                );
              })}
            </div>
          ) : <p className="india-pulse__empty">No exception is currently projected from the data you can access.</p>}
        </article>
      </div>

      <div className="india-pulse__operations-grid">
        <article className="india-pulse__sheet india-pulse__replenishment">
          <header>
            <div>
              <span>REPLENISHMENT WATCH</span>
              <h3>Stock proposals, not silent stock-outs</h3>
            </div>
            <PackageCheck size={18} aria-hidden="true" />
          </header>
          {pulse.replenishment.length ? (
            <div className="india-pulse__replenishment-list">
              {pulse.replenishment.map((item) => (
                <button key={item.id} type="button" onClick={() => onNavigate('operations')}>
                  <span><strong>{item.itemName}</strong><small>{item.sku} · {item.warehouseName} · required {item.requiredBy}</small></span>
                  <span><b>{new Intl.NumberFormat('en-IN').format(item.availableQuantity)}</b><small>available</small></span>
                  <span><b>+{new Intl.NumberFormat('en-IN').format(item.recommendedQuantity)}</b><small>recommended</small></span>
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : <p className="india-pulse__empty">No governed replenishment proposal is waiting in this scope.</p>}
        </article>

        <article className="india-pulse__sheet india-pulse__signals">
          <header>
            <div>
              <span>OPERATING SIGNALS</span>
              <h3>What is moving now</h3>
            </div>
            <Truck size={18} aria-hidden="true" />
          </header>
          <div className="india-pulse__signal-grid">
            {pulse.liveSignals.map((signal) => {
              const Icon = workspaceIcons[signal.workspace];
              return (
                <button key={signal.id} type="button" onClick={() => onNavigate(signal.workspace)} data-restricted={signal.restricted || undefined}>
                  <Icon size={16} aria-hidden="true" />
                  <span>{signal.label}</span>
                  <strong>{formatSignal(signal.value, signal.format, signal.restricted)}</strong>
                  <small>{signal.restricted ? 'Protected by role policy' : signal.context}</small>
                </button>
              );
            })}
          </div>
        </article>
      </div>

      <footer className="india-pulse__boundary">
        <IndianRupee size={16} aria-hidden="true" />
        <span>INR is the operating default. Export, SEZ and foreign-currency records remain available only through their explicit, evidenced workflows.</span>
      </footer>
    </section>
  );
}
