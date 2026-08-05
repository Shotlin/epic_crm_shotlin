/**
 * Provider-neutral delivery contracts for the Retail Hub boundary.
 *
 * This module deliberately has no network client, map SDK, credential vault,
 * or persistence dependency. It turns only evidence supplied by an approved
 * boundary into safe operator projections. Missing evidence remains visibly
 * unavailable instead of becoming a fictional route, ETA, rider location, or
 * delivery outcome.
 */

export type DeliveryProviderEnvironment = 'sandbox' | 'production';
export type DeliveryProviderConfigurationState = 'missing' | 'configured' | 'rotated' | 'revoked';

export interface DeliveryProviderCredentialMetadata {
  providerCode: string;
  environment: DeliveryProviderEnvironment;
  credentialVersion: string;
  configurationState: DeliveryProviderConfigurationState;
  configuredAt?: string;
  expiresAt?: string;
}

export interface DeliveryProviderConformanceEvidence {
  credentialVersion: string;
  status: 'passed' | 'failed';
  environment: DeliveryProviderEnvironment;
  evidenceReference: string;
  assessedBy: string;
  assessedAt: string;
}

export interface DeliveryProviderReadiness {
  ready: boolean;
  blockers: string[];
  evidenceReferences: string[];
}

export type RetailDeliveryLocationSource = 'store-address' | 'customer-address' | 'rider-device' | 'provider-webhook';

export interface VerifiedRetailDeliveryLocation {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  source: RetailDeliveryLocationSource;
  observedAt: string;
  evidenceReference: string;
}

export interface RetailDeliveryMapPin {
  locationId: string;
  label: string;
  latitude: number;
  longitude: number;
  source: RetailDeliveryLocationSource;
  observedAt: string;
  evidenceReference: string;
}

export interface ProviderRouteEvidence {
  providerCode: string;
  credentialVersion: string;
  providerResponseReference: string;
  payloadChecksum: string;
  observedAt: string;
  estimatedArrivalAt: string;
  distanceKm: number;
}

export interface RetailDeliveryRouteProjection {
  status: 'blocked' | 'unrouted' | 'ready';
  map: {
    status: 'unavailable' | 'evidence-backed';
    pins: RetailDeliveryMapPin[];
  };
  eta: {
    status: 'unavailable' | 'evidence-backed';
    estimatedArrivalAt?: string;
    providerResponseReference?: string;
  };
  routeEvidenceReference?: string;
  reconciliationRequired: boolean;
  blockers: string[];
}

export interface RetailDeliveryAddress {
  id: string;
  postalCode: string;
  verifiedAt: string;
  evidenceReference: string;
}

export interface RetailDeliveryServiceabilityRule {
  id: string;
  outletId: string;
  postalCode: string;
  status: 'active' | 'suspended';
  decision: 'serviceable' | 'not-serviceable';
  effectiveFrom: string;
  effectiveTo?: string;
  evidenceReference: string;
}

export interface RetailDeliveryServiceabilityDecision {
  status: 'serviceable' | 'not-serviceable' | 'unverified';
  serviceable: boolean;
  ruleId?: string;
  evidenceReferences: string[];
  blockers: string[];
}

export interface RetailDeliverySlot {
  id: string;
  outletId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: 'draft' | 'open' | 'reserved' | 'full' | 'closed' | 'cancelled';
  reservationOrderIds: string[];
  serviceabilityEvidenceReferences: string[];
  openingEvidenceReference?: string;
  createdBy: string;
  createdAt: string;
  openedBy?: string;
  openedAt?: string;
  version: number;
}

export interface RetailRiderAssignment {
  deliveryId: string;
  riderId: string;
  status: 'assigned' | 'accepted' | 'released';
  acceptedAt?: string;
  assignmentEvidenceReference: string;
  trackingConsentReference?: string;
}

export interface RetailRiderTrackingObservation {
  deliveryId: string;
  riderId: string;
  source: 'rider-device' | 'provider-webhook';
  deviceEventReference: string;
  payloadChecksum: string;
  observedAt: string;
  location: VerifiedRetailDeliveryLocation;
}

export interface RetailRiderTrackingProjection {
  status: 'unavailable' | 'awaiting-signal' | 'live-evidence' | 'stale' | 'blocked';
  mapPin?: RetailDeliveryMapPin;
  eta: { status: 'unavailable' };
  reconciliationRequired: boolean;
  blockers: string[];
}

export type RetailDeliveryLifecycleStatus = 'scheduled' | 'rider-assigned' | 'out-for-delivery' | 'delivered' | 'failed' | 'rto' | 'cancelled';
export type RetailDeliveryPaymentMode = 'prepaid' | 'cod';
export type RetailCodCustodyStatus = 'expected' | 'handed-to-carrier' | 'carrier-collected' | 'remitted' | 'bank-matched' | 'shortfall';

