import type { OperatingRecordScope } from './revenue-ops-contracts';

export type InventoryTracking = 'none' | 'batch' | 'serial';
export type InventoryValuationMethod = 'fifo' | 'moving-average' | 'specific-identification';

export interface UnitOfMeasure {
  id: string;
  code: string;
  name: string;
  category: 'count' | 'weight' | 'volume' | 'length';
  precision: number;
  active: boolean;
  scope?: OperatingRecordScope;
  version: number;
}

export interface UomConversion {
  id: string;
  itemId: string;
  fromUomId: string;
  toUomId: string;
  factor: number;
  scope?: OperatingRecordScope;
  version: number;
}

export interface InventoryItem {
  id: string;
  productId: string;
  code: string;
  name: string;
  baseUomId: string;
  tracking: InventoryTracking;
  valuationMethod: InventoryValuationMethod;
  shelfLifeDays?: number;
  active: boolean;
  scope?: OperatingRecordScope;
  version: number;
}

export interface ItemVariant {
  id: string;
  itemId: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  barcode?: string;
  active: boolean;
  scope?: OperatingRecordScope;
  version: number;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  stateCode: string;
  stockLocationId: string;
  active: boolean;
  scope?: OperatingRecordScope;
  version: number;
}

export interface WarehouseZone {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  purpose: 'receiving' | 'storage' | 'picking' | 'quarantine' | 'dispatch' | 'returns';
  active: boolean;
  scope?: OperatingRecordScope;
  version: number;
}

export interface StorageBin {
  id: string;
  zoneId: string;
  code: string;
  name: string;
  capacity: number;
  pickSequence: number;
  status: 'available' | 'blocked';
  scope?: OperatingRecordScope;
  version: number;
}

export interface InventoryBatch {
  id: string;
  itemVariantId: string;
  batchNumber: string;
  manufacturedAt?: string;
  expiresAt?: string;
  status: 'released' | 'quarantine' | 'expired' | 'recalled';
  scope?: OperatingRecordScope;
  version: number;
}

export interface SerialUnit {
  id: string;
  itemVariantId: string;
  serialNumber: string;
  batchId?: string;
  binId: string;
  status: 'available' | 'reserved' | 'picked' | 'in-transit' | 'issued' | 'quarantine' | 'returned' | 'disposed';
  specificCost: number;
  scope?: OperatingRecordScope;
  version: number;
}

export interface BinBalance {
  id: string;
  binId: string;
  itemVariantId: string;
  batchId?: string;
  quantity: number;
  reserved: number;
  picked: number;
  available: number;
  unitCost: number;
  inventoryValue: number;
  scope?: OperatingRecordScope;
  version: number;
}

export interface InventoryCostLayer {
  id: string;
  itemVariantId: string;
  warehouseId: string;
  batchId?: string;
  serialUnitId?: string;
  receivedAt: string;
  remainingQuantity: number;
  unitCost: number;
  sourceReference: string;
  status: 'open' | 'consumed';
  scope?: OperatingRecordScope;
  version: number;
}

export interface InventoryLedgerEntry {
  id: string;
  type: 'receipt' | 'putaway' | 'pick' | 'issue' | 'retail-sale' | 'production-issue' | 'transfer-out' | 'transfer-in' | 'count-adjustment' | 'return' | 'disposition' | 'nrv-write-down' | 'nrv-reversal';
  itemVariantId: string;
  warehouseId: string;
  binId: string;
  batchId?: string;
  serialUnitId?: string;
  quantity: number;
  unitCost: number;
  value: number;
  reference: string;
  occurredAt: string;
  recordedBy: string;
  resultingQuantity: number;
  checksum: string;
  scope?: OperatingRecordScope;
}

export type WarehouseTaskStatus = 'planned' | 'in-progress' | 'completed' | 'blocked' | 'cancelled';

