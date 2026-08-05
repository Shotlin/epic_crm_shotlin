import type { OperatingRecordScope } from './revenue-ops-contracts';

/**
 * Governed attachment-vault resource binding for retail merchandising images.
 * Every merchandising image must be stored under this resource with the owning
 * item id as its resourceId, so the domain can prove an image belongs to the
 * item being merchandised in the active branch.
 */
export const RETAIL_MERCHANDISING_IMAGE_RESOURCE = 'retail.merchandising';

/** JPEG/PNG only: the sole image types a shelf card may present. */
export const RETAIL_MERCHANDISING_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

/**
 * A resolved, main-verified image descriptor. The renderer can never fabricate
 * this; the IPC layer resolves it from the encrypted attachment vault and the
 * domain makes the authoritative accept/reject decision from it.
 */
export interface RetailMerchandisingImageDescriptor {
  id: string;
  mimeType: string;
  resource: string;
  resourceId: string;
}

/**
 * Retail master data is deliberately separate from the generic commerce
 * catalogue. It allows a shop to merchandise the same inventory truth by
 * aisle, brand and shelf without changing tax, stock or valuation evidence.
 */
export interface RetailCatalogCategory {
  id: string;
  code: string;
  name: string;
  parentCategoryId?: string;
  active: boolean;
  scope?: OperatingRecordScope;
  version: number;
}

export interface RetailCatalogBrand {
  id: string;
  code: string;
  name: string;
  active: boolean;
  scope?: OperatingRecordScope;
  version: number;
}

/** One controlled retail presentation per inventory item in the active branch. */
export interface RetailMerchandisingProfile {
  id: string;
  itemId: string;
  categoryId: string;
  brandId?: string;
  /** Existing storage-bin identity used as the local shelf/rack reference. */
  rackBinId?: string;
  /** Optional encrypted kernel attachment reference; image bytes never enter this state. */
  imageAttachmentId?: string;
  searchKeywords: string[];
  scope?: OperatingRecordScope;
  version: number;
}

/**
 * A branch-scoped numeric barcode allocator. `nextNumber` is the next value
 * to allocate, so a reset to 5000 produces 5000 first and 5001 next.
 */
export interface RetailBarcodeSequence {
  id: string;
  code: string;
  prefix: string;
  digitCount: number;
  nextNumber: number;
  active: boolean;
  lastResetEvidence?: string;
  lastResetBy?: string;
  lastResetAt?: string;
  scope?: OperatingRecordScope;
  version: number;
}

/** A print-ready audit record; actual printer delivery stays a device adapter concern. */
export interface RetailLabelPrintRun {
  id: string;
  number: string;
  itemVariantId: string;
  barcode: string;
  quantity: number;
  template: 'shelf' | 'barcode' | 'price-tag';
  evidenceReference: string;
  requestedBy: string;
  requestedAt: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreateRetailCatalogCategoryInput {
  code: string;
  name: string;
  parentCategoryId?: string;
}

export interface CreateRetailCatalogBrandInput {
  code: string;
  name: string;
}

export interface SaveRetailMerchandisingProfileInput {
  itemId: string;
  categoryId: string;
  brandId?: string;
  rackBinId?: string;
  imageAttachmentId?: string;
  searchKeywords: string[];
  /** Required when editing an already created profile. */
  expectedVersion?: number;
}

export interface CreateRetailBarcodeSequenceInput {
  code: string;
  /** Digits that must be prepended to the allocated counter. */
  prefix: string;
  /** Total digits before any optional scanner checksum; 4 through 12. */
  digitCount: number;
  nextNumber: number;
}

export interface ResetRetailBarcodeSequenceInput {
  id: string;
  nextNumber: number;
  evidenceReference: string;
  expectedVersion: number;
}

export interface AssignRetailBarcodeInput {
  sequenceId: string;
  itemVariantId: string;
  expectedSequenceVersion: number;
  expectedVariantVersion: number;
}

export interface CreateRetailLabelPrintRunInput {
  itemVariantId: string;
  quantity: number;
  template: RetailLabelPrintRun['template'];
  evidenceReference: string;
}

export interface RetailProductComboComponent {
  itemVariantId: string;
  quantity: number;
}

export interface RetailProductCombo {
  id: string;
  code: string;
  name: string;
  parentItemVariantId: string;
  components: RetailProductComboComponent[];
  active: boolean;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreateRetailProductComboInput {
  code: string;
  name: string;
  parentItemVariantId: string;
  components: RetailProductComboComponent[];
}

