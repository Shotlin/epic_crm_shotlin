import type { DashboardSnapshot, Opportunity } from '../shared/contracts';
import type { PartyAccount, PartySnapshot } from '../shared/party-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

/**
 * Read-only commerce intelligence for the India operating view.
 *
 * This deliberately keeps pipeline, ordered demand and billed evidence in
 * separate columns. It is not an accounting ledger, a forecasting engine or
 * a second source of truth: every row links back to the governed workbench
 * that owns the record.
 */
export type CommerceInsightState = 'ready' | 'empty' | 'restricted';

export type CommerceInsightRoute =
  | 'pursuits'
  | 'commerce'
  | 'cash'
  | 'collections'
  | 'warehouse'
  | 'fulfilment';

export interface CommerceInsightSection<Row> {
  state: CommerceInsightState;
  route: CommerceInsightRoute;
  rows: Row[];
  emptyMessage: string;
  restrictedCollections: string[];
}

export interface ProductDemandInsightRow {
  id: string;
  name: string;
  amount: number;
  quantity: number;
  recordCount: number;
  catalogProductId?: string;
}

export interface CustomerConcentrationInsightRow {
  id: string;
  accountId?: string;
  name: string;
  amount: number;
  recordCount: number;
  identity: 'party-master' | 'crm-only' | 'unlinked';
}

export interface FunnelInsightRow {
  id: string;
  source: 'lead' | 'opportunity' | 'quote' | 'sales-order';
  label: string;
  count: number;
  amount?: number;
}

export interface CollectionInsightRow {
  id: string;
  accountId: string;
  accountName: string;
  invoiceNumber: string;
  outstandingAmount: number;
  status: string;
  dunningStage?: string;
  disputeCount: number;
  nextActionAt?: string;
}

export interface StockExceptionInsightRow {
  id: string;
  kind: 'reorder' | 'expiry' | 'warehouse-blocker' | 'count-variance';
  title: string;
  detail: string;
  severity: 'critical' | 'attention' | 'watch';
  dueAt?: string;
}

export interface FulfilmentInsightRow {
  id: string;
  kind: 'sales-order' | 'task' | 'shipment' | 'return';
  title: string;
  detail: string;
  status: string;
  dueAt?: string;
}

export interface IndiaCommerceInsights {
  generatedAt: string;
  productDemand: {
    billed: CommerceInsightSection<ProductDemandInsightRow>;
    orders: CommerceInsightSection<ProductDemandInsightRow>;
    pipeline: CommerceInsightSection<ProductDemandInsightRow>;
  };
  customerConcentration: {
    billed: CommerceInsightSection<CustomerConcentrationInsightRow>;
    receivables: CommerceInsightSection<CustomerConcentrationInsightRow>;
    pipeline: CommerceInsightSection<CustomerConcentrationInsightRow>;
  };
  funnel: CommerceInsightSection<FunnelInsightRow>;
  collections: CommerceInsightSection<CollectionInsightRow>;
  stockExceptions: CommerceInsightSection<StockExceptionInsightRow>;
  fulfilment: CommerceInsightSection<FulfilmentInsightRow>;
}

export interface BuildIndiaCommerceInsightsInput {
  dashboard: DashboardSnapshot;
  revenue: RevenueOpsSnapshot;
  party: Pick<PartySnapshot, 'accounts'>;
  /** Optional deterministic clock for expiry and overdue work queues. */
  now?: string;
}

type ProductAccumulator = ProductDemandInsightRow;
type CustomerAccumulator = CustomerConcentrationInsightRow;

const DAY_MS = 24 * 60 * 60 * 1000;

function amount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parseTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRestricted(revenue: RevenueOpsSnapshot, collections: readonly string[], metrics: readonly string[] = [], resource?: string, fields: readonly string[] = []): boolean {
  const hidden = new Set(revenue.readProjection.hiddenCollections);
  if (collections.some((collection) => hidden.has(collection))) return true;

  const redactedMetrics = new Set(revenue.readProjection.redactedMetrics);
  if (metrics.some((metric) => redactedMetrics.has(metric))) return true;

  if (!resource || !fields.length) return false;
  const redacted = new Set(revenue.readProjection.redactedFields[resource] ?? []);
  return fields.some((field) => redacted.has(field));
}

