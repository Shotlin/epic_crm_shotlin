import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { prepareRetailCreditNoteReconciliation, recordRetailCreditNotePortalResponse } from './retail-credit-note';

describe('retail credit-note reconciliation evidence', () => {
  it('freezes GST evidence and matches an identical provider payload', () => {
    const state = createInitialRevenueOpsState();
    const scope = state.scope;
    state.retailReturns = [{
      id: 'return-1', number: 'RTRN/26-27/00001', retailSaleId: 'sale-1', retailSaleNumber: 'POS/26-27/00001', invoiceId: 'invoice-1', counterId: 'counter-1', warehouseId: 'warehouse-1', customerAccountId: 'customer-1', transactionKey: 'return-key-1', requestChecksum: 'hash', reason: 'damaged', lines: [], taxPreview: { treatment: 'intra-state', taxableValue: 100, cgst: 9, sgst: 9, igst: 0, cess: 0, totalTax: 18, grandTotal: 118, determination: 'commercial-estimate' }, status: 'approved', requestedBy: 'cashier', inspectedBy: 'inspector', approvedBy: 'approver', requestedAt: '2026-07-15T09:00:00.000Z', approvedAt: '2026-07-15T10:00:00.000Z', scope, version: 3,
      financialCredit: { id: 'credit-1', number: 'RC/1', retailReturnId: 'return-1', customerAccountId: 'customer-1', issuedAmount: 118, availableAmount: 118, reservedAmount: 0, settledAmount: 0, status: 'open', issuedBy: 'approver', issuedAt: '2026-07-15T10:00:00.000Z', version: 1, scope, settlements: [], gstCreditEvidence: { id: 'gst-1', number: 'GSTCR/1', retailReturnId: 'return-1', retailReturnNumber: 'RTRN/26-27/00001', sourceInvoiceId: 'invoice-1', sourceInvoiceNumber: 'INV/1', sourceInvoiceDate: '2026-07-15', supplierGstin: '27ABCDE1234F1Z5', treatment: 'intra-state', taxableValue: 100, cgst: 9, sgst: 9, igst: 0, cess: 0, totalTax: 18, totalCredit: 118, lines: [], frozenBy: 'approver', frozenAt: '2026-07-15T10:00:00.000Z', checksum: 'source-checksum' } },
    }];
    const prepared = prepareRetailCreditNoteReconciliation(state, { retailReturnId: 'return-1', filingPeriod: '2026-07' }, 'finance-user');
    expect(prepared.retailCreditNoteReconciliations[0]).toMatchObject({ status: 'prepared', totalCredit: 118, filingPeriod: '2026-07' });
    const record = prepared.retailCreditNoteReconciliations[0]!;
    const matched = recordRetailCreditNotePortalResponse(prepared, { id: record.id, expectedVersion: record.version, remoteStatus: 'accepted', remotePayloadChecksum: record.payloadChecksum, externalReference: 'GSP-123' }, 'finance-reviewer');
    expect(matched.retailCreditNoteReconciliations[0]).toMatchObject({ status: 'matched', externalReference: 'GSP-123' });
  });

  it('marks a provider payload mismatch as drift and prevents duplicate packs', () => {
    const state = createInitialRevenueOpsState();
    const scope = state.scope;
    state.retailReturns = [{ id: 'return-2', number: 'RTRN/2', retailSaleId: 'sale-2', retailSaleNumber: 'POS/2', invoiceId: 'invoice-2', counterId: 'counter-2', warehouseId: 'warehouse-2', customerAccountId: 'customer-2', transactionKey: 'return-key-2', requestChecksum: 'hash', reason: 'wrong item', lines: [], taxPreview: { treatment: 'intra-state', taxableValue: 50, cgst: 4.5, sgst: 4.5, igst: 0, cess: 0, totalTax: 9, grandTotal: 59, determination: 'commercial-estimate' }, status: 'approved', requestedBy: 'cashier', inspectedBy: 'inspector', approvedBy: 'approver', requestedAt: '2026-07-15T09:00:00.000Z', approvedAt: '2026-07-15T10:00:00.000Z', scope, version: 3, financialCredit: { id: 'credit-2', number: 'RC/2', retailReturnId: 'return-2', customerAccountId: 'customer-2', issuedAmount: 59, availableAmount: 59, reservedAmount: 0, settledAmount: 0, status: 'open', issuedBy: 'approver', issuedAt: '2026-07-15T10:00:00.000Z', version: 1, scope, settlements: [], gstCreditEvidence: { id: 'gst-2', number: 'GSTCR/2', retailReturnId: 'return-2', retailReturnNumber: 'RTRN/2', sourceInvoiceId: 'invoice-2', sourceInvoiceNumber: 'INV/2', sourceInvoiceDate: '2026-07-15', supplierGstin: '27ABCDE1234F1Z5', treatment: 'intra-state', taxableValue: 50, cgst: 4.5, sgst: 4.5, igst: 0, cess: 0, totalTax: 9, totalCredit: 59, lines: [], frozenBy: 'approver', frozenAt: '2026-07-15T10:00:00.000Z', checksum: 'source-checksum' } } }];
    const prepared = prepareRetailCreditNoteReconciliation(state, { retailReturnId: 'return-2', filingPeriod: '2026-07' }, 'finance-user');
    const record = prepared.retailCreditNoteReconciliations[0]!;
    const drift = recordRetailCreditNotePortalResponse(prepared, { id: record.id, expectedVersion: record.version, remoteStatus: 'accepted', remotePayloadChecksum: 'different-payload' }, 'finance-reviewer');
    expect(drift.retailCreditNoteReconciliations[0]?.status).toBe('drift');
    expect(() => prepareRetailCreditNoteReconciliation(prepared, { retailReturnId: 'return-2', filingPeriod: '2026-07' }, 'finance-user')).toThrow('already exists');
  });
});
