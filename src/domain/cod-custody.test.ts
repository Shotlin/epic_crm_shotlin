import { describe, expect, it } from 'vitest';
import {
  createCodCollectionCase,
  matchCodBank,
  recordCodCarrierCollection,
  recordCodHandover,
  recordCodRemittance,
} from './cod-custody';
import { createInitialRevenueOpsState } from './revenue-ops';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

const CREATED_AT = '2026-07-15T06:00:00.000Z';
const HANDOVER_AT = '2026-07-16T06:00:00.000Z';
const COLLECTION_AT = '2026-07-17T06:00:00.000Z';
const REMITTANCE_AT = '2026-07-18T06:00:00.000Z';
const COD_CASE_ID = '11111111-1111-4111-8111-111111111111';

function custodyState(): RevenueOpsState {
  const initial = createInitialRevenueOpsState();
  const scope = initial.scope;
  const taxPreview = {
    treatment: 'intra-state' as const,
    taxableValue: 1_000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    totalTax: 180,
    grandTotal: 1_180,
    determination: 'commercial-estimate' as const,
  };
  return {
    ...initial,
    salesOrders: [{
      id: 'order-cod-001', number: 'SO-26-27-0001', quoteId: 'quote-cod-001', quoteNumber: 'Q-26-27-0001',
      accountId: 'account-cod-001', currency: 'INR', orderDate: '2026-07-15', requiredBy: '2026-07-20',
      status: 'fulfilling', fulfilmentStatus: 'in-progress', lines: [], subtotal: 1_000, discountTotal: 0,
      taxPreview, approvedQuoteVersion: 1, createdBy: 'user-maker', createdAt: CREATED_AT, scope, version: 1,
    }],
    deliveryPromises: [{
      id: 'promise-cod-001', salesOrderId: 'order-cod-001',
      shipToAddress: { addressId: 'address-cod-001', label: 'Mumbai delivery', line1: 'BKC', line2: '', city: 'Mumbai', stateCode: '27', postalCode: '400051', countryCode: 'IN', sourceVersion: 1, capturedAt: CREATED_AT },
      originLocationId: 'location-cod-001', carrierAdapterId: 'carrier-cod-001', ruleId: 'rule-cod-001', ruleCode: 'MUM-COD', ruleVersion: 1,
      serviceLevel: 'standard', paymentMode: 'cod', estimatedWeightKg: 1, orderValue: 1_000,
      dispatchBy: '2026-07-16', deliveryFrom: '2026-07-17', deliveryTo: '2026-07-19', timeZone: 'Asia/Kolkata',
      calendarBasis: 'weekly-policy-only', calculationFingerprint: 'cod-fingerprint', status: 'active', createdBy: 'user-maker', createdAt: CREATED_AT, scope, version: 1,
    }],
    shipmentPackages: [{
      id: 'shipment-cod-001', number: 'SHP-26-27-0001', salesOrderId: 'order-cod-001', fromLocationId: 'location-cod-001', shipToAddressId: 'address-cod-001',
      deliveryPromiseId: 'promise-cod-001', items: [], grossWeightKg: 1, lengthCm: 10, widthCm: 10, heightCm: 10,
      status: 'dispatched', ewayBillRequired: false, carrierAdapterId: 'carrier-cod-001', trackingNumber: 'TRACK-COD-001',
      dispatchedAt: HANDOVER_AT, createdBy: 'user-maker', createdAt: CREATED_AT, scope, version: 1,
    }],
    carrierAdapters: [{
      id: 'carrier-cod-001', code: 'COD-CARRIER', name: 'Domestic carrier', mode: 'manual', status: 'configured',
      capability: ['tracking'], scope, version: 1,
    }],
    invoices: [{
      id: 'invoice-cod-001', number: 'INV-26-27-0001', documentKind: 'tax-invoice', salesOrderId: 'order-cod-001', quoteId: 'quote-cod-001',
      accountId: 'account-cod-001', recipientTreatment: 'registered', recipientGstin: '27ABCDE1234F1Z5', placeOfSupplyStateCode: '27',
      reverseCharge: false, currency: 'INR', invoiceDate: '2026-07-15', dueDate: '2026-07-20', paymentTermId: 'term-cod-001',
      status: 'issued', irpStatus: 'not-applicable', serviceMilestoneIds: [], shipmentPackageIds: ['shipment-cod-001'], lines: [], subtotal: 1_000, discountTotal: 0,
      taxPreview, amountDue: 1_000, createdBy: 'user-maker', createdAt: CREATED_AT, issuedBy: 'user-finance', issuedAt: CREATED_AT, scope, version: 1,
    }],
    receivables: [{
      id: 'receivable-cod-001', invoiceId: 'invoice-cod-001', accountId: 'account-cod-001', invoiceNumber: 'INV-26-27-0001',
      invoiceDate: '2026-07-15', dueDate: '2026-07-20', originalAmount: 1_000, adjustmentAmount: 0, paidAmount: 0,
      outstandingAmount: 1_000, status: 'current', scope, version: 1,
    }],
  };
}

