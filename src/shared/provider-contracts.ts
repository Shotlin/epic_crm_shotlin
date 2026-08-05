export type ProviderDomain = 'banking' | 'payroll' | 'statutory' | 'messaging';

export type ProviderCapability =
  | 'payment-release'
  | 'payment-status-pull'
  | 'statement-pull'
  | 'payroll-disbursement'
  | 'payroll-status-pull'
  | 'payslip-delivery'
  | 'statutory-filing'
  | 'statutory-status-pull'
  | 'email-delivery'
  | 'whatsapp-delivery';

export type ProviderConformanceStatus = 'draft' | 'sandbox-verified' | 'production-approved' | 'suspended';
export type ProviderConformanceResult = 'planned' | 'passed' | 'failed';
export type ProviderSubmissionStatus = 'prepared' | 'handed-off' | 'acknowledged' | 'failed';
export type ProviderPreflightStatus = 'succeeded' | 'failed';
/** Runtime state of the protected credential material, evaluated at a known time. */
export type ProviderCredentialLifecycle = 'missing' | 'configured' | 'expired' | 'revoked';
/** Explicit banking rail tag; never infer UPI/card from a provider name. */
export type ProviderPaymentRail = 'upi' | 'card' | 'bank-transfer';
/** Explicit messaging channel tag; never infer email/WhatsApp from scenario text. */
export type ProviderDeliveryChannel = 'email' | 'whatsapp';

export interface ProviderConnector {
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  providerLegalName: string;
  domain: ProviderDomain;
  environment: 'sandbox' | 'production';
  baseUrl: string;
  statusPathTemplate: string;
  capabilities: ProviderCapability[];
  specificationVersion: string;
  credentialStatus: 'missing' | 'configured';
  credentialFingerprint?: string;
  /** Monotonic credential generation. A changed secret makes prior certification evidence stale. */
  credentialRevision?: number;
  /** Time at which the currently sealed credential generation expires. */
  credentialExpiresAt?: string;
  /** Time at which the current credential generation was revoked, if ever. */
  credentialRevokedAt?: string;
  /** Human-readable internal reason; secrets and raw provider responses never belong here. */
  credentialRevocationReason?: string;
  conformanceStatus: ProviderConformanceStatus;
  active: boolean;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  version: number;
}

export interface ProviderConformanceCase {
  scope?: OperatingRecordScope;
  id: string;
  connectorId: string;
  /** Capability exercised by this case; legacy records may omit it. */
  capability?: ProviderCapability;
  /** Payment rail exercised by a banking case; legacy cases may omit it. */
  paymentRail?: ProviderPaymentRail;
  /** Delivery channel exercised by a messaging case; legacy cases may omit it. */
  deliveryChannel?: ProviderDeliveryChannel;
  suiteName: string;
  suiteVersion: string;
  scenario: string;
  environment: ProviderConnector['environment'];
  /** Credential generation used when this conformance scenario was prepared. */
  credentialRevision?: number;
  result: ProviderConformanceResult;
  evidenceReference?: string;
  resultChecksum?: string;
  preparedBy: string;
  preparedAt: string;
  assessedBy?: string;
  assessedAt?: string;
  version: number;
}

export interface ProviderSubmission {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  connectorId: string;
  domain: ProviderDomain;
  capability: ProviderCapability;
  /** Credential generation used when this packet was prepared. */
  credentialRevision?: number;
  sourceKind: 'payment-proposal' | 'payroll-run' | 'payroll-obligation' | 'report-delivery-attempt';
  sourceIds: string[];
  payloadChecksum: string;
  status: ProviderSubmissionStatus;
  preparedBy: string;
  preparedAt: string;
  handedOffBy?: string;
  handedOffAt?: string;
  requestReference?: string;
  externalReference?: string;
  externalStatus?: 'pending' | 'acknowledged' | 'failed';
  externalReceivedAt?: string;
  responseChecksum?: string;
  errorCode?: string;
  errorMessage?: string;
  version: number;
}

export interface ProviderReconciliationItem {
  submissionId: string;
  localStatus: ProviderSubmissionStatus;
  remoteStatus: 'pending' | 'acknowledged' | 'failed' | 'error';
  result: 'matched' | 'drift' | 'error';
  externalReference?: string;
  remotePayloadChecksum?: string;
  errorMessage?: string;
}

export interface ProviderReconciliationRun {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  connectorId: string;
  submissionIds: string[];
  items: ProviderReconciliationItem[];
  status: 'completed' | 'completed-with-exceptions' | 'failed';
  requestedBy: string;
  requestedAt: string;
  completedAt: string;
  checksum: string;
}

export interface ProviderPreflightEvidence {
  scope?: OperatingRecordScope;
  id: string;
  connectorId: string;
  method: 'GET' | 'POST';
  path: string;
  requestChecksum: string;
  responseChecksum?: string;
  responseByteLength?: number;
  statusCode?: number;
  status: ProviderPreflightStatus;
  evidenceReference: string;
  /** Credential generation used for this connectivity evidence. */
  credentialRevision?: number;
  errorMessage?: string;
  requestedBy: string;
  requestedAt: string;
  version: number;
}

