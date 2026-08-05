/**
 * RetailReportsWorkbench.tsx
 *
 * Phase R6 – Retail Reporting & Analytics Workbench
 *
 * Delivers governed, read-only report views computed entirely from the
 * RevenueOpsSnapshot client-side:
 *   1. X-Report  – mid-shift snapshot
 *   2. Z-Report  – shift-close reconciliation
 *   3. Counter Daily Summary
 *   4. Category Sales Report
 *   5. Tender Breakdown Report
 *   6. GST Summary Report
 *   7. SKU Margin & Sell-Through Report
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  BarChart3, ClipboardCopy, FileDown, RefreshCw,
  ShieldCheck, TrendingUp, ReceiptText, Tag, Banknote,
  FileText, Award, Megaphone, Users,
  Warehouse, GitBranch, Store, Mail,
} from 'lucide-react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { OperationalHealthSnapshot } from '../shared/kernel-contracts';
import { SystemCertificationPanel } from './SystemCertificationPanel';
import {
  computeXReport,
  computeZReport,
  computeCounterSummary,
  computeTenderBreakdown,
  computeGstSummary,
  computeSkuMarginReport,
  computeCategorySales,
  type XReport,
  type ZReport,
  type CounterSummaryReport,
  type TenderBreakdownReport,
  type GstSummaryReport,
  type SkuMarginReport,
  type CategorySalesReport,
  computeCampaignUsage,
  type CampaignUsageReport,
  computeCustomerVisitConversion,
  type CustomerVisitConversionReport,
  computeExchangeCreditNoteReadiness,
  type ExchangeCreditNoteReadinessReport,
  computeRetailChannelSettlementReadiness,
  type RetailChannelSettlementReadinessReport,
  computeRetailPayoutReadiness,
  type RetailPayoutReadinessReport,
  computeRetailPayoutRailReadiness,
  type RetailPayoutRailReadinessReport,
  computeRetailTenderSettlementReconciliation,
  computeRetailElectronicPayoutRailEvidence,
  type RetailElectronicPayoutRailEvidenceReport,
  computeRetailOcrReadiness,
  type RetailOcrReadinessReport,
  computeRetailOcrAdapterReadiness,
  type RetailOcrAdapterReadinessReport,
  computeRetailOcrDocumentCertification,
  type RetailOcrDocumentCertificationReport,
  computeRetailInterBranchReadiness,
  type RetailInterBranchReadinessReport,
  computeRetailProviderDeviceReadiness,
  type RetailProviderDeviceReadinessReport,
  computeRetailStoreExecutionReadiness,
  type RetailStoreExecutionReadinessReport,
  computeRetailProductionExitGate,
  type RetailProductionExitGateReport,
  computeRetailRolloutReadiness,
  type RetailRolloutReadinessReport,
  computeRetailMarketplaceProductionReadiness,
  type RetailMarketplaceProductionReadinessReport,
  computeRetailOndcProductionReadiness,
  type RetailOndcProductionReadinessReport,
  computeRetailReportDeliveryReadiness,
  type RetailReportDeliveryReadinessReport,
  computeCommissionPayout,
  type CommissionPayoutReport,
  computeCreditUtilization,
  type CreditUtilizationReport,
  computeExpiryRisk,
  type ExpiryRiskReport,
  computeRackReadiness,
  type RackReadinessReport,
} from '../domain/retail-reports';
import { buildRetailProviderReadiness } from '../domain/retail-provider-readiness';
import { computeRetailCertificationFreshness, type RetailCertificationFreshnessReport } from '../domain/retail-certification-freshness';
import type { RetailReportDeliveryAttempt, RetailReportDeliveryPlan } from '../shared/report-delivery-contracts';
import './RetailReportsWorkbench.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toFixed(2)}%`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

function copyJson(data: unknown) {
  void navigator.clipboard.writeText(JSON.stringify(data, null, 2));
}

function marginPillClass(pct: number): string {
  if (pct >= 30) return 'margin-pill--high';
  if (pct >= 15) return 'margin-pill--medium';
  return 'margin-pill--low';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RetailReportsWorkbenchProps {
  revenue: RevenueOpsSnapshot;
  reportDeliveryPlans?: RetailReportDeliveryPlan[];
  reportDeliveryAttempts?: RetailReportDeliveryAttempt[];
  operationalHealth?: OperationalHealthSnapshot | null;
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'x-report',  label: 'X-Report',         icon: <RefreshCw size={13} /> },
  { id: 'z-report',  label: 'Z-Report',          icon: <ShieldCheck size={13} /> },
  { id: 'counter',   label: 'Counter Summary',   icon: <ReceiptText size={13} /> },
  { id: 'category',  label: 'Category Sales',    icon: <Tag size={13} /> },
  { id: 'tender',    label: 'Tender Breakdown',  icon: <Banknote size={13} /> },
  { id: 'gst',       label: 'GST Summary',       icon: <FileText size={13} /> },
  { id: 'sku',       label: 'SKU Margin',        icon: <TrendingUp size={13} /> },
  { id: 'campaigns', label: 'Campaign Usage',    icon: <Megaphone size={13} /> },
  { id: 'visits',    label: 'Visit Conversion',   icon: <Users size={13} /> },
  { id: 'returns',   label: 'Returns & Credit Notes', icon: <FileText size={13} /> },
  { id: 'ocr',       label: 'OCR Intake',          icon: <FileText size={13} /> },
  { id: 'ocr-adapter', label: 'OCR Adapter Gate', icon: <ShieldCheck size={13} /> },
  { id: 'inter-branch', label: 'Inter-Branch',       icon: <GitBranch size={13} /> },
  { id: 'devices',    label: 'Rails & Devices',   icon: <ShieldCheck size={13} /> },
  { id: 'marketplace-gate', label: 'Marketplace Gate', icon: <Store size={13} /> },
  { id: 'ondc-gate', label: 'ONDC Gate', icon: <Store size={13} /> },
  { id: 'scheduled-delivery', label: 'Scheduled Delivery', icon: <Mail size={13} /> },
  { id: 'settlements', label: 'Channel Settlements', icon: <Banknote size={13} /> },
  { id: 'payouts',   label: 'Team Payouts',      icon: <Award size={13} /> },
  { id: 'payout-rails', label: 'Payout Rails', icon: <Banknote size={13} /> },
  { id: 'credit',    label: 'Credit Utilization', icon: <ShieldCheck size={13} /> },
  { id: 'expiry-racks', label: 'Expiry & Racks',   icon: <Warehouse size={13} /> },
  { id: 'system-audit', label: 'Go-live checklist', icon: <ShieldCheck size={13} /> },
] as const;

type TabId = typeof TABS[number]['id'];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function RetailReportsWorkbench({ revenue, reportDeliveryPlans = [], reportDeliveryAttempts = [], operationalHealth = null }: RetailReportsWorkbenchProps): ReactNode {
  const [activeTab, setActiveTab] = useState<TabId>('x-report');
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(today());
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [selectedCounterId, setSelectedCounterId] = useState('');
  const [copiedNotice, setCopiedNotice] = useState('');

  function notifyCopy(label: string) {
    setCopiedNotice(`${label} copied to clipboard.`);
    setTimeout(() => setCopiedNotice(''), 3000);
  }

  // Resolve helper collections from snapshot
  const variants = useMemo(
    () => revenue.itemVariants ?? [],
    [revenue],
  );
  const binBalances = useMemo(
    () => revenue.binBalances ?? [],
    [revenue],
  );
  const variantItemMap = useMemo(() => {
    const map: Record<string, string> = {};
    variants.forEach((v) => { map[v.id] = v.itemId; });
    return map;
  }, [variants]);

  const completedShifts = useMemo(
    () => revenue.retailCashierShifts,
    [revenue.retailCashierShifts],
  );

  const counters = useMemo(
    () => revenue.retailCounters,
    [revenue.retailCounters],
  );

  const activeShiftId = selectedShiftId || completedShifts[0]?.id || '';
  const activeShift = completedShifts.find((s) => s.id === activeShiftId);
  const activeCounterId = selectedCounterId || counters[0]?.id || '';
  const activeCounter = counters.find((c) => c.id === activeCounterId);

  // ── X-Report ──────────────────────────────────────────────────────────────
  const xReport = useMemo<XReport | null>(() => {
    if (!activeShift) return null;
    return computeXReport({ shift: activeShift, allSales: revenue.retailSales });
  }, [activeShift, revenue.retailSales]);

  // ── Z-Report ──────────────────────────────────────────────────────────────
  const zReport = useMemo<ZReport | null>(() => {
    if (!activeShift) return null;
    return computeZReport({ shift: activeShift, allSales: revenue.retailSales });
  }, [activeShift, revenue.retailSales]);

  // ── Counter Summary ───────────────────────────────────────────────────────
  const counterReport = useMemo<CounterSummaryReport | null>(() => {
    if (!activeCounter) return null;
    return computeCounterSummary({
      counterId: activeCounter.id,
      counterName: activeCounter.name,
      fromDate,
      toDate,
      allSales: revenue.retailSales,
      allReturns: revenue.retailReturns,
    });
  }, [activeCounter, fromDate, toDate, revenue.retailSales, revenue.retailReturns]);

  // ── Category Sales ────────────────────────────────────────────────────────
  const categoryReport = useMemo<CategorySalesReport>(() => {
    return computeCategorySales({
      allSales: revenue.retailSales,
      fromDate,
      toDate,
      merchandisingProfiles: revenue.retailMerchandisingProfiles,
      categories: revenue.retailCatalogCategories,
      variantItemMap,
    });
  }, [revenue, fromDate, toDate, variantItemMap]);

  // ── Tender Breakdown ──────────────────────────────────────────────────────
  const tenderReport = useMemo<TenderBreakdownReport>(() => {
    return computeTenderBreakdown({ allSales: revenue.retailSales, fromDate, toDate });
  }, [revenue.retailSales, fromDate, toDate]);

  // ── GST Summary ───────────────────────────────────────────────────────────
  const gstReport = useMemo<GstSummaryReport>(() => {
    return computeGstSummary({ allSales: revenue.retailSales, fromDate, toDate });
  }, [revenue.retailSales, fromDate, toDate]);

  // ── SKU Margin ────────────────────────────────────────────────────────────
  const skuReport = useMemo<SkuMarginReport>(() => {
    return computeSkuMarginReport({
      allSales: revenue.retailSales,
      fromDate,
      toDate,
      variants,
      binBalances,
    });
  }, [revenue.retailSales, fromDate, toDate, variants, binBalances]);

  const campaignReport = useMemo<CampaignUsageReport>(() => computeCampaignUsage({
    allRedemptions: revenue.retailPromotionRedemptions,
    allSales: revenue.retailSales,
    policies: revenue.discountPolicies,
    fromDate,
    toDate,
  }), [revenue.retailPromotionRedemptions, revenue.retailSales, revenue.discountPolicies, fromDate, toDate]);
  const visitConversionReport = useMemo<CustomerVisitConversionReport>(() => computeCustomerVisitConversion({
    allVisits: revenue.retailCustomerVisits,
    allSales: revenue.retailSales,
    fromDate,
    toDate,
  }), [revenue.retailCustomerVisits, revenue.retailSales, fromDate, toDate]);
  const exchangeCreditNoteReport = useMemo<ExchangeCreditNoteReadinessReport>(() => computeExchangeCreditNoteReadiness({
    allExchanges: revenue.retailExchanges,
    allCreditNotes: revenue.retailCreditNoteReconciliations,
    fromDate,
    toDate,
  }), [revenue.retailExchanges, revenue.retailCreditNoteReconciliations, fromDate, toDate]);
  const channelSettlementReport = useMemo<RetailChannelSettlementReadinessReport>(() => computeRetailChannelSettlementReadiness({
    connectors: revenue.retailCommerceConnectors,
    settlements: revenue.retailSettlementReconciliations,
    allocations: revenue.retailSettlementAllocationPacks,
    withholding: revenue.retailSettlementWithholdingEvidence,
    conflicts: revenue.retailCommerceConflictResolutions,
    orders: revenue.retailCommerceOrders,
    fromDate,
    toDate,
  }), [revenue.retailCommerceConnectors, revenue.retailSettlementReconciliations, revenue.retailSettlementAllocationPacks, revenue.retailSettlementWithholdingEvidence, revenue.retailCommerceConflictResolutions, revenue.retailCommerceOrders, fromDate, toDate]);
  const payoutReport = useMemo<CommissionPayoutReport>(() => computeCommissionPayout({
    allCommissions: revenue.retailSalesCommissions,
    fromDate,
    toDate,
  }), [revenue.retailSalesCommissions, fromDate, toDate]);
  const payoutReadinessReport = useMemo<RetailPayoutReadinessReport>(() => computeRetailPayoutReadiness({
    allCommissions: revenue.retailSalesCommissions,
    allBatches: revenue.retailCommissionPayoutBatches,
    providerConnectors: revenue.providerConnectors,
    providerConformanceCases: revenue.providerConformanceCases,
    fromDate,
    toDate,
  }), [revenue.retailSalesCommissions, revenue.retailCommissionPayoutBatches, revenue.providerConnectors, revenue.providerConformanceCases, fromDate, toDate]);
  const payoutRailReadinessReport = useMemo<RetailPayoutRailReadinessReport>(() => computeRetailPayoutRailReadiness({
    providerConnectors: revenue.providerConnectors,
    providerConformanceCases: revenue.providerConformanceCases,
    providerSubmissions: revenue.providerSubmissions,
    providerReconciliationRuns: revenue.providerReconciliationRuns,
    commissionBatches: revenue.retailCommissionPayoutBatches,
    payrollRuns: revenue.payrollRuns,
    fromDate,
    toDate,
  }), [revenue.providerConnectors, revenue.providerConformanceCases, revenue.providerSubmissions, revenue.providerReconciliationRuns, revenue.retailCommissionPayoutBatches, revenue.payrollRuns, fromDate, toDate]);
  const electronicTenderSettlementReport = useMemo(() => computeRetailTenderSettlementReconciliation({ receipts: revenue.paymentReceipts, bankLines: revenue.bankStatementLines }), [revenue.paymentReceipts, revenue.bankStatementLines]);
  const electronicPayoutRailEvidenceReport = useMemo<RetailElectronicPayoutRailEvidenceReport>(() => computeRetailElectronicPayoutRailEvidence({
    providers: revenue.providerConnectors,
    conformanceCases: revenue.providerConformanceCases,
    submissions: revenue.providerSubmissions,
    reconciliationRuns: revenue.providerReconciliationRuns,
    tenderSettlement: electronicTenderSettlementReport,
  }), [revenue.providerConnectors, revenue.providerConformanceCases, revenue.providerSubmissions, revenue.providerReconciliationRuns, electronicTenderSettlementReport]);
  const ocrReadinessReport = useMemo<RetailOcrReadinessReport>(() => computeRetailOcrReadiness({
    providers: revenue.retailOcrProviderProfiles,
    documents: revenue.retailPurchaseOcrDocuments,
    mappings: revenue.retailPurchaseOcrMappings,
    exceptions: revenue.retailPurchaseExceptions,
    fromDate,
    toDate,
  }), [revenue.retailOcrProviderProfiles, revenue.retailPurchaseOcrDocuments, revenue.retailPurchaseOcrMappings, revenue.retailPurchaseExceptions, fromDate, toDate]);
  const ocrAdapterReadinessReport = useMemo<RetailOcrAdapterReadinessReport>(() => computeRetailOcrAdapterReadiness({
    providers: revenue.retailOcrProviderProfiles,
    documents: revenue.retailPurchaseOcrDocuments,
    exceptions: revenue.retailPurchaseExceptions,
    fromDate,
    toDate,
  }), [revenue.retailOcrProviderProfiles, revenue.retailPurchaseOcrDocuments, revenue.retailPurchaseExceptions, fromDate, toDate]);
  const ocrDocumentCertificationReport = useMemo<RetailOcrDocumentCertificationReport>(() => computeRetailOcrDocumentCertification({ providers: revenue.retailOcrProviderProfiles }), [revenue.retailOcrProviderProfiles]);
  const interBranchReadinessReport = useMemo<RetailInterBranchReadinessReport>(() => computeRetailInterBranchReadiness({
    transfers: revenue.retailInterBranchTransfers,
    fromDate,
    toDate,
  }), [revenue.retailInterBranchTransfers, fromDate, toDate]);
  const providerDeviceReadinessReport = useMemo<RetailProviderDeviceReadinessReport>(() => computeRetailProviderDeviceReadiness({
    assessments: buildRetailProviderReadiness(revenue),
  }), [revenue]);
  const certificationFreshnessReport = useMemo<RetailCertificationFreshnessReport>(() => computeRetailCertificationFreshness({
    commerceConnectors: revenue.retailCommerceConnectors,
    commerceCases: revenue.retailCommerceConformanceCases,
    ocrProviders: revenue.retailOcrProviderProfiles,
    providerConnectors: revenue.providerConnectors,
    providerCases: revenue.providerConformanceCases,
    asOfDate: toDate,
  }), [revenue.retailCommerceConnectors, revenue.retailCommerceConformanceCases, revenue.retailOcrProviderProfiles, revenue.providerConnectors, revenue.providerConformanceCases, toDate]);
  const marketplaceProductionReadinessReport = useMemo<RetailMarketplaceProductionReadinessReport>(() => computeRetailMarketplaceProductionReadiness({
    connectors: revenue.retailCommerceConnectors,
    conformanceCases: revenue.retailCommerceConformanceCases,
    syncRuns: revenue.retailCommerceSyncRuns,
    orders: revenue.retailCommerceOrders,
    settlements: revenue.retailSettlementReconciliations,
    allocations: revenue.retailSettlementAllocationPacks,
    withholding: revenue.retailSettlementWithholdingEvidence,
    conflicts: revenue.retailCommerceConflictResolutions,
    fromDate,
    toDate,
  }), [revenue.retailCommerceConnectors, revenue.retailCommerceConformanceCases, revenue.retailCommerceSyncRuns, revenue.retailCommerceOrders, revenue.retailSettlementReconciliations, revenue.retailSettlementAllocationPacks, revenue.retailSettlementWithholdingEvidence, revenue.retailCommerceConflictResolutions, fromDate, toDate]);
  const ondcProductionReadinessReport = useMemo<RetailOndcProductionReadinessReport>(() => computeRetailOndcProductionReadiness({
    connectors: revenue.retailCommerceConnectors,
    conformanceCases: revenue.retailCommerceConformanceCases,
    syncRuns: revenue.retailCommerceSyncRuns,
    pushBatches: revenue.retailCommercePushBatches,
    orders: revenue.retailCommerceOrders,
    settlements: revenue.retailSettlementReconciliations,
    allocations: revenue.retailSettlementAllocationPacks,
    withholding: revenue.retailSettlementWithholdingEvidence,
    conflicts: revenue.retailCommerceConflictResolutions,
    fromDate,
    toDate,
  }), [revenue.retailCommerceConnectors, revenue.retailCommerceConformanceCases, revenue.retailCommerceSyncRuns, revenue.retailCommercePushBatches, revenue.retailCommerceOrders, revenue.retailSettlementReconciliations, revenue.retailSettlementAllocationPacks, revenue.retailSettlementWithholdingEvidence, revenue.retailCommerceConflictResolutions, fromDate, toDate]);
  const reportDeliveryReadinessReport = useMemo<RetailReportDeliveryReadinessReport>(() => computeRetailReportDeliveryReadiness({
    plans: reportDeliveryPlans,
    attempts: reportDeliveryAttempts,
    providerConnectors: revenue.providerConnectors,
    providerConformanceCases: revenue.providerConformanceCases,
    fromDate,
    toDate,
  }), [reportDeliveryPlans, reportDeliveryAttempts, revenue.providerConnectors, revenue.providerConformanceCases, fromDate, toDate]);
  const storeExecutionReadinessReport = useMemo<RetailStoreExecutionReadinessReport>(() => computeRetailStoreExecutionReadiness({
    offlineQueue: revenue.retailOfflineSaleQueue,
    deviceEvidence: revenue.retailDeviceTransportEvidence,
    preflightEvidence: revenue.retailDevicePreflightEvidence,
  }), [revenue.retailOfflineSaleQueue, revenue.retailDeviceTransportEvidence, revenue.retailDevicePreflightEvidence]);
  const productionExitGateReport = useMemo<RetailProductionExitGateReport>(() => computeRetailProductionExitGate({
    storeExecution: storeExecutionReadinessReport,
    providerDevices: providerDeviceReadinessReport,
    marketplace: marketplaceProductionReadinessReport,
    ondc: ondcProductionReadinessReport,
    scheduledDelivery: reportDeliveryReadinessReport,
    certificationFreshness: certificationFreshnessReport,
  }), [storeExecutionReadinessReport, providerDeviceReadinessReport, marketplaceProductionReadinessReport, ondcProductionReadinessReport, reportDeliveryReadinessReport, certificationFreshnessReport]);
  const rolloutReadinessReport = useMemo<RetailRolloutReadinessReport>(() => computeRetailRolloutReadiness({
    exitGate: productionExitGateReport,
    operationalHealth,
  }), [productionExitGateReport, operationalHealth]);
  const creditReport = useMemo<CreditUtilizationReport>(() => computeCreditUtilization({
    controls: revenue.creditLimitControls,
    receivables: revenue.receivables,
    asOfDate: toDate,
  }), [revenue.creditLimitControls, revenue.receivables, toDate]);

  const expiryReport = useMemo<ExpiryRiskReport>(() => computeExpiryRisk({
    items: revenue.inventoryItems,
    variants: revenue.itemVariants,
    batches: revenue.inventoryBatches,
    balances: revenue.binBalances,
    warehouses: revenue.warehouses,
    zones: revenue.warehouseZones,
    bins: revenue.storageBins,
    asOfDate: toDate,
    horizonDays: 30,
  }), [revenue.inventoryItems, revenue.itemVariants, revenue.inventoryBatches, revenue.binBalances, revenue.warehouses, revenue.warehouseZones, revenue.storageBins, toDate]);

  const rackReport = useMemo<RackReadinessReport>(() => computeRackReadiness({
    items: revenue.inventoryItems,
    variants: revenue.itemVariants,
    warehouses: revenue.warehouses,
    zones: revenue.warehouseZones,
    bins: revenue.storageBins,
    balances: revenue.binBalances,
  }), [revenue.inventoryItems, revenue.itemVariants, revenue.warehouses, revenue.warehouseZones, revenue.storageBins, revenue.binBalances]);

  // ── Tab content ───────────────────────────────────────────────────────────

  function renderXZShared(report: XReport | ZReport | null, isZ: boolean) {
    if (!report) {
      return <p className="retail-reports-workbench__empty">Select a cashier shift above to generate the {isZ ? 'Z' : 'X'}-Report.</p>;
    }
    return (
      <>
        <div className="retail-reports-workbench__kpis">
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Sales Count</span>
            <span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{report.saleCount}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Grand Total</span>
            <span className="retail-reports-workbench__kpi-value">{inr.format(report.grandTotal)}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Avg. Basket</span>
            <span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{inr.format(report.averageBasket)}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Gross Profit</span>
            <span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{inr.format(report.grossProfit)}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Gross Margin</span>
            <span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{pct(report.grossMarginPct)}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Total Tax</span>
            <span className="retail-reports-workbench__kpi-value">{inr.format(report.taxTotal)}</span>
          </div>
          {isZ && 'variance' in report && report.variance !== null && (
            <div className="retail-reports-workbench__kpi-card">
              <span className="retail-reports-workbench__kpi-label">Cash Variance</span>
              <span className={`retail-reports-workbench__kpi-value ${(report.variance ?? 0) === 0 ? 'retail-reports-workbench__kpi-value--positive' : ''}`}>
                {inr.format(report.variance ?? 0)}
              </span>
            </div>
          )}
        </div>

        <div className="retail-reports-workbench__table-wrapper">
          <table className="retail-reports-workbench__table">
            <thead>
              <tr>
                <th>Tender Method</th>
                <th className="right">Transaction Count</th>
                <th className="right">Total Collected</th>
              </tr>
            </thead>
            <tbody>
              {report.tenderLines.map((line) => (
                <tr key={line.method}>
                  <td><span className={`tender-badge tender-badge--${line.method}`}>{line.method}</span></td>
                  <td className="right">{line.count}</td>
                  <td className="right">{inr.format(line.total)}</td>
                </tr>
              ))}
              {report.tenderLines.length === 0 && (
                <tr><td colSpan={3} className="retail-reports-workbench__empty">No sales in this shift.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="retail-reports-workbench__export-bar">
          <button
            type="button"
            className="retail-reports-workbench__export-btn"
            onClick={() => { copyJson(report); notifyCopy(isZ ? 'Z-Report' : 'X-Report'); }}
          >
            <ClipboardCopy size={12} /> Copy JSON
          </button>
        </div>
      </>
    );
  }

  function renderCounterSummary() {
    if (!counterReport || counterReport.rows.length === 0) {
      return <p className="retail-reports-workbench__empty">No counter sales in the selected date range.</p>;
    }
    return (
      <>
        <div className="retail-reports-workbench__kpis">
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Net Revenue</span>
            <span className="retail-reports-workbench__kpi-value">{inr.format(counterReport.totals.netRevenue)}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Total Sales</span>
            <span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{counterReport.totals.saleCount}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Returns</span>
            <span className="retail-reports-workbench__kpi-value">{counterReport.totals.returnCount}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Gross Profit</span>
            <span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{inr.format(counterReport.totals.grossProfit)}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Margin</span>
            <span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{pct(counterReport.totals.grossMarginPct)}</span>
          </div>
        </div>

        <div className="retail-reports-workbench__table-wrapper">
          <table className="retail-reports-workbench__table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="right">Sales</th>
                <th className="right">Returns</th>
                <th className="right">Gross Revenue</th>
                <th className="right">Return Value</th>
                <th className="right">Net Revenue</th>
                <th className="right">COGS</th>
                <th className="right">Gross Profit</th>
                <th className="right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {counterReport.rows.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td className="right">{row.saleCount}</td>
                  <td className="right">{row.returnCount}</td>
                  <td className="right">{inr.format(row.grossRevenue)}</td>
                  <td className="right negative">{row.returnValue > 0 ? `−${inr.format(row.returnValue)}` : '—'}</td>
                  <td className="right">{inr.format(row.netRevenue)}</td>
                  <td className="right">{inr.format(row.costTotal)}</td>
                  <td className={`right ${row.grossProfit >= 0 ? 'positive' : 'negative'}`}>{inr.format(row.grossProfit)}</td>
                  <td className="right accent">{pct(row.grossMarginPct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td className="right">{counterReport.totals.saleCount}</td>
                <td className="right">{counterReport.totals.returnCount}</td>
                <td className="right">{inr.format(counterReport.totals.grossRevenue)}</td>
                <td className="right">{counterReport.totals.returnValue > 0 ? `−${inr.format(counterReport.totals.returnValue)}` : '—'}</td>
                <td className="right">{inr.format(counterReport.totals.netRevenue)}</td>
                <td className="right">{inr.format(counterReport.totals.costTotal)}</td>
                <td className="right">{inr.format(counterReport.totals.grossProfit)}</td>
                <td className="right">{pct(counterReport.totals.grossMarginPct)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="retail-reports-workbench__export-bar">
          <button type="button" className="retail-reports-workbench__export-btn"
            onClick={() => { copyJson(counterReport); notifyCopy('Counter Summary'); }}>
            <ClipboardCopy size={12} /> Copy JSON
          </button>
        </div>
      </>
    );
  }

  function renderCategorySales() {
    if (categoryReport.rows.length === 0) {
      return <p className="retail-reports-workbench__empty">No category sales data for the selected range.</p>;
    }
    return (
      <>
        <div className="retail-reports-workbench__table-wrapper">
          <table className="retail-reports-workbench__table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="right">Lines</th>
                <th className="right">Qty Sold</th>
                <th className="right">Revenue</th>
                <th className="right">Discounts</th>
                <th className="right">COGS</th>
                <th className="right">Gross Profit</th>
                <th className="right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {categoryReport.rows.map((row) => (
                <tr key={row.categoryId}>
                  <td>{row.categoryName}</td>
                  <td className="right">{row.lineCount}</td>
                  <td className="right">{row.quantity}</td>
                  <td className="right">{inr.format(row.revenue)}</td>
                  <td className="right dim">{row.discountTotal > 0 ? inr.format(row.discountTotal) : '—'}</td>
                  <td className="right">{inr.format(row.costTotal)}</td>
                  <td className={`right ${row.grossProfit >= 0 ? 'positive' : 'negative'}`}>{inr.format(row.grossProfit)}</td>
                  <td className="right">
                    <span className={`margin-pill ${marginPillClass(row.grossMarginPct)}`}>{pct(row.grossMarginPct)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="retail-reports-workbench__export-bar">
          <button type="button" className="retail-reports-workbench__export-btn"
            onClick={() => { copyJson(categoryReport); notifyCopy('Category Sales'); }}>
            <ClipboardCopy size={12} /> Copy JSON
          </button>
        </div>
      </>
    );
  }

  function renderTenderBreakdown() {
    if (tenderReport.rows.length === 0) {
      return <p className="retail-reports-workbench__empty">No tender data for the selected range.</p>;
    }
    return (
      <>
        <div className="retail-reports-workbench__kpis">
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Grand Total Collected</span>
            <span className="retail-reports-workbench__kpi-value">{inr.format(tenderReport.grandTotal)}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Tender Methods Used</span>
            <span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{tenderReport.rows.length}</span>
          </div>
        </div>

        <div className="retail-reports-workbench__table-wrapper">
          <table className="retail-reports-workbench__table">
            <thead>
              <tr>
                <th>Tender Method</th>
                <th className="right">Transactions</th>
                <th className="right">Sales with this Tender</th>
                <th className="right">Total Amount</th>
                <th className="right">Share</th>
              </tr>
            </thead>
            <tbody>
              {tenderReport.rows.map((row) => (
                <tr key={row.method}>
                  <td><span className={`tender-badge tender-badge--${row.method}`}>{row.method}</span></td>
                  <td className="right">{row.transactionCount}</td>
                  <td className="right">{row.saleCount}</td>
                  <td className="right">{inr.format(row.total)}</td>
                  <td className="right accent">{pct(row.sharePct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td className="right">{tenderReport.rows.reduce((s, r) => s + r.transactionCount, 0)}</td>
                <td className="right">—</td>
                <td className="right">{inr.format(tenderReport.grandTotal)}</td>
                <td className="right">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="retail-reports-workbench__export-bar">
          <button type="button" className="retail-reports-workbench__export-btn"
            onClick={() => { copyJson(tenderReport); notifyCopy('Tender Breakdown'); }}>
            <ClipboardCopy size={12} /> Copy JSON
          </button>
        </div>
      </>
    );
  }

  function renderGstSummary() {
    if (gstReport.rows.length === 0) {
      return <p className="retail-reports-workbench__empty">No GST sales data for the selected range.</p>;
    }
    return (
      <>
        <div className="retail-reports-workbench__kpis">
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Taxable Value</span>
            <span className="retail-reports-workbench__kpi-value">{inr.format(gstReport.totals.taxableValue)}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">Total GST + Cess</span>
            <span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{inr.format(gstReport.totals.totalTax)}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">CGST</span>
            <span className="retail-reports-workbench__kpi-value">{inr.format(gstReport.totals.cgst)}</span>
          </div>
          <div className="retail-reports-workbench__kpi-card">
            <span className="retail-reports-workbench__kpi-label">SGST</span>
            <span className="retail-reports-workbench__kpi-value">{inr.format(gstReport.totals.sgst)}</span>
          </div>
          {gstReport.totals.igst > 0 && (
            <div className="retail-reports-workbench__kpi-card">
              <span className="retail-reports-workbench__kpi-label">IGST</span>
              <span className="retail-reports-workbench__kpi-value">{inr.format(gstReport.totals.igst)}</span>
            </div>
          )}
          {gstReport.totals.cess > 0 && (
            <div className="retail-reports-workbench__kpi-card">
              <span className="retail-reports-workbench__kpi-label">Cess</span>
              <span className="retail-reports-workbench__kpi-value">{inr.format(gstReport.totals.cess)}</span>
            </div>
          )}
        </div>

        <div className="retail-reports-workbench__table-wrapper">
          <table className="retail-reports-workbench__table">
            <thead>
              <tr>
                <th>GST Rate</th>
                <th className="right">Invoice Lines</th>
                <th className="right">Taxable Value</th>
                <th className="right">CGST</th>
                <th className="right">SGST</th>
                <th className="right">IGST</th>
                <th className="right">Cess</th>
                <th className="right">Total Tax</th>
              </tr>
            </thead>
            <tbody>
              {gstReport.rows.map((row) => (
                <tr key={row.gstRate}>
                  <td><strong>{row.gstRate}</strong></td>
                  <td className="right">{row.invoiceCount}</td>
                  <td className="right">{inr.format(row.taxableValue)}</td>
                  <td className="right">{inr.format(row.cgst)}</td>
                  <td className="right">{inr.format(row.sgst)}</td>
                  <td className="right">{row.igst > 0 ? inr.format(row.igst) : <span className="dim">—</span>}</td>
                  <td className="right">{row.cess > 0 ? inr.format(row.cess) : <span className="dim">—</span>}</td>
                  <td className="right accent">{inr.format(row.totalTax)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td className="right">{gstReport.totals.invoiceCount}</td>
                <td className="right">{inr.format(gstReport.totals.taxableValue)}</td>
                <td className="right">{inr.format(gstReport.totals.cgst)}</td>
                <td className="right">{inr.format(gstReport.totals.sgst)}</td>
                <td className="right">{inr.format(gstReport.totals.igst)}</td>
                <td className="right">{inr.format(gstReport.totals.cess)}</td>
                <td className="right">{inr.format(gstReport.totals.totalTax)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="retail-reports-workbench__export-bar">
          <button type="button" className="retail-reports-workbench__export-btn"
            onClick={() => { copyJson(gstReport); notifyCopy('GST Summary'); }}>
            <ClipboardCopy size={12} /> Copy JSON
          </button>
        </div>
      </>
    );
  }

  function renderSkuMargin() {
    if (skuReport.rows.length === 0) {
      return <p className="retail-reports-workbench__empty">No SKU sales data for the selected range.</p>;
    }
    return (
      <>
        <div className="retail-reports-workbench__table-wrapper">
          <table className="retail-reports-workbench__table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th className="right">Qty Sold</th>
                <th className="right">Opening Stock</th>
                <th>Sell-Through</th>
                <th className="right">Revenue</th>
                <th className="right">COGS</th>
                <th className="right">Gross Profit</th>
                <th className="right">Margin %</th>
                <th className="right">Avg Price</th>
              </tr>
            </thead>
            <tbody>
              {skuReport.rows.map((row) => (
                <tr key={row.itemVariantId}>
                  <td><code style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{row.sku}</code></td>
                  <td>{row.variantName}</td>
                  <td className="right">{row.quantitySold}</td>
                  <td className="right">{row.openingStock}</td>
                  <td>
                    <div className="sell-through-bar">
                      <div className="sell-through-bar__track">
                        <div
                          className="sell-through-bar__fill"
                          style={{ width: `${Math.min(row.sellThroughPct, 100)}%` }}
                        />
                      </div>
                      <span className="sell-through-bar__label">{pct(row.sellThroughPct)}</span>
                    </div>
                  </td>
                  <td className="right">{inr.format(row.revenue)}</td>
                  <td className="right">{inr.format(row.costTotal)}</td>
                  <td className={`right ${row.grossProfit >= 0 ? 'positive' : 'negative'}`}>{inr.format(row.grossProfit)}</td>
                  <td className="right">
                    <span className={`margin-pill ${marginPillClass(row.grossMarginPct)}`}>{pct(row.grossMarginPct)}</span>
                  </td>
                  <td className="right">{inr.format(row.averageSellingPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="retail-reports-workbench__export-bar">
          <button type="button" className="retail-reports-workbench__export-btn"
            onClick={() => { copyJson(skuReport); notifyCopy('SKU Margin Report'); }}>
            <ClipboardCopy size={12} /> Copy JSON
          </button>
        </div>
      </>
    );
  }

  function renderCampaignUsage() {
    if (!campaignReport.rows.length) return <p className="retail-reports-workbench__empty">No campaign redemptions in the selected date range.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Redemptions</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{campaignReport.totalRedemptions}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Campaign Discount</span><span className="retail-reports-workbench__kpi-value">{inr.format(campaignReport.totalDiscount)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Gift Units</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{campaignReport.totalGiftQuantity}</span></div>
      </div>
      <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Campaign</th><th className="right">Redemptions</th><th className="right">Sales</th><th className="right">Discount</th><th className="right">Gift Units</th><th className="right">Influenced Revenue</th><th className="right">Avg Basket</th><th className="right">Discount %</th></tr></thead><tbody>{campaignReport.rows.map((row) => <tr key={row.policyId}><td><strong>{row.name}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.code}{row.campaignCode ? ` · ${row.campaignCode}` : ''}</small></td><td className="right">{row.redemptionCount}</td><td className="right">{row.uniqueSaleCount}</td><td className="right">{inr.format(row.discountTotal)}</td><td className="right">{row.giftQuantity}</td><td className="right">{inr.format(row.influencedRevenue)}</td><td className="right">{inr.format(row.averageInfluencedBasket)}</td><td className="right accent">{pct(row.effectiveDiscountRatePct)}</td></tr>)}</tbody></table></div>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(campaignReport); notifyCopy('Campaign Usage'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderVisitConversion() {
    if (!visitConversionReport.rows.length) return <p className="retail-reports-workbench__empty">No customer visits were recorded in the selected date range.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Visits</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{visitConversionReport.totalVisits}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Converted</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{visitConversionReport.convertedVisits}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Conversion Rate</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{pct(visitConversionReport.conversionRatePct)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Influenced Revenue</span><span className="retail-reports-workbench__kpi-value">{inr.format(visitConversionReport.influencedRevenue)}</span></div>
      </div>
      <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Channel</th><th>Purpose</th><th className="right">Visits</th><th className="right">Converted</th><th className="right">Unconverted</th><th className="right">Conversion</th><th className="right">Influenced Revenue</th><th className="right">Avg Basket</th></tr></thead><tbody>{visitConversionReport.rows.map((row) => <tr key={`${row.channel}:${row.purpose}`}><td><strong>{row.channel}</strong></td><td>{row.purpose}</td><td className="right">{row.visitCount}</td><td className="right positive">{row.convertedVisitCount}</td><td className="right">{row.unconvertedVisitCount}</td><td className="right accent">{pct(row.conversionRatePct)}</td><td className="right">{inr.format(row.influencedRevenue)}</td><td className="right">{inr.format(row.averageInfluencedBasket)}</td></tr>)}</tbody></table></div>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(visitConversionReport); notifyCopy('Visit Conversion'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderExchangeCreditNotes() {
    if (!exchangeCreditNoteReport.rows.length) return <p className="retail-reports-workbench__empty">No exchange or credit-note evidence was recorded in the selected date range.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Exchanges</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{exchangeCreditNoteReport.totalExchanges}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Replacement Revenue</span><span className="retail-reports-workbench__kpi-value">{inr.format(exchangeCreditNoteReport.replacementRevenue)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Credit Notes Matched</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{exchangeCreditNoteReport.matchedCreditNotes}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Blocked Evidence</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{exchangeCreditNoteReport.blockedCreditNotes}</span></div>
      </div>
      <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Credit Note</th><th>Return</th><th>Filing Period</th><th>Status</th><th>Exchange</th><th className="right">Credit</th><th className="right">Replacement Revenue</th><th className="right">Top-up</th><th>Action</th></tr></thead><tbody>{exchangeCreditNoteReport.rows.map((row) => <tr key={row.creditNoteId}><td><strong>{row.creditNoteNumber}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.totalTax > 0 ? `GST ${inr.format(row.totalTax)}` : 'No output tax'}</small></td><td>{row.retailReturnNumber}</td><td>{row.filingPeriod}</td><td><em data-status={row.status}>{row.status}</em></td><td><em data-status={row.exchangeStatus}>{row.exchangeStatus}{row.exchangeCount ? ` · ${row.exchangeCount}` : ''}</em></td><td className="right">{inr.format(row.totalCredit)}</td><td className="right">{inr.format(row.replacementRevenue)}</td><td className="right">{inr.format(row.topUpValue)}</td><td>{row.actionRequired ? <span className="retail-reports-workbench__status-warning">Review evidence</span> : <span className="retail-reports-workbench__status-ok">Ready</span>}</td></tr>)}</tbody></table></div>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(exchangeCreditNoteReport); notifyCopy('Returns & Credit Notes'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderChannelSettlements() {
    if (!channelSettlementReport.rows.length) return <p className="retail-reports-workbench__empty">No settlement-pull commerce connectors are configured for the selected scope.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Settlements</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{channelSettlementReport.settlementCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Ready</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{channelSettlementReport.readySettlementCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Variance Exposure</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{inr.format(channelSettlementReport.varianceExposure)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">External Gates</span><span className="retail-reports-workbench__kpi-value">{channelSettlementReport.externalCertificationGates}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Exceptions</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{channelSettlementReport.exceptionCount}</span></div>
      </div>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Connector</th><th>Channel</th><th>State</th><th className="right">Settlements</th><th className="right">Ready</th><th className="right">Gross</th><th className="right">Refunds / RTO</th><th className="right">Fees</th><th className="right">TDS/TCS</th><th className="right">Variance</th><th>Controls</th></tr></thead><tbody>{channelSettlementReport.rows.map((row) => <tr key={row.connectorId}><td><strong>{row.connectorCode}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.connectorName} · {row.environment}</small></td><td>{row.channel}</td><td><em data-status={row.connectorState}>{row.connectorState}</em></td><td className="right">{row.settlementCount}</td><td className="right positive">{row.readySettlementCount}</td><td className="right">{inr.format(row.grossAmount)}</td><td className="right accent">{inr.format(row.refundAmount)}</td><td className="right">{inr.format(row.feeAmount)}</td><td className="right">{inr.format(row.taxWithheldAmount)}</td><td className="right accent">{inr.format(row.varianceExposure)}</td><td><small>{row.exceptionCount ? `${row.exceptionCount} exception${row.exceptionCount === 1 ? '' : 's'}` : 'Ready'}</small></td></tr>)}</tbody></table></div>
      {channelSettlementReport.exceptions.length > 0 && <section className="retail-reports-workbench__section" aria-label="Unified channel payout exceptions">
        <h3>Unified payout exceptions <small>variance, order, refund/RTO, withholding, journal, conflict, and provider evidence</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Settlement</th><th>Connector</th><th>Issue</th><th>Severity</th><th className="right">Amount</th><th>Next action</th></tr></thead><tbody>{channelSettlementReport.exceptions.map((exception) => <tr key={`${exception.settlementId}:${exception.kind}`}><td><strong>{exception.settlementNumber}</strong><small style={{ display: 'block', color: '#64748b' }}>{exception.settlementReference}</small></td><td>{exception.connectorCode}<small style={{ display: 'block', color: '#64748b' }}>{exception.channel}</small></td><td>{exception.kind}</td><td><em data-status={exception.severity}>{exception.severity}</em></td><td className="right">{exception.amount ? inr.format(exception.amount) : '—'}</td><td>{exception.action}</td></tr>)}</tbody></table></div>
      </section>}
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(channelSettlementReport); notifyCopy('Channel Settlements'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderPayouts() {
    const payoutBatches = revenue.retailCommissionPayoutBatches ?? [];
    if (!payoutReport.rows.length && !payoutBatches.length) return <p className="retail-reports-workbench__empty">No sales-team commission records in the selected date range.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Total Commission</span><span className="retail-reports-workbench__kpi-value">{inr.format(payoutReport.totalCommission)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Pending</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{inr.format(payoutReport.pendingAmount)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Approved</span><span className="retail-reports-workbench__kpi-value">{inr.format(payoutReport.approvedAmount)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Paid</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{inr.format(payoutReport.paidAmount)}</span></div>
      </div>
      <section className="retail-reports-workbench__section" aria-label="Payout provider readiness">
        <h3>Bank payout release boundary <small>approval is not provider settlement</small></h3>
        <div className="retail-reports-workbench__kpis">
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Provider Gate</span><span className="retail-reports-workbench__kpi-value"><em data-status={payoutReadinessReport.providerGate}>{payoutReadinessReport.providerGate}</em></span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Approved, Unbatched</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{inr.format(payoutReadinessReport.unbatchedApprovedAmount)}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Approved Batches</span><span className="retail-reports-workbench__kpi-value">{inr.format(payoutReadinessReport.approvedAmount)}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Released Evidence</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{inr.format(payoutReadinessReport.releasedAmount)}</span></div>
        </div>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Batch</th><th>Date</th><th>Status</th><th>Provider</th><th className="right">Commissions</th><th className="right">Total</th><th>Action</th></tr></thead><tbody>{payoutReadinessReport.rows.map((row) => <tr key={row.batchId}><td><strong>{row.batchNumber}</strong></td><td>{row.payoutDate}</td><td><em data-status={row.status}>{row.status}</em></td><td><em data-status={row.providerState}>{row.providerState}</em></td><td className="right">{row.commissionCount}</td><td className="right">{inr.format(row.totalAmount)}</td><td>{row.actionRequired ? <span className="retail-reports-workbench__status-warning">Review boundary</span> : <span className="retail-reports-workbench__status-ok">Evidence complete</span>}</td></tr>)}</tbody></table></div>
      </section>
      <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Salesperson</th><th className="right">Commissions</th><th className="right">Sales</th><th className="right">Basis</th><th className="right">Pending</th><th className="right">Approved</th><th className="right">Paid</th><th className="right">Readiness</th></tr></thead><tbody>{payoutReport.rows.map((row) => <tr key={row.salespersonUserId}><td><strong>{row.salespersonUserId}</strong></td><td className="right">{row.commissionCount}</td><td className="right">{row.saleCount}</td><td className="right">{inr.format(row.basisAmount)}</td><td className="right">{inr.format(row.pendingAmount)}</td><td className="right">{inr.format(row.approvedAmount)}</td><td className="right positive">{inr.format(row.paidAmount)}</td><td className="right accent">{pct(row.payoutReadinessPct)}</td></tr>)}</tbody></table></div>
      <section className="retail-reports-workbench__section" aria-label="Commission payout batches">
        <h3>Controlled payout batches <small>maker → checker → release evidence</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Batch</th><th>Date</th><th>Status</th><th className="right">Commissions</th><th className="right">Total</th><th>Release reference</th></tr></thead><tbody>{payoutBatches.map((batch) => <tr key={batch.id}><td><strong>{batch.number}</strong><small style={{ display: 'block', color: '#64748b' }}>{batch.submittedBy}</small></td><td>{batch.payoutDate}</td><td><em data-status={batch.status}>{batch.status}</em></td><td className="right">{batch.commissionIds.length}</td><td className="right">{inr.format(batch.totalAmount)}</td><td>{batch.releaseReference ?? '—'}</td></tr>)}</tbody></table></div>
      </section>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(payoutReport); notifyCopy('Team Payouts'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderPayoutRails() {
    if (!payoutRailReadinessReport.rows.length && payoutRailReadinessReport.commissionBatchCount === 0 && payoutRailReadinessReport.payrollRunCount === 0) return <p className="retail-reports-workbench__empty">No banking or payroll payout obligations are present in the selected date range.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Production Ready Rails</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{payoutRailReadinessReport.productionReadyCount} / {payoutRailReadinessReport.connectorCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">External Certification</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{payoutRailReadinessReport.externalCertificationGates}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Commission Releases</span><span className="retail-reports-workbench__kpi-value">{inr.format(payoutRailReadinessReport.commissionReleasedAmount)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Approved to Release</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{inr.format(payoutRailReadinessReport.commissionApprovedAmount)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Payroll Net Pay</span><span className="retail-reports-workbench__kpi-value">{inr.format(payoutRailReadinessReport.payrollNetPay)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Handoffs / Drift</span><span className="retail-reports-workbench__kpi-value">{payoutRailReadinessReport.pendingSubmissionCount} / {payoutRailReadinessReport.reconciliationDriftCount}</span></div>
      </div>
      <section className="retail-reports-workbench__section" aria-label="Banking and payroll payout rail readiness">
        <h3>Banking + payroll payout rails <small>provider credentials and independently assessed evidence remain explicit gates</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Rail</th><th>Domain</th><th>State</th><th className="right">Capabilities</th><th className="right">Conformance</th><th className="right">Handoffs</th><th className="right">Drift</th><th>Next Action</th></tr></thead><tbody>{payoutRailReadinessReport.rows.map((row) => <tr key={row.connectorId}><td><strong>{row.connectorCode}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.connectorName} · {row.environment}</small></td><td>{row.domain}</td><td><em data-status={row.providerState}>{row.providerState}</em></td><td className="right">{row.configuredCapabilityCount}/{row.requiredCapabilityCount}</td><td className="right">{row.validConformanceCaseCount}/{row.requiredCapabilityCount}</td><td className="right">{row.pendingSubmissionCount}</td><td className="right">{row.reconciliationDriftCount}</td><td>{row.actionRequired ? <span className="retail-reports-workbench__status-warning">{row.nextAction}</span> : <span className="retail-reports-workbench__status-ok">Ready</span>}</td></tr>)}</tbody></table></div>
      </section>
      <section className="retail-reports-workbench__section" aria-label="UPI card and bank transfer settlement evidence">
        <h3>Electronic tender evidence <small>explicit UPI, card and bank-transfer provider tags plus pull-run coverage</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Rail</th><th>Provider</th><th>State</th><th className="right">Conformance</th><th className="right">Pull runs</th><th className="right">Matched</th><th className="right">Exceptions</th><th className="right">Bank gap</th><th>Next action</th></tr></thead><tbody>{electronicPayoutRailEvidenceReport.rows.map((row) => <tr key={row.rail}><td><strong>{row.rail.toUpperCase()}</strong></td><td>{row.providerCode ? <><strong>{row.providerCode}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.providerName}</small></> : <span className="retail-reports-workbench__status-warning">No production provider</span>}</td><td><em data-status={row.status}>{row.status.replaceAll('-', ' ')}</em></td><td className="right">{row.conformanceEvidenceCount}</td><td className="right">{row.settlementRunCount}</td><td className="right positive">{row.matchedSettlementItemCount}</td><td className="right">{row.exceptionSettlementItemCount}</td><td className="right">{inr.format(row.bankGapAmount)}</td><td><span className={row.status === 'ready' ? 'retail-reports-workbench__status-ok' : 'retail-reports-workbench__status-warning'}>{row.nextAction}</span></td></tr>)}</tbody></table></div>
      </section>
      <section className="retail-reports-workbench__section" aria-label="Payout obligation coverage">
        <h3>Obligation coverage <small>local approval and finalization are distinct from external settlement</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Obligation</th><th className="right">Records</th><th className="right">Pending</th><th className="right">Completed</th><th className="right">Value</th><th>Control</th></tr></thead><tbody>
          <tr><td><strong>Retail commission batches</strong></td><td className="right">{payoutRailReadinessReport.commissionBatchCount}</td><td className="right">{payoutRailReadinessReport.commissionApprovedBatchCount}</td><td className="right positive">{payoutRailReadinessReport.commissionReleasedBatchCount}</td><td className="right">{inr.format(payoutRailReadinessReport.commissionReleasedAmount)}</td><td>{payoutRailReadinessReport.commissionApprovedBatchCount ? <span className="retail-reports-workbench__status-warning">Release approved batches</span> : <span className="retail-reports-workbench__status-ok">No pending release</span>}</td></tr>
          <tr><td><strong>Payroll runs</strong></td><td className="right">{payoutRailReadinessReport.payrollRunCount}</td><td className="right">{payoutRailReadinessReport.payrollPendingCount}</td><td className="right positive">{payoutRailReadinessReport.payrollFinalizedCount}</td><td className="right">{inr.format(payoutRailReadinessReport.payrollNetPay)}</td><td>{payoutRailReadinessReport.payrollPendingCount ? <span className="retail-reports-workbench__status-warning">Approve / finalize payroll</span> : <span className="retail-reports-workbench__status-ok">No pending payroll</span>}</td></tr>
        </tbody></table></div>
      </section>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(payoutRailReadinessReport); notifyCopy('Payout Rails'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderOcrReadiness() {
    if (!ocrReadinessReport.rows.length) return <p className="retail-reports-workbench__empty">No supplier-invoice OCR evidence was recorded in the selected date range.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Documents</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{ocrReadinessReport.documentCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Converted</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{ocrReadinessReport.convertedDocumentCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Avg. Confidence</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{pct(ocrReadinessReport.averageConfidencePct)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Open Exceptions</span><span className="retail-reports-workbench__kpi-value">{ocrReadinessReport.openExceptionCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Mapping Pending</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{ocrReadinessReport.mappingPendingCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Converted Value</span><span className="retail-reports-workbench__kpi-value">{inr.format(ocrReadinessReport.convertedValue)}</span></div>
      </div>
      <section className="retail-reports-workbench__section" aria-label="Supplier invoice OCR provider readiness">
        <h3>Supplier-invoice OCR readiness <small>confidence, mapping and exception evidence before purchase conversion</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Provider</th><th>State</th><th className="right">Documents</th><th className="right">Converted</th><th className="right">Confidence</th><th className="right">Open Exceptions</th><th className="right">Mapping Pending</th><th className="right">Converted Value</th><th>Action</th></tr></thead><tbody>{ocrReadinessReport.rows.map((row) => <tr key={row.providerId ?? row.providerCode}><td><strong>{row.providerCode}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.providerName}</small></td><td><em data-status={row.providerState}>{row.providerState}</em></td><td className="right">{row.documentCount}</td><td className="right positive">{row.convertedDocumentCount}</td><td className="right accent">{pct(row.averageConfidencePct)}</td><td className="right">{row.openExceptionCount}{row.criticalExceptionCount ? <small style={{ display: 'block', color: '#b91c1c' }}>{row.criticalExceptionCount} critical</small> : null}</td><td className="right">{row.mappingPendingCount}</td><td className="right">{inr.format(row.convertedValue)}</td><td>{row.actionRequired ? <span className="retail-reports-workbench__status-warning">Review intake</span> : <span className="retail-reports-workbench__status-ok">Ready</span>}</td></tr>)}</tbody></table></div>
      </section>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(ocrReadinessReport); notifyCopy('OCR Intake'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderOcrAdapterReadiness() {
    if (!ocrAdapterReadinessReport.rows.length && ocrAdapterReadinessReport.documentCount === 0) return <p className="retail-reports-workbench__empty">No OCR adapter profiles or supplier-invoice documents are available for the selected period.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Adapters</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{ocrAdapterReadinessReport.providerCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Certified</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{ocrAdapterReadinessReport.certifiedAdapterCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">External Gates</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{ocrAdapterReadinessReport.externalCertificationGates}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Header Coverage</span><span className="retail-reports-workbench__kpi-value">{pct(ocrAdapterReadinessReport.headerCoveragePct)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Line Coverage</span><span className="retail-reports-workbench__kpi-value">{pct(ocrAdapterReadinessReport.lineCoveragePct)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Open Exceptions</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{ocrAdapterReadinessReport.openExceptionCount}</span></div>
      </div>
      <section className="retail-reports-workbench__section" aria-label="OCR adapter certification readiness">
        <h3>Supplier-invoice OCR adapter gate <small>credentials, supported document kind, independent replay, checksum, and field coverage</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Adapter</th><th>State</th><th>Certification</th><th className="right">Documents</th><th className="right">Headers</th><th className="right">Lines</th><th className="right">Exceptions</th><th>Next Action</th></tr></thead><tbody>{ocrAdapterReadinessReport.rows.map((row) => <tr key={row.providerId ?? row.providerCode}><td><strong>{row.providerCode}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.providerName}</small></td><td><em data-status={row.providerState}>{row.providerState}</em></td><td><small>{row.credentialReady ? 'credentials' : 'credentials missing'} · {row.supplierInvoiceSupported ? 'invoice supported' : 'invoice unsupported'} · {row.testEvidenceReady ? 'replay evidenced' : 'replay missing'}</small></td><td className="right">{row.documentCount}</td><td className="right">{row.headerCompleteCount}/{row.documentCount || '—'}<small style={{ display: 'block', color: '#64748b' }}>{pct(row.headerCoveragePct)}</small></td><td className="right">{row.lineCompleteCount}/{row.documentCount || '—'}<small style={{ display: 'block', color: '#64748b' }}>{pct(row.lineCoveragePct)}</small></td><td className="right">{row.openExceptionCount}{row.criticalExceptionCount ? <small style={{ display: 'block', color: '#b91c1c' }}>{row.criticalExceptionCount} critical</small> : null}</td><td>{row.actionRequired ? <span className="retail-reports-workbench__status-warning">{row.nextAction}</span> : <span className="retail-reports-workbench__status-ok">Ready</span>}</td></tr>)}</tbody></table></div>
      </section>
      <section className="retail-reports-workbench__section" aria-label="OCR document-kind certification matrix">
        <h3>Document-kind certification matrix <small>each declared supplier invoice, credit note, or debit note adapter path needs its own independent replay</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Adapter</th><th>Document kind</th><th>State</th><th>Assessed by</th><th>Evidence</th><th>Next action</th></tr></thead><tbody>{ocrDocumentCertificationReport.rows.map((row) => <tr key={`${row.providerId}-${row.documentKind}`}><td><strong>{row.providerCode}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.providerName}</small></td><td>{row.documentKind.replaceAll('-', ' ')}</td><td><em data-status={row.status}>{row.status.replaceAll('-', ' ')}</em></td><td>{row.testedBy ?? '—'}</td><td><small>{row.evidenceReference ?? 'No kind-level evidence'}</small></td><td>{row.actionRequired ? <span className="retail-reports-workbench__status-warning">{row.nextAction}</span> : <span className="retail-reports-workbench__status-ok">Ready</span>}</td></tr>)}</tbody></table></div>
      </section>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(ocrAdapterReadinessReport); notifyCopy('OCR Adapter Gate'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderInterBranchReadiness() {
    if (!interBranchReadinessReport.rows.length) return <p className="retail-reports-workbench__empty">No inter-branch stock movements were requested in the selected date range.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Transfers</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{interBranchReadinessReport.transferCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">In Transit</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{interBranchReadinessReport.inTransitCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Arrived</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{interBranchReadinessReport.arrivedCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">In-transit Value</span><span className="retail-reports-workbench__kpi-value">{inr.format(interBranchReadinessReport.inTransitValue)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Pending Arrival</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{interBranchReadinessReport.pendingArrivalCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Evidence Gaps</span><span className="retail-reports-workbench__kpi-value">{interBranchReadinessReport.missingEvidenceCount + interBranchReadinessReport.missingJournalCount}</span></div>
      </div>
      <section className="retail-reports-workbench__section" aria-label="Inter-branch stock movement readiness">
        <h3>Inter-branch custody readiness <small>approval, dispatch, arrival and inventory-in-transit evidence</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Transfer</th><th>Route</th><th>Status</th><th className="right">Value</th><th>Next Step</th><th className="right">Evidence Gaps</th><th className="right">Journal Gaps</th><th>Action</th></tr></thead><tbody>{interBranchReadinessReport.rows.map((row) => <tr key={row.transferId}><td><strong>{row.transferNumber}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.direction === 'return-to-ho' ? 'Return to HO' : 'Outbound'} · {row.requestedAt.slice(0, 10)}</small></td><td>{row.originBranchId} → {row.destinationBranchId}</td><td><em data-status={row.status}>{row.status}</em></td><td className="right">{inr.format(row.totalValue)}</td><td>{row.pendingNextStep}</td><td className="right">{row.missingEvidenceCount}</td><td className="right">{row.missingJournalCount}</td><td>{row.actionRequired ? <span className="retail-reports-workbench__status-warning">Advance custody</span> : <span className="retail-reports-workbench__status-ok">Evidence complete</span>}</td></tr>)}</tbody></table></div>
      </section>
      <section className="retail-reports-workbench__section" aria-label="Inter-branch evidence coverage">
        <h3>Custody evidence coverage <small>counts are record-level, not physical carrier certification</small></h3>
        <div className="retail-reports-workbench__kpis">
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Approval Evidence</span><span className="retail-reports-workbench__kpi-value">{interBranchReadinessReport.approvalEvidenceCount} / {interBranchReadinessReport.transferCount}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Dispatch Evidence</span><span className="retail-reports-workbench__kpi-value">{interBranchReadinessReport.dispatchEvidenceCount} / {interBranchReadinessReport.transferCount}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Arrival Evidence</span><span className="retail-reports-workbench__kpi-value">{interBranchReadinessReport.arrivalEvidenceCount} / {interBranchReadinessReport.arrivedCount}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Arrival Journals</span><span className="retail-reports-workbench__kpi-value">{interBranchReadinessReport.arrivalJournalCount} / {interBranchReadinessReport.arrivedCount}</span></div>
        </div>
      </section>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(interBranchReadinessReport); notifyCopy('Inter-Branch'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderProviderDeviceReadiness() {
    if (!providerDeviceReadinessReport.rows.length) return <p className="retail-reports-workbench__empty">No payment rail or counter-device readiness records are available.</p>;
    return <>
      <section className="retail-reports-workbench__section" aria-label="Retail rollout readiness">
        <h3>Retail rollout readiness <small>runtime recovery health is checked before a local go decision</small></h3>
        <div className="retail-reports-workbench__kpis">
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Rollout</span><span className={`retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--${rolloutReadinessReport.goNoGo === 'go' ? 'positive' : 'accent'}`}>{rolloutReadinessReport.goNoGo === 'go' ? 'GO' : 'HOLD'}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Ready Checks</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{rolloutReadinessReport.readyCheckCount} / {rolloutReadinessReport.checks.length}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Recovery Blockers</span><span className="retail-reports-workbench__kpi-value">{rolloutReadinessReport.blockedCheckCount}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">External Gates</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{rolloutReadinessReport.externalCertificationCheckCount}</span></div>
        </div>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Rollout check</th><th>Status</th><th>Evidence summary</th><th>Next action</th></tr></thead><tbody>{rolloutReadinessReport.checks.map((check) => <tr key={check.id}><td><strong>{check.label}</strong></td><td><em data-status={check.status}>{check.status}</em></td><td>{check.summary}</td><td>{check.status === 'ready' ? <span className="retail-reports-workbench__status-ok">Ready</span> : <span className="retail-reports-workbench__status-warning">{check.nextAction}</span>}</td></tr>)}</tbody></table></div>
        <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(rolloutReadinessReport); notifyCopy('Retail Rollout Readiness'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
      </section>
      <section className="retail-reports-workbench__section" aria-label="Retail production exit gate">
        <h3>Retail production exit gate <small>local recovery and external certification remain separate decisions</small></h3>
        <div className="retail-reports-workbench__kpis">
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Decision</span><span className={`retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--${productionExitGateReport.goNoGo === 'go' ? 'positive' : 'accent'}`}>{productionExitGateReport.goNoGo === 'go' ? 'GO' : 'HOLD'}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Ready Checks</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{productionExitGateReport.readyCheckCount} / {productionExitGateReport.checks.length}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Local Blockers</span><span className="retail-reports-workbench__kpi-value">{productionExitGateReport.blockedCheckCount}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">External Gates</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{productionExitGateReport.externalCertificationCheckCount}</span></div>
        </div>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Readiness check</th><th>Status</th><th>Evidence summary</th><th>Next action</th></tr></thead><tbody>{productionExitGateReport.checks.map((check) => <tr key={check.id}><td><strong>{check.label}</strong></td><td><em data-status={check.status}>{check.status}</em></td><td>{check.summary}</td><td>{check.status === 'ready' ? <span className="retail-reports-workbench__status-ok">Ready</span> : <span className="retail-reports-workbench__status-warning">{check.nextAction}</span>}</td></tr>)}</tbody></table></div>
        <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(productionExitGateReport); notifyCopy('Production Exit Gate'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
      </section>
      <section className="retail-reports-workbench__section" aria-label="Provider certification renewal watch">
        <h3>Certification renewal watch <small>90-day independent replay policy for production commerce, OCR, banking, payroll, statutory, and messaging evidence</small></h3>
        <div className="retail-reports-workbench__kpis">
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Current</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{certificationFreshnessReport.currentCount}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Renewal Due</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{certificationFreshnessReport.renewalDueCount}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Expired</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{certificationFreshnessReport.expiredCount}</span></div>
          <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Missing</span><span className="retail-reports-workbench__kpi-value">{certificationFreshnessReport.missingCount}</span></div>
        </div>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Provider</th><th>Capability / document</th><th>Evidence</th><th>Assessed</th><th className="right">Age</th><th>Status</th><th>Next action</th></tr></thead><tbody>{certificationFreshnessReport.rows.map((row) => <tr key={`${row.source}:${row.ownerId}:${row.capability}`}><td><strong>{row.ownerCode}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.source} · {row.ownerName}</small></td><td>{row.capability.replaceAll('-', ' ')}</td><td><small>{row.evidenceReference ?? 'No independent evidence'}</small></td><td><small>{row.assessedAt ? `${row.assessedBy ?? 'unknown'} · ${row.assessedAt.slice(0, 10)}` : 'Not assessed'}</small></td><td className="right">{row.evidenceAgeDays === undefined ? '—' : `${row.evidenceAgeDays} days`}</td><td><em data-status={row.status === 'current' ? 'ready' : row.status === 'renewal-due' ? 'attention' : 'blocked'}>{row.status.replaceAll('-', ' ')}</em></td><td>{row.status === 'current' ? <span className="retail-reports-workbench__status-ok">Current</span> : <span className="retail-reports-workbench__status-warning">{row.nextAction}</span>}</td></tr>)}{certificationFreshnessReport.rows.length === 0 ? <tr><td colSpan={7} className="retail-reports-workbench__empty">No production provider or API OCR capability is configured yet. External certification remains a release gate when one is added.</td></tr> : null}</tbody></table></div>
        <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(certificationFreshnessReport); notifyCopy('Certification Renewal Watch'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
      </section>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Rails &amp; Devices</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{providerDeviceReadinessReport.total}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Ready</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{providerDeviceReadinessReport.ready}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">External Gates</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{providerDeviceReadinessReport.external}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Blocked</span><span className="retail-reports-workbench__kpi-value">{providerDeviceReadinessReport.blocked}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Evidence References</span><span className="retail-reports-workbench__kpi-value">{providerDeviceReadinessReport.evidenceCount}</span></div>
      </div>
      <section className="retail-reports-workbench__section" aria-label="Retail payment rail and device certification readiness">
        <h3>Payment rails &amp; counter devices <small>external certification stays explicit; local references never imply settlement</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Capability</th><th>Status</th><th>Next Action</th><th className="right">Blockers</th><th className="right">Evidence</th><th>Readiness Detail</th><th>Control</th></tr></thead><tbody>{providerDeviceReadinessReport.rows.map((row) => <tr key={row.kind}><td><strong>{row.label}</strong></td><td><em data-status={row.status}>{row.status}</em></td><td>{row.nextAction}</td><td className="right">{row.blockerCount}</td><td className="right">{row.evidenceCount}</td><td><small>{row.detail}</small></td><td>{row.actionRequired ? <span className="retail-reports-workbench__status-warning">Gate open</span> : <span className="retail-reports-workbench__status-ok">Certified / ready</span>}</td></tr>)}</tbody></table></div>
      </section>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(providerDeviceReadinessReport); notifyCopy('Rails & Devices'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderMarketplaceProductionReadiness() {
    if (!marketplaceProductionReadinessReport.rows.length) return <p className="retail-reports-workbench__empty">No marketplace, ONDC, or website connectors are configured for the selected scope.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Connectors</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{marketplaceProductionReadinessReport.connectorCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Production Ready</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{marketplaceProductionReadinessReport.productionReadyCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Sync Blockers</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{marketplaceProductionReadinessReport.syncPendingCount + marketplaceProductionReadinessReport.syncFailureCount + marketplaceProductionReadinessReport.syncExceptionCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Order Gaps</span><span className="retail-reports-workbench__kpi-value">{marketplaceProductionReadinessReport.orderHandoffGapCount + marketplaceProductionReadinessReport.returnEvidenceGapCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Settlement Variance</span><span className="retail-reports-workbench__kpi-value">{inr.format(marketplaceProductionReadinessReport.settlementVarianceExposure)}</span></div>
      </div>
      <section className="retail-reports-workbench__section" aria-label="Marketplace and ONDC production certification readiness">
        <h3>Marketplace / ONDC production gate <small>provider conformance, sync, order handoff, and settlement evidence</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Connector</th><th>Channel</th><th>Provider State</th><th className="right">Conformance</th><th className="right">Sync Blockers</th><th className="right">Order Gaps</th><th className="right">Settlements</th><th className="right">Variance</th><th>Next Action</th></tr></thead><tbody>{marketplaceProductionReadinessReport.rows.map((row) => <tr key={row.connectorId}><td><strong>{row.connectorCode}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.connectorName} · {row.environment}</small></td><td>{row.channel}</td><td><em data-status={row.providerState}>{row.providerState}</em></td><td className="right">{pct(row.conformanceCoveragePct)}<small style={{ display: 'block', color: '#64748b' }}>{row.passedConformanceCaseCount}/{row.requiredCapabilityCount} valid</small></td><td className="right">{row.syncBlockerCount}</td><td className="right">{row.orderHandoffGapCount + row.returnEvidenceGapCount}</td><td className="right">{row.settlementReadyCount}/{row.settlementCount}</td><td className="right accent">{inr.format(row.settlementVarianceExposure)}</td><td>{row.actionRequired ? <span className="retail-reports-workbench__status-warning">{row.nextAction}</span> : <span className="retail-reports-workbench__status-ok">Ready</span>}</td></tr>)}</tbody></table></div>
      </section>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(marketplaceProductionReadinessReport); notifyCopy('Marketplace Gate'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderOndcProductionReadiness() {
    if (!ondcProductionReadinessReport.rows.length) return <p className="retail-reports-workbench__empty">No ONDC connectors are configured for the selected scope.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">ONDC Connectors</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{ondcProductionReadinessReport.connectorCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Production Ready</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{ondcProductionReadinessReport.productionReadyCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Conformance Gates</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{ondcProductionReadinessReport.externalCertificationGates}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Push Acknowledgements</span><span className="retail-reports-workbench__kpi-value">{ondcProductionReadinessReport.pushAcknowledgedCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Order Handoff Gaps</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{ondcProductionReadinessReport.orderHandoffGapCount + ondcProductionReadinessReport.returnEvidenceGapCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Settlement Variance</span><span className="retail-reports-workbench__kpi-value">{inr.format(ondcProductionReadinessReport.settlementVarianceExposure)}</span></div>
      </div>
      <section className="retail-reports-workbench__section" aria-label="ONDC production conformance and settlement readiness">
        <h3>ONDC production gate <small>capability scenarios, push/sync evidence, order handoff, and settlement closure</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Connector</th><th>State</th><th className="right">Capabilities</th><th className="right">Scenario Gaps</th><th className="right">Push Gaps</th><th className="right">Sync Gaps</th><th className="right">Order Gaps</th><th className="right">Settlements</th><th className="right">Variance</th><th>Next Action</th></tr></thead><tbody>{ondcProductionReadinessReport.rows.map((row) => <tr key={row.connectorId}><td><strong>{row.connectorCode}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.connectorName} · {row.environment}</small></td><td><em data-status={row.providerState}>{row.providerState}</em></td><td className="right">{row.declaredCapabilityCount}/{row.requiredCapabilityCount}</td><td className="right">{row.capabilityEvidenceGapCount}</td><td className="right">{row.pushAcknowledgementGapCount}</td><td className="right">{row.syncEvidenceGapCount}</td><td className="right">{row.orderHandoffGapCount + row.returnEvidenceGapCount}</td><td className="right">{row.settlementReadyCount}/{row.settlementCount}</td><td className="right accent">{inr.format(row.settlementVarianceExposure)}</td><td>{row.actionRequired ? <span className="retail-reports-workbench__status-warning">{row.nextAction}</span> : <span className="retail-reports-workbench__status-ok">Ready</span>}</td></tr>)}</tbody></table></div>
      </section>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(ondcProductionReadinessReport); notifyCopy('ONDC Gate'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderReportDeliveryReadiness() {
    if (!reportDeliveryReadinessReport.rows.length) return <p className="retail-reports-workbench__empty">No scheduled report delivery plans are configured for the selected period.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Plans</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--blue">{reportDeliveryReadinessReport.planCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Approved</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{reportDeliveryReadinessReport.approvedPlanCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Consent Gaps</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{reportDeliveryReadinessReport.consentGapCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Acknowledged</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{reportDeliveryReadinessReport.acknowledgedAttemptCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Failed Attempts</span><span className="retail-reports-workbench__kpi-value">{reportDeliveryReadinessReport.failedAttemptCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Provider Gates</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{reportDeliveryReadinessReport.externalCertificationGates}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Provider Bound</span><span className="retail-reports-workbench__kpi-value">{reportDeliveryReadinessReport.providerBoundPlanCount} / {reportDeliveryReadinessReport.planCount}</span></div>
      </div>
      <section className="retail-reports-workbench__section" aria-label="Scheduled report delivery readiness">
        <h3>Governed scheduled delivery <small>consent, approval, India-time handoff, idempotency, and provider evidence</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Plan</th><th>Report Pack</th><th>Channel</th><th>Messaging Provider</th><th>Status</th><th className="right">Recipients</th><th className="right">Attempts</th><th className="right">Acknowledged</th><th className="right">Consent Gaps</th><th>Next Action</th></tr></thead><tbody>{reportDeliveryReadinessReport.rows.map((row) => <tr key={row.planId}><td><strong>{row.planNumber}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.frequency}</small></td><td>{row.reportPackId}</td><td>{row.channel}</td><td>{row.providerCode ?? 'Unbound'}<small style={{ display: 'block', color: '#64748b' }}>{row.providerCapabilityReady ? 'certified capability' : 'provider gate open'}</small></td><td><em data-status={row.providerState}>{row.providerState}</em><small style={{ display: 'block', color: '#64748b' }}>{row.status}</small></td><td className="right">{row.recipientCount}</td><td className="right">{row.attemptCount}</td><td className="right positive">{row.acknowledgedAttemptCount}</td><td className="right">{row.consentGapCount}</td><td>{row.actionRequired ? <span className="retail-reports-workbench__status-warning">{row.nextAction}</span> : <span className="retail-reports-workbench__status-ok">Ready</span>}</td></tr>)}</tbody></table></div>
      </section>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(reportDeliveryReadinessReport); notifyCopy('Scheduled Delivery'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  function renderCreditUtilization() {
    if (!creditReport.rows.length) return <p className="retail-reports-workbench__empty">No approved customer credit limits are available for this operating scope.</p>;
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Approved Limits</span><span className="retail-reports-workbench__kpi-value">{inr.format(creditReport.approvedLimitTotal)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Open Exposure</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{inr.format(creditReport.exposureTotal)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Headroom</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{inr.format(creditReport.availableHeadroomTotal)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Credit Holds</span><span className="retail-reports-workbench__kpi-value">{creditReport.holdCount}</span></div>
      </div>
      <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Customer Account</th><th>Risk</th><th>Status</th><th className="right">Limit</th><th className="right">Exposure</th><th className="right">Headroom</th><th className="right">Utilization</th><th className="right">Overdue</th></tr></thead><tbody>{creditReport.rows.map((row) => <tr key={row.accountId}><td><strong>{row.accountName}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.controlNumber} · {row.openReceivableCount} open receivable{row.openReceivableCount === 1 ? '' : 's'}</small></td><td>{row.riskGrade}</td><td><em data-status={row.status}>{row.status}</em></td><td className="right">{inr.format(row.creditLimit)}</td><td className="right">{inr.format(row.exposure)}</td><td className="right positive">{inr.format(row.availableHeadroom)}</td><td className="right accent">{pct(row.utilizationPct)}</td><td className="right">{inr.format(row.overdueAmount)}</td></tr>)}</tbody></table></div>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson(creditReport); notifyCopy('Credit Utilization'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function renderExpiryRacks() {
    return <>
      <div className="retail-reports-workbench__kpis">
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Near-expiry Batches</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--accent">{expiryReport.nearExpiryBatchCount}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Expired Units</span><span className="retail-reports-workbench__kpi-value">{expiryReport.expiredQuantity}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">At-risk Inventory</span><span className="retail-reports-workbench__kpi-value retail-reports-workbench__kpi-value--positive">{inr.format(expiryReport.atRiskValue)}</span></div>
        <div className="retail-reports-workbench__kpi-card"><span className="retail-reports-workbench__kpi-label">Blocked / Over-capacity Bins</span><span className="retail-reports-workbench__kpi-value">{rackReport.blockedBins} / {rackReport.overCapacityBins}</span></div>
      </div>
      <section className="retail-reports-workbench__section" aria-label="Batch expiry risk">
        <h3>Batch expiry risk <small>FEFO-ready evidence from batch and bin balances</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Batch</th><th>SKU / Item</th><th>Warehouse / Bin</th><th>Expiry</th><th className="right">Days</th><th>Status</th><th className="right">Available</th><th className="right">Value</th></tr></thead><tbody>
          {expiryReport.rows.map((row) => <tr key={`${row.batchId}:${row.warehouseName}:${row.binCode}`}>
            <td><strong>{row.batchNumber}</strong></td><td>{row.sku}<small style={{ display: 'block', color: '#64748b' }}>{row.itemName}</small></td>
            <td>{row.warehouseName}<small style={{ display: 'block', color: '#64748b' }}>{row.zoneName} · {row.binCode}</small></td>
            <td>{row.expiresAt ?? 'No expiry'}</td><td className="right">{row.daysToExpiry ?? '—'}</td><td><em data-status={row.status}>{row.status}</em></td><td className="right">{row.available}</td><td className="right">{inr.format(row.inventoryValue)}</td>
          </tr>)}
          {expiryReport.rows.length === 0 && <tr><td colSpan={8} className="retail-reports-workbench__empty">No batch evidence is available in this scope.</td></tr>}
        </tbody></table></div>
      </section>
      <section className="retail-reports-workbench__section" aria-label="Rack and bin readiness">
        <h3>Rack &amp; bin readiness <small>capacity, blocking and putaway signals</small></h3>
        <div className="retail-reports-workbench__table-wrapper"><table className="retail-reports-workbench__table"><thead><tr><th>Warehouse / Zone</th><th>Bin</th><th>Purpose</th><th className="right">Occupied</th><th className="right">Capacity</th><th>Utilization</th><th className="right">SKUs</th><th>Status</th></tr></thead><tbody>
          {rackReport.rows.map((row) => <tr key={row.binId}>
            <td>{row.warehouseName}<small style={{ display: 'block', color: '#64748b' }}>{row.zoneName}</small></td><td><strong>{row.binCode}</strong><small style={{ display: 'block', color: '#64748b' }}>{row.binName}</small></td><td>{row.zonePurpose}</td>
            <td className="right">{row.occupied}</td><td className="right">{row.capacity}</td><td><div className="sell-through-bar"><div className="sell-through-bar__track"><div className="sell-through-bar__fill" style={{ width: `${Math.min(row.utilizationPct, 100)}%` }} /></div><span className="sell-through-bar__label">{pct(row.utilizationPct)}</span></div></td><td className="right">{row.itemCount}</td><td><em data-status={row.readiness}>{row.readiness}</em></td>
          </tr>)}
          {rackReport.rows.length === 0 && <tr><td colSpan={8} className="retail-reports-workbench__empty">No warehouse bins are configured in this scope.</td></tr>}
        </tbody></table></div>
      </section>
      <div className="retail-reports-workbench__export-bar"><button type="button" className="retail-reports-workbench__export-btn" onClick={() => { copyJson({ expiry: expiryReport, racks: rackReport }); notifyCopy('Expiry & Racks'); }}><ClipboardCopy size={12} /> Copy JSON</button></div>
    </>;
  }

  return (
    <div className="retail-reports-workbench">
      {/* Header */}
      <div className="retail-reports-workbench__header">
        <h2>
          <BarChart3 size={18} aria-hidden="true" />
          Retail Reports &amp; Analytics
          <small>· Read-only governed projections from checkout evidence</small>
        </h2>
        <span style={{ fontSize: '0.65rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Award size={11} /> Phase R6
        </span>
      </div>

      {/* Controls */}
      <div className="retail-reports-workbench__controls">
        <label>
          From
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} max={today()} />
        </label>
        {(activeTab === 'x-report' || activeTab === 'z-report') && (
          <label>
            Cashier Shift
            <select value={activeShiftId} onChange={(e) => setSelectedShiftId(e.target.value)}>
              {completedShifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number} · {s.counterId} · {s.status}
                </option>
              ))}
              {completedShifts.length === 0 && <option value="">No shifts available</option>}
            </select>
          </label>
        )}
        {activeTab === 'counter' && (
          <label>
            Counter
            <select value={activeCounterId} onChange={(e) => setSelectedCounterId(e.target.value)}>
              {counters.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
              {counters.length === 0 && <option value="">No counters available</option>}
            </select>
          </label>
        )}
        <button
          type="button"
          className="retail-reports-workbench__generate-btn"
          onClick={() => setCopiedNotice('')}
        >
          <RefreshCw size={13} /> Refresh
        </button>
        <button
          type="button"
          className="retail-reports-workbench__export-btn"
          onClick={() => {
            const allData = { xReport, zReport, counterReport, categoryReport, tenderReport, gstReport, skuReport, campaignReport, visitConversionReport, exchangeCreditNoteReport, ocrReadinessReport, ocrAdapterReadinessReport, ocrDocumentCertificationReport, interBranchReadinessReport, storeExecutionReadinessReport, providerDeviceReadinessReport, certificationFreshnessReport, productionExitGateReport, rolloutReadinessReport, marketplaceProductionReadinessReport, ondcProductionReadinessReport, reportDeliveryReadinessReport, payoutRailReadinessReport, electronicPayoutRailEvidenceReport, channelSettlementReport, payoutReport, payoutReadinessReport, creditReport, expiryReport, rackReport };
            copyJson(allData);
            notifyCopy('All Reports');
          }}
        >
          <FileDown size={13} /> Export All
        </button>
      </div>

      {/* Tab bar */}
      <div className="retail-reports-workbench__tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`retail-reports-workbench__tab ${activeTab === tab.id ? 'retail-reports-workbench__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="retail-reports-workbench__content" role="tabpanel">
        {copiedNotice && (
          <div className="retail-reports-workbench__notice">✓ {copiedNotice}</div>
        )}

        {activeTab === 'x-report' && renderXZShared(xReport, false)}
        {activeTab === 'z-report' && renderXZShared(zReport, true)}
        {activeTab === 'counter' && renderCounterSummary()}
        {activeTab === 'category' && renderCategorySales()}
        {activeTab === 'tender' && renderTenderBreakdown()}
        {activeTab === 'gst' && renderGstSummary()}
        {activeTab === 'sku' && renderSkuMargin()}
        {activeTab === 'campaigns' && renderCampaignUsage()}
        {activeTab === 'visits' && renderVisitConversion()}
        {activeTab === 'returns' && renderExchangeCreditNotes()}
        {activeTab === 'ocr' && renderOcrReadiness()}
        {activeTab === 'ocr-adapter' && renderOcrAdapterReadiness()}
        {activeTab === 'inter-branch' && renderInterBranchReadiness()}
        {activeTab === 'devices' && renderProviderDeviceReadiness()}
        {activeTab === 'marketplace-gate' && renderMarketplaceProductionReadiness()}
        {activeTab === 'ondc-gate' && renderOndcProductionReadiness()}
        {activeTab === 'scheduled-delivery' && renderReportDeliveryReadiness()}
        {activeTab === 'payout-rails' && renderPayoutRails()}
        {activeTab === 'settlements' && renderChannelSettlements()}
        {activeTab === 'payouts' && renderPayouts()}
        {activeTab === 'credit' && renderCreditUtilization()}
        {activeTab === 'expiry-racks' && renderExpiryRacks()}
        {activeTab === 'system-audit' && <SystemCertificationPanel exitGate={productionExitGateReport} rolloutReadiness={rolloutReadinessReport} certificationFreshness={certificationFreshnessReport} />}
      </div>
    </div>
  );
}
