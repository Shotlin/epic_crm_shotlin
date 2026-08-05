import { describe, expect, it } from 'vitest';
import type { RevenueOpsState, TaxInvoice } from '../shared/revenue-ops-contracts';
import { createInitialRevenueOpsState } from './revenue-ops';
import {
  assertCreditAvailable,
  commitBankStatement,
  confirmBankMatch,
  createBankAccount,
  createWithholdingPolicy,
  decideCreditLimit,
  decideWriteOff,
  decideZeroRatedSupply,
  openReceivableDispute,
  prepareZeroRatedSupply,
  previewBankStatement,
  proposeCreditLimit,
  recordCollectionActivity,
  recordWithholdingEntry,
  requestWriteOff,
  resolveReceivableDispute,
  runDunning,
  transitionWithholdingEntry,
} from './collections-finance';

const invoice = (overrides: Partial<TaxInvoice> = {}): TaxInvoice => ({
  id: 'invoice-collections-1', number: 'INV-26-27-00021', documentKind: 'tax-invoice', salesOrderId: 'order-1', quoteId: 'quote-1', accountId: 'account-sahyadri', recipientTreatment: 'registered', recipientGstin: '27ABCDE1234F1Z5', placeOfSupplyStateCode: '27', reverseCharge: false, currency: 'INR', invoiceDate: '2026-06-01', dueDate: '2026-06-30', paymentTermId: 'payment-term-net-30', status: 'issued', irpStatus: 'not-applicable', serviceMilestoneIds: [], shipmentPackageIds: [], lines: [{ id: 'line-1', productInterestId: 'interest-1', description: 'Governed business platform', hsnSac: '998314', quantity: 1, unitPrice: 100000, taxableValue: 100000, gstRate: 18 }], subtotal: 100000, discountTotal: 0, taxPreview: { treatment: 'intra-state', taxableValue: 100000, cgst: 9000, sgst: 9000, igst: 0, totalTax: 18000, grandTotal: 118000, determination: 'commercial-estimate' }, amountDue: 118000, createdBy: 'user-maker', createdAt: '2026-06-01T08:00:00.000Z', issuedBy: 'user-checker', issuedAt: '2026-06-01T09:00:00.000Z', version: 1,
  ...overrides,
});

function financeState(): RevenueOpsState {
  const state = createInitialRevenueOpsState();
  state.invoices = [invoice()];
  state.receivables = [{ id: 'receivable-1', invoiceId: 'invoice-collections-1', accountId: 'account-sahyadri', invoiceNumber: 'INV-26-27-00021', invoiceDate: '2026-06-01', dueDate: '2026-06-30', originalAmount: 118000, adjustmentAmount: 0, paidAmount: 0, outstandingAmount: 118000, status: 'overdue', version: 1 }];
  return state;
}

