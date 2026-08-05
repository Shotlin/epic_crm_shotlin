/**
 * loss-prevention.ts
 *
 * Pillar 4 – Loss Prevention, Fraud & Anomaly Audit Engine
 *
 * Scans retail transactions to flag suspicious refund frequencies, excessive manual discounts,
 * cashier cash variances, and negative stock override attempts.
 *
 * Contract-aligned to retail-pos-contracts.ts:
 * - RetailCashierShift.variance (not varianceAmount)
 * - RetailCashierShiftStatus: 'open' | 'close-requested' | 'closed'
 * - RetailSale.saleAt (not createdAt); grandTotal is sale.taxPreview.grandTotal
 * - RetailReturn has no returnGrandTotal; total comes from financialCredit.issuedAmount
 */

import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

export type LossPreventionEvidence = Pick<RevenueOpsState, 'retailCashierShifts' | 'retailSales' | 'retailReturns'>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type LossAnomalyKind =
  | 'suspicious-refund-frequency'
  | 'excessive-manual-discount'
  | 'margin-erosion'
  | 'cashier-cash-variance'
  | 'negative-stock-attempt'
  | 'repeated-cart-voids';

export interface LossPreventionAnomaly {
  id: string;
  kind: LossAnomalyKind;
  severity: 'low' | 'medium' | 'high' | 'critical';
  counterId?: string;
  cashierId: string;
  customerAccountId?: string;
  amount: number;
  detectedAt: string;
  summary: string;
  evidenceReference: string;
  status: 'open-review' | 'acknowledged' | 'escalated' | 'resolved';
}

export interface LossPreventionReport {
  generatedAt: string;
  totalAnomaliesCount: number;
  highRiskCount: number;
  totalFinancialExposure: number;
  anomalies: LossPreventionAnomaly[];
  cashierRiskScores: Record<string, number>; // cashierId -> risk score 0-100
}

/**
 * Scans RevenueOps state to detect retail loss prevention anomalies.
 *
 * Key contract facts:
 * - shift.variance is the optional cash variance (number | undefined); no varianceAmount field exists
 * - shift.status is 'open' | 'close-requested' | 'closed'; 'variance-review-required' does not exist
 * - sale.saleAt is the sale timestamp; createdAt does not exist on RetailSale
 * - sale.taxPreview.grandTotal is the grand total; no top-level grandTotal on RetailSale
 * - return.financialCredit?.issuedAmount is the approved return credit value; no returnGrandTotal
 */
