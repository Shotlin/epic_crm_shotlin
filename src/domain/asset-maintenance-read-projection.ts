import type {
  RevenueOpsSnapshot,
  RevenueOpsState,
} from '../shared/revenue-ops-contracts';
import type {
  AssetMaintenanceReadAccessDecision,
  AssetMaintenanceReadProjection,
} from '../shared/asset-maintenance-read-projection-contracts';

export const ASSET_MAINTENANCE_READ_COLLECTIONS = [
  ['assetCategories', 'finance.asset-category'],
  ['managedAssets', 'finance.asset-register'],
  ['assetCapitalizations', 'finance.asset-capitalization'],
  ['assetDepreciationPolicies', 'finance.asset-depreciation-policy'],
  ['assetDepreciationRuns', 'finance.asset-depreciation-run'],
  ['assetRetirements', 'finance.asset-retirement'],
  ['assetCustodyTransfers', 'maintenance.asset-transfer'],
  ['assetComponentizations', 'maintenance.asset-componentization'],
  ['assetComponentAllocations', 'finance.asset-component-allocation'],
  ['assetTransferAccountings', 'finance.asset-transfer-accounting'],
  ['assetSaleDisposals', 'finance.asset-sale-disposal'],
  ['assetImpairmentReviews', 'finance.asset-impairment'],
  ['assetRevaluations', 'finance.asset-revaluation'],
  ['assetWarranties', 'maintenance.asset-warranty'],
  ['assetAmcContracts', 'maintenance.asset-amc'],
  ['assetMeters', 'maintenance.asset-meter'],
  ['assetMeterReadings', 'maintenance.asset-meter-reading'],
  ['correctiveMaintenanceRequests', 'maintenance.corrective'],
  ['assetCalibrations', 'maintenance.calibration'],
  ['assetSpareParts', 'maintenance.asset-spare'],
  ['assetSpareIssues', 'maintenance.asset-spare-issue'],
  ['fleetVehicles', 'maintenance.fleet-vehicle'],
  ['fleetTrips', 'maintenance.fleet-trip'],
  ['assetInstalledBaseEvents', 'maintenance.installed-base-history'],
  ['preventiveMaintenancePlans', 'maintenance.plan'],
  ['maintenanceWorkOrders', 'maintenance.work-order'],
] as const;

type AssetMaintenanceCollection = typeof ASSET_MAINTENANCE_READ_COLLECTIONS[number][0];
type AssetMaintenanceReadSource = Pick<RevenueOpsState, 'scope' | AssetMaintenanceCollection>
  | Pick<RevenueOpsSnapshot, 'scope' | AssetMaintenanceCollection>;
type ScopedRecord = { scope?: { companyId: string; branchId: string } };

function isInScope(record: ScopedRecord, scope: AssetMaintenanceReadSource['scope']): boolean {
  return record.scope?.companyId === scope.companyId && record.scope?.branchId === scope.branchId;
}

function redact<T extends object>(record: T, fields: readonly string[]): T {
  const copy = { ...record } as Record<string, unknown>;
  for (const field of fields) delete copy[field];
  return copy as T;
}

export function createAssetMaintenanceReadProjection(
  state: AssetMaintenanceReadSource,
  getDecision: (resource: string) => AssetMaintenanceReadAccessDecision,
  generatedAt = new Date().toISOString(),
): AssetMaintenanceReadProjection {
  const projected = {} as Record<AssetMaintenanceCollection, unknown[]>;
  const hiddenCollections: string[] = [];
  const redactedFields: Record<string, string[]> = {};
  const stateRecord = state as unknown as Record<AssetMaintenanceCollection, ScopedRecord[]>;

  for (const [collection, resource] of ASSET_MAINTENANCE_READ_COLLECTIONS) {
    const decision = getDecision(resource);
    if (!decision.allowed) {
      projected[collection] = [];
      hiddenCollections.push(collection);
      continue;
    }
    if (decision.deniedFields.length) redactedFields[resource] = [...decision.deniedFields];
    projected[collection] = stateRecord[collection]
      .filter((record) => isInScope(record, state.scope))
      .map((record) => redact(record, decision.deniedFields));
  }

  return {
    scope: structuredClone(state.scope),
    generatedAt,
    hiddenCollections,
    redactedFields,
    redactedMetrics: [],
    assetCategories: projected.assetCategories as AssetMaintenanceReadProjection['assetCategories'],
    managedAssets: projected.managedAssets as AssetMaintenanceReadProjection['managedAssets'],
    assetCapitalizations: projected.assetCapitalizations as AssetMaintenanceReadProjection['assetCapitalizations'],
    assetDepreciationPolicies: projected.assetDepreciationPolicies as AssetMaintenanceReadProjection['assetDepreciationPolicies'],
    assetDepreciationRuns: projected.assetDepreciationRuns as AssetMaintenanceReadProjection['assetDepreciationRuns'],
    assetRetirements: projected.assetRetirements as AssetMaintenanceReadProjection['assetRetirements'],
    assetCustodyTransfers: projected.assetCustodyTransfers as AssetMaintenanceReadProjection['assetCustodyTransfers'],
    assetComponentizations: projected.assetComponentizations as AssetMaintenanceReadProjection['assetComponentizations'],
    assetComponentAllocations: projected.assetComponentAllocations as AssetMaintenanceReadProjection['assetComponentAllocations'],
    assetTransferAccountings: projected.assetTransferAccountings as AssetMaintenanceReadProjection['assetTransferAccountings'],
    assetSaleDisposals: projected.assetSaleDisposals as AssetMaintenanceReadProjection['assetSaleDisposals'],
    assetImpairmentReviews: projected.assetImpairmentReviews as AssetMaintenanceReadProjection['assetImpairmentReviews'],
    assetRevaluations: projected.assetRevaluations as AssetMaintenanceReadProjection['assetRevaluations'],
    assetWarranties: projected.assetWarranties as AssetMaintenanceReadProjection['assetWarranties'],
    assetAmcContracts: projected.assetAmcContracts as AssetMaintenanceReadProjection['assetAmcContracts'],
    assetMeters: projected.assetMeters as AssetMaintenanceReadProjection['assetMeters'],
    assetMeterReadings: projected.assetMeterReadings as AssetMaintenanceReadProjection['assetMeterReadings'],
    correctiveMaintenanceRequests: projected.correctiveMaintenanceRequests as AssetMaintenanceReadProjection['correctiveMaintenanceRequests'],
    assetCalibrations: projected.assetCalibrations as AssetMaintenanceReadProjection['assetCalibrations'],
    assetSpareParts: projected.assetSpareParts as AssetMaintenanceReadProjection['assetSpareParts'],
    assetSpareIssues: projected.assetSpareIssues as AssetMaintenanceReadProjection['assetSpareIssues'],
    fleetVehicles: projected.fleetVehicles as AssetMaintenanceReadProjection['fleetVehicles'],
    fleetTrips: projected.fleetTrips as AssetMaintenanceReadProjection['fleetTrips'],
    assetInstalledBaseEvents: projected.assetInstalledBaseEvents as AssetMaintenanceReadProjection['assetInstalledBaseEvents'],
    preventiveMaintenancePlans: projected.preventiveMaintenancePlans as AssetMaintenanceReadProjection['preventiveMaintenancePlans'],
    maintenanceWorkOrders: projected.maintenanceWorkOrders as AssetMaintenanceReadProjection['maintenanceWorkOrders'],
  };
}
