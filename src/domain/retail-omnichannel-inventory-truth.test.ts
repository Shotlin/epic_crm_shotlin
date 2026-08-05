import { describe, expect, it } from 'vitest';
import { computeRetailOmnichannelInventoryTruth } from './retail-omnichannel-inventory-truth';

describe('computeRetailOmnichannelInventoryTruth', () => {
  it('separates covered, short, and unmapped channel demand without writing stock', () => {
    const report = computeRetailOmnichannelInventoryTruth({
      connectors: [{ id: 'connector-1', channel: 'website', code: 'WEB' } as never],
      variants: [{ id: 'variant-covered', name: 'Rice 5kg', sku: 'RICE-5', active: true } as never],
      balances: [{ id: 'balance-1', itemVariantId: 'variant-covered', available: 5 } as never],
      orders: [
        { id: 'order-1', connectorId: 'connector-1', orderNumber: 'WEB-1', status: 'confirmed', lines: [{ itemVariantId: 'variant-covered', quantity: 3 }], inventoryReservationIds: [], totalAmount: 600, remoteCreatedAt: '2026-08-04T08:00:00Z' } as never,
        { id: 'order-2', connectorId: 'connector-1', orderNumber: 'WEB-2', status: 'imported', lines: [{ itemVariantId: 'variant-covered', quantity: 4 }, { itemVariantId: 'remote-unknown', quantity: 1 }], totalAmount: 900, remoteCreatedAt: '2026-08-04T08:01:00Z' } as never,
      ],
    });
    expect(report.summary).toMatchObject({ openOrders: 2, demandUnits: 8, unreservedDemandUnits: 8, shortageUnits: 3, atRiskVariants: 2 });
    expect(report.rows.find((row) => row.itemVariantId === 'variant-covered')).toMatchObject({ risk: 'short', shortageUnits: 2 });
    expect(report.rows.find((row) => row.itemVariantId === 'remote-unknown')).toMatchObject({ risk: 'unmapped', shortageUnits: 1 });
  });

  it('does not count a locally reserved order as unreserved demand', () => {
    const report = computeRetailOmnichannelInventoryTruth({ connectors: [], variants: [{ id: 'variant-1', name: 'Soap', sku: 'SOAP-1', active: true } as never], balances: [{ id: 'balance-1', itemVariantId: 'variant-1', available: 0 } as never], orders: [{ id: 'order-1', connectorId: 'missing', orderNumber: 'WEB-1', status: 'confirmed', inventoryReservationIds: ['reservation-1'], lines: [{ itemVariantId: 'variant-1', quantity: 2 }], totalAmount: 200, remoteCreatedAt: '2026-08-04T08:00:00Z' } as never] });
    expect(report.summary).toMatchObject({ demandUnits: 2, unreservedDemandUnits: 0, shortageUnits: 0, atRiskVariants: 0 });
  });
});
