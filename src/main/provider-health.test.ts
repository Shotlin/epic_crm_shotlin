import { describe, expect, it } from 'vitest';
import type { ProviderConnector } from '../shared/provider-contracts';
import { summarizeProviderHealth } from './provider-health';

const connector: ProviderConnector = { id: 'connector-1', code: 'BANK-1', name: 'Bank', providerLegalName: 'Bank Limited', domain: 'banking', environment: 'sandbox', baseUrl: 'https://bank.example', statusPathTemplate: '/status/{reference}', capabilities: ['payment-status-pull'], specificationVersion: '2026.07', credentialStatus: 'configured', conformanceStatus: 'sandbox-verified', active: true, createdBy: 'owner', createdAt: '2026-07-17T00:00:00.000Z', version: 1 };

describe('provider health evidence', () => {
  it('reports a fully evidenced connector as healthy', () => {
    expect(summarizeProviderHealth({ connector, cases: [{ id: 'case-1', connectorId: connector.id, suiteName: 'bank', suiteVersion: '1', scenario: 'status', environment: 'sandbox', result: 'passed', preparedBy: 'maker', preparedAt: connector.createdAt, version: 1 }], submissions: [], reconciliations: [] }).status).toBe('healthy');
  });

  it('reports missing credentials and unreconciled handoffs as blocked/degraded evidence', () => {
    const result = summarizeProviderHealth({ connector: { ...connector, credentialStatus: 'missing' }, cases: [], submissions: [{ id: 'submission-1', number: 'P-1', connectorId: connector.id, domain: 'banking', capability: 'payment-status-pull', sourceKind: 'payment-proposal', sourceIds: ['payment-1'], payloadChecksum: 'a'.repeat(64), status: 'handed-off', preparedBy: 'maker', preparedAt: connector.createdAt, version: 1 }], reconciliations: [] });
    expect(result.status).toBe('blocked');
    expect(result.pendingHandoffs).toBe(1);
    expect(result.reasons).toEqual(expect.arrayContaining(['Credentials are not sealed.']));
  });
});
