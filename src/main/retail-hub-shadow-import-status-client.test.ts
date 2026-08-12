import { describe, expect, it } from 'vitest';
import { buildPullReceiptsUrl, buildSourceStatusUrl, fetchRetailHubShadowImportPullReceipts, fetchRetailHubShadowImportSourceStatus } from './retail-hub-shadow-import-status-client';

describe('Retail Hub shadow-import status clients', () => {
  it('builds credential-free source and receipt URLs', () => {
    expect(buildSourceStatusUrl({ baseUrl: 'https://hub.example/ops/' })).toBe('https://hub.example/ops/v1/shadow-imports/source-status');
    expect(buildPullReceiptsUrl({ baseUrl: 'https://hub.example/ops', batchId: 'batch-1' })).toBe('https://hub.example/ops/v1/shadow-imports/pull-receipts?batchId=batch-1');
    expect(() => buildSourceStatusUrl({ baseUrl: 'http://hub.example' })).toThrow(/HTTPS/);
    expect(() => buildPullReceiptsUrl({ baseUrl: 'https://user:secret@hub.example' })).toThrow(/credential-free/);
  });

  it('projects a safe source status without credential material', async () => {
    const report = await fetchRetailHubShadowImportSourceStatus({ baseUrl: 'https://hub.example' }, { request: async () => ({ status: 200, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify({ sourceStatus: { status: 'reachable', credentialRevision: 8, checkedAt: '2026-08-06T12:00:00.000Z', message: 'Connector probe passed', password: 'never-return' }, writeBackAllowed: false })) }) });
    expect(report.sourceStatus).toEqual({ status: 'reachable', credentialRevision: 8, checkedAt: '2026-08-06T12:00:00.000Z', message: 'Connector probe passed' });
    expect(report.writeBackAllowed).toBe(false);
  });

  it('projects receipts without exposing scope and rejects write-back', async () => {
    const report = await fetchRetailHubShadowImportPullReceipts({ baseUrl: 'https://hub.example', batchId: 'batch-1' }, { request: async () => ({ status: 200, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify({ receipts: [{ id: 'shadow-pull:batch-1:aaaaaaaaaaaaaaaa', source: 'bakaloo', batchId: 'batch-1', scope: { tenantId: 'secret-tenant', companyId: 'company-1', branchId: 'branch-1' }, observedAt: '2026-08-06T12:00:00.000Z', registeredAt: '2026-08-06T12:01:00.000Z', pagesFetched: 2, recordsFetched: 4, planChecksum: 'a'.repeat(64), writeBackAllowed: false, version: 1 }], writeBackAllowed: false })) }) });
    expect(Object.prototype.hasOwnProperty.call(report.receipts[0], 'scope')).toBe(false);
    expect(report.receipts[0]?.recordsFetched).toBe(4);
    await expect(fetchRetailHubShadowImportPullReceipts({ baseUrl: 'https://hub.example', batchId: 'batch-1' }, { request: async () => ({ status: 200, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify({ receipts: [], writeBackAllowed: true })) }) })).rejects.toThrow(/read-only/);
  });
});
