import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

export interface WarehouseScanResolution {
  barcode: string;
  status: 'matched' | 'unknown' | 'ambiguous';
  variantId?: string;
  variantName?: string;
  eligibleTaskIds: string[];
  message: string;
}

type ScanSource = Pick<RevenueOpsState, 'scope' | 'itemVariants' | 'warehouseTasks'>;
const normalize = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, '');
const sameScope = (state: ScanSource, record: { scope?: RevenueOpsState['scope'] }): boolean => {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};

/** Resolves a scanner value before any pick/putaway command is allowed to mutate state. */
export function resolveWarehouseScan(state: ScanSource, rawBarcode: string): WarehouseScanResolution {
  const barcode = normalize(rawBarcode);
  if (!barcode) return { barcode, status: 'unknown', eligibleTaskIds: [], message: 'Scan a barcode or SKU.' };
  const matches = state.itemVariants.filter((variant) => variant.active && sameScope(state, variant) && [variant.barcode, variant.sku].filter(Boolean).some((value) => normalize(value!) === barcode));
  if (!matches.length) return { barcode, status: 'unknown', eligibleTaskIds: [], message: `No in-scope item variant matches ${barcode}.` };
  if (matches.length > 1) return { barcode, status: 'ambiguous', eligibleTaskIds: [], message: `${matches.length} active variants match ${barcode}; resolve the duplicate barcode before moving stock.` };
  const variant = matches[0]!;
  const eligibleTaskIds = state.warehouseTasks.filter((task) => task.itemVariantId === variant.id && sameScope(state, task) && ['planned', 'in-progress'].includes(task.status)).map(({ id }) => id);
  return { barcode, status: 'matched', variantId: variant.id, variantName: variant.name, eligibleTaskIds, message: eligibleTaskIds.length ? `${variant.name} matched; ${eligibleTaskIds.length} task${eligibleTaskIds.length === 1 ? '' : 's'} ready.` : `${variant.name} matched; no open pick or putaway task is waiting.` };
}