function section<Row>(
  rows: Row[],
  route: CommerceInsightRoute,
  emptyMessage: string,
  restrictedCollections: string[] = [],
): CommerceInsightSection<Row> {
  const restricted = restrictedCollections.length > 0;
  return {
    state: restricted ? 'restricted' : rows.length ? 'ready' : 'empty',
    route,
    rows: restricted ? [] : rows,
    emptyMessage,
    restrictedCollections,
  };
}

function sortByAmount<Row extends { amount: number; name: string }>(rows: Iterable<Row>): Row[] {
  return [...rows].sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name, 'en-IN'));
}

function addProduct(
  rows: Map<string, ProductAccumulator>,
  input: Omit<ProductDemandInsightRow, 'amount' | 'quantity' | 'recordCount'> & { amount: number; quantity: number },
): void {
  const current = rows.get(input.id);
  if (current) {
    current.amount += amount(input.amount);
    current.quantity += amount(input.quantity);
    current.recordCount += 1;
    return;
  }
  rows.set(input.id, {
    ...input,
    amount: amount(input.amount),
    quantity: amount(input.quantity),
    recordCount: 1,
  });
}

function addCustomer(
  rows: Map<string, CustomerAccumulator>,
  input: Omit<CustomerConcentrationInsightRow, 'amount' | 'recordCount'> & { amount: number },
): void {
  const current = rows.get(input.id);
  if (current) {
    current.amount += amount(input.amount);
    current.recordCount += 1;
    return;
  }
  rows.set(input.id, {
    ...input,
    amount: amount(input.amount),
    recordCount: 1,
  });
}

function productIdentity(
  catalogById: Map<string, { id: string; name: string }>,
  catalogProductId: string | undefined,
  fallbackName: string,
): { id: string; name: string; catalogProductId?: string } {
  const catalog = catalogProductId ? catalogById.get(catalogProductId) : undefined;
  if (catalog) return { id: `catalog:${catalog.id}`, name: catalog.name, catalogProductId: catalog.id };
  const name = fallbackName.trim() || 'Unspecified product';
  return { id: `label:${name.toLocaleLowerCase('en-IN')}`, name };
}

function accountIdentity(
  accountsById: Map<string, PartyAccount>,
  accountId: string | undefined,
  fallbackName: string,
  fallbackKey: string,
): Omit<CustomerConcentrationInsightRow, 'amount' | 'recordCount'> {
  if (accountId) {
    const account = accountsById.get(accountId);
    if (account) {
      return { id: `party:${account.id}`, accountId: account.id, name: account.displayName, identity: 'party-master' };
    }
    return {
      id: `unlinked:${accountId}`,
      accountId,
      name: fallbackName.trim() || `Unlinked account ${accountId}`,
      identity: 'unlinked',
    };
  }
  return {
    id: `crm:${fallbackKey}`,
    name: fallbackName.trim() || 'CRM-only identity',
    identity: 'crm-only',
  };
}

