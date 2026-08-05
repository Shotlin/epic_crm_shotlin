/**
 * retail-forecasting.test.ts
 *
 * Unit tests for Demand Forecasting & Smart Replenishment Engine.
 */

import { describe, it, expect } from 'vitest';
import {
  computeSkuDemandForecast,
  type SkuSalesHistory,
} from './retail-forecasting';

const mockHistory: SkuSalesHistory = {
  itemVariantId: 'var-201',
  sku: 'SHIRT-BLU-L',
  name: 'Cotton Oxford Shirt Blue L',
  categoryName: 'Apparel',
  sales30DaysQty: 60, // 2 per day
  sales60DaysQty: 110,
  sales90DaysQty: 150,
  currentAvailableQty: 5,
  supplierLeadTimeDays: 7,
  unitCost: 400,
};

describe('retail-forecasting domain', () => {
  it('calculates daily sales velocity and reorder point correctly', () => {
    const forecast = computeSkuDemandForecast(mockHistory, 30, 'none');

    expect(forecast.dailySalesVelocity).toBe(2);
    expect(forecast.baseDemandQty).toBe(60);
    expect(forecast.reorderPointQty).toBeGreaterThan(14); // 2*7 + safety stock
    expect(forecast.urgency).toBe('normal-reorder'); // 5 <= reorder point
    expect(forecast.suggestedReorderQty).toBeGreaterThan(50);
    expect(forecast.trendDirection).toBe('rising');
    expect(forecast.trendPercent).toBe(20);
    expect(forecast.confidence).toBe('high');
  });

  it('applies Diwali festival multiplier to surge demand forecast', () => {
    const forecastDiwali = computeSkuDemandForecast(mockHistory, 30, 'diwali-dhanteras');

    expect(forecastDiwali.festivalMultiplier).toBe(2.5);
    expect(forecastDiwali.adjustedDemandQty).toBe(150); // 60 * 2.5
    expect(forecastDiwali.suggestedReorderQty).toBeGreaterThan(140);
  });

  it('respects cash budget constraint when suggesting reorders', () => {
    const constrainedForecast = computeSkuDemandForecast(mockHistory, 30, 'diwali-dhanteras', 20000);

    expect(constrainedForecast.estimatedReorderCost).toBeLessThanOrEqual(20000);
    expect(constrainedForecast.suggestedReorderQty).toBe(50); // 20,000 / 400 = 50 units
  });

  it('labels sparse or declining history instead of presenting false precision', () => {
    const sparse = computeSkuDemandForecast({ ...mockHistory, sales30DaysQty: 0, sales60DaysQty: 0, sales90DaysQty: 0, currentAvailableQty: 20 }, 30, 'none');
    expect(sparse.trendDirection).toBe('stable');
    expect(sparse.trendPercent).toBe(0);
    expect(sparse.confidence).toBe('low');
    const falling = computeSkuDemandForecast({ ...mockHistory, sales30DaysQty: 10, sales60DaysQty: 60, sales90DaysQty: 180 }, 30, 'none');
    expect(falling.trendDirection).toBe('falling');
    expect(falling.confidence).toBe('high');
  });
});
