/**
 * retail-reports.ts
 *
 * Phase R6 – Retail Reporting & Analytics Engine
 *
 * Pure computation functions. All inputs are immutable snapshots; no side
 * effects. Each function is independently testable and runs entirely
 * client-side from the renderer's RevenueOpsSnapshot.
 *
 * Reports delivered:
 *   1. X-Report   – mid-shift snapshot (tender totals, basket KPIs)
 *   2. Z-Report   – shift-close reconciliation (shift variance, totals)
 *   3. Counter Daily Summary – revenue / COGS / gross margin per counter
 *   4. Category Sales Report – revenue breakdown by catalog category
 *   5. Tender Breakdown Report – cash / UPI / card / store-credit split
 *   6. GST Summary Report – taxable value + CGST / SGST / IGST / Cess by rate
 *   7. SKU Margin & Sell-Through Report – margin % and sell-through per variant
 */

import type { RetailSale, RetailCashierShift, RetailReturn } from '../shared/retail-pos-contracts';
import type { DiscountPolicy, PaymentReceipt, ProjectedPayrollRun, Receivable } from '../shared/revenue-ops-contracts';
import type { RetailPromotionRedemption } from '../shared/retail-promotion-contracts';
import type { RetailCommissionPayoutBatch, RetailCustomerVisit, RetailSalesCommission } from '../shared/retail-customer-ops-contracts';
import type { RetailExchange } from '../shared/retail-exchange-contracts';
import type { RetailCreditNoteReconciliation } from '../shared/retail-credit-note-contracts';
import type { RetailCommerceCapability, RetailCommerceConnector, RetailCommerceConflictResolution, RetailCommerceConformanceCase, RetailCommerceOrder, RetailCommercePushBatch, RetailCommerceSyncRun, RetailOcrDocumentKind, RetailOcrProviderProfile, RetailPurchaseException, RetailPurchaseOcrDocument, RetailPurchaseOcrMapping, RetailSettlementAllocationPack, RetailSettlementReconciliation, RetailSettlementWithholdingEvidence } from '../shared/retail-commerce-contracts';
import { retailCommerceConformanceMatchesCredentialRevision, retailOcrEvidenceMatchesCredentialRevision } from '../shared/retail-commerce-contracts';
import type { RetailInterBranchTransfer } from '../shared/retail-interbranch-contracts';
import type { RetailProviderReadiness } from './retail-provider-readiness';
import type { RetailReportDeliveryAttempt, RetailReportDeliveryPlan } from '../shared/report-delivery-contracts';
import type { ProviderConformanceCase, ProviderConnector, ProviderPaymentRail, ProviderReconciliationRun, ProviderSubmission } from '../shared/provider-contracts';
import { providerConformanceMatchesCredentialRevision } from '../shared/provider-contracts';
import type { BankStatementLine, CreditLimitControl } from '../shared/collections-finance-contracts';
import type { RetailCatalogCategory, RetailMerchandisingProfile } from '../shared/retail-catalog-contracts';
import type { ItemVariant, BinBalance, InventoryBatch, InventoryItem, StorageBin, Warehouse, WarehouseZone } from '../shared/inventory-contracts';
import type { RetailDeviceTransportEvidence, RetailDeviceTransportPreflightResult, RetailPhysicalDeviceKind } from '../shared/retail-device-transport-contracts';
import type { RetailOfflineSaleQueueItem, RetailOfflineSyncReceipt } from '../shared/retail-offline-sync-contracts';
import type { OperationalHealthSnapshot } from '../shared/kernel-contracts';
import type { RetailCertificationFreshnessReport } from './retail-certification-freshness';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Round to 2 decimal places (bankers-safe for INR paise). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isoDate(isoString: string): string {
  return isoString.slice(0, 10);
}

function salesTotalTender(sale: RetailSale, method: string): number {
  return sale.tenders.filter((t) => t.method === method).reduce((s, t) => s + t.amount, 0);
}

// ---------------------------------------------------------------------------
// 1. X-Report – mid-shift snapshot
// ---------------------------------------------------------------------------

export interface XReportInput {
  shift: RetailCashierShift;
  /** All completed sales in the system – will be filtered to this shift. */
  allSales: RetailSale[];
}

export interface XReportLine {
  method: string;
  count: number;
  total: number;
}

export interface XReport {
  shiftId: string;
  shiftNumber: string;
  cashierId: string;
  counterId: string;
  openedAt: string;
  /** ISO timestamp when this snapshot was generated. */
  snapshotAt: string;
  saleCount: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  costTotal: number;
  grossProfit: number;
  grossMarginPct: number;
  averageBasket: number;
  tenderLines: XReportLine[];
}

export function computeXReport({ shift, allSales }: XReportInput): XReport {
  const shiftSales = allSales.filter(
    (s) => s.cashierShiftId === shift.id && s.status === 'completed',
  );

  const saleCount = shiftSales.length;
  const subtotal = round2(shiftSales.reduce((s, sale) => s + sale.subtotal, 0));
  const discountTotal = round2(shiftSales.reduce((s, sale) => s + sale.discountTotal, 0));
  const taxTotal = round2(shiftSales.reduce((s, sale) => s + sale.taxPreview.totalTax, 0));
  const grandTotal = round2(shiftSales.reduce((s, sale) => s + sale.taxPreview.grandTotal, 0));
  const costTotal = round2(shiftSales.reduce((s, sale) => s + sale.costTotal, 0));
  const grossProfit = round2(grandTotal - costTotal);
  const grossMarginPct = grandTotal > 0 ? round2((grossProfit / grandTotal) * 100) : 0;
  const averageBasket = saleCount > 0 ? round2(grandTotal / saleCount) : 0;

  const methods = ['cash', 'upi', 'card', 'store-credit', 'cheque', 'other'];
  const tenderLines: XReportLine[] = methods
    .map((method) => {
      const methodSales = shiftSales.filter((s) => s.tenders.some((t) => t.method === method));
      return {
        method,
        count: methodSales.length,
        total: round2(shiftSales.reduce((s, sale) => s + salesTotalTender(sale, method), 0)),
      };
    })
    .filter((l) => l.total > 0 || l.count > 0);

  return {
    shiftId: shift.id,
    shiftNumber: shift.number,
    cashierId: shift.cashierId,
    counterId: shift.counterId,
    openedAt: shift.openedAt,
    snapshotAt: new Date().toISOString(),
    saleCount,
    subtotal,
    discountTotal,
    taxTotal,
    grandTotal,
    costTotal,
    grossProfit,
    grossMarginPct,
    averageBasket,
    tenderLines,
  };
}

// ---------------------------------------------------------------------------
// 2. Z-Report – shift-close reconciliation
// ---------------------------------------------------------------------------

export interface ZReportInput {
  shift: RetailCashierShift;
  allSales: RetailSale[];
}

export interface ZReport extends XReport {
  openingCash: number;
  declaredCash: number | null;
  expectedCash: number | null;
  variance: number | null;
  status: RetailCashierShift['status'];
  closedAt: string | null;
}

