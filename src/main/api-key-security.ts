import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ApiKeyRecord, IssuedApiKey, PublicApiScope } from '../shared/integration-contracts';

const hash = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

export function issueApiKey(input: {
  id: string;
  label: string;
  companyId: string;
  branchId: string;
  scopes: PublicApiScope[];
  createdAt?: string;
}): IssuedApiKey {
  const scopes = [...new Set(input.scopes)].sort();
  if (!input.id || !input.companyId || !input.branchId || !input.label.trim() || !scopes.length) throw new Error('API key requires identity, scope, and a non-empty label.');
  const secret = randomBytes(32).toString('base64url');
  const keyPrefix = `epic_${randomBytes(6).toString('hex')}`;
  const token = `${keyPrefix}.${secret}`;
  return {
    token,
    record: {
      id: input.id,
      label: input.label.trim(),
      companyId: input.companyId,
      branchId: input.branchId,
      scopes,
      keyPrefix,
      secretHash: hash(token),
      createdAt: input.createdAt ?? new Date().toISOString(),
    },
  };
}

export function verifyApiKey(record: ApiKeyRecord, token: string, requiredScope: PublicApiScope, companyId: string, branchId: string): void {
  if (record.revokedAt) throw new Error('API key has been revoked.');
  if (record.companyId !== companyId || record.branchId !== branchId) throw new Error('API key is outside the requested company or branch boundary.');
  if (!record.scopes.includes(requiredScope)) throw new Error('API key does not grant the required scope.');
  const candidate = hash(token);
  if (!timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(record.secretHash, 'hex'))) throw new Error('API key is invalid.');
}