export interface RetailProofOfDelivery {
  method: 'customer-otp' | 'recipient-signature' | 'delivery-photo' | 'recipient-confirmation';
  evidenceReference: string;
  payloadChecksum: string;
  capturedAt: string;
  capturedBy: string;
}

export interface RetailCodCustodyEvidence {
  caseId: string;
  status: RetailCodCustodyStatus;
  expectedAmount: number;
  collectedAmount?: number;
  remittedAmount?: number;
  evidenceReference: string;
  occurredAt: string;
  remittanceEvidenceReference?: string;
  bankReconciliationReference?: string;
  shortfallResolutionReference?: string;
}

export interface RetailDeliveryRecord {
  id: string;
  orderId: string;
  status: RetailDeliveryLifecycleStatus;
  paymentMode: RetailDeliveryPaymentMode;
  codExpectedAmount?: number;
  riderAssignment?: RetailRiderAssignment;
  proofOfDelivery?: RetailProofOfDelivery;
  codCustody?: RetailCodCustodyEvidence;
  completedAt?: string;
  completedBy?: string;
  version: number;
}

export interface RetailDeliveryReconciliation {
  status: 'not-applicable' | 'required' | 'reconciled' | 'exception';
  nextAction: string;
  evidenceReferences: string[];
}

export interface RetailDeliveryTransitionResult extends RetailDeliveryRecord {
  reconciliation: RetailDeliveryReconciliation;
}

const sensitiveProperty = /(secret|token|api[_-]?key|password|private[_-]?key|authorization|bearer)/i;
const checksumPattern = /^[a-f0-9]{64}$/i;
const postalCodePattern = /^[1-9][0-9]{5}$/;
const maximumInrAmount = 1_000_000_000_000;
const riderSignalFreshnessMs = 15 * 60_000;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clean(value: string, label: string, minimum = 2, maximum = 240): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  }
  return normalized;
}

function instant(value: string, label: string): string {
  if (!value.includes('T') || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }
  return new Date(value).toISOString();
}

function checksum(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!checksumPattern.test(normalized)) {
    throw new Error(`${label} must be a SHA-256 checksum.`);
  }
  return normalized;
}

function inrAmount(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > maximumInrAmount) {
    throw new Error(`${label} must be a positive INR amount within the supported range.`);
  }
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - value) > 0.000_001) {
    throw new Error(`${label} must not use fractions of an INR paisa.`);
  }
  return rounded;
}

function requireCurrentVersion(actual: number, expected: number, label: string): void {
  if (!Number.isInteger(expected) || expected <= 0 || actual !== expected) {
    throw new Error(`${label} changed. Refresh and retry.`);
  }
}

function assertNoSecretMaterial(value: unknown, visited = new Set<unknown>()): void {
  if (value === null || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoSecretMaterial(item, visited));
    return;
  }
  Object.entries(value).forEach(([key, child]) => {
    if (sensitiveProperty.test(key)) {
      throw new Error('Provider metadata must not include a secret, token, API key, password, private key, or authorization value.');
    }
    assertNoSecretMaterial(child, visited);
  });
}

function stringField(value: UnknownRecord, key: string, label: string, minimum = 2, maximum = 240): string {
  if (typeof value[key] !== 'string') throw new Error(`${label} is required.`);
  return clean(value[key], label, minimum, maximum);
}

function validEnvironment(value: unknown, label: string): DeliveryProviderEnvironment {
  if (value !== 'sandbox' && value !== 'production') throw new Error(`${label} must be sandbox or production.`);
  return value;
}

function validConfigurationState(value: unknown): DeliveryProviderConfigurationState {
  if (value !== 'missing' && value !== 'configured' && value !== 'rotated' && value !== 'revoked') {
    throw new Error('Provider configuration state is invalid.');
  }
  return value;
}

function validLocation(location: VerifiedRetailDeliveryLocation, label: string): VerifiedRetailDeliveryLocation {
  if (!Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90) {
    throw new Error(`${label} latitude is invalid.`);
  }
  if (!Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) {
    throw new Error(`${label} longitude is invalid.`);
  }
  if (!['store-address', 'customer-address', 'rider-device', 'provider-webhook'].includes(location.source)) {
    throw new Error(`${label} source is invalid.`);
  }
  return {
    id: clean(location.id, `${label} ID`, 1, 120),
    label: clean(location.label, `${label} label`, 2, 240),
    latitude: location.latitude,
    longitude: location.longitude,
    source: location.source,
    observedAt: instant(location.observedAt, `${label} observation time`),
    evidenceReference: clean(location.evidenceReference, `${label} evidence reference`, 3, 240),
  };
}

