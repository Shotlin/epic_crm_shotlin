import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RetailChannelHealthOverviewPanel } from './RetailChannelHealthOverviewPanel';

const emptyRevenue = {
  retailCommerceConnectors: [],
  retailCommerceSyncRuns: [],
  retailCommerceOrders: [],
  retailSettlementReconciliations: [],
  retailCommerceConflictResolutions: [],
  generatedAt: '2026-08-04T00:00:00.000Z',
};

describe('RetailChannelHealthOverviewPanel', () => {
  it('keeps an empty channel scope honest', () => {
    render(<RetailChannelHealthOverviewPanel revenue={emptyRevenue} onOpenAdvanced={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Keep every channel accountable' })).toBeTruthy();
    expect(screen.getByText('No connector configured')).toBeTruthy();
    expect(screen.getByText(/No unresolved channel conflict is present/i)).toBeTruthy();
    expect(screen.getByText(/does not call a provider/i)).toBeTruthy();
  });
});
