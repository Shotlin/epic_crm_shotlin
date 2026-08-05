import { describe, expect, it } from 'vitest';
import { createBakalooShadowHttpAdapter } from './bakaloo-shadow-http-adapter';
import { collectShadowImportEvidence, type ShadowImportSourcePage } from './shadow-import-source-adapter';

const httpPage = (cursor: string, done: boolean, nextCursor?: string): ShadowImportSourcePage => ({
  cursor: { value: cursor, observedAt: '2026-08-04T09:00:00.000Z' },
  observedAt: '2026-08-04T09:00:00.000Z',
  records: [{ entity: 'customer', externalId: cursor, epicBosId: `party-${cursor}`, payload: { name: cursor } }],
  declaredCounts: { customer: 2 },
  nextCursor: nextCursor ? { value: nextCursor, observedAt: '2026-08-04T09:00:00.000Z' } : undefined,
  done,
});

describe('Bakaloo shadow HTTP adapter', () => {
  it('only issues same-origin GET requests and feeds the bounded collector', async () => {
    const requests: Array<{ method: string; url: string; headers: Readonly<Record<string, string>> }> = [];
    const adapter = createBakalooShadowHttpAdapter({
      baseUrl: 'https://bakaloo.example.in',
      pagePath: '/v1/shadow/export',
      credentialRevision: 4,
      resolveCredentialRevision: async () => 4,
      requester: async (request) => {
        requests.push(request);
        const cursor = new URL(request.url).searchParams.get('cursor');
        return { status: 200, contentType: 'application/json; charset=utf-8', body: cursor ? httpPage('cursor-2', true) : httpPage('cursor-1', false, 'cursor-2') };
      },
    });
    const result = await collectShadowImportEvidence(adapter, { batchId: 'http-batch-1', observedAt: '2026-08-04T09:00:00.000Z' });
    expect(result.recordsFetched).toBe(2);
    expect(result.evidence.credentialRevision).toBe(4);
    expect(result.plan.batch.credentialRevision).toBe(4);
    expect(requests.map(({ method, url }) => [method, url])).toEqual([
      ['GET', 'https://bakaloo.example.in/v1/shadow/export'],
      ['GET', 'https://bakaloo.example.in/v1/shadow/export?cursor=cursor-2'],
    ]);
    expect(requests[0]?.headers).toEqual({ accept: 'application/json' });
  });

  it('rejects unsafe URLs, non-JSON responses, status errors, and oversized responses', async () => {
    expect(() => createBakalooShadowHttpAdapter({ baseUrl: 'http://bakaloo.example.in', pagePath: '/v1/export', requester: async () => ({ status: 200, body: {} }) })).toThrow(/HTTPS/i);
    expect(() => createBakalooShadowHttpAdapter({ baseUrl: 'https://bakaloo.example.in', pagePath: '/v1/../export', requester: async () => ({ status: 200, body: {} }) })).toThrow(/safe same-origin/i);
    const statusAdapter = createBakalooShadowHttpAdapter({ baseUrl: 'https://bakaloo.example.in', pagePath: '/v1/export', requester: async () => ({ status: 401, body: {} }) });
    await expect(statusAdapter.pullPage({})).rejects.toThrow(/status 401/i);
    const contentAdapter = createBakalooShadowHttpAdapter({ baseUrl: 'https://bakaloo.example.in', pagePath: '/v1/export', requester: async () => ({ status: 200, contentType: 'text/html', body: {} }) });
    await expect(contentAdapter.pullPage({})).rejects.toThrow(/application\/json/i);
    const largeAdapter = createBakalooShadowHttpAdapter({ baseUrl: 'https://bakaloo.example.in', pagePath: '/v1/export', maxResponseBytes: 1_024, requester: async () => ({ status: 200, byteLength: 2_000, body: {} }) });
    await expect(largeAdapter.pullPage({})).rejects.toThrow(/safety limit/i);
  });

  it('stops when the protected credential revision rotates between page requests', async () => {
    let revision = 7;
    let calls = 0;
    const adapter = createBakalooShadowHttpAdapter({
      baseUrl: 'https://bakaloo.example.in', pagePath: '/v1/export', credentialRevision: 7,
      resolveCredentialRevision: () => revision,
      requester: async () => { calls += 1; revision = 8; return { status: 200, body: httpPage('cursor-1', false, 'cursor-2') }; },
    });
    await expect(collectShadowImportEvidence(adapter, { batchId: 'rotation-1', observedAt: '2026-08-04T09:00:00.000Z' })).rejects.toThrow(/rotated/i);
    expect(calls).toBe(1);
  });
});
