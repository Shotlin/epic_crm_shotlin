import type { ApiKeyRecord, PublicApiScope } from '../shared/integration-contracts';
import { verifyApiKey } from './api-key-security';

export type PublicApiResource = 'crm' | 'sales' | 'finance' | 'inventory' | 'service' | 'webhook';

const scopeByResource: Record<PublicApiResource, PublicApiScope> = {
  crm: 'crm.read', sales: 'sales.read', finance: 'finance.read', inventory: 'inventory.read', service: 'service.read', webhook: 'webhook.receive',
};

export function requiredPublicApiScope(resource: PublicApiResource): PublicApiScope {
  return scopeByResource[resource];
}

export function authorizePublicApiRequest(input: {
  authorizationHeader: string | undefined;
  record: ApiKeyRecord;
  resource: PublicApiResource;
  companyId: string;
  branchId: string;
}): void {
  const header = input.authorizationHeader?.trim() ?? '';
  if (!header.startsWith('Bearer ')) throw new Error('Public API requires a Bearer API key.');
  const token = header.slice('Bearer '.length).trim();
  if (!token) throw new Error('Public API Bearer token is empty.');
  verifyApiKey(input.record, token, requiredPublicApiScope(input.resource), input.companyId, input.branchId);
}
