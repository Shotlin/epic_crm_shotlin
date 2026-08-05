import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';

export type SubcontractingReadiness = 'ready' | 'blocked' | 'review';

export interface SubcontractingHandoff {
  workOrderId: string;
  workOrderNumber: string;
  supplierId?: string;
  supplierName?: string;
  readiness: SubcontractingReadiness;
  materialIssueCount: number;
  materialIssueQuantity: number;
  outputQuantity: number;
  qualityStatus: 'passed' | 'failed' | 'missing' | 'use-as-is';
  blockers: string[];
  nextAction: 'qualify-supplier' | 'issue-material' | 'record-receipt' | 'quality-release' | 'handoff';
}

type SubcontractingSource = Pick<RevenueOpsSnapshot, 'scope' | 'suppliers' | 'workOrders' | 'productionMaterialIssues' | 'productionOutputs' | 'qualityInspections' | 'nonconformances'>;

function inScope(state: SubcontractingSource, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

/**
 * Creates a supplier-operation handoff assessment without pretending that an
 * external subcontractor API or a new procurement commitment already exists.
 */
export function buildSubcontractingHandoff(state: SubcontractingSource, workOrderId: string, supplierId?: string): SubcontractingHandoff | null {
  const workOrder = state.workOrders.find((candidate) => candidate.id === workOrderId && inScope(state, candidate) && !['cancelled', 'rejected'].includes(candidate.status));
  if (!workOrder) return null;
  const supplier = supplierId ? state.suppliers.find((candidate) => candidate.id === supplierId && candidate.status === 'approved' && inScope(state, candidate)) : undefined;
  const issues = state.productionMaterialIssues.filter((issue) => issue.workOrderId === workOrder.id && inScope(state, issue));
  const outputs = state.productionOutputs.filter((output) => output.workOrderId === workOrder.id && inScope(state, output));
  const finalInspections = state.qualityInspections.filter((inspection) => inspection.workOrderId === workOrder.id && inspection.stage === 'final' && inScope(state, inspection));
  const qualityIssues = state.nonconformances.filter((issue) => issue.workOrderId === workOrder.id && inScope(state, issue));
  const blockers: string[] = [];
  if (!supplierId) blockers.push('An approved subcontractor is not selected.');
  else if (!supplier) blockers.push('Selected subcontractor is not approved in this company and branch.');
  if (!issues.length) blockers.push('No issued material evidence is linked to the work order.');
  if (!outputs.length || outputs.reduce((sum, output) => sum + output.quantity, 0) <= 0) blockers.push('No positive subcontracted output receipt is recorded.');
  const passed = finalInspections.some(({ status }) => status === 'passed');
  const useAsIs = qualityIssues.some(({ status, disposition }) => status === 'resolved' && disposition === 'use-as-is');
  const qualityStatus: SubcontractingHandoff['qualityStatus'] = passed ? 'passed' : useAsIs ? 'use-as-is' : finalInspections.length ? 'failed' : 'missing';
  if (!passed && !useAsIs) blockers.push('Final quality release evidence is missing or failed.');
  const readiness: SubcontractingReadiness = blockers.length ? (blockers.some((blocker) => blocker.includes('approved') || blocker.includes('material')) ? 'blocked' : 'review') : 'ready';
  const nextAction: SubcontractingHandoff['nextAction'] = !supplier || !supplierId ? 'qualify-supplier' : !issues.length ? 'issue-material' : !outputs.length ? 'record-receipt' : !passed && !useAsIs ? 'quality-release' : 'handoff';
  return { workOrderId: workOrder.id, workOrderNumber: workOrder.number, supplierId: supplier?.id, supplierName: supplier?.tradeName ?? supplier?.legalName, readiness, materialIssueCount: issues.length, materialIssueQuantity: issues.reduce((sum, issue) => sum + issue.quantity, 0), outputQuantity: outputs.reduce((sum, output) => sum + output.quantity, 0), qualityStatus, blockers: [...new Set(blockers)], nextAction };
}
