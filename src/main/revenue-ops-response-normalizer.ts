import type { PeopleReadProjection } from '../shared/people-read-projection-contracts';
import type { DeliveryReadProjection } from '../shared/delivery-read-projection-contracts';
import type { FinanceReadProjection } from '../shared/finance-read-projection-contracts';
import type { SupplyChainReadProjection } from '../shared/supply-chain-read-projection-contracts';
import { SUPPLY_CHAIN_READ_COLLECTION_NAMES } from '../shared/supply-chain-read-projection-contracts';
import type { StatutoryProviderReadProjection } from '../shared/statutory-provider-read-projection-contracts';
import { STATUTORY_PROVIDER_READ_COLLECTION_NAMES } from '../shared/statutory-provider-read-projection-contracts';
import type { ManufacturingReadProjection } from '../shared/manufacturing-read-projection-contracts';
import { MANUFACTURING_READ_COLLECTION_NAMES } from '../shared/manufacturing-read-projection-contracts';
import type { AssetMaintenanceReadProjection } from '../shared/asset-maintenance-read-projection-contracts';
import { ASSET_MAINTENANCE_READ_COLLECTION_NAMES } from '../shared/asset-maintenance-read-projection-contracts';
import type { ProjectFinanceReadProjection } from '../shared/project-finance-read-projection-contracts';
import { PROJECT_FINANCE_READ_COLLECTION_NAMES } from '../shared/project-finance-read-projection-contracts';
import type { SalesReadProjection } from '../shared/sales-read-projection-contracts';
import { SALES_READ_COLLECTION_NAMES } from '../shared/sales-read-projection-contracts';
import type {
  ProjectedRevenueOpsMetrics,
  RevenueOpsSnapshot,
} from '../shared/revenue-ops-contracts';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function mergeRedactedFields(
  current: Record<string, string[]>,
  incoming: Record<string, string[]>,
): Record<string, string[]> {
  const merged = structuredClone(current);
  for (const [resource, fields] of Object.entries(incoming)) {
    merged[resource] = unique([...(merged[resource] ?? []), ...fields]);
  }
  return merged;
}

function isRevenueOpsSnapshot(value: unknown): value is RevenueOpsSnapshot {
  if (!isRecord(value)) return false;
  const scope = value.scope;
  return typeof value.revision === 'number'
    && isRecord(scope)
    && typeof scope.companyId === 'string'
    && typeof scope.branchId === 'string'
    && isRecord(value.readProjection)
    && Array.isArray(value.workforceProfiles)
    && Array.isArray(value.payrollRuns)
    && isRecord(value.metrics);
}

export function applyPeopleReadProjectionToSnapshot(
  snapshot: RevenueOpsSnapshot,
  projection: PeopleReadProjection,
  actorId: string,
): RevenueOpsSnapshot {
  if (
    snapshot.scope.companyId !== projection.scope.companyId
    || snapshot.scope.branchId !== projection.scope.branchId
  ) {
    throw new Error('People read projection scope does not match the Revenue Operations snapshot.');
  }

  const metrics = { ...snapshot.metrics } as UnknownRecord;
  for (const metric of projection.redactedMetrics) delete metrics[metric];

  return {
    ...snapshot,
    readProjection: {
      ...snapshot.readProjection,
      companyId: projection.scope.companyId,
      branchId: projection.scope.branchId,
      generatedForUserId: actorId,
      hiddenCollections: unique([
        ...snapshot.readProjection.hiddenCollections,
        ...projection.hiddenCollections,
      ]),
      redactedFields: mergeRedactedFields(
        snapshot.readProjection.redactedFields,
        projection.redactedFields,
      ),
      redactedMetrics: unique([
        ...snapshot.readProjection.redactedMetrics,
        ...projection.redactedMetrics,
      ]),
    },
    workforceProfiles: projection.workforceProfiles,
    workforceAvailabilities: projection.workforceAvailabilities,
    workforceAllocations: projection.workforceAllocations,
    employerRegistrations: projection.employerRegistrations,
    payrollPolicies: projection.payrollPolicies,
    payrollCompensations: projection.payrollCompensations,
    benefitPlans: projection.benefitPlans,
    benefitEnrollments: projection.benefitEnrollments,
    payrollRuns: projection.payrollRuns,
    payrollSlips: projection.payrollSlips,
    payrollStatutoryObligations: projection.payrollStatutoryObligations,
    expenseClaims: projection.expenseClaims,
    attendanceRecords: projection.attendanceRecords,
    leaveTypes: projection.leaveTypes,
    leaveApplications: projection.leaveApplications,
    payrollAdjustments: projection.payrollAdjustments,
    taxDeclarations: projection.taxDeclarations,
    payslipDeliveries: projection.payslipDeliveries,
    metrics: metrics as ProjectedRevenueOpsMetrics,
  };
}

