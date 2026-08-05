import type { BinBalance, ItemVariant } from '../shared/inventory-contracts';
import type { RetailCommerceConnector, RetailCommerceOrder } from '../shared/retail-commerce-contracts';

export type RetailOmnichannelInventoryRisk = 'covered' | 'short' | 'unmapped';

export interface RetailOmnichannelInventoryRow {
  itemVariantId: string;
  label: string;
  sku: string;
  channels: string[];
  openDemand: number;
  unreservedDemand: number;
  availableUnits: number;
  shortageUnits: number;
  risk: RetailOmnichannelInventoryRisk;
  nextAction: string;
}

export interface RetailOmnichannelInventoryTruthReport {
  summary: { openOrders: number; demandUnits: number; unreservedDemandUnits: number; shortageUnits: number; atRiskVariants: number };
  rows: RetailOmnichannelInventoryRow[];
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const openStatuses = new Set<RetailCommerceOrder['status']>(['imported', 'confirmed', 'return-requested']);

/**
 * Read-only omnichannel stock projection. Imported orders without a local
 * reservation are treated as demand, but never as a stock write or provider
 * acknowledgement. This deliberately exposes unmapped SKUs instead of
 * assuming a remote SKU is a local variant.
 */
export function computeRetailOmnichannelInventoryTruth({ orders, connectors, variants, balances }: { orders: readonly RetailCommerceOrder[]; connectors: readonly RetailCommerceConnector[]; variants: readonly ItemVariant[]; balances: readonly BinBalance[] }): RetailOmnichannelInventoryTruthReport {
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const connectorById = new Map(connectors.map((connector) => [connector.id, connector]));
  const availableByVariant = new Map<string, number>();
  balances.forEach((balance) => availableByVariant.set(balance.itemVariantId, money((availableByVariant.get(balance.itemVariantId) ?? 0) + Math.max(0, balance.available))));
  const aggregates = new Map<string, { demand: number; unreserved: number; channels: Set<string> }>();
  const openOrders = orders.filter((order) => openStatuses.has(order.status));
  openOrders.forEach((order) => {
    const channel = connectorById.get(order.connectorId)?.channel ?? 'unknown channel';
    const unreservedOrder = !(order.inventoryReservationIds?.length);
    order.lines.forEach((line) => {
      const current = aggregates.get(line.itemVariantId) ?? { demand: 0, unreserved: 0, channels: new Set<string>() };
      current.demand = money(current.demand + Math.max(0, line.quantity));
      if (unreservedOrder) current.unreserved = money(current.unreserved + Math.max(0, line.quantity));
      current.channels.add(channel);
      aggregates.set(line.itemVariantId, current);
    });
  });
  const rows = [...aggregates.entries()].map(([itemVariantId, aggregate]): RetailOmnichannelInventoryRow => {
    const variant = variantById.get(itemVariantId);
    if (!variant) return { itemVariantId, label: 'Remote SKU needs mapping', sku: itemVariantId, channels: [...aggregate.channels].sort(), openDemand: aggregate.demand, unreservedDemand: aggregate.unreserved, availableUnits: 0, shortageUnits: aggregate.unreserved, risk: 'unmapped', nextAction: 'Map the remote SKU to an active local variant before promising fulfilment.' };
    const availableUnits = availableByVariant.get(itemVariantId) ?? 0;
    const shortageUnits = Math.max(0, money(aggregate.unreserved - availableUnits));
    const risk: RetailOmnichannelInventoryRisk = shortageUnits > 0 ? 'short' : 'covered';
    return { itemVariantId, label: variant.name, sku: variant.sku, channels: [...aggregate.channels].sort(), openDemand: aggregate.demand, unreservedDemand: aggregate.unreserved, availableUnits, shortageUnits, risk, nextAction: shortageUnits > 0 ? 'Hold or source stock before accepting the open channel demand.' : 'Available stock covers unreserved channel demand; keep reservations reconciled.' };
  }).sort((left, right) => (right.shortageUnits - left.shortageUnits) || (right.unreservedDemand - left.unreservedDemand) || left.label.localeCompare(right.label));
  return { summary: { openOrders: openOrders.length, demandUnits: money(rows.reduce((sum, row) => sum + row.openDemand, 0)), unreservedDemandUnits: money(rows.reduce((sum, row) => sum + row.unreservedDemand, 0)), shortageUnits: money(rows.reduce((sum, row) => sum + row.shortageUnits, 0)), atRiskVariants: rows.filter((row) => row.risk !== 'covered').length }, rows };
}
