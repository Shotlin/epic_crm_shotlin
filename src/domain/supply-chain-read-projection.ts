import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';
import type {
  SupplyChainReadAccessDecision,
  SupplyChainReadCollection,
  SupplyChainReadProjection,
} from '../shared/supply-chain-read-projection-contracts';

type ScopedRecord = { scope?: { companyId: string; branchId: string } };

export const SUPPLY_CHAIN_READ_COLLECTIONS = [
  ['stockLocations', 'inventory.execution'], ['stockPositions', 'inventory.execution'],
  ['stockMovements', 'inventory.execution'], ['stockReservations', 'inventory.execution'],
  ['shipmentPackages', 'inventory.execution'], ['shipmentEvents', 'inventory.execution'],
  ['carrierAdapters', 'inventory.execution'], ['returnAuthorizations', 'inventory.execution'],
  ['pincodeServiceabilityRules', 'inventory.execution'], ['deliveryPromises', 'inventory.execution'],
  ['uoms', 'inventory.master'], ['uomConversions', 'inventory.master'],
  ['inventoryItems', 'inventory.master'], ['itemVariants', 'inventory.master'],
  ['warehouses', 'inventory.master'], ['warehouseZones', 'inventory.master'],
  ['storageBins', 'inventory.master'], ['inventoryBatches', 'inventory.execution'],
  ['serialUnits', 'inventory.execution'], ['binBalances', 'inventory.execution'],
  ['inventoryCostLayers', 'inventory.execution'], ['inventoryLedger', 'inventory.execution'],
  ['warehouseTasks', 'inventory.execution'], ['inventoryTransfers', 'inventory.execution'],
  ['cycleCountPlans', 'inventory.execution'], ['reorderPolicies', 'inventory.master'],
  ['reorderProposals', 'inventory.execution'], ['inventoryValuationReviews', 'inventory.execution'],
  ['purchaseRequisitions', 'procurement.requisition'],
  ['suppliers', 'procurement.supplier'], ['requestForQuotations', 'procurement.sourcing'],
  ['supplierQuotations', 'procurement.sourcing'], ['purchaseOrders', 'procurement.purchase-order'],
  ['goodsReceipts', 'procurement.receiving'], ['landedCostAllocations', 'procurement.receiving'],
  ['supplierInvoices', 'procurement.payable'], ['threeWayMatches', 'procurement.payable'],
] as const satisfies ReadonlyArray<readonly [SupplyChainReadCollection, string]>;

type SupplyChainReadSource = Pick<RevenueOpsState, 'scope' | SupplyChainReadCollection>
  | Pick<RevenueOpsSnapshot, 'scope' | SupplyChainReadCollection>;

const SUPPLY_CHAIN_COLLECTION_METRICS: Record<SupplyChainReadCollection, readonly string[]> = {
  stockLocations: [], stockPositions: ['availableStock', 'reservedStock'], stockMovements: [], stockReservations: ['reservedStock'],
  shipmentPackages: ['activeShipments'], shipmentEvents: [], carrierAdapters: [], returnAuthorizations: [],
  pincodeServiceabilityRules: [], deliveryPromises: [],
  uoms: [], uomConversions: [], inventoryItems: [], itemVariants: [], warehouses: [], warehouseZones: [], storageBins: [],
  inventoryBatches: ['expiringQuantity'], serialUnits: [], binBalances: ['inventoryValue', 'expiringQuantity'],
  inventoryCostLayers: ['inventoryValue'], inventoryLedger: [], warehouseTasks: ['warehouseTaskBacklog'],
  inventoryTransfers: [], cycleCountPlans: ['countVariance'], reorderPolicies: [], reorderProposals: ['reorderAlerts'],
  inventoryValuationReviews: ['inventoryValue'], purchaseRequisitions: ['requisitionsAwaitingApproval'],
  suppliers: ['supplierQualificationPending'],
  requestForQuotations: ['rfqInMarket'], supplierQuotations: [], purchaseOrders: ['purchaseOrderCommitment'],
  goodsReceipts: ['receiptAwaitingCost'], landedCostAllocations: [], supplierInvoices: [],
  threeWayMatches: ['threeWayVariance'],
};

const SUPPLY_CHAIN_FIELD_METRICS: Record<string, readonly string[]> = {
  'inventory.execution.available': ['availableStock'],
  'inventory.execution.reserved': ['reservedStock'],
  'inventory.execution.inventoryValue': ['inventoryValue'],
  'inventory.execution.unitCost': ['inventoryValue'],
  'procurement.purchase-order.totalAmount': ['purchaseOrderCommitment'],
};

function isInScope(record: ScopedRecord, scope: SupplyChainReadSource['scope']): boolean {
  return record.scope?.companyId === scope.companyId && record.scope?.branchId === scope.branchId;
}

function redact<T extends object>(record: T, fields: readonly string[]): T {
  const copy = { ...record } as Record<string, unknown>;
  for (const field of fields) delete copy[field];
  return copy as T;
}

export function createSupplyChainReadProjection(
  state: SupplyChainReadSource,
  getDecision: (resource: string) => SupplyChainReadAccessDecision,
  generatedAt = new Date().toISOString(),
): SupplyChainReadProjection {
  const projected = {} as Record<SupplyChainReadCollection, unknown[]>;
  const hiddenCollections: string[] = [];
  const redactedFields: Record<string, string[]> = {};
  const redactedMetrics: string[] = [];
  const stateRecord = state as unknown as Record<SupplyChainReadCollection, ScopedRecord[]>;

  for (const [collection, resource] of SUPPLY_CHAIN_READ_COLLECTIONS) {
    const decision = getDecision(resource);
    if (!decision.allowed) {
      projected[collection] = [];
      hiddenCollections.push(collection);
      redactedMetrics.push(...SUPPLY_CHAIN_COLLECTION_METRICS[collection]);
      continue;
    }
    if (decision.deniedFields.length) {
      redactedFields[resource] = [...decision.deniedFields];
      for (const field of decision.deniedFields) redactedMetrics.push(...(SUPPLY_CHAIN_FIELD_METRICS[`${resource}.${field}`] ?? []));
    }
    projected[collection] = stateRecord[collection]
      .filter((record) => isInScope(record, state.scope))
      .map((record) => redact(record, decision.deniedFields));
  }

  return {
    scope: structuredClone(state.scope), generatedAt, hiddenCollections, redactedFields,
    redactedMetrics: [...new Set(redactedMetrics)],
    ...projected,
  } as SupplyChainReadProjection;
}
