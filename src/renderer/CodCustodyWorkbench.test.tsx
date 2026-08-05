import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCleanKernelState, getKernelSnapshot } from '../domain/kernel';
import { createCleanPartyState, getPartySnapshot } from '../domain/party';
import { createCleanRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { CodCollectionCase, RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { CodCustodyWorkbench } from './CodCustodyWorkbench';

const SNAPSHOT_TIME = '2026-07-21T12:00:00.000Z';

function cleanRevenue(): RevenueOpsSnapshot {
  const kernel = getKernelSnapshot(createCleanKernelState(), SNAPSHOT_TIME);
  const party = getPartySnapshot(createCleanPartyState(), SNAPSHOT_TIME);
  return getRevenueOpsSnapshot(createCleanRevenueOpsState(), {
    opportunities: [],
    accounts: party.accounts,
    contacts: party.contacts,
    addresses: party.addresses,
    activeUserIds: kernel.users.map(({ id }) => id),
  }, SNAPSHOT_TIME);
}

function renderWorkbench(revenue: RevenueOpsSnapshot) {
  return render(
    <CodCustodyWorkbench
      revenue={revenue}
      busy={false}
      onCreateCase={vi.fn()}
      onRecordHandover={vi.fn()}
      onRecordCarrierCollection={vi.fn()}
      onRecordRemittance={vi.fn()}
      onMatchBank={vi.fn()}
      onCloseShortfall={vi.fn()}
      onRecordException={vi.fn()}
    />,
  );
}

afterEach(() => cleanup());

describe('CodCustodyWorkbench', () => {
  it('keeps a clean India workspace truthful rather than manufacturing COD totals', () => {
    renderWorkbench(cleanRevenue());

    expect(screen.getByRole('heading', { name: 'Cash-on-delivery custody desk' })).toBeTruthy();
    expect(screen.getByText('No eligible COD route is ready. Create a COD promise, linked package, carrier boundary, issued invoice, and open receivable first.')).toBeTruthy();
    expect(screen.getByText('No COD custody cases are in scope. The queue stays empty instead of inventing a settlement total.')).toBeTruthy();
    expect(screen.queryByText('Mark bank matched')).toBeNull();
  });

  it('renders a live expected case as a custody chain—not a cash settlement', () => {
    const base = cleanRevenue();
    const item: CodCollectionCase = {
      id: 'cod-case-001',
      number: 'COD-26-27-00001',
      currency: 'INR',
      deliveryPromiseId: 'promise-001',
      shipmentPackageId: 'shipment-001',
      salesOrderId: 'sales-order-001',
      carrierAdapterId: 'carrier-001',
      receivableId: 'receivable-001',
      expectedAmount: 1_250,
      status: 'expected',
      createdBy: 'user-avery',
      createdAt: SNAPSHOT_TIME,
      scope: base.scope,
      version: 1,
    };
    const revenue = { ...base, codCollectionCases: [item] };

    renderWorkbench(revenue);

    const queueCase = screen.getByRole('button', { name: /COD-26-27-00001/i });
    expect(within(queueCase).getByText('Expected')).toBeTruthy();
    const detail = screen.getByText('Custody case / COD-26-27-00001').closest('article');
    expect(detail).toBeTruthy();
    expect(within(detail!).getByText('Record carrier handover')).toBeTruthy();
    expect(within(detail!).getByText('Use dispatch/handover evidence; this does not prove collection.')).toBeTruthy();
  });
});
