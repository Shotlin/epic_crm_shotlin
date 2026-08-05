import { describe, expect, it } from 'vitest';
import type {
  CheckoutRetailSaleInput,
  CreateRetailReturnRequestInput,
} from '../shared/retail-pos-contracts';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
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
import {
  checkoutRetailSale,
  createRetailCounter,
  openRetailCashierShift,
  requestRetailCashierShiftClose,
} from './retail-pos';
import {
  confirmRetailReturnProviderRefund,
  createRetailReturnRequest,
  decideRetailReturnSettlement,
  decideRetailReturn,
  inspectRetailReturn,
  requestRetailReturnSettlement,
} from './retail-returns';
import { createRetailExchange, decideRetailExchange } from './retail-exchange';
import { createInitialRevenueOpsState } from './revenue-ops';

const RECEIVED_AT = '2026-07-15T08:00:00.000Z';
const SHIFT_OPENED_AT = '2026-07-15T09:00:00.000Z';
const SALE_AT = '2026-07-15T09:15:00.000Z';

interface CompletedRetailSale {
  state: RevenueOpsState;
  saleId: string;
  saleLineId: string;
  batchId?: string;
  serialUnitIds: string[];
}

/**
 * The return seam begins with an actual governed POS sale. This prevents the
 * tests from hand-authoring a sale whose price, GST or cost evidence could
 * never have been produced by the counter workflow.
 */
