import type { RetailCashierShift, RetailCounter, RetailSale } from '../shared/retail-pos-contracts';
import type { RetailOfflineSaleQueueItem } from '../shared/retail-offline-sync-contracts';

export interface RetailSellOverviewReport {
  summary: { activeCounters: number; openShifts: number; completedSales: number; billedValue: number; averageBasket: number; offlineQueued: number; offlineConflicts: number; offlineRecoveryAttempts: number };
  recentSales: Array<{ id: string; number: string; saleAt: string; value: number; tenderMethods: string[]; counterLabel: string }>;
}

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Read-only checkout front-door projection. */
export function computeRetailSellOverview({ counters, shifts, sales, offlineQueue = [] }: { counters: readonly RetailCounter[]; shifts: readonly RetailCashierShift[]; sales: readonly RetailSale[]; offlineQueue?: readonly RetailOfflineSaleQueueItem[] }): RetailSellOverviewReport {
  const counterById = new Map(counters.map((counter) => [counter.id, counter]));
  const completed = sales.filter((sale) => sale.status === 'completed').sort((left, right) => right.saleAt.localeCompare(left.saleAt));
  const billedValue = money(completed.reduce((sum, sale) => sum + sale.taxPreview.grandTotal, 0));
  return {
    summary: { activeCounters: counters.filter((counter) => counter.active).length, openShifts: shifts.filter((shift) => shift.status !== 'closed').length, completedSales: completed.length, billedValue, averageBasket: completed.length ? money(billedValue / completed.length) : 0, offlineQueued: offlineQueue.filter((item) => item.status === 'queued' || item.status === 'syncing').length, offlineConflicts: offlineQueue.filter((item) => item.status === 'conflict').length, offlineRecoveryAttempts: offlineQueue.filter((item) => item.lastSyncMode === 'recovery').length },
    recentSales: completed.slice(0, 8).map((sale) => ({ id: sale.id, number: sale.number, saleAt: sale.saleAt, value: money(sale.taxPreview.grandTotal), tenderMethods: [...new Set(sale.tenders.map((tender) => tender.method))], counterLabel: counterById.get(sale.counterId)?.name ?? sale.counterId })),
  };
}
