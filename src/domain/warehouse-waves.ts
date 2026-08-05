import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

export interface WarehousePickWave {
  waveKey: string;
  warehouseId: string;
  warehouseName: string;
  priority: 'normal' | 'high' | 'urgent';
  dueDate: string;
  taskCount: number;
  totalQuantity: number;
  completedQuantity: number;
  completionPercent: number;
  blockedTasks: number;
  status: 'ready' | 'in-progress' | 'blocked' | 'complete';
}

type WaveSource = Pick<RevenueOpsState, 'scope' | 'warehouseTasks' | 'storageBins' | 'warehouseZones' | 'warehouses'>;
const round = (value: number): number => Math.round(value * 100) / 100;
const sameScope = (state: WaveSource, record: { scope?: RevenueOpsState['scope'] }): boolean => {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};

/** Groups open pick tasks into deterministic warehouse waves for cluster execution. */
export function buildWarehousePickWaves(state: WaveSource): WarehousePickWave[] {
  const warehouses = new Map(state.warehouses.filter((warehouse) => warehouse.active && sameScope(state, warehouse)).map((warehouse) => [warehouse.id, warehouse]));
  const binWarehouse = new Map(state.storageBins.filter((bin) => sameScope(state, bin)).map((bin) => {
    const zone = state.warehouseZones.find((candidate) => candidate.id === bin.zoneId);
    return [bin.id, zone?.warehouseId];
  }));
  const grouped = new Map<string, { warehouseId: string; priority: WarehousePickWave['priority']; dueDate: string; taskCount: number; totalQuantity: number; completedQuantity: number; blockedTasks: number }>();
  for (const task of state.warehouseTasks.filter((candidate) => candidate.type === 'pick' && sameScope(state, candidate) && !['cancelled'].includes(candidate.status))) {
    const warehouseId = binWarehouse.get(task.fromBinId);
    if (!warehouseId || !warehouses.has(warehouseId)) continue;
    const dueDate = task.dueAt.slice(0, 10);
    const key = `${warehouseId}:${task.priority}:${dueDate}`;
    const entry = grouped.get(key) ?? { warehouseId, priority: task.priority, dueDate, taskCount: 0, totalQuantity: 0, completedQuantity: 0, blockedTasks: 0 };
    entry.taskCount += 1;
    entry.totalQuantity += task.quantity;
    if (task.status === 'completed') entry.completedQuantity += task.quantity;
    if (task.status === 'blocked') entry.blockedTasks += 1;
    grouped.set(key, entry);
  }
  return [...grouped.entries()].map(([waveKey, wave]) => {
    const completionPercent = wave.totalQuantity ? round(wave.completedQuantity / wave.totalQuantity * 100) : 0;
    const status: WarehousePickWave['status'] = wave.blockedTasks ? 'blocked' : completionPercent >= 100 ? 'complete' : wave.completedQuantity ? 'in-progress' : 'ready';
    return { waveKey, warehouseId: wave.warehouseId, warehouseName: warehouses.get(wave.warehouseId)!.name, priority: wave.priority, dueDate: wave.dueDate, taskCount: wave.taskCount, totalQuantity: round(wave.totalQuantity), completedQuantity: round(wave.completedQuantity), completionPercent, blockedTasks: wave.blockedTasks, status };
  }).sort((left, right) => left.dueDate.localeCompare(right.dueDate) || ({ urgent: 0, high: 1, normal: 2 }[left.priority] - { urgent: 0, high: 1, normal: 2 }[right.priority]) || left.warehouseName.localeCompare(right.warehouseName));
}
