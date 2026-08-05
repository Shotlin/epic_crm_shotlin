import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardSnapshot } from '../shared/contracts';
import type { PartySnapshot } from '../shared/party-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailInsightsOverviewPanel } from './RetailInsightsOverviewPanel';

const dashboard = { leads: [], opportunities: [], sources: [] } as unknown as DashboardSnapshot;
const revenue = { generatedAt: '2026-08-03T09:00:00Z', readProjection: { hiddenCollections: [], redactedMetrics: [], redactedFields: {} }, products: [], dunningCases: [], salesOrders: [], quotes: [], receivables: [], receivableDisputes: [], productInterests: [], invoices: [], itemVariants: [], warehouses: [], inventoryBatches: [], cycleCountPlans: [], reorderPolicies: [], reorderProposals: [], returnAuthorizations: [], shipmentPackages: [], fulfilmentTasks: [], warehouseTasks: [], retailSales: [], inventoryItems: [], binBalances: [], retailCommerceOrders: [], retailCommerceConnectors: [], paymentReceipts: [], retailCashierShifts: [], retailCounters: [] } as unknown as RevenueOpsSnapshot;
const party = { accounts: [] } as unknown as Pick<PartySnapshot, 'accounts'>;

afterEach(() => cleanup());

describe('RetailInsightsOverviewPanel', () => {
  it('stays honest and empty without governed records', () => {
    render(<RetailInsightsOverviewPanel dashboard={dashboard} revenue={revenue} party={party} onOpenAdvanced={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /See what needs your attention/ })).toBeTruthy();
    expect(screen.getByText('No sales chart yet')).toBeTruthy();
    expect(screen.queryByText('$')).toBeNull();
  });
});
