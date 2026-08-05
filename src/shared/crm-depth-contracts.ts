import type { Lead, Opportunity, PipelineStageId } from './contracts';

export type ForecastCategory = 'pipeline' | 'best-case' | 'commit' | 'closed';

export interface PipelineStagePolicy {
  id: PipelineStageId;
  label: string;
  signal: string;
  probability: number;
  forecastCategory: ForecastCategory;
  position: number;
  entryCriteria: string[];
  nextStageIds: PipelineStageId[];
  active: boolean;
  version: number;
}

export interface CrmPipeline {
  id: string;
  name: string;
  description: string;
  stages: PipelineStagePolicy[];
  default: boolean;
  active: boolean;
  version: number;
}

export interface ScoringRule {
  id: string;
  name: string;
  field: 'source' | 'company' | 'email' | 'status';
  operator: 'equals' | 'contains' | 'exists';
  value: string;
  points: number;
  enabled: boolean;
  version: number;
}

export interface LeadScore {
  leadId: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  matchedRuleIds: string[];
}

export interface Campaign {
  id: string;
  name: string;
  channel: 'email' | 'event' | 'multi-channel';
  status: 'draft' | 'active' | 'completed' | 'paused';
  consentPurpose: 'marketing' | 'transactional';
  memberContactIds: string[];
  startsAt: string;
  endsAt?: string;
  budget: number;
  spent: number;
  ownerId: string;
  version: number;
}

export interface SavedViewFilter {
  field: string;
  operator: 'equals' | 'contains' | 'gte' | 'lte';
  value: string;
}

export interface SavedView {
  id: string;
  name: string;
  resource: 'lead' | 'opportunity' | 'account' | 'contact';
  ownerId: string;
  filters: SavedViewFilter[];
  columns: string[];
  sortField: string;
  sortDirection: 'asc' | 'desc';
  shared: boolean;
  version: number;
}

export interface ImportRow {
  rowNumber: number;
  values: Record<string, string>;
  status: 'accepted' | 'rejected';
  errors: string[];
}

export interface ImportJob {
  id: string;
  resource: 'lead';
  fileName: string;
  status: 'preview' | 'committed' | 'rejected';
  rows: ImportRow[];
  rowCount: number;
  acceptedRows: number;
  rejectedRows: number;
  createdBy: string;
  createdAt: string;
  committedAt?: string;
  version: number;
}

export interface CommunicationAdapter {
  id: string;
  type: 'email' | 'calendar';
  provider: 'gmail' | 'google-calendar' | 'outlook' | 'generic';
  displayName: string;
  status: 'disconnected' | 'configured' | 'healthy' | 'degraded';
  lastSyncAt?: string;
  version: number;
}

export interface CommunicationRecord {
  id: string;
  contactId: string;
  accountId?: string;
  adapterId?: string;
  channel: 'email' | 'calendar' | 'phone';
  direction: 'inbound' | 'outbound';
  /** Marketing messages require an active Party Master consent record. */
  purpose?: 'transactional' | 'marketing';
  consentId?: string;
  subject: string;
  occurredAt: string;
  actorId: string;
  externalId?: string;
  status: 'captured' | 'sent' | 'failed';
  version: number;
}

export interface CrmDepthState {
  schemaVersion: 1;
  revision: number;
  /** CRM configuration, imports, and engagement evidence belong to one branch workspace. */
  branchId: string;
  pipelines: CrmPipeline[];
  scoringRules: ScoringRule[];
  campaigns: Campaign[];
  savedViews: SavedView[];
  importJobs: ImportJob[];
  adapters: CommunicationAdapter[];
  communications: CommunicationRecord[];
}

export interface ForecastBucket {
  category: ForecastCategory;
  value: number;
  opportunityCount: number;
}

export interface CrmDepthSnapshot {
  revision: number;
  generatedAt: string;
  activePipeline: CrmPipeline;
  pipelines: CrmPipeline[];
  scoringRules: ScoringRule[];
  leadScores: LeadScore[];
  forecast: ForecastBucket[];
  campaigns: Campaign[];
  savedViews: SavedView[];
  importJobs: ImportJob[];
  adapters: CommunicationAdapter[];
  communications: CommunicationRecord[];
  metrics: {
    gradeALeads: number;
    activeCampaigns: number;
    importExceptions: number;
    communicationCoverage: number;
  };
}

export interface UpdatePipelineInput {
  id: string;
  name: string;
  description: string;
  stages: Array<Omit<PipelineStagePolicy, 'version'>>;
  expectedVersion: number;
}

export interface CreateScoringRuleInput {
  name: string;
  field: ScoringRule['field'];
  operator: ScoringRule['operator'];
  value: string;
  points: number;
  enabled: boolean;
}

export interface CreateCampaignInput {
  name: string;
  channel: Campaign['channel'];
  consentPurpose: Campaign['consentPurpose'];
  memberContactIds: string[];
  startsAt: string;
  endsAt?: string;
  budget: number;
  ownerId: string;
}

export interface TransitionCampaignInput {
  id: string;
  toStatus: Campaign['status'];
  expectedVersion: number;
}

export interface CreateSavedViewInput {
  name: string;
  resource: SavedView['resource'];
  ownerId: string;
  filters: SavedViewFilter[];
  columns: string[];
  sortField: string;
  sortDirection: SavedView['sortDirection'];
  shared: boolean;
}

export interface CommitImportInput {
  id: string;
  expectedVersion: number;
}

export interface ConfigureAdapterInput {
  id: string;
  displayName: string;
  status: 'configured' | 'healthy' | 'degraded';
  expectedVersion: number;
}

export interface RecordCommunicationInput {
  contactId: string;
  accountId?: string;
  adapterId?: string;
  channel: CommunicationRecord['channel'];
  direction: CommunicationRecord['direction'];
  purpose?: NonNullable<CommunicationRecord['purpose']>;
  consentId?: string;
  subject: string;
  occurredAt: string;
  externalId?: string;
}

export interface RecordCommunicationDeliveryInput {
  id: string;
  outcome: 'sent' | 'failed';
  externalId?: string;
  expectedVersion: number;
}

export interface PipelineMovePolicy {
  allowed: boolean;
  probability: number;
  forecastCategory: ForecastCategory;
}

export interface CrmDepthContext {
  leads: Lead[];
  opportunities: Opportunity[];
  activeContactCount: number;
}
