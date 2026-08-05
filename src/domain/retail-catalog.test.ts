import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createInventoryItem, createItemVariant } from './inventory-warehouse';
import {
  assignRetailBarcode,
  createRetailBarcodeSequence,
  createRetailCatalogBrand,
  createRetailCatalogCategory,
  createRetailLabelPrintRun,
  createRetailProductCombo,
  resetRetailBarcodeSequence,
  saveRetailMerchandisingProfile,
} from './retail-catalog';

function retailItemState() {
  let state = createInitialRevenueOpsState();
  state = {
    ...state,
    taxCodes: [{
      id: 'tax-hsn-milk', code: '0401', kind: 'HSN', description: 'Milk and cream retail goods', gstRate: 5, cessRate: 0,
      effectiveFrom: '2026-04-01', sourceLabel: 'Controlled retail HSN register', sourceUrl: 'https://example.invalid/hsn', reviewStatus: 'verified', version: 1,
    }],
    products: [{
      id: 'product-milk', sku: 'MILK-1L', name: 'Fresh retail milk 1 L', description: 'Controlled grocery retail product.', kind: 'goods', uom: 'UNIT', taxCodeId: 'tax-hsn-milk', effectiveFrom: '2026-04-01', active: true, version: 1,
    }],
  };
  state = createInventoryItem(state, {
    productId: 'product-milk', code: 'MILK-1L', name: 'Fresh retail milk 1 L', baseUomId: 'uom-unit', tracking: 'batch', valuationMethod: 'fifo', shelfLifeDays: 10,
  }, 'item-milk');
  return createItemVariant(state, {
    itemId: 'item-milk', sku: 'MILK-1L-REG', name: 'Fresh retail milk 1 L regular', attributes: { pack: '1L' },
  }, 'variant-milk');
}

describe('retail catalogue control', () => {
  it('keeps branch merchandising separate from inventory truth and allocates barcodes atomically', () => {
    let state = retailItemState();
    state = createRetailCatalogCategory(state, { code: 'GROCERY', name: 'Grocery' }, 'category-grocery');
    state = createRetailCatalogCategory(state, { code: 'DAIRY', name: 'Dairy', parentCategoryId: 'category-grocery' }, 'category-dairy');
    state = createRetailCatalogBrand(state, { code: 'FRESHCO', name: 'FreshCo Dairy' }, 'brand-freshco');
    state = saveRetailMerchandisingProfile(state, {
      itemId: 'item-milk', categoryId: 'category-dairy', brandId: 'brand-freshco', searchKeywords: ['milk', 'dairy', 'Milk'],
    }, undefined, 'profile-milk');
    expect(state.retailMerchandisingProfiles[0]).toMatchObject({
      id: 'profile-milk', itemId: 'item-milk', categoryId: 'category-dairy', brandId: 'brand-freshco', searchKeywords: ['milk', 'dairy'], version: 1,
    });
    expect(state.inventoryItems.find(({ id }) => id === 'item-milk')).toMatchObject({ code: 'MILK-1L', version: 1 });

    state = createRetailBarcodeSequence(state, { code: 'GROCERY-COUNTER', prefix: '8901', digitCount: 12, nextNumber: 5000 }, 'sequence-grocery');
    state = assignRetailBarcode(state, {
      sequenceId: 'sequence-grocery', itemVariantId: 'variant-milk', expectedSequenceVersion: 1, expectedVariantVersion: 1,
    });
    expect(state.itemVariants.find(({ id }) => id === 'variant-milk')).toMatchObject({ barcode: '890100005000', version: 2 });
    expect(state.retailBarcodeSequences[0]).toMatchObject({ nextNumber: 5001, version: 2 });
    expect(() => assignRetailBarcode(state, {
      sequenceId: 'sequence-grocery', itemVariantId: 'variant-milk', expectedSequenceVersion: 2, expectedVariantVersion: 2,
    })).toThrow('already has a barcode');
  });

  it('makes barcode resets and label runs accountable without rewriting printed barcode evidence', () => {
    let state = retailItemState();
    state = createRetailBarcodeSequence(state, { code: 'MILK', prefix: '8901', digitCount: 12, nextNumber: 5000 }, 'sequence-milk');
    state = assignRetailBarcode(state, { sequenceId: 'sequence-milk', itemVariantId: 'variant-milk', expectedSequenceVersion: 1, expectedVariantVersion: 1 });
    state = resetRetailBarcodeSequence(state, {
      id: 'sequence-milk', nextNumber: 7000, evidenceReference: 'Approved re-sequencing register 2026-07', expectedVersion: 2,
    }, 'catalog-manager', '2026-07-15T08:00:00.000Z');
    expect(state.retailBarcodeSequences[0]).toMatchObject({
      nextNumber: 7000, lastResetBy: 'catalog-manager', lastResetEvidence: 'Approved re-sequencing register 2026-07', version: 3,
    });
    state = createRetailLabelPrintRun(state, {
      itemVariantId: 'variant-milk', quantity: 48, template: 'barcode', evidenceReference: 'GRN-MILK-2026-07-15',
    }, 'catalog-manager', 'label-run-milk', '2026-07-15T08:05:00.000Z');
    expect(state.retailLabelPrintRuns[0]).toMatchObject({
      id: 'label-run-milk', itemVariantId: 'variant-milk', barcode: '890100005000', quantity: 48, template: 'barcode', requestedBy: 'catalog-manager',
    });
  });

  it('defines retail product combos linking a parent SKU to component inventory SKUs', () => {
    let state = retailItemState();
    state = createItemVariant(state, {
      itemId: 'item-milk', sku: 'MILK-FAMILY-PACK', name: 'Fresh milk 2-pack bundle', attributes: { pack: '2x1L' },
    }, 'variant-milk-combo');

    state = createRetailProductCombo(state, {
      code: 'COMBO-MILK-2PK',
      name: 'Breakfast Milk Twin Pack',
      parentItemVariantId: 'variant-milk-combo',
      components: [{ itemVariantId: 'variant-milk', quantity: 2 }],
    }, 'combo-milk-twin');

    expect(state.retailProductCombos).toHaveLength(1);
    expect(state.retailProductCombos[0]).toMatchObject({
      id: 'combo-milk-twin',
      code: 'COMBO-MILK-2PK',
      name: 'Breakfast Milk Twin Pack',
      parentItemVariantId: 'variant-milk-combo',
      components: [{ itemVariantId: 'variant-milk', quantity: 2 }],
      active: true,
      version: 1,
    });
  });
});