export function applyDeliveryReadProjectionToSnapshot(
  snapshot: RevenueOpsSnapshot,
  projection: DeliveryReadProjection,
  actorId: string,
): RevenueOpsSnapshot {
  if (
    snapshot.scope.companyId !== projection.scope.companyId
    || snapshot.scope.branchId !== projection.scope.branchId
  ) {
    throw new Error('Delivery read projection scope does not match the Revenue Operations snapshot.');
  }

  const metrics = { ...snapshot.metrics } as UnknownRecord;
  for (const metric of projection.redactedMetrics) delete metrics[metric];

  return {
    ...snapshot,
    readProjection: {
      ...snapshot.readProjection,
      companyId: projection.scope.companyId,
      branchId: projection.scope.branchId,
      generatedForUserId: actorId,
      hiddenCollections: unique([
        ...snapshot.readProjection.hiddenCollections,
        ...projection.hiddenCollections,
      ]),
      redactedFields: mergeRedactedFields(
        snapshot.readProjection.redactedFields,
        projection.redactedFields,
      ),
      redactedMetrics: unique([
        ...snapshot.readProjection.redactedMetrics,
        ...projection.redactedMetrics,
      ]),
    },
    deliveryProjects: projection.deliveryProjects,
    projectTasks: projection.projectTasks,
    timeEntries: projection.timeEntries,
    serviceAgreements: projection.serviceAgreements,
    supportTickets: projection.supportTickets,
    fieldServiceJobs: projection.fieldServiceJobs,
    metrics: metrics as ProjectedRevenueOpsMetrics,
  };
}

export function applyFinanceReadProjectionToSnapshot(
  snapshot: RevenueOpsSnapshot,
  projection: FinanceReadProjection,
  actorId: string,
): RevenueOpsSnapshot {
  if (
    snapshot.scope.companyId !== projection.scope.companyId
    || snapshot.scope.branchId !== projection.scope.branchId
  ) {
    throw new Error('Finance read projection scope does not match the Revenue Operations snapshot.');
  }

  const metrics = { ...snapshot.metrics } as UnknownRecord;
  for (const metric of projection.redactedMetrics) delete metrics[metric];

  return {
    ...snapshot,
    readProjection: {
      ...snapshot.readProjection,
      companyId: projection.scope.companyId,
      branchId: projection.scope.branchId,
      generatedForUserId: actorId,
      hiddenCollections: unique([...snapshot.readProjection.hiddenCollections, ...projection.hiddenCollections]),
      redactedFields: mergeRedactedFields(snapshot.readProjection.redactedFields, projection.redactedFields),
      redactedMetrics: unique([...snapshot.readProjection.redactedMetrics, ...projection.redactedMetrics]),
    },
    invoices: projection.invoices,
    creditDebitNotes: projection.creditDebitNotes,
    receivables: projection.receivables,
    paymentReceipts: projection.paymentReceipts,
    creditLimitControls: projection.creditLimitControls,
    dunningCases: projection.dunningCases,
    collectionActivities: projection.collectionActivities,
    receivableDisputes: projection.receivableDisputes,
    writeOffRequests: projection.writeOffRequests,
    withholdingPolicies: projection.withholdingPolicies,
    withholdingEntries: projection.withholdingEntries,
    zeroRatedSupplyReviews: projection.zeroRatedSupplyReviews,
    bankAccounts: projection.bankAccounts,
    bankStatementImports: projection.bankStatementImports,
    bankStatementLines: projection.bankStatementLines,
    codCollectionCases: projection.codCollectionCases,
    treasuryPositions: projection.treasuryPositions,
    cashForecastRuns: projection.cashForecastRuns,
    paymentProposals: projection.paymentProposals,
    bankCharges: projection.bankCharges,
    settlementExceptions: projection.settlementExceptions,
    liquiditySweeps: projection.liquiditySweeps,
    metrics: metrics as ProjectedRevenueOpsMetrics,
  };
}

