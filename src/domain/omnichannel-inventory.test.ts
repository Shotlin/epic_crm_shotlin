/**
 * omnichannel-inventory.test.ts
 *
 * Unit tests for Omnichannel Inventory Truth & Stock Reservation Engine.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAvailableToPromise,
  reserveOmnichannelStock,
  type OmnichannelStockReservationInput,
} from './omnichannel-inventory';

const futureExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();

const mockReservations: OmnichannelStockReservationInput[] = [
  {
    reservationId: 'res-1',
    channel: 'website-ecom',
    itemVariantId: 'var-101',
    warehouseId: 'wh-1',
    binId: 'bin-1',
    quantity: 3,
    reservedAt: new Date().toISOString(),
    expiresAt: futureExpiry,
  },
  {
    reservationId: 'res-2',
    channel: 'ondc-network',
    itemVariantId: 'var-101',
    warehouseId: 'wh-1',
    binId: 'bin-1',
    quantity: 2,
    reservedAt: new Date().toISOString(),
    expiresAt: futureExpiry,
  },
];

describe('omnichannel-inventory domain', () => {
  it('calculates available-to-promise ATP stock correctly', () => {
    const atp = calculateAvailableToPromise('var-101', 'SKU-101', 'Premium Shirt', 10, mockReservations);

    expect(atp.physicalOnHand).toBe(10);
    expect(atp.activeReservationsTotal).toBe(5);
    expect(atp.availableToPromise).toBe(5);
    expect(atp.reservationsByChannel['website-ecom']).toBe(3);
    expect(atp.reservationsByChannel['ondc-network']).toBe(2);
    expect(atp.channelOversellRisk).toBe(false);
  });

  it('reserves stock successfully when ATP is sufficient', () => {
    const result = reserveOmnichannelStock(
      {
        reservationId: 'res-3',
        channel: 'pos-counter',
        itemVariantId: 'var-101',
        warehouseId: 'wh-1',
        binId: 'bin-1',
        quantity: 2,
        reservedAt: new Date().toISOString(),
        expiresAt: futureExpiry,
      },
      10,
      mockReservations,
    );

    expect(result.status).toBe('reserved');
    expect(result.reservedQuantity).toBe(2);
    expect(result.availableToPromiseAfter).toBe(3);
  });

  it('rejects reservation when stock is depleted', () => {
    const result = reserveOmnichannelStock(
      {
        reservationId: 'res-4',
        channel: 'amazon-mws',
        itemVariantId: 'var-101',
        warehouseId: 'wh-1',
        binId: 'bin-1',
        quantity: 10,
        reservedAt: new Date().toISOString(),
        expiresAt: futureExpiry,
      },
      5,
      mockReservations,
    );

    expect(result.status).toBe('stockout-rejected');
    expect(result.reservedQuantity).toBe(0);
    expect(result.rejectionReason).toContain('Stockout');
  });
});
