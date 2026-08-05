import { describe, expect, it } from 'vitest';
import { computeRetailCashOverview } from './retail-cash-overview';

describe('computeRetailCashOverview', () => {
  it('prioritises a close request with variance and totals INR tenders', () => {
    const report = computeRetailCashOverview({
      counters: [{ id: 'counter-1', name: 'Front counter', code: 'C1' } as never],
      shifts: [{ id: 'shift-1', number: 'SHIFT-001', counterId: 'counter-1', cashierId: 'cashier', openedAt: '2026-08-03T09:00:00Z', openingCash: 1000, status: 'close-requested', expectedCash: 2200, declaredCash: 2100, variance: -100, tenderVariance: -100, version: 1 }],
      sales: [{ id: 'sale-1', cashierShiftId: 'shift-1', status: 'completed', taxPreview: { grandTotal: 1200 }, tenders: [{ id: 't-1', method: 'cash', amount: 1200, reference: 'CASH' }] } as never],
      receipts: [{ id: 'receipt-1', status: 'recorded', amount: 1200 } as never],
    });
    expect(report.rows[0]).toMatchObject({ counterLabel: 'Front counter', risk: 'review', variance: -100, salesValue: 1200 });
    expect(report.summary).toMatchObject({ closeRequests: 1, reviewCount: 1, unresolvedReceipts: 1, tenderTotals: { cash: 1200 } });
  });

  it('does not invent a till when the workspace has no local evidence', () => {
    const report = computeRetailCashOverview({ shifts: [], counters: [], sales: [], receipts: [] });
    expect(report.rows).toEqual([]);
    expect(report.summary.shifts).toBe(0);
  });
});
