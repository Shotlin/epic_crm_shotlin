import { describe, expect, it } from 'vitest';
import { createPeopleReadProjection } from '../domain/people-read-projection';
import { createDeliveryReadProjection } from '../domain/delivery-read-projection';
import { createFinanceReadProjection } from '../domain/finance-read-projection';
import { createSupplyChainReadProjection } from '../domain/supply-chain-read-projection';
import { createStatutoryProviderReadProjection } from '../domain/statutory-provider-read-projection';
import { createManufacturingReadProjection } from '../domain/manufacturing-read-projection';
import { createSalesReadProjection } from '../domain/sales-read-projection';
import {
  createInitialRevenueOpsState,
  getRevenueOpsSnapshot,
} from '../domain/revenue-ops';
import {
  applyDeliveryReadProjectionToSnapshot,
  applyFinanceReadProjectionToSnapshot,
  applySupplyChainReadProjectionToSnapshot,
  applyStatutoryProviderReadProjectionToSnapshot,
  applyManufacturingReadProjectionToSnapshot,
  applyPeopleReadProjectionToSnapshot,
  applySalesReadProjectionToSnapshot,
  normalizeRevenueOpsResponse,
} from './revenue-ops-response-normalizer';

function controlledSnapshot() {
  const state = createInitialRevenueOpsState();
  const profile = state.workforceProfiles[0];
  if (!profile) throw new Error('Seeded workforce profile is required for this test.');
  state.workforceProfiles = [{ ...profile, scope: structuredClone(state.scope) }];
  state.payrollCompensations = [{
    id: 'compensation-avery',
    number: 'CMP-26-27-00001',
    workforceProfileId: profile.id,
    userId: profile.userId,
    monthlyBasic: 120000,
    monthlyAllowances: 35000,
    paymentMethod: 'bank-transfer',
    paymentReferenceToken: 'vault://compensation/avery',
    effectiveFrom: '2026-04-01',
    status: 'active',
    requestedBy: 'system',
    requestedAt: '2026-04-01T00:00:00.000Z',
    scope: structuredClone(state.scope),
    version: 1,
  }];
  return {
    state,
    snapshot: getRevenueOpsSnapshot(state, {
      opportunities: [],
      accounts: [],
      contacts: [],
      addresses: [],
      activeUserIds: [],
    }, '2026-07-16T10:00:00.000Z'),
  };
}

function controlledProjection() {
  const { state } = controlledSnapshot();
  return createPeopleReadProjection(state, (resource) => {
    if (resource === 'payroll.compensation') {
      return {
        allowed: true,
        deniedFields: ['monthlyBasic', 'paymentReferenceToken'],
      };
    }
    if (resource === 'payroll.run') {
      return { allowed: true, deniedFields: ['totalNetPay'] };
    }
    return { allowed: true, deniedFields: [] };
  }, '2026-07-16T10:00:00.000Z');
}