function createProductDemand(
  dashboard: DashboardSnapshot,
  revenue: RevenueOpsSnapshot,
): IndiaCommerceInsights['productDemand'] {
  const catalogById = new Map(revenue.products.map((product) => [product.id, product]));
  const billedRestricted = isRestricted(
    revenue,
    ['invoices'],
    ['billedValue'],
    'finance.receivable',
    ['lines', 'subtotal', 'taxPreview', 'amountDue'],
  );
  const ordersRestricted = isRestricted(
    revenue,
    ['salesOrders'],
    ['confirmedOrderValue'],
    'sales.commercial',
    ['lines', 'subtotal', 'taxPreview'],
  );
  const pipelineRestricted = isRestricted(revenue, ['productInterests', 'opportunities']);

  const billed = new Map<string, ProductAccumulator>();
  if (!billedRestricted) {
    for (const invoice of revenue.invoices) {
      if (invoice.status === 'draft' || invoice.status === 'cancelled' || !Array.isArray(invoice.lines)) continue;
      for (const line of invoice.lines) {
        const identity = productIdentity(catalogById, line.catalogProductId, line.description);
        addProduct(billed, { ...identity, amount: line.taxableValue, quantity: line.quantity });
      }
    }
  }

  const orders = new Map<string, ProductAccumulator>();
  if (!ordersRestricted) {
    for (const salesOrder of revenue.salesOrders) {
      if (salesOrder.status === 'cancelled' || !Array.isArray(salesOrder.lines)) continue;
      for (const line of salesOrder.lines) {
        const identity = productIdentity(catalogById, line.catalogProductId, line.description);
        addProduct(orders, { ...identity, amount: line.taxableValue, quantity: line.quantity });
      }
    }
  }

  const opportunitiesById = new Map(dashboard.opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const pipeline = new Map<string, ProductAccumulator>();
  if (!pipelineRestricted) {
    for (const interest of revenue.productInterests) {
      const opportunity = opportunitiesById.get(interest.opportunityId);
      if (!opportunity || opportunity.currency !== 'INR') continue;
      const identity = productIdentity(catalogById, interest.catalogProductId, interest.name);
      addProduct(pipeline, {
        ...identity,
        amount: interest.quantity * interest.unitPrice,
        quantity: interest.quantity,
      });
    }
  }

  return {
    billed: section(
      sortByAmount(billed.values()),
      'cash',
      'Awaiting the first issued, non-cancelled tax invoice.',
      billedRestricted ? ['invoices'] : [],
    ),
    orders: section(
      sortByAmount(orders.values()),
      'fulfilment',
      'Awaiting the first non-cancelled sales order.',
      ordersRestricted ? ['salesOrders'] : [],
    ),
    pipeline: section(
      sortByAmount(pipeline.values()),
      'pursuits',
      'Awaiting a governed INR product interest on an active opportunity.',
      pipelineRestricted ? ['productInterests'] : [],
    ),
  };
}

function createCustomerConcentration(
  dashboard: DashboardSnapshot,
  revenue: RevenueOpsSnapshot,
  accounts: PartyAccount[],
): IndiaCommerceInsights['customerConcentration'] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const billedRestricted = isRestricted(
    revenue,
    ['invoices'],
    ['billedValue'],
    'finance.receivable',
    ['amountDue', 'subtotal', 'taxPreview'],
  );
  const receivablesRestricted = isRestricted(
    revenue,
    ['receivables'],
    ['outstandingReceivables', 'overdueReceivables'],
    'finance.receivable',
    ['outstandingAmount'],
  );
  const pipelineRestricted = isRestricted(revenue, ['opportunities']);

  const billed = new Map<string, CustomerAccumulator>();
  if (!billedRestricted) {
    for (const invoice of revenue.invoices) {
      if (invoice.status === 'draft' || invoice.status === 'cancelled') continue;
      addCustomer(billed, {
        ...accountIdentity(accountsById, invoice.accountId, '', invoice.id),
        amount: invoice.amountDue,
      });
    }
  }

  const receivables = new Map<string, CustomerAccumulator>();
  if (!receivablesRestricted) {
    for (const receivable of revenue.receivables) {
      if (receivable.outstandingAmount <= 0) continue;
      addCustomer(receivables, {
        ...accountIdentity(accountsById, receivable.accountId, '', receivable.id),
        amount: receivable.outstandingAmount,
      });
    }
  }

  const pipeline = new Map<string, CustomerAccumulator>();
  if (!pipelineRestricted) {
    for (const opportunity of dashboard.opportunities) {
      if (opportunity.currency !== 'INR') continue;
      addCustomer(pipeline, {
        ...accountIdentity(accountsById, opportunity.accountId, opportunity.account, opportunity.id),
        amount: opportunity.value,
      });
    }
  }

  return {
    billed: section(
      sortByAmount(billed.values()),
      'cash',
      'Awaiting issued invoice evidence before customer billing can be ranked.',
      billedRestricted ? ['invoices'] : [],
    ),
    receivables: section(
      sortByAmount(receivables.values()),
      'collections',
      'No open customer receivable is available in this scope.',
      receivablesRestricted ? ['receivables'] : [],
    ),
    pipeline: section(
      sortByAmount(pipeline.values()),
      'pursuits',
      'Awaiting an active INR opportunity with a customer identity.',
      pipelineRestricted ? ['opportunities'] : [],
    ),
  };
}

