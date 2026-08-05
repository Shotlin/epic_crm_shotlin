import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCleanRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailDeliveryControlCenter } from './RetailDeliveryControlCenter';

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

describe('RetailDeliveryControlCenter', () => {
  it('shows a clear empty delivery state without inventing tracking, maps, or foreign currency', () => {
    render(
      <RetailDeliveryControlCenter
        revenue={cleanRetailRevenue()}
        onOpenFulfilment={vi.fn()}
        onOpenServiceability={vi.fn()}
        onOpenCodCustody={vi.fn()}
        onOpenReconciliation={vi.fn()}
      />,
    );

    const controlCenter = screen.getByTestId('retail-delivery-control-center');
    expect(controlCenter.textContent).toContain('No active customer delivery commitments.');
    expect(controlCenter.textContent).toContain('No delivery promises yet.');
    expect(controlCenter.textContent).toContain('Live carrier maps, GPS and route ETAs are not shown');
    expect(controlCenter.textContent).not.toContain('$');
  });

  it('routes each delivery decision to the supplied governed workbench', async () => {
    const user = userEvent.setup();
    const onOpenFulfilment = vi.fn();
    const onOpenServiceability = vi.fn();
    const onOpenCodCustody = vi.fn();
    const onOpenReconciliation = vi.fn();

    render(
      <RetailDeliveryControlCenter
        revenue={cleanRetailRevenue()}
        onOpenFulfilment={onOpenFulfilment}
        onOpenServiceability={onOpenServiceability}
        onOpenCodCustody={onOpenCodCustody}
        onOpenReconciliation={onOpenReconciliation}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Open fulfilment/i }));
    await user.click(screen.getByRole('button', { name: /PIN-code serviceability/i }));
    await user.click(screen.getByRole('button', { name: /COD custody/i }));
    await user.click(screen.getByRole('button', { name: /Packages and handoff/i }));
    await user.click(screen.getByRole('button', { name: /Returns, RTO and online exceptions/i }));

    expect(onOpenFulfilment).toHaveBeenCalledTimes(2);
    expect(onOpenServiceability).toHaveBeenCalledTimes(1);
    expect(onOpenCodCustody).toHaveBeenCalledTimes(1);
    expect(onOpenReconciliation).toHaveBeenCalledTimes(1);
  });

  it('keeps an active promise in the due-next queue ahead of older fulfilled history', () => {
    const revenue = cleanRetailRevenue();
    const makePromise = (
      id: string,
      salesOrderId: string,
      deliveryTo: string,
      status: RevenueOpsSnapshot['deliveryPromises'][number]['status'],
    ): RevenueOpsSnapshot['deliveryPromises'][number] => ({
      id,
      salesOrderId,
      shipToAddress: {
        addressId: `${id}-address`, label: 'Store delivery', line1: 'MG Road', line2: '', city: 'Bengaluru', stateCode: '29', postalCode: '560001', countryCode: 'IN', sourceVersion: 1, capturedAt: generatedAt,
      },
      originLocationId: 'store-primary', ruleId: 'rule-bengaluru', ruleCode: 'BLR', ruleVersion: 1,
      serviceLevel: 'standard', paymentMode: 'prepaid', estimatedWeightKg: 1, orderValue: 500,
      dispatchBy: '2026-08-04', deliveryFrom: '2026-08-04', deliveryTo, timeZone: 'Asia/Kolkata',
      calendarBasis: 'weekly-policy-only', calculationFingerprint: `${id}-fingerprint`, status,
      createdBy: 'user-owner', createdAt: generatedAt, version: 1,
      ...(status === 'fulfilled' ? { fulfilledAt: `${deliveryTo}T12:00:00.000Z` } : {}),
    });
    revenue.deliveryPromises = [
      makePromise('promise-fulfilled-1', 'order-fulfilled-1', '2026-07-01', 'fulfilled'),
      makePromise('promise-fulfilled-2', 'order-fulfilled-2', '2026-07-02', 'fulfilled'),
      makePromise('promise-fulfilled-3', 'order-fulfilled-3', '2026-07-03', 'fulfilled'),
      makePromise('promise-fulfilled-4', 'order-fulfilled-4', '2026-07-04', 'fulfilled'),
      makePromise('promise-fulfilled-5', 'order-fulfilled-5', '2026-07-05', 'fulfilled'),
      makePromise('promise-active-1', 'order-active-1', '2026-08-05', 'active'),
    ];

    render(
      <RetailDeliveryControlCenter
        revenue={revenue}
        onOpenFulfilment={vi.fn()}
        onOpenServiceability={vi.fn()}
        onOpenCodCustody={vi.fn()}
        onOpenReconciliation={vi.fn()}
      />,
    );

    const dueNextQueue = screen.getByRole('list');
    expect(dueNextQueue.firstElementChild?.textContent).toContain('order-active-1');
    expect(screen.getByText('order-active-1')).toBeTruthy();
    expect(screen.queryByText('order-fulfilled-5')).toBeNull();
  });
});
