import { createHash } from 'node:crypto';
import type { ExchangeCommitReceipt, ExchangeException, ExchangeExportPackage, ExchangeFieldMapping, ExchangePreview } from '../shared/integration-contracts';

const checksum = (raw: string): string => createHash('sha256').update(raw, 'utf8').digest('hex');

function parseCsv(raw: string): string[][] {
  return raw.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')));
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds a deterministic, scope-bound export artifact without performing I/O. */
export function createGovernedExchangeExport(input: {
  resource: string;
  fileName: string;
  companyId: string;
  branchId: string;
  fields: string[];
  records: ReadonlyArray<Record<string, unknown>>;
  actorId: string;
  generatedAt?: string;
}): ExchangeExportPackage {
  if (![input.resource, input.fileName, input.companyId, input.branchId, input.actorId].every((value) => value.trim())) throw new Error('Governed export requires resource, file, company, branch, and accountable actor.');
  const headers = [...new Set(input.fields.map((field) => field.trim()).filter(Boolean))];
  if (!headers.length) throw new Error('Governed export requires at least one field.');
  const records = [...input.records].sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? '')));
  const csv = [headers.map(csvCell).join(','), ...records.map((record) => headers.map((field) => csvCell(record[field])).join(','))].join('\n');
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('Governed export timestamp is invalid.');
  const unsigned = { resource: input.resource.trim(), fileName: input.fileName.trim(), companyId: input.companyId.trim(), branchId: input.branchId.trim(), generatedAt, generatedBy: input.actorId.trim(), headers, rows: records.length, csv };
  return { ...unsigned, checksum: createHash('sha256').update(JSON.stringify(unsigned), 'utf8').digest('hex') };
}

export function previewGovernedExchange(input: {
  resource: string;
  fileName: string;
  rawCsv: string;
  mappings: ExchangeFieldMapping[];
  requiredTargets?: string[];
  uniqueTarget?: string;
}): ExchangePreview {
  if (!input.resource.trim() || !input.fileName.trim()) throw new Error('Exchange resource and file name are required.');
  const rows = parseCsv(input.rawCsv);
  if (rows.length < 2 || !(rows[0]?.length)) throw new Error('Exchange file must include a header and at least one data row.');
  const headers = rows[0] ?? [];
  const exceptions: ExchangeException[] = [];
  const mappedSources = new Set(input.mappings.map(({ source }) => source));
  headers.filter((header) => !mappedSources.has(header)).forEach((header) => exceptions.push({ rowNumber: 1, field: header, code: 'unknown-column', message: `No governed mapping exists for column ${header}.` }));
  const required = new Set(input.requiredTargets ?? input.mappings.filter(({ required }) => required).map(({ target }) => target));
  const targetBySource = new Map(input.mappings.map(({ source, target }) => [source, target]));
  const uniqueValues = new Set<string>();
  let acceptedRows = 0;
  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    const values = new Map(headers.map((header, cellIndex) => [targetBySource.get(header) ?? header, cells[cellIndex] ?? '']));
    let rejected = false;
    required.forEach((field) => {
      if (!values.get(field)?.trim()) { rejected = true; exceptions.push({ rowNumber, field, code: 'missing-required', message: `Required field ${field} is empty.` }); }
    });
    if (input.uniqueTarget) {
      const value = values.get(input.uniqueTarget)?.trim() ?? '';
      if (value && uniqueValues.has(value)) { rejected = true; exceptions.push({ rowNumber, field: input.uniqueTarget, code: 'duplicate', message: `Duplicate ${input.uniqueTarget} value ${value}.` }); }
      if (value) uniqueValues.add(value);
    }
    if (rejected) return;
    acceptedRows += 1;
  });
  const rejectedRows = rows.length - 1 - acceptedRows;
  return { resource: input.resource.trim(), fileName: input.fileName.trim(), checksum: checksum(input.rawCsv), headers, acceptedRows, rejectedRows, exceptions, receiptStatus: exceptions.length ? 'blocked' : 'preview' };
}

export function commitGovernedExchange(input: { preview: ExchangePreview; expectedChecksum: string; actorId: string; committedAt?: string }): ExchangeCommitReceipt {
  if (input.preview.receiptStatus !== 'preview' || input.preview.exceptions.length || input.preview.rejectedRows) throw new Error('Exchange preview is blocked and cannot be committed.');
  if (!input.expectedChecksum || input.expectedChecksum !== input.preview.checksum) throw new Error('Exchange checksum does not match the approved preview.');
  if (!input.actorId.trim()) throw new Error('Exchange commit requires an accountable actor.');
  return { resource: input.preview.resource, fileName: input.preview.fileName, checksum: input.preview.checksum, committedAt: input.committedAt ?? new Date().toISOString(), committedBy: input.actorId, acceptedRows: input.preview.acceptedRows };
}
