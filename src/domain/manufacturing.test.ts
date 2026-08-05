import { describe, expect, it } from 'vitest';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import { createInventoryItem, createItemVariant, createStorageBin, createWarehouse, createWarehouseZone, receiveInventory } from './inventory-warehouse';
import {
  createBomRevision,
  createQualityPlan,
  createWorkCenter,
  createWorkOrder,
  decideBomRevision,
  decideQualityPlan,
  decideWorkOrder,
  issueWorkOrderMaterial,
  recordProductionOutput,
  recordQualityInspection,
  resolveNonconformance,
  startWorkOrder,
} from './manufacturing';
import { createInitialRevenueOpsState } from './revenue-ops';

const T0 = '2026-07-15T08:00:00.000Z';

function foundation(): RevenueOpsState {
  let state = createInitialRevenueOpsState();
  state.products = [
    ...state.products.map((product) => product.id === 'product-distributor-platform' ? { ...product, kind: 'goods' as const, uom: 'UNIT' } : product),
    { id: 'product-resin', sku: 'RESIN-A', name: 'Resin compound A', description: 'Controlled manufacturing input.', kind: 'goods', uom: 'KG', taxCodeId: 'tax-sac-998314-2026', effectiveFrom: '2026-04-01', active: true, version: 1 },
  ];
  state.stockLocations = [{ id: 'loc-plant', code: 'PLANT', name: 'Pune plant stores', stateCode: '27', active: true, version: 1 }];
  state = createInventoryItem(state, { productId: 'product-distributor-platform', code: 'FILTER-ASM', name: 'Finished filter assembly', baseUomId: 'uom-unit', tracking: 'none', valuationMethod: 'fifo' }, 'item-finished');
  state = createInventoryItem(state, { productId: 'product-resin', code: 'RESIN-A', name: 'Resin compound A', baseUomId: 'uom-kg', tracking: 'none', valuationMethod: 'fifo' }, 'item-resin');
  state = createItemVariant(state, { itemId: 'item-finished', sku: 'FILTER-ASM-01', name: 'Finished filter assembly', attributes: { grade: 'standard' } }, 'variant-finished');
  state = createItemVariant(state, { itemId: 'item-resin', sku: 'RESIN-A-01', name: 'Resin compound A', attributes: { grade: 'A' } }, 'variant-resin');
  state = createWarehouse(state, { code: 'PUN-PLANT', name: 'Pune manufacturing plant', stateCode: '27', stockLocationId: 'loc-plant' }, 'wh-plant');
  state = createWarehouseZone(state, { warehouseId: 'wh-plant', code: 'RCV', name: 'Receipt and output dock', purpose: 'receiving' }, 'zone-rcv');
  state = createStorageBin(state, { zoneId: 'zone-rcv', code: 'RM-01', name: 'Raw material dock', capacity: 1_000, pickSequence: 1 }, 'bin-raw');
  state = createStorageBin(state, { zoneId: 'zone-rcv', code: 'FG-01', name: 'Finished goods dock', capacity: 1_000, pickSequence: 2 }, 'bin-output');
  return receiveInventory(state, { warehouseId: 'wh-plant', receivingBinId: 'bin-raw', itemVariantId: 'variant-resin', quantity: 30, uomId: 'uom-kg', unitCost: 25, reference: 'GRN-RESIN-1', receivedAt: T0, serialNumbers: [] }, 'user-avery', T0);
}

function startedWorkOrder(): RevenueOpsState {
  let state = foundation();
  state = createWorkCenter(state, { code: 'MIX-01', name: 'Mixing cell 01', warehouseId: 'wh-plant', capacityMinutesPerDay: 480, efficiencyPercent: 90, costRatePerHour: 120 }, 'center-mix');
  state = createBomRevision(state, { outputVariantId: 'variant-finished', outputQuantity: 10, effectiveFrom: '2026-07-01', components: [{ itemVariantId: 'variant-resin', quantityPerOutput: 2, scrapPercent: 0, issueMethod: 'manual' }], operations: [{ sequence: 1, workCenterId: 'center-mix', setupMinutes: 10, runMinutesPerOutput: 5, qualityGate: true }] }, 'user-avery', 'bom-filter', T0);
  state = decideBomRevision(state, { id: 'bom-filter', decision: 'released', remarks: 'Validated routing and controlled component quantities.', expectedVersion: 1 }, 'user-priya', T0);
  state = createQualityPlan(state, { outputVariantId: 'variant-finished', name: 'Finished filter release', sampleSize: 1, checks: [{ label: 'Pressure integrity', unit: 'bar', minimum: 9, maximum: 11, critical: true }] }, 'user-avery', 'quality-filter', T0);
  state = decideQualityPlan(state, { id: 'quality-filter', decision: 'approved', remarks: 'Critical release requirement accepted for production.', expectedVersion: 1 }, 'user-priya', T0);
  state = createWorkOrder(state, { bomRevisionId: 'bom-filter', qualityPlanId: 'quality-filter', warehouseId: 'wh-plant', outputBinId: 'bin-output', quantityPlanned: 10, plannedStart: '2026-07-16', plannedEnd: '2026-07-16' }, 'user-avery', 'wo-filter', T0);
  state = decideWorkOrder(state, { id: 'wo-filter', decision: 'released', remarks: 'Capacity and production controls confirmed.', expectedVersion: 1 }, 'user-priya', T0);
  return startWorkOrder(state, { id: 'wo-filter', expectedVersion: 2 }, 'user-lee', T0);
}