/** Legacy records omit this field until their credentials are changed. */
export function providerCredentialRevision(connector: Pick<ProviderConnector, 'credentialRevision'>): number {
  return connector.credentialRevision ?? 0;
}

/**
 * Resolve credential lifecycle without exposing or reading secret material.
 * Invalid expiry/revocation timestamps fail closed as expired/revoked rather than
 * allowing an ambiguous record to reach a provider handoff.
 */
export function providerCredentialLifecycle(
  connector: Pick<ProviderConnector, 'credentialStatus' | 'credentialExpiresAt' | 'credentialRevokedAt'>,
  at = new Date().toISOString(),
): ProviderCredentialLifecycle {
  if (connector.credentialStatus !== 'configured') return 'missing';
  const atMs = Date.parse(at);
  if (!Number.isFinite(atMs)) throw new Error('Credential lifecycle evaluation requires a valid timestamp.');
  if (connector.credentialRevokedAt !== undefined) {
    const revokedMs = Date.parse(connector.credentialRevokedAt);
    if (!Number.isFinite(revokedMs) || revokedMs <= atMs) return 'revoked';
  }
  if (connector.credentialExpiresAt !== undefined) {
    const expiresMs = Date.parse(connector.credentialExpiresAt);
    if (!Number.isFinite(expiresMs) || expiresMs <= atMs) return 'expired';
  }
  return 'configured';
}

/** A passed replay is usable only for the credential generation that produced it. */
export function providerConformanceMatchesCredentialRevision(
  connector: Pick<ProviderConnector, 'credentialRevision'>,
  conformance: Pick<ProviderConformanceCase, 'credentialRevision'>,
): boolean {
  return connector.credentialRevision === undefined
    ? conformance.credentialRevision === undefined
    : conformance.credentialRevision === connector.credentialRevision;
}

/** A preflight response is not current certification evidence after rotation. */
export function providerPreflightMatchesCredentialRevision(
  connector: Pick<ProviderConnector, 'credentialRevision'>,
  evidence: Pick<ProviderPreflightEvidence, 'credentialRevision'>,
): boolean {
  return connector.credentialRevision === undefined
    ? evidence.credentialRevision === undefined
    : evidence.credentialRevision === connector.credentialRevision;
}

export interface ConfigureProviderConnectorInput {
  code: string;
  name: string;
  providerLegalName: string;
  domain: ProviderDomain;
  environment: ProviderConnector['environment'];
  baseUrl: string;
  statusPathTemplate: string;
  capabilities: ProviderCapability[];
  specificationVersion: string;
}

export interface ConfigureProviderCredentialsInput {
  connectorId: string;
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  bearerToken?: string;
  signingKey?: string;
}

export interface CreateProviderConformanceCaseInput {
  connectorId: string;
  capability?: ProviderCapability;
  paymentRail?: ProviderPaymentRail;
  deliveryChannel?: ProviderDeliveryChannel;
  suiteName: string;
  suiteVersion: string;
  scenario: string;
}

/** Plans one case for every capability declared by a provider connector. */
export interface PlanProviderConformancePackInput {
  connectorId: string;
  suiteName: string;
  suiteVersion: string;
}

export interface RecordProviderConformanceResultInput {
  id: string;
  result: Exclude<ProviderConformanceResult, 'planned'>;
  evidenceReference: string;
  resultChecksum: string;
  expectedVersion: number;
}

export interface ApproveProviderConnectorInput {
  id: string;
  expectedVersion: number;
}

export interface PrepareProviderSubmissionInput {
  connectorId: string;
  capability: ProviderCapability;
  sourceIds: string[];
}

export interface HandOffProviderSubmissionInput {
  id: string;
  requestReference: string;
  expectedVersion: number;
}

export interface RecordProviderSubmissionResponseInput {
  id: string;
  outcome: 'acknowledged' | 'failed';
  externalReference?: string;
  receivedAt?: string;
  responseChecksum?: string;
  errorCode?: string;
  errorMessage?: string;
  expectedVersion: number;
}

export interface RunProviderReconciliationInput {
  connectorId: string;
  submissionIds: string[];
}

export interface ExecuteProviderPreflightInput {
  connectorId: string;
  method: 'GET' | 'POST';
  path: string;
  payloadJson?: string;
  evidenceReference: string;
  expectedConnectorVersion: number;
}

export interface CanonicalProviderStatus {
  submissionId: string;
  remoteStatus: ProviderReconciliationItem['remoteStatus'];
  externalReference?: string;
  remotePayloadChecksum?: string;
  errorMessage?: string;
}
import type { OperatingRecordScope } from './revenue-ops-contracts';
