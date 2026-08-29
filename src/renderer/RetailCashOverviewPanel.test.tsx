import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaymentReceipt } from '../shared/revenue-ops-contracts';
import type { RetailCashierShift, RetailCounter, RetailSale } from '../shared/retail-pos-contracts';
import { RetailCashOverviewPanel } from './RetailCashOverviewPanel';

const counter = { id: 'counter-1', name: 'Front counter', code: 'C1' } as unknown as RetailCounter;
const shift = { id: 'shift-1', number: 'SHIFT-001', counterId: 'counter-1', cashierId: 'cashier', openedAt: '2026-08-03T09:00:00Z', openingCash: 1000, status: 'close-requested', expectedCash: 2200, declaredCash: 2100, variance: -100, tenderVariance: -100, version: 1 } as unknown as RetailCashierShift;
const sale = { id: 'sale-1', cashierShiftId: 'shift-1', status: 'completed', taxPreview: { grandTotal: 1200, totalTax: 120 }, tenders: [{ id: 't-1', method: 'cash', amount: 1200, reference: 'CASH' }] } as unknown as RetailSale;
const receipt = { id: 'receipt-1', status: 'recorded', amount: 1200 } as unknown as PaymentReceipt;

afterEach(() => cleanup());

describe('RetailCashOverviewPanel', () => {
  it('shows a simple INR day-close checklist without dollar values', () => {
    render(<RetailCashOverviewPanel shifts={[shift]} counters={[counter]} sales={[sale]} receipts={[receipt]} onOpenAdvanced={vi.fn()} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: /Close the day by exception, not by spreadsheet/ })).toBeTruthy();
    expect(screen.getByText('Day close checklist')).toBeTruthy();
    expect(screen.getByText('Expected cash')).toBeTruthy();
    expect(screen.getByText('GST output')).toBeTruthy();
    expect(screen.queryByText('$')).toBeNull();
  });

  it('reveals filtered till evidence and opens the governed close workflow', async () => {
    const user = userEvent.setup();
    const onOpenAdvanced = vi.fn();
    render(<RetailCashOverviewPanel shifts={[shift]} counters={[counter]} sales={[sale]} receipts={[receipt]} onOpenAdvanced={onOpenAdvanced} />);
    await user.click(screen.getByText('Inspect individual till evidence'));
    await user.click(screen.getByRole('button', { name: 'Closed cleanly' }));
    expect(screen.getByText('No tills in this view')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Continue day close/ }));
    expect(onOpenAdvanced).toHaveBeenCalledTimes(1);
  });

  it('shows electronic tender gaps without treating a receipt as bank settlement', () => {
    const electronicReceipt = { id: 'receipt-upi', number: 'RCPT-UPI-1', status: 'recorded', method: 'upi', amount: 500, receivedAt: '2026-08-04T09:00:00Z' } as unknown as PaymentReceipt;
    render(<RetailCashOverviewPanel shifts={[]} counters={[]} sales={[]} receipts={[electronicReceipt]} bankLines={[]} onOpenAdvanced={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Recorded versus bank matched' })).toBeTruthy();
    expect(screen.getByText(/500 gap/)).toBeTruthy();
    expect(screen.getByText(/Import and match the missing UPI\/card settlement lines/i)).toBeTruthy();
  });
});
