import { describe, expect, it } from 'vitest';
import {
  calculateLoyaltyPointsAccrued,
  createCustomerLoyaltyAccount,
  recordLoyaltyAccrual,
  validateLoyaltyRedemption,
  validateRetailVoucher,
  accrueRetailLoyaltyPoints,
  createRetailLoyaltyAccount,
  redeemRetailLoyaltyPoints,
  type RetailVoucher,
} from './retail-loyalty-promotions';
import { evaluateRetailPromotion } from './retail-promotions';
import { createInitialRevenueOpsState } from './revenue-ops';

describe('retail customer loyalty & promotion domain', () => {
  it('calculates points accrued correctly based on net payable', () => {
    expect(calculateLoyaltyPointsAccrued(1250, 1)).toBe(12);
    expect(calculateLoyaltyPointsAccrued(99, 1)).toBe(0);
    expect(calculateLoyaltyPointsAccrued(5000, 2)).toBe(100);
  });

  it('validates loyalty point redemptions against available balance', () => {
    const invalidAmount = validateLoyaltyRedemption(100, 0);
    expect(invalidAmount.valid).toBe(false);

    const insufficient = validateLoyaltyRedemption(100, 150);
    expect(insufficient.valid).toBe(false);
    expect(insufficient.reason).toContain('Insufficient points balance');

    const valid = validateLoyaltyRedemption(100, 50);
    expect(valid.valid).toBe(true);
    expect(valid.discountAmount).toBe(50);
  });

  it('validates fixed amount and percentage retail vouchers with thresholds and caps', () => {
    const voucherFixed: RetailVoucher = {
      id: 'vch-100',
      code: 'FLAT100',
      name: 'Flat ₹100 Off',
      discountType: 'fixed_amount',
      discountValue: 100,
      minimumOrderAmount: 500,
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      maxUsageCount: 100,
      currentUsageCount: 5,
      active: true,
      version: 1,
    };

    // Below minimum subtotal
    const belowMin = validateRetailVoucher(voucherFixed, 400, '2026-07-15');
    expect(belowMin.valid).toBe(false);
    expect(belowMin.reason).toContain('Minimum order subtotal');

    // Valid fixed voucher
    const validFixed = validateRetailVoucher(voucherFixed, 750, '2026-07-15');
    expect(validFixed.valid).toBe(true);
    expect(validFixed.discountAmount).toBe(100);

    // Percentage voucher with max discount cap
    const voucherPerc: RetailVoucher = {
      id: 'vch-perc',
      code: 'FESTIVE20',
      name: '20% Festive Savings',
      discountType: 'percentage',
      discountValue: 20,
      minimumOrderAmount: 1000,
      maxDiscountAmount: 300,
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      maxUsageCount: 50,
      currentUsageCount: 10,
      active: true,
      version: 1,
    };

    // Subtotal 2000 => 20% = 400, capped at maxDiscountAmount = 300
    const cappedPerc = validateRetailVoucher(voucherPerc, 2000, '2026-07-15');
    expect(cappedPerc.valid).toBe(true);
    expect(cappedPerc.discountAmount).toBe(300);
  });

  it('records loyalty accrual and upgrades customer tier', () => {
    const account = createCustomerLoyaltyAccount('cust-101');
    expect(account.tier).toBe('silver');

    const { updatedAccount, ledgerEntry } = recordLoyaltyAccrual(account, 3000, 'REC-001');
    expect(updatedAccount.pointsBalance).toBe(3000);
    expect(updatedAccount.tier).toBe('gold');
    expect(ledgerEntry.points).toBe(3000);
    expect(ledgerEntry.type).toBe('accrual');
  });

  it('evaluates customer-targeted BOGO promotions deterministically', () => {
    const policy = { id: 'bogo-1', code: 'TEA-2PLUS1', name: 'Tea 2+1', scope: 'product' as const, productId: 'tea', method: 'percentage' as const, value: 0, minimumTaxableValue: 0, maximumDiscountAmount: 0, stackable: false, approvalThresholdPercent: 0, effectiveFrom: '2026-01-01', active: true, promotionType: 'bogo' as const, buyQuantity: 2, freeQuantity: 1, eligibleCustomerAccountIds: ['customer-1'], version: 1 };
    const eligible = evaluateRetailPromotion({ policy, subtotal: 300, eligibleProductSubtotal: 300, eligibleQuantity: 3, customerAccountId: 'customer-1' });
    expect(eligible).toMatchObject({ eligible: true, freeQuantity: 1, discountAmount: 100 });
    const outsideAudience = evaluateRetailPromotion({ policy, subtotal: 300, eligibleProductSubtotal: 300, eligibleQuantity: 3, customerAccountId: 'customer-2' });
    expect(outsideAudience.eligible).toBe(false);
  });

  it('evaluates shelf campaign discounts only on the matched rack basis', () => {
    const policy = { id: 'rack-1', code: 'AISLE-FEST', name: 'Aisle festival', scope: 'order' as const, method: 'percentage' as const, value: 10, minimumTaxableValue: 500, maximumDiscountAmount: 1000, stackable: false, approvalThresholdPercent: 0, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', active: true, eligibleRetailRackBinIds: ['rack-a'], version: 1 };
    const result = evaluateRetailPromotion({ policy, subtotal: 3000, targetedSubtotal: 800, eligibleProductSubtotal: 800, eligibleQuantity: 4 });
    expect(result).toMatchObject({ eligible: true, discountAmount: 80 });
  });

  it('evaluates gift-SKU promotions as a zero-price entitlement', () => {
    const policy = { id: 'gift-1', code: 'TEA-GIFT', name: 'Tea gift', scope: 'product' as const, productId: 'tea', method: 'percentage' as const, value: 1, minimumTaxableValue: 100, maximumDiscountAmount: 1000, stackable: false, approvalThresholdPercent: 0, promotionType: 'gift' as const, giftItemVariantId: 'sugar-variant', giftQuantity: 1, effectiveFrom: '2026-01-01', active: true, version: 1 };
    expect(evaluateRetailPromotion({ policy, subtotal: 500, eligibleProductSubtotal: 500, eligibleQuantity: 2 })).toMatchObject({ eligible: true, freeQuantity: 1, discountAmount: 0 });
  });

  it('persists loyalty accounts, accruals, and redemptions with versioned ledger evidence', () => {
    let state = createInitialRevenueOpsState();
    state = createRetailLoyaltyAccount(state, { customerAccountId: 'customer-1' }, 'cashier', '00000000-0000-4000-8000-000000000090', '2026-07-30T10:00:00.000Z');
    state = accrueRetailLoyaltyPoints(state, 'customer-1', 120, 'POS-001', 'cashier', '2026-07-30T10:01:00.000Z');
    expect(state.retailLoyaltyAccounts[0]).toMatchObject({ pointsBalance: 120, tier: 'silver', version: 2 });
    state = redeemRetailLoyaltyPoints(state, { customerAccountId: 'customer-1', points: 20, referenceId: 'POS-002', expectedVersion: 2 }, 'checker', '2026-07-30T10:02:00.000Z');
    expect(state.retailLoyaltyAccounts[0]).toMatchObject({ pointsBalance: 100, lifetimePointsRedeemed: 20, version: 3 });
    expect(state.retailLoyaltyLedger).toHaveLength(2);
  });
});
