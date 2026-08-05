export type PublicApiScope =
  | 'crm.read'
  | 'sales.read'
  | 'finance.read'
  | 'inventory.read'
  | 'service.read'
  | 'webhook.receive';

export interface SignedWebhookEnvelope {
  id: string;
  event: string;
  occurredAt: string;
  apiVersion: '2026-07-17';
  companyId: string;
  branchId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  signature: string;
}

export interface VerifyWebhookInput {
  envelope: SignedWebhookEnvelope;
  secret: string;
  now?: string;
  maxAgeSeconds?: number;
  seenIdempotencyKeys?: ReadonlySet<string>;
}

export interface ApiKeyRecord {
  id: string;
  label: string;
  companyId: string;
  branchId: string;
  scopes: PublicApiScope[];
  keyPrefix: string;
  secretHash: string;
  createdAt: string;
  revokedAt?: string;
}

export interface IssuedApiKey {
  record: ApiKeyRecord;
  token: string;
}

export interface IssueApiKeyInput {
  label: string;
  companyId: string;
  branchId: string;
  scopes: PublicApiScope[];
}

export interface RevokeApiKeyInput {
  id: string;
}

export interface ExchangeFieldMapping {
  source: string;
  target: string;
  required?: boolean;
}

export interface ExchangeException {
  rowNumber: number;
  field?: string;
  code: 'missing-required' | 'duplicate' | 'unknown-column' | 'invalid-format';
  message: string;
}

export interface ExchangePreview {
  resource: string;
  fileName: string;
  checksum: string;
  headers: string[];
  acceptedRows: number;
  rejectedRows: number;
  exceptions: ExchangeException[];
  receiptStatus: 'preview' | 'blocked';
}

export interface ExchangeCommitReceipt {
  resource: string;
  fileName: string;
  checksum: string;
  committedAt: string;
  committedBy: string;
  acceptedRows: number;
}

export interface ExchangeExportPackage {
  resource: string;
  fileName: string;
  companyId: string;
  branchId: string;
  generatedAt: string;
  generatedBy: string;
  headers: string[];
  rows: number;
  csv: string;
  checksum: string;
}

export interface GovernedExportReceipt {
  resource: string;
  filePath: string;
  checksum: string;
  rows: number;
  exportedAt: string;
}
