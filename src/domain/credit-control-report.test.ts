import { describe, expect, it } from 'vitest';
import type { CreditLimitControl } from '../shared/collections-finance-contracts';
import type { Receivable } from '../shared/revenue-ops-contracts';
import { computeCreditLimitUtilisation } from './credit-control-report';

const control = (overrides: Partial<CreditLimitControl> = {}): CreditLimitControl => ({
  id: 'credit-1', number: 'CRL-26-27-00001', accountId: 'account-1', currency: 'INR', creditLimit: 100_000,
  warningThresholdPercent: 80, graceDays: 10, blockNewOrders: true, riskGrade: 'B',
  rationale: 'Reviewed working-capital evidence.', status: 'approved', requestedBy: 'maker', requestedAt: '2026-07-01T08:00:00.000Z',
  decidedBy: 'checker', decidedAt: '2026-07-01T09:00:00.000Z', version: 2, ...overrides,
});

const receivable = (overrides: Partial<Receivable> = {}): Receivable => ({
  id: 'receivable-1', invoiceId: 'invoice-1', accountId: 'account-1', invoiceNumber: 'INV-1', invoiceDate: '2026-06-01', dueDate: '2026-07-10',
  originalAmount: 90_000, adjustmentAmount: 0, paidAmount: 0, outstandingAmount: 90_000, status: 'overdue', version: 1, ...overrides,
});

describe('computeCreditLimitUtilisation', () => {
  it('projects available credit, warning utilisation and overdue grace holds', () => {
    const report = computeCreditLimitUtilisation({
      controls: [control()], receivables: [receivable()], asOfDate: '2026-07-31',
    });

    expect(report).toMatchObject({ controlCount: 1, approvedControlCount: 1, totalLimit: 100_000, totalExposure: 90_000, totalAvailable: 10_000, warningCount: 1, holdCount: 1, actionRequired: true });
    expect(report.rows[0]).toMatchObject({ accountId: 'account-1', utilisationPercent: 90, availableCredit: 10_000, overdueAmount: 90_000, overdueBeyondGrace: true, state: 'hold', nextAction: 'credit-hold' });
  });

  it('keeps pending controls visible without granting counter credit', () => {
    const report = computeCreditLimitUtilisation({
      controls: [control({ id: 'credit-pending', number: 'CRL-26-27-00002', status: 'pending', decidedBy: undefined, decidedAt: undefined, version: 1 })],
      receivables: [receivable({ id: 'receivable-2', outstandingAmount: 20_000, status: 'current', dueDate: '2026-08-30' })],
      asOfDate: '2026-07-31',
    });

    expect(report.rows[0]).toMatchObject({ status: 'pending', availableCredit: 0, utilisationPercent: 0, state: 'pending-review', nextAction: 'approve-credit' });
    expect(report.totalAvailable).toBe(0);
  });
});
