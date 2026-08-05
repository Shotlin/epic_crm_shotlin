import { createHash } from 'node:crypto';
import { createShipmentPackage, reserveStock, transitionShipment } from './fulfilment-control';
import { createPickTask } from './inventory-warehouse';
import { recordDeliveryEvidence } from './order-to-cash';
import type { FrozenDeliveryAddress, RevenueOpsState } from '../shared/revenue-ops-contracts';

const moneyValue = (value: number): number => Math.round(value * 100) / 100;

/**
 * A source-neutral, local-only boundary for orders arriving from POS, the
 * storefront, mobile app, WhatsApp, ONDC, and marketplaces.
 *
 * This module deliberately does not call a provider, write stock, collect
 * money, issue a credit note, or dispatch a delivery. It records a small,
 * auditable normalized envelope and emits intent/reconciliation records for
 * the governed services that will perform those actions later. That keeps
 * shadow imports safe while retaining the evidence needed for a controlled
 * channel-by-channel cutover.
 */

export type RetailOrderChannel = 'pos' | 'website' | 'app' | 'whatsapp' | 'ondc' | 'marketplace';
export type RetailExternalOrderStatus = 'received' | 'accepted' | 'picking' | 'packed' | 'fulfilled' | 'cancelled' | 'return-requested' | 'returned' | 'rto';
export type RetailOrderIngestionMode = 'shadow' | 'governed';
export type RetailOrderHandlingState = 'shadow-observed' | 'awaiting-local-handoff' | 'awaiting-stock-reservation' | 'awaiting-stock-mapping' | 'awaiting-pick-completion' | 'awaiting-pack' | 'awaiting-dispatch' | 'awaiting-carrier-dispatch' | 'awaiting-delivery' | 'delivered' | 'reconciliation-required' | 'rto-reconciled' | 'return-reconciled';
export type RetailOrderIngestionOutcome = 'recorded' | 'idempotent' | 'conflicted';
export type RetailOrderConflictKind = 'source-event-digest-mismatch' | 'invalid-status-transition' | 'unmapped-stock-line' | 'stale-governed-handoff';
export type RetailOrderReconciliationKind = 'cancellation' | 'return' | 'rto';
export type RetailCarrierCallbackStatus = 'in-transit' | 'out-for-delivery' | 'delivered' | 'returned' | 'rto' | 'cancelled' | 'exception' | 'unknown';
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

export interface RetailOrderSource {
  channel: RetailOrderChannel;
  /** A credential-free, stable identifier for the configured source connection. */
  connectionId: string;
}

export interface RetailOrderSourceLine {
  externalLineId: string;
  sku: string;
  /** Present only after the catalog mapping has been approved locally. */
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
  /** Actor who first observed this source evidence; retained for maker-checker. */
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
  /** This is intentionally a request boundary, not a stock movement. */
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
  /** An explicit reminder that this projection has not changed any ledger. */
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
  hubHandoffs: RetailOrderHubHandoffEvidence[];
  fulfilmentHandoffs: RetailOrderFulfilmentHandoff[];
  stockReservationExecutions: RetailOrderStockReservationExecution[];
  pickTaskExecutions: RetailOrderPickTaskExecution[];
  shipmentPackageExecutions: RetailOrderShipmentPackageExecution[];
  dispatchReadinessExecutions: RetailOrderDispatchReadinessExecution[];
  carrierDispatchExecutions: RetailOrderCarrierDispatchExecution[];
  deliveryExecutions: RetailOrderDeliveryExecution[];
  rtoReconciliationExecutions: RetailOrderRtoReconciliationExecution[];
  returnReconciliationExecutions: RetailOrderReturnReconciliationExecution[];
  /** Optional for legacy snapshots upgraded before provider callback evidence was introduced. */
  carrierCallbackEvidence?: RetailOrderCarrierCallbackEvidence[];
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

export interface IngestRetailOrderSourceEventOptions {
  mode: RetailOrderIngestionMode;
  receivedAt?: string;
  actorId?: string;
}

export interface RetailOrderIngestionResult {
  outcome: RetailOrderIngestionOutcome;
  state: RetailOrderIngestionState;
  orderId?: string;
  conflictId?: string;
}

export interface PrepareRetailOrderGovernedHandoffInput {
  orderId: string;
  expectedSourceDigest: string;
  approvedBy: string;
  approvalEvidenceReference: string;
}

const channels = new Set<RetailOrderChannel>(['pos', 'website', 'app', 'whatsapp', 'ondc', 'marketplace']);
const statuses = new Set<RetailExternalOrderStatus>(['received', 'accepted', 'picking', 'packed', 'fulfilled', 'cancelled', 'return-requested', 'returned', 'rto']);
const reservationStatuses = new Set<RetailExternalOrderStatus>(['accepted', 'picking', 'packed']);
const reconciliationByStatus: Partial<Record<RetailExternalOrderStatus, { kind: RetailOrderReconciliationKind; actions: string[] }>> = {
  cancelled: {
    kind: 'cancellation',
    actions: ['release-or-confirm-no-stock-reservation', 'reconcile-payment-or-wallet-reversal'],
  },
  returned: {
    kind: 'return',
    actions: ['inspect-and-receive-stock', 'reconcile-credit-note-or-refund'],
  },
  rto: {
    kind: 'rto',
    actions: ['confirm-returned-custody', 'reconcile-carrier-and-payment'],
  },
};
const validTransitions: Record<RetailExternalOrderStatus, RetailExternalOrderStatus[]> = {
  received: ['accepted', 'cancelled'],
  accepted: ['picking', 'packed', 'cancelled', 'return-requested'],
  picking: ['packed', 'cancelled', 'return-requested'],
  packed: ['fulfilled', 'cancelled', 'return-requested'],
  fulfilled: ['return-requested'],
  cancelled: [],
  'return-requested': ['returned', 'rto'],
  returned: [],
  rto: [],
};

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const compact = (value: string): string => value.trim().replace(/\s+/g, ' ');
const idFor = (prefix: string, value: unknown): string => `${prefix}-${digest(value).slice(0, 24)}`;

function requiredText(value: string, label: string, minimum = 1, maximum = 160): string {
  const normalized = compact(value);
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
}

function validIso(value: string, label: string): string {
  const normalized = requiredText(value, label, 20, 40);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${label} must be a valid ISO timestamp.`);
  return normalized;
}

function validAmount(value: number, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} must be a non-negative whole number of paise.`);
  return value;
}

function validQuantity(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) throw new Error('Order line quantity must be a positive finite number.');
  return value;
}

function normalizeEvent(input: RetailOrderSourceEvent): RetailOrderSourceEvent {
  if (!channels.has(input.source.channel)) throw new Error('Order source channel is unsupported.');
  if (!statuses.has(input.status)) throw new Error('Order status is unsupported.');
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 500) throw new Error('Order must contain 1-500 lines.');
  const seenLineIds = new Set<string>();
  const lines = input.lines.map((line) => {
    const externalLineId = requiredText(line.externalLineId, 'External order line ID', 1, 160);
    if (seenLineIds.has(externalLineId)) throw new Error('External order line IDs must be unique within an order.');
    seenLineIds.add(externalLineId);
    const itemVariantId = line.itemVariantId === undefined ? undefined : requiredText(line.itemVariantId, 'Mapped item variant ID', 1, 160);
    return {
      externalLineId,
      sku: requiredText(line.sku, 'Order line SKU', 1, 160),
      itemVariantId,
      quantity: validQuantity(line.quantity),
      unitAmountPaise: validAmount(line.unitAmountPaise, 'Order line unit amount'),
    };
  });
  const currency = requiredText(input.currency, 'Order currency', 3, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Order currency must be a three-letter ISO code.');
  return {
    source: {
      channel: input.source.channel,
      connectionId: requiredText(input.source.connectionId, 'Order source connection ID', 3, 160),
    },
    externalOrderId: requiredText(input.externalOrderId, 'External order ID', 1, 160),
    externalEventId: requiredText(input.externalEventId, 'External order event ID', 1, 160),
    occurredAt: validIso(input.occurredAt, 'Order event time'),
    status: input.status,
    currency,
    totalAmountPaise: validAmount(input.totalAmountPaise, 'Order total amount'),
    lines,
  };
}

function identityFor(source: RetailOrderSource, externalOrderId: string): string {
  return `${source.channel}:${source.connectionId}:${externalOrderId}`;
}

function canTransition(from: RetailExternalOrderStatus, to: RetailExternalOrderStatus): boolean {
  return from === to || validTransitions[from].includes(to);
}

function hasMappedLines(lines: RetailOrderSourceLine[]): lines is Array<RetailOrderSourceLine & { itemVariantId: string }> {
  return lines.every((line) => Boolean(line.itemVariantId));
}

function handlingStateFor(status: RetailExternalOrderStatus, mode: RetailOrderIngestionMode, lines: RetailOrderSourceLine[]): RetailOrderHandlingState {
  if (mode === 'shadow') return 'shadow-observed';
  if (reconciliationByStatus[status]) return 'reconciliation-required';
  if (reservationStatuses.has(status)) return hasMappedLines(lines) ? 'awaiting-stock-reservation' : 'awaiting-stock-mapping';
  return 'awaiting-local-handoff';
}

function reservationIntentFor(order: RetailUnifiedOrderRecord, requestedAt: string): RetailOrderReservationIntent | undefined {
  if (!reservationStatuses.has(order.observedStatus) || !hasMappedLines(order.lines)) return undefined;
  return {
    // A source-evidence version is part of the intent identity. If later
    // shadow evidence changes, the previous intent is superseded rather than
    // being silently reused for a different provider payload.
    id: idFor('retail-stock-intent', { orderId: order.id, sourceDigest: order.sourceDigest }),
    orderId: order.id,
    externalOrderId: order.externalOrderId,
    sourceDigest: order.sourceDigest,
    status: 'pending',
    lines: order.lines.map((line) => ({ itemVariantId: line.itemVariantId, quantity: line.quantity })),
    requestedAt,
    boundary: 'requires-governed-stock-service',
  };
}

