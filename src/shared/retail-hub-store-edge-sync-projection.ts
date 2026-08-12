import type { RetailSale } from './retail-pos-contracts';

/**
 * Browser-safe, narrow projection for a completed POS sale. Hashing and
 * transport stay at their owning boundary; this function only shapes the
 * payload so the renderer never imports Node-only domain modules.
 */
export function buildRetailHubStoreEdgeSalePayload(sale: RetailSale): Record<string, unknown> {
  return {
    schema: 'epic-bos.retail-sale.v1',
    saleId: sale.id,
    saleNumber: sale.number,
    counterId: sale.counterId,
    cashierShiftId: sale.cashierShiftId,
    customerAccountId: sale.customerAccountId,
    transactionKey: sale.transactionKey,
    saleAt: sale.saleAt,
    completedAt: sale.completedAt,
    invoiceId: sale.invoiceId,
    paymentReceiptIds: [...sale.paymentReceiptIds],
    lines: sale.lines.map((line) => ({
      id: line.id,
      itemVariantId: line.itemVariantId,
      catalogProductId: line.catalogProductId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxableValue: line.taxableValue,
      gstRate: line.gstRate,
      gstAmount: line.cessAmount + (line.lineTotal - line.taxableValue - line.cessAmount),
      cessAmount: line.cessAmount,
      lineTotal: line.lineTotal,
      costValue: line.costValue,
    })),
    subtotal: sale.subtotal,
    discountTotal: sale.discountTotal,
    taxPreview: structuredClone(sale.taxPreview),
    tenders: sale.tenders.map(({ method, amount, reference }) => ({ method, amount, reference })),
    costTotal: sale.costTotal,
    scope: sale.scope ? structuredClone(sale.scope) : undefined,
  };
}
