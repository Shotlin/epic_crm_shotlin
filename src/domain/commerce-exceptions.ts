import type { KernelSnapshot } from '../shared/kernel-contracts';
import type { PartySnapshot } from '../shared/party-contracts';
import type {
  OperatingRecordScope,
  RevenueOpsSnapshot,
} from '../shared/revenue-ops-contracts';

/**
 * Evidence-only operational exceptions for an India-first commercial
 * workspace. This module deliberately creates no records, estimates no
 * outcomes, and never fills an empty workspace with sample alerts.
 */
export type CommerceExceptionCategory =
  | 'fulfilment'
  | 'inventory'
  | 'collections'
  | 'approval'
  | 'service';

export type CommerceExceptionSeverity = 'critical' | 'attention';

export type CommerceExceptionDestination =
  | 'sales'
  | 'operations'
  | 'finance'
  | 'command'
  | 'service';

/**
 * The checks travel with each row so a renderer can explain why the row is
 * safe to show without exposing a record from another company or branch.
 */
export interface CommerceExceptionScopeChecks {
  activeScope: OperatingRecordScope;
  kernelContextMatchesRevenue: true;
  revenueReadProjectionMatchesRevenue: true;
  sourceRecordsMatchActiveScope: true;
  /** `null` means this exception did not need a linked operational record. */
  linkedRecordsMatchActiveScope: boolean | null;
  /** `null` means no party label was used. */
  partyReferenceMatchesActiveCompany: boolean | null;
}

export interface CommerceException {
  /** Stable renderer key derived only from the actual primary source record. */
  id: string;
  category: CommerceExceptionCategory;
  severity: CommerceExceptionSeverity;
  title: string;
  detail: string;
  /** A human business identifier, never a fallback technical ID. */
  businessReference: string;
  destination: CommerceExceptionDestination;
  /** IDs of source records that were exact-scope checked before use. */
  sourceRecordIds: string[];
  dueAt?: string;
  scopeChecks: CommerceExceptionScopeChecks;
}

export interface CommerceExceptionQueueScopeChecks {
  kernelContextMatchesRevenue: boolean;
  revenueReadProjectionMatchesRevenue: boolean;
}

export interface CommerceExceptionQueue {
  generatedAt: string;
  scope: OperatingRecordScope;
  scopeChecks: CommerceExceptionQueueScopeChecks;
  exceptions: CommerceException[];
}

type CommerceExceptionRevenueSource = Pick<
  RevenueOpsSnapshot,
  | 'generatedAt'
  | 'scope'
  | 'readProjection'
  | 'salesOrders'
  | 'fulfilmentTasks'
  | 'itemVariants'
  | 'warehouses'
  | 'warehouseTasks'
  | 'reorderPolicies'
  | 'reorderProposals'
  | 'receivables'
  | 'dunningCases'
  | 'receivableDisputes'
  | 'supportTickets'
>;

type CommerceExceptionKernelSource = Pick<
  KernelSnapshot,
  | 'context'
  | 'approvalRequests'
  | 'approvalPolicies'
  | 'workflowDefinitions'
  | 'workflowInstances'
>;

type CommerceExceptionPartySource = Pick<PartySnapshot, 'accounts'>;

export interface BuildCommerceExceptionQueueInput {
  /** Already-governed source for the active company and branch. */
  revenue: CommerceExceptionRevenueSource;
  /** Used only for a same-company customer label where one is available. */
  party: CommerceExceptionPartySource;
  /** Source of active company/branch context and maker-checker approvals. */
  kernel: CommerceExceptionKernelSource;
  /** Optional explicit instant for due-time evaluation. Defaults to generatedAt. */
  now?: string;
}

type ScopedRecord = { scope?: OperatingRecordScope };

const OFFSET_TIMESTAMP = /(?:Z|[+-]\d{2}:\d{2})$/i;
const TERMINAL_FULFILMENT_STATUSES = new Set(['completed']);
const TERMINAL_WAREHOUSE_STATUSES = new Set(['completed', 'cancelled']);
const TERMINAL_DUNNING_STATUSES = new Set(['resolved']);
const TERMINAL_DISPUTE_STATUSES = new Set(['resolved', 'rejected', 'withdrawn']);
const TERMINAL_SERVICE_STATUSES = new Set(['resolved', 'closed', 'cancelled']);
const CATEGORY_ORDER: Record<CommerceExceptionCategory, number> = {
  fulfilment: 0,
  inventory: 1,
  collections: 2,
  approval: 3,
  service: 4,
};
const SEVERITY_ORDER: Record<CommerceExceptionSeverity, number> = {
  critical: 0,
  attention: 1,
};

