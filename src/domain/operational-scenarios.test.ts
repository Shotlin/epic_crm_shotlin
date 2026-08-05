import { describe, expect, it } from 'vitest';
import { buildOperationalScenarios, verifyOperationalScenarioChecksum } from './operational-scenarios';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

describe('operational scenarios', () => {
  it('compares capacity and inventory outcomes with explicit assumptions', () => {
    const summary = buildOperationalScenarios({ metrics: { capacityLoadPercent: 90, availableStock: 100, reservedStock: 70, reorderAlerts: 1 } as RevenueOpsSnapshot['metrics'] }, 45, '2026-07-18T00:00:00.000Z');
    expect(summary.scenarios.map(({ scenario }) => scenario)).toEqual(['conservative', 'base', 'upside']);
    expect(summary.scenarios[1]).toMatchObject({ capacity: { projectedLoadPercent: 90, status: 'watch' }, inventory: { projectedAvailable: 30, status: 'watch' }, assumptions: { horizonDays: 45 } });
    expect(summary.scenarios[2]?.capacity.status).toBe('overload');
    expect(summary.scenarios.every(({ assumptionKey }) => assumptionKey.startsWith('{'))).toBe(true);
    expect(summary).toMatchObject({ readiness: 'ready', missingEvidence: [] });
    expect(verifyOperationalScenarioChecksum(summary)).toBe(true);
  });

  it('does not claim risk when the supplied evidence is clear', () => {
    const summary = buildOperationalScenarios({ metrics: { capacityLoadPercent: 40, availableStock: 1_000, reservedStock: 100, reorderAlerts: 0 } as RevenueOpsSnapshot['metrics'] });
    expect(summary.scenarios[0]?.capacity.status).toBe('stable');
    expect(summary.scenarios[0]?.inventory.status).toBe('covered');
  });

  it('fails closed when source evidence is incomplete and detects tampering', () => {
    const summary = buildOperationalScenarios({ metrics: { capacityLoadPercent: 40 } as RevenueOpsSnapshot['metrics'] });
    expect(summary.readiness).toBe('attention');
    expect(summary.missingEvidence).toEqual(expect.arrayContaining(['availableStock', 'reservedStock', 'reorderAlerts']));
    expect(verifyOperationalScenarioChecksum(summary)).toBe(true);
    expect(verifyOperationalScenarioChecksum({ ...summary, scenarios: summary.scenarios.map((scenario, index) => index === 0 ? { ...scenario, capacity: { ...scenario.capacity, projectedLoadPercent: 999 } } : scenario) })).toBe(false);
  });
});
