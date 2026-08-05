import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createInventoryItem, createItemVariant, createStorageBin, createWarehouse, createWarehouseZone, receiveInventory } from './inventory-warehouse';
import { createRetailInterBranchTransfer, decideRetailInterBranchTransfer, dispatchRetailInterBranchTransfer, receiveRetailInterBranchTransfer } from './retail-interbranch';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

function fixture(): RevenueOpsState {
  let state = createInitialRevenueOpsState();
  state.products = state.products.map((product) => product.id === 'product-distributor-platform' ? { ...product, kind: 'goods', uom: 'UNIT' } : product);
  state.stockLocations = [{ id: 'loc-a', code: 'A', name: 'Branch A', stateCode: '27', active: true, version: 1 }, { id: 'loc-b', code: 'B', name: 'Branch B', stateCode: '29', active: true, version: 1 }];
  state = createInventoryItem(state, { productId: 'product-distributor-platform', code: 'SKU-A', name: 'Branch item', baseUomId: 'uom-unit', tracking: 'batch', valuationMethod: 'fifo', shelfLifeDays: 365 }, 'item-a');
  state = createItemVariant(state, { itemId: 'item-a', sku: 'BRANCH-ITEM', name: 'Branch item', attributes: {}, barcode: '890000000099' }, 'variant-a');
  state = createWarehouse(state, { code: 'A-DC', name: 'Branch A DC', stateCode: '27', stockLocationId: 'loc-a' }, 'wh-a');
  state = createWarehouse(state, { code: 'B-DC', name: 'Branch B DC', stateCode: '29', stockLocationId: 'loc-b' }, 'wh-b');
  state = createWarehouseZone(state, { warehouseId: 'wh-a', code: 'RCV', name: 'A receiving', purpose: 'receiving' }, 'zone-a');
  state = createWarehouseZone(state, { warehouseId: 'wh-b', code: 'RCV', name: 'B receiving', purpose: 'receiving' }, 'zone-b');
  state = createStorageBin(state, { zoneId: 'zone-a', code: 'A-RCV', name: 'A dock', capacity: 100, pickSequence: 1 }, 'bin-a');
  state = createStorageBin(state, { zoneId: 'zone-b', code: 'B-RCV', name: 'B dock', capacity: 100, pickSequence: 1 }, 'bin-b');
  return receiveInventory(state, { warehouseId: 'wh-a', receivingBinId: 'bin-a', itemVariantId: 'variant-a', quantity: 10, uomId: 'uom-unit', unitCost: 50, reference: 'GRN-A', receivedAt: '2026-07-15T08:00:00.000Z', batchNumber: 'B-A', expiresAt: '2027-07-15', serialNumbers: [] }, 'user-avery', '2026-07-15T08:00:00.000Z');
}

describe('retail inter-branch transfer custody', () => {
  it('requires independent approval, dispatch, and destination arrival verification with balanced journals', () => {
    let state = fixture();
    const transferId = '00000000-0000-4000-8000-000000000001';
    state = createRetailInterBranchTransfer(state, { direction: 'outbound', destinationBranchId: 'branch-bengaluru', sourceWarehouseId: 'wh-a', destinationWarehouseId: 'wh-b', sourceBinId: 'bin-a', destinationBinId: 'bin-b', lines: [{ itemVariantId: 'variant-a', batchId: state.inventoryBatches[0]!.id, serialUnitIds: [], quantity: 4 }] }, 'user-avery', transferId, '2026-07-15T09:00:00.000Z');
    expect(() => decideRetailInterBranchTransfer(state, { id: transferId, decision: 'approved', evidenceReference: 'same maker', expectedVersion: 1 }, 'user-avery')).toThrow('independent');
    state = decideRetailInterBranchTransfer(state, { id: transferId, decision: 'approved', evidenceReference: 'signed manifest plan', expectedVersion: 1 }, 'user-priya');
    state = dispatchRetailInterBranchTransfer(state, { id: transferId, evidenceReference: 'dispatch scan DS-1', expectedVersion: 2 }, 'user-lee');
    expect(state.retailInterBranchTransfers[0]).toMatchObject({ status: 'dispatched', dispatchJournalDraftId: expect.any(String) });
    expect(state.binBalances.find((balance) => balance.binId === 'bin-a')).toMatchObject({ quantity: 6, available: 6 });
    state = receiveRetailInterBranchTransfer(state, { id: transferId, evidenceReference: 'arrival count AR-1', expectedVersion: 3 }, 'user-priya');
    expect(state.retailInterBranchTransfers[0]).toMatchObject({ status: 'arrived', arrivalJournalDraftId: expect.any(String) });
    expect(state.binBalances.find((balance) => balance.binId === 'bin-b')).toMatchObject({ quantity: 4, inventoryValue: 200 });
    expect(state.journalDrafts.filter((draft) => draft.sourceType === 'retail-inter-branch-transfer')).toHaveLength(2);
    expect(state.journalDrafts.every((draft) => draft.totalDebit === draft.totalCredit)).toBe(true);
  });
});
