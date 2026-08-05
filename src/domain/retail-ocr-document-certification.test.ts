import { describe, expect, it } from 'vitest';
import { computeRetailOcrDocumentCertification } from './retail-reports';
import type { RetailOcrProviderProfile } from '../shared/retail-commerce-contracts';

const base: RetailOcrProviderProfile = {
  id: 'ocr-1', code: 'OCR-INDIA', name: 'India OCR adapter', mode: 'api', baseUrl: 'https://ocr.example', status: 'certified', credentialStatus: 'configured',
  supportedDocumentKinds: ['supplier-invoice', 'credit-note'], createdBy: 'maker', createdAt: '2026-08-01T00:00:00.000Z', version: 3,
};

describe('retail OCR document certification', () => {
  it('requires explicit evidence for every declared document kind', () => {
    const report = computeRetailOcrDocumentCertification({ providers: [base] });
    expect(report).toMatchObject({ providerCount: 1, kindCount: 2, readyCount: 0, evidenceGaps: 2, actionRequired: true });
    expect(report.rows.find((row) => row.documentKind === 'credit-note')).toMatchObject({ status: 'needs-evidence', actionRequired: true });
  });

  it('marks only independently assessed, checksummed kind evidence ready', () => {
    const report = computeRetailOcrDocumentCertification({ providers: [{
      ...base,
      testEvidenceByDocumentKind: {
        'supplier-invoice': { evidence: 'PROVIDER-INVOICE-REPLAY-1', testedAt: '2026-08-01T01:00:00.000Z', testedBy: 'checker', checksum: 'b'.repeat(64) },
        'credit-note': { evidence: 'PROVIDER-CREDIT-REPLAY-1', testedAt: '2026-08-01T01:05:00.000Z', testedBy: 'checker', checksum: 'c'.repeat(64) },
      },
    }] });
    expect(report).toMatchObject({ readyCount: 2, evidenceGaps: 0, actionRequired: false });
    expect(report.rows.every((row) => row.status === 'ready')).toBe(true);
  });

  it('does not let an old credential generation certify a newly rotated OCR adapter', () => {
    const report = computeRetailOcrDocumentCertification({ providers: [{
      ...base,
      credentialRevision: 2,
      testEvidenceByDocumentKind: {
        'supplier-invoice': { evidence: 'OCR-REPLAY-V1', testedAt: '2026-08-01T01:00:00.000Z', testedBy: 'checker', checksum: 'b'.repeat(64), credentialRevision: 1 },
        'credit-note': { evidence: 'OCR-CREDIT-V1', testedAt: '2026-08-01T01:05:00.000Z', testedBy: 'checker', checksum: 'c'.repeat(64), credentialRevision: 1 },
      },
    }] });
    expect(report).toMatchObject({ readyCount: 0, evidenceGaps: 2, actionRequired: true });
    expect(report.rows.every((row) => row.status === 'needs-evidence')).toBe(true);
  });
});
