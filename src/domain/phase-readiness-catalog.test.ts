import { describe, expect, it } from 'vitest';
import { PHASE_READINESS_CATALOG, summarizePhaseReadiness } from './phase-readiness-catalog';

describe('phase readiness catalog', () => {
  it('keeps the roadmap explicit and bounded', () => {
    expect(PHASE_READINESS_CATALOG).toHaveLength(6);
    expect(PHASE_READINESS_CATALOG.every(({ readiness }) => readiness >= 0 && readiness <= 100)).toBe(true);
  });

  it('reports active work and external gates separately', () => {
    const summary = summarizePhaseReadiness();
    expect(summary.average).toBeGreaterThan(0);
    expect(summary.skeleton).toBeGreaterThan(0);
    expect(summary.externalGate).toBeGreaterThan(0);
  });
});
