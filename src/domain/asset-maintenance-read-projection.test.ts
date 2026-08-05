import { describe, expect, it } from 'vitest';
import type {
  AssetCategory,
  AssetRetirement,
  ManagedAsset,
  MaintenanceWorkOrder,
  PreventiveMaintenancePlan,
} from '../shared/assets-maintenance-contracts';
import { createAssetMaintenanceReadProjection } from './asset-maintenance-read-projection';
import { createInitialRevenueOpsState } from './revenue-ops';

function withoutScope<T extends object>(record: T): T {
  const legacy = { ...record } as T & { scope?: unknown };
  delete legacy.scope;
  return legacy as T;
}

function controlledState() {
  const state = createInitialRevenueOpsState();
  const scope = structuredClone(state.scope);
  const otherBranchScope = { ...scope, branchId: 'branch-other' };

  const category: AssetCategory = {
    id: 'category-current',
    code: 'PROD-EQP',
    name: 'Production equipment',
    description: 'Equipment identity and maintenance boundary.',
    defaultCriticality: 'critical',
    defaultMaintenanceIntervalDays: 30,
    active: true,
    createdBy: 'user-avery',
    createdAt: '2026-07-17T09:00:00.000Z',
    scope,
    version: 1,
  };
  const asset: ManagedAsset = {
    id: 'asset-current',
    number: 'AST-26-27-00001',
    assetTag: 'PUNE-MIX-001',
    categoryId: category.id,
    name: 'Primary mixing vessel',
    manufacturer: 'Epic Industrial',
    serialNumber: 'MX-500-260701',
    sourceType: 'procurement-evidence',
    sourceEvidenceReference: 'GRN-0001',
    acquiredOn: '2026-07-01',
    availableForUseOn: '2026-07-10',
    custodyLabel: 'Pune plant / mixing bay',
    criticality: 'critical',
    financialStatus: 'unbooked',
    status: 'in-service',
    createdBy: 'user-avery',
    createdAt: '2026-07-17T09:00:00.000Z',
    scope,
    version: 1,
  };
  const plan: PreventiveMaintenancePlan = {
    id: 'plan-current',
    number: 'MNT-26-27-00001',
    assetId: asset.id,
    name: 'Monthly safety and lubrication',
    intervalDays: 30,
    nextDueOn: '2026-07-31',
    estimatedMinutes: 90,
    checklist: [{ id: 'check-current', title: 'Inspect the pressure relief path', required: true }],
    status: 'active',
    createdBy: 'user-avery',
    createdAt: '2026-07-17T09:00:00.000Z',
    scope,
    version: 1,
  };
  const workOrder: MaintenanceWorkOrder = {
    id: 'work-order-current',
    number: 'MWO-26-27-00001',
    planId: plan.id,
    assetId: asset.id,
    dueOn: '2026-07-31',
    technicianUserId: 'user-lee',
    status: 'scheduled',
    checklist: [{ ...plan.checklist[0]!, completed: false }],
    generatedBy: 'user-avery',
    generatedAt: '2026-07-17T09:00:00.000Z',
    scope,
    version: 1,
  };
  const retirement: AssetRetirement = {
    id: 'retirement-current',
    number: 'RET-26-27-00001',
    assetId: asset.id,
    capitalizationId: 'capitalization-current',
    retirementDate: '2026-07-31',
    reason: 'Beyond economical repair after engineering condition assessment.',
    evidenceReference: 'SCRAP-2026-041',
    grossCost: 100000,
    accumulatedDepreciation: 20000,
    netBookValue: 80000,
    status: 'submitted',
    requestedBy: 'user-avery',
    requestedAt: '2026-07-17T09:00:00.000Z',
    scope,
    version: 1,
  };

  state.assetCategories = [
    category,
    { ...category, id: 'category-other-branch', code: 'OTHER-EQP', scope: otherBranchScope },
    withoutScope({ ...category, id: 'category-legacy', code: 'LEGACY-EQP' }),
  ];
  state.managedAssets = [
    asset,
    { ...asset, id: 'asset-other-branch', number: 'AST-OTHER', assetTag: 'OTHER-MIX-001', scope: otherBranchScope },
    withoutScope({ ...asset, id: 'asset-legacy', number: 'AST-LEGACY', assetTag: 'LEGACY-MIX-001' }),
  ];
  state.preventiveMaintenancePlans = [
    plan,
    { ...plan, id: 'plan-other-branch', number: 'MNT-OTHER', scope: otherBranchScope },
    withoutScope({ ...plan, id: 'plan-legacy', number: 'MNT-LEGACY' }),
  ];
  state.maintenanceWorkOrders = [
    workOrder,
    { ...workOrder, id: 'work-order-other-branch', number: 'MWO-OTHER', scope: otherBranchScope },
    withoutScope({ ...workOrder, id: 'work-order-legacy', number: 'MWO-LEGACY' }),
  ];
  state.assetRetirements = [
    retirement,
    { ...retirement, id: 'retirement-other-branch', number: 'RET-OTHER', scope: otherBranchScope },
    withoutScope({ ...retirement, id: 'retirement-legacy', number: 'RET-LEGACY' }),
  ];
  return state;
}

