import { describe, expect, it } from 'vitest';
import { checksumShadowImportEvidence, type ShadowImportEvidence } from './shadow-import';
import { createShadowImportRegistry } from './shadow-import-registry';
import { ingestShadowImportEvidenceJson, parseShadowImportEvidenceJson } from './shadow-import-ingest';

const evidence: ShadowImportEvidence = {
  batchId: 'bakaloo-export-001', source: 'bakaloo', observedAt: '2026-08-03T09:00:00.000Z',
  cursor: { value: 'orders:100', observedAt: '2026-08-03T09:00:00.000Z' },
  declaredCounts: { shop: 1, customer: 1, order: 1 },
  records: [
    { entity: 'shop', externalId: 'shop-1', epicBosId: 'branch-1', payload: { name: 'Bakaloo Store' } },
    { entity: 'customer', externalId: 'customer-1', epicBosId: 'party-1', payload: { name: 'Asha' } },
    { entity: 'order', externalId: 'order-1', epicBosId: 'sales-order-1', payload: { totalInr: 250 } },
  ], declaredChecksum: '',
};

function validJson(): string {
  const withChecksum = { ...evidence, declaredChecksum: checksumShadowImportEvidence(evidence) };
  return JSON.stringify({ format: 'epic-bos-shadow-import', version: 1, evidence: withChecksum });
}

describe('shadow import JSON ingestion boundary', () => {
  it('parses a versioned Bakaloo export and preserves read-only mode', () => {
    const parsed = parseShadowImportEvidenceJson(validJson());
    expect(parsed.source).toBe('bakaloo');
    expect(parsed.records).toHaveLength(3);
  });

  it('builds and registers a checksummed review plan without mutating source records', () => {
    const registry = createShadowImportRegistry();
    const plan = ingestShadowImportEvidenceJson(validJson(), registry);
    expect(plan.batch.mode).toBe('shadow-read-only');
    expect(plan.batch.writeBackAllowed).toBe(false);
    expect(plan.reconciliation.status).toBe('reconciled');
    expect(registry.getPlan('bakaloo-export-001')?.batch.integrity.checksumVerified).toBe(true);
  });

  it('rejects malformed envelopes and credential-like keys before registration', () => {
    expect(() => parseShadowImportEvidenceJson('{"format":"wrong","version":1,"evidence":{}}')).toThrow(/format/i);
    expect(() => parseShadowImportEvidenceJson(validJson().replace('"name":"Asha"', '"apiKey":"do-not-store"'))).toThrow(/credential|secret|token|key/i);
  });

  it('rejects a non-Bakaloo source instead of widening the import contract', () => {
    expect(() => parseShadowImportEvidenceJson(validJson().replace('"source":"bakaloo"', '"source":"unknown"'))).toThrow(/source/i);
  });
});