export function applySupplyChainReadProjectionToSnapshot(
  snapshot: RevenueOpsSnapshot,
  projection: SupplyChainReadProjection,
  actorId: string,
): RevenueOpsSnapshot {
  if (snapshot.scope.companyId !== projection.scope.companyId || snapshot.scope.branchId !== projection.scope.branchId) {
    throw new Error('Supply-chain read projection scope does not match the Revenue Operations snapshot.');
  }
  const metrics = { ...snapshot.metrics } as UnknownRecord;
  for (const metric of projection.redactedMetrics) delete metrics[metric];
  const next: Record<string, unknown> = {
    ...snapshot,
    readProjection: {
      ...snapshot.readProjection,
      companyId: projection.scope.companyId, branchId: projection.scope.branchId, generatedForUserId: actorId,
      hiddenCollections: unique([...snapshot.readProjection.hiddenCollections, ...projection.hiddenCollections]),
      redactedFields: mergeRedactedFields(snapshot.readProjection.redactedFields, projection.redactedFields),
      redactedMetrics: unique([...snapshot.readProjection.redactedMetrics, ...projection.redactedMetrics]),
    },
    metrics: metrics as ProjectedRevenueOpsMetrics,
  };
  for (const collection of SUPPLY_CHAIN_READ_COLLECTION_NAMES) next[collection] = projection[collection];
  return next as unknown as RevenueOpsSnapshot;
}

export function applyStatutoryProviderReadProjectionToSnapshot(snapshot: RevenueOpsSnapshot, projection: StatutoryProviderReadProjection, actorId: string): RevenueOpsSnapshot {
  if (snapshot.scope.companyId !== projection.scope.companyId || snapshot.scope.branchId !== projection.scope.branchId) throw new Error('Statutory/provider read projection scope does not match the Revenue Operations snapshot.');
  const metrics = { ...snapshot.metrics } as UnknownRecord;
  for (const metric of projection.redactedMetrics) delete metrics[metric];
  const next: Record<string, unknown> = {
    ...snapshot,
    readProjection: {
      ...snapshot.readProjection, companyId: projection.scope.companyId, branchId: projection.scope.branchId, generatedForUserId: actorId,
      hiddenCollections: unique([...snapshot.readProjection.hiddenCollections, ...projection.hiddenCollections]),
      redactedFields: mergeRedactedFields(snapshot.readProjection.redactedFields, projection.redactedFields),
      redactedMetrics: unique([...snapshot.readProjection.redactedMetrics, ...projection.redactedMetrics]),
    },
    metrics: metrics as ProjectedRevenueOpsMetrics,
  };
  for (const collection of STATUTORY_PROVIDER_READ_COLLECTION_NAMES) next[collection] = projection[collection];
  return next as unknown as RevenueOpsSnapshot;
}

export function applyManufacturingReadProjectionToSnapshot(snapshot: RevenueOpsSnapshot, projection: ManufacturingReadProjection, actorId: string): RevenueOpsSnapshot {
  if (snapshot.scope.companyId !== projection.scope.companyId || snapshot.scope.branchId !== projection.scope.branchId) throw new Error('Manufacturing read projection scope does not match the Revenue Operations snapshot.');
  const metrics = { ...snapshot.metrics } as UnknownRecord;
  for (const metric of projection.redactedMetrics) delete metrics[metric];
  const next: Record<string, unknown> = { ...snapshot, readProjection: {
    ...snapshot.readProjection, companyId: projection.scope.companyId, branchId: projection.scope.branchId, generatedForUserId: actorId,
    hiddenCollections: unique([...snapshot.readProjection.hiddenCollections, ...projection.hiddenCollections]),
    redactedFields: mergeRedactedFields(snapshot.readProjection.redactedFields, projection.redactedFields),
    redactedMetrics: unique([...snapshot.readProjection.redactedMetrics, ...projection.redactedMetrics]),
  }, metrics: metrics as ProjectedRevenueOpsMetrics };
  for (const collection of MANUFACTURING_READ_COLLECTION_NAMES) next[collection] = projection[collection];
  return next as unknown as RevenueOpsSnapshot;
}

