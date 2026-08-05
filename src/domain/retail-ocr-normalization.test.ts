import { describe, expect, it } from 'vitest';
import { normalizeRetailPurchaseOcrExtraction } from './retail-ocr-normalization';

describe('India retail OCR normalization', () => {
  it('normalizes supplier identity and computes taxable value, GST, and total deterministically', () => {
    const result = normalizeRetailPurchaseOcrExtraction({ extractedInvoiceNumber: ' sup 100 ', extractedInvoiceDate: '2026-07-30', extractedSupplierGstin: '27ABCDE1234F1Z5', extractedTotalAmount: 118, extractionConfidence: 0.96, lines: [{ description: ' Assam   tea ', quantity: 10, unitPrice: 10, gstRate: 18, confidence: 0.95 }] });
    expect(result).toMatchObject({ extractedInvoiceNumber: 'SUP100', extractedSupplierGstin: '27ABCDE1234F1Z5', taxableValue: 100, taxValue: 18, calculatedTotal: 118, findings: [] });
    expect(result.lines[0]).toMatchObject({ description: 'Assam tea', unitPrice: 10 });
  });

  it('never hides low confidence, malformed GSTIN/date, or total drift', () => {
    const result = normalizeRetailPurchaseOcrExtraction({ extractedInvoiceDate: '2026-02-31', extractedSupplierGstin: 'BAD-GSTIN', extractedTotalAmount: 500, extractionConfidence: 0.6, lines: [{ description: 'Tea', quantity: 1, unitPrice: 100, gstRate: 5, confidence: 0.55 }] });
    expect(result.findings.map(({ kind }) => kind)).toEqual(expect.arrayContaining(['low-confidence', 'invalid-gstin', 'invoice-date', 'total-mismatch']));
    expect(result.calculatedTotal).toBe(105);
  });
});
