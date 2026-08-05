import { createHash } from 'node:crypto';
import type { ShadowImportEntity, ShadowImportPlan } from './shadow-import';
import type { ShadowImportScope } from './shadow-import-postgres-repository';
import { projectShadowImportReviewApprovalState, type ShadowImportReviewDecision } from './shadow-import-review';

export const shadowImportCutoverCapabilities = ['catalog', 'inventory', 'customers', 'orders', 'delivery', 'settlements', 'campaigns', 'storefront'] as const;
export type ShadowImportCutoverCapability = (typeof shadowImportCutoverCapabilities)[number];

const capabilityEntities: Record<ShadowImportCutoverCapability, readonly ShadowImportEntity[]> = {
  catalog: ['shop', 'catalog', 'variant'],
  inventory: ['inventory'],
  customers: ['customer', 'address'],
  orders: ['order', 'order-line', 'payment'],
  delivery: ['rider', 'delivery'],
  settlements: ['settlement', 'wallet-refund'],
  campaigns: ['campaign', 'review'],
  storefront: ['storefront-content'],
};

export interface ShadowImportCutoverAssessmentInput {
  plan: ShadowImportPlan;
  decisions: readonly ShadowImportReviewDecision[];
  scope: ShadowImportScope;
  capability: ShadowImportCutoverCapability;
  currentCredentialRevision?: number;
  /** Reference to the tested rollback runbook/window for this capability. */
  rollbackReference?: string;
}

export interface ShadowImportCutoverAssessment {
  source: 'bakaloo';
  scope: ShadowImportScope;
  capability: ShadowImportCutoverCapability;
  status: 'ready-for-parallel-run' | 'blocked';
  blockers: readonly string[];
  requiredEntities: readonly ShadowImportEntity[];
  planId: string;
  planChecksum: string;
  remoteRecordCount: number;
  localRecordCount: number;
  differenceCount: number;
  remoteChecksum: string;
  localChecksum: string;
  reconciliationChecksum: string;
  approvalDecisionId?: string;
  credentialRevision?: number;
  rollbackReference?: string;
  writeBackAllowed: false;
}

/**
 * Computes a truthful capability-level parallel-run gate. This is not a
 * migration or write path: a ready result only means a scoped, reconciled,
 * approved shadow projection may be compared with Bakaloo.
 */
export function assessShadowImportCutover(input: ShadowImportCutoverAssessmentInput): ShadowImportCutoverAssessment {
  const requiredEntities = capabilityEntities[input.capability];
  const blockers: string[] = [];
  const scope = normalizeScope(input.scope);
  const plan = input.plan;
  const accepted = input.decisions
    .filter((decision) => decision.batchId === plan.batch.id && decision.decision === 'accepted' && sameScope(decision.scope, scope))
    .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt))[0];

  if (typeof input.rollbackReference !== 'string' || input.rollbackReference.trim().length < 4) blockers.push('A tested rollback reference is required before parallel-run readiness can be granted.');

  if (plan.reconciliation.status !== 'reconciled') blockers.push('The shadow batch is not fully reconciled.');
  if (plan.conflicts.length > 0) blockers.push(`${plan.conflicts.length} shadow-import conflict(s) remain open.`);
  for (const entity of requiredEntities) {
    const reconciliation = plan.reconciliation.entities.find((candidate) => candidate.entity === entity);
    if (!reconciliation) blockers.push(`Missing reconciliation evidence for ${entity}.`);
    else if (reconciliation.status !== 'matched') blockers.push(`${entity} reconciliation still needs review.`);
    if ((reconciliation?.observed ?? 0) > 0 && !plan.externalIdMaps.some((map) => map.entity === entity)) blockers.push(`Missing identity maps for ${entity}.`);
  }

  if (!accepted) blockers.push('No scoped accepted review decision exists for this batch.');
  else if (accepted.planChecksum !== plan.batch.integrity.computedChecksum) blockers.push('The accepted decision checksum does not match the loaded plan.');

  const credentialRevision = plan.batch.credentialRevision;
  if (credentialRevision !== undefined) {
    if (input.currentCredentialRevision === undefined || input.currentCredentialRevision !== credentialRevision) blockers.push('The current source credential generation does not match this batch; pull a new snapshot.');
    if (accepted) {
      const projected = projectShadowImportReviewApprovalState(accepted, input.currentCredentialRevision);
      if (projected.approvalState !== 'active') blockers.push(`The accepted review evidence is ${projected.approvalState ?? 'unverified'} for the current credential generation.`);
    }
  }

  return {
    source: 'bakaloo',
    scope,
    capability: input.capability,
    status: blockers.length === 0 ? 'ready-for-parallel-run' : 'blocked',
    blockers,
    requiredEntities,
    planId: plan.batch.id,
    planChecksum: plan.batch.integrity.computedChecksum,
    remoteRecordCount: requiredEntities.reduce((total, entity) => total + (plan.reconciliation.entities.find((candidate) => candidate.entity === entity)?.observed ?? 0), 0),
    localRecordCount: plan.externalIdMaps.filter((map) => requiredEntities.includes(map.entity)).length,
    differenceCount: plan.conflicts.length + requiredEntities.reduce((total, entity) => {
      const result = plan.reconciliation.entities.find((candidate) => candidate.entity === entity);
      return total + (result?.variance === null || result?.variance === undefined ? (result ? 0 : 1) : Math.abs(result.variance));
    }, 0),
    remoteChecksum: plan.batch.integrity.computedChecksum,
    localChecksum: sha256(stableJson(plan.externalIdMaps.filter((map) => requiredEntities.includes(map.entity)).map(({ entity, externalId, epicBosId, recordChecksum }) => ({ entity, externalId, epicBosId, recordChecksum })).sort((left, right) => `${left.entity}:${left.externalId}`.localeCompare(`${right.entity}:${right.externalId}`)))),
    reconciliationChecksum: sha256(stableJson({ planId: plan.batch.id, capability: input.capability, scope, entities: plan.reconciliation.entities.filter((entity) => requiredEntities.includes(entity.entity)).sort((left, right) => left.entity.localeCompare(right.entity)) })),
    ...(accepted === undefined ? {} : { approvalDecisionId: accepted.id }),
    ...(credentialRevision === undefined ? {} : { credentialRevision }),
    ...(input.rollbackReference === undefined ? {} : { rollbackReference: input.rollbackReference.trim() }),
    writeBackAllowed: false,
  };
}

function normalizeScope(scope: ShadowImportScope): ShadowImportScope {
  return { tenantId: nonBlank(scope.tenantId, 'Tenant scope'), companyId: nonBlank(scope.companyId, 'Company scope'), branchId: nonBlank(scope.branchId, 'Branch scope') };
}

function sameScope(left: ShadowImportScope, right: ShadowImportScope): boolean {
  return left.tenantId === right.tenantId && left.companyId === right.companyId && left.branchId === right.branchId;
}

function nonBlank(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must not be blank.`);
  return value.trim();
}

function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function stableJson(value: unknown): string { return JSON.stringify(value, (_key, nested) => nested && typeof nested === 'object' && !Array.isArray(nested) ? Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))) : nested); }
