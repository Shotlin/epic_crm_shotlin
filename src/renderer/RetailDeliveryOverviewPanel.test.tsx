import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RetailDeliveryOverviewPanel } from './RetailDeliveryOverviewPanel';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

const base = {
  generatedAt: '2026-08-04T10:00:00.000Z',
  deliveryPromises: [],
  fulfilmentTasks: [],
  shipmentPackages: [],
  codCollectionCases: [],
  returnAuthorizations: [],
  pincodeServiceabilityRules: [],
  salesOrders: [],
} as unknown as RevenueOpsSnapshot;

describe('RetailDeliveryOverviewPanel', () => {
  it('shows an honest empty delivery state without inventing carrier data', () => {
    render(<RetailDeliveryOverviewPanel revenue={base} onOpenAdvanced={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Keep every promise visible' })).toBeTruthy();
    expect(screen.getByText(/No active delivery promises are recorded/i)).toBeTruthy();
    expect(screen.getByText(/Carrier GPS and live ETA are intentionally not inferred/i)).toBeTruthy();
  });
});
