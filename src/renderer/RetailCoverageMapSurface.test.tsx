import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RetailCoverageMapSurface } from './RetailCoverageMapSurface';

const coverage = {
  schema: 'epic-bos-retail-hub-coverage-map.v1' as const, source: 'bakaloo' as const, writeBackAllowed: false as const, projectionChecksum: 'a'.repeat(64), observedAt: '2026-08-10T10:00:00.000Z', scope: { companyId: 'company-1', branchId: 'branch-1' },
  shop: { id: 'shop-1', name: 'Bakaloo Salt Lake', lat: 22.58, lng: 88.42, city: 'Kolkata', state: 'West Bengal', pincode: '700091', isActive: true },
  serviceablePincodes: ['700091'], uncoveredPincodes: [], customers: [{ userId: 'customer-1', name: 'Asha', initial: 'A', lat: 22.59, lng: 88.43, pincode: '700091', hasActiveOrder: true }], boundaries: [{ pincode: '700091', count: 1, polygon: [[22.58, 88.42], [22.59, 88.43], [22.58, 88.44]] as Array<[number, number]> }], totalCustomers: 1,
};

describe('RetailCoverageMapSurface', () => {
  afterEach(() => cleanup());
  it('does not invent pins when no Hub projection exists', () => {
    render(<RetailCoverageMapSurface />);
    expect(screen.getByTestId('retail-coverage-map').getAttribute('data-status')).toBe('unavailable');
    expect(screen.getByText(/no demo pins/i)).toBeTruthy();
  });
  it('renders the validated shop and customer projection', () => {
    render(<RetailCoverageMapSurface coverage={coverage} />);
    expect(screen.getByTestId('retail-coverage-map').getAttribute('data-status')).toBe('available');
    expect(screen.getByText('Bakaloo Salt Lake')).toBeTruthy();
    expect(screen.getByText(/1 customers/)).toBeTruthy();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });
});
