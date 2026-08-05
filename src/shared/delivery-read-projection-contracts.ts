import type {
  DeliveryProject,
  FieldServiceJob,
  ProjectTask,
  ServiceAgreement,
  SupportTicket,
  TimeEntry,
} from './delivery-contracts';
import type { OperatingRecordScope } from './revenue-ops-contracts';

export interface DeliveryReadAccessDecision {
  allowed: boolean;
  deniedFields: string[];
}

type ReadRedacted<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type ProjectedDeliveryProject = ReadRedacted<DeliveryProject, 'budgetAmount'>;
export type ProjectedTimeEntry = ReadRedacted<TimeEntry, 'hourlyCost' | 'costAmount'>;

export interface DeliveryReadProjection {
  scope: OperatingRecordScope;
  generatedAt: string;
  hiddenCollections: string[];
  redactedFields: Record<string, string[]>;
  redactedMetrics: string[];
  deliveryProjects: ProjectedDeliveryProject[];
  projectTasks: ProjectTask[];
  timeEntries: ProjectedTimeEntry[];
  serviceAgreements: ServiceAgreement[];
  supportTickets: SupportTicket[];
  fieldServiceJobs: FieldServiceJob[];
}
