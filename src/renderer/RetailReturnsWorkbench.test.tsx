import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailReturnsWorkbench } from './RetailReturnsWorkbench';

const SNAPSHOT_TIME = '2026-08-04T12:00:00.000Z';

function revenueWithExchangeAndPreparedWorkpaper(): RevenueOpsSnapshot {
  const base = getRevenueOpsSnapshot(createInitialRevenueOpsState(), {
    opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [],
  }, SNAPSHOT_TIME);
  return {
    ...base,
    retailExchanges: [{
      id: 'exchange-1',
      number: 'EXCH/26-27/00001',
      retailReturnId: 'return-1',
      retailReturnNumber: 'RTRN/26-27/00001',
      financialCreditId: 'credit-1',
      sourceCreditVersion: 1,
      counterId: 'counter-1',
      cashierShiftId: 'shift-1',
      cashierId: 'cashier-1',
      customerAccountId: 'customer-1',
      transactionKey: 'EXCHANGE-REQUEST-1',
      requestChecksum: 'exchange-checksum-1',
      replacementLines: [],
      replacementSubtotal: 100,
      replacementTaxPreview: { treatment: 'intra-state', taxableValue: 100, cgst: 9, sgst: 9, igst: 0, cess: 0, totalTax: 18, grandTotal: 118, determination: 'commercial-estimate' },
      replacementGrandTotal: 118,
      replacementCostTotal: 70,
      creditApplied: 118,
      netTopUp: 0,
      status: 'requested',
      requestedBy: 'cashier-1',
      requestedAt: SNAPSHOT_TIME,
      version: 5,
    }],
    retailCreditNoteReconciliations: [{
      id: 'credit-note-1',
      number: 'RCN/202608/00001',
      retailReturnId: 'return-1',
      retailReturnNumber: 'RTRN/26-27/00001',
      gstCreditEvidenceId: 'gst-credit-1',
      gstCreditEvidenceNumber: 'CN-1',
      sourceInvoiceId: 'invoice-1',
      sourceInvoiceNumber: 'INV-1',
      filingPeriod: '2026-08',
      taxableValue: 100,
      cgst: 9,
      sgst: 9,
      igst: 0,
      cess: 0,
      totalTax: 18,
      totalCredit: 118,
      payloadChecksum: 'local-workpaper-checksum-1234567890',
      status: 'prepared',
      requestedBy: 'cashier-1',
      requestedAt: SNAPSHOT_TIME,
      version: 3,
    }],
  };
}

function renderWorkbench(
  activeActorId: string,
  handlers: Partial<ComponentProps<typeof RetailReturnsWorkbench>> = {},
) {
  return render(<RetailReturnsWorkbench
    revenue={revenueWithExchangeAndPreparedWorkpaper()}
    busy={false}
    activeActorId={activeActorId}
    onCreateRetailReturnRequest={vi.fn()}
    onInspectRetailReturn={vi.fn()}
    onDecideRetailReturn={vi.fn()}
    onRequestRetailReturnSettlement={vi.fn()}
    onDecideRetailReturnSettlement={vi.fn()}
    onConfirmRetailReturnProviderRefund={vi.fn()}
    {...handlers}
  />);
}

afterEach(() => cleanup());

describe('RetailReturnsWorkbench truth controls', () => {
  it('requires independent user-entered evidence before approving an exchange', async () => {
    const user = userEvent.setup();
    const onDecideRetailExchange = vi.fn().mockResolvedValue(undefined);
    renderWorkbench('reviewer-1', { onDecideRetailExchange });

    const approve = screen.getByRole('button', { name: 'Approve exchange' });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Independent exchange decision evidence'), 'EXCH-REVIEW-71 / replacement and GST credit checked');
    await user.click(approve);
    expect(onDecideRetailExchange).toHaveBeenCalledWith({
      id: 'exchange-1',
      decision: 'approved',
      evidenceReference: 'EXCH-REVIEW-71 / replacement and GST credit checked',
      expectedVersion: 5,
    });
  });

  it('does not generate an accepted GST response and requires received provider evidence', async () => {
    const user = userEvent.setup();
    const onRecordRetailCreditNotePortalResponse = vi.fn().mockResolvedValue(undefined);
    renderWorkbench('reviewer-1', { onRecordRetailCreditNotePortalResponse });

    expect(screen.queryByText('Mark matched evidence')).toBeNull();
    const record = screen.getByRole('button', { name: 'Record received provider response' });
    expect((record as HTMLButtonElement).disabled).toBe(true);

    await user.selectOptions(screen.getByLabelText('Observed provider status'), 'accepted');
    await user.type(screen.getByLabelText('Provider response reference'), 'GSP-ACK-2026-00091');
    await user.type(screen.getByLabelText('Provider response detail'), 'Accepted by the provider sandbox response.');
    expect((record as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText('Provider payload checksum'), 'provider-payload-checksum-987654321');
    await user.click(record);
    expect(onRecordRetailCreditNotePortalResponse).toHaveBeenCalledWith({
      id: 'credit-note-1',
      expectedVersion: 3,
      remoteStatus: 'accepted',
      externalReference: 'GSP-ACK-2026-00091',
      remotePayloadChecksum: 'provider-payload-checksum-987654321',
      responseMessage: 'Accepted by the provider sandbox response.',
    });
  });

  it('keeps the exchange requester out of its own approval gate', () => {
    renderWorkbench('cashier-1', { onDecideRetailExchange: vi.fn() });

    expect((screen.getByLabelText('Independent exchange decision evidence') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('The exchange requester cannot approve or reject it.')).toBeTruthy();
  });
});
