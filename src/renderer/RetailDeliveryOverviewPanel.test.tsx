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

  it('keeps malformed legacy rider timestamps visible without crashing the dispatch workspace', () => {
    render(<RetailDeliveryOverviewPanel
      revenue={{
        ...base,
        retailDeliveryMapSignals: [{ id: 'legacy-signal', riderId: 'rider-legacy', status: 'stale', observedAt: 'not-a-date', blockers: [], recordedAt: '2026-08-04T10:00:00.000Z', version: 1 }],
      } as unknown as RevenueOpsSnapshot}
      onOpenAdvanced={vi.fn()}
    />);

    expect(screen.getByText('rider-legacy')).toBeTruthy();
    expect(screen.getByText(/recorded observation.*time unavailable/i)).toBeTruthy();
  });

  it('does not calculate an on-time rate from an invalid active promise', () => {
    render(<RetailDeliveryOverviewPanel
      revenue={{
        ...base,
        deliveryPromises: [{ id: 'bad-promise', salesOrderId: 'order-1', deliveryTo: 'invalid-time', paymentMode: 'cod', status: 'active' }],
      } as unknown as RevenueOpsSnapshot}
      onOpenAdvanced={vi.fn()}
    />);

    expect(screen.getByText('No valid promise time')).toBeTruthy();
    expect(document.body.textContent).toContain('invalid delivery time');
  });
});