function createFunnel(
  dashboard: DashboardSnapshot,
  revenue: RevenueOpsSnapshot,
): CommerceInsightSection<FunnelInsightRow> {
  const rows: FunnelInsightRow[] = [];
  const leadLabels: Record<string, string> = {
    new: 'New leads',
    working: 'Working leads',
    qualified: 'Qualified leads',
    converted: 'Converted leads',
  };
  for (const status of ['new', 'working', 'qualified', 'converted'] as const) {
    const count = dashboard.leads.filter((lead) => lead.status === status).length;
    if (count) rows.push({ id: `lead:${status}`, source: 'lead', label: leadLabels[status] ?? status, count });
  }

  const opportunitiesByStage = new Map<string, Opportunity[]>();
  for (const opportunity of dashboard.opportunities) {
    if (opportunity.currency !== 'INR') continue;
    const current = opportunitiesByStage.get(opportunity.stage) ?? [];
    current.push(opportunity);
    opportunitiesByStage.set(opportunity.stage, current);
  }
  for (const [stage, opportunities] of opportunitiesByStage) {
    rows.push({
      id: `opportunity:${stage}`,
      source: 'opportunity',
      label: `${stage} opportunities`,
      count: opportunities.length,
      amount: opportunities.reduce((total, opportunity) => total + amount(opportunity.value), 0),
    });
  }

  const quotesRestricted = isRestricted(revenue, ['quotes'], ['quoteValue'], 'sales.commercial', ['subtotal', 'taxPreview']);
  if (!quotesRestricted) {
    for (const status of ['draft', 'submitted', 'approved', 'rejected', 'converted'] as const) {
      const quotes = revenue.quotes.filter((quote) => quote.status === status);
      if (quotes.length) {
        rows.push({
          id: `quote:${status}`,
          source: 'quote',
          label: `${status} quotations`,
          count: quotes.length,
          amount: quotes.reduce((total, quote) => total + amount(quote.taxPreview?.grandTotal), 0),
        });
      }
    }
  }

  const ordersRestricted = isRestricted(revenue, ['salesOrders'], ['confirmedOrderValue'], 'sales.commercial', ['subtotal', 'taxPreview']);
  if (!ordersRestricted) {
    for (const status of ['confirmed', 'fulfilling', 'on-hold', 'completed', 'cancelled'] as const) {
      const orders = revenue.salesOrders.filter((order) => order.status === status);
      if (orders.length) {
        rows.push({
          id: `order:${status}`,
          source: 'sales-order',
          label: `${status} sales orders`,
          count: orders.length,
          amount: orders.reduce((total, order) => total + amount(order.taxPreview?.grandTotal), 0),
        });
      }
    }
  }

  const restrictedCollections = [
    ...(quotesRestricted ? ['quotes'] : []),
    ...(ordersRestricted ? ['salesOrders'] : []),
  ];
  return section(rows, 'pursuits', 'Awaiting lead, opportunity, quotation or sales-order evidence.', restrictedCollections.length === 2 && !rows.length ? restrictedCollections : []);
}

function createCollections(
  revenue: RevenueOpsSnapshot,
  accounts: PartyAccount[],
): CommerceInsightSection<CollectionInsightRow> {
  const restricted = isRestricted(
    revenue,
    ['receivables'],
    ['outstandingReceivables', 'overdueReceivables', 'collectionsAtRisk'],
    'finance.receivable',
    ['outstandingAmount'],
  );
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const dunningByReceivable = new Map(revenue.dunningCases.filter((item) => item.status !== 'resolved').map((item) => [item.receivableId, item]));
  const disputesByReceivable = new Map<string, number>();
  for (const dispute of revenue.receivableDisputes) {
    if (dispute.status === 'resolved' || dispute.status === 'rejected' || dispute.status === 'withdrawn') continue;
    disputesByReceivable.set(dispute.receivableId, (disputesByReceivable.get(dispute.receivableId) ?? 0) + 1);
  }
  const rows = restricted ? [] : revenue.receivables
    .filter((receivable) => receivable.outstandingAmount > 0)
    .map((receivable) => {
      const dunning = dunningByReceivable.get(receivable.id);
      return {
        id: receivable.id,
        accountId: receivable.accountId,
        accountName: accountsById.get(receivable.accountId)?.displayName ?? `Unlinked account ${receivable.accountId}`,
        invoiceNumber: receivable.invoiceNumber,
        outstandingAmount: receivable.outstandingAmount,
        status: receivable.status,
        dunningStage: dunning?.stage,
        disputeCount: disputesByReceivable.get(receivable.id) ?? 0,
        nextActionAt: dunning?.nextActionAt,
      };
    })
    .sort((left, right) => right.outstandingAmount - left.outstandingAmount || left.invoiceNumber.localeCompare(right.invoiceNumber, 'en-IN'));

  return section(rows, 'collections', 'No open receivable requires a collection action in this scope.', restricted ? ['receivables'] : []);
}

