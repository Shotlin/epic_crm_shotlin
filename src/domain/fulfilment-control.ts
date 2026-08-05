import { createHash, randomUUID } from 'node:crypto';
import { isIndiaStateCode, validateGstin } from './revenue-ops';
import type {
  CarrierAdapter,
  ConfigureCarrierAdapterInput,
  FrozenDeliveryAddress,
  CreateGstRegistrationInput,
  CreatePlaceOfSupplyReviewInput,
  CreateReturnAuthorizationInput,
  CreateShipmentPackageInput,
  CreateStockLocationInput,
  DecidePlaceOfSupplyReviewInput,
  DecideReturnAuthorizationInput,
  GstRegistration,
  InspectReturnInput,
  PlaceOfSupplyReview,
  PrepareStatutoryExchangeInput,
  ReceiveReturnInput,
  RecordStatutoryResponseInput,
  RecordStockMovementInput,
  ReleaseStockReservationInput,
  ReserveStockInput,
  ReturnAuthorization,
  RevenueOpsState,
  ShipmentEvent,
  ShipmentPackage,
  ShipmentStatus,
  StatutoryExchange,
  StockLocation,
  StockMovement,
  StockPosition,
  StockReservation,
  SubmitStatutoryExchangeInput,
  TransitionShipmentInput,
} from '../shared/revenue-ops-contracts';

function clean(value: string, label: string, minimum = 2, maximum = 300): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain between ${minimum} and ${maximum} characters.`);
  return normalized;
}

function quantity(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function fiscalNumber(prefix: string, index: number, dateValue: string): string {
  const date = new Date(`${dateValue.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) throw new Error('Document date is invalid.');
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() + 1 >= 4 ? year : year - 1;
  return `${prefix}-${String(start).slice(-2)}-${String(start + 1).slice(-2)}-${String(index).padStart(5, '0')}`;
}

type ScopedPhysicalRecord = { scope?: RevenueOpsState['scope'] };

/**
 * Legacy physical rows without a scope are interpreted only while they are
 * being backfilled into the active state scope. A present, different scope is
 * never inherited or merged into an active fulfilment action.
 */
function isInActiveScope(state: RevenueOpsState, record: ScopedPhysicalRecord): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

function requireInActiveScope<T extends ScopedPhysicalRecord>(
  state: RevenueOpsState,
  record: T | undefined,
  label: string,
): T {
  if (!record || !isInActiveScope(state, record)) {
    throw new Error(`${label} is unavailable outside the active company and branch scope.`);
  }
  return record;
}

function updatedPosition(state: RevenueOpsState, position: StockPosition | undefined, locationId: string, productId: string, onHandDelta: number, reservedDelta: number, id: string = randomUUID()): StockPosition {
  if (position) requireInActiveScope(state, position, 'Stock position');
  const onHand = quantity((position?.onHand ?? 0) + onHandDelta);
  const reserved = quantity((position?.reserved ?? 0) + reservedDelta);
  if (onHand < 0) throw new Error('Stock movement would make on-hand inventory negative.');
  if (reserved < 0 || reserved > onHand) throw new Error('Stock movement would make reserved inventory invalid.');
  return { id: position?.id ?? id, locationId, productId, onHand, reserved, available: quantity(onHand - reserved), scope: structuredClone(position?.scope ?? state.scope), version: (position?.version ?? 0) + 1 };
}

function replacePosition(state: RevenueOpsState, position: StockPosition): StockPosition[] {
  return state.stockPositions.some(({ id }) => id === position.id)
    ? state.stockPositions.map((candidate) => candidate.id === position.id ? position : candidate)
    : [...state.stockPositions, position];
}

function movement(state: RevenueOpsState, locationId: string, productId: string, type: StockMovement['type'], amount: number, reference: string, occurredAt: string, actorId: string, position: StockPosition, id: string = randomUUID()): StockMovement {
  return { id, locationId, productId, type, quantity: quantity(amount), reference, occurredAt, recordedBy: actorId, resultingOnHand: position.onHand, resultingReserved: position.reserved, scope: structuredClone(position.scope ?? state.scope) };
}

export function createGstRegistration(state: RevenueOpsState, input: CreateGstRegistrationInput, id: string = randomUUID()): RevenueOpsState {
  if (!isIndiaStateCode(input.stateCode)) throw new Error('GST registration requires a supported India state code.');
  const gstin = validateGstin(input.gstin, input.stateCode);
  if (state.gstRegistrations.some((candidate) => candidate.gstin === gstin)) throw new Error('GST registration already exists.');
  const branchCode = input.branchCode.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,15}$/.test(branchCode)) throw new Error('Branch code must use letters, numbers, and dashes.');
  if (state.gstRegistrations.some((candidate) => candidate.branchCode === branchCode)) throw new Error('GST branch code already exists.');
  const registration: GstRegistration = { id, label: clean(input.label, 'Registration label'), gstin, stateCode: input.stateCode, branchCode, address: clean(input.address, 'Registered address', 5, 500), primary: input.primary || state.gstRegistrations.length === 0, active: true, version: 1 };
  const gstRegistrations = input.primary ? state.gstRegistrations.map((candidate) => ({ ...candidate, primary: false, version: candidate.primary ? candidate.version + 1 : candidate.version })) : state.gstRegistrations;
  return { ...state, revision: state.revision + 1, gstRegistrations: [...gstRegistrations, registration] };
}

