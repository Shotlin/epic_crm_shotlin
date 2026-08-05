import { describe, expect, it } from 'vitest';
import { computeRetailSellOverview } from './retail-sell-overview';

describe('computeRetailSellOverview', () => {
  it('summarises active tills and completed INR sales', () => {
    const report = computeRetailSellOverview({
      counters: [{ id: 'counter-1', name: 'Front counter', active: true } as never],
      shifts: [{ id: 'shift-1', status: 'open' } as never],
      sales: [{ id: 'sale-1', number: 'INV-1', counterId: 'counter-1', saleAt: '2026-08-03T10:00:00Z', status: 'completed', taxPreview: { grandTotal: 1200 }, tenders: [{ method: 'upi', amount: 1200 }] } as never],
    });
    expect(report.summary).toMatchObject({ activeCounters: 1, openShifts: 1, completedSales: 1, billedValue: 1200, averageBasket: 1200 });
    expect(report.recentSales[0]).toMatchObject({ number: 'INV-1', counterLabel: 'Front counter', value: 1200, tenderMethods: ['upi'] });
  });

  it('stays empty without sales or tills', () => {
    const report = computeRetailSellOverview({ counters: [], shifts: [], sales: [] });
    expect(report.summary).toMatchObject({ activeCounters: 0, openShifts: 0, completedSales: 0, billedValue: 0, averageBasket: 0 });
    expect(report.recentSales).toEqual([]);
  });

  it('surfaces offline checkout attention without inventing a posted sale', () => {
    const report = computeRetailSellOverview({ counters: [], shifts: [], sales: [], offlineQueue: [
      { id: 'offline-1', transactionKey: 'POS-1', input: {} as never, payloadChecksum: 'a'.repeat(64), status: 'queued', queuedBy: 'cashier', queuedAt: '2026-08-03T10:00:00Z', attempts: 0, scope: undefined, version: 1 },
      { id: 'offline-2', transactionKey: 'POS-2', input: {} as never, payloadChecksum: 'b'.repeat(64), status: 'conflict', queuedBy: 'cashier', queuedAt: '2026-08-03T10:01:00Z', attempts: 1, lastSyncMode: 'recovery', scope: undefined, version: 2 },
    ] });
    expect(report.summary).toMatchObject({ completedSales: 0, offlineQueued: 1, offlineConflicts: 1, offlineRecoveryAttempts: 1 });
  });
});
