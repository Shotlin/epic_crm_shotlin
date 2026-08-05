import type {
  CompleteActivityInput,
  CreateLeadInput,
  CreateOpportunityInput,
  CrmState,
  DashboardSnapshot,
  MoveOpportunityInput,
  Opportunity,
  Owner,
  PipelineStageId,
} from '../shared/contracts';
import type { PipelineMovePolicy } from '../shared/crm-depth-contracts';

/**
 * Epic BOS is India-first by default.  Individual opportunities still carry
 * their own currency, so international business remains explicit rather than
 * being silently relabelled as INR.
 */
export const DEFAULT_CRM_CURRENCY = 'INR' as const;

const LEGACY_USD_BOOTSTRAP_VALUES: Readonly<Record<string, number>> = {
  'opp-201': 84_000,
  'opp-202': 128_000,
  'opp-203': 196_000,
  'opp-204': 112_000,
  'opp-205': 248_000,
  'opp-206': 94_000,
  'opp-207': 315_000,
  'opp-208': 176_000,
  'opp-209': 420_000,
  'opp-210': 154_000,
};

const LEGACY_USD_BOOTSTRAP_SOURCE_PIPELINES: Readonly<Record<string, number>> = {
  Partner: 752_000,
  Outbound: 372_000,
  Event: 266_000,
  Website: 222_000,
  Referral: 315_000,
};

const LEGACY_USD_BOOTSTRAP_REVENUE_SERIES: Readonly<Record<string, readonly [number, number]>> = {
  Feb: [210_000, 220_000],
  Mar: [246_000, 230_000],
  Apr: [238_000, 250_000],
  May: [284_000, 270_000],
  Jun: [302_000, 295_000],
  Jul: [326_000, 320_000],
};

export interface PipelineStage {
  id: PipelineStageId;
  label: string;
  probability: number;
  signal: string;
}

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  { id: 'discover', label: 'Discover', probability: 15, signal: 'New demand' },
  { id: 'qualify', label: 'Qualify', probability: 30, signal: 'Fit confirmed' },
  { id: 'solution', label: 'Solution', probability: 50, signal: 'Value mapped' },
  { id: 'proposal', label: 'Proposal', probability: 70, signal: 'Terms shared' },
  { id: 'commit', label: 'Commit', probability: 90, signal: 'Decision due' },
] as const;

export const ALLOWED_STAGE_TRANSITIONS: Record<string, readonly PipelineStageId[]> = {
  discover: ['qualify'],
  qualify: ['discover', 'solution'],
  solution: ['qualify', 'proposal'],
  proposal: ['solution', 'commit'],
  commit: ['proposal'],
};

const owners: Owner[] = [
  { id: 'usr-am', name: 'Aditi Mehra', initials: 'AM', color: '#2f63d8' },
  { id: 'usr-rk', name: 'Riya Kapoor', initials: 'RK', color: '#a54f2c' },
  { id: 'usr-jl', name: 'Jaidev Lal', initials: 'JL', color: '#2a7b68' },
  { id: 'usr-ns', name: 'Neeraj Shah', initials: 'NS', color: '#7554b8' },
];

function owner(index: number): Owner {
  return owners[index % owners.length] ?? owners[0]!;
}

/**
 * Explicit legacy sample/test fixture only. Runtime retail workspace
 * provisioning uses createCleanCrmState and never calls this factory for an
 * operator workspace.
 */
