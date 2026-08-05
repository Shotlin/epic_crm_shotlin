import type { OperatingRecordScope } from './revenue-ops-contracts';

export type RetailInterBranchTransferDirection = 'outbound' | 'return-to-ho';
export type RetailInterBranchTransferStatus = 'draft' | 'approved' | 'dispatched' | 'arrived' | 'rejected' | 'cancelled';

export interface RetailInterBranchTransferLine {
  itemVariantId: string;
  batchId?: string;
  serialUnitIds: string[];
  quantity: number;
  unitCost: number;
}

export interface RetailInterBranchTransfer {
  id: string;
  number: string;
  direction: RetailInterBranchTransferDirection;
  originBranchId: string;
  destinationBranchId: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  sourceBinId: string;
  destinationBinId: string;
  inventoryTransferId: string;
  lines: RetailInterBranchTransferLine[];
  totalValue: number;
  status: RetailInterBranchTransferStatus;
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalEvidenceReference?: string;
  dispatchedBy?: string;
  dispatchedAt?: string;
  dispatchEvidenceReference?: string;
  arrivedBy?: string;
  arrivedAt?: string;
  arrivalEvidenceReference?: string;
  rejectionReason?: string;
  dispatchJournalDraftId?: string;
  arrivalJournalDraftId?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreateRetailInterBranchTransferInput {
  direction: RetailInterBranchTransferDirection;
  destinationBranchId: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  sourceBinId: string;
  destinationBinId: string;
  lines: Array<{ itemVariantId: string; batchId?: string; serialUnitIds: string[]; quantity: number }>;
}

export interface DecideRetailInterBranchTransferInput {
  id: string;
  decision: 'approved' | 'rejected';
  evidenceReference: string;
  expectedVersion: number;
}

export interface DispatchRetailInterBranchTransferInput {
  id: string;
  evidenceReference: string;
  expectedVersion: number;
}

export interface ReceiveRetailInterBranchTransferInput {
  id: string;
  evidenceReference: string;
  expectedVersion: number;
}
