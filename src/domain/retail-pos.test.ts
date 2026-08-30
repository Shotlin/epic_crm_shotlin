import { describe, expect, it } from 'vitest';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { CheckoutRetailSaleInput } from '../shared/retail-pos-contracts';
import {
  createInventoryItem,
  createItemVariant,
  createPutawayTask,
  createStorageBin,
  createWarehouse,
  createWarehouseZone,
  receiveInventory,
  transitionWarehouseTask,
} from './inventory-warehouse';
import { createRetailProductCombo } from './retail-catalog';
import { enqueueRetailOfflineSale, syncRetailOfflineSale } from './retail-offline-sync';
import {
  checkoutRetailSale,
  createRetailCounter,
  decideRetailCashierShiftClose,
  decideRetailCashierShiftVarianceResolution,
  openRetailCashierShift,
  priceRetailReplacementLines,
  requestRetailCashierShiftClose,
  requestRetailCashierShiftVarianceResolution,
} from './retail-pos';
import { createInitialRevenueOpsState } from './revenue-ops';

const RECEIVED_AT = '2026-07-15T08:00:00.000Z';
const SHIFT_OPENED_AT = '2026-07-15T09:00:00.000Z';
const SALE_AT = '2026-07-15T09:15:00.000Z';

interface ReadyCounter {
  state: RevenueOpsState;
  counterId: string;
  shiftId: string;
  batchId: string;
}

/**
 * Builds a real, valued and traceable counter-bin. The retail seam is then
 * exercised from the public counter/shift/checkout functions rather than by
 * hand-authoring a misleading sale or stock record.
 */
function retailFoundation(): RevenueOpsState {
  let state = createInitialRevenueOpsState();
  state = {
    ...state,
    profile: { ...state.profile, gstRegistered: true, gstin: '27ABCDE1234F1Z5' },
    products: state.products.map((product) => product.id === 'product-distributor-platform'
      ? {
        ...product,
        sku: 'RETAIL-TEA',
        name: 'Premium retail tea',
        description: 'GST-ready retail goods.',
        kind: 'goods' as const,
        uom: 'UNIT',
        taxCodeId: 'tax-hsn-retail-tea',
        effectiveFrom: '2020-04-01',
      }
      : product),
    taxCodes: [{
      id: 'tax-hsn-retail-tea',
      code: '0902',
      kind: 'HSN' as const,
      description: 'Tea for in-store retail sale.',
      gstRate: 18,
      cessRate: 0,
      effectiveFrom: '2020-04-01',
      sourceLabel: 'GST HSN catalogue',
      sourceUrl: 'https://www.gst.gov.in/',
      reviewStatus: 'verified' as const,
      scope: structuredClone(state.scope),
      version: 1,
    }],
    priceLists: [{
      id: 'price-list-store-retail',
      code: 'STORE-RETAIL',
      name: 'Store retail price list',
      currency: 'INR' as const,
      channel: 'retail' as const,
      effectiveFrom: '2020-04-01',
      effectiveTo: '2099-03-31',
      status: 'active' as const,
      active: true,
      activatedBy: 'catalogue-owner',
      activatedAt: RECEIVED_AT,
      scope: structuredClone(state.scope),
      version: 1,
    }],
    priceListEntries: [{
      id: 'price-retail-tea',
      priceListId: 'price-list-store-retail',
      productId: 'product-distributor-platform',
      unitPrice: 150,
      taxMode: 'exclusive' as const,
      minimumQuantity: 1,
      effectiveFrom: '2020-04-01',
      effectiveTo: '2099-03-31',
      scope: structuredClone(state.scope),
      version: 1,
    }],
    stockLocations: [{
      id: 'location-store',
      code: 'STORE',
      name: 'Mumbai flagship store',
      stateCode: '27',
      active: true,
      scope: structuredClone(state.scope),
      version: 1,
    }],
  };
  state = createInventoryItem(state, {
    productId: 'product-distributor-platform',
    code: 'RETAIL-TEA',
    name: 'Premium retail tea',
    baseUomId: 'uom-unit',
    tracking: 'batch',
    valuationMethod: 'fifo',
    shelfLifeDays: 365,
  }, 'item-retail-tea');
  state = createItemVariant(state, {
    itemId: 'item-retail-tea',
    sku: 'RETAIL-TEA-100G',
    name: 'Premium retail tea 100 g',
    attributes: { size: '100g' },
    barcode: '8901234567890',
  }, 'variant-retail-tea');
  state = createWarehouse(state, {
    code: 'MUM-STORE',
    name: 'Mumbai flagship store',
    stateCode: '27',
    stockLocationId: 'location-store',
  }, 'warehouse-store');
  state = createWarehouseZone(state, {
    warehouseId: 'warehouse-store',
    code: 'RCV',
    name: 'Receiving dock',
    purpose: 'receiving',
  }, 'zone-store-receiving');
  state = createWarehouseZone(state, {
    warehouseId: 'warehouse-store',
    code: 'SHELF',
    name: 'Retail shelf',
    purpose: 'picking',
  }, 'zone-store-shelf');
  state = createStorageBin(state, {
    zoneId: 'zone-store-receiving',
    code: 'RCV-01',
    name: 'Receiving bin 01',
    capacity: 1000,
    pickSequence: 1,
  }, 'bin-store-receiving');
  state = createStorageBin(state, {
    zoneId: 'zone-store-shelf',
    code: 'SHELF-01',
    name: 'Retail shelf 01',
    capacity: 1000,
    pickSequence: 10,
  }, 'bin-store-shelf');
  state = receiveInventory(state, {
    warehouseId: 'warehouse-store',
    receivingBinId: 'bin-store-receiving',
    itemVariantId: 'variant-retail-tea',
    quantity: 20,
    uomId: 'uom-unit',
    unitCost: 100,
    reference: 'GRN-RETAIL-001',
    receivedAt: RECEIVED_AT,
    batchNumber: 'TEA-260715',
    manufacturedAt: '2026-07-01',
    expiresAt: '2027-07-01',
    serialNumbers: [],
  }, 'stock-receiver', RECEIVED_AT);
  const batchId = state.inventoryBatches[0]!.id;
  state = createPutawayTask(state, {
    itemVariantId: 'variant-retail-tea',
    batchId,
    fromBinId: 'bin-store-receiving',
    toBinId: 'bin-store-shelf',
    quantity: 20,
    assignedTo: 'stock-associate',
    dueAt: '2026-07-15T08:30:00.000Z',
    priority: 'high',
  }, 'stock-receiver', 'putaway-retail-tea', RECEIVED_AT);
  state = transitionWarehouseTask(state, {
    id: 'putaway-retail-tea',
    toStatus: 'in-progress',
    expectedVersion: 1,
  }, 'stock-associate', '2026-07-15T08:10:00.000Z');
  return transitionWarehouseTask(state, {
    id: 'putaway-retail-tea',
    toStatus: 'completed',
    expectedVersion: 2,
  }, 'stock-associate', '2026-07-15T08:20:00.000Z');
}