export function computeZReport({ shift, allSales }: ZReportInput): ZReport {
  const x = computeXReport({ shift, allSales });
  return {
    ...x,
    openingCash: shift.openingCash,
    declaredCash: shift.declaredCash ?? null,
    expectedCash: shift.expectedCash ?? null,
    variance: shift.variance ?? null,
    status: shift.status,
    closedAt: shift.closedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// 3. Counter Daily Summary Report
// ---------------------------------------------------------------------------

export interface CounterSummaryInput {
  counterId: string;
  counterName: string;
  fromDate: string; // 'YYYY-MM-DD'
  toDate: string;   // 'YYYY-MM-DD'
  allSales: RetailSale[];
  allReturns: RetailReturn[];
}

export interface CounterDailySummaryRow {
  date: string;
  saleCount: number;
  returnCount: number;
  grossRevenue: number;
  returnValue: number;
  netRevenue: number;
  costTotal: number;
  grossProfit: number;
  grossMarginPct: number;
}

export interface CounterSummaryReport {
  counterId: string;
  counterName: string;
  fromDate: string;
  toDate: string;
  rows: CounterDailySummaryRow[];
  totals: Omit<CounterDailySummaryRow, 'date'>;
}

export function computeCounterSummary({
  counterId,
  counterName,
  fromDate,
  toDate,
  allSales,
  allReturns,
}: CounterSummaryInput): CounterSummaryReport {
  const counterSales = allSales.filter(
    (s) =>
      s.counterId === counterId &&
      s.status === 'completed' &&
      isoDate(s.saleAt) >= fromDate &&
      isoDate(s.saleAt) <= toDate,
  );
  const counterReturns = allReturns.filter(
    (r) =>
      r.counterId === counterId &&
      r.status === 'approved' &&
      isoDate(r.requestedAt) >= fromDate &&
      isoDate(r.requestedAt) <= toDate,
  );

  // Enumerate dates in range
  const dateSet = new Set<string>();
  counterSales.forEach((s) => dateSet.add(isoDate(s.saleAt)));
  counterReturns.forEach((r) => dateSet.add(isoDate(r.requestedAt)));
  const dates = Array.from(dateSet).sort();

  const rows: CounterDailySummaryRow[] = dates.map((date) => {
    const daySales = counterSales.filter((s) => isoDate(s.saleAt) === date);
    const dayReturns = counterReturns.filter((r) => isoDate(r.requestedAt) === date);
    const grossRevenue = round2(daySales.reduce((s, sale) => s + sale.taxPreview.grandTotal, 0));
    const returnValue = round2(
      dayReturns.reduce(
        (s, ret) => s + (ret.financialCredit?.issuedAmount ?? 0),
        0,
      ),
    );
    const netRevenue = round2(grossRevenue - returnValue);
    const costTotal = round2(daySales.reduce((s, sale) => s + sale.costTotal, 0));
    const grossProfit = round2(netRevenue - costTotal);
    const grossMarginPct = netRevenue > 0 ? round2((grossProfit / netRevenue) * 100) : 0;
    return {
      date,
      saleCount: daySales.length,
      returnCount: dayReturns.length,
      grossRevenue,
      returnValue,
      netRevenue,
      costTotal,
      grossProfit,
      grossMarginPct,
    };
  });

  const totals = rows.reduce(
    (acc, row) => ({
      saleCount: acc.saleCount + row.saleCount,
      returnCount: acc.returnCount + row.returnCount,
      grossRevenue: round2(acc.grossRevenue + row.grossRevenue),
      returnValue: round2(acc.returnValue + row.returnValue),
      netRevenue: round2(acc.netRevenue + row.netRevenue),
      costTotal: round2(acc.costTotal + row.costTotal),
      grossProfit: round2(acc.grossProfit + row.grossProfit),
      grossMarginPct: 0, // computed below
    }),
    {
      saleCount: 0,
      returnCount: 0,
      grossRevenue: 0,
      returnValue: 0,
      netRevenue: 0,
      costTotal: 0,
      grossProfit: 0,
      grossMarginPct: 0,
    },
  );
  totals.grossMarginPct =
    totals.netRevenue > 0 ? round2((totals.grossProfit / totals.netRevenue) * 100) : 0;

  return { counterId, counterName, fromDate, toDate, rows, totals };
}

// ---------------------------------------------------------------------------
// 4. Category Sales Report
// ---------------------------------------------------------------------------

export interface CategorySalesInput {
  allSales: RetailSale[];
  fromDate: string;
  toDate: string;
  /** Map from itemVariantId → catalogProductId → categoryId via merchandising profiles. */
  merchandisingProfiles: RetailMerchandisingProfile[];
  categories: RetailCatalogCategory[];
  /** itemId for each variant – map from variantId → itemId */
  variantItemMap: Record<string, string>;
}

export interface CategorySalesRow {
  categoryId: string;
  categoryName: string;
  lineCount: number;
  quantity: number;
  revenue: number;
  discountTotal: number;
  taxTotal: number;
  costTotal: number;
  grossProfit: number;
  grossMarginPct: number;
}

export interface CategorySalesReport {
  fromDate: string;
  toDate: string;
  rows: CategorySalesRow[];
}

export function computeCategorySales({
  allSales,
  fromDate,
  toDate,
  merchandisingProfiles,
  categories,
  variantItemMap,
}: CategorySalesInput): CategorySalesReport {
  // Build itemId → categoryId map via merchandising profiles
  const itemCategoryMap = new Map<string, string>();
  merchandisingProfiles.forEach((p) => itemCategoryMap.set(p.itemId, p.categoryId));

  const categoryMap = new Map<string, CategorySalesRow>();

  const filteredSales = allSales.filter(
    (s) =>
      s.status === 'completed' &&
      isoDate(s.saleAt) >= fromDate &&
      isoDate(s.saleAt) <= toDate,
  );

  filteredSales.forEach((sale) => {
    sale.lines.forEach((line) => {
      const itemId = variantItemMap[line.itemVariantId];
      const categoryId = (itemId && itemCategoryMap.get(itemId)) ?? '__uncategorised';
      const category = categories.find((c) => c.id === categoryId);
      const categoryName = category?.name ?? 'Uncategorised';

      let row = categoryMap.get(categoryId);
      if (!row) {
        row = {
          categoryId,
          categoryName,
          lineCount: 0,
          quantity: 0,
          revenue: 0,
          discountTotal: 0,
          taxTotal: 0,
          costTotal: 0,
          grossProfit: 0,
          grossMarginPct: 0,
        };
        categoryMap.set(categoryId, row);
      }
      row.lineCount += 1;
      row.quantity = round2(row.quantity + line.quantity);
      row.revenue = round2(row.revenue + line.lineTotal);
      row.discountTotal = round2(row.discountTotal + line.discountAmount);
      row.taxTotal = round2(
        row.taxTotal + (line.lineTotal - line.taxableValue - line.cessAmount),
      );
      // Checkout records a total for the entire sale line. Multiplying by
      // quantity again would overstate COGS for multi-unit/weighted lines.
      row.costTotal = round2(row.costTotal + line.lineCostTotal);
    });
  });

  const rows = Array.from(categoryMap.values()).map((row) => ({
    ...row,
    grossProfit: round2(row.revenue - row.costTotal),
    grossMarginPct: row.revenue > 0 ? round2(((row.revenue - row.costTotal) / row.revenue) * 100) : 0,
  }));

  rows.sort((a, b) => b.revenue - a.revenue);

  return { fromDate, toDate, rows };
}

// ---------------------------------------------------------------------------
// 5. Tender Breakdown Report
// ---------------------------------------------------------------------------

export interface TenderBreakdownInput {
  allSales: RetailSale[];
  fromDate: string;
  toDate: string;
}

export interface TenderBreakdownRow {
  method: string;
  transactionCount: number;
  saleCount: number;
  total: number;
  sharePct: number;
}

export interface TenderBreakdownReport {
  fromDate: string;
  toDate: string;
  grandTotal: number;
  rows: TenderBreakdownRow[];
}

export function computeTenderBreakdown({
  allSales,
  fromDate,
  toDate,
}: TenderBreakdownInput): TenderBreakdownReport {
  const filtered = allSales.filter(
    (s) =>
      s.status === 'completed' &&
      isoDate(s.saleAt) >= fromDate &&
      isoDate(s.saleAt) <= toDate,
  );

  const methods = ['cash', 'upi', 'card', 'store-credit', 'cheque', 'other'];
  const grandTotal = round2(filtered.reduce((s, sale) => s + sale.taxPreview.grandTotal, 0));

  const rows: TenderBreakdownRow[] = methods
    .map((method) => {
      const tenderEntries = filtered.flatMap((s) => s.tenders.filter((t) => t.method === method));
      const total = round2(tenderEntries.reduce((s, t) => s + t.amount, 0));
      const saleCount = filtered.filter((s) =>
        s.tenders.some((t) => t.method === method && t.amount > 0),
      ).length;
      return {
        method,
        transactionCount: tenderEntries.filter((t) => t.amount > 0).length,
        saleCount,
        total,
        sharePct: grandTotal > 0 ? round2((total / grandTotal) * 100) : 0,
      };
    })
    .filter((r) => r.total > 0 || r.saleCount > 0);

  return { fromDate, toDate, grandTotal, rows };
}

// ---------------------------------------------------------------------------
// 6. GST Summary Report
// ---------------------------------------------------------------------------

export interface GstSummaryInput {
  allSales: RetailSale[];
  fromDate: string;
  toDate: string;
}

export interface GstSummaryRow {
  /** GST rate as a percentage string e.g. "18%" */
  gstRate: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  invoiceCount: number;
}

export interface GstSummaryReport {
  fromDate: string;
  toDate: string;
  treatment: string;
  rows: GstSummaryRow[];
  totals: Omit<GstSummaryRow, 'gstRate'>;
}

export function computeGstSummary({
  allSales,
  fromDate,
  toDate,
}: GstSummaryInput): GstSummaryReport {
  const filtered = allSales.filter(
    (s) =>
      s.status === 'completed' &&
      isoDate(s.saleAt) >= fromDate &&
      isoDate(s.saleAt) <= toDate,
  );

  // Group lines by GST rate
  const rateMap = new Map<number, GstSummaryRow>();

  filtered.forEach((sale) => {
    sale.lines.forEach((line) => {
      const rate = line.gstRate;
      const rateKey = rate;
      let row = rateMap.get(rateKey);
      if (!row) {
        row = {
          gstRate: `${rate}%`,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          cess: 0,
          totalTax: 0,
          invoiceCount: 0,
        };
        rateMap.set(rateKey, row);
      }
      const isIntraState = sale.taxPreview.treatment === 'intra-state';
      const gstAmount = line.gstAmount ?? round2((line.taxableValue * rate) / 100);
      const halfGst = round2(gstAmount / 2);
      row.taxableValue = round2(row.taxableValue + line.taxableValue);
      if (isIntraState) {
        row.cgst = round2(row.cgst + halfGst);
        row.sgst = round2(row.sgst + halfGst);
      } else {
        row.igst = round2(row.igst + gstAmount);
      }
      row.cess = round2(row.cess + line.cessAmount);
      row.totalTax = round2(row.totalTax + gstAmount + line.cessAmount);
      row.invoiceCount += 1;
    });
  });

  const rows = Array.from(rateMap.values()).sort(
    (a, b) => parseFloat(a.gstRate) - parseFloat(b.gstRate),
  );

  const totals = rows.reduce(
    (acc, row) => ({
      taxableValue: round2(acc.taxableValue + row.taxableValue),
      cgst: round2(acc.cgst + row.cgst),
      sgst: round2(acc.sgst + row.sgst),
      igst: round2(acc.igst + row.igst),
      cess: round2(acc.cess + row.cess),
      totalTax: round2(acc.totalTax + row.totalTax),
      invoiceCount: acc.invoiceCount + row.invoiceCount,
    }),
    { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, totalTax: 0, invoiceCount: 0 },
  );

  const treatment = filtered[0]?.taxPreview.treatment ?? 'intra-state';

  return { fromDate, toDate, treatment, rows, totals };
}

// ---------------------------------------------------------------------------
// 7. SKU Margin & Sell-Through Report
// ---------------------------------------------------------------------------

export interface SkuMarginInput {
  allSales: RetailSale[];
  fromDate: string;
  toDate: string;
  variants: ItemVariant[];
  /** Opening stock balances at the start of the period (available quantity). */
  binBalances: BinBalance[];
}

export interface SkuMarginRow {
  itemVariantId: string;
  variantName: string;
  sku: string;
  quantitySold: number;
  openingStock: number;
  sellThroughPct: number;
  revenue: number;
  costTotal: number;
  grossProfit: number;
  grossMarginPct: number;
  averageSellingPrice: number;
}

export interface SkuMarginReport {
  fromDate: string;
  toDate: string;
  rows: SkuMarginRow[];
}

export function computeSkuMarginReport({
  allSales,
  fromDate,
  toDate,
  variants,
  binBalances,
}: SkuMarginInput): SkuMarginReport {
  const filtered = allSales.filter(
    (s) =>
      s.status === 'completed' &&
      isoDate(s.saleAt) >= fromDate &&
      isoDate(s.saleAt) <= toDate,
  );

  // Aggregate sales lines by variant
  const variantMap = new Map<
    string,
    { quantitySold: number; revenue: number; costTotal: number }
  >();

  filtered.forEach((sale) => {
    sale.lines.forEach((line) => {
      const existing = variantMap.get(line.itemVariantId) ?? {
        quantitySold: 0,
        revenue: 0,
        costTotal: 0,
      };
      existing.quantitySold = round2(existing.quantitySold + line.quantity);
      existing.revenue = round2(existing.revenue + line.lineTotal);
      // See Category Sales: this is already the whole-line COGS allocation.
      existing.costTotal = round2(existing.costTotal + line.lineCostTotal);
      variantMap.set(line.itemVariantId, existing);
    });
  });

  // Opening stock: sum of all bin balances for the variant
  const stockByVariant = new Map<string, number>();
  binBalances.forEach((b) => {
    const existing = stockByVariant.get(b.itemVariantId) ?? 0;
    stockByVariant.set(b.itemVariantId, existing + b.available);
  });

  const variantById = new Map(variants.map((v) => [v.id, v]));

  const rows: SkuMarginRow[] = Array.from(variantMap.entries()).map(
    ([itemVariantId, agg]) => {
      const variant = variantById.get(itemVariantId);
      const openingStock = stockByVariant.get(itemVariantId) ?? 0;
      const grossProfit = round2(agg.revenue - agg.costTotal);
      const grossMarginPct =
        agg.revenue > 0 ? round2((grossProfit / agg.revenue) * 100) : 0;
      const sellThroughPct =
        openingStock + agg.quantitySold > 0
          ? round2((agg.quantitySold / (openingStock + agg.quantitySold)) * 100)
          : 0;
      return {
        itemVariantId,
        variantName: variant?.name ?? itemVariantId,
        sku: variant?.sku ?? '',
        quantitySold: agg.quantitySold,
        openingStock,
        sellThroughPct,
        revenue: agg.revenue,
        costTotal: agg.costTotal,
        grossProfit,
        grossMarginPct,
        averageSellingPrice:
          agg.quantitySold > 0 ? round2(agg.revenue / agg.quantitySold) : 0,
      };
    },
  );

  rows.sort((a, b) => b.revenue - a.revenue);

  return { fromDate, toDate, rows };
}

// ---------------------------------------------------------------------------
// 8. Campaign Usage & Promotion ROI Report
// ---------------------------------------------------------------------------

export interface CampaignUsageInput {
  allRedemptions: RetailPromotionRedemption[];
  allSales: RetailSale[];
  policies: DiscountPolicy[];
  fromDate: string;
  toDate: string;
}

export interface CampaignUsageRow {
  policyId: string;
  code: string;
  name: string;
  campaignCode?: string;
  redemptionCount: number;
  uniqueSaleCount: number;
  discountTotal: number;
  giftQuantity: number;
  influencedRevenue: number;
  averageInfluencedBasket: number;
  effectiveDiscountRatePct: number;
}

export interface CampaignUsageReport {
  fromDate: string;
  toDate: string;
  totalRedemptions: number;
  totalDiscount: number;
  totalGiftQuantity: number;
  rows: CampaignUsageRow[];
}

export function computeCampaignUsage({ allRedemptions, allSales, policies, fromDate, toDate }: CampaignUsageInput): CampaignUsageReport {
  const salesById = new Map(allSales.filter((sale) => sale.status === 'completed').map((sale) => [sale.id, sale]));
  const filtered = allRedemptions.filter((redemption) => isoDate(redemption.redeemedAt) >= fromDate && isoDate(redemption.redeemedAt) <= toDate);
  const grouped = new Map<string, RetailPromotionRedemption[]>();
  filtered.forEach((redemption) => grouped.set(redemption.promotionPolicyId, [...(grouped.get(redemption.promotionPolicyId) ?? []), redemption]));
  const rows = Array.from(grouped.entries()).map(([policyId, redemptions]) => {
    const policy = policies.find((candidate) => candidate.id === policyId);
    const saleIds = new Set(redemptions.map(({ saleId }) => saleId));
    const influencedRevenue = round2(Array.from(saleIds).reduce((total, saleId) => total + (salesById.get(saleId)?.taxPreview.grandTotal ?? 0), 0));
    const discountTotal = round2(redemptions.reduce((total, redemption) => total + redemption.discountAmount, 0));
    const giftQuantity = redemptions.reduce((total, redemption) => total + redemption.giftQuantity, 0);
    return {
      policyId,
      code: policy?.code ?? policyId,
      name: policy?.name ?? 'Retired or unavailable campaign',
      campaignCode: policy?.campaignCode ?? redemptions.find(({ campaignCode }) => campaignCode)?.campaignCode,
      redemptionCount: redemptions.length,
      uniqueSaleCount: saleIds.size,
      discountTotal,
      giftQuantity,
      influencedRevenue,
      averageInfluencedBasket: saleIds.size ? round2(influencedRevenue / saleIds.size) : 0,
      effectiveDiscountRatePct: influencedRevenue > 0 ? round2((discountTotal / influencedRevenue) * 100) : 0,
    } satisfies CampaignUsageRow;
  }).sort((left, right) => right.influencedRevenue - left.influencedRevenue);
  return {
    fromDate,
    toDate,
    totalRedemptions: filtered.length,
    totalDiscount: round2(filtered.reduce((total, redemption) => total + redemption.discountAmount, 0)),
    totalGiftQuantity: filtered.reduce((total, redemption) => total + redemption.giftQuantity, 0),
    rows,
  };
}

// ---------------------------------------------------------------------------
// 9. Customer Visit Conversion Report
// ---------------------------------------------------------------------------

export interface CustomerVisitConversionInput {
  allVisits: RetailCustomerVisit[];
  allSales: RetailSale[];
  fromDate: string;
  toDate: string;
}

export interface CustomerVisitConversionRow {
  channel: RetailCustomerVisit['channel'];
  purpose: RetailCustomerVisit['purpose'];
  visitCount: number;
  convertedVisitCount: number;
  unconvertedVisitCount: number;
  conversionRatePct: number;
  influencedRevenue: number;
  averageInfluencedBasket: number;
}

export interface CustomerVisitConversionReport {
  fromDate: string;
  toDate: string;
  totalVisits: number;
  convertedVisits: number;
  unconvertedVisits: number;
  conversionRatePct: number;
  influencedRevenue: number;
  rows: CustomerVisitConversionRow[];
}

export function computeCustomerVisitConversion({ allVisits, allSales, fromDate, toDate }: CustomerVisitConversionInput): CustomerVisitConversionReport {
  const salesById = new Map(allSales.filter((sale) => sale.status === 'completed').map((sale) => [sale.id, sale]));
  const visits = allVisits.filter((visit) => isoDate(visit.visitedAt) >= fromDate && isoDate(visit.visitedAt) <= toDate);
  const grouped = new Map<string, RetailCustomerVisit[]>();
  visits.forEach((visit) => {
    const key = `${visit.channel}:${visit.purpose}`;
    grouped.set(key, [...(grouped.get(key) ?? []), visit]);
  });
  const rows = Array.from(grouped.entries()).map(([key, groupedVisits]) => {
    const [channel, purpose] = key.split(':') as [RetailCustomerVisit['channel'], RetailCustomerVisit['purpose']];
    const converted = groupedVisits.filter((visit) => Boolean(visit.convertedSaleId && salesById.has(visit.convertedSaleId)));
    const saleIds = new Set(converted.map((visit) => visit.convertedSaleId!).filter(Boolean));
    const influencedRevenue = round2([...saleIds].reduce((total, saleId) => total + (salesById.get(saleId)?.taxPreview.grandTotal ?? 0), 0));
    return {
      channel,
      purpose,
      visitCount: groupedVisits.length,
      convertedVisitCount: converted.length,
      unconvertedVisitCount: groupedVisits.length - converted.length,
      conversionRatePct: groupedVisits.length ? round2((converted.length / groupedVisits.length) * 100) : 0,
      influencedRevenue,
      averageInfluencedBasket: saleIds.size ? round2(influencedRevenue / saleIds.size) : 0,
    } satisfies CustomerVisitConversionRow;
  }).sort((left, right) => right.influencedRevenue - left.influencedRevenue || right.visitCount - left.visitCount);
  const convertedVisits = visits.filter((visit) => Boolean(visit.convertedSaleId && salesById.has(visit.convertedSaleId))).length;
  const saleIds = new Set(visits.map((visit) => visit.convertedSaleId).filter((id): id is string => Boolean(id && salesById.has(id))));
  const influencedRevenue = round2([...saleIds].reduce((total, saleId) => total + (salesById.get(saleId)?.taxPreview.grandTotal ?? 0), 0));
  return {
    fromDate,
    toDate,
    totalVisits: visits.length,
    convertedVisits,
    unconvertedVisits: visits.length - convertedVisits,
    conversionRatePct: visits.length ? round2((convertedVisits / visits.length) * 100) : 0,
    influencedRevenue,
    rows,
  };
}

// ---------------------------------------------------------------------------
// 10. Exchange + Credit-Note Readiness Report
// ---------------------------------------------------------------------------

export interface ExchangeCreditNoteReadinessInput {
  allExchanges: RetailExchange[];
  allCreditNotes: RetailCreditNoteReconciliation[];
  fromDate: string;
  toDate: string;
}

export type ExchangeControlStatus = 'none' | RetailExchange['status'];

export interface ExchangeCreditNoteReadinessRow {
  creditNoteId: string;
  creditNoteNumber: string;
  retailReturnId: string;
  retailReturnNumber: string;
  filingPeriod: string;
  status: RetailCreditNoteReconciliation['status'];
  exchangeStatus: ExchangeControlStatus;
  exchangeCount: number;
  approvedExchangeCount: number;
  taxableValue: number;
  totalTax: number;
  totalCredit: number;
  replacementRevenue: number;
  topUpValue: number;
  actionRequired: boolean;
}

export interface ExchangeCreditNoteReadinessReport {
  fromDate: string;
  toDate: string;
  totalExchanges: number;
  requestedExchanges: number;
  approvedExchanges: number;
  rejectedExchanges: number;
  replacementRevenue: number;
  exchangeTopUpValue: number;
  totalCreditNotes: number;
  matchedCreditNotes: number;
  pendingCreditNotes: number;
  driftCreditNotes: number;
  rejectedCreditNotes: number;
  missingCreditNotes: number;
  blockedCreditNotes: number;
  totalCreditValue: number;
  unpairedExchangeCount: number;
  rows: ExchangeCreditNoteReadinessRow[];
}

export function computeExchangeCreditNoteReadiness({ allExchanges, allCreditNotes, fromDate, toDate }: ExchangeCreditNoteReadinessInput): ExchangeCreditNoteReadinessReport {
  const inRange = (timestamp: string) => isoDate(timestamp) >= fromDate && isoDate(timestamp) <= toDate;
  const exchanges = allExchanges.filter(({ requestedAt }) => inRange(requestedAt));
  const creditNotes = allCreditNotes.filter(({ requestedAt }) => inRange(requestedAt));
  const exchangesByReturn = new Map<string, RetailExchange[]>();
  exchanges.forEach((exchange) => exchangesByReturn.set(exchange.retailReturnId, [...(exchangesByReturn.get(exchange.retailReturnId) ?? []), exchange]));
  const rows = creditNotes.map((creditNote) => {
    const linked = exchangesByReturn.get(creditNote.retailReturnId) ?? [];
    const approved = linked.filter(({ status }) => status === 'approved');
    const exchangeStatus: ExchangeControlStatus = linked.length === 0
      ? 'none'
      : linked.some(({ status }) => status === 'approved')
        ? 'approved'
        : linked.some(({ status }) => status === 'requested')
          ? 'requested'
          : 'rejected';
    const replacementRevenue = round2(approved.reduce((total, exchange) => total + exchange.replacementGrandTotal, 0));
    const topUpValue = round2(approved.reduce((total, exchange) => total + exchange.netTopUp, 0));
    return {
      creditNoteId: creditNote.id,
      creditNoteNumber: creditNote.number,
      retailReturnId: creditNote.retailReturnId,
      retailReturnNumber: creditNote.retailReturnNumber,
      filingPeriod: creditNote.filingPeriod,
      status: creditNote.status,
      exchangeStatus,
      exchangeCount: linked.length,
      approvedExchangeCount: approved.length,
      taxableValue: round2(creditNote.taxableValue),
      totalTax: round2(creditNote.totalTax),
      totalCredit: round2(creditNote.totalCredit),
      replacementRevenue,
      topUpValue,
      actionRequired: creditNote.status !== 'matched' || approved.length === 0,
    } satisfies ExchangeCreditNoteReadinessRow;
  }).sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || right.totalCredit - left.totalCredit);
  const statusCount = (status: RetailCreditNoteReconciliation['status']) => creditNotes.filter((creditNote) => creditNote.status === status).length;
  const approvedExchanges = exchanges.filter(({ status }) => status === 'approved');
  return {
    fromDate,
    toDate,
    totalExchanges: exchanges.length,
    requestedExchanges: exchanges.filter(({ status }) => status === 'requested').length,
    approvedExchanges: approvedExchanges.length,
    rejectedExchanges: exchanges.filter(({ status }) => status === 'rejected').length,
    replacementRevenue: round2(approvedExchanges.reduce((total, exchange) => total + exchange.replacementGrandTotal, 0)),
    exchangeTopUpValue: round2(approvedExchanges.reduce((total, exchange) => total + exchange.netTopUp, 0)),
    totalCreditNotes: creditNotes.length,
    matchedCreditNotes: statusCount('matched'),
    pendingCreditNotes: statusCount('prepared'),
    driftCreditNotes: statusCount('drift'),
    rejectedCreditNotes: statusCount('rejected'),
    missingCreditNotes: statusCount('missing'),
    blockedCreditNotes: creditNotes.filter(({ status }) => status !== 'matched').length,
    totalCreditValue: round2(creditNotes.reduce((total, creditNote) => total + creditNote.totalCredit, 0)),
    unpairedExchangeCount: exchanges.filter((exchange) => !creditNotes.some((creditNote) => creditNote.retailReturnId === exchange.retailReturnId)).length,
    rows,
  };
}

// ---------------------------------------------------------------------------
// 11. Marketplace / ONDC Settlement Readiness Report
// ---------------------------------------------------------------------------

export interface RetailChannelSettlementReadinessInput {
  connectors: RetailCommerceConnector[];
  settlements: RetailSettlementReconciliation[];
  allocations: RetailSettlementAllocationPack[];
  withholding: RetailSettlementWithholdingEvidence[];
  conflicts: RetailCommerceConflictResolution[];
  /** Optional order snapshot; when supplied, linked order lifecycle evidence is included in the exception queue. */
  orders?: RetailCommerceOrder[];
  fromDate: string;
  toDate: string;
}

export type RetailChannelSettlementState = 'ready' | 'internal-blocked' | 'external-certification';
export type RetailChannelSettlementExceptionKind = 'variance' | 'order-closure' | 'missing-allocation' | 'missing-withholding' | 'missing-journal' | 'open-conflict' | 'external-certification';

export interface RetailChannelSettlementException {
  settlementId: string;
  settlementNumber: string;
  settlementReference: string;
  connectorId: string;
  connectorCode: string;
  channel: RetailCommerceConnector['channel'];
  kind: RetailChannelSettlementExceptionKind;
  severity: 'high' | 'medium' | 'external';
  amount: number;
  action: string;
}

export interface RetailChannelSettlementReadinessRow {
  connectorId: string;
  connectorCode: string;
  connectorName: string;
  channel: RetailCommerceConnector['channel'];
  environment: RetailCommerceConnector['environment'];
  connectorState: RetailChannelSettlementState;
  settlementCount: number;
  readySettlementCount: number;
  matchedSettlementCount: number;
  resolvedSettlementCount: number;
  varianceReviewCount: number;
  rejectedSettlementCount: number;
  grossAmount: number;
  refundAmount: number;
  feeAmount: number;
  taxWithheldAmount: number;
  netAmount: number;
  varianceExposure: number;
  missingAllocationCount: number;
  missingWithholdingCount: number;
  orderClosureGapCount: number;
  journalReadyCount: number;
  openConflictCount: number;
  exceptionCount: number;
  actionRequired: boolean;
}

export interface RetailChannelSettlementReadinessReport {
  fromDate: string;
  toDate: string;
  connectorCount: number;
  settlementCount: number;
  readySettlementCount: number;
  blockedSettlementCount: number;
  matchedSettlementCount: number;
  resolvedSettlementCount: number;
  varianceReviewCount: number;
  rejectedSettlementCount: number;
  grossAmount: number;
  refundAmount: number;
  feeAmount: number;
  taxWithheldAmount: number;
  netAmount: number;
  varianceExposure: number;
  missingAllocationCount: number;
  missingWithholdingCount: number;
  orderClosureGapCount: number;
  openConflictCount: number;
  externalCertificationGates: number;
  exceptionCount: number;
  exceptions: RetailChannelSettlementException[];
  rows: RetailChannelSettlementReadinessRow[];
}

export function computeRetailChannelSettlementReadiness({ connectors, settlements, allocations, withholding, conflicts, orders, fromDate, toDate }: RetailChannelSettlementReadinessInput): RetailChannelSettlementReadinessReport {
  const inPeriod = (settlement: RetailSettlementReconciliation) => settlement.periodFrom <= toDate && settlement.periodTo >= fromDate;
  const eligibleConnectors = connectors.filter((connector) => connector.capabilities.includes('settlement-pull'));
  const connectorIds = new Set(eligibleConnectors.map(({ id }) => id));
  const periodSettlements = settlements.filter((settlement) => connectorIds.has(settlement.connectorId) && inPeriod(settlement));
  const allocationsBySettlement = new Map(allocations.map((allocation) => [allocation.settlementId, allocation]));
  const withholdingBySettlement = new Map(withholding.map((item) => [item.settlementId, item]));
  const ordersById = new Map((orders ?? []).map((order) => [order.id, order]));
  const settlementExceptions: RetailChannelSettlementException[] = [];
  const addException = (settlement: RetailSettlementReconciliation, connector: RetailCommerceConnector, kind: RetailChannelSettlementExceptionKind, severity: RetailChannelSettlementException['severity'], amount: number, action: string) => settlementExceptions.push({ settlementId: settlement.id, settlementNumber: settlement.number, settlementReference: settlement.settlementReference, connectorId: connector.id, connectorCode: connector.code, channel: connector.channel, kind, severity, amount: round2(amount), action });
  for (const settlement of periodSettlements) {
    const connector = eligibleConnectors.find((candidate) => candidate.id === settlement.connectorId);
    if (!connector) continue;
    if (Math.abs(settlement.varianceAmount) > 0.01) addException(settlement, connector, 'variance', 'high', Math.abs(settlement.varianceAmount), 'Investigate provider payout versus local net variance.');
    if (allocationsBySettlement.get(settlement.id)?.status !== 'approved') addException(settlement, connector, 'missing-allocation', 'high', settlement.netAmount, 'Prepare and independently approve the order-level settlement allocation.');
    if (settlement.taxWithheldAmount > 0 && withholdingBySettlement.get(settlement.id)?.status !== 'approved') addException(settlement, connector, 'missing-withholding', 'high', settlement.taxWithheldAmount, 'Attach and independently approve the TDS/TCS certificate and challan evidence.');
    if (!settlement.journalDraftId) addException(settlement, connector, 'missing-journal', 'medium', settlement.netAmount, 'Prepare the balanced marketplace settlement journal handoff.');
    if (conflicts.some((conflict) => conflict.connectorId === connector.id && conflict.sourceId === settlement.id && conflict.status === 'prepared')) addException(settlement, connector, 'open-conflict', 'high', Math.abs(settlement.varianceAmount), 'Resolve the open provider/order settlement conflict before closure.');
    if (orders && settlement.orderIds.length && settlement.orderIds.some((orderId) => {
      const order = ordersById.get(orderId);
      return !order || !['fulfilled', 'cancelled', 'returned', 'rto'].includes(order.status) || !order.statusUpdatedBy || !order.statusUpdatedAt || !order.statusEvidence || (['returned', 'rto'].includes(order.status) && (!order.retailReturnId || !order.creditNoteReconciliationId || !order.inventoryEvidenceReference));
    })) addException(settlement, connector, 'order-closure', 'high', settlement.netAmount, 'Complete terminal order status and return/RTO evidence for every linked channel order.');
    if (!(connector.environment === 'production' && connector.status === 'certified' && connector.credentialStatus === 'configured')) addException(settlement, connector, 'external-certification', 'external', 0, 'Complete production connector credentials and independently assessed provider certification.');
  }
  const exceptionsBySettlement = new Map<string, RetailChannelSettlementException[]>();
  for (const exception of settlementExceptions) exceptionsBySettlement.set(exception.settlementId, [...(exceptionsBySettlement.get(exception.settlementId) ?? []), exception]);
  const buildRow = (connector: RetailCommerceConnector): RetailChannelSettlementReadinessRow => {
    const connectorSettlements = periodSettlements.filter((settlement) => settlement.connectorId === connector.id);
    const settlementIds = new Set(connectorSettlements.map(({ id }) => id));
    const openConflictCount = conflicts.filter((conflict) => conflict.connectorId === connector.id && conflict.status === 'prepared' && settlementIds.has(conflict.sourceId)).length;
    const missingAllocationCount = connectorSettlements.filter((settlement) => allocationsBySettlement.get(settlement.id)?.status !== 'approved').length;
    const missingWithholdingCount = connectorSettlements.filter((settlement) => settlement.taxWithheldAmount > 0 && withholdingBySettlement.get(settlement.id)?.status !== 'approved').length;
    const orderClosureGapCount = orders ? connectorSettlements.filter((settlement) => exceptionsBySettlement.get(settlement.id)?.some((exception) => exception.kind === 'order-closure')).length : 0;
    const exceptionCount = connectorSettlements.reduce((total, settlement) => total + (exceptionsBySettlement.get(settlement.id)?.length ?? 0), 0);
    const isReady = (settlement: RetailSettlementReconciliation) => {
      const allocationReady = allocationsBySettlement.get(settlement.id)?.status === 'approved';
      const withholdingReady = settlement.taxWithheldAmount <= 0 || withholdingBySettlement.get(settlement.id)?.status === 'approved';
      const conflictOpen = conflicts.some((conflict) => conflict.connectorId === connector.id && conflict.sourceId === settlement.id && conflict.status === 'prepared');
      const orderClosureReady = !orders || !exceptionsBySettlement.get(settlement.id)?.some((exception) => exception.kind === 'order-closure');
      return ['matched', 'resolved'].includes(settlement.status) && Boolean(settlement.journalDraftId) && allocationReady && withholdingReady && !conflictOpen && orderClosureReady;
    };
    const readySettlementCount = connectorSettlements.filter(isReady).length;
    const productionCertified = connector.environment === 'production' && connector.status === 'certified' && connector.credentialStatus === 'configured';
    const connectorState: RetailChannelSettlementState = !productionCertified
      ? 'external-certification'
      : connectorSettlements.length === 0 || readySettlementCount < connectorSettlements.length || openConflictCount > 0
        ? 'internal-blocked'
        : 'ready';
    return {
      connectorId: connector.id,
      connectorCode: connector.code,
      connectorName: connector.name,
      channel: connector.channel,
      environment: connector.environment,
      connectorState,
      settlementCount: connectorSettlements.length,
      readySettlementCount,
      matchedSettlementCount: connectorSettlements.filter(({ status }) => status === 'matched').length,
      resolvedSettlementCount: connectorSettlements.filter(({ status }) => status === 'resolved').length,
      varianceReviewCount: connectorSettlements.filter(({ status }) => status === 'variance-review').length,
      rejectedSettlementCount: connectorSettlements.filter(({ status }) => status === 'rejected').length,
      grossAmount: round2(connectorSettlements.reduce((total, settlement) => total + settlement.grossAmount, 0)),
      refundAmount: round2(connectorSettlements.reduce((total, settlement) => total + (settlement.refundAmount ?? 0), 0)),
      feeAmount: round2(connectorSettlements.reduce((total, settlement) => total + settlement.feeAmount, 0)),
      taxWithheldAmount: round2(connectorSettlements.reduce((total, settlement) => total + settlement.taxWithheldAmount, 0)),
      netAmount: round2(connectorSettlements.reduce((total, settlement) => total + settlement.netAmount, 0)),
      varianceExposure: round2(connectorSettlements.reduce((total, settlement) => total + Math.abs(settlement.varianceAmount), 0)),
      missingAllocationCount,
      missingWithholdingCount,
      orderClosureGapCount,
      journalReadyCount: connectorSettlements.filter(({ journalDraftId }) => Boolean(journalDraftId)).length,
      openConflictCount,
      exceptionCount,
      actionRequired: connectorState !== 'ready',
    };
  };
  const rows = eligibleConnectors.map(buildRow).sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || right.grossAmount - left.grossAmount);
  return {
    fromDate,
    toDate,
    connectorCount: rows.length,
    settlementCount: periodSettlements.length,
    readySettlementCount: rows.reduce((total, row) => total + row.readySettlementCount, 0),
    blockedSettlementCount: periodSettlements.length - rows.reduce((total, row) => total + row.readySettlementCount, 0),
    matchedSettlementCount: periodSettlements.filter(({ status }) => status === 'matched').length,
    resolvedSettlementCount: periodSettlements.filter(({ status }) => status === 'resolved').length,
    varianceReviewCount: periodSettlements.filter(({ status }) => status === 'variance-review').length,
    rejectedSettlementCount: periodSettlements.filter(({ status }) => status === 'rejected').length,
    grossAmount: round2(periodSettlements.reduce((total, settlement) => total + settlement.grossAmount, 0)),
    refundAmount: round2(periodSettlements.reduce((total, settlement) => total + (settlement.refundAmount ?? 0), 0)),
    feeAmount: round2(periodSettlements.reduce((total, settlement) => total + settlement.feeAmount, 0)),
    taxWithheldAmount: round2(periodSettlements.reduce((total, settlement) => total + settlement.taxWithheldAmount, 0)),
    netAmount: round2(periodSettlements.reduce((total, settlement) => total + settlement.netAmount, 0)),
    varianceExposure: round2(periodSettlements.reduce((total, settlement) => total + Math.abs(settlement.varianceAmount), 0)),
    missingAllocationCount: rows.reduce((total, row) => total + row.missingAllocationCount, 0),
    missingWithholdingCount: rows.reduce((total, row) => total + row.missingWithholdingCount, 0),
    orderClosureGapCount: rows.reduce((total, row) => total + row.orderClosureGapCount, 0),
    openConflictCount: rows.reduce((total, row) => total + row.openConflictCount, 0),
    externalCertificationGates: rows.filter((row) => row.connectorState === 'external-certification').length,
    exceptionCount: settlementExceptions.length,
    exceptions: settlementExceptions.sort((left, right) => Number(right.severity === 'high') - Number(left.severity === 'high') || right.amount - left.amount),
    rows,
  };
}

