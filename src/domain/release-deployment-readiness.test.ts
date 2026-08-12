import { describe, expect, it } from 'vitest';
import { computeReleaseDeploymentReadiness } from './release-deployment-readiness';

const healthy = { checkedAt: '2026-08-02T08:00:00.000Z', status: 'healthy' as const, databaseIntegrity: true, auditChainValid: true, migrationsValid: true, appliedMigrations: 21, pendingOutboxEvents: 0, failedOutboxEvents: 0, recentAuditEvents: 12 };
const nativeEncryption = { status: 'native-encrypted' as const, driver: 'sqlcipher', statement: 'Native encrypted SQLite runtime is certified.', checkedAt: '2026-08-02T08:00:00.000Z' };
const release = { status: 'ready' as const, passed: 6, failed: 0, deferred: 0, missingGateIds: [], invalidGateIds: [] };
const artifact = { status: 'ready' as const, readyPlatformCount: 3, blockedPlatformCount: 0, externalCertificationPlatformCount: 0, nextActions: [] };
const update = { status: 'ready' as const, readyCount: 6, blockedCount: 0, externalCertificationCount: 0, nextActions: [] };
const uiAcceptance = { status: 'ready' as const, requiredCount: 48, verifiedPassedCount: 48, pendingReviewCount: 0, failedOrRejectedCount: 0, staleCount: 0, nextActions: [] };

describe('release deployment readiness', () => {
  it('returns GO only when gates, artifacts, updates, health and recovery are clear', () => {
    const report = computeReleaseDeploymentReadiness({ releaseReadiness: release, artifactReadiness: artifact, updateReadiness: update, uiAcceptanceReadiness: uiAcceptance, operationalHealth: healthy, runtimeDatabaseEncryption: nativeEncryption });
    expect(report).toMatchObject({ status: 'ready', goNoGo: 'go', readyCheckCount: 7, blockedCheckCount: 0 });
  });

  it('keeps external certification separate from local blockers', () => {
    const report = computeReleaseDeploymentReadiness({ releaseReadiness: release, artifactReadiness: { ...artifact, status: 'external-certification', readyPlatformCount: 1, externalCertificationPlatformCount: 2, nextActions: ['Complete platform signing.'] }, updateReadiness: { ...update, status: 'external-certification', readyCount: 0, externalCertificationCount: 6, nextActions: ['Verify update evidence.'] }, uiAcceptanceReadiness: uiAcceptance, operationalHealth: healthy, runtimeDatabaseEncryption: nativeEncryption });
    expect(report.status).toBe('external-certification');
    expect(report.blockedCheckCount).toBe(0);
    expect(report.externalCertificationCheckCount).toBe(2);
  });

  it('blocks promotion when health or recovery evidence is missing', () => {
    const report = computeReleaseDeploymentReadiness({ releaseReadiness: release, artifactReadiness: artifact, updateReadiness: update, uiAcceptanceReadiness: uiAcceptance, operationalHealth: { ...healthy, status: 'degraded', pendingOutboxEvents: 2 }, runtimeDatabaseEncryption: nativeEncryption });
    expect(report).toMatchObject({ status: 'blocked', goNoGo: 'hold', blockedCheckCount: 2 });
    expect(report.nextActions).toEqual(expect.arrayContaining(['Resolve runtime health, database, audit, or migration issues.', 'Drain pending outbox events before promotion.']));
  });

  it('blocks promotion until every active-release screen journey has passed independent review', () => {
    const report = computeReleaseDeploymentReadiness({ releaseReadiness: release, artifactReadiness: artifact, updateReadiness: update, uiAcceptanceReadiness: { ...uiAcceptance, status: 'blocked', verifiedPassedCount: 6, pendingReviewCount: 4, staleCount: 2, nextActions: ['Cashier: Complete checkout — record current-release evidence.'] }, operationalHealth: healthy, runtimeDatabaseEncryption: nativeEncryption });
    expect(report).toMatchObject({ status: 'blocked', goNoGo: 'hold', readyCheckCount: 6, blockedCheckCount: 1 });
    expect(report.checks.find((check) => check.id === 'ui-acceptance')).toMatchObject({ status: 'blocked', summary: expect.stringMatching(/6 of 48/i) });
  });

  it('blocks promotion when runtime encryption evidence is interim or missing', () => {
    const report = computeReleaseDeploymentReadiness({ releaseReadiness: release, artifactReadiness: artifact, updateReadiness: update, uiAcceptanceReadiness: uiAcceptance, operationalHealth: healthy, runtimeDatabaseEncryption: { status: 'interim-persisted-envelope', driver: 'node:sqlite', statement: 'Persisted file only.', checkedAt: healthy.checkedAt } });
    expect(report).toMatchObject({ status: 'blocked', goNoGo: 'hold' });
    expect(report.nextActions).toContain('Certify SQLCipher or an equivalent native encrypted SQLite runtime before production promotion.');
    expect(report.checks.find((check) => check.id === 'runtime-encryption')).toMatchObject({ status: 'blocked' });
  });
});
