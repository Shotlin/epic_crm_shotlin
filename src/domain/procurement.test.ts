import { describe, expect, it } from 'vitest';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createInventoryItem, createItemVariant, createStorageBin, createWarehouse, createWarehouseZone, generateReorderProposals, decideReorderProposal } from './inventory-warehouse';
import { awardRfq, createLandedCost, createPurchaseOrderFromReorder, createPurchaseOrderFromRfq, createPurchaseRequisition, createRfq, createRfqFromRequisition, createSupplier, decideLandedCost, decidePurchaseOrder, decidePurchaseRequisition, decideSupplier, decideThreeWayMatch, evaluateRetailLandedMargin, issueRfq, recordGoodsReceipt, recordSupplierInvoice, recordSupplierQuotation, updateRetailPriceForTargetMargin } from './procurement';

const T0 = '2026-07-15T08:00:00.000Z';

function foundation(): RevenueOpsState {
  const state = createInitialRevenueOpsState();
  state.products = state.products.map((product) => product.id === 'product-distributor-platform' ? { ...product, kind: 'goods', uom: 'UNIT' } : product);
  state.stockLocations = [{ id: 'loc-mum', code: 'MUM', name: 'Mumbai stock', stateCode: '27', active: true, version: 1 }];
  let next = createInventoryItem(state, { productId: 'product-distributor-platform', code: 'FILTER', name: 'Industrial filter', baseUomId: 'uom-unit', tracking: 'batch', valuationMethod: 'fifo', shelfLifeDays: 365 }, 'item-filter');
  next = createItemVariant(next, { itemId: 'item-filter', sku: 'FILTER-20', name: '20 micron filter', attributes: { micron: '20' } }, 'variant-filter');
  next = createWarehouse(next, { code: 'MUM-DC', name: 'Mumbai distribution centre', stateCode: '27', stockLocationId: 'loc-mum' }, 'wh-mum');
  next = createWarehouseZone(next, { warehouseId: 'wh-mum', code: 'RCV', name: 'Inbound receiving', purpose: 'receiving' }, 'zone-mum-rcv');
  return createStorageBin(next, { zoneId: 'zone-mum-rcv', code: 'RCV-01', name: 'Receipt dock 01', capacity: 1000, pickSequence: 1 }, 'bin-mum-rcv');
}

