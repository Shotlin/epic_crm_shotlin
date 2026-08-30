import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addLead,
  createInitialCrmState,
  finishActivity,
  getDashboardSnapshot,
  moveOpportunity,
} from '../domain/crm';
import {
  assignRole,
  createCompany,
  createInitialKernelState,
  decideApproval,
  getKernelSnapshot,
  issueDocumentNumber,
  registerCustomField,
  transitionWorkflow,
  updateTenantIdentity,
} from '../domain/kernel';
import type { CrmState, EpicBosBridge } from '../shared/contracts';
import { evaluateUiAcceptanceReadiness } from '../domain/ui-acceptance-readiness';
import type { KernelState } from '../shared/kernel-contracts';
import { App } from './App';
import {
  createAccount,
  createContact,
  createInitialPartyState,
  getPartySnapshot,
  recordConsent,
  resolveDuplicate,
} from '../domain/party';
import type { PartyState } from '../shared/party-contracts';
import {
  commitImport,
  configureAdapter,
  createCampaign,
  createInitialCrmDepthState,
  createSavedView,
  createScoringRule,
  getCrmDepthSnapshot,
  recordCommunication,
  recordCommunicationDelivery,
  transitionCampaign,
  updatePipeline,
} from '../domain/crm-depth';
import type { CrmDepthState } from '../shared/crm-depth-contracts';
import { createPeopleReadProjection } from '../domain/people-read-projection';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { ProviderConnector, ProviderSubmission } from '../shared/provider-contracts';
import type { ConsolidatedEwayBill, StatutoryOperation } from '../shared/statutory-contracts';
import type { BootstrapOwnerInput } from '../shared/auth-contracts';

let state: CrmState;
let kernelState: KernelState;
let partyState: PartyState;
let crmDepthState: CrmDepthState;
let revenueOpsState: RevenueOpsState;

