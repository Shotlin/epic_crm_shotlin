import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialKernelState, getKernelSnapshot } from '../domain/kernel';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { PeopleLedger, TreasuryCommand } from './App';

const kernel = getKernelSnapshot(createInitialKernelState());

afterEach(() => cleanup());

function revenueSnapshot(overrides: Partial<RevenueOpsSnapshot>): RevenueOpsSnapshot {
  const state = createInitialRevenueOpsState();
  return {
    ...getRevenueOpsSnapshot(state, {
      opportunities: [],
      accounts: [],
      contacts: [],
      addresses: [],
      activeUserIds: kernel.users.map(({ id }) => id),
    }),
    ...overrides,
  };
}

describe('finance truth boundaries in the renderer', () => {
  it('requires human-entered statutory evidence instead of fabricating a report reference', async () => {
    const user = userEvent.setup();
    const onUpdateObligation = vi.fn().mockResolvedValue(undefined);
    const revenue = revenueSnapshot({
      payrollRuns: [{
        id: 'run-1', number: 'PAY/26-27/00001', periodFrom: '2026-07-01', periodTo: '2026-07-31', paymentDate: '2026-08-01', workforceProfileIds: [], totalGrossPay: 0, totalEmployeeDeductions: 0, totalNetPay: 0, policySnapshots: [], status: 'finalized', version: 3,
      } as unknown as RevenueOpsSnapshot['payrollRuns'][number]],
      payrollStatutoryObligations: [{
        id: 'obligation-1', number: 'OBL/26-27/00001', payrollRunId: 'run-1', payrollPolicyId: 'policy-1', employerRegistrationId: 'registration-1', authority: 'epfo', amount: 1_800, status: 'calculated', updatedBy: 'user-maker', updatedAt: '2026-08-01T09:00:00.000Z', version: 4,
      } as RevenueOpsSnapshot['payrollStatutoryObligations'][number]],
    });

    render(<PeopleLedger revenue={revenue} kernel={kernel} actorId="user-reviewer" busy={false} actions={{ onUpdateObligation } as never} />);

    expect(screen.getByRole('heading', { name: 'Record local evidence before each status change' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record report' })).toBeNull();
    expect(screen.getByText(/does not confirm portal receipt or acceptance/i)).toBeTruthy();

    await user.type(screen.getByLabelText('Local report evidence'), 'EPFO-ACK-2026-0812');
    await user.click(screen.getByRole('button', { name: 'Record local report evidence' }));

    expect(onUpdateObligation).toHaveBeenCalledWith({
      id: 'obligation-1',
      status: 'reported',
      externalReference: 'EPFO-ACK-2026-0812',
      expectedVersion: 4,
    });
  });

  it('requires a real bank/UTR reference before a payment release can be recorded locally', async () => {
    const user = userEvent.setup();
    const onReleasePayment = vi.fn().mockResolvedValue(undefined);
    const revenue = revenueSnapshot({
      paymentProposals: [{
        id: 'payment-1', number: 'PAY/26-27/00009', supplierInvoiceId: 'invoice-1', supplierId: 'supplier-1', bankAccountId: 'bank-1', paymentDate: '2026-08-04', amount: 9_500, paymentReference: 'INV-900', purpose: 'Verified supplier payment', status: 'approved', requestedBy: 'user-maker', requestedAt: '2026-08-04T08:00:00.000Z', approvedBy: 'user-checker', approvedAt: '2026-08-04T08:05:00.000Z', version: 2,
      } as RevenueOpsSnapshot['paymentProposals'][number]],
    });

    render(<TreasuryCommand revenue={revenue} kernel={kernel} busy={false} actions={{ onReleasePayment } as never} />);
    await user.click(screen.getByRole('button', { name: /Payment release$/ }));

    expect(screen.getByRole('heading', { name: 'Maker → approver → evidence recorder' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record bank release' })).toBeNull();
    expect(screen.getByText(/does not submit to or confirm a banking portal/i)).toBeTruthy();

    await user.type(screen.getByLabelText('Local bank-release evidence'), 'UTR-HDFC-20260804-900');
    await user.click(screen.getByRole('button', { name: 'Record local release evidence' }));

    expect(onReleasePayment).toHaveBeenCalledWith({
      id: 'payment-1',
      bankReleaseReference: 'UTR-HDFC-20260804-900',
      expectedVersion: 2,
    });
  });

  it('blocks evidence-less bank-charge reconciliation and requires an entered reference for a sweep release', async () => {
    const user = userEvent.setup();
    const onReleaseSweep = vi.fn().mockResolvedValue(undefined);
    const revenue = revenueSnapshot({
      bankCharges: [{
        id: 'charge-1', number: 'BCH/26-27/00001', bankAccountId: 'bank-1', chargeDate: '2026-08-04', category: 'transaction-fee', amount: 12, taxAmount: 0, reference: 'STMT-CHARGE-1', status: 'recorded', recordedBy: 'user-maker', recordedAt: '2026-08-04T08:00:00.000Z', journalId: 'journal-1', version: 1,
      } as RevenueOpsSnapshot['bankCharges'][number]],
      liquiditySweeps: [{
        id: 'sweep-1', number: 'SWP/26-27/00001', fromBankAccountId: 'bank-1', toBankAccountId: 'bank-2', amount: 25_000, effectiveDate: '2026-08-04', rationale: 'Fund tills for the festival weekend.', status: 'approved', requestedBy: 'user-maker', requestedAt: '2026-08-04T08:00:00.000Z', approvedBy: 'user-checker', approvedAt: '2026-08-04T08:10:00.000Z', version: 2,
      } as RevenueOpsSnapshot['liquiditySweeps'][number]],
    });

    render(<TreasuryCommand revenue={revenue} kernel={kernel} busy={false} actions={{ onReleaseSweep } as never} />);
    await user.click(screen.getByRole('button', { name: /Exceptions \+ liquidity$/ }));

    expect(screen.queryByRole('button', { name: 'Reconcile' })).toBeNull();
    expect(screen.getByText(/has no evidence-bearing statement-match field/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Release' })).toBeNull();

    await user.type(screen.getByLabelText('Local release evidence'), 'UTR-SWEEP-20260804-002');
    await user.click(screen.getByRole('button', { name: 'Record local release evidence' }));

    expect(onReleaseSweep).toHaveBeenCalledWith({
      id: 'sweep-1',
      releaseReference: 'UTR-SWEEP-20260804-002',
      expectedVersion: 2,
    });
  });
});
