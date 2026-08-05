import { describe, expect, it } from 'vitest';
import { BUSINESS_MODULE_CATALOG, summarizeBusinessModuleCatalog } from './business-module-catalog';

describe('business module catalog', () => {
  it('covers every major business area with submodules', () => { const summary = summarizeBusinessModuleCatalog(); expect(summary.total).toBeGreaterThanOrEqual(12); expect(summary.submoduleCount).toBeGreaterThanOrEqual(80); expect(summary.live).toBeGreaterThan(0); expect(BUSINESS_MODULE_CATALOG.every(({ submodules }) => submodules.length > 0)).toBe(true); });
  it('keeps statutory and ecosystem certification visible as external gates', () => { expect(BUSINESS_MODULE_CATALOG.filter(({ state }) => state === 'external-gate').map(({ id }) => id)).toEqual(['statutory', 'ecosystem']); });
  it('marks the retail returns submodule as planned while POS is now live', () => {
    expect(BUSINESS_MODULE_CATALOG.find(({ id }) => id === 'sales')?.plannedSubmodules).toEqual(['returns']);
  });
});
