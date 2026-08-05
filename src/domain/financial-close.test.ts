import { describe, expect, it } from 'vitest';
import { exportJournal, createInvoiceDraft, issueInvoice } from './order-to-cash';
import {
  consumeServiceEntitlement,
  createAccountingClosePeriod,
  createProjectBillingClaim,
  createProjectBillingPlan,
  decideAccountingClosePeriod,
  decideProjectBillingClaim,
  decideProjectBillingPlan,
  reopenAccountingClosePeriod,
} from './financial-close';
import { createInitialRevenueOpsState } from './revenue-ops';

const T0 = '2026-07-15T08:00:00.000Z';

function billingState() {
  const state = createInitialRevenueOpsState();
  const line = { id: 'line-1', productInterestId: 'interest-1', description: 'Implementation services', hsnSac: '998314', quantity: 100, unitPrice: 1000, taxableValue: 100000, gstRate: 18, catalogProductId: 'product-distributor-platform' };
  state.quotes = [{ id: 'quote-1', number: 'Q-1', opportunityId: 'opp-1', accountId: 'account-alpha', placeOfSupplyStateCode: '27', recipientTreatment: 'unregistered', recipientGstin: '', currency: 'INR', status: 'converted', validUntil: '2026-12-31', lines: [line], taxPreview: { treatment: 'intra-state', taxableValue: 100000, cgst: 9000, sgst: 9000, igst: 0, totalTax: 18000, grandTotal: 118000, determination: 'commercial-estimate' }, discountPolicyIds: [], subtotal: 100000, discountTotal: 0, pricingAsOf: '2026-07-01', revisionNumber: 1, createdBy: 'user-avery', createdAt: T0, version: 1 }];
  state.salesOrders = [{ id: 'order-1', number: 'SO-1', quoteId: 'quote-1', quoteNumber: 'Q-1', accountId: 'account-alpha', currency: 'INR', orderDate: '2026-07-01', requiredBy: '2026-09-30', status: 'confirmed', fulfilmentStatus: 'planned', lines: [line], subtotal: 100000, discountTotal: 0, taxPreview: state.quotes[0]!.taxPreview, approvedQuoteVersion: 1, createdBy: 'user-avery', createdAt: T0, version: 1 }];
  state.deliveryProjects = [{ id: 'project-1', number: 'PRJ-1', accountId: 'account-alpha', salesOrderId: 'order-1', name: 'Implementation delivery', deliveryModel: 'time-and-materials', budgetAmount: 120000, plannedHours: 100, startDate: '2026-07-01', targetDate: '2026-09-30', managerUserId: 'user-avery', status: 'active', requestedBy: 'user-avery', requestedAt: T0, version: 1 }];
  state.projectTasks = [{ id: 'task-1', number: 'TSK-1', projectId: 'project-1', sequence: 1, title: 'Configure operating flows', plannedHours: 16, actualApprovedHours: 8, billable: true, assigneeUserId: 'user-lee', dueDate: '2026-07-20', status: 'in-progress', createdBy: 'user-avery', createdAt: T0, version: 1 }];
  state.timeEntries = [{ id: 'time-1', number: 'TIM-1', projectId: 'project-1', projectTaskId: 'task-1', workDate: '2026-07-16', hours: 8, billable: true, hourlyCost: 780, costAmount: 6240, notes: 'Configured governed customer operating flows and validated the controls.', status: 'approved', submittedBy: 'user-lee', submittedAt: T0, decidedBy: 'user-avery', decidedAt: T0, decisionRemarks: 'Evidence approved.', version: 1 }];
  state.serviceAgreements = [{ id: 'agreement-1', number: 'SVC-1', accountId: 'account-alpha', projectId: 'project-1', name: 'Implementation support', coverage: 'remote', effectiveFrom: '2026-07-01', effectiveTo: '2026-12-31', includedHours: 6, targets: [{ priority: 'critical', responseMinutes: 30, resolutionMinutes: 240 }, { priority: 'high', responseMinutes: 60, resolutionMinutes: 480 }, { priority: 'normal', responseMinutes: 240, resolutionMinutes: 1440 }, { priority: 'low', responseMinutes: 480, resolutionMinutes: 2880 }], status: 'active', requestedBy: 'user-avery', requestedAt: T0, decidedBy: 'user-priya', decidedAt: T0, decisionRemarks: 'Approved.', version: 1 }];
  return state;
}

