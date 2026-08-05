import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createInventoryItem, createItemVariant } from './inventory-warehouse';
import { applyRetailPurchaseOcrMapping, prepareRetailPurchaseOcrMapping } from './retail-commerce-advanced';
import { createRetailPurchaseOcrDocument, convertRetailPurchaseOcr, decideRetailPurchaseOcr } from './retail-commerce';

const checksum = 'a'.repeat(64);
const ocrId = '00000000-0000-4000-8000-000000000061';
const mappingId = '00000000-0000-4000-8000-000000000062';

describe('retail OCR supplier-invoice conversion', () => {
  it('cannot convert from a forged line payload and requires an applied mapping', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, products: [{ id: 'product-tea', sku: 'TEA-1KG', name: 'Assam tea', description: 'Retail grocery item', kind: 'goods', uom: 'KG', taxCodeId: 'tax-default', effectiveFrom: '2026-04-01', active: true, version: 1 }] };
    state = createInventoryItem(state, { productId: 'product-tea', code: 'TEA-1KG', name: 'Assam tea', baseUomId: 'uom-kg', tracking: 'batch', valuationMethod: 'fifo' }, 'item-tea');
    state = createItemVariant(state, { itemId: 'item-tea', sku: 'TEA-1KG-REG', name: 'Assam tea regular', attributes: { pack: '1kg' } }, 'variant-tea');
    const scope = { ...state.scope };
    const purchaseOrder = { id: 'po-1', number: 'PO-1', supplierId: 'supplier-1', warehouseId: 'warehouse-1', deliveryBy: '2026-08-01', paymentTermDays: 30, status: 'received', lines: [{ id: 'po-line-1', itemVariantId: 'variant-tea', description: 'Assam tea', quantity: 1, unitPrice: 100, gstRate: 5, taxableValue: 100, taxAmount: 5, totalAmount: 105, receivedQuantity: 1, invoicedQuantity: 0 }], taxableValue: 100, taxAmount: 5, totalAmount: 105, createdBy: 'maker', createdAt: '2026-07-31T12:00:00.000Z', scope, version: 1 };
    const goodsReceipt = { id: 'gr-1', number: 'GR-1', purchaseOrderId: 'po-1', supplierId: 'supplier-1', warehouseId: 'warehouse-1', receivingBinId: 'bin-1', receivedAt: '2026-07-31', lines: [{ id: 'gr-line-1', purchaseOrderLineId: 'po-line-1', itemVariantId: 'variant-tea', quantity: 1, unitPrice: 100, inventoryReference: 'receipt-ref-1', serialNumbers: [] }], status: 'cost-pending', receivedBy: 'maker', receivedAtRecorded: '2026-07-31T12:01:00.000Z', scope, version: 1 };
    state = { ...state, purchaseOrders: [purchaseOrder] as never[], goodsReceipts: [goodsReceipt] as never[] };
    state = createRetailPurchaseOcrDocument(state, { source: 'upload', fileName: 'supplier-invoice.pdf', fileChecksum: checksum, purchaseOrderId: 'po-1', goodsReceiptId: 'gr-1', extractedInvoiceNumber: 'SUP-1', extractedInvoiceDate: '2026-07-31', extractedTotalAmount: 105, extractionConfidence: 0.95, lines: [{ description: 'Assam tea', itemVariantId: 'variant-tea', quantity: 1, unitPrice: 100, gstRate: 5, confidence: 0.95 }] }, 'maker', ocrId, '2026-07-31T12:02:00.000Z');
    state = decideRetailPurchaseOcr(state, { id: ocrId, decision: 'approved', evidence: 'Invoice header, supplier and GST totals reviewed', expectedVersion: 1 }, 'checker', '2026-07-31T12:03:00.000Z');
    expect(() => convertRetailPurchaseOcr(state, { id: ocrId, mappingId: 'missing-map', purchaseOrderId: 'po-1', goodsReceiptId: 'gr-1', supplierInvoiceNumber: 'SUP-1', invoiceDate: '2026-07-31', lines: [{ purchaseOrderLineId: 'po-line-1', quantity: 1, unitPrice: 100, gstRate: 5 }], expectedVersion: 2 }, 'maker')).toThrow('applied OCR-to-PO mapping');
    state = prepareRetailPurchaseOcrMapping(state, { ocrDocumentId: ocrId, mappings: [{ ocrLineId: state.retailPurchaseOcrDocuments[0]!.lines[0]!.id, purchaseOrderLineId: 'po-line-1', itemVariantId: 'variant-tea' }] }, 'maker', mappingId, '2026-07-31T12:04:00.000Z');
    state = applyRetailPurchaseOcrMapping(state, { id: mappingId, evidence: 'OCR line, PO line and received quantity independently reconciled', expectedVersion: 1 }, 'checker', '2026-07-31T12:05:00.000Z');
    state = convertRetailPurchaseOcr(state, { id: ocrId, mappingId, purchaseOrderId: 'po-1', goodsReceiptId: 'gr-1', supplierInvoiceNumber: 'SUP-1', invoiceDate: '2026-07-31', lines: [{ purchaseOrderLineId: 'po-line-1', quantity: 1, unitPrice: 100, gstRate: 5 }], expectedVersion: 3 }, 'maker', '2026-07-31T12:06:00.000Z');
    expect(state.retailPurchaseOcrDocuments[0]).toMatchObject({ status: 'converted', convertedSupplierInvoiceId: state.supplierInvoices[0]!.id });
    expect(state.threeWayMatches[0]).toMatchObject({ supplierInvoiceId: state.supplierInvoices[0]!.id, status: 'matched' });
  });
});
