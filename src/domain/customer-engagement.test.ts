/**
 * customer-engagement.test.ts
 *
 * Unit tests for Customer LTV & WhatsApp Engagement Engine.
 * Uses createInitialRevenueOpsState() as the base to satisfy all required fields,
 * then spreads targeted overrides for the data under test.
 */

import { describe, it, expect } from 'vitest';
import {
  computeCustomerLtv,
  generateWhatsAppCampaignTrigger,
} from './customer-engagement';
import { createInitialRevenueOpsState } from './revenue-ops';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { RetailSale } from '../shared/retail-pos-contracts';

// A completed sale for customer cust-100, dated mid-2024 (lapsed > 120 days as of 2025-01-01)
const lapsedSale: RetailSale = {
  id: 'sale-e1',
  number: 'RET-E01',
  counterId: 'cntr-1',
  cashierShiftId: 'shift-1',
  cashierId: 'user-1',
  customerAccountId: 'cust-100',
  transactionKey: 'key-e1',
  requestChecksum: 'chk-e1',
  saleAt: '2024-06-01T10:00:00Z', // ~214 days before 2025-01-01 -> lapsed
  invoiceId: 'inv-e1',
  paymentReceiptIds: [],
  lines: [],
  subtotal: 5000,
  discountTotal: 0,
  taxPreview: {
    treatment: 'intra-state',
    taxableValue: 5000,
    cgst: 450,
    sgst: 450,
    igst: 0,
    cess: 0,
    totalTax: 900,
    grandTotal: 5900,
    determination: 'commercial-estimate',
  },
  tenders: [],
  costTotal: 3500,
  status: 'completed',
  version: 1,
};

function mockState(): RevenueOpsState {
  const base = createInitialRevenueOpsState();
  return {
    ...base,
    retailSales: [lapsedSale],
  };
}

describe('customer-engagement domain', () => {
  it('computes LTV and identifies lapsed customer churn risk', () => {
    const ltv = computeCustomerLtv('cust-100', 'Amit Sharma', mockState(), '2025-01-01');

    expect(ltv.lifetimeRevenue).toBe(5900);
    expect(ltv.totalOrdersCount).toBe(1);
    expect(ltv.daysSinceLastPurchase).toBeGreaterThan(180);
    expect(ltv.churnRiskCategory).toBe('lapsed');
    expect(ltv.recommendedEngagementAction).toBe('send-winback-voucher');
  });

  it('generates WhatsApp win-back trigger for lapsed customer with opt-in consent', () => {
    const ltv = computeCustomerLtv('cust-100', 'Amit Sharma', mockState(), '2025-01-01');
    const trigger = generateWhatsAppCampaignTrigger(ltv, true);

    expect(trigger).not.toBeNull();
    expect(trigger?.campaignType).toBe('winback-offer');
    expect(trigger?.canSend).toBe(true);
    expect(trigger?.proposedVoucherCode).toContain('WINBACK15');
  });

  it('blocks sending when opt-in consent is missing', () => {
    const ltv = computeCustomerLtv('cust-100', 'Amit Sharma', mockState(), '2025-01-01');
    const trigger = generateWhatsAppCampaignTrigger(ltv, false);

    expect(trigger?.canSend).toBe(false);
    expect(trigger?.hasOptInConsent).toBe(false);
  });
});
