import { describe, expect, it } from 'vitest';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { RetailReportDeliveryAttempt, RetailReportDeliveryPlan } from '../shared/report-delivery-contracts';
import {
  applyProviderReconciliation,
  approveProviderConnector,
  configureProviderConnector,
  createProviderConformanceCase,
  handOffProviderSubmission,
  markProviderCredentials,
  markProviderCredentialsWithExpiry,
  planProviderConformancePack,
  prepareProviderSubmission,
  revokeProviderCredentials,
  recordProviderConformanceResult,
  recordProviderSubmissionResponse,
} from './provider-control';
import { createInitialRevenueOpsState } from './revenue-ops';

function controlled(): RevenueOpsState {
  const state = createInitialRevenueOpsState();
  state.paymentProposals = [{
    id: 'payment-1', number: 'PAY/26-27/00001', supplierInvoiceId: 'invoice-1', supplierId: 'supplier-1', bankAccountId: 'bank-1', paymentDate: '2026-07-20', amount: 125000, paymentReference: 'PO-1', purpose: 'Approved supplier settlement', status: 'released', requestedBy: 'maker', requestedAt: '2026-07-18T09:00:00.000Z', approvedBy: 'checker', approvedAt: '2026-07-18T10:00:00.000Z', releasedBy: 'releaser', releasedAt: '2026-07-18T11:00:00.000Z', bankReleaseReference: 'BANK-RELEASE-1', version: 3,
  }];
  return state;
}

