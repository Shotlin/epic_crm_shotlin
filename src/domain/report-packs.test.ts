import { describe, expect, it } from 'vitest';
import { buildReportPackCatalog } from './report-packs';
import { buildSemanticMetricCatalog } from './semantic-metrics';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

describe('report packs', () => {
  it('resolves predefined packs from governed metric dependencies', () => {
    const catalog = buildSemanticMetricCatalog({ scope: { companyId: 'c1', branchId: 'b1' }, metrics: { indiaPipeline: 1, outstandingReceivables: 2, forecastLowPoint: -3, fulfilmentCompletion: 80, slaBreaches: 1 } as RevenueOpsSnapshot['metrics'] });
    const reports = buildReportPackCatalog(catalog);
    expect(reports.packs.find(({ id }) => id === 'executive-pulse')).toMatchObject({ readiness: 'ready', sensitivity: 'financial', coveragePercent: 100, sourceCollections: expect.arrayContaining(['receivables']) });
  });

  it('marks missing or restricted dependencies instead of fabricating a report', () => {
    const catalog = buildSemanticMetricCatalog({ scope: { companyId: 'c1', branchId: 'b1' }, metrics: {} as RevenueOpsSnapshot['metrics'] });
    const reports = buildReportPackCatalog(catalog);
    expect(reports.packs.every(({ readiness, missingMetricKeys, coveragePercent, evidence }) => readiness === 'blocked' && missingMetricKeys.length > 0 && coveragePercent === 0 && evidence.every(({ available }) => !available))).toBe(true);
  });
});
