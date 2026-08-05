import { createHash, randomUUID } from 'node:crypto';
import { consumeInventoryForProduction, receiveInventory } from './inventory-warehouse';
import type {
  BomComponent,
  CreateBomRevisionInput,
  CreateQualityPlanInput,
  CreateWorkCenterInput,
  CreateWorkOrderInput,
  DecideBomRevisionInput,
  DecideQualityPlanInput,
  DecideWorkOrderInput,
  IssueWorkOrderMaterialInput,
  QualityInspection,
  RecordProductionOutputInput,
  RecordQualityInspectionInput,
  ResolveNonconformanceInput,
  StartWorkOrderInput,
  WorkOrder,
  WorkOrderOperation,
} from '../shared/manufacturing-contracts';
import type { AccountingJournalDraft, JournalLine, RevenueOpsState } from '../shared/revenue-ops-contracts';

const money = (value: number): number => Math.round(value * 100) / 100;
const quantity = (value: number): number => Number(value.toFixed(6));
const digest = (value: unknown): string => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const mutate = (state: RevenueOpsState): RevenueOpsState => { const next = structuredClone(state); next.revision += 1; return next; };
const clean = (value: string, label: string, min = 2, max = 400): string => { const normalized = value.trim().replace(/\s+/g, ' '); if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`); return normalized; };
const validDate = (value: string, label: string): string => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) throw new Error(`${label} must use YYYY-MM-DD.`); return value; };
const fiscalNumber = (prefix: string, sequence: number, at: string): string => { const date = new Date(`${at.slice(0, 10)}T00:00:00.000Z`); const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1; return `${prefix}-${String(year).slice(-2)}-${String(year + 1).slice(-2)}-${String(sequence).padStart(5, '0')}`; };

function journal(sourceType: AccountingJournalDraft['sourceType'], sourceId: string, sourceNumber: string, postingDate: string, lines: JournalLine[]): AccountingJournalDraft {
  const normalized = lines.map((line) => ({ ...line, debit: money(line.debit), credit: money(line.credit) }));
  const totalDebit = money(normalized.reduce((total, line) => total + line.debit, 0)); const totalCredit = money(normalized.reduce((total, line) => total + line.credit, 0));
  if (totalDebit !== totalCredit) throw new Error('Manufacturing accounting handoff is not balanced.');
  const unsigned = { sourceType, sourceId, sourceNumber, postingDate, lines: normalized, totalDebit, totalCredit };
  return { id: randomUUID(), ...unsigned, status: 'ready', checksum: digest(unsigned), version: 1 };
}

function activeVariant(state: RevenueOpsState, id: string): { itemId: string; tracking: 'none' | 'batch' | 'serial'; baseUomId: string } {
  const variant = state.itemVariants.find(({ id: candidate, active }) => candidate === id && active);
  const item = variant && state.inventoryItems.find(({ id: candidate, active }) => candidate === variant.itemId && active);
  if (!variant || !item) throw new Error('Manufacturing control requires an active inventory variant.');
  return { itemId: item.id, tracking: item.tracking, baseUomId: item.baseUomId };
}

function binContext(state: RevenueOpsState, binId: string): { warehouseId: string; purpose: string; available: boolean } {
  const bin = state.storageBins.find(({ id }) => id === binId); const zone = bin && state.warehouseZones.find(({ id }) => id === bin.zoneId); const warehouse = zone && state.warehouses.find(({ id }) => id === zone.warehouseId);
  if (!bin || !zone || !warehouse) throw new Error('Manufacturing bin hierarchy is incomplete.');
  return { warehouseId: warehouse.id, purpose: zone.purpose, available: bin.status === 'available' };
}

function rangesOverlap(leftFrom: string, leftTo: string | undefined, rightFrom: string, rightTo: string | undefined): boolean { return leftFrom <= (rightTo ?? '9999-12-31') && rightFrom <= (leftTo ?? '9999-12-31'); }
function daysInclusive(start: string, end: string): number { return Math.max(1, Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1); }

function operationCost(state: RevenueOpsState, workOrder: WorkOrder, outputQuantity: number): number {
  const rate = workOrder.operations.reduce((total, operation) => {
    const center = state.workCenters.find(({ id }) => id === operation.workCenterId);
    return total + (center ? operation.plannedMinutes / 60 * center.costRatePerHour : 0);
  }, 0);
  return money(rate * outputQuantity / workOrder.quantityPlanned);
}

function materialCost(state: RevenueOpsState, workOrderId: string, quantityCompleted: number, plannedQuantity: number): number {
  const issued = state.productionMaterialIssues.filter(({ workOrderId: candidate }) => candidate === workOrderId).reduce((total, issue) => total + issue.totalCost, 0);
  return money(issued * quantityCompleted / plannedQuantity);
}

function hasFinalRelease(state: RevenueOpsState, workOrder: WorkOrder): boolean {
  const passed = state.qualityInspections.some(({ workOrderId, stage, status }) => workOrderId === workOrder.id && stage === 'final' && status === 'passed');
  const allowed = state.nonconformances.some(({ workOrderId, status, disposition }) => workOrderId === workOrder.id && status === 'resolved' && disposition === 'use-as-is');
  return passed || allowed;
}

function capacityAvailable(state: RevenueOpsState, operations: Array<{ workCenterId: string; minutes: number }>, plannedStart: string, plannedEnd: string): void {
  for (const operation of operations) {
    const center = state.workCenters.find(({ id, active }) => id === operation.workCenterId && active);
    if (!center) throw new Error('BOM routing needs an active work center.');
    const existing = state.workOrders.filter((order) => ['submitted', 'released', 'in-progress', 'quality-hold'].includes(order.status) && rangesOverlap(order.plannedStart, order.plannedEnd, plannedStart, plannedEnd)).flatMap((order) => order.operations.filter(({ workCenterId }) => workCenterId === center.id)).reduce((total, item) => total + item.plannedMinutes, 0);
    const capacity = center.capacityMinutesPerDay * center.efficiencyPercent / 100 * daysInclusive(plannedStart, plannedEnd);
    if (existing + operation.minutes > capacity * 1.2) throw new Error(`${center.name} exceeds the 120% controlled capacity boundary for this schedule.`);
  }
}

export function createWorkCenter(state: RevenueOpsState, input: CreateWorkCenterInput, id: string = randomUUID()): RevenueOpsState {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(code) || state.workCenters.some((center) => center.code === code)) throw new Error('Work-center code is invalid or already exists.');
  if (!state.warehouses.some(({ id: candidate, active }) => candidate === input.warehouseId && active) || !Number.isFinite(input.capacityMinutesPerDay) || input.capacityMinutesPerDay < 30 || input.capacityMinutesPerDay > 86_400 || !Number.isFinite(input.efficiencyPercent) || input.efficiencyPercent < 1 || input.efficiencyPercent > 150 || !Number.isFinite(input.costRatePerHour) || input.costRatePerHour < 0 || input.costRatePerHour > 10_000_000) throw new Error('Work-center capacity, efficiency or cost configuration is invalid.');
  const next = mutate(state); next.workCenters.unshift({ id, code, name: clean(input.name, 'Work-center name'), warehouseId: input.warehouseId, capacityMinutesPerDay: quantity(input.capacityMinutesPerDay), efficiencyPercent: quantity(input.efficiencyPercent), costRatePerHour: money(input.costRatePerHour), active: true, scope: structuredClone(next.scope), version: 1 }); return next;
}

export function createBomRevision(state: RevenueOpsState, input: CreateBomRevisionInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  activeVariant(state, input.outputVariantId); validDate(input.effectiveFrom, 'BOM effective-from date'); if (input.effectiveTo) { validDate(input.effectiveTo, 'BOM effective-to date'); if (input.effectiveTo < input.effectiveFrom) throw new Error('BOM effective-to date cannot precede effective-from date.'); }
  if (!Number.isFinite(input.outputQuantity) || input.outputQuantity <= 0 || input.outputQuantity > 1_000_000_000 || !input.components.length || input.components.length > 100 || !input.operations.length || input.operations.length > 30) throw new Error('BOM requires a bounded positive output, 1-100 components, and 1-30 operations.');
  const componentVariantIds = new Set<string>();
  const components: BomComponent[] = input.components.map((component) => { activeVariant(state, component.itemVariantId); if (component.itemVariantId === input.outputVariantId || componentVariantIds.has(component.itemVariantId) || !Number.isFinite(component.quantityPerOutput) || component.quantityPerOutput <= 0 || component.quantityPerOutput > 1_000_000_000 || !Number.isFinite(component.scrapPercent) || component.scrapPercent < 0 || component.scrapPercent > 100) throw new Error('BOM component is invalid, duplicated, or cannot consume its own output.'); componentVariantIds.add(component.itemVariantId); return { id: randomUUID(), itemVariantId: component.itemVariantId, quantityPerOutput: quantity(component.quantityPerOutput), scrapPercent: quantity(component.scrapPercent), issueMethod: component.issueMethod }; });
  const sequences = new Set<number>();
  const operations = input.operations.map((operation) => { if (!Number.isInteger(operation.sequence) || operation.sequence < 1 || sequences.has(operation.sequence) || !Number.isFinite(operation.setupMinutes) || operation.setupMinutes < 0 || !Number.isFinite(operation.runMinutesPerOutput) || operation.runMinutesPerOutput <= 0) throw new Error('BOM routing sequence or time is invalid.'); const center = state.workCenters.find(({ id: candidate, active }) => candidate === operation.workCenterId && active); if (!center) throw new Error('BOM routing needs active work centers.'); sequences.add(operation.sequence); return { id: randomUUID(), ...operation, setupMinutes: quantity(operation.setupMinutes), runMinutesPerOutput: quantity(operation.runMinutesPerOutput) }; }).sort((left, right) => left.sequence - right.sequence);
  const next = mutate(state); next.bomRevisions.unshift({ id, number: fiscalNumber('BOM', state.bomRevisions.length + 1, now), outputVariantId: input.outputVariantId, outputQuantity: quantity(input.outputQuantity), effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, components, operations, status: 'draft', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }); return next;
}

export function decideBomRevision(state: RevenueOpsState, input: DecideBomRevisionInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const revision = state.bomRevisions.find(({ id }) => id === input.id);
  if (!revision || revision.status !== 'draft' || revision.version !== input.expectedVersion) throw new Error('BOM revision is stale or no longer awaiting release.');
  if (revision.requestedBy === actorId) throw new Error('BOM maker cannot release the same revision.');
  if (input.decision === 'released' && state.bomRevisions.some((item) => item.id !== revision.id && item.outputVariantId === revision.outputVariantId && item.status === 'released' && rangesOverlap(item.effectiveFrom, item.effectiveTo, revision.effectiveFrom, revision.effectiveTo))) throw new Error('Released BOM effective dates may not overlap for the same output.');
  const next = mutate(state); next.bomRevisions = next.bomRevisions.map((item) => item.id === revision.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'BOM decision remarks', 4, 500), version: item.version + 1 } : item); return next;
}

export function createQualityPlan(state: RevenueOpsState, input: CreateQualityPlanInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  activeVariant(state, input.outputVariantId);
  if (!Number.isInteger(input.sampleSize) || input.sampleSize < 1 || input.sampleSize > 1_000_000 || !input.checks.length || input.checks.length > 30) throw new Error('Quality plan needs a bounded sample size and 1-30 checks.');
  const names = new Set<string>(); const checks = input.checks.map((check) => { const label = clean(check.label, 'Quality check label'); if (names.has(label.toLowerCase()) || !clean(check.unit, 'Quality check unit', 1, 30) || (check.minimum !== undefined && !Number.isFinite(check.minimum)) || (check.maximum !== undefined && !Number.isFinite(check.maximum)) || (check.minimum !== undefined && check.maximum !== undefined && check.minimum > check.maximum)) throw new Error('Quality-plan check is invalid or duplicated.'); names.add(label.toLowerCase()); return { id: randomUUID(), label, unit: check.unit.trim(), minimum: check.minimum, maximum: check.maximum, critical: check.critical }; });
  const next = mutate(state); next.qualityPlans.unshift({ id, number: fiscalNumber('QPL', state.qualityPlans.length + 1, now), outputVariantId: input.outputVariantId, name: clean(input.name, 'Quality plan name'), sampleSize: input.sampleSize, checks, status: 'pending', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }); return next;
}

export function decideQualityPlan(state: RevenueOpsState, input: DecideQualityPlanInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const plan = state.qualityPlans.find(({ id }) => id === input.id);
  if (!plan || plan.status !== 'pending' || plan.version !== input.expectedVersion) throw new Error('Quality plan is stale or no longer awaiting approval.');
  if (plan.requestedBy === actorId) throw new Error('Quality-plan maker cannot approve the same plan.');
  const next = mutate(state); if (input.decision === 'approved') next.qualityPlans = next.qualityPlans.map((item) => item.outputVariantId === plan.outputVariantId && item.status === 'approved' ? { ...item, status: 'retired', version: item.version + 1 } : item); next.qualityPlans = next.qualityPlans.map((item) => item.id === plan.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Quality decision remarks', 4, 500), version: item.version + 1 } : item); return next;
}

export function createWorkOrder(state: RevenueOpsState, input: CreateWorkOrderInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const bom = state.bomRevisions.find(({ id, status }) => id === input.bomRevisionId && status === 'released');
  if (!bom || !Number.isFinite(input.quantityPlanned) || input.quantityPlanned <= 0 || input.quantityPlanned > 1_000_000_000) throw new Error('Work order requires a released BOM and positive quantity.');
  validDate(input.plannedStart, 'Work-order start'); validDate(input.plannedEnd, 'Work-order end'); if (input.plannedEnd < input.plannedStart || input.plannedStart < bom.effectiveFrom || (bom.effectiveTo && input.plannedStart > bom.effectiveTo)) throw new Error('Work-order dates fall outside a valid production window.');
  const output = binContext(state, input.outputBinId); if (output.warehouseId !== input.warehouseId || !['receiving', 'quarantine'].includes(output.purpose) || !output.available || !state.warehouses.some(({ id, active }) => id === input.warehouseId && active)) throw new Error('Work-order output requires an available receiving or quarantine bin in its active warehouse.');
  const plan = input.qualityPlanId ? state.qualityPlans.find(({ id, status, outputVariantId }) => id === input.qualityPlanId && status === 'approved' && outputVariantId === bom.outputVariantId) : undefined; if (input.qualityPlanId && !plan) throw new Error('Work order quality plan is not approved for this BOM output.');
  const operations: WorkOrderOperation[] = bom.operations.map((operation) => ({ id: randomUUID(), bomOperationId: operation.id, sequence: operation.sequence, workCenterId: operation.workCenterId, plannedMinutes: quantity(operation.setupMinutes + operation.runMinutesPerOutput * input.quantityPlanned), status: 'planned' }));
  capacityAvailable(state, operations.map(({ workCenterId, plannedMinutes }) => ({ workCenterId, minutes: plannedMinutes })), input.plannedStart, input.plannedEnd);
  const next = mutate(state); next.workOrders.unshift({ id, number: fiscalNumber('WO', state.workOrders.length + 1, now), bomRevisionId: bom.id, qualityPlanId: plan?.id, outputVariantId: bom.outputVariantId, warehouseId: input.warehouseId, outputBinId: input.outputBinId, quantityPlanned: quantity(input.quantityPlanned), quantityCompleted: 0, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, status: 'submitted', operations, requestedBy: actorId, requestedAt: now, scope: structuredClone(bom.scope ?? next.scope), version: 1 }); return next;
}

export function decideWorkOrder(state: RevenueOpsState, input: DecideWorkOrderInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const order = state.workOrders.find(({ id }) => id === input.id);
  if (!order || order.status !== 'submitted' || order.version !== input.expectedVersion) throw new Error('Work order is stale or no longer awaiting release.');
  if (order.requestedBy === actorId) throw new Error('Work-order maker cannot release the same order.');
  const next = mutate(state); next.workOrders = next.workOrders.map((item) => item.id === order.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Work-order decision remarks', 4, 500), version: item.version + 1 } : item); return next;
}

export function startWorkOrder(state: RevenueOpsState, input: StartWorkOrderInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const order = state.workOrders.find(({ id }) => id === input.id);
  if (!order || order.status !== 'released' || order.version !== input.expectedVersion) throw new Error('Only a current released work order can start.');
  const next = mutate(state); next.workOrders = next.workOrders.map((item) => item.id === order.id ? { ...item, status: 'in-progress', startedBy: actorId, startedAt: now, operations: item.operations.map((operation, index) => index === 0 ? { ...operation, status: 'in-progress' } : operation), version: item.version + 1 } : item); return next;
}

export function issueWorkOrderMaterial(state: RevenueOpsState, input: IssueWorkOrderMaterialInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const order = state.workOrders.find(({ id, status }) => id === input.workOrderId && status === 'in-progress'); const bom = order && state.bomRevisions.find(({ id }) => id === order.bomRevisionId); const component = bom?.components.find(({ id }) => id === input.bomComponentId);
  if (!order || !bom || !component || component.itemVariantId !== (state.itemVariants.find(({ id }) => id === component.itemVariantId)?.id ?? '')) throw new Error('Material issue needs an in-progress work order and a current BOM component.');
  validDate(input.issuedAt, 'Material issue date'); const alreadyIssued = state.productionMaterialIssues.filter(({ workOrderId, bomComponentId }) => workOrderId === order.id && bomComponentId === component.id).reduce((total, issue) => total + issue.quantity, 0); const maximum = quantity(order.quantityPlanned * component.quantityPerOutput * (1 + component.scrapPercent / 100));
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || quantity(alreadyIssued + input.quantity) > maximum + 0.000001) throw new Error('Material issue exceeds the BOM quantity plus authorised scrap allowance.');
  const consumption = consumeInventoryForProduction(state, { warehouseId: order.warehouseId, binId: input.binId, itemVariantId: component.itemVariantId, batchId: input.batchId, serialUnitIds: input.serialUnitIds, quantity: input.quantity, reference: `WO-${order.number}-${component.id.slice(0, 6)}`, occurredAt: `${input.issuedAt}T12:00:00.000Z` }, actorId);
  const next = consumption.state; const number = fiscalNumber('PMI', state.productionMaterialIssues.length + 1, now); const posting = journal('production-issue', id, number, input.issuedAt, [{ accountCode: 'work-in-progress', debit: consumption.totalCost, credit: 0, memo: order.number }, { accountCode: 'inventory-asset', debit: 0, credit: consumption.totalCost, memo: order.number }]);
  next.productionMaterialIssues.unshift({ id, number, workOrderId: order.id, bomComponentId: component.id, itemVariantId: component.itemVariantId, binId: input.binId, batchId: input.batchId, serialUnitIds: [...input.serialUnitIds], quantity: quantity(input.quantity), unitCost: consumption.unitCost, totalCost: consumption.totalCost, issuedBy: actorId, issuedAt: now, ledgerReference: `WO-${order.number}-${component.id.slice(0, 6)}`, journalId: posting.id, scope: structuredClone(order.scope ?? next.scope), version: 1 }); next.journalDrafts.unshift(posting); return next;
}

export function recordQualityInspection(state: RevenueOpsState, input: RecordQualityInspectionInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const order = state.workOrders.find(({ id, status }) => id === input.workOrderId && ['in-progress', 'quality-hold'].includes(status)); const plan = state.qualityPlans.find(({ id, status }) => id === input.qualityPlanId && status === 'approved');
  if (!order || !plan || order.qualityPlanId !== plan.id || plan.outputVariantId !== order.outputVariantId || !Number.isInteger(input.sampleQuantity) || input.sampleQuantity < 1 || input.sampleQuantity > order.quantityPlanned || input.results.length !== plan.checks.length || new Set(input.results.map(({ checkId }) => checkId)).size !== input.results.length) throw new Error('Inspection requires the approved work-order plan, a valid sample and every check exactly once.');
  const results = plan.checks.map((check) => { const measured = input.results.find(({ checkId }) => checkId === check.id)?.measuredValue; if (!Number.isFinite(measured)) throw new Error('Quality measurement is invalid.'); const passed = (check.minimum === undefined || measured! >= check.minimum) && (check.maximum === undefined || measured! <= check.maximum); return { checkId: check.id, measuredValue: quantity(measured!), passed }; });
  const status = results.every(({ passed }) => passed) ? 'passed' as const : 'failed' as const; const inspection: QualityInspection = { id, number: fiscalNumber('QIN', state.qualityInspections.length + 1, now), workOrderId: order.id, qualityPlanId: plan.id, stage: input.stage, sampleQuantity: input.sampleQuantity, results, status, inspectedBy: actorId, inspectedAt: now, scope: structuredClone(order.scope ?? state.scope), version: 1 };
  const next = mutate(state); next.qualityInspections.unshift(inspection);
  if (status === 'failed') { const severity = plan.checks.some((check) => check.critical && !results.find(({ checkId }) => checkId === check.id)!.passed) ? 'critical' : plan.checks.some((check) => !results.find(({ checkId }) => checkId === check.id)!.passed) ? 'major' : 'minor'; next.nonconformances.unshift({ id: randomUUID(), number: fiscalNumber('NC', state.nonconformances.length + 1, now), workOrderId: order.id, qualityInspectionId: inspection.id, severity, description: `${input.stage} inspection ${inspection.number} contains out-of-tolerance measurements.`, status: 'open', openedBy: actorId, openedAt: now, scope: structuredClone(order.scope ?? next.scope), version: 1 }); next.workOrders = next.workOrders.map((item) => item.id === order.id ? { ...item, status: 'quality-hold', operations: item.operations.map((operation) => ({ ...operation, status: operation.status === 'completed' ? 'completed' : 'blocked' })), version: item.version + 1 } : item); }
  return next;
}

export function resolveNonconformance(state: RevenueOpsState, input: ResolveNonconformanceInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const issue = state.nonconformances.find(({ id }) => id === input.id); const order = issue && state.workOrders.find(({ id }) => id === issue.workOrderId);
  if (!issue || !order || issue.status !== 'open' || issue.version !== input.expectedVersion) throw new Error('Nonconformance is stale or closed.'); if (issue.openedBy === actorId) throw new Error('Nonconformance maker cannot resolve the same record.');
  const next = mutate(state); next.nonconformances = next.nonconformances.map((item) => item.id === issue.id ? { ...item, status: input.disposition === 'scrap' ? 'written-off' : 'resolved', resolvedBy: actorId, resolvedAt: now, disposition: input.disposition, resolution: clean(input.resolution, 'Nonconformance resolution', 6, 500), version: item.version + 1 } : item); next.workOrders = next.workOrders.map((item) => item.id === order.id ? { ...item, status: input.disposition === 'scrap' ? 'cancelled' : 'in-progress', operations: item.operations.map((operation) => operation.status === 'blocked' ? { ...operation, status: 'in-progress' } : operation), version: item.version + 1 } : item); return next;
}

export function recordProductionOutput(state: RevenueOpsState, input: RecordProductionOutputInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const order = state.workOrders.find(({ id }) => id === input.workOrderId); if (!order || !['in-progress', 'quality-hold'].includes(order.status) || !Number.isFinite(input.quantity) || input.quantity <= 0 || quantity(order.quantityCompleted + input.quantity) > order.quantityPlanned + 0.000001 || !hasFinalRelease(state, order)) throw new Error('Production output requires a released final quality decision and may not exceed the planned quantity.');
  validDate(input.recordedAt, 'Production output date'); const output = activeVariant(state, order.outputVariantId); const material = materialCost(state, order.id, input.quantity, order.quantityPlanned); const operations = operationCost(state, order, input.quantity); const totalCost = money(material + operations); if (totalCost <= 0) throw new Error('Production output requires issued material cost before receipt.');
  const outputNumber = fiscalNumber('PROD', state.productionOutputs.length + 1, now); const next = receiveInventory(state, { warehouseId: order.warehouseId, receivingBinId: order.outputBinId, itemVariantId: order.outputVariantId, quantity: input.quantity, uomId: output.baseUomId, unitCost: money(totalCost / input.quantity), reference: outputNumber, receivedAt: `${input.recordedAt}T12:00:00.000Z`, batchNumber: input.batchNumber, manufacturedAt: input.recordedAt, serialNumbers: input.serialNumbers }, actorId, now);
  const posting = journal('production-output', id, outputNumber, input.recordedAt, [{ accountCode: 'inventory-asset', debit: totalCost, credit: 0, memo: order.number }, { accountCode: 'work-in-progress', debit: 0, credit: totalCost, memo: order.number }]); const completed = quantity(order.quantityCompleted + input.quantity); next.productionOutputs.unshift({ id, number: outputNumber, workOrderId: order.id, itemVariantId: order.outputVariantId, outputBinId: order.outputBinId, quantity: quantity(input.quantity), batchNumber: input.batchNumber?.trim().toUpperCase(), serialNumbers: [...input.serialNumbers], materialCost: material, operationCost: operations, unitCost: money(totalCost / input.quantity), recordedBy: actorId, recordedAt: now, inventoryReference: outputNumber, journalId: posting.id, scope: structuredClone(order.scope ?? next.scope), version: 1 }); next.journalDrafts.unshift(posting); next.workOrders = next.workOrders.map((item) => item.id === order.id ? { ...item, quantityCompleted: completed, status: completed >= item.quantityPlanned ? 'completed' : 'in-progress', operations: item.operations.map((operation) => ({ ...operation, status: completed >= item.quantityPlanned ? 'completed' : operation.status })), completedBy: completed >= item.quantityPlanned ? actorId : undefined, completedAt: completed >= item.quantityPlanned ? now : undefined, version: item.version + 1 } : item); return next;
}
