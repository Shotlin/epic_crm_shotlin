/**
 * retail-reports.test.ts
 *
 * Phase R6 – Unit tests for the Retail Reporting & Analytics Engine.
 * All tests are pure; no I/O, no side effects.
 */

import { describe, it, expect } from 'vitest';
import {
  computeXReport,
  computeZReport,
  computeCounterSummary,
  computeTenderBreakdown,
  computeGstSummary,
  computeSkuMarginReport,
  computeCategorySales,
  computeCampaignUsage,
  computeCustomerVisitConversion,
  computeExchangeCreditNoteReadiness,
  computeRetailChannelSettlementReadiness,
  computeRetailSettlementExceptionTriage,
  computeRetailStoreExecutionReadiness,
  computeRetailPayoutReadiness,
  computeRetailOcrReadiness,
  computeRetailOcrAdapterReadiness,
  computeRetailInterBranchReadiness,
  computeRetailProviderDeviceReadiness,
  computeRetailMarketplaceProductionReadiness,
  computeRetailOndcProductionReadiness,
  computeRetailReportDeliveryReadiness,
  computeRetailPayoutRailReadiness,
  computeCommissionPayout,
  computeCreditUtilization,
  computeExpiryRisk,
  computeRackReadiness,
  computeRetailMarketplacePayoutReconciliation,
} from './retail-reports';
import type { RetailSale, RetailCashierShift } from '../shared/retail-pos-contracts';
import type { RetailCatalogCategory, RetailMerchandisingProfile } from '../shared/retail-catalog-contracts';
import type { InventoryBatch, ItemVariant, BinBalance, InventoryItem, StorageBin, Warehouse, WarehouseZone } from '../shared/inventory-contracts';
import type { RetailPromotionRedemption } from '../shared/retail-promotion-contracts';
import type { RetailCommissionPayoutBatch, RetailCustomerVisit, RetailSalesCommission } from '../shared/retail-customer-ops-contracts';
import type { RetailExchange } from '../shared/retail-exchange-contracts';
import type { RetailCreditNoteReconciliation } from '../shared/retail-credit-note-contracts';
import type { RetailCommerceConnector, RetailCommerceConflictResolution, RetailCommerceConformanceCase, RetailCommerceOrder, RetailCommercePushBatch, RetailCommerceSyncRun, RetailOcrProviderProfile, RetailPurchaseException, RetailPurchaseOcrDocument, RetailPurchaseOcrMapping, RetailSettlementAllocationPack, RetailSettlementReconciliation, RetailSettlementWithholdingEvidence } from '../shared/retail-commerce-contracts';
import type { ProviderConformanceCase, ProviderConnector, ProviderReconciliationRun, ProviderSubmission } from '../shared/provider-contracts';
import type { PayrollRun } from '../shared/payroll-contracts';
import type { DiscountPolicy, Receivable } from '../shared/revenue-ops-contracts';
import type { CreditLimitControl } from '../shared/collections-finance-contracts';
import type { RetailInterBranchTransfer } from '../shared/retail-interbranch-contracts';
import type { RetailProviderReadiness } from './retail-provider-readiness';
import type { RetailReportDeliveryAttempt, RetailReportDeliveryPlan } from '../shared/report-delivery-contracts';
import type { RetailOfflineSaleQueueItem, RetailOfflineSyncReceipt } from '../shared/retail-offline-sync-contracts';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const baseScope = { companyId: 'c1', branchId: 'b1' };

const shift1: RetailCashierShift = {
  id: 'shift-1',
  number: 'SH-001',
  counterId: 'ctr-1',
  cashierId: 'usr-1',
  openedAt: '2025-01-15T09:00:00.000Z',
  openingCash: 1000,
  status: 'open',
  scope: baseScope,
  version: 1,
};

const closedShift: RetailCashierShift = {
  ...shift1,
  id: 'shift-2',
  number: 'SH-002',
  status: 'closed',
  declaredCash: 5500,
  expectedCash: 5200,
  variance: 300,
  closedBy: 'usr-2',
  closedAt: '2025-01-15T18:00:00.000Z',
};

const makeSale = (
  id: string,
  shiftId: string,
  counterId: string,
  date: string,
  grandTotal: number,
  cost: number,
  tenderMethod: 'cash' | 'upi' | 'card' = 'cash',
  gstRate = 18,
  treatmentIntra = true,
): RetailSale => {
  const taxableValue = Math.round((grandTotal / 1.18) * 100) / 100;
  const gstAmt = Math.round((grandTotal - taxableValue) * 100) / 100;
  return {
    id,
    number: id,
    counterId,
    cashierShiftId: shiftId,
    cashierId: 'usr-1',
    customerAccountId: 'walk-in',
    transactionKey: id,
    requestChecksum: id,
    saleAt: `${date}T10:00:00.000Z`,
    invoiceId: `inv-${id}`,
    paymentReceiptIds: [],
    lines: [
      {
        id: `line-${id}`,
        itemVariantId: 'var-1',
        catalogProductId: 'prod-1',
        binId: 'bin-1',
        serialUnitIds: [],
        description: 'Test Product',
        hsnSac: '6403',
        quantity: 1,
        listUnitPrice: grandTotal,
        unitPrice: grandTotal,
        taxableValue,
        gstRate,
        taxCodeId: 'gst-18',
        priceListEntryId: 'ple-1',
        discountAmount: 0,
        cessRate: 0,
        cessAmount: 0,
        lineTotal: grandTotal,
        lineCostTotal: cost,
      },
    ],
    subtotal: taxableValue,
    discountTotal: 0,
    taxPreview: {
      treatment: treatmentIntra ? 'intra-state' : 'inter-state',
      taxableValue,
      cgst: treatmentIntra ? gstAmt / 2 : 0,
      sgst: treatmentIntra ? gstAmt / 2 : 0,
      igst: treatmentIntra ? 0 : gstAmt,
      cess: 0,
      totalTax: gstAmt,
      grandTotal,
      determination: 'commercial-estimate',
    },
    tenders: [{ id: `tndr-${id}`, method: tenderMethod, amount: grandTotal, reference: 'REF' }],
    costTotal: cost,
    status: 'completed',
    completedAt: `${date}T10:01:00.000Z`,
    scope: baseScope,
    version: 1,
  };
};

const sale1 = makeSale('sale-1', 'shift-1', 'ctr-1', '2025-01-15', 1180, 500, 'cash');
const sale2 = makeSale('sale-2', 'shift-1', 'ctr-1', '2025-01-15', 590, 200, 'upi');
const sale3 = makeSale('sale-3', 'shift-2', 'ctr-1', '2025-01-15', 2360, 800, 'card');

const allSales = [sale1, sale2, sale3];

// ---------------------------------------------------------------------------
// 1. X-Report
// ---------------------------------------------------------------------------

