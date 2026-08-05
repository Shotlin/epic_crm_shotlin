import { describe, expect, it } from 'vitest';
import { buildQualityReleaseAssessments } from './quality-release';
import { createInitialRevenueOpsState } from './revenue-ops';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

const workOrder = (scope: RevenueOpsState['scope']) => ({ id: 'wo-1', number: 'WO-1', bomRevisionId: 'bom-1', qualityPlanId: 'plan-1', outputVariantId: 'variant-1', warehouseId: 'warehouse-1', outputBinId: 'bin-1', quantityPlanned: 10, quantityCompleted: 10, plannedStart: '2026-07-01', plannedEnd: '2026-07-02', status: 'quality-hold' as const, operations: [], requestedBy: 'maker', requestedAt: '2026-07-01T00:00:00.000Z', scope, version: 1 });

describe('quality release and CAPA evidence', () => {
  it('blocks output until final inspection passes and all nonconformances are resolved', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, workOrders: [workOrder(state.scope)] };
    expect(buildQualityReleaseAssessments(state)[0]).toMatchObject({ status: 'blocked', capaStatus: 'not-required', blockers: ['Final inspection evidence is missing.'] });
    state = { ...state, qualityInspections: [{ id: 'inspection-1', number: 'QI-1', workOrderId: 'wo-1', qualityPlanId: 'plan-1', stage: 'final' as const, sampleQuantity: 1, results: [], status: 'failed' as const, inspectedBy: 'inspector', inspectedAt: '2026-07-03T00:00:00.000Z', scope: state.scope, version: 1 }], nonconformances: [{ id: 'nc-1', number: 'NC-1', workOrderId: 'wo-1', qualityInspectionId: 'inspection-1', severity: 'major' as const, description: 'Pressure below limit', status: 'open' as const, openedBy: 'inspector', openedAt: '2026-07-03T00:00:00.000Z', scope: state.scope, version: 1 }] };
    expect(buildQualityReleaseAssessments(state)[0]).toMatchObject({ status: 'blocked', capaStatus: 'containment', openNonconformanceCount: 1 });
    state = { ...state, qualityInspections: [{ ...state.qualityInspections[0]!, status: 'passed' as const }], nonconformances: [{ ...state.nonconformances[0]!, status: 'resolved' as const, disposition: 'use-as-is' as const, resolution: 'Deviation approved with evidence.', resolvedBy: 'quality-checker', resolvedAt: '2026-07-04T00:00:00.000Z' }] };
    expect(buildQualityReleaseAssessments(state)[0]).toMatchObject({ status: 'released', capaStatus: 'effectiveness-review', passedFinalInspections: 1, resolvedNonconformanceCount: 1 });
  });

  it('excludes work orders from another company or branch', () => {
    const state = createInitialRevenueOpsState();
    expect(buildQualityReleaseAssessments({ ...state, workOrders: [workOrder({ companyId: 'other-company', branchId: 'other-branch' })] })).toEqual([]);
  });
});
