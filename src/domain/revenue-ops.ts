import type { Opportunity } from '../shared/contracts';
import type {
  AssignmentRule,
  AudienceSegment,
  BulkAssignInput,
  CreateAssignmentRuleInput,
  CreateAudienceSegmentInput,
  CreateIndiaOpportunityInput,
  CreateQuoteInput,
  CreateTerritoryInput,
  OpportunityAssignment,
  ProductInterest,
  QuoteDraft,
  QuoteLine,
  QuoteStatus,
  RegisterIndiaOpportunityInput,
  ResolvedAudienceSegment,
  RevenueOpsContext,
  RevenueOpsSnapshot,
  RevenueOpsState,
  Territory,
  TransitionQuoteInput,
  UpdateIndiaProfileInput,
} from '../shared/revenue-ops-contracts';
import { providerCredentialLifecycle } from '../shared/provider-contracts';

export const INDIA_STATES = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'],
  ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'],
  ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'],
  ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
] as const;

const STATE_CODES = new Set(INDIA_STATES.map(([code]) => code));
const WEST = ['22', '23', '24', '26', '27', '30'];
const NORTH = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '38'];
const SOUTH = ['29', '31', '32', '33', '34', '35', '36', '37'];
const EAST_NORTHEAST = [...STATE_CODES].filter((code) => !WEST.includes(code) && !NORTH.includes(code) && !SOUTH.includes(code));

function clean(value: string, label: string, minimum = 2, maximum = 160): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function hoursForSnapshot(entries: Array<{ hours: number }>): number {
  return Math.round(entries.reduce((total, entry) => total + entry.hours, 0) * 10_000) / 10_000;
}

export function isIndiaStateCode(value: string): boolean {
  return STATE_CODES.has(value as (typeof INDIA_STATES)[number][0]);
}

export function validateGstin(value: string, stateCode?: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(normalized)) throw new Error('GSTIN must use the official 15-character structure.');
  if (!isIndiaStateCode(normalized.slice(0, 2))) throw new Error('GSTIN begins with an unsupported state code.');
  if (stateCode && normalized.slice(0, 2) !== stateCode) throw new Error('GSTIN state code must match the selected place of supply.');
  return normalized;
}

