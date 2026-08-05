import { randomUUID } from 'node:crypto';
import { DEFAULT_CRM_CURRENCY } from './crm';
import type {
  Campaign,
  CommitImportInput,
  CommunicationAdapter,
  CommunicationRecord,
  ConfigureAdapterInput,
  CreateCampaignInput,
  CreateSavedViewInput,
  CreateScoringRuleInput,
  CrmDepthContext,
  CrmDepthSnapshot,
  CrmDepthState,
  ImportJob,
  ImportRow,
  PipelineMovePolicy,
  RecordCommunicationInput,
  RecordCommunicationDeliveryInput,
  SavedView,
  ScoringRule,
  UpdatePipelineInput,
  TransitionCampaignInput,
} from '../shared/crm-depth-contracts';
import type { Lead, PipelineStageId } from '../shared/contracts';

function clean(value: string, label: string, minimum = 2, maximum = 160): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
}

export function createInitialCrmDepthState(): CrmDepthState {
  return {
    schemaVersion: 1,
    revision: 1,
    branchId: 'branch-northstar-hq',
    pipelines: [{
      id: 'pipeline-enterprise', name: 'Enterprise revenue', description: 'Evidence-led complex B2B sales motion.', default: true, active: true, version: 1,
      stages: [
        { id: 'discover', label: 'Discover', signal: 'New demand', probability: 15, forecastCategory: 'pipeline', position: 1, entryCriteria: ['Business trigger captured'], nextStageIds: ['qualify'], active: true, version: 1 },
        { id: 'qualify', label: 'Qualify', signal: 'Fit confirmed', probability: 30, forecastCategory: 'pipeline', position: 2, entryCriteria: ['Economic fit confirmed', 'Decision group identified'], nextStageIds: ['discover', 'solution'], active: true, version: 1 },
        { id: 'solution', label: 'Solution', signal: 'Value mapped', probability: 50, forecastCategory: 'best-case', position: 3, entryCriteria: ['Target outcomes agreed'], nextStageIds: ['qualify', 'proposal'], active: true, version: 1 },
        { id: 'proposal', label: 'Proposal', signal: 'Terms shared', probability: 70, forecastCategory: 'best-case', position: 4, entryCriteria: ['Commercial scope approved'], nextStageIds: ['solution', 'commit'], active: true, version: 1 },
        { id: 'commit', label: 'Commit', signal: 'Decision due', probability: 90, forecastCategory: 'commit', position: 5, entryCriteria: ['Mutual close plan active'], nextStageIds: ['proposal'], active: true, version: 1 },
      ],
    }],
    scoringRules: [
      { id: 'score-partner', name: 'Partner signal', field: 'source', operator: 'equals', value: 'Partner', points: 28, enabled: true, version: 1 },
      { id: 'score-referral', name: 'Referral signal', field: 'source', operator: 'equals', value: 'Referral', points: 32, enabled: true, version: 1 },
      { id: 'score-qualified', name: 'Qualified state', field: 'status', operator: 'equals', value: 'qualified', points: 40, enabled: true, version: 1 },
      { id: 'score-business-email', name: 'Business email present', field: 'email', operator: 'exists', value: '', points: 20, enabled: true, version: 1 },
    ],
    campaigns: [{ id: 'campaign-ops-summit', name: 'Operations leadership summit', channel: 'event', status: 'active', consentPurpose: 'marketing', memberContactIds: ['contact-amara'], startsAt: '2026-08-12T09:00:00.000Z', budget: 24000, spent: 7800, ownerId: 'user-avery', version: 1 }],
    savedViews: [{ id: 'view-at-risk', name: 'At-risk enterprise deals', resource: 'opportunity', ownerId: 'user-avery', filters: [{ field: 'health', operator: 'equals', value: 'at-risk' }], columns: ['title', 'account', 'value', 'stage', 'nextStep'], sortField: 'value', sortDirection: 'desc', shared: true, version: 1 }],
    importJobs: [],
    adapters: [
      { id: 'adapter-gmail', type: 'email', provider: 'gmail', displayName: 'Gmail workspace', status: 'disconnected', version: 1 },
      { id: 'adapter-google-calendar', type: 'calendar', provider: 'google-calendar', displayName: 'Google Calendar', status: 'disconnected', version: 1 },
      { id: 'adapter-outlook', type: 'email', provider: 'outlook', displayName: 'Microsoft Outlook', status: 'disconnected', version: 1 },
    ],
    communications: [{ id: 'communication-kestrel-review', contactId: 'contact-maya', accountId: 'account-kestrel', channel: 'email', direction: 'outbound', subject: 'Commercial review and next steps', occurredAt: '2026-07-15T05:30:00.000Z', actorId: 'user-avery', status: 'captured', version: 1 }],
  };
}

