import type { ProviderJsonResponse } from './provider-gateway-service';

export interface NormalizedRetailOcrDocument {
  extractedInvoiceNumber?: string;
  extractedInvoiceDate?: string;
  extractedSupplierGstin?: string;
  extractedTotalAmount?: number;
  extractionConfidence: number;
  lines: Array<{ description: string; quantity: number; unitPrice: number; gstRate: number; confidence: number }>;
}

export interface NormalizedRetailOcrResponse {
  status: 'completed' | 'completed-with-exceptions' | 'failed';
  evidenceReference: string;
  providerReference?: string;
  responseChecksum: string;
  responseByteLength: number;
  document?: NormalizedRetailOcrDocument;
}

const clean = (value: unknown, label: string, minimum = 2, maximum = 300): string => {
  if (typeof value !== 'string') throw new Error(`${label} is required in the canonical OCR response.`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
};

const boundedNumber = (value: unknown, label: string, minimum: number, maximum: number): number => {
  if (!Number.isFinite(value) || (value as number) < minimum || (value as number) > maximum) throw new Error(`${label} is outside the canonical OCR response bounds.`);
  return Math.round((value as number) * 100) / 100;
};

const businessDate = (value: unknown, label: string): string => {
  const date = clean(value, label, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`))) throw new Error(`${label} must be an ISO business date.`);
  return date;
};

function normalizeDocument(payload: Record<string, unknown>): NormalizedRetailOcrDocument | undefined {
  if (payload.document === undefined) return undefined;
  if (!payload.document || typeof payload.document !== 'object' || Array.isArray(payload.document)) throw new Error('Canonical OCR document must be an object.');
  const document = payload.document as Record<string, unknown>;
  if (!Array.isArray(document.lines) || document.lines.length < 1 || document.lines.length > 100) throw new Error('Canonical OCR document must contain 1-100 lines.');
  const lines = document.lines.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(`OCR line ${index + 1} must be an object.`);
    const line = candidate as Record<string, unknown>;
    return {
      description: clean(line.description, `OCR line ${index + 1} description`, 1, 180),
      quantity: boundedNumber(line.quantity, `OCR line ${index + 1} quantity`, Number.MIN_VALUE, 1_000_000),
      unitPrice: boundedNumber(line.unitPrice, `OCR line ${index + 1} unitPrice`, 0, 100_000_000),
      gstRate: boundedNumber(line.gstRate, `OCR line ${index + 1} gstRate`, 0, 100),
      confidence: boundedNumber(line.confidence, `OCR line ${index + 1} confidence`, 0, 1),
    };
  });
  const invoiceNumber = document.extractedInvoiceNumber === undefined ? undefined : clean(document.extractedInvoiceNumber, 'OCR invoice number', 2, 80);
  const invoiceDate = document.extractedInvoiceDate === undefined ? undefined : businessDate(document.extractedInvoiceDate, 'OCR invoice date');
  const supplierGstin = document.extractedSupplierGstin === undefined ? undefined : clean(document.extractedSupplierGstin, 'OCR supplier GSTIN', 15, 15).toUpperCase();
  if (supplierGstin && !/^[0-9A-Z]{15}$/.test(supplierGstin)) throw new Error('OCR supplier GSTIN must contain 15 alphanumeric characters.');
  return {
    extractedInvoiceNumber: invoiceNumber,
    extractedInvoiceDate: invoiceDate,
    extractedSupplierGstin: supplierGstin,
    extractedTotalAmount: document.extractedTotalAmount === undefined ? undefined : boundedNumber(document.extractedTotalAmount, 'OCR extracted total', 0, 1_000_000_000),
    extractionConfidence: boundedNumber(document.extractionConfidence, 'OCR extraction confidence', 0, 1),
    lines,
  };
}

/** Accepts only the adapter-neutral envelope; provider payloads must be translated by a certified adapter. */
export function normalizeRetailOcrResponse(response: ProviderJsonResponse): NormalizedRetailOcrResponse {
  if (!response.ok) return { status: 'failed', evidenceReference: `HTTP-${response.statusCode}`, responseChecksum: response.responseChecksum, responseByteLength: response.responseByteLength };
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(response.bodyText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Canonical OCR response must be a JSON object.');
    payload = parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Provider OCR response is not a canonical JSON envelope: ${error instanceof Error ? error.message : 'invalid JSON'}`);
  }
  const status = payload.status;
  if (status !== 'completed' && status !== 'completed-with-exceptions' && status !== 'failed') throw new Error('Provider OCR response must declare a canonical completed, completed-with-exceptions, or failed status.');
  const normalized: NormalizedRetailOcrResponse = {
    status,
    evidenceReference: clean(payload.evidenceReference ?? payload.providerReference ?? payload.reference, 'OCR provider evidence reference', 4, 300),
    providerReference: typeof payload.providerReference === 'string' ? payload.providerReference.trim() || undefined : undefined,
    responseChecksum: response.responseChecksum,
    responseByteLength: response.responseByteLength,
  };
  if (status !== 'failed') {
    normalized.document = normalizeDocument(payload);
    if (!normalized.document) throw new Error('A completed OCR response must include a canonical document.');
  }
  return normalized;
}
