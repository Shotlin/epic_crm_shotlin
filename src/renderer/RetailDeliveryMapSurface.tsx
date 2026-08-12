import { MapPinned, Radio, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { buildRetailDeliveryMapSurface } from '../domain/retail-delivery-map';
import type { RetailDeliveryMapSignal } from '../shared/retail-delivery-map-contracts';

function coordinate(value: number, min: number, range: number): number {
  return range === 0 ? 50 : ((value - min) / range) * 100;
}

export function RetailDeliveryMapSurface({ signals, now }: { signals?: readonly RetailDeliveryMapSignal[]; now?: string }): ReactNode {
  const surface = buildRetailDeliveryMapSurface(signals, now);
  const pins = surface.pins.flatMap((signal) => signal.mapPin ? [{ signal, pin: signal.mapPin }] : []);
  const latitudes = pins.map(({ pin }) => pin.latitude);
  const longitudes = pins.map(({ pin }) => pin.longitude);
  const minLat = Math.min(...latitudes, 0);
  const minLong = Math.min(...longitudes, 0);
  const latRange = Math.max(...latitudes, 0) - minLat;
  const longRange = Math.max(...longitudes, 0) - minLong;
  const heading = surface.status === 'live-evidence'
    ? 'Live rider signals'
    : surface.status === 'stale'
      ? 'Stale rider signals'
      : surface.status === 'mixed'
        ? 'Live + stale rider signals'
        : 'Delivery map readiness';

  return <article className="retail-delivery-map" data-testid="retail-delivery-map" data-status={surface.status}>
    <header className="retail-delivery-map__header">
      <div><span className="eyebrow"><MapPinned size={14} aria-hidden="true" /> Map / evidence</span><h3>{heading}</h3><p>Only consented, evidence-backed coordinates are plotted. This view never invents a route or ETA.</p></div>
      <span className="retail-delivery-map__status"><Radio size={14} aria-hidden="true" /> {surface.liveCount} live · {surface.staleCount} stale</span>
    </header>
    {pins.length ? <div className="retail-delivery-map__body">
      <div className="retail-delivery-map__canvas" role="img" aria-label={`${pins.length} verified delivery map pin${pins.length === 1 ? '' : 's'}`}>
        <svg viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">
          <path d="M0 25H100M0 50H100M0 75H100M25 0V100M50 0V100M75 0V100" />
          {pins.map(({ signal, pin }) => <circle key={signal.id} cx={coordinate(pin.longitude, minLong, longRange)} cy={100 - coordinate(pin.latitude, minLat, latRange)} r="3.2" data-state={signal.status} />)}
        </svg>
        <span className="retail-delivery-map__legend"><Radio size={12} aria-hidden="true" /> Evidence points · no route line</span>
      </div>
      <div className="retail-delivery-map__register" aria-label="Verified delivery locations">{pins.slice(0, 6).map(({ signal, pin }) => <div key={signal.id}><span data-state={signal.status}><MapPinned size={14} aria-hidden="true" /></span><div><strong>{pin.label}</strong><small>{signal.deliveryId} · {signal.status === 'live-evidence' ? 'live evidence' : 'stale evidence'}</small><small>{pin.latitude.toFixed(4)}, {pin.longitude.toFixed(4)}</small></div></div>)}</div>
    </div> : <div className="retail-delivery-map__empty"><ShieldAlert size={22} aria-hidden="true" /><div><strong>No verified coordinates available</strong><p>{surface.blockers[0] ?? 'Import a signed rider-device or provider-webhook observation before showing a map pin.'}</p><small>Map data will appear after the Retail Hub supplies consent, freshness, and evidence references.</small></div></div>}
    {surface.blockers.length ? <footer className="retail-delivery-map__footer"><ShieldAlert size={13} aria-hidden="true" /> {surface.blockers.join(' · ')}</footer> : null}
  </article>;
}
