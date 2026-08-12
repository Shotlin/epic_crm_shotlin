import {
  app,
  BrowserWindow,
  dialog,
  ipcMain as electronIpcMain,
  type IpcMain,
  type IpcMainInvokeEvent,
} from 'electron';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { CrmStore } from './crm-store';
import type { KernelStore } from './kernel-store';
import type { AuthService } from './auth-service';
import type { AttachmentVault } from './attachment-vault';
import type { BackupService } from './backup-service';
import type { PartyStore } from './party-store';
import type { CrmDepthStore } from './crm-depth-store';
import type { RevenueOpsStore } from './revenue-ops-store';
import type { GeneralLedgerStore } from './general-ledger-store';
import type { ApiKeyStore } from './api-key-store';
import type { ReleaseGateStore } from './release-gate-store';
import type { ReleaseArtifactStore } from './release-artifact-store';
import type { ReleaseUpdateStore } from './release-update-store';
import type { AutoUpdateService } from './auto-update-service';
import type { UiAcceptanceStore } from './ui-acceptance-store';
import type { IntelligenceStore } from './intelligence-store';
import type { AutomationRunStore } from './automation-run-store';
import type { AutomationScheduleStore } from './automation-schedule-store';
import type { FinanceCompletionStore } from './finance-completion-store';
import type { RetailWorkspaceModeStore } from './retail-workspace-mode-store';
import type { WorkspaceProvisioner } from './workspace-provisioner';
import type { ArtifactKeyRotationService } from './artifact-key-rotation';
import { registerRetailWorkspaceStatusIpc } from './retail-workspace-status-ipc';
import type { BusinessDatabase } from './database';
import { proposeAutomationRun } from '../domain/workflow-execution';
import { runAutomationSchedulerTick } from './automation-scheduler-service';
import { buildSchedulerOperations } from '../domain/automation-scheduler-operations';
import { acknowledgeSchedulerEscalation, executeSchedulerRetry } from './automation-scheduler-recovery';
import { createReleaseReadinessReport } from './release-report';
import { createBuildProvenance } from './build-provenance';
import { createSupportDiagnostics } from './support-diagnostics';
import { createRestoreDrillEvidence } from './restore-drill';
import { createGovernedExchangeExport } from './governed-exchange';
import { createProviderCertificationPackage, verifyProviderCertificationPackage } from './provider-certification';
import {
  activateRetailDeviceAdapterProfileIpcSchema,
  approveRetailDeviceAdapterProfileIpcSchema,
  createRetailDeviceAdapterProfileIpcSchema,
  prepareRetailDeviceTransportIpcSchema,
  recordRetailDeviceAdapterAcknowledgementIpcSchema,
  suspendRetailDeviceAdapterProfileIpcSchema,
} from './retail-device-profile-ipc-schemas';
import { createRetailCertificationPack, verifyRetailCertificationPack } from '../domain/retail-certification-pack';
import { evaluateUiAcceptanceReadiness } from '../domain/ui-acceptance-readiness';
import {
  planBakalooRetailSampleReset,
  type BakalooRetailSampleResetPreview,
} from '../domain/bakaloo-retail-reset';
import { QuotePdfService } from './quote-pdf-service';
import { InvoicePdfService } from './invoice-pdf-service';
import { fetchRetailHubCutoverAssessment } from './retail-hub-assessment-client';
import { fetchRetailHubDeploymentPreflight } from './retail-hub-deployment-client';
import { fetchRetailHubShadowImportPreflight } from './retail-hub-shadow-import-client';
import { fetchRetailHubShadowImportPullReceipts, fetchRetailHubShadowImportSourceStatus } from './retail-hub-shadow-import-status-client';
import { fetchRetailHubStoreEdgeWorkerMetrics } from './retail-hub-store-edge-metrics-client';
import { fetchRetailHubCoverageMap } from './retail-hub-coverage-map-client';
import { assertManualRetailCutoverRegistrationAllowed } from './retail-cutover-registration-guard';
import { assertRendererRetailProviderOperationAllowed } from './retail-provider-boundary-guard';
import { projectIpcResponseForPolicy } from './ipc-response-projection';
import { IPC_CHANNELS } from '../shared/contracts';
import type { CrmState } from '../shared/contracts';
import {
  BAKALOO_RETAIL_DEMO_RESET_CONFIRMATION,
  type BakalooRetailDemoResetPreview,
} from '../shared/bakaloo-retail-reset-contracts';
import type { BusinessAction, KernelState } from '../shared/kernel-contracts';
import type { PartyState } from '../shared/party-contracts';
import type { CrmDepthState } from '../shared/crm-depth-contracts';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import { getCurrentSchemaRevision } from './database';
import type { AssetLifecycleActionInput } from '../shared/assets-maintenance-contracts';
import type { RetailMerchandisingImageDescriptor } from '../shared/retail-catalog-contracts';
import {
  assertIpcAuthorizationPolicyComplete,
  getIpcAuthorizationPolicy,
} from './ipc-authorization-policy';
import { getRuntimeDatabaseEncryptionEvidence } from './runtime-database-security';

const createLeadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().min(2).max(160),
  email: z.email().max(254),
  source: z.enum(['Website', 'Partner', 'Event', 'Referral', 'Outbound']),
});

const moveOpportunitySchema = z.object({
  id: z.string().min(1).max(100),
  toStage: z.string().trim().regex(/^[a-z][a-z0-9-]{1,39}$/),
  expectedVersion: z.int().positive(),
});

const completeActivitySchema = z.object({
  id: z.string().min(1).max(100),
  expectedVersion: z.int().positive(),
});

const bindLedgerCompanySchema = z.object({
  companyId: z.string().trim().min(1).max(100),
  branchId: z.string().trim().min(1).max(100),
});

const createLedgerJournalSchema = z.object({
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().trim().min(4).max(500),
  lines: z.array(
    z.object({
      accountId: z.string().trim().min(1).max(200),
      debit: z.number().finite().min(0).max(9_000_000_000_000),
      credit: z.number().finite().min(0).max(9_000_000_000_000),
      memo: z.string().trim().max(280),
    }),
  ).min(2).max(50),
});

const prepareRevenueInvoicePostingSchema = z.object({
  journalDraftId: z.string().trim().min(1).max(100),
  expectedVersion: z.number().int().positive(),
  expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/),
});
const prepareCashReceiptPostingSchema = prepareRevenueInvoicePostingSchema;
const prepareCommercialAdjustmentPostingSchema = prepareRevenueInvoicePostingSchema;
const prepareSupplierInvoicePostingSchema = prepareRevenueInvoicePostingSchema;
const prepareAssetCapitalizationPostingSchema = prepareRevenueInvoicePostingSchema;
const prepareAssetDepreciationPostingSchema = prepareRevenueInvoicePostingSchema;
const prepareAssetRetirementPostingSchema = prepareRevenueInvoicePostingSchema;
const prepareProjectRevenueRecognitionPostingSchema = prepareRevenueInvoicePostingSchema;

const postLedgerJournalSchema = z.object({
  id: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
});

const reverseLedgerJournalSchema = postLedgerJournalSchema.extend({
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(4).max(500),
});

const applyBakalooRetailDemoResetSchema = z.object({
  confirmation: z.string().trim().min(1).max(64),
}).strict();

const cancelLedgerJournalSchema = postLedgerJournalSchema.extend({
  reason: z.string().trim().min(4).max(500),
});

const updateTenantIdentitySchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(80),
  expectedVersion: z.number().int().positive(),
});

const companyProfileSchema = z.object({
  addressLine1: z.string().trim().min(2).max(160),
  addressLine2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(2).max(160),
  stateCode: z.string().trim().length(2),
  postalCode: z.string().trim().regex(/^\d{6}$/),
  email: z.email().max(254).optional(),
  phone: z.string().trim().min(7).max(32).optional(),
  website: z.url().max(240).optional(),
  gstin: z.string().trim().length(15).optional(),
  pan: z.string().trim().length(10).optional(),
  logoAttachmentId: z.string().trim().min(1).max(120).optional(),
}).strict();

const createCompanySchema = z.object({
  code: z.string().trim().min(2).max(16),
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().min(2).max(160),
  countryCode: z.string().trim().length(2),
  baseCurrency: z.string().trim().length(3),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  profile: companyProfileSchema.optional(),
});

const updateCompanySchema = createCompanySchema.extend({
  id: z.string().trim().min(1).max(100),
  status: z.enum(['active', 'inactive']),
  expectedVersion: z.number().int().positive(),
});

const createBranchSchema = z.object({
  companyId: z.string().trim().min(1).max(100),
  code: z.string().trim().min(2).max(16),
  name: z.string().trim().min(2).max(160),
  timezone: z.string().trim().min(3).max(100),
});

const updateBranchSchema = createBranchSchema.extend({
  id: z.string().trim().min(1).max(100),
  status: z.enum(['active', 'inactive']),
  expectedVersion: z.number().int().positive(),
});

const createUserSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(2).max(160),
  temporaryPassword: z.string().min(12).max(256)
    .refine((value) => /[a-z]/.test(value) && /[A-Z]/.test(value), 'Temporary password requires upper- and lower-case letters.')
    .refine((value) => /\d/.test(value) && /[^A-Za-z0-9]/.test(value), 'Temporary password requires a number and a symbol.'),
  roleIds: z.array(z.string().trim().min(1).max(100)).max(100),
  companyIds: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
  branchIds: z.array(z.string().trim().min(1).max(100)).max(500),
});

const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(160),
  grantIds: z.array(z.string().trim().min(1).max(100)).max(200),
});

const updateRolePolicySchema = createRoleSchema.extend({
  id: z.string().trim().min(1).max(100),
  expectedVersion: z.number().int().positive(),
});

const upsertFieldAccessRuleSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  roleId: z.string().trim().min(1).max(100),
  resource: z.string().trim().min(3).max(120),
  deniedFields: z.array(z.string().trim().min(1).max(100)).max(200),
  readOnlyFields: z.array(z.string().trim().min(1).max(100)).max(200),
});

const updateApprovalPolicySchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(2).max(160),
  approverRoleIds: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
  approvalsRequired: z.number().int().min(1).max(100),
  allowSelfApproval: z.boolean(),
  expectedVersion: z.number().int().positive(),
});

const assignRoleSchema = z.object({
  userId: z.string().trim().min(1).max(100),
  roleId: z.string().trim().min(1).max(100),
  expectedVersion: z.number().int().positive(),
});

const issueNumberSchema = z.object({
  sequenceId: z.string().trim().min(1).max(100),
  expectedVersion: z.number().int().positive(),
});

const transitionWorkflowSchema = z.object({
  instanceId: z.string().trim().min(1).max(100),
  transitionId: z.string().trim().min(1).max(100),
  expectedVersion: z.number().int().positive(),
});

const decideApprovalSchema = z.object({
  requestId: z.string().trim().min(1).max(100),
  decision: z.enum(['approved', 'rejected']),
  expectedVersion: z.number().int().positive(),
});

const registerCustomFieldSchema = z.object({
  resource: z.string().trim().min(3).max(120),
  key: z.string().trim().min(2).max(64),
  label: z.string().trim().min(2).max(120),
  type: z.enum(['text', 'number', 'date', 'boolean', 'select', 'reference']),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(120)).max(100),
});

const executeOutboxReplaySchema = z.object({
  checkpointRevision: z.number().int().nonnegative(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  outcomes: z.array(z.object({
    eventId: z.string().trim().min(1).max(160),
    result: z.enum(['published', 'failed']),
  })).max(500),
});

const resolveOutboxConflictSchema = z.object({
  eventId: z.string().trim().min(1).max(160),
  resolution: z.enum(['requeue', 'supersede']),
  reason: z.string().trim().min(8).max(500),
});

const apiKeyScopeSchema = z.enum(['crm.read', 'sales.read', 'finance.read', 'inventory.read', 'service.read', 'webhook.receive']);
const apiKeyScopeInputSchema = z.object({ companyId: z.string().trim().min(1).max(100), branchId: z.string().trim().min(1).max(100) });
const issueApiKeySchema = apiKeyScopeInputSchema.extend({ label: z.string().trim().min(2).max(120), scopes: z.array(apiKeyScopeSchema).min(1).max(20) });
const revokeApiKeySchema = z.object({ id: z.string().trim().min(1).max(100) });
const providerCertificationHandoffSchema = z.object({ domain: z.enum(['gsp-irp', 'banking', 'payroll', 'messaging', 'logistics']), providerName: z.string().trim().max(160), contractReference: z.string().trim().max(240), sandboxEvidenceReference: z.string().trim().max(240), credentialRevision: z.number().int().positive(), productionApprovalReference: z.string().trim().max(240).optional(), credentialOwner: z.string().trim().max(160), independentApprover: z.string().trim().max(160).optional(), testCaseReferences: z.array(z.string().trim().max(160)).max(100) });
const releaseGateSchema = z.object({ id: z.enum(['typecheck', 'lint', 'tests', 'package', 'backup-restore', 'provider-certification']), label: z.string().trim().min(2).max(160), status: z.enum(['passed', 'failed', 'deferred']), evidenceReference: z.string().trim().min(2).max(240), checkedAt: z.string().datetime(), notes: z.string().trim().max(500).optional(), evidenceChecksum: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional() });
const releaseArtifactEvidenceSchema = z.object({
  platform: z.enum(['win32', 'darwin', 'linux']),
  version: z.string().trim().min(1).max(80),
  artifactReference: z.string().trim().min(2).max(240),
  artifactSha256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
  smokeTestReference: z.string().trim().min(2).max(240),
  signingReference: z.string().trim().min(2).max(240),
  notarisationReference: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(500).optional(),
});
const decideReleaseArtifactEvidenceSchema = z.object({ id: z.string().uuid(), decision: z.enum(['verified', 'rejected']), notes: z.string().trim().max(500).optional() });
const releaseUpdateEvidenceSchema = z.object({
  channel: z.enum(['stable', 'beta']),
  platform: z.enum(['win32', 'darwin', 'linux']),
  currentVersion: z.string().trim().min(1).max(80),
  targetVersion: z.string().trim().min(1).max(80),
  rollbackVersion: z.string().trim().min(1).max(80),
  manifestReference: z.string().trim().min(2).max(240),
  manifestSha256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
  signatureReference: z.string().trim().min(2).max(240),
  rollbackTestReference: z.string().trim().min(2).max(240),
  notes: z.string().trim().max(500).optional(),
});
const decideReleaseUpdateEvidenceSchema = z.object({ id: z.string().uuid(), decision: z.enum(['verified', 'rejected']), notes: z.string().trim().max(500).optional() });
const recordUiAcceptanceEvidenceSchema = z.object({ scenarioId: z.string().trim().min(2).max(160), result: z.enum(['passed', 'failed', 'blocked']), evidenceReference: z.string().trim().min(4).max(240), notes: z.string().trim().min(4).max(1_000).optional() }).strict();
const decideUiAcceptanceEvidenceSchema = z.object({ id: z.string().uuid(), decision: z.enum(['verified', 'rejected']), notes: z.string().trim().max(1_000).optional() }).strict();
const intelligenceReviewAnomalySchema = z.object({ id: z.string().trim().min(1).max(200), decision: z.enum(['accepted', 'dismissed', 'snoozed']), reviewerId: z.string().trim().min(1).max(160).optional(), reviewedAt: z.string().datetime(), rationale: z.string().trim().min(8).max(1_000), expectedVersion: z.number().int().positive() });
const intelligenceAnomalySchema = z.object({ id: z.string().trim().min(1).max(200), policyId: z.string().trim().min(1).max(160), policyVersion: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(240), metric: z.string().trim().min(1).max(160), observedValue: z.number().finite(), comparator: z.enum(['gte', 'lte']), threshold: z.number().finite(), severity: z.enum(['critical', 'high', 'medium']), destination: z.string().trim().min(1).max(80), ownerRole: z.string().trim().min(1).max(120), recommendation: z.string().trim().min(8).max(1_000), evidenceReference: z.string().trim().min(1).max(300), generatedAt: z.string().datetime(), status: z.enum(['open', 'accepted', 'dismissed', 'snoozed']), version: z.number().int().positive(), review: z.object({ decision: z.enum(['accepted', 'dismissed', 'snoozed']), reviewerId: z.string().trim().min(1).max(160), reviewedAt: z.string().datetime(), rationale: z.string().trim().min(8).max(1_000) }).optional() });
const intelligenceReportExecutionSchema = z.object({ id: z.string().trim().min(1).max(200), packId: z.string().trim().min(1).max(160), scope: z.object({ companyId: z.string().trim().min(1).max(100), branchId: z.string().trim().min(1).max(100) }), generatedAt: z.string().datetime(), executedBy: z.string().trim().min(1).max(160), status: z.enum(['ready', 'partial', 'blocked']), rows: z.array(z.object({ key: z.string().trim().min(1).max(160), label: z.string().trim().min(1).max(240), value: z.number().finite(), unit: z.string().trim().min(1).max(32), sensitivity: z.string().trim().min(1).max(32), sourceCollections: z.array(z.string().trim().min(1).max(160)).max(50) })).max(100), missingMetricKeys: z.array(z.string().trim().min(1).max(160)).max(100), blockedReason: z.string().trim().max(500).optional(), checksum: z.string().trim().regex(/^[a-fA-F0-9]{64}$/) });
const reportDeliveryRecipientSchema = z.object({ id: z.string().trim().min(2).max(120), kind: z.enum(['internal-user', 'customer-contact']), label: z.string().trim().min(2).max(120), destination: z.string().trim().min(3).max(254), consentId: z.string().trim().min(2).max(160).optional() }).strict();
const createReportDeliveryPlanSchema = z.object({ reportPackId: z.string().trim().min(3).max(120), channel: z.enum(['email', 'whatsapp']), frequency: z.enum(['daily', 'weekly', 'monthly']), runDay: z.number().int().min(1).max(28).optional(), windowStart: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), windowEnd: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().optional(), providerConnectorId: z.string().trim().min(2).max(120).optional(), recipients: z.array(reportDeliveryRecipientSchema).min(1).max(100), notes: z.string().trim().min(4).max(500) }).strict();
const decideReportDeliveryPlanSchema = z.object({ id: z.string().trim().min(1).max(200), decision: z.enum(['approved', 'rejected']), expectedVersion: z.number().int().positive(), remarks: z.string().trim().min(4).max(500) }).strict();
const prepareReportDeliveryAttemptSchema = z.object({ id: z.string().trim().min(1).max(200), expectedVersion: z.number().int().positive(), now: z.string().datetime().optional() }).strict();
const recordReportDeliveryResultSchema = z.object({ id: z.string().trim().min(1).max(200), outcome: z.enum(['handed-off', 'acknowledged', 'failed']), externalReference: z.string().trim().min(3).max(200).optional(), responseChecksum: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional(), errorMessage: z.string().trim().min(4).max(500).optional(), expectedVersion: z.number().int().positive() }).strict();
const automationProposeSchema = z.object({ idempotencyKey: z.string().trim().min(4).max(200), workflowInstanceId: z.string().trim().min(1).max(160), transitionId: z.string().trim().min(1).max(160) });
const automationIdSchema = z.object({ id: z.string().trim().min(1).max(200) });
const automationRetrySchema = z.object({ id: z.string().trim().min(1).max(200), reason: z.string().trim().min(8).max(1_000) });
const automationCompleteSchema = z.object({ id: z.string().trim().min(1).max(200), status: z.enum(['succeeded', 'failed', 'cancelled']), completedAt: z.string().datetime(), outcomeReference: z.string().trim().min(1).max(300), failureReason: z.string().trim().max(1_000).optional(), expectedVersion: z.number().int().positive() });
const automationScheduleSchema = z.object({ id: z.string().trim().min(1).max(200), name: z.string().trim().min(2).max(200), workflowInstanceId: z.string().trim().min(1).max(160), transitionId: z.string().trim().min(1).max(160), scope: z.object({ companyId: z.string().trim().min(1).max(100), branchId: z.string().trim().min(1).max(100) }), frequency: z.enum(['hourly', 'daily', 'weekly']), timeZone: z.enum(['UTC', 'Asia/Kolkata']), windowStart: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), windowEnd: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), enabled: z.boolean(), version: z.number().int().positive() });
const automationScheduleEvaluateSchema = z.object({ id: z.string().trim().min(1).max(200), now: z.string().datetime().optional() });
const automationScheduleTickSchema = z.object({ now: z.string().datetime().optional() }).optional();
const automationScheduleFailureSchema = z.object({ id: z.string().trim().min(1).max(240), resolutionReference: z.string().trim().min(8).max(500) });
const automationScheduleActionSchema = z.object({ id: z.string().trim().min(1).max(240), reason: z.string().trim().min(8).max(500) });
const financeCompletionSaveSchema = z.object({ id: z.string().trim().min(1).max(200), snapshot: z.record(z.string(), z.unknown()), status: z.enum(['draft', 'reviewed', 'approved']).optional(), expectedVersion: z.number().int().positive().optional() });

