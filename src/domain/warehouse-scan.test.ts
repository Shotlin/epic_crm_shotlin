import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { resolveWarehouseScan } from './warehouse-scan';

describe('warehouse barcode scan', () => {
  it('matches a SKU/barcode and returns only open in-scope tasks', () => {
    const state = createInitialRevenueOpsState();
    const planned = { ...state, itemVariants: [{ id: 'variant-1', itemId: 'item-1', sku: 'SKU-001', name: 'Filter blue', barcode: '890123', attributes: {}, active: true, scope: state.scope, version: 1 }], warehouseTasks: [{ id: 'task-1', number: 'PCK-1', type: 'pick' as const, sourceId: 'reservation-1', itemVariantId: 'variant-1', serialUnitIds: [], fromBinId: 'bin-1', quantity: 2, priority: 'high' as const, assignedTo: 'picker', dueAt: '2026-07-20T00:00:00.000Z', status: 'planned' as const, scope: state.scope, version: 1 }, { id: 'task-2', number: 'PCK-2', type: 'pick' as const, sourceId: 'reservation-2', itemVariantId: 'variant-1', serialUnitIds: [], fromBinId: 'bin-1', quantity: 1, priority: 'normal' as const, assignedTo: 'picker', dueAt: '2026-07-20T00:00:00.000Z', status: 'completed' as const, scope: state.scope, version: 1 }] };
    expect(resolveWarehouseScan(planned, ' 890 123 ')).toMatchObject({ status: 'matched', variantId: 'variant-1', variantName: 'Filter blue', eligibleTaskIds: ['task-1'] });
  });

  it('fails closed for unknown and duplicate codes', () => {
    const state = createInitialRevenueOpsState();
    const duplicate = { ...state, itemVariants: [{ id: 'one', itemId: 'item-1', sku: 'DUP', name: 'One', barcode: 'DUP', attributes: {}, active: true, scope: state.scope, version: 1 }, { id: 'two', itemId: 'item-2', sku: 'DUP-2', name: 'Two', barcode: 'DUP', attributes: {}, active: true, scope: state.scope, version: 1 }] };
    expect(resolveWarehouseScan(duplicate, 'missing')).toMatchObject({ status: 'unknown', eligibleTaskIds: [] });
    expect(resolveWarehouseScan(duplicate, 'DUP')).toMatchObject({ status: 'ambiguous', eligibleTaskIds: [] });
  });
});
