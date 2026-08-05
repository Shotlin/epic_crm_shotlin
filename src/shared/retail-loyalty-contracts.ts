import type { OperatingRecordScope } from './revenue-ops-contracts';

export type RetailLoyaltyTier = 'silver' | 'gold' | 'platinum';

export interface RetailLoyaltyAccount {
  scope?: OperatingRecordScope;
  id: string;
  customerAccountId: string;
  pointsBalance: number;
  lifetimePointsEarned: number;
  lifetimePointsRedeemed: number;
  tier: RetailLoyaltyTier;
  updatedAt: string;
  version: number;
}

export interface RetailLoyaltyLedgerEntry {
  scope?: OperatingRecordScope;
  id: string;
  loyaltyAccountId: string;
  customerAccountId: string;
  type: 'accrual' | 'redemption' | 'adjustment' | 'expiry';
  points: number;
  referenceId: string;
  date: string;
  createdBy?: string;
  version: number;
}

export interface RetailVoucher {
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  minimumOrderAmount: number;
  maxDiscountAmount?: number;
  validFrom: string;
  validTo: string;
  maxUsageCount: number;
  currentUsageCount: number;
  active: boolean;
  version: number;
}

export interface CreateRetailLoyaltyAccountInput {
  customerAccountId: string;
}

export interface RedeemRetailLoyaltyPointsInput {
  customerAccountId: string;
  points: number;
  referenceId: string;
  expectedVersion: number;
}

export interface CreateRetailVoucherInput {
  code: string;
  name: string;
  discountType: RetailVoucher['discountType'];
  discountValue: number;
  minimumOrderAmount: number;
  maxDiscountAmount?: number;
  validFrom: string;
  validTo: string;
  maxUsageCount: number;
}
