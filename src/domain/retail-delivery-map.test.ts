import { describe, expect, it } from 'vitest';
import { buildRetailDeliveryMapSurface } from './retail-delivery-map';
import type { RetailDeliveryMapSignal } from '../shared/retail-delivery-map-contracts';

const pin = (status: RetailDeliveryMapSignal['status'], id: string): RetailDeliveryMapSignal => ({
  id,
  deliveryId: `delivery-${id}`,
  riderId: `rider-${id}`,
  status,
  mapPin: { locationId: `location-${id}`, label: `Signal ${id}`, latitude: 22.57, longitude: 88.36, source: 'rider-device', observedAt: '2026-08-10T10:00:00.000Z', evidenceReference: `evidence-${id}` },
  blockers: status === 'stale' ? ['The latest rider observation is stale; do not treat it as live tracking.'] : [],
  recordedAt: '2026-08-10T10:00:00.000Z',
  version: 1,
});

describe('buildRetailDeliveryMapSurface', () => {
  it('does not invent a marker when no verified signal exists', () => {
    const surface = buildRetailDeliveryMapSurface([]);
    expect(surface.status).toBe('unavailable');
    expect(surface.pins).toHaveLength(0);
    expect(surface.blockedCount).toBe(0);
  });

  it('keeps live and stale evidence visibly distinct', () => {
    const surface = buildRetailDeliveryMapSurface([pin('live-evidence', 'live'), pin('stale', 'stale')]);
    expect(surface.status).toBe('mixed');
    expect(surface.liveCount).toBe(1);
    expect(surface.staleCount).toBe(1);
    expect(surface.pins.map(({ id }) => id)).toEqual(['live', 'stale']);
  });

  it('keeps blocked signals out of the plotted pin list', () => {
    const blocked = { ...pin('blocked', 'blocked'), mapPin: undefined, blockers: ['Consent evidence required.'] };
    const surface = buildRetailDeliveryMapSurface([blocked]);
    expect(surface.status).toBe('blocked');
    expect(surface.pins).toHaveLength(0);
    expect(surface.blockers).toContain('Consent evidence required.');
  });
});
