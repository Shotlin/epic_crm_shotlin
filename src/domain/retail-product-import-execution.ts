import { createHash } from 'node:crypto';
import type { CreateCatalogProductInput, RevenueOpsState } from '../shared/revenue-ops-contracts';
import { toIndiaBusinessDate } from '../shared/india-business-date';
import { createCatalogProduct } from './commercial';
import type { RetailProductImportError, RetailProductImportReport } from './retail-product-import';

export interface RetailProductImportPlanRow {
  rowNumber: number;
  sku: string;
  name: string;
  hsn: string;
  gstRate: number;
  uom: string;
  taxCodeId: string;
}

export interface RetailProductImportPlan {
  status: 'ready' | 'blocked';
  asOf: string;
  expectedRevision: number;
  rows: RetailProductImportPlanRow[];
  errors: RetailProductImportError[];
  checksum: string;
}

export interface ExecuteRetailProductImportInput {
  plan: RetailProductImportPlan;
  makerId: string;
  checkerId: string;
  evidenceReference: string;
  now?: string;
}

export interface RetailProductImportReceipt {
  importId: string;
  asOf: string;
  executedBy: string;
  approvedBy: string;
  sourceChecksum: string;
  productIds: string[];
  skuCount: number;
}

export interface RetailProductImportExecution {
  state: RevenueOpsState;
  receipt: RetailProductImportReceipt;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function inScope(state: RevenueOpsState, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

function effectiveOn(from: string, to: string | undefined, asOf: string): boolean {
  return from <= asOf && (!to || asOf <= to);
}

/** Builds a deterministic plan against a specific catalog revision; it has no side effects. */
export function prepareRetailProductImport(state: RevenueOpsState, report: RetailProductImportReport, now = new Date().toISOString()): RetailProductImportPlan {
  const asOf = toIndiaBusinessDate(now);
  const errors: RetailProductImportError[] = [...report.errors];
  const rows: RetailProductImportPlanRow[] = [];
  const seenSkus = new Set(state.products.filter((product) => product.active && inScope(state, product)).map((product) => product.sku.toUpperCase()));
  if (report.status !== 'valid') return { status: 'blocked', asOf, expectedRevision: state.revision, rows, errors, checksum: checksum({ asOf, rows, errors }) };
  for (const row of report.rows) {
    if (seenSkus.has(row.sku)) {
      errors.push({ rowNumber: row.rowNumber, field: 'sku', message: `SKU ${row.sku} already exists in the active catalog.` });
      continue;
    }
    const taxCode = state.taxCodes.find((candidate) => candidate.code === row.hsn && candidate.kind === 'HSN' && candidate.gstRate === row.gstRate && candidate.reviewStatus === 'verified' && effectiveOn(candidate.effectiveFrom, candidate.effectiveTo, asOf) && inScope(state, candidate));
    if (!taxCode) {
      errors.push({ rowNumber: row.rowNumber, field: 'taxCode', message: `No verified effective HSN ${row.hsn} at ${row.gstRate}% GST exists for ${asOf}. Review the GST/HSN master before importing.` });
      continue;
    }
    seenSkus.add(row.sku);
    rows.push({ rowNumber: row.rowNumber, sku: row.sku, name: row.name, hsn: row.hsn, gstRate: row.gstRate, uom: row.uom, taxCodeId: taxCode.id });
  }
  const planPayload = { asOf, expectedRevision: state.revision, rows, errors };
  return { status: errors.length ? 'blocked' : 'ready', ...planPayload, checksum: checksum(planPayload) };
}

/** Executes a ready plan atomically through the existing governed catalog command. */
export function executeRetailProductImport(state: RevenueOpsState, input: ExecuteRetailProductImportInput, id = crypto.randomUUID()): RetailProductImportExecution {
  const { plan, makerId, checkerId } = input;
  if (plan.status !== 'ready' || plan.errors.length) throw new Error('Only a clean, ready product import plan can execute.');
  if (state.revision !== plan.expectedRevision) throw new Error('The catalog changed after this import was prepared. Re-validate the pack.');
  if (!makerId.trim() || !checkerId.trim() || makerId === checkerId) throw new Error('Product import execution requires an independent maker and checker.');
  const evidenceReference = input.evidenceReference.trim();
  if (evidenceReference.length < 3 || evidenceReference.length > 240) throw new Error('Product import evidence reference must contain 3-240 characters.');
  const asOf = toIndiaBusinessDate(input.now ?? new Date().toISOString());
  if (asOf !== plan.asOf) throw new Error('The product import plan date changed. Re-validate the pack.');
  let next = state;
  const productIds: string[] = [];
  for (const row of plan.rows) {
    const productInput: CreateCatalogProductInput = { sku: row.sku, name: row.name, description: `Imported Indian retail catalog product ${row.sku}.`, kind: 'goods', uom: row.uom, taxCodeId: row.taxCodeId, effectiveFrom: plan.asOf };
    const productId = crypto.randomUUID();
    next = createCatalogProduct(next, productInput, productId);
    productIds.push(productId);
  }
  return { state: next, receipt: { importId: id, asOf: plan.asOf, executedBy: makerId.trim(), approvedBy: checkerId.trim(), sourceChecksum: plan.checksum, productIds, skuCount: productIds.length } };
}
