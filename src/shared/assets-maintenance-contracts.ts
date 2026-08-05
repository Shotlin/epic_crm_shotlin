import type {
  AccountingJournalDraft,
  OperatingRecordScope,
} from './revenue-ops-contracts';
import type {
  GoodsReceipt,
  PurchaseOrder,
  SupplierInvoice,
  ThreeWayMatch,
} from './procurement-contracts';

/**
 * Phase 2C.1 is deliberately an operational installed-asset register. It
 * does not represent a capitalisation, depreciation, or disposal posting.
 * Financial status remains explicit so an operator cannot mistake a physical
 * asset record for a booked fixed asset.
 */
export type AssetCriticality = 'critical' | 'high' | 'normal' | 'low';
export type AssetSourceType =
  | 'opening-balance'
  | 'procurement-evidence'
  | 'manufactured'
  | 'manual-evidence';
export type ManagedAssetStatus =
  | 'draft'
  | 'submitted'
  | 'in-service'
  | 'retired'
  | 'rejected';
export type AssetFinancialStatus = 'unbooked';

/**
 * A capitalisation request is a controlled bridge, not an asset-book record.
 * Its final accounting state is derived from the immutable General Ledger
 * source journal. It becomes depreciation-eligible only after that source
 * has itself reached the immutable posted ledger chain.
 */
export type AssetCapitalizationStatus = 'submitted' | 'approved' | 'rejected';

export interface AssetCapitalization {
  id: string;
  number: string;
  assetId: string;
  supplierInvoiceId: string;
  threeWayMatchId: string;
  purchaseOrderId: string;
  goodsReceiptId: string;
  capitalizationDate: string;
  taxableAmount: number;
  status: AssetCapitalizationStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  journalDraftId?: string;
  scope: OperatingRecordScope;
  version: number;
}

/**
 * An effective-dated financial policy is deliberately separate from the
 * operational asset category. It is a controlled accounting assumption, not
 * a field an equipment custodian can silently edit after an asset is live.
 */
export type AssetDepreciationPolicyStatus = 'submitted' | 'approved' | 'rejected';
export interface AssetDepreciationPolicy {
  id: string;
  number: string;
  categoryId: string;
  effectiveFrom: string;
  usefulLifeMonths: number;
  residualValuePercent: number;
  method: 'straight-line';
  convention: 'full-month';
  status: AssetDepreciationPolicyStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  scope: OperatingRecordScope;
  version: number;
}

export type AssetDepreciationRunStatus = 'submitted' | 'approved' | 'rejected';
export interface AssetDepreciationRunLine {
  id: string;
  assetCapitalizationId: string;
  assetId: string;
  componentAllocationId?: string;
  componentId?: string;
  componentTag?: string;
  policyId: string;
  serviceMonthIndex: number;
  capitalizedCost: number;
  residualValue: number;
  depreciationAmount: number;
}

/**
 * One run is a narrow monthly subledger proposal. Approval creates immutable
 * source evidence; a separate GL user still prepares and posts the journal.
 */
export interface AssetDepreciationRun {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  method: 'straight-line';
  convention: 'full-month';
  totalDepreciation: number;
  lines: AssetDepreciationRunLine[];
  status: AssetDepreciationRunStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  journalDraftId?: string;
  scope: OperatingRecordScope;
  version: number;
}

/** A status-only book summary crosses the GL boundary; journal detail stays in GL. */
export interface AssetBookValue {
  capitalizationId: string;
  grossCost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  asOfDate: string;
}

export type AssetRetirementStatus = 'submitted' | 'approved' | 'rejected' | 'completed';
/**
 * A retirement has no sale proceeds in this slice. Asset sale/invoice and
 * gain handling require a later controlled commercial bridge; this records
 * only the loss-bearing removal of a fully identified asset from the book.
 */
export interface AssetRetirement {
  id: string;
  number: string;
  assetId: string;
  capitalizationId: string;
  retirementDate: string;
  reason: string;
  evidenceReference: string;
  grossCost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  status: AssetRetirementStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  journalDraftId?: string;
  completedBy?: string;
  completedAt?: string;
  scope: OperatingRecordScope;
  version: number;
}