// ---------------------------------------------------------------------------
// 11a. Settlement exception triage projection
// ---------------------------------------------------------------------------

export type RetailSettlementExceptionOwner = 'finance' | 'tax' | 'operations' | 'fulfilment' | 'provider';
export type RetailSettlementExceptionPriority = 'urgent' | 'high' | 'external';

export interface RetailSettlementExceptionTriageItem extends RetailChannelSettlementException {
  id: string;
  owner: RetailSettlementExceptionOwner;
  priority: RetailSettlementExceptionPriority;
  blockedByExternal: boolean;
  route: string;
}

export interface RetailSettlementExceptionTriageReport {
  totalCount: number;
  urgentCount: number;
  internalCount: number;
  externalCount: number;
  exposureAmount: number;
  items: RetailSettlementExceptionTriageItem[];
}

const settlementExceptionOwner: Record<RetailChannelSettlementExceptionKind, RetailSettlementExceptionOwner> = {
  variance: 'finance',
  'missing-allocation': 'finance',
  'missing-withholding': 'tax',
  'missing-journal': 'finance',
  'open-conflict': 'operations',
  'order-closure': 'fulfilment',
  'external-certification': 'provider',
};

const settlementExceptionRoute: Record<RetailChannelSettlementExceptionKind, string> = {
  variance: 'Finance · payout variance',
  'missing-allocation': 'Finance · order allocation',
  'missing-withholding': 'Tax · TDS/TCS evidence',
  'missing-journal': 'Finance · journal handoff',
  'open-conflict': 'Operations · conflict resolution',
  'order-closure': 'Fulfilment · order/RTO evidence',
  'external-certification': 'Provider control · credentials and certification',
};

/**
 * Turns the existing settlement-readiness exceptions into one decision queue.
 * This is a read-only projection: it does not create a second exception store,
 * change accounting state, or imply that an external provider accepted a
 * settlement. Internal issues are ranked above external certification holds,
 * then by the amount exposed and stable settlement identity.
 */
export function computeRetailSettlementExceptionTriage(
  report: RetailChannelSettlementReadinessReport,
): RetailSettlementExceptionTriageReport {
  const priorityFor = (severity: RetailChannelSettlementException['severity']): RetailSettlementExceptionPriority => severity === 'high' ? 'urgent' : severity === 'medium' ? 'high' : 'external';
  const priorityRank: Record<RetailSettlementExceptionPriority, number> = { urgent: 3, high: 2, external: 1 };
  const items = report.exceptions
    .map((exception): RetailSettlementExceptionTriageItem => {
      const priority = priorityFor(exception.severity);
      return {
        ...exception,
        id: `${exception.settlementId}:${exception.kind}`,
        owner: settlementExceptionOwner[exception.kind],
        priority,
        blockedByExternal: priority === 'external',
        route: settlementExceptionRoute[exception.kind],
      };
    })
    .sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority] || right.amount - left.amount || left.settlementNumber.localeCompare(right.settlementNumber) || left.kind.localeCompare(right.kind));
  return {
    totalCount: items.length,
    urgentCount: items.filter(({ priority }) => priority === 'urgent').length,
    internalCount: items.filter(({ blockedByExternal }) => !blockedByExternal).length,
    externalCount: items.filter(({ blockedByExternal }) => blockedByExternal).length,
    exposureAmount: round2(items.filter(({ blockedByExternal }) => !blockedByExternal).reduce((total, item) => total + item.amount, 0)),
    items,
  };
}

// ---------------------------------------------------------------------------
// Marketplace payout / commission / return / RTO reconciliation
// ---------------------------------------------------------------------------

export interface RetailMarketplacePayoutReconciliationInput {
  settlement: RetailSettlementReconciliation;
  orders: RetailCommerceOrder[];
  allocation?: RetailSettlementAllocationPack;
}

export interface RetailMarketplacePayoutReconciliation {
  settlementId: string;
  settlementReference: string;
  providerGrossAmount: number;
  providerRefundAmount: number;
  /** Marketplace fee is the provider-side commission deducted before payout. */
  providerCommissionAmount: number;
  providerTaxWithheldAmount: number;
  providerNetAmount: number;
  allocatedGrossAmount: number;
  allocatedRefundAmount: number;
  allocatedCommissionAmount: number;
  allocatedNetAmount: number;
  allocationCoveragePct: number;
  lifecycle: { fulfilled: number; cancelled: number; returned: number; rto: number; open: number };
  rtoRefundAmount: number;
  returnRefundAmount: number;
  missingOrderNumbers: string[];
  missingTerminalOrderNumbers: string[];
  missingReturnEvidenceOrderNumbers: string[];
  status: 'ready-to-close' | 'needs-action';
  nextActions: string[];
}

/**
 * Joins provider payout deductions to the exact remote-order lifecycle. It is
 * deliberately a read-only projection: a balanced payout never implies that
 * an RTO, GST credit note, inventory receipt, or bank settlement was completed.
 */
export function computeRetailMarketplacePayoutReconciliation({ settlement, orders, allocation }: RetailMarketplacePayoutReconciliationInput): RetailMarketplacePayoutReconciliation {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const allocationByOrder = new Map((allocation?.allocations ?? []).map((item) => [item.orderId, item]));
  const lifecycle = { fulfilled: 0, cancelled: 0, returned: 0, rto: 0, open: 0 };
  const missingOrderNumbers: string[] = [];
  const missingTerminalOrderNumbers: string[] = [];
  const missingReturnEvidenceOrderNumbers: string[] = [];
  let rtoRefundAmount = 0;
  let returnRefundAmount = 0;
  for (const orderId of settlement.orderIds) {
    const order = orderById.get(orderId);
    if (!order) {
      missingOrderNumbers.push(orderId);
      lifecycle.open += 1;
      continue;
    }
    if (order.status === 'fulfilled') lifecycle.fulfilled += 1;
    else if (order.status === 'cancelled') lifecycle.cancelled += 1;
    else if (order.status === 'returned') lifecycle.returned += 1;
    else if (order.status === 'rto') lifecycle.rto += 1;
    else lifecycle.open += 1;
    const terminal = ['fulfilled', 'cancelled', 'returned', 'rto'].includes(order.status) && Boolean(order.statusUpdatedBy && order.statusUpdatedAt && order.statusEvidence);
    if (!terminal) missingTerminalOrderNumbers.push(order.orderNumber);
    if (['returned', 'rto'].includes(order.status)) {
      const allocationLine = allocationByOrder.get(order.id);
      if (order.status === 'rto') rtoRefundAmount = round2(rtoRefundAmount + (allocationLine?.refundAmount ?? 0));
      if (order.status === 'returned') returnRefundAmount = round2(returnRefundAmount + (allocationLine?.refundAmount ?? 0));
      if (!order.retailReturnId || !order.creditNoteReconciliationId || !order.inventoryEvidenceReference) missingReturnEvidenceOrderNumbers.push(order.orderNumber);
    }
  }
  const allocatedGrossAmount = round2(allocation?.allocatedGrossAmount ?? 0);
  const allocatedRefundAmount = round2(allocation?.allocatedRefundAmount ?? 0);
  const allocatedCommissionAmount = round2(allocation?.allocatedFeeAmount ?? 0);
  const allocatedNetAmount = round2(allocation?.allocatedNetAmount ?? 0);
  const allocationCoveragePct = settlement.orderIds.length === 0
    ? 100
    : round2(Math.min(100, (settlement.orderIds.filter((orderId) => allocationByOrder.has(orderId)).length / settlement.orderIds.length) * 100));
  const allocationTotalsMatch = !settlement.orderIds.length || Boolean(allocation && allocation.status === 'approved' && allocationCoveragePct === 100 && Math.abs(allocatedGrossAmount - settlement.grossAmount) <= 0.01 && Math.abs(allocatedRefundAmount - (settlement.refundAmount ?? 0)) <= 0.01 && Math.abs(allocatedCommissionAmount - settlement.feeAmount) <= 0.01 && Math.abs(allocatedNetAmount - settlement.netAmount) <= 0.01);
  const nextActions: string[] = [];
  if (Math.abs(settlement.varianceAmount) > 0.01) nextActions.push('Resolve the provider payout versus local net variance.');
  if (settlement.orderIds.length && (!allocation || allocation.status !== 'approved' || allocationCoveragePct < 100)) nextActions.push('Prepare and independently approve one allocation line for every linked marketplace order.');
  if (settlement.orderIds.length && allocation && allocation.status === 'approved' && !allocationTotalsMatch) nextActions.push('Correct allocation totals so gross, refunds, commission and net equal the authoritative provider payout.');
  if (missingOrderNumbers.length || missingTerminalOrderNumbers.length) nextActions.push('Complete terminal status evidence for every linked marketplace order.');
  if (missingReturnEvidenceOrderNumbers.length) nextActions.push('Complete GST credit-note and inventory evidence for every returned or RTO order.');
  const status: RetailMarketplacePayoutReconciliation['status'] = settlement.status !== 'matched' && settlement.status !== 'resolved'
    || !allocationTotalsMatch || missingOrderNumbers.length > 0 || missingTerminalOrderNumbers.length > 0 || missingReturnEvidenceOrderNumbers.length > 0
    ? 'needs-action'
    : 'ready-to-close';
  return {
    settlementId: settlement.id,
    settlementReference: settlement.settlementReference,
    providerGrossAmount: round2(settlement.grossAmount),
    providerRefundAmount: round2(settlement.refundAmount ?? 0),
    providerCommissionAmount: round2(settlement.feeAmount),
    providerTaxWithheldAmount: round2(settlement.taxWithheldAmount),
    providerNetAmount: round2(settlement.netAmount),
    allocatedGrossAmount,
    allocatedRefundAmount,
    allocatedCommissionAmount,
    allocatedNetAmount,
    allocationCoveragePct,
    lifecycle,
    rtoRefundAmount,
    returnRefundAmount,
    missingOrderNumbers,
    missingTerminalOrderNumbers,
    missingReturnEvidenceOrderNumbers,
    status,
    nextActions,
  };
}

// ---------------------------------------------------------------------------
// Store execution readiness: offline POS and physical devices
// ---------------------------------------------------------------------------

export interface RetailStoreExecutionReadinessInput {
  offlineQueue: RetailOfflineSaleQueueItem[];
  /** Optional append-only journal used to detect restart/recovery gaps. */
  syncReceipts?: RetailOfflineSyncReceipt[];
  /** Clock and threshold are injectable so a store can run a deterministic drill. */
  now?: string;
  staleAfterMs?: number;
  deviceEvidence: RetailDeviceTransportEvidence[];
  preflightEvidence?: Array<RetailDeviceTransportPreflightResult & { id: string; actorId: string; recordedAt: string; version: number }>;
}

export type RetailStoreDeviceReadinessStatus = 'ready' | 'needs-acknowledgement' | 'needs-recovery' | 'unverified';

export interface RetailStoreDeviceReadinessRow {
  kind: RetailPhysicalDeviceKind;
  preparedCount: number;
  acknowledgedCount: number;
  failedCount: number;
  reachablePreflightCount: number;
  failedPreflightCount: number;
  lastResponseReference?: string;
  status: RetailStoreDeviceReadinessStatus;
  nextAction: string;
}

export interface RetailStoreExecutionReadinessReport {
  offline: {
    queuedCount: number;
    syncingCount: number;
    conflictCount: number;
    syncedCount: number;
    discardedCount: number;
    recoveryAttemptCount: number;
    staleQueueCount: number;
    journalGapCount: number;
    recoveryEvidenceGapCount: number;
    duplicateTransactionKeyCount: number;
    lastRecoveryAt?: string;
    actionRequired: boolean;
  };
  device: {
    preparedCount: number;
    acknowledgedCount: number;
    failedCount: number;
    reachablePreflightCount: number;
    failedPreflightCount: number;
    actionRequired: boolean;
  };
  deviceRows: RetailStoreDeviceReadinessRow[];
  actionRequired: boolean;
  nextActions: string[];
}

/**
 * Gives a store manager one truthful readiness view across offline checkout
 * and hardware. This is a projection only: a reachable device is diagnostic
 * evidence, while an acknowledged command is the only local success state.
 */
export function computeRetailStoreExecutionReadiness({ offlineQueue, syncReceipts = [], now: nowInput, staleAfterMs = 15 * 60 * 1000, deviceEvidence, preflightEvidence = [] }: RetailStoreExecutionReadinessInput): RetailStoreExecutionReadinessReport {
  const now = Date.parse(nowInput ?? new Date().toISOString());
  if (!Number.isFinite(now) || !Number.isFinite(staleAfterMs) || staleAfterMs < 1) throw new Error('Offline recovery readiness requires a valid clock and positive stale threshold.');
  const receiptByQueueItem = new Map<string, RetailOfflineSyncReceipt[]>();
  for (const receipt of syncReceipts) receiptByQueueItem.set(receipt.queueItemId, [...(receiptByQueueItem.get(receipt.queueItemId) ?? []), receipt]);
  const duplicateKeys = new Set(offlineQueue.map((item) => item.transactionKey).filter((key, index, keys) => keys.indexOf(key) !== index));
  const staleQueueCount = offlineQueue.filter((item) => ['queued', 'syncing'].includes(item.status) && Number.isFinite(Date.parse(item.lastAttemptAt ?? item.queuedAt)) && now - Date.parse(item.lastAttemptAt ?? item.queuedAt) > staleAfterMs).length;
  const journalGapCount = offlineQueue.filter((item) => (receiptByQueueItem.get(item.id) ?? []).length === 0).length;
  const recoveryEvidenceGapQueueIds = new Set(offlineQueue.filter((item) => item.lastSyncMode === 'recovery' && !item.lastSyncEvidenceReference).map((item) => item.id));
  for (const receipt of syncReceipts.filter((candidate) => ['syncing', 'requeued'].includes(candidate.status) && !candidate.evidenceReference)) recoveryEvidenceGapQueueIds.add(receipt.queueItemId);
  const recoveryEvidenceGapCount = recoveryEvidenceGapQueueIds.size;
  const lastRecoveryAt = syncReceipts.filter((receipt) => receipt.status === 'requeued' || Boolean(receipt.evidenceReference)).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]?.occurredAt;
  const offline = {
    queuedCount: offlineQueue.filter((item) => item.status === 'queued').length,
    syncingCount: offlineQueue.filter((item) => item.status === 'syncing').length,
    conflictCount: offlineQueue.filter((item) => item.status === 'conflict').length,
    syncedCount: offlineQueue.filter((item) => item.status === 'synced').length,
    discardedCount: offlineQueue.filter((item) => item.status === 'discarded').length,
    recoveryAttemptCount: offlineQueue.filter((item) => item.lastSyncMode === 'recovery').length,
    staleQueueCount,
    journalGapCount,
    recoveryEvidenceGapCount,
    duplicateTransactionKeyCount: duplicateKeys.size,
    lastRecoveryAt,
    actionRequired: offlineQueue.some((item) => ['queued', 'syncing', 'conflict'].includes(item.status)) || staleQueueCount > 0 || journalGapCount > 0 || recoveryEvidenceGapCount > 0 || duplicateKeys.size > 0,
  };
  const kinds: RetailPhysicalDeviceKind[] = ['barcode-scanner', 'escpos-printer', 'cash-drawer', 'weighing-scale'];
  const deviceRows = kinds.map((kind): RetailStoreDeviceReadinessRow => {
    const records = deviceEvidence.filter((record) => record.kind === kind);
    const preparedCount = records.filter((record) => record.status === 'prepared').length;
    const acknowledgedCount = records.filter((record) => record.status === 'acknowledged').length;
    const failedCount = records.filter((record) => record.status === 'failed').length;
    const preflights = preflightEvidence.filter((evidence) => evidence.kind === kind);
    const reachablePreflightCount = preflights.filter((evidence) => evidence.status === 'reachable').length;
    const failedPreflightCount = preflights.filter((evidence) => evidence.status === 'failed').length;
    const latestRecord = [...records].sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))[0];
    const latestPreflight = [...preflights].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0];
    const status: RetailStoreDeviceReadinessStatus = preparedCount > 0
      ? 'needs-acknowledgement'
      : failedCount > 0 || latestPreflight?.status === 'failed'
        ? 'needs-recovery'
        : acknowledgedCount > 0 || latestPreflight?.status === 'reachable'
          ? 'ready'
          : 'unverified';
    const nextAction = status === 'needs-acknowledgement'
      ? 'Record independent device response evidence.'
      : status === 'needs-recovery'
        ? 'Review the failed command and prepare a controlled retry.'
        : status === 'ready'
          ? 'Ready for governed store operation.'
          : 'Run a bounded device preflight or prepare a controlled test command.';
    return { kind, preparedCount, acknowledgedCount, failedCount, reachablePreflightCount, failedPreflightCount, lastResponseReference: latestRecord?.responseReference ?? latestPreflight?.responseReference, status, nextAction };
  });
  const device = {
    preparedCount: deviceRows.reduce((total, row) => total + row.preparedCount, 0),
    acknowledgedCount: deviceRows.reduce((total, row) => total + row.acknowledgedCount, 0),
    failedCount: deviceRows.reduce((total, row) => total + row.failedCount, 0),
    reachablePreflightCount: deviceRows.reduce((total, row) => total + row.reachablePreflightCount, 0),
    failedPreflightCount: deviceRows.reduce((total, row) => total + row.failedPreflightCount, 0),
    actionRequired: deviceRows.some((row) => ['needs-acknowledgement', 'needs-recovery'].includes(row.status)),
  };
  const nextActions: string[] = [];
  if (offline.queuedCount || offline.syncingCount) nextActions.push('Synchronize the queued offline sale when connectivity is restored.');
  if (offline.conflictCount) nextActions.push('Review offline conflicts with an independent supervisor.');
  if (offline.staleQueueCount) nextActions.push('Run a recovery pass for stale queued sales and attach the outage reference.');
  if (offline.journalGapCount) nextActions.push('Rebuild the local recovery journal from a verified workspace backup before allowing closure.');
  if (offline.recoveryEvidenceGapCount) nextActions.push('Attach independent recovery evidence to every recovery transition before retrying.');
  if (offline.duplicateTransactionKeyCount) nextActions.push('Stop duplicate transaction keys before synchronization; investigate possible replay.');
  if (device.preparedCount) nextActions.push('Record independent device response evidence for prepared commands.');
  if (device.failedCount || device.failedPreflightCount) nextActions.push('Recover failed store hardware through a controlled retry or approved replacement device.');
  if (!nextActions.length && !deviceRows.some((row) => row.status === 'unverified')) nextActions.push('Store execution is ready for governed operation.');
  return { offline, device, deviceRows, actionRequired: offline.actionRequired || device.actionRequired, nextActions };
}

