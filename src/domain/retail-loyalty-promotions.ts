import { randomUUID } from 'node:crypto';
import type { CreateRetailLoyaltyAccountInput, RedeemRetailLoyaltyPointsInput, RetailLoyaltyAccount, RetailLoyaltyLedgerEntry, RetailVoucher } from '../shared/retail-loyalty-contracts';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

export type CustomerLoyaltyAccount = RetailLoyaltyAccount;
export type LoyaltyLedgerEntry = RetailLoyaltyLedgerEntry;
export type { RetailVoucher } from '../shared/retail-loyalty-contracts';

export interface VoucherValidationResult {
  valid: boolean;
  discountAmount: number;
  reason?: string;
}

const money = (value: number): number => Math.round(value * 100) / 100;

export function calculateLoyaltyPointsAccrued(netAmountPayable: number, ratePer100 = 1): number {
  if (netAmountPayable <= 0) return 0;
  return Math.floor(netAmountPayable / 100) * Math.max(1, Math.floor(ratePer100));
}

export function validateLoyaltyRedemption(
  pointsBalance: number,
  pointsToRedeem: number,
  redemptionValuePerPoint = 1.0,
): { valid: boolean; discountAmount: number; reason?: string } {
  if (!Number.isInteger(pointsToRedeem) || pointsToRedeem <= 0) {
    return { valid: false, discountAmount: 0, reason: 'Points to redeem must be a positive integer.' };
  }
  if (pointsToRedeem > pointsBalance) {
    return { valid: false, discountAmount: 0, reason: `Insufficient points balance (available: ${pointsBalance}).` };
  }
  const discountAmount = money(pointsToRedeem * redemptionValuePerPoint);
  return { valid: true, discountAmount };
}

export function validateRetailVoucher(
  voucher: RetailVoucher,
  orderSubtotal: number,
  currentDate = new Date().toISOString().slice(0, 10),
): VoucherValidationResult {
  if (!voucher.active) {
    return { valid: false, discountAmount: 0, reason: 'Voucher is inactive or disabled.' };
  }
  if (currentDate < voucher.validFrom) {
    return { valid: false, discountAmount: 0, reason: `Voucher is not valid until ${voucher.validFrom}.` };
  }
  if (currentDate > voucher.validTo) {
    return { valid: false, discountAmount: 0, reason: `Voucher expired on ${voucher.validTo}.` };
  }
  if (voucher.currentUsageCount >= voucher.maxUsageCount) {
    return { valid: false, discountAmount: 0, reason: 'Voucher usage limit has been reached.' };
  }
  if (orderSubtotal < voucher.minimumOrderAmount) {
    return { valid: false, discountAmount: 0, reason: `Minimum order subtotal of ₹${voucher.minimumOrderAmount} is required.` };
  }

  let discountAmount = 0;
  if (voucher.discountType === 'fixed_amount') {
    discountAmount = Math.min(orderSubtotal, voucher.discountValue);
  } else {
    discountAmount = money((orderSubtotal * voucher.discountValue) / 100);
    if (voucher.maxDiscountAmount && voucher.maxDiscountAmount > 0) {
      discountAmount = Math.min(discountAmount, voucher.maxDiscountAmount);
    }
  }

  return { valid: true, discountAmount: money(discountAmount) };
}

export function createCustomerLoyaltyAccount(
  customerAccountId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): CustomerLoyaltyAccount {
  return {
    id,
    customerAccountId,
    pointsBalance: 0,
    lifetimePointsEarned: 0,
    lifetimePointsRedeemed: 0,
    tier: 'silver',
    updatedAt: now,
    version: 1,
  };
}

