import type { OperatingRecordScope } from './revenue-ops-contracts';

export type SupplierStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type PurchaseRequisitionStatus = 'submitted' | 'approved' | 'rejected' | 'converted' | 'cancelled';

export interface PurchaseRequisition {
  id: string;
  number: string;
  title: string;
  warehouseId: string;
  priority: 'low' | 'normal' | 'high';
  neededBy: string;
  justification: string;
  lines: Array<{ id: string; itemVariantId: string; description: string; quantity: number; estimatedUnitPrice: number; estimatedValue: number }>;
  estimatedValue: number;
  status: PurchaseRequisitionStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  convertedRfqId?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface Supplier {
  id: string;
  code: string;
  legalName: string;
  tradeName?: string;
  gstin?: string;
  pan?: string;
  stateCode: string;
  email: string;
  paymentTermDays: number;
  categories: string[];
  status: SupplierStatus;
  riskRating: 'low' | 'medium' | 'high';
  qualificationEvidence: string;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface ProcurementLine {
  id: string;
  itemVariantId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  taxableValue: number;
  taxAmount: number;
  totalAmount: number;
  receivedQuantity: number;
  invoicedQuantity: number;
}

export interface RequestForQuotation {
  id: string;
  number: string;
  title: string;
  warehouseId: string;
  supplierIds: string[];
  lines: Array<{ id: string; itemVariantId: string; description: string; quantity: number }>;
  requiredBy: string;
  status: 'draft' | 'issued' | 'awarded' | 'cancelled' | 'closed';
  createdBy: string;
  createdAt: string;
  awardedQuotationId?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface SupplierQuotation {
  id: string;
  number: string;
  rfqId: string;
  supplierId: string;
  validUntil: string;
  leadTimeDays: number;
  lines: Array<{ rfqLineId: string; itemVariantId: string; quantity: number; unitPrice: number; gstRate: number; taxableValue: number; taxAmount: number; totalAmount: number }>;
  totalAmount: number;
  commercialRemarks?: string;
  status: 'submitted' | 'awarded' | 'lost' | 'expired' | 'withdrawn';
  submittedBy: string;
  submittedAt: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  warehouseId: string;
  rfqId?: string;
  supplierQuotationId?: string;
  reorderProposalId?: string;
  deliveryBy: string;
  paymentTermDays: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'partially-received' | 'received' | 'closed' | 'cancelled';
  lines: ProcurementLine[];
  taxableValue: number;
  taxAmount: number;
  totalAmount: number;
  createdBy: string;
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface GoodsReceipt {
  id: string;
  number: string;
  purchaseOrderId: string;
  supplierId: string;
  warehouseId: string;
  receivingBinId: string;
  receivedAt: string;
  lines: Array<{ id: string; purchaseOrderLineId: string; itemVariantId: string; quantity: number; unitPrice: number; inventoryReference: string; batchNumber?: string; serialNumbers: string[] }>;
  status: 'received' | 'cost-pending' | 'costed';
  receivedBy: string;
  receivedAtRecorded: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface LandedCostAllocation {
  id: string;
  number: string;
  goodsReceiptId: string;
  basis: 'value' | 'quantity';
  charges: Array<{ description: string; amount: number }>;
  totalAmount: number;
  allocations: Array<{ goodsReceiptLineId: string; amount: number; adjustedUnitCost: number }>;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface SupplierInvoice {
  id: string;
  number: string;
  supplierId: string;
  purchaseOrderId: string;
  goodsReceiptId: string;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  lines: Array<{ purchaseOrderLineId: string; quantity: number; unitPrice: number; gstRate: number; totalAmount: number }>;
  totalAmount: number;
  recordedBy: string;
  recordedAt: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface ThreeWayMatch {
  id: string;
  number: string;
  purchaseOrderId: string;
  goodsReceiptId: string;
  supplierInvoiceId: string;
  quantityVariance: number;
  priceVariance: number;
  status: 'matched' | 'variance-review' | 'approved' | 'rejected';
  tolerancePercent: number;
  createdBy: string;
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  journalId?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreatePurchaseRequisitionInput { title: string; warehouseId: string; priority: PurchaseRequisition['priority']; neededBy: string; justification: string; lines: Array<{ itemVariantId: string; quantity: number; estimatedUnitPrice: number }> }
export interface DecidePurchaseRequisitionInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface CreateRfqFromRequisitionInput { requisitionId: string; supplierIds: string[]; requiredBy: string; expectedVersion: number }
export interface CreateSupplierInput { code: string; legalName: string; tradeName?: string; gstin?: string; pan?: string; stateCode: string; email: string; paymentTermDays: number; categories: string[]; riskRating: Supplier['riskRating']; qualificationEvidence: string }
export interface DecideSupplierInput { id: string; decision: Exclude<SupplierStatus, 'pending'>; remarks: string; expectedVersion: number }
export interface CreateRfqInput { title: string; warehouseId: string; supplierIds: string[]; lines: Array<{ itemVariantId: string; quantity: number }>; requiredBy: string }
export interface IssueRfqInput { id: string; expectedVersion: number }
export interface RecordSupplierQuotationInput { rfqId: string; supplierId: string; validUntil: string; leadTimeDays: number; lines: Array<{ rfqLineId: string; unitPrice: number; gstRate: number }>; commercialRemarks?: string }
export interface AwardRfqInput { rfqId: string; supplierQuotationId: string; expectedVersion: number }
export interface CreatePurchaseOrderFromRfqInput { rfqId: string; supplierQuotationId: string; deliveryBy: string }
export interface CreatePurchaseOrderFromReorderInput { reorderProposalId: string; supplierId: string; warehouseId: string; unitPrice: number; gstRate: number; deliveryBy: string }
export interface DecidePurchaseOrderInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface RecordGoodsReceiptInput { purchaseOrderId: string; receivingBinId: string; receivedAt: string; lines: Array<{ purchaseOrderLineId: string; quantity: number; batchNumber?: string; manufacturedAt?: string; expiresAt?: string; serialNumbers: string[] }> }
export interface CreateLandedCostInput { goodsReceiptId: string; basis: LandedCostAllocation['basis']; charges: Array<{ description: string; amount: number }> }
export interface DecideLandedCostInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface RecordSupplierInvoiceInput { purchaseOrderId: string; goodsReceiptId: string; supplierInvoiceNumber: string; invoiceDate: string; lines: Array<{ purchaseOrderLineId: string; quantity: number; unitPrice: number; gstRate: number }> }
export interface DecideThreeWayMatchInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface UpdateRetailPriceForTargetMarginInput { itemVariantId: string; targetUnitPrice: number }
