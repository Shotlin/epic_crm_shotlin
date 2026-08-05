import { describe, expect, it } from 'vitest';
import { collectShadowImportEvidence, type ShadowImportSourcePage } from './shadow-import-source-adapter';
import { createBakalooShadowHttpAdapterFromVault } from './bakaloo-shadow-credential-vault';

const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };
const page = (cursor: string, done: boolean, nextCursor?: string): ShadowImportSourcePage => ({
  cursor: { value: cursor, observedAt: '2026-08-04T09:00:00.000Z' }, observedAt: '2026-08-04T09:00:00.000Z',
  records: [{ entity: 'customer', externalId: cursor, epicBosId: `party-${cursor}`, payload: { name: cursor } }],
  declaredCounts: { customer: 2 }, nextCursor: nextCursor ? { value: nextCursor, observedAt: '2026-08-04T09:00:00.000Z' } : undefined, done,
});

describe('server-owned Bakaloo shadow credential vault adapter', () => {
  it('injects vault headers only in the transport and binds the snapshot to the vault revision', async () => {
    const requests: Array<{ headers: Readonly<Record<string, string>> }> = [];
    const adapter = await createBakalooShadowHttpAdapterFromVault({
      scope, credentialRef: 'bakaloo-prod-shadow', baseUrl: 'https://bakaloo.example.in', pagePath: '/v1/export',
      vault: { resolve: async () => ({ revision: 11, headers: { authorization: 'Bearer server-only-secret' } }) },
      transport: async (request) => { requests.push(request); const cursor = new URL(request.url).searchParams.get('cursor'); return { status: 200, contentType: 'application/json', body: cursor ? page('cursor-2', true) : page('cursor-1', false, 'cursor-2') }; },
    });
    const result = await collectShadowImportEvidence(adapter, { batchId: 'vault-batch-1', observedAt: '2026-08-04T09:00:00.000Z' });
    expect(result.evidence.credentialRevision).toBe(11);
    expect(requests[0]?.headers).toEqual({ accept: 'application/json', authorization: 'Bearer server-only-secret' });
    expect(JSON.stringify(result)).not.toContain('bakaloo-prod-shadow');
    expect(JSON.stringify(result)).not.toContain('server-only-secret');
  });

  it('fails closed when the vault rotates between the revision check and request', async () => {
    let revision = 4;
    let vaultReads = 0;
    let calls = 0;
    const adapter = await createBakalooShadowHttpAdapterFromVault({
      scope, credentialRef: 'bakaloo-prod-shadow', baseUrl: 'https://bakaloo.example.in', pagePath: '/v1/export',
      vault: { resolve: async () => { vaultReads += 1; if (vaultReads > 1) revision = 5; return { revision, headers: { authorization: `Bearer-${revision}` } }; } },
      transport: async () => { calls += 1; return { status: 200, body: page('cursor-1', true) }; },
    });
    await expect(adapter.pullPage({})).rejects.toThrow(/rotated/i);
    expect(calls).toBe(0);
  });

  it('rejects missing or malformed vault material before any request', async () => {
    await expect(createBakalooShadowHttpAdapterFromVault({
      scope, credentialRef: 'bakaloo-prod-shadow', baseUrl: 'https://bakaloo.example.in', pagePath: '/v1/export',
      vault: { resolve: async () => undefined }, transport: async () => ({ status: 200, body: page('cursor-1', true) }),
    })).rejects.toThrow(/not configured/i);
    await expect(createBakalooShadowHttpAdapterFromVault({
      scope, credentialRef: 'bakaloo-prod-shadow', baseUrl: 'https://bakaloo.example.in', pagePath: '/v1/export',
      vault: { resolve: async () => ({ revision: 1, headers: {} }) }, transport: async () => ({ status: 200, body: page('cursor-1', true) }),
    })).rejects.toThrow(/no credential headers/i);
  });
});
