import { ArrowRight, CheckCircle2, FileCheck2, FileWarning, ReceiptText, ShieldCheck } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export interface RetailGstOverviewPanelProps {
  revenue: Pick<RevenueOpsSnapshot, 'invoices' | 'creditDebitNotes' | 'gstRegistrations'>;
  onOpenAdvanced: () => void;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const reviewStatuses = new Set(['required-review', 'ready-to-report', 'failed']);

/** Read-only GST evidence for a store. A portal result is never inferred here. */
export function RetailGstOverviewPanel({ revenue, onOpenAdvanced }: RetailGstOverviewPanelProps): ReactNode {
  const issued = useMemo(() => revenue.invoices.filter((invoice) => ['issued', 'partially-paid', 'paid', 'written-off'].includes(invoice.status)), [revenue.invoices]);
  const outputTax = issued.reduce((sum, invoice) => sum + invoice.taxPreview.totalTax, 0);
  const irpReview = issued.filter((invoice) => reviewStatuses.has(invoice.irpStatus));
  const activeRegistrations = revenue.gstRegistrations.filter((registration) => registration.active);
  const notes = revenue.creditDebitNotes.filter((note) => note.type === 'credit');
  const metrics = [
    { label: 'Issued invoices', value: issued.length, detail: 'local invoice evidence', Icon: ReceiptText, alert: false },
    { label: 'Output GST', value: inr.format(outputTax), detail: 'issued invoices only', Icon: ShieldCheck, alert: false },
    { label: 'IRP needs review', value: irpReview.length, detail: 'not a portal status claim', Icon: FileWarning, alert: irpReview.length > 0 },
    { label: 'Credit notes', value: notes.length, detail: 'controlled adjustment evidence', Icon: FileCheck2, alert: false },
  ] as const;

  return <section className="retail-insights-overview" data-testid="retail-gst-overview" aria-labelledby="retail-gst-overview-title">
    <header className="retail-insights-overview__header"><div><span className="eyebrow"><ShieldCheck size={14} aria-hidden="true" /> GST & invoice evidence</span><h1 id="retail-gst-overview-title" className="retail-front-door__title">Keep GST evidence ready. Do not guess portal truth.</h1><p>Review recorded invoices, credit notes and registrations before opening statutory controls.</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open GST controls <ArrowRight size={14} aria-hidden="true" /></button></header>
    <div className="retail-insights-overview__metrics" aria-label="GST evidence summary" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>{metrics.map(({ label, value, detail, Icon, alert }) => <div key={label} data-alert={alert}><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</strong><small>{detail}</small></div>)}</div>
    <div className="retail-insights-overview__grid"><article className="retail-insights-overview__attention"><header><div><span className="eyebrow">Invoice review</span><h3>What needs a statutory decision</h3></div><FileWarning size={18} aria-hidden="true" /></header>{irpReview.length ? <div className="retail-insights-overview__queue">{irpReview.slice(0, 8).map((invoice) => <div key={invoice.id} data-severity="attention"><span>{invoice.irpStatus.replaceAll('-', ' ')}</span><strong>{invoice.number}</strong><small>{inr.format(invoice.taxPreview.grandTotal)} · tax {inr.format(invoice.taxPreview.totalTax)} · dated {invoice.invoiceDate}</small></div>)}</div> : <div className="retail-insights-overview__empty"><CheckCircle2 size={20} aria-hidden="true" /><strong>No issued invoice needs a local IRP review</strong><span>This means only that the local evidence has no review marker; it does not confirm an external portal result.</span></div>}</article><article className="retail-insights-overview__chart"><header><div><span className="eyebrow">Registration scope</span><h3>Active GST registrations</h3></div><FileCheck2 size={18} aria-hidden="true" /></header>{activeRegistrations.length ? <div className="retail-insights-overview__queue">{activeRegistrations.map((registration) => <div key={registration.id}><span>State {registration.stateCode} · branch {registration.branchCode}</span><strong>{registration.label}</strong><small>{registration.gstin} · {registration.primary ? 'primary registration' : 'additional registration'}</small></div>)}</div> : <div className="retail-insights-overview__empty"><FileWarning size={20} aria-hidden="true" /><strong>No active GST registration is recorded</strong><span>Configure the legal registration before issuing a governed tax invoice.</span></div>}</article></div>
    <footer className="retail-insights-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> This view does not file, submit, acknowledge or reconcile GST with a government portal.</footer>
  </section>;
}
