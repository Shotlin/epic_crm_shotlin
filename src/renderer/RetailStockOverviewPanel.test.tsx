import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BinBalance, InventoryBatch, ItemVariant, ReorderPolicy, ReorderProposal } from '../shared/inventory-contracts';
import { RetailStockOverviewPanel } from './RetailStockOverviewPanel';

const variant = { id: 'v-1', itemId: 'i-1', sku: 'RICE-5', name: 'Rice 5 kg', attributes: {}, active: true, version: 1 } as unknown as ItemVariant;
const balance = { id: 'b-1', binId: 'bin-1', itemVariantId: 'v-1', quantity: 4, reserved: 1, picked: 0, available: 3, unitCost: 55, inventoryValue: 165, version: 1 } as unknown as BinBalance;
const policy = { id: 'p-1', itemVariantId: 'v-1', warehouseId: 'w-1', minimumQuantity: 2, reorderPoint: 5, maximumQuantity: 20, safetyStock: 2, leadTimeDays: 3, active: true, version: 1 } as unknown as ReorderPolicy;
const proposal = { id: 'rp-1', policyId: 'p-1', availableQuantity: 3, recommendedQuantity: 17, requiredBy: '2026-08-05', reason: 'Below reorder point', status: 'proposed', generatedAt: '2026-08-03', version: 1 } as unknown as ReorderProposal;
const batch = { id: 'batch-1', itemVariantId: 'v-1', batchNumber: 'B-1', status: 'expired', version: 1 } as unknown as InventoryBatch;

afterEach(() => cleanup());

describe('RetailStockOverviewPanel', () => {
  it('shows real stock evidence and highlights expired inventory', () => {
    render(<RetailStockOverviewPanel variants={[variant]} balances={[balance]} policies={[policy]} proposals={[proposal]} batches={[batch]} tasks={[]} onOpenAdvanced={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Know what is available/ })).toBeTruthy();
    expect(screen.getAllByText('Rice 5 kg').length).toBeGreaterThan(0);
    expect(screen.getByText(/expired batch/)).toBeTruthy();
    expect(screen.queryByText('$')).toBeNull();
  });

  it('filters and opens governed stock controls', async () => {
    const user = userEvent.setup();
    const onOpenAdvanced = vi.fn();
    render(<RetailStockOverviewPanel variants={[variant]} balances={[balance]} policies={[policy]} proposals={[proposal]} batches={[]} tasks={[]} onOpenAdvanced={onOpenAdvanced} />);
    await user.click(screen.getByRole('button', { name: 'Expired batches' }));
    expect(screen.getByText('No stock records in this view')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'All stock' }));
    await user.click(screen.getByRole('button', { name: /Open governed stock action/ }));
    expect(onOpenAdvanced).toHaveBeenCalledTimes(1);
  });
});
