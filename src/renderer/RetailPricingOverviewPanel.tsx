import { ArrowRight, BadgeIndianRupee, CheckCircle2, CircleAlert, FileText, Tags } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export interface RetailPricingOverviewPanelProps {
  revenue: Pick<RevenueOpsSnapshot, 'generatedAt' | 'products' | 'priceLists' | 'priceListEntries' | 'discountPolicies' | 'taxCodes'>;
  onOpenAdvanced: () => void;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function effectiveOn(from: string, to: string | undefined, date: string): boolean {
  return from <= date && (!to || to >= date);
}

/** A read-first shelf-price desk. Commercial changes stay approval-gated. */
export function RetailPricingOverviewPanel({ revenue, onOpenAdvanced }: RetailPricingOverviewPanelProps): ReactNode {
  const today = revenue.generatedAt.slice(0, 10);
  const products = useMemo(() => new Map(revenue.products.map((product) => [product.id, product])), [revenue.products]);
  const activeLists = useMemo(() => revenue.priceLists.filter((list) => list.active && list.status === 'active' && effectiveOn(list.effectiveFrom, list.effectiveTo, today)), [revenue.priceLists, today]);
  const activeListIds = useMemo(() => new Set(activeLists.map((list) => list.id)), [activeLists]);
  const activeEntries = useMemo(() => revenue.priceListEntries.filter((entry) => activeListIds.has(entry.priceListId) && effectiveOn(entry.effectiveFrom, entry.effectiveTo, today)), [activeListIds, revenue.priceListEntries, today]);
  const activePolicies = useMemo(() => revenue.discountPolicies.filter((policy) => policy.active && effectiveOn(policy.effectiveFrom, policy.effectiveTo, today)), [revenue.discountPolicies, today]);
  const pendingLists = revenue.priceLists.filter((list) => list.status === 'submitted').length;
  const unpricedProducts = revenue.products.filter((product) => product.active && !activeEntries.some((entry) => entry.productId === product.id)).length;
  const metrics = [
    { label: 'Active price books', value: activeLists.length, detail: pendingLists ? `${pendingLists} awaiting approval` : 'all currently approved', Icon: BadgeIndianRupee, alert: pendingLists > 0 },
    { label: 'Price-ready products', value: new Set(activeEntries.map((entry) => entry.productId)).size, detail: `${activeEntries.length} active price tier${activeEntries.length === 1 ? '' : 's'}`, Icon: Tags, alert: false },
    { label: 'Active offers', value: activePolicies.length, detail: 'effective on the selected retail date', Icon: CheckCircle2, alert: false },
    { label: 'Missing shelf price', value: unpricedProducts, detail: unpricedProducts ? 'active products need a price tier' : 'no gap found', Icon: CircleAlert, alert: unpricedProducts > 0 },
  ] as const;

  return <section className="retail-insights-overview" data-testid="retail-pricing-overview" aria-labelledby="retail-pricing-overview-title">
    <header className="retail-insights-overview__header"><div><span className="eyebrow"><BadgeIndianRupee size={14} aria-hidden="true" /> Product & pricing</span><h1 id="retail-pricing-overview-title" className="retail-front-door__title">Price clearly. Protect margin. Keep GST evidence attached.</h1><p>See approved shelf-price readiness and active offer policy before opening the controlled commercial editor.</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open pricing controls <ArrowRight size={14} aria-hidden="true" /></button></header>
    <div className="retail-insights-overview__metrics" aria-label="Pricing readiness" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>{metrics.map(({ label, value, detail, Icon, alert }) => <div key={label} data-alert={alert}><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{value.toLocaleString('en-IN')}</strong><small>{detail}</small></div>)}</div>
    <div className="retail-insights-overview__grid"><article className="retail-insights-overview__attention"><header><div><span className="eyebrow">Shelf-price evidence</span><h3>Currently active tiers</h3></div><Tags size={18} aria-hidden="true" /></header>{activeEntries.length ? <div className="retail-insights-overview__queue">{activeEntries.slice(0, 8).map((entry) => <div key={entry.id}><span>{activeLists.find((list) => list.id === entry.priceListId)?.channel ?? 'retail'} · {entry.taxMode ?? 'exclusive'} tax</span><strong>{products.get(entry.productId)?.name ?? entry.productId}</strong><small>{inr.format(entry.unitPrice)} · minimum quantity {entry.minimumQuantity.toLocaleString('en-IN')}</small></div>)}</div> : <div className="retail-insights-overview__empty"><CircleAlert size={20} aria-hidden="true" /><strong>No active shelf price is recorded</strong><span>A product appears here only after an approved price book and effective price tier are present.</span></div>}</article><article className="retail-insights-overview__chart"><header><div><span className="eyebrow">Offer policy</span><h3>What can apply today</h3></div><FileText size={18} aria-hidden="true" /></header>{activePolicies.length ? <div className="retail-insights-overview__queue">{activePolicies.slice(0, 6).map((policy) => <div key={policy.id}><span>{policy.promotionType ?? 'discount'} · {policy.scope}</span><strong>{policy.name}</strong><small>{policy.method === 'percentage' ? `${policy.value}%` : inr.format(policy.value)} · cap {inr.format(policy.maximumDiscountAmount)} · {policy.stackable ? 'stackable' : 'not stackable'}</small></div>)}</div> : <div className="retail-insights-overview__empty"><CheckCircle2 size={20} aria-hidden="true" /><strong>No active offer policy is recorded</strong><span>Promotions appear only when their effective date and approval state allow checkout use.</span></div>}</article></div>
    <footer className="retail-insights-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> This desk cannot change a price, discount or GST rule. Those changes remain approval-gated and effective-dated.</footer>
  </section>;
}
