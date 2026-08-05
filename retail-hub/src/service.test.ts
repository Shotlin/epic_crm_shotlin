import { describe, expect, it } from 'vitest';

import { buildShadowImportPlan, checksumShadowImportEvidence } from './shadow-import';
import { createRetailHubService } from './service';

describe('Retail Hub read-only HTTP boundary', () => {
  it('publishes only verified shadow-import evidence through GET routes', () => {
    const evidence = {
      batchId: 'bakaloo-2026-08-03-001',
      source: 'bakaloo' as const,
      observedAt: '2026-08-03T10:15:00.000Z',
      cursor: { value: 'orders:0000042', observedAt: '2026-08-03T10:15:00.000Z' },
      declaredCounts: { customer: 1 },
      records: [{
        entity: 'customer' as const,
        externalId: 'customer_42',
        epicBosId: 'party-42',
        payload: { phone: '+919999999999' },
      }],
    };
    const plan = buildShadowImportPlan({
      ...evidence,
      declaredChecksum: checksumShadowImportEvidence(evidence),
    });
    const service = createRetailHubService({ shadowImportPlans: [plan] });

    const health = service.handle({ method: 'GET', url: '/health' });
    const batches = service.handle({ method: 'GET', url: '/v1/shadow-imports/batches' });

    expect(health).toMatchObject({
      status: 200,
      body: {
        mode: 'read-only-shadow-import',
        writeBackAllowed: false,
        liveSourceConnected: false,
      },
    });
    expect(batches).toMatchObject({
      status: 200,
      body: {
        batches: [expect.objectContaining({ id: 'bakaloo-2026-08-03-001' })],
      },
    });
  });

  it('rejects every write verb and leaves the published evidence unchanged', () => {
    const service = createRetailHubService({
      shadowImportPlans: [verifiedCustomerPlan()],
    });
    const before = service.handle({ method: 'GET', url: '/v1/shadow-imports/batches' });

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(service.handle({
        method,
        url: '/v1/shadow-imports/batches/bakaloo-2026-08-03-001',
      })).toMatchObject({
        status: 405,
        headers: { allow: 'GET, HEAD, OPTIONS' },
        body: { error: 'read_only_boundary' },
      });
    }

    expect(service.handle({ method: 'GET', url: '/v1/shadow-imports/batches' })).toEqual(before);
  });

  it('exposes mappings, cursor, conflicts, and reconciliation as separate review resources', () => {
    const service = createRetailHubService({
      shadowImportPlans: [verifiedCustomerPlan()],
    });

    expect(service.handle({
      method: 'GET',
      url: '/v1/shadow-imports/external-id-maps?batchId=bakaloo-2026-08-03-001&entity=customer',
    })).toMatchObject({
      status: 200,
      body: {
        externalIdMaps: [expect.objectContaining({ externalId: 'customer_42', epicBosId: 'party-42' })],
      },
    });
    expect(service.handle({
      method: 'GET',
      url: '/v1/shadow-imports/cursors?batchId=bakaloo-2026-08-03-001',
    })).toMatchObject({
      status: 200,
      body: { cursors: [expect.objectContaining({ value: 'orders:0000042' })] },
    });
    expect(service.handle({
      method: 'GET',
      url: '/v1/shadow-imports/conflicts?batchId=bakaloo-2026-08-03-001',
    })).toEqual(expect.objectContaining({ status: 200, body: { conflicts: [] } }));
    expect(service.handle({
      method: 'GET',
      url: '/v1/shadow-imports/reconciliation?batchId=bakaloo-2026-08-03-001',
    })).toMatchObject({
      status: 200,
      body: { reconciliation: [expect.objectContaining({ status: 'reconciled' })] },
    });
  });
});

function verifiedCustomerPlan() {
  const evidence = {
    batchId: 'bakaloo-2026-08-03-001',
    source: 'bakaloo' as const,
    observedAt: '2026-08-03T10:15:00.000Z',
    cursor: { value: 'orders:0000042', observedAt: '2026-08-03T10:15:00.000Z' },
    declaredCounts: { customer: 1 },
    records: [{
      entity: 'customer' as const,
      externalId: 'customer_42',
      epicBosId: 'party-42',
      payload: { phone: '+919999999999' },
    }],
  };
  return buildShadowImportPlan({
    ...evidence,
    declaredChecksum: checksumShadowImportEvidence(evidence),
  });
}
