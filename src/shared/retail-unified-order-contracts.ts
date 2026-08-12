/**
 * Source-neutral omnichannel order evidence.  These contracts are deliberately
 * credential-free: the Hub/provider adapter supplies the event, while the
 * Electron app stores only normalized evidence and governed intents.
 */
export type RetailOrderChannel = 'pos' | 'website' | 'app' | 'whatsapp' | 'ondc' | 'marketplace';
export type RetailExternalOrderStatus = 'received' | 'accepted' | 'picking' | 'packed' | 'fulfilled' | 'cancelled' | 'return-requested' | 'returned' | 'rto';
export type RetailOrderIngestionMode = 'shadow' | 'governed';
export type RetailOrderHandlingState = 'shadow-observed' | 'awaiting-local-handoff' | 'awaiting-stock-reservation' | 'awaiting-stock-mapping' | 'awaiting-pick-completion' | 'awaiting-pack' | 'awaiting-dispatch' | 'awaiting-carrier-dispatch' | 'awaiting-delivery' | 'delivered' | 'reconciliation-required' | 'cancelled-reconciled' | 'rto-reconciled' | 'return-reconciled';
export type RetailOrderIngestionOutcome = 'recorded' | 'idempotent' | 'conflicted';
export type RetailOrderConflictKind = 'source-event-digest-mismatch' | 'invalid-status-transition' | 'unmapped-stock-line' | 'stale-governed-handoff';
export type RetailOrderReconciliationKind = 'cancellation' | 'return' | 'rto';
/** Provider callback statuses are evidence only; local custody remains governed. */
export type RetailCarrierCallbackStatus = 'in-transit' | 'out-for-delivery' | 'delivered' | 'returned' | 'rto' | 'cancelled' | 'exception' | 'unknown';

export interface RetailOrderSource {
  channel: RetailOrderChannel;
  connectionId: string;
}

export interface RetailOrderSourceLine {
  externalLineId: string;
  sku: string;
  itemVariantId?: string;
  quantity: number;
  unitAmountPaise: number;
}

export interface RetailOrderSourceEvent {
  source: RetailOrderSource;
  externalOrderId: string;
  externalEventId: string;
  occurredAt: string;
  status: RetailExternalOrderStatus;
  currency: string;
  totalAmountPaise: number;
  lines: RetailOrderSourceLine[];
}

export interface RetailOrderSourceEventRecord {
  externalEventId: string;
  sourceDigest: string;
  occurredAt: string;
  observedStatus: RetailExternalOrderStatus;
  receivedAt: string;
}

export interface RetailGovernedHandoffEvidence {
  approvedBy: string;
  approvedAt: string;
  approvalEvidenceReference: string;
  approvedSourceDigest: string;
}

export interface RetailUnifiedOrderRecord {
  id: string;
  identityKey: string;
  source: RetailOrderSource;
  externalOrderId: string;
  observedStatus: RetailExternalOrderStatus;
  handlingState: RetailOrderHandlingState;
  currency: string;
  totalAmountPaise: number;
  lines: RetailOrderSourceLine[];
  sourceDigest: string;
  sourceEvents: RetailOrderSourceEventRecord[];
  observedBy?: string;
  observedAt?: string;
  governedHandoff?: RetailGovernedHandoffEvidence;
}

export interface RetailOrderReservationIntent {
  id: string;
  orderId: string;
  externalOrderId: string;
  sourceDigest: string;
  status: 'pending' | 'executed' | 'superseded';
  lines: Array<{ itemVariantId: string; quantity: number }>;
  requestedAt: string;
  supersededAt?: string;
  executedAt?: string;
  executionId?: string;
  boundary: 'requires-governed-stock-service';
}

export interface RetailOrderReconciliationRequirement {
  id: string;
  orderId: string;
  externalOrderId: string;
  kind: RetailOrderReconciliationKind;
  sourceDigest: string;
  status: 'required';
  actions: string[];
  requiredAt: string;
  boundary: 'requires-approved-stock-payment-and-tax-workflows';
}

