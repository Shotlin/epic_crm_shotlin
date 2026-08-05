import { randomUUID } from 'node:crypto';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { CreateRetailCommerceCatalogMappingInput, DecideRetailCommerceCatalogMappingInput, DisableRetailCommerceCatalogMappingInput, RetailCommerceCatalogMapping } from '../shared/retail-commerce-contracts';

const mutate = (state: RevenueOpsState) => ({ ...structuredClone(state), revision: state.revision + 1 });
const scoped = (state: RevenueOpsState, record?: { scope?: RevenueOpsState['scope'] }) => {
  const scope = record?.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};
const remoteSku = (value: string) => {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{0,119}$/.test(normalized)) throw new Error('Remote SKU must be 1-120 letters, numbers, dots, slashes, hyphens, or underscores.');
  return normalized;
};
const title = (value?: string) => {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  if (!normalized) return undefined;
  if (normalized.length > 240) throw new Error('Remote title must be 240 characters or fewer.');
  return normalized;
};
const evidence = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 4 || normalized.length > 500) throw new Error('Mapping disable evidence must contain 4-500 characters.');
  return normalized;
};

export function createRetailCommerceCatalogMapping(
  state: RevenueOpsState,
  input: CreateRetailCommerceCatalogMappingInput,
  actorId: string,
  id = randomUUID(),
  now = new Date().toISOString(),
): RevenueOpsState {
  const connector = state.retailCommerceConnectors.find((item) => item.id === input.connectorId && scoped(state, item) && ['configured', 'certified'].includes(item.status) && item.credentialStatus === 'configured');
  if (!connector) throw new Error('A configured commerce connector is required for SKU mapping.');
  if (!connector.capabilities.some((capability) => ['catalog-push', 'inventory-push', 'order-pull'].includes(capability))) throw new Error('Connector does not support catalog or order identity mapping.');
  const variant = state.itemVariants.find((item) => item.id === input.itemVariantId && item.active && scoped(state, item));
  if (!variant) throw new Error('Mapping must reference an active item variant in the current branch.');
  const normalizedSku = remoteSku(input.remoteSku);
  if (state.retailCommerceCatalogMappings.some((mapping) => mapping.connectorId === connector.id && !['disabled', 'rejected'].includes(mapping.status) && mapping.remoteSku === normalizedSku && scoped(state, mapping))) throw new Error('This remote SKU already has a pending or active mapping for the connector.');
  if (state.retailCommerceCatalogMappings.some((mapping) => mapping.connectorId === connector.id && !['disabled', 'rejected'].includes(mapping.status) && mapping.itemVariantId === variant.id && scoped(state, mapping))) throw new Error('This local item variant already has a pending or active mapping for the connector.');
  const next = mutate(state);
  const mapping: RetailCommerceCatalogMapping = { id, connectorId: connector.id, remoteSku: normalizedSku, itemVariantId: variant.id, remoteTitle: title(input.remoteTitle), status: 'prepared', createdBy: actorId, createdAt: now, scope: structuredClone(next.scope), version: 1 };
  next.retailCommerceCatalogMappings.unshift(mapping);
  return next;
}

export function decideRetailCommerceCatalogMapping(state: RevenueOpsState, input: DecideRetailCommerceCatalogMappingInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const mapping = state.retailCommerceCatalogMappings.find((item) => item.id === input.id && item.status === 'prepared' && scoped(state, item));
  if (!mapping || mapping.version !== input.expectedVersion) throw new Error('Catalog mapping is stale or no longer awaiting approval.');
  if (mapping.createdBy === actorId) throw new Error('Mapping maker cannot approve the same mapping.');
  const approvalEvidence = evidence(input.evidence);
  const next = mutate(state);
  next.retailCommerceCatalogMappings = next.retailCommerceCatalogMappings.map((item) => item.id === mapping.id ? { ...item, status: input.decision === 'approved' ? 'active' as const : 'rejected' as const, approvedBy: actorId, approvedAt: now, approvalEvidence, version: item.version + 1 } : item);
  return next;
}

export function disableRetailCommerceCatalogMapping(state: RevenueOpsState, input: DisableRetailCommerceCatalogMappingInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const mapping = state.retailCommerceCatalogMappings.find((item) => item.id === input.id && item.status === 'active' && scoped(state, item));
  if (!mapping || mapping.version !== input.expectedVersion) throw new Error('Catalog mapping is stale or already disabled.');
  if (mapping.createdBy === actorId) throw new Error('Mapping maker cannot disable the same mapping.');
  const next = mutate(state);
  next.retailCommerceCatalogMappings = next.retailCommerceCatalogMappings.map((item) => item.id === mapping.id ? { ...item, status: 'disabled' as const, disabledBy: actorId, disabledAt: now, disableEvidence: evidence(input.evidence), version: item.version + 1 } : item);
  return next;
}

export function resolveRetailCommerceCatalogMapping(state: RevenueOpsState, connectorId: string, value: string): RetailCommerceCatalogMapping | undefined {
  const normalized = value.trim().toUpperCase();
  return state.retailCommerceCatalogMappings.find((mapping) => mapping.connectorId === connectorId && mapping.remoteSku === normalized && mapping.status === 'active' && scoped(state, mapping));
}

export function mappingForRetailCommerceVariant(state: RevenueOpsState, connectorId: string, itemVariantId: string): RetailCommerceCatalogMapping | undefined {
  return state.retailCommerceCatalogMappings.find((mapping) => mapping.connectorId === connectorId && mapping.itemVariantId === itemVariantId && mapping.status === 'active' && scoped(state, mapping));
}
