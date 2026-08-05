import { describe, expect, it } from 'vitest';
import { buildAssessmentUrl, fetchRetailHubCutoverAssessment } from './retail-hub-assessment-client';

const sha = (value: string) => value.repeat(64);
const assessment = {
  source: 'bakaloo' as const,
  scope: { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' },
  capability: 'orders' as const,
  status: 'ready-for-parallel-run' as const,
  blockers: [],
  requiredEntities: ['order'],
  planId: 'batch-2026-08-04',
  planChecksum: sha('a'),
  remoteRecordCount: 4,
  localRecordCount: 4,
  differenceCount: 0,
  remoteChecksum: sha('a'),
  localChecksum: sha('b'),
  reconciliationChecksum: sha('c'),
  approvalDecisionId: 'approval-1',
  credentialRevision: 7,
  rollbackReference: 'rollback-1',
  writeBackAllowed: false as const,
};

function response(value: unknown, status = 200, contentType = 'application/json'): { status: number; contentType: string; body: Uint8Array } {
  return { status, contentType, body: new TextEncoder().encode(JSON.stringify(value)) };
}

describe('Retail Hub assessment GET transport', () => {
  it('builds a credential-free scoped GET URL and validates the wrapped assessment', async () => {
    let requested = '';
    const result = await fetchRetailHubCutoverAssessment({ baseUrl: 'https://hub.example.in/api/', batchId: 'batch-2026-08-04', capability: 'orders' }, {
      request: async (url) => { requested = url; return response({ assessment }); },
    });
    expect(requested).toBe('https://hub.example.in/api/v1/shadow-imports/cutover?batchId=batch-2026-08-04&capability=orders');
    expect(result).toMatchObject({ planId: 'batch-2026-08-04', writeBackAllowed: false, credentialRevision: 7 });
  });

  it('fails closed for credentials, non-JSON/error responses, and oversized payloads', async () => {
    expect(() => buildAssessmentUrl({ baseUrl: 'http://hub.example.in', batchId: 'batch-1', capability: 'orders' })).toThrow(/HTTPS/i);
    expect(() => buildAssessmentUrl({ baseUrl: 'https://user:secret@hub.example.in', batchId: 'batch-1', capability: 'orders' })).toThrow(/credential-free/i);
    await expect(fetchRetailHubCutoverAssessment({ baseUrl: 'https://hub.example.in', batchId: 'batch-1', capability: 'orders' }, { request: async () => response({}, 403) })).rejects.toThrow(/HTTP 403/i);
    await expect(fetchRetailHubCutoverAssessment({ baseUrl: 'https://hub.example.in', batchId: 'batch-1', capability: 'orders' }, { request: async () => response({}, 200, 'text/html') })).rejects.toThrow(/application\/json/i);
    await expect(fetchRetailHubCutoverAssessment({ baseUrl: 'https://hub.example.in', batchId: 'batch-1', capability: 'orders' }, { maxResponseBytes: 1_024, request: async () => ({ status: 200, contentType: 'application/json', body: new Uint8Array(2_000) }) })).rejects.toThrow(/safety limit/i);
  });

  it('rejects a response that tries to enable write-back or has invalid checksums', async () => {
    await expect(fetchRetailHubCutoverAssessment({ baseUrl: 'https://hub.example.in', batchId: 'batch-1', capability: 'orders' }, { request: async () => response({ assessment: { ...assessment, writeBackAllowed: true } }) })).rejects.toThrow(/read-only/i);
    await expect(fetchRetailHubCutoverAssessment({ baseUrl: 'https://hub.example.in', batchId: 'batch-1', capability: 'orders' }, { request: async () => response({ assessment: { ...assessment, remoteChecksum: 'not-a-checksum' } }) })).rejects.toThrow(/SHA-256/i);
  });
});
