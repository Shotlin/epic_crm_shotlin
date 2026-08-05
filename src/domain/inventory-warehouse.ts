import { createHash, randomUUID } from 'node:crypto';
import type {
  BinBalance,
  CreateCycleCountInput,
  CreateInventoryItemInput,
  CreateInventoryDispositionInput,
  CreateInventoryTransferInput,
  CreateInventoryValuationReviewInput,
  CreateItemVariantInput,
  CreatePickTaskInput,
  CreatePutawayTaskInput,
  CreateReorderPolicyInput,
  CreateStorageBinInput,
  CreateUomConversionInput,
  CreateUomInput,
  CreateWarehouseInput,
  CreateWarehouseZoneInput,
  DecideCycleCountInput,
  DecideInventoryValuationReviewInput,
  DecideInventoryDispositionInput,
  DecideReorderProposalInput,
  InventoryLedgerEntry,
  InventoryDisposition,
  InventoryTransfer,
  ReceiveInventoryInput,
  RecordCycleCountInput,
  ReorderProposal,
  TransitionInventoryTransferInput,
  TransitionWarehouseTaskInput,
  ConsumeInventoryForProductionInput,
  IssueRetailInventoryInput,
  ReturnRetailInventoryInput,
  PostInventoryDispositionInput,
  WarehouseTask,
} from '../shared/inventory-contracts';
import type { RevenueOpsState, StockMovement, StockPosition } from '../shared/revenue-ops-contracts';
import { isIndiaStateCode } from './revenue-ops';
import { toIndiaBusinessDate } from '../shared/india-business-date';

const round = (value: number, precision = 6): number => Number(value.toFixed(precision));
const clean = (value: string, label: string, min = 2, max = 120): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`);
  return normalized;
};
const positive = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive.`);
  return round(value);
};
const checksum = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fiscalNumber = (prefix: string, sequence: number, at: string): string => {
  const businessDate = toIndiaBusinessDate(at);
  const [yearToken, monthToken] = businessDate.split('-');
  const year = Number(yearToken);
  const month = Number(monthToken);
  if (!Number.isInteger(year) || !Number.isInteger(month)) throw new Error('Inventory document date is invalid.');
  const financialYear = month >= 4 ? year : year - 1;
  return `${prefix}/${String(financialYear).slice(-2)}-${String(financialYear + 1).slice(-2)}/${String(sequence).padStart(5, '0')}`;
};

function mutate(state: RevenueOpsState): RevenueOpsState {
  const next = structuredClone(state);
  next.revision += 1;
  return next;
}

