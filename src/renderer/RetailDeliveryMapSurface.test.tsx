import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RetailDeliveryMapSurface } from './RetailDeliveryMapSurface';
import type { RetailDeliveryMapSignal } from '../shared/retail-delivery-map-contracts';

const signal: RetailDeliveryMapSignal = {
  id: 'signal-live', deliveryId: 'delivery-1', riderId: 'rider-1', status: 'live-evidence',
  mapPin: { locationId: 'rider-1', label: 'Rider 1', latitude: 22.57, longitude: 88.36, source: 'rider-device', observedAt: '2026-08-10T10:00:00.000Z', evidenceReference: 'device-event-1' },
  blockers: ['Rider location remains an observed signal and needs delivery-event reconciliation.'], recordedAt: '2026-08-10T10:00:00.000Z', version: 1,
};

describe('RetailDeliveryMapSurface', () => {
  afterEach(() => cleanup());

  it('renders a governed empty state instead of a fake map pin', () => {
    render(<RetailDeliveryMapSurface />);
    expect(screen.getByTestId('retail-delivery-map').getAttribute('data-status')).toBe('unavailable');
    expect(screen.getByText('No verified coordinates available')).toBeTruthy();
  });

  it('renders an evidence pin and its source details', () => {
    render(<RetailDeliveryMapSurface signals={[signal]} />);
    expect(screen.getByTestId('retail-delivery-map').getAttribute('data-status')).toBe('live-evidence');
    expect(screen.getByText('Rider 1')).toBeTruthy();
    expect(screen.getByText(/Evidence points · no route line/i)).toBeTruthy();
  });
  it('normalizes positive Indian coordinates against the observed pins, not zero', () => {
    const secondSignal: RetailDeliveryMapSignal = {
      ...signal,
      id: 'signal-live-2',
      deliveryId: 'delivery-2',
      riderId: 'rider-2',
      mapPin: {
        ...signal.mapPin!,
        locationId: 'rider-2',
        label: 'Rider 2',
        latitude: 22.61,
        longitude: 88.42,
        evidenceReference: 'device-event-2',
      },
    };

    const { container } = render(<RetailDeliveryMapSurface signals={[signal, secondSignal]} />);
    const pins = [...container.querySelectorAll('.retail-delivery-map__canvas svg[viewBox="0 0 100 100"] circle')];

    expect(pins).toHaveLength(2);
    expect(pins.map((pin) => pin.getAttribute('cx'))).toEqual(['0', '100']);
    expect(pins.map((pin) => pin.getAttribute('cy'))).toEqual(['100', '0']);
  });

  it('centres a single verified coordinate instead of producing an invalid range', () => {
    const { container } = render(<RetailDeliveryMapSurface signals={[signal]} />);
    const pin = container.querySelector('.retail-delivery-map__canvas svg[viewBox="0 0 100 100"] circle');

    expect(pin?.getAttribute('cx')).toBe('50');
    expect(pin?.getAttribute('cy')).toBe('50');
  });
});
