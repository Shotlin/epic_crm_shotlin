import { describe, expect, it } from 'vitest';
import { createInitialCrmState } from './crm';
import { createInitialPartyState } from './party';
import { convertQuoteToSalesOrder, decideQuoteApproval, submitQuoteForApproval } from './commercial';
import { createStockLocation } from './fulfilment-control';
import {
  assessPincodeServiceability,
  createDeliveryPromise,
  createPincodeServiceabilityRule,
  decidePincodeServiceabilityRule,
  freezeDeliveryAddress,
} from './pincode-serviceability';
import { createInitialRevenueOpsState, createQuote } from './revenue-ops';
import type {
  CreatePincodeServiceabilityRuleInput,
  FrozenDeliveryAddress,
  RevenueOpsState,
} from '../shared/revenue-ops-contracts';

const POLICY_TIME = '2026-07-15T06:00:00.000Z';
const INDIA_ADDRESS: FrozenDeliveryAddress = {
  addressId: 'address-sahyadri-hq',
  label: 'Mumbai office',
  line1: 'Bandra Kurla Complex',
  line2: '',
  city: 'Mumbai',
  stateCode: '27',
  postalCode: '400051',
  countryCode: 'IN',
  sourceVersion: 1,
  capturedAt: POLICY_TIME,
};

function withOrigin(state = createInitialRevenueOpsState()): RevenueOpsState {
  return createStockLocation(state, {
    code: 'MUM-DC',
    name: 'Mumbai distribution centre',
    stateCode: '27',
  }, 'location-mum');
}

function policyInput(overrides: Partial<CreatePincodeServiceabilityRuleInput> = {}): CreatePincodeServiceabilityRuleInput {
  return {
    code: 'MUM-400051-STD',
    name: 'Mumbai standard fulfilment policy',
    originLocationId: 'location-mum',
    destinationStateCode: '27',
    pinMatchKind: 'exact',
    pinStart: '400051',
    serviceLevel: 'standard',
    serviceable: true,
    codAllowed: false,
    cutoffLocalTime: '14:00',
    dispatchLeadBusinessDays: 1,
    transitMinBusinessDays: 1,
    transitMaxBusinessDays: 2,
    workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    priority: 100,
    effectiveFrom: '2026-04-01',
    evidenceReference: 'OPS-PIN-MUM-2026-07',
    ...overrides,
  };
}

function activeMumbaiPolicy(state: RevenueOpsState): RevenueOpsState {
  const drafted = createPincodeServiceabilityRule(state, policyInput(), 'user-avery', 'policy-mum', POLICY_TIME);
  return decidePincodeServiceabilityRule(drafted, {
    id: 'policy-mum',
    decision: 'activate',
    rationale: 'Independent operations approval after carrier lane evidence review.',
    expectedVersion: 1,
  }, 'user-priya', '2026-07-15T07:00:00.000Z');
}

function commercialContext() {
  const crm = createInitialCrmState();
  const party = createInitialPartyState();
  return {
    opportunities: crm.opportunities,
    accounts: party.accounts,
    contacts: party.contacts,
    addresses: party.addresses,
    activeUserIds: ['user-avery', 'user-priya', 'user-lee'],
  };
}

function goodsOrderWithOrigin(): RevenueOpsState {
  const initial = createInitialRevenueOpsState();
  const goods: RevenueOpsState = {
    ...initial,
    profile: { ...initial.profile, gstRegistered: true, gstin: '27ABCDE1234F1Z5' },
    products: initial.products.map((product) => product.id === 'product-distributor-platform'
      ? { ...product, kind: 'goods' as const, uom: 'UNIT' }
      : product),
    productInterests: initial.productInterests.map((interest) => interest.id === 'interest-sahyadri-platform'
      ? { ...interest, kind: 'goods' as const, quantity: 10, unitPrice: 480000 }
      : interest),
  };
  const quoted = createQuote(goods, {
    opportunityId: 'opp-211',
    placeOfSupplyStateCode: '27',
    recipientTreatment: 'registered',
    recipientGstin: '27AAECS1234K1Z2',
    validUntil: '2026-08-31',
    priceListId: 'price-list-india-direct-2627',
    discountPolicyIds: ['discount-partner-launch-2627'],
  }, commercialContext(), 'user-avery', 'quote-serviceability-1', '2026-07-15T12:00:00.000Z');
  const submitted = submitQuoteForApproval(quoted, {
    id: 'quote-serviceability-1',
    expectedVersion: 1,
    reason: 'Governed goods order ready for delivery promise testing.',
  }, 'user-avery', ['user-priya'], 'approval-serviceability-1', '2026-07-15T13:00:00.000Z');
  const approved = decideQuoteApproval(submitted, {
    requestId: 'approval-serviceability-1',
    decision: 'approved',
    remarks: 'Commercial and tax facts verified.',
    expectedVersion: 1,
  }, 'user-priya', '2026-07-15T14:00:00.000Z');
  const ordered = convertQuoteToSalesOrder(approved, {
    quoteId: 'quote-serviceability-1',
    expectedVersion: 3,
    orderDate: '2026-07-16',
    requiredBy: '2026-08-31',
  }, 'user-avery', 'user-avery', 'order-serviceability-1', '2026-07-16T06:00:00.000Z');
  return withOrigin(ordered);
}

