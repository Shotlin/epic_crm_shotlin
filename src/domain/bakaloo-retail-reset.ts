import { createHash } from 'node:crypto';
import type { CrmState } from '../shared/contracts';
import type { CrmDepthState } from '../shared/crm-depth-contracts';
import type { KernelState } from '../shared/kernel-contracts';
import type { PartyState } from '../shared/party-contracts';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import { createCleanCrmDepthState } from './crm-depth';
import { createCleanCrmState } from './crm';
import {
  adoptBootstrapOwnerIdentity,
  createCleanKernelState,
  updateBranch,
  updateCompany,
  updateTenantIdentity,
  WORKSPACE_OWNER_ID,
} from './kernel';
import { createCleanPartyState } from './party';
import { createCleanRevenueOpsState } from './revenue-ops';

/**
 * This phrase is deliberately explicit so the UI can require a human to
 * confirm a destructive replacement after it has created a verified backup.
 */
export const BAKALOO_RETAIL_SAMPLE_RESET_PHRASE = 'RESET BAKALOO';

export interface BakalooRetailOwnerIdentity {
  /** Must be the immutable bootstrap-owner record; credentials are out of scope. */
  userId: string;
  email: string;
  displayName: string;
}

export interface BakalooRetailSampleResetInput {
  kernel: KernelState;
  crm: CrmState;
  party: PartyState;
  crmDepth: CrmDepthState;
  revenueOps: RevenueOpsState;
  /**
   * Comes from the authenticated session/credential store.  This planner only
   * copies it into the clean kernel profile; it never receives a password,
   * credential hash, or session token.
   */
  owner: BakalooRetailOwnerIdentity;
}

type ResetNamespace = 'kernel' | 'crm' | 'party' | 'crm-depth' | 'revenue-ops-india';

export interface BakalooRetailSampleResetPreview {
  eligible: boolean;
  requiredConfirmation: typeof BAKALOO_RETAIL_SAMPLE_RESET_PHRASE;
  fingerprintVersion: 'bakaloo-retail-generic-demo-v1';
  matchedNamespaces: ResetNamespace[];
  unmatchedNamespaces: ResetNamespace[];
  /** A human-readable, non-sensitive count of sample records that will go away. */
  recordsToClear: ReadonlyArray<{ module: string; records: number }>;
  reason: string;
}

export interface BakalooRetailStarterDocuments {
  kernel: KernelState;
  crm: CrmState;
  party: PartyState;
  crmDepth: CrmDepthState;
  revenueOps: RevenueOpsState;
}

export interface BakalooRetailSampleResetPlan {
  preview: BakalooRetailSampleResetPreview;
  /** Omitted unless every persisted document is the exact known generic demo. */
  documents?: BakalooRetailStarterDocuments;
}

/**
 * Full-document, order-independent fingerprints of the persisted generic demo
 * that was present in the local Epic BOS database.  They protect real records:
 * a changed field, an added record, or a different starter version results in
 * a different digest and the reset is refused.
 *
 * The values intentionally describe state documents only. Authentication,
 * sessions, encrypted attachments, backups, and external credentials are not
 * part of this planner and are never changed by it.
 */
const KNOWN_GENERIC_DEMO_FINGERPRINTS: Readonly<Record<ResetNamespace, string>> = {
  kernel: '5fec4f4f8140fafb2de40d7df804bb9472cd53b69b96dbf4be889f11569cd034',
  crm: '3653329f2957801610a52976f77946eef686e627382189d9c0894ede13d06221',
  party: '48bd1e46c4f6c8f7114de65476b8d0c2e1b361f248d4bfa08757dcc12954c3a8',
  'crm-depth': 'c9f2ee06d014b1e8695a452dd91430d26fcf91536c3bcb38469bd3734754b96c',
  'revenue-ops-india': 'e0cea8bd0fe62ca9f6d75f7e075d9be6da5725e2191b47b01913169a98558d2a',
};

const RESET_NAMESPACES: readonly ResetNamespace[] = [
  'kernel',
  'crm',
  'party',
  'crm-depth',
  'revenue-ops-india',
];

/**
 * Produces a deterministic JSON representation without relying on property
 * insertion order. State documents are JSON-compatible; explicit handling of
 * `undefined` also makes an accidental non-JSON property fail closed.
 */
function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  return serialized ?? `unsupported:${typeof value}`;
}

/** Exported for testability and for any future reset receipt/audit UI. */
export function fingerprintBakalooRetailState(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function stateFingerprints(input: BakalooRetailSampleResetInput): Record<ResetNamespace, string> {
  return {
    kernel: fingerprintBakalooRetailState(input.kernel),
    crm: fingerprintBakalooRetailState(input.crm),
    party: fingerprintBakalooRetailState(input.party),
    'crm-depth': fingerprintBakalooRetailState(input.crmDepth),
    'revenue-ops-india': fingerprintBakalooRetailState(input.revenueOps),
  };
}

function sampleRecordCounts(input: BakalooRetailSampleResetInput): BakalooRetailSampleResetPreview['recordsToClear'] {
  return [
    {
      module: 'CRM',
      records:
        input.crm.leads.length +
        input.crm.opportunities.length +
        input.crm.activities.length +
        input.crm.sources.length +
        input.crm.revenueSeries.length,
    },
    {
      module: 'Customer records',
      records:
        input.party.accounts.length +
        input.party.contacts.length +
        input.party.addresses.length +
        input.party.contactPoints.length +
        input.party.consents.length,
    },
    {
      module: 'CRM configuration',
      records:
        input.crmDepth.pipelines.length +
        input.crmDepth.scoringRules.length +
        input.crmDepth.campaigns.length +
        input.crmDepth.savedViews.length +
        input.crmDepth.adapters.length +
        input.crmDepth.communications.length,
    },
    {
      module: 'Revenue operations',
      records:
        input.revenueOps.territories.length +
        input.revenueOps.assignmentRules.length +
        input.revenueOps.assignments.length +
        input.revenueOps.segments.length +
        input.revenueOps.productInterests.length +
        input.revenueOps.taxCodes.length +
        input.revenueOps.products.length +
        input.revenueOps.priceLists.length +
        input.revenueOps.priceListEntries.length +
        input.revenueOps.discountPolicies.length +
        input.revenueOps.carrierAdapters.length,
    },
  ];
}

function ownerCanBeSafelyAdopted(owner: BakalooRetailOwnerIdentity): boolean {
  return owner.userId === WORKSPACE_OWNER_ID &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email.trim()) &&
    owner.displayName.trim().replace(/\s+/g, ' ').length >= 2;
}

