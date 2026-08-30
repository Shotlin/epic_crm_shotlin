import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailPricingOverviewPanel } from './RetailPricingOverviewPanel';

afterEach(() => cleanup());

describe('RetailPricingOverviewPanel', () => {
  it('does not invent shelf prices or promotions without effective approved records', () => {
    render(<RetailPricingOverviewPanel revenue={{ generatedAt: '2026-08-30T00:00:00.000Z', products: [], priceLists: [], priceListEntries: [], discountPolicies: [], taxCodes: [] } as Pick<RevenueOpsSnapshot, 'generatedAt' | 'products' | 'priceLists' | 'priceListEntries' | 'discountPolicies' | 'taxCodes'>} onOpenAdvanced={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Price clearly. Protect margin. Keep GST evidence attached.' })).toBeTruthy();
    expect(screen.getByText('No active shelf price is recorded')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /approve|save|change price/i })).toBeNull();
  });
});
