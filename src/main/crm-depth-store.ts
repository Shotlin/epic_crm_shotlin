import {
  commitImport,
  configureAdapter,
  createCampaign,
  createCleanCrmDepthState,
  createSavedView,
  createScoringRule,
  getCrmDepthSnapshot,
  getMovePolicy,
  previewLeadImport,
  recordCommunication,
  recordCommunicationDelivery,
  updatePipeline,
  transitionCampaign,
} from '../domain/crm-depth';
import type {
  CommitImportInput,
  ConfigureAdapterInput,
  CreateCampaignInput,
  CreateSavedViewInput,
  CreateScoringRuleInput,
  CrmDepthSnapshot,
  CrmDepthState,
  ImportJob,
  PipelineMovePolicy,
  RecordCommunicationInput,
  RecordCommunicationDeliveryInput,
  UpdatePipelineInput,
  TransitionCampaignInput,
} from '../shared/crm-depth-contracts';
import type { PipelineStageId } from '../shared/contracts';
import type { BusinessDatabase } from './database';
import type { CrmStore } from './crm-store';
import type { PartyStore } from './party-store';

function isCrmDepthState(value: unknown): value is CrmDepthState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CrmDepthState>;
  return candidate.schemaVersion === 1 && typeof candidate.revision === 'number' &&
    Array.isArray(candidate.pipelines) && Array.isArray(candidate.scoringRules) &&
    Array.isArray(candidate.campaigns) && Array.isArray(candidate.savedViews) &&
    Array.isArray(candidate.importJobs) && Array.isArray(candidate.adapters) &&
    Array.isArray(candidate.communications);
}

function bindBranchScope(state: CrmDepthState, branchId: string): CrmDepthState {
  if (state.branchId === branchId) return state;
  if (typeof state.branchId === 'string' && state.branchId.length > 0) {
    throw new Error('CRM configuration belongs to a different branch. Switch to its owning workspace or migrate it explicitly.');
  }
  return { ...state, branchId, revision: state.revision + 1 };
}

