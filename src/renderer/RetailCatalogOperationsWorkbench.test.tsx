import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailCatalogOperationsWorkbench } from './RetailCatalogOperationsWorkbench';

function revenueWithDraftPrinter(): RevenueOpsSnapshot {
  const revenue = getRevenueOpsSnapshot(createInitialRevenueOpsState(), { opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [] }, '2026-08-02T09:00:00.000Z');
  return {
    ...revenue,
    retailPrinterAdapters: [{
      id: 'printer-1', code: 'COUNTER-PRINTER', name: 'Counter printer', connection: 'usb', model: 'ESC/POS', status: 'draft', supportedTemplates: ['barcode'], version: 3,
    }],
  };
}

function revenueWithPendingIndependentDecisions(): RevenueOpsSnapshot {
  const revenue = revenueWithDraftPrinter();
  return {
    ...revenue,
    retailLabelPrintDispatches: [{
      id: 'dispatch-1',
      labelPrintRunId: 'label-run-1',
      printerAdapterId: 'printer-1',
      status: 'prepared',
      payloadChecksum: 'checksum-1234567890',
      requestedBy: 'requester-1',
      requestedAt: '2026-08-02T09:00:00.000Z',
      version: 4,
    }],
    retailCatalogBulkEdits: [{
      id: 'bulk-1',
      number: 'BCAT/26-27/00001',
      changes: [],
      checksum: 'bulk-checksum-1234567890',
      status: 'prepared',
      requestedBy: 'requester-1',
      requestedAt: '2026-08-02T09:00:00.000Z',
      version: 6,
    }],
  };
}

afterEach(() => cleanup());

describe('RetailCatalogOperationsWorkbench', () => {
  it('requires the operator to enter real printer-test evidence instead of submitting a fabricated certification claim', async () => {
    const user = userEvent.setup();
    const onTestPrinter = vi.fn().mockResolvedValue(undefined);
    render(<RetailCatalogOperationsWorkbench revenue={revenueWithDraftPrinter()} busy={false} activeActorId="operator-1" onTestPrinter={onTestPrinter} />);

    const button = screen.getByRole('button', { name: 'Record printer test evidence' });
    await user.click(button);
    expect(onTestPrinter).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Printer test evidence'), 'PRINTER-TEST-2026-08-02: test label counted and matched.');
    await user.click(button);
    expect(onTestPrinter).toHaveBeenCalledWith({ id: 'printer-1', evidenceReference: 'PRINTER-TEST-2026-08-02: test label counted and matched.', expectedVersion: 3 });
  });

  it('requires separate operator evidence before acknowledging a label handoff or applying a bulk catalog edit', async () => {
    const user = userEvent.setup();
    const onDecideDispatch = vi.fn().mockResolvedValue(undefined);
    const onApplyBulk = vi.fn().mockResolvedValue(undefined);
    render(<RetailCatalogOperationsWorkbench revenue={revenueWithPendingIndependentDecisions()} busy={false} activeActorId="reviewer-1" onDecideDispatch={onDecideDispatch} onApplyBulk={onApplyBulk} />);

    const outputButton = screen.getByRole('button', { name: 'Record observed output' });
    expect((outputButton as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Independent output acknowledgement evidence'), 'LABEL-COUNT-19 / operator scan log');
    await user.click(outputButton);
    expect(onDecideDispatch).toHaveBeenCalledWith({
      id: 'dispatch-1',
      decision: 'acknowledged',
      evidenceReference: 'LABEL-COUNT-19 / operator scan log',
      expectedVersion: 4,
    });

    const bulkButton = screen.getByRole('button', { name: 'Apply approved bulk edit' });
    expect((bulkButton as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Independent bulk approval evidence'), 'MERCH-REVIEW-44 / approved by category lead');
    await user.click(bulkButton);
    expect(onApplyBulk).toHaveBeenCalledWith({
      id: 'bulk-1',
      evidenceReference: 'MERCH-REVIEW-44 / approved by category lead',
      expectedVersion: 6,
    });
  });

  it('keeps acknowledgement and bulk application unavailable to their requester', () => {
    render(<RetailCatalogOperationsWorkbench revenue={revenueWithPendingIndependentDecisions()} busy={false} activeActorId="requester-1" onDecideDispatch={vi.fn()} onApplyBulk={vi.fn()} />);

    expect((screen.getByLabelText('Independent output acknowledgement evidence') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Independent bulk approval evidence') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Only an operator other than the requester can record device output or failure.')).toBeTruthy();
    expect(screen.getByText('Only a reviewer other than the requester can apply this bulk change.')).toBeTruthy();
  });
});
