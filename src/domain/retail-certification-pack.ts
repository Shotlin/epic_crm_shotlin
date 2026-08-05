import { createHash } from 'node:crypto';
import type { RetailCommerceCapability } from '../shared/retail-commerce-contracts';
import { retailCommerceConformanceMatchesCredentialRevision } from '../shared/retail-commerce-contracts';
import type { RetailCertificationPack, RetailCertificationPackSource } from '../shared/retail-certification-pack-contracts';
import type { RetailPhysicalDeviceKind } from '../shared/retail-device-transport-contracts';
import type { ProviderCapability } from '../shared/provider-contracts';
import { providerConformanceMatchesCredentialRevision, providerCredentialLifecycle, providerPreflightMatchesCredentialRevision } from '../shared/provider-contracts';
import { computeRetailCertificationFreshness } from './retail-certification-freshness';

const capabilityOrder: RetailCommerceCapability[] = ['catalog-push', 'inventory-push', 'order-pull', 'settlement-pull'];
const deviceOrder: RetailPhysicalDeviceKind[] = ['barcode-scanner', 'escpos-printer', 'cash-drawer', 'weighing-scale'];
const providerCapabilityOrder: ProviderCapability[] = ['payment-release', 'payment-status-pull', 'statement-pull', 'payroll-disbursement', 'payroll-status-pull', 'payslip-delivery', 'statutory-filing', 'statutory-status-pull', 'email-delivery', 'whatsapp-delivery'];
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

const validConformance = (item: RetailCertificationPackSource['retailCommerceConformanceCases'][number]) => item.result === 'passed' && Boolean(item.evidenceReference?.trim()) && /^[a-f0-9]{64}$/i.test(item.resultChecksum ?? '') && Boolean(item.assessedBy?.trim()) && Boolean(item.assessedAt);