export function createLegacySampleCrmState(): CrmState {
  return {
    schemaVersion: 1,
    tenantId: 'tenant-northstar',
    companyId: 'company-northstar-us',
    branchId: 'branch-northstar-hq',
    revision: 1,
    closedWon: 28,
    closedLost: 12,
    averageCycleDays: 31,
    leads: [
      {
        id: 'lead-101',
        name: 'Kavya Iyer',
        company: 'Saffron Foods & Beverages',
        email: 'kavya@saffronfoods.example',
        source: 'Partner',
        owner: owner(1),
        status: 'new',
        createdAt: '2026-07-15T04:18:00.000Z',
        version: 1,
      },
      {
        id: 'lead-102',
        name: 'Rahul Bansal',
        company: 'Pravaah Mobility',
        email: 'rahul@pravaahmobility.example',
        source: 'Website',
        owner: owner(0),
        status: 'working',
        createdAt: '2026-07-14T10:35:00.000Z',
        version: 1,
      },
      {
        id: 'lead-103',
        name: 'Dr. Meera Shah',
        company: 'Arogyam Care Network',
        email: 'meera@arogyamcare.example',
        source: 'Event',
        owner: owner(3),
        status: 'qualified',
        createdAt: '2026-07-13T08:12:00.000Z',
        version: 1,
      },
    ],
    opportunities: [
      {
        id: 'opp-201',
        title: 'Regional distributor operating model',
        account: 'Saffron Foods & Beverages',
        contact: 'Kavya Iyer',
        owner: owner(1),
        stage: 'discover',
        value: 8_400_000,
        currency: DEFAULT_CRM_CURRENCY,
        probability: 15,
        probabilityMode: 'automatic',
        expectedClose: '2026-09-18',
        nextStep: 'Map distributor and procurement workflow',
        lastActivity: '34 min ago',
        health: 'on-track',
        source: 'Partner',
        tags: ['ERP', 'Multi-site'],
        updatedAt: '2026-07-15T06:00:00.000Z',
        version: 1,
      },
      {
        id: 'opp-202',
        title: 'Field service dispatch control',
        account: 'Pravaah Mobility',
        contact: 'Rahul Bansal',
        owner: owner(0),
        stage: 'discover',
        value: 12_800_000,
        currency: DEFAULT_CRM_CURRENCY,
        probability: 20,
        probabilityMode: 'manual',
        expectedClose: '2026-10-02',
        nextStep: 'Confirm technician count',
        lastActivity: '2h ago',
        health: 'attention',
        source: 'Website',
        tags: ['Service', 'Mobile'],
        updatedAt: '2026-07-15T03:45:00.000Z',
        version: 2,
      },
      {
        id: 'opp-203',
        title: 'Multi-entity finance consolidation',
        account: 'Aster Renewable Energy',
        contact: 'Nikhil Sethi',
        owner: owner(2),
        stage: 'qualify',
        value: 19_600_000,
        currency: DEFAULT_CRM_CURRENCY,
        probability: 30,
        probabilityMode: 'automatic',
        expectedClose: '2026-09-04',
        nextStep: 'CFO consolidation workshop',
        lastActivity: 'Yesterday',
        health: 'on-track',
        source: 'Outbound',
        tags: ['Finance', 'Enterprise'],
        updatedAt: '2026-07-14T08:30:00.000Z',
        version: 1,
      },
      {
        id: 'opp-204',
        title: 'People operations platform',
        account: 'Arogyam Care Network',
        contact: 'Dr. Meera Shah',
        owner: owner(3),
        stage: 'qualify',
        value: 11_200_000,
        currency: DEFAULT_CRM_CURRENCY,
        probability: 35,
        probabilityMode: 'manual',
        expectedClose: '2026-08-29',
        nextStep: 'Validate compliance scope',
        lastActivity: '3h ago',
        health: 'on-track',
        source: 'Event',
        tags: ['HR', 'Compliance'],
        updatedAt: '2026-07-15T02:12:00.000Z',
        version: 3,
      },
      {
        id: 'opp-205',
        title: 'Supply network control tower',
        account: 'Navin Components',
        contact: 'Farhan Qureshi',
        owner: owner(0),
        stage: 'solution',
        value: 24_800_000,
        currency: DEFAULT_CRM_CURRENCY,
        probability: 50,
        probabilityMode: 'automatic',
        expectedClose: '2026-08-21',
        nextStep: 'Review solution blueprint',
        lastActivity: '18 min ago',
        health: 'on-track',
        source: 'Partner',
        tags: ['Inventory', 'Planning'],
        updatedAt: '2026-07-15T06:20:00.000Z',
        version: 2,
      },
      {
        id: 'opp-206',
        title: 'Revenue intelligence workspace',
        account: 'Nadi Hospitality Group',
        contact: 'Ishita Menon',
        owner: owner(2),
        stage: 'solution',
        value: 9_400_000,
        currency: DEFAULT_CRM_CURRENCY,
        probability: 50,
        probabilityMode: 'automatic',
        expectedClose: '2026-09-11',
        nextStep: 'Deliver sandbox access',
        lastActivity: '2 days ago',
        health: 'at-risk',
        source: 'Website',
        tags: ['CRM', 'Analytics'],
        updatedAt: '2026-07-13T11:00:00.000Z',
        version: 1,
      },
      {
        id: 'opp-207',
        title: 'Manufacturing execution core',
        account: 'Aranya Industrial Systems',
        contact: 'Arjun Nair',
        owner: owner(1),
        stage: 'proposal',
        value: 31_500_000,
        currency: DEFAULT_CRM_CURRENCY,
        probability: 70,
        probabilityMode: 'automatic',
        expectedClose: '2026-08-08',
        nextStep: 'Legal review',
        lastActivity: '51 min ago',
        health: 'attention',
        source: 'Referral',
        tags: ['MRP', 'Quality'],
        updatedAt: '2026-07-15T05:30:00.000Z',
        version: 4,
      },
      {
        id: 'opp-208',
        title: 'Portfolio profitability hub',
        account: 'Mitra Capital Advisors',
        contact: 'Nandini Rao',
        owner: owner(3),
        stage: 'proposal',
        value: 17_600_000,
        currency: DEFAULT_CRM_CURRENCY,
        probability: 75,
        probabilityMode: 'manual',
        expectedClose: '2026-08-14',
        nextStep: 'Finalize implementation plan',
        lastActivity: '4h ago',
        health: 'on-track',
        source: 'Outbound',
        tags: ['Projects', 'Finance'],
        updatedAt: '2026-07-15T01:40:00.000Z',
        version: 2,
      },
      {
        id: 'opp-209',
        title: 'Multi-entity back-office transformation',
        account: 'Sangam Biotech',
        contact: 'Sonal Khanna',
        owner: owner(0),
        stage: 'commit',
        value: 42_000_000,
        currency: DEFAULT_CRM_CURRENCY,
        probability: 90,
        probabilityMode: 'automatic',
        expectedClose: '2026-07-30',
        nextStep: 'Executive signature',
        lastActivity: '12 min ago',
        health: 'on-track',
        source: 'Partner',
        tags: ['Multi-entity', 'Platform'],
        updatedAt: '2026-07-15T06:35:00.000Z',
        version: 5,
      },
      {
        id: 'opp-210',
        title: 'Distribution modernization',
        account: 'Aarohan Consumer Products',
        contact: 'Vivek Malhotra',
        owner: owner(2),
        stage: 'commit',
        value: 15_400_000,
        currency: DEFAULT_CRM_CURRENCY,
        probability: 85,
        probabilityMode: 'manual',
        expectedClose: '2026-08-01',
        nextStep: 'Security sign-off',
        lastActivity: 'Yesterday',
        health: 'attention',
        source: 'Event',
        tags: ['Distribution', 'Cloud'],
        updatedAt: '2026-07-14T04:00:00.000Z',
        version: 3,
      },
      {
        id: 'opp-211',
        accountId: 'account-sahyadri',
        contactId: 'contact-ananya',
        territoryId: 'territory-west',
        title: 'Unified distributor growth network',
        account: 'Sahyadri Retail Network',
        contact: 'Ananya Rao',
        owner: owner(0),
        stage: 'discover',
        value: 4800000,
        currency: DEFAULT_CRM_CURRENCY,
        probability: 15,
        probabilityMode: 'automatic',
        expectedClose: '2026-10-16',
        nextStep: 'Map distributor operating model',
        lastActivity: '3h ago',
        health: 'at-risk',
        source: 'Partner',
        tags: ['India', 'Distribution'],
        updatedAt: '2026-07-15T03:00:00.000Z',
        version: 1,
      },
    ],
    activities: [
      {
        id: 'act-301',
        type: 'meeting',
        title: 'Executive value review',
        subject: 'Sangam Biotech',
        owner: owner(0),
        dueAt: '2026-07-15T08:30:00.000Z',
        status: 'open',
        priority: 'high',
        version: 1,
      },
      {
        id: 'act-302',
        type: 'call',
        title: 'Confirm security scope',
        subject: 'Aarohan Consumer Products',
        owner: owner(2),
        dueAt: '2026-07-15T10:00:00.000Z',
        status: 'open',
        priority: 'normal',
        version: 1,
      },
      {
        id: 'act-303',
        type: 'email',
        title: 'Send revised commercial terms',
        subject: 'Aranya Industrial Systems',
        owner: owner(1),
        dueAt: '2026-07-15T11:30:00.000Z',
        status: 'open',
        priority: 'high',
        version: 2,
      },
      {
        id: 'act-304',
        type: 'task',
        title: 'Prepare ROI model',
        subject: 'Navin Components',
        owner: owner(0),
        dueAt: '2026-07-16T05:00:00.000Z',
        status: 'open',
        priority: 'normal',
        version: 1,
      },
    ],
    sources: [
      { source: 'Partner', pipeline: 75_200_000, conversion: 42, trend: 12 },
      { source: 'Outbound', pipeline: 37_200_000, conversion: 28, trend: 4 },
      { source: 'Event', pipeline: 26_600_000, conversion: 34, trend: 8 },
      { source: 'Website', pipeline: 22_200_000, conversion: 19, trend: -3 },
      { source: 'Referral', pipeline: 31_500_000, conversion: 51, trend: 16 },
    ],
    revenueSeries: [
      { label: 'Feb', actual: 21_000_000, target: 22_000_000 },
      { label: 'Mar', actual: 24_600_000, target: 23_000_000 },
      { label: 'Apr', actual: 23_800_000, target: 25_000_000 },
      { label: 'May', actual: 28_400_000, target: 27_000_000 },
      { label: 'Jun', actual: 30_200_000, target: 29_500_000 },
      { label: 'Jul', actual: 32_600_000, target: 32_000_000 },
    ],
  };
}

