import type {
  AssetCapitalization,
  AssetCustodyTransfer,
  AssetComponentization,
  AssetComponentAllocation,
  AssetTransferAccounting,
  AssetSaleDisposal,
  AssetImpairmentReview,
  AssetRevaluation,
  AssetWarranty,
  AssetAmcContract,
  AssetMeter,
  AssetMeterReading,
  CorrectiveMaintenanceRequest,
  AssetCalibrationRecord,
  AssetSparePart,
  AssetSpareIssue,
  FleetVehicle,
  FleetTrip,
  AssetInstalledBaseEvent,
  AssetDepreciationPolicy,
  AssetDepreciationRun,
  AssetRetirement,
  AssetCategory,
  ManagedAsset,
  MaintenanceWorkOrder,
  PreventiveMaintenancePlan,
} from './assets-maintenance-contracts';
import type { OperatingRecordScope } from './revenue-ops-contracts';

export const ASSET_MAINTENANCE_READ_COLLECTION_NAMES = [
  'assetCategories',
  'managedAssets',
  'assetCapitalizations',
  'assetDepreciationPolicies',
  'assetDepreciationRuns',
  'assetRetirements',
  'assetCustodyTransfers',
  'assetComponentizations',
  'assetComponentAllocations',
  'assetTransferAccountings',
  'assetSaleDisposals',
  'assetImpairmentReviews',
  'assetRevaluations',
  'assetWarranties',
  'assetAmcContracts',
  'assetMeters',
  'assetMeterReadings',
  'correctiveMaintenanceRequests',
  'assetCalibrations',
  'assetSpareParts',
  'assetSpareIssues',
  'fleetVehicles',
  'fleetTrips',
  'assetInstalledBaseEvents',
  'preventiveMaintenancePlans',
  'maintenanceWorkOrders',
] as const;

export interface AssetMaintenanceReadAccessDecision {
  allowed: boolean;
  deniedFields: string[];
}

/**
 * The installed-asset register has finance-owned identity fields while
 * maintenance plans and work evidence are operated separately. A snapshot
 * must therefore filter each collection independently rather than treating
 * the Operations shell as blanket access to asset custody data.
 */
export interface AssetMaintenanceReadProjection {
  scope: OperatingRecordScope;
  generatedAt: string;
  hiddenCollections: string[];
  redactedFields: Record<string, string[]>;
  redactedMetrics: string[];
  assetCategories: AssetCategory[];
  managedAssets: ManagedAsset[];
  assetCapitalizations: AssetCapitalization[];
  assetDepreciationPolicies: AssetDepreciationPolicy[];
  assetDepreciationRuns: AssetDepreciationRun[];
  assetRetirements: AssetRetirement[];
  assetCustodyTransfers: AssetCustodyTransfer[];
  assetComponentizations: AssetComponentization[];
  assetComponentAllocations: AssetComponentAllocation[];
  assetTransferAccountings: AssetTransferAccounting[];
  assetSaleDisposals: AssetSaleDisposal[];
  assetImpairmentReviews: AssetImpairmentReview[];
  assetRevaluations: AssetRevaluation[];
  assetWarranties: AssetWarranty[];
  assetAmcContracts: AssetAmcContract[];
  assetMeters: AssetMeter[];
  assetMeterReadings: AssetMeterReading[];
  correctiveMaintenanceRequests: CorrectiveMaintenanceRequest[];
  assetCalibrations: AssetCalibrationRecord[];
  assetSpareParts: AssetSparePart[];
  assetSpareIssues: AssetSpareIssue[];
  fleetVehicles: FleetVehicle[];
  fleetTrips: FleetTrip[];
  assetInstalledBaseEvents: AssetInstalledBaseEvent[];
  preventiveMaintenancePlans: PreventiveMaintenancePlan[];
  maintenanceWorkOrders: MaintenanceWorkOrder[];
}
