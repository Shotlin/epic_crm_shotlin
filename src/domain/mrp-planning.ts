import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

export interface MrpMaterialRequirement {
  itemVariantId: string;
  itemVariantName: string;
  grossRequired: number;
  available: number;
  netRequirement: number;
  linkedWorkOrders: string[];
  shortage: boolean;
  level?: number;
  parentPath?: string[];
}

export interface MrpPlan {
  asOf: string;
  activeWorkOrders: number;
  releasedBoms: number;
  requirements: MrpMaterialRequirement[];
  shortageCount: number;
  totalShortageUnits: number;
  cycles?: string[][];
}

type MrpSource = Pick<RevenueOpsState, 'scope' | 'bomRevisions' | 'workOrders' | 'binBalances' | 'itemVariants'>;

const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const sameScope = (state: MrpSource, record: { scope?: RevenueOpsState['scope'] }): boolean => {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};

/** Builds a deterministic gross-to-net material plan from execution demand. */
export function buildMrpPlan(state: MrpSource, asOf = new Date().toISOString()): MrpPlan {
  const activeWorkOrders = state.workOrders.filter((order) => sameScope(state, order) && ['submitted', 'released', 'in-progress', 'quality-hold'].includes(order.status) && order.quantityPlanned > order.quantityCompleted);
  const releasedBoms = state.bomRevisions.filter((bom) => sameScope(state, bom) && bom.status === 'released');
  const gross = new Map<string, { required: number; workOrders: Set<string> }>();
  for (const order of activeWorkOrders) {
    const bom = releasedBoms.find((candidate) => candidate.id === order.bomRevisionId);
    if (!bom) continue;
    const remainingOutput = order.quantityPlanned - order.quantityCompleted;
    const multiplier = remainingOutput / bom.outputQuantity;
    for (const component of bom.components) {
      const entry = gross.get(component.itemVariantId) ?? { required: 0, workOrders: new Set<string>() };
      entry.required += component.quantityPerOutput * multiplier * (1 + component.scrapPercent / 100);
      entry.workOrders.add(order.number);
      gross.set(component.itemVariantId, entry);
    }
  }
  const requirements = [...gross.entries()].map(([itemVariantId, entry]) => {
    const available = state.binBalances.filter((balance) => balance.itemVariantId === itemVariantId && sameScope(state, balance)).reduce((total, balance) => total + Math.max(0, balance.available), 0);
    const netRequirement = round(Math.max(0, entry.required - available));
    return { itemVariantId, itemVariantName: state.itemVariants.find((variant) => variant.id === itemVariantId)?.name ?? itemVariantId, grossRequired: round(entry.required), available: round(available), netRequirement, linkedWorkOrders: [...entry.workOrders].sort(), shortage: netRequirement > 0 };
  }).sort((left, right) => right.netRequirement - left.netRequirement || left.itemVariantName.localeCompare(right.itemVariantName));
  return { asOf, activeWorkOrders: activeWorkOrders.length, releasedBoms: releasedBoms.length, requirements, shortageCount: requirements.filter(({ shortage }) => shortage).length, totalShortageUnits: round(requirements.reduce((total, requirement) => total + requirement.netRequirement, 0)), cycles: [] };
}

/** Explodes subassemblies recursively while preserving a deterministic dependency path. */
export function buildMultilevelMrpPlan(state: MrpSource, asOf = new Date().toISOString()): MrpPlan {
  const activeWorkOrders = state.workOrders.filter((order) => sameScope(state, order) && ['submitted', 'released', 'in-progress', 'quality-hold'].includes(order.status) && order.quantityPlanned > order.quantityCompleted);
  const releasedBoms = state.bomRevisions.filter((bom) => sameScope(state, bom) && bom.status === 'released');
  const gross = new Map<string, { required: number; workOrders: Set<string>; level: number; parentPath: string[] }>();
  const cycles: string[][] = [];
  const explode = (variantId: string, requiredOutput: number, workOrderNumber: string, level: number, path: string[]): void => {
    const bom = releasedBoms.find((candidate) => candidate.outputVariantId === variantId);
    if (!bom) return;
    if (path.includes(variantId)) { cycles.push([...path, variantId]); return; }
    const nextPath = [...path, variantId];
    for (const component of bom.components) {
      const required = component.quantityPerOutput * requiredOutput / bom.outputQuantity * (1 + component.scrapPercent / 100);
      const current = gross.get(`${component.itemVariantId}:${level}`) ?? { required: 0, workOrders: new Set<string>(), level, parentPath: nextPath };
      current.required += required;
      current.workOrders.add(workOrderNumber);
      gross.set(`${component.itemVariantId}:${level}`, current);
      explode(component.itemVariantId, required, workOrderNumber, level + 1, nextPath);
    }
  };
  for (const order of activeWorkOrders) explode(order.outputVariantId, order.quantityPlanned - order.quantityCompleted, order.number, 1, []);
  const requirements = [...gross.entries()].map(([key, entry]) => {
    const itemVariantId = key.slice(0, key.lastIndexOf(':'));
    const available = state.binBalances.filter((balance) => balance.itemVariantId === itemVariantId && sameScope(state, balance)).reduce((total, balance) => total + Math.max(0, balance.available), 0);
    const netRequirement = round(Math.max(0, entry.required - available));
    return { itemVariantId, itemVariantName: state.itemVariants.find((variant) => variant.id === itemVariantId)?.name ?? itemVariantId, grossRequired: round(entry.required), available: round(available), netRequirement, linkedWorkOrders: [...entry.workOrders].sort(), shortage: netRequirement > 0, level: entry.level, parentPath: entry.parentPath };
  }).sort((left, right) => left.level! - right.level! || right.netRequirement - left.netRequirement || left.itemVariantName.localeCompare(right.itemVariantName));
  return { asOf, activeWorkOrders: activeWorkOrders.length, releasedBoms: releasedBoms.length, requirements, shortageCount: requirements.filter(({ shortage }) => shortage).length, totalShortageUnits: round(requirements.reduce((total, requirement) => total + requirement.netRequirement, 0)), cycles };
}
