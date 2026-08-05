import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { GoodsReceipt, PurchaseOrder, ThreeWayMatch } from '../shared/procurement-contracts';

export interface SupplierPortalPurchaseOrderLine {
  itemVariantId: string;
  description: string;
  quantity: number;
  receivedQuantity: number;
  invoicedQuantity: number;
  unitPrice: number;
  gstRate: number;
  totalAmount: number;
}

export interface SupplierPortalPurchaseOrder {
  id: string;
  number: string;
  deliveryBy: string;
  status: PurchaseOrder['status'];
  currency: 'INR';
  totalAmount: number;
  lines: SupplierPortalPurchaseOrderLine[];
}

export interface SupplierPortalReceipt {
  id: string;
  number: string;
  purchaseOrderId: string;
  receivedAt: string;
  status: GoodsReceipt['status'];
  lines: Array<{ itemVariantId: string; quantity: number; inventoryReference: string }>;
}

export interface SupplierPortalMatch {
  id: string;
  number: string;
  purchaseOrderId: string;
  supplierInvoiceId: string;
  quantityVariance: number;
  priceVariance: number;
  status: ThreeWayMatch['status'];
}

export interface SupplierPortalSnapshot {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  scope: RevenueOpsState['scope'];
  generatedAt: string;
  purchaseOrders: SupplierPortalPurchaseOrder[];
  receipts: SupplierPortalReceipt[];
  matches: SupplierPortalMatch[];
}

type SupplierPortalSource = Pick<RevenueOpsState, 'scope' | 'suppliers' | 'purchaseOrders' | 'goodsReceipts' | 'threeWayMatches'>;

function sameScope(state: SupplierPortalSource, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

/**
 * Builds the deliberately narrow read model a supplier may see. It contains
 * approved commitments and reconciliation outcomes, but never internal actor,
 * ledger, payment, bank, or cross-company fields.
 */
export function buildSupplierPortalSnapshot(
  state: SupplierPortalSource,
  supplierId: string,
  generatedAt = new Date().toISOString(),
): SupplierPortalSnapshot | null {
  const supplier = state.suppliers.find((candidate) => candidate.id === supplierId && candidate.status === 'approved' && sameScope(state, candidate));
  if (!supplier) return null;

  const purchaseOrders = state.purchaseOrders
    .filter((order) => order.supplierId === supplier.id && sameScope(state, order) && ['approved', 'partially-received', 'received', 'closed'].includes(order.status))
    .map((order) => ({
      id: order.id,
      number: order.number,
      deliveryBy: order.deliveryBy,
      status: order.status,
      currency: 'INR' as const,
      totalAmount: order.totalAmount,
      lines: order.lines.map((line) => ({
        itemVariantId: line.itemVariantId,
        description: line.description,
        quantity: line.quantity,
        receivedQuantity: line.receivedQuantity,
        invoicedQuantity: line.invoicedQuantity,
        unitPrice: line.unitPrice,
        gstRate: line.gstRate,
        totalAmount: line.totalAmount,
      })),
    }))
    .sort((left, right) => left.deliveryBy.localeCompare(right.deliveryBy) || left.number.localeCompare(right.number));
  const orderIds = new Set(purchaseOrders.map(({ id }) => id));
  const receipts = state.goodsReceipts
    .filter((receipt) => receipt.supplierId === supplier.id && orderIds.has(receipt.purchaseOrderId) && sameScope(state, receipt))
    .map((receipt) => ({
      id: receipt.id,
      number: receipt.number,
      purchaseOrderId: receipt.purchaseOrderId,
      receivedAt: receipt.receivedAt,
      status: receipt.status,
      lines: receipt.lines.map((line) => ({ itemVariantId: line.itemVariantId, quantity: line.quantity, inventoryReference: line.inventoryReference })),
    }))
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt) || left.number.localeCompare(right.number));
  const matches = state.threeWayMatches
    .filter((match) => orderIds.has(match.purchaseOrderId) && sameScope(state, match))
    .map((match) => ({
      id: match.id,
      number: match.number,
      purchaseOrderId: match.purchaseOrderId,
      supplierInvoiceId: match.supplierInvoiceId,
      quantityVariance: match.quantityVariance,
      priceVariance: match.priceVariance,
      status: match.status,
    }))
    .sort((left, right) => left.number.localeCompare(right.number));
  return {
    supplierId: supplier.id,
    supplierCode: supplier.code,
    supplierName: supplier.tradeName ?? supplier.legalName,
    scope: structuredClone(state.scope),
    generatedAt,
    purchaseOrders,
    receipts,
    matches,
  };
}
