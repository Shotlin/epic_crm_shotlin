import { describe, expect, it } from 'vitest';
import { computeRetailOmnichannelDesk } from './retail-omnichannel-desk';
import type { RetailCommerceConnector, RetailCommerceOrder } from '../shared/retail-commerce-contracts';
import type { SalesOrder, StockReservation } from '../shared/revenue-ops-contracts';

const connector = (channel: RetailCommerceConnector['channel'], id = `${channel}-1`): RetailCommerceConnector => ({
  id, code: channel.toUpperCase(), name: channel, channel, environment: 'sandbox', baseUrl: 'https://channel.example', capabilities: ['order-pull'], credentialStatus: 'configured', status: 'configured', createdBy: 'maker', createdAt: '2026-01-01T00:00:00.000Z', version: 1,
});

const order = (overrides: Partial<RetailCommerceOrder> = {}): RetailCommerceOrder => ({
  id: 'order-1', connectorId: 'marketplace-1', remoteOrderId: 'remote-1', orderNumber: 'MKT-001', status: 'imported', lines: [{ itemVariantId: 'variant-1', quantity: 1, unitPrice: 100, taxableValue: 100, gstRate: 5 }], totalAmount: 105, remoteCreatedAt: '2026-08-01T00:00:00.000Z', remotePayloadChecksum: 'a'.repeat(64), importedBy: 'maker', importedAt: '2026-08-01T00:00:00.000Z', version: 1, ...overrides,
});

const salesOrder = (id = 'sales-1'): SalesOrder => ({
  id, number: 'SO-001', source: 'retail-pos', accountId: 'account-1', currency: 'INR', orderDate: '2026-08-01', requiredBy: '2026-08-02', status: 'confirmed', fulfilmentStatus: 'planned', lines: [], subtotal: 100, discountTotal: 0, taxPreview: { treatment: 'intra-state', taxableValue: 100, cgst: 2.5, sgst: 2.5, igst: 0, cess: 0, totalTax: 5, grandTotal: 105, determination: 'commercial-estimate' }, approvedQuoteVersion: 1, createdBy: 'maker', createdAt: '2026-08-01T00:00:00.000Z', version: 1,
});

const reservation = (status: StockReservation['status']): StockReservation => ({ id: `reservation-${status}`, salesOrderId: 'sales-1', lineId: 'line-1', locationId: 'store-1', productId: 'variant-1', quantity: 1, status, reservedBy: 'maker', reservedAt: '2026-08-01T00:00:00.000Z', version: 1 });

describe('retail omnichannel order desk', () => {
  it('prioritises a provider/local lifecycle conflict above an unreserved order', () => {
    const report = computeRetailOmnichannelDesk({
      connectors: [connector('marketplace'), connector('ondc', 'ondc-1')],
      orders: [
        order({ id: 'conflict', orderNumber: 'MKT-CONFLICT', remoteStatus: 'cancelled' }),
        order({ id: 'unreserved', connectorId: 'ondc-1', orderNumber: 'ONDC-UNRESERVED', status: 'confirmed', localSalesOrderId: 'sales-1' }),
      ],
      salesOrders: [salesOrder()],
      reservations: [],
    });
    expect(report.rows.map(({ orderNumber }) => orderNumber)).toEqual(['MKT-CONFLICT', 'ONDC-UNRESERVED']);
    expect(report.rows[0]).toMatchObject({ severity: 'critical', nextAction: 'Compare provider evidence, then approve a lifecycle conflict decision.' });
    expect(report.summary.byChannel.ondc).toMatchObject({ count: 1, attention: 1, value: 105 });
  });

  it('recognises packed stock and gives a plain-language confirmation next step', () => {
    const report = computeRetailOmnichannelDesk({ connectors: [connector('website')], orders: [order({ connectorId: 'website-1', status: 'confirmed', localSalesOrderId: 'sales-1' })], salesOrders: [salesOrder()], reservations: [reservation('packed')] });
    expect(report.rows[0]).toMatchObject({ reservationCount: 1, reservationReady: true, severity: 'low', nextAction: 'Send the packed order to fulfilment.' });
    expect(report.summary.openOrders).toBe(1);
    expect(report.summary.openValue).toBe(105);
  });

  it('keeps returned/RTO evidence gaps visible and does not count closed orders as open value', () => {
    const report = computeRetailOmnichannelDesk({ connectors: [connector('whatsapp')], orders: [order({ connectorId: 'whatsapp-1', status: 'rto', orderNumber: 'WA-RTO' })] });
    expect(report.rows[0]).toMatchObject({ severity: 'high', nextAction: 'Link the approved return, GST credit note, and inventory receipt.' });
    expect(report.summary.openOrders).toBe(0);
    expect(report.summary.openValue).toBe(0);
  });
});
