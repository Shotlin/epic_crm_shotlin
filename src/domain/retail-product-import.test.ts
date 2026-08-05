import { describe, expect, it } from 'vitest';
import { validateRetailProductImport } from './retail-product-import';
import { executeRetailProductImport, prepareRetailProductImport } from './retail-product-import-execution';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createGstTaxCode } from './commercial';

describe('retail product import validation', () => {
  it('accepts an Indian retail product/GST/HSN pack and normalizes safe identifiers', () => {
    const report = validateRetailProductImport('sku,name,hsn,gstRate,uom\nrice-5kg,"Basmati Rice, Premium",1006,5,kg\noil-1l,Sunflower Oil,1512,5,L');
    expect(report).toMatchObject({ status: 'valid', rowCount: 2, validRowCount: 2, errors: [] });
    expect(report.rows[0]).toMatchObject({ sku: 'RICE-5KG', name: 'Basmati Rice, Premium', hsn: '1006', gstRate: 5, uom: 'KG' });
  });

  it('rejects malformed headers, duplicate SKU, invalid HSN/GST/UOM and reports row evidence', () => {
    const report = validateRetailProductImport('sku,name,hsn,gstRate,uom\nRICE-5KG,Rice,1006,5,KG\nRICE-5KG,Rice duplicate,1006,5,KG\nBAD SKU,X,12,140,kg!');
    expect(report.status).toBe('invalid');
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 3, field: 'sku' }),
      expect.objectContaining({ rowNumber: 4, field: 'sku' }),
      expect.objectContaining({ rowNumber: 4, field: 'hsn' }),
      expect.objectContaining({ rowNumber: 4, field: 'gstRate' }),
      expect.objectContaining({ rowNumber: 4, field: 'uom' }),
    ]));
  });

  it('blocks an SKU that already exists in the governed catalog', () => {
    const report = validateRetailProductImport('sku,name,hsn,gstRate,uom\nRICE-5KG,Rice,1006,5,KG', ['rice-5kg']);
    expect(report.status).toBe('invalid');
    expect(report.errors[0]).toMatchObject({ rowNumber: 2, field: 'sku' });
  });

  it('blocks a clean CSV until a verified effective HSN/GST master exists', () => {
    const state = createInitialRevenueOpsState();
    const report = validateRetailProductImport('sku,name,hsn,gstRate,uom\nRICE-5KG,Rice,1006,5,KG');
    const plan = prepareRetailProductImport(state, report, '2026-07-31T05:00:00.000Z');
    expect(plan.status).toBe('blocked');
    expect(plan.errors[0]).toMatchObject({ rowNumber: 2, field: 'taxCode' });
    expect(state.products.some(({ sku }) => sku === 'RICE-5KG')).toBe(false);
  });

  it('executes an approved plan atomically and rejects self-approval or stale revisions', () => {
    const initial = createInitialRevenueOpsState();
    const withTax = createGstTaxCode(initial, { code: '1006', kind: 'HSN', description: 'Rice and rice products', gstRate: 5, cessRate: 0, effectiveFrom: '2026-04-01', sourceLabel: 'GST Portal HSN master review', sourceUrl: 'https://services.gst.gov.in/services/searchhsnsac', reviewStatus: 'verified' }, 'tax-rice');
    const report = validateRetailProductImport('sku,name,hsn,gstRate,uom\nRICE-5KG,Basmati Rice,1006,5,KG');
    const plan = prepareRetailProductImport(withTax, report, '2026-07-31T05:00:00.000Z');
    expect(plan).toMatchObject({ status: 'ready', rows: [{ sku: 'RICE-5KG', taxCodeId: 'tax-rice' }] });
    expect(() => executeRetailProductImport(withTax, { plan, makerId: 'maker', checkerId: 'maker', evidenceReference: 'approved pack' }, '00000000-0000-4000-8000-000000000001')).toThrow('independent');
    const executed = executeRetailProductImport(withTax, { plan, makerId: 'maker', checkerId: 'checker', evidenceReference: 'approved pack #RICE-001', now: '2026-07-31T05:00:00.000Z' }, '00000000-0000-4000-8000-000000000002');
    expect(executed.state.products.find(({ sku }) => sku === 'RICE-5KG')).toMatchObject({ kind: 'goods', taxCodeId: 'tax-rice', uom: 'KG' });
    expect(executed.receipt).toMatchObject({ importId: '00000000-0000-4000-8000-000000000002', executedBy: 'maker', approvedBy: 'checker', skuCount: 1 });
    expect(() => executeRetailProductImport({ ...withTax, revision: withTax.revision + 1 }, { plan, makerId: 'maker', checkerId: 'checker', evidenceReference: 'approved pack #RICE-001', now: '2026-07-31T05:00:00.000Z' })).toThrow('catalog changed');
  });
});
