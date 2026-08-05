import { createHash, randomUUID } from 'node:crypto';
import type {
  AssetCapitalization,
  AssetBookValue,
  AssetDepreciationPolicy,
  AssetDepreciationRun,
  AssetCustodyTransfer,
  AssetComponentization,
  AssetComponentAllocation,
  AssetTransferAccounting,
  AssetSaleDisposal,
  AssetRetirement,
  AssetMaintenanceScopedReference,
  AssetMaintenanceState,
  AssetCategory,
  CompleteMaintenanceWorkOrderInput,
  CreateAssetCapitalizationInput,
  CreateAssetDepreciationPolicyInput,
  CreateAssetDepreciationRunInput,
  CreateAssetCustodyTransferInput,
  CreateAssetComponentizationInput,
  CreateAssetComponentAllocationInput,
  CreateAssetRetirementInput,
  CreateAssetCategoryInput,
  CreateManagedAssetInput,
  CreatePreventiveMaintenancePlanInput,
  DecideAssetCapitalizationInput,
  DecideAssetDepreciationPolicyInput,
  DecideAssetDepreciationRunInput,
  DecideAssetCustodyTransferInput,
  DecideAssetComponentizationInput,
  DecideAssetComponentAllocationInput,
  CreateAssetTransferAccountingInput,
  DecideAssetTransferAccountingInput,
  DispatchAssetTransferAccountingInput,
  ReceiveAssetTransferAccountingInput,
  CreateAssetSaleDisposalInput,
  DecideAssetSaleDisposalInput,
  CompleteAssetSaleDisposalInput,
  AssetImpairmentReview,
  CreateAssetImpairmentReviewInput,
  DecideAssetImpairmentReviewInput,
  CompleteAssetImpairmentReviewInput,
  AssetRevaluation,
  CreateAssetRevaluationInput,
  DecideAssetRevaluationInput,
  CompleteAssetRevaluationInput,
  AssetWarranty,
  CreateAssetWarrantyInput,
  UpdateAssetWarrantyStatusInput,
  AssetAmcContract,
  CreateAssetAmcContractInput,
  DecideAssetAmcContractInput,
  UpdateAssetAmcStatusInput,
  AssetMeter,
  CreateAssetMeterInput,
  RecordAssetMeterReadingInput,
  CorrectiveMaintenanceRequest,
  CorrectiveMaintenanceStatus,
  CreateCorrectiveMaintenanceInput,
  TransitionCorrectiveMaintenanceInput,
  AssetCalibrationRecord,
  CreateAssetCalibrationInput,
  DecideAssetCalibrationInput,
  AssetSparePart,
  CreateAssetSparePartInput,
  IssueAssetSpareInput,
  FleetVehicle,
  CreateFleetVehicleInput,
  UpdateFleetVehicleInput,
  FleetTrip,
  CreateFleetTripInput,
  CompleteFleetTripInput,
  DecideAssetRetirementInput,
  CompleteAssetRetirementInput,
  ReceiveAssetCustodyTransferInput,
  DecideManagedAssetInput,
  GenerateDueMaintenanceWorkOrderInput,
  MaintenanceWorkOrder,
  ManagedAsset,
  PreventiveMaintenancePlan,
  StartMaintenanceWorkOrderInput,
  SubmitManagedAssetInput,
  VerifyMaintenanceWorkOrderInput,
} from '../shared/assets-maintenance-contracts';
import type { AccountingJournalDraft, OperatingRecordScope } from '../shared/revenue-ops-contracts';

const MAX_INTERVAL_DAYS = 36_500;
const MAX_MINUTES = 1_000_000;

function clean(value: string, label: string, minimum = 2, maximum = 240): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  }
  return normalized;
}

function dateOnly(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function positiveInteger(value: number, label: string, maximum: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${label} must be a whole number from 1-${maximum}.`);
  }
  return value;
}

function fiscalNumber(prefix: string, sequence: number, at: string): string {
  const date = new Date(at);
  const startYear = date.getUTCMonth() >= 3
    ? date.getUTCFullYear()
    : date.getUTCFullYear() - 1;
  return `${prefix}-${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}-${String(sequence).padStart(5, '0')}`;
}

function sameScope(left: OperatingRecordScope, right: OperatingRecordScope): boolean {
  return left.companyId === right.companyId && left.branchId === right.branchId;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function positiveMoney(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 9_000_000_000_000) {
    throw new Error(`${label} must be a positive amount within the supported range.`);
  }
  const normalized = money(value);
  if (Math.abs(normalized - value) > 0.000001) {
    throw new Error(`${label} must use no more than two decimal places.`);
  }
  return normalized;
}

function handoffChecksum(source: Pick<AccountingJournalDraft, 'sourceType' | 'sourceId' | 'sourceNumber' | 'postingDate' | 'lines'>): string {
  const lines = source.lines.map((line) => ({
    ...line,
    debit: money(line.debit),
    credit: money(line.credit),
  }));
  const unsigned = {
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceNumber: source.sourceNumber,
    postingDate: source.postingDate,
    lines,
    totalDebit: money(lines.reduce((total, line) => total + line.debit, 0)),
    totalCredit: money(lines.reduce((total, line) => total + line.credit, 0)),
  };
  return createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
}

function mutate<S extends AssetMaintenanceState>(state: S): S {
  const next = structuredClone(state) as S;
  next.revision += 1;
  return next;
}

function assertReferenceScope(
  state: AssetMaintenanceState,
  reference: AssetMaintenanceScopedReference | undefined,
  label: string,
): void {
  if (!reference || !reference.active || !reference.scope || !sameScope(reference.scope, state.scope)) {
    throw new Error(`${label} must be active and belong to the current company and branch.`);
  }
}

function assetFor<S extends AssetMaintenanceState>(state: S, id: string): ManagedAsset {
  const asset = state.managedAssets.find((candidate) => candidate.id === id);
  if (!asset || !sameScope(asset.scope, state.scope)) {
    throw new Error('Asset was not found in the current company and branch.');
  }
  return asset;
}

function planFor<S extends AssetMaintenanceState>(state: S, id: string): PreventiveMaintenancePlan {
  const plan = state.preventiveMaintenancePlans.find((candidate) => candidate.id === id);
  if (!plan || !sameScope(plan.scope, state.scope)) {
    throw new Error('Preventive maintenance plan was not found in the current company and branch.');
  }
  return plan;
}

function workOrderFor<S extends AssetMaintenanceState>(state: S, id: string): MaintenanceWorkOrder {
  const workOrder = state.maintenanceWorkOrders.find((candidate) => candidate.id === id);
  if (!workOrder || !sameScope(workOrder.scope, state.scope)) {
    throw new Error('Maintenance work order was not found in the current company and branch.');
  }
  return workOrder;
}

function capitalizationFor<S extends AssetMaintenanceState>(state: S, id: string): AssetCapitalization {
  const capitalization = state.assetCapitalizations.find((candidate) => candidate.id === id);
  if (!capitalization || !sameScope(capitalization.scope, state.scope)) {
    throw new Error('Asset capitalisation request was not found in the current company and branch.');
  }
  return capitalization;
}

function depreciationPolicyFor<S extends AssetMaintenanceState>(state: S, id: string): AssetDepreciationPolicy {
  const policy = state.assetDepreciationPolicies.find((candidate) => candidate.id === id);
  if (!policy || !sameScope(policy.scope, state.scope)) {
    throw new Error('Asset depreciation policy was not found in the current company and branch.');
  }
  return policy;
}

function depreciationRunFor<S extends AssetMaintenanceState>(state: S, id: string): AssetDepreciationRun {
  const run = state.assetDepreciationRuns.find((candidate) => candidate.id === id);
  if (!run || !sameScope(run.scope, state.scope)) {
    throw new Error('Asset depreciation run was not found in the current company and branch.');
  }
  return run;
}

function retirementFor<S extends AssetMaintenanceState>(state: S, id: string): AssetRetirement {
  const retirement = state.assetRetirements.find((candidate) => candidate.id === id);
  if (!retirement || !sameScope(retirement.scope, state.scope)) {
    throw new Error('Asset retirement was not found in the current company and branch.');
  }
  return retirement;
}

function custodyTransferFor<S extends AssetMaintenanceState>(state: S, id: string): AssetCustodyTransfer {
  const transfer = state.assetCustodyTransfers.find((candidate) => candidate.id === id);
  if (!transfer || !sameScope(transfer.scope, state.scope)) {
    throw new Error('Asset custody transfer was not found in the current company and branch.');
  }
  return transfer;
}

function componentizationFor<S extends AssetMaintenanceState>(state: S, id: string): AssetComponentization {
  const componentization = state.assetComponentizations.find((candidate) => candidate.id === id);
  if (!componentization || !sameScope(componentization.scope, state.scope)) {
    throw new Error('Asset componentisation was not found in the current company and branch.');
  }
  return componentization;
}

function componentAllocationFor<S extends AssetMaintenanceState>(state: S, id: string): AssetComponentAllocation {
  const allocation = state.assetComponentAllocations.find((item) => item.id === id);
  if (!allocation) throw new Error('Asset component allocation was not found in the active company and branch.');
  return allocation;
}

function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function monthEnd(value: string): string {
  const date = new Date(`${monthStart(value)}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

function monthIndex(serviceDate: string, periodEnd: string): number {
  const service = new Date(`${monthStart(serviceDate)}T00:00:00.000Z`);
  const period = new Date(`${monthStart(periodEnd)}T00:00:00.000Z`);
  return ((period.getUTCFullYear() - service.getUTCFullYear()) * 12) + period.getUTCMonth() - service.getUTCMonth() + 1;
}

function scheduledDepreciation(cost: number, residualValuePercent: number, usefulLifeMonths: number, serviceMonth: number): { residualValue: number; depreciationAmount: number } {
  const residualMinor = Math.round((cost * residualValuePercent / 100) * 100);
  const depreciableMinor = Math.round(cost * 100) - residualMinor;
  const base = Math.floor(depreciableMinor / usefulLifeMonths);
  const remainder = depreciableMinor % usefulLifeMonths;
  const depreciationMinor = serviceMonth <= remainder ? base + 1 : base;
  return { residualValue: residualMinor / 100, depreciationAmount: depreciationMinor / 100 };
}

function invoiceTaxableAmount(invoice: AssetMaintenanceState['supplierInvoices'][number]): number {
  return money(invoice.lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0));
}

export function createAssetCategory<S extends AssetMaintenanceState>(
  state: S,
  input: CreateAssetCategoryInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): S {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,19}$/.test(code)) {
    throw new Error('Asset category code must contain 2-20 uppercase letters, numbers, or dashes.');
  }
  if (state.assetCategories.some((category) => category.code === code && sameScope(category.scope, state.scope))) {
    throw new Error('Asset category code already exists in this company and branch.');
  }
  const interval = input.defaultMaintenanceIntervalDays === undefined
    ? undefined
    : positiveInteger(input.defaultMaintenanceIntervalDays, 'Default maintenance interval', MAX_INTERVAL_DAYS);
  const next = mutate(state);
  const category: AssetCategory = {
    id,
    code,
    name: clean(input.name, 'Asset category name'),
    description: input.description?.trim()
      ? clean(input.description, 'Asset category description', 4, 500)
      : undefined,
    defaultCriticality: input.defaultCriticality,
    defaultMaintenanceIntervalDays: interval,
    active: true,
    createdBy: actorId,
    createdAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  };
  next.assetCategories.unshift(category);
  return next;
}

export function createManagedAsset<S extends AssetMaintenanceState>(
  state: S,
  input: CreateManagedAssetInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): S {
  const category = state.assetCategories.find((candidate) => candidate.id === input.categoryId && candidate.active);
  if (!category || !sameScope(category.scope, state.scope)) {
    throw new Error('Asset requires an active category in the current company and branch.');
  }
  const assetTag = input.assetTag.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(assetTag)) {
    throw new Error('Asset tag must contain 2-40 uppercase letters, numbers, or dashes.');
  }
  if (state.managedAssets.some((asset) => asset.assetTag === assetTag && sameScope(asset.scope, state.scope))) {
    throw new Error('Asset tag already exists in this company and branch.');
  }
  const serialNumber = input.serialNumber?.trim().toUpperCase();
  if (serialNumber && state.managedAssets.some((asset) => asset.serialNumber === serialNumber && sameScope(asset.scope, state.scope))) {
    throw new Error('Asset serial number already exists in this company and branch.');
  }
  const acquiredOn = dateOnly(input.acquiredOn, 'Acquisition date');
  const availableForUseOn = dateOnly(input.availableForUseOn, 'Available-for-use date');
  if (availableForUseOn < acquiredOn) {
    throw new Error('Available-for-use date cannot precede acquisition date.');
  }
  const warrantyExpiresOn = input.warrantyExpiresOn === undefined
    ? undefined
    : dateOnly(input.warrantyExpiresOn, 'Warranty expiry date');
  if (warrantyExpiresOn && warrantyExpiresOn < availableForUseOn) {
    throw new Error('Warranty expiry cannot precede the available-for-use date.');
  }
  if (input.warehouseId) {
    assertReferenceScope(state, state.warehouses.find((warehouse) => warehouse.id === input.warehouseId), 'Asset warehouse');
  }
  if (input.workCenterId) {
    assertReferenceScope(state, state.workCenters.find((workCenter) => workCenter.id === input.workCenterId), 'Asset work center');
  }
  const next = mutate(state);
  const asset: ManagedAsset = {
    id,
    number: fiscalNumber('AST', state.managedAssets.length + 1, now),
    assetTag,
    categoryId: category.id,
    name: clean(input.name, 'Asset name'),
    manufacturer: input.manufacturer?.trim()
      ? clean(input.manufacturer, 'Manufacturer', 2, 120)
      : undefined,
    model: input.model?.trim() ? clean(input.model, 'Model', 2, 120) : undefined,
    serialNumber,
    sourceType: input.sourceType,
    sourceEvidenceReference: clean(input.sourceEvidenceReference, 'Asset source evidence reference', 4, 160),
    acquiredOn,
    availableForUseOn,
    warrantyExpiresOn,
    warehouseId: input.warehouseId,
    workCenterId: input.workCenterId,
    custodyLabel: clean(input.custodyLabel, 'Asset custody location', 2, 160),
    criticality: input.criticality ?? category.defaultCriticality,
    financialStatus: 'unbooked',
    status: 'draft',
    createdBy: actorId,
    createdAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  };
  next.managedAssets.unshift(asset);
  return next;
}

