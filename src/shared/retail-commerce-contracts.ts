import type { OperatingRecordScope } from './revenue-ops-contracts';

/** First-class Indian retail channels. WhatsApp orders remain provider-gated but use the same order, stock, GST, and settlement controls. */
export type RetailCommerceChannel = 'marketplace' | 'ondc' | 'website' | 'whatsapp';
export type RetailCommerceCapability = 'catalog-push' | 'inventory-push' | 'order-pull' | 'settlement-pull';
export type RetailCommerceConnectorStatus = 'draft' | 'configured' | 'certified' | 'suspended';
export type RetailCommerceSyncKind = 'catalog' | 'inventory' | 'orders' | 'settlement';
export type RetailCommerceSyncStatus = 'prepared' | 'completed' | 'completed-with-exceptions' | 'failed';
export type RetailCommerceConflictDecision = 'retry' | 'accepted' | 'waived';
export type RetailCommerceOrderStatus = 'imported' | 'confirmed' | 'fulfilled' | 'cancelled' | 'return-requested' | 'returned' | 'rto';

export interface RetailPurchaseOcrLine {
  id: string;
  description: string;
  itemVariantId?: string;
  purchaseOrderLineId?: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  confidence: number;
}

export interface RetailPurchaseOcrDocument {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  source: 'upload' | 'email' | 'scan';
  fileName: string;
  fileChecksum: string;
  supplierId?: string;
  purchaseOrderId?: string;
  goodsReceiptId?: string;
  ocrProviderProfileId?: string;
  providerResponseReference?: string;
  providerResponseChecksum?: string;
  providerResponseByteLength?: number;
  extractedInvoiceNumber?: string;
  extractedInvoiceDate?: string;
  extractedSupplierGstin?: string;
  extractedTotalAmount?: number;
  extractionConfidence: number;
  lines: RetailPurchaseOcrLine[];
  status: 'received' | 'review' | 'approved' | 'rejected' | 'converted';
  submittedBy: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewEvidence?: string;
  convertedSupplierInvoiceId?: string;
  version: number;
}

export interface RetailCommerceConnector {
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  channel: RetailCommerceChannel;
  environment: 'sandbox' | 'production';
  baseUrl: string;
  capabilities: RetailCommerceCapability[];
  credentialStatus: 'missing' | 'configured';
  credentialFingerprint?: string;
  /** Monotonic credential generation; a changed secret invalidates old conformance evidence. */
  credentialRevision?: number;
  status: RetailCommerceConnectorStatus;
  createdBy: string;
  createdAt: string;
  lastSyncAt?: string;
  /** Last accepted provider cursor checkpoint for this connector. */
  lastSyncCursor?: string;
  lastSyncCursorKind?: RetailCommerceSyncKind;
  lastSyncRunId?: string;
  version: number;
}

export interface RetailCommerceSyncRun {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  connectorId: string;
  kind: RetailCommerceSyncKind;
  status: RetailCommerceSyncStatus;
  requestChecksum: string;
  evidenceReference?: string;
  /** Provider-supplied response evidence; absent until a real response is assessed. */
  responseChecksum?: string;
  responseByteLength?: number;
  providerReference?: string;
  remoteCursor?: string;
  recordsRead: number;
  recordsAccepted: number;
  recordsRejected: number;
  requestedBy: string;
  requestedAt: string;
  completedAt?: string;
  channelConflictResolutionId?: string;
  channelConflictDecision?: RetailCommerceConflictDecision;
  channelConflictResolvedBy?: string;
  channelConflictResolvedAt?: string;
  channelConflictResolutionEvidence?: string;
  version: number;
}

