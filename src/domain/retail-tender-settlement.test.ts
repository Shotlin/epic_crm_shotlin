import { describe, expect, it } from 'vitest';
import type { BankStatementLine } from '../shared/collections-finance-contracts';
import type { PaymentReceipt } from '../shared/revenue-ops-contracts';
import { computeRetailTenderSettlementReconciliation } from './retail-reports';

const scope = { companyId: 'company-1', branchId: 'branch-1' };

describe('retail tender settlement reconciliation', () => {
  it('separates recorded electronic tenders from bank-matched evidence and leaves card gaps actionable', () => {
    const receipts: PaymentReceipt[] = [
      { id: 'receipt-upi', number: 'RCT-UPI-1', accountId: 'walk-in', receivedAt: '2025-01-10T10:00:00.000Z', method: 'upi', settlementAccount: 'upi-clearing', retailSaleId: 'sale-1', reference: 'UPI-100', amount: 100, allocations: [], unappliedAmount: 0, status: 'reconciled', recordedBy: 'cashier-1', reconciledBy: 'checker-1', reconciledAt: '2025-01-11T10:00:00.000Z', scope, version: 2 },
      { id: 'receipt-card', number: 'RCT-CARD-1', accountId: 'walk-in', receivedAt: '2025-01-10T11:00:00.000Z', method: 'card', settlementAccount: 'card-clearing', retailSaleId: 'sale-2', reference: 'CARD-200', amount: 250, allocations: [], unappliedAmount: 0, status: 'recorded', recordedBy: 'cashier-1', scope, version: 1 },
      { id: 'receipt-cash', number: 'RCT-CASH-1', accountId: 'walk-in', receivedAt: '2025-01-10T12:00:00.000Z', method: 'cash', settlementAccount: 'cash-on-hand', retailSaleId: 'sale-3', reference: 'CASH-50', amount: 50, allocations: [], unappliedAmount: 0, status: 'recorded', recordedBy: 'cashier-1', scope, version: 1 },
    ];
    const bankLines: BankStatementLine[] = [{ scope, id: 'bank-line-upi', statementImportId: 'statement-1', transactionDate: '2025-01-11', valueDate: '2025-01-11', description: 'UPI settlement', reference: 'UPI-100', debit: 0, credit: 100, balance: 10_100, fingerprint: 'upi-fingerprint', matchStatus: 'matched', matchedPaymentReceiptId: 'receipt-upi', matchedBy: 'checker-1', matchedAt: '2025-01-11T10:00:00.000Z', confidence: 100, matchReason: 'Exact settlement reference', version: 2 }];
    const report = computeRetailTenderSettlementReconciliation({ receipts, bankLines });
    expect(report).toMatchObject({ currency: 'INR', totalRecordedElectronicAmount: 350, totalBankMatchedElectronicAmount: 100, totalUnmatchedElectronicAmount: 250, actionRequired: true });
    expect(report.rows.find((row) => row.method === 'upi')).toMatchObject({ recordedAmount: 100, bankMatchedAmount: 100, gapAmount: 0, status: 'ready' });
    expect(report.rows.find((row) => row.method === 'card')).toMatchObject({ recordedAmount: 250, bankMatchedAmount: 0, gapAmount: 250, status: 'needs-action', unmatchedReceiptNumbers: ['RCT-CARD-1'] });
    expect(report.rows.find((row) => row.method === 'cash')).toMatchObject({ recordedAmount: 0, status: 'not-applicable' });
    expect(report.nextActions).toEqual(expect.arrayContaining(['Import and match the missing UPI/card settlement lines before closing electronic tenders.']));
  });
});
