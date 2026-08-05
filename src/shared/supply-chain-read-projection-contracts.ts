import type { OperatingRecordScope, RevenueOpsSnapshot } from './revenue-ops-contracts';

export interface SupplyChainReadAccessDecision {
  allowed: boolean;
  deniedFields: string[];
}

export const SUPPLY_CHAIN_READ_COLLECTION_NAMES = [
  'stockLocations', 'stockPositions', 'stockMovements', 'stockReservations',
  'shipmentPackages', 'shipmentEvents', 'carrierAdapters', 'returnAuthorizations',
  'pincodeServiceabilityRules', 'deliveryPromises',
  'uoms', 'uomConversions', 'inventoryItems', 'itemVariants', 'warehouses',
  'warehouseZones', 'storageBins', 'inventoryBatches', 'serialUnits', 'binBalances',
  'inventoryCostLayers', 'inventoryLedger', 'warehouseTasks', 'inventoryTransfers',
  'cycleCountPlans', 'reorderPolicies', 'reorderProposals', 'inventoryValuationReviews',
  'purchaseRequisitions',
  'suppliers', 'requestForQuotations', 'supplierQuotations', 'purchaseOrders',
  'goodsReceipts', 'landedCostAllocations', 'supplierInvoices', 'threeWayMatches',
] as const;

export type SupplyChainReadCollection = typeof SUPPLY_CHAIN_READ_COLLECTION_NAMES[number];

export type SupplyChainReadProjection = {
  scope: OperatingRecordScope;
  generatedAt: string;
  hiddenCollections: string[];
  redactedFields: Record<string, string[]>;
  redactedMetrics: string[];
} & Pick<RevenueOpsSnapshot, SupplyChainReadCollection>;
