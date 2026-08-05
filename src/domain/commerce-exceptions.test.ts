import { describe, expect, it } from 'vitest';
import {
  buildCommerceExceptionList,
  buildCommerceExceptionQueue,
} from './commerce-exceptions';
import { createCleanKernelState, createInitialKernelState, getKernelSnapshot } from './kernel';
import { createCleanPartyState, createInitialPartyState, getPartySnapshot } from './party';
import { createCleanRevenueOpsState, createInitialRevenueOpsState, getRevenueOpsSnapshot } from './revenue-ops';
import type { DunningCase } from '../shared/collections-finance-contracts';
import type {
  FulfilmentTask,
  OperatingRecordScope,
  Receivable,
  RevenueOpsSnapshot,
  SalesOrder,
} from '../shared/revenue-ops-contracts';

const NOW = '2026-07-21T12:00:00.000Z';
const scope: OperatingRecordScope = { companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' };
const otherScope: OperatingRecordScope = { companyId: 'company-other', branchId: 'branch-other' };

function snapshots() {
  const crm = { opportunities: [] };
  const party = createInitialPartyState();
  const kernel = createInitialKernelState();
  const revenue = getRevenueOpsSnapshot(createInitialRevenueOpsState(), {
    opportunities: crm.opportunities,
    accounts: party.accounts,
    contacts: party.contacts,
    addresses: party.addresses,
    activeUserIds: kernel.users.map(({ id }) => id),
  }, NOW);
  return {
    revenue,
    party: getPartySnapshot(party, NOW),
    kernel: getKernelSnapshot(kernel, NOW),
  };
}

function salesOrder(id: string, recordScope = scope): SalesOrder {
  return {
    id: `order-${id}`,
    number: `SO-26-27-${id}`,
    quoteId: `quote-${id}`,
    quoteNumber: `Q-26-27-${id}`,
    accountId: 'account-kestrel',
    currency: 'INR',
    orderDate: '2026-07-01',
    requiredBy: '2026-07-20',
    status: 'fulfilling',
    fulfilmentStatus: 'in-progress',
    lines: [],
    subtotal: 10_000,
    discountTotal: 0,
    taxPreview: { treatment: 'intra-state', taxableValue: 10_000, cgst: 900, sgst: 900, igst: 0, totalTax: 1_800, grandTotal: 11_800, determination: 'commercial-estimate' },
    approvedQuoteVersion: 1,
    createdBy: 'user-avery',
    createdAt: '2026-07-01T09:00:00.000Z',
    scope: recordScope,
    version: 1,
  };
}

function fulfilmentTask(id: string, status: FulfilmentTask['status'], recordScope = scope): FulfilmentTask {
  return {
    id,
    salesOrderId: `order-${id}`,
    lineId: `line-${id}`,
    kind: 'dispatch',
    title: `Dispatch for ${id}`,
    ownerUserId: 'user-avery',
    dueAt: '2026-07-20T10:00:00.000Z',
    status,
    blockedReason: status === 'blocked' ? 'Carrier handover evidence is incomplete.' : undefined,
    scope: recordScope,
    version: 1,
  };
}

function receivable(id: string, status: Receivable['status'], recordScope = scope): Receivable {
  return {
    id,
    invoiceId: `invoice-${id}`,
    accountId: 'account-kestrel',
    invoiceNumber: `INV-26-27-${id}`,
    invoiceDate: '2026-07-01',
    dueDate: '2026-07-15',
    originalAmount: 11_800,
    adjustmentAmount: 0,
    paidAmount: 0,
    outstandingAmount: 11_800,
    status,
    scope: recordScope,
    version: 1,
  };
}

function dunning(id: string, recordScope = scope): DunningCase {
  return {
    id,
    number: `DUN-26-27-${id}`,
    receivableId: `receivable-${id}`,
    accountId: 'account-kestrel',
    stage: 'credit-hold',
    status: 'open',
    daysOverdue: 42,
    actionableAmount: 11_800,
    ownerId: 'user-priya',
    nextActionAt: '2026-07-20T09:00:00.000Z',
    createdAt: '2026-07-15T09:00:00.000Z',
    updatedAt: '2026-07-20T09:00:00.000Z',
    scope: recordScope,
    version: 1,
  };
}

function withOperationalEvidence(base: ReturnType<typeof snapshots>): {
  revenue: RevenueOpsSnapshot;
  party: ReturnType<typeof getPartySnapshot>;
  kernel: ReturnType<typeof getKernelSnapshot>;
} {
  const fulfilmentBlocked = fulfilmentTask('blocked', 'blocked');
  const fulfilmentLate = fulfilmentTask('late', 'in-progress');
  const dunningCase = dunning('dunning');
  return {
    ...base,
    kernel: {
      ...base.kernel,
      approvalRequests: [{
        id: 'approval-purchase-1', workflowInstanceId: 'workflow-instance-po-1007', transitionId: 'transition-po-approve',
        policyId: 'approval-po-finance', requestedBy: 'user-avery', requestedAt: '2026-07-20T09:00:00.000Z', status: 'pending', version: 1,
      }],
    },
    revenue: {
      ...base.revenue,
      salesOrders: [salesOrder('blocked'), salesOrder('late')],
      fulfilmentTasks: [fulfilmentBlocked, fulfilmentLate],
      itemVariants: [{ id: 'variant-turmeric', itemId: 'item-turmeric', sku: 'TUR-1', name: 'Turmeric 1 kg', attributes: {}, active: true, scope, version: 1 }],
      warehouses: [{ id: 'warehouse-pune', code: 'PUN', name: 'Pune distribution centre', stateCode: '27', stockLocationId: 'location-pune', active: true, scope, version: 1 }],
      reorderPolicies: [{ id: 'policy-turmeric', itemVariantId: 'variant-turmeric', warehouseId: 'warehouse-pune', minimumQuantity: 10, reorderPoint: 20, maximumQuantity: 100, safetyStock: 10, leadTimeDays: 5, active: true, scope, version: 1 }],
      reorderProposals: [{ id: 'reorder-turmeric', policyId: 'policy-turmeric', availableQuantity: 0, recommendedQuantity: 80, requiredBy: '2026-07-21', reason: 'Committed dispatches exceed available stock.', status: 'proposed', generatedAt: '2026-07-20T07:00:00.000Z', scope, version: 1 }],
      warehouseTasks: [{ id: 'warehouse-blocked', number: 'PCK-26-27-00001', type: 'pick', sourceId: 'reservation-1', itemVariantId: 'variant-turmeric', serialUnitIds: [], fromBinId: 'bin-pune-1', quantity: 10, priority: 'urgent', assignedTo: 'user-lee', dueAt: '2026-07-20T10:00:00.000Z', status: 'blocked', blockedReason: 'Pick bin is under cycle-count hold.', scope, version: 1 }],
      receivables: [
        receivable('receivable-overdue', 'overdue'),
        { ...receivable('receivable-dunning', 'overdue'), id: 'receivable-dunning' },
      ],
      dunningCases: [dunningCase],
      receivableDisputes: [{ id: 'dispute-tax-1', number: 'DSP-26-27-00001', receivableId: 'receivable-disputed', accountId: 'account-kestrel', category: 'tax', amount: 4_500, reason: 'GST place-of-supply evidence is under review.', evidenceReference: 'GST-REVIEW-001', ownerId: 'user-priya', status: 'under-review', openedBy: 'user-priya', openedAt: '2026-07-20T08:00:00.000Z', scope, version: 1 }],
      supportTickets: [{ id: 'support-critical-1', number: 'SUP-26-27-00001', agreementId: 'agreement-1', accountId: 'account-kestrel', title: 'Warehouse handhelds cannot scan dispatch labels', details: 'Dispatch station is unavailable.', channel: 'field', priority: 'critical', reportedBy: 'contact-kavya', reportedAt: '2026-07-20T06:00:00.000Z', responseDueAt: '2026-07-20T07:00:00.000Z', resolutionDueAt: '2026-07-20T10:00:00.000Z', status: 'in-progress', scope, version: 1 }],
    },
  };
}

describe('commerce exception queue', () => {
  it('returns no invented exception for a genuinely clean India workspace', () => {
    const kernel = createCleanKernelState();
    const party = createCleanPartyState();
    const revenue = createCleanRevenueOpsState();
    const source = {
      kernel: getKernelSnapshot(kernel, NOW),
      party: getPartySnapshot(party, NOW),
      revenue: getRevenueOpsSnapshot(revenue, {
        opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [],
      }, NOW),
    };
    const before = JSON.stringify(source);
    const queue = buildCommerceExceptionQueue(source);

    expect(queue.exceptions).toEqual([]);
    expect(queue.scopeChecks).toEqual({ kernelContextMatchesRevenue: true, revenueReadProjectionMatchesRevenue: true });
    expect(JSON.stringify(source)).toBe(before);
  });

  it('derives only evidenced fulfilment, inventory, collections, approval and SLA work in a deterministic order', () => {
    const source = withOperationalEvidence(snapshots());
    const before = JSON.stringify(source);
    const first = buildCommerceExceptionQueue({ ...source, now: NOW });
    const reversed = buildCommerceExceptionQueue({
      ...source,
      now: NOW,
      revenue: {
        ...source.revenue,
        fulfilmentTasks: [...source.revenue.fulfilmentTasks].reverse(),
        reorderProposals: [...source.revenue.reorderProposals].reverse(),
        warehouseTasks: [...source.revenue.warehouseTasks].reverse(),
        receivables: [...source.revenue.receivables].reverse(),
        dunningCases: [...source.revenue.dunningCases].reverse(),
        receivableDisputes: [...source.revenue.receivableDisputes].reverse(),
        supportTickets: [...source.revenue.supportTickets].reverse(),
      },
    });

    expect(first.exceptions.map(({ id }) => id)).toEqual(reversed.exceptions.map(({ id }) => id));
    expect(first.exceptions.map(({ category }) => category)).toEqual(expect.arrayContaining([
      'fulfilment', 'inventory', 'collections', 'approval', 'service',
    ]));
    expect(first.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'commerce-exception:fulfilment:blocked', severity: 'critical', destination: 'sales', businessReference: 'SO-26-27-blocked' }),
      expect.objectContaining({ id: 'commerce-exception:inventory:reorder:reorder-turmeric', severity: 'critical', destination: 'operations', businessReference: 'Turmeric 1 kg / Pune distribution centre' }),
      expect.objectContaining({ id: 'commerce-exception:collections:dunning:dunning', severity: 'critical', destination: 'finance', businessReference: 'DUN-26-27-dunning / Aranya Industrial Systems' }),
      expect.objectContaining({ id: 'commerce-exception:approval:approval-purchase-1', destination: 'command', businessReference: 'Finance approval for purchase orders' }),
      expect.objectContaining({ id: 'commerce-exception:service:support-critical-1', severity: 'critical', destination: 'service' }),
    ]));
    expect(first.exceptions.every((row) => row.scopeChecks.sourceRecordsMatchActiveScope)).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('excludes cross-company, cross-branch and legacy unscoped primary records', () => {
    const source = withOperationalEvidence(snapshots());
    const result = buildCommerceExceptionList({
      ...source,
      now: NOW,
      revenue: {
        ...source.revenue,
        fulfilmentTasks: [
          fulfilmentTask('other-fulfilment', 'blocked', otherScope),
          { ...fulfilmentTask('legacy-fulfilment', 'blocked'), scope: undefined },
          ...source.revenue.fulfilmentTasks,
        ],
        reorderProposals: [{ ...source.revenue.reorderProposals[0]!, id: 'other-reorder', scope: otherScope }, ...source.revenue.reorderProposals],
        warehouseTasks: [{ ...source.revenue.warehouseTasks[0]!, id: 'other-warehouse', scope: otherScope }, ...source.revenue.warehouseTasks],
        receivables: [receivable('other-receivable', 'overdue', otherScope), ...source.revenue.receivables],
        dunningCases: [{ ...source.revenue.dunningCases[0]!, id: 'other-dunning', scope: otherScope }, ...source.revenue.dunningCases],
        receivableDisputes: [{ ...source.revenue.receivableDisputes[0]!, id: 'other-dispute', scope: otherScope }, ...source.revenue.receivableDisputes],
        supportTickets: [{ ...source.revenue.supportTickets[0]!, id: 'other-support', scope: otherScope }, ...source.revenue.supportTickets],
      },
    });

    expect(result.flatMap((row) => row.sourceRecordIds)).not.toEqual(expect.arrayContaining([
      'other-fulfilment', 'legacy-fulfilment', 'other-reorder', 'other-warehouse', 'other-receivable', 'other-dunning', 'other-dispute', 'other-support',
    ]));
    expect(result.every((row) => row.scopeChecks.activeScope.companyId === scope.companyId && row.scopeChecks.activeScope.branchId === scope.branchId)).toBe(true);
  });

  it('fails closed when the kernel or governed read projection is outside the revenue scope', () => {
    const source = withOperationalEvidence(snapshots());
    const kernelMismatch = buildCommerceExceptionQueue({
      ...source,
      kernel: { ...source.kernel, context: { ...source.kernel.context, branchId: 'branch-other' } },
    });
    const projectionMismatch = buildCommerceExceptionQueue({
      ...source,
      revenue: { ...source.revenue, readProjection: { ...source.revenue.readProjection, companyId: 'company-other' } },
    });

    expect(kernelMismatch).toMatchObject({ exceptions: [], scopeChecks: { kernelContextMatchesRevenue: false } });
    expect(projectionMismatch).toMatchObject({ exceptions: [], scopeChecks: { revenueReadProjectionMatchesRevenue: false } });
  });
});
