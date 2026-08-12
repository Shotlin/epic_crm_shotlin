import type { RetailDeliveryMapSignal, RetailDeliveryMapSignalStatus } from '../shared/retail-delivery-map-contracts';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

export interface RetailDeliveryMapSurface {
  status: 'unavailable' | 'blocked' | 'live-evidence' | 'stale' | 'mixed';
  pins: RetailDeliveryMapSignal[];
  liveCount: number;
  staleCount: number;
  blockedCount: number;
  blockers: string[];
}

function validPin(signal: RetailDeliveryMapSignal): boolean {
  const pin = signal.mapPin;
  return Boolean(
    pin
    && Number.isFinite(pin.latitude)
    && pin.latitude >= -90
    && pin.latitude <= 90
    && Number.isFinite(pin.longitude)
    && pin.longitude >= -180
    && pin.longitude <= 180,
  );
}

function clean(value: unknown, label: string, minimum = 1, maximum = 240): string {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
}

function timestamp(value: unknown, label: string): string {
  const normalized = clean(value, label, 10, 80);
  if (Number.isNaN(Date.parse(normalized))) throw new Error(`${label} must be a valid ISO timestamp.`);
  return new Date(normalized).toISOString();
}

function validScope(value: unknown): value is { companyId: string; branchId: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { companyId?: unknown; branchId?: unknown };
  return typeof candidate.companyId === 'string'
    && candidate.companyId.trim().length > 0
    && typeof candidate.branchId === 'string'
    && candidate.branchId.trim().length > 0;
}

function equivalentSignal(left: RetailDeliveryMapSignal, right: RetailDeliveryMapSignal): boolean {
  const comparable = (signal: RetailDeliveryMapSignal) => ({
    id: signal.id,
    deliveryId: signal.deliveryId,
    riderId: signal.riderId,
    status: signal.status,
    mapPin: signal.mapPin,
    observedAt: signal.observedAt,
    blockers: signal.blockers,
  });
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

/** Validates a projection before it crosses the Hub → Electron state boundary. */
export function normalizeRetailDeliveryMapSignal(value: unknown): RetailDeliveryMapSignal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Delivery map signal must be an object.');
  const candidate = value as Partial<RetailDeliveryMapSignal>;
  const statuses: RetailDeliveryMapSignalStatus[] = ['unavailable', 'awaiting-signal', 'live-evidence', 'stale', 'blocked'];
  if (!statuses.includes(candidate.status as RetailDeliveryMapSignalStatus)) throw new Error('Delivery map signal status is invalid.');
  if (!Array.isArray(candidate.blockers) || candidate.blockers.some((item) => typeof item !== 'string')) throw new Error('Delivery map signal blockers are invalid.');
  const normalized: RetailDeliveryMapSignal = {
    id: clean(candidate.id, 'Delivery map signal ID', 1, 120),
    deliveryId: clean(candidate.deliveryId, 'Delivery map delivery ID', 1, 120),
    riderId: clean(candidate.riderId, 'Delivery map rider ID', 1, 120),
    status: candidate.status as RetailDeliveryMapSignalStatus,
    blockers: candidate.blockers.map((item) => clean(item, 'Delivery map blocker', 1, 300)),
    recordedAt: timestamp(candidate.recordedAt, 'Delivery map recorded-at'),
    version: candidate.version as number,
    ...(candidate.observedAt === undefined ? {} : { observedAt: timestamp(candidate.observedAt, 'Delivery map observed-at') }),
  };
  if (!Number.isInteger(normalized.version) || normalized.version < 1) throw new Error('Delivery map signal version must be a positive integer.');
  if (candidate.scope !== undefined) {
    if (!validScope(candidate.scope)) throw new Error('Delivery map signal scope is invalid.');
    normalized.scope = { companyId: candidate.scope.companyId.trim(), branchId: candidate.scope.branchId.trim() };
  }
  if (candidate.mapPin !== undefined) {
    const pin = candidate.mapPin;
    if (!pin || typeof pin !== 'object' || !Number.isFinite(pin.latitude) || pin.latitude < -90 || pin.latitude > 90 || !Number.isFinite(pin.longitude) || pin.longitude < -180 || pin.longitude > 180) {
      throw new Error('Delivery map signal coordinates are invalid.');
    }
    if (!['store-address', 'customer-address', 'rider-device', 'provider-webhook'].includes(pin.source)) throw new Error('Delivery map signal source is invalid.');
    normalized.mapPin = {
      locationId: clean(pin.locationId, 'Delivery map location ID', 1, 120),
      label: clean(pin.label, 'Delivery map location label', 1, 240),
      latitude: pin.latitude,
      longitude: pin.longitude,
      source: pin.source,
      observedAt: timestamp(pin.observedAt, 'Delivery map pin observed-at'),
      evidenceReference: clean(pin.evidenceReference, 'Delivery map evidence reference', 3, 240),
    };
    if (normalized.observedAt && Date.parse(normalized.observedAt) !== Date.parse(normalized.mapPin.observedAt)) throw new Error('Delivery map signal and pin timestamps must match.');
  }
  return normalized;
}