export function recordLoyaltyAccrual(
  account: CustomerLoyaltyAccount,
  pointsEarned: number,
  referenceId: string,
  now = new Date().toISOString(),
): { updatedAccount: CustomerLoyaltyAccount; ledgerEntry: LoyaltyLedgerEntry } {
  if (!Number.isInteger(pointsEarned) || pointsEarned <= 0) {
    throw new Error('Points earned must be a positive integer.');
  }

  const newBalance = account.pointsBalance + pointsEarned;
  const newLifetime = account.lifetimePointsEarned + pointsEarned;
  let tier = account.tier;
  if (newLifetime >= 10000) tier = 'platinum';
  else if (newLifetime >= 2500) tier = 'gold';

  const updatedAccount: CustomerLoyaltyAccount = {
    ...account,
    pointsBalance: newBalance,
    lifetimePointsEarned: newLifetime,
    tier,
    updatedAt: now,
    version: account.version + 1,
  };

  const ledgerEntry: LoyaltyLedgerEntry = {
    id: randomUUID(),
    loyaltyAccountId: account.id,
    customerAccountId: account.customerAccountId,
    type: 'accrual',
    points: pointsEarned,
    referenceId,
    date: now.slice(0, 10),
    version: 1,
  };

  return { updatedAccount, ledgerEntry };
}

const clean = (value: string, label: string, min = 2, max = 160): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`);
  return normalized;
};
const sameScope = (state: RevenueOpsState, record: { scope?: RevenueOpsState['scope'] }) => {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};

export function createRetailLoyaltyAccount(state: RevenueOpsState, input: CreateRetailLoyaltyAccountInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const customerAccountId = clean(input.customerAccountId, 'Customer account');
  if (state.retailLoyaltyAccounts.some((account) => account.customerAccountId === customerAccountId && sameScope(state, account))) throw new Error('A loyalty account already exists for this customer in the active branch.');
  const account: RetailLoyaltyAccount = { id, customerAccountId, pointsBalance: 0, lifetimePointsEarned: 0, lifetimePointsRedeemed: 0, tier: 'silver', updatedAt: now, scope: structuredClone(state.scope), version: 1 };
  void actorId;
  return { ...structuredClone(state), revision: state.revision + 1, retailLoyaltyAccounts: [account, ...state.retailLoyaltyAccounts] };
}

export function accrueRetailLoyaltyPoints(state: RevenueOpsState, customerAccountId: string, points: number, referenceId: string, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const account = state.retailLoyaltyAccounts.find((candidate) => candidate.customerAccountId === customerAccountId && sameScope(state, candidate));
  if (!account || points <= 0) return state;
  const { updatedAccount, ledgerEntry } = recordLoyaltyAccrual(account, points, clean(referenceId, 'Loyalty accrual reference'), now);
  const scopedEntry: RetailLoyaltyLedgerEntry = { ...ledgerEntry, createdBy: actorId, scope: structuredClone(state.scope) };
  const next = structuredClone(state);
  next.revision += 1;
  next.retailLoyaltyAccounts = next.retailLoyaltyAccounts.map((candidate) => candidate.id === account.id ? { ...updatedAccount, scope: candidate.scope } : candidate);
  next.retailLoyaltyLedger.unshift(scopedEntry);
  return next;
}

export function redeemRetailLoyaltyPoints(state: RevenueOpsState, input: RedeemRetailLoyaltyPointsInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const account = state.retailLoyaltyAccounts.find((candidate) => candidate.customerAccountId === input.customerAccountId && sameScope(state, candidate));
  if (!account || account.version !== input.expectedVersion) throw new Error('Loyalty account is stale or unavailable. Refresh and retry.');
  const result = validateLoyaltyRedemption(account.pointsBalance, input.points);
  if (!result.valid) throw new Error(result.reason ?? 'Loyalty redemption is invalid.');
  const next = structuredClone(state);
  next.revision += 1;
  next.retailLoyaltyAccounts = next.retailLoyaltyAccounts.map((candidate) => candidate.id === account.id ? { ...candidate, pointsBalance: candidate.pointsBalance - input.points, lifetimePointsRedeemed: candidate.lifetimePointsRedeemed + input.points, updatedAt: now, version: candidate.version + 1 } : candidate);
  next.retailLoyaltyLedger.unshift({ id: randomUUID(), loyaltyAccountId: account.id, customerAccountId: account.customerAccountId, type: 'redemption', points: -input.points, referenceId: clean(input.referenceId, 'Loyalty redemption reference'), date: now.slice(0, 10), createdBy: actorId, scope: structuredClone(state.scope), version: 1 });
  return next;
}
