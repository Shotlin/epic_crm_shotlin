import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';

export type QualityReleaseStatus = 'released' | 'blocked' | 'review';
export type CapaStatus = 'not-required' | 'containment' | 'effectiveness-review' | 'closed';

export interface QualityReleaseAssessment {
  workOrderId: string;
  workOrderNumber: string;
  status: QualityReleaseStatus;
  capaStatus: CapaStatus;
  finalInspectionCount: number;
  passedFinalInspections: number;
  openNonconformanceCount: number;
  resolvedNonconformanceCount: number;
  blockers: string[];
  evidence: Array<{ reference: string; kind: 'inspection' | 'nonconformance'; outcome: string }>;
}

type QualityReleaseSource = Pick<RevenueOpsSnapshot, 'scope' | 'workOrders' | 'qualityInspections' | 'nonconformances' | 'qualityPlans' | 'productionOutputs'>;

function inScope(state: QualityReleaseSource, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

/**
 * Deterministic quality/CAPA gate for finished output. A failed inspection or
 * unresolved NC remains a blocker; no inventory receipt or release is implied.
 */
export function buildQualityReleaseAssessments(state: QualityReleaseSource): QualityReleaseAssessment[] {
  return state.workOrders.filter((order) => !['cancelled', 'rejected'].includes(order.status) && inScope(state, order)).map((order) => {
    const inspections = state.qualityInspections.filter((inspection) => inspection.workOrderId === order.id && inScope(state, inspection));
    const finals = inspections.filter(({ stage }) => stage === 'final');
    const passedFinals = finals.filter(({ status }) => status === 'passed');
    const issues = state.nonconformances.filter((issue) => issue.workOrderId === order.id && inScope(state, issue));
    const openIssues = issues.filter(({ status }) => status === 'open');
    const resolvedIssues = issues.filter(({ status }) => status === 'resolved');
    const blockers: string[] = [];
    if (order.quantityCompleted > 0 && !finals.length) blockers.push('Final inspection evidence is missing.');
    if (finals.length && !passedFinals.length && !issues.some(({ status, disposition }) => status === 'resolved' && disposition === 'use-as-is')) blockers.push('Final inspection has not passed.');
    if (openIssues.length) blockers.push(`${openIssues.length} nonconformance${openIssues.length === 1 ? '' : 's'} require containment and disposition.`);
    if (issues.some(({ status, disposition }) => status === 'resolved' && disposition === 'rework')) blockers.push('Rework is resolved operationally but requires a repeat final inspection.');
    if (issues.some(({ status, disposition }) => status === 'written-off' || disposition === 'scrap')) blockers.push('Scrap disposition prevents finished-output release.');
    const capaStatus: CapaStatus = openIssues.length ? 'containment' : issues.some(({ status }) => status === 'resolved') ? 'effectiveness-review' : 'not-required';
    const status: QualityReleaseStatus = blockers.length ? (openIssues.length || blockers.some((blocker) => blocker.includes('missing') || blocker.includes('not passed')) ? 'blocked' : 'review') : finals.length && passedFinals.length ? 'released' : 'review';
    return { workOrderId: order.id, workOrderNumber: order.number, status, capaStatus, finalInspectionCount: finals.length, passedFinalInspections: passedFinals.length, openNonconformanceCount: openIssues.length, resolvedNonconformanceCount: resolvedIssues.length, blockers: [...new Set(blockers)], evidence: [...finals.map((inspection) => ({ reference: inspection.number, kind: 'inspection' as const, outcome: inspection.status })), ...issues.map((issue) => ({ reference: issue.number, kind: 'nonconformance' as const, outcome: issue.disposition ? `${issue.status}/${issue.disposition}` : issue.status }))] };
  }).sort((left, right) => left.workOrderNumber.localeCompare(right.workOrderNumber));
}
