import { describe, expect, it } from 'vitest';
import { issueApiKey, verifyApiKey } from './api-key-security';

describe('API key security', () => {
  it('issues one secret and enforces scope plus exact legal-entity scope', () => {
    const issued = issueApiKey({ id: 'key-001', label: 'Warehouse reporting', companyId: 'company-india', branchId: 'branch-mumbai', scopes: ['inventory.read'], createdAt: '2026-07-17T10:00:00.000Z' });
    expect(issued.token).toContain('.');
    expect(issued.record.secretHash).not.toContain(issued.token);
    expect(() => verifyApiKey(issued.record, issued.token, 'inventory.read', 'company-india', 'branch-mumbai')).not.toThrow();
    expect(() => verifyApiKey(issued.record, issued.token, 'finance.read', 'company-india', 'branch-mumbai')).toThrow('scope');
    expect(() => verifyApiKey(issued.record, issued.token, 'inventory.read', 'company-india', 'branch-delhi')).toThrow('boundary');
  });
});
