import type { OperatingRecordScope } from './revenue-ops-contracts';

/** Capabilities are cut over independently; a live Bakaloo storefront is never switched as one opaque block. */
export type RetailCutoverCapability = 'analytics' | 'catalog-inventory' | 'orders' | 'delivery' | 'finance';
export type RetailHubCutoverCapability = 'catalog' | 'inventory' | 'customers' | 'orders' | 'delivery' | 'settlements' | 'campaigns' | 'storefront';

export type RetailCutoverPhase = 'shadow' | 'parallel' | 'reconciled' | 'approved' | 'rollback-window' | 'retired' | 'rolled-back' | 'blocked';

export interface RetailCutoverReconciliation {
  remoteRecordCount: number;
  localRecordCount: number;
  differenceCount: number;
  remoteChecksum: string;
  localChecksum: string;
  reconciliationChecksum: string;
  completedAt?: string;
  completedBy?: string;
  evidenceReference?: string;
}

/** Read-only assessment emitted by the Retail Hub after its own scoped review and credential checks. */
export interface RetailHubCutoverAssessment {
  source: 'bakaloo';
  scope: { tenantId: string; companyId: string; branchId: string };
  capability: RetailHubCutoverCapability;
  status: 'ready-for-parallel-run' | 'blocked';
  blockers: readonly string[];
  requiredEntities: readonly string[];
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

/** Immutable transition evidence retained with a plan so a current phase never hides prior decisions. */
export interface RetailCutoverTransition {
  fromPhase: RetailCutoverPhase | 'new';
  toPhase: RetailCutoverPhase;
  decision: RetailCutoverDecision | 'create';
  fromVersion: number;
  toVersion: number;
  actorId: string;
  at: string;
  evidenceReference?: string;
  reason?: string;
}

export interface RetailCutoverPlan {
  id: string;
  capability: RetailCutoverCapability;
  sourceSystem: 'bakaloo';
  targetSystem: 'epic-bos';
  scope: OperatingRecordScope;
  phase: RetailCutoverPhase;
  version: number;
  baselineChecksum: string;
  reconciliation: RetailCutoverReconciliation;
  preparedBy: string;
  preparedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalEvidenceReference?: string;
  cutoverAt?: string;
  rollbackUntil?: string;
  rollbackReference?: string;
  retiredAt?: string;
  blockedReason?: string;
  transitions?: RetailCutoverTransition[];
}

export type RetailCutoverDecision = 'start-parallel' | 'reconciled' | 'approved' | 'cutover' | 'retire' | 'rollback' | 'block';

export interface CreateRetailCutoverPlanInput {
  id: string;
  capability: RetailCutoverCapability;
  scope: OperatingRecordScope;
  baselineChecksum: string;
  reconciliation: RetailCutoverReconciliation;
}

export interface CreateRetailCutoverPlanFromAssessmentInput {
  assessment: RetailHubCutoverAssessment;
  scope: OperatingRecordScope;
  evidenceReference: string;
}

/** Renderer-safe selector for a main-process GET of a Hub assessment. */
export interface FetchRetailHubCutoverAssessmentInput {
  baseUrl: string;
  batchId: string;
  capability: RetailHubCutoverCapability;
}

export interface AdvanceRetailCutoverInput {
  decision: RetailCutoverDecision;
  expectedVersion: number;
  evidenceReference?: string;
  rollbackWindowHours?: number;
  reason?: string;
}

export interface RetailCutoverReadiness {
  capability: RetailCutoverCapability;
  phase: RetailCutoverPhase;
  canAdvance: boolean;
  goNoGo: 'go' | 'hold';
  blockers: string[];
  nextAction: string;
}
