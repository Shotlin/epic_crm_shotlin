import { describe, expect, it } from 'vitest';
import { createRetailCertificationPack } from './retail-certification-pack';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createRetailCommerceConnector, configureRetailCommerceCredentials } from './retail-commerce';
import { createRetailCommerceConformanceCase, recordRetailCommerceConformance } from './retail-commerce-advanced';
import { prepareRetailDeviceTransport, recordRetailDeviceTransport } from './retail-device-transport';
import { configureProviderConnector, createProviderConformanceCase, markProviderCredentials, markProviderCredentialsWithExpiry, recordProviderConformanceResult, approveProviderConnector, revokeProviderCredentials } from './provider-control';

const checksum = 'b'.repeat(64);

describe('retail provider and device certification pack', () => {
  it('summarizes capability gaps, device evidence, and redacted provider readiness deterministically', () => {
    let state = createInitialRevenueOpsState();
    const connectorId = '00000000-0000-4000-8000-000000000081';
    state = createRetailCommerceConnector(state, { code: 'PACK-MKT', name: 'Pack marketplace', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://sandbox.marketplace.example', capabilities: ['order-pull', 'settlement-pull'] }, 'maker', connectorId, '2026-08-01T10:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId, fingerprint: checksum });
    state = createRetailCommerceConformanceCase(state, { connectorId, capability: 'order-pull', suiteName: 'Marketplace suite', suiteVersion: '1.0', scenario: 'order pull' }, 'maker', '00000000-0000-4000-8000-000000000082', '2026-08-01T10:01:00.000Z');
    state = recordRetailCommerceConformance(state, { id: '00000000-0000-4000-8000-000000000082', result: 'passed', evidenceReference: 'MKT-ORDER-SBX-1', resultChecksum: checksum, expectedVersion: 1 }, 'checker', '2026-08-01T10:02:00.000Z');
    state = prepareRetailDeviceTransport(state, { kind: 'escpos-printer', deviceCode: 'PRINTER-01', connection: 'usb', command: 'print', payload: 'RECEIPT' }, 'cashier', '2026-08-01T10:03:00.000Z', 'device-pack-1');
    const source = { scope: state.scope, retailCommerceConnectors: state.retailCommerceConnectors, retailCommerceConformanceCases: state.retailCommerceConformanceCases, retailDeviceTransportEvidence: state.retailDeviceTransportEvidence, retailOcrProviderProfiles: state.retailOcrProviderProfiles, providerConnectors: state.providerConnectors, providerConformanceCases: state.providerConformanceCases, providerSubmissions: state.providerSubmissions };
    const first = createRetailCertificationPack(source, 'auditor', '2026-08-01T10:04:00.000Z');
    const second = createRetailCertificationPack(source, 'auditor', '2026-08-01T10:04:00.000Z');
    expect(first).toEqual(second);
    expect(first.summary).toMatchObject({ connectorCount: 1, connectorReadyCount: 0, missingCapabilityCount: 1, devicePreparedCount: 1, deviceFailedCount: 0, preflightSuccessCount: 0, preflightFailureCount: 0, readyForProduction: false });
    expect(first.connectors[0]).toMatchObject({ code: 'PACK-MKT', passedCapabilities: ['order-pull'], missingCapabilities: ['settlement-pull'], nextAction: 'complete-capability-evidence' });
    expect(first.devices.find((device) => device.kind === 'escpos-printer')).toMatchObject({ preparedCount: 1, nextAction: 'record-result' });
    expect(first.preflight).toEqual([]);
    expect(first.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('includes generic banking or messaging certification without exporting secrets', () => {
    let state = createInitialRevenueOpsState();
    state = configureProviderConnector(state, { code: 'BANK-PACK', name: 'Banking pack', providerLegalName: 'Example Bank Limited', domain: 'banking', environment: 'production', baseUrl: 'https://bank.example.in', statusPathTemplate: '/v1/status/{reference}', capabilities: ['payment-release'], specificationVersion: '2026.07' }, 'maker', '00000000-0000-4000-8000-000000000091', '2026-08-01T10:00:00.000Z');
    state = markProviderCredentials(state, '00000000-0000-4000-8000-000000000091', checksum);
    state = createProviderConformanceCase(state, { connectorId: '00000000-0000-4000-8000-000000000091', capability: 'payment-release', suiteName: 'Bank production', suiteVersion: '1.0', scenario: 'payment release replay' }, 'maker', '00000000-0000-4000-8000-000000000092', '2026-08-01T10:01:00.000Z');
    state = recordProviderConformanceResult(state, { id: '00000000-0000-4000-8000-000000000092', result: 'passed', evidenceReference: 'BANK-PROD-CASE-1', resultChecksum: checksum, expectedVersion: 1 }, 'assessor', '2026-08-01T10:02:00.000Z');
    state = approveProviderConnector(state, { id: '00000000-0000-4000-8000-000000000091', expectedVersion: 2 }, 'approver', '2026-08-01T10:03:00.000Z');
    state.providerPreflightEvidence = [
      { scope: state.scope, id: 'preflight-pack-2', connectorId: '00000000-0000-4000-8000-000000000091', method: 'GET', path: '/v1/health', requestChecksum: checksum, responseChecksum: checksum, responseByteLength: 15, status: 'succeeded', evidenceReference: 'BANK-HEALTH-PROD-1', requestedBy: 'assessor', requestedAt: '2026-08-01T10:03:30.000Z', credentialRevision: 1, version: 1 },
      { scope: state.scope, id: 'preflight-pack-stale', connectorId: '00000000-0000-4000-8000-000000000091', method: 'GET', path: '/v1/health', requestChecksum: checksum, responseChecksum: checksum, responseByteLength: 15, status: 'succeeded', evidenceReference: 'BANK-HEALTH-OLD', requestedBy: 'assessor', requestedAt: '2026-08-01T10:03:20.000Z', credentialRevision: 0, version: 1 },
    ];
    const pack = createRetailCertificationPack({ scope: state.scope, retailCommerceConnectors: [], retailCommerceConformanceCases: [], retailDeviceTransportEvidence: [], retailOcrProviderProfiles: [], providerConnectors: state.providerConnectors, providerConformanceCases: state.providerConformanceCases, providerSubmissions: state.providerSubmissions, providerPreflightEvidence: state.providerPreflightEvidence }, 'auditor', '2026-08-01T10:04:00.000Z');
    expect(pack.providers[0]).toMatchObject({ code: 'BANK-PACK', passedCapabilities: ['payment-release'], missingCapabilities: [], nextAction: 'ready' });
    expect(pack.summary).toMatchObject({ providerCount: 1, providerReadyCount: 1, providerMissingCapabilityCount: 0, readyForProduction: false, externalGateCount: 4 });
    expect(pack.preflight[0]).toMatchObject({ connectorId: '00000000-0000-4000-8000-000000000091', successCount: 1, failureCount: 0, latestStatus: 'succeeded', evidenceReferences: ['BANK-HEALTH-PROD-1'] });
    expect(JSON.stringify(pack)).not.toContain(checksum);
  });

  it('excludes provider preflight success from an older credential revision', () => {
    let state = createInitialRevenueOpsState();
    const connectorId = '00000000-0000-4000-8000-000000000111';
    state = configureProviderConnector(state, { code: 'BANK-PREFLIGHT-ROTATE', name: 'Rotating preflight bank', providerLegalName: 'Example Bank Limited', domain: 'banking', environment: 'production', baseUrl: 'https://bank.example.in', statusPathTemplate: '/v1/status/{reference}', capabilities: ['statement-pull'], specificationVersion: '2026.08' }, 'maker', connectorId, '2026-08-01T10:00:00.000Z');
    state = markProviderCredentials(state, connectorId, checksum);
    state.providerPreflightEvidence = [{ scope: state.scope, id: 'preflight-current', connectorId, method: 'GET', path: '/v1/health', requestChecksum: checksum, responseChecksum: checksum, responseByteLength: 12, status: 'succeeded', evidenceReference: 'BANK-HEALTH-CURRENT', requestedBy: 'assessor', requestedAt: '2026-08-01T10:01:00.000Z', credentialRevision: 1, version: 1 }, { scope: state.scope, id: 'preflight-old', connectorId, method: 'GET', path: '/v1/health', requestChecksum: checksum, responseChecksum: checksum, responseByteLength: 12, status: 'succeeded', evidenceReference: 'BANK-HEALTH-OLD', requestedBy: 'assessor', requestedAt: '2026-08-01T10:00:00.000Z', credentialRevision: 0, version: 1 }];
    const pack = createRetailCertificationPack({ scope: state.scope, retailCommerceConnectors: [], retailCommerceConformanceCases: [], retailDeviceTransportEvidence: [], retailOcrProviderProfiles: [], providerConnectors: state.providerConnectors, providerConformanceCases: state.providerConformanceCases, providerSubmissions: state.providerSubmissions, providerPreflightEvidence: state.providerPreflightEvidence }, 'auditor', '2026-08-01T10:02:00.000Z');
    expect(pack.preflight[0]).toMatchObject({ successCount: 1, evidenceReferences: ['BANK-HEALTH-CURRENT'] });
  });

  it('surfaces stale commerce and provider conformance evidence after credential rotation', () => {
    let state = createInitialRevenueOpsState();
    const commerceConnectorId = '00000000-0000-4000-8000-000000000121';
    const commerceCaseId = '00000000-0000-4000-8000-000000000122';
    state = createRetailCommerceConnector(state, { code: 'ROTATE-MKT', name: 'Rotating marketplace', channel: 'marketplace', environment: 'sandbox', baseUrl: 'https://sandbox.marketplace.example', capabilities: ['order-pull'] }, 'maker', commerceConnectorId, '2026-08-01T10:00:00.000Z');
    state = configureRetailCommerceCredentials(state, { connectorId: commerceConnectorId, fingerprint: checksum });
    state = createRetailCommerceConformanceCase(state, { connectorId: commerceConnectorId, capability: 'order-pull', suiteName: 'Marketplace replay', suiteVersion: '1.0', scenario: 'order pull' }, 'maker', commerceCaseId, '2026-08-01T10:01:00.000Z');
    state = recordRetailCommerceConformance(state, { id: commerceCaseId, result: 'passed', evidenceReference: 'MKT-OLD', resultChecksum: checksum, expectedVersion: 1 }, 'assessor', '2026-08-01T10:02:00.000Z');
    state.retailCommerceConnectors = state.retailCommerceConnectors.map((connector) => connector.id === commerceConnectorId ? { ...connector, credentialRevision: 2 } : connector);
    const providerConnectorId = '00000000-0000-4000-8000-000000000123';
    const providerCaseId = '00000000-0000-4000-8000-000000000124';
    state = configureProviderConnector(state, { code: 'ROTATE-BANK', name: 'Rotating bank', providerLegalName: 'Example Bank Limited', domain: 'banking', environment: 'sandbox', baseUrl: 'https://sandbox.bank.example.in', statusPathTemplate: '/v1/status/{reference}', capabilities: ['statement-pull'], specificationVersion: '2026.08' }, 'maker', providerConnectorId, '2026-08-01T10:03:00.000Z');
    state = markProviderCredentials(state, providerConnectorId, checksum);
    state = createProviderConformanceCase(state, { connectorId: providerConnectorId, capability: 'statement-pull', suiteName: 'Bank replay', suiteVersion: '1.0', scenario: 'statement pull' }, 'maker', providerCaseId, '2026-08-01T10:04:00.000Z');
    state = recordProviderConformanceResult(state, { id: providerCaseId, result: 'passed', evidenceReference: 'BANK-OLD', resultChecksum: checksum, expectedVersion: 1 }, 'assessor', '2026-08-01T10:05:00.000Z');
    state.providerConnectors = state.providerConnectors.map((connector) => connector.id === providerConnectorId ? { ...connector, credentialRevision: 2 } : connector);
    const pack = createRetailCertificationPack({ scope: state.scope, retailCommerceConnectors: state.retailCommerceConnectors, retailCommerceConformanceCases: state.retailCommerceConformanceCases, retailDeviceTransportEvidence: [], retailOcrProviderProfiles: [], providerConnectors: state.providerConnectors, providerConformanceCases: state.providerConformanceCases, providerSubmissions: state.providerSubmissions }, 'auditor', '2026-08-01T10:06:00.000Z');
    expect(pack.connectors[0]).toMatchObject({ staleCredentialCaseCount: 1, passedCapabilities: [], nextAction: 'renew-capability-evidence' });
    expect(pack.providers[0]).toMatchObject({ staleCredentialCaseCount: 1, passedCapabilities: [], nextAction: 'renew-capability-evidence' });
    expect(pack.summary.staleCredentialCaseCount).toBe(2);
    expect(pack.summary.readyForProduction).toBe(false);
  });

  it('does not present expired production provider evidence as ready', () => {
    let state = createInitialRevenueOpsState();
    const connectorId = '00000000-0000-4000-8000-000000000101';
    const caseId = '00000000-0000-4000-8000-000000000102';
    state = configureProviderConnector(state, { code: 'BANK-STALE', name: 'Banking stale evidence', providerLegalName: 'Example Bank Limited', domain: 'banking', environment: 'production', baseUrl: 'https://bank.example.in', statusPathTemplate: '/v1/status/{reference}', capabilities: ['payment-release'], specificationVersion: '2026.04' }, 'maker', connectorId, '2026-04-01T10:00:00.000Z');
    state = markProviderCredentials(state, connectorId, checksum);
    state = createProviderConformanceCase(state, { connectorId, capability: 'payment-release', suiteName: 'Bank production', suiteVersion: '1.0', scenario: 'payment release replay' }, 'maker', caseId, '2026-04-01T10:01:00.000Z');
    state = recordProviderConformanceResult(state, { id: caseId, result: 'passed', evidenceReference: 'BANK-STALE-CASE', resultChecksum: checksum, expectedVersion: 1 }, 'assessor', '2026-04-01T10:02:00.000Z');
    state = approveProviderConnector(state, { id: connectorId, expectedVersion: 2 }, 'approver', '2026-04-01T10:03:00.000Z');
    const pack = createRetailCertificationPack({ scope: state.scope, retailCommerceConnectors: [], retailCommerceConformanceCases: [], retailDeviceTransportEvidence: [], retailOcrProviderProfiles: [], providerConnectors: state.providerConnectors, providerConformanceCases: state.providerConformanceCases, providerSubmissions: state.providerSubmissions }, 'auditor', '2026-08-02T10:00:00.000Z');
    expect(pack.providers[0]).toMatchObject({ code: 'BANK-STALE', passedCapabilities: [], missingCapabilities: ['payment-release'], nextAction: 'renew-capability-evidence' });
    expect(pack.summary.readyForProduction).toBe(false);
  });

  it('does not present a production provider as ready after credential expiry or revocation', () => {
    let state = createInitialRevenueOpsState();
    const connectorId = '00000000-0000-4000-8000-000000000131';
    state = configureProviderConnector(state, { code: 'BANK-CRED-EXPIRED', name: 'Expired credential bank', providerLegalName: 'Example Bank Limited', domain: 'banking', environment: 'production', baseUrl: 'https://bank.example.in', statusPathTemplate: '/v1/status/{reference}', capabilities: ['payment-release'], specificationVersion: '2026.08' }, 'maker', connectorId, '2026-08-01T10:00:00.000Z');
    state = markProviderCredentialsWithExpiry(state, connectorId, checksum, '2026-08-01T12:00:00.000Z', '2026-08-01T10:01:00.000Z');
    const expiredPack = createRetailCertificationPack({ scope: state.scope, retailCommerceConnectors: [], retailCommerceConformanceCases: [], retailDeviceTransportEvidence: [], retailOcrProviderProfiles: [], providerConnectors: state.providerConnectors, providerConformanceCases: [], providerSubmissions: [] }, 'auditor', '2026-08-02T10:00:00.000Z');
    expect(expiredPack.providers[0]).toMatchObject({ credentialState: 'expired', passedCapabilities: [], missingCapabilities: ['payment-release'], nextAction: 'configure-credentials' });
    state = revokeProviderCredentials(state, connectorId, 'Provider secret compromise', '2026-08-01T11:00:00.000Z');
    const revokedPack = createRetailCertificationPack({ scope: state.scope, retailCommerceConnectors: [], retailCommerceConformanceCases: [], retailDeviceTransportEvidence: [], retailOcrProviderProfiles: [], providerConnectors: state.providerConnectors, providerConformanceCases: [], providerSubmissions: [] }, 'auditor', '2026-08-01T11:30:00.000Z');
    expect(revokedPack.providers[0]).toMatchObject({ credentialState: 'revoked', passedCapabilities: [], nextAction: 'configure-credentials' });
  });

  it('does not treat an unbound acknowledged device as production-certified', () => {
    let state = createInitialRevenueOpsState();
    state = prepareRetailDeviceTransport(state, { kind: 'escpos-printer', deviceCode: 'PRINTER-UNBOUND-01', connection: 'usb', command: 'print', payload: 'RECEIPT_TEST' }, 'cashier', '2026-08-03T10:00:00.000Z', 'device-unbound-1');
    state = recordUnboundAcknowledgement(state);
    const pack = createRetailCertificationPack({ scope: state.scope, retailCommerceConnectors: [], retailCommerceConformanceCases: [], retailDeviceTransportEvidence: state.retailDeviceTransportEvidence, retailDeviceAdapterProfiles: [], retailOcrProviderProfiles: [], providerConnectors: [], providerConformanceCases: [], providerSubmissions: [] }, 'auditor', '2026-08-03T10:02:00.000Z');
    expect(pack.devices.find((device) => device.kind === 'escpos-printer')).toMatchObject({ acknowledgedCount: 1, profileGateCount: 1, nextAction: 'complete-profile-certification' });
    expect(pack.summary.deviceProfileGateCount).toBe(1);
  });
});

function recordUnboundAcknowledgement(state: ReturnType<typeof createInitialRevenueOpsState>) {
  return recordRetailDeviceTransport(state, { id: 'device-unbound-1', result: 'acknowledged', responseReference: 'PRINTER-UNBOUND-ACK', responseProtocol: 'escpos-status-v1', responseChecksum: checksum, responseByteLength: 8, expectedVersion: 1 }, 'checker', '2026-08-03T10:01:00.000Z');
}