export interface RetailOrderIngestionConflict {
  id: string;
  kind: RetailOrderConflictKind;
  status: 'open';
  orderId?: string;
  externalOrderId: string;
  externalEventId: string;
  source: RetailOrderSource;
  sourceDigest: string;
  detail: string;
  recordedAt: string;
}

export interface RetailOrderIngestionState {
  orders: RetailUnifiedOrderRecord[];
  conflicts: RetailOrderIngestionConflict[];
  reservationIntents: RetailOrderReservationIntent[];
  reconciliationRequirements: RetailOrderReconciliationRequirement[];
  /** Local outbox evidence for a future Retail Hub transport; never a live send. */
  hubHandoffs: RetailOrderHubHandoffEvidence[];
  /** Explicit mapping evidence into the existing sales-order/fulfilment chain. */
  fulfilmentHandoffs: RetailOrderFulfilmentHandoff[];
  stockReservationExecutions: RetailOrderStockReservationExecution[];
  pickTaskExecutions: RetailOrderPickTaskExecution[];
  shipmentPackageExecutions: RetailOrderShipmentPackageExecution[];
  dispatchReadinessExecutions: RetailOrderDispatchReadinessExecution[];
  carrierDispatchExecutions: RetailOrderCarrierDispatchExecution[];
  deliveryExecutions: RetailOrderDeliveryExecution[];
  rtoReconciliationExecutions: RetailOrderRtoReconciliationExecution[];
  returnReconciliationExecutions: RetailOrderReturnReconciliationExecution[];
  cancellationReconciliationExecutions: RetailOrderCancellationReconciliationExecution[];
  /** Optional for legacy snapshots upgraded before provider callback evidence was introduced. */
  carrierCallbackEvidence?: RetailOrderCarrierCallbackEvidence[];
}

export type RetailOrderHubHandoffStatus = 'prepared' | 'acknowledged' | 'retryable' | 'rejected';

export interface RetailOrderHubHandoffAttemptEvidence {
  attempt: number;
  envelopeChecksum: string;
  status: RetailOrderHubHandoffStatus;
  preparedBy: string;
  preparedAt: string;
  version: number;
  responseReference?: string;
  responseChecksum?: string;
  responseAt?: string;
  detail?: string;
}

export interface RetailOrderHubHandoffEvidence {
  id: string;
  orderId: string;
  sourceDigest: string;
  envelopeChecksum: string;
  target: 'retail-hub';
  status: RetailOrderHubHandoffStatus;
  preparedBy: string;
  preparedAt: string;
  attempt: number;
  version: number;
  responseReference?: string;
  responseChecksum?: string;
  responseAt?: string;
  detail?: string;
  /** Append-only attempt evidence. Optional for legacy records upgraded before 0.1.58. */
  attempts?: RetailOrderHubHandoffAttemptEvidence[];
}

export interface PrepareRetailOrderHubHandoffInput {
  orderId: string;
  expectedSourceDigest: string;
}

export interface RecordRetailOrderHubHandoffResultInput {
  id: string;
  expectedVersion: number;
  outcome: Exclude<RetailOrderHubHandoffStatus, 'prepared'>;
  responseReference: string;
  responseChecksum: string;
  detail?: string;
}

export type RetailOrderFulfilmentHandoffStatus = 'prepared' | 'approved' | 'rejected';

export interface RetailOrderFulfilmentHandoff {
  id: string;
  orderId: string;
  sourceDigest: string;
  salesOrderId: string;
  status: RetailOrderFulfilmentHandoffStatus;
  preparedBy: string;
  preparedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  evidenceReference: string;
  decisionRemarks?: string;
  version: number;
}

export interface PrepareRetailOrderFulfilmentHandoffInput {
  orderId: string;
  expectedSourceDigest: string;
  salesOrderId: string;
  evidenceReference: string;
}