function readyCounter(openingCash = 0): ReadyCounter {
  let state = retailFoundation();
  const batchId = state.inventoryBatches[0]!.id;
  state = createRetailCounter(state, {
    code: 'COUNTER-01',
    name: 'Flagship counter 01',
    warehouseId: 'warehouse-store',
    sellFromBinId: 'bin-store-shelf',
    priceListId: 'price-list-store-retail',
    walkInAccountId: 'account-walk-in',
    paymentTermId: 'payment-term-due-receipt',
  }, 'counter-store-01');
  state = openRetailCashierShift(state, {
    counterId: 'counter-store-01',
    openingCash,
  }, 'cashier-ava', 'shift-store-01', SHIFT_OPENED_AT);
  return { state, counterId: 'counter-store-01', shiftId: 'shift-store-01', batchId };
}

function checkoutInput(counter: ReadyCounter, tenders: CheckoutRetailSaleInput['tenders']): CheckoutRetailSaleInput {
  return {
    counterId: counter.counterId,
    cashierShiftId: counter.shiftId,
    transactionKey: 'counter-01-20260715-0001',
    saleAt: SALE_AT,
    lines: [{
      itemVariantId: 'variant-retail-tea',
      binId: 'bin-store-shelf',
      batchId: counter.batchId,
      serialUnitIds: [],
      quantity: 1,
    }],
    discountPolicyIds: [],
    tenders,
  };
}

it('reconciles GST preview exactly to the separately rounded retail receipt lines', () => {
  const counter = readyCounter();
  const baseVariant = counter.state.itemVariants.find(({ id }) => id === 'variant-retail-tea');
  if (!baseVariant) throw new Error('Retail pricing fixture requires its base variant.');

  // Distinct variants permit a three-line receipt while deliberately sharing
  // the same verified retail product and 18% GST configuration. At â‚¹0.01
  // per line each line tax rounds to â‚¹0.00; a global unrounded sum would
  // incorrectly manufacture one paisa of GST.
  const state: RevenueOpsState = {
    ...counter.state,
    itemVariants: [
      baseVariant,
      { ...baseVariant, id: 'variant-retail-tea-2', sku: 'RETAIL-TEA-200G', barcode: '8901234567891' },
      { ...baseVariant, id: 'variant-retail-tea-3', sku: 'RETAIL-TEA-300G', barcode: '8901234567892' },
    ],
    priceListEntries: counter.state.priceListEntries.map((entry) => ({ ...entry, unitPrice: 0.01 })),
  };

  const priced = priceRetailReplacementLines(state, {
    counterId: counter.counterId,
    saleAt: SALE_AT,
    lines: [
      { itemVariantId: 'variant-retail-tea', binId: 'bin-store-shelf', serialUnitIds: [], quantity: 1 },
      { itemVariantId: 'variant-retail-tea-2', binId: 'bin-store-shelf', serialUnitIds: [], quantity: 1 },
      { itemVariantId: 'variant-retail-tea-3', binId: 'bin-store-shelf', serialUnitIds: [], quantity: 1 },
    ],
  });

  const lineTax = priced.lines.reduce(
    (total, line) => total + (line.gstAmount ?? Math.round(line.taxableValue * line.gstRate) / 100) + line.cessAmount,
    0,
  );
  const lineGrandTotal = priced.lines.reduce((total, line) => total + line.lineTotal, 0);
  expect(priced.taxPreview.totalTax).toBe(lineTax);
  expect(priced.taxPreview.grandTotal).toBe(lineGrandTotal);
  expect(priced.taxPreview).toMatchObject({ taxableValue: 0.03, totalTax: 0, grandTotal: 0.03 });
});

