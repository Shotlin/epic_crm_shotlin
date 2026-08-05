import type { OperatingRecordScope } from './revenue-ops-contracts';

export interface WorkCenter {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  capacityMinutesPerDay: number;
  efficiencyPercent: number;
  costRatePerHour: number;
  active: boolean;
  scope?: OperatingRecordScope;
  version: number;
}

export interface BomComponent {
  id: string;
  itemVariantId: string;
  quantityPerOutput: number;
  scrapPercent: number;
  issueMethod: 'backflush' | 'manual';
}

export interface BomOperation {
  id: string;
  sequence: number;
  workCenterId: string;
  setupMinutes: number;
  runMinutesPerOutput: number;
  qualityGate: boolean;
}

export interface BillOfMaterialRevision {
  id: string;
  number: string;
  outputVariantId: string;
  outputQuantity: number;
  effectiveFrom: string;
  effectiveTo?: string;
  components: BomComponent[];
  operations: BomOperation[];
  status: 'draft' | 'released' | 'rejected' | 'retired';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface QualityPlanCheck {
  id: string;
  label: string;
  unit: string;
  minimum?: number;
  maximum?: number;
  critical: boolean;
}

export interface QualityPlan {
  id: string;
  number: string;
  outputVariantId: string;
  name: string;
  sampleSize: number;
  checks: QualityPlanCheck[];
  status: 'pending' | 'approved' | 'rejected' | 'retired';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface WorkOrderOperation {
  id: string;
  bomOperationId: string;
  sequence: number;
  workCenterId: string;
  plannedMinutes: number;
  status: 'planned' | 'in-progress' | 'completed' | 'blocked';
}

export interface WorkOrder {
  id: string;
  number: string;
  bomRevisionId: string;
  qualityPlanId?: string;
  outputVariantId: string;
  warehouseId: string;
  outputBinId: string;
  quantityPlanned: number;
  quantityCompleted: number;
  plannedStart: string;
  plannedEnd: string;
  status: 'submitted' | 'released' | 'in-progress' | 'quality-hold' | 'completed' | 'rejected' | 'cancelled';
  operations: WorkOrderOperation[];
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  startedBy?: string;
  startedAt?: string;
  completedBy?: string;
  completedAt?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface ProductionMaterialIssue {
  id: string;
  number: string;
  workOrderId: string;
  bomComponentId: string;
  itemVariantId: string;
  binId: string;
  batchId?: string;
  serialUnitIds: string[];
  quantity: number;
  unitCost: number;
  totalCost: number;
  issuedBy: string;
  issuedAt: string;
  ledgerReference: string;
  journalId: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface QualityInspectionResult {
  checkId: string;
  measuredValue: number;
  passed: boolean;
}

export interface QualityInspection {
  id: string;
  number: string;
  workOrderId: string;
  qualityPlanId: string;
  stage: 'in-process' | 'final';
  sampleQuantity: number;
  results: QualityInspectionResult[];
  status: 'passed' | 'failed';
  inspectedBy: string;
  inspectedAt: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface Nonconformance {
  id: string;
  number: string;
  workOrderId: string;
  qualityInspectionId: string;
  severity: 'minor' | 'major' | 'critical';
  description: string;
  status: 'open' | 'resolved' | 'written-off';
  openedBy: string;
  openedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  disposition?: 'rework' | 'use-as-is' | 'scrap';
  resolution?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface ProductionOutput {
  id: string;
  number: string;
  workOrderId: string;
  itemVariantId: string;
  outputBinId: string;
  quantity: number;
  batchNumber?: string;
  serialNumbers: string[];
  materialCost: number;
  operationCost: number;
  unitCost: number;
  recordedBy: string;
  recordedAt: string;
  inventoryReference: string;
  journalId: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreateWorkCenterInput { code: string; name: string; warehouseId: string; capacityMinutesPerDay: number; efficiencyPercent: number; costRatePerHour: number }
export interface CreateBomRevisionInput { outputVariantId: string; outputQuantity: number; effectiveFrom: string; effectiveTo?: string; components: Array<Omit<BomComponent, 'id'>>; operations: Array<Omit<BomOperation, 'id'>> }
export interface DecideBomRevisionInput { id: string; decision: 'released' | 'rejected'; remarks: string; expectedVersion: number }
export interface CreateQualityPlanInput { outputVariantId: string; name: string; sampleSize: number; checks: Array<Omit<QualityPlanCheck, 'id'>> }
export interface DecideQualityPlanInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface CreateWorkOrderInput { bomRevisionId: string; qualityPlanId?: string; warehouseId: string; outputBinId: string; quantityPlanned: number; plannedStart: string; plannedEnd: string }
export interface DecideWorkOrderInput { id: string; decision: 'released' | 'rejected'; remarks: string; expectedVersion: number }
export interface StartWorkOrderInput { id: string; expectedVersion: number }
export interface IssueWorkOrderMaterialInput { workOrderId: string; bomComponentId: string; binId: string; batchId?: string; serialUnitIds: string[]; quantity: number; issuedAt: string }
export interface RecordQualityInspectionInput { workOrderId: string; qualityPlanId: string; stage: QualityInspection['stage']; sampleQuantity: number; results: Array<{ checkId: string; measuredValue: number }> }
export interface ResolveNonconformanceInput { id: string; disposition: NonNullable<Nonconformance['disposition']>; resolution: string; expectedVersion: number }
export interface RecordProductionOutputInput { workOrderId: string; quantity: number; recordedAt: string; batchNumber?: string; serialNumbers: string[] }
