import { describe, expect, it } from 'vitest';
import { createInitialCrmState, getDashboardSnapshot } from './crm';
import { buildIndiaCommerceInsights } from './commerce-insights';
import { createInitialPartyState } from './party';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from './revenue-ops';

function buildSnapshot() {
  const crm = createInitialCrmState();
  const party = createInitialPartyState();
  const revenue = getRevenueOpsSnapshot(createInitialRevenueOpsState(), {
    opportunities: crm.opportunities,
    accounts: party.accounts,
    contacts: party.contacts,
    addresses: party.addresses,
    activeUserIds: ['user-avery', 'user-priya', 'user-lee'],
  }, '2026-07-21T09:00:00.000Z');

  return {
    dashboard: getDashboardSnapshot(crm, '2026-07-21T09:00:00.000Z'),
    revenue,
    party: { accounts: party.accounts },
  };
}

describe('India commerce insights', () => {
  it('keeps pipeline demand distinct from booked revenue on a fresh India workspace', () => {
    const insight = buildIndiaCommerceInsights(buildSnapshot());

    expect(insight.productDemand.pipeline).toMatchObject({ state: 'ready' });
    expect(insight.productDemand.pipeline.rows).toHaveLength(1);
    expect(insight.productDemand.pipeline.rows[0]).toMatchObject({
      name: 'Distributor operations platform',
      amount: 4_800_000,
    });

    // The seed has only a commercial discovery interest. It must never be
    // presented as an issued invoice, confirmed order, or customer billing.
    expect(insight.productDemand.billed).toMatchObject({ state: 'empty', rows: [] });
    expect(insight.productDemand.orders).toMatchObject({ state: 'empty', rows: [] });
    expect(insight.customerConcentration.billed).toMatchObject({ state: 'empty', rows: [] });
    expect(insight.customerConcentration.receivables).toMatchObject({ state: 'empty', rows: [] });
    expect(insight.collections).toMatchObject({ state: 'empty', rows: [] });
  });

  it('uses explicit awaiting-record states for fresh operational evidence', () => {
    const insight = buildIndiaCommerceInsights(buildSnapshot());

    expect(insight.stockExceptions).toMatchObject({ state: 'empty', rows: [] });
    expect(insight.fulfilment).toMatchObject({ state: 'empty', rows: [] });
    expect(insight.customerConcentration.pipeline).toMatchObject({ state: 'ready' });
    expect(insight.funnel).toMatchObject({ state: 'ready' });
  });

  it('does not leak restricted commercial or finance evidence as empty data', () => {
    const snapshot = buildSnapshot();
    const revenue = {
      ...snapshot.revenue,
      readProjection: {
        ...snapshot.revenue.readProjection,
        hiddenCollections: [
          'invoices',
          'salesOrders',
          'receivables',
          'reorderProposals',
          'warehouseTasks',
          'shipmentPackages',
        ],
        redactedMetrics: ['billedValue', 'outstandingReceivables'],
      },
    };

    const insight = buildIndiaCommerceInsights({ ...snapshot, revenue });

    expect(insight.productDemand.billed).toMatchObject({ state: 'restricted' });
    expect(insight.productDemand.orders).toMatchObject({ state: 'restricted' });
    expect(insight.customerConcentration.billed).toMatchObject({ state: 'restricted' });
    expect(insight.customerConcentration.receivables).toMatchObject({ state: 'restricted' });
    expect(insight.collections).toMatchObject({ state: 'restricted' });
    expect(insight.stockExceptions).toMatchObject({ state: 'restricted' });
    expect(insight.fulfilment).toMatchObject({ state: 'restricted' });
  });
});