function completedRetailSale(options: {
  customerAccountId?: string;
  tenderMethod?: 'cash' | 'upi';
  tracking?: 'batch' | 'serial';
} = {}): CompletedRetailSale {
  const serialTracked = options.tracking === 'serial';
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
      cessRate: 1,
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
    discountPolicies: [{
      id: 'discount-retail-ten',
      code: 'RETAIL-10',
      name: 'Ten percent shelf campaign',
      scope: 'order' as const,
      method: 'percentage' as const,
      value: 10,
      minimumTaxableValue: 1,
      maximumDiscountAmount: 1000,
      stackable: false,
      approvalThresholdPercent: 100,
      effectiveFrom: '2020-04-01',
      effectiveTo: '2099-03-31',
      active: true,
      operatingScope: structuredClone(state.scope),
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
    tracking: serialTracked ? 'serial' : 'batch',
    valuationMethod: serialTracked ? 'specific-identification' : 'fifo',
    ...(serialTracked ? {} : { shelfLifeDays: 365 }),
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
    warehouseId: 'warehouse-store', code: 'RCV', name: 'Receiving dock', purpose: 'receiving',
  }, 'zone-store-receiving');
  state = createWarehouseZone(state, {
    warehouseId: 'warehouse-store', code: 'SHELF', name: 'Retail shelf', purpose: 'picking',
  }, 'zone-store-shelf');
  state = createWarehouseZone(state, {
    warehouseId: 'warehouse-store', code: 'QUAR', name: 'Returns quarantine', purpose: 'quarantine',
  }, 'zone-store-quarantine');
  state = createStorageBin(state, {
    zoneId: 'zone-store-receiving', code: 'RCV-01', name: 'Receiving bin 01', capacity: 1000, pickSequence: 1,
  }, 'bin-store-receiving');
  state = createStorageBin(state, {
    zoneId: 'zone-store-shelf', code: 'SHELF-01', name: 'Retail shelf 01', capacity: 1000, pickSequence: 10,
  }, 'bin-store-shelf');
  state = createStorageBin(state, {
    zoneId: 'zone-store-quarantine', code: 'QUAR-01', name: 'Quarantine bin 01', capacity: 1000, pickSequence: 20,
  }, 'bin-store-quarantine');
  state = receiveInventory(state, {
    warehouseId: 'warehouse-store',
    receivingBinId: 'bin-store-receiving',
    itemVariantId: 'variant-retail-tea',
    quantity: 20,
    uomId: 'uom-unit',
    unitCost: 100,
    reference: 'GRN-RETAIL-001',
    receivedAt: RECEIVED_AT,
    ...(serialTracked ? {} : {
      batchNumber: 'TEA-260715',
      manufacturedAt: '2026-07-01',
      expiresAt: '2027-07-01',
    }),
    serialNumbers: serialTracked
      ? Array.from({ length: 20 }, (_, index) => `RETAIL-TEA-SN-${String(index + 1).padStart(2, '0')}`)
      : [],
  }, 'stock-receiver', RECEIVED_AT);
  const batchId = serialTracked ? undefined : state.inventoryBatches[0]!.id;
  const shelfSerialUnitIds = serialTracked ? state.serialUnits.map(({ id }) => id) : [];
  state = createPutawayTask(state, {
    itemVariantId: 'variant-retail-tea',
    ...(batchId ? { batchId } : {}),
    serialUnitIds: shelfSerialUnitIds,
    fromBinId: 'bin-store-receiving',
    toBinId: 'bin-store-shelf',
    quantity: 20,
    assignedTo: 'stock-associate', dueAt: '2026-07-15T08:30:00.000Z', priority: 'high',
  }, 'stock-receiver', 'putaway-retail-tea', RECEIVED_AT);
  state = transitionWarehouseTask(state, { id: 'putaway-retail-tea', toStatus: 'in-progress', expectedVersion: 1 }, 'stock-associate', '2026-07-15T08:10:00.000Z');
  state = transitionWarehouseTask(state, { id: 'putaway-retail-tea', toStatus: 'completed', expectedVersion: 2 }, 'stock-associate', '2026-07-15T08:20:00.000Z');
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
    counterId: 'counter-store-01', openingCash: 0,
  }, 'cashier-ava', 'shift-store-01', SHIFT_OPENED_AT);
  const soldSerialUnitIds = serialTracked ? state.serialUnits.slice(0, 2).map(({ id }) => id) : [];
  const checkout: CheckoutRetailSaleInput = {
    counterId: 'counter-store-01',
    cashierShiftId: 'shift-store-01',
    transactionKey: 'counter-01-20260715-0001',
    customerAccountId: options.customerAccountId,
    saleAt: SALE_AT,
    lines: [{
      itemVariantId: 'variant-retail-tea',
      binId: 'bin-store-shelf',
      ...(batchId ? { batchId } : {}),
      serialUnitIds: soldSerialUnitIds,
      quantity: 2,
    }],
    discountPolicyIds: ['discount-retail-ten'],
    tenders: [{
      method: options.tenderMethod ?? 'cash',
      amount: 321.3,
      reference: options.tenderMethod === 'upi' ? 'UPI-000001' : 'CASH-0001',
    }],
  };
  state = checkoutRetailSale(state, checkout, 'cashier-ava', SALE_AT);
  const sale = state.retailSales[0]!;
  return {
    state,
    saleId: sale.id,
    saleLineId: sale.lines[0]!.id,
    ...(batchId ? { batchId } : {}),
    serialUnitIds: [...sale.lines[0]!.serialUnitIds],
  };
}

function returnRequest(sale: CompletedRetailSale, transactionKey = 'return-01-20260715-0001'): CreateRetailReturnRequestInput {
  return {
    retailSaleId: sale.saleId,
    transactionKey,
    reason: 'Customer returned sealed tea packs after duplicate purchase.',
    lines: [{ retailSaleLineId: sale.saleLineId, quantity: 1, serialUnitIds: [] }],
  };
}

