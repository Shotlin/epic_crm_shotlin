import { describe, expect, it } from 'vitest';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import { createInitialRevenueOpsState } from './revenue-ops';
import {
  createLiquiditySweep,
  createPaymentProposal,
  decideLiquiditySweep,
  decidePaymentProposal,
  recordBankCharge,
  recordTreasuryPosition,
  releaseLiquiditySweep,
  releasePaymentProposal,
  resolveSettlementException,
  runCashForecast,
  verifyCashForecastChecksum,
  settleLiquiditySweep,
  settlePaymentProposal,
} from './treasury';

const T0 = '2026-07-15T08:00:00.000Z';

function treasuryState(): RevenueOpsState {
  const state = createInitialRevenueOpsState();
  state.bankAccounts = [
    { id: 'bank-operating', code: 'HDFC-OPS', name: 'Operating current account', bankName: 'HDFC Bank', maskedAccountNumber: '********9012', ifsc: 'HDFC0001234', currency: 'INR', active: true, createdAt: T0, version: 1 },
    { id: 'bank-reserve', code: 'ICICI-RES', name: 'Reserve current account', bankName: 'ICICI Bank', maskedAccountNumber: '********3344', ifsc: 'ICIC0004321', currency: 'INR', active: true, createdAt: T0, version: 1 },
  ];
  state.suppliers = [{ id: 'supplier-1', code: 'ACME', legalName: 'Acme Industrial Supplies Private Limited', stateCode: '27', email: 'ops@acme.example', paymentTermDays: 30, categories: ['materials'], riskRating: 'low', qualificationEvidence: 'Validated supplier onboarding evidence.', status: 'approved', requestedBy: 'user-maker', requestedAt: T0, decidedBy: 'user-checker', decidedAt: T0, version: 1 }];
  state.purchaseOrders = [{ id: 'po-1', number: 'PO-26-27-00001', supplierId: 'supplier-1', warehouseId: 'warehouse-1', deliveryBy: '2026-07-20', paymentTermDays: 30, status: 'received', lines: [{ id: 'po-line-1', itemVariantId: 'variant-1', description: 'Industrial filter', quantity: 10, unitPrice: 1000, gstRate: 18, taxableValue: 10000, taxAmount: 1800, totalAmount: 11800, receivedQuantity: 10, invoicedQuantity: 10 }], taxableValue: 10000, taxAmount: 1800, totalAmount: 11800, createdBy: 'user-maker', createdAt: T0, version: 1 }];
  state.supplierInvoices = [{ id: 'supplier-invoice-1', number: 'VIN-26-27-00001', supplierId: 'supplier-1', purchaseOrderId: 'po-1', goodsReceiptId: 'grn-1', supplierInvoiceNumber: 'ACME-1001', invoiceDate: '2026-07-15', lines: [{ purchaseOrderLineId: 'po-line-1', quantity: 10, unitPrice: 1000, gstRate: 18, totalAmount: 11800 }], totalAmount: 11800, recordedBy: 'user-maker', recordedAt: T0, version: 1 }];
  state.threeWayMatches = [{ id: 'match-1', number: '3WM-26-27-00001', purchaseOrderId: 'po-1', goodsReceiptId: 'grn-1', supplierInvoiceId: 'supplier-invoice-1', quantityVariance: 0, priceVariance: 0, status: 'matched', tolerancePercent: 1, createdBy: 'user-maker', createdAt: T0, version: 1 }];
  state.receivables = [{ id: 'receivable-1', invoiceId: 'invoice-1', accountId: 'account-1', invoiceNumber: 'INV-26-27-00001', invoiceDate: '2026-07-01', dueDate: '2026-07-20', originalAmount: 20000, adjustmentAmount: 0, paidAmount: 0, outstandingAmount: 20000, status: 'current', version: 1 }];
  return state;
}

