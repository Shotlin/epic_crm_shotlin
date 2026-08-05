import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { buildOeeEvidence } from './oee-evidence';

describe('OEE evidence', () => {
  it('calculates transparent attainment, availability, and inspection quality', () => {
    const state = createInitialRevenueOpsState();
    const planned = { ...state, workCenters: [{ id: 'wc-1', code: 'CELL', name: 'Assembly cell', warehouseId: 'wh-1', capacityMinutesPerDay: 480, efficiencyPercent: 100, costRatePerHour: 100, active: true, scope: state.scope, version: 1 }], workOrders: [{ id: 'wo-1', number: 'WO-1', bomRevisionId: 'bom-1', outputVariantId: 'out', warehouseId: 'wh-1', outputBinId: 'bin-1', quantityPlanned: 10, quantityCompleted: 8, plannedStart: '2026-07-20', plannedEnd: '2026-07-21', status: 'in-progress' as const, operations: [{ id: 'op-1', bomOperationId: 'bom-op-1', sequence: 1, workCenterId: 'wc-1', plannedMinutes: 100, status: 'completed' as const }], requestedBy: 'maker', requestedAt: '2026-07-15T00:00:00.000Z', scope: state.scope, version: 1 }], qualityInspections: [{ id: 'inspection-1', number: 'QI-1', workOrderId: 'wo-1', qualityPlanId: 'plan-1', stage: 'final' as const, sampleQuantity: 1, results: [], status: 'passed' as const, inspectedBy: 'quality', inspectedAt: '2026-07-21T00:00:00.000Z', scope: state.scope, version: 1 }] };
    expect(buildOeeEvidence(planned)).toEqual([{ workCenterId: 'wc-1', workCenterName: 'Assembly cell', workOrderCount: 1, plannedOutput: 10, completedOutput: 8, availabilityPercent: 100, performancePercent: 80, qualityPercent: 100, oeePercent: 80, blockedOperationCount: 0, inspectionCount: 1, passedInspectionCount: 1, telemetryStatus: 'missing-cycle-telemetry', readiness: 'ready-for-telemetry' }]);
  });

  it('never fabricates quality and blocks a centre with blocked operations', () => {
    const state = createInitialRevenueOpsState();
    const otherScope = { companyId: 'other-company', branchId: 'other-branch' };
    const planned = { ...state, workCenters: [{ id: 'wc-1', code: 'CELL', name: 'Assembly cell', warehouseId: 'wh-1', capacityMinutesPerDay: 480, efficiencyPercent: 100, costRatePerHour: 100, active: true, scope: state.scope, version: 1 }], workOrders: [{ id: 'wo-1', number: 'WO-1', bomRevisionId: 'bom-1', outputVariantId: 'out', warehouseId: 'wh-1', outputBinId: 'bin-1', quantityPlanned: 10, quantityCompleted: 0, plannedStart: '2026-07-20', plannedEnd: '2026-07-21', status: 'quality-hold' as const, operations: [{ id: 'op-1', bomOperationId: 'bom-op-1', sequence: 1, workCenterId: 'wc-1', plannedMinutes: 100, status: 'blocked' as const }], requestedBy: 'maker', requestedAt: '2026-07-15T00:00:00.000Z', scope: state.scope, version: 1 }], qualityInspections: [], productionOutputs: [], scope: state.scope };
    expect(buildOeeEvidence(planned)[0]).toMatchObject({ qualityPercent: null, oeePercent: null, blockedOperationCount: 1, readiness: 'blocked' });
    expect(buildOeeEvidence({ ...planned, workCenters: planned.workCenters.map((center) => ({ ...center, scope: otherScope })) })).toEqual([]);
  });
});
