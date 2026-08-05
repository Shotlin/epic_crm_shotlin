import { describe, expect, it } from 'vitest';
import { evaluateReleaseReadiness } from './release-readiness';
import type { ReleaseGateEvidence } from '../shared/release-control-contracts';

const gate = (id: ReleaseGateEvidence['id'], status: ReleaseGateEvidence['status']): ReleaseGateEvidence => ({ id, label: id, status, evidenceReference: `EVIDENCE-${id}`, checkedAt: '2026-07-17T00:00:00.000Z', ...(id === 'backup-restore' && status === 'passed' ? { evidenceChecksum: 'a'.repeat(64) } : {}) });

describe('release readiness', () => {
  it('is ready only when every gate has passed', () => {
    const result = evaluateReleaseReadiness([gate('typecheck', 'passed'), gate('lint', 'passed'), gate('tests', 'passed'), gate('package', 'passed'), gate('backup-restore', 'passed'), gate('provider-certification', 'passed')]);
    expect(result.status).toBe('ready');
    expect(result.passed).toBe(6);
  });

  it('keeps deferred provider certification as a visible production blocker', () => {
    const result = evaluateReleaseReadiness([gate('typecheck', 'passed'), gate('lint', 'passed'), gate('tests', 'passed'), gate('package', 'passed'), gate('backup-restore', 'passed'), gate('provider-certification', 'deferred')]);
    expect(result.status).toBe('blocked');
    expect(result.deferred).toBe(1);
    expect(result.missingGateIds).toEqual([]);
  });

  it('reports the exact required evidence that has not been recorded', () => {
    const result = evaluateReleaseReadiness([gate('typecheck', 'passed')]);
    expect(result.status).toBe('blocked');
    expect(result.missingGateIds).toEqual(['lint', 'tests', 'package', 'backup-restore', 'provider-certification']);
    expect(result.deferred).toBe(5);
  });

  it('canonicalizes duplicate rows to the latest evidence for each gate', () => {
    const result = evaluateReleaseReadiness([
      gate('typecheck', 'passed'),
      { ...gate('typecheck', 'deferred'), checkedAt: '2026-07-18T00:00:00.000Z' },
      ...(['lint', 'tests', 'package', 'backup-restore', 'provider-certification'] as const).map((id) => gate(id, 'passed')),
    ]);
    expect(result.status).toBe('blocked');
    expect(result.gates).toHaveLength(6);
    expect(result.gates.find(({ id }) => id === 'typecheck')?.status).toBe('deferred');
    expect(result.deferred).toBe(1);
  });

  it('fails closed when the latest evidence row is malformed', () => {
    const result = evaluateReleaseReadiness([
      { ...gate('typecheck', 'passed'), evidenceReference: '   ' },
      ...(['lint', 'tests', 'package', 'backup-restore', 'provider-certification'] as const).map((id) => gate(id, 'passed')),
    ]);
    expect(result.status).toBe('blocked');
    expect(result.invalidGateIds).toEqual(['typecheck']);
    expect(result.passed).toBe(5);
  });

  it('requires a restore-drill checksum before backup/restore can pass', () => {
    const gates = (['typecheck', 'lint', 'tests', 'package', 'provider-certification'] as const).map((id) => gate(id, 'passed'));
    const result = evaluateReleaseReadiness([...gates, { ...gate('backup-restore', 'passed'), evidenceChecksum: undefined }]);
    expect(result.status).toBe('blocked');
    expect(result.invalidGateIds).toEqual(['backup-restore']);
  });
});
