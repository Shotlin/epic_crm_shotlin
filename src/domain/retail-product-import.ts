export interface RetailProductImportRow {
  rowNumber: number;
  sku: string;
  name: string;
  hsn: string;
  gstRate: number;
  uom: string;
  errors: string[];
}

export interface RetailProductImportError {
  rowNumber: number;
  field?: 'sku' | 'name' | 'hsn' | 'gstRate' | 'uom' | 'taxCode' | 'header' | 'csv';
  message: string;
}

export interface RetailProductImportReport {
  status: 'valid' | 'invalid';
  headers: string[];
  rowCount: number;
  validRowCount: number;
  rows: RetailProductImportRow[];
  errors: RetailProductImportError[];
}

const REQUIRED_HEADERS = ['sku', 'name', 'hsn', 'gstRate', 'uom'] as const;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,39}$/;
const UOM_PATTERN = /^[A-Z][A-Z0-9_-]{0,11}$/;

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      fields.push(current.trim());
      current = '';
    } else current += character;
  }
  fields.push(current.trim());
  return fields;
}

function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, '').trim().replace(/\s+/g, '').toLowerCase();
}

/** Validates, but deliberately does not persist, an Indian retail product/GST/HSN CSV pack. */
export function validateRetailProductImport(csv: string, existingSkus: readonly string[] = []): RetailProductImportReport {
  const sourceLines = csv.replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim().length > 0);
  if (!sourceLines.length) return { status: 'invalid', headers: [], rowCount: 0, validRowCount: 0, rows: [], errors: [{ rowNumber: 1, field: 'csv', message: 'CSV content is empty.' }] };
  const headers = parseCsvLine(sourceLines[0]!).map(normalizeHeader);
  const errors: RetailProductImportError[] = [];
  const expected = REQUIRED_HEADERS.map(normalizeHeader);
  if (headers.length !== expected.length || headers.some((header, index) => header !== expected[index])) {
    errors.push({ rowNumber: 1, field: 'header', message: `Header must be exactly: ${REQUIRED_HEADERS.join(',')}.` });
  }
  const position = new Map(headers.map((header, index) => [header, index]));
  const seenSkus = new Set(existingSkus.map((sku) => sku.trim().toUpperCase()));
  const rows: RetailProductImportRow[] = [];
  sourceLines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const fields = parseCsvLine(line);
    const value = (header: string) => fields[position.get(header) ?? -1]?.trim() ?? '';
    const sku = value('sku').toUpperCase();
    const name = value('name');
    const hsn = value('hsn');
    const gstText = value('gstrate');
    const gstRate = Number(gstText);
    const uom = value('uom').toUpperCase();
    const rowErrors: string[] = [];
    const add = (field: RetailProductImportError['field'], message: string) => { rowErrors.push(message); errors.push({ rowNumber, field, message }); };
    if (!SKU_PATTERN.test(sku)) add('sku', 'SKU must be 2-40 uppercase letters, digits, dots, slashes, hyphens, or underscores.');
    if (seenSkus.has(sku)) add('sku', `SKU ${sku || '(blank)'} duplicates an existing or earlier row.`);
    else if (sku) seenSkus.add(sku);
    if (name.length < 2 || name.length > 180) add('name', 'Product name must contain 2-180 characters.');
    if (!/^\d{4,8}$/.test(hsn)) add('hsn', 'HSN must contain 4-8 digits.');
    if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) add('gstRate', 'GST rate must be a number from 0 to 100.');
    if (!UOM_PATTERN.test(uom)) add('uom', 'UOM must be an uppercase code of 1-12 letters, digits, hyphens, or underscores.');
    rows.push({ rowNumber, sku, name, hsn, gstRate: Number.isFinite(gstRate) ? gstRate : 0, uom, errors: rowErrors });
  });
  const validRowCount = rows.filter((row) => row.errors.length === 0).length;
  return { status: errors.length ? 'invalid' : 'valid', headers, rowCount: rows.length, validRowCount, rows, errors };
}