export function submitManagedAsset<S extends AssetMaintenanceState>(
  state: S,
  input: SubmitManagedAssetInput,
  actorId: string,
  now = new Date().toISOString(),
): S {
  const asset = assetFor(state, input.id);
  if (asset.status !== 'draft' || asset.version !== input.expectedVersion) {
    throw new Error('Asset is stale or is not available for submission.');
  }
  if (asset.createdBy !== actorId) {
    throw new Error('Only the asset maker can submit the current asset draft.');
  }
  const next = mutate(state);
  next.managedAssets = next.managedAssets.map((candidate) => candidate.id === asset.id
    ? { ...candidate, status: 'submitted', submittedBy: actorId, submittedAt: now, version: candidate.version + 1 }
    : candidate);
  return next;
}

export function decideManagedAsset<S extends AssetMaintenanceState>(
  state: S,
  input: DecideManagedAssetInput,
  actorId: string,
  now = new Date().toISOString(),
): S {
  const asset = assetFor(state, input.id);
  if (asset.status !== 'submitted' || asset.version !== input.expectedVersion) {
    throw new Error('Asset is stale or is no longer awaiting independent approval.');
  }
  if (asset.createdBy === actorId || asset.submittedBy === actorId) {
    throw new Error('Asset maker cannot decide the same asset.');
  }
  const next = mutate(state);
  next.managedAssets = next.managedAssets.map((candidate) => candidate.id === asset.id
    ? {
        ...candidate,
        status: input.decision,
        decidedBy: actorId,
        decidedAt: now,
        decisionRemarks: clean(input.remarks, 'Asset decision remarks', 4, 500),
        version: candidate.version + 1,
      }
    : candidate);
  return next;
}

/**
 * Binds an in-service operational asset to the exact approved procurement
 * chain that funded it. The amount is deliberately the recoverable-GST-free
 * taxable amount. One supplier invoice may be allocated over several assets,
 * but submitted requests reserve their amount to prevent double allocation.
 */
export function createAssetCapitalization<S extends AssetMaintenanceState>(
  state: S,
  input: CreateAssetCapitalizationInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): S {
  const asset = assetFor(state, input.assetId);
  if (asset.status !== 'in-service' || asset.financialStatus !== 'unbooked') {
    throw new Error('Asset capitalisation requires an in-service operational asset that is not already in a financial lifecycle.');
  }
  if (asset.sourceType !== 'procurement-evidence') {
    throw new Error('Asset capitalisation currently requires an asset registered from procurement evidence.');
  }
  if (state.assetCapitalizations.some((item) => item.assetId === asset.id && item.status !== 'rejected' && sameScope(item.scope, state.scope))) {
    throw new Error('This asset already has an active capitalisation request.');
  }

  const invoice = state.supplierInvoices.find((item) => item.id === input.supplierInvoiceId && sameScope(item.scope ?? state.scope, state.scope));
  const match = invoice
    ? state.threeWayMatches.find((item) => item.supplierInvoiceId === invoice.id && sameScope(item.scope ?? state.scope, state.scope))
    : undefined;
  const purchaseOrder = invoice
    ? state.purchaseOrders.find((item) => item.id === invoice.purchaseOrderId && sameScope(item.scope ?? state.scope, state.scope))
    : undefined;
  const receipt = invoice
    ? state.goodsReceipts.find((item) => item.id === invoice.goodsReceiptId && sameScope(item.scope ?? state.scope, state.scope))
    : undefined;
  if (
    !invoice || !match || !purchaseOrder || !receipt ||
    !['matched', 'approved'].includes(match.status) ||
    match.purchaseOrderId !== purchaseOrder.id ||
    match.goodsReceiptId !== receipt.id ||
    receipt.purchaseOrderId !== purchaseOrder.id ||
    invoice.purchaseOrderId !== purchaseOrder.id ||
    invoice.goodsReceiptId !== receipt.id
  ) {
    throw new Error('Asset capitalisation requires one matched or independently approved supplier invoice, purchase order, and goods receipt chain.');
  }
  if (match.status === 'approved' && (!match.decidedBy || !match.decidedAt || match.decidedBy === match.createdBy)) {
    throw new Error('The linked three-way-match approval is not independently evidenced.');
  }

  const capitalizationDate = dateOnly(input.capitalizationDate, 'Capitalisation date');
  if (capitalizationDate < asset.availableForUseOn || capitalizationDate < invoice.invoiceDate) {
    throw new Error('Capitalisation date cannot precede the asset available-for-use date or supplier invoice date.');
  }
  const taxableAmount = positiveMoney(input.taxableAmount, 'Capitalisation amount');
  const invoiceTaxable = invoiceTaxableAmount(invoice);
  const reserved = money(state.assetCapitalizations
    .filter((item) => item.supplierInvoiceId === invoice.id && item.status !== 'rejected' && sameScope(item.scope, state.scope))
    .reduce((total, item) => total + item.taxableAmount, 0));
  if (money(reserved + taxableAmount) > invoiceTaxable) {
    throw new Error('Capitalisation amount exceeds the remaining taxable amount on the supplier invoice.');
  }

  const next = mutate(state);
  const capitalization: AssetCapitalization = {
    id,
    number: fiscalNumber('CAP', state.assetCapitalizations.length + 1, now),
    assetId: asset.id,
    supplierInvoiceId: invoice.id,
    threeWayMatchId: match.id,
    purchaseOrderId: purchaseOrder.id,
    goodsReceiptId: receipt.id,
    capitalizationDate,
    taxableAmount,
    status: 'submitted',
    requestedBy: actorId,
    requestedAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  };
  next.assetCapitalizations.unshift(capitalization);
  return next;
}

/**
 * Independent approval creates a checksum-protected source handoff. It does
 * not post the journal and it does not mutate the physical asset record into
 * a financial-book record; both are separately governed boundaries.
 */
export function decideAssetCapitalization<S extends AssetMaintenanceState>(
  state: S,
  input: DecideAssetCapitalizationInput,
  actorId: string,
  now = new Date().toISOString(),
): S {
  const capitalization = capitalizationFor(state, input.id);
  if (capitalization.status !== 'submitted' || capitalization.version !== input.expectedVersion) {
    throw new Error('Asset capitalisation request is stale or is no longer awaiting approval.');
  }
  if (capitalization.requestedBy === actorId) {
    throw new Error('Asset-capitalisation maker cannot decide the same request.');
  }
  const remarks = clean(input.remarks, 'Asset capitalisation decision remarks', 4, 500);
  const next = mutate(state);
  if (input.decision === 'rejected') {
    next.assetCapitalizations = next.assetCapitalizations.map((item) => item.id === capitalization.id
      ? { ...item, status: 'rejected', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, version: item.version + 1 }
      : item);
    return next;
  }

  const source: Omit<AccountingJournalDraft, 'id' | 'checksum'> = {
    sourceType: 'asset-capitalization',
    sourceId: capitalization.id,
    sourceNumber: capitalization.number,
    postingDate: capitalization.capitalizationDate,
    lines: [
      { accountCode: 'fixed-assets', debit: capitalization.taxableAmount, credit: 0, memo: capitalization.number },
      { accountCode: 'inventory-asset', debit: 0, credit: capitalization.taxableAmount, memo: capitalization.number },
    ],
    totalDebit: capitalization.taxableAmount,
    totalCredit: capitalization.taxableAmount,
    status: 'ready',
    version: 1,
  };
  const journal: AccountingJournalDraft = {
    id: randomUUID(),
    ...source,
    checksum: handoffChecksum(source),
  };
  next.journalDrafts.unshift(journal);
  next.assetCapitalizations = next.assetCapitalizations.map((item) => item.id === capitalization.id
    ? {
        ...item,
        status: 'approved',
        decidedBy: actorId,
        decidedAt: now,
        decisionRemarks: remarks,
        journalDraftId: journal.id,
        version: item.version + 1,
      }
    : item);
  return next;
}

/**
 * Creates a maker-submitted effective-dated straight-line policy. Asset
 * categories stay operational: their maintenance metadata is never treated as
 * an accounting policy merely because the category name looks financial.
 */
export function createAssetDepreciationPolicy<S extends AssetMaintenanceState>(
  state: S,
  input: CreateAssetDepreciationPolicyInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): S {
  const category = state.assetCategories.find((item) => item.id === input.categoryId && item.active && sameScope(item.scope, state.scope));
  if (!category) throw new Error('An active asset category in the current company and branch is required for a depreciation policy.');
  const effectiveFrom = dateOnly(input.effectiveFrom, 'Depreciation policy effective-from date');
  const usefulLifeMonths = positiveInteger(input.usefulLifeMonths, 'Useful life in months', 1_200);
  if (!Number.isFinite(input.residualValuePercent) || input.residualValuePercent < 0 || input.residualValuePercent >= 100 || Math.round(input.residualValuePercent * 100) / 100 !== input.residualValuePercent) {
    throw new Error('Residual value percent must be from 0 up to (but not including) 100, with at most two decimal places.');
  }
  if (state.assetDepreciationPolicies.some((item) => item.categoryId === category.id && item.effectiveFrom === effectiveFrom && item.status !== 'rejected' && sameScope(item.scope, state.scope))) {
    throw new Error('An active depreciation-policy proposal already exists for this category and effective date.');
  }
  const next = mutate(state);
  next.assetDepreciationPolicies.unshift({
    id,
    number: fiscalNumber('ADP', state.assetDepreciationPolicies.length + 1, now),
    categoryId: category.id,
    effectiveFrom,
    usefulLifeMonths,
    residualValuePercent: input.residualValuePercent,
    method: 'straight-line',
    convention: 'full-month',
    status: 'submitted',
    requestedBy: actorId,
    requestedAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  });
  return next;
}

export function decideAssetDepreciationPolicy<S extends AssetMaintenanceState>(
  state: S,
  input: DecideAssetDepreciationPolicyInput,
  actorId: string,
  now = new Date().toISOString(),
): S {
  const policy = depreciationPolicyFor(state, input.id);
  if (policy.status !== 'submitted' || policy.version !== input.expectedVersion) {
    throw new Error('Asset depreciation policy is stale or is no longer awaiting approval.');
  }
  if (policy.requestedBy === actorId) throw new Error('Asset-depreciation policy maker cannot decide the same policy.');
  const remarks = clean(input.remarks, 'Asset depreciation policy decision remarks', 4, 500);
  if (input.decision === 'approved' && state.assetDepreciationPolicies.some((item) => item.id !== policy.id && item.categoryId === policy.categoryId && item.effectiveFrom === policy.effectiveFrom && item.status === 'approved' && sameScope(item.scope, state.scope))) {
    throw new Error('An approved depreciation policy already controls this category and effective date.');
  }
  const next = mutate(state);
  next.assetDepreciationPolicies = next.assetDepreciationPolicies.map((item) => item.id === policy.id
    ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, version: item.version + 1 }
    : item);
  return next;
}

/**
 * Generates one monthly, full-month straight-line proposal from only the
 * asset-capitalisation sources that the injected ledger resolver confirms are
 * already posted. This keeps a ready draft or an approved request from being
 * mistaken for accounting fact.
 */
export function createAssetDepreciationRun<S extends AssetMaintenanceState>(
  state: S,
  input: CreateAssetDepreciationRunInput,
  actorId: string,
  isCapitalizationPosted: (draft: AccountingJournalDraft) => boolean,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): S {
  const periodEnd = dateOnly(input.periodEnd, 'Depreciation period end');
  if (periodEnd !== monthEnd(periodEnd)) throw new Error('Depreciation period end must be the final calendar day of its month.');
  const periodStart = monthStart(periodEnd);
  const inScope = (record: { scope: OperatingRecordScope }) => sameScope(record.scope, state.scope);
  const policies = state.assetDepreciationPolicies.filter((item) => item.status === 'approved' && inScope(item));
  type EligibleDepreciation = {
    capitalization: AssetCapitalization;
    asset: ManagedAsset;
    policy: AssetDepreciationPolicy;
    serviceMonth: number;
    residualValue: number;
    depreciationAmount: number;
    capitalizedCost: number;
    componentAllocationId?: string;
    componentId?: string;
    componentTag?: string;
  };
  const eligible: EligibleDepreciation[] = state.assetCapitalizations.flatMap((capitalization): EligibleDepreciation[] => {
    if (capitalization.status !== 'approved' || !inScope(capitalization) || !capitalization.journalDraftId) return [];
    const asset = state.managedAssets.find((item) => item.id === capitalization.assetId && inScope(item));
    const source = state.journalDrafts.find((item) => item.id === capitalization.journalDraftId);
    if (!asset || asset.status !== 'in-service' || !source || source.sourceType !== 'asset-capitalization' || source.sourceId !== capitalization.id || !isCapitalizationPosted(source)) return [];
    if (capitalization.capitalizationDate > periodEnd || asset.availableForUseOn > periodEnd) return [];
    const policy = policies
      .filter((item) => item.categoryId === asset.categoryId && item.effectiveFrom <= asset.availableForUseOn)
      .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];
    if (!policy) return [];
    const serviceMonth = monthIndex(capitalization.capitalizationDate, periodEnd);
    if (serviceMonth < 1 || serviceMonth > policy.usefulLifeMonths) return [];
    const alreadyProposed = state.assetDepreciationRuns.some((run) => run.periodEnd === periodEnd && run.status !== 'rejected' && inScope(run) && run.lines.some((line) => line.assetCapitalizationId === capitalization.id));
    if (alreadyProposed) return [];
    const allocation = state.assetComponentAllocations.find((item) => item.assetId === asset.id && item.capitalizationId === capitalization.id && item.status === 'approved' && sameScope(item.scope, state.scope));
    if (allocation) {
      return allocation.lines.flatMap((componentLine) => {
        const componentServiceMonth = monthIndex(capitalization.capitalizationDate, periodEnd);
        if (componentServiceMonth < 1 || componentServiceMonth > componentLine.usefulLifeMonths) return [];
        const { residualValue, depreciationAmount } = scheduledDepreciation(componentLine.allocatedCost, componentLine.residualValuePercent, componentLine.usefulLifeMonths, componentServiceMonth);
        return depreciationAmount > 0 ? [{ capitalization, asset, policy, serviceMonth: componentServiceMonth, residualValue, depreciationAmount, componentAllocationId: allocation.id, componentId: componentLine.componentId, componentTag: componentLine.componentTag, capitalizedCost: componentLine.allocatedCost }] : [];
      });
    }
    const { residualValue, depreciationAmount } = scheduledDepreciation(capitalization.taxableAmount, policy.residualValuePercent, policy.usefulLifeMonths, serviceMonth);
    if (depreciationAmount <= 0) return [];
    return [{ capitalization, asset, policy, serviceMonth, residualValue, depreciationAmount, capitalizedCost: capitalization.taxableAmount }];
  });
  if (!eligible.length) {
    throw new Error('No posted asset capitalisation with an approved effective depreciation policy is eligible for this period.');
  }
  const totalDepreciation = money(eligible.reduce((total, item) => total + item.depreciationAmount, 0));
  const next = mutate(state);
  next.assetDepreciationRuns.unshift({
    id,
    number: fiscalNumber('DEP', state.assetDepreciationRuns.length + 1, now),
    periodStart,
    periodEnd,
    method: 'straight-line',
    convention: 'full-month',
    totalDepreciation,
    lines: eligible.map((item) => ({
      id: randomUUID(),
      assetCapitalizationId: item.capitalization.id,
      assetId: item.asset.id,
      componentAllocationId: item.componentAllocationId,
      componentId: item.componentId,
      componentTag: item.componentTag,
      policyId: item.policy.id,
      serviceMonthIndex: item.serviceMonth,
      capitalizedCost: item.capitalizedCost,
      residualValue: item.residualValue,
      depreciationAmount: item.depreciationAmount,
    })),
    status: 'submitted',
    requestedBy: actorId,
    requestedAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  });
  return next;
}

