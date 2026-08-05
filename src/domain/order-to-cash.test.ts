import { describe, expect, it } from 'vitest';
import { createInitialCrmState } from './crm';
import { createInitialPartyState } from './party';
import { createInitialRevenueOpsState, createQuote } from './revenue-ops';
import { convertQuoteToSalesOrder, decideQuoteApproval, submitQuoteForApproval, updateFulfilmentTask } from './commercial';
import {
  applyUnappliedReceipt,
  createCreditDebitNote,
  createInvoiceDraft,
  createPaymentTerm,
  createServiceMilestone,
  exportJournal,
  issueInvoice,
  reconcilePayment,
  recordDeliveryEvidence,
  recordPayment,
  transitionServiceMilestone,
} from './order-to-cash';

function context() {
  const crm = createInitialCrmState();
  const party = createInitialPartyState();
  return { opportunities: crm.opportunities, accounts: party.accounts, contacts: party.contacts, addresses: party.addresses, activeUserIds: ['user-avery', 'user-priya', 'user-lee'] };
}

function orderedState() {
  const initial = createInitialRevenueOpsState();
  const available = { ...initial, profile: { ...initial.profile, gstRegistered: true, gstin: '27ABCDE1234F1Z5' } };
  const quoted = createQuote(available, { opportunityId: 'opp-211', placeOfSupplyStateCode: '27', recipientTreatment: 'unregistered', recipientGstin: '', validUntil: '2026-08-31', priceListId: 'price-list-india-direct-2627', discountPolicyIds: ['discount-partner-launch-2627'] }, context(), 'user-avery', 'quote-otc-1', '2026-07-15T12:00:00.000Z');
  const submitted = submitQuoteForApproval(quoted, { id: 'quote-otc-1', expectedVersion: 1, reason: 'Approve governed commercial terms.' }, 'user-avery', ['user-priya'], 'approval-otc-1', '2026-07-15T13:00:00.000Z');
  const approved = decideQuoteApproval(submitted, { requestId: 'approval-otc-1', decision: 'approved', remarks: 'Approved for order.', expectedVersion: 1 }, 'user-priya', '2026-07-15T14:00:00.000Z');
  return convertQuoteToSalesOrder(approved, { quoteId: 'quote-otc-1', expectedVersion: 3, orderDate: '2026-07-16', requiredBy: '2026-09-30' }, 'user-avery', 'user-avery', 'order-otc-1', '2026-07-16T06:00:00.000Z');
}

function fulfilledState() {
  let state = orderedState();
  for (const original of [...state.fulfilmentTasks]) {
    state = updateFulfilmentTask(state, { id: original.id, toStatus: 'ready', expectedVersion: 1 });
    state = updateFulfilmentTask(state, { id: original.id, toStatus: 'in-progress', expectedVersion: 2 });
    state = updateFulfilmentTask(state, { id: original.id, toStatus: 'completed', expectedVersion: 3 });
  }
  return state;
}

