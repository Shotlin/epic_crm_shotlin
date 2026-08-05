import { IPC_CHANNELS } from '../shared/contracts';
import type { BusinessAction } from '../shared/kernel-contracts';

type IpcChannelKey = keyof typeof IPC_CHANNELS;

export type IpcAuthorizationPolicy =
  | { mode: 'trusted' }
  | { mode: 'session' }
  | { mode: 'delegated'; reason: string }
  | {
      mode: 'permission';
      resource: string;
      action: BusinessAction;
      scope: 'active' | 'ledger-bound' | 'revenue-operations-bound';
    };

const channelKeys = Object.keys(IPC_CHANNELS) as IpcChannelKey[];

/**
 * Every registered IPC route must resolve through this manifest. The session
 * default is a deliberately visible transitional classification for legacy
 * domain routes; new sensitive routes must be promoted to permission or
 * delegated policy as their record ownership is introduced.
 */
const sessionBaseline = Object.fromEntries(
  channelKeys.map((key) => [key, { mode: 'session' } as const]),
) as Record<IpcChannelKey, IpcAuthorizationPolicy>;

const BASE_IPC_AUTHORIZATION_POLICY: Record<
  IpcChannelKey,
  IpcAuthorizationPolicy
> = {
  ...sessionBaseline,
  systemInfo: { mode: 'trusted' },
  systemBuildProvenance: { mode: 'trusted' },
  authStatus: { mode: 'trusted' },
  authBootstrapOwner: { mode: 'trusted' },
  authLogin: { mode: 'trusted' },
  authLogout: { mode: 'trusted' },
  authLock: { mode: 'trusted' },
  storageListAttachments: {
    mode: 'delegated',
    reason: 'Attachment resource is resolved from the validated request payload.',
  },
  storageAddAttachment: {
    mode: 'delegated',
    reason: 'Attachment resource is resolved from the validated request payload.',
  },
  storageExportAttachment: {
    mode: 'delegated',
    reason: 'Attachment resource is resolved from encrypted metadata.',
  },
  storageCreateDatabaseBackup: {
    mode: 'permission', resource: 'kernel.backup', action: 'admin', scope: 'active',
  },
  storageRestoreDatabaseBackup: {
    mode: 'permission', resource: 'kernel.backup', action: 'admin', scope: 'active',
  },
  retailWorkspaceGetStatus: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  retailWorkspaceGetDemoResetPreview: {
    mode: 'permission', resource: 'kernel.tenant', action: 'admin', scope: 'active',
  },
  retailWorkspaceApplyDemoReset: {
    mode: 'permission', resource: 'kernel.tenant', action: 'admin', scope: 'active',
  },
  kernelUpdateTenantIdentity: {
    mode: 'permission', resource: 'kernel.tenant', action: 'admin', scope: 'active',
  },
  partySnapshot: {
    mode: 'permission', resource: 'crm.party', action: 'read', scope: 'active',
  },
  partyCreateAccount: {
    mode: 'permission', resource: 'crm.party', action: 'create', scope: 'active',
  },
  partyCreateContact: {
    mode: 'permission', resource: 'crm.party', action: 'create', scope: 'active',
  },
  partyRecordConsent: {
    mode: 'permission', resource: 'crm.party', action: 'update', scope: 'active',
  },
  partyResolveDuplicate: {
    mode: 'permission', resource: 'crm.party', action: 'update', scope: 'active',
  },
  partyAddAddress: {
    mode: 'permission', resource: 'crm.party', action: 'update', scope: 'active',
  },
  partyAddContactPoint: {
    mode: 'permission', resource: 'crm.party', action: 'update', scope: 'active',
  },
  partyCreateRelationship: {
    mode: 'permission', resource: 'crm.party', action: 'update', scope: 'active',
  },
  partyExecuteMerge: {
    mode: 'permission', resource: 'crm.party', action: 'update', scope: 'active',
  },
  partyConvertLead: {
    mode: 'permission', resource: 'crm.party', action: 'update', scope: 'active',
  },
  generalLedgerSnapshot: {
    mode: 'permission', resource: 'finance.journal', action: 'read', scope: 'ledger-bound',
  },
  financeCompletionList: {
    mode: 'permission', resource: 'finance.journal', action: 'read', scope: 'ledger-bound',
  },
  financeCompletionSave: {
    mode: 'permission', resource: 'finance.journal', action: 'update', scope: 'ledger-bound',
  },
  generalLedgerBindCompany: {
    mode: 'delegated',
    reason: 'The target company and branch are validated from the binding payload.',
  },
  generalLedgerCreateJournal: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareRevenueInvoicePosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareCashReceiptPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareWriteOffPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareWithholdingPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareTreasuryPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareManufacturingPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareLandedCostPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareRetailSaleCostPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareRetailReturnCostPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareRetailCommerceSettlementPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareRetailCommissionPayoutPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPreparePeoplePosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  kernelOperationalHealth: {
    mode: 'permission', resource: 'kernel.configuration', action: 'read', scope: 'active',
  },
  kernelOutboxReplayPlan: {
    mode: 'permission', resource: 'kernel.configuration', action: 'read', scope: 'active',
  },
  kernelExecuteOutboxReplay: {
    mode: 'permission', resource: 'kernel.configuration', action: 'admin', scope: 'active',
  },
  kernelResolveOutboxConflict: {
    mode: 'permission', resource: 'kernel.configuration', action: 'admin', scope: 'active',
  },
  integrationListApiKeys: {
    mode: 'permission', resource: 'integration.api-key', action: 'read', scope: 'active',
  },
  integrationIssueApiKey: {
    mode: 'permission', resource: 'integration.api-key', action: 'admin', scope: 'active',
  },
  integrationRevokeApiKey: {
    mode: 'permission', resource: 'integration.api-key', action: 'admin', scope: 'active',
  },
  integrationExportApiKeyInventory: {
    mode: 'permission', resource: 'integration.api-key', action: 'export', scope: 'active',
  },
  integrationExportProviderCertification: {
    mode: 'permission', resource: 'release.control', action: 'export', scope: 'active',
  },
  releaseListGates: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  releaseRecordGate: {
    mode: 'permission', resource: 'release.control', action: 'admin', scope: 'active',
  },
  releaseListArtifactEvidence: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  releaseRecordArtifactEvidence: {
    mode: 'permission', resource: 'release.control', action: 'admin', scope: 'active',
  },
  releaseDecideArtifactEvidence: {
    mode: 'permission', resource: 'release.control', action: 'admin', scope: 'active',
  },
  releaseListUpdateEvidence: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  releaseRecordUpdateEvidence: {
    mode: 'permission', resource: 'release.control', action: 'admin', scope: 'active',
  },
  releaseDecideUpdateEvidence: {
    mode: 'permission', resource: 'release.control', action: 'admin', scope: 'active',
  },
  releaseAutoUpdateStatus: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  releaseListUiAcceptanceEvidence: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  releaseRecordUiAcceptanceEvidence: {
    mode: 'permission', resource: 'release.control', action: 'admin', scope: 'active',
  },
  releaseDecideUiAcceptanceEvidence: {
    mode: 'permission', resource: 'release.control', action: 'admin', scope: 'active',
  },
  releaseUiAcceptanceReadiness: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  releaseReadiness: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  releaseReadinessReport: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  releaseSupportDiagnostics: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  intelligenceListAnomalies: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  intelligenceSaveAnomaly: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  intelligenceReviewAnomaly: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  intelligenceListReportExecutions: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  intelligenceSaveReportExecution: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  intelligenceListReportDeliveryPlans: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  intelligenceListReportDeliveryAttempts: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  intelligenceCreateReportDeliveryPlan: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  intelligenceDecideReportDeliveryPlan: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  intelligencePrepareReportDeliveryAttempt: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  intelligenceRecordReportDeliveryResult: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationListRuns: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationProposeRun: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationApproveRun: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationStartRun: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationRetryRun: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationCompleteRun: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationScheduleList: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationScheduleTriggerHistory: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationScheduleFailures: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationScheduleResolveFailure: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationScheduleOperations: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationScheduleRetryFailure: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationScheduleAcknowledgeEscalation: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationScheduleActions: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationScheduleSave: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationScheduleEvaluate: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  automationScheduleTick: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'active',
  },
  generalLedgerPrepareCommercialAdjustmentPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareSupplierInvoicePosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareAssetCapitalizationPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareAssetDepreciationPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareAssetRetirementPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareAssetSaleDisposalPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareAssetLifecyclePosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPrepareProjectRevenueRecognitionPosting: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerPostJournal: {
    mode: 'permission', resource: 'finance.journal', action: 'post', scope: 'ledger-bound',
  },
  generalLedgerReverseJournal: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'ledger-bound',
  },
  generalLedgerCancelReversalJournal: {
    mode: 'permission', resource: 'finance.journal', action: 'update', scope: 'ledger-bound',
  },
  financialCreateBillingPlan: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'active',
  },
  financialCreateBillingClaim: {
    mode: 'permission', resource: 'finance.journal', action: 'create', scope: 'active',
  },
  revenueOpsSnapshot: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'revenue-operations-bound',
  },
  revenueOpsPeopleReadProjection: {
    mode: 'permission', resource: 'operations.workspace', action: 'read', scope: 'revenue-operations-bound',
  },
  revenueOpsUpdateProfile: {
    mode: 'permission', resource: 'sales.geography', action: 'update', scope: 'active',
  },
  revenueOpsCreateTerritory: {
    mode: 'permission', resource: 'sales.geography', action: 'create', scope: 'active',
  },
  revenueOpsCreateAssignmentRule: {
    mode: 'permission', resource: 'sales.geography', action: 'create', scope: 'active',
  },
  revenueOpsBulkAssign: {
    mode: 'permission', resource: 'crm.opportunity', action: 'update', scope: 'active',
  },
  revenueOpsCreateOpportunity: {
    mode: 'permission', resource: 'crm.opportunity', action: 'create', scope: 'active',
  },
  revenueOpsCreateQuote: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  revenueOpsTransitionQuote: {
    mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'active',
  },
  revenueOpsSubmitQuoteForApproval: {
    mode: 'permission', resource: 'sales.commercial', action: 'submit', scope: 'active',
  },
  revenueOpsDecideQuoteApproval: {
    mode: 'permission', resource: 'sales.commercial', action: 'approve', scope: 'active',
  },
  revenueOpsExportQuotePdf: {
    mode: 'permission', resource: 'sales.commercial', action: 'export', scope: 'active',
  },
  revenueOpsConvertQuoteToSalesOrder: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  revenueOpsTransitionSalesOrder: {
    mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'active',
  },
  revenueOpsUpdateFulfilmentTask: {
    mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'active',
  },
  revenueOpsRecordDeliveryEvidence: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  revenueOpsCreateServiceMilestone: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  revenueOpsTransitionServiceMilestone: {
    mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'active',
  },
  revenueOpsCreateGstTaxCode: {
    mode: 'permission', resource: 'sales.catalog', action: 'create', scope: 'active',
  },
  revenueOpsCreateCatalogProduct: {
    mode: 'permission', resource: 'sales.catalog', action: 'create', scope: 'active',
  },
  revenueOpsCreatePriceList: {
    mode: 'permission', resource: 'sales.pricing', action: 'create', scope: 'active',
  },
  revenueOpsCreatePriceListEntry: {
    mode: 'permission', resource: 'sales.pricing', action: 'create', scope: 'active',
  },
  revenueOpsCreateDiscountPolicy: {
    mode: 'permission', resource: 'sales.pricing', action: 'create', scope: 'active',
  },
  revenueOpsSubmitPriceListForApproval: {
    mode: 'permission', resource: 'sales.pricing', action: 'submit', scope: 'active',
  },
  revenueOpsDecidePriceListApproval: {
    mode: 'permission', resource: 'sales.pricing', action: 'approve', scope: 'active',
  },
  revenueOpsCreatePaymentTerm: {
    mode: 'permission', resource: 'finance.receivable', action: 'create', scope: 'active',
  },
  retailCreateCounter: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailPrepareDeviceTransport: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailRecordDeviceTransport: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'active',
  },
  retailRecordNativeDeviceDriverResult: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'active',
  },
  retailExecuteDeviceTransport: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'active',
  },
  retailRetryDeviceTransport: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'active',
  },
  retailPreflightDeviceTransport: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailRecordDevicePreflightEvidence: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailCreateDeviceAdapterProfile: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailApproveDeviceAdapterProfile: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'active',
  },
  retailRecordDeviceAdapterAcknowledgement: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'active',
  },
  retailActivateDeviceAdapterProfile: {
    mode: 'permission', resource: 'inventory.master', action: 'admin', scope: 'active',
  },
  retailSuspendDeviceAdapterProfile: {
    mode: 'permission', resource: 'inventory.master', action: 'admin', scope: 'active',
  },
  retailOpenCashierShift: {
    mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'active',
  },
  retailCheckout: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailCreateLoyaltyAccount: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailRedeemLoyaltyPoints: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailCreateCustomerVisit: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailLinkCustomerVisitToSale: {
    mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'active',
  },
  retailCreateSalesCommission: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailDecideSalesCommission: {
    mode: 'permission', resource: 'sales.commercial', action: 'approve', scope: 'active',
  },
  retailPaySalesCommission: {
    mode: 'permission', resource: 'finance.payables', action: 'create', scope: 'active',
  },
  retailRequestCashierShiftClose: {
    mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'active',
  },
  retailDecideCashierShiftClose: {
    mode: 'permission', resource: 'sales.commercial', action: 'approve', scope: 'active',
  },
  retailRequestCashierShiftVarianceResolution: {
    mode: 'permission', resource: 'finance.payables', action: 'create', scope: 'active',
  },
  retailDecideCashierShiftVarianceResolution: {
    mode: 'permission', resource: 'finance.payables', action: 'approve', scope: 'active',
  },
  retailCreateReturnRequest: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailInspectReturn: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active',
  },
  retailDecideReturn: {
    mode: 'permission', resource: 'inventory.execution', action: 'approve', scope: 'active',
  },
  retailRequestReturnSettlement: {
    mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'active',
  },
  retailDecideReturnSettlement: {
    mode: 'permission', resource: 'finance.receivable', action: 'approve', scope: 'active',
  },
  retailConfirmReturnProviderRefund: {
    mode: 'permission', resource: 'finance.bank-reconciliation', action: 'approve', scope: 'active',
  },
  retailPrepareSettlementJournal: {
    mode: 'permission', resource: 'finance.receivable', action: 'create', scope: 'active',
  },
  retailLinkCommerceReturn: {
    mode: 'permission', resource: 'finance.receivable', action: 'create', scope: 'active',
  },
  retailCreateCatalogCategory: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailCreateCatalogBrand: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailSaveMerchandisingProfile: {
    mode: 'permission', resource: 'inventory.master', action: 'update', scope: 'active',
  },
  retailCreateBarcodeSequence: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailResetBarcodeSequence: {
    mode: 'permission', resource: 'inventory.master', action: 'update', scope: 'active',
  },
  retailAssignBarcode: {
    mode: 'permission', resource: 'inventory.master', action: 'update', scope: 'active',
  },
  retailCreateLabelPrintRun: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailCreateProductCombo: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  revenueOpsCreateInvoiceDraft: {
    mode: 'permission', resource: 'finance.receivable', action: 'create', scope: 'active',
  },
  revenueOpsIssueInvoice: {
    mode: 'permission', resource: 'finance.receivable', action: 'post', scope: 'active',
  },
  revenueOpsCreateCreditDebitNote: {
    mode: 'permission', resource: 'finance.receivable', action: 'create', scope: 'active',
  },
  revenueOpsRecordPayment: {
    mode: 'permission', resource: 'finance.receivable', action: 'create', scope: 'active',
  },
  revenueOpsApplyUnappliedReceipt: {
    mode: 'permission', resource: 'finance.receivable', action: 'create', scope: 'active',
  },
  revenueOpsReconcilePayment: {
    mode: 'permission', resource: 'finance.receivable', action: 'approve', scope: 'active',
  },
  revenueOpsExportJournal: {
    mode: 'permission', resource: 'finance.receivable', action: 'export', scope: 'active',
  },
  revenueOpsExportInvoicePdf: {
    mode: 'permission', resource: 'finance.receivable', action: 'export', scope: 'active',
  },
  crmSnapshot: {
    mode: 'permission', resource: 'crm.opportunity', action: 'read', scope: 'active',
  },
  crmCreateLead: {
    mode: 'permission', resource: 'crm.opportunity', action: 'create', scope: 'active',
  },
  crmMoveOpportunity: {
    mode: 'permission', resource: 'crm.opportunity', action: 'update', scope: 'active',
  },
  crmCompleteActivity: {
    mode: 'permission', resource: 'crm.opportunity', action: 'update', scope: 'active',
  },
  crmDepthSnapshot: {
    mode: 'permission', resource: 'crm.configuration', action: 'read', scope: 'active',
  },
  crmDepthUpdatePipeline: {
    mode: 'permission', resource: 'crm.configuration', action: 'update', scope: 'active',
  },
  crmDepthCreateScoringRule: {
    mode: 'permission', resource: 'crm.configuration', action: 'create', scope: 'active',
  },
  crmDepthCreateCampaign: {
    mode: 'permission', resource: 'crm.configuration', action: 'create', scope: 'active',
  },
  crmDepthTransitionCampaign: {
    mode: 'permission', resource: 'crm.configuration', action: 'update', scope: 'active',
  },
  crmDepthCreateSavedView: {
    mode: 'permission', resource: 'crm.configuration', action: 'create', scope: 'active',
  },
  crmDepthPreviewLeadImport: {
    mode: 'permission', resource: 'crm.import', action: 'create', scope: 'active',
  },
  crmDepthCommitImport: {
    mode: 'permission', resource: 'crm.import', action: 'submit', scope: 'active',
  },
  crmDepthConfigureAdapter: {
    mode: 'permission', resource: 'crm.integration', action: 'update', scope: 'active',
  },
  crmDepthRecordCommunication: {
    mode: 'permission', resource: 'crm.communication', action: 'create', scope: 'active',
  },
  inventoryCreateUom: { mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active' },
  inventoryCreateUomConversion: { mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active' },
  inventoryCreateItem: { mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active' },
  inventoryCreateVariant: { mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active' },
  inventoryCreateWarehouse: { mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active' },
  inventoryCreateZone: { mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active' },
  inventoryCreateBin: { mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active' },
  inventoryCreateReorderPolicy: { mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active' },
  inventoryReceive: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  inventoryCreatePutaway: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  inventoryCreatePick: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  inventoryTransitionTask: { mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active' },
  inventoryCreateTransfer: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  inventoryTransitionTransfer: { mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active' },
  inventoryCreateCycleCount: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  inventoryRecordCycleCount: { mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active' },
  inventoryDecideCycleCount: { mode: 'permission', resource: 'inventory.execution', action: 'approve', scope: 'active' },
  inventoryGenerateReorderProposals: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  inventoryDecideReorderProposal: { mode: 'permission', resource: 'inventory.execution', action: 'approve', scope: 'active' },
  inventoryCreateValuationReview: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  inventoryDecideValuationReview: { mode: 'permission', resource: 'inventory.execution', action: 'approve', scope: 'active' },
  inventoryCreateDisposition: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  inventoryDecideDisposition: { mode: 'permission', resource: 'inventory.execution', action: 'approve', scope: 'active' },
  inventoryPostDisposition: { mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active' },
  revenueOpsCreatePincodeServiceabilityRule: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  revenueOpsDecidePincodeServiceabilityRule: { mode: 'permission', resource: 'inventory.execution', action: 'approve', scope: 'active' },
  revenueOpsCreateDeliveryPromise: { mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'active' },
  revenueOpsCreateCodCollectionCase: { mode: 'permission', resource: 'finance.receivable', action: 'create', scope: 'active' },
  revenueOpsRecordCodHandover: { mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active' },
  revenueOpsRecordCodCarrierCollection: { mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active' },
  financeRecordCodRemittance: { mode: 'permission', resource: 'finance.receivable', action: 'create', scope: 'active' },
  financeMatchCodBank: { mode: 'permission', resource: 'finance.bank-reconciliation', action: 'approve', scope: 'active' },
  financeCloseCodShortfall: { mode: 'permission', resource: 'finance.bank-reconciliation', action: 'approve', scope: 'active' },
  revenueOpsRecordCodException: { mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active' },
  procurementCreatePoFromRfq: { mode: 'permission', resource: 'procurement.purchase-order', action: 'create', scope: 'active' },
  procurementCreatePoFromReorder: { mode: 'permission', resource: 'procurement.purchase-order', action: 'create', scope: 'active' },
  procurementDecidePo: { mode: 'permission', resource: 'procurement.purchase-order', action: 'approve', scope: 'active' },
  procurementCreateRequisition: { mode: 'permission', resource: 'procurement.requisition', action: 'create', scope: 'active' },
  procurementDecideRequisition: { mode: 'permission', resource: 'procurement.requisition', action: 'approve', scope: 'active' },
  procurementCreateRfqFromRequisition: { mode: 'permission', resource: 'procurement.sourcing', action: 'create', scope: 'active' },
  procurementCreateSupplier: { mode: 'permission', resource: 'procurement.supplier', action: 'create', scope: 'active' },
  procurementDecideSupplier: { mode: 'permission', resource: 'procurement.supplier', action: 'approve', scope: 'active' },
  procurementCreateRfq: { mode: 'permission', resource: 'procurement.sourcing', action: 'create', scope: 'active' },
  procurementIssueRfq: { mode: 'permission', resource: 'procurement.sourcing', action: 'submit', scope: 'active' },
  procurementRecordQuotation: { mode: 'permission', resource: 'procurement.sourcing', action: 'create', scope: 'active' },
  procurementAwardRfq: { mode: 'permission', resource: 'procurement.sourcing', action: 'approve', scope: 'active' },
  procurementRecordGoodsReceipt: { mode: 'permission', resource: 'procurement.receiving', action: 'create', scope: 'active' },
  procurementCreateLandedCost: { mode: 'permission', resource: 'procurement.receiving', action: 'create', scope: 'active' },
  procurementDecideLandedCost: { mode: 'permission', resource: 'procurement.receiving', action: 'approve', scope: 'active' },
  procurementRecordSupplierInvoice: { mode: 'permission', resource: 'procurement.payable', action: 'create', scope: 'active' },
  procurementDecideThreeWayMatch: { mode: 'permission', resource: 'procurement.payable', action: 'approve', scope: 'active' },
  manufacturingCreateWorkCenter: { mode: 'permission', resource: 'manufacturing.engineering', action: 'create', scope: 'active' },
  manufacturingCreateBomRevision: { mode: 'permission', resource: 'manufacturing.engineering', action: 'create', scope: 'active' },
  manufacturingDecideBomRevision: { mode: 'permission', resource: 'manufacturing.release', action: 'approve', scope: 'active' },
  manufacturingCreateQualityPlan: { mode: 'permission', resource: 'manufacturing.engineering', action: 'create', scope: 'active' },
  manufacturingDecideQualityPlan: { mode: 'permission', resource: 'manufacturing.release', action: 'approve', scope: 'active' },
  manufacturingCreateWorkOrder: { mode: 'permission', resource: 'manufacturing.execution', action: 'create', scope: 'active' },
  manufacturingDecideWorkOrder: { mode: 'permission', resource: 'manufacturing.release', action: 'approve', scope: 'active' },
  manufacturingStartWorkOrder: { mode: 'permission', resource: 'manufacturing.execution', action: 'update', scope: 'active' },
  manufacturingIssueMaterial: { mode: 'permission', resource: 'manufacturing.execution', action: 'create', scope: 'active' },
  manufacturingRecordInspection: { mode: 'permission', resource: 'manufacturing.quality', action: 'create', scope: 'active' },
  manufacturingResolveNonconformance: { mode: 'permission', resource: 'manufacturing.quality', action: 'approve', scope: 'active' },
  manufacturingRecordOutput: { mode: 'permission', resource: 'manufacturing.execution', action: 'create', scope: 'active' },
  assetCreateCategory: { mode: 'permission', resource: 'finance.asset-category', action: 'create', scope: 'active' },
  assetCreateManagedAsset: { mode: 'permission', resource: 'finance.asset-register', action: 'create', scope: 'active' },
  assetSubmitManagedAsset: { mode: 'permission', resource: 'finance.asset-register', action: 'submit', scope: 'active' },
  assetDecideManagedAsset: { mode: 'permission', resource: 'finance.asset-register', action: 'approve', scope: 'active' },
  assetCreateCapitalization: { mode: 'permission', resource: 'finance.asset-capitalization', action: 'create', scope: 'active' },
  assetDecideCapitalization: { mode: 'permission', resource: 'finance.asset-capitalization', action: 'approve', scope: 'active' },
  assetCreateDepreciationPolicy: { mode: 'permission', resource: 'finance.asset-depreciation-policy', action: 'create', scope: 'active' },
  assetDecideDepreciationPolicy: { mode: 'permission', resource: 'finance.asset-depreciation-policy', action: 'approve', scope: 'active' },
  assetCreateDepreciationRun: { mode: 'permission', resource: 'finance.asset-depreciation-run', action: 'create', scope: 'active' },
  assetDecideDepreciationRun: { mode: 'permission', resource: 'finance.asset-depreciation-run', action: 'approve', scope: 'active' },
  assetCreateRetirement: { mode: 'permission', resource: 'finance.asset-retirement', action: 'create', scope: 'active' },
  assetDecideRetirement: { mode: 'permission', resource: 'finance.asset-retirement', action: 'approve', scope: 'active' },
  assetCompleteRetirement: { mode: 'permission', resource: 'finance.asset-retirement', action: 'approve', scope: 'active' },
  assetCreateCustodyTransfer: { mode: 'permission', resource: 'maintenance.asset-transfer', action: 'create', scope: 'active' },
  assetDecideCustodyTransfer: { mode: 'permission', resource: 'maintenance.asset-transfer', action: 'approve', scope: 'active' },
  assetReceiveCustodyTransfer: { mode: 'permission', resource: 'maintenance.asset-transfer', action: 'update', scope: 'active' },
  assetCreateComponentization: { mode: 'permission', resource: 'maintenance.asset-componentization', action: 'create', scope: 'active' },
  assetDecideComponentization: { mode: 'permission', resource: 'maintenance.asset-componentization', action: 'approve', scope: 'active' },
  assetCreateComponentAllocation: { mode: 'permission', resource: 'finance.asset-component-allocation', action: 'create', scope: 'active' },
  assetDecideComponentAllocation: { mode: 'permission', resource: 'finance.asset-component-allocation', action: 'approve', scope: 'active' },
  assetCreateTransferAccounting: { mode: 'permission', resource: 'finance.asset-transfer-accounting', action: 'create', scope: 'active' },
  assetDecideTransferAccounting: { mode: 'permission', resource: 'finance.asset-transfer-accounting', action: 'approve', scope: 'active' },
  assetDispatchTransferAccounting: { mode: 'permission', resource: 'finance.asset-transfer-accounting', action: 'update', scope: 'active' },
  assetReceiveTransferAccounting: { mode: 'permission', resource: 'finance.asset-transfer-accounting', action: 'update', scope: 'active' },
  assetCreateSaleDisposal: { mode: 'permission', resource: 'finance.asset-sale-disposal', action: 'create', scope: 'active' },
  assetDecideSaleDisposal: { mode: 'permission', resource: 'finance.asset-sale-disposal', action: 'approve', scope: 'active' },
  assetCompleteSaleDisposal: { mode: 'permission', resource: 'finance.asset-sale-disposal', action: 'update', scope: 'active' },
  assetRunLifecycleAction: { mode: 'permission', resource: 'maintenance.asset-lifecycle', action: 'create', scope: 'active' },
  maintenanceCreatePreventivePlan: { mode: 'permission', resource: 'maintenance.plan', action: 'create', scope: 'active' },
  maintenanceGenerateDueWorkOrder: { mode: 'permission', resource: 'maintenance.work-order', action: 'create', scope: 'active' },
  maintenanceStartWorkOrder: { mode: 'permission', resource: 'maintenance.work-order', action: 'update', scope: 'active' },
  maintenanceCompleteWorkOrder: { mode: 'permission', resource: 'maintenance.work-order', action: 'update', scope: 'active' },
  maintenanceVerifyWorkOrder: { mode: 'permission', resource: 'maintenance.work-order', action: 'approve', scope: 'active' },
  deliveryCreateProject: { mode: 'permission', resource: 'delivery.project', action: 'create', scope: 'active' },
  deliveryDecideProject: { mode: 'permission', resource: 'delivery.project', action: 'approve', scope: 'active' },
  deliveryTransitionProject: { mode: 'permission', resource: 'delivery.project', action: 'update', scope: 'active' },
  deliveryCreateTask: { mode: 'permission', resource: 'delivery.project', action: 'create', scope: 'active' },
  deliveryTransitionTask: { mode: 'permission', resource: 'delivery.project', action: 'update', scope: 'active' },
  deliveryRecordTime: { mode: 'permission', resource: 'delivery.project', action: 'create', scope: 'active' },
  deliveryDecideTime: { mode: 'permission', resource: 'delivery.project', action: 'approve', scope: 'active' },
  deliveryCreateAgreement: { mode: 'permission', resource: 'delivery.service', action: 'create', scope: 'active' },
  deliveryDecideAgreement: { mode: 'permission', resource: 'delivery.service', action: 'approve', scope: 'active' },
  deliveryCreateTicket: { mode: 'permission', resource: 'delivery.service', action: 'create', scope: 'active' },
  deliveryTransitionTicket: { mode: 'permission', resource: 'delivery.service', action: 'update', scope: 'active' },
  deliveryCreateFieldJob: { mode: 'permission', resource: 'delivery.service', action: 'create', scope: 'active' },
  deliveryTransitionFieldJob: { mode: 'permission', resource: 'delivery.service', action: 'update', scope: 'active' },
  workforceCreateProfile: { mode: 'permission', resource: 'workforce.profile', action: 'create', scope: 'active' },
  workforceDecideProfile: { mode: 'permission', resource: 'workforce.profile', action: 'approve', scope: 'active' },
  workforceRecordAvailability: { mode: 'permission', resource: 'workforce.availability', action: 'create', scope: 'active' },
  workforceDecideAvailability: { mode: 'permission', resource: 'workforce.availability', action: 'approve', scope: 'active' },
  workforceCreateAllocation: { mode: 'permission', resource: 'workforce.allocation', action: 'create', scope: 'active' },
  workforceCancelAllocation: { mode: 'permission', resource: 'workforce.allocation', action: 'update', scope: 'active' },
  revenueOpsCreateSegment: {
    mode: 'permission', resource: 'crm.configuration', action: 'create', scope: 'active',
  },
};

const REVENUE_OPERATIONS_BOUND_PREFIXES = [
  'epic-bos:revenue-ops:',
  'epic-bos:statutory:',
  'epic-bos:provider:',
  'epic-bos:collections:',
  'epic-bos:finance:',
  'epic-bos:procurement:',
  'epic-bos:treasury:',
  'epic-bos:manufacturing:',
  'epic-bos:asset:',
  'epic-bos:maintenance:',
  'epic-bos:delivery:',
  'epic-bos:workforce:',
  'epic-bos:payroll:',
  'epic-bos:financial:',
  'epic-bos:commercial:',
  'epic-bos:inventory:',
  'epic-bos:retail:',
] as const;

export const IPC_AUTHORIZATION_POLICY: Readonly<
  Record<IpcChannelKey, IpcAuthorizationPolicy>
> = Object.freeze(
  Object.fromEntries(
    Object.entries(BASE_IPC_AUTHORIZATION_POLICY).map(([key, policy]) => {
      const channel = IPC_CHANNELS[key as IpcChannelKey];
      const isRevenueOperationsRoute = REVENUE_OPERATIONS_BOUND_PREFIXES.some(
        (prefix) => channel.startsWith(prefix),
      );
      if (
        policy.mode === 'permission' &&
        policy.scope === 'active' &&
        isRevenueOperationsRoute
      ) {
        return [key, { ...policy, scope: 'revenue-operations-bound' }];
      }
      return [key, policy];
    }),
  ) as Record<IpcChannelKey, IpcAuthorizationPolicy>,
);

const channelKeyByName = new Map<string, IpcChannelKey>(
  Object.entries(IPC_CHANNELS).map(([key, name]) => [name, key as IpcChannelKey]),
);

export function getIpcAuthorizationPolicy(channel: string): IpcAuthorizationPolicy {
  const key = channelKeyByName.get(channel);
  if (!key) throw new Error(`IPC channel ${channel} is not declared in the authorization manifest.`);
  const policy = IPC_AUTHORIZATION_POLICY[key];
  if (!policy) throw new Error(`IPC channel ${channel} has no authorization policy.`);
  return policy;
}

export function assertIpcAuthorizationPolicyComplete(): void {
  const missing = channelKeys.filter((key) => !IPC_AUTHORIZATION_POLICY[key]);
  if (missing.length) {
    throw new Error(`IPC authorization policy is incomplete: ${missing.join(', ')}.`);
  }
}