// ---------------------------------------------------------------------------
// Retail electronic-tender settlement reconciliation
// ---------------------------------------------------------------------------

export interface RetailTenderSettlementReconciliationInput {
  receipts: PaymentReceipt[];
  bankLines: BankStatementLine[];
}

export type RetailTenderSettlementMethod = 'upi' | 'card' | 'bank-transfer' | 'cash';
export type RetailTenderSettlementRowStatus = 'ready' | 'needs-action' | 'not-applicable';

export interface RetailTenderSettlementRow {
  method: RetailTenderSettlementMethod;
  receiptCount: number;
  reconciledReceiptCount: number;
  matchedLineCount: number;
  recordedAmount: number;
  bankMatchedAmount: number;
  gapAmount: number;
  status: RetailTenderSettlementRowStatus;
  unmatchedReceiptNumbers: string[];
  nextAction: string;
}

export interface RetailTenderSettlementReconciliationReport {
  currency: 'INR';
  totalRecordedElectronicAmount: number;
  totalBankMatchedElectronicAmount: number;
  totalUnmatchedElectronicAmount: number;
  rows: RetailTenderSettlementRow[];
  actionRequired: boolean;
  nextActions: string[];
}

/**
 * Joins electronic POS receipts to imported bank evidence. Cash is excluded
 * intentionally: it has a separate drawer close and custody control. The
 * projection never assumes a provider payout from a receipt alone.
 */
export function computeRetailTenderSettlementReconciliation({ receipts, bankLines }: RetailTenderSettlementReconciliationInput): RetailTenderSettlementReconciliationReport {
  const methods: RetailTenderSettlementMethod[] = ['upi', 'card', 'bank-transfer', 'cash'];
  const matchedLineByReceipt = new Map<string, BankStatementLine>();
  for (const line of bankLines) {
    if (line.matchStatus !== 'matched' || !line.matchedPaymentReceiptId || line.credit <= 0) continue;
    if (!matchedLineByReceipt.has(line.matchedPaymentReceiptId)) matchedLineByReceipt.set(line.matchedPaymentReceiptId, line);
  }
  const rows = methods.map((method): RetailTenderSettlementRow => {
    const methodReceipts = method === 'cash' ? [] : receipts.filter((receipt) => receipt.method === method && receipt.status !== 'reversed');
    const matched = methodReceipts.map((receipt) => ({ receipt, line: matchedLineByReceipt.get(receipt.id) })).filter(({ line }) => Boolean(line));
    const recordedAmount = round2(methodReceipts.reduce((total, receipt) => total + receipt.amount, 0));
    const bankMatchedAmount = round2(matched.reduce((total, item) => total + (item.line?.credit ?? 0), 0));
    const gapAmount = round2(Math.max(0, recordedAmount - bankMatchedAmount));
    const unmatchedReceiptNumbers = methodReceipts.filter((receipt) => !matchedLineByReceipt.has(receipt.id)).map((receipt) => receipt.number);
    const status: RetailTenderSettlementRowStatus = methodReceipts.length === 0
      ? 'not-applicable'
      : gapAmount <= 0.01 && methodReceipts.every((receipt) => receipt.status === 'reconciled')
        ? 'ready'
        : 'needs-action';
    const nextAction = status === 'not-applicable'
      ? 'No electronic tender evidence in scope.'
      : status === 'ready'
        ? 'Bank evidence reconciled for this tender.'
        : 'Import and match the missing UPI/card settlement lines before closing electronic tenders.';
    return { method, receiptCount: methodReceipts.length, reconciledReceiptCount: methodReceipts.filter((receipt) => receipt.status === 'reconciled').length, matchedLineCount: matched.length, recordedAmount, bankMatchedAmount, gapAmount, status, unmatchedReceiptNumbers, nextAction };
  });
  const totalRecordedElectronicAmount = round2(rows.reduce((total, row) => total + row.recordedAmount, 0));
  const totalBankMatchedElectronicAmount = round2(rows.reduce((total, row) => total + row.bankMatchedAmount, 0));
  const totalUnmatchedElectronicAmount = round2(Math.max(0, totalRecordedElectronicAmount - totalBankMatchedElectronicAmount));
  const nextActions = rows.filter((row) => row.status === 'needs-action').map((row) => row.nextAction).filter((action, index, values) => values.indexOf(action) === index);
  return { currency: 'INR', totalRecordedElectronicAmount, totalBankMatchedElectronicAmount, totalUnmatchedElectronicAmount, rows, actionRequired: nextActions.length > 0, nextActions };
}

// ---------------------------------------------------------------------------
// 11b. Explicit UPI / card provider settlement evidence
// ---------------------------------------------------------------------------

export type RetailElectronicPayoutRailStatus = 'ready' | 'needs-provider-evidence' | 'needs-settlement-run' | 'needs-settlement-exception' | 'needs-bank-match';

export interface RetailElectronicPayoutRailEvidenceInput {
  providers: ProviderConnector[];
  conformanceCases: ProviderConformanceCase[];
  submissions: ProviderSubmission[];
  reconciliationRuns: ProviderReconciliationRun[];
  tenderSettlement: RetailTenderSettlementReconciliationReport;
}

export interface RetailElectronicPayoutRailEvidenceRow {
  rail: ProviderPaymentRail;
  providerCode?: string;
  providerName?: string;
  status: RetailElectronicPayoutRailStatus;
  conformanceEvidenceCount: number;
  settlementRunCount: number;
  matchedSettlementItemCount: number;
  exceptionSettlementItemCount: number;
  pendingSubmissionCount: number;
  bankGapAmount: number;
  nextAction: string;
}

export interface RetailElectronicPayoutRailEvidenceReport {
  currency: 'INR';
  rows: RetailElectronicPayoutRailEvidenceRow[];
  readyCount: number;
  actionRequired: boolean;
  nextActions: string[];
}

/**
 * Connects an explicitly tagged banking conformance case to settlement pulls.
 * A connector name, local receipt, or sandbox success is never enough to mark
 * a UPI/card rail ready; real production evidence and a reconciliation run are
 * separate gates.
 */
export function computeRetailElectronicPayoutRailEvidence({ providers, conformanceCases, submissions, reconciliationRuns, tenderSettlement }: RetailElectronicPayoutRailEvidenceInput): RetailElectronicPayoutRailEvidenceReport {
  const rails: ProviderPaymentRail[] = ['upi', 'card', 'bank-transfer'];
  const rows = rails.map((rail): RetailElectronicPayoutRailEvidenceRow => {
    const provider = providers.find((item) => item.active && item.domain === 'banking' && item.environment === 'production' && item.credentialStatus === 'configured' && item.conformanceStatus === 'production-approved' && conformanceCases.some((test) => test.connectorId === item.id && test.paymentRail === rail && providerConformanceMatchesCredentialRevision(item, test)));
    const railCases = provider ? conformanceCases.filter((item) => item.connectorId === provider.id && item.paymentRail === rail && providerConformanceMatchesCredentialRevision(provider, item)) : [];
    const validCases = railCases.filter((item) => hasValidProviderEvidence(item, provider!));
    const hasSettlementCapability = provider?.capabilities.includes('statement-pull') || provider?.capabilities.includes('payment-status-pull');
    const providerEvidenceReady = Boolean(provider && hasSettlementCapability && validCases.some((item) => item.capability === 'statement-pull' || item.capability === 'payment-status-pull'));
    const runs = provider ? reconciliationRuns.filter((run) => run.connectorId === provider.id) : [];
    const matchedSettlementItemCount = runs.reduce((total, run) => total + run.items.filter((item) => item.result === 'matched').length, 0);
    const exceptionSettlementItemCount = runs.reduce((total, run) => total + run.items.filter((item) => item.result !== 'matched').length, 0);
    const pendingSubmissionCount = provider ? submissions.filter((item) => item.connectorId === provider.id && ['prepared', 'handed-off'].includes(item.status)).length : 0;
    const bankGapAmount = tenderSettlement.rows.find((row) => row.method === rail)?.gapAmount ?? 0;
    const status: RetailElectronicPayoutRailStatus = !providerEvidenceReady
      ? 'needs-provider-evidence'
      : exceptionSettlementItemCount > 0
        ? 'needs-settlement-exception'
        : runs.length === 0
          ? 'needs-settlement-run'
          : bankGapAmount > 0.01
            ? 'needs-bank-match'
            : 'ready';
    const nextAction = status === 'ready'
      ? 'Provider evidence and settlement pull are complete.'
      : status === 'needs-provider-evidence'
        ? `Tag independent production ${rail} conformance evidence for the banking connector.`
        : status === 'needs-settlement-run'
          ? `Run a provider reconciliation pull for this ${rail} rail.`
          : status === 'needs-settlement-exception'
            ? `Resolve ${rail} provider reconciliation exceptions before closing the rail.`
            : `Match the remaining ${rail} bank statement gap before closing the rail.`;
    return { rail, providerCode: provider?.code, providerName: provider?.name, status, conformanceEvidenceCount: validCases.length, settlementRunCount: runs.length, matchedSettlementItemCount, exceptionSettlementItemCount, pendingSubmissionCount, bankGapAmount, nextAction };
  });
  const nextActions = rows.filter((row) => row.status !== 'ready').map((row) => row.nextAction);
  return { currency: 'INR', rows, readyCount: rows.filter((row) => row.status === 'ready').length, actionRequired: nextActions.length > 0, nextActions };
}

// ---------------------------------------------------------------------------
// 12. Marketplace / ONDC Production Certification Readiness Report
// ---------------------------------------------------------------------------

export interface RetailMarketplaceProductionReadinessInput {
  connectors: RetailCommerceConnector[];
  conformanceCases: RetailCommerceConformanceCase[];
  syncRuns: RetailCommerceSyncRun[];
  orders: RetailCommerceOrder[];
  settlements: RetailSettlementReconciliation[];
  allocations: RetailSettlementAllocationPack[];
  withholding: RetailSettlementWithholdingEvidence[];
  conflicts: RetailCommerceConflictResolution[];
  fromDate: string;
  toDate: string;
}

export type RetailMarketplaceProviderState = 'ready' | 'external-certification';
export type RetailMarketplaceNextAction = 'ready' | 'configure-credentials' | 'complete-conformance' | 'resolve-sync' | 'handoff-orders' | 'reconcile-settlement';

export interface RetailMarketplaceProductionReadinessRow {
  connectorId: string;
  connectorCode: string;
  connectorName: string;
  channel: RetailCommerceConnector['channel'];
  environment: RetailCommerceConnector['environment'];
  providerState: RetailMarketplaceProviderState;
  requiredCapabilityCount: number;
  conformanceCaseCount: number;
  passedConformanceCaseCount: number;
  invalidConformanceCaseCount: number;
  conformanceCoveragePct: number;
  syncRunCount: number;
  syncPendingCount: number;
  syncFailureCount: number;
  syncExceptionCount: number;
  syncBlockerCount: number;
  orderCount: number;
  orderHandoffGapCount: number;
  returnEvidenceGapCount: number;
  settlementCount: number;
  settlementReadyCount: number;
  settlementBlockedCount: number;
  settlementVarianceExposure: number;
  nextAction: RetailMarketplaceNextAction;
  actionRequired: boolean;
}

export interface RetailMarketplaceProductionReadinessReport {
  fromDate: string;
  toDate: string;
  connectorCount: number;
  productionReadyCount: number;
  conformanceReadyCount: number;
  syncPendingCount: number;
  syncFailureCount: number;
  syncExceptionCount: number;
  orderHandoffGapCount: number;
  returnEvidenceGapCount: number;
  settlementCount: number;
  settlementReadyCount: number;
  settlementVarianceExposure: number;
  actionRequired: boolean;
  rows: RetailMarketplaceProductionReadinessRow[];
}

export function computeRetailMarketplaceProductionReadiness({ connectors, conformanceCases, syncRuns, orders, settlements, allocations, withholding, conflicts, fromDate, toDate }: RetailMarketplaceProductionReadinessInput): RetailMarketplaceProductionReadinessReport {
  const inRange = (timestamp: string) => isoDate(timestamp) >= fromDate && isoDate(timestamp) <= toDate;
  const settlementInPeriod = (settlement: RetailSettlementReconciliation) => settlement.periodFrom <= toDate && settlement.periodTo >= fromDate;
  const allocationsBySettlement = new Map(allocations.map((allocation) => [allocation.settlementId, allocation]));
  const withholdingBySettlement = new Map(withholding.map((item) => [item.settlementId, item]));
  const buildRow = (connector: RetailCommerceConnector): RetailMarketplaceProductionReadinessRow => {
    const cases = conformanceCases.filter((item) => item.connectorId === connector.id);
    const currentCases = cases.filter((item) => retailCommerceConformanceMatchesCredentialRevision(connector, item));
    const validPassedCases = currentCases.filter((item) => item.result === 'passed' && Boolean(item.evidenceReference?.trim()) && /^[a-f0-9]{64}$/i.test(item.resultChecksum ?? '') && Boolean(item.assessedBy?.trim()) && Boolean(item.assessedAt) && Number.isFinite(Date.parse(item.assessedAt!)));
    const invalidConformanceCaseCount = cases.filter((item) => !retailCommerceConformanceMatchesCredentialRevision(connector, item) || item.result !== 'passed' || !item.evidenceReference?.trim() || !/^[a-f0-9]{64}$/i.test(item.resultChecksum ?? '') || !item.assessedBy?.trim() || !item.assessedAt || !Number.isFinite(Date.parse(item.assessedAt!))).length;
    const requiredCapabilityCount = connector.capabilities.length;
    const coveredCapabilities = new Set(validPassedCases.map((item) => item.capability).filter((capability): capability is RetailCommerceConnector['capabilities'][number] => Boolean(capability)));
    const legacySingleCapabilityCoverage = connector.capabilities.length === 1 && validPassedCases.some((item) => !item.capability) ? 1 : 0;
    const coveredCapabilityCount = connector.capabilities.filter((capability) => coveredCapabilities.has(capability)).length + legacySingleCapabilityCoverage;
    const conformanceCoveragePct = requiredCapabilityCount ? round2(Math.min(100, (coveredCapabilityCount / requiredCapabilityCount) * 100)) : 0;
    const conformanceReady = requiredCapabilityCount > 0 && coveredCapabilityCount >= requiredCapabilityCount && invalidConformanceCaseCount === 0;
    const providerState: RetailMarketplaceProviderState = connector.environment === 'production' && connector.status === 'certified' && connector.credentialStatus === 'configured' && conformanceReady ? 'ready' : 'external-certification';
    const connectorSyncRuns = syncRuns.filter((run) => run.connectorId === connector.id && inRange(run.requestedAt));
    const syncPendingCount = connectorSyncRuns.filter(({ status }) => status === 'prepared').length;
    const syncFailureCount = connectorSyncRuns.filter(({ status }) => status === 'failed').length;
    const syncExceptionCount = connectorSyncRuns.filter(({ status }) => status === 'completed-with-exceptions').length;
    const connectorOrders = orders.filter((order) => order.connectorId === connector.id && inRange(order.importedAt));
    const orderHandoffGapCount = connectorOrders.filter((order) => ['imported', 'confirmed', 'fulfilled'].includes(order.status) && !order.localSalesOrderId).length;
    const returnEvidenceGapCount = connectorOrders.filter((order) => ['returned', 'rto'].includes(order.status) && (!order.retailReturnId || !order.creditNoteReconciliationId || !order.inventoryEvidenceReference)).length;
    const connectorSettlements = settlements.filter((settlement) => settlement.connectorId === connector.id && settlementInPeriod(settlement));
    const settlementReady = (settlement: RetailSettlementReconciliation) => {
      const allocationReady = allocationsBySettlement.get(settlement.id)?.status === 'approved';
      const withholdingReady = settlement.taxWithheldAmount <= 0 || withholdingBySettlement.get(settlement.id)?.status === 'approved';
      const conflictOpen = conflicts.some((conflict) => conflict.connectorId === connector.id && conflict.sourceId === settlement.id && conflict.status === 'prepared');
      return ['matched', 'resolved'].includes(settlement.status) && Boolean(settlement.journalDraftId) && allocationReady && withholdingReady && !conflictOpen;
    };
    const settlementReadyCount = connectorSettlements.filter(settlementReady).length;
    const syncBlockerCount = syncPendingCount + syncFailureCount + syncExceptionCount;
    const settlementBlockedCount = connectorSettlements.length - settlementReadyCount;
    const nextAction: RetailMarketplaceNextAction = connector.credentialStatus !== 'configured'
      ? 'configure-credentials'
      : !conformanceReady || connector.environment !== 'production' || connector.status !== 'certified'
        ? 'complete-conformance'
        : syncBlockerCount > 0
          ? 'resolve-sync'
          : orderHandoffGapCount + returnEvidenceGapCount > 0
            ? 'handoff-orders'
            : settlementBlockedCount > 0
              ? 'reconcile-settlement'
              : 'ready';
    return {
      connectorId: connector.id,
      connectorCode: connector.code,
      connectorName: connector.name,
      channel: connector.channel,
      environment: connector.environment,
      providerState,
      requiredCapabilityCount,
      conformanceCaseCount: cases.length,
      passedConformanceCaseCount: validPassedCases.length,
      invalidConformanceCaseCount,
      conformanceCoveragePct,
      syncRunCount: connectorSyncRuns.length,
      syncPendingCount,
      syncFailureCount,
      syncExceptionCount,
      syncBlockerCount,
      orderCount: connectorOrders.length,
      orderHandoffGapCount,
      returnEvidenceGapCount,
      settlementCount: connectorSettlements.length,
      settlementReadyCount,
      settlementBlockedCount,
      settlementVarianceExposure: round2(connectorSettlements.reduce((total, settlement) => total + Math.abs(settlement.varianceAmount), 0)),
      nextAction,
      actionRequired: nextAction !== 'ready',
    };
  };
  const rows = connectors.map(buildRow).sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || left.connectorCode.localeCompare(right.connectorCode));
  return {
    fromDate,
    toDate,
    connectorCount: rows.length,
    productionReadyCount: rows.filter(({ providerState }) => providerState === 'ready').length,
    conformanceReadyCount: rows.filter(({ conformanceCoveragePct, invalidConformanceCaseCount }) => conformanceCoveragePct === 100 && invalidConformanceCaseCount === 0).length,
    syncPendingCount: rows.reduce((total, row) => total + row.syncPendingCount, 0),
    syncFailureCount: rows.reduce((total, row) => total + row.syncFailureCount, 0),
    syncExceptionCount: rows.reduce((total, row) => total + row.syncExceptionCount, 0),
    orderHandoffGapCount: rows.reduce((total, row) => total + row.orderHandoffGapCount, 0),
    returnEvidenceGapCount: rows.reduce((total, row) => total + row.returnEvidenceGapCount, 0),
    settlementCount: rows.reduce((total, row) => total + row.settlementCount, 0),
    settlementReadyCount: rows.reduce((total, row) => total + row.settlementReadyCount, 0),
    settlementVarianceExposure: round2(rows.reduce((total, row) => total + row.settlementVarianceExposure, 0)),
    actionRequired: rows.some(({ actionRequired }) => actionRequired),
    rows,
  };
}

