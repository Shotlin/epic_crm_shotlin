import { describe, expect, it } from 'vitest';
import { buildRetailReplenishmentPlan, deriveRetailReplenishmentItems } from './retail-replenishment-plan';

describe('retail replenishment plan', () => {
  it('derives 30, 60 and 90-day demand from completed counter sales and aggregates available stock across bins', () => {
    const items = deriveRetailReplenishmentItems({
      asOf: '2026-07-31T12:00:00.000Z',
      defaultLeadTimeDays: 7,
      variants: [{ id: 'tea', sku: 'TEA-1KG', name: 'Premium tea', active: true }],
      sales: [
        { status: 'completed', saleAt: '2026-07-25T10:00:00.000Z', lines: [{ itemVariantId: 'tea', quantity: 6 }] },
        { status: 'completed', saleAt: '2026-06-20T10:00:00.000Z', lines: [{ itemVariantId: 'tea', quantity: 4 }] },
        { status: 'completed', saleAt: '2026-05-20T10:00:00.000Z', lines: [{ itemVariantId: 'tea', quantity: 9 }] },
        { status: 'processing', saleAt: '2026-07-28T10:00:00.000Z', lines: [{ itemVariantId: 'tea', quantity: 99 }] },
      ],
      balances: [
        { itemVariantId: 'tea', available: 3, unitCost: 100 },
        { itemVariantId: 'tea', available: 2, unitCost: 120 },
      ],
    });

    expect(items).toEqual([expect.objectContaining({
      itemVariantId: 'tea',
      sales30DaysQty: 6,
      sales60DaysQty: 10,
      sales90DaysQty: 19,
      currentAvailableQty: 5,
      unitCost: 108,
    })]);
  });

  it('spends a shared INR budget on the most urgent stockout first and exposes deferred quantities', () => {
    const plan = buildRetailReplenishmentPlan({
      festival: 'none',
      forecastPeriodDays: 30,
      cashBudgetInr: 800,
      items: [
        { itemVariantId: 'critical', sku: 'CRIT-1', name: 'Critical SKU', categoryName: 'Retail', sales30DaysQty: 90, sales60DaysQty: 150, sales90DaysQty: 210, currentAvailableQty: 0, supplierLeadTimeDays: 7, unitCost: 100 },
        { itemVariantId: 'normal', sku: 'NORMAL-1', name: 'Normal SKU', categoryName: 'Retail', sales30DaysQty: 30, sales60DaysQty: 60, sales90DaysQty: 90, currentAvailableQty: 2, supplierLeadTimeDays: 7, unitCost: 100 },
      ],
    });

    expect(plan.budgetInr).toBe(800);
    expect(plan.plannedCostInr).toBe(800);
    expect(plan.remainingBudgetInr).toBe(0);
    expect(plan.rows[0]).toEqual(expect.objectContaining({ itemVariantId: 'critical', plannedQuantity: 8, deferredQuantity: 94, status: 'partially-funded' }));
    expect(plan.rows[1]).toEqual(expect.objectContaining({ itemVariantId: 'normal', plannedQuantity: 0, status: 'budget-held' }));
  });

  it('does not present a replenishment as funded when its purchase cost is unavailable', () => {
    const plan = buildRetailReplenishmentPlan({
      festival: 'diwali-dhanteras',
      forecastPeriodDays: 30,
      cashBudgetInr: 50000,
      items: [{ itemVariantId: 'unknown-cost', sku: 'NEW-1', name: 'New launch', categoryName: 'Retail', sales30DaysQty: 30, sales60DaysQty: 30, sales90DaysQty: 30, currentAvailableQty: 0, supplierLeadTimeDays: 5, unitCost: 0 }],
    });

    expect(plan.rows[0]).toEqual(expect.objectContaining({ plannedQuantity: 0, status: 'cost-unavailable' }));
    expect(plan.rows[0]!.nextAction).toContain('cost');
  });

  it('subtracts near-expiry stock and credits open inbound purchase quantity before recommending a refill', () => {
    const items = deriveRetailReplenishmentItems({
      asOf: '2026-07-31T12:00:00.000Z',
      defaultLeadTimeDays: 7,
      expirySafetyDays: 14,
      inboundByVariant: { tea: 20 },
      variants: [{ id: 'tea', sku: 'TEA-1KG', name: 'Premium tea', active: true }],
      sales: [{ status: 'completed', saleAt: '2026-07-25T10:00:00.000Z', lines: [{ itemVariantId: 'tea', quantity: 60 }] }],
      balances: [
        { itemVariantId: 'tea', available: 10, unitCost: 100, expiresAt: '2026-08-05T00:00:00.000Z' },
        { itemVariantId: 'tea', available: 5, unitCost: 100 },
      ],
    });
    const plan = buildRetailReplenishmentPlan({ items, festival: 'none', forecastPeriodDays: 30, cashBudgetInr: 100_000 });
    expect(items[0]).toEqual(expect.objectContaining({ currentAvailableQty: 15, expiryRiskQty: 10, inboundQty: 20 }));
    expect(plan.rows[0]).toEqual(expect.objectContaining({ candidateQuantity: 43 }));
    expect(plan.rows[0]!.forecast).toMatchObject({ safeAvailableQty: 5, inboundQty: 20, netAvailableQty: 25, expiryRiskQty: 10 });
  });
});