function createCase(state: RevenueOpsState, now = CREATED_AT): RevenueOpsState {
  return createCodCollectionCase(state, {
    deliveryPromiseId: 'promise-cod-001', shipmentPackageId: 'shipment-cod-001', salesOrderId: 'order-cod-001', carrierAdapterId: 'carrier-cod-001', receivableId: 'receivable-cod-001',
    expectedDeliveryPromiseVersion: 1, expectedShipmentVersion: 1, expectedSalesOrderVersion: 1, expectedCarrierVersion: 1, expectedReceivableVersion: 1,
  }, 'user-maker', COD_CASE_ID, now);
}

function handOver(state: RevenueOpsState): RevenueOpsState {
  return recordCodHandover(state, {
    id: COD_CASE_ID, evidenceReference: 'MANIFEST-COD-001', handedOverAt: HANDOVER_AT, expectedVersion: 1, expectedShipmentVersion: 1,
  }, 'user-ops', '2026-07-16T07:00:00.000Z');
}

function delivered(state: RevenueOpsState): RevenueOpsState {
  return {
    ...state,
    shipmentPackages: state.shipmentPackages.map((shipment) => shipment.id === 'shipment-cod-001'
      ? { ...shipment, status: 'delivered' as const, deliveredAt: COLLECTION_AT, version: 2 }
      : shipment),
  };
}