function copyScope(scope: OperatingRecordScope): OperatingRecordScope {
  return { companyId: scope.companyId, branchId: scope.branchId };
}

function exactScope(record: ScopedRecord, scope: OperatingRecordScope): boolean {
  return record.scope?.companyId === scope.companyId
    && record.scope?.branchId === scope.branchId;
}

function parseInstant(value: string | undefined): number | undefined {
  if (!value || !OFFSET_TIMESTAMP.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isPastDue(value: string | undefined, referenceTime: number | undefined): boolean {
  const dueAt = parseInstant(value);
  return dueAt !== undefined && referenceTime !== undefined && dueAt < referenceTime;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sourceVisible(revenue: CommerceExceptionRevenueSource, collection: string): boolean {
  return !(revenue.readProjection.hiddenCollections ?? []).includes(collection);
}

function fieldVisible(revenue: CommerceExceptionRevenueSource, resource: string, field: string): boolean {
  return !(revenue.readProjection.redactedFields?.[resource] ?? []).includes(field);
}

function sourceIds(...ids: Array<string | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function accountReference(
  party: CommerceExceptionPartySource,
  accountId: string | undefined,
  scope: OperatingRecordScope,
  tenantId: string,
): { label?: string; matchesActiveCompany: boolean | null } {
  if (!accountId) return { matchesActiveCompany: null };
  const account = party.accounts.find((candidate) => candidate.id === accountId);
  if (!account || account.companyId !== scope.companyId || account.tenantId !== tenantId) {
    return { matchesActiveCompany: false };
  }
  return { label: text(account.displayName), matchesActiveCompany: true };
}

function rowScopeChecks(
  scope: OperatingRecordScope,
  linkedRecordsMatchActiveScope: boolean | null,
  partyReferenceMatchesActiveCompany: boolean | null,
): CommerceExceptionScopeChecks {
  return {
    activeScope: copyScope(scope),
    kernelContextMatchesRevenue: true,
    revenueReadProjectionMatchesRevenue: true,
    sourceRecordsMatchActiveScope: true,
    linkedRecordsMatchActiveScope,
    partyReferenceMatchesActiveCompany,
  };
}

function exception(
  scope: OperatingRecordScope,
  row: Omit<CommerceException, 'scopeChecks' | 'sourceRecordIds'> & {
    sourceRecordIds: Array<string | undefined>;
    linkedRecordsMatchActiveScope?: boolean | null;
    partyReferenceMatchesActiveCompany?: boolean | null;
  },
): CommerceException {
  return {
    ...row,
    sourceRecordIds: sourceIds(...row.sourceRecordIds),
    scopeChecks: rowScopeChecks(
      scope,
      row.linkedRecordsMatchActiveScope ?? null,
      row.partyReferenceMatchesActiveCompany ?? null,
    ),
  };
}

function orderReference(
  revenue: CommerceExceptionRevenueSource,
  salesOrderId: string,
  scope: OperatingRecordScope,
): { number?: string; id?: string; matched: boolean | null } {
  if (!sourceVisible(revenue, 'salesOrders')) return { matched: null };
  const order = revenue.salesOrders.find((candidate) => candidate.id === salesOrderId);
  if (!order) return { matched: null };
  if (!exactScope(order, scope)) return { matched: false };
  return {
    number: fieldVisible(revenue, 'sales.commercial', 'number') ? text(order.number) : undefined,
    id: order.id,
    matched: true,
  };
}

function inventoryReference(
  revenue: CommerceExceptionRevenueSource,
  itemVariantId: string | undefined,
  warehouseId?: string,
  scope?: OperatingRecordScope,
): {
  variantName?: string;
  warehouseName?: string;
  variantId?: string;
  warehouseId?: string;
  matched: boolean | null;
} {
  if (!scope) return { matched: null };
  const variant = itemVariantId && sourceVisible(revenue, 'itemVariants')
    ? revenue.itemVariants.find((candidate) => candidate.id === itemVariantId)
    : undefined;
  const warehouse = warehouseId && sourceVisible(revenue, 'warehouses')
    ? revenue.warehouses.find((candidate) => candidate.id === warehouseId)
    : undefined;
  const variantMatches = variant ? exactScope(variant, scope) : null;
  const warehouseMatches = warehouseId ? (warehouse ? exactScope(warehouse, scope) : null) : null;
  const requiredMatches = warehouseId ? [variantMatches, warehouseMatches] : [variantMatches];
  const linkedExists = requiredMatches.some((match) => match !== null);
  const matched = linkedExists ? requiredMatches.every((match) => match === true) : null;
  return {
    variantName: variantMatches === true && fieldVisible(revenue, 'inventory.master', 'name') ? text(variant?.name) : undefined,
    warehouseName: warehouseMatches === true && fieldVisible(revenue, 'inventory.master', 'name') ? text(warehouse?.name) : undefined,
    variantId: variantMatches === true ? variant?.id : undefined,
    warehouseId: warehouseMatches === true ? warehouse?.id : undefined,
    matched,
  };
}

function buildFulfilmentExceptions(
  input: BuildCommerceExceptionQueueInput,
  referenceTime: number | undefined,
): CommerceException[] {
  const { revenue } = input;
  if (!sourceVisible(revenue, 'fulfilmentTasks')) return [];
  const rows: CommerceException[] = [];
  for (const task of revenue.fulfilmentTasks) {
    if (!exactScope(task, revenue.scope) || !fieldVisible(revenue, 'sales.commercial', 'status')) continue;
    const blocked = task.status === 'blocked';
    const overdue = !TERMINAL_FULFILMENT_STATUSES.has(task.status) && isPastDue(task.dueAt, referenceTime);
    if (!blocked && !overdue) continue;
    const order = fieldVisible(revenue, 'sales.commercial', 'salesOrderId')
      ? orderReference(revenue, task.salesOrderId, revenue.scope)
      : { matched: null };
    const taskTitle = fieldVisible(revenue, 'sales.commercial', 'title') ? text(task.title) : undefined;
    const blockedReason = fieldVisible(revenue, 'sales.commercial', 'blockedReason') ? text(task.blockedReason) : undefined;
    rows.push(exception(revenue.scope, {
      id: `commerce-exception:fulfilment:${task.id}`,
      category: 'fulfilment',
      severity: blocked ? 'critical' : 'attention',
      title: blocked ? 'Fulfilment task blocked' : 'Fulfilment task overdue',
      detail: blockedReason
        ?? (blocked ? 'A fulfilment task is marked blocked.' : 'A fulfilment task is past its recorded due time.'),
      businessReference: order.number ?? taskTitle ?? 'Fulfilment task',
      destination: 'sales',
      sourceRecordIds: [task.id, order.id],
      dueAt: fieldVisible(revenue, 'sales.commercial', 'dueAt') ? text(task.dueAt) : undefined,
      linkedRecordsMatchActiveScope: order.matched,
    }));
  }
  return rows;
}

function buildInventoryExceptions(
  input: BuildCommerceExceptionQueueInput,
  referenceTime: number | undefined,
): CommerceException[] {
  const { revenue } = input;
  const rows: CommerceException[] = [];
  if (sourceVisible(revenue, 'reorderProposals')) {
    for (const proposal of revenue.reorderProposals) {
      if (!exactScope(proposal, revenue.scope) || !fieldVisible(revenue, 'inventory.execution', 'status') || proposal.status !== 'proposed') continue;
      const policyId = fieldVisible(revenue, 'inventory.execution', 'policyId') ? text(proposal.policyId) : undefined;
      const policy = policyId && sourceVisible(revenue, 'reorderPolicies')
        ? revenue.reorderPolicies.find((candidate) => candidate.id === proposal.policyId)
        : undefined;
      const policyMatches = policy ? exactScope(policy, revenue.scope) : null;
      const inventory = policyMatches === true
        ? inventoryReference(
          revenue,
          fieldVisible(revenue, 'inventory.master', 'itemVariantId') ? policy!.itemVariantId : undefined,
          fieldVisible(revenue, 'inventory.master', 'warehouseId') ? policy!.warehouseId : undefined,
          revenue.scope,
        )
        : { matched: policyMatches, variantName: undefined, warehouseName: undefined, variantId: undefined, warehouseId: undefined };
      const availableQuantity = fieldVisible(revenue, 'inventory.execution', 'availableQuantity') ? number(proposal.availableQuantity) : undefined;
      const recommendedQuantity = fieldVisible(revenue, 'inventory.execution', 'recommendedQuantity') ? number(proposal.recommendedQuantity) : undefined;
      const reason = fieldVisible(revenue, 'inventory.execution', 'reason') ? text(proposal.reason) : undefined;
      const reference = [inventory.variantName, inventory.warehouseName].filter((value): value is string => Boolean(value)).join(' / ') || 'Reorder proposal';
      const quantityDetail = availableQuantity !== undefined && recommendedQuantity !== undefined
        ? `${availableQuantity} available; ${recommendedQuantity} recommended.`
        : 'A replenishment proposal remains pending.';
      rows.push(exception(revenue.scope, {
        id: `commerce-exception:inventory:reorder:${proposal.id}`,
        category: 'inventory',
        severity: availableQuantity !== undefined && availableQuantity <= 0 ? 'critical' : 'attention',
        title: 'Replenishment proposal requires review',
        detail: reason ? `${reason} ${quantityDetail}` : quantityDetail,
        businessReference: reference,
        destination: 'operations',
      sourceRecordIds: [proposal.id, policyMatches === true ? policy?.id : undefined, inventory.variantId, inventory.warehouseId],
        dueAt: fieldVisible(revenue, 'inventory.execution', 'requiredBy') ? text(proposal.requiredBy) : undefined,
        linkedRecordsMatchActiveScope: policyMatches === false || inventory.matched === false
          ? false
          : policyMatches === null || inventory.matched === null
            ? null
            : true,
      }));
    }
  }

  if (!sourceVisible(revenue, 'warehouseTasks')) return rows;
  for (const task of revenue.warehouseTasks) {
    if (!exactScope(task, revenue.scope) || !fieldVisible(revenue, 'inventory.execution', 'status')) continue;
    const blocked = task.status === 'blocked';
    const overdue = !TERMINAL_WAREHOUSE_STATUSES.has(task.status) && isPastDue(task.dueAt, referenceTime);
    if (!blocked && !overdue) continue;
    const inventory = inventoryReference(
      revenue,
      fieldVisible(revenue, 'inventory.execution', 'itemVariantId') ? task.itemVariantId : undefined,
      undefined,
      revenue.scope,
    );
    const taskNumber = fieldVisible(revenue, 'inventory.execution', 'number') ? text(task.number) : undefined;
    const blockedReason = fieldVisible(revenue, 'inventory.execution', 'blockedReason') ? text(task.blockedReason) : undefined;
    const priority = fieldVisible(revenue, 'inventory.execution', 'priority') ? task.priority : undefined;
    rows.push(exception(revenue.scope, {
      id: `commerce-exception:inventory:warehouse:${task.id}`,
      category: 'inventory',
      severity: blocked || priority === 'urgent' ? 'critical' : 'attention',
      title: blocked ? 'Warehouse task blocked' : 'Warehouse task overdue',
      detail: blockedReason
        ?? (blocked ? 'A warehouse task is marked blocked.' : 'A warehouse task is past its recorded due time.'),
      businessReference: taskNumber ?? inventory.variantName ?? 'Warehouse task',
      destination: 'operations',
      sourceRecordIds: [task.id, inventory.variantId],
      dueAt: fieldVisible(revenue, 'inventory.execution', 'dueAt') ? text(task.dueAt) : undefined,
      linkedRecordsMatchActiveScope: inventory.matched,
    }));
  }
  return rows;
}

function buildCollectionsExceptions(input: BuildCommerceExceptionQueueInput): CommerceException[] {
  const { revenue, party, kernel } = input;
  const rows: CommerceException[] = [];
  const visibleReceivables = sourceVisible(revenue, 'receivables');
  const receivablesById = new Map(
    visibleReceivables
      ? revenue.receivables.filter((record) => exactScope(record, revenue.scope)).map((record) => [record.id, record])
      : [],
  );
  const activeDunningReceivableIds = new Set<string>();
  const activeDisputeReceivableIds = new Set<string>();

  if (sourceVisible(revenue, 'dunningCases')) {
    for (const dunning of revenue.dunningCases) {
      if (!exactScope(dunning, revenue.scope) || !fieldVisible(revenue, 'finance.dunning', 'status') || TERMINAL_DUNNING_STATUSES.has(dunning.status)) continue;
      const receivableId = fieldVisible(revenue, 'finance.dunning', 'receivableId') ? text(dunning.receivableId) : undefined;
      const accountId = fieldVisible(revenue, 'finance.dunning', 'accountId') ? text(dunning.accountId) : undefined;
      if (receivableId) activeDunningReceivableIds.add(receivableId);
      const receivable = receivableId ? receivablesById.get(receivableId) : undefined;
      const partyReference = accountReference(party, accountId, revenue.scope, kernel.context.tenantId);
      const caseNumber = fieldVisible(revenue, 'finance.dunning', 'number') ? text(dunning.number) : undefined;
      const stage = fieldVisible(revenue, 'finance.dunning', 'stage') ? dunning.stage : undefined;
      const daysOverdue = fieldVisible(revenue, 'finance.dunning', 'daysOverdue') ? number(dunning.daysOverdue) : undefined;
      const reference = [caseNumber, partyReference.label].filter((value): value is string => Boolean(value)).join(' / ') || 'Collection case';
      const detailParts = [
        stage ? stage.replaceAll('-', ' ') : undefined,
        daysOverdue !== undefined ? `${daysOverdue} days overdue` : undefined,
      ].filter((value): value is string => Boolean(value));
      rows.push(exception(revenue.scope, {
        id: `commerce-exception:collections:dunning:${dunning.id}`,
        category: 'collections',
        severity: stage === 'final-demand' || stage === 'credit-hold' ? 'critical' : 'attention',
        title: dunning.status === 'paused' ? 'Collection case paused' : 'Collection follow-up due',
        detail: detailParts.join(' / ') || 'A governed collection case is unresolved.',
        businessReference: reference,
        destination: 'finance',
        sourceRecordIds: [dunning.id, receivable?.id, partyReference.matchesActiveCompany ? accountId : undefined],
        dueAt: fieldVisible(revenue, 'finance.dunning', 'nextActionAt') ? text(dunning.nextActionAt) : undefined,
        linkedRecordsMatchActiveScope: visibleReceivables ? Boolean(receivable) : null,
        partyReferenceMatchesActiveCompany: partyReference.matchesActiveCompany,
      }));
    }
  }

  if (sourceVisible(revenue, 'receivableDisputes')) {
    for (const dispute of revenue.receivableDisputes) {
      if (!exactScope(dispute, revenue.scope) || !fieldVisible(revenue, 'finance.receivable-dispute', 'status') || TERMINAL_DISPUTE_STATUSES.has(dispute.status)) continue;
      const receivableId = fieldVisible(revenue, 'finance.receivable-dispute', 'receivableId') ? text(dispute.receivableId) : undefined;
      const accountId = fieldVisible(revenue, 'finance.receivable-dispute', 'accountId') ? text(dispute.accountId) : undefined;
      if (receivableId) activeDisputeReceivableIds.add(receivableId);
      const receivable = receivableId ? receivablesById.get(receivableId) : undefined;
      const partyReference = accountReference(party, accountId, revenue.scope, kernel.context.tenantId);
      const disputeNumber = fieldVisible(revenue, 'finance.receivable-dispute', 'number') ? text(dispute.number) : undefined;
      const invoiceNumber = receivable && fieldVisible(revenue, 'finance.receivable', 'invoiceNumber') ? text(receivable.invoiceNumber) : undefined;
      const reason = fieldVisible(revenue, 'finance.receivable-dispute', 'reason') ? text(dispute.reason) : undefined;
      const reference = [disputeNumber ?? invoiceNumber, partyReference.label].filter((value): value is string => Boolean(value)).join(' / ') || 'Receivable dispute';
      rows.push(exception(revenue.scope, {
        id: `commerce-exception:collections:dispute:${dispute.id}`,
        category: 'collections',
        severity: dispute.category === 'tax' || dispute.category === 'contract' ? 'critical' : 'attention',
        title: 'Receivable dispute unresolved',
        detail: reason ?? 'A governed receivable dispute remains unresolved.',
        businessReference: reference,
        destination: 'finance',
        sourceRecordIds: [dispute.id, receivable?.id, partyReference.matchesActiveCompany ? accountId : undefined],
        dueAt: fieldVisible(revenue, 'finance.receivable-dispute', 'openedAt') ? text(dispute.openedAt) : undefined,
        linkedRecordsMatchActiveScope: visibleReceivables ? Boolean(receivable) : null,
        partyReferenceMatchesActiveCompany: partyReference.matchesActiveCompany,
      }));
    }
  }

  if (!visibleReceivables || !fieldVisible(revenue, 'finance.receivable', 'status')) return rows;
  for (const receivable of revenue.receivables) {
    if (!exactScope(receivable, revenue.scope)) continue;
    if (!['overdue', 'disputed'].includes(receivable.status)) continue;
    if (number(receivable.outstandingAmount) === undefined || receivable.outstandingAmount <= 0) continue;
    if (activeDunningReceivableIds.has(receivable.id) || activeDisputeReceivableIds.has(receivable.id)) continue;
    const accountId = fieldVisible(revenue, 'finance.receivable', 'accountId') ? text(receivable.accountId) : undefined;
    const partyReference = accountReference(party, accountId, revenue.scope, kernel.context.tenantId);
    const invoiceNumber = fieldVisible(revenue, 'finance.receivable', 'invoiceNumber') ? text(receivable.invoiceNumber) : undefined;
    const reference = [invoiceNumber, partyReference.label].filter((value): value is string => Boolean(value)).join(' / ') || 'Customer receivable';
    rows.push(exception(revenue.scope, {
      id: `commerce-exception:collections:receivable:${receivable.id}`,
      category: 'collections',
      severity: 'critical',
      title: receivable.status === 'disputed' ? 'Receivable under dispute' : 'Receivable overdue',
      detail: receivable.status === 'disputed'
        ? 'An outstanding customer receivable is marked disputed.'
        : 'An outstanding customer receivable is marked overdue.',
      businessReference: reference,
      destination: 'finance',
      sourceRecordIds: [receivable.id, partyReference.matchesActiveCompany ? accountId : undefined],
      dueAt: fieldVisible(revenue, 'finance.receivable', 'dueDate') ? text(receivable.dueDate) : undefined,
      partyReferenceMatchesActiveCompany: partyReference.matchesActiveCompany,
    }));
  }
  return rows;
}

function buildApprovalExceptions(input: BuildCommerceExceptionQueueInput): CommerceException[] {
  const { kernel, revenue } = input;
  const rows: CommerceException[] = [];
  for (const approval of kernel.approvalRequests) {
    if (approval.status !== 'pending') continue;
    const policy = kernel.approvalPolicies.find((candidate) => candidate.id === approval.policyId);
    const workflowInstance = kernel.workflowInstances.find((candidate) => candidate.id === approval.workflowInstanceId);
    const workflow = workflowInstance
      ? kernel.workflowDefinitions.find((candidate) => candidate.id === workflowInstance.workflowId)
      : undefined;
    const reference = text(policy?.name) ?? text(workflow?.name) ?? 'Approval decision';
    rows.push(exception(revenue.scope, {
      id: `commerce-exception:approval:${approval.id}`,
      category: 'approval',
      severity: 'attention',
      title: 'Approval decision pending',
      detail: 'A maker-checker decision is pending.',
      businessReference: reference,
      destination: 'command',
      sourceRecordIds: sourceIds(approval.id, policy?.id, workflowInstance?.id, workflow?.id),
      dueAt: text(approval.requestedAt),
      linkedRecordsMatchActiveScope: null,
    }));
  }
  return rows;
}

function buildServiceExceptions(
  input: BuildCommerceExceptionQueueInput,
  referenceTime: number | undefined,
): CommerceException[] {
  const { revenue, party, kernel } = input;
  if (!sourceVisible(revenue, 'supportTickets')) return [];
  const rows: CommerceException[] = [];
  for (const ticket of revenue.supportTickets) {
    if (!exactScope(ticket, revenue.scope) || !fieldVisible(revenue, 'delivery.service', 'status') || TERMINAL_SERVICE_STATUSES.has(ticket.status)) continue;
    const responseBreached = !ticket.respondedAt && isPastDue(ticket.responseDueAt, referenceTime);
    const resolutionBreached = !ticket.resolvedAt && isPastDue(ticket.resolutionDueAt, referenceTime);
    if (!responseBreached && !resolutionBreached) continue;
    const accountId = fieldVisible(revenue, 'delivery.service', 'accountId') ? text(ticket.accountId) : undefined;
    const partyReference = accountReference(party, accountId, revenue.scope, kernel.context.tenantId);
    const ticketNumber = fieldVisible(revenue, 'delivery.service', 'number') ? text(ticket.number) : undefined;
    const title = fieldVisible(revenue, 'delivery.service', 'title') ? text(ticket.title) : undefined;
    const priority = fieldVisible(revenue, 'delivery.service', 'priority') ? ticket.priority : undefined;
    const reference = [ticketNumber ?? title, partyReference.label].filter((value): value is string => Boolean(value)).join(' / ') || 'Support case';
    rows.push(exception(revenue.scope, {
      id: `commerce-exception:service:${ticket.id}`,
      category: 'service',
      severity: priority === 'critical' || priority === 'high' || resolutionBreached ? 'critical' : 'attention',
      title: resolutionBreached ? 'Service resolution SLA breached' : 'Service response SLA breached',
      detail: title ?? (resolutionBreached ? 'A support case is past its resolution SLA.' : 'A support case is past its response SLA.'),
      businessReference: reference,
      destination: 'service',
      sourceRecordIds: [ticket.id, partyReference.matchesActiveCompany ? accountId : undefined],
      dueAt: resolutionBreached
        ? (fieldVisible(revenue, 'delivery.service', 'resolutionDueAt') ? text(ticket.resolutionDueAt) : undefined)
        : (fieldVisible(revenue, 'delivery.service', 'responseDueAt') ? text(ticket.responseDueAt) : undefined),
      partyReferenceMatchesActiveCompany: partyReference.matchesActiveCompany,
    }));
  }
  return rows;
}

function sortExceptions(rows: CommerceException[]): CommerceException[] {
  return [...rows].sort((left, right) => {
    const severity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severity) return severity;
    const category = CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category];
    if (category) return category;
    const leftDue = parseInstant(left.dueAt) ?? Number.MAX_SAFE_INTEGER;
    const rightDue = parseInstant(right.dueAt) ?? Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) return leftDue - rightDue;
    return left.id.localeCompare(right.id, 'en-IN');
  });
}

/**
 * Returns a deterministic, evidence-only exception queue for the active
 * India workspace. A mismatched kernel context or read projection fails
 * closed: no cross-company or cross-branch record can reach the renderer.
 */
export function buildCommerceExceptionQueue(input: BuildCommerceExceptionQueueInput): CommerceExceptionQueue {
  const { revenue, kernel } = input;
  const scope = copyScope(revenue.scope);
  const kernelContextMatchesRevenue = kernel.context.companyId === scope.companyId
    && kernel.context.branchId === scope.branchId;
  const revenueReadProjectionMatchesRevenue = revenue.readProjection.companyId === scope.companyId
    && revenue.readProjection.branchId === scope.branchId;
  const scopeChecks = { kernelContextMatchesRevenue, revenueReadProjectionMatchesRevenue };
  if (!kernelContextMatchesRevenue || !revenueReadProjectionMatchesRevenue) {
    return { generatedAt: revenue.generatedAt, scope, scopeChecks, exceptions: [] };
  }

  const referenceTime = parseInstant(input.now ?? revenue.generatedAt);
  const exceptions = sortExceptions([
    ...buildFulfilmentExceptions(input, referenceTime),
    ...buildInventoryExceptions(input, referenceTime),
    ...buildCollectionsExceptions(input),
    ...buildApprovalExceptions(input),
    ...buildServiceExceptions(input, referenceTime),
  ]);
  return { generatedAt: revenue.generatedAt, scope, scopeChecks, exceptions };
}

/** Renderer convenience when only the actionable rows are required. */
export function buildCommerceExceptionList(input: BuildCommerceExceptionQueueInput): CommerceException[] {
  return buildCommerceExceptionQueue(input).exceptions;
}
