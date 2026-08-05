import { randomUUID } from 'node:crypto';
import type { ApiKeyRecord, IssuedApiKey, PublicApiScope } from '../shared/integration-contracts';
import type { BusinessDatabase } from './database';
import { issueApiKey } from './api-key-security';

const ALLOWED_SCOPES = new Set<PublicApiScope>([
  'crm.read', 'sales.read', 'finance.read', 'inventory.read', 'service.read', 'webhook.receive',
]);

export class ApiKeyStore {
  public constructor(private readonly database: BusinessDatabase) {}

  public issue(input: { label: string; companyId: string; branchId: string; scopes: PublicApiScope[] }, actorId: string): IssuedApiKey {
    if (input.scopes.some((scope) => !ALLOWED_SCOPES.has(scope))) throw new Error('API key includes an unsupported scope.');
    const issued = issueApiKey({ id: randomUUID(), ...input });
    this.database.createApiKey({ ...issued.record, createdBy: actorId, revokedBy: null, revokedAt: null });
    return issued;
  }

  public list(companyId: string, branchId: string): ApiKeyRecord[] {
    return this.database.listApiKeys(companyId, branchId).map((record) => ({
      id: record.id, label: record.label, companyId: record.companyId, branchId: record.branchId,
      scopes: record.scopes as PublicApiScope[], keyPrefix: record.keyPrefix, secretHash: record.secretHash,
      createdAt: record.createdAt, revokedAt: record.revokedAt ?? undefined,
    }));
  }

  public revoke(id: string, actorId: string): void {
    if (!this.database.revokeApiKey(id, actorId, new Date().toISOString())) throw new Error('API key is unavailable or already revoked.');
  }

  public get(id: string): ApiKeyRecord | null {
    const record = this.database.getApiKey(id);
    if (!record) return null;
    return { id: record.id, label: record.label, companyId: record.companyId, branchId: record.branchId,
      scopes: record.scopes as PublicApiScope[], keyPrefix: record.keyPrefix, secretHash: record.secretHash,
      createdAt: record.createdAt, revokedAt: record.revokedAt ?? undefined };
  }
}
