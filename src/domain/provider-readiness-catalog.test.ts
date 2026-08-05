import { describe, expect, it } from 'vitest';
import { PROVIDER_READINESS_CATALOG, summarizeProviderReadiness } from './provider-readiness-catalog';

describe('provider readiness catalog', () => {
  it('covers the required external integration families', () => {
    expect(PROVIDER_READINESS_CATALOG.map(({ id }) => id)).toEqual(expect.arrayContaining(['gsp-irp', 'banking', 'payroll', 'messaging', 'logistics']));
  });

  it('keeps adapter readiness distinct from production certification', () => {
    const summary = summarizeProviderReadiness();
    expect(summary.capabilities).toBeGreaterThan(summary.total);
    expect(summary.productionGate).toBeGreaterThan(0);
    expect(summary.sandboxNeeded).toBeGreaterThan(0);
  });
});