/**
 * A custody transfer moves an installed asset only inside its current legal
 * entity and operating branch. It intentionally has no ledger effect: an
 * inter-branch or inter-company transfer needs a later accounting boundary.
 * Source and destination custody are frozen so receipt cannot silently apply
 * to an asset that moved while the request was awaiting approval.
 */
export type AssetCustodyTransferStatus = 'submitted' | 'approved' | 'rejected' | 'received';
export interface AssetCustodyTransfer {
  id: string;
  number: string;
  assetId: string;
  transferDate: string;
  reason: string;
  sourceWarehouseId?: string;
  sourceWorkCenterId?: string;
  sourceCustodyLabel: string;
  destinationWarehouseId?: string;
  destinationWorkCenterId?: string;
  destinationCustodyLabel: string;
  sourceAssetVersion: number;
  status: AssetCustodyTransferStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  receivedBy?: string;
  receivedAt?: string;
  receiptRemarks?: string;
  scope: OperatingRecordScope;
  version: number;
}

/**
 * Physical componentisation records replaceable/serviceable parts without
 * inventing a new GL cost basis. Financial allocation and component-level
 * depreciation are intentionally a later accounting boundary.
 */
export interface AssetComponent {
  id: string;
  componentTag: string;
  name: string;
  serialNumber?: string;
  categoryId?: string;
  criticality: AssetCriticality;
  serviceable: boolean;
}

export type AssetComponentizationStatus = 'submitted' | 'approved' | 'rejected';
export interface AssetComponentization {
  id: string;
  number: string;
  assetId: string;
  effectiveOn: string;
  reason: string;
  evidenceReference: string;
  sourceAssetVersion: number;
  components: AssetComponent[];
  status: AssetComponentizationStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  scope: OperatingRecordScope;
  version: number;
}

/**
 * Financial allocation is a separate maker/checker boundary from the
 * physical component passport. The lines must add to the posted parent cost;
 * this record creates no GL movement, it only authorizes component-level
 * depreciation attribution.
 */
export type AssetComponentAllocationStatus = 'submitted' | 'approved' | 'rejected';
export interface AssetComponentAllocationLine {
  id: string;
  componentId: string;
  componentTag: string;
  allocationPercent: number;
  allocatedCost: number;
  usefulLifeMonths: number;
  residualValuePercent: number;
}
export interface AssetComponentAllocation {
  id: string;
  number: string;
  assetId: string;
  capitalizationId: string;
  componentizationId: string;
  sourceAssetVersion: number;
  parentCost: number;
  allocatedCost: number;
  lines: AssetComponentAllocationLine[];
  status: AssetComponentAllocationStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  scope: OperatingRecordScope;
  version: number;
}

/** Cross-branch/inter-company movement is a financial handoff, not a silent
 * warehouse edit. Source book value is frozen until independent receipt. */
export type AssetTransferAccountingStatus = 'submitted' | 'approved' | 'rejected' | 'dispatched' | 'received';
export interface AssetTransferAccounting {
  id: string;
  number: string;
  assetId: string;
  capitalizationId: string;
  transferDate: string;
  reason: string;
  evidenceReference: string;
  sourceCompanyId: string;
  sourceBranchId: string;
  destinationCompanyId: string;
  destinationBranchId: string;
  destinationWarehouseId?: string;
  destinationCustodyLabel: string;
  grossCost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  sourceAssetVersion: number;
  status: AssetTransferAccountingStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  dispatchedBy?: string;
  dispatchedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  receiptRemarks?: string;
  journalDraftId?: string;
  scope: OperatingRecordScope;
  version: number;
}

export type AssetSaleDisposalStatus = 'submitted' | 'approved' | 'rejected' | 'completed';
export interface AssetSaleDisposal {
  id: string;
  number: string;
  assetId: string;
  capitalizationId: string;
  saleDate: string;
  customerAccountId: string;
  customerTaxRegistrationNumber?: string;
  supplyType: 'intra-state' | 'inter-state' | 'zero-rated' | 'exempt';
  taxableProceeds: number;
  gstRate: number;
  gstAmount: number;
  totalProceeds: number;
  grossCost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  gainLoss: number;
  sourceAssetVersion: number;
  evidenceReference: string;
  status: AssetSaleDisposalStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  journalDraftId?: string;
  completedBy?: string;
  completedAt?: string;
  scope: OperatingRecordScope;
  version: number;
}

