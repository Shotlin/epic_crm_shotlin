import type { OperatingRecordScope } from './revenue-ops-contracts';

export type RetailDeliveryMapSignalStatus = 'unavailable' | 'awaiting-signal' | 'live-evidence' | 'stale' | 'blocked';

export interface RetailDeliveryMapPinEvidence {
  locationId: string;
  label: string;
  latitude: number;
  longitude: number;
  source: 'store-address' | 'customer-address' | 'rider-device' | 'provider-webhook';
  observedAt: string;
  evidenceReference: string;
}

/**
 * Renderer-safe delivery tracking evidence. This is a projection, never a
 * credential or provider payload. A map pin is optional because a blocked or
 * stale signal must remain visible without pretending it is live.
 */
export interface RetailDeliveryMapSignal {
  scope?: OperatingRecordScope;
  id: string;
  deliveryId: string;
  riderId: string;
  status: RetailDeliveryMapSignalStatus;
  mapPin?: RetailDeliveryMapPinEvidence;
  observedAt?: string;
  blockers: string[];
  recordedAt: string;
  version: number;
}
