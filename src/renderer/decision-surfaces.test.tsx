import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialCrmState, getDashboardSnapshot } from '../domain/crm';
import { createInitialKernelState, getKernelSnapshot } from '../domain/kernel';
import { createInitialPartyState, getPartySnapshot } from '../domain/party';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import { CommerceInsightsPanel } from './CommerceInsightsPanel';
import { CommercePerformancePanel } from './CommercePerformancePanel';
import { CollectionsCashHealthPanel } from './CollectionsCashHealthPanel';
import { CashApplicationWorkbench } from './CashApplicationWorkbench';
import { GovernedControlTowerPanel } from './GovernedControlTowerPanel';

const snapshotTime = '2026-07-21T09:00:00.000Z';

function createGovernedSnapshots() {
  const crm = createInitialCrmState();
  const party = createInitialPartyState();
  const kernel = createInitialKernelState();
  const revenue = getRevenueOpsSnapshot(createInitialRevenueOpsState(), {
    opportunities: crm.opportunities,
    accounts: party.accounts,
    contacts: party.contacts,
    addresses: party.addresses,
    activeUserIds: kernel.users.map(({ id }) => id),
  }, snapshotTime);

  return {
    dashboard: getDashboardSnapshot(crm, snapshotTime),
    kernel: getKernelSnapshot(kernel, snapshotTime),
    party: getPartySnapshot(party),
    revenue,
  };
}

afterEach(() => cleanup());

