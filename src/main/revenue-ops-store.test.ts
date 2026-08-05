import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from '../domain/revenue-ops';
import { upgradeStoredState } from './revenue-ops-store';

describe('revenue operations state migration', () => {
  it('upgrades schema v3 without losing order-to-cash state', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 3;
    legacy.revision = 41;
    for (const key of ['gstRegistrations', 'placeOfSupplyReviews', 'stockLocations', 'stockPositions', 'stockMovements', 'stockReservations', 'shipmentPackages', 'shipmentEvents', 'carrierAdapters', 'returnAuthorizations', 'statutoryExchanges']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 42, scope: current.scope });
    expect(upgraded?.paymentTerms).toEqual(current.paymentTerms.map((term) => ({
      ...term,
      scope: current.scope,
    })));
    expect(upgraded?.carrierAdapters[0]).toMatchObject({ code: 'MANUAL', status: 'configured' });
    expect(upgraded?.gstRegistrations).toEqual([]);
    expect(upgraded?.statutoryExchanges).toEqual([]);
    expect(upgraded?.uoms.map(({ code }) => code)).toEqual(['UNIT', 'BOX', 'KG']);
  });

  it('upgrades schema v4 without losing fulfilment control state', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 4;
    legacy.revision = 9;
    legacy.stockLocations = [{ id: 'loc-legacy', code: 'LEGACY', name: 'Legacy warehouse', stateCode: '27', active: true, version: 1 }];
    legacy.stockPositions = [{ id: 'position-legacy', locationId: 'loc-legacy', productId: 'product-distributor-platform', onHand: 12, reserved: 2, available: 10, version: 1 }];
    for (const key of ['uoms', 'uomConversions', 'inventoryItems', 'itemVariants', 'warehouses', 'warehouseZones', 'storageBins', 'inventoryBatches', 'serialUnits', 'binBalances', 'inventoryCostLayers', 'inventoryLedger', 'warehouseTasks', 'inventoryTransfers', 'cycleCountPlans', 'reorderPolicies', 'reorderProposals', 'inventoryValuationReviews']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 10 });
    expect(upgraded?.stockLocations[0]).toMatchObject({ id: 'loc-legacy', code: 'LEGACY' });
    expect(upgraded?.stockPositions[0]).toMatchObject({ onHand: 12, reserved: 2, available: 10 });
    expect(upgraded?.uoms).toHaveLength(3);
    expect(upgraded?.inventoryLedger).toEqual([]);
  });

  it('upgrades schema v5 without losing warehouse depth', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 5;
    legacy.revision = 18;
    legacy.warehouses = [{ id: 'wh-legacy', code: 'LEGACY', name: 'Legacy DC', stateCode: '27', stockLocationId: 'loc-1', active: true, version: 1 }];
    legacy.inventoryLedger = [{ id: 'ledger-legacy', type: 'receipt', warehouseId: 'wh-legacy', binId: 'bin-1', itemVariantId: 'variant-1', quantity: 5, unitCost: 100, totalCost: 500, reference: 'GRN-1', occurredAt: '2026-07-15T00:00:00.000Z', actorId: 'user-1', checksum: 'abc' }];
    for (const key of ['statutoryAdapters', 'statutoryOperations', 'consolidatedEwayBills', 'digitalSignatureEvidence', 'portalReconciliationRuns']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 19 });
    expect(upgraded?.warehouses[0]).toMatchObject({ id: 'wh-legacy', code: 'LEGACY' });
    expect(upgraded?.inventoryLedger[0]).toMatchObject({ reference: 'GRN-1', totalCost: 500 });
    expect(upgraded?.statutoryAdapters).toEqual([]);
    expect(upgraded?.portalReconciliationRuns).toEqual([]);
  });

  it('upgrades schema v6 without losing certified statutory control history', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 6;
    legacy.revision = 27;
    legacy.statutoryOperations = [{ id: 'operation-legacy', number: 'SOP-26-27-00001', exchangeId: 'exchange-1', adapterId: 'adapter-1', operation: 'cancel', reasonCode: 'DATA-ERROR', remarks: 'Legacy cancellation evidence', status: 'accepted', attempts: 1, requestedBy: 'user-1', requestedAt: '2026-07-15T00:00:00.000Z', version: 2 }];
    for (const key of ['creditLimitControls', 'dunningCases', 'collectionActivities', 'receivableDisputes', 'writeOffRequests', 'withholdingPolicies', 'withholdingEntries', 'zeroRatedSupplyReviews', 'bankAccounts', 'bankStatementImports', 'bankStatementLines']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 28 });
    expect(upgraded?.statutoryOperations[0]).toMatchObject({ id: 'operation-legacy', status: 'accepted' });
    expect(upgraded?.creditLimitControls).toEqual([]);
    expect(upgraded?.bankStatementLines).toEqual([]);
  });

  it('upgrades schema v7 without losing India collections controls', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 7;
    legacy.revision = 31;
    legacy.creditLimitControls = [{ id: 'credit-legacy', number: 'CRL-26-27-00001', accountId: 'account-sahyadri', currency: 'INR', creditLimit: 500000, warningThresholdPercent: 80, graceDays: 15, blockNewOrders: true, riskGrade: 'B', rationale: 'Legacy control history', status: 'approved', requestedBy: 'user-1', requestedAt: '2026-07-15T00:00:00.000Z', version: 2 }];
    for (const key of ['suppliers', 'requestForQuotations', 'supplierQuotations', 'purchaseOrders', 'goodsReceipts', 'landedCostAllocations', 'supplierInvoices', 'threeWayMatches']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 32 });
    expect(upgraded?.creditLimitControls[0]).toMatchObject({ id: 'credit-legacy', status: 'approved' });
    expect(upgraded?.purchaseOrders).toEqual([]);
  });

  it('upgrades schema v8 procurement history without inventing treasury records', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 8;
    legacy.revision = 52;
    legacy.suppliers = [{ id: 'supplier-legacy', code: 'LEGACY', legalName: 'Legacy Supplier Private Limited', stateCode: '27', email: 'ops@example.com', paymentTermDays: 30, categories: ['materials'], riskRating: 'low', qualificationEvidence: 'Legacy evidence reference', status: 'approved', requestedBy: 'user-1', requestedAt: '2026-07-15T00:00:00.000Z', version: 2 }];
    for (const key of ['treasuryPositions', 'cashForecastRuns', 'paymentProposals', 'bankCharges', 'settlementExceptions', 'liquiditySweeps']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 53 });
    expect(upgraded?.suppliers[0]).toMatchObject({ id: 'supplier-legacy', status: 'approved' });
    expect(upgraded?.cashForecastRuns).toEqual([]);
    expect(upgraded?.paymentProposals).toEqual([]);
  });

  it('upgrades schema v9 treasury history without inventing manufacturing records', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 9;
    legacy.revision = 64;
    legacy.treasuryPositions = [{ id: 'position-legacy', number: 'TCP-26-27-00001', bankAccountId: 'bank-1', asOfDate: '2026-07-15', availableBalance: 125000, source: 'bank-statement', evidenceReference: 'STM-260715', recordedBy: 'user-1', recordedAt: '2026-07-15T00:00:00.000Z', version: 1 }];
    for (const key of ['workCenters', 'bomRevisions', 'qualityPlans', 'workOrders', 'productionMaterialIssues', 'qualityInspections', 'nonconformances', 'productionOutputs']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 65 });
    expect(upgraded?.treasuryPositions[0]).toMatchObject({ id: 'position-legacy', availableBalance: 125000 });
    expect(upgraded?.workOrders).toEqual([]);
    expect(upgraded?.productionOutputs).toEqual([]);
  });

  it('upgrades schema v10 manufacturing history without inventing delivery records', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 10;
    legacy.revision = 75;
    legacy.workCenters = [{ id: 'center-legacy', code: 'LEGACY', name: 'Legacy assembly line', warehouseId: 'warehouse-1', dailyCapacityHours: 40, efficiencyPercent: 85, hourlyCost: 900, active: true, version: 2 }];
    for (const key of ['deliveryProjects', 'projectTasks', 'timeEntries', 'serviceAgreements', 'supportTickets', 'fieldServiceJobs']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 76 });
    expect(upgraded?.workCenters[0]).toMatchObject({ id: 'center-legacy', code: 'LEGACY', active: true });
    expect(upgraded?.deliveryProjects).toEqual([]);
    expect(upgraded?.fieldServiceJobs).toEqual([]);
  });

  it('upgrades schema v11 delivery history and safely initializes workforce capacity', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 11;
    legacy.revision = 88;
    legacy.deliveryProjects = [{ id: 'project-legacy', number: 'PRJ-26-27-00001', name: 'Legacy delivery', deliveryModel: 'fixed-price', budgetAmount: 100000, plannedHours: 20, startDate: '2026-07-16', targetDate: '2026-07-30', managerUserId: 'user-1', status: 'active', requestedBy: 'user-1', requestedAt: '2026-07-16T00:00:00.000Z', version: 2 }];
    legacy.timeEntries = [{ id: 'time-legacy', number: 'TIM-26-27-00001', projectId: 'project-legacy', projectTaskId: 'task-legacy', workDate: '2026-07-16', hours: 3, billable: true, notes: 'Legacy approved work.', status: 'approved', submittedBy: 'user-1', submittedAt: '2026-07-16T00:00:00.000Z', version: 2 }];
    for (const key of ['workforceProfiles', 'workforceAvailabilities', 'workforceAllocations']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 89 });
    expect(upgraded?.deliveryProjects[0]).toMatchObject({ id: 'project-legacy', status: 'active' });
    expect(upgraded?.timeEntries[0]).toMatchObject({ id: 'time-legacy', hourlyCost: 0, costAmount: 0 });
    expect(upgraded?.workforceProfiles).toEqual([]);
  });

  it('upgrades schema v12 workforce history and initializes financial-close control records', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 12;
    legacy.revision = 101;
    for (const key of ['projectBillingPlans', 'projectBillingClaims', 'revenueRecognitionEvents', 'serviceEntitlementUsage', 'accountingClosePeriods']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 102 });
    expect(upgraded?.workforceProfiles).toHaveLength(3);
    expect(upgraded?.projectBillingPlans).toEqual([]);
    expect(upgraded?.accountingClosePeriods).toEqual([]);
    expect(upgraded?.payrollRuns).toEqual([]);
    expect(upgraded?.expenseClaims).toEqual([]);
  });

  it('upgrades schema v13 financial-close history and initializes the People Ledger', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 13;
    legacy.revision = 143;
    legacy.projectBillingPlans = [{ id: 'plan-legacy', number: 'BPL-26-27-00001', projectId: 'project-1', salesOrderId: 'order-1', salesOrderLineId: 'line-1', billingModel: 'time-and-materials', billRate: 1000, effectiveFrom: '2026-07-01', effectiveTo: '2026-07-31', status: 'active', requestedBy: 'user-1', requestedAt: '2026-07-01T00:00:00.000Z', version: 2 }];
    for (const key of ['employerRegistrations', 'payrollPolicies', 'payrollCompensations', 'benefitPlans', 'benefitEnrollments', 'payrollRuns', 'payrollSlips', 'payrollStatutoryObligations', 'expenseClaims']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 144 });
    expect(upgraded?.projectBillingPlans[0]).toMatchObject({ id: 'plan-legacy', status: 'active' });
    expect(upgraded?.payrollPolicies).toEqual([]);
    expect(upgraded?.payrollStatutoryObligations).toEqual([]);
  });

  it('upgrades schema v14 People Ledger history and initializes workforce-depth records', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 14;
    legacy.revision = 168;
    legacy.payrollRuns = [{ id: 'run-legacy', number: 'PAY-26-27-00001', periodFrom: '2026-07-01', periodTo: '2026-07-31', paymentDate: '2026-08-01', workforceProfileIds: ['workforce-avery'], policySnapshots: [], slipIds: [], totalGrossPay: 0, totalEmployeeDeductions: 0, totalEmployerContributions: 0, totalNetPay: 0, status: 'finalized', requestedBy: 'user-1', requestedAt: '2026-08-01T00:00:00.000Z', version: 2 }];
    for (const key of ['attendanceRecords', 'leaveTypes', 'leaveApplications', 'payrollAdjustments', 'taxDeclarations', 'payslipDeliveries']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 169 });
    expect(upgraded?.payrollRuns[0]).toMatchObject({ id: 'run-legacy', adjustmentIds: [] });
    expect(upgraded?.attendanceRecords).toEqual([]);
    expect(upgraded?.payslipDeliveries).toEqual([]);
  });

  it('upgrades schema v15 workforce evidence without inventing provider authority', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 15;
    legacy.revision = 181;
    for (const key of ['providerConnectors', 'providerConformanceCases', 'providerSubmissions', 'providerReconciliationRuns']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 182 });
    expect(upgraded?.attendanceRecords).toEqual([]);
    expect(upgraded?.providerConnectors).toEqual([]);
    expect(upgraded?.providerSubmissions).toEqual([]);
  });

  it('upgrades schema v16 provider history without inventing project-commercial records', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 16;
    legacy.revision = 205;
    for (const key of ['projectExchangeRates', 'projectCurrencyProfiles', 'projectContractVariations', 'projectRetainers', 'retainerDrawdowns', 'projectResourcePlans', 'projectMarginReviews']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 206 });
    expect(upgraded?.providerConnectors).toEqual(current.providerConnectors);
    expect(upgraded?.projectExchangeRates).toEqual([]);
    expect(upgraded?.projectMarginReviews).toEqual([]);
  });

  it('adds a persisted company-and-branch scope when upgrading schema v17', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 17;
    legacy.revision = 205;
    delete legacy.scope;

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 206, scope: current.scope });
  });

  it('materializes record scope across the commercial document chain when upgrading schema v18', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 18;
    legacy.revision = 300;
    legacy.quotes = [{ id: 'quote-legacy' }];
    legacy.salesOrders = [{ id: 'order-legacy' }];
    legacy.invoices = [{ id: 'invoice-legacy' }];
    legacy.creditDebitNotes = [{ id: 'note-legacy' }];
    legacy.receivables = [{ id: 'receivable-legacy' }];
    legacy.paymentReceipts = [{ id: 'receipt-legacy' }];

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 301 });
    expect(upgraded?.quotes[0]?.scope).toEqual(current.scope);
    expect(upgraded?.salesOrders[0]?.scope).toEqual(current.scope);
    expect(upgraded?.invoices[0]?.scope).toEqual(current.scope);
    expect(upgraded?.creditDebitNotes[0]?.scope).toEqual(current.scope);
    expect(upgraded?.receivables[0]?.scope).toEqual(current.scope);
    expect(upgraded?.paymentReceipts[0]?.scope).toEqual(current.scope);
  });

  it('materializes inventory and warehouse record scope when upgrading schema v19', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 19;
    legacy.revision = 401;
    legacy.warehouses = [{ id: 'warehouse-legacy' }];
    legacy.storageBins = [{ id: 'bin-legacy' }];
    legacy.inventoryLedger = [{ id: 'ledger-legacy' }];
    legacy.inventoryTransfers = [{ id: 'transfer-legacy' }];

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 402 });
    expect(upgraded?.warehouses[0]?.scope).toEqual(current.scope);
    expect(upgraded?.storageBins[0]?.scope).toEqual(current.scope);
    expect(upgraded?.inventoryLedger[0]?.scope).toEqual(current.scope);
    expect(upgraded?.inventoryTransfers[0]?.scope).toEqual(current.scope);
  });

  it('materializes procurement record scope when upgrading schema v20', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 20;
    legacy.revision = 500;
    legacy.suppliers = [{ id: 'supplier-legacy' }];
    legacy.requestForQuotations = [{ id: 'rfq-legacy' }];
    legacy.purchaseOrders = [{ id: 'po-legacy' }];
    legacy.goodsReceipts = [{ id: 'grn-legacy' }];
    legacy.supplierInvoices = [{ id: 'invoice-legacy' }];
    legacy.threeWayMatches = [{ id: 'match-legacy' }];

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 501 });
    expect(upgraded?.suppliers[0]?.scope).toEqual(current.scope);
    expect(upgraded?.requestForQuotations[0]?.scope).toEqual(current.scope);
    expect(upgraded?.purchaseOrders[0]?.scope).toEqual(current.scope);
    expect(upgraded?.goodsReceipts[0]?.scope).toEqual(current.scope);
    expect(upgraded?.supplierInvoices[0]?.scope).toEqual(current.scope);
    expect(upgraded?.threeWayMatches[0]?.scope).toEqual(current.scope);
  });

  it('adds the empty installed-asset and maintenance collections when upgrading schema v26', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 26;
    legacy.revision = 601;
    delete legacy.assetCategories;
    delete legacy.managedAssets;
    delete legacy.preventiveMaintenancePlans;
    delete legacy.maintenanceWorkOrders;

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 602, scope: current.scope });
    expect(upgraded?.assetCategories).toEqual([]);
    expect(upgraded?.managedAssets).toEqual([]);
    expect(upgraded?.assetCapitalizations).toEqual([]);
    expect(upgraded?.preventiveMaintenancePlans).toEqual([]);
    expect(upgraded?.maintenanceWorkOrders).toEqual([]);
  });

  it('adds fixed-asset policy and monthly depreciation collections when upgrading schema v28', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 28;
    legacy.revision = 702;
    delete legacy.assetDepreciationPolicies;
    delete legacy.assetDepreciationRuns;

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 703, scope: current.scope });
    expect(upgraded?.assetDepreciationPolicies).toEqual([]);
    expect(upgraded?.assetDepreciationRuns).toEqual([]);
  });

  it('adds the empty no-proceeds asset-retirement collection when upgrading schema v29', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 29;
    legacy.revision = 703;
    delete legacy.assetRetirements;

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 704, scope: current.scope });
    expect(upgraded?.assetRetirements).toEqual([]);
    expect(upgraded?.assetDepreciationRuns).toEqual(current.assetDepreciationRuns);
  });

  it('adds the empty controlled asset-custody-transfer collection when upgrading schema v30', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 30;
    legacy.revision = 704;
    delete legacy.assetCustodyTransfers;

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 705, scope: current.scope });
    expect(upgraded?.assetCustodyTransfers).toEqual([]);
    expect(upgraded?.assetRetirements).toEqual(current.assetRetirements);
  });

  it('adds the empty physical component passport collection when upgrading schema v31', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 31;
    legacy.revision = 706;
    delete legacy.assetComponentizations;

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 707, scope: current.scope });
    expect(upgraded?.assetComponentizations).toEqual([]);
    expect(upgraded?.assetCustodyTransfers).toEqual(current.assetCustodyTransfers);
  });

  it('adds the empty component-allocation collection when upgrading schema v32', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 32;
    legacy.revision = 707;
    delete legacy.assetComponentAllocations;

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 708, scope: current.scope });
    expect(upgraded?.assetComponentAllocations).toEqual([]);
    expect(upgraded?.assetComponentizations).toEqual(current.assetComponentizations);
  });

  it('adds the empty inter-branch transfer accounting collection when upgrading schema v33', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 33;
    legacy.revision = 708;
    delete legacy.assetTransferAccountings;
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 709, scope: current.scope });
    expect(upgraded?.assetTransferAccountings).toEqual([]);
    expect(upgraded?.assetComponentAllocations).toEqual(current.assetComponentAllocations);
  });

  it('adds the empty sale-for-proceeds disposal collection when upgrading schema v34', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 34;
    legacy.revision = 709;
    delete legacy.assetSaleDisposals;
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 710, scope: current.scope });
    expect(upgraded?.assetSaleDisposals).toEqual([]);
    expect(upgraded?.assetTransferAccountings).toEqual(current.assetTransferAccountings);
  });

  it('adds the complete asset lifecycle depth collections when upgrading schema v35', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 35;
    legacy.revision = 710;
    for (const key of ['assetImpairmentReviews', 'assetRevaluations', 'assetWarranties', 'assetAmcContracts', 'assetMeters', 'assetMeterReadings', 'correctiveMaintenanceRequests', 'assetCalibrations', 'assetSpareParts', 'assetSpareIssues', 'fleetVehicles', 'fleetTrips', 'assetInstalledBaseEvents']) delete legacy[key];
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 711, scope: current.scope });
    expect(upgraded?.assetImpairmentReviews).toEqual([]);
    expect(upgraded?.assetInstalledBaseEvents).toEqual([]);
  });

  it('adds the empty purchase requisition collection when upgrading schema v36', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 36;
    legacy.revision = 711;
    delete legacy.purchaseRequisitions;
    const upgraded = upgradeStoredState(legacy);
    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 712, scope: current.scope });
    expect(upgraded?.purchaseRequisitions).toEqual([]);
    expect(upgraded?.assetInstalledBaseEvents).toEqual(current.assetInstalledBaseEvents);
  });

  it('upgrades schema v37 safely by adding empty India PIN policy and delivery-promise collections', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 37;
    legacy.revision = 713;
    delete legacy.pincodeServiceabilityRules;
    delete legacy.deliveryPromises;

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 714, scope: current.scope });
    expect(upgraded?.pincodeServiceabilityRules).toEqual([]);
    expect(upgraded?.deliveryPromises).toEqual([]);
    expect(upgraded?.carrierAdapters).toEqual(current.carrierAdapters);
  });

  it('backfills unscoped legacy physical evidence without overwriting an explicit foreign scope', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    const foreignScope = { companyId: 'company-foreign', branchId: 'branch-foreign' };
    legacy.schemaVersion = 38;
    legacy.revision = 714;
    legacy.stockLocations = [{ id: 'location-legacy' }, { id: 'location-foreign', scope: foreignScope }];
    legacy.stockPositions = [{ id: 'position-legacy' }];
    legacy.stockMovements = [{ id: 'movement-legacy' }];
    legacy.stockReservations = [{ id: 'reservation-legacy' }];
    legacy.shipmentPackages = [{ id: 'shipment-legacy' }];
    legacy.shipmentEvents = [{ id: 'event-legacy' }];
    legacy.carrierAdapters = [{ id: 'carrier-legacy' }];
    legacy.returnAuthorizations = [{ id: 'return-legacy' }];

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 715 });
    expect(upgraded?.stockLocations[0]?.scope).toEqual(current.scope);
    expect(upgraded?.stockLocations[1]?.scope).toEqual(foreignScope);
    expect(upgraded?.stockPositions[0]?.scope).toEqual(current.scope);
    expect(upgraded?.stockMovements[0]?.scope).toEqual(current.scope);
    expect(upgraded?.stockReservations[0]?.scope).toEqual(current.scope);
    expect(upgraded?.shipmentPackages[0]?.scope).toEqual(current.scope);
    expect(upgraded?.shipmentEvents[0]?.scope).toEqual(current.scope);
    expect(upgraded?.carrierAdapters[0]?.scope).toEqual(current.scope);
    expect(upgraded?.returnAuthorizations[0]?.scope).toEqual(current.scope);
  });

  it('upgrades schema v39 with an empty COD custody register and never fabricates receipt evidence', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 39;
    legacy.revision = 715;
    delete legacy.codCollectionCases;

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 716, scope: current.scope });
    expect(upgraded?.codCollectionCases).toEqual([]);
    expect(upgraded?.paymentReceipts).toEqual(current.paymentReceipts);
    expect(upgraded?.bankStatementLines).toEqual(current.bankStatementLines);
  });

  it('upgrades schema v40 with an empty inventory-disposition register without fabricating inventory evidence', () => {
    const current = createInitialRevenueOpsState();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 40;
    legacy.revision = 716;
    delete legacy.inventoryDispositions;

    const upgraded = upgradeStoredState(legacy);

    expect(upgraded).toMatchObject({ schemaVersion: 54, revision: 717, scope: current.scope });
    expect(upgraded?.inventoryDispositions).toEqual([]);
    expect(upgraded?.inventoryLedger).toEqual(current.inventoryLedger);
    expect(upgraded?.stockPositions).toEqual(current.stockPositions);
  });
});
