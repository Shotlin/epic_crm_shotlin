import { describe, expect, it } from 'vitest';
import {
  addLead,
  ALLOWED_STAGE_TRANSITIONS,
  assignOpportunities,
  createCleanCrmState,
  createInitialCrmState,
  finishActivity,
  getDashboardSnapshot,
  localizeInitialCrmStateForIndia,
  moveOpportunity,
  PIPELINE_STAGES,
} from './crm';

describe('CRM domain', () => {
  it('builds a deterministic operating snapshot', () => {
    const state = createInitialCrmState();
    const snapshot = getDashboardSnapshot(
      state,
      '2026-07-15T07:00:00.000Z',
    );

    expect(snapshot.generatedAt).toBe('2026-07-15T07:00:00.000Z');
    expect(snapshot.revision).toBe(1);
    expect(snapshot.opportunities).toHaveLength(11);
    expect(snapshot.leads).toHaveLength(3);
    expect(snapshot.activities).toHaveLength(4);
    expect(state.opportunities.every(({ currency }) => currency === 'INR')).toBe(true);
    expect(state.leads.find(({ id }) => id === 'lead-101')).toMatchObject({
      name: 'Kavya Iyer',
      company: 'Saffron Foods & Beverages',
    });
    expect(state.opportunities.find(({ id }) => id === 'opp-207')).toMatchObject({
      account: 'Aranya Industrial Systems',
      contact: 'Arjun Nair',
    });
    const defaultInrPipeline = state.opportunities.reduce(
      (total, opportunity) => total + opportunity.value,
      0,
    );
    const defaultInrWeightedForecast = state.opportunities.reduce(
      (total, opportunity) => total + opportunity.value * (opportunity.probability / 100),
      0,
    );
    expect(snapshot.metrics.pipeline).toMatchObject({
      value: defaultInrPipeline,
      context: 'INR reporting view',
    });
    expect(snapshot.metrics.weightedForecast).toMatchObject({
      value: defaultInrWeightedForecast,
      context: 'INR reporting view',
    });
    expect(snapshot.metrics.winRate.value).toBe(70);
    expect(snapshot.metrics.salesCycle.value).toBe(31);
    expect(state).toMatchObject({ companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' });
  });

  it('creates a clean CRM scope with no synthetic demand or KPI inputs', () => {
    const state = createCleanCrmState();
    const snapshot = getDashboardSnapshot(state, '2026-07-15T07:00:00.000Z');

    expect(state).toMatchObject({
      schemaVersion: 1,
      tenantId: 'tenant-northstar',
      companyId: 'company-northstar-us',
      branchId: 'branch-northstar-hq',
      revision: 1,
      closedWon: 0,
      closedLost: 0,
      averageCycleDays: 0,
    });
    expect(state.leads).toEqual([]);
    expect(state.opportunities).toEqual([]);
    expect(state.activities).toEqual([]);
    expect(state.sources).toEqual([]);
    expect(state.revenueSeries).toEqual([]);
    const recordIds = [
      ...state.leads.map(({ id }) => id),
      ...state.opportunities.map(({ id }) => id),
      ...state.activities.map(({ id }) => id),
    ];
    expect(recordIds).not.toEqual(expect.arrayContaining(['lead-101', 'opp-201', 'act-301']));
    expect(snapshot.leads).toEqual([]);
    expect(snapshot.opportunities).toEqual([]);
    expect(snapshot.activities).toEqual([]);
    expect(snapshot.metrics.pipeline.value).toBe(0);
    expect(snapshot.metrics.weightedForecast.value).toBe(0);
    expect(snapshot.metrics.winRate.value).toBe(0);
    expect(snapshot.metrics.salesCycle.value).toBe(0);
  });

  it('defines a controlled five-stage pipeline', () => {
    expect(PIPELINE_STAGES.map(({ id }) => id)).toEqual([
      'discover',
      'qualify',
      'solution',
      'proposal',
      'commit',
    ]);
    expect(ALLOWED_STAGE_TRANSITIONS.discover).toEqual(['qualify']);
    expect(ALLOWED_STAGE_TRANSITIONS.solution).toEqual([
      'qualify',
      'proposal',
    ]);
    expect(ALLOWED_STAGE_TRANSITIONS.commit).toEqual(['proposal']);
  });

  it('safely localizes only the recognized legacy USD demo dataset', () => {
    const indiaBaseline = createInitialCrmState();
    const legacy = {
      ...indiaBaseline,
      opportunities: indiaBaseline.opportunities.map((opportunity) =>
        opportunity.id === 'opp-211'
          ? opportunity
          : {
              ...opportunity,
              currency: 'USD',
              value: opportunity.value / 100,
            },
      ),
      sources: indiaBaseline.sources.map((source) => ({
        ...source,
        pipeline: source.pipeline / 100,
      })),
      revenueSeries: indiaBaseline.revenueSeries.map((point) => ({
        ...point,
        actual: point.actual / 100,
        target: point.target / 100,
      })),
    };

    const localized = localizeInitialCrmStateForIndia(legacy);

    expect(localized).not.toBe(legacy);
    expect(localized.revision).toBe(legacy.revision + 1);
    expect(localized.opportunities.every(({ currency }) => currency === 'INR')).toBe(true);
    expect(localized.opportunities.find(({ id }) => id === 'opp-201')?.value).toBe(8_400_000);
    expect(localized.sources.find(({ source }) => source === 'Partner')?.pipeline).toBe(75_200_000);
    expect(localized.revenueSeries.find(({ label }) => label === 'Jul')).toMatchObject({ actual: 32_600_000, target: 32_000_000 });

    const customerChanged = {
      ...legacy,
      opportunities: [...legacy.opportunities, { ...legacy.opportunities[0]!, id: 'customer-opportunity' }],
    };
    expect(localizeInitialCrmStateForIndia(customerChanged)).toBe(customerChanged);
  });

  it('replaces only the exact untouched global INR demonstration context', () => {
    const india = createInitialCrmState();
    const legacyLeadFields: Record<string, readonly [string, string, string]> = {
      'lead-101': ['Elena Torres', 'Northbank Foods', 'elena@northbank.example'],
      'lead-102': ['Mateo Wright', 'Redwood Mobility', 'mateo@redwood.example'],
      'lead-103': ['Priya Desai', 'Arcline Health', 'priya@arcline.example'],
    };
    const legacyOpportunityFields: Record<string, readonly [string, string, string]> = {
      'opp-201': ['Regional operations rollout', 'Northbank Foods', 'Elena Torres'],
      'opp-202': ['Field service command suite', 'Redwood Mobility', 'Mateo Wright'],
      'opp-203': ['Finance consolidation', 'Valence Energy', 'Mina Cho'],
      'opp-204': ['People operations platform', 'Arcline Health', 'Priya Desai'],
      'opp-205': ['Supply network control tower', 'Meridian Works', 'Omar Haddad'],
      'opp-206': ['Revenue intelligence workspace', 'Luma Hotels', 'Grace Miller'],
      'opp-207': ['Manufacturing execution core', 'Kestrel Fabrication', 'Daniel Kim'],
      'opp-208': ['Portfolio profitability hub', 'Orchard Capital', 'Aisha Rahman'],
      'opp-209': ['Global back-office transformation', 'Atlas Biotech', 'Sophia Nguyen'],
      'opp-210': ['Distribution modernization', 'Solace Consumer', 'Theo Martin'],
      'opp-211': ['Unified distributor growth network', 'Sahyadri Retail Network', 'Ananya Rao'],
    };
    const legacyActivityFields: Record<string, readonly [string, string]> = {
      'act-301': ['Executive value review', 'Atlas Biotech'],
      'act-302': ['Confirm security scope', 'Solace Consumer'],
      'act-303': ['Send revised commercial terms', 'Kestrel Fabrication'],
      'act-304': ['Prepare ROI model', 'Meridian Works'],
    };
    const legacy = {
      ...india,
      leads: india.leads.map((lead) => {
        const values = legacyLeadFields[lead.id]!;
        return { ...lead, name: values[0], company: values[1], email: values[2] };
      }),
      opportunities: india.opportunities.map((opportunity) => {
        const values = legacyOpportunityFields[opportunity.id]!;
        return { ...opportunity, title: values[0], account: values[1], contact: values[2] };
      }),
      activities: india.activities.map((activity) => {
        const values = legacyActivityFields[activity.id]!;
        return { ...activity, title: values[0], subject: values[1] };
      }),
    };

    const localized = localizeInitialCrmStateForIndia(legacy);

    expect(localized).not.toBe(legacy);
    expect(localized.revision).toBe(legacy.revision + 1);
    expect(localized.leads.find(({ id }) => id === 'lead-101')?.company).toBe('Saffron Foods & Beverages');
    expect(localized.opportunities.find(({ id }) => id === 'opp-209')).toMatchObject({
      title: 'Multi-entity back-office transformation',
      account: 'Sangam Biotech',
    });
    const customerChanged = { ...legacy, activities: [...legacy.activities, { ...legacy.activities[0]!, id: 'customer-activity' }] };
    expect(localizeInitialCrmStateForIndia(customerChanged)).toBe(customerChanged);
  });

  it('adds a normalized lead without mutating the previous state', () => {
    const state = createInitialCrmState();
    const next = addLead(
      state,
      {
        name: '  Ada Lovelace ',
        company: ' Analytical Engines ',
        email: ' ADA@EXAMPLE.COM ',
        source: 'Referral',
      },
      'lead-ada',
      '2026-07-15T07:10:00.000Z',
    );

    expect(state.leads).toHaveLength(3);
    expect(next.leads).toHaveLength(4);
    expect(next.leads[0]).toMatchObject({
      id: 'lead-ada',
      name: 'Ada Lovelace',
      company: 'Analytical Engines',
      email: 'ada@example.com',
      status: 'new',
      version: 1,
    });
    expect(next.revision).toBe(2);
    expect(state.revision).toBe(1);
  });

  it('moves an opportunity and applies automatic probability', () => {
    const state = createInitialCrmState();
    const before = state.opportunities.find(({ id }) => id === 'opp-201');
    const next = moveOpportunity(
      state,
      { id: 'opp-201', toStage: 'qualify', expectedVersion: 1 },
      '2026-07-15T07:20:00.000Z',
    );
    const after = next.opportunities.find(({ id }) => id === 'opp-201');

    expect(before?.stage).toBe('discover');
    expect(after?.stage).toBe('qualify');
    expect(after?.probability).toBe(30);
    expect(after?.version).toBe(2);
    expect(after?.updatedAt).toBe('2026-07-15T07:20:00.000Z');
    expect(next.revision).toBe(2);
  });

  it('preserves manually controlled probability during stage movement', () => {
    const state = createInitialCrmState();
    const next = moveOpportunity(state, {
      id: 'opp-202',
      toStage: 'qualify',
      expectedVersion: 2,
    });
    const opportunity = next.opportunities.find(({ id }) => id === 'opp-202');

    expect(opportunity?.stage).toBe('qualify');
    expect(opportunity?.probabilityMode).toBe('manual');
    expect(opportunity?.probability).toBe(20);
  });

  it('rejects an illegal stage jump', () => {
    const state = createInitialCrmState();

    expect(() =>
      moveOpportunity(state, {
        id: 'opp-201',
        toStage: 'commit',
        expectedVersion: 1,
      }),
    ).toThrow('Transition from discover to commit is not allowed.');
    expect(state.opportunities[0]?.stage).toBe('discover');
  });

  it('enforces optimistic concurrency', () => {
    const state = createInitialCrmState();

    expect(() =>
      moveOpportunity(state, {
        id: 'opp-201',
        toStage: 'qualify',
        expectedVersion: 99,
      }),
    ).toThrow('changed elsewhere');
  });

  it('fails safely when an opportunity is missing', () => {
    const state = createInitialCrmState();

    expect(() =>
      moveOpportunity(state, {
        id: 'opp-missing',
        toStage: 'qualify',
        expectedVersion: 1,
      }),
    ).toThrow('Opportunity not found.');
  });

  it('completes an activity once and retains immutability', () => {
    const state = createInitialCrmState();
    const next = finishActivity(state, {
      id: 'act-301',
      expectedVersion: 1,
    });
    const originalActivity = state.activities.find(({ id }) => id === 'act-301');
    const completedActivity = next.activities.find(({ id }) => id === 'act-301');

    expect(originalActivity?.status).toBe('open');
    expect(completedActivity?.status).toBe('completed');
    expect(completedActivity?.version).toBe(2);
    expect(next.revision).toBe(2);
  });

  it('rejects stale or missing activity commands', () => {
    const state = createInitialCrmState();

    expect(() =>
      finishActivity(state, { id: 'act-301', expectedVersion: 7 }),
    ).toThrow('changed elsewhere');
    expect(() =>
      finishActivity(state, { id: 'act-missing', expectedVersion: 1 }),
    ).toThrow('Activity not found.');
  });

  it('bulk assigns opportunity ownership with optimistic version checks', () => {
    const state = createInitialCrmState();
    const next = assignOpportunities(state, ['opp-201', 'opp-202'], { 'opp-201': 1, 'opp-202': 2 }, 'territory-south', { id: 'user-lee', name: 'Lee Chen', initials: 'LC', color: '#dc6d2e' }, '2026-07-15T13:00:00.000Z');
    expect(next.opportunities.find(({ id }) => id === 'opp-201')).toMatchObject({ territoryId: 'territory-south', owner: { id: 'user-lee' }, version: 2 });
    expect(next.opportunities.find(({ id }) => id === 'opp-202')).toMatchObject({ territoryId: 'territory-south', owner: { id: 'user-lee' }, version: 3 });
    expect(() => assignOpportunities(state, ['opp-201'], { 'opp-201': 99 }, 'territory-south', { id: 'user-lee', name: 'Lee Chen', initials: 'LC', color: '#dc6d2e' })).toThrow('changed');
  });
});