export function scanLossPreventionAnomalies(
  revenue: LossPreventionEvidence,
  manualDiscountThresholdPct = 20,
  cashVarianceThresholdAmount = 500,
  marginFloorPct = 10,
): LossPreventionReport {
  const anomalies: LossPreventionAnomaly[] = [];

  // 1. Scan Cashier Shifts for Cash Variances > Threshold
  // shift.variance is defined as optional number (positive = surplus, negative = shortage)
  (revenue.retailCashierShifts ?? []).forEach((shift) => {
    const variance = shift.variance ?? 0;
    if (Math.abs(variance) >= cashVarianceThresholdAmount) {
      anomalies.push({
        id: `loss-var-${shift.id}`,
        kind: 'cashier-cash-variance',
        severity: Math.abs(variance) > 2000 ? 'critical' : 'high',
        counterId: shift.counterId,
        cashierId: shift.cashierId,
        amount: round2(Math.abs(variance)),
        detectedAt: shift.closedAt ?? shift.openedAt,
        summary: `Cashier shift ${shift.number} closed with ₹${Math.abs(variance)} drawer variance.`,
        evidenceReference: shift.id,
        status: 'open-review',
      });
    }
  });

  // 2. Scan Sales for Excessive Manual Discount Overrides
  // sale.discountTotal and sale.subtotal are top-level; sale.saleAt is the timestamp
  (revenue.retailSales ?? []).forEach((sale) => {
    if (sale.subtotal > 0 && sale.discountTotal > 0) {
      const discountPct = (sale.discountTotal / sale.subtotal) * 100;
      if (discountPct >= manualDiscountThresholdPct) {
        anomalies.push({
          id: `loss-disc-${sale.id}`,
          kind: 'excessive-manual-discount',
          severity: discountPct > 40 ? 'critical' : 'medium',
          counterId: sale.counterId,
          cashierId: sale.cashierId,
          customerAccountId: sale.customerAccountId,
          amount: round2(sale.discountTotal),
          detectedAt: sale.saleAt,
          summary: `Sale ${sale.number} applied a ${round2(discountPct)}% concession discount (₹${sale.discountTotal}).`,
          evidenceReference: sale.id,
          status: 'open-review',
        });
      }
    }

    // A sale can be below the manual-discount threshold and still destroy
    // contribution margin when cost or markdown evidence is high.
    const netMerchandiseValue = round2(Math.max(0, sale.subtotal - sale.discountTotal));
    if (netMerchandiseValue > 0 && sale.costTotal >= 0) {
      const grossMargin = round2(netMerchandiseValue - sale.costTotal);
      const marginPct = round2((grossMargin / netMerchandiseValue) * 100);
      if (marginPct < marginFloorPct) {
        const floorContribution = round2(netMerchandiseValue * (marginFloorPct / 100));
        const exposure = round2(Math.max(0, floorContribution - grossMargin));
        anomalies.push({
          id: `loss-margin-${sale.id}`,
          kind: 'margin-erosion',
          severity: marginPct < 0 ? 'critical' : marginPct < marginFloorPct / 2 ? 'high' : 'medium',
          counterId: sale.counterId,
          cashierId: sale.cashierId,
          customerAccountId: sale.customerAccountId,
          amount: exposure,
          detectedAt: sale.saleAt,
          summary: `Sale ${sale.number} closed at ${marginPct}% gross margin after discount (floor ${marginFloorPct}%).`,
          evidenceReference: sale.id,
          status: 'open-review',
        });
      }
    }
  });

  // 3. Scan Returns for Suspicious High-Frequency Refunds
  // RetailReturn.financialCredit?.issuedAmount is the approved credit value
  const customerReturnMap = new Map<string, typeof revenue.retailReturns>();
  (revenue.retailReturns ?? []).forEach((ret) => {
    const list = customerReturnMap.get(ret.customerAccountId) ?? [];
    list.push(ret);
    customerReturnMap.set(ret.customerAccountId, list);
  });

  customerReturnMap.forEach((returnsList, customerId) => {
    if (returnsList.length >= 3) {
      const totalRefunded = round2(
        returnsList.reduce((sum, r) => sum + (r.financialCredit?.issuedAmount ?? 0), 0),
      );
      anomalies.push({
        id: `loss-ret-cust-${customerId}`,
        kind: 'suspicious-refund-frequency',
        severity: totalRefunded > 10000 ? 'critical' : 'high',
        cashierId: returnsList[0]?.requestedBy ?? 'cashier-main',
        customerAccountId: customerId,
        amount: totalRefunded,
        detectedAt: returnsList[0]?.requestedAt ?? new Date().toISOString(),
        summary: `Customer ${customerId} filed ${returnsList.length} returns totaling ₹${totalRefunded}.`,
        evidenceReference: returnsList.map((r) => r.number).join(', '),
        status: 'open-review',
      });
    }
  });

  const highRiskCount = anomalies.filter((a) => a.severity === 'high' || a.severity === 'critical').length;
  const totalFinancialExposure = round2(anomalies.reduce((sum, a) => sum + a.amount, 0));

  // Compute Cashier Risk Scores (0-100)
  const cashierRiskScores: Record<string, number> = {};
  anomalies.forEach((a) => {
    const current = cashierRiskScores[a.cashierId] ?? 0;
    const add = a.severity === 'critical' ? 35 : a.severity === 'high' ? 20 : 10;
    cashierRiskScores[a.cashierId] = Math.min(100, current + add);
  });

  return {
    generatedAt: new Date().toISOString(),
    totalAnomaliesCount: anomalies.length,
    highRiskCount,
    totalFinancialExposure,
    anomalies,
    cashierRiskScores,
  };
}
