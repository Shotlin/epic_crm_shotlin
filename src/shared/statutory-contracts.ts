export type StatutoryAdapterCapability = 'submit-irn' | 'cancel-irn' | 'eway-bill' | 'cancel-ewb' | 'close-ewb' | 'extend-ewb' | 'consolidated-ewb' | 'status-pull' | 'signature-verify';

export interface StatutoryAdapter {
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  provider: string;
  environment: 'sandbox' | 'production';
  baseUrl: string;
  statusPathTemplate: string;
  healthPath: string;
  capabilities: StatutoryAdapterCapability[];
  credentialStatus: 'missing' | 'configured';
  credentialFingerprint?: string;
  /** Monotonic credential generation; rotations invalidate prepared evidence. */
  credentialRevision?: number;
  health: 'unknown' | 'healthy' | 'degraded' | 'offline';
  lastHealthAt?: string;
  lastPullAt?: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  version: number;
}

export interface StatutoryOperation {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  kind: 'cancel-irn' | 'cancel-ewb' | 'close-ewb' | 'extend-ewb';
  exchangeId: string;
  adapterId: string;
  /** Credential generation used when this operation was prepared. */
  credentialRevision?: number;
  reasonCode: string;
  remarks: string;
  effectiveDate?: string;
  vehicleNumber?: string;
  transportDocumentNumber?: string;
  transportMode?: 'road' | 'rail' | 'air' | 'ship' | 'in-transit';
  consignmentStatus?: 'movement' | 'transit';
  transitType?: 'road' | 'warehouse' | 'other';
  fromPlace?: string;
  fromStateCode?: string;
  fromPincode?: string;
  remainingDistanceKm?: number;
  requestedValidUntil?: string;
  status: 'prepared' | 'submitted' | 'acknowledged' | 'failed' | 'rejected';
  payloadChecksum: string;
  requestReference?: string;
  externalReference?: string;
  responseChecksum?: string;
  errorCode?: string;
  errorMessage?: string;
  preparedBy: string;
  preparedAt: string;
  submittedBy?: string;
  submittedAt?: string;
  acknowledgedAt?: string;
  version: number;
}

export interface ConsolidatedEwayBill {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  adapterId: string;
  /** Credential generation used when this bill was prepared. */
  credentialRevision?: number;
  gstRegistrationId: string;
  exchangeIds: string[];
  transportMode: 'road' | 'rail' | 'air' | 'ship';
  vehicleNumber?: string;
  transportDocumentNumber?: string;
  fromPlace: string;
  fromStateCode: string;
  status: 'prepared' | 'submitted' | 'acknowledged' | 'failed' | 'cancelled';
  payloadChecksum: string;
  requestReference?: string;
  externalNumber?: string;
  generatedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  preparedBy: string;
  preparedAt: string;
  submittedBy?: string;
  version: number;
}

export interface DigitalSignatureEvidence {
  scope?: OperatingRecordScope;
  id: string;
  exchangeId: string;
  adapterId?: string;
  artifact: 'signed-json' | 'signed-qr' | 'operator-document';
  algorithm: 'RSA-SHA256' | 'RSA-SHA512' | 'ECDSA-SHA256';
  certificateFingerprint: string;
  certificateSubject: string;
  certificateIssuer: string;
  certificateValidFrom: string;
  certificateValidTo: string;
  payloadChecksum: string;
  signatureChecksum: string;
  verified: boolean;
  verificationSource: 'local-certificate' | 'portal-adapter';
  verifiedBy: string;
  verifiedAt: string;
}

export interface PortalReconciliationItem {
  exchangeId: string;
  localStatus: string;
  remoteStatus: 'active' | 'cancelled' | 'closed' | 'not-found' | 'error';
  result: 'matched' | 'drift' | 'missing' | 'error';
  externalNumber?: string;
  acknowledgementNumber?: string;
  acknowledgedAt?: string;
  validUntil?: string;
  remotePayloadChecksum?: string;
  errorMessage?: string;
}

