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
  it('stays honest and visual without governed records', () => {
    render(<RetailInsightsOverviewPanel dashboard={dashboard} revenue={revenue} party={party} onOpenAdvanced={vi.fn()} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: /See the business. Then see the reason behind the numbers/ })).toBeTruthy();
    expect(screen.getAllByText('No governed data yet').length).toBeGreaterThan(0);
    expect(screen.getByText('Evidence coverage')).toBeTruthy();
    expect(screen.queryByText('$')).toBeNull();
  });
});
