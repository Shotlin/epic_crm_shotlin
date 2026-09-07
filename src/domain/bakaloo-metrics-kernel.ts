/**
 * Governed, source-aware metrics for Bakaloo retail workspaces.
 *
 * Money is always represented in paise.  A missing cost/input is not assumed
 * to be zero: the dependent metric is explicitly unavailable.  This prevents
 * a polished dashboard from silently inventing a margin or a “healthy” zero.
 */

export type BakalooMetricUnit = 'count' | 'inr' | 'percent' | 'ratio' | 'days';
export type BakalooMetricState = 'available' | 'unavailable';

export interface BakalooOrderMetricSource {
  id: string;
  customerId: string;
  pincode: string;
  placedAt: string;
  promisedDeliveryAt: string | null;
  deliveredAt: string | null;
  status: 'placed' | 'confirmed' | 'picked' | 'dispatched' | 'delivered' | 'cancelled' | 'returned';
  grossMinor: number;
  discountMinor: number;
  refundMinor: number;
  /** Null means cost is not available, not that it is free. */
  cogsMinor: number | null;
  /** Per-order gateway, UPI, COD or marketplace cost. */
  paymentCostMinor: number | null;
  /** Per-order rider/third-party variable cost. */
  deliveryCostMinor: number | null;
}

export interface BakalooMetricInput {
  orders: readonly BakalooOrderMetricSource[];
  serviceableHouseholds: Readonly<Record<string, number>> | null;
  marketingSpendMinor: number | null;
  fixedStoreCostMinor: number | null;
  techAndHeadOfficeCostMinor: number | null;
  npsResponses: readonly number[] | null;
  sourceMode: 'live' | 'imported' | 'demo';
  period: { from: string; to: string };
}

export interface BakalooMetric {
  key: BakalooMetricKey;
  label: string;
  unit: BakalooMetricUnit;
  value: number | null;
  state: BakalooMetricState;
  unavailableReason: string | null;
  sourceCollections: readonly string[];
  /** A calculation can be shown only together with a non-misleading scope. */
  sourceMode: BakalooMetricInput['sourceMode'];
}

export type BakalooMetricKey =
  | 'ordersDelivered'
  | 'netRevenue'
  | 'averageOrderValue'
  | 'dailyOrderDensity'
  | 'activeCustomers'
  | 'repeatRate'
  | 'cancellationRate'
  | 'slaAdherence'
  | 'cm1'
  | 'cm2'
  | 'cm3'
  | 'cm4'
  | 'breakEvenOrdersPerDay'
  | 'cac'
  | 'nps';

