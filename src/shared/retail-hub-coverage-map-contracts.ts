import type { OperatingRecordScope } from './revenue-ops-contracts';

export interface FetchRetailHubCoverageMapInput {
  baseUrl: string;
  shopId: string;
  scope: OperatingRecordScope;
}

export interface RetailHubCoverageMapShop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  pincode: string;
  isActive: boolean;
}

export interface RetailHubCoverageMapCustomer {
  userId: string;
  name: string | null;
  initial: string;
  lat: number;
  lng: number;
  pincode: string | null;
  hasActiveOrder: boolean;
}

export interface RetailHubCoverageMapBoundary {
  pincode: string;
  count: number;
  polygon: Array<[number, number]>;
}

/** Read-only projection of Bakaloo's existing HQ coverage-map module. */
export interface RetailHubCoverageMap {
  schema: 'epic-bos-retail-hub-coverage-map.v1';
  source: 'bakaloo';
  writeBackAllowed: false;
  observedAt: string;
  /** SHA-256 of the normalized map payload, excluding scope and timestamps. */
  projectionChecksum: string;
  scope: OperatingRecordScope;
  shop: RetailHubCoverageMapShop;
  serviceablePincodes: string[];
  uncoveredPincodes: string[];
  customers: RetailHubCoverageMapCustomer[];
  boundaries: RetailHubCoverageMapBoundary[];
  totalCustomers: number;
}

/**
 * Canonical payload used by both Hub and Electron for map drift detection.
 * Scope and observation time are intentionally excluded: the receiver binds
 * scope locally and records its own observation timestamp.
 */
export function serializeRetailHubCoverageMapProjection(value: Pick<RetailHubCoverageMap, 'shop' | 'serviceablePincodes' | 'uncoveredPincodes' | 'customers' | 'boundaries' | 'totalCustomers'>): string {
  return JSON.stringify({
    shop: value.shop,
    serviceablePincodes: value.serviceablePincodes,
    uncoveredPincodes: value.uncoveredPincodes,
    customers: value.customers,
    boundaries: value.boundaries,
    totalCustomers: value.totalCustomers,
  });
}
