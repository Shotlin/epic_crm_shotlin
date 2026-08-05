import type { DashboardSnapshot } from '../shared/contracts';
import type { KernelSnapshot } from '../shared/kernel-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export type ControlTowerWorkspace = 'command' | 'crm' | 'sales' | 'finance' | 'operations' | 'people' | 'service' | 'intelligence';

export interface ControlTowerRow {
  id: string;
  resource: string;
  area: string;
  title: string;
  detail: string;
  severity: 'critical' | 'attention' | 'watch' | 'clear';
  status: 'open' | 'blocked' | 'in-progress' | 'resolved';
  ownerWorkspace: ControlTowerWorkspace;
  scope: { companyId: string; branchId: string };
  dueAt?: string;
  amount?: number;
}

export interface ControlTowerAccessDecision {
  allowed: boolean;
  deniedFields: readonly string[];
}

export interface ControlTowerReadProjection {
  scope: { companyId: string; branchId: string };
  rows: ControlTowerRow[];
  hiddenRows: number;
  redactedFields: Record<string, string[]>;
  /** Source categories withheld by the active projection. Never contains values. */
  restrictedSources: string[];
  generatedAt: string;
}


export function createControlTowerReadProjection(
  rows: readonly ControlTowerRow[],
  scope: { companyId: string; branchId: string },
  getDecision: (resource: string) => ControlTowerAccessDecision,
  generatedAt = new Date().toISOString(),
): ControlTowerReadProjection {
  const redactedFields: Record<string, string[]> = {};
  let hiddenRows = 0;
  const projected = rows.flatMap((row) => {
    if (row.scope.companyId !== scope.companyId || row.scope.branchId !== scope.branchId) { hiddenRows += 1; return []; }
    const decision = getDecision(row.resource);
    if (!decision.allowed) { hiddenRows += 1; return []; }
    if (!decision.deniedFields.length) return [row];
    redactedFields[row.id] = [...decision.deniedFields];
    const copy = { ...row } as Record<string, unknown>;
    for (const field of decision.deniedFields) delete copy[field];
    return [copy as unknown as ControlTowerRow];
  });
  return { scope: structuredClone(scope), rows: projected, hiddenRows, redactedFields, restrictedSources: [], generatedAt };
}

export interface BuildGovernedControlTowerInput {
  dashboard: DashboardSnapshot;
  revenue: RevenueOpsSnapshot;
  kernel: KernelSnapshot;
  /** Optional deterministic clock for overdue CRM and service-work queues. */
  now?: string;
}

function severityRank(severity: ControlTowerRow['severity']): number {
  if (severity === 'critical') return 0;
  if (severity === 'attention') return 1;
  if (severity === 'watch') return 2;
  return 3;
}

/**
 * Builds the visible Control Tower from already-governed snapshots.
 *
 * No static demo rows, client-only acknowledgements, or invented business
 * signals are used here. If a source collection or metric is withheld by the
 * active role, the tower records that boundary without leaking the data.
 */
