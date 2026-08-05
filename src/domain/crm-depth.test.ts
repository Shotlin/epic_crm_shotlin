import { describe, expect, it } from 'vitest';
import { createCleanCrmState, createInitialCrmState } from './crm';
import {
  commitImport,
  configureAdapter,
  createCampaign,
  createCleanCrmDepthState,
  createInitialCrmDepthState,
  createSavedView,
  createScoringRule,
  getCrmDepthSnapshot,
  getMovePolicy,
  previewLeadImport,
  recordCommunication,
  recordCommunicationDelivery,
  transitionCampaign,
  updatePipeline,
} from './crm-depth';

function context() {
  const crm = createInitialCrmState();
  return { leads: crm.leads, opportunities: crm.opportunities, activeContactCount: 3 };
}

describe('CRM depth', () => {
  it('creates a clean configuration scope with only the neutral sales pipeline template', () => {
    const crm = createCleanCrmState();
    const state = createCleanCrmDepthState();
    const snapshot = getCrmDepthSnapshot(state, {
      leads: crm.leads,
      opportunities: crm.opportunities,
      activeContactCount: 0,
    }, '2026-07-15T12:00:00.000Z');

    expect(state).toMatchObject({ schemaVersion: 1, revision: 1, branchId: 'branch-northstar-hq' });
    expect(state.pipelines).toHaveLength(1);
    expect(state.pipelines[0]).toMatchObject({ id: 'pipeline-enterprise', default: true, active: true });
    expect(state.scoringRules).toEqual([]);
    expect(state.campaigns).toEqual([]);
    expect(state.savedViews).toEqual([]);
    expect(state.importJobs).toEqual([]);
    expect(state.adapters).toEqual([]);
    expect(state.communications).toEqual([]);
    expect(snapshot.leadScores).toEqual([]);
    expect(snapshot.forecast.every(({ opportunityCount, value }) => opportunityCount === 0 && value === 0)).toBe(true);
    expect(snapshot.metrics).toEqual({
      gradeALeads: 0,
      activeCampaigns: 0,
      importExceptions: 0,
      communicationCoverage: 0,
    });
  });

  it('scores leads and calculates category-based forecasts', () => {
    const snapshot = getCrmDepthSnapshot(createInitialCrmDepthState(), context(), '2026-07-15T12:00:00.000Z');
    expect(snapshot.leadScores.find(({ leadId }) => leadId === 'lead-101')).toMatchObject({ score: 48, grade: 'C' });
    expect(snapshot.forecast.find(({ category }) => category === 'commit')).toMatchObject({ opportunityCount: 2, value: 57_400_000 });
  });

  it('enforces the configured transition graph and probabilities', () => {
    const state = createInitialCrmDepthState();
    expect(getMovePolicy(state, 'discover', 'qualify')).toMatchObject({ allowed: true, probability: 30 });
    expect(getMovePolicy(state, 'discover', 'commit').allowed).toBe(false);
    const pipeline = state.pipelines[0]!;
    const updated = updatePipeline(state, {
      id: pipeline.id, name: pipeline.name, description: pipeline.description,
      stages: pipeline.stages.map(({ version, ...stage }) => { void version; return stage.id === 'qualify' ? { ...stage, probability: 38 } : stage; }),
      expectedVersion: pipeline.version,
    });
    expect(getMovePolicy(updated, 'discover', 'qualify').probability).toBe(38);
  });

  it('adds scoring rules, views, and consent-safe campaigns', () => {
    const ruleState = createScoringRule(createInitialCrmDepthState(), { name: 'Strategic company', field: 'company', operator: 'contains', value: 'Health', points: 15, enabled: true }, 'rule-health');
    const viewState = createSavedView(ruleState, { name: 'Qualified leads', resource: 'lead', ownerId: 'user-avery', filters: [{ field: 'status', operator: 'equals', value: 'qualified' }], columns: ['name', 'company', 'source'], sortField: 'company', sortDirection: 'asc', shared: true }, 'view-qualified');
    const campaignState = createCampaign(viewState, { name: 'Customer council', channel: 'email', consentPurpose: 'marketing', memberContactIds: ['contact-amara'], startsAt: '2026-08-01T09:00:00.000Z', budget: 5000, ownerId: 'user-avery' }, ['contact-amara'], 'campaign-council');
    expect(campaignState.campaigns.at(-1)?.status).toBe('draft');
    const activated = transitionCampaign(campaignState, { id: 'campaign-council', toStatus: 'active', expectedVersion: 1 });
    expect(activated.campaigns.at(-1)).toMatchObject({ status: 'active', version: 2 });
    expect(() => createCampaign(viewState, { name: 'Unsafe campaign', channel: 'email', consentPurpose: 'marketing', memberContactIds: ['contact-maya'], startsAt: '2026-08-01T09:00:00.000Z', budget: 1, ownerId: 'user-avery' }, ['contact-amara'])).toThrow('consent');
  });

  it('previews quoted CSV, rejects duplicates, and commits accepted rows', () => {
    const previewed = previewLeadImport(createInitialCrmDepthState(), 'leads.csv', 'name,company,email,source\n"Ada, M.",Analytical Engines,ada@example.com,Referral\nAda Again,Other,ada@example.com,Website\nBad,Row,nope,Unknown', 'user-avery', [] , 'import-0000-0000-0000-000000000001');
    const job = previewed.importJobs[0]!;
    expect(job).toMatchObject({ rowCount: 3, acceptedRows: 1, rejectedRows: 2, status: 'preview' });
    expect(job.rows[0]?.values.name).toBe('Ada, M.');
    const committed = commitImport(previewed, { id: job.id, expectedVersion: 1 });
    expect(committed.importJobs[0]).toMatchObject({ status: 'committed', version: 2 });
  });

  it('keeps provider adapters explicit and records communication evidence', () => {
    const state = createInitialCrmDepthState();
    const adapter = state.adapters[0]!;
    const configured = configureAdapter(state, { id: adapter.id, displayName: 'Northstar Gmail', status: 'configured', expectedVersion: 1 });
    const communicated = recordCommunication(configured, { contactId: 'contact-maya', accountId: 'account-kestrel', adapterId: adapter.id, channel: 'email', direction: 'inbound', subject: 'Re: Commercial review', occurredAt: '2026-07-15T13:00:00.000Z', externalId: 'gmail-thread-1' }, 'user-avery', 'communication-gmail-1');
    expect(communicated.adapters[0]).toMatchObject({ status: 'configured', version: 2 });
    expect(communicated.communications[0]).toMatchObject({ externalId: 'gmail-thread-1', direction: 'inbound' });
  });

  it('retains communication purpose and consent evidence on the engagement timeline', () => {
    const state = createInitialCrmDepthState();
    const communicated = recordCommunication(state, {
      contactId: 'contact-amara',
      accountId: 'account-kestrel',
      channel: 'email',
      direction: 'outbound',
      purpose: 'marketing',
      consentId: 'consent-amara-marketing',
      subject: 'Seasonal retail update',
      occurredAt: '2026-07-15T14:00:00.000Z',
    }, 'user-avery', 'communication-marketing-1');
    expect(communicated.communications[0]).toMatchObject({ purpose: 'marketing', consentId: 'consent-amara-marketing', status: 'captured' });
  });

  it('records provider delivery evidence with optimistic locking', () => {
    const captured = recordCommunication(createInitialCrmDepthState(), { contactId: 'contact-maya', channel: 'email', direction: 'outbound', purpose: 'transactional', subject: 'Invoice copy', occurredAt: '2025-01-15T10:00:00.000Z' }, 'user-avery', 'communication-delivery-1');
    const sent = recordCommunicationDelivery(captured, { id: 'communication-delivery-1', outcome: 'sent', externalId: 'smtp-message-123', expectedVersion: 1 });
    expect(sent.communications[0]).toMatchObject({ status: 'sent', externalId: 'smtp-message-123', version: 2 });
    expect(() => recordCommunicationDelivery(sent, { id: 'communication-delivery-1', outcome: 'failed', expectedVersion: 1 })).toThrow('changed');
  });
});