export function createInitialRevenueOpsState(): RevenueOpsState {
  const territories: Territory[] = [
    { id: 'territory-national', code: 'IND', name: 'National / Strategic', region: 'national', stateCodes: [...STATE_CODES], managerUserId: 'user-avery', active: true, version: 1 },
    { id: 'territory-north', code: 'NORTH', name: 'North India', region: 'north', stateCodes: NORTH, managerUserId: 'user-priya', active: true, version: 1 },
    { id: 'territory-west', code: 'WEST', name: 'West India', region: 'west', stateCodes: WEST, managerUserId: 'user-avery', active: true, version: 1 },
    { id: 'territory-south', code: 'SOUTH', name: 'South India', region: 'south', stateCodes: SOUTH, managerUserId: 'user-lee', active: true, version: 1 },
    { id: 'territory-east-ne', code: 'EAST-NE', name: 'East + Northeast', region: 'east-northeast', stateCodes: EAST_NORTHEAST, managerUserId: 'user-priya', active: true, version: 1 },
  ];
  const assignmentRules: AssignmentRule[] = [
    { id: 'rule-strategic', name: 'Strategic pursuit desk', field: 'value', operator: 'gte', value: '10000000', territoryId: 'territory-national', assigneeUserId: 'user-avery', priority: 100, active: true, version: 1 },
    { id: 'rule-west', name: 'West state routing', field: 'stateCode', operator: 'in', value: WEST.join(','), territoryId: 'territory-west', assigneeUserId: 'user-avery', priority: 60, active: true, version: 1 },
    { id: 'rule-south', name: 'South state routing', field: 'stateCode', operator: 'in', value: SOUTH.join(','), territoryId: 'territory-south', assigneeUserId: 'user-lee', priority: 60, active: true, version: 1 },
    { id: 'rule-north', name: 'North state routing', field: 'stateCode', operator: 'in', value: NORTH.join(','), territoryId: 'territory-north', assigneeUserId: 'user-priya', priority: 60, active: true, version: 1 },
  ];
  const opportunityIds = Array.from({ length: 11 }, (_unused, index) => `opp-${201 + index}`);
  const assignmentTerritories = ['territory-west', 'territory-north', 'territory-south', 'territory-west', 'territory-south', 'territory-north', 'territory-west', 'territory-south', 'territory-national', 'territory-east-ne', 'territory-west'];
  return {
    schemaVersion: 54,
    revision: 1,
    scope: { companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' },
    profile: { id: 'india-profile-primary', legalName: 'Epic BOS India Private Limited', tradeName: 'Epic BOS India', gstRegistered: false, gstin: '', pan: '', udyamNumber: '', defaultStateCode: '27', currency: 'INR', fiscalYearStartMonth: 4, version: 1 },
    territories,
    assignmentRules,
    assignments: opportunityIds.map((opportunityId, index) => ({ id: `assignment-${opportunityId}`, opportunityId, territoryId: assignmentTerritories[index]!, assigneeUserId: territories.find(({ id }) => id === assignmentTerritories[index])?.managerUserId ?? 'user-avery', source: 'automatic', assignedAt: '2026-07-15T06:00:00.000Z', version: 1 })),
    segments: [
      { id: 'segment-west-enterprise', name: 'West enterprise pursuits', resource: 'opportunity', stateCodes: [], industries: [], relationships: [], territoryIds: ['territory-west'], minimumOpportunityValue: 100000, shared: true, active: true, version: 1 },
      { id: 'segment-customer-council', name: 'Customer leadership council', resource: 'contact', stateCodes: [], industries: ['Healthcare'], relationships: ['customer'], territoryIds: [], minimumOpportunityValue: 0, shared: true, active: true, version: 1 },
    ],
    productInterests: [{ id: 'interest-sahyadri-platform', opportunityId: 'opp-211', accountId: 'account-sahyadri', name: 'Distributor operations platform', kind: 'service', hsnSac: '998314', quantity: 1, unitPrice: 4800000, gstRate: 18, notes: 'Commercial discovery estimate', catalogProductId: 'product-distributor-platform', version: 1 }],
    quotes: [],
    taxCodes: [{ id: 'tax-sac-998314-2026', code: '998314', kind: 'SAC', description: 'Information technology design and development services - verify classification for the actual supply', gstRate: 18, cessRate: 0, effectiveFrom: '2026-04-01', sourceLabel: 'GST Portal HSN/SAC search guidance', sourceUrl: 'https://tutorial.gst.gov.in/userguide/taxpayersdashboard/Search_HSN_SAC_Tax_Rates_manual.htm', reviewStatus: 'verified', reviewedAt: '2026-07-15T06:00:00.000Z', version: 1 }],
    products: [{ id: 'product-distributor-platform', sku: 'BOS-DIST-IN', name: 'Distributor operations platform', description: 'India-ready business operations suite for distributor networks.', kind: 'service', uom: 'LICENSE', taxCodeId: 'tax-sac-998314-2026', effectiveFrom: '2026-04-01', active: true, version: 1 }],
    priceLists: [{ id: 'price-list-india-direct-2627', code: 'IN-DIRECT-2627', name: 'India direct FY 2026-27', currency: 'INR', channel: 'direct', effectiveFrom: '2026-04-01', effectiveTo: '2027-03-31', status: 'active', active: true, activatedBy: 'system:seed', activatedAt: '2026-04-01T00:00:00.000Z', version: 1 }],
    priceListEntries: [{ id: 'price-bos-dist-in-2627', priceListId: 'price-list-india-direct-2627', productId: 'product-distributor-platform', unitPrice: 4800000, minimumQuantity: 1, effectiveFrom: '2026-04-01', effectiveTo: '2027-03-31', version: 1 }],
    priceListApprovalRequests: [],
    discountPolicies: [{ id: 'discount-partner-launch-2627', code: 'PARTNER-LAUNCH', name: 'Partner launch concession', scope: 'order', method: 'percentage', value: 2.5, minimumTaxableValue: 1000000, maximumDiscountAmount: 150000, stackable: false, approvalThresholdPercent: 2, effectiveFrom: '2026-04-01', effectiveTo: '2027-03-31', active: true, version: 1 }],
    quoteApprovalRequests: [],
    salesOrders: [],
    fulfilmentTasks: [],
    quoteDocuments: [],
    paymentTerms: [
      { id: 'payment-term-net-15', code: 'NET15', name: 'Net 15 days', dueDays: 15, earlyPaymentDays: 0, earlyPaymentDiscountPercent: 0, active: true, version: 1 },
      { id: 'payment-term-net-30', code: 'NET30', name: 'Net 30 days', dueDays: 30, earlyPaymentDays: 10, earlyPaymentDiscountPercent: 1, active: true, version: 1 },
      { id: 'payment-term-due-receipt', code: 'DUE', name: 'Due on receipt', dueDays: 0, earlyPaymentDays: 0, earlyPaymentDiscountPercent: 0, active: true, version: 1 },
    ],
    deliveryEvidence: [],
    serviceMilestones: [],
    invoices: [],
    creditDebitNotes: [],
    receivables: [],
    paymentReceipts: [],
    journalDrafts: [],
    invoiceDocuments: [],
    gstRegistrations: [],
    placeOfSupplyReviews: [],
    stockLocations: [],
    stockPositions: [],
    stockMovements: [],
    stockReservations: [],
    shipmentPackages: [],
    shipmentEvents: [],
    carrierAdapters: [
      { id: 'carrier-manual', code: 'MANUAL', name: 'Manual carrier desk', mode: 'manual', status: 'configured', capability: ['booking', 'tracking', 'proof-of-delivery'], scope: { companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' }, version: 1 },
    ],
    pincodeServiceabilityRules: [],
    deliveryPromises: [],
    codCollectionCases: [],
    returnAuthorizations: [],
    statutoryExchanges: [],
    uoms: [
      { id: 'uom-unit', code: 'UNIT', name: 'Unit', category: 'count', precision: 0, active: true, scope: { companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' }, version: 1 },
      { id: 'uom-box', code: 'BOX', name: 'Box', category: 'count', precision: 0, active: true, scope: { companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' }, version: 1 },
      { id: 'uom-kg', code: 'KG', name: 'Kilogram', category: 'weight', precision: 3, active: true, scope: { companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' }, version: 1 },
    ],
    uomConversions: [],
    inventoryItems: [],
    itemVariants: [],
    warehouses: [],
    warehouseZones: [],
    storageBins: [],
    inventoryBatches: [],
    serialUnits: [],
    binBalances: [],
    inventoryCostLayers: [],
    inventoryLedger: [],
    warehouseTasks: [],
    inventoryTransfers: [],
    cycleCountPlans: [],
    reorderPolicies: [],
    reorderProposals: [],
    inventoryValuationReviews: [],
    inventoryDispositions: [],
    retailCounters: [],
    retailCashierShifts: [],
    retailSales: [],
    retailOfflineSaleQueue: [],
    retailOfflineSyncReceipts: [],
    retailUnifiedOrderIngestion: { orders: [], conflicts: [], reservationIntents: [], hubHandoffs: [], fulfilmentHandoffs: [], stockReservationExecutions: [], pickTaskExecutions: [], shipmentPackageExecutions: [], dispatchReadinessExecutions: [], carrierDispatchExecutions: [], deliveryExecutions: [], rtoReconciliationExecutions: [], returnReconciliationExecutions: [], carrierCallbackEvidence: [], reconciliationRequirements: [] },
    retailDeviceTransportEvidence: [],
    retailDevicePreflightEvidence: [],
    retailDeviceAdapterProfiles: [],
    retailReturns: [],
    retailExchanges: [],
    retailCreditNoteReconciliations: [],
    retailInterBranchTransfers: [],
    retailScaleProfiles: [],
    retailPrinterAdapters: [],
    retailLabelPrintDispatches: [],
    retailCatalogBulkEdits: [],
    retailStoreCredits: [],
    retailCatalogCategories: [],
    retailCatalogBrands: [],
    retailMerchandisingProfiles: [],
    retailBarcodeSequences: [],
    retailLabelPrintRuns: [],
    retailProductCombos: [],
    retailLoyaltyAccounts: [],
    retailLoyaltyLedger: [],
    retailVouchers: [],
    retailCustomerVisits: [],
    retailSalesCommissions: [],
    retailCommissionPayoutBatches: [],
    retailPromotionRedemptions: [],
    retailPurchaseOcrDocuments: [],
    retailCommerceConnectors: [],
    retailCommerceSyncRuns: [],
    retailCommerceOrders: [],
    retailCommerceCatalogMappings: [],
    retailSettlementReconciliations: [],
    retailSettlementAllocationPacks: [],
    retailCommerceConflictResolutions: [],
    retailSettlementWithholdingEvidence: [],
    retailOcrProviderProfiles: [],
    retailPurchaseOcrMappings: [],
    retailCommercePushBatches: [],
    retailCommerceConformanceCases: [],
    retailPurchaseExceptions: [],
    retailCutoverPlans: [],
    statutoryAdapters: [],
    statutoryOperations: [],
    consolidatedEwayBills: [],
    digitalSignatureEvidence: [],
    portalReconciliationRuns: [],
    providerConnectors: [],
    providerConformanceCases: [],
    providerPreflightEvidence: [],
    providerSubmissions: [],
    providerReconciliationRuns: [],
    creditLimitControls: [],
    dunningCases: [],
    collectionActivities: [],
    receivableDisputes: [],
    writeOffRequests: [],
    withholdingPolicies: [],
    withholdingEntries: [],
    zeroRatedSupplyReviews: [],
    bankAccounts: [],
    bankStatementImports: [],
    bankStatementLines: [],
    purchaseRequisitions: [],
    suppliers: [],
    requestForQuotations: [],
    supplierQuotations: [],
    purchaseOrders: [],
    goodsReceipts: [],
    landedCostAllocations: [],
    supplierInvoices: [],
    threeWayMatches: [],
    treasuryPositions: [],
    cashForecastRuns: [],
    paymentProposals: [],
    bankCharges: [],
    settlementExceptions: [],
    liquiditySweeps: [],
    workCenters: [],
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
    preventiveMaintenancePlans: [],
    maintenanceWorkOrders: [],
    bomRevisions: [],
    qualityPlans: [],
    workOrders: [],
    productionMaterialIssues: [],
    qualityInspections: [],
    nonconformances: [],
    productionOutputs: [],
    deliveryProjects: [],
    projectTasks: [],
    timeEntries: [],
    serviceAgreements: [],
    supportTickets: [],
    fieldServiceJobs: [],
    workforceProfiles: [
      { id: 'workforce-avery', number: 'EMP-26-27-00001', userId: 'user-avery', employeeCode: 'EBI-001', department: 'Delivery', jobTitle: 'Delivery Principal', employmentType: 'employee', standardDailyHours: 8, hourlyCost: 1250, fieldEligible: true, skills: ['programme leadership', 'implementation'], effectiveFrom: '2026-04-01', status: 'active', requestedBy: 'system', requestedAt: '2026-04-01T00:00:00.000Z', decidedBy: 'system', decidedAt: '2026-04-01T00:00:00.000Z', decisionRemarks: 'Seeded operating workforce profile.', version: 1 },
      { id: 'workforce-priya', number: 'EMP-26-27-00002', userId: 'user-priya', employeeCode: 'EBI-002', department: 'Finance Operations', jobTitle: 'Controls Specialist', employmentType: 'employee', standardDailyHours: 8, hourlyCost: 1050, fieldEligible: false, skills: ['controls', 'commercial review'], effectiveFrom: '2026-04-01', status: 'active', requestedBy: 'system', requestedAt: '2026-04-01T00:00:00.000Z', decidedBy: 'system', decidedAt: '2026-04-01T00:00:00.000Z', decisionRemarks: 'Seeded operating workforce profile.', version: 1 },
      { id: 'workforce-lee', number: 'EMP-26-27-00003', userId: 'user-lee', employeeCode: 'EBI-003', department: 'Service Delivery', jobTitle: 'Field Systems Specialist', employmentType: 'employee', standardDailyHours: 8, hourlyCost: 780, fieldEligible: true, skills: ['field service', 'inventory operations'], effectiveFrom: '2026-04-01', status: 'active', requestedBy: 'system', requestedAt: '2026-04-01T00:00:00.000Z', decidedBy: 'system', decidedAt: '2026-04-01T00:00:00.000Z', decisionRemarks: 'Seeded operating workforce profile.', version: 1 },
    ],
    workforceAvailabilities: [],
    workforceAllocations: [],
    projectBillingPlans: [],
    projectBillingClaims: [],
    revenueRecognitionEvents: [],
    serviceEntitlementUsage: [],
    accountingClosePeriods: [],
    projectExchangeRates: [],
    projectCurrencyProfiles: [],
    projectContractVariations: [],
    projectRetainers: [],
    retainerDrawdowns: [],
    projectResourcePlans: [],
    projectMarginReviews: [],
    employerRegistrations: [],
    payrollPolicies: [],
    payrollCompensations: [],
    benefitPlans: [],
    benefitEnrollments: [],
    payrollRuns: [],
    payrollSlips: [],
    payrollStatutoryObligations: [],
    expenseClaims: [],
    attendanceRecords: [],
    leaveTypes: [],
    leaveApplications: [],
    payrollAdjustments: [],
    taxDeclarations: [],
    payslipDeliveries: [],
  };
}

/**
 * Empty operating state for a newly provisioned India-first business.
 *
 * It retains only neutral India operating templates (INR / April financial
 * year, a country-wide routing scope, standard payment terms, and basic UOMs)
 * and removes every demo commercial, statutory, workforce, catalog, price,
 * or transaction record.  A real legal name, GSTIN, PAN, Udyam number, place
 * of supply, HSN/SAC catalogue, and commercial policy must be provided by the
 * business rather than inferred from a sample.
 */
export function createCleanRevenueOpsState(): RevenueOpsState {
  const template = createInitialRevenueOpsState();
  const nationalTerritory = template.territories.find(({ id }) => id === 'territory-national');
  if (!nationalTerritory) {
    throw new Error('Clean revenue starter requires the canonical India territory scope.');
  }

  return {
    ...template,
    profile: {
      ...template.profile,
      legalName: '',
      tradeName: '',
      gstRegistered: false,
      gstin: '',
      pan: '',
      udyamNumber: '',
      defaultStateCode: '',
      currency: 'INR',
      fiscalYearStartMonth: 4,
    },
    territories: [{
      ...nationalTerritory,
      name: 'India',
      stateCodes: [...STATE_CODES],
      managerUserId: 'user-avery',
    }],
    assignmentRules: [],
    assignments: [],
    segments: [],
    productInterests: [],
    taxCodes: [],
    products: [],
    priceLists: [],
    priceListEntries: [],
    priceListApprovalRequests: [],
    discountPolicies: [],
    quoteApprovalRequests: [],
    salesOrders: [],
    fulfilmentTasks: [],
    quoteDocuments: [],
    paymentTerms: template.paymentTerms.map((term) => ({ ...term })),
    deliveryEvidence: [],
    serviceMilestones: [],
    invoices: [],
    creditDebitNotes: [],
    receivables: [],
    paymentReceipts: [],
    journalDrafts: [],
    invoiceDocuments: [],
    gstRegistrations: [],
    placeOfSupplyReviews: [],
    stockLocations: [],
    stockPositions: [],
    stockMovements: [],
    stockReservations: [],
    shipmentPackages: [],
    shipmentEvents: [],
    carrierAdapters: [],
    pincodeServiceabilityRules: [],
    deliveryPromises: [],
    codCollectionCases: [],
    returnAuthorizations: [],
    statutoryExchanges: [],
    uoms: template.uoms.map((uom) => ({
      ...uom,
      scope: { ...template.scope },
    })),
    uomConversions: [],
    inventoryItems: [],
    itemVariants: [],
    warehouses: [],
    warehouseZones: [],
    storageBins: [],
    inventoryBatches: [],
    serialUnits: [],
    binBalances: [],
    inventoryCostLayers: [],
    inventoryLedger: [],
    warehouseTasks: [],
    inventoryTransfers: [],
    cycleCountPlans: [],
    reorderPolicies: [],
    reorderProposals: [],
    inventoryValuationReviews: [],
    inventoryDispositions: [],
    retailCounters: [],
    retailCashierShifts: [],
    retailSales: [],
    retailOfflineSaleQueue: [],
    retailOfflineSyncReceipts: [],
    retailUnifiedOrderIngestion: { orders: [], conflicts: [], reservationIntents: [], hubHandoffs: [], fulfilmentHandoffs: [], stockReservationExecutions: [], pickTaskExecutions: [], shipmentPackageExecutions: [], dispatchReadinessExecutions: [], carrierDispatchExecutions: [], deliveryExecutions: [], rtoReconciliationExecutions: [], returnReconciliationExecutions: [], carrierCallbackEvidence: [], reconciliationRequirements: [] },
    retailDeviceTransportEvidence: [],
    retailDevicePreflightEvidence: [],
    retailDeviceAdapterProfiles: [],
    retailReturns: [],
    retailExchanges: [],
    retailCreditNoteReconciliations: [],
    retailInterBranchTransfers: [],
    retailScaleProfiles: [],
    retailPrinterAdapters: [],
    retailLabelPrintDispatches: [],
    retailCatalogBulkEdits: [],
    retailStoreCredits: [],
    retailCatalogCategories: [],
    retailCatalogBrands: [],
    retailMerchandisingProfiles: [],
    retailBarcodeSequences: [],
    retailLabelPrintRuns: [],
    retailProductCombos: [],
    retailPurchaseOcrDocuments: [],
    retailCommerceConnectors: [],
    retailCommerceSyncRuns: [],
    retailCommerceOrders: [],
    retailCommerceCatalogMappings: [],
    retailSettlementReconciliations: [],
    retailSettlementAllocationPacks: [],
    retailCommerceConflictResolutions: [],
    retailSettlementWithholdingEvidence: [],
    retailOcrProviderProfiles: [],
    retailPurchaseOcrMappings: [],
    retailCommercePushBatches: [],
    retailCommerceConformanceCases: [],
    retailPurchaseExceptions: [],
    retailCutoverPlans: [],
    statutoryAdapters: [],
    statutoryOperations: [],
    consolidatedEwayBills: [],
    digitalSignatureEvidence: [],
    portalReconciliationRuns: [],
    providerConnectors: [],
    providerConformanceCases: [],
    providerPreflightEvidence: [],
    providerSubmissions: [],
    providerReconciliationRuns: [],
    creditLimitControls: [],
    dunningCases: [],
    collectionActivities: [],
    receivableDisputes: [],
    writeOffRequests: [],
    withholdingPolicies: [],
    withholdingEntries: [],
    zeroRatedSupplyReviews: [],
    bankAccounts: [],
    bankStatementImports: [],
    bankStatementLines: [],
    purchaseRequisitions: [],
    suppliers: [],
    requestForQuotations: [],
    supplierQuotations: [],
    purchaseOrders: [],
    goodsReceipts: [],
    landedCostAllocations: [],
    supplierInvoices: [],
    threeWayMatches: [],
    treasuryPositions: [],
    cashForecastRuns: [],
    paymentProposals: [],
    bankCharges: [],
    settlementExceptions: [],
    liquiditySweeps: [],
    workCenters: [],
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
    preventiveMaintenancePlans: [],
    maintenanceWorkOrders: [],
    bomRevisions: [],
    qualityPlans: [],
    workOrders: [],
    productionMaterialIssues: [],
    qualityInspections: [],
    nonconformances: [],
    productionOutputs: [],
    deliveryProjects: [],
    projectTasks: [],
    timeEntries: [],
    serviceAgreements: [],
    supportTickets: [],
    fieldServiceJobs: [],
    workforceProfiles: [],
    workforceAvailabilities: [],
    workforceAllocations: [],
    projectBillingPlans: [],
    projectBillingClaims: [],
    revenueRecognitionEvents: [],
    serviceEntitlementUsage: [],
    accountingClosePeriods: [],
    projectExchangeRates: [],
    projectCurrencyProfiles: [],
    projectContractVariations: [],
    projectRetainers: [],
    retainerDrawdowns: [],
    projectResourcePlans: [],
    projectMarginReviews: [],
    employerRegistrations: [],
    payrollPolicies: [],
    payrollCompensations: [],
    benefitPlans: [],
    benefitEnrollments: [],
    payrollRuns: [],
    payrollSlips: [],
    payrollStatutoryObligations: [],
    expenseClaims: [],
    attendanceRecords: [],
    leaveTypes: [],
    leaveApplications: [],
    payrollAdjustments: [],
    taxDeclarations: [],
    payslipDeliveries: [],
  };
}

export function updateIndiaProfile(state: RevenueOpsState, input: UpdateIndiaProfileInput): RevenueOpsState {
  if (state.profile.version !== input.expectedVersion) throw new Error('The India business profile changed. Refresh and retry.');
  if (!isIndiaStateCode(input.defaultStateCode)) throw new Error('Select a supported India state code.');
  const gstin = input.gstRegistered ? validateGstin(input.gstin, input.defaultStateCode) : '';
  const pan = input.pan.trim().toUpperCase();
  if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) throw new Error('PAN must contain five letters, four digits, and a final letter.');
  if (input.primaryBankAccountId && !state.bankAccounts.some(({ id, active }) => id === input.primaryBankAccountId && active)) throw new Error('Primary bank account must be an active INR account in the current branch.');
  const profile = { ...state.profile, legalName: clean(input.legalName, 'Legal name'), tradeName: clean(input.tradeName, 'Trade name'), gstRegistered: input.gstRegistered, gstin, pan, udyamNumber: input.udyamNumber.trim().toUpperCase().slice(0, 40), defaultStateCode: input.defaultStateCode, version: state.profile.version + 1 };
  profile.primaryBankAccountId = input.primaryBankAccountId || undefined;
  return { ...state, revision: state.revision + 1, profile };
}

export function createTerritory(state: RevenueOpsState, input: CreateTerritoryInput, activeUserIds: string[], id: string = crypto.randomUUID()): RevenueOpsState {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,15}$/.test(code)) throw new Error('Territory code must use letters, numbers, and dashes.');
  if (state.territories.some((territory) => territory.code === code)) throw new Error('Territory code already exists.');
  if (!activeUserIds.includes(input.managerUserId)) throw new Error('Territory manager must be an active user.');
  const stateCodes = [...new Set(input.stateCodes)];
  if (!stateCodes.length || stateCodes.some((stateCode) => !isIndiaStateCode(stateCode))) throw new Error('Territory requires supported India state codes.');
  const territory: Territory = { id, code, name: clean(input.name, 'Territory name'), region: input.region, stateCodes, managerUserId: input.managerUserId, active: true, version: 1 };
  return { ...state, revision: state.revision + 1, territories: [...state.territories, territory] };
}

export function createAssignmentRule(state: RevenueOpsState, input: CreateAssignmentRuleInput, activeUserIds: string[], id: string = crypto.randomUUID()): RevenueOpsState {
  if (!state.territories.some(({ id: territoryId, active }) => territoryId === input.territoryId && active)) throw new Error('Active territory not found.');
  if (!activeUserIds.includes(input.assigneeUserId)) throw new Error('Assignee must be an active user.');
  if (!Number.isInteger(input.priority) || input.priority < 1 || input.priority > 1000) throw new Error('Rule priority must be between 1 and 1000.');
  if (input.field === 'value' && input.operator !== 'gte') throw new Error('Value routing rules must use the at-least operator.');
  if (input.field !== 'value' && input.operator === 'gte') throw new Error('Only value routing rules can use the at-least operator.');
  if (input.field === 'stateCode') {
    const values = input.value.split(',').map((value) => value.trim());
    if (values.some((value) => !isIndiaStateCode(value))) throw new Error('State routing rule contains an unsupported state code.');
  }
  const rule: AssignmentRule = { id, name: clean(input.name, 'Assignment rule'), field: input.field, operator: input.operator, value: input.value.trim(), territoryId: input.territoryId, assigneeUserId: input.assigneeUserId, priority: input.priority, active: true, version: 1 };
  return { ...state, revision: state.revision + 1, assignmentRules: [...state.assignmentRules, rule] };
}

function ruleMatches(rule: AssignmentRule, input: Pick<CreateIndiaOpportunityInput, 'stateCode' | 'source' | 'value'>): boolean {
  const candidate = rule.field === 'value' ? input.value : rule.field === 'stateCode' ? input.stateCode : input.source;
  if (rule.operator === 'gte') return Number(candidate) >= Number(rule.value);
  if (rule.operator === 'in') return rule.value.split(',').map((value) => value.trim().toLowerCase()).includes(String(candidate).toLowerCase());
  return String(candidate).toLowerCase() === rule.value.toLowerCase();
}

export function resolveOpportunityAssignment(state: RevenueOpsState, input: Pick<CreateIndiaOpportunityInput, 'stateCode' | 'source' | 'value'>, activeUserIds: string[]): { territoryId: string; assigneeUserId: string; source: 'automatic' } {
  const rule = [...state.assignmentRules].filter(({ active }) => active).sort((left, right) => right.priority - left.priority).find((candidate) => ruleMatches(candidate, input) && activeUserIds.includes(candidate.assigneeUserId));
  if (rule) return { territoryId: rule.territoryId, assigneeUserId: rule.assigneeUserId, source: 'automatic' };
  const territory = state.territories.find(({ active, region, stateCodes }) => active && region !== 'national' && stateCodes.includes(input.stateCode)) ?? state.territories.find(({ active, region }) => active && region === 'national');
  if (!territory) throw new Error('No active territory can receive this opportunity.');
  return { territoryId: territory.id, assigneeUserId: activeUserIds.includes(territory.managerUserId) ? territory.managerUserId : activeUserIds[0] ?? territory.managerUserId, source: 'automatic' };
}

export function registerIndiaOpportunity(state: RevenueOpsState, input: RegisterIndiaOpportunityInput, id: string = crypto.randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  if (!isIndiaStateCode(input.stateCode)) throw new Error('Opportunity requires a supported India state code.');
  if (!state.territories.some(({ id: territoryId, active }) => territoryId === input.territoryId && active)) throw new Error('Assigned territory is not active.');
  if (state.assignments.some(({ opportunityId }) => opportunityId === input.opportunityId)) throw new Error('Opportunity assignment already exists.');
  if (input.quantity <= 0 || input.unitPrice < 0 || input.gstRate < 0 || input.gstRate > 100) throw new Error('Product quantity, value, or GST rate is invalid.');
  const assignment: OpportunityAssignment = { id, opportunityId: input.opportunityId, territoryId: input.territoryId, assigneeUserId: input.assignedUserId, source: input.assignmentSource, assignedAt: now, version: 1 };
  const catalogProduct = state.products.find(({ active, kind, taxCodeId }) => active && kind === input.productKind && state.taxCodes.some(({ id, code, reviewStatus }) => id === taxCodeId && code === input.hsnSac.trim() && reviewStatus === 'verified'));
  const interest: ProductInterest = { id: crypto.randomUUID(), opportunityId: input.opportunityId, accountId: input.accountId, name: clean(input.productName, 'Product interest'), kind: input.productKind, hsnSac: input.hsnSac.trim(), quantity: input.quantity, unitPrice: money(input.unitPrice), gstRate: input.gstRate, notes: 'Captured during opportunity creation', catalogProductId: catalogProduct?.id, version: 1 };
  return { ...state, revision: state.revision + 1, assignments: [...state.assignments, assignment], productInterests: [...state.productInterests, interest] };
}

export function bulkAssignOpportunities(state: RevenueOpsState, input: BulkAssignInput, context: RevenueOpsContext, now = new Date().toISOString()): RevenueOpsState {
  if (!input.opportunityIds.length || input.opportunityIds.length > 500) throw new Error('Select between 1 and 500 opportunities.');
  if (!state.territories.some(({ id, active }) => id === input.territoryId && active)) throw new Error('Active territory not found.');
  if (!context.activeUserIds.includes(input.assigneeUserId)) throw new Error('Assignee must be an active user.');
  if (input.opportunityIds.some((id) => !context.opportunities.some((opportunity) => opportunity.id === id))) throw new Error('Bulk assignment includes an unknown opportunity.');
  if (input.opportunityIds.some((id) => context.opportunities.find((opportunity) => opportunity.id === id)?.version !== input.expectedVersions[id])) throw new Error('A selected opportunity changed. Refresh and retry the bulk action.');
  const selected = new Set(input.opportunityIds);
  const retained = state.assignments.filter(({ opportunityId }) => !selected.has(opportunityId));
  const assigned = input.opportunityIds.map((opportunityId) => ({ id: crypto.randomUUID(), opportunityId, territoryId: input.territoryId, assigneeUserId: input.assigneeUserId, source: 'manual' as const, assignedAt: now, version: 1 }));
  return { ...state, revision: state.revision + 1, assignments: [...retained, ...assigned] };
}

export function createAudienceSegment(state: RevenueOpsState, input: CreateAudienceSegmentInput, id: string = crypto.randomUUID()): RevenueOpsState {
  if (input.stateCodes.some((code) => !isIndiaStateCode(code))) throw new Error('Segment contains an unsupported state code.');
  if (input.territoryIds.some((id) => !state.territories.some((territory) => territory.id === id))) throw new Error('Segment contains an unknown territory.');
  if (input.minimumOpportunityValue < 0) throw new Error('Minimum opportunity value cannot be negative.');
  const segment: AudienceSegment = { id, name: clean(input.name, 'Segment name'), resource: input.resource, stateCodes: [...new Set(input.stateCodes)], industries: [...new Set(input.industries.map((value) => value.trim()).filter(Boolean))], relationships: [...new Set(input.relationships)], territoryIds: [...new Set(input.territoryIds)], minimumOpportunityValue: input.minimumOpportunityValue, shared: input.shared, active: true, version: 1 };
  return { ...state, revision: state.revision + 1, segments: [...state.segments, segment] };
}

function resolveSegment(segment: AudienceSegment, state: RevenueOpsState, context: RevenueOpsContext): ResolvedAudienceSegment {
  const accountMatches = (accountId: string) => {
    const account = context.accounts.find(({ id }) => id === accountId);
    if (!account) return false;
    const stateMatch = !segment.stateCodes.length || context.addresses.some((address) => address.accountId === account.id && segment.stateCodes.includes(address.region));
    const industryMatch = !segment.industries.length || segment.industries.some((industry) => account.industry.toLowerCase().includes(industry.toLowerCase()));
    const relationshipMatch = !segment.relationships.length || segment.relationships.includes(account.relationship);
    return stateMatch && industryMatch && relationshipMatch;
  };
  let memberIds: string[] = [];
  if (segment.resource === 'account') memberIds = context.accounts.filter(({ id }) => accountMatches(id)).map(({ id }) => id);
  if (segment.resource === 'contact') memberIds = context.contacts.filter(({ accountId }) => Boolean(accountId && accountMatches(accountId))).map(({ id }) => id);
  if (segment.resource === 'opportunity') memberIds = context.opportunities.filter((opportunity) => {
    const assignment = state.assignments.find(({ opportunityId }) => opportunityId === opportunity.id);
    const territoryMatch = !segment.territoryIds.length || Boolean(assignment && segment.territoryIds.includes(assignment.territoryId));
    return territoryMatch && opportunity.value >= segment.minimumOpportunityValue;
  }).map(({ id }) => id);
  return { ...segment, memberIds, memberCount: memberIds.length };
}

function quoteNumber(index: number, now: string): string {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() + 1 >= 4 ? year : year - 1;
  return `QTN-${String(start).slice(-2)}-${String(start + 1).slice(-2)}-${String(index).padStart(5, '0')}`;
}

export function createQuote(state: RevenueOpsState, input: CreateQuoteInput, context: RevenueOpsContext, actorId: string, id: string = crypto.randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const opportunity = context.opportunities.find(({ id: opportunityId }) => opportunityId === input.opportunityId);
  if (!opportunity) throw new Error('Opportunity not found.');
  if (!isIndiaStateCode(input.placeOfSupplyStateCode)) throw new Error('Select a supported place-of-supply state code.');
  if (input.validUntil <= now.slice(0, 10)) throw new Error('Quotation validity must end in the future.');
  const interests = state.productInterests.filter(({ opportunityId }) => opportunityId === opportunity.id);
  if (!interests.length) throw new Error('Add a product interest before creating a quotation.');
  const accountId = interests[0]!.accountId;
  if (!context.accounts.some(({ id: candidateId, status }) => candidateId === accountId && status === 'active')) throw new Error('Active quotation account not found.');
  if (input.contactId && !context.contacts.some(({ id: contactId, accountId: contactAccountId, status }) => contactId === input.contactId && contactAccountId === accountId && status === 'active')) throw new Error('Quotation contact must belong to the account.');
  let recipientGstin = '';
  if (input.recipientTreatment === 'registered') recipientGstin = validateGstin(input.recipientGstin, input.placeOfSupplyStateCode);
  const pricingAsOf = now.slice(0, 10);
  const activeOn = (from: string, to?: string) => from <= pricingAsOf && (!to || to >= pricingAsOf);
  const priceList = input.priceListId ? state.priceLists.find(({ id, status, active, effectiveFrom, effectiveTo }) => id === input.priceListId && status === 'active' && active && activeOn(effectiveFrom, effectiveTo)) : undefined;
  if (input.priceListId && !priceList) throw new Error('The selected price list is not effective on the quotation date.');
  const provisionalLines = interests.map((interest) => {
    const product = interest.catalogProductId ? state.products.find(({ id, active, effectiveFrom, effectiveTo }) => id === interest.catalogProductId && active && activeOn(effectiveFrom, effectiveTo)) : undefined;
    const taxCode = product ? state.taxCodes.find(({ id, reviewStatus, effectiveFrom, effectiveTo }) => id === product.taxCodeId && reviewStatus === 'verified' && activeOn(effectiveFrom, effectiveTo)) : undefined;
    const priceEntry = priceList && product ? [...state.priceListEntries].filter(({ priceListId, productId, minimumQuantity, effectiveFrom, effectiveTo }) => priceListId === priceList.id && productId === product.id && minimumQuantity <= interest.quantity && activeOn(effectiveFrom, effectiveTo)).sort((left, right) => right.minimumQuantity - left.minimumQuantity)[0] : undefined;
    if (priceList && product && !priceEntry) throw new Error(`No effective ${priceList.name} price exists for ${product.name}.`);
    const listUnitPrice = priceEntry?.unitPrice ?? interest.unitPrice;
    return { id: crypto.randomUUID(), productInterestId: interest.id, description: product?.name ?? interest.name, hsnSac: taxCode?.code ?? interest.hsnSac, quantity: interest.quantity, unitPrice: listUnitPrice, taxableValue: money(interest.quantity * listUnitPrice), gstRate: taxCode?.gstRate ?? interest.gstRate, catalogProductId: product?.id, taxCodeId: taxCode?.id, priceListEntryId: priceEntry?.id, listUnitPrice, discountAmount: 0 } satisfies QuoteLine;
  });
  const subtotal = money(provisionalLines.reduce((total, line) => total + line.taxableValue, 0));
  const selectedPolicies = [...new Set(input.discountPolicyIds ?? [])].map((id) => state.discountPolicies.find((policy) => policy.id === id)).filter((policy): policy is NonNullable<typeof policy> => Boolean(policy && policy.active && activeOn(policy.effectiveFrom, policy.effectiveTo)));
  if (selectedPolicies.length !== new Set(input.discountPolicyIds ?? []).size) throw new Error('A selected discount policy is missing or not effective.');
  const calculated = selectedPolicies.map((policy) => {
    const basis = policy.scope === 'product' ? provisionalLines.filter(({ catalogProductId }) => catalogProductId === policy.productId).reduce((total, line) => total + line.taxableValue, 0) : subtotal;
    if (basis < policy.minimumTaxableValue) return { policy, amount: 0 };
    const raw = policy.method === 'percentage' ? basis * policy.value / 100 : policy.value;
    return { policy, amount: money(Math.min(raw, policy.maximumDiscountAmount || raw)) };
  }).filter(({ amount }) => amount > 0);
  const stackable = calculated.filter(({ policy }) => policy.stackable);
  const bestExclusive = calculated.filter(({ policy }) => !policy.stackable).sort((left, right) => right.amount - left.amount)[0];
  const discountTotal = money(stackable.reduce((total, item) => total + item.amount, 0) + (bestExclusive?.amount ?? 0));
  let allocatedDiscount = 0;
  const lines: QuoteLine[] = provisionalLines.map((line, index) => {
    const discountAmount = index === provisionalLines.length - 1 ? money(discountTotal - allocatedDiscount) : money(subtotal ? discountTotal * line.taxableValue / subtotal : 0);
    allocatedDiscount = money(allocatedDiscount + discountAmount);
    return { ...line, discountAmount, unitPrice: money((line.taxableValue - discountAmount) / line.quantity), taxableValue: money(line.taxableValue - discountAmount) };
  });
  const taxableValue = money(lines.reduce((total, line) => total + line.taxableValue, 0));
  const totalTax = state.profile.gstRegistered ? money(lines.reduce((total, line) => total + line.taxableValue * line.gstRate / 100, 0)) : 0;
  const intraState = input.recipientTreatment !== 'export' && state.profile.defaultStateCode === input.placeOfSupplyStateCode;
  const cgst = intraState ? money(totalTax / 2) : 0;
  const sgst = intraState ? money(totalTax - cgst) : 0;
  const igst = intraState ? 0 : totalTax;
  const quote: QuoteDraft = { id, number: quoteNumber(state.quotes.length + 1, now), opportunityId: opportunity.id, accountId, contactId: input.contactId, placeOfSupplyStateCode: input.placeOfSupplyStateCode, recipientTreatment: input.recipientTreatment, recipientGstin, currency: 'INR', status: 'draft', validUntil: input.validUntil, lines, taxPreview: { treatment: intraState ? 'intra-state' : 'inter-state', taxableValue, cgst, sgst, igst, totalTax, grandTotal: money(taxableValue + totalTax), determination: 'commercial-estimate' }, priceListId: priceList?.id, discountPolicyIds: selectedPolicies.map(({ id }) => id), subtotal, discountTotal, pricingAsOf, revisionNumber: 1, createdBy: actorId, createdAt: now, scope: structuredClone(state.scope), version: 1 };
  return { ...state, revision: state.revision + 1, quotes: [quote, ...state.quotes] };
}

const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = { draft: [], submitted: [], approved: [], rejected: ['draft'], converted: [] };

export function transitionQuote(state: RevenueOpsState, input: TransitionQuoteInput): RevenueOpsState {
  const quote = state.quotes.find(({ id }) => id === input.id);
  if (!quote) throw new Error('Quotation not found.');
  if (quote.version !== input.expectedVersion) throw new Error('The quotation changed. Refresh and retry.');
  if (!QUOTE_TRANSITIONS[quote.status].includes(input.toStatus)) throw new Error(`Quotation cannot move from ${quote.status} to ${input.toStatus}.`);
  const updated = { ...quote, status: input.toStatus, version: quote.version + 1 };
  return { ...state, revision: state.revision + 1, quotes: state.quotes.map((candidate) => candidate.id === updated.id ? updated : candidate) };
}

export function getRevenueOpsSnapshot(state: RevenueOpsState, context: RevenueOpsContext, generatedAt = new Date().toISOString()): RevenueOpsSnapshot {
  const segments = state.segments.map((segment) => resolveSegment(segment, state, context));
  const territoryPerformance = state.territories.map((territory) => {
    const ids = new Set(state.assignments.filter(({ territoryId }) => territoryId === territory.id).map(({ opportunityId }) => opportunityId));
    const opportunities = context.opportunities.filter(({ id, currency }) => ids.has(id) && currency === 'INR');
    return { territoryId: territory.id, pipelineValue: opportunities.reduce((total, opportunity) => total + opportunity.value, 0), weightedValue: opportunities.reduce((total, opportunity) => total + opportunity.value * opportunity.probability / 100, 0), opportunityCount: opportunities.length, atRiskCount: opportunities.filter(({ health }) => health === 'at-risk').length };
  });
  const assignedIds = new Set(state.assignments.map(({ opportunityId }) => opportunityId));
  const assignedOpportunities = context.opportunities.filter(({ id }) => assignedIds.has(id));
  const indiaOpportunities = assignedOpportunities.filter(({ currency }) => currency === 'INR');
  return {
    revision: state.revision,
    generatedAt,
    scope: structuredClone(state.scope),
    readProjection: { companyId: state.scope.companyId, branchId: state.scope.branchId, hiddenCollections: [], redactedFields: {}, redactedMetrics: [] },
    profile: structuredClone(state.profile),
    territories: structuredClone(state.territories),
    assignmentRules: structuredClone(state.assignmentRules),
    assignments: structuredClone(state.assignments),
    segments,
    productInterests: structuredClone(state.productInterests),
    quotes: structuredClone(state.quotes),
    taxCodes: structuredClone(state.taxCodes),
    products: structuredClone(state.products),
    priceLists: structuredClone(state.priceLists),
    priceListEntries: structuredClone(state.priceListEntries),
    priceListApprovalRequests: structuredClone(state.priceListApprovalRequests),
    discountPolicies: structuredClone(state.discountPolicies),
    quoteApprovalRequests: structuredClone(state.quoteApprovalRequests),
    salesOrders: structuredClone(state.salesOrders),
    fulfilmentTasks: structuredClone(state.fulfilmentTasks),
    quoteDocuments: structuredClone(state.quoteDocuments),
    paymentTerms: structuredClone(state.paymentTerms),
    deliveryEvidence: structuredClone(state.deliveryEvidence),
    serviceMilestones: structuredClone(state.serviceMilestones),
    invoices: structuredClone(state.invoices),
    creditDebitNotes: structuredClone(state.creditDebitNotes),
    receivables: structuredClone(state.receivables),
    paymentReceipts: structuredClone(state.paymentReceipts),
    journalDrafts: structuredClone(state.journalDrafts),
    invoiceDocuments: structuredClone(state.invoiceDocuments),
    gstRegistrations: structuredClone(state.gstRegistrations),
    placeOfSupplyReviews: structuredClone(state.placeOfSupplyReviews),
    stockLocations: structuredClone(state.stockLocations),
    stockPositions: structuredClone(state.stockPositions),
    stockMovements: structuredClone(state.stockMovements),
    stockReservations: structuredClone(state.stockReservations),
    shipmentPackages: structuredClone(state.shipmentPackages),
    shipmentEvents: structuredClone(state.shipmentEvents),
    carrierAdapters: structuredClone(state.carrierAdapters),
    pincodeServiceabilityRules: structuredClone(state.pincodeServiceabilityRules),
    deliveryPromises: structuredClone(state.deliveryPromises),
    codCollectionCases: structuredClone(state.codCollectionCases),
    returnAuthorizations: structuredClone(state.returnAuthorizations),
    statutoryExchanges: structuredClone(state.statutoryExchanges),
    uoms: structuredClone(state.uoms),
    uomConversions: structuredClone(state.uomConversions),
    inventoryItems: structuredClone(state.inventoryItems),
    itemVariants: structuredClone(state.itemVariants),
    warehouses: structuredClone(state.warehouses),
    warehouseZones: structuredClone(state.warehouseZones),
    storageBins: structuredClone(state.storageBins),
    inventoryBatches: structuredClone(state.inventoryBatches),
    serialUnits: structuredClone(state.serialUnits),
    binBalances: structuredClone(state.binBalances),
    inventoryCostLayers: structuredClone(state.inventoryCostLayers),
    inventoryLedger: structuredClone(state.inventoryLedger),
    warehouseTasks: structuredClone(state.warehouseTasks),
    inventoryTransfers: structuredClone(state.inventoryTransfers),
    cycleCountPlans: structuredClone(state.cycleCountPlans),
    reorderPolicies: structuredClone(state.reorderPolicies),
    reorderProposals: structuredClone(state.reorderProposals),
    inventoryValuationReviews: structuredClone(state.inventoryValuationReviews),
    inventoryDispositions: structuredClone(state.inventoryDispositions),
    retailCounters: structuredClone(state.retailCounters),
    retailCashierShifts: structuredClone(state.retailCashierShifts),
    retailSales: structuredClone(state.retailSales),
    retailOfflineSaleQueue: structuredClone(state.retailOfflineSaleQueue ?? []),
    retailOfflineSyncReceipts: structuredClone(state.retailOfflineSyncReceipts ?? []),
    retailUnifiedOrderIngestion: structuredClone(state.retailUnifiedOrderIngestion ?? { orders: [], conflicts: [], reservationIntents: [], hubHandoffs: [], fulfilmentHandoffs: [], stockReservationExecutions: [], pickTaskExecutions: [], shipmentPackageExecutions: [], dispatchReadinessExecutions: [], carrierDispatchExecutions: [], deliveryExecutions: [], rtoReconciliationExecutions: [], returnReconciliationExecutions: [], carrierCallbackEvidence: [], reconciliationRequirements: [] }),
    retailDeviceTransportEvidence: structuredClone(state.retailDeviceTransportEvidence ?? []),
    retailDevicePreflightEvidence: structuredClone(state.retailDevicePreflightEvidence ?? []),
    retailDeviceAdapterProfiles: structuredClone(state.retailDeviceAdapterProfiles ?? []),
    retailReturns: structuredClone(state.retailReturns),
    retailExchanges: structuredClone(state.retailExchanges ?? []),
    retailCreditNoteReconciliations: structuredClone(state.retailCreditNoteReconciliations ?? []),
    retailInterBranchTransfers: structuredClone(state.retailInterBranchTransfers ?? []),
    retailScaleProfiles: structuredClone(state.retailScaleProfiles ?? []),
    retailPrinterAdapters: structuredClone(state.retailPrinterAdapters ?? []),
    retailLabelPrintDispatches: structuredClone(state.retailLabelPrintDispatches ?? []),
    retailCatalogBulkEdits: structuredClone(state.retailCatalogBulkEdits ?? []),
    retailStoreCredits: structuredClone(state.retailStoreCredits),
    retailCatalogCategories: structuredClone(state.retailCatalogCategories),
    retailCatalogBrands: structuredClone(state.retailCatalogBrands),
    retailMerchandisingProfiles: structuredClone(state.retailMerchandisingProfiles),
    retailBarcodeSequences: structuredClone(state.retailBarcodeSequences),
    retailLabelPrintRuns: structuredClone(state.retailLabelPrintRuns),
    retailProductCombos: structuredClone(state.retailProductCombos ?? []),
    retailLoyaltyAccounts: structuredClone(state.retailLoyaltyAccounts ?? []),
    retailLoyaltyLedger: structuredClone(state.retailLoyaltyLedger ?? []),
    retailVouchers: structuredClone(state.retailVouchers ?? []),
    retailCustomerVisits: structuredClone(state.retailCustomerVisits ?? []),
    retailSalesCommissions: structuredClone(state.retailSalesCommissions ?? []),
    retailCommissionPayoutBatches: structuredClone(state.retailCommissionPayoutBatches ?? []),
    retailPromotionRedemptions: structuredClone(state.retailPromotionRedemptions ?? []),
    retailPurchaseOcrDocuments: structuredClone(state.retailPurchaseOcrDocuments ?? []),
    retailCommerceConnectors: structuredClone(state.retailCommerceConnectors ?? []),
    retailCommerceSyncRuns: structuredClone(state.retailCommerceSyncRuns ?? []),
    retailCommerceOrders: structuredClone(state.retailCommerceOrders ?? []),
    retailCommerceCatalogMappings: structuredClone(state.retailCommerceCatalogMappings ?? []),
    retailSettlementReconciliations: structuredClone(state.retailSettlementReconciliations ?? []),
    retailSettlementAllocationPacks: structuredClone(state.retailSettlementAllocationPacks ?? []),
    retailCommerceConflictResolutions: structuredClone(state.retailCommerceConflictResolutions ?? []),
    retailSettlementWithholdingEvidence: structuredClone(state.retailSettlementWithholdingEvidence ?? []),
    retailOcrProviderProfiles: structuredClone(state.retailOcrProviderProfiles ?? []),
    retailPurchaseOcrMappings: structuredClone(state.retailPurchaseOcrMappings ?? []),
    retailCommercePushBatches: structuredClone(state.retailCommercePushBatches ?? []),
    retailCommerceConformanceCases: structuredClone(state.retailCommerceConformanceCases ?? []),
    retailPurchaseExceptions: structuredClone(state.retailPurchaseExceptions ?? []),
    statutoryAdapters: structuredClone(state.statutoryAdapters),
    statutoryOperations: structuredClone(state.statutoryOperations),
    consolidatedEwayBills: structuredClone(state.consolidatedEwayBills),
    digitalSignatureEvidence: structuredClone(state.digitalSignatureEvidence),
    portalReconciliationRuns: structuredClone(state.portalReconciliationRuns),
    providerConnectors: structuredClone(state.providerConnectors),
    providerConformanceCases: structuredClone(state.providerConformanceCases),
    providerPreflightEvidence: structuredClone(state.providerPreflightEvidence ?? []),
    providerSubmissions: structuredClone(state.providerSubmissions),
    providerReconciliationRuns: structuredClone(state.providerReconciliationRuns),
    creditLimitControls: structuredClone(state.creditLimitControls),
    dunningCases: structuredClone(state.dunningCases),
    collectionActivities: structuredClone(state.collectionActivities),
    receivableDisputes: structuredClone(state.receivableDisputes),
    writeOffRequests: structuredClone(state.writeOffRequests),
    withholdingPolicies: structuredClone(state.withholdingPolicies),
    withholdingEntries: structuredClone(state.withholdingEntries),
    zeroRatedSupplyReviews: structuredClone(state.zeroRatedSupplyReviews),
    bankAccounts: structuredClone(state.bankAccounts),
    bankStatementImports: structuredClone(state.bankStatementImports),
    bankStatementLines: structuredClone(state.bankStatementLines),
    purchaseRequisitions: structuredClone(state.purchaseRequisitions),
    suppliers: structuredClone(state.suppliers),
    requestForQuotations: structuredClone(state.requestForQuotations),
    supplierQuotations: structuredClone(state.supplierQuotations),
    purchaseOrders: structuredClone(state.purchaseOrders),
    goodsReceipts: structuredClone(state.goodsReceipts),
    landedCostAllocations: structuredClone(state.landedCostAllocations),
    supplierInvoices: structuredClone(state.supplierInvoices),
    threeWayMatches: structuredClone(state.threeWayMatches),
    treasuryPositions: structuredClone(state.treasuryPositions),
    cashForecastRuns: structuredClone(state.cashForecastRuns),
    paymentProposals: structuredClone(state.paymentProposals),
    bankCharges: structuredClone(state.bankCharges),
    settlementExceptions: structuredClone(state.settlementExceptions),
    liquiditySweeps: structuredClone(state.liquiditySweeps),
    workCenters: structuredClone(state.workCenters),
    assetCategories: structuredClone(state.assetCategories),
    managedAssets: structuredClone(state.managedAssets),
    assetCapitalizations: structuredClone(state.assetCapitalizations),
    assetDepreciationPolicies: structuredClone(state.assetDepreciationPolicies),
    assetDepreciationRuns: structuredClone(state.assetDepreciationRuns),
    assetRetirements: structuredClone(state.assetRetirements),
    assetCustodyTransfers: structuredClone(state.assetCustodyTransfers),
    assetComponentizations: structuredClone(state.assetComponentizations),
    assetComponentAllocations: structuredClone(state.assetComponentAllocations),
    assetTransferAccountings: structuredClone(state.assetTransferAccountings),
    assetSaleDisposals: structuredClone(state.assetSaleDisposals),
    assetImpairmentReviews: structuredClone(state.assetImpairmentReviews),
    assetRevaluations: structuredClone(state.assetRevaluations),
    assetWarranties: structuredClone(state.assetWarranties),
    assetAmcContracts: structuredClone(state.assetAmcContracts),
    assetMeters: structuredClone(state.assetMeters),
    assetMeterReadings: structuredClone(state.assetMeterReadings),
    correctiveMaintenanceRequests: structuredClone(state.correctiveMaintenanceRequests),
    assetCalibrations: structuredClone(state.assetCalibrations),
    assetSpareParts: structuredClone(state.assetSpareParts),
    assetSpareIssues: structuredClone(state.assetSpareIssues),
    fleetVehicles: structuredClone(state.fleetVehicles),
    fleetTrips: structuredClone(state.fleetTrips),
    assetInstalledBaseEvents: structuredClone(state.assetInstalledBaseEvents),
    preventiveMaintenancePlans: structuredClone(state.preventiveMaintenancePlans),
    maintenanceWorkOrders: structuredClone(state.maintenanceWorkOrders),
    bomRevisions: structuredClone(state.bomRevisions),
    qualityPlans: structuredClone(state.qualityPlans),
    workOrders: structuredClone(state.workOrders),
    productionMaterialIssues: structuredClone(state.productionMaterialIssues),
    qualityInspections: structuredClone(state.qualityInspections),
    nonconformances: structuredClone(state.nonconformances),
    productionOutputs: structuredClone(state.productionOutputs),
    deliveryProjects: structuredClone(state.deliveryProjects),
    projectTasks: structuredClone(state.projectTasks),
    timeEntries: structuredClone(state.timeEntries),
    serviceAgreements: structuredClone(state.serviceAgreements),
    supportTickets: structuredClone(state.supportTickets),
    fieldServiceJobs: structuredClone(state.fieldServiceJobs),
    workforceProfiles: structuredClone(state.workforceProfiles),
    workforceAvailabilities: structuredClone(state.workforceAvailabilities),
    workforceAllocations: structuredClone(state.workforceAllocations),
    projectBillingPlans: structuredClone(state.projectBillingPlans),
    projectBillingClaims: structuredClone(state.projectBillingClaims),
    revenueRecognitionEvents: structuredClone(state.revenueRecognitionEvents),
    serviceEntitlementUsage: structuredClone(state.serviceEntitlementUsage),
    accountingClosePeriods: structuredClone(state.accountingClosePeriods),
    projectExchangeRates: structuredClone(state.projectExchangeRates),
    projectCurrencyProfiles: structuredClone(state.projectCurrencyProfiles),
    projectContractVariations: structuredClone(state.projectContractVariations),
    projectRetainers: structuredClone(state.projectRetainers),
    retainerDrawdowns: structuredClone(state.retainerDrawdowns),
    projectResourcePlans: structuredClone(state.projectResourcePlans),
    projectMarginReviews: structuredClone(state.projectMarginReviews),
    employerRegistrations: structuredClone(state.employerRegistrations),
    payrollPolicies: structuredClone(state.payrollPolicies),
    payrollCompensations: structuredClone(state.payrollCompensations),
    benefitPlans: structuredClone(state.benefitPlans),
    benefitEnrollments: structuredClone(state.benefitEnrollments),
    payrollRuns: structuredClone(state.payrollRuns),
    payrollSlips: structuredClone(state.payrollSlips),
    payrollStatutoryObligations: structuredClone(state.payrollStatutoryObligations),
    expenseClaims: structuredClone(state.expenseClaims),
    attendanceRecords: structuredClone(state.attendanceRecords),
    leaveTypes: structuredClone(state.leaveTypes),
    leaveApplications: structuredClone(state.leaveApplications),
    payrollAdjustments: structuredClone(state.payrollAdjustments),
    taxDeclarations: structuredClone(state.taxDeclarations),
    payslipDeliveries: structuredClone(state.payslipDeliveries),
    territoryPerformance,
    metrics: {
      assignedCoverage: context.opportunities.length ? Math.round(assignedOpportunities.length / context.opportunities.length * 100) : 0,
      indiaPipeline: indiaOpportunities.reduce((total, opportunity) => total + opportunity.value, 0),
      quoteValue: state.quotes.filter(({ status }) => status !== 'rejected').reduce((total, quote) => total + quote.taxPreview.grandTotal, 0),
      segmentReach: new Set(segments.flatMap(({ memberIds }) => memberIds).map((id) => id)).size,
      atRiskValue: indiaOpportunities.filter(({ health }) => health === 'at-risk').reduce((total, opportunity) => total + opportunity.value, 0),
      pendingApprovals: state.quoteApprovalRequests.filter(({ status }) => status === 'pending').length,
      confirmedOrderValue: state.salesOrders.filter(({ status }) => status !== 'cancelled').reduce((total, order) => total + order.taxPreview.grandTotal, 0),
      fulfilmentCompletion: state.fulfilmentTasks.length ? Math.round(state.fulfilmentTasks.filter(({ status }) => status === 'completed').length / state.fulfilmentTasks.length * 100) : 0,
      billedValue: state.invoices.filter(({ status }) => status !== 'draft' && status !== 'cancelled').reduce((total, invoice) => total + invoice.taxPreview.grandTotal, 0),
      outstandingReceivables: state.receivables.reduce((total, item) => total + item.outstandingAmount, 0),
      overdueReceivables: state.receivables.filter(({ dueDate, status }) => dueDate < generatedAt.slice(0, 10) && status !== 'paid').reduce((total, item) => total + item.outstandingAmount, 0),
      unappliedCash: state.paymentReceipts.filter(({ status }) => status !== 'reversed').reduce((total, receipt) => total + receipt.unappliedAmount, 0),
      availableStock: state.stockPositions.reduce((total, position) => total + position.available, 0),
      reservedStock: state.stockPositions.reduce((total, position) => total + position.reserved, 0),
      activeShipments: state.shipmentPackages.filter(({ status }) => !['delivered', 'returned', 'cancelled'].includes(status)).length,
      statutoryExceptions: state.statutoryExchanges.filter(({ status }) => status === 'failed').length,
      inventoryValue: money(state.binBalances.reduce((total, balance) => total + balance.inventoryValue, 0) + state.inventoryValuationReviews.filter(({ status }) => status === 'approved').reduce((total, review) => total + review.adjustmentAmount, 0)),
      expiringQuantity: state.binBalances.filter((balance) => {
        const batch = balance.batchId ? state.inventoryBatches.find(({ id }) => id === balance.batchId) : undefined;
        if (!batch?.expiresAt) return false;
        const days = (Date.parse(batch.expiresAt) - Date.parse(generatedAt)) / 86400000;
        return days >= 0 && days <= 30;
      }).reduce((total, balance) => total + balance.quantity, 0),
      countVariance: state.cycleCountPlans.flatMap(({ lines }) => lines).reduce((total, line) => total + Math.abs(line.varianceQuantity ?? 0), 0),
      reorderAlerts: state.reorderProposals.filter(({ status }) => status === 'proposed').length,
      warehouseTaskBacklog: state.warehouseTasks.filter(({ status }) => ['planned', 'in-progress', 'blocked'].includes(status)).length,
      statutoryCredentialGaps: state.statutoryAdapters.filter(({ active, credentialStatus }) => active && credentialStatus === 'missing').length,
      portalDrift: state.statutoryExchanges.filter(({ reconciliationState }) => ['drift', 'missing', 'error'].includes(reconciliationState ?? '')).length,
      expiringEwayBills: state.statutoryExchanges.filter(({ kind, status, validUntil }) => kind === 'e-way-bill' && status === 'acknowledged' && validUntil && Date.parse(validUntil) >= Date.parse(generatedAt) && Date.parse(validUntil) - Date.parse(generatedAt) <= 86400000).length,
      unverifiedSignatures: state.statutoryExchanges.filter(({ status, id }) => status === 'acknowledged' && !state.digitalSignatureEvidence.some(({ exchangeId, verified }) => exchangeId === id && verified)).length,
      creditLimitBreaches: state.creditLimitControls.filter(({ status }) => status === 'approved').filter((control) => state.receivables.filter(({ accountId, status }) => accountId === control.accountId && !['paid', 'written-off'].includes(status)).reduce((total, receivable) => total + receivable.outstandingAmount, 0) > control.creditLimit).length,
      collectionsAtRisk: money(state.receivables.filter(({ dueDate, status }) => dueDate < generatedAt.slice(0, 10) && !['paid', 'written-off'].includes(status)).reduce((total, receivable) => total + receivable.outstandingAmount, 0)),
      openDisputes: state.receivableDisputes.filter(({ status }) => ['open', 'under-review'].includes(status)).length,
      pendingWriteOffs: state.writeOffRequests.filter(({ status }) => status === 'pending').length,
      withholdingOpen: state.withholdingEntries.filter(({ status }) => status !== 'reconciled').length,
      zeroRatedPending: state.zeroRatedSupplyReviews.filter(({ status }) => status === 'pending').length,
      bankUnmatched: state.bankStatementLines.filter(({ matchStatus }) => ['unmatched', 'suggested'].includes(matchStatus)).length,
      requisitionsAwaitingApproval: state.purchaseRequisitions.filter(({ status }) => status === 'submitted').length,
      supplierQualificationPending: state.suppliers.filter(({ status }) => status === 'pending').length,
      rfqInMarket: state.requestForQuotations.filter(({ status }) => status === 'issued').length,
      purchaseOrderCommitment: money(state.purchaseOrders.filter(({ status }) => ['approved', 'partially-received'].includes(status)).reduce((total, order) => total + order.totalAmount, 0)),
      receiptAwaitingCost: state.goodsReceipts.filter(({ status }) => status === 'cost-pending').length,
      threeWayVariance: state.threeWayMatches.filter(({ status }) => status === 'variance-review').length,
      liquidityAvailable: money(state.bankAccounts.filter(({ active }) => active).reduce((total, account) => {
        const position = state.treasuryPositions.filter((item) => item.bankAccountId === account.id && item.asOfDate <= generatedAt.slice(0, 10)).sort((left, right) => `${right.asOfDate}${right.recordedAt}`.localeCompare(`${left.asOfDate}${left.recordedAt}`))[0];
        const statement = state.bankStatementImports.filter((item) => item.bankAccountId === account.id && item.status === 'committed' && item.periodTo <= generatedAt.slice(0, 10)).sort((left, right) => `${right.periodTo}${right.committedAt ?? ''}`.localeCompare(`${left.periodTo}${left.committedAt ?? ''}`))[0];
        return total + (position?.availableBalance ?? statement?.closingBalance ?? 0);
      }, 0)),
      forecastLowPoint: state.cashForecastRuns[0]?.lowPoint ?? 0,
      paymentAwaitingApproval: state.paymentProposals.filter(({ status }) => status === 'submitted').length,
      paymentAwaitingRelease: state.paymentProposals.filter(({ status }) => status === 'approved').length,
      settlementExceptionsOpen: state.settlementExceptions.filter(({ status }) => ['open', 'under-review'].includes(status)).length,
      bankChargesMonth: money(state.bankCharges.filter(({ chargeDate }) => chargeDate.slice(0, 7) === generatedAt.slice(0, 7)).reduce((total, charge) => total + charge.amount, 0)),
      productionReleased: state.workOrders.filter(({ status }) => status === 'released').length,
      productionInProgress: state.workOrders.filter(({ status }) => ['in-progress', 'quality-hold'].includes(status)).length,
      capacityLoadPercent: state.workCenters.length ? Math.round(state.workOrders.filter(({ status }) => ['released', 'in-progress', 'quality-hold'].includes(status)).flatMap(({ operations }) => operations).reduce((total, operation) => total + operation.plannedMinutes, 0) / state.workCenters.reduce((total, center) => total + center.capacityMinutesPerDay * center.efficiencyPercent / 100, 0) * 100) : 0,
      qualityHolds: state.workOrders.filter(({ status }) => status === 'quality-hold').length,
      openNonconformances: state.nonconformances.filter(({ status }) => status === 'open').length,
      productionOutputValue: money(state.productionOutputs.reduce((total, output) => total + output.quantity * output.unitCost, 0)),
      activeProjects: state.deliveryProjects.filter(({ status }) => ['active', 'on-hold'].includes(status)).length,
      projectBudgetAtRisk: state.deliveryProjects.filter(({ status }) => ['active', 'on-hold'].includes(status)).filter((project) => state.projectTasks.filter(({ projectId }) => projectId === project.id).reduce((total, task) => total + task.actualApprovedHours, 0) > project.plannedHours * 0.9).length,
      approvedBillableHours: hoursForSnapshot(state.timeEntries.filter(({ status, billable }) => status === 'approved' && billable)),
      supportOpen: state.supportTickets.filter(({ status }) => !['resolved', 'closed', 'cancelled'].includes(status)).length,
      slaBreaches: state.supportTickets.filter(({ status, responseDueAt, resolutionDueAt, respondedAt }) => !['resolved', 'closed', 'cancelled'].includes(status) && ((!respondedAt && responseDueAt < generatedAt) || resolutionDueAt < generatedAt)).length,
      fieldJobsActive: state.fieldServiceJobs.filter(({ status }) => ['planned', 'dispatched', 'on-site'].includes(status)).length,
      fieldJobsCompleted: state.fieldServiceJobs.filter(({ status }) => status === 'completed').length,
      activeWorkforce: state.workforceProfiles.filter(({ status }) => status === 'active').length,
      fieldEligibleWorkforce: state.workforceProfiles.filter(({ status, fieldEligible }) => status === 'active' && fieldEligible).length,
      approvedUnavailableHours: hoursForSnapshot(state.workforceAvailabilities.filter(({ status, kind }) => status === 'approved' && kind !== 'working').map((entry) => ({ hours: Math.max(0, (state.workforceProfiles.find(({ id }) => id === entry.workforceProfileId)?.standardDailyHours ?? 0) - entry.availableHours) }))),
      reservedWorkforceHours: hoursForSnapshot(state.workforceAllocations.filter(({ status }) => status === 'reserved').map(({ allocatedHours }) => ({ hours: allocatedHours }))),
      approvedDeliveryCost: money(state.timeEntries.filter(({ status }) => status === 'approved').reduce((total, entry) => total + entry.costAmount, 0)),
      activeBillingPlans: state.projectBillingPlans.filter(({ status }) => status === 'active').length,
      recognizedUnbilledRevenue: money(state.projectBillingClaims.filter(({ status }) => status === 'recognized').reduce((total, claim) => total + claim.recognizedAmount, 0)),
      entitlementHoursRemaining: hoursForSnapshot(state.serviceAgreements.filter(({ status }) => status === 'active').map((agreement) => ({ hours: Math.max(0, agreement.includedHours - state.serviceEntitlementUsage.filter(({ serviceAgreementId }) => serviceAgreementId === agreement.id).reduce((total, usage) => total + usage.hours, 0)) }))),
      entitlementOverageHours: hoursForSnapshot(state.serviceEntitlementUsage.filter(({ status }) => status === 'overage').map(({ hours }) => ({ hours }))),
      closePeriodsPending: state.accountingClosePeriods.filter(({ status }) => status === 'submitted').length,
      closedClosePeriods: state.accountingClosePeriods.filter(({ status }) => status === 'closed').length,
      projectVariationsAwaitingApproval: state.projectContractVariations.filter(({ status }) => status === 'submitted').length,
      activeRetainerValue: money(state.projectRetainers.filter(({ status }) => status === 'active').reduce((total, retainer) => total + retainer.contractAmountInr, 0)),
      retainerDrawdownsAwaitingReview: state.retainerDrawdowns.filter(({ status }) => status === 'submitted').length,
      activeResourcePlans: state.projectResourcePlans.filter(({ status }) => status === 'active').length,
      projectMarginAtRisk: state.projectMarginReviews.filter(({ status, forecastMarginInr }) => status === 'reviewed' && forecastMarginInr < 0).length,
      foreignCurrencyProjects: state.projectCurrencyProfiles.filter(({ status, contractCurrency }) => status === 'active' && contractCurrency !== 'INR').length,
      projectFxRateGaps: state.projectCurrencyProfiles.filter(({ status, contractCurrency, exchangeRateId }) => status === 'active' && contractCurrency !== 'INR' && !state.projectExchangeRates.some((rate) => rate.id === exchangeRateId && rate.status === 'verified')).length,
      payrollAwaitingApproval: state.payrollRuns.filter(({ status }) => status === 'submitted').length,
      payrollFinalizedThisMonth: state.payrollRuns.filter(({ status, finalizedAt }) => status === 'finalized' && finalizedAt?.slice(0, 7) === generatedAt.slice(0, 7)).length,
      payrollNetPayThisMonth: money(state.payrollRuns.filter(({ status, finalizedAt }) => status === 'finalized' && finalizedAt?.slice(0, 7) === generatedAt.slice(0, 7)).reduce((total, run) => total + run.totalNetPay, 0)),
      statutoryObligationsOpen: state.payrollStatutoryObligations.filter(({ status }) => status !== 'reconciled').length,
      expensesAwaitingApproval: state.expenseClaims.filter(({ status }) => status === 'submitted').length,
      expensesAwaitingReimbursement: state.expenseClaims.filter(({ status }) => status === 'approved').length,
      activeBenefitEnrollments: state.benefitEnrollments.filter(({ status }) => status === 'active').length,
      attendanceAwaitingReview: state.attendanceRecords.filter(({ statusReview }) => statusReview === 'submitted').length,
      leaveAwaitingReview: state.leaveApplications.filter(({ status }) => status === 'submitted').length,
      approvedLeaveDaysThisYear: state.leaveApplications.filter(({ status, startDate }) => status === 'approved' && startDate.slice(0, 4) === generatedAt.slice(0, 4)).reduce((total, leave) => total + leave.dayCount, 0),
      payrollAdjustmentsAwaitingApproval: state.payrollAdjustments.filter(({ status }) => status === 'submitted').length,
      taxDeclarationsAwaitingReview: state.taxDeclarations.filter(({ status }) => status === 'submitted').length,
      releasedPayslipsUndelivered: state.payrollSlips.filter(({ status }) => status === 'released').filter((slip) => !state.payslipDeliveries.some((delivery) => delivery.payrollSlipId === slip.id && delivery.status === 'acknowledged')).length,
      providerCredentialGaps: state.providerConnectors.filter((connector) => connector.active && providerCredentialLifecycle(connector, generatedAt) !== 'configured').length,
      providerConformanceGaps: state.providerConnectors.filter(({ active, conformanceStatus, environment }) => active && conformanceStatus !== (environment === 'production' ? 'production-approved' : 'sandbox-verified')).length,
      providerHandoffsAwaitingEvidence: state.providerSubmissions.filter(({ status }) => status === 'handed-off').length,
      providerReconciliationExceptions: state.providerReconciliationRuns.flatMap(({ items }) => items).filter(({ result }) => result !== 'matched').length,
    },
  };
}

export function getOpportunityForRevenue(context: RevenueOpsContext, id: string): Opportunity | undefined {
  return context.opportunities.find((opportunity) => opportunity.id === id);
}
