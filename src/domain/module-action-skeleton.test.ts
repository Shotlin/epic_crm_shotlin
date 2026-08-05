import { describe, expect, it } from 'vitest';
import { BUSINESS_MODULE_CATALOG } from './business-module-catalog';
import { buildModuleActionSkeleton, summarizeModuleActionSkeleton } from './module-action-skeleton';

describe('module action skeleton', () => {
  it('provides standard demo actions for every catalog submodule', () => { const actions = buildModuleActionSkeleton(BUSINESS_MODULE_CATALOG); const summary = summarizeModuleActionSkeleton(actions); expect(summary.submodules).toBeGreaterThanOrEqual(80); expect(summary.actions).toBeGreaterThan(summary.submodules); expect(actions.every(({ actions: itemActions }) => itemActions.includes('view') && itemActions.includes('create'))).toBe(true); });
  it('adds reconciliation to statutory and provider-shaped submodules', () => { const actions = buildModuleActionSkeleton(BUSINESS_MODULE_CATALOG); expect(actions.find(({ submodule }) => submodule === 'GSTR workpapers')?.actions).toContain('reconcile'); expect(actions.find(({ submodule }) => submodule === 'banking')?.actions).toContain('reconcile'); });
  it('keeps POS connected while returns remains scaffolded since it is still planned', () => {
    const actions = buildModuleActionSkeleton(BUSINESS_MODULE_CATALOG);
    expect(actions.find(({ moduleId, submodule }) => moduleId === 'sales' && submodule === 'POS')?.handlerState).toBe('connected');
    expect(actions.find(({ moduleId, submodule }) => moduleId === 'sales' && submodule === 'returns')?.handlerState).toBe('scaffolded');
  });
});
