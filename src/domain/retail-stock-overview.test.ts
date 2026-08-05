import { describe, expect, it } from 'vitest';
import { computeRetailStockOverview } from './retail-stock-overview';

describe('computeRetailStockOverview', () => {
  it('prioritises expired stock and proposed replenishment from governed records', () => {
    const report = computeRetailStockOverview({
      variants: [{ id: 'v-1', itemId: 'i-1', sku: 'RICE-5', name: 'Rice 5 kg', attributes: {}, active: true, version: 1 }],
      balances: [{ id: 'b-1', binId: 'bin-1', itemVariantId: 'v-1', quantity: 4, reserved: 1, picked: 0, available: 3, unitCost: 55, inventoryValue: 165, version: 1 }],
      policies: [{ id: 'p-1', itemVariantId: 'v-1', warehouseId: 'w-1', minimumQuantity: 2, reorderPoint: 5, maximumQuantity: 20, safetyStock: 2, leadTimeDays: 3, active: true, version: 1 }],
      proposals: [{ id: 'rp-1', policyId: 'p-1', availableQuantity: 3, recommendedQuantity: 17, requiredBy: '2026-08-05', reason: 'Below reorder point', status: 'proposed', generatedAt: '2026-08-03', version: 1 }],
      batches: [{ id: 'batch-1', itemVariantId: 'v-1', batchNumber: 'B-1', status: 'expired', version: 1 }],
      tasks: [],
    });
    expect(report.rows[0]).toMatchObject({ label: 'Rice 5 kg', availableQuantity: 3, reservedQuantity: 1, risk: 'expired', expiredBatchCount: 1 });
    expect(report.summary).toMatchObject({ variants: 1, availableUnits: 3, expiredBatchCount: 1 });
  });

  it('stays empty when there is no local stock evidence', () => {
    const report = computeRetailStockOverview({ variants: [], balances: [], policies: [], proposals: [], batches: [], tasks: [] });
    expect(report.rows).toEqual([]);
    expect(report.summary.availableUnits).toBe(0);
  });
});