describe('Revenue Operations IPC response normalizer', () => {
  it('projects bare snapshots, deletes restricted values, and redacts dependent metrics', () => {
    const { snapshot } = controlledSnapshot();
    const projection = controlledProjection();

    const normalized = normalizeRevenueOpsResponse(snapshot, (raw) => (
      applyPeopleReadProjectionToSnapshot(raw, projection, 'user-limited')
    ));

    expect(snapshot.payrollCompensations[0]).toHaveProperty('monthlyBasic', 120000);
    expect(normalized.payrollCompensations[0]).not.toHaveProperty('monthlyBasic');
    expect(normalized.payrollCompensations[0]).not.toHaveProperty('paymentReferenceToken');
    expect(normalized.readProjection).toMatchObject({
      generatedForUserId: 'user-limited',
      redactedFields: {
        'payroll.compensation': ['monthlyBasic', 'paymentReferenceToken'],
      },
    });
    expect(normalized.readProjection.redactedMetrics).toContain('payrollNetPayThisMonth');
    expect(normalized.metrics).not.toHaveProperty('payrollNetPayThisMonth');
  });

  it('projects the revenue member of a mutation envelope without touching unrelated data', () => {
    const { snapshot } = controlledSnapshot();
    const projection = controlledProjection();
    const envelope = { crm: { revision: 12 }, revenue: snapshot };

    const normalized = normalizeRevenueOpsResponse(envelope, (raw) => (
      applyPeopleReadProjectionToSnapshot(raw, projection, 'user-limited')
    ));

    expect(normalized.crm).toEqual({ revision: 12 });
    expect(normalized.revenue.payrollCompensations[0]).not.toHaveProperty('monthlyBasic');
  });

  it('fails closed when a projection and its response do not share the same scope', () => {
    const { snapshot } = controlledSnapshot();
    const projection = controlledProjection();

    expect(() => applyPeopleReadProjectionToSnapshot(snapshot, {
      ...projection,
      scope: { companyId: 'company-other', branchId: 'branch-other' },
    }, 'user-limited')).toThrow(/scope does not match/i);
  });

  it('removes internal delivery cost from a nested response and omits the derived aggregate', () => {
    const { state, snapshot } = controlledSnapshot();
    state.timeEntries = [{
      id: 'time-1', number: 'TIM-1', projectId: 'project-1', projectTaskId: 'task-1',
      workDate: '2026-07-16', hours: 4, billable: true, hourlyCost: 780, costAmount: 3120,
      notes: 'Approved customer delivery evidence.', status: 'approved', submittedBy: 'user-lee',
      submittedAt: '2026-07-16T10:00:00.000Z', scope: structuredClone(state.scope), version: 1,
    }];
    const raw = getRevenueOpsSnapshot(state, {
      opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [],
    }, '2026-07-16T10:00:00.000Z');
    const projection = createDeliveryReadProjection(state, (resource) => (
      resource === 'delivery.project'
        ? { allowed: true, deniedFields: ['hourlyCost', 'costAmount'] }
        : { allowed: true, deniedFields: [] }
    ));
    const normalized = normalizeRevenueOpsResponse({ revenue: raw }, (value) => (
      applyDeliveryReadProjectionToSnapshot(value, projection, 'user-limited')
    ));

    expect(snapshot).toBeDefined();
    expect(normalized.revenue.timeEntries[0]).not.toHaveProperty('hourlyCost');
    expect(normalized.revenue.timeEntries[0]).not.toHaveProperty('costAmount');
    expect(normalized.revenue.metrics).not.toHaveProperty('approvedDeliveryCost');
    expect(normalized.revenue.readProjection.redactedMetrics).toContain('approvedDeliveryCost');
  });

  it('removes denied receivable amounts and exposure metrics before a response crosses IPC', () => {
    const { state } = controlledSnapshot();
    state.receivables = [{
      id: 'receivable-1', invoiceId: 'invoice-1', accountId: 'account-alpha', invoiceNumber: 'INV-1',
      invoiceDate: '2026-07-01', dueDate: '2026-07-31', originalAmount: 118000, adjustmentAmount: 0,
      paidAmount: 18000, outstandingAmount: 100000, status: 'partially-paid',
      scope: structuredClone(state.scope), version: 1,
    }];
    const raw = getRevenueOpsSnapshot(state, {
      opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [],
    }, '2026-07-16T10:00:00.000Z');
    const projection = createFinanceReadProjection(state, (resource) => (
      resource === 'finance.receivable'
        ? { allowed: true, deniedFields: ['outstandingAmount'] }
        : { allowed: true, deniedFields: [] }
    ));
    const normalized = normalizeRevenueOpsResponse(raw, (value) => (
      applyFinanceReadProjectionToSnapshot(value, projection, 'user-limited')
    ));

    expect(normalized.receivables[0]).not.toHaveProperty('outstandingAmount');
    expect(normalized.metrics).not.toHaveProperty('outstandingReceivables');
    expect(normalized.readProjection.redactedMetrics).toContain('outstandingReceivables');
  });

  it('projects supply-chain records in a mutation envelope without exposing denied inventory data', () => {
    const { state } = controlledSnapshot();
    state.inventoryItems = [{
      id: 'item-1', productId: 'product-1', code: 'ITEM-1', name: 'Controlled inventory item',
      baseUomId: 'uom-1', tracking: 'none', valuationMethod: 'fifo', active: true,
      scope: structuredClone(state.scope), version: 1,
    }];
    const raw = getRevenueOpsSnapshot(state, {
      opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [],
    }, '2026-07-17T10:00:00.000Z');
    const projection = createSupplyChainReadProjection(state, (resource) => (
      resource === 'inventory.master'
        ? { allowed: false, deniedFields: [] }
        : { allowed: true, deniedFields: [] }
    ));
    const normalized = normalizeRevenueOpsResponse({ revenue: raw }, (value) => (
      applySupplyChainReadProjectionToSnapshot(value, projection, 'user-limited')
    ));

    expect(normalized.revenue.inventoryItems).toEqual([]);
    expect(normalized.revenue.readProjection.hiddenCollections).toContain('inventoryItems');
  });

  it('projects denied commercial documents out of the IPC response and removes their value aggregates', () => {
    const { state } = controlledSnapshot();
    state.quotes = [{ id: 'quote-1', number: 'QT-1', opportunityId: 'opp-1', accountId: 'account-1', placeOfSupplyStateCode: '27', recipientTreatment: 'registered', recipientGstin: '27ABCDE1234F1Z5', currency: 'INR', status: 'draft', validUntil: '2026-08-01', lines: [], taxPreview: { treatment: 'intra-state', taxableValue: 100, cgst: 9, sgst: 9, igst: 0, totalTax: 18, grandTotal: 118, determination: 'commercial-estimate' }, discountPolicyIds: [], subtotal: 100, discountTotal: 0, pricingAsOf: '2026-07-17', revisionNumber: 1, createdBy: 'user-1', createdAt: '2026-07-17T09:00:00.000Z', scope: structuredClone(state.scope), version: 1 }];
    const raw = getRevenueOpsSnapshot(state, { opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [] }, '2026-07-17T10:00:00.000Z');
    const projection = createSalesReadProjection(state, (resource) => resource === 'sales.commercial' ? { allowed: false, deniedFields: [] } : { allowed: true, deniedFields: [] });
    const normalized = normalizeRevenueOpsResponse({ revenue: raw }, (value) => applySalesReadProjectionToSnapshot(value, projection, 'user-limited'));
    expect(normalized.revenue.quotes).toEqual([]);
    expect(normalized.revenue.metrics).not.toHaveProperty('quoteValue');
    expect(normalized.revenue.readProjection.hiddenCollections).toContain('quotes');
  });

  it('projects denied provider connectors out of the IPC response and removes their activation metric', () => {
    const { state } = controlledSnapshot();
    state.providerConnectors = [{
      id: 'connector-1', code: 'CON-1', name: 'Controlled connector', providerLegalName: 'Provider Limited',
      domain: 'banking', environment: 'sandbox', baseUrl: 'https://provider.test', statusPathTemplate: '/status/{id}',
      capabilities: ['payment-status-pull'], specificationVersion: '1.0', credentialStatus: 'missing',
      conformanceStatus: 'draft', active: true, createdBy: 'user-avery', createdAt: '2026-07-17T10:00:00.000Z',
      scope: structuredClone(state.scope), version: 1,
    }];
    const raw = getRevenueOpsSnapshot(state, { opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [] }, '2026-07-17T10:00:00.000Z');
    const projection = createStatutoryProviderReadProjection(state, (resource) => (
      resource === 'provider.connector' ? { allowed: false, deniedFields: [] } : { allowed: true, deniedFields: [] }
    ));
    const normalized = normalizeRevenueOpsResponse(raw, (value) => applyStatutoryProviderReadProjectionToSnapshot(value, projection, 'user-limited'));
    expect(normalized.providerConnectors).toEqual([]);
    expect(normalized.metrics).not.toHaveProperty('providerCredentialGaps');
  });

  it('projects denied manufacturing engineering records out of the IPC response', () => {
    const { state } = controlledSnapshot();
    state.workCenters = [{ id: 'center-1', code: 'CUT-1', name: 'Controlled cell', warehouseId: 'warehouse-1', capacityMinutesPerDay: 480, efficiencyPercent: 85, costRatePerHour: 900, active: true, scope: structuredClone(state.scope), version: 1 }];
    const raw = getRevenueOpsSnapshot(state, { opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [] }, '2026-07-17T10:00:00.000Z');
    const projection = createManufacturingReadProjection(state, (resource) => resource === 'manufacturing.engineering' ? { allowed: false, deniedFields: [] } : { allowed: true, deniedFields: [] });
    const normalized = normalizeRevenueOpsResponse({ revenue: raw }, (value) => applyManufacturingReadProjectionToSnapshot(value, projection, 'user-limited'));
    expect(normalized.revenue.workCenters).toEqual([]);
    expect(normalized.revenue.readProjection.hiddenCollections).toContain('workCenters');
  });
});