/**
 * A clean CRM-configuration workspace.  It retains a neutral, configurable
 * B2B pipeline so a new India-first business has a safe starting workflow,
 * while intentionally omitting lead scores, campaigns, saved views, provider
 * configurations, imports, and communication evidence from the sample.
 */
export function createCleanCrmDepthState(): CrmDepthState {
  const template = createInitialCrmDepthState();
  return {
    schemaVersion: 1,
    revision: 1,
    branchId: 'branch-northstar-hq',
    pipelines: structuredClone(template.pipelines),
    scoringRules: [],
    campaigns: [],
    savedViews: [],
    importJobs: [],
    adapters: [],
    communications: [],
  };
}

function matchesRule(lead: Lead, rule: ScoringRule): boolean {
  const candidate = String(lead[rule.field] ?? '');
  if (rule.operator === 'exists') return candidate.trim().length > 0;
  if (rule.operator === 'equals') return candidate.toLowerCase() === rule.value.toLowerCase();
  return candidate.toLowerCase().includes(rule.value.toLowerCase());
}

export function scoreLead(state: CrmDepthState, lead: Lead) {
  const matchedRuleIds = state.scoringRules.filter((rule) => rule.enabled && matchesRule(lead, rule)).map(({ id }) => id);
  const score = Math.min(100, state.scoringRules.filter(({ id }) => matchedRuleIds.includes(id)).reduce((total, rule) => total + rule.points, 0));
  return { leadId: lead.id, score, grade: (score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 35 ? 'C' : 'D') as 'A' | 'B' | 'C' | 'D', matchedRuleIds };
}

export function getMovePolicy(state: CrmDepthState, from: PipelineStageId, to: PipelineStageId): PipelineMovePolicy {
  const pipeline = state.pipelines.find(({ default: isDefault, active }) => isDefault && active) ?? state.pipelines[0];
  const fromStage = pipeline?.stages.find(({ id, active }) => id === from && active);
  const toStage = pipeline?.stages.find(({ id, active }) => id === to && active);
  return { allowed: Boolean(fromStage?.nextStageIds.includes(to) && toStage), probability: toStage?.probability ?? 0, forecastCategory: toStage?.forecastCategory ?? 'pipeline' };
}

export function updatePipeline(state: CrmDepthState, input: UpdatePipelineInput): CrmDepthState {
  const pipeline = state.pipelines.find(({ id }) => id === input.id);
  if (!pipeline) throw new Error('Pipeline not found.');
  if (pipeline.version !== input.expectedVersion) throw new Error('The pipeline changed. Refresh and retry.');
  const ids = input.stages.map(({ id }) => id);
  if (new Set(ids).size !== ids.length || input.stages.length < 2) throw new Error('Pipeline stages must contain at least two unique IDs.');
  for (const stage of input.stages) {
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(stage.id)) throw new Error('Stage IDs must use lowercase letters, numbers, and dashes.');
    if (stage.probability < 0 || stage.probability > 100) throw new Error('Stage probability must be between 0 and 100.');
    if (stage.nextStageIds.some((id) => !ids.includes(id))) throw new Error('Every next stage must belong to this pipeline.');
  }
  const updated = { ...pipeline, name: clean(input.name, 'Pipeline name'), description: clean(input.description, 'Pipeline description'), stages: input.stages.map((stage, index) => ({ ...stage, position: index + 1, version: pipeline.stages.find(({ id }) => id === stage.id)?.version ?? 1 })), version: pipeline.version + 1 };
  return { ...state, revision: state.revision + 1, pipelines: state.pipelines.map((candidate) => candidate.id === updated.id ? updated : candidate) };
}

export function createScoringRule(state: CrmDepthState, input: CreateScoringRuleInput, id: string = randomUUID()): CrmDepthState {
  if (!Number.isInteger(input.points) || input.points < -100 || input.points > 100) throw new Error('Scoring points must be an integer between -100 and 100.');
  const rule: ScoringRule = { id, name: clean(input.name, 'Rule name'), field: input.field, operator: input.operator, value: input.value.trim(), points: input.points, enabled: input.enabled, version: 1 };
  return { ...state, revision: state.revision + 1, scoringRules: [...state.scoringRules, rule] };
}