function reconciliationFor(order: RetailUnifiedOrderRecord, requiredAt: string): RetailOrderReconciliationRequirement | undefined {
  const requirement = reconciliationByStatus[order.observedStatus];
  if (!requirement) return undefined;
  return {
    id: idFor('retail-order-reconciliation', { orderId: order.id, kind: requirement.kind, sourceDigest: order.sourceDigest }),
    orderId: order.id,
    externalOrderId: order.externalOrderId,
    kind: requirement.kind,
    sourceDigest: order.sourceDigest,
    status: 'required',
    actions: [...requirement.actions],
    requiredAt,
    boundary: 'requires-approved-stock-payment-and-tax-workflows',
  };
}

function conflictFor({
  kind,
  order,
  event,
  sourceDigest,
  detail,
  recordedAt,
}: {
  kind: RetailOrderConflictKind;
  order?: RetailUnifiedOrderRecord;
  event: RetailOrderSourceEvent;
  sourceDigest: string;
  detail: string;
  recordedAt: string;
}): RetailOrderIngestionConflict {
  return {
    id: idFor('retail-order-conflict', { kind, orderId: order?.id, event: event.externalEventId, sourceDigest }),
    kind,
    status: 'open',
    orderId: order?.id,
    externalOrderId: event.externalOrderId,
    externalEventId: event.externalEventId,
    source: structuredClone(event.source),
    sourceDigest,
    detail,
    recordedAt,
  };
}

function withConflict(state: RetailOrderIngestionState, conflict: RetailOrderIngestionConflict, orderId?: string): RetailOrderIngestionResult {
  const duplicate = state.conflicts.some((item) => item.id === conflict.id);
  return {
    outcome: 'conflicted',
    state: duplicate ? state : { ...state, conflicts: [conflict, ...state.conflicts] },
    orderId,
    conflictId: conflict.id,
  };
}

function withBoundaries(state: RetailOrderIngestionState, order: RetailUnifiedOrderRecord, mode: RetailOrderIngestionMode, at: string): RetailOrderIngestionResult {
  const reconciliation = reconciliationFor(order, at);
  const reservation = mode === 'governed' ? reservationIntentFor(order, at) : undefined;
  const reservationIntents = state.reservationIntents.map((item) => item.orderId === order.id && item.status === 'pending' && item.sourceDigest !== order.sourceDigest
    ? { ...item, status: 'superseded' as const, supersededAt: at }
    : item);
  const nextState: RetailOrderIngestionState = {
    ...state,
    reservationIntents: reservation && !reservationIntents.some((item) => item.id === reservation.id)
      ? [reservation, ...reservationIntents]
      : reservationIntents,
    reconciliationRequirements: reconciliation && !state.reconciliationRequirements.some((item) => item.id === reconciliation.id)
      ? [reconciliation, ...state.reconciliationRequirements]
      : state.reconciliationRequirements,
  };
  if (mode === 'governed' && reservationStatuses.has(order.observedStatus) && !hasMappedLines(order.lines)) {
    return withConflict(nextState, conflictFor({
      kind: 'unmapped-stock-line',
      order,
      event: {
        source: order.source,
        externalOrderId: order.externalOrderId,
        externalEventId: order.sourceEvents[order.sourceEvents.length - 1]?.externalEventId ?? 'unknown-event',
        occurredAt: order.sourceEvents[order.sourceEvents.length - 1]?.occurredAt ?? at,
        status: order.observedStatus,
        currency: order.currency,
        totalAmountPaise: order.totalAmountPaise,
        lines: order.lines,
      },
      sourceDigest: order.sourceDigest,
      detail: 'The accepted order cannot create a stock reservation intent until every source line has an approved local item-variant mapping.',
      recordedAt: at,
    }), order.id);
  }
  return { outcome: 'recorded', state: nextState, orderId: order.id };
}

/** Produces the canonical SHA-256 evidence digest retained by Epic BOS. */
export function digestRetailOrderSourceEvent(input: RetailOrderSourceEvent): string {
  const event = normalizeEvent(input);
  return digest({
    source: event.source,
    externalOrderId: event.externalOrderId,
    externalEventId: event.externalEventId,
    occurredAt: event.occurredAt,
    status: event.status,
    currency: event.currency,
    totalAmountPaise: event.totalAmountPaise,
    lines: [...event.lines].sort((left, right) => left.externalLineId.localeCompare(right.externalLineId)),
  });
}

export function createRetailOrderIngestionState(): RetailOrderIngestionState {
  return {
    orders: [],
    conflicts: [],
    reservationIntents: [],
    reconciliationRequirements: [],
    hubHandoffs: [],
    fulfilmentHandoffs: [],
    stockReservationExecutions: [],
    pickTaskExecutions: [],
    shipmentPackageExecutions: [],
    dispatchReadinessExecutions: [],
    carrierDispatchExecutions: [],
    deliveryExecutions: [],
    rtoReconciliationExecutions: [],
    returnReconciliationExecutions: [],
    carrierCallbackEvidence: [],
  };
}

/**
 * Stores one normalized source event. `shadow` mode only observes external
 * evidence; `governed` mode may create a *pending* reservation intent after
 * local catalog mapping. Neither mode changes stock or calls a live API.
 */
export function ingestRetailOrderSourceEvent(state: RetailOrderIngestionState, input: RetailOrderSourceEvent, options: IngestRetailOrderSourceEventOptions): RetailOrderIngestionResult {
  const event = normalizeEvent(input);
  const receivedAt = options.receivedAt === undefined ? new Date().toISOString() : validIso(options.receivedAt, 'Order received time');
  const sourceDigest = digestRetailOrderSourceEvent(event);
  const identityKey = identityFor(event.source, event.externalOrderId);
  const existing = state.orders.find((order) => order.identityKey === identityKey);

  if (existing) {
    const sameExternalEvent = existing.sourceEvents.find((item) => item.externalEventId === event.externalEventId);
    if (sameExternalEvent) {
      if (sameExternalEvent.sourceDigest === sourceDigest) return { outcome: 'idempotent', state, orderId: existing.id };
      return withConflict(state, conflictFor({
        kind: 'source-event-digest-mismatch',
        order: existing,
        event,
        sourceDigest,
        detail: 'The source reused an external event ID with a different normalized payload digest. The existing order evidence was preserved.',
        recordedAt: receivedAt,
      }), existing.id);
    }
    if (!canTransition(existing.observedStatus, event.status)) {
      return withConflict(state, conflictFor({
        kind: 'invalid-status-transition',
        order: existing,
        event,
        sourceDigest,
        detail: `The source attempted ${existing.observedStatus} -> ${event.status}, which is not an approved retail lifecycle transition.`,
        recordedAt: receivedAt,
      }), existing.id);
    }
    if (options.mode === 'governed' && existing.governedHandoff && existing.governedHandoff.approvedSourceDigest !== sourceDigest) {
      return withConflict(state, conflictFor({
        kind: 'stale-governed-handoff',
        order: existing,
        event,
        sourceDigest,
        detail: 'The order has governed-handoff evidence tied to older source evidence. Re-import and re-approve the current source digest before accepting this governed lifecycle update.',
        recordedAt: receivedAt,
      }), existing.id);
    }
    const updated: RetailUnifiedOrderRecord = {
      ...existing,
      observedStatus: event.status,
      handlingState: handlingStateFor(event.status, options.mode, event.lines),
      currency: event.currency,
      totalAmountPaise: event.totalAmountPaise,
      lines: structuredClone(event.lines),
      sourceDigest,
      sourceEvents: [...existing.sourceEvents, {
        externalEventId: event.externalEventId,
        sourceDigest,
        occurredAt: event.occurredAt,
        observedStatus: event.status,
        receivedAt,
      }],
      observedBy: existing.observedBy ?? options.actorId,
      observedAt: existing.observedAt ?? receivedAt,
    };
    const nextState: RetailOrderIngestionState = {
      ...state,
      orders: state.orders.map((order) => order.id === existing.id ? updated : order),
    };
    return withBoundaries(nextState, updated, options.mode, receivedAt);
  }

  const created: RetailUnifiedOrderRecord = {
    id: idFor('retail-unified-order', identityKey),
    identityKey,
    source: structuredClone(event.source),
    externalOrderId: event.externalOrderId,
    observedStatus: event.status,
    handlingState: handlingStateFor(event.status, options.mode, event.lines),
    currency: event.currency,
    totalAmountPaise: event.totalAmountPaise,
    lines: structuredClone(event.lines),
    sourceDigest,
    sourceEvents: [{
      externalEventId: event.externalEventId,
      sourceDigest,
      occurredAt: event.occurredAt,
      observedStatus: event.status,
      receivedAt,
    }],
    observedBy: options.actorId,
    observedAt: receivedAt,
  };
  return withBoundaries({ ...state, orders: [created, ...state.orders] }, created, options.mode, receivedAt);
}

/**
 * Explicitly promotes one already-shadowed record after an independent
 * approver has reviewed the latest provider evidence. It remains an intent
 * only; the governed stock service must accept the intent before stock moves.
 */
export function prepareRetailOrderForGovernedHandoff(state: RetailOrderIngestionState, input: PrepareRetailOrderGovernedHandoffInput, approvedAt = new Date().toISOString()): RetailOrderIngestionResult {
  const order = state.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for governed handoff.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64);
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest)) throw new Error('Expected source digest must be a SHA-256 hex digest.');
  if (order.sourceDigest !== expectedSourceDigest) {
    const event = order.sourceEvents[order.sourceEvents.length - 1];
    return withConflict(state, conflictFor({
      kind: 'stale-governed-handoff',
      order,
      event: {
        source: order.source,
        externalOrderId: order.externalOrderId,
        externalEventId: event?.externalEventId ?? 'unknown-event',
        occurredAt: event?.occurredAt ?? approvedAt,
        status: order.observedStatus,
        currency: order.currency,
        totalAmountPaise: order.totalAmountPaise,
        lines: order.lines,
      },
      sourceDigest: expectedSourceDigest,
      detail: 'The approver reviewed stale source evidence. Refresh the external record before a governed handoff.',
      recordedAt: approvedAt,
    }), order.id);
  }
  const evidence: RetailGovernedHandoffEvidence = {
    approvedBy: requiredText(input.approvedBy, 'Governed-handoff approver', 2, 160),
    approvedAt: validIso(approvedAt, 'Governed-handoff approval time'),
    approvalEvidenceReference: requiredText(input.approvalEvidenceReference, 'Governed-handoff approval evidence', 4, 500),
    approvedSourceDigest: order.sourceDigest,
  };
  if (order.observedBy && order.observedBy === evidence.approvedBy) {
    throw new Error('The source observer cannot approve its own governed handoff.');
  }
  const promoted: RetailUnifiedOrderRecord = {
    ...order,
    governedHandoff: evidence,
    handlingState: handlingStateFor(order.observedStatus, 'governed', order.lines),
  };
  const nextState: RetailOrderIngestionState = {
    ...state,
    orders: state.orders.map((item) => item.id === order.id ? promoted : item),
  };
  return withBoundaries(nextState, promoted, 'governed', evidence.approvedAt);
}

