import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { RetailInterBranchTransfer } from '../shared/retail-interbranch-contracts';
import { RetailInterBranchWorkbench } from './RetailInterBranchWorkbench';

const SNAPSHOT_TIME = '2026-08-04T12:00:00.000Z';

function baseRevenue(): RevenueOpsSnapshot {
  return getRevenueOpsSnapshot(createInitialRevenueOpsState(), {
    opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [],
  }, SNAPSHOT_TIME);
}

function transfer(status: RetailInterBranchTransfer['status']): RetailInterBranchTransfer {
  return {
    id: `transfer-${status}`,
    number: 'IBT/26-27/00001',
    direction: 'outbound',
    originBranchId: 'branch-origin',
    destinationBranchId: 'branch-destination',
    sourceWarehouseId: 'warehouse-origin',
    destinationWarehouseId: 'warehouse-destination',
    sourceBinId: 'bin-origin',
    destinationBinId: 'bin-destination',
    inventoryTransferId: 'inventory-transfer-1',
    lines: [{ itemVariantId: 'sku-1', serialUnitIds: [], quantity: 5, unitCost: 100 }],
    totalValue: 500,
    status,
    requestedBy: 'requester-1',
    requestedAt: SNAPSHOT_TIME,
    approvedBy: status === 'approved' || status === 'dispatched' || status === 'arrived' ? 'approver-1' : undefined,
    approvedAt: status === 'approved' || status === 'dispatched' || status === 'arrived' ? SNAPSHOT_TIME : undefined,
    dispatchedBy: status === 'dispatched' || status === 'arrived' ? 'dispatcher-1' : undefined,
    dispatchedAt: status === 'dispatched' || status === 'arrived' ? SNAPSHOT_TIME : undefined,
    version: 8,
  };
}

function revenueWithTransfer(status: RetailInterBranchTransfer['status']): RevenueOpsSnapshot {
  return { ...baseRevenue(), retailInterBranchTransfers: [transfer(status)] };
}

afterEach(() => cleanup());

describe('RetailInterBranchWorkbench', () => {
  it('requires independent approval evidence instead of supplying a canned branch approval', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<RetailInterBranchWorkbench revenue={revenueWithTransfer('draft')} busy={false} activeActorId="reviewer-1" onDecide={onDecide} />);

    const button = screen.getByRole('button', { name: 'Approve with evidence' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Independent approval evidence'), 'IBT-APP-124 / regional stock controller');
    await user.click(button);
    expect(onDecide).toHaveBeenCalledWith({
      id: 'transfer-draft',
      decision: 'approved',
      evidenceReference: 'IBT-APP-124 / regional stock controller',
      expectedVersion: 8,
    });
  });

  it('captures both manifest and source scanner evidence before dispatch custody', async () => {
    const user = userEvent.setup();
    const onDispatch = vi.fn().mockResolvedValue(undefined);
    render(<RetailInterBranchWorkbench revenue={revenueWithTransfer('approved')} busy={false} activeActorId="logistics-1" onDispatch={onDispatch} />);

    const button = screen.getByRole('button', { name: 'Record dispatch custody' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Dispatch manifest reference'), 'MAN-9001 / truck MH12AB1234');
    await user.type(screen.getByLabelText('Source scanner or seal evidence'), 'SCAN-BATCH-81 / seal-556');
    await user.click(button);
    expect(onDispatch).toHaveBeenCalledWith({
      id: 'transfer-approved',
      evidenceReference: 'Manifest MAN-9001 / truck MH12AB1234; source scan/seal SCAN-BATCH-81 / seal-556',
      expectedVersion: 8,
    });
  });

  it('captures received quantities and a destination count/scanner record before arrival', async () => {
    const user = userEvent.setup();
    const onReceive = vi.fn().mockResolvedValue(undefined);
    render(<RetailInterBranchWorkbench revenue={revenueWithTransfer('dispatched')} busy={false} activeActorId="receiver-1" onReceive={onReceive} />);

    const button = screen.getByRole('button', { name: 'Verify arrival with evidence' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Received quantities evidence'), 'SKU-1: 5 units received');
    await user.type(screen.getByLabelText('Destination scanner or count evidence'), 'RECEIVE-SCAN-15 / count sheet 202');
    await user.click(button);
    expect(onReceive).toHaveBeenCalledWith({
      id: 'transfer-dispatched',
      evidenceReference: 'Received quantities SKU-1: 5 units received; destination scan/count RECEIVE-SCAN-15 / count sheet 202',
      expectedVersion: 8,
    });
  });

  it('keeps a transfer requester out of the independent approval gate', () => {
    render(<RetailInterBranchWorkbench revenue={revenueWithTransfer('draft')} busy={false} activeActorId="requester-1" onDecide={vi.fn()} />);

    expect((screen.getByLabelText('Independent approval evidence') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('The transfer requester cannot approve it.')).toBeTruthy();
  });
});
