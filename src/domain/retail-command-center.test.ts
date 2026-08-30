/**
 * retail-command-center.test.ts
 *
 * Unit tests for Retail Command Center domain engine.
 * Uses createInitialRevenueOpsState() as the base to satisfy all required fields,
 * then spreads targeted overrides for the data under test.
 */

import { describe, it, expect } from 'vitest';
import { computeRetailCommandCenter } from './retail-command-center';
import { createInitialRevenueOpsState } from './revenue-ops';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { RetailCounter, RetailCashierShift, RetailSale, RetailTender } from '../shared/retail-pos-contracts';
import type { RetailCommerceConnector, RetailCommerceOrder } from '../shared/retail-commerce-contracts';
import type { BinBalance } from '../shared/inventory-contracts';

const tender: RetailTender = { id: 'tend-1', method: 'cash', amount: 1180, reference: 'CASH' };

const counter: RetailCounter = {
  id: 'cntr-1',
  code: 'POS-01',
  name: 'Main Counter',
  warehouseId: 'wh-1',
  sellFromBinId: 'bin-1',
  priceListId: 'pl-1',
  paymentTermId: 'pt-1',
  walkInAccountId: 'acc-1',
  active: true,
  version: 1,
};

const shift: RetailCashierShift = {
  id: 'shift-1',
  number: 'SHF-001',
  counterId: 'cntr-1',
  cashierId: 'user-1',
  status: 'open',
  openingCash: 1000,
  openedAt: '2025-01-01T00:00:00Z',
  version: 1,
};

const sale: RetailSale = {
  id: 'sale-1',
  number: 'RET-001',
  counterId: 'cntr-1',
  cashierShiftId: 'shift-1',
  cashierId: 'user-1',
  customerAccountId: 'acc-1',
  transactionKey: 'pos-key-1',
  requestChecksum: 'chk-1',
  saleAt: '2025-01-01T10:00:00Z',
  invoiceId: 'inv-1',
  paymentReceiptIds: [],
  lines: [],
  subtotal: 1000,
  discountTotal: 0,
  taxPreview: {
    treatment: 'intra-state',
    taxableValue: 1000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    cess: 0,
    totalTax: 180,
    grandTotal: 1180,
    determination: 'commercial-estimate',
  },
  tenders: [tender],
  costTotal: 700,
  status: 'completed',
  version: 1,
};

const binBalance: BinBalance = {
  id: 'bb-1',
  binId: 'bin-1',
  itemVariantId: 'var-1',
  batchId: 'b1',
  quantity: 0,
  reserved: 0,
  picked: 0,
  available: 0, // stockout
  unitCost: 100,
  inventoryValue: 0,
  version: 1,
};

function mockState(): RevenueOpsState {
  const base = createInitialRevenueOpsState();
  return {
    ...base,
    retailCounters: [counter],
    retailCashierShifts: [shift],
    retailSales: [sale],
    binBalances: [binBalance],
  };
}