function hubEnvelopeChecksum(order: RetailUnifiedOrderRecord): string {
  return digest({
    target: 'retail-hub',
    orderId: order.id,
    identityKey: order.identityKey,
    source: order.source,
    externalOrderId: order.externalOrderId,
    observedStatus: order.observedStatus,
    currency: order.currency,
    totalAmountPaise: order.totalAmountPaise,
    lines: [...order.lines].sort((left, right) => left.externalLineId.localeCompare(right.externalLineId)),
    sourceDigest: order.sourceDigest,
    governedHandoff: order.governedHandoff,
  });
}

function hubAttemptHistory(handoff: RetailOrderHubHandoffEvidence): RetailOrderHubHandoffAttemptEvidence[] {
  if (handoff.attempts?.length) return handoff.attempts;
  // Records written before attempt history existed are still auditable: expose
  // their current evidence as the first known attempt without inventing a send.
  return [{
    attempt: handoff.attempt,
    envelopeChecksum: handoff.envelopeChecksum,
    status: handoff.status,
    preparedBy: handoff.preparedBy,
    preparedAt: handoff.preparedAt,
    version: handoff.version,
    responseReference: handoff.responseReference,
    responseChecksum: handoff.responseChecksum,
    responseAt: handoff.responseAt,
    detail: handoff.detail,
  }];
}

/**
 * Creates a durable local outbox record for a future Retail Hub transport.
 * This function never sends HTTP, moves stock, posts money, or mutates Bakaloo.
 * The order payload can be reconstructed from the order id and source digest;
 * the outbox retains only the checksum and transport evidence.
 */
export function prepareRetailOrderHubHandoff(
  state: RetailOrderIngestionState,
  input: PrepareRetailOrderHubHandoffInput,
  preparedBy: string,
  preparedAt = new Date().toISOString(),
): RetailOrderIngestionResult {
  const order = state.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for Retail Hub handoff.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest)) throw new Error('Expected source digest must be a SHA-256 hex digest.');
  const actor = requiredText(preparedBy, 'Retail Hub handoff maker', 2, 160);
  const at = validIso(preparedAt, 'Retail Hub handoff preparation time');
  if (order.sourceDigest !== expectedSourceDigest) throw new Error('Retail Hub handoff source evidence is stale; refresh and approve the current order digest first.');
  if (!order.governedHandoff) throw new Error('Retail Hub handoff requires an independently approved governed order handoff first.');
  if (order.governedHandoff.approvedBy === actor) throw new Error('The governed-handoff approver cannot prepare the same Retail Hub handoff.');

  const existing = state.hubHandoffs.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest);
  if (existing?.status === 'acknowledged') return { outcome: 'idempotent', state, orderId: order.id };
  const attempt = (existing?.attempt ?? 0) + 1;
  const version = (existing?.version ?? 0) + 1;
  const envelopeChecksum = hubEnvelopeChecksum(order);
  const preparedAttempt: RetailOrderHubHandoffAttemptEvidence = {
    attempt,
    envelopeChecksum,
    status: 'prepared',
    preparedBy: actor,
    preparedAt: at,
    version,
  };
  const handoff: RetailOrderHubHandoffEvidence = {
    id: existing?.id ?? idFor('retail-hub-order-handoff', { orderId: order.id, sourceDigest: order.sourceDigest }),
    orderId: order.id,
    sourceDigest: order.sourceDigest,
    envelopeChecksum,
    target: 'retail-hub',
    status: 'prepared',
    preparedBy: actor,
    preparedAt: at,
    attempt,
    version,
    attempts: [...(existing ? hubAttemptHistory(existing) : []), preparedAttempt],
  };
  return {
    outcome: 'recorded',
    state: {
      ...state,
      hubHandoffs: [handoff, ...state.hubHandoffs.filter((item) => item.id !== handoff.id)],
    },
    orderId: order.id,
  };
}

/** Records a real or simulated transport response without claiming that it was sent by Epic BOS. */
export function recordRetailOrderHubHandoffResult(
  state: RetailOrderIngestionState,
  input: RecordRetailOrderHubHandoffResultInput,
  actorId: string,
  recordedAt = new Date().toISOString(),
): RetailOrderIngestionResult {
  const current = state.hubHandoffs.find((item) => item.id === input.id);
  if (!current) throw new Error('Retail Hub handoff evidence is unavailable.');
  if (current.version !== input.expectedVersion) throw new Error('Retail Hub handoff evidence is stale; refresh the outbox before recording a response.');
  const actor = requiredText(actorId, 'Retail Hub response reviewer', 2, 160);
  if (current.preparedBy === actor) throw new Error('The handoff maker cannot record its own Retail Hub response.');
  if (current.status === 'acknowledged' || current.status === 'rejected') throw new Error('This Retail Hub handoff is already terminal; prepare a fresh attempt after new source evidence.');
  if (!['acknowledged', 'retryable', 'rejected'].includes(input.outcome)) throw new Error('Retail Hub handoff response outcome is invalid.');
  const responseReference = requiredText(input.responseReference, 'Retail Hub response reference', 4, 240);
  const responseChecksum = requiredText(input.responseChecksum, 'Retail Hub response checksum', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(responseChecksum)) throw new Error('Retail Hub response checksum must be a SHA-256 hex digest.');
  const at = validIso(recordedAt, 'Retail Hub response time');
  const nextVersion = current.version + 1;
  const attemptHistory = hubAttemptHistory(current);
  const currentAttemptIndex = attemptHistory.findIndex((item) => item.attempt === current.attempt);
  const responseAttempt: RetailOrderHubHandoffAttemptEvidence = {
    attempt: current.attempt,
    envelopeChecksum: current.envelopeChecksum,
    status: input.outcome,
    preparedBy: current.preparedBy,
    preparedAt: current.preparedAt,
    version: nextVersion,
    responseReference,
    responseChecksum,
    responseAt: at,
    detail: input.detail === undefined ? undefined : requiredText(input.detail, 'Retail Hub response detail', 1, 500),
  };
  const updated: RetailOrderHubHandoffEvidence = {
    ...current,
    status: input.outcome,
    responseReference,
    responseChecksum,
    responseAt: at,
    detail: responseAttempt.detail,
    version: nextVersion,
    attempts: currentAttemptIndex < 0
      ? [...attemptHistory, responseAttempt]
      : attemptHistory.map((item, index) => index === currentAttemptIndex ? responseAttempt : item),
  };
  return {
    outcome: 'recorded',
    state: { ...state, hubHandoffs: state.hubHandoffs.map((item) => item.id === updated.id ? updated : item) },
    orderId: current.orderId,
  };
}

/**
 * Prepares an explicit mapping from a governed external order to an existing
 * Epic BOS sales order. This is evidence only: it never changes the sales
 * order, stock reservations, payments, delivery, or provider state.
 */
export function prepareRetailOrderFulfilmentHandoff(
  state: RetailOrderIngestionState,
  input: PrepareRetailOrderFulfilmentHandoffInput,
  salesOrder: { id: string; status: string },
  preparedBy: string,
  preparedAt = new Date().toISOString(),
): RetailOrderIngestionResult {
  const order = state.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for fulfilment mapping.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest) || order.sourceDigest !== expectedSourceDigest) throw new Error('Fulfilment mapping source evidence is stale; refresh the governed order first.');
  if (!order.governedHandoff) throw new Error('Fulfilment mapping requires an independently approved governed order handoff first.');
  if (state.conflicts.some((item) => item.orderId === order.id && item.status === 'open')) throw new Error('Resolve the open order conflict before preparing fulfilment mapping.');
  const actor = requiredText(preparedBy, 'Fulfilment mapping maker', 2, 160);
  const at = validIso(preparedAt, 'Fulfilment mapping preparation time');
  const evidenceReference = requiredText(input.evidenceReference, 'Fulfilment mapping evidence reference', 4, 240);
  if (salesOrder.id !== input.salesOrderId) throw new Error('Selected sales order does not match the mapping request.');
  if (['cancelled', 'completed'].includes(salesOrder.status)) throw new Error('Only an active sales order can receive external fulfilment mapping.');
  const existing = state.fulfilmentHandoffs.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest);
  if (existing?.salesOrderId !== undefined && existing.salesOrderId !== input.salesOrderId && existing.status !== 'rejected') throw new Error('This external order is already mapped to a different sales order.');
  if (existing?.status === 'prepared' || existing?.status === 'approved') return { outcome: 'idempotent', state, orderId: order.id };
  const handoff: RetailOrderFulfilmentHandoff = {
    id: existing?.id ?? idFor('retail-order-fulfilment-handoff', { orderId: order.id, sourceDigest: order.sourceDigest }),
    orderId: order.id,
    sourceDigest: order.sourceDigest,
    salesOrderId: input.salesOrderId,
    status: 'prepared',
    preparedBy: actor,
    preparedAt: at,
    evidenceReference,
    version: (existing?.version ?? 0) + 1,
  };
  return {
    outcome: 'recorded',
    state: { ...state, fulfilmentHandoffs: [handoff, ...state.fulfilmentHandoffs.filter((item) => item.id !== handoff.id)] },
    orderId: order.id,
  };
}

