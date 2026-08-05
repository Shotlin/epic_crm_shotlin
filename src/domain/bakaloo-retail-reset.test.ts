import { Buffer } from 'node:buffer';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { CrmState } from '../shared/contracts';
import type { CrmDepthState } from '../shared/crm-depth-contracts';
import type { KernelState } from '../shared/kernel-contracts';
import type { PartyState } from '../shared/party-contracts';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import {
  BAKALOO_RETAIL_SAMPLE_RESET_PHRASE,
  fingerprintBakalooRetailState,
  planBakalooRetailSampleReset,
  previewBakalooRetailSampleReset,
  type BakalooRetailSampleResetInput,
} from './bakaloo-retail-reset';

/**
 * Compressed JSON fixture of the exact generic state that shipped in the local
 * desktop workspace. It contains no credentials or sessions. Keeping it here
 * lets this reset safety boundary be tested without reading a user's database.
 */
const GENERIC_DEMO_FIXTURE = [
  '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',
].join('');

function exactGenericDemo(): BakalooRetailSampleResetInput {
  const documents = JSON.parse(
    inflateRawSync(Buffer.from(GENERIC_DEMO_FIXTURE, 'base64')).toString('utf8'),
  ) as Record<string, unknown>;

  return {
    kernel: documents.kernel as KernelState,
    crm: documents.crm as CrmState,
    party: documents.party as PartyState,
    crmDepth: documents['crm-depth'] as CrmDepthState,
    revenueOps: documents['revenue-ops-india'] as RevenueOpsState,
    owner: {
      userId: 'user-avery',
      email: 'souvik@shotlin.com',
      displayName: 'Souvik Das',
    },
  };
}

describe('Bakaloo retail sample reset planner', () => {
  it('recognizes only the full, known generic workspace fingerprint', () => {
    const input = exactGenericDemo();
    const preview = previewBakalooRetailSampleReset(input);

    expect(preview).toMatchObject({
      eligible: true,
      requiredConfirmation: BAKALOO_RETAIL_SAMPLE_RESET_PHRASE,
      fingerprintVersion: 'bakaloo-retail-generic-demo-v1',
      unmatchedNamespaces: [],
    });
    expect(preview.matchedNamespaces).toEqual([
      'kernel',
      'crm',
      'party',
      'crm-depth',
      'revenue-ops-india',
    ]);
    expect(preview.recordsToClear.some(({ module, records }) => module === 'CRM' && records > 0)).toBe(true);
    expect(fingerprintBakalooRetailState(input.crm)).toBe(
      '3653329f2957801610a52976f77946eef686e627382189d9c0894ede13d06221',
    );
  });

  it('fails closed when any relevant demo record differs', () => {
    const input = exactGenericDemo();
    input.crm.opportunities[0]!.title = 'A real customer opportunity';

    const preview = previewBakalooRetailSampleReset(input);

    expect(preview.eligible).toBe(false);
    expect(preview.unmatchedNamespaces).toContain('crm');
    expect(preview.reason).toContain('will not be cleared automatically');
  });

  it('creates clean INR retail documents while preserving the supplied owner identity', () => {
    const input = exactGenericDemo();
    const plan = planBakalooRetailSampleReset(input, '2026-08-03T06:00:00.000Z');

    expect(plan.preview.eligible).toBe(true);
    expect(plan.documents).toBeDefined();
    if (!plan.documents) throw new Error('Expected an eligible reset plan.');

    const { kernel, crm, party, crmDepth, revenueOps } = plan.documents;
    expect(kernel.tenant).toMatchObject({
      name: 'Bakaloo Retail Workspace',
      slug: 'bakaloo-retail',
    });
    expect(kernel.companies[0]).toMatchObject({
      code: 'BAKALOO',
      name: 'Bakaloo Retail',
      baseCurrency: 'INR',
      countryCode: 'IN',
    });
    expect(kernel.branches[0]).toMatchObject({
      code: 'PRIMARY',
      name: 'Primary store',
      timezone: 'Asia/Kolkata',
    });
    expect(kernel.users.find(({ id }) => id === 'user-avery')).toMatchObject({
      email: 'souvik@shotlin.com',
      displayName: 'Souvik Das',
    });

    expect(crm).toMatchObject({
      closedWon: 0,
      closedLost: 0,
      averageCycleDays: 0,
      leads: [],
      opportunities: [],
      activities: [],
    });
    expect(party.accounts).toEqual([]);
    expect(party.contacts).toEqual([]);
    expect(crmDepth.scoringRules).toEqual([]);
    expect(crmDepth.campaigns).toEqual([]);
    expect(revenueOps.profile).toMatchObject({ currency: 'INR', gstRegistered: false });
    expect(revenueOps.products).toEqual([]);
    expect(revenueOps.retailSales).toEqual([]);
    expect(revenueOps.retailCommerceOrders).toEqual([]);

    expect(kernel.revision).toBeGreaterThan(input.kernel.revision);
    expect(crm.revision).toBeGreaterThan(input.crm.revision);
    expect(party.revision).toBeGreaterThan(input.party.revision);
    expect(crmDepth.revision).toBeGreaterThan(input.crmDepth.revision);
    expect(revenueOps.revision).toBeGreaterThan(input.revenueOps.revision);

    // Planning is pure: persisting the plan is a separate, confirmed operation.
    expect(input.crm.opportunities).toHaveLength(10);
    expect(input.party.accounts).toHaveLength(3);
  });
});