// ---------------------------------------------------------------------------
// 13. Strict ONDC production conformance and settlement readiness
// ---------------------------------------------------------------------------

export interface RetailOndcProductionReadinessInput {
  connectors: RetailCommerceConnector[];
  conformanceCases: RetailCommerceConformanceCase[];
  syncRuns: RetailCommerceSyncRun[];
  pushBatches: RetailCommercePushBatch[];
  orders: RetailCommerceOrder[];
  settlements: RetailSettlementReconciliation[];
  allocations: RetailSettlementAllocationPack[];
  withholding: RetailSettlementWithholdingEvidence[];
  conflicts: RetailCommerceConflictResolution[];
  fromDate: string;
  toDate: string;
}

export type RetailOndcProviderState = 'ready' | 'external-certification' | 'internal-blocked';
export type RetailOndcNextAction = 'ready' | 'configure-credentials' | 'complete-conformance' | 'execute-sync' | 'handoff-orders' | 'reconcile-settlements';

export interface RetailOndcProductionReadinessRow {
  connectorId: string;
  connectorCode: string;
  connectorName: string;
  environment: RetailCommerceConnector['environment'];
  providerState: RetailOndcProviderState;
  requiredCapabilityCount: number;
  declaredCapabilityCount: number;
  missingCapabilityCount: number;
  missingCapabilities: RetailCommerceCapability[];
  capabilityEvidenceGapCount: number;
  conformanceCaseCount: number;
  validConformanceCaseCount: number;
  pushAcknowledgedCount: number;
  pushAcknowledgementGapCount: number;
  syncEvidenceGapCount: number;
  orderCount: number;
  orderHandoffGapCount: number;
  returnEvidenceGapCount: number;
  settlementCount: number;
  settlementReadyCount: number;
  settlementEvidenceGapCount: number;
  settlementVarianceExposure: number;
  nextAction: RetailOndcNextAction;
  actionRequired: boolean;
}

export interface RetailOndcProductionReadinessReport {
  fromDate: string;
  toDate: string;
  connectorCount: number;
  productionReadyCount: number;
  conformanceReadyCount: number;
  externalCertificationGates: number;
  pushAcknowledgedCount: number;
  pushAcknowledgementGapCount: number;
  syncEvidenceGapCount: number;
  orderHandoffGapCount: number;
  returnEvidenceGapCount: number;
  settlementCount: number;
  settlementReadyCount: number;
  settlementEvidenceGapCount: number;
  settlementVarianceExposure: number;
  actionRequired: boolean;
  rows: RetailOndcProductionReadinessRow[];
}

const ondcRequiredCapabilities = ['catalog-push', 'inventory-push', 'order-pull', 'settlement-pull'] as const;

function validOndcConformanceCase(item: RetailCommerceConformanceCase, connector: RetailCommerceConnector): boolean {
  return item.result === 'passed'
    && Boolean(item.evidenceReference?.trim())
    && /^[a-f0-9]{64}$/i.test(item.resultChecksum ?? '')
    && Boolean(item.assessedBy?.trim())
    && Boolean(item.assessedAt)
    && Number.isFinite(Date.parse(item.assessedAt!))
    && retailCommerceConformanceMatchesCredentialRevision(connector, item);
}

/**
 * ONDC has a stricter production contract than a generic marketplace: every
 * declared capability needs a matching assessed scenario, push/sync evidence,
 * and settlement closure before the connector can be treated as ready.
 */
export function computeRetailOndcProductionReadiness({ connectors, conformanceCases, syncRuns, pushBatches, orders, settlements, allocations, withholding, conflicts, fromDate, toDate }: RetailOndcProductionReadinessInput): RetailOndcProductionReadinessReport {
  const inRange = (timestamp: string) => isoDate(timestamp) >= fromDate && isoDate(timestamp) <= toDate;
  const settlementInPeriod = (settlement: RetailSettlementReconciliation) => settlement.periodFrom <= toDate && settlement.periodTo >= fromDate;
  const ondcConnectors = connectors.filter((connector) => connector.channel === 'ondc');
  const allocationsBySettlement = new Map(allocations.map((allocation) => [allocation.settlementId, allocation]));
  const withholdingBySettlement = new Map(withholding.map((item) => [item.settlementId, item]));
  const buildRow = (connector: RetailCommerceConnector): RetailOndcProductionReadinessRow => {
    const declared = new Set(connector.capabilities);
    const missingCapabilities = ondcRequiredCapabilities.filter((capability) => !declared.has(capability));
    const missingCapabilityCount = missingCapabilities.length;
    const cases = conformanceCases.filter((item) => item.connectorId === connector.id);
    const validCases = cases.filter((item) => validOndcConformanceCase(item, connector));
    /** ONDC evidence must name the exercised capability; scenario text is descriptive only. */
    const missingEvidenceCapabilities = ondcRequiredCapabilities.filter((capability) => !validCases.some((item) => item.capability === capability));
    const capabilityEvidenceGapCount = missingEvidenceCapabilities.length;
    const productionConformanceReady = connector.environment === 'production' && connector.credentialStatus === 'configured' && connector.status === 'certified' && missingCapabilityCount === 0 && capabilityEvidenceGapCount === 0;
    const periodPushes = pushBatches.filter((batch) => batch.connectorId === connector.id && inRange(batch.requestedAt));
    const pushAcknowledgedCount = periodPushes.filter((batch) => ['catalog', 'inventory'].includes(batch.kind) && batch.status === 'acknowledged' && Boolean(batch.evidence?.trim()) && Boolean(batch.decidedBy?.trim()) && Boolean(batch.decidedAt)).length;
    const pushAcknowledgementGapCount = (['catalog', 'inventory'] as const).filter((kind) => declared.has(`${kind}-push` as typeof ondcRequiredCapabilities[number]) && !periodPushes.some((batch) => batch.kind === kind && batch.status === 'acknowledged' && Boolean(batch.evidence?.trim()) && Boolean(batch.decidedBy?.trim()) && Boolean(batch.decidedAt))).length;
    const periodSyncs = syncRuns.filter((run) => run.connectorId === connector.id && inRange(run.requestedAt));
    const syncEvidenceGapCount = (['orders', 'settlement'] as const).filter((kind) => declared.has(kind === 'orders' ? 'order-pull' : 'settlement-pull') && !periodSyncs.some((run) => run.kind === kind && run.status === 'completed' && Boolean(run.evidenceReference?.trim()) && Boolean(run.completedAt))).length;
    const connectorOrders = orders.filter((order) => order.connectorId === connector.id && inRange(order.importedAt));
    const orderHandoffGapCount = connectorOrders.filter((order) => ['imported', 'confirmed', 'fulfilled'].includes(order.status) && (!order.localSalesOrderId || !order.salesOrderHandoffEvidence?.trim() || !order.salesOrderHandoffBy || !order.salesOrderHandoffAt)).length;
    const returnEvidenceGapCount = connectorOrders.filter((order) => ['returned', 'rto'].includes(order.status) && (!order.retailReturnId || !order.creditNoteReconciliationId || !order.inventoryEvidenceReference)).length;
    const connectorSettlements = settlements.filter((settlement) => settlement.connectorId === connector.id && settlementInPeriod(settlement));
    const settlementReady = (settlement: RetailSettlementReconciliation) => {
      const allocation = allocationsBySettlement.get(settlement.id);
      const withholdingReady = settlement.taxWithheldAmount <= 0 || withholdingBySettlement.get(settlement.id)?.status === 'approved';
      const openConflict = conflicts.some((conflict) => conflict.connectorId === connector.id && conflict.sourceId === settlement.id && conflict.status === 'prepared');
      return ['matched', 'resolved'].includes(settlement.status) && Boolean(settlement.journalDraftId) && allocation?.status === 'approved' && withholdingReady && !openConflict;
    };
    const settlementReadyCount = connectorSettlements.filter(settlementReady).length;
    const settlementEvidenceGapCount = connectorSettlements.length - settlementReadyCount;
    const nextAction: RetailOndcNextAction = connector.credentialStatus !== 'configured'
      ? 'configure-credentials'
      : !productionConformanceReady
        ? 'complete-conformance'
        : pushAcknowledgementGapCount > 0 || syncEvidenceGapCount > 0
          ? 'execute-sync'
          : orderHandoffGapCount > 0 || returnEvidenceGapCount > 0
            ? 'handoff-orders'
            : settlementEvidenceGapCount > 0
              ? 'reconcile-settlements'
              : 'ready';
    const providerState: RetailOndcProviderState = !productionConformanceReady ? 'external-certification' : nextAction === 'ready' ? 'ready' : 'internal-blocked';
    return {
      connectorId: connector.id,
      connectorCode: connector.code,
      connectorName: connector.name,
      environment: connector.environment,
      providerState,
      requiredCapabilityCount: ondcRequiredCapabilities.length,
      declaredCapabilityCount: ondcRequiredCapabilities.filter((capability) => declared.has(capability)).length,
      missingCapabilityCount,
      missingCapabilities: missingCapabilities.concat(missingEvidenceCapabilities.filter((capability) => !missingCapabilities.includes(capability))),
      capabilityEvidenceGapCount,
      conformanceCaseCount: cases.length,
      validConformanceCaseCount: validCases.length,
      pushAcknowledgedCount,
      pushAcknowledgementGapCount,
      syncEvidenceGapCount,
      orderCount: connectorOrders.length,
      orderHandoffGapCount,
      returnEvidenceGapCount,
      settlementCount: connectorSettlements.length,
      settlementReadyCount,
      settlementEvidenceGapCount,
      settlementVarianceExposure: round2(connectorSettlements.reduce((total, settlement) => total + Math.abs(settlement.varianceAmount), 0)),
      nextAction,
      actionRequired: nextAction !== 'ready',
    };
  };
  const rows = ondcConnectors.map(buildRow).sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || left.connectorCode.localeCompare(right.connectorCode));
  return {
    fromDate,
    toDate,
    connectorCount: rows.length,
    productionReadyCount: rows.filter(({ providerState }) => providerState === 'ready').length,
    conformanceReadyCount: rows.filter(({ providerState, capabilityEvidenceGapCount, missingCapabilityCount }) => providerState !== 'external-certification' && capabilityEvidenceGapCount === 0 && missingCapabilityCount === 0).length,
    externalCertificationGates: rows.filter(({ providerState }) => providerState === 'external-certification').length,
    pushAcknowledgedCount: rows.reduce((total, row) => total + row.pushAcknowledgedCount, 0),
    pushAcknowledgementGapCount: rows.reduce((total, row) => total + row.pushAcknowledgementGapCount, 0),
    syncEvidenceGapCount: rows.reduce((total, row) => total + row.syncEvidenceGapCount, 0),
    orderHandoffGapCount: rows.reduce((total, row) => total + row.orderHandoffGapCount, 0),
    returnEvidenceGapCount: rows.reduce((total, row) => total + row.returnEvidenceGapCount, 0),
    settlementCount: rows.reduce((total, row) => total + row.settlementCount, 0),
    settlementReadyCount: rows.reduce((total, row) => total + row.settlementReadyCount, 0),
    settlementEvidenceGapCount: rows.reduce((total, row) => total + row.settlementEvidenceGapCount, 0),
    settlementVarianceExposure: round2(rows.reduce((total, row) => total + row.settlementVarianceExposure, 0)),
    actionRequired: rows.some(({ actionRequired }) => actionRequired),
    rows,
  };
}

// ---------------------------------------------------------------------------
// 13. Governed Scheduled Report Delivery Readiness Report
// ---------------------------------------------------------------------------

export interface RetailReportDeliveryReadinessInput {
  plans: RetailReportDeliveryPlan[];
  attempts: RetailReportDeliveryAttempt[];
  /** When supplied, delivery plans are required to bind to certified messaging connectors. */
  providerConnectors?: ProviderConnector[];
  providerConformanceCases?: ProviderConformanceCase[];
  fromDate: string;
  toDate: string;
}

export type RetailReportDeliveryProviderState = 'ready' | 'external-certification' | 'internal-blocked';
export type RetailReportDeliveryNextAction = 'ready' | 'approve-plan' | 'record-consent' | 'resolve-attempt' | 'bind-provider' | 'complete-provider-certification';

export interface RetailReportDeliveryReadinessRow {
  planId: string;
  planNumber: string;
  reportPackId: string;
  channel: RetailReportDeliveryPlan['channel'];
  frequency: RetailReportDeliveryPlan['frequency'];
  status: RetailReportDeliveryPlan['status'];
  recipientCount: number;
  consentGapCount: number;
  attemptCount: number;
  preparedAttemptCount: number;
  handedOffAttemptCount: number;
  acknowledgedAttemptCount: number;
  failedAttemptCount: number;
  providerConnectorId?: string;
  providerCode?: string;
  providerCapabilityReady: boolean;
  providerConformanceEvidenceCount: number;
  providerState: RetailReportDeliveryProviderState;
  nextAction: RetailReportDeliveryNextAction;
  actionRequired: boolean;
}

export interface RetailReportDeliveryReadinessReport {
  fromDate: string;
  toDate: string;
  planCount: number;
  approvedPlanCount: number;
  draftPlanCount: number;
  pausedPlanCount: number;
  rejectedPlanCount: number;
  recipientCount: number;
  consentGapCount: number;
  attemptCount: number;
  preparedAttemptCount: number;
  handedOffAttemptCount: number;
  acknowledgedAttemptCount: number;
  failedAttemptCount: number;
  providerBoundPlanCount: number;
  providerReadyPlanCount: number;
  unboundPlanCount: number;
  externalCertificationGates: number;
  actionRequired: boolean;
  rows: RetailReportDeliveryReadinessRow[];
}

export function computeRetailReportDeliveryReadiness({ plans, attempts, providerConnectors, providerConformanceCases, fromDate, toDate }: RetailReportDeliveryReadinessInput): RetailReportDeliveryReadinessReport {
  const providerCertificationEnabled = providerConnectors !== undefined;
  const activePlans = plans.filter((plan) => plan.effectiveFrom <= toDate && (!plan.effectiveTo || plan.effectiveTo >= fromDate));
  const periodAttempts = attempts.filter((attempt) => isoDate(attempt.preparedAt) >= fromDate && isoDate(attempt.preparedAt) <= toDate);
  const rows = activePlans.map((plan): RetailReportDeliveryReadinessRow => {
    const planAttempts = periodAttempts.filter((attempt) => attempt.planId === plan.id);
    const consentGapCount = plan.recipients.filter((recipient) => recipient.kind === 'customer-contact' && !recipient.consentId?.trim()).length;
    const preparedAttemptCount = planAttempts.filter(({ status }) => status === 'prepared').length;
    const handedOffAttemptCount = planAttempts.filter(({ status }) => status === 'handed-off').length;
    const acknowledgedAttemptCount = planAttempts.filter(({ status }) => status === 'acknowledged').length;
    const failedAttemptCount = planAttempts.filter(({ status }) => status === 'failed').length;
    const unresolvedAttemptCount = preparedAttemptCount + handedOffAttemptCount;
    const provider = plan.providerConnectorId ? providerConnectors?.find((candidate) => candidate.id === plan.providerConnectorId && candidate.active) : undefined;
    const requiredCapability = plan.channel === 'email' ? 'email-delivery' : 'whatsapp-delivery';
    const providerCases = provider ? (providerConformanceCases ?? []).filter((item) => item.connectorId === provider.id && providerConformanceMatchesCredentialRevision(provider, item)) : [];
    const validProviderEvidenceCount = providerCases.filter((item) => {
      const assessedAt = item.assessedAt;
      return item.capability === requiredCapability
        && item.deliveryChannel === plan.channel
        && item.environment === 'production'
        && item.result === 'passed'
        && Boolean(item.evidenceReference?.trim())
        && /^[a-f0-9]{64}$/i.test(item.resultChecksum ?? '')
        && Boolean(item.assessedBy?.trim())
        && Boolean(assessedAt)
        && Number.isFinite(Date.parse(assessedAt ?? ''));
    }).length;
    const providerCapabilityReady = !providerCertificationEnabled || Boolean(provider && provider.domain === 'messaging' && provider.environment === 'production' && provider.credentialStatus === 'configured' && provider.conformanceStatus === 'production-approved' && provider.capabilities.includes(requiredCapability) && validProviderEvidenceCount > 0);
    const providerBindingGap = providerCertificationEnabled && !plan.providerConnectorId;
    const providerCertificationGap = providerCertificationEnabled && !providerBindingGap && !providerCapabilityReady;
    const nextAction: RetailReportDeliveryNextAction = plan.status === 'draft'
      ? 'approve-plan'
      : consentGapCount > 0
        ? 'record-consent'
        : failedAttemptCount > 0 || unresolvedAttemptCount > 0
          ? 'resolve-attempt'
        : plan.status !== 'approved'
            ? 'approve-plan'
            : providerBindingGap
              ? 'bind-provider'
              : providerCertificationGap
                ? 'complete-provider-certification'
            : acknowledgedAttemptCount === 0
              ? 'complete-provider-certification'
              : 'ready';
    const providerState: RetailReportDeliveryProviderState = plan.status !== 'approved' || consentGapCount > 0 || failedAttemptCount > 0 || unresolvedAttemptCount > 0
      ? 'internal-blocked'
      : providerBindingGap || providerCertificationGap || acknowledgedAttemptCount === 0
        ? 'external-certification'
        : 'ready';
    return {
      planId: plan.id,
      planNumber: plan.number,
      reportPackId: plan.reportPackId,
      channel: plan.channel,
      frequency: plan.frequency,
      status: plan.status,
      recipientCount: plan.recipients.length,
      consentGapCount,
      attemptCount: planAttempts.length,
      preparedAttemptCount,
      handedOffAttemptCount,
      acknowledgedAttemptCount,
      failedAttemptCount,
      providerConnectorId: plan.providerConnectorId,
      providerCode: provider?.code,
      providerCapabilityReady,
      providerConformanceEvidenceCount: validProviderEvidenceCount,
      providerState,
      nextAction,
      actionRequired: nextAction !== 'ready',
    };
  }).sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || left.planNumber.localeCompare(right.planNumber));
  return {
    fromDate,
    toDate,
    planCount: rows.length,
    approvedPlanCount: rows.filter(({ status }) => status === 'approved').length,
    draftPlanCount: rows.filter(({ status }) => status === 'draft').length,
    pausedPlanCount: rows.filter(({ status }) => status === 'paused').length,
    rejectedPlanCount: rows.filter(({ status }) => status === 'rejected').length,
    recipientCount: rows.reduce((total, row) => total + row.recipientCount, 0),
    consentGapCount: rows.reduce((total, row) => total + row.consentGapCount, 0),
    attemptCount: rows.reduce((total, row) => total + row.attemptCount, 0),
    preparedAttemptCount: rows.reduce((total, row) => total + row.preparedAttemptCount, 0),
    handedOffAttemptCount: rows.reduce((total, row) => total + row.handedOffAttemptCount, 0),
    acknowledgedAttemptCount: rows.reduce((total, row) => total + row.acknowledgedAttemptCount, 0),
    failedAttemptCount: rows.reduce((total, row) => total + row.failedAttemptCount, 0),
    providerBoundPlanCount: rows.filter(({ providerConnectorId }) => Boolean(providerConnectorId)).length,
    providerReadyPlanCount: rows.filter(({ providerCapabilityReady }) => providerCapabilityReady).length,
    unboundPlanCount: rows.filter(({ providerConnectorId }) => !providerConnectorId).length,
    externalCertificationGates: rows.filter(({ providerState }) => providerState === 'external-certification').length,
    actionRequired: rows.some(({ actionRequired }) => actionRequired),
    rows,
  };
}

// ---------------------------------------------------------------------------
// 14. Retail Commission Payout Readiness Report
// ---------------------------------------------------------------------------

export interface RetailPayoutReadinessInput {
  allCommissions: RetailSalesCommission[];
  allBatches: RetailCommissionPayoutBatch[];
  providerConnectors: ProviderConnector[];
  providerConformanceCases: ProviderConformanceCase[];
  fromDate: string;
  toDate: string;
}

export type RetailPayoutProviderGate = 'ready' | 'external-certification';
export type RetailPayoutProviderState = 'ready' | 'external-certification';

export interface RetailPayoutReadinessRow {
  batchId: string;
  batchNumber: string;
  payoutDate: string;
  status: RetailCommissionPayoutBatch['status'];
  commissionCount: number;
  totalAmount: number;
  pendingCount: number;
  approvedCount: number;
  paidCount: number;
  providerState: RetailPayoutProviderState;
  actionRequired: boolean;
}