/** Records an independent decision on an evidence-only fulfilment mapping. */
export function decideRetailOrderFulfilmentHandoff(
  state: RetailOrderIngestionState,
  input: DecideRetailOrderFulfilmentHandoffInput,
  actorId: string,
  decidedAt = new Date().toISOString(),
): RetailOrderIngestionResult {
  const current = state.fulfilmentHandoffs.find((item) => item.id === input.id);
  if (!current) throw new Error('Retail fulfilment mapping is unavailable.');
  if (current.version !== input.expectedVersion) throw new Error('Retail fulfilment mapping is stale; refresh before deciding.');
  const actor = requiredText(actorId, 'Fulfilment mapping reviewer', 2, 160);
  if (current.preparedBy === actor) throw new Error('The fulfilment mapping maker cannot decide the same mapping.');
  if (current.status !== 'prepared') throw new Error('Only a prepared fulfilment mapping can be decided.');
  if (input.decision !== 'approved' && input.decision !== 'rejected') throw new Error('Fulfilment mapping decision is invalid.');
  const at = validIso(decidedAt, 'Fulfilment mapping decision time');
  const remarks = requiredText(input.remarks, 'Fulfilment mapping decision remarks', 4, 500);
  const updated: RetailOrderFulfilmentHandoff = {
    ...current,
    status: input.decision,
    decidedBy: actor,
    decidedAt: at,
    decisionRemarks: remarks,
    version: current.version + 1,
  };
  return {
    outcome: 'recorded',
    state: { ...state, fulfilmentHandoffs: state.fulfilmentHandoffs.map((item) => item.id === updated.id ? updated : item) },
    orderId: current.orderId,
  };
}

/**
 * Converts one independently approved external-order mapping into real local
 * stock reservations. This is the first mutating step after evidence-only
 * ingestion and mapping: it never contacts a provider, but it does reserve
 * the exact in-scope inventory against the mapped Epic BOS sales order.
 */
export function reserveRetailUnifiedOrderStock(
  state: RevenueOpsState,
  input: ReserveRetailUnifiedOrderStockInput,
  actorId: string,
  reservedAt = new Date().toISOString(),
): RevenueOpsState {
  const ingestion = state.retailUnifiedOrderIngestion ?? createRetailOrderIngestionState();
  const order = ingestion.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for stock reservation.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest) || order.sourceDigest !== expectedSourceDigest) throw new Error('Stock reservation source evidence is stale; refresh the governed order first.');
  if (!order.governedHandoff) throw new Error('Stock reservation requires an approved governed order handoff first.');
  if (ingestion.conflicts.some((item) => item.orderId === order.id && item.status === 'open')) throw new Error('Resolve the open order conflict before reserving stock.');
  const fulfilment = ingestion.fulfilmentHandoffs.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest);
  if (!fulfilment || fulfilment.status !== 'approved') throw new Error('Stock reservation requires an independently approved fulfilment mapping.');
  const intent = ingestion.reservationIntents.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'pending');
  if (!intent) {
    const completed = ingestion.stockReservationExecutions.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'completed');
    if (completed) return state;
    throw new Error('A current pending stock-reservation intent is required before reserving stock.');
  }
  const actor = requiredText(actorId, 'Stock reservation actor', 2, 160);
  const at = validIso(reservedAt, 'Stock reservation time');
  const evidenceReference = requiredText(input.evidenceReference, 'Stock reservation evidence reference', 4, 240);
  const executionId = idFor('retail-order-stock-reservation', { orderId: order.id, sourceDigest: order.sourceDigest });
  const existing = ingestion.stockReservationExecutions.find((item) => item.id === executionId);
  if (existing?.status === 'completed') return state;
  const salesOrder = state.salesOrders.find((item) => item.id === fulfilment.salesOrderId && (item.scope ?? state.scope).companyId === state.scope.companyId && (item.scope ?? state.scope).branchId === state.scope.branchId);
  if (!salesOrder || ['cancelled', 'completed'].includes(salesOrder.status)) throw new Error('The mapped sales order is missing or no longer reservable.');
  const location = state.stockLocations.find((item) => item.id === input.locationId && item.active && (item.scope ?? state.scope).companyId === state.scope.companyId && (item.scope ?? state.scope).branchId === state.scope.branchId);
  if (!location) throw new Error('An active stock location is required in the current company and branch scope.');

  const allocations: Array<{ lineId: string; quantity: number; productId: string; itemVariantId: string }> = [];
  const assigned = new Map<string, number>();
  for (const requested of intent.lines) {
    const variant = state.itemVariants.find((item) => item.id === requested.itemVariantId && item.active && (item.scope ?? state.scope).companyId === state.scope.companyId && (item.scope ?? state.scope).branchId === state.scope.branchId);
    const inventoryItem = variant ? state.inventoryItems.find((item) => item.id === variant.itemId && item.active && (item.scope ?? state.scope).companyId === state.scope.companyId && (item.scope ?? state.scope).branchId === state.scope.branchId) : undefined;
    const product = inventoryItem ? state.products.find((item) => item.id === inventoryItem.productId && item.active && item.kind === 'goods' && (item.scope ?? state.scope).companyId === state.scope.companyId && (item.scope ?? state.scope).branchId === state.scope.branchId) : undefined;
    if (!variant || !product) throw new Error(`The external SKU ${requested.itemVariantId} is not an active in-scope goods variant.`);
    const line = salesOrder.lines.find((candidate) => candidate.catalogProductId === product.id && (assigned.get(candidate.id) ?? 0) + requested.quantity <= candidate.quantity);
    if (!line) throw new Error(`The mapped sales order has no remaining line quantity for SKU ${variant.sku}.`);
    const existingReservations = state.stockReservations.filter((reservation) => reservation.salesOrderId === salesOrder.id && reservation.lineId === line.id && reservation.status !== 'released' && (reservation.scope ?? state.scope).companyId === state.scope.companyId && (reservation.scope ?? state.scope).branchId === state.scope.branchId);
    if (existingReservations.length) throw new Error(`Sales-order line ${line.id} already has an active stock reservation; review it before retrying.`);
    assigned.set(line.id, (assigned.get(line.id) ?? 0) + requested.quantity);
    allocations.push({ lineId: line.id, quantity: requested.quantity, productId: product.id, itemVariantId: variant.id });
  }
  if (!allocations.length) throw new Error('The current external order contains no reservable lines.');
  const requiredByProduct = new Map<string, number>();
  for (const allocation of allocations) requiredByProduct.set(allocation.productId, (requiredByProduct.get(allocation.productId) ?? 0) + allocation.quantity);
  for (const [productId, required] of requiredByProduct) {
    const position = state.stockPositions.find((item) => item.locationId === location.id && item.productId === productId && (item.scope ?? state.scope).companyId === state.scope.companyId && (item.scope ?? state.scope).branchId === state.scope.branchId);
    if (!position || position.available < required) throw new Error(`Available stock is insufficient for product ${productId}.`);
  }

  let next = state;
  const reservationIds: string[] = [];
  for (const [index, allocation] of allocations.entries()) {
    const reservationId = idFor('retail-stock-reservation', { executionId, index, lineId: allocation.lineId, quantity: allocation.quantity });
    next = reserveStock(next, { salesOrderId: salesOrder.id, lineId: allocation.lineId, locationId: location.id, quantity: allocation.quantity }, actor, reservationId, at);
    reservationIds.push(reservationId);
  }
  const execution: RetailOrderStockReservationExecution = {
    id: executionId,
    orderId: order.id,
    sourceDigest: order.sourceDigest,
    salesOrderId: salesOrder.id,
    locationId: location.id,
    reservationIds,
    items: allocations.map((allocation, index) => ({ reservationId: reservationIds[index]!, itemVariantId: allocation.itemVariantId, quantity: allocation.quantity })),
    status: 'completed',
    evidenceReference,
    reservedBy: actor,
    reservedAt: at,
    version: 1,
  };
  const nextIngestion: RetailOrderIngestionState = {
    ...next.retailUnifiedOrderIngestion ?? createRetailOrderIngestionState(),
    reservationIntents: (next.retailUnifiedOrderIngestion ?? ingestion).reservationIntents.map((item) => item.id === intent.id ? { ...item, status: 'executed' as const, executedAt: at, executionId } : item),
    stockReservationExecutions: [execution, ...((next.retailUnifiedOrderIngestion ?? ingestion).stockReservationExecutions ?? [])],
    pickTaskExecutions: [...((next.retailUnifiedOrderIngestion ?? ingestion).pickTaskExecutions ?? [])],
    shipmentPackageExecutions: [...((next.retailUnifiedOrderIngestion ?? ingestion).shipmentPackageExecutions ?? [])],
    dispatchReadinessExecutions: [...((next.retailUnifiedOrderIngestion ?? ingestion).dispatchReadinessExecutions ?? [])],
    carrierDispatchExecutions: [...((next.retailUnifiedOrderIngestion ?? ingestion).carrierDispatchExecutions ?? [])],
    deliveryExecutions: [...((next.retailUnifiedOrderIngestion ?? ingestion).deliveryExecutions ?? [])],
    orders: (next.retailUnifiedOrderIngestion ?? ingestion).orders.map((item) => item.id === order.id ? { ...item, handlingState: 'awaiting-local-handoff' as const } : item),
  };
  return { ...next, revision: next.revision + 1, retailUnifiedOrderIngestion: nextIngestion };
}

/**
 * Turns completed local reservations into directed warehouse pick tasks. The
 * planner chooses available storage/picking bins by pick sequence, but never
 * marks a task picked: warehouse staff must still start and complete each task.
 */