describe('order-to-cash revenue ledger', () => {
  it('governs payment terms, delivery evidence, and accepted service milestones', () => {
    const initial = orderedState();
    const terms = createPaymentTerm(initial, { code: 'NET45', name: 'Net 45 days', dueDays: 45, earlyPaymentDays: 10, earlyPaymentDiscountPercent: 1 }, 'term-net45');
    expect(terms.paymentTerms[0]).toMatchObject({ code: 'NET45', dueDays: 45, version: 1 });
    expect(() => createPaymentTerm(terms, { code: 'NET45', name: 'Duplicate', dueDays: 45, earlyPaymentDays: 0, earlyPaymentDiscountPercent: 0 })).toThrow('already exists');
    const evidence = recordDeliveryEvidence(terms, { salesOrderId: 'order-otc-1', type: 'service-acceptance', reference: 'ACCEPT-2026-001', occurredAt: '2026-07-20T10:00:00.000Z', notes: 'Customer accepted the foundation milestone.' }, 'user-avery', 'evidence-1', '2026-07-20T10:05:00.000Z');
    expect(() => recordDeliveryEvidence(evidence, { salesOrderId: 'order-otc-1', type: 'service-acceptance', reference: 'ACCEPT-2026-001', occurredAt: '2026-07-20T10:00:00.000Z', notes: 'Duplicate reference.' }, 'user-avery')).toThrow('already exists');
    const lineId = evidence.salesOrders[0]!.lines[0]!.id;
    const planned = createServiceMilestone(evidence, { salesOrderId: 'order-otc-1', lineId, name: 'Foundation accepted', percentage: 25, dueDate: '2026-07-31' }, 'milestone-1');
    const ready = transitionServiceMilestone(planned, { id: 'milestone-1', toStatus: 'ready', expectedVersion: 1 });
    expect(() => transitionServiceMilestone(ready, { id: 'milestone-1', toStatus: 'accepted', expectedVersion: 2 })).toThrow('evidence reference');
    const accepted = transitionServiceMilestone(ready, { id: 'milestone-1', toStatus: 'accepted', acceptanceReference: 'ACCEPT-2026-001', expectedVersion: 2 });
    expect(accepted.serviceMilestones[0]).toMatchObject({ status: 'accepted', percentage: 25, version: 3 });
  });

  it('issues a milestone tax invoice with receivable and balanced accounting handoff', () => {
    const initial = orderedState();
    const lineId = initial.salesOrders[0]!.lines[0]!.id;
    const planned = createServiceMilestone(initial, { salesOrderId: 'order-otc-1', lineId, name: 'Design acceptance', percentage: 25, dueDate: '2026-07-31' }, 'milestone-1');
    const ready = transitionServiceMilestone(planned, { id: 'milestone-1', toStatus: 'ready', expectedVersion: 1 });
    const accepted = transitionServiceMilestone(ready, { id: 'milestone-1', toStatus: 'accepted', acceptanceReference: 'EMAIL-ACCEPT-01', expectedVersion: 2 });
    const drafted = createInvoiceDraft(accepted, { salesOrderId: 'order-otc-1', documentKind: 'tax-invoice', invoiceDate: '2026-07-20', paymentTermId: 'payment-term-net-30', reverseCharge: false, basis: 'accepted-milestones', milestoneIds: ['milestone-1'] }, 'user-avery', 'invoice-1', '2026-07-20T12:00:00.000Z');
    expect(drafted.invoices[0]).toMatchObject({ status: 'draft', dueDate: '2026-08-19', subtotal: 1200000, discountTotal: 30000, amountDue: 1380600 });
    expect(drafted.invoices[0]?.scope).toEqual(drafted.salesOrders[0]?.scope);
    const issued = issueInvoice(drafted, { id: 'invoice-1', expectedVersion: 1 }, 'user-priya', '2026-07-20T13:00:00.000Z');
    expect(issued.invoices[0]).toMatchObject({ number: 'INV-26-27-00001', status: 'issued', irpStatus: 'not-applicable', version: 2 });
    expect(issued.receivables[0]).toMatchObject({ originalAmount: 1380600, outstandingAmount: 1380600, status: 'current' });
    expect(issued.receivables[0]?.scope).toEqual(issued.invoices[0]?.scope);
    expect(issued.journalDrafts[0]).toMatchObject({ sourceType: 'invoice', totalDebit: 1380600, totalCredit: 1380600, status: 'ready' });
    expect(issued.serviceMilestones[0]).toMatchObject({ status: 'invoiced', version: 4 });
  });

  it('handles full-order invoicing, credit notes, cash allocation, reconciliation, and journal export', () => {
    const drafted = createInvoiceDraft(fulfilledState(), { salesOrderId: 'order-otc-1', documentKind: 'tax-invoice', invoiceDate: '2026-10-01', paymentTermId: 'payment-term-net-15', reverseCharge: false, basis: 'order-completion', milestoneIds: [] }, 'user-avery', 'invoice-full', '2026-10-01T08:00:00.000Z');
    const issued = issueInvoice(drafted, { id: 'invoice-full', expectedVersion: 1 }, 'user-priya', '2026-10-01T09:00:00.000Z');
    const credited = createCreditDebitNote(issued, { invoiceId: 'invoice-full', type: 'credit', reason: 'Service-level concession approved after delivery.', taxableValue: 100000, gstRate: 18, noteDate: '2026-10-02' }, 'user-priya', 'credit-1', '2026-10-02T09:00:00.000Z');
    expect(credited.creditDebitNotes[0]).toMatchObject({ number: 'CRN-26-27-00001', totalAmount: 118000 });
    expect(credited.receivables[0]?.outstandingAmount).toBe(5404400);
    const receivable = credited.receivables[0]!;
    const paid = recordPayment(credited, { accountId: receivable.accountId, receivedAt: '2026-10-03T10:00:00.000Z', method: 'upi', reference: 'UTR-20261003-001', amount: 1000000, allocations: [{ receivableId: receivable.id, amount: 900000 }] }, 'user-avery', 'payment-1');
    expect(paid.paymentReceipts[0]).toMatchObject({ number: 'RCPT-26-27-00001', unappliedAmount: 100000, status: 'recorded' });
    expect(paid.paymentReceipts[0]?.scope).toEqual(receivable.scope);
    expect(paid.receivables[0]).toMatchObject({ paidAmount: 900000, outstandingAmount: 4504400, status: 'partially-paid' });
    const otherScopeReceivable = { ...receivable, id: 'receivable-other-scope', outstandingAmount: 1000000, scope: { companyId: 'company-other', branchId: 'branch-other' } };
    expect(() => recordPayment(
      { ...credited, receivables: [...credited.receivables, otherScopeReceivable] },
      { accountId: receivable.accountId, receivedAt: '2026-10-03T10:00:00.000Z', method: 'upi', reference: 'UTR-20261003-002', amount: 1800000, allocations: [{ receivableId: receivable.id, amount: 900000 }, { receivableId: otherScopeReceivable.id, amount: 900000 }] },
      'user-avery',
      'payment-cross-scope',
    )).toThrow('one company and branch scope');
    const reconciled = reconcilePayment(paid, { id: 'payment-1', expectedVersion: 1 }, 'user-priya', '2026-10-03T11:00:00.000Z');
    const paymentJournal = reconciled.journalDrafts.find(({ sourceType }) => sourceType === 'payment')!;
    expect(paymentJournal).toMatchObject({ status: 'ready', totalDebit: 1000000, totalCredit: 1000000, version: 2 });
    const exported = exportJournal(reconciled, { id: paymentJournal.id, externalReference: 'GL-BATCH-2026-10-03-A', expectedVersion: 2 }, 'user-priya', '2026-10-03T11:30:00.000Z');
    expect(exported.journalDrafts.find(({ id }) => id === paymentJournal.id)).toMatchObject({ status: 'exported', externalReference: 'GL-BATCH-2026-10-03-A', version: 3 });
  });

  it('applies documented unapplied receipt cash in place without creating a second journal', () => {
    const drafted = createInvoiceDraft(fulfilledState(), { salesOrderId: 'order-otc-1', documentKind: 'tax-invoice', invoiceDate: '2026-10-01', paymentTermId: 'payment-term-net-15', reverseCharge: false, basis: 'order-completion', milestoneIds: [] }, 'user-avery', 'invoice-apply', '2026-10-01T08:00:00.000Z');
    const issued = issueInvoice(drafted, { id: 'invoice-apply', expectedVersion: 1 }, 'user-priya', '2026-10-01T09:00:00.000Z');
    const receivable = issued.receivables[0]!;
    const recorded = recordPayment(issued, { accountId: receivable.accountId, receivedAt: '2026-10-03T10:00:00.000Z', method: 'upi', reference: 'UTR-20261003-APPLY', amount: 1000000, allocations: [{ receivableId: receivable.id, amount: 900000 }] }, 'user-avery', 'payment-apply');
    const receipt = recorded.paymentReceipts[0]!;
    const journalBefore = recorded.journalDrafts.find(({ sourceType }) => sourceType === 'payment')!;
    const receivableBefore = recorded.receivables.find(({ id }) => id === receivable.id)!;

    const applied = applyUnappliedReceipt(recorded, {
      id: receipt.id,
      expectedVersion: receipt.version,
      expectedJournalVersion: journalBefore.version,
      evidenceReference: 'REMIT-20261003-01',
      allocations: [{ receivableId: receivable.id, amount: 100000, expectedVersion: receivableBefore.version }],
    }, 'user-priya', '2026-10-03T10:30:00.000Z');

    const updatedReceipt = applied.paymentReceipts.find(({ id }) => id === receipt.id)!;
    const updatedReceivable = applied.receivables.find(({ id }) => id === receivable.id)!;
    const journalAfter = applied.journalDrafts.find(({ sourceType }) => sourceType === 'payment')!;
    expect(updatedReceipt).toMatchObject({ unappliedAmount: 0, version: 2 });
    expect(updatedReceipt.allocations).toEqual([{ receivableId: receivable.id, amount: 1000000 }]);
    expect(updatedReceipt.unappliedCashApplications).toHaveLength(1);
    expect(updatedReceipt.unappliedCashApplications?.[0]).toMatchObject({
      evidenceReference: 'REMIT-20261003-01',
      appliedBy: 'user-priya',
      paymentJournalId: journalBefore.id,
      journalVersionBefore: 1,
      journalVersionAfter: 2,
      allocations: [{ receivableId: receivable.id, amount: 100000, receivableVersionBefore: receivableBefore.version, receivableVersionAfter: receivableBefore.version + 1, outstandingAmountBefore: receivableBefore.outstandingAmount, outstandingAmountAfter: receivableBefore.outstandingAmount - 100000 }],
    });
    expect(updatedReceivable).toMatchObject({ paidAmount: 1000000, outstandingAmount: receivableBefore.outstandingAmount - 100000, status: 'partially-paid', version: receivableBefore.version + 1 });
    expect(applied.journalDrafts.filter(({ sourceType, sourceId }) => sourceType === 'payment' && sourceId === receipt.id)).toHaveLength(1);
    expect(journalAfter).toMatchObject({ id: journalBefore.id, status: 'draft', totalDebit: 1000000, totalCredit: 1000000, version: 2 });
    expect(journalAfter.lines).toEqual([
      { accountCode: 'upi-clearing', debit: 1000000, credit: 0, memo: receipt.number },
      { accountCode: 'accounts-receivable', debit: 0, credit: 1000000, memo: receipt.number },
    ]);
  });

  it('fails closed when a cash application crosses scope/account, exceeds evidence, or reaches a locked payment journal', () => {
    const drafted = createInvoiceDraft(fulfilledState(), { salesOrderId: 'order-otc-1', documentKind: 'tax-invoice', invoiceDate: '2026-10-01', paymentTermId: 'payment-term-net-15', reverseCharge: false, basis: 'order-completion', milestoneIds: [] }, 'user-avery', 'invoice-apply-guards', '2026-10-01T08:00:00.000Z');
    const issued = issueInvoice(drafted, { id: 'invoice-apply-guards', expectedVersion: 1 }, 'user-priya', '2026-10-01T09:00:00.000Z');
    const receivable = issued.receivables[0]!;
    const recorded = recordPayment(issued, { accountId: receivable.accountId, receivedAt: '2026-10-03T10:00:00.000Z', method: 'upi', reference: 'UTR-20261003-GUARDS', amount: 1000000, allocations: [{ receivableId: receivable.id, amount: 900000 }] }, 'user-avery', 'payment-apply-guards');
    const receipt = recorded.paymentReceipts[0]!;
    const journal = recorded.journalDrafts.find(({ sourceType }) => sourceType === 'payment')!;
    const current = recorded.receivables.find(({ id }) => id === receivable.id)!;
    const input = (allocation: { receivableId: string; amount: number; expectedVersion: number }, expectedJournalVersion = journal.version) => ({ id: receipt.id, expectedVersion: receipt.version, expectedJournalVersion, evidenceReference: 'REMIT-20261003-GUARDS', allocations: [allocation] });
    const crossScope = { ...current, id: 'receivable-cross-scope', scope: { companyId: 'company-other', branchId: 'branch-other' } };
    expect(() => applyUnappliedReceipt({ ...recorded, receivables: [...recorded.receivables, crossScope] }, input({ receivableId: crossScope.id, amount: 100000, expectedVersion: crossScope.version }), 'user-priya')).toThrow('company and branch scope');
    const anotherAccount = { ...current, id: 'receivable-another-account', accountId: 'account-other' };
    expect(() => applyUnappliedReceipt({ ...recorded, receivables: [...recorded.receivables, anotherAccount] }, input({ receivableId: anotherAccount.id, amount: 100000, expectedVersion: anotherAccount.version }), 'user-priya')).toThrow('customer account');
    expect(() => applyUnappliedReceipt(recorded, input({ receivableId: current.id, amount: 100001, expectedVersion: current.version }), 'user-priya')).toThrow('cannot exceed');
    const locked = { ...recorded, journalDrafts: recorded.journalDrafts.map((candidate) => candidate.id === journal.id ? { ...candidate, status: 'ready' as const, version: journal.version + 1 } : candidate) };
    expect(() => applyUnappliedReceipt(locked, input({ receivableId: current.id, amount: 100000, expectedVersion: current.version }, journal.version + 1), 'user-priya')).toThrow('locked');
  });
});
