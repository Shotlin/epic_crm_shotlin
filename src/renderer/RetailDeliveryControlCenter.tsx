import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { toIndiaBusinessDate } from '../shared/india-business-date';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export interface RetailDeliveryControlCenterProps {
  /**
   * Local governed records only. This panel deliberately does not imply live
   * carrier GPS, routing, or customer-facing ETA data.
   */
  revenue: RevenueOpsSnapshot;
  onOpenFulfilment: () => void;
  onOpenServiceability: () => void;
  onOpenCodCustody: () => void;
  onOpenReconciliation: () => void;
}

type DeliveryPromiseStatus = RevenueOpsSnapshot['deliveryPromises'][number]['status'];

const numberFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

function formatIndiaDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(parsed);
}

function humanize(value: string): string {
  return value.replaceAll('-', ' ');
}

function safeIndiaBusinessDate(value: string): string | undefined {
  try {
    return toIndiaBusinessDate(value);
  } catch {
    return undefined;
  }
}

function PromiseStatusCard({
  status,
  label,
  count,
  detail,
}: {
  status: DeliveryPromiseStatus | 'attention';
  label: string;
  count: number;
  detail: string;
}): ReactNode {
  const Icon = status === 'fulfilled' ? CheckCircle2 : status === 'attention' ? ClipboardCheck : Truck;

  return (
    <article className="bakaloo-delivery__status-card" data-status={status}>
      <span className="bakaloo-delivery__status-icon"><Icon size={17} aria-hidden="true" /></span>
      <strong>{numberFormatter.format(count)}</strong>
      <h3>{label}</h3>
      <p>{detail}</p>
    </article>
  );
}

/**
 * Retail delivery is a controlled fulfilment view, not a simulated map. It
 * presents only promises, custody evidence, policy rules and online
 * exceptions already available in the local RevenueOpsSnapshot.
 */