export function createRetailUnifiedOrderPickTasks(
  state: RevenueOpsState,
  input: CreateRetailUnifiedOrderPickTasksInput,
  actorId: string,
): RevenueOpsState {
  const ingestion = state.retailUnifiedOrderIngestion ?? createRetailOrderIngestionState();
  const order = ingestion.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for warehouse picking.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest) || order.sourceDigest !== expectedSourceDigest) throw new Error('Pick-task source evidence is stale; refresh the order first.');
  if (ingestion.conflicts.some((item) => item.orderId === order.id && item.status === 'open')) throw new Error('Resolve the open order conflict before creating pick tasks.');
  const reservationExecution = ingestion.stockReservationExecutions.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'completed');
  if (!reservationExecution) throw new Error('Completed local stock reservation evidence is required before picking.');
  const pickExecutionId = idFor('retail-order-pick-tasks', { orderId: order.id, sourceDigest: order.sourceDigest });
  const existing = ingestion.pickTaskExecutions.find((item) => item.id === pickExecutionId);
  if (existing?.status === 'planned') return state;
  const actor = requiredText(actorId, 'Pick-task assignee', 2, 160);
  const evidenceReference = requiredText(input.evidenceReference, 'Pick-task evidence reference', 4, 240);
  const dueAt = validIso(input.dueAt, 'Pick-task due time');
  if (!['normal', 'high', 'urgent'].includes(input.priority)) throw new Error('Pick-task priority is invalid.');
  const warehouse = state.warehouses.find((item) => item.stockLocationId === reservationExecution.locationId && item.active && (item.scope ?? state.scope).companyId === state.scope.companyId && (item.scope ?? state.scope).branchId === state.scope.branchId);
  if (!warehouse) throw new Error('An active warehouse for the reserved stock location is required before picking.');
  const zones = state.warehouseZones.filter((zone) => zone.warehouseId === warehouse.id && zone.active && ['storage', 'picking'].includes(zone.purpose) && (zone.scope ?? state.scope).companyId === state.scope.companyId && (zone.scope ?? state.scope).branchId === state.scope.branchId);
  const bins = state.storageBins.filter((bin) => zones.some((zone) => zone.id === bin.zoneId) && bin.status === 'available' && (bin.scope ?? state.scope).companyId === state.scope.companyId && (bin.scope ?? state.scope).branchId === state.scope.branchId).sort((left, right) => left.pickSequence - right.pickSequence);
  if (!bins.length) throw new Error('No available storage or picking bins exist for the reserved warehouse.');
  const plan: Array<{ reservationId: string; itemVariantId: string; fromBinId: string; batchId?: string; quantity: number }> = [];
  for (const item of reservationExecution.items) {
    const reservation = state.stockReservations.find((candidate) => candidate.id === item.reservationId && candidate.status === 'reserved' && (candidate.scope ?? state.scope).companyId === state.scope.companyId && (candidate.scope ?? state.scope).branchId === state.scope.branchId);
    if (!reservation) throw new Error('A reserved stock allocation changed before pick planning. Refresh and retry.');
    const variant = state.itemVariants.find((candidate) => candidate.id === item.itemVariantId && candidate.active && (candidate.scope ?? state.scope).companyId === state.scope.companyId && (candidate.scope ?? state.scope).branchId === state.scope.branchId);
    const inventoryItem = variant ? state.inventoryItems.find((candidate) => candidate.id === variant.itemId && candidate.active && (candidate.scope ?? state.scope).companyId === state.scope.companyId && (candidate.scope ?? state.scope).branchId === state.scope.branchId) : undefined;
    if (!variant || !inventoryItem) throw new Error(`Pick planning cannot resolve the active variant ${item.itemVariantId}.`);
    if (inventoryItem.tracking === 'serial') throw new Error(`Serial-controlled SKU ${variant.sku} requires explicit serial selection before picking.`);
    let remaining = item.quantity;
    for (const bin of bins) {
      if (remaining <= 0) break;
      const balances = state.binBalances.filter((balance) => balance.binId === bin.id && balance.itemVariantId === variant.id && balance.available > 0 && (balance.scope ?? state.scope).companyId === state.scope.companyId && (balance.scope ?? state.scope).branchId === state.scope.branchId);
      for (const balance of balances) {
        if (remaining <= 0) break;
        const alreadyPlanned = plan.filter((candidate) => candidate.fromBinId === bin.id && candidate.itemVariantId === variant.id && candidate.batchId === balance.batchId).reduce((total, candidate) => total + candidate.quantity, 0);
        const available = Math.max(0, balance.available - alreadyPlanned);
        const quantity = Math.min(remaining, available);
        if (quantity > 0) {
          plan.push({ reservationId: reservation.id, itemVariantId: variant.id, fromBinId: bin.id, batchId: balance.batchId, quantity });
          remaining -= quantity;
        }
      }
    }
    if (remaining > 0) throw new Error(`Bin availability is insufficient to pick ${variant.sku}.`);
  }
  if (!plan.length) throw new Error('No warehouse pick lines could be planned.');
  let next = state;
  const taskIds: string[] = [];
  for (const [index, line] of plan.entries()) {
    const taskId = idFor('retail-pick-task', { pickExecutionId, index, reservationId: line.reservationId, fromBinId: line.fromBinId, batchId: line.batchId, quantity: line.quantity });
    next = createPickTask(next, { reservationId: line.reservationId, itemVariantId: line.itemVariantId, batchId: line.batchId, fromBinId: line.fromBinId, quantity: line.quantity, serialUnitIds: [], assignedTo: actor, dueAt, priority: input.priority }, actor, taskId, new Date().toISOString());
    taskIds.push(taskId);
  }
  const execution: RetailOrderPickTaskExecution = {
    id: pickExecutionId,
    orderId: order.id,
    sourceDigest: order.sourceDigest,
    salesOrderId: reservationExecution.salesOrderId,
    reservationIds: reservationExecution.reservationIds,
    taskIds,
    status: 'planned',
    evidenceReference,
    assignedTo: actor,
    dueAt,
    priority: input.priority,
    createdAt: new Date().toISOString(),
    version: 1,
  };
  const current = next.retailUnifiedOrderIngestion ?? ingestion;
  return { ...next, revision: next.revision + 1, retailUnifiedOrderIngestion: { ...current, pickTaskExecutions: [execution, ...(current.pickTaskExecutions ?? [])], orders: current.orders.map((item) => item.id === order.id ? { ...item, handlingState: 'awaiting-local-handoff' as const } : item) } };
}

/**
 * Closes the warehouse-pick boundary for a unified order.  This does not pack
 * or dispatch anything: it proves that every directed pick task reached the
 * completed state, with exact reservation quantities and operator evidence,
 * before the separate shipment-package workflow can begin.
 */
export function completeRetailUnifiedOrderPickTasks(
  state: RevenueOpsState,
  input: CompleteRetailUnifiedOrderPickTasksInput,
  actorId: string,
  completedAt = new Date().toISOString(),
): RevenueOpsState {
  const ingestion = state.retailUnifiedOrderIngestion ?? createRetailOrderIngestionState();
  const order = ingestion.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for pick completion.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest) || order.sourceDigest !== expectedSourceDigest) throw new Error('Pick-completion source evidence is stale; refresh the order first.');
  if (ingestion.conflicts.some((item) => item.orderId === order.id && item.status === 'open')) throw new Error('Resolve the open order conflict before completing picks.');
  const pickExecutionId = idFor('retail-order-pick-tasks', { orderId: order.id, sourceDigest: order.sourceDigest });
  const execution = ingestion.pickTaskExecutions.find((item) => item.id === pickExecutionId);
  if (!execution) throw new Error('A directed pick queue must be planned before it can be completed.');
  if (execution.status === 'completed') return state;
  const actor = requiredText(actorId, 'Pick-completion actor', 2, 160);
  const evidenceReference = requiredText(input.evidenceReference, 'Pick-completion evidence reference', 4, 240);
  const at = validIso(completedAt, 'Pick-completion time');
  const tasks = execution.taskIds.map((taskId) => state.warehouseTasks.find((candidate) => candidate.id === taskId));
  if (tasks.some((task) => !task || task.type !== 'pick' || (task.scope ?? state.scope).companyId !== state.scope.companyId || (task.scope ?? state.scope).branchId !== state.scope.branchId)) throw new Error('The directed pick queue contains a missing or out-of-scope task.');
  if (tasks.some((task) => task!.status !== 'completed')) throw new Error('Every directed pick task must be completed before packing can begin.');
  const reservationExecution = ingestion.stockReservationExecutions.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'completed');
  if (!reservationExecution) throw new Error('Completed stock-reservation evidence is missing for the pick queue.');
  const pickedByReservation = new Map<string, number>();
  for (const task of tasks) pickedByReservation.set(task!.sourceId, (pickedByReservation.get(task!.sourceId) ?? 0) + task!.quantity);
  for (const reservationLine of reservationExecution.items) {
    const picked = pickedByReservation.get(reservationLine.reservationId) ?? 0;
    if (Math.abs(picked - reservationLine.quantity) > 0.0001) throw new Error('Completed pick quantities do not exactly cover the reserved order lines.');
  }
  if ([...pickedByReservation.keys()].some((reservationId) => !reservationExecution.reservationIds.includes(reservationId))) throw new Error('The pick queue contains a reservation outside the approved stock execution.');
  const updated: RetailOrderPickTaskExecution = { ...execution, status: 'completed', completedBy: actor, completedAt: at, completionEvidenceReference: evidenceReference, version: execution.version + 1 };
  const nextIngestion: RetailOrderIngestionState = {
    ...ingestion,
    pickTaskExecutions: ingestion.pickTaskExecutions.map((item) => item.id === execution.id ? updated : item),
    orders: ingestion.orders.map((item) => item.id === order.id ? { ...item, handlingState: 'awaiting-pack' as const } : item),
  };
  return { ...state, revision: state.revision + 1, retailUnifiedOrderIngestion: nextIngestion };
}

/**
 * Creates the local shipment package for a unified order after the pick wave
 * has been closed.  The package is still planned custody evidence: invoicing,
 * statutory checks, carrier booking, and dispatch remain separate transitions.
 */
