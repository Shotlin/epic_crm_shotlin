import { describe, expect, it } from 'vitest';
import { createProviderCertificationPackage, validateProviderCertificationHandoff, validateProviderConformanceCase } from './provider-certification';

describe('provider certification handoff', () => {
  it('accepts a complete production certification pack', () => {
    expect(validateProviderCertificationHandoff({ domain: 'gsp-irp', providerName: 'Approved GSP', contractReference: 'CONTRACT-GSP-001', sandboxEvidenceReference: 'SANDBOX-GSP-001', productionApprovalReference: 'PROD-GSP-001', credentialOwner: 'finance-platform', independentApprover: 'auditor-1', testCaseReferences: ['GST-001', 'GST-002'] })).toEqual({ readyForSandbox: true, readyForProduction: true, missing: [] });
  });

  it('keeps production blocked when independent approval or evidence is absent', () => {
    const result = validateProviderCertificationHandoff({ domain: 'banking', providerName: 'Bank', contractReference: 'BANK-CONTRACT', sandboxEvidenceReference: 'BANK-SANDBOX', credentialOwner: 'treasury', testCaseReferences: ['PAY-001'] });
    expect(result.readyForSandbox).toBe(true);
    expect(result.readyForProduction).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(['independent approver', 'production approval reference']));
  });

  it('creates a deterministic redacted package without credential material', () => {
    const input = { domain: 'banking' as const, providerName: 'Bank', contractReference: 'BANK-CONTRACT', sandboxEvidenceReference: 'BANK-SANDBOX', credentialOwner: 'treasury', testCaseReferences: ['PAY-002', 'PAY-001'] };
    const first = createProviderCertificationPackage(input, 'owner-1', '2026-07-18T02:00:00.000Z');
    const second = createProviderCertificationPackage({ ...input, testCaseReferences: [...input.testCaseReferences].reverse() }, 'owner-1', '2026-07-18T02:00:00.000Z');
    expect(first.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first.checksum).toBe(second.checksum);
    expect(first.readyForSandbox).toBe(true);
    expect(first.readyForProduction).toBe(false);
    expect(JSON.stringify(first)).not.toContain('secret');
  });

  it('requires independently assessed, checksum-backed conformance evidence', () => {
    const base = { scope: { companyId: 'c1', branchId: 'b1' }, id: 'case-1', connectorId: 'connector-1', suiteName: 'Payments', suiteVersion: '1.0', scenario: 'status pull', environment: 'sandbox' as const, result: 'passed' as const, evidenceReference: 'sandbox://evidence-1', resultChecksum: 'a'.repeat(64), preparedBy: 'engineer-1', preparedAt: '2026-07-18T10:00:00.000Z', assessedBy: 'reviewer-1', assessedAt: '2026-07-18T11:00:00.000Z', version: 1 };
    expect(validateProviderConformanceCase(base, 'sandbox')).toEqual({ ready: true, missing: [] });
    expect(validateProviderConformanceCase({ ...base, result: 'planned', assessedBy: undefined }, 'sandbox')).toMatchObject({ ready: false, missing: expect.arrayContaining(['passed result', 'independent assessment']) });
    expect(validateProviderConformanceCase({ ...base, resultChecksum: 'bad' }, 'production').missing).toEqual(expect.arrayContaining(['environment match', 'result checksum']));
  });
});
