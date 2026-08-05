import { describe, expect, it } from 'vitest';
import type { AssetMaintenanceState } from '../shared/assets-maintenance-contracts';
import {
  completeMaintenanceWorkOrder,
  createAssetCapitalization,
  createAssetDepreciationPolicy,
  createAssetDepreciationRun,
  createAssetRetirement,
  createAssetCustodyTransfer,
  createAssetComponentization,
  createAssetComponentAllocation,
  createAssetTransferAccounting,
  createAssetCategory,
  createManagedAsset,
  createPreventiveMaintenancePlan,
  decideManagedAsset,
  decideAssetCapitalization,
  decideAssetDepreciationPolicy,
  decideAssetDepreciationRun,
  decideAssetRetirement,
  decideAssetCustodyTransfer,
  decideAssetComponentization,
  decideAssetComponentAllocation,
  decideAssetTransferAccounting,
  dispatchAssetTransferAccounting,
  receiveAssetTransferAccounting,
  completeAssetRetirement,
  createAssetSaleDisposal,
  decideAssetSaleDisposal,
  completeAssetSaleDisposal,
  createAssetImpairmentReview,
  decideAssetImpairmentReview,
  createAssetRevaluation,
  decideAssetRevaluation,
  createAssetWarranty,
  updateAssetWarrantyStatus,
  createAssetAmcContract,
  decideAssetAmcContract,
  updateAssetAmcStatus,
  createAssetMeter,
  recordAssetMeterReading,
  transitionCorrectiveMaintenance,
  createAssetCalibration,
  decideAssetCalibration,
  createAssetSparePart,
  issueAssetSpare,
  createFleetVehicle,
  createFleetTrip,
  completeFleetTrip,
  generateDueMaintenanceWorkOrder,
  startMaintenanceWorkOrder,
  submitManagedAsset,
  receiveAssetCustodyTransfer,
  verifyMaintenanceWorkOrder,
} from './assets-maintenance';

const T0 = '2026-07-15T08:00:00.000Z';
function foundation(): AssetMaintenanceState {
  const scope = {
    companyId: 'company-northstar-us',
    branchId: 'branch-northstar-hq',
  };
  return {
    revision: 1,
    scope,
    assetCategories: [],
    managedAssets: [],
    assetCapitalizations: [],
    assetDepreciationPolicies: [],
    assetDepreciationRuns: [],
    assetRetirements: [],
    assetCustodyTransfers: [],
    assetComponentizations: [],
    assetComponentAllocations: [],
    assetTransferAccountings: [],
    assetSaleDisposals: [],
    assetImpairmentReviews: [],
    assetRevaluations: [],
    assetWarranties: [],
    assetAmcContracts: [],
    assetMeters: [],
    assetMeterReadings: [],
    correctiveMaintenanceRequests: [],
    assetCalibrations: [],
    assetSpareParts: [],
    assetSpareIssues: [],
    fleetVehicles: [],
    fleetTrips: [],
    assetInstalledBaseEvents: [],
    supplierInvoices: [],
    threeWayMatches: [],
    purchaseOrders: [],
    goodsReceipts: [],
    journalDrafts: [],
    preventiveMaintenancePlans: [],
    maintenanceWorkOrders: [],
    warehouses: [{ id: 'warehouse-plant', active: true, scope }, { id: 'warehouse-quality', active: true, scope }],
    workCenters: [{ id: 'work-center-mix', active: true, scope }],
  };
}

function inServiceAsset(): AssetMaintenanceState {
  let state = foundation();
  state = createAssetCategory(state, {
    code: 'PRODUCTION-EQUIPMENT',
    name: 'Production equipment',
    description: 'Serviceable plant and equipment requiring controlled preventive maintenance.',
    defaultCriticality: 'critical',
    defaultMaintenanceIntervalDays: 30,
  }, 'user-avery', 'category-equipment', T0);
  state = createManagedAsset(state, {
    assetTag: 'MIX-001',
    categoryId: 'category-equipment',
    name: 'Primary mixing vessel',
    manufacturer: 'Epic Industrial',
    model: 'MX-500',
    serialNumber: 'MX500-260701',
    sourceType: 'procurement-evidence',
    sourceEvidenceReference: 'ATTACHMENT-GRN-0001',
    acquiredOn: '2026-07-01',
    availableForUseOn: '2026-07-10',
    warrantyExpiresOn: '2027-07-10',
    warehouseId: 'warehouse-plant',
    workCenterId: 'work-center-mix',
    custodyLabel: 'Pune plant mixing bay',
  }, 'user-avery', 'asset-mix-001', T0);
  state = submitManagedAsset(state, { id: 'asset-mix-001', expectedVersion: 1 }, 'user-avery', T0);
  return decideManagedAsset(state, {
    id: 'asset-mix-001',
    decision: 'in-service',
    remarks: 'Identity, physical custody, source evidence and warranty were independently checked.',
    expectedVersion: 2,
  }, 'user-priya', T0);
}

function plannedAsset(): AssetMaintenanceState {
  let state = inServiceAsset();
  state = createPreventiveMaintenancePlan(state, {
    assetId: 'asset-mix-001',
    name: 'Monthly vessel safety and lubrication',
    intervalDays: 30,
    nextDueOn: '2026-07-31',
    estimatedMinutes: 90,
    checklist: [
      { title: 'Inspect vessel seal and pressure relief path', required: true },
      { title: 'Lubricate drive assembly', required: true },
      { title: 'Clean exterior guard and capture condition note', required: false },
    ],
  }, 'user-avery', 'plan-mix-monthly', T0);
  return state;
}

