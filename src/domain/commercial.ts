import type {
  CatalogProduct,
  ConvertQuoteToSalesOrderInput,
  CreateCatalogProductInput,
  CreateDiscountPolicyInput,
  CreateGstTaxCodeInput,
  CreatePriceListEntryInput,
  CreatePriceListInput,
  DecidePriceListApprovalInput,
  DecideQuoteApprovalInput,
  DiscountPolicy,
  FulfilmentStatus,
  FulfilmentTask,
  GstTaxCode,
  PriceList,
  PriceListEntry,
  PriceListApprovalRequest,
  QuoteApprovalRequest,
  QuoteDocumentReceipt,
  RevenueOpsState,
  SalesOrder,
  SalesOrderStatus,
  SubmitQuoteForApprovalInput,
  SubmitPriceListForApprovalInput,
  TransitionSalesOrderInput,
  UpdateFulfilmentTaskInput,
} from '../shared/revenue-ops-contracts';
import { assertCreditAvailable } from './collections-finance';

function clean(value: string, label: string, minimum = 2, maximum = 200): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
}

function code(value: string, label: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(normalized)) throw new Error(`${label} must use 2-32 letters, numbers, dashes, or underscores.`);
  return normalized;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function sameScope(state: RevenueOpsState, value: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = value.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

function assertEffectiveRange(from: string, to?: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) throw new Error('Effective dates must use YYYY-MM-DD.');
  if (to && to < from) throw new Error('Effective-to date cannot precede effective-from date.');
}

function overlaps(leftFrom: string, leftTo: string | undefined, rightFrom: string, rightTo: string | undefined): boolean {
  return leftFrom <= (rightTo ?? '9999-12-31') && rightFrom <= (leftTo ?? '9999-12-31');
}

function orderNumber(index: number, dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() + 1 >= 4 ? year : year - 1;
  return `SO-${String(start).slice(-2)}-${String(start + 1).slice(-2)}-${String(index).padStart(5, '0')}`;
}

