import type { PaymentReceipt } from '../shared/revenue-ops-contracts';
import type { RetailCashierShift, RetailCounter, RetailSale, RetailTenderMethod } from '../shared/retail-pos-contracts';

export type RetailCashRisk = 'clear' | 'open' | 'review';

export interface RetailCashOverviewRow {
  shiftId: string;
  shiftNumber: string;
  counterLabel: string;
  status: RetailCashierShift['status'];
  saleCount: number;
  salesValue: number;
  cashTenderValue: number;
  expectedCash?: number;
  declaredCash?: number;
  variance?: number;
  tenderVariance?: number;
  risk: RetailCashRisk;
  nextAction: string;
}

export interface RetailCashOverviewReport {
  rows: RetailCashOverviewRow[];
  summary: { shifts: number; openShifts: number; closeRequests: number; reviewCount: number; unresolvedReceipts: number; tenderTotals: Record<RetailTenderMethod, number> };
}

const tenderMethods: RetailTenderMethod[] = ['cash', 'upi', 'card', 'cheque', 'store-credit', 'customer-credit', 'other'];
const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Read-only cash-control projection. It does not close tills or reconcile payments. */
export function computeRetailCashOverview({ shifts, counters, sales, receipts }: { shifts: readonly RetailCashierShift[]; counters: readonly RetailCounter[]; sales: readonly RetailSale[]; receipts: readonly PaymentReceipt[] }): RetailCashOverviewReport {
  const counterById = new Map(counters.map((counter) => [counter.id, counter]));
  const salesByShift = new Map<string, RetailSale[]>();
  sales.filter((sale) => sale.status === 'completed').forEach((sale) => salesByShift.set(sale.cashierShiftId, [...(salesByShift.get(sale.cashierShiftId) ?? []), sale]));
  const tenderTotals = Object.fromEntries(tenderMethods.map((method) => [method, 0])) as Record<RetailTenderMethod, number>;
  sales.filter((sale) => sale.status === 'completed').flatMap((sale) => sale.tenders).forEach((tender) => { tenderTotals[tender.method] = money(tenderTotals[tender.method] + tender.amount); });
  const rows = shifts.map((shift): RetailCashOverviewRow => {
    const shiftSales = salesByShift.get(shift.id) ?? [];
    const cashTenderValue = money(shiftSales.flatMap((sale) => sale.tenders).filter((tender) => tender.method === 'cash').reduce((sum, tender) => sum + tender.amount, 0));
    const variance = shift.variance;
    const tenderVariance = shift.tenderVariance;
    const hasVariance = (variance !== undefined && variance !== 0) || (tenderVariance !== undefined && tenderVariance !== 0);
    const risk: RetailCashRisk = hasVariance || shift.status === 'close-requested' ? 'review' : shift.status === 'open' ? 'open' : 'clear';
    const nextAction = hasVariance
      ? 'Review the documented variance before approving close.'
      : shift.status === 'close-requested'
        ? 'Independent reviewer must decide the close request.'
        : shift.status === 'open'
          ? 'Continue the shift, then request a tender-by-tender close.'
          : 'No cash exception is recorded.';
    return { shiftId: shift.id, shiftNumber: shift.number, counterLabel: counterById.get(shift.counterId)?.name ?? shift.counterId, status: shift.status, saleCount: shiftSales.length, salesValue: money(shiftSales.reduce((sum, sale) => sum + sale.taxPreview.grandTotal, 0)), cashTenderValue, expectedCash: shift.expectedCash, declaredCash: shift.declaredCash, variance, tenderVariance, risk, nextAction };
  }).sort((left, right) => riskRank(right.risk) - riskRank(left.risk) || right.shiftNumber.localeCompare(left.shiftNumber));
  return { rows, summary: { shifts: rows.length, openShifts: rows.filter((row) => row.status === 'open').length, closeRequests: rows.filter((row) => row.status === 'close-requested').length, reviewCount: rows.filter((row) => row.risk === 'review').length, unresolvedReceipts: receipts.filter((receipt) => receipt.status === 'recorded').length, tenderTotals } };
}

function riskRank(risk: RetailCashRisk): number { return risk === 'review' ? 3 : risk === 'open' ? 2 : 1; }
