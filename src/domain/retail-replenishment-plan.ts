import { computeSkuDemandForecast, type DemandForecastResult, type IndianFestivalSeason, type SkuSalesHistory } from './retail-forecasting';

export interface RetailPlanningVariant {
  id: string;
  sku: string;
  name: string;
  active: boolean;
}

export interface RetailPlanningSale {
  status: 'processing' | 'completed';
  saleAt: string;
  lines: Array<{ itemVariantId: string; quantity: number }>;
}

export interface RetailPlanningBalance {
  itemVariantId: string;
  available: number;
  unitCost: number;
  batchId?: string;
  expiresAt?: string;
}

export interface DeriveRetailReplenishmentItemsInput {
  asOf: string;
  defaultLeadTimeDays: number;
  variants: RetailPlanningVariant[];
  sales: RetailPlanningSale[];
  balances: RetailPlanningBalance[];
  leadTimeDaysByVariant?: Record<string, number | undefined>;
  inboundByVariant?: Record<string, number | undefined>;
  expirySafetyDays?: number;
}

export type RetailReplenishmentItem = SkuSalesHistory;

export type RetailReplenishmentPlanStatus = 'funded' | 'partially-funded' | 'budget-held' | 'cost-unavailable' | 'no-replenishment';

export interface RetailReplenishmentPlanRow {
  itemVariantId: string;
  sku: string;
  name: string;
  forecast: DemandForecastResult;
  candidateQuantity: number;
  candidateCostInr: number;
  plannedQuantity: number;
  plannedCostInr: number;
  deferredQuantity: number;
  status: RetailReplenishmentPlanStatus;
  nextAction: string;
}

export interface RetailReplenishmentPlanInput {
  items: RetailReplenishmentItem[];
  forecastPeriodDays: number;
  festival: IndianFestivalSeason;
  cashBudgetInr: number;
}

