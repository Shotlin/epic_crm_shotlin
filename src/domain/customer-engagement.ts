/**
 * customer-engagement.ts
 *
 * Pillar 5 – Customer Lifetime Value (LTV) & Consent-Governed WhatsApp Engagement Engine
 *
 * Calculates customer LTV, RFM (Recency, Frequency, Monetary) metrics, churn risk scores,
 * and generates personalized voucher triggers for consent-governed WhatsApp campaigns.
 */

import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CustomerLtvMetrics {
  customerAccountId: string;
  customerName: string;
  lifetimeRevenue: number; // Monetary
  totalOrdersCount: number; // Frequency
  averageOrderValue: number;
  firstOrderDate: string;
  lastOrderDate: string;
  daysSinceLastPurchase: number; // Recency
  churnRiskCategory: 'low-risk' | 'moderate-risk' | 'high-churn-risk' | 'lapsed';
  recommendedEngagementAction: 'send-vip-reward' | 'send-winback-voucher' | 'send-reengagement-msg' | 'maintain-regular';
}

export interface WhatsAppCampaignTrigger {
  triggerId: string;
  customerAccountId: string;
  campaignType: 'winback-offer' | 'vip-tier-welcome' | 'dormant-reminder' | 'post-purchase-thanks';
  proposedVoucherCode: string;
  discountValue: number;
  discountType: 'fixed-inr' | 'percentage';
  messageTemplate: string;
  hasOptInConsent: boolean;
  canSend: boolean;
}

/**
 * Computes Customer LTV & RFM metrics from sales records.
 */
export function computeCustomerLtv(
  customerAccountId: string,
  customerName: string,
  revenue: RevenueOpsState,
  asOfDate = new Date().toISOString().slice(0, 10),
): CustomerLtvMetrics {
  const sales = (revenue.retailSales ?? []).filter(
    (s) => s.customerAccountId === customerAccountId && s.status === 'completed',
  );

  if (sales.length === 0) {
    return {
      customerAccountId,
      customerName,
      lifetimeRevenue: 0,
      totalOrdersCount: 0,
      averageOrderValue: 0,
      firstOrderDate: asOfDate,
      lastOrderDate: asOfDate,
      daysSinceLastPurchase: 0,
      churnRiskCategory: 'low-risk',
      recommendedEngagementAction: 'maintain-regular',
    };
  }

  const sortedSales = [...sales].sort((a, b) => a.saleAt.localeCompare(b.saleAt));
  const firstOrderDate = sortedSales[0]!.saleAt.slice(0, 10);
  const lastOrderDate = sortedSales[sortedSales.length - 1]!.saleAt.slice(0, 10);

  const lifetimeRevenue = round2(sales.reduce((sum, s) => sum + s.taxPreview.grandTotal, 0));
  const totalOrdersCount = sales.length;
  const averageOrderValue = round2(lifetimeRevenue / totalOrdersCount);

  const asOfTime = new Date(asOfDate).getTime();
  const lastOrderTime = new Date(lastOrderDate).getTime();
  const daysSinceLastPurchase = Math.max(0, Math.floor((asOfTime - lastOrderTime) / (1000 * 60 * 60 * 24)));

  let churnRiskCategory: CustomerLtvMetrics['churnRiskCategory'] = 'low-risk';
  let recommendedEngagementAction: CustomerLtvMetrics['recommendedEngagementAction'] = 'maintain-regular';

  if (daysSinceLastPurchase > 120) {
    churnRiskCategory = 'lapsed';
    recommendedEngagementAction = 'send-winback-voucher';
  } else if (daysSinceLastPurchase > 60) {
    churnRiskCategory = 'high-churn-risk';
    recommendedEngagementAction = 'send-winback-voucher';
  } else if (daysSinceLastPurchase > 30) {
    churnRiskCategory = 'moderate-risk';
    recommendedEngagementAction = 'send-reengagement-msg';
  } else if (lifetimeRevenue > 50000) {
    recommendedEngagementAction = 'send-vip-reward';
  }

  return {
    customerAccountId,
    customerName,
    lifetimeRevenue,
    totalOrdersCount,
    averageOrderValue,
    firstOrderDate,
    lastOrderDate,
    daysSinceLastPurchase,
    churnRiskCategory,
    recommendedEngagementAction,
  };
}

/**
 * Generates consent-governed WhatsApp campaign triggers for churn prevention or VIP rewards.
 */
export function generateWhatsAppCampaignTrigger(
  ltv: CustomerLtvMetrics,
  hasOptInConsent = true,
): WhatsAppCampaignTrigger | null {
  if (!hasOptInConsent) {
    return {
      triggerId: `trig-${ltv.customerAccountId}`,
      customerAccountId: ltv.customerAccountId,
      campaignType: 'winback-offer',
      proposedVoucherCode: `WINBACK-${ltv.customerAccountId.slice(-4).toUpperCase()}`,
      discountValue: 15,
      discountType: 'percentage',
      messageTemplate: `We miss you! Enjoy 15% off your next purchase.`,
      hasOptInConsent: false,
      canSend: false,
    };
  }

  if (ltv.recommendedEngagementAction === 'send-winback-voucher') {
    return {
      triggerId: `trig-${ltv.customerAccountId}`,
      customerAccountId: ltv.customerAccountId,
      campaignType: 'winback-offer',
      proposedVoucherCode: `WINBACK15-${ltv.customerAccountId.slice(-4).toUpperCase()}`,
      discountValue: 15,
      discountType: 'percentage',
      messageTemplate: `Hi ${ltv.customerName}! We miss seeing you. Here is an exclusive 15% discount voucher on your next visit!`,
      hasOptInConsent: true,
      canSend: true,
    };
  } else if (ltv.recommendedEngagementAction === 'send-vip-reward') {
    return {
      triggerId: `trig-${ltv.customerAccountId}`,
      customerAccountId: ltv.customerAccountId,
      campaignType: 'vip-tier-welcome',
      proposedVoucherCode: `VIP500-${ltv.customerAccountId.slice(-4).toUpperCase()}`,
      discountValue: 500,
      discountType: 'fixed-inr',
      messageTemplate: `Thank you for being a valued VIP customer, ${ltv.customerName}! Enjoy ₹500 off your next order.`,
      hasOptInConsent: true,
      canSend: true,
    };
  }

  return null;
}
