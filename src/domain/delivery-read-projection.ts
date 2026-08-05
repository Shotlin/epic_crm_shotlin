import type {
  RevenueOpsSnapshot,
  RevenueOpsState,
} from '../shared/revenue-ops-contracts';
import type {
  DeliveryReadAccessDecision,
  DeliveryReadProjection,
} from '../shared/delivery-read-projection-contracts';

type ScopedRecord = { scope?: { companyId: string; branchId: string } };

export const DELIVERY_READ_COLLECTIONS = [
  ['deliveryProjects', 'delivery.project'],
  ['projectTasks', 'delivery.project'],
  ['timeEntries', 'delivery.project'],
  ['serviceAgreements', 'delivery.service'],
  ['supportTickets', 'delivery.service'],
  ['fieldServiceJobs', 'delivery.service'],
] as const;

type DeliveryCollection = typeof DELIVERY_READ_COLLECTIONS[number][0];
type DeliveryReadSource = Pick<RevenueOpsState, 'scope' | DeliveryCollection>
  | Pick<RevenueOpsSnapshot, 'scope' | DeliveryCollection>;

const DELIVERY_COLLECTION_METRICS: Record<DeliveryCollection, readonly string[]> = {
  deliveryProjects: ['activeProjects', 'projectBudgetAtRisk', 'approvedBillableHours', 'approvedDeliveryCost'],
  projectTasks: ['projectBudgetAtRisk'],
  timeEntries: ['approvedBillableHours', 'approvedDeliveryCost'],
  serviceAgreements: [],
  supportTickets: ['supportOpen', 'slaBreaches'],
  fieldServiceJobs: ['fieldJobsActive', 'fieldJobsCompleted'],
};

const DELIVERY_FIELD_METRICS: Record<string, readonly string[]> = {
  'delivery.project.hourlyCost': ['approvedDeliveryCost'],
  'delivery.project.costAmount': ['approvedDeliveryCost'],
};

function isInScope(record: ScopedRecord, scope: DeliveryReadSource['scope']): boolean {
  return record.scope?.companyId === scope.companyId && record.scope?.branchId === scope.branchId;
}

function redact<T extends object>(record: T, fields: readonly string[]): T {
  const copy = { ...record } as Record<string, unknown>;
  for (const field of fields) delete copy[field];
  return copy as T;
}

export function createDeliveryReadProjection(
  state: DeliveryReadSource,
  getDecision: (resource: string) => DeliveryReadAccessDecision,
  generatedAt = new Date().toISOString(),
): DeliveryReadProjection {
  const projected = {} as Record<DeliveryCollection, unknown[]>;
  const hiddenCollections: string[] = [];
  const redactedFields: Record<string, string[]> = {};
  const redactedMetrics: string[] = [];
  const stateRecord = state as unknown as Record<DeliveryCollection, ScopedRecord[]>;

  for (const [collection, resource] of DELIVERY_READ_COLLECTIONS) {
    const decision = getDecision(resource);
    if (!decision.allowed) {
      projected[collection] = [];
      hiddenCollections.push(collection);
      redactedMetrics.push(...DELIVERY_COLLECTION_METRICS[collection]);
      continue;
    }
    if (decision.deniedFields.length) {
      redactedFields[resource] = [...decision.deniedFields];
      for (const field of decision.deniedFields) {
        redactedMetrics.push(...(DELIVERY_FIELD_METRICS[`${resource}.${field}`] ?? []));
      }
    }
    projected[collection] = stateRecord[collection]
      .filter((record) => isInScope(record, state.scope))
      .map((record) => redact(record, decision.deniedFields));
  }

  return {
    scope: structuredClone(state.scope),
    generatedAt,
    hiddenCollections,
    redactedFields,
    redactedMetrics: [...new Set(redactedMetrics)],
    deliveryProjects: projected.deliveryProjects as DeliveryReadProjection['deliveryProjects'],
    projectTasks: projected.projectTasks as DeliveryReadProjection['projectTasks'],
    timeEntries: projected.timeEntries as DeliveryReadProjection['timeEntries'],
    serviceAgreements: projected.serviceAgreements as DeliveryReadProjection['serviceAgreements'],
    supportTickets: projected.supportTickets as DeliveryReadProjection['supportTickets'],
    fieldServiceJobs: projected.fieldServiceJobs as DeliveryReadProjection['fieldServiceJobs'],
  };
}