export function decideAssetDepreciationRun<S extends AssetMaintenanceState>(
  state: S,
  input: DecideAssetDepreciationRunInput,
  actorId: string,
  now = new Date().toISOString(),
): S {
  const run = depreciationRunFor(state, input.id);
  if (run.status !== 'submitted' || run.version !== input.expectedVersion) {
    throw new Error('Asset depreciation run is stale or is no longer awaiting approval.');
  }
  if (run.requestedBy === actorId) throw new Error('Asset-depreciation run maker cannot decide the same run.');
  const remarks = clean(input.remarks, 'Asset depreciation decision remarks', 4, 500);
  const next = mutate(state);
  if (input.decision === 'rejected') {
    next.assetDepreciationRuns = next.assetDepreciationRuns.map((item) => item.id === run.id
      ? { ...item, status: 'rejected', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, version: item.version + 1 }
      : item);
    return next;
  }
  const source: Omit<AccountingJournalDraft, 'id' | 'checksum'> = {
    sourceType: 'asset-depreciation',
    sourceId: run.id,
    sourceNumber: run.number,
    postingDate: run.periodEnd,
    lines: [
      { accountCode: 'depreciation-expense', debit: run.totalDepreciation, credit: 0, memo: `${run.number} / ${run.periodEnd}` },
      { accountCode: 'accumulated-depreciation', debit: 0, credit: run.totalDepreciation, memo: `${run.number} / ${run.periodEnd}` },
    ],
    totalDebit: run.totalDepreciation,
    totalCredit: run.totalDepreciation,
    status: 'ready',
    version: 1,
  };
  const journal: AccountingJournalDraft = { id: randomUUID(), ...source, checksum: handoffChecksum(source) };
  next.journalDrafts.unshift(journal);
  next.assetDepreciationRuns = next.assetDepreciationRuns.map((item) => item.id === run.id
    ? { ...item, status: 'approved', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, journalDraftId: journal.id, version: item.version + 1 }
    : item);
  return next;
}

function validateBookValue(value: AssetBookValue | null, capitalization: AssetCapitalization): AssetBookValue {
  if (!value || value.capitalizationId !== capitalization.id ||
    money(value.grossCost) !== capitalization.taxableAmount ||
    value.accumulatedDepreciation < 0 || value.netBookValue < 0 ||
    money(value.accumulatedDepreciation + value.netBookValue) !== capitalization.taxableAmount) {
    throw new Error('The posted fixed-asset book value is unavailable or no longer reconciles to the approved capitalisation.');
  }
  return {
    ...value,
    grossCost: money(value.grossCost),
    accumulatedDepreciation: money(value.accumulatedDepreciation),
    netBookValue: money(value.netBookValue),
    asOfDate: dateOnly(value.asOfDate, 'Fixed-asset book as-of date'),
  };
}

/**
 * Proposes the no-proceeds retirement of one asset. A later commercial sale
 * must not be forced into this loss-only workflow: it needs its own customer
 * consideration and tax evidence bridge.
 */
export function createAssetRetirement<S extends AssetMaintenanceState>(
  state: S,
  input: CreateAssetRetirementInput,
  actorId: string,
  getBookValue: (capitalizationId: string) => AssetBookValue | null,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): S {
  const asset = assetFor(state, input.assetId);
  if (asset.status !== 'in-service') throw new Error('Only an in-service asset can enter the controlled retirement workflow.');
  const capitalization = state.assetCapitalizations.find((item) => item.assetId === asset.id && item.status === 'approved' && sameScope(item.scope, state.scope));
  if (!capitalization) throw new Error('Asset retirement requires one approved fixed-asset capitalisation record.');
  if (state.assetRetirements.some((item) => item.assetId === asset.id && item.status !== 'rejected' && sameScope(item.scope, state.scope))) {
    throw new Error('This asset already has an active retirement workflow.');
  }
  const book = validateBookValue(getBookValue(capitalization.id), capitalization);
  const retirementDate = dateOnly(input.retirementDate, 'Asset retirement date');
  if (retirementDate < book.asOfDate) throw new Error('Asset retirement date cannot precede the reconciled fixed-asset book as-of date.');
  const next = mutate(state);
  next.assetRetirements.unshift({
    id,
    number: fiscalNumber('RET', state.assetRetirements.length + 1, now),
    assetId: asset.id,
    capitalizationId: capitalization.id,
    retirementDate,
    reason: clean(input.reason, 'Asset retirement reason', 8, 500),
    evidenceReference: clean(input.evidenceReference, 'Asset retirement evidence reference', 4, 160),
    grossCost: book.grossCost,
    accumulatedDepreciation: book.accumulatedDepreciation,
    netBookValue: book.netBookValue,
    status: 'submitted',
    requestedBy: actorId,
    requestedAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  });
  return next;
}

export function decideAssetRetirement<S extends AssetMaintenanceState>(
  state: S,
  input: DecideAssetRetirementInput,
  actorId: string,
  getBookValue: (capitalizationId: string) => AssetBookValue | null,
  now = new Date().toISOString(),
): S {
  const retirement = retirementFor(state, input.id);
  if (retirement.status !== 'submitted' || retirement.version !== input.expectedVersion) {
    throw new Error('Asset retirement is stale or is no longer awaiting approval.');
  }
  if (retirement.requestedBy === actorId) throw new Error('Asset-retirement maker cannot decide the same request.');
  const capitalization = capitalizationFor(state, retirement.capitalizationId);
  const asset = assetFor(state, retirement.assetId);
  if (asset.status !== 'in-service' || capitalization.assetId !== asset.id || capitalization.status !== 'approved') {
    throw new Error('Asset retirement no longer resolves to an in-service asset with approved capitalisation evidence.');
  }
  const remarks = clean(input.remarks, 'Asset retirement decision remarks', 4, 500);
  const next = mutate(state);
  if (input.decision === 'rejected') {
    next.assetRetirements = next.assetRetirements.map((item) => item.id === retirement.id
      ? { ...item, status: 'rejected', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, version: item.version + 1 }
      : item);
    return next;
  }
  const book = validateBookValue(getBookValue(capitalization.id), capitalization);
  if (book.grossCost !== retirement.grossCost || book.accumulatedDepreciation !== retirement.accumulatedDepreciation || book.netBookValue !== retirement.netBookValue || retirement.retirementDate < book.asOfDate) {
    throw new Error('The fixed-asset book changed after retirement submission. Refresh the evidence and submit a new retirement request.');
  }
  const lines: AccountingJournalDraft['lines'] = [
    ...(retirement.accumulatedDepreciation > 0 ? [{ accountCode: 'accumulated-depreciation' as const, debit: retirement.accumulatedDepreciation, credit: 0, memo: retirement.number }] : []),
    ...(retirement.netBookValue > 0 ? [{ accountCode: 'asset-retirement-loss' as const, debit: retirement.netBookValue, credit: 0, memo: retirement.number }] : []),
    { accountCode: 'fixed-assets' as const, debit: 0, credit: retirement.grossCost, memo: retirement.number },
  ];
  const source: Omit<AccountingJournalDraft, 'id' | 'checksum'> = {
    sourceType: 'asset-retirement', sourceId: retirement.id, sourceNumber: retirement.number, postingDate: retirement.retirementDate,
    lines, totalDebit: retirement.grossCost, totalCredit: retirement.grossCost, status: 'ready', version: 1,
  };
  const journal: AccountingJournalDraft = { id: randomUUID(), ...source, checksum: handoffChecksum(source) };
  next.journalDrafts.unshift(journal);
  next.assetRetirements = next.assetRetirements.map((item) => item.id === retirement.id
    ? { ...item, status: 'approved', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, journalDraftId: journal.id, version: item.version + 1 }
    : item);
  return next;
}

/** Completes physical retirement only after the canonical loss journal posts. */
export function completeAssetRetirement<S extends AssetMaintenanceState>(
  state: S,
  input: CompleteAssetRetirementInput,
  actorId: string,
  isRetirementPosted: (draft: AccountingJournalDraft) => boolean,
  now = new Date().toISOString(),
): S {
  const retirement = retirementFor(state, input.id);
  if (retirement.status !== 'approved' || retirement.version !== input.expectedVersion || !retirement.journalDraftId) {
    throw new Error('Asset retirement is stale or is not ready for posted-ledger completion.');
  }
  if (retirement.requestedBy === actorId) throw new Error('Asset-retirement maker cannot complete the same retirement.');
  const asset = assetFor(state, retirement.assetId);
  const source = state.journalDrafts.find((item) => item.id === retirement.journalDraftId);
  if (!source || source.sourceType !== 'asset-retirement' || source.sourceId !== retirement.id || !isRetirementPosted(source)) {
    throw new Error('Asset retirement requires its exact canonical journal to be posted before physical completion.');
  }
  if (asset.status !== 'in-service') throw new Error('Asset is no longer available for retirement completion.');
  const next = mutate(state);
  next.managedAssets = next.managedAssets.map((item) => item.id === asset.id
    ? { ...item, status: 'retired', version: item.version + 1 }
    : item);
  next.assetRetirements = next.assetRetirements.map((item) => item.id === retirement.id
    ? { ...item, status: 'completed', completedBy: actorId, completedAt: now, version: item.version + 1 }
    : item);
  return next;
}

/**
 * Starts a custody-only move inside the active legal entity and branch. Cost
 * and depreciation remain in place, so this does not create an accounting
 * source journal. Cross-branch and cross-company movements need their own
 * future inter-unit accounting workflow.
 */
export function createAssetCustodyTransfer<S extends AssetMaintenanceState>(
  state: S,
  input: CreateAssetCustodyTransferInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): S {
  const asset = assetFor(state, input.assetId);
  if (asset.status !== 'in-service') {
    throw new Error('Only an in-service asset can enter a controlled custody transfer.');
  }
  if (state.assetCustodyTransfers.some((item) => item.assetId === asset.id && ['submitted', 'approved'].includes(item.status) && sameScope(item.scope, state.scope))) {
    throw new Error('This asset already has a custody transfer awaiting approval or receipt.');
  }
  if (state.assetRetirements.some((item) => item.assetId === asset.id && ['submitted', 'approved'].includes(item.status) && sameScope(item.scope, state.scope))) {
    throw new Error('An asset with an active retirement workflow cannot be transferred.');
  }
  if (state.maintenanceWorkOrders.some((item) => item.assetId === asset.id && item.status !== 'verified' && sameScope(item.scope, state.scope))) {
    throw new Error('Verify or reopen the active maintenance work order before transferring this asset.');
  }
  const destinationWarehouseId = input.destinationWarehouseId ?? asset.warehouseId;
  const destinationWorkCenterId = input.destinationWorkCenterId ?? asset.workCenterId;
  if (destinationWarehouseId) {
    assertReferenceScope(state, state.warehouses.find((item) => item.id === destinationWarehouseId), 'Destination warehouse');
  }
  if (destinationWorkCenterId) {
    assertReferenceScope(state, state.workCenters.find((item) => item.id === destinationWorkCenterId), 'Destination work center');
  }
  const transferDate = dateOnly(input.transferDate, 'Asset transfer date');
  if (transferDate < asset.availableForUseOn) {
    throw new Error('Asset transfer date cannot precede the available-for-use date.');
  }
  const destinationCustodyLabel = clean(input.destinationCustodyLabel, 'Destination asset custody location', 2, 160);
  const sameDestination = (asset.warehouseId ?? '') === (destinationWarehouseId ?? '') &&
    (asset.workCenterId ?? '') === (destinationWorkCenterId ?? '') &&
    asset.custodyLabel === destinationCustodyLabel;
  if (sameDestination) {
    throw new Error('Asset custody transfer must change the warehouse, work center, or custody location.');
  }
  const next = mutate(state);
  next.assetCustodyTransfers.unshift({
    id,
    number: fiscalNumber('ATF', state.assetCustodyTransfers.length + 1, now),
    assetId: asset.id,
    transferDate,
    reason: clean(input.reason, 'Asset transfer reason', 8, 500),
    sourceWarehouseId: asset.warehouseId,
    sourceWorkCenterId: asset.workCenterId,
    sourceCustodyLabel: asset.custodyLabel,
    destinationWarehouseId,
    destinationWorkCenterId,
    destinationCustodyLabel,
    sourceAssetVersion: asset.version,
    status: 'submitted',
    requestedBy: actorId,
    requestedAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  });
  return next;
}

