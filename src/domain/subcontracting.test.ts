import { describe, expect, it } from 'vitest';
import { buildSubcontractingHandoff } from './subcontracting';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createSupplier, decideSupplier } from './procurement';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

const workOrder = (scope: RevenueOpsState['scope']) => ({ id: 'wo-1', number: 'WO-1', bomRevisionId: 'bom-1', qualityPlanId: 'plan-1', outputVariantId: 'variant-1', warehouseId: 'warehouse-1', outputBinId: 'bin-1', quantityPlanned: 10, quantityCompleted: 10, plannedStart: '2026-07-01', plannedEnd: '2026-07-02', status: 'completed' as const, operations: [], requestedBy: 'maker', requestedAt: '2026-07-01T00:00:00.000Z', scope, version: 1 });

describe('subcontracting handoff', () => {
  it('requires approved supplier, material issue, output receipt, and quality evidence', () => {
    let state = createInitialRevenueOpsState();
    state = createSupplier(state, { code: 'SUBCON', legalName: 'Subcontract Works', stateCode: '27', email: 'ops@sub.example', paymentTermDays: 30, categories: ['Coating'], riskRating: 'low', qualificationEvidence: 'Quality and commercial evidence reviewed.' }, 'maker', 'supplier-1', '2026-07-01T00:00:00.000Z');
    state = decideSupplier(state, { id: 'supplier-1', decision: 'approved', remarks: 'Approved.', expectedVersion: 1 }, 'checker', '2026-07-02T00:00:00.000Z');
    state = { ...state, workOrders: [workOrder(state.scope)] };
    expect(buildSubcontractingHandoff(state, 'wo-1')).toMatchObject({ readiness: 'blocked', nextAction: 'qualify-supplier' });
    state = { ...state, productionMaterialIssues: [{ id: 'issue-1', number: 'MI-1', workOrderId: 'wo-1', bomComponentId: 'component-1', itemVariantId: 'variant-2', binId: 'bin-1', batchId: undefined, serialUnitIds: [], quantity: 10, unitCost: 20, totalCost: 200, issuedBy: 'warehouse', issuedAt: '2026-07-03T00:00:00.000Z', ledgerReference: 'LEDGER-1', journalId: 'J-1', scope: state.scope, version: 1 }] };
    expect(buildSubcontractingHandoff(state, 'wo-1', 'supplier-1')).toMatchObject({ readiness: 'review', nextAction: 'record-receipt', materialIssueCount: 1 });
    state = { ...state, productionOutputs: [{ id: 'output-1', number: 'POUT-1', workOrderId: 'wo-1', itemVariantId: 'variant-1', outputBinId: 'bin-1', quantity: 10, batchNumber: undefined, serialNumbers: [], materialCost: 200, operationCost: 50, unitCost: 25, recordedBy: 'warehouse', recordedAt: '2026-07-04T00:00:00.000Z', inventoryReference: 'INV-1', journalId: 'J-2', scope: state.scope, version: 1 }], qualityInspections: [{ id: 'inspection-1', number: 'QI-1', workOrderId: 'wo-1', qualityPlanId: 'plan-1', stage: 'final' as const, sampleQuantity: 1, results: [], status: 'passed' as const, inspectedBy: 'inspector', inspectedAt: '2026-07-05T00:00:00.000Z', scope: state.scope, version: 1 }] };
    expect(buildSubcontractingHandoff(state, 'wo-1', 'supplier-1')).toMatchObject({ readiness: 'ready', nextAction: 'handoff', supplierName: 'Subcontract Works', qualityStatus: 'passed', outputQuantity: 10 });
  });

  it('rejects a cross-scope supplier or work order', () => {
    const state = createInitialRevenueOpsState();
    expect(buildSubcontractingHandoff({ ...state, workOrders: [workOrder({ companyId: 'other-company', branchId: 'other-branch' })] }, 'wo-1')).toBeNull();
  });
});