describe('manufacturing command', () => {
  it('governs released BOMs, independent approvals, effective dates, and capacity before a work order starts', () => {
    const state = startedWorkOrder();
    expect(state.bomRevisions[0]).toMatchObject({ number: 'BOM-26-27-00001', status: 'released', decidedBy: 'user-priya' });
    expect(state.bomRevisions[0]?.scope).toEqual(state.scope);
    expect(state.qualityPlans[0]).toMatchObject({ status: 'approved', checks: [{ critical: true, minimum: 9, maximum: 11 }] });
    expect(state.workOrders[0]).toMatchObject({ status: 'in-progress', quantityPlanned: 10, operations: [{ plannedMinutes: 60, status: 'in-progress' }] });
    const duplicate = createBomRevision(state, { outputVariantId: 'variant-finished', outputQuantity: 10, effectiveFrom: '2026-07-01', components: [{ itemVariantId: 'variant-resin', quantityPerOutput: 2, scrapPercent: 0, issueMethod: 'manual' }], operations: [{ sequence: 1, workCenterId: 'center-mix', setupMinutes: 10, runMinutesPerOutput: 5, qualityGate: true }] }, 'user-lee', 'bom-overlap', T0);
    expect(() => decideBomRevision(duplicate, { id: 'bom-overlap', decision: 'released', remarks: 'Duplicate release must be rejected.', expectedVersion: 1 }, 'user-priya', T0)).toThrow('may not overlap');
  });

  it('issues material at actual FIFO cost, records final quality, and hands finished goods from WIP to inventory', () => {
    let state = startedWorkOrder();
    const component = state.bomRevisions[0]!.components[0]!;
    state = issueWorkOrderMaterial(state, { workOrderId: 'wo-filter', bomComponentId: component.id, binId: 'bin-raw', serialUnitIds: [], quantity: 20, issuedAt: '2026-07-16' }, 'user-lee', 'issue-1', T0);
    expect(state.productionMaterialIssues[0]).toMatchObject({ totalCost: 500, unitCost: 25, quantity: 20 });
    expect(state.productionMaterialIssues[0]?.scope).toEqual(state.scope);
    expect(state.inventoryLedger[0]).toMatchObject({ type: 'production-issue', quantity: -20, value: -500 });
    expect(state.journalDrafts[0]?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: 'work-in-progress', debit: 500 }), expect.objectContaining({ accountCode: 'inventory-asset', credit: 500 })]));
    const check = state.qualityPlans[0]!.checks[0]!;
    state = recordQualityInspection(state, { workOrderId: 'wo-filter', qualityPlanId: 'quality-filter', stage: 'final', sampleQuantity: 1, results: [{ checkId: check.id, measuredValue: 10 }] }, 'user-lee', 'inspection-1', T0);
    state = recordProductionOutput(state, { workOrderId: 'wo-filter', quantity: 10, recordedAt: '2026-07-16', serialNumbers: [] }, 'user-lee', 'output-1', T0);
    expect(state.productionOutputs[0]).toMatchObject({ materialCost: 500, operationCost: 120, unitCost: 62, quantity: 10 });
    expect(state.productionOutputs[0]?.scope).toEqual(state.scope);
    expect(state.workOrders[0]).toMatchObject({ status: 'completed', quantityCompleted: 10 });
    expect(state.binBalances.find(({ binId, itemVariantId }) => binId === 'bin-output' && itemVariantId === 'variant-finished')).toMatchObject({ quantity: 10, inventoryValue: 620 });
    expect(state.journalDrafts[0]?.sourceType).toBe('production-output');
  });

  it('holds failed quality, requires independent disposition, and blocks over-issue beyond BOM allowance', () => {
    let state = startedWorkOrder();
    const component = state.bomRevisions[0]!.components[0]!;
    expect(() => issueWorkOrderMaterial(state, { workOrderId: 'wo-filter', bomComponentId: component.id, binId: 'bin-raw', serialUnitIds: [], quantity: 21, issuedAt: '2026-07-16' }, 'user-lee', 'issue-too-much', T0)).toThrow('scrap allowance');
    state = issueWorkOrderMaterial(state, { workOrderId: 'wo-filter', bomComponentId: component.id, binId: 'bin-raw', serialUnitIds: [], quantity: 20, issuedAt: '2026-07-16' }, 'user-lee', 'issue-2', T0);
    const check = state.qualityPlans[0]!.checks[0]!;
    state = recordQualityInspection(state, { workOrderId: 'wo-filter', qualityPlanId: 'quality-filter', stage: 'final', sampleQuantity: 1, results: [{ checkId: check.id, measuredValue: 6 }] }, 'user-lee', 'inspection-fail', T0);
    expect(state.workOrders[0]?.status).toBe('quality-hold');
    expect(state.nonconformances[0]).toMatchObject({ severity: 'critical', status: 'open' });
    expect(() => resolveNonconformance(state, { id: state.nonconformances[0]!.id, disposition: 'use-as-is', resolution: 'Quality engineer accepts the temporary controlled deviation.', expectedVersion: 1 }, 'user-lee', T0)).toThrow('maker cannot resolve');
    state = resolveNonconformance(state, { id: state.nonconformances[0]!.id, disposition: 'use-as-is', resolution: 'Quality engineer accepts the temporary controlled deviation.', expectedVersion: 1 }, 'user-priya', T0);
    state = recordProductionOutput(state, { workOrderId: 'wo-filter', quantity: 10, recordedAt: '2026-07-16', serialNumbers: [] }, 'user-lee', 'output-deviation', T0);
    expect(state.productionOutputs[0]?.workOrderId).toBe('wo-filter');
    expect(state.nonconformances[0]).toMatchObject({ status: 'resolved', disposition: 'use-as-is', resolvedBy: 'user-priya' });
  });
});