export function RetailDeliveryControlCenter({
  revenue,
  onOpenFulfilment,
  onOpenServiceability,
  onOpenCodCustody,
  onOpenReconciliation,
}: RetailDeliveryControlCenterProps): ReactNode {
  const today = safeIndiaBusinessDate(revenue.generatedAt);
  const ordersById = useMemo(
    () => new Map(revenue.salesOrders.map((order) => [order.id, order.number])),
    [revenue.salesOrders],
  );
  const activePromises = revenue.deliveryPromises.filter(({ status }) => status === 'active');
  const fulfilledPromises = revenue.deliveryPromises.filter(({ status }) => status === 'fulfilled');
  const retiredPromises = revenue.deliveryPromises.filter(({ status }) => status === 'superseded' || status === 'cancelled');
  const pastWindowPromises = today
    ? activePromises.filter((promise) => promise.deliveryTo < today)
    : [];
  const movingPackages = revenue.shipmentPackages.filter(({ status }) => (
    status === 'ready-to-dispatch' || status === 'dispatched' || status === 'in-transit'
  ));
  const activeServiceabilityRules = revenue.pincodeServiceabilityRules.filter((rule) => (
    rule.status === 'active' && rule.serviceable
  ));
  const codEnabledRules = activeServiceabilityRules.filter(({ codAllowed }) => codAllowed);
  const openCodCases = revenue.codCollectionCases.filter(({ status }) => ![
    'bank-matched', 'cancelled', 'refused-rto',
  ].includes(status));
  const returnWorkflowCount = revenue.returnAuthorizations.filter(({ status }) => (
    status === 'requested' || status === 'approved' || status === 'received'
  )).length;
  const rtoOrderCount = revenue.retailCommerceOrders.filter(({ status }) => status === 'rto').length;
  const openCommerceConflicts = revenue.retailCommerceConflictResolutions.filter(({ status }) => status === 'prepared');
  const failedSyncs = revenue.retailCommerceSyncRuns.filter(({ status }) => (
    status === 'failed' || status === 'completed-with-exceptions'
  ));
  const visiblePromises = [...revenue.deliveryPromises]
    .filter(({ status }) => status === 'active' || status === 'fulfilled')
    .sort((left, right) => {
      const statusPriority = Number(right.status === 'active') - Number(left.status === 'active');
      if (statusPriority !== 0) return statusPriority;
      return `${left.deliveryTo}:${left.id}`.localeCompare(`${right.deliveryTo}:${right.id}`);
    })
    .slice(0, 5);

  return (
    <section className="bakaloo-delivery" aria-labelledby="bakaloo-delivery-title" data-testid="retail-delivery-control-center">
      <header className="bakaloo-delivery__header">
        <div>
          <span className="bakaloo-delivery__eyebrow">Retail fulfilment</span>
          <h2 id="bakaloo-delivery-title">Delivery control, without guesswork.</h2>
          <p>Follow recorded Indian PIN policies, delivery commitments, packages, COD custody, returns, and online-order exceptions from one clear view.</p>
        </div>
        <div className="bakaloo-delivery__boundary" role="note">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>Local policy and evidence only. Live carrier maps, GPS and route ETAs are not shown until a certified provider supplies them.</span>
        </div>
      </header>

      <div className="bakaloo-delivery__status-grid" aria-label="Delivery promise status">
        <PromiseStatusCard
          status="active"
          label="Active promises"
          count={activePromises.length}
          detail={activePromises.length ? 'Customer commitments still awaiting fulfilment evidence.' : 'No active customer delivery commitments.'}
        />
        <PromiseStatusCard
          status="fulfilled"
          label="Fulfilled promises"
          count={fulfilledPromises.length}
          detail={fulfilledPromises.length ? 'Commitments marked fulfilled with local evidence.' : 'No fulfilled delivery commitments yet.'}
        />
        <PromiseStatusCard
          status="cancelled"
          label="Cancelled or replaced"
          count={retiredPromises.length}
          detail={retiredPromises.length ? 'Preserved history; these are not active delivery work.' : 'No cancelled or replaced commitments.'}
        />
        <PromiseStatusCard
          status="attention"
          label="Past recorded window"
          count={pastWindowPromises.length}
          detail={pastWindowPromises.length ? 'Review the package or promise evidence before contacting the customer.' : 'No active promise is past its recorded window.'}
        />
      </div>

      <div className="bakaloo-delivery__grid">
        <article className="bakaloo-delivery__panel" aria-labelledby="bakaloo-delivery-promises-title">
          <header className="bakaloo-delivery__panel-header">
            <div>
              <span className="bakaloo-delivery__eyebrow">Promise queue</span>
              <h3 id="bakaloo-delivery-promises-title">What is due next</h3>
            </div>
            <button type="button" className="bakaloo-delivery__text-action" onClick={onOpenFulfilment}>
              Open fulfilment <ArrowRight size={15} aria-hidden="true" />
            </button>
          </header>
          {visiblePromises.length ? (
            <ol className="bakaloo-delivery__promise-list">
              {visiblePromises.map((promise) => (
                <li key={promise.id} data-status={promise.status}>
                  <span className="bakaloo-delivery__promise-icon"><Truck size={16} aria-hidden="true" /></span>
                  <div>
                    <strong>{ordersById.get(promise.salesOrderId) ?? promise.salesOrderId}</strong>
                    <span>{promise.shipToAddress.city} {promise.shipToAddress.postalCode} · {humanize(promise.serviceLevel)} · {promise.paymentMode.toUpperCase()}</span>
                  </div>
                  <small>{promise.status === 'active' ? `By ${formatIndiaDate(promise.deliveryTo)}` : `Fulfilled ${formatIndiaDate(promise.fulfilledAt?.slice(0, 10) ?? promise.deliveryTo)}`}</small>
                </li>
              ))}
            </ol>
          ) : (
            <div className="bakaloo-delivery__empty">
              <Truck size={20} aria-hidden="true" />
              <div>
                <strong>No delivery promises yet.</strong>
                <span>Start with a valid goods order, a customer address and an active PIN-code policy.</span>
              </div>
            </div>
          )}
        </article>

        <article className="bakaloo-delivery__panel bakaloo-delivery__panel--actions" aria-labelledby="bakaloo-delivery-actions-title">
          <header className="bakaloo-delivery__panel-header">
            <div>
              <span className="bakaloo-delivery__eyebrow">Control points</span>
              <h3 id="bakaloo-delivery-actions-title">Open the right desk</h3>
            </div>
          </header>
          <div className="bakaloo-delivery__action-list">
            <button type="button" onClick={onOpenServiceability}>
              <ShieldCheck size={18} aria-hidden="true" />
              <span><strong>PIN-code serviceability</strong><small>{numberFormatter.format(activeServiceabilityRules.length)} active rule{activeServiceabilityRules.length === 1 ? '' : 's'}; {numberFormatter.format(codEnabledRules.length)} allow COD.</small></span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button type="button" onClick={onOpenCodCustody}>
              <Banknote size={18} aria-hidden="true" />
              <span><strong>COD custody</strong><small>{numberFormatter.format(openCodCases.length)} case{openCodCases.length === 1 ? '' : 's'} not yet bank-matched, cancelled, or refused-RTO.</small></span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button type="button" onClick={onOpenFulfilment}>
              <PackageCheck size={18} aria-hidden="true" />
              <span><strong>Packages and handoff</strong><small>{numberFormatter.format(movingPackages.length)} package{movingPackages.length === 1 ? '' : 's'} ready, dispatched, or in transit.</small></span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button type="button" onClick={onOpenReconciliation}>
              <RotateCcw size={18} aria-hidden="true" />
              <span><strong>Returns, RTO and online exceptions</strong><small>{numberFormatter.format(returnWorkflowCount)} return workflow{returnWorkflowCount === 1 ? '' : 's'}, {numberFormatter.format(rtoOrderCount)} RTO order{rtoOrderCount === 1 ? '' : 's'}, and {numberFormatter.format(openCommerceConflicts.length)} conflict decision{openCommerceConflicts.length === 1 ? '' : 's'} pending.</small></span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          {failedSyncs.length ? (
            <p className="bakaloo-delivery__exception" role="status"><RefreshCw size={15} aria-hidden="true" /> {numberFormatter.format(failedSyncs.length)} online sync run{failedSyncs.length === 1 ? '' : 's'} needs evidence or exception review.</p>
          ) : null}
        </article>
      </div>
    </section>
  );
}
