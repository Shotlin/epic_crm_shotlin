import type { OperatingRecordScope, RevenueOpsSnapshot } from './revenue-ops-contracts';
import type { RetailCommerceCapability, RetailCommerceChannel, RetailCommerceConnectorStatus } from './retail-commerce-contracts';
import type { RetailPhysicalDeviceKind, RetailDeviceTransportStatus } from './retail-device-transport-contracts';
import type { RetailDeviceAdapterProfile } from './retail-device-profile-contracts';
import type { ProviderCapability, ProviderConformanceStatus, ProviderDomain, ProviderPreflightEvidence, ProviderCredentialLifecycle } from './provider-contracts';

export interface RetailCertificationConnectorRow {
  id: string;
  code: string;
  channel: RetailCommerceChannel;
  environment: 'sandbox' | 'production';
  status: RetailCommerceConnectorStatus;
  credentialStatus: 'missing' | 'configured';
  capabilities: RetailCommerceCapability[];
  passedCapabilities: RetailCommerceCapability[];
  missingCapabilities: RetailCommerceCapability[];
  conformanceCaseCount: number;
  staleCredentialCaseCount: number;
  nextAction: 'configure-credentials' | 'complete-capability-evidence' | 'renew-capability-evidence' | 'production-approval' | 'ready';
}

export interface RetailCertificationDeviceRow {
  kind: RetailPhysicalDeviceKind;
  deviceCount: number;
  preparedCount: number;
  acknowledgedCount: number;
  failedCount: number;
  profileGateCount: number;
  responseReferences: string[];
  nextAction: 'prepare-command' | 'record-result' | 'complete-profile-certification' | 'ready';
}

export interface RetailCertificationOcrRow {
  id: string;
  code: string;
  mode: 'manual' | 'api';
  status: 'draft' | 'configured' | 'certified' | 'suspended';
  credentialStatus: 'missing' | 'configured';
  nextAction: 'configure-credentials' | 'record-certification' | 'renew-certification' | 'ready';
}

export interface RetailCertificationProviderRow {
  id: string;
  code: string;
  domain: ProviderDomain;
  environment: 'sandbox' | 'production';
  conformanceStatus: ProviderConformanceStatus;
  credentialStatus: 'missing' | 'configured';
  credentialState: ProviderCredentialLifecycle;
  credentialExpiresAt?: string;
  capabilities: ProviderCapability[];
  passedCapabilities: ProviderCapability[];
  missingCapabilities: ProviderCapability[];
  conformanceCaseCount: number;
  staleCredentialCaseCount: number;
  unresolvedSubmissionCount: number;
  nextAction: 'configure-credentials' | 'complete-capability-evidence' | 'renew-capability-evidence' | 'production-approval' | 'resolve-submissions' | 'ready';
}

export interface RetailCertificationPreflightRow {
  connectorId: string;
  successCount: number;
  failureCount: number;
  latestStatus: ProviderPreflightEvidence['status'] | 'not-run';
  latestAt: string;
  evidenceReferences: string[];
}

export interface RetailCertificationPack {
  generatedAt: string;
  generatedBy: string;
  scope: OperatingRecordScope;
  summary: {
    connectorCount: number;
    connectorReadyCount: number;
    missingCapabilityCount: number;
    devicePreparedCount: number;
    deviceFailedCount: number;
    deviceProfileGateCount: number;
    ocrReadyCount: number;
    providerCount: number;
    providerReadyCount: number;
    providerMissingCapabilityCount: number;
    staleCredentialCaseCount: number;
    unresolvedSubmissionCount: number;
    preflightSuccessCount: number;
    preflightFailureCount: number;
    externalGateCount: number;
    readyForProduction: boolean;
  };
  connectors: RetailCertificationConnectorRow[];
  devices: RetailCertificationDeviceRow[];
  ocrProviders: RetailCertificationOcrRow[];
  providers: RetailCertificationProviderRow[];
  preflight: RetailCertificationPreflightRow[];
  checksum: string;
}

export interface RetailCertificationPackReceipt {
  filePath: string;
  checksum: string;
  readyForProduction: boolean;
  externalGateCount: number;
  exportedAt: string;
}

export type RetailCertificationPackSource = Pick<RevenueOpsSnapshot, 'scope' | 'retailCommerceConnectors' | 'retailCommerceConformanceCases' | 'retailDeviceTransportEvidence' | 'retailOcrProviderProfiles' | 'providerConnectors' | 'providerConformanceCases' | 'providerSubmissions'> & { retailDeviceAdapterProfiles?: RetailDeviceAdapterProfile[]; providerPreflightEvidence?: RevenueOpsSnapshot['providerPreflightEvidence'] };

export type RetailTransportStatus = RetailDeviceTransportStatus;