describe('India COD custody', () => {
  it('creates an expected case from exact scoped records and numbers it by the India financial year', () => {
    const created = createCase(custodyState(), '2026-03-31T20:00:00.000Z'); // 1 April in Asia/Kolkata

    expect(created.codCollectionCases).toEqual([expect.objectContaining({
      id: COD_CASE_ID, number: 'COD-26-27-00001', expectedAmount: 1_000, status: 'expected', scope: created.scope, version: 1,
    })]);

    const foreign = custodyState();
    foreign.shipmentPackages[0] = { ...foreign.shipmentPackages[0]!, scope: { companyId: 'company-foreign', branchId: 'branch-foreign' } };
    expect(() => createCase(foreign)).toThrow(/outside the active company and branch scope/i);
  });

  it('requires physical handover and delivery evidence before carrier collection, then surfaces a real shortfall', () => {
    const handed = handOver(createCase(custodyState()));
    expect(handed.codCollectionCases[0]).toMatchObject({ status: 'handed-to-carrier', handoverEvidence: { reference: 'MANIFEST-COD-001', occurredAt: HANDOVER_AT } });

    expect(() => recordCodCarrierCollection(handed, {
      id: COD_CASE_ID, evidenceReference: 'CARRIER-COLLECT-001', collectedAt: COLLECTION_AT, collectedAmount: 800, expectedVersion: 2, expectedShipmentVersion: 1,
    }, 'user-ops')).toThrow(/recorded as delivered/i);

    const collected = recordCodCarrierCollection(delivered(handed), {
      id: COD_CASE_ID, evidenceReference: 'CARRIER-COLLECT-001', collectedAt: COLLECTION_AT, collectedAmount: 800, expectedVersion: 2, expectedShipmentVersion: 2,
    }, 'user-ops', '2026-07-17T07:00:00.000Z');
    const shortfall = recordCodRemittance(collected, {
      id: COD_CASE_ID, evidenceReference: 'REMIT-001', remittedAt: REMITTANCE_AT, remittedAmount: 800, expectedVersion: 3, expectedReceivableVersion: 1,
    }, 'user-finance', '2026-07-18T07:00:00.000Z');

    expect(shortfall.codCollectionCases[0]).toMatchObject({
      status: 'shortfall', shortfallAmount: 200, carrierCollectionEvidence: { amount: 800 }, remittanceEvidence: { amount: 800 },
    });
    expect(shortfall.codCollectionCases[0]?.bankMatchEvidence).toBeUndefined();
  });

  it('accepts only a previously reconciled, exact-amount receipt and committed bank line as final bank proof', () => {
    const handed = handOver(createCase(custodyState()));
    const collected = recordCodCarrierCollection(delivered(handed), {
      id: COD_CASE_ID, evidenceReference: 'CARRIER-COLLECT-002', collectedAt: COLLECTION_AT, collectedAmount: 1_000, expectedVersion: 2, expectedShipmentVersion: 2,
    }, 'user-ops', '2026-07-17T07:00:00.000Z');
    const remitted = recordCodRemittance(collected, {
      id: COD_CASE_ID, evidenceReference: 'REMIT-002', remittedAt: REMITTANCE_AT, remittedAmount: 1_000, expectedVersion: 3, expectedReceivableVersion: 1,
    }, 'user-finance', '2026-07-18T07:00:00.000Z');
    const scope = remitted.scope;
    const bankReady: RevenueOpsState = {
      ...remitted,
      paymentReceipts: [{
        id: 'receipt-cod-001', number: 'RCPT-26-27-0001', accountId: 'account-cod-001', receivedAt: REMITTANCE_AT, method: 'bank-transfer', reference: 'UTR-COD-001', amount: 1_000,
        allocations: [{ receivableId: 'receivable-cod-001', amount: 1_000 }], unappliedAmount: 0, status: 'reconciled', recordedBy: 'user-finance', reconciledBy: 'user-finance', reconciledAt: '2026-07-19T06:00:00.000Z', scope, version: 1,
      }],
      bankStatementImports: [{
        id: 'bank-import-cod-001', number: 'BNK-26-27-0001', bankAccountId: 'bank-cod-001', fileName: 'cod-settlement.csv', periodFrom: '2026-07-19', periodTo: '2026-07-19', openingBalance: 0, closingBalance: 1_000, rowCount: 1, checksum: 'checksum-cod-001', status: 'committed', importedBy: 'user-finance', importedAt: '2026-07-19T06:00:00.000Z', committedBy: 'user-finance', committedAt: '2026-07-19T06:00:00.000Z', scope, version: 1,
      }],
      bankStatementLines: [{
        id: 'bank-line-cod-001', statementImportId: 'bank-import-cod-001', transactionDate: '2026-07-19', valueDate: '2026-07-19', description: 'COD settlement', reference: 'BANK-COD-001', debit: 0, credit: 1_000, balance: 1_000, fingerprint: 'fingerprint-cod-001', matchStatus: 'matched', matchedPaymentReceiptId: 'receipt-cod-001', matchedBy: 'user-finance', matchedAt: '2026-07-19T06:00:00.000Z', scope, version: 1,
      }],
    };

    const matched = matchCodBank(bankReady, {
      id: COD_CASE_ID, paymentReceiptId: 'receipt-cod-001', bankStatementLineId: 'bank-line-cod-001', expectedVersion: 4, expectedPaymentReceiptVersion: 1, expectedBankStatementLineVersion: 1,
    }, 'user-checker', '2026-07-19T07:00:00.000Z');

    expect(matched.codCollectionCases[0]).toMatchObject({
      status: 'bank-matched', bankMatchEvidence: { paymentReceiptId: 'receipt-cod-001', bankStatementLineId: 'bank-line-cod-001', bankStatementReference: 'BANK-COD-001' },
    });
    expect(matched.receivables[0]?.paidAmount).toBe(0);
    expect(matched.paymentReceipts[0]?.version).toBe(1);
  });
});
