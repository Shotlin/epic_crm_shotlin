import { describe, expect, it } from 'vitest';
import { computeRetailDeliveryOverview } from './retail-delivery-overview';

describe('retail delivery overview', () => {
  it('separates overdue promises, dispatch backlog, COD attention, and returns', () => {
    const report = computeRetailDeliveryOverview({
      now: '2026-08-04T10:00:00.000Z',
      deliveryPromises: [{ id: 'p1', salesOrderId: 'so1', deliveryTo: '2026-08-03T18:00:00.000Z', paymentMode: 'cod', status: 'active' } as never, { id: 'p2', salesOrderId: 'so2', deliveryTo: '2026-08-04T18:00:00.000Z', paymentMode: 'prepaid', status: 'active' } as never],
      fulfilmentTasks: [{ id: 't1', dueAt: '2026-08-03T10:00:00.000Z', status: 'blocked' } as never],
      shipmentPackages: [{ id: 'sh1', status: 'ready-to-dispatch' } as never, { id: 'sh2', status: 'return-in-progress' } as never],
      codCollectionCases: [{ id: 'c1', status: 'shortfall' } as never],
      returnAuthorizations: [{ id: 'r1', status: 'approved' } as never],
      pincodeServiceabilityRules: [],
      salesOrders: [{ id: 'so1', number: 'SO-1' } as never, { id: 'so2', number: 'SO-2' } as never],
    });
    expect(report.summary).toMatchObject({ activePromises: 2, overduePromises: 1, dueTodayPromises: 1, dispatchBacklog: 1, codAttention: 1, returnsAttention: 2, overdueTasks: 1 });
    expect(report.attention).toContain('1 delivery promise overdue');
  });

  it('does not create attention for completed evidence', () => {
    const report = computeRetailDeliveryOverview({ deliveryPromises: [], fulfilmentTasks: [], shipmentPackages: [], codCollectionCases: [{ id: 'c1', status: 'bank-matched' } as never], returnAuthorizations: [], pincodeServiceabilityRules: [], salesOrders: [], now: '2026-08-04T10:00:00.000Z' });
    expect(report.summary.codOpen).toBe(0);
    expect(report.attention).toEqual([]);
  });

  it('quarantines an active promise with an invalid delivery time instead of silently scheduling it', () => {
    const report = computeRetailDeliveryOverview({
      now: '2026-08-04T10:00:00.000Z',
      deliveryPromises: [{ id: 'p-bad', salesOrderId: 'so-bad', deliveryTo: 'not-a-timestamp', paymentMode: 'cod', status: 'active' } as never],
      fulfilmentTasks: [], shipmentPackages: [], codCollectionCases: [], returnAuthorizations: [], pincodeServiceabilityRules: [], salesOrders: [],
    });

    expect(report.summary.activePromises).toBe(1);
    expect(report.summary.invalidPromiseCount).toBe(1);
    expect(report.promiseRows).toEqual([]);
    expect(report.attention).toContain('1 active delivery promise has an invalid delivery time');
  });
});