describe('financial close and project monetisation', () => {
  it('recognizes independently reviewed time-and-materials claims, then clears unbilled revenue through invoicing', () => {
    let state = billingState();
    state = createProjectBillingPlan(state, { projectId: 'project-1', salesOrderId: 'order-1', salesOrderLineId: 'line-1', billingModel: 'time-and-materials', billRate: 1000, effectiveFrom: '2026-07-01', effectiveTo: '2026-09-30' }, 'user-avery', 'plan-1', T0);
    expect(() => decideProjectBillingPlan(state, { id: 'plan-1', decision: 'active', remarks: 'Independent commercial review complete.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker');
    state = decideProjectBillingPlan(state, { id: 'plan-1', decision: 'active', remarks: 'Independent commercial review complete.', expectedVersion: 1 }, 'user-priya', T0);
    state = createProjectBillingClaim(state, { planId: 'plan-1', billingPeriodFrom: '2026-07-01', billingPeriodTo: '2026-07-31', timeEntryIds: ['time-1'], milestoneIds: [] }, 'user-avery', 'claim-1', T0);
    expect(state.projectBillingClaims[0]).toMatchObject({ number: 'BCL-26-27-00001', recognizedAmount: 8000, status: 'submitted' });
    expect(() => decideProjectBillingClaim(state, { id: 'claim-1', decision: 'recognized', recognitionDate: '2026-07-31', remarks: 'Financial review confirms approved billable evidence.', expectedVersion: 1 }, 'user-avery', 'event-1', 'journal-1', T0)).toThrow('maker');
    state = decideProjectBillingClaim(state, { id: 'claim-1', decision: 'recognized', recognitionDate: '2026-07-31', remarks: 'Financial review confirms approved billable evidence.', expectedVersion: 1 }, 'user-priya', 'event-1', 'journal-1', T0);
    expect(state.journalDrafts[0]).toMatchObject({ sourceType: 'revenue-recognition', totalDebit: 8000, totalCredit: 8000, status: 'ready' });
    state = createInvoiceDraft(state, { salesOrderId: 'order-1', documentKind: 'bill-of-supply', invoiceDate: '2026-08-01', paymentTermId: 'payment-term-net-30', reverseCharge: false, basis: 'project-claims', milestoneIds: [], projectBillingClaimIds: ['claim-1'] }, 'user-avery', 'invoice-1', T0);
    state = issueInvoice(state, { id: 'invoice-1', expectedVersion: 1 }, 'user-priya', T0);
    expect(state.projectBillingClaims[0]).toMatchObject({ status: 'invoiced', invoiceId: 'invoice-1' });
    expect(state.journalDrafts[0]?.lines[1]).toMatchObject({ accountCode: 'unbilled-revenue', credit: 8000 });
  });

  it('tracks entitlement overages and requires export-ready financial evidence before close', () => {
    let state = billingState();
    state = consumeServiceEntitlement(state, { serviceAgreementId: 'agreement-1', timeEntryId: 'time-1' }, 'user-avery', 'usage-1', T0);
    expect(state.serviceEntitlementUsage[0]).toMatchObject({ status: 'overage', hours: 8 });
    state = createProjectBillingPlan(state, { projectId: 'project-1', salesOrderId: 'order-1', salesOrderLineId: 'line-1', billingModel: 'time-and-materials', billRate: 1000, effectiveFrom: '2026-07-01', effectiveTo: '2026-09-30' }, 'user-avery', 'plan-1', T0);
    state = decideProjectBillingPlan(state, { id: 'plan-1', decision: 'active', remarks: 'Independent commercial review complete.', expectedVersion: 1 }, 'user-priya', T0);
    state = createProjectBillingClaim(state, { planId: 'plan-1', billingPeriodFrom: '2026-07-01', billingPeriodTo: '2026-07-31', timeEntryIds: ['time-1'], milestoneIds: [] }, 'user-avery', 'claim-1', T0);
    state = decideProjectBillingClaim(state, { id: 'claim-1', decision: 'recognized', recognitionDate: '2026-07-31', remarks: 'Financial review confirms approved billable evidence.', expectedVersion: 1 }, 'user-priya', 'event-1', 'journal-1', T0);
    state = createAccountingClosePeriod(state, { name: 'July 2026 close', periodFrom: '2026-07-01', periodTo: '2026-07-31' }, 'user-priya', 'close-1', T0);
    expect(() => decideAccountingClosePeriod(state, { id: 'close-1', decision: 'closed', remarks: 'Attempting financial close with an unexported recognition journal.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('journal');
    const canonicallyClosed = decideAccountingClosePeriod(
      state,
      { id: 'close-1', decision: 'closed', remarks: 'Canonical ledger posting is immutable and ready to close.', expectedVersion: 1 },
      'user-avery',
      T0,
      (draft) => draft.id === 'journal-1',
    );
    expect(canonicallyClosed.accountingClosePeriods[0]).toMatchObject({ status: 'closed', decidedBy: 'user-avery' });
    expect(canonicallyClosed.journalDrafts[0]).toMatchObject({ status: 'ready' });
    state = exportJournal(state, { id: 'journal-1', externalReference: 'GL-EXPORT-260731', expectedVersion: 1 }, 'user-priya', T0);
    state = decideAccountingClosePeriod(state, { id: 'close-1', decision: 'closed', remarks: 'Recognition evidence is exported and the period is ready to close.', expectedVersion: 1 }, 'user-avery', T0);
    expect(state.accountingClosePeriods[0]).toMatchObject({ status: 'closed', decidedBy: 'user-avery' });
    expect(() => createInvoiceDraft(state, { salesOrderId: 'order-1', documentKind: 'bill-of-supply', invoiceDate: '2026-07-31', paymentTermId: 'payment-term-net-30', reverseCharge: false, basis: 'project-claims', milestoneIds: [], projectBillingClaimIds: ['claim-1'] }, 'user-avery', 'late-invoice', T0)).toThrow('closed');
    state = reopenAccountingClosePeriod(state, { id: 'close-1', reason: 'Correct a governed commercial-period allocation.', expectedVersion: 2 }, 'user-priya', T0);
    expect(state.accountingClosePeriods[0]).toMatchObject({ status: 'reopened', reopenedBy: 'user-priya' });
  });
});