function approvedRetailReturn(sale: CompletedRetailSale): RevenueOpsState {
  const requested = createRetailReturnRequest(sale.state, returnRequest(sale), 'counter-associate', 'retail-return-01', '2026-07-15T10:00:00.000Z');
  const inspected = inspectRetailReturn(requested, {
    id: 'retail-return-01',
    expectedVersion: 1,
    inspectionReference: 'INSPECT-RETURN-SETTLEMENT-01',
    lines: [{
      retailReturnLineId: requested.retailReturns[0]!.lines[0]!.id,
      outcome: 'resalable',
      destinationBinId: 'bin-store-shelf',
      serialUnitIds: [],
      conditionNotes: 'Factory seal and batch label verified intact.',
    }],
  }, 'quality-priya', '2026-07-15T10:10:00.000Z');
  return decideRetailReturn(inspected, {
    id: 'retail-return-01',
    decision: 'approved',
    evidenceReference: 'APPROVE-RETURN-SETTLEMENT-01',
    expectedVersion: 2,
  }, 'store-manager', '2026-07-15T10:12:00.000Z');
}

describe('governed retail counter returns', () => {
  it('makes an idempotent immutable request with exact original GST, cess, discount, and cost snapshots before stock moves', () => {
    const sale = completedRetailSale();
    const requested = createRetailReturnRequest(sale.state, returnRequest(sale), 'counter-associate', 'retail-return-01', '2026-07-15T10:00:00.000Z');
    const returnCase = requested.retailReturns[0]!;

    expect(returnCase).toMatchObject({
      id: 'retail-return-01',
      status: 'requested',
      retailSaleId: sale.saleId,
      requestedBy: 'counter-associate',
      taxPreview: { taxableValue: 135, cgst: 12.15, sgst: 12.15, cess: 1.35, grandTotal: 160.65 },
      lines: [expect.objectContaining({
        retailSaleLineId: sale.saleLineId,
        sourceLineQuantity: 2,
        quantity: 1,
        original: expect.objectContaining({ taxableValue: 270, discountAmount: 30, cessAmount: 2.7, costValue: 200 }),
        returnValues: { taxableValue: 135, discountAmount: 15, gstAmount: 24.3, cessAmount: 1.35, lineTotal: 160.65, costValue: 100 },
      })],
    });
    expect(requested.binBalances.find(({ binId }) => binId === 'bin-store-shelf')).toMatchObject({ quantity: 18, available: 18 });
    expect(requested.inventoryLedger.filter(({ type }) => type === 'return')).toHaveLength(0);

    const replay = createRetailReturnRequest(requested, returnRequest(sale), 'counter-associate', 'ignored', '2026-07-15T10:01:00.000Z');
    expect(replay).toBe(requested);
    expect(() => createRetailReturnRequest(requested, {
      ...returnRequest(sale),
      reason: 'Changed payload should never replay a different return.',
    }, 'counter-associate', 'retail-return-02')).toThrow('idempotency key');
  });

  it('caps a return at the original sale line quantity across open return cases', () => {
    const sale = completedRetailSale();
    const requested = createRetailReturnRequest(sale.state, returnRequest(sale), 'counter-associate', 'retail-return-01');

    expect(() => createRetailReturnRequest(requested, {
      ...returnRequest(sale, 'return-01-20260715-0002'),
      lines: [{ retailSaleLineId: sale.saleLineId, quantity: 2, serialUnitIds: [] }],
    }, 'counter-associate', 'retail-return-02')).toThrow('exceeds the original retail sale line quantity');
  });

  it('blocks a serial unit from two active return cases, while allowing a rejected case to be requested again', () => {
    const sale = completedRetailSale({ tracking: 'serial' });
    const serialUnitId = sale.serialUnitIds[0]!;
    const firstInput: CreateRetailReturnRequestInput = {
      retailSaleId: sale.saleId,
      transactionKey: 'serial-return-01-20260715-0001',
      reason: 'Customer returned the traceable store device after inspection.',
      lines: [{ retailSaleLineId: sale.saleLineId, quantity: 1, serialUnitIds: [serialUnitId] }],
    };
    const requested = createRetailReturnRequest(sale.state, firstInput, 'counter-associate', 'serial-return-01');

    expect(() => createRetailReturnRequest(requested, {
      ...firstInput,
      transactionKey: 'serial-return-01-20260715-0002',
    }, 'counter-associate', 'serial-return-02')).toThrow('already claimed by another active counter-return case');

    const inspected = inspectRetailReturn(requested, {
      id: 'serial-return-01',
      expectedVersion: 1,
      inspectionReference: 'INSPECT-SERIAL-RETURN-01',
      lines: [{
        retailReturnLineId: requested.retailReturns[0]!.lines[0]!.id,
        outcome: 'quarantine',
        destinationBinId: 'bin-store-quarantine',
        serialUnitIds: [serialUnitId],
        conditionNotes: 'Identity label matched the original counter sale evidence.',
      }],
    }, 'quality-priya');
    const rejected = decideRetailReturn(inspected, {
      id: 'serial-return-01',
      decision: 'rejected',
      evidenceReference: 'REJECT-SERIAL-RETURN-01',
      expectedVersion: 2,
    }, 'store-manager');

    const reRequested = createRetailReturnRequest(rejected, {
      ...firstInput,
      transactionKey: 'serial-return-01-20260715-0003',
    }, 'counter-associate', 'serial-return-03');
    expect(reRequested.retailReturns).toEqual([
      expect.objectContaining({ id: 'serial-return-03', status: 'requested' }),
      expect.objectContaining({ id: 'serial-return-01', status: 'rejected' }),
    ]);
  });

  it('re-enters a resalable inspected return only after an independent approval and prepares the COGS reversal', () => {
    const sale = completedRetailSale();
    const requested = createRetailReturnRequest(sale.state, returnRequest(sale), 'counter-associate', 'retail-return-01');
    const inspected = inspectRetailReturn(requested, {
      id: 'retail-return-01',
      expectedVersion: 1,
      inspectionReference: 'INSPECT-RETURN-01',
      lines: [{
        retailReturnLineId: requested.retailReturns[0]!.lines[0]!.id,
        outcome: 'resalable',
        destinationBinId: 'bin-store-shelf',
        serialUnitIds: [],
        conditionNotes: 'Factory seal and batch label verified intact.',
      }],
    }, 'quality-priya', '2026-07-15T10:10:00.000Z');

    expect(() => decideRetailReturn(inspected, {
      id: 'retail-return-01', decision: 'approved', evidenceReference: 'APPROVE-RETURN-01', expectedVersion: 2,
    }, 'quality-priya', '2026-07-15T10:11:00.000Z')).toThrow('independent');

    const approved = decideRetailReturn(inspected, {
      id: 'retail-return-01', decision: 'approved', evidenceReference: 'APPROVE-RETURN-01', expectedVersion: 2,
    }, 'store-manager', '2026-07-15T10:12:00.000Z');
    const returnCase = approved.retailReturns[0]!;

    expect(returnCase).toMatchObject({
      status: 'approved', approvedBy: 'store-manager', cogsReversalJournalDraftId: expect.any(String),
      lines: [expect.objectContaining({ inspection: expect.objectContaining({ outcome: 'resalable', destinationBinId: 'bin-store-shelf' }) })],
    });
    expect(approved.binBalances.find(({ binId }) => binId === 'bin-store-shelf')).toMatchObject({ quantity: 19, available: 19, inventoryValue: 1900 });
    expect(approved.inventoryLedger.filter(({ type }) => type === 'return')).toEqual([
      expect.objectContaining({ quantity: 1, value: 100, unitCost: 100, reference: returnCase.number }),
    ]);
    expect(approved.journalDrafts.find(({ id }) => id === returnCase.cogsReversalJournalDraftId)).toMatchObject({
      sourceType: 'retail-return-cost', sourceId: returnCase.id, totalDebit: 100, totalCredit: 100,
      lines: [
        { accountCode: 'inventory-asset', debit: 100, credit: 0, memo: returnCase.number },
        { accountCode: 'cost-of-goods-sold', debit: 0, credit: 100, memo: returnCase.number },
      ],
    });
  });

  it('quarantines a damaged return without making it sellable in the legacy stock projection', () => {
    const sale = completedRetailSale();
    const requested = createRetailReturnRequest(sale.state, returnRequest(sale), 'counter-associate', 'retail-return-01');
    const inspected = inspectRetailReturn(requested, {
      id: 'retail-return-01', expectedVersion: 1, inspectionReference: 'INSPECT-RETURN-02',
      lines: [{
        retailReturnLineId: requested.retailReturns[0]!.lines[0]!.id,
        outcome: 'damaged', destinationBinId: 'bin-store-quarantine', serialUnitIds: [],
        conditionNotes: 'Outer pack torn; isolate for damage disposition.',
      }],
    }, 'quality-priya');
    const approved = decideRetailReturn(inspected, {
      id: 'retail-return-01', decision: 'approved', evidenceReference: 'APPROVE-RETURN-02', expectedVersion: 2,
    }, 'store-manager');

    expect(approved.retailReturns[0]!.lines[0]!.inspection).toMatchObject({ outcome: 'damaged', destinationBinId: 'bin-store-quarantine' });
    expect(approved.binBalances.find(({ binId }) => binId === 'bin-store-quarantine')).toMatchObject({ quantity: 1, available: 1, inventoryValue: 100 });
    expect(approved.stockPositions.find(({ locationId }) => locationId === 'location-store')).toMatchObject({ onHand: 18, available: 18 });
  });
});

