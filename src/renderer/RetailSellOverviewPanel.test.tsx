import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('filters only supplied price-ready products by controlled category and search text', async () => {
    const user = userEvent.setup();
    render(<RetailSellOverviewPanel
      counters={[counter]}
      shifts={[shift]}
      sales={[]}
      catalogProducts={[
        { id: 'sku-rice', label: 'Rice 5 kg', sku: 'RICE-5', category: 'Staples', availableUnits: 8, unitPrice: 340 },
        { id: 'sku-milk', label: 'Milk 1 L', sku: 'MILK-1', category: 'Dairy', availableUnits: 12, unitPrice: 65 },
      ]}
      onOpenAdvanced={vi.fn()}
    />);

    await user.click(screen.getByRole('button', { name: 'Dairy' }));
    expect(screen.getByRole('button', { name: 'Open Milk 1 L in POS' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open Rice 5 kg in POS' })).toBeNull();
    await user.clear(screen.getByRole('searchbox', { name: 'Search price-ready products' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search price-ready products' }), 'rice');
    expect(screen.getByText('No price-ready product matches this search.')).toBeTruthy();
  });

  it('returns to all categories when a live catalog refresh removes the selected category', async () => {
    const user = userEvent.setup();
    const props = { counters: [counter], shifts: [shift], sales: [], onOpenAdvanced: vi.fn() };
    const { rerender } = render(<RetailSellOverviewPanel {...props} catalogProducts={[
      { id: 'sku-rice', label: 'Rice 5 kg', sku: 'RICE-5', category: 'Staples', availableUnits: 8, unitPrice: 340 },
      { id: 'sku-milk', label: 'Milk 1 L', sku: 'MILK-1', category: 'Dairy', availableUnits: 12, unitPrice: 65 },
    ]} />);

    await user.click(screen.getByRole('button', { name: 'Dairy' }));
    rerender(<RetailSellOverviewPanel {...props} catalogProducts={[
      { id: 'sku-rice', label: 'Rice 5 kg', sku: 'RICE-5', category: 'Staples', availableUnits: 8, unitPrice: 340 },
    ]} />);

    expect(screen.getByRole('button', { name: 'Open Rice 5 kg in POS' })).toBeTruthy();
    expect(screen.queryByText('No price-ready product matches this search.')).toBeNull();
  });
});
