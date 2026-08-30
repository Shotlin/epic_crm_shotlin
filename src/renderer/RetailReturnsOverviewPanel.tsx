import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, ReceiptIndianRupee, RotateCcw, WalletCards } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export interface RetailReturnsOverviewPanelProps {
  revenue: Pick<RevenueOpsSnapshot, 'retailReturns'>;
  onOpenAdvanced: () => void;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/**
 * A read-first return desk for store teams. It deliberately has no write
 * controls: receipt matching, inspection, independent decision and settlement
 * remain together in the governed returns workbench.
 */
export function RetailReturnsOverviewPanel({ revenue, onOpenAdvanced }: RetailReturnsOverviewPanelProps): ReactNode {
  const rows = useMemo(() => [...revenue.retailReturns].sort((left, right) => right.requestedAt.localeCompare(left.requestedAt)), [revenue.retailReturns]);
  const requested = rows.filter((item) => item.status === 'requested');
  const inspected = rows.filter((item) => item.status === 'inspected');
  const approved = rows.filter((item) => item.status === 'approved');
  const openCredit = approved.reduce((sum, item) => sum + (item.financialCredit?.availableAmount ?? 0), 0);
  const metrics = [
    { label: 'Awaiting inspection', value: requested.length, detail: 'receipt and goods check needed', Icon: ClipboardCheck, alert: requested.length > 0 },
    { label: 'Awaiting decision', value: inspected.length, detail: 'independent review required', Icon: AlertTriangle, alert: inspected.length > 0 },
    { label: 'Approved returns', value: approved.length, detail: 'credit evidence frozen', Icon: CheckCircle2, alert: false },
    { label: 'Open return credit', value: inr.format(openCredit), detail: 'not a completed refund', Icon: WalletCards, alert: openCredit > 0 },
  ] as const;

  return <section className="retail-insights-overview" data-testid="retail-returns-overview" aria-labelledby="retail-returns-overview-title">
    <header className="retail-insights-overview__header"><div><span className="eyebrow"><RotateCcw size={14} aria-hidden="true" /> Returns control</span><h1 id="retail-returns-overview-title" className="retail-front-door__title">Resolve a return without losing the original sale.</h1><p>Review what is waiting, then open the accountable workflow to inspect goods, approve credit and settle the right way.</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open returns controls <ArrowRight size={14} aria-hidden="true" /></button></header>
    <div className="retail-insights-overview__metrics" aria-label="Return control summary" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>{metrics.map(({ label, value, detail, Icon, alert }) => <div key={label} data-alert={alert}><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</strong><small>{detail}</small></div>)}</div>
    <div className="retail-insights-overview__grid"><article className="retail-insights-overview__attention"><header><div><span className="eyebrow">Return queue</span><h3>What needs a next step</h3></div><RotateCcw size={18} aria-hidden="true" /></header>{rows.length ? <div className="retail-insights-overview__queue">{rows.slice(0, 8).map((item) => <div key={item.id} data-severity={item.status === 'requested' || item.status === 'inspected' ? 'attention' : undefined}><span>{item.status}</span><strong>{item.number} · {item.retailSaleNumber}</strong><small>{item.reason} · {item.lines.length} line{item.lines.length === 1 ? '' : 's'} · requested {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(item.requestedAt))}</small></div>)}</div> : <div className="retail-insights-overview__empty"><CheckCircle2 size={20} aria-hidden="true" /><strong>No retail return is open</strong><span>A case appears here only after a completed sale is matched to a governed return request.</span></div>}</article><article className="retail-insights-overview__chart"><header><div><span className="eyebrow">Safety sequence</span><h3>Always follow the evidence</h3></div><ReceiptIndianRupee size={18} aria-hidden="true" /></header><div className="retail-insights-overview__queue"><div><span>1</span><strong>Match the original receipt</strong><small>The source sale and line evidence must remain immutable.</small></div><div><span>2</span><strong>Inspect the goods</strong><small>Record outcome, destination bin and condition evidence.</small></div><div><span>3</span><strong>Get an independent decision</strong><small>Approval freezes GST and financial-credit evidence; it does not fabricate a refund.</small></div></div></article></div>
    <footer className="retail-insights-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> This view cannot issue a refund, change stock or approve a return. Those actions remain maker/checker controlled.</footer>
  </section>;
}
