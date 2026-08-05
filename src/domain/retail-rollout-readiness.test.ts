import { describe, expect, it } from 'vitest';
import { computeRetailRolloutReadiness } from './retail-reports';
import type { RetailProductionExitGateReport } from './retail-reports';
import type { OperationalHealthSnapshot } from '../shared/kernel-contracts';

const readyExitGate: RetailProductionExitGateReport = {
  status: 'ready',
  goNoGo: 'go',
  readyCheckCount: 5,
  blockedCheckCount: 0,
  externalCertificationCheckCount: 0,
  actionRequired: false,
  nextActions: [],
  checks: [],
};

const healthy: OperationalHealthSnapshot = {
  checkedAt: '2026-08-02T08:00:00.000Z',
  status: 'healthy',
  databaseIntegrity: true,
  auditChainValid: true,
  migrationsValid: true,
  appliedMigrations: 12,
  pendingOutboxEvents: 0,
  failedOutboxEvents: 0,
  recentAuditEvents: 8,
};

describe('retail rollout readiness', () => {
  it('gives a local go only when the retail gate and runtime health are clear', () => {
    const report = computeRetailRolloutReadiness({ exitGate: readyExitGate, operationalHealth: healthy });
    expect(report).toMatchObject({ status: 'ready', goNoGo: 'go', readyCheckCount: 4, blockedCheckCount: 0, externalCertificationCheckCount: 0, actionRequired: false });
  });

  it('holds rollout when runtime recovery or outbox evidence is not clear', () => {
    const report = computeRetailRolloutReadiness({
      exitGate: readyExitGate,
      operationalHealth: { ...healthy, status: 'degraded', databaseIntegrity: false, pendingOutboxEvents: 2, failedOutboxEvents: 1 },
    });
    expect(report).toMatchObject({ status: 'blocked', goNoGo: 'hold', blockedCheckCount: 3, actionRequired: true });
    expect(report.nextActions).toEqual(expect.arrayContaining(['Resolve database integrity, audit-chain, or migration blockers before rollout.', 'Replay or resolve failed outbox events before rollout.']));
  });

  it('preserves external certification as a separate hold reason', () => {
    const report = computeRetailRolloutReadiness({ exitGate: { ...readyExitGate, status: 'external-certification', goNoGo: 'hold', externalCertificationCheckCount: 2, actionRequired: true, nextActions: ['Complete provider evidence.'] }, operationalHealth: healthy });
    expect(report).toMatchObject({ status: 'external-certification', goNoGo: 'hold', readyCheckCount: 3, blockedCheckCount: 0, externalCertificationCheckCount: 1 });
    expect(report.nextActions).toContain('Complete provider evidence.');
  });
});