export function createRetailUnifiedOrderShipmentPackage(
  state: RevenueOpsState,
  input: CreateRetailUnifiedOrderShipmentPackageInput,
  actorId: string,
  createdAt = new Date().toISOString(),
  shipToAddressSnapshot?: FrozenDeliveryAddress,
): RevenueOpsState {
  const ingestion = state.retailUnifiedOrderIngestion ?? createRetailOrderIngestionState();
  const order = ingestion.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for package creation.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest) || order.sourceDigest !== expectedSourceDigest) throw new Error('Package source evidence is stale; refresh the order first.');
  if (ingestion.conflicts.some((item) => item.orderId === order.id && item.status === 'open')) throw new Error('Resolve the open order conflict before creating a package.');
  const fulfilment = ingestion.fulfilmentHandoffs.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'approved');
  if (!fulfilment) throw new Error('Package creation requires an independently approved fulfilment mapping.');
  const reservationExecution = ingestion.stockReservationExecutions.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'completed');
  if (!reservationExecution) throw new Error('Completed stock-reservation evidence is required before package creation.');
  const pickExecution = ingestion.pickTaskExecutions.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'completed');
  if (!pickExecution) throw new Error('The directed pick queue must be completed and evidenced before package creation.');
  if (pickExecution.taskIds.some((taskId) => state.warehouseTasks.find((task) => task.id === taskId)?.status !== 'completed')) throw new Error('Every directed warehouse task must remain completed before package creation.');
  const actor = requiredText(actorId, 'Package creator', 2, 160);
  const evidenceReference = requiredText(input.evidenceReference, 'Package evidence reference', 4, 240);
  const at = validIso(createdAt, 'Package creation time');
  const executionId = idFor('retail-order-shipment-package', { orderId: order.id, sourceDigest: order.sourceDigest });
  const existingExecution = ingestion.shipmentPackageExecutions.find((item) => item.id === executionId);
  if (existingExecution?.status === 'created') return state;
  const packageId = idFor('retail-order-shipment-package-record', { orderId: order.id, sourceDigest: order.sourceDigest });
  if (state.shipmentPackages.some((shipment) => shipment.id === packageId || (shipment.salesOrderId === fulfilment.salesOrderId && shipment.items.some((item) => reservationExecution.reservationIds.includes(item.reservationId))))) throw new Error('A shipment package already exists for this unified order reservation. Refresh the order before retrying.');
  if (input.fromLocationId !== reservationExecution.locationId) throw new Error('Package origin must match the approved stock-reservation location.');
  const next = createShipmentPackage(state, {
    salesOrderId: fulfilment.salesOrderId,
    fromLocationId: input.fromLocationId,
    shipToAddressId: input.shipToAddressId,
    deliveryPromiseId: input.deliveryPromiseId,
    reservationIds: reservationExecution.reservationIds,
    grossWeightKg: input.grossWeightKg,
    lengthCm: input.lengthCm,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
    ewayBillRequired: input.ewayBillRequired,
  }, actor, packageId, at, shipToAddressSnapshot);
  const execution: RetailOrderShipmentPackageExecution = {
    id: executionId,
    orderId: order.id,
    sourceDigest: order.sourceDigest,
    salesOrderId: fulfilment.salesOrderId,
    shipmentPackageId: packageId,
    status: 'created',
    evidenceReference,
    createdBy: actor,
    createdAt: at,
    version: 1,
  };
  const current = next.retailUnifiedOrderIngestion ?? ingestion;
  return { ...next, revision: next.revision + 1, retailUnifiedOrderIngestion: { ...current, shipmentPackageExecutions: [execution, ...(current.shipmentPackageExecutions ?? [])], orders: current.orders.map((item) => item.id === order.id ? { ...item, handlingState: 'awaiting-dispatch' as const } : item) } };
}

/**
 * Closes a planned unified-order package as physically packed.  This records
 * custody evidence only; the existing shipment transition still guards
 * invoice, place-of-supply, e-way, carrier, and dispatch readiness.
 */
export function completeRetailUnifiedOrderShipmentPackage(
  state: RevenueOpsState,
  input: CompleteRetailUnifiedOrderShipmentPackageInput,
  actorId: string,
  packedAt = new Date().toISOString(),
): RevenueOpsState {
  const ingestion = state.retailUnifiedOrderIngestion ?? createRetailOrderIngestionState();
  const order = ingestion.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for package completion.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest) || order.sourceDigest !== expectedSourceDigest) throw new Error('Package completion source evidence is stale; refresh the order first.');
  if (ingestion.conflicts.some((item) => item.orderId === order.id && item.status === 'open')) throw new Error('Resolve the open order conflict before completing the package.');
  const executionId = idFor('retail-order-shipment-package', { orderId: order.id, sourceDigest: order.sourceDigest });
  const execution = ingestion.shipmentPackageExecutions.find((item) => item.id === executionId);
  if (!execution) throw new Error('A shipment package must be created before it can be marked packed.');
  if (execution.status === 'packed') return state;
  const actor = requiredText(actorId, 'Package completion actor', 2, 160);
  const evidenceReference = requiredText(input.evidenceReference, 'Package completion evidence reference', 4, 240);
  const at = validIso(packedAt, 'Package completion time');
  const shipment = state.shipmentPackages.find((candidate) => candidate.id === execution.shipmentPackageId && (candidate.scope ?? state.scope).companyId === state.scope.companyId && (candidate.scope ?? state.scope).branchId === state.scope.branchId);
  if (!shipment) throw new Error('The linked shipment package is missing from the active scope.');
  if (shipment.status !== 'planned') throw new Error('Only a planned shipment package can be marked packed.');
  const next = transitionShipment(state, { id: shipment.id, toStatus: 'packed', location: shipment.fromLocationId, notes: evidenceReference, expectedVersion: shipment.version }, actor, at, idFor('retail-order-shipment-package-packed-event', { orderId: order.id, sourceDigest: order.sourceDigest }));
  const updated: RetailOrderShipmentPackageExecution = { ...execution, status: 'packed', packedBy: actor, packedAt: at, packingEvidenceReference: evidenceReference, version: execution.version + 1 };
  const current = next.retailUnifiedOrderIngestion ?? ingestion;
  return { ...next, revision: next.revision + 1, retailUnifiedOrderIngestion: { ...current, shipmentPackageExecutions: current.shipmentPackageExecutions.map((item) => item.id === execution.id ? updated : item) } };
}

/**
 * Moves a packed unified-order shipment into the existing dispatch-readiness
 * gate.  Invoice and place-of-supply evidence are enforced by the shipment
 * transition; no carrier API or physical dispatch is performed here.
 */
export function prepareRetailUnifiedOrderDispatch(
  state: RevenueOpsState,
  input: PrepareRetailUnifiedOrderDispatchInput,
  actorId: string,
  preparedAt = new Date().toISOString(),
): RevenueOpsState {
  const ingestion = state.retailUnifiedOrderIngestion ?? createRetailOrderIngestionState();
  const order = ingestion.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for dispatch readiness.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest) || order.sourceDigest !== expectedSourceDigest) throw new Error('Dispatch-readiness source evidence is stale; refresh the order first.');
  if (ingestion.conflicts.some((item) => item.orderId === order.id && item.status === 'open')) throw new Error('Resolve the open order conflict before preparing dispatch readiness.');
  const fulfilment = ingestion.fulfilmentHandoffs.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'approved');
  if (!fulfilment) throw new Error('Dispatch readiness requires an approved fulfilment mapping.');
  const packageExecution = ingestion.shipmentPackageExecutions.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'packed');
  if (!packageExecution) throw new Error('The unified shipment package must be packed before dispatch readiness.');
  const dispatchExecutionId = idFor('retail-order-dispatch-readiness', { orderId: order.id, sourceDigest: order.sourceDigest });
  const existing = ingestion.dispatchReadinessExecutions.find((item) => item.id === dispatchExecutionId);
  if (existing?.status === 'ready') return state;
  const actor = requiredText(actorId, 'Dispatch-readiness actor', 2, 160);
  const evidenceReference = requiredText(input.evidenceReference, 'Dispatch-readiness evidence reference', 4, 240);
  const eventLocation = requiredText(input.eventLocation, 'Dispatch-readiness event location', 2, 160);
  const at = validIso(preparedAt, 'Dispatch-readiness time');
  if (input.carrierAdapterId && !state.carrierAdapters.some((candidate) => candidate.id === input.carrierAdapterId && (candidate.scope ?? state.scope).companyId === state.scope.companyId && (candidate.scope ?? state.scope).branchId === state.scope.branchId && !['disabled', 'degraded'].includes(candidate.status))) throw new Error('Selected carrier adapter is unavailable or degraded in the active scope.');
  const shipment = state.shipmentPackages.find((candidate) => candidate.id === packageExecution.shipmentPackageId && (candidate.scope ?? state.scope).companyId === state.scope.companyId && (candidate.scope ?? state.scope).branchId === state.scope.branchId);
  if (!shipment) throw new Error('The linked shipment package is missing from the active scope.');
  if (shipment.status !== 'packed') throw new Error('Only a packed shipment can enter dispatch readiness.');
  const next = transitionShipment(state, { id: shipment.id, toStatus: 'ready-to-dispatch', carrierAdapterId: input.carrierAdapterId, trackingNumber: input.trackingNumber, vehicleNumber: input.vehicleNumber, transportDocumentNumber: input.transportDocumentNumber, location: eventLocation, notes: evidenceReference, expectedVersion: shipment.version }, actor, at, idFor('retail-order-dispatch-readiness-event', { orderId: order.id, sourceDigest: order.sourceDigest }));
  const execution: RetailOrderDispatchReadinessExecution = { id: dispatchExecutionId, orderId: order.id, sourceDigest: order.sourceDigest, salesOrderId: fulfilment.salesOrderId, shipmentPackageId: shipment.id, status: 'ready', carrierAdapterId: input.carrierAdapterId, trackingNumber: input.trackingNumber?.trim() || undefined, vehicleNumber: input.vehicleNumber?.trim().toUpperCase() || undefined, transportDocumentNumber: input.transportDocumentNumber?.trim() || undefined, evidenceReference, preparedBy: actor, preparedAt: at, version: 1 };
  const current = next.retailUnifiedOrderIngestion ?? ingestion;
  return { ...next, revision: next.revision + 1, retailUnifiedOrderIngestion: { ...current, dispatchReadinessExecutions: [execution, ...(current.dispatchReadinessExecutions ?? [])], orders: current.orders.map((item) => item.id === order.id ? { ...item, handlingState: 'awaiting-carrier-dispatch' as const } : item) } };
}

/**
 * Records the physical carrier handoff for a dispatch-ready unified order.
 * This is the final local stock/custody mutation before carrier tracking takes
 * over: the existing shipment transition enforces carrier, vehicle/transport,
 * e-way acknowledgement (when required), and packed-reservation gates. No
 * provider API or Bakaloo write is performed here.
 */
