import { createHash, randomUUID } from 'node:crypto';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { ApplyRetailCatalogBulkEditInput, CreateRetailLabelPrintDispatchInput, CreateRetailPrinterAdapterInput, CreateRetailScaleProfileInput, DecideRetailLabelPrintDispatchInput, PrepareRetailCatalogBulkEditInput, RetailCatalogBulkEdit, RetailLabelPrintDispatch, RetailPrinterAdapter, RetailScaleProfile, TestRetailPrinterAdapterInput } from '../shared/retail-catalog-operations-contracts';
import { saveRetailMerchandisingProfile } from './retail-catalog';
import { toIndiaBusinessDate } from '../shared/india-business-date';
import { buildRetailEscPosLabelPayload } from './retail-escpos';

const checksum = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value: string, label: string, min = 2, max = 180) => { const v = value.trim().replace(/\s+/g, ' '); if (v.length < min || v.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`); return v; };
const code = (value: string, label: string) => { const v = value.trim().toUpperCase(); if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(v)) throw new Error(`${label} must use 2-32 capital letters, numbers, or dashes.`); return v; };
const positive = (value: number, label: string) => { if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive.`); return value; };
const mutate = (state: RevenueOpsState) => { const next = structuredClone(state); next.revision += 1; return next; };
const sameScope = (state: RevenueOpsState, record: { scope?: RevenueOpsState['scope'] }) => { const scope = record.scope ?? state.scope; return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId; };
const number = (prefix: string, sequence: number, at: string) => { const [yearToken, monthToken] = toIndiaBusinessDate(at).split('-'); const year = Number(yearToken); const month = Number(monthToken); const start = month >= 4 ? year : year - 1; return `${prefix}/${String(start).slice(-2)}-${String(start + 1).slice(-2)}/${String(sequence).padStart(5, '0')}`; };

export function createRetailScaleProfile(state: RevenueOpsState, input: CreateRetailScaleProfileInput, id = randomUUID()): RevenueOpsState {
  const variant = state.itemVariants.find((item) => item.id === input.itemVariantId && item.active && sameScope(state, item));
  const uom = state.uoms.find((item) => item.id === input.uomId && item.active && sameScope(state, item));
  if (!variant || !uom) throw new Error('Scale profile requires an active SKU and UOM in the current branch.');
  if (input.pricingBasis === 'per-weight' && uom.category !== 'weight') throw new Error('Per-weight pricing requires a weight UOM such as KG or GRAM.');
  if (!Number.isInteger(input.decimalPrecision) || input.decimalPrecision < 0 || input.decimalPrecision > 6) throw new Error('Scale decimal precision must be between 0 and 6.');
  const minimumQuantity = positive(input.minimumQuantity, 'Scale minimum quantity'); const maximumQuantity = positive(input.maximumQuantity, 'Scale maximum quantity');
  if (minimumQuantity > maximumQuantity) throw new Error('Scale minimum quantity cannot exceed maximum quantity.');
  if (state.retailScaleProfiles.some((profile) => profile.itemVariantId === variant.id && profile.active && sameScope(state, profile))) throw new Error('An active scale profile already exists for this SKU.');
  const next = mutate(state); const profile: RetailScaleProfile = { id, itemVariantId: variant.id, uomId: uom.id, pricingBasis: input.pricingBasis, decimalPrecision: input.decimalPrecision, minimumQuantity, maximumQuantity, barcodePrefix: input.barcodePrefix?.trim() || undefined, active: true, scope: structuredClone(next.scope), version: 1 }; next.retailScaleProfiles.unshift(profile); return next;
}

export function createRetailPrinterAdapter(state: RevenueOpsState, input: CreateRetailPrinterAdapterInput, id = randomUUID()): RevenueOpsState {
  const normalizedCode = code(input.code, 'Retail printer adapter code');
  if (state.retailPrinterAdapters.some((adapter) => adapter.code === normalizedCode && sameScope(state, adapter))) throw new Error('Retail printer adapter code already exists.');
  if (!input.supportedTemplates.length) throw new Error('Printer adapter must declare at least one supported label template.');
  const next = mutate(state); const adapter: RetailPrinterAdapter = { id, code: normalizedCode, name: clean(input.name, 'Retail printer adapter name'), connection: input.connection, model: input.model?.trim() || undefined, status: 'draft', supportedTemplates: [...new Set(input.supportedTemplates)], scope: structuredClone(next.scope), version: 1 }; next.retailPrinterAdapters.unshift(adapter); return next;
}

export function testRetailPrinterAdapter(state: RevenueOpsState, input: TestRetailPrinterAdapterInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const adapter = state.retailPrinterAdapters.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!adapter || adapter.status === 'disabled' || adapter.version !== input.expectedVersion) throw new Error('Printer adapter is stale, disabled, or missing.');
  const evidence = clean(input.evidenceReference, 'Printer test evidence', 3, 240);
  const next = mutate(state); next.retailPrinterAdapters = next.retailPrinterAdapters.map((candidate) => candidate.id === adapter.id ? { ...candidate, status: 'certified' as const, lastTestEvidence: `${evidence} · ${actorId}`, lastTestedAt: now, version: candidate.version + 1 } : candidate); return next;
}

