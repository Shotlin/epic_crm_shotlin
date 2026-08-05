/**
 * loss-prevention.test.ts
 *
 * Unit tests for Loss Prevention & Anomaly Audit Engine.
 * Uses createInitialRevenueOpsState() as the base to satisfy all required fields,
 * then spreads targeted overrides for the data under test.
 */

import { describe, it, expect } from 'vitest';
import { scanLossPreventionAnomalies } from './loss-prevention';
import { createInitialRevenueOpsState } from './revenue-ops';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { RetailCashierShift, RetailSale } from '../shared/retail-pos-contracts';

const shiftWithVariance: RetailCashierShift = {
  id: 'shift-99',
  number: 'SHF-099',
  counterId: 'cntr-1',
  cashierId: 'cashier-101',
  status: 'close-requested',
  openingCash: 500,
  declaredCash: 1200,
  variance: -850, // ₹850 discrepancy — exceeds default ₹500 threshold
  openedAt: '2025-01-01T00:00:00Z',
  version: 1,
};

const saleWithHighDiscount: RetailSale = {
  id: 'sale-99',
  number: 'RET-099',
  counterId: 'cntr-1',
  cashierShiftId: 'shift-99',
  cashierId: 'cashier-101',
  customerAccountId: 'acc-99',
  transactionKey: 'key-99',
  requestChecksum: 'chk-99',
  saleAt: '2025-01-01T12:00:00Z',
  invoiceId: 'inv-99',
  paymentReceiptIds: [],
  lines: [],
  subtotal: 10000,
  discountTotal: 3000, // 30% — exceeds default 20% threshold
  taxPreview: {
    treatment: 'intra-state',
    taxableValue: 7000,
    cgst: 630,
    sgst: 630,
    igst: 0,
    cess: 0,
    totalTax: 1260,
    grandTotal: 8260,
    determination: 'commercial-estimate',
  },
  tenders: [],
  costTotal: 6000,
  status: 'completed',
  version: 1,
};

function mockState(): RevenueOpsState {
  const base = createInitialRevenueOpsState();
  return {
    ...base,
    retailCashierShifts: [shiftWithVariance],
    retailSales: [saleWithHighDiscount],
  };
}

describe('loss-prevention domain', () => {
  it('scans and flags cashier cash variance anomalies', () => {
    const report = scanLossPreventionAnomalies(mockState());

    expect(report.totalAnomaliesCount).toBe(2); // 1 cash variance + 1 excessive discount
    expect(report.highRiskCount).toBeGreaterThan(0);
    expect(report.cashierRiskScores['cashier-101']).toBeGreaterThanOrEqual(30);

    const varianceAnomaly = report.anomalies.find((a) => a.kind === 'cashier-cash-variance');
    expect(varianceAnomaly?.amount).toBe(850);
  });

  it('flags a sale whose post-discount margin falls below the protected floor', () => {
    const report = scanLossPreventionAnomalies({
      ...mockState(),
      retailSales: [{ ...saleWithHighDiscount, id: 'sale-loss', number: 'RET-LOSS', costTotal: 8000 }],
      retailCashierShifts: [],
    });

    const anomaly = report.anomalies.find((item) => item.kind === 'margin-erosion');
    expect(anomaly?.severity).toBe('critical');
    expect(anomaly?.amount).toBe(1700);
    expect(anomaly?.summary).toContain('-14.29% gross margin');
  });
});