export function createPlaceOfSupplyReview(state: RevenueOpsState, input: CreatePlaceOfSupplyReviewInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const order = state.salesOrders.find(({ id: orderId }) => orderId === input.salesOrderId);
  if (!order) throw new Error('Sales order not found.');
  const registration = state.gstRegistrations.find(({ id: registrationId, active }) => registrationId === input.supplierRegistrationId && active);
  if (!registration) throw new Error('Active supplier GST registration not found.');
  for (const code of [input.shipFromStateCode, input.shipToStateCode, input.placeOfSupplyStateCode]) if (!isIndiaStateCode(code)) throw new Error('Place-of-supply review contains an unsupported state code.');
  if (registration.stateCode !== input.shipFromStateCode) throw new Error('Ship-from state must match the selected supplier GST registration.');
  const shipToGstin = input.shipToGstin?.trim() ? validateGstin(input.shipToGstin, input.shipToStateCode) : undefined;
  if (input.basis === 'bill-to-ship-to' && !shipToGstin) throw new Error('Bill-to/ship-to review requires the Ship-To GSTIN.');
  if (state.placeOfSupplyReviews.some(({ salesOrderId, status }) => salesOrderId === order.id && status === 'approved')) throw new Error('Sales order already has an approved place-of-supply review.');
  const treatment = registration.stateCode === input.placeOfSupplyStateCode ? 'intra-state' : 'inter-state';
  const review: PlaceOfSupplyReview = { id, salesOrderId: order.id, supplierRegistrationId: registration.id, shipFromStateCode: input.shipFromStateCode, shipToStateCode: input.shipToStateCode, shipToGstin, placeOfSupplyStateCode: input.placeOfSupplyStateCode, treatment, basis: input.basis, rationale: clean(input.rationale, 'Review rationale', 8, 500), status: 'pending', requestedBy: actorId, requestedAt: now, version: 1 };
  return { ...state, revision: state.revision + 1, placeOfSupplyReviews: [review, ...state.placeOfSupplyReviews] };
}

export function decidePlaceOfSupplyReview(state: RevenueOpsState, input: DecidePlaceOfSupplyReviewInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const review = state.placeOfSupplyReviews.find(({ id }) => id === input.id);
  if (!review || review.version !== input.expectedVersion || review.status !== 'pending') throw new Error('Place-of-supply review changed or is no longer pending.');
  if (review.requestedBy === actorId) throw new Error('Place-of-supply requester cannot approve or reject the same review.');
  if (input.decision === 'approved' && state.placeOfSupplyReviews.some(({ id, salesOrderId, status }) => id !== review.id && salesOrderId === review.salesOrderId && status === 'approved')) throw new Error('Sales order already has another approved place-of-supply review.');
  const updated: PlaceOfSupplyReview = { ...review, status: input.decision, reviewedBy: actorId, reviewedAt: now, reviewEvidence: clean(input.evidence, 'Review evidence', 4, 500), version: review.version + 1 };
  return { ...state, revision: state.revision + 1, placeOfSupplyReviews: state.placeOfSupplyReviews.map((candidate) => candidate.id === updated.id ? updated : candidate) };
}

export function createStockLocation(state: RevenueOpsState, input: CreateStockLocationInput, id: string = randomUUID()): RevenueOpsState {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,15}$/.test(code)) throw new Error('Stock location code must use letters, numbers, and dashes.');
  if (state.stockLocations.some((candidate) => isInActiveScope(state, candidate) && candidate.code === code)) throw new Error('Stock location code already exists.');
  if (!isIndiaStateCode(input.stateCode)) throw new Error('Stock location requires a supported India state code.');
  if (input.gstRegistrationId) {
    const registration = state.gstRegistrations.find(({ id: registrationId, active }) => registrationId === input.gstRegistrationId && active);
    if (!registration || registration.stateCode !== input.stateCode) throw new Error('Stock location registration must be active and belong to the same state.');
  }
  const location: StockLocation = { id, code, name: clean(input.name, 'Stock location name'), stateCode: input.stateCode, gstRegistrationId: input.gstRegistrationId, active: true, scope: structuredClone(state.scope), version: 1 };
  return { ...state, revision: state.revision + 1, stockLocations: [...state.stockLocations, location] };
}

export function recordStockMovement(state: RevenueOpsState, input: RecordStockMovementInput, actorId: string, id: string = randomUUID()): RevenueOpsState {
  const location = requireInActiveScope(state, state.stockLocations.find(({ id: locationId, active }) => locationId === input.locationId && active), 'Active stock location');
  const product = requireInActiveScope(state, state.products.find(({ id: productId, active, kind }) => productId === input.productId && active && kind === 'goods'), 'Active goods product');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('Stock movement quantity must be positive.');
  if (state.stockMovements.some((candidate) => isInActiveScope(state, candidate) && candidate.reference === input.reference.trim() && candidate.locationId === location.id && candidate.productId === product.id && candidate.type === input.type)) throw new Error('Stock movement reference already exists for this item and location.');
  const current = state.stockPositions.find((candidate) => isInActiveScope(state, candidate) && candidate.locationId === location.id && candidate.productId === product.id);
  const delta = input.type === 'adjustment-out' ? -input.quantity : input.quantity;
  if (delta < 0 && (current?.available ?? 0) < input.quantity) throw new Error('Adjustment exceeds available stock.');
  const position = updatedPosition(state, current, location.id, product.id, delta, 0);
  const entry = movement(state, location.id, product.id, input.type, input.quantity, clean(input.reference, 'Stock reference', 3, 120), input.occurredAt, actorId, position, id);
  return { ...state, revision: state.revision + 1, stockPositions: replacePosition(state, position), stockMovements: [entry, ...state.stockMovements] };
}