export function createRetailLabelPrintDispatch(state: RevenueOpsState, input: CreateRetailLabelPrintDispatchInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const run = state.retailLabelPrintRuns.find((candidate) => candidate.id === input.labelPrintRunId && sameScope(state, candidate));
  const adapter = state.retailPrinterAdapters.find((candidate) => candidate.id === input.printerAdapterId && sameScope(state, candidate));
  if (!run || !adapter || adapter.status !== 'certified' || !adapter.supportedTemplates.includes(run.template)) throw new Error('Label dispatch requires a certified printer adapter that supports the requested template.');
  if (state.retailLabelPrintDispatches.some((dispatch) => dispatch.labelPrintRunId === run.id && dispatch.status !== 'failed' && sameScope(state, dispatch))) throw new Error('This label run already has an active printer dispatch.');
  const variant = state.itemVariants.find((candidate) => candidate.id === run.itemVariantId && sameScope(state, candidate));
  if (!variant) throw new Error('Label dispatch requires an in-scope SKU variant.');
  const payload = buildRetailEscPosLabelPayload({ template: run.template, sku: variant.sku, name: variant.name, barcode: run.barcode, quantity: run.quantity });
  const payloadChecksum = checksum({ runId: run.id, adapterId: adapter.id, itemVariantId: run.itemVariantId, barcode: run.barcode, quantity: run.quantity, template: run.template, payload: payload.bytes });
  const next = mutate(state); const dispatch: RetailLabelPrintDispatch = { id, labelPrintRunId: run.id, printerAdapterId: adapter.id, status: 'prepared', payloadChecksum, payloadProtocol: payload.protocol, payloadByteLength: payload.byteLength, payloadBase64: payload.base64, requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }; next.retailLabelPrintDispatches.unshift(dispatch); return next;
}

export function decideRetailLabelPrintDispatch(state: RevenueOpsState, input: DecideRetailLabelPrintDispatchInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const dispatch = state.retailLabelPrintDispatches.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!dispatch || dispatch.status !== 'prepared' || dispatch.version !== input.expectedVersion) throw new Error('Label dispatch is stale or no longer awaiting device acknowledgement.');
  if (dispatch.requestedBy === actorId) throw new Error('Printer acknowledgement requires an independent device operator.');
  const evidence = clean(input.evidenceReference, 'Printer dispatch decision evidence', 3, 240); const next = mutate(state);
  next.retailLabelPrintDispatches = next.retailLabelPrintDispatches.map((candidate) => candidate.id === dispatch.id ? (input.decision === 'acknowledged' ? { ...candidate, status: 'acknowledged' as const, handoffEvidence: evidence, acknowledgedBy: actorId, acknowledgedAt: now, version: candidate.version + 1 } : { ...candidate, status: 'failed' as const, failureReason: evidence, acknowledgedBy: actorId, acknowledgedAt: now, version: candidate.version + 1 }) : candidate); return next;
}

function normalizedChanges(state: RevenueOpsState, changes: PrepareRetailCatalogBulkEditInput['changes']): RetailCatalogBulkEdit['changes'] {
  if (!changes.length || changes.length > 500) throw new Error('Bulk catalog edit requires between 1 and 500 item changes.');
  const ids = new Set<string>();
  return changes.map((change) => {
    if (ids.has(change.itemId)) throw new Error('Bulk catalog edit cannot repeat an inventory item.'); ids.add(change.itemId);
    const item = state.inventoryItems.find((candidate) => candidate.id === change.itemId && candidate.active && sameScope(state, candidate));
    const category = state.retailCatalogCategories.find((candidate) => candidate.id === change.categoryId && candidate.active && sameScope(state, candidate));
    if (!item || !category) throw new Error('Bulk catalog edit contains an inactive or out-of-scope item/category.');
    if (change.brandId && !state.retailCatalogBrands.some((candidate) => candidate.id === change.brandId && candidate.active && sameScope(state, candidate))) throw new Error('Bulk catalog edit contains an inactive or out-of-scope brand.');
    if (change.rackBinId && !state.storageBins.some((candidate) => candidate.id === change.rackBinId && candidate.status === 'available' && sameScope(state, candidate))) throw new Error('Bulk catalog edit contains an unavailable rack bin.');
    return { itemId: item.id, categoryId: category.id, brandId: change.brandId, rackBinId: change.rackBinId, searchKeywords: [...new Set(change.searchKeywords.map((keyword) => clean(keyword, 'Bulk search keyword', 2, 60).toLowerCase()))], expectedVersion: change.expectedVersion };
  });
}

export function prepareRetailCatalogBulkEdit(state: RevenueOpsState, input: PrepareRetailCatalogBulkEditInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const changes = normalizedChanges(state, input.changes); const next = mutate(state); const edit: RetailCatalogBulkEdit = { id, number: number('BCAT', state.retailCatalogBulkEdits.length + 1, now), changes, checksum: checksum(changes), status: 'prepared', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }; next.retailCatalogBulkEdits.unshift(edit); return next;
}

export function applyRetailCatalogBulkEdit(state: RevenueOpsState, input: ApplyRetailCatalogBulkEditInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const edit = state.retailCatalogBulkEdits.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!edit || edit.status !== 'prepared' || edit.version !== input.expectedVersion) throw new Error('Bulk catalog edit is stale or no longer awaiting application.');
  if (edit.requestedBy === actorId) throw new Error('Bulk catalog application requires an independent reviewer.');
  let next = structuredClone(state);
  for (const change of edit.changes) next = saveRetailMerchandisingProfile(next, { itemId: change.itemId, categoryId: change.categoryId, brandId: change.brandId, rackBinId: change.rackBinId, searchKeywords: change.searchKeywords, expectedVersion: change.expectedVersion });
  next.revision += 1; const evidence = clean(input.evidenceReference, 'Bulk catalog application evidence', 3, 240); next.retailCatalogBulkEdits = next.retailCatalogBulkEdits.map((candidate) => candidate.id === edit.id ? { ...candidate, status: 'applied' as const, appliedBy: actorId, appliedAt: now, decisionEvidence: evidence, version: candidate.version + 1 } : candidate); return next;
}