export interface DecideRetailOrderFulfilmentHandoffInput {
  id: string;
  expectedVersion: number;
  decision: Exclude<RetailOrderFulfilmentHandoffStatus, 'prepared'>;
  remarks: string;
}

export interface RetailOrderStockReservationExecution {
  id: string;
  orderId: string;
  sourceDigest: string;
  salesOrderId: string;
  locationId: string;
  reservationIds: string[];
  items: Array<{ reservationId: string; itemVariantId: string; quantity: number }>;
  status: 'completed';
  evidenceReference: string;
  reservedBy: string;
  reservedAt: string;
  version: number;
}

export interface ReserveRetailUnifiedOrderStockInput {
  orderId: string;
  expectedSourceDigest: string;
  locationId: string;
  evidenceReference: string;
}

export interface RetailOrderPickTaskExecution {
  id: string;
  orderId: string;
  sourceDigest: string;
  salesOrderId: string;
  reservationIds: string[];
  taskIds: string[];
  status: 'planned' | 'completed';
  evidenceReference: string;
  assignedTo: string;
  dueAt: string;
  priority: 'normal' | 'high' | 'urgent';
  createdAt: string;
  completedBy?: string;
  completedAt?: string;
  completionEvidenceReference?: string;
  version: number;
}

export interface CreateRetailUnifiedOrderPickTasksInput {
  orderId: string;
  expectedSourceDigest: string;
  evidenceReference: string;
  dueAt: string;
  priority: RetailOrderPickTaskExecution['priority'];
}

export interface CompleteRetailUnifiedOrderPickTasksInput {
  orderId: string;
  expectedSourceDigest: string;
  evidenceReference: string;
}

export interface RetailOrderShipmentPackageExecution {
  id: string;
  orderId: string;
  sourceDigest: string;
  salesOrderId: string;
  shipmentPackageId: string;
  status: 'created' | 'packed';
  evidenceReference: string;
  createdBy: string;
  createdAt: string;
  packedBy?: string;
  packedAt?: string;
  packingEvidenceReference?: string;
  version: number;
}

export interface CreateRetailUnifiedOrderShipmentPackageInput {
  orderId: string;
  expectedSourceDigest: string;
  fromLocationId: string;
  shipToAddressId?: string;
  deliveryPromiseId?: string;
  grossWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  ewayBillRequired: boolean;
  evidenceReference: string;
}

export interface CompleteRetailUnifiedOrderShipmentPackageInput {
  orderId: string;
  expectedSourceDigest: string;
  evidenceReference: string;
}

export interface RetailOrderDispatchReadinessExecution {
  id: string;
  orderId: string;
  sourceDigest: string;
  salesOrderId: string;
  shipmentPackageId: string;
  status: 'ready';
  carrierAdapterId?: string;
  trackingNumber?: string;
  vehicleNumber?: string;
  transportDocumentNumber?: string;
  evidenceReference: string;
  preparedBy: string;
  preparedAt: string;
  version: number;
}

export interface PrepareRetailUnifiedOrderDispatchInput {
  orderId: string;
  expectedSourceDigest: string;
  carrierAdapterId?: string;
  trackingNumber?: string;
  vehicleNumber?: string;
  transportDocumentNumber?: string;
  eventLocation: string;
  evidenceReference: string;
}

export interface RetailOrderCarrierDispatchExecution {
  id: string;
  orderId: string;
  sourceDigest: string;
  salesOrderId: string;
  shipmentPackageId: string;
  status: 'dispatched';
  carrierAdapterId?: string;
  trackingNumber?: string;
  vehicleNumber?: string;
  transportDocumentNumber?: string;
  handoverEvidenceReference: string;
  dispatchedBy: string;
  dispatchedAt: string;
  version: number;
}

export interface DispatchRetailUnifiedOrderInput {
  orderId: string;
  expectedSourceDigest: string;
  expectedDispatchReadinessVersion: number;
  eventLocation: string;
  handoverEvidenceReference: string;
}