export interface BakalooMetricsSnapshot {
  period: BakalooMetricInput['period'];
  sourceMode: BakalooMetricInput['sourceMode'];
  metrics: readonly BakalooMetric[];
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function daysInclusive(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function available(
  key: BakalooMetricKey,
  label: string,
  unit: BakalooMetricUnit,
  value: number,
  sourceCollections: readonly string[],
  sourceMode: BakalooMetricInput['sourceMode'],
): BakalooMetric {
  return { key, label, unit, value, state: 'available', unavailableReason: null, sourceCollections, sourceMode };
}

function unavailable(
  key: BakalooMetricKey,
  label: string,
  unit: BakalooMetricUnit,
  reason: string,
  sourceCollections: readonly string[],
  sourceMode: BakalooMetricInput['sourceMode'],
): BakalooMetric {
  return { key, label, unit, value: null, state: 'unavailable', unavailableReason: reason, sourceCollections, sourceMode };
}

function allKnown(orders: readonly BakalooOrderMetricSource[], property: 'cogsMinor' | 'paymentCostMinor' | 'deliveryCostMinor'): boolean {
  return orders.every((order) => finite(order[property]));
}

/** Builds metrics from a reconciled order/cost projection without defaults. */
export function buildBakalooMetrics(input: BakalooMetricInput): BakalooMetricsSnapshot {
  const completed = input.orders.filter((order) => order.status === 'delivered');
  const cancelled = input.orders.filter((order) => order.status === 'cancelled');
  const netRevenueMinor = completed.reduce((sum, order) => sum + order.grossMinor - order.discountMinor - order.refundMinor, 0);
  const activeCustomers = new Set(completed.map((order) => order.customerId));
  const orderCounts = new Map<string, number>();
  completed.forEach((order) => orderCounts.set(order.customerId, (orderCounts.get(order.customerId) ?? 0) + 1));
  const repeatCustomers = [...orderCounts.values()].filter((count) => count >= 2).length;
  const deliveredWithPromise = completed.filter((order) => order.promisedDeliveryAt && order.deliveredAt);
  const onTime = deliveredWithPromise.filter((order) => Date.parse(order.deliveredAt!) <= Date.parse(order.promisedDeliveryAt!)).length;
  const householdCount = input.serviceableHouseholds
    ? Object.values(input.serviceableHouseholds).reduce((sum, value) => sum + (finite(value) && value > 0 ? value : 0), 0)
    : 0;
  const periodDays = daysInclusive(input.period.from, input.period.to);
  const base = { sourceMode: input.sourceMode };
  const metrics: BakalooMetric[] = [
    available('ordersDelivered', 'Orders delivered', 'count', completed.length, ['orders'], base.sourceMode),
    available('netRevenue', 'Net revenue', 'inr', netRevenueMinor, ['orders'], base.sourceMode),
    completed.length > 0
      ? available('averageOrderValue', 'Average order value', 'inr', netRevenueMinor / completed.length, ['orders'], base.sourceMode)
      : unavailable('averageOrderValue', 'Average order value', 'inr', 'No delivered orders exist in the selected period.', ['orders'], base.sourceMode),
    householdCount > 0 && periodDays > 0
      ? available('dailyOrderDensity', 'Daily order density', 'ratio', completed.length / periodDays / (householdCount / 1_000), ['orders', 'serviceability'], base.sourceMode)
      : unavailable('dailyOrderDensity', 'Daily order density', 'ratio', 'Serviceable household counts and a valid date period are required.', ['orders', 'serviceability'], base.sourceMode),
    available('activeCustomers', 'Active customers', 'count', activeCustomers.size, ['orders', 'customers'], base.sourceMode),
    activeCustomers.size > 0
      ? available('repeatRate', 'Repeat customer rate', 'percent', (repeatCustomers / activeCustomers.size) * 100, ['orders', 'customers'], base.sourceMode)
      : unavailable('repeatRate', 'Repeat customer rate', 'percent', 'No active customers exist in the selected period.', ['orders', 'customers'], base.sourceMode),
    input.orders.length > 0
      ? available('cancellationRate', 'Cancellation rate', 'percent', (cancelled.length / input.orders.length) * 100, ['orders'], base.sourceMode)
      : unavailable('cancellationRate', 'Cancellation rate', 'percent', 'No orders exist in the selected period.', ['orders'], base.sourceMode),
    deliveredWithPromise.length > 0
      ? available('slaAdherence', 'SLA adherence', 'percent', (onTime / deliveredWithPromise.length) * 100, ['orders', 'delivery-events'], base.sourceMode)
      : unavailable('slaAdherence', 'SLA adherence', 'percent', 'Delivered orders require both promised and actual delivery timestamps.', ['orders', 'delivery-events'], base.sourceMode),
  ];

  const cogsKnown = allKnown(completed, 'cogsMinor');
  const paymentKnown = allKnown(completed, 'paymentCostMinor');
  const deliveryKnown = allKnown(completed, 'deliveryCostMinor');
  const cogsMinor = cogsKnown ? completed.reduce((sum, order) => sum + (order.cogsMinor ?? 0), 0) : null;
  const paymentMinor = paymentKnown ? completed.reduce((sum, order) => sum + (order.paymentCostMinor ?? 0), 0) : null;
  const deliveryMinor = deliveryKnown ? completed.reduce((sum, order) => sum + (order.deliveryCostMinor ?? 0), 0) : null;
  const cm1 = cogsMinor === null ? null : netRevenueMinor - cogsMinor;
  const cm2 = cm1 === null || paymentMinor === null || deliveryMinor === null ? null : cm1 - paymentMinor - deliveryMinor;
  const cm3 = cm2 === null || !finite(input.fixedStoreCostMinor) ? null : cm2 - input.fixedStoreCostMinor;
  const cm4 = cm3 === null || !finite(input.marketingSpendMinor) || !finite(input.techAndHeadOfficeCostMinor)
    ? null
    : cm3 - input.marketingSpendMinor - input.techAndHeadOfficeCostMinor;
  metrics.push(
    cm1 === null ? unavailable('cm1', 'CM1', 'inr', 'COGS is unavailable for one or more delivered orders.', ['orders', 'inventory-ledger'], base.sourceMode) : available('cm1', 'CM1', 'inr', cm1, ['orders', 'inventory-ledger'], base.sourceMode),
    cm2 === null ? unavailable('cm2', 'CM2', 'inr', 'COGS, payment cost and delivery cost are required.', ['orders', 'inventory-ledger', 'payments', 'delivery-events'], base.sourceMode) : available('cm2', 'CM2', 'inr', cm2, ['orders', 'inventory-ledger', 'payments', 'delivery-events'], base.sourceMode),
    cm3 === null ? unavailable('cm3', 'CM3', 'inr', 'CM2 and allocated fixed store cost are required.', ['orders', 'inventory-ledger', 'payments', 'delivery-events', 'store-finance'], base.sourceMode) : available('cm3', 'CM3', 'inr', cm3, ['orders', 'inventory-ledger', 'payments', 'delivery-events', 'store-finance'], base.sourceMode),
    cm4 === null ? unavailable('cm4', 'CM4 (fully loaded)', 'inr', 'CM3, marketing spend and technology/head-office cost are required.', ['orders', 'inventory-ledger', 'payments', 'delivery-events', 'store-finance', 'marketing'], base.sourceMode) : available('cm4', 'CM4 (fully loaded)', 'inr', cm4, ['orders', 'inventory-ledger', 'payments', 'delivery-events', 'store-finance', 'marketing'], base.sourceMode),
    cm3 !== null && completed.length > 0 && finite(input.fixedStoreCostMinor) && periodDays > 0 && cm3 / completed.length > 0
      ? available('breakEvenOrdersPerDay', 'Break-even orders per day', 'count', (input.fixedStoreCostMinor / periodDays) / (cm3 / completed.length), ['store-finance', 'orders'], base.sourceMode)
      : unavailable('breakEvenOrdersPerDay', 'Break-even orders per day', 'count', 'Positive CM3 per delivered order and allocated fixed cost are required.', ['store-finance', 'orders'], base.sourceMode),
  );

  const firstOrders = [...orderCounts.values()].filter((count) => count === 1).length;
  metrics.push(
    finite(input.marketingSpendMinor) && firstOrders > 0
      ? available('cac', 'Customer acquisition cost', 'inr', input.marketingSpendMinor / firstOrders, ['marketing', 'orders', 'customers'], base.sourceMode)
      : unavailable('cac', 'Customer acquisition cost', 'inr', 'Marketing spend and at least one first-time customer are required.', ['marketing', 'orders', 'customers'], base.sourceMode),
  );

  const validNps = input.npsResponses?.filter((score) => Number.isInteger(score) && score >= 0 && score <= 10) ?? [];
  metrics.push(
    validNps.length > 0
      ? available('nps', 'NPS', 'count', ((validNps.filter((score) => score >= 9).length - validNps.filter((score) => score <= 6).length) / validNps.length) * 100, ['customer-feedback'], base.sourceMode)
      : unavailable('nps', 'NPS', 'count', 'No valid 0–10 customer feedback responses are available.', ['customer-feedback'], base.sourceMode),
  );
  return { period: input.period, sourceMode: input.sourceMode, metrics };
}

export interface BakalooDemoMetricsSeed {
  readonly label: 'Deterministic demo data — not live business data';
  readonly input: BakalooMetricInput;
}

/** Creates coherent, isolated 90-day demo data for visual and calculation tests. */
export function createBakalooDemoMetricsSeed(startDate = '2026-06-01'): BakalooDemoMetricsSeed {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  if (!Number.isFinite(start)) throw new Error('Demo start date must be an ISO calendar date.');
  const orders: BakalooOrderMetricSource[] = [];
  for (let day = 0; day < 90; day += 1) {
    for (let orderIndex = 0; orderIndex < 5 + (day % 4); orderIndex += 1) {
      const placed = new Date(start + day * 86_400_000 + (9 + orderIndex) * 3_600_000);
      const cancelled = day % 29 === 0 && orderIndex === 0;
      const grossMinor = 18_000 + ((day * 997 + orderIndex * 2_900) % 25_000);
      const discountMinor = orderIndex % 3 === 0 ? 900 : 0;
      const delivered = new Date(placed.getTime() + (42 + ((day + orderIndex) % 24)) * 60_000);
      const promised = new Date(placed.getTime() + 59 * 60_000);
      orders.push({
        id: `demo-order-${day}-${orderIndex}`,
        customerId: `demo-customer-${(day * 3 + orderIndex) % 92}`,
        pincode: orderIndex % 2 === 0 ? '394101' : '394105',
        placedAt: placed.toISOString(),
        promisedDeliveryAt: promised.toISOString(),
        deliveredAt: cancelled ? null : delivered.toISOString(),
        status: cancelled ? 'cancelled' : 'delivered',
        grossMinor,
        discountMinor,
        refundMinor: 0,
        cogsMinor: cancelled ? 0 : Math.round(grossMinor * 0.61),
        paymentCostMinor: cancelled ? 0 : Math.round(grossMinor * 0.009),
        deliveryCostMinor: cancelled ? 0 : 1_850,
      });
    }
  }
  const end = new Date(start + 89 * 86_400_000).toISOString().slice(0, 10);
  return {
    label: 'Deterministic demo data — not live business data',
    input: {
      orders,
      serviceableHouseholds: { '394101': 6_000, '394105': 5_000 },
      marketingSpendMinor: 130_000,
      fixedStoreCostMinor: 720_000,
      techAndHeadOfficeCostMinor: 180_000,
      npsResponses: [10, 9, 9, 8, 10, 7, 9, 6, 10, 8, 9, 10],
      sourceMode: 'demo',
      period: { from: startDate, to: end },
    },
  };
}