export function reserveStock(state: RevenueOpsState, input: ReserveStockInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const order = requireInActiveScope(state, state.salesOrders.find(({ id: orderId, status }) => orderId === input.salesOrderId && !['cancelled', 'completed'].includes(status)), 'Reservable sales order');
  const line = order?.lines.find(({ id: lineId }) => lineId === input.lineId);
  if (!line?.catalogProductId) throw new Error('Reservable sales-order line not found.');
  const product = requireInActiveScope(state, state.products.find(({ id: productId, kind, active }) => productId === line.catalogProductId && kind === 'goods' && active), 'Active goods product');
  const location = requireInActiveScope(state, state.stockLocations.find(({ id: locationId, active }) => locationId === input.locationId && active), 'Active stock location');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('Reservation quantity must be positive.');
  const alreadyReserved = state.stockReservations.filter((candidate) => isInActiveScope(state, candidate) && candidate.salesOrderId === order.id && candidate.lineId === line.id && candidate.status !== 'released').reduce((total, item) => total + item.quantity, 0);
  if (quantity(alreadyReserved + input.quantity) > line.quantity) throw new Error('Reservation exceeds the sales-order line quantity.');
  const current = state.stockPositions.find((candidate) => isInActiveScope(state, candidate) && candidate.locationId === location.id && candidate.productId === product.id);
  if (!current || current.available < input.quantity) throw new Error('Reservation exceeds available stock.');
  const position = updatedPosition(state, current, location.id, product.id, 0, input.quantity);
  const reservation: StockReservation = { id, salesOrderId: order.id, lineId: line.id, locationId: location.id, productId: product.id, quantity: quantity(input.quantity), status: 'reserved', reservedBy: actorId, reservedAt: now, scope: structuredClone(state.scope), version: 1 };
  const entry = movement(state, location.id, product.id, 'reservation', input.quantity, order.number, now, actorId, position);
  return { ...state, revision: state.revision + 1, stockPositions: replacePosition(state, position), stockReservations: [...state.stockReservations, reservation], stockMovements: [entry, ...state.stockMovements] };
}

export function releaseStockReservation(state: RevenueOpsState, input: ReleaseStockReservationInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const reservation = requireInActiveScope(state, state.stockReservations.find(({ id }) => id === input.id), 'Stock reservation');
  if (reservation.version !== input.expectedVersion || reservation.status !== 'reserved') throw new Error('Only a current reserved allocation can be released.');
  const current = state.stockPositions.find((candidate) => isInActiveScope(state, candidate) && candidate.locationId === reservation.locationId && candidate.productId === reservation.productId);
  if (!current) throw new Error('Stock position not found.');
  const position = updatedPosition(state, current, reservation.locationId, reservation.productId, 0, -reservation.quantity);
  const updated: StockReservation = { ...reservation, status: 'released', version: reservation.version + 1 };
  const entry = movement(state, reservation.locationId, reservation.productId, 'release', reservation.quantity, reservation.id, now, actorId, position);
  return { ...state, revision: state.revision + 1, stockPositions: replacePosition(state, position), stockReservations: state.stockReservations.map((candidate) => candidate.id === updated.id ? updated : candidate), stockMovements: [entry, ...state.stockMovements] };
}