export interface RetailReplenishmentPlan {
  festival: IndianFestivalSeason;
  forecastPeriodDays: number;
  budgetInr: number;
  plannedCostInr: number;
  remainingBudgetInr: number;
  rows: RetailReplenishmentPlanRow[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseTimestamp(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} must be a valid ISO timestamp.`);
  return timestamp;
}

function quantityInWindow(sales: RetailPlanningSale[], itemVariantId: string, from: number, asOf: number): number {
  return sales.reduce((total, sale) => {
    if (sale.status !== 'completed') return total;
    const saleAt = parseTimestamp(sale.saleAt, 'Sale timestamp');
    if (saleAt < from || saleAt > asOf) return total;
    return total + sale.lines.filter((line) => line.itemVariantId === itemVariantId).reduce((lineTotal, line) => lineTotal + line.quantity, 0);
  }, 0);
}

/**
 * Converts governed completed counter-sale and bin-balance evidence into the
 * normalized history expected by the forecasting engine. Processing sales are
 * deliberately excluded: an abandoned or incomplete checkout cannot drive a
 * purchase recommendation.
 */
export function deriveRetailReplenishmentItems(input: DeriveRetailReplenishmentItemsInput): RetailReplenishmentItem[] {
  const asOf = parseTimestamp(input.asOf, 'As-of timestamp');
  if (!Number.isInteger(input.defaultLeadTimeDays) || input.defaultLeadTimeDays < 1 || input.defaultLeadTimeDays > 365) {
    throw new Error('Default supplier lead time must be between 1 and 365 days.');
  }
  const expirySafetyDays = input.expirySafetyDays ?? 14;
  if (!Number.isInteger(expirySafetyDays) || expirySafetyDays < 0 || expirySafetyDays > 365) throw new Error('Expiry safety window must be between 0 and 365 days.');

  return input.variants.filter((variant) => variant.active).map((variant) => {
    const balances = input.balances.filter((balance) => balance.itemVariantId === variant.id);
    const positiveBalances = balances.filter((balance) => balance.available > 0 && balance.unitCost > 0);
    const currentAvailableQty = money(balances.reduce((total, balance) => total + balance.available, 0));
    const expiryCutoff = asOf + expirySafetyDays * DAY_MS;
    const expiryRiskQty = money(balances.filter((balance) => balance.available > 0 && balance.expiresAt && Number.isFinite(Date.parse(balance.expiresAt)) && Date.parse(balance.expiresAt) <= expiryCutoff).reduce((total, balance) => total + balance.available, 0));
    const knownCostQuantity = positiveBalances.reduce((total, balance) => total + balance.available, 0);
    const unitCost = knownCostQuantity > 0
      ? money(positiveBalances.reduce((total, balance) => total + balance.available * balance.unitCost, 0) / knownCostQuantity)
      : 0;
    const configuredLeadTime = input.leadTimeDaysByVariant?.[variant.id] ?? input.defaultLeadTimeDays;
    if (!Number.isInteger(configuredLeadTime) || configuredLeadTime < 1 || configuredLeadTime > 365) {
      throw new Error(`Supplier lead time for ${variant.sku} must be between 1 and 365 days.`);
    }

    return {
      itemVariantId: variant.id,
      sku: variant.sku,
      name: variant.name,
      categoryName: 'Retail catalog',
      sales30DaysQty: money(quantityInWindow(input.sales, variant.id, asOf - 30 * DAY_MS, asOf)),
      sales60DaysQty: money(quantityInWindow(input.sales, variant.id, asOf - 60 * DAY_MS, asOf)),
      sales90DaysQty: money(quantityInWindow(input.sales, variant.id, asOf - 90 * DAY_MS, asOf)),
      currentAvailableQty,
      expiryRiskQty,
      inboundQty: Math.max(0, money(input.inboundByVariant?.[variant.id] ?? 0)),
      supplierLeadTimeDays: configuredLeadTime,
      unitCost,
    };
  });
}

const urgencyRank: Record<DemandForecastResult['urgency'], number> = {
  'critical-reorder': 0,
  'normal-reorder': 1,
  'stock-adequate': 2,
  overstocked: 3,
};

/**
 * Produces one transparent, INR-capped purchase plan. The cash limit is shared
 * across every SKU, so an urgent stockout is funded before a lower-risk refill.
 */
export function buildRetailReplenishmentPlan(input: RetailReplenishmentPlanInput): RetailReplenishmentPlan {
  if (!Number.isFinite(input.cashBudgetInr) || input.cashBudgetInr < 0) throw new Error('Cash budget must be a non-negative INR amount.');
  if (!Number.isInteger(input.forecastPeriodDays) || input.forecastPeriodDays < 1 || input.forecastPeriodDays > 365) {
    throw new Error('Forecast period must be between 1 and 365 days.');
  }

  let remainingBudgetInr = money(input.cashBudgetInr);
  const candidates = input.items.map((item) => ({ item, forecast: computeSkuDemandForecast(item, input.forecastPeriodDays, input.festival) }))
    .sort((left, right) => urgencyRank[left.forecast.urgency] - urgencyRank[right.forecast.urgency] || left.item.sku.localeCompare(right.item.sku));

  const rows = candidates.map(({ item, forecast }): RetailReplenishmentPlanRow => {
    const candidateQuantity = forecast.suggestedReorderQty;
    const candidateCostInr = money(candidateQuantity * item.unitCost);
    if (candidateQuantity === 0) {
      return { itemVariantId: item.itemVariantId, sku: item.sku, name: item.name, forecast, candidateQuantity, candidateCostInr, plannedQuantity: 0, plannedCostInr: 0, deferredQuantity: 0, status: 'no-replenishment', nextAction: forecast.urgency === 'overstocked' ? 'Hold purchasing and review excess stock.' : forecast.inboundQty > 0 ? 'Inbound purchase quantity covers the projected demand; verify supplier delivery.' : 'No replenishment is required from current sales and stock evidence.' };
    }
    if (item.unitCost <= 0) {
      return { itemVariantId: item.itemVariantId, sku: item.sku, name: item.name, forecast, candidateQuantity, candidateCostInr, plannedQuantity: 0, plannedCostInr: 0, deferredQuantity: candidateQuantity, status: 'cost-unavailable', nextAction: 'Confirm supplier cost before funding this replenishment.' };
    }

    const plannedQuantity = Math.min(candidateQuantity, Math.floor(remainingBudgetInr / item.unitCost));
    const plannedCostInr = money(plannedQuantity * item.unitCost);
    remainingBudgetInr = money(remainingBudgetInr - plannedCostInr);
    const deferredQuantity = candidateQuantity - plannedQuantity;
    const status: RetailReplenishmentPlanStatus = plannedQuantity === candidateQuantity ? 'funded' : plannedQuantity > 0 ? 'partially-funded' : 'budget-held';
    const expiryAction = forecast.expiryRiskQty > 0 ? ' Prioritise FEFO clearance or markdown for expiry-risk stock.' : '';
    const nextAction = status === 'funded'
      ? 'Create or update a governed purchase requisition.'
      : status === 'partially-funded'
        ? 'Raise a partial requisition and obtain budget approval for the deferred quantity.'
        : 'Escalate the budget hold before promising this SKU to another channel.';
    return { itemVariantId: item.itemVariantId, sku: item.sku, name: item.name, forecast, candidateQuantity, candidateCostInr, plannedQuantity, plannedCostInr, deferredQuantity, status, nextAction: `${nextAction}${expiryAction}` };
  });

  return { festival: input.festival, forecastPeriodDays: input.forecastPeriodDays, budgetInr: money(input.cashBudgetInr), plannedCostInr: money(input.cashBudgetInr - remainingBudgetInr), remainingBudgetInr, rows };
}
