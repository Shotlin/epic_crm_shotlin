import { describe, expect, it } from 'vitest';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import { createInitialRevenueOpsState } from './revenue-ops';
import {
  createCycleCount,
  createInventoryDisposition,
  createInventoryItem,
  createInventoryTransfer,
  createInventoryValuationReview,
  createItemVariant,
  createPickTask,
  createPutawayTask,
  createReorderPolicy,
  createStorageBin,
  createUomConversion,
  createWarehouse,
  createWarehouseZone,
  decideCycleCount,
  decideInventoryDisposition,
  decideInventoryValuationReview,
  generateReorderProposals,
  issuePickedInventory,
  postInventoryDisposition,
  receiveInventory,
  recordCycleCount,
  transitionInventoryTransfer,
  transitionWarehouseTask,
} from './inventory-warehouse';

const T0 = '2026-07-15T08:00:00.000Z';

function foundation(): RevenueOpsState {
  const state = createInitialRevenueOpsState();
  state.products = state.products.map((product) => product.id === 'product-distributor-platform' ? { ...product, kind: 'goods', uom: 'UNIT' } : product);
  state.stockLocations = [
    { id: 'loc-mum', code: 'MUM', name: 'Mumbai stock', stateCode: '27', active: true, version: 1 },
    { id: 'loc-blr', code: 'BLR', name: 'Bengaluru stock', stateCode: '29', active: true, version: 1 },
  ];
  let next = createInventoryItem(state, { productId: 'product-distributor-platform', code: 'FILTER', name: 'Industrial filter', baseUomId: 'uom-unit', tracking: 'batch', valuationMethod: 'fifo', shelfLifeDays: 365 }, 'item-filter');
  next = createItemVariant(next, { itemId: 'item-filter', sku: 'FILTER-20', name: '20 micron filter', attributes: { micron: '20' }, barcode: '890000000020' }, 'variant-filter');
  next = createWarehouse(next, { code: 'MUM-DC', name: 'Mumbai distribution centre', stateCode: '27', stockLocationId: 'loc-mum' }, 'wh-mum');
  next = createWarehouseZone(next, { warehouseId: 'wh-mum', code: 'RCV', name: 'Inbound receiving', purpose: 'receiving' }, 'zone-mum-rcv');
  next = createWarehouseZone(next, { warehouseId: 'wh-mum', code: 'PCK', name: 'Forward pick', purpose: 'picking' }, 'zone-mum-pck');
  next = createStorageBin(next, { zoneId: 'zone-mum-rcv', code: 'RCV-01', name: 'Receipt dock 01', capacity: 1000, pickSequence: 1 }, 'bin-mum-rcv');
  next = createStorageBin(next, { zoneId: 'zone-mum-pck', code: 'P-01-01', name: 'Pick face 01', capacity: 100, pickSequence: 10 }, 'bin-mum-pck');
  return next;
}

function received(): RevenueOpsState {
  return receiveInventory(foundation(), { warehouseId: 'wh-mum', receivingBinId: 'bin-mum-rcv', itemVariantId: 'variant-filter', quantity: 20, uomId: 'uom-unit', unitCost: 125, reference: 'GRN-0001', receivedAt: T0, batchNumber: 'B-260715', manufacturedAt: '2026-07-01', expiresAt: '2027-07-01', serialNumbers: [] }, 'user-avery', T0);
}

function putAway(): RevenueOpsState {
  let state = received();
  state = createPutawayTask(state, { itemVariantId: 'variant-filter', batchId: state.inventoryBatches[0]!.id, fromBinId: 'bin-mum-rcv', toBinId: 'bin-mum-pck', quantity: 20, assignedTo: 'user-lee', dueAt: '2026-07-16T08:00:00.000Z', priority: 'high' }, 'user-avery', 'task-put', T0);
  state = transitionWarehouseTask(state, { id: 'task-put', toStatus: 'in-progress', expectedVersion: 1 }, 'user-lee', '2026-07-15T09:00:00.000Z');
  return transitionWarehouseTask(state, { id: 'task-put', toStatus: 'completed', expectedVersion: 2 }, 'user-lee', '2026-07-15T09:30:00.000Z');
}