export function createShipmentPackage(
  state: RevenueOpsState,
  input: CreateShipmentPackageInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
  shipToAddressSnapshot?: FrozenDeliveryAddress,
): RevenueOpsState {
  const order = requireInActiveScope(state, state.salesOrders.find(({ id: orderId, status }) => orderId === input.salesOrderId && !['cancelled', 'completed'].includes(status)), 'Active sales order');
  requireInActiveScope(state, state.stockLocations.find(({ id: locationId, active }) => locationId === input.fromLocationId && active), 'Active ship-from stock location');
  const unifiedIngestion = state.retailUnifiedOrderIngestion;
  const unifiedMapping = unifiedIngestion?.fulfilmentHandoffs.find((handoff) => handoff.salesOrderId === order.id && handoff.status === 'approved' && (unifiedIngestion.orders.find((candidate) => candidate.id === handoff.orderId)?.sourceDigest === handoff.sourceDigest));
  if (unifiedMapping) {
    const unifiedOrder = unifiedIngestion?.orders.find((candidate) => candidate.id === unifiedMapping.orderId && candidate.sourceDigest === unifiedMapping.sourceDigest);
    const pickExecution = unifiedIngestion?.pickTaskExecutions.find((candidate) => candidate.orderId === unifiedMapping.orderId && candidate.sourceDigest === unifiedMapping.sourceDigest);
    if (!unifiedOrder || !pickExecution || pickExecution.status !== 'completed') throw new Error('This unified order cannot be packaged until every directed pick task is completed and evidenced.');
    if (pickExecution.taskIds.some((taskId) => state.warehouseTasks.find((task) => task.id === taskId)?.status !== 'completed')) throw new Error('This unified order still has incomplete warehouse pick tasks.');
  }
  const uniqueIds = [...new Set(input.reservationIds)];
  if (!uniqueIds.length || uniqueIds.length !== input.reservationIds.length) throw new Error('Shipment package requires unique stock reservations.');
  const reservations = uniqueIds.map((reservationId) => state.stockReservations.find(({ id: candidateId }) => candidateId === reservationId));
  if (reservations.some((candidate) => !candidate || !isInActiveScope(state, candidate) || candidate.status !== 'reserved' || candidate.salesOrderId !== order.id || candidate.locationId !== input.fromLocationId)) throw new Error('Shipment reservations must be active, belong to the order, share the selected location, and remain in the active company and branch scope.');
  if (![input.grossWeightKg, input.lengthCm, input.widthCm, input.heightCm].every((value) => Number.isFinite(value) && value > 0)) throw new Error('Shipment weight and dimensions must be positive.');
  if (shipToAddressSnapshot && shipToAddressSnapshot.addressId !== input.shipToAddressId) {
    throw new Error('Frozen shipment address does not match the selected Party Master address.');
  }
  const activePromises = state.deliveryPromises.filter((promise) => isInActiveScope(state, promise) && promise.salesOrderId === order.id && promise.status === 'active');
  const promise = input.deliveryPromiseId
    ? state.deliveryPromises.find((candidate) => candidate.id === input.deliveryPromiseId && isInActiveScope(state, candidate))
    : undefined;
  if (activePromises.length && !input.deliveryPromiseId) {
    throw new Error('An active delivery promise must be selected before this order can be packaged.');
  }
  if (input.deliveryPromiseId) {
    if (!promise || promise.status !== 'active' || promise.salesOrderId !== order.id) {
      throw new Error('Selected delivery promise is no longer active for this sales order.');
    }
    if (promise.originLocationId !== input.fromLocationId || promise.shipToAddress.addressId !== input.shipToAddressId) {
      throw new Error('Package origin and ship-to address must match the selected delivery promise.');
    }
    if (!shipToAddressSnapshot) throw new Error('A delivery-promise package requires verified Party Master address evidence.');
  }
  const shipmentPackage: ShipmentPackage = {
    id,
    number: fiscalNumber('SHP', state.shipmentPackages.filter((candidate) => isInActiveScope(state, candidate)).length + 1, now),
    salesOrderId: order.id,
    fromLocationId: input.fromLocationId,
    shipToAddressId: input.shipToAddressId,
    shipToAddressSnapshot: shipToAddressSnapshot ? structuredClone(shipToAddressSnapshot) : undefined,
    deliveryPromiseId: promise?.id,
    items: reservations.map((candidate) => ({ reservationId: candidate!.id, lineId: candidate!.lineId, productId: candidate!.productId, quantity: candidate!.quantity })),
    grossWeightKg: quantity(input.grossWeightKg),
    lengthCm: quantity(input.lengthCm),
    widthCm: quantity(input.widthCm),
    heightCm: quantity(input.heightCm),
    status: 'planned',
    ewayBillRequired: input.ewayBillRequired,
    createdBy: actorId,
    createdAt: now,
    scope: structuredClone(state.scope),
    version: 1,
  };
  const stockReservations = state.stockReservations.map((candidate) => uniqueIds.includes(candidate.id) ? { ...candidate, status: 'packed' as const, version: candidate.version + 1 } : candidate);
  const event: ShipmentEvent = { id: randomUUID(), shipmentPackageId: id, status: 'planned', occurredAt: now, location: input.fromLocationId, notes: 'Package created from locked stock reservations.', source: 'operator', recordedBy: actorId, scope: structuredClone(state.scope) };
  return { ...state, revision: state.revision + 1, stockReservations, shipmentPackages: [...state.shipmentPackages, shipmentPackage], shipmentEvents: [event, ...state.shipmentEvents] };
}

const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  planned: ['packed', 'cancelled'], packed: ['ready-to-dispatch', 'cancelled'], 'ready-to-dispatch': ['dispatched', 'cancelled'], dispatched: ['in-transit', 'delivered'], 'in-transit': ['delivered'], delivered: ['return-in-progress'], 'return-in-progress': ['returned'], returned: [], cancelled: [],
};