export function createGstTaxCode(state: RevenueOpsState, input: CreateGstTaxCodeInput, id: string = crypto.randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const normalizedCode = input.code.trim();
  if (!/^\d{4,8}$/.test(normalizedCode)) throw new Error('HSN/SAC code must contain 4-8 digits.');
  if (input.gstRate < 0 || input.gstRate > 100 || input.cessRate < 0 || input.cessRate > 100) throw new Error('GST and cess rates must be between 0 and 100.');
  assertEffectiveRange(input.effectiveFrom, input.effectiveTo);
  if (!/^https:\/\//i.test(input.sourceUrl)) throw new Error('Tax source must use a secure HTTPS URL.');
  if (state.taxCodes.some((item) => item.code === normalizedCode && item.kind === input.kind && overlaps(item.effectiveFrom, item.effectiveTo, input.effectiveFrom, input.effectiveTo))) throw new Error('An overlapping effective tax-code version already exists.');
  const taxCode: GstTaxCode = { id, code: normalizedCode, kind: input.kind, description: clean(input.description, 'Tax-code description', 4, 300), gstRate: input.gstRate, cessRate: input.cessRate, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, sourceLabel: clean(input.sourceLabel, 'Source label', 3, 160), sourceUrl: input.sourceUrl.trim(), reviewStatus: input.reviewStatus, reviewedAt: input.reviewStatus === 'verified' ? now : undefined, scope: structuredClone(state.scope), version: 1 };
  return { ...state, revision: state.revision + 1, taxCodes: [taxCode, ...state.taxCodes] };
}

export function createCatalogProduct(state: RevenueOpsState, input: CreateCatalogProductInput, id: string = crypto.randomUUID()): RevenueOpsState {
  const sku = code(input.sku, 'SKU');
  assertEffectiveRange(input.effectiveFrom, input.effectiveTo);
  if (state.products.some((item) => item.sku === sku)) throw new Error('Product SKU already exists.');
  const taxCode = state.taxCodes.find(({ id: taxId, reviewStatus }) => taxId === input.taxCodeId && reviewStatus === 'verified');
  if (!taxCode) throw new Error('Products require a verified GST/HSN catalog entry.');
  if ((input.kind === 'service' && taxCode.kind !== 'SAC') || (input.kind === 'goods' && taxCode.kind !== 'HSN')) throw new Error('Product kind must align with the selected HSN/SAC catalog entry.');
  const product: CatalogProduct = { id, sku, name: clean(input.name, 'Product name'), description: clean(input.description, 'Product description', 4, 500), kind: input.kind, uom: code(input.uom, 'Unit of measure'), taxCodeId: taxCode.id, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, active: true, scope: structuredClone(state.scope), version: 1 };
  return { ...state, revision: state.revision + 1, products: [product, ...state.products] };
}

export function createPriceList(state: RevenueOpsState, input: CreatePriceListInput, id: string = crypto.randomUUID()): RevenueOpsState {
  const normalizedCode = code(input.code, 'Price-list code');
  assertEffectiveRange(input.effectiveFrom, input.effectiveTo);
  if (state.priceLists.some((item) => item.code === normalizedCode)) throw new Error('Price-list code already exists.');
  const priceList: PriceList = { id, code: normalizedCode, name: clean(input.name, 'Price-list name'), currency: 'INR', channel: input.channel, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, status: 'draft', active: false, scope: structuredClone(state.scope), version: 1 };
  return { ...state, revision: state.revision + 1, priceLists: [priceList, ...state.priceLists] };
}

export function createPriceListEntry(state: RevenueOpsState, input: CreatePriceListEntryInput, id: string = crypto.randomUUID()): RevenueOpsState {
  assertEffectiveRange(input.effectiveFrom, input.effectiveTo);
  const priceList = state.priceLists.find(({ id: listId }) => listId === input.priceListId);
  if (!priceList) throw new Error('Price list not found.');
  if (!state.products.some(({ id: productId, active }) => productId === input.productId && active)) throw new Error('Active catalog product not found.');
  if (input.unitPrice < 0 || input.minimumQuantity <= 0) throw new Error('Price and minimum quantity must be positive.');
  if (state.priceListEntries.some((entry) => entry.priceListId === input.priceListId && entry.productId === input.productId && entry.minimumQuantity === input.minimumQuantity && overlaps(entry.effectiveFrom, entry.effectiveTo, input.effectiveFrom, input.effectiveTo))) throw new Error('An overlapping price tier already exists for this product and quantity.');
  if (!['draft', 'rejected'].includes(priceList.status)) throw new Error('Price tiers can only be changed while the price list is draft or rejected.');
  const entry: PriceListEntry = { id, ...input, unitPrice: money(input.unitPrice), scope: structuredClone(priceList.scope ?? state.scope), version: 1 };
  return { ...state, revision: state.revision + 1, priceListEntries: [entry, ...state.priceListEntries] };
}

export function submitPriceListForApproval(state: RevenueOpsState, input: SubmitPriceListForApprovalInput, actorId: string, eligibleApproverIds: string[], id: string = crypto.randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const priceList = state.priceLists.find(({ id: priceListId }) => priceListId === input.id);
  if (!priceList) throw new Error('Price list not found.');
  if (priceList.version !== input.expectedVersion) throw new Error('The price list changed. Refresh and retry.');
  if (!['draft', 'rejected'].includes(priceList.status)) throw new Error('Only draft or rejected price lists can be submitted.');
  if (!state.priceListEntries.some(({ priceListId }) => priceListId === priceList.id)) throw new Error('A price list needs at least one price tier before approval.');
  const approvers = [...new Set(eligibleApproverIds)].filter((userId) => userId !== actorId);
  if (!approvers.length) throw new Error('Price-list submission requires an independent active approver.');
  const request: PriceListApprovalRequest = { id, priceListId: priceList.id, requestedBy: actorId, requestedAt: now, reason: clean(input.reason, 'Approval reason', 4, 300), eligibleApproverIds: approvers, status: 'pending', scope: structuredClone(priceList.scope ?? state.scope), version: 1 };
  const updated = { ...priceList, status: 'submitted' as const, active: false, approvalRequestId: request.id, submittedBy: actorId, submittedAt: now, version: priceList.version + 1 };
  return { ...state, revision: state.revision + 1, priceLists: state.priceLists.map((item) => item.id === priceList.id ? updated : item), priceListApprovalRequests: [request, ...state.priceListApprovalRequests] };
}

export function decidePriceListApproval(state: RevenueOpsState, input: DecidePriceListApprovalInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const request = state.priceListApprovalRequests.find(({ id }) => id === input.requestId);
  if (!request) throw new Error('Price-list approval request not found.');
  if (request.version !== input.expectedVersion) throw new Error('The price-list approval request changed. Refresh and retry.');
  if (request.status !== 'pending') throw new Error('Price-list approval is already decided.');
  if (!request.eligibleApproverIds.includes(actorId) || request.requestedBy === actorId) throw new Error('Segregation of duties requires an eligible independent approver.');
  const priceList = state.priceLists.find(({ id }) => id === request.priceListId);
  if (!priceList || priceList.status !== 'submitted' || priceList.approvalRequestId !== request.id) throw new Error('Price list is no longer awaiting this approval.');
  const decided = { ...request, status: input.decision, decidedBy: actorId, decidedAt: now, remarks: clean(input.remarks, 'Decision remarks', 2, 300), version: request.version + 1 };
  const approved = input.decision === 'approved';
  const updated = { ...priceList, status: approved ? 'active' as const : 'rejected' as const, active: approved, activatedBy: approved ? actorId : undefined, activatedAt: approved ? now : undefined, version: priceList.version + 1 };
  return { ...state, revision: state.revision + 1, priceLists: state.priceLists.map((item) => item.id === priceList.id ? updated : item), priceListApprovalRequests: state.priceListApprovalRequests.map((item) => item.id === request.id ? decided : item) };
}

export function createDiscountPolicy(state: RevenueOpsState, input: CreateDiscountPolicyInput, id: string = crypto.randomUUID()): RevenueOpsState {
  const normalizedCode = code(input.code, 'Discount code');
  assertEffectiveRange(input.effectiveFrom, input.effectiveTo);
  if (state.discountPolicies.some((item) => item.code === normalizedCode)) throw new Error('Discount-policy code already exists.');
  if (input.scope === 'product' && !state.products.some(({ id: productId, active }) => productId === input.productId && active)) throw new Error('Product discount requires an active catalog product.');
  if (input.scope === 'order' && input.productId) throw new Error('Order discounts cannot target a product.');
  if (input.value <= 0 || (input.method === 'percentage' && input.value > 100) || input.minimumTaxableValue < 0 || input.maximumDiscountAmount < 0 || input.approvalThresholdPercent < 0 || input.approvalThresholdPercent > 100) throw new Error('Discount values or thresholds are invalid.');
  const promotionType = input.promotionType ?? 'discount';
  const eligibleCustomerAccountIds = [...new Set(input.eligibleCustomerAccountIds ?? [])];
  const eligibleLoyaltyTiers = [...new Set(input.eligibleLoyaltyTiers ?? [])];
  const eligibleRetailCategoryIds = [...new Set(input.eligibleRetailCategoryIds ?? [])];
  const eligibleRetailBrandIds = [...new Set(input.eligibleRetailBrandIds ?? [])];
  const eligibleRetailRackBinIds = [...new Set(input.eligibleRetailRackBinIds ?? [])];
  if (eligibleRetailCategoryIds.some((id) => !state.retailCatalogCategories.some((category) => category.id === id && category.active && sameScope(state, category)))) throw new Error('Retail campaign category targeting contains an inactive or out-of-scope category.');
  if (eligibleRetailBrandIds.some((id) => !state.retailCatalogBrands.some((brand) => brand.id === id && brand.active && sameScope(state, brand)))) throw new Error('Retail campaign brand targeting contains an inactive or out-of-scope brand.');
  if (eligibleRetailRackBinIds.some((id) => !state.storageBins.some((bin) => bin.id === id && bin.status === 'available' && sameScope(state, bin)))) throw new Error('Retail campaign rack targeting contains an unavailable or out-of-scope bin.');
  if (promotionType === 'bogo' && (input.scope !== 'product' || !input.productId || !Number.isInteger(input.buyQuantity) || !Number.isInteger(input.freeQuantity) || (input.buyQuantity ?? 0) <= 0 || (input.freeQuantity ?? 0) <= 0)) throw new Error('BOGO promotions require a product scope and positive integer buy/free quantities.');
  if (promotionType === 'gift') {
    const giftVariant = input.giftItemVariantId && state.itemVariants.find(({ id: variantId, active, scope }) => variantId === input.giftItemVariantId && active && sameScope(state, { scope }));
    if (input.scope !== 'product' || !input.productId || !giftVariant || !Number.isInteger(input.giftQuantity) || (input.giftQuantity ?? 0) <= 0) throw new Error('Gift promotions require a product scope, an active gift SKU, and a positive integer gift quantity.');
    const giftItem = state.inventoryItems.find(({ id, active }) => id === giftVariant.itemId && active);
    const giftProduct = giftItem && state.products.find(({ id, active, kind }) => id === giftItem.productId && active && kind === 'goods');
    if (!giftItem || !giftProduct || !sameScope(state, giftItem) || !sameScope(state, giftProduct)) throw new Error('Gift SKU must be an active in-scope goods variant.');
  }
  const policy: DiscountPolicy = { id, code: normalizedCode, name: clean(input.name, 'Discount name'), scope: input.scope, productId: input.productId, method: input.method, value: input.value, minimumTaxableValue: money(input.minimumTaxableValue), maximumDiscountAmount: money(input.maximumDiscountAmount), stackable: input.stackable, approvalThresholdPercent: input.approvalThresholdPercent, promotionType, eligibleCustomerAccountIds: eligibleCustomerAccountIds.length ? eligibleCustomerAccountIds : undefined, eligibleLoyaltyTiers: eligibleLoyaltyTiers.length ? eligibleLoyaltyTiers : undefined, eligibleRetailCategoryIds: eligibleRetailCategoryIds.length ? eligibleRetailCategoryIds : undefined, eligibleRetailBrandIds: eligibleRetailBrandIds.length ? eligibleRetailBrandIds : undefined, eligibleRetailRackBinIds: eligibleRetailRackBinIds.length ? eligibleRetailRackBinIds : undefined, buyQuantity: input.buyQuantity, freeQuantity: input.freeQuantity, giftItemVariantId: input.giftItemVariantId, giftQuantity: input.giftQuantity, campaignCode: input.campaignCode?.trim() || undefined, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, active: true, operatingScope: structuredClone(state.scope), version: 1 };
  return { ...state, revision: state.revision + 1, discountPolicies: [policy, ...state.discountPolicies] };
}

export function submitQuoteForApproval(state: RevenueOpsState, input: SubmitQuoteForApprovalInput, actorId: string, eligibleApproverIds: string[], id: string = crypto.randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const quote = state.quotes.find(({ id: quoteId }) => quoteId === input.id);
  if (!quote) throw new Error('Quotation not found.');
  if (quote.version !== input.expectedVersion) throw new Error('The quotation changed. Refresh and retry.');
  if (quote.status !== 'draft' && quote.status !== 'rejected') throw new Error('Only draft or rejected quotations can be submitted.');
  const approvers = [...new Set(eligibleApproverIds)].filter((userId) => userId !== actorId);
  if (!approvers.length) throw new Error('Quotation submission requires an independent active approver.');
  const request: QuoteApprovalRequest = { id, quoteId: quote.id, requestedBy: actorId, requestedAt: now, reason: clean(input.reason, 'Approval reason', 4, 300), eligibleApproverIds: approvers, status: 'pending', scope: structuredClone(quote.scope ?? state.scope), version: 1 };
  const updatedQuote = { ...quote, status: 'submitted' as const, approvalRequestId: request.id, version: quote.version + 1 };
  return { ...state, revision: state.revision + 1, quotes: state.quotes.map((item) => item.id === quote.id ? updatedQuote : item), quoteApprovalRequests: [request, ...state.quoteApprovalRequests] };
}

export function decideQuoteApproval(state: RevenueOpsState, input: DecideQuoteApprovalInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const request = state.quoteApprovalRequests.find(({ id }) => id === input.requestId);
  if (!request) throw new Error('Quotation approval request not found.');
  if (request.version !== input.expectedVersion) throw new Error('The approval request changed. Refresh and retry.');
  if (request.status !== 'pending') throw new Error('Quotation approval is already decided.');
  if (!request.eligibleApproverIds.includes(actorId) || request.requestedBy === actorId) throw new Error('Segregation of duties requires an eligible independent approver.');
  const quote = state.quotes.find(({ id }) => id === request.quoteId);
  if (!quote || quote.status !== 'submitted' || quote.approvalRequestId !== request.id) throw new Error('Quotation is no longer awaiting this approval.');
  const decided = { ...request, status: input.decision, decidedBy: actorId, decidedAt: now, remarks: clean(input.remarks, 'Decision remarks', 2, 300), version: request.version + 1 };
  const updatedQuote = { ...quote, status: input.decision, version: quote.version + 1 };
  return { ...state, revision: state.revision + 1, quotes: state.quotes.map((item) => item.id === quote.id ? updatedQuote : item), quoteApprovalRequests: state.quoteApprovalRequests.map((item) => item.id === request.id ? decided : item) };
}

function tasksForOrder(order: SalesOrder, state: RevenueOpsState, ownerUserId: string): FulfilmentTask[] {
  return order.lines.flatMap((line) => {
    const kind = line.catalogProductId ? state.products.find(({ id }) => id === line.catalogProductId)?.kind : undefined;
    const steps: Array<{ kind: FulfilmentTask['kind']; title: string }> = kind === 'goods'
      ? [{ kind: 'allocation', title: 'Allocate stock' }, { kind: 'dispatch', title: 'Dispatch goods' }, { kind: 'delivery', title: 'Confirm delivery' }]
      : [{ kind: 'kickoff', title: 'Run service kickoff' }, { kind: 'service-delivery', title: 'Deliver contracted scope' }, { kind: 'acceptance', title: 'Capture customer acceptance' }];
    return steps.map((step) => ({ id: crypto.randomUUID(), salesOrderId: order.id, lineId: line.id, kind: step.kind, title: `${step.title} - ${line.description}`, ownerUserId, dueAt: order.requiredBy, status: 'planned' as const, scope: structuredClone(order.scope ?? state.scope), version: 1 }));
  });
}

export function convertQuoteToSalesOrder(state: RevenueOpsState, input: ConvertQuoteToSalesOrderInput, actorId: string, ownerUserId: string, id: string = crypto.randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const quote = state.quotes.find(({ id: quoteId }) => quoteId === input.quoteId);
  if (!quote) throw new Error('Quotation not found.');
  if (quote.version !== input.expectedVersion) throw new Error('The quotation changed. Refresh and retry.');
  if (quote.status !== 'approved') throw new Error('Only an approved quotation can become a sales order.');
  if (state.salesOrders.some(({ quoteId }) => quoteId === quote.id)) throw new Error('Quotation already has a sales order.');
  if (input.requiredBy < input.orderDate) throw new Error('Required-by date cannot precede order date.');
  assertCreditAvailable(state, quote.accountId, quote.taxPreview.grandTotal);
  const order: SalesOrder = { id, number: orderNumber(state.salesOrders.length + 1, input.orderDate), quoteId: quote.id, quoteNumber: quote.number, accountId: quote.accountId, contactId: quote.contactId, currency: 'INR', orderDate: input.orderDate, requiredBy: input.requiredBy, status: 'confirmed', fulfilmentStatus: 'planned', lines: structuredClone(quote.lines), subtotal: quote.subtotal, discountTotal: quote.discountTotal, taxPreview: structuredClone(quote.taxPreview), approvedQuoteVersion: quote.version, createdBy: actorId, createdAt: now, scope: structuredClone(quote.scope ?? state.scope), version: 1 };
  const tasks = tasksForOrder(order, state, ownerUserId);
  const convertedQuote = { ...quote, status: 'converted' as const, version: quote.version + 1 };
  return { ...state, revision: state.revision + 1, quotes: state.quotes.map((item) => item.id === quote.id ? convertedQuote : item), salesOrders: [order, ...state.salesOrders], fulfilmentTasks: [...tasks, ...state.fulfilmentTasks] };
}

const ORDER_TRANSITIONS: Record<SalesOrderStatus, SalesOrderStatus[]> = { confirmed: ['fulfilling', 'on-hold', 'cancelled'], fulfilling: ['completed', 'on-hold', 'cancelled'], 'on-hold': ['fulfilling', 'cancelled'], completed: [], cancelled: [] };

export function transitionSalesOrder(state: RevenueOpsState, input: TransitionSalesOrderInput): RevenueOpsState {
  const order = state.salesOrders.find(({ id }) => id === input.id);
  if (!order) throw new Error('Sales order not found.');
  if (order.version !== input.expectedVersion) throw new Error('The sales order changed. Refresh and retry.');
  if (!ORDER_TRANSITIONS[order.status].includes(input.toStatus)) throw new Error(`Sales order cannot move from ${order.status} to ${input.toStatus}.`);
  if (input.toStatus === 'completed' && state.fulfilmentTasks.some(({ salesOrderId, status }) => salesOrderId === order.id && status !== 'completed')) throw new Error('Complete every fulfilment task before closing the sales order.');
  const updated = { ...order, status: input.toStatus, fulfilmentStatus: input.toStatus === 'completed' ? 'completed' as const : order.fulfilmentStatus, version: order.version + 1 };
  return { ...state, revision: state.revision + 1, salesOrders: state.salesOrders.map((item) => item.id === order.id ? updated : item) };
}

const TASK_TRANSITIONS: Record<FulfilmentStatus, FulfilmentStatus[]> = { planned: ['ready', 'blocked'], ready: ['in-progress', 'blocked'], 'in-progress': ['completed', 'blocked'], blocked: ['ready'], completed: [] };

export function updateFulfilmentTask(state: RevenueOpsState, input: UpdateFulfilmentTaskInput): RevenueOpsState {
  const task = state.fulfilmentTasks.find(({ id }) => id === input.id);
  if (!task) throw new Error('Fulfilment task not found.');
  if (task.version !== input.expectedVersion) throw new Error('The fulfilment task changed. Refresh and retry.');
  if (!TASK_TRANSITIONS[task.status].includes(input.toStatus)) throw new Error(`Fulfilment task cannot move from ${task.status} to ${input.toStatus}.`);
  if (input.toStatus === 'blocked' && !input.blockedReason?.trim()) throw new Error('Blocked fulfilment requires a reason.');
  const updatedTask = { ...task, status: input.toStatus, blockedReason: input.toStatus === 'blocked' ? clean(input.blockedReason ?? '', 'Blocked reason', 3, 300) : undefined, version: task.version + 1 };
  const tasks = state.fulfilmentTasks.map((item) => item.id === task.id ? updatedTask : item);
  const order = state.salesOrders.find(({ id }) => id === task.salesOrderId);
  if (!order) throw new Error('Fulfilment sales order not found.');
  const orderTasks = tasks.filter(({ salesOrderId }) => salesOrderId === order.id);
  const fulfilmentStatus: FulfilmentStatus = orderTasks.every(({ status }) => status === 'completed') ? 'completed' : orderTasks.some(({ status }) => status === 'blocked') ? 'blocked' : orderTasks.some(({ status }) => status === 'in-progress') ? 'in-progress' : orderTasks.some(({ status }) => status === 'ready') ? 'ready' : 'planned';
  const orderStatus: SalesOrderStatus = order.status === 'confirmed' && ['ready', 'in-progress'].includes(fulfilmentStatus) ? 'fulfilling' : order.status;
  const updatedOrder = { ...order, status: orderStatus, fulfilmentStatus, version: order.version + 1 };
  return { ...state, revision: state.revision + 1, fulfilmentTasks: tasks, salesOrders: state.salesOrders.map((item) => item.id === order.id ? updatedOrder : item) };
}

export function recordQuoteDocument(state: RevenueOpsState, receipt: QuoteDocumentReceipt): RevenueOpsState {
  const quote = state.quotes.find(({ id, version }) => id === receipt.quoteId && version === receipt.quoteVersion);
  if (!quote) throw new Error('Quotation changed before the PDF receipt could be recorded.');
  return { ...state, revision: state.revision + 1, quoteDocuments: [{ ...receipt, scope: structuredClone(quote.scope ?? state.scope) }, ...state.quoteDocuments] };
}
