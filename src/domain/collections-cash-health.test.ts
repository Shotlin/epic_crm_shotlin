import { describe, expect, it } from 'vitest';
import { buildCollectionsCashHealth } from './collections-cash-health';
import { createInitialCrmState, getDashboardSnapshot } from './crm';
import { createInitialPartyState } from './party';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from './revenue-ops';
import type { OperatingRecordScope, PaymentReceipt, Receivable } from '../shared/revenue-ops-contracts';
import type { BankStatementLine, DunningCase, ReceivableDispute } from '../shared/collections-finance-contracts';
import type { SettlementException } from '../shared/treasury-contracts';

const scope: OperatingRecordScope = { companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' };

function snapshots() {
  const crm = createInitialCrmState();
  const party = createInitialPartyState();
  const revenue = getRevenueOpsSnapshot(createInitialRevenueOpsState(), {
    opportunities: crm.opportunities,
    accounts: party.accounts,
    contacts: party.contacts,
    addresses: party.addresses,
    activeUserIds: ['user-avery', 'user-priya', 'user-lee'],
  }, '2026-07-15T09:00:00.000Z');
  return { revenue, dashboard: getDashboardSnapshot(crm, '2026-07-15T09:00:00.000Z') };
}

function receipt(
  id: string,
  receivedAt: string,
  amount: number,
  method: PaymentReceipt['method'],
  allocations: PaymentReceipt['allocations'],
  unappliedAmount: number,
  status: PaymentReceipt['status'] = 'recorded',
  recordScope = scope,
): PaymentReceipt {
  return {
    id,
    number: `RCPT-${id}`,
    accountId: 'account-alpha',
    receivedAt,
    method,
    reference: `REF-${id}`,
    amount,
    allocations,
    unappliedAmount,
    status,
    recordedBy: 'user-avery',
    scope: recordScope,
    version: 1,
  };
}

function receivable(
  id: string,
  dueDate: string,
  outstandingAmount: number,
  status: Receivable['status'] = 'overdue',
): Receivable {
  return {
    id,
    invoiceId: `invoice-${id}`,
    accountId: 'account-alpha',
    invoiceNumber: `INV-${id}`,
    invoiceDate: '2026-06-01',
    dueDate,
    originalAmount: outstandingAmount,
    adjustmentAmount: 0,
    paidAmount: 0,
    outstandingAmount,
    status,
    scope,
    version: 1,
  };
}

function dunning(
  id: string,
  stage: DunningCase['stage'],
  status: DunningCase['status'],
  actionableAmount: number,
  daysOverdue: number,
): DunningCase {
  return {
    id,
    number: `DUN-${id}`,
    receivableId: `receivable-${id}`,
    accountId: 'account-alpha',
    stage,
    status,
    daysOverdue,
    actionableAmount,
    ownerId: 'user-priya',
    nextActionAt: '2026-07-16T04:00:00.000Z',
    createdAt: '2026-07-01T04:00:00.000Z',
    updatedAt: '2026-07-15T04:00:00.000Z',
    scope,
    version: 1,
  };
}

function dispute(
  id: string,
  category: ReceivableDispute['category'],
  amount: number,
  status: ReceivableDispute['status'],
): ReceivableDispute {
  return {
    id,
    number: `DIS-${id}`,
    receivableId: `receivable-${id}`,
    accountId: 'account-alpha',
    category,
    amount,
    reason: 'Evidence review required.',
    evidenceReference: `EVID-${id}`,
    ownerId: 'user-priya',
    status,
    openedBy: 'user-avery',
    openedAt: '2026-07-01T04:00:00.000Z',
    scope,
    version: 1,
  };
}

function bankLine(
  id: string,
  transactionDate: string,
  matchStatus: BankStatementLine['matchStatus'],
  credit: number,
  debit = 0,
): BankStatementLine {
  return {
    id,
    statementImportId: 'statement-1',
    transactionDate,
    valueDate: transactionDate,
    description: `Bank line ${id}`,
    reference: `BANK-${id}`,
    debit,
    credit,
    balance: 0,
    fingerprint: `fingerprint-${id}`,
    matchStatus,
    scope,
    version: 1,
  };
}

function settlement(
  id: string,
  code: SettlementException['code'],
  amount: number,
  status: SettlementException['status'],
): SettlementException {
  return {
    id,
    number: `SET-${id}`,
    paymentProposalId: `proposal-${id}`,
    code,
    amount,
    details: 'Settlement evidence needs review.',
    status,
    ownerId: 'user-priya',
    openedBy: 'user-avery',
    openedAt: '2026-07-01T04:00:00.000Z',
    scope,
    version: 1,
  };
}

describe('Collections & Cash Health', () => {
  it('keeps period receipts, allocated/unapplied cash, aging, dunning, disputes, bank matching and settlement exceptions evidence-separated', () => {
    const base = snapshots();
    const revenue = {
      ...base.revenue,
      paymentReceipts: [
        // 20:00 UTC is 01:30 on 1 July in India, proving the period follows IST.
        receipt('upi-boundary', '2026-06-30T20:00:00.000Z', 1_000, 'upi', [{ receivableId: 'receivable-1', amount: 800 }], 200, 'reconciled'),
        receipt('bank', '2026-07-02T04:00:00.000Z', 500, 'bank-transfer', [{ receivableId: 'receivable-2', amount: 500 }], 0),
        receipt('cheque', '2026-07-05', 300, 'cheque', [], 300),
        receipt('variance', '2026-07-06', 100, 'cash', [{ receivableId: 'receivable-3', amount: 80 }], 10),
        receipt('reversed', '2026-07-07', 9_000, 'upi', [], 9_000, 'reversed'),
        receipt('other-scope', '2026-07-08', 8_000, 'upi', [], 8_000, 'recorded', { companyId: 'company-other', branchId: 'branch-other' }),
      ],
      receivables: [
        receivable('1', '2026-06-30', 1_000),
        receivable('2', '2026-05-01', 2_000),
        receivable('3', '2026-07-20', 500, 'current'),
        receivable('4', '2026-06-01', 700, 'paid'),
        receivable('5', 'not-a-date', 300),
      ],
      dunningCases: [
        dunning('1', 'reminder', 'open', 1_000, 15),
        dunning('2', 'credit-hold', 'paused', 2_000, 75),
        dunning('3', 'notice', 'resolved', 900, 30),
      ],
      receivableDisputes: [
        dispute('1', 'billing', 120, 'open'),
        dispute('2', 'tax', 50, 'under-review'),
        dispute('3', 'delivery', 999, 'resolved'),
      ],
      bankStatementLines: [
        bankLine('unmatched', '2026-07-10', 'unmatched', 1_000),
        bankLine('suggested', '2026-07-11', 'suggested', 500),
        bankLine('matched', '2026-07-12', 'matched', 250),
        bankLine('debit', '2026-07-13', 'unmatched', 0, 300),
        bankLine('future', '2026-07-16', 'unmatched', 999),
      ],
      settlementExceptions: [
        settlement('1', 'not-received', 50, 'open'),
        settlement('2', 'amount-mismatch', 100, 'under-review'),
        settlement('3', 'duplicate', 999, 'resolved'),
      ],
    };

    const health = buildCollectionsCashHealth({
      revenue,
      asOfDate: '2026-07-15',
      period: { start: '2026-07-01', end: '2026-07-31' },
    });

    expect(health).toMatchObject({ currency: 'INR', asOfDate: '2026-07-15', period: { timeZone: 'Asia/Kolkata' } });
    expect(health.receipts.recorded).toMatchObject({ state: 'ready', amount: 1_900, recordCount: 4 });
    expect(health.receipts.allocated).toMatchObject({ amount: 1_380, recordCount: 4 });
    expect(health.receipts.unapplied).toMatchObject({ amount: 510, recordCount: 4 });
    expect(health.receipts.allocationMismatchCount).toMatchObject({ count: 1 });
    expect(health.receipts.methodMix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'upi', receiptCount: 1, recordedAmount: 1_000, allocatedAmount: 800, unappliedAmount: 200 }),
      expect.objectContaining({ method: 'cash', receiptCount: 1, allocationMismatchCount: 1 }),
    ]));

    expect(health.receivables.openOutstanding).toMatchObject({ amount: 3_800, recordCount: 4 });
    expect(health.receivables.aging.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ bucket: '1-30', outstandingAmount: 1_000, receivableCount: 1 }),
      expect.objectContaining({ bucket: '61-90', outstandingAmount: 2_000, receivableCount: 1 }),
      expect.objectContaining({ bucket: 'not-due', outstandingAmount: 500, receivableCount: 1 }),
    ]));
    expect(health.receivables.unclassifiableAging).toMatchObject({ amount: 300, recordCount: 1 });

    expect(health.dunning.activeCaseCount).toMatchObject({ count: 2 });
    expect(health.dunning.actionableAmount).toMatchObject({ amount: 3_000, recordCount: 2 });
    expect(health.dunning.workQueue.rows[0]).toMatchObject({ stage: 'credit-hold', actionableAmount: 2_000 });
    expect(health.disputes.openCount).toMatchObject({ count: 2 });
    expect(health.disputes.openAmount).toMatchObject({ amount: 170, recordCount: 2 });
    expect(health.bankReconciliation.unmatchedInbound).toMatchObject({ amount: 1_000, recordCount: 1 });
    expect(health.bankReconciliation.suggestedInbound).toMatchObject({ amount: 500, recordCount: 1 });
    expect(health.bankReconciliation.byMatchStatus.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ matchStatus: 'unmatched', lineCount: 2, inboundAmount: 1_000, outboundAmount: 300 }),
    ]));
    expect(health.settlementExceptions.openCount).toMatchObject({ count: 2 });
    expect(health.settlementExceptions.openAmount).toMatchObject({ amount: 150, recordCount: 2 });
  });

  it('fails closed when finance evidence is withheld or the projection scope is inconsistent', () => {
    const base = snapshots();
    const withheld = buildCollectionsCashHealth({
      revenue: {
        ...base.revenue,
        readProjection: {
          ...base.revenue.readProjection,
          hiddenCollections: ['paymentReceipts'],
          redactedFields: { 'finance.receivable': ['outstandingAmount'] },
          redactedMetrics: ['outstandingReceivables'],
        },
      },
      asOfDate: '2026-07-15',
    });

    expect(withheld.receipts.recorded).toMatchObject({ state: 'restricted', amount: null, restrictedCollections: ['paymentReceipts'] });
    expect(withheld.receivables.openOutstanding).toMatchObject({ state: 'restricted', amount: null, restrictedFields: ['finance.receivable.outstandingAmount'] });

    const mismatched = buildCollectionsCashHealth({
      revenue: {
        ...base.revenue,
        readProjection: { ...base.revenue.readProjection, companyId: 'company-other' },
      },
      asOfDate: '2026-07-15',
    });

    expect(mismatched.state).toBe('restricted');
    expect(mismatched.receipts.recorded).toMatchObject({ state: 'restricted', restrictedCollections: ['scope-mismatch'] });
    expect(mismatched.receivables.aging).toMatchObject({ state: 'restricted', rows: [] });
    expect(mismatched.restrictedSources).toContain('scope-mismatch');
  });
});