export function transitionShipment(state: RevenueOpsState, input: TransitionShipmentInput, actorId: string, now = new Date().toISOString(), eventId: string = randomUUID()): RevenueOpsState {
  const shipment = requireInActiveScope(state, state.shipmentPackages.find(({ id }) => id === input.id), 'Shipment package');
  if (shipment.version !== input.expectedVersion) throw new Error('Shipment package changed. Refresh and retry.');
  if (!SHIPMENT_TRANSITIONS[shipment.status].includes(input.toStatus)) throw new Error(`Shipment cannot move from ${shipment.status} to ${input.toStatus}.`);
  if (input.toStatus === 'ready-to-dispatch') {
    if (!state.placeOfSupplyReviews.some(({ salesOrderId, status }) => salesOrderId === shipment.salesOrderId && status === 'approved')) throw new Error('Approved place-of-supply review is required before dispatch readiness.');
    if (!state.invoices.some(({ salesOrderId, status }) => salesOrderId === shipment.salesOrderId && !['draft', 'cancelled'].includes(status))) throw new Error('An issued invoice is required before dispatch readiness.');
  }
  if (input.toStatus === 'dispatched') {
    const carrierId = input.carrierAdapterId ?? shipment.carrierAdapterId;
    if (!carrierId || !state.carrierAdapters.some((candidate) => isInActiveScope(state, candidate) && candidate.id === carrierId && !['disabled', 'degraded'].includes(candidate.status))) throw new Error('A healthy or configured carrier adapter is required for dispatch.');
    clean(input.trackingNumber ?? shipment.trackingNumber ?? '', 'Tracking or consignment number', 3, 120);
    if (!(input.vehicleNumber || input.transportDocumentNumber || shipment.vehicleNumber || shipment.transportDocumentNumber)) throw new Error('Vehicle or transport-document number is required for dispatch.');
    if (shipment.ewayBillRequired && !state.statutoryExchanges.some((candidate) => isInActiveScope(state, candidate) && candidate.kind === 'e-way-bill' && candidate.sourceId === shipment.id && candidate.status === 'acknowledged')) throw new Error('Acknowledged e-way bill is required before dispatch.');
  }
  let stockPositions = state.stockPositions;
  let stockReservations = state.stockReservations;
  let stockMovements = state.stockMovements;
  if (input.toStatus === 'dispatched') {
    for (const item of shipment.items) {
      const reservation = stockReservations.find((candidate) => isInActiveScope(state, candidate) && candidate.id === item.reservationId);
      const current = stockPositions.find((candidate) => isInActiveScope(state, candidate) && candidate.locationId === shipment.fromLocationId && candidate.productId === item.productId);
      if (!reservation || reservation.status !== 'packed' || !current) throw new Error('Packed stock allocation changed before dispatch.');
      const position = updatedPosition(state, current, shipment.fromLocationId, item.productId, -item.quantity, -item.quantity);
      stockPositions = stockPositions.map((candidate) => candidate.id === position.id ? position : candidate);
      stockReservations = stockReservations.map((candidate) => candidate.id === reservation.id ? { ...candidate, status: 'consumed' as const, version: candidate.version + 1 } : candidate);
      stockMovements = [movement(state, shipment.fromLocationId, item.productId, 'issue', item.quantity, shipment.number, now, actorId, position), ...stockMovements];
    }
  }
  if (input.toStatus === 'cancelled') {
    for (const item of shipment.items) {
      const reservation = stockReservations.find((candidate) => isInActiveScope(state, candidate) && candidate.id === item.reservationId);
      const current = stockPositions.find((candidate) => isInActiveScope(state, candidate) && candidate.locationId === shipment.fromLocationId && candidate.productId === item.productId);
      if (!reservation || reservation.status !== 'packed' || !current) continue;
      const position = updatedPosition(state, current, shipment.fromLocationId, item.productId, 0, -item.quantity);
      stockPositions = stockPositions.map((candidate) => candidate.id === position.id ? position : candidate);
      stockReservations = stockReservations.map((candidate) => candidate.id === reservation.id ? { ...candidate, status: 'released' as const, version: candidate.version + 1 } : candidate);
      stockMovements = [movement(state, shipment.fromLocationId, item.productId, 'release', item.quantity, shipment.number, now, actorId, position), ...stockMovements];
    }
  }
  const updated: ShipmentPackage = { ...shipment, status: input.toStatus, carrierAdapterId: input.carrierAdapterId ?? shipment.carrierAdapterId, trackingNumber: input.trackingNumber?.trim() || shipment.trackingNumber, vehicleNumber: input.vehicleNumber?.trim().toUpperCase() || shipment.vehicleNumber, transportDocumentNumber: input.transportDocumentNumber?.trim() || shipment.transportDocumentNumber, dispatchedAt: input.toStatus === 'dispatched' ? now : shipment.dispatchedAt, deliveredAt: input.toStatus === 'delivered' ? now : shipment.deliveredAt, version: shipment.version + 1 };
  const event: ShipmentEvent = { id: eventId, shipmentPackageId: shipment.id, status: input.toStatus, occurredAt: now, location: clean(input.location, 'Shipment event location', 2, 160), notes: clean(input.notes, 'Shipment event notes', 3, 500), source: 'operator', recordedBy: actorId, scope: structuredClone(shipment.scope ?? state.scope) };
  const deliveryPromises = ['delivered', 'cancelled'].includes(input.toStatus) && shipment.deliveryPromiseId
    ? state.deliveryPromises.map((candidate) => isInActiveScope(state, candidate) && candidate.id === shipment.deliveryPromiseId && candidate.status === 'active'
      ? input.toStatus === 'delivered'
        ? { ...candidate, status: 'fulfilled' as const, fulfilledAt: now, version: candidate.version + 1 }
        : { ...candidate, status: 'cancelled' as const, cancelledAt: now, version: candidate.version + 1 }
      : candidate)
    : state.deliveryPromises;
  return { ...state, revision: state.revision + 1, stockPositions, stockReservations, stockMovements, shipmentPackages: state.shipmentPackages.map((candidate) => candidate.id === updated.id ? updated : candidate), shipmentEvents: [event, ...state.shipmentEvents], deliveryPromises };
}

