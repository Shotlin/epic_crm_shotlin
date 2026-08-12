import { describe, expect, it } from 'vitest';
import { buildShadowImportPreflightUrl, fetchRetailHubShadowImportPreflight } from './retail-hub-shadow-import-client';

describe('Retail Hub shadow-import preflight client', () => {
  it('builds a credential-free HTTPS URL', () => {
    expect(buildShadowImportPreflightUrl({ baseUrl: 'https://hub.example/ops/', batchId: 'batch-2026-08-06' })).toBe('https://hub.example/ops/v1/shadow-imports/preflight?batchId=batch-2026-08-06');
    expect(() => buildShadowImportPreflightUrl({ baseUrl: 'http://hub.example', batchId: 'batch-1' })).toThrow(/HTTPS/);
    expect(() => buildShadowImportPreflightUrl({ baseUrl: 'https://user:secret@hub.example', batchId: 'batch-1' })).toThrow(/credential-free/);
  });

  it('accepts only a value-free read-only preflight report', async () => {
    const report = await fetchRetailHubShadowImportPreflight({ baseUrl: 'https://hub.example', batchId: 'batch-1' }, {
      request: async (url) => {
        expect(url).toBe('https://hub.example/v1/shadow-imports/preflight?batchId=batch-1');
        return { status: 200, contentType: 'application/json; charset=utf-8', body: new TextEncoder().encode(JSON.stringify({ preflight: { status: 'hold', writeBackAllowed: false, checks: [{ id: 'deployment-readiness', status: 'hold', summary: 'Deployment is not configured.' }], blockers: ['deployment-readiness'] } })) };
      },
    });
    expect(report.status).toBe('hold');
    expect(report.writeBackAllowed).toBe(false);
    expect(report.blockers).toEqual(['deployment-readiness']);
  });

  it('rejects a response that attempts to enable write-back', async () => {
    await expect(fetchRetailHubShadowImportPreflight({ baseUrl: 'https://hub.example', batchId: 'batch-1' }, {
      request: async () => ({ status: 200, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify({ preflight: { status: 'ready-for-review', writeBackAllowed: true, checks: [], blockers: [] } })) }),
    })).rejects.toThrow(/write-back/);
  });
});
