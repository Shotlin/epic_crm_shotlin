import { describe, expect, it } from 'vitest';
import { buildSemanticMetricCatalog } from './semantic-metrics';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

describe('semantic metrics', () => {
  it('publishes named metrics with owners, evidence sources and sensitivity', () => {
    const scope = { companyId: 'company-1', branchId: 'branch-1' };
    const catalog = buildSemanticMetricCatalog({ scope, metrics: { indiaPipeline: 1_000_000, availableStock: 200, reorderAlerts: 2, fulfilmentCompletion: 80 } as RevenueOpsSnapshot['metrics'] }, '2026-07-18T00:00:00.000Z');
    expect(catalog.metrics.find(({ key }) => key === 'indiaPipeline')).toMatchObject({ label: 'India pipeline value', value: 1_000_000, unit: 'inr', ownerTab: 'pursuits', available: true });
    expect(catalog.metrics.find(({ key }) => key === 'availableStock')).toMatchObject({ sensitivity: 'restricted', sourceCollections: ['binBalances'] });
    expect(catalog.metrics.find(({ key }) => key === 'slaBreaches')).toMatchObject({ value: null, available: false });
  });

  it('preserves the operating scope on every catalog', () => {
    const scope = { companyId: 'company-2', branchId: 'branch-9' };
    expect(buildSemanticMetricCatalog({ scope, metrics: {} as RevenueOpsSnapshot['metrics'] }).scope).toEqual(scope);
  });
});