describe('India PIN-code serviceability', () => {
  it('enforces maker-checker activation before a domestic policy becomes usable', () => {
    const drafted = createPincodeServiceabilityRule(withOrigin(), policyInput(), 'user-avery', 'policy-mum', POLICY_TIME);

    expect(drafted.pincodeServiceabilityRules[0]).toMatchObject({
      id: 'policy-mum',
      status: 'draft',
      createdBy: 'user-avery',
      scope: drafted.scope,
      version: 1,
    });
    expect(() => decidePincodeServiceabilityRule(drafted, {
      id: 'policy-mum',
      decision: 'activate',
      rationale: 'Maker cannot attest this commitment.',
      expectedVersion: 1,
    }, 'user-avery')).toThrow('maker cannot activate');

    const active = decidePincodeServiceabilityRule(drafted, {
      id: 'policy-mum',
      decision: 'activate',
      rationale: 'Independent operations approval after lane evidence review.',
      expectedVersion: 1,
    }, 'user-priya', '2026-07-15T07:00:00.000Z');

    expect(active.pincodeServiceabilityRules[0]).toMatchObject({
      status: 'active',
      activatedBy: 'user-priya',
      activatedAt: '2026-07-15T07:00:00.000Z',
      version: 2,
    });
  });

  it('uses effective policy, India cut-off, and weekly calendar dates without fabricating carrier ETA', () => {
    const state = activeMumbaiPolicy(withOrigin());
    const afterCutoff = assessPincodeServiceability(state, {
      address: INDIA_ADDRESS,
      originLocationId: 'location-mum',
      serviceLevel: 'standard',
      paymentMode: 'prepaid',
      estimatedWeightKg: 4,
      orderValue: 25000,
      // 14:30 in Asia/Kolkata on Friday, so the 14:00 policy cutoff is missed.
      requestedAt: '2026-07-17T09:00:00.000Z',
    });

    expect(afterCutoff).toMatchObject({
      status: 'serviceable',
      rule: { id: 'policy-mum', code: 'MUM-400051-STD', version: 2 },
      dispatchBy: '2026-07-21',
      deliveryFrom: '2026-07-22',
      deliveryTo: '2026-07-23',
      calendarBasis: 'weekly-policy-only',
    });
    expect(afterCutoff.reason).toContain('weekly calendar only');

    const codBlocked = assessPincodeServiceability(state, {
      address: INDIA_ADDRESS,
      originLocationId: 'location-mum',
      serviceLevel: 'standard',
      paymentMode: 'cod',
      estimatedWeightKg: 4,
      orderValue: 25000,
      requestedAt: '2026-07-17T09:00:00.000Z',
    });
    expect(codBlocked).toMatchObject({ status: 'blocked', rule: { id: 'policy-mum' } });
    expect(codBlocked.reason).toContain('does not permit cash-on-delivery');

    const noConfiguredRoute = assessPincodeServiceability(state, {
      address: { ...INDIA_ADDRESS, postalCode: '400001' },
      originLocationId: 'location-mum',
      serviceLevel: 'standard',
      paymentMode: 'prepaid',
      estimatedWeightKg: 4,
      orderValue: 25000,
      requestedAt: '2026-07-17T09:00:00.000Z',
    });
    expect(noConfiguredRoute.status).toBe('configuration-required');

    const incompleteIndiaAddress = assessPincodeServiceability(state, {
      address: { ...INDIA_ADDRESS, postalCode: '40005' },
      originLocationId: 'location-mum',
      serviceLevel: 'standard',
      paymentMode: 'prepaid',
      estimatedWeightKg: 4,
      orderValue: 25000,
      requestedAt: '2026-07-17T09:00:00.000Z',
    });
    expect(incompleteIndiaAddress.status).toBe('review-required');
  });

  it('freezes delivery address evidence and supersedes, rather than overwrites, a customer promise', () => {
    const state = activeMumbaiPolicy(goodsOrderWithOrigin());
    const sourceAddress = createInitialPartyState().addresses.find((address) => address.id === 'address-sahyadri-hq');
    expect(sourceAddress).toBeDefined();
    const originalAddress = freezeDeliveryAddress(sourceAddress!, '2026-07-16T06:05:00.000Z');
    const promiseInput = {
      salesOrderId: 'order-serviceability-1',
      shipToAddressId: originalAddress.addressId,
      originLocationId: 'location-mum',
      serviceLevel: 'standard' as const,
      paymentMode: 'prepaid' as const,
      estimatedWeightKg: 4,
      requestedAt: '2026-07-16T06:00:00.000Z',
    };
    const first = createDeliveryPromise(state, promiseInput, originalAddress, 'user-avery', 'promise-1', '2026-07-16T06:10:00.000Z');

    originalAddress.line1 = 'Changed after the customer commitment';
    expect(first.deliveryPromises[0]).toMatchObject({
      id: 'promise-1',
      status: 'active',
      shipToAddress: { line1: 'Bandra Kurla Complex', sourceVersion: 1 },
      calendarBasis: 'weekly-policy-only',
    });

    const revisedAddress: FrozenDeliveryAddress = {
      ...freezeDeliveryAddress(sourceAddress!, '2026-07-17T06:05:00.000Z'),
      line1: 'Bandra Kurla Complex, Tower C',
      sourceVersion: 2,
    };
    const superseded = createDeliveryPromise(first, {
      ...promiseInput,
      requestedAt: '2026-07-17T06:00:00.000Z',
    }, revisedAddress, 'user-priya', 'promise-2', '2026-07-17T06:10:00.000Z');

    expect(superseded.deliveryPromises).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'promise-1',
        status: 'superseded',
        supersededAt: '2026-07-17T06:10:00.000Z',
        shipToAddress: expect.objectContaining({ line1: 'Bandra Kurla Complex', sourceVersion: 1 }),
      }),
      expect.objectContaining({
        id: 'promise-2',
        status: 'active',
        shipToAddress: expect.objectContaining({ line1: 'Bandra Kurla Complex, Tower C', sourceVersion: 2 }),
      }),
    ]));
  });
});