/**
 * Looks only at a complete, known generic demo. It never uses broad cues such
 * as a dollar currency or a word in a company name, because real businesses
 * can legitimately contain both.
 */
export function previewBakalooRetailSampleReset(
  input: BakalooRetailSampleResetInput,
): BakalooRetailSampleResetPreview {
  const fingerprints = stateFingerprints(input);
  const matchedNamespaces = RESET_NAMESPACES.filter(
    (namespace) => fingerprints[namespace] === KNOWN_GENERIC_DEMO_FINGERPRINTS[namespace],
  );
  const unmatchedNamespaces = RESET_NAMESPACES.filter(
    (namespace) => !matchedNamespaces.includes(namespace),
  );
  const ownerIsSafe = ownerCanBeSafelyAdopted(input.owner);
  const eligible = unmatchedNamespaces.length === 0 && ownerIsSafe;

  return {
    eligible,
    requiredConfirmation: BAKALOO_RETAIL_SAMPLE_RESET_PHRASE,
    fingerprintVersion: 'bakaloo-retail-generic-demo-v1',
    matchedNamespaces,
    unmatchedNamespaces,
    recordsToClear: sampleRecordCounts(input),
    reason: eligible
      ? 'Every persisted business state document matches the known generic demo. A backup and typed confirmation are still required before replacement.'
      : !ownerIsSafe
        ? 'The authenticated owner identity cannot be safely adopted into the immutable workspace-owner record.'
        : 'This workspace contains a changed, additional, or different state document. It will not be cleared automatically.',
  };
}

function promoteRevision<T extends { revision: number }>(state: T, previousRevision: number): T {
  return { ...state, revision: Math.max(state.revision, previousRevision + 1) };
}

function createBakalooRetailStarter(
  input: BakalooRetailSampleResetInput,
  now: string,
): BakalooRetailStarterDocuments {
  let kernel = createCleanKernelState();
  kernel = adoptBootstrapOwnerIdentity(
    kernel,
    input.owner.email,
    input.owner.displayName,
    now,
    'audit-bakaloo-retail-owner-adopted',
    'event-bakaloo-retail-owner-adopted',
  );
  kernel = updateTenantIdentity(
    kernel,
    {
      name: 'Bakaloo Retail Workspace',
      slug: 'bakaloo-retail',
      expectedVersion: kernel.tenant.version,
    },
    now,
    'audit-bakaloo-retail-workspace',
    'event-bakaloo-retail-workspace',
  );

  const company = kernel.companies.find(({ id }) => id === kernel.context.companyId);
  if (!company) throw new Error('Clean retail starter is missing its active company.');
  kernel = updateCompany(
    kernel,
    {
      id: company.id,
      code: 'BAKALOO',
      name: 'Bakaloo Retail',
      // This is an editable starter label only. The first-run checklist must
      // ask the business for its statutory legal name and GST registrations.
      legalName: 'Bakaloo Retail',
      countryCode: 'IN',
      baseCurrency: 'INR',
      fiscalYearStartMonth: 4,
      status: 'active',
      expectedVersion: company.version,
    },
    now,
    'audit-bakaloo-retail-company',
    'event-bakaloo-retail-company',
  );

  const branch = kernel.branches.find(({ id }) => id === kernel.context.branchId);
  if (!branch) throw new Error('Clean retail starter is missing its primary branch.');
  kernel = updateBranch(
    kernel,
    {
      id: branch.id,
      companyId: kernel.context.companyId,
      code: 'PRIMARY',
      name: 'Primary store',
      timezone: 'Asia/Kolkata',
      status: 'active',
      expectedVersion: branch.version,
    },
    now,
    'audit-bakaloo-retail-primary-store',
    'event-bakaloo-retail-primary-store',
  );

  return {
    kernel: promoteRevision(kernel, input.kernel.revision),
    crm: promoteRevision(createCleanCrmState(), input.crm.revision),
    party: promoteRevision(createCleanPartyState(), input.party.revision),
    crmDepth: promoteRevision(createCleanCrmDepthState(), input.crmDepth.revision),
    revenueOps: promoteRevision(createCleanRevenueOpsState(), input.revenueOps.revision),
  };
}

/**
 * Plans, but never persists, a clean Bakaloo retail starter. The caller must
 * create and verify a backup, enforce the typed confirmation phrase, and use
 * one database transaction to replace these documents. Credentials and
 * sessions remain entirely outside the returned plan.
 */
export function planBakalooRetailSampleReset(
  input: BakalooRetailSampleResetInput,
  now = new Date().toISOString(),
): BakalooRetailSampleResetPlan {
  const preview = previewBakalooRetailSampleReset(input);
  if (!preview.eligible) return { preview };
  return { preview, documents: createBakalooRetailStarter(input, now) };
}