export function createCampaign(state: CrmDepthState, input: CreateCampaignInput, allowedContactIds: string[], id: string = randomUUID()): CrmDepthState {
  const members = [...new Set(input.memberContactIds)];
  if (members.some((contactId) => !allowedContactIds.includes(contactId))) throw new Error('Campaign audience includes a contact without the required active consent.');
  if (input.endsAt && input.endsAt <= input.startsAt) throw new Error('Campaign end must be after its start.');
  const campaign: Campaign = { id, name: clean(input.name, 'Campaign name'), channel: input.channel, status: 'draft', consentPurpose: input.consentPurpose, memberContactIds: members, startsAt: input.startsAt, endsAt: input.endsAt, budget: input.budget, spent: 0, ownerId: input.ownerId, version: 1 };
  return { ...state, revision: state.revision + 1, campaigns: [...state.campaigns, campaign] };
}

const CAMPAIGN_TRANSITIONS = {
  draft: ['active'],
  active: ['paused', 'completed'],
  paused: ['active', 'completed'],
  completed: [],
} as const;

export function transitionCampaign(state: CrmDepthState, input: TransitionCampaignInput): CrmDepthState {
  const campaign = state.campaigns.find(({ id }) => id === input.id);
  if (!campaign) throw new Error('Campaign not found.');
  if (campaign.version !== input.expectedVersion) throw new Error('The campaign changed. Refresh and retry.');
  if (!(CAMPAIGN_TRANSITIONS[campaign.status] as readonly string[]).includes(input.toStatus)) throw new Error(`Campaign cannot move from ${campaign.status} to ${input.toStatus}.`);
  const updated = { ...campaign, status: input.toStatus, version: campaign.version + 1 };
  return { ...state, revision: state.revision + 1, campaigns: state.campaigns.map((candidate) => candidate.id === updated.id ? updated : candidate) };
}

export function createSavedView(state: CrmDepthState, input: CreateSavedViewInput, id: string = randomUUID()): CrmDepthState {
  const view: SavedView = { id, name: clean(input.name, 'View name'), resource: input.resource, ownerId: input.ownerId, filters: structuredClone(input.filters), columns: [...new Set(input.columns)], sortField: input.sortField.trim(), sortDirection: input.sortDirection, shared: input.shared, version: 1 };
  if (!view.sortField || view.columns.length === 0) throw new Error('Saved views require columns and a sort field.');
  return { ...state, revision: state.revision + 1, savedViews: [...state.savedViews, view] };
}

