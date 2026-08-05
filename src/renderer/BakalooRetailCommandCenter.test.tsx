import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCleanRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { RetailCommerceConnector, RetailCommerceOrder } from '../shared/retail-commerce-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { BakalooRetailCommandCenter } from './BakalooRetailCommandCenter';

const generatedAt = '2026-08-03T08:30:00.000Z';

function cleanRetailRevenue(): RevenueOpsSnapshot {
  return getRevenueOpsSnapshot(createCleanRevenueOpsState(), {
    opportunities: [],
    accounts: [],
    contacts: [],
    addresses: [],
    activeUserIds: [],
  }, generatedAt);
}

afterEach(() => cleanup());

describe('BakalooRetailCommandCenter', () => {
  it('keeps every retail action explicit and routes it to the supplied workbench callback', async () => {
    const user = userEvent.setup();
    const onPos = vi.fn();
    const onOrders = vi.fn();
    const onStock = vi.fn();
    const onDelivery = vi.fn();
    const onCash = vi.fn();
    const onCustomers = vi.fn();
    const onSetup = vi.fn();

    render(
      <BakalooRetailCommandCenter
        revenue={cleanRetailRevenue()}
        onPos={onPos}
        onOrders={onOrders}
        onStock={onStock}
        onDelivery={onDelivery}
        onCash={onCash}
        onCustomers={onCustomers}
        onSetup={onSetup}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open POS' }));
    await user.click(screen.getByRole('button', { name: 'Open orders' }));
    await user.click(screen.getByRole('button', { name: 'View order queue' }));
    await user.click(screen.getByRole('button', { name: 'Review stock' }));
    await user.click(screen.getByRole('button', { name: 'Open delivery' }));
    await user.click(screen.getByRole('button', { name: 'Close cash' }));
    await user.click(screen.getByRole('button', { name: 'Open customers' }));
    await user.click(screen.getByRole('button', { name: 'Open setup' }));

    expect(onPos).toHaveBeenCalledTimes(1);
    expect(onOrders).toHaveBeenCalledTimes(2);
    expect(onStock).toHaveBeenCalledTimes(1);
    expect(onDelivery).toHaveBeenCalledTimes(1);
    expect(onCash).toHaveBeenCalledTimes(1);
    expect(onCustomers).toHaveBeenCalledTimes(1);
    expect(onSetup).toHaveBeenCalledTimes(1);
  });

  it('shows a useful empty retail starter state without invented values or foreign currency', () => {
    render(
      <BakalooRetailCommandCenter
        revenue={cleanRetailRevenue()}
        onPos={vi.fn()}
        onOrders={vi.fn()}
        onStock={vi.fn()}
        onDelivery={vi.fn()}
        onCash={vi.fn()}
        onCustomers={vi.fn()}
        onSetup={vi.fn()}
      />,
    );

    const commandCenter = screen.getByTestId('bakaloo-retail-command-center');
    expect(commandCenter.textContent).toContain('No completed sales recorded today.');
    expect(commandCenter.textContent).toContain('No online orders are waiting to be packed.');
    expect(commandCenter.textContent).toContain('Set up a counter to begin selling.');
    expect(commandCenter.textContent).toContain('₹0');
    expect(commandCenter.textContent).not.toContain('$');
  });

  it('does not draw activity in an empty online channel when another channel has orders', () => {
    const revenue = cleanRetailRevenue();
    const connector: RetailCommerceConnector = {
      id: 'connector-marketplace',
      code: 'MKT-01',
      name: 'Marketplace',
      channel: 'marketplace',
      environment: 'sandbox',
      baseUrl: 'https://example.invalid',
      capabilities: ['order-pull'],
      credentialStatus: 'configured',
      status: 'configured',
      createdBy: 'user-test',
      createdAt: generatedAt,
      version: 1,
    };
    const order: RetailCommerceOrder = {
      id: 'commerce-order-1',
      connectorId: connector.id,
      remoteOrderId: 'REMOTE-1',
      orderNumber: 'ONLINE-001',
      status: 'imported',
      lines: [],
      totalAmount: 250,
      remoteCreatedAt: generatedAt,
      remotePayloadChecksum: 'a'.repeat(64),
      importedBy: 'user-test',
      importedAt: generatedAt,
      version: 1,
    };
    revenue.retailCommerceConnectors = [connector];
    revenue.retailCommerceOrders = [order];

    render(
      <BakalooRetailCommandCenter
        revenue={revenue}
        onPos={vi.fn()}
        onOrders={vi.fn()}
        onStock={vi.fn()}
        onDelivery={vi.fn()}
        onCash={vi.fn()}
        onCustomers={vi.fn()}
        onSetup={vi.fn()}
      />,
    );

    const whatsappRow = screen.getByText('WhatsApp').closest('li');
    expect(whatsappRow?.querySelector('.bakaloo-command__channel-progress > b')?.getAttribute('data-empty')).toBe('true');
  });
});