describe('governed decision surfaces', () => {
  it('renders Commerce intelligence from the governed India snapshots, not fabricated booked revenue', async () => {
    const user = userEvent.setup();
    const snapshots = createGovernedSnapshots();
    const onNavigate = vi.fn();

    render(
      <CommerceInsightsPanel
        dashboard={snapshots.dashboard}
        revenue={snapshots.revenue}
        party={snapshots.party}
        onNavigate={onNavigate}
      />,
    );

    const panel = screen.getByTestId('commerce-insights');
    expect(panel.textContent).toContain('Turn operating evidence into the next right move.');
    expect(within(panel).getByText('Distributor operations platform')).toBeTruthy();
    expect(panel.textContent).toContain('₹48L');
    expect(panel.textContent).toContain('Awaiting the first non-cancelled sales order.');
    expect(panel.textContent).toContain('Awaiting the first issued, non-cancelled tax invoice.');

    await user.click(within(panel).getByRole('button', { name: 'Open pursuits' }));
    expect(onNavigate).toHaveBeenLastCalledWith('pursuits');
  });

  it('renders a period performance pack without collapsing orders, billing, GST and cash into one number', async () => {
    const user = userEvent.setup();
    const snapshots = createGovernedSnapshots();
    const onNavigate = vi.fn();

    render(
      <CommercePerformancePanel
        dashboard={snapshots.dashboard}
        revenue={snapshots.revenue}
        party={snapshots.party}
        onNavigate={onNavigate}
      />,
    );

    const panel = screen.getByTestId('commerce-performance');
    expect(panel.textContent).toContain('A clean view of what the business actually recorded.');
    expect(within(panel).getByText('Ordered value')).toBeTruthy();
    expect(within(panel).getByText('Issued billing')).toBeTruthy();
    expect(within(panel).getByText('GST on billing')).toBeTruthy();
    expect(within(panel).getByText('Recorded collections')).toBeTruthy();
    expect(panel.textContent).toContain('Awaiting evidence');

    await user.click(within(panel).getByRole('button', { name: 'Open products' }));
    expect(onNavigate).toHaveBeenLastCalledWith('commerce');
  });

  it('uses controlled inclusive India business dates for this month, last month and a custom range', async () => {
    const user = userEvent.setup();
    const snapshots = createGovernedSnapshots();

    render(
      <CommercePerformancePanel
        dashboard={snapshots.dashboard}
        revenue={snapshots.revenue}
        party={snapshots.party}
        onNavigate={vi.fn()}
      />,
    );

    const panel = screen.getByTestId('commerce-performance');
    const selectedPeriod = within(panel).getByTestId('commerce-performance-selected-period');
    expect(selectedPeriod.textContent).toContain('1 Jul 2026 – 31 Jul 2026');

    await user.click(within(panel).getByRole('radio', { name: 'Last month' }));
    expect(selectedPeriod.textContent).toContain('1 Jun 2026 – 30 Jun 2026');

    await user.click(within(panel).getByRole('radio', { name: 'Custom range' }));
    const start = within(panel).getByLabelText('Start date');
    const end = within(panel).getByLabelText('End date');
    await user.clear(start);
    await user.type(start, '2026-07-03');
    await user.clear(end);
    await user.type(end, '2026-07-05');

    expect(selectedPeriod.textContent).toContain('3 Jul 2026 – 5 Jul 2026');
    expect(panel.textContent).toContain('30 Jun 2026 – 2 Jul 2026');
  });

  it('keeps customer cash, bank matching and outgoing settlement evidence visibly separate', async () => {
    const user = userEvent.setup();
    const snapshots = createGovernedSnapshots();
    const onOpenDesk = vi.fn();

    render(<CollectionsCashHealthPanel revenue={snapshots.revenue} onOpenDesk={onOpenDesk} />);

    const panel = screen.getByTestId('collections-cash-health');
    expect(panel.textContent).toContain('What arrived, what was applied, and what still needs proof.');
    expect(within(panel).getByText('Period receipts')).toBeTruthy();
    expect(within(panel).getByText('Open receivables')).toBeTruthy();
    expect(within(panel).getByText('Unmatched bank inflow')).toBeTruthy();
    expect(panel.textContent).toContain('Awaiting evidence');
    expect(panel.textContent).toContain('Treasury owns this separate supplier-payment investigation queue.');

    await user.click(within(panel).getByRole('button', { name: 'Open recovery' }));
    expect(onOpenDesk).toHaveBeenLastCalledWith('recovery');
  });

  it('applies existing unapplied cash against one or more open invoices without recording another receipt', async () => {
    const user = userEvent.setup();
    const snapshots = createGovernedSnapshots();
    const account = snapshots.party.accounts[0]!;
    const revenue = {
      ...snapshots.revenue,
      receivables: [{
        id: 'receivable-cash-application',
        invoiceId: 'invoice-cash-application',
        invoiceNumber: 'INV-26-27-0042',
        accountId: account.id,
        invoiceDate: '2026-07-08',
        dueDate: '2026-08-07',
        originalAmount: 25000,
        adjustmentAmount: 0,
        paidAmount: 0,
        outstandingAmount: 25000,
        status: 'due' as const,
        version: 4,
      }],
      paymentReceipts: [{
        id: 'receipt-unapplied',
        number: 'RCT-26-27-0017',
        accountId: account.id,
        receivedAt: '2026-07-20T09:00:00.000Z',
        method: 'upi' as const,
        reference: 'UPI-901',
        amount: 25000,
        allocations: [],
        unappliedAmount: 25000,
        status: 'recorded' as const,
        recordedBy: 'user-avery',
        version: 7,
      }],
      journalDrafts: [{
        id: 'journal-payment-901',
        sourceType: 'payment' as const,
        sourceId: 'receipt-unapplied',
        sourceNumber: 'RCT-26-27-0017',
        postingDate: '2026-07-20',
        lines: [],
        totalDebit: 25000,
        totalCredit: 25000,
        status: 'draft' as const,
        checksum: 'test-checksum',
        version: 5,
      }],
    };
    const onApplyUnappliedReceipt = vi.fn().mockResolvedValue(undefined);

    render(<CashApplicationWorkbench revenue={revenue} party={snapshots.party} busy={false} onApplyUnappliedReceipt={onApplyUnappliedReceipt} />);

    const receiptSelector = screen.getByLabelText('Recorded receipt with unapplied cash');
    await user.selectOptions(receiptSelector, 'receipt-unapplied');
    await user.type(screen.getByLabelText('Allocation evidence reference'), 'BANK-REF-901');
    await user.type(screen.getByLabelText('Allocation amount 1'), '25000');
    await user.click(screen.getByRole('button', { name: 'Apply recorded cash' }));

    expect(onApplyUnappliedReceipt).toHaveBeenCalledWith({
      id: 'receipt-unapplied',
      expectedVersion: 7,
      expectedJournalVersion: 5,
      evidenceReference: 'BANK-REF-901',
      allocations: [{ receivableId: 'receivable-cash-application', amount: 25000, expectedVersion: 4 }],
    });
  });

  it('renders the Control Tower from its governed sources and exposes only source navigation', async () => {
    const user = userEvent.setup();
    const snapshots = createGovernedSnapshots();
    const onNavigate = vi.fn();

    render(
      <GovernedControlTowerPanel
        dashboard={snapshots.dashboard}
        revenue={snapshots.revenue}
        kernel={snapshots.kernel}
        onNavigate={onNavigate}
      />,
    );

    const panel = screen.getByTestId('governed-control-tower-panel');
    expect(panel.textContent).toContain('One real attention queue for the business');
    expect(within(panel).getByText(/Revenue intelligence workspace/)).toBeTruthy();
    expect(panel.textContent).not.toContain('Renewal at risk');
    expect(panel.textContent).toContain('SCOPE NSIN / MUM');
    expect(panel.textContent).not.toContain('company-northstar-us');
    expect(within(panel).queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Resolve' })).toBeNull();

    const opportunityRow = within(panel).getByText(/Revenue intelligence workspace/).closest('[data-severity]');
    expect(opportunityRow).not.toBeNull();
    if (!(opportunityRow instanceof HTMLElement)) throw new Error('Expected the live opportunity row to be rendered.');
    await user.click(within(opportunityRow).getByRole('button', { name: 'Open source' }));
    expect(onNavigate).toHaveBeenLastCalledWith('crm');
  });
});