export interface RetailCommerceOrder {
  scope?: OperatingRecordScope;
  id: string;
  connectorId: string;
  remoteOrderId: string;
  orderNumber: string;
  status: RetailCommerceOrderStatus;
  /** Last provider-declared lifecycle status. This never overwrites local custody status. */
  remoteStatus?: RetailCommerceOrderStatus;
  remoteStatusUpdatedAt?: string;
  remoteStatusEvidence?: string;
  remoteStatusChecksum?: string;
  lines: Array<{ itemVariantId: string; remoteSku?: string; quantity: number; unitPrice: number; taxableValue: number; gstRate: number }>;
  totalAmount: number;
  remoteCreatedAt: string;
  remotePayloadChecksum: string;
  localSalesOrderId?: string;
  salesOrderHandoffEvidence?: string;
  salesOrderHandoffBy?: string;
  salesOrderHandoffAt?: string;
  importedBy: string;
  importedAt: string;
  statusUpdatedBy?: string;
  statusUpdatedAt?: string;
  statusEvidence?: string;
  rtoReference?: string;
  retailReturnId?: string;
  creditNoteReconciliationId?: string;
  inventoryEvidenceReference?: string;
  inventoryReservationIds?: string[];
  inventoryReservationLocationId?: string;
  inventoryReservedAt?: string;
  channelConflictResolutionId?: string;
  channelConflictDecision?: RetailCommerceConflictDecision;
  channelConflictResolvedBy?: string;
  channelConflictResolvedAt?: string;
  channelConflictResolutionEvidence?: string;
  version: number;
}

/** Connector-specific remote SKU identity. Local SKUs are never assumed to match a channel SKU. */
export interface RetailCommerceCatalogMapping {
  scope?: OperatingRecordScope;
  id: string;
  connectorId: string;
  remoteSku: string;
  itemVariantId: string;
  remoteTitle?: string;
  status: 'prepared' | 'active' | 'disabled' | 'rejected';
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalEvidence?: string;
  disabledBy?: string;
  disabledAt?: string;
  disableEvidence?: string;
  version: number;
}

export interface RetailSettlementReconciliation {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  connectorId: string;
  settlementReference: string;
  periodFrom: string;
  periodTo: string;
  grossAmount: number;
  /** Aggregate provider refunds/returns deducted before settlement net. */
  refundAmount?: number;
  feeAmount: number;
  taxWithheldAmount: number;
  netAmount: number;
  localNetAmount: number;
  varianceAmount: number;
  orderIds: string[];
  remotePayloadChecksum: string;
  status: 'prepared' | 'matched' | 'variance-review' | 'resolved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionEvidence?: string;
  allocationPackId?: string;
  withholdingEvidenceId?: string;
  journalDraftId?: string;
  channelConflictResolutionId?: string;
  channelConflictDecision?: RetailCommerceConflictDecision;
  channelConflictResolvedBy?: string;
  channelConflictResolvedAt?: string;
  channelConflictResolutionEvidence?: string;
  version: number;
}

export interface RetailSettlementAllocationPack {
  scope?: OperatingRecordScope;
  id: string;
  settlementId: string;
  connectorId: string;
  allocations: Array<{ orderId: string; grossAmount: number; refundAmount: number; feeAmount: number; taxWithheldAmount: number; netAmount: number }>;
  allocatedGrossAmount: number;
  allocatedRefundAmount: number;
  allocatedFeeAmount: number;
  allocatedTaxWithheldAmount: number;
  allocatedNetAmount: number;
  payloadChecksum: string;
  status: 'prepared' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionEvidence?: string;
  version: number;
}

export type RetailCommerceConflictResolutionDecision = RetailCommerceConflictDecision;
export interface RetailCommerceConflictResolution {
  scope?: OperatingRecordScope;
  id: string;
  conflictId: string;
  kind: string;
  sourceId: string;
  connectorId: string;
  decision: RetailCommerceConflictResolutionDecision;
  status: 'prepared' | 'approved' | 'rejected';
  /** Checksum of the source provider/request evidence captured when the pack was prepared. */
  sourcePayloadChecksum?: string;
  requestedBy: string;
  requestedAt: string;
  evidence: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionEvidence?: string;
  version: number;
}

export interface RetailSettlementWithholdingEvidence {
  scope?: OperatingRecordScope;
  id: string;
  settlementId: string;
  connectorId: string;
  taxType: 'tds' | 'tcs';
  periodFrom: string;
  periodTo: string;
  amount: number;
  certificateReference: string;
  challanReference?: string;
  status: 'prepared' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionEvidence?: string;
  version: number;
}