export interface PortalReconciliationRun {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  adapterId: string;
  requestedExchangeIds: string[];
  items: PortalReconciliationItem[];
  status: 'completed' | 'completed-with-exceptions' | 'failed';
  requestedBy: string;
  requestedAt: string;
  completedAt: string;
  checksum: string;
}

export interface ConfigureStatutoryAdapterInput {
  code: string;
  name: string;
  provider: string;
  environment: StatutoryAdapter['environment'];
  baseUrl: string;
  statusPathTemplate: string;
  healthPath: string;
  capabilities: StatutoryAdapterCapability[];
}

export interface ConfigureStatutoryCredentialsInput {
  adapterId: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  bearerToken?: string;
}

export function statutoryCredentialRevision(adapter: Pick<StatutoryAdapter, 'credentialRevision'>): number {
  return adapter.credentialRevision ?? 0;
}

/** Prepared statutory work may be submitted only with the same credential generation. */
export function statutoryEvidenceMatchesCredentialRevision(
  adapter: Pick<StatutoryAdapter, 'credentialRevision'>,
  evidence: Pick<StatutoryOperation | ConsolidatedEwayBill, 'credentialRevision'>,
): boolean {
  return adapter.credentialRevision === undefined
    ? evidence.credentialRevision === undefined
    : evidence.credentialRevision === adapter.credentialRevision;
}

export interface PrepareStatutoryOperationInput {
  kind: StatutoryOperation['kind'];
  exchangeId: string;
  adapterId: string;
  reasonCode: string;
  remarks: string;
  effectiveDate?: string;
  vehicleNumber?: string;
  transportDocumentNumber?: string;
  transportMode?: StatutoryOperation['transportMode'];
  consignmentStatus?: StatutoryOperation['consignmentStatus'];
  transitType?: StatutoryOperation['transitType'];
  fromPlace?: string;
  fromStateCode?: string;
  fromPincode?: string;
  remainingDistanceKm?: number;
  requestedValidUntil?: string;
}

export interface SubmitStatutoryOperationInput { id: string; requestReference: string; expectedVersion: number }
export interface RecordStatutoryOperationResponseInput { id: string; outcome: 'acknowledged' | 'failed'; externalReference?: string; acknowledgedAt?: string; validUntil?: string; errorCode?: string; errorMessage?: string; expectedVersion: number }

export interface PrepareConsolidatedEwayBillInput {
  adapterId: string;
  gstRegistrationId: string;
  exchangeIds: string[];
  transportMode: ConsolidatedEwayBill['transportMode'];
  vehicleNumber?: string;
  transportDocumentNumber?: string;
  fromPlace: string;
  fromStateCode: string;
}

export interface SubmitConsolidatedEwayBillInput { id: string; requestReference: string; expectedVersion: number }
export interface RecordConsolidatedEwayBillResponseInput { id: string; outcome: 'acknowledged' | 'failed'; externalNumber?: string; generatedAt?: string; errorCode?: string; errorMessage?: string; expectedVersion: number }

export interface VerifyStatutorySignatureInput {
  exchangeId: string;
  adapterId?: string;
  artifact: DigitalSignatureEvidence['artifact'];
  algorithm: DigitalSignatureEvidence['algorithm'];
  payloadBase64: string;
  signatureBase64: string;
  certificatePem: string;
}

export interface RunPortalReconciliationInput { adapterId: string; exchangeIds: string[] }

export interface CanonicalPortalStatus {
  exchangeId: string;
  remoteStatus: PortalReconciliationItem['remoteStatus'];
  externalNumber?: string;
  acknowledgementNumber?: string;
  acknowledgedAt?: string;
  validUntil?: string;
  remotePayloadChecksum?: string;
  errorMessage?: string;
}
import type { OperatingRecordScope } from './revenue-ops-contracts';