export function configureCarrierAdapter(state: RevenueOpsState, input: ConfigureCarrierAdapterInput, id: string = randomUUID()): RevenueOpsState {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,20}$/.test(code)) throw new Error('Carrier code must use letters, numbers, and dashes.');
  if (state.carrierAdapters.some((candidate) => isInActiveScope(state, candidate) && candidate.code === code)) throw new Error('Carrier adapter code already exists.');
  const capability = [...new Set(input.capability)];
  if (!capability.length) throw new Error('Carrier adapter requires at least one capability.');
  const adapter: CarrierAdapter = { id, code, name: clean(input.name, 'Carrier adapter name'), mode: input.mode, status: input.status, capability, scope: structuredClone(state.scope), version: 1 };
  return { ...state, revision: state.revision + 1, carrierAdapters: [...state.carrierAdapters, adapter] };
}

export function createReturnAuthorization(state: RevenueOpsState, input: CreateReturnAuthorizationInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const shipment = requireInActiveScope(state, state.shipmentPackages.find(({ id: shipmentId, status }) => shipmentId === input.shipmentPackageId && status === 'delivered'), 'Delivered shipment');
  if (!input.items.length) throw new Error('Return authorization requires at least one item.');
  const itemKeys = input.items.map(({ lineId, productId }) => `${lineId}:${productId}`);
  if (new Set(itemKeys).size !== itemKeys.length) throw new Error('Return authorization cannot repeat the same delivered item.');
  for (const item of input.items) {
    const shipped = shipment.items.find(({ lineId, productId }) => lineId === item.lineId && productId === item.productId);
    const prior = state.returnAuthorizations.filter((candidate) => isInActiveScope(state, candidate) && candidate.shipmentPackageId === shipment.id && candidate.status !== 'rejected').flatMap(({ items }) => items).filter(({ lineId, productId }) => lineId === item.lineId && productId === item.productId).reduce((total, candidate) => total + candidate.quantity, 0);
    if (!shipped || item.quantity <= 0 || quantity(prior + item.quantity) > shipped.quantity) throw new Error('Return quantity exceeds the delivered package quantity.');
  }
  const authorization: ReturnAuthorization = { id, number: fiscalNumber('RMA', state.returnAuthorizations.filter((candidate) => isInActiveScope(state, candidate)).length + 1, now), shipmentPackageId: shipment.id, reason: clean(input.reason, 'Return reason', 4, 500), items: input.items.map((item) => ({ ...item, quantity: quantity(item.quantity) })), status: 'requested', requestedBy: actorId, requestedAt: now, scope: structuredClone(shipment.scope ?? state.scope), version: 1 };
  return { ...state, revision: state.revision + 1, returnAuthorizations: [authorization, ...state.returnAuthorizations] };
}

export function decideReturnAuthorization(state: RevenueOpsState, input: DecideReturnAuthorizationInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const authorization = requireInActiveScope(state, state.returnAuthorizations.find(({ id }) => id === input.id), 'Return authorization');
  if (authorization.version !== input.expectedVersion || authorization.status !== 'requested') throw new Error('Return authorization changed or is no longer pending.');
  if (authorization.requestedBy === actorId) throw new Error('Return requester cannot decide the same authorization.');
  const updated: ReturnAuthorization = { ...authorization, status: input.decision, decidedBy: actorId, decidedAt: now, version: authorization.version + 1 };
  const shipmentPackages = input.decision === 'approved' ? state.shipmentPackages.map((candidate) => candidate.id === authorization.shipmentPackageId && isInActiveScope(state, candidate) ? { ...candidate, status: 'return-in-progress' as const, version: candidate.version + 1 } : candidate) : state.shipmentPackages;
  return { ...state, revision: state.revision + 1, returnAuthorizations: state.returnAuthorizations.map((candidate) => candidate.id === updated.id ? updated : candidate), shipmentPackages };
}

export function receiveReturn(state: RevenueOpsState, input: ReceiveReturnInput, actorId: string): RevenueOpsState {
  const authorization = requireInActiveScope(state, state.returnAuthorizations.find(({ id }) => id === input.id), 'Return authorization');
  if (authorization.version !== input.expectedVersion || authorization.status !== 'approved') throw new Error('Only an approved current return can be received.');
  const shipment = requireInActiveScope(state, state.shipmentPackages.find(({ id }) => id === authorization.shipmentPackageId), 'Return shipment');
  let stockPositions = state.stockPositions;
  let stockMovements = state.stockMovements;
  for (const item of authorization.items) {
    const current = stockPositions.find((candidate) => isInActiveScope(state, candidate) && candidate.locationId === shipment.fromLocationId && candidate.productId === item.productId);
    const position = updatedPosition(state, current, shipment.fromLocationId, item.productId, item.quantity, 0);
    stockPositions = current ? stockPositions.map((candidate) => candidate.id === position.id ? position : candidate) : [...stockPositions, position];
    stockMovements = [movement(state, shipment.fromLocationId, item.productId, 'return', item.quantity, clean(input.reference, 'Return receipt reference', 3, 120), input.receivedAt, actorId, position), ...stockMovements];
  }
  const updated: ReturnAuthorization = { ...authorization, status: 'received', receivedBy: actorId, receivedAt: input.receivedAt, inspectionStatus: 'pending', version: authorization.version + 1 };
  const shipmentPackages = state.shipmentPackages.map((candidate) => candidate.id === shipment.id ? { ...candidate, status: 'returned' as const, version: candidate.version + 1 } : candidate);
  return { ...state, revision: state.revision + 1, stockPositions, stockMovements, returnAuthorizations: state.returnAuthorizations.map((candidate) => candidate.id === updated.id ? updated : candidate), shipmentPackages };
}

