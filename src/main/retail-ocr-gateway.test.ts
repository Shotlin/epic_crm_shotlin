import { describe, expect, it } from 'vitest';
import { normalizeRetailOcrResponse } from './retail-ocr-gateway';

const response = (bodyText: string, statusCode = 200) => ({ statusCode, ok: statusCode >= 200 && statusCode < 300, bodyText, responseChecksum: 'd'.repeat(64), responseByteLength: Buffer.byteLength(bodyText, 'utf8') });

describe('retail OCR adapter response boundary', () => {
  it('normalizes a canonical supplier-invoice document', () => {
    const result = normalizeRetailOcrResponse(response(JSON.stringify({ status: 'completed', evidenceReference: 'OCR-REAL-001', providerReference: 'PROVIDER-1', document: { extractedInvoiceNumber: 'SUP-1001', extractedInvoiceDate: '2026-08-01', extractedSupplierGstin: '27ABCDE1234F1Z5', extractedTotalAmount: 118, extractionConfidence: 0.94, lines: [{ description: 'Assam tea', quantity: 1, unitPrice: 100, gstRate: 18, confidence: 0.98 }] } })));
    expect(result).toMatchObject({ status: 'completed', evidenceReference: 'OCR-REAL-001', document: { extractedInvoiceNumber: 'SUP-1001', extractedSupplierGstin: '27ABCDE1234F1Z5', extractionConfidence: 0.94 } });
  });

  it('fails closed for a successful response without a canonical document', () => {
    expect(() => normalizeRetailOcrResponse(response(JSON.stringify({ status: 'completed', evidenceReference: 'OCR-EMPTY-001' })))).toThrow(/document/i);
  });

  it('preserves a non-success transport response as an evidenced failure', () => {
    expect(normalizeRetailOcrResponse(response('provider unavailable', 503))).toMatchObject({ status: 'failed', evidenceReference: 'HTTP-503', responseChecksum: 'd'.repeat(64) });
  });
});
