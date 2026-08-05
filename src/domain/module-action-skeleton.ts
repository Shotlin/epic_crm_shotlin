import type { BusinessModuleCatalogEntry } from './business-module-catalog';

export type SkeletonAction = 'view' | 'create' | 'approve' | 'export' | 'reconcile';

export interface ModuleActionSkeleton {
  moduleId: string;
  area: string;
  submodule: string;
  actions: SkeletonAction[];
  handlerState: 'connected' | 'scaffolded';
}

/** Standard interaction contract used by the rapid client-demo shell. */
export function buildModuleActionSkeleton(catalog: readonly BusinessModuleCatalogEntry[]): ModuleActionSkeleton[] {
  return catalog.flatMap((module) => module.submodules.map((submodule) => {
    const normalized = submodule.toLowerCase();
    const planned = module.plannedSubmodules?.includes(submodule) ?? false;
    const actions: SkeletonAction[] = ['view', 'create', 'approve', 'export'];
    if (normalized.includes('reconcile') || normalized.includes('gst') || normalized.includes('bank') || normalized.includes('portal') || normalized.includes('provider')) actions.push('reconcile');
    return { moduleId: module.id, area: module.area, submodule, actions, handlerState: module.state === 'live' && !planned ? 'connected' : 'scaffolded' };
  }));
}

export function summarizeModuleActionSkeleton(actions: readonly ModuleActionSkeleton[]): { submodules: number; actions: number; connected: number; scaffolded: number } {
  return { submodules: actions.length, actions: actions.reduce((count, item) => count + item.actions.length, 0), connected: actions.filter(({ handlerState }) => handlerState === 'connected').length, scaffolded: actions.filter(({ handlerState }) => handlerState === 'scaffolded').length };
}