describe('provider connector control plane', () => {
  it('requires sealed credentials, independent conformance and a separate releaser before external evidence can close a banking handoff', () => {
    let state = configureProviderConnector(controlled(), { code: 'BANK-ONE', name: 'Primary payment pack', providerLegalName: 'Example Bank Limited', domain: 'banking', environment: 'sandbox', baseUrl: 'https://bank.example.in', statusPathTemplate: '/v1/status/{reference}', capabilities: ['payment-release', 'payment-status-pull'], specificationVersion: 'sandbox-2026.07' }, 'maker', '11111111-1111-4111-8111-111111111111', '2026-07-18T12:00:00.000Z');
    expect(() => approveProviderConnector(state, { id: '11111111-1111-4111-8111-111111111111', expectedVersion: 1 }, 'approver')).toThrow('credentials');
    state = markProviderCredentials(state, '11111111-1111-4111-8111-111111111111', 'f00dcafe11223344');
    state = createProviderConformanceCase(state, { connectorId: '11111111-1111-4111-8111-111111111111', capability: 'payment-release', suiteName: 'Bank sandbox release', suiteVersion: '2026.07', scenario: 'Idempotency and payment-release evidence' }, 'maker', '22222222-2222-4222-8222-222222222222', '2026-07-18T12:05:00.000Z');
    expect(() => recordProviderConformanceResult(state, { id: '22222222-2222-4222-8222-222222222222', result: 'passed', evidenceReference: 'EVIDENCE-SELF', resultChecksum: 'a'.repeat(64), expectedVersion: 1 }, 'maker')).toThrow('maker');
    state = recordProviderConformanceResult(state, { id: '22222222-2222-4222-8222-222222222222', result: 'passed', evidenceReference: 'EVIDENCE-BANK-001', resultChecksum: 'a'.repeat(64), expectedVersion: 1 }, 'assessor', '2026-07-18T12:10:00.000Z');
    state = createProviderConformanceCase(state, { connectorId: '11111111-1111-4111-8111-111111111111', capability: 'payment-status-pull', suiteName: 'Bank sandbox release', suiteVersion: '2026.07', scenario: 'Status-pull evidence' }, 'maker', '22222222-2222-4222-8222-222222222223', '2026-07-18T12:11:00.000Z');
    state = recordProviderConformanceResult(state, { id: '22222222-2222-4222-8222-222222222223', result: 'passed', evidenceReference: 'EVIDENCE-BANK-STATUS-001', resultChecksum: 'b'.repeat(64), expectedVersion: 1 }, 'assessor', '2026-07-18T12:12:00.000Z');
    state = approveProviderConnector(state, { id: '11111111-1111-4111-8111-111111111111', expectedVersion: 2 }, 'approver', '2026-07-18T12:15:00.000Z');
    state = prepareProviderSubmission(state, { connectorId: '11111111-1111-4111-8111-111111111111', capability: 'payment-release', sourceIds: ['payment-1'] }, 'maker', '33333333-3333-4333-8333-333333333333', '2026-07-18T12:20:00.000Z');
    expect(() => handOffProviderSubmission(state, { id: '33333333-3333-4333-8333-333333333333', requestReference: 'PACK-SELF', expectedVersion: 1 }, 'maker')).toThrow('independent operator');
    state = handOffProviderSubmission(state, { id: '33333333-3333-4333-8333-333333333333', requestReference: 'PACK-BANK-001', expectedVersion: 1 }, 'releaser', '2026-07-18T12:25:00.000Z');
    expect(() => recordProviderSubmissionResponse(state, { id: '33333333-3333-4333-8333-333333333333', outcome: 'acknowledged', externalReference: 'BANK-ACK-INVALID', responseChecksum: 'bad', expectedVersion: 2 })).toThrow('checksum');
    expect(() => recordProviderSubmissionResponse(state, { id: '33333333-3333-4333-8333-333333333333', outcome: 'acknowledged', externalReference: 'BANK-ACK-SELF', responseChecksum: 'b'.repeat(64), expectedVersion: 2 }, '2026-07-18T12:29:00.000Z', 'releaser')).toThrow('independent');
    state = recordProviderSubmissionResponse(state, { id: '33333333-3333-4333-8333-333333333333', outcome: 'acknowledged', externalReference: 'BANK-ACK-001', responseChecksum: 'b'.repeat(64), expectedVersion: 2 }, '2026-07-18T12:30:00.000Z');
    expect(state.providerConnectors[0]).toMatchObject({ conformanceStatus: 'sandbox-verified', credentialStatus: 'configured', approvedBy: 'approver' });
    expect(state.providerSubmissions[0]).toMatchObject({ status: 'acknowledged', handedOffBy: 'releaser', externalReference: 'BANK-ACK-001' });
  });

  it('treats a pull response as authoritative and retains drift as reconciliation evidence', () => {
    let state = controlled();
    state = configureProviderConnector(state, { code: 'BANK-TWO', name: 'Reconciliation pack', providerLegalName: 'Example Bank Limited', domain: 'banking', environment: 'sandbox', baseUrl: 'https://bank.example.in', statusPathTemplate: '/v1/status/{reference}', capabilities: ['payment-release', 'payment-status-pull'], specificationVersion: 'sandbox-2026.07' }, 'maker', '44444444-4444-4444-8444-444444444444', '2026-07-18T12:00:00.000Z');
    state = markProviderCredentials(state, '44444444-4444-4444-8444-444444444444', 'aabbccddeeff0011');
    state = createProviderConformanceCase(state, { connectorId: '44444444-4444-4444-8444-444444444444', capability: 'payment-release', suiteName: 'Bank sandbox release', suiteVersion: '2026.07', scenario: 'Response normalization evidence' }, 'maker', '55555555-5555-4555-8555-555555555555');
    state = recordProviderConformanceResult(state, { id: '55555555-5555-4555-8555-555555555555', result: 'passed', evidenceReference: 'EVIDENCE-BANK-002', resultChecksum: 'c'.repeat(64), expectedVersion: 1 }, 'assessor');
    state = createProviderConformanceCase(state, { connectorId: '44444444-4444-4444-8444-444444444444', capability: 'payment-status-pull', suiteName: 'Bank sandbox release', suiteVersion: '2026.07', scenario: 'Status-pull response evidence' }, 'maker', '55555555-5555-4555-8555-555555555556');
    state = recordProviderConformanceResult(state, { id: '55555555-5555-4555-8555-555555555556', result: 'passed', evidenceReference: 'EVIDENCE-BANK-STATUS-002', resultChecksum: 'd'.repeat(64), expectedVersion: 1 }, 'assessor');
    state = approveProviderConnector(state, { id: '44444444-4444-4444-8444-444444444444', expectedVersion: 2 }, 'approver');
    state = prepareProviderSubmission(state, { connectorId: '44444444-4444-4444-8444-444444444444', capability: 'payment-release', sourceIds: ['payment-1'] }, 'maker', '66666666-6666-4666-8666-666666666666');
    state = handOffProviderSubmission(state, { id: '66666666-6666-4666-8666-666666666666', requestReference: 'PACK-BANK-002', expectedVersion: 1 }, 'releaser');
    state = applyProviderReconciliation(state, '44444444-4444-4444-8444-444444444444', [{ submissionId: '66666666-6666-4666-8666-666666666666', remoteStatus: 'failed', externalReference: 'BANK-FAILED-002', remotePayloadChecksum: 'd'.repeat(64), errorMessage: 'Provider declined the request.' }], 'reconciler', '77777777-7777-4777-8777-777777777777', '2026-07-18T13:00:00.000Z');
    expect(state.providerSubmissions[0]).toMatchObject({ status: 'failed', externalReference: 'BANK-FAILED-002' });
    expect(state.providerReconciliationRuns[0]).toMatchObject({ status: 'completed-with-exceptions', requestedBy: 'reconciler' });
    expect(state.providerReconciliationRuns[0]?.items[0]).toMatchObject({ result: 'drift', remoteStatus: 'failed' });
  });

  it('supports messaging connectors for certified report delivery handoffs', () => {
    let state = configureProviderConnector(controlled(), { code: 'MSG-EMAIL', name: 'Email delivery pack', providerLegalName: 'Example Messaging Limited', domain: 'messaging', environment: 'production', baseUrl: 'https://messaging.example.in', statusPathTemplate: '/v1/status/{reference}', capabilities: ['email-delivery'], specificationVersion: 'production-2026.07' }, 'maker', '88888888-8888-4888-8888-888888888888', '2026-07-18T12:00:00.000Z');
    state = markProviderCredentials(state, '88888888-8888-4888-8888-888888888888', 'msg-fingerprint');
    state = createProviderConformanceCase(state, { connectorId: '88888888-8888-4888-8888-888888888888', capability: 'email-delivery', deliveryChannel: 'email', suiteName: 'Messaging production', suiteVersion: '2026.07', scenario: 'email-delivery replay' }, 'maker', '99999999-9999-4999-9999-999999999999');
    expect(state.providerConformanceCases[0]).toMatchObject({ capability: 'email-delivery', deliveryChannel: 'email' });
    state = recordProviderConformanceResult(state, { id: '99999999-9999-4999-9999-999999999999', result: 'passed', evidenceReference: 'MSG-EVIDENCE-1', resultChecksum: 'a'.repeat(64), expectedVersion: 1 }, 'assessor');
    state = approveProviderConnector(state, { id: '88888888-8888-4888-8888-888888888888', expectedVersion: 2 }, 'approver');
    const plan: RetailReportDeliveryPlan = { scope: state.scope, id: 'delivery-plan-1', number: 'RPTD-26-27-00001', reportPackId: 'retail-daily', channel: 'email', providerConnectorId: '88888888-8888-4888-8888-888888888888', frequency: 'daily', timeZone: 'Asia/Kolkata', windowStart: '09:00', windowEnd: '18:00', effectiveFrom: '2026-07-01', recipients: [{ id: 'ops', kind: 'internal-user', label: 'Operations', destination: 'ops@example.in' }], notes: 'Approved daily report', status: 'approved', createdBy: 'maker', createdAt: '2026-07-01T09:00:00.000Z', approvedBy: 'approver', approvedAt: '2026-07-01T09:05:00.000Z', version: 2 };
    const attempt: RetailReportDeliveryAttempt = { scope: state.scope, id: 'delivery-attempt-1', number: 'RPTX-26-27-00001', planId: plan.id, reportPackId: plan.reportPackId, channel: 'email', slotKey: '2026-07-18', idempotencyKey: 'report-delivery:delivery-plan-1:2026-07-18', recipientCount: 1, payloadChecksum: 'b'.repeat(64), status: 'prepared', preparedBy: 'maker', preparedAt: '2026-07-18T09:00:00.000Z', version: 1 };
    expect(() => prepareProviderSubmission(state, { connectorId: '88888888-8888-4888-8888-888888888888', capability: 'email-delivery', sourceIds: ['unknown-attempt'] }, 'maker')).toThrow('scoped report-delivery registry');
    state = prepareProviderSubmission(state, { connectorId: '88888888-8888-4888-8888-888888888888', capability: 'email-delivery', sourceIds: ['delivery-attempt-1'] }, 'maker', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', undefined, { plans: [plan], attempts: [attempt] });
    expect(state.providerSubmissions[0]).toMatchObject({ domain: 'messaging', capability: 'email-delivery', sourceKind: 'report-delivery-attempt', sourceIds: ['delivery-attempt-1'] });
  });

  it('plans a complete, channel-tagged messaging pack idempotently', () => {
    let state = configureProviderConnector(controlled(), { code: 'MSG-PACK', name: 'Messaging capability pack', providerLegalName: 'Example Messaging Limited', domain: 'messaging', environment: 'sandbox', baseUrl: 'https://messaging.example.in', statusPathTemplate: '/v1/status/{reference}', capabilities: ['email-delivery', 'whatsapp-delivery'], specificationVersion: 'sandbox-2026.07' }, 'maker', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '2026-07-18T12:00:00.000Z');
    state = planProviderConformancePack(state, { connectorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', suiteName: 'India messaging delivery pack', suiteVersion: '1.0' }, 'maker', '2026-07-18T12:01:00.000Z');
    expect(state.providerConformanceCases).toHaveLength(2);
    expect(state.providerConformanceCases).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'email-delivery', deliveryChannel: 'email', result: 'planned' }),
      expect.objectContaining({ capability: 'whatsapp-delivery', deliveryChannel: 'whatsapp', result: 'planned' }),
    ]));
    const replay = planProviderConformancePack(state, { connectorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', suiteName: 'India messaging delivery pack', suiteVersion: '1.0' }, 'maker');
    expect(replay.providerConformanceCases).toHaveLength(2);
  });

  it('invalidates production approval when provider credentials rotate and requires a new capability pack', () => {
    const connectorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let state = configureProviderConnector(controlled(), {
      code: 'BANK-ROTATE', name: 'Rotating production bank', providerLegalName: 'Example Bank Limited', domain: 'banking', environment: 'production', baseUrl: 'https://bank.example.in', statusPathTemplate: '/v1/status/{reference}', capabilities: ['payment-release'], specificationVersion: 'production-2026.08',
    }, 'maker', connectorId, '2026-08-02T09:00:00.000Z');
    state = markProviderCredentials(state, connectorId, 'credential-fingerprint-v1');
    state = createProviderConformanceCase(state, {
      connectorId, capability: 'payment-release', suiteName: 'Production bank replay', suiteVersion: '1.0', scenario: 'Payment release response and idempotency replay',
    }, 'maker', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '2026-08-02T09:02:00.000Z');
    state = recordProviderConformanceResult(state, {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', result: 'passed', evidenceReference: 'BANK-PROD-REPLAY-V1', resultChecksum: 'c'.repeat(64), expectedVersion: 1,
    }, 'assessor', '2026-08-02T09:03:00.000Z');
    state = approveProviderConnector(state, { id: connectorId, expectedVersion: 2 }, 'approver', '2026-08-02T09:04:00.000Z');

    state = markProviderCredentials(state, connectorId, 'credential-fingerprint-v2');

    expect(state.providerConnectors[0]).toMatchObject({ credentialRevision: 2, conformanceStatus: 'draft' });
    expect(state.providerConnectors[0]?.approvedBy).toBeUndefined();
    expect(state.providerConformanceCases[0]).toMatchObject({ credentialRevision: 1, result: 'passed' });
    expect(() => prepareProviderSubmission(state, { connectorId, capability: 'payment-release', sourceIds: ['payment-1'] }, 'maker')).toThrow('approved conformance');
    expect(() => approveProviderConnector(state, { id: connectorId, expectedVersion: 4 }, 'approver')).toThrow(/current credential|Independent passed/);

    state = planProviderConformancePack(state, { connectorId, suiteName: 'Production bank replay', suiteVersion: '1.1' }, 'maker', '2026-08-02T09:05:00.000Z');
    expect(state.providerConformanceCases).toHaveLength(2);
    expect(state.providerConformanceCases[0]).toMatchObject({ credentialRevision: 2, capability: 'payment-release', result: 'planned' });
  });

  it('fails closed for expired or revoked credential generations', () => {
    const connectorId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    let state = configureProviderConnector(controlled(), {
      code: 'BANK-LIFECYCLE', name: 'Credential lifecycle bank', providerLegalName: 'Example Bank Limited', domain: 'banking', environment: 'sandbox', baseUrl: 'https://bank.lifecycle.example', statusPathTemplate: '/v1/status/{reference}', capabilities: ['payment-release'], specificationVersion: 'sandbox-2026.08',
    }, 'maker', connectorId, '2026-08-03T09:00:00.000Z');
    state = markProviderCredentialsWithExpiry(state, connectorId, 'lifecycle-fingerprint', '2026-08-03T10:00:00.000Z', '2026-08-03T09:01:00.000Z');
    expect(state.providerConnectors[0]).toMatchObject({ credentialRevision: 1, credentialExpiresAt: '2026-08-03T10:00:00.000Z' });
    state = revokeProviderCredentials(state, connectorId, 'Provider reported a compromised secret.', '2026-08-03T09:30:00.000Z');
    expect(state.providerConnectors[0]).toMatchObject({ credentialRevokedAt: '2026-08-03T09:30:00.000Z', conformanceStatus: 'draft' });
    expect(() => approveProviderConnector(state, { id: connectorId, expectedVersion: 3 }, 'approver', '2026-08-03T09:31:00.000Z')).toThrow(/current and sealed/i);
    expect(() => markProviderCredentialsWithExpiry(state, connectorId, 'new-fingerprint', '2026-08-03T09:30:00.000Z', '2026-08-03T09:31:00.000Z')).toThrow(/future timestamp/i);
  });
});