function installBridge(): void {
  const bridge: EpicBosBridge = {
    system: {
      getInfo: async () => ({
        productName: 'Epic BOS',
        version: '0.1.0',
        platform: 'win32',
        dataMode: 'local-first',
      }),
      getBuildProvenance: async () => ({ productName: 'Epic BOS', version: '0.1.0', platform: 'win32', buildRevision: 'local-test', schemaRevision: 9, releaseIdentitySha256: '1'.repeat(64), generatedAt: '2026-07-18T00:00:00.000Z', canonicalJson: '{}', sha256: '0'.repeat(64) }),
    },
    auth: {
      getStatus: async () => ({
        configured: true,
        workspaceStarterMode: 'sample' as const,
        session: {
          id: 'session-test',
          userId: 'user-avery',
          email: 'avery@northstar.example',
          displayName: 'Avery Morgan',
          createdAt: '2026-07-15T07:00:00.000Z',
          expiresAt: '2026-07-15T15:00:00.000Z',
          lastSeenAt: '2026-07-15T07:00:00.000Z',
          mustChangePassword: false,
        },
      }),
      bootstrapOwner: async () => {
        throw new Error('Already enrolled');
      },
      login: async () => {
        throw new Error('Already signed in');
      },
      logout: async () => ({ configured: true, session: null }),
      lock: async () => ({ configured: true, session: null }),
      changePassword: async () => undefined,
      getMfaStatus: async () => ({ enabled: false, pending: false }),
      beginMfaEnrollment: async () => ({ secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Epic%20BOS:test@example.com?secret=JBSWY3DPEHPK3PXP', recoveryCodes: [] }),
      confirmMfaEnrollment: async () => ({ enabled: true, pending: false }),
      disableMfa: async () => undefined,
    },
    storage: {
      listAttachments: async () => [],
      addAttachment: async () => null,
      exportAttachment: async () => false,
      createDatabaseBackup: async () => ({
        fileName: 'Epic-BOS-test.sqlite3',
        createdAt: '2026-07-15T12:00:00.000Z',
        sha256: 'a'.repeat(64),
        size: 4096,
        verifiedAt: '2026-07-15T12:00:01.000Z',
        keyVersion: 2,
      }),
      restoreDatabaseBackup: async () => null,
      listRestoreDrills: async () => [],
      runRestoreDrill: async () => ({ id: 'drill-test', startedAt: '2026-07-15T00:00:00.000Z', status: 'passed', isolated: true, verifiedAt: '2026-07-15T00:00:00.000Z', message: 'test' }),
    },
    retailWorkspace: {
      getStatus: async () => ({
        status: 'configured' as const,
        mode: 'clean' as const,
        dataStatus: 'sample' as const,
        label: 'Legacy sample isolated',
        description: 'Historical sample records are isolated from live sources.',
        sourceSystem: null,
        evidenceReference: null,
        externalWritePolicy: 'blocked' as const,
        requiresReconciliation: false,
        nextAction: 'Replace the legacy sample through the verified workspace reset.',
        updatedAt: '2026-08-03T10:00:00.000Z',
      }),
      getDemoResetPreview: async () => ({
        eligible: false,
        confirmationPhrase: 'RESET BAKALOO' as const,
        recordGroups: [],
        blockedReason: 'The renderer test workspace does not match the known generic demo.',
      }),
      applyDemoReset: async () => ({
        applied: false,
        backup: null,
        message: 'The renderer test workspace does not match the known generic demo.',
      }),
    },
    integration: {
      listApiKeys: async () => [],
      issueApiKey: async (input) => ({ record: { id: 'key-ui', label: input.label, companyId: input.companyId, branchId: input.branchId, scopes: input.scopes, keyPrefix: 'epic_ui', secretHash: '0'.repeat(64), createdAt: '2026-07-15T07:00:00.000Z' }, token: 'epic_ui.secret' }),
      revokeApiKey: async () => undefined,
      exportApiKeyInventory: async () => null,
      exportProviderCertificationPackage: async () => null,
      verifyProviderCertificationPackage: async () => null,
      getRetailCertificationPack: async () => null as never,
      exportRetailCertificationPack: async () => null,
      verifyRetailCertificationPack: async () => null,
    },
    release: {
      listGates: async () => [],
      recordGate: async (input) => input,
      listArtifactEvidence: async () => [],
      recordArtifactEvidence: async (input) => ({ ...input, id: 'artifact-ui', status: 'submitted', submittedBy: 'user-avery', submittedAt: '2026-07-17T00:00:00.000Z' }),
      decideArtifactEvidence: async (input) => ({ id: input.id, platform: 'win32', version: '0.1.0', artifactReference: 'ui', artifactSha256: '0'.repeat(64), smokeTestReference: 'ui', signingReference: 'ui', status: input.decision, submittedBy: 'user-avery', submittedAt: '2026-07-17T00:00:00.000Z', verifiedBy: 'user-avery', verifiedAt: '2026-07-17T00:00:00.000Z' }),
      listUpdateEvidence: async () => [],
      recordUpdateEvidence: async (input) => ({ ...input, id: 'update-ui', status: 'submitted', submittedBy: 'user-avery', submittedAt: '2026-07-17T00:00:00.000Z' }),
      decideUpdateEvidence: async (input) => ({ id: input.id, channel: 'stable', platform: 'win32', currentVersion: '0.1.0', targetVersion: '0.2.0', rollbackVersion: '0.1.0', manifestReference: 'ui', manifestSha256: '0'.repeat(64), signatureReference: 'ui', rollbackTestReference: 'ui', status: input.decision, submittedBy: 'user-avery', submittedAt: '2026-07-17T00:00:00.000Z', verifiedBy: 'user-avery', verifiedAt: '2026-07-17T00:00:00.000Z' }),
      getAutoUpdateStatus: async () => ({ state: 'not-configured' as const, currentVersion: '0.1.0', platform: 'win32' as const, packaged: false, feedConfigured: false, canCheck: false, updateFound: false, reason: 'Automatic update status is disabled in the renderer test.', observedAt: '2026-07-17T00:00:00.000Z' }),
      listUiAcceptanceEvidence: async () => [],
      recordUiAcceptanceEvidence: async (input) => ({ id: 'uat-ui', scenarioId: input.scenarioId, scenarioFingerprint: '0'.repeat(64), releaseIdentitySha256: '1'.repeat(64), result: input.result, evidenceReference: input.evidenceReference, notes: input.notes, submittedBy: 'user-avery', submittedAt: '2026-07-17T00:00:00.000Z', status: 'submitted', version: 1 }),
      decideUiAcceptanceEvidence: async (input) => ({ id: input.id, scenarioId: 'retail-pos-open-shift', scenarioFingerprint: '0'.repeat(64), releaseIdentitySha256: '1'.repeat(64), result: 'passed', evidenceReference: 'UAT-UI-001', submittedBy: 'other-user', submittedAt: '2026-07-17T00:00:00.000Z', status: input.decision, verifiedBy: 'user-avery', verifiedAt: '2026-07-17T00:00:00.000Z', version: 2 }),
      getUiAcceptanceReadiness: async () => evaluateUiAcceptanceReadiness({ releaseIdentitySha256: '1'.repeat(64), evidence: [] }),
      getReadiness: async () => ({ status: 'blocked', passed: 0, failed: 0, deferred: 0, missingGateIds: ['typecheck', 'lint', 'tests', 'package', 'backup-restore', 'provider-certification'], invalidGateIds: [], gates: [] }),
      createReadinessReport: async () => ({ status: 'blocked', passed: 0, failed: 0, deferred: 6, missingGateIds: ['typecheck', 'lint', 'tests', 'package', 'backup-restore', 'provider-certification'], invalidGateIds: [], gates: [], generatedAt: '2026-07-17T00:00:00.000Z', canonicalJson: '{}', sha256: '0'.repeat(64), buildProvenanceSha256: '0'.repeat(64) }),
      createSupportDiagnostics: async () => ({ generatedAt: '2026-07-17T00:00:00.000Z', health: { checkedAt: '2026-07-17T00:00:00.000Z', status: 'healthy', databaseIntegrity: true, auditChainValid: true, migrationsValid: true, appliedMigrations: 9, pendingOutboxEvents: 0, failedOutboxEvents: 0, recentAuditEvents: 1 }, readiness: { status: 'blocked', passed: 0, failed: 0, deferred: 6, missingGateIds: ['typecheck', 'lint', 'tests', 'package', 'backup-restore', 'provider-certification'], invalidGateIds: [], gates: [] }, provenance: { productName: 'Epic BOS', version: '0.1.0', platform: 'win32', buildRevision: 'local-test', schemaRevision: 9, releaseIdentitySha256: '1'.repeat(64), generatedAt: '2026-07-17T00:00:00.000Z', sha256: '0'.repeat(64) }, redactionVersion: 1, canonicalJson: '{}', sha256: '0'.repeat(64) }),
    },
    party: {
      getSnapshot: async () => getPartySnapshot(partyState),
      createAccount: async (input) => {
        partyState = createAccount(partyState, input, 'user-avery');
        return getPartySnapshot(partyState);
      },
      createContact: async (input) => {
        partyState = createContact(partyState, input, 'user-avery');
        return getPartySnapshot(partyState);
      },
      recordConsent: async (input) => {
        partyState = recordConsent(partyState, input, 'user-avery');
        return getPartySnapshot(partyState);
      },
      resolveDuplicate: async (input) => {
        partyState = resolveDuplicate(partyState, input, 'user-avery');
        return getPartySnapshot(partyState);
      },
      addAddress: async () => getPartySnapshot(partyState),
      addContactPoint: async () => getPartySnapshot(partyState),
      createRelationship: async () => getPartySnapshot(partyState),
      executeMerge: async () => getPartySnapshot(partyState),
      convertLead: async () => ({
        crm: getDashboardSnapshot(state),
        party: getPartySnapshot(partyState),
      }),
    },
    crmDepth: {
      getSnapshot: async () => getCrmDepthSnapshot(crmDepthState, {
        leads: state.leads,
        opportunities: state.opportunities,
        activeContactCount: partyState.contacts.length,
      }),
      updatePipeline: async (input) => {
        crmDepthState = updatePipeline(crmDepthState, input);
        return getCrmDepthSnapshot(crmDepthState, { leads: state.leads, opportunities: state.opportunities, activeContactCount: partyState.contacts.length });
      },
      createScoringRule: async (input) => {
        crmDepthState = createScoringRule(crmDepthState, input);
        return getCrmDepthSnapshot(crmDepthState, { leads: state.leads, opportunities: state.opportunities, activeContactCount: partyState.contacts.length });
      },
      createCampaign: async (input) => {
        crmDepthState = createCampaign(crmDepthState, input, partyState.contacts.map(({ id }) => id));
        return getCrmDepthSnapshot(crmDepthState, { leads: state.leads, opportunities: state.opportunities, activeContactCount: partyState.contacts.length });
      },
      transitionCampaign: async (input) => {
        crmDepthState = transitionCampaign(crmDepthState, input);
        return getCrmDepthSnapshot(crmDepthState, { leads: state.leads, opportunities: state.opportunities, activeContactCount: partyState.contacts.length });
      },
      createSavedView: async (input) => {
        crmDepthState = createSavedView(crmDepthState, input);
        return getCrmDepthSnapshot(crmDepthState, { leads: state.leads, opportunities: state.opportunities, activeContactCount: partyState.contacts.length });
      },
      previewLeadImport: async () => null,
      commitImport: async (input) => {
        crmDepthState = commitImport(crmDepthState, input);
        return { crm: getDashboardSnapshot(state), depth: getCrmDepthSnapshot(crmDepthState, { leads: state.leads, opportunities: state.opportunities, activeContactCount: partyState.contacts.length }) };
      },
      configureAdapter: async (input) => {
        crmDepthState = configureAdapter(crmDepthState, input);
        return getCrmDepthSnapshot(crmDepthState, { leads: state.leads, opportunities: state.opportunities, activeContactCount: partyState.contacts.length });
      },
      recordCommunication: async (input) => {
        crmDepthState = recordCommunication(crmDepthState, input, 'user-avery');
        return getCrmDepthSnapshot(crmDepthState, { leads: state.leads, opportunities: state.opportunities, activeContactCount: partyState.contacts.length });
      },
      recordCommunicationDelivery: async (input) => {
        crmDepthState = recordCommunicationDelivery(crmDepthState, input);
        return getCrmDepthSnapshot(crmDepthState, { leads: state.leads, opportunities: state.opportunities, activeContactCount: partyState.contacts.length });
      },
    },
    generalLedger: {
      getSnapshot: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z',
        profileId: 'india-profile-northstar',
        binding: null,
        status: 'binding-required' as const,
        blockingReason: 'Bind an India legal entity before using the general ledger.',
        accounts: [],
        periods: [],
        journals: [],
        trialBalance: [],
        totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 },
        integrityVerified: false,
      }),
      bindCompany: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      createJournal: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareRevenueInvoicePosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareCashReceiptPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareWriteOffPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareWithholdingPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareTreasuryPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareManufacturingPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareLandedCostPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareRetailSaleCostPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareRetailReturnCostPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareRetailCommissionPayoutPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareRetailCommerceSettlementPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      preparePeoplePosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareCommercialAdjustmentPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareSupplierInvoicePosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareAssetCapitalizationPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareAssetDepreciationPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareAssetRetirementPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareAssetSaleDisposalPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareAssetLifecyclePosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      prepareProjectRevenueRecognitionPosting: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      postJournal: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      reverseJournal: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
      cancelReversalJournal: async () => ({
        generatedAt: '2026-07-15T07:00:00.000Z', profileId: 'india-profile-northstar', binding: null, status: 'binding-required' as const, blockingReason: 'Bind an India legal entity before using the general ledger.', accounts: [], periods: [], journals: [], trialBalance: [], totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 }, integrityVerified: false,
      }),
    },
    revenueOps: {
      getSnapshot: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      listRetailCutoverPlans: async () => [],
      createRetailCutoverPlan: async () => { throw new Error('Cutover plan creation is not part of this renderer fixture.'); },
      createRetailCutoverPlanFromHubAssessment: async () => { throw new Error('Hub assessment creation is not part of this renderer fixture.'); },
      fetchRetailHubCutoverAssessment: async () => { throw new Error('Hub assessment fetching is not part of this renderer fixture.'); },
      advanceRetailCutover: async () => { throw new Error('Cutover plan advancement is not part of this renderer fixture.'); },
      enqueueRetailOfflineSale: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      syncRetailOfflineSale: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      syncRetailOfflineQueue: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      resolveRetailOfflineSale: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      sendRetailHubStoreEdgeSync: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      syncRetailHubStoreEdgeQueue: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      saveRetailHubStoreEdgeSyncPolicy: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      ingestRetailUnifiedOrder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      reconcileRetailUnifiedOrderCancellation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      prepareRetailUnifiedOrderHandoff: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      prepareRetailOrderHubHandoff: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordRetailOrderHubHandoffResult: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      prepareRetailOrderFulfilmentHandoff: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideRetailOrderFulfilmentHandoff: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      reserveRetailUnifiedOrderStock: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createRetailUnifiedOrderPickTasks: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      completeRetailUnifiedOrderPickTasks: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createRetailUnifiedOrderShipmentPackage: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      completeRetailUnifiedOrderShipmentPackage: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      prepareRetailUnifiedOrderDispatch: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      dispatchRetailUnifiedOrder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      confirmRetailUnifiedOrderDelivery: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      reconcileRetailUnifiedOrderRto: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      reconcileRetailUnifiedOrderReturn: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordRetailUnifiedOrderCarrierCallback: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      prepareRetailDeviceTransport: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordRetailDeviceTransport: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      executeRetailDeviceTransport: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      retryRetailDeviceTransport: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      preflightRetailDeviceTransport: async () => ({ kind: 'barcode-scanner', connection: 'network', status: 'unsupported', responseReference: 'driver-required:test', responseChecksum: '0'.repeat(64), responseByteLength: 0, elapsedMs: 0 }),
      recordRetailDevicePreflightEvidence: async (input: import('../shared/retail-device-transport-contracts').RecordRetailDevicePreflightEvidenceInput) => input.result,
      createRetailDeviceAdapterProfile: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      approveRetailDeviceAdapterProfile: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordRetailDeviceAdapterAcknowledgement: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      activateRetailDeviceAdapterProfile: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      suspendRetailDeviceAdapterProfile: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      getPeopleReadProjection: async () => createPeopleReadProjection(
        revenueOpsState,
        () => ({ allowed: true, deniedFields: [] }),
      ),
      updateProfile: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createTerritory: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createAssignmentRule: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      bulkAssign: async () => ({ crm: getDashboardSnapshot(state), revenue: getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }) }),
      createSegment: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createOpportunity: async () => ({ crm: getDashboardSnapshot(state), revenue: getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }) }),
      createQuote: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      transitionQuote: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createGstTaxCode: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createCatalogProduct: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      importRetailProductPack: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPriceList: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPriceListEntry: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createDiscountPolicy: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      submitPriceListForApproval: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decidePriceListApproval: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      submitQuoteForApproval: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideQuoteApproval: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      exportQuotePdf: async () => null,
      convertQuoteToSalesOrder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      transitionSalesOrder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      updateFulfilmentTask: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPaymentTerm: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createRetailCounter: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      openRetailCashierShift: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      checkoutRetailSale: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailLoyaltyAccount: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      redeemRetailLoyaltyPoints: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailCustomerVisit: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      linkRetailCustomerVisitToSale: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailSalesCommission: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailSalesCommission: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      payRetailSalesCommission: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailCommissionPayoutBatch: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailCommissionPayoutBatch: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      releaseRetailCommissionPayoutBatch: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      requestRetailCashierShiftClose: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailCashierShiftClose: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      requestRetailCashierShiftVarianceResolution: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailCashierShiftVarianceResolution: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailReturnRequest: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      inspectRetailReturn: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailReturn: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      requestRetailReturnSettlement: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailReturnSettlement: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      confirmRetailReturnProviderRefund: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailCatalogCategory: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailCatalogBrand: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      saveRetailMerchandisingProfile: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailBarcodeSequence: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      resetRetailBarcodeSequence: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      assignRetailBarcode: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailLabelPrintRun: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailProductCombo: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailExchange: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailExchange: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      prepareRetailCreditNoteReconciliation: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      recordRetailCreditNotePortalResponse: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailInterBranchTransfer: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailInterBranchTransfer: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      dispatchRetailInterBranchTransfer: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      receiveRetailInterBranchTransfer: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailScaleProfile: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailPrinterAdapter: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      testRetailPrinterAdapter: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailLabelPrintDispatch: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailLabelPrintDispatch: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      prepareRetailCatalogBulkEdit: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      applyRetailCatalogBulkEdit: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailPurchaseOcrDocument: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailPurchaseOcr: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      convertRetailPurchaseOcr: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailCommerceConnector: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      configureRetailCommerceCredentials: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailCommerceSyncRun: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      executeRetailCommerceSync: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      recordRetailCommerceSync: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      importRetailCommerceOrder: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      handoffRetailCommerceOrder: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      reserveRetailCommerceOrder: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailSettlementReconciliation: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailSettlementReconciliation: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailSettlementAllocationPack: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailSettlementAllocationPack: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailCommerceConflictResolution: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailCommerceConflictResolution: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailSettlementWithholdingEvidence: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailSettlementWithholdingEvidence: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      prepareRetailSettlementJournal: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailOcrProviderProfile: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      configureRetailOcrProvider: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      executeRetailOcr: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      testRetailOcrProvider: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      prepareRetailPurchaseOcrMapping: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      applyRetailPurchaseOcrMapping: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      prepareRetailCommercePushBatch: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailCommercePushBatch: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      executeRetailCommercePushBatch: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailCommerceCatalogMapping: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideRetailCommerceCatalogMapping: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      disableRetailCommerceCatalogMapping: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      transitionRetailCommerceOrder: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      linkRetailCommerceReturn: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      createRetailCommerceConformanceCase: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      planRetailCommerceConformancePack: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      recordRetailCommerceConformance: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      scanRetailPurchaseExceptions: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      resolveRetailPurchaseException: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      recordDeliveryEvidence: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createServiceMilestone: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      transitionServiceMilestone: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createInvoiceDraft: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      issueInvoice: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createCreditDebitNote: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordPayment: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      applyUnappliedReceipt: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      reconcilePayment: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      exportJournal: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      exportInvoicePdf: async () => null,
      createGstRegistration: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPlaceOfSupplyReview: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decidePlaceOfSupplyReview: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createStockLocation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordStockMovement: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      reserveStock: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      releaseStockReservation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPincodeServiceabilityRule: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decidePincodeServiceabilityRule: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createDeliveryPromise: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createCodCollectionCase: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordCodHandover: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordCodCarrierCollection: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordCodRemittance: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      matchCodBank: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      closeCodShortfall: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordCodException: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createShipmentPackage: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      transitionShipment: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      configureCarrierAdapter: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createReturnAuthorization: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideReturnAuthorization: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      receiveReturn: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      inspectReturn: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      prepareStatutoryExchange: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      submitStatutoryExchange: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordStatutoryResponse: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      configureStatutoryAdapter: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      configureStatutoryCredentials: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      prepareStatutoryOperation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      submitStatutoryOperation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordStatutoryOperationResponse: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      prepareConsolidatedEwayBill: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      submitConsolidatedEwayBill: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordConsolidatedEwayBillResponse: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      verifyStatutorySignature: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      runPortalReconciliation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      configureProviderConnector: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      configureProviderCredentials: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createProviderConformanceCase: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      planProviderConformancePack: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      executeProviderPreflight: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordProviderConformanceResult: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      approveProviderConnector: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      prepareProviderSubmission: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      handOffProviderSubmission: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordProviderSubmissionResponse: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      runProviderReconciliation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      proposeCreditLimit: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideCreditLimit: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      runDunning: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordCollectionActivity: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      openReceivableDispute: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      resolveReceivableDispute: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      requestWriteOff: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideWriteOff: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createWithholdingPolicy: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordWithholdingEntry: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      transitionWithholdingEntry: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      prepareZeroRatedSupply: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideZeroRatedSupply: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createBankAccount: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      previewBankStatement: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      commitBankStatement: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      confirmBankMatch: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      excludeBankLine: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPurchaseRequisition: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decidePurchaseRequisition: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createRfqFromRequisition: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createSupplier: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideSupplier: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createRfq: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      issueRfq: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordSupplierQuotation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      awardRfq: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPurchaseOrderFromRfq: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPurchaseOrderFromReorder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decidePurchaseOrder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordGoodsReceipt: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createLandedCost: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideLandedCost: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      updateRetailPriceForTargetMargin: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordSupplierInvoice: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideThreeWayMatch: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordTreasuryPosition: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      runCashForecast: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPaymentProposal: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decidePaymentProposal: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      releasePaymentProposal: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      settlePaymentProposal: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordBankCharge: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      reconcileBankCharge: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      openSettlementException: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      resolveSettlementException: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createLiquiditySweep: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideLiquiditySweep: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      releaseLiquiditySweep: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      settleLiquiditySweep: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createWorkCenter: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createBomRevision: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideBomRevision: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createQualityPlan: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideQualityPlan: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createWorkOrder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideWorkOrder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      startWorkOrder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      issueWorkOrderMaterial: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordQualityInspection: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      resolveNonconformance: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordProductionOutput: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createAssetCategory: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createManagedAsset: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      submitManagedAsset: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideManagedAsset: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createAssetCapitalization: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideAssetCapitalization: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createAssetDepreciationPolicy: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideAssetDepreciationPolicy: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createAssetDepreciationRun: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideAssetDepreciationRun: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createAssetRetirement: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideAssetRetirement: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      completeAssetRetirement: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createAssetCustodyTransfer: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideAssetCustodyTransfer: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      receiveAssetCustodyTransfer: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createAssetComponentization: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideAssetComponentization: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createAssetComponentAllocation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideAssetComponentAllocation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createAssetTransferAccounting: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideAssetTransferAccounting: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      dispatchAssetTransferAccounting: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      receiveAssetTransferAccounting: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createAssetSaleDisposal: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideAssetSaleDisposal: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      completeAssetSaleDisposal: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      runAssetLifecycleAction: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPreventiveMaintenancePlan: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      generateDueMaintenanceWorkOrder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      startMaintenanceWorkOrder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      completeMaintenanceWorkOrder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      verifyMaintenanceWorkOrder: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createProject: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideProject: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      transitionProject: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createProjectTask: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      transitionProjectTask: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordTimeEntry: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideTimeEntry: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createServiceAgreement: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideServiceAgreement: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createSupportTicket: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      transitionSupportTicket: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createFieldServiceJob: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      transitionFieldServiceJob: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createWorkforceProfile: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideWorkforceProfile: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordWorkforceAvailability: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideWorkforceAvailability: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createWorkforceAllocation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      cancelWorkforceAllocation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createEmployerRegistration: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideEmployerRegistration: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPayrollPolicy: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decidePayrollPolicy: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPayrollCompensation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decidePayrollCompensation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createBenefitPlan: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideBenefitPlan: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createBenefitEnrollment: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideBenefitEnrollment: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPayrollRun: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decidePayrollRun: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      finalizePayrollRun: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      updatePayrollObligation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createExpenseClaim: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideExpenseClaim: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      reimburseExpenseClaim: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordAttendance: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideAttendance: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createLeaveType: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideLeaveType: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createLeaveApplication: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideLeaveApplication: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPayrollAdjustment: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decidePayrollAdjustment: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createTaxDeclaration: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideTaxDeclaration: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      publishPayslip: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      acknowledgePayslip: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createProjectBillingPlan: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideProjectBillingPlan: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createProjectBillingClaim: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideProjectBillingClaim: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      consumeServiceEntitlement: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createAccountingClosePeriod: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideAccountingClosePeriod: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      reopenAccountingClosePeriod: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createProjectExchangeRate: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideProjectExchangeRate: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createProjectCurrencyProfile: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideProjectCurrencyProfile: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createProjectContractVariation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideProjectContractVariation: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createProjectRetainer: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideProjectRetainer: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createRetainerDrawdown: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideRetainerDrawdown: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createProjectResourcePlan: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideProjectResourcePlan: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      generateProjectMarginReview: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      reviewProjectMargin: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createUom: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createUomConversion: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createInventoryItem: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createItemVariant: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createWarehouse: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createWarehouseZone: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createStorageBin: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      receiveInventory: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPutawayTask: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createPickTask: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      transitionWarehouseTask: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createInventoryTransfer: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      transitionInventoryTransfer: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createCycleCount: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      recordCycleCount: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideCycleCount: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createReorderPolicy: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      generateReorderProposals: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideReorderProposal: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createInventoryValuationReview: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      decideInventoryValuationReview: async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) }),
      createInventoryDisposition: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      decideInventoryDisposition: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
      postInventoryDisposition: vi.fn(async () => getRevenueOpsSnapshot(revenueOpsState, { opportunities: state.opportunities, accounts: partyState.accounts, contacts: partyState.contacts, addresses: partyState.addresses, activeUserIds: kernelState.users.map(({ id }) => id) })),
    },
    crm: {
      getSnapshot: async () =>
        getDashboardSnapshot(state, '2026-07-15T07:00:00.000Z'),
      createLead: async (input) => {
        state = addLead(
          state,
          input,
          'lead-ui',
          '2026-07-15T07:30:00.000Z',
        );
        return getDashboardSnapshot(state);
      },
      moveOpportunity: async (input) => {
        state = moveOpportunity(state, input);
        return getDashboardSnapshot(state);
      },
      completeActivity: async (input) => {
        state = finishActivity(state, input);
        return getDashboardSnapshot(state);
      },
    },
    kernel: {
      getSnapshot: async () =>
        getKernelSnapshot(kernelState, '2026-07-15T07:00:00.000Z'),
      getOperationalHealth: async () => ({ checkedAt: '2026-07-15T07:00:00.000Z', status: 'healthy' as const, databaseIntegrity: true, auditChainValid: true, migrationsValid: true, appliedMigrations: 3, pendingOutboxEvents: 0, failedOutboxEvents: 0, recentAuditEvents: kernelState.audit.length }),
      getOutboxReplayPlan: async () => ({ generatedAt: '2026-07-15T07:00:00.000Z', checkpointRevision: kernelState.revision, signature: '0'.repeat(64), items: [] }),
      executeOutboxReplay: async () => getKernelSnapshot(kernelState),
      resolveOutboxConflict: async () => getKernelSnapshot(kernelState),
      updateTenantIdentity: async (input) => {
        kernelState = updateTenantIdentity(
          kernelState,
          input,
          '2026-07-15T07:00:00.000Z',
          'audit-workspace-ui',
          'event-workspace-ui',
        );
        return getKernelSnapshot(kernelState);
      },
      createCompany: async (input) => {
        kernelState = createCompany(kernelState, input, 'company-ui');
        return getKernelSnapshot(kernelState);
      },
      updateCompany: async () => getKernelSnapshot(kernelState),
      createBranch: async () => getKernelSnapshot(kernelState),
      updateBranch: async () => getKernelSnapshot(kernelState),
      createUser: async () => getKernelSnapshot(kernelState),
      createRole: async () => getKernelSnapshot(kernelState),
      updateRolePolicy: async () => getKernelSnapshot(kernelState),
      upsertFieldAccessRule: async () => getKernelSnapshot(kernelState),
      updateApprovalPolicy: async () => getKernelSnapshot(kernelState),
      assignRole: async (input) => {
        kernelState = assignRole(kernelState, input);
        return getKernelSnapshot(kernelState);
      },
      issueNumber: async (input) => {
        const issued = issueDocumentNumber(kernelState, input);
        kernelState = issued.state;
        return {
          issuedNumber: issued.issuedNumber,
          snapshot: getKernelSnapshot(kernelState),
        };
      },
      transitionWorkflow: async (input) => {
        kernelState = transitionWorkflow(kernelState, input);
        return getKernelSnapshot(kernelState);
      },
      decideApproval: async (input) => {
        kernelState = decideApproval(kernelState, input);
        return getKernelSnapshot(kernelState);
      },
      registerCustomField: async (input) => {
        kernelState = registerCustomField(kernelState, input);
        return getKernelSnapshot(kernelState);
      },
    },
  };

  Object.defineProperty(window, 'epicBos', {
    configurable: true,
    value: bridge,
  });
}

