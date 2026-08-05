import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RetailCommerceConnector, RetailCommerceOrder } from '../shared/retail-commerce-contracts';
import { RetailOrderQueuePanel } from './RetailOrderQueuePanel';

const order = {
  id: 'order-1', connectorId: 'connector-1', remoteOrderId: 'remote-1', orderNumber: 'BK-1001', status: 'confirmed', remoteCreatedAt: '2026-08-03T09:00:00Z', remotePayloadChecksum: 'checksum', totalAmount: 1299, importedBy: 'owner', importedAt: '2026-08-03T09:01:00Z', version: 1,
  lines: [{ itemVariantId: 'variant-1', quantity: 2, unitPrice: 500, taxableValue: 1000, gstRate: 5 }],
} as unknown as RetailCommerceOrder;
const connector = { id: 'connector-1', code: 'bakaloo', channel: 'website', status: 'active', version: 1 } as unknown as RetailCommerceConnector;

afterEach(() => cleanup());

describe('RetailOrderQueuePanel', () => {
  it('shows a simple INR order queue and does not show dollar formatting', () => {
    render(<RetailOrderQueuePanel orders={[order]} connectors={[connector]} salesOrders={[]} reservations={[]} onOpenAdvanced={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Pack today/ })).toBeTruthy();
    expect(screen.getAllByText(/₹1,299/).length).toBeGreaterThan(0);
    expect(screen.queryByText('$')).toBeNull();
    expect(screen.getByText(/No local sales-order handoff/)).toBeTruthy();
  });

  it('filters the queue and keeps mutations behind the governed action', async () => {
    const user = userEvent.setup();
    const onOpenAdvanced = vi.fn();
    render(<RetailOrderQueuePanel orders={[order]} connectors={[connector]} salesOrders={[]} reservations={[]} onOpenAdvanced={onOpenAdvanced} />);
    await user.click(screen.getByRole('button', { name: 'Ready to dispatch' }));
    expect(screen.getByText('No orders in this view')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'All orders' })[0]!);
    await user.click(screen.getByRole('button', { name: /Open governed action/ }));
    expect(onOpenAdvanced).toHaveBeenCalledTimes(1);
  });
});