describe('inventory and warehouse depth', () => {
  it('governs item-specific UOM conversion, traceability, bins, cost layers, and legacy stock visibility', () => {
    let state = foundation();
    state = createUomConversion(state, { itemId: 'item-filter', fromUomId: 'uom-box', toUomId: 'uom-unit', factor: 10 }, 'conversion-box');
    state = receiveInventory(state, { warehouseId: 'wh-mum', receivingBinId: 'bin-mum-rcv', itemVariantId: 'variant-filter', quantity: 2, uomId: 'uom-box', unitCost: 125, reference: 'GRN-BOX-1', receivedAt: T0, batchNumber: 'B-BOX-1', expiresAt: '2027-07-01', serialNumbers: [] }, 'user-avery', T0);
    expect(state.binBalances[0]).toMatchObject({ quantity: 20, available: 20, inventoryValue: 2500 });
    expect(state.inventoryCostLayers[0]).toMatchObject({ remainingQuantity: 20, unitCost: 125, status: 'open' });
    expect(state.inventoryLedger[0]?.scope).toEqual(state.scope);
    expect(state.warehouses[0]?.scope).toEqual(state.scope);
    expect(state.stockPositions[0]).toMatchObject({ locationId: 'loc-mum', onHand: 20, available: 20 });
    expect(state.inventoryLedger[0]!.checksum).toHaveLength(64);
    expect(() => receiveInventory(state, { warehouseId: 'wh-mum', receivingBinId: 'bin-mum-rcv', itemVariantId: 'variant-filter', quantity: 1, uomId: 'uom-unit', unitCost: 125, reference: 'GRN-BOX-1', receivedAt: T0, batchNumber: 'B-BOX-2', serialNumbers: [] }, 'user-avery')).toThrow('already exists');
  });

  it('executes directed putaway and reservation-linked picking through dispatch issue', () => {
    let state = putAway();
    const batchId = state.inventoryBatches[0]!.id;
    expect(state.binBalances.find(({ binId }) => binId === 'bin-mum-pck')).toMatchObject({ quantity: 20, available: 20 });
    state.stockReservations.push({ id: 'reservation-1', salesOrderId: 'order-1', lineId: 'line-1', locationId: 'loc-mum', productId: 'product-distributor-platform', quantity: 5, status: 'reserved', reservedBy: 'user-avery', reservedAt: T0, version: 1 });
    state = createPickTask(state, { reservationId: 'reservation-1', itemVariantId: 'variant-filter', batchId, fromBinId: 'bin-mum-pck', quantity: 5, serialUnitIds: [], assignedTo: 'user-lee', dueAt: '2026-07-16T08:00:00.000Z', priority: 'urgent' }, 'user-avery', 'task-pick', T0);
    expect(state.binBalances.find(({ binId }) => binId === 'bin-mum-pck')).toMatchObject({ reserved: 5, available: 15 });
    state = transitionWarehouseTask(state, { id: 'task-pick', toStatus: 'in-progress', expectedVersion: 1 }, 'user-lee');
    state = transitionWarehouseTask(state, { id: 'task-pick', toStatus: 'completed', expectedVersion: 2 }, 'user-lee');
    expect(state.binBalances.find(({ binId }) => binId === 'bin-mum-pck')).toMatchObject({ reserved: 0, picked: 5, quantity: 20 });
    state = issuePickedInventory(state, 'reservation-1', 'user-avery', 'SHP-0001');
    expect(state.binBalances.find(({ binId }) => binId === 'bin-mum-pck')).toMatchObject({ quantity: 15, picked: 0, inventoryValue: 1875 });
    expect(state.inventoryCostLayers[0]).toMatchObject({ remainingQuantity: 15 });
    expect(state.inventoryLedger[0]).toMatchObject({ type: 'issue', value: -625 });
  });

  it('moves inventory between warehouses without losing FIFO value custody', () => {
    let state = putAway();
    state = createWarehouse(state, { code: 'BLR-DC', name: 'Bengaluru distribution centre', stateCode: '29', stockLocationId: 'loc-blr' }, 'wh-blr');
    state = createWarehouseZone(state, { warehouseId: 'wh-blr', code: 'RCV', name: 'Transfer receiving', purpose: 'receiving' }, 'zone-blr-rcv');
    state = createStorageBin(state, { zoneId: 'zone-blr-rcv', code: 'RCV-01', name: 'Bengaluru transfer dock', capacity: 1000, pickSequence: 1 }, 'bin-blr-rcv');
    const batchId = state.inventoryBatches[0]!.id;
    const crossScope = {
      ...state,
      warehouses: state.warehouses.map((warehouse) => warehouse.id === 'wh-blr' ? { ...warehouse, scope: { companyId: 'company-other', branchId: 'branch-other' } } : warehouse),
    };
    expect(() => createInventoryTransfer(crossScope, { fromWarehouseId: 'wh-mum', toWarehouseId: 'wh-blr', fromBinId: 'bin-mum-pck', toBinId: 'bin-blr-rcv', lines: [{ itemVariantId: 'variant-filter', batchId, serialUnitIds: [], quantity: 6 }] }, 'user-avery', 'transfer-cross-scope', T0)).toThrow('company and branch scope');
    state = createInventoryTransfer(state, { fromWarehouseId: 'wh-mum', toWarehouseId: 'wh-blr', fromBinId: 'bin-mum-pck', toBinId: 'bin-blr-rcv', lines: [{ itemVariantId: 'variant-filter', batchId, serialUnitIds: [], quantity: 6 }] }, 'user-avery', 'transfer-1', T0);
    expect(state.inventoryTransfers[0]?.scope).toEqual(state.scope);
    state = transitionInventoryTransfer(state, { id: 'transfer-1', toStatus: 'released', expectedVersion: 1 }, 'user-avery');
    expect(state.binBalances.find(({ binId }) => binId === 'bin-mum-pck')).toMatchObject({ reserved: 6, available: 14 });
    state = transitionInventoryTransfer(state, { id: 'transfer-1', toStatus: 'in-transit', expectedVersion: 2 }, 'user-lee');
    expect(state.binBalances.find(({ binId }) => binId === 'bin-mum-pck')).toMatchObject({ quantity: 14, inventoryValue: 1750 });
    state = transitionInventoryTransfer(state, { id: 'transfer-1', toStatus: 'received', expectedVersion: 3 }, 'user-priya');
    expect(state.binBalances.find(({ binId }) => binId === 'bin-blr-rcv')).toMatchObject({ quantity: 6, inventoryValue: 750 });
    expect(state.stockPositions.find(({ locationId }) => locationId === 'loc-blr')).toMatchObject({ onHand: 6 });
    expect(state.inventoryCostLayers.filter(({ status }) => status === 'open').reduce((total, layer) => total + layer.remainingQuantity * layer.unitCost, 0)).toBe(2500);
  });

  it('requires independent cycle-count and NRV decisions and generates reorder action', () => {
    let state = putAway();
    state = createCycleCount(state, { warehouseId: 'wh-mum', zoneId: 'zone-mum-pck', blindCount: true, scheduledAt: T0, assignedTo: 'user-lee' }, 'user-avery', 'count-1', T0);
    const plan = state.cycleCountPlans[0]!;
    state = recordCycleCount(state, { id: plan.id, counts: plan.lines.map((line) => ({ binId: line.binId, itemVariantId: line.itemVariantId, batchId: line.batchId, countedQuantity: 18 })), expectedVersion: 1 });
    expect(() => decideCycleCount(state, { id: 'count-1', decision: 'approved', expectedVersion: 2 }, 'user-avery')).toThrow('different user');
    state = decideCycleCount(state, { id: 'count-1', decision: 'approved', expectedVersion: 2 }, 'user-priya');
    expect(state.binBalances.find(({ binId }) => binId === 'bin-mum-pck')).toMatchObject({ quantity: 18, inventoryValue: 2250 });
    state = createReorderPolicy(state, { itemVariantId: 'variant-filter', warehouseId: 'wh-mum', minimumQuantity: 20, reorderPoint: 25, maximumQuantity: 100, safetyStock: 10, leadTimeDays: 7 }, 'policy-1');
    state = generateReorderProposals(state, T0);
    expect(state.reorderProposals[0]).toMatchObject({ availableQuantity: 18, recommendedQuantity: 82, status: 'proposed', requiredBy: '2026-07-22' });
    state = createInventoryValuationReview(state, { itemVariantId: 'variant-filter', warehouseId: 'wh-mum', asOfDate: '2026-07-15', netRealisableValuePerUnit: 100, rationale: 'Expected selling price less completion and selling costs supported by the approved clearance plan.' }, 'user-avery', 'nrv-1', T0);
    expect(state.inventoryValuationReviews[0]).toMatchObject({ type: 'write-down', adjustmentAmount: -450, status: 'pending' });
    expect(() => decideInventoryValuationReview(state, { id: 'nrv-1', decision: 'approved', expectedVersion: 1 }, 'user-avery')).toThrow('independent reviewer');
    state = decideInventoryValuationReview(state, { id: 'nrv-1', decision: 'approved', expectedVersion: 1 }, 'user-priya', '2026-07-15T12:00:00.000Z');
    expect(state.inventoryLedger[0]).toMatchObject({ type: 'nrv-write-down', value: -450 });
    state = createInventoryValuationReview(state, { itemVariantId: 'variant-filter', warehouseId: 'wh-mum', asOfDate: '2026-07-31', netRealisableValuePerUnit: 110, rationale: 'Approved selling-price recovery supports a partial reversal within the original write-down ceiling.' }, 'user-avery', 'nrv-2', '2026-07-31T08:00:00.000Z');
    expect(state.inventoryValuationReviews.find(({ id }) => id === 'nrv-2')).toMatchObject({ type: 'reversal', adjustmentAmount: 180 });
  });

  it('keeps a damage loss evidence-only until maker, independent checker, and poster complete the controlled flow', () => {
    let state = putAway();
    const batchId = state.inventoryBatches[0]!.id;

    state = createInventoryDisposition(state, {
      kind: 'damage', warehouseId: 'wh-mum', binId: 'bin-mum-pck', itemVariantId: 'variant-filter', batchId,
      serialUnitIds: [], quantity: 3, reason: 'Water damage found during the shelf audit.', evidenceReference: 'DAMAGE-PHOTO-001', occurredAt: '2026-07-16T08:00:00.000Z',
    }, 'user-avery', 'disposition-damage', T0);

    expect(state.inventoryDispositions[0]).toMatchObject({ status: 'submitted', availableQuantityBefore: 20, unitCostSnapshot: 125, totalValueSnapshot: 375 });
    expect(state.binBalances.find(({ binId }) => binId === 'bin-mum-pck')).toMatchObject({ quantity: 20, available: 20 });
    expect(state.inventoryLedger).toHaveLength(2);
    expect(() => decideInventoryDisposition(state, { id: 'disposition-damage', decision: 'approved', evidence: 'Independent shelf-audit evidence verified.', expectedVersion: 1 }, 'user-avery')).toThrow('independent approver');

    state = decideInventoryDisposition(state, { id: 'disposition-damage', decision: 'approved', evidence: 'Independent shelf-audit evidence verified.', expectedVersion: 1 }, 'user-priya', '2026-07-16T09:00:00.000Z');
    expect(() => postInventoryDisposition(state, { id: 'disposition-damage', expectedVersion: 2 }, 'user-avery')).toThrow('cannot post their own');

    state = postInventoryDisposition(state, { id: 'disposition-damage', expectedVersion: 2 }, 'user-lee', '2026-07-16T10:00:00.000Z');
    expect(state.inventoryDispositions[0]).toMatchObject({ status: 'posted', approvedBy: 'user-priya', postedBy: 'user-lee', postedUnitCost: 125, postedTotalValue: 375 });
    expect(state.binBalances.find(({ binId }) => binId === 'bin-mum-pck')).toMatchObject({ quantity: 17, available: 17, inventoryValue: 2125 });
    expect(state.inventoryLedger[0]).toMatchObject({ type: 'disposition', quantity: -3, unitCost: 125, value: -375, resultingQuantity: 17 });
    expect(state.stockPositions.find(({ locationId }) => locationId === 'loc-mum')).toMatchObject({ onHand: 17, available: 17 });
    expect(state.journalDrafts).toEqual([]);
  });

  it('enforces India-date expiry and opening-balance staging boundaries before posting stock', () => {
    let expiryState = putAway();
    const batchId = expiryState.inventoryBatches[0]!.id;
    expect(() => createInventoryDisposition(expiryState, {
      kind: 'expiry', warehouseId: 'wh-mum', binId: 'bin-mum-pck', itemVariantId: 'variant-filter', batchId,
      serialUnitIds: [], quantity: 2, reason: 'Expiry check before India business date boundary.', evidenceReference: 'EXPIRY-EARLY-001', occurredAt: '2027-06-30T18:00:00.000Z',
    }, 'user-avery', 'disposition-expiry-early', T0)).toThrow('expired on the stated business date');

    expiryState = createInventoryDisposition(expiryState, {
      kind: 'expiry', warehouseId: 'wh-mum', binId: 'bin-mum-pck', itemVariantId: 'variant-filter', batchId,
      serialUnitIds: [], quantity: 2, reason: 'Expired batch removed after the India business date rolled over.', evidenceReference: 'EXPIRY-INDIA-001', occurredAt: '2027-06-30T20:00:00.000Z',
    }, 'user-avery', 'disposition-expiry', T0);
    expiryState = decideInventoryDisposition(expiryState, { id: 'disposition-expiry', decision: 'approved', evidence: 'Batch label and expiry date independently checked.', expectedVersion: 1 }, 'user-priya', '2027-06-01T09:00:00.000Z');
    expiryState = postInventoryDisposition(expiryState, { id: 'disposition-expiry', expectedVersion: 2 }, 'user-lee', '2027-07-01T08:00:00.000Z');
    expect(expiryState.inventoryBatches.find(({ id }) => id === batchId)).toMatchObject({ status: 'expired' });
    expect(expiryState.binBalances.find(({ binId }) => binId === 'bin-mum-pck')).toMatchObject({ quantity: 18, available: 18 });

    let openingState = foundation();
    expect(() => createInventoryDisposition(openingState, {
      kind: 'opening-balance', warehouseId: 'wh-mum', binId: 'bin-mum-pck', itemVariantId: 'variant-filter', serialUnitIds: [], quantity: 5,
      unitCost: 42, batchNumber: 'OPEN-2607', manufacturedAt: '2026-07-01', expiresAt: '2027-07-01', reason: 'Migrated opening balance.', evidenceReference: 'OPEN-PICK-001', occurredAt: T0,
    }, 'user-avery', 'opening-pick', T0)).toThrow('staged in a receiving, quarantine, or returns bin');

    openingState = createInventoryDisposition(openingState, {
      kind: 'opening-balance', warehouseId: 'wh-mum', binId: 'bin-mum-rcv', itemVariantId: 'variant-filter', serialUnitIds: [], quantity: 5,
      unitCost: 42, batchNumber: 'OPEN-2607', manufacturedAt: '2026-07-01', expiresAt: '2027-07-01', reason: 'Migrated opening balance.', evidenceReference: 'OPEN-RCV-001', occurredAt: T0,
    }, 'user-avery', 'opening-receipt', T0);
    expect(openingState.binBalances).toEqual([]);
    openingState = decideInventoryDisposition(openingState, { id: 'opening-receipt', decision: 'approved', evidence: 'Signed opening-stock sheet reconciled to source records.', expectedVersion: 1 }, 'user-priya', '2026-07-15T09:00:00.000Z');
    openingState = postInventoryDisposition(openingState, { id: 'opening-receipt', expectedVersion: 2 }, 'user-lee', '2026-07-15T10:00:00.000Z');
    expect(openingState.inventoryDispositions[0]).toMatchObject({ status: 'posted', availableQuantityBefore: 0, postedUnitCost: 42, postedTotalValue: 210 });
    expect(openingState.inventoryBatches[0]).toMatchObject({ batchNumber: 'OPEN-2607', expiresAt: '2027-07-01', status: 'released' });
    expect(openingState.binBalances[0]).toMatchObject({ quantity: 5, available: 5, unitCost: 42, inventoryValue: 210 });
    expect(openingState.inventoryLedger[0]).toMatchObject({ type: 'receipt', quantity: 5, value: 210, reference: openingState.inventoryDispositions[0]!.number });
  });

  it('enforces serial-specific valuation boundaries', () => {
    let state = foundation();
    state.inventoryItems = [];
    state.itemVariants = [];
    expect(() => createInventoryItem(state, { productId: 'product-distributor-platform', code: 'BAD-SERIAL', name: 'Bad serial item', baseUomId: 'uom-unit', tracking: 'serial', valuationMethod: 'fifo' })).toThrow('specific-identification');
    state = createInventoryItem(state, { productId: 'product-distributor-platform', code: 'MOTOR', name: 'Traceable motor', baseUomId: 'uom-unit', tracking: 'serial', valuationMethod: 'specific-identification' }, 'item-motor');
    state = createItemVariant(state, { itemId: 'item-motor', sku: 'MOTOR-1HP', name: 'One HP motor', attributes: { power: '1HP' } }, 'variant-motor');
    expect(() => receiveInventory(state, { warehouseId: 'wh-mum', receivingBinId: 'bin-mum-rcv', itemVariantId: 'variant-motor', quantity: 2, uomId: 'uom-unit', unitCost: 5000, reference: 'GRN-MOTOR-1', receivedAt: T0, serialNumbers: ['M001'] }, 'user-avery')).toThrow('exactly one unique serial');
    state = receiveInventory(state, { warehouseId: 'wh-mum', receivingBinId: 'bin-mum-rcv', itemVariantId: 'variant-motor', quantity: 2, uomId: 'uom-unit', unitCost: 5000, reference: 'GRN-MOTOR-1', receivedAt: T0, serialNumbers: ['M001', 'M002'] }, 'user-avery');
    expect(state.serialUnits).toHaveLength(2);
    expect(state.inventoryCostLayers.map(({ serialUnitId }) => serialUnitId)).toEqual(state.serialUnits.map(({ id }) => id));
    state = createPutawayTask(state, { itemVariantId: 'variant-motor', serialUnitIds: [state.serialUnits[0]!.id], fromBinId: 'bin-mum-rcv', toBinId: 'bin-mum-pck', quantity: 1, assignedTo: 'user-lee', dueAt: '2026-07-16T08:00:00.000Z', priority: 'normal' }, 'user-avery', 'put-serial');
    state = transitionWarehouseTask(state, { id: 'put-serial', toStatus: 'in-progress', expectedVersion: 1 }, 'user-lee');
    state = transitionWarehouseTask(state, { id: 'put-serial', toStatus: 'completed', expectedVersion: 2 }, 'user-lee');
    expect(state.serialUnits.filter(({ binId }) => binId === 'bin-mum-pck')).toHaveLength(1);
    expect(state.serialUnits.filter(({ binId }) => binId === 'bin-mum-rcv')).toHaveLength(1);
  });
});