export function applyAssetMaintenanceReadProjectionToSnapshot(
  snapshot: RevenueOpsSnapshot,
  projection: AssetMaintenanceReadProjection,
  actorId: string,
): RevenueOpsSnapshot {
  if (snapshot.scope.companyId !== projection.scope.companyId || snapshot.scope.branchId !== projection.scope.branchId) {
    throw new Error('Asset-maintenance read projection scope does not match the Revenue Operations snapshot.');
  }
  const next: Record<string, unknown> = {
    ...snapshot,
    readProjection: {
      ...snapshot.readProjection,
      companyId: projection.scope.companyId,
      branchId: projection.scope.branchId,
      generatedForUserId: actorId,
      hiddenCollections: unique([...snapshot.readProjection.hiddenCollections, ...projection.hiddenCollections]),
      redactedFields: mergeRedactedFields(snapshot.readProjection.redactedFields, projection.redactedFields),
      redactedMetrics: unique([...snapshot.readProjection.redactedMetrics, ...projection.redactedMetrics]),
    },
  };
  for (const collection of ASSET_MAINTENANCE_READ_COLLECTION_NAMES) next[collection] = projection[collection];
  return next as unknown as RevenueOpsSnapshot;
}

export function applyProjectFinanceReadProjectionToSnapshot(snapshot: RevenueOpsSnapshot, projection: ProjectFinanceReadProjection, actorId: string): RevenueOpsSnapshot {
  if (snapshot.scope.companyId !== projection.scope.companyId || snapshot.scope.branchId !== projection.scope.branchId) throw new Error('Project-finance read projection scope does not match the Revenue Operations snapshot.');
  const metrics = { ...snapshot.metrics } as UnknownRecord; for (const metric of projection.redactedMetrics) delete metrics[metric];
  const next: Record<string, unknown> = { ...snapshot, readProjection: { ...snapshot.readProjection, companyId: projection.scope.companyId, branchId: projection.scope.branchId, generatedForUserId: actorId, hiddenCollections: unique([...snapshot.readProjection.hiddenCollections, ...projection.hiddenCollections]), redactedFields: mergeRedactedFields(snapshot.readProjection.redactedFields, projection.redactedFields), redactedMetrics: unique([...snapshot.readProjection.redactedMetrics, ...projection.redactedMetrics]) }, metrics: metrics as ProjectedRevenueOpsMetrics };
  for (const collection of PROJECT_FINANCE_READ_COLLECTION_NAMES) next[collection] = projection[collection];
  return next as unknown as RevenueOpsSnapshot;
}

export function applySalesReadProjectionToSnapshot(snapshot: RevenueOpsSnapshot, projection: SalesReadProjection, actorId: string): RevenueOpsSnapshot {
  if (snapshot.scope.companyId !== projection.scope.companyId || snapshot.scope.branchId !== projection.scope.branchId) throw new Error('Sales read projection scope does not match the Revenue Operations snapshot.');
  const metrics = { ...snapshot.metrics } as UnknownRecord;
  for (const metric of projection.redactedMetrics) delete metrics[metric];
  const next: Record<string, unknown> = { ...snapshot, readProjection: { ...snapshot.readProjection, companyId: projection.scope.companyId, branchId: projection.scope.branchId, generatedForUserId: actorId, hiddenCollections: unique([...snapshot.readProjection.hiddenCollections, ...projection.hiddenCollections]), redactedFields: mergeRedactedFields(snapshot.readProjection.redactedFields, projection.redactedFields), redactedMetrics: unique([...snapshot.readProjection.redactedMetrics, ...projection.redactedMetrics]) }, metrics: metrics as ProjectedRevenueOpsMetrics };
  for (const collection of SALES_READ_COLLECTION_NAMES) next[collection] = projection[collection];
  return next as unknown as RevenueOpsSnapshot;
}

export function normalizeRevenueOpsResponse<T>(
  response: T,
  projectSnapshot: (snapshot: RevenueOpsSnapshot) => RevenueOpsSnapshot,
): T {
  if (isRevenueOpsSnapshot(response)) return projectSnapshot(response) as T;
  if (isRecord(response) && isRevenueOpsSnapshot(response.revenue)) {
    return { ...response, revenue: projectSnapshot(response.revenue) } as T;
  }
  return response;
}