describe('retail POS checkout', () => {
  it('completes a valued GST checkout as one traceable invoice, tender, stock, and COGS event', () => {
    const counter = readyCounter();
    const completed = checkoutRetailSale(counter.state, checkoutInput(counter, [
      { method: 'cash', amount: 100, reference: 'CASH-0001' },
      { method: 'upi', amount: 77, reference: 'UPI-0001' },
    ]), 'cashier-ava', SALE_AT);

    const sale = completed.retailSales[0]!;
    expect(sale).toMatchObject({
      status: 'completed',
      counterId: 'counter-store-01',
      cashierId: 'cashier-ava',
      subtotal: 150,
      discountTotal: 0,
      costTotal: 100,
      taxPreview: { taxableValue: 150, cgst: 13.5, sgst: 13.5, grandTotal: 177 },
    });
    expect(sale.paymentReceiptIds).toHaveLength(2);
    expect(completed.invoices[0]).toMatchObject({
      id: sale.invoiceId,
      sourceKind: 'retail-sale',
      retailSaleId: sale.id,
      documentKind: 'tax-invoice',
      status: 'paid',
      amountDue: 177,
    });
    expect(completed.receivables[0]).toMatchObject({
      id: sale.receivableId,
      originalAmount: 177,
      paidAmount: 177,
      outstandingAmount: 0,
      status: 'paid',
    });
    expect(completed.paymentReceipts.map(({ method, amount, settlementAccount, status }) => ({ method, amount, settlementAccount, status }))).toEqual([
      { method: 'upi', amount: 77, settlementAccount: 'upi-clearing', status: 'recorded' },
      { method: 'cash', amount: 100, settlementAccount: 'cash-on-hand', status: 'recorded' },
    ]);
    expect(completed.inventoryLedger.filter(({ type }) => type === 'retail-sale')).toEqual([
      expect.objectContaining({
        itemVariantId: 'variant-retail-tea',
        binId: 'bin-store-shelf',
        batchId: counter.batchId,
        quantity: -1,
        unitCost: 100,
        value: -100,
        reference: sale.number,
      }),
    ]);
    expect(completed.binBalances.find(({ binId }) => binId === 'bin-store-shelf')).toMatchObject({ quantity: 19, available: 19, inventoryValue: 1900 });
    expect(completed.journalDrafts.find(({ sourceType }) => sourceType === 'retail-sale-cost')).toMatchObject({
      sourceId: sale.id,
      sourceNumber: sale.number,
      status: 'ready',
      totalDebit: 100,
      totalCredit: 100,
      lines: [
        { accountCode: 'cost-of-goods-sold', debit: 100, credit: 0, memo: sale.number },
        { accountCode: 'inventory-asset', debit: 0, credit: 100, memo: sale.number },
      ],
    });
  });

  it('treats each line cost as an immutable line total and posts multi-unit COGS exactly once', () => {
    const counter = readyCounter();
    const oneLine = checkoutInput(counter, [{ method: 'cash', amount: 354, reference: 'CASH-COGS-MULTILINE' }]);
    const completed = checkoutRetailSale(counter.state, {
      ...oneLine,
      transactionKey: 'counter-01-20260715-cogs-multiunit',
      lines: [{ ...oneLine.lines[0]!, quantity: 2 }],
    }, 'cashier-ava', SALE_AT);

    const sale = completed.retailSales[0]!;
    const receiptCost = sale.lines.reduce((total, line) => total + line.lineCostTotal, 0);
    const stockIssueCost = completed.inventoryLedger
      .filter(({ type }) => type === 'retail-sale')
      .reduce((total, entry) => total + Math.abs(entry.value), 0);
    const cogsJournal = completed.journalDrafts.find(({ sourceType }) => sourceType === 'retail-sale-cost');

    expect(sale.lines).toHaveLength(1);
    expect(sale.lines.map(({ quantity, lineCostTotal }) => ({ quantity, lineCostTotal }))).toEqual([
      { quantity: 2, lineCostTotal: 200 },
    ]);
    expect(sale.costTotal).toBe(200);
    expect(receiptCost).toBe(200);
    expect(stockIssueCost).toBe(200);
    expect(cogsJournal).toMatchObject({ totalDebit: 200, totalCredit: 200 });
  });

  it('captures a registered B2B counter invoice and switches to inter-state IGST', () => {
    const counter = readyCounter();
    const input = {
      ...checkoutInput(counter, [{ method: 'cash', amount: 177, reference: 'CASH-B2B-0001' }]),
      customerAccountId: 'account-b2b-retailer',
      recipientTreatment: 'registered' as const,
      recipientGstin: '29ABCDE1234F1Z5',
      placeOfSupplyStateCode: '29',
    };
    const completed = checkoutRetailSale(counter.state, input, 'cashier-ava', SALE_AT);
    const sale = completed.retailSales[0]!;
    expect(sale).toMatchObject({ recipientTreatment: 'registered', recipientGstin: '29ABCDE1234F1Z5', placeOfSupplyStateCode: '29', taxPreview: { treatment: 'inter-state', cgst: 0, sgst: 0, igst: 27, grandTotal: 177 } });
    expect(completed.invoices[0]).toMatchObject({ recipientTreatment: 'registered', recipientGstin: '29ABCDE1234F1Z5', placeOfSupplyStateCode: '29', taxPreview: { treatment: 'inter-state', igst: 27, cgst: 0, sgst: 0 } });
  });

  it('replays a completed checkout idempotently without duplicate invoices, tenders, stock issues, or COGS', () => {
    const counter = readyCounter();
    const input = checkoutInput(counter, [{ method: 'cash', amount: 177, reference: 'CASH-0002' }]);
    const completed = checkoutRetailSale(counter.state, input, 'cashier-ava', SALE_AT);
    const replay = checkoutRetailSale(completed, input, 'cashier-ava', SALE_AT);

    expect(replay).toBe(completed);
    expect(replay.retailSales).toHaveLength(1);
    expect(replay.invoices).toHaveLength(1);
    expect(replay.paymentReceipts).toHaveLength(1);
    expect(replay.inventoryLedger.filter(({ type }) => type === 'retail-sale')).toHaveLength(1);
    expect(replay.journalDrafts.filter(({ sourceType }) => sourceType === 'retail-sale-cost')).toHaveLength(1);
  });

  it('prices one persisted voucher at the checkout boundary, preserves GST-safe evidence, and consumes it once', () => {
    const counter = readyCounter();
    const state: RevenueOpsState = {
      ...counter.state,
      retailVouchers: [{
        id: 'voucher-monsoon-20',
        code: 'MONSOON20',
        name: 'Monsoon counter offer',
        discountType: 'percentage',
        discountValue: 20,
        minimumOrderAmount: 100,
        maxDiscountAmount: 30,
        validFrom: '2026-07-01',
        validTo: '2026-07-31',
        maxUsageCount: 10,
        currentUsageCount: 0,
        active: true,
        scope: structuredClone(counter.state.scope),
        version: 7,
      }],
    };
    const input: CheckoutRetailSaleInput = {
      ...checkoutInput({ ...counter, state }, [{ method: 'cash', amount: 141.6, reference: 'CASH-VOUCHER-01' }]),
      voucherCode: 'monsoon20',
      voucherVersion: 7,
    };

    const completed = checkoutRetailSale(state, input, 'cashier-ava', SALE_AT);
    const sale = completed.retailSales[0]!;

    expect(sale).toMatchObject({
      discountTotal: 30,
      taxPreview: { taxableValue: 120, cgst: 10.8, sgst: 10.8, grandTotal: 141.6 },
      voucherRedemption: {
        voucherId: 'voucher-monsoon-20',
        voucherCode: 'MONSOON20',
        voucherVersion: 7,
        discountAmount: 30,
        eligibleSubtotal: 150,
        redeemedAt: SALE_AT,
      },
    });
    expect(sale.lines[0]).toMatchObject({ discountAmount: 30, taxableValue: 120, lineTotal: 141.6 });
    expect(completed.retailVouchers[0]).toMatchObject({ currentUsageCount: 1, version: 8 });

    const replay = checkoutRetailSale(completed, input, 'cashier-ava', SALE_AT);
    expect(replay).toBe(completed);
    expect(replay.retailVouchers[0]).toMatchObject({ currentUsageCount: 1, version: 8 });
    expect(() => checkoutRetailSale(completed, { ...input, voucherVersion: 8 }, 'cashier-ava', SALE_AT)).toThrow('different checkout data');
  });

  it('does not consume a voucher when a later checkout control rejects the sale', () => {
    const counter = readyCounter();
    const state: RevenueOpsState = {
      ...counter.state,
      retailVouchers: [{
        id: 'voucher-no-failed-consumption', code: 'FAILSAFE10', name: 'Failed-sale guard', discountType: 'fixed_amount',
        discountValue: 10, minimumOrderAmount: 100, validFrom: '2026-07-01', validTo: '2026-07-31',
        maxUsageCount: 10, currentUsageCount: 0, active: true, scope: structuredClone(counter.state.scope), version: 1,
      }],
    };
    const input: CheckoutRetailSaleInput = {
      ...checkoutInput({ ...counter, state }, [{ method: 'cash', amount: 177, reference: 'CASH-FAILED-VOUCHER' }]),
      voucherCode: 'FAILSAFE10',
      voucherVersion: 1,
    };

    expect(() => checkoutRetailSale(state, input, 'cashier-ava', SALE_AT)).toThrow('Retail tenders must equal the GST invoice grand total exactly.');
    expect(state.retailSales).toHaveLength(0);
    expect(state.retailVouchers[0]).toMatchObject({ currentUsageCount: 0, version: 1 });
  });

  it('rejects voucher stacking with loyalty or non-gift promotions before it can change a sale', () => {
    const counter = readyCounter();
    const voucher = {
      id: 'voucher-stack-guard', code: 'NO-STACK', name: 'One benefit at a time', discountType: 'fixed_amount' as const,
      discountValue: 10, minimumOrderAmount: 100, validFrom: '2026-07-01', validTo: '2026-07-31',
      maxUsageCount: 10, currentUsageCount: 0, active: true, scope: structuredClone(counter.state.scope), version: 1,
    };
    const loyaltyState: RevenueOpsState = {
      ...counter.state,
      retailVouchers: [voucher],
      retailLoyaltyAccounts: [{
        id: 'loyalty-walk-in', customerAccountId: 'account-walk-in', pointsBalance: 20, lifetimePointsEarned: 20,
        lifetimePointsRedeemed: 0, tier: 'silver', updatedAt: SHIFT_OPENED_AT, scope: structuredClone(counter.state.scope), version: 1,
      }],
    };
    const loyaltyInput: CheckoutRetailSaleInput = {
      ...checkoutInput({ ...counter, state: loyaltyState }, [{ method: 'cash', amount: 165.2, reference: 'CASH-VOUCHER-LOYALTY' }]),
      voucherCode: 'NO-STACK',
      voucherVersion: 1,
      loyaltyPointsToRedeem: 10,
      loyaltyAccountVersion: 1,
    };
    expect(() => checkoutRetailSale(loyaltyState, loyaltyInput, 'cashier-ava', SALE_AT)).toThrow('cannot be combined');

    const promotionState: RevenueOpsState = {
      ...counter.state,
      retailVouchers: [voucher],
      discountPolicies: [{
        id: 'policy-stack-guard', code: 'TEN-OFF', name: 'Ordinary counter campaign', scope: 'order', method: 'percentage', value: 10,
        minimumTaxableValue: 100, maximumDiscountAmount: 1000, stackable: false, approvalThresholdPercent: 0,
        effectiveFrom: '2020-01-01', effectiveTo: '2099-12-31', active: true, operatingScope: structuredClone(counter.state.scope), version: 1,
      }],
    };
    const promotionInput: CheckoutRetailSaleInput = {
      ...checkoutInput({ ...counter, state: promotionState }, [{ method: 'cash', amount: 159.3, reference: 'CASH-VOUCHER-PROMOTION' }]),
      transactionKey: 'counter-01-20260715-voucher-policy',
      voucherCode: 'NO-STACK',
      voucherVersion: 1,
      discountPolicyIds: ['policy-stack-guard'],
    };
    expect(() => checkoutRetailSale(promotionState, promotionInput, 'cashier-ava', SALE_AT)).toThrow('cannot be combined');
  });

  it('revalidates a queued voucher against current persisted state before offline replay can post it', () => {
    const counter = readyCounter();
    let state: RevenueOpsState = {
      ...counter.state,
      retailVouchers: [{
        id: 'voucher-offline-recheck', code: 'OFFLINE20', name: 'Offline recovery voucher', discountType: 'percentage',
        discountValue: 20, minimumOrderAmount: 100, validFrom: '2026-07-01', validTo: '2026-07-31',
        maxUsageCount: 10, currentUsageCount: 0, active: true, scope: structuredClone(counter.state.scope), version: 7,
      }],
    };
    const saleInput: CheckoutRetailSaleInput = {
      ...checkoutInput({ ...counter, state }, [{ method: 'cash', amount: 141.6, reference: 'CASH-OFFLINE-VOUCHER' }]),
      transactionKey: 'counter-01-20260715-offline-voucher',
      voucherCode: 'OFFLINE20',
      voucherVersion: 7,
    };
    state = enqueueRetailOfflineSale(state, saleInput, 'cashier-ava', '2026-07-15T09:16:00.000Z', 'offline-voucher-recheck');
    state = {
      ...state,
      retailVouchers: state.retailVouchers.map((voucher) => ({ ...voucher, active: false, version: 8 })),
    };

    state = syncRetailOfflineSale(state, { id: 'offline-voucher-recheck', expectedVersion: 1 }, 'cashier-ava', '2026-07-15T09:17:00.000Z');

    expect(state.retailSales).toHaveLength(0);
    expect(state.retailVouchers[0]).toMatchObject({ currentUsageCount: 0, version: 8 });
    expect(state.retailOfflineSaleQueue[0]).toMatchObject({ status: 'conflict', conflictReason: expect.stringMatching(/voucher.*changed|voucher.*inactive/i) });
  });

  it('rejects an under-tendered basket without changing its input state', () => {
    const counter = readyCounter();
    const before = structuredClone(counter.state);

    expect(() => checkoutRetailSale(counter.state, checkoutInput(counter, [
      { method: 'cash', amount: 176, reference: 'CASH-0003' },
    ]), 'cashier-ava', SALE_AT)).toThrow('Retail tenders must equal the GST invoice grand total exactly.');

    expect(counter.state).toEqual(before);
  });

  it('keeps an open counter shift with its assigned cashier for both opening custody and checkout', () => {
    const counter = readyCounter();
    const before = structuredClone(counter.state);

    expect(() => openRetailCashierShift(counter.state, {
      counterId: counter.counterId,
      openingCash: 0,
    }, 'cashier-ben', 'shift-store-02', '2026-07-15T09:05:00.000Z')).toThrow('already has an open');
    expect(() => checkoutRetailSale(counter.state, checkoutInput(counter, [
      { method: 'cash', amount: 177, reference: 'CASH-0004' },
    ]), 'cashier-ben', SALE_AT)).toThrow('assigned cashier');

    expect(counter.state).toEqual(before);
  });

  it('compares checkout and shift times as instants, not lexical timestamp strings', () => {
    const counter = readyCounter();
    const before = structuredClone(counter.state);
    const input = { ...checkoutInput(counter, [{ method: 'cash', amount: 177, reference: 'CASH-0004A' }]), saleAt: '2026-07-15T14:00:00+05:30' };

    expect(() => checkoutRetailSale(counter.state, input, 'cashier-ava', '2026-07-15T10:05:00.000Z')).toThrow('occur after the cashier shift opened');
    expect(counter.state).toEqual(before);
  });

  it('requires an independent zero-variance close and reconciles only the cash tender evidence', () => {
    const counter = readyCounter(50);
    const completed = checkoutRetailSale(counter.state, checkoutInput(counter, [
      { method: 'cash', amount: 177, reference: 'CASH-0005' },
    ]), 'cashier-ava', SALE_AT);
    const requested = requestRetailCashierShiftClose(completed, {
      id: counter.shiftId,
      declaredCash: 227,
      evidenceReference: 'DRAWER-COUNT-0005',
      expectedVersion: 1,
    }, 'cashier-ava', '2026-07-15T18:00:00.000Z');
    const requestedShift = requested.retailCashierShifts[0]!;
    expect(requestedShift).toMatchObject({ status: 'close-requested', expectedCash: 227, declaredCash: 227, variance: 0, version: 2 });
    expect(() => decideRetailCashierShiftClose(requested, {
      id: counter.shiftId,
      decision: 'approved',
      evidenceReference: 'REVIEW-0005',
      expectedVersion: requestedShift.version,
    }, 'cashier-ava', '2026-07-15T18:10:00.000Z')).toThrow('independent reviewer');

    const closed = decideRetailCashierShiftClose(requested, {
      id: counter.shiftId,
      decision: 'approved',
      evidenceReference: 'REVIEW-0005',
      expectedVersion: requestedShift.version,
    }, 'store-manager', '2026-07-15T18:10:00.000Z');
    const cashReceipt = closed.paymentReceipts.find(({ method }) => method === 'cash')!;

    expect(closed.retailCashierShifts[0]).toMatchObject({ status: 'closed', closedBy: 'store-manager', reviewerEvidenceReference: 'REVIEW-0005', version: 3 });
    expect(cashReceipt).toMatchObject({ status: 'reconciled', reconciledBy: 'store-manager', reconciledAt: '2026-07-15T18:10:00.000Z' });
    expect(closed.journalDrafts.find((draft) => draft.sourceType === 'payment' && draft.sourceId === cashReceipt.id)).toMatchObject({ status: 'ready' });
  });

  it('requires tender-by-tender declarations before a multi-rail shift can close', () => {
    const counter = readyCounter(50);
    const completed = checkoutRetailSale(counter.state, checkoutInput(counter, [
      { method: 'cash', amount: 100, reference: 'CASH-TENDER-01' },
      { method: 'upi', amount: 77, reference: 'UPI-TENDER-01' },
    ]), 'cashier-ava', SALE_AT);
    const requested = requestRetailCashierShiftClose(completed, {
      id: counter.shiftId,
      declaredCash: 150,
      declaredTenders: [
        { method: 'cash', amount: 150 }, { method: 'upi', amount: 76 }, { method: 'card', amount: 0 },
        { method: 'cheque', amount: 0 }, { method: 'store-credit', amount: 0 }, { method: 'customer-credit', amount: 0 }, { method: 'other', amount: 0 },
      ],
      evidenceReference: 'DRAWER-TENDER-01',
      expectedVersion: 1,
    }, 'cashier-ava', '2026-07-15T18:00:00.000Z');
    const requestedShift = requested.retailCashierShifts[0]!;
    expect(requestedShift.tenderReconciliation).toEqual(expect.arrayContaining([
      { method: 'cash', expected: 150, declared: 150, variance: 0 },
      { method: 'upi', expected: 77, declared: 76, variance: -1 },
    ]));
    expect(requestedShift.tenderVariance).toBe(1);
    expect(() => decideRetailCashierShiftClose(requested, {
      id: counter.shiftId, decision: 'approved', evidenceReference: 'REVIEW-TENDER-01', expectedVersion: requestedShift.version,
    }, 'store-manager', '2026-07-15T18:10:00.000Z')).toThrow('tender variance');
    const exact = requestRetailCashierShiftClose(completed, {
      id: counter.shiftId,
      declaredCash: 150,
      declaredTenders: [
        { method: 'cash', amount: 150 }, { method: 'upi', amount: 77 }, { method: 'card', amount: 0 },
        { method: 'cheque', amount: 0 }, { method: 'store-credit', amount: 0 }, { method: 'customer-credit', amount: 0 }, { method: 'other', amount: 0 },
      ],
      evidenceReference: 'DRAWER-TENDER-02', expectedVersion: 1,
    }, 'cashier-ava', '2026-07-15T18:00:00.000Z');
    expect(exact.retailCashierShifts[0]!.tenderVariance).toBe(0);
  });

  it('resolves a documented tender variance through an independent finance journal before close', () => {
    const counter = readyCounter(50);
    const completed = checkoutRetailSale(counter.state, checkoutInput(counter, [
      { method: 'cash', amount: 100, reference: 'CASH-VAR-01' },
      { method: 'upi', amount: 77, reference: 'UPI-VAR-01' },
    ]), 'cashier-ava', SALE_AT);
    let requested = requestRetailCashierShiftClose(completed, {
      id: counter.shiftId, declaredCash: 150,
      declaredTenders: [
        { method: 'cash', amount: 150 }, { method: 'upi', amount: 76 }, { method: 'card', amount: 0 },
        { method: 'cheque', amount: 0 }, { method: 'store-credit', amount: 0 }, { method: 'customer-credit', amount: 0 }, { method: 'other', amount: 0 },
      ], evidenceReference: 'DRAWER-VAR-01', expectedVersion: 1,
    }, 'cashier-ava', '2026-07-15T18:00:00.000Z');
    requested = requestRetailCashierShiftVarianceResolution(requested, {
      id: counter.shiftId, reason: 'UPI terminal settlement is short by one rupee pending provider correction.', evidenceReference: 'UPI-INCIDENT-01', expectedVersion: 2,
    }, 'finance-maker', '2026-07-15T18:02:00.000Z');
    const resolved = decideRetailCashierShiftVarianceResolution(requested, {
      id: counter.shiftId, decision: 'approved', evidenceReference: 'FIN-CHECK-01', expectedVersion: 3,
    }, 'finance-checker', '2026-07-15T18:05:00.000Z');
    expect(resolved.journalDrafts[0]).toMatchObject({ sourceType: 'retail-cashier-variance', status: 'ready', totalDebit: 1, totalCredit: 1 });
    const closed = decideRetailCashierShiftClose(resolved, {
      id: counter.shiftId, decision: 'approved', evidenceReference: 'SHIFT-CLOSE-VAR-01', expectedVersion: 4,
    }, 'store-manager', '2026-07-15T18:10:00.000Z');
    expect(closed.retailCashierShifts[0]).toMatchObject({ status: 'closed', varianceResolutionStatus: 'approved' });
  });

  it('atomically expands product combo component inventory allocations during POS checkout', () => {
    const counter = readyCounter(50);

    let state = createItemVariant(counter.state, {
      itemId: 'item-retail-tea',
      sku: 'RETAIL-TEA-TWIN',
      name: 'Retail tea 2-pack combo',
      attributes: { pack: '2x' },
    }, 'variant-tea-combo');

    state = createRetailProductCombo(state, {
      code: 'COMBO-TEA-2PK',
      name: 'Retail Tea Twin Bundle',
      parentItemVariantId: 'variant-tea-combo',
      components: [{ itemVariantId: 'variant-retail-tea', quantity: 2 }],
    }, 'combo-tea-twin');

    const baseInput = checkoutInput(counter, [{ method: 'cash', amount: 177, reference: 'CASH-COMBO-01' }]);
    const input: CheckoutRetailSaleInput = {
      ...baseInput,
      lines: [{
        itemVariantId: 'variant-tea-combo',
        quantity: 1,
        binId: 'bin-store-shelf',
        batchId: counter.batchId,
        serialUnitIds: [],
      }],
    };

    const completed = checkoutRetailSale(state, input, 'cashier-ava', SALE_AT);
    expect(completed.retailSales[0]?.lines[0]?.itemVariantId).toBe('variant-tea-combo');
    // Component tea stock balance should drop by 2 units (20 - 2 = 18)
    const teaBalance = completed.binBalances.find((b) => b.itemVariantId === 'variant-retail-tea' && b.binId === 'bin-store-shelf');
    expect(teaBalance?.quantity).toBe(18);
  });

  it('validates and redeems customer store credit during POS checkout', () => {
    const counter = readyCounter(50);
    // Add an active store credit for account-walk-in
    const state: RevenueOpsState = {
      ...counter.state,
      retailStoreCredits: [{
        id: 'store-credit-001',
        number: 'SC-1001',
        retailReturnId: 'return-001',
        retailReturnSettlementId: 'settlement-001',
        customerAccountId: 'account-walk-in',
        issuedAmount: 177,
        availableAmount: 177,
        status: 'active',
        evidenceReference: 'RETURN-EVIDENCE-001',
        issuedBy: 'store-manager',
        issuedAt: '2026-07-15T09:00:00.000Z',
        scope: structuredClone(counter.state.scope),
        version: 1,
      }],
    };

    // Test rejection when store credit customer does not match
    const mismatchedInput = checkoutInput(counter, [{ method: 'store-credit', amount: 177, reference: 'SC-1001' }]);
    mismatchedInput.customerAccountId = 'account-other-customer';
    expect(() => checkoutRetailSale(state, mismatchedInput, 'cashier-ava', SALE_AT)).toThrow('different customer account');

    // Test successful redemption
    const validInput = checkoutInput(counter, [{ method: 'store-credit', amount: 177, reference: 'SC-1001' }]);
    const completed = checkoutRetailSale(state, validInput, 'cashier-ava', SALE_AT);

    const credit = completed.retailStoreCredits.find((c) => c.id === 'store-credit-001');
    expect(credit?.availableAmount).toBe(0);
    expect(credit?.status).toBe('redeemed');
  });

  it('supports governed customer credit at counter without fabricating a payment receipt', () => {
    const counter = readyCounter();
    const state: RevenueOpsState = {
      ...counter.state,
      creditLimitControls: [{
        id: 'credit-control-001',
        number: 'CRL-26-27-00001',
        accountId: 'account-walk-in',
        currency: 'INR',
        creditLimit: 500,
        warningThresholdPercent: 80,
        graceDays: 15,
        blockNewOrders: true,
        riskGrade: 'B',
        rationale: 'Approved counter credit for a named repeat customer.',
        status: 'approved',
        requestedBy: 'finance-maker',
        requestedAt: '2026-07-14T09:00:00.000Z',
        decidedBy: 'finance-checker',
        decidedAt: '2026-07-14T10:00:00.000Z',
        decisionRemarks: 'Approved within documented customer limit.',
        scope: structuredClone(counter.state.scope),
        version: 2,
      }],
    };
    const input = checkoutInput({ ...counter, state }, [{ method: 'customer-credit', amount: 177, reference: 'ON-ACCOUNT-0001' }]);

    const completed = checkoutRetailSale(state, input, 'cashier-ava', SALE_AT);
    const sale = completed.retailSales[0]!;
    expect(sale.tenders).toEqual([{ id: expect.any(String), method: 'customer-credit', amount: 177, reference: 'ON-ACCOUNT-0001' }]);
    expect(sale.paymentReceiptIds).toHaveLength(0);
    expect(completed.paymentReceipts).toHaveLength(0);
    expect(completed.receivables[0]).toMatchObject({ originalAmount: 177, paidAmount: 0, outstandingAmount: 177, status: 'due' });
    expect(completed.invoices[0]).toMatchObject({ status: 'issued', amountDue: 177 });
  });

  it('applies a rack campaign to merchandised shelf lines and preserves GST evidence', () => {
    const counter = readyCounter();
    const state: RevenueOpsState = {
      ...counter.state,
      retailCatalogCategories: [{ id: 'cat-beverages', code: 'BEV', name: 'Beverages', active: true, scope: structuredClone(counter.state.scope), version: 1 }],
      retailMerchandisingProfiles: [{ id: 'merch-tea', itemId: 'item-retail-tea', categoryId: 'cat-beverages', rackBinId: 'bin-store-shelf', searchKeywords: ['tea'], scope: structuredClone(counter.state.scope), version: 1 }],
      discountPolicies: [{ id: 'policy-rack', code: 'RACK10', name: 'Shelf beverage campaign', scope: 'order', method: 'percentage', value: 10, minimumTaxableValue: 100, maximumDiscountAmount: 1000, stackable: false, approvalThresholdPercent: 0, eligibleRetailRackBinIds: ['bin-store-shelf'], effectiveFrom: '2020-01-01', effectiveTo: '2099-12-31', active: true, operatingScope: structuredClone(counter.state.scope), version: 1 }],
    };
    const input = checkoutInput({ ...counter, state }, [{ method: 'cash', amount: 159.3, reference: 'CASH-RACK-01' }]);
    input.discountPolicyIds = ['policy-rack'];
    const completed = checkoutRetailSale(state, input, 'cashier-ava', SALE_AT);
    expect(completed.retailSales[0]).toMatchObject({ discountTotal: 15, taxPreview: { taxableValue: 135, grandTotal: 159.3 } });
    expect(completed.retailSales[0]?.lines[0]).toMatchObject({ discountAmount: 15, taxableValue: 135, lineTotal: 159.3 });
  });

  it('fulfils an eligible gift SKU as a zero-price, stock-issued POS line', () => {
    const counter = readyCounter();
    let state: RevenueOpsState = { ...counter.state, inventoryItems: [...counter.state.inventoryItems, { id: 'item-retail-gift', productId: 'product-distributor-platform', code: 'RETAIL-GIFT', name: 'Complimentary sugar gift', baseUomId: 'uom-unit', tracking: 'none', valuationMethod: 'fifo', active: true, scope: structuredClone(counter.state.scope), version: 1 }] };
    state = createItemVariant(state, { itemId: 'item-retail-gift', sku: 'RETAIL-GIFT-SUGAR', name: 'Complimentary sugar gift', attributes: { pack: 'gift' } }, 'variant-retail-gift');
    state = receiveInventory(state, {
      warehouseId: 'warehouse-store', receivingBinId: 'bin-store-receiving', itemVariantId: 'variant-retail-gift', quantity: 5, uomId: 'uom-unit', unitCost: 20, reference: 'GRN-GIFT-001', receivedAt: RECEIVED_AT, serialNumbers: [],
    }, 'stock-receiver', RECEIVED_AT);
    state = createPutawayTask(state, { itemVariantId: 'variant-retail-gift', fromBinId: 'bin-store-receiving', toBinId: 'bin-store-shelf', quantity: 5, assignedTo: 'stock-associate', dueAt: '2026-07-15T08:30:00.000Z', priority: 'normal' }, 'stock-receiver', 'putaway-retail-gift', RECEIVED_AT);
    state = transitionWarehouseTask(state, { id: 'putaway-retail-gift', toStatus: 'in-progress', expectedVersion: 1 }, 'stock-associate', '2026-07-15T08:10:00.000Z');
    state = transitionWarehouseTask(state, { id: 'putaway-retail-gift', toStatus: 'completed', expectedVersion: 2 }, 'stock-associate', '2026-07-15T08:20:00.000Z');
    state = { ...state, discountPolicies: [{ id: 'policy-gift', code: 'TEA-GIFT', name: 'Tea gift', scope: 'product', productId: 'product-distributor-platform', method: 'percentage', value: 1, minimumTaxableValue: 100, maximumDiscountAmount: 1000, stackable: false, approvalThresholdPercent: 0, promotionType: 'gift', giftItemVariantId: 'variant-retail-gift', giftQuantity: 1, effectiveFrom: '2020-01-01', effectiveTo: '2099-12-31', active: true, operatingScope: structuredClone(state.scope), version: 1 }] };
    const input = checkoutInput({ ...counter, state }, [{ method: 'cash', amount: 177, reference: 'CASH-GIFT-01' }]);
    input.discountPolicyIds = ['policy-gift'];
    const completed = checkoutRetailSale(state, input, 'cashier-ava', SALE_AT);
    const sale = completed.retailSales[0]!;
    expect(sale).toMatchObject({ subtotal: 150, discountTotal: 0, taxPreview: { grandTotal: 177 } });
    expect(sale.lines).toEqual(expect.arrayContaining([expect.objectContaining({ itemVariantId: 'variant-retail-gift', quantity: 1, taxableValue: 0, lineTotal: 0, isGift: true, promotionPolicyId: 'policy-gift' })]));
    expect(completed.inventoryLedger).toEqual(expect.arrayContaining([expect.objectContaining({ itemVariantId: 'variant-retail-gift', quantity: -1, unitCost: 20, reference: sale.number })]));
  });
});
