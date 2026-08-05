import { describe, expect, it } from 'vitest';
import { buildGovernedAnomalyQueue, reviewGovernedAnomaly, verifyGovernedAnomalyQueueChecksum, type AnomalyPolicy } from './governed-anomaly-queue';

const policies: AnomalyPolicy[] = [
  { id: 'overdue-receivables', label: 'Overdue receivables', metric: 'overdueReceivables', comparator: 'gte', threshold: 100_000, severity: 'high', destination: 'finance', ownerRole: 'finance', recommendation: 'Review collection commitments and dunning evidence.', policyVersion: '2026.07.1' },
  { id: 'capacity-overload', label: 'Capacity overload', metric: 'capacityLoadPercent', comparator: 'gte', threshold: 100, severity: 'critical', destination: 'manufacturing', ownerRole: 'manufacturing', recommendation: 'Review finite schedule and approved capacity actions.', policyVersion: '2026.07.1' },
  { id: 'missing-stock', label: 'Missing stock', metric: 'availableStock', comparator: 'lte', threshold: 0, severity: 'medium', destination: 'warehouse', ownerRole: 'operations', recommendation: 'Review replenishment evidence before promising fulfilment.', policyVersion: '2026.07.1' },
];

describe('governed anomaly queue', () => {
  it('creates deterministic, explainable recommendations from breached policies only', () => {
    const queue = buildGovernedAnomalyQueue({ overdueReceivables: 125_000, capacityLoadPercent: 120, availableStock: -2 }, policies, '2026-07-18T00:00:00.000Z');
    expect(queue.anomalies.map(({ policyId }) => policyId)).toEqual(['capacity-overload', 'missing-stock', 'overdue-receivables']);
    expect(queue.anomalies.every(({ status, evidenceReference, recommendation }) => status === 'open' && evidenceReference.startsWith('metric:') && recommendation.length > 10)).toBe(true);
    expect(verifyGovernedAnomalyQueueChecksum(queue)).toBe(true);
  });

  it('fails checksum verification after evidence or review state is tampered', () => {
    const queue = buildGovernedAnomalyQueue({ overdueReceivables: 200_000 }, policies, '2026-07-18T00:00:00.000Z');
    expect(verifyGovernedAnomalyQueueChecksum({ ...queue, anomalies: queue.anomalies.map((anomaly) => ({ ...anomaly, observedValue: 1 })) })).toBe(false);
  });

  it('requires an independent human review before closing an anomaly', () => {
    const queue = buildGovernedAnomalyQueue({ overdueReceivables: 200_000 }, policies, '2026-07-18T00:00:00.000Z');
    const anomaly = queue.anomalies[0]!;
    expect(() => reviewGovernedAnomaly(anomaly, { decision: 'accepted', reviewerId: 'ai-agent', reviewedAt: '2026-07-18T01:00:00.000Z', rationale: 'auto', expectedVersion: 1 })).toThrow('human reviewer');
    const reviewed = reviewGovernedAnomaly(anomaly, { decision: 'accepted', reviewerId: 'finance-manager', reviewedAt: '2026-07-18T01:00:00.000Z', rationale: 'Collection evidence reviewed and owner assigned.', expectedVersion: 1 });
    expect(reviewed).toMatchObject({ status: 'accepted', version: 2, review: { reviewerId: 'finance-manager' } });
    expect(() => reviewGovernedAnomaly(reviewed, { decision: 'dismissed', reviewerId: 'finance-manager', reviewedAt: '2026-07-18T02:00:00.000Z', rationale: 'duplicate', expectedVersion: 1 })).toThrow('stale');
  });
});
