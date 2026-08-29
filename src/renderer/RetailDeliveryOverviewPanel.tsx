import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, MapPin, PackageCheck, Radio, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { computeRetailDeliveryOverview } from '../domain/retail-delivery-overview';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailCoverageMapSurface } from './RetailCoverageMapSurface';
import { RetailDeliveryMapSurface } from './RetailDeliveryMapSurface';
import type { RetailHubCoverageMap } from '../shared/retail-hub-coverage-map-contracts';

const dateFormatter = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function formatEvidenceDate(value: string | undefined): string {
  if (!value) return 'time unavailable';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'time unavailable' : dateFormatter.format(parsed);
}

export interface RetailDeliveryOverviewPanelProps {
  revenue: RevenueOpsSnapshot;
  onOpenAdvanced: () => void;
  coverageMap?: RetailHubCoverageMap;
  coverageMapBusy?: boolean;
  coverageMapError?: string;
  onFetchCoverageMap?: (input: { baseUrl: string; shopId: string }) => Promise<void>;
}

/**
 * The dispatch-manager front door deliberately makes uncertainty visible.
 * It renders only local delivery evidence or an explicitly labelled Hub snapshot;
 * it never manufactures a rider route, ETA, or customer map pin.
 */
export function RetailDeliveryOverviewPanel({
  revenue,
  onOpenAdvanced,
  coverageMap,
  coverageMapBusy = false,
  coverageMapError,
  onFetchCoverageMap,
}: RetailDeliveryOverviewPanelProps): ReactNode {
  const [hubBaseUrl, setHubBaseUrl] = useState('');
  const [shopId, setShopId] = useState('');
  const report = useMemo(() => computeRetailDeliveryOverview({ ...revenue, now: revenue.generatedAt }), [revenue]);
  const validPromiseCount = report.summary.activePromises - report.summary.invalidPromiseCount;
  const onTimeRate = validPromiseCount > 0
    ? Math.round(((validPromiseCount - report.summary.overduePromises) / validPromiseCount) * 1000) / 10
    : undefined;
  const codCustody = revenue.codCollectionCases
    .filter((item) => item.status !== 'bank-matched' && item.status !== 'cancelled')
    .reduce((sum, item) => sum + item.expectedAmount, 0);
  const riderRows = useMemo(() => {
    const byRider = new Map<string, { riderId: string; observations: number; state: 'live' | 'stale' | 'awaiting' | 'blocked'; observedAt?: string }>();
    for (const signal of revenue.retailDeliveryMapSignals ?? []) {
      const current = byRider.get(signal.riderId);
      const nextState = signal.status === 'live-evidence'
        ? 'live'
        : signal.status === 'stale'
          ? 'stale'
          : signal.status === 'blocked'
            ? 'blocked'
            : 'awaiting';
      const priority = { live: 1, awaiting: 2, stale: 3, blocked: 4 } as const;
      if (!current || priority[nextState] >= priority[current.state]) {
        byRider.set(signal.riderId, { riderId: signal.riderId, observations: (current?.observations ?? 0) + 1, state: nextState, observedAt: signal.observedAt ?? current?.observedAt });
      } else {
        byRider.set(signal.riderId, { ...current, observations: current.observations + 1 });
      }
    }
    return [...byRider.values()].sort((left, right) => left.riderId.localeCompare(right.riderId));
  }, [revenue.retailDeliveryMapSignals]);
  const queue = report.promiseRows.slice(0, 5);
  const cards = [
    { label: 'Awaiting dispatch', value: report.summary.dispatchBacklog.toLocaleString('en-IN'), detail: report.summary.dispatchBacklog ? 'Packed or ready to leave' : 'No package waiting', Icon: PackageCheck, tone: 'amber' },
    { label: 'In transit', value: report.summary.inTransit.toLocaleString('en-IN'), detail: report.summary.inTransit ? 'Shipment evidence open' : 'No active shipment', Icon: Truck, tone: 'blue' },
    { label: 'On-time promise', value: onTimeRate === undefined ? '—' : `${onTimeRate}%`, detail: onTimeRate === undefined ? (report.summary.invalidPromiseCount ? 'No valid promise time' : 'No active promises yet') : `${report.summary.overduePromises} overdue`, Icon: Clock3, tone: onTimeRate !== undefined && onTimeRate < 90 ? 'amber' : 'green' },
    { label: 'Returns / RTO', value: report.summary.returnsAttention.toLocaleString('en-IN'), detail: report.summary.returnsAttention ? 'Need review' : 'No return exception', Icon: RotateCcw, tone: report.summary.returnsAttention ? 'red' : 'green' },
    { label: 'COD custody', value: inr.format(codCustody), detail: `${report.summary.codOpen} open case${report.summary.codOpen === 1 ? '' : 's'}`, Icon: ShieldCheck, tone: report.summary.codAttention ? 'amber' : 'blue' },
  ] as const;

  return <section className="retail-delivery-overview" data-testid="retail-delivery-overview" aria-labelledby="retail-delivery-overview-title">
    <header className="retail-delivery-overview__header">
      <div>
        <span className="eyebrow"><Truck size={14} aria-hidden="true" /> Delivery control</span>
        <h1 id="retail-delivery-overview-title" className="retail-front-door__title">Promise realistically. Dispatch visibly. Reconcile COD.</h1>
        <p>Orders, rider freshness, customer promises and cash custody are shown from recorded evidence—not assumed carrier data.</p>
      </div>
      <button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open delivery controls <ArrowRight size={14} aria-hidden="true" /></button>
    </header>

    <div className="retail-delivery-overview__cards" aria-label="Delivery control summary" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>
      {cards.map(({ label, value, detail, Icon, tone }) => <div key={label} data-tone={tone}>
        <Icon size={16} aria-hidden="true" />
        <span>{label}</span><strong>{value}</strong><small>{detail}</small>
      </div>)}
    </div>

    {report.attention.length ? <div className="retail-delivery-overview__attention" role="status">
      <AlertTriangle size={16} aria-hidden="true" />
      <div><strong>Resolve an exception before promising more</strong><p>{report.attention.join(' · ')}</p></div>
    </div> : <div className="retail-delivery-overview__clear" role="status"><CheckCircle2 size={16} aria-hidden="true" /><span>No delivery exception is recorded in this local view.</span></div>}

    <div className="retail-delivery-overview__lower">
      <div>
        <header><div><span className="eyebrow">Live dispatch map</span><h3>Rider evidence, not a simulated route</h3></div><span><Radio size={13} aria-hidden="true" /> refreshed from recorded signals</span></header>
        <RetailDeliveryMapSurface signals={revenue.retailDeliveryMapSignals} now={report.generatedAt} />
      </div>
      <aside aria-labelledby="dispatch-queue-title">
        <header><div><span className="eyebrow">Dispatch queue</span><h3 id="dispatch-queue-title">Next commitments</h3></div><Clock3 size={17} aria-hidden="true" /></header>
        {queue.length ? <div className="retail-delivery-overview__queue" role="list" style={{ display: 'grid', gap: 8 }}>
          {queue.map((row) => <article key={row.id} role="listitem" data-state={row.state} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: 9, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <span>{row.state === 'overdue' ? <AlertTriangle size={14} aria-hidden="true" /> : <MapPin size={14} aria-hidden="true" />}</span>
            <div><strong>{row.orderNumber}</strong><small>{row.paymentMode === 'cod' ? 'COD' : 'Prepaid'} · deliver by {formatEvidenceDate(row.deliveryTo)}</small></div>
            <em>{row.state.replace('-', ' ')}</em>
          </article>)}
        </div> : <p className="bharat-empty"><PackageCheck size={18} aria-hidden="true" />No active delivery promises are recorded.</p>}
        <button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Review dispatch queue <ArrowRight size={14} aria-hidden="true" /></button>
      </aside>
    </div>

    <div className="retail-delivery-overview__lower">
      <div>
        <header><div><span className="eyebrow">Rider workload</span><h3>Signal freshness by rider</h3></div><span>{riderRows.length} rider{riderRows.length === 1 ? '' : 's'}</span></header>
        {riderRows.length ? <div className="retail-delivery-overview__promise" role="list" style={{ display: 'grid' }}>
          {riderRows.slice(0, 6).map((rider) => <div className="retail-delivery-overview__promise" key={rider.riderId} role="listitem" data-state={rider.state === 'blocked' ? 'overdue' : undefined}>
            <span><Radio size={14} aria-hidden="true" /></span><div><strong>{rider.riderId}</strong><small>{rider.observations} recorded observation{rider.observations === 1 ? '' : 's'} · {formatEvidenceDate(rider.observedAt)}</small></div><em>{rider.state}</em>
          </div>)}
        </div> : <p className="bharat-empty"><Radio size={18} aria-hidden="true" />No rider-device observation is recorded.</p>}
      </div>
      <aside>
        <header><div><span className="eyebrow">Serviceability</span><h3>Can we promise?</h3></div><MapPin size={17} aria-hidden="true" /></header>
        <strong>{report.summary.serviceablePincodes}</strong><p>active pincode policies</p><small>Policy evidence is available locally. Carrier coverage and ETA still require certified provider evidence.</small>
        <button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Review policy and custody <RotateCcw size={14} aria-hidden="true" /></button>
      </aside>
    </div>

    <details className="retail-delivery-overview__disclosure">
      <summary>Connect or inspect Bakaloo Hub coverage</summary>
      <div className="retail-coverage-map__connect">
        <div><span className="eyebrow">Bakaloo Hub / coverage</span><strong>Review real customer coverage</strong><small>Enter a credential-free Hub URL and shop UUID. The Hub stays authoritative; this app only reads the projection.</small></div>
        <label>Hub URL<input type="url" value={hubBaseUrl} onChange={(event) => setHubBaseUrl(event.target.value)} placeholder="https://hub.example/api" required /></label>
        <label>Shop UUID<input value={shopId} onChange={(event) => setShopId(event.target.value)} placeholder="11111111-1111-4111-8111-111111111111" required /></label>
        <button type="button" className="button button--primary" disabled={!onFetchCoverageMap || coverageMapBusy || !hubBaseUrl.trim() || !shopId.trim()} onClick={() => {
          if (onFetchCoverageMap) void onFetchCoverageMap({ baseUrl: hubBaseUrl.trim(), shopId: shopId.trim() });
        }}>{coverageMapBusy ? 'Loading coverage…' : 'Load coverage'}</button>
        {coverageMapError ? <p role="alert">{coverageMapError}</p> : null}
      </div>
      <RetailCoverageMapSurface coverage={coverageMap} />
    </details>

    <footer className="retail-delivery-overview__footer"><ShieldCheck size={14} aria-hidden="true" /> Last local evidence read {dateFormatter.format(new Date(report.generatedAt))}. Nothing here writes to Bakaloo or a carrier.</footer>
  </section>;
}