describe('collections and Indian finance controls', () => {
  it('governs credit limits, order exposure, dunning, promises and disputes', () => {
    const proposed = proposeCreditLimit(financeState(), { accountId: 'account-sahyadri', creditLimit: 150000, warningThresholdPercent: 80, graceDays: 10, blockNewOrders: true, riskGrade: 'B', rationale: 'Audited financials support a controlled working limit.' }, 'user-maker', ['account-sahyadri'], 'credit-1', '2026-07-15T08:00:00.000Z');
    expect(() => decideCreditLimit(proposed, { id: 'credit-1', decision: 'approved', remarks: 'Approved after treasury review.', expectedVersion: 1 }, 'user-maker')).toThrow('maker');
    const approved = decideCreditLimit(proposed, { id: 'credit-1', decision: 'approved', remarks: 'Approved after treasury review.', expectedVersion: 1 }, 'user-checker', '2026-07-15T09:00:00.000Z');
    expect(() => assertCreditAvailable(approved, 'account-sahyadri', 40000)).toThrow('Credit hold');

    const dunned = runDunning(approved, { asOfDate: '2026-07-20', ownerId: 'user-avery' }, ['user-avery'], '2026-07-20T08:00:00.000Z');
    expect(dunned.dunningCases[0]).toMatchObject({ stage: 'final-demand', daysOverdue: 20, actionableAmount: 118000, status: 'open' });
    expect(() => recordCollectionActivity(dunned, { dunningCaseId: dunned.dunningCases[0]!.id, channel: 'phone', outcome: 'promised-to-pay', notes: 'Customer committed payment after treasury release.', promisedAmount: 50000, promisedDate: '2026-07-20', expectedVersion: 1 }, 'user-avery', 'activity-1', '2026-07-20T10:00:00.000Z')).toThrow('future date');
    const disputed = openReceivableDispute(dunned, { receivableId: 'receivable-1', category: 'quality', amount: 18000, reason: 'Customer contests the tax-inclusive acceptance amount.', evidenceReference: 'EMAIL-2026-07-20', ownerId: 'user-avery' }, 'user-maker', ['user-avery'], 'dispute-1', '2026-07-20T11:00:00.000Z');
    expect(disputed.dunningCases[0]?.status).toBe('paused');
    const resolved = resolveReceivableDispute(disputed, { id: 'dispute-1', resolution: 'settled', resolutionReference: 'SETTLEMENT-01', expectedVersion: 1 }, 'user-checker', '2026-07-21T10:00:00.000Z');
    expect(resolved.receivableDisputes[0]).toMatchObject({ status: 'resolved', resolution: 'settled', resolvedBy: 'user-checker' });
  });

  it('enforces maker-checker write-offs and posts a balanced bad-debt handoff', () => {
    const requested = requestWriteOff(financeState(), { receivableId: 'receivable-1', amount: 18000, reason: 'Residual balance is uneconomic to recover after legal notice.', evidenceReference: 'LEGAL-CLOSE-2026-01' }, 'user-maker', 'write-off-1', '2026-07-15T08:00:00.000Z');
    expect(() => decideWriteOff(requested, { id: 'write-off-1', decision: 'approved', remarks: 'Approved within delegated authority.', expectedVersion: 1 }, 'user-maker')).toThrow('requester');
    const approved = decideWriteOff(requested, { id: 'write-off-1', decision: 'approved', remarks: 'Approved within delegated authority.', expectedVersion: 1 }, 'user-checker', '2026-07-15T09:00:00.000Z');
    expect(approved.receivables[0]).toMatchObject({ outstandingAmount: 100000, writtenOffAmount: 18000, status: 'partially-paid' });
    expect(approved.journalDrafts[0]).toMatchObject({ sourceType: 'write-off', totalDebit: 18000, totalCredit: 18000, status: 'ready' });
  });

  it('applies the 1 April 2026 TDS/TCS law transition and tracks withholding lifecycle', () => {
    const state = financeState();
    expect(() => createWithholdingPolicy(state, { code: 'OLD-OPEN', name: 'Invalid crossing policy', kind: 'TDS', lawVersion: 'income-tax-act-1961', sectionReference: '194J', trigger: 'earlier-credit-payment', ratePercent: 2, thresholdAmount: 1000, effectiveFrom: '2026-01-01', sourceUrl: 'https://www.incometax.gov.in/' }, 'user-checker')).toThrow('cannot straddle');
    expect(() => createWithholdingPolicy(state, { code: 'TDS-NEW', name: 'New act TDS', kind: 'TDS', lawVersion: 'income-tax-act-2025', sectionReference: '194J', tableItem: 'Professional or technical services', trigger: 'earlier-credit-payment', ratePercent: 2, thresholdAmount: 1000, effectiveFrom: '2026-04-01', sourceUrl: 'https://www.incometax.gov.in/' }, 'user-checker')).toThrow('section 393');
    const policy = createWithholdingPolicy(state, { code: 'TDS-393-PROF', name: 'Professional services TDS', kind: 'TDS', lawVersion: 'income-tax-act-2025', sectionReference: '393 table', tableItem: 'Professional or technical services', trigger: 'earlier-credit-payment', ratePercent: 2, thresholdAmount: 1000, effectiveFrom: '2026-04-01', sourceUrl: 'https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tax-payments-faq' }, 'user-checker', 'policy-1', '2026-07-15T08:00:00.000Z');
    const recognized = recordWithholdingEntry(policy, { policyId: 'policy-1', accountId: 'account-sahyadri', receivableId: 'receivable-1', direction: 'customer-deducted-tds', eventDate: '2026-07-15', baseAmount: 100000, counterpartyPan: 'ABCDE1234F' }, 'user-checker', 'tds-1', '2026-07-15T09:00:00.000Z');
    expect(recognized.withholdingEntries[0]).toMatchObject({ taxAmount: 2000, status: 'recognized' });
    expect(recognized.receivables[0]).toMatchObject({ outstandingAmount: 116000, withheldAmount: 2000 });
    expect(recognized.journalDrafts[0]).toMatchObject({ sourceType: 'withholding', totalDebit: 2000, totalCredit: 2000 });
    const reconciled = transitionWithholdingEntry(recognized, { id: 'tds-1', toStatus: 'reconciled', reference: 'FORM-26AS-TRACE-001', expectedVersion: 1 }, 'user-checker', '2026-08-01T09:00:00.000Z');
    expect(reconciled.withholdingEntries[0]).toMatchObject({ status: 'reconciled', certificateOrChallanReference: 'FORM-26AS-TRACE-001' });
  });

  it('requires independent zero-rated review and writes export evidence onto the invoice', () => {
    const state = financeState();
    state.invoices = [invoice({ status: 'draft', recipientTreatment: 'export', recipientGstin: '', placeOfSupplyStateCode: '96', invoiceDate: '2026-07-15', dueDate: '2026-08-14', version: 1 })];
    state.receivables = [];
    const prepared = prepareZeroRatedSupply(state, { invoiceId: 'invoice-collections-1', supplyType: 'export-services', taxRoute: 'lut-bond-without-payment', destinationCountryCode: 'SG', recipientName: 'Merlion Operations Pte Ltd', recipientAddress: '1 Raffles Place, Singapore', lutBondNumber: 'LUT-2026-27-001', lutBondDate: '2026-04-01', lutBondValidUntil: '2027-03-31' }, 'user-maker', 'zero-rated-1', '2026-07-15T08:00:00.000Z');
    expect(() => decideZeroRatedSupply(prepared, { id: 'zero-rated-1', decision: 'approved', remarks: 'LUT and destination evidence verified.', expectedVersion: 1 }, 'user-maker')).toThrow('maker');
    const approved = decideZeroRatedSupply(prepared, { id: 'zero-rated-1', decision: 'approved', remarks: 'LUT and destination evidence verified.', expectedVersion: 1 }, 'user-checker', '2026-07-15T09:00:00.000Z');
    expect(approved.invoices[0]).toMatchObject({ zeroRatedSupplyId: 'zero-rated-1', destinationCountryCode: 'SG', lutBondNumber: 'LUT-2026-27-001', amountDue: 100000 });
    expect(approved.invoices[0]?.exportEndorsement).toContain('WITHOUT PAYMENT OF IGST');
    expect(approved.invoices[0]?.taxPreview).toMatchObject({ totalTax: 0, grandTotal: 100000 });
  });

  it('previews, validates, commits and independently matches bank statement credits', () => {
    const state = financeState();
    state.paymentReceipts = [{ id: 'receipt-1', number: 'RCPT-26-27-00001', accountId: 'account-sahyadri', receivedAt: '2026-07-20T10:00:00.000Z', method: 'bank-transfer', reference: 'UTR-778899', amount: 100000, allocations: [{ receivableId: 'receivable-1', amount: 100000 }], unappliedAmount: 0, status: 'recorded', recordedBy: 'user-maker', version: 1 }];
    state.journalDrafts = [{ id: 'journal-payment-1', sourceType: 'payment', sourceId: 'receipt-1', sourceNumber: 'RCPT-26-27-00001', postingDate: '2026-07-20', lines: [{ accountCode: 'bank-clearing', debit: 100000, credit: 0, memo: 'Receipt' }, { accountCode: 'accounts-receivable', debit: 0, credit: 100000, memo: 'Receipt' }], totalDebit: 100000, totalCredit: 100000, status: 'draft', checksum: 'test', version: 1 }];
    const bank = createBankAccount(state, { code: 'HDFC-COL', name: 'Collections current account', bankName: 'HDFC Bank', maskedAccountNumber: '********9012', ifsc: 'HDFC0001234' }, 'bank-1', '2026-07-15T08:00:00.000Z');
    const csv = 'transactionDate,valueDate,description,reference,debit,credit,balance\n2026-07-20,2026-07-20,Customer receipt,UTR-778899,0,100000,100000\n2026-07-21,2026-07-21,Bank charges,CHG-01,1000,0,99000';
    const preview = previewBankStatement(bank, { bankAccountId: 'bank-1', fileName: 'hdfc-july.csv', csvContent: csv }, 'user-maker', 'import-1', '2026-07-21T08:00:00.000Z');
    expect(preview.bankStatementImports[0]).toMatchObject({ status: 'preview', rowCount: 2, openingBalance: 0, closingBalance: 99000 });
    const creditLine = preview.bankStatementLines.find(({ credit }) => credit === 100000)!;
    expect(creditLine).toMatchObject({ matchStatus: 'suggested', suggestedPaymentReceiptId: 'receipt-1', confidence: 100 });
    const committed = commitBankStatement(preview, { id: 'import-1', expectedVersion: 1 }, 'user-maker', '2026-07-21T09:00:00.000Z');
    expect(() => confirmBankMatch(committed, { lineId: creditLine.id, paymentReceiptId: 'receipt-1', expectedVersion: 1 }, 'user-maker')).toThrow('recorder');
    const matched = confirmBankMatch(committed, { lineId: creditLine.id, paymentReceiptId: 'receipt-1', expectedVersion: 1 }, 'user-checker', '2026-07-21T10:00:00.000Z');
    expect(matched.bankStatementLines.find(({ id }) => id === creditLine.id)).toMatchObject({ matchStatus: 'matched', matchedPaymentReceiptId: 'receipt-1', matchedBy: 'user-checker' });
    expect(matched.paymentReceipts[0]).toMatchObject({ status: 'reconciled', reconciledBy: 'user-checker' });
  });

  it('does not reconcile cash receipts or mismatched electronic settlement accounts against bank evidence', () => {
    const state = financeState();
    state.paymentReceipts = [{ id: 'cash-receipt', number: 'RCPT-CASH', accountId: 'account-sahyadri', receivedAt: '2026-07-20T10:00:00.000Z', method: 'cash', reference: 'CASH-01', amount: 500, allocations: [], unappliedAmount: 500, status: 'recorded', recordedBy: 'user-maker', settlementAccount: 'cash-on-hand', version: 1 }];
    const bank = createBankAccount(state, { code: 'HDFC-COL', name: 'Collections current account', bankName: 'HDFC Bank', maskedAccountNumber: '********9012', ifsc: 'HDFC0001234' }, 'bank-1', '2026-07-15T08:00:00.000Z');
    const csv = 'transactionDate,valueDate,description,reference,debit,credit,balance\n2026-07-20,2026-07-20,Cash deposit,CASH-01,0,500,500';
    let next = commitBankStatement(previewBankStatement(bank, { bankAccountId: 'bank-1', fileName: 'cash-deposit.csv', csvContent: csv }, 'user-maker', 'import-cash', '2026-07-21T08:00:00.000Z'), { id: 'import-cash', expectedVersion: 1 }, 'user-maker');
    const line = next.bankStatementLines[0]!;
    expect(() => confirmBankMatch(next, { lineId: line.id, paymentReceiptId: 'cash-receipt', expectedVersion: 1 }, 'user-checker')).toThrow(/cash and store-credit/i);

    next = { ...next, paymentReceipts: [{ ...next.paymentReceipts[0]!, id: 'upi-receipt', method: 'upi', settlementAccount: 'card-clearing', reference: 'UPI-01', amount: 500, status: 'recorded', recordedBy: 'user-maker' }] };
    expect(() => confirmBankMatch(next, { lineId: line.id, paymentReceiptId: 'upi-receipt', expectedVersion: 1 }, 'user-checker')).toThrow(/settlement account/i);
  });
});
