import { describe, expect, it } from 'vitest';
import { createCleanCrmState, createInitialCrmState } from './crm';
import { createCleanPartyState, createInitialPartyState } from './party';
import {
  bulkAssignOpportunities,
  createAssignmentRule,
  createAudienceSegment,
  createCleanRevenueOpsState,
  createInitialRevenueOpsState,
  createQuote,
  createTerritory,
  getRevenueOpsSnapshot,
  registerIndiaOpportunity,
  resolveOpportunityAssignment,
  updateIndiaProfile,
  validateGstin,
} from './revenue-ops';
import { createBankAccount } from './collections-finance';

function context() {
  const crm = createInitialCrmState();
  const party = createInitialPartyState();
  return { opportunities: crm.opportunities, accounts: party.accounts, contacts: party.contacts, addresses: party.addresses, activeUserIds: ['user-avery', 'user-priya', 'user-lee'] };
}

describe('India revenue operations', () => {
  it('creates a clean India-first operating scope without statutory or commercial sample evidence', () => {
    const crm = createCleanCrmState();
    const party = createCleanPartyState();
    const state = createCleanRevenueOpsState();
    const snapshot = getRevenueOpsSnapshot(state, {
      opportunities: crm.opportunities,
      accounts: party.accounts,
      contacts: party.contacts,
      addresses: party.addresses,
      activeUserIds: ['user-avery'],
    }, '2026-07-15T12:00:00.000Z');

    expect(state.scope).toEqual({ companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' });
    expect(state.profile).toEqual(expect.objectContaining({
      id: 'india-profile-primary',
      legalName: '',
      tradeName: '',
      gstRegistered: false,
      gstin: '',
      pan: '',
      udyamNumber: '',
      defaultStateCode: '',
      currency: 'INR',
      fiscalYearStartMonth: 4,
    }));
    expect(state.territories).toEqual([expect.objectContaining({
      id: 'territory-national',
      name: 'India',
      managerUserId: 'user-avery',
    })]);
    expect(state.assignmentRules).toEqual([]);
    expect(state.assignments).toEqual([]);
    expect(state.segments).toEqual([]);
    expect(state.productInterests).toEqual([]);
    expect(state.taxCodes).toEqual([]);
    expect(state.products).toEqual([]);
    expect(state.priceLists).toEqual([]);
    expect(state.priceListEntries).toEqual([]);
    expect(state.discountPolicies).toEqual([]);
    expect(state.quotes).toEqual([]);
    expect(state.salesOrders).toEqual([]);
    expect(state.invoices).toEqual([]);
    expect(state.receivables).toEqual([]);
    expect(state.paymentReceipts).toEqual([]);
    expect(state.workforceProfiles).toEqual([]);
    expect(state.gstRegistrations).toEqual([]);
    expect(state.carrierAdapters).toEqual([]);
    expect(state.uoms.map(({ code }) => code)).toEqual(['UNIT', 'BOX', 'KG']);
    expect(state.paymentTerms.map(({ code }) => code)).toEqual(['NET15', 'NET30', 'DUE']);
    expect(snapshot.territoryPerformance).toEqual([expect.objectContaining({
      territoryId: 'territory-national',
      pipelineValue: 0,
      weightedValue: 0,
      opportunityCount: 0,
      atRiskCount: 0,
    })]);
    expect(snapshot.metrics).toMatchObject({
      assignedCoverage: 0,
      indiaPipeline: 0,
      quoteValue: 0,
      billedValue: 0,
      outstandingReceivables: 0,
      activeWorkforce: 0,
    });
  });

  it('validates the 15-character GSTIN structure and state alignment', () => {
    expect(validateGstin('27abcde1234f1z5', '27')).toBe('27ABCDE1234F1Z5');
    expect(() => validateGstin('29ABCDE1234F1Z5', '27')).toThrow('state code');
    expect(() => validateGstin('not-a-gstin')).toThrow('15-character');
  });

  it('maintains a versioned India business profile', () => {
    const state = createInitialRevenueOpsState();
    const banked = createBankAccount(state, { code: 'HDFC-PRI', name: 'Primary collection account', bankName: 'HDFC Bank', maskedAccountNumber: '********9012', ifsc: 'HDFC0001234' }, 'bank-primary', '2026-07-15T08:00:00.000Z');
    const updated = updateIndiaProfile(banked, { legalName: 'Northstar Bharat Private Limited', tradeName: 'Northstar Bharat', gstRegistered: true, gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F', udyamNumber: 'UDYAM-MH-00-1234567', defaultStateCode: '27', primaryBankAccountId: 'bank-primary', expectedVersion: 1 });
    expect(updated.profile).toMatchObject({ currency: 'INR', fiscalYearStartMonth: 4, gstin: '27ABCDE1234F1Z5', version: 2 });
    expect(updated.profile.primaryBankAccountId).toBe('bank-primary');
    expect(() => updateIndiaProfile(state, { legalName: 'Northstar Bharat Private Limited', tradeName: 'Northstar Bharat', gstRegistered: true, gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F', udyamNumber: '', defaultStateCode: '27', primaryBankAccountId: 'missing-bank', expectedVersion: 1 })).toThrow('active INR account');
  });

  it('routes strategic and regional opportunities by priority', () => {
    const state = createInitialRevenueOpsState();
    expect(resolveOpportunityAssignment(state, { stateCode: '29', source: 'Website', value: 1500000 }, context().activeUserIds)).toMatchObject({ territoryId: 'territory-south' });
    expect(resolveOpportunityAssignment(state, { stateCode: '29', source: 'Website', value: 15000000 }, context().activeUserIds)).toMatchObject({ territoryId: 'territory-national' });
  });

  it('adds territories and assignment rules with active-user controls', () => {
    const territoryState = createTerritory(createInitialRevenueOpsState(), { code: 'KA-ENT', name: 'Karnataka enterprise', region: 'south', stateCodes: ['29'], managerUserId: 'user-lee' }, context().activeUserIds, 'territory-ka');
    const ruleState = createAssignmentRule(territoryState, { name: 'Karnataka direct', field: 'stateCode', operator: 'equals', value: '29', territoryId: 'territory-ka', assigneeUserId: 'user-lee', priority: 90 }, context().activeUserIds, 'rule-ka');
    expect(resolveOpportunityAssignment(ruleState, { stateCode: '29', source: 'Event', value: 2000000 }, context().activeUserIds)).toMatchObject({ territoryId: 'territory-ka', assigneeUserId: 'user-lee' });
  });

  it('executes controlled bulk assignments and resolves reusable segments', () => {
    const state = createInitialRevenueOpsState();
    const assigned = bulkAssignOpportunities(state, { opportunityIds: ['opp-201', 'opp-202'], expectedVersions: { 'opp-201': 1, 'opp-202': 2 }, territoryId: 'territory-south', assigneeUserId: 'user-lee' }, context(), '2026-07-15T12:00:00.000Z');
    const segmented = createAudienceSegment(assigned, { name: 'South priority pursuits', resource: 'opportunity', stateCodes: [], industries: [], relationships: [], territoryIds: ['territory-south'], minimumOpportunityValue: 100000, shared: true }, 'segment-south');
    const snapshot = getRevenueOpsSnapshot(segmented, context());
    expect(snapshot.assignments.filter(({ territoryId }) => territoryId === 'territory-south').length).toBeGreaterThanOrEqual(2);
    expect(snapshot.segments.find(({ id }) => id === 'segment-south')?.memberIds).toContain('opp-202');
  });

  it('registers product interest and creates an intra-state GST quotation preview', () => {
    const initial = createInitialRevenueOpsState();
    const available = { ...initial, profile: { ...initial.profile, gstRegistered: true, gstin: '27ABCDE1234F1Z5' }, assignments: initial.assignments.filter(({ opportunityId }) => opportunityId !== 'opp-201') };
    const registered = registerIndiaOpportunity(available, { opportunityId: 'opp-201', actorId: 'user-avery', assignedUserId: 'user-avery', territoryId: 'territory-west', assignmentSource: 'automatic', title: 'India rollout', accountId: 'account-kestrel', contactId: 'contact-maya', stateCode: '27', source: 'Partner', value: 100000, expectedClose: '2026-09-30', nextStep: 'Confirm scope', productName: 'Operations advisory', productKind: 'service', hsnSac: '998311', quantity: 1, unitPrice: 100000, gstRate: 18 }, 'assignment-new');
    const quoted = createQuote(registered, { opportunityId: 'opp-201', contactId: 'contact-maya', placeOfSupplyStateCode: '27', recipientTreatment: 'registered', recipientGstin: '27ABCDE1234F1Z5', validUntil: '2026-08-31' }, context(), 'user-avery', 'quote-1', '2026-07-15T12:00:00.000Z');
    expect(quoted.quotes[0]?.taxPreview).toMatchObject({ treatment: 'intra-state', taxableValue: 100000, cgst: 9000, sgst: 9000, igst: 0, grandTotal: 118000, determination: 'commercial-estimate' });
    expect(quoted.quotes[0]).toMatchObject({ status: 'draft', version: 1 });
  });

  it('uses an IGST preview for inter-state quotations', () => {
    const initial = createInitialRevenueOpsState();
    const state = { ...initial, profile: { ...initial.profile, gstRegistered: true, gstin: '27ABCDE1234F1Z5' }, productInterests: [{ id: 'interest-1', opportunityId: 'opp-201', accountId: 'account-kestrel', name: 'Platform subscription', kind: 'service' as const, hsnSac: '998314', quantity: 2, unitPrice: 50000, gstRate: 18, notes: '', version: 1 }] };
    const quoted = createQuote(state, { opportunityId: 'opp-201', placeOfSupplyStateCode: '29', recipientTreatment: 'registered', recipientGstin: '29ABCDE1234F1Z5', validUntil: '2026-08-31' }, context(), 'user-avery', 'quote-2', '2026-07-15T12:00:00.000Z');
    expect(quoted.quotes[0]?.taxPreview).toMatchObject({ treatment: 'inter-state', cgst: 0, sgst: 0, igst: 18000, grandTotal: 118000 });
  });

  it('freezes per-line GST and Cess rounding so the quote never creates a phantom paisa', () => {
    const initial = createInitialRevenueOpsState();
    const state = {
      ...initial,
      profile: { ...initial.profile, gstRegistered: true, gstin: '27ABCDE1234F1Z5' },
      taxCodes: initial.taxCodes.map((taxCode) => ({ ...taxCode, cessRate: 1 })),
      productInterests: ['1', '2', '3'].map((suffix) => ({
        id: `interest-rounding-${suffix}`,
        opportunityId: 'opp-201',
        accountId: 'account-kestrel',
        name: `Micro service ${suffix}`,
        kind: 'service' as const,
        hsnSac: '998314',
        quantity: 1,
        unitPrice: 0.01,
        gstRate: 18,
        notes: 'Rounding invariant fixture.',
        catalogProductId: 'product-distributor-platform',
        version: 1,
      })),
    };

    const quoted = createQuote(state, {
      opportunityId: 'opp-201',
      placeOfSupplyStateCode: '27',
      recipientTreatment: 'unregistered',
      recipientGstin: '',
      validUntil: '2026-08-31',
    }, context(), 'user-avery', 'quote-rounding', '2026-07-15T12:00:00.000Z');

    expect(quoted.quotes[0]).toMatchObject({
      taxPreview: { taxableValue: 0.03, cgst: 0, sgst: 0, cess: 0, totalTax: 0, grandTotal: 0.03 },
      lines: expect.arrayContaining([expect.objectContaining({ cessRate: 1 })]),
    });
  });
});