/** @deprecated Prefer createLegacySampleCrmState in tests and sample tooling. */
export const createInitialCrmState = createLegacySampleCrmState;

/**
 * Empty, India-first CRM state for a newly provisioned workspace.
 *
 * This deliberately does not reuse any visible people, accounts, pipeline
 * values, activity history, or synthetic KPI inputs from the guided sample.
 * The durable tenant/company/branch scope stays aligned with the kernel so a
 * provisioner can replace the sample factory without remapping records.
 */
export function createCleanCrmState(): CrmState {
  return {
    schemaVersion: 1,
    tenantId: 'tenant-northstar',
    companyId: 'company-northstar-us',
    branchId: 'branch-northstar-hq',
    revision: 1,
    closedWon: 0,
    closedLost: 0,
    averageCycleDays: 0,
    leads: [],
    opportunities: [],
    activities: [],
    sources: [],
    revenueSeries: [],
  };
}

function isUntouchedLegacyGlobalCrmDemo(state: CrmState): boolean {
  const legacyLeads: Readonly<Record<string, readonly [string, string, string]>> = {
    'lead-101': ['Elena Torres', 'Northbank Foods', 'elena@northbank.example'],
    'lead-102': ['Mateo Wright', 'Redwood Mobility', 'mateo@redwood.example'],
    'lead-103': ['Priya Desai', 'Arcline Health', 'priya@arcline.example'],
  };
  const legacyOpportunities: Readonly<Record<string, readonly [string, string, string]>> = {
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
  const legacyActivities: Readonly<Record<string, readonly [string, string]>> = {
    'act-301': ['Executive value review', 'Atlas Biotech'],
    'act-302': ['Confirm security scope', 'Solace Consumer'],
    'act-303': ['Send revised commercial terms', 'Kestrel Fabrication'],
    'act-304': ['Prepare ROI model', 'Meridian Works'],
  };
  const indiaBaseline = createLegacySampleCrmState();
  const valuesByOpportunityId = new Map(indiaBaseline.opportunities.map((opportunity) => [opportunity.id, opportunity.value]));
  const sourcePipelineByName = new Map(indiaBaseline.sources.map((source) => [source.source, source.pipeline]));
  const revenueByLabel = new Map(indiaBaseline.revenueSeries.map((point) => [point.label, point]));

  return state.revision <= 2 &&
    state.leads.length === 3 &&
    state.opportunities.length === 11 &&
    state.activities.length === 4 &&
    state.sources.length === indiaBaseline.sources.length &&
    state.revenueSeries.length === indiaBaseline.revenueSeries.length &&
    state.leads.every((lead) => {
      const signature = legacyLeads[lead.id];
      if (!signature) return false;
      return lead.version === 1 && lead.name === signature[0] &&
        lead.company === signature[1] && lead.email === signature[2];
    }) &&
    state.opportunities.every((opportunity) => {
      const signature = legacyOpportunities[opportunity.id];
      if (!signature) return false;
      return opportunity.currency === DEFAULT_CRM_CURRENCY &&
        opportunity.value === valuesByOpportunityId.get(opportunity.id) &&
        opportunity.title === signature[0] && opportunity.account === signature[1] && opportunity.contact === signature[2];
    }) &&
    state.activities.every((activity) => {
      const signature = legacyActivities[activity.id];
      if (!signature) return false;
      return activity.title === signature[0] && activity.subject === signature[1];
    }) &&
    state.sources.every((source) => source.pipeline === sourcePipelineByName.get(source.source)) &&
    state.revenueSeries.every((point) => {
      const expected = revenueByLabel.get(point.label);
      return expected?.actual === point.actual && expected.target === point.target;
    });
}

/**
 * Localizes only known untouched Epic BOS demonstration records. It never
 * relabels a genuine foreign-currency opportunity: export and FX workflows
 * remain explicit, evidenced business processes.
 */
export function localizeInitialCrmStateForIndia(state: CrmState): CrmState {
  const hasOnlyLegacyOpportunities =
    state.opportunities.length === 11 &&
    state.opportunities.every((opportunity) => {
      if (opportunity.id === 'opp-211') {
        return opportunity.currency === DEFAULT_CRM_CURRENCY && opportunity.value === 4_800_000;
      }
      return (
        opportunity.currency === 'USD' &&
        LEGACY_USD_BOOTSTRAP_VALUES[opportunity.id] === opportunity.value
      );
    });
  const hasLegacySourcePipelines =
    state.sources.length === Object.keys(LEGACY_USD_BOOTSTRAP_SOURCE_PIPELINES).length &&
    state.sources.every(
      (source) => LEGACY_USD_BOOTSTRAP_SOURCE_PIPELINES[source.source] === source.pipeline,
    );
  const hasLegacyRevenueSeries =
    state.revenueSeries.length === Object.keys(LEGACY_USD_BOOTSTRAP_REVENUE_SERIES).length &&
    state.revenueSeries.every((point) => {
      const expected = LEGACY_USD_BOOTSTRAP_REVENUE_SERIES[point.label];
      return expected?.[0] === point.actual && expected[1] === point.target;
    });

  const isLegacyUsdBootstrap = hasOnlyLegacyOpportunities && hasLegacySourcePipelines && hasLegacyRevenueSeries;
  const inrCandidate: CrmState = isLegacyUsdBootstrap
    ? {
        ...state,
        opportunities: state.opportunities.map((opportunity) =>
          opportunity.currency === 'USD'
            ? { ...opportunity, value: opportunity.value * 100, currency: DEFAULT_CRM_CURRENCY }
            : opportunity,
        ),
        sources: state.sources.map((source) => ({ ...source, pipeline: source.pipeline * 100 })),
        revenueSeries: state.revenueSeries.map((point) => ({
          ...point,
          actual: point.actual * 100,
          target: point.target * 100,
        })),
      }
    : state;

  if (isUntouchedLegacyGlobalCrmDemo(inrCandidate)) {
    const indiaDemo = createLegacySampleCrmState();
    return {
      ...indiaDemo,
      tenantId: state.tenantId,
      companyId: state.companyId,
      branchId: state.branchId,
      revision: state.revision + 1,
    };
  }

  if (!isLegacyUsdBootstrap) return state;

  return {
    ...inrCandidate,
    revision: state.revision + 1,
    opportunities: inrCandidate.opportunities.map((opportunity) => ({
      ...opportunity,
      version: opportunity.currency === DEFAULT_CRM_CURRENCY && state.opportunities.find(({ id }) => id === opportunity.id)?.currency === 'USD'
        ? opportunity.version + 1
        : opportunity.version,
    })),
  };
}

export function getDashboardSnapshot(
  state: CrmState,
  generatedAt = new Date().toISOString(),
): DashboardSnapshot {
  const reportingOpportunities = state.opportunities.filter(
    ({ currency }) => currency === DEFAULT_CRM_CURRENCY,
  );
  const pipelineValue = reportingOpportunities.reduce(
    (total, opportunity) => total + opportunity.value,
    0,
  );
  const weightedForecast = reportingOpportunities.reduce(
    (total, opportunity) =>
      total + opportunity.value * (opportunity.probability / 100),
    0,
  );
  const decisions = state.closedWon + state.closedLost;
  const winRate = decisions === 0 ? 0 : (state.closedWon / decisions) * 100;

  return {
    revision: state.revision,
    generatedAt,
    metrics: {
      pipeline: {
        label: 'Open pipeline',
        value: pipelineValue,
        format: 'currency',
        trend: 12.4,
        context: 'INR reporting view',
      },
      weightedForecast: {
        label: 'Weighted forecast',
        value: weightedForecast,
        format: 'currency',
        trend: 8.7,
        context: 'INR reporting view',
      },
      winRate: {
        label: 'Win rate',
        value: winRate,
        format: 'percentage',
        trend: 3.2,
        context: String(state.closedWon) + ' of ' + String(decisions) + ' decisions',
      },
      salesCycle: {
        label: 'Sales cycle',
        value: state.averageCycleDays,
        format: 'days',
        trend: -6.1,
        context: '2 days faster',
      },
    },
    leads: structuredClone(state.leads),
    opportunities: structuredClone(state.opportunities),
    activities: structuredClone(state.activities),
    sources: structuredClone(state.sources),
    revenueSeries: structuredClone(state.revenueSeries),
  };
}

export function addLead(
  state: CrmState,
  input: CreateLeadInput,
  id: string = crypto.randomUUID(),
  now = new Date().toISOString(),
): CrmState {
  const email = input.email.trim().toLowerCase();
  if (state.leads.some((lead) => lead.email === email && lead.status !== 'converted')) {
    throw new Error('An active lead with this email already exists.');
  }
  const next = structuredClone(state);
  next.leads.unshift({
    id,
    name: input.name.trim(),
    company: input.company.trim(),
    email,
    source: input.source,
    owner: owner(0),
    status: 'new',
    createdAt: now,
    version: 1,
  });
  next.revision += 1;

  return next;
}

export function addOpportunity(
  state: CrmState,
  input: CreateOpportunityInput,
  id: string = crypto.randomUUID(),
  now = new Date().toISOString(),
): CrmState {
  if (state.opportunities.some((opportunity) => opportunity.id === id)) throw new Error('Opportunity already exists.');
  if (!Number.isFinite(input.value) || input.value <= 0) throw new Error('Opportunity value must be positive.');
  if (!Number.isInteger(input.probability) || input.probability < 0 || input.probability > 100) throw new Error('Opportunity probability must be between 0 and 100.');
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error('Opportunity currency must use an ISO currency code.');
  if (input.expectedClose < now.slice(0, 10)) throw new Error('Expected close cannot be in the past.');
  const opportunity: Opportunity = {
    id,
    accountId: input.accountId,
    contactId: input.contactId,
    territoryId: input.territoryId,
    title: input.title.trim(),
    account: input.account.trim(),
    contact: input.contact.trim(),
    owner: structuredClone(input.owner),
    stage: input.stage,
    value: input.value,
    currency: input.currency,
    probability: input.probability,
    probabilityMode: 'automatic',
    expectedClose: input.expectedClose,
    nextStep: input.nextStep.trim(),
    lastActivity: 'Just now',
    health: 'on-track',
    source: input.source.trim(),
    tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))],
    updatedAt: now,
    version: 1,
  };
  return { ...state, revision: state.revision + 1, opportunities: [opportunity, ...state.opportunities] };
}

