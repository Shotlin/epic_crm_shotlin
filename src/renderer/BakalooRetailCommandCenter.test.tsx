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

    await user.click(screen.getAllByRole('button', { name: /^Start sale/ })[0]!);
    await user.click(screen.getByRole('button', { name: /^Pack orders/ }));
    await user.click(screen.getByRole('button', { name: /^Check stock/ }));
    await user.click(screen.getAllByRole('button', { name: 'Open delivery' })[0]!);
    await user.click(screen.getByRole('button', { name: /^Close cash/ }));
    await user.click(screen.getByRole('button', { name: 'Find customer' }));
    await user.click(screen.getByRole('button', { name: /^Set up store/ }));

    expect(onPos).toHaveBeenCalledTimes(1);
    expect(onOrders).toHaveBeenCalledTimes(1);
    expect(onStock).toHaveBeenCalledTimes(1);
    expect(onDelivery).toHaveBeenCalledTimes(1);
    expect(onCash).toHaveBeenCalledTimes(1);
    expect(onCustomers).toHaveBeenCalledTimes(1);
    expect(onSetup).toHaveBeenCalledTimes(1);
  });

  it('shows a useful empty retail starter state without invented values or foreign currency', async () => {
    const user = userEvent.setup();
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
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Good morning. Here is what needs attention.' })).toBeTruthy();
    expect(commandCenter.textContent).toContain('Operate sales, orders, stock, cash and customers from one screen.');
    expect(screen.getByRole('region', { name: 'Store activity' }).textContent).toContain('0 riders with verified live evidence');
    expect(commandCenter.textContent).toContain('No recorded exception needs a decision.');
    [
      'Revenue trend', 'Revenue by category', 'Revenue vs orders', 'Orders by hour',
      'Top products', 'Low stock alerts', 'Live rider map',
    ].forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
    expect(commandCenter.textContent).toContain('₹0');
    expect(commandCenter.textContent).not.toContain('$');
    expect(screen.getByRole('button', { name: 'Today' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'This month' }));
    expect(screen.getByRole('button', { name: 'This month' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Today' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the actual mapped channel without manufacturing activity for another channel', () => {
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

    expect(screen.getByText('Marketplace')).toBeTruthy();
    expect(screen.queryByText('WhatsApp')).toBeNull();
  });
});