/** The checker confirms the source asset is still exactly where it was when requested. */
export function decideAssetCustodyTransfer<S extends AssetMaintenanceState>(
  state: S,
  input: DecideAssetCustodyTransferInput,
  actorId: string,
  now = new Date().toISOString(),
): S {
  const transfer = custodyTransferFor(state, input.id);
  if (transfer.status !== 'submitted' || transfer.version !== input.expectedVersion) {
    throw new Error('Asset custody transfer is stale or is no longer awaiting approval.');
  }
  if (transfer.requestedBy === actorId) {
    throw new Error('Asset custody-transfer maker cannot decide the same transfer.');
  }
  const asset = assetFor(state, transfer.assetId);
  const sourceStillMatches = asset.status === 'in-service' &&
    asset.version === transfer.sourceAssetVersion &&
    (asset.warehouseId ?? '') === (transfer.sourceWarehouseId ?? '') &&
    (asset.workCenterId ?? '') === (transfer.sourceWorkCenterId ?? '') &&
    asset.custodyLabel === transfer.sourceCustodyLabel;
  if (!sourceStillMatches) {
    throw new Error('Asset custody changed after transfer submission. Create a new transfer from the current asset location.');
  }
  const remarks = clean(input.remarks, 'Asset custody-transfer decision remarks', 4, 500);
  const next = mutate(state);
  next.assetCustodyTransfers = next.assetCustodyTransfers.map((item) => item.id === transfer.id
    ? {
        ...item,
        status: input.decision,
        decidedBy: actorId,
        decidedAt: now,
        decisionRemarks: remarks,
        version: item.version + 1,
      }
    : item);
  return next;
}

/**
 * A third person receives the asset at the frozen destination. The physical
 * register changes only here, after approval and destination evidence.
 */
export function receiveAssetCustodyTransfer<S extends AssetMaintenanceState>(
  state: S,
  input: ReceiveAssetCustodyTransferInput,
  actorId: string,
  now = new Date().toISOString(),
): S {
  const transfer = custodyTransferFor(state, input.id);
  if (transfer.status !== 'approved' || transfer.version !== input.expectedVersion) {
    throw new Error('Asset custody transfer is stale or is not ready for destination receipt.');
  }
  if (transfer.requestedBy === actorId || transfer.decidedBy === actorId) {
    throw new Error('Transfer maker and approver cannot receive the same asset custody transfer.');
  }
  const asset = assetFor(state, transfer.assetId);
  const sourceStillMatches = asset.status === 'in-service' &&
    asset.version === transfer.sourceAssetVersion &&
    (asset.warehouseId ?? '') === (transfer.sourceWarehouseId ?? '') &&
    (asset.workCenterId ?? '') === (transfer.sourceWorkCenterId ?? '') &&
    asset.custodyLabel === transfer.sourceCustodyLabel;
  if (!sourceStillMatches) {
    throw new Error('Asset custody changed after transfer approval. Do not receive this stale transfer.');
  }
  if (transfer.destinationWarehouseId) {
    assertReferenceScope(state, state.warehouses.find((item) => item.id === transfer.destinationWarehouseId), 'Destination warehouse');
  }
  if (transfer.destinationWorkCenterId) {
    assertReferenceScope(state, state.workCenters.find((item) => item.id === transfer.destinationWorkCenterId), 'Destination work center');
  }
  const next = mutate(state);
  const receiptRemarks = clean(input.receiptRemarks, 'Asset custody-transfer receipt remarks', 4, 500);
  next.managedAssets = next.managedAssets.map((item) => item.id === asset.id
    ? {
        ...item,
        warehouseId: transfer.destinationWarehouseId,
        workCenterId: transfer.destinationWorkCenterId,
        custodyLabel: transfer.destinationCustodyLabel,
        version: item.version + 1,
      }
    : item);
  next.assetCustodyTransfers = next.assetCustodyTransfers.map((item) => item.id === transfer.id
    ? {
        ...item,
        status: 'received',
        receivedBy: actorId,
        receivedAt: now,
        receiptRemarks,
        version: item.version + 1,
      }
    : item);
  return next;
}

/**
 * Captures the physical component passport for an installed asset. It does
 * not split the parent fixed-asset cost or alter depreciation; those changes
 * require a separately governed ledger model with component cost allocation.
 */
export function createAssetComponentization<S extends AssetMaintenanceState>(
  state: S,
  input: CreateAssetComponentizationInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): S {
  const asset = assetFor(state, input.assetId);
  if (asset.status !== 'in-service') throw new Error('Only an in-service asset can be componentised.');
  if (state.assetComponentizations.some((item) => item.assetId === asset.id && item.status !== 'rejected' && sameScope(item.scope, state.scope))) {
    throw new Error('This asset already has an active componentisation record.');
  }
  if (state.maintenanceWorkOrders.some((item) => item.assetId === asset.id && item.status !== 'verified' && sameScope(item.scope, state.scope))) {
    throw new Error('Verify or reopen the active maintenance work order before componentising this asset.');
  }
  if (state.assetRetirements.some((item) => item.assetId === asset.id && ['submitted', 'approved'].includes(item.status) && sameScope(item.scope, state.scope))) {
    throw new Error('An asset with an active retirement workflow cannot be componentised.');
  }
  const effectiveOn = dateOnly(input.effectiveOn, 'Componentisation effective date');
  if (effectiveOn < asset.availableForUseOn) throw new Error('Componentisation date cannot precede the available-for-use date.');
  if (!Array.isArray(input.components) || input.components.length < 2 || input.components.length > 50) {
    throw new Error('Componentisation requires 2-50 physical components.');
  }
  const componentTags = new Set<string>();
  const serials = new Set<string>();
  const components = input.components.map((candidate, index) => {
    const componentTag = candidate.componentTag.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(componentTag)) throw new Error(`Component ${index + 1} tag must contain 2-40 uppercase letters, numbers, or dashes.`);
    if (componentTags.has(componentTag) || state.assetComponentizations.some((item) => item.components.some((component) => component.componentTag === componentTag) && sameScope(item.scope, state.scope))) throw new Error('Component tags must be unique in this company and branch.');
    componentTags.add(componentTag);
    const serialNumber = candidate.serialNumber?.trim().toUpperCase() || undefined;
    if (serialNumber && (serials.has(serialNumber) || state.assetComponentizations.some((item) => item.components.some((component) => component.serialNumber === serialNumber) && sameScope(item.scope, state.scope)))) throw new Error('Component serial numbers must be unique in this company and branch.');
    if (serialNumber) serials.add(serialNumber);
    if (candidate.categoryId) {
      const category = state.assetCategories.find((item) => item.id === candidate.categoryId && item.active);
      if (!category || !sameScope(category.scope, state.scope)) throw new Error('Each component category must be active in the current company and branch.');
    }
    return {
      id: randomUUID(),
      componentTag,
      name: clean(candidate.name, `Component ${index + 1} name`, 2, 160),
      serialNumber,
      categoryId: candidate.categoryId,
      criticality: candidate.criticality ?? asset.criticality,
      serviceable: candidate.serviceable ?? true,
    };
  });
  const next = mutate(state);
  next.assetComponentizations.unshift({
    id,
    number: fiscalNumber('CMP', state.assetComponentizations.length + 1, now),
    assetId: asset.id,
    effectiveOn,
    reason: clean(input.reason, 'Componentisation reason', 8, 500),
    evidenceReference: clean(input.evidenceReference, 'Componentisation evidence reference', 4, 160),
    sourceAssetVersion: asset.version,
    components,
    status: 'submitted',
    requestedBy: actorId,
    requestedAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  });
  return next;
}

export function decideAssetComponentization<S extends AssetMaintenanceState>(
  state: S,
  input: DecideAssetComponentizationInput,
  actorId: string,
  now = new Date().toISOString(),
): S {
  const componentization = componentizationFor(state, input.id);
  if (componentization.status !== 'submitted' || componentization.version !== input.expectedVersion) throw new Error('Asset componentisation is stale or is no longer awaiting approval.');
  if (componentization.requestedBy === actorId) throw new Error('Asset componentisation maker cannot decide the same record.');
  const asset = assetFor(state, componentization.assetId);
  if (asset.status !== 'in-service' || asset.version !== componentization.sourceAssetVersion) throw new Error('The parent asset changed after componentisation submission. Create a new componentisation record.');
  const remarks = clean(input.remarks, 'Asset componentisation decision remarks', 4, 500);
  const next = mutate(state);
  next.assetComponentizations = next.assetComponentizations.map((item) => item.id === componentization.id
    ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, version: item.version + 1 }
    : item);
  return next;
}

/**
 * Allocates the already-posted parent cost across an approved physical
 * component passport. This is a subledger attribution only: the total must
 * reconcile exactly and no duplicate fixed-asset GL movement is created.
 */
export function createAssetComponentAllocation<S extends AssetMaintenanceState>(
  state: S,
  input: CreateAssetComponentAllocationInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): S {
  const asset = assetFor(state, input.assetId);
  if (asset.status !== 'in-service') throw new Error('Component allocation requires an in-service asset.');
  const componentization = componentizationFor(state, input.componentizationId);
  if (componentization.assetId !== asset.id || componentization.status !== 'approved') throw new Error('Component allocation requires an approved passport for this asset.');
  if (componentization.sourceAssetVersion !== asset.version) throw new Error('The parent asset changed after component passport approval. Create a new passport before allocating cost.');
  const capitalization = input.capitalizationId
    ? capitalizationFor(state, input.capitalizationId)
    : state.assetCapitalizations.find((item) => item.assetId === asset.id && item.status === 'approved' && sameScope(item.scope, state.scope));
  if (!capitalization || capitalization.assetId !== asset.id || capitalization.status !== 'approved' || !sameScope(capitalization.scope, state.scope)) {
    throw new Error('Component allocation requires one approved fixed-asset capitalisation for this asset.');
  }
  if (state.assetComponentAllocations.some((item) => item.assetId === asset.id && item.status !== 'rejected' && sameScope(item.scope, state.scope))) throw new Error('This asset already has an active component allocation.');
  if (!Array.isArray(input.lines) || input.lines.length !== componentization.components.length) throw new Error('Every approved physical component must receive exactly one allocation line.');
  const componentsById = new Map(componentization.components.map((component) => [component.id, component]));
  const seen = new Set<string>();
  const lines = input.lines.map((line, index) => {
    const component = componentsById.get(line.componentId);
    if (!component || seen.has(line.componentId)) throw new Error(`Allocation line ${index + 1} references a missing or duplicate component.`);
    seen.add(line.componentId);
    if (!Number.isFinite(line.allocationPercent) || line.allocationPercent <= 0 || line.allocationPercent > 100 || Math.round(line.allocationPercent * 100) / 100 !== line.allocationPercent) throw new Error('Allocation percentages must be greater than 0 and at most 100 with two decimals.');
    const usefulLifeMonths = positiveInteger(line.usefulLifeMonths, 'Component useful life in months', 1_200);
    if (!Number.isFinite(line.residualValuePercent) || line.residualValuePercent < 0 || line.residualValuePercent >= 100 || Math.round(line.residualValuePercent * 100) / 100 !== line.residualValuePercent) throw new Error('Component residual value percent must be from 0 up to (but not including) 100.');
    return {
      id: randomUUID(), componentId: component.id, componentTag: component.componentTag,
      allocationPercent: line.allocationPercent,
      allocatedCost: money(capitalization.taxableAmount * line.allocationPercent / 100),
      usefulLifeMonths, residualValuePercent: line.residualValuePercent,
    };
  });
  const totalPercent = money(lines.reduce((total, line) => total + line.allocationPercent, 0));
  const allocatedCost = money(lines.reduce((total, line) => total + line.allocatedCost, 0));
  if (totalPercent !== 100) throw new Error('Component allocation percentages must total exactly 100%.');
  const roundingDelta = money(capitalization.taxableAmount - allocatedCost);
  if (Math.abs(roundingDelta) > 0.01) throw new Error('Component allocation must reconcile exactly to the approved parent cost.');
  if (roundingDelta !== 0) {
    const lastLine = lines[lines.length - 1];
    if (!lastLine) throw new Error('Component allocation requires at least one line.');
    lastLine.allocatedCost = money(lastLine.allocatedCost + roundingDelta);
  }
  const next = mutate(state);
  next.assetComponentAllocations.unshift({
    id, number: fiscalNumber('ALC', state.assetComponentAllocations.length + 1, now), assetId: asset.id,
    capitalizationId: capitalization.id, componentizationId: componentization.id,
    sourceAssetVersion: asset.version, parentCost: capitalization.taxableAmount,
    allocatedCost: money(lines.reduce((total, line) => total + line.allocatedCost, 0)), lines,
    status: 'submitted', requestedBy: actorId, requestedAt: now,
    scope: structuredClone(next.scope), version: 1,
  });
  return next;
}

export function decideAssetComponentAllocation<S extends AssetMaintenanceState>(
  state: S,
  input: DecideAssetComponentAllocationInput,
  actorId: string,
  now = new Date().toISOString(),
): S {
  const allocation = componentAllocationFor(state, input.id);
  if (allocation.status !== 'submitted' || allocation.version !== input.expectedVersion) throw new Error('Asset component allocation is stale or is no longer awaiting approval.');
  if (allocation.requestedBy === actorId) throw new Error('Component allocation maker cannot decide the same record.');
  const asset = assetFor(state, allocation.assetId);
  if (asset.status !== 'in-service' || asset.version !== allocation.sourceAssetVersion) throw new Error('The parent asset changed after allocation submission. Create a new allocation.');
  const capitalization = capitalizationFor(state, allocation.capitalizationId);
  if (capitalization.status !== 'approved' || money(capitalization.taxableAmount) !== money(allocation.parentCost) || money(allocation.allocatedCost) !== money(allocation.parentCost)) throw new Error('The approved parent cost no longer reconciles to the component allocation.');
  const remarks = clean(input.remarks, 'Component allocation decision remarks', 4, 500);
  const next = mutate(state);
  next.assetComponentAllocations = next.assetComponentAllocations.map((item) => item.id === allocation.id
    ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, version: item.version + 1 }
    : item);
  return next;
}

function transferAccountingFor<S extends AssetMaintenanceState>(state: S, id: string): AssetTransferAccounting {
  const transfer = state.assetTransferAccountings.find((item) => item.id === id);
  if (!transfer) throw new Error('The inter-branch asset transfer was not found in the active company and branch.');
  return transfer;
}