export function ingestRetailDeliveryMapSignal(
  state: RevenueOpsState,
  input: { signal: unknown; actorId: string; now?: string },
): RevenueOpsState {
  const signal = normalizeRetailDeliveryMapSignal(input.signal);
  const actorId = clean(input.actorId, 'Delivery map signal actor', 1, 120);
  const now = timestamp(input.now ?? new Date().toISOString(), 'Delivery map ingestion time');
  if (signal.scope && (signal.scope.companyId !== state.scope.companyId || signal.scope.branchId !== state.scope.branchId)) {
    throw new Error('Delivery map signal scope does not match the active operating scope.');
  }
  const existing = (state.retailDeliveryMapSignals ?? []).find(({ id }) => id === signal.id);
  if (existing && equivalentSignal(existing, signal)) return state;
  const persisted: RetailDeliveryMapSignal = { ...signal, scope: structuredClone(state.scope), recordedAt: now, version: existing ? existing.version + 1 : signal.version };
  void actorId;
  return {
    ...state,
    revision: state.revision + 1,
    retailDeliveryMapSignals: [persisted, ...(state.retailDeliveryMapSignals ?? []).filter(({ id }) => id !== signal.id)],
  };
}

function statusRank(status: RetailDeliveryMapSignalStatus): number {
  return { 'live-evidence': 0, stale: 1, 'awaiting-signal': 2, blocked: 3, unavailable: 4 }[status];
}

/**
 * Produces the small, honest map model used by the renderer. No coordinate is
 * generated here; signals without verified coordinates stay in the blocker
 * register and never become a marker.
 */
export function buildRetailDeliveryMapSurface(
  signals: readonly RetailDeliveryMapSignal[] | undefined,
  now?: string,
): RetailDeliveryMapSurface {
  void now;
  const ordered = [...(signals ?? [])].sort((left, right) => statusRank(left.status) - statusRank(right.status) || left.deliveryId.localeCompare(right.deliveryId));
  const pins = ordered.filter((signal) => validPin(signal) && ['live-evidence', 'stale'].includes(signal.status));
  const live = ordered.filter((signal) => signal.status === 'live-evidence' && validPin(signal)).length;
  const stale = ordered.filter((signal) => signal.status === 'stale' && validPin(signal)).length;
  const blockedCount = ordered.filter(({ status }) => ['blocked', 'awaiting-signal', 'unavailable'].includes(status)).length;
  const blockers = ordered
    .flatMap(({ blockers: reasons }) => reasons)
    .filter(Boolean)
    .filter((reason, index, all) => all.indexOf(reason) === index)
    .slice(0, 4);
  const status = pins.length === 0
    ? (ordered.length === 0 ? 'unavailable' : blockedCount === ordered.length ? 'blocked' : 'stale')
    : live > 0 && stale > 0 ? 'mixed' : live > 0 ? 'live-evidence' : 'stale';
  return { status, pins, liveCount: live, staleCount: stale, blockedCount, blockers };
}
