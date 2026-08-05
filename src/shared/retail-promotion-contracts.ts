import type { OperatingRecordScope } from './revenue-ops-contracts';

/** Immutable evidence that a published campaign actually fired at checkout. */
export interface RetailPromotionRedemption {
  id: string;
  promotionPolicyId: string;
  saleId: string;
  campaignCode?: string;
  customerAccountId: string;
  redeemedAt: string;
  discountAmount: number;
  giftQuantity: number;
  scope?: OperatingRecordScope;
  version: number;
}