export function createAssetTransferAccounting<S extends AssetMaintenanceState>(
  state: S,
  input: CreateAssetTransferAccountingInput,
  actorId: string,
  getBookValue: (capitalizationId: string) => AssetBookValue | null,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): S {
  const asset = assetFor(state, input.assetId);
  if (asset.status !== 'in-service') throw new Error('Only an in-service asset can enter an inter-branch transfer.');
  if (input.destinationCompanyId === state.scope.companyId && input.destinationBranchId === state.scope.branchId) throw new Error('Destination must be a different company or branch.');
  if (state.assetTransferAccountings.some((item) => item.assetId === asset.id && ['submitted', 'approved', 'dispatched'].includes(item.status) && sameScope(item.scope, state.scope))) throw new Error('This asset already has an active inter-branch transfer.');
  const capitalization = state.assetCapitalizations.find((item) => item.assetId === asset.id && item.status === 'approved' && sameScope(item.scope, state.scope));
  if (!capitalization) throw new Error('Inter-branch transfer requires an approved fixed-asset capitalisation.');
  const book = validateBookValue(getBookValue(capitalization.id), capitalization);
  const transferDate = dateOnly(input.transferDate, 'Inter-branch transfer date');
  if (transferDate < book.asOfDate) throw new Error('Transfer date cannot precede the reconciled fixed-asset book date.');
  const next = mutate(state);
  next.assetTransferAccountings.unshift({
    id, number: fiscalNumber('TRF', state.assetTransferAccountings.length + 1, now), assetId: asset.id, capitalizationId: capitalization.id,
    transferDate, reason: clean(input.reason, 'Inter-branch transfer reason', 8, 500), evidenceReference: clean(input.evidenceReference, 'Inter-branch transfer evidence reference', 4, 160),
    sourceCompanyId: state.scope.companyId, sourceBranchId: state.scope.branchId, destinationCompanyId: clean(input.destinationCompanyId, 'Destination company', 2, 120), destinationBranchId: clean(input.destinationBranchId, 'Destination branch', 2, 120),
    destinationWarehouseId: input.destinationWarehouseId, destinationCustodyLabel: clean(input.destinationCustodyLabel, 'Destination custody label', 2, 160),
    grossCost: book.grossCost, accumulatedDepreciation: book.accumulatedDepreciation, netBookValue: book.netBookValue, sourceAssetVersion: asset.version,
    status: 'submitted', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1,
  });
  return next;
}

export function decideAssetTransferAccounting<S extends AssetMaintenanceState>(state: S, input: DecideAssetTransferAccountingInput, actorId: string, now = new Date().toISOString()): S {
  const transfer = transferAccountingFor(state, input.id);
  if (transfer.status !== 'submitted' || transfer.version !== input.expectedVersion) throw new Error('Inter-branch transfer is stale or is no longer awaiting approval.');
  if (transfer.requestedBy === actorId) throw new Error('Inter-branch transfer maker cannot decide the same transfer.');
  const asset = assetFor(state, transfer.assetId);
  if (asset.version !== transfer.sourceAssetVersion || asset.status !== 'in-service') throw new Error('The source asset changed after transfer submission. Create a new transfer.');
  const remarks = clean(input.remarks, 'Inter-branch transfer decision remarks', 4, 500);
  const next = mutate(state);
  if (input.decision === 'rejected') {
    next.assetTransferAccountings = next.assetTransferAccountings.map((item) => item.id === transfer.id ? { ...item, status: 'rejected', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, version: item.version + 1 } : item);
    return next;
  }
  const source: Omit<AccountingJournalDraft, 'id' | 'checksum'> = {
    sourceType: 'asset-transfer', sourceId: transfer.id, sourceNumber: transfer.number, postingDate: transfer.transferDate,
    lines: [
      ...(transfer.accumulatedDepreciation > 0 ? [{ accountCode: 'accumulated-depreciation' as const, debit: transfer.accumulatedDepreciation, credit: 0, memo: transfer.number }] : []),
      { accountCode: 'cash-in-transit', debit: transfer.netBookValue, credit: 0, memo: `${transfer.number} / destination clearing` },
      { accountCode: 'fixed-assets', debit: 0, credit: transfer.grossCost, memo: transfer.number },
    ],
    totalDebit: transfer.grossCost, totalCredit: transfer.grossCost, status: 'ready', version: 1,
  };
  const journal: AccountingJournalDraft = { id: randomUUID(), ...source, checksum: handoffChecksum(source) };
  next.journalDrafts.unshift(journal);
  next.assetTransferAccountings = next.assetTransferAccountings.map((item) => item.id === transfer.id ? { ...item, status: 'approved', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, journalDraftId: journal.id, version: item.version + 1 } : item);
  return next;
}

export function dispatchAssetTransferAccounting<S extends AssetMaintenanceState>(state: S, input: DispatchAssetTransferAccountingInput, actorId: string, now = new Date().toISOString()): S {
  const transfer = transferAccountingFor(state, input.id);
  if (transfer.status !== 'approved' || transfer.version !== input.expectedVersion) throw new Error('Only an approved transfer can be dispatched.');
  if (transfer.decidedBy === actorId) throw new Error('Transfer approver cannot dispatch the same transfer.');
  const next = mutate(state);
  next.assetTransferAccountings = next.assetTransferAccountings.map((item) => item.id === transfer.id ? { ...item, status: 'dispatched', dispatchedBy: actorId, dispatchedAt: now, version: item.version + 1 } : item);
  return next;
}

export function receiveAssetTransferAccounting<S extends AssetMaintenanceState>(state: S, input: ReceiveAssetTransferAccountingInput, actorId: string, now = new Date().toISOString()): S {
  const transfer = transferAccountingFor(state, input.id);
  if (transfer.status !== 'dispatched' || transfer.version !== input.expectedVersion) throw new Error('Only a dispatched transfer can be received.');
  if (transfer.requestedBy === actorId || transfer.decidedBy === actorId || transfer.dispatchedBy === actorId) throw new Error('A transfer must be received by a fourth-party destination custodian.');
  const next = mutate(state);
  next.assetTransferAccountings = next.assetTransferAccountings.map((item) => item.id === transfer.id ? { ...item, status: 'received', receivedBy: actorId, receivedAt: now, receiptRemarks: clean(input.receiptRemarks, 'Transfer receipt remarks', 4, 500), version: item.version + 1 } : item);
  return next;
}

function saleDisposalFor<S extends AssetMaintenanceState>(state: S, id: string): AssetSaleDisposal {
  const sale = state.assetSaleDisposals.find((item) => item.id === id);
  if (!sale) throw new Error('The asset sale disposal was not found in the active company and branch.');
  return sale;
}

export function createAssetSaleDisposal<S extends AssetMaintenanceState>(state: S, input: CreateAssetSaleDisposalInput, actorId: string, getBookValue: (capitalizationId: string) => AssetBookValue | null, id = randomUUID(), now = new Date().toISOString()): S {
  const asset = assetFor(state, input.assetId);
  if (asset.status !== 'in-service') throw new Error('Only an in-service asset can enter sale disposal.');
  if (state.assetSaleDisposals.some((item) => item.assetId === asset.id && ['submitted', 'approved'].includes(item.status) && sameScope(item.scope, state.scope))) throw new Error('This asset already has an active sale disposal.');
  if (state.assetRetirements.some((item) => item.assetId === asset.id && ['submitted', 'approved'].includes(item.status) && sameScope(item.scope, state.scope))) throw new Error('An active no-proceeds retirement must be rejected before sale disposal.');
  const capitalization = state.assetCapitalizations.find((item) => item.assetId === asset.id && item.status === 'approved' && sameScope(item.scope, state.scope));
  if (!capitalization) throw new Error('Sale disposal requires an approved fixed-asset capitalisation.');
  const book = validateBookValue(getBookValue(capitalization.id), capitalization);
  const saleDate = dateOnly(input.saleDate, 'Asset sale date');
  if (saleDate < book.asOfDate) throw new Error('Sale date cannot precede the reconciled fixed-asset book date.');
  const taxableProceeds = money(input.taxableProceeds);
  if (!Number.isFinite(taxableProceeds) || taxableProceeds <= 0) throw new Error('Taxable sale proceeds must be greater than zero.');
  if (!Number.isFinite(input.gstRate) || input.gstRate < 0 || input.gstRate > 28) throw new Error('GST rate must be between 0 and 28 percent.');
  if (input.supplyType === 'zero-rated' || input.supplyType === 'exempt') { if (input.gstRate !== 0) throw new Error('Zero-rated and exempt asset sales must carry zero GST.'); }
  const gstAmount = money(taxableProceeds * input.gstRate / 100);
  const next = mutate(state);
  next.assetSaleDisposals.unshift({ id, number: fiscalNumber('SAL', state.assetSaleDisposals.length + 1, now), assetId: asset.id, capitalizationId: capitalization.id, saleDate, customerAccountId: clean(input.customerAccountId, 'Customer account', 2, 120), customerTaxRegistrationNumber: input.customerTaxRegistrationNumber?.trim().toUpperCase() || undefined, supplyType: input.supplyType, taxableProceeds, gstRate: input.gstRate, gstAmount, totalProceeds: money(taxableProceeds + gstAmount), grossCost: book.grossCost, accumulatedDepreciation: book.accumulatedDepreciation, netBookValue: book.netBookValue, gainLoss: money(taxableProceeds - book.netBookValue), sourceAssetVersion: asset.version, evidenceReference: clean(input.evidenceReference, 'Asset sale evidence reference', 4, 160), status: 'submitted', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 });
  return next;
}

export function decideAssetSaleDisposal<S extends AssetMaintenanceState>(state: S, input: DecideAssetSaleDisposalInput, actorId: string, now = new Date().toISOString()): S {
  const sale = saleDisposalFor(state, input.id);
  if (sale.status !== 'submitted' || sale.version !== input.expectedVersion) throw new Error('Asset sale disposal is stale or is no longer awaiting approval.');
  if (sale.requestedBy === actorId) throw new Error('Asset sale disposal maker cannot decide the same sale.');
  const asset = assetFor(state, sale.assetId);
  if (asset.status !== 'in-service' || asset.version !== sale.sourceAssetVersion) throw new Error('The source asset changed after sale submission.');
  const remarks = clean(input.remarks, 'Asset sale decision remarks', 4, 500);
  const next = mutate(state);
  if (input.decision === 'rejected') { next.assetSaleDisposals = next.assetSaleDisposals.map((item) => item.id === sale.id ? { ...item, status: 'rejected', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, version: item.version + 1 } : item); return next; }
  const lines: AccountingJournalDraft['lines'] = [
    { accountCode: 'accounts-receivable', debit: sale.totalProceeds, credit: 0, memo: sale.number },
    ...(sale.accumulatedDepreciation > 0 ? [{ accountCode: 'accumulated-depreciation' as const, debit: sale.accumulatedDepreciation, credit: 0, memo: sale.number }] : []),
    ...(sale.gainLoss < 0 ? [{ accountCode: 'asset-retirement-loss' as const, debit: money(-sale.gainLoss), credit: 0, memo: sale.number }] : []),
    { accountCode: 'fixed-assets', debit: 0, credit: sale.grossCost, memo: sale.number },
    ...(sale.gstAmount > 0
      ? sale.supplyType === 'inter-state'
        ? [{ accountCode: 'output-igst' as const, debit: 0, credit: sale.gstAmount, memo: sale.number }]
        : [{ accountCode: 'output-cgst' as const, debit: 0, credit: money(sale.gstAmount / 2), memo: sale.number }, { accountCode: 'output-sgst' as const, debit: 0, credit: money(sale.gstAmount - money(sale.gstAmount / 2)), memo: sale.number }]
      : []),
    ...(sale.gainLoss > 0 ? [{ accountCode: 'sales-revenue' as const, debit: 0, credit: sale.gainLoss, memo: `${sale.number} / gain` }] : []),
  ];
  const journalTotal = money(lines.reduce((sum, line) => sum + line.debit, 0));
  const source = { sourceType: 'asset-sale-disposal' as const, sourceId: sale.id, sourceNumber: sale.number, postingDate: sale.saleDate, lines };
  const journal: AccountingJournalDraft = { id: randomUUID(), ...source, totalDebit: journalTotal, totalCredit: money(lines.reduce((sum, line) => sum + line.credit, 0)), status: 'ready', version: 1, checksum: handoffChecksum(source) };
  if (journal.totalDebit !== journal.totalCredit) throw new Error('Asset sale disposal journal does not balance.');
  next.journalDrafts.unshift(journal);
  next.assetSaleDisposals = next.assetSaleDisposals.map((item) => item.id === sale.id ? { ...item, status: 'approved', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, journalDraftId: journal.id, version: item.version + 1 } : item);
  return next;
}

export function completeAssetSaleDisposal<S extends AssetMaintenanceState>(state: S, input: CompleteAssetSaleDisposalInput, actorId: string, isJournalPosted: (draft: AccountingJournalDraft) => boolean, now = new Date().toISOString()): S {
  const sale = saleDisposalFor(state, input.id);
  if (sale.status !== 'approved' || sale.version !== input.expectedVersion || !sale.journalDraftId) throw new Error('Only an approved sale with a prepared journal can be completed.');
  const draft = state.journalDrafts.find((item) => item.id === sale.journalDraftId);
  if (!draft || !isJournalPosted(draft)) throw new Error('The exact canonical sale journal must be posted before physical disposal completes.');
  const next = mutate(state);
  next.assetSaleDisposals = next.assetSaleDisposals.map((item) => item.id === sale.id ? { ...item, status: 'completed', completedBy: actorId, completedAt: now, version: item.version + 1 } : item);
  next.managedAssets = next.managedAssets.map((item) => item.id === sale.assetId ? { ...item, status: 'retired', version: item.version + 1 } : item);
  next.assetInstalledBaseEvents.unshift({ id: randomUUID(), number: fiscalNumber('IBE', next.assetInstalledBaseEvents.length + 1, now), assetId: sale.assetId, eventType: 'sale', eventDate: sale.saleDate, referenceType: 'asset-sale-disposal', referenceId: sale.id, summary: `Asset sold to customer ${sale.customerAccountId}`, evidenceReference: sale.evidenceReference, actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 });
  return next;
}

