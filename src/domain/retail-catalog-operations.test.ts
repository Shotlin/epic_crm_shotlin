import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createInventoryItem, createItemVariant } from './inventory-warehouse';
import { assignRetailBarcode, createRetailBarcodeSequence, createRetailCatalogCategory, createRetailLabelPrintRun, saveRetailMerchandisingProfile } from './retail-catalog';
import { applyRetailCatalogBulkEdit, createRetailLabelPrintDispatch, createRetailPrinterAdapter, createRetailScaleProfile, decideRetailLabelPrintDispatch, prepareRetailCatalogBulkEdit, testRetailPrinterAdapter } from './retail-catalog-operations';

function retailOpsState() {
  let state = createInitialRevenueOpsState();
  state = { ...state, products: [{ id: 'product-rice', sku: 'RICE-5KG', name: 'Basmati rice 5 kg', description: 'Retail grocery item', kind: 'goods', uom: 'KG', taxCodeId: 'tax-default', effectiveFrom: '2026-04-01', active: true, version: 1 }] };
  state = createInventoryItem(state, { productId: 'product-rice', code: 'RICE-5KG', name: 'Basmati rice 5 kg', baseUomId: 'uom-kg', tracking: 'batch', valuationMethod: 'fifo' }, 'item-rice');
  state = createItemVariant(state, { itemId: 'item-rice', sku: 'RICE-5KG-REG', name: 'Basmati rice 5 kg regular', attributes: { pack: '5kg' } }, 'variant-rice');
  state = createRetailCatalogCategory(state, { code: 'GROCERY', name: 'Grocery' }, 'category-grocery');
  return state;
}

describe('retail catalog operations', () => {
  it('enforces scale quantity boundaries for a weighted SKU', () => {
    let state = retailOpsState();
    state = createRetailScaleProfile(state, { itemVariantId: 'variant-rice', uomId: 'uom-kg', pricingBasis: 'per-weight', decimalPrecision: 3, minimumQuantity: 0.1, maximumQuantity: 25 }, '00000000-0000-4000-8000-000000000001');
    expect(state.retailScaleProfiles[0]).toMatchObject({ id: '00000000-0000-4000-8000-000000000001', itemVariantId: 'variant-rice', uomId: 'uom-kg', pricingBasis: 'per-weight', decimalPrecision: 3, active: true });
    expect(() => createRetailScaleProfile(state, { itemVariantId: 'variant-rice', uomId: 'uom-kg', pricingBasis: 'per-weight', decimalPrecision: 3, minimumQuantity: 0.1, maximumQuantity: 25 })).toThrow('active scale profile');
  });

  it('certifies a printer and requires independent acknowledgement of label delivery', () => {
    let state = retailOpsState();
    state = createRetailBarcodeSequence(state, { code: 'GROCERY', prefix: '8901', digitCount: 12, nextNumber: 1000 }, 'sequence-grocery');
    state = assignRetailBarcode(state, { sequenceId: 'sequence-grocery', itemVariantId: 'variant-rice', expectedSequenceVersion: 1, expectedVariantVersion: 1 });
    state = createRetailLabelPrintRun(state, { itemVariantId: 'variant-rice', quantity: 10, template: 'barcode', evidenceReference: 'Shelf relabel batch' }, 'maker', 'label-run-rice', '2026-07-30T08:00:00.000Z');
    state = createRetailPrinterAdapter(state, { code: 'COUNTER-PRINTER', name: 'Counter thermal printer', connection: 'usb', supportedTemplates: ['barcode'] }, '00000000-0000-4000-8000-000000000002');
    state = testRetailPrinterAdapter(state, { id: '00000000-0000-4000-8000-000000000002', evidenceReference: 'ESC/POS test page and count verified', expectedVersion: 1 }, 'certifier', '2026-07-30T08:01:00.000Z');
    state = createRetailLabelPrintDispatch(state, { labelPrintRunId: 'label-run-rice', printerAdapterId: '00000000-0000-4000-8000-000000000002' }, 'maker', '00000000-0000-4000-8000-000000000003', '2026-07-30T08:02:00.000Z');
    expect(() => decideRetailLabelPrintDispatch(state, { id: '00000000-0000-4000-8000-000000000003', decision: 'acknowledged', evidenceReference: 'same maker cannot acknowledge', expectedVersion: 1 }, 'maker')).toThrow('independent');
    state = decideRetailLabelPrintDispatch(state, { id: '00000000-0000-4000-8000-000000000003', decision: 'acknowledged', evidenceReference: 'Printed labels counted and matched', expectedVersion: 1 }, 'checker', '2026-07-30T08:03:00.000Z');
    expect(state.retailLabelPrintDispatches[0]).toMatchObject({ status: 'acknowledged', acknowledgedBy: 'checker', payloadChecksum: expect.any(String) });
    expect(state.retailLabelPrintDispatches[0]).toMatchObject({ payloadProtocol: 'escpos-thermal-v1', payloadByteLength: expect.any(Number), payloadBase64: expect.any(String) });
    expect(state.retailLabelPrintDispatches[0]!.payloadByteLength ?? 0).toBeGreaterThan(20);
  });

  it('applies a governed bulk merchandising edit only through an independent reviewer', () => {
    let state = retailOpsState();
    state = saveRetailMerchandisingProfile(state, { itemId: 'item-rice', categoryId: 'category-grocery', searchKeywords: ['rice'] }, undefined, 'profile-rice');
    state = prepareRetailCatalogBulkEdit(state, { changes: [{ itemId: 'item-rice', categoryId: 'category-grocery', searchKeywords: ['Basmati', 'rice'], expectedVersion: 1 }] }, 'maker', '00000000-0000-4000-8000-000000000004', '2026-07-30T08:05:00.000Z');
    expect(() => applyRetailCatalogBulkEdit(state, { id: '00000000-0000-4000-8000-000000000004', evidenceReference: 'maker cannot apply', expectedVersion: 1 }, 'maker')).toThrow('independent');
    state = applyRetailCatalogBulkEdit(state, { id: '00000000-0000-4000-8000-000000000004', evidenceReference: 'Category and keywords reviewed', expectedVersion: 1 }, 'checker', '2026-07-30T08:06:00.000Z');
    expect(state.retailCatalogBulkEdits[0]).toMatchObject({ status: 'applied', appliedBy: 'checker' });
    expect(state.retailMerchandisingProfiles[0]).toMatchObject({ searchKeywords: ['basmati', 'rice'], version: 2 });
  });
});