function mapPin(location: VerifiedRetailDeliveryLocation): RetailDeliveryMapPin {
  return {
    locationId: location.id,
    label: location.label,
    latitude: location.latitude,
    longitude: location.longitude,
    source: location.source,
    observedAt: location.observedAt,
    evidenceReference: location.evidenceReference,
  };
}

function validConformanceEvidence(evidence: DeliveryProviderConformanceEvidence): DeliveryProviderConformanceEvidence {
  if (evidence.status !== 'passed' && evidence.status !== 'failed') throw new Error('Provider conformance result is invalid.');
  return {
    credentialVersion: clean(evidence.credentialVersion, 'Provider conformance credential version', 3, 160),
    status: evidence.status,
    environment: validEnvironment(evidence.environment, 'Provider conformance environment'),
    evidenceReference: clean(evidence.evidenceReference, 'Provider conformance evidence reference', 3, 240),
    assessedBy: clean(evidence.assessedBy, 'Provider conformance assessor', 1, 120),
    assessedAt: instant(evidence.assessedAt, 'Provider conformance assessment time'),
  };
}

function deliveryProviderReadiness(
  provider: DeliveryProviderCredentialMetadata,
  evidence: DeliveryProviderConformanceEvidence | undefined,
  at?: string,
): DeliveryProviderReadiness {
  const blockers: string[] = [];
  const evidenceReferences: string[] = [];
  if (provider.configurationState !== 'configured') {
    blockers.push('Provider credentials are not configured for this governed boundary.');
  }
  if (provider.expiresAt && at && Date.parse(provider.expiresAt) <= Date.parse(at)) {
    blockers.push('Provider credential metadata is expired.');
  }
  if (!evidence) {
    blockers.push('Current provider conformance evidence is required before route or webhook data can be trusted.');
  } else if (evidence.credentialVersion !== provider.credentialVersion) {
    blockers.push('Provider conformance evidence does not match the configured credential version.');
  } else if (evidence.environment !== provider.environment) {
    blockers.push('Provider conformance evidence does not match the configured environment.');
  } else if (evidence.status !== 'passed') {
    blockers.push('Provider conformance evidence has not passed.');
  } else {
    evidenceReferences.push(evidence.evidenceReference);
  }
  return { ready: blockers.length === 0, blockers, evidenceReferences };
}

/**
 * Sanitises the one provider object allowed inside domain state. The value is
 * metadata only; any field that looks like secret material is rejected rather
 * than ignored, so a caller cannot accidentally persist credentials here.
 */
export function validateDeliveryProviderMetadata(value: unknown): DeliveryProviderCredentialMetadata {
  assertNoSecretMaterial(value);
  if (!isRecord(value)) throw new Error('Provider metadata must be an object.');
  const configuredAt = value.configuredAt === undefined ? undefined : instant(stringField(value, 'configuredAt', 'Provider configured-at', 3, 80), 'Provider configured-at');
  const expiresAt = value.expiresAt === undefined ? undefined : instant(stringField(value, 'expiresAt', 'Provider expiry', 3, 80), 'Provider expiry');
  if (configuredAt && expiresAt && Date.parse(expiresAt) <= Date.parse(configuredAt)) {
    throw new Error('Provider expiry must be after the configured timestamp.');
  }
  return {
    providerCode: stringField(value, 'providerCode', 'Provider code', 2, 80),
    environment: validEnvironment(value.environment, 'Provider environment'),
    credentialVersion: stringField(value, 'credentialVersion', 'Provider credential version', 3, 160),
    configurationState: validConfigurationState(value.configurationState),
    configuredAt,
    expiresAt,
  };
}