function capitalizableAsset(): AssetMaintenanceState {
  const state = inServiceAsset();
  const scope = state.scope;
  return {
    ...state,
    purchaseOrders: [{ id: 'po-1', number: 'PO-26-27-00001', supplierId: 'supplier-1', warehouseId: 'warehouse-plant', deliveryBy: '2026-07-01', paymentTermDays: 30, status: 'received', lines: [{ id: 'po-line-1', itemVariantId: 'item-1', description: 'Primary mixing vessel', quantity: 1, unitPrice: 100000, gstRate: 18, taxableValue: 100000, taxAmount: 18000, totalAmount: 118000, receivedQuantity: 1, invoicedQuantity: 1 }], taxableValue: 100000, taxAmount: 18000, totalAmount: 118000, createdBy: 'user-avery', createdAt: T0, scope, version: 1 }],
    goodsReceipts: [{ id: 'grn-1', number: 'GRN-26-27-00001', purchaseOrderId: 'po-1', supplierId: 'supplier-1', warehouseId: 'warehouse-plant', receivingBinId: 'bin-1', receivedAt: '2026-07-01', lines: [{ id: 'grn-line-1', purchaseOrderLineId: 'po-line-1', itemVariantId: 'item-1', quantity: 1, unitPrice: 100000, inventoryReference: 'INV-1', serialNumbers: [] }], status: 'received', receivedBy: 'user-avery', receivedAtRecorded: T0, scope, version: 1 }],
    supplierInvoices: [{ id: 'supplier-invoice-1', number: 'PIN-26-27-00001', supplierId: 'supplier-1', purchaseOrderId: 'po-1', goodsReceiptId: 'grn-1', supplierInvoiceNumber: 'VENDOR-001', invoiceDate: '2026-07-10', lines: [{ purchaseOrderLineId: 'po-line-1', quantity: 1, unitPrice: 100000, gstRate: 18, totalAmount: 118000 }], totalAmount: 118000, recordedBy: 'user-avery', recordedAt: T0, scope, version: 1 }],
    threeWayMatches: [{ id: 'three-way-1', number: '3WM-26-27-00001', purchaseOrderId: 'po-1', goodsReceiptId: 'grn-1', supplierInvoiceId: 'supplier-invoice-1', quantityVariance: 0, priceVariance: 0, status: 'matched', tolerancePercent: 1, createdBy: 'user-avery', createdAt: T0, scope, version: 1 }],
  };
}