export class CrmDepthStore {
  private state: CrmDepthState = createCleanCrmDepthState();
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly database: BusinessDatabase,
    private readonly crmStore: CrmStore,
    private readonly partyStore: PartyStore,
  ) {}

  public async initialize(): Promise<void> {
    const stored = this.database.loadState<CrmDepthState>('crm-depth');
    // Missing configuration starts clean. The sample CRM configuration is an
    // explicit provisioning choice, never a recovery fallback.
    const loaded = stored && isCrmDepthState(stored.payload)
      ? stored.payload
      : createCleanCrmDepthState();
    this.state = bindBranchScope(loaded, this.crmStore.getAuthorizationScope().branchId);
    if (!stored || stored.payload !== this.state) await this.persist();
  }

  public getSnapshot(): CrmDepthSnapshot {
    const crm = this.crmStore.getSnapshot();
    const party = this.partyStore.getSnapshot();
    return getCrmDepthSnapshot(this.state, {
      leads: crm.leads,
      opportunities: crm.opportunities,
      activeContactCount: party.contacts.filter(({ status }) => status === 'active').length,
    });
  }

  public getCompanyId(): string {
    const crmCompanyId = this.crmStore.getCompanyId();
    const partyCompanyId = this.partyStore.getCompanyId();
    if (crmCompanyId !== partyCompanyId) {
      throw new Error('CRM and Party Master company scopes do not match. Resolve the data scope before continuing.');
    }
    return crmCompanyId;
  }

  public getAuthorizationScope(): { companyId: string; branchId: string } {
    const companyId = this.getCompanyId();
    const crmScope = this.crmStore.getAuthorizationScope();
    if (this.state.branchId !== crmScope.branchId) {
      throw new Error('CRM configuration branch does not match the CRM engagement workspace.');
    }
    return { companyId, branchId: this.state.branchId };
  }

  public getMovePolicy(from: PipelineStageId, to: PipelineStageId): PipelineMovePolicy {
    return getMovePolicy(this.state, from, to);
  }

  public getImportJob(id: string): ImportJob | null {
    const job = this.state.importJobs.find((candidate) => candidate.id === id);
    return job ? structuredClone(job) : null;
  }

  public updatePipeline(input: UpdatePipelineInput): Promise<CrmDepthSnapshot> {
    return this.mutate((state) => updatePipeline(state, input));
  }

  public addScoringRule(input: CreateScoringRuleInput): Promise<CrmDepthSnapshot> {
    return this.mutate((state) => createScoringRule(state, input));
  }

  public addCampaign(input: CreateCampaignInput): Promise<CrmDepthSnapshot> {
    const party = this.partyStore.getSnapshot();
    const latest = new Map<string, typeof party.consents[number]>();
    for (const consent of party.consents) latest.set(`${consent.contactId}:${consent.purpose}:${consent.channel}`, consent);
    const allowed = [...latest.values()].filter((consent) => consent.purpose === input.consentPurpose && consent.status === 'granted' && (!consent.expiresAt || consent.expiresAt > new Date().toISOString())).map(({ contactId }) => contactId);
    return this.mutate((state) => createCampaign(state, input, allowed));
  }

  public transitionCampaign(input: TransitionCampaignInput): Promise<CrmDepthSnapshot> {
    return this.mutate((state) => transitionCampaign(state, input));
  }

  public addSavedView(input: CreateSavedViewInput): Promise<CrmDepthSnapshot> {
    return this.mutate((state) => createSavedView(state, input));
  }

  public previewLeadImport(fileName: string, raw: string, actorId: string): Promise<CrmDepthSnapshot> {
    const emails = this.crmStore.getSnapshot().leads.map(({ email }) => email);
    return this.mutate((state) => previewLeadImport(state, fileName, raw, actorId, emails));
  }

  public commitImport(input: CommitImportInput): Promise<CrmDepthSnapshot> {
    return this.mutate((state) => commitImport(state, input));
  }

  public configureAdapter(input: ConfigureAdapterInput): Promise<CrmDepthSnapshot> {
    return this.mutate((state) => configureAdapter(state, input));
  }

  public addCommunication(input: RecordCommunicationInput, actorId: string): Promise<CrmDepthSnapshot> {
    const party = this.partyStore.getSnapshot();
    const contact = party.contacts.find(({ id, status }) => id === input.contactId && status === 'active');
    if (!contact) throw new Error('Active contact not found.');
    if (input.accountId && !party.accounts.some(({ id, status }) => id === input.accountId && status === 'active')) throw new Error('Active account not found.');
    const purpose = input.purpose ?? 'transactional';
    let governedInput = input;
    if (input.direction === 'outbound' && purpose === 'marketing') {
      const consentChannel = input.channel === 'email' ? 'email' : input.channel === 'phone' ? 'phone' : undefined;
      const consent = consentChannel
        ? party.consents
          .filter((candidate) => candidate.contactId === contact.id && candidate.channel === consentChannel && candidate.purpose === 'marketing')
          .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0]
        : undefined;
      if (!consent || consent.status !== 'granted' || Boolean(consent.expiresAt && consent.expiresAt <= new Date().toISOString())) throw new Error(`Outbound marketing communication requires active ${consentChannel ?? input.channel} consent.`);
      governedInput = { ...input, purpose, consentId: consent.id };
    } else {
      governedInput = { ...input, purpose };
    }
    return this.mutate((state) => recordCommunication(state, governedInput, actorId));
  }

  public recordCommunicationDelivery(input: RecordCommunicationDeliveryInput): Promise<CrmDepthSnapshot> {
    return this.mutate((state) => recordCommunicationDelivery(state, input));
  }

  private mutate(operation: (state: CrmDepthState) => CrmDepthState): Promise<CrmDepthSnapshot> {
    const task = async () => {
      this.state = operation(this.state);
      await this.persist();
      return this.getSnapshot();
    };
    const result = this.writeQueue.then(task, task);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async persist(): Promise<void> {
    this.database.saveState('crm-depth', this.state.schemaVersion, this.state.revision, this.state);
  }
}