function impairmentFor<S extends AssetMaintenanceState>(state: S, id: string): AssetImpairmentReview { const record = state.assetImpairmentReviews.find((item) => item.id === id); if (!record) throw new Error('The asset impairment review was not found in the active company and branch.'); return record; }
function revaluationFor<S extends AssetMaintenanceState>(state: S, id: string): AssetRevaluation { const record = state.assetRevaluations.find((item) => item.id === id); if (!record) throw new Error('The asset revaluation was not found in the active company and branch.'); return record; }
function warrantyFor<S extends AssetMaintenanceState>(state: S, id: string): AssetWarranty { const record = state.assetWarranties.find((item) => item.id === id); if (!record) throw new Error('The asset warranty was not found in the active company and branch.'); return record; }
function amcFor<S extends AssetMaintenanceState>(state: S, id: string): AssetAmcContract { const record = state.assetAmcContracts.find((item) => item.id === id); if (!record) throw new Error('The asset AMC contract was not found in the active company and branch.'); return record; }
function meterFor<S extends AssetMaintenanceState>(state: S, id: string): AssetMeter { const record = state.assetMeters.find((item) => item.id === id); if (!record) throw new Error('The asset meter was not found in the active company and branch.'); return record; }
function correctiveFor<S extends AssetMaintenanceState>(state: S, id: string): CorrectiveMaintenanceRequest { const record = state.correctiveMaintenanceRequests.find((item) => item.id === id); if (!record) throw new Error('The corrective maintenance request was not found in the active company and branch.'); return record; }
function calibrationFor<S extends AssetMaintenanceState>(state: S, id: string): AssetCalibrationRecord { const record = state.assetCalibrations.find((item) => item.id === id); if (!record) throw new Error('The calibration record was not found in the active company and branch.'); return record; }
function spareFor<S extends AssetMaintenanceState>(state: S, id: string): AssetSparePart { const record = state.assetSpareParts.find((item) => item.id === id); if (!record) throw new Error('The asset spare part was not found in the active company and branch.'); return record; }
function vehicleFor<S extends AssetMaintenanceState>(state: S, id: string): FleetVehicle { const record = state.fleetVehicles.find((item) => item.id === id); if (!record) throw new Error('The fleet vehicle was not found in the active company and branch.'); return record; }
function tripFor<S extends AssetMaintenanceState>(state: S, id: string): FleetTrip { const record = state.fleetTrips.find((item) => item.id === id); if (!record) throw new Error('The fleet trip was not found in the active company and branch.'); return record; }

