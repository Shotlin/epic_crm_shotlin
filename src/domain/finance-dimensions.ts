export type FinanceDimensionType = 'cost-center' | 'profit-center' | 'project' | 'department';

export interface FinanceDimensionValue { id: string; type: FinanceDimensionType; code: string; name: string; companyId: string; branchId: string; parentId?: string; active: boolean; }
export interface DimensionRequirement { accountCode: string; required: FinanceDimensionType[]; }
export interface DimensionAssignment { accountCode: string; values: Partial<Record<FinanceDimensionType, string>>; }
export interface DimensionCatalogSummary { values: number; activeValues: number; byType: Record<FinanceDimensionType, number>; duplicateCodes: string[]; }

const TYPES: FinanceDimensionType[] = ['cost-center', 'profit-center', 'project', 'department'];

export function validateDimensionCatalog(values: FinanceDimensionValue[]): DimensionCatalogSummary {
  const seen = new Set<string>(); const duplicateCodes: string[] = [];
  for (const value of values) { const key = `${value.companyId}/${value.branchId}/${value.type}/${value.code.trim().toUpperCase()}`; if (seen.has(key)) duplicateCodes.push(key); seen.add(key); if (!value.code.trim() || !value.name.trim()) throw new Error('Dimension code and name are required.'); }
  const byType = Object.fromEntries(TYPES.map((type) => [type, values.filter((value) => value.type === type && value.active).length])) as Record<FinanceDimensionType, number>;
  return { values: values.length, activeValues: values.filter(({ active }) => active).length, byType, duplicateCodes };
}

export function validateDimensionAssignment(assignment: DimensionAssignment, values: FinanceDimensionValue[], requirements: DimensionRequirement[], scope: { companyId: string; branchId: string }): void {
  const requirement = requirements.find(({ accountCode }) => accountCode === assignment.accountCode);
  for (const type of requirement?.required ?? []) { const id = assignment.values[type]; if (!id) throw new Error(`${type} is required for ${assignment.accountCode}.`); }
  for (const [type, id] of Object.entries(assignment.values) as Array<[FinanceDimensionType, string | undefined]>) {
    if (!id) continue;
    const value = values.find((candidate) => candidate.id === id);
    if (!value || value.type !== type || value.companyId !== scope.companyId || value.branchId !== scope.branchId || !value.active) throw new Error(`Dimension ${type}/${id} is outside the active scope or inactive.`);
  }
}

export function buildDefaultDimensionRequirements(): DimensionRequirement[] {
  return [
    { accountCode: 'sales-revenue', required: ['profit-center'] },
    { accountCode: 'payroll-expense', required: ['cost-center', 'department'] },
    { accountCode: 'inventory-asset', required: ['cost-center'] },
    { accountCode: 'project-revenue', required: ['project', 'profit-center'] },
  ];
}