describe('installed asset and preventive maintenance domain', () => {
  it('keeps an asset unbooked until a later finance slice, and requires an independent in-service decision', () => {
    let state = foundation();
    state = createAssetCategory(state, {
      code: 'PRODUCTION-EQUIPMENT',
      name: 'Production equipment',
      defaultCriticality: 'critical',
      defaultMaintenanceIntervalDays: 30,
    }, 'user-avery', 'category-equipment', T0);
    state = createManagedAsset(state, {
      assetTag: 'MIX-001',
      categoryId: 'category-equipment',
      name: 'Primary mixing vessel',
      serialNumber: 'MX500-260701',
      sourceType: 'procurement-evidence',
      sourceEvidenceReference: 'ATTACHMENT-GRN-0001',
      acquiredOn: '2026-07-01',
      availableForUseOn: '2026-07-10',
      warehouseId: 'warehouse-plant',
      workCenterId: 'work-center-mix',
      custodyLabel: 'Pune plant mixing bay',
    }, 'user-avery', 'asset-mix-001', T0);

    expect(state.managedAssets[0]).toMatchObject({
      number: 'AST-26-27-00001',
      status: 'draft',
      financialStatus: 'unbooked',
      criticality: 'critical',
      scope: state.scope,
    });
    state = submitManagedAsset(state, { id: 'asset-mix-001', expectedVersion: 1 }, 'user-avery', T0);
    expect(() => decideManagedAsset(state, {
      id: 'asset-mix-001',
      decision: 'in-service',
      remarks: 'The maker must not activate their own controlled physical asset record.',
      expectedVersion: 2,
    }, 'user-avery', T0)).toThrow('maker cannot decide');

    state = decideManagedAsset(state, {
      id: 'asset-mix-001',
      decision: 'in-service',
      remarks: 'Identity, source evidence, physical custody and warranty independently checked.',
      expectedVersion: 2,
    }, 'user-priya', T0);
    expect(state.managedAssets[0]).toMatchObject({
      status: 'in-service',
      decidedBy: 'user-priya',
      financialStatus: 'unbooked',
    });
  });

  it('rejects duplicate identity, invalid dates, and locations outside the exact operating scope', () => {
    let state = foundation();
    state = createAssetCategory(state, {
      code: 'PRODUCTION-EQUIPMENT',
      name: 'Production equipment',
      defaultCriticality: 'high',
    }, 'user-avery', 'category-equipment', T0);
    const wrongScope = {
      ...state,
      warehouses: [{
        id: 'warehouse-wrong',
        active: true,
        scope: { companyId: 'company-other', branchId: 'branch-other' },
      }],
    };
    expect(() => createManagedAsset(wrongScope, {
      assetTag: 'MIX-001',
      categoryId: 'category-equipment',
      name: 'Primary mixing vessel',
      sourceType: 'manual-evidence',
      sourceEvidenceReference: 'OPENING-REGISTER-001',
      acquiredOn: '2026-07-11',
      availableForUseOn: '2026-07-10',
      warehouseId: 'warehouse-wrong',
      custodyLabel: 'Other plant',
    }, 'user-avery', 'asset-wrong', T0)).toThrow('Available-for-use date');

    state = createManagedAsset(state, {
      assetTag: 'MIX-001',
      categoryId: 'category-equipment',
      name: 'Primary mixing vessel',
      serialNumber: 'MX500-260701',
      sourceType: 'manual-evidence',
      sourceEvidenceReference: 'OPENING-REGISTER-001',
      acquiredOn: '2026-07-01',
      availableForUseOn: '2026-07-10',
      custodyLabel: 'Pune plant mixing bay',
    }, 'user-avery', 'asset-mix-001', T0);
    expect(() => createManagedAsset(state, {
      assetTag: 'MIX-001',
      categoryId: 'category-equipment',
      name: 'Duplicate tag',
      serialNumber: 'OTHER-260701',
      sourceType: 'manual-evidence',
      sourceEvidenceReference: 'OPENING-REGISTER-002',
      acquiredOn: '2026-07-01',
      availableForUseOn: '2026-07-10',
      custodyLabel: 'Pune plant mixing bay',
    }, 'user-avery', 'asset-duplicate-tag', T0)).toThrow('Asset tag already exists');
    expect(() => createManagedAsset(state, {
      assetTag: 'MIX-002',
      categoryId: 'category-equipment',
      name: 'Duplicate serial',
      serialNumber: 'MX500-260701',
      sourceType: 'manual-evidence',
      sourceEvidenceReference: 'OPENING-REGISTER-003',
      acquiredOn: '2026-07-01',
      availableForUseOn: '2026-07-10',
      custodyLabel: 'Pune plant mixing bay',
    }, 'user-avery', 'asset-duplicate-serial', T0)).toThrow('serial number already exists');

    const outOfScopeLocation = {
      ...state,
      warehouses: [{
        id: 'warehouse-wrong',
        active: true,
        scope: { companyId: 'company-other', branchId: 'branch-other' },
      }],
    };
    expect(() => createManagedAsset(outOfScopeLocation, {
      assetTag: 'MIX-003',
      categoryId: 'category-equipment',
      name: 'Out-of-scope asset',
      sourceType: 'manual-evidence',
      sourceEvidenceReference: 'OPENING-REGISTER-004',
      acquiredOn: '2026-07-01',
      availableForUseOn: '2026-07-10',
      warehouseId: 'warehouse-wrong',
      custodyLabel: 'Other plant',
    }, 'user-avery', 'asset-out-of-scope', T0)).toThrow('current company and branch');
  });

  it('requires independent release and destination receipt before changing an in-service asset custody', () => {
    let state = inServiceAsset();
    state = createAssetCustodyTransfer(state, {
      assetId: 'asset-mix-001',
      transferDate: '2026-07-16',
      reason: 'Move the verified vessel to the quality staging bay for the next controlled production run.',
      destinationWarehouseId: 'warehouse-quality',
      destinationCustodyLabel: 'Pune quality staging bay',
    }, 'user-avery', 'transfer-mix-1', T0);
    expect(state.assetCustodyTransfers[0]).toMatchObject({
      number: 'ATF-26-27-00001',
      status: 'submitted',
      sourceWarehouseId: 'warehouse-plant',
      destinationWarehouseId: 'warehouse-quality',
      sourceAssetVersion: 3,
    });
    expect(() => decideAssetCustodyTransfer(state, {
      id: 'transfer-mix-1', decision: 'approved', remarks: 'Maker cannot independently release their own custody transfer.', expectedVersion: 1,
    }, 'user-avery', T0)).toThrow('maker cannot decide');
    state = decideAssetCustodyTransfer(state, {
      id: 'transfer-mix-1', decision: 'approved', remarks: 'Source location, no open maintenance work, destination and reason independently verified.', expectedVersion: 1,
    }, 'user-priya', T0);
    expect(state.managedAssets[0]?.custodyLabel).toBe('Pune plant mixing bay');
    expect(() => receiveAssetCustodyTransfer(state, {
      id: 'transfer-mix-1', receiptRemarks: 'Maker must not confirm their own destination receipt.', expectedVersion: 2,
    }, 'user-avery', T0)).toThrow('maker and approver cannot receive');
    expect(() => receiveAssetCustodyTransfer(state, {
      id: 'transfer-mix-1', receiptRemarks: 'Approver must not confirm the destination receipt.', expectedVersion: 2,
    }, 'user-priya', T0)).toThrow('maker and approver cannot receive');
    state = receiveAssetCustodyTransfer(state, {
      id: 'transfer-mix-1', receiptRemarks: 'Asset tag, serial number and destination custody were physically received and verified.', expectedVersion: 2,
    }, 'user-lee', T0);
    expect(state.assetCustodyTransfers[0]).toMatchObject({ status: 'received', receivedBy: 'user-lee' });
    expect(state.managedAssets[0]).toMatchObject({
      warehouseId: 'warehouse-quality',
      workCenterId: 'work-center-mix',
      custodyLabel: 'Pune quality staging bay',
      status: 'in-service',
      version: 4,
    });
  });

  it('creates a physical component passport without changing the parent asset book boundary', () => {
    let state = inServiceAsset();
    state = createAssetComponentization(state, {
      assetId: 'asset-mix-001',
      effectiveOn: '2026-07-16',
      reason: 'Record replaceable assemblies before the next service cycle.',
      evidenceReference: 'ATTACHMENT-COMPONENT-001',
      components: [
        { componentTag: 'DRIVE-01', name: 'Drive assembly', serialNumber: 'DRV-001', criticality: 'high' },
        { componentTag: 'SEAL-01', name: 'Vessel seal', serialNumber: 'SEAL-001', criticality: 'critical' },
      ],
    }, 'user-avery', 'componentization-mix-1', T0);

    expect(state.assetComponentizations[0]).toMatchObject({
      number: 'CMP-26-27-00001',
      status: 'submitted',
      sourceAssetVersion: 3,
      components: [{ componentTag: 'DRIVE-01' }, { componentTag: 'SEAL-01' }],
    });
    expect(state.managedAssets[0]).toMatchObject({ version: 3, financialStatus: 'unbooked' });
    expect(() => decideAssetComponentization(state, {
      id: 'componentization-mix-1', decision: 'approved', remarks: 'Maker cannot approve their own passport.', expectedVersion: 1,
    }, 'user-avery', T0)).toThrow('maker cannot decide');

    state = decideAssetComponentization(state, {
      id: 'componentization-mix-1', decision: 'approved', remarks: 'Physical identity and serial evidence independently checked.', expectedVersion: 1,
    }, 'user-priya', T0);
    expect(state.assetComponentizations[0]).toMatchObject({ status: 'approved', decidedBy: 'user-priya' });
    expect(state.managedAssets[0]).toMatchObject({ version: 3, financialStatus: 'unbooked' });
  });

  it('allocates the posted parent cost exactly once and drives component-aware depreciation', () => {
    let state = capitalizableAsset();
    state = createAssetComponentization(state, {
      assetId: 'asset-mix-001', effectiveOn: '2026-07-16', reason: 'Allocate serviceable assemblies after passport approval.', evidenceReference: 'ATTACHMENT-COMP-002',
      components: [
        { componentTag: 'DRIVE-01', name: 'Drive assembly', criticality: 'high' },
        { componentTag: 'SEAL-01', name: 'Vessel seal', criticality: 'critical' },
      ],
    }, 'user-avery', 'componentization-allocation-1', T0);
    state = decideAssetComponentization(state, { id: 'componentization-allocation-1', decision: 'approved', remarks: 'Physical component evidence independently checked.', expectedVersion: 1 }, 'user-priya', T0);
    state = createAssetCapitalization(state, { assetId: 'asset-mix-001', supplierInvoiceId: 'supplier-invoice-1', capitalizationDate: '2026-07-10', taxableAmount: 75000 }, 'user-avery', 'capitalization-allocation-1', T0);
    state = decideAssetCapitalization(state, { id: 'capitalization-allocation-1', decision: 'approved', remarks: 'Parent cost and procurement evidence independently checked.', expectedVersion: 1 }, 'user-priya', T0);
    state = createAssetComponentAllocation(state, {
      assetId: 'asset-mix-001', componentizationId: 'componentization-allocation-1', capitalizationId: 'capitalization-allocation-1',
      lines: [
        { componentId: state.assetComponentizations[0]!.components[0]!.id, allocationPercent: 60, usefulLifeMonths: 3, residualValuePercent: 10 },
        { componentId: state.assetComponentizations[0]!.components[1]!.id, allocationPercent: 40, usefulLifeMonths: 6, residualValuePercent: 0 },
      ],
    }, 'user-avery', 'allocation-1', T0);
    expect(state.assetComponentAllocations[0]).toMatchObject({ number: 'ALC-26-27-00001', parentCost: 75000, allocatedCost: 75000, status: 'submitted' });
    expect(() => decideAssetComponentAllocation(state, { id: 'allocation-1', decision: 'approved', remarks: 'Maker cannot approve their own cost allocation.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker cannot decide');
    state = decideAssetComponentAllocation(state, { id: 'allocation-1', decision: 'approved', remarks: 'Allocation reconciles exactly to the posted parent cost.', expectedVersion: 1 }, 'user-priya', T0);
    state = createAssetDepreciationPolicy(state, { categoryId: 'category-equipment', effectiveFrom: '2026-07-01', usefulLifeMonths: 12, residualValuePercent: 0 }, 'user-avery', 'policy-allocation-1', T0);
    state = decideAssetDepreciationPolicy(state, { id: 'policy-allocation-1', decision: 'approved', remarks: 'Fallback category policy approved for component schedules.', expectedVersion: 1 }, 'user-priya', T0);
    state = createAssetDepreciationRun(state, { periodEnd: '2026-07-31' }, 'user-avery', (draft) => draft.sourceType === 'asset-capitalization', 'run-allocation-1', T0);
    expect(state.assetDepreciationRuns[0]?.lines).toHaveLength(2);
    expect(state.assetDepreciationRuns[0]?.lines.map((line) => line.componentTag)).toEqual(['DRIVE-01', 'SEAL-01']);
    expect(state.assetDepreciationRuns[0]?.totalDepreciation).toBe(18500);
  });

  it('freezes source book value and requires independent approval, dispatch, and destination receipt', () => {
    let state = capitalizableAsset();
    state = createAssetCapitalization(state, { assetId: 'asset-mix-001', supplierInvoiceId: 'supplier-invoice-1', capitalizationDate: '2026-07-10', taxableAmount: 75000 }, 'user-avery', 'capitalization-transfer-1', T0);
    state = decideAssetCapitalization(state, { id: 'capitalization-transfer-1', decision: 'approved', remarks: 'Parent asset evidence independently checked.', expectedVersion: 1 }, 'user-priya', T0);
    const book = { capitalizationId: 'capitalization-transfer-1', grossCost: 75000, accumulatedDepreciation: 15000, netBookValue: 60000, asOfDate: '2026-07-31' };
    state = createAssetTransferAccounting(state, { assetId: 'asset-mix-001', transferDate: '2026-08-01', reason: 'Move the verified equipment to the Mumbai operating branch.', evidenceReference: 'TRANSFER-AUTH-001', destinationCompanyId: 'company-northstar-us', destinationBranchId: 'branch-mumbai', destinationCustodyLabel: 'Mumbai service bay' }, 'user-avery', () => book, 'transfer-accounting-1', T0);
    expect(state.assetTransferAccountings[0]).toMatchObject({ number: 'TRF-26-27-00001', status: 'submitted', grossCost: 75000, netBookValue: 60000 });
    expect(() => decideAssetTransferAccounting(state, { id: 'transfer-accounting-1', decision: 'approved', remarks: 'Maker cannot approve.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker cannot decide');
    state = decideAssetTransferAccounting(state, { id: 'transfer-accounting-1', decision: 'approved', remarks: 'Destination legal entity, source book and evidence independently checked.', expectedVersion: 1 }, 'user-priya', T0);
    expect(state.journalDrafts[0]).toMatchObject({ sourceType: 'asset-transfer', totalDebit: 75000, totalCredit: 75000, status: 'ready' });
    state = dispatchAssetTransferAccounting(state, { id: 'transfer-accounting-1', expectedVersion: 2 }, 'user-lee', T0);
    expect(() => receiveAssetTransferAccounting(state, { id: 'transfer-accounting-1', receiptRemarks: 'Same person cannot receive.', expectedVersion: 3 }, 'user-lee', T0)).toThrow('fourth-party');
    state = receiveAssetTransferAccounting(state, { id: 'transfer-accounting-1', receiptRemarks: 'Destination identity and custody independently received.', expectedVersion: 3 }, 'user-sana', T0);
    expect(state.assetTransferAccountings[0]).toMatchObject({ status: 'received', receivedBy: 'user-sana' });
    expect(state.managedAssets[0]).toMatchObject({ status: 'in-service', version: 3 });
  });

  it('runs a due preventive work order through technician evidence and independent verification', () => {
    let state = plannedAsset();
    expect(state.preventiveMaintenancePlans[0]).toMatchObject({
      number: 'MNT-26-27-00001',
      status: 'active',
      nextDueOn: '2026-07-31',
      scope: state.scope,
    });
    expect(() => generateDueMaintenanceWorkOrder(state, {
      planId: 'plan-mix-monthly',
      asOfDate: '2026-07-30',
      technicianUserId: 'user-lee',
      expectedVersion: 1,
    }, 'user-avery', 'work-order-early', T0)).toThrow('not due yet');

    state = generateDueMaintenanceWorkOrder(state, {
      planId: 'plan-mix-monthly',
      asOfDate: '2026-07-31',
      technicianUserId: 'user-lee',
      expectedVersion: 1,
    }, 'user-avery', 'work-order-mix-1', T0);
    expect(state.maintenanceWorkOrders[0]).toMatchObject({
      number: 'MWO-26-27-00001',
      status: 'scheduled',
      dueOn: '2026-07-31',
      technicianUserId: 'user-lee',
      scope: state.scope,
    });
    expect(() => generateDueMaintenanceWorkOrder(state, {
      planId: 'plan-mix-monthly',
      asOfDate: '2026-07-31',
      technicianUserId: 'user-lee',
      expectedVersion: 2,
    }, 'user-priya', 'work-order-duplicate', T0)).toThrow('already exists');

    expect(() => startMaintenanceWorkOrder(state, { id: 'work-order-mix-1', expectedVersion: 1 }, 'user-priya', T0)).toThrow('assigned maintenance technician');
    state = startMaintenanceWorkOrder(state, { id: 'work-order-mix-1', expectedVersion: 1 }, 'user-lee', T0);
    const requiredChecklistIds = state.maintenanceWorkOrders[0]!.checklist
      .filter(({ required }) => required)
      .map(({ id }) => id);
    expect(() => completeMaintenanceWorkOrder(state, {
      id: 'work-order-mix-1',
      completedChecklistItemIds: requiredChecklistIds.slice(0, 1),
      serviceReport: 'Inspected the vessel seal, checked the relief route and lubricated the drive assembly.',
      completionEvidenceReference: 'ATTACHMENT-MWO-260731',
      expectedVersion: 2,
    }, 'user-lee', T0)).toThrow('Every required');
    state = completeMaintenanceWorkOrder(state, {
      id: 'work-order-mix-1',
      completedChecklistItemIds: requiredChecklistIds,
      serviceReport: 'Inspected the vessel seal, checked the relief route and lubricated the drive assembly.',
      completionEvidenceReference: 'ATTACHMENT-MWO-260731',
      expectedVersion: 2,
    }, 'user-lee', T0);
    expect(() => verifyMaintenanceWorkOrder(state, {
      id: 'work-order-mix-1',
      decision: 'verified',
      remarks: 'Technician must not verify their own work.',
      expectedVersion: 3,
    }, 'user-lee', T0)).toThrow('maker or technician');
    expect(() => verifyMaintenanceWorkOrder(state, {
      id: 'work-order-mix-1',
      decision: 'verified',
      remarks: 'The planner must not verify the work order they generated.',
      expectedVersion: 3,
    }, 'user-avery', T0)).toThrow('maker or technician');
    state = verifyMaintenanceWorkOrder(state, {
      id: 'work-order-mix-1',
      decision: 'verified',
      remarks: 'Checklist, source evidence and condition report independently accepted.',
      expectedVersion: 3,
    }, 'user-priya', T0);
    expect(state.maintenanceWorkOrders[0]).toMatchObject({
      status: 'verified',
      verifiedBy: 'user-priya',
      completionEvidenceReference: 'ATTACHMENT-MWO-260731',
    });
    expect(state.preventiveMaintenancePlans[0]).toMatchObject({
      nextDueOn: '2026-08-30',
      lastWorkOrderId: 'work-order-mix-1',
      lastVerifiedAt: T0,
    });
  });

  it('can reopen inadequate evidence without advancing the preventive schedule', () => {
    let state = plannedAsset();
    state = generateDueMaintenanceWorkOrder(state, {
      planId: 'plan-mix-monthly',
      asOfDate: '2026-07-31',
      technicianUserId: 'user-lee',
      expectedVersion: 1,
    }, 'user-avery', 'work-order-mix-1', T0);
    state = startMaintenanceWorkOrder(state, { id: 'work-order-mix-1', expectedVersion: 1 }, 'user-lee', T0);
    state = completeMaintenanceWorkOrder(state, {
      id: 'work-order-mix-1',
      completedChecklistItemIds: state.maintenanceWorkOrders[0]!.checklist.map(({ id }) => id),
      serviceReport: 'Completed every scheduled inspection and lubrication step on the controlled equipment.',
      completionEvidenceReference: 'ATTACHMENT-MWO-260731',
      expectedVersion: 2,
    }, 'user-lee', T0);
    state = verifyMaintenanceWorkOrder(state, {
      id: 'work-order-mix-1',
      decision: 'reopened',
      remarks: 'Condition evidence does not show the relief-path inspection clearly enough.',
      expectedVersion: 3,
    }, 'user-priya', T0);
    expect(state.maintenanceWorkOrders[0]).toMatchObject({
      status: 'in-progress',
      reopenedBy: 'user-priya',
    });
    expect(state.preventiveMaintenancePlans[0]?.nextDueOn).toBe('2026-07-31');
  });

  it('reserves approved procurement taxable cost and creates a balanced immutable capitalisation handoff', () => {
    let state = capitalizableAsset();
    state = createAssetCapitalization(state, {
      assetId: 'asset-mix-001', supplierInvoiceId: 'supplier-invoice-1', capitalizationDate: '2026-07-10', taxableAmount: 75000,
    }, 'user-avery', 'capitalization-1', T0);
    expect(state.assetCapitalizations[0]).toMatchObject({ number: 'CAP-26-27-00001', status: 'submitted', taxableAmount: 75000, requestedBy: 'user-avery' });
    expect(() => decideAssetCapitalization(state, { id: 'capitalization-1', decision: 'approved', remarks: 'Maker must not approve their own asset capitalisation.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker cannot decide');
    state = decideAssetCapitalization(state, { id: 'capitalization-1', decision: 'approved', remarks: 'Asset is in service; procurement chain and taxable cost independently verified.', expectedVersion: 1 }, 'user-priya', T0);
    const handoff = state.journalDrafts[0]!;
    expect(state.assetCapitalizations[0]).toMatchObject({ status: 'approved', decidedBy: 'user-priya', journalDraftId: handoff.id });
    expect(handoff).toMatchObject({ sourceType: 'asset-capitalization', sourceId: 'capitalization-1', sourceNumber: 'CAP-26-27-00001', totalDebit: 75000, totalCredit: 75000, status: 'ready' });
    expect(handoff.lines).toEqual([
      { accountCode: 'fixed-assets', debit: 75000, credit: 0, memo: 'CAP-26-27-00001' },
      { accountCode: 'inventory-asset', debit: 0, credit: 75000, memo: 'CAP-26-27-00001' },
    ]);
    expect(handoff.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('prevents double allocation and capitalisation before the asset is available for use', () => {
    const state = capitalizableAsset();
    expect(() => createAssetCapitalization(state, {
      assetId: 'asset-mix-001', supplierInvoiceId: 'supplier-invoice-1', capitalizationDate: '2026-07-09', taxableAmount: 100,
    }, 'user-avery', 'capitalization-early', T0)).toThrow('cannot precede');
    const reserved = createAssetCapitalization(state, {
      assetId: 'asset-mix-001', supplierInvoiceId: 'supplier-invoice-1', capitalizationDate: '2026-07-10', taxableAmount: 100000,
    }, 'user-avery', 'capitalization-1', T0);
    expect(() => createAssetCapitalization(reserved, {
      assetId: 'asset-mix-001', supplierInvoiceId: 'supplier-invoice-1', capitalizationDate: '2026-07-10', taxableAmount: 1,
    }, 'user-priya', 'capitalization-2', T0)).toThrow('already has an active');
  });

  it('creates a residual-aware monthly depreciation handoff only from posted capitalisation evidence', () => {
    let state = capitalizableAsset();
    state = createAssetCapitalization(state, {
      assetId: 'asset-mix-001', supplierInvoiceId: 'supplier-invoice-1', capitalizationDate: '2026-07-10', taxableAmount: 75000,
    }, 'user-avery', 'capitalization-1', T0);
    state = decideAssetCapitalization(state, {
      id: 'capitalization-1', decision: 'approved', remarks: 'Asset and procurement evidence independently verified before capitalisation.', expectedVersion: 1,
    }, 'user-priya', T0);
    state = createAssetDepreciationPolicy(state, {
      categoryId: 'category-equipment', effectiveFrom: '2026-07-01', usefulLifeMonths: 3, residualValuePercent: 10,
    }, 'user-avery', 'policy-1', T0);
    expect(() => decideAssetDepreciationPolicy(state, {
      id: 'policy-1', decision: 'approved', remarks: 'Maker cannot approve the useful-life assumption they submitted.', expectedVersion: 1,
    }, 'user-avery', T0)).toThrow('maker cannot decide');
    state = decideAssetDepreciationPolicy(state, {
      id: 'policy-1', decision: 'approved', remarks: 'Useful life, residual value, category and effective date independently verified.', expectedVersion: 1,
    }, 'user-priya', T0);

    expect(() => createAssetDepreciationRun(state, { periodEnd: '2026-07-31' }, 'user-avery', () => false, 'run-unposted', T0)).toThrow('No posted asset capitalisation');
    state = createAssetDepreciationRun(state, { periodEnd: '2026-07-31' }, 'user-avery', (draft) => draft.sourceType === 'asset-capitalization', 'run-1', T0);
    expect(state.assetDepreciationRuns[0]).toMatchObject({
      number: 'DEP-26-27-00001', status: 'submitted', periodStart: '2026-07-01', periodEnd: '2026-07-31', totalDepreciation: 22500,
    });
    expect(state.assetDepreciationRuns[0]?.lines[0]).toMatchObject({
      assetCapitalizationId: 'capitalization-1', policyId: 'policy-1', serviceMonthIndex: 1, capitalizedCost: 75000, residualValue: 7500, depreciationAmount: 22500,
    });
    expect(() => decideAssetDepreciationRun(state, {
      id: 'run-1', decision: 'approved', remarks: 'Maker cannot approve the monthly schedule they generated.', expectedVersion: 1,
    }, 'user-avery', T0)).toThrow('maker cannot decide');
    state = decideAssetDepreciationRun(state, {
      id: 'run-1', decision: 'approved', remarks: 'Posted source, effective policy, period and straight-line calculation independently verified.', expectedVersion: 1,
    }, 'user-priya', T0);
    const handoff = state.journalDrafts[0]!;
    expect(handoff).toMatchObject({ sourceType: 'asset-depreciation', sourceId: 'run-1', totalDebit: 22500, totalCredit: 22500, status: 'ready' });
    expect(handoff.lines).toEqual([
      { accountCode: 'depreciation-expense', debit: 22500, credit: 0, memo: 'DEP-26-27-00001 / 2026-07-31' },
      { accountCode: 'accumulated-depreciation', debit: 0, credit: 22500, memo: 'DEP-26-27-00001 / 2026-07-31' },
    ]);
    expect(() => createAssetDepreciationRun(state, { periodEnd: '2026-07-31' }, 'user-avery', () => true, 'run-duplicate', T0)).toThrow('No posted asset capitalisation');
  });

  it('freezes canonical book value for a no-proceeds retirement and completes only after its exact journal posts', () => {
    let state = capitalizableAsset();
    state = createAssetCapitalization(state, {
      assetId: 'asset-mix-001', supplierInvoiceId: 'supplier-invoice-1', capitalizationDate: '2026-07-10', taxableAmount: 75000,
    }, 'user-avery', 'capitalization-1', T0);
    state = decideAssetCapitalization(state, {
      id: 'capitalization-1', decision: 'approved', remarks: 'Asset and procurement evidence independently verified before capitalisation.', expectedVersion: 1,
    }, 'user-priya', T0);
    const book = {
      capitalizationId: 'capitalization-1', grossCost: 75000, accumulatedDepreciation: 25000, netBookValue: 50000, asOfDate: '2026-07-31',
    };
    state = createAssetRetirement(state, {
      assetId: 'asset-mix-001', retirementDate: '2026-07-31', reason: 'Beyond economical repair after engineering condition assessment.', evidenceReference: 'SCRAP-2026-041',
    }, 'user-avery', () => book, 'retirement-1', T0);
    expect(state.assetRetirements[0]).toMatchObject({ number: 'RET-26-27-00001', status: 'submitted', grossCost: 75000, accumulatedDepreciation: 25000, netBookValue: 50000 });
    expect(() => decideAssetRetirement(state, {
      id: 'retirement-1', decision: 'approved', remarks: 'Maker cannot approve their own retirement request.', expectedVersion: 1,
    }, 'user-avery', () => book, T0)).toThrow('maker cannot decide');
    expect(() => decideAssetRetirement(state, {
      id: 'retirement-1', decision: 'approved', remarks: 'Book must be current at independent approval.', expectedVersion: 1,
    }, 'user-priya', () => ({ ...book, accumulatedDepreciation: 25001, netBookValue: 49999 }), T0)).toThrow('book changed');
    state = decideAssetRetirement(state, {
      id: 'retirement-1', decision: 'approved', remarks: 'No-proceeds scope, condition evidence and current fixed-asset book independently verified.', expectedVersion: 1,
    }, 'user-priya', () => book, T0);
    const handoff = state.journalDrafts[0]!;
    expect(handoff).toMatchObject({ sourceType: 'asset-retirement', sourceId: 'retirement-1', totalDebit: 75000, totalCredit: 75000, status: 'ready' });
    expect(handoff.lines).toEqual([
      { accountCode: 'accumulated-depreciation', debit: 25000, credit: 0, memo: 'RET-26-27-00001' },
      { accountCode: 'asset-retirement-loss', debit: 50000, credit: 0, memo: 'RET-26-27-00001' },
      { accountCode: 'fixed-assets', debit: 0, credit: 75000, memo: 'RET-26-27-00001' },
    ]);
    expect(() => completeAssetRetirement(state, {
      id: 'retirement-1', expectedVersion: 2,
    }, 'user-priya', () => false, T0)).toThrow('exact canonical journal');
    state = completeAssetRetirement(state, {
      id: 'retirement-1', expectedVersion: 2,
    }, 'user-priya', (draft) => draft.id === handoff.id, T0);
    expect(state.assetRetirements[0]).toMatchObject({ status: 'completed', completedBy: 'user-priya' });
    expect(state.managedAssets[0]).toMatchObject({ status: 'retired' });
  });

  it('creates a GST-aware customer sale with gain evidence and requires its exact posted handoff', () => {
    let state = capitalizableAsset();
    state = createAssetCapitalization(state, { assetId: 'asset-mix-001', supplierInvoiceId: 'supplier-invoice-1', capitalizationDate: '2026-07-10', taxableAmount: 75000 }, 'user-avery', 'capitalization-sale-1', T0);
    state = decideAssetCapitalization(state, { id: 'capitalization-sale-1', decision: 'approved', remarks: 'Capital cost independently checked.', expectedVersion: 1 }, 'user-priya', T0);
    const book = { capitalizationId: 'capitalization-sale-1', grossCost: 75000, accumulatedDepreciation: 25000, netBookValue: 50000, asOfDate: '2026-07-31' };
    state = createAssetSaleDisposal(state, { assetId: 'asset-mix-001', saleDate: '2026-08-01', customerAccountId: 'account-customer-1', customerTaxRegistrationNumber: '27ABCDE1234F1Z5', supplyType: 'intra-state', taxableProceeds: 70000, gstRate: 18, evidenceReference: 'SALE-INVOICE-2026-001' }, 'user-avery', () => book, '00000000-0000-0000-0000-000000000001', T0);
    expect(state.assetSaleDisposals[0]).toMatchObject({ status: 'submitted', taxableProceeds: 70000, gstAmount: 12600, totalProceeds: 82600, gainLoss: 20000 });
    const saleId = '00000000-0000-0000-0000-000000000001';
    expect(() => decideAssetSaleDisposal(state, { id: saleId, decision: 'approved', remarks: 'Maker cannot approve the sale.', expectedVersion: 1 }, 'user-avery', T0)).toThrow('maker cannot decide');
    state = decideAssetSaleDisposal(state, { id: saleId, decision: 'approved', remarks: 'Customer, GST evidence and current book independently checked.', expectedVersion: 1 }, 'user-priya', T0);
    const handoff = state.journalDrafts[0]!;
    expect(handoff).toMatchObject({ sourceType: 'asset-sale-disposal', totalDebit: 107600, totalCredit: 107600 });
    expect(handoff.lines).toEqual([
      { accountCode: 'accounts-receivable', debit: 82600, credit: 0, memo: 'SAL-26-27-00001' },
      { accountCode: 'accumulated-depreciation', debit: 25000, credit: 0, memo: 'SAL-26-27-00001' },
      { accountCode: 'fixed-assets', debit: 0, credit: 75000, memo: 'SAL-26-27-00001' },
      { accountCode: 'output-cgst', debit: 0, credit: 6300, memo: 'SAL-26-27-00001' },
      { accountCode: 'output-sgst', debit: 0, credit: 6300, memo: 'SAL-26-27-00001' },
      { accountCode: 'sales-revenue', debit: 0, credit: 20000, memo: 'SAL-26-27-00001 / gain' },
    ]);
    expect(() => completeAssetSaleDisposal(state, { id: saleId, expectedVersion: 2 }, 'user-lee', () => false, T0)).toThrow('exact canonical sale journal');
    state = completeAssetSaleDisposal(state, { id: saleId, expectedVersion: 2 }, 'user-lee', (draft) => draft.id === handoff.id, T0);
    expect(state.assetSaleDisposals[0]).toMatchObject({ status: 'completed', completedBy: 'user-lee' });
    expect(state.managedAssets[0]).toMatchObject({ status: 'retired' });
  });

  it('operates impairment/revaluation evidence and the service lifecycle cockpit end to end', () => {
    let state = capitalizableAsset();
    state = createAssetCapitalization(state, { assetId: 'asset-mix-001', supplierInvoiceId: 'supplier-invoice-1', capitalizationDate: '2026-07-10', taxableAmount: 75000 }, 'user-avery', 'capitalization-depth-1', T0);
    state = decideAssetCapitalization(state, { id: 'capitalization-depth-1', decision: 'approved', remarks: 'Capital cost independently checked.', expectedVersion: 1 }, 'user-priya', T0);
    const book = { capitalizationId: 'capitalization-depth-1', grossCost: 75000, accumulatedDepreciation: 25000, netBookValue: 50000, asOfDate: '2026-07-31' };
    state = createAssetImpairmentReview(state, { assetId: 'asset-mix-001', assessmentDate: '2026-08-01', recoverableAmount: 40000, evidenceReference: 'IMP-AUG-001' }, 'user-avery', () => book);
    const impairmentId = state.assetImpairmentReviews[0]!.id;
    state = decideAssetImpairmentReview(state, { id: impairmentId, decision: 'approved', remarks: 'Recoverable amount and engineering evidence checked.', expectedVersion: 1 }, 'user-priya');
    expect(state.assetImpairmentReviews[0]).toMatchObject({ impairmentAmount: 10000, status: 'approved' });
    state = createAssetRevaluation(state, { assetId: 'asset-mix-001', revaluationDate: '2026-08-02', fairValue: 60000, valuationBasis: 'Independent market comparable valuation', evidenceReference: 'REV-AUG-001' }, 'user-avery', () => book);
    const revaluationId = state.assetRevaluations[0]!.id;
    state = decideAssetRevaluation(state, { id: revaluationId, decision: 'approved', remarks: 'Valuation basis and evidence independently checked.', expectedVersion: 1 }, 'user-priya');
    expect(state.assetRevaluations[0]).toMatchObject({ uplift: 10000, status: 'approved' });
    state = createAssetWarranty(state, { assetId: 'asset-mix-001', providerName: 'Epic OEM', coverageDescription: 'Parts and labour for vessel drive system', startDate: '2026-07-10', endDate: '2027-07-10', evidenceReference: 'WARRANTY-CERT-001' }, 'user-avery');
    const warrantyId = state.assetWarranties[0]!.id;
    state = updateAssetWarrantyStatus(state, { id: warrantyId, status: 'claimed', expectedVersion: 1 }, 'user-lee');
    state = createAssetAmcContract(state, { assetId: 'asset-mix-001', providerName: 'Epic Service Partners', contractReference: 'AMC-2026-001', startDate: '2026-08-01', endDate: '2027-07-31', responseHours: 8, visitIntervalDays: 30, annualValue: 120000, coverageDescription: 'Preventive and corrective service', evidenceReference: 'AMC-SIGNED-001' }, 'user-avery');
    const amcId = state.assetAmcContracts[0]!.id;
    state = decideAssetAmcContract(state, { id: amcId, decision: 'approved', remarks: 'Commercial terms and service SLA checked.', expectedVersion: 1 }, 'user-priya');
    state = updateAssetAmcStatus(state, { id: amcId, status: 'active', expectedVersion: 2 });
    state = createAssetMeter(state, { assetId: 'asset-mix-001', name: 'Operating hours', meterType: 'hours', unit: 'h', initialReading: 100, serviceThreshold: 120 }, 'user-avery');
    const meterId = state.assetMeters[0]!.id;
    state = recordAssetMeterReading(state, { meterId, readingDate: '2026-08-03', reading: 125, source: 'manual', evidenceReference: 'METER-READ-001', expectedVersion: 1 }, 'user-lee');
    expect(state.correctiveMaintenanceRequests[0]).toMatchObject({ status: 'submitted', meterId });
    const correctiveId = state.correctiveMaintenanceRequests[0]!.id;
    state = transitionCorrectiveMaintenance(state, { id: correctiveId, transition: 'approved', rootCause: 'Seal wear detected', expectedVersion: 1 }, 'user-priya');
    state = transitionCorrectiveMaintenance(state, { id: correctiveId, transition: 'in-progress', expectedVersion: 2 }, 'user-lee');
    state = transitionCorrectiveMaintenance(state, { id: correctiveId, transition: 'completed', evidenceReference: 'COR-SERVICE-001', expectedVersion: 3 }, 'user-lee');
    state = transitionCorrectiveMaintenance(state, { id: correctiveId, transition: 'verified', evidenceReference: 'COR-VERIFY-001', expectedVersion: 4 }, 'user-priya');
    state = createAssetCalibration(state, { assetId: 'asset-mix-001', instrumentReference: 'CAL-INSTR-001', calibratedOn: '2026-08-01', dueOn: '2027-08-01', standardReference: 'ISO-17025-LAB', result: 'pass', certificateReference: 'CAL-CERT-001' }, 'user-avery');
    const calibrationId = state.assetCalibrations[0]!.id;
    state = decideAssetCalibration(state, { id: calibrationId, decision: 'approved', remarks: 'Certificate and traceability checked.', expectedVersion: 1 }, 'user-priya');
    state = createAssetSparePart(state, { assetId: 'asset-mix-001', itemVariantId: 'seal-kit-001', description: 'Vessel seal kit', quantityOnHand: 4, reorderPoint: 1, unitCost: 2500 }, 'user-avery');
    const spareId = state.assetSpareParts[0]!.id;
    state = issueAssetSpare(state, { sparePartId: spareId, quantity: 1, evidenceReference: 'SPARE-ISSUE-001', expectedVersion: 1 }, 'user-lee');
    state = createFleetVehicle(state, { assetId: 'asset-mix-001', registrationNumber: 'MH12AB1234', vehicleType: 'Service van', fuelType: 'diesel', odometer: 20000 }, 'user-avery');
    const vehicleId = state.fleetVehicles[0]!.id;
    state = createFleetTrip(state, { vehicleId, driverUserId: 'user-lee', tripDate: '2026-08-04', origin: 'Pune plant', destination: 'Customer site', purpose: 'Corrective service visit' }, 'user-avery');
    const tripId = state.fleetTrips[0]!.id;
    state = completeFleetTrip(state, { id: tripId, closingOdometer: 20084, evidenceReference: 'TRIP-CLOSE-001', expectedVersion: 1 }, 'user-lee');
    expect(state.fleetTrips[0]).toMatchObject({ status: 'completed', distance: 84 });
    expect(state.assetInstalledBaseEvents.length).toBeGreaterThanOrEqual(5);
  });
});