export function dispatchRetailUnifiedOrder(
  state: RevenueOpsState,
  input: DispatchRetailUnifiedOrderInput,
  actorId: string,
  dispatchedAt = new Date().toISOString(),
): RevenueOpsState {
  const ingestion = state.retailUnifiedOrderIngestion ?? createRetailOrderIngestionState();
  const order = ingestion.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for carrier dispatch.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest) || order.sourceDigest !== expectedSourceDigest) throw new Error('Carrier-dispatch source evidence is stale; refresh the order first.');
  if (ingestion.conflicts.some((item) => item.orderId === order.id && item.status === 'open')) throw new Error('Resolve the open order conflict before carrier dispatch.');
  const fulfilment = ingestion.fulfilmentHandoffs.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'approved');
  if (!fulfilment) throw new Error('Carrier dispatch requires an approved fulfilment mapping.');
  const readiness = ingestion.dispatchReadinessExecutions.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'ready');
  if (!readiness) throw new Error('Record dispatch readiness before carrier handoff.');
  const dispatchExecutionId = idFor('retail-order-carrier-dispatch', { orderId: order.id, sourceDigest: order.sourceDigest });
  const existing = ingestion.carrierDispatchExecutions.find((item) => item.id === dispatchExecutionId);
  if (existing?.status === 'dispatched') return state;
  if (readiness.version !== input.expectedDispatchReadinessVersion) throw new Error('Dispatch readiness changed. Refresh and retry the carrier handoff.');
  const actor = requiredText(actorId, 'Carrier-dispatch actor', 2, 160);
  if (readiness.preparedBy === actor) throw new Error('Dispatch readiness maker cannot record the physical carrier handoff.');
  const eventLocation = requiredText(input.eventLocation, 'Carrier handoff location', 2, 160);
  const handoverEvidenceReference = requiredText(input.handoverEvidenceReference, 'Carrier handover evidence reference', 4, 240);
  const at = validIso(dispatchedAt, 'Carrier-dispatch time');
  const shipment = state.shipmentPackages.find((candidate) => candidate.id === readiness.shipmentPackageId && (candidate.scope ?? state.scope).companyId === state.scope.companyId && (candidate.scope ?? state.scope).branchId === state.scope.branchId);
  if (!shipment) throw new Error('The dispatch shipment package is missing from the active scope.');
  if (shipment.status !== 'ready-to-dispatch') throw new Error('Only a dispatch-ready shipment can be handed to the carrier.');
  const next = transitionShipment(state, {
    id: shipment.id,
    toStatus: 'dispatched',
    carrierAdapterId: readiness.carrierAdapterId,
    trackingNumber: readiness.trackingNumber,
    vehicleNumber: readiness.vehicleNumber,
    transportDocumentNumber: readiness.transportDocumentNumber,
    location: eventLocation,
    notes: handoverEvidenceReference,
    expectedVersion: shipment.version,
  }, actor, at, idFor('retail-order-carrier-dispatch-event', { orderId: order.id, sourceDigest: order.sourceDigest }));
  const execution: RetailOrderCarrierDispatchExecution = {
    id: dispatchExecutionId,
    orderId: order.id,
    sourceDigest: order.sourceDigest,
    salesOrderId: fulfilment.salesOrderId,
    shipmentPackageId: shipment.id,
    status: 'dispatched',
    carrierAdapterId: readiness.carrierAdapterId,
    trackingNumber: readiness.trackingNumber,
    vehicleNumber: readiness.vehicleNumber,
    transportDocumentNumber: readiness.transportDocumentNumber,
    handoverEvidenceReference,
    dispatchedBy: actor,
    dispatchedAt: at,
    version: 1,
  };
  const current = next.retailUnifiedOrderIngestion ?? ingestion;
  return {
    ...next,
    revision: next.revision + 1,
    retailUnifiedOrderIngestion: {
      ...current,
      carrierDispatchExecutions: [execution, ...(current.carrierDispatchExecutions ?? [])],
      orders: current.orders.map((item) => item.id === order.id ? { ...item, handlingState: 'awaiting-delivery' as const } : item),
    },
  };
}

/**
 * Records an authoritative carrier/provider callback as append-only evidence.
 *
 * This is intentionally not a lifecycle transition: a callback can arrive
 * out of order, be retried, or describe a provider state that still needs a
 * locally approved delivery/RTO/return action. Operators therefore see the
 * callback and its payload checksum, while the governed custody workbench
 * remains the only place allowed to change shipment or order state.
 */
export function recordRetailUnifiedOrderCarrierCallback(
  state: RevenueOpsState,
  input: RecordRetailUnifiedOrderCarrierCallbackInput,
  actorId: string,
  receivedAt = new Date().toISOString(),
): RevenueOpsState {
  const ingestion = state.retailUnifiedOrderIngestion ?? createRetailOrderIngestionState();
  const order = ingestion.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for carrier callback evidence.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest) || order.sourceDigest !== expectedSourceDigest) throw new Error('Carrier callback source evidence is stale; refresh the order first.');
  if (ingestion.conflicts.some((item) => item.orderId === order.id && item.status === 'open')) throw new Error('Resolve the open order conflict before recording a carrier callback.');
  const dispatch = ingestion.carrierDispatchExecutions.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'dispatched');
  if (!dispatch) throw new Error('A completed carrier handoff is required before recording a provider callback.');
  const providerEventId = requiredText(input.providerEventId, 'Provider callback event ID', 1, 160);
  const callbackReference = requiredText(input.callbackReference, 'Provider callback reference', 4, 240);
  const payloadChecksum = requiredText(input.payloadChecksum, 'Provider callback payload checksum', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(payloadChecksum) || /^0+$/.test(payloadChecksum)) throw new Error('Provider callback payload checksum must be a non-placeholder SHA-256 digest.');
  const callbackId = idFor('retail-order-carrier-callback', { orderId: order.id, sourceDigest: order.sourceDigest, providerEventId });
  const existing = (ingestion.carrierCallbackEvidence ?? []).find((item) => item.id === callbackId);
  if (existing) {
    if (existing.payloadChecksum !== payloadChecksum || existing.providerStatus !== input.providerStatus || existing.callbackReference !== callbackReference) throw new Error('The provider event ID was already recorded with different callback evidence.');
    return state;
  }
  const actor = requiredText(actorId, 'Carrier callback recorder', 2, 160);
  if (dispatch.dispatchedBy === actor) throw new Error('Carrier handoff maker cannot attest the same provider callback.');
  const at = validIso(receivedAt, 'Carrier callback received time');
  const evidence: RetailOrderCarrierCallbackEvidence = {
    id: callbackId,
    orderId: order.id,
    sourceDigest: order.sourceDigest,
    carrierDispatchExecutionId: dispatch.id,
    providerEventId,
    providerStatus: input.providerStatus,
    callbackReference,
    payloadChecksum,
    receivedAt: at,
    recordedBy: actor,
    version: 1,
  };
  return {
    ...state,
    revision: state.revision + 1,
    retailUnifiedOrderIngestion: {
      ...ingestion,
      carrierCallbackEvidence: [evidence, ...(ingestion.carrierCallbackEvidence ?? [])],
    },
  };
}

/**
 * Confirms a delivered unified order with proof-of-delivery evidence. The
 * shipment transition and the canonical sales-order delivery evidence are
 * written together under one local, maker/checker boundary. No carrier
 * callback is fabricated and no customer/provider system is updated.
 */
export function confirmRetailUnifiedOrderDelivery(
  state: RevenueOpsState,
  input: ConfirmRetailUnifiedOrderDeliveryInput,
  actorId: string,
  deliveredAt = new Date().toISOString(),
): RevenueOpsState {
  const ingestion = state.retailUnifiedOrderIngestion ?? createRetailOrderIngestionState();
  const order = ingestion.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for delivery confirmation.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest) || order.sourceDigest !== expectedSourceDigest) throw new Error('Delivery source evidence is stale; refresh the order first.');
  if (ingestion.conflicts.some((item) => item.orderId === order.id && item.status === 'open')) throw new Error('Resolve the open order conflict before confirming delivery.');
  const fulfilment = ingestion.fulfilmentHandoffs.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'approved');
  if (!fulfilment) throw new Error('Delivery confirmation requires an approved fulfilment mapping.');
  const carrierDispatch = ingestion.carrierDispatchExecutions.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'dispatched');
  if (!carrierDispatch) throw new Error('Record the carrier handoff before confirming delivery.');
  const deliveryExecutionId = idFor('retail-order-delivery', { orderId: order.id, sourceDigest: order.sourceDigest });
  const existing = ingestion.deliveryExecutions.find((item) => item.id === deliveryExecutionId);
  if (existing?.status === 'delivered') return state;
  if (carrierDispatch.version !== input.expectedCarrierDispatchVersion) throw new Error('Carrier handoff changed. Refresh and retry delivery confirmation.');
  const actor = requiredText(actorId, 'Delivery-confirmation actor', 2, 160);
  if (carrierDispatch.dispatchedBy === actor) throw new Error('Carrier handoff maker cannot confirm the same delivery.');
  const eventLocation = requiredText(input.eventLocation, 'Delivery location', 2, 160);
  const proofOfDeliveryReference = requiredText(input.proofOfDeliveryReference, 'Proof-of-delivery reference', 4, 240);
  const deliveryNotes = requiredText(input.deliveryNotes, 'Delivery notes', 4, 500);
  const recipientName = input.recipientName?.trim() ? requiredText(input.recipientName, 'Recipient name', 2, 120) : undefined;
  const at = validIso(deliveredAt, 'Delivery-confirmation time');
  const shipment = state.shipmentPackages.find((candidate) => candidate.id === carrierDispatch.shipmentPackageId && (candidate.scope ?? state.scope).companyId === state.scope.companyId && (candidate.scope ?? state.scope).branchId === state.scope.branchId);
  if (!shipment) throw new Error('The delivered shipment package is missing from the active scope.');
  if (!['dispatched', 'in-transit'].includes(shipment.status)) throw new Error('Only a dispatched or in-transit shipment can be confirmed delivered.');
  const next = transitionShipment(state, { id: shipment.id, toStatus: 'delivered', location: eventLocation, notes: proofOfDeliveryReference, expectedVersion: shipment.version }, actor, at, idFor('retail-order-delivery-event', { orderId: order.id, sourceDigest: order.sourceDigest }));
  const withEvidence = recordDeliveryEvidence(next, { salesOrderId: fulfilment.salesOrderId, type: 'delivery', reference: proofOfDeliveryReference, occurredAt: at, notes: recipientName ? `${deliveryNotes} Recipient: ${recipientName}` : deliveryNotes }, actor, idFor('retail-order-delivery-proof', { orderId: order.id, sourceDigest: order.sourceDigest }), at);
  const execution: RetailOrderDeliveryExecution = { id: deliveryExecutionId, orderId: order.id, sourceDigest: order.sourceDigest, salesOrderId: fulfilment.salesOrderId, shipmentPackageId: shipment.id, status: 'delivered', proofOfDeliveryReference, recipientName, deliveryNotes, deliveredBy: actor, deliveredAt: at, version: 1 };
  const current = withEvidence.retailUnifiedOrderIngestion ?? ingestion;
  return { ...withEvidence, revision: withEvidence.revision + 1, retailUnifiedOrderIngestion: { ...current, deliveryExecutions: [execution, ...(current.deliveryExecutions ?? [])], orders: current.orders.map((item) => item.id === order.id ? { ...item, handlingState: 'delivered' as const } : item) } };
}