export interface WarehouseTask {
  id: string;
  number: string;
  type: 'putaway' | 'pick';
  sourceId: string;
  itemVariantId: string;
  batchId?: string;
  serialUnitIds: string[];
  fromBinId: string;
  toBinId?: string;
  quantity: number;
  priority: 'normal' | 'high' | 'urgent';
  assignedTo: string;
  dueAt: string;
  status: WarehouseTaskStatus;
  blockedReason?: string;
  completedAt?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface InventoryTransferLine {
  itemVariantId: string;
  batchId?: string;
  serialUnitIds: string[];
  quantity: number;
  unitCost: number;
}

export interface InventoryTransfer {
  id: string;
  number: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  fromBinId: string;
  toBinId: string;
  lines: InventoryTransferLine[];
  status: 'draft' | 'released' | 'in-transit' | 'received' | 'cancelled';
  createdBy: string;
  createdAt: string;
  releasedBy?: string;
  receivedBy?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CycleCountLine {
  binId: string;
  itemVariantId: string;
  batchId?: string;
  expectedQuantity: number;
  countedQuantity?: number;
  varianceQuantity?: number;
  status: 'pending' | 'counted' | 'reviewed' | 'posted';
}

export interface CycleCountPlan {
  id: string;
  number: string;
  warehouseId: string;
  zoneId?: string;
  blindCount: boolean;
  scheduledAt: string;
  assignedTo: string;
  lines: CycleCountLine[];
  status: 'planned' | 'counting' | 'review' | 'posted' | 'cancelled';
  createdBy: string;
  reviewedBy?: string;
  postedAt?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface ReorderPolicy {
  id: string;
  itemVariantId: string;
  warehouseId: string;
  minimumQuantity: number;
  reorderPoint: number;
  maximumQuantity: number;
  safetyStock: number;
  leadTimeDays: number;
  active: boolean;
  scope?: OperatingRecordScope;
  version: number;
}

export interface ReorderProposal {
  id: string;
  policyId: string;
  availableQuantity: number;
  recommendedQuantity: number;
  requiredBy: string;
  reason: string;
  status: 'proposed' | 'approved' | 'rejected' | 'converted';
  generatedAt: string;
  decidedBy?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface InventoryValuationReview {
  id: string;
  itemVariantId: string;
  warehouseId: string;
  asOfDate: string;
  quantity: number;
  carryingUnitCost: number;
  netRealisableValuePerUnit: number;
  adjustmentAmount: number;
  type: 'write-down' | 'reversal' | 'none';
  rationale: string;
  sourceUrl?: string;
  status: 'pending' | 'approved' | 'rejected' | 'exported';
  requestedBy: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  checksum: string;
  scope?: OperatingRecordScope;
  version: number;
}

/**
 * A governed, physical inventory correction. Unlike a cycle count, this is a
 * known, evidenced event (opening balance, damage, expiry, or shrinkage).
 * Quantity never changes on submission or approval; it changes only when a
 * separately authorised operator posts the approved evidence.
 */
export type InventoryDispositionKind = 'opening-balance' | 'damage' | 'expiry' | 'shrinkage';
export type InventoryDispositionStatus = 'submitted' | 'approved' | 'rejected' | 'posted';

export interface InventoryDisposition {
  id: string;
  number: string;
  kind: InventoryDispositionKind;
  warehouseId: string;
  binId: string;
  itemVariantId: string;
  batchId?: string;
  serialUnitIds: string[];
  /** Opening-balance-only serial identities, created by the controlled receipt. */
  serialNumbers?: string[];
  quantity: number;
  /** Captured from the source balance, or supplied only for an opening balance. */
  unitCostSnapshot: number;
  totalValueSnapshot: number;
  availableQuantityBefore: number;
  reason: string;
  evidenceReference: string;
  occurredAt: string;
  /** Opening-balance-only traceability, passed to the controlled receipt when posted. */
  batchNumber?: string;
  manufacturedAt?: string;
  expiresAt?: string;
  status: InventoryDispositionStatus;
  submittedBy: string;
  submittedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalEvidence?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  postedBy?: string;
  postedAt?: string;
  /** Actual cost consumed at posting; it can differ from the submitted balance snapshot under FIFO. */
  postedUnitCost?: number;
  postedTotalValue?: number;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreateUomInput { code: string; name: string; category: UnitOfMeasure['category']; precision: number }
export interface CreateUomConversionInput { itemId: string; fromUomId: string; toUomId: string; factor: number }
export interface CreateInventoryItemInput { productId: string; code: string; name: string; baseUomId: string; tracking: InventoryTracking; valuationMethod: InventoryValuationMethod; shelfLifeDays?: number }
export interface CreateItemVariantInput { itemId: string; sku: string; name: string; attributes: Record<string, string>; barcode?: string }
export interface CreateWarehouseInput { code: string; name: string; stateCode: string; stockLocationId: string }
export interface CreateWarehouseZoneInput { warehouseId: string; code: string; name: string; purpose: WarehouseZone['purpose'] }
export interface CreateStorageBinInput { zoneId: string; code: string; name: string; capacity: number; pickSequence: number }
export interface ReceiveInventoryInput { warehouseId: string; receivingBinId: string; itemVariantId: string; quantity: number; uomId: string; unitCost: number; reference: string; receivedAt: string; batchNumber?: string; manufacturedAt?: string; expiresAt?: string; serialNumbers: string[] }
export interface CreatePutawayTaskInput { itemVariantId: string; batchId?: string; serialUnitIds?: string[]; fromBinId: string; toBinId: string; quantity: number; assignedTo: string; dueAt: string; priority: WarehouseTask['priority'] }
export interface CreatePickTaskInput { reservationId: string; itemVariantId: string; batchId?: string; fromBinId: string; quantity: number; serialUnitIds: string[]; assignedTo: string; dueAt: string; priority: WarehouseTask['priority'] }
export interface TransitionWarehouseTaskInput { id: string; toStatus: WarehouseTaskStatus; blockedReason?: string; expectedVersion: number }
export interface CreateInventoryTransferInput { fromWarehouseId: string; toWarehouseId: string; fromBinId: string; toBinId: string; lines: Array<Omit<InventoryTransferLine, 'unitCost'>> }
export interface TransitionInventoryTransferInput { id: string; toStatus: InventoryTransfer['status']; expectedVersion: number }
export interface CreateCycleCountInput { warehouseId: string; zoneId?: string; blindCount: boolean; scheduledAt: string; assignedTo: string }
export interface RecordCycleCountInput { id: string; counts: Array<{ binId: string; itemVariantId: string; batchId?: string; countedQuantity: number }>; expectedVersion: number }
export interface DecideCycleCountInput { id: string; decision: 'approved' | 'rejected'; expectedVersion: number }
export interface CreateReorderPolicyInput { itemVariantId: string; warehouseId: string; minimumQuantity: number; reorderPoint: number; maximumQuantity: number; safetyStock: number; leadTimeDays: number }
export interface DecideReorderProposalInput { id: string; decision: 'approved' | 'rejected'; expectedVersion: number }
export interface CreateInventoryValuationReviewInput { itemVariantId: string; warehouseId: string; asOfDate: string; netRealisableValuePerUnit: number; rationale: string; sourceUrl?: string }
export interface DecideInventoryValuationReviewInput { id: string; decision: 'approved' | 'rejected'; expectedVersion: number }
export interface ConsumeInventoryForProductionInput { warehouseId: string; binId: string; itemVariantId: string; batchId?: string; serialUnitIds: string[]; quantity: number; reference: string; occurredAt: string }
/** Direct, counter-controlled issue. It is the sole physical stock path for a retail checkout. */
export interface IssueRetailInventoryInput { warehouseId: string; binId: string; itemVariantId: string; batchId?: string; serialUnitIds: string[]; quantity: number; reference: string; occurredAt: string }
/**
 * A return receipt is only called after the retail-return domain has matched
 * an immutable counter-sale line and obtained its independent approval.
 */
export interface ReturnRetailInventoryInput {
  warehouseId: string;
  destinationBinId: string;
  itemVariantId: string;
  batchId?: string;
  serialUnitIds: string[];
  quantity: number;
  unitCost: number;
  reference: string;
  occurredAt: string;
  outcome: 'resalable' | 'quarantine' | 'damaged';
}
export interface CreateInventoryDispositionInput {
  kind: InventoryDispositionKind;
  warehouseId: string;
  binId: string;
  itemVariantId: string;
  batchId?: string;
  serialUnitIds: string[];
  /** Required only for serial-controlled opening balances. */
  serialNumbers?: string[];
  quantity: number;
  /** Required for opening balance; ignored for destructive dispositions. */
  unitCost?: number;
  reason: string;
  evidenceReference: string;
  occurredAt: string;
  batchNumber?: string;
  manufacturedAt?: string;
  expiresAt?: string;
}
export interface DecideInventoryDispositionInput { id: string; decision: 'approved' | 'rejected'; evidence: string; expectedVersion: number }
export interface PostInventoryDispositionInput { id: string; expectedVersion: number }
