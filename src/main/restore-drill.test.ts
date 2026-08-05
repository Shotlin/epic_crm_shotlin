import { describe, expect, it } from 'vitest';
import { createRestoreDrillEvidence, validateRestoreDrillEvidence, verifyRestoreDrillEvidence } from './restore-drill';

const input = { id: 'drill-1', backupReference: 'backup://2026-07-18', backupChecksum: 'a'.repeat(64), restoredDatabaseChecksum: 'b'.repeat(64), target: 'isolated-test-database' as const, operatorId: 'operator-1', startedAt: '2026-07-18T10:00:00.000Z', completedAt: '2026-07-18T10:00:05.000Z', durationBudgetMs: 10_000, integrityVerified: true, auditChainVerified: true, migrationsVerified: true };

describe('restore drill evidence', () => {
  it('creates passed, checksum-addressed evidence for a verified isolated restore', () => {
    const evidence = createRestoreDrillEvidence(input);
    expect(evidence).toMatchObject({ status: 'passed', target: 'isolated-test-database' });
    expect(validateRestoreDrillEvidence(evidence)).toMatchObject({ ready: true, durationMs: 5_000, blockers: [] });
    expect(verifyRestoreDrillEvidence(evidence)).toBe(true);
  });

  it('blocks incomplete drills and detects evidence tampering', () => {
    const evidence = createRestoreDrillEvidence({ ...input, integrityVerified: false, completedAt: '2026-07-18T10:00:20.000Z' });
    expect(evidence.status).toBe('blocked');
    expect(evidence).toMatchObject({ status: 'blocked' });
    expect(verifyRestoreDrillEvidence({ ...evidence, operatorId: 'altered' })).toBe(false);
  });
});
