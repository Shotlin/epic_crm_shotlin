import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';

export type RetailReadiness = 'ready' | 'blocked' | 'review';

export interface RetailOrderReadiness {
  orderId: string;
  orderNumber: string;
  readiness: RetailReadiness;
  barcodeLineCount: number;
  taxReadyLineCount: number;
  paymentMethods: Array<'bank-transfer' | 'upi' | 'card' | 'cheque' | 'cash' | 'store-credit' | 'other'>;
  paidAmount: number;
  returnCount: number;
  blockers: string[];
  nextAction: 'catalogue' | 'tax-review' | 'collect-payment' | 'reconcile-payment' | 'review-return' | 'checkout';
}

type RetailSource = Pick<RevenueOpsSnapshot, 'scope' | 'products' | 'taxCodes' | 'salesOrders' | 'invoices' | 'receivables' | 'paymentReceipts' | 'returnAuthorizations'>;

function inScope(state: RetailSource, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

/** POS/retail readiness projection; payment-provider settlement remains external evidence. */
export function buildRetailReadiness(state: RetailSource): RetailOrderReadiness[] {
  return state.salesOrders.filter((order) => order.status !== 'cancelled' && inScope(state, order)).map((order) => {
    const goodsLines = order.lines.filter((line) => state.products.some((product) => product.id === line.catalogProductId && product.kind === 'goods' && product.active && inScope(state, product)));
    const barcodeLineCount = goodsLines.filter((line) => Boolean(state.products.find((product) => product.id === line.catalogProductId)?.sku.trim())).length;
    const taxReadyLineCount = goodsLines.filter((line) => { const product = state.products.find((candidate) => candidate.id === line.catalogProductId); const tax = product ? state.taxCodes.find((candidate) => candidate.id === product.taxCodeId) : undefined; return Boolean(tax && tax.reviewStatus === 'verified'); }).length;
    const invoices = state.invoices.filter((invoice) => invoice.salesOrderId === order.id && invoice.status !== 'cancelled' && inScope(state, invoice));
    const receivableIds = new Set(state.receivables.filter((receivable) => invoices.some((invoice) => invoice.id === receivable.invoiceId) && inScope(state, receivable)).map(({ id }) => id));
    const receipts = state.paymentReceipts.filter((receipt) => receipt.status !== 'reversed' && inScope(state, receipt) && receipt.allocations.some(({ receivableId }) => receivableIds.has(receivableId)));
    const paidAmount = receipts.reduce((sum, receipt) => sum + receipt.allocations.filter(({ receivableId }) => receivableIds.has(receivableId)).reduce((amount, allocation) => amount + allocation.amount, 0), 0);
    const outstanding = state.receivables.filter((receivable) => receivableIds.has(receivable.id)).reduce((sum, receivable) => sum + receivable.outstandingAmount, 0);
    const returns = state.returnAuthorizations.filter((authorization) => inScope(state, authorization) && invoices.some((invoice) => invoice.shipmentPackageIds.includes(authorization.shipmentPackageId)) && ['requested', 'approved', 'received'].includes(authorization.status));
    const blockers: string[] = [];
    if (goodsLines.length && barcodeLineCount < goodsLines.length) blockers.push('One or more goods lines lack an active SKU/barcode identity.');
    if (goodsLines.length && taxReadyLineCount < goodsLines.length) blockers.push('One or more goods lines lack a verified GST/HSN tax reference.');
    if (outstanding > 0) blockers.push(`₹${outstanding.toFixed(2)} remains outstanding.`);
    if (receipts.some((receipt) => receipt.status === 'recorded')) blockers.push('Payment evidence is recorded but not reconciled.');
    if (returns.length) blockers.push(`${returns.length} return authorization${returns.length === 1 ? '' : 's'} require controlled review.`);
    const readiness: RetailReadiness = blockers.length ? (blockers.some((blocker) => blocker.includes('barcode') || blocker.includes('tax')) ? 'blocked' : 'review') : 'ready';
    const nextAction: RetailOrderReadiness['nextAction'] = barcodeLineCount < goodsLines.length ? 'catalogue' : taxReadyLineCount < goodsLines.length ? 'tax-review' : returns.length ? 'review-return' : receipts.some((receipt) => receipt.status === 'recorded') ? 'reconcile-payment' : outstanding > 0 ? 'collect-payment' : 'checkout';
    return { orderId: order.id, orderNumber: order.number, readiness, barcodeLineCount, taxReadyLineCount, paymentMethods: [...new Set(receipts.map(({ method }) => method))], paidAmount, returnCount: returns.length, blockers: [...new Set(blockers)], nextAction };
  }).sort((left, right) => left.orderNumber.localeCompare(right.orderNumber));
}