export function inspectReturn(state: RevenueOpsState, input: InspectReturnInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const authorization = requireInActiveScope(state, state.returnAuthorizations.find(({ id }) => id === input.id), 'Return authorization');
  if (authorization.version !== input.expectedVersion || authorization.status !== 'received' || authorization.inspectionStatus !== 'pending') throw new Error('Only a received return awaiting inspection can be dispositioned.');
  if (authorization.receivedBy === actorId) throw new Error('Return receiver cannot inspect the same return.');
  const shipment = requireInActiveScope(state, state.shipmentPackages.find(({ id }) => id === authorization.shipmentPackageId), 'Return shipment');
  const evidenceReference = clean(input.evidenceReference, 'Return inspection evidence', 3, 160);
  const notes = clean(input.notes, 'Return inspection notes', 4, 500);
  const failed = input.disposition !== 'restock';
  let stockPositions = state.stockPositions;
  let stockMovements = state.stockMovements;
  if (failed) {
    for (const item of authorization.items) {
      const current = stockPositions.find((candidate) => isInActiveScope(state, candidate) && candidate.locationId === shipment.fromLocationId && candidate.productId === item.productId);
      if (!current || current.onHand < item.quantity || current.available < item.quantity) throw new Error('Returned stock changed before the failed disposition could be posted.');
      const nextPosition = updatedPosition(state, current, current.locationId, current.productId, -item.quantity, 0);
      stockPositions = stockPositions.map((candidate) => candidate.id === current.id ? nextPosition : candidate);
      stockMovements = [movement(state, current.locationId, current.productId, 'adjustment-out', item.quantity, `RMA-${authorization.number} / ${input.disposition}`, now, actorId, nextPosition), ...stockMovements];
    }
  }
  const updated: ReturnAuthorization = { ...authorization, status: 'closed', inspectionStatus: failed ? 'failed' : 'passed', disposition: input.disposition, inspectionEvidenceReference: evidenceReference, inspectionNotes: notes, inspectedBy: actorId, inspectedAt: now, version: authorization.version + 1 };
  return { ...state, revision: state.revision + 1, stockPositions, stockMovements, returnAuthorizations: state.returnAuthorizations.map((candidate) => candidate.id === updated.id ? updated : candidate) };
}

export function prepareStatutoryExchange(state: RevenueOpsState, input: PrepareStatutoryExchangeInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const registration = state.gstRegistrations.find(({ id: registrationId, active }) => registrationId === input.gstRegistrationId && active);
  if (!registration) throw new Error('Active GST registration not found.');
  let sourceNumber: string;
  let payload: object;
  if (input.kind === 'e-invoice') {
    const invoice = state.invoices.find(({ id: invoiceId }) => invoiceId === input.sourceId);
    if (!invoice || !['issued', 'partially-paid', 'paid'].includes(invoice.status) || invoice.irpStatus === 'not-applicable') throw new Error('E-invoice exchange requires an issued IRP-applicable invoice.');
    const review = state.placeOfSupplyReviews.find(({ salesOrderId, supplierRegistrationId, status }) => salesOrderId === invoice.salesOrderId && supplierRegistrationId === registration.id && status === 'approved');
    if (!review || review.placeOfSupplyStateCode !== invoice.placeOfSupplyStateCode || review.treatment !== invoice.taxPreview.treatment) throw new Error('E-invoice exchange requires a matching approved place-of-supply review.');
    sourceNumber = invoice.number;
    payload = { kind: input.kind, sourceId: invoice.id, number: invoice.number, version: invoice.version, registration: registration.gstin, total: invoice.taxPreview.grandTotal };
  } else {
    const shipment = state.shipmentPackages.find(({ id: shipmentId }) => shipmentId === input.sourceId);
    if (!shipment || shipment.status !== 'ready-to-dispatch' || !shipment.ewayBillRequired) throw new Error('E-way-bill exchange requires a dispatch-ready shipment marked as required.');
    if (!(shipment.vehicleNumber || shipment.transportDocumentNumber)) throw new Error('E-way-bill payload requires frozen vehicle or transport-document details for Part B.');
    if (!state.invoices.some(({ salesOrderId, status }) => salesOrderId === shipment.salesOrderId && !['draft', 'cancelled'].includes(status))) throw new Error('E-way-bill exchange requires an issued source invoice.');
    if (!state.placeOfSupplyReviews.some(({ salesOrderId, supplierRegistrationId, status }) => salesOrderId === shipment.salesOrderId && supplierRegistrationId === registration.id && status === 'approved')) throw new Error('E-way-bill exchange requires an approved place-of-supply review for the registration.');
    sourceNumber = shipment.number;
    payload = { kind: input.kind, sourceId: shipment.id, number: shipment.number, version: shipment.version, registration: registration.gstin, weight: shipment.grossWeightKg, items: shipment.items, vehicleNumber: shipment.vehicleNumber, transportDocumentNumber: shipment.transportDocumentNumber };
  }
  if (state.statutoryExchanges.some(({ kind, sourceId, status }) => kind === input.kind && sourceId === input.sourceId && !['failed', 'cancelled'].includes(status))) throw new Error('An active statutory exchange already exists for this source.');
  const payloadChecksum = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const shipment = input.kind === 'e-way-bill' ? state.shipmentPackages.find(({ id: sourceId }) => sourceId === input.sourceId) : undefined;
  const exchange: StatutoryExchange = { id, kind: input.kind, sourceId: input.sourceId, sourceNumber, gstRegistrationId: registration.id, idempotencyKey: `${registration.gstin}:${input.kind}:${sourceNumber}`, payloadChecksum, status: 'prepared', portalStatus: 'unknown', reconciliationState: 'unverified', vehicleNumber: shipment?.vehicleNumber, transportDocumentNumber: shipment?.transportDocumentNumber, preparedBy: actorId, preparedAt: now, version: 1 };
  const invoices = input.kind === 'e-invoice' ? state.invoices.map((invoice) => invoice.id === input.sourceId ? { ...invoice, irpStatus: 'ready-to-report' as const, version: invoice.version + 1 } : invoice) : state.invoices;
  return { ...state, revision: state.revision + 1, invoices, statutoryExchanges: [exchange, ...state.statutoryExchanges] };
}

