import { describe, expect, it } from 'vitest';
import { buildReportPackCatalog } from './report-packs';
import { buildSemanticMetricCatalog } from './semantic-metrics';
import { executeGovernedReport, verifyGovernedReportExecution } from './report-execution';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

const scope = { companyId: 'c1', branchId: 'b1' } as const;

describe('governed report execution', () => {
  it('executes available dependencies with exact scope and a verifiable checksum', () => {
    const catalog = buildSemanticMetricCatalog({ scope, metrics: { indiaPipeline: 1, outstandingReceivables: 2, forecastLowPoint: -3, fulfilmentCompletion: 80, slaBreaches: 1 } as RevenueOpsSnapshot['metrics'] }, '2026-07-18T00:00:00.000Z');
    const pack = buildReportPackCatalog(catalog).packs.find(({ id }) => id === 'executive-pulse')!;
    const execution = executeGovernedReport({ pack, catalogScope: scope, requestedScope: scope, executedBy: 'finance-manager', generatedAt: '2026-07-18T01:00:00.000Z' });
    expect(execution).toMatchObject({ packId: 'executive-pulse', status: 'ready', scope, executedBy: 'finance-manager', missingMetricKeys: [] });
    expect(execution.rows.map(({ key }) => key)).toEqual(['indiaPipeline', 'outstandingReceivables', 'forecastLowPoint', 'fulfilmentCompletion', 'slaBreaches']);
    expect(verifyGovernedReportExecution(execution)).toBe(true);
  });

  it('returns partial or blocked evidence instead of fabricating unavailable values', () => {
    const catalog = buildSemanticMetricCatalog({ scope, metrics: { indiaPipeline: 1 } as RevenueOpsSnapshot['metrics'] }, '2026-07-18T00:00:00.000Z');
    const reports = buildReportPackCatalog(catalog);
    const partial = executeGovernedReport({ pack: reports.packs.find(({ id }) => id === 'executive-pulse')!, catalogScope: scope, requestedScope: scope, executedBy: 'owner', generatedAt: '2026-07-18T01:00:00.000Z' });
    expect(partial.status).toBe('partial');
    expect(partial.rows.every(({ value }) => Number.isFinite(value))).toBe(true);
    const blocked = executeGovernedReport({ pack: reports.packs.find(({ id }) => id === 'finance-control')!, catalogScope: scope, requestedScope: scope, executedBy: 'owner', generatedAt: '2026-07-18T01:00:00.000Z' });
    expect(blocked).toMatchObject({ status: 'blocked', rows: [], blockedReason: expect.any(String) });
  });

  it('refuses cross-company or cross-branch execution', () => {
    const catalog = buildSemanticMetricCatalog({ scope, metrics: { indiaPipeline: 1, outstandingReceivables: 2, forecastLowPoint: -3, fulfilmentCompletion: 80, slaBreaches: 1 } as RevenueOpsSnapshot['metrics'] });
    const pack = buildReportPackCatalog(catalog).packs.find(({ id }) => id === 'executive-pulse')!;
    expect(() => executeGovernedReport({ pack, catalogScope: scope, requestedScope: { companyId: 'c2', branchId: 'b1' }, executedBy: 'owner' })).toThrow('scope');
  });
});
