import type { DashboardSnapshot, Opportunity } from '../shared/contracts';
import type { KernelSnapshot } from '../shared/kernel-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

/**
 * A read-only, India-first operating projection for the owner dashboard.
 *
 * This intentionally consumes existing governed snapshots rather than keeping
 * a second dashboard data store. A missing metric means the current role is
 * not allowed to see it; it is never shown as a misleading zero.
 */
export type ExecutivePulseWorkspace =
  | 'command'
  | 'sales'
  | 'finance'
  | 'operations'
  | 'people'
  | 'service'
  | 'intelligence';

export type ExecutivePulseSeverity = 'critical' | 'attention' | 'watch';
export type ExecutivePulseFormat = 'currency' | 'number' | 'percentage';

export interface ExecutivePulseMetric {
  id: string;
  label: string;
  value?: number;
  format: ExecutivePulseFormat;
  context: string;
  workspace: ExecutivePulseWorkspace;
  restricted: boolean;
}

export interface ExecutivePulseAction {
  id: string;
  label: string;
  detail: string;
  count?: number;
  amount?: number;
  severity: ExecutivePulseSeverity;
  workspace: ExecutivePulseWorkspace;
}

export interface ExecutivePulseDemand {
  id: string;
  title: string;
  account: string;
  value: number;
  probability: number;
  health: Opportunity['health'];
}

export interface ExecutivePulseReplenishment {
  id: string;
  sku: string;
  itemName: string;
  warehouseName: string;
  availableQuantity: number;
  recommendedQuantity: number;
  requiredBy: string;
}

export interface ExecutivePulseSignal {
  id: string;
  label: string;
  value?: number;
  format: 'number' | 'percentage';
  context: string;
  workspace: ExecutivePulseWorkspace;
  restricted: boolean;
}

export interface IndiaExecutivePulse {
  generatedAt: string;
  metrics: ExecutivePulseMetric[];
  actions: ExecutivePulseAction[];
  priorityDemand: ExecutivePulseDemand[];
  replenishment: ExecutivePulseReplenishment[];
  liveSignals: ExecutivePulseSignal[];
  restrictedMetricCount: number;
}

export interface BuildIndiaExecutivePulseInput {
  dashboard: DashboardSnapshot;
  revenue: RevenueOpsSnapshot;
  kernel: KernelSnapshot;
}

function validNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function greaterThanZero(value: number | undefined): number | undefined {
  const normalized = validNumber(value);
  return normalized !== undefined && normalized > 0 ? normalized : undefined;
}

function severityRank(severity: ExecutivePulseSeverity): number {
  if (severity === 'critical') return 0;
  if (severity === 'attention') return 1;
  return 2;
}

/**
 * Builds the shared owner view used by Command. It has no mutations and no
 * business-side effects, so individual domain workbenches remain authoritative.
 */