export interface RetailOrderDeliveryExecution {
  id: string;
  orderId: string;
  sourceDigest: string;
  salesOrderId: string;
  shipmentPackageId: string;
  status: 'delivered';
  proofOfDeliveryReference: string;
  recipientName?: string;
  deliveryNotes: string;
  deliveredBy: string;
  deliveredAt: string;
  version: number;
}

export interface ConfirmRetailUnifiedOrderDeliveryInput {
  orderId: string;
  expectedSourceDigest: string;
  expectedCarrierDispatchVersion: number;
  eventLocation: string;
  proofOfDeliveryReference: string;
  recipientName?: string;
  deliveryNotes: string;
}

export interface RetailOrderRtoReconciliationExecution {
  id: string;
  orderId: string;
  sourceDigest: string;
  salesOrderId: string;
  status: 'reconciled';
  carrierRtoReference: string;
  inventoryEvidenceReference: string;
  paymentEvidenceReference: string;
  taxEvidenceReference: string;
  reconciledBy: string;
  reconciledAt: string;
  version: number;
}

export interface ReconcileRetailUnifiedOrderRtoInput {
  orderId: string;
  expectedSourceDigest: string;
  carrierRtoReference: string;
  inventoryEvidenceReference: string;
  paymentEvidenceReference: string;
  taxEvidenceReference: string;
}

export interface RetailOrderCancellationReconciliationExecution {
  id: string;
  orderId: string;
  sourceDigest: string;
  salesOrderId?: string;
  status: 'reconciled';
  stockEvidenceReference: string;
  paymentEvidenceReference: string;
  reconciledBy: string;
  reconciledAt: string;
  version: number;
}

export interface ReconcileRetailUnifiedOrderCancellationInput {
  orderId: string;
  expectedSourceDigest: string;
  stockEvidenceReference: string;
  paymentEvidenceReference: string;
}

export interface RetailOrderReturnReconciliationExecution {
  id: string;
  orderId: string;
  sourceDigest: string;
  sourceStatus: 'returned' | 'rto';
  retailReturnId: string;
  retailReturnNumber: string;
  settlementId: string;
  settlementNumber: string;
  creditNoteReconciliationId: string;
  creditNoteNumber: string;
  amount: number;
  settlementEvidenceReference: string;
  evidenceReference: string;
  status: 'reconciled';
  reconciledBy: string;
  reconciledAt: string;
  version: number;
}

export interface ReconcileRetailUnifiedOrderReturnInput {
  orderId: string;
  expectedSourceDigest: string;
  retailReturnId: string;
  settlementId: string;
  creditNoteReconciliationId: string;
  settlementEvidenceReference: string;
  evidenceReference: string;
}

export interface RetailOrderCarrierCallbackEvidence {
  id: string;
  orderId: string;
  sourceDigest: string;
  carrierDispatchExecutionId: string;
  providerEventId: string;
  providerStatus: RetailCarrierCallbackStatus;
  callbackReference: string;
  payloadChecksum: string;
  receivedAt: string;
  recordedBy: string;
  version: number;
}

export interface RecordRetailUnifiedOrderCarrierCallbackInput {
  orderId: string;
  expectedSourceDigest: string;
  providerEventId: string;
  providerStatus: RetailCarrierCallbackStatus;
  callbackReference: string;
  payloadChecksum: string;
}

export interface IngestRetailOrderSourceEventInput {
  event: RetailOrderSourceEvent;
  mode: RetailOrderIngestionMode;
  receivedAt?: string;
}

export interface PrepareRetailOrderGovernedHandoffInput {
  orderId: string;
  expectedSourceDigest: string;
  approvalEvidenceReference: string;
}

export interface RetailOrderIngestionResult {
  outcome: RetailOrderIngestionOutcome;
  state: RetailOrderIngestionState;
  orderId?: string;
  conflictId?: string;
}
