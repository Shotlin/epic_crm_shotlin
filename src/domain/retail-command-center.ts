/**
 * retail-command-center.ts
 *
 * Pillar 1 – True Retail Command Center & Store Operations Deck
 *
 * Aggregates real-time store metrics: sales revenue, evidence-backed gross margin, cash variance alerts,
 * stockout risks, expiry liabilities, online order queues, staff performance, and known gross profit.
 *
 * Contract-aligned to retail-pos-contracts.ts and revenue-ops-contracts.ts:
 * - RetailSale.grandTotal lives in sale.taxPreview.grandTotal
 * - RetailSale.saleAt (not createdAt)
 * - RetailCashierShift.variance (not varianceAmount)
 * - RetailCashierShiftStatus: 'open' | 'close-requested' | 'closed' (no variance-review-required)
 * - BinBalance has no expiryDate; expiry is tracked on InventoryBatch
 */

import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { RetailCommerceChannel } from '../shared/retail-commerce-contracts';
import { toIndiaBusinessDate } from '../shared/india-business-date';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Inventory batches are persisted as India business dates, rather than elapsed
 * timestamps.  Parse them strictly: JavaScript otherwise normalises values
 * such as 2026-02-31 and can turn corrupt evidence into a stock alert.
 */
function parseBusinessDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day ? date : undefined;
}

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export interface StorePerformanceMetric {
  storeId: string;
  storeName: string;
  grossSalesAmount: number;
  netSalesAmount: number;
  costOfGoodsSold: number;
  grossProfitAmount: number;
  grossMarginPct: number;
  totalOrdersCount: number;
  averageBasketValue: number;
  cashVarianceAmount: number;
  stockoutItemsCount: number;
  expiryRiskItemsCount: number;
  onlinePendingOrdersCount: number;
}

export interface StaffPerformanceRow {
  staffId: string;
  staffName: string;
  role: string;
  completedSalesCount: number;
  totalRevenueGenerated: number;
  averageTransactionValue: number;
  cashVarianceCount: number;
  cashVarianceTotalAmount: number;
}

export type RetailCommandAttentionKind = 'cash-variance' | 'margin-erosion' | 'stockout' | 'expiry' | 'omnichannel';
export type RetailCommandAttentionSeverity = 'medium' | 'high' | 'critical';

export interface RetailCommandAttention {
  id: string;
  kind: RetailCommandAttentionKind;
  severity: RetailCommandAttentionSeverity;
  priorityScore: number;
  count: number;
  amount: number;
  summary: string;
  action: string;
}

export interface RetailCommandCenterSnapshot {
  generatedAt: string;
  period: string; // e.g. "Today" | "This Month"
  totalStoresCount: number;
  aggregateGrossSales: number;
  aggregateNetProfit: number;
  overallMarginPct: number;
  profitCostCoveragePct: number;
  onlinePendingOrdersCount: number;
  onlinePendingOrderValue: number;
  /** Pending omnichannel demand grouped by its governed connector channel. */
  channelPendingOrders: Record<RetailCommerceChannel, { count: number; value: number }>;
  activeCashierShiftsCount: number;
  unresolvedVarianceCount: number;
  totalStockoutCount: number;
  totalExpiryRiskItemsCount: number;
  storePerformance: StorePerformanceMetric[];
  staffPerformance: StaffPerformanceRow[];
  /** One queue for the highest-value action across physical and online stores. */
  attentionQueue: RetailCommandAttention[];
  attentionItems: string[];
}

/**
 * Computes the Retail Command Center snapshot from governed RevenueOps state.
 *
 * Key contract facts used:
 * - sale.taxPreview.grandTotal is the INR grand total (including GST)
 * - shift.variance is the optional cash variance amount (positive = surplus, negative = shortage)
 * - shift.status: 'open' | 'close-requested' | 'closed'
 * - BinBalance.available is the available-to-sell quantity
 * - Expiry risk is tracked via InventoryBatch, not BinBalance
 */