function createStockExceptions(
  revenue: RevenueOpsSnapshot,
  now: number,
): CommerceInsightSection<StockExceptionInsightRow> {
  const restricted = isRestricted(revenue, ['reorderProposals', 'warehouseTasks']);
  if (restricted) return section([], 'warehouse', 'No stock exception is currently available in this scope.', ['reorderProposals', 'warehouseTasks']);

  const policiesById = new Map(revenue.reorderPolicies.map((policy) => [policy.id, policy]));
  const variantsById = new Map(revenue.itemVariants.map((variant) => [variant.id, variant]));
  const warehousesById = new Map(revenue.warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const rows: StockExceptionInsightRow[] = [];

  for (const proposal of revenue.reorderProposals) {
    if (proposal.status !== 'proposed') continue;
    const policy = policiesById.get(proposal.policyId);
    const variant = policy ? variantsById.get(policy.itemVariantId) : undefined;
    const warehouse = policy ? warehousesById.get(policy.warehouseId) : undefined;
    rows.push({
      id: `reorder:${proposal.id}`,
      kind: 'reorder',
      title: `Replenish ${variant?.name ?? 'inventory item'}`,
      detail: `${warehouse?.name ?? 'Warehouse'} has ${proposal.availableQuantity} available; recommend ${proposal.recommendedQuantity}.`,
      severity: proposal.availableQuantity <= 0 ? 'critical' : 'attention',
      dueAt: proposal.requiredBy,
    });
  }

  const expiryWindow = now + 30 * DAY_MS;
  for (const batch of revenue.inventoryBatches) {
    const expiry = parseTime(batch.expiresAt);
    if (batch.status !== 'expired' && (expiry === undefined || expiry > expiryWindow)) continue;
    const variant = variantsById.get(batch.itemVariantId);
    rows.push({
      id: `batch:${batch.id}`,
      kind: 'expiry',
      title: `${variant?.name ?? 'Inventory batch'} expiry watch`,
      detail: `Batch ${batch.batchNumber} is ${batch.status === 'expired' ? 'expired' : 'within the 30-day review window'}.`,
      severity: batch.status === 'expired' || expiry === undefined || expiry <= now ? 'critical' : 'attention',
      dueAt: batch.expiresAt,
    });
  }

  for (const task of revenue.warehouseTasks) {
    const dueAt = parseTime(task.dueAt);
    const overdue = dueAt !== undefined && dueAt < now;
    if (task.status !== 'blocked' && !overdue) continue;
    const variant = variantsById.get(task.itemVariantId);
    rows.push({
      id: `warehouse-task:${task.id}`,
      kind: 'warehouse-blocker',
      title: `${task.type === 'pick' ? 'Pick' : 'Putaway'} ${task.number}`,
      detail: task.blockedReason ?? `${variant?.name ?? 'Inventory item'} is past its due time.`,
      severity: task.status === 'blocked' || task.priority === 'urgent' ? 'critical' : 'attention',
      dueAt: task.dueAt,
    });
  }

  for (const plan of revenue.cycleCountPlans) {
    const variance = plan.lines.reduce((total, line) => total + Math.abs(amount(line.varianceQuantity)), 0);
    if (variance <= 0) continue;
    const warehouse = warehousesById.get(plan.warehouseId);
    rows.push({
      id: `cycle-count:${plan.id}`,
      kind: 'count-variance',
      title: `Count variance ${plan.number}`,
      detail: `${warehouse?.name ?? 'Warehouse'} has ${variance} unit${variance === 1 ? '' : 's'} awaiting review.`,
      severity: plan.status === 'review' ? 'attention' : 'watch',
      dueAt: plan.scheduledAt,
    });
  }

  const severityRank = { critical: 0, attention: 1, watch: 2 } as const;
  rows.sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || (parseTime(left.dueAt) ?? Number.MAX_SAFE_INTEGER) - (parseTime(right.dueAt) ?? Number.MAX_SAFE_INTEGER));
  return section(rows, 'warehouse', 'No replenishment, expiry, warehouse or count exception is waiting.', []);
}

