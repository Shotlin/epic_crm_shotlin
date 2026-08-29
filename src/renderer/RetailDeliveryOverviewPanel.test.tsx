import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RetailDeliveryOverviewPanel } from './RetailDeliveryOverviewPanel';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

const base = {
  generatedAt: '2026-08-04T10:00:00.000Z',
  deliveryPromises: [], fulfilmentTasks: [], shipmentPackages: [], codCollectionCases: [], returnAuthorizations: [], pincodeServiceabilityRules: [], salesOrders: [], retailDeliveryMapSignals: [],
} as unknown as RevenueOpsSnapshot;

describe('RetailDeliveryOverviewPanel', () => {
  it('shows an honest empty dispatch workspace without invented carrier data', () => {
    render(<RetailDeliveryOverviewPanel revenue={base} onOpenAdvanced={vi.fn()} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Promise realistically. Dispatch visibly. Reconcile COD.' })).toBeTruthy();
    expect(screen.getByText(/No active delivery promises are recorded/i)).toBeTruthy();
    expect(screen.getByText(/No verified coordinates available/i)).toBeTruthy();
    expect(screen.getByText(/No rider-device observation is recorded/i)).toBeTruthy();
  });
});