/**
 * Reconciles an externally observed return-to-origin (RTO) event using
 * evidence references only. This intentionally does not receive stock,
 * issue a refund, create a credit note, or call a carrier/provider. Those
 * mutations remain owned by their governed workbenches and must be linked
 * later with the four evidence references captured here.
 */
export function reconcileRetailUnifiedOrderRto(
  state: RevenueOpsState,
  input: ReconcileRetailUnifiedOrderRtoInput,
  actorId: string,
  reconciledAt = new Date().toISOString(),
): RevenueOpsState {
  const ingestion = state.retailUnifiedOrderIngestion ?? createRetailOrderIngestionState();
  const order = ingestion.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for RTO reconciliation.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest) || order.sourceDigest !== expectedSourceDigest) throw new Error('RTO source evidence is stale; refresh the order first.');
  if (order.observedStatus !== 'rto') throw new Error('The source must authoritatively report RTO before reconciliation.');
  if (ingestion.conflicts.some((item) => item.orderId === order.id && item.status === 'open')) throw new Error('Resolve the open order conflict before RTO reconciliation.');
  if (!ingestion.reconciliationRequirements.some((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.kind === 'rto')) throw new Error('An RTO reconciliation requirement is missing for this source digest.');
  const fulfilment = ingestion.fulfilmentHandoffs.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'approved');
  if (!fulfilment) throw new Error('RTO reconciliation requires an approved fulfilment mapping.');
  const carrierDispatch = ingestion.carrierDispatchExecutions.find((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'dispatched');
  if (!carrierDispatch) throw new Error('Record the carrier handoff before reconciling RTO.');
  const reconciliationId = idFor('retail-order-rto-reconciliation', { orderId: order.id, sourceDigest: order.sourceDigest });
  const existing = ingestion.rtoReconciliationExecutions.find((item) => item.id === reconciliationId);
  if (existing?.status === 'reconciled') return state;
  const actor = requiredText(actorId, 'RTO reconciliation actor', 2, 160);
  if (carrierDispatch.dispatchedBy === actor) throw new Error('Carrier handoff maker cannot reconcile the same RTO.');
  const carrierRtoReference = requiredText(input.carrierRtoReference, 'Carrier RTO reference', 4, 240);
  const inventoryEvidenceReference = requiredText(input.inventoryEvidenceReference, 'Inventory RTO evidence reference', 4, 240);
  const paymentEvidenceReference = requiredText(input.paymentEvidenceReference, 'Payment or refund evidence reference', 4, 240);
  const taxEvidenceReference = requiredText(input.taxEvidenceReference, 'GST or credit-note evidence reference', 4, 240);
  const at = validIso(reconciledAt, 'RTO reconciliation time');
  const execution: RetailOrderRtoReconciliationExecution = {
    id: reconciliationId,
    orderId: order.id,
    sourceDigest: order.sourceDigest,
    salesOrderId: fulfilment.salesOrderId,
    status: 'reconciled',
    carrierRtoReference,
    inventoryEvidenceReference,
    paymentEvidenceReference,
    taxEvidenceReference,
    reconciledBy: actor,
    reconciledAt: at,
    version: 1,
  };
  return {
    ...state,
    revision: state.revision + 1,
    retailUnifiedOrderIngestion: {
      ...ingestion,
      rtoReconciliationExecutions: [execution, ...(ingestion.rtoReconciliationExecutions ?? [])],
      orders: ingestion.orders.map((item) => item.id === order.id ? { ...item, handlingState: 'rto-reconciled' as const } : item),
    },
  };
}

/**
 * Links an external returned/RTO order to the already-governed local return,
 * settled refund/store-credit, and matched GST credit-note workpaper. This is
 * a reconciliation projection only: each owning workflow has already made
 * its own controlled mutation and this function does not repeat any of them.
 */
export function reconcileRetailUnifiedOrderReturn(
  state: RevenueOpsState,
  input: ReconcileRetailUnifiedOrderReturnInput,
  actorId: string,
  reconciledAt = new Date().toISOString(),
): RevenueOpsState {
  const ingestion = state.retailUnifiedOrderIngestion ?? createRetailOrderIngestionState();
  const order = ingestion.orders.find((item) => item.id === input.orderId);
  if (!order) throw new Error('Retail order is unavailable for return reconciliation.');
  const expectedSourceDigest = requiredText(input.expectedSourceDigest, 'Expected source digest', 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest) || order.sourceDigest !== expectedSourceDigest) throw new Error('Return reconciliation source evidence is stale; refresh the order first.');
  if (order.observedStatus !== 'returned' && order.observedStatus !== 'rto') throw new Error('The source must authoritatively report returned or RTO before return reconciliation.');
  if (ingestion.conflicts.some((item) => item.orderId === order.id && item.status === 'open')) throw new Error('Resolve the open order conflict before return reconciliation.');
  if (!ingestion.reconciliationRequirements.some((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && (item.kind === 'return' || item.kind === 'rto'))) throw new Error('A return reconciliation requirement is missing for this source digest.');
  if (order.observedStatus === 'rto' && !ingestion.rtoReconciliationExecutions.some((item) => item.orderId === order.id && item.sourceDigest === order.sourceDigest && item.status === 'reconciled')) throw new Error('RTO evidence must be reconciled before linking a local return settlement.');
  const reconciliationId = idFor('retail-order-return-reconciliation', { orderId: order.id, sourceDigest: order.sourceDigest, retailReturnId: input.retailReturnId, settlementId: input.settlementId, creditNoteReconciliationId: input.creditNoteReconciliationId });
  const existing = ingestion.returnReconciliationExecutions.find((item) => item.id === reconciliationId);
  if (existing?.status === 'reconciled') return state;
  const returnCase = state.retailReturns.find((item) => item.id === input.retailReturnId && (item.scope ?? state.scope).companyId === state.scope.companyId && (item.scope ?? state.scope).branchId === state.scope.branchId);
  if (!returnCase || returnCase.status !== 'approved' || !returnCase.financialCredit) throw new Error('An approved local retail return with frozen financial credit is required.');
  const settlement = returnCase.financialCredit.settlements.find((item) => item.id === input.settlementId && item.retailReturnId === returnCase.id && ['cash-refunded', 'provider-refunded', 'store-credit-issued'].includes(item.status));
  if (!settlement) throw new Error('A completed local cash, provider, or store-credit settlement is required.');
  const creditNote = state.retailCreditNoteReconciliations.find((item) => item.id === input.creditNoteReconciliationId && item.retailReturnId === returnCase.id && item.status === 'matched' && (item.scope ?? state.scope).companyId === state.scope.companyId && (item.scope ?? state.scope).branchId === state.scope.branchId);
  if (!creditNote) throw new Error('A matched GST credit-note reconciliation workpaper is required.');
  if (moneyValue(settlement.amount) !== moneyValue(creditNote.totalCredit) || moneyValue(settlement.amount) !== moneyValue(returnCase.financialCredit.issuedAmount)) throw new Error('Return settlement, credit-note, and approved return values do not reconcile exactly.');
  const actor = requiredText(actorId, 'Return reconciliation actor', 2, 160);
  const makers = new Set([returnCase.requestedBy, returnCase.inspectedBy, returnCase.approvedBy, settlement.requestedBy, settlement.decidedBy, settlement.confirmedBy, creditNote.requestedBy, creditNote.reconciledBy].filter((value): value is string => Boolean(value)));
  if (makers.has(actor)) throw new Error('Return reconciliation requires an independent reviewer from every owning workflow.');
  const settlementEvidenceReference = requiredText(input.settlementEvidenceReference, 'Settlement evidence reference', 4, 240);
  const evidenceReference = requiredText(input.evidenceReference, 'Return reconciliation evidence reference', 4, 240);
  const at = validIso(reconciledAt, 'Return reconciliation time');
  const execution: RetailOrderReturnReconciliationExecution = {
    id: reconciliationId,
    orderId: order.id,
    sourceDigest: order.sourceDigest,
    sourceStatus: order.observedStatus,
    retailReturnId: returnCase.id,
    retailReturnNumber: returnCase.number,
    settlementId: settlement.id,
    settlementNumber: settlement.number,
    creditNoteReconciliationId: creditNote.id,
    creditNoteNumber: creditNote.number,
    amount: moneyValue(settlement.amount),
    settlementEvidenceReference,
    evidenceReference,
    status: 'reconciled',
    reconciledBy: actor,
    reconciledAt: at,
    version: 1,
  };
  return {
    ...state,
    revision: state.revision + 1,
    retailUnifiedOrderIngestion: {
      ...ingestion,
      returnReconciliationExecutions: [execution, ...(ingestion.returnReconciliationExecutions ?? [])],
      orders: ingestion.orders.map((item) => item.id === order.id ? { ...item, handlingState: 'return-reconciled' as const } : item),
    },
  };
}
