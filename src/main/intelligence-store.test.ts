import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { buildGovernedAnomalyQueue, type AnomalyPolicy } from '../domain/governed-anomaly-queue';
import { buildReportPackCatalog } from '../domain/report-packs';
import { buildSemanticMetricCatalog } from '../domain/semantic-metrics';
import { executeGovernedReport } from '../domain/report-execution';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { BusinessDatabase } from './database';
import { IntelligenceStore } from './intelligence-store';

let directory = '';
let database: BusinessDatabase;
const scope = { companyId: 'c1', branchId: 'b1' } as const;
const policy: AnomalyPolicy = { id: 'overdue', label: 'Overdue', metric: 'overdueReceivables', comparator: 'gte', threshold: 1, severity: 'high', destination: 'collections', ownerRole: 'finance', recommendation: 'Review collection evidence.', policyVersion: '1' };

beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-intelligence-')); database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3')); await database.initialize(); });
afterEach(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });

describe('intelligence persistence', () => {
  it('persists scoped anomalies and enforces human review concurrency', () => {
    const store = new IntelligenceStore(database);
    const anomaly = buildGovernedAnomalyQueue({ overdueReceivables: 2 }, [policy], '2026-07-18T00:00:00.000Z').anomalies[0]!;
    store.saveAnomaly(scope, anomaly);
    expect(store.listAnomalies(scope)).toHaveLength(1);
    expect(store.reviewAnomaly(scope, anomaly.id, { decision: 'accepted', reviewerId: 'reviewer-1', reviewedAt: '2026-07-18T01:00:00.000Z', rationale: 'Reviewed evidence and assigned owner.', expectedVersion: 1 }).version).toBe(2);
    expect(() => store.reviewAnomaly(scope, anomaly.id, { decision: 'dismissed', reviewerId: 'reviewer-2', reviewedAt: '2026-07-18T02:00:00.000Z', rationale: 'stale', expectedVersion: 1 })).toThrow('stale');
    expect(() => store.listAnomalies({ companyId: 'c2', branchId: 'b1' })).not.toThrow();
  });

  it('persists only exact-scope report executions', () => {
    const store = new IntelligenceStore(database);
    const catalog = buildSemanticMetricCatalog({ scope, metrics: { indiaPipeline: 1, outstandingReceivables: 2, forecastLowPoint: -3, fulfilmentCompletion: 80, slaBreaches: 1 } as RevenueOpsSnapshot['metrics'] }, '2026-07-18T00:00:00.000Z');
    const pack = buildReportPackCatalog(catalog).packs.find(({ id }) => id === 'executive-pulse')!;
    const execution = executeGovernedReport({ pack, catalogScope: scope, requestedScope: scope, executedBy: 'owner', generatedAt: '2026-07-18T01:00:00.000Z' });
    store.saveReportExecution(scope, execution);
    expect(store.listReportExecutions(scope)[0]).toMatchObject({ id: execution.id, scope, status: 'ready' });
    expect(() => store.saveReportExecution({ companyId: 'c2', branchId: 'b1' }, execution)).toThrow('scope');
  });

  it('persists approved report delivery plans and provider-neutral handoff evidence', () => {
    const store = new IntelligenceStore(database);
    const plan = store.createReportDeliveryPlan(scope, {
      reportPackId: 'finance-control', channel: 'email', frequency: 'daily', windowStart: '10:00', windowEnd: '12:00', effectiveFrom: '2026-07-18',
      recipients: [{ id: 'user-1', kind: 'internal-user', label: 'Finance owner', destination: 'owner@example.in' }], notes: 'Daily finance control delivery.',
    }, 'maker-1', '2026-07-18T04:00:00.000Z');
    expect(store.listReportDeliveryPlans(scope)[0]).toMatchObject({ id: plan.id, status: 'draft' });
    const approved = store.decideReportDeliveryPlan(scope, { id: plan.id, decision: 'approved', expectedVersion: 1, remarks: 'Independent checker verified recipient and report scope.' }, 'checker-1', '2026-07-18T04:01:00.000Z');
    const attempt = store.prepareReportDeliveryAttempt(scope, { id: approved.id, expectedVersion: approved.version, now: '2026-07-18T05:00:00.000Z' }, 'scheduler-1', 'attempt-1');
    expect(attempt.status).toBe('prepared');
    const acknowledged = store.recordReportDeliveryResult(scope, { id: attempt.id, outcome: 'acknowledged', externalReference: 'EMAIL-001', expectedVersion: 1 }, 'email-adapter', '2026-07-18T05:01:00.000Z');
    expect(acknowledged).toMatchObject({ status: 'acknowledged', externalReference: 'EMAIL-001', version: 2 });
    expect(store.listReportDeliveryAttempts(scope)[0]).toMatchObject({ id: 'attempt-1', status: 'acknowledged' });
  });
});