export function assignOpportunities(
  state: CrmState,
  opportunityIds: string[],
  expectedVersions: Record<string, number>,
  territoryId: string,
  nextOwner: Owner,
  now = new Date().toISOString(),
): CrmState {
  const selected = new Set(opportunityIds);
  if (!selected.size || selected.size > 500) throw new Error('Select between 1 and 500 opportunities.');
  for (const id of selected) {
    const opportunity = state.opportunities.find((candidate) => candidate.id === id);
    if (!opportunity) throw new Error('Bulk assignment includes an unknown opportunity.');
    if (opportunity.version !== expectedVersions[id]) throw new Error(`Opportunity ${id} changed. Refresh and retry the bulk action.`);
  }
  return {
    ...state,
    revision: state.revision + 1,
    opportunities: state.opportunities.map((opportunity) => selected.has(opportunity.id) ? { ...opportunity, territoryId, owner: structuredClone(nextOwner), updatedAt: now, version: opportunity.version + 1 } : opportunity),
  };
}

export function moveOpportunity(
  state: CrmState,
  input: MoveOpportunityInput,
  now = new Date().toISOString(),
  policy?: PipelineMovePolicy,
): CrmState {
  const next = structuredClone(state);
  const opportunity = next.opportunities.find(({ id }) => id === input.id);

  if (!opportunity) {
    throw new Error('Opportunity not found.');
  }

  if (opportunity.version !== input.expectedVersion) {
    throw new Error('This opportunity changed elsewhere. Refresh and retry.');
  }

  const allowed = policy?.allowed ?? (ALLOWED_STAGE_TRANSITIONS[opportunity.stage] ?? []).includes(input.toStage);
  if (!allowed) {
    throw new Error(
      'Transition from ' +
        opportunity.stage +
        ' to ' +
        input.toStage +
        ' is not allowed.',
    );
  }

  opportunity.stage = input.toStage;
  opportunity.updatedAt = now;
  opportunity.version += 1;

  if (opportunity.probabilityMode === 'automatic') {
    opportunity.probability = policy?.probability ??
      PIPELINE_STAGES.find(({ id }) => id === input.toStage)?.probability ?? opportunity.probability;
  }

  next.revision += 1;

  return next;
}

