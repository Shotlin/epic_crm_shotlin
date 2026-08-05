import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { buildFiniteCapacityPlan } from './finite-scheduling';

describe('finite-capacity scheduling', () => {
  it('allocates operation minutes across days and identifies overloads', () => {
    const state = createInitialRevenueOpsState();
    const planned = { ...state, workCenters: [{ id: 'wc-1', code: 'CELL', name: 'Assembly cell', warehouseId: 'wh-1', capacityMinutesPerDay: 480, efficiencyPercent: 100, costRatePerHour: 100, active: true, scope: state.scope, version: 1 }], workOrders: [{ id: 'wo-1', number: 'WO-1', bomRevisionId: 'bom-1', outputVariantId: 'out', warehouseId: 'wh-1', outputBinId: 'bin-1', quantityPlanned: 10, quantityCompleted: 0, plannedStart: '2026-07-20', plannedEnd: '2026-07-21', status: 'released' as const, operations: [{ id: 'op-1', bomOperationId: 'bom-op-1', sequence: 1, workCenterId: 'wc-1', plannedMinutes: 1200, status: 'planned' as const }], requestedBy: 'maker', requestedAt: '2026-07-15T00:00:00.000Z', scope: state.scope, version: 1 }] };
    const plan = buildFiniteCapacityPlan(planned, '2026-07-15T00:00:00.000Z');
    expect(plan).toMatchObject({ activeWorkOrders: 1, horizonFrom: '2026-07-20', horizonTo: '2026-07-21', overloadedDays: 2, overloadedCenters: ['wc-1'] });
    expect(plan.days).toEqual(expect.arrayContaining([expect.objectContaining({ date: '2026-07-20', workCenterId: 'wc-1', plannedMinutes: 600, capacityMinutes: 480, utilizationPercent: 125, overloaded: true, orderNumbers: ['WO-1'] })]));
  });

  it('excludes work-centres and orders outside the operating scope', () => {
    const state = createInitialRevenueOpsState();
    const otherScope = { companyId: 'other-company', branchId: 'other-branch' };
    const planned = { ...state, workCenters: [{ id: 'wc-other', code: 'OTHER', name: 'Other cell', warehouseId: 'wh', capacityMinutesPerDay: 480, efficiencyPercent: 100, costRatePerHour: 100, active: true, scope: otherScope, version: 1 }], workOrders: [] };
    expect(buildFiniteCapacityPlan(planned).days).toEqual([]);
  });
});