export interface CreateRetailPurchaseOcrInput {
  source: RetailPurchaseOcrDocument['source'];
  fileName: string;
  fileChecksum: string;
  supplierId?: string;
  purchaseOrderId?: string;
  goodsReceiptId?: string;
  ocrProviderProfileId?: string;
  providerResponseReference?: string;
  providerResponseChecksum?: string;
  providerResponseByteLength?: number;
  extractedInvoiceNumber?: string;
  extractedInvoiceDate?: string;
  extractedSupplierGstin?: string;
  extractedTotalAmount?: number;
  extractionConfidence: number;
  lines: Array<Omit<RetailPurchaseOcrLine, 'id'>>;
}
export interface DecideRetailPurchaseOcrInput { id: string; decision: 'approved' | 'rejected'; evidence: string; expectedVersion: number }
export interface ConvertRetailPurchaseOcrInput { id: string; mappingId: string; purchaseOrderId: string; goodsReceiptId: string; supplierInvoiceNumber: string; invoiceDate: string; lines: Array<{ purchaseOrderLineId: string; quantity: number; unitPrice: number; gstRate: number }>; expectedVersion: number }
export interface CreateRetailCommerceConnectorInput { code: string; name: string; channel: RetailCommerceChannel; environment: RetailCommerceConnector['environment']; baseUrl: string; capabilities: RetailCommerceCapability[] }
export interface ConfigureRetailCommerceCredentialsInput {
  connectorId: string;
  /** Fingerprint of the credential material. Required for legacy/manual provider packs. */
  fingerprint?: string;
  /** Optional secret material is accepted only in the main-process vault and is never persisted in renderer state. */
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  bearerToken?: string;
  signingKey?: string;
}
export interface CreateRetailCommerceSyncInput { connectorId: string; kind: RetailCommerceSyncKind; requestChecksum: string }
export interface ExecuteRetailCommerceSyncInput { id: string; method: 'GET' | 'POST'; path: string; payloadJson?: string; applyOrders?: boolean; applySettlements?: boolean; expectedVersion: number }
export interface RecordRetailCommerceSyncInput { id: string; status: Exclude<RetailCommerceSyncStatus, 'prepared'>; evidenceReference: string; responseChecksum?: string; responseByteLength?: number; providerReference?: string; recordsRead: number; recordsAccepted: number; recordsRejected: number; remoteCursor?: string; expectedVersion: number }
export interface ImportRetailCommerceOrderInput { connectorId: string; remoteOrderId: string; orderNumber: string; remoteCreatedAt: string; remotePayloadChecksum: string; remoteStatus?: RetailCommerceOrderStatus; remoteStatusEvidence?: string; remoteStatusChecksum?: string; lines: Array<{ itemVariantId?: string; remoteSku?: string; quantity: number; unitPrice: number; gstRate: number }> }
export interface RecordRetailCommerceRemoteStatusInput { id: string; remoteStatus: RetailCommerceOrderStatus; remoteStatusChecksum: string; evidence: string; expectedVersion: number }
export interface CreateRetailCommerceCatalogMappingInput { connectorId: string; remoteSku: string; itemVariantId: string; remoteTitle?: string }
export interface DecideRetailCommerceCatalogMappingInput { id: string; decision: 'approved' | 'rejected'; evidence: string; expectedVersion: number }
export interface DisableRetailCommerceCatalogMappingInput { id: string; expectedVersion: number; evidence: string }
export interface CreateRetailSettlementReconciliationInput { connectorId: string; settlementReference: string; periodFrom: string; periodTo: string; grossAmount: number; refundAmount?: number; feeAmount: number; taxWithheldAmount: number; localNetAmount: number; orderIds: string[]; remotePayloadChecksum: string }
export interface DecideRetailSettlementReconciliationInput { id: string; decision: 'resolved' | 'rejected'; evidence: string; expectedVersion: number }
export interface CreateRetailSettlementAllocationPackInput { settlementId: string; allocations: RetailSettlementAllocationPack['allocations'] }
export interface DecideRetailSettlementAllocationPackInput { id: string; decision: 'approved' | 'rejected'; evidence: string; expectedVersion: number }
export interface CreateRetailCommerceConflictResolutionInput { conflictId: string; kind: string; sourceId: string; connectorId: string; decision: RetailCommerceConflictResolutionDecision; evidence: string }
export interface DecideRetailCommerceConflictResolutionInput { id: string; decision: 'approved' | 'rejected'; evidence: string; expectedVersion: number }
export interface CreateRetailSettlementWithholdingEvidenceInput { settlementId: string; taxType: RetailSettlementWithholdingEvidence['taxType']; periodFrom: string; periodTo: string; amount: number; certificateReference: string; challanReference?: string }
export interface DecideRetailSettlementWithholdingEvidenceInput { id: string; decision: 'approved' | 'rejected'; evidence: string; expectedVersion: number }
export interface PrepareRetailSettlementJournalInput { id: string; expectedVersion: number }
export interface LinkRetailCommerceReturnInput { orderId: string; retailReturnId: string; creditNoteReconciliationId: string; inventoryEvidenceReference: string; expectedVersion: number }
export interface HandoffRetailCommerceOrderInput { orderId: string; salesOrderId: string; evidence: string; expectedVersion: number }
export interface ReserveRetailCommerceOrderInput { orderId: string; locationId: string; evidence: string; expectedVersion: number }