describe('retail-command-center domain', () => {
  it('computes store performance and aggregate gross profit accurately', () => {
    const cc = computeRetailCommandCenter(mockState());

    expect(cc.aggregateGrossSales).toBe(1180);
    expect(cc.aggregateNetProfit).toBe(480); // 1180 - 700
    expect(cc.overallMarginPct).toBeGreaterThan(40);
    expect(cc.activeCashierShiftsCount).toBe(1);
    expect(cc.storePerformance).toHaveLength(1);
    expect(cc.storePerformance[0]?.grossSalesAmount).toBe(1180);
  });

  it('detects stockouts and generates attention items', () => {
    const cc = computeRetailCommandCenter(mockState());

    expect(cc.totalStockoutCount).toBe(1);
    expect(cc.attentionItems.some((item) => item.includes('out of stock'))).toBe(true);
  });

  it('counts each unavailable variant once even when it has several empty bin balances', () => {
    const state = mockState();
    state.binBalances = [
      binBalance,
      { ...binBalance, id: 'bb-2', binId: 'bin-2' },
      { ...binBalance, id: 'bb-3', binId: 'bin-3', itemVariantId: 'var-2' },
    ];

    const cc = computeRetailCommandCenter(state);

    expect(cc.totalStockoutCount).toBe(2);
    expect(cc.attentionItems).toContain('2 items are out of stock at a counter bin.');
  });

  it('surfaces the governed online order queue and its INR exposure', () => {
    const state = mockState();
    const connector: RetailCommerceConnector = { id: 'marketplace-1', code: 'MKT-1', name: 'Marketplace', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://marketplace.example', capabilities: ['order-pull'], credentialStatus: 'configured', status: 'configured', createdBy: 'operator-1', createdAt: '2025-01-01T00:00:00Z', version: 1 };
    state.retailCommerceConnectors = [connector];
    const order = (status: RetailCommerceOrder['status'], totalAmount: number, id: string): RetailCommerceOrder => ({
      id,
      connectorId: 'marketplace-1',
      remoteOrderId: `REMOTE-${id}`,
      orderNumber: `ONLINE-${id}`,
      status,
      lines: [],
      totalAmount,
      remoteCreatedAt: '2025-01-01T10:00:00Z',
      remotePayloadChecksum: 'a'.repeat(64),
      importedBy: 'operator-1',
      importedAt: '2025-01-01T10:01:00Z',
      version: 1,
    });
    state.retailCommerceOrders = [order('imported', 1180, 'one'), order('confirmed', 590, 'two'), order('fulfilled', 250, 'three')];

    const cc = computeRetailCommandCenter(state);

    expect(cc.onlinePendingOrdersCount).toBe(2);
    expect(cc.onlinePendingOrderValue).toBe(1770);
    expect(cc.channelPendingOrders.marketplace).toEqual({ count: 2, value: 1770 });
    expect(cc.channelPendingOrders.whatsapp).toEqual({ count: 0, value: 0 });
    expect(cc.attentionItems.some((item) => item.includes('online order'))).toBe(true);
  });

  it('does not invent cost or profit when a completed sale has no cost evidence', () => {
    const state = mockState();
    const saleWithoutCost = { ...sale } as RetailSale;
    Reflect.deleteProperty(saleWithoutCost, 'costTotal');
    state.retailSales = [saleWithoutCost];

    const cc = computeRetailCommandCenter(state);

    expect(cc.aggregateNetProfit).toBe(0);
    expect(cc.overallMarginPct).toBe(0);
    expect(cc.profitCostCoveragePct).toBe(0);
  });

  it('prioritises cash, margin, stock and omnichannel risks in one deterministic queue', () => {
    const state = mockState();
    state.retailCashierShifts = [{ ...shift, status: 'close-requested', variance: -2500 }];
    state.retailSales = [{ ...sale, costTotal: 1100 }];
    const connector: RetailCommerceConnector = { id: 'website-1', code: 'WEB-1', name: 'Website', channel: 'website', environment: 'sandbox', baseUrl: 'https://website.example', capabilities: ['order-pull'], credentialStatus: 'configured', status: 'configured', createdBy: 'operator-1', createdAt: '2025-01-01T00:00:00Z', version: 1 };
    state.retailCommerceConnectors = [connector];
    state.retailCommerceOrders = [{ id: 'online-1', connectorId: connector.id, remoteOrderId: 'REMOTE-1', orderNumber: 'ONLINE-1', status: 'imported', lines: [], totalAmount: 850, remoteCreatedAt: '2025-01-01T10:00:00Z', remotePayloadChecksum: 'b'.repeat(64), importedBy: 'operator-1', importedAt: '2025-01-01T10:01:00Z', version: 1 }];

    const cc = computeRetailCommandCenter(state);

    expect(cc.attentionQueue.map((item) => item.kind)).toEqual(['cash-variance', 'margin-erosion', 'stockout', 'omnichannel']);
    expect(cc.attentionQueue[0]).toMatchObject({ severity: 'critical', amount: 2500, action: expect.stringContaining('variance') });
    expect(cc.attentionQueue[1]).toMatchObject({ severity: 'critical', amount: 200, action: expect.stringContaining('margin') });
    expect(cc.attentionQueue[3]).toMatchObject({ amount: 850, count: 1 });
  });

  it('only counts released batches with valid India business-date evidence inside the explicit risk window', () => {
    const state = mockState();
    state.inventoryBatches = [
      { id: 'batch-near', itemVariantId: 'var-1', batchNumber: 'NEAR', status: 'released', expiresAt: '2026-08-31', version: 1 },
      { id: 'batch-expired', itemVariantId: 'var-1', batchNumber: 'OLD', status: 'released', expiresAt: '2026-08-01', version: 1 },
      { id: 'batch-invalid', itemVariantId: 'var-1', batchNumber: 'BAD', status: 'released', expiresAt: '2026-02-31', version: 1 },
      { id: 'batch-future', itemVariantId: 'var-1', batchNumber: 'FAR', status: 'released', expiresAt: '2026-10-01', version: 1 },
      { id: 'batch-held', itemVariantId: 'var-1', batchNumber: 'HOLD', status: 'quarantine', expiresAt: '2026-08-31', version: 1 },
    ];

    const cc = computeRetailCommandCenter(state, 'Today', new Date('2026-08-15T10:00:00.000Z'));

    expect(cc.totalExpiryRiskItemsCount).toBe(1);
    expect(cc.attentionItems).toContain('1 released batch expires within 30 days.');
  });
});
