import { AlertTriangle, CheckCircle2, Clock3, MapPin, PackageCheck, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import { computeRetailDeliveryOverview } from '../domain/retail-delivery-overview';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

const dateFormatter = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });

export function RetailDeliveryOverviewPanel({ revenue, onOpenAdvanced }: { revenue: RevenueOpsSnapshot; onOpenAdvanced: () => void }): ReactNode {
  const report = computeRetailDeliveryOverview({ ...revenue, now: revenue.generatedAt });
  const cards = [
    ['Due today', report.summary.dueTodayPromises, Clock3, 'blue'],
    ['Dispatch queue', report.summary.dispatchBacklog, PackageCheck, 'blue'],
    ['In transit', report.summary.inTransit, Truck, 'blue'],
    ['COD to evidence', report.summary.codOpen, ShieldCheck, report.summary.codAttention ? 'amber' : 'blue'],
  ] as const;
  return <section className="retail-delivery-overview" data-testid="retail-delivery-overview" aria-labelledby="retail-delivery-overview-title">
    <header className="retail-delivery-overview__header"><div><span className="eyebrow"><Truck size={14} aria-hidden="true" /> Deliver / Control</span><h2 id="retail-delivery-overview-title">Keep every promise visible</h2><p>Commitments, dispatch custody, COD, and returns are shown from Epic BOS evidence. Carrier GPS and live ETA are intentionally not inferred.</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open delivery controls <Truck size={14} aria-hidden="true" /></button></header>
    <div className="retail-delivery-overview__cards" aria-label="Delivery control summary">{cards.map(([label, value, Icon, tone]) => <div key={label} data-tone={tone}><Icon size={16} aria-hidden="true" /><span>{label}</span><strong>{value}</strong></div>)}</div>
    {report.attention.length ? <div className="retail-delivery-overview__attention" role="status"><AlertTriangle size={16} aria-hidden="true" /><div><strong>Review before promising more</strong><p>{report.attention.join(' · ')}</p></div></div> : <div className="retail-delivery-overview__clear"><CheckCircle2 size={16} aria-hidden="true" /><span>No delivery exception is recorded in this local view.</span></div>}
    <div className="retail-delivery-overview__lower"><div><header><div><span className="eyebrow">Promise calendar</span><h3>Next customer commitments</h3></div><span>{report.summary.activePromises} active</span></header>{report.promiseRows.slice(0, 6).map((row) => <div className="retail-delivery-overview__promise" key={row.id} data-state={row.state}><span>{row.state === 'overdue' ? <AlertTriangle size={14} /> : <Clock3 size={14} />}</span><div><strong>{row.orderNumber}</strong><small>{row.paymentMode === 'cod' ? 'COD' : 'Prepaid'} · deliver by {dateFormatter.format(new Date(row.deliveryTo))}</small></div><em>{row.state.replace('-', ' ')}</em></div>)}{!report.promiseRows.length ? <p className="bharat-empty"><Clock3 size={18} />No active delivery promises are recorded.</p> : null}</div><aside><header><div><span className="eyebrow">Serviceability</span><h3>Can we promise?</h3></div><MapPin size={17} /></header><strong>{report.summary.serviceablePincodes}</strong><p>active pincode policies</p><small>Policy evidence only. Carrier coverage and route ETA still require certified provider data.</small><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Review policy and custody <RotateCcw size={14} /></button></aside></div>
    <footer className="retail-delivery-overview__footer"><ShieldCheck size={14} aria-hidden="true" /> Last local evidence read {dateFormatter.format(new Date(report.generatedAt))}. Nothing here writes to Bakaloo or a carrier.</footer>
  </section>;
}
