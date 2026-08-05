import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { buildWarehousePickWaves } from './warehouse-waves';

describe('warehouse pick waves', () => {
  it('clusters picks by facility, priority, and due date', () => {
    const state = createInitialRevenueOpsState();
    const planned = { ...state, warehouses: [{ id: 'wh-1', code: 'MUM', name: 'Mumbai DC', stateCode: '27', stockLocationId: 'loc-1', active: true, scope: state.scope, version: 1 }], warehouseZones: [{ id: 'zone-1', warehouseId: 'wh-1', code: 'PCK', name: 'Picking', purpose: 'picking' as const, active: true, scope: state.scope, version: 1 }], storageBins: [{ id: 'bin-1', zoneId: 'zone-1', code: 'P-01', name: 'Pick face', capacity: 100, pickSequence: 1, status: 'available' as const, scope: state.scope, version: 1 }], warehouseTasks: [{ id: 'task-1', number: 'PCK-1', type: 'pick' as const, sourceId: 'reservation-1', itemVariantId: 'variant-1', serialUnitIds: [], fromBinId: 'bin-1', quantity: 10, priority: 'urgent' as const, assignedTo: 'picker', dueAt: '2026-07-20T12:00:00.000Z', status: 'in-progress' as const, scope: state.scope, version: 1 }, { id: 'task-2', number: 'PCK-2', type: 'pick' as const, sourceId: 'reservation-2', itemVariantId: 'variant-2', serialUnitIds: [], fromBinId: 'bin-1', quantity: 5, priority: 'urgent' as const, assignedTo: 'picker', dueAt: '2026-07-20T13:00:00.000Z', status: 'completed' as const, scope: state.scope, version: 1 }] };
    expect(buildWarehousePickWaves(planned)).toEqual([{ waveKey: 'wh-1:urgent:2026-07-20', warehouseId: 'wh-1', warehouseName: 'Mumbai DC', priority: 'urgent', dueDate: '2026-07-20', taskCount: 2, totalQuantity: 15, completedQuantity: 5, completionPercent: 33.33, blockedTasks: 0, status: 'in-progress' }]);
  });

  it('does not leak tasks from another company or branch', () => {
    const state = createInitialRevenueOpsState();
    const other = { companyId: 'other-company', branchId: 'other-branch' };
    const planned = { ...state, warehouses: [{ id: 'wh-other', code: 'OTH', name: 'Other', stateCode: '27', stockLocationId: 'loc', active: true, scope: other, version: 1 }], warehouseZones: [], storageBins: [], warehouseTasks: [] };
    expect(buildWarehousePickWaves(planned)).toEqual([]);
  });
});
