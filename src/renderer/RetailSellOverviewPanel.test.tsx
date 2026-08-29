import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RetailCashierShift, RetailCounter, RetailSale } from '../shared/retail-pos-contracts';
import { RetailSellOverviewPanel } from './RetailSellOverviewPanel';

const counter = { id: 'counter-1', name: 'Front counter', active: true } as unknown as RetailCounter;
const shift = { id: 'shift-1', status: 'open' } as unknown as RetailCashierShift;
const sale = { id: 'sale-1', number: 'INV-1', counterId: 'counter-1', saleAt: '2026-08-03T10:00:00Z', status: 'completed', taxPreview: { grandTotal: 1200 }, tenders: [{ method: 'upi', amount: 1200 }] } as unknown as RetailSale;

afterEach(() => cleanup());

describe('RetailSellOverviewPanel', () => {
  it('shows a clean INR POS front door and recent receipt', () => {
    render(<RetailSellOverviewPanel counters={[counter]} shifts={[shift]} sales={[sale]} onOpenAdvanced={vi.fn()} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: /Sell simply/ })).toBeTruthy();
    expect(screen.getByText('INV-1')).toBeTruthy();
    expect(screen.getAllByText(/₹1,200/).length).toBeGreaterThan(0);
    expect(screen.queryByText('$')).toBeNull();
  });

  it('keeps sale creation behind the governed POS action', () => {
    const onOpenAdvanced = vi.fn();
    render(<RetailSellOverviewPanel counters={[]} shifts={[]} sales={[]} onOpenAdvanced={onOpenAdvanced} />);
    screen.getByRole('button', { name: /Start a sale/ }).click();
    expect(onOpenAdvanced).toHaveBeenCalledTimes(1);
    expect(screen.getByText('No completed sale yet')).toBeTruthy();
  });

  it('shows only the supplied price-ready inventory preview and opens the governed POS', () => {
    const onOpenAdvanced = vi.fn();
    render(<RetailSellOverviewPanel
      counters={[counter]}
      shifts={[shift]}
      sales={[]}
      catalogProducts={[{ id: 'sku-rice', label: 'Rice 5 kg', sku: 'RICE-5', availableUnits: 8, unitPrice: 340 }]}
      onOpenAdvanced={onOpenAdvanced}
    />);
    const product = screen.getByRole('button', { name: 'Open Rice 5 kg in POS' });
    expect(product.textContent).toContain('340');
    product.click();
    expect(onOpenAdvanced).toHaveBeenCalledTimes(1);
  });
});
