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
});
