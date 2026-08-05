import { describe, expect, it } from 'vitest';
import { pullAndRegisterBakalooShadowImportFromVault } from './bakaloo-shadow-vault-pull-runtime';
import type { ShadowImportPlan } from './shadow-import';
import type { ShadowImportPostgresRepository } from './shadow-import-postgres-repository';

const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

describe('Bakaloo vault-backed durable shadow pull runtime', () => {
  it('composes vault credentials, GET transport, checksum-bound evidence, and immutable registration', async () => {
    const stored = new Map<string, ShadowImportPlan>();
    const requests: Array<{ method: string; headers: Readonly<Record<string, string>> }> = [];
    const repository: ShadowImportPostgresRepository = {
      listPlans: async () => [...stored.values()],
      getPlan: async (_scope, batchId) => stored.get(batchId),
      registerPlan: async (_scope, plan) => { if (stored.has(plan.batch.id)) throw new Error('duplicate'); stored.set(plan.batch.id, structuredClone(plan)); },
      replacePlan: async (_scope, plan) => { stored.set(plan.batch.id, structuredClone(plan)); },
    };
    const result = await pullAndRegisterBakalooShadowImportFromVault({
      source: {
        scope, credentialRef: 'bakaloo-prod-shadow', baseUrl: 'https://bakaloo.example.in', pagePath: '/v1/export',
        vault: { resolve: async () => ({ revision: 12, headers: { authorization: 'Bearer server-only' } }) },
        transport: async (request) => {
          requests.push({ method: request.method, headers: request.headers });
          return { status: 200, contentType: 'application/json', body: { cursor: { value: 'cursor-1', observedAt: '2026-08-04T09:00:00Z' }, observedAt: '2026-08-04T09:00:00Z', records: [{ entity: 'customer', externalId: 'customer-1', epicBosId: 'party-1', payload: { name: 'Asha' } }], declaredCounts: { customer: 1 }, done: true } };
        },
      },
      repository,
      input: { batchId: 'vault-runtime-1', observedAt: '2026-08-04T09:00:00Z' },
      registeredAt: '2026-08-04T09:01:00Z',
    });
    expect(result.scope).toEqual(scope);
    expect(result.plan.batch.credentialRevision).toBe(12);
    expect(result.registeredAt).toBe('2026-08-04T09:01:00.000Z');
    expect(stored.get('vault-runtime-1')?.batch.status).toBe('ready-for-review');
    expect(requests).toEqual([{ method: 'GET', headers: { accept: 'application/json', authorization: 'Bearer server-only' } }]);
  });

  it('refuses a duplicate before the vault transport is contacted', async () => {
    let vaultCalls = 0;
    const existing = { batch: { id: 'already-there' } } as ShadowImportPlan;
    const repository: ShadowImportPostgresRepository = { listPlans: async () => [existing], getPlan: async () => existing, registerPlan: async () => { throw new Error('must not register'); }, replacePlan: async () => undefined };
    await expect(pullAndRegisterBakalooShadowImportFromVault({
      source: {
        scope, credentialRef: 'bakaloo-prod-shadow', baseUrl: 'https://bakaloo.example.in', pagePath: '/v1/export',
        vault: { resolve: async () => { vaultCalls += 1; return { revision: 1, headers: { authorization: 'Bearer server-only' } }; } },
        transport: async () => ({ status: 200, body: {} }),
      }, repository, input: { batchId: 'already-there', observedAt: '2026-08-04T09:00:00Z' },
    })).rejects.toThrow(/already exists/i);
    expect(vaultCalls).toBe(0);
  });
});
