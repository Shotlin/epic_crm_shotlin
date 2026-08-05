import { describe, expect, it } from 'vitest';
import { buildReportPackCatalog } from './report-packs';
import { buildSavedReportViewCatalog } from './saved-report-views';
import { buildSemanticMetricCatalog } from './semantic-metrics';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

describe('saved report views', () => {
  it('creates exact-scope reusable views from governed report packs', () => {
    const metricCatalog = buildSemanticMetricCatalog({ scope: { companyId: 'c1', branchId: 'b1' }, metrics: { indiaPipeline: 1, outstandingReceivables: 2, forecastLowPoint: -3, fulfilmentCompletion: 80, slaBreaches: 1 } as RevenueOpsSnapshot['metrics'] }, '2026-07-18T00:00:00.000Z');
    const reportCatalog = buildReportPackCatalog(metricCatalog);
    const views = buildSavedReportViewCatalog(metricCatalog, reportCatalog);
    const executive = views.views.find(({ id }) => id === 'view-executive-pulse');
    expect(executive).toMatchObject({ scope: { companyId: 'c1', branchId: 'b1' }, visibility: 'shared', readiness: 'ready', coveragePercent: 100 });
    expect(executive?.filters.every(({ operator }) => operator === 'available')).toBe(true);
    expect(executive?.columns.map(({ key }) => key)).toEqual(executive?.metricKeys);
  });

  it('inherits blocked evidence instead of creating a misleading usable view', () => {
    const metricCatalog = buildSemanticMetricCatalog({ scope: { companyId: 'c1', branchId: 'b1' }, metrics: {} as RevenueOpsSnapshot['metrics'] }, '2026-07-18T00:00:00.000Z');
    const views = buildSavedReportViewCatalog(metricCatalog, buildReportPackCatalog(metricCatalog));
    expect(views.views.every(({ readiness, coveragePercent }) => readiness === 'blocked' && coveragePercent === 0)).toBe(true);
  });
});