type RetailCommandCenterSource = Pick<RevenueOpsState, 'retailSales' | 'retailCashierShifts' | 'binBalances' | 'retailCounters' | 'inventoryBatches' | 'retailCommerceOrders' | 'retailCommerceConnectors'>;

export function computeRetailCommandCenter(
  revenue: RetailCommandCenterSource,
  period = 'Today',
  now: Date = new Date(),
): RetailCommandCenterSnapshot {
  const sales = revenue.retailSales ?? [];
  const shifts = revenue.retailCashierShifts ?? [];
  const binBalances = revenue.binBalances ?? [];
  const counters = revenue.retailCounters ?? [];
  const pendingOnlineOrders = (revenue.retailCommerceOrders ?? []).filter(({ status }) => ['imported', 'confirmed'].includes(status));
  const onlinePendingOrdersCount = pendingOnlineOrders.length;
  const onlinePendingOrderValue = round2(pendingOnlineOrders.reduce((sum, order) => sum + order.totalAmount, 0));
  const channelPendingOrders = (['marketplace', 'ondc', 'website', 'whatsapp'] as const).reduce((result, channel) => {
    const orders = pendingOnlineOrders.filter((order) => revenue.retailCommerceConnectors.find((connector) => connector.id === order.connectorId)?.channel === channel);
    result[channel] = { count: orders.length, value: round2(orders.reduce((sum, order) => sum + order.totalAmount, 0)) };
    return result;
  }, {} as Record<RetailCommerceChannel, { count: number; value: number }>);

  // Completed sales calculations — grandTotal is in taxPreview
  const completedSales = sales.filter((s) => s.status === 'completed');
  const aggregateGrossSales = round2(completedSales.reduce((sum, s) => sum + s.taxPreview.grandTotal, 0));
  const costedSales = completedSales.filter((sale) => Number.isFinite(sale.costTotal));
  const aggregateCostedSales = round2(costedSales.reduce((sum, s) => sum + s.taxPreview.grandTotal, 0));
  const aggregateCogs = round2(costedSales.reduce((sum, s) => sum + (s.costTotal ?? 0), 0));
  const aggregateNetProfit = round2(aggregateCostedSales - aggregateCogs);
  const overallMarginPct = aggregateCostedSales > 0 ? round2((aggregateNetProfit / aggregateCostedSales) * 100) : 0;
  const profitCostCoveragePct = completedSales.length > 0 ? round2((costedSales.length / completedSales.length) * 100) : 0;

  // Active shifts and variance tracking
  // shift.variance is the optional numeric variance; shift.status is 'open' | 'close-requested' | 'closed'
  const activeCashierShiftsCount = shifts.filter((s) => s.status === 'open').length;
  const unresolvedVarianceCount = shifts.filter((s) =>
    s.variance !== undefined && Math.abs(s.variance) > 0 && s.status !== 'closed',
  ).length;

  // One SKU may have several bin balances. The operator-facing stockout KPI
  // is a product/variant count, not a count of empty storage rows.
  const stockoutItemsCount = new Set(
    binBalances.filter((balance) => balance.available <= 0).map((balance) => balance.itemVariantId),
  ).size;

  // Expiry risk: use InventoryBatch records. InventoryBatch.expiresAt is the expiry field.
  // BinBalance.available is used as the quantity proxy for whether stock is actually on hand.
  const batches = revenue.inventoryBatches;
  const todayDate = parseBusinessDate(toIndiaBusinessDate(now.toISOString()));
  const thirtyDaysLater = todayDate ? addBusinessDays(todayDate, 30) : undefined;
  const expiryRiskItemsCount = batches.filter((batch) => {
    const expiresAt = parseBusinessDate(batch.expiresAt);
    return batch.status === 'released'
      && expiresAt !== undefined
      && todayDate !== undefined
      && thirtyDaysLater !== undefined
      && expiresAt >= todayDate
      && expiresAt <= thirtyDaysLater;
  }).length;

  // Store performance grouping by counter
  const storePerformance: StorePerformanceMetric[] = counters.map((counter) => {
    const counterSales = completedSales.filter((s) => s.counterId === counter.id);
    const storeGross = round2(counterSales.reduce((sum, s) => sum + s.taxPreview.grandTotal, 0));
    const costedCounterSales = counterSales.filter((sale) => Number.isFinite(sale.costTotal));
    const costedStoreGross = round2(costedCounterSales.reduce((sum, s) => sum + s.taxPreview.grandTotal, 0));
    const storeCogs = round2(costedCounterSales.reduce((sum, s) => sum + (s.costTotal ?? 0), 0));
    const storeProfit = round2(costedStoreGross - storeCogs);
    const storeMarginPct = costedStoreGross > 0 ? round2((storeProfit / costedStoreGross) * 100) : 0;

    const counterShifts = shifts.filter((s) => s.counterId === counter.id);
    const storeVariance = round2(counterShifts.reduce((sum, s) => sum + Math.abs(s.variance ?? 0), 0));

    return {
      storeId: counter.id,
      storeName: counter.name || counter.code,
      grossSalesAmount: storeGross,
      netSalesAmount: storeGross,
      costOfGoodsSold: storeCogs,
      grossProfitAmount: storeProfit,
      grossMarginPct: storeMarginPct,
      totalOrdersCount: counterSales.length,
      averageBasketValue: counterSales.length > 0 ? round2(storeGross / counterSales.length) : 0,
      cashVarianceAmount: storeVariance,
      stockoutItemsCount,
      expiryRiskItemsCount,
      onlinePendingOrdersCount: 0,
    };
  });

  // Staff performance grouping
  const staffMap = new Map<string, typeof completedSales>();
  completedSales.forEach((sale) => {
    const cashier = sale.cashierId || 'cashier-main';
    const list = staffMap.get(cashier) ?? [];
    list.push(sale);
    staffMap.set(cashier, list);
  });

  const staffPerformance: StaffPerformanceRow[] = Array.from(staffMap.entries()).map(([staffId, staffSales]) => {
    const totalRev = round2(staffSales.reduce((sum, s) => sum + s.taxPreview.grandTotal, 0));
    const staffShifts = shifts.filter((s) => s.cashierId === staffId);
    const varianceCount = staffShifts.filter((s) => s.variance !== undefined && Math.abs(s.variance) > 0).length;
    const varianceTotal = round2(staffShifts.reduce((sum, s) => sum + Math.abs(s.variance ?? 0), 0));

    return {
      staffId,
      staffName: staffId.replace('user-', 'Staff ').replace('cashier-', 'Cashier '),
      role: 'Counter Cashier',
      completedSalesCount: staffSales.length,
      totalRevenueGenerated: totalRev,
      averageTransactionValue: staffSales.length > 0 ? round2(totalRev / staffSales.length) : 0,
      cashVarianceCount: varianceCount,
      cashVarianceTotalAmount: varianceTotal,
    };
  });

  const attentionQueue: RetailCommandAttention[] = [];
  const addAttention = (item: RetailCommandAttention) => attentionQueue.push(item);

  const unresolvedVarianceShifts = shifts.filter((shift) => shift.variance !== undefined && Math.abs(shift.variance) > 0 && shift.status !== 'closed');
  if (unresolvedVarianceCount > 0) {
    const amount = round2(unresolvedVarianceShifts.reduce((sum, shift) => sum + Math.abs(shift.variance ?? 0), 0));
    const severity: RetailCommandAttentionSeverity = amount >= 2000 ? 'critical' : 'high';
    addAttention({ id: 'command-cash-variance', kind: 'cash-variance', severity, priorityScore: (severity === 'critical' ? 100 : 80) + Math.min(20, amount / 1000), count: unresolvedVarianceCount, amount, summary: `${unresolvedVarianceCount} cashier shift${unresolvedVarianceCount === 1 ? '' : 's'} need variance review.`, action: 'Review the shift close, variance, and independent finance evidence before closing the drawer.' });
  }

  const protectedMarginPct = 10;
  const marginRiskSales = completedSales.filter((sale) => {
    const netValue = Math.max(0, sale.subtotal - sale.discountTotal);
    return netValue > 0 && Number.isFinite(sale.costTotal) && ((netValue - sale.costTotal) / netValue) * 100 < protectedMarginPct;
  });
  if (marginRiskSales.length > 0) {
    const amount = round2(marginRiskSales.reduce((sum, sale) => {
      const netValue = Math.max(0, sale.subtotal - sale.discountTotal);
      const actualContribution = netValue - sale.costTotal;
      return sum + Math.max(0, netValue * protectedMarginPct / 100 - actualContribution);
    }, 0));
    const negativeMargin = marginRiskSales.some((sale) => sale.subtotal - sale.discountTotal - sale.costTotal < 0);
    const severity: RetailCommandAttentionSeverity = negativeMargin ? 'critical' : 'high';
    addAttention({ id: 'command-margin-erosion', kind: 'margin-erosion', severity, priorityScore: (negativeMargin ? 90 : 70) + Math.min(20, amount / 1000), count: marginRiskSales.length, amount, summary: `${marginRiskSales.length} sale${marginRiskSales.length === 1 ? '' : 's'} fell below the ${protectedMarginPct}% margin floor.`, action: 'Review cost, price, and discount evidence before releasing the margin.' });
  }

  if (stockoutItemsCount > 0) {
    addAttention({ id: 'command-stockout', kind: 'stockout', severity: 'high', priorityScore: 60 + Math.min(20, stockoutItemsCount), count: stockoutItemsCount, amount: 0, summary: `${stockoutItemsCount} item${stockoutItemsCount === 1 ? '' : 's'} are out of stock at a counter bin.`, action: 'Open replenishment planning and reserve an approved purchase quantity.' });
  }
  if (expiryRiskItemsCount > 0) {
    addAttention({ id: 'command-expiry', kind: 'expiry', severity: 'high', priorityScore: 55 + Math.min(20, expiryRiskItemsCount), count: expiryRiskItemsCount, amount: 0, summary: expiryRiskItemsCount === 1 ? '1 released batch expires within 30 days.' : `${expiryRiskItemsCount} released batches expire within 30 days.`, action: 'Prioritise FEFO clearance or a governed markdown before expiry.' });
  }
  if (onlinePendingOrdersCount > 0) {
    addAttention({ id: 'command-omnichannel', kind: 'omnichannel', severity: 'medium', priorityScore: 40 + Math.min(20, onlinePendingOrdersCount), count: onlinePendingOrdersCount, amount: onlinePendingOrderValue, summary: `${onlinePendingOrdersCount} online order${onlinePendingOrdersCount === 1 ? '' : 's'} await confirmation or fulfilment.`, action: 'Open the unified order desk and reserve stock before accepting more demand.' });
  }

  attentionQueue.sort((left, right) => right.priorityScore - left.priorityScore || left.id.localeCompare(right.id));
  const attentionItems = attentionQueue.map((item) => item.summary);

  return {
    generatedAt: new Date().toISOString(),
    period,
    totalStoresCount: counters.length || 1,
    aggregateGrossSales,
    aggregateNetProfit,
    overallMarginPct,
    profitCostCoveragePct,
    onlinePendingOrdersCount,
    onlinePendingOrderValue,
    channelPendingOrders,
    activeCashierShiftsCount,
    unresolvedVarianceCount,
    totalStockoutCount: stockoutItemsCount,
    totalExpiryRiskItemsCount: expiryRiskItemsCount,
    storePerformance,
    staffPerformance,
    attentionQueue,
    attentionItems,
  };
}