export interface RetailPayoutReadinessReport {
  fromDate: string;
  toDate: string;
  providerGate: RetailPayoutProviderGate;
  batchCount: number;
  submittedBatchCount: number;
  approvedBatchCount: number;
  releasedBatchCount: number;
  rejectedBatchCount: number;
  submittedAmount: number;
  approvedAmount: number;
  releasedAmount: number;
  rejectedAmount: number;
  unbatchedApprovedCount: number;
  unbatchedApprovedAmount: number;
  actionRequired: boolean;
  rows: RetailPayoutReadinessRow[];
}

export function computeRetailPayoutReadiness({ allCommissions, allBatches, providerConnectors, providerConformanceCases, fromDate, toDate }: RetailPayoutReadinessInput): RetailPayoutReadinessReport {
  const inRange = (date: string) => date >= fromDate && date <= toDate;
  const providerGate: RetailPayoutProviderGate = providerConnectors.some((connector) => {
    if (!connector.active || connector.domain !== 'banking' || connector.environment !== 'production' || connector.credentialStatus !== 'configured' || connector.conformanceStatus !== 'production-approved' || !connector.capabilities.includes('payment-release')) return false;
    return providerConformanceCases.some((test) => test.connectorId === connector.id && test.environment === 'production' && test.result === 'passed');
  }) ? 'ready' : 'external-certification';
  const commissionById = new Map(allCommissions.map((commission) => [commission.id, commission]));
  const batches = allBatches.filter((batch) => inRange(batch.payoutDate));
  const rows = batches.map((batch) => {
    const commissions = batch.commissionIds.map((id) => commissionById.get(id)).filter((commission): commission is RetailSalesCommission => Boolean(commission));
    const providerState: RetailPayoutProviderState = providerGate;
    return {
      batchId: batch.id,
      batchNumber: batch.number,
      payoutDate: batch.payoutDate,
      status: batch.status,
      commissionCount: commissions.length,
      totalAmount: round2(batch.totalAmount),
      pendingCount: commissions.filter(({ status }) => status === 'pending').length,
      approvedCount: commissions.filter(({ status }) => status === 'approved').length,
      paidCount: commissions.filter(({ status }) => status === 'paid').length,
      providerState,
      actionRequired: batch.status !== 'released' || providerState !== 'ready',
    } satisfies RetailPayoutReadinessRow;
  }).sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || right.payoutDate.localeCompare(left.payoutDate));
  const batchedCommissionIds = new Set(batches.flatMap(({ commissionIds }) => commissionIds));
  const unbatchedApproved = allCommissions.filter((commission) => inRange(isoDate(commission.createdAt)) && commission.status === 'approved' && !commission.payoutBatchId && !batchedCommissionIds.has(commission.id));
  const amountByStatus = (status: RetailCommissionPayoutBatch['status']) => round2(batches.filter((batch) => batch.status === status).reduce((total, batch) => total + batch.totalAmount, 0));
  return {
    fromDate,
    toDate,
    providerGate,
    batchCount: batches.length,
    submittedBatchCount: batches.filter(({ status }) => status === 'submitted').length,
    approvedBatchCount: batches.filter(({ status }) => status === 'approved').length,
    releasedBatchCount: batches.filter(({ status }) => status === 'released').length,
    rejectedBatchCount: batches.filter(({ status }) => status === 'rejected').length,
    submittedAmount: amountByStatus('submitted'),
    approvedAmount: amountByStatus('approved'),
    releasedAmount: amountByStatus('released'),
    rejectedAmount: amountByStatus('rejected'),
    unbatchedApprovedCount: unbatchedApproved.length,
    unbatchedApprovedAmount: round2(unbatchedApproved.reduce((total, commission) => total + commission.commissionAmount, 0)),
    actionRequired: providerGate !== 'ready' || rows.some((row) => row.actionRequired) || unbatchedApproved.length > 0,
    rows,
  };
}

// ---------------------------------------------------------------------------
// 15. Unified retail payout-rail readiness (banking + payroll)
// ---------------------------------------------------------------------------

export interface RetailPayoutRailReadinessInput {
  providerConnectors: ProviderConnector[];
  providerConformanceCases: ProviderConformanceCase[];
  providerSubmissions: ProviderSubmission[];
  providerReconciliationRuns: ProviderReconciliationRun[];
  commissionBatches: RetailCommissionPayoutBatch[];
  payrollRuns: ProjectedPayrollRun[];
  fromDate: string;
  toDate: string;
}

export type RetailPayoutRailProviderState = 'ready' | 'external-certification' | 'internal-blocked';
export type RetailPayoutRailNextAction = 'ready' | 'configure-certification' | 'resolve-handoff' | 'reconcile' | 'release-payouts' | 'finalize-payroll';

export interface RetailPayoutRailReadinessRow {
  connectorId: string;
  connectorCode: string;
  connectorName: string;
  providerLegalName: string;
  domain: 'banking' | 'payroll';
  environment: ProviderConnector['environment'];
  providerState: RetailPayoutRailProviderState;
  requiredCapabilityCount: number;
  configuredCapabilityCount: number;
  missingCapabilityCount: number;
  conformanceCaseCount: number;
  validConformanceCaseCount: number;
  pendingSubmissionCount: number;
  reconciliationDriftCount: number;
  nextAction: RetailPayoutRailNextAction;
  actionRequired: boolean;
}

export interface RetailPayoutRailReadinessReport {
  fromDate: string;
  toDate: string;
  connectorCount: number;
  productionReadyCount: number;
  externalCertificationGates: number;
  internalBlockerCount: number;
  pendingSubmissionCount: number;
  reconciliationDriftCount: number;
  commissionBatchCount: number;
  commissionApprovedBatchCount: number;
  commissionReleasedBatchCount: number;
  commissionApprovedAmount: number;
  commissionReleasedAmount: number;
  payrollRunCount: number;
  payrollFinalizedCount: number;
  payrollPendingCount: number;
  payrollNetPay: number;
  actionRequired: boolean;
  rows: RetailPayoutRailReadinessRow[];
}

function payoutRailRequiredCapabilities(domain: ProviderConnector['domain']): ProviderConnector['capabilities'] {
  return domain === 'banking' ? ['payment-release', 'payment-status-pull'] : ['payroll-disbursement', 'payroll-status-pull'];
}

function hasValidProviderEvidence(item: ProviderConformanceCase, connector: ProviderConnector): boolean {
  return item.connectorId === connector.id
    && item.environment === connector.environment
    && item.result === 'passed'
    && Boolean(item.evidenceReference?.trim())
    && /^[a-f0-9]{64}$/i.test(item.resultChecksum ?? '')
    && Boolean(item.assessedBy?.trim())
    && Boolean(item.assessedAt)
    && Number.isFinite(Date.parse(item.assessedAt!))
    && providerConformanceMatchesCredentialRevision(connector, item);
}

/**
 * Combines the banking rail used for commission releases and the payroll rail
 * used for employee net-pay disbursements. It is intentionally a projection:
 * a local handoff, checksum, or mock connector never implies money moved.
 */
export function computeRetailPayoutRailReadiness({ providerConnectors, providerConformanceCases, providerSubmissions, providerReconciliationRuns, commissionBatches, payrollRuns, fromDate, toDate }: RetailPayoutRailReadinessInput): RetailPayoutRailReadinessReport {
  const inRange = (date: string) => date.slice(0, 10) >= fromDate && date.slice(0, 10) <= toDate;
  const periodCommissionBatches = commissionBatches.filter((batch) => inRange(batch.payoutDate));
  const periodPayrollRuns = payrollRuns.filter((run) => inRange(run.paymentDate) || (run.periodFrom <= toDate && run.periodTo >= fromDate));
  const commissionApprovedBatchCount = periodCommissionBatches.filter(({ status }) => status === 'approved').length;
  const commissionReleasedBatchCount = periodCommissionBatches.filter(({ status }) => status === 'released').length;
  const commissionApprovedAmount = round2(periodCommissionBatches.filter(({ status }) => status === 'approved').reduce((total, batch) => total + batch.totalAmount, 0));
  const commissionReleasedAmount = round2(periodCommissionBatches.filter(({ status }) => status === 'released').reduce((total, batch) => total + batch.totalAmount, 0));
  const payrollFinalizedCount = periodPayrollRuns.filter(({ status }) => status === 'finalized').length;
  const payrollPendingCount = periodPayrollRuns.filter(({ status }) => ['submitted', 'approved'].includes(status)).length;
  const payrollNetPay = round2(periodPayrollRuns.reduce((total, run) => total + (run.totalNetPay ?? 0), 0));
  const activeRails = providerConnectors.filter((connector): connector is ProviderConnector & { domain: 'banking' | 'payroll' } => connector.active && (connector.domain === 'banking' || connector.domain === 'payroll'));
  const obligationsByDomain = {
    banking: commissionApprovedBatchCount,
    payroll: payrollPendingCount,
  } as const;
  const buildRow = (connector: ProviderConnector & { domain: 'banking' | 'payroll' }): RetailPayoutRailReadinessRow => {
    const required = payoutRailRequiredCapabilities(connector.domain);
    const missing = required.filter((capability) => !connector.capabilities.includes(capability));
    const cases = providerConformanceCases.filter((item) => item.connectorId === connector.id);
    const validCases = cases.filter((item) => hasValidProviderEvidence(item, connector));
    const externalReady = connector.environment === 'production'
      && connector.credentialStatus === 'configured'
      && connector.conformanceStatus === 'production-approved'
      && missing.length === 0
      && validCases.length >= required.length;
    const pendingSubmissionCount = providerSubmissions.filter((submission) => submission.connectorId === connector.id && ['prepared', 'handed-off'].includes(submission.status) && inRange(submission.preparedAt)).length;
    const reconciliationDriftCount = providerReconciliationRuns.filter((run) => run.connectorId === connector.id && inRange(run.requestedAt)).reduce((total, run) => total + run.items.filter(({ result }) => result !== 'matched').length, 0);
    const obligationPending = obligationsByDomain[connector.domain] > 0;
    const nextAction: RetailPayoutRailNextAction = !externalReady
      ? 'configure-certification'
      : pendingSubmissionCount > 0
        ? 'resolve-handoff'
        : reconciliationDriftCount > 0
          ? 'reconcile'
          : connector.domain === 'banking' && obligationPending
            ? 'release-payouts'
            : connector.domain === 'payroll' && obligationPending
              ? 'finalize-payroll'
              : 'ready';
    const providerState: RetailPayoutRailProviderState = !externalReady
      ? 'external-certification'
      : nextAction === 'ready'
        ? 'ready'
        : 'internal-blocked';
    return {
      connectorId: connector.id,
      connectorCode: connector.code,
      connectorName: connector.name,
      providerLegalName: connector.providerLegalName,
      domain: connector.domain,
      environment: connector.environment,
      providerState,
      requiredCapabilityCount: required.length,
      configuredCapabilityCount: required.length - missing.length,
      missingCapabilityCount: missing.length,
      conformanceCaseCount: cases.length,
      validConformanceCaseCount: validCases.length,
      pendingSubmissionCount,
      reconciliationDriftCount,
      nextAction,
      actionRequired: nextAction !== 'ready',
    };
  };
  const rows = activeRails.map(buildRow);
  const missingDomainObligations = (['banking', 'payroll'] as const).filter((domain) => obligationsByDomain[domain] > 0 && !activeRails.some((connector) => connector.domain === domain));
  missingDomainObligations.forEach((domain) => rows.push({
    connectorId: `unconfigured-${domain}`,
    connectorCode: domain === 'banking' ? 'BANKING-UNCONFIGURED' : 'PAYROLL-UNCONFIGURED',
    connectorName: 'No production connector configured',
    providerLegalName: 'Provider selection required',
    domain,
    environment: 'sandbox',
    providerState: 'external-certification',
    requiredCapabilityCount: payoutRailRequiredCapabilities(domain).length,
    configuredCapabilityCount: 0,
    missingCapabilityCount: payoutRailRequiredCapabilities(domain).length,
    conformanceCaseCount: 0,
    validConformanceCaseCount: 0,
    pendingSubmissionCount: 0,
    reconciliationDriftCount: 0,
    nextAction: 'configure-certification',
    actionRequired: true,
  }));
  rows.sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || left.domain.localeCompare(right.domain) || left.connectorCode.localeCompare(right.connectorCode));
  const pendingSubmissionCount = rows.reduce((total, row) => total + row.pendingSubmissionCount, 0);
  const reconciliationDriftCount = rows.reduce((total, row) => total + row.reconciliationDriftCount, 0);
  const externalCertificationGates = rows.filter(({ providerState }) => providerState === 'external-certification').length;
  const internalBlockerCount = rows.filter(({ providerState }) => providerState === 'internal-blocked').length;
  return {
    fromDate,
    toDate,
    connectorCount: rows.length,
    productionReadyCount: rows.filter(({ providerState }) => providerState !== 'external-certification').length,
    externalCertificationGates,
    internalBlockerCount,
    pendingSubmissionCount,
    reconciliationDriftCount,
    commissionBatchCount: periodCommissionBatches.length,
    commissionApprovedBatchCount,
    commissionReleasedBatchCount,
    commissionApprovedAmount,
    commissionReleasedAmount,
    payrollRunCount: periodPayrollRuns.length,
    payrollFinalizedCount,
    payrollPendingCount,
    payrollNetPay,
    actionRequired: rows.some(({ actionRequired }) => actionRequired),
    rows,
  };
}

// ---------------------------------------------------------------------------
// 13. Retail Supplier-Invoice OCR Readiness Report
// ---------------------------------------------------------------------------

export interface RetailOcrReadinessInput {
  providers: RetailOcrProviderProfile[];
  documents: RetailPurchaseOcrDocument[];
  mappings: RetailPurchaseOcrMapping[];
  exceptions: RetailPurchaseException[];
  fromDate: string;
  toDate: string;
}

export type RetailOcrProviderState = 'ready' | 'external-certification';

export interface RetailOcrReadinessRow {
  providerId?: string;
  providerCode: string;
  providerName: string;
  providerState: RetailOcrProviderState;
  documentCount: number;
  convertedDocumentCount: number;
  approvedDocumentCount: number;
  reviewDocumentCount: number;
  averageConfidencePct: number;
  openExceptionCount: number;
  criticalExceptionCount: number;
  mappingPendingCount: number;
  convertedValue: number;
  actionRequired: boolean;
}

export interface RetailOcrReadinessReport {
  fromDate: string;
  toDate: string;
  providerCount: number;
  certifiedProviderCount: number;
  documentCount: number;
  convertedDocumentCount: number;
  approvedDocumentCount: number;
  reviewDocumentCount: number;
  rejectedDocumentCount: number;
  averageConfidencePct: number;
  convertedValue: number;
  openExceptionCount: number;
  criticalExceptionCount: number;
  mappingPendingCount: number;
  unassignedDocumentCount: number;
  externalCertificationGates: number;
  actionRequired: boolean;
  rows: RetailOcrReadinessRow[];
}

export function computeRetailOcrReadiness({ providers, documents, mappings, exceptions, fromDate, toDate }: RetailOcrReadinessInput): RetailOcrReadinessReport {
  const inRange = (document: RetailPurchaseOcrDocument) => document.submittedAt.slice(0, 10) >= fromDate && document.submittedAt.slice(0, 10) <= toDate;
  const periodDocuments = documents.filter(inRange);
  const documentsByProvider = new Map<string, RetailPurchaseOcrDocument[]>();
  periodDocuments.forEach((document) => {
    const key = document.ocrProviderProfileId ?? '__unassigned';
    documentsByProvider.set(key, [...(documentsByProvider.get(key) ?? []), document]);
  });
  const buildRow = (provider: RetailOcrProviderProfile | undefined, key: string): RetailOcrReadinessRow => {
    const providerDocuments = documentsByProvider.get(key) ?? [];
    const providerExceptions = exceptions.filter((exception) => providerDocuments.some(({ id }) => id === exception.ocrDocumentId) && ['open', 'acknowledged'].includes(exception.status));
    const documentMappings = new Map(mappings.filter((mapping) => providerDocuments.some(({ id }) => id === mapping.ocrDocumentId)).map((mapping) => [mapping.ocrDocumentId, mapping]));
    const mappingPendingCount = providerDocuments.filter((document) => document.status !== 'rejected' && documentMappings.get(document.id)?.status !== 'applied').length;
    const providerReady = Boolean(provider && provider.status === 'certified' && provider.credentialStatus === 'configured');
    const state: RetailOcrProviderState = providerReady ? 'ready' : 'external-certification';
    return {
      providerId: provider?.id,
      providerCode: provider?.code ?? 'UNASSIGNED',
      providerName: provider?.name ?? 'Unassigned / manual intake',
      providerState: state,
      documentCount: providerDocuments.length,
      convertedDocumentCount: providerDocuments.filter(({ status }) => status === 'converted').length,
      approvedDocumentCount: providerDocuments.filter(({ status }) => status === 'approved').length,
      reviewDocumentCount: providerDocuments.filter(({ status }) => status === 'review' || status === 'received').length,
      averageConfidencePct: providerDocuments.length ? round2(providerDocuments.reduce((total, document) => total + document.extractionConfidence * 100, 0) / providerDocuments.length) : 0,
      openExceptionCount: providerExceptions.length,
      criticalExceptionCount: providerExceptions.filter(({ severity }) => severity === 'critical').length,
      mappingPendingCount,
      convertedValue: round2(providerDocuments.filter(({ status }) => status === 'converted').reduce((total, document) => total + (document.extractedTotalAmount ?? 0), 0)),
      actionRequired: state !== 'ready' || providerExceptions.length > 0 || mappingPendingCount > 0 || providerDocuments.some(({ status }) => status === 'review' || status === 'received'),
    };
  };
  const rows = providers.map((provider) => buildRow(provider, provider.id));
  if (documentsByProvider.has('__unassigned')) rows.push(buildRow(undefined, '__unassigned'));
  rows.sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || right.documentCount - left.documentCount);
  const openExceptions = exceptions.filter((exception) => periodDocuments.some(({ id }) => id === exception.ocrDocumentId) && ['open', 'acknowledged'].includes(exception.status));
  const confidence = periodDocuments.length ? round2(periodDocuments.reduce((total, document) => total + document.extractionConfidence * 100, 0) / periodDocuments.length) : 0;
  return {
    fromDate,
    toDate,
    providerCount: providers.length,
    certifiedProviderCount: providers.filter((provider) => provider.status === 'certified' && provider.credentialStatus === 'configured').length,
    documentCount: periodDocuments.length,
    convertedDocumentCount: periodDocuments.filter(({ status }) => status === 'converted').length,
    approvedDocumentCount: periodDocuments.filter(({ status }) => status === 'approved').length,
    reviewDocumentCount: periodDocuments.filter(({ status }) => status === 'review' || status === 'received').length,
    rejectedDocumentCount: periodDocuments.filter(({ status }) => status === 'rejected').length,
    averageConfidencePct: confidence,
    convertedValue: round2(periodDocuments.filter(({ status }) => status === 'converted').reduce((total, document) => total + (document.extractedTotalAmount ?? 0), 0)),
    openExceptionCount: openExceptions.length,
    criticalExceptionCount: openExceptions.filter(({ severity }) => severity === 'critical').length,
    mappingPendingCount: rows.reduce((total, row) => total + row.mappingPendingCount, 0),
    unassignedDocumentCount: documentsByProvider.get('__unassigned')?.length ?? 0,
    externalCertificationGates: rows.filter((row) => row.providerState === 'external-certification').length,
    actionRequired: rows.some((row) => row.actionRequired),
    rows,
  };
}

// ---------------------------------------------------------------------------
// 16. Supplier-invoice OCR adapter certification readiness
// ---------------------------------------------------------------------------

export interface RetailOcrAdapterReadinessInput {
  providers: RetailOcrProviderProfile[];
  documents: RetailPurchaseOcrDocument[];
  exceptions: RetailPurchaseException[];
  fromDate: string;
  toDate: string;
}

export type RetailOcrAdapterProviderState = 'ready' | 'external-certification' | 'internal-blocked';
export type RetailOcrAdapterNextAction = 'ready' | 'complete-adapter-certification' | 'resolve-exceptions' | 'improve-field-coverage';

export interface RetailOcrAdapterReadinessRow {
  providerId?: string;
  providerCode: string;
  providerName: string;
  providerState: RetailOcrAdapterProviderState;
  adapterCertified: boolean;
  credentialReady: boolean;
  supplierInvoiceSupported: boolean;
  testEvidenceReady: boolean;
  documentCount: number;
  headerCompleteCount: number;
  lineCompleteCount: number;
  headerCoveragePct: number;
  lineCoveragePct: number;
  openExceptionCount: number;
  criticalExceptionCount: number;
  nextAction: RetailOcrAdapterNextAction;
  actionRequired: boolean;
}

