import { randomUUID } from 'node:crypto';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type {
  AssignRetailBarcodeInput,
  CreateRetailBarcodeSequenceInput,
  CreateRetailCatalogBrandInput,
  CreateRetailCatalogCategoryInput,
  CreateRetailLabelPrintRunInput,
  CreateRetailProductComboInput,
  ResetRetailBarcodeSequenceInput,
  RetailMerchandisingImageDescriptor,
  SaveRetailMerchandisingProfileInput,
} from '../shared/retail-catalog-contracts';
import {
  RETAIL_MERCHANDISING_IMAGE_MIME_TYPES,
  RETAIL_MERCHANDISING_IMAGE_RESOURCE,
} from '../shared/retail-catalog-contracts';
import { toIndiaBusinessDate } from '../shared/india-business-date';

const clean = (value: string, label: string, minimum = 2, maximum = 160): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  }
  return normalized;
};

const code = (value: string, label: string, maximum = 24): string => {
  const normalized = value.trim().toUpperCase();
  if (!new RegExp(`^[A-Z0-9][A-Z0-9-]{1,${maximum - 1}}$`).test(normalized)) {
    throw new Error(`${label} must use 2-${maximum} capital letters, numbers, or dashes.`);
  }
  return normalized;
};

function mutate(state: RevenueOpsState): RevenueOpsState {
  const next = structuredClone(state);
  next.revision += 1;
  return next;
}