describe('governed retail return financial credit and settlement', () => {
  it('freezes GST and cess credit evidence at approval, then makes an independently approved cash refund reduce the drawer expectation exactly once', () => {
    const sale = completedRetailSale();
    const approved = approvedRetailReturn(sale);
    const returnCase = approved.retailReturns[0]!;

    expect(returnCase.financialCredit).toMatchObject({
      status: 'open',
      issuedAmount: 160.65,
      availableAmount: 160.65,
      reservedAmount: 0,
      settledAmount: 0,
      gstCreditEvidence: {
        sourceInvoiceId: returnCase.invoiceId,
        taxableValue: 135,
        cgst: 12.15,
        sgst: 12.15,
        igst: 0,
        cess: 1.35,
        totalTax: 25.65,
        totalCredit: 160.65,
        lines: [expect.objectContaining({ hsnSac: '0902', taxableValue: 135, cgst: 12.15, sgst: 12.15, cess: 1.35, totalCredit: 160.65 })],
      },
    });

    const settlementInput = {
      retailReturnId: returnCase.id,
      expectedVersion: returnCase.version,
      transactionKey: 'return-cash-refund-20260715-0001',
      method: 'cash-refund' as const,
      amount: 160.65,
      cashierShiftId: 'shift-store-01',
      evidenceReference: 'CASH-REFUND-REQUEST-01',
    };
    const requested = requestRetailReturnSettlement(approved, settlementInput, 'cashier-ava', 'settlement-cash-01', '2026-07-15T10:20:00.000Z');
    expect(requested.retailReturns[0]!.financialCredit).toMatchObject({ availableAmount: 0, reservedAmount: 160.65, settledAmount: 0 });
    expect(requestRetailReturnSettlement(requested, settlementInput, 'cashier-ava', 'ignored', '2026-07-15T10:21:00.000Z')).toBe(requested);
    expect(() => requestRetailReturnSettlement(requested, { ...settlementInput, amount: 100 }, 'cashier-ava', 'settlement-cash-02')).toThrow('idempotency key');

    expect(() => decideRetailReturnSettlement(requested, {
      retailReturnId: returnCase.id,
      settlementId: 'settlement-cash-01',
      expectedVersion: requested.retailReturns[0]!.version,
      decision: 'approved',
      evidenceReference: 'CASH-REFUND-APPROVE-01',
    }, 'cashier-ava')).toThrow('independent');

    const settled = decideRetailReturnSettlement(requested, {
      retailReturnId: returnCase.id,
      settlementId: 'settlement-cash-01',
      expectedVersion: requested.retailReturns[0]!.version,
      decision: 'approved',
      evidenceReference: 'CASH-REFUND-APPROVE-01',
    }, 'finance-manager', '2026-07-15T10:25:00.000Z');
    const settledReturn = settled.retailReturns[0]!;
    expect(settledReturn.financialCredit).toMatchObject({ status: 'settled', availableAmount: 0, reservedAmount: 0, settledAmount: 160.65 });
    expect(settledReturn.financialCredit!.settlements).toEqual([
      expect.objectContaining({ id: 'settlement-cash-01', method: 'cash-refund', status: 'cash-refunded', amount: 160.65, cashierShiftId: 'shift-store-01' }),
    ]);
    expect(settledReturn.financialCredit!.gstCreditEvidence.totalCredit).toBe(160.65);

    const close = requestRetailCashierShiftClose(settled, {
      id: 'shift-store-01',
      expectedVersion: 1,
      declaredCash: 160.65,
      evidenceReference: 'DRAWER-COUNT-01',
    }, 'cashier-ava', '2026-07-15T11:00:00.000Z');
    expect(close.retailCashierShifts[0]).toMatchObject({ expectedCash: 160.65, variance: 0 });
  });

  it('holds a provider refund against the frozen balance until an independent provider confirmation and never treats it as cash', () => {
    const sale = completedRetailSale({ tenderMethod: 'upi' });
    const approved = approvedRetailReturn(sale);
    const returnCase = approved.retailReturns[0]!;
    const requested = requestRetailReturnSettlement(approved, {
      retailReturnId: returnCase.id,
      expectedVersion: returnCase.version,
      transactionKey: 'return-upi-refund-20260715-0001',
      method: 'provider-refund',
      amount: 160.65,
      providerMethod: 'upi',
      providerReference: 'UPI-REFUND-REQUEST-01',
      evidenceReference: 'UPI-REFUND-REQUEST-01',
    }, 'returns-desk', 'settlement-upi-01', '2026-07-15T10:20:00.000Z');
    const pending = decideRetailReturnSettlement(requested, {
      retailReturnId: returnCase.id,
      settlementId: 'settlement-upi-01',
      expectedVersion: requested.retailReturns[0]!.version,
      decision: 'approved',
      evidenceReference: 'UPI-REFUND-APPROVE-01',
    }, 'finance-manager', '2026-07-15T10:25:00.000Z');
    expect(pending.retailReturns[0]!.financialCredit).toMatchObject({ availableAmount: 0, reservedAmount: 160.65, settledAmount: 0 });
    expect(pending.retailReturns[0]!.financialCredit!.settlements[0]).toMatchObject({ status: 'provider-refund-pending', providerMethod: 'upi' });

    const confirmation = {
      retailReturnId: returnCase.id,
      settlementId: 'settlement-upi-01',
      expectedVersion: pending.retailReturns[0]!.version,
      transactionKey: 'provider-confirm-20260715-0001',
      decision: 'confirmed' as const,
      providerConfirmationReference: 'UPI-REFUND-CONFIRMED-01',
    };
    const confirmed = confirmRetailReturnProviderRefund(pending, confirmation, 'payments-reconciler', '2026-07-15T10:30:00.000Z');
    expect(confirmed.retailReturns[0]!.financialCredit).toMatchObject({ status: 'settled', availableAmount: 0, reservedAmount: 0, settledAmount: 160.65 });
    expect(confirmed.retailReturns[0]!.financialCredit!.settlements[0]).toMatchObject({ status: 'provider-refunded', confirmedBy: 'payments-reconciler' });
    expect(confirmRetailReturnProviderRefund(confirmed, confirmation, 'payments-reconciler', '2026-07-15T10:31:00.000Z')).toBe(confirmed);
  });

  it('issues a dedicated named-customer store credit rather than a generic receivable adjustment', () => {
    const sale = completedRetailSale({ customerAccountId: 'account-named-customer' });
    const approved = approvedRetailReturn(sale);
    const returnCase = approved.retailReturns[0]!;
    expect(() => requestRetailReturnSettlement(approved, {
      retailReturnId: returnCase.id,
      expectedVersion: returnCase.version,
      transactionKey: 'return-walkin-credit-20260715-0001',
      method: 'store-credit',
      amount: 160.65,
      storeCreditAccountId: 'account-walk-in',
      evidenceReference: 'STORE-CREDIT-REQUEST-REJECT',
    }, 'returns-desk')).toThrow('named customer');

    const requested = requestRetailReturnSettlement(approved, {
      retailReturnId: returnCase.id,
      expectedVersion: returnCase.version,
      transactionKey: 'return-store-credit-20260715-0001',
      method: 'store-credit',
      amount: 160.65,
      storeCreditAccountId: 'account-named-customer',
      evidenceReference: 'STORE-CREDIT-REQUEST-01',
    }, 'returns-desk', 'settlement-credit-01', '2026-07-15T10:20:00.000Z');
    const issued = decideRetailReturnSettlement(requested, {
      retailReturnId: returnCase.id,
      settlementId: 'settlement-credit-01',
      expectedVersion: requested.retailReturns[0]!.version,
      decision: 'approved',
      evidenceReference: 'STORE-CREDIT-APPROVE-01',
    }, 'finance-manager', '2026-07-15T10:25:00.000Z');
    expect(issued.retailStoreCredits).toEqual([
      expect.objectContaining({ customerAccountId: 'account-named-customer', issuedAmount: 160.65, availableAmount: 160.65, status: 'active', retailReturnId: returnCase.id }),
    ]);
    expect(issued.retailReturns[0]!.financialCredit!.settlements[0]).toMatchObject({ method: 'store-credit', status: 'store-credit-issued', storeCreditId: issued.retailStoreCredits[0]!.id });
    expect(issued.journalDrafts.some((j) => j.sourceType === 'retail-return-settlement')).toBe(true);
    expect(issued.receivables).toHaveLength(1);
    expect(issued.creditDebitNotes).toHaveLength(0);
  });
});