export interface AssetCategory {
  id: string;
  code: string;
  name: string;
  description?: string;
  defaultCriticality: AssetCriticality;
  defaultMaintenanceIntervalDays?: number;
  active: boolean;
  createdBy: string;
  createdAt: string;
  scope: OperatingRecordScope;
  version: number;
}

export interface ManagedAsset {
  id: string;
  number: string;
  assetTag: string;
  categoryId: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  sourceType: AssetSourceType;
  sourceEvidenceReference: string;
  acquiredOn: string;
  availableForUseOn: string;
  warrantyExpiresOn?: string;
  warehouseId?: string;
  workCenterId?: string;
  custodyLabel: string;
  criticality: AssetCriticality;
  financialStatus: AssetFinancialStatus;
  status: ManagedAssetStatus;
  createdBy: string;
  createdAt: string;
  submittedBy?: string;
  submittedAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  scope: OperatingRecordScope;
  version: number;
}

export interface PreventiveMaintenanceChecklistItem {
  id: string;
  title: string;
  required: boolean;
}

export interface PreventiveMaintenancePlan {
  id: string;
  number: string;
  assetId: string;
  name: string;
  intervalDays: number;
  nextDueOn: string;
  estimatedMinutes: number;
  checklist: PreventiveMaintenanceChecklistItem[];
  status: 'active' | 'paused' | 'retired';
  createdBy: string;
  createdAt: string;
  lastGeneratedAt?: string;
  lastWorkOrderId?: string;
  lastVerifiedAt?: string;
  scope: OperatingRecordScope;
  version: number;
}

export interface MaintenanceWorkOrderChecklistItem
  extends PreventiveMaintenanceChecklistItem {
  completed: boolean;
}

export type MaintenanceWorkOrderStatus =
  | 'scheduled'
  | 'in-progress'
  | 'completed'
  | 'verified';

export interface MaintenanceWorkOrder {
  id: string;
  number: string;
  planId: string;
  assetId: string;
  dueOn: string;
  technicianUserId: string;
  status: MaintenanceWorkOrderStatus;
  checklist: MaintenanceWorkOrderChecklistItem[];
  generatedBy: string;
  generatedAt: string;
  startedBy?: string;
  startedAt?: string;
  completedBy?: string;
  completedAt?: string;
  serviceReport?: string;
  completionEvidenceReference?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  verificationRemarks?: string;
  reopenedBy?: string;
  reopenedAt?: string;
  reopenRemarks?: string;
  scope: OperatingRecordScope;
  version: number;
}

/** Minimal structural contract implemented by Revenue Operations on integration. */
export interface AssetMaintenanceScopedReference {
  id: string;
  active: boolean;
  scope?: OperatingRecordScope;
}

/**
 * Keeps this initial vertical pure and independently testable. Revenue
 * Operations will extend this shape rather than making asset logic depend on
 * persistence, IPC, or the renderer.
 */