function sameScope(state: RevenueOpsState, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

function number(prefix: string, sequence: number, at: string): string {
  const [yearToken, monthToken] = toIndiaBusinessDate(at).split('-');
  const year = Number(yearToken);
  const month = Number(monthToken);
  if (!Number.isInteger(year) || !Number.isInteger(month)) throw new Error('Retail label business date is invalid.');
  const financialYear = month >= 4 ? year : year - 1;
  return `${prefix}/${String(financialYear).slice(-2)}-${String(financialYear + 1).slice(-2)}/${String(sequence).padStart(5, '0')}`;
}

function validPositiveInteger(value: number, label: string, maximum: number): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${label} must be a whole number between 1 and ${maximum}.`);
  return value;
}

function activeCategory(state: RevenueOpsState, id: string) {
  const category = state.retailCatalogCategories.find((candidate) => candidate.id === id && candidate.active && sameScope(state, candidate));
  if (!category) throw new Error('Active retail category was not found in the current branch.');
  return category;
}

function activeBrand(state: RevenueOpsState, id: string) {
  const brand = state.retailCatalogBrands.find((candidate) => candidate.id === id && candidate.active && sameScope(state, candidate));
  if (!brand) throw new Error('Active retail brand was not found in the current branch.');
  return brand;
}

function barcodeFor(sequence: RevenueOpsState['retailBarcodeSequences'][number]): string {
  const counterDigits = sequence.digitCount - sequence.prefix.length;
  const capacity = 10 ** counterDigits;
  if (counterDigits < 1 || sequence.nextNumber >= capacity) {
    throw new Error('Retail barcode sequence is exhausted; reset or create a new governed sequence before allocation.');
  }
  return `${sequence.prefix}${String(sequence.nextNumber).padStart(counterDigits, '0')}`;
}

function keywords(values: string[]): string[] {
  if (values.length > 30) throw new Error('Retail search keywords may contain at most 30 values.');
  return [...new Set(values.map((value) => clean(value, 'Retail search keyword', 2, 60).toLowerCase()))];
}

/** Creates a category or subcategory in the currently selected retail branch. */
export function createRetailCatalogCategory(
  state: RevenueOpsState,
  input: CreateRetailCatalogCategoryInput,
  id: string = randomUUID(),
): RevenueOpsState {
  const normalizedCode = code(input.code, 'Retail category code');
  const parentCategoryId = input.parentCategoryId?.trim() || undefined;
  if (parentCategoryId) activeCategory(state, parentCategoryId);
  if (state.retailCatalogCategories.some((candidate) => sameScope(state, candidate) && candidate.code === normalizedCode)) {
    throw new Error('Retail category code already exists in the current branch.');
  }
  const next = mutate(state);
  next.retailCatalogCategories.push({
    id,
    code: normalizedCode,
    name: clean(input.name, 'Retail category name'),
    parentCategoryId,
    active: true,
    scope: structuredClone(next.scope),
    version: 1,
  });
  return next;
}

export function createRetailCatalogBrand(
  state: RevenueOpsState,
  input: CreateRetailCatalogBrandInput,
  id: string = randomUUID(),
): RevenueOpsState {
  const normalizedCode = code(input.code, 'Retail brand code');
  if (state.retailCatalogBrands.some((candidate) => sameScope(state, candidate) && candidate.code === normalizedCode)) {
    throw new Error('Retail brand code already exists in the current branch.');
  }
  const next = mutate(state);
  next.retailCatalogBrands.push({
    id,
    code: normalizedCode,
    name: clean(input.name, 'Retail brand name'),
    active: true,
    scope: structuredClone(next.scope),
    version: 1,
  });
  return next;
}

/** Creates or revises an item's branch-local category, brand, shelf and attachment metadata. */
export function saveRetailMerchandisingProfile(
  state: RevenueOpsState,
  input: SaveRetailMerchandisingProfileInput,
  imageDescriptor?: RetailMerchandisingImageDescriptor,
  id: string = randomUUID(),
): RevenueOpsState {
  const item = state.inventoryItems.find((candidate) => candidate.id === input.itemId && candidate.active && sameScope(state, candidate));
  if (!item) throw new Error('An active inventory item is required for retail merchandising.');
  activeCategory(state, input.categoryId);
  if (input.brandId) activeBrand(state, input.brandId);
  const rackBinId = input.rackBinId?.trim() || undefined;
  if (rackBinId) {
    const bin = state.storageBins.find((candidate) => candidate.id === rackBinId && candidate.status === 'available' && sameScope(state, candidate));
    const zone = bin && state.warehouseZones.find((candidate) => candidate.id === bin.zoneId && candidate.active && sameScope(state, candidate));
    if (!bin || !zone || !['storage', 'picking'].includes(zone.purpose)) {
      throw new Error('Retail rack must be an available storage or picking bin in the current branch.');
    }
  }
  const imageAttachmentId = input.imageAttachmentId?.trim() || undefined;
  if (imageAttachmentId) {
    // The renderer cannot fabricate an authoritative image decision: main resolves the
    // descriptor from the encrypted attachment vault and the domain proves it here.
    if (!imageDescriptor || imageDescriptor.id !== imageAttachmentId) {
      throw new Error('Retail image attachment could not be verified against the encrypted vault.');
    }
    if (imageDescriptor.resource !== RETAIL_MERCHANDISING_IMAGE_RESOURCE || imageDescriptor.resourceId !== item.id) {
      throw new Error('Retail image attachment is not bound to this item in the current branch.');
    }
    if (!RETAIL_MERCHANDISING_IMAGE_MIME_TYPES.includes(imageDescriptor.mimeType as (typeof RETAIL_MERCHANDISING_IMAGE_MIME_TYPES)[number])) {
      throw new Error('Retail merchandising image must be a JPEG or PNG.');
    }
  }
  const existing = state.retailMerchandisingProfiles.find((candidate) => candidate.itemId === item.id && sameScope(state, candidate));
  if (existing && input.expectedVersion !== existing.version) {
    throw new Error('Retail merchandising profile changed. Refresh before saving.');
  }
  if (!existing && input.expectedVersion !== undefined) {
    throw new Error('A new retail merchandising profile must not carry an expected version.');
  }
  const profile = {
    id: existing?.id ?? id,
    itemId: item.id,
    categoryId: input.categoryId,
    brandId: input.brandId?.trim() || undefined,
    rackBinId,
    imageAttachmentId,
    searchKeywords: keywords(input.searchKeywords),
    scope: structuredClone(existing?.scope ?? state.scope),
    version: (existing?.version ?? 0) + 1,
  };
  const next = mutate(state);
  next.retailMerchandisingProfiles = existing
    ? next.retailMerchandisingProfiles.map((candidate) => candidate.id === existing.id ? profile : candidate)
    : [profile, ...next.retailMerchandisingProfiles];
  return next;
}

export function createRetailBarcodeSequence(
  state: RevenueOpsState,
  input: CreateRetailBarcodeSequenceInput,
  id: string = randomUUID(),
): RevenueOpsState {
  const normalizedCode = code(input.code, 'Retail barcode sequence code');
  const prefix = input.prefix.trim();
  if (!/^\d{0,11}$/.test(prefix)) throw new Error('Retail barcode prefix may contain only digits.');
  const digitCount = validPositiveInteger(input.digitCount, 'Retail barcode digit count', 12);
  if (digitCount < 4 || prefix.length >= digitCount) throw new Error('Retail barcode digit count must leave at least one counter digit after the prefix.');
  const nextNumber = validPositiveInteger(input.nextNumber, 'Retail barcode next number', 999_999_999);
  const capacity = 10 ** (digitCount - prefix.length);
  if (nextNumber >= capacity) throw new Error('Retail barcode next number does not fit the requested prefix and digit count.');
  if (state.retailBarcodeSequences.some((candidate) => sameScope(state, candidate) && candidate.code === normalizedCode)) {
    throw new Error('Retail barcode sequence code already exists in the current branch.');
  }
  const next = mutate(state);
  next.retailBarcodeSequences.push({
    id,
    code: normalizedCode,
    prefix,
    digitCount,
    nextNumber,
    active: true,
    scope: structuredClone(next.scope),
    version: 1,
  });
  return next;
}

/** Resets only the next allocation counter, leaving previously issued labels immutable. */
export function resetRetailBarcodeSequence(
  state: RevenueOpsState,
  input: ResetRetailBarcodeSequenceInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const sequence = state.retailBarcodeSequences.find((candidate) => candidate.id === input.id && candidate.active && sameScope(state, candidate));
  if (!sequence || sequence.version !== input.expectedVersion) throw new Error('Retail barcode sequence changed. Refresh before resetting it.');
  const nextNumber = validPositiveInteger(input.nextNumber, 'Retail barcode reset number', 999_999_999);
  if (nextNumber >= 10 ** (sequence.digitCount - sequence.prefix.length)) {
    throw new Error('Retail barcode reset number does not fit this sequence.');
  }
  const evidenceReference = clean(input.evidenceReference, 'Retail barcode reset evidence', 4, 240);
  const next = mutate(state);
  next.retailBarcodeSequences = next.retailBarcodeSequences.map((candidate) => candidate.id === sequence.id
    ? {
      ...candidate,
      nextNumber,
      lastResetEvidence: evidenceReference,
      lastResetBy: actorId,
      lastResetAt: now,
      version: candidate.version + 1,
    }
    : candidate);
  return next;
}

/** Atomically assigns the next available branch barcode to exactly one active SKU. */
export function assignRetailBarcode(
  state: RevenueOpsState,
  input: AssignRetailBarcodeInput,
): RevenueOpsState {
  const sequence = state.retailBarcodeSequences.find((candidate) => candidate.id === input.sequenceId && candidate.active && sameScope(state, candidate));
  const variant = state.itemVariants.find((candidate) => candidate.id === input.itemVariantId && candidate.active && sameScope(state, candidate));
  if (!sequence || !variant || sequence.version !== input.expectedSequenceVersion || variant.version !== input.expectedVariantVersion) {
    throw new Error('Retail barcode allocation changed. Refresh the sequence and SKU before retrying.');
  }
  if (variant.barcode) throw new Error('Retail SKU already has a barcode. Preserve its printed identity or use an explicit reassignment workflow.');
  const barcode = barcodeFor(sequence);
  if (state.itemVariants.some((candidate) => candidate.barcode === barcode && candidate.id !== variant.id)) {
    throw new Error('Generated retail barcode already belongs to another SKU. Reset or repair the sequence with accountable evidence.');
  }
  const next = mutate(state);
  next.itemVariants = next.itemVariants.map((candidate) => candidate.id === variant.id
    ? { ...candidate, barcode, version: candidate.version + 1 }
    : candidate);
  next.retailBarcodeSequences = next.retailBarcodeSequences.map((candidate) => candidate.id === sequence.id
    ? { ...candidate, nextNumber: candidate.nextNumber + 1, version: candidate.version + 1 }
    : candidate);
  return next;
}

/** Records a printer-independent label run that can be handed to a certified device adapter later. */
export function createRetailLabelPrintRun(
  state: RevenueOpsState,
  input: CreateRetailLabelPrintRunInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): RevenueOpsState {
  const variant = state.itemVariants.find((candidate) => candidate.id === input.itemVariantId && candidate.active && sameScope(state, candidate));
  if (!variant?.barcode) throw new Error('Retail label printing requires an active SKU with a controlled barcode.');
  const quantity = validPositiveInteger(input.quantity, 'Retail label quantity', 1_000_000);
  if (!['shelf', 'barcode', 'price-tag'].includes(input.template)) throw new Error('Retail label template is invalid.');
  const next = mutate(state);
  next.retailLabelPrintRuns = [{
    id,
    number: number('RLBL', next.retailLabelPrintRuns.filter((candidate) => sameScope(next, candidate)).length + 1, now),
    itemVariantId: variant.id,
    barcode: variant.barcode,
    quantity,
    template: input.template,
    evidenceReference: clean(input.evidenceReference, 'Retail label evidence reference', 3, 240),
    requestedBy: actorId,
    requestedAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  }, ...next.retailLabelPrintRuns];
  return next;
}

/** Defines a combo, bundle or kit linking a parent SKU to component inventory SKUs. */
export function createRetailProductCombo(
  state: RevenueOpsState,
  input: CreateRetailProductComboInput,
  id: string = randomUUID(),
): RevenueOpsState {
  const normalizedCode = code(input.code, 'Retail combo code');
  const parentVariant = state.itemVariants.find((candidate) => candidate.id === input.parentItemVariantId && candidate.active && sameScope(state, candidate));
  if (!parentVariant) throw new Error('An active parent SKU variant is required to create a retail product combo.');

  if (!input.components || input.components.length === 0) {
    throw new Error('A retail product combo must contain at least one component SKU.');
  }

  const validatedComponents = input.components.map((comp) => {
    const compVariant = state.itemVariants.find((candidate) => candidate.id === comp.itemVariantId && candidate.active && sameScope(state, candidate));
    if (!compVariant) throw new Error(`Component SKU ${comp.itemVariantId} is not active in the current branch.`);
    const qty = validPositiveInteger(comp.quantity, 'Combo component quantity', 1000);
    return { itemVariantId: compVariant.id, quantity: qty };
  });

  const next = mutate(state);
  next.retailProductCombos = next.retailProductCombos ?? [];
  if (next.retailProductCombos.some((c) => sameScope(next, c) && c.code === normalizedCode)) {
    throw new Error('Retail product combo code already exists in the current branch.');
  }

  next.retailProductCombos.push({
    id,
    code: normalizedCode,
    name: clean(input.name, 'Retail combo name'),
    parentItemVariantId: parentVariant.id,
    components: validatedComponents,
    active: true,
    scope: structuredClone(next.scope),
    version: 1,
  });
  return next;
}