describe('governed retail exchange conversion', () => {
  it('converts an approved named-customer return credit into one independently approved replacement sale, exact top-up, settlement, and cost evidence', () => {
    const sale = completedRetailSale({ customerAccountId: 'account-named-customer' });
    const approvedReturn = approvedRetailReturn(sale);
    const returnCase = approvedReturn.retailReturns[0]!;

    const requested = createRetailExchange(approvedReturn, {
      retailReturnId: returnCase.id,
      counterId: 'counter-store-01',
      cashierShiftId: 'shift-store-01',
      transactionKey: 'exchange-01-20260715-0001',
      replacementLines: [{
        itemVariantId: 'variant-retail-tea',
        binId: 'bin-store-shelf',
        batchId: sale.batchId,
        serialUnitIds: [],
        quantity: 1,
      }],
      topUpTender: {
        method: 'upi',
        amount: 17.85,
        reference: 'UPI-EXCHANGE-0001',
      },
    }, 'cashier-ava', '11111111-1111-4111-8111-111111111111', '2026-07-15T10:20:00.000Z');

    const exchange = requested.retailExchanges[0]!;
    expect(exchange).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'requested',
      retailReturnId: returnCase.id,
      creditApplied: 160.65,
      replacementGrandTotal: 178.5,
      netTopUp: 17.85,
      topUpTender: { method: 'upi', amount: 17.85, reference: 'UPI-EXCHANGE-0001' },
    });
    expect(requested.retailReturns[0]!.financialCredit).toMatchObject({
      availableAmount: 160.65,
      reservedAmount: 0,
      settledAmount: 0,
    });

    const completed = decideRetailExchange(requested, {
      id: exchange.id,
      decision: 'approved',
      expectedVersion: exchange.version,
      evidenceReference: 'EXCHANGE-APPROVAL-01',
    }, 'finance-manager', '2026-07-15T10:25:00.000Z');

    const approvedExchange = completed.retailExchanges[0]!;
    const replacementSale = completed.retailSales.find((candidate) => candidate.id === approvedExchange.replacementSaleId)!;
    expect(approvedExchange).toMatchObject({
      status: 'approved',
      approvedBy: 'finance-manager',
      replacementSaleId: replacementSale.id,
      replacementInvoiceId: replacementSale.invoiceId,
      replacementPaymentReceiptIds: replacementSale.paymentReceiptIds,
      replacementCostTotal: 100,
      replacementCostJournalDraftId: expect.any(String),
    });
    expect(replacementSale).toMatchObject({
      status: 'completed',
      transactionKey: 'exchange:exchange-01-20260715-0001',
      customerAccountId: 'account-named-customer',
      taxPreview: { grandTotal: 178.5 },
    });
    expect(completed.retailReturns[0]!.financialCredit).toMatchObject({
      status: 'settled',
      availableAmount: 0,
      reservedAmount: 0,
      settledAmount: 160.65,
      settlements: [expect.objectContaining({ method: 'store-credit', status: 'store-credit-issued', amount: 160.65 })],
    });
    expect(completed.journalDrafts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: approvedExchange.replacementCostJournalDraftId,
        sourceType: 'retail-return-settlement',
        totalDebit: 160.65,
        totalCredit: 160.65,
      }),
    ]));
  });

  it('rejects a same-actor approval and preserves the source return credit for a rejected exchange', () => {
    const sale = completedRetailSale({ customerAccountId: 'account-named-customer' });
    const approvedReturn = approvedRetailReturn(sale);
    const requested = createRetailExchange(approvedReturn, {
      retailReturnId: approvedReturn.retailReturns[0]!.id,
      counterId: 'counter-store-01',
      cashierShiftId: 'shift-store-01',
      transactionKey: 'exchange-02-20260715-0001',
      replacementLines: [{
        itemVariantId: 'variant-retail-tea',
        binId: 'bin-store-shelf',
        batchId: sale.batchId,
        serialUnitIds: [],
        quantity: 1,
      }],
      topUpTender: { method: 'cash', amount: 17.85, reference: 'CASH-EXCHANGE-0001' },
    }, 'cashier-ava', '22222222-2222-4222-8222-222222222222', '2026-07-15T10:20:00.000Z');

    const exchange = requested.retailExchanges[0]!;
    expect(() => decideRetailExchange(requested, {
      id: exchange.id,
      decision: 'approved',
      expectedVersion: exchange.version,
      evidenceReference: 'SELF-APPROVAL-MUST-FAIL',
    }, 'cashier-ava', '2026-07-15T10:25:00.000Z')).toThrow('independent reviewer');

    const rejected = decideRetailExchange(requested, {
      id: exchange.id,
      decision: 'rejected',
      expectedVersion: exchange.version,
      evidenceReference: 'CUSTOMER-DECLINED-TOPUP',
    }, 'finance-manager', '2026-07-15T10:25:00.000Z');

    expect(rejected.retailExchanges[0]).toMatchObject({ status: 'rejected', rejectedBy: 'finance-manager' });
    expect(rejected.retailSales).toHaveLength(1);
    expect(rejected.retailReturns[0]!.financialCredit).toMatchObject({
      status: 'open', availableAmount: 160.65, reservedAmount: 0, settledAmount: 0,
    });
  });
});