function qualifiedSupplier(state: RevenueOpsState): RevenueOpsState {
  const proposed = createSupplier(state, { code: 'ACME-SUP', legalName: 'Acme Industrial Supplies Private Limited', gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F', stateCode: '27', email: 'ops@acme.example', paymentTermDays: 30, categories: ['Filters'], riskRating: 'low', qualificationEvidence: 'GST and commercial references independently reviewed.' }, 'user-maker', 'supplier-1', T0);
  expect(() => decideSupplier(proposed, { id: 'supplier-1', decision: 'approved', remarks: 'Approved commercial and statutory onboarding evidence.', expectedVersion: 1 }, 'user-maker')).toThrow('maker');
  return decideSupplier(proposed, { id: 'supplier-1', decision: 'approved', remarks: 'Approved commercial and statutory onboarding evidence.', expectedVersion: 1 }, 'user-checker', '2026-07-15T09:00:00.000Z');
}

describe('procurement command controls', () => {
  it('qualifies suppliers, compares RFQ bids and creates an independently approved purchase order', () => {
    const suppliers = qualifiedSupplier(foundation());
    const crossScope = {
      ...suppliers,
      suppliers: suppliers.suppliers.map((supplier) => ({ ...supplier, scope: { companyId: 'company-other', branchId: 'branch-other' } })),
    };
    expect(() => createRfq(crossScope, { title: 'Cross-scope replenishment', warehouseId: 'wh-mum', supplierIds: ['supplier-1'], lines: [{ itemVariantId: 'variant-filter', quantity: 20 }], requiredBy: '2026-08-15' }, 'user-maker', 'rfq-cross-scope', T0)).toThrow('one company and branch scope');
    const drafted = createRfq(suppliers, { title: 'Q3 filter replenishment', warehouseId: 'wh-mum', supplierIds: ['supplier-1'], lines: [{ itemVariantId: 'variant-filter', quantity: 20 }], requiredBy: '2026-08-15' }, 'user-maker', 'rfq-1', T0);
    expect(drafted.requestForQuotations[0]?.scope).toEqual(drafted.scope);
    const issued = issueRfq(drafted, { id: 'rfq-1', expectedVersion: 1 });
    const bid = recordSupplierQuotation(issued, { rfqId: 'rfq-1', supplierId: 'supplier-1', validUntil: '2026-08-01', leadTimeDays: 8, lines: [{ rfqLineId: issued.requestForQuotations[0]!.lines[0]!.id, unitPrice: 125, gstRate: 18 }], commercialRemarks: 'Freight extra at actuals.' }, 'user-buyer', 'quote-1', '2026-07-15T10:00:00.000Z');
    expect(() => awardRfq(bid, { rfqId: 'rfq-1', supplierQuotationId: 'quote-1', expectedVersion: 2 }, 'user-maker')).toThrow('maker');
    const awarded = awardRfq(bid, { rfqId: 'rfq-1', supplierQuotationId: 'quote-1', expectedVersion: 2 }, 'user-checker', '2026-07-15T11:00:00.000Z');
    const po = createPurchaseOrderFromRfq(awarded, { rfqId: 'rfq-1', supplierQuotationId: 'quote-1', deliveryBy: '2026-08-10' }, 'user-maker', 'po-1', '2026-07-15T12:00:00.000Z');
    expect(po.purchaseOrders[0]).toMatchObject({ number: 'PO-26-27-00001', status: 'submitted', totalAmount: 2950 });
    expect(po.purchaseOrders[0]?.scope).toEqual(po.scope);
    expect(() => decidePurchaseOrder(po, { id: 'po-1', decision: 'approved', remarks: 'Approve within approved sourcing and budget evidence.', expectedVersion: 1 }, 'user-maker')).toThrow('maker');
    const approved = decidePurchaseOrder(po, { id: 'po-1', decision: 'approved', remarks: 'Approve within approved sourcing and budget evidence.', expectedVersion: 1 }, 'user-checker', '2026-07-15T13:00:00.000Z');
    expect(approved.purchaseOrders[0]).toMatchObject({ status: 'approved', decidedBy: 'user-checker' });
  });

  it('receives purchase orders through the warehouse ledger and capitalises landed cost independently', () => {
    const suppliers = qualifiedSupplier(foundation());
    const rfq = issueRfq(createRfq(suppliers, { title: 'Inbound filters', warehouseId: 'wh-mum', supplierIds: ['supplier-1'], lines: [{ itemVariantId: 'variant-filter', quantity: 20 }], requiredBy: '2026-08-15' }, 'user-maker', 'rfq-1', T0), { id: 'rfq-1', expectedVersion: 1 });
    const quoted = recordSupplierQuotation(rfq, { rfqId: 'rfq-1', supplierId: 'supplier-1', validUntil: '2026-08-01', leadTimeDays: 8, lines: [{ rfqLineId: rfq.requestForQuotations[0]!.lines[0]!.id, unitPrice: 125, gstRate: 18 }] }, 'user-buyer', 'quote-1', T0);
    const awarded = awardRfq(quoted, { rfqId: 'rfq-1', supplierQuotationId: 'quote-1', expectedVersion: 2 }, 'user-checker', T0);
    const approved = decidePurchaseOrder(createPurchaseOrderFromRfq(awarded, { rfqId: 'rfq-1', supplierQuotationId: 'quote-1', deliveryBy: '2026-08-10' }, 'user-maker', 'po-1', T0), { id: 'po-1', decision: 'approved', remarks: 'Approved procurement commitment.', expectedVersion: 1 }, 'user-checker', T0);
    const receipt = recordGoodsReceipt(approved, { purchaseOrderId: 'po-1', receivingBinId: 'bin-mum-rcv', receivedAt: '2026-07-20', lines: [{ purchaseOrderLineId: approved.purchaseOrders[0]!.lines[0]!.id, quantity: 20, batchNumber: 'B-260720', manufacturedAt: '2026-07-01', expiresAt: '2027-07-01', serialNumbers: [] }] }, 'user-warehouse', 'grn-1', '2026-07-20T12:00:00.000Z');
    expect(receipt.goodsReceipts[0]).toMatchObject({ status: 'cost-pending', number: 'GRN-26-27-00001' });
    expect(receipt.purchaseOrders[0]).toMatchObject({ status: 'received' });
    expect(receipt.inventoryLedger[0]).toMatchObject({ type: 'receipt', reference: 'GRN-26-27-00001-01' });
    const pending = createLandedCost(receipt, { goodsReceiptId: 'grn-1', basis: 'value', charges: [{ description: 'Freight inward', amount: 500 }, { description: 'Insurance', amount: 100 }] }, 'user-maker', 'landed-1', '2026-07-20T13:00:00.000Z');
    expect(() => decideLandedCost(pending, { id: 'landed-1', decision: 'approved', remarks: 'Freight and insurance evidence reviewed.', expectedVersion: 1 }, 'user-maker')).toThrow('maker');
    const costed = decideLandedCost(pending, { id: 'landed-1', decision: 'approved', remarks: 'Freight and insurance evidence reviewed.', expectedVersion: 1 }, 'user-checker', '2026-07-20T14:00:00.000Z');
    expect(costed.goodsReceipts[0]).toMatchObject({ status: 'costed' });
    expect(costed.inventoryCostLayers[0]).toMatchObject({ unitCost: 155 });
    expect(costed.journalDrafts[0]).toMatchObject({ sourceType: 'landed-cost', totalDebit: 600, totalCredit: 600 });
  });

  it('matches PO, receipt and supplier invoice, and routes price variance to an independent checker', () => {
    let state = qualifiedSupplier(foundation());
    state.reorderPolicies = [{ id: 'policy-1', itemVariantId: 'variant-filter', warehouseId: 'wh-mum', minimumQuantity: 5, reorderPoint: 10, maximumQuantity: 20, safetyStock: 5, leadTimeDays: 7, active: true, version: 1 }];
    state = generateReorderProposals(state, '2026-07-15T08:00:00.000Z');
    state = decideReorderProposal(state, { id: state.reorderProposals[0]!.id, decision: 'approved', expectedVersion: 1 }, 'user-checker');
    const po = createPurchaseOrderFromReorder(state, { reorderProposalId: state.reorderProposals[0]!.id, supplierId: 'supplier-1', warehouseId: 'wh-mum', unitPrice: 125, gstRate: 18, deliveryBy: '2026-08-10' }, 'user-maker', 'po-1', T0);
    const approved = decidePurchaseOrder(po, { id: 'po-1', decision: 'approved', remarks: 'Replenishment commitment approved.', expectedVersion: 1 }, 'user-checker', T0);
    const receipt = recordGoodsReceipt(approved, { purchaseOrderId: 'po-1', receivingBinId: 'bin-mum-rcv', receivedAt: '2026-07-20', lines: [{ purchaseOrderLineId: approved.purchaseOrders[0]!.lines[0]!.id, quantity: 20, batchNumber: 'B-260720', expiresAt: '2027-07-01', serialNumbers: [] }] }, 'user-warehouse', 'grn-1', '2026-07-20T12:00:00.000Z');
    const invoice = recordSupplierInvoice(receipt, { purchaseOrderId: 'po-1', goodsReceiptId: 'grn-1', supplierInvoiceNumber: 'ACME-INV-1001', invoiceDate: '2026-07-20', lines: [{ purchaseOrderLineId: receipt.purchaseOrders[0]!.lines[0]!.id, quantity: 20, unitPrice: 140, gstRate: 18 }] }, 'user-finance', 'vin-1', '2026-07-20T15:00:00.000Z');
    expect(invoice.threeWayMatches[0]).toMatchObject({ status: 'variance-review', priceVariance: 300 });
    expect(() => decideThreeWayMatch(invoice, { id: invoice.threeWayMatches[0]!.id, decision: 'approved', remarks: 'Price variance approved against revised vendor confirmation.', expectedVersion: 1 }, 'user-finance')).toThrow('maker');
    const approvedMatch = decideThreeWayMatch(invoice, { id: invoice.threeWayMatches[0]!.id, decision: 'approved', remarks: 'Price variance approved against revised vendor confirmation.', expectedVersion: 1 }, 'user-checker', '2026-07-20T16:00:00.000Z');
    expect(approvedMatch.threeWayMatches[0]).toMatchObject({ status: 'approved', decidedBy: 'user-checker' });
    expect(approvedMatch.journalDrafts[0]).toMatchObject({ sourceType: 'supplier-invoice', totalDebit: 3304, totalCredit: 3304 });
  });

  it('raises a purchase requisition, approves it independently and sources an RFQ from it', () => {
    const suppliers = qualifiedSupplier(foundation());
    const raised = createPurchaseRequisition(suppliers, { title: 'Line 3 filter demand', warehouseId: 'wh-mum', priority: 'high', neededBy: '2026-08-15', justification: 'Preventive maintenance stock is below the safety threshold.', lines: [{ itemVariantId: 'variant-filter', quantity: 20, estimatedUnitPrice: 120 }] }, 'user-maker', 'pr-1', T0);
    expect(raised.purchaseRequisitions[0]).toMatchObject({ status: 'submitted', number: 'PR-26-27-00001', estimatedValue: 2400, requestedBy: 'user-maker' });
    expect(raised.purchaseRequisitions[0]?.scope).toEqual(raised.scope);
    expect(() => decidePurchaseRequisition(raised, { id: 'pr-1', decision: 'approved', remarks: 'Demand and justification reviewed.', expectedVersion: 1 }, 'user-maker')).toThrow('maker');
    const approved = decidePurchaseRequisition(raised, { id: 'pr-1', decision: 'approved', remarks: 'Demand and justification reviewed.', expectedVersion: 1 }, 'user-checker', '2026-07-15T10:00:00.000Z');
    expect(approved.purchaseRequisitions[0]).toMatchObject({ status: 'approved', decidedBy: 'user-checker', version: 2 });
    const sourced = createRfqFromRequisition(approved, { requisitionId: 'pr-1', supplierIds: ['supplier-1'], requiredBy: '2026-08-15', expectedVersion: 2 }, 'user-buyer', 'rfq-1', '2026-07-15T11:00:00.000Z');
    expect(sourced.requestForQuotations[0]).toMatchObject({ title: 'Line 3 filter demand', status: 'draft' });
    expect(sourced.purchaseRequisitions[0]).toMatchObject({ status: 'converted', convertedRfqId: 'rfq-1', version: 3 });
    expect(() => createRfqFromRequisition(sourced, { requisitionId: 'pr-1', supplierIds: ['supplier-1'], requiredBy: '2026-08-15', expectedVersion: 3 }, 'user-buyer', 'rfq-2', '2026-07-15T12:00:00.000Z')).toThrow('approved purchase requisition');
  });

  it('evaluates retail landed margin and updates retail price book for target margin', () => {
    let state = foundation();
    // Add a retail price list and price entry for product-distributor-platform
    state = {
      ...state,
      priceLists: [
        {
          id: 'price-list-retail',
          code: 'RETAIL-01',
          name: 'Retail Price Book',
          currency: 'INR',
          channel: 'retail',
          active: true,
          status: 'active',
          effectiveFrom: '2026-01-01',
          effectiveTo: '2029-12-31',
          scope: state.scope,
          version: 1,
        },
      ],
      priceListEntries: [
        {
          id: 'entry-01',
          priceListId: 'price-list-retail',
          productId: 'product-distributor-platform',
          minimumQuantity: 1,
          unitPrice: 200,
          effectiveFrom: '2026-01-01',
          effectiveTo: '2029-12-31',
          version: 1,
        },
      ],
    };

    // If landed cost is 160 on a retail price of 200, margin % = (200 - 160) / 200 = 20%
    const evalResult = evaluateRetailLandedMargin(state, 'variant-filter', 160, 25.0);
    expect(evalResult.isBelowTarget).toBe(true);
    expect(evalResult.grossMarginPercent).toBe(20);
    expect(evalResult.recommendedUnitPrice).toBe(213.33);

    // Update retail price book to recommended 213.33
    const updated = updateRetailPriceForTargetMargin(state, 'variant-filter', 213.33, 'category-manager');
    const updatedEntry = updated.priceListEntries.find(({ priceListId, productId }) => priceListId === 'price-list-retail' && productId === 'product-distributor-platform');
    expect(updatedEntry?.unitPrice).toBe(213.33);
  });
});