export interface RetailOcrAdapterReadinessReport {
  fromDate: string;
  toDate: string;
  providerCount: number;
  certifiedAdapterCount: number;
  externalCertificationGates: number;
  documentCount: number;
  headerCompleteCount: number;
  lineCompleteCount: number;
  headerCoveragePct: number;
  lineCoveragePct: number;
  openExceptionCount: number;
  criticalExceptionCount: number;
  actionRequired: boolean;
  rows: RetailOcrAdapterReadinessRow[];
}

function isSha256(value: string | undefined): boolean {
  return /^[a-f0-9]{64}$/i.test(value ?? '');
}

/**
 * Validates the adapter boundary itself, separately from document confidence.
 * A certified-looking local profile is not production-ready without an
 * independently attributed replay, credentials, supported document kind, and
 * checksummed evidence.
 */
export function computeRetailOcrAdapterReadiness({ providers, documents, exceptions, fromDate, toDate }: RetailOcrAdapterReadinessInput): RetailOcrAdapterReadinessReport {
  const periodDocuments = documents.filter((document) => isoDate(document.submittedAt) >= fromDate && isoDate(document.submittedAt) <= toDate);
  const docsByProvider = new Map<string, RetailPurchaseOcrDocument[]>();
  periodDocuments.forEach((document) => {
    const key = document.ocrProviderProfileId ?? '__unassigned';
    docsByProvider.set(key, [...(docsByProvider.get(key) ?? []), document]);
  });
  const buildRow = (provider: RetailOcrProviderProfile | undefined, key: string): RetailOcrAdapterReadinessRow => {
    const providerDocuments = docsByProvider.get(key) ?? [];
    const headerComplete = (document: RetailPurchaseOcrDocument) => Boolean(document.extractedInvoiceNumber?.trim() && document.extractedInvoiceDate && document.extractedSupplierGstin?.trim() && Number.isFinite(document.extractedTotalAmount));
    const lineComplete = (document: RetailPurchaseOcrDocument) => document.lines.length > 0 && document.lines.every((line) => Boolean(line.description.trim()) && Number.isFinite(line.quantity) && line.quantity > 0 && Number.isFinite(line.unitPrice) && line.unitPrice >= 0 && Number.isFinite(line.gstRate) && line.gstRate >= 0 && Number.isFinite(line.confidence));
    const headerCompleteCount = providerDocuments.filter(headerComplete).length;
    const lineCompleteCount = providerDocuments.filter(lineComplete).length;
    const providerExceptions = exceptions.filter((exception) => providerDocuments.some(({ id }) => id === exception.ocrDocumentId) && ['open', 'acknowledged'].includes(exception.status));
    const credentialReady = Boolean(provider && provider.credentialStatus === 'configured');
    const supplierInvoiceSupported = Boolean(provider?.supportedDocumentKinds.includes('supplier-invoice'));
    const testEvidenceReady = Boolean(provider && provider.lastTestEvidence?.trim() && provider.lastTestedAt && Number.isFinite(Date.parse(provider.lastTestedAt)) && provider.lastTestedBy?.trim() && provider.lastTestedBy !== provider.createdBy && isSha256(provider.lastTestChecksum));
    const adapterCertified = Boolean(provider && provider.status === 'certified' && credentialReady && supplierInvoiceSupported && testEvidenceReady);
    const headerCoveragePct = providerDocuments.length ? round2((headerCompleteCount / providerDocuments.length) * 100) : 100;
    const lineCoveragePct = providerDocuments.length ? round2((lineCompleteCount / providerDocuments.length) * 100) : 100;
    const nextAction: RetailOcrAdapterNextAction = !adapterCertified
      ? 'complete-adapter-certification'
      : providerExceptions.length > 0
        ? 'resolve-exceptions'
        : headerCompleteCount < providerDocuments.length || lineCompleteCount < providerDocuments.length
          ? 'improve-field-coverage'
          : 'ready';
    const providerState: RetailOcrAdapterProviderState = !adapterCertified ? 'external-certification' : nextAction === 'ready' ? 'ready' : 'internal-blocked';
    return {
      providerId: provider?.id,
      providerCode: provider?.code ?? 'UNASSIGNED',
      providerName: provider?.name ?? 'Unassigned / manual intake',
      providerState,
      adapterCertified,
      credentialReady,
      supplierInvoiceSupported,
      testEvidenceReady,
      documentCount: providerDocuments.length,
      headerCompleteCount,
      lineCompleteCount,
      headerCoveragePct,
      lineCoveragePct,
      openExceptionCount: providerExceptions.length,
      criticalExceptionCount: providerExceptions.filter(({ severity }) => severity === 'critical').length,
      nextAction,
      actionRequired: nextAction !== 'ready',
    };
  };
  const rows = providers.map((provider) => buildRow(provider, provider.id));
  if (docsByProvider.has('__unassigned')) rows.push(buildRow(undefined, '__unassigned'));
  rows.sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || left.providerCode.localeCompare(right.providerCode));
  const headerCompleteCount = rows.reduce((total, row) => total + row.headerCompleteCount, 0);
  const lineCompleteCount = rows.reduce((total, row) => total + row.lineCompleteCount, 0);
  const openExceptionCount = rows.reduce((total, row) => total + row.openExceptionCount, 0);
  const criticalExceptionCount = rows.reduce((total, row) => total + row.criticalExceptionCount, 0);
  return {
    fromDate,
    toDate,
    providerCount: providers.length,
    certifiedAdapterCount: providers.filter((provider) => rows.some((row) => row.providerId === provider.id && row.adapterCertified)).length,
    externalCertificationGates: rows.filter(({ providerState }) => providerState === 'external-certification').length,
    documentCount: periodDocuments.length,
    headerCompleteCount,
    lineCompleteCount,
    headerCoveragePct: periodDocuments.length ? round2((headerCompleteCount / periodDocuments.length) * 100) : 100,
    lineCoveragePct: periodDocuments.length ? round2((lineCompleteCount / periodDocuments.length) * 100) : 100,
    openExceptionCount,
    criticalExceptionCount,
    actionRequired: rows.some(({ actionRequired }) => actionRequired),
    rows,
  };
}

// ---------------------------------------------------------------------------
// 16b. OCR document-kind certification matrix
// ---------------------------------------------------------------------------

export type RetailOcrDocumentCertificationStatus = 'ready' | 'needs-evidence';

export interface RetailOcrDocumentCertificationRow {
  providerId: string;
  providerCode: string;
  providerName: string;
  documentKind: RetailOcrDocumentKind;
  status: RetailOcrDocumentCertificationStatus;
  evidenceReference?: string;
  testedBy?: string;
  testedAt?: string;
  nextAction: string;
  actionRequired: boolean;
}

export interface RetailOcrDocumentCertificationReport {
  providerCount: number;
  kindCount: number;
  readyCount: number;
  evidenceGaps: number;
  actionRequired: boolean;
  rows: RetailOcrDocumentCertificationRow[];
}

/**
 * Makes OCR certification granular by declared document kind. Legacy aggregate
 * test fields remain visible in the adapter report, but they cannot satisfy this
 * matrix unless the provider has recorded explicit kind-level evidence.
 */
export function computeRetailOcrDocumentCertification({ providers }: { providers: RetailOcrProviderProfile[] }): RetailOcrDocumentCertificationReport {
  const rows = providers.flatMap((provider) => provider.supportedDocumentKinds.map((documentKind): RetailOcrDocumentCertificationRow => {
    const evidence = provider.testEvidenceByDocumentKind?.[documentKind];
    const validEvidence = Boolean(provider.status === 'certified' && provider.credentialStatus === 'configured' && evidence?.evidence.trim() && evidence.testedBy.trim() && evidence.testedBy !== provider.createdBy && evidence.testedAt && Number.isFinite(Date.parse(evidence.testedAt)) && isSha256(evidence.checksum) && retailOcrEvidenceMatchesCredentialRevision(provider, evidence));
    const status: RetailOcrDocumentCertificationStatus = validEvidence ? 'ready' : 'needs-evidence';
    return {
      providerId: provider.id,
      providerCode: provider.code,
      providerName: provider.name,
      documentKind,
      status,
      evidenceReference: evidence?.evidence,
      testedBy: evidence?.testedBy,
      testedAt: evidence?.testedAt,
      nextAction: status === 'ready' ? 'Kind-level replay evidence is complete.' : `Record independent ${documentKind} adapter replay evidence.`,
      actionRequired: status !== 'ready',
    };
  }));
  rows.sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || left.providerCode.localeCompare(right.providerCode) || left.documentKind.localeCompare(right.documentKind));
  return { providerCount: providers.length, kindCount: rows.length, readyCount: rows.filter(({ status }) => status === 'ready').length, evidenceGaps: rows.filter(({ status }) => status !== 'ready').length, actionRequired: rows.some(({ actionRequired }) => actionRequired), rows };
}

// ---------------------------------------------------------------------------
// 14. Inter-branch Stock Movement Readiness Report
// ---------------------------------------------------------------------------

export interface RetailInterBranchReadinessInput {
  transfers: RetailInterBranchTransfer[];
  fromDate: string;
  toDate: string;
}

export type RetailInterBranchNextStep = 'approve' | 'dispatch' | 'arrive' | 'evidence' | 'none';

export interface RetailInterBranchReadinessRow {
  transferId: string;
  transferNumber: string;
  direction: RetailInterBranchTransfer['direction'];
  originBranchId: string;
  destinationBranchId: string;
  status: RetailInterBranchTransfer['status'];
  requestedAt: string;
  totalValue: number;
  inTransitValue: number;
  pendingNextStep: RetailInterBranchNextStep;
  missingEvidenceCount: number;
  missingJournalCount: number;
  actionRequired: boolean;
}

export interface RetailInterBranchReadinessReport {
  fromDate: string;
  toDate: string;
  transferCount: number;
  routeCount: number;
  draftCount: number;
  approvedCount: number;
  dispatchedCount: number;
  arrivedCount: number;
  rejectedCount: number;
  cancelledCount: number;
  inTransitCount: number;
  totalValue: number;
  arrivedValue: number;
  inTransitValue: number;
  pendingApprovalCount: number;
  pendingDispatchCount: number;
  pendingArrivalCount: number;
  approvalEvidenceCount: number;
  dispatchEvidenceCount: number;
  arrivalEvidenceCount: number;
  dispatchJournalCount: number;
  arrivalJournalCount: number;
  missingEvidenceCount: number;
  missingJournalCount: number;
  actionRequired: boolean;
  rows: RetailInterBranchReadinessRow[];
}

export function computeRetailInterBranchReadiness({ transfers, fromDate, toDate }: RetailInterBranchReadinessInput): RetailInterBranchReadinessReport {
  const periodTransfers = transfers.filter((transfer) => isoDate(transfer.requestedAt) >= fromDate && isoDate(transfer.requestedAt) <= toDate);
  const buildRow = (transfer: RetailInterBranchTransfer): RetailInterBranchReadinessRow => {
    const terminal = transfer.status === 'rejected' || transfer.status === 'cancelled';
    const missingEvidenceCount = terminal ? 0 : [transfer.approvalEvidenceReference, transfer.status === 'draft' ? 'not-required' : transfer.dispatchEvidenceReference, transfer.status === 'arrived' ? transfer.arrivalEvidenceReference : 'not-required'].filter((reference) => !reference).length;
    const missingJournalCount = terminal ? 0 : [transfer.status === 'draft' || transfer.status === 'approved' ? 'not-required' : transfer.dispatchJournalDraftId, transfer.status === 'arrived' ? transfer.arrivalJournalDraftId : 'not-required'].filter((reference) => !reference).length;
    const pendingNextStep: RetailInterBranchNextStep = terminal ? 'none' : transfer.status === 'draft' ? 'approve' : transfer.status === 'approved' ? 'dispatch' : transfer.status === 'dispatched' ? 'arrive' : (missingEvidenceCount + missingJournalCount > 0 ? 'evidence' : 'none');
    return {
      transferId: transfer.id,
      transferNumber: transfer.number,
      direction: transfer.direction,
      originBranchId: transfer.originBranchId,
      destinationBranchId: transfer.destinationBranchId,
      status: transfer.status,
      requestedAt: transfer.requestedAt,
      totalValue: round2(transfer.totalValue),
      inTransitValue: transfer.status === 'dispatched' ? round2(transfer.totalValue) : 0,
      pendingNextStep,
      missingEvidenceCount,
      missingJournalCount,
      actionRequired: pendingNextStep !== 'none',
    };
  };
  const rows = periodTransfers.map(buildRow).sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || right.requestedAt.localeCompare(left.requestedAt));
  const routes = new Set(periodTransfers.map((transfer) => `${transfer.originBranchId}:${transfer.destinationBranchId}:${transfer.direction}`));
  return {
    fromDate,
    toDate,
    transferCount: periodTransfers.length,
    routeCount: routes.size,
    draftCount: periodTransfers.filter(({ status }) => status === 'draft').length,
    approvedCount: periodTransfers.filter(({ status }) => status === 'approved').length,
    dispatchedCount: periodTransfers.filter(({ status }) => status === 'dispatched').length,
    arrivedCount: periodTransfers.filter(({ status }) => status === 'arrived').length,
    rejectedCount: periodTransfers.filter(({ status }) => status === 'rejected').length,
    cancelledCount: periodTransfers.filter(({ status }) => status === 'cancelled').length,
    inTransitCount: periodTransfers.filter(({ status }) => status === 'dispatched').length,
    totalValue: round2(periodTransfers.reduce((total, transfer) => total + transfer.totalValue, 0)),
    arrivedValue: round2(periodTransfers.filter(({ status }) => status === 'arrived').reduce((total, transfer) => total + transfer.totalValue, 0)),
    inTransitValue: round2(periodTransfers.filter(({ status }) => status === 'dispatched').reduce((total, transfer) => total + transfer.totalValue, 0)),
    pendingApprovalCount: periodTransfers.filter(({ status }) => status === 'draft').length,
    pendingDispatchCount: periodTransfers.filter(({ status }) => status === 'approved').length,
    pendingArrivalCount: periodTransfers.filter(({ status }) => status === 'dispatched').length,
    approvalEvidenceCount: periodTransfers.filter(({ approvalEvidenceReference }) => Boolean(approvalEvidenceReference)).length,
    dispatchEvidenceCount: periodTransfers.filter(({ dispatchEvidenceReference }) => Boolean(dispatchEvidenceReference)).length,
    arrivalEvidenceCount: periodTransfers.filter(({ arrivalEvidenceReference }) => Boolean(arrivalEvidenceReference)).length,
    dispatchJournalCount: periodTransfers.filter(({ dispatchJournalDraftId }) => Boolean(dispatchJournalDraftId)).length,
    arrivalJournalCount: periodTransfers.filter(({ arrivalJournalDraftId }) => Boolean(arrivalJournalDraftId)).length,
    missingEvidenceCount: rows.reduce((total, row) => total + row.missingEvidenceCount, 0),
    missingJournalCount: rows.reduce((total, row) => total + row.missingJournalCount, 0),
    actionRequired: rows.some((row) => row.actionRequired),
    rows,
  };
}

// ---------------------------------------------------------------------------
// 15. Retail Provider and Device Certification Readiness Report
// ---------------------------------------------------------------------------

export interface RetailProviderDeviceReadinessInput {
  assessments: RetailProviderReadiness[];
}

export type RetailProviderDeviceNextAction = 'ready' | 'configure-device' | 'acknowledge-device' | 'certify-provider';

export interface RetailProviderDeviceReadinessRow {
  kind: RetailProviderReadiness['kind'];
  label: string;
  status: RetailProviderReadiness['status'];
  detail: string;
  blockerCount: number;
  evidenceCount: number;
  evidenceReferences: string[];
  nextAction: RetailProviderDeviceNextAction;
  actionRequired: boolean;
}

export interface RetailProviderDeviceReadinessReport {
  total: number;
  ready: number;
  external: number;
  blocked: number;
  evidenceCount: number;
  actionRequired: boolean;
  rows: RetailProviderDeviceReadinessRow[];
}

export function computeRetailProviderDeviceReadiness({ assessments }: RetailProviderDeviceReadinessInput): RetailProviderDeviceReadinessReport {
  const rows = assessments.map((assessment): RetailProviderDeviceReadinessRow => {
    const hasPreparedDevicePayload = assessment.kind === 'printer' && assessment.blockers.some((blocker) => blocker.toLowerCase().includes('prepared label payload'));
    const nextAction: RetailProviderDeviceNextAction = assessment.status === 'ready'
      ? 'ready'
      : hasPreparedDevicePayload
        ? 'acknowledge-device'
        : assessment.kind === 'scale' || assessment.status === 'blocked'
          ? 'configure-device'
          : 'certify-provider';
    return {
      kind: assessment.kind,
      label: assessment.label,
      status: assessment.status,
      detail: assessment.detail,
      blockerCount: assessment.blockers.length,
      evidenceCount: assessment.evidenceReferences.length,
      evidenceReferences: [...assessment.evidenceReferences],
      nextAction,
      actionRequired: assessment.status !== 'ready' || assessment.blockers.length > 0,
    };
  }).sort((left, right) => Number(right.actionRequired) - Number(left.actionRequired) || left.label.localeCompare(right.label));
  return {
    total: rows.length,
    ready: rows.filter(({ status }) => status === 'ready').length,
    external: rows.filter(({ status }) => status === 'external').length,
    blocked: rows.filter(({ status }) => status === 'blocked').length,
    evidenceCount: rows.reduce((total, row) => total + row.evidenceCount, 0),
    actionRequired: rows.some(({ actionRequired }) => actionRequired),
    rows,
  };
}

// ---------------------------------------------------------------------------
// Retail production exit gate
// ---------------------------------------------------------------------------

export type RetailProductionExitGateStatus = 'ready' | 'blocked' | 'external-certification';

export interface RetailProductionExitGateCheck {
  id: 'store-execution' | 'provider-devices' | 'marketplace' | 'ondc' | 'scheduled-delivery' | 'certification-freshness';
  label: string;
  status: RetailProductionExitGateStatus;
  summary: string;
  nextAction: string;
}

export interface RetailProductionExitGateInput {
  storeExecution: RetailStoreExecutionReadinessReport;
  providerDevices: RetailProviderDeviceReadinessReport;
  marketplace: RetailMarketplaceProductionReadinessReport;
  ondc: RetailOndcProductionReadinessReport;
  scheduledDelivery: RetailReportDeliveryReadinessReport;
  /** Current-generation, time-bounded provider evidence. Optional only for legacy callers. */
  certificationFreshness?: RetailCertificationFreshnessReport;
}

export interface RetailProductionExitGateReport {
  status: RetailProductionExitGateStatus;
  goNoGo: 'go' | 'hold';
  readyCheckCount: number;
  blockedCheckCount: number;
  externalCertificationCheckCount: number;
  actionRequired: boolean;
  nextActions: string[];
  checks: RetailProductionExitGateCheck[];
}

/**
 * One retail-specific release view for store operators and release managers.
 * It composes existing evidence projections but never upgrades a missing
 * provider/device/recovery record into a green production claim.
 */
