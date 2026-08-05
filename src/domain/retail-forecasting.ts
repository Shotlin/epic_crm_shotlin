/**
 * retail-forecasting.ts
 *
 * Pillar 3 – Demand Forecasting, Seasonality & Smart Replenishment Engine
 *
 * Calculates projected SKU demand considering historical sales velocity, Indian festival multipliers
 * (Diwali, Navratri, Eid, Christmas), supplier lead time, and cash constraints.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type IndianFestivalSeason = 'diwali-dhanteras' | 'navratri-durga' | 'eid-ul-fitr' | 'new-year-xmas' | 'none';

export interface SkuSalesHistory {
  itemVariantId: string;
  sku: string;
  name: string;
  categoryName: string;
  sales30DaysQty: number;
  sales60DaysQty: number;
  sales90DaysQty: number;
  currentAvailableQty: number;
  /** Quantity physically available but not safe to count toward demand coverage because it is expiring soon or already expired. */
  expiryRiskQty?: number;
  /** Quantity already ordered and expected inbound; this is never treated as on-hand stock. */
  inboundQty?: number;
  supplierLeadTimeDays: number;
  unitCost: number;
}

export interface DemandForecastResult {
  itemVariantId: string;
  sku: string;
  name: string;
  dailySalesVelocity: number;
  forecastPeriodDays: number;
  baseDemandQty: number;
  festivalMultiplier: number;
  activeFestival: IndianFestivalSeason;
  adjustedDemandQty: number;
  safetyStockQty: number;
  reorderPointQty: number;
  safeAvailableQty: number;
  inboundQty: number;
  netAvailableQty: number;
  expiryRiskQty: number;
  suggestedReorderQty: number;
  estimatedReorderCost: number;
  stockoutRiskDays: number; // days until stockout if no reorder
  /** Direction of the recent 30-day velocity versus the 90-day baseline. */
  trendDirection: 'rising' | 'stable' | 'falling';
  /** Percentage change between recent and 90-day daily velocity, rounded to 2 decimals. */
  trendPercent: number;
  /** Evidence quality based on the amount of completed history available. */
  confidence: 'high' | 'medium' | 'low';
  urgency: 'critical-reorder' | 'normal-reorder' | 'stock-adequate' | 'overstocked';
}

/**
 * Gets seasonal demand multiplier for Indian retail peak periods.
 */
export function getFestivalMultiplier(festival: IndianFestivalSeason): number {
  switch (festival) {
    case 'diwali-dhanteras': return 2.5; // 250% demand surge
    case 'navratri-durga': return 1.8;   // 180% demand surge
    case 'eid-ul-fitr': return 1.7;      // 170% demand surge
    case 'new-year-xmas': return 1.5;    // 150% demand surge
    default: return 1.0;
  }
}

/**
 * Computes demand forecast and smart reorder quantities for a SKU.
 */
export function computeSkuDemandForecast(
  history: SkuSalesHistory,
  forecastPeriodDays = 30,
  festival: IndianFestivalSeason = 'none',
  cashBudgetLimit?: number,
): DemandForecastResult {
  // Velocity = average daily sales over last 30 days
  const dailySalesVelocity = round2(history.sales30DaysQty / 30);
  const baselineDailyVelocity = history.sales90DaysQty / 90;
  const trendPercent = baselineDailyVelocity > 0 ? round2(((dailySalesVelocity - baselineDailyVelocity) / baselineDailyVelocity) * 100) : dailySalesVelocity > 0 ? 100 : 0;
  const trendDirection: DemandForecastResult['trendDirection'] = trendPercent >= 10 ? 'rising' : trendPercent <= -10 ? 'falling' : 'stable';
  const confidence: DemandForecastResult['confidence'] = history.sales90DaysQty >= 30 ? 'high' : history.sales30DaysQty > 0 ? 'medium' : 'low';
  const festivalMultiplier = getFestivalMultiplier(festival);

  const baseDemandQty = round2(dailySalesVelocity * forecastPeriodDays);
  const adjustedDemandQty = Math.ceil(baseDemandQty * festivalMultiplier);
  const expiryRiskQty = Math.max(0, round2(history.expiryRiskQty ?? 0));
  const safeAvailableQty = Math.max(0, round2(history.currentAvailableQty - expiryRiskQty));
  const inboundQty = Math.max(0, round2(history.inboundQty ?? 0));
  const netAvailableQty = round2(safeAvailableQty + inboundQty);

  // Lead-time demand & Safety stock (using 1.65 z-score for 95% service level)
  const leadTimeDemand = dailySalesVelocity * history.supplierLeadTimeDays;
  const safetyStockQty = Math.ceil(dailySalesVelocity * Math.sqrt(history.supplierLeadTimeDays) * 1.5);
  const reorderPointQty = Math.ceil(leadTimeDemand + safetyStockQty);

  let suggestedReorderQty = Math.max(0, Math.ceil(adjustedDemandQty + safetyStockQty - netAvailableQty));
  let estimatedReorderCost = round2(suggestedReorderQty * history.unitCost);

  // Apply cash budget constraint if specified
  if (cashBudgetLimit && estimatedReorderCost > cashBudgetLimit && history.unitCost > 0) {
    suggestedReorderQty = Math.floor(cashBudgetLimit / history.unitCost);
    estimatedReorderCost = round2(suggestedReorderQty * history.unitCost);
  }

  const stockoutRiskDays = dailySalesVelocity > 0 ? round2(safeAvailableQty / dailySalesVelocity) : 999;

  let urgency: DemandForecastResult['urgency'] = 'stock-adequate';
  if (safeAvailableQty <= 0) {
    urgency = 'critical-reorder';
  } else if (netAvailableQty <= reorderPointQty) {
    urgency = 'normal-reorder';
  } else if (netAvailableQty > adjustedDemandQty * 2) {
    urgency = 'overstocked';
  }

  return {
    itemVariantId: history.itemVariantId,
    sku: history.sku,
    name: history.name,
    dailySalesVelocity,
    forecastPeriodDays,
    baseDemandQty,
    festivalMultiplier,
    activeFestival: festival,
    adjustedDemandQty,
    safetyStockQty,
    reorderPointQty,
    safeAvailableQty,
    inboundQty,
    netAvailableQty,
    expiryRiskQty,
    suggestedReorderQty,
    estimatedReorderCost,
    stockoutRiskDays,
    trendDirection,
    trendPercent,
    confidence,
    urgency,
  };
}
