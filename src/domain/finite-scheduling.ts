import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

export interface FiniteCapacityDay {
  date: string;
  workCenterId: string;
  workCenterName: string;
  plannedMinutes: number;
  capacityMinutes: number;
  utilizationPercent: number;
  overloaded: boolean;
  orderNumbers: string[];
}

export interface FiniteCapacityPlan {
  asOf: string;
  horizonFrom: string;
  horizonTo: string;
  activeWorkOrders: number;
  days: FiniteCapacityDay[];
  overloadedDays: number;
  overloadedCenters: string[];
}

type SchedulingSource = Pick<RevenueOpsState, 'scope' | 'workCenters' | 'workOrders'>;
const round = (value: number): number => Math.round(value * 100) / 100;
const dateOnly = (value: string): string => value.slice(0, 10);
const sameScope = (state: SchedulingSource, record: { scope?: RevenueOpsState['scope'] }): boolean => {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};
const daysBetween = (from: string, to: string): string[] => {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor += 86_400_000) days.push(new Date(cursor).toISOString().slice(0, 10));
  return days;
};

/** Evaluates finite work-centre load without changing the committed schedule. */
export function buildFiniteCapacityPlan(state: SchedulingSource, asOf = new Date().toISOString()): FiniteCapacityPlan {
  const orders = state.workOrders.filter((order) => sameScope(state, order) && ['submitted', 'released', 'in-progress', 'quality-hold'].includes(order.status));
  const horizonFrom = orders.length ? orders.reduce((min, order) => order.plannedStart < min ? order.plannedStart : min, orders[0]!.plannedStart) : asOf.slice(0, 10);
  const horizonTo = orders.length ? orders.reduce((max, order) => order.plannedEnd > max ? order.plannedEnd : max, orders[0]!.plannedEnd) : horizonFrom;
  const loads = new Map<string, { minutes: number; orders: Set<string> }>();
  for (const order of orders) {
    const days = daysBetween(dateOnly(order.plannedStart), dateOnly(order.plannedEnd));
    if (!days.length) continue;
    for (const operation of order.operations) {
      const keyMinutes = operation.plannedMinutes / days.length;
      for (const date of days) {
        const key = `${date}:${operation.workCenterId}`;
        const entry = loads.get(key) ?? { minutes: 0, orders: new Set<string>() };
        entry.minutes += keyMinutes;
        entry.orders.add(order.number);
        loads.set(key, entry);
      }
    }
  }
  const days: FiniteCapacityDay[] = [];
  for (const date of daysBetween(horizonFrom, horizonTo)) {
    for (const center of state.workCenters.filter((candidate) => candidate.active && sameScope(state, candidate))) {
      const entry = loads.get(`${date}:${center.id}`) ?? { minutes: 0, orders: new Set<string>() };
      const capacityMinutes = round(center.capacityMinutesPerDay * center.efficiencyPercent / 100);
      const plannedMinutes = round(entry.minutes);
      days.push({ date, workCenterId: center.id, workCenterName: center.name, plannedMinutes, capacityMinutes, utilizationPercent: capacityMinutes ? round(plannedMinutes / capacityMinutes * 100) : 0, overloaded: plannedMinutes > capacityMinutes, orderNumbers: [...entry.orders].sort() });
    }
  }
  const overloaded = days.filter(({ overloaded: isOverloaded }) => isOverloaded);
  return { asOf, horizonFrom, horizonTo, activeWorkOrders: orders.length, days, overloadedDays: overloaded.length, overloadedCenters: [...new Set(overloaded.map(({ workCenterId }) => workCenterId))].sort() };
}