export function submitStatutoryExchange(state: RevenueOpsState, input: SubmitStatutoryExchangeInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const exchange = state.statutoryExchanges.find(({ id }) => id === input.id);
  if (!exchange || exchange.version !== input.expectedVersion || !['prepared', 'failed'].includes(exchange.status)) throw new Error('Statutory exchange changed or cannot be submitted.');
  const updated: StatutoryExchange = { ...exchange, status: 'submitted', requestReference: clean(input.requestReference, 'Adapter request reference', 3, 160), submittedBy: actorId, submittedAt: now, errorCode: undefined, errorMessage: undefined, version: exchange.version + 1 };
  return { ...state, revision: state.revision + 1, statutoryExchanges: state.statutoryExchanges.map((candidate) => candidate.id === updated.id ? updated : candidate) };
}

export function recordStatutoryResponse(state: RevenueOpsState, input: RecordStatutoryResponseInput): RevenueOpsState {
  const exchange = state.statutoryExchanges.find(({ id }) => id === input.id);
  if (!exchange || exchange.version !== input.expectedVersion || exchange.status !== 'submitted') throw new Error('Only the current submitted exchange can receive an adapter response.');
  let updated: StatutoryExchange;
  if (input.outcome === 'acknowledged') {
    if (!input.externalNumber || !input.acknowledgementNumber || !input.acknowledgedAt) throw new Error('Acknowledged response requires external number, acknowledgement number, and timestamp.');
    const externalNumber = clean(input.externalNumber, 'External statutory number', 3, 160);
    if (state.statutoryExchanges.some(({ id, kind, externalNumber: existing }) => id !== exchange.id && kind === exchange.kind && existing === externalNumber)) throw new Error('External statutory number is already reconciled to another exchange.');
    updated = { ...exchange, status: 'acknowledged', externalNumber, acknowledgementNumber: clean(input.acknowledgementNumber, 'Acknowledgement number', 3, 160), acknowledgedAt: input.acknowledgedAt, validUntil: input.validUntil, qrPayload: input.qrPayload?.trim().slice(0, 4000), signedPayloadChecksum: input.signedPayloadChecksum?.trim().toLowerCase(), portalStatus: 'unknown', reconciliationState: 'unverified', version: exchange.version + 1 };
  } else {
    updated = { ...exchange, status: 'failed', errorCode: clean(input.errorCode ?? '', 'Adapter error code', 2, 80), errorMessage: clean(input.errorMessage ?? '', 'Adapter error message', 4, 500), version: exchange.version + 1 };
  }
  const invoices = exchange.kind === 'e-invoice' ? state.invoices.map((invoice) => invoice.id === exchange.sourceId ? { ...invoice, irpStatus: input.outcome === 'acknowledged' ? 'registered' as const : 'failed' as const, irn: input.outcome === 'acknowledged' ? updated.externalNumber : invoice.irn, irpAcknowledgementNumber: input.outcome === 'acknowledged' ? updated.acknowledgementNumber : invoice.irpAcknowledgementNumber, irpAcknowledgedAt: input.outcome === 'acknowledged' ? updated.acknowledgedAt : invoice.irpAcknowledgedAt, version: invoice.version + 1 } : invoice) : state.invoices;
  return { ...state, revision: state.revision + 1, invoices, statutoryExchanges: state.statutoryExchanges.map((candidate) => candidate.id === updated.id ? updated : candidate) };
}