const emailSchema = z.email().max(254).transform((value) => value.toLowerCase());
const bootstrapOwnerSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(256),
  starterMode: z.literal('clean').optional().default('clean'),
}).strict();
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
  mfaCode: z.string().trim().min(6).max(64).optional(),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256),
});
const mfaConfirmSchema = z.object({ code: z.string().trim().min(6).max(64) }).strict();
const mfaDisableSchema = z.object({ currentPassword: z.string().min(1).max(256) }).strict();
const attachmentTargetSchema = z.object({
  resource: z.string().trim().min(3).max(120),
  resourceId: z.string().trim().min(1).max(200),
});
const exportAttachmentSchema = z.object({
  id: z.string().uuid(),
});
const createAccountSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  legalName: z.string().trim().min(2).max(160),
  domain: z.string().trim().min(4).max(253),
  industry: z.string().trim().min(2).max(160),
  relationship: z.enum(['prospect', 'customer', 'partner', 'supplier']),
  ownerId: z.string().trim().min(1).max(100),
});
const createContactSchema = z.object({
  accountId: z.string().trim().min(1).max(100).optional(),
  firstName: z.string().trim().min(2).max(160),
  lastName: z.string().trim().min(2).max(160),
  email: z.email().max(254),
  phone: z.string().trim().max(50),
  jobTitle: z.string().trim().min(2).max(160),
  ownerId: z.string().trim().min(1).max(100),
});
const recordConsentSchema = z.object({
  contactId: z.string().trim().min(1).max(100),
  channel: z.enum(['email', 'phone', 'sms']),
  purpose: z.enum(['marketing', 'transactional']),
  status: z.enum(['granted', 'withdrawn', 'unknown']),
  source: z.string().trim().min(2).max(160),
  expiresAt: z.iso.datetime().optional(),
  expectedContactVersion: z.number().int().positive(),
});
const resolveDuplicateSchema = z.object({
  id: z.string().uuid(),
  resolution: z.enum(['not-duplicate', 'merged']),
  expectedVersion: z.number().int().positive(),
});
const addAddressSchema = z.object({
  accountId: z.string().trim().min(1).max(100).optional(),
  contactId: z.string().trim().min(1).max(100).optional(),
  type: z.enum(['billing', 'shipping', 'office', 'home']),
  label: z.string().trim().min(2).max(160),
  line1: z.string().trim().min(2).max(200),
  line2: z.string().trim().max(200),
  city: z.string().trim().min(2).max(160),
  region: z.string().trim().max(160),
  postalCode: z.string().trim().max(40),
  countryCode: z.string().trim().length(2),
  primary: z.boolean(),
});
const addContactPointSchema = z.object({
  contactId: z.string().trim().min(1).max(100),
  type: z.enum(['email', 'phone', 'mobile', 'website', 'linkedin']),
  label: z.string().trim().min(2).max(160),
  value: z.string().trim().min(3).max(500),
  primary: z.boolean(),
  verified: z.boolean(),
  expectedContactVersion: z.number().int().positive(),
});
const createRelationshipSchema = z.object({
  fromAccountId: z.string().trim().min(1).max(100),
  toAccountId: z.string().trim().min(1).max(100),
  type: z.enum(['parent', 'subsidiary', 'partner', 'supplier', 'customer']),
});
const executeMergeSchema = z.object({
  entityType: z.enum(['account', 'contact']),
  survivorId: z.string().trim().min(1).max(100),
  mergedId: z.string().trim().min(1).max(100),
  survivorVersion: z.number().int().positive(),
  mergedVersion: z.number().int().positive(),
});
const convertLeadSchema = z.object({
  leadId: z.string().trim().min(1).max(100),
  expectedLeadVersion: z.number().int().positive(),
  accountMode: z.enum(['create', 'existing']),
  accountId: z.string().trim().min(1).max(100).optional(),
  accountDomain: z.string().trim().min(4).max(253).optional(),
  industry: z.string().trim().min(2).max(160).optional(),
  jobTitle: z.string().trim().min(2).max(160),
});
const pipelineStageSchema = z.object({
  id: z.string().trim().min(2).max(40),
  label: z.string().trim().min(2).max(80),
  signal: z.string().trim().min(2).max(120),
  probability: z.number().int().min(0).max(100),
  forecastCategory: z.enum(['pipeline', 'best-case', 'commit', 'closed']),
  position: z.number().int().positive(),
  entryCriteria: z.array(z.string().trim().min(2).max(160)).max(20),
  nextStageIds: z.array(z.string().trim().min(2).max(40)).max(20),
  active: z.boolean(),
});
const updatePipelineSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(300),
  stages: z.array(pipelineStageSchema).min(2).max(30),
  expectedVersion: z.number().int().positive(),
});
const createScoringRuleSchema = z.object({
  name: z.string().trim().min(2).max(160),
  field: z.enum(['source', 'company', 'email', 'status']),
  operator: z.enum(['equals', 'contains', 'exists']),
  value: z.string().trim().max(160),
  points: z.number().int().min(-100).max(100),
  enabled: z.boolean(),
});
const createCampaignSchema = z.object({
  name: z.string().trim().min(2).max(160),
  channel: z.enum(['email', 'event', 'multi-channel']),
  consentPurpose: z.enum(['marketing', 'transactional']),
  memberContactIds: z.array(z.string().trim().min(1).max(100)).max(100000),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
  budget: z.number().min(0).max(1_000_000_000),
  ownerId: z.string().trim().min(1).max(100),
});
const transitionCampaignSchema = z.object({ id: z.string().trim().min(1).max(100), toStatus: z.enum(['draft', 'active', 'completed', 'paused']), expectedVersion: z.number().int().positive() });
const createSavedViewSchema = z.object({
  name: z.string().trim().min(2).max(160),
  resource: z.enum(['lead', 'opportunity', 'account', 'contact']),
  ownerId: z.string().trim().min(1).max(100),
  filters: z.array(z.object({ field: z.string().trim().min(1).max(100), operator: z.enum(['equals', 'contains', 'gte', 'lte']), value: z.string().max(500) })).max(50),
  columns: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
  sortField: z.string().trim().min(1).max(100),
  sortDirection: z.enum(['asc', 'desc']),
  shared: z.boolean(),
});
const commitImportSchema = z.object({ id: z.string().uuid(), expectedVersion: z.number().int().positive() });
const configureAdapterSchema = z.object({ id: z.string().trim().min(1).max(100), displayName: z.string().trim().min(2).max(160), status: z.enum(['configured', 'healthy', 'degraded']), expectedVersion: z.number().int().positive() });
const recordCommunicationSchema = z.object({ contactId: z.string().trim().min(1).max(100), accountId: z.string().trim().min(1).max(100).optional(), adapterId: z.string().trim().min(1).max(100).optional(), channel: z.enum(['email', 'calendar', 'phone']), direction: z.enum(['inbound', 'outbound']), purpose: z.enum(['transactional', 'marketing']).optional(), consentId: z.string().trim().min(1).max(100).optional(), subject: z.string().trim().min(2).max(300), occurredAt: z.iso.datetime(), externalId: z.string().trim().max(300).optional() });
const recordCommunicationDeliverySchema = z.object({ id: z.string().trim().min(1).max(100), outcome: z.enum(['sent', 'failed']), externalId: z.string().trim().min(3).max(300).optional(), expectedVersion: z.number().int().positive() }).strict();
const indiaStateCodeSchema = z.string().regex(/^\d{2}$/);
const updateIndiaProfileSchema = z.object({ legalName: z.string().trim().min(2).max(160), tradeName: z.string().trim().min(2).max(160), gstRegistered: z.boolean(), gstin: z.string().trim().max(15), pan: z.string().trim().max(10), udyamNumber: z.string().trim().max(40), defaultStateCode: indiaStateCodeSchema, expectedVersion: z.number().int().positive() });
const createTerritorySchema = z.object({ code: z.string().trim().min(2).max(16), name: z.string().trim().min(2).max(160), region: z.enum(['north', 'west', 'south', 'east-northeast', 'national']), stateCodes: z.array(indiaStateCodeSchema).min(1).max(40), managerUserId: z.string().trim().min(1).max(100) });
const retailCutoverScopeSchema = z.object({ companyId: z.string().trim().min(1).max(100), branchId: z.string().trim().min(1).max(100) }).strict();
const fetchRetailHubCutoverAssessmentSchema = z.object({
  baseUrl: z.string().trim().min(1).max(300),
  batchId: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/u),
  capability: z.enum(['catalog', 'inventory', 'customers', 'orders', 'delivery', 'settlements', 'campaigns', 'storefront']),
}).strict();
const fetchRetailHubDeploymentPreflightSchema = z.object({
  baseUrl: z.string().trim().min(1).max(300),
}).strict();
const fetchRetailHubShadowImportPreflightSchema = z.object({
  baseUrl: z.string().trim().min(1).max(300),
  batchId: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/u),
}).strict();
const fetchRetailHubShadowImportSourceStatusSchema = z.object({
  baseUrl: z.string().trim().min(1).max(300),
}).strict();
const fetchRetailHubShadowImportPullReceiptsSchema = z.object({
  baseUrl: z.string().trim().min(1).max(300),
  batchId: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/u).optional(),
}).strict();
const fetchRetailHubStoreEdgeWorkerMetricsSchema = z.object({
  baseUrl: z.string().trim().min(1).max(300),
}).strict();
const fetchRetailHubCoverageMapSchema = z.object({
  baseUrl: z.string().trim().min(1).max(300),
  shopId: z.string().uuid(),
  scope: z.object({ companyId: z.string().trim().min(1).max(120), branchId: z.string().trim().min(1).max(120) }).strict(),
}).strict();
const createRetailCutoverPlanSchema = z.object({
  id: z.string().trim().min(2).max(120),
  capability: z.enum(['analytics', 'catalog-inventory', 'orders', 'delivery', 'finance']),
  scope: retailCutoverScopeSchema,
  baselineChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
  reconciliation: z.object({
    remoteRecordCount: z.number().int().nonnegative(),
    localRecordCount: z.number().int().nonnegative(),
    differenceCount: z.number().int().nonnegative(),
    remoteChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    localChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    reconciliationChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    completedAt: z.iso.datetime().optional(),
    completedBy: z.string().trim().max(100).optional(),
    evidenceReference: z.string().trim().max(300).optional(),
  }).strict(),
}).strict();
const createRetailCutoverPlanFromHubAssessmentSchema = z.object({
  scope: retailCutoverScopeSchema,
  evidenceReference: z.string().trim().min(4).max(300),
  assessment: z.object({
    source: z.literal('bakaloo'),
    scope: z.object({ tenantId: z.string().trim().min(1).max(100), companyId: z.string().trim().min(1).max(100), branchId: z.string().trim().min(1).max(100) }).strict(),
    capability: z.enum(['catalog', 'inventory', 'customers', 'orders', 'delivery', 'settlements', 'campaigns', 'storefront']),
    status: z.enum(['ready-for-parallel-run', 'blocked']),
    blockers: z.array(z.string().trim().max(500)).max(100),
    requiredEntities: z.array(z.string().trim().min(1).max(80)).max(100),
    planId: z.string().trim().min(2).max(120),
    planChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    remoteRecordCount: z.number().int().nonnegative(),
    localRecordCount: z.number().int().nonnegative(),
    differenceCount: z.number().int().nonnegative(),
    remoteChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    localChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    reconciliationChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    approvalDecisionId: z.string().trim().max(120).optional(),
    credentialRevision: z.number().int().positive().optional(),
    rollbackReference: z.string().trim().max(300).optional(),
    writeBackAllowed: z.literal(false),
  }).strict(),
}).strict();
const advanceRetailCutoverSchema = z.object({
  id: z.string().trim().min(2).max(120),
  decision: z.enum(['start-parallel', 'reconciled', 'approved', 'cutover', 'retire', 'rollback', 'block']),
  expectedVersion: z.number().int().positive(),
  evidenceReference: z.string().trim().max(300).optional(),
  rollbackWindowHours: z.number().int().min(1).max(720).optional(),
  reason: z.string().trim().max(500).optional(),
}).strict();
const createAssignmentRuleSchema = z.object({ name: z.string().trim().min(2).max(160), field: z.enum(['stateCode', 'source', 'value']), operator: z.enum(['equals', 'in', 'gte']), value: z.string().trim().min(1).max(500), territoryId: z.string().trim().min(1).max(100), assigneeUserId: z.string().trim().min(1).max(100), priority: z.number().int().min(1).max(1000) });
const bulkAssignSchema = z.object({ opportunityIds: z.array(z.string().trim().min(1).max(100)).min(1).max(500), expectedVersions: z.record(z.string(), z.number().int().positive()), territoryId: z.string().trim().min(1).max(100), assigneeUserId: z.string().trim().min(1).max(100) });
const createAudienceSegmentSchema = z.object({ name: z.string().trim().min(2).max(160), resource: z.enum(['account', 'contact', 'opportunity']), stateCodes: z.array(indiaStateCodeSchema).max(40), industries: z.array(z.string().trim().min(1).max(160)).max(100), relationships: z.array(z.enum(['prospect', 'customer', 'partner', 'supplier'])).max(4), territoryIds: z.array(z.string().trim().min(1).max(100)).max(100), minimumOpportunityValue: z.number().min(0).max(1_000_000_000_000), shared: z.boolean() });
const createIndiaOpportunitySchema = z.object({ title: z.string().trim().min(2).max(160), accountId: z.string().trim().min(1).max(100), contactId: z.string().trim().min(1).max(100).optional(), stateCode: indiaStateCodeSchema, source: z.enum(['Website', 'Partner', 'Event', 'Referral', 'Outbound']), value: z.number().positive().max(1_000_000_000_000), expectedClose: z.iso.date(), nextStep: z.string().trim().min(2).max(300), productName: z.string().trim().min(2).max(160), productKind: z.enum(['goods', 'service']), hsnSac: z.string().trim().max(16), quantity: z.number().positive().max(1_000_000), unitPrice: z.number().min(0).max(1_000_000_000_000), gstRate: z.number().min(0).max(100) });
const createQuoteSchema = z.object({ opportunityId: z.string().trim().min(1).max(100), contactId: z.string().trim().min(1).max(100).optional(), placeOfSupplyStateCode: indiaStateCodeSchema, recipientTreatment: z.enum(['registered', 'unregistered', 'export']), recipientGstin: z.string().trim().max(15), validUntil: z.iso.date() });
const transitionQuoteSchema = z.object({ id: z.string().trim().min(1).max(100), toStatus: z.enum(['draft', 'submitted', 'approved', 'rejected', 'converted']), expectedVersion: z.number().int().positive() });
const effectiveRangeSchema = z.object({ effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().optional() });
const createGstTaxCodeSchema = effectiveRangeSchema.extend({ code: z.string().trim().regex(/^\d{4,8}$/), kind: z.enum(['HSN', 'SAC']), description: z.string().trim().min(4).max(300), gstRate: z.number().min(0).max(100), cessRate: z.number().min(0).max(100), sourceLabel: z.string().trim().min(3).max(160), sourceUrl: z.url().startsWith('https://'), reviewStatus: z.enum(['draft', 'verified', 'retired']) });
const createCatalogProductSchema = effectiveRangeSchema.extend({ sku: z.string().trim().min(2).max(32), name: z.string().trim().min(2).max(160), description: z.string().trim().min(4).max(500), kind: z.enum(['goods', 'service']), uom: z.string().trim().min(2).max(32), taxCodeId: z.string().trim().min(1).max(100) });
const importRetailProductPackSchema = z.object({ csv: z.string().min(1).max(2_000_000), expectedRevision: z.number().int().positive(), checkerId: z.string().trim().min(1).max(160), evidenceReference: z.string().trim().min(3).max(240), now: z.string().datetime().optional() }).strict();
const createPriceListSchema = effectiveRangeSchema.extend({ code: z.string().trim().min(2).max(32), name: z.string().trim().min(2).max(160), channel: z.enum(['all', 'direct', 'partner', 'retail']) });
const createPriceListEntrySchema = effectiveRangeSchema.extend({ priceListId: z.string().trim().min(1).max(100), productId: z.string().trim().min(1).max(100), unitPrice: z.number().min(0).max(1_000_000_000_000), taxMode: z.enum(['inclusive', 'exclusive']).optional(), minimumQuantity: z.number().positive().max(1_000_000) });
const createDiscountPolicySchema = effectiveRangeSchema.extend({ code: z.string().trim().min(2).max(32), name: z.string().trim().min(2).max(160), scope: z.enum(['order', 'product']), productId: z.string().trim().min(1).max(100).optional(), method: z.enum(['percentage', 'fixed']), value: z.number().positive().max(1_000_000_000), minimumTaxableValue: z.number().min(0).max(1_000_000_000_000), maximumDiscountAmount: z.number().min(0).max(1_000_000_000_000), stackable: z.boolean(), approvalThresholdPercent: z.number().min(0).max(100), promotionType: z.enum(['discount', 'bogo', 'gift']).optional(), eligibleCustomerAccountIds: z.array(z.string().trim().min(1).max(100)).max(500).optional(), eligibleLoyaltyTiers: z.array(z.enum(['silver', 'gold', 'platinum'])).max(3).optional(), eligibleRetailCategoryIds: z.array(z.string().trim().min(1).max(100)).max(100).optional(), eligibleRetailBrandIds: z.array(z.string().trim().min(1).max(100)).max(100).optional(), eligibleRetailRackBinIds: z.array(z.string().trim().min(1).max(100)).max(100).optional(), buyQuantity: z.number().int().positive().max(1000).optional(), freeQuantity: z.number().int().positive().max(1000).optional(), giftItemVariantId: z.string().trim().min(1).max(100).optional(), giftQuantity: z.number().int().positive().max(1000).optional(), campaignCode: z.string().trim().min(2).max(64).optional() });
const submitPriceListForApprovalSchema = z.object({ id: z.string().trim().min(1).max(100), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(4).max(300) });
const decidePriceListApprovalSchema = z.object({ requestId: z.string().trim().min(1).max(100), decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(2).max(300), expectedVersion: z.number().int().positive() });
const submitQuoteForApprovalSchema = z.object({ id: z.string().trim().min(1).max(100), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(4).max(300) });
const decideQuoteApprovalSchema = z.object({ requestId: z.string().trim().min(1).max(100), decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(2).max(300), expectedVersion: z.number().int().positive() });
const exportQuotePdfSchema = z.object({ quoteId: z.string().trim().min(1).max(100) });
const convertQuoteToSalesOrderSchema = z.object({ quoteId: z.string().trim().min(1).max(100), expectedVersion: z.number().int().positive(), orderDate: z.iso.date(), requiredBy: z.iso.date() });
const transitionSalesOrderSchema = z.object({ id: z.string().trim().min(1).max(100), toStatus: z.enum(['confirmed', 'fulfilling', 'on-hold', 'completed', 'cancelled']), expectedVersion: z.number().int().positive() });
const updateFulfilmentTaskSchema = z.object({ id: z.string().trim().min(1).max(100), toStatus: z.enum(['planned', 'ready', 'in-progress', 'blocked', 'completed']), blockedReason: z.string().trim().min(3).max(300).optional(), expectedVersion: z.number().int().positive() });
const createPaymentTermSchema = z.object({ code: z.string().trim().min(2).max(32), name: z.string().trim().min(2).max(160), dueDays: z.number().int().min(0).max(3650), earlyPaymentDays: z.number().int().min(0).max(3650), earlyPaymentDiscountPercent: z.number().min(0).max(100) });
const recordDeliveryEvidenceSchema = z.object({ salesOrderId: z.string().trim().min(1).max(100), fulfilmentTaskId: z.string().trim().min(1).max(100).optional(), type: z.enum(['dispatch', 'delivery', 'customer-acceptance', 'service-acceptance']), reference: z.string().trim().min(3).max(120), occurredAt: z.iso.datetime(), notes: z.string().trim().min(3).max(500) });
const createServiceMilestoneSchema = z.object({ salesOrderId: z.string().trim().min(1).max(100), lineId: z.string().trim().min(1).max(100), name: z.string().trim().min(2).max(160), percentage: z.number().positive().max(100), dueDate: z.iso.date() });
const transitionServiceMilestoneSchema = z.object({ id: z.string().trim().min(1).max(100), toStatus: z.enum(['planned', 'ready', 'accepted', 'invoiced']), acceptanceReference: z.string().trim().min(3).max(120).optional(), expectedVersion: z.number().int().positive() });
const createInvoiceDraftSchema = z.object({
  salesOrderId: z.string().trim().min(1).max(100),
  documentKind: z.enum(['tax-invoice', 'bill-of-supply']),
  invoiceDate: z.iso.date(),
  paymentTermId: z.string().trim().min(1).max(100),
  reverseCharge: z.boolean(),
  basis: z.enum(['order-completion', 'accepted-milestones', 'shipment-package', 'project-claims']),
  milestoneIds: z.array(z.string().trim().min(1).max(100)).max(100),
  shipmentPackageIds: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  projectBillingClaimIds: z.array(z.string().trim().min(1).max(100)).min(1).max(100).optional(),
}).superRefine((input, context) => {
  if (input.basis === 'project-claims' && !input.projectBillingClaimIds?.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectBillingClaimIds'],
      message: 'Project-claim invoicing requires at least one recognized billing claim.',
    });
  }
  if (input.basis !== 'project-claims' && input.projectBillingClaimIds?.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectBillingClaimIds'],
      message: 'Billing claims can only be supplied for project-claim invoicing.',
    });
  }
  if (
    input.projectBillingClaimIds &&
    new Set(input.projectBillingClaimIds).size !== input.projectBillingClaimIds.length
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectBillingClaimIds'],
      message: 'Billing claim IDs must be unique.',
    });
  }
});
const issueInvoiceSchema = z.object({ id: z.string().trim().min(1).max(100), expectedVersion: z.number().int().positive() });
const createCreditDebitNoteSchema = z.object({ invoiceId: z.string().trim().min(1).max(100), type: z.enum(['credit', 'debit']), reason: z.string().trim().min(4).max(300), taxableValue: z.number().positive().max(1_000_000_000_000), gstRate: z.number().min(0).max(100), noteDate: z.iso.date() });
const paymentAllocationSchema = z.object({ receivableId: z.string().trim().min(1).max(100), amount: z.number().positive().max(1_000_000_000_000) });
const recordPaymentSchema = z.object({ accountId: z.string().trim().min(1).max(100), receivedAt: z.iso.datetime(), method: z.enum(['bank-transfer', 'upi', 'card', 'cheque', 'cash', 'other']), reference: z.string().trim().min(3).max(120), amount: z.number().positive().max(1_000_000_000_000), allocations: z.array(paymentAllocationSchema).max(500) });
const cashApplicationAllocationSchema = paymentAllocationSchema.extend({ expectedVersion: z.number().int().positive() });
const applyUnappliedReceiptSchema = z.object({
  id: z.string().trim().min(1).max(100),
  expectedVersion: z.number().int().positive(),
  expectedJournalVersion: z.number().int().positive(),
  evidenceReference: z.string().trim().min(3).max(120),
  allocations: z.array(cashApplicationAllocationSchema).min(1).max(500),
}).superRefine((input, context) => {
  const duplicateReceivableId = input.allocations.find((allocation, index) =>
    input.allocations.findIndex(({ receivableId }) => receivableId === allocation.receivableId) !== index,
  )?.receivableId;
  if (duplicateReceivableId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['allocations'],
      message: `Each receivable may be allocated once per cash application (${duplicateReceivableId}).`,
    });
  }
});
const reconcilePaymentSchema = z.object({ id: z.string().trim().min(1).max(100), expectedVersion: z.number().int().positive() });
const exportJournalSchema = z.object({ id: z.string().trim().min(1).max(100), externalReference: z.string().trim().min(3).max(120), expectedVersion: z.number().int().positive() });
const exportInvoicePdfSchema = z.object({ invoiceId: z.string().trim().min(1).max(100) });
const createGstRegistrationSchema = z.object({ label: z.string().trim().min(2).max(160), gstin: z.string().trim().length(15), stateCode: indiaStateCodeSchema, branchCode: z.string().trim().min(2).max(16), address: z.string().trim().min(5).max(500), primary: z.boolean() });
const createPlaceOfSupplyReviewSchema = z.object({ salesOrderId: z.string().trim().min(1).max(100), supplierRegistrationId: z.string().trim().min(1).max(100), shipFromStateCode: indiaStateCodeSchema, shipToStateCode: indiaStateCodeSchema, shipToGstin: z.string().trim().length(15).optional(), placeOfSupplyStateCode: indiaStateCodeSchema, basis: z.enum(['movement-terminates', 'bill-to-ship-to', 'registered-service-recipient', 'manual-review']), rationale: z.string().trim().min(8).max(500) });
const decidePlaceOfSupplyReviewSchema = z.object({ id: z.string().trim().min(1).max(100), decision: z.enum(['approved', 'rejected']), evidence: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createStockLocationSchema = z.object({ code: z.string().trim().min(2).max(16), name: z.string().trim().min(2).max(160), stateCode: indiaStateCodeSchema, gstRegistrationId: z.string().trim().min(1).max(100).optional() });
const recordStockMovementSchema = z.object({ locationId: z.string().trim().min(1).max(100), productId: z.string().trim().min(1).max(100), type: z.enum(['receipt', 'adjustment-in', 'adjustment-out']), quantity: z.number().positive().max(1_000_000_000), reference: z.string().trim().min(3).max(120), occurredAt: z.iso.datetime() });
const reserveStockSchema = z.object({ salesOrderId: z.string().trim().min(1).max(100), lineId: z.string().trim().min(1).max(100), locationId: z.string().trim().min(1).max(100), quantity: z.number().positive().max(1_000_000_000) });
const releaseStockReservationSchema = z.object({ id: z.string().trim().min(1).max(100), expectedVersion: z.number().int().positive() });
const serviceabilityIdSchema = z.string().trim().min(1).max(100);
const serviceabilityWeekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const createPincodeServiceabilityRuleSchema = z.object({
  code: z.string().trim().min(2).max(32),
  name: z.string().trim().min(3).max(160),
  originLocationId: serviceabilityIdSchema,
  carrierAdapterId: serviceabilityIdSchema.optional(),
  destinationStateCode: indiaStateCodeSchema.optional(),
  pinMatchKind: z.enum(['exact', 'prefix', 'range']),
  pinStart: z.string().trim().min(1).max(6),
  pinEnd: z.string().trim().length(6).optional(),
  serviceLevel: z.enum(['standard', 'express', 'freight']),
  serviceable: z.boolean(),
  codAllowed: z.boolean(),
  codMaximumAmount: z.number().positive().max(1_000_000_000_000).optional(),
  maximumWeightKg: z.number().positive().max(1_000_000).optional(),
  cutoffLocalTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  dispatchLeadBusinessDays: z.number().int().min(0).max(90),
  transitMinBusinessDays: z.number().int().min(0).max(120),
  transitMaxBusinessDays: z.number().int().min(0).max(120),
  workingDays: z.array(serviceabilityWeekdaySchema).min(1).max(7),
  priority: z.number().int().min(0).max(10_000),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.iso.date().optional(),
  evidenceReference: z.string().trim().min(4).max(300),
});
const decidePincodeServiceabilityRuleSchema = z.object({ id: serviceabilityIdSchema, decision: z.enum(['activate', 'suspend']), rationale: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createDeliveryPromiseSchema = z.object({ salesOrderId: serviceabilityIdSchema, shipToAddressId: serviceabilityIdSchema, originLocationId: serviceabilityIdSchema, carrierAdapterId: serviceabilityIdSchema.optional(), serviceLevel: z.enum(['standard', 'express', 'freight']), paymentMode: z.enum(['prepaid', 'cod']), estimatedWeightKg: z.number().positive().max(1_000_000), requestedAt: z.iso.datetime().optional() });
const codCustodyIdSchema = z.string().trim().min(1).max(100);
const codEvidenceReferenceSchema = z.string().trim().min(3).max(240);
const codInstantSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/, 'Use an ISO-8601 instant with an explicit offset.');
const codAmountSchema = z.number().finite().positive().max(1_000_000_000_000).refine((amount) => Math.abs(Math.round(amount * 100) / 100 - amount) <= 0.000_001, 'Amounts cannot have fractions of an INR paisa.');
const codExpectedVersionSchema = z.number().int().positive();
const createCodCollectionCaseSchema = z.object({ deliveryPromiseId: codCustodyIdSchema, shipmentPackageId: codCustodyIdSchema, salesOrderId: codCustodyIdSchema, carrierAdapterId: codCustodyIdSchema, receivableId: codCustodyIdSchema, expectedDeliveryPromiseVersion: codExpectedVersionSchema, expectedShipmentVersion: codExpectedVersionSchema, expectedSalesOrderVersion: codExpectedVersionSchema, expectedCarrierVersion: codExpectedVersionSchema, expectedReceivableVersion: codExpectedVersionSchema });
const recordCodHandoverSchema = z.object({ id: codCustodyIdSchema, evidenceReference: codEvidenceReferenceSchema, handedOverAt: codInstantSchema, expectedVersion: codExpectedVersionSchema, expectedShipmentVersion: codExpectedVersionSchema });
const recordCodCarrierCollectionSchema = z.object({ id: codCustodyIdSchema, evidenceReference: codEvidenceReferenceSchema, collectedAt: codInstantSchema, collectedAmount: codAmountSchema, expectedVersion: codExpectedVersionSchema, expectedShipmentVersion: codExpectedVersionSchema });
const recordCodRemittanceSchema = z.object({ id: codCustodyIdSchema, evidenceReference: codEvidenceReferenceSchema, remittedAt: codInstantSchema, remittedAmount: codAmountSchema, expectedVersion: codExpectedVersionSchema, expectedReceivableVersion: codExpectedVersionSchema });
const matchCodBankSchema = z.object({ id: codCustodyIdSchema, paymentReceiptId: codCustodyIdSchema, bankStatementLineId: codCustodyIdSchema, expectedVersion: codExpectedVersionSchema, expectedPaymentReceiptVersion: codExpectedVersionSchema, expectedBankStatementLineVersion: codExpectedVersionSchema });
const closeCodShortfallSchema = matchCodBankSchema.extend({ resolutionReference: codEvidenceReferenceSchema });
const recordCodExceptionSchema = z.object({ id: codCustodyIdSchema, outcome: z.enum(['refused-rto', 'cancelled']), evidenceReference: codEvidenceReferenceSchema, occurredAt: codInstantSchema, reason: z.string().trim().min(4).max(500), expectedVersion: codExpectedVersionSchema, expectedShipmentVersion: codExpectedVersionSchema });
const createShipmentPackageSchema = z.object({ salesOrderId: z.string().trim().min(1).max(100), fromLocationId: z.string().trim().min(1).max(100), shipToAddressId: z.string().trim().min(1).max(100).optional(), deliveryPromiseId: z.string().trim().min(1).max(100).optional(), reservationIds: z.array(z.string().trim().min(1).max(100)).min(1).max(500), grossWeightKg: z.number().positive().max(1_000_000), lengthCm: z.number().positive().max(100_000), widthCm: z.number().positive().max(100_000), heightCm: z.number().positive().max(100_000), ewayBillRequired: z.boolean() });
const transitionShipmentSchema = z.object({ id: z.string().trim().min(1).max(100), toStatus: z.enum(['planned', 'packed', 'ready-to-dispatch', 'dispatched', 'in-transit', 'delivered', 'return-in-progress', 'returned', 'cancelled']), carrierAdapterId: z.string().trim().min(1).max(100).optional(), trackingNumber: z.string().trim().min(3).max(120).optional(), vehicleNumber: z.string().trim().min(3).max(40).optional(), transportDocumentNumber: z.string().trim().min(3).max(120).optional(), location: z.string().trim().min(2).max(160), notes: z.string().trim().min(3).max(500), expectedVersion: z.number().int().positive() });
const configureCarrierAdapterSchema = z.object({ code: z.string().trim().min(2).max(21), name: z.string().trim().min(2).max(160), mode: z.enum(['manual', 'api']), status: z.enum(['configured', 'healthy', 'degraded', 'disabled']), capability: z.array(z.enum(['booking', 'tracking', 'label', 'proof-of-delivery'])).min(1).max(4) });
const returnItemSchema = z.object({ lineId: z.string().trim().min(1).max(100), productId: z.string().trim().min(1).max(100), quantity: z.number().positive().max(1_000_000_000) });
const createReturnAuthorizationSchema = z.object({ shipmentPackageId: z.string().trim().min(1).max(100), reason: z.string().trim().min(4).max(500), items: z.array(returnItemSchema).min(1).max(500) });
const decideReturnAuthorizationSchema = z.object({ id: z.string().trim().min(1).max(100), decision: z.enum(['approved', 'rejected']), expectedVersion: z.number().int().positive() });
const receiveReturnSchema = z.object({ id: z.string().trim().min(1).max(100), reference: z.string().trim().min(3).max(120), receivedAt: z.iso.datetime(), expectedVersion: z.number().int().positive() });
const inspectReturnSchema = z.object({ id: z.string().trim().min(1).max(100), disposition: z.enum(['restock', 'quarantine', 'scrap', 'return-to-vendor']), evidenceReference: z.string().trim().min(3).max(160), notes: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const prepareStatutoryExchangeSchema = z.object({ kind: z.enum(['e-invoice', 'e-way-bill']), sourceId: z.string().trim().min(1).max(100), gstRegistrationId: z.string().trim().min(1).max(100) });
const submitStatutoryExchangeSchema = z.object({ id: z.string().trim().min(1).max(100), requestReference: z.string().trim().min(3).max(160), expectedVersion: z.number().int().positive() });
const recordStatutoryResponseSchema = z.object({ id: z.string().trim().min(1).max(100), outcome: z.enum(['acknowledged', 'failed']), externalNumber: z.string().trim().min(3).max(160).optional(), acknowledgementNumber: z.string().trim().min(3).max(160).optional(), acknowledgedAt: z.iso.datetime().optional(), validUntil: z.iso.datetime().optional(), qrPayload: z.string().trim().max(4000).optional(), signedPayloadChecksum: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional(), errorCode: z.string().trim().min(2).max(80).optional(), errorMessage: z.string().trim().min(4).max(500).optional(), expectedVersion: z.number().int().positive() });
const statutoryCapabilitySchema = z.enum(['submit-irn', 'cancel-irn', 'eway-bill', 'cancel-ewb', 'close-ewb', 'extend-ewb', 'consolidated-ewb', 'status-pull', 'signature-verify']);
const configureStatutoryAdapterSchema = z.object({ code: z.string().trim().min(2).max(24), name: z.string().trim().min(2).max(160), provider: z.string().trim().min(2).max(120), environment: z.enum(['sandbox', 'production']), baseUrl: z.url().startsWith('https://'), statusPathTemplate: z.string().trim().startsWith('/').max(500), healthPath: z.string().trim().startsWith('/').max(500), capabilities: z.array(statutoryCapabilitySchema).min(1).max(9) });
const configureStatutoryCredentialsSchema = z.object({ adapterId: z.string().trim().min(1).max(100), clientId: z.string().trim().min(1).max(4096).optional(), clientSecret: z.string().trim().min(1).max(4096).optional(), username: z.string().trim().min(1).max(4096).optional(), password: z.string().trim().min(1).max(4096).optional(), apiKey: z.string().trim().min(1).max(4096).optional(), bearerToken: z.string().trim().min(1).max(4096).optional() }).refine((input) => Boolean(input.clientId || input.clientSecret || input.username || input.password || input.apiKey || input.bearerToken), 'Provide at least one adapter credential.');
const prepareStatutoryOperationSchema = z.object({ kind: z.enum(['cancel-irn', 'cancel-ewb', 'close-ewb', 'extend-ewb']), exchangeId: z.string().trim().min(1).max(100), adapterId: z.string().trim().min(1).max(100), reasonCode: z.string().trim().min(1).max(12), remarks: z.string().trim().min(4).max(50), effectiveDate: z.iso.datetime().optional(), vehicleNumber: z.string().trim().min(3).max(40).optional(), transportDocumentNumber: z.string().trim().min(3).max(120).optional(), transportMode: z.enum(['road', 'rail', 'air', 'ship', 'in-transit']).optional(), consignmentStatus: z.enum(['movement', 'transit']).optional(), transitType: z.enum(['road', 'warehouse', 'other']).optional(), fromPlace: z.string().trim().min(2).max(120).optional(), fromStateCode: indiaStateCodeSchema.optional(), fromPincode: z.string().regex(/^\d{6}$/).optional(), remainingDistanceKm: z.number().positive().max(1_000_000).optional(), requestedValidUntil: z.iso.datetime().optional() });
const submitStatutoryOperationSchema = z.object({ id: z.string().trim().min(1).max(100), requestReference: z.string().trim().min(3).max(160), expectedVersion: z.number().int().positive() });
const recordStatutoryOperationResponseSchema = z.object({ id: z.string().trim().min(1).max(100), outcome: z.enum(['acknowledged', 'failed']), externalReference: z.string().trim().min(3).max(160).optional(), acknowledgedAt: z.iso.datetime().optional(), validUntil: z.iso.datetime().optional(), errorCode: z.string().trim().min(2).max(80).optional(), errorMessage: z.string().trim().min(4).max(500).optional(), expectedVersion: z.number().int().positive() });
const prepareConsolidatedEwayBillSchema = z.object({ adapterId: z.string().trim().min(1).max(100), gstRegistrationId: z.string().trim().min(1).max(100), exchangeIds: z.array(z.string().trim().min(1).max(100)).min(2).max(100), transportMode: z.enum(['road', 'rail', 'air', 'ship']), vehicleNumber: z.string().trim().min(3).max(40).optional(), transportDocumentNumber: z.string().trim().min(3).max(120).optional(), fromPlace: z.string().trim().min(2).max(120), fromStateCode: indiaStateCodeSchema });
const submitConsolidatedEwayBillSchema = submitStatutoryOperationSchema;
const recordConsolidatedEwayBillResponseSchema = z.object({ id: z.string().trim().min(1).max(100), outcome: z.enum(['acknowledged', 'failed']), externalNumber: z.string().trim().min(12).max(24).optional(), generatedAt: z.iso.datetime().optional(), errorCode: z.string().trim().min(2).max(80).optional(), errorMessage: z.string().trim().min(4).max(500).optional(), expectedVersion: z.number().int().positive() });
const verifyStatutorySignatureSchema = z.object({ exchangeId: z.string().trim().min(1).max(100), adapterId: z.string().trim().min(1).max(100).optional(), artifact: z.enum(['signed-json', 'signed-qr', 'operator-document']), algorithm: z.enum(['RSA-SHA256', 'RSA-SHA512', 'ECDSA-SHA256']), payloadBase64: z.string().min(1).max(7_000_000), signatureBase64: z.string().min(1).max(24_000), certificatePem: z.string().min(64).max(32_768) });
const runPortalReconciliationSchema = z.object({ adapterId: z.string().trim().min(1).max(100), exchangeIds: z.array(z.string().trim().min(1).max(100)).min(1).max(100) });
const providerCapabilitySchema = z.enum(['payment-release', 'payment-status-pull', 'statement-pull', 'payroll-disbursement', 'payroll-status-pull', 'payslip-delivery', 'statutory-filing', 'statutory-status-pull', 'email-delivery', 'whatsapp-delivery']);
const configureProviderConnectorSchema = z.object({ code: z.string().trim().min(2).max(24), name: z.string().trim().min(2).max(160), providerLegalName: z.string().trim().min(2).max(160), domain: z.enum(['banking', 'payroll', 'messaging', 'statutory']), environment: z.enum(['sandbox', 'production']), baseUrl: z.url().startsWith('https://'), statusPathTemplate: z.string().trim().startsWith('/').max(500), capabilities: z.array(providerCapabilitySchema).min(1).max(10), specificationVersion: z.string().trim().min(1).max(80) });
const configureProviderCredentialsSchema = z.object({ connectorId: z.string().trim().min(1).max(100), clientId: z.string().trim().min(1).max(8192).optional(), clientSecret: z.string().trim().min(1).max(8192).optional(), apiKey: z.string().trim().min(1).max(8192).optional(), bearerToken: z.string().trim().min(1).max(8192).optional(), signingKey: z.string().trim().min(1).max(8192).optional() }).refine((input) => Boolean(input.clientId || input.clientSecret || input.apiKey || input.bearerToken || input.signingKey), 'Provide at least one provider credential.');
const createProviderConformanceCaseSchema = z.object({ connectorId: z.string().trim().min(1).max(100), capability: z.enum(['payment-release', 'payment-status-pull', 'statement-pull', 'payroll-disbursement', 'payroll-status-pull', 'payslip-delivery', 'statutory-filing', 'statutory-status-pull', 'email-delivery', 'whatsapp-delivery']).optional(), suiteName: z.string().trim().min(2).max(160), suiteVersion: z.string().trim().min(1).max(80), scenario: z.string().trim().min(8).max(500) });
const planProviderConformancePackSchema = z.object({ connectorId: z.string().trim().min(1).max(100), suiteName: z.string().trim().min(2).max(160), suiteVersion: z.string().trim().min(1).max(80) }).strict();
const executeProviderPreflightSchema = z.object({ connectorId: z.string().trim().min(1).max(100), method: z.enum(['GET', 'POST']), path: z.string().trim().startsWith('/').max(500), payloadJson: z.string().max(100000).optional(), evidenceReference: z.string().trim().min(4).max(240), expectedConnectorVersion: z.number().int().positive() });
const recordProviderConformanceResultSchema = z.object({ id: z.string().trim().min(1).max(100), result: z.enum(['passed', 'failed']), evidenceReference: z.string().trim().min(4).max(240), resultChecksum: z.string().trim().regex(/^[a-fA-F0-9]{64}$/), expectedVersion: z.number().int().positive() });
const approveProviderConnectorSchema = z.object({ id: z.string().trim().min(1).max(100), expectedVersion: z.number().int().positive() });
const prepareProviderSubmissionSchema = z.object({ connectorId: z.string().trim().min(1).max(100), capability: providerCapabilitySchema, sourceIds: z.array(z.string().trim().min(1).max(100)).min(1).max(200) });
const handOffProviderSubmissionSchema = z.object({ id: z.string().trim().min(1).max(100), requestReference: z.string().trim().min(4).max(160), expectedVersion: z.number().int().positive() });
const recordProviderSubmissionResponseSchema = z.object({ id: z.string().trim().min(1).max(100), outcome: z.enum(['acknowledged', 'failed']), externalReference: z.string().trim().min(3).max(160).optional(), receivedAt: z.iso.datetime().optional(), responseChecksum: z.string().trim().regex(/^[a-fA-F0-9]{64}$/), errorCode: z.string().trim().min(2).max(80).optional(), errorMessage: z.string().trim().min(4).max(500).optional(), expectedVersion: z.number().int().positive() });
const runProviderReconciliationSchema = z.object({ connectorId: z.string().trim().min(1).max(100), submissionIds: z.array(z.string().trim().min(1).max(100)).min(1).max(100) });
const collectionsIdSchema = z.string().trim().min(1).max(100);
const proposeCreditLimitSchema = z.object({ accountId: collectionsIdSchema, creditLimit: z.number().min(0).max(1_000_000_000_000), warningThresholdPercent: z.number().min(1).max(100), graceDays: z.number().int().min(0).max(365), blockNewOrders: z.boolean(), riskGrade: z.enum(['A', 'B', 'C', 'D', 'watchlist']), rationale: z.string().trim().min(8).max(500) });
const decideCreditLimitSchema = z.object({ id: collectionsIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const runDunningSchema = z.object({ asOfDate: z.iso.date(), ownerId: collectionsIdSchema });
const recordCollectionActivitySchema = z.object({ dunningCaseId: collectionsIdSchema, channel: z.enum(['email', 'phone', 'whatsapp', 'letter', 'visit']), outcome: z.enum(['promised-to-pay', 'no-contact', 'dispute-raised', 'paid', 'escalated']), notes: z.string().trim().min(4).max(500), promisedAmount: z.number().positive().max(1_000_000_000_000).optional(), promisedDate: z.iso.date().optional(), expectedVersion: z.number().int().positive() });
const openReceivableDisputeSchema = z.object({ receivableId: collectionsIdSchema, category: z.enum(['billing', 'quality', 'delivery', 'tax', 'contract', 'other']), amount: z.number().positive().max(1_000_000_000_000), reason: z.string().trim().min(8).max(500), evidenceReference: z.string().trim().min(3).max(200), ownerId: collectionsIdSchema });
const resolveReceivableDisputeSchema = z.object({ id: collectionsIdSchema, resolution: z.enum(['credit-note', 'write-off', 'settled', 'rejected', 'withdrawn']), resolutionReference: z.string().trim().min(3).max(200), expectedVersion: z.number().int().positive() });
const requestWriteOffSchema = z.object({ receivableId: collectionsIdSchema, amount: z.number().positive().max(1_000_000_000_000), reason: z.string().trim().min(8).max(500), evidenceReference: z.string().trim().min(3).max(200) });
const decideWriteOffSchema = z.object({ id: collectionsIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createWithholdingPolicySchema = z.object({ code: z.string().trim().min(2).max(24), name: z.string().trim().min(2).max(160), kind: z.enum(['TDS', 'TCS']), lawVersion: z.enum(['income-tax-act-1961', 'income-tax-act-2025']), sectionReference: z.string().trim().min(3).max(120), tableItem: z.string().trim().min(1).max(120).optional(), trigger: z.enum(['earlier-credit-payment', 'receipt', 'debit-or-receipt']), ratePercent: z.number().min(0).max(100), thresholdAmount: z.number().min(0).max(1_000_000_000_000), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().optional(), sourceUrl: z.url().startsWith('https://') });
const recordWithholdingEntrySchema = z.object({ policyId: collectionsIdSchema, accountId: collectionsIdSchema, receivableId: collectionsIdSchema.optional(), direction: z.enum(['customer-deducted-tds', 'company-deducted-tds', 'company-collected-tcs']), eventDate: z.iso.date(), baseAmount: z.number().positive().max(1_000_000_000_000), counterpartyPan: z.string().trim().length(10), certificateOrChallanReference: z.string().trim().min(3).max(160).optional() });
const transitionWithholdingEntrySchema = z.object({ id: collectionsIdSchema, toStatus: z.enum(['deposited', 'filed', 'reconciled']), reference: z.string().trim().min(3).max(160), expectedVersion: z.number().int().positive() });
const prepareZeroRatedSupplySchema = z.object({ invoiceId: collectionsIdSchema, supplyType: z.enum(['export-goods', 'export-services', 'sez-unit', 'sez-developer']), taxRoute: z.enum(['lut-bond-without-payment', 'igst-paid-refund']), destinationCountryCode: z.string().trim().length(2).optional(), recipientName: z.string().trim().min(2).max(200), recipientAddress: z.string().trim().min(5).max(500), sezGstin: z.string().trim().length(15).optional(), lutBondNumber: z.string().trim().min(2).max(120).optional(), lutBondDate: z.iso.date().optional(), lutBondValidUntil: z.iso.date().optional(), shippingBillNumber: z.string().trim().min(2).max(120).optional(), portCode: z.string().trim().min(2).max(20).optional(), authorisedOperationsEvidence: z.string().trim().min(3).max(500).optional() });
const decideZeroRatedSupplySchema = z.object({ id: collectionsIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createBankAccountSchema = z.object({ code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(160), bankName: z.string().trim().min(2).max(160), maskedAccountNumber: z.string().trim().min(8).max(20), ifsc: z.string().trim().length(11) });
const previewBankStatementSchema = z.object({ bankAccountId: collectionsIdSchema, fileName: z.string().trim().min(3).max(160), csvContent: z.string().min(20).max(5_000_000) });
const commitBankStatementSchema = z.object({ id: collectionsIdSchema, expectedVersion: z.number().int().positive() });
const confirmBankMatchSchema = z.object({ lineId: collectionsIdSchema, paymentReceiptId: collectionsIdSchema, expectedVersion: z.number().int().positive() });
const excludeBankLineSchema = z.object({ lineId: collectionsIdSchema, reason: z.string().trim().min(4).max(300), expectedVersion: z.number().int().positive() });
const procurementIdSchema = z.string().trim().min(1).max(100);
const createSupplierSchema = z.object({ code: z.string().trim().min(2).max(20), legalName: z.string().trim().min(2).max(200), tradeName: z.string().trim().min(2).max(200).optional(), gstin: z.string().trim().length(15).optional(), pan: z.string().trim().length(10).optional(), stateCode: indiaStateCodeSchema, email: z.string().trim().email().max(200), paymentTermDays: z.number().int().min(0).max(365), categories: z.array(z.string().trim().min(2).max(50)).min(1).max(12), riskRating: z.enum(['low', 'medium', 'high']), qualificationEvidence: z.string().trim().min(6).max(300) });
const decideSupplierSchema = z.object({ id: procurementIdSchema, decision: z.enum(['approved', 'rejected', 'suspended']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const requisitionLineSchema = z.object({ itemVariantId: procurementIdSchema, quantity: z.number().positive().max(1_000_000_000), estimatedUnitPrice: z.number().min(0).max(1_000_000_000_000) });
const createPurchaseRequisitionSchema = z.object({ title: z.string().trim().min(3).max(200), warehouseId: procurementIdSchema, priority: z.enum(['low', 'normal', 'high']), neededBy: z.iso.date(), justification: z.string().trim().min(6).max(500), lines: z.array(requisitionLineSchema).min(1).max(50) });
const decidePurchaseRequisitionSchema = z.object({ id: procurementIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createRfqFromRequisitionSchema = z.object({ requisitionId: procurementIdSchema, supplierIds: z.array(procurementIdSchema).min(1).max(12), requiredBy: z.iso.date(), expectedVersion: z.number().int().positive() });
const procurementLineSchema = z.object({ itemVariantId: procurementIdSchema, quantity: z.number().positive().max(1_000_000_000) });
const createRfqSchema = z.object({ title: z.string().trim().min(3).max(200), warehouseId: procurementIdSchema, supplierIds: z.array(procurementIdSchema).min(1).max(12), lines: z.array(procurementLineSchema).min(1).max(50), requiredBy: z.iso.date() });
const issueRfqSchema = z.object({ id: procurementIdSchema, expectedVersion: z.number().int().positive() });
const supplierQuoteLineSchema = z.object({ rfqLineId: procurementIdSchema, unitPrice: z.number().positive().max(1_000_000_000_000), gstRate: z.number().min(0).max(100) });
const recordSupplierQuotationSchema = z.object({ rfqId: procurementIdSchema, supplierId: procurementIdSchema, validUntil: z.iso.date(), leadTimeDays: z.number().int().min(0).max(730), lines: z.array(supplierQuoteLineSchema).min(1).max(50), commercialRemarks: z.string().trim().max(500).optional() });
const awardRfqSchema = z.object({ rfqId: procurementIdSchema, supplierQuotationId: procurementIdSchema, expectedVersion: z.number().int().positive() });
const createPoFromRfqSchema = z.object({ rfqId: procurementIdSchema, supplierQuotationId: procurementIdSchema, deliveryBy: z.iso.date() });
const createPoFromReorderSchema = z.object({ reorderProposalId: procurementIdSchema, supplierId: procurementIdSchema, warehouseId: procurementIdSchema, unitPrice: z.number().positive().max(1_000_000_000_000), gstRate: z.number().min(0).max(100), deliveryBy: z.iso.date() });
const decidePurchaseOrderSchema = z.object({ id: procurementIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const goodsReceiptLineSchema = z.object({ purchaseOrderLineId: procurementIdSchema, quantity: z.number().positive().max(1_000_000_000), batchNumber: z.string().trim().min(1).max(120).optional(), manufacturedAt: z.iso.date().optional(), expiresAt: z.iso.date().optional(), serialNumbers: z.array(z.string().trim().min(1).max(160)).max(100000) });
const recordGoodsReceiptSchema = z.object({ purchaseOrderId: procurementIdSchema, receivingBinId: procurementIdSchema, receivedAt: z.iso.date(), lines: z.array(goodsReceiptLineSchema).min(1).max(50) });
const landedCostChargeSchema = z.object({ description: z.string().trim().min(2).max(300), amount: z.number().positive().max(1_000_000_000_000) });
const createLandedCostSchema = z.object({ goodsReceiptId: procurementIdSchema, basis: z.enum(['value', 'quantity']), charges: z.array(landedCostChargeSchema).min(1).max(20) });
const decideLandedCostSchema = z.object({ id: procurementIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const supplierInvoiceLineSchema = z.object({ purchaseOrderLineId: procurementIdSchema, quantity: z.number().positive().max(1_000_000_000), unitPrice: z.number().positive().max(1_000_000_000_000), gstRate: z.number().min(0).max(100) });
const recordSupplierInvoiceSchema = z.object({ purchaseOrderId: procurementIdSchema, goodsReceiptId: procurementIdSchema, supplierInvoiceNumber: z.string().trim().min(2).max(120), invoiceDate: z.iso.date(), lines: z.array(supplierInvoiceLineSchema).min(1).max(50) });
const decideThreeWayMatchSchema = z.object({ id: procurementIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const updateRetailPriceForTargetMarginSchema = z.object({ itemVariantId: z.string().trim().min(1).max(100), targetUnitPrice: z.number().positive().max(1_000_000_000) });
const treasuryIdSchema = z.string().trim().min(1).max(100);
const recordTreasuryPositionSchema = z.object({ bankAccountId: treasuryIdSchema, asOfDate: z.iso.date(), availableBalance: z.number().min(-1_000_000_000_000).max(1_000_000_000_000), source: z.enum(['bank-statement', 'treasury-control']), evidenceReference: z.string().trim().min(4).max(160) });
const runCashForecastSchema = z.object({ asOfDate: z.iso.date(), horizonDays: z.number().int().min(7).max(180), scenario: z.enum(['base', 'conservative', 'upside']) });
const createPaymentProposalSchema = z.object({ supplierInvoiceId: treasuryIdSchema, bankAccountId: treasuryIdSchema, paymentDate: z.iso.date(), amount: z.number().positive().max(1_000_000_000_000), paymentReference: z.string().trim().min(3).max(120), purpose: z.string().trim().min(6).max(300) });
const decidePaymentProposalSchema = z.object({ id: treasuryIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const releasePaymentProposalSchema = z.object({ id: treasuryIdSchema, bankReleaseReference: z.string().trim().min(4).max(160), expectedVersion: z.number().int().positive() });
const settlePaymentProposalSchema = z.object({ id: treasuryIdSchema, outcome: z.enum(['settled', 'failed']), settlementReference: z.string().trim().min(4).max(160), settledAt: z.iso.date(), actualAmount: z.number().min(0).max(1_000_000_000_000), expectedVersion: z.number().int().positive() });
const recordBankChargeSchema = z.object({ bankAccountId: treasuryIdSchema, chargeDate: z.iso.date(), category: z.enum(['transaction-fee', 'interest', 'gst', 'other']), amount: z.number().positive().max(1_000_000_000_000), taxAmount: z.number().min(0).max(1_000_000_000_000), reference: z.string().trim().min(4).max(160) });
const reconcileBankChargeSchema = z.object({ id: treasuryIdSchema, expectedVersion: z.number().int().positive() });
const openSettlementExceptionSchema = z.object({ paymentProposalId: treasuryIdSchema, code: z.enum(['not-received', 'rejected', 'duplicate', 'amount-mismatch', 'bank-charge', 'other']), amount: z.number().min(0).max(1_000_000_000_000), details: z.string().trim().min(4).max(500), ownerId: treasuryIdSchema });
const resolveSettlementExceptionSchema = z.object({ id: treasuryIdSchema, resolution: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive(), writtenOff: z.boolean().optional() });
const createLiquiditySweepSchema = z.object({ fromBankAccountId: treasuryIdSchema, toBankAccountId: treasuryIdSchema, amount: z.number().positive().max(1_000_000_000_000), effectiveDate: z.iso.date(), rationale: z.string().trim().min(8).max(500) });
const decideLiquiditySweepSchema = z.object({ id: treasuryIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const releaseLiquiditySweepSchema = z.object({ id: treasuryIdSchema, releaseReference: z.string().trim().min(4).max(160), expectedVersion: z.number().int().positive() });
const settleLiquiditySweepSchema = z.object({ id: treasuryIdSchema, outcome: z.enum(['settled', 'failed']), settlementReference: z.string().trim().min(4).max(160), expectedVersion: z.number().int().positive() });
const manufacturingIdSchema = z.string().trim().min(1).max(100);
const createWorkCenterSchema = z.object({ code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(160), warehouseId: manufacturingIdSchema, capacityMinutesPerDay: z.number().min(30).max(86_400), efficiencyPercent: z.number().min(1).max(150), costRatePerHour: z.number().min(0).max(10_000_000) });
const bomComponentSchema = z.object({ itemVariantId: manufacturingIdSchema, quantityPerOutput: z.number().positive().max(1_000_000_000), scrapPercent: z.number().min(0).max(100), issueMethod: z.enum(['backflush', 'manual']) });
const bomOperationSchema = z.object({ sequence: z.number().int().positive().max(1000), workCenterId: manufacturingIdSchema, setupMinutes: z.number().min(0).max(1_000_000), runMinutesPerOutput: z.number().positive().max(1_000_000), qualityGate: z.boolean() });
const createBomRevisionSchema = z.object({ outputVariantId: manufacturingIdSchema, outputQuantity: z.number().positive().max(1_000_000_000), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().optional(), components: z.array(bomComponentSchema).min(1).max(100), operations: z.array(bomOperationSchema).min(1).max(30) });
const decideBomRevisionSchema = z.object({ id: manufacturingIdSchema, decision: z.enum(['released', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const qualityCheckSchema = z.object({ label: z.string().trim().min(2).max(160), unit: z.string().trim().min(1).max(30), minimum: z.number().optional(), maximum: z.number().optional(), critical: z.boolean() });
const createQualityPlanSchema = z.object({ outputVariantId: manufacturingIdSchema, name: z.string().trim().min(2).max(160), sampleSize: z.number().int().positive().max(1_000_000), checks: z.array(qualityCheckSchema).min(1).max(30) });
const decideQualityPlanSchema = z.object({ id: manufacturingIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createWorkOrderSchema = z.object({ bomRevisionId: manufacturingIdSchema, qualityPlanId: manufacturingIdSchema.optional(), warehouseId: manufacturingIdSchema, outputBinId: manufacturingIdSchema, quantityPlanned: z.number().positive().max(1_000_000_000), plannedStart: z.iso.date(), plannedEnd: z.iso.date() });
const decideWorkOrderSchema = z.object({ id: manufacturingIdSchema, decision: z.enum(['released', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const startWorkOrderSchema = z.object({ id: manufacturingIdSchema, expectedVersion: z.number().int().positive() });
const issueWorkOrderMaterialSchema = z.object({ workOrderId: manufacturingIdSchema, bomComponentId: manufacturingIdSchema, binId: manufacturingIdSchema, batchId: manufacturingIdSchema.optional(), serialUnitIds: z.array(manufacturingIdSchema).max(100000), quantity: z.number().positive().max(1_000_000_000), issuedAt: z.iso.date() });
const qualityInspectionResultSchema = z.object({ checkId: manufacturingIdSchema, measuredValue: z.number().finite() });
const recordQualityInspectionSchema = z.object({ workOrderId: manufacturingIdSchema, qualityPlanId: manufacturingIdSchema, stage: z.enum(['in-process', 'final']), sampleQuantity: z.number().positive().max(1_000_000_000), results: z.array(qualityInspectionResultSchema).min(1).max(30) });
const resolveNonconformanceSchema = z.object({ id: manufacturingIdSchema, disposition: z.enum(['rework', 'use-as-is', 'scrap']), resolution: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const recordProductionOutputSchema = z.object({ workOrderId: manufacturingIdSchema, quantity: z.number().positive().max(1_000_000_000), recordedAt: z.iso.date(), batchNumber: z.string().trim().min(1).max(120).optional(), serialNumbers: z.array(z.string().trim().min(1).max(160)).max(100000) });
const deliveryIdSchema = z.string().trim().min(1).max(100);
const createProjectSchema = z.object({ accountId: deliveryIdSchema.optional(), salesOrderId: deliveryIdSchema.optional(), name: z.string().trim().min(2).max(160), deliveryModel: z.enum(['fixed-price', 'time-and-materials', 'internal']), budgetAmount: z.number().min(0).max(1_000_000_000_000), plannedHours: z.number().positive().max(10_000_000), startDate: z.iso.date(), targetDate: z.iso.date(), managerUserId: deliveryIdSchema });
const decideProjectSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const transitionProjectSchema = z.object({ id: deliveryIdSchema, toStatus: z.enum(['on-hold', 'completed', 'cancelled']), reason: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createProjectTaskSchema = z.object({ projectId: deliveryIdSchema, title: z.string().trim().min(2).max(160), description: z.string().trim().min(4).max(500).optional(), plannedHours: z.number().positive().max(1_000_000), billable: z.boolean(), assigneeUserId: deliveryIdSchema, dueDate: z.iso.date() });
const transitionProjectTaskSchema = z.object({ id: deliveryIdSchema, toStatus: z.enum(['planned', 'in-progress', 'blocked', 'completed', 'cancelled']), blockedReason: z.string().trim().min(4).max(500).optional(), expectedVersion: z.number().int().positive() });
const recordTimeEntrySchema = z.object({ projectTaskId: deliveryIdSchema, workDate: z.iso.date(), hours: z.number().positive().max(24), notes: z.string().trim().min(4).max(500) });
const decideTimeEntrySchema = z.object({ id: deliveryIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const slaTargetSchema = z.object({ priority: z.enum(['critical', 'high', 'normal', 'low']), responseMinutes: z.number().int().min(5).max(1_000_000), resolutionMinutes: z.number().int().min(5).max(10_000_000) });
const createServiceAgreementSchema = z.object({ accountId: deliveryIdSchema, projectId: deliveryIdSchema.optional(), name: z.string().trim().min(2).max(160), coverage: z.enum(['remote', 'on-site', 'hybrid']), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date(), includedHours: z.number().min(0).max(10_000_000), targets: z.array(slaTargetSchema).length(4) });
const decideServiceAgreementSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createSupportTicketSchema = z.object({ agreementId: deliveryIdSchema, projectId: deliveryIdSchema.optional(), addressId: deliveryIdSchema.optional(), title: z.string().trim().min(2).max(160), details: z.string().trim().min(8).max(500), channel: z.enum(['portal', 'email', 'phone', 'field']), priority: z.enum(['critical', 'high', 'normal', 'low']) });
const transitionSupportTicketSchema = z.object({ id: deliveryIdSchema, toStatus: z.enum(['new', 'triaged', 'in-progress', 'pending-customer', 'resolved', 'closed', 'cancelled']), assignedTo: deliveryIdSchema.optional(), resolution: z.string().trim().min(6).max(500).optional(), rootCause: z.string().trim().min(4).max(500).optional(), expectedVersion: z.number().int().positive() });
const createFieldServiceJobSchema = z.object({ ticketId: deliveryIdSchema, addressId: deliveryIdSchema, technicianUserId: deliveryIdSchema, scheduledStart: z.iso.datetime(), scheduledEnd: z.iso.datetime() });
const transitionFieldServiceJobSchema = z.object({ id: deliveryIdSchema, toStatus: z.enum(['planned', 'dispatched', 'on-site', 'completed', 'cancelled']), report: z.string().trim().min(8).max(500).optional(), completionEvidenceReference: z.string().trim().min(4).max(160).optional(), expectedVersion: z.number().int().positive() });
const createWorkforceProfileSchema = z.object({ userId: deliveryIdSchema, employeeCode: z.string().trim().min(3).max(40), department: z.string().trim().min(2).max(160), jobTitle: z.string().trim().min(2).max(160), employmentType: z.enum(['employee', 'contractor', 'consultant']), standardDailyHours: z.number().positive().max(24), hourlyCost: z.number().min(0).max(10_000_000), fieldEligible: z.boolean(), skills: z.array(z.string().trim().min(2).max(80)).max(50), effectiveFrom: z.iso.date() });
const decideWorkforceProfileSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const recordWorkforceAvailabilitySchema = z.object({ workforceProfileId: deliveryIdSchema, workDate: z.iso.date(), kind: z.enum(['working', 'leave', 'holiday', 'training', 'unavailable']), availableHours: z.number().min(0).max(24), reason: z.string().trim().min(4).max(500) });
const decideWorkforceAvailabilitySchema = z.object({ id: deliveryIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createWorkforceAllocationSchema = z.object({ workforceProfileId: deliveryIdSchema, projectTaskId: deliveryIdSchema, workDate: z.iso.date(), allocatedHours: z.number().positive().max(24) });
const cancelWorkforceAllocationSchema = z.object({ id: deliveryIdSchema, reason: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createProjectBillingPlanSchema = z.object({ projectId: deliveryIdSchema, salesOrderId: deliveryIdSchema, salesOrderLineId: deliveryIdSchema, billingModel: z.enum(['time-and-materials', 'milestone']), billRate: z.number().min(0).max(1_000_000_000), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date() });
const decideProjectBillingPlanSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createProjectBillingClaimSchema = z.object({ planId: deliveryIdSchema, billingPeriodFrom: z.iso.date(), billingPeriodTo: z.iso.date(), timeEntryIds: z.array(deliveryIdSchema).max(100_000), milestoneIds: z.array(deliveryIdSchema).max(100_000) });
const decideProjectBillingClaimSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['recognized', 'rejected']), recognitionDate: z.iso.date(), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const consumeServiceEntitlementSchema = z.object({ serviceAgreementId: deliveryIdSchema, timeEntryId: deliveryIdSchema });
const createAccountingClosePeriodSchema = z.object({ name: z.string().trim().min(2).max(160), periodFrom: z.iso.date(), periodTo: z.iso.date() });
const decideAccountingClosePeriodSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['closed', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const reopenAccountingClosePeriodSchema = z.object({ id: deliveryIdSchema, reason: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const projectCommercialCurrencySchema = z.enum(['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY']);
const createProjectExchangeRateSchema = z.object({ sourceCurrency: z.enum(['USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY']), rate: z.number().positive().max(10_000_000), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date(), sourceReference: z.string().trim().min(3).max(160), evidenceReference: z.string().trim().min(3).max(240) });
const decideProjectExchangeRateSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['verified', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createProjectCurrencyProfileSchema = z.object({ projectId: deliveryIdSchema, contractCurrency: projectCommercialCurrencySchema, contractBaselineAmount: z.number().min(0).max(1_000_000_000_000), conversionBasis: z.enum(['verified-spot', 'contractual']), exchangeRateId: deliveryIdSchema.optional() });
const decideProjectCurrencyProfileSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createProjectContractVariationSchema = z.object({ projectId: deliveryIdSchema, title: z.string().trim().min(2).max(160), kind: z.enum(['scope', 'rate', 'schedule', 'commercial']), amountDelta: z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000), effectiveDate: z.iso.date(), rationale: z.string().trim().min(4).max(500), evidenceReference: z.string().trim().min(3).max(240) });
const decideProjectContractVariationSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createProjectRetainerSchema = z.object({ projectId: deliveryIdSchema, name: z.string().trim().min(2).max(160), contractAmount: z.number().positive().max(1_000_000_000_000), includedHours: z.number().positive().max(10_000_000), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date(), billingCadence: z.enum(['monthly', 'quarterly', 'one-time']), evidenceReference: z.string().trim().min(3).max(240) });
const decideProjectRetainerSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createRetainerDrawdownSchema = z.object({ retainerId: deliveryIdSchema, timeEntryIds: z.array(deliveryIdSchema).min(1).max(100_000) });
const decideRetainerDrawdownSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createProjectResourcePlanSchema = z.object({ projectId: deliveryIdSchema, workforceProfileId: deliveryIdSchema, periodFrom: z.iso.date(), periodTo: z.iso.date(), plannedHours: z.number().positive().max(10_000_000), billable: z.boolean() });
const decideProjectResourcePlanSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const generateProjectMarginReviewSchema = z.object({ projectId: deliveryIdSchema, asOfDate: z.iso.date() });
const reviewProjectMarginSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['reviewed', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const employerAuthoritySchema = z.enum(['income-tax', 'epfo', 'esic', 'labour']);
const createEmployerRegistrationSchema = z.object({ authority: employerAuthoritySchema, registrationCode: z.string().trim().min(3).max(80), legalEntityName: z.string().trim().min(2).max(160), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().optional() });
const decideEmployerRegistrationSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createPayrollPolicySchema = z.object({ code: z.string().trim().min(2).max(32), name: z.string().trim().min(2).max(160), authority: employerAuthoritySchema.optional(), componentKind: z.enum(['employee-deduction', 'employer-contribution']), calculationBase: z.enum(['basic', 'gross']), calculationMethod: z.enum(['percentage', 'fixed']), rate: z.number().min(0).max(1_000_000_000), wageCeiling: z.number().positive().max(1_000_000_000).optional(), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().optional(), sourceReference: z.string().trim().min(8).max(500), requiredForFinalization: z.boolean() });
const decidePayrollPolicySchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createPayrollCompensationSchema = z.object({ workforceProfileId: deliveryIdSchema, monthlyBasic: z.number().min(0).max(1_000_000_000), monthlyAllowances: z.number().min(0).max(1_000_000_000), paymentMethod: z.enum(['bank-transfer', 'upi', 'other']), paymentReferenceToken: z.string().trim().min(4).max(160), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().optional() });
const decidePayrollCompensationSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createBenefitPlanSchema = z.object({ code: z.string().trim().min(2).max(32), name: z.string().trim().min(2).max(160), category: z.enum(['health', 'insurance', 'meal', 'transport', 'wellbeing', 'other']), employerMonthlyCost: z.number().min(0).max(1_000_000_000), employeeMonthlyContribution: z.number().min(0).max(1_000_000_000), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().optional(), providerReference: z.string().trim().min(4).max(300) });
const decideBenefitPlanSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createBenefitEnrollmentSchema = z.object({ benefitPlanId: deliveryIdSchema, workforceProfileId: deliveryIdSchema, effectiveFrom: z.iso.date() });
const decideBenefitEnrollmentSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected', 'cancelled']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createPayrollRunSchema = z.object({ periodFrom: z.iso.date(), periodTo: z.iso.date(), paymentDate: z.iso.date(), workforceProfileIds: z.array(deliveryIdSchema).min(1).max(2000) });
const decidePayrollRunSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const finalizePayrollRunSchema = z.object({ id: deliveryIdSchema, paymentReference: z.string().trim().min(4).max(160), expectedVersion: z.number().int().positive() });
const updatePayrollObligationSchema = z.object({ id: deliveryIdSchema, status: z.enum(['reported', 'paid', 'reconciled']), externalReference: z.string().trim().min(4).max(160), expectedVersion: z.number().int().positive() });
const createExpenseClaimSchema = z.object({ workforceProfileId: deliveryIdSchema, expenseDate: z.iso.date(), category: z.enum(['travel', 'lodging', 'meals', 'supplies', 'client-service', 'other']), merchant: z.string().trim().min(2).max(160), amount: z.number().positive().max(1_000_000_000), receiptReference: z.string().trim().min(4).max(300), businessPurpose: z.string().trim().min(8).max(500) });
const decideExpenseClaimSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const reimburseExpenseClaimSchema = z.object({ id: deliveryIdSchema, paymentReference: z.string().trim().min(4).max(160), expectedVersion: z.number().int().positive() });
const recordAttendanceSchema = z.object({ workforceProfileId: deliveryIdSchema, attendanceDate: z.iso.date(), status: z.enum(['present', 'absent', 'half-day', 'paid-leave', 'unpaid-leave', 'holiday', 'weekly-off']), source: z.enum(['self-attested', 'manager-recorded', 'imported']), evidenceReference: z.string().trim().min(4).max(300) });
const decideAttendanceSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createLeaveTypeSchema = z.object({ code: z.string().trim().min(2).max(32), name: z.string().trim().min(2).max(160), annualEntitlementDays: z.number().min(0).max(366), paid: z.boolean(), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().optional() });
const decideLeaveTypeSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['active', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createLeaveApplicationSchema = z.object({ leaveTypeId: deliveryIdSchema, workforceProfileId: deliveryIdSchema, startDate: z.iso.date(), endDate: z.iso.date(), dayCount: z.number().positive().max(366), reason: z.string().trim().min(4).max(500), evidenceReference: z.string().trim().min(4).max(300).optional() });
const decideLeaveApplicationSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['approved', 'rejected', 'cancelled']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createPayrollAdjustmentSchema = z.object({ workforceProfileId: deliveryIdSchema, payrollPeriod: z.iso.date(), kind: z.enum(['arrear-earning', 'recovery-deduction']), amount: z.number().positive().max(1_000_000_000), reason: z.string().trim().min(4).max(500), evidenceReference: z.string().trim().min(4).max(300) });
const decidePayrollAdjustmentSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['approved', 'rejected', 'cancelled']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const taxDeclarationItemSchema = z.object({ sectionCode: z.string().trim().min(2).max(30), declaredAmount: z.number().min(0).max(1_000_000_000), evidenceReference: z.string().trim().min(4).max(300) });
const createTaxDeclarationSchema = z.object({ workforceProfileId: deliveryIdSchema, financialYear: z.string().trim().regex(/^20\d{2}-\d{2}$/), taxRegime: z.enum(['old', 'new', 'undecided']), items: z.array(taxDeclarationItemSchema).min(1).max(50) });
const decideTaxDeclarationSchema = z.object({ id: deliveryIdSchema, decision: z.enum(['verified', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const publishPayslipSchema = z.object({ payrollSlipId: deliveryIdSchema, channel: z.enum(['secure-in-app', 'email-adapter']), documentReference: z.string().trim().min(4).max(300) });
const acknowledgePayslipSchema = z.object({ id: deliveryIdSchema, expectedVersion: z.number().int().positive() });
const inventoryIdSchema = z.string().trim().min(1).max(100);
const createUomSchema = z.object({ code: z.string().trim().min(1).max(12), name: z.string().trim().min(2).max(120), category: z.enum(['count', 'weight', 'volume', 'length']), precision: z.number().int().min(0).max(6) });
const createUomConversionSchema = z.object({ itemId: inventoryIdSchema, fromUomId: inventoryIdSchema, toUomId: inventoryIdSchema, factor: z.number().positive().max(1_000_000_000) });
const createInventoryItemSchema = z.object({ productId: inventoryIdSchema, code: z.string().trim().min(2).max(24), name: z.string().trim().min(2).max(120), baseUomId: inventoryIdSchema, tracking: z.enum(['none', 'batch', 'serial']), valuationMethod: z.enum(['fifo', 'moving-average', 'specific-identification']), shelfLifeDays: z.number().int().positive().max(36500).optional() });
const createItemVariantSchema = z.object({ itemId: inventoryIdSchema, sku: z.string().trim().min(2).max(32), name: z.string().trim().min(2).max(120), attributes: z.record(z.string().max(40), z.string().max(80)), barcode: z.string().trim().min(2).max(120).optional() });
const createWarehouseSchema = z.object({ code: z.string().trim().min(2).max(16), name: z.string().trim().min(2).max(120), stateCode: indiaStateCodeSchema, stockLocationId: inventoryIdSchema });
const createWarehouseZoneSchema = z.object({ warehouseId: inventoryIdSchema, code: z.string().trim().min(1).max(16), name: z.string().trim().min(2).max(120), purpose: z.enum(['receiving', 'storage', 'picking', 'quarantine', 'dispatch', 'returns']) });
const createStorageBinSchema = z.object({ zoneId: inventoryIdSchema, code: z.string().trim().min(1).max(20), name: z.string().trim().min(2).max(120), capacity: z.number().positive().max(1_000_000_000), pickSequence: z.number().int().positive().max(1_000_000) });
const receiveInventorySchema = z.object({ warehouseId: inventoryIdSchema, receivingBinId: inventoryIdSchema, itemVariantId: inventoryIdSchema, quantity: z.number().positive().max(1_000_000_000), uomId: inventoryIdSchema, unitCost: z.number().positive().max(1_000_000_000_000), reference: z.string().trim().min(3).max(120), receivedAt: z.iso.datetime(), batchNumber: z.string().trim().min(1).max(120).optional(), manufacturedAt: z.iso.date().optional(), expiresAt: z.iso.date().optional(), serialNumbers: z.array(z.string().trim().min(1).max(160)).max(100000) });
const taskPrioritySchema = z.enum(['normal', 'high', 'urgent']);
const createPutawayTaskSchema = z.object({ itemVariantId: inventoryIdSchema, batchId: inventoryIdSchema.optional(), serialUnitIds: z.array(inventoryIdSchema).max(100000).optional(), fromBinId: inventoryIdSchema, toBinId: inventoryIdSchema, quantity: z.number().positive().max(1_000_000_000), assignedTo: inventoryIdSchema, dueAt: z.iso.datetime(), priority: taskPrioritySchema });
const createPickTaskSchema = z.object({ reservationId: inventoryIdSchema, itemVariantId: inventoryIdSchema, batchId: inventoryIdSchema.optional(), fromBinId: inventoryIdSchema, quantity: z.number().positive().max(1_000_000_000), serialUnitIds: z.array(inventoryIdSchema).max(100000), assignedTo: inventoryIdSchema, dueAt: z.iso.datetime(), priority: taskPrioritySchema });
const transitionWarehouseTaskSchema = z.object({ id: inventoryIdSchema, toStatus: z.enum(['planned', 'in-progress', 'completed', 'blocked', 'cancelled']), blockedReason: z.string().trim().min(3).max(160).optional(), expectedVersion: z.number().int().positive() });
const transferLineSchema = z.object({ itemVariantId: inventoryIdSchema, batchId: inventoryIdSchema.optional(), serialUnitIds: z.array(inventoryIdSchema).max(100000), quantity: z.number().positive().max(1_000_000_000) });
const createInventoryTransferSchema = z.object({ fromWarehouseId: inventoryIdSchema, toWarehouseId: inventoryIdSchema, fromBinId: inventoryIdSchema, toBinId: inventoryIdSchema, lines: z.array(transferLineSchema).min(1).max(1000) });
const transitionInventoryTransferSchema = z.object({ id: inventoryIdSchema, toStatus: z.enum(['draft', 'released', 'in-transit', 'received', 'cancelled']), expectedVersion: z.number().int().positive() });
const createCycleCountSchema = z.object({ warehouseId: inventoryIdSchema, zoneId: inventoryIdSchema.optional(), blindCount: z.boolean(), scheduledAt: z.iso.datetime(), assignedTo: inventoryIdSchema });
const cycleCountLineSchema = z.object({ binId: inventoryIdSchema, itemVariantId: inventoryIdSchema, batchId: inventoryIdSchema.optional(), countedQuantity: z.number().min(0).max(1_000_000_000) });
const recordCycleCountSchema = z.object({ id: inventoryIdSchema, counts: z.array(cycleCountLineSchema).min(1).max(100000), expectedVersion: z.number().int().positive() });
const decideCycleCountSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), expectedVersion: z.number().int().positive() });
const createReorderPolicySchema = z.object({ itemVariantId: inventoryIdSchema, warehouseId: inventoryIdSchema, minimumQuantity: z.number().min(0), reorderPoint: z.number().min(0), maximumQuantity: z.number().min(0), safetyStock: z.number().min(0), leadTimeDays: z.number().int().min(0).max(3650) });
const decideReorderProposalSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), expectedVersion: z.number().int().positive() });
const createInventoryValuationReviewSchema = z.object({ itemVariantId: inventoryIdSchema, warehouseId: inventoryIdSchema, asOfDate: z.iso.date(), netRealisableValuePerUnit: z.number().min(0).max(1_000_000_000_000), rationale: z.string().trim().min(10).max(400), sourceUrl: z.url().startsWith('https://').optional() });
const decideInventoryValuationReviewSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), expectedVersion: z.number().int().positive() });
const createInventoryDispositionSchema = z.object({
  kind: z.enum(['opening-balance', 'damage', 'expiry', 'shrinkage']),
  warehouseId: inventoryIdSchema,
  binId: inventoryIdSchema,
  itemVariantId: inventoryIdSchema,
  batchId: inventoryIdSchema.optional(),
  serialUnitIds: z.array(inventoryIdSchema).max(100000),
  serialNumbers: z.array(z.string().trim().min(1).max(160)).max(100000).optional(),
  quantity: z.number().positive().max(1_000_000_000),
  unitCost: z.number().positive().max(1_000_000_000_000).optional(),
  reason: z.string().trim().min(4).max(400),
  evidenceReference: z.string().trim().min(3).max(160),
  occurredAt: z.iso.datetime(),
  batchNumber: z.string().trim().min(1).max(120).optional(),
  manufacturedAt: z.iso.date().optional(),
  expiresAt: z.iso.date().optional(),
});
const decideInventoryDispositionSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), evidence: z.string().trim().min(4).max(400), expectedVersion: z.number().int().positive() });
const postInventoryDispositionSchema = z.object({ id: inventoryIdSchema, expectedVersion: z.number().int().positive() });
const retailTenderSchema = z.object({
  method: z.enum(['cash', 'upi', 'card', 'cheque', 'store-credit', 'customer-credit', 'other']),
  amount: z.number().positive().max(1_000_000_000),
  reference: z.string().trim().min(3).max(120),
});
const retailCheckoutLineSchema = z.object({
  itemVariantId: inventoryIdSchema,
  binId: inventoryIdSchema,
  batchId: inventoryIdSchema.optional(),
  serialUnitIds: z.array(inventoryIdSchema).max(100_000),
  quantity: z.number().positive().max(1_000_000_000),
});
const createRetailCounterSchema = z.object({
  code: z.string().trim().min(2).max(32),
  name: z.string().trim().min(2).max(180),
  warehouseId: inventoryIdSchema,
  sellFromBinId: inventoryIdSchema,
  priceListId: inventoryIdSchema,
  walkInAccountId: z.string().trim().min(2).max(120),
  paymentTermId: inventoryIdSchema,
});
const openRetailCashierShiftSchema = z.object({
  counterId: inventoryIdSchema,
  openingCash: z.number().min(0).max(1_000_000_000),
});
const checkoutRetailSaleSchema = z.object({
  counterId: inventoryIdSchema,
  cashierShiftId: inventoryIdSchema,
  transactionKey: z.string().trim().min(8).max(120),
  customerAccountId: z.string().trim().min(2).max(120).optional(),
  recipientTreatment: z.enum(['registered', 'unregistered']).optional(),
  recipientGstin: z.string().trim().max(15).optional(),
  placeOfSupplyStateCode: indiaStateCodeSchema.optional(),
  loyaltyPointsToRedeem: z.number().int().positive().max(1_000_000_000).optional(),
  loyaltyAccountVersion: z.number().int().positive().optional(),
  voucherCode: z.string().trim().min(2).max(64).optional(),
  voucherVersion: z.number().int().positive().optional(),
  saleAt: z.iso.datetime(),
  lines: z.array(retailCheckoutLineSchema).min(1).max(500),
  discountPolicyIds: z.array(inventoryIdSchema).max(100),
  tenders: z.array(retailTenderSchema).min(1).max(8),
}).refine((input) => (input.voucherCode === undefined) === (input.voucherVersion === undefined), 'Voucher code and version must be supplied together.');
const enqueueRetailOfflineSaleSchema = checkoutRetailSaleSchema.strict();
const syncRetailOfflineSaleSchema = z.object({ id: inventoryIdSchema, expectedVersion: z.number().int().positive(), recoveryEvidenceReference: z.string().trim().min(8).max(240).optional() }).strict();
const syncRetailOfflineQueueSchema = z.object({ limit: z.number().int().min(1).max(50), recoveryEvidenceReference: z.string().trim().min(8).max(240).optional() }).strict();
const resolveRetailOfflineSaleSchema = z.object({ id: inventoryIdSchema, resolution: z.enum(['requeue', 'discard']), reason: z.string().trim().min(4).max(240), recoveryEvidenceReference: z.string().trim().min(8).max(240), expectedVersion: z.number().int().positive() }).strict();
const sendRetailHubStoreEdgeSyncSchema = z.object({
  baseUrl: z.string().trim().min(1).max(300),
  event: z.object({
    eventId: z.string().trim().min(3).max(160),
    eventType: z.string().trim().min(3).max(80),
    aggregateId: z.string().trim().min(1).max(160),
    transactionKey: z.string().trim().min(3).max(160),
    sequence: z.number().int().positive().safe().max(Number.MAX_SAFE_INTEGER),
    producedAt: z.iso.datetime(),
    payloadChecksum: z.string().regex(/^[a-f0-9]{64}$/u),
    payload: z.record(z.string(), z.unknown()),
  }).strict(),
}).strict();
const syncRetailHubStoreEdgeQueueSchema = z.object({
  baseUrl: z.string().trim().min(1).max(300),
  limit: z.number().int().min(1).max(50),
}).strict();
const saveRetailHubStoreEdgeSyncPolicySchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().trim().min(1).max(300),
  intervalMinutes: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)]),
  batchLimit: z.number().int().min(1).max(50),
}).strict();
const ingestRetailUnifiedOrderSchema = z.object({
  event: z.object({
    source: z.object({
      channel: z.enum(['pos', 'website', 'app', 'whatsapp', 'ondc', 'marketplace']),
      connectionId: z.string().trim().min(3).max(160),
    }).strict(),
    externalOrderId: z.string().trim().min(1).max(160),
    externalEventId: z.string().trim().min(1).max(160),
    occurredAt: z.iso.datetime(),
    status: z.enum(['received', 'accepted', 'picking', 'packed', 'fulfilled', 'cancelled', 'return-requested', 'returned', 'rto']),
    currency: z.string().trim().length(3),
    totalAmountPaise: z.number().int().nonnegative().max(9_000_000_000_000),
    lines: z.array(z.object({
      externalLineId: z.string().trim().min(1).max(160),
      sku: z.string().trim().min(1).max(160),
      itemVariantId: z.string().trim().min(1).max(160).optional(),
      quantity: z.number().positive().max(1_000_000),
      unitAmountPaise: z.number().int().nonnegative().max(9_000_000_000_000),
    }).strict()).min(1).max(500),
  }).strict(),
  mode: z.enum(['shadow', 'governed']),
  receivedAt: z.iso.datetime().optional(),
}).strict();
const prepareRetailUnifiedOrderHandoffSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  approvalEvidenceReference: z.string().trim().min(4).max(500),
}).strict();
const prepareRetailOrderHubHandoffSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();
const recordRetailOrderHubHandoffResultSchema = z.object({
  id: z.string().trim().min(1).max(200),
  expectedVersion: z.number().int().positive(),
  outcome: z.enum(['acknowledged', 'retryable', 'rejected']),
  responseReference: z.string().trim().min(4).max(240),
  responseChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
  detail: z.string().trim().min(1).max(500).optional(),
}).strict();
const prepareRetailOrderFulfilmentHandoffSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  salesOrderId: inventoryIdSchema,
  evidenceReference: z.string().trim().min(4).max(240),
}).strict();
const decideRetailOrderFulfilmentHandoffSchema = z.object({
  id: z.string().trim().min(1).max(200),
  expectedVersion: z.number().int().positive(),
  decision: z.enum(['approved', 'rejected']),
  remarks: z.string().trim().min(4).max(500),
}).strict();
const reserveRetailUnifiedOrderStockSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  locationId: inventoryIdSchema,
  evidenceReference: z.string().trim().min(4).max(240),
}).strict();
const createRetailUnifiedOrderPickTasksSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  evidenceReference: z.string().trim().min(4).max(240),
  dueAt: z.iso.datetime(),
  priority: taskPrioritySchema,
}).strict();
const completeRetailUnifiedOrderPickTasksSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  evidenceReference: z.string().trim().min(4).max(240),
}).strict();
const createRetailUnifiedOrderShipmentPackageSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  fromLocationId: inventoryIdSchema,
  shipToAddressId: inventoryIdSchema.optional(),
  deliveryPromiseId: inventoryIdSchema.optional(),
  grossWeightKg: z.number().positive().max(1_000_000),
  lengthCm: z.number().positive().max(100_000),
  widthCm: z.number().positive().max(100_000),
  heightCm: z.number().positive().max(100_000),
  ewayBillRequired: z.boolean(),
  evidenceReference: z.string().trim().min(4).max(240),
}).strict();
const completeRetailUnifiedOrderShipmentPackageSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  evidenceReference: z.string().trim().min(4).max(240),
}).strict();
const prepareRetailUnifiedOrderDispatchSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  carrierAdapterId: inventoryIdSchema.optional(),
  trackingNumber: z.string().trim().min(3).max(120).optional(),
  vehicleNumber: z.string().trim().min(3).max(40).optional(),
  transportDocumentNumber: z.string().trim().min(3).max(120).optional(),
  eventLocation: z.string().trim().min(2).max(160),
  evidenceReference: z.string().trim().min(4).max(240),
}).strict();
const dispatchRetailUnifiedOrderSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  expectedDispatchReadinessVersion: z.number().int().positive(),
  eventLocation: z.string().trim().min(2).max(160),
  handoverEvidenceReference: z.string().trim().min(4).max(240),
}).strict();
const confirmRetailUnifiedOrderDeliverySchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  expectedCarrierDispatchVersion: z.number().int().positive(),
  eventLocation: z.string().trim().min(2).max(160),
  proofOfDeliveryReference: z.string().trim().min(4).max(240),
  recipientName: z.string().trim().min(2).max(120).optional(),
  deliveryNotes: z.string().trim().min(4).max(500),
}).strict();
const reconcileRetailUnifiedOrderRtoSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  carrierRtoReference: z.string().trim().min(4).max(240),
  inventoryEvidenceReference: z.string().trim().min(4).max(240),
  paymentEvidenceReference: z.string().trim().min(4).max(240),
  taxEvidenceReference: z.string().trim().min(4).max(240),
}).strict();
const reconcileRetailUnifiedOrderCancellationSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  stockEvidenceReference: z.string().trim().min(4).max(240),
  paymentEvidenceReference: z.string().trim().min(4).max(240),
}).strict();
const reconcileRetailUnifiedOrderReturnSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  retailReturnId: inventoryIdSchema,
  settlementId: inventoryIdSchema,
  creditNoteReconciliationId: inventoryIdSchema,
  settlementEvidenceReference: z.string().trim().min(4).max(240),
  evidenceReference: z.string().trim().min(4).max(240),
}).strict();
const recordRetailUnifiedOrderCarrierCallbackSchema = z.object({
  orderId: inventoryIdSchema,
  expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  providerEventId: z.string().trim().min(1).max(160),
  providerStatus: z.enum(['in-transit', 'out-for-delivery', 'delivered', 'returned', 'rto', 'cancelled', 'exception', 'unknown']),
  callbackReference: z.string().trim().min(4).max(240),
  payloadChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();
const recordRetailDeviceTransportSchema = z.object({ id: inventoryIdSchema, result: z.enum(['acknowledged', 'failed']), responseReference: z.string().trim().min(4).max(240), responseProtocol: z.enum(['barcode-scanner-status-v1', 'escpos-status-v1', 'cash-drawer-status-v1', 'weighing-scale-reading-v1']), responseChecksum: z.string().regex(/^[a-f0-9]{64}$/i).optional(), responseByteLength: z.number().int().min(0).max(65_536).optional(), expectedVersion: z.number().int().positive() }).strict();
const executeRetailDeviceTransportSchema = z.object({ id: inventoryIdSchema, host: z.string().trim().min(1).max(253), port: z.number().int().min(1).max(65_535), payload: z.string().trim().min(1).max(20_000), timeoutMs: z.number().int().min(250).max(15_000).optional(), expectedVersion: z.number().int().positive() }).strict();
const retryRetailDeviceTransportSchema = z.object({ id: inventoryIdSchema, payload: z.string().trim().min(1).max(20_000), reason: z.string().trim().min(8).max(500), expectedVersion: z.number().int().positive() }).strict();
const preflightRetailDeviceTransportSchema = z.object({ kind: z.enum(['barcode-scanner', 'escpos-printer', 'cash-drawer', 'weighing-scale']), connection: z.enum(['usb', 'network', 'bluetooth', 'manual']), host: z.string().trim().min(1).max(253).optional(), port: z.number().int().min(1).max(65_535).optional(), payload: z.string().min(1).max(65_536), timeoutMs: z.number().int().min(250).max(15_000).optional() }).strict();
const recordRetailDevicePreflightEvidenceSchema = z.object({
  source: z.enum(['web-serial', 'web-bluetooth']),
  result: z.object({
    kind: z.enum(['barcode-scanner', 'escpos-printer', 'cash-drawer', 'weighing-scale']),
    connection: z.enum(['usb', 'bluetooth']),
    status: z.enum(['reachable', 'failed', 'unsupported']),
    host: z.string().max(253).optional(),
    port: z.number().int().min(1).max(65_535).optional(),
    responseReference: z.string().trim().min(4).max(240),
    responseChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    responseByteLength: z.number().int().min(0).max(65_536),
    elapsedMs: z.number().int().min(0).max(60_000),
    errorMessage: z.string().trim().max(500).optional(),
  }).strict(),
}).strict();
const createRetailLoyaltyAccountSchema = z.object({ customerAccountId: z.string().trim().min(2).max(120) }).strict();
const redeemRetailLoyaltyPointsSchema = z.object({ customerAccountId: z.string().trim().min(2).max(120), points: z.number().int().positive().max(1_000_000_000), referenceId: z.string().trim().min(3).max(160), expectedVersion: z.number().int().positive() }).strict();
const createRetailCustomerVisitSchema = z.object({ customerAccountId: z.string().trim().min(2).max(120).optional(), contactId: z.string().trim().min(2).max(120).optional(), visitedAt: z.iso.datetime(), channel: z.enum(['store', 'phone', 'web']), purpose: z.enum(['purchase', 'enquiry', 'service', 'return']), sourceReference: z.string().trim().min(3).max(160).optional(), notes: z.string().trim().min(2).max(500).optional() }).strict();
const linkRetailCustomerVisitToSaleSchema = z.object({ id: inventoryIdSchema, saleId: inventoryIdSchema, expectedVersion: z.number().int().positive() }).strict();
const createRetailSalesCommissionSchema = z.object({ saleId: inventoryIdSchema, salespersonUserId: inventoryIdSchema, basisAmount: z.number().positive().max(1_000_000_000_000).optional(), ratePercent: z.number().positive().max(100) }).strict();
const decideRetailSalesCommissionSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'void']), expectedVersion: z.number().int().positive(), remarks: z.string().trim().min(3).max(300) }).strict();
const payRetailSalesCommissionSchema = z.object({ id: inventoryIdSchema, payoutReference: z.string().trim().min(3).max(120), expectedVersion: z.number().int().positive() }).strict();
const createRetailCommissionPayoutBatchSchema = z.object({ commissionIds: z.array(inventoryIdSchema).min(1).max(500), payoutDate: z.iso.date(), notes: z.string().trim().min(4).max(500) }).strict();
const decideRetailCommissionPayoutBatchSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), expectedVersion: z.number().int().positive(), remarks: z.string().trim().min(4).max(500) }).strict();
const releaseRetailCommissionPayoutBatchSchema = z.object({ id: inventoryIdSchema, releaseReference: z.string().trim().min(4).max(160), expectedVersion: z.number().int().positive() }).strict();
const requestRetailCashierShiftCloseSchema = z.object({
  id: inventoryIdSchema,
  declaredCash: z.number().min(0).max(1_000_000_000),
  evidenceReference: z.string().trim().min(3).max(120),
  expectedVersion: z.number().int().positive(),
  declaredTenders: z.array(z.object({
    method: z.enum(['cash', 'upi', 'card', 'cheque', 'store-credit', 'customer-credit', 'other']),
    amount: z.number().min(0).max(1_000_000_000),
  }).strict()).length(7).optional(),
});
const decideRetailCashierShiftCloseSchema = z.object({
  id: inventoryIdSchema,
  decision: z.enum(['approved', 'rejected']),
  evidenceReference: z.string().trim().min(3).max(120),
  expectedVersion: z.number().int().positive(),
});
const requestRetailCashierShiftVarianceResolutionSchema = z.object({
  id: inventoryIdSchema,
  reason: z.string().trim().min(6).max(500),
  evidenceReference: z.string().trim().min(3).max(160),
  expectedVersion: z.number().int().positive(),
}).strict();
const decideRetailCashierShiftVarianceResolutionSchema = z.object({
  id: inventoryIdSchema,
  decision: z.enum(['approved', 'rejected']),
  evidenceReference: z.string().trim().min(3).max(160),
  expectedVersion: z.number().int().positive(),
}).strict();
const retailReturnRequestLineSchema = z.object({
  retailSaleLineId: inventoryIdSchema,
  quantity: z.number().positive().max(1_000_000_000),
  serialUnitIds: z.array(inventoryIdSchema).max(100_000),
});
const createRetailReturnRequestSchema = z.object({
  retailSaleId: inventoryIdSchema,
  transactionKey: z.string().trim().min(6).max(160),
  reason: z.string().trim().min(4).max(500),
  lines: z.array(retailReturnRequestLineSchema).min(1).max(500),
});
const retailReturnInspectionLineSchema = z.object({
  retailReturnLineId: inventoryIdSchema,
  outcome: z.enum(['resalable', 'quarantine', 'damaged']),
  destinationBinId: inventoryIdSchema,
  serialUnitIds: z.array(inventoryIdSchema).max(100_000),
  conditionNotes: z.string().trim().min(4).max(600),
});
const inspectRetailReturnSchema = z.object({
  id: inventoryIdSchema,
  inspectionReference: z.string().trim().min(3).max(160),
  lines: z.array(retailReturnInspectionLineSchema).min(1).max(500),
  expectedVersion: z.number().int().positive(),
});
const decideRetailReturnSchema = z.object({
  id: inventoryIdSchema,
  decision: z.enum(['approved', 'rejected']),
  evidenceReference: z.string().trim().min(4).max(500),
  expectedVersion: z.number().int().positive(),
});
const retailReturnTransactionKeySchema = z.string()
  .trim()
  .min(6)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/);
const retailExchangeLineSchema = z.object({
  itemVariantId: inventoryIdSchema,
  binId: inventoryIdSchema,
  batchId: inventoryIdSchema.optional(),
  serialUnitIds: z.array(inventoryIdSchema).max(100_000),
  quantity: z.number().positive().max(1_000_000_000),
});
const createRetailExchangeSchema = z.object({
  retailReturnId: inventoryIdSchema,
  counterId: inventoryIdSchema,
  cashierShiftId: inventoryIdSchema,
  transactionKey: retailReturnTransactionKeySchema,
  replacementLines: z.array(retailExchangeLineSchema).min(1).max(500),
  topUpTender: z.object({ method: z.enum(['cash', 'upi', 'card', 'cheque', 'other']), amount: z.number().positive(), reference: z.string().trim().min(3).max(120) }).optional(),
});
const decideRetailExchangeSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), evidenceReference: z.string().trim().min(3).max(180), expectedVersion: z.number().int().positive() });
const prepareRetailCreditNoteReconciliationSchema = z.object({ retailReturnId: inventoryIdSchema, filingPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
const recordRetailCreditNotePortalResponseSchema = z.object({ id: inventoryIdSchema, expectedVersion: z.number().int().positive(), remoteStatus: z.enum(['accepted', 'rejected', 'missing']), externalReference: z.string().trim().min(3).max(180).optional(), remotePayloadChecksum: z.string().trim().min(8).max(200).optional(), responseMessage: z.string().trim().min(2).max(500).optional() });
const retailInterBranchLineSchema = z.object({ itemVariantId: inventoryIdSchema, batchId: inventoryIdSchema.optional(), serialUnitIds: z.array(inventoryIdSchema).max(100_000), quantity: z.number().positive().max(1_000_000_000) });
const createRetailInterBranchTransferSchema = z.object({ direction: z.enum(['outbound', 'return-to-ho']), destinationBranchId: z.string().trim().min(2).max(120), sourceWarehouseId: inventoryIdSchema, destinationWarehouseId: inventoryIdSchema, sourceBinId: inventoryIdSchema, destinationBinId: inventoryIdSchema, lines: z.array(retailInterBranchLineSchema).min(1).max(500) });
const decideRetailInterBranchTransferSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), evidenceReference: z.string().trim().min(3).max(240), expectedVersion: z.number().int().positive() });
const dispatchRetailInterBranchTransferSchema = z.object({ id: inventoryIdSchema, evidenceReference: z.string().trim().min(3).max(240), expectedVersion: z.number().int().positive() });
const receiveRetailInterBranchTransferSchema = z.object({ id: inventoryIdSchema, evidenceReference: z.string().trim().min(3).max(240), expectedVersion: z.number().int().positive() });
const requestRetailReturnSettlementSchema = z.discriminatedUnion('method', [
  z.object({
    retailReturnId: inventoryIdSchema,
    expectedVersion: z.number().int().positive(),
    transactionKey: retailReturnTransactionKeySchema,
    method: z.literal('cash-refund'),
    amount: z.number().positive().max(1_000_000_000),
    cashierShiftId: inventoryIdSchema,
    evidenceReference: z.string().trim().min(3).max(160),
  }).strict(),
  z.object({
    retailReturnId: inventoryIdSchema,
    expectedVersion: z.number().int().positive(),
    transactionKey: retailReturnTransactionKeySchema,
    method: z.literal('provider-refund'),
    amount: z.number().positive().max(1_000_000_000),
    providerMethod: z.enum(['upi', 'card']),
    providerReference: z.string().trim().min(6).max(160),
    evidenceReference: z.string().trim().min(3).max(160),
  }).strict(),
  z.object({
    retailReturnId: inventoryIdSchema,
    expectedVersion: z.number().int().positive(),
    transactionKey: retailReturnTransactionKeySchema,
    method: z.literal('store-credit'),
    amount: z.number().positive().max(1_000_000_000),
    storeCreditAccountId: z.string().trim().min(2).max(120),
    evidenceReference: z.string().trim().min(3).max(160),
  }).strict(),
]);
const decideRetailReturnSettlementSchema = z.object({
  retailReturnId: inventoryIdSchema,
  settlementId: inventoryIdSchema,
  expectedVersion: z.number().int().positive(),
  decision: z.enum(['approved', 'rejected']),
  evidenceReference: z.string().trim().min(3).max(240),
}).strict();
const confirmRetailReturnProviderRefundSchema = z.object({
  retailReturnId: inventoryIdSchema,
  settlementId: inventoryIdSchema,
  expectedVersion: z.number().int().positive(),
  transactionKey: retailReturnTransactionKeySchema,
  decision: z.enum(['confirmed', 'rejected']),
  providerConfirmationReference: z.string().trim().min(6).max(160),
}).strict();
const retailCatalogCodeSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9-]{1,23}$/);
const createRetailCatalogCategorySchema = z.object({
  code: retailCatalogCodeSchema,
  name: z.string().trim().min(2).max(160),
  parentCategoryId: inventoryIdSchema.optional(),
}).strict();
const createRetailCatalogBrandSchema = z.object({
  code: retailCatalogCodeSchema,
  name: z.string().trim().min(2).max(160),
}).strict();
const saveRetailMerchandisingProfileSchema = z.object({
  itemId: inventoryIdSchema,
  categoryId: inventoryIdSchema,
  brandId: inventoryIdSchema.optional(),
  rackBinId: inventoryIdSchema.optional(),
  imageAttachmentId: z.string().trim().min(2).max(160).optional(),
  searchKeywords: z.array(z.string().trim().min(2).max(60)).max(30),
  expectedVersion: z.number().int().positive().optional(),
}).strict();
const createRetailBarcodeSequenceSchema = z.object({
  code: retailCatalogCodeSchema,
  prefix: z.string().regex(/^\d{0,11}$/),
  digitCount: z.number().int().min(4).max(12),
  nextNumber: z.number().int().positive().max(999_999_999),
}).strict();
const resetRetailBarcodeSequenceSchema = z.object({
  id: inventoryIdSchema,
  nextNumber: z.number().int().positive().max(999_999_999),
  evidenceReference: z.string().trim().min(4).max(240),
  expectedVersion: z.number().int().positive(),
}).strict();
const assignRetailBarcodeSchema = z.object({
  sequenceId: inventoryIdSchema,
  itemVariantId: inventoryIdSchema,
  expectedSequenceVersion: z.number().int().positive(),
  expectedVariantVersion: z.number().int().positive(),
}).strict();
const createRetailLabelPrintRunSchema = z.object({
  itemVariantId: inventoryIdSchema,
  quantity: z.number().int().positive().max(1_000_000),
  template: z.enum(['shelf', 'barcode', 'price-tag']),
  evidenceReference: z.string().trim().min(3).max(240),
}).strict();
const createRetailProductComboSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9-]{1,23}$/),
  name: z.string().trim().min(2).max(160),
  parentItemVariantId: inventoryIdSchema,
  components: z.array(z.object({
    itemVariantId: inventoryIdSchema,
    quantity: z.number().int().positive().max(1000),
  })).min(1),
}).strict();
const createRetailScaleProfileSchema = z.object({ itemVariantId: inventoryIdSchema, uomId: inventoryIdSchema, pricingBasis: z.enum(['per-unit', 'per-weight']), decimalPrecision: z.number().int().min(0).max(6), minimumQuantity: z.number().positive(), maximumQuantity: z.number().positive(), barcodePrefix: z.string().trim().regex(/^\d{0,12}$/).optional() }).strict();
const createRetailPrinterAdapterSchema = z.object({ code: retailCatalogCodeSchema, name: z.string().trim().min(2).max(160), connection: z.enum(['usb', 'network', 'bluetooth', 'manual']), model: z.string().trim().min(1).max(120).optional(), supportedTemplates: z.array(z.enum(['shelf', 'barcode', 'price-tag'])).min(1) }).strict();
const testRetailPrinterAdapterSchema = z.object({ id: inventoryIdSchema, evidenceReference: z.string().trim().min(3).max(240), expectedVersion: z.number().int().positive() }).strict();
const createRetailLabelPrintDispatchSchema = z.object({ labelPrintRunId: inventoryIdSchema, printerAdapterId: inventoryIdSchema }).strict();
const decideRetailLabelPrintDispatchSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['acknowledged', 'failed']), evidenceReference: z.string().trim().min(3).max(240), expectedVersion: z.number().int().positive() }).strict();
const retailBulkEditChangeSchema = z.object({ itemId: inventoryIdSchema, categoryId: inventoryIdSchema, brandId: inventoryIdSchema.optional(), rackBinId: inventoryIdSchema.optional(), searchKeywords: z.array(z.string().trim().min(2).max(60)).max(30), expectedVersion: z.number().int().positive().optional() }).strict();
const prepareRetailCatalogBulkEditSchema = z.object({ changes: z.array(retailBulkEditChangeSchema).min(1).max(500) }).strict();
const applyRetailCatalogBulkEditSchema = z.object({ id: inventoryIdSchema, evidenceReference: z.string().trim().min(3).max(240), expectedVersion: z.number().int().positive() }).strict();
const retailSha256Schema = z.string().regex(/^[a-fA-F0-9]{64}$/);
const retailPurchaseOcrLineSchema = z.object({ description: z.string().trim().min(1).max(180), itemVariantId: inventoryIdSchema.optional(), purchaseOrderLineId: inventoryIdSchema.optional(), quantity: z.number().positive(), unitPrice: z.number().nonnegative(), gstRate: z.number().min(0).max(100), confidence: z.number().min(0).max(1) }).strict();
const createRetailPurchaseOcrSchema = z.object({ source: z.enum(['upload', 'email', 'scan']), fileName: z.string().trim().min(3).max(180), fileChecksum: retailSha256Schema, supplierId: inventoryIdSchema.optional(), purchaseOrderId: inventoryIdSchema.optional(), goodsReceiptId: inventoryIdSchema.optional(), ocrProviderProfileId: inventoryIdSchema.optional(), extractedInvoiceNumber: z.string().trim().min(2).max(80).optional(), extractedInvoiceDate: z.iso.date().optional(), extractedSupplierGstin: z.string().trim().max(15).optional(), extractedTotalAmount: z.number().nonnegative().optional(), extractionConfidence: z.number().min(0).max(1), lines: z.array(retailPurchaseOcrLineSchema).min(1).max(100) }).strict();
const decideRetailPurchaseOcrSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), evidence: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() }).strict();
const convertRetailPurchaseOcrSchema = z.object({ id: inventoryIdSchema, mappingId: inventoryIdSchema, purchaseOrderId: inventoryIdSchema, goodsReceiptId: inventoryIdSchema, supplierInvoiceNumber: z.string().trim().min(2).max(80), invoiceDate: z.iso.date(), lines: z.array(z.object({ purchaseOrderLineId: inventoryIdSchema, quantity: z.number().positive(), unitPrice: z.number().positive(), gstRate: z.number().min(0).max(100) }).strict()).min(1).max(100), expectedVersion: z.number().int().positive() }).strict();
const createRetailCommerceConnectorSchema = z.object({ code: retailCatalogCodeSchema, name: z.string().trim().min(2).max(160), channel: z.enum(['marketplace', 'ondc', 'website', 'whatsapp']), environment: z.enum(['sandbox', 'production']), baseUrl: z.string().url(), capabilities: z.array(z.enum(['catalog-push', 'inventory-push', 'order-pull', 'settlement-pull'])).min(1) }).strict();
const configureRetailCommerceCredentialsSchema = z.object({ connectorId: inventoryIdSchema, fingerprint: retailSha256Schema.optional(), clientId: z.string().trim().max(8192).optional(), clientSecret: z.string().trim().max(8192).optional(), apiKey: z.string().trim().max(8192).optional(), bearerToken: z.string().trim().max(8192).optional(), signingKey: z.string().trim().max(8192).optional() }).strict().refine((value) => Boolean(value.fingerprint || value.clientId || value.clientSecret || value.apiKey || value.bearerToken || value.signingKey), 'Provide a credential fingerprint or secret material.');
const createRetailCommerceSyncSchema = z.object({ connectorId: inventoryIdSchema, kind: z.enum(['catalog', 'inventory', 'orders', 'settlement']), requestChecksum: retailSha256Schema }).strict();
const executeRetailCommerceSyncSchema = z.object({ id: inventoryIdSchema, method: z.enum(['GET', 'POST']), path: z.string().trim().min(1).max(500), payloadJson: z.string().trim().max(100000).optional(), applyOrders: z.boolean().optional(), applySettlements: z.boolean().optional(), expectedVersion: z.number().int().positive() }).strict();
const recordRetailCommerceSyncSchema = z.object({ id: inventoryIdSchema, status: z.enum(['completed', 'completed-with-exceptions', 'failed']), evidenceReference: z.string().trim().min(4).max(300), responseChecksum: z.string().regex(/^[a-f0-9]{64}$/i).optional(), responseByteLength: z.number().int().nonnegative().optional(), providerReference: z.string().trim().min(4).max(180).optional(), recordsRead: z.number().int().nonnegative(), recordsAccepted: z.number().int().nonnegative(), recordsRejected: z.number().int().nonnegative(), remoteCursor: z.string().trim().max(160).optional(), expectedVersion: z.number().int().positive() }).strict();
const importRetailCommerceOrderSchema = z.object({ connectorId: inventoryIdSchema, remoteOrderId: z.string().trim().min(2).max(120), orderNumber: z.string().trim().min(2).max(120), remoteCreatedAt: z.string().datetime(), remotePayloadChecksum: retailSha256Schema, remoteStatus: z.enum(['imported', 'confirmed', 'fulfilled', 'cancelled', 'return-requested', 'returned', 'rto']).optional(), remoteStatusEvidence: z.string().trim().min(4).max(300).optional(), remoteStatusChecksum: retailSha256Schema.optional(), lines: z.array(z.object({ itemVariantId: inventoryIdSchema.optional(), remoteSku: z.string().trim().min(1).max(120).optional(), quantity: z.number().positive(), unitPrice: z.number().nonnegative(), gstRate: z.number().min(0).max(100) }).strict().refine((line) => Boolean(line.itemVariantId || line.remoteSku), 'Each marketplace line requires a local variant or mapped remote SKU.')).min(1).max(100) }).strict().refine((input) => !input.remoteStatus || Boolean(input.remoteStatusEvidence), 'Remote order status requires provider evidence.').refine((input) => !input.remoteStatus || Boolean(input.remoteStatusChecksum || input.remotePayloadChecksum), 'Remote order status requires a checksum.');
const handoffRetailCommerceOrderSchema = z.object({ orderId: inventoryIdSchema, salesOrderId: inventoryIdSchema, evidence: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() }).strict();
const reserveRetailCommerceOrderSchema = z.object({ orderId: inventoryIdSchema, locationId: inventoryIdSchema, evidence: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() }).strict();
const createRetailSettlementReconciliationSchema = z.object({ connectorId: inventoryIdSchema, settlementReference: z.string().trim().min(3).max(160), periodFrom: z.iso.date(), periodTo: z.iso.date(), grossAmount: z.number().nonnegative(), refundAmount: z.number().nonnegative().optional(), feeAmount: z.number().nonnegative(), taxWithheldAmount: z.number().nonnegative(), localNetAmount: z.number().nonnegative(), orderIds: z.array(inventoryIdSchema).max(500), remotePayloadChecksum: retailSha256Schema }).strict();
const decideRetailSettlementReconciliationSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['resolved', 'rejected']), evidence: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() }).strict();
const createRetailSettlementAllocationPackSchema = z.object({ settlementId: inventoryIdSchema, allocations: z.array(z.object({ orderId: inventoryIdSchema, grossAmount: z.number().nonnegative(), refundAmount: z.number().nonnegative(), feeAmount: z.number().nonnegative(), taxWithheldAmount: z.number().nonnegative(), netAmount: z.number().nonnegative() }).strict()).min(1).max(500) }).strict();
const decideRetailSettlementAllocationPackSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), evidence: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() }).strict();
const createRetailCommerceConflictResolutionSchema = z.object({ conflictId: z.string().trim().min(3).max(240), kind: z.string().trim().min(3).max(80), sourceId: inventoryIdSchema, connectorId: inventoryIdSchema, decision: z.enum(['retry', 'accepted', 'waived']), evidence: z.string().trim().min(4).max(500) }).strict();
const decideRetailCommerceConflictResolutionSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), evidence: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() }).strict();
const createRetailSettlementWithholdingEvidenceSchema = z.object({ settlementId: inventoryIdSchema, taxType: z.enum(['tds', 'tcs']), periodFrom: z.iso.date(), periodTo: z.iso.date(), amount: z.number().nonnegative(), certificateReference: z.string().trim().min(3).max(160), challanReference: z.string().trim().min(3).max(160).optional() }).strict();
const decideRetailSettlementWithholdingEvidenceSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), evidence: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() }).strict();
const prepareRetailSettlementJournalSchema = z.object({ id: inventoryIdSchema, expectedVersion: z.number().int().positive() }).strict();
const linkRetailCommerceReturnSchema = z.object({ orderId: inventoryIdSchema, retailReturnId: inventoryIdSchema, creditNoteReconciliationId: inventoryIdSchema, inventoryEvidenceReference: z.string().trim().min(3).max(160), expectedVersion: z.number().int().positive() }).strict();
const createRetailOcrProviderProfileSchema = z.object({ code: retailCatalogCodeSchema, name: z.string().trim().min(2).max(160), mode: z.enum(['manual', 'api']), baseUrl: z.string().trim().url().optional(), supportedDocumentKinds: z.array(z.enum(['supplier-invoice', 'credit-note', 'debit-note'])).min(1).max(3) }).strict();
const configureRetailOcrProviderSchema = z.object({ id: inventoryIdSchema, credentialFingerprint: retailSha256Schema.optional(), clientId: z.string().trim().max(8192).optional(), clientSecret: z.string().max(8192).optional(), apiKey: z.string().max(8192).optional(), bearerToken: z.string().max(8192).optional(), signingKey: z.string().max(8192).optional() }).strict().refine((input) => Boolean(input.credentialFingerprint || input.clientId || input.clientSecret || input.apiKey || input.bearerToken || input.signingKey), 'Provide an OCR credential fingerprint or at least one secret.');
const testRetailOcrProviderSchema = z.object({ id: inventoryIdSchema, evidence: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() }).strict();
const executeRetailOcrSchema = z.object({ providerId: inventoryIdSchema, method: z.enum(['GET', 'POST']), path: z.string().trim().min(1).max(500), payloadJson: z.string().trim().max(100000).optional(), source: z.enum(['upload', 'email', 'scan']), fileName: z.string().trim().min(3).max(180), fileChecksum: retailSha256Schema, supplierId: inventoryIdSchema.optional(), purchaseOrderId: inventoryIdSchema.optional(), goodsReceiptId: inventoryIdSchema.optional(), expectedProviderVersion: z.number().int().positive() }).strict();
const prepareRetailPurchaseOcrMappingSchema = z.object({ ocrDocumentId: inventoryIdSchema, mappings: z.array(z.object({ ocrLineId: inventoryIdSchema, purchaseOrderLineId: inventoryIdSchema, itemVariantId: inventoryIdSchema }).strict()).min(1).max(100) }).strict();
const applyRetailPurchaseOcrMappingSchema = z.object({ id: inventoryIdSchema, evidence: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() }).strict();
const prepareRetailCommercePushSchema = z.object({ connectorId: inventoryIdSchema, kind: z.enum(['catalog', 'inventory']), itemVariantIds: z.array(inventoryIdSchema).min(1).max(500) }).strict();
const createRetailCommerceCatalogMappingSchema = z.object({ connectorId: inventoryIdSchema, remoteSku: z.string().trim().min(1).max(120), itemVariantId: inventoryIdSchema, remoteTitle: z.string().trim().min(1).max(240).optional() }).strict();
const decideRetailCommerceCatalogMappingSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), evidence: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() }).strict();
const disableRetailCommerceCatalogMappingSchema = z.object({ id: inventoryIdSchema, expectedVersion: z.number().int().positive(), evidence: z.string().trim().min(4).max(500) }).strict();
const decideRetailCommercePushSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['acknowledged', 'failed']), evidence: z.string().trim().min(4).max(500), providerPayloadChecksum: retailSha256Schema, responseChecksum: retailSha256Schema.optional(), responseByteLength: z.number().int().nonnegative().optional(), providerReference: z.string().trim().min(3).max(180).optional(), expectedVersion: z.number().int().positive() }).strict();
const executeRetailCommercePushSchema = z.object({ id: inventoryIdSchema, method: z.literal('POST'), path: z.string().trim().min(1).max(500), payloadJson: z.string().trim().max(100000).optional(), expectedVersion: z.number().int().positive() }).strict();
const transitionRetailCommerceOrderSchema = z.object({ id: inventoryIdSchema, status: z.enum(['imported', 'confirmed', 'fulfilled', 'cancelled', 'return-requested', 'returned', 'rto']), evidence: z.string().trim().min(4).max(500), rtoReference: z.string().trim().min(2).max(160).optional(), expectedVersion: z.number().int().positive() }).strict();
const createRetailCommerceConformanceCaseSchema = z.object({ connectorId: inventoryIdSchema, suiteName: z.string().trim().min(2).max(160), suiteVersion: z.string().trim().min(1).max(80), scenario: z.string().trim().min(8).max(500) }).strict();
const planRetailCommerceConformancePackSchema = z.object({ connectorId: inventoryIdSchema, suiteName: z.string().trim().min(2).max(160), suiteVersion: z.string().trim().min(1).max(80) }).strict();
const recordRetailCommerceConformanceSchema = z.object({ id: inventoryIdSchema, result: z.enum(['passed', 'failed']), evidenceReference: z.string().trim().min(4).max(300), resultChecksum: retailSha256Schema, expectedVersion: z.number().int().positive() }).strict();
const scanRetailPurchaseExceptionsSchema = z.object({ ocrDocumentId: inventoryIdSchema.optional() }).strict();
const resolveRetailPurchaseExceptionSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['resolved', 'waived']), evidence: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() }).strict();
const assetCriticalitySchema = z.enum(['critical', 'high', 'normal', 'low']);
const createAssetCategorySchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9-]{1,19}$/),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(4).max(500).optional(),
  defaultCriticality: assetCriticalitySchema,
  defaultMaintenanceIntervalDays: z.number().int().positive().max(36_500).optional(),
});
const createManagedAssetSchema = z.object({
  assetTag: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9-]{1,39}$/),
  categoryId: inventoryIdSchema,
  name: z.string().trim().min(2).max(160),
  manufacturer: z.string().trim().min(2).max(120).optional(),
  model: z.string().trim().min(2).max(120).optional(),
  serialNumber: z.string().trim().min(1).max(160).optional(),
  sourceType: z.enum(['opening-balance', 'procurement-evidence', 'manufactured', 'manual-evidence']),
  sourceEvidenceReference: z.string().trim().min(4).max(160),
  acquiredOn: z.iso.date(),
  availableForUseOn: z.iso.date(),
  warrantyExpiresOn: z.iso.date().optional(),
  warehouseId: inventoryIdSchema.optional(),
  workCenterId: inventoryIdSchema.optional(),
  custodyLabel: z.string().trim().min(2).max(160),
  criticality: assetCriticalitySchema.optional(),
});
const submitManagedAssetSchema = z.object({ id: inventoryIdSchema, expectedVersion: z.number().int().positive() });
const decideManagedAssetSchema = z.object({
  id: inventoryIdSchema,
  decision: z.enum(['in-service', 'rejected']),
  remarks: z.string().trim().min(4).max(500),
  expectedVersion: z.number().int().positive(),
});
const createAssetCapitalizationSchema = z.object({
  assetId: inventoryIdSchema,
  supplierInvoiceId: inventoryIdSchema,
  capitalizationDate: z.iso.date(),
  taxableAmount: z.number().positive().max(9_000_000_000_000).refine((value) => Math.abs(Math.round(value * 100) / 100 - value) < 0.000001, 'Amount may have at most two decimal places.'),
});
const decideAssetCapitalizationSchema = z.object({
  id: inventoryIdSchema,
  decision: z.enum(['approved', 'rejected']),
  remarks: z.string().trim().min(4).max(500),
  expectedVersion: z.number().int().positive(),
});
const createAssetDepreciationPolicySchema = z.object({
  categoryId: inventoryIdSchema,
  effectiveFrom: z.iso.date(),
  usefulLifeMonths: z.number().int().positive().max(1_200),
  residualValuePercent: z.number().min(0).lt(100).refine((value) => Math.abs(Math.round(value * 100) / 100 - value) < 0.000001, 'Residual value percent may have at most two decimal places.'),
});
const decideAssetDepreciationPolicySchema = z.object({
  id: inventoryIdSchema,
  decision: z.enum(['approved', 'rejected']),
  remarks: z.string().trim().min(4).max(500),
  expectedVersion: z.number().int().positive(),
});
const createAssetDepreciationRunSchema = z.object({ periodEnd: z.iso.date() });
const decideAssetDepreciationRunSchema = z.object({
  id: inventoryIdSchema,
  decision: z.enum(['approved', 'rejected']),
  remarks: z.string().trim().min(4).max(500),
  expectedVersion: z.number().int().positive(),
});
const createAssetRetirementSchema = z.object({
  assetId: inventoryIdSchema,
  retirementDate: z.iso.date(),
  reason: z.string().trim().min(8).max(500),
  evidenceReference: z.string().trim().min(4).max(160),
});
const decideAssetRetirementSchema = z.object({
  id: inventoryIdSchema,
  decision: z.enum(['approved', 'rejected']),
  remarks: z.string().trim().min(4).max(500),
  expectedVersion: z.number().int().positive(),
});
const completeAssetRetirementSchema = z.object({
  id: inventoryIdSchema,
  expectedVersion: z.number().int().positive(),
});
const assetLifecycleActionSchema = z.object({
  kind: z.enum(['create-impairment', 'decide-impairment', 'complete-impairment', 'create-revaluation', 'decide-revaluation', 'complete-revaluation', 'create-warranty', 'update-warranty', 'create-amc', 'decide-amc', 'update-amc', 'create-meter', 'record-meter', 'create-corrective', 'transition-corrective', 'create-calibration', 'decide-calibration', 'create-spare', 'issue-spare', 'create-fleet-vehicle', 'update-fleet-vehicle', 'create-fleet-trip', 'complete-fleet-trip']),
  input: z.record(z.string(), z.unknown()),
});
const createAssetCustodyTransferSchema = z.object({
  assetId: inventoryIdSchema,
  transferDate: z.iso.date(),
  reason: z.string().trim().min(8).max(500),
  destinationWarehouseId: inventoryIdSchema.optional(),
  destinationWorkCenterId: inventoryIdSchema.optional(),
  destinationCustodyLabel: z.string().trim().min(2).max(160),
});
const decideAssetCustodyTransferSchema = z.object({
  id: inventoryIdSchema,
  decision: z.enum(['approved', 'rejected']),
  remarks: z.string().trim().min(4).max(500),
  expectedVersion: z.number().int().positive(),
});
const receiveAssetCustodyTransferSchema = z.object({
  id: inventoryIdSchema,
  receiptRemarks: z.string().trim().min(4).max(500),
  expectedVersion: z.number().int().positive(),
});
const createAssetComponentizationSchema = z.object({
  assetId: inventoryIdSchema,
  effectiveOn: z.iso.date(),
  reason: z.string().trim().min(8).max(500),
  evidenceReference: z.string().trim().min(4).max(160),
  components: z.array(z.object({
    componentTag: inventoryIdSchema,
    name: z.string().trim().min(2).max(160),
    serialNumber: z.string().trim().min(2).max(80).optional(),
    categoryId: inventoryIdSchema.optional(),
    criticality: z.enum(['critical', 'high', 'normal', 'low']).optional(),
    serviceable: z.boolean().optional(),
  })).min(2).max(50),
});
const decideAssetComponentizationSchema = z.object({
  id: inventoryIdSchema,
  decision: z.enum(['approved', 'rejected']),
  remarks: z.string().trim().min(4).max(500),
  expectedVersion: z.number().int().positive(),
});
const createAssetComponentAllocationSchema = z.object({
  assetId: inventoryIdSchema,
  componentizationId: inventoryIdSchema,
  capitalizationId: inventoryIdSchema.optional(),
  lines: z.array(z.object({
    componentId: inventoryIdSchema,
    allocationPercent: z.number().positive().max(100),
    usefulLifeMonths: z.number().int().positive().max(1_200),
    residualValuePercent: z.number().min(0).max(99.99),
  })).min(1).max(50),
});
const decideAssetComponentAllocationSchema = z.object({
  id: inventoryIdSchema,
  decision: z.enum(['approved', 'rejected']),
  remarks: z.string().trim().min(4).max(500),
  expectedVersion: z.number().int().positive(),
});
const createAssetTransferAccountingSchema = z.object({
  assetId: inventoryIdSchema,
  transferDate: z.iso.date(),
  reason: z.string().trim().min(8).max(500),
  evidenceReference: z.string().trim().min(4).max(160),
  destinationCompanyId: inventoryIdSchema,
  destinationBranchId: inventoryIdSchema,
  destinationWarehouseId: inventoryIdSchema.optional(),
  destinationCustodyLabel: z.string().trim().min(2).max(160),
});
const decideAssetTransferAccountingSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const dispatchAssetTransferAccountingSchema = z.object({ id: inventoryIdSchema, expectedVersion: z.number().int().positive() });
const receiveAssetTransferAccountingSchema = z.object({ id: inventoryIdSchema, receiptRemarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const createAssetSaleDisposalSchema = z.object({ assetId: inventoryIdSchema, saleDate: z.iso.date(), customerAccountId: inventoryIdSchema, customerTaxRegistrationNumber: z.string().trim().min(15).max(15).optional(), supplyType: z.enum(['intra-state', 'inter-state', 'zero-rated', 'exempt']), taxableProceeds: z.number().positive(), gstRate: z.number().min(0).max(28), evidenceReference: z.string().trim().min(4).max(160) });
const decideAssetSaleDisposalSchema = z.object({ id: inventoryIdSchema, decision: z.enum(['approved', 'rejected']), remarks: z.string().trim().min(4).max(500), expectedVersion: z.number().int().positive() });
const completeAssetSaleDisposalSchema = z.object({ id: inventoryIdSchema, expectedVersion: z.number().int().positive() });
const createPreventiveMaintenancePlanSchema = z.object({
  assetId: inventoryIdSchema,
  name: z.string().trim().min(2).max(160),
  intervalDays: z.number().int().positive().max(36_500),
  nextDueOn: z.iso.date(),
  estimatedMinutes: z.number().int().positive().max(86_400),
  checklist: z.array(z.object({ title: z.string().trim().min(2).max(200), required: z.boolean() })).min(1).max(50),
});
const generateDueMaintenanceWorkOrderSchema = z.object({
  planId: inventoryIdSchema,
  asOfDate: z.iso.date(),
  technicianUserId: inventoryIdSchema,
  expectedVersion: z.number().int().positive(),
});
const startMaintenanceWorkOrderSchema = z.object({ id: inventoryIdSchema, expectedVersion: z.number().int().positive() });
const completeMaintenanceWorkOrderSchema = z.object({
  id: inventoryIdSchema,
  completedChecklistItemIds: z.array(inventoryIdSchema).max(50),
  serviceReport: z.string().trim().min(8).max(2_000),
  completionEvidenceReference: z.string().trim().min(4).max(160),
  expectedVersion: z.number().int().positive(),
});
const verifyMaintenanceWorkOrderSchema = z.object({
  id: inventoryIdSchema,
  decision: z.enum(['verified', 'reopened']),
  remarks: z.string().trim().min(4).max(500),
  expectedVersion: z.number().int().positive(),
});

function hasTrustedSender(event: IpcMainInvokeEvent): boolean {
  const senderUrl = event.senderFrame?.url;

  if (!senderUrl) {
    return false;
  }

  try {
    const parsed = new URL(senderUrl);
    const developmentUrl =
      typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string'
        ? MAIN_WINDOW_VITE_DEV_SERVER_URL
        : '';

    if (developmentUrl) {
      return parsed.origin === new URL(developmentUrl).origin;
    }

    return parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!hasTrustedSender(event)) {
    throw new Error('Blocked an IPC request from an untrusted renderer.');
  }
}

export function registerIpcHandlers(
  store: CrmStore,
  kernelStore: KernelStore,
  authService: AuthService,
  attachmentVault: AttachmentVault,
  backupService: BackupService,
  partyStore: PartyStore,
  crmDepthStore: CrmDepthStore,
  revenueOpsStore: RevenueOpsStore,
  generalLedgerStore: GeneralLedgerStore,
  apiKeyStore: ApiKeyStore,
  releaseGateStore: ReleaseGateStore,
  releaseArtifactStore: ReleaseArtifactStore,
  releaseUpdateStore: ReleaseUpdateStore,
  autoUpdateService: AutoUpdateService,
  uiAcceptanceStore: UiAcceptanceStore,
  intelligenceStore: IntelligenceStore,
  automationRunStore: AutomationRunStore,
  automationScheduleStore: AutomationScheduleStore,
  financeCompletionStore: FinanceCompletionStore,
  retailWorkspaceModeStore: RetailWorkspaceModeStore,
  database: BusinessDatabase,
  workspaceProvisioner?: WorkspaceProvisioner,
  runtimeDatabaseEncryption = getRuntimeDatabaseEncryptionEvidence(),
  artifactKeyRotation?: ArtifactKeyRotationService,
): void {
  assertIpcAuthorizationPolicyComplete();
  const rendererSessions = new Map<number, string>();
  const quotePdfService = new QuotePdfService();
  const invoicePdfService = new InvoicePdfService();
  // Vite replaces this identifier with a build-time literal in the packaged
  // main bundle. The fallback keeps unit/dev diagnostics usable without
  // allowing a runtime environment variable to rewrite release identity.
  const compileTimeBuildRevision = typeof EPIC_BOS_BUILD_REVISION === 'string' && EPIC_BOS_BUILD_REVISION.trim()
    ? EPIC_BOS_BUILD_REVISION.trim()
    : 'unversioned-local';
  const currentBuildProvenance = () => createBuildProvenance({
    productName: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    buildRevision: compileTimeBuildRevision,
    schemaRevision: getCurrentSchemaRevision(),
  }, new Date().toISOString());

  const getToken = (event: IpcMainInvokeEvent): string | undefined =>
    rendererSessions.get(event.sender.id);

  const assertAuthenticated = (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event);
    const token = getToken(event);
    const session = token ? authService.resolveSession(token) : null;
    if (!session) {
      rendererSessions.delete(event.sender.id);
      throw new Error('Your session has expired. Sign in again.');
    }
    return session;
  };

  const assertAuthorized = (
    event: IpcMainInvokeEvent,
    resource: string,
    action: BusinessAction,
    fields?: string[],
  ) => {
    const session = assertAuthenticated(event);
    kernelStore.assertAuthorized(session.userId, resource, action, fields);
    return session;
  };

  const assertGeneralLedgerAuthorized = (
    event: IpcMainInvokeEvent,
    resource: string,
    action: BusinessAction,
  ) => {
    const session = assertAuthenticated(event);
    const scope = generalLedgerStore.getBoundAuthorizationScope();
    if (scope) {
      kernelStore.assertAuthorizedInScope(
        session.userId,
        scope.companyId,
        scope.branchId,
        resource,
        action,
      );
    } else {
      kernelStore.assertAuthorized(session.userId, resource, action);
    }
    return session;
  };

  const assertCompanyOwnedAuthorized = (
    event: IpcMainInvokeEvent,
    companyId: string,
    resource: string,
    action: BusinessAction,
  ) => {
    const session = assertAuthenticated(event);
    kernelStore.assertAuthorizedInScope(session.userId, companyId, undefined, resource, action);
    return session;
  };

  const assertRevenueOperationsAuthorized = (
    event: IpcMainInvokeEvent,
    resource: string,
    action: BusinessAction,
  ) => {
    const session = assertAuthenticated(event);
    const scope = revenueOpsStore.getAuthorizationScope();
    kernelStore.assertAuthorizedInScope(
      session.userId,
      scope.companyId,
      scope.branchId,
      resource,
      action,
    );
    return session;
  };

  const assertRevenueOperationsRecordAuthorized = (
    event: IpcMainInvokeEvent,
    scope: { companyId: string; branchId: string },
    resource: string,
    action: BusinessAction,
  ) => {
    const session = assertAuthenticated(event);
    kernelStore.assertAuthorizedInScope(
      session.userId,
      scope.companyId,
      scope.branchId,
      resource,
      action,
    );
    return session;
  };

  const getAttachmentOperatingScope = (): { companyId: string; branchId: string } => {
    const scope = revenueOpsStore.getSnapshot().scope;
    if (!scope?.companyId || !scope.branchId) {
      throw new Error('Attachment operations require an active company and branch scope.');
    }
    return { companyId: scope.companyId, branchId: scope.branchId };
  };

  const planBakalooRetailDemoReset = (actor: {
    userId: string;
    email: string;
    displayName: string;
  }) => {
    const kernel = database.loadState<KernelState>('kernel')?.payload;
    const crm = database.loadState<CrmState>('crm')?.payload;
    const party = database.loadState<PartyState>('party')?.payload;
    const crmDepth = database.loadState<CrmDepthState>('crm-depth')?.payload;
    const revenueOps = database.loadState<RevenueOpsState>('revenue-ops-india')?.payload;
    if (!kernel || !crm || !party || !crmDepth || !revenueOps) {
      throw new Error('The retail starter reset is unavailable because a required workspace document is missing.');
    }
    return planBakalooRetailSampleReset({
      kernel,
      crm,
      party,
      crmDepth,
      revenueOps,
      owner: {
        userId: actor.userId,
        email: actor.email,
        displayName: actor.displayName,
      },
    });
  };

  const toBakalooRetailDemoResetPreview = (
    preview: BakalooRetailSampleResetPreview,
  ): BakalooRetailDemoResetPreview => ({
    eligible: preview.eligible,
    confirmationPhrase: BAKALOO_RETAIL_DEMO_RESET_CONFIRMATION,
    recordGroups: preview.recordsToClear.map(({ module, records }) => ({
      id: module.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label: module,
      count: records,
      detail: records === 1 ? '1 known generic demo record will be cleared.' : `${records} known generic demo records will be cleared.`,
    })),
    blockedReason: preview.eligible ? undefined : preview.reason,
  });

  const assertCommercialRecordAuthorized = (
    event: IpcMainInvokeEvent,
    kind: Parameters<typeof revenueOpsStore.getCommercialRecordAuthorizationScope>[0],
    id: string,
    resource: string,
    action: BusinessAction,
  ) => assertRevenueOperationsRecordAuthorized(
    event,
    revenueOpsStore.getCommercialRecordAuthorizationScope(kind, id),
    resource,
    action,
  );

  const assertInventoryRecordAuthorized = (
    event: IpcMainInvokeEvent,
    kind: Parameters<typeof revenueOpsStore.getInventoryRecordAuthorizationScope>[0],
    id: string,
    resource: string,
    action: BusinessAction,
  ) => assertRevenueOperationsRecordAuthorized(
    event,
    revenueOpsStore.getInventoryRecordAuthorizationScope(kind, id),
    resource,
    action,
  );

  const assertPhysicalFulfilmentRecordAuthorized = (
    event: IpcMainInvokeEvent,
    kind: Parameters<typeof revenueOpsStore.getPhysicalFulfilmentRecordAuthorizationScope>[0],
    id: string,
    resource: string,
    action: BusinessAction,
  ) => assertRevenueOperationsRecordAuthorized(
    event,
    revenueOpsStore.getPhysicalFulfilmentRecordAuthorizationScope(kind, id),
    resource,
    action,
  );

  const assertProcurementRecordAuthorized = (
    event: IpcMainInvokeEvent,
    kind: Parameters<typeof revenueOpsStore.getProcurementRecordAuthorizationScope>[0],
    id: string,
    resource: string,
    action: BusinessAction,
  ) => assertRevenueOperationsRecordAuthorized(
    event,
    revenueOpsStore.getProcurementRecordAuthorizationScope(kind, id),
    resource,
    action,
  );

  const assertManufacturingRecordAuthorized = (
    event: IpcMainInvokeEvent,
    kind: Parameters<typeof revenueOpsStore.getManufacturingRecordAuthorizationScope>[0],
    id: string,
    resource: string,
    action: BusinessAction,
  ) => assertRevenueOperationsRecordAuthorized(event, revenueOpsStore.getManufacturingRecordAuthorizationScope(kind, id), resource, action);

  const assertAssetMaintenanceRecordAuthorized = (
    event: IpcMainInvokeEvent,
    kind: Parameters<typeof revenueOpsStore.getAssetMaintenanceRecordAuthorizationScope>[0],
    id: string,
    resource: string,
    action: BusinessAction,
  ) => assertRevenueOperationsRecordAuthorized(
    event,
    revenueOpsStore.getAssetMaintenanceRecordAuthorizationScope(kind, id),
    resource,
    action,
  );

  const policyAwareIpcMain: Pick<IpcMain, 'handle'> = {
    handle(channel, listener) {
      electronIpcMain.handle(channel, async (event, ...args) => {
        const policy = getIpcAuthorizationPolicy(channel);
        let actorId: string | undefined;
        if (policy.mode === 'trusted') {
          assertTrustedSender(event);
        } else if (policy.mode === 'permission') {
          if (policy.scope === 'ledger-bound') {
            actorId = assertGeneralLedgerAuthorized(event, policy.resource, policy.action).userId;
          } else if (policy.scope === 'revenue-operations-bound') {
            actorId = assertRevenueOperationsAuthorized(event, policy.resource, policy.action).userId;
          } else {
            actorId = assertAuthorized(event, policy.resource, policy.action).userId;
          }
        } else {
          // Delegated routes resolve their target resource inside their own
          // validated handler. There is no session-only fallback: every
          // declared channel is explicitly trusted, permission-bound or
          // delegated-record-bound by the authorization manifest.
          actorId = assertAuthenticated(event).userId;
        }
        const response = await listener(event, ...args);
        return projectIpcResponseForPolicy(
          channel,
          policy,
          actorId,
          response,
          (candidate, scopedActorId) => revenueOpsStore.projectResponseForActor(candidate, scopedActorId),
        );
      });
    },
  };
  const ipcMain = policyAwareIpcMain;

  registerRetailWorkspaceStatusIpc(ipcMain, retailWorkspaceModeStore);

  ipcMain.handle(IPC_CHANNELS.authStatus, (event) => {
    assertTrustedSender(event);
    const status = authService.getStatus(getToken(event));
    if (!status.session) rendererSessions.delete(event.sender.id);
    return status;
  });

  ipcMain.handle(
    IPC_CHANNELS.authBootstrapOwner,
    async (event, payload: unknown) => {
      assertTrustedSender(event);
      const input = bootstrapOwnerSchema.parse(payload);
      if (workspaceProvisioner && !workspaceProvisioner.canProvisionFreshWorkspace()) {
        throw new Error(
          'Fresh workspace enrollment is no longer available. Restart Epic BOS before trying again.',
        );
      }
      const authenticated = workspaceProvisioner
        ? (await workspaceProvisioner.provisionFreshOwner(input)).authenticated
        : await authService.bootstrapOwner(input);
      // A fresh workspace is intentionally not initialized before the atomic
      // owner provisioning transaction. Hydrate its renderer-safe status only
      // after that transaction succeeds, so an empty app remains bootstrapable.
      if (workspaceProvisioner) {
        await retailWorkspaceModeStore.initialize();
      }
      if (!workspaceProvisioner) {
        await kernelStore.adoptBootstrapOwnerIdentity(
          input.email,
          input.displayName,
          authenticated.info.userId,
        );
      }
      rendererSessions.set(event.sender.id, authenticated.token);
      return authService.getStatus(authenticated.token);
    },
  );

  const assertWorkforcePayrollRecordAuthorized = (
    event: IpcMainInvokeEvent,
    id: string,
    resource: string,
    action: BusinessAction,
  ) => assertRevenueOperationsRecordAuthorized(event, revenueOpsStore.getWorkforcePayrollRecordAuthorizationScope(id), resource, action);

  const assertDeliveryRecordAuthorized = (
    event: IpcMainInvokeEvent,
    kind: Parameters<typeof revenueOpsStore.getDeliveryRecordAuthorizationScope>[0],
    id: string,
    resource: string,
    action: BusinessAction,
  ) => assertRevenueOperationsRecordAuthorized(event, revenueOpsStore.getDeliveryRecordAuthorizationScope(kind, id), resource, action);

  const assertFinanceControlRecordAuthorized = (
    event: IpcMainInvokeEvent,
    id: string,
    resource: string,
    action: BusinessAction,
  ) => assertRevenueOperationsRecordAuthorized(event, revenueOpsStore.getFinanceControlRecordAuthorizationScope(id), resource, action);

  const assertCodCollectionCaseAuthorized = (
    event: IpcMainInvokeEvent,
    id: string,
    resource: string,
    action: BusinessAction,
  ) => assertRevenueOperationsRecordAuthorized(event, revenueOpsStore.getCodCollectionCaseAuthorizationScope(id), resource, action);

  const assertStatutoryProviderRecordAuthorized = (
    event: IpcMainInvokeEvent,
    id: string,
    resource: string,
    action: BusinessAction,
  ) => assertRevenueOperationsRecordAuthorized(event, revenueOpsStore.getStatutoryProviderRecordAuthorizationScope(id), resource, action);

  ipcMain.handle(IPC_CHANNELS.authLogin, async (event, payload: unknown) => {
    assertTrustedSender(event);
    const authenticated = await authService.login(loginSchema.parse(payload));
    rendererSessions.set(event.sender.id, authenticated.token);
    return authService.getStatus(authenticated.token);
  });

  ipcMain.handle(IPC_CHANNELS.authLogout, (event) => {
    assertTrustedSender(event);
    const token = getToken(event);
    if (token) authService.logout(token);
    rendererSessions.delete(event.sender.id);
    return authService.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.authLock, (event) => {
    assertTrustedSender(event);
    rendererSessions.delete(event.sender.id);
    return authService.getStatus();
  });

  ipcMain.handle(
    IPC_CHANNELS.authChangePassword,
    async (event, payload: unknown) => {
      assertAuthenticated(event);
      const token = getToken(event);
      if (!token) throw new Error('Your session has expired. Sign in again.');
      await authService.changePassword(
        token,
        changePasswordSchema.parse(payload),
      );
    },
  );

  app.on('web-contents-created', (_event, contents) => {
    contents.once('destroyed', () => rendererSessions.delete(contents.id));
  });

  ipcMain.handle(
    IPC_CHANNELS.storageListAttachments,
    (event, payload: unknown) => {
      const target = attachmentTargetSchema.parse(payload);
      const scope = getAttachmentOperatingScope();
      assertRevenueOperationsRecordAuthorized(event, scope, target.resource, 'read');
      return attachmentVault.list(target.resource, target.resourceId, scope);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.storageAddAttachment,
    async (event, payload: unknown) => {
      const target = attachmentTargetSchema.parse(payload);
      const scope = getAttachmentOperatingScope();
      const actor = assertRevenueOperationsRecordAuthorized(event, scope, target.resource, 'update');
      const parent = BrowserWindow.fromWebContents(event.sender);
      const choice = parent
        ? await dialog.showOpenDialog(parent, {
            title: 'Encrypt and attach a file',
            properties: ['openFile'],
          })
        : await dialog.showOpenDialog({
            title: 'Encrypt and attach a file',
            properties: ['openFile'],
          });
      if (choice.canceled || !choice.filePaths[0]) return null;
      return attachmentVault.addFromPath(
        choice.filePaths[0],
        target.resource,
        target.resourceId,
        actor.userId,
        scope,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.storageExportAttachment,
    async (event, payload: unknown) => {
      const input = exportAttachmentSchema.parse(payload);
      const scope = getAttachmentOperatingScope();
      const record = attachmentVault.get(input.id, scope);
      if (!record) throw new Error('Attachment not found.');
      assertRevenueOperationsRecordAuthorized(event, scope, record.resource, 'export');
      const parent = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: 'Export verified attachment',
        defaultPath: record.fileName,
        properties: ['showOverwriteConfirmation' as const, 'createDirectory' as const],
      };
      const choice = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options);
      if (choice.canceled || !choice.filePath) return false;
      await rm(choice.filePath, { force: true });
      await attachmentVault.exportToPath(input.id, choice.filePath, scope);
      return true;
    },
  );

  ipcMain.handle(IPC_CHANNELS.storageCreateDatabaseBackup, async (event) => {
    assertAuthorized(event, 'kernel.backup', 'admin');
    return backupService.createInteractive(
      BrowserWindow.fromWebContents(event.sender),
    );
  });

  ipcMain.handle(IPC_CHANNELS.storageRestoreDatabaseBackup, async (event) => {
    assertAuthorized(event, 'kernel.backup', 'admin');
    return backupService.restoreInteractive(
      BrowserWindow.fromWebContents(event.sender),
    );
  });

  ipcMain.handle(IPC_CHANNELS.storageRunRestoreDrill, async (event) => {
    const actor = assertAuthorized(event, 'kernel.backup', 'admin');
    const receipt = await backupService.runRestoreDrill();
    database.recordRestoreDrill({ ...receipt, actorId: actor.userId });
    if (receipt.status === 'passed' && receipt.sourceBackup && receipt.restoredCopy) {
      const health = kernelStore.getOperationalHealth();
      const evidence = createRestoreDrillEvidence({
        id: receipt.id,
        backupReference: `restore-drill://${receipt.id}/source`,
        backupChecksum: receipt.sourceBackup.sha256,
        restoredDatabaseChecksum: receipt.restoredCopy.sha256,
        target: 'isolated-test-database',
        operatorId: actor.userId,
        startedAt: receipt.startedAt,
        completedAt: receipt.verifiedAt,
        durationBudgetMs: 30_000,
        integrityVerified: true,
        auditChainVerified: health.auditChainValid,
        migrationsVerified: health.migrationsValid,
      });
      releaseGateStore.record({
        id: 'backup-restore',
        label: 'Backup and restore',
        status: evidence.status === 'passed' ? 'passed' : 'failed',
        evidenceReference: `restore-drill://${evidence.id}`,
        checkedAt: evidence.completedAt,
        evidenceChecksum: evidence.checksum,
        notes: `Automated isolated drill recorded by ${actor.userId}.`,
      });
    } else {
      releaseGateStore.record({
        id: 'backup-restore',
        label: 'Backup and restore',
        status: 'failed',
        evidenceReference: `restore-drill://${receipt.id}`,
        checkedAt: receipt.verifiedAt,
        notes: `Automated isolated drill failed: ${receipt.message}`,
      });
    }
    return receipt;
  });

  ipcMain.handle(IPC_CHANNELS.storageRewrapLocalBackups, async (event) => {
    assertAuthorized(event, 'kernel.backup', 'admin');
    return backupService.rewrapLocalBackups();
  });

  ipcMain.handle(IPC_CHANNELS.storageListRestoreDrills, (event) => {
    assertAuthorized(event, 'kernel.backup', 'read');
    return database.listRestoreDrills();
  });

  ipcMain.handle(IPC_CHANNELS.retailWorkspaceGetDemoResetPreview, (event) => {
    const actor = assertAuthorized(event, 'kernel.tenant', 'admin');
    return toBakalooRetailDemoResetPreview(
      planBakalooRetailDemoReset(actor).preview,
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.retailWorkspaceApplyDemoReset,
    async (event, payload: unknown) => {
      const actor = assertAuthorized(event, 'kernel.tenant', 'admin');
      const input = applyBakalooRetailDemoResetSchema.parse(payload);
      if (input.confirmation !== BAKALOO_RETAIL_DEMO_RESET_CONFIRMATION) {
        throw new Error(`Type ${BAKALOO_RETAIL_DEMO_RESET_CONFIRMATION} exactly to replace the known demo.`);
      }

      const initialPlan = planBakalooRetailDemoReset(actor);
      if (!initialPlan.preview.eligible || !initialPlan.documents) {
        return {
          applied: false,
          backup: null,
          message: initialPlan.preview.reason,
        };
      }

      const backup = await backupService.createInteractive(
        BrowserWindow.fromWebContents(event.sender),
      );
      if (!backup) {
        return {
          applied: false,
          backup: null,
          message: 'No change was made because the required verified backup was cancelled.',
        };
      }

      // A file-picker can yield to other workbench actions. Recheck the full
      // fingerprint after the backup so a newly changed workspace is never
      // cleared from an earlier preview.
      const finalPlan = planBakalooRetailDemoReset(actor);
      if (!finalPlan.preview.eligible || !finalPlan.documents) {
        return {
          applied: false,
          backup,
          message: 'The workspace changed while the backup was created, so nothing was reset. Your backup is retained.',
        };
      }

      const documents = finalPlan.documents;
      database.replaceStateDocumentsAtomically([
        { namespace: 'kernel', schemaVersion: documents.kernel.schemaVersion, revision: documents.kernel.revision, payload: documents.kernel },
        { namespace: 'crm', schemaVersion: documents.crm.schemaVersion, revision: documents.crm.revision, payload: documents.crm },
        { namespace: 'party', schemaVersion: documents.party.schemaVersion, revision: documents.party.revision, payload: documents.party },
        { namespace: 'crm-depth', schemaVersion: documents.crmDepth.schemaVersion, revision: documents.crmDepth.revision, payload: documents.crmDepth },
        { namespace: 'revenue-ops-india', schemaVersion: documents.revenueOps.schemaVersion, revision: documents.revenueOps.revision, payload: documents.revenueOps },
      ], undefined, {
        retireAuditForReplacedNamespaces: true,
        retireOutboxForReplacedNamespaces: true,
      });

      await Promise.all([
        store.initialize(),
        kernelStore.initialize(),
        partyStore.initialize(),
      ]);
      await crmDepthStore.initialize();
      await revenueOpsStore.initialize();
      await generalLedgerStore.initialize();

      return {
        applied: true,
        backup,
        message: 'The known generic demo was replaced with a clean Bakaloo retail starter. Your sign-in and backup remain intact.',
      };
    },
  );

  ipcMain.handle(IPC_CHANNELS.authMfaStatus, (event) => {
    assertAuthenticated(event);
    const token = getToken(event);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    return authService.getMfaStatus(token);
  });

  ipcMain.handle(IPC_CHANNELS.authMfaBeginEnrollment, (event) => {
    const session = assertAuthenticated(event);
    const token = getToken(event);
    if (!token) throw new Error(`The session for ${session.email} has expired. Sign in again.`);
    return authService.beginMfaEnrollment(token);
  });

  ipcMain.handle(IPC_CHANNELS.authMfaConfirmEnrollment, (event, payload: unknown) => {
    assertAuthenticated(event);
    const token = getToken(event);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    return authService.confirmMfaEnrollment(token, mfaConfirmSchema.parse(payload).code);
  });

  ipcMain.handle(IPC_CHANNELS.authMfaDisable, async (event, payload: unknown) => {
    assertAuthenticated(event);
    const token = getToken(event);
    if (!token) throw new Error('Your session has expired. Sign in again.');
    await authService.disableMfa(token, mfaDisableSchema.parse(payload).currentPassword);
    rendererSessions.delete(event.sender.id);
    return authService.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.partySnapshot, (event) => {
    assertCompanyOwnedAuthorized(event, partyStore.getCompanyId(), 'crm.party', 'read');
    return partyStore.getSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.partyCreateAccount, (event, payload: unknown) => {
    const actor = assertCompanyOwnedAuthorized(event, partyStore.getCompanyId(), 'crm.party', 'create');
    return partyStore.addAccount(createAccountSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.partyCreateContact, (event, payload: unknown) => {
    const actor = assertCompanyOwnedAuthorized(event, partyStore.getCompanyId(), 'crm.party', 'create');
    return partyStore.addContact(createContactSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.partyRecordConsent, (event, payload: unknown) => {
    const actor = assertCompanyOwnedAuthorized(event, partyStore.getCompanyId(), 'crm.party', 'update');
    return partyStore.addConsent(recordConsentSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.partyResolveDuplicate, (event, payload: unknown) => {
    const actor = assertCompanyOwnedAuthorized(event, partyStore.getCompanyId(), 'crm.party', 'update');
    return partyStore.resolveDuplicate(resolveDuplicateSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.partyAddAddress, (event, payload: unknown) => {
    const actor = assertCompanyOwnedAuthorized(event, partyStore.getCompanyId(), 'crm.party', 'update');
    return partyStore.addAddress(addAddressSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.partyAddContactPoint, (event, payload: unknown) => {
    const actor = assertCompanyOwnedAuthorized(event, partyStore.getCompanyId(), 'crm.party', 'update');
    return partyStore.addContactPoint(addContactPointSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.partyCreateRelationship, (event, payload: unknown) => {
    const actor = assertCompanyOwnedAuthorized(event, partyStore.getCompanyId(), 'crm.party', 'update');
    return partyStore.addRelationship(createRelationshipSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.partyExecuteMerge, (event, payload: unknown) => {
    const actor = assertCompanyOwnedAuthorized(event, partyStore.getCompanyId(), 'crm.party', 'update');
    return partyStore.merge(executeMergeSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.partyConvertLead, async (event, payload: unknown) => {
    const actor = assertCompanyOwnedAuthorized(event, partyStore.getCompanyId(), 'crm.party', 'update');
    kernelStore.assertAuthorizedInScope(actor.userId, store.getCompanyId(), undefined, 'crm.opportunity', 'update');
    const input = convertLeadSchema.parse(payload);
    const lead = store.getLead(input.leadId);
    if (!lead) throw new Error('Lead not found.');
    if (lead.version !== input.expectedLeadVersion && lead.status !== 'converted') throw new Error('The lead changed. Refresh and retry.');
    const party = await partyStore.convertLead({
      ...input,
      leadName: lead.name,
      leadCompany: lead.company,
      leadEmail: lead.email,
      ownerId: actor.userId,
    }, actor.userId);
    const conversion = party.leadConversions.find(({ leadId }) => leadId === lead.id);
    if (!conversion) throw new Error('Lead conversion did not produce party references.');
    const crm = await store.markLeadConverted(lead.id, input.expectedLeadVersion, conversion.accountId, conversion.contactId);
    return { crm, party };
  });

  ipcMain.handle(IPC_CHANNELS.crmDepthSnapshot, (event) => {
    assertRevenueOperationsRecordAuthorized(event, crmDepthStore.getAuthorizationScope(), 'crm.configuration', 'read');
    return crmDepthStore.getSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.crmDepthUpdatePipeline, (event, payload: unknown) => {
    assertRevenueOperationsRecordAuthorized(event, crmDepthStore.getAuthorizationScope(), 'crm.configuration', 'update');
    return crmDepthStore.updatePipeline(updatePipelineSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.crmDepthCreateScoringRule, (event, payload: unknown) => {
    assertRevenueOperationsRecordAuthorized(event, crmDepthStore.getAuthorizationScope(), 'crm.configuration', 'create');
    return crmDepthStore.addScoringRule(createScoringRuleSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.crmDepthCreateCampaign, (event, payload: unknown) => {
    assertRevenueOperationsRecordAuthorized(event, crmDepthStore.getAuthorizationScope(), 'crm.configuration', 'create');
    return crmDepthStore.addCampaign(createCampaignSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.crmDepthTransitionCampaign, (event, payload: unknown) => {
    assertRevenueOperationsRecordAuthorized(event, crmDepthStore.getAuthorizationScope(), 'crm.configuration', 'update');
    return crmDepthStore.transitionCampaign(transitionCampaignSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.crmDepthCreateSavedView, (event, payload: unknown) => {
    assertRevenueOperationsRecordAuthorized(event, crmDepthStore.getAuthorizationScope(), 'crm.configuration', 'create');
    return crmDepthStore.addSavedView(createSavedViewSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.crmDepthPreviewLeadImport, async (event) => {
    const actor = assertRevenueOperationsRecordAuthorized(event, crmDepthStore.getAuthorizationScope(), 'crm.import', 'create');
    const parent = BrowserWindow.fromWebContents(event.sender);
    const choice = parent ? await dialog.showOpenDialog(parent, { title: 'Preview governed lead import', filters: [{ name: 'CSV data', extensions: ['csv'] }], properties: ['openFile'] }) : await dialog.showOpenDialog({ title: 'Preview governed lead import', filters: [{ name: 'CSV data', extensions: ['csv'] }], properties: ['openFile'] });
    if (choice.canceled || !choice.filePaths[0]) return null;
    const filePath = choice.filePaths[0];
    const fileStat = await stat(filePath);
    if (!fileStat.isFile() || fileStat.size > 5 * 1024 * 1024) throw new Error('Import files must be regular CSV files no larger than 5 MB.');
    return crmDepthStore.previewLeadImport(path.basename(filePath), await readFile(filePath, 'utf8'), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.crmDepthCommitImport, async (event, payload: unknown) => {
    const actor = assertRevenueOperationsRecordAuthorized(event, crmDepthStore.getAuthorizationScope(), 'crm.import', 'submit');
    const scope = store.getAuthorizationScope();
    kernelStore.assertAuthorizedInScope(actor.userId, scope.companyId, scope.branchId, 'crm.opportunity', 'create');
    const input = commitImportSchema.parse(payload);
    const job = crmDepthStore.getImportJob(input.id);
    if (!job || job.version !== input.expectedVersion || job.status !== 'preview') throw new Error('Import preview changed. Refresh and retry.');
    const crm = await store.addImportedLeads(job.rows.filter(({ status }) => status === 'accepted').map(({ values }) => values));
    const depth = await crmDepthStore.commitImport(input);
    return { crm, depth };
  });

  ipcMain.handle(IPC_CHANNELS.crmDepthConfigureAdapter, (event, payload: unknown) => {
    assertRevenueOperationsRecordAuthorized(event, crmDepthStore.getAuthorizationScope(), 'crm.integration', 'update');
    return crmDepthStore.configureAdapter(configureAdapterSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.crmDepthRecordCommunication, (event, payload: unknown) => {
    const actor = assertRevenueOperationsRecordAuthorized(event, crmDepthStore.getAuthorizationScope(), 'crm.communication', 'create');
    kernelStore.assertAuthorizedInScope(actor.userId, partyStore.getCompanyId(), undefined, 'crm.party', 'read');
    return crmDepthStore.addCommunication(recordCommunicationSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.crmDepthRecordCommunicationDelivery, (event, payload: unknown) => {
    assertRevenueOperationsRecordAuthorized(event, crmDepthStore.getAuthorizationScope(), 'crm.communication', 'update');
    return crmDepthStore.recordCommunicationDelivery(recordCommunicationDeliverySchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.generalLedgerSnapshot, (event) => {
    assertGeneralLedgerAuthorized(event, 'finance.journal', 'read');
    return generalLedgerStore.getSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.generalLedgerBindCompany, (event, payload: unknown) => {
    const input = bindLedgerCompanySchema.parse(payload);
    const actor = assertGeneralLedgerAuthorized(event, 'finance.chart-of-accounts', 'admin');
    kernelStore.assertAuthorizedInScope(
      actor.userId,
      input.companyId,
      input.branchId,
      'finance.chart-of-accounts',
      'admin',
    );
    return generalLedgerStore.bindCompany(input, actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.generalLedgerCreateJournal, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.createJournal(
      createLedgerJournalSchema.parse(payload),
      actor.userId,
    );
  });

  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareRevenueInvoicePosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareRevenueInvoicePosting(
      prepareRevenueInvoicePostingSchema.parse(payload),
      actor.userId,
    );
  });

  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareCashReceiptPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareCashReceiptPosting(prepareCashReceiptPostingSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareWriteOffPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareWriteOffPosting(prepareRevenueInvoicePostingSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareWithholdingPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareWithholdingPosting(prepareRevenueInvoicePostingSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareTreasuryPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareTreasuryPosting(prepareRevenueInvoicePostingSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareManufacturingPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareManufacturingPosting(prepareRevenueInvoicePostingSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareLandedCostPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareLandedCostPosting(prepareRevenueInvoicePostingSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareRetailSaleCostPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareRetailSaleCostPosting(prepareRevenueInvoicePostingSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareRetailReturnCostPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareRetailReturnCostPosting(prepareRevenueInvoicePostingSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareRetailCommerceSettlementPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    const input = prepareRevenueInvoicePostingSchema.parse(payload);
    assertRevenueOperationsRecordAuthorized(event, revenueOpsStore.getJournalDraftAuthorizationScope(input.journalDraftId), 'finance.journal', 'create');
    return generalLedgerStore.prepareRetailCommerceSettlementPosting(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareRetailCommissionPayoutPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    const input = prepareRevenueInvoicePostingSchema.parse(payload);
    assertRevenueOperationsRecordAuthorized(event, revenueOpsStore.getJournalDraftAuthorizationScope(input.journalDraftId), 'finance.journal', 'create');
    return generalLedgerStore.prepareRetailCommissionPayoutPosting(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPreparePeoplePosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.preparePeoplePosting(prepareRevenueInvoicePostingSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareCommercialAdjustmentPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareCommercialAdjustmentPosting(prepareCommercialAdjustmentPostingSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareSupplierInvoicePosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareSupplierInvoicePosting(prepareSupplierInvoicePostingSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareAssetCapitalizationPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareAssetCapitalizationPosting(
      prepareAssetCapitalizationPostingSchema.parse(payload),
      actor.userId,
    );
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareAssetDepreciationPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareAssetDepreciationPosting(
      prepareAssetDepreciationPostingSchema.parse(payload),
      actor.userId,
    );
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareAssetRetirementPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareAssetRetirementPosting(
      prepareAssetRetirementPostingSchema.parse(payload),
      actor.userId,
    );
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareAssetSaleDisposalPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareAssetSaleDisposalPosting(
      prepareAssetRetirementPostingSchema.parse(payload),
      actor.userId,
    );
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareAssetLifecyclePosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareAssetLifecyclePosting(
      prepareAssetRetirementPostingSchema.parse(payload),
      actor.userId,
    );
  });
  ipcMain.handle(IPC_CHANNELS.generalLedgerPrepareProjectRevenueRecognitionPosting, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.prepareProjectRevenueRecognitionPosting(
      prepareProjectRevenueRecognitionPostingSchema.parse(payload),
      actor.userId,
    );
  });

  ipcMain.handle(IPC_CHANNELS.generalLedgerPostJournal, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'post');
    const input = postLedgerJournalSchema.parse(payload);
    return generalLedgerStore.postJournal(input.id, input.expectedVersion, actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.generalLedgerReverseJournal, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'create');
    return generalLedgerStore.reverseJournal(
      reverseLedgerJournalSchema.parse(payload),
      actor.userId,
    );
  });

  ipcMain.handle(IPC_CHANNELS.generalLedgerCancelReversalJournal, (event, payload: unknown) => {
    const actor = assertGeneralLedgerAuthorized(event, 'finance.journal', 'update');
    return generalLedgerStore.cancelReversalJournal(
      cancelLedgerJournalSchema.parse(payload),
      actor.userId,
    );
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsSnapshot, (event) => {
    assertRevenueOperationsAuthorized(event, 'operations.workspace', 'read');
    return revenueOpsStore.getSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsListRetailCutoverPlans, (event) => {
    assertRevenueOperationsAuthorized(event, 'release.control', 'read');
    return revenueOpsStore.getRetailCutoverPlans();
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsFetchRetailHubCutoverAssessment, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'release.control', 'read');
    return fetchRetailHubCutoverAssessment(fetchRetailHubCutoverAssessmentSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsFetchRetailHubDeploymentPreflight, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'release.control', 'read');
    return fetchRetailHubDeploymentPreflight(fetchRetailHubDeploymentPreflightSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsFetchRetailHubShadowImportPreflight, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'release.control', 'read');
    return fetchRetailHubShadowImportPreflight(fetchRetailHubShadowImportPreflightSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsFetchRetailHubShadowImportSourceStatus, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'release.control', 'read');
    return fetchRetailHubShadowImportSourceStatus(fetchRetailHubShadowImportSourceStatusSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsFetchRetailHubShadowImportPullReceipts, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'release.control', 'read');
    return fetchRetailHubShadowImportPullReceipts(fetchRetailHubShadowImportPullReceiptsSchema.parse(payload));
  });
  ipcMain.handle(IPC_CHANNELS.revenueOpsFetchRetailHubStoreEdgeWorkerMetrics, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'release.control', 'read');
    return fetchRetailHubStoreEdgeWorkerMetrics(fetchRetailHubStoreEdgeWorkerMetricsSchema.parse(payload));
  });
  ipcMain.handle(IPC_CHANNELS.revenueOpsFetchRetailHubCoverageMap, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'release.control', 'read');
    return fetchRetailHubCoverageMap(fetchRetailHubCoverageMapSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateRetailCutoverPlan, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'release.control', 'create');
    assertManualRetailCutoverRegistrationAllowed({ isPackaged: app.isPackaged, nodeEnv: process.env.NODE_ENV });
    return revenueOpsStore.createRetailCutoverPlan(createRetailCutoverPlanSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateRetailCutoverPlanFromHubAssessment, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'release.control', 'create');
    return revenueOpsStore.createRetailCutoverPlanFromHubAssessment(createRetailCutoverPlanFromHubAssessmentSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsAdvanceRetailCutover, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'release.control', 'approve');
    return revenueOpsStore.advanceRetailCutover(advanceRetailCutoverSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsPeopleReadProjection, (event) => {
    const actor = assertRevenueOperationsAuthorized(event, 'operations.workspace', 'read');
    return revenueOpsStore.getPeopleReadProjection(actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsUpdateProfile, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'sales.geography', 'update');
    return revenueOpsStore.updateProfile(updateIndiaProfileSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateTerritory, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'sales.geography', 'create');
    return revenueOpsStore.addTerritory(createTerritorySchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateAssignmentRule, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'sales.geography', 'create');
    return revenueOpsStore.addAssignmentRule(createAssignmentRuleSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsBulkAssign, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'sales.geography', 'update');
    return revenueOpsStore.bulkAssign(bulkAssignSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateSegment, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'crm.configuration', 'create');
    return revenueOpsStore.addSegment(createAudienceSegmentSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateOpportunity, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    return revenueOpsStore.createOpportunity(createIndiaOpportunitySchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateQuote, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    return revenueOpsStore.createQuote(createQuoteSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsTransitionQuote, (event, payload: unknown) => {
    const input = transitionQuoteSchema.parse(payload);
    assertCommercialRecordAuthorized(event, 'quote', input.id, 'sales.commercial', 'update');
    return revenueOpsStore.moveQuote(input);
  });

  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateGstTaxCode, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'sales.catalog', 'create'); return revenueOpsStore.addGstTaxCode(createGstTaxCodeSchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateCatalogProduct, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'sales.catalog', 'create'); return revenueOpsStore.addCatalogProduct(createCatalogProductSchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsImportRetailProductPack, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'sales.catalog', 'create'); return revenueOpsStore.importRetailProductPack(importRetailProductPackSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreatePriceList, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'sales.catalog', 'create'); return revenueOpsStore.addPriceList(createPriceListSchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreatePriceListEntry, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'sales.catalog', 'update'); return revenueOpsStore.addPriceListEntry(createPriceListEntrySchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateDiscountPolicy, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'sales.pricing', 'create'); return revenueOpsStore.addDiscountPolicy(createDiscountPolicySchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsSubmitPriceListForApproval, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'sales.pricing', 'create'); return revenueOpsStore.submitPriceList(submitPriceListForApprovalSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsDecidePriceListApproval, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'sales.pricing', 'approve'); return revenueOpsStore.decidePriceList(decidePriceListApprovalSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsSubmitQuoteForApproval, (event, payload: unknown) => { const input = submitQuoteForApprovalSchema.parse(payload); const actor = assertCommercialRecordAuthorized(event, 'quote', input.id, 'sales.commercial', 'submit'); return revenueOpsStore.submitQuote(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsDecideQuoteApproval, (event, payload: unknown) => { const input = decideQuoteApprovalSchema.parse(payload); const actor = assertCommercialRecordAuthorized(event, 'quote-approval', input.requestId, 'sales.commercial', 'approve'); return revenueOpsStore.decideQuote(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsExportQuotePdf, async (event, payload: unknown) => {
    const { quoteId } = exportQuotePdfSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(
      event,
      revenueOpsStore.getDocumentAuthorizationScope('quote', quoteId),
      'sales.commercial',
      'export',
    );
    const receipt = await quotePdfService.export(BrowserWindow.fromWebContents(event.sender), revenueOpsStore.getQuoteBundle(quoteId), actor.userId);
    if (receipt) await revenueOpsStore.recordQuotePdf(receipt);
    return receipt;
  });
  ipcMain.handle(IPC_CHANNELS.revenueOpsConvertQuoteToSalesOrder, (event, payload: unknown) => { const input = convertQuoteToSalesOrderSchema.parse(payload); const actor = assertCommercialRecordAuthorized(event, 'quote', input.quoteId, 'sales.commercial', 'create'); return revenueOpsStore.convertQuote(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsTransitionSalesOrder, (event, payload: unknown) => { const input = transitionSalesOrderSchema.parse(payload); assertCommercialRecordAuthorized(event, 'sales-order', input.id, 'sales.commercial', 'update'); return revenueOpsStore.moveSalesOrder(input); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsUpdateFulfilmentTask, (event, payload: unknown) => { const input = updateFulfilmentTaskSchema.parse(payload); assertCommercialRecordAuthorized(event, 'fulfilment-task', input.id, 'sales.commercial', 'update'); return revenueOpsStore.moveFulfilmentTask(input); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreatePaymentTerm, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create'); return revenueOpsStore.addPaymentTerm(createPaymentTermSchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.retailCreateCounter, (event, payload: unknown) => {
    const input = createRetailCounterSchema.parse(payload);
    const actor = assertInventoryRecordAuthorized(event, 'warehouse', input.warehouseId, 'inventory.master', 'create');
    return revenueOpsStore.createRetailCounter(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailOpenCashierShift, (event, payload: unknown) => {
    const input = openRetailCashierShiftSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(
      event,
      revenueOpsStore.getRetailPosRecordAuthorizationScope('counter', input.counterId),
      'sales.commercial',
      'update',
    );
    return revenueOpsStore.openRetailCashierShift(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCheckout, (event, payload: unknown) => {
    const input = checkoutRetailSaleSchema.parse(payload);
    const scope = revenueOpsStore.getRetailPosRecordAuthorizationScope('counter', input.counterId);
    const actor = assertRevenueOperationsRecordAuthorized(event, scope, 'sales.commercial', 'create');
    assertRevenueOperationsRecordAuthorized(event, scope, 'inventory.execution', 'create');
    return revenueOpsStore.checkoutRetailSale(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailEnqueueOfflineSale, (event, payload: unknown) => {
    const input = enqueueRetailOfflineSaleSchema.parse(payload);
    const scope = revenueOpsStore.getRetailPosRecordAuthorizationScope('counter', input.counterId);
    const actor = assertRevenueOperationsRecordAuthorized(event, scope, 'sales.commercial', 'create');
    assertRevenueOperationsRecordAuthorized(event, scope, 'inventory.execution', 'create');
    return revenueOpsStore.enqueueRetailOfflineSale(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailSyncOfflineSale, (event, payload: unknown) => {
    const input = syncRetailOfflineSaleSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create');
    return revenueOpsStore.syncRetailOfflineSale(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailSyncOfflineQueue, (event, payload: unknown) => {
    const input = syncRetailOfflineQueueSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create');
    return revenueOpsStore.syncRetailOfflineQueue(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailResolveOfflineSale, (event, payload: unknown) => {
    const input = resolveRetailOfflineSaleSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'update');
    assertRevenueOperationsAuthorized(event, 'inventory.execution', 'update');
    return revenueOpsStore.resolveRetailOfflineSale(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailSendHubStoreEdgeSync, async (event, payload: unknown) => {
    const input = sendRetailHubStoreEdgeSyncSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    return revenueOpsStore.sendRetailHubStoreEdgeSync(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailSyncHubStoreEdgeQueue, async (event, payload: unknown) => {
    const input = syncRetailHubStoreEdgeQueueSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    return revenueOpsStore.syncRetailHubStoreEdgeQueue(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailSaveHubStoreEdgeSyncPolicy, async (event, payload: unknown) => {
    const input = saveRetailHubStoreEdgeSyncPolicySchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'update');
    return revenueOpsStore.saveRetailHubStoreEdgeSyncPolicy(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailIngestUnifiedOrder, (event, payload: unknown) => {
    const input = ingestRetailUnifiedOrderSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    if (input.mode === 'governed') assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create');
    if (input.event.source.channel !== 'pos') assertRendererRetailProviderOperationAllowed({ isPackaged: app.isPackaged, nodeEnv: process.env.NODE_ENV }, 'ingest-external-unified-order');
    return revenueOpsStore.ingestRetailUnifiedOrder(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailPrepareUnifiedOrderHandoff, (event, payload: unknown) => {
    const input = prepareRetailUnifiedOrderHandoffSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'approve');
    assertRevenueOperationsAuthorized(event, 'inventory.execution', 'approve');
    return revenueOpsStore.prepareRetailUnifiedOrderHandoff(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailPrepareOrderHubHandoff, (event, payload: unknown) => {
    const input = prepareRetailOrderHubHandoffSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create');
    return revenueOpsStore.prepareRetailOrderHubHandoff(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailRecordOrderHubHandoffResult, (event, payload: unknown) => {
    const input = recordRetailOrderHubHandoffResultSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'approve');
    assertRevenueOperationsAuthorized(event, 'inventory.execution', 'approve');
    assertRendererRetailProviderOperationAllowed({ isPackaged: app.isPackaged, nodeEnv: process.env.NODE_ENV }, 'record-hub-handoff-outcome');
    return revenueOpsStore.recordRetailOrderHubHandoffResult(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailPrepareOrderFulfilmentHandoff, (event, payload: unknown) => {
    const input = prepareRetailOrderFulfilmentHandoffSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create');
    return revenueOpsStore.prepareRetailOrderFulfilmentHandoff(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailDecideOrderFulfilmentHandoff, (event, payload: unknown) => {
    const input = decideRetailOrderFulfilmentHandoffSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'approve');
    assertRevenueOperationsAuthorized(event, 'inventory.execution', 'approve');
    return revenueOpsStore.decideRetailOrderFulfilmentHandoff(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailReserveUnifiedOrderStock, (event, payload: unknown) => {
    const input = reserveRetailUnifiedOrderStockSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'update');
    assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create');
    return revenueOpsStore.reserveRetailUnifiedOrderStock(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateUnifiedOrderPickTasks, (event, payload: unknown) => {
    const input = createRetailUnifiedOrderPickTasksSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create');
    return revenueOpsStore.createRetailUnifiedOrderPickTasks(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCompleteUnifiedOrderPickTasks, (event, payload: unknown) => {
    const input = completeRetailUnifiedOrderPickTasksSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'update');
    return revenueOpsStore.completeRetailUnifiedOrderPickTasks(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateUnifiedOrderShipmentPackage, (event, payload: unknown) => {
    const input = createRetailUnifiedOrderShipmentPackageSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'update');
    assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create');
    return revenueOpsStore.createRetailUnifiedOrderShipmentPackage(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCompleteUnifiedOrderShipmentPackage, (event, payload: unknown) => {
    const input = completeRetailUnifiedOrderShipmentPackageSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'update');
    return revenueOpsStore.completeRetailUnifiedOrderShipmentPackage(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailPrepareUnifiedOrderDispatch, (event, payload: unknown) => {
    const input = prepareRetailUnifiedOrderDispatchSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'update');
    return revenueOpsStore.prepareRetailUnifiedOrderDispatch(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailDispatchUnifiedOrder, (event, payload: unknown) => {
    const input = dispatchRetailUnifiedOrderSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'update');
    assertRevenueOperationsAuthorized(event, 'sales.commercial', 'update');
    return revenueOpsStore.dispatchRetailUnifiedOrder(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailConfirmUnifiedOrderDelivery, (event, payload: unknown) => {
    const input = confirmRetailUnifiedOrderDeliverySchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'update');
    assertRevenueOperationsAuthorized(event, 'sales.commercial', 'update');
    return revenueOpsStore.confirmRetailUnifiedOrderDelivery(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailReconcileUnifiedOrderRto, (event, payload: unknown) => {
    const input = reconcileRetailUnifiedOrderRtoSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'update');
    assertRevenueOperationsAuthorized(event, 'sales.commercial', 'update');
    return revenueOpsStore.reconcileRetailUnifiedOrderRto(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailReconcileUnifiedOrderCancellation, (event, payload: unknown) => {
    const input = reconcileRetailUnifiedOrderCancellationSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'update');
    assertRevenueOperationsAuthorized(event, 'sales.commercial', 'update');
    return revenueOpsStore.reconcileRetailUnifiedOrderCancellation(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailReconcileUnifiedOrderReturn, (event, payload: unknown) => {
    const input = reconcileRetailUnifiedOrderReturnSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'update');
    assertRevenueOperationsAuthorized(event, 'sales.commercial', 'update');
    assertRevenueOperationsAuthorized(event, 'finance.receivable', 'create');
    return revenueOpsStore.reconcileRetailUnifiedOrderReturn(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailRecordUnifiedOrderCarrierCallback, (event, payload: unknown) => {
    const input = recordRetailUnifiedOrderCarrierCallbackSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'update');
    assertRevenueOperationsAuthorized(event, 'sales.commercial', 'update');
    assertRendererRetailProviderOperationAllowed({ isPackaged: app.isPackaged, nodeEnv: process.env.NODE_ENV }, 'record-carrier-callback');
    return revenueOpsStore.recordRetailUnifiedOrderCarrierCallback(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailPrepareDeviceTransport, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create');
    return revenueOpsStore.prepareRetailDeviceTransport(prepareRetailDeviceTransportIpcSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailRecordDeviceTransport, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve');
    return revenueOpsStore.recordRetailDeviceTransport(recordRetailDeviceTransportSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailExecuteDeviceTransport, async (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve');
    return revenueOpsStore.executeRetailDeviceTransport(executeRetailDeviceTransportSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailRetryDeviceTransport, (event, payload: unknown) => {
    const input = retryRetailDeviceTransportSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve');
    return revenueOpsStore.retryRetailDeviceTransport(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailPreflightDeviceTransport, async (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create');
    return revenueOpsStore.preflightRetailDeviceTransport(preflightRetailDeviceTransportSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailRecordDevicePreflightEvidence, async (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create');
    return revenueOpsStore.recordRetailDevicePreflightEvidence(recordRetailDevicePreflightEvidenceSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateDeviceAdapterProfile, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create');
    return revenueOpsStore.createRetailDeviceAdapterProfile(createRetailDeviceAdapterProfileIpcSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailApproveDeviceAdapterProfile, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve');
    return revenueOpsStore.approveRetailDeviceAdapterProfile(approveRetailDeviceAdapterProfileIpcSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailRecordDeviceAdapterAcknowledgement, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve');
    return revenueOpsStore.recordRetailDeviceAdapterAcknowledgement(recordRetailDeviceAdapterAcknowledgementIpcSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailActivateDeviceAdapterProfile, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'admin');
    return revenueOpsStore.activateRetailDeviceAdapterProfile(activateRetailDeviceAdapterProfileIpcSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailSuspendDeviceAdapterProfile, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'admin');
    return revenueOpsStore.suspendRetailDeviceAdapterProfile(suspendRetailDeviceAdapterProfileIpcSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateLoyaltyAccount, (event, payload: unknown) => {
    const input = createRetailLoyaltyAccountSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    return revenueOpsStore.createRetailLoyaltyAccount(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailRedeemLoyaltyPoints, (event, payload: unknown) => {
    const input = redeemRetailLoyaltyPointsSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    return revenueOpsStore.redeemRetailLoyaltyPoints(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateCustomerVisit, (event, payload: unknown) => {
    const input = createRetailCustomerVisitSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    return revenueOpsStore.createRetailCustomerVisit(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailLinkCustomerVisitToSale, (event, payload: unknown) => {
    const input = linkRetailCustomerVisitToSaleSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'update');
    return revenueOpsStore.linkRetailCustomerVisitToSale(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateSalesCommission, (event, payload: unknown) => {
    const input = createRetailSalesCommissionSchema.parse(payload);
    assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create');
    return revenueOpsStore.createRetailSalesCommission(input);
  });
  ipcMain.handle(IPC_CHANNELS.retailDecideSalesCommission, (event, payload: unknown) => {
    const input = decideRetailSalesCommissionSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'approve');
    return revenueOpsStore.decideRetailSalesCommission(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailPaySalesCommission, (event, payload: unknown) => {
    const input = payRetailSalesCommissionSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'finance.payables', 'create');
    return revenueOpsStore.payRetailSalesCommission(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateCommissionPayoutBatch, (event, payload: unknown) => {
    const input = createRetailCommissionPayoutBatchSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'finance.payables', 'create');
    return revenueOpsStore.createRetailCommissionPayoutBatch(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailDecideCommissionPayoutBatch, (event, payload: unknown) => {
    const input = decideRetailCommissionPayoutBatchSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'finance.payables', 'approve');
    return revenueOpsStore.decideRetailCommissionPayoutBatch(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailReleaseCommissionPayoutBatch, (event, payload: unknown) => {
    const input = releaseRetailCommissionPayoutBatchSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'finance.payables', 'create');
    return revenueOpsStore.releaseRetailCommissionPayoutBatch(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailRequestCashierShiftClose, (event, payload: unknown) => {
    const input = requestRetailCashierShiftCloseSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(
      event,
      revenueOpsStore.getRetailPosRecordAuthorizationScope('cashier-shift', input.id),
      'sales.commercial',
      'update',
    );
    return revenueOpsStore.requestRetailCashierShiftClose(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailDecideCashierShiftClose, (event, payload: unknown) => {
    const input = decideRetailCashierShiftCloseSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(
      event,
      revenueOpsStore.getRetailPosRecordAuthorizationScope('cashier-shift', input.id),
      'sales.commercial',
      'approve',
    );
    return revenueOpsStore.decideRetailCashierShiftClose(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailRequestCashierShiftVarianceResolution, (event, payload: unknown) => {
    const input = requestRetailCashierShiftVarianceResolutionSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(
      event,
      revenueOpsStore.getRetailPosRecordAuthorizationScope('cashier-shift', input.id),
      'finance.payables',
      'create',
    );
    return revenueOpsStore.requestRetailCashierShiftVarianceResolution(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailDecideCashierShiftVarianceResolution, (event, payload: unknown) => {
    const input = decideRetailCashierShiftVarianceResolutionSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(
      event,
      revenueOpsStore.getRetailPosRecordAuthorizationScope('cashier-shift', input.id),
      'finance.payables',
      'approve',
    );
    return revenueOpsStore.decideRetailCashierShiftVarianceResolution(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateReturnRequest, (event, payload: unknown) => {
    const input = createRetailReturnRequestSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(
      event,
      revenueOpsStore.getRetailPosRecordAuthorizationScope('sale', input.retailSaleId),
      'sales.commercial',
      'create',
    );
    return revenueOpsStore.createRetailReturnRequest(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateExchange, (event, payload: unknown) => {
    const input = createRetailExchangeSchema.parse(payload);
    const scope = revenueOpsStore.getRetailPosRecordAuthorizationScope('return', input.retailReturnId);
    const actor = assertRevenueOperationsRecordAuthorized(event, scope, 'sales.commercial', 'create');
    assertRevenueOperationsRecordAuthorized(event, scope, 'inventory.execution', 'create');
    return revenueOpsStore.createRetailExchange(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailDecideExchange, (event, payload: unknown) => {
    const input = decideRetailExchangeSchema.parse(payload);
    const scope = revenueOpsStore.getRetailPosRecordAuthorizationScope('exchange', input.id);
    const actor = assertRevenueOperationsRecordAuthorized(event, scope, 'sales.commercial', 'approve');
    assertRevenueOperationsRecordAuthorized(event, scope, 'inventory.execution', 'approve');
    return revenueOpsStore.decideRetailExchange(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailPrepareCreditNoteReconciliation, (event, payload: unknown) => {
    const input = prepareRetailCreditNoteReconciliationSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(event, revenueOpsStore.getRetailPosRecordAuthorizationScope('return', input.retailReturnId), 'finance.receivable', 'create');
    return revenueOpsStore.prepareRetailCreditNoteReconciliation(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailRecordCreditNotePortalResponse, (event, payload: unknown) => {
    const input = recordRetailCreditNotePortalResponseSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(event, revenueOpsStore.getRetailPosRecordAuthorizationScope('credit-note-reconciliation', input.id), 'finance.receivable', 'approve');
    return revenueOpsStore.recordRetailCreditNotePortalResponse(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateInterBranchTransfer, (event, payload: unknown) => {
    const input = createRetailInterBranchTransferSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create');
    return revenueOpsStore.createRetailInterBranchTransfer(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailDecideInterBranchTransfer, (event, payload: unknown) => {
    const input = decideRetailInterBranchTransferSchema.parse(payload);
    const scope = revenueOpsStore.getRetailPosRecordAuthorizationScope('inter-branch-transfer', input.id);
    const actor = assertRevenueOperationsRecordAuthorized(event, scope, 'inventory.execution', 'approve');
    return revenueOpsStore.decideRetailInterBranchTransfer(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailDispatchInterBranchTransfer, (event, payload: unknown) => {
    const input = dispatchRetailInterBranchTransferSchema.parse(payload);
    const scope = revenueOpsStore.getRetailPosRecordAuthorizationScope('inter-branch-transfer', input.id);
    const actor = assertRevenueOperationsRecordAuthorized(event, scope, 'inventory.execution', 'update');
    return revenueOpsStore.dispatchRetailInterBranchTransfer(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailReceiveInterBranchTransfer, (event, payload: unknown) => {
    const input = receiveRetailInterBranchTransferSchema.parse(payload);
    const scope = revenueOpsStore.getRetailPosRecordAuthorizationScope('inter-branch-transfer', input.id);
    const actor = assertRevenueOperationsRecordAuthorized(event, scope, 'inventory.execution', 'update');
    return revenueOpsStore.receiveRetailInterBranchTransfer(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailInspectReturn, (event, payload: unknown) => {
    const input = inspectRetailReturnSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(
      event,
      revenueOpsStore.getRetailPosRecordAuthorizationScope('return', input.id),
      'inventory.execution',
      'update',
    );
    return revenueOpsStore.inspectRetailReturn(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailDecideReturn, (event, payload: unknown) => {
    const input = decideRetailReturnSchema.parse(payload);
    const scope = revenueOpsStore.getRetailPosRecordAuthorizationScope('return', input.id);
    const actor = assertRevenueOperationsRecordAuthorized(event, scope, 'inventory.execution', 'approve');
    assertRevenueOperationsRecordAuthorized(event, scope, 'sales.commercial', 'approve');
    return revenueOpsStore.decideRetailReturn(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailRequestReturnSettlement, (event, payload: unknown) => {
    const input = requestRetailReturnSettlementSchema.parse(payload);
    const scope = revenueOpsStore.getRetailPosRecordAuthorizationScope('return', input.retailReturnId);
    const actor = assertRevenueOperationsRecordAuthorized(event, scope, 'sales.commercial', 'update');
    assertRevenueOperationsRecordAuthorized(event, scope, 'finance.receivable', 'create');
    return revenueOpsStore.requestRetailReturnSettlement(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailDecideReturnSettlement, (event, payload: unknown) => {
    const input = decideRetailReturnSettlementSchema.parse(payload);
    const scope = revenueOpsStore.getRetailPosRecordAuthorizationScope('return', input.retailReturnId);
    const actor = assertRevenueOperationsRecordAuthorized(event, scope, 'finance.receivable', 'approve');
    assertRevenueOperationsRecordAuthorized(event, scope, 'sales.commercial', 'approve');
    return revenueOpsStore.decideRetailReturnSettlement(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailConfirmReturnProviderRefund, (event, payload: unknown) => {
    const input = confirmRetailReturnProviderRefundSchema.parse(payload);
    const scope = revenueOpsStore.getRetailPosRecordAuthorizationScope('return', input.retailReturnId);
    const actor = assertRevenueOperationsRecordAuthorized(event, scope, 'finance.bank-reconciliation', 'approve');
    return revenueOpsStore.confirmRetailReturnProviderRefund(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateCatalogCategory, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'inventory.master', 'create');
    return revenueOpsStore.createRetailCatalogCategory(createRetailCatalogCategorySchema.parse(payload));
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateCatalogBrand, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'inventory.master', 'create');
    return revenueOpsStore.createRetailCatalogBrand(createRetailCatalogBrandSchema.parse(payload));
  });
  ipcMain.handle(IPC_CHANNELS.retailSaveMerchandisingProfile, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'inventory.master', 'update');
    const input = saveRetailMerchandisingProfileSchema.parse(payload);
    const attachmentScope = getAttachmentOperatingScope();
    const rawDescriptor = input.imageAttachmentId ? attachmentVault.get(input.imageAttachmentId, attachmentScope) : undefined;
    const descriptor: RetailMerchandisingImageDescriptor | undefined = rawDescriptor
      ? { id: rawDescriptor.id, mimeType: rawDescriptor.mimeType, resource: rawDescriptor.resource, resourceId: rawDescriptor.resourceId }
      : undefined;
    return revenueOpsStore.saveRetailMerchandisingProfile(input, descriptor);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateBarcodeSequence, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'inventory.master', 'create');
    return revenueOpsStore.createRetailBarcodeSequence(createRetailBarcodeSequenceSchema.parse(payload));
  });
  ipcMain.handle(IPC_CHANNELS.retailResetBarcodeSequence, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'update');
    return revenueOpsStore.resetRetailBarcodeSequence(resetRetailBarcodeSequenceSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailAssignBarcode, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'inventory.master', 'update');
    return revenueOpsStore.assignRetailBarcode(assignRetailBarcodeSchema.parse(payload));
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateLabelPrintRun, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create');
    return revenueOpsStore.createRetailLabelPrintRun(createRetailLabelPrintRunSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateProductCombo, (event, payload: unknown) => {
    assertRevenueOperationsAuthorized(event, 'inventory.master', 'create');
    return revenueOpsStore.createRetailProductCombo(createRetailProductComboSchema.parse(payload));
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateScaleProfile, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.createRetailScaleProfile(createRetailScaleProfileSchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.retailCreatePrinterAdapter, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.createRetailPrinterAdapter(createRetailPrinterAdapterSchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.retailTestPrinterAdapter, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'update'); return revenueOpsStore.testRetailPrinterAdapter(testRetailPrinterAdapterSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailCreateLabelPrintDispatch, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.createRetailLabelPrintDispatch(createRetailLabelPrintDispatchSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailDecideLabelPrintDispatch, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); return revenueOpsStore.decideRetailLabelPrintDispatch(decideRetailLabelPrintDispatchSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailPrepareCatalogBulkEdit, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.prepareRetailCatalogBulkEdit(prepareRetailCatalogBulkEditSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailApplyCatalogBulkEdit, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); return revenueOpsStore.applyRetailCatalogBulkEdit(applyRetailCatalogBulkEditSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailCreatePurchaseOcrDocument, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.createRetailPurchaseOcrDocument(createRetailPurchaseOcrSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailDecidePurchaseOcr, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); return revenueOpsStore.decideRetailPurchaseOcr(decideRetailPurchaseOcrSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailConvertPurchaseOcr, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'update'); return revenueOpsStore.convertRetailPurchaseOcr(convertRetailPurchaseOcrSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailCreateCommerceConnector, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.createRetailCommerceConnector(createRetailCommerceConnectorSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailConfigureCommerceCredentials, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'update'); return revenueOpsStore.configureRetailCommerceCredentials(configureRetailCommerceCredentialsSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailCreateCommerceSyncRun, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.createRetailCommerceSyncRun(createRetailCommerceSyncSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailExecuteCommerceSync, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); assertRendererRetailProviderOperationAllowed({ isPackaged: app.isPackaged, nodeEnv: process.env.NODE_ENV }, 'execute-commerce-sync'); return revenueOpsStore.executeRetailCommerceSync(executeRetailCommerceSyncSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailRecordCommerceSync, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); assertRendererRetailProviderOperationAllowed({ isPackaged: app.isPackaged, nodeEnv: process.env.NODE_ENV }, 'record-commerce-sync-receipt'); return revenueOpsStore.recordRetailCommerceSync(recordRetailCommerceSyncSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailImportCommerceOrder, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); assertRendererRetailProviderOperationAllowed({ isPackaged: app.isPackaged, nodeEnv: process.env.NODE_ENV }, 'import-commerce-order'); return revenueOpsStore.importRetailCommerceOrder(importRetailCommerceOrderSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailHandoffCommerceOrder, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'update'); return revenueOpsStore.handoffRetailCommerceOrder(handoffRetailCommerceOrderSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailReserveCommerceOrder, (event, payload: unknown) => { const input = reserveRetailCommerceOrderSchema.parse(payload); const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create'); assertPhysicalFulfilmentRecordAuthorized(event, 'stock-location', input.locationId, 'inventory.execution', 'create'); return revenueOpsStore.reserveRetailCommerceOrder(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailCreateSettlementReconciliation, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); assertRendererRetailProviderOperationAllowed({ isPackaged: app.isPackaged, nodeEnv: process.env.NODE_ENV }, 'record-commerce-settlement'); return revenueOpsStore.createRetailSettlementReconciliation(createRetailSettlementReconciliationSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailDecideSettlementReconciliation, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); return revenueOpsStore.decideRetailSettlementReconciliation(decideRetailSettlementReconciliationSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailCreateSettlementAllocationPack, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'finance.receivable', 'create'); return revenueOpsStore.createRetailSettlementAllocationPack(createRetailSettlementAllocationPackSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailDecideSettlementAllocationPack, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'finance.receivable', 'approve'); return revenueOpsStore.decideRetailSettlementAllocationPack(decideRetailSettlementAllocationPackSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailCreateCommerceConflictResolution, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create'); return revenueOpsStore.createRetailCommerceConflictResolution(createRetailCommerceConflictResolutionSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailDecideCommerceConflictResolution, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'approve'); return revenueOpsStore.decideRetailCommerceConflictResolution(decideRetailCommerceConflictResolutionSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailCreateSettlementWithholdingEvidence, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'finance.receivable', 'create'); return revenueOpsStore.createRetailSettlementWithholdingEvidence(createRetailSettlementWithholdingEvidenceSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailDecideSettlementWithholdingEvidence, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'finance.receivable', 'approve'); return revenueOpsStore.decideRetailSettlementWithholdingEvidence(decideRetailSettlementWithholdingEvidenceSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailPrepareSettlementJournal, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'finance.receivable', 'create'); return revenueOpsStore.prepareRetailSettlementJournal(prepareRetailSettlementJournalSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailLinkCommerceReturn, (event, payload: unknown) => {
    const input = linkRetailCommerceReturnSchema.parse(payload);
    const actor = assertRevenueOperationsAuthorized(event, 'finance.receivable', 'create');
    return revenueOpsStore.linkRetailCommerceReturn(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.retailCreateOcrProviderProfile, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.createRetailOcrProviderProfile(createRetailOcrProviderProfileSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailConfigureOcrProvider, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'update'); return revenueOpsStore.configureRetailOcrProvider(configureRetailOcrProviderSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailTestOcrProvider, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); return revenueOpsStore.testRetailOcrProvider(testRetailOcrProviderSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailExecuteOcr, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.executeRetailOcr(executeRetailOcrSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailPreparePurchaseOcrMapping, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.prepareRetailPurchaseOcrMapping(prepareRetailPurchaseOcrMappingSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailApplyPurchaseOcrMapping, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); return revenueOpsStore.applyRetailPurchaseOcrMapping(applyRetailPurchaseOcrMappingSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailPrepareCommercePushBatch, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.prepareRetailCommercePushBatch(prepareRetailCommercePushSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailCreateCommerceCatalogMapping, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.createRetailCommerceCatalogMapping(createRetailCommerceCatalogMappingSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailDecideCommerceCatalogMapping, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); return revenueOpsStore.decideRetailCommerceCatalogMapping(decideRetailCommerceCatalogMappingSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailDisableCommerceCatalogMapping, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); return revenueOpsStore.disableRetailCommerceCatalogMapping(disableRetailCommerceCatalogMappingSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailDecideCommercePushBatch, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); assertRendererRetailProviderOperationAllowed({ isPackaged: app.isPackaged, nodeEnv: process.env.NODE_ENV }, 'record-commerce-push-outcome'); return revenueOpsStore.decideRetailCommercePushBatch(decideRetailCommercePushSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailExecuteCommercePushBatch, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); assertRendererRetailProviderOperationAllowed({ isPackaged: app.isPackaged, nodeEnv: process.env.NODE_ENV }, 'execute-commerce-push'); return revenueOpsStore.executeRetailCommercePushBatch(executeRetailCommercePushSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailTransitionCommerceOrder, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'update'); assertRendererRetailProviderOperationAllowed({ isPackaged: app.isPackaged, nodeEnv: process.env.NODE_ENV }, 'record-commerce-order-status'); return revenueOpsStore.transitionRetailCommerceOrder(transitionRetailCommerceOrderSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailCreateCommerceConformanceCase, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.createRetailCommerceConformanceCase(createRetailCommerceConformanceCaseSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailPlanCommerceConformancePack, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.planRetailCommerceConformancePack(planRetailCommerceConformancePackSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailRecordCommerceConformance, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); return revenueOpsStore.recordRetailCommerceConformance(recordRetailCommerceConformanceSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailScanPurchaseExceptions, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.scanRetailPurchaseExceptions(scanRetailPurchaseExceptionsSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.retailResolvePurchaseException, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.master', 'approve'); return revenueOpsStore.resolveRetailPurchaseException(resolveRetailPurchaseExceptionSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsRecordDeliveryEvidence, (event, payload: unknown) => { const input = recordDeliveryEvidenceSchema.parse(payload); const actor = assertCommercialRecordAuthorized(event, 'sales-order', input.salesOrderId, 'sales.commercial', 'create'); return revenueOpsStore.addDeliveryEvidence(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateServiceMilestone, (event, payload: unknown) => { const input = createServiceMilestoneSchema.parse(payload); assertCommercialRecordAuthorized(event, 'sales-order', input.salesOrderId, 'sales.commercial', 'create'); return revenueOpsStore.addServiceMilestone(input); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsTransitionServiceMilestone, (event, payload: unknown) => { const input = transitionServiceMilestoneSchema.parse(payload); assertCommercialRecordAuthorized(event, 'service-milestone', input.id, 'sales.commercial', 'update'); return revenueOpsStore.moveServiceMilestone(input); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateInvoiceDraft, (event, payload: unknown) => { const input = createInvoiceDraftSchema.parse(payload); const actor = assertCommercialRecordAuthorized(event, 'sales-order', input.salesOrderId, 'finance.receivable', 'create'); return revenueOpsStore.addInvoiceDraft(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsIssueInvoice, (event, payload: unknown) => { const input = issueInvoiceSchema.parse(payload); const actor = assertCommercialRecordAuthorized(event, 'invoice', input.id, 'finance.receivable', 'post'); return revenueOpsStore.issueInvoice(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateCreditDebitNote, (event, payload: unknown) => { const input = createCreditDebitNoteSchema.parse(payload); const actor = assertCommercialRecordAuthorized(event, 'invoice', input.invoiceId, 'finance.receivable', 'create'); return revenueOpsStore.addCreditDebitNote(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsRecordPayment, (event, payload: unknown) => {
    const input = recordPaymentSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(
      event,
      revenueOpsStore.getPaymentCaptureAuthorizationScope(input.allocations.map(({ receivableId }) => receivableId)),
      'finance.receivable',
      'create',
    );
    return revenueOpsStore.addPayment(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.revenueOpsApplyUnappliedReceipt, (event, payload: unknown) => {
    const input = applyUnappliedReceiptSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(
      event,
      revenueOpsStore.getUnappliedReceiptApplicationAuthorizationScope(
        input.id,
        input.allocations.map(({ receivableId }) => receivableId),
      ),
      'finance.receivable',
      'create',
    );
    return revenueOpsStore.applyUnappliedReceipt(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.revenueOpsReconcilePayment, (event, payload: unknown) => { const input = reconcilePaymentSchema.parse(payload); const actor = assertCommercialRecordAuthorized(event, 'payment-receipt', input.id, 'finance.receivable', 'approve'); return revenueOpsStore.reconcilePayment(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsExportJournal, (event, payload: unknown) => {
    const input = exportJournalSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(
      event,
      revenueOpsStore.getJournalDraftAuthorizationScope(input.id),
      'finance.receivable',
      'export',
    );
    const revenue = revenueOpsStore.getSnapshot();
    const handoff = revenue.journalDrafts.find(({ id }) => id === input.id);
    if (!handoff) {
      throw new Error('The accounting journal handoff was not found. Refresh and retry.');
    }
    const canonicalSource = (() => {
      switch (handoff.sourceType) {
        case 'invoice':
          return { sourceType: 'revenue-invoice', sourceId: handoff.sourceId };
        case 'payment':
          return { sourceType: 'revenue-cash-receipt', sourceId: handoff.sourceId };
        case 'credit-note':
        case 'debit-note':
          return { sourceType: 'revenue-commercial-adjustment', sourceId: handoff.sourceId };
        case 'supplier-invoice': {
          const match = revenue.threeWayMatches.find(({ id }) => id === handoff.sourceId);
          return match
            ? { sourceType: 'procurement-supplier-invoice', sourceId: match.supplierInvoiceId }
            : undefined;
        }
        case 'asset-capitalization':
          return { sourceType: 'asset-capitalization', sourceId: handoff.sourceId };
        case 'asset-depreciation':
          return { sourceType: 'asset-depreciation', sourceId: handoff.sourceId };
        case 'revenue-recognition':
          return { sourceType: 'project-revenue-recognition', sourceId: handoff.sourceId };
        default:
          return undefined;
      }
    })();
    if (
      canonicalSource &&
      generalLedgerStore.hasCanonicalSourcePosting(
        canonicalSource.sourceType,
        canonicalSource.sourceId,
      )
    ) {
      throw new Error('This operational source is already claimed by a canonical General Ledger journal. External export is blocked to prevent duplicate booking.');
    }
    return revenueOpsStore.exportJournal(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.revenueOpsExportInvoicePdf, async (event, payload: unknown) => {
    const { invoiceId } = exportInvoicePdfSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(
      event,
      revenueOpsStore.getDocumentAuthorizationScope('invoice', invoiceId),
      'finance.receivable',
      'export',
    );
    const receipt = await invoicePdfService.export(BrowserWindow.fromWebContents(event.sender), revenueOpsStore.getInvoiceBundle(invoiceId), actor.userId);
    if (receipt) await revenueOpsStore.recordInvoicePdf(receipt);
    return receipt;
  });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateGstRegistration, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'sales.catalog', 'create'); return revenueOpsStore.addGstRegistration(createGstRegistrationSchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreatePlaceOfSupplyReview, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'create'); return revenueOpsStore.addPlaceOfSupplyReview(createPlaceOfSupplyReviewSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsDecidePlaceOfSupplyReview, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'sales.commercial', 'approve'); return revenueOpsStore.decidePlaceOfSupplyReview(decidePlaceOfSupplyReviewSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateStockLocation, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create'); return revenueOpsStore.addStockLocation(createStockLocationSchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsRecordStockMovement, (event, payload: unknown) => { const input = recordStockMovementSchema.parse(payload); const actor = assertPhysicalFulfilmentRecordAuthorized(event, 'stock-location', input.locationId, 'inventory.execution', 'create'); return revenueOpsStore.addStockMovement(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsReserveStock, (event, payload: unknown) => { const input = reserveStockSchema.parse(payload); const actor = assertCommercialRecordAuthorized(event, 'sales-order', input.salesOrderId, 'sales.commercial', 'update'); assertPhysicalFulfilmentRecordAuthorized(event, 'stock-location', input.locationId, 'inventory.execution', 'create'); return revenueOpsStore.reserveStock(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsReleaseStockReservation, (event, payload: unknown) => { const input = releaseStockReservationSchema.parse(payload); const actor = assertPhysicalFulfilmentRecordAuthorized(event, 'stock-reservation', input.id, 'inventory.execution', 'update'); return revenueOpsStore.releaseStockReservation(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreatePincodeServiceabilityRule, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create'); return revenueOpsStore.addPincodeServiceabilityRule(createPincodeServiceabilityRuleSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsDecidePincodeServiceabilityRule, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'inventory.execution', 'approve'); return revenueOpsStore.decidePincodeServiceabilityRule(decidePincodeServiceabilityRuleSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateDeliveryPromise, (event, payload: unknown) => {
    const input = createDeliveryPromiseSchema.parse(payload);
    const actor = assertCommercialRecordAuthorized(event, 'sales-order', input.salesOrderId, 'sales.commercial', 'update');
    assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create');
    return revenueOpsStore.createDeliveryPromise(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateCodCollectionCase, (event, payload: unknown) => {
    const input = createCodCollectionCaseSchema.parse(payload);
    const actor = assertCommercialRecordAuthorized(event, 'sales-order', input.salesOrderId, 'sales.commercial', 'update');
    assertPhysicalFulfilmentRecordAuthorized(event, 'delivery-promise', input.deliveryPromiseId, 'inventory.execution', 'update');
    assertPhysicalFulfilmentRecordAuthorized(event, 'shipment-package', input.shipmentPackageId, 'inventory.execution', 'update');
    assertPhysicalFulfilmentRecordAuthorized(event, 'carrier-adapter', input.carrierAdapterId, 'inventory.execution', 'update');
    assertCommercialRecordAuthorized(event, 'receivable', input.receivableId, 'finance.receivable', 'create');
    return revenueOpsStore.createCodCollectionCase(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.revenueOpsRecordCodHandover, (event, payload: unknown) => {
    const input = recordCodHandoverSchema.parse(payload);
    const actor = assertCodCollectionCaseAuthorized(event, input.id, 'inventory.execution', 'update');
    return revenueOpsStore.recordCodHandover(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.revenueOpsRecordCodCarrierCollection, (event, payload: unknown) => {
    const input = recordCodCarrierCollectionSchema.parse(payload);
    const actor = assertCodCollectionCaseAuthorized(event, input.id, 'inventory.execution', 'update');
    return revenueOpsStore.recordCodCarrierCollection(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.financeRecordCodRemittance, (event, payload: unknown) => {
    const input = recordCodRemittanceSchema.parse(payload);
    const actor = assertCodCollectionCaseAuthorized(event, input.id, 'finance.receivable', 'create');
    return revenueOpsStore.recordCodRemittance(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.financeMatchCodBank, (event, payload: unknown) => {
    const input = matchCodBankSchema.parse(payload);
    const actor = assertCodCollectionCaseAuthorized(event, input.id, 'finance.bank-reconciliation', 'approve');
    return revenueOpsStore.matchCodBank(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.financeCloseCodShortfall, (event, payload: unknown) => {
    const input = closeCodShortfallSchema.parse(payload);
    const actor = assertCodCollectionCaseAuthorized(event, input.id, 'finance.bank-reconciliation', 'approve');
    return revenueOpsStore.closeCodShortfall(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.revenueOpsRecordCodException, (event, payload: unknown) => {
    const input = recordCodExceptionSchema.parse(payload);
    const actor = assertCodCollectionCaseAuthorized(event, input.id, 'inventory.execution', 'update');
    return revenueOpsStore.recordCodException(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateShipmentPackage, (event, payload: unknown) => { const input = createShipmentPackageSchema.parse(payload); const actor = assertCommercialRecordAuthorized(event, 'sales-order', input.salesOrderId, 'sales.commercial', 'update'); assertPhysicalFulfilmentRecordAuthorized(event, 'stock-location', input.fromLocationId, 'inventory.execution', 'create'); return revenueOpsStore.addShipmentPackage(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsTransitionShipment, (event, payload: unknown) => { const input = transitionShipmentSchema.parse(payload); const actor = assertPhysicalFulfilmentRecordAuthorized(event, 'shipment-package', input.id, 'inventory.execution', 'update'); return revenueOpsStore.moveShipment(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsConfigureCarrierAdapter, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'inventory.execution', 'admin'); return revenueOpsStore.addCarrierAdapter(configureCarrierAdapterSchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsCreateReturnAuthorization, (event, payload: unknown) => { const input = createReturnAuthorizationSchema.parse(payload); const actor = assertPhysicalFulfilmentRecordAuthorized(event, 'shipment-package', input.shipmentPackageId, 'inventory.execution', 'create'); return revenueOpsStore.addReturnAuthorization(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsDecideReturnAuthorization, (event, payload: unknown) => { const input = decideReturnAuthorizationSchema.parse(payload); const actor = assertPhysicalFulfilmentRecordAuthorized(event, 'return-authorization', input.id, 'inventory.execution', 'approve'); return revenueOpsStore.decideReturnAuthorization(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsReceiveReturn, (event, payload: unknown) => { const input = receiveReturnSchema.parse(payload); const actor = assertPhysicalFulfilmentRecordAuthorized(event, 'return-authorization', input.id, 'inventory.execution', 'update'); return revenueOpsStore.receiveReturn(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsInspectReturn, (event, payload: unknown) => { const input = inspectReturnSchema.parse(payload); const actor = assertPhysicalFulfilmentRecordAuthorized(event, 'return-authorization', input.id, 'inventory.execution', 'update'); return revenueOpsStore.inspectReturn(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsPrepareStatutoryExchange, (event, payload: unknown) => { const actor = assertAuthorized(event, 'statutory.exchange', 'create'); return revenueOpsStore.prepareStatutoryExchange(prepareStatutoryExchangeSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsSubmitStatutoryExchange, (event, payload: unknown) => { const input = submitStatutoryExchangeSchema.parse(payload); const actor = assertStatutoryProviderRecordAuthorized(event, input.id, 'statutory.exchange', 'submit'); return revenueOpsStore.submitStatutoryExchange(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.revenueOpsRecordStatutoryResponse, (event, payload: unknown) => { const input = recordStatutoryResponseSchema.parse(payload); const actor = assertStatutoryProviderRecordAuthorized(event, input.id, 'statutory.exchange', 'post'); return revenueOpsStore.recordStatutoryResponse(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.statutoryConfigureAdapter, (event, payload: unknown) => { const actor = assertAuthorized(event, 'statutory.adapter', 'admin'); return revenueOpsStore.addStatutoryAdapter(configureStatutoryAdapterSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.statutoryConfigureCredentials, (event, payload: unknown) => { const actor = assertAuthorized(event, 'statutory.credential', 'admin'); return revenueOpsStore.configureStatutoryCredentials(configureStatutoryCredentialsSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.statutoryPrepareOperation, (event, payload: unknown) => { const actor = assertAuthorized(event, 'statutory.operation', 'create'); return revenueOpsStore.addStatutoryOperation(prepareStatutoryOperationSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.statutorySubmitOperation, (event, payload: unknown) => { const input = submitStatutoryOperationSchema.parse(payload); const actor = assertStatutoryProviderRecordAuthorized(event, input.id, 'statutory.operation', 'submit'); return revenueOpsStore.submitStatutoryOperation(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.statutoryRecordOperationResponse, (event, payload: unknown) => { const input = recordStatutoryOperationResponseSchema.parse(payload); const actor = assertStatutoryProviderRecordAuthorized(event, input.id, 'statutory.operation', 'post'); return revenueOpsStore.recordStatutoryOperationResponse(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.statutoryPrepareConsolidatedEwb, (event, payload: unknown) => { const actor = assertAuthorized(event, 'statutory.consolidated-eway-bill', 'create'); return revenueOpsStore.addConsolidatedEwayBill(prepareConsolidatedEwayBillSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.statutorySubmitConsolidatedEwb, (event, payload: unknown) => { const input = submitConsolidatedEwayBillSchema.parse(payload); const actor = assertStatutoryProviderRecordAuthorized(event, input.id, 'statutory.consolidated-eway-bill', 'submit'); return revenueOpsStore.submitConsolidatedEwayBill(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.statutoryRecordConsolidatedEwbResponse, (event, payload: unknown) => { const input = recordConsolidatedEwayBillResponseSchema.parse(payload); const actor = assertStatutoryProviderRecordAuthorized(event, input.id, 'statutory.consolidated-eway-bill', 'post'); return revenueOpsStore.recordConsolidatedEwayBillResponse(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.statutoryVerifySignature, (event, payload: unknown) => { const actor = assertAuthorized(event, 'statutory.signature', 'post'); return revenueOpsStore.verifyStatutorySignature(verifyStatutorySignatureSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.statutoryRunPortalReconciliation, (event, payload: unknown) => { const actor = assertAuthorized(event, 'statutory.portal-reconciliation', 'post'); return revenueOpsStore.runPortalReconciliation(runPortalReconciliationSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.providerConfigureConnector, (event, payload: unknown) => { const actor = assertAuthorized(event, 'provider.connector', 'admin'); return revenueOpsStore.addProviderConnector(configureProviderConnectorSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.providerConfigureCredentials, (event, payload: unknown) => { const actor = assertAuthorized(event, 'provider.credential', 'admin'); return revenueOpsStore.configureProviderCredentials(configureProviderCredentialsSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.providerCreateConformanceCase, (event, payload: unknown) => { const actor = assertAuthorized(event, 'provider.conformance-case', 'create'); return revenueOpsStore.createProviderConformanceCase(createProviderConformanceCaseSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.providerPlanConformancePack, (event, payload: unknown) => { const actor = assertAuthorized(event, 'provider.conformance-case', 'create'); return revenueOpsStore.planProviderConformancePack(planProviderConformancePackSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.providerExecutePreflight, (event, payload: unknown) => { const actor = assertAuthorized(event, 'provider.conformance-case', 'create'); return revenueOpsStore.executeProviderPreflight(executeProviderPreflightSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.providerRecordConformanceResult, (event, payload: unknown) => { const input = recordProviderConformanceResultSchema.parse(payload); const actor = assertStatutoryProviderRecordAuthorized(event, input.id, 'provider.conformance-case', 'update'); return revenueOpsStore.recordProviderConformanceResult(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.providerApproveConnector, (event, payload: unknown) => { const input = approveProviderConnectorSchema.parse(payload); const actor = assertStatutoryProviderRecordAuthorized(event, input.id, 'provider.connector', 'approve'); return revenueOpsStore.approveProviderConnector(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.providerPrepareSubmission, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'provider.submission', 'create');
    const input = prepareProviderSubmissionSchema.parse(payload);
    const scope = revenueOpsStore.getSnapshot().scope;
    return revenueOpsStore.prepareProviderSubmission(input, actor.userId, {
      plans: intelligenceStore.listReportDeliveryPlans(scope),
      attempts: intelligenceStore.listReportDeliveryAttempts(scope),
    });
  });
  ipcMain.handle(IPC_CHANNELS.providerHandOffSubmission, (event, payload: unknown) => { const input = handOffProviderSubmissionSchema.parse(payload); const actor = assertStatutoryProviderRecordAuthorized(event, input.id, 'provider.submission', 'post'); return revenueOpsStore.handOffProviderSubmission(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.providerRecordSubmissionResponse, (event, payload: unknown) => { const input = recordProviderSubmissionResponseSchema.parse(payload); const actor = assertStatutoryProviderRecordAuthorized(event, input.id, 'provider.submission', 'post'); return revenueOpsStore.recordProviderSubmissionResponse(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.providerRunReconciliation, (event, payload: unknown) => { const actor = assertAuthorized(event, 'provider.reconciliation', 'post'); return revenueOpsStore.runProviderReconciliation(runProviderReconciliationSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.collectionsProposeCreditLimit, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.credit-limit', 'submit'); return revenueOpsStore.proposeCreditLimit(proposeCreditLimitSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.collectionsDecideCreditLimit, (event, payload: unknown) => { const input = decideCreditLimitSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'finance.credit-limit', 'approve'); return revenueOpsStore.decideCreditLimit(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.collectionsRunDunning, (event, payload: unknown) => { assertAuthorized(event, 'finance.dunning', 'read'); return revenueOpsStore.runDunning(runDunningSchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.collectionsRecordActivity, (event, payload: unknown) => { const input = recordCollectionActivitySchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.dunningCaseId, 'finance.collection-activity', 'create'); return revenueOpsStore.recordCollectionActivity(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.collectionsOpenDispute, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.receivable-dispute', 'create'); return revenueOpsStore.openReceivableDispute(openReceivableDisputeSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.collectionsResolveDispute, (event, payload: unknown) => { const input = resolveReceivableDisputeSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'finance.receivable-dispute', 'approve'); return revenueOpsStore.resolveReceivableDispute(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.collectionsRequestWriteOff, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.write-off', 'submit'); return revenueOpsStore.requestWriteOff(requestWriteOffSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.collectionsDecideWriteOff, (event, payload: unknown) => { const input = decideWriteOffSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'finance.write-off', 'approve'); return revenueOpsStore.decideWriteOff(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financeCreateWithholdingPolicy, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.withholding-policy', 'admin'); return revenueOpsStore.createWithholdingPolicy(createWithholdingPolicySchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financeRecordWithholdingEntry, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.withholding-entry', 'create'); return revenueOpsStore.recordWithholdingEntry(recordWithholdingEntrySchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financeTransitionWithholdingEntry, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.withholding-entry', 'post'); return revenueOpsStore.transitionWithholdingEntry(transitionWithholdingEntrySchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financePrepareZeroRatedSupply, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.zero-rated-supply-review', 'create'); return revenueOpsStore.prepareZeroRatedSupply(prepareZeroRatedSupplySchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financeDecideZeroRatedSupply, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.zero-rated-supply-review', 'approve'); return revenueOpsStore.decideZeroRatedSupply(decideZeroRatedSupplySchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financeCreateBankAccount, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.bank-account', 'admin'); return revenueOpsStore.createBankAccount(createBankAccountSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financePreviewBankStatement, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.bank-statement-import', 'create'); return revenueOpsStore.previewBankStatement(previewBankStatementSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financeCommitBankStatement, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.bank-statement-import', 'post'); return revenueOpsStore.commitBankStatement(commitBankStatementSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financeConfirmBankMatch, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.bank-reconciliation', 'approve'); return revenueOpsStore.confirmBankMatch(confirmBankMatchSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financeExcludeBankLine, (event, payload: unknown) => { const actor = assertAuthorized(event, 'finance.bank-reconciliation', 'approve'); return revenueOpsStore.excludeBankLine(excludeBankLineSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementCreateRequisition, (event, payload: unknown) => { const input = createPurchaseRequisitionSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'warehouse', input.warehouseId, 'procurement.requisition', 'create'); return revenueOpsStore.createPurchaseRequisition(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementDecideRequisition, (event, payload: unknown) => { const input = decidePurchaseRequisitionSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'purchase-requisition', input.id, 'procurement.requisition', 'approve'); return revenueOpsStore.decidePurchaseRequisition(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementCreateRfqFromRequisition, (event, payload: unknown) => { const input = createRfqFromRequisitionSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'purchase-requisition', input.requisitionId, 'procurement.sourcing', 'create'); return revenueOpsStore.createRfqFromRequisition(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementCreateSupplier, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'procurement.supplier', 'create'); return revenueOpsStore.createSupplier(createSupplierSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementDecideSupplier, (event, payload: unknown) => { const input = decideSupplierSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'supplier', input.id, 'procurement.supplier', 'approve'); return revenueOpsStore.decideSupplier(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementCreateRfq, (event, payload: unknown) => { const input = createRfqSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'warehouse', input.warehouseId, 'procurement.sourcing', 'create'); return revenueOpsStore.createRfq(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementIssueRfq, (event, payload: unknown) => { const input = issueRfqSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'rfq', input.id, 'procurement.sourcing', 'submit'); return revenueOpsStore.issueRfq(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementRecordQuotation, (event, payload: unknown) => { const input = recordSupplierQuotationSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'rfq', input.rfqId, 'procurement.sourcing', 'create'); return revenueOpsStore.recordSupplierQuotation(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementAwardRfq, (event, payload: unknown) => { const input = awardRfqSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'rfq', input.rfqId, 'procurement.sourcing', 'approve'); return revenueOpsStore.awardRfq(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementCreatePoFromRfq, (event, payload: unknown) => { const input = createPoFromRfqSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'rfq', input.rfqId, 'procurement.purchase-order', 'create'); return revenueOpsStore.createPurchaseOrderFromRfq(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementCreatePoFromReorder, (event, payload: unknown) => { const input = createPoFromReorderSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'reorder-proposal', input.reorderProposalId, 'procurement.purchase-order', 'create'); return revenueOpsStore.createPurchaseOrderFromReorder(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementDecidePo, (event, payload: unknown) => { const input = decidePurchaseOrderSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'purchase-order', input.id, 'procurement.purchase-order', 'approve'); return revenueOpsStore.decidePurchaseOrder(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementRecordGoodsReceipt, (event, payload: unknown) => { const input = recordGoodsReceiptSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'purchase-order', input.purchaseOrderId, 'procurement.receiving', 'create'); return revenueOpsStore.recordGoodsReceipt(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementCreateLandedCost, (event, payload: unknown) => { const input = createLandedCostSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'goods-receipt', input.goodsReceiptId, 'procurement.receiving', 'create'); return revenueOpsStore.createLandedCost(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementDecideLandedCost, (event, payload: unknown) => { const input = decideLandedCostSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'landed-cost', input.id, 'procurement.receiving', 'approve'); return revenueOpsStore.decideLandedCost(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementUpdateRetailPriceForTargetMargin, (event, payload: unknown) => { const input = updateRetailPriceForTargetMarginSchema.parse(payload); const actor = assertAuthorized(event, 'inventory.price-list', 'update'); return revenueOpsStore.updateRetailPriceForTargetMargin(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementRecordSupplierInvoice, (event, payload: unknown) => { const input = recordSupplierInvoiceSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'purchase-order', input.purchaseOrderId, 'procurement.payable', 'create'); return revenueOpsStore.recordSupplierInvoice(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.procurementDecideThreeWayMatch, (event, payload: unknown) => { const input = decideThreeWayMatchSchema.parse(payload); const actor = assertProcurementRecordAuthorized(event, 'three-way-match', input.id, 'procurement.payable', 'approve'); return revenueOpsStore.decideThreeWayMatch(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasuryRecordPosition, (event, payload: unknown) => { const actor = assertAuthorized(event, 'treasury.cash-position', 'create'); return revenueOpsStore.recordTreasuryPosition(recordTreasuryPositionSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasuryRunCashForecast, (event, payload: unknown) => { const actor = assertAuthorized(event, 'treasury.cash-forecast', 'create'); return revenueOpsStore.runCashForecast(runCashForecastSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasuryCreatePaymentProposal, (event, payload: unknown) => { const actor = assertAuthorized(event, 'treasury.payment', 'submit'); return revenueOpsStore.createPaymentProposal(createPaymentProposalSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasuryDecidePaymentProposal, (event, payload: unknown) => { const input = decidePaymentProposalSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'treasury.payment', 'approve'); return revenueOpsStore.decidePaymentProposal(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasuryReleasePaymentProposal, (event, payload: unknown) => { const input = releasePaymentProposalSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'treasury.payment', 'post'); return revenueOpsStore.releasePaymentProposal(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasurySettlePaymentProposal, (event, payload: unknown) => { const input = settlePaymentProposalSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'treasury.payment', 'post'); return revenueOpsStore.settlePaymentProposal(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasuryRecordBankCharge, (event, payload: unknown) => { const actor = assertAuthorized(event, 'treasury.bank-charge', 'create'); return revenueOpsStore.recordBankCharge(recordBankChargeSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasuryReconcileBankCharge, (event, payload: unknown) => { const input = reconcileBankChargeSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'treasury.bank-charge', 'approve'); return revenueOpsStore.reconcileBankCharge(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasuryOpenSettlementException, (event, payload: unknown) => { const actor = assertAuthorized(event, 'treasury.settlement-exception', 'create'); return revenueOpsStore.openSettlementException(openSettlementExceptionSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasuryResolveSettlementException, (event, payload: unknown) => { const input = resolveSettlementExceptionSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'treasury.settlement-exception', 'approve'); return revenueOpsStore.resolveSettlementException(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasuryCreateLiquiditySweep, (event, payload: unknown) => { const actor = assertAuthorized(event, 'treasury.liquidity-sweep', 'submit'); return revenueOpsStore.createLiquiditySweep(createLiquiditySweepSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasuryDecideLiquiditySweep, (event, payload: unknown) => { const input = decideLiquiditySweepSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'treasury.liquidity-sweep', 'approve'); return revenueOpsStore.decideLiquiditySweep(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasuryReleaseLiquiditySweep, (event, payload: unknown) => { const input = releaseLiquiditySweepSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'treasury.liquidity-sweep', 'post'); return revenueOpsStore.releaseLiquiditySweep(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.treasurySettleLiquiditySweep, (event, payload: unknown) => { const input = settleLiquiditySweepSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'treasury.liquidity-sweep', 'post'); return revenueOpsStore.settleLiquiditySweep(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.manufacturingCreateWorkCenter, (event, payload: unknown) => { const input = createWorkCenterSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'warehouse', input.warehouseId, 'manufacturing.engineering', 'create'); return revenueOpsStore.createWorkCenter(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.manufacturingCreateBomRevision, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'manufacturing.engineering', 'create'); return revenueOpsStore.createBomRevision(createBomRevisionSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.manufacturingDecideBomRevision, (event, payload: unknown) => { const input = decideBomRevisionSchema.parse(payload); const actor = assertManufacturingRecordAuthorized(event, 'bom', input.id, 'manufacturing.release', 'approve'); return revenueOpsStore.decideBomRevision(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.manufacturingCreateQualityPlan, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'manufacturing.engineering', 'create'); return revenueOpsStore.createQualityPlan(createQualityPlanSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.manufacturingDecideQualityPlan, (event, payload: unknown) => { const input = decideQualityPlanSchema.parse(payload); const actor = assertManufacturingRecordAuthorized(event, 'quality-plan', input.id, 'manufacturing.release', 'approve'); return revenueOpsStore.decideQualityPlan(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.manufacturingCreateWorkOrder, (event, payload: unknown) => { const input = createWorkOrderSchema.parse(payload); const actor = assertManufacturingRecordAuthorized(event, 'bom', input.bomRevisionId, 'manufacturing.execution', 'create'); return revenueOpsStore.createWorkOrder(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.manufacturingDecideWorkOrder, (event, payload: unknown) => { const input = decideWorkOrderSchema.parse(payload); const actor = assertManufacturingRecordAuthorized(event, 'work-order', input.id, 'manufacturing.release', 'approve'); return revenueOpsStore.decideWorkOrder(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.manufacturingStartWorkOrder, (event, payload: unknown) => { const input = startWorkOrderSchema.parse(payload); const actor = assertManufacturingRecordAuthorized(event, 'work-order', input.id, 'manufacturing.execution', 'update'); return revenueOpsStore.startWorkOrder(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.manufacturingIssueMaterial, (event, payload: unknown) => { const input = issueWorkOrderMaterialSchema.parse(payload); const actor = assertManufacturingRecordAuthorized(event, 'work-order', input.workOrderId, 'manufacturing.execution', 'create'); return revenueOpsStore.issueWorkOrderMaterial(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.manufacturingRecordInspection, (event, payload: unknown) => { const input = recordQualityInspectionSchema.parse(payload); const actor = assertManufacturingRecordAuthorized(event, 'work-order', input.workOrderId, 'manufacturing.quality', 'create'); return revenueOpsStore.recordQualityInspection(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.manufacturingResolveNonconformance, (event, payload: unknown) => { const input = resolveNonconformanceSchema.parse(payload); const actor = assertManufacturingRecordAuthorized(event, 'nonconformance', input.id, 'manufacturing.quality', 'approve'); return revenueOpsStore.resolveNonconformance(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.manufacturingRecordOutput, (event, payload: unknown) => { const input = recordProductionOutputSchema.parse(payload); const actor = assertManufacturingRecordAuthorized(event, 'work-order', input.workOrderId, 'manufacturing.execution', 'create'); return revenueOpsStore.recordProductionOutput(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.assetCreateCategory, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'finance.asset-category', 'create');
    return revenueOpsStore.createAssetCategory(createAssetCategorySchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetCreateManagedAsset, (event, payload: unknown) => {
    const input = createManagedAssetSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-category', input.categoryId, 'finance.asset-register', 'create');
    return revenueOpsStore.createManagedAsset(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetSubmitManagedAsset, (event, payload: unknown) => {
    const input = submitManagedAssetSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'managed-asset', input.id, 'finance.asset-register', 'submit');
    return revenueOpsStore.submitManagedAsset(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetDecideManagedAsset, (event, payload: unknown) => {
    const input = decideManagedAssetSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'managed-asset', input.id, 'finance.asset-register', 'approve');
    return revenueOpsStore.decideManagedAsset(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetCreateCapitalization, (event, payload: unknown) => {
    const input = createAssetCapitalizationSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'managed-asset', input.assetId, 'finance.asset-capitalization', 'create');
    return revenueOpsStore.createAssetCapitalization(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetDecideCapitalization, (event, payload: unknown) => {
    const input = decideAssetCapitalizationSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-capitalization', input.id, 'finance.asset-capitalization', 'approve');
    return revenueOpsStore.decideAssetCapitalization(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetCreateDepreciationPolicy, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'finance.asset-depreciation-policy', 'create');
    return revenueOpsStore.createAssetDepreciationPolicy(createAssetDepreciationPolicySchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetDecideDepreciationPolicy, (event, payload: unknown) => {
    const input = decideAssetDepreciationPolicySchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-depreciation-policy', input.id, 'finance.asset-depreciation-policy', 'approve');
    return revenueOpsStore.decideAssetDepreciationPolicy(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetCreateDepreciationRun, (event, payload: unknown) => {
    const actor = assertRevenueOperationsAuthorized(event, 'finance.asset-depreciation-run', 'create');
    return revenueOpsStore.createAssetDepreciationRun(createAssetDepreciationRunSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetDecideDepreciationRun, (event, payload: unknown) => {
    const input = decideAssetDepreciationRunSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-depreciation-run', input.id, 'finance.asset-depreciation-run', 'approve');
    return revenueOpsStore.decideAssetDepreciationRun(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetCreateRetirement, (event, payload: unknown) => {
    const input = createAssetRetirementSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'managed-asset', input.assetId, 'finance.asset-retirement', 'create');
    return revenueOpsStore.createAssetRetirement(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetDecideRetirement, (event, payload: unknown) => {
    const input = decideAssetRetirementSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-retirement', input.id, 'finance.asset-retirement', 'approve');
    return revenueOpsStore.decideAssetRetirement(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetCompleteRetirement, (event, payload: unknown) => {
    const input = completeAssetRetirementSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-retirement', input.id, 'finance.asset-retirement', 'approve');
    return revenueOpsStore.completeAssetRetirement(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetCreateCustodyTransfer, (event, payload: unknown) => {
    const input = createAssetCustodyTransferSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'managed-asset', input.assetId, 'maintenance.asset-transfer', 'create');
    return revenueOpsStore.createAssetCustodyTransfer(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetDecideCustodyTransfer, (event, payload: unknown) => {
    const input = decideAssetCustodyTransferSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-custody-transfer', input.id, 'maintenance.asset-transfer', 'approve');
    return revenueOpsStore.decideAssetCustodyTransfer(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetReceiveCustodyTransfer, (event, payload: unknown) => {
    const input = receiveAssetCustodyTransferSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-custody-transfer', input.id, 'maintenance.asset-transfer', 'update');
    return revenueOpsStore.receiveAssetCustodyTransfer(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetCreateComponentization, (event, payload: unknown) => {
    const input = createAssetComponentizationSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'managed-asset', input.assetId, 'maintenance.asset-componentization', 'create');
    return revenueOpsStore.createAssetComponentization(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetDecideComponentization, (event, payload: unknown) => {
    const input = decideAssetComponentizationSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-componentization', input.id, 'maintenance.asset-componentization', 'approve');
    return revenueOpsStore.decideAssetComponentization(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetCreateComponentAllocation, (event, payload: unknown) => {
    const input = createAssetComponentAllocationSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-componentization', input.componentizationId, 'finance.asset-component-allocation', 'create');
    return revenueOpsStore.createAssetComponentAllocation(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetDecideComponentAllocation, (event, payload: unknown) => {
    const input = decideAssetComponentAllocationSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-component-allocation', input.id, 'finance.asset-component-allocation', 'approve');
    return revenueOpsStore.decideAssetComponentAllocation(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetCreateTransferAccounting, (event, payload: unknown) => {
    const input = createAssetTransferAccountingSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'managed-asset', input.assetId, 'finance.asset-transfer-accounting', 'create');
    return revenueOpsStore.createAssetTransferAccounting(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetDecideTransferAccounting, (event, payload: unknown) => {
    const input = decideAssetTransferAccountingSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-transfer-accounting', input.id, 'finance.asset-transfer-accounting', 'approve');
    return revenueOpsStore.decideAssetTransferAccounting(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetDispatchTransferAccounting, (event, payload: unknown) => {
    const input = dispatchAssetTransferAccountingSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-transfer-accounting', input.id, 'finance.asset-transfer-accounting', 'update');
    return revenueOpsStore.dispatchAssetTransferAccounting(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetReceiveTransferAccounting, (event, payload: unknown) => {
    const input = receiveAssetTransferAccountingSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-transfer-accounting', input.id, 'finance.asset-transfer-accounting', 'update');
    return revenueOpsStore.receiveAssetTransferAccounting(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetCreateSaleDisposal, (event, payload: unknown) => {
    const input = createAssetSaleDisposalSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'managed-asset', input.assetId, 'finance.asset-sale-disposal', 'create');
    return revenueOpsStore.createAssetSaleDisposal(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetDecideSaleDisposal, (event, payload: unknown) => {
    const input = decideAssetSaleDisposalSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-sale-disposal', input.id, 'finance.asset-sale-disposal', 'approve');
    return revenueOpsStore.decideAssetSaleDisposal(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetCompleteSaleDisposal, (event, payload: unknown) => {
    const input = completeAssetSaleDisposalSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'asset-sale-disposal', input.id, 'finance.asset-sale-disposal', 'update');
    return revenueOpsStore.completeAssetSaleDisposal(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.assetRunLifecycleAction, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'maintenance.asset-lifecycle', 'create');
    const parsed = assetLifecycleActionSchema.parse(payload) as unknown as AssetLifecycleActionInput;
    return revenueOpsStore.runAssetLifecycleAction(parsed, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.maintenanceCreatePreventivePlan, (event, payload: unknown) => {
    const input = createPreventiveMaintenancePlanSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'managed-asset', input.assetId, 'maintenance.plan', 'create');
    return revenueOpsStore.createPreventiveMaintenancePlan(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.maintenanceGenerateDueWorkOrder, (event, payload: unknown) => {
    const input = generateDueMaintenanceWorkOrderSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'maintenance-plan', input.planId, 'maintenance.work-order', 'create');
    return revenueOpsStore.generateDueMaintenanceWorkOrder(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.maintenanceStartWorkOrder, (event, payload: unknown) => {
    const input = startMaintenanceWorkOrderSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'maintenance-work-order', input.id, 'maintenance.work-order', 'update');
    return revenueOpsStore.startMaintenanceWorkOrder(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.maintenanceCompleteWorkOrder, (event, payload: unknown) => {
    const input = completeMaintenanceWorkOrderSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'maintenance-work-order', input.id, 'maintenance.work-order', 'update');
    return revenueOpsStore.completeMaintenanceWorkOrder(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.maintenanceVerifyWorkOrder, (event, payload: unknown) => {
    const input = verifyMaintenanceWorkOrderSchema.parse(payload);
    const actor = assertAssetMaintenanceRecordAuthorized(event, 'maintenance-work-order', input.id, 'maintenance.work-order', 'approve');
    return revenueOpsStore.verifyMaintenanceWorkOrder(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.deliveryCreateProject, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'delivery.project', 'create'); return revenueOpsStore.createProject(createProjectSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.deliveryDecideProject, (event, payload: unknown) => { const input = decideProjectSchema.parse(payload); const actor = assertDeliveryRecordAuthorized(event, 'project', input.id, 'delivery.project', 'approve'); return revenueOpsStore.decideProject(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.deliveryTransitionProject, (event, payload: unknown) => { const input = transitionProjectSchema.parse(payload); const actor = assertDeliveryRecordAuthorized(event, 'project', input.id, 'delivery.project', 'update'); return revenueOpsStore.transitionProject(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.deliveryCreateTask, (event, payload: unknown) => { const input = createProjectTaskSchema.parse(payload); const actor = assertDeliveryRecordAuthorized(event, 'project', input.projectId, 'delivery.project', 'create'); return revenueOpsStore.createProjectTask(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.deliveryTransitionTask, (event, payload: unknown) => { const input = transitionProjectTaskSchema.parse(payload); const actor = assertDeliveryRecordAuthorized(event, 'task', input.id, 'delivery.project', 'update'); return revenueOpsStore.transitionProjectTask(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.deliveryRecordTime, (event, payload: unknown) => { const input = recordTimeEntrySchema.parse(payload); const actor = assertDeliveryRecordAuthorized(event, 'task', input.projectTaskId, 'delivery.project', 'create'); return revenueOpsStore.recordTimeEntry(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.deliveryDecideTime, (event, payload: unknown) => { const input = decideTimeEntrySchema.parse(payload); const actor = assertDeliveryRecordAuthorized(event, 'time-entry', input.id, 'delivery.project', 'approve'); return revenueOpsStore.decideTimeEntry(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.deliveryCreateAgreement, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'delivery.service', 'create'); return revenueOpsStore.createServiceAgreement(createServiceAgreementSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.deliveryDecideAgreement, (event, payload: unknown) => { const input = decideServiceAgreementSchema.parse(payload); const actor = assertDeliveryRecordAuthorized(event, 'service-agreement', input.id, 'delivery.service', 'approve'); return revenueOpsStore.decideServiceAgreement(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.deliveryCreateTicket, (event, payload: unknown) => { const input = createSupportTicketSchema.parse(payload); const actor = assertDeliveryRecordAuthorized(event, 'service-agreement', input.agreementId, 'delivery.service', 'create'); return revenueOpsStore.createSupportTicket(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.deliveryTransitionTicket, (event, payload: unknown) => { const input = transitionSupportTicketSchema.parse(payload); const actor = assertDeliveryRecordAuthorized(event, 'support-ticket', input.id, 'delivery.service', 'update'); return revenueOpsStore.transitionSupportTicket(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.deliveryCreateFieldJob, (event, payload: unknown) => { const input = createFieldServiceJobSchema.parse(payload); const actor = assertDeliveryRecordAuthorized(event, 'support-ticket', input.ticketId, 'delivery.service', 'create'); return revenueOpsStore.createFieldServiceJob(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.deliveryTransitionFieldJob, (event, payload: unknown) => { const input = transitionFieldServiceJobSchema.parse(payload); const actor = assertDeliveryRecordAuthorized(event, 'field-service-job', input.id, 'delivery.service', 'update'); return revenueOpsStore.transitionFieldServiceJob(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.workforceCreateProfile, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'workforce.profile', 'create'); return revenueOpsStore.createWorkforceProfile(createWorkforceProfileSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.workforceDecideProfile, (event, payload: unknown) => { const input = decideWorkforceProfileSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'workforce.profile', 'approve'); return revenueOpsStore.decideWorkforceProfile(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.workforceRecordAvailability, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'workforce.availability', 'create'); return revenueOpsStore.recordWorkforceAvailability(recordWorkforceAvailabilitySchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.workforceDecideAvailability, (event, payload: unknown) => { const input = decideWorkforceAvailabilitySchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'workforce.availability', 'approve'); return revenueOpsStore.decideWorkforceAvailability(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.workforceCreateAllocation, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'workforce.allocation', 'create'); return revenueOpsStore.createWorkforceAllocation(createWorkforceAllocationSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.workforceCancelAllocation, (event, payload: unknown) => { const input = cancelWorkforceAllocationSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'workforce.allocation', 'update'); return revenueOpsStore.cancelWorkforceAllocation(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollCreateRegistration, (event, payload: unknown) => { const actor = assertAuthorized(event, 'payroll.employer-registration', 'create'); return revenueOpsStore.createEmployerRegistration(createEmployerRegistrationSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollDecideRegistration, (event, payload: unknown) => { const input = decideEmployerRegistrationSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.employer-registration', 'approve'); return revenueOpsStore.decideEmployerRegistration(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollCreatePolicy, (event, payload: unknown) => { const actor = assertAuthorized(event, 'payroll.policy', 'create'); return revenueOpsStore.createPayrollPolicy(createPayrollPolicySchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollDecidePolicy, (event, payload: unknown) => { const input = decidePayrollPolicySchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.policy', 'approve'); return revenueOpsStore.decidePayrollPolicy(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollCreateCompensation, (event, payload: unknown) => { const actor = assertAuthorized(event, 'payroll.compensation', 'create'); return revenueOpsStore.createPayrollCompensation(createPayrollCompensationSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollDecideCompensation, (event, payload: unknown) => { const input = decidePayrollCompensationSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.compensation', 'approve'); return revenueOpsStore.decidePayrollCompensation(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollCreateBenefitPlan, (event, payload: unknown) => { const actor = assertAuthorized(event, 'payroll.benefit-plan', 'create'); return revenueOpsStore.createBenefitPlan(createBenefitPlanSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollDecideBenefitPlan, (event, payload: unknown) => { const input = decideBenefitPlanSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.benefit-plan', 'approve'); return revenueOpsStore.decideBenefitPlan(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollCreateBenefitEnrollment, (event, payload: unknown) => { const actor = assertAuthorized(event, 'payroll.benefit-enrollment', 'create'); return revenueOpsStore.createBenefitEnrollment(createBenefitEnrollmentSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollDecideBenefitEnrollment, (event, payload: unknown) => { const input = decideBenefitEnrollmentSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.benefit-enrollment', 'approve'); return revenueOpsStore.decideBenefitEnrollment(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollCreateRun, (event, payload: unknown) => { const actor = assertAuthorized(event, 'payroll.run', 'create'); return revenueOpsStore.createPayrollRun(createPayrollRunSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollDecideRun, (event, payload: unknown) => { const input = decidePayrollRunSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.run', 'approve'); return revenueOpsStore.decidePayrollRun(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollFinalizeRun, (event, payload: unknown) => { const input = finalizePayrollRunSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.run', 'post'); return revenueOpsStore.finalizePayrollRun(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollUpdateObligation, (event, payload: unknown) => { const input = updatePayrollObligationSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.obligation', 'post'); return revenueOpsStore.updatePayrollObligation(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollCreateExpense, (event, payload: unknown) => { const actor = assertAuthorized(event, 'payroll.expense-claim', 'create'); return revenueOpsStore.createExpenseClaim(createExpenseClaimSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollDecideExpense, (event, payload: unknown) => { const input = decideExpenseClaimSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.expense-claim', 'approve'); return revenueOpsStore.decideExpenseClaim(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollReimburseExpense, (event, payload: unknown) => { const input = reimburseExpenseClaimSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.expense-claim', 'post'); return revenueOpsStore.reimburseExpenseClaim(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.workforceRecordAttendance, (event, payload: unknown) => { const actor = assertAuthorized(event, 'workforce.attendance', 'create'); return revenueOpsStore.recordAttendance(recordAttendanceSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.workforceDecideAttendance, (event, payload: unknown) => { const input = decideAttendanceSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'workforce.attendance', 'approve'); return revenueOpsStore.decideAttendance(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.workforceCreateLeaveType, (event, payload: unknown) => { const actor = assertAuthorized(event, 'workforce.leave-type', 'create'); return revenueOpsStore.createLeaveType(createLeaveTypeSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.workforceDecideLeaveType, (event, payload: unknown) => { const input = decideLeaveTypeSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'workforce.leave-type', 'approve'); return revenueOpsStore.decideLeaveType(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.workforceCreateLeaveApplication, (event, payload: unknown) => { const actor = assertAuthorized(event, 'workforce.leave-application', 'create'); return revenueOpsStore.createLeaveApplication(createLeaveApplicationSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.workforceDecideLeaveApplication, (event, payload: unknown) => { const input = decideLeaveApplicationSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'workforce.leave-application', 'approve'); return revenueOpsStore.decideLeaveApplication(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollCreateAdjustment, (event, payload: unknown) => { const actor = assertAuthorized(event, 'payroll.adjustment', 'create'); return revenueOpsStore.createPayrollAdjustment(createPayrollAdjustmentSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollDecideAdjustment, (event, payload: unknown) => { const input = decidePayrollAdjustmentSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.adjustment', 'approve'); return revenueOpsStore.decidePayrollAdjustment(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollCreateTaxDeclaration, (event, payload: unknown) => { const actor = assertAuthorized(event, 'payroll.tax-declaration', 'create'); return revenueOpsStore.createTaxDeclaration(createTaxDeclarationSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollDecideTaxDeclaration, (event, payload: unknown) => { const input = decideTaxDeclarationSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.tax-declaration', 'approve'); return revenueOpsStore.decideTaxDeclaration(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollPublishPayslip, (event, payload: unknown) => { const actor = assertAuthorized(event, 'payroll.payslip', 'post'); return revenueOpsStore.publishPayslip(publishPayslipSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.payrollAcknowledgePayslip, (event, payload: unknown) => { const input = acknowledgePayslipSchema.parse(payload); const actor = assertWorkforcePayrollRecordAuthorized(event, input.id, 'payroll.payslip', 'update'); return revenueOpsStore.acknowledgePayslip(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financialCreateBillingPlan, (event, payload: unknown) => {
    const input = createProjectBillingPlanSchema.parse(payload);
    const actor = assertDeliveryRecordAuthorized(
      event,
      'project',
      input.projectId,
      'finance.journal',
      'create',
    );
    return revenueOpsStore.createProjectBillingPlan(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.financialDecideBillingPlan, (event, payload: unknown) => { const input = decideProjectBillingPlanSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'financial.billing-plan', 'approve'); return revenueOpsStore.decideProjectBillingPlan(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financialCreateBillingClaim, (event, payload: unknown) => {
    const input = createProjectBillingClaimSchema.parse(payload);
    const actor = assertFinanceControlRecordAuthorized(
      event,
      input.planId,
      'finance.journal',
      'create',
    );
    return revenueOpsStore.createProjectBillingClaim(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.financialDecideBillingClaim, (event, payload: unknown) => { const input = decideProjectBillingClaimSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'financial.billing-claim', 'approve'); return revenueOpsStore.decideProjectBillingClaim(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financialConsumeEntitlement, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'finance.entitlement', 'update'); return revenueOpsStore.consumeServiceEntitlement(consumeServiceEntitlementSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financialCreateClosePeriod, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'finance.period', 'create'); return revenueOpsStore.createAccountingClosePeriod(createAccountingClosePeriodSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financialDecideClosePeriod, (event, payload: unknown) => { const input = decideAccountingClosePeriodSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'financial.close-period', 'approve'); return revenueOpsStore.decideAccountingClosePeriod(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.financialReopenClosePeriod, (event, payload: unknown) => { const input = reopenAccountingClosePeriodSchema.parse(payload); const actor = assertFinanceControlRecordAuthorized(event, input.id, 'financial.close-period', 'approve'); return revenueOpsStore.reopenAccountingClosePeriod(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialCreateExchangeRate, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.currency', 'create'); return revenueOpsStore.createProjectExchangeRate(createProjectExchangeRateSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialDecideExchangeRate, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.currency', 'approve'); return revenueOpsStore.decideProjectExchangeRate(decideProjectExchangeRateSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialCreateCurrencyProfile, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.currency', 'create'); return revenueOpsStore.createProjectCurrencyProfile(createProjectCurrencyProfileSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialDecideCurrencyProfile, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.currency', 'approve'); return revenueOpsStore.decideProjectCurrencyProfile(decideProjectCurrencyProfileSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialCreateVariation, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.contract', 'create'); return revenueOpsStore.createProjectContractVariation(createProjectContractVariationSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialDecideVariation, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.contract', 'approve'); return revenueOpsStore.decideProjectContractVariation(decideProjectContractVariationSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialCreateRetainer, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.retainer', 'create'); return revenueOpsStore.createProjectRetainer(createProjectRetainerSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialDecideRetainer, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.retainer', 'approve'); return revenueOpsStore.decideProjectRetainer(decideProjectRetainerSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialCreateDrawdown, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.retainer', 'create'); return revenueOpsStore.createRetainerDrawdown(createRetainerDrawdownSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialDecideDrawdown, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.retainer', 'approve'); return revenueOpsStore.decideRetainerDrawdown(decideRetainerDrawdownSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialCreateResourcePlan, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.resource-plan', 'create'); return revenueOpsStore.createProjectResourcePlan(createProjectResourcePlanSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialDecideResourcePlan, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.resource-plan', 'approve'); return revenueOpsStore.decideProjectResourcePlan(decideProjectResourcePlanSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialGenerateMarginReview, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.margin', 'create'); return revenueOpsStore.generateProjectMarginReview(generateProjectMarginReviewSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.commercialReviewMargin, (event, payload: unknown) => { const actor = assertRevenueOperationsAuthorized(event, 'commercial.margin', 'approve'); return revenueOpsStore.reviewProjectMargin(reviewProjectMarginSchema.parse(payload), actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreateUom, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.addUom(createUomSchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreateUomConversion, (event, payload: unknown) => { const input = createUomConversionSchema.parse(payload); assertInventoryRecordAuthorized(event, 'inventory-item', input.itemId, 'inventory.master', 'create'); return revenueOpsStore.addUomConversion(input); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreateItem, (event, payload: unknown) => { const input = createInventoryItemSchema.parse(payload); assertInventoryRecordAuthorized(event, 'uom', input.baseUomId, 'inventory.master', 'create'); return revenueOpsStore.addInventoryItem(input); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreateVariant, (event, payload: unknown) => { const input = createItemVariantSchema.parse(payload); assertInventoryRecordAuthorized(event, 'inventory-item', input.itemId, 'inventory.master', 'create'); return revenueOpsStore.addItemVariant(input); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreateWarehouse, (event, payload: unknown) => { assertRevenueOperationsAuthorized(event, 'inventory.master', 'create'); return revenueOpsStore.addWarehouse(createWarehouseSchema.parse(payload)); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreateZone, (event, payload: unknown) => { const input = createWarehouseZoneSchema.parse(payload); assertInventoryRecordAuthorized(event, 'warehouse', input.warehouseId, 'inventory.master', 'create'); return revenueOpsStore.addWarehouseZone(input); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreateBin, (event, payload: unknown) => { const input = createStorageBinSchema.parse(payload); assertInventoryRecordAuthorized(event, 'warehouse-zone', input.zoneId, 'inventory.master', 'create'); return revenueOpsStore.addStorageBin(input); });
  ipcMain.handle(IPC_CHANNELS.inventoryReceive, (event, payload: unknown) => { const input = receiveInventorySchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'warehouse', input.warehouseId, 'inventory.execution', 'create'); return revenueOpsStore.receiveInventory(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreatePutaway, (event, payload: unknown) => { const input = createPutawayTaskSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'storage-bin', input.fromBinId, 'inventory.execution', 'create'); return revenueOpsStore.addPutawayTask(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreatePick, (event, payload: unknown) => { const input = createPickTaskSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'storage-bin', input.fromBinId, 'inventory.execution', 'create'); return revenueOpsStore.addPickTask(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryTransitionTask, (event, payload: unknown) => { const input = transitionWarehouseTaskSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'warehouse-task', input.id, 'inventory.execution', 'update'); return revenueOpsStore.moveWarehouseTask(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreateTransfer, (event, payload: unknown) => { const input = createInventoryTransferSchema.parse(payload); const actor = assertRevenueOperationsRecordAuthorized(event, revenueOpsStore.getInventoryTransferAuthorizationScope([input.fromWarehouseId, input.toWarehouseId]), 'inventory.execution', 'create'); return revenueOpsStore.addInventoryTransfer(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryTransitionTransfer, (event, payload: unknown) => { const input = transitionInventoryTransferSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'inventory-transfer', input.id, 'inventory.execution', 'update'); return revenueOpsStore.moveInventoryTransfer(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreateCycleCount, (event, payload: unknown) => { const input = createCycleCountSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'warehouse', input.warehouseId, 'inventory.execution', 'create'); return revenueOpsStore.addCycleCount(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryRecordCycleCount, (event, payload: unknown) => { const input = recordCycleCountSchema.parse(payload); assertInventoryRecordAuthorized(event, 'cycle-count', input.id, 'inventory.execution', 'update'); return revenueOpsStore.recordCycleCount(input); });
  ipcMain.handle(IPC_CHANNELS.inventoryDecideCycleCount, (event, payload: unknown) => { const input = decideCycleCountSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'cycle-count', input.id, 'inventory.execution', 'approve'); return revenueOpsStore.decideCycleCount(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreateReorderPolicy, (event, payload: unknown) => { const input = createReorderPolicySchema.parse(payload); assertInventoryRecordAuthorized(event, 'warehouse', input.warehouseId, 'inventory.master', 'create'); return revenueOpsStore.addReorderPolicy(input); });
  ipcMain.handle(IPC_CHANNELS.inventoryGenerateReorderProposals, (event) => { assertRevenueOperationsAuthorized(event, 'inventory.execution', 'create'); return revenueOpsStore.generateReorderProposals(); });
  ipcMain.handle(IPC_CHANNELS.inventoryDecideReorderProposal, (event, payload: unknown) => { const input = decideReorderProposalSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'reorder-proposal', input.id, 'inventory.execution', 'approve'); return revenueOpsStore.decideReorderProposal(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreateValuationReview, (event, payload: unknown) => { const input = createInventoryValuationReviewSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'warehouse', input.warehouseId, 'inventory.execution', 'create'); return revenueOpsStore.addInventoryValuationReview(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryDecideValuationReview, (event, payload: unknown) => { const input = decideInventoryValuationReviewSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'valuation-review', input.id, 'inventory.execution', 'approve'); return revenueOpsStore.decideInventoryValuationReview(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryCreateDisposition, (event, payload: unknown) => { const input = createInventoryDispositionSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'warehouse', input.warehouseId, 'inventory.execution', 'create'); return revenueOpsStore.createInventoryDisposition(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryDecideDisposition, (event, payload: unknown) => { const input = decideInventoryDispositionSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'inventory-disposition', input.id, 'inventory.execution', 'approve'); return revenueOpsStore.decideInventoryDisposition(input, actor.userId); });
  ipcMain.handle(IPC_CHANNELS.inventoryPostDisposition, (event, payload: unknown) => { const input = postInventoryDispositionSchema.parse(payload); const actor = assertInventoryRecordAuthorized(event, 'inventory-disposition', input.id, 'inventory.execution', 'update'); return revenueOpsStore.postInventoryDisposition(input, actor.userId); });

  ipcMain.handle(IPC_CHANNELS.systemInfo, (event) => {
    assertTrustedSender(event);

    return {
      productName: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      dataMode: 'local-first' as const,
    };
  });
  ipcMain.handle(IPC_CHANNELS.systemBuildProvenance, (event) => {
    assertTrustedSender(event);
    return currentBuildProvenance();
  });

  ipcMain.handle(IPC_CHANNELS.crmSnapshot, (event) => {
    assertRevenueOperationsRecordAuthorized(event, store.getAuthorizationScope(), 'crm.opportunity', 'read');

    return store.getSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.crmCreateLead, (event, payload: unknown) => {
    assertRevenueOperationsRecordAuthorized(event, store.getAuthorizationScope(), 'crm.opportunity', 'create');

    return store.createLead(createLeadSchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.crmMoveOpportunity, (event, payload: unknown) => {
    assertRevenueOperationsRecordAuthorized(event, store.getAuthorizationScope(), 'crm.opportunity', 'update');
    const input = moveOpportunitySchema.parse(payload);
    const opportunity = store.getOpportunity(input.id);
    if (!opportunity) throw new Error('Opportunity not found.');
    return store.changeOpportunityStage(input, crmDepthStore.getMovePolicy(opportunity.stage, input.toStage));
  });

  ipcMain.handle(IPC_CHANNELS.crmCompleteActivity, (event, payload: unknown) => {
    assertRevenueOperationsRecordAuthorized(event, store.getAuthorizationScope(), 'crm.opportunity', 'update');

    return store.completeActivity(completeActivitySchema.parse(payload));
  });

  ipcMain.handle(IPC_CHANNELS.kernelSnapshot, (event) => {
    assertAuthorized(event, 'kernel.configuration', 'admin');
    return kernelStore.getSnapshot();
  });
  ipcMain.handle(IPC_CHANNELS.kernelOperationalHealth, (event) => {
    assertAuthorized(event, 'kernel.configuration', 'read');
    return { ...kernelStore.getOperationalHealth(), runtimeDatabaseEncryption };
  });
  ipcMain.handle(IPC_CHANNELS.kernelOutboxReplayPlan, (event) => {
    assertAuthorized(event, 'kernel.configuration', 'read');
    return kernelStore.getOutboxReplayPlan();
  });
  ipcMain.handle(IPC_CHANNELS.kernelExecuteOutboxReplay, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'kernel.configuration', 'admin');
    return kernelStore.executeOutboxReplay(executeOutboxReplaySchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.kernelResolveOutboxConflict, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'kernel.configuration', 'admin');
    return kernelStore.resolveOutboxConflict(resolveOutboxConflictSchema.parse(payload), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.integrationListApiKeys, (event, payload: unknown) => {
    const input = apiKeyScopeInputSchema.parse(payload);
    assertRevenueOperationsRecordAuthorized(event, input, 'integration.api-key', 'read');
    return apiKeyStore.list(input.companyId, input.branchId);
  });
  ipcMain.handle(IPC_CHANNELS.integrationIssueApiKey, (event, payload: unknown) => {
    const input = issueApiKeySchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(event, input, 'integration.api-key', 'admin');
    return apiKeyStore.issue(input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.integrationRevokeApiKey, (event, payload: unknown) => {
    const input = revokeApiKeySchema.parse(payload);
    const key = apiKeyStore.get(input.id);
    if (!key) throw new Error('API key was not found.');
    const actor = assertRevenueOperationsRecordAuthorized(event, key, 'integration.api-key', 'admin');
    apiKeyStore.revoke(input.id, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.integrationExportApiKeyInventory, async (event, payload: unknown) => {
    const input = apiKeyScopeInputSchema.parse(payload);
    const actor = assertRevenueOperationsRecordAuthorized(event, input, 'integration.api-key', 'export');
    const records = apiKeyStore.list(input.companyId, input.branchId).map((record) => { const { secretHash, ...safe } = record; void secretHash; return safe; });
    const artifact = createGovernedExchangeExport({ resource: 'integration.api-key', fileName: `epic-api-key-inventory-${input.branchId}.csv`, companyId: input.companyId, branchId: input.branchId, fields: ['id', 'label', 'keyPrefix', 'scopes', 'createdAt', 'revokedAt'], records: records.map((record) => ({ ...record, scopes: record.scopes.join('|') })), actorId: actor.userId });
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Export governed API-key inventory', defaultPath: artifact.fileName, filters: [{ name: 'CSV data', extensions: ['csv'] }] };
    const choice = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
    if (choice.canceled || !choice.filePath) return null;
    await writeFile(choice.filePath, artifact.csv, 'utf8');
    return { resource: artifact.resource, filePath: choice.filePath, checksum: artifact.checksum, rows: artifact.rows, exportedAt: artifact.generatedAt };
  });
  ipcMain.handle(IPC_CHANNELS.integrationExportProviderCertification, async (event, payload: unknown) => {
    const input = providerCertificationHandoffSchema.parse(payload);
    const actor = assertAuthorized(event, 'release.control', 'export');
    const artifact = createProviderCertificationPackage(input, actor.userId);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Export provider certification package', defaultPath: `provider-certification-${artifact.domain}.json`, filters: [{ name: 'JSON package', extensions: ['json'] }] };
    const choice = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
    if (choice.canceled || !choice.filePath) return null;
    await writeFile(choice.filePath, JSON.stringify(artifact, null, 2), 'utf8');
    return { filePath: choice.filePath, checksum: artifact.checksum, readyForSandbox: artifact.readyForSandbox, readyForProduction: artifact.readyForProduction, exportedAt: artifact.generatedAt };
  });
  ipcMain.handle(IPC_CHANNELS.integrationVerifyProviderCertification, async (event) => {
    const actor = assertAuthorized(event, 'release.control', 'read');
    void actor;
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Verify provider certification package', filters: [{ name: 'JSON package', extensions: ['json'] }] };
    const choice = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (choice.canceled || !choice.filePaths[0]) return null;
    const filePath = choice.filePaths[0];
    const fileStat = await stat(filePath);
    if (fileStat.size > 5 * 1024 * 1024) throw new Error('Provider certification package exceeds the 5 MB verification limit.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(filePath, 'utf8'));
    } catch {
      return { filePath, verifiedAt: new Date().toISOString(), valid: false, declaredChecksum: '', missing: [], errors: ['Provider certification package is not valid JSON.'] };
    }
    return { filePath, verifiedAt: new Date().toISOString(), ...verifyProviderCertificationPackage(parsed) };
  });
  ipcMain.handle(IPC_CHANNELS.integrationGetRetailCertificationPack, (event) => {
    const actor = assertAuthorized(event, 'release.control', 'read');
    return createRetailCertificationPack(revenueOpsStore.getSnapshot(), actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.integrationExportRetailCertificationPack, async (event) => {
    const actor = assertAuthorized(event, 'release.control', 'export');
    const snapshot = revenueOpsStore.getSnapshot();
    const artifact = createRetailCertificationPack(snapshot, actor.userId);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Export retail provider and device certification pack', defaultPath: `epic-retail-certification-${snapshot.scope.branchId}.json`, filters: [{ name: 'JSON package', extensions: ['json'] }] };
    const choice = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
    if (choice.canceled || !choice.filePath) return null;
    await writeFile(choice.filePath, JSON.stringify(artifact, null, 2), 'utf8');
    return { filePath: choice.filePath, checksum: artifact.checksum, readyForProduction: artifact.summary.readyForProduction, externalGateCount: artifact.summary.externalGateCount, exportedAt: artifact.generatedAt };
  });
  ipcMain.handle(IPC_CHANNELS.integrationVerifyRetailCertificationPack, async (event) => {
    const actor = assertAuthorized(event, 'release.control', 'read');
    void actor;
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Verify retail certification pack', filters: [{ name: 'JSON package', extensions: ['json'] }] };
    const choice = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (choice.canceled || !choice.filePaths[0]) return null;
    const filePath = choice.filePaths[0];
    const fileStat = await stat(filePath);
    if (fileStat.size > 5 * 1024 * 1024) throw new Error('Certification pack exceeds the 5 MB verification limit.');
    let parsed: unknown;
    try { parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown; } catch { return { filePath, verifiedAt: new Date().toISOString(), valid: false, declaredChecksum: '', errors: ['Selected file is not valid JSON.'] }; }
    return { filePath, verifiedAt: new Date().toISOString(), ...verifyRetailCertificationPack(parsed) };
  });
  ipcMain.handle(IPC_CHANNELS.securityRotateArtifactKeyEnvelopes, async (event) => {
    const actor = assertAuthorized(event, 'release.control', 'admin');
    if (!artifactKeyRotation) throw new Error('Encrypted artifact rotation is unavailable in this process.');
    return artifactKeyRotation.rotate(actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.releaseListGates, (event) => {
    assertAuthorized(event, 'release.control', 'read');
    return releaseGateStore.list();
  });
  ipcMain.handle(IPC_CHANNELS.releaseReadiness, (event) => {
    assertAuthorized(event, 'release.control', 'read');
    return releaseGateStore.readiness();
  });
  ipcMain.handle(IPC_CHANNELS.releaseReadinessReport, (event) => {
    assertAuthorized(event, 'release.control', 'read');
    const provenance = currentBuildProvenance();
    return createReleaseReadinessReport(releaseGateStore.readiness(), new Date().toISOString(), provenance);
  });
  ipcMain.handle(IPC_CHANNELS.releaseSupportDiagnostics, (event) => {
    assertAuthorized(event, 'release.control', 'read');
    const health = kernelStore.getOperationalHealth();
    const readiness = releaseGateStore.readiness();
    const provenance = currentBuildProvenance();
    return createSupportDiagnostics(health, readiness, provenance, new Date().toISOString());
  });
  ipcMain.handle(IPC_CHANNELS.releaseRecordGate, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'release.control', 'admin');
    const input = releaseGateSchema.parse(payload);
    return releaseGateStore.record({ ...input, notes: input.notes ? `${input.notes} (recorded by ${actor.userId})` : `Recorded by ${actor.userId}` });
  });
  ipcMain.handle(IPC_CHANNELS.releaseListArtifactEvidence, (event) => {
    assertAuthorized(event, 'release.control', 'read');
    return releaseArtifactStore.list();
  });
  ipcMain.handle(IPC_CHANNELS.releaseRecordArtifactEvidence, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'release.control', 'admin');
    return releaseArtifactStore.record(releaseArtifactEvidenceSchema.parse(payload), actor.userId, currentBuildProvenance());
  });
  ipcMain.handle(IPC_CHANNELS.releaseDecideArtifactEvidence, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'release.control', 'admin');
    return releaseArtifactStore.decide(decideReleaseArtifactEvidenceSchema.parse(payload), actor.userId, currentBuildProvenance());
  });
  ipcMain.handle(IPC_CHANNELS.releaseListUpdateEvidence, (event) => {
    assertAuthorized(event, 'release.control', 'read');
    return releaseUpdateStore.list();
  });
  ipcMain.handle(IPC_CHANNELS.releaseRecordUpdateEvidence, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'release.control', 'admin');
    return releaseUpdateStore.record(releaseUpdateEvidenceSchema.parse(payload), actor.userId, currentBuildProvenance());
  });
  ipcMain.handle(IPC_CHANNELS.releaseDecideUpdateEvidence, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'release.control', 'admin');
    return releaseUpdateStore.decide(decideReleaseUpdateEvidenceSchema.parse(payload), actor.userId, currentBuildProvenance());
  });
  ipcMain.handle(IPC_CHANNELS.releaseAutoUpdateStatus, (event) => {
    assertAuthorized(event, 'release.control', 'read');
    return autoUpdateService.getStatus();
  });
  ipcMain.handle(IPC_CHANNELS.releaseListUiAcceptanceEvidence, (event) => {
    assertAuthorized(event, 'release.control', 'read');
    return uiAcceptanceStore.list();
  });
  ipcMain.handle(IPC_CHANNELS.releaseRecordUiAcceptanceEvidence, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'release.control', 'admin');
    return uiAcceptanceStore.record(recordUiAcceptanceEvidenceSchema.parse(payload), actor.userId, currentBuildProvenance());
  });
  ipcMain.handle(IPC_CHANNELS.releaseDecideUiAcceptanceEvidence, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'release.control', 'admin');
    return uiAcceptanceStore.decide(decideUiAcceptanceEvidenceSchema.parse(payload), actor.userId, currentBuildProvenance());
  });
  ipcMain.handle(IPC_CHANNELS.releaseUiAcceptanceReadiness, (event) => {
    assertAuthorized(event, 'release.control', 'read');
    return evaluateUiAcceptanceReadiness({ releaseIdentitySha256: currentBuildProvenance().releaseIdentitySha256, evidence: uiAcceptanceStore.list() });
  });

  ipcMain.handle(IPC_CHANNELS.intelligenceListAnomalies, (event) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    return intelligenceStore.listAnomalies(revenueOpsStore.getSnapshot().scope);
  });
  ipcMain.handle(IPC_CHANNELS.intelligenceSaveAnomaly, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = intelligenceAnomalySchema.parse(payload);
    if (input.status !== 'open') throw new Error('Only open generated anomalies can be refreshed.');
    void actor;
    return intelligenceStore.saveAnomaly(revenueOpsStore.getSnapshot().scope, input as unknown as import('../domain/governed-anomaly-queue').GovernedAnomaly);
  });
  ipcMain.handle(IPC_CHANNELS.intelligenceReviewAnomaly, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = intelligenceReviewAnomalySchema.parse(payload);
    return intelligenceStore.reviewAnomaly(revenueOpsStore.getSnapshot().scope, input.id, { decision: input.decision, reviewerId: input.reviewerId ?? actor.userId, reviewedAt: input.reviewedAt, rationale: input.rationale, expectedVersion: input.expectedVersion });
  });
  ipcMain.handle(IPC_CHANNELS.intelligenceListReportExecutions, (event) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    return intelligenceStore.listReportExecutions(revenueOpsStore.getSnapshot().scope);
  });
  ipcMain.handle(IPC_CHANNELS.intelligenceSaveReportExecution, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = intelligenceReportExecutionSchema.parse(payload);
    return intelligenceStore.saveReportExecution(revenueOpsStore.getSnapshot().scope, { ...input, executedBy: actor.userId });
  });
  ipcMain.handle(IPC_CHANNELS.intelligenceListReportDeliveryPlans, (event) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    return intelligenceStore.listReportDeliveryPlans(revenueOpsStore.getSnapshot().scope);
  });
  ipcMain.handle(IPC_CHANNELS.intelligenceListReportDeliveryAttempts, (event) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    return intelligenceStore.listReportDeliveryAttempts(revenueOpsStore.getSnapshot().scope);
  });
  ipcMain.handle(IPC_CHANNELS.intelligenceCreateReportDeliveryPlan, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = createReportDeliveryPlanSchema.parse(payload);
    return intelligenceStore.createReportDeliveryPlan(revenueOpsStore.getSnapshot().scope, input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.intelligenceDecideReportDeliveryPlan, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = decideReportDeliveryPlanSchema.parse(payload);
    return intelligenceStore.decideReportDeliveryPlan(revenueOpsStore.getSnapshot().scope, input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.intelligencePrepareReportDeliveryAttempt, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = prepareReportDeliveryAttemptSchema.parse(payload);
    return intelligenceStore.prepareReportDeliveryAttempt(revenueOpsStore.getSnapshot().scope, input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.intelligenceRecordReportDeliveryResult, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = recordReportDeliveryResultSchema.parse(payload);
    return intelligenceStore.recordReportDeliveryResult(revenueOpsStore.getSnapshot().scope, input, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.financeCompletionList, (event) => {
    assertAuthorized(event, 'finance.ledger', 'read');
    return financeCompletionStore.list(revenueOpsStore.getSnapshot().scope);
  });
  ipcMain.handle(IPC_CHANNELS.financeCompletionSave, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'finance.ledger', 'update');
    const input = financeCompletionSaveSchema.parse(payload);
    return financeCompletionStore.save(revenueOpsStore.getSnapshot().scope, input.id, input.snapshot as unknown as import('../domain/finance-completion').FinanceCompletionSnapshot, actor.userId, input.status, input.expectedVersion);
  });

  ipcMain.handle(IPC_CHANNELS.automationListRuns, (event) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    return automationRunStore.list(revenueOpsStore.getSnapshot().scope);
  });
  ipcMain.handle(IPC_CHANNELS.automationProposeRun, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = automationProposeSchema.parse(payload);
    return automationRunStore.save(revenueOpsStore.getSnapshot().scope, proposeAutomationRun({ ...input, scope: revenueOpsStore.getSnapshot().scope, requestedBy: actor.userId }, kernelStore.getSnapshot()));
  });
  ipcMain.handle(IPC_CHANNELS.automationApproveRun, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = automationIdSchema.parse(payload);
    return automationRunStore.approve(revenueOpsStore.getSnapshot().scope, input.id, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.automationStartRun, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = automationIdSchema.parse(payload);
    return automationRunStore.start(revenueOpsStore.getSnapshot().scope, input.id, actor.userId);
  });
  ipcMain.handle(IPC_CHANNELS.automationRetryRun, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = automationRetrySchema.parse(payload);
    return automationRunStore.retry(revenueOpsStore.getSnapshot().scope, input.id, actor.userId, input.reason);
  });
  ipcMain.handle(IPC_CHANNELS.automationCompleteRun, (event, payload: unknown) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    const input = automationCompleteSchema.parse(payload);
    return automationRunStore.complete(revenueOpsStore.getSnapshot().scope, input.id, { status: input.status, completedAt: input.completedAt, outcomeReference: input.outcomeReference, failureReason: input.failureReason, expectedVersion: input.expectedVersion });
  });
  ipcMain.handle(IPC_CHANNELS.automationScheduleList, (event) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    return automationScheduleStore.list(revenueOpsStore.getSnapshot().scope);
  });
  ipcMain.handle(IPC_CHANNELS.automationScheduleTriggerHistory, (event) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    return automationScheduleStore.listTriggerHistory(revenueOpsStore.getSnapshot().scope);
  });
  ipcMain.handle(IPC_CHANNELS.automationScheduleFailures, (event) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    return automationScheduleStore.listFailures(revenueOpsStore.getSnapshot().scope);
  });
  ipcMain.handle(IPC_CHANNELS.automationScheduleResolveFailure, (event, payload: unknown) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    const input = automationScheduleFailureSchema.parse(payload);
    return automationScheduleStore.resolveFailure(revenueOpsStore.getSnapshot().scope, input.id, input.resolutionReference);
  });
  ipcMain.handle(IPC_CHANNELS.automationScheduleOperations, (event) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    const scope = revenueOpsStore.getSnapshot().scope;
    return buildSchedulerOperations(automationScheduleStore.list(scope), automationScheduleStore.listFailures(scope), new Date().toISOString(), undefined, automationScheduleStore.listTriggerHistory(scope), automationScheduleStore.listActions(scope));
  });
  ipcMain.handle(IPC_CHANNELS.automationScheduleRetryFailure, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = automationScheduleActionSchema.parse(payload);
    const scope = revenueOpsStore.getSnapshot().scope;
    return executeSchedulerRetry(scope, input.id, actor.userId, input.reason, automationScheduleStore, automationRunStore, kernelStore.getSnapshot());
  });
  ipcMain.handle(IPC_CHANNELS.automationScheduleAcknowledgeEscalation, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = automationScheduleActionSchema.parse(payload);
    return acknowledgeSchedulerEscalation(revenueOpsStore.getSnapshot().scope, input.id, actor.userId, input.reason, automationScheduleStore);
  });
  ipcMain.handle(IPC_CHANNELS.automationScheduleActions, (event) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    return automationScheduleStore.listActions(revenueOpsStore.getSnapshot().scope);
  });
  ipcMain.handle(IPC_CHANNELS.automationScheduleSave, (event, payload: unknown) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    const input = automationScheduleSchema.parse(payload);
    const scope = revenueOpsStore.getSnapshot().scope;
    if (input.scope.companyId !== scope.companyId || input.scope.branchId !== scope.branchId) throw new Error('Automation schedule is outside the active scope.');
    return automationScheduleStore.save(scope, input);
  });
  ipcMain.handle(IPC_CHANNELS.automationScheduleEvaluate, (event, payload: unknown) => {
    assertAuthorized(event, 'operations.workspace', 'read');
    const input = automationScheduleEvaluateSchema.parse(payload);
    return automationScheduleStore.evaluate(revenueOpsStore.getSnapshot().scope, input.id, input.now ? new Date(input.now) : new Date());
  });
  ipcMain.handle(IPC_CHANNELS.automationScheduleTick, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'operations.workspace', 'read');
    const input = automationScheduleTickSchema.parse(payload);
    const scope = revenueOpsStore.getSnapshot().scope;
    return runAutomationSchedulerTick(scope, automationScheduleStore, automationRunStore, kernelStore.getSnapshot(), actor.userId, input?.now ? new Date(input.now) : new Date());
  });

  ipcMain.handle(IPC_CHANNELS.kernelCreateCompany, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'kernel.company', 'admin');
    return kernelStore.addCompany(createCompanySchema.parse(payload), actor.userId);
  });

  ipcMain.handle(IPC_CHANNELS.kernelUpdateTenantIdentity, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'kernel.tenant', 'admin');
    return kernelStore.updateTenantIdentity(
      updateTenantIdentitySchema.parse(payload),
      actor.userId,
    );
  });

  ipcMain.handle(IPC_CHANNELS.kernelUpdateCompany, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'kernel.company', 'admin');
    const input = updateCompanySchema.parse(payload);
    return kernelStore.updateCompany(input, actor.userId).then((snapshot) => {
      authService.revokeSessionsForUsers(kernelStore.getActiveUserIdsForCompany(input.id));
      return snapshot;
    });
  });

  ipcMain.handle(IPC_CHANNELS.kernelCreateBranch, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'kernel.branch', 'admin');
    return kernelStore.addBranch(
      createBranchSchema.parse(payload),
      actor.userId,
    );
  });

  ipcMain.handle(IPC_CHANNELS.kernelUpdateBranch, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'kernel.branch', 'admin');
    const input = updateBranchSchema.parse(payload);
    return kernelStore.updateBranch(input, actor.userId).then((snapshot) => {
      authService.revokeSessionsForUsers(kernelStore.getActiveUserIdsForBranch(input.id));
      return snapshot;
    });
  });

  ipcMain.handle(IPC_CHANNELS.kernelCreateUser, async (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'kernel.user', 'admin');
    const input = createUserSchema.parse(payload);
    const snapshot = await kernelStore.addUser(input, actor.userId);
    const user = snapshot.users.find(
      ({ email }) => email.toLowerCase() === input.email.toLowerCase(),
    );
    if (!user) throw new Error('The provisioned business user could not be resolved.');
    await authService.provisionUser(
      user.id,
      user.email,
      user.displayName,
      input.temporaryPassword,
    );
    return snapshot;
  });

  ipcMain.handle(IPC_CHANNELS.kernelCreateRole, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'kernel.role', 'admin');
    return kernelStore.addRole(createRoleSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(
    IPC_CHANNELS.kernelUpdateRolePolicy,
    async (event, payload: unknown) => {
      const actor = assertAuthorized(event, 'kernel.role', 'admin');
      const input = updateRolePolicySchema.parse(payload);
      const snapshot = await kernelStore.updateRolePolicy(input, actor.userId);
      authService.revokeSessionsForUsers(kernelStore.getActiveUserIdsForRoles([input.id]));
      return snapshot;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.kernelUpsertFieldAccessRule,
    async (event, payload: unknown) => {
      const actor = assertAuthorized(event, 'kernel.field-access', 'admin');
      const input = upsertFieldAccessRuleSchema.parse(payload);
      const snapshot = await kernelStore.upsertFieldAccessRule(input, actor.userId);
      authService.revokeSessionsForUsers(kernelStore.getActiveUserIdsForRoles([input.roleId]));
      return snapshot;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.kernelUpdateApprovalPolicy,
    async (event, payload: unknown) => {
      const actor = assertAuthorized(event, 'kernel.approval-policy', 'admin');
      const input = updateApprovalPolicySchema.parse(payload);
      const affectedRoles = [...new Set([
        ...kernelStore.getApprovalPolicyApproverRoleIds(input.id),
        ...input.approverRoleIds,
      ])];
      const snapshot = await kernelStore.updateApprovalPolicy(input, actor.userId);
      authService.revokeSessionsForUsers(kernelStore.getActiveUserIdsForRoles(affectedRoles));
      return snapshot;
    },
  );

  ipcMain.handle(IPC_CHANNELS.kernelAssignRole, async (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'kernel.user', 'admin');
    const input = assignRoleSchema.parse(payload);
    const snapshot = await kernelStore.addRoleToUser(input, actor.userId);
    authService.revokeSessionsForUsers([input.userId]);
    return snapshot;
  });

  ipcMain.handle(IPC_CHANNELS.kernelIssueNumber, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'kernel.number-sequence', 'admin');
    return kernelStore.issueNumber(issueNumberSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(
    IPC_CHANNELS.kernelTransitionWorkflow,
    (event, payload: unknown) => {
      const actor = assertAuthorized(event, 'kernel.workflow', 'update');
      return kernelStore.moveWorkflow(transitionWorkflowSchema.parse(payload), actor.userId);
    },
  );

  ipcMain.handle(IPC_CHANNELS.kernelDecideApproval, (event, payload: unknown) => {
    const actor = assertAuthorized(event, 'kernel.approval', 'approve');
    return kernelStore.decideApproval(decideApprovalSchema.parse(payload), actor.userId);
  });

  ipcMain.handle(
    IPC_CHANNELS.kernelRegisterCustomField,
    (event, payload: unknown) => {
      const actor = assertAuthorized(event, 'kernel.custom-field', 'admin');
      return kernelStore.addCustomField(
        registerCustomFieldSchema.parse(payload),
        actor.userId,
      );
    },
  );

}
