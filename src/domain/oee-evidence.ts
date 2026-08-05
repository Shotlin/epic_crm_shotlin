import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

export interface OeeEvidence {
  workCenterId: string;
  workCenterName: string;
  workOrderCount: number;
  plannedOutput: number;
  completedOutput: number;
  availabilityPercent: number;
  performancePercent: number;
  qualityPercent: number | null;
  oeePercent: number | null;
  blockedOperationCount: number;
  inspectionCount: number;
  passedInspectionCount: number;
  telemetryStatus: 'missing-cycle-telemetry' | 'partial-evidence';
  readiness: 'ready-for-telemetry' | 'attention' | 'blocked';
}

type OeeSource = Pick<RevenueOpsState, 'scope' | 'workCenters' | 'workOrders' | 'qualityInspections' | 'productionOutputs'>;
const round = (value: number): number => Math.round(value * 10) / 10;
const sameScope = (state: OeeSource, record: { scope?: RevenueOpsState['scope'] }): boolean => {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};

/**
 * Calculates OEE-like evidence without claiming machine telemetry exists.
 * Availability is operation-state availability, performance is output
 * attainment, and quality comes only from recorded inspections.
 */
export function buildOeeEvidence(state: OeeSource): OeeEvidence[] {
  return state.workCenters.filter((center) => center.active && sameScope(state, center)).map((center) => {
    const orders = state.workOrders.filter((order) => sameScope(state, order) && order.operations.some((operation) => operation.workCenterId === center.id));
    const operations = orders.flatMap((order) => order.operations.filter((operation) => operation.workCenterId === center.id));
    const blockedOperationCount = operations.filter(({ status }) => status === 'blocked').length;
    const plannedOutput = orders.reduce((total, order) => total + order.quantityPlanned, 0);
    const completedOutput = orders.reduce((total, order) => total + Math.min(order.quantityPlanned, order.quantityCompleted), 0);
    const inspections = state.qualityInspections.filter((inspection) => sameScope(state, inspection) && orders.some(({ id }) => id === inspection.workOrderId));
    const passedInspectionCount = inspections.filter(({ status }) => status === 'passed').length;
    const availabilityPercent = operations.length ? round((operations.length - blockedOperationCount) / operations.length * 100) : 100;
    const performancePercent = plannedOutput ? round(completedOutput / plannedOutput * 100) : 0;
    const qualityPercent = inspections.length ? round(passedInspectionCount / inspections.length * 100) : null;
    const oeePercent = qualityPercent === null ? null : round(availabilityPercent * performancePercent * qualityPercent / 10_000);
    return { workCenterId: center.id, workCenterName: center.name, workOrderCount: orders.length, plannedOutput: round(plannedOutput), completedOutput: round(completedOutput), availabilityPercent, performancePercent, qualityPercent, oeePercent, blockedOperationCount, inspectionCount: inspections.length, passedInspectionCount, telemetryStatus: 'missing-cycle-telemetry', readiness: blockedOperationCount ? 'blocked' : inspections.length && qualityPercent !== 100 ? 'attention' : 'ready-for-telemetry' };
  });
}
