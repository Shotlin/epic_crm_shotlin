import { describe, expect, it } from 'vitest';
import { buildDefaultDimensionRequirements, validateDimensionAssignment, validateDimensionCatalog, type FinanceDimensionValue } from './finance-dimensions';

const values: FinanceDimensionValue[] = [
  { id: 'cc-1', type: 'cost-center', code: 'CC-1', name: 'Operations', companyId: 'co-1', branchId: 'br-1', active: true },
  { id: 'pc-1', type: 'profit-center', code: 'PC-1', name: 'Sales', companyId: 'co-1', branchId: 'br-1', active: true },
  { id: 'dept-1', type: 'department', code: 'DEPT-1', name: 'People', companyId: 'co-1', branchId: 'br-1', active: true },
];

describe('finance dimension controls', () => {
  it('summarizes active masters and detects duplicate scoped codes', () => {
    const summary = validateDimensionCatalog([...values, { id: 'cc-duplicate', type: 'cost-center', code: 'CC-1', name: 'Operations copy', companyId: 'co-1', branchId: 'br-1', active: true }]);
    expect(summary).toMatchObject({ values: 4, activeValues: 4, duplicateCodes: ['co-1/br-1/cost-center/CC-1'] });
  });
  it('requires configured dimensions and refuses cross-scope/inactive values', () => {
    const requirements = buildDefaultDimensionRequirements();
    expect(() => validateDimensionAssignment({ accountCode: 'payroll-expense', values: { 'cost-center': 'cc-1' } }, values, requirements, { companyId: 'co-1', branchId: 'br-1' })).toThrow('department is required');
    expect(() => validateDimensionAssignment({ accountCode: 'sales-revenue', values: { 'profit-center': 'pc-1' } }, values, requirements, { companyId: 'co-2', branchId: 'br-1' })).toThrow('outside');
    expect(() => validateDimensionAssignment({ accountCode: 'sales-revenue', values: { 'profit-center': 'pc-1' } }, values, requirements, { companyId: 'co-1', branchId: 'br-1' })).not.toThrow();
  });
});
