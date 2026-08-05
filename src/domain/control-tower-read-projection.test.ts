import { describe, expect, it } from 'vitest';
import { createInitialCrmState, getDashboardSnapshot } from './crm';
import { buildGovernedControlTower, createControlTowerReadProjection, type ControlTowerRow } from './control-tower-read-projection';
import { createInitialKernelState, getKernelSnapshot } from './kernel';
import { createInitialPartyState } from './party';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from './revenue-ops';

const scope = { companyId: 'company-india-demo', branchId: 'branch-mumbai' };
const allowAll = () => ({ allowed: true, deniedFields: [] });
const CONTROL_TOWER_TEST_ROWS: readonly ControlTowerRow[] = [
  { id: 'test-lead-001', resource: 'crm.opportunity', area: 'CRM', title: 'Renewal at risk', detail: 'Customer decision due today', severity: 'critical', status: 'open', ownerWorkspace: 'crm', scope, dueAt: '2026-07-18' },
  { id: 'test-ar-001', resource: 'finance.receivable', area: 'Finance', title: 'Receivable needs follow-up', detail: 'Invoice INV-26-27-00001 / 18 days overdue', severity: 'attention', status: 'open', ownerWorkspace: 'finance', scope, amount: 100000, dueAt: '2026-07-18' },
  { id: 'test-stock-001', resource: 'inventory.reorder', area: 'Operations', title: 'Reorder threshold breached', detail: 'SKU-001 / 4 days of cover remaining', severity: 'attention', status: 'blocked', ownerWorkspace: 'operations', scope, dueAt: '2026-07-19' },
  { id: 'test-payroll-001', resource: 'people.payroll', area: 'People', title: 'Payroll approval pending', detail: 'Maker-checker decision required', severity: 'watch', status: 'in-progress', ownerWorkspace: 'people', scope, dueAt: '2026-07-20' },
  { id: 'test-sla-001', resource: 'service.sla', area: 'Service', title: 'SLA breach risk', detail: 'Service ticket needs an engineer assignment', severity: 'critical', status: 'open', ownerWorkspace: 'service', scope, dueAt: '2026-07-18' },
  { id: 'test-other-001', resource: 'finance.receivable', area: 'Finance', title: 'Other branch receivable', detail: 'Must stay out of the active branch', severity: 'clear', status: 'resolved', ownerWorkspace: 'finance', scope: { companyId: scope.companyId, branchId: 'branch-bengaluru' }, amount: 50000 },
];

function governedSnapshot() {
  const crm = createInitialCrmState();
  const party = createInitialPartyState();
  const kernel = createInitialKernelState();
  const revenue = getRevenueOpsSnapshot(createInitialRevenueOpsState(), {
    opportunities: crm.opportunities,
    accounts: party.accounts,
    contacts: party.contacts,
    addresses: party.addresses,
    activeUserIds: kernel.users.map(({ id }) => id),
  }, '2026-07-21T09:00:00.000Z');
  return {
    dashboard: getDashboardSnapshot(crm, '2026-07-21T09:00:00.000Z'),
    revenue,
    kernel: getKernelSnapshot(kernel, '2026-07-21T09:00:00.000Z'),
  };
}

describe('control tower read projection', () => {
  it('filters rows by exact company and branch', () => {
    const projection = createControlTowerReadProjection(CONTROL_TOWER_TEST_ROWS, scope, allowAll);
    expect(projection.rows).toHaveLength(5);
    expect(projection.rows.some(({ id }) => id === 'test-other-001')).toBe(false);
    expect(projection.hiddenRows).toBe(1);
  });

  it('hides denied resources and redacts denied fields without mutating source rows', () => {
    const projection = createControlTowerReadProjection(CONTROL_TOWER_TEST_ROWS, scope, (resource) => resource === 'finance.receivable' ? { allowed: true, deniedFields: ['amount'] } : allowAll());
    expect(projection.rows.find(({ id }) => id === 'test-ar-001')).not.toHaveProperty('amount');
    expect(projection.redactedFields['test-ar-001']).toEqual(['amount']);
    expect(CONTROL_TOWER_TEST_ROWS.find(({ id }) => id === 'test-ar-001')).toHaveProperty('amount', 100000);
  });

  it('fails closed when a resource is denied', () => {
    const projection = createControlTowerReadProjection(CONTROL_TOWER_TEST_ROWS, scope, (resource) => resource === 'service.sla' ? { allowed: false, deniedFields: [] } : allowAll());
    expect(projection.rows.some(({ id }) => id === 'test-sla-001')).toBe(false);
    expect(projection.hiddenRows).toBe(2);
  });

  it('builds a live, stable India queue from governed snapshots instead of static demo records', () => {
    const projection = buildGovernedControlTower(governedSnapshot());

    expect(projection.scope).toEqual({ companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' });
    expect(projection.rows.some(({ id }) => id === 'tower:crm.opportunity:opp-206')).toBe(true);
    expect(projection.rows.some(({ id }) => id === 'tower:crm.opportunity:opp-211')).toBe(true);
    expect(projection.rows.every(({ id }) => id.startsWith('tower:'))).toBe(true);
    expect(projection.rows.some(({ id }) => id === 'tower-ar-001')).toBe(false);
  });

  it('fails closed on scope mismatch and records protected sources without inventing zero rows', () => {
    const snapshot = governedSnapshot();
    const mismatch = buildGovernedControlTower({
      ...snapshot,
      revenue: { ...snapshot.revenue, scope: { companyId: 'company-other', branchId: 'branch-other' } },
    });
    expect(mismatch).toMatchObject({ rows: [], restrictedSources: ['scope-mismatch'] });

    const hiddenFinance = buildGovernedControlTower({
      ...snapshot,
      revenue: {
        ...snapshot.revenue,
        readProjection: {
          ...snapshot.revenue.readProjection,
          hiddenCollections: ['receivables', 'dunningCases'],
          redactedMetrics: ['outstandingReceivables'],
        },
      },
    });
    expect(hiddenFinance.rows.some(({ resource }) => resource.startsWith('finance.'))).toBe(false);
    expect(hiddenFinance.restrictedSources).toEqual(expect.arrayContaining(['receivables', 'dunningCases']));
  });

  it('keeps a permitted collection case actionable without leaking fields denied by its source projection', () => {
    const snapshot = governedSnapshot();
    const projection = buildGovernedControlTower({
      ...snapshot,
      revenue: {
        ...snapshot.revenue,
        dunningCases: [{
          id: 'dunning-protected', number: 'DUN-26-27-001', receivableId: 'ar-001', accountId: 'account-001',
          stage: 'credit-hold', status: 'open', daysOverdue: 31, actionableAmount: 125_000,
          ownerId: 'user-avery', nextActionAt: '2026-07-20T09:00:00.000Z', createdAt: '2026-07-01T09:00:00.000Z', updatedAt: '2026-07-20T09:00:00.000Z', version: 1,
        }],
        readProjection: {
          ...snapshot.revenue.readProjection,
          redactedFields: { 'finance.dunning': ['number', 'stage', 'daysOverdue', 'actionableAmount'] },
        },
      },
    });

    const row = projection.rows.find(({ id }) => id === 'tower:finance.dunning:dunning-protected');
    expect(row).toMatchObject({ detail: 'Collection case detail is protected.', severity: 'attention', status: 'open' });
    expect(row).not.toHaveProperty('amount');
    expect(projection.redactedFields[row?.id ?? '']).toEqual(expect.arrayContaining(['number', 'stage', 'daysOverdue', 'amount']));
  });
});
