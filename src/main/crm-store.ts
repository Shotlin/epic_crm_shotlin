import {
  readFile,
  rename,
} from 'node:fs/promises';
import path from 'node:path';
import {
  addLead,
  addOpportunity,
  assignOpportunities,
  createCleanCrmState,
  finishActivity,
  getDashboardSnapshot,
  localizeInitialCrmStateForIndia,
  convertLead,
  importLeads,
  moveOpportunity,
} from '../domain/crm';
import type {
  CompleteActivityInput,
  CreateLeadInput,
  CreateOpportunityInput,
  CrmState,
  DashboardSnapshot,
  MoveOpportunityInput,
  Lead,
  Opportunity,
  Owner,
} from '../shared/contracts';
import type { PipelineMovePolicy } from '../shared/crm-depth-contracts';
import type { BusinessDatabase } from './database';

/**
 * Narrow, one-way starter-state aliases. These identifiers were emitted by
 * early Epic BOS demos only; custom tenant scopes are never rewritten.
 */
const LEGACY_DEMO_TENANT_ID = 'tenant-epic';
const CANONICAL_DEMO_TENANT_ID = 'tenant-northstar';
const LEGACY_DEMO_COMPANY_ID = 'company-northstar';
const CANONICAL_DEMO_COMPANY_ID = 'company-northstar-us';
const CANONICAL_DEMO_BRANCH_ID = 'branch-northstar-hq';

function isCrmState(value: unknown): value is CrmState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CrmState>;

  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.companyId === 'string' &&
    Array.isArray(candidate.leads) &&
    Array.isArray(candidate.opportunities) &&
    Array.isArray(candidate.activities)
  );
}

function normalizeOperatingScope(state: CrmState): CrmState {
  const tenantId = state.tenantId === LEGACY_DEMO_TENANT_ID
    ? CANONICAL_DEMO_TENANT_ID
    : state.tenantId;
  const companyId = state.companyId === LEGACY_DEMO_COMPANY_ID
    ? CANONICAL_DEMO_COMPANY_ID
    : state.companyId;
  const branchId = typeof state.branchId === 'string' && state.branchId.length > 0
    ? state.branchId
    : CANONICAL_DEMO_BRANCH_ID;
  if (
    tenantId === state.tenantId
    && companyId === state.companyId
    && branchId === state.branchId
  ) {
    return state;
  }

  return {
    ...state,
    tenantId,
    companyId,
    branchId,
    revision: state.revision + 1,
  };
}

export class CrmStore {
  private readonly filePath: string;
  private readonly database: BusinessDatabase;
  private state: CrmState = createCleanCrmState();
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(database: BusinessDatabase, dataDirectory: string) {
    this.database = database;
    this.filePath = path.join(dataDirectory, 'crm-state.v1.json');
  }

  public async initialize(): Promise<void> {
    const databaseState = this.database.loadState<CrmState>('crm');
    if (databaseState && isCrmState(databaseState.payload)) {
      this.state = localizeInitialCrmStateForIndia(
        normalizeOperatingScope(databaseState.payload),
      );
      if (this.state !== databaseState.payload) {
        await this.persist();
      }
      return;
    }

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const stored: unknown = JSON.parse(raw);

      if (!isCrmState(stored)) {
        throw new Error('Stored CRM data has an unsupported shape.');
      }

      this.state = localizeInitialCrmStateForIndia(normalizeOperatingScope(stored));
      await this.persist();
      await this.archiveMigratedState();
      return;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : '';

      if (code !== 'ENOENT') {
        await this.backupCorruptState();
      }

      // A missing/corrupt legacy file is never permission to recreate the
      // fictional sample pipeline. Fresh sample data is available only via
      // the explicit first-run provisioner.
      this.state = createCleanCrmState();
      await this.persist();
    }
  }

  public getSnapshot(): DashboardSnapshot {
    return getDashboardSnapshot(this.state);
  }

  public getCompanyId(): string {
    return this.state.companyId;
  }

  public getAuthorizationScope(): { companyId: string; branchId: string } {
    return { companyId: this.state.companyId, branchId: this.state.branchId };
  }

  public getLead(id: string): Lead | null {
    const lead = this.state.leads.find((candidate) => candidate.id === id);
    return lead ? structuredClone(lead) : null;
  }

  public getOpportunity(id: string): Opportunity | null {
    const opportunity = this.state.opportunities.find((candidate) => candidate.id === id);
    return opportunity ? structuredClone(opportunity) : null;
  }

  public createLead(input: CreateLeadInput): Promise<DashboardSnapshot> {
    return this.enqueue(async () => {
      this.state = addLead(this.state, input);
      await this.persist();

      return this.getSnapshot();
    });
  }

  public createOpportunity(input: CreateOpportunityInput, id?: string): Promise<DashboardSnapshot> {
    return this.enqueue(async () => {
      this.state = addOpportunity(this.state, input, id);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public bulkAssignOpportunities(opportunityIds: string[], expectedVersions: Record<string, number>, territoryId: string, owner: Owner): Promise<DashboardSnapshot> {
    return this.enqueue(async () => {
      this.state = assignOpportunities(this.state, opportunityIds, expectedVersions, territoryId, owner);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public changeOpportunityStage(
    input: MoveOpportunityInput,
    policy?: PipelineMovePolicy,
  ): Promise<DashboardSnapshot> {
    return this.enqueue(async () => {
      this.state = moveOpportunity(this.state, input, new Date().toISOString(), policy);
      await this.persist();

      return this.getSnapshot();
    });
  }

  public markLeadConverted(
    leadId: string,
    expectedVersion: number,
    accountId: string,
    contactId: string,
  ): Promise<DashboardSnapshot> {
    return this.enqueue(async () => {
      this.state = convertLead(this.state, leadId, expectedVersion, accountId, contactId);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public addImportedLeads(rows: Array<Record<string, string>>): Promise<DashboardSnapshot> {
    return this.enqueue(async () => {
      this.state = importLeads(this.state, rows);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public completeActivity(
    input: CompleteActivityInput,
  ): Promise<DashboardSnapshot> {
    return this.enqueue(async () => {
      this.state = finishActivity(this.state, input);
      await this.persist();

      return this.getSnapshot();
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(task, task);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private async persist(): Promise<void> {
    this.database.saveState(
      'crm',
      this.state.schemaVersion,
      this.state.revision,
      this.state,
    );
  }

  private async backupCorruptState(): Promise<void> {
    try {
      await rename(
        this.filePath,
        this.filePath + '.corrupt-' + String(Date.now()),
      );
    } catch {
      // A missing or locked file cannot prevent the application from starting.
    }
  }

  private async archiveMigratedState(): Promise<void> {
    try {
      await rename(
        this.filePath,
        this.filePath + '.migrated-' + String(Date.now()),
      );
    } catch {
      // A locked legacy file does not invalidate the committed SQLite import.
    }
  }
}