function createFulfilment(
  revenue: RevenueOpsSnapshot,
  now: number,
): CommerceInsightSection<FulfilmentInsightRow> {
  const restricted = isRestricted(revenue, ['salesOrders', 'fulfilmentTasks', 'shipmentPackages', 'returnAuthorizations']);
  if (restricted) return section([], 'fulfilment', 'No governed fulfilment record is currently available in this scope.', ['salesOrders', 'fulfilmentTasks', 'shipmentPackages', 'returnAuthorizations']);

  const rows: FulfilmentInsightRow[] = [];
  for (const order of revenue.salesOrders) {
    if (order.status === 'cancelled' || order.status === 'completed') continue;
    rows.push({
      id: `order:${order.id}`,
      kind: 'sales-order',
      title: order.number,
      detail: `${order.status} / ${order.fulfilmentStatus} for ${order.requiredBy}.`,
      status: order.fulfilmentStatus,
      dueAt: order.requiredBy,
    });
  }
  for (const task of revenue.fulfilmentTasks) {
    const dueAt = parseTime(task.dueAt);
    if (task.status === 'completed' || (task.status !== 'blocked' && (dueAt === undefined || dueAt >= now))) continue;
    rows.push({
      id: `task:${task.id}`,
      kind: 'task',
      title: task.title,
      detail: task.blockedReason ?? `Fulfilment task is overdue for ${task.ownerUserId}.`,
      status: task.status,
      dueAt: task.dueAt,
    });
  }
  for (const shipment of revenue.shipmentPackages) {
    if (shipment.status === 'delivered' || shipment.status === 'returned' || shipment.status === 'cancelled') continue;
    rows.push({
      id: `shipment:${shipment.id}`,
      kind: 'shipment',
      title: shipment.number,
      detail: `${shipment.status}${shipment.trackingNumber ? ` / ${shipment.trackingNumber}` : ''}.`,
      status: shipment.status,
    });
  }
  for (const returnAuthorization of revenue.returnAuthorizations) {
    if (returnAuthorization.status === 'closed' || returnAuthorization.status === 'rejected') continue;
    rows.push({
      id: `return:${returnAuthorization.id}`,
      kind: 'return',
      title: returnAuthorization.number,
      detail: returnAuthorization.reason,
      status: returnAuthorization.status,
      dueAt: returnAuthorization.requestedAt,
    });
  }
  rows.sort((left, right) => (parseTime(left.dueAt) ?? Number.MAX_SAFE_INTEGER) - (parseTime(right.dueAt) ?? Number.MAX_SAFE_INTEGER) || left.title.localeCompare(right.title, 'en-IN'));
  return section(rows, 'fulfilment', 'Awaiting the first governed sales-order, task, shipment or return record.', []);
}

/**
 * Builds role-safe commerce intelligence without creating any records. The
 * caller must pass the already-projected snapshots for the active user.
 */
export function buildIndiaCommerceInsights({
  dashboard,
  revenue,
  party,
  now,
}: BuildIndiaCommerceInsightsInput): IndiaCommerceInsights {
  const referenceTime = parseTime(now ?? revenue.generatedAt) ?? Date.now();
  return {
    generatedAt: revenue.generatedAt,
    productDemand: createProductDemand(dashboard, revenue),
    customerConcentration: createCustomerConcentration(dashboard, revenue, party.accounts),
    funnel: createFunnel(dashboard, revenue),
    collections: createCollections(revenue, party.accounts),
    stockExceptions: createStockExceptions(revenue, referenceTime),
    fulfilment: createFulfilment(revenue, referenceTime),
  };
}
