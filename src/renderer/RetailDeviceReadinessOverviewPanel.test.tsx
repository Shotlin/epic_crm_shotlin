import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailDeviceReadinessOverviewPanel } from './RetailDeviceReadinessOverviewPanel';

afterEach(() => cleanup());

describe('RetailDeviceReadinessOverviewPanel', () => {
  it('reports an honest no-device state without pretending that hardware is connected', () => {
    render(<RetailDeviceReadinessOverviewPanel revenue={{ retailDeviceAdapterProfiles: [], retailDeviceTransportEvidence: [] } as Pick<RevenueOpsSnapshot, 'retailDeviceAdapterProfiles' | 'retailDeviceTransportEvidence'>} onOpenAdvanced={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Know what is connected before you open the counter.' })).toBeTruthy();
    expect(screen.getByText(/no device profile is recorded/i)).toBeTruthy();
    expect(screen.getByText(/does not connect a device or certify a driver/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /print receipt|open drawer|connect device/i })).toBeNull();
  });
});