export function createRetailCertificationPack(source: RetailCertificationPackSource, generatedBy: string, generatedAt = new Date().toISOString()): RetailCertificationPack {
  if (!generatedBy.trim() || !Number.isFinite(Date.parse(generatedAt))) throw new Error('Retail certification pack requires an accountable actor and valid timestamp.');
  const freshness = computeRetailCertificationFreshness({
    commerceConnectors: source.retailCommerceConnectors,
    commerceCases: source.retailCommerceConformanceCases,
    ocrProviders: source.retailOcrProviderProfiles,
    providerConnectors: source.providerConnectors,
    providerCases: source.providerConformanceCases,
    asOfDate: generatedAt.slice(0, 10),
  });
  const connectors = source.retailCommerceConnectors.map((connector) => {
    const cases = source.retailCommerceConformanceCases.filter((item) => item.connectorId === connector.id);
    const currentCases = cases.filter((item) => retailCommerceConformanceMatchesCredentialRevision(connector, item));
    const staleCredentialCaseCount = cases.filter((item) => !retailCommerceConformanceMatchesCredentialRevision(connector, item)).length;
    const connectorFreshness = freshness.rows.filter((row) => row.source === 'commerce' && row.ownerId === connector.id);
    const freshnessApplicable = connector.environment === 'production';
    const passed = new Set((freshnessApplicable ? connectorFreshness.filter((row) => ['current', 'renewal-due'].includes(row.status)).map((row) => row.capability) : currentCases.filter(validConformance).map((item) => item.capability)).filter((capability): capability is RetailCommerceCapability => Boolean(capability)));
    const legacySingleCapabilityPass = !freshnessApplicable && connector.capabilities.length === 1 && currentCases.some((item) => validConformance(item) && !item.capability);
    const passedCapabilities = capabilityOrder.filter((capability) => connector.capabilities.includes(capability) && (passed.has(capability) || legacySingleCapabilityPass));
    const missingCapabilities = connector.capabilities.filter((capability) => !passedCapabilities.includes(capability));
    const hasExpiredEvidence = connectorFreshness.some((row) => row.status === 'expired');
    const renewalDue = connectorFreshness.some((row) => row.status === 'renewal-due');
    const nextAction: RetailCertificationPack['connectors'][number]['nextAction'] = connector.credentialStatus !== 'configured' ? 'configure-credentials' : staleCredentialCaseCount ? 'renew-capability-evidence' : hasExpiredEvidence || renewalDue ? 'renew-capability-evidence' : missingCapabilities.length ? 'complete-capability-evidence' : connector.environment === 'production' && connector.status !== 'certified' ? 'production-approval' : 'ready';
    return { id: connector.id, code: connector.code, channel: connector.channel, environment: connector.environment, status: connector.status, credentialStatus: connector.credentialStatus, capabilities: [...connector.capabilities].sort(), passedCapabilities, missingCapabilities, conformanceCaseCount: cases.length, staleCredentialCaseCount, nextAction };
  }).sort((left, right) => left.code.localeCompare(right.code));
  const devices = deviceOrder.map((kind) => {
    const records = source.retailDeviceTransportEvidence.filter((item) => item.kind === kind);
    const preparedCount = records.filter((item) => item.status === 'prepared').length;
    const acknowledgedCount = records.filter((item) => item.status === 'acknowledged').length;
    const failedCount = records.filter((item) => item.status === 'failed').length;
    const profileGateCount = records.filter((item) => item.status === 'acknowledged' && (!item.profileId || !source.retailDeviceAdapterProfiles?.some((profile) => profile.id === item.profileId && profile.version === item.profileVersion && ['operational'].includes(profile.status)))).length;
    const nextAction = preparedCount || failedCount ? 'record-result' as const : profileGateCount ? 'complete-profile-certification' as const : records.length === 0 ? 'prepare-command' as const : 'ready' as const;
    return { kind, deviceCount: new Set(records.map((item) => item.deviceCode)).size, preparedCount, acknowledgedCount, failedCount, profileGateCount, responseReferences: records.map((item) => item.responseReference).filter((reference): reference is string => Boolean(reference)).sort(), nextAction };
  });
  const ocrProviders = source.retailOcrProviderProfiles.map((provider) => {
    const providerFreshness = freshness.rows.filter((row) => row.source === 'ocr' && row.ownerId === provider.id);
    const hasExpiredEvidence = providerFreshness.some((row) => row.status === 'expired');
    const renewalDue = providerFreshness.some((row) => row.status === 'renewal-due');
    const missingEvidence = provider.mode === 'api' && providerFreshness.some((row) => row.status === 'missing');
    const nextAction: RetailCertificationPack['ocrProviders'][number]['nextAction'] = provider.credentialStatus !== 'configured' ? 'configure-credentials' : hasExpiredEvidence || renewalDue ? 'renew-certification' : missingEvidence ? 'record-certification' : provider.status === 'certified' ? 'ready' : 'record-certification';
    return { id: provider.id, code: provider.code, mode: provider.mode, status: provider.status, credentialStatus: provider.credentialStatus, nextAction };
  }).sort((left, right) => left.code.localeCompare(right.code));
  const providers = source.providerConnectors.map((connector) => {
    const credentialState = providerCredentialLifecycle(connector, generatedAt);
    const cases = source.providerConformanceCases.filter((item) => item.connectorId === connector.id && item.environment === connector.environment);
    const staleCredentialCaseCount = cases.filter((item) => !providerConformanceMatchesCredentialRevision(connector, item)).length;
    const providerFreshness = freshness.rows.filter((row) => row.source === 'provider' && row.ownerId === connector.id);
    const freshnessApplicable = connector.environment === 'production' && connector.active;
    const passedCases = cases.filter((item) => providerConformanceMatchesCredentialRevision(connector, item) && item.result === 'passed' && Boolean(item.evidenceReference?.trim()) && /^[a-f0-9]{64}$/i.test(item.resultChecksum ?? '') && Boolean(item.assessedBy?.trim()) && Boolean(item.assessedAt));
    const freshCapabilities = new Set(providerFreshness.filter((row) => ['current', 'renewal-due'].includes(row.status)).map((row) => row.capability));
    const legacySingleCapabilityPass = !freshnessApplicable && connector.capabilities.length === 1 && passedCases.length > 0;
    const passedCapabilities = providerCapabilityOrder.filter((capability) => credentialState === 'configured' && connector.capabilities.includes(capability) && ((freshnessApplicable ? freshCapabilities.has(capability) : passedCases.some((item) => (item as ProviderConformanceCaseWithCapability).capability === capability)) || legacySingleCapabilityPass));
    const missingCapabilities = connector.capabilities.filter((capability) => !passedCapabilities.includes(capability));
    const unresolvedSubmissionCount = source.providerSubmissions.filter((submission) => submission.connectorId === connector.id && ['prepared', 'handed-off'].includes(submission.status)).length;
    const hasExpiredEvidence = providerFreshness.some((row) => row.status === 'expired');
    const renewalDue = providerFreshness.some((row) => row.status === 'renewal-due');
    const nextAction: RetailCertificationPack['providers'][number]['nextAction'] = credentialState !== 'configured' || connector.credentialStatus !== 'configured' ? 'configure-credentials' : staleCredentialCaseCount ? 'renew-capability-evidence' : hasExpiredEvidence || renewalDue ? 'renew-capability-evidence' : missingCapabilities.length ? 'complete-capability-evidence' : unresolvedSubmissionCount ? 'resolve-submissions' : connector.environment === 'production' && connector.conformanceStatus !== 'production-approved' ? 'production-approval' : 'ready';
    return { id: connector.id, code: connector.code, domain: connector.domain, environment: connector.environment, conformanceStatus: connector.conformanceStatus, credentialStatus: connector.credentialStatus, credentialState, credentialExpiresAt: connector.credentialExpiresAt, capabilities: [...connector.capabilities].sort(), passedCapabilities, missingCapabilities, conformanceCaseCount: cases.length, staleCredentialCaseCount, unresolvedSubmissionCount, nextAction };
  }).sort((left, right) => left.code.localeCompare(right.code));
  const preflight = source.providerConnectors.map((connector) => {
    const evidence = (source.providerPreflightEvidence ?? []).filter((item) => item.connectorId === connector.id && providerPreflightMatchesCredentialRevision(connector, item)).sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
    return {
      connectorId: connector.id,
      successCount: evidence.filter((item) => item.status === 'succeeded').length,
      failureCount: evidence.filter((item) => item.status === 'failed').length,
      latestStatus: evidence[0]?.status ?? 'not-run' as const,
      latestAt: evidence[0]?.requestedAt ?? '',
      evidenceReferences: evidence.map((item) => item.evidenceReference).slice(0, 12),
    };
  }).sort((left, right) => left.connectorId.localeCompare(right.connectorId));
  const missingCapabilityCount = connectors.reduce((total, connector) => total + connector.missingCapabilities.length, 0);
  const devicePreparedCount = devices.reduce((total, device) => total + device.preparedCount, 0);
  const deviceFailedCount = devices.reduce((total, device) => total + device.failedCount, 0);
  const deviceProfileGateCount = devices.reduce((total, device) => total + device.profileGateCount, 0);
  const connectorReadyCount = connectors.filter((connector) => connector.nextAction === 'ready' && connector.status === 'certified').length;
  const ocrReadyCount = ocrProviders.filter((provider) => provider.nextAction === 'ready').length;
  const providerMissingCapabilityCount = providers.reduce((total, provider) => total + provider.missingCapabilities.length, 0);
  const staleCredentialCaseCount = connectors.reduce((total, connector) => total + connector.staleCredentialCaseCount, 0) + providers.reduce((total, provider) => total + provider.staleCredentialCaseCount, 0);
  const providerReadyCount = providers.filter((provider) => provider.nextAction === 'ready').length;
  const unresolvedSubmissionCount = providers.reduce((total, provider) => total + provider.unresolvedSubmissionCount, 0);
  const preflightSuccessCount = preflight.reduce((total, item) => total + item.successCount, 0);
  const preflightFailureCount = preflight.reduce((total, item) => total + item.failureCount, 0);
  const externalGateCount = connectors.filter((connector) => connector.nextAction !== 'ready').length + devices.filter((device) => device.nextAction !== 'ready').length + ocrProviders.filter((provider) => provider.nextAction !== 'ready').length + providers.filter((provider) => provider.nextAction !== 'ready').length;
  const productionConnectorCount = connectors.filter((connector) => connector.environment === 'production').length;
  const productionProviderCount = providers.filter((provider) => provider.environment === 'production').length;
  const readyForProduction = (productionConnectorCount + productionProviderCount) > 0 && connectors.filter((connector) => connector.environment === 'production').every((connector) => connector.nextAction === 'ready') && providers.filter((provider) => provider.environment === 'production').every((provider) => provider.nextAction === 'ready') && missingCapabilityCount === 0 && devicePreparedCount === 0 && deviceFailedCount === 0 && deviceProfileGateCount === 0 && providerMissingCapabilityCount === 0 && unresolvedSubmissionCount === 0 && externalGateCount === 0;
  const unsigned = { generatedAt, generatedBy: generatedBy.trim(), scope: structuredClone(source.scope), summary: { connectorCount: connectors.length, connectorReadyCount, missingCapabilityCount, devicePreparedCount, deviceFailedCount, deviceProfileGateCount, ocrReadyCount, providerCount: providers.length, providerReadyCount, providerMissingCapabilityCount, staleCredentialCaseCount, unresolvedSubmissionCount, preflightSuccessCount, preflightFailureCount, externalGateCount, readyForProduction }, connectors, devices, ocrProviders, providers, preflight };
  return { ...unsigned, checksum: sha256(JSON.stringify(unsigned)) };
}

type ProviderConformanceCaseWithCapability = RetailCertificationPackSource['providerConformanceCases'][number] & { capability?: ProviderCapability };