const allowed = () => ({ allowed: true, deniedFields: [] });

describe('asset and maintenance read projection', () => {
  it('filters every collection by exact company and branch, excluding legacy records without scope', () => {
    const projection = createAssetMaintenanceReadProjection(controlledState(), allowed);

    expect(projection.assetCategories.map(({ id }) => id)).toEqual(['category-current']);
    expect(projection.managedAssets.map(({ id }) => id)).toEqual(['asset-current']);
    expect(projection.preventiveMaintenancePlans.map(({ id }) => id)).toEqual(['plan-current']);
    expect(projection.maintenanceWorkOrders.map(({ id }) => id)).toEqual(['work-order-current']);
    expect(projection.assetRetirements.map(({ id }) => id)).toEqual(['retirement-current']);
  });

  it('hides a denied resource collection without suppressing independently permitted records', () => {
    const projection = createAssetMaintenanceReadProjection(controlledState(), (resource) => (
      resource === 'maintenance.work-order' ? { allowed: false, deniedFields: [] } : allowed()
    ));

    expect(projection.maintenanceWorkOrders).toEqual([]);
    expect(projection.hiddenCollections).toContain('maintenanceWorkOrders');
    expect(projection.managedAssets.map(({ id }) => id)).toEqual(['asset-current']);
    expect(projection.preventiveMaintenancePlans.map(({ id }) => id)).toEqual(['plan-current']);
  });

  it('hides retirement reasons and book values when the retirement resource is denied', () => {
    const projection = createAssetMaintenanceReadProjection(controlledState(), (resource) => (
      resource === 'finance.asset-retirement' ? { allowed: false, deniedFields: [] } : allowed()
    ));

    expect(projection.assetRetirements).toEqual([]);
    expect(projection.hiddenCollections).toContain('assetRetirements');
    expect(projection.managedAssets.map(({ id }) => id)).toEqual(['asset-current']);
  });

  it('physically removes denied asset identity fields without mutating the stored record', () => {
    const state = controlledState();
    const projection = createAssetMaintenanceReadProjection(state, (resource) => (
      resource === 'finance.asset-register'
        ? { allowed: true, deniedFields: ['serialNumber', 'sourceEvidenceReference', 'custodyLabel'] }
        : allowed()
    ));

    expect(projection.managedAssets[0]).not.toHaveProperty('serialNumber');
    expect(projection.managedAssets[0]).not.toHaveProperty('sourceEvidenceReference');
    expect(projection.managedAssets[0]).not.toHaveProperty('custodyLabel');
    expect(projection.redactedFields['finance.asset-register']).toEqual([
      'serialNumber',
      'sourceEvidenceReference',
      'custodyLabel',
    ]);
    expect(state.managedAssets[0]).toHaveProperty('serialNumber', 'MX-500-260701');
    expect(state.managedAssets[0]).toHaveProperty('sourceEvidenceReference', 'GRN-0001');
    expect(state.managedAssets[0]).toHaveProperty('custodyLabel', 'Pune plant / mixing bay');
  });
});
