import type { BinBalance, InventoryBatch, ItemVariant, ReorderPolicy, ReorderProposal, WarehouseTask } from '../shared/inventory-contracts';

export type RetailStockRisk = 'clear' | 'reorder' | 'attention' | 'expired';

export interface RetailStockOverviewRow {
  itemVariantId: string;
  label: string;
  sku?: string;
  availableQuantity: number;
  reservedQuantity: number;
  binCount: number;
  reorderQuantity: number;
  proposedReorder: boolean;
  expiredBatchCount: number;
  openTaskCount: number;
  risk: RetailStockRisk;
  nextAction: string;
}

export interface RetailStockOverviewReport {
  rows: RetailStockOverviewRow[];
  summary: { variants: number; availableUnits: number; reorderCount: number; expiredBatchCount: number; openTaskCount: number };
}

const round = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Read-only stock projection for the simple Stock route. */
export function computeRetailStockOverview({
  variants,
  balances,
  policies,
  proposals,
  batches,
  tasks,
}: {
  variants: readonly ItemVariant[];
  balances: readonly BinBalance[];
  policies: readonly ReorderPolicy[];
  proposals: readonly ReorderProposal[];
  batches: readonly InventoryBatch[];
  tasks: readonly WarehouseTask[];
}): RetailStockOverviewReport {
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const variantIds = new Set<string>([
    ...balances.map((balance) => balance.itemVariantId),
    ...policies.filter((policy) => policy.active).map((policy) => policy.itemVariantId),
    ...batches.map((batch) => batch.itemVariantId),
    ...tasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled').map((task) => task.itemVariantId),
  ]);
  const rows = [...variantIds].map((itemVariantId): RetailStockOverviewRow => {
    const variant = variantById.get(itemVariantId);
    const variantBalances = balances.filter((balance) => balance.itemVariantId === itemVariantId);
    const variantPolicies = policies.filter((policy) => policy.active && policy.itemVariantId === itemVariantId);
    const variantProposals = proposals.filter((proposal) => proposal.status === 'proposed' && variantPolicies.some((policy) => policy.id === proposal.policyId));
    const variantBatches = batches.filter((batch) => batch.itemVariantId === itemVariantId);
    const openTasks = tasks.filter((task) => task.itemVariantId === itemVariantId && task.status !== 'completed' && task.status !== 'cancelled');
    const availableQuantity = round(variantBalances.reduce((sum, balance) => sum + balance.available, 0));
    const reservedQuantity = round(variantBalances.reduce((sum, balance) => sum + balance.reserved, 0));
    const reorderQuantity = variantPolicies.reduce((maximum, policy) => Math.max(maximum, policy.reorderPoint), 0);
    const expiredBatchCount = variantBatches.filter((batch) => batch.status === 'expired').length;
    const proposedReorder = variantProposals.length > 0;
    const belowReorderPoint = variantPolicies.length > 0 && variantPolicies.some((policy) => availableQuantity <= policy.reorderPoint);
    let risk: RetailStockRisk = 'clear';
    if (expiredBatchCount > 0) risk = 'expired';
    else if (proposedReorder || belowReorderPoint) risk = 'reorder';
    else if (openTasks.some((task) => task.status === 'blocked' || task.priority === 'urgent')) risk = 'attention';
    const nextAction = risk === 'expired'
      ? 'Quarantine expired stock and review disposition evidence.'
      : risk === 'reorder'
        ? 'Review the replenishment proposal before approval.'
        : risk === 'attention'
          ? 'Resolve the blocked or urgent warehouse task.'
          : 'No stock exception is recorded.';
    return {
      itemVariantId,
      label: variant?.name || variant?.sku || itemVariantId,
      sku: variant?.sku,
      availableQuantity,
      reservedQuantity,
      binCount: new Set(variantBalances.map((balance) => balance.binId)).size,
      reorderQuantity,
      proposedReorder,
      expiredBatchCount,
      openTaskCount: openTasks.length,
      risk,
      nextAction,
    };
  }).sort((left, right) => riskRank(right.risk) - riskRank(left.risk) || left.label.localeCompare(right.label));
  return {
    rows,
    summary: {
      variants: rows.length,
      availableUnits: round(rows.reduce((sum, row) => sum + row.availableQuantity, 0)),
      reorderCount: rows.filter((row) => row.risk === 'reorder').length,
      expiredBatchCount: rows.reduce((sum, row) => sum + row.expiredBatchCount, 0),
      openTaskCount: rows.reduce((sum, row) => sum + row.openTaskCount, 0),
    },
  };
}

function riskRank(risk: RetailStockRisk): number {
  return risk === 'expired' ? 4 : risk === 'attention' ? 3 : risk === 'reorder' ? 2 : 1;
}