describe('treasury command controls', () => {
  it('builds an evidence-backed rolling cash forecast from positions, receivables and AP', () => {
    let state = recordTreasuryPosition(treasuryState(), { bankAccountId: 'bank-operating', asOfDate: '2026-07-15', availableBalance: 50000, source: 'treasury-control', evidenceReference: 'HDFC-15072026' }, 'user-finance', 'position-1', T0);
    state = recordTreasuryPosition(state, { bankAccountId: 'bank-reserve', asOfDate: '2026-07-15', availableBalance: 25000, source: 'treasury-control', evidenceReference: 'ICICI-15072026' }, 'user-finance', 'position-2', T0);
    const forecast = runCashForecast(state, { asOfDate: '2026-07-15', horizonDays: 45, scenario: 'base' }, 'user-finance', 'forecast-1', T0);
    expect(forecast.cashForecastRuns[0]).toMatchObject({ number: 'CFR-26-27-00001', openingBalance: 75000, projectedInflows: 20000, projectedOutflows: 11800, projectedClosingBalance: 83200 });
    expect(forecast.cashForecastRuns[0]?.lines.find(({ date }) => date === '2026-07-20')).toMatchObject({ inflows: 20000 });
    expect(forecast.cashForecastRuns[0]?.lines.find(({ date }) => date === '2026-08-14')).toMatchObject({ outflows: 11800 });
    expect(forecast.cashForecastRuns[0]).toMatchObject({ assumptions: { receiptCollectionFactor: 1, plannedOutflowCoverageFactor: 1 }, checksum: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(verifyCashForecastChecksum(forecast.cashForecastRuns[0]!)).toBe(true);
    expect(verifyCashForecastChecksum({ ...forecast.cashForecastRuns[0]!, projectedClosingBalance: 1 })).toBe(false);
  });

  it('enforces maker, approver and releaser separation for AP payment proposals', () => {
    const proposed = createPaymentProposal(treasuryState(), { supplierInvoiceId: 'supplier-invoice-1', bankAccountId: 'bank-operating', paymentDate: '2026-07-30', amount: 11800, paymentReference: 'ACME-JULY-1001', purpose: 'Matched supplier invoice settlement.' }, 'user-maker', 'payment-1', T0);
    expect(() => decidePaymentProposal(proposed, { id: 'payment-1', decision: 'approved', remarks: 'Independent payment evidence review.', expectedVersion: 1 }, 'user-maker')).toThrow('maker');
    const approved = decidePaymentProposal(proposed, { id: 'payment-1', decision: 'approved', remarks: 'Independent payment evidence review.', expectedVersion: 1 }, 'user-checker', '2026-07-15T09:00:00.000Z');
    expect(() => releasePaymentProposal(approved, { id: 'payment-1', bankReleaseReference: 'UTR-778899', expectedVersion: 2 }, 'user-checker')).toThrow('separate');
    const released = releasePaymentProposal(approved, { id: 'payment-1', bankReleaseReference: 'UTR-778899', expectedVersion: 2 }, 'user-releaser', '2026-07-15T10:00:00.000Z');
    expect(released.paymentProposals[0]).toMatchObject({ status: 'released', releasedBy: 'user-releaser' });
    expect(released.journalDrafts[0]).toMatchObject({ sourceType: 'treasury-payment', totalDebit: 11800, totalCredit: 11800 });
    const settled = settlePaymentProposal(released, { id: 'payment-1', outcome: 'settled', settlementReference: 'UTR-778899', settledAt: '2026-07-16', actualAmount: 11800, expectedVersion: 3 }, 'user-finance', '2026-07-16T12:00:00.000Z');
    expect(settled.paymentProposals[0]).toMatchObject({ status: 'settled', actualAmount: 11800 });
  });

  it('routes settlement mismatches to an independently resolved exception and journals bank charges', () => {
    const proposed = createPaymentProposal(treasuryState(), { supplierInvoiceId: 'supplier-invoice-1', bankAccountId: 'bank-operating', paymentDate: '2026-07-30', amount: 11800, paymentReference: 'ACME-JULY-1001', purpose: 'Matched supplier invoice settlement.' }, 'user-maker', 'payment-1', T0);
    const approved = decidePaymentProposal(proposed, { id: 'payment-1', decision: 'approved', remarks: 'Independent payment evidence review.', expectedVersion: 1 }, 'user-checker', '2026-07-15T09:00:00.000Z');
    const released = releasePaymentProposal(approved, { id: 'payment-1', bankReleaseReference: 'UTR-778899', expectedVersion: 2 }, 'user-releaser', '2026-07-15T10:00:00.000Z');
    const failed = settlePaymentProposal(released, { id: 'payment-1', outcome: 'failed', settlementReference: 'BANK-REJECT-01', settledAt: '2026-07-16', actualAmount: 0, expectedVersion: 3 }, 'user-finance', '2026-07-16T12:00:00.000Z');
    expect(failed.settlementExceptions[0]).toMatchObject({ code: 'rejected', status: 'open', amount: 11800 });
    const resolved = resolveSettlementException(failed, { id: failed.settlementExceptions[0]!.id, resolution: 'Bank rejected beneficiary; payment will be re-proposed after master correction.', expectedVersion: 1 }, 'user-checker', '2026-07-16T13:00:00.000Z');
    const charged = recordBankCharge(resolved, { bankAccountId: 'bank-operating', chargeDate: '2026-07-16', category: 'transaction-fee', amount: 118, taxAmount: 18, reference: 'BANK-CHARGE-1001' }, 'user-finance', 'charge-1', '2026-07-16T14:00:00.000Z');
    expect(charged.bankCharges[0]).toMatchObject({ status: 'recorded', amount: 118, taxAmount: 18 });
    expect(charged.journalDrafts[0]).toMatchObject({ sourceType: 'bank-charge', totalDebit: 118, totalCredit: 118 });
  });

  it('positions liquidity through independently approved and settled bank sweeps', () => {
    let state = recordTreasuryPosition(treasuryState(), { bankAccountId: 'bank-operating', asOfDate: '2026-07-15', availableBalance: 50000, source: 'treasury-control', evidenceReference: 'HDFC-15072026' }, 'user-finance', 'position-1', T0);
    state = recordTreasuryPosition(state, { bankAccountId: 'bank-reserve', asOfDate: '2026-07-15', availableBalance: 10000, source: 'treasury-control', evidenceReference: 'ICICI-15072026' }, 'user-finance', 'position-2', T0);
    const proposed = createLiquiditySweep(state, { fromBankAccountId: 'bank-operating', toBankAccountId: 'bank-reserve', amount: 25000, effectiveDate: '2026-07-16', rationale: 'Move surplus operating liquidity to controlled reserve.' }, 'user-maker', 'sweep-1', T0);
    expect(() => decideLiquiditySweep(proposed, { id: 'sweep-1', decision: 'approved', remarks: 'Approved against current cash-position evidence.', expectedVersion: 1 }, 'user-maker')).toThrow('maker');
    const approved = decideLiquiditySweep(proposed, { id: 'sweep-1', decision: 'approved', remarks: 'Approved against current cash-position evidence.', expectedVersion: 1 }, 'user-checker', '2026-07-15T09:00:00.000Z');
    const released = releaseLiquiditySweep(approved, { id: 'sweep-1', releaseReference: 'SWEEP-UTR-001', expectedVersion: 2 }, 'user-releaser', '2026-07-15T10:00:00.000Z');
    const settled = settleLiquiditySweep(released, { id: 'sweep-1', outcome: 'settled', settlementReference: 'SWEEP-UTR-001', expectedVersion: 3 }, 'user-finance', '2026-07-16T10:00:00.000Z');
    expect(settled.liquiditySweeps[0]).toMatchObject({ status: 'settled', settlementJournalId: expect.any(String) });
    expect(settled.journalDrafts.slice(0, 2).map(({ sourceType }) => sourceType)).toEqual(['liquidity-sweep-settlement', 'liquidity-sweep-release']);
  });
});
