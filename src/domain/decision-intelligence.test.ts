import { describe, expect, it } from 'vitest';
import { buildOperationalDecisionSignals } from './decision-intelligence';
import type { RevenueOpsMetrics } from '../shared/revenue-ops-contracts';

const clearMetrics = (): RevenueOpsMetrics => ({ reorderAlerts: 0, warehouseTaskBacklog: 0, activeShipments: 0, fulfilmentCompletion: 100, qualityHolds: 0, openNonconformances: 0, approvedUnavailableHours: 0, slaBreaches: 0 } as RevenueOpsMetrics);

describe('decision intelligence', () => {
  it('turns scoped operational metrics into explainable evidence signals', () => {
    const metrics = { ...clearMetrics(), reorderAlerts: 2, warehouseTaskBacklog: 3, activeShipments: 1, fulfilmentCompletion: 60, qualityHolds: 1, openNonconformances: 2, slaBreaches: 1 };
    const signals = buildOperationalDecisionSignals({ metrics });
    expect(signals.map(({ title }) => title)).toEqual(['Replenishment risk', 'Warehouse execution backlog', 'Fulfilment proof gap', 'Quality release risk', 'Service SLA breach']);
    expect(signals.find(({ title }) => title === 'Quality release risk')).toMatchObject({ id: 'quality-release-risk', evidenceCount: 3, destination: 'manufacturing', sourceMetrics: ['qualityHolds', 'openNonconformances'], ownerRole: 'manufacturing' });
  });

  it('does not invent signals when evidence is clear', () => {
    expect(buildOperationalDecisionSignals({ metrics: clearMetrics() })).toEqual([]);
  });
});