export type RetailOcrDocumentKind = 'supplier-invoice' | 'credit-note' | 'debit-note';
export type RetailOcrProviderStatus = 'draft' | 'configured' | 'certified' | 'suspended';
export interface RetailOcrProviderTestEvidence {
  evidence: string;
  testedAt: string;
  testedBy: string;
  checksum: string;
  /** Credential generation used for this independent provider replay. */
  credentialRevision?: number;
}
export interface RetailOcrProviderProfile {
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  mode: 'manual' | 'api';
  baseUrl?: string;
  status: RetailOcrProviderStatus;
  credentialStatus: 'missing' | 'configured';
  credentialFingerprint?: string;
  /** Monotonic credential generation; prior document replays remain audit history only. */
  credentialRevision?: number;
  supportedDocumentKinds: RetailOcrDocumentKind[];
  createdBy: string;
  createdAt: string;
  lastTestEvidence?: string;
  lastTestedAt?: string;
  /** Independent adapter replay assessor and immutable evidence checksum. */
  lastTestedBy?: string;
  lastTestChecksum?: string;
  /** Per-document-kind evidence; legacy profiles may only have the aggregate fields above. */
  testEvidenceByDocumentKind?: Partial<Record<RetailOcrDocumentKind, RetailOcrProviderTestEvidence>>;
  version: number;
}
export interface RetailPurchaseOcrMapping {
  scope?: OperatingRecordScope;
  id: string;
  ocrDocumentId: string;
  mappings: Array<{ ocrLineId: string; purchaseOrderLineId: string; itemVariantId: string }>;
  status: 'prepared' | 'applied' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  appliedBy?: string;
  appliedAt?: string;
  evidence?: string;
  version: number;
}
export interface RetailCommercePushBatch {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  connectorId: string;
  kind: 'catalog' | 'inventory';
  records: Array<{ itemVariantId: string; sku: string; remoteSku: string; name: string; quantity: number; unitPrice?: number; gstRate?: number }>;
  payloadChecksum: string;
  status: 'prepared' | 'acknowledged' | 'failed';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  evidence?: string;
  responseChecksum?: string;
  responseByteLength?: number;
  providerReference?: string;
  version: number;
}
export interface RetailCommerceConformanceCase {
  scope?: OperatingRecordScope;
  id: string;
  connectorId: string;
  /** Capability exercised by this case; legacy records may omit it and are never enough to certify a multi-capability connector. */
  capability?: RetailCommerceCapability;
  /** Credential generation used when the provider scenario was prepared. */
  credentialRevision?: number;
  suiteName: string;
  suiteVersion: string;
  scenario: string;
  result: 'planned' | 'passed' | 'failed';
  evidenceReference?: string;
  resultChecksum?: string;
  preparedBy: string;
  preparedAt: string;
  assessedBy?: string;
  assessedAt?: string;
  version: number;
}
export type RetailPurchaseExceptionKind = 'low-confidence' | 'unmapped-line' | 'tax-mismatch' | 'quantity-variance' | 'duplicate-invoice' | 'invalid-gstin' | 'invoice-date' | 'total-mismatch';
export type RetailPurchaseExceptionSeverity = 'low' | 'medium' | 'high' | 'critical';
export interface RetailPurchaseException {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  ocrDocumentId: string;
  ocrLineId?: string;
  kind: RetailPurchaseExceptionKind;
  severity: RetailPurchaseExceptionSeverity;
  status: 'open' | 'acknowledged' | 'resolved' | 'waived';
  message: string;
  suggestedAction: string;
  requestedBy: string;
  requestedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionEvidence?: string;
  version: number;
}
export interface CreateRetailOcrProviderProfileInput { code: string; name: string; mode: RetailOcrProviderProfile['mode']; baseUrl?: string; supportedDocumentKinds: RetailOcrDocumentKind[] }