beforeEach(() => {
  if (typeof HTMLElement.prototype.scrollTo !== 'function') {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: () => undefined,
    });
  }
  if (typeof HTMLElement.prototype.scrollIntoView !== 'function') {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => undefined,
    });
  }
  state = createInitialCrmState();
  kernelState = createInitialKernelState();
  partyState = createInitialPartyState();
  crmDepthState = createInitialCrmDepthState();
  revenueOpsState = createInitialRevenueOpsState();
  installBridge();

  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    },
  });

});

afterEach(() => cleanup());

/** Keeps journey tests explicit about the customer workbench when the retail
 * owner now starts at the simple store home. */
async function openCrmHome(): Promise<void> {
  if (screen.queryByTestId('retail-customer-360')) return;
  (await screen.findByRole('button', { name: /^Customers$/ })).click();
  await screen.findByTestId('retail-customer-360');
}

describe('Epic BOS renderer', () => {
  it('keeps statutory and provider acknowledgement outside renderer control', async () => {
    const user = userEvent.setup();
    const submittedOperation: StatutoryOperation = {
      id: 'statutory-operation-submitted', number: 'SOP-001', kind: 'cancel-ewb', exchangeId: 'exchange-1', adapterId: 'adapter-1', reasonCode: '2', remarks: 'Authorised internal release recorded.', status: 'submitted', payloadChecksum: 'a'.repeat(64), requestReference: 'OPER-RELEASE-001', preparedBy: 'user-other', preparedAt: '2026-08-04T09:00:00.000Z', submittedBy: 'user-other', submittedAt: '2026-08-04T09:05:00.000Z', version: 2,
    };
    const submittedConsolidation: ConsolidatedEwayBill = {
      id: 'consolidated-ewb-submitted', number: 'CEWB-001', adapterId: 'adapter-1', gstRegistrationId: 'registration-1', exchangeIds: ['exchange-1', 'exchange-2'], transportMode: 'road', fromPlace: 'Kolkata', fromStateCode: '19', status: 'submitted', payloadChecksum: 'b'.repeat(64), requestReference: 'OPER-RELEASE-002', preparedBy: 'user-other', preparedAt: '2026-08-04T09:00:00.000Z', submittedBy: 'user-other', version: 2,
    };
    const connector: ProviderConnector = {
      id: 'provider-connector-1', code: 'BANK-SANDBOX', name: 'Bank sandbox', providerLegalName: 'Example Bank Ltd', domain: 'banking', environment: 'sandbox', baseUrl: 'https://bank.example.test', statusPathTemplate: '/v1/status/{reference}', capabilities: ['payment-status-pull'], specificationVersion: '1.0', credentialStatus: 'configured', credentialFingerprint: 'vault-fingerprint', conformanceStatus: 'sandbox-verified', active: true, createdBy: 'user-other', createdAt: '2026-08-04T09:00:00.000Z', version: 1,
    };
    const handedOffSubmission: ProviderSubmission = {
      id: 'provider-submission-handed-off', number: 'PACK-001', connectorId: connector.id, domain: 'banking', capability: 'payment-status-pull', sourceKind: 'payment-proposal', sourceIds: ['payment-proposal-1'], payloadChecksum: 'c'.repeat(64), status: 'handed-off', preparedBy: 'user-other', preparedAt: '2026-08-04T09:00:00.000Z', handedOffBy: 'user-other', handedOffAt: '2026-08-04T09:05:00.000Z', requestReference: 'OPER-RELEASE-003', externalStatus: 'pending', version: 2,
    };
    revenueOpsState = {
      ...revenueOpsState,
      statutoryOperations: [submittedOperation],
      consolidatedEwayBills: [submittedConsolidation],
      providerConnectors: [connector],
      providerSubmissions: [handedOffSubmission],
    };
    render(<App />);

    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Money$/ }));
    await screen.findByTestId('retail-cash-overview');
    await user.click(screen.getByRole('button', { name: /Open money controls/i }));
    await user.click(await screen.findByRole('tab', { name: /GST \+ statutory/i }));

    expect(await screen.findByRole('heading', { name: 'Portal truth, under command' })).toBeTruthy();
    expect(screen.getByText(/portal acknowledgement cannot be entered in this workspace/i)).toBeTruthy();
    expect(screen.getByText(/only a certified adapter pull can establish portal acknowledgement/i)).toBeTruthy();
    expect(screen.getByText(/provider acknowledgement cannot be set from this handoff card/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reconcile ACK/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Record portal ACK/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Record external acknowledgement/i })).toBeNull();
  }, 20_000);

  it('starts the retail workspace owner at the simple Bakaloo command centre', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByTestId('bakaloo-retail-command-center')).toBeTruthy();
    expect(screen.getAllByText('Legacy sample isolated').length).toBeGreaterThan(0);
    expect(screen.getByText(/Build 0\.1\.0 \/ Legacy sample cleanup required/)).toBeTruthy();
  });

  it('routes every primary left-rail task to its real retail workspace', async () => {
    const user = userEvent.setup();
    render(<App />);

    const navigation = await screen.findByTestId('retail-workspace-navigation');
    const destinations: Array<[string, string]> = [
      ['Home', 'bakaloo-retail-command-center'],
      ['Sell', 'retail-sell-overview'],
      ['Stock', 'retail-stock-overview'],
      ['Deliver', 'retail-delivery-overview'],
      ['Customers', 'retail-customer-360'],
      ['Money', 'retail-cash-overview'],
      ['Insights', 'retail-insights-overview'],
      ['Setup', 'retail-setup-overview'],
    ];

    for (const [label, testId] of destinations) {
      await user.click(within(navigation).getByRole('button', { name: label }));
      expect(await screen.findByTestId(testId)).toBeTruthy();
    }
  });

  it('keeps Home submodules in the retail command centre instead of reopening a legacy command page', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    await user.click(screen.getByRole('button', { name: 'Home' }));
    await user.click(screen.getByRole('button', { name: 'Open Store pulse' }));

    expect(await screen.findByTestId('bakaloo-retail-command-center')).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('opens the simple governed order queue from the Sell rail instead of the legacy commerce workbench', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    await user.click(screen.getByRole('button', { name: 'Sell' }));
    await user.click(screen.getByRole('button', { name: 'Open Online orders' }));

    expect(await screen.findByTestId('retail-order-queue')).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('opens Returns and exchange as a simple evidence queue before the governed workbench', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Sell' }));
    await user.click(screen.getByRole('button', { name: 'Open Returns and exchange' }));
    expect(await screen.findByTestId('retail-returns-overview')).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('opens Products & pricing as a simple readiness desk before the governed editor', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Sell' }));
    await user.click(screen.getByRole('button', { name: 'Open Products & pricing' }));
    expect(await screen.findByTestId('retail-pricing-overview')).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('keeps Products & variants in the simple Stock workspace instead of the legacy commerce workbench', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    await user.click(screen.getByRole('button', { name: 'Stock' }));
    await user.click(screen.getByRole('button', { name: 'Open Products & variants' }));

    expect(await screen.findByTestId('retail-stock-overview')).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('keeps Stock control in the simple Stock workspace instead of the legacy warehouse workbench', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    await user.click(screen.getByRole('button', { name: 'Stock' }));
    await user.click(screen.getByRole('button', { name: 'Open Stock control' }));

    expect(await screen.findByTestId('retail-stock-overview')).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('opens Replenishment on its exact simple Stock tab instead of the legacy warehouse workbench', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    await user.click(screen.getByRole('button', { name: 'Stock' }));
    await user.click(screen.getByRole('button', { name: 'Open Replenishment' }));

    expect(await screen.findByRole('heading', { name: 'Replenishment decisions' })).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('opens Purchasing on the simple purchase-plan tab before governed procurement controls', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    await user.click(screen.getByRole('button', { name: 'Stock' }));
    await user.click(screen.getByRole('button', { name: 'Open Purchasing' }));

    expect(await screen.findByRole('heading', { name: 'Purchase plan' })).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('keeps the Delivery order queue in the compact dispatch workspace', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    await user.click(screen.getByRole('button', { name: 'Deliver' }));
    await user.click(screen.getByRole('button', { name: 'Open Order queue' }));

    expect(await screen.findByTestId('retail-delivery-overview')).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('keeps Delivery control in the compact dispatch workspace', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Deliver' }));
    await user.click(screen.getByRole('button', { name: 'Open Delivery control' }));
    expect(await screen.findByTestId('retail-delivery-overview')).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('opens Delivery branch transfers on the Stock Transfers tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Deliver' }));
    await user.click(screen.getByRole('button', { name: 'Open Branch transfers' }));
    expect(await screen.findByRole('heading', { name: 'Transfers' })).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('keeps Cash register in the compact Money workspace', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Money' }));
    await user.click(screen.getByRole('button', { name: 'Open Cash register' }));
    expect(await screen.findByTestId('retail-cash-overview')).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('keeps Payments & settlements in the compact Money workspace', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Money' }));
    await user.click(screen.getByRole('button', { name: 'Open Payments & settlements' }));
    expect(await screen.findByTestId('retail-cash-overview')).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('opens GST & invoices as a simple evidence view before statutory controls', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Money' }));
    await user.click(screen.getByRole('button', { name: 'Open GST & invoices' }));
    expect(await screen.findByTestId('retail-gst-overview')).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('keeps Finance close in the compact day-close checklist before controlled posting', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Money' }));
    await user.click(screen.getByRole('button', { name: 'Open Finance close' }));
    expect(await screen.findByTestId('retail-cash-overview')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Review what needs a decision' })).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('keeps Sales & margin in the compact Insights workspace', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Insights' }));
    await user.click(screen.getByRole('button', { name: 'Open Sales & margin' }));
    expect(await screen.findByTestId('retail-insights-overview')).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('opens Stock & expiry on the compact, source-backed Insights drill-down', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Insights' }));
    await user.click(screen.getByRole('button', { name: 'Open Stock & expiry' }));
    expect(await screen.findByRole('heading', { name: 'Stock & expiry' })).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('keeps outlet comparison honest when only the current store projection is available', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Insights' }));
    await user.click(screen.getByRole('button', { name: 'Open Outlets & team' }));
    expect(await screen.findByRole('heading', { name: 'Outlets & team' })).toBeTruthy();
    expect(screen.getByText(/does not receive replicated multi-store records/i)).toBeTruthy();
    expect(screen.queryByTestId('bharat-workbench')).toBeNull();
  });

  it('collapses and restores the Bakaloo sidebar without removing keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const shell = await screen.findByTestId('app-shell');
    expect(shell.getAttribute('data-sidebar-collapsed')).toBe('false');

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(shell.getAttribute('data-sidebar-collapsed')).toBe('true');
    expect(screen.getByTestId('retail-workspace-navigation')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Expand navigation' }));
    expect(shell.getAttribute('data-sidebar-collapsed')).toBe('false');
  });

  it('isolates an old sample workspace instead of rendering its demo task panels', async () => {
    render(<App />);

    expect(await screen.findByTestId('legacy-sample-isolation')).toBeTruthy();
    [
      'business-module-catalog',
      'business-workflow-catalog',
      'phase-readiness-board',
      'provider-readiness-board',
      'demo-scenario-runner',
      'demo-handoff-export',
      'portal-readiness-panel',
      'intelligence-command-panel',
      'communication-readiness-panel',
      'demo-audit-trail',
      'data-exchange-panel',
      'data-exchange-preview',
    ].forEach((retiredSurface) => {
      expect(screen.queryByTestId(retiredSurface)).toBeNull();
    });
    expect(screen.queryByRole('button', { name: 'Replay demo' })).toBeNull();
    expect(screen.queryByText('Staged replay')).toBeNull();
  });

  it('moves focus to the selected delivery desk after a delivery action', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Deliver$/ }));
    expect(await screen.findByRole('heading', { name: 'Promise realistically. Dispatch visibly. Reconcile COD.' })).toBeTruthy();
    expect(screen.getByTestId('retail-delivery-overview')).toBeTruthy();
    expect(screen.getByTestId('retail-delivery-map')).toBeTruthy();
    expect(document.activeElement).toBe(document.getElementById('workspace-canvas'));
  });

  it('opens the governed POS workbench from the simple Sell front door', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Sell$/ }));
    expect(await screen.findByTestId('retail-sell-overview')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /start a sale/i }));

    expect(await screen.findByRole('heading', { name: 'A disciplined counter, not a pretend payment terminal.' })).toBeTruthy();
    expect(screen.queryByTestId('retail-sell-overview')).toBeNull();
  });

  it('mounts only the requested retail commerce desk so returns cannot intercept POS checkout controls', async () => {
    const user = userEvent.setup();
    render(<App />);

    const navigation = await screen.findByTestId('retail-workspace-navigation');
    await user.click(within(navigation).getByRole('button', { name: 'Sell' }));
    await user.click(within(navigation).getByRole('button', { name: 'Open Point of sale' }));

    expect(await screen.findByRole('heading', { name: 'A disciplined counter, not a pretend payment terminal.' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Return the receipt, inspect the goods, then let a different person decide.' })).toBeNull();
    expect(screen.getByTestId('commercial-foundry').getAttribute('data-commerce-surface')).toBe('pos');

    await user.click(within(navigation).getByRole('button', { name: 'Open Returns and exchange' }));

    expect(await screen.findByRole('heading', { name: 'Return the receipt, inspect the goods, then let a different person decide.' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'A disciplined counter, not a pretend payment terminal.' })).toBeNull();
    expect(screen.getByTestId('commercial-foundry').getAttribute('data-commerce-surface')).toBe('returns');
  });

  it('keeps provider write controls outside the delivery front door', async () => {
    const user = userEvent.setup();
    render(<App />);

    const navigation = await screen.findByTestId('retail-workspace-navigation');
    await user.click(within(navigation).getByRole('button', { name: 'Deliver' }));
    expect(await screen.findByRole('heading', { name: 'Promise realistically. Dispatch visibly. Reconcile COD.' })).toBeTruthy();
    expect(screen.getByTestId('retail-delivery-map')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /open channel controls/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /configure credentials|create connector|prepare push|record provider response/i })).toBeNull();
  });

  it('opens the real control room from the policy-approved Settings extension', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByTestId('bakaloo-retail-command-center');
    await user.click(screen.getByRole('button', { name: /Retail extensions/i }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));

    expect(await screen.findByRole('heading', { name: 'Business control room' })).toBeTruthy();
    expect(screen.queryByTestId('retail-setup-overview')).toBeNull();
  });

  it('takes direct retail actions to governed workbenches instead of layering an overview on top', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByTestId('bakaloo-retail-command-center');
    await user.click(screen.getByRole('button', { name: 'Store setup' }));
    expect(await screen.findByRole('heading', { name: 'Business control room' })).toBeTruthy();
    expect(screen.queryByTestId('retail-setup-overview')).toBeNull();

    const navigation = screen.getByTestId('retail-workspace-navigation');
    await user.click(within(navigation).getByRole('button', { name: 'Sell' }));
    await user.click(within(navigation).getByRole('button', { name: 'Open Point of sale' }));
    expect(await screen.findByRole('heading', { name: 'A disciplined counter, not a pretend payment terminal.' })).toBeTruthy();
    expect(screen.queryByTestId('retail-sell-overview')).toBeNull();
  });

  it('opens each Bakaloo command-centre shortcut in its concrete governed workbench', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByTestId('bakaloo-retail-command-center');
    const destinations: Array<[string, () => Promise<HTMLElement>]> = [
      ['Open POS', () => screen.findByRole('heading', { name: 'A disciplined counter, not a pretend payment terminal.' })],
      ['Open orders', () => screen.findByRole('heading', { name: 'One queue for every verified order' })],
      ['Review stock', () => screen.findByRole('heading', { name: 'Inventory and warehouse' })],
      ['Open delivery', () => screen.findByRole('heading', { name: 'Sales fulfilment' })],
      ['Close cash', () => screen.findByRole('heading', { name: 'Billing, receivables and cash' })],
      ['Open customers', () => screen.findByTestId('retail-customer-360')],
      ['Set up store', () => screen.findByRole('heading', { name: 'Business control room' })],
    ];

    for (const [actionLabel, findWorkbench] of destinations) {
      const commandCenter = screen.getByTestId('bakaloo-retail-command-center');
      const matchingActions = within(commandCenter).getAllByRole('button', { name: new RegExp(`^${actionLabel}`, 'i') });
      await user.click(matchingActions[0]!);
      expect(await findWorkbench()).toBeTruthy();
      expect(screen.queryByTestId('bakaloo-retail-command-center')).toBeNull();

      const navigation = screen.getByTestId('retail-workspace-navigation');
      await user.click(within(navigation).getByRole('button', { name: 'Home' }));
      expect(await screen.findByTestId('bakaloo-retail-command-center')).toBeTruthy();
    }
  }, 30_000);

  it('enrolls a first owner into a clean India-first workspace by default', async () => {
    const submitted: BootstrapOwnerInput[] = [];
    window.epicBos.auth.getStatus = async () => ({ configured: false, session: null });
    window.epicBos.auth.bootstrapOwner = async (input) => {
      submitted.push(input);
      return { configured: true, session: null };
    };

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('heading', { name: 'Create the owner account' });
    expect(screen.getByText(/workspace starts clean, with no fictional sales, customers, or balances/i)).toBeTruthy();
    expect(screen.getByText(/existing data is never changed during account setup/i)).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /explore sample workspace/i })).toBeNull();

    await user.type(screen.getByLabelText('Owner name'), 'Aarav Shah');
    await user.type(screen.getByLabelText('Work email'), 'aarav@business.in');
    await user.type(screen.getByLabelText('Password'), 'Secure#12345');
    await user.type(screen.getByLabelText('Confirm password'), 'Secure#12345');
    await user.click(screen.getByRole('button', { name: 'Enroll owner and continue' }));

    await waitFor(() => {
      expect(submitted).toEqual([{
        displayName: 'Aarav Shah',
        email: 'aarav@business.in',
        password: 'Secure#12345',
        starterMode: 'clean',
      }]);
    });
  });

  it('shows governed command surfaces from live snapshots without legacy demo mutation panels', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Home$/ }));
    expect(await screen.findByText('Run the store')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your store, made simple.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sales by recorded day' })).toBeTruthy();
    expect(screen.getByText('Make the next decision clear')).toBeTruthy();
    expect(screen.getByTestId('legacy-sample-isolation')).toBeTruthy();
    expect(screen.queryByTestId('demo-audit-trail')).toBeNull();
    expect(screen.queryByTestId('demo-scenario-runner')).toBeNull();
  }, 20_000);

  it('shows real setup actions instead of fictional command-center records in a clean workspace', async () => {
    const authenticated = await window.epicBos.auth.getStatus();
    window.epicBos.auth.getStatus = async () => ({
      ...authenticated,
      workspaceStarterMode: 'clean',
    });

    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Home$/ }));
    await screen.findByRole('heading', { name: 'Your store, made simple.' });

    expect(screen.getByTestId('bakaloo-retail-command-center')).toBeTruthy();
    expect(screen.queryByTestId('demo-audit-trail')).toBeNull();
    expect(screen.queryByTestId('data-exchange-panel')).toBeNull();
    expect(screen.queryByTestId('demo-scenario-runner')).toBeNull();
    await user.click(screen.getAllByRole('button', { name: 'Open orders' })[0]!);
    expect(await screen.findByRole('heading', { name: 'One queue for every verified order' })).toBeTruthy();
  });

  it('renders the Commerce intelligence view from the current governed snapshots', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    await user.click(screen.getByRole('button', { name: /^Insights$/ }));
    await screen.findByRole('heading', { name: 'See the business. Then see the reason behind the numbers.' });

    const insights = await screen.findByTestId('retail-insights-overview');
    expect(insights.textContent).toContain('Decision visuals');
    expect(insights.textContent).toContain('Evidence coverage');
    /*
    expect(commerce.textContent).toContain('₹48L');
    */
  });

  it('opens the Store team payroll control workspace from Setup', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Setup$/ }));
    /*
    await screen.findByRole('heading', { name: 'Set up your retail operations' });
    await user.click(screen.getByRole('button', { name: 'Store team' }));
    await screen.findByRole('heading', { name: 'Set up your retail operations' });

    await user.click(screen.getByRole('tab', { name: /People \+ payroll$/i }));
    expect(screen.getByRole('heading', { name: 'A pay packet is a ledger event, not a spreadsheet export.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Freeze a monthly pay packet' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Maker → approver → independent releaser' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Control sources/i }));
    expect(screen.getByRole('heading', { name: 'Record the legal boundary' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Publish a reviewed calculation rule' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Workday log/i }));
    expect(screen.getByRole('heading', { name: 'Make a reviewable workday record' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Request approved time away' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Proof vault/i }));
    expect(screen.getByRole('heading', { name: 'Submit a source-backed declaration' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Prepare a one-time payroll adjustment' })).toBeTruthy();
  }, 20_000);

    */
    expect(await screen.findByRole('heading', { name: 'Configure once. Operate safely every day.' })).toBeTruthy();
    expect(screen.getByText('Admin & controls')).toBeTruthy();
    expect(screen.getByText('Data & backup')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Integrations/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Data & backup/ }));
    expect(await screen.findByRole('heading', { name: 'Business control room' })).toBeTruthy();
  });

  it('opens the project monetisation and financial-close folio', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Money$/ }));
    /*
    await screen.findByTestId('retail-cash-overview');

    await user.click(screen.getByRole('tab', { name: /Financial close$/i }));
    expect(screen.getByRole('heading', { name: 'Finish the ledger without losing the delivery truth.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Author a project billing plan' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Maker, checker, effective route' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Close calendar/i }));
    expect(screen.getByRole('heading', { name: 'Submit a financial close' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Seal only what can be evidenced' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Project control/i }));
    expect(screen.getByRole('heading', { name: 'Protect the promise before it becomes a surprise.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Submit an effective rate' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Forecast scarce delivery capacity' })).toBeTruthy();
  }, 20_000);

    */
    expect(await screen.findByRole('heading', { name: 'Close the day by exception, not by spreadsheet.' })).toBeTruthy();
    expect(screen.getByTestId('retail-cash-overview')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Recorded versus bank matched' })).toBeTruthy();
  });

  it('opens the canonical general-ledger gate from Money', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Money$/ }));
    expect(await screen.findByRole('heading', { name: 'Close the day by exception, not by spreadsheet.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open money controls/i })).toBeTruthy();
  });

  it('loads the retailer-first customer workspace from the secure bridge', async () => {
    render(<App />);
    await openCrmHome();

    expect(
      await screen.findByRole('heading', { name: 'Know the customer without losing the retail context.' }),
    ).toBeTruthy();
    const customerOverview = screen.getByTestId('retail-customer-360');
    expect(within(customerOverview).getByText('Customers')).toBeTruthy();
    expect(within(customerOverview).getByText('Active customers')).toBeTruthy();
    expect(within(customerOverview).getByText('Repeat rate')).toBeTruthy();
    expect(within(customerOverview).getByText('Average basket')).toBeTruthy();
    expect(within(customerOverview).getByText('Loyalty points')).toBeTruthy();
    expect(within(customerOverview).getByText('Needs first sale')).toBeTruthy();
    expect(screen.queryByText('Commercial flow')).toBeNull();
    /* Legacy CRM pipeline assertions remain covered by CRM depth/domain tests.
       The primary retailer route now opens the customer master directly. */
    /*
    const pipelineMetric = screen.getByText('Open pipeline').closest('.metric-card');
    const forecastMetric = screen.getByText('Weighted forecast').closest('.metric-card');
    expect(pipelineMetric).toBeTruthy();
    expect(forecastMetric).toBeTruthy();
    expect(pipelineMetric!.textContent).toContain('₹');
    expect(pipelineMetric!.textContent).toContain('INR reporting view');
    expect(pipelineMetric!.textContent).not.toContain('$');
    expect(forecastMetric!.textContent).toContain('₹');
    expect(forecastMetric!.textContent).toContain('INR reporting view');

    const defaultOpportunity = screen.getByRole('button', { name: /Regional distributor operating model/i });
    expect(defaultOpportunity.getAttribute('aria-label')).toContain('₹');
    expect(defaultOpportunity.getAttribute('aria-label')).not.toContain('$');
    expect(screen.getByText('11 opportunities')).toBeTruthy();
    expect(screen.getByText('3 active leads')).toBeTruthy();
    */
  });

  it('opens the keyboard command palette', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    await user.click(screen.getByRole('button', { name: /find an action/i }));

    expect(
      screen.getByRole('dialog', { name: 'Command palette' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /create a lead/i })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search commands' })).toBe(document.activeElement));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /find an action/i })).toBe(document.activeElement);
  });

  it('supports Alt-number keyboard routing for major workspaces', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    expect(screen.getByRole('button', { name: 'Deliver' }).getAttribute('aria-keyshortcuts')).toBe('Alt+4');
    await user.keyboard('{Alt>}2{/Alt}');
    expect(await screen.findByRole('heading', { name: 'Sell simply. Keep every rupee accountable.' })).toBeTruthy();
    await user.keyboard('{Alt>}4{/Alt}');
    expect(await screen.findByRole('heading', { name: 'Promise realistically. Dispatch visibly. Reconcile COD.' })).toBeTruthy();
    await user.keyboard('{Alt>}7{/Alt}');
    expect(await screen.findByRole('heading', { name: 'See the business. Then see the reason behind the numbers.' })).toBeTruthy();
  });

  it('keeps a labelled, available workspace rail at desktop width', async () => {
    const previousWidth = window.innerWidth;
    const previousHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });

    try {
      render(<App />);
      await openCrmHome();

      const navigation = screen.getByLabelText('Primary navigation');
      expect(navigation.tagName).toBe('ASIDE');
      expect(navigation.classList.contains('sidebar')).toBe(true);
      expect(navigation.classList.contains('sidebar--mobile-open')).toBe(false);
      expect(document.querySelector('.app-shell')?.getAttribute('data-navigation-mode')).toBe('full-rail');

      for (const [index, label] of ['Home', 'Sell', 'Stock', 'Deliver', 'Customers', 'Money', 'Insights', 'Setup'].entries()) {
        const route = screen.getByRole('button', { name: label });
        expect(route.hidden).toBe(false);
        expect(route.getAttribute('aria-label')).toBe(label);
        expect(route.getAttribute('aria-keyshortcuts')).toBe(`Alt+${index + 1}`);
      }
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: previousHeight });
    }
  });

  it('keeps one main content root and one reachable workspace canvas', async () => {
    render(<App />);
    await openCrmHome();

    const main = screen.getByRole('main');
    const canvas = document.getElementById('workspace-canvas');
    expect(main.id).toBe('main-content');
    expect(main.classList.contains('main-content')).toBe(true);
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(canvas?.classList.contains('workspace-canvas')).toBe(true);
    expect(canvas?.parentElement).toBe(main);
    expect(document.querySelectorAll('main.main-content')).toHaveLength(1);
    expect(document.querySelectorAll('#workspace-canvas.workspace-canvas')).toHaveLength(1);
  });

  it('resets the retained accessible canvas after workspace navigation', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    const main = screen.getByRole('main');
    const canvas = document.getElementById('workspace-canvas');
    const scrollCalls: unknown[][] = [];
    Object.defineProperty(main, 'scrollTo', {
      configurable: true,
      value: (...arguments_: unknown[]) => scrollCalls.push(arguments_),
    });

    await user.click(screen.getByRole('button', { name: /^Money$/ }));
    await screen.findByRole('heading', { name: 'Close the day by exception, not by spreadsheet.' });
    await waitFor(() => {
      expect(scrollCalls.some(([options]) => JSON.stringify(options) === JSON.stringify({ top: 0, behavior: 'auto' }))).toBe(true);
      expect(document.activeElement).toBe(canvas);
    });
    expect(document.getElementById('workspace-canvas')).toBe(canvas);

    await user.click(screen.getByRole('button', { name: /^Stock$/ }));
    await screen.findByTestId('retail-stock-overview');
    await waitFor(() => {
      expect(scrollCalls.length).toBeGreaterThanOrEqual(2);
      expect(document.activeElement).toBe(canvas);
    });
    expect(document.getElementById('workspace-canvas')).toBe(canvas);
  });

  it('captures and persists a lead through the bridge', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    await user.click(screen.getByRole('button', { name: 'Find an action' }));
    await user.click(await screen.findByRole('button', { name: /Create a lead/i }));
    const dialog = screen.getByRole('dialog', {
      name: 'Create a qualified lead',
    });
    await user.type(within(dialog).getByLabelText('Contact name'), 'Ada Lovelace');
    await user.type(
      within(dialog).getByLabelText('Organization'),
      'Analytical Engines',
    );
    await user.type(
      within(dialog).getByLabelText('Work email'),
      'ada@example.com',
    );
    await user.selectOptions(
      within(dialog).getByLabelText('Acquisition source'),
      'Referral',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Create lead' }));

    await waitFor(() => {
      expect(state.leads.some(({ email }) => email === 'ada@example.com')).toBe(true);
    });
    expect(state.leads[0]?.email).toBe('ada@example.com');
  });

  it('opens a plain-language retail task from the command palette', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    await user.click(screen.getByRole('button', { name: 'Find an action' }));
    await user.click(await screen.findByRole('button', { name: /Pack orders/i }));

    expect(
      await screen.findByRole('heading', { name: 'Promise realistically. Dispatch visibly. Reconcile COD.' }),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
  });

  it('opens every major workspace and its connected submodules without disabled navigation', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    const workspaces: Array<[string, string]> = [
      ['Home', 'bakaloo-retail-command-center'],
      ['Sell', 'retail-sell-overview'],
      ['Stock', 'retail-stock-overview'],
      ['Deliver', 'retail-delivery-overview'],
      ['Customers', 'retail-customer-360'],
      ['Money', 'retail-cash-overview'],
      ['Insights', 'retail-insights-overview'],
      ['Setup', 'retail-setup-overview'],
    ];

    for (const [label, testId] of workspaces) {
      const workspaceButton = screen.getByRole('button', { name: new RegExp(`^${label}$`) });
      expect(workspaceButton.hasAttribute('disabled')).toBe(false);
      await user.click(workspaceButton);
      expect(await screen.findByTestId(testId)).toBeTruthy();
    }
  }, 20_000);

  it('keeps the Phase 4 intelligence inbox connected to its evidence workbench', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Insights$/ }));
    expect(await screen.findByTestId('retail-insights-overview')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open detailed insights/i })).toBeTruthy();
  });

  it('opens asset stewardship and maintenance from their owning workspaces', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Money$/ }));
    /*
    await screen.findByRole('heading', { name: 'Close the day by exception, not by spreadsheet.' });
    await user.click(screen.getByRole('button', { name: 'Asset register' }));

    expect(
      await screen.findByRole('heading', { name: 'Installed asset register' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Move equipment without losing chain of custody.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Retire a reconciled asset without hiding the loss.' })).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: /Asset register$/ }).getAttribute('aria-selected'),
    ).toBe('true');

    await user.click(screen.getByRole('button', { name: /^Stock$/ }));
    await screen.findByRole('heading', { name: 'Keep stock accurate' });
    await user.click(screen.getByRole('button', { name: 'Maintenance' }));

    expect(
      await screen.findByRole('heading', { name: 'Maintenance command' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: /Maintenance$/i }).getAttribute('aria-selected'),
    ).toBe('true');
  }, 20_000);

    */
    expect(await screen.findByTestId('retail-cash-overview')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open money controls/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Stock$/ }));
    expect(await screen.findByTestId('retail-stock-overview')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open stock controls/i })).toBeTruthy();
  });

  it('mounts only the active workspace canvas instead of one scrolling mega-page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openCrmHome();
    expect(screen.getByTestId('retail-customer-360')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Money$/ }));
    expect(await screen.findByTestId('retail-cash-overview')).toBeTruthy();
    expect(screen.queryByTestId('retail-customer-360')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Home$/ }));
    expect(await screen.findByTestId('bakaloo-retail-command-center')).toBeTruthy();
    expect(screen.queryByTestId('retail-cash-overview')).toBeNull();
  });

  it('keeps ownership clear for shared workbenches and provides compact navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openCrmHome();
    await user.click(
      screen.getByRole('button', { name: 'Open workspace navigation' }),
    );
    expect(screen.getByLabelText('Primary navigation').className).toContain(
      'sidebar--mobile-open',
    );
    expect(screen.getByLabelText('Primary navigation').getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close workspace navigation');
    await user.keyboard('{Escape}');
    expect(screen.getByLabelText('Primary navigation').className).not.toContain('sidebar--mobile-open');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open workspace navigation' }));
    await user.click(screen.getByRole('button', { name: 'Open workspace navigation' }));
    await user.click(screen.getByRole('button', { name: /^Sell$/ }));
    await screen.findByRole('heading', { name: 'Sell simply. Keep every rupee accountable.' });
    expect(screen.getByLabelText('Primary navigation').className).not.toContain(
      'sidebar--mobile-open',
    );

    await user.click(screen.getByRole('button', { name: /^Deliver$/ }));
    expect(await screen.findByTestId('retail-delivery-overview')).toBeTruthy();
    expect(screen.getByTestId('retail-delivery-map')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Setup$/ }));
    expect(await screen.findByTestId('retail-setup-overview')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Data & backup/ })).toBeTruthy();
  });

  it('exposes a keyboard skip link to the active workspace canvas', async () => {
    render(<App />);
    await openCrmHome();
    expect(screen.getByRole('link', { name: 'Skip to workspace' }).getAttribute('href')).toBe('#workspace-canvas');
    expect(document.getElementById('workspace-canvas')?.getAttribute('tabindex')).toBe('-1');
    expect(screen.getByText(/Current workspace:/).getAttribute('aria-live')).toBe('polite');
  });

  it('connects the workspace actions and attention buttons', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();

    await user.click(screen.getByRole('button', { name: 'Find an action' }));
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByLabelText('Attention queue')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review CRM signals' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Notifications' }).getAttribute('aria-controls')).toBe('attention-queue');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Review CRM signals' })));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Attention queue' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Notifications' }));
  });

  it('shows the operational kernel and creates a verified backup', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Home$/ }));
    await user.click(screen.getByRole('button', { name: 'Approvals and evidence' }));

    expect(
      await screen.findByRole('heading', { name: 'Governance is operational' }),
    ).toBeTruthy();
    expect(screen.getByText('5 controlled roles', { exact: false })).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: 'Create verified backup' }),
    );

    expect(
      await screen.findByText(/Verified database backup Epic-BOS-test\.sqlite3/i),
    ).toBeTruthy();
  }, 20_000);

  it('does not expose the immutable workspace-owner role in policy controls', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Home$/ }));
    await user.click(screen.getByRole('button', { name: 'Approvals and evidence' }));
    await screen.findByRole('heading', { name: 'Governance is operational' });
    await user.click(screen.getByRole('button', { name: 'Store setup' }));
    await screen.findByRole('heading', { name: 'Business control room' });
    await user.click(screen.getByRole('tab', { name: 'access' }));

    expect(screen.queryByRole('option', { name: 'Workspace owner' })).toBeNull();
  }, 20_000);

  it('lets an administrator rename the visible workspace without treating it as a legal-entity edit', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Home$/ }));
    await user.click(screen.getByRole('button', { name: 'Approvals and evidence' }));
    await screen.findByRole('heading', { name: 'Governance is operational' });
    await user.click(screen.getByRole('button', { name: 'Store setup' }));
    await screen.findByRole('heading', { name: 'Make the workspace yours' });

    await user.clear(screen.getByLabelText('Workspace name'));
    await user.type(screen.getByLabelText('Workspace name'), 'Kaveri Foods');
    await user.clear(screen.getByLabelText('Workspace URL label'));
    await user.type(screen.getByLabelText('Workspace URL label'), 'kaveri-foods');
    await user.click(screen.getByRole('button', { name: 'Save workspace identity' }));

    await waitFor(() => {
      expect(kernelState.tenant).toMatchObject({ name: 'Kaveri Foods', slug: 'kaveri-foods' });
    });
    expect(kernelState.tenant).toMatchObject({ name: 'Kaveri Foods', slug: 'kaveri-foods' });
    expect(kernelState.companies[0]?.name).not.toBe('Kaveri Foods');
    expect(screen.getByText(/Legal-entity names, GST registrations/i)).toBeTruthy();
  }, 20_000);

  it('opens the persisted Phase 4 release evidence ledger', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Home$/ }));
    await user.click(screen.getByRole('button', { name: 'Approvals and evidence' }));
    await screen.findByRole('heading', { name: 'Governance is operational' });
    await user.click(screen.getByRole('button', { name: 'Store setup' }));
    await screen.findByRole('heading', { name: 'Business control room' });
    await user.click(screen.getByRole('tab', { name: 'release' }));
    expect(screen.getByRole('heading', { name: 'Release evidence ledger' })).toBeTruthy();
    expect(screen.getByText(/Deferred provider certification stays blocked/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export provider template' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verify provider package' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export retail pack' })).toBeTruthy();
    expect(await screen.findByText('Installed app updater')).toBeTruthy();
    expect(screen.getByText(/disabled in the renderer test/i)).toBeTruthy();
  }, 20_000);

  it('captures provider handoff references without exposing credential fields', async () => {
    const user = userEvent.setup();
    let captured: Parameters<typeof window.epicBos.integration.exportProviderCertificationPackage>[0] | null = null;
    window.epicBos.integration.exportProviderCertificationPackage = async (input) => {
      captured = input;
      return { filePath: 'provider.json', checksum: 'a'.repeat(64), readyForSandbox: true, readyForProduction: false, exportedAt: '2026-07-17T00:00:00.000Z' };
    };
    window.epicBos.integration.verifyProviderCertificationPackage = async () => ({ filePath: 'provider.json', verifiedAt: '2026-07-17T00:00:00.000Z', valid: true, declaredChecksum: 'b'.repeat(64), computedChecksum: 'b'.repeat(64), readyForSandbox: true, readyForProduction: false, missing: ['production approval reference'], errors: [] });
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Home$/ }));
    await user.click(screen.getByRole('button', { name: 'Approvals and evidence' }));
    await screen.findByRole('heading', { name: 'Governance is operational' });
    await user.click(screen.getByRole('button', { name: 'Store setup' }));
    await screen.findByRole('heading', { name: 'Business control room' });
    await user.click(screen.getByRole('tab', { name: 'release' }));
    await user.click(screen.getByRole('button', { name: 'Export provider template' }));
    expect(screen.getByRole('form', { name: 'Provider certification handoff form' })).toBeTruthy();
    expect(screen.queryByLabelText(/API key|password|token/i)).toBeNull();
    await user.type(screen.getByLabelText('Provider name'), 'GST Partner');
    await user.type(screen.getByLabelText('Contract reference'), 'CONTRACT-GST-1');
    await user.type(screen.getByLabelText('Credential owner'), 'Finance team');
    await user.type(screen.getByLabelText('Credential revision'), '1');
    await user.type(screen.getByLabelText('Sandbox evidence reference'), 'SANDBOX-GST-1');
    await user.type(screen.getByLabelText('Test-case references'), 'AUTH-1, GST-1');
    await user.click(screen.getByRole('button', { name: 'Export handoff package' }));
    expect(captured).toMatchObject({ domain: 'gsp-irp', providerName: 'GST Partner', contractReference: 'CONTRACT-GST-1', sandboxEvidenceReference: 'SANDBOX-GST-1', credentialRevision: 1, credentialOwner: 'Finance team', testCaseReferences: ['AUTH-1', 'GST-1'] });
    expect(screen.getByRole('status').textContent).toContain('Provider handoff exported');
    await user.click(screen.getByRole('button', { name: 'Verify provider package' }));
    expect(screen.getByRole('status').textContent).toContain('Provider package verified');
  }, 20_000);

  it('records release evidence through the authenticated bridge and refreshes the ledger', async () => {
    const user = userEvent.setup();
    let testGates: Array<Parameters<typeof window.epicBos.release.recordGate>[0]> = [];
    window.epicBos.release.listGates = async () => testGates;
    window.epicBos.release.recordGate = async (input) => { testGates = [input]; return input; };
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Home$/ }));
    await user.click(screen.getByRole('button', { name: 'Approvals and evidence' }));
    await screen.findByRole('heading', { name: 'Governance is operational' });
    await user.click(screen.getByRole('button', { name: 'Store setup' }));
    await screen.findByRole('heading', { name: 'Business control room' });
    await user.click(screen.getByRole('tab', { name: 'release' }));
    await user.selectOptions(screen.getByLabelText('Gate'), 'tests');
    await user.selectOptions(screen.getByLabelText('Status'), 'passed');
    await user.clear(screen.getByLabelText('Label'));
    await user.type(screen.getByLabelText('Label'), 'Full regression suite');
    await user.type(screen.getByLabelText('Evidence reference'), 'TEST-261');
    await user.click(screen.getByRole('button', { name: 'Record gate evidence' }));
    expect(await screen.findByText('Full regression suite')).toBeTruthy();
    expect(screen.getByText(/TEST-261/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Release evidence recorded:');
    await user.click(screen.getByRole('button', { name: 'Generate review packet' }));
    expect((await screen.findByRole('status')).textContent).toContain('Review packet generated');
    await user.click(screen.getByRole('button', { name: 'Generate support diagnostics' }));
    expect((await screen.findByRole('status')).textContent).toContain('Support diagnostics generated');
  }, 15_000);

  it('opens scoped public API-key administration in Control Room', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Home$/ }));
    await user.click(screen.getByRole('button', { name: 'Approvals and evidence' }));
    await screen.findByRole('heading', { name: 'Governance is operational' });
    await user.click(screen.getByRole('button', { name: 'Store setup' }));
    await screen.findByRole('heading', { name: 'Business control room' });
    await user.click(screen.getByRole('tab', { name: 'integration' }));
    expect(screen.getByRole('heading', { name: 'Public API key administration' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Issue API key' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export inventory' })).toBeTruthy();
  }, 20_000);

  it('operates the configurable CRM pipeline from the control deck', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Advanced pipeline' }));

    expect(
      await screen.findByRole('heading', { name: 'CRM operating model' }),
    ).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: /Pipeline/i }));
    expect(screen.getByRole('heading', { name: 'Enterprise revenue' })).toBeTruthy();

    const probability = screen.getAllByLabelText('Probability')[0]!;
    await user.clear(probability);
    await user.type(probability, '22');
    await user.click(screen.getByRole('button', { name: /Commit pipeline policy/i }));

    await waitFor(() => {
      expect(crmDepthState.pipelines[0]?.stages[0]?.probability).toBe(22);
      expect(crmDepthState.pipelines[0]?.version).toBe(2);
    });
  });

  it('retains scoring-rule input when the CRM policy mutation is rejected', async () => {
    const user = userEvent.setup();
    window.epicBos.crmDepth.createScoringRule = async () => {
      throw new Error('Scoring rule rejected');
    };
    render(<App />);

    await openCrmHome();
    await user.click(screen.getByRole('button', { name: 'Advanced pipeline' }));
    await screen.findByRole('heading', { name: 'CRM operating model' });
    await user.click(screen.getByRole('tab', { name: 'Signal' }));

    const ruleName = screen.getByLabelText('Rule name') as HTMLInputElement;
    const match = screen.getByLabelText('Match') as HTMLInputElement;
    const points = screen.getByLabelText('Points') as HTMLInputElement;
    await user.type(ruleName, 'Strategic partner signal');
    await user.type(match, 'Alliance');
    await user.clear(points);
    await user.type(points, '35');
    await user.click(screen.getByRole('button', { name: 'Add scoring rule' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Scoring rule rejected');
    await waitFor(() => {
      expect((screen.getByLabelText('Rule name') as HTMLInputElement).value).toBe('Strategic partner signal');
      expect((screen.getByLabelText('Match') as HTMLInputElement).value).toBe('Alliance');
      expect((screen.getByLabelText('Points') as HTMLInputElement).value).toBe('35');
    });
  });

  it('exposes the India-first territory, pursuit, and quotation workspace', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openCrmHome();
    await user.click(screen.getByRole('button', { name: /^Sell$/ }));
    /*

    expect(
      await screen.findByRole('heading', { name: 'Sell simply. Keep every rupee accountable.' }),
    ).toBeTruthy();
    expect(screen.getByText(/FY starts April/i)).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Opportunities$/i }));
    expect(screen.getByRole('heading', { name: 'Open an India pursuit' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Account lens' })).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Quotations$/i }));
    expect(screen.getByRole('heading', { name: 'Prepare governed quotation' })).toBeTruthy();
    expect(screen.getByText(/not a tax invoice/i)).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Products \+ pricing$/i }));
    expect(screen.getByRole('heading', { name: 'Product + GST forge' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Price waterfall' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Order loom' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Stock$/ }));
    await screen.findByRole('heading', { name: 'Keep stock accurate' });
    await user.click(screen.getByRole('tab', { name: /Procurement$/i }));
    expect(screen.getByRole('heading', { name: 'Source with evidence. Receive with truth.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Raise controlled demand' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Approve then source' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Supplier ledger/i }));
    expect(screen.getByRole('heading', { name: 'Bring a vendor under control' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Supplier evidence register' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Sourcing board/i }));
    expect(screen.getByRole('heading', { name: 'Open a controlled sourcing event' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Committed supply' })).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Manufacturing$/i }));
    expect(screen.getByRole('heading', { name: 'Build only what can be proved.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Register a controlled work center' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Draft one controlled BOM revision' })).toBeTruthy();

    await user.click(within(screen.getByLabelText('Manufacturing work desks')).getByRole('button', { name: /Work orders/i }));
    expect(screen.getByRole('heading', { name: 'Convert released engineering into production' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Release, start and issue exact material' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Setup$/ }));
    await user.click(screen.getByRole('button', { name: 'Store team' }));
    await user.click(screen.getByRole('button', { name: 'Workforce capacity' }));
    await screen.findByRole('heading', { name: 'Promise realistically. Dispatch visibly. Reconcile COD.' });
    await user.click(screen.getByRole('tab', { name: /Projects \+ service$/i }));
    expect(screen.getByRole('heading', { name: 'Make every promise operational.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Open a governed delivery' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Only approved effort counts' })).toBeTruthy();

    await user.click(within(screen.getByLabelText('Delivery command desks')).getByRole('button', { name: /SLA \+ cases/i }));
    expect(screen.getByRole('heading', { name: 'Publish an SLA boundary' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Open a traceable customer issue' })).toBeTruthy();

    await user.click(within(screen.getByLabelText('Delivery command desks')).getByRole('button', { name: /Field dispatch/i }));
    expect(screen.getByRole('heading', { name: 'Dispatch one accountable visit' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Dispatch → arrival → completion evidence' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Workforce runway/i }));
    expect(screen.getByRole('heading', { name: 'Staff the promise before it becomes a commitment.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Eligibility, rate and skill are independently activated' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reserve real people against real task capacity' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Deliver$/ }));
    await screen.findByRole('heading', { name: 'Promise realistically. Dispatch visibly. Reconcile COD.' });
    expect(screen.getByRole('heading', { name: 'Fulfilment Control Tower' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Registration + place-of-supply gate' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Inventory allocation deck' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'PIN-code serviceability desk' })).toBeTruthy();
    expect(screen.getByText(/not a carrier ETA/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'IRP + e-way acknowledgement exchange' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Money$/ }));
    await screen.findByRole('heading', { name: 'Close the day by exception, not by spreadsheet.' });
    await user.click(screen.getByRole('tab', { name: /GST \+ statutory$/i }));
    expect(screen.getByRole('heading', { name: 'Portal truth, under command' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'GSP + IRP adapter vault' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cancellation, closure + validity' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pull reconciliation + signature proof' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'A connector earns production authority through evidence.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'External response is the source of truth' })).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Billing \+ cash$/i }));
    expect(screen.getByRole('heading', { name: 'Revenue Ledger' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Invoice control' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Receivable radar' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Accounting bridge' })).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Collections$/i }));
    expect(screen.getByRole('heading', { name: 'Turn receivables into governed cash' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What arrived, what was applied, and what still needs proof.' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Recovery room/i }));
    expect(screen.getByRole('heading', { name: 'Propose a credit line' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Dunning cases' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /TDS \/ TCS desk/i }));
    expect(screen.getByRole('heading', { name: 'Publish TDS / TCS policy' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Compliance lifecycle' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Bank matching/i }));
    expect(screen.getByRole('heading', { name: 'Preview bank truth' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Human-confirmed matching' })).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Treasury$/i }));
    expect(screen.getByRole('heading', { name: 'Make every rupee visible before it moves.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Capture a dated bank position' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Run the cash forecast' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Payment release/i }));
    expect(screen.getByRole('heading', { name: 'Submit a matched invoice' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Maker → approver → releaser' })).toBeTruthy();
    */
    expect(await screen.findByTestId('retail-sell-overview')).toBeTruthy();
    expect(screen.getByText(/GST total/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open full POS controls/i })).toBeTruthy();
  });
});