function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]!;
    if (char === '"') {
      if (quoted && raw[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && raw[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function previewLeadImport(state: CrmDepthState, fileName: string, raw: string, actorId: string, existingEmails: string[], id: string = randomUUID(), now = new Date().toISOString()): CrmDepthState {
  const parsed = parseCsv(raw);
  const headers = (parsed.shift() ?? []).map((header) => header.trim().toLowerCase());
  const required = ['name', 'company', 'email', 'source'];
  if (!required.every((header) => headers.includes(header))) throw new Error(`CSV requires headers: ${required.join(', ')}.`);
  const seen = new Set(existingEmails.map((email) => email.toLowerCase()));
  const rows: ImportRow[] = parsed.slice(0, 5000).map((values, index) => {
    const mapped = Object.fromEntries(headers.map((header, column) => [header, values[column]?.trim() ?? '']));
    const errors: string[] = [];
    if ((mapped.name ?? '').length < 2) errors.push('Name is required.');
    if ((mapped.company ?? '').length < 2) errors.push('Company is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email ?? '')) errors.push('Email is invalid.');
    if (seen.has((mapped.email ?? '').toLowerCase())) errors.push('Email already exists or repeats in this file.');
    seen.add((mapped.email ?? '').toLowerCase());
    if (!['Website', 'Partner', 'Event', 'Referral', 'Outbound'].includes(mapped.source ?? '')) errors.push('Source is unsupported.');
    return { rowNumber: index + 2, values: mapped, status: errors.length ? 'rejected' : 'accepted', errors };
  });
  const job: ImportJob = { id, resource: 'lead', fileName, status: 'preview', rows, rowCount: rows.length, acceptedRows: rows.filter(({ status }) => status === 'accepted').length, rejectedRows: rows.filter(({ status }) => status === 'rejected').length, createdBy: actorId, createdAt: now, version: 1 };
  return { ...state, revision: state.revision + 1, importJobs: [job, ...state.importJobs] };
}

export function commitImport(state: CrmDepthState, input: CommitImportInput, now = new Date().toISOString()): CrmDepthState {
  const job = state.importJobs.find(({ id }) => id === input.id);
  if (!job) throw new Error('Import job not found.');
  if (job.version !== input.expectedVersion || job.status !== 'preview') throw new Error('Import preview changed. Refresh and retry.');
  if (job.acceptedRows === 0) throw new Error('This import has no accepted rows.');
  const committed: ImportJob = { ...job, status: 'committed', committedAt: now, version: job.version + 1 };
  return { ...state, revision: state.revision + 1, importJobs: state.importJobs.map((candidate) => candidate.id === committed.id ? committed : candidate) };
}

export function configureAdapter(state: CrmDepthState, input: ConfigureAdapterInput): CrmDepthState {
  const adapter = state.adapters.find(({ id }) => id === input.id);
  if (!adapter) throw new Error('Communication adapter not found.');
  if (adapter.version !== input.expectedVersion) throw new Error('The adapter changed. Refresh and retry.');
  const updated: CommunicationAdapter = { ...adapter, displayName: clean(input.displayName, 'Adapter name'), status: input.status, lastSyncAt: input.status === 'healthy' ? new Date().toISOString() : adapter.lastSyncAt, version: adapter.version + 1 };
  return { ...state, revision: state.revision + 1, adapters: state.adapters.map((candidate) => candidate.id === updated.id ? updated : candidate) };
}

export function recordCommunication(state: CrmDepthState, input: RecordCommunicationInput, actorId: string, id: string = randomUUID()): CrmDepthState {
  if (input.adapterId && !state.adapters.some(({ id: adapterId, status }) => adapterId === input.adapterId && status !== 'disconnected')) throw new Error('The selected communication adapter is not configured.');
  const record: CommunicationRecord = { id, contactId: input.contactId, accountId: input.accountId, adapterId: input.adapterId, channel: input.channel, direction: input.direction, purpose: input.purpose ?? 'transactional', consentId: input.consentId, subject: clean(input.subject, 'Communication subject'), occurredAt: input.occurredAt, actorId, externalId: input.externalId, status: 'captured', version: 1 };
  return { ...state, revision: state.revision + 1, communications: [record, ...state.communications] };
}

export function recordCommunicationDelivery(state: CrmDepthState, input: RecordCommunicationDeliveryInput): CrmDepthState {
  const record = state.communications.find(({ id }) => id === input.id);
  if (!record) throw new Error('Communication record not found.');
  if (record.version !== input.expectedVersion) throw new Error('Communication record changed. Refresh and retry.');
  if (record.status !== 'captured') throw new Error('Only captured communications can receive a delivery result.');
  if (input.outcome === 'sent' && !input.externalId?.trim()) throw new Error('Sent communication requires an external provider reference.');
  const updated: CommunicationRecord = {
    ...record,
    status: input.outcome,
    externalId: input.externalId?.trim() || record.externalId,
    version: record.version + 1,
  };
  return { ...state, revision: state.revision + 1, communications: state.communications.map((candidate) => candidate.id === updated.id ? updated : candidate) };
}

export function getCrmDepthSnapshot(state: CrmDepthState, context: CrmDepthContext, generatedAt = new Date().toISOString()): CrmDepthSnapshot {
  const activePipeline = state.pipelines.find(({ default: isDefault, active }) => isDefault && active) ?? state.pipelines[0];
  if (!activePipeline) throw new Error('No active CRM pipeline is configured.');
  const leadScores = context.leads.map((lead) => scoreLead(state, lead));
  const forecastCategories = ['pipeline', 'best-case', 'commit', 'closed'] as const;
  const forecast = forecastCategories.map((category) => {
    const opportunities = context.opportunities.filter((opportunity) => opportunity.currency === DEFAULT_CRM_CURRENCY && activePipeline.stages.find(({ id }) => id === opportunity.stage)?.forecastCategory === category);
    return { category, value: opportunities.reduce((total, opportunity) => total + opportunity.value, 0), opportunityCount: opportunities.length };
  });
  return {
    revision: state.revision, generatedAt, activePipeline: structuredClone(activePipeline), pipelines: structuredClone(state.pipelines), scoringRules: structuredClone(state.scoringRules), leadScores,
    forecast, campaigns: structuredClone(state.campaigns), savedViews: structuredClone(state.savedViews), importJobs: structuredClone(state.importJobs), adapters: structuredClone(state.adapters), communications: structuredClone(state.communications),
    metrics: {
      gradeALeads: leadScores.filter(({ grade }) => grade === 'A').length,
      activeCampaigns: state.campaigns.filter(({ status }) => status === 'active').length,
      importExceptions: state.importJobs.filter(({ status }) => status === 'preview').reduce((total, job) => total + job.rejectedRows, 0),
      communicationCoverage: context.activeContactCount === 0 ? 0 : Math.min(100, Math.round(new Set(state.communications.map(({ contactId }) => contactId)).size / context.activeContactCount * 100)),
    },
  };
}
