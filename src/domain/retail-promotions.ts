import type { DiscountPolicy } from '../shared/revenue-ops-contracts';

export type RetailPromotionTier = 'silver' | 'gold' | 'platinum';

export interface RetailPromotionEvaluationInput {
  policy: DiscountPolicy;
  subtotal: number;
  eligibleProductSubtotal: number;
  eligibleQuantity: number;
  customerAccountId?: string;
  customerTier?: RetailPromotionTier;
  /** When a campaign targets shelf metadata, this is the matched merchandise basis. */
  targetedSubtotal?: number;
}

export interface RetailPromotionEvaluation {
  eligible: boolean;
  discountAmount: number;
  freeQuantity: number;
  reason?: string;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Deterministic, explainable retail promotion evaluation. This function never
 * mutates a cart or inventory; the checkout boundary remains responsible for
 * applying the returned discount and recording its source policy.
 */
export function evaluateRetailPromotion(input: RetailPromotionEvaluationInput): RetailPromotionEvaluation {
  const { policy } = input;
  if (!policy.active) return { eligible: false, discountAmount: 0, freeQuantity: 0, reason: 'Promotion is inactive.' };
  if (policy.eligibleCustomerAccountIds?.length && (!input.customerAccountId || !policy.eligibleCustomerAccountIds.includes(input.customerAccountId))) {
    return { eligible: false, discountAmount: 0, freeQuantity: 0, reason: 'Customer is outside the promotion audience.' };
  }
  if (policy.eligibleLoyaltyTiers?.length && (!input.customerTier || !policy.eligibleLoyaltyTiers.includes(input.customerTier))) {
    return { eligible: false, discountAmount: 0, freeQuantity: 0, reason: 'Customer loyalty tier is not eligible.' };
  }
  const basis = policy.scope === 'product' ? input.eligibleProductSubtotal : (input.targetedSubtotal ?? input.subtotal);
  if (basis < policy.minimumTaxableValue) return { eligible: false, discountAmount: 0, freeQuantity: 0, reason: `Minimum eligible value of ₹${policy.minimumTaxableValue} is required.` };
  if (policy.promotionType === 'bogo') {
    const buy = policy.buyQuantity ?? 0;
    const free = policy.freeQuantity ?? 0;
    if (buy <= 0 || free <= 0 || !Number.isInteger(buy) || !Number.isInteger(free)) return { eligible: false, discountAmount: 0, freeQuantity: 0, reason: 'BOGO policy quantities are invalid.' };
    const freeQuantity = Math.floor(input.eligibleQuantity / buy) * free;
    if (freeQuantity <= 0 || input.eligibleQuantity <= 0) return { eligible: false, discountAmount: 0, freeQuantity: 0, reason: 'Required buy quantity has not been reached.' };
    const unitValue = input.eligibleProductSubtotal / input.eligibleQuantity;
    return { eligible: true, freeQuantity, discountAmount: money(Math.min(basis, unitValue * freeQuantity)) };
  }
  if (policy.promotionType === 'gift') {
    const giftQuantity = policy.giftQuantity ?? 0;
    if (!policy.giftItemVariantId || giftQuantity <= 0 || !Number.isInteger(giftQuantity)) return { eligible: false, freeQuantity: 0, discountAmount: 0, reason: 'Gift SKU and quantity are invalid.' };
    if (input.eligibleQuantity <= 0) return { eligible: false, freeQuantity: 0, discountAmount: 0, reason: 'Gift promotion requires a qualifying product quantity.' };
    return { eligible: true, freeQuantity: giftQuantity, discountAmount: 0 };
  }
  const raw = policy.method === 'percentage' ? basis * policy.value / 100 : policy.value;
  return { eligible: true, freeQuantity: 0, discountAmount: money(Math.min(basis, Math.min(raw, policy.maximumDiscountAmount || raw))) };
}