export function buildIndiaExecutivePulse({
  dashboard,
  revenue,
  kernel,
}: BuildIndiaExecutivePulseInput): IndiaExecutivePulse {
  const { metrics: source, readProjection } = revenue;
  const restrictedMetrics = new Set(readProjection.redactedMetrics);
  const metric = (
    id: keyof typeof source,
    label: string,
    format: ExecutivePulseFormat,
    context: string,
    workspace: ExecutivePulseWorkspace,
  ): ExecutivePulseMetric => ({
    id,
    label,
    value: validNumber(source[id]),
    format,
    context,
    workspace,
    restricted: restrictedMetrics.has(id),
  });
  const signal = (
    id: keyof typeof source,
    label: string,
    format: ExecutivePulseSignal['format'],
    context: string,
    workspace: ExecutivePulseWorkspace,
  ): ExecutivePulseSignal => ({
    id,
    label,
    value: validNumber(source[id]),
    format,
    context,
    workspace,
    restricted: restrictedMetrics.has(id),
  });

  const metrics: ExecutivePulseMetric[] = [
    metric('indiaPipeline', 'Qualified pipeline', 'currency', 'Active INR opportunities', 'sales'),
    metric('billedValue', 'Billed value', 'currency', 'Issued, non-cancelled invoices', 'finance'),
    metric('outstandingReceivables', 'Outstanding receivables', 'currency', 'Customer amount still open', 'finance'),
    metric('liquidityAvailable', 'Available liquidity', 'currency', 'Latest controlled bank position', 'finance'),
  ];

  const actions: ExecutivePulseAction[] = [];
  const addAction = (
    id: string,
    value: number | undefined,
    label: string,
    detail: string,
    severity: ExecutivePulseSeverity,
    workspace: ExecutivePulseWorkspace,
    amount?: number,
  ): void => {
    const count = greaterThanZero(value);
    if (count === undefined) return;
    actions.push({ id, label, detail, count, amount, severity, workspace });
  };

  const pendingApprovals =
    kernel.approvalRequests.filter(({ status }) => status === 'pending').length +
    (validNumber(source.pendingApprovals) ?? 0);
  addAction(
    'approvals',
    pendingApprovals,
    'Approval decisions waiting',
    'Maker-checker decisions require an accountable owner.',
    'attention',
    'command',
  );
  addAction(
    'collections',
    source.collectionsAtRisk ?? source.overdueReceivables,
    'Collections need intervention',
    'Past-due customer balances need a recorded follow-up.',
    'critical',
    'finance',
    validNumber(source.collectionsAtRisk ?? source.overdueReceivables),
  );
  addAction(
    'replenishment',
    source.reorderAlerts,
    'Replenishment proposals ready',
    'Stock policies have raised controlled replenishment recommendations.',
    'attention',
    'operations',
  );
  addAction(
    'warehouse-backlog',
    source.warehouseTaskBacklog,
    'Warehouse tasks need attention',
    'Picking, putaway or exception work remains open.',
    'attention',
    'operations',
  );
  addAction(
    'statutory',
    (validNumber(source.statutoryExceptions) ?? 0) +
      (validNumber(source.portalDrift) ?? 0) +
      (validNumber(source.statutoryCredentialGaps) ?? 0),
    'GST or portal evidence needs review',
    'Resolve statutory exceptions before treating a portal state as complete.',
    'critical',
    'finance',
  );
  addAction(
    'service-sla',
    source.slaBreaches,
    'Customer SLA risk',
    'Open service commitments are beyond their response or resolution target.',
    'critical',
    'service',
  );
  addAction(
    'bank-matching',
    source.bankUnmatched,
    'Bank statement matches pending',
    'Imported bank lines require review before cash is treated as reconciled.',
    'watch',
    'finance',
  );
  addAction(
    'people-review',
    (validNumber(source.attendanceAwaitingReview) ?? 0) +
      (validNumber(source.leaveAwaitingReview) ?? 0) +
      (validNumber(source.expensesAwaitingApproval) ?? 0),
    'People records awaiting review',
    'Attendance, leave or expense evidence requires a decision.',
    'watch',
    'people',
  );

  const priorityDemand = [...dashboard.opportunities]
    .filter(({ currency }) => currency === 'INR')
    .sort((left, right) => {
      const rightWeighted = right.value * right.probability;
      const leftWeighted = left.value * left.probability;
      return rightWeighted - leftWeighted || right.value - left.value;
    })
    .slice(0, 5)
    .map(({ id, title, account, value, probability, health }) => ({
      id,
      title,
      account,
      value,
      probability,
      health,
    }));

  const policiesById = new Map(revenue.reorderPolicies.map((policy) => [policy.id, policy]));
  const variantsById = new Map(revenue.itemVariants.map((variant) => [variant.id, variant]));
  const warehousesById = new Map(revenue.warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const replenishment = revenue.reorderProposals
    .filter(({ status }) => status === 'proposed')
    .map((proposal) => {
      const policy = policiesById.get(proposal.policyId);
      const variant = policy ? variantsById.get(policy.itemVariantId) : undefined;
      const warehouse = policy ? warehousesById.get(policy.warehouseId) : undefined;
      return {
        id: proposal.id,
        sku: variant?.sku ?? 'Unresolved SKU',
        itemName: variant?.name ?? 'Inventory item',
        warehouseName: warehouse?.name ?? 'Warehouse',
        availableQuantity: proposal.availableQuantity,
        recommendedQuantity: proposal.recommendedQuantity,
        requiredBy: proposal.requiredBy,
      };
    })
    .sort((left, right) => left.availableQuantity - right.availableQuantity || right.recommendedQuantity - left.recommendedQuantity)
    .slice(0, 5);

  const liveSignals: ExecutivePulseSignal[] = [
    signal('activeShipments', 'Active shipments', 'number', 'Orders in physical fulfilment', 'operations'),
    signal('capacityLoadPercent', 'Shop-floor load', 'percentage', 'Planned capacity under active work orders', 'operations'),
    signal('fieldJobsActive', 'Field jobs in motion', 'number', 'Technician jobs planned, dispatched or on-site', 'service'),
    signal('supportOpen', 'Open support cases', 'number', 'Customer cases not yet resolved', 'service'),
  ];

  return {
    generatedAt: revenue.generatedAt,
    metrics,
    actions: actions.sort((left, right) => severityRank(left.severity) - severityRank(right.severity) || (right.amount ?? right.count ?? 0) - (left.amount ?? left.count ?? 0)),
    priorityDemand,
    replenishment,
    liveSignals,
    restrictedMetricCount: metrics.filter(({ restricted }) => restricted).length,
  };
}
