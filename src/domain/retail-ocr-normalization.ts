import type { RetailPurchaseOcrLine } from '../shared/retail-commerce-contracts';

export type RetailOcrNormalizationFindingKind = 'low-confidence' | 'invalid-gstin' | 'invoice-date' | 'total-mismatch';

export interface RetailOcrNormalizationFinding {
  kind: RetailOcrNormalizationFindingKind;
  severity: 'medium' | 'high' | 'critical';
  message: string;
  lineIndex?: number;
}

export interface RetailOcrNormalizationInput {
  extractedInvoiceNumber?: string;
  extractedInvoiceDate?: string;
  extractedSupplierGstin?: string;
  extractedTotalAmount?: number;
  extractionConfidence: number;
  lines: Array<Pick<RetailPurchaseOcrLine, 'description' | 'quantity' | 'unitPrice' | 'gstRate' | 'confidence'> & Partial<Pick<RetailPurchaseOcrLine, 'itemVariantId' | 'purchaseOrderLineId'>>>;
}

export interface RetailOcrNormalizationResult {
  extractedInvoiceNumber?: string;
  extractedInvoiceDate?: string;
  extractedSupplierGstin?: string;
  extractedTotalAmount?: number;
  extractionConfidence: number;
  lines: Array<Pick<RetailPurchaseOcrLine, 'description' | 'quantity' | 'unitPrice' | 'gstRate' | 'confidence'> & Partial<Pick<RetailPurchaseOcrLine, 'itemVariantId' | 'purchaseOrderLineId'>>>;
  taxableValue: number;
  taxValue: number;
  calculatedTotal: number;
  findings: RetailOcrNormalizationFinding[];
}

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

function validDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/**
 * Normalizes provider/manual OCR output into an India-first, auditable shape.
 * It never silently repairs a financial discrepancy: all material repairs or
 * disagreements become explicit findings for the existing exception queue.
 */
export function normalizeRetailPurchaseOcrExtraction(input: RetailOcrNormalizationInput): RetailOcrNormalizationResult {
  const invoiceNumber = input.extractedInvoiceNumber?.trim().replace(/\s+/g, '').toUpperCase() || undefined;
  const invoiceDate = input.extractedInvoiceDate?.trim() || undefined;
  const supplierGstin = input.extractedSupplierGstin?.replace(/\s+/g, '').toUpperCase() || undefined;
  const extractionConfidence = Number(input.extractionConfidence);
  const lines = input.lines.map((line) => ({
    ...line,
    description: line.description.trim().replace(/\s+/g, ' '),
    quantity: Number(line.quantity),
    unitPrice: money(Number(line.unitPrice)),
    gstRate: Number(line.gstRate),
    confidence: Number(line.confidence),
  }));
  const taxableValue = money(lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0));
  const taxValue = money(lines.reduce((total, line) => total + line.quantity * line.unitPrice * line.gstRate / 100, 0));
  const calculatedTotal = money(taxableValue + taxValue);
  const findings: RetailOcrNormalizationFinding[] = [];
  if (!Number.isFinite(extractionConfidence) || extractionConfidence < 0.85) findings.push({ kind: 'low-confidence', severity: 'medium', message: `Document extraction confidence is ${Math.round((Number.isFinite(extractionConfidence) ? extractionConfidence : 0) * 100)}%; independent source review is required.` });
  lines.forEach((line, index) => { if (!Number.isFinite(line.confidence) || line.confidence < 0.85) findings.push({ kind: 'low-confidence', severity: 'medium', lineIndex: index, message: `Line ${index + 1} extraction confidence is ${Math.round((Number.isFinite(line.confidence) ? line.confidence : 0) * 100)}%; compare it to the source invoice.` }); });
  if (supplierGstin && !GSTIN_PATTERN.test(supplierGstin)) findings.push({ kind: 'invalid-gstin', severity: 'critical', message: `Extracted supplier GSTIN ${supplierGstin} does not match the official 15-character structure.` });
  if (invoiceDate && !validDate(invoiceDate)) findings.push({ kind: 'invoice-date', severity: 'high', message: `Extracted invoice date ${invoiceDate} is not a valid YYYY-MM-DD calendar date.` });
  if (input.extractedTotalAmount !== undefined && Number.isFinite(input.extractedTotalAmount) && Math.abs(money(input.extractedTotalAmount) - calculatedTotal) > 1) findings.push({ kind: 'total-mismatch', severity: 'critical', message: `Extracted total ₹${money(input.extractedTotalAmount).toFixed(2)} differs from recalculated lines ₹${calculatedTotal.toFixed(2)}.` });
  return { extractedInvoiceNumber: invoiceNumber, extractedInvoiceDate: invoiceDate, extractedSupplierGstin: supplierGstin, extractedTotalAmount: input.extractedTotalAmount === undefined ? undefined : money(Number(input.extractedTotalAmount)), extractionConfidence, lines, taxableValue, taxValue, calculatedTotal, findings };
}
