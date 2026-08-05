import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createRetailCustomerVisit, createRetailSalesCommission, createRetailCommissionPayoutBatch, decideRetailCommissionPayoutBatch, releaseRetailCommissionPayoutBatch, decideRetailSalesCommission, payRetailSalesCommission } from './retail-customer-ops';

describe('retail customer visits and commissions', () => {
  it('records a scoped visit with staff and conversion context', () => {
    const state = createInitialRevenueOpsState();
    const next = createRetailCustomerVisit(state, { customerAccountId: 'customer-1', visitedAt: '2026-07-30T10:00:00.000Z', channel: 'store', purpose: 'enquiry', sourceReference: 'WALKIN-01', notes: 'Asked about family grocery pack.' }, 'associate-1', 'visit-1');
    expect(next.retailCustomerVisits[0]).toMatchObject({ id: 'visit-1', customerAccountId: 'customer-1', channel: 'store', purpose: 'enquiry', staffUserId: 'associate-1', version: 1 });
    expect(next.revision).toBe(state.revision + 1);
  });

  it('requires independent approval before a commission can be paid', () => {
    const state = createInitialRevenueOpsState();
    const sale = { id: 'sale-1', status: 'completed' as const, taxPreview: { taxableValue: 1000 } } as typeof state.retailSales[number];
    let next = { ...state, retailSales: [sale] };
    next = createRetailSalesCommission(next, { saleId: 'sale-1', salespersonUserId: 'associate-1', ratePercent: 5 }, 'commission-1', '2026-07-30T10:00:00.000Z');
    expect(() => decideRetailSalesCommission(next, { id: 'commission-1', decision: 'approved', expectedVersion: 1, remarks: 'Self approval' }, 'associate-1')).toThrow('independent');
    next = decideRetailSalesCommission(next, { id: 'commission-1', decision: 'approved', expectedVersion: 1, remarks: 'Sale and rate reviewed.' }, 'manager-1', '2026-07-30T11:00:00.000Z');
    expect(next.retailSalesCommissions[0]).toMatchObject({ status: 'approved', commissionAmount: 50, approvedBy: 'manager-1', version: 2 });
    next = payRetailSalesCommission(next, { id: 'commission-1', payoutReference: 'PAY-0001', expectedVersion: 2 }, 'finance-1', '2026-07-30T12:00:00.000Z');
    expect(next.retailSalesCommissions[0]).toMatchObject({ status: 'paid', payoutReference: 'PAY-0001', version: 3 });
  });

  it('groups approved commissions into a maker-checker payout batch and releases them atomically', () => {
    const sale = { id: 'sale-batch-1', status: 'completed' as const, paymentReceiptIds: ['receipt-batch-1'], taxPreview: { taxableValue: 2000 } } as typeof createInitialRevenueOpsState extends () => infer S ? S extends { retailSales: infer R } ? R extends Array<infer Sale> ? Sale : never : never : never;
    const receipt = { id: 'receipt-batch-1', retailSaleId: sale.id, status: 'reconciled' as const } as typeof createInitialRevenueOpsState extends () => infer S ? S extends { paymentReceipts: infer R } ? R extends Array<infer Receipt> ? Receipt : never : never : never;
    let next = { ...createInitialRevenueOpsState(), retailSales: [sale], paymentReceipts: [receipt] };
    next = createRetailSalesCommission(next, { saleId: 'sale-batch-1', salespersonUserId: 'associate-1', ratePercent: 5 }, 'commission-batch-1', '2026-07-30T10:00:00.000Z');
    next = decideRetailSalesCommission(next, { id: 'commission-batch-1', decision: 'approved', expectedVersion: 1, remarks: 'Reviewed.' }, 'manager-1', '2026-07-30T11:00:00.000Z');
    next = createRetailCommissionPayoutBatch(next, { commissionIds: ['commission-batch-1'], payoutDate: '2026-07-31', notes: 'July sales payout.' }, 'finance-maker', 'batch-1', '2026-07-31T08:00:00.000Z');
    expect(next.retailCommissionPayoutBatches[0]).toMatchObject({ id: 'batch-1', status: 'submitted', totalAmount: 100, commissionIds: ['commission-batch-1'], version: 1 });
    expect(() => decideRetailCommissionPayoutBatch(next, { id: 'batch-1', decision: 'approved', expectedVersion: 1, remarks: 'Self approval.' }, 'finance-maker')).toThrow('independent');
    next = decideRetailCommissionPayoutBatch(next, { id: 'batch-1', decision: 'approved', expectedVersion: 1, remarks: 'Batch totals reviewed.' }, 'finance-checker', '2026-07-31T09:00:00.000Z');
    next = releaseRetailCommissionPayoutBatch(next, { id: 'batch-1', releaseReference: 'BANK-BATCH-001', expectedVersion: 2 }, 'treasury-releaser', '2026-07-31T10:00:00.000Z');
    expect(next.retailCommissionPayoutBatches[0]).toMatchObject({ status: 'released', releaseReference: 'BANK-BATCH-001', releasedBy: 'treasury-releaser', journalDraftId: expect.any(String), version: 3 });
    expect(next.retailSalesCommissions[0]).toMatchObject({ status: 'paid', payoutBatchId: 'batch-1', payoutReference: 'BANK-BATCH-001 / PAYB-26-27-00001', version: 4 });
    expect(next.journalDrafts[0]).toMatchObject({ sourceType: 'retail-commission-payout', sourceId: 'batch-1', status: 'ready', externalReference: 'BANK-BATCH-001', totalDebit: 100, totalCredit: 100 });
  });

  it('does not release a commission payout before the source sale settlement is reconciled', () => {
    const sale = { id: 'sale-unreconciled-1', status: 'completed' as const, paymentReceiptIds: ['receipt-unreconciled-1'], taxPreview: { taxableValue: 2000 } } as typeof createInitialRevenueOpsState extends () => infer S ? S extends { retailSales: infer R } ? R extends Array<infer Sale> ? Sale : never : never : never;
    const receipt = { id: 'receipt-unreconciled-1', retailSaleId: sale.id, status: 'recorded' as const } as typeof createInitialRevenueOpsState extends () => infer S ? S extends { paymentReceipts: infer R } ? R extends Array<infer Receipt> ? Receipt : never : never : never;
    let next = { ...createInitialRevenueOpsState(), retailSales: [sale], paymentReceipts: [receipt] };
    next = createRetailSalesCommission(next, { saleId: sale.id, salespersonUserId: 'associate-1', ratePercent: 5 }, 'commission-unreconciled-1', '2026-07-30T10:00:00.000Z');
    next = decideRetailSalesCommission(next, { id: 'commission-unreconciled-1', decision: 'approved', expectedVersion: 1, remarks: 'Reviewed.' }, 'manager-1', '2026-07-30T11:00:00.000Z');
    next = createRetailCommissionPayoutBatch(next, { commissionIds: ['commission-unreconciled-1'], payoutDate: '2026-07-31', notes: 'Settlement gate.' }, 'finance-maker', 'batch-unreconciled-1', '2026-07-31T08:00:00.000Z');
    next = decideRetailCommissionPayoutBatch(next, { id: 'batch-unreconciled-1', decision: 'approved', expectedVersion: 1, remarks: 'Batch totals reviewed.' }, 'finance-checker', '2026-07-31T09:00:00.000Z');
    expect(() => releaseRetailCommissionPayoutBatch(next, { id: 'batch-unreconciled-1', releaseReference: 'BANK-BATCH-UNRECONCILED', expectedVersion: 2 }, 'treasury-releaser', '2026-07-31T10:00:00.000Z')).toThrow(/reconciled/i);
  });
});
