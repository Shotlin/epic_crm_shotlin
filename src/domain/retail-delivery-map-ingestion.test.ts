import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { ingestRetailDeliveryMapSignal, normalizeRetailDeliveryMapSignal } from './retail-delivery-map';

const signal = {
  id: 'signal-1', deliveryId: 'delivery-1', riderId: 'rider-1', status: 'live-evidence',
  mapPin: { locationId: 'rider-1', label: 'Rider 1', latitude: 22.57, longitude: 88.36, source: 'rider-device', observedAt: '2026-08-10T10:00:00.000Z', evidenceReference: 'device-event-1' },
  blockers: ['Rider location remains an observed signal and needs delivery-event reconciliation.'], recordedAt: '2026-08-10T10:00:00.000Z', version: 1,
};

describe('retail delivery map ingestion', () => {
  it('normalizes a verified signal without retaining arbitrary fields', () => {
    const normalized = normalizeRetailDeliveryMapSignal({ ...signal, secret: 'must not survive' });
    expect(normalized).not.toHaveProperty('secret');
    expect(normalized.mapPin?.latitude).toBe(22.57);
  });

  it('persists a scope-bound signal and rejects a foreign scope', () => {
    const state = createInitialRevenueOpsState();
    const next = ingestRetailDeliveryMapSignal(state, { signal, actorId: 'hub-import', now: '2026-08-10T10:01:00.000Z' });
    expect(next.revision).toBe(state.revision + 1);
    expect(next.retailDeliveryMapSignals?.[0]?.scope).toEqual(state.scope);
    expect(() => ingestRetailDeliveryMapSignal(state, { signal: { ...signal, scope: { companyId: 'other-company', branchId: 'other-branch' } }, actorId: 'hub-import' })).toThrow(/scope/i);
  });

  it('is idempotent when the same persisted signal is replayed', () => {
    const state = createInitialRevenueOpsState();
    const first = ingestRetailDeliveryMapSignal(state, { signal, actorId: 'hub-import', now: '2026-08-10T10:01:00.000Z' });
    const replay = ingestRetailDeliveryMapSignal(first, { signal: first.retailDeliveryMapSignals?.[0], actorId: 'hub-import', now: '2026-08-10T10:01:00.000Z' });
    expect(replay).toBe(first);
  });
});
