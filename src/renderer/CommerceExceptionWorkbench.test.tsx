import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCleanKernelState, getKernelSnapshot } from '../domain/kernel';
import { createCleanPartyState, getPartySnapshot } from '../domain/party';
import { createCleanRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { FulfilmentTask, RevenueOpsSnapshot, SalesOrder } from '../shared/revenue-ops-contracts';
import { CommerceExceptionWorkbench } from './CommerceExceptionWorkbench';

const SNAPSHOT_TIME = '2026-07-21T12:00:00.000Z';

function createCleanSnapshots() {
  const kernelState = createCleanKernelState();
  const partyState = createCleanPartyState();
  const revenueState = createCleanRevenueOpsState();
  const kernel = getKernelSnapshot(kernelState, SNAPSHOT_TIME);
  const party = getPartySnapshot(partyState, SNAPSHOT_TIME);
  const revenue = getRevenueOpsSnapshot(revenueState, {
    opportunities: [],
    accounts: party.accounts,
    contacts: party.contacts,
    addresses: party.addresses,
    activeUserIds: kernel.users.map(({ id }) => id),
  }, SNAPSHOT_TIME);

  return { kernel, party, revenue };
}

function withBlockedFulfilment(base: ReturnType<typeof createCleanSnapshots>): {
  kernel: ReturnType<typeof getKernelSnapshot>;
  party: ReturnType<typeof getPartySnapshot>;
  revenue: RevenueOpsSnapshot;
} {
  const { scope } = base.revenue;
  const order: SalesOrder = {
    id: 'order-exception-001',
    number: 'SO-26-27-0042',
    quoteId: 'quote-exception-001',
    quoteNumber: 'Q-26-27-0042',
    accountId: 'account-customer-001',
    currency: 'INR',
    orderDate: '2026-07-01',
    requiredBy: '2026-07-20',
    status: 'fulfilling',
    fulfilmentStatus: 'in-progress',
    lines: [],
    subtotal: 10_000,
    discountTotal: 0,
    taxPreview: {
      treatment: 'intra-state',
      taxableValue: 10_000,
      cgst: 900,
      sgst: 900,
      igst: 0,
      totalTax: 1_800,
      grandTotal: 11_800,
      determination: 'commercial-estimate',
    },
    approvedQuoteVersion: 1,
    createdBy: 'user-avery',
    createdAt: '2026-07-01T09:00:00.000Z',
    scope,
    version: 1,
  };
  const fulfilmentTask: FulfilmentTask = {
    id: 'fulfilment-exception-001',
    salesOrderId: order.id,
    lineId: 'line-exception-001',
    kind: 'dispatch',
    title: 'Dispatch customer order',
    ownerUserId: 'user-avery',
    dueAt: '2026-07-20T10:00:00.000Z',
    status: 'blocked',
    blockedReason: 'Carrier handover evidence is incomplete.',
    scope,
    version: 1,
  };

  return {
    ...base,
    revenue: {
      ...base.revenue,
      salesOrders: [order],
      fulfilmentTasks: [fulfilmentTask],
    },
  };
}

afterEach(() => cleanup());

describe('CommerceExceptionWorkbench', () => {
  it('shows a truthful empty state for a clean India workspace without inventing work', () => {
    const snapshots = createCleanSnapshots();

    render(
      <CommerceExceptionWorkbench
        revenue={snapshots.revenue}
        party={snapshots.party}
        kernel={snapshots.kernel}
        onOpenSource={vi.fn()}
      />,
    );

    const workbench = screen.getByTestId('commerce-exception-workbench');
    expect(within(workbench).getByText('Scope verified')).toBeTruthy();
    expect(within(workbench).getByText('No live operational exceptions.')).toBeTruthy();
    expect(within(workbench).getByText('As your business records are created, accountable exceptions will appear here.')).toBeTruthy();
    expect(within(workbench).queryByRole('button', { name: /Open source/i })).toBeNull();
  });

  it('renders governed fulfilment evidence and routes the source action to the owning workbench', async () => {
    const user = userEvent.setup();
    const onOpenSource = vi.fn();
    const snapshots = withBlockedFulfilment(createCleanSnapshots());

    render(
      <CommerceExceptionWorkbench
        revenue={snapshots.revenue}
        party={snapshots.party}
        kernel={snapshots.kernel}
        onOpenSource={onOpenSource}
      />,
    );

    const workbench = screen.getByTestId('commerce-exception-workbench');
    expect(within(workbench).getByText('Fulfilment task blocked')).toBeTruthy();
    expect(within(workbench).getByText('Carrier handover evidence is incomplete.')).toBeTruthy();
    expect(within(workbench).getByText(/SO-26-27-0042/)).toBeTruthy();

    await user.click(within(workbench).getByRole('button', { name: /^Review$/i }));
    const detail = within(workbench).getByLabelText('Selected exception detail');
    expect(within(detail).getByText('2 scoped records')).toBeTruthy();

    await user.click(within(detail).getByRole('button', { name: /Open accountable workbench/i }));
    expect(onOpenSource).toHaveBeenCalledTimes(1);
    expect(onOpenSource).toHaveBeenLastCalledWith(
      'sales',
      expect.objectContaining({
        id: 'commerce-exception:fulfilment:fulfilment-exception-001',
        category: 'fulfilment',
        destination: 'sales',
        sourceRecordIds: ['fulfilment-exception-001', 'order-exception-001'],
      }),
    );
  });
});