export function computeRetailProductionExitGate({ storeExecution, providerDevices, marketplace, ondc, scheduledDelivery, certificationFreshness }: RetailProductionExitGateInput): RetailProductionExitGateReport {
  const checks: RetailProductionExitGateCheck[] = [
    {
      id: 'store-execution',
      label: 'Offline POS and store recovery',
      status: storeExecution.actionRequired ? 'blocked' : 'ready',
      summary: storeExecution.actionRequired ? `${storeExecution.offline.queuedCount + storeExecution.offline.conflictCount} offline queue item(s) need recovery or synchronization.` : 'Offline queue and physical store execution have no open local actions.',
      nextAction: storeExecution.actionRequired ? (storeExecution.nextActions[0] ?? 'Resolve store execution actions before rollout.') : 'Store execution evidence is complete.',
    },
    {
      id: 'provider-devices',
      label: 'Payment rails and counter devices',
      status: providerDevices.blocked > 0 ? 'blocked' : providerDevices.external > 0 ? 'external-certification' : 'ready',
      summary: `${providerDevices.ready}/${providerDevices.total} rails/devices ready; ${providerDevices.external} external and ${providerDevices.blocked} blocked.`,
      nextAction: providerDevices.blocked > 0 ? (providerDevices.rows.find((row) => row.actionRequired && row.status === 'blocked')?.nextAction ?? 'Resolve blocked device controls.') : providerDevices.external > 0 ? 'Complete provider or physical-device certification with real evidence.' : 'Payment rails and devices are ready.',
    },
    {
      id: 'marketplace',
      label: 'Marketplace and website channels',
      status: marketplace.rows.some((row) => row.providerState === 'external-certification') ? 'external-certification' : marketplace.actionRequired ? 'blocked' : 'ready',
      summary: `${marketplace.productionReadyCount}/${marketplace.connectorCount} connector(s) production-ready; ${marketplace.settlementVarianceExposure.toFixed(2)} INR settlement variance exposure.`,
      nextAction: marketplace.rows.find((row) => row.actionRequired)?.nextAction ?? 'Marketplace channel evidence is complete.',
    },
    {
      id: 'ondc',
      label: 'ONDC production channel',
      status: ondc.rows.some((row) => row.providerState === 'external-certification') ? 'external-certification' : ondc.actionRequired ? 'blocked' : 'ready',
      summary: `${ondc.productionReadyCount}/${ondc.connectorCount} ONDC connector(s) production-ready; ${ondc.externalCertificationGates} certification gate(s).`,
      nextAction: ondc.rows.find((row) => row.actionRequired)?.nextAction ?? 'ONDC evidence is complete.',
    },
    {
      id: 'scheduled-delivery',
      label: 'Scheduled report delivery',
      status: scheduledDelivery.rows.some((row) => row.providerState === 'external-certification') ? 'external-certification' : scheduledDelivery.actionRequired ? 'blocked' : 'ready',
      summary: `${scheduledDelivery.providerReadyPlanCount}/${scheduledDelivery.providerBoundPlanCount || scheduledDelivery.planCount} scheduled plan(s) have certified provider evidence.`,
      nextAction: scheduledDelivery.rows.find((row) => row.actionRequired)?.nextAction ?? 'Scheduled delivery evidence is complete.',
    },
  ];
  if (certificationFreshness) {
    checks.push({
      id: 'certification-freshness',
      label: 'Current provider replay evidence',
      status: certificationFreshness.hardGateCount > 0 ? 'external-certification' : certificationFreshness.renewalDueCount > 0 ? 'blocked' : 'ready',
      summary: `${certificationFreshness.currentCount}/${certificationFreshness.totalCount} evidence item(s) current; ${certificationFreshness.renewalDueCount} due for renewal, ${certificationFreshness.expiredCount} expired, and ${certificationFreshness.missingCount} missing.`,
      nextAction: certificationFreshness.hardGateCount > 0
        ? 'Obtain fresh independent provider evidence for every expired or missing capability.'
        : certificationFreshness.renewalDueCount > 0
          ? 'Renew evidence that is approaching its 90-day deadline before rollout.'
          : 'All required provider replay evidence is current.',
    });
  }
  const nextActions = checks.filter((check) => check.status !== 'ready').map((check) => check.nextAction).filter((action, index, values) => values.indexOf(action) === index);
  const status: RetailProductionExitGateStatus = checks.some((check) => check.status === 'blocked') ? 'blocked' : checks.some((check) => check.status === 'external-certification') ? 'external-certification' : 'ready';
  return { status, goNoGo: status === 'ready' ? 'go' : 'hold', readyCheckCount: checks.filter((check) => check.status === 'ready').length, blockedCheckCount: checks.filter((check) => check.status === 'blocked').length, externalCertificationCheckCount: checks.filter((check) => check.status === 'external-certification').length, actionRequired: status !== 'ready', nextActions, checks };
}

// ---------------------------------------------------------------------------
// Retail rollout readiness: runtime health plus retail exit gate
// ---------------------------------------------------------------------------

export type RetailRolloutReadinessStatus = 'ready' | 'blocked' | 'external-certification';

export interface RetailRolloutReadinessCheck {
  id: 'retail-exit-gate' | 'database-recovery' | 'outbox-sync' | 'observability';
  label: string;
  status: RetailRolloutReadinessStatus;
  summary: string;
  nextAction: string;
}

export interface RetailRolloutReadinessInput {
  exitGate: RetailProductionExitGateReport;
  operationalHealth: OperationalHealthSnapshot | null;
}

export interface RetailRolloutReadinessReport {
  status: RetailRolloutReadinessStatus;
  goNoGo: 'go' | 'hold';
  actionRequired: boolean;
  readyCheckCount: number;
  blockedCheckCount: number;
  externalCertificationCheckCount: number;
  nextActions: string[];
  checks: RetailRolloutReadinessCheck[];
}

/**
 * Composes the retail evidence gate with the main-process health snapshot.
 * This is intentionally a rollout projection, not a deployment claim: a
 * healthy local database or packaged build cannot replace external provider
 * credentials, device acknowledgements, or portal certification evidence.
 */
export function computeRetailRolloutReadiness({ exitGate, operationalHealth }: RetailRolloutReadinessInput): RetailRolloutReadinessReport {
  const healthUnavailable = !operationalHealth;
  const checks: RetailRolloutReadinessCheck[] = [
    {
      id: 'retail-exit-gate',
      label: 'Retail production exit gate',
      status: exitGate.status,
      summary: `${exitGate.readyCheckCount}/${exitGate.checks.length} retail checks ready; ${exitGate.externalCertificationCheckCount} external certification gate(s).`,
      nextAction: exitGate.nextActions[0] ?? 'Retail evidence is complete.',
    },
    {
      id: 'database-recovery',
      label: 'Database, audit and migrations',
      status: healthUnavailable ? 'blocked' : operationalHealth.databaseIntegrity && operationalHealth.auditChainValid && operationalHealth.migrationsValid ? 'ready' : 'blocked',
      summary: healthUnavailable ? 'Operational health evidence is unavailable.' : `${operationalHealth.databaseIntegrity ? 'Database integrity' : 'Database integrity review required'}; ${operationalHealth.auditChainValid ? 'audit chain' : 'audit chain review required'}; ${operationalHealth.migrationsValid ? 'migrations' : 'migration review required'}.`,
      nextAction: healthUnavailable ? 'Run the main-process health check before rollout.' : operationalHealth.databaseIntegrity && operationalHealth.auditChainValid && operationalHealth.migrationsValid ? 'Database recovery evidence is complete.' : 'Resolve database integrity, audit-chain, or migration blockers before rollout.',
    },
    {
      id: 'outbox-sync',
      label: 'Event outbox and synchronization',
      status: healthUnavailable ? 'blocked' : operationalHealth.failedOutboxEvents > 0 || operationalHealth.pendingOutboxEvents > 0 ? 'blocked' : 'ready',
      summary: healthUnavailable ? 'Outbox evidence is unavailable.' : `${operationalHealth.pendingOutboxEvents} pending event(s); ${operationalHealth.failedOutboxEvents} failed event(s).`,
      nextAction: healthUnavailable ? 'Run the main-process health check before rollout.' : operationalHealth.failedOutboxEvents > 0 ? 'Replay or resolve failed outbox events before rollout.' : operationalHealth.pendingOutboxEvents > 0 ? 'Drain the pending outbox before rollout.' : 'Outbox is clear for rollout.',
    },
    {
      id: 'observability',
      label: 'Observability service health',
      status: healthUnavailable ? 'blocked' : operationalHealth.status === 'healthy' ? 'ready' : 'blocked',
      summary: healthUnavailable ? 'No health snapshot was returned by the main process.' : `Main-process health is ${operationalHealth.status}; ${operationalHealth.recentAuditEvents} recent audit event(s).`,
      nextAction: healthUnavailable ? 'Open the recovery runbook and restore health telemetry.' : operationalHealth.status === 'healthy' ? 'Observability is healthy.' : 'Open the recovery runbook and resolve degraded operational health.',
    },
  ];
  const nextActions = checks.filter((check) => check.status !== 'ready').map((check) => check.nextAction).filter((action, index, values) => values.indexOf(action) === index);
  const status: RetailRolloutReadinessStatus = checks.some((check) => check.status === 'blocked') ? 'blocked' : checks.some((check) => check.status === 'external-certification') ? 'external-certification' : 'ready';
  return { status, goNoGo: status === 'ready' ? 'go' : 'hold', actionRequired: status !== 'ready', readyCheckCount: checks.filter((check) => check.status === 'ready').length, blockedCheckCount: checks.filter((check) => check.status === 'blocked').length, externalCertificationCheckCount: checks.filter((check) => check.status === 'external-certification').length, nextActions, checks };
}

// ---------------------------------------------------------------------------
// 16. Sales Team Commission Payout Report
// ---------------------------------------------------------------------------

export interface CommissionPayoutInput {
  allCommissions: RetailSalesCommission[];
  fromDate: string;
  toDate: string;
}

export interface CommissionPayoutRow {
  salespersonUserId: string;
  commissionCount: number;
  saleCount: number;
  basisAmount: number;
  totalCommission: number;
  pendingAmount: number;
  approvedAmount: number;
  paidAmount: number;
  voidAmount: number;
  payoutReadinessPct: number;
}

export interface CommissionPayoutReport {
  fromDate: string;
  toDate: string;
  totalCommission: number;
  pendingAmount: number;
  approvedAmount: number;
  paidAmount: number;
  voidAmount: number;
  rows: CommissionPayoutRow[];
}

export function computeCommissionPayout({ allCommissions, fromDate, toDate }: CommissionPayoutInput): CommissionPayoutReport {
  const filtered = allCommissions.filter((commission) => isoDate(commission.createdAt) >= fromDate && isoDate(commission.createdAt) <= toDate);
  const grouped = new Map<string, RetailSalesCommission[]>();
  filtered.forEach((commission) => grouped.set(commission.salespersonUserId, [...(grouped.get(commission.salespersonUserId) ?? []), commission]));
  const amountByStatus = (commissions: RetailSalesCommission[], status: RetailSalesCommission['status']) => round2(commissions.filter((commission) => commission.status === status).reduce((total, commission) => total + commission.commissionAmount, 0));
  const rows = Array.from(grouped.entries()).map(([salespersonUserId, commissions]) => {
    const totalCommission = round2(commissions.filter((commission) => commission.status !== 'void').reduce((total, commission) => total + commission.commissionAmount, 0));
    const paidAmount = amountByStatus(commissions, 'paid');
    return {
      salespersonUserId,
      commissionCount: commissions.length,
      saleCount: new Set(commissions.map(({ saleId }) => saleId)).size,
      basisAmount: round2(commissions.filter((commission) => commission.status !== 'void').reduce((total, commission) => total + commission.basisAmount, 0)),
      totalCommission,
      pendingAmount: amountByStatus(commissions, 'pending'),
      approvedAmount: amountByStatus(commissions, 'approved'),
      paidAmount,
      voidAmount: amountByStatus(commissions, 'void'),
      payoutReadinessPct: totalCommission > 0 ? round2((paidAmount / totalCommission) * 100) : 0,
    } satisfies CommissionPayoutRow;
  }).sort((left, right) => right.totalCommission - left.totalCommission);
  return {
    fromDate,
    toDate,
    totalCommission: round2(rows.reduce((total, row) => total + row.totalCommission, 0)),
    pendingAmount: round2(rows.reduce((total, row) => total + row.pendingAmount, 0)),
    approvedAmount: round2(rows.reduce((total, row) => total + row.approvedAmount, 0)),
    paidAmount: round2(rows.reduce((total, row) => total + row.paidAmount, 0)),
    voidAmount: round2(rows.reduce((total, row) => total + row.voidAmount, 0)),
    rows,
  };
}

// ---------------------------------------------------------------------------
// 10. Customer Credit Utilisation Report
// ---------------------------------------------------------------------------

export interface CreditUtilizationInput {
  controls: CreditLimitControl[];
  receivables: Receivable[];
  accountNames?: Record<string, string>;
  asOfDate: string;
}

export interface CreditUtilizationRow {
  accountId: string;
  accountName: string;
  controlNumber: string;
  riskGrade: CreditLimitControl['riskGrade'];
  creditLimit: number;
  exposure: number;
  availableHeadroom: number;
  utilizationPct: number;
  overdueAmount: number;
  openReceivableCount: number;
  status: 'within-limit' | 'warning' | 'credit-hold';
}

export interface CreditUtilizationReport {
  asOfDate: string;
  approvedLimitTotal: number;
  exposureTotal: number;
  availableHeadroomTotal: number;
  warningCount: number;
  holdCount: number;
  rows: CreditUtilizationRow[];
}

export function computeCreditUtilization({ controls, receivables, accountNames = {}, asOfDate }: CreditUtilizationInput): CreditUtilizationReport {
  const approved = controls.filter((control) => control.status === 'approved');
  const rows = approved.map((control): CreditUtilizationRow => {
    const open = receivables.filter((receivable) => receivable.accountId === control.accountId && receivable.outstandingAmount > 0 && !['paid', 'written-off'].includes(receivable.status));
    const exposure = round2(open.reduce((total, receivable) => total + receivable.outstandingAmount, 0));
    const overdueAmount = round2(open.filter((receivable) => receivable.dueDate < asOfDate).reduce((total, receivable) => total + receivable.outstandingAmount, 0));
    const availableHeadroom = round2(Math.max(0, control.creditLimit - exposure));
    const utilizationPct = control.creditLimit > 0 ? round2((exposure / control.creditLimit) * 100) : exposure > 0 ? 100 : 0;
    const status: CreditUtilizationRow['status'] = control.blockNewOrders && exposure > control.creditLimit
      ? 'credit-hold'
      : utilizationPct >= control.warningThresholdPercent
        ? 'warning'
        : 'within-limit';
    return {
      accountId: control.accountId,
      accountName: accountNames[control.accountId] ?? control.accountId,
      controlNumber: control.number,
      riskGrade: control.riskGrade,
      creditLimit: round2(control.creditLimit),
      exposure,
      availableHeadroom,
      utilizationPct,
      overdueAmount,
      openReceivableCount: open.length,
      status,
    };
  }).sort((left, right) => right.utilizationPct - left.utilizationPct || right.exposure - left.exposure);
  return {
    asOfDate,
    approvedLimitTotal: round2(rows.reduce((total, row) => total + row.creditLimit, 0)),
    exposureTotal: round2(rows.reduce((total, row) => total + row.exposure, 0)),
    availableHeadroomTotal: round2(rows.reduce((total, row) => total + row.availableHeadroom, 0)),
    warningCount: rows.filter((row) => row.status === 'warning').length,
    holdCount: rows.filter((row) => row.status === 'credit-hold').length,
    rows,
  };
}

// ---------------------------------------------------------------------------
// 11. Expiry risk and rack/bin readiness
// ---------------------------------------------------------------------------

export type ExpiryRiskStatus = 'expired' | 'critical' | 'watch' | 'healthy' | 'quarantine' | 'recalled' | 'unlocated';

export interface ExpiryRiskRow {
  batchId: string;
  batchNumber: string;
  itemVariantId: string;
  sku: string;
  itemName: string;
  warehouseName: string;
  zoneName: string;
  binCode: string;
  expiresAt?: string;
  daysToExpiry: number | null;
  status: ExpiryRiskStatus;
  quantity: number;
  reserved: number;
  available: number;
  inventoryValue: number;
}

export interface ExpiryRiskReport {
  asOfDate: string;
  horizonDays: number;
  expiredQuantity: number;
  atRiskQuantity: number;
  atRiskValue: number;
  nearExpiryBatchCount: number;
  rows: ExpiryRiskRow[];
}

export interface ExpiryRiskInput {
  items: InventoryItem[];
  variants: ItemVariant[];
  batches: InventoryBatch[];
  balances: BinBalance[];
  warehouses: Warehouse[];
  zones: WarehouseZone[];
  bins: StorageBin[];
  asOfDate: string;
  horizonDays: number;
}

function wholeDaysBetween(from: string, to: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const difference = Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`);
  return Number.isFinite(difference) ? Math.floor(difference / 86_400_000) : null;
}

export function computeExpiryRisk({ items, variants, batches, balances, warehouses, zones, bins, asOfDate, horizonDays }: ExpiryRiskInput): ExpiryRiskReport {
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const binById = new Map(bins.map((bin) => [bin.id, bin]));
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const rows: ExpiryRiskRow[] = [];
  for (const batch of batches) {
    const variant = variantById.get(batch.itemVariantId);
    const item = variant ? itemById.get(variant.itemId) : undefined;
    const balancesForBatch = balances.filter((balance) => balance.batchId === batch.id);
    const balancesToRender = balancesForBatch.length ? balancesForBatch : [{ id: `unlocated-${batch.id}`, binId: '', itemVariantId: batch.itemVariantId, quantity: 0, reserved: 0, picked: 0, available: 0, unitCost: 0, inventoryValue: 0, version: 1 } satisfies BinBalance];
    const daysToExpiry = batch.expiresAt ? wholeDaysBetween(asOfDate, batch.expiresAt) : null;
    const baseStatus: ExpiryRiskStatus = batch.status === 'recalled' ? 'recalled' : batch.status === 'quarantine' ? 'quarantine' : batch.expiresAt && daysToExpiry !== null && daysToExpiry <= 0 ? 'expired' : batch.expiresAt && daysToExpiry !== null && daysToExpiry <= 7 ? 'critical' : batch.expiresAt && daysToExpiry !== null && daysToExpiry <= horizonDays ? 'watch' : 'healthy';
    for (const balance of balancesToRender) {
      const bin = binById.get(balance.binId);
      const zone = bin ? zoneById.get(bin.zoneId) : undefined;
      const warehouse = zone ? warehouseById.get(zone.warehouseId) : undefined;
      rows.push({ batchId: batch.id, batchNumber: batch.batchNumber, itemVariantId: batch.itemVariantId, sku: variant?.sku ?? batch.itemVariantId, itemName: item?.name ?? variant?.name ?? batch.itemVariantId, warehouseName: warehouse?.name ?? 'Unlocated', zoneName: zone?.name ?? 'Unlocated', binCode: bin?.code ?? 'UNLOCATED', expiresAt: batch.expiresAt, daysToExpiry, status: bin ? baseStatus : baseStatus === 'healthy' ? 'unlocated' : baseStatus, quantity: round2(balance.quantity), reserved: round2(balance.reserved), available: round2(balance.available), inventoryValue: round2(balance.inventoryValue) });
    }
  }
  rows.sort((left, right) => (left.daysToExpiry ?? Number.POSITIVE_INFINITY) - (right.daysToExpiry ?? Number.POSITIVE_INFINITY) || left.batchNumber.localeCompare(right.batchNumber));
  const atRisk = rows.filter((row) => ['expired', 'critical', 'watch', 'quarantine', 'recalled'].includes(row.status));
  return { asOfDate, horizonDays, expiredQuantity: round2(rows.filter((row) => row.status === 'expired').reduce((total, row) => total + row.quantity, 0)), atRiskQuantity: round2(atRisk.reduce((total, row) => total + row.quantity, 0)), atRiskValue: round2(atRisk.reduce((total, row) => total + row.inventoryValue, 0)), nearExpiryBatchCount: new Set(rows.filter((row) => ['expired', 'critical', 'watch'].includes(row.status)).map((row) => row.batchId)).size, rows };
}

export type RackReadinessStatus = 'blocked' | 'over-capacity' | 'ready' | 'empty';

export interface RackReadinessRow {
  warehouseName: string;
  zoneName: string;
  zonePurpose: WarehouseZone['purpose'];
  binId: string;
  binCode: string;
  binName: string;
  binStatus: StorageBin['status'];
  capacity: number;
  occupied: number;
  availableCapacity: number;
  utilizationPct: number;
  itemCount: number;
  batchCount: number;
  readiness: RackReadinessStatus;
}

export interface RackReadinessReport {
  totalBins: number;
  blockedBins: number;
  overCapacityBins: number;
  totalInventoryValue: number;
  rows: RackReadinessRow[];
}

export interface RackReadinessInput {
  items: InventoryItem[];
  variants: ItemVariant[];
  warehouses: Warehouse[];
  zones: WarehouseZone[];
  bins: StorageBin[];
  balances: BinBalance[];
}

export function computeRackReadiness({ variants, warehouses, zones, bins, balances }: RackReadinessInput): RackReadinessReport {
  const variantIds = new Set(variants.map((variant) => variant.id));
  const zonesById = new Map(zones.map((zone) => [zone.id, zone]));
  const warehousesById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const rows = bins.map((bin): RackReadinessRow => {
    const zone = zonesById.get(bin.zoneId);
    const warehouse = zone ? warehousesById.get(zone.warehouseId) : undefined;
    const binBalances = balances.filter((balance) => balance.binId === bin.id && variantIds.has(balance.itemVariantId));
    const occupied = round2(binBalances.reduce((total, balance) => total + balance.quantity, 0));
    const utilizationPct = bin.capacity > 0 ? round2((occupied / bin.capacity) * 100) : occupied > 0 ? 100 : 0;
    const readiness: RackReadinessStatus = bin.status === 'blocked' ? 'blocked' : utilizationPct > 100 ? 'over-capacity' : occupied === 0 ? 'empty' : 'ready';
    return { warehouseName: warehouse?.name ?? 'Unknown warehouse', zoneName: zone?.name ?? 'Unknown zone', zonePurpose: zone?.purpose ?? 'storage', binId: bin.id, binCode: bin.code, binName: bin.name, binStatus: bin.status, capacity: round2(bin.capacity), occupied, availableCapacity: round2(Math.max(0, bin.capacity - occupied)), utilizationPct, itemCount: new Set(binBalances.map((balance) => balance.itemVariantId)).size, batchCount: new Set(binBalances.map((balance) => balance.batchId).filter(Boolean)).size, readiness };
  }).sort((left, right) => right.utilizationPct - left.utilizationPct || left.binCode.localeCompare(right.binCode));
  return { totalBins: rows.length, blockedBins: rows.filter((row) => row.readiness === 'blocked').length, overCapacityBins: rows.filter((row) => row.utilizationPct > 100).length, totalInventoryValue: round2(balances.reduce((total, balance) => total + balance.inventoryValue, 0)), rows };
}