describe('computeXReport', () => {
  it('correctly aggregates shift sales metrics', () => {
    const report = computeXReport({ shift: shift1, allSales });
    // shift-1 has sale-1 (₹1180) and sale-2 (₹590)
    expect(report.saleCount).toBe(2);
    expect(report.grandTotal).toBe(1770);
    expect(report.costTotal).toBe(700);
    expect(report.grossProfit).toBe(1070);
    expect(report.grossMarginPct).toBeCloseTo(60.45, 1);
    expect(report.averageBasket).toBe(885);
  });

  it('produces correct tender breakdown lines', () => {
    const report = computeXReport({ shift: shift1, allSales });
    const cashLine = report.tenderLines.find((l) => l.method === 'cash');
    const upiLine = report.tenderLines.find((l) => l.method === 'upi');
    expect(cashLine?.total).toBe(1180);
    expect(upiLine?.total).toBe(590);
  });

  it('returns zero metrics for a shift with no sales', () => {
    const emptyReport = computeXReport({
      shift: { ...shift1, id: 'shift-empty' },
      allSales,
    });
    expect(emptyReport.saleCount).toBe(0);
    expect(emptyReport.grandTotal).toBe(0);
    expect(emptyReport.averageBasket).toBe(0);
    expect(emptyReport.tenderLines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Z-Report
// ---------------------------------------------------------------------------

describe('computeZReport', () => {
  it('extends X-Report with shift close fields', () => {
    const report = computeZReport({ shift: closedShift, allSales });
    // closedShift has sale-3
    expect(report.saleCount).toBe(1);
    expect(report.grandTotal).toBe(2360);
    expect(report.openingCash).toBe(1000);
    expect(report.declaredCash).toBe(5500);
    expect(report.expectedCash).toBe(5200);
    expect(report.variance).toBe(300);
    expect(report.status).toBe('closed');
    expect(report.closedAt).toBe('2025-01-15T18:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// 3. Counter Daily Summary
// ---------------------------------------------------------------------------

describe('computeCounterSummary', () => {
  it('aggregates sales and returns by date', () => {
    const report = computeCounterSummary({
      counterId: 'ctr-1',
      counterName: 'Counter 1',
      fromDate: '2025-01-15',
      toDate: '2025-01-15',
      allSales,
      allReturns: [],
    });
    expect(report.rows).toHaveLength(1);
    const row = report.rows[0];
    expect(row?.date).toBe('2025-01-15');
    // All 3 sales are on ctr-1 on 2025-01-15
    expect(row?.saleCount).toBe(3);
    expect(row?.grossRevenue).toBe(4130); // 1180+590+2360
    expect(row?.returnValue).toBe(0);
    expect(row?.netRevenue).toBe(4130);
  });

  it('totals match sum of daily rows', () => {
    const report = computeCounterSummary({
      counterId: 'ctr-1',
      counterName: 'Counter 1',
      fromDate: '2025-01-15',
      toDate: '2025-01-15',
      allSales,
      allReturns: [],
    });
    expect(report.totals.saleCount).toBe(report.rows.reduce((s, r) => s + r.saleCount, 0));
    expect(report.totals.grossRevenue).toBeCloseTo(
      report.rows.reduce((s, r) => s + r.grossRevenue, 0),
      2,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Tender Breakdown Report
// ---------------------------------------------------------------------------

describe('computeTenderBreakdown', () => {
  it('splits tender methods correctly', () => {
    const report = computeTenderBreakdown({
      allSales,
      fromDate: '2025-01-15',
      toDate: '2025-01-15',
    });
    expect(report.grandTotal).toBe(4130);
    const cash = report.rows.find((r) => r.method === 'cash');
    const upi = report.rows.find((r) => r.method === 'upi');
    const card = report.rows.find((r) => r.method === 'card');
    expect(cash?.total).toBe(1180);
    expect(upi?.total).toBe(590);
    expect(card?.total).toBe(2360);
  });

  it('share percentages sum to ~100', () => {
    const report = computeTenderBreakdown({
      allSales,
      fromDate: '2025-01-15',
      toDate: '2025-01-15',
    });
    const totalShare = report.rows.reduce((s, r) => s + r.sharePct, 0);
    expect(totalShare).toBeCloseTo(100, 0);
  });
});

// ---------------------------------------------------------------------------
// 5. GST Summary Report
// ---------------------------------------------------------------------------

describe('computeGstSummary', () => {
  it('computes GST breakdown by rate', () => {
    const report = computeGstSummary({
      allSales,
      fromDate: '2025-01-15',
      toDate: '2025-01-15',
    });
    expect(report.rows.length).toBeGreaterThan(0);
    // All test sales use 18% GST
    const row18 = report.rows.find((r) => r.gstRate === '18%');
    expect(row18).toBeDefined();
    // All intra-state so cgst+sgst = totalTax
    if (row18) {
      expect(row18.cgst + row18.sgst).toBeCloseTo(row18.totalTax, 1);
    }
  });

  it('totals match sum of rows', () => {
    const report = computeGstSummary({
      allSales,
      fromDate: '2025-01-15',
      toDate: '2025-01-15',
    });
    const rowsTotal = report.rows.reduce((s, r) => s + r.totalTax, 0);
    expect(report.totals.totalTax).toBeCloseTo(rowsTotal, 2);
  });
});

// ---------------------------------------------------------------------------
// 6. SKU Margin & Sell-Through Report
// ---------------------------------------------------------------------------

const variants: ItemVariant[] = [
  { id: 'var-1', itemId: 'item-1', sku: 'SKU-001', name: 'Test Product', attributes: {}, active: true, scope: baseScope, version: 1 },
];

const binBalances: BinBalance[] = [
  { id: 'bb-1', binId: 'bin-1', itemVariantId: 'var-1', quantity: 20, reserved: 2, picked: 0, available: 18, unitCost: 300, inventoryValue: 6000, scope: baseScope, version: 1 },
];

describe('computeSkuMarginReport', () => {
  it('computes margin and sell-through per SKU', () => {
    const report = computeSkuMarginReport({
      allSales,
      fromDate: '2025-01-15',
      toDate: '2025-01-15',
      variants,
      binBalances,
    });
    expect(report.rows).toHaveLength(1);
    const row = report.rows[0]!;
    expect(row.sku).toBe('SKU-001');
    // 3 units sold across 3 sales
    expect(row.quantitySold).toBe(3);
    // Revenue is sum of all lineTotals
    expect(row.revenue).toBeCloseTo(4130, 1);
    // grossMarginPct = (revenue - cost) / revenue * 100
    expect(row.grossMarginPct).toBeGreaterThan(0);
    // sellThroughPct = sold / (opening + sold) * 100 = 3 / (18+3) * 100
    expect(row.sellThroughPct).toBeCloseTo(14.29, 1);
  });
});

// ---------------------------------------------------------------------------
// 7. Category Sales Report
// ---------------------------------------------------------------------------

const categories: RetailCatalogCategory[] = [
  { id: 'cat-1', code: 'ELEC', name: 'Electronics', active: true, scope: baseScope, version: 1 },
];

const merchandisingProfiles: RetailMerchandisingProfile[] = [
  { id: 'mp-1', itemId: 'item-1', categoryId: 'cat-1', searchKeywords: [], scope: baseScope, version: 1 },
];

describe('computeCampaignUsage', () => {
  it('aggregates immutable campaign redemptions against completed sale revenue', () => {
    const sale = makeSale('sale-campaign', 'shift-1', 'ctr-1', '2025-01-15', 1180, 500);
    const redemptions: RetailPromotionRedemption[] = [
      { id: 'redemption-1', promotionPolicyId: 'policy-1', saleId: sale.id, campaignCode: 'JANUARY-GIFT', customerAccountId: 'walk-in', redeemedAt: sale.saleAt, discountAmount: 100, giftQuantity: 1, scope: baseScope, version: 1 },
      { id: 'redemption-2', promotionPolicyId: 'policy-1', saleId: sale.id, campaignCode: 'JANUARY-GIFT', customerAccountId: 'walk-in', redeemedAt: sale.saleAt, discountAmount: 50, giftQuantity: 0, scope: baseScope, version: 1 },
    ];
    const policies: DiscountPolicy[] = [{ id: 'policy-1', code: 'JAN-GIFT', name: 'January gift', scope: 'product', productId: 'prod-1', method: 'percentage', value: 10, minimumTaxableValue: 0, maximumDiscountAmount: 1000, stackable: false, approvalThresholdPercent: 0, campaignCode: 'JANUARY-GIFT', effectiveFrom: '2025-01-01', active: true, version: 1 }];
    const report = computeCampaignUsage({ allRedemptions: redemptions, allSales: [sale], policies, fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ totalRedemptions: 2, totalDiscount: 150, totalGiftQuantity: 1 });
    expect(report.rows[0]).toMatchObject({ code: 'JAN-GIFT', redemptionCount: 2, uniqueSaleCount: 1, influencedRevenue: 1180, averageInfluencedBasket: 1180, effectiveDiscountRatePct: 12.71 });
  });
});

describe('computeCustomerVisitConversion', () => {
  it('attributes completed sale revenue while retaining unconverted visits', () => {
    const visits: RetailCustomerVisit[] = [
      { id: 'visit-1', customerAccountId: 'walk-in', visitedAt: '2025-01-15T09:00:00.000Z', channel: 'store', purpose: 'purchase', staffUserId: 'usr-1', convertedSaleId: 'sale-1', convertedAt: '2025-01-15T10:01:00.000Z', scope: baseScope, version: 2 },
      { id: 'visit-2', customerAccountId: 'walk-in', visitedAt: '2025-01-15T11:00:00.000Z', channel: 'store', purpose: 'purchase', staffUserId: 'usr-1', scope: baseScope, version: 1 },
      { id: 'visit-3', customerAccountId: 'walk-in', visitedAt: '2025-01-16T11:00:00.000Z', channel: 'phone', purpose: 'enquiry', staffUserId: 'usr-1', convertedSaleId: 'sale-pending', scope: baseScope, version: 1 },
      { id: 'visit-outside', customerAccountId: 'walk-in', visitedAt: '2024-12-31T11:00:00.000Z', channel: 'web', purpose: 'purchase', staffUserId: 'usr-1', scope: baseScope, version: 1 },
    ];
    const report = computeCustomerVisitConversion({ allVisits: visits, allSales: [sale1], fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ totalVisits: 3, convertedVisits: 1, unconvertedVisits: 2, conversionRatePct: 33.33, influencedRevenue: 1180 });
    expect(report.rows.find(({ channel, purpose }) => channel === 'store' && purpose === 'purchase')).toMatchObject({ visitCount: 2, convertedVisitCount: 1, unconvertedVisitCount: 1, influencedRevenue: 1180, averageInfluencedBasket: 1180 });
    expect(report.rows.find(({ channel, purpose }) => channel === 'phone' && purpose === 'enquiry')).toMatchObject({ visitCount: 1, convertedVisitCount: 0, conversionRatePct: 0 });
  });

  it('deduplicates influenced revenue when multiple visits point to the same completed sale', () => {
    const visits: RetailCustomerVisit[] = [
      { id: 'visit-a', visitedAt: '2025-01-15T09:00:00.000Z', channel: 'store', purpose: 'purchase', staffUserId: 'usr-1', convertedSaleId: 'sale-1', scope: baseScope, version: 2 },
      { id: 'visit-b', visitedAt: '2025-01-15T09:30:00.000Z', channel: 'store', purpose: 'service', staffUserId: 'usr-1', convertedSaleId: 'sale-1', scope: baseScope, version: 2 },
    ];
    const report = computeCustomerVisitConversion({ allVisits: visits, allSales: [sale1], fromDate: '2025-01-15', toDate: '2025-01-15' });
    expect(report.convertedVisits).toBe(2);
    expect(report.influencedRevenue).toBe(1180);
    expect(report.rows.every((row) => row.averageInfluencedBasket === 1180)).toBe(true);
  });
});

describe('computeExchangeCreditNoteReadiness', () => {
  it('joins credit-note evidence to replacement exchanges and keeps provider state explicit', () => {
    const exchanges: RetailExchange[] = [
      {
        id: 'exchange-1', number: 'EXCH/25-26/00001', retailReturnId: 'return-1', retailReturnNumber: 'RTRN/25-26/00001', financialCreditId: 'credit-1', sourceCreditVersion: 2,
        counterId: 'counter-1', cashierShiftId: 'shift-1', cashierId: 'usr-1', customerAccountId: 'customer-1', transactionKey: 'EXCH-1', requestChecksum: 'a'.repeat(64), replacementLines: [], replacementSubtotal: 1100, replacementTaxPreview: sale1.taxPreview, replacementGrandTotal: 1300, replacementCostTotal: 700, creditApplied: 1180, netTopUp: 120, topUpTender: { id: 'tender-1', method: 'upi', amount: 120, reference: 'UPI-1' }, replacementSaleId: 'sale-1', replacementInvoiceId: 'inv-sale-1', replacementPaymentReceiptIds: [], replacementCostJournalDraftId: 'journal-1', status: 'approved', requestedBy: 'usr-1', requestedAt: '2025-01-15T10:00:00.000Z', approvedBy: 'usr-2', approvedAt: '2025-01-15T11:00:00.000Z', approvalEvidenceReference: 'EXCH-REVIEW', scope: baseScope, version: 2,
      },
    ];
    const creditNotes: RetailCreditNoteReconciliation[] = [
      { id: 'credit-note-1', number: 'RCN/202501/00001', retailReturnId: 'return-1', retailReturnNumber: 'RTRN/25-26/00001', gstCreditEvidenceId: 'gst-credit-1', gstCreditEvidenceNumber: 'GSTC-1', sourceInvoiceId: 'inv-original-1', sourceInvoiceNumber: 'INV-ORIG-1', filingPeriod: '2025-01', taxableValue: 1000, cgst: 90, sgst: 90, igst: 0, cess: 0, totalTax: 180, totalCredit: 1180, payloadChecksum: 'b'.repeat(64), status: 'matched', externalReference: 'IRN-CN-1', portalPayloadChecksum: 'b'.repeat(64), requestedBy: 'usr-1', requestedAt: '2025-01-15T12:00:00.000Z', submittedAt: '2025-01-15T12:30:00.000Z', reconciledBy: 'usr-2', reconciledAt: '2025-01-15T13:00:00.000Z', scope: baseScope, version: 2,
      },
      { id: 'credit-note-2', number: 'RCN/202501/00002', retailReturnId: 'return-2', retailReturnNumber: 'RTRN/25-26/00002', gstCreditEvidenceId: 'gst-credit-2', gstCreditEvidenceNumber: 'GSTC-2', sourceInvoiceId: 'inv-original-2', sourceInvoiceNumber: 'INV-ORIG-2', filingPeriod: '2025-01', taxableValue: 500, cgst: 45, sgst: 45, igst: 0, cess: 0, totalTax: 90, totalCredit: 590, payloadChecksum: 'c'.repeat(64), status: 'prepared', requestedBy: 'usr-1', requestedAt: '2025-01-20T12:00:00.000Z', scope: baseScope, version: 1,
      },
    ];
    const report = computeExchangeCreditNoteReadiness({ allExchanges: exchanges, allCreditNotes: creditNotes, fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ totalExchanges: 1, approvedExchanges: 1, exchangeTopUpValue: 120, replacementRevenue: 1300, totalCreditNotes: 2, matchedCreditNotes: 1, pendingCreditNotes: 1, blockedCreditNotes: 1, totalCreditValue: 1770, unpairedExchangeCount: 0 });
    expect(report.rows.find(({ creditNoteNumber }) => creditNoteNumber === 'RCN/202501/00001')).toMatchObject({ status: 'matched', exchangeStatus: 'approved', exchangeCount: 1, replacementRevenue: 1300, topUpValue: 120, actionRequired: false });
    expect(report.rows.find(({ creditNoteNumber }) => creditNoteNumber === 'RCN/202501/00002')).toMatchObject({ status: 'prepared', exchangeStatus: 'none', exchangeCount: 0, actionRequired: true });
  });

  it('counts drift and missing credit-note evidence as blocked without treating rejected exchanges as revenue', () => {
    const exchanges: RetailExchange[] = [{
      id: 'exchange-rejected', number: 'EXCH/25-26/00009', retailReturnId: 'return-9', retailReturnNumber: 'RTRN/25-26/00009', financialCreditId: 'credit-9', sourceCreditVersion: 1, counterId: 'counter-1', cashierShiftId: 'shift-1', cashierId: 'usr-1', customerAccountId: 'customer-1', transactionKey: 'EXCH-9', requestChecksum: 'd'.repeat(64), replacementLines: [], replacementSubtotal: 1000, replacementTaxPreview: sale1.taxPreview, replacementGrandTotal: 1180, replacementCostTotal: 500, creditApplied: 1180, netTopUp: 0, status: 'rejected', requestedBy: 'usr-1', requestedAt: '2025-01-10T10:00:00.000Z', rejectedBy: 'usr-2', rejectedAt: '2025-01-10T11:00:00.000Z', rejectionReason: 'No stock', scope: baseScope, version: 2,
    }];
    const creditNotes: RetailCreditNoteReconciliation[] = [
      { id: 'credit-note-drift', number: 'RCN/202501/00009', retailReturnId: 'return-9', retailReturnNumber: 'RTRN/25-26/00009', gstCreditEvidenceId: 'gst-credit-9', gstCreditEvidenceNumber: 'GSTC-9', sourceInvoiceId: 'inv-original-9', sourceInvoiceNumber: 'INV-ORIG-9', filingPeriod: '2025-01', taxableValue: 1000, cgst: 90, sgst: 90, igst: 0, cess: 0, totalTax: 180, totalCredit: 1180, payloadChecksum: 'e'.repeat(64), status: 'drift', portalPayloadChecksum: 'f'.repeat(64), requestedBy: 'usr-1', requestedAt: '2025-01-10T12:00:00.000Z', scope: baseScope, version: 2,
      },
      { id: 'credit-note-missing', number: 'RCN/202501/00010', retailReturnId: 'return-10', retailReturnNumber: 'RTRN/25-26/00010', gstCreditEvidenceId: 'gst-credit-10', gstCreditEvidenceNumber: 'GSTC-10', sourceInvoiceId: 'inv-original-10', sourceInvoiceNumber: 'INV-ORIG-10', filingPeriod: '2025-01', taxableValue: 400, cgst: 36, sgst: 36, igst: 0, cess: 0, totalTax: 72, totalCredit: 472, payloadChecksum: 'g'.repeat(64), status: 'missing', requestedBy: 'usr-1', requestedAt: '2025-01-11T12:00:00.000Z', scope: baseScope, version: 2,
      },
    ];
    const report = computeExchangeCreditNoteReadiness({ allExchanges: exchanges, allCreditNotes: creditNotes, fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ totalExchanges: 1, approvedExchanges: 0, rejectedExchanges: 1, replacementRevenue: 0, blockedCreditNotes: 2, driftCreditNotes: 1, missingCreditNotes: 1, unpairedExchangeCount: 0 });
    expect(report.rows.every((row) => row.actionRequired)).toBe(true);
  });
});

describe('computeRetailChannelSettlementReadiness', () => {
  it('separates balanced settlement evidence from unresolved channel obligations and external gates', () => {
    const connectors: RetailCommerceConnector[] = [
      { id: 'connector-1', code: 'SHOP-ONLINE', name: 'Online marketplace', channel: 'marketplace', environment: 'production', baseUrl: 'https://marketplace.example', capabilities: ['settlement-pull'], credentialStatus: 'configured', credentialFingerprint: 'fp-1', status: 'certified', createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 2 },
      { id: 'connector-2', code: 'ONDC-SANDBOX', name: 'ONDC sandbox', channel: 'ondc', environment: 'sandbox', baseUrl: 'https://ondc.example', capabilities: ['settlement-pull'], credentialStatus: 'configured', status: 'configured', createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 2 },
    ];
    const settlements: RetailSettlementReconciliation[] = [
      { id: 'settlement-1', number: 'RSET/25-26/00001', connectorId: 'connector-1', settlementReference: 'SET-1', periodFrom: '2025-01-01', periodTo: '2025-01-07', grossAmount: 1180, feeAmount: 50, taxWithheldAmount: 20, netAmount: 1110, localNetAmount: 1110, varianceAmount: 0, orderIds: ['order-1'], remotePayloadChecksum: 'a'.repeat(64), status: 'matched', requestedBy: 'maker', requestedAt: '2025-01-08T10:00:00.000Z', allocationPackId: 'allocation-1', withholdingEvidenceId: 'withholding-1', journalDraftId: 'journal-1', scope: baseScope, version: 2 },
      { id: 'settlement-2', number: 'RSET/25-26/00002', connectorId: 'connector-2', settlementReference: 'SET-2', periodFrom: '2025-01-02', periodTo: '2025-01-08', grossAmount: 590, feeAmount: 30, taxWithheldAmount: 10, netAmount: 550, localNetAmount: 560, varianceAmount: -10, orderIds: ['order-2'], remotePayloadChecksum: 'b'.repeat(64), status: 'variance-review', requestedBy: 'maker', requestedAt: '2025-01-09T10:00:00.000Z', scope: baseScope, version: 1 },
    ];
    const allocations: RetailSettlementAllocationPack[] = [{ id: 'allocation-1', settlementId: 'settlement-1', connectorId: 'connector-1', allocations: [{ orderId: 'order-1', grossAmount: 1180, refundAmount: 0, feeAmount: 50, taxWithheldAmount: 20, netAmount: 1110 }], allocatedGrossAmount: 1180, allocatedRefundAmount: 0, allocatedFeeAmount: 50, allocatedTaxWithheldAmount: 20, allocatedNetAmount: 1110, payloadChecksum: 'c'.repeat(64), status: 'approved', requestedBy: 'maker', requestedAt: '2025-01-08T11:00:00.000Z', decidedBy: 'checker', decidedAt: '2025-01-08T12:00:00.000Z', decisionEvidence: 'Order-level allocation reconciled', scope: baseScope, version: 2 }];
    const withholding: RetailSettlementWithholdingEvidence[] = [{ id: 'withholding-1', settlementId: 'settlement-1', connectorId: 'connector-1', taxType: 'tds', periodFrom: '2025-01-01', periodTo: '2025-01-07', amount: 20, certificateReference: 'TDS-CERT-1', challanReference: 'CHALLAN-1', status: 'approved', requestedBy: 'maker', requestedAt: '2025-01-08T11:00:00.000Z', decidedBy: 'checker', decidedAt: '2025-01-08T12:00:00.000Z', decisionEvidence: 'Certificate matched to settlement', scope: baseScope, version: 2 }];
    const conflicts: RetailCommerceConflictResolution[] = [{ id: 'conflict-1', conflictId: 'settlement-variance-2', kind: 'settlement-variance', sourceId: 'settlement-2', connectorId: 'connector-2', decision: 'retry', status: 'prepared', requestedBy: 'maker', requestedAt: '2025-01-09T11:00:00.000Z', evidence: 'Investigate provider variance', scope: baseScope, version: 1 }];
    const report = computeRetailChannelSettlementReadiness({ connectors, settlements, allocations, withholding, conflicts, fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ connectorCount: 2, settlementCount: 2, readySettlementCount: 1, blockedSettlementCount: 1, matchedSettlementCount: 1, varianceReviewCount: 1, grossAmount: 1770, refundAmount: 0, netAmount: 1660, feeAmount: 80, taxWithheldAmount: 30, varianceExposure: 10, missingAllocationCount: 1, missingWithholdingCount: 1, openConflictCount: 1, externalCertificationGates: 1 });
    expect(report.rows.find(({ connectorCode }) => connectorCode === 'SHOP-ONLINE')).toMatchObject({ connectorState: 'ready', settlementCount: 1, readySettlementCount: 1, actionRequired: false });
    expect(report.rows.find(({ connectorCode }) => connectorCode === 'ONDC-SANDBOX')).toMatchObject({ connectorState: 'external-certification', settlementCount: 1, readySettlementCount: 0, missingAllocationCount: 1, missingWithholdingCount: 1, openConflictCount: 1, actionRequired: true });
  });

  it('excludes settlements outside the selected period and keeps rejected settlement value visible but blocked', () => {
    const connector: RetailCommerceConnector = { id: 'connector-3', code: 'WEB-3', name: 'Web store', channel: 'website', environment: 'production', baseUrl: 'https://web.example', capabilities: ['settlement-pull'], credentialStatus: 'configured', status: 'certified', createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 1 };
    const settlement: RetailSettlementReconciliation = { id: 'settlement-3', number: 'RSET/25-26/00003', connectorId: 'connector-3', settlementReference: 'SET-3', periodFrom: '2024-12-01', periodTo: '2024-12-31', grossAmount: 100, feeAmount: 5, taxWithheldAmount: 0, netAmount: 95, localNetAmount: 95, varianceAmount: 0, orderIds: [], remotePayloadChecksum: 'd'.repeat(64), status: 'rejected', requestedBy: 'maker', requestedAt: '2024-12-31T10:00:00.000Z', scope: baseScope, version: 1 };
    const inPeriodRejected: RetailSettlementReconciliation = { ...settlement, id: 'settlement-4', number: 'RSET/25-26/00004', periodFrom: '2025-01-15', periodTo: '2025-01-15', requestedAt: '2025-01-16T10:00:00.000Z' };
    const report = computeRetailChannelSettlementReadiness({ connectors: [connector], settlements: [settlement, inPeriodRejected], allocations: [], withholding: [], conflicts: [], fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report.settlementCount).toBe(1);
    expect(report.rejectedSettlementCount).toBe(1);
    expect(report.blockedSettlementCount).toBe(1);
    expect(report.rows[0]).toMatchObject({ connectorState: 'internal-blocked', rejectedSettlementCount: 1, actionRequired: true });
  });

  it('surfaces a balanced payout whose linked channel order is still open', () => {
    const connector: RetailCommerceConnector = { id: 'connector-open', code: 'OPEN-CHANNEL', name: 'Open channel', channel: 'marketplace', environment: 'production', baseUrl: 'https://marketplace.example', capabilities: ['settlement-pull'], credentialStatus: 'configured', credentialFingerprint: 'fp-open', status: 'certified', createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 1 };
    const settlement: RetailSettlementReconciliation = { id: 'settlement-open', number: 'RSET/25-26/00005', connectorId: connector.id, settlementReference: 'SET-OPEN', periodFrom: '2025-01-01', periodTo: '2025-01-31', grossAmount: 105, feeAmount: 5, taxWithheldAmount: 0, netAmount: 100, localNetAmount: 100, varianceAmount: 0, orderIds: ['order-open'], remotePayloadChecksum: 'a'.repeat(64), status: 'matched', requestedBy: 'maker', requestedAt: '2025-01-31T10:00:00.000Z', allocationPackId: 'allocation-open', journalDraftId: 'journal-open', scope: baseScope, version: 2 };
    const order: RetailCommerceOrder = { id: 'order-open', connectorId: connector.id, remoteOrderId: 'REMOTE-OPEN', orderNumber: 'MKT-OPEN', status: 'imported', lines: [], totalAmount: 105, remoteCreatedAt: '2025-01-31T09:00:00.000Z', remotePayloadChecksum: 'b'.repeat(64), importedBy: 'maker', importedAt: '2025-01-31T09:01:00.000Z', scope: baseScope, version: 1 };
    const allocation: RetailSettlementAllocationPack = { id: 'allocation-open', settlementId: settlement.id, connectorId: connector.id, allocations: [{ orderId: order.id, grossAmount: 105, refundAmount: 0, feeAmount: 5, taxWithheldAmount: 0, netAmount: 100 }], allocatedGrossAmount: 105, allocatedRefundAmount: 0, allocatedFeeAmount: 5, allocatedTaxWithheldAmount: 0, allocatedNetAmount: 100, payloadChecksum: 'c'.repeat(64), status: 'approved', requestedBy: 'maker', requestedAt: '2025-01-31T11:00:00.000Z', decidedBy: 'checker', decidedAt: '2025-01-31T12:00:00.000Z', decisionEvidence: 'Allocation checked', scope: baseScope, version: 2 };
    const report = computeRetailChannelSettlementReadiness({ connectors: [connector], settlements: [settlement], allocations: [allocation], withholding: [], conflicts: [], orders: [order], fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ readySettlementCount: 0, blockedSettlementCount: 1, orderClosureGapCount: 1, exceptionCount: 1 });
    expect(report.exceptions[0]).toMatchObject({ settlementId: settlement.id, connectorCode: connector.code, kind: 'order-closure', severity: 'high', amount: 100 });
    expect(report.rows[0]).toMatchObject({ orderClosureGapCount: 1, exceptionCount: 1, actionRequired: true });
  });
});

describe('computeRetailSettlementExceptionTriage', () => {
  it('routes internal settlement blockers before external certification and totals only internal exposure', () => {
    const report = {
      fromDate: '2025-01-01',
      toDate: '2025-01-31',
      connectorCount: 1,
      settlementCount: 1,
      readySettlementCount: 0,
      blockedSettlementCount: 1,
      matchedSettlementCount: 0,
      resolvedSettlementCount: 0,
      varianceReviewCount: 1,
      rejectedSettlementCount: 0,
      grossAmount: 1_180,
      refundAmount: 0,
      feeAmount: 50,
      taxWithheldAmount: 20,
      netAmount: 1_110,
      varianceExposure: 25,
      missingAllocationCount: 1,
      missingWithholdingCount: 1,
      orderClosureGapCount: 0,
      openConflictCount: 0,
      externalCertificationGates: 1,
      exceptionCount: 4,
      exceptions: [
        { settlementId: 'settlement-1', settlementNumber: 'RSET/25-26/00001', settlementReference: 'SET-1', connectorId: 'connector-1', connectorCode: 'MKT-1', channel: 'marketplace' as const, kind: 'external-certification' as const, severity: 'external' as const, amount: 0, action: 'Complete provider certification.' },
        { settlementId: 'settlement-1', settlementNumber: 'RSET/25-26/00001', settlementReference: 'SET-1', connectorId: 'connector-1', connectorCode: 'MKT-1', channel: 'marketplace' as const, kind: 'missing-withholding' as const, severity: 'high' as const, amount: 20, action: 'Attach TDS evidence.' },
        { settlementId: 'settlement-1', settlementNumber: 'RSET/25-26/00001', settlementReference: 'SET-1', connectorId: 'connector-1', connectorCode: 'MKT-1', channel: 'marketplace' as const, kind: 'missing-journal' as const, severity: 'medium' as const, amount: 1_110, action: 'Prepare journal.' },
        { settlementId: 'settlement-1', settlementNumber: 'RSET/25-26/00001', settlementReference: 'SET-1', connectorId: 'connector-1', connectorCode: 'MKT-1', channel: 'marketplace' as const, kind: 'variance' as const, severity: 'high' as const, amount: 25, action: 'Investigate variance.' },
      ],
      rows: [],
    };
    const triage = computeRetailSettlementExceptionTriage(report);
    expect(triage).toMatchObject({ totalCount: 4, urgentCount: 2, internalCount: 3, externalCount: 1, exposureAmount: 1_155 });
    expect(triage.items.map(({ kind }) => kind)).toEqual(['variance', 'missing-withholding', 'missing-journal', 'external-certification']);
    expect(triage.items[0]).toMatchObject({ owner: 'finance', priority: 'urgent', route: 'Finance · payout variance', blockedByExternal: false });
    expect(triage.items[3]).toMatchObject({ owner: 'provider', priority: 'external', blockedByExternal: true });
  });
});

describe('computeRetailPayoutReadiness', () => {
  it('separates released commission evidence from provider-certified payout readiness', () => {
    const commissions: RetailSalesCommission[] = [
      { id: 'commission-1', saleId: 'sale-1', salespersonUserId: 'seller-a', basisAmount: 10_000, ratePercent: 5, commissionAmount: 500, status: 'paid', createdAt: '2025-01-10T10:00:00.000Z', payoutReference: 'BANK-REL-1 / PAYB-1', payoutBatchId: 'batch-1', scope: baseScope, version: 2 },
      { id: 'commission-2', saleId: 'sale-2', salespersonUserId: 'seller-b', basisAmount: 4_000, ratePercent: 5, commissionAmount: 200, status: 'approved', createdAt: '2025-01-11T10:00:00.000Z', scope: baseScope, version: 1 },
    ];
    const batches: RetailCommissionPayoutBatch[] = [{ id: 'batch-1', number: 'PAYB/25-26/00001', commissionIds: ['commission-1'], payoutDate: '2025-01-12', totalAmount: 500, notes: 'January release', status: 'released', submittedBy: 'maker', submittedAt: '2025-01-12T09:00:00.000Z', approvedBy: 'checker', approvedAt: '2025-01-12T10:00:00.000Z', releasedBy: 'releaser', releasedAt: '2025-01-12T11:00:00.000Z', releaseReference: 'BANK-REL-1', scope: baseScope, version: 3 }];
    const provider: ProviderConnector = { id: 'bank-provider', code: 'BANK-PAY', name: 'Bank payout rail', providerLegalName: 'Example Bank', domain: 'banking', environment: 'production', baseUrl: 'https://bank.example', statusPathTemplate: '/payments/{id}', capabilities: ['payment-release'], specificationVersion: '1.0', credentialStatus: 'configured', credentialFingerprint: 'fp-bank', conformanceStatus: 'production-approved', active: true, createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', approvedBy: 'checker', approvedAt: '2025-01-02T00:00:00.000Z', scope: baseScope, version: 2 };
    const conformance: ProviderConformanceCase[] = [{ id: 'case-bank', connectorId: 'bank-provider', suiteName: 'Bank payout', suiteVersion: '1.0', scenario: 'Payment release', environment: 'production', result: 'passed', evidenceReference: 'BANK-CASE-1', resultChecksum: 'a'.repeat(64), preparedBy: 'maker', preparedAt: '2025-01-02T00:00:00.000Z', assessedBy: 'checker', assessedAt: '2025-01-03T00:00:00.000Z', scope: baseScope, version: 2 }];
    const report = computeRetailPayoutReadiness({ allCommissions: commissions, allBatches: batches, providerConnectors: [provider], providerConformanceCases: conformance, fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ batchCount: 1, releasedBatchCount: 1, releasedAmount: 500, unbatchedApprovedCount: 1, unbatchedApprovedAmount: 200, providerGate: 'ready', actionRequired: true });
    expect(report.rows[0]).toMatchObject({ batchNumber: 'PAYB/25-26/00001', status: 'released', providerState: 'ready', totalAmount: 500, actionRequired: false });
  });

  it('blocks an approved batch when no production payment-release certification exists', () => {
    const commissions: RetailSalesCommission[] = [{ id: 'commission-3', saleId: 'sale-3', salespersonUserId: 'seller-c', basisAmount: 20_000, ratePercent: 5, commissionAmount: 1_000, status: 'approved', createdAt: '2025-02-10T10:00:00.000Z', payoutBatchId: 'batch-2', scope: baseScope, version: 2 }];
    const batches: RetailCommissionPayoutBatch[] = [{ id: 'batch-2', number: 'PAYB/25-26/00002', commissionIds: ['commission-3'], payoutDate: '2025-02-11', totalAmount: 1_000, notes: 'February release', status: 'approved', submittedBy: 'maker', submittedAt: '2025-02-11T09:00:00.000Z', approvedBy: 'checker', approvedAt: '2025-02-11T10:00:00.000Z', scope: baseScope, version: 2 }];
    const sandboxProvider: ProviderConnector = { id: 'bank-sandbox', code: 'BANK-SBX', name: 'Sandbox bank', providerLegalName: 'Sandbox Bank', domain: 'banking', environment: 'sandbox', baseUrl: 'https://sandbox.example', statusPathTemplate: '/payments/{id}', capabilities: ['payment-release'], specificationVersion: '1.0', credentialStatus: 'configured', conformanceStatus: 'sandbox-verified', active: true, createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 1 };
    const report = computeRetailPayoutReadiness({ allCommissions: commissions, allBatches: batches, providerConnectors: [sandboxProvider], providerConformanceCases: [], fromDate: '2025-02-01', toDate: '2025-02-28' });
    expect(report).toMatchObject({ batchCount: 1, approvedBatchCount: 1, approvedAmount: 1_000, providerGate: 'external-certification', actionRequired: true });
    expect(report.rows[0]).toMatchObject({ providerState: 'external-certification', actionRequired: true });
  });
});

describe('computeRetailPayoutRailReadiness', () => {
  const productionBank: ProviderConnector = {
    id: 'bank-rail', code: 'BANK-RAIL', name: 'Bank payout rail', providerLegalName: 'Example Bank', domain: 'banking', environment: 'production',
    baseUrl: 'https://bank.example', statusPathTemplate: '/payments/{id}', capabilities: ['payment-release', 'payment-status-pull'], specificationVersion: '1.0',
    credentialStatus: 'configured', credentialFingerprint: 'fp-bank', conformanceStatus: 'production-approved', active: true, createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 2,
  };
  const payrollProvider: ProviderConnector = {
    id: 'payroll-rail', code: 'PAYROLL-RAIL', name: 'Payroll disbursement rail', providerLegalName: 'Example Payroll', domain: 'payroll', environment: 'production',
    baseUrl: 'https://payroll.example', statusPathTemplate: '/runs/{id}', capabilities: ['payroll-disbursement', 'payroll-status-pull'], specificationVersion: '1.0',
    credentialStatus: 'configured', credentialFingerprint: 'fp-payroll', conformanceStatus: 'production-approved', active: true, createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 2,
  };

  it('joins certified banking and payroll rails with retail payout and payroll obligations', () => {
    const conformance: ProviderConformanceCase[] = [
      ...['payment-release', 'payment-status-pull'].map((capability, index) => ({ id: `bank-case-${index}`, connectorId: 'bank-rail', suiteName: 'Bank rail', suiteVersion: '1.0', scenario: capability, environment: 'production' as const, result: 'passed' as const, evidenceReference: `BANK-${index}`, resultChecksum: 'a'.repeat(64), preparedBy: 'maker', preparedAt: '2025-01-01T00:00:00.000Z', assessedBy: 'checker', assessedAt: '2025-01-02T00:00:00.000Z', scope: baseScope, version: 1 })),
      ...['payroll-disbursement', 'payroll-status-pull'].map((capability, index) => ({ id: `payroll-case-${index}`, connectorId: 'payroll-rail', suiteName: 'Payroll rail', suiteVersion: '1.0', scenario: capability, environment: 'production' as const, result: 'passed' as const, evidenceReference: `PAYROLL-${index}`, resultChecksum: 'b'.repeat(64), preparedBy: 'maker', preparedAt: '2025-01-01T00:00:00.000Z', assessedBy: 'checker', assessedAt: '2025-01-02T00:00:00.000Z', scope: baseScope, version: 1 })),
    ];
    const submissions: ProviderSubmission[] = [];
    const reconciliationRuns: ProviderReconciliationRun[] = [];
    const payrollRuns: PayrollRun[] = [{ id: 'run-1', number: 'PAY/25-26/00001', periodFrom: '2025-01-01', periodTo: '2025-01-31', paymentDate: '2025-02-01', workforceProfileIds: ['wf-1'], policySnapshots: [], adjustmentIds: [], slipIds: [], totalGrossPay: 10000, totalEmployeeDeductions: 1000, totalEmployerContributions: 500, totalNetPay: 9000, status: 'finalized', requestedBy: 'maker', requestedAt: '2025-01-31T09:00:00.000Z', finalizedBy: 'releaser', finalizedAt: '2025-01-31T11:00:00.000Z', paymentReference: 'PAY-1', scope: baseScope, version: 2 }];
    const report = computeRetailPayoutRailReadiness({
      providerConnectors: [productionBank, payrollProvider], providerConformanceCases: conformance, providerSubmissions: submissions, providerReconciliationRuns: reconciliationRuns,
      commissionBatches: [{ id: 'batch-1', number: 'PAYB/25-26/00001', commissionIds: [], payoutDate: '2025-01-12', totalAmount: 500, notes: 'January release', status: 'released', submittedBy: 'maker', submittedAt: '2025-01-12T09:00:00.000Z', releasedBy: 'releaser', releasedAt: '2025-01-12T11:00:00.000Z', releaseReference: 'BANK-REL-1', scope: baseScope, version: 2 }],
      payrollRuns, fromDate: '2025-01-01', toDate: '2025-01-31',
    });
    expect(report).toMatchObject({ connectorCount: 2, productionReadyCount: 2, externalCertificationGates: 0, commissionReleasedAmount: 500, payrollFinalizedCount: 1, payrollNetPay: 9000, actionRequired: false });
    expect(report.rows.find(({ domain }) => domain === 'banking')).toMatchObject({ providerState: 'ready', pendingSubmissionCount: 0, reconciliationDriftCount: 0, nextAction: 'ready' });
    expect(report.rows.find(({ domain }) => domain === 'payroll')).toMatchObject({ providerState: 'ready', nextAction: 'ready' });
  });

  it('keeps missing certification, pending handoffs, and reconciliation drift actionable', () => {
    const pending: ProviderSubmission = { id: 'sub-1', number: 'SUB-1', connectorId: 'bank-rail', domain: 'banking', capability: 'payment-release', sourceKind: 'payment-proposal', sourceIds: ['batch-1'], payloadChecksum: 'c'.repeat(64), status: 'handed-off', preparedBy: 'maker', preparedAt: '2025-01-12T09:00:00.000Z', handedOffBy: 'maker', handedOffAt: '2025-01-12T10:00:00.000Z', requestReference: 'REQ-1', version: 1, scope: baseScope };
    const drift: ProviderReconciliationRun = { id: 'recon-1', number: 'RECON-1', connectorId: 'bank-rail', submissionIds: ['sub-1'], items: [{ submissionId: 'sub-1', localStatus: 'handed-off', remoteStatus: 'pending', result: 'drift' }], status: 'completed-with-exceptions', requestedBy: 'checker', requestedAt: '2025-01-13T09:00:00.000Z', completedAt: '2025-01-13T10:00:00.000Z', checksum: 'd'.repeat(64), scope: baseScope };
    const report = computeRetailPayoutRailReadiness({ providerConnectors: [{ ...productionBank, capabilities: ['payment-release'] }], providerConformanceCases: [], providerSubmissions: [pending], providerReconciliationRuns: [drift], commissionBatches: [], payrollRuns: [], fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ connectorCount: 1, externalCertificationGates: 1, pendingSubmissionCount: 1, reconciliationDriftCount: 1, actionRequired: true });
    expect(report.rows[0]).toMatchObject({ providerState: 'external-certification', missingCapabilityCount: 1, nextAction: 'configure-certification' });
  });
});

describe('computeRetailOcrReadiness', () => {
  it('shows provider certification, conversion coverage, confidence, and exception workload separately', () => {
    const providers: RetailOcrProviderProfile[] = [
      { id: 'ocr-certified', code: 'OCR-CERT', name: 'Certified invoice OCR', mode: 'api', status: 'certified', credentialStatus: 'configured', credentialFingerprint: 'fp-ocr-1', supportedDocumentKinds: ['supplier-invoice'], createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', lastTestEvidence: 'OCR-TEST-1', lastTestedAt: '2025-01-02T00:00:00.000Z', scope: baseScope, version: 2 },
      { id: 'ocr-draft', code: 'OCR-DRAFT', name: 'Draft OCR', mode: 'manual', status: 'configured', credentialStatus: 'missing', supportedDocumentKinds: ['supplier-invoice'], createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 1 },
    ];
    const documents: RetailPurchaseOcrDocument[] = [
      { id: 'ocr-doc-1', number: 'OCR/25-26/00001', source: 'upload', fileName: 'invoice-1.pdf', fileChecksum: 'a'.repeat(64), supplierId: 'supplier-1', purchaseOrderId: 'po-1', goodsReceiptId: 'grn-1', ocrProviderProfileId: 'ocr-certified', extractedInvoiceNumber: 'SUP-001', extractedInvoiceDate: '2025-01-10', extractedSupplierGstin: '27ABCDE1234F1Z5', extractedTotalAmount: 1180, extractionConfidence: 0.98, lines: [{ id: 'ocr-line-1', description: 'Rice', itemVariantId: 'var-1', purchaseOrderLineId: 'po-line-1', quantity: 1, unitPrice: 1000, gstRate: 18, confidence: 0.98 }], status: 'converted', submittedBy: 'maker', submittedAt: '2025-01-10T10:00:00.000Z', reviewedBy: 'checker', reviewedAt: '2025-01-10T11:00:00.000Z', convertedSupplierInvoiceId: 'supplier-invoice-1', scope: baseScope, version: 3 },
      { id: 'ocr-doc-2', number: 'OCR/25-26/00002', source: 'upload', fileName: 'invoice-2.pdf', fileChecksum: 'b'.repeat(64), supplierId: 'supplier-2', purchaseOrderId: 'po-2', ocrProviderProfileId: 'ocr-draft', extractedInvoiceNumber: 'SUP-002', extractedInvoiceDate: '2025-01-11', extractedSupplierGstin: '27ABCDE1234F1Z5', extractedTotalAmount: 590, extractionConfidence: 0.72, lines: [{ id: 'ocr-line-2', description: 'Oil', quantity: 1, unitPrice: 500, gstRate: 18, confidence: 0.72 }], status: 'approved', submittedBy: 'maker', submittedAt: '2025-01-11T10:00:00.000Z', reviewedBy: 'checker', reviewedAt: '2025-01-11T11:00:00.000Z', scope: baseScope, version: 2 },
    ];
    const mappings: RetailPurchaseOcrMapping[] = [
      { id: 'ocr-map-1', ocrDocumentId: 'ocr-doc-1', mappings: [{ ocrLineId: 'ocr-line-1', purchaseOrderLineId: 'po-line-1', itemVariantId: 'var-1' }], status: 'applied', requestedBy: 'maker', requestedAt: '2025-01-10T11:00:00.000Z', appliedBy: 'checker', appliedAt: '2025-01-10T12:00:00.000Z', evidence: 'Mapping verified', scope: baseScope, version: 2 },
      { id: 'ocr-map-2', ocrDocumentId: 'ocr-doc-2', mappings: [], status: 'prepared', requestedBy: 'maker', requestedAt: '2025-01-11T11:00:00.000Z', scope: baseScope, version: 1 },
    ];
    const exceptions: RetailPurchaseException[] = [{ id: 'ocr-exception-2', number: 'RPEX/25-26/00001', ocrDocumentId: 'ocr-doc-2', ocrLineId: 'ocr-line-2', kind: 'low-confidence', severity: 'critical', status: 'open', message: 'Extraction confidence is below the controlled threshold.', suggestedAction: 'Review the source invoice.', requestedBy: 'maker', requestedAt: '2025-01-11T12:00:00.000Z', scope: baseScope, version: 1 }];
    const report = computeRetailOcrReadiness({ providers, documents, mappings, exceptions, fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ providerCount: 2, certifiedProviderCount: 1, documentCount: 2, convertedDocumentCount: 1, openExceptionCount: 1, criticalExceptionCount: 1, mappingPendingCount: 1, externalCertificationGates: 1, actionRequired: true });
    expect(report.rows.find(({ providerCode }) => providerCode === 'OCR-CERT')).toMatchObject({ providerState: 'ready', documentCount: 1, convertedDocumentCount: 1, openExceptionCount: 0, actionRequired: false });
    expect(report.rows.find(({ providerCode }) => providerCode === 'OCR-DRAFT')).toMatchObject({ providerState: 'external-certification', documentCount: 1, convertedDocumentCount: 0, openExceptionCount: 1, mappingPendingCount: 1, actionRequired: true });
  });

  it('keeps unassigned OCR documents visible as a provider gate and excludes out-of-period documents', () => {
    const documents: RetailPurchaseOcrDocument[] = [{ id: 'ocr-unassigned', number: 'OCR/25-26/00009', source: 'upload', fileName: 'invoice.pdf', fileChecksum: 'c'.repeat(64), extractionConfidence: 0.9, lines: [], status: 'review', submittedBy: 'maker', submittedAt: '2024-12-31T10:00:00.000Z', scope: baseScope, version: 1 }];
    const report = computeRetailOcrReadiness({ providers: [], documents, mappings: [], exceptions: [], fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ providerCount: 0, documentCount: 0, unassignedDocumentCount: 0, actionRequired: false });
  });

  it('requires independently evidenced adapter certification and measures supplier-invoice field coverage', () => {
    const providers: RetailOcrProviderProfile[] = [
      { id: 'ocr-adapter-ready', code: 'OCR-READY', name: 'Certified adapter', mode: 'api', status: 'certified', credentialStatus: 'configured', credentialFingerprint: 'fp', supportedDocumentKinds: ['supplier-invoice'], createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', lastTestEvidence: 'sandbox + production invoice replay', lastTestedAt: '2025-01-03T00:00:00.000Z', lastTestedBy: 'checker', lastTestChecksum: 'a'.repeat(64), scope: baseScope, version: 3 },
      { id: 'ocr-adapter-gated', code: 'OCR-GATED', name: 'Uncertified adapter', mode: 'api', status: 'configured', credentialStatus: 'configured', credentialFingerprint: 'fp2', supportedDocumentKinds: ['supplier-invoice'], createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 2 },
    ];
    const documents: RetailPurchaseOcrDocument[] = [
      { id: 'ocr-adapter-doc-1', number: 'OCR/25-26/00010', source: 'upload', fileName: 'ready.pdf', fileChecksum: 'b'.repeat(64), ocrProviderProfileId: 'ocr-adapter-ready', extractedInvoiceNumber: 'SUP-010', extractedInvoiceDate: '2025-01-10', extractedSupplierGstin: '27ABCDE1234F1Z5', extractedTotalAmount: 118, extractionConfidence: 0.97, lines: [{ id: 'ocr-adapter-line-1', description: 'Tea', itemVariantId: 'var-1', purchaseOrderLineId: 'po-line-1', quantity: 1, unitPrice: 100, gstRate: 18, confidence: 0.97 }], status: 'converted', submittedBy: 'maker', submittedAt: '2025-01-10T10:00:00.000Z', scope: baseScope, version: 2 },
      { id: 'ocr-adapter-doc-2', number: 'OCR/25-26/00011', source: 'upload', fileName: 'gated.pdf', fileChecksum: 'c'.repeat(64), ocrProviderProfileId: 'ocr-adapter-gated', extractedTotalAmount: 50, extractionConfidence: 0.7, lines: [{ id: 'ocr-adapter-line-2', description: 'Oil', quantity: 1, unitPrice: 50, gstRate: 5, confidence: 0.7 }], status: 'review', submittedBy: 'maker', submittedAt: '2025-01-11T10:00:00.000Z', scope: baseScope, version: 1 },
    ];
    const report = computeRetailOcrAdapterReadiness({ providers, documents, exceptions: [], fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ providerCount: 2, certifiedAdapterCount: 1, externalCertificationGates: 1, documentCount: 2, headerCoveragePct: 50, actionRequired: true });
    expect(report.rows.find(({ providerCode }) => providerCode === 'OCR-READY')).toMatchObject({ providerState: 'ready', adapterCertified: true, headerCoveragePct: 100, lineCoveragePct: 100, nextAction: 'ready' });
    expect(report.rows.find(({ providerCode }) => providerCode === 'OCR-GATED')).toMatchObject({ providerState: 'external-certification', adapterCertified: false, nextAction: 'complete-adapter-certification' });
  });
});

describe('computeRetailInterBranchReadiness', () => {
  it('separates custody stages, in-transit value, evidence coverage, and route action queues', () => {
    const transfers: RetailInterBranchTransfer[] = [
      { id: 'ibt-arrived', number: 'IBT/25-26/00001', direction: 'outbound', originBranchId: 'branch-mumbai', destinationBranchId: 'branch-pune', sourceWarehouseId: 'wh-mum', destinationWarehouseId: 'wh-pun', sourceBinId: 'bin-mum', destinationBinId: 'bin-pun', inventoryTransferId: 'inv-transfer-1', lines: [{ itemVariantId: 'variant-rice', serialUnitIds: [], quantity: 10, unitCost: 50 }], totalValue: 500, status: 'arrived', requestedBy: 'maker', requestedAt: '2025-01-10T09:00:00.000Z', approvedBy: 'checker', approvedAt: '2025-01-10T10:00:00.000Z', approvalEvidenceReference: 'APP-1', dispatchedBy: 'logistics', dispatchedAt: '2025-01-10T11:00:00.000Z', dispatchEvidenceReference: 'DSP-1', arrivedBy: 'custodian', arrivedAt: '2025-01-11T11:00:00.000Z', arrivalEvidenceReference: 'ARR-1', dispatchJournalDraftId: 'journal-dispatch-1', arrivalJournalDraftId: 'journal-arrival-1', scope: baseScope, version: 4 },
      { id: 'ibt-transit', number: 'IBT/25-26/00002', direction: 'return-to-ho', originBranchId: 'branch-pune', destinationBranchId: 'branch-mumbai', sourceWarehouseId: 'wh-pun', destinationWarehouseId: 'wh-mum', sourceBinId: 'bin-pun', destinationBinId: 'bin-mum', inventoryTransferId: 'inv-transfer-2', lines: [{ itemVariantId: 'variant-oil', serialUnitIds: [], quantity: 4, unitCost: 50 }], totalValue: 200, status: 'dispatched', requestedBy: 'maker', requestedAt: '2025-01-12T09:00:00.000Z', approvedBy: 'checker', approvedAt: '2025-01-12T10:00:00.000Z', approvalEvidenceReference: 'APP-2', dispatchedBy: 'logistics', dispatchedAt: '2025-01-12T11:00:00.000Z', dispatchEvidenceReference: 'DSP-2', dispatchJournalDraftId: 'journal-dispatch-2', scope: baseScope, version: 3 },
      { id: 'ibt-out-of-range', number: 'IBT/24-25/00099', direction: 'outbound', originBranchId: 'branch-mumbai', destinationBranchId: 'branch-nashik', sourceWarehouseId: 'wh-mum', destinationWarehouseId: 'wh-nas', sourceBinId: 'bin-mum', destinationBinId: 'bin-nas', inventoryTransferId: 'inv-transfer-99', lines: [{ itemVariantId: 'variant-sugar', serialUnitIds: [], quantity: 2, unitCost: 25 }], totalValue: 50, status: 'draft', requestedBy: 'maker', requestedAt: '2024-12-31T09:00:00.000Z', scope: baseScope, version: 1 },
    ];
    const report = computeRetailInterBranchReadiness({ transfers, fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ transferCount: 2, routeCount: 2, arrivedCount: 1, dispatchedCount: 1, inTransitCount: 1, totalValue: 700, arrivedValue: 500, inTransitValue: 200, pendingApprovalCount: 0, pendingDispatchCount: 0, pendingArrivalCount: 1, approvalEvidenceCount: 2, dispatchEvidenceCount: 2, arrivalEvidenceCount: 1, dispatchJournalCount: 2, arrivalJournalCount: 1, actionRequired: true });
    expect(report.rows.find(({ transferId }) => transferId === 'ibt-arrived')).toMatchObject({ status: 'arrived', actionRequired: false, missingEvidenceCount: 0, missingJournalCount: 0 });
    expect(report.rows.find(({ transferId }) => transferId === 'ibt-transit')).toMatchObject({ status: 'dispatched', inTransitValue: 200, actionRequired: true, pendingNextStep: 'arrive', missingEvidenceCount: 0, missingJournalCount: 0 });
  });

  it('keeps terminal rejected transfers visible without creating a false arrival backlog', () => {
    const rejected: RetailInterBranchTransfer = { id: 'ibt-rejected', number: 'IBT/25-26/00003', direction: 'outbound', originBranchId: 'branch-mumbai', destinationBranchId: 'branch-pune', sourceWarehouseId: 'wh-mum', destinationWarehouseId: 'wh-pun', sourceBinId: 'bin-mum', destinationBinId: 'bin-pun', inventoryTransferId: 'inv-transfer-3', lines: [{ itemVariantId: 'variant-rice', serialUnitIds: [], quantity: 1, unitCost: 100 }], totalValue: 100, status: 'rejected', requestedBy: 'maker', requestedAt: '2025-01-20T09:00:00.000Z', rejectionReason: 'Stock reserved for a priority order', scope: baseScope, version: 2 };
    const report = computeRetailInterBranchReadiness({ transfers: [rejected], fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ transferCount: 1, rejectedCount: 1, inTransitCount: 0, actionRequired: false });
    expect(report.rows[0]).toMatchObject({ status: 'rejected', actionRequired: false, inTransitValue: 0 });
  });
});

describe('computeRetailProviderDeviceReadiness', () => {
  it('keeps payment, printer, and scale certification boundaries visible in one report', () => {
    const assessments: RetailProviderReadiness[] = [
      { kind: 'upi', label: 'UPI provider rail', status: 'external', detail: 'Provider certification is pending.', blockers: ['Production conformance evidence is incomplete.'], evidenceReferences: ['UPI-SBX-1'] },
      { kind: 'card', label: 'Card provider rail', status: 'ready', detail: 'Certified provider evidence is present.', blockers: [], evidenceReferences: ['CARD-PROD-1', 'CARD-PROD-2'] },
      { kind: 'printer', label: 'ESC/POS printer device', status: 'external', detail: 'Awaiting physical acknowledgement.', blockers: ['A prepared label payload still needs independent device acknowledgement.'], evidenceReferences: ['ESC-POS-1'] },
      { kind: 'scale', label: 'Weighted-SKU scale controls', status: 'blocked', detail: 'No active profile.', blockers: ['Create an active scale profile.'], evidenceReferences: [] },
    ];
    const report = computeRetailProviderDeviceReadiness({ assessments });
    expect(report).toMatchObject({ total: 4, ready: 1, external: 2, blocked: 1, evidenceCount: 4, actionRequired: true });
    expect(report.rows.find(({ kind }) => kind === 'scale')).toMatchObject({ kind: 'scale', status: 'blocked', nextAction: 'configure-device', actionRequired: true });
    expect(report.rows.find(({ kind }) => kind === 'card')).toMatchObject({ status: 'ready', nextAction: 'ready', evidenceCount: 2, actionRequired: false });
    expect(report.rows.find(({ kind }) => kind === 'printer')).toMatchObject({ nextAction: 'acknowledge-device', blockerCount: 1 });
  });
});

describe('computeRetailMarketplaceProductionReadiness', () => {
  it('requires production credentials, capability conformance, clean sync/order evidence, and reconciled settlements', () => {
    const connector: RetailCommerceConnector = { id: 'marketplace-prod', code: 'AMAZON-PROD', name: 'Marketplace production', channel: 'marketplace', environment: 'production', baseUrl: 'https://marketplace.example', capabilities: ['catalog-push', 'inventory-push', 'order-pull', 'settlement-pull'], credentialStatus: 'configured', credentialFingerprint: 'fp-prod', status: 'certified', createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 2 };
    const conformanceCases: RetailCommerceConformanceCase[] = connector.capabilities.map((capability, index) => ({ id: `case-${index}`, connectorId: connector.id, capability, suiteName: 'Marketplace production', suiteVersion: '1.0', scenario: `${capability} replay`, result: 'passed', evidenceReference: `CONF-${index}`, resultChecksum: 'a'.repeat(64), preparedBy: 'maker', preparedAt: '2025-01-02T00:00:00.000Z', assessedBy: 'checker', assessedAt: '2025-01-03T00:00:00.000Z', scope: baseScope, version: 2 }));
    const syncRuns: RetailCommerceSyncRun[] = [{ id: 'sync-1', number: 'SYNC-1', connectorId: connector.id, kind: 'orders', status: 'completed', requestChecksum: 'b'.repeat(64), evidenceReference: 'SYNC-ACK-1', remoteCursor: 'cursor-1', recordsRead: 1, recordsAccepted: 1, recordsRejected: 0, requestedBy: 'maker', requestedAt: '2025-01-10T09:00:00.000Z', completedAt: '2025-01-10T09:01:00.000Z', scope: baseScope, version: 2 }];
    const orders: RetailCommerceOrder[] = [{ id: 'order-1', connectorId: connector.id, remoteOrderId: 'REMOTE-1', orderNumber: 'MKT-1', status: 'fulfilled', lines: [{ itemVariantId: 'variant-1', remoteSku: 'REMOTE-SKU-1', quantity: 1, unitPrice: 100, taxableValue: 100, gstRate: 5 }], totalAmount: 105, remoteCreatedAt: '2025-01-10T09:00:00.000Z', remotePayloadChecksum: 'c'.repeat(64), localSalesOrderId: 'sales-order-1', salesOrderHandoffEvidence: 'SO-HANDOFF-1', salesOrderHandoffBy: 'checker', salesOrderHandoffAt: '2025-01-10T10:00:00.000Z', importedBy: 'maker', importedAt: '2025-01-10T09:02:00.000Z', version: 2, scope: baseScope }];
    const settlements: RetailSettlementReconciliation[] = [{ id: 'settlement-1', number: 'RSET-1', connectorId: connector.id, settlementReference: 'SET-1', periodFrom: '2025-01-01', periodTo: '2025-01-10', grossAmount: 105, feeAmount: 5, taxWithheldAmount: 0, netAmount: 100, localNetAmount: 100, varianceAmount: 0, orderIds: ['order-1'], remotePayloadChecksum: 'd'.repeat(64), status: 'matched', requestedBy: 'maker', requestedAt: '2025-01-11T09:00:00.000Z', allocationPackId: 'allocation-1', journalDraftId: 'journal-1', scope: baseScope, version: 2 }];
    const allocations: RetailSettlementAllocationPack[] = [{ id: 'allocation-1', settlementId: 'settlement-1', connectorId: connector.id, allocations: [{ orderId: 'order-1', grossAmount: 105, refundAmount: 0, feeAmount: 5, taxWithheldAmount: 0, netAmount: 100 }], allocatedGrossAmount: 105, allocatedRefundAmount: 0, allocatedFeeAmount: 5, allocatedTaxWithheldAmount: 0, allocatedNetAmount: 100, payloadChecksum: 'e'.repeat(64), status: 'approved', requestedBy: 'maker', requestedAt: '2025-01-11T10:00:00.000Z', decidedBy: 'checker', decidedAt: '2025-01-11T11:00:00.000Z', decisionEvidence: 'Allocation checked', version: 2, scope: baseScope }];
    const report = computeRetailMarketplaceProductionReadiness({ connectors: [connector], conformanceCases, syncRuns, orders, settlements, allocations, withholding: [], conflicts: [], fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ connectorCount: 1, productionReadyCount: 1, conformanceReadyCount: 1, syncFailureCount: 0, orderHandoffGapCount: 0, settlementVarianceExposure: 0, settlementReadyCount: 1, actionRequired: false });
    expect(report.rows[0]).toMatchObject({ connectorCode: 'AMAZON-PROD', providerState: 'ready', conformanceCoveragePct: 100, syncBlockerCount: 0, orderHandoffGapCount: 0, settlementReadyCount: 1, actionRequired: false });
  });

  it('keeps sandbox and unresolved production records blocked with explicit next actions', () => {
    const connector: RetailCommerceConnector = { id: 'ondc-sandbox', code: 'ONDC-SBX', name: 'ONDC sandbox', channel: 'ondc', environment: 'sandbox', baseUrl: 'https://ondc.example', capabilities: ['order-pull', 'settlement-pull'], credentialStatus: 'configured', status: 'configured', createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 1 };
    const syncRuns: RetailCommerceSyncRun[] = [{ id: 'sync-2', number: 'SYNC-2', connectorId: connector.id, kind: 'orders', status: 'prepared', requestChecksum: 'f'.repeat(64), recordsRead: 1, recordsAccepted: 0, recordsRejected: 0, requestedBy: 'maker', requestedAt: '2025-01-12T09:00:00.000Z', scope: baseScope, version: 1 }];
    const orders: RetailCommerceOrder[] = [{ id: 'order-2', connectorId: connector.id, remoteOrderId: 'REMOTE-2', orderNumber: 'ONDC-2', status: 'imported', lines: [], totalAmount: 0, remoteCreatedAt: '2025-01-12T09:00:00.000Z', remotePayloadChecksum: '1'.repeat(64), importedBy: 'maker', importedAt: '2025-01-12T09:01:00.000Z', version: 1, scope: baseScope }];
    const settlements: RetailSettlementReconciliation[] = [{ id: 'settlement-2', number: 'RSET-2', connectorId: connector.id, settlementReference: 'SET-2', periodFrom: '2025-01-01', periodTo: '2025-01-12', grossAmount: 500, feeAmount: 20, taxWithheldAmount: 10, netAmount: 470, localNetAmount: 480, varianceAmount: -10, orderIds: ['order-2'], remotePayloadChecksum: '2'.repeat(64), status: 'variance-review', requestedBy: 'maker', requestedAt: '2025-01-13T09:00:00.000Z', scope: baseScope, version: 1 }];
    const report = computeRetailMarketplaceProductionReadiness({ connectors: [connector], conformanceCases: [], syncRuns, orders, settlements, allocations: [], withholding: [], conflicts: [], fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ connectorCount: 1, productionReadyCount: 0, conformanceReadyCount: 0, syncPendingCount: 1, orderHandoffGapCount: 1, settlementVarianceExposure: 10, settlementReadyCount: 0, actionRequired: true });
    expect(report.rows[0]).toMatchObject({ providerState: 'external-certification', nextAction: 'complete-conformance', conformanceCoveragePct: 0, syncBlockerCount: 1, orderHandoffGapCount: 1, actionRequired: true });
  });
});

describe('computeRetailOndcProductionReadiness', () => {
  it('requires capability-specific ONDC conformance, push acknowledgements, order handoff, and settlement closure', () => {
    const connector: RetailCommerceConnector = { id: 'ondc-prod', code: 'ONDC-PROD', name: 'ONDC production', channel: 'ondc', environment: 'production', baseUrl: 'https://ondc.example', capabilities: ['catalog-push', 'inventory-push', 'order-pull', 'settlement-pull'], credentialStatus: 'configured', credentialFingerprint: 'fp-ondc', status: 'certified', createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 2 };
    const conformanceCases: RetailCommerceConformanceCase[] = connector.capabilities.map((capability, index) => ({ id: `ondc-case-${index}`, connectorId: connector.id, capability, suiteName: 'ONDC production conformance', suiteVersion: '1.0', scenario: `${capability} replay`, result: 'passed', evidenceReference: `ONDC-CONF-${index}`, resultChecksum: 'a'.repeat(64), preparedBy: 'maker', preparedAt: '2025-01-02T00:00:00.000Z', assessedBy: 'checker', assessedAt: '2025-01-03T00:00:00.000Z', scope: baseScope, version: 2 }));
    const syncRuns: RetailCommerceSyncRun[] = [
      { id: 'ondc-sync-catalog', number: 'SYNC-CATALOG', connectorId: connector.id, kind: 'catalog', status: 'completed', requestChecksum: 'b'.repeat(64), evidenceReference: 'ONDC-CATALOG-ACK', recordsRead: 2, recordsAccepted: 2, recordsRejected: 0, requestedBy: 'maker', requestedAt: '2025-01-10T09:00:00.000Z', completedAt: '2025-01-10T09:01:00.000Z', scope: baseScope, version: 2 },
      { id: 'ondc-sync-orders', number: 'SYNC-ORDERS', connectorId: connector.id, kind: 'orders', status: 'completed', requestChecksum: 'c'.repeat(64), evidenceReference: 'ONDC-ORDER-ACK', recordsRead: 1, recordsAccepted: 1, recordsRejected: 0, requestedBy: 'maker', requestedAt: '2025-01-10T09:02:00.000Z', completedAt: '2025-01-10T09:03:00.000Z', scope: baseScope, version: 2 },
      { id: 'ondc-sync-settlement', number: 'SYNC-SETTLEMENT', connectorId: connector.id, kind: 'settlement', status: 'completed', requestChecksum: '4'.repeat(64), evidenceReference: 'ONDC-SETTLEMENT-ACK', recordsRead: 1, recordsAccepted: 1, recordsRejected: 0, requestedBy: 'maker', requestedAt: '2025-01-11T09:00:00.000Z', completedAt: '2025-01-11T09:01:00.000Z', scope: baseScope, version: 2 },
    ];
    const pushBatches: RetailCommercePushBatch[] = [
      { id: 'ondc-push-catalog', number: 'PUSH-CATALOG', connectorId: connector.id, kind: 'catalog', records: [], payloadChecksum: 'd'.repeat(64), status: 'acknowledged', requestedBy: 'maker', requestedAt: '2025-01-10T09:00:00.000Z', decidedBy: 'checker', decidedAt: '2025-01-10T09:01:00.000Z', evidence: 'ONDC-CATALOG-ACK', scope: baseScope, version: 2 },
      { id: 'ondc-push-inventory', number: 'PUSH-INVENTORY', connectorId: connector.id, kind: 'inventory', records: [], payloadChecksum: 'e'.repeat(64), status: 'acknowledged', requestedBy: 'maker', requestedAt: '2025-01-10T09:00:00.000Z', decidedBy: 'checker', decidedAt: '2025-01-10T09:01:00.000Z', evidence: 'ONDC-INVENTORY-ACK', scope: baseScope, version: 2 },
    ];
    const orders: RetailCommerceOrder[] = [{ id: 'ondc-order', connectorId: connector.id, remoteOrderId: 'ONDC-REMOTE-1', orderNumber: 'ONDC-1', status: 'fulfilled', lines: [{ itemVariantId: 'variant-1', remoteSku: 'REMOTE-1', quantity: 1, unitPrice: 100, taxableValue: 100, gstRate: 5 }], totalAmount: 105, remoteCreatedAt: '2025-01-10T09:00:00.000Z', remotePayloadChecksum: 'f'.repeat(64), localSalesOrderId: 'so-1', salesOrderHandoffEvidence: 'SO-HANDOFF', salesOrderHandoffBy: 'checker', salesOrderHandoffAt: '2025-01-10T10:00:00.000Z', importedBy: 'maker', importedAt: '2025-01-10T09:02:00.000Z', scope: baseScope, version: 2 }];
    const settlements: RetailSettlementReconciliation[] = [{ id: 'ondc-settlement', number: 'ONDC-SET-1', connectorId: connector.id, settlementReference: 'SET-1', periodFrom: '2025-01-01', periodTo: '2025-01-10', grossAmount: 105, feeAmount: 5, taxWithheldAmount: 0, netAmount: 100, localNetAmount: 100, varianceAmount: 0, orderIds: ['ondc-order'], remotePayloadChecksum: '1'.repeat(64), status: 'matched', requestedBy: 'maker', requestedAt: '2025-01-11T09:00:00.000Z', allocationPackId: 'ondc-allocation', journalDraftId: 'ondc-journal', scope: baseScope, version: 2 }];
    const allocations: RetailSettlementAllocationPack[] = [{ id: 'ondc-allocation', settlementId: 'ondc-settlement', connectorId: connector.id, allocations: [{ orderId: 'ondc-order', grossAmount: 105, refundAmount: 0, feeAmount: 5, taxWithheldAmount: 0, netAmount: 100 }], allocatedGrossAmount: 105, allocatedRefundAmount: 0, allocatedFeeAmount: 5, allocatedTaxWithheldAmount: 0, allocatedNetAmount: 100, payloadChecksum: '2'.repeat(64), status: 'approved', requestedBy: 'maker', requestedAt: '2025-01-11T10:00:00.000Z', decidedBy: 'checker', decidedAt: '2025-01-11T11:00:00.000Z', decisionEvidence: 'Allocation checked', scope: baseScope, version: 2 }];
    const report = computeRetailOndcProductionReadiness({ connectors: [connector], conformanceCases, syncRuns, pushBatches, orders, settlements, allocations, withholding: [], conflicts: [], fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ connectorCount: 1, productionReadyCount: 1, conformanceReadyCount: 1, pushAcknowledgedCount: 2, orderHandoffGapCount: 0, settlementReadyCount: 1, externalCertificationGates: 0, actionRequired: false });
    expect(report.rows[0]).toMatchObject({ connectorCode: 'ONDC-PROD', capabilityEvidenceGapCount: 0, missingCapabilities: [], pushAcknowledgementGapCount: 0, providerState: 'ready', nextAction: 'ready' });
  });

  it('keeps incomplete ONDC capability scenarios and settlement evidence explicitly blocked', () => {
    const connector: RetailCommerceConnector = { id: 'ondc-gated', code: 'ONDC-GATED', name: 'ONDC gated', channel: 'ondc', environment: 'production', baseUrl: 'https://ondc.example', capabilities: ['catalog-push', 'inventory-push', 'order-pull', 'settlement-pull'], credentialStatus: 'configured', credentialFingerprint: 'fp-ondc', status: 'configured', createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', scope: baseScope, version: 1 };
    const cases: RetailCommerceConformanceCase[] = [{ id: 'ondc-gated-case', connectorId: connector.id, suiteName: 'ONDC', suiteVersion: '1.0', scenario: 'order-pull replay', result: 'passed', evidenceReference: 'ORDER-ONLY', resultChecksum: '3'.repeat(64), preparedBy: 'maker', preparedAt: '2025-01-02T00:00:00.000Z', assessedBy: 'checker', assessedAt: '2025-01-03T00:00:00.000Z', scope: baseScope, version: 2 }];
    const report = computeRetailOndcProductionReadiness({ connectors: [connector], conformanceCases: cases, syncRuns: [], pushBatches: [], orders: [], settlements: [], allocations: [], withholding: [], conflicts: [], fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ connectorCount: 1, productionReadyCount: 0, conformanceReadyCount: 0, externalCertificationGates: 1, actionRequired: true });
    expect(report.rows[0]).toMatchObject({ providerState: 'external-certification', capabilityEvidenceGapCount: 4, nextAction: 'complete-conformance' });
  });
});

describe('computeRetailReportDeliveryReadiness', () => {
  it('separates approved schedules, consent coverage, provider acknowledgements, and failed attempts', () => {
    const plans: RetailReportDeliveryPlan[] = [
      { scope: baseScope, id: 'plan-ready', number: 'RPTD-25-26-00001', reportPackId: 'finance-control', channel: 'email', frequency: 'daily', timeZone: 'Asia/Kolkata', windowStart: '10:00', windowEnd: '12:00', effectiveFrom: '2025-01-01', recipients: [{ id: 'user-1', kind: 'internal-user', label: 'Finance owner', destination: 'owner@example.in' }], notes: 'Finance control', status: 'approved', createdBy: 'maker', createdAt: '2025-01-01T08:00:00.000Z', approvedBy: 'checker', approvedAt: '2025-01-01T09:00:00.000Z', version: 2 },
      { scope: baseScope, id: 'plan-gated', number: 'RPTD-25-26-00002', reportPackId: 'executive-pulse', channel: 'whatsapp', frequency: 'weekly', runDay: 2, timeZone: 'Asia/Kolkata', windowStart: '10:00', windowEnd: '12:00', effectiveFrom: '2025-01-01', recipients: [{ id: 'contact-1', kind: 'customer-contact', label: 'Owner', destination: '+919876543210' }], notes: 'Customer pulse', status: 'approved', createdBy: 'maker', createdAt: '2025-01-01T08:00:00.000Z', approvedBy: 'checker', approvedAt: '2025-01-01T09:00:00.000Z', version: 2 },
      { scope: baseScope, id: 'plan-external', number: 'RPTD-25-26-00004', reportPackId: 'operations-control', channel: 'email', frequency: 'weekly', runDay: 3, timeZone: 'Asia/Kolkata', windowStart: '10:00', windowEnd: '12:00', effectiveFrom: '2025-01-01', recipients: [{ id: 'user-3', kind: 'internal-user', label: 'Operations', destination: 'ops@example.in' }], notes: 'Operations pulse', status: 'approved', createdBy: 'maker', createdAt: '2025-01-01T08:00:00.000Z', approvedBy: 'checker', approvedAt: '2025-01-01T09:00:00.000Z', version: 2 },
    ];
    const attempts: RetailReportDeliveryAttempt[] = [
      { scope: baseScope, id: 'attempt-ready', number: 'RPTX-25-26-00001', planId: 'plan-ready', reportPackId: 'finance-control', channel: 'email', slotKey: '2025-01-10', idempotencyKey: 'report-delivery:plan-ready:2025-01-10', recipientCount: 1, payloadChecksum: 'a'.repeat(64), status: 'acknowledged', preparedBy: 'scheduler', preparedAt: '2025-01-10T05:00:00.000Z', handedOffAt: '2025-01-10T05:05:00.000Z', acknowledgedAt: '2025-01-10T05:06:00.000Z', externalReference: 'MAIL-ACK-1', version: 3 },
      { scope: baseScope, id: 'attempt-failed', number: 'RPTX-25-26-00002', planId: 'plan-gated', reportPackId: 'executive-pulse', channel: 'whatsapp', slotKey: '2025-01-09-w4', idempotencyKey: 'report-delivery:plan-gated:2025-01-09-w4', recipientCount: 1, payloadChecksum: 'b'.repeat(64), status: 'failed', preparedBy: 'scheduler', preparedAt: '2025-01-09T05:00:00.000Z', errorMessage: 'Provider credentials are not certified.', version: 2 },
    ];
    const report = computeRetailReportDeliveryReadiness({ plans, attempts, fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ planCount: 3, approvedPlanCount: 3, recipientCount: 3, consentGapCount: 1, attemptCount: 2, acknowledgedAttemptCount: 1, failedAttemptCount: 1, externalCertificationGates: 1, actionRequired: true });
    expect(report.rows.find(({ planId }) => planId === 'plan-ready')).toMatchObject({ providerState: 'ready', acknowledgedAttemptCount: 1, nextAction: 'ready', actionRequired: false });
    expect(report.rows.find(({ planId }) => planId === 'plan-gated')).toMatchObject({ providerState: 'internal-blocked', consentGapCount: 1, failedAttemptCount: 1, nextAction: 'record-consent', actionRequired: true });
  });

  it('keeps draft schedules actionable and excludes attempts outside the reporting period', () => {
    const plan: RetailReportDeliveryPlan = { scope: baseScope, id: 'plan-draft', number: 'RPTD-25-26-00003', reportPackId: 'operations-control', channel: 'email', frequency: 'monthly', runDay: 1, timeZone: 'Asia/Kolkata', windowStart: '09:00', windowEnd: '10:00', effectiveFrom: '2025-02-01', recipients: [{ id: 'user-2', kind: 'internal-user', label: 'Ops', destination: 'ops@example.in' }], notes: 'Operations control', status: 'draft', createdBy: 'maker', createdAt: '2025-02-01T08:00:00.000Z', version: 1 };
    const outsideAttempt: RetailReportDeliveryAttempt = { scope: baseScope, id: 'attempt-old', number: 'RPTX-24-25-00001', planId: plan.id, reportPackId: plan.reportPackId, channel: plan.channel, slotKey: '2024-12-01-d1', idempotencyKey: 'old', recipientCount: 1, payloadChecksum: 'c'.repeat(64), status: 'acknowledged', preparedBy: 'scheduler', preparedAt: '2024-12-01T05:00:00.000Z', acknowledgedAt: '2024-12-01T05:01:00.000Z', externalReference: 'OLD-ACK', version: 2 };
    const report = computeRetailReportDeliveryReadiness({ plans: [plan], attempts: [outsideAttempt], fromDate: '2025-02-01', toDate: '2025-02-28' });
    expect(report).toMatchObject({ planCount: 1, draftPlanCount: 1, attemptCount: 0, actionRequired: true });
    expect(report.rows[0]).toMatchObject({ providerState: 'internal-blocked', nextAction: 'approve-plan', acknowledgedAttemptCount: 0 });
  });

  it('binds delivery plans to a certified messaging connector when provider evidence is supplied', () => {
    const provider: ProviderConnector = { id: 'messaging-email', code: 'MSG-EMAIL', name: 'Email delivery rail', providerLegalName: 'Example Messaging', domain: 'messaging', environment: 'production', baseUrl: 'https://messaging.example', statusPathTemplate: '/v1/status/{reference}', capabilities: ['email-delivery'], specificationVersion: '1.0', credentialStatus: 'configured', credentialFingerprint: 'fp-msg', conformanceStatus: 'production-approved', active: true, createdBy: 'maker', createdAt: '2025-01-01T00:00:00.000Z', approvedBy: 'checker', approvedAt: '2025-01-02T00:00:00.000Z', scope: baseScope, version: 2 };
    const plan: RetailReportDeliveryPlan = { scope: baseScope, id: 'plan-provider-ready', number: 'RPTD-25-26-00010', reportPackId: 'finance-control', channel: 'email', providerConnectorId: provider.id, frequency: 'daily', timeZone: 'Asia/Kolkata', windowStart: '10:00', windowEnd: '12:00', effectiveFrom: '2025-01-01', recipients: [{ id: 'user-1', kind: 'internal-user', label: 'Finance owner', destination: 'owner@example.in' }], notes: 'Provider-bound finance control', status: 'approved', createdBy: 'maker', createdAt: '2025-01-01T08:00:00.000Z', approvedBy: 'checker', approvedAt: '2025-01-01T09:00:00.000Z', version: 2 };
    const attempt: RetailReportDeliveryAttempt = { scope: baseScope, id: 'attempt-provider-ready', number: 'RPTX-25-26-00010', planId: plan.id, reportPackId: plan.reportPackId, channel: plan.channel, slotKey: '2025-01-10', idempotencyKey: `report-delivery:${plan.id}:2025-01-10`, recipientCount: 1, payloadChecksum: 'a'.repeat(64), status: 'acknowledged', preparedBy: 'scheduler', preparedAt: '2025-01-10T05:00:00.000Z', handedOffAt: '2025-01-10T05:05:00.000Z', acknowledgedAt: '2025-01-10T05:06:00.000Z', externalReference: 'MAIL-ACK-10', responseChecksum: 'b'.repeat(64), version: 3 };
    const conformance: ProviderConformanceCase[] = [{ id: 'msg-case', connectorId: provider.id, capability: 'email-delivery', deliveryChannel: 'email', suiteName: 'Messaging production', suiteVersion: '1.0', scenario: 'email-delivery replay', environment: 'production', result: 'passed', evidenceReference: 'MSG-EMAIL-CASE', resultChecksum: 'c'.repeat(64), preparedBy: 'maker', preparedAt: '2025-01-02T00:00:00.000Z', assessedBy: 'checker', assessedAt: '2025-01-03T00:00:00.000Z', scope: baseScope, version: 2 }];
    const report = computeRetailReportDeliveryReadiness({ plans: [plan], attempts: [attempt], providerConnectors: [provider], providerConformanceCases: conformance, fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ planCount: 1, providerBoundPlanCount: 1, providerReadyPlanCount: 1, externalCertificationGates: 0, actionRequired: false });
    expect(report.rows[0]).toMatchObject({ providerState: 'ready', providerCode: 'MSG-EMAIL', nextAction: 'ready', actionRequired: false });
  });

  it('blocks provider-bound plans without a connector or channel-specific conformance evidence', () => {
    const plan: RetailReportDeliveryPlan = { scope: baseScope, id: 'plan-provider-gated', number: 'RPTD-25-26-00011', reportPackId: 'executive-pulse', channel: 'whatsapp', frequency: 'weekly', runDay: 2, timeZone: 'Asia/Kolkata', windowStart: '10:00', windowEnd: '12:00', effectiveFrom: '2025-01-01', recipients: [{ id: 'user-2', kind: 'internal-user', label: 'Owner', destination: 'owner@example.in' }], notes: 'Provider-bound WhatsApp', status: 'approved', createdBy: 'maker', createdAt: '2025-01-01T08:00:00.000Z', approvedBy: 'checker', approvedAt: '2025-01-01T09:00:00.000Z', version: 2 };
    const report = computeRetailReportDeliveryReadiness({ plans: [plan], attempts: [], providerConnectors: [], providerConformanceCases: [], fromDate: '2025-01-01', toDate: '2025-01-31' });
    expect(report).toMatchObject({ planCount: 1, providerBoundPlanCount: 0, providerReadyPlanCount: 0, unboundPlanCount: 1, externalCertificationGates: 1, actionRequired: true });
    expect(report.rows[0]).toMatchObject({ providerState: 'external-certification', nextAction: 'bind-provider', actionRequired: true });
  });
});

describe('computeCommissionPayout', () => {
  it('separates pending, approved, paid and void commission exposure by salesperson', () => {
    const report = computeCommissionPayout({
      fromDate: '2025-01-01',
      toDate: '2025-01-31',
      allCommissions: [
        { id: 'c-1', saleId: 'sale-1', salespersonUserId: 'seller-a', basisAmount: 1000, ratePercent: 5, commissionAmount: 50, status: 'paid', createdAt: '2025-01-15T10:00:00.000Z', payoutReference: 'PAY-1', scope: baseScope, version: 1 },
        { id: 'c-2', saleId: 'sale-2', salespersonUserId: 'seller-a', basisAmount: 2000, ratePercent: 5, commissionAmount: 100, status: 'approved', createdAt: '2025-01-16T10:00:00.000Z', scope: baseScope, version: 2 },
        { id: 'c-3', saleId: 'sale-3', salespersonUserId: 'seller-a', basisAmount: 500, ratePercent: 5, commissionAmount: 25, status: 'void', createdAt: '2025-01-17T10:00:00.000Z', scope: baseScope, version: 2 },
      ],
    });
    expect(report).toMatchObject({ totalCommission: 150, paidAmount: 50, approvedAmount: 100, voidAmount: 25 });
    expect(report.rows[0]).toMatchObject({ salespersonUserId: 'seller-a', commissionCount: 3, saleCount: 3, basisAmount: 3000, payoutReadinessPct: 33.33 });
  });
});

describe('computeCreditUtilization', () => {
  it('shows exposure, overdue risk, available headroom, and credit-hold state per approved customer limit', () => {
    const controls: CreditLimitControl[] = [
      { id: 'limit-a', number: 'CRL-A', accountId: 'account-a', currency: 'INR', creditLimit: 1_000, warningThresholdPercent: 80, graceDays: 7, blockNewOrders: true, riskGrade: 'A', rationale: 'Retail account', status: 'approved', requestedBy: 'maker', requestedAt: '2025-01-01T00:00:00.000Z', decidedBy: 'checker', decidedAt: '2025-01-01T00:00:00.000Z', version: 2, scope: baseScope },
      { id: 'limit-b', number: 'CRL-B', accountId: 'account-b', currency: 'INR', creditLimit: 1_000, warningThresholdPercent: 80, graceDays: 7, blockNewOrders: true, riskGrade: 'C', rationale: 'Retail account', status: 'approved', requestedBy: 'maker', requestedAt: '2025-01-01T00:00:00.000Z', decidedBy: 'checker', decidedAt: '2025-01-01T00:00:00.000Z', version: 2, scope: baseScope },
    ];
    const receivables: Receivable[] = [
      { id: 'recv-a-1', invoiceId: 'inv-a-1', accountId: 'account-a', invoiceNumber: 'INV-A-1', invoiceDate: '2025-01-01', dueDate: '2024-12-20', originalAmount: 700, adjustmentAmount: 0, paidAmount: 0, outstandingAmount: 700, status: 'overdue', scope: baseScope, version: 1 },
      { id: 'recv-a-2', invoiceId: 'inv-a-2', accountId: 'account-a', invoiceNumber: 'INV-A-2', invoiceDate: '2025-01-10', dueDate: '2025-02-10', originalAmount: 100, adjustmentAmount: 0, paidAmount: 0, outstandingAmount: 100, status: 'current', scope: baseScope, version: 1 },
      { id: 'recv-b-1', invoiceId: 'inv-b-1', accountId: 'account-b', invoiceNumber: 'INV-B-1', invoiceDate: '2025-01-01', dueDate: '2025-01-05', originalAmount: 1_200, adjustmentAmount: 0, paidAmount: 0, outstandingAmount: 1_200, status: 'overdue', scope: baseScope, version: 1 },
    ];
    const report = computeCreditUtilization({ controls, receivables, accountNames: { 'account-a': 'Alpha Retail', 'account-b': 'Beta Retail' }, asOfDate: '2025-01-31' });
    expect(report).toMatchObject({ approvedLimitTotal: 2_000, exposureTotal: 2_000, availableHeadroomTotal: 200, holdCount: 1 });
    expect(report.rows[0]).toMatchObject({ accountId: 'account-b', accountName: 'Beta Retail', exposure: 1_200, utilizationPct: 120, status: 'credit-hold', overdueAmount: 1_200 });
    expect(report.rows[1]).toMatchObject({ accountId: 'account-a', exposure: 800, utilizationPct: 80, availableHeadroom: 200, status: 'warning', overdueAmount: 700, openReceivableCount: 2 });
  });
});

describe('computeExpiryRisk and computeRackReadiness', () => {
  it('uses batch/bin evidence to expose expiry risk and rack capacity without fabricating stock', () => {
    const items: InventoryItem[] = [{ id: 'item-1', productId: 'prod-1', code: 'RICE', name: 'Basmati Rice', baseUomId: 'uom-kg', tracking: 'batch', valuationMethod: 'fifo', active: true, scope: baseScope, version: 1 }];
    const variants: ItemVariant[] = [{ id: 'var-1', itemId: 'item-1', sku: 'RICE-5KG', name: 'Basmati Rice 5kg', attributes: {}, active: true, scope: baseScope, version: 1 }];
    const warehouses: Warehouse[] = [{ id: 'wh-1', code: 'WH-MUM', name: 'Mumbai Store', stateCode: '27', stockLocationId: 'loc-1', active: true, scope: baseScope, version: 1 }];
    const zones: WarehouseZone[] = [{ id: 'zone-1', warehouseId: 'wh-1', code: 'A', name: 'Rack A', purpose: 'storage', active: true, scope: baseScope, version: 1 }];
    const bins: StorageBin[] = [{ id: 'bin-1', zoneId: 'zone-1', code: 'A-01', name: 'Rack A / Shelf 01', capacity: 100, pickSequence: 1, status: 'available', scope: baseScope, version: 1 }, { id: 'bin-2', zoneId: 'zone-1', code: 'A-02', name: 'Rack A / Shelf 02', capacity: 20, pickSequence: 2, status: 'blocked', scope: baseScope, version: 1 }];
    const batches: InventoryBatch[] = [{ id: 'batch-1', itemVariantId: 'var-1', batchNumber: 'B-001', manufacturedAt: '2025-01-01', expiresAt: '2025-02-05', status: 'released', scope: baseScope, version: 1 }, { id: 'batch-2', itemVariantId: 'var-1', batchNumber: 'B-002', expiresAt: '2025-03-31', status: 'released', scope: baseScope, version: 1 }];
    const balances: BinBalance[] = [{ id: 'balance-1', binId: 'bin-1', itemVariantId: 'var-1', batchId: 'batch-1', quantity: 40, reserved: 5, picked: 0, available: 35, unitCost: 60, inventoryValue: 2_400, scope: baseScope, version: 1 }, { id: 'balance-2', binId: 'bin-2', itemVariantId: 'var-1', batchId: 'batch-2', quantity: 25, reserved: 0, picked: 0, available: 25, unitCost: 65, inventoryValue: 1_625, scope: baseScope, version: 1 }];
    const expiry = computeExpiryRisk({ items, variants, batches, balances, warehouses, zones, bins, asOfDate: '2025-01-31', horizonDays: 30 });
    expect(expiry).toMatchObject({ expiredQuantity: 0, atRiskQuantity: 40, atRiskValue: 2_400, nearExpiryBatchCount: 1 });
    expect(expiry.rows[0]).toMatchObject({ batchNumber: 'B-001', status: 'critical', available: 35, daysToExpiry: 5, warehouseName: 'Mumbai Store', binCode: 'A-01' });
    const racks = computeRackReadiness({ items, variants, warehouses, zones, bins, balances });
    expect(racks).toMatchObject({ totalBins: 2, blockedBins: 1, overCapacityBins: 1, totalInventoryValue: 4_025 });
    expect(racks.rows.find(({ binCode }) => binCode === 'A-02')).toMatchObject({ readiness: 'blocked', utilizationPct: 125, availableCapacity: 0 });
  });
});

describe('computeCategorySales', () => {
  it('groups revenue by category', () => {
    const report = computeCategorySales({
      allSales,
      fromDate: '2025-01-15',
      toDate: '2025-01-15',
      merchandisingProfiles,
      categories,
      variantItemMap: { 'var-1': 'item-1' },
    });
    expect(report.rows).toHaveLength(1);
    const row = report.rows[0]!;
    expect(row.categoryName).toBe('Electronics');
    expect(row.lineCount).toBe(3);
    expect(row.revenue).toBeCloseTo(4130, 1);
  });

  it('uses Uncategorised bucket for unmapped variants', () => {
    const report = computeCategorySales({
      allSales,
      fromDate: '2025-01-15',
      toDate: '2025-01-15',
      merchandisingProfiles: [],
      categories,
      variantItemMap: {},
    });
    const uncatRow = report.rows.find((r) => r.categoryName === 'Uncategorised');
    expect(uncatRow).toBeDefined();
    expect(uncatRow?.lineCount).toBe(3);
  });

  it('reconciles multi-unit line COGS exactly once across category and SKU reporting', () => {
    const multiUnitSale: RetailSale = {
      ...sale1,
      id: 'sale-multi-unit-cost',
      number: 'sale-multi-unit-cost',
      costTotal: 500,
      lines: [{
        ...sale1.lines[0]!,
        id: 'line-multi-unit-cost',
        quantity: 4,
        lineTotal: 1_180,
        taxableValue: 1_000,
        lineCostTotal: 500,
      }],
    };
    const category = computeCategorySales({
      allSales: [multiUnitSale],
      fromDate: '2025-01-15',
      toDate: '2025-01-15',
      merchandisingProfiles,
      categories,
      variantItemMap: { 'var-1': 'item-1' },
    });
    const sku = computeSkuMarginReport({
      allSales: [multiUnitSale],
      fromDate: '2025-01-15',
      toDate: '2025-01-15',
      variants,
      binBalances,
    });

    expect(category.rows[0]?.costTotal).toBe(multiUnitSale.costTotal);
    expect(sku.rows[0]?.costTotal).toBe(multiUnitSale.costTotal);
    expect(category.rows[0]?.grossProfit).toBe(680);
    expect(sku.rows[0]?.grossProfit).toBe(680);
  });
});

describe('computeRetailMarketplacePayoutReconciliation', () => {
  it('ties marketplace commission, payout, returns and RTO evidence to every settlement order', () => {
    const settlement: RetailSettlementReconciliation = {
      id: 'settlement-payout-1', number: 'RSET-001', connectorId: 'marketplace-1', settlementReference: 'PAYOUT-001',
      periodFrom: '2025-01-01', periodTo: '2025-01-31', grossAmount: 420, refundAmount: 35, feeAmount: 20,
      taxWithheldAmount: 0, netAmount: 365, localNetAmount: 365, varianceAmount: 0, orderIds: ['order-fulfilled', 'order-rto', 'order-return', 'order-open'],
      remotePayloadChecksum: 'a'.repeat(64), status: 'matched', requestedBy: 'maker', requestedAt: '2025-01-31T10:00:00.000Z', scope: baseScope, version: 1,
    };
    const orders: RetailCommerceOrder[] = [
      { id: 'order-fulfilled', connectorId: 'marketplace-1', remoteOrderId: 'remote-fulfilled', orderNumber: 'MKT-FULFILLED', status: 'fulfilled', lines: [], totalAmount: 105, remoteCreatedAt: '2025-01-10T10:00:00.000Z', remotePayloadChecksum: 'a'.repeat(64), importedBy: 'maker', importedAt: '2025-01-10T10:00:00.000Z', statusUpdatedBy: 'checker', statusUpdatedAt: '2025-01-11T10:00:00.000Z', statusEvidence: 'Carrier delivery proof', scope: baseScope, version: 2 },
      { id: 'order-rto', connectorId: 'marketplace-1', remoteOrderId: 'remote-rto', orderNumber: 'MKT-RTO', status: 'rto', lines: [], totalAmount: 105, remoteCreatedAt: '2025-01-12T10:00:00.000Z', remotePayloadChecksum: 'a'.repeat(64), importedBy: 'maker', importedAt: '2025-01-12T10:00:00.000Z', statusUpdatedBy: 'checker', statusUpdatedAt: '2025-01-13T10:00:00.000Z', statusEvidence: 'Carrier RTO scan', rtoReference: 'RTO-001', retailReturnId: 'return-rto', creditNoteReconciliationId: 'credit-rto', inventoryEvidenceReference: 'inventory-rto', scope: baseScope, version: 3 },
      { id: 'order-return', connectorId: 'marketplace-1', remoteOrderId: 'remote-return', orderNumber: 'MKT-RETURN', status: 'returned', lines: [], totalAmount: 105, remoteCreatedAt: '2025-01-14T10:00:00.000Z', remotePayloadChecksum: 'a'.repeat(64), importedBy: 'maker', importedAt: '2025-01-14T10:00:00.000Z', statusUpdatedBy: 'checker', statusUpdatedAt: '2025-01-15T10:00:00.000Z', statusEvidence: 'Marketplace return callback', retailReturnId: 'return-1', creditNoteReconciliationId: 'credit-1', scope: baseScope, version: 3 },
      { id: 'order-open', connectorId: 'marketplace-1', remoteOrderId: 'remote-open', orderNumber: 'MKT-OPEN', status: 'confirmed', lines: [], totalAmount: 105, remoteCreatedAt: '2025-01-16T10:00:00.000Z', remotePayloadChecksum: 'a'.repeat(64), importedBy: 'maker', importedAt: '2025-01-16T10:00:00.000Z', scope: baseScope, version: 1 },
    ];
    const allocation: RetailSettlementAllocationPack = {
      id: 'allocation-1', settlementId: settlement.id, connectorId: settlement.connectorId,
      allocations: [
        { orderId: 'order-fulfilled', grossAmount: 105, refundAmount: 0, feeAmount: 5, taxWithheldAmount: 0, netAmount: 100 },
        { orderId: 'order-rto', grossAmount: 105, refundAmount: 20, feeAmount: 5, taxWithheldAmount: 0, netAmount: 80 },
        { orderId: 'order-return', grossAmount: 105, refundAmount: 15, feeAmount: 5, taxWithheldAmount: 0, netAmount: 85 },
        { orderId: 'order-open', grossAmount: 105, refundAmount: 0, feeAmount: 5, taxWithheldAmount: 0, netAmount: 100 },
      ],
      allocatedGrossAmount: 420, allocatedRefundAmount: 35, allocatedFeeAmount: 20, allocatedTaxWithheldAmount: 0, allocatedNetAmount: 365,
      payloadChecksum: 'b'.repeat(64), status: 'approved', requestedBy: 'maker', requestedAt: '2025-01-31T10:01:00.000Z', decidedBy: 'checker', decidedAt: '2025-01-31T10:02:00.000Z', decisionEvidence: 'Allocation independently checked', scope: baseScope, version: 2,
    };
    const report = computeRetailMarketplacePayoutReconciliation({ settlement, orders, allocation });
    expect(report).toMatchObject({
      settlementReference: 'PAYOUT-001', providerCommissionAmount: 20, rtoRefundAmount: 20, returnRefundAmount: 15,
      allocationCoveragePct: 100, status: 'needs-action',
      lifecycle: { fulfilled: 1, rto: 1, returned: 1, open: 1 },
      missingReturnEvidenceOrderNumbers: ['MKT-RETURN'], missingTerminalOrderNumbers: ['MKT-OPEN'],
    });
    expect(report.nextActions).toEqual(expect.arrayContaining([
      'Complete terminal status evidence for every linked marketplace order.',
      'Complete GST credit-note and inventory evidence for every returned or RTO order.',
    ]));
  });
});

describe('computeRetailStoreExecutionReadiness recovery depth', () => {
  it('detects stale queues, journal gaps, missing recovery evidence, and duplicate transaction keys', () => {
    const queueItem = (id: string, overrides: Partial<RetailOfflineSaleQueueItem> = {}): RetailOfflineSaleQueueItem => ({
      id,
      transactionKey: 'TX-DUPLICATE',
      input: {} as RetailOfflineSaleQueueItem['input'],
      payloadChecksum: 'a'.repeat(64),
      status: 'queued',
      queuedBy: 'cashier-1',
      queuedAt: '2025-01-01T00:00:00.000Z',
      attempts: 0,
      scope: baseScope,
      version: 1,
      ...overrides,
    });
    const receipts: RetailOfflineSyncReceipt[] = [{
      id: 'receipt-1', queueItemId: 'offline-1', transactionKey: 'TX-DUPLICATE', status: 'requeued', actorId: 'supervisor-1', occurredAt: '2025-01-01T01:00:00.000Z', attempt: 1, queueVersion: 2, payloadChecksum: 'a'.repeat(64),
    }];
    const report = computeRetailStoreExecutionReadiness({
      offlineQueue: [queueItem('offline-1', { lastSyncMode: 'recovery' }), queueItem('offline-2')],
      syncReceipts: receipts,
      deviceEvidence: [],
      now: '2025-01-01T02:00:00.000Z',
      staleAfterMs: 15 * 60 * 1000,
    });
    expect(report.offline).toMatchObject({ staleQueueCount: 2, journalGapCount: 1, recoveryEvidenceGapCount: 1, duplicateTransactionKeyCount: 1, actionRequired: true });
    expect(report.nextActions).toEqual(expect.arrayContaining([
      'Run a recovery pass for stale queued sales and attach the outage reference.',
      'Rebuild the local recovery journal from a verified workspace backup before allowing closure.',
      'Attach independent recovery evidence to every recovery transition before retrying.',
      'Stop duplicate transaction keys before synchronization; investigate possible replay.',
    ]));
  });
});