/** Legacy records omit this field until their credentials are changed. */
export function retailCommerceCredentialRevision(connector: Pick<RetailCommerceConnector, 'credentialRevision'>): number {
  return connector.credentialRevision ?? 0;
}

/** A capability replay can certify only the credential generation that produced it. */
export function retailCommerceConformanceMatchesCredentialRevision(
  connector: Pick<RetailCommerceConnector, 'credentialRevision'>,
  conformance: Pick<RetailCommerceConformanceCase, 'credentialRevision'>,
): boolean {
  return connector.credentialRevision === undefined
    ? conformance.credentialRevision === undefined
    : conformance.credentialRevision === connector.credentialRevision;
}

/** An OCR replay can certify only the credential generation that produced it. */
export function retailOcrEvidenceMatchesCredentialRevision(
  provider: Pick<RetailOcrProviderProfile, 'credentialRevision'>,
  evidence: Pick<RetailOcrProviderTestEvidence, 'credentialRevision'>,
): boolean {
  return provider.credentialRevision === undefined
    ? evidence.credentialRevision === undefined
    : evidence.credentialRevision === provider.credentialRevision;
}

export interface ConfigureRetailOcrProviderInput { id: string; credentialFingerprint?: string; clientId?: string; clientSecret?: string; apiKey?: string; bearerToken?: string; signingKey?: string }
export interface TestRetailOcrProviderInput { id: string; evidence: string; documentKind?: RetailOcrDocumentKind; expectedVersion: number }
export interface ExecuteRetailOcrInput { providerId: string; method: 'GET' | 'POST'; path: string; payloadJson?: string; source: RetailPurchaseOcrDocument['source']; fileName: string; fileChecksum: string; supplierId?: string; purchaseOrderId?: string; goodsReceiptId?: string; expectedProviderVersion: number }
export interface PrepareRetailPurchaseOcrMappingInput { ocrDocumentId: string; mappings: RetailPurchaseOcrMapping['mappings'] }
export interface ApplyRetailPurchaseOcrMappingInput { id: string; evidence: string; expectedVersion: number }
export interface PrepareRetailCommercePushInput { connectorId: string; kind: RetailCommercePushBatch['kind']; itemVariantIds: string[] }
export interface DecideRetailCommercePushInput { id: string; decision: 'acknowledged' | 'failed'; evidence: string; providerPayloadChecksum: string; responseChecksum?: string; responseByteLength?: number; providerReference?: string; expectedVersion: number }
export interface ExecuteRetailCommercePushInput { id: string; method: 'POST'; path: string; payloadJson?: string; expectedVersion: number }
export interface TransitionRetailCommerceOrderInput { id: string; status: RetailCommerceOrder['status']; evidence: string; rtoReference?: string; expectedVersion: number }
export interface CreateRetailCommerceConformanceCaseInput { connectorId: string; capability?: RetailCommerceCapability; suiteName: string; suiteVersion: string; scenario: string }
/** Plans one independent conformance case for every declared connector capability.
 * Planning creates only local test-pack records; it never certifies a provider. */
export interface PlanRetailCommerceConformancePackInput { connectorId: string; suiteName: string; suiteVersion: string }
export interface RecordRetailCommerceConformanceInput { id: string; result: Exclude<RetailCommerceConformanceCase['result'], 'planned'>; evidenceReference: string; resultChecksum: string; expectedVersion: number }
export interface ScanRetailPurchaseExceptionsInput { ocrDocumentId?: string }
export interface ResolveRetailPurchaseExceptionInput { id: string; decision: 'resolved' | 'waived'; evidence: string; expectedVersion: number }
