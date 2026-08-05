import { describe, expect, it } from 'vitest';
import { createReleaseReadinessReport } from './release-report';
import { evaluateReleaseReadiness } from './release-readiness';
import { createBuildProvenance } from './build-provenance';

describe('release readiness report', () => {
  it('produces a stable checksum and canonical ordering for review packets', () => {
    const readiness = evaluateReleaseReadiness([
      { id: 'tests', label: 'Tests', status: 'passed', evidenceReference: 'TEST-267', checkedAt: '2026-07-17T00:00:00.000Z' },
      { id: 'typecheck', label: 'TypeScript', status: 'passed', evidenceReference: 'TS-1', checkedAt: '2026-07-17T00:00:00.000Z' },
    ]);
    const provenance = createBuildProvenance({ productName: 'Epic BOS', version: '0.1.0', platform: process.platform, buildRevision: 'local-test', schemaRevision: 9 }, '2026-07-17T00:00:00.000Z');
    const first = createReleaseReadinessReport(readiness, '2026-07-17T01:00:00.000Z', provenance);
    const second = createReleaseReadinessReport({ ...readiness, gates: [...readiness.gates].reverse() }, '2026-07-17T01:00:00.000Z', provenance);
    expect(first.sha256).toHaveLength(64);
    expect(first.sha256).toBe(second.sha256);
    expect(first.canonicalJson).toContain('"missingGateIds":["backup-restore"');
    expect(first.buildProvenanceSha256).toBe(provenance.sha256);
  });

  it('rejects an invalid report timestamp', () => {
    const readiness = evaluateReleaseReadiness([]);
    const provenance = createBuildProvenance({ productName: 'Epic BOS', version: '0.1.0', platform: process.platform, buildRevision: 'local-test', schemaRevision: 9 }, '2026-07-17T00:00:00.000Z');
    expect(() => createReleaseReadinessReport(readiness, 'not-a-date', provenance)).toThrow('timestamp is invalid');
  });
});
