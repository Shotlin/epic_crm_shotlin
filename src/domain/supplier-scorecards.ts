import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

export type SupplierScoreBand = 'preferred' | 'watch' | 'restricted';

export interface SupplierScorecard {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  scope: RevenueOpsState['scope'];
  awardedPurchaseOrders: number;
  orderedValue: number;
  orderedQuantity: number;
  receivedQuantity: number;
  onTimeReceipts: number;
  lateReceipts: number;
  receiptCompletionPercent: number;
  onTimeDeliveryPercent: number;
  invoiceCount: number;
  threeWayMatches: number;
  varianceMatches: number;
  qualityPassPercent: number;
  priceDisciplinePercent: number;
  score: number;
  band: SupplierScoreBand;
  recommendation: 'retain' | 'improve' | 'review';
  asOf: string;
}

const money = (value: number): number => Math.round(value * 100) / 100;
const percent = (value: number): number => Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;

function sameScope(state: SupplierScorecardSource, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

/**
 * Derives an explainable supplier score from persisted procurement evidence.
 * No score is created for another company/branch, and missing evidence is
 * treated as neutral rather than silently rewarded.
 */
type SupplierScorecardSource = Pick<RevenueOpsState, 'scope' | 'suppliers' | 'purchaseOrders' | 'goodsReceipts' | 'supplierInvoices' | 'threeWayMatches'>;

export function buildSupplierScorecards(state: SupplierScorecardSource, asOf = new Date().toISOString()): SupplierScorecard[] {
  return state.suppliers
    .filter((supplier) => supplier.status === 'approved' && sameScope(state, supplier))
    .map((supplier) => {
      const orders = state.purchaseOrders.filter((order) => order.supplierId === supplier.id && sameScope(state, order) && ['approved', 'partially-received', 'received', 'closed'].includes(order.status));
      const orderIds = new Set(orders.map(({ id }) => id));
      const receipts = state.goodsReceipts.filter((receipt) => orderIds.has(receipt.purchaseOrderId) && sameScope(state, receipt));
      const invoices = state.supplierInvoices.filter((invoice) => orderIds.has(invoice.purchaseOrderId) && sameScope(state, invoice));
      const matches = state.threeWayMatches.filter((match) => orderIds.has(match.purchaseOrderId) && sameScope(state, match));
      const orderedQuantity = orders.reduce((total, order) => total + order.lines.reduce((sum, line) => sum + line.quantity, 0), 0);
      const receivedQuantity = orders.reduce((total, order) => total + order.lines.reduce((sum, line) => sum + line.receivedQuantity, 0), 0);
      const orderedValue = money(orders.reduce((total, order) => total + order.totalAmount, 0));
      const onTimeReceipts = receipts.filter((receipt) => {
        const order = orders.find(({ id }) => id === receipt.purchaseOrderId);
        return order ? receipt.receivedAt <= order.deliveryBy : false;
      }).length;
      const lateReceipts = Math.max(0, receipts.length - onTimeReceipts);
      const varianceMatches = matches.filter(({ status, quantityVariance, priceVariance }) => status === 'variance-review' || status === 'rejected' || quantityVariance !== 0 || priceVariance !== 0).length;
      const receiptCompletionPercent = orderedQuantity ? percent((receivedQuantity / orderedQuantity) * 100) : 100;
      const onTimeDeliveryPercent = receipts.length ? percent((onTimeReceipts / receipts.length) * 100) : 100;
      const qualityPassPercent = matches.length ? percent(((matches.length - varianceMatches) / matches.length) * 100) : 100;
      const priceDisciplinePercent = matches.length ? percent(((matches.length - matches.filter(({ priceVariance }) => priceVariance !== 0).length) / matches.length) * 100) : 100;
      const score = percent(onTimeDeliveryPercent * 0.35 + qualityPassPercent * 0.25 + priceDisciplinePercent * 0.25 + receiptCompletionPercent * 0.15);
      const band: SupplierScoreBand = score >= 85 ? 'preferred' : score >= 65 ? 'watch' : 'restricted';
      return {
        supplierId: supplier.id,
        supplierCode: supplier.code,
        supplierName: supplier.tradeName ?? supplier.legalName,
        scope: structuredClone(state.scope),
        awardedPurchaseOrders: orders.length,
        orderedValue,
        orderedQuantity,
        receivedQuantity,
        onTimeReceipts,
        lateReceipts,
        receiptCompletionPercent,
        onTimeDeliveryPercent,
        invoiceCount: invoices.length,
        threeWayMatches: matches.length,
        varianceMatches,
        qualityPassPercent,
        priceDisciplinePercent,
        score,
        band,
        recommendation: (band === 'preferred' ? 'retain' : band === 'watch' ? 'improve' : 'review') as SupplierScorecard['recommendation'],
        asOf,
      };
    })
    .sort((left, right) => right.score - left.score || left.supplierCode.localeCompare(right.supplierCode));
}