export function convertLead(
  state: CrmState,
  leadId: string,
  expectedVersion: number,
  accountId: string,
  contactId: string,
): CrmState {
  const next = structuredClone(state);
  const lead = next.leads.find(({ id }) => id === leadId);
  if (!lead) throw new Error('Lead not found.');
  if (lead.status === 'converted' && lead.convertedAccountId === accountId && lead.convertedContactId === contactId) return next;
  if (lead.version !== expectedVersion) throw new Error('The lead changed. Refresh and retry.');
  lead.status = 'converted';
  lead.convertedAccountId = accountId;
  lead.convertedContactId = contactId;
  lead.version += 1;
  next.revision += 1;
  return next;
}

export function importLeads(state: CrmState, rows: Array<Record<string, string>>): CrmState {
  let next = state;
  for (const row of rows) {
    if (next.leads.some((lead) => lead.email === row.email?.toLowerCase())) continue;
    next = addLead(next, {
      name: row.name ?? '',
      company: row.company ?? '',
      email: row.email ?? '',
      source: row.source ?? 'Website',
    });
  }
  return next;
}

export function finishActivity(
  state: CrmState,
  input: CompleteActivityInput,
): CrmState {
  const next = structuredClone(state);
  const activity = next.activities.find(({ id }) => id === input.id);

  if (!activity) {
    throw new Error('Activity not found.');
  }

  if (activity.version !== input.expectedVersion) {
    throw new Error('This activity changed elsewhere. Refresh and retry.');
  }

  if (activity.status === 'completed') {
    return next;
  }

  activity.status = 'completed';
  activity.version += 1;
  next.revision += 1;

  return next;
}
