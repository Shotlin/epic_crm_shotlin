import { evaluateRetailHubDeploymentReadiness, type RetailHubDeploymentConfig } from './deployment-readiness';
import type { ShadowImportPlan } from './shadow-import';
import type { ShadowImportScope } from './shadow-import-postgres-repository';

export interface RetailHubShadowImportPreflightInput {
  deployment: RetailHubDeploymentConfig;
  scope: ShadowImportScope;
  /** A plan must be supplied; absence is always a hold. */
  plan?: ShadowImportPlan;
  /** The current server-owned source credential generation. */
  requiredCredentialRevision?: number;
}

export interface RetailHubShadowImportPreflightCheck {
  id: string;
  status: 'pass' | 'hold';
  summary: string;
}

export interface RetailHubShadowImportPreflight {
  status: 'ready-for-review' | 'hold';
  writeBackAllowed: false;
  checks: readonly RetailHubShadowImportPreflightCheck[];
  blockers: readonly string[];
}

/**
 * Validate the complete read-only import boundary before durable registration
 * or human review. This function never opens a connection, calls Bakaloo, or
 * mutates a plan. A ready result means only that the snapshot is safe to put
 * in the review queue; it does not authorize cutover or write-back.
 */
export function evaluateRetailHubShadowImportPreflight(
  input: RetailHubShadowImportPreflightInput,
): RetailHubShadowImportPreflight {
  const deployment = evaluateRetailHubDeploymentReadiness(input.deployment);
  const currentCredentialRevision = input.requiredCredentialRevision;
  const checks: RetailHubShadowImportPreflightCheck[] = [
    check('deployment-readiness', deployment.status === 'ready', 'Retail Hub deployment controls are ready for shadow-only operation.'),
    check('scope', validScope(input.scope), 'Tenant, company and branch scope are explicit and non-blank.'),
    check('plan-present', input.plan !== undefined, 'A checksummed shadow-import plan is supplied.'),
    check('plan-integrity', input.plan?.batch.integrity.checksumVerified === true && input.plan.batch.status === 'ready-for-review', 'The source checksum is verified and the batch is ready for review.'),
    check('reconciliation', input.plan?.reconciliation.status === 'reconciled', 'Declared and observed entity counts reconcile without variance.'),
    check('conflicts', input.plan !== undefined && input.plan.conflicts.length === 0, 'The snapshot contains no open mapping, duplicate, count or checksum conflicts.'),
    check('credential-generation', typeof currentCredentialRevision === 'number' && Number.isInteger(currentCredentialRevision) && currentCredentialRevision > 0 && input.plan?.batch.credentialRevision === currentCredentialRevision, 'The snapshot is bound to the current server-owned credential generation.'),
    check('write-back', input.plan?.batch.writeBackAllowed === false, 'The snapshot is explicitly shadow-read-only and cannot write to either system.'),
  ];
  const blockers = checks.filter(({ status }) => status === 'hold').map(({ id }) => id);
  return {
    status: blockers.length === 0 ? 'ready-for-review' : 'hold',
    writeBackAllowed: false,
    checks,
    blockers,
  };
}

function check(id: string, passed: boolean, summary: string): RetailHubShadowImportPreflightCheck {
  return { id, status: passed ? 'pass' : 'hold', summary };
}

function validScope(scope: ShadowImportScope): boolean {
  return Boolean(scope && nonBlank(scope.tenantId) && nonBlank(scope.companyId) && nonBlank(scope.branchId));
}

function nonBlank(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