function isInActiveScope(state: RevenueOpsState, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

function assertSameInventoryScope(
  state: RevenueOpsState,
  records: Array<{ scope?: RevenueOpsState['scope'] }>,
  label: string,
): void {
  if (records.some((record) => !isInActiveScope(state, record))) {
    throw new Error(`${label} must belong to the active company and branch scope.`);
  }
}

function warehouseForBin(state: RevenueOpsState, binId: string) {
  const bin = state.storageBins.find(({ id }) => id === binId);
  const zone = bin && state.warehouseZones.find(({ id }) => id === bin.zoneId);
  const warehouse = zone && state.warehouses.find(({ id }) => id === zone.warehouseId);
  if (!bin || !zone || !warehouse) throw new Error('Warehouse bin hierarchy is incomplete.');
  assertSameInventoryScope(state, [bin, zone, warehouse], 'Warehouse bin hierarchy');
  return { bin, zone, warehouse };
}

function itemForVariant(state: RevenueOpsState, variantId: string) {
  const variant = state.itemVariants.find(({ id, active }) => id === variantId && active);
  const item = variant && state.inventoryItems.find(({ id, active }) => id === variant.itemId && active);
  if (!variant || !item) throw new Error('Active inventory variant not found.');
  assertSameInventoryScope(state, [variant, item], 'Inventory variant');
  return { variant, item };
}

function balanceKey(binId: string, itemVariantId: string, batchId?: string): string {
  return `${binId}|${itemVariantId}|${batchId ?? ''}`;
}

function findBalance(state: RevenueOpsState, binId: string, itemVariantId: string, batchId?: string): BinBalance | undefined {
  const key = balanceKey(binId, itemVariantId, batchId);
  return state.binBalances.find((candidate) => isInActiveScope(state, candidate) && balanceKey(candidate.binId, candidate.itemVariantId, candidate.batchId) === key);
}

function upsertBalance(state: RevenueOpsState, binId: string, itemVariantId: string, batchId: string | undefined, quantityDelta: number, reservedDelta: number, pickedDelta: number, unitCost?: number): BinBalance {
  const existing = findBalance(state, binId, itemVariantId, batchId);
  const quantity = round((existing?.quantity ?? 0) + quantityDelta);
  const reserved = round((existing?.reserved ?? 0) + reservedDelta);
  const picked = round((existing?.picked ?? 0) + pickedDelta);
  if (quantity < 0 || reserved < 0 || picked < 0 || reserved + picked > quantity) throw new Error('Bin operation exceeds its controlled quantity.');
  const oldValue = existing?.inventoryValue ?? 0;
  const addedValue = quantityDelta > 0 ? quantityDelta * (unitCost ?? existing?.unitCost ?? 0) : quantityDelta * (existing?.unitCost ?? unitCost ?? 0);
  const inventoryValue = quantity === 0 ? 0 : Math.max(0, round(oldValue + addedValue, 2));
  const effectiveCost = quantity === 0 ? 0 : round(inventoryValue / quantity, 4);
  const updated: BinBalance = {
    id: existing?.id ?? randomUUID(), binId, itemVariantId, batchId, quantity, reserved, picked,
    available: round(quantity - reserved - picked), unitCost: effectiveCost, inventoryValue, scope: structuredClone(existing?.scope ?? state.scope), version: (existing?.version ?? 0) + 1,
  };
  state.binBalances = existing ? state.binBalances.map((candidate) => candidate.id === updated.id ? updated : candidate) : [...state.binBalances, updated];
  return updated;
}

function addLedger(state: RevenueOpsState, entry: Omit<InventoryLedgerEntry, 'id' | 'checksum' | 'scope'>): void {
  const payload = { ...entry, scope: structuredClone(state.scope) };
  const record = { ...payload, id: randomUUID(), checksum: checksum(payload) };
  state.inventoryLedger = [record, ...state.inventoryLedger];
}

function syncLegacyStock(state: RevenueOpsState, warehouseId: string, itemVariantId: string, quantityDelta: number, reference: string, actorId: string, at: string, type: StockMovement['type']): void {
  const warehouse = state.warehouses.find((candidate) => candidate.id === warehouseId && isInActiveScope(state, candidate));
  const { item } = itemForVariant(state, itemVariantId);
  if (!warehouse) throw new Error('Warehouse not found.');
  const existing = state.stockPositions.find((candidate) => isInActiveScope(state, candidate) && candidate.locationId === warehouse.stockLocationId && candidate.productId === item.productId);
  const onHand = round((existing?.onHand ?? 0) + quantityDelta);
  const reserved = existing?.reserved ?? 0;
  if (onHand < reserved) throw new Error('Inventory operation would breach reserved stock.');
  const position: StockPosition = { id: existing?.id ?? randomUUID(), locationId: warehouse.stockLocationId, productId: item.productId, onHand, reserved, available: round(onHand - reserved), scope: structuredClone(existing?.scope ?? state.scope), version: (existing?.version ?? 0) + 1 };
  state.stockPositions = existing ? state.stockPositions.map((candidate) => candidate.id === position.id ? position : candidate) : [...state.stockPositions, position];
  const movement: StockMovement = { id: randomUUID(), locationId: warehouse.stockLocationId, productId: item.productId, type, quantity: Math.abs(quantityDelta), reference, occurredAt: at, recordedBy: actorId, resultingOnHand: onHand, resultingReserved: reserved, scope: structuredClone(position.scope ?? state.scope) };
  state.stockMovements = [movement, ...state.stockMovements];
}

export function createUom(state: RevenueOpsState, input: CreateUomInput, id: string = randomUUID()): RevenueOpsState {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{0,11}$/.test(code)) throw new Error('UOM code must use 1-12 letters, numbers, or dashes.');
  if (state.uoms.some((candidate) => candidate.code === code)) throw new Error('UOM code already exists.');
  if (!Number.isInteger(input.precision) || input.precision < 0 || input.precision > 6) throw new Error('UOM precision must be 0-6.');
  const next = mutate(state);
  next.uoms.push({ id, code, name: clean(input.name, 'UOM name'), category: input.category, precision: input.precision, active: true, scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function createUomConversion(state: RevenueOpsState, input: CreateUomConversionInput, id: string = randomUUID()): RevenueOpsState {
  const item = state.inventoryItems.find(({ id: candidate }) => candidate === input.itemId);
  const from = state.uoms.find(({ id: candidate, active }) => candidate === input.fromUomId && active);
  const to = state.uoms.find(({ id: candidate, active }) => candidate === input.toUomId && active);
  if (!item || !from || !to || from.category !== to.category || input.fromUomId === input.toUomId) throw new Error('Conversion requires two compatible UOMs and an inventory item.');
  if (state.uomConversions.some((candidate) => candidate.itemId === item.id && candidate.fromUomId === from.id && candidate.toUomId === to.id)) throw new Error('This item conversion already exists.');
  const next = mutate(state);
  next.uomConversions.push({ id, ...input, factor: positive(input.factor, 'Conversion factor'), scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function createInventoryItem(state: RevenueOpsState, input: CreateInventoryItemInput, id: string = randomUUID()): RevenueOpsState {
  const product = state.products.find(({ id: candidate, kind, active }) => candidate === input.productId && kind === 'goods' && active);
  const uom = state.uoms.find(({ id: candidate, active }) => candidate === input.baseUomId && active);
  const code = input.code.trim().toUpperCase();
  if (!product || !uom) throw new Error('Inventory item requires an active goods product and base UOM.');
  if (!/^[A-Z0-9][A-Z0-9-]{1,23}$/.test(code) || state.inventoryItems.some((candidate) => candidate.code === code || candidate.productId === product.id)) throw new Error('Inventory item code or product link is invalid or already used.');
  if (input.tracking === 'serial' && input.valuationMethod !== 'specific-identification') throw new Error('Serial-controlled items require specific-identification valuation.');
  if (input.valuationMethod === 'specific-identification' && input.tracking !== 'serial') throw new Error('Specific identification requires serial control.');
  if (input.shelfLifeDays !== undefined && (!Number.isInteger(input.shelfLifeDays) || input.shelfLifeDays < 1)) throw new Error('Shelf life must be a positive whole number of days.');
  const next = mutate(state);
  next.inventoryItems.push({ id, productId: product.id, code, name: clean(input.name, 'Item name'), baseUomId: uom.id, tracking: input.tracking, valuationMethod: input.valuationMethod, shelfLifeDays: input.shelfLifeDays, active: true, scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function createItemVariant(state: RevenueOpsState, input: CreateItemVariantInput, id: string = randomUUID()): RevenueOpsState {
  if (!state.inventoryItems.some(({ id: candidate, active }) => candidate === input.itemId && active)) throw new Error('Active inventory item not found.');
  const sku = input.sku.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(sku) || state.itemVariants.some((candidate) => candidate.sku === sku)) throw new Error('Variant SKU is invalid or already exists.');
  if (input.barcode && state.itemVariants.some(({ barcode }) => barcode === input.barcode!.trim())) throw new Error('Barcode already belongs to another variant.');
  const attributes = Object.fromEntries(Object.entries(input.attributes).map(([key, value]) => [clean(key, 'Attribute name', 1, 40), clean(value, 'Attribute value', 1, 80)]));
  const next = mutate(state);
  next.itemVariants.push({ id, itemId: input.itemId, sku, name: clean(input.name, 'Variant name'), attributes, barcode: input.barcode?.trim(), active: true, scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function createWarehouse(state: RevenueOpsState, input: CreateWarehouseInput, id: string = randomUUID()): RevenueOpsState {
  const location = state.stockLocations.find((candidate) => candidate.id === input.stockLocationId && candidate.active && isInActiveScope(state, candidate));
  const code = input.code.trim().toUpperCase();
  if (!location || location.stateCode !== input.stateCode || !isIndiaStateCode(input.stateCode)) throw new Error('Warehouse must link to an active stock location in the same state.');
  if (!/^[A-Z][A-Z0-9-]{1,15}$/.test(code) || state.warehouses.some((candidate) => isInActiveScope(state, candidate) && (candidate.code === code || candidate.stockLocationId === location.id))) throw new Error('Warehouse code or stock-location link is invalid or already used.');
  const next = mutate(state);
  next.warehouses.push({ id, code, name: clean(input.name, 'Warehouse name'), stateCode: input.stateCode, stockLocationId: location.id, active: true, scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function createWarehouseZone(state: RevenueOpsState, input: CreateWarehouseZoneInput, id: string = randomUUID()): RevenueOpsState {
  if (!state.warehouses.some(({ id: candidate, active }) => candidate === input.warehouseId && active)) throw new Error('Active warehouse not found.');
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{0,15}$/.test(code) || state.warehouseZones.some((candidate) => candidate.warehouseId === input.warehouseId && candidate.code === code)) throw new Error('Zone code is invalid or already exists in this warehouse.');
  const next = mutate(state);
  next.warehouseZones.push({ id, warehouseId: input.warehouseId, code, name: clean(input.name, 'Zone name'), purpose: input.purpose, active: true, scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function createStorageBin(state: RevenueOpsState, input: CreateStorageBinInput, id: string = randomUUID()): RevenueOpsState {
  if (!state.warehouseZones.some(({ id: candidate, active }) => candidate === input.zoneId && active)) throw new Error('Active warehouse zone not found.');
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{0,19}$/.test(code) || state.storageBins.some((candidate) => candidate.zoneId === input.zoneId && candidate.code === code)) throw new Error('Bin code is invalid or already exists in this zone.');
  if (!Number.isInteger(input.pickSequence) || input.pickSequence < 1) throw new Error('Pick sequence must be a positive whole number.');
  const next = mutate(state);
  next.storageBins.push({ id, zoneId: input.zoneId, code, name: clean(input.name, 'Bin name'), capacity: positive(input.capacity, 'Bin capacity'), pickSequence: input.pickSequence, status: 'available', scope: structuredClone(next.scope), version: 1 });
  return next;
}

function convertToBase(state: RevenueOpsState, itemId: string, fromUomId: string, quantity: number): number {
  const item = state.inventoryItems.find(({ id }) => id === itemId)!;
  if (fromUomId === item.baseUomId) return positive(quantity, 'Receipt quantity');
  const conversion = state.uomConversions.find((candidate) => candidate.itemId === itemId && candidate.fromUomId === fromUomId && candidate.toUomId === item.baseUomId);
  if (!conversion) throw new Error('No approved conversion exists from receipt UOM to the item base UOM.');
  return round(positive(quantity, 'Receipt quantity') * conversion.factor);
}

export function receiveInventory(state: RevenueOpsState, input: ReceiveInventoryInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const next = mutate(state);
  const { item } = itemForVariant(next, input.itemVariantId);
  const { bin, zone, warehouse } = warehouseForBin(next, input.receivingBinId);
  assertSameInventoryScope(next, [item, warehouse], 'Inventory receipt');
  if (warehouse.id !== input.warehouseId || !['receiving', 'quarantine', 'returns'].includes(zone.purpose) || bin.status !== 'available') throw new Error('Receipt requires an available receiving, quarantine, or returns bin in the selected warehouse.');
  const quantity = convertToBase(next, item.id, input.uomId, input.quantity);
  const unitCost = positive(input.unitCost, 'Unit cost');
  const reference = clean(input.reference, 'Receipt reference', 3, 120);
  if (!Number.isFinite(Date.parse(input.receivedAt))) throw new Error('Receipt date is invalid.');
  if (next.inventoryLedger.some(({ type, itemVariantId, warehouseId, reference: candidate }) => type === 'receipt' && itemVariantId === input.itemVariantId && warehouseId === warehouse.id && candidate === reference)) throw new Error('Receipt reference already exists for this variant and warehouse.');
  let batchId: string | undefined;
  if (item.tracking === 'batch') {
    if (!input.batchNumber?.trim()) throw new Error('Batch-controlled receipt requires a batch number.');
    const existing = next.inventoryBatches.find(({ itemVariantId, batchNumber }) => itemVariantId === input.itemVariantId && batchNumber === input.batchNumber!.trim().toUpperCase());
    if (existing?.status === 'recalled' || existing?.status === 'expired') throw new Error('Receipt cannot use a recalled or expired batch.');
    if (input.expiresAt && Date.parse(input.expiresAt) <= Date.parse(input.receivedAt)) throw new Error('Batch expiry must be after receipt.');
    if (existing) batchId = existing.id;
    else {
      batchId = randomUUID();
      next.inventoryBatches.push({ id: batchId, itemVariantId: input.itemVariantId, batchNumber: input.batchNumber.trim().toUpperCase(), manufacturedAt: input.manufacturedAt, expiresAt: input.expiresAt, status: input.expiresAt && input.expiresAt < now.slice(0, 10) ? 'expired' : 'released', scope: structuredClone(next.scope), version: 1 });
    }
  } else if (input.batchNumber) throw new Error('Batch details are only allowed for batch-controlled items.');
  if (item.tracking === 'serial') {
    if (quantity !== Math.trunc(quantity) || input.serialNumbers.length !== quantity) throw new Error('Serial receipt requires exactly one unique serial per base unit.');
    const serials = input.serialNumbers.map((value) => value.trim().toUpperCase());
    if (new Set(serials).size !== serials.length || serials.some((serial) => next.serialUnits.some(({ serialNumber }) => serialNumber === serial))) throw new Error('Serial numbers must be unique across inventory.');
    next.serialUnits.push(...serials.map((serialNumber) => ({ id: randomUUID(), itemVariantId: input.itemVariantId, serialNumber, binId: bin.id, status: 'available' as const, specificCost: unitCost, scope: structuredClone(next.scope), version: 1 })));
  } else if (input.serialNumbers.length) throw new Error('Serial numbers are only allowed for serial-controlled items.');
  const balance = upsertBalance(next, bin.id, input.itemVariantId, batchId, quantity, 0, 0, unitCost);
  if (item.valuationMethod === 'moving-average') {
    const open = next.inventoryCostLayers.filter((layer) => layer.itemVariantId === input.itemVariantId && layer.warehouseId === warehouse.id && layer.status === 'open');
    const oldQuantity = open.reduce((total, layer) => total + layer.remainingQuantity, 0);
    const oldValue = open.reduce((total, layer) => total + layer.remainingQuantity * layer.unitCost, 0);
    next.inventoryCostLayers = next.inventoryCostLayers.filter((layer) => !open.includes(layer));
    next.inventoryCostLayers.push({ id: randomUUID(), itemVariantId: input.itemVariantId, warehouseId: warehouse.id, receivedAt: input.receivedAt, remainingQuantity: round(oldQuantity + quantity), unitCost: round((oldValue + quantity * unitCost) / (oldQuantity + quantity), 4), sourceReference: reference, status: 'open', scope: structuredClone(next.scope), version: 1 });
  } else if (item.valuationMethod === 'specific-identification') {
    const serials = next.serialUnits.filter(({ itemVariantId, binId }) => itemVariantId === input.itemVariantId && binId === bin.id).slice(-quantity);
    next.inventoryCostLayers.push(...serials.map((serial) => ({ id: randomUUID(), itemVariantId: input.itemVariantId, warehouseId: warehouse.id, serialUnitId: serial.id, receivedAt: input.receivedAt, remainingQuantity: 1, unitCost, sourceReference: reference, status: 'open' as const, scope: structuredClone(next.scope), version: 1 })));
  } else {
    next.inventoryCostLayers.push({ id: randomUUID(), itemVariantId: input.itemVariantId, warehouseId: warehouse.id, batchId, receivedAt: input.receivedAt, remainingQuantity: quantity, unitCost, sourceReference: reference, status: 'open', scope: structuredClone(next.scope), version: 1 });
  }
  addLedger(next, { type: 'receipt', itemVariantId: input.itemVariantId, warehouseId: warehouse.id, binId: bin.id, batchId, quantity, unitCost, value: round(quantity * unitCost, 2), reference, occurredAt: input.receivedAt, recordedBy: actorId, resultingQuantity: balance.quantity });
  syncLegacyStock(next, warehouse.id, input.itemVariantId, quantity, reference, actorId, input.receivedAt, 'receipt');
  return next;
}

function taskNumber(state: RevenueOpsState, type: WarehouseTask['type'], at: string): string {
  return fiscalNumber(type === 'putaway' ? 'PUT' : 'PCK', state.warehouseTasks.filter((task) => task.type === type).length + 1, at);
}

export function createPutawayTask(state: RevenueOpsState, input: CreatePutawayTaskInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const from = warehouseForBin(state, input.fromBinId); const to = warehouseForBin(state, input.toBinId);
  assertSameInventoryScope(state, [from.warehouse, to.warehouse], 'Putaway');
  if (from.warehouse.id !== to.warehouse.id || from.zone.purpose !== 'receiving' || !['storage', 'picking'].includes(to.zone.purpose) || to.bin.status !== 'available') throw new Error('Putaway must move from receiving to an available storage or picking bin in one warehouse.');
  const balance = findBalance(state, from.bin.id, input.itemVariantId, input.batchId);
  if (!balance || balance.available < input.quantity) throw new Error('Putaway exceeds available receiving-bin quantity.');
  const { item } = itemForVariant(state, input.itemVariantId);
  const quantity = positive(input.quantity, 'Putaway quantity');
  const serialUnitIds = [...(input.serialUnitIds ?? [])];
  if (item.tracking === 'serial') {
    if (serialUnitIds.length !== quantity || serialUnitIds.some((serialId) => !state.serialUnits.some(({ id: candidate, binId, status, itemVariantId }) => candidate === serialId && binId === from.bin.id && status === 'available' && itemVariantId === input.itemVariantId))) throw new Error('Serial putaway requires one available source-bin serial per unit.');
  } else if (serialUnitIds.length) throw new Error('Serial selection is only allowed for serial-controlled putaway.');
  const next = mutate(state);
  next.warehouseTasks.push({ id, number: taskNumber(state, 'putaway', now), type: 'putaway', sourceId: actorId, itemVariantId: input.itemVariantId, batchId: input.batchId, serialUnitIds, fromBinId: input.fromBinId, toBinId: input.toBinId, quantity, priority: input.priority, assignedTo: clean(input.assignedTo, 'Assignee', 2, 80), dueAt: input.dueAt, status: 'planned', scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function createPickTask(state: RevenueOpsState, input: CreatePickTaskInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const reservation = state.stockReservations.find(({ id: candidate }) => candidate === input.reservationId);
  const { item } = itemForVariant(state, input.itemVariantId);
  const { bin, zone, warehouse } = warehouseForBin(state, input.fromBinId);
  if (!reservation) throw new Error('Pick task requires a compatible active stock reservation.');
  assertSameInventoryScope(state, [reservation, item, warehouse], 'Pick task');
  if (!['reserved', 'packed'].includes(reservation.status) || reservation.locationId !== warehouse.stockLocationId || item.productId !== reservation.productId) throw new Error('Pick task requires a compatible active stock reservation.');
  if (!['storage', 'picking'].includes(zone.purpose) || bin.status !== 'available') throw new Error('Pick source must be an available storage or picking bin.');
  const quantity = positive(input.quantity, 'Pick quantity');
  const balance = findBalance(state, bin.id, input.itemVariantId, input.batchId);
  const already = state.warehouseTasks.filter(({ type, sourceId, status }) => type === 'pick' && sourceId === reservation.id && !['cancelled'].includes(status)).reduce((total, task) => total + task.quantity, 0);
  if (!balance || balance.available < quantity || already + quantity > reservation.quantity) throw new Error('Pick exceeds bin availability or reservation quantity.');
  if (input.batchId) {
    const batch = state.inventoryBatches.find(({ id: candidate }) => candidate === input.batchId);
    if (!batch || batch.status !== 'released' || (batch.expiresAt && batch.expiresAt < now.slice(0, 10))) throw new Error('Only released, unexpired batches can be picked.');
  }
  if (item.tracking === 'serial') {
    if (input.serialUnitIds.length !== quantity) throw new Error('Serial pick requires one selected serial per unit.');
    if (input.serialUnitIds.some((serialId) => !state.serialUnits.some(({ id: candidate, binId, status, itemVariantId }) => candidate === serialId && binId === bin.id && status === 'available' && itemVariantId === input.itemVariantId))) throw new Error('Selected serial is unavailable in this bin.');
  }
  const next = mutate(state);
  upsertBalance(next, bin.id, input.itemVariantId, input.batchId, 0, quantity, 0);
  next.serialUnits = next.serialUnits.map((serial) => input.serialUnitIds.includes(serial.id) ? { ...serial, status: 'reserved', version: serial.version + 1 } : serial);
  next.warehouseTasks.push({ id, number: taskNumber(state, 'pick', now), type: 'pick', sourceId: reservation.id, itemVariantId: input.itemVariantId, batchId: input.batchId, serialUnitIds: [...input.serialUnitIds], fromBinId: bin.id, quantity, priority: input.priority, assignedTo: clean(input.assignedTo, 'Assignee', 2, 80), dueAt: input.dueAt, status: 'planned', scope: structuredClone(next.scope), version: 1 });
  return next;
}

const TASK_TRANSITIONS: Record<WarehouseTask['status'], WarehouseTask['status'][]> = { planned: ['in-progress', 'cancelled', 'blocked'], 'in-progress': ['completed', 'blocked', 'cancelled'], blocked: ['in-progress', 'cancelled'], completed: [], cancelled: [] };

export function transitionWarehouseTask(state: RevenueOpsState, input: TransitionWarehouseTaskInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const task = state.warehouseTasks.find(({ id }) => id === input.id);
  if (!task || task.version !== input.expectedVersion || !TASK_TRANSITIONS[task.status].includes(input.toStatus)) throw new Error('Warehouse task transition is stale or not allowed.');
  if (input.toStatus === 'blocked' && !input.blockedReason?.trim()) throw new Error('Blocked task requires a reason.');
  const next = mutate(state);
  const updated: WarehouseTask = { ...task, status: input.toStatus, blockedReason: input.toStatus === 'blocked' ? clean(input.blockedReason!, 'Blocked reason', 3, 160) : undefined, completedAt: input.toStatus === 'completed' ? now : task.completedAt, version: task.version + 1 };
  if (input.toStatus === 'cancelled' && task.type === 'pick') {
    upsertBalance(next, task.fromBinId, task.itemVariantId, task.batchId, 0, -task.quantity, 0);
    next.serialUnits = next.serialUnits.map((serial) => task.serialUnitIds.includes(serial.id) ? { ...serial, status: 'available', version: serial.version + 1 } : serial);
  }
  if (input.toStatus === 'completed') {
    const from = warehouseForBin(next, task.fromBinId);
    const source = findBalance(next, task.fromBinId, task.itemVariantId, task.batchId);
    if (!source) throw new Error('Task source balance no longer exists.');
    if (task.type === 'putaway') {
      const to = warehouseForBin(next, task.toBinId!);
      upsertBalance(next, task.fromBinId, task.itemVariantId, task.batchId, -task.quantity, 0, 0);
      const target = upsertBalance(next, task.toBinId!, task.itemVariantId, task.batchId, task.quantity, 0, 0, source.unitCost);
      next.serialUnits = next.serialUnits.map((serial) => task.serialUnitIds.includes(serial.id) ? { ...serial, binId: task.toBinId!, version: serial.version + 1 } : serial);
      addLedger(next, { type: 'putaway', itemVariantId: task.itemVariantId, warehouseId: to.warehouse.id, binId: task.toBinId!, batchId: task.batchId, quantity: task.quantity, unitCost: source.unitCost, value: 0, reference: task.number, occurredAt: now, recordedBy: actorId, resultingQuantity: target.quantity });
    } else {
      const balance = upsertBalance(next, task.fromBinId, task.itemVariantId, task.batchId, 0, -task.quantity, task.quantity);
      next.serialUnits = next.serialUnits.map((serial) => task.serialUnitIds.includes(serial.id) ? { ...serial, status: 'picked', version: serial.version + 1 } : serial);
      addLedger(next, { type: 'pick', itemVariantId: task.itemVariantId, warehouseId: from.warehouse.id, binId: task.fromBinId, batchId: task.batchId, quantity: task.quantity, unitCost: source.unitCost, value: 0, reference: task.number, occurredAt: now, recordedBy: actorId, resultingQuantity: balance.quantity });
    }
  }
  next.warehouseTasks = next.warehouseTasks.map((candidate) => candidate.id === updated.id ? updated : candidate);
  return next;
}

function consumeLayers(state: RevenueOpsState, itemVariantId: string, warehouseId: string, quantity: number, batchId?: string, serialUnitIds: string[] = []): number {
  const { item } = itemForVariant(state, itemVariantId);
  let remaining = quantity; let value = 0;
  const layers = state.inventoryCostLayers.filter((layer) => layer.itemVariantId === itemVariantId && layer.warehouseId === warehouseId && layer.status === 'open')
    // Batch identity is a physical traceability boundary, regardless of the cost-flow method.
    .filter((layer) => !batchId || layer.batchId === batchId)
    .filter((layer) => item.valuationMethod !== 'specific-identification' || (layer.serialUnitId && serialUnitIds.includes(layer.serialUnitId)))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  for (const layer of layers) {
    const take = Math.min(remaining, layer.remainingQuantity);
    layer.remainingQuantity = round(layer.remainingQuantity - take); layer.status = layer.remainingQuantity === 0 ? 'consumed' : 'open'; layer.version += 1;
    value += take * layer.unitCost; remaining = round(remaining - take);
    if (remaining === 0) break;
  }
  if (remaining > 0) throw new Error('Cost layers are insufficient for this issue.');
  return round(value, 2);
}

export function issuePickedInventory(state: RevenueOpsState, reservationId: string, actorId: string, reference: string, now = new Date().toISOString()): RevenueOpsState {
  const tasks = state.warehouseTasks.filter((task) => task.type === 'pick' && task.sourceId === reservationId && task.status === 'completed');
  if (!tasks.length) return state;
  const next = mutate(state);
  for (const task of tasks) {
    const { warehouse } = warehouseForBin(next, task.fromBinId);
    const balance = findBalance(next, task.fromBinId, task.itemVariantId, task.batchId);
    if (!balance || balance.picked < task.quantity) throw new Error('Picked inventory is no longer available for issue.');
    const value = consumeLayers(next, task.itemVariantId, warehouse.id, task.quantity, task.batchId, task.serialUnitIds);
    const updated = upsertBalance(next, task.fromBinId, task.itemVariantId, task.batchId, -task.quantity, 0, -task.quantity);
    next.serialUnits = next.serialUnits.map((serial) => task.serialUnitIds.includes(serial.id) ? { ...serial, status: 'issued', version: serial.version + 1 } : serial);
    addLedger(next, { type: 'issue', itemVariantId: task.itemVariantId, warehouseId: warehouse.id, binId: task.fromBinId, batchId: task.batchId, quantity: -task.quantity, unitCost: round(value / task.quantity, 4), value: -value, reference, occurredAt: now, recordedBy: actorId, resultingQuantity: updated.quantity });
  }
  return next;
}

/** Controlled direct issue for production: preserves bin availability, traceability and cost layers. */
export function consumeInventoryForProduction(state: RevenueOpsState, input: ConsumeInventoryForProductionInput, actorId: string): { state: RevenueOpsState; totalCost: number; unitCost: number } {
  const { item } = itemForVariant(state, input.itemVariantId);
  const { bin, warehouse } = warehouseForBin(state, input.binId);
  const quantity = positive(input.quantity, 'Production issue quantity');
  if (warehouse.id !== input.warehouseId || bin.status !== 'available') throw new Error('Production issue requires an available bin in the selected warehouse.');
  if (!Number.isFinite(Date.parse(input.occurredAt))) throw new Error('Production issue time is invalid.');
  const balance = findBalance(state, bin.id, input.itemVariantId, input.batchId);
  if (!balance || balance.available < quantity) throw new Error('Production issue exceeds available bin quantity.');
  if (item.tracking === 'batch') {
    const batch = input.batchId && state.inventoryBatches.find(({ id }) => id === input.batchId);
    if (!batch || batch.status !== 'released' || (batch.expiresAt && batch.expiresAt < input.occurredAt.slice(0, 10))) throw new Error('Production issue requires a released, unexpired batch.');
  } else if (input.batchId) throw new Error('Only batch-controlled material can include a batch selection.');
  if (item.tracking === 'serial') {
    if (quantity !== Math.trunc(quantity) || input.serialUnitIds.length !== quantity || new Set(input.serialUnitIds).size !== input.serialUnitIds.length || input.serialUnitIds.some((serialId) => !state.serialUnits.some(({ id, itemVariantId, binId, status }) => id === serialId && itemVariantId === input.itemVariantId && binId === bin.id && status === 'available'))) throw new Error('Serial production issue requires one available source-bin serial per unit.');
  } else if (input.serialUnitIds.length) throw new Error('Serial selection is only allowed for serial-controlled material.');
  const next = mutate(state);
  const totalCost = consumeLayers(next, input.itemVariantId, warehouse.id, quantity, input.batchId, input.serialUnitIds);
  const updated = upsertBalance(next, bin.id, input.itemVariantId, input.batchId, -quantity, 0, 0);
  next.serialUnits = next.serialUnits.map((serial) => input.serialUnitIds.includes(serial.id) ? { ...serial, status: 'issued', version: serial.version + 1 } : serial);
  const unitCost = round(totalCost / quantity, 4);
  addLedger(next, { type: 'production-issue', itemVariantId: input.itemVariantId, warehouseId: warehouse.id, binId: bin.id, batchId: input.batchId, quantity: -quantity, unitCost, value: -totalCost, reference: clean(input.reference, 'Production issue reference', 3, 120), occurredAt: input.occurredAt, recordedBy: actorId, resultingQuantity: updated.quantity });
  syncLegacyStock(next, warehouse.id, input.itemVariantId, -quantity, input.reference, actorId, input.occurredAt, 'issue');
  return { state: next, totalCost, unitCost };
}

/**
 * Direct point-of-sale issue. Unlike a warehouse pick/dispatch path, a retail
 * customer takes possession at the counter. This updates physical balances,
 * traceability, cost layers and the legacy availability projection exactly
 * once; the caller owns the paired commercial and accounting evidence.
 */
export function issueRetailInventoryAtCounter(
  state: RevenueOpsState,
  input: IssueRetailInventoryInput,
  actorId: string,
): { state: RevenueOpsState; totalCost: number; unitCost: number } {
  const { item } = itemForVariant(state, input.itemVariantId);
  const { bin, zone, warehouse } = warehouseForBin(state, input.binId);
  const quantity = positive(input.quantity, 'Retail sale quantity');
  if (warehouse.id !== input.warehouseId || bin.status !== 'available' || (zone.purpose !== 'storage' && zone.purpose !== 'picking')) {
    throw new Error('Retail checkout requires an available storage or picking bin in the configured warehouse.');
  }
  if (!Number.isFinite(Date.parse(input.occurredAt))) throw new Error('Retail sale time is invalid.');
  const balance = findBalance(state, bin.id, input.itemVariantId, input.batchId);
  if (!balance || balance.available < quantity) throw new Error('Retail checkout exceeds available counter-bin stock.');
  const businessDate = toIndiaBusinessDate(input.occurredAt);
  if (item.tracking === 'batch') {
    const batch = input.batchId && state.inventoryBatches.find(({ id }) => id === input.batchId);
    if (!batch || batch.itemVariantId !== input.itemVariantId || batch.status !== 'released' || (batch.expiresAt && batch.expiresAt < businessDate)) {
      throw new Error('Retail checkout requires a released, unexpired batch from the selected item.');
    }
  } else if (input.batchId) {
    throw new Error('Only batch-controlled retail items can include a batch selection.');
  }
  if (item.tracking === 'serial') {
    if (
      quantity !== Math.trunc(quantity) ||
      input.serialUnitIds.length !== quantity ||
      new Set(input.serialUnitIds).size !== input.serialUnitIds.length ||
      input.serialUnitIds.some((serialId) => !state.serialUnits.some(({ id, itemVariantId, binId, batchId, status }) =>
        id === serialId && itemVariantId === input.itemVariantId && binId === bin.id && status === 'available' && (!input.batchId || batchId === input.batchId),
      ))
    ) {
      throw new Error('Serial retail checkout requires one available source-bin serial per unit.');
    }
  } else if (input.serialUnitIds.length) {
    throw new Error('Serial selection is only allowed for serial-controlled retail items.');
  }
  const reference = clean(input.reference, 'Retail sale reference', 3, 120);
  const next = mutate(state);
  const totalCost = consumeLayers(next, input.itemVariantId, warehouse.id, quantity, input.batchId, input.serialUnitIds);
  const updated = upsertBalance(next, bin.id, input.itemVariantId, input.batchId, -quantity, 0, 0);
  next.serialUnits = next.serialUnits.map((serial) => input.serialUnitIds.includes(serial.id)
    ? { ...serial, status: 'issued', version: serial.version + 1 }
    : serial);
  const unitCost = round(totalCost / quantity, 4);
  addLedger(next, {
    type: 'retail-sale',
    itemVariantId: input.itemVariantId,
    warehouseId: warehouse.id,
    binId: bin.id,
    batchId: input.batchId,
    quantity: -quantity,
    unitCost,
    value: -totalCost,
    reference,
    occurredAt: input.occurredAt,
    recordedBy: actorId,
    resultingQuantity: updated.quantity,
  });
  syncLegacyStock(next, warehouse.id, input.itemVariantId, -quantity, reference, actorId, input.occurredAt, 'issue');
  return { state: next, totalCost, unitCost };
}

/**
 * Controlled physical receipt for an independently approved counter return.
 * It intentionally does not create a refund, a credit note, or a payable
 * settlement: those are separate finance controls. Resalable stock rejoins
 * sellable availability; quarantined and damaged stock remains physically
 * visible only in the quarantine bin and is never added to the legacy
 * sellable-stock projection.
 */
export function returnRetailInventoryAtCounter(
  state: RevenueOpsState,
  input: ReturnRetailInventoryInput,
  actorId: string,
): { state: RevenueOpsState; totalCost: number; unitCost: number } {
  const { item } = itemForVariant(state, input.itemVariantId);
  const { bin, zone, warehouse } = warehouseForBin(state, input.destinationBinId);
  const quantity = positive(input.quantity, 'Retail return quantity');
  const unitCost = positive(input.unitCost, 'Retail return unit cost');
  if (warehouse.id !== input.warehouseId || bin.status !== 'available') {
    throw new Error('Retail return destination must be an available bin in the originating counter warehouse.');
  }
  if (input.outcome === 'resalable' && !['storage', 'picking'].includes(zone.purpose)) {
    throw new Error('A resalable retail return must be re-entered into an available storage or picking bin.');
  }
  if (input.outcome !== 'resalable' && zone.purpose !== 'quarantine') {
    throw new Error('A quarantined or damaged retail return must be isolated in an available quarantine bin.');
  }
  if (!Number.isFinite(Date.parse(input.occurredAt))) throw new Error('Retail return time is invalid.');
  const businessDate = toIndiaBusinessDate(input.occurredAt);
  if (item.tracking === 'batch') {
    const batch = input.batchId && state.inventoryBatches.find((candidate) => candidate.id === input.batchId && isInActiveScope(state, candidate));
    if (!batch || batch.itemVariantId !== input.itemVariantId) throw new Error('Batch-controlled retail return requires the original known batch.');
    if (input.outcome === 'resalable' && (batch.status !== 'released' || (batch.expiresAt && batch.expiresAt < businessDate))) {
      throw new Error('Only a released, unexpired retail batch can be returned to sellable stock.');
    }
  } else if (input.batchId) {
    throw new Error('Only batch-controlled retail items can include an original batch.');
  }
  if (item.tracking === 'serial') {
    if (
      quantity !== Math.trunc(quantity) ||
      input.serialUnitIds.length !== quantity ||
      new Set(input.serialUnitIds).size !== input.serialUnitIds.length ||
      input.serialUnitIds.some((serialId) => !state.serialUnits.some((serial) => (
        serial.id === serialId && serial.itemVariantId === input.itemVariantId && serial.status === 'issued' && isInActiveScope(state, serial)
      )))
    ) {
      throw new Error('Serial retail return requires each original issued serial exactly once.');
    }
  } else if (input.serialUnitIds.length) {
    throw new Error('Serial identities are only allowed for serial-controlled retail returns.');
  }
  const reference = clean(input.reference, 'Retail return reference', 3, 120);
  const next = mutate(state);
  const totalCost = round(quantity * unitCost, 2);
  const balance = upsertBalance(next, bin.id, input.itemVariantId, input.batchId, quantity, 0, 0, unitCost);
  if (item.valuationMethod === 'moving-average') {
    const open = next.inventoryCostLayers.filter((layer) => layer.itemVariantId === input.itemVariantId && layer.warehouseId === warehouse.id && layer.status === 'open');
    const oldQuantity = open.reduce((total, layer) => total + layer.remainingQuantity, 0);
    const oldValue = open.reduce((total, layer) => total + layer.remainingQuantity * layer.unitCost, 0);
    next.inventoryCostLayers = next.inventoryCostLayers.filter((layer) => !open.includes(layer));
    next.inventoryCostLayers.push({
      id: randomUUID(), itemVariantId: input.itemVariantId, warehouseId: warehouse.id, receivedAt: input.occurredAt,
      remainingQuantity: round(oldQuantity + quantity), unitCost: round((oldValue + totalCost) / (oldQuantity + quantity), 4),
      sourceReference: reference, status: 'open', scope: structuredClone(next.scope), version: 1,
    });
  } else if (item.valuationMethod === 'specific-identification') {
    next.inventoryCostLayers.push(...input.serialUnitIds.map((serialUnitId) => ({
      id: randomUUID(), itemVariantId: input.itemVariantId, warehouseId: warehouse.id, serialUnitId, receivedAt: input.occurredAt,
      remainingQuantity: 1, unitCost, sourceReference: reference, status: 'open' as const, scope: structuredClone(next.scope), version: 1,
    })));
  } else {
    next.inventoryCostLayers.push({
      id: randomUUID(), itemVariantId: input.itemVariantId, warehouseId: warehouse.id, batchId: input.batchId, receivedAt: input.occurredAt,
      remainingQuantity: quantity, unitCost, sourceReference: reference, status: 'open', scope: structuredClone(next.scope), version: 1,
    });
  }
  const serialStatus = input.outcome === 'resalable' ? 'available' as const : 'quarantine' as const;
  next.serialUnits = next.serialUnits.map((serial) => input.serialUnitIds.includes(serial.id)
    ? { ...serial, binId: bin.id, status: serialStatus, version: serial.version + 1 }
    : serial);
  addLedger(next, {
    type: 'return', itemVariantId: input.itemVariantId, warehouseId: warehouse.id, binId: bin.id, batchId: input.batchId,
    quantity, unitCost, value: totalCost, reference, occurredAt: input.occurredAt, recordedBy: actorId, resultingQuantity: balance.quantity,
  });
  if (input.outcome === 'resalable') {
    syncLegacyStock(next, warehouse.id, input.itemVariantId, quantity, reference, actorId, input.occurredAt, 'return');
  }
  return { state: next, totalCost, unitCost };
}

export function createInventoryTransfer(state: RevenueOpsState, input: CreateInventoryTransferInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const from = warehouseForBin(state, input.fromBinId); const to = warehouseForBin(state, input.toBinId);
  assertSameInventoryScope(state, [from.warehouse, to.warehouse], 'Inventory transfer');
  if (from.warehouse.id !== input.fromWarehouseId || to.warehouse.id !== input.toWarehouseId || from.warehouse.id === to.warehouse.id) throw new Error('Transfer bins must belong to two different selected warehouses.');
  if (!input.lines.length) throw new Error('Transfer requires at least one line.');
  const lines = input.lines.map((line) => {
    const { item } = itemForVariant(state, line.itemVariantId);
    const balance = findBalance(state, input.fromBinId, line.itemVariantId, line.batchId);
    const quantity = positive(line.quantity, 'Transfer quantity');
    if (!balance || balance.available < quantity) throw new Error('Transfer exceeds source-bin availability.');
    if (item.tracking === 'serial') {
      if (line.serialUnitIds.length !== quantity || line.serialUnitIds.some((serialId) => !state.serialUnits.some(({ id: candidate, binId, status, itemVariantId }) => candidate === serialId && binId === input.fromBinId && status === 'available' && itemVariantId === line.itemVariantId))) throw new Error('Serial transfer requires one available source-bin serial per unit.');
    } else if (line.serialUnitIds.length) throw new Error('Serial selection is only allowed for serial-controlled transfers.');
    return { ...line, quantity, serialUnitIds: [...line.serialUnitIds], unitCost: balance.unitCost };
  });
  const next = mutate(state);
  next.inventoryTransfers.push({ id, number: fiscalNumber('TRF', state.inventoryTransfers.length + 1, now), fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId, fromBinId: input.fromBinId, toBinId: input.toBinId, lines, status: 'draft', createdBy: actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 });
  return next;
}

const TRANSFER_TRANSITIONS: Record<InventoryTransfer['status'], InventoryTransfer['status'][]> = { draft: ['released', 'cancelled'], released: ['in-transit', 'cancelled'], 'in-transit': ['received'], received: [], cancelled: [] };

export function transitionInventoryTransfer(state: RevenueOpsState, input: TransitionInventoryTransferInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const transfer = state.inventoryTransfers.find(({ id }) => id === input.id);
  if (!transfer || transfer.version !== input.expectedVersion || !TRANSFER_TRANSITIONS[transfer.status].includes(input.toStatus)) throw new Error('Transfer transition is stale or not allowed.');
  const next = mutate(state);
  if (input.toStatus === 'released') {
    for (const line of transfer.lines) upsertBalance(next, transfer.fromBinId, line.itemVariantId, line.batchId, 0, line.quantity, 0);
  }
  if (input.toStatus === 'cancelled' && transfer.status === 'released') {
    for (const line of transfer.lines) upsertBalance(next, transfer.fromBinId, line.itemVariantId, line.batchId, 0, -line.quantity, 0);
  }
  if (input.toStatus === 'in-transit') {
    for (const line of transfer.lines) {
      const value = consumeLayers(next, line.itemVariantId, transfer.fromWarehouseId, line.quantity, line.batchId, line.serialUnitIds);
      const source = upsertBalance(next, transfer.fromBinId, line.itemVariantId, line.batchId, -line.quantity, -line.quantity, 0);
      next.serialUnits = next.serialUnits.map((serial) => line.serialUnitIds.includes(serial.id) ? { ...serial, status: 'in-transit', version: serial.version + 1 } : serial);
      addLedger(next, { type: 'transfer-out', itemVariantId: line.itemVariantId, warehouseId: transfer.fromWarehouseId, binId: transfer.fromBinId, batchId: line.batchId, quantity: -line.quantity, unitCost: round(value / line.quantity, 4), value: -value, reference: transfer.number, occurredAt: now, recordedBy: actorId, resultingQuantity: source.quantity });
      syncLegacyStock(next, transfer.fromWarehouseId, line.itemVariantId, -line.quantity, transfer.number, actorId, now, 'adjustment-out');
    }
  }
  if (input.toStatus === 'received') {
    for (const line of transfer.lines) {
      const target = upsertBalance(next, transfer.toBinId, line.itemVariantId, line.batchId, line.quantity, 0, 0, line.unitCost);
      next.inventoryCostLayers.push({ id: randomUUID(), itemVariantId: line.itemVariantId, warehouseId: transfer.toWarehouseId, batchId: line.batchId, receivedAt: now, remainingQuantity: line.quantity, unitCost: line.unitCost, sourceReference: transfer.number, status: 'open', scope: structuredClone(next.scope), version: 1 });
      next.serialUnits = next.serialUnits.map((serial) => line.serialUnitIds.includes(serial.id) ? { ...serial, binId: transfer.toBinId, status: 'available', version: serial.version + 1 } : serial);
      addLedger(next, { type: 'transfer-in', itemVariantId: line.itemVariantId, warehouseId: transfer.toWarehouseId, binId: transfer.toBinId, batchId: line.batchId, quantity: line.quantity, unitCost: line.unitCost, value: round(line.quantity * line.unitCost, 2), reference: transfer.number, occurredAt: now, recordedBy: actorId, resultingQuantity: target.quantity });
      syncLegacyStock(next, transfer.toWarehouseId, line.itemVariantId, line.quantity, transfer.number, actorId, now, 'adjustment-in');
    }
  }
  next.inventoryTransfers = next.inventoryTransfers.map((candidate) => candidate.id === transfer.id ? { ...transfer, status: input.toStatus, releasedBy: input.toStatus === 'released' ? actorId : transfer.releasedBy, receivedBy: input.toStatus === 'received' ? actorId : transfer.receivedBy, version: transfer.version + 1 } : candidate);
  return next;
}

export function createCycleCount(state: RevenueOpsState, input: CreateCycleCountInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  if (!state.warehouses.some(({ id: candidate, active }) => candidate === input.warehouseId && active)) throw new Error('Active warehouse not found.');
  const zoneIds = new Set(state.warehouseZones.filter(({ warehouseId, id: zoneId }) => warehouseId === input.warehouseId && (!input.zoneId || zoneId === input.zoneId)).map(({ id: zoneId }) => zoneId));
  if (input.zoneId && !zoneIds.has(input.zoneId)) throw new Error('Count zone does not belong to the warehouse.');
  const binIds = new Set(state.storageBins.filter(({ zoneId }) => zoneIds.has(zoneId)).map(({ id: binId }) => binId));
  const lines = state.binBalances.filter(({ binId }) => binIds.has(binId)).map((balance) => ({ binId: balance.binId, itemVariantId: balance.itemVariantId, batchId: balance.batchId, expectedQuantity: balance.quantity, status: 'pending' as const }));
  if (!lines.length) throw new Error('No stocked bin balances are available for this count scope.');
  const next = mutate(state);
  next.cycleCountPlans.push({ id, number: fiscalNumber('CC', state.cycleCountPlans.length + 1, now), warehouseId: input.warehouseId, zoneId: input.zoneId, blindCount: input.blindCount, scheduledAt: input.scheduledAt, assignedTo: clean(input.assignedTo, 'Counter', 2, 80), lines, status: 'planned', createdBy: actorId, scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function recordCycleCount(state: RevenueOpsState, input: RecordCycleCountInput): RevenueOpsState {
  const plan = state.cycleCountPlans.find(({ id }) => id === input.id);
  if (!plan || plan.version !== input.expectedVersion || !['planned', 'counting'].includes(plan.status)) throw new Error('Cycle count is stale or not countable.');
  const next = mutate(state);
  const lines = plan.lines.map((line) => {
    const count = input.counts.find((candidate) => balanceKey(candidate.binId, candidate.itemVariantId, candidate.batchId) === balanceKey(line.binId, line.itemVariantId, line.batchId));
    if (!count) return line;
    if (!Number.isFinite(count.countedQuantity) || count.countedQuantity < 0) throw new Error('Counted quantity cannot be negative.');
    return { ...line, countedQuantity: round(count.countedQuantity), varianceQuantity: round(count.countedQuantity - line.expectedQuantity), status: 'counted' as const };
  });
  const complete = lines.every(({ status }) => status === 'counted');
  next.cycleCountPlans = next.cycleCountPlans.map((candidate) => candidate.id === plan.id ? { ...plan, lines, status: complete ? 'review' : 'counting', version: plan.version + 1 } : candidate);
  return next;
}

export function decideCycleCount(state: RevenueOpsState, input: DecideCycleCountInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const plan = state.cycleCountPlans.find(({ id }) => id === input.id);
  if (!plan || plan.version !== input.expectedVersion || plan.status !== 'review' || plan.createdBy === actorId) throw new Error('Cycle-count approval requires a current review by a different user.');
  const next = mutate(state);
  if (input.decision === 'approved') {
    for (const line of plan.lines) {
      const variance = line.varianceQuantity ?? 0;
      if (!variance) continue;
      const { warehouse } = warehouseForBin(next, line.binId);
      const balance = findBalance(next, line.binId, line.itemVariantId, line.batchId);
      if (!balance || balance.quantity + variance < balance.reserved + balance.picked) throw new Error('Count adjustment would breach controlled allocations.');
      const updated = upsertBalance(next, line.binId, line.itemVariantId, line.batchId, variance, 0, 0, balance.unitCost);
      if (variance > 0) next.inventoryCostLayers.push({ id: randomUUID(), itemVariantId: line.itemVariantId, warehouseId: warehouse.id, batchId: line.batchId, receivedAt: now, remainingQuantity: variance, unitCost: balance.unitCost, sourceReference: plan.number, status: 'open', scope: structuredClone(next.scope), version: 1 });
      else consumeLayers(next, line.itemVariantId, warehouse.id, Math.abs(variance), line.batchId);
      addLedger(next, { type: 'count-adjustment', itemVariantId: line.itemVariantId, warehouseId: warehouse.id, binId: line.binId, batchId: line.batchId, quantity: variance, unitCost: balance.unitCost, value: round(variance * balance.unitCost, 2), reference: plan.number, occurredAt: now, recordedBy: actorId, resultingQuantity: updated.quantity });
      syncLegacyStock(next, warehouse.id, line.itemVariantId, variance, plan.number, actorId, now, variance > 0 ? 'adjustment-in' : 'adjustment-out');
    }
  }
  next.cycleCountPlans = next.cycleCountPlans.map((candidate) => candidate.id === plan.id ? { ...plan, lines: plan.lines.map((line) => ({ ...line, status: input.decision === 'approved' ? 'posted' : 'reviewed' })), status: input.decision === 'approved' ? 'posted' : 'cancelled', reviewedBy: actorId, postedAt: input.decision === 'approved' ? now : undefined, version: plan.version + 1 } : candidate);
  return next;
}

export function createReorderPolicy(state: RevenueOpsState, input: CreateReorderPolicyInput, id: string = randomUUID()): RevenueOpsState {
  itemForVariant(state, input.itemVariantId);
  if (!state.warehouses.some(({ id: candidate, active }) => candidate === input.warehouseId && active)) throw new Error('Active warehouse not found.');
  if (state.reorderPolicies.some((candidate) => candidate.itemVariantId === input.itemVariantId && candidate.warehouseId === input.warehouseId)) throw new Error('A reorder policy already exists for this variant and warehouse.');
  if (![input.minimumQuantity, input.reorderPoint, input.maximumQuantity, input.safetyStock].every((value) => Number.isFinite(value) && value >= 0) || input.minimumQuantity > input.reorderPoint || input.reorderPoint > input.maximumQuantity || input.safetyStock > input.reorderPoint || !Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0) throw new Error('Reorder levels must satisfy safety ≤ point ≤ maximum and use a valid lead time.');
  const next = mutate(state);
  next.reorderPolicies.push({ id, ...input, active: true, scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function generateReorderProposals(state: RevenueOpsState, now = new Date().toISOString()): RevenueOpsState {
  const next = mutate(state);
  for (const policy of next.reorderPolicies.filter(({ active }) => active)) {
    const binIds = new Set(next.warehouseZones.filter(({ warehouseId }) => warehouseId === policy.warehouseId).flatMap(({ id: zoneId }) => next.storageBins.filter(({ zoneId: candidate }) => candidate === zoneId).map(({ id }) => id)));
    const available = round(next.binBalances.filter(({ binId, itemVariantId }) => binIds.has(binId) && itemVariantId === policy.itemVariantId).reduce((total, balance) => total + balance.available, 0));
    const hasOpen = next.reorderProposals.some(({ policyId, status }) => policyId === policy.id && ['proposed', 'approved'].includes(status));
    if (available <= policy.reorderPoint && !hasOpen) {
      const recommended = Math.max(policy.minimumQuantity, policy.maximumQuantity - available);
      const required = new Date(Date.parse(now) + policy.leadTimeDays * 86400000).toISOString().slice(0, 10);
      const proposal: ReorderProposal = { id: randomUUID(), policyId: policy.id, availableQuantity: available, recommendedQuantity: round(recommended), requiredBy: required, reason: `Available ${available} is at or below reorder point ${policy.reorderPoint}; replenish to maximum ${policy.maximumQuantity}.`, status: 'proposed', generatedAt: now, scope: structuredClone(next.scope), version: 1 };
      next.reorderProposals.push(proposal);
    }
  }
  return next;
}

export function decideReorderProposal(state: RevenueOpsState, input: DecideReorderProposalInput, actorId: string): RevenueOpsState {
  const proposal = state.reorderProposals.find(({ id }) => id === input.id);
  if (!proposal || proposal.version !== input.expectedVersion || proposal.status !== 'proposed') throw new Error('Reorder proposal is stale or already decided.');
  const next = mutate(state);
  next.reorderProposals = next.reorderProposals.map((candidate) => candidate.id === proposal.id ? { ...proposal, status: input.decision, decidedBy: actorId, version: proposal.version + 1 } : candidate);
  return next;
}

export function createInventoryValuationReview(state: RevenueOpsState, input: CreateInventoryValuationReviewInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  itemForVariant(state, input.itemVariantId);
  if (!state.warehouses.some(({ id: candidate }) => candidate === input.warehouseId)) throw new Error('Warehouse not found.');
  const layers = state.inventoryCostLayers.filter(({ itemVariantId, warehouseId, status }) => itemVariantId === input.itemVariantId && warehouseId === input.warehouseId && status === 'open');
  const quantity = round(layers.reduce((total, layer) => total + layer.remainingQuantity, 0));
  if (!quantity) throw new Error('No open inventory exists for valuation review.');
  const grossCarryingValue = layers.reduce((total, layer) => total + layer.remainingQuantity * layer.unitCost, 0);
  const priorAdjustments = state.inventoryValuationReviews.filter(({ itemVariantId, warehouseId, status }) => itemVariantId === input.itemVariantId && warehouseId === input.warehouseId && status === 'approved').reduce((total, review) => total + review.adjustmentAmount, 0);
  const carryingValue = Math.max(0, grossCarryingValue + priorAdjustments);
  const carryingUnitCost = round(carryingValue / quantity, 4);
  if (!Number.isFinite(input.netRealisableValuePerUnit) || input.netRealisableValuePerUnit < 0) throw new Error('Net realisable value cannot be negative.');
  const desiredAdjustment = round((input.netRealisableValuePerUnit - carryingUnitCost) * quantity, 2);
  const adjustmentAmount = desiredAdjustment > 0 ? Math.min(desiredAdjustment, Math.max(0, -priorAdjustments)) : desiredAdjustment;
  const type = adjustmentAmount < 0 ? 'write-down' : adjustmentAmount > 0 ? 'reversal' : 'none';
  const rationale = clean(input.rationale, 'Valuation rationale', 10, 400);
  const payload = { itemVariantId: input.itemVariantId, warehouseId: input.warehouseId, asOfDate: input.asOfDate, quantity, carryingUnitCost, netRealisableValuePerUnit: input.netRealisableValuePerUnit, adjustmentAmount, rationale };
  const next = mutate(state);
  next.inventoryValuationReviews.push({ id, ...payload, type, sourceUrl: input.sourceUrl?.trim(), status: 'pending', requestedBy: actorId, requestedAt: now, checksum: checksum(payload), scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function decideInventoryValuationReview(state: RevenueOpsState, input: DecideInventoryValuationReviewInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const review = state.inventoryValuationReviews.find(({ id }) => id === input.id);
  if (!review || review.version !== input.expectedVersion || review.status !== 'pending' || review.requestedBy === actorId) throw new Error('Valuation decision requires a current request and an independent reviewer.');
  const next = mutate(state);
  next.inventoryValuationReviews = next.inventoryValuationReviews.map((candidate) => candidate.id === review.id ? { ...review, status: input.decision, reviewedBy: actorId, reviewedAt: now, version: review.version + 1 } : candidate);
  if (input.decision === 'approved' && review.type !== 'none') {
    const bins = next.binBalances.filter(({ itemVariantId }) => itemVariantId === review.itemVariantId).filter(({ binId }) => warehouseForBin(next, binId).warehouse.id === review.warehouseId);
    const bin = bins[0];
    if (bin) addLedger(next, { type: review.type === 'write-down' ? 'nrv-write-down' : 'nrv-reversal', itemVariantId: review.itemVariantId, warehouseId: review.warehouseId, binId: bin.binId, batchId: bin.batchId, quantity: 0, unitCost: review.netRealisableValuePerUnit, value: review.adjustmentAmount, reference: `NRV-${review.id.slice(0, 8)}`, occurredAt: now, recordedBy: actorId, resultingQuantity: bin.quantity });
  }
  return next;
}

function assertDispositionTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error('Disposition occurrence time is invalid.');
}

function assertDispositionSerials(
  state: RevenueOpsState,
  itemId: string,
  binId: string,
  serialUnitIds: string[],
  quantity: number,
): void {
  if (quantity !== Math.trunc(quantity) || serialUnitIds.length !== quantity || new Set(serialUnitIds).size !== serialUnitIds.length) {
    throw new Error('Serial-controlled disposition requires one unique serial unit per quantity.');
  }
  if (serialUnitIds.some((serialId) => !state.serialUnits.some((serial) => (
    serial.id === serialId && serial.itemVariantId === itemId && serial.binId === binId && serial.status === 'available'
  )))) {
    throw new Error('One or more selected serial units are no longer available in the source bin.');
  }
}

/**
 * Submit a known physical event for independent review. This path deliberately
 * does not alter a bin, a cost layer, or a legacy stock position. A submitted
 * loss is evidence, not an inventory movement.
 */
export function createInventoryDisposition(
  state: RevenueOpsState,
  input: CreateInventoryDispositionInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): RevenueOpsState {
  const { item } = itemForVariant(state, input.itemVariantId);
  const { bin, zone, warehouse } = warehouseForBin(state, input.binId);
  if (warehouse.id !== input.warehouseId || bin.status !== 'available') throw new Error('Disposition must use an available bin in the selected warehouse.');
  const quantity = positive(input.quantity, 'Disposition quantity');
  assertDispositionTimestamp(input.occurredAt);
  const reason = clean(input.reason, 'Disposition reason', 4, 400);
  const evidenceReference = clean(input.evidenceReference, 'Evidence reference', 3, 160);
  if (state.inventoryDispositions.some((record) => record.evidenceReference.toLowerCase() === evidenceReference.toLowerCase())) {
    throw new Error('This evidence reference is already used by an inventory disposition.');
  }
  const serialUnitIds = [...new Set(input.serialUnitIds)];

  let availableQuantityBefore = 0;
  let unitCostSnapshot = 0;
  if (input.kind === 'opening-balance') {
    if (!['receiving', 'quarantine', 'returns'].includes(zone.purpose)) {
      throw new Error('Opening balance must be staged in a receiving, quarantine, or returns bin.');
    }
    if (input.batchId) throw new Error('Opening balance uses a batch number, not an existing batch identifier.');
    if (!input.unitCost) throw new Error('Opening balance requires an evidenced unit cost.');
    unitCostSnapshot = positive(input.unitCost, 'Opening-balance unit cost');
    if (item.tracking === 'batch' && !input.batchNumber?.trim()) throw new Error('Batch-controlled opening balance requires a batch number.');
    if (input.expiresAt && input.expiresAt <= toIndiaBusinessDate(input.occurredAt)) {
      throw new Error('Opening balance cannot introduce a batch already expired on its stated business date.');
    }
    if (item.tracking !== 'batch' && (input.batchNumber || input.manufacturedAt || input.expiresAt)) {
      throw new Error('Batch details are only permitted for batch-controlled opening balance.');
    }
    if (item.tracking === 'serial') {
      const serialNumbers = (input.serialNumbers ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean);
      if (serialUnitIds.length || quantity !== Math.trunc(quantity) || serialNumbers.length !== quantity || new Set(serialNumbers).size !== serialNumbers.length) {
        throw new Error('Serial-controlled opening balance requires one unique serial number per quantity.');
      }
    } else if (serialUnitIds.length || (input.serialNumbers?.length ?? 0) > 0) {
      throw new Error('Serial identities are only allowed for serial-controlled opening balance.');
    }
  } else {
    if (input.unitCost !== undefined || input.batchNumber || input.manufacturedAt || input.expiresAt || (input.serialNumbers?.length ?? 0) > 0) {
      throw new Error('Destructive inventory dispositions use current controlled stock; opening-balance inputs are not allowed.');
    }
    const balance = findBalance(state, bin.id, input.itemVariantId, input.batchId);
    if (!balance || balance.available < quantity) throw new Error('Disposition exceeds currently available bin quantity.');
    availableQuantityBefore = balance.available;
    unitCostSnapshot = balance.unitCost;
    if (item.tracking === 'batch') {
      const batch = input.batchId && state.inventoryBatches.find((candidate) => candidate.id === input.batchId);
      if (!batch || batch.itemVariantId !== input.itemVariantId || !['released', 'expired'].includes(batch.status)) {
        throw new Error('Batch-controlled disposition requires a released or expired source batch.');
      }
      if (input.kind === 'expiry' && (!batch.expiresAt || batch.expiresAt > toIndiaBusinessDate(input.occurredAt))) {
        throw new Error('Expiry disposition requires a batch that is expired on the stated business date.');
      }
    } else if (input.batchId) {
      throw new Error('Only batch-controlled inventory can include a source batch.');
    }
    if (item.tracking === 'serial') assertDispositionSerials(state, input.itemVariantId, bin.id, serialUnitIds, quantity);
    else if (serialUnitIds.length) throw new Error('Serial selections are only permitted for serial-controlled inventory.');
  }

  const next = mutate(state);
  const disposition: InventoryDisposition = {
    id,
    number: fiscalNumber('DISP', state.inventoryDispositions.length + 1, input.occurredAt),
    kind: input.kind,
    warehouseId: warehouse.id,
    binId: bin.id,
    itemVariantId: input.itemVariantId,
    batchId: input.batchId,
    serialUnitIds,
    serialNumbers: input.kind === 'opening-balance' ? (input.serialNumbers ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean) : undefined,
    quantity,
    unitCostSnapshot,
    totalValueSnapshot: round(quantity * unitCostSnapshot, 2),
    availableQuantityBefore,
    reason,
    evidenceReference,
    occurredAt: input.occurredAt,
    batchNumber: input.kind === 'opening-balance' ? input.batchNumber?.trim().toUpperCase() : undefined,
    manufacturedAt: input.kind === 'opening-balance' ? input.manufacturedAt : undefined,
    expiresAt: input.kind === 'opening-balance' ? input.expiresAt : undefined,
    status: 'submitted',
    submittedBy: actorId,
    submittedAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  };
  next.inventoryDispositions.push(disposition);
  return next;
}

export function decideInventoryDisposition(
  state: RevenueOpsState,
  input: DecideInventoryDispositionInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const disposition = state.inventoryDispositions.find((record) => record.id === input.id);
  if (!disposition || disposition.version !== input.expectedVersion || disposition.status !== 'submitted') {
    throw new Error('Inventory disposition is stale or no longer awaiting decision.');
  }
  if (disposition.submittedBy === actorId) throw new Error('Inventory disposition requires an independent approver.');
  const evidence = clean(input.evidence, input.decision === 'approved' ? 'Approval evidence' : 'Rejection reason', 4, 400);
  const next = mutate(state);
  next.inventoryDispositions = next.inventoryDispositions.map((record) => record.id === disposition.id
    ? input.decision === 'approved'
      ? { ...record, status: 'approved' as const, approvedBy: actorId, approvedAt: now, approvalEvidence: evidence, version: record.version + 1 }
      : { ...record, status: 'rejected' as const, rejectedBy: actorId, rejectedAt: now, rejectionReason: evidence, version: record.version + 1 }
    : record);
  return next;
}

/**
 * Applies a previously approved physical correction. The source bin and cost
 * layers are revalidated at this exact moment so an old approval cannot spend
 * stock that has since been reserved or moved. This remains an inventory
 * evidence boundary: no finance journal is fabricated here.
 */
export function postInventoryDisposition(
  state: RevenueOpsState,
  input: PostInventoryDispositionInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const disposition = state.inventoryDispositions.find((record) => record.id === input.id);
  if (!disposition || disposition.version !== input.expectedVersion || disposition.status !== 'approved') {
    throw new Error('Inventory disposition is stale or has not been independently approved.');
  }
  if (disposition.submittedBy === actorId) throw new Error('Disposition submitter cannot post their own stock movement.');

  if (disposition.kind === 'opening-balance') {
    const item = state.inventoryItems.find((candidate) => candidate.id === state.itemVariants.find((variant) => variant.id === disposition.itemVariantId)?.itemId);
    if (!item) throw new Error('Opening-balance inventory item is no longer available.');
    const received = receiveInventory(state, {
      warehouseId: disposition.warehouseId,
      receivingBinId: disposition.binId,
      itemVariantId: disposition.itemVariantId,
      quantity: disposition.quantity,
      uomId: item.baseUomId,
      unitCost: disposition.unitCostSnapshot,
      reference: disposition.number,
      receivedAt: disposition.occurredAt,
      batchNumber: disposition.batchNumber,
      manufacturedAt: disposition.manufacturedAt,
      expiresAt: disposition.expiresAt,
      serialNumbers: disposition.serialNumbers ?? [],
    }, actorId, now);
    return {
      ...received,
      inventoryDispositions: received.inventoryDispositions.map((record) => record.id === disposition.id
        ? { ...record, status: 'posted' as const, postedBy: actorId, postedAt: now, postedUnitCost: record.unitCostSnapshot, postedTotalValue: record.totalValueSnapshot, version: record.version + 1 }
        : record),
    };
  }

  const next = mutate(state);
  const { item } = itemForVariant(next, disposition.itemVariantId);
  const { bin, warehouse } = warehouseForBin(next, disposition.binId);
  if (warehouse.id !== disposition.warehouseId || bin.status !== 'available') throw new Error('Disposition source bin is no longer available.');
  const balance = findBalance(next, bin.id, disposition.itemVariantId, disposition.batchId);
  if (!balance || balance.available < disposition.quantity) throw new Error('Disposition exceeds the current available quantity; refresh and re-approve if necessary.');
  if (item.tracking === 'batch') {
    const batch = disposition.batchId && next.inventoryBatches.find((candidate) => candidate.id === disposition.batchId);
    if (!batch || !['released', 'expired'].includes(batch.status)) throw new Error('Disposition batch is no longer eligible.');
    if (disposition.kind === 'expiry' && (!batch.expiresAt || batch.expiresAt > toIndiaBusinessDate(disposition.occurredAt))) {
      throw new Error('Expiry disposition requires a batch expired on its recorded business date.');
    }
  }
  if (item.tracking === 'serial') assertDispositionSerials(next, disposition.itemVariantId, bin.id, disposition.serialUnitIds, disposition.quantity);

  const totalValue = consumeLayers(next, disposition.itemVariantId, warehouse.id, disposition.quantity, disposition.batchId, disposition.serialUnitIds);
  const updated = upsertBalance(next, bin.id, disposition.itemVariantId, disposition.batchId, -disposition.quantity, 0, 0);
  next.serialUnits = next.serialUnits.map((serial) => disposition.serialUnitIds.includes(serial.id)
    ? { ...serial, status: 'disposed' as const, version: serial.version + 1 }
    : serial);
  if (disposition.kind === 'expiry' && disposition.batchId) {
    next.inventoryBatches = next.inventoryBatches.map((batch) => batch.id === disposition.batchId
      ? { ...batch, status: 'expired' as const, version: batch.version + 1 }
      : batch);
  }
  const unitCost = round(totalValue / disposition.quantity, 4);
  addLedger(next, {
    type: 'disposition',
    itemVariantId: disposition.itemVariantId,
    warehouseId: warehouse.id,
    binId: bin.id,
    batchId: disposition.batchId,
    quantity: -disposition.quantity,
    unitCost,
    value: -totalValue,
    reference: disposition.number,
    occurredAt: disposition.occurredAt,
    recordedBy: actorId,
    resultingQuantity: updated.quantity,
  });
  syncLegacyStock(next, warehouse.id, disposition.itemVariantId, -disposition.quantity, disposition.number, actorId, disposition.occurredAt, 'adjustment-out');
  next.inventoryDispositions = next.inventoryDispositions.map((record) => record.id === disposition.id
    ? { ...record, status: 'posted' as const, postedBy: actorId, postedAt: now, postedUnitCost: unitCost, postedTotalValue: totalValue, version: record.version + 1 }
    : record);
  return next;
}
