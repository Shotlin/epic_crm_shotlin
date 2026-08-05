import { describe, expect, it } from 'vitest';
import { createFinanceReadProjection } from './finance-read-projection';
import { createInitialRevenueOpsState } from './revenue-ops';

function controlledState() {
  const state = createInitialRevenueOpsState();
  state.receivables = [{
    id: 'receivable-current', invoiceId: 'invoice-current', accountId: 'account-alpha',
    invoiceNumber: 'INV-26-27-00001', invoiceDate: '2026-07-01', dueDate: '2026-07-31',
    originalAmount: 118000, adjustmentAmount: 0, paidAmount: 18000, outstandingAmount: 100000,
    status: 'partially-paid', scope: structuredClone(state.scope), version: 1,
  }, {
    id: 'receivable-legacy', invoiceId: 'invoice-legacy', accountId: 'account-beta',
    invoiceNumber: 'INV-LEGACY', invoiceDate: '2026-07-01', dueDate: '2026-07-31',
    originalAmount: 50000, adjustmentAmount: 0, paidAmount: 0, outstandingAmount: 50000,
    status: 'current', version: 1,
  }];
  state.treasuryPositions = [{
    id: 'position-current', bankAccountId: 'bank-current', asOfDate: '2026-07-16',
    availableBalance: 325000, source: 'treasury-control', evidenceReference: 'BANK-REF-001',
    recordedBy: 'user-avery', recordedAt: '2026-07-16T10:00:00.000Z',
    scope: structuredClone(state.scope), version: 1,
  }];
  return state;
}

const readAllowed = () => ({ allowed: true, deniedFields: [] });

describe('finance read projection', () => {
  it('filters financial-control rows by exact company and branch, excluding unscoped legacy records', () => {
    const projection = createFinanceReadProjection(controlledState(), readAllowed);

    expect(projection.receivables.map(({ id }) => id)).toEqual(['receivable-current']);
    expect(projection.treasuryPositions.map(({ id }) => id)).toEqual(['position-current']);
  });

  it('hides receivable records and all dependent exposure metrics when read access is denied', () => {
    const projection = createFinanceReadProjection(controlledState(), (resource) => (
      resource === 'finance.receivable' ? { allowed: false, deniedFields: [] } : readAllowed()
    ));

    expect(projection.receivables).toEqual([]);
    expect(projection.hiddenCollections).toEqual(expect.arrayContaining([
      'invoices', 'creditDebitNotes', 'receivables', 'paymentReceipts',
    ]));
    expect(projection.redactedMetrics).toEqual(expect.arrayContaining([
      'outstandingReceivables', 'overdueReceivables', 'unappliedCash',
    ]));
  });

  it('removes a restricted receivable amount and its derived exposure metrics without mutating state', () => {
    const state = controlledState();
    const projection = createFinanceReadProjection(state, (resource) => (
      resource === 'finance.receivable'
        ? { allowed: true, deniedFields: ['outstandingAmount'] }
        : readAllowed()
    ));

    expect(projection.receivables[0]).not.toHaveProperty('outstandingAmount');
    expect(projection.redactedMetrics).toContain('outstandingReceivables');
    expect(state.receivables[0]).toHaveProperty('outstandingAmount', 100000);
  });
});