export function evaluateRetailDeliveryServiceability({
  outletId,
  address,
  rules,
  at = new Date().toISOString(),
}: {
  outletId: string;
  address: RetailDeliveryAddress | undefined;
  rules: RetailDeliveryServiceabilityRule[];
  at?: string;
}): RetailDeliveryServiceabilityDecision {
  const currentAt = instant(at, 'Serviceability decision time');
  if (!address) {
    return {
      status: 'unverified',
      serviceable: false,
      evidenceReferences: [],
      blockers: ['A verified delivery address is required before serviceability can be decided.'],
    };
  }
  const postalCode = clean(address.postalCode, 'Delivery postal code', 6, 6);
  if (!postalCodePattern.test(postalCode)) throw new Error('Delivery postal code must be a valid Indian PIN code.');
  const verifiedAt = instant(address.verifiedAt, 'Delivery address verification time');
  const addressEvidence = clean(address.evidenceReference, 'Delivery address evidence reference', 3, 240);
  clean(address.id, 'Delivery address ID', 1, 120);
  clean(outletId, 'Outlet ID', 1, 120);
  if (Date.parse(verifiedAt) > Date.parse(currentAt)) {
    throw new Error('Delivery address verification cannot occur after the serviceability decision time.');
  }

  const matching = rules
    .filter((rule) => rule.outletId === outletId && rule.postalCode === postalCode && rule.status === 'active')
    .filter((rule) => {
      const effectiveFrom = instant(rule.effectiveFrom, 'Serviceability rule effective-from time');
      const effectiveTo = rule.effectiveTo ? instant(rule.effectiveTo, 'Serviceability rule effective-to time') : undefined;
      if (effectiveTo && Date.parse(effectiveTo) < Date.parse(effectiveFrom)) throw new Error('Serviceability rule effective-to time cannot predate effective-from time.');
      return Date.parse(effectiveFrom) <= Date.parse(currentAt) && (!effectiveTo || Date.parse(effectiveTo) >= Date.parse(currentAt));
    })
    .map((rule) => ({
      ...rule,
      id: clean(rule.id, 'Serviceability rule ID', 1, 120),
      evidenceReference: clean(rule.evidenceReference, 'Serviceability rule evidence reference', 3, 240),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const rule = matching[0];
  if (!rule) {
    return {
      status: 'unverified',
      serviceable: false,
      evidenceReferences: [addressEvidence],
      blockers: ['No active, evidence-backed serviceability rule covers this address.'],
    };
  }
  if (rule.decision !== 'serviceable') {
    return {
      status: 'not-serviceable',
      serviceable: false,
      ruleId: rule.id,
      evidenceReferences: [addressEvidence, rule.evidenceReference],
      blockers: ['The active serviceability rule explicitly excludes this address.'],
    };
  }
  return {
    status: 'serviceable',
    serviceable: true,
    ruleId: rule.id,
    evidenceReferences: [addressEvidence, rule.evidenceReference],
    blockers: [],
  };
}

function validRouteEvidence(route: ProviderRouteEvidence): ProviderRouteEvidence {
  if (!Number.isFinite(route.distanceKm) || route.distanceKm <= 0 || route.distanceKm > 100_000) {
    throw new Error('Provider route distance is invalid.');
  }
  const observedAt = instant(route.observedAt, 'Provider route observation time');
  const estimatedArrivalAt = instant(route.estimatedArrivalAt, 'Provider route ETA');
  if (Date.parse(estimatedArrivalAt) < Date.parse(observedAt)) {
    throw new Error('Provider route ETA cannot predate its observed time.');
  }
  return {
    providerCode: clean(route.providerCode, 'Provider route code', 2, 80),
    credentialVersion: clean(route.credentialVersion, 'Provider route credential version', 3, 160),
    providerResponseReference: clean(route.providerResponseReference, 'Provider route response reference', 3, 240),
    payloadChecksum: checksum(route.payloadChecksum, 'Provider route payload checksum'),
    observedAt,
    estimatedArrivalAt,
    distanceKm: Math.round(route.distanceKm * 1000) / 1000,
  };
}

/**
 * Builds a route projection without calculating an ETA or placing a default
 * map marker. A location pin is shown only if that exact location is supplied
 * with its own evidence. ETA remains unavailable until a current conformed
 * provider response declares it.
 */
export function projectProviderNeutralRoute({
  provider: providerInput,
  conformanceEvidence: evidenceInput,
  origin: originInput,
  destination: destinationInput,
  routeEvidence: routeInput,
  at,
}: {
  provider: DeliveryProviderCredentialMetadata;
  conformanceEvidence?: DeliveryProviderConformanceEvidence;
  origin?: VerifiedRetailDeliveryLocation;
  destination?: VerifiedRetailDeliveryLocation;
  routeEvidence?: ProviderRouteEvidence;
  at?: string;
}): RetailDeliveryRouteProjection {
  const provider = validateDeliveryProviderMetadata(providerInput);
  const conformanceEvidence = evidenceInput ? validConformanceEvidence(evidenceInput) : undefined;
  const readiness = deliveryProviderReadiness(provider, conformanceEvidence, at);
  const blockers = [...readiness.blockers];
  const origin = originInput ? validLocation(originInput, 'Route origin') : undefined;
  const destination = destinationInput ? validLocation(destinationInput, 'Route destination') : undefined;
  const locationsReady = Boolean(origin && destination);
  if (!locationsReady) {
    blockers.push('Verified origin and destination locations are required before a route can be shown.');
  }
  const map = locationsReady && origin && destination
    ? { status: 'evidence-backed' as const, pins: [mapPin(origin), mapPin(destination)] }
    : { status: 'unavailable' as const, pins: [] };

  const route = routeInput ? validRouteEvidence(routeInput) : undefined;
  let routeMatchesProvider = false;
  if (!route) {
    blockers.push('A current provider route response is required before an ETA can be shown.');
  } else if (route.providerCode !== provider.providerCode) {
    blockers.push('Route response provider does not match the configured provider boundary.');
  } else if (route.credentialVersion !== provider.credentialVersion) {
    blockers.push('Route response does not match the configured provider credential version.');
  } else {
    routeMatchesProvider = true;
  }

  if (!locationsReady || !readiness.ready) {
    return {
      status: 'blocked',
      map,
      eta: { status: 'unavailable' },
      reconciliationRequired: true,
      blockers,
    };
  }
  if (!route || !routeMatchesProvider) {
    return {
      status: 'unrouted',
      map,
      eta: { status: 'unavailable' },
      reconciliationRequired: true,
      blockers,
    };
  }
  return {
    status: 'ready',
    map,
    eta: {
      status: 'evidence-backed',
      estimatedArrivalAt: route.estimatedArrivalAt,
      providerResponseReference: route.providerResponseReference,
    },
    routeEvidenceReference: route.providerResponseReference,
    reconciliationRequired: false,
    blockers: [],
  };
}

export function createRetailDeliverySlot(
  input: {
    id: string;
    outletId: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
  },
  actorId: string,
  now = new Date().toISOString(),
): RetailDeliverySlot {
  const startsAt = instant(input.startsAt, 'Delivery slot start');
  const endsAt = instant(input.endsAt, 'Delivery slot end');
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error('Delivery slot end must be after its start.');
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 100_000) {
    throw new Error('Delivery slot capacity must be a whole number from 1 to 100000.');
  }
  return {
    id: clean(input.id, 'Delivery slot ID', 1, 120),
    outletId: clean(input.outletId, 'Delivery slot outlet ID', 1, 120),
    startsAt,
    endsAt,
    capacity: input.capacity,
    status: 'draft',
    reservationOrderIds: [],
    serviceabilityEvidenceReferences: [],
    createdBy: clean(actorId, 'Delivery slot creator', 1, 120),
    createdAt: instant(now, 'Delivery slot creation time'),
    version: 1,
  };
}

export function openRetailDeliverySlot(
  slot: RetailDeliverySlot,
  input: {
    expectedVersion: number;
    serviceability: RetailDeliveryServiceabilityDecision;
    openingEvidenceReference: string;
  },
  actorId: string,
  now = new Date().toISOString(),
): RetailDeliverySlot {
  requireCurrentVersion(slot.version, input.expectedVersion, 'Delivery slot');
  if (slot.status !== 'draft') throw new Error('Only a draft delivery slot can be opened.');
  if (!input.serviceability.serviceable || input.serviceability.status !== 'serviceable' || !input.serviceability.evidenceReferences.length) {
    throw new Error('A serviceable, evidence-backed serviceability decision is required before opening a delivery slot.');
  }
  return {
    ...slot,
    status: 'open',
    serviceabilityEvidenceReferences: [...new Set(input.serviceability.evidenceReferences.map((reference) => clean(reference, 'Serviceability evidence reference', 3, 240)))],
    openingEvidenceReference: clean(input.openingEvidenceReference, 'Delivery slot opening evidence reference', 3, 240),
    openedBy: clean(actorId, 'Delivery slot opener', 1, 120),
    openedAt: instant(now, 'Delivery slot opening time'),
    version: slot.version + 1,
  };
}

export function reserveRetailDeliverySlot(
  slot: RetailDeliverySlot,
  input: { expectedVersion: number; orderId: string; orderEvidenceReference: string },
  actorId: string,
  now = new Date().toISOString(),
): RetailDeliverySlot {
  requireCurrentVersion(slot.version, input.expectedVersion, 'Delivery slot');
  if (!['open', 'reserved'].includes(slot.status) || slot.reservationOrderIds.length >= slot.capacity) {
    throw new Error('An order can be reserved only in an open slot with spare capacity.');
  }
  const orderId = clean(input.orderId, 'Delivery slot order ID', 1, 120);
  if (slot.reservationOrderIds.includes(orderId)) throw new Error('This order already reserves the delivery slot.');
  clean(input.orderEvidenceReference, 'Delivery slot order evidence reference', 3, 240);
  clean(actorId, 'Delivery slot reservation actor', 1, 120);
  instant(now, 'Delivery slot reservation time');
  const reservationOrderIds = [...slot.reservationOrderIds, orderId];
  return {
    ...slot,
    status: reservationOrderIds.length === slot.capacity ? 'full' : 'reserved',
    reservationOrderIds,
    version: slot.version + 1,
  };
}

function validRiderAssignment(assignment: RetailRiderAssignment): RetailRiderAssignment {
  if (!['assigned', 'accepted', 'released'].includes(assignment.status)) throw new Error('Rider-assignment status is invalid.');
  const acceptedAt = assignment.acceptedAt === undefined ? undefined : instant(assignment.acceptedAt, 'Rider acceptance time');
  if (assignment.status === 'accepted' && !acceptedAt) throw new Error('An accepted rider assignment needs an acceptance timestamp.');
  return {
    deliveryId: clean(assignment.deliveryId, 'Rider assignment delivery ID', 1, 120),
    riderId: clean(assignment.riderId, 'Rider assignment rider ID', 1, 120),
    status: assignment.status,
    acceptedAt,
    assignmentEvidenceReference: clean(assignment.assignmentEvidenceReference, 'Rider assignment evidence reference', 3, 240),
    trackingConsentReference: assignment.trackingConsentReference === undefined
      ? undefined
      : clean(assignment.trackingConsentReference, 'Rider tracking consent reference', 3, 240),
  };
}

function validRiderObservation(observation: RetailRiderTrackingObservation): RetailRiderTrackingObservation {
  if (observation.source !== 'rider-device' && observation.source !== 'provider-webhook') {
    throw new Error('Rider tracking source is invalid.');
  }
  const normalized = {
    deliveryId: clean(observation.deliveryId, 'Rider observation delivery ID', 1, 120),
    riderId: clean(observation.riderId, 'Rider observation rider ID', 1, 120),
    source: observation.source,
    deviceEventReference: clean(observation.deviceEventReference, 'Rider device event reference', 3, 240),
    payloadChecksum: checksum(observation.payloadChecksum, 'Rider tracking payload checksum'),
    observedAt: instant(observation.observedAt, 'Rider tracking observation time'),
    location: validLocation(observation.location, 'Rider tracking location'),
  };
  if (Date.parse(normalized.location.observedAt) !== Date.parse(normalized.observedAt)) {
    throw new Error('Rider location observation time must match the signed tracking event time.');
  }
  return normalized;
}

/**
 * A tracking point is an observed, consented signal. It never becomes a
 * route/ETA. An unobserved or stale rider therefore stays visibly unknown.
 */
export function projectRiderTracking({
  assignment: assignmentInput,
  observation: observationInput,
  provider: providerInput,
  conformanceEvidence: evidenceInput,
  now = new Date().toISOString(),
}: {
  assignment: RetailRiderAssignment;
  observation?: RetailRiderTrackingObservation;
  provider?: DeliveryProviderCredentialMetadata;
  conformanceEvidence?: DeliveryProviderConformanceEvidence;
  now?: string;
}): RetailRiderTrackingProjection {
  const assignment = validRiderAssignment(assignmentInput);
  const currentAt = instant(now, 'Rider tracking projection time');
  const unavailable = (status: RetailRiderTrackingProjection['status'], blocker: string): RetailRiderTrackingProjection => ({
    status,
    mapPin: undefined,
    eta: { status: 'unavailable' },
    reconciliationRequired: true,
    blockers: [blocker],
  });
  if (assignment.status !== 'accepted') return unavailable('unavailable', 'An accepted rider assignment is required before rider tracking can be shown.');
  if (!assignment.trackingConsentReference) return unavailable('blocked', 'Rider tracking consent evidence is required before a location can be shown.');
  if (!observationInput) return unavailable('awaiting-signal', 'No current rider location observation has been received.');

  let observation: RetailRiderTrackingObservation;
  try {
    observation = validRiderObservation(observationInput);
  } catch (error) {
    return unavailable('blocked', error instanceof Error ? error.message : 'Rider tracking evidence is invalid.');
  }
  if (observation.deliveryId !== assignment.deliveryId || observation.riderId !== assignment.riderId) {
    return unavailable('blocked', 'Rider tracking evidence does not match the assigned rider and delivery.');
  }
  if (Date.parse(observation.observedAt) > Date.parse(currentAt)) {
    return unavailable('blocked', 'Rider tracking evidence cannot be observed after the current projection time.');
  }
  if (observation.source === 'provider-webhook') {
    if (!providerInput) return unavailable('blocked', 'Provider-webhook tracking needs protected provider metadata and current conformance evidence.');
    const provider = validateDeliveryProviderMetadata(providerInput);
    const evidence = evidenceInput ? validConformanceEvidence(evidenceInput) : undefined;
    const readiness = deliveryProviderReadiness(provider, evidence, currentAt);
    if (!readiness.ready) return unavailable('blocked', readiness.blockers[0] ?? 'Provider-webhook tracking is not ready.');
  }
  const age = Date.parse(currentAt) - Date.parse(observation.observedAt);
  return {
    status: age > riderSignalFreshnessMs ? 'stale' : 'live-evidence',
    mapPin: mapPin(observation.location),
    eta: { status: 'unavailable' },
    reconciliationRequired: true,
    blockers: age > riderSignalFreshnessMs
      ? ['The latest rider observation is stale; do not treat it as live tracking.']
      : ['Rider location remains an observed signal and needs delivery-event reconciliation.'],
  };
}

function validProofOfDelivery(proof: RetailProofOfDelivery): RetailProofOfDelivery {
  if (!['customer-otp', 'recipient-signature', 'delivery-photo', 'recipient-confirmation'].includes(proof.method)) {
    throw new Error('Proof of delivery method is invalid.');
  }
  return {
    method: proof.method,
    evidenceReference: clean(proof.evidenceReference, 'Proof of delivery evidence reference', 3, 240),
    payloadChecksum: checksum(proof.payloadChecksum, 'Proof of delivery payload checksum'),
    capturedAt: instant(proof.capturedAt, 'Proof of delivery capture time'),
    capturedBy: clean(proof.capturedBy, 'Proof of delivery recorder', 1, 120),
  };
}

function sameMoney(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.005;
}

function validCodCustody(
  custody: RetailCodCustodyEvidence,
  expectedAmount: number,
): RetailCodCustodyEvidence {
  if (!['expected', 'handed-to-carrier', 'carrier-collected', 'remitted', 'bank-matched', 'shortfall'].includes(custody.status)) {
    throw new Error('COD custody status is invalid.');
  }
  const normalized: RetailCodCustodyEvidence = {
    ...custody,
    caseId: clean(custody.caseId, 'COD custody case ID', 1, 120),
    expectedAmount: inrAmount(custody.expectedAmount, 'COD custody expected amount'),
    evidenceReference: clean(custody.evidenceReference, 'COD custody evidence reference', 3, 240),
    occurredAt: instant(custody.occurredAt, 'COD custody evidence time'),
    collectedAmount: custody.collectedAmount === undefined ? undefined : inrAmount(custody.collectedAmount, 'COD collected amount'),
    remittedAmount: custody.remittedAmount === undefined ? undefined : inrAmount(custody.remittedAmount, 'COD remitted amount'),
    remittanceEvidenceReference: custody.remittanceEvidenceReference === undefined
      ? undefined
      : clean(custody.remittanceEvidenceReference, 'COD remittance evidence reference', 3, 240),
    bankReconciliationReference: custody.bankReconciliationReference === undefined
      ? undefined
      : clean(custody.bankReconciliationReference, 'COD bank reconciliation reference', 3, 240),
    shortfallResolutionReference: custody.shortfallResolutionReference === undefined
      ? undefined
      : clean(custody.shortfallResolutionReference, 'COD shortfall resolution reference', 3, 240),
  };
  if (!sameMoney(normalized.expectedAmount, expectedAmount)) {
    throw new Error('COD custody amount does not match the governed delivery amount.');
  }
  if (['carrier-collected', 'remitted', 'bank-matched'].includes(normalized.status) && !sameMoney(normalized.collectedAmount ?? 0, expectedAmount)) {
    throw new Error('COD collected amount must exactly match the delivery amount unless an approved shortfall exists.');
  }
  if (['remitted', 'bank-matched'].includes(normalized.status)) {
    if (!sameMoney(normalized.remittedAmount ?? 0, expectedAmount) || !normalized.remittanceEvidenceReference) {
      throw new Error('COD remittance requires an exact remitted amount and immutable remittance evidence.');
    }
  }
  if (normalized.status === 'bank-matched' && !normalized.bankReconciliationReference) {
    throw new Error('COD bank-matched status requires a bank reconciliation reference.');
  }
  if (normalized.status === 'shortfall' && !normalized.shortfallResolutionReference) {
    throw new Error('COD shortfall status requires an approved shortfall resolution reference.');
  }
  return normalized;
}

function reconciliationFor(paymentMode: RetailDeliveryPaymentMode, custody: RetailCodCustodyEvidence | undefined): RetailDeliveryReconciliation {
  if (paymentMode === 'prepaid') {
    return { status: 'not-applicable', nextAction: 'Delivery proof is recorded; no COD custody reconciliation is required.', evidenceReferences: [] };
  }
  if (!custody) {
    return { status: 'required', nextAction: 'Record carrier collection evidence before treating this COD delivery as complete.', evidenceReferences: [] };
  }
  if (custody.status === 'bank-matched') {
    return {
      status: 'reconciled',
      nextAction: 'COD custody is reconciled to governed bank evidence.',
      evidenceReferences: [custody.evidenceReference, custody.remittanceEvidenceReference!, custody.bankReconciliationReference!],
    };
  }
  if (custody.status === 'shortfall') {
    return {
      status: 'exception',
      nextAction: 'Resolve the COD shortfall through the approved finance workflow before closure.',
      evidenceReferences: [custody.evidenceReference, custody.shortfallResolutionReference!],
    };
  }
  return {
    status: 'required',
    nextAction: 'Record carrier remittance and reconcile the COD case to a bank receipt.',
    evidenceReferences: [custody.evidenceReference],
  };
}

const allowedTransitions: Record<RetailDeliveryLifecycleStatus, RetailDeliveryLifecycleStatus[]> = {
  scheduled: ['rider-assigned', 'cancelled'],
  'rider-assigned': ['out-for-delivery', 'cancelled'],
  'out-for-delivery': ['delivered', 'failed', 'rto'],
  delivered: [],
  failed: ['rider-assigned', 'rto', 'cancelled'],
  rto: [],
  cancelled: [],
};

/**
 * Applies only an evidence-complete delivery transition. It does not post a
 * receipt, change inventory, or invent a carrier confirmation; it preserves
 * the delivery/COD state that a later governed adapter must reconcile.
 */
export function transitionRetailDelivery(
  delivery: RetailDeliveryRecord,
  input: {
    expectedVersion: number;
    toStatus: RetailDeliveryLifecycleStatus;
    proofOfDelivery?: RetailProofOfDelivery;
    codCustody?: RetailCodCustodyEvidence;
    exceptionEvidenceReference?: string;
  },
  actorId: string,
  now = new Date().toISOString(),
): RetailDeliveryTransitionResult {
  requireCurrentVersion(delivery.version, input.expectedVersion, 'Retail delivery');
  if (!allowedTransitions[delivery.status].includes(input.toStatus)) {
    throw new Error(`Retail delivery cannot move from ${delivery.status} to ${input.toStatus}.`);
  }
  const actor = clean(actorId, 'Delivery transition actor', 1, 120);
  const transitionAt = instant(now, 'Delivery transition time');
  const assignment = delivery.riderAssignment ? validRiderAssignment(delivery.riderAssignment) : undefined;
  if (input.toStatus === 'out-for-delivery' && (!assignment || assignment.status !== 'accepted')) {
    throw new Error('An accepted rider assignment is required before a delivery can go out for delivery.');
  }
  if (input.toStatus === 'delivered') {
    if (!assignment || assignment.status !== 'accepted') throw new Error('An accepted rider assignment is required before recording delivery completion.');
    if (assignment.riderId !== actor) throw new Error('Only the accepted rider can record delivery proof.');
    if (!input.proofOfDelivery) throw new Error('A proof of delivery is required before a delivery can be recorded as delivered.');
    const proofOfDelivery = validProofOfDelivery(input.proofOfDelivery);
    let codCustody: RetailCodCustodyEvidence | undefined;
    if (delivery.paymentMode === 'cod') {
      const expectedAmount = inrAmount(delivery.codExpectedAmount ?? 0, 'COD delivery amount');
      if (!input.codCustody) throw new Error('COD delivery completion requires carrier-collected or later custody evidence.');
      codCustody = validCodCustody(input.codCustody, expectedAmount);
      if (!['carrier-collected', 'remitted', 'bank-matched', 'shortfall'].includes(codCustody.status)) {
        throw new Error('COD delivery completion requires carrier-collected or later custody evidence.');
      }
    }
    const updated: RetailDeliveryTransitionResult = {
      ...delivery,
      status: 'delivered',
      riderAssignment: assignment,
      proofOfDelivery,
      codCustody,
      completedAt: transitionAt,
      completedBy: actor,
      version: delivery.version + 1,
      reconciliation: reconciliationFor(delivery.paymentMode, codCustody),
    };
    return updated;
  }
  if (['failed', 'rto'].includes(input.toStatus)) {
    clean(input.exceptionEvidenceReference ?? '', 'Delivery exception evidence reference', 3, 240);
  }
  return {
    ...delivery,
    status: input.toStatus,
    riderAssignment: assignment,
    version: delivery.version + 1,
    reconciliation: reconciliationFor(delivery.paymentMode, delivery.codCustody),
  };
}