export function createAssetImpairmentReview<S extends AssetMaintenanceState>(state: S, input: CreateAssetImpairmentReviewInput, actorId: string, getBookValue: (capitalizationId: string) => AssetBookValue | null, id = randomUUID(), now = new Date().toISOString()): S {
  const asset = assetFor(state, input.assetId); if (asset.status !== 'in-service') throw new Error('Only an in-service asset can enter impairment review.');
  const capitalization = state.assetCapitalizations.find((item) => item.assetId === asset.id && item.status === 'approved' && sameScope(item.scope, state.scope)); if (!capitalization) throw new Error('Impairment review requires an approved fixed-asset capitalisation.');
  const book = validateBookValue(getBookValue(capitalization.id), capitalization); const assessmentDate = dateOnly(input.assessmentDate, 'Impairment assessment date'); if (assessmentDate < book.asOfDate) throw new Error('Impairment assessment cannot precede the reconciled book date.');
  const recoverableAmount = money(input.recoverableAmount); if (!Number.isFinite(recoverableAmount) || recoverableAmount < 0) throw new Error('Recoverable amount must be zero or greater.');
  if (state.assetImpairmentReviews.some((item) => item.assetId === asset.id && item.status === 'submitted' && sameScope(item.scope, state.scope))) throw new Error('This asset already has an impairment review awaiting decision.');
  const next = mutate(state); next.assetImpairmentReviews.unshift({ id, number: fiscalNumber('IMP', state.assetImpairmentReviews.length + 1, now), assetId: asset.id, capitalizationId: capitalization.id, assessmentDate, carryingAmount: book.netBookValue, recoverableAmount, impairmentAmount: money(Math.max(0, book.netBookValue - recoverableAmount)), reversalAmount: money(Math.max(0, recoverableAmount - book.netBookValue)), sourceAssetVersion: asset.version, evidenceReference: clean(input.evidenceReference, 'Impairment evidence reference', 4, 160), status: 'submitted', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }); return next;
}
export function decideAssetImpairmentReview<S extends AssetMaintenanceState>(state: S, input: DecideAssetImpairmentReviewInput, actorId: string, now = new Date().toISOString()): S {
  const review = impairmentFor(state, input.id); if (review.status !== 'submitted' || review.version !== input.expectedVersion) throw new Error('Asset impairment review is stale or is no longer awaiting approval.'); if (review.requestedBy === actorId) throw new Error('Impairment review maker cannot decide the same review.'); const asset = assetFor(state, review.assetId); if (asset.version !== review.sourceAssetVersion || asset.status !== 'in-service') throw new Error('The source asset changed after impairment submission.'); const remarks = clean(input.remarks, 'Impairment decision remarks', 4, 500); const next = mutate(state); if (input.decision === 'rejected') { next.assetImpairmentReviews = next.assetImpairmentReviews.map((item) => item.id === review.id ? { ...item, status: 'rejected', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, version: item.version + 1 } : item); return next; }
  if (review.impairmentAmount <= 0 && review.reversalAmount <= 0) throw new Error('Impairment review must contain a measurable impairment or reversal.');
  const lines: AccountingJournalDraft['lines'] = review.impairmentAmount > 0 ? [{ accountCode: 'impairment-loss' as const, debit: review.impairmentAmount, credit: 0, memo: review.number }, { accountCode: 'accumulated-depreciation' as const, debit: 0, credit: review.impairmentAmount, memo: review.number }] : [{ accountCode: 'accumulated-depreciation' as const, debit: review.reversalAmount, credit: 0, memo: review.number }, { accountCode: 'impairment-reversal-income' as const, debit: 0, credit: review.reversalAmount, memo: review.number }];
  const source = { sourceType: 'asset-impairment' as const, sourceId: review.id, sourceNumber: review.number, postingDate: review.assessmentDate, lines }; const journal: AccountingJournalDraft = { id: randomUUID(), ...source, totalDebit: money(lines.reduce((total, line) => total + line.debit, 0)), totalCredit: money(lines.reduce((total, line) => total + line.credit, 0)), status: 'ready', version: 1, checksum: handoffChecksum(source) }; next.journalDrafts.unshift(journal); next.assetImpairmentReviews = next.assetImpairmentReviews.map((item) => item.id === review.id ? { ...item, status: 'approved', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, journalDraftId: journal.id, version: item.version + 1 } : item); return next;
}
export function completeAssetImpairmentReview<S extends AssetMaintenanceState>(state: S, input: CompleteAssetImpairmentReviewInput, actorId: string, isJournalPosted: (draft: AccountingJournalDraft) => boolean, now = new Date().toISOString()): S { const review = impairmentFor(state, input.id); if (review.status !== 'approved' || review.version !== input.expectedVersion || !review.journalDraftId) throw new Error('Only an approved impairment review with a prepared journal can be completed.'); const draft = state.journalDrafts.find((item) => item.id === review.journalDraftId); if (!draft || !isJournalPosted(draft)) throw new Error('The exact canonical impairment journal must be posted before completion.'); const next = mutate(state); next.assetImpairmentReviews = next.assetImpairmentReviews.map((item) => item.id === review.id ? { ...item, status: 'completed', completedBy: actorId, completedAt: now, version: item.version + 1 } : item); next.assetInstalledBaseEvents.unshift({ id: randomUUID(), number: fiscalNumber('IBE', next.assetInstalledBaseEvents.length + 1, now), assetId: review.assetId, eventType: 'impairment', eventDate: review.assessmentDate, referenceType: 'asset-impairment', referenceId: review.id, summary: `Impairment ${review.impairmentAmount || review.reversalAmount}`, evidenceReference: review.evidenceReference, actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }

export function createAssetRevaluation<S extends AssetMaintenanceState>(state: S, input: CreateAssetRevaluationInput, actorId: string, getBookValue: (capitalizationId: string) => AssetBookValue | null, id = randomUUID(), now = new Date().toISOString()): S { const asset = assetFor(state, input.assetId); if (asset.status !== 'in-service') throw new Error('Only an in-service asset can enter revaluation.'); const capitalization = state.assetCapitalizations.find((item) => item.assetId === asset.id && item.status === 'approved' && sameScope(item.scope, state.scope)); if (!capitalization) throw new Error('Revaluation requires an approved fixed-asset capitalisation.'); const book = validateBookValue(getBookValue(capitalization.id), capitalization); const revaluationDate = dateOnly(input.revaluationDate, 'Revaluation date'); if (revaluationDate < book.asOfDate) throw new Error('Revaluation date cannot precede the reconciled book date.'); const fairValue = money(input.fairValue); if (!Number.isFinite(fairValue) || fairValue <= 0) throw new Error('Fair value must be greater than zero.'); const next = mutate(state); next.assetRevaluations.unshift({ id, number: fiscalNumber('REV', state.assetRevaluations.length + 1, now), assetId: asset.id, capitalizationId: capitalization.id, revaluationDate, carryingAmount: book.netBookValue, fairValue, uplift: money(Math.max(0, fairValue - book.netBookValue)), deficit: money(Math.max(0, book.netBookValue - fairValue)), sourceAssetVersion: asset.version, valuationBasis: clean(input.valuationBasis, 'Valuation basis', 8, 240), evidenceReference: clean(input.evidenceReference, 'Revaluation evidence reference', 4, 160), status: 'submitted', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }
export function decideAssetRevaluation<S extends AssetMaintenanceState>(state: S, input: DecideAssetRevaluationInput, actorId: string, now = new Date().toISOString()): S { const review = revaluationFor(state, input.id); if (review.status !== 'submitted' || review.version !== input.expectedVersion) throw new Error('Asset revaluation is stale or is no longer awaiting approval.'); if (review.requestedBy === actorId) throw new Error('Revaluation maker cannot decide the same review.'); const asset = assetFor(state, review.assetId); if (asset.version !== review.sourceAssetVersion || asset.status !== 'in-service') throw new Error('The source asset changed after revaluation submission.'); const remarks = clean(input.remarks, 'Revaluation decision remarks', 4, 500); const next = mutate(state); if (input.decision === 'rejected') { next.assetRevaluations = next.assetRevaluations.map((item) => item.id === review.id ? { ...item, status: 'rejected', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, version: item.version + 1 } : item); return next; } if (review.uplift <= 0 && review.deficit <= 0) throw new Error('Revaluation must contain a measurable uplift or deficit.'); const lines: AccountingJournalDraft['lines'] = review.uplift > 0 ? [{ accountCode: 'fixed-assets', debit: review.uplift, credit: 0, memo: review.number }, { accountCode: 'revaluation-surplus', debit: 0, credit: review.uplift, memo: review.number }] : [{ accountCode: 'revaluation-loss', debit: review.deficit, credit: 0, memo: review.number }, { accountCode: 'fixed-assets', debit: 0, credit: review.deficit, memo: review.number }]; const source = { sourceType: 'asset-revaluation' as const, sourceId: review.id, sourceNumber: review.number, postingDate: review.revaluationDate, lines }; const journal: AccountingJournalDraft = { id: randomUUID(), ...source, totalDebit: money(lines.reduce((total, line) => total + line.debit, 0)), totalCredit: money(lines.reduce((total, line) => total + line.credit, 0)), status: 'ready', version: 1, checksum: handoffChecksum(source) }; next.journalDrafts.unshift(journal); next.assetRevaluations = next.assetRevaluations.map((item) => item.id === review.id ? { ...item, status: 'approved', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, journalDraftId: journal.id, version: item.version + 1 } : item); return next; }
export function completeAssetRevaluation<S extends AssetMaintenanceState>(state: S, input: CompleteAssetRevaluationInput, actorId: string, isJournalPosted: (draft: AccountingJournalDraft) => boolean, now = new Date().toISOString()): S { const review = revaluationFor(state, input.id); if (review.status !== 'approved' || review.version !== input.expectedVersion || !review.journalDraftId) throw new Error('Only an approved revaluation with a prepared journal can be completed.'); const draft = state.journalDrafts.find((item) => item.id === review.journalDraftId); if (!draft || !isJournalPosted(draft)) throw new Error('The exact canonical revaluation journal must be posted before completion.'); const next = mutate(state); next.assetRevaluations = next.assetRevaluations.map((item) => item.id === review.id ? { ...item, status: 'completed', completedBy: actorId, completedAt: now, version: item.version + 1 } : item); next.assetInstalledBaseEvents.unshift({ id: randomUUID(), number: fiscalNumber('IBE', next.assetInstalledBaseEvents.length + 1, now), assetId: review.assetId, eventType: 'revaluation', eventDate: review.revaluationDate, referenceType: 'asset-revaluation', referenceId: review.id, summary: `Revaluation to ${review.fairValue}`, evidenceReference: review.evidenceReference, actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }

export function createAssetWarranty<S extends AssetMaintenanceState>(state: S, input: CreateAssetWarrantyInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): S { const asset = assetFor(state, input.assetId); if (asset.status === 'retired') throw new Error('A retired asset cannot receive warranty coverage.'); const startDate = dateOnly(input.startDate, 'Warranty start date'); const endDate = dateOnly(input.endDate, 'Warranty end date'); if (endDate < startDate) throw new Error('Warranty end date cannot precede its start date.'); const next = mutate(state); next.assetWarranties.unshift({ id, number: fiscalNumber('WAR', state.assetWarranties.length + 1, now), assetId: asset.id, providerName: clean(input.providerName, 'Warranty provider'), coverageDescription: clean(input.coverageDescription, 'Warranty coverage', 8, 500), startDate, endDate, claimWindowDays: input.claimWindowDays === undefined ? 30 : positiveInteger(input.claimWindowDays, 'Warranty claim window', 3650), status: endDate < now.slice(0, 10) ? 'expired' : 'active', evidenceReference: clean(input.evidenceReference, 'Warranty evidence reference', 4, 160), createdBy: actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }
export function updateAssetWarrantyStatus<S extends AssetMaintenanceState>(state: S, input: UpdateAssetWarrantyStatusInput, actorId: string): S { const warranty = warrantyFor(state, input.id); if (warranty.version !== input.expectedVersion) throw new Error('Warranty record is stale. Refresh and retry.'); if (input.status === 'active' && warranty.endDate < new Date().toISOString().slice(0, 10)) throw new Error('Expired warranty coverage cannot be reactivated.'); const next = mutate(state); next.assetWarranties = next.assetWarranties.map((item) => item.id === warranty.id ? { ...item, status: input.status, version: item.version + 1 } : item); if (input.status === 'claimed') next.assetInstalledBaseEvents.unshift({ id: randomUUID(), number: fiscalNumber('IBE', next.assetInstalledBaseEvents.length + 1, new Date().toISOString()), assetId: warranty.assetId, eventType: 'warranty-claim', eventDate: new Date().toISOString().slice(0, 10), referenceType: 'asset-warranty', referenceId: warranty.id, summary: `Warranty claim with ${warranty.providerName}`, evidenceReference: warranty.evidenceReference, actorId, createdAt: new Date().toISOString(), scope: structuredClone(next.scope), version: 1 }); return next; }

export function createAssetAmcContract<S extends AssetMaintenanceState>(state: S, input: CreateAssetAmcContractInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): S { const asset = assetFor(state, input.assetId); if (asset.status !== 'in-service') throw new Error('AMC requires an in-service asset.'); if (!Number.isFinite(input.annualValue) || input.annualValue < 0) throw new Error('AMC annual value must be zero or greater.'); const startDate = dateOnly(input.startDate, 'AMC start date'); const endDate = dateOnly(input.endDate, 'AMC end date'); if (endDate < startDate) throw new Error('AMC end date cannot precede its start date.'); const next = mutate(state); next.assetAmcContracts.unshift({ id, number: fiscalNumber('AMC', state.assetAmcContracts.length + 1, now), assetId: asset.id, providerName: clean(input.providerName, 'AMC provider'), contractReference: clean(input.contractReference, 'AMC contract reference', 4, 120), startDate, endDate, responseHours: positiveInteger(input.responseHours, 'AMC response hours', 8760), visitIntervalDays: positiveInteger(input.visitIntervalDays, 'AMC visit interval', 3650), annualValue: money(input.annualValue), coverageDescription: clean(input.coverageDescription, 'AMC coverage', 8, 500), status: 'submitted', evidenceReference: clean(input.evidenceReference, 'AMC evidence reference', 4, 160), requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }
export function decideAssetAmcContract<S extends AssetMaintenanceState>(state: S, input: DecideAssetAmcContractInput, actorId: string, now = new Date().toISOString()): S { const contract = amcFor(state, input.id); if (contract.status !== 'submitted' || contract.version !== input.expectedVersion) throw new Error('AMC contract is stale or is no longer awaiting approval.'); if (contract.requestedBy === actorId) throw new Error('AMC maker cannot decide the same contract.'); const remarks = clean(input.remarks, 'AMC decision remarks', 4, 500); const next = mutate(state); next.assetAmcContracts = next.assetAmcContracts.map((item) => item.id === contract.id ? { ...item, status: input.decision === 'approved' ? 'approved' : 'cancelled', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, version: item.version + 1 } : item); return next; }
export function updateAssetAmcStatus<S extends AssetMaintenanceState>(state: S, input: UpdateAssetAmcStatusInput): S { const contract = amcFor(state, input.id); if (contract.version !== input.expectedVersion || contract.status !== 'approved' && contract.status !== 'active') throw new Error('Only an approved or active AMC can change operational status.'); const next = mutate(state); next.assetAmcContracts = next.assetAmcContracts.map((item) => item.id === contract.id ? { ...item, status: input.status, version: item.version + 1 } : item); return next; }

export function createAssetMeter<S extends AssetMaintenanceState>(state: S, input: CreateAssetMeterInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): S { const asset = assetFor(state, input.assetId); if (asset.status !== 'in-service') throw new Error('Meter requires an in-service asset.'); if (state.assetMeters.some((item) => item.assetId === asset.id && item.name.toLocaleLowerCase() === input.name.trim().toLocaleLowerCase() && item.active)) throw new Error('An active meter with this name already exists for the asset.'); const initialReading = input.initialReading === undefined ? 0 : input.initialReading; if (!Number.isFinite(initialReading) || initialReading < 0) throw new Error('Initial meter reading must be zero or greater.'); const next = mutate(state); next.assetMeters.unshift({ id, number: fiscalNumber('MTR', state.assetMeters.length + 1, now), assetId: asset.id, name: clean(input.name, 'Meter name'), meterType: input.meterType, unit: clean(input.unit, 'Meter unit', 1, 30), currentReading: initialReading, serviceThreshold: input.serviceThreshold, rolloverAt: input.rolloverAt, active: true, createdBy: actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }
export function recordAssetMeterReading<S extends AssetMaintenanceState>(state: S, input: RecordAssetMeterReadingInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): S { const meter = meterFor(state, input.meterId); if (!meter.active || meter.version !== input.expectedVersion) throw new Error('Meter is stale or inactive.'); const readingDate = dateOnly(input.readingDate, 'Meter reading date'); if (!Number.isFinite(input.reading) || input.reading < 0) throw new Error('Meter reading must be zero or greater.'); const validRollover = meter.rolloverAt !== undefined && input.reading < meter.currentReading && meter.currentReading >= meter.rolloverAt; if (input.reading < meter.currentReading && !validRollover) throw new Error('Meter reading cannot move backwards without a configured rollover.'); const delta = validRollover ? (meter.rolloverAt! - meter.currentReading) + input.reading : input.reading - meter.currentReading; const next = mutate(state); next.assetMeterReadings.unshift({ id, number: fiscalNumber('MRD', state.assetMeterReadings.length + 1, now), meterId: meter.id, assetId: meter.assetId, readingDate, reading: input.reading, delta, source: input.source, evidenceReference: clean(input.evidenceReference, 'Meter evidence reference', 4, 160), recordedBy: actorId, recordedAt: now, scope: structuredClone(next.scope), version: 1 }); next.assetMeters = next.assetMeters.map((item) => item.id === meter.id ? { ...item, currentReading: input.reading, version: item.version + 1 } : item); if (meter.serviceThreshold !== undefined && input.reading >= meter.serviceThreshold && !next.correctiveMaintenanceRequests.some((item) => item.meterId === meter.id && ['submitted', 'approved', 'in-progress'].includes(item.status))) next.correctiveMaintenanceRequests.unshift({ id: randomUUID(), number: fiscalNumber('COR', next.correctiveMaintenanceRequests.length + 1, now), assetId: meter.assetId, meterId: meter.id, priority: 'high', symptom: `${meter.name} reached service threshold`, dueOn: readingDate, status: 'submitted', requestedBy: actorId, requestedAt: now, evidenceReference: input.evidenceReference, scope: structuredClone(next.scope), version: 1 }); next.assetInstalledBaseEvents.unshift({ id: randomUUID(), number: fiscalNumber('IBE', next.assetInstalledBaseEvents.length + 1, now), assetId: meter.assetId, eventType: 'meter-reading', eventDate: readingDate, referenceType: 'asset-meter-reading', referenceId: id, summary: `${meter.name}: ${input.reading} ${meter.unit}`, evidenceReference: input.evidenceReference, actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }

export function createCorrectiveMaintenanceRequest<S extends AssetMaintenanceState>(state: S, input: CreateCorrectiveMaintenanceInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): S { const asset = assetFor(state, input.assetId); if (asset.status !== 'in-service') throw new Error('Corrective maintenance requires an in-service asset.'); const dueOn = dateOnly(input.dueOn, 'Corrective maintenance due date'); if (input.meterId) { const meter = meterFor(state, input.meterId); if (meter.assetId !== asset.id) throw new Error('Meter does not belong to the corrective-maintenance asset.'); } const next = mutate(state); next.correctiveMaintenanceRequests.unshift({ id, number: fiscalNumber('COR', state.correctiveMaintenanceRequests.length + 1, now), assetId: asset.id, meterId: input.meterId, priority: input.priority, symptom: clean(input.symptom, 'Corrective symptom', 8, 500), dueOn, status: 'submitted', requestedBy: actorId, requestedAt: now, evidenceReference: input.evidenceReference ? clean(input.evidenceReference, 'Corrective evidence reference', 4, 160) : undefined, scope: structuredClone(next.scope), version: 1 }); return next; }
export function transitionCorrectiveMaintenance<S extends AssetMaintenanceState>(state: S, input: TransitionCorrectiveMaintenanceInput, actorId: string, now = new Date().toISOString()): S { const request = correctiveFor(state, input.id); if (request.version !== input.expectedVersion) throw new Error('Corrective maintenance request is stale.'); const allowed: Record<CorrectiveMaintenanceStatus, CorrectiveMaintenanceStatus[]> = { submitted: ['approved', 'rejected'], approved: ['in-progress'], 'in-progress': ['completed'], completed: ['verified'], verified: [], rejected: [] }; if (!allowed[request.status].includes(input.transition)) throw new Error(`Corrective maintenance cannot transition from ${request.status} to ${input.transition}.`); if (input.transition === 'verified' && actorId === request.completedBy) throw new Error('The technician who completed corrective work cannot verify the same work.'); const next = mutate(state); next.correctiveMaintenanceRequests = next.correctiveMaintenanceRequests.map((item) => item.id === request.id ? { ...item, status: input.transition, rootCause: input.rootCause ? clean(input.rootCause, 'Corrective root cause', 8, 500) : item.rootCause, evidenceReference: input.evidenceReference ? clean(input.evidenceReference, 'Corrective evidence reference', 4, 160) : item.evidenceReference, approvedBy: input.transition === 'approved' ? actorId : item.approvedBy, approvedAt: input.transition === 'approved' ? now : item.approvedAt, startedBy: input.transition === 'in-progress' ? actorId : item.startedBy, startedAt: input.transition === 'in-progress' ? now : item.startedAt, completedBy: input.transition === 'completed' ? actorId : item.completedBy, completedAt: input.transition === 'completed' ? now : item.completedAt, verifiedBy: input.transition === 'verified' ? actorId : item.verifiedBy, verifiedAt: input.transition === 'verified' ? now : item.verifiedAt, version: item.version + 1 } : item); if (input.transition === 'verified') next.assetInstalledBaseEvents.unshift({ id: randomUUID(), number: fiscalNumber('IBE', next.assetInstalledBaseEvents.length + 1, now), assetId: request.assetId, eventType: 'maintenance', eventDate: now.slice(0, 10), referenceType: 'corrective-maintenance', referenceId: request.id, summary: request.symptom, evidenceReference: input.evidenceReference, actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }

export function createAssetCalibration<S extends AssetMaintenanceState>(state: S, input: CreateAssetCalibrationInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): S { const asset = assetFor(state, input.assetId); if (asset.status !== 'in-service') throw new Error('Calibration requires an in-service asset.'); const calibratedOn = dateOnly(input.calibratedOn, 'Calibration date'); const dueOn = dateOnly(input.dueOn, 'Calibration due date'); if (dueOn < calibratedOn) throw new Error('Calibration due date cannot precede the calibration date.'); const next = mutate(state); next.assetCalibrations.unshift({ id, number: fiscalNumber('CAL', state.assetCalibrations.length + 1, now), assetId: asset.id, instrumentReference: clean(input.instrumentReference, 'Instrument reference', 3, 120), calibratedOn, dueOn, standardReference: clean(input.standardReference, 'Calibration standard reference', 3, 120), result: input.result, uncertainty: input.uncertainty, certificateReference: clean(input.certificateReference, 'Calibration certificate reference', 4, 160), status: 'submitted', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }
export function decideAssetCalibration<S extends AssetMaintenanceState>(state: S, input: DecideAssetCalibrationInput, actorId: string, now = new Date().toISOString()): S { const record = calibrationFor(state, input.id); if (record.status !== 'submitted' || record.version !== input.expectedVersion) throw new Error('Calibration record is stale or is no longer awaiting approval.'); if (record.requestedBy === actorId) throw new Error('Calibration maker cannot decide the same record.'); const remarks = clean(input.remarks, 'Calibration decision remarks', 4, 500); const next = mutate(state); next.assetCalibrations = next.assetCalibrations.map((item) => item.id === record.id ? { ...item, status: input.decision === 'rejected' ? 'failed' : record.result === 'pass' ? 'valid' : 'failed', decidedBy: actorId, decidedAt: now, decisionRemarks: remarks, version: item.version + 1 } : item); if (input.decision === 'approved') next.assetInstalledBaseEvents.unshift({ id: randomUUID(), number: fiscalNumber('IBE', next.assetInstalledBaseEvents.length + 1, now), assetId: record.assetId, eventType: 'calibration', eventDate: record.calibratedOn, referenceType: 'asset-calibration', referenceId: record.id, summary: `Calibration ${record.result}`, evidenceReference: record.certificateReference, actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }

export function createAssetSparePart<S extends AssetMaintenanceState>(state: S, input: CreateAssetSparePartInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): S { const asset = assetFor(state, input.assetId); if (asset.status !== 'in-service') throw new Error('Spare parts require an in-service asset.'); if (!Number.isFinite(input.quantityOnHand) || input.quantityOnHand < 0 || !Number.isFinite(input.reorderPoint) || input.reorderPoint < 0 || !Number.isFinite(input.unitCost) || input.unitCost < 0) throw new Error('Spare quantities, reorder point and unit cost must be zero or greater.'); const next = mutate(state); next.assetSpareParts.unshift({ id, number: fiscalNumber('SPR', state.assetSpareParts.length + 1, now), assetId: asset.id, itemVariantId: clean(input.itemVariantId, 'Spare item variant', 2, 120), description: clean(input.description, 'Spare description', 3, 240), quantityOnHand: money(input.quantityOnHand), reorderPoint: money(input.reorderPoint), unitCost: money(input.unitCost), warehouseId: input.warehouseId, binId: input.binId, active: true, createdBy: actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }
export function issueAssetSpare<S extends AssetMaintenanceState>(state: S, input: IssueAssetSpareInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): S { const spare = spareFor(state, input.sparePartId); if (!spare.active || spare.version !== input.expectedVersion) throw new Error('Spare part record is stale or inactive.'); if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > spare.quantityOnHand) throw new Error('Spare issue quantity exceeds available stock.'); const next = mutate(state); next.assetSpareParts = next.assetSpareParts.map((item) => item.id === spare.id ? { ...item, quantityOnHand: money(item.quantityOnHand - input.quantity), version: item.version + 1 } : item); next.assetSpareIssues.unshift({ id, number: fiscalNumber('SPI', state.assetSpareIssues.length + 1, now), sparePartId: spare.id, assetId: spare.assetId, quantity: money(input.quantity), unitCost: spare.unitCost, workOrderId: input.workOrderId, issuedBy: actorId, issuedAt: now, evidenceReference: clean(input.evidenceReference, 'Spare issue evidence reference', 4, 160), scope: structuredClone(next.scope), version: 1 }); next.assetInstalledBaseEvents.unshift({ id: randomUUID(), number: fiscalNumber('IBE', next.assetInstalledBaseEvents.length + 1, now), assetId: spare.assetId, eventType: 'spare-issue', eventDate: now.slice(0, 10), referenceType: 'asset-spare-issue', referenceId: id, summary: `Issued ${input.quantity} ${spare.description}`, evidenceReference: input.evidenceReference, actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }

export function createFleetVehicle<S extends AssetMaintenanceState>(state: S, input: CreateFleetVehicleInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): S { const asset = assetFor(state, input.assetId); if (asset.status !== 'in-service') throw new Error('Fleet vehicle must reference an in-service asset.'); if (input.odometer !== undefined && (!Number.isFinite(input.odometer) || input.odometer < 0)) throw new Error('Vehicle odometer must be zero or greater.'); if (state.fleetVehicles.some((item) => item.registrationNumber.toLocaleLowerCase() === input.registrationNumber.trim().toLocaleLowerCase() && item.status !== 'retired')) throw new Error('Fleet registration number is already active.'); const next = mutate(state); next.fleetVehicles.unshift({ id, number: fiscalNumber('FLT', state.fleetVehicles.length + 1, now), assetId: asset.id, registrationNumber: clean(input.registrationNumber, 'Vehicle registration number', 4, 30).toUpperCase(), vehicleType: clean(input.vehicleType, 'Vehicle type', 2, 80), odometer: input.odometer ?? 0, fuelType: clean(input.fuelType, 'Fuel type', 2, 40), status: 'available', insuranceExpiry: input.insuranceExpiry ? dateOnly(input.insuranceExpiry, 'Insurance expiry') : undefined, pucExpiry: input.pucExpiry ? dateOnly(input.pucExpiry, 'PUC expiry') : undefined, permitExpiry: input.permitExpiry ? dateOnly(input.permitExpiry, 'Permit expiry') : undefined, createdBy: actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }
export function updateFleetVehicle<S extends AssetMaintenanceState>(state: S, input: UpdateFleetVehicleInput): S { const vehicle = vehicleFor(state, input.id); if (vehicle.version !== input.expectedVersion) throw new Error('Fleet vehicle is stale.'); if (input.odometer !== undefined && input.odometer < vehicle.odometer) throw new Error('Odometer cannot move backwards.'); const next = mutate(state); next.fleetVehicles = next.fleetVehicles.map((item) => item.id === vehicle.id ? { ...item, status: input.status, odometer: input.odometer ?? item.odometer, version: item.version + 1 } : item); return next; }
export function createFleetTrip<S extends AssetMaintenanceState>(state: S, input: CreateFleetTripInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): S { const vehicle = vehicleFor(state, input.vehicleId); if (vehicle.status !== 'available') throw new Error('Only an available vehicle can be assigned a trip.'); const tripDate = dateOnly(input.tripDate, 'Fleet trip date'); const next = mutate(state); next.fleetTrips.unshift({ id, number: fiscalNumber('TRP', state.fleetTrips.length + 1, now), vehicleId: vehicle.id, driverUserId: clean(input.driverUserId, 'Fleet driver', 2, 100), tripDate, origin: clean(input.origin, 'Trip origin', 2, 160), destination: clean(input.destination, 'Trip destination', 2, 160), openingOdometer: vehicle.odometer, purpose: clean(input.purpose, 'Trip purpose', 4, 300), status: 'planned', evidenceReference: input.evidenceReference ? clean(input.evidenceReference, 'Trip evidence reference', 4, 160) : undefined, createdBy: actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }); next.fleetVehicles = next.fleetVehicles.map((item) => item.id === vehicle.id ? { ...item, status: 'assigned', version: item.version + 1 } : item); return next; }
export function completeFleetTrip<S extends AssetMaintenanceState>(state: S, input: CompleteFleetTripInput, actorId: string, now = new Date().toISOString()): S { const trip = tripFor(state, input.id); if (!['planned', 'started'].includes(trip.status) || trip.version !== input.expectedVersion) throw new Error('Fleet trip is stale or cannot be completed.'); const vehicle = vehicleFor(state, trip.vehicleId); if (input.closingOdometer < trip.openingOdometer) throw new Error('Closing odometer cannot precede the opening odometer.'); const next = mutate(state); next.fleetTrips = next.fleetTrips.map((item) => item.id === trip.id ? { ...item, status: 'completed', closingOdometer: input.closingOdometer, distance: money(input.closingOdometer - trip.openingOdometer), evidenceReference: clean(input.evidenceReference, 'Trip completion evidence reference', 4, 160), completedBy: actorId, completedAt: now, version: item.version + 1 } : item); next.fleetVehicles = next.fleetVehicles.map((item) => item.id === vehicle.id ? { ...item, status: 'available', odometer: input.closingOdometer, version: item.version + 1 } : item); next.assetInstalledBaseEvents.unshift({ id: randomUUID(), number: fiscalNumber('IBE', next.assetInstalledBaseEvents.length + 1, now), assetId: vehicle.assetId, eventType: 'fleet-trip', eventDate: trip.tripDate, referenceType: 'fleet-trip', referenceId: trip.id, summary: `${trip.origin} to ${trip.destination} / ${input.closingOdometer - trip.openingOdometer} km`, evidenceReference: input.evidenceReference, actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 }); return next; }

export function createPreventiveMaintenancePlan<S extends AssetMaintenanceState>(
  state: S,
  input: CreatePreventiveMaintenancePlanInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): S {
  const asset = assetFor(state, input.assetId);
  if (asset.status !== 'in-service') {
    throw new Error('Preventive maintenance plan requires an in-service asset.');
  }
  const intervalDays = positiveInteger(input.intervalDays, 'Maintenance interval', MAX_INTERVAL_DAYS);
  const estimatedMinutes = positiveInteger(input.estimatedMinutes, 'Estimated maintenance minutes', MAX_MINUTES);
  const nextDueOn = dateOnly(input.nextDueOn, 'Next maintenance due date');
  if (nextDueOn < asset.availableForUseOn) {
    throw new Error('Next maintenance due date cannot precede the asset available-for-use date.');
  }
  if (!Array.isArray(input.checklist) || input.checklist.length < 1 || input.checklist.length > 50) {
    throw new Error('Preventive maintenance plan needs 1-50 checklist items.');
  }
  const checklist = input.checklist.map((item, index) => ({
    id: randomUUID(),
    title: clean(item.title, `Checklist item ${index + 1}`, 2, 200),
    required: Boolean(item.required),
  }));
  if (new Set(checklist.map((item) => item.title.toLocaleLowerCase())).size !== checklist.length) {
    throw new Error('Preventive maintenance checklist items must be unique.');
  }
  const next = mutate(state);
  const plan: PreventiveMaintenancePlan = {
    id,
    number: fiscalNumber('MNT', state.preventiveMaintenancePlans.length + 1, now),
    assetId: asset.id,
    name: clean(input.name, 'Preventive maintenance plan name'),
    intervalDays,
    nextDueOn,
    estimatedMinutes,
    checklist,
    status: 'active',
    createdBy: actorId,
    createdAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  };
  next.preventiveMaintenancePlans.unshift(plan);
  return next;
}

export function generateDueMaintenanceWorkOrder<S extends AssetMaintenanceState>(
  state: S,
  input: GenerateDueMaintenanceWorkOrderInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): S {
  const plan = planFor(state, input.planId);
  const asset = assetFor(state, plan.assetId);
  if (plan.status !== 'active' || asset.status !== 'in-service') {
    throw new Error('Due maintenance work order requires an active plan for an in-service asset.');
  }
  if (plan.version !== input.expectedVersion) {
    throw new Error('Preventive maintenance plan changed. Refresh and retry.');
  }
  const asOfDate = dateOnly(input.asOfDate, 'As-of date');
  const technicianUserId = clean(input.technicianUserId, 'Maintenance technician', 2, 100);
  if (asOfDate < plan.nextDueOn) {
    throw new Error('Preventive maintenance is not due yet.');
  }
  if (state.maintenanceWorkOrders.some((workOrder) => workOrder.planId === plan.id && workOrder.dueOn === plan.nextDueOn)) {
    throw new Error('A maintenance work order already exists for this plan due date.');
  }
  const next = mutate(state);
  const workOrder: MaintenanceWorkOrder = {
    id,
    number: fiscalNumber('MWO', state.maintenanceWorkOrders.length + 1, now),
    planId: plan.id,
    assetId: asset.id,
    dueOn: plan.nextDueOn,
    technicianUserId,
    status: 'scheduled',
    checklist: plan.checklist.map((item) => ({ ...item, completed: false })),
    generatedBy: actorId,
    generatedAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  };
  next.maintenanceWorkOrders.unshift(workOrder);
  next.preventiveMaintenancePlans = next.preventiveMaintenancePlans.map((candidate) => candidate.id === plan.id
    ? { ...candidate, lastGeneratedAt: now, lastWorkOrderId: workOrder.id, version: candidate.version + 1 }
    : candidate);
  return next;
}

export function startMaintenanceWorkOrder<S extends AssetMaintenanceState>(
  state: S,
  input: StartMaintenanceWorkOrderInput,
  actorId: string,
  now = new Date().toISOString(),
): S {
  const workOrder = workOrderFor(state, input.id);
  if (workOrder.status !== 'scheduled' || workOrder.version !== input.expectedVersion) {
    throw new Error('Maintenance work order is stale or cannot be started.');
  }
  if (workOrder.technicianUserId !== actorId) {
    throw new Error('Only the assigned maintenance technician can start this work order.');
  }
  const next = mutate(state);
  next.maintenanceWorkOrders = next.maintenanceWorkOrders.map((candidate) => candidate.id === workOrder.id
    ? { ...candidate, status: 'in-progress', startedBy: actorId, startedAt: now, version: candidate.version + 1 }
    : candidate);
  return next;
}

export function completeMaintenanceWorkOrder<S extends AssetMaintenanceState>(
  state: S,
  input: CompleteMaintenanceWorkOrderInput,
  actorId: string,
  now = new Date().toISOString(),
): S {
  const workOrder = workOrderFor(state, input.id);
  if (workOrder.status !== 'in-progress' || workOrder.version !== input.expectedVersion) {
    throw new Error('Maintenance work order is stale or cannot be completed.');
  }
  if (workOrder.technicianUserId !== actorId) {
    throw new Error('Only the assigned maintenance technician can complete this work order.');
  }
  const completedIds = [...new Set(input.completedChecklistItemIds)];
  if (completedIds.length !== input.completedChecklistItemIds.length || completedIds.some((id) => !workOrder.checklist.some((item) => item.id === id))) {
    throw new Error('Maintenance checklist completion contains an unknown or repeated item.');
  }
  if (workOrder.checklist.some((item) => item.required && !completedIds.includes(item.id))) {
    throw new Error('Every required maintenance checklist item must be completed.');
  }
  const next = mutate(state);
  next.maintenanceWorkOrders = next.maintenanceWorkOrders.map((candidate) => candidate.id === workOrder.id
    ? {
        ...candidate,
        status: 'completed',
        checklist: candidate.checklist.map((item) => ({ ...item, completed: completedIds.includes(item.id) })),
        completedBy: actorId,
        completedAt: now,
        serviceReport: clean(input.serviceReport, 'Maintenance service report', 8, 2_000),
        completionEvidenceReference: clean(input.completionEvidenceReference, 'Maintenance completion evidence reference', 4, 160),
        version: candidate.version + 1,
      }
    : candidate);
  return next;
}

export function verifyMaintenanceWorkOrder<S extends AssetMaintenanceState>(
  state: S,
  input: VerifyMaintenanceWorkOrderInput,
  actorId: string,
  now = new Date().toISOString(),
): S {
  const workOrder = workOrderFor(state, input.id);
  if (workOrder.status !== 'completed' || workOrder.version !== input.expectedVersion) {
    throw new Error('Maintenance work order is stale or is not ready for verification.');
  }
  if (workOrder.generatedBy === actorId || workOrder.completedBy === actorId) {
    throw new Error('Maintenance work-order maker or technician cannot verify the same work.');
  }
  const plan = planFor(state, workOrder.planId);
  if (plan.assetId !== workOrder.assetId || plan.status !== 'active') {
    throw new Error('Maintenance plan is no longer active for this work order.');
  }
  const remarks = clean(input.remarks, 'Maintenance verification remarks', 4, 500);
  const next = mutate(state);
  if (input.decision === 'reopened') {
    next.maintenanceWorkOrders = next.maintenanceWorkOrders.map((candidate) => candidate.id === workOrder.id
      ? {
          ...candidate,
          status: 'in-progress',
          reopenedBy: actorId,
          reopenedAt: now,
          reopenRemarks: remarks,
          version: candidate.version + 1,
        }
      : candidate);
    return next;
  }
  next.maintenanceWorkOrders = next.maintenanceWorkOrders.map((candidate) => candidate.id === workOrder.id
    ? {
        ...candidate,
        status: 'verified',
        verifiedBy: actorId,
        verifiedAt: now,
        verificationRemarks: remarks,
        version: candidate.version + 1,
      }
    : candidate);
  next.preventiveMaintenancePlans = next.preventiveMaintenancePlans.map((candidate) => candidate.id === plan.id
    ? {
        ...candidate,
        nextDueOn: addDays(workOrder.dueOn, candidate.intervalDays),
        lastVerifiedAt: now,
        version: candidate.version + 1,
      }
    : candidate);
  return next;
}
