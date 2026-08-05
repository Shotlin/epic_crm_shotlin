import { describe, expect, it } from 'vitest';
import { buildIntegrationReadiness } from './integration-readiness';
import { createInitialRevenueOpsState } from './revenue-ops';
import type { ProviderConnector } from '../shared/provider-contracts';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

const connector = (scope: RevenueOpsState['scope']): ProviderConnector => ({ scope, id: 'connector-1', code: 'BANK-1', name: 'Bank connector', providerLegalName: 'Example Bank', domain: 'banking', environment: 'sandbox', baseUrl: 'https://bank.example', statusPathTemplate: '/status/{reference}', capabilities: ['payment-release', 'payment-status-pull', 'statement-pull'], specificationVersion: '2026.07', credentialStatus: 'configured', credentialFingerprint: 'fingerprint', conformanceStatus: 'sandbox-verified', active: true, createdBy: 'admin', createdAt: '2026-07-01T00:00:00.000Z', version: 1 });

describe('integration readiness', () => {
  it('requires conformance, credentials and reconciliation cleanliness before ready', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, providerConnectors: [connector(state.scope)] };
    expect(buildIntegrationReadiness(state).assessments[0]).toMatchObject({ readiness: 'blocked', nextAction: 'complete-conformance', conformanceReady: true });
    state = { ...state, providerConformanceCases: [{ id: 'case-1', connectorId: 'connector-1', suiteName: 'Bank sandbox', suiteVersion: '1', scenario: 'Payment status pull', environment: 'sandbox' as const, result: 'passed' as const, evidenceReference: 'EVID-1', resultChecksum: 'a'.repeat(64), preparedBy: 'maker', preparedAt: '2026-07-02T00:00:00.000Z', assessedBy: 'independent-reviewer', assessedAt: '2026-07-03T00:00:00.000Z', scope: state.scope, version: 1 }] };
    expect(buildIntegrationReadiness(state).assessments[0]).toMatchObject({ readiness: 'ready', nextAction: 'ready', pendingHandoffs: 0, reconciliationDrift: 0 });
    state = { ...state, providerSubmissions: [{ id: 'submission-1', number: 'SUB-1', connectorId: 'connector-1', domain: 'banking' as const, capability: 'payment-release' as const, sourceKind: 'payment-proposal' as const, sourceIds: ['payment-1'], payloadChecksum: 'b'.repeat(64), status: 'handed-off' as const, preparedBy: 'maker', preparedAt: '2026-07-03T00:00:00.000Z', scope: state.scope, version: 1 }] };
    expect(buildIntegrationReadiness(state).assessments[0]).toMatchObject({ readiness: 'degraded', nextAction: 'await-response', pendingHandoffs: 1 });
  });

  it('excludes a connector from another company or branch', () => {
    const state = createInitialRevenueOpsState();
    expect(buildIntegrationReadiness({ ...state, providerConnectors: [connector({ companyId: 'other-company', branchId: 'other-branch' })] })).toMatchObject({ total: 0, assessments: [] });
  });

  it('invalidates passed evidence when the connector credential revision rotates', () => {
    const state = createInitialRevenueOpsState();
    const rotated = { ...connector(state.scope), credentialRevision: 2 };
    const assessment = buildIntegrationReadiness({
      ...state,
      providerConnectors: [rotated],
      providerConformanceCases: [{ id: 'case-old', connectorId: rotated.id, suiteName: 'Bank sandbox', suiteVersion: '1', scenario: 'Statement pull', environment: 'sandbox', credentialRevision: 1, result: 'passed', evidenceReference: 'OLD-EVIDENCE', resultChecksum: 'a'.repeat(64), preparedBy: 'maker', preparedAt: '2026-07-02T00:00:00.000Z', assessedBy: 'reviewer', assessedAt: '2026-07-03T00:00:00.000Z', scope: state.scope, version: 1 }],
    }).assessments[0]!;
    expect(assessment).toMatchObject({ readiness: 'blocked', staleCredentialCases: 1, credentialRevision: 2, passedConformanceCases: 0, nextAction: 'complete-conformance' });
    expect(assessment.blockers.join(' ')).toMatch(/older credential revision/i);
  });

  it('blocks expired and revoked credentials even when old conformance evidence is present', () => {
    const state = createInitialRevenueOpsState();
    const base = connector(state.scope);
    const currentCase = { id: 'case-current', connectorId: base.id, suiteName: 'Bank sandbox', suiteVersion: '1', scenario: 'Statement pull', environment: 'sandbox' as const, credentialRevision: 0, result: 'passed' as const, evidenceReference: 'CURRENT-EVIDENCE', resultChecksum: 'a'.repeat(64), preparedBy: 'maker', preparedAt: '2026-07-02T00:00:00.000Z', assessedBy: 'reviewer', assessedAt: '2026-07-03T00:00:00.000Z', scope: state.scope, version: 1 };
    const expired = buildIntegrationReadiness({ ...state, providerConnectors: [{ ...base, credentialExpiresAt: '2026-07-31T00:00:00.000Z' }], providerConformanceCases: [currentCase] }, '2026-08-01T00:00:00.000Z').assessments[0]!;
    expect(expired).toMatchObject({ readiness: 'blocked', credentialState: 'expired', credentialReady: false, nextAction: 'configure-credentials' });
    expect(expired.blockers.join(' ')).toMatch(/expired/i);
    const revoked = buildIntegrationReadiness({ ...state, providerConnectors: [{ ...base, credentialRevokedAt: '2026-07-31T00:00:00.000Z' }], providerConformanceCases: [currentCase] }, '2026-08-01T00:00:00.000Z').assessments[0]!;
    expect(revoked).toMatchObject({ readiness: 'blocked', credentialState: 'revoked', credentialReady: false, nextAction: 'configure-credentials' });
    expect(revoked.blockers.join(' ')).toMatch(/revoked/i);
  });
});