export function buildGovernedControlTower({
  dashboard,
  revenue,
  kernel,
  now,
}: BuildGovernedControlTowerInput): ControlTowerReadProjection {
  // The Control Tower is a company/branch projection. Keep the tenant and
  // actor context inside the governed source snapshots rather than leaking
  // technical identity fields into every projected row.
  const scope = {
    companyId: kernel.context.companyId,
    branchId: kernel.context.branchId,
  };
  const scopeMatches = revenue.scope.companyId === scope.companyId
    && revenue.scope.branchId === scope.branchId
    && revenue.readProjection.companyId === scope.companyId
    && revenue.readProjection.branchId === scope.branchId;
  if (!scopeMatches) {
    return {
      scope: structuredClone(scope),
      rows: [],
      hiddenRows: 0,
      redactedFields: {},
      restrictedSources: ['scope-mismatch'],
      generatedAt: revenue.generatedAt,
    };
  }

  const referenceTime = Date.parse(now ?? revenue.generatedAt);
  const hidden = new Set(revenue.readProjection.hiddenCollections);
  const redactedMetrics = new Set(revenue.readProjection.redactedMetrics);
  const redactedFields: Record<string, string[]> = {};
  const restrictedSources: string[] = [];
  const rows: ControlTowerRow[] = [];
  let hiddenRows = 0;
  const withhold = (source: string): void => {
    hiddenRows += 1;
    if (!restrictedSources.includes(source)) restrictedSources.push(source);
  };
  const add = (row: ControlTowerRow): void => { rows.push(row); };
  const isOverdue = (value: string): boolean => Number.isFinite(referenceTime) && Date.parse(value) < referenceTime;

  for (const opportunity of dashboard.opportunities) {
    if (opportunity.currency !== 'INR' || opportunity.health !== 'at-risk') continue;
    add({
      id: `tower:crm.opportunity:${opportunity.id}`,
      resource: 'crm.opportunity',
      area: 'CRM',
      title: 'Commercial intervention due',
      detail: `${opportunity.title} / ${opportunity.account} / ${opportunity.nextStep}`,
      severity: 'critical',
      status: 'open',
      ownerWorkspace: 'crm',
      scope,
      dueAt: opportunity.expectedClose,
      amount: opportunity.value,
    });
  }
  for (const activity of dashboard.activities) {
    if (activity.status !== 'open' || activity.priority !== 'high' || !isOverdue(activity.dueAt)) continue;
    add({
      id: `tower:crm.activity:${activity.id}`,
      resource: 'crm.activity',
      area: 'CRM',
      title: 'High-priority customer action overdue',
      detail: `${activity.title} / ${activity.subject}`,
      severity: 'attention',
      status: 'open',
      ownerWorkspace: 'crm',
      scope,
      dueAt: activity.dueAt,
    });
  }

  for (const approval of kernel.approvalRequests) {
    if (approval.status !== 'pending') continue;
    add({
      id: `tower:kernel.approval-policy:${approval.id}`,
      resource: 'kernel.approval-policy',
      area: 'Governance',
      title: 'Approval decision waiting',
      detail: `Policy ${approval.policyId} has a pending maker-checker decision.`,
      severity: 'attention',
      status: 'open',
      ownerWorkspace: 'command',
      scope,
      dueAt: approval.requestedAt,
    });
  }

  const dunningRestricted = hidden.has('dunningCases');
  const receivablesRestricted = hidden.has('receivables') || redactedMetrics.has('outstandingReceivables');
  const dunningDeniedFields = new Set(revenue.readProjection.redactedFields['finance.dunning'] ?? []);
  const activeDunningReceivableIds = new Set<string>();
  if (dunningRestricted) {
    withhold('dunningCases');
  } else {
    for (const dunning of revenue.dunningCases) {
      if (dunning.status === 'resolved') continue;
      activeDunningReceivableIds.add(dunning.receivableId);
      const stage = dunningDeniedFields.has('stage') ? undefined : dunning.stage;
      const daysOverdue = dunningDeniedFields.has('daysOverdue') ? undefined : dunning.daysOverdue;
      const number = dunningDeniedFields.has('number') ? undefined : dunning.number;
      const protectedFields = [...dunningDeniedFields];
      const amountProtected = receivablesRestricted || dunningDeniedFields.has('actionableAmount');
      if (amountProtected && !protectedFields.includes('amount')) protectedFields.push('amount');
      const row: ControlTowerRow = {
        id: `tower:finance.dunning:${dunning.id}`,
        resource: 'finance.dunning',
        area: 'Finance',
        title: 'Collection follow-up due',
        detail: [
          number,
          stage,
          daysOverdue === undefined ? undefined : `${daysOverdue} days overdue`,
        ].filter((part): part is string => Boolean(part)).join(' / ') || 'Collection case detail is protected.',
        severity: stage === 'final-demand' || stage === 'credit-hold' ? 'critical' : 'attention',
        status: stage === 'credit-hold' ? 'blocked' : 'open',
        ownerWorkspace: 'finance',
        scope,
        dueAt: dunning.nextActionAt,
      };
      if (protectedFields.length) redactedFields[row.id] = protectedFields;
      if (!amountProtected) row.amount = dunning.actionableAmount;
      add(row);
    }
  }
  if (receivablesRestricted) {
    withhold('receivables');
  } else {
    const amountRestricted = (revenue.readProjection.redactedFields['finance.receivable'] ?? []).includes('outstandingAmount');
    for (const receivable of revenue.receivables) {
      if (activeDunningReceivableIds.has(receivable.id) || receivable.outstandingAmount <= 0 || !['overdue', 'disputed'].includes(receivable.status)) continue;
      const row: ControlTowerRow = {
        id: `tower:finance.receivable:${receivable.id}`,
        resource: 'finance.receivable',
        area: 'Finance',
        title: receivable.status === 'disputed' ? 'Receivable under dispute' : 'Collection action due',
        detail: `${receivable.invoiceNumber} is ${receivable.status}; review the governed collection evidence.`,
        severity: 'critical',
        status: receivable.status === 'disputed' ? 'blocked' : 'open',
        ownerWorkspace: 'finance',
        scope,
        dueAt: receivable.dueDate,
      };
      if (amountRestricted) redactedFields[row.id] = ['amount'];
      else row.amount = receivable.outstandingAmount;
      add(row);
    }
  }

  const reorderRestricted = hidden.has('reorderProposals');
  if (reorderRestricted) {
    withhold('reorderProposals');
  } else {
    const policiesById = new Map(revenue.reorderPolicies.map((policy) => [policy.id, policy]));
    const variantsById = new Map(revenue.itemVariants.map((variant) => [variant.id, variant]));
    const warehousesById = new Map(revenue.warehouses.map((warehouse) => [warehouse.id, warehouse]));
    for (const proposal of revenue.reorderProposals) {
      if (proposal.status !== 'proposed') continue;
      const policy = policiesById.get(proposal.policyId);
      const variant = policy ? variantsById.get(policy.itemVariantId) : undefined;
      const warehouse = policy ? warehousesById.get(policy.warehouseId) : undefined;
      add({
        id: `tower:inventory.execution:reorder:${proposal.id}`,
        resource: 'inventory.execution',
        area: 'Operations',
        title: 'Replenishment proposal needs review',
        detail: `${variant?.name ?? 'Inventory item'} / ${warehouse?.name ?? 'warehouse'} / ${proposal.availableQuantity} available, ${proposal.recommendedQuantity} recommended.`,
        severity: proposal.availableQuantity <= 0 ? 'critical' : 'attention',
        status: 'open',
        ownerWorkspace: 'operations',
        scope,
        dueAt: proposal.requiredBy,
      });
    }
  }

  const warehouseRestricted = hidden.has('warehouseTasks');
  if (warehouseRestricted) {
    withhold('warehouseTasks');
  } else {
    for (const task of revenue.warehouseTasks) {
      if (task.status !== 'blocked' && !(task.status !== 'completed' && task.status !== 'cancelled' && isOverdue(task.dueAt))) continue;
      add({
        id: `tower:inventory.execution:task:${task.id}`,
        resource: 'inventory.execution',
        area: 'Operations',
        title: `${task.type === 'pick' ? 'Picking' : 'Putaway'} task ${task.status === 'blocked' ? 'blocked' : 'overdue'}`,
        detail: task.blockedReason ?? `${task.number} needs warehouse intervention.`,
        severity: task.status === 'blocked' || task.priority === 'urgent' ? 'critical' : 'attention',
        status: task.status === 'blocked' ? 'blocked' : 'open',
        ownerWorkspace: 'operations',
        scope,
        dueAt: task.dueAt,
      });
    }
  }

  if (hidden.has('payrollRuns')) {
    withhold('payrollRuns');
  } else {
    for (const payrollRun of revenue.payrollRuns) {
      if (payrollRun.status !== 'submitted') continue;
      add({
        id: `tower:payroll.run:${payrollRun.id}`,
        resource: 'payroll.run',
        area: 'People',
        title: 'Payroll approval pending',
        detail: `${payrollRun.number} / ${payrollRun.periodFrom} to ${payrollRun.periodTo}.`,
        severity: 'watch',
        status: 'in-progress',
        ownerWorkspace: 'people',
        scope,
        dueAt: payrollRun.paymentDate,
      });
    }
  }

  if (hidden.has('supportTickets')) {
    withhold('supportTickets');
  } else {
    for (const ticket of revenue.supportTickets) {
      if (['resolved', 'closed', 'cancelled'].includes(ticket.status)) continue;
      const breach = isOverdue(ticket.resolutionDueAt) || (!ticket.respondedAt && isOverdue(ticket.responseDueAt));
      if (!breach) continue;
      add({
        id: `tower:delivery.service:${ticket.id}`,
        resource: 'delivery.service',
        area: 'Service',
        title: 'Customer SLA risk',
        detail: `${ticket.number} / ${ticket.title} / ${ticket.priority} priority.`,
        severity: ticket.priority === 'critical' || ticket.priority === 'high' ? 'critical' : 'attention',
        status: ticket.status === 'pending-customer' ? 'in-progress' : 'open',
        ownerWorkspace: 'service',
        scope,
        dueAt: ticket.resolutionDueAt,
      });
    }
  }

  rows.sort((left, right) => severityRank(left.severity) - severityRank(right.severity) || (left.dueAt ?? '').localeCompare(right.dueAt ?? '') || left.id.localeCompare(right.id, 'en-IN'));
  return {
    scope: structuredClone(scope),
    rows,
    hiddenRows,
    redactedFields,
    restrictedSources,
    generatedAt: revenue.generatedAt,
  };
}

