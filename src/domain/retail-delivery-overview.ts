import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

type PromiseRecord = RevenueOpsSnapshot['deliveryPromises'][number];
type TaskRecord = RevenueOpsSnapshot['fulfilmentTasks'][number];
type ShipmentRecord = RevenueOpsSnapshot['shipmentPackages'][number];

export interface RetailDeliveryOverviewInput {
  deliveryPromises: readonly PromiseRecord[];
  fulfilmentTasks: readonly TaskRecord[];
  shipmentPackages: readonly ShipmentRecord[];
  codCollectionCases: RevenueOpsSnapshot['codCollectionCases'];
  returnAuthorizations: RevenueOpsSnapshot['returnAuthorizations'];
  pincodeServiceabilityRules: RevenueOpsSnapshot['pincodeServiceabilityRules'];
  salesOrders: RevenueOpsSnapshot['salesOrders'];
  now?: string;
}

export interface RetailDeliveryPromiseRow {
  id: string;
  orderNumber: string;
  deliveryTo: string;
  paymentMode: PromiseRecord['paymentMode'];
  state: 'overdue' | 'due-today' | 'scheduled';
}

export interface RetailDeliveryOverview {
  generatedAt: string;
  summary: {
    activePromises: number;
    /** Legacy/corrupt records excluded from scheduling until repaired. */
    invalidPromiseCount: number;
    overduePromises: number;
    dueTodayPromises: number;
    dispatchBacklog: number;
    inTransit: number;
    codOpen: number;
    codAttention: number;
    returnsAttention: number;
    serviceablePincodes: number;
    overdueTasks: number;
  };
  promiseRows: RetailDeliveryPromiseRow[];
  attention: string[];
}

const COD_TERMINAL = new Set(['bank-matched', 'cancelled']);

function day(value: string): string {
  return value.slice(0, 10);
}

function safeNow(value?: string): string {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

function validTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

/** Read-only delivery readiness; it never infers carrier location or ETA. */
export function computeRetailDeliveryOverview(input: RetailDeliveryOverviewInput): RetailDeliveryOverview {
  const generatedAt = safeNow(input.now);
  const today = day(generatedAt);
  const activePromises = input.deliveryPromises.filter(({ status }) => status === 'active');
  const validPromises = activePromises.filter((promise) => validTimestamp(promise.deliveryTo));
  const invalidPromiseCount = activePromises.length - validPromises.length;
  const promiseRows = validPromises
    .map((promise) => {
      const state = promise.deliveryTo < generatedAt ? 'overdue' : day(promise.deliveryTo) === today ? 'due-today' : 'scheduled';
      return {
        id: promise.id,
        orderNumber: input.salesOrders.find(({ id }) => id === promise.salesOrderId)?.number ?? promise.salesOrderId,
        deliveryTo: promise.deliveryTo,
        paymentMode: promise.paymentMode,
        state,
      } satisfies RetailDeliveryPromiseRow;
    })
    .sort((left, right) => {
      const rank = { overdue: 0, 'due-today': 1, scheduled: 2 } as const;
      return rank[left.state] - rank[right.state] || left.deliveryTo.localeCompare(right.deliveryTo);
    });
  const openTasks = input.fulfilmentTasks.filter(({ status }) => status !== 'completed');
  const overdueTasks = openTasks.filter(({ dueAt }) => dueAt < generatedAt).length;
  const codOpenCases = input.codCollectionCases.filter(({ status }) => !COD_TERMINAL.has(status));
  const codAttention = codOpenCases.filter(({ status }) => ['shortfall', 'refused-rto'].includes(status)).length;
  const returnsAttention = input.returnAuthorizations.filter(({ status }) => ['requested', 'approved'].includes(status)).length
    + input.shipmentPackages.filter(({ status }) => status === 'return-in-progress').length;
  const dispatchBacklog = input.shipmentPackages.filter(({ status }) => ['planned', 'packed', 'ready-to-dispatch'].includes(status)).length;
  const inTransit = input.shipmentPackages.filter(({ status }) => ['dispatched', 'in-transit'].includes(status)).length;
  const overduePromises = promiseRows.filter(({ state }) => state === 'overdue').length;
  const dueTodayPromises = promiseRows.filter(({ state }) => state === 'due-today').length;
  const serviceablePincodes = input.pincodeServiceabilityRules.filter(({ status, serviceable }) => status === 'active' && serviceable).length;
  const attention: string[] = [];
  if (overduePromises) attention.push(`${overduePromises} delivery promise${overduePromises === 1 ? '' : 's'} overdue`);
  if (invalidPromiseCount) attention.push(`${invalidPromiseCount} active delivery promise${invalidPromiseCount === 1 ? ' has' : 's have'} an invalid delivery time`);
  if (overdueTasks) attention.push(`${overdueTasks} fulfilment task${overdueTasks === 1 ? '' : 's'} past due`);
  if (codAttention) attention.push(`${codAttention} COD custody case${codAttention === 1 ? '' : 's'} need evidence`);
  if (returnsAttention) attention.push(`${returnsAttention} return / RTO record${returnsAttention === 1 ? '' : 's'} need review`);
  if (!serviceablePincodes && activePromises.length) attention.push('No active serviceability policy is available');
  return {
    generatedAt,
    summary: { activePromises: activePromises.length, invalidPromiseCount, overduePromises, dueTodayPromises, dispatchBacklog, inTransit, codOpen: codOpenCases.length, codAttention, returnsAttention, serviceablePincodes, overdueTasks },
    promiseRows,
    attention,
  };
}
