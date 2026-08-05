import { describe, expect, it } from 'vitest';
import { createBuildProvenance } from './build-provenance';
import { createSupportDiagnostics } from './support-diagnostics';
import { evaluateReleaseReadiness } from './release-readiness';

describe('support diagnostics', () => {
  it('creates a checksum-addressed, secret-free operational packet', () => {
    const provenance = createBuildProvenance({ productName: 'Epic BOS', version: '0.1.0', platform: process.platform, buildRevision: 'local-test', schemaRevision: 9 }, '2026-07-18T00:00:00.000Z');
    const packet = createSupportDiagnostics({ checkedAt: '2026-07-18T00:00:00.000Z', status: 'degraded', databaseIntegrity: true, auditChainValid: true, migrationsValid: true, appliedMigrations: 9, pendingOutboxEvents: 2, failedOutboxEvents: 0, recentAuditEvents: 10 }, evaluateReleaseReadiness([]), provenance, '2026-07-18T00:01:00.000Z');
    expect(packet.sha256).toHaveLength(64);
    expect(packet.redactionVersion).toBe(1);
    expect(packet.canonicalJson).not.toContain('secretHash');
    expect(packet.provenance.sha256).toBe(provenance.sha256);
  });
});
