import { describe, expect, it } from 'vitest';
import { issueApiKey } from './api-key-security';
import { authorizePublicApiRequest, requiredPublicApiScope } from './public-api-auth';

describe('public API authorization boundary', () => {
  it('maps resources to least privilege scopes and accepts a valid bearer key', () => {
    const issued = issueApiKey({ id: 'key-1', label: 'CRM sync', companyId: 'company-1', branchId: 'branch-1', scopes: ['crm.read'] });
    expect(requiredPublicApiScope('crm')).toBe('crm.read');
    expect(() => authorizePublicApiRequest({ authorizationHeader: `Bearer ${issued.token}`, record: issued.record, resource: 'crm', companyId: 'company-1', branchId: 'branch-1' })).not.toThrow();
  });

  it('rejects missing bearer headers, wrong scope, and cross-branch access', () => {
    const issued = issueApiKey({ id: 'key-2', label: 'Sales sync', companyId: 'company-1', branchId: 'branch-1', scopes: ['sales.read'] });
    const base = { record: issued.record, companyId: 'company-1', branchId: 'branch-1' } as const;
    expect(() => authorizePublicApiRequest({ ...base, authorizationHeader: undefined, resource: 'sales' })).toThrow('Bearer');
    expect(() => authorizePublicApiRequest({ ...base, authorizationHeader: `Bearer ${issued.token}`, resource: 'finance' })).toThrow('required scope');
    expect(() => authorizePublicApiRequest({ ...base, authorizationHeader: `Bearer ${issued.token}`, resource: 'sales', branchId: 'branch-2' })).toThrow('boundary');
  });
});
