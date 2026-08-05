import { describe, expect, it } from 'vitest';
import { createInitialCrmState, getDashboardSnapshot } from './crm';
import { buildIndiaExecutivePulse } from './executive-pulse';
import { createInitialKernelState, getKernelSnapshot } from './kernel';
import { createInitialPartyState } from './party';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from './revenue-ops';

function buildSnapshot() {
  const crmState = createInitialCrmState();
  const partyState = createInitialPartyState();
  const kernelState = createInitialKernelState();
  const revenueState = createInitialRevenueOpsState();
  const dashboard = getDashboardSnapshot(crmState);
  const revenue = getRevenueOpsSnapshot(revenueState, {
    opportunities: crmState.opportunities,
    accounts: partyState.accounts,
    contacts: partyState.contacts,
    addresses: partyState.addresses,
    activeUserIds: kernelState.users.map(({ id }) => id),
  }, '2026-07-21T09:00:00.000Z');
  return { dashboard, revenue, kernel: getKernelSnapshot(kernelState) };
}

describe('India executive pulse', () => {
  it('uses governed India snapshots for metric cards and INR-only demand', () => {
    const result = buildIndiaExecutivePulse(buildSnapshot());

    expect(result.metrics.map(({ id }) => id)).toEqual([
      'indiaPipeline',
      'billedValue',
      'outstandingReceivables',
      'liquidityAvailable',
    ]);
    expect(result.metrics[0]?.value).toBeGreaterThan(0);
    expect(result.priorityDemand.length).toBeGreaterThan(0);
    expect(result.priorityDemand.every(({ value }) => value > 0)).toBe(true);
    expect(result.actions.some(({ id }) => id === 'approvals')).toBe(false);
  });

  it('preserves access boundaries instead of presenting restricted finance as zero', () => {
    const snapshot = buildSnapshot();
    const revenue = {
      ...snapshot.revenue,
      readProjection: {
        ...snapshot.revenue.readProjection,
        redactedMetrics: ['liquidityAvailable'],
      },
      metrics: {
        ...snapshot.revenue.metrics,
        liquidityAvailable: undefined,
      },
    };

    const result = buildIndiaExecutivePulse({ ...snapshot, revenue });
    const liquidity = result.metrics.find(({ id }) => id === 'liquidityAvailable');

    expect(liquidity).toMatchObject({ restricted: true, value: undefined });
    expect(result.restrictedMetricCount).toBe(1);
  });
});