export interface AssetMaintenanceState {
  revision: number;
  scope: OperatingRecordScope;
  assetCategories: AssetCategory[];
  managedAssets: ManagedAsset[];
  preventiveMaintenancePlans: PreventiveMaintenancePlan[];
  maintenanceWorkOrders: MaintenanceWorkOrder[];
  assetCapitalizations: AssetCapitalization[];
  assetDepreciationPolicies: AssetDepreciationPolicy[];
  assetDepreciationRuns: AssetDepreciationRun[];
  assetRetirements: AssetRetirement[];
  assetCustodyTransfers: AssetCustodyTransfer[];
  assetComponentizations: AssetComponentization[];
  assetComponentAllocations: AssetComponentAllocation[];
  assetTransferAccountings: AssetTransferAccounting[];
  assetSaleDisposals: AssetSaleDisposal[];
  assetImpairmentReviews: AssetImpairmentReview[];
  assetRevaluations: AssetRevaluation[];
  assetWarranties: AssetWarranty[];
  assetAmcContracts: AssetAmcContract[];
  assetMeters: AssetMeter[];
  assetMeterReadings: AssetMeterReading[];
  correctiveMaintenanceRequests: CorrectiveMaintenanceRequest[];
  assetCalibrations: AssetCalibrationRecord[];
  assetSpareParts: AssetSparePart[];
  assetSpareIssues: AssetSpareIssue[];
  fleetVehicles: FleetVehicle[];
  fleetTrips: FleetTrip[];
  assetInstalledBaseEvents: AssetInstalledBaseEvent[];
  supplierInvoices: SupplierInvoice[];
  threeWayMatches: ThreeWayMatch[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  journalDrafts: AccountingJournalDraft[];
  warehouses: AssetMaintenanceScopedReference[];
  workCenters: AssetMaintenanceScopedReference[];
}

export interface CreateAssetCategoryInput {
  code: string;
  name: string;
  description?: string;
  defaultCriticality: AssetCriticality;
  defaultMaintenanceIntervalDays?: number;
}

export interface CreateManagedAssetInput {
  assetTag: string;
  categoryId: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  sourceType: AssetSourceType;
  sourceEvidenceReference: string;
  acquiredOn: string;
  availableForUseOn: string;
  warrantyExpiresOn?: string;
  warehouseId?: string;
  workCenterId?: string;
  custodyLabel: string;
  criticality?: AssetCriticality;
}

export interface SubmitManagedAssetInput {
  id: string;
  expectedVersion: number;
}

export interface DecideManagedAssetInput {
  id: string;
  decision: 'in-service' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreateAssetCapitalizationInput {
  assetId: string;
  supplierInvoiceId: string;
  capitalizationDate: string;
  taxableAmount: number;
}

export interface DecideAssetCapitalizationInput {
  id: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreateAssetDepreciationPolicyInput {
  categoryId: string;
  effectiveFrom: string;
  usefulLifeMonths: number;
  residualValuePercent: number;
}

export interface DecideAssetDepreciationPolicyInput {
  id: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreateAssetDepreciationRunInput {
  periodEnd: string;
}

export interface DecideAssetDepreciationRunInput {
  id: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreateAssetRetirementInput {
  assetId: string;
  retirementDate: string;
  reason: string;
  evidenceReference: string;
}

export interface DecideAssetRetirementInput {
  id: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CompleteAssetRetirementInput {
  id: string;
  expectedVersion: number;
}

export interface CreateAssetCustodyTransferInput {
  assetId: string;
  transferDate: string;
  reason: string;
  destinationWarehouseId?: string;
  destinationWorkCenterId?: string;
  destinationCustodyLabel: string;
}

export interface DecideAssetCustodyTransferInput {
  id: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface ReceiveAssetCustodyTransferInput {
  id: string;
  receiptRemarks: string;
  expectedVersion: number;
}

export interface CreateAssetComponentizationInput {
  assetId: string;
  effectiveOn: string;
  reason: string;
  evidenceReference: string;
  components: Array<{
    componentTag: string;
    name: string;
    serialNumber?: string;
    categoryId?: string;
    criticality?: AssetCriticality;
    serviceable?: boolean;
  }>;
}

export interface DecideAssetComponentizationInput {
  id: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreateAssetComponentAllocationInput {
  assetId: string;
  componentizationId: string;
  capitalizationId?: string;
  lines: Array<{
    componentId: string;
    allocationPercent: number;
    usefulLifeMonths: number;
    residualValuePercent: number;
  }>;
}

export interface DecideAssetComponentAllocationInput {
  id: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface CreateAssetTransferAccountingInput {
  assetId: string;
  transferDate: string;
  reason: string;
  evidenceReference: string;
  destinationCompanyId: string;
  destinationBranchId: string;
  destinationWarehouseId?: string;
  destinationCustodyLabel: string;
}
export interface DecideAssetTransferAccountingInput {
  id: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}
export interface DispatchAssetTransferAccountingInput { id: string; expectedVersion: number; }
export interface ReceiveAssetTransferAccountingInput { id: string; receiptRemarks: string; expectedVersion: number; }

export interface CreateAssetSaleDisposalInput {
  assetId: string;
  saleDate: string;
  customerAccountId: string;
  customerTaxRegistrationNumber?: string;
  supplyType: AssetSaleDisposal['supplyType'];
  taxableProceeds: number;
  gstRate: number;
  evidenceReference: string;
}
export interface DecideAssetSaleDisposalInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number; }
export interface CompleteAssetSaleDisposalInput { id: string; expectedVersion: number; }

export type AssetImpairmentStatus = 'submitted' | 'approved' | 'rejected' | 'completed';
export interface AssetImpairmentReview {
  id: string; number: string; assetId: string; capitalizationId: string; assessmentDate: string;
  carryingAmount: number; recoverableAmount: number; impairmentAmount: number; reversalAmount: number;
  sourceAssetVersion: number; evidenceReference: string; status: AssetImpairmentStatus;
  requestedBy: string; requestedAt: string; decidedBy?: string; decidedAt?: string; decisionRemarks?: string;
  journalDraftId?: string; completedBy?: string; completedAt?: string; scope: OperatingRecordScope; version: number;
}
export interface CreateAssetImpairmentReviewInput { assetId: string; assessmentDate: string; recoverableAmount: number; evidenceReference: string; }
export interface DecideAssetImpairmentReviewInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number; }
export interface CompleteAssetImpairmentReviewInput { id: string; expectedVersion: number; }

export type AssetRevaluationStatus = 'submitted' | 'approved' | 'rejected' | 'completed';
export interface AssetRevaluation {
  id: string; number: string; assetId: string; capitalizationId: string; revaluationDate: string;
  carryingAmount: number; fairValue: number; uplift: number; deficit: number;
  sourceAssetVersion: number; valuationBasis: string; evidenceReference: string; status: AssetRevaluationStatus;
  requestedBy: string; requestedAt: string; decidedBy?: string; decidedAt?: string; decisionRemarks?: string;
  journalDraftId?: string; completedBy?: string; completedAt?: string; scope: OperatingRecordScope; version: number;
}
export interface CreateAssetRevaluationInput { assetId: string; revaluationDate: string; fairValue: number; valuationBasis: string; evidenceReference: string; }
export interface DecideAssetRevaluationInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number; }
export interface CompleteAssetRevaluationInput { id: string; expectedVersion: number; }

export type AssetWarrantyStatus = 'active' | 'expired' | 'claimed' | 'closed';
export interface AssetWarranty { id: string; number: string; assetId: string; providerName: string; coverageDescription: string; startDate: string; endDate: string; claimWindowDays: number; status: AssetWarrantyStatus; evidenceReference: string; createdBy: string; createdAt: string; scope: OperatingRecordScope; version: number; }
export interface CreateAssetWarrantyInput { assetId: string; providerName: string; coverageDescription: string; startDate: string; endDate: string; claimWindowDays?: number; evidenceReference: string; }
export interface UpdateAssetWarrantyStatusInput { id: string; status: AssetWarrantyStatus; expectedVersion: number; }

export type AssetAmcStatus = 'submitted' | 'approved' | 'active' | 'expired' | 'cancelled';
export interface AssetAmcContract { id: string; number: string; assetId: string; providerName: string; contractReference: string; startDate: string; endDate: string; responseHours: number; visitIntervalDays: number; annualValue: number; coverageDescription: string; status: AssetAmcStatus; evidenceReference: string; requestedBy: string; requestedAt: string; decidedBy?: string; decidedAt?: string; decisionRemarks?: string; scope: OperatingRecordScope; version: number; }
export interface CreateAssetAmcContractInput { assetId: string; providerName: string; contractReference: string; startDate: string; endDate: string; responseHours: number; visitIntervalDays: number; annualValue: number; coverageDescription: string; evidenceReference: string; }
export interface DecideAssetAmcContractInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number; }
export interface UpdateAssetAmcStatusInput { id: string; status: 'active' | 'expired' | 'cancelled'; expectedVersion: number; }

export type AssetMeterType = 'hours' | 'kilometres' | 'cycles' | 'energy' | 'custom';
export interface AssetMeter { id: string; number: string; assetId: string; name: string; meterType: AssetMeterType; unit: string; currentReading: number; serviceThreshold?: number; rolloverAt?: number; active: boolean; createdBy: string; createdAt: string; scope: OperatingRecordScope; version: number; }
export interface AssetMeterReading { id: string; number: string; meterId: string; assetId: string; readingDate: string; reading: number; delta: number; source: 'manual' | 'iot' | 'service-order'; evidenceReference: string; recordedBy: string; recordedAt: string; scope: OperatingRecordScope; version: number; }
export interface CreateAssetMeterInput { assetId: string; name: string; meterType: AssetMeterType; unit: string; initialReading?: number; serviceThreshold?: number; rolloverAt?: number; }
export interface RecordAssetMeterReadingInput { meterId: string; readingDate: string; reading: number; source: AssetMeterReading['source']; evidenceReference: string; expectedVersion: number; }

export type CorrectiveMaintenanceStatus = 'submitted' | 'approved' | 'in-progress' | 'completed' | 'verified' | 'rejected';
export interface CorrectiveMaintenanceRequest { id: string; number: string; assetId: string; meterId?: string; priority: AssetCriticality; symptom: string; rootCause?: string; dueOn: string; status: CorrectiveMaintenanceStatus; requestedBy: string; requestedAt: string; approvedBy?: string; approvedAt?: string; startedBy?: string; startedAt?: string; completedBy?: string; completedAt?: string; verifiedBy?: string; verifiedAt?: string; evidenceReference?: string; scope: OperatingRecordScope; version: number; }
export interface CreateCorrectiveMaintenanceInput { assetId: string; meterId?: string; priority: AssetCriticality; symptom: string; dueOn: string; evidenceReference?: string; }
export interface TransitionCorrectiveMaintenanceInput { id: string; transition: 'approved' | 'rejected' | 'in-progress' | 'completed' | 'verified'; rootCause?: string; evidenceReference?: string; expectedVersion: number; }

export type AssetCalibrationStatus = 'submitted' | 'approved' | 'valid' | 'expired' | 'failed';
export interface AssetCalibrationRecord { id: string; number: string; assetId: string; instrumentReference: string; calibratedOn: string; dueOn: string; standardReference: string; result: 'pass' | 'fail'; uncertainty?: number; certificateReference: string; status: AssetCalibrationStatus; requestedBy: string; requestedAt: string; decidedBy?: string; decidedAt?: string; decisionRemarks?: string; scope: OperatingRecordScope; version: number; }
export interface CreateAssetCalibrationInput { assetId: string; instrumentReference: string; calibratedOn: string; dueOn: string; standardReference: string; result: 'pass' | 'fail'; uncertainty?: number; certificateReference: string; }
export interface DecideAssetCalibrationInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number; }

export interface AssetSparePart { id: string; number: string; assetId: string; itemVariantId: string; description: string; quantityOnHand: number; reorderPoint: number; unitCost: number; warehouseId?: string; binId?: string; active: boolean; createdBy: string; createdAt: string; scope: OperatingRecordScope; version: number; }
export interface AssetSpareIssue { id: string; number: string; sparePartId: string; assetId: string; quantity: number; unitCost: number; workOrderId?: string; issuedBy: string; issuedAt: string; evidenceReference: string; scope: OperatingRecordScope; version: number; }
export interface CreateAssetSparePartInput { assetId: string; itemVariantId: string; description: string; quantityOnHand: number; reorderPoint: number; unitCost: number; warehouseId?: string; binId?: string; }
export interface IssueAssetSpareInput { sparePartId: string; quantity: number; workOrderId?: string; evidenceReference: string; expectedVersion: number; }

export type FleetVehicleStatus = 'available' | 'assigned' | 'maintenance' | 'retired';
export interface FleetVehicle { id: string; number: string; assetId: string; registrationNumber: string; vehicleType: string; odometer: number; fuelType: string; status: FleetVehicleStatus; insuranceExpiry?: string; pucExpiry?: string; permitExpiry?: string; createdBy: string; createdAt: string; scope: OperatingRecordScope; version: number; }
export interface CreateFleetVehicleInput { assetId: string; registrationNumber: string; vehicleType: string; odometer?: number; fuelType: string; insuranceExpiry?: string; pucExpiry?: string; permitExpiry?: string; }
export interface UpdateFleetVehicleInput { id: string; status: FleetVehicleStatus; odometer?: number; expectedVersion: number; }
export interface FleetTrip { id: string; number: string; vehicleId: string; driverUserId: string; tripDate: string; origin: string; destination: string; openingOdometer: number; closingOdometer?: number; distance?: number; purpose: string; status: 'planned' | 'started' | 'completed' | 'cancelled'; evidenceReference?: string; createdBy: string; createdAt: string; completedBy?: string; completedAt?: string; scope: OperatingRecordScope; version: number; }
export interface CreateFleetTripInput { vehicleId: string; driverUserId: string; tripDate: string; origin: string; destination: string; purpose: string; evidenceReference?: string; }
export interface CompleteFleetTripInput { id: string; closingOdometer: number; evidenceReference: string; expectedVersion: number; }

export type AssetInstalledBaseEventType = 'commissioned' | 'custody-transfer' | 'maintenance' | 'warranty-claim' | 'amc-renewal' | 'calibration' | 'spare-issue' | 'meter-reading' | 'impairment' | 'revaluation' | 'sale' | 'retirement' | 'fleet-trip';
export interface AssetInstalledBaseEvent { id: string; number: string; assetId: string; eventType: AssetInstalledBaseEventType; eventDate: string; referenceType: string; referenceId: string; summary: string; evidenceReference?: string; actorId: string; createdAt: string; scope: OperatingRecordScope; version: number; }

export type AssetLifecycleActionInput =
  | { kind: 'create-impairment'; input: CreateAssetImpairmentReviewInput }
  | { kind: 'decide-impairment'; input: DecideAssetImpairmentReviewInput }
  | { kind: 'complete-impairment'; input: CompleteAssetImpairmentReviewInput }
  | { kind: 'create-revaluation'; input: CreateAssetRevaluationInput }
  | { kind: 'decide-revaluation'; input: DecideAssetRevaluationInput }
  | { kind: 'complete-revaluation'; input: CompleteAssetRevaluationInput }
  | { kind: 'create-warranty'; input: CreateAssetWarrantyInput }
  | { kind: 'update-warranty'; input: UpdateAssetWarrantyStatusInput }
  | { kind: 'create-amc'; input: CreateAssetAmcContractInput }
  | { kind: 'decide-amc'; input: DecideAssetAmcContractInput }
  | { kind: 'update-amc'; input: UpdateAssetAmcStatusInput }
  | { kind: 'create-meter'; input: CreateAssetMeterInput }
  | { kind: 'record-meter'; input: RecordAssetMeterReadingInput }
  | { kind: 'create-corrective'; input: CreateCorrectiveMaintenanceInput }
  | { kind: 'transition-corrective'; input: TransitionCorrectiveMaintenanceInput }
  | { kind: 'create-calibration'; input: CreateAssetCalibrationInput }
  | { kind: 'decide-calibration'; input: DecideAssetCalibrationInput }
  | { kind: 'create-spare'; input: CreateAssetSparePartInput }
  | { kind: 'issue-spare'; input: IssueAssetSpareInput }
  | { kind: 'create-fleet-vehicle'; input: CreateFleetVehicleInput }
  | { kind: 'update-fleet-vehicle'; input: UpdateFleetVehicleInput }
  | { kind: 'create-fleet-trip'; input: CreateFleetTripInput }
  | { kind: 'complete-fleet-trip'; input: CompleteFleetTripInput };

export interface CreatePreventiveMaintenancePlanInput {
  assetId: string;
  name: string;
  intervalDays: number;
  nextDueOn: string;
  estimatedMinutes: number;
  checklist: Array<{
    title: string;
    required: boolean;
  }>;
}

export interface GenerateDueMaintenanceWorkOrderInput {
  planId: string;
  asOfDate: string;
  technicianUserId: string;
  expectedVersion: number;
}

export interface StartMaintenanceWorkOrderInput {
  id: string;
  expectedVersion: number;
}

export interface CompleteMaintenanceWorkOrderInput {
  id: string;
  completedChecklistItemIds: string[];
  serviceReport: string;
  completionEvidenceReference: string;
  expectedVersion: number;
}

export interface VerifyMaintenanceWorkOrderInput {
  id: string;
  decision: 'verified' | 'reopened';
  remarks: string;
  expectedVersion: number;
}
