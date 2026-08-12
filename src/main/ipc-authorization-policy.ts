import { IPC_CHANNELS } from '../shared/contracts';
import type { BusinessAction } from '../shared/kernel-contracts';

type IpcChannelKey = keyof typeof IPC_CHANNELS;

export type IpcAuthorizationPolicy =
  | { mode: 'trusted' }
  | { mode: 'delegated'; reason: string }
  | {
      mode: 'permission';
      resource: string;
      action: BusinessAction;
      scope: 'active' | 'ledger-bound' | 'revenue-operations-bound';
    };

const channelKeys = Object.keys(IPC_CHANNELS) as IpcChannelKey[];

/**
 * Every route below is intentionally named. These handlers already resolve a
 * validated self/record scope within their own typed command boundary, but
 * their authorization still needs to be promoted to an exact resource/action
 * policy in the domain batches listed in the Phase 0 register. This explicit
 * list replaces the former silent session baseline: a newly declared channel
 * now fails the completeness check until it has a named posture.
 */
const EXPLICIT_DELEGATED_SCOPE_CHANNEL_KEYS = [
] as const satisfies readonly IpcChannelKey[];

const delegatedScopeBaseline = Object.fromEntries(
  EXPLICIT_DELEGATED_SCOPE_CHANNEL_KEYS.map((key) => [key, {
    mode: 'delegated' as const,
    reason: 'The handler resolves a validated self or record scope before the mutation.',
  }]),
) as Partial<Record<IpcChannelKey, IpcAuthorizationPolicy>>;

function completeIpcAuthorizationPolicyMap(
  policy: Partial<Record<IpcChannelKey, IpcAuthorizationPolicy>>,
): Record<IpcChannelKey, IpcAuthorizationPolicy> {
  const missing = channelKeys.filter((key) => !policy[key]);
  const unknown = Object.keys(policy).filter(
    (key) => !channelKeys.includes(key as IpcChannelKey),
  );
  if (missing.length || unknown.length) {
    throw new Error(
      `IPC authorization policy is incomplete: missing [${missing.join(', ')}], unknown [${unknown.join(', ')}].`,
    );
  }
  return policy as Record<IpcChannelKey, IpcAuthorizationPolicy>;
}

const BASE_IPC_AUTHORIZATION_POLICY = completeIpcAuthorizationPolicyMap({
  ...delegatedScopeBaseline,
  systemInfo: { mode: 'trusted' },
  systemBuildProvenance: { mode: 'trusted' },
  authStatus: { mode: 'trusted' },
  authBootstrapOwner: { mode: 'trusted' },
  authLogin: { mode: 'trusted' },
  authLogout: { mode: 'trusted' },
  authLock: { mode: 'trusted' },
  storageListAttachments: {
    mode: 'delegated',
    reason: 'Attachment resource is resolved from the validated request payload and active company/branch authorization.',
  },
  storageAddAttachment: {
    mode: 'delegated',
    reason: 'Attachment resource is resolved from the validated request payload and active company/branch authorization.',
  },
  storageExportAttachment: {
    mode: 'delegated',
    reason: 'Attachment resource is resolved from encrypted metadata after active company/branch authorization.',
  },
  storageListRestoreDrills: {
    mode: 'permission', resource: 'kernel.backup', action: 'read', scope: 'active',
  },
  storageRunRestoreDrill: {
    mode: 'permission', resource: 'kernel.backup', action: 'admin', scope: 'active',
  },
  storageRewrapLocalBackups: {
    mode: 'permission', resource: 'kernel.backup', action: 'admin', scope: 'active',
  },
  integrationGetRetailCertificationPack: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  integrationExportRetailCertificationPack: {
    mode: 'permission', resource: 'release.control', action: 'export', scope: 'active',
  },
  integrationVerifyRetailCertificationPack: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  securityRotateArtifactKeyEnvelopes: {
    mode: 'permission', resource: 'release.control', action: 'admin', scope: 'active',
  },
  crmDepthRecordCommunicationDelivery: {
    mode: 'permission', resource: 'crm.communication', action: 'update', scope: 'revenue-operations-bound',
  },
  retailCreateUnifiedOrderPickTasks: {
    mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'revenue-operations-bound',
  },
  retailCompleteUnifiedOrderPickTasks: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'revenue-operations-bound',
  },
  retailCompleteUnifiedOrderShipmentPackage: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'revenue-operations-bound',
  },
  retailPrepareUnifiedOrderDispatch: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'revenue-operations-bound',
  },
  retailCreateCommissionPayoutBatch: {
    mode: 'permission', resource: 'finance.payables', action: 'create', scope: 'revenue-operations-bound',
  },
  retailDecideCommissionPayoutBatch: {
    mode: 'permission', resource: 'finance.payables', action: 'approve', scope: 'revenue-operations-bound',
  },
  retailReleaseCommissionPayoutBatch: {
    mode: 'permission', resource: 'finance.payables', action: 'create', scope: 'revenue-operations-bound',
  },
  retailCreateInterBranchTransfer: {
    mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'revenue-operations-bound',
  },
  retailCreateScaleProfile: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
  },
  retailCreatePrinterAdapter: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
  },
  retailTestPrinterAdapter: {
    mode: 'permission', resource: 'inventory.master', action: 'update', scope: 'revenue-operations-bound',
  },
  retailCreateLabelPrintDispatch: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
  },
  retailDecideLabelPrintDispatch: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
  },
  retailPrepareCatalogBulkEdit: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
  },
  retailApplyCatalogBulkEdit: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
  },
  retailCreatePurchaseOcrDocument: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
  },
  retailDecidePurchaseOcr: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
  },
  retailConvertPurchaseOcr: {
    mode: 'permission', resource: 'inventory.master', action: 'update', scope: 'revenue-operations-bound',
  },
  retailCreateCommerceConnector: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
  },
  retailConfigureCommerceCredentials: {
    mode: 'permission', resource: 'inventory.master', action: 'update', scope: 'revenue-operations-bound',
  },
  retailCreateCommerceSyncRun: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
  },
  retailExecuteCommerceSync: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
  },
  retailRecordCommerceSync: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
  },
  retailImportCommerceOrder: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
  },
  retailHandoffCommerceOrder: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'revenue-operations-bound',
  },
  retailCreateSettlementReconciliation: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
  },
  retailDecideSettlementReconciliation: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
  },
  retailCreateSettlementAllocationPack: {
    mode: 'permission', resource: 'finance.receivable', action: 'create', scope: 'revenue-operations-bound',
  },
  retailDecideSettlementAllocationPack: {
    mode: 'permission', resource: 'finance.receivable', action: 'approve', scope: 'revenue-operations-bound',
  },
  retailCreateCommerceConflictResolution: {
    mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'revenue-operations-bound',
  },
  retailDecideCommerceConflictResolution: {
    mode: 'permission', resource: 'inventory.execution', action: 'approve', scope: 'revenue-operations-bound',
  },
  retailCreateSettlementWithholdingEvidence: {
    mode: 'permission', resource: 'finance.receivable', action: 'create', scope: 'revenue-operations-bound',
  },
  retailDecideSettlementWithholdingEvidence: {
    mode: 'permission', resource: 'finance.receivable', action: 'approve', scope: 'revenue-operations-bound',
  },
  retailCreateOcrProviderProfile: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
  },
  retailConfigureOcrProvider: {
    mode: 'permission', resource: 'inventory.master', action: 'update', scope: 'revenue-operations-bound',
  },
  retailExecuteOcr: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
  },
  retailTestOcrProvider: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
  },
  retailPreparePurchaseOcrMapping: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
  },
  retailApplyPurchaseOcrMapping: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
  },
  revenueOpsPrepareStatutoryExchange: {
    mode: 'permission', resource: 'statutory.exchange', action: 'create', scope: 'active',
  },
  revenueOpsSubmitStatutoryExchange: {
    mode: 'permission', resource: 'statutory.exchange', action: 'submit', scope: 'revenue-operations-bound',
  },
  revenueOpsRecordStatutoryResponse: {
    mode: 'permission', resource: 'statutory.exchange', action: 'post', scope: 'revenue-operations-bound',
  },
  statutoryConfigureAdapter: {
    mode: 'permission', resource: 'statutory.adapter', action: 'admin', scope: 'active',
  },
  statutoryConfigureCredentials: {
    mode: 'permission', resource: 'statutory.credential', action: 'admin', scope: 'active',
  },
  statutoryPrepareOperation: {
    mode: 'permission', resource: 'statutory.operation', action: 'create', scope: 'active',
  },
  statutorySubmitOperation: {
    mode: 'permission', resource: 'statutory.operation', action: 'submit', scope: 'revenue-operations-bound',
  },
  statutoryRecordOperationResponse: {
    mode: 'permission', resource: 'statutory.operation', action: 'post', scope: 'revenue-operations-bound',
  },
  statutoryPrepareConsolidatedEwb: {
    mode: 'permission', resource: 'statutory.consolidated-eway-bill', action: 'create', scope: 'active',
  },
  statutorySubmitConsolidatedEwb: {
    mode: 'permission', resource: 'statutory.consolidated-eway-bill', action: 'submit', scope: 'revenue-operations-bound',
  },
  statutoryRecordConsolidatedEwbResponse: {
    mode: 'permission', resource: 'statutory.consolidated-eway-bill', action: 'post', scope: 'revenue-operations-bound',
  },
  statutoryVerifySignature: {
    mode: 'permission', resource: 'statutory.signature', action: 'post', scope: 'active',
  },
  statutoryRunPortalReconciliation: {
    mode: 'permission', resource: 'statutory.portal-reconciliation', action: 'post', scope: 'active',
  },
  providerConfigureConnector: {
    mode: 'permission', resource: 'provider.connector', action: 'admin', scope: 'active',
  },
  providerConfigureCredentials: {
    mode: 'permission', resource: 'provider.credential', action: 'admin', scope: 'active',
  },
  providerCreateConformanceCase: {
    mode: 'permission', resource: 'provider.conformance-case', action: 'create', scope: 'active',
  },
  providerPlanConformancePack: {
    mode: 'permission', resource: 'provider.conformance-case', action: 'create', scope: 'active',
  },
  providerExecutePreflight: {
    mode: 'permission', resource: 'provider.conformance-case', action: 'create', scope: 'active',
  },
  providerRecordConformanceResult: {
    mode: 'permission', resource: 'provider.conformance-case', action: 'update', scope: 'revenue-operations-bound',
  },
  providerApproveConnector: {
    mode: 'permission', resource: 'provider.connector', action: 'approve', scope: 'revenue-operations-bound',
  },
  providerPrepareSubmission: {
    mode: 'permission', resource: 'provider.submission', action: 'create', scope: 'active',
  },
  providerHandOffSubmission: {
    mode: 'permission', resource: 'provider.submission', action: 'post', scope: 'revenue-operations-bound',
  },
  providerRecordSubmissionResponse: {
    mode: 'permission', resource: 'provider.submission', action: 'post', scope: 'revenue-operations-bound',
  },
  providerRunReconciliation: {
    mode: 'permission', resource: 'provider.reconciliation', action: 'post', scope: 'active',
  },
  collectionsProposeCreditLimit: {
    mode: 'permission', resource: 'finance.credit-limit', action: 'submit', scope: 'active',
  },
  collectionsDecideCreditLimit: {
    mode: 'permission', resource: 'finance.credit-limit', action: 'approve', scope: 'revenue-operations-bound',
  },
  collectionsRunDunning: {
    mode: 'permission', resource: 'finance.dunning', action: 'read', scope: 'active',
  },
  collectionsRecordActivity: {
    mode: 'permission', resource: 'finance.collection-activity', action: 'create', scope: 'revenue-operations-bound',
  },
  collectionsOpenDispute: {
    mode: 'permission', resource: 'finance.receivable-dispute', action: 'create', scope: 'active',
  },
  collectionsResolveDispute: {
    mode: 'permission', resource: 'finance.receivable-dispute', action: 'approve', scope: 'revenue-operations-bound',
  },
  collectionsRequestWriteOff: {
    mode: 'permission', resource: 'finance.write-off', action: 'submit', scope: 'active',
  },
  collectionsDecideWriteOff: {
    mode: 'permission', resource: 'finance.write-off', action: 'approve', scope: 'revenue-operations-bound',
  },
  financeCreateWithholdingPolicy: {
    mode: 'permission', resource: 'finance.withholding-policy', action: 'admin', scope: 'active',
  },
  financeRecordWithholdingEntry: {
    mode: 'permission', resource: 'finance.withholding-entry', action: 'create', scope: 'active',
  },
  financeTransitionWithholdingEntry: {
    mode: 'permission', resource: 'finance.withholding-entry', action: 'post', scope: 'active',
  },
  financePrepareZeroRatedSupply: {
    mode: 'permission', resource: 'finance.zero-rated-supply-review', action: 'create', scope: 'active',
  },
  financeDecideZeroRatedSupply: {
    mode: 'permission', resource: 'finance.zero-rated-supply-review', action: 'approve', scope: 'active',
  },
  financeCreateBankAccount: {
    mode: 'permission', resource: 'finance.bank-account', action: 'admin', scope: 'active',
  },
  financePreviewBankStatement: {
    mode: 'permission', resource: 'finance.bank-statement-import', action: 'create', scope: 'active',
  },
  financeCommitBankStatement: {
    mode: 'permission', resource: 'finance.bank-statement-import', action: 'post', scope: 'active',
  },
  financeConfirmBankMatch: {
    mode: 'permission', resource: 'finance.bank-reconciliation', action: 'approve', scope: 'active',
  },
  financeExcludeBankLine: {
    mode: 'permission', resource: 'finance.bank-reconciliation', action: 'approve', scope: 'active',
  },
  treasuryRecordPosition: {
    mode: 'permission', resource: 'treasury.cash-position', action: 'create', scope: 'active',
  },
  treasuryRunCashForecast: {
    mode: 'permission', resource: 'treasury.cash-forecast', action: 'create', scope: 'active',
  },
  treasuryCreatePaymentProposal: {
    mode: 'permission', resource: 'treasury.payment', action: 'submit', scope: 'active',
  },
  treasuryDecidePaymentProposal: {
    mode: 'permission', resource: 'treasury.payment', action: 'approve', scope: 'revenue-operations-bound',
  },
  treasuryReleasePaymentProposal: {
    mode: 'permission', resource: 'treasury.payment', action: 'post', scope: 'revenue-operations-bound',
  },
  treasurySettlePaymentProposal: {
    mode: 'permission', resource: 'treasury.payment', action: 'post', scope: 'revenue-operations-bound',
  },
  treasuryRecordBankCharge: {
    mode: 'permission', resource: 'treasury.bank-charge', action: 'create', scope: 'active',
  },
  treasuryReconcileBankCharge: {
    mode: 'permission', resource: 'treasury.bank-charge', action: 'approve', scope: 'revenue-operations-bound',
  },
  treasuryOpenSettlementException: {
    mode: 'permission', resource: 'treasury.settlement-exception', action: 'create', scope: 'active',
  },
  treasuryResolveSettlementException: {
    mode: 'permission', resource: 'treasury.settlement-exception', action: 'approve', scope: 'revenue-operations-bound',
  },
  treasuryCreateLiquiditySweep: {
    mode: 'permission', resource: 'treasury.liquidity-sweep', action: 'submit', scope: 'active',
  },
  treasuryDecideLiquiditySweep: {
    mode: 'permission', resource: 'treasury.liquidity-sweep', action: 'approve', scope: 'revenue-operations-bound',
  },
  treasuryReleaseLiquiditySweep: {
    mode: 'permission', resource: 'treasury.liquidity-sweep', action: 'post', scope: 'revenue-operations-bound',
  },
  treasurySettleLiquiditySweep: {
    mode: 'permission', resource: 'treasury.liquidity-sweep', action: 'post', scope: 'revenue-operations-bound',
  },
  retailEnqueueOfflineSale: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailSyncOfflineSale: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailSyncOfflineQueue: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailResolveOfflineSale: {
    mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'active',
  },
  retailSendHubStoreEdgeSync: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailSyncHubStoreEdgeQueue: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailSaveHubStoreEdgeSyncPolicy: {
    mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'active',
  },
  retailIngestUnifiedOrder: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailPrepareUnifiedOrderHandoff: {
    mode: 'permission', resource: 'sales.commercial', action: 'approve', scope: 'active',
  },
  retailPrepareOrderHubHandoff: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailRecordOrderHubHandoffResult: {
    mode: 'permission', resource: 'sales.commercial', action: 'approve', scope: 'active',
  },
  retailPrepareOrderFulfilmentHandoff: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailDecideOrderFulfilmentHandoff: {
    mode: 'permission', resource: 'sales.commercial', action: 'approve', scope: 'active',
  },
  retailReserveUnifiedOrderStock: {
    mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active',
  },
  retailCreateUnifiedOrderShipmentPackage: {
    mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active',
  },
  retailDispatchUnifiedOrder: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active',
  },
  retailConfirmUnifiedOrderDelivery: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active',
  },
  retailReconcileUnifiedOrderRto: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active',
  },
  retailReconcileUnifiedOrderCancellation: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active',
  },
  retailReconcileUnifiedOrderReturn: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active',
  },
  retailRecordUnifiedOrderCarrierCallback: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active',
  },
  retailCreateExchange: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  retailDecideExchange: {
    mode: 'permission', resource: 'sales.commercial', action: 'approve', scope: 'active',
  },
  retailPrepareCreditNoteReconciliation: {
    mode: 'permission', resource: 'finance.receivable', action: 'create', scope: 'active',
  },
  retailRecordCreditNotePortalResponse: {
    mode: 'permission', resource: 'finance.receivable', action: 'approve', scope: 'active',
  },
  retailDecideInterBranchTransfer: {
    mode: 'permission', resource: 'inventory.execution', action: 'approve', scope: 'active',
  },
  retailDispatchInterBranchTransfer: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active',
  },
  retailReceiveInterBranchTransfer: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active',
  },
  retailReserveCommerceOrder: {
    mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active',
  },
  retailPrepareCommercePushBatch: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailDecideCommercePushBatch: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'active',
  },
  retailExecuteCommercePushBatch: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'active',
  },
  retailCreateCommerceCatalogMapping: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailDecideCommerceCatalogMapping: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'active',
  },
  retailDisableCommerceCatalogMapping: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'active',
  },
  retailTransitionCommerceOrder: {
    mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active',
  },
  retailCreateCommerceConformanceCase: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailPlanCommerceConformancePack: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailRecordCommerceConformance: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'active',
  },
  retailScanPurchaseExceptions: {
    mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'active',
  },
  retailResolvePurchaseException: {
    mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'active',
  },
  payrollCreateRegistration: { mode: 'permission', resource: 'payroll.employer-registration', action: 'create', scope: 'active' },
  payrollDecideRegistration: { mode: 'permission', resource: 'payroll.employer-registration', action: 'approve', scope: 'active' },
  payrollCreatePolicy: { mode: 'permission', resource: 'payroll.policy', action: 'create', scope: 'active' },
  payrollDecidePolicy: { mode: 'permission', resource: 'payroll.policy', action: 'approve', scope: 'active' },
  payrollCreateCompensation: { mode: 'permission', resource: 'payroll.compensation', action: 'create', scope: 'active' },
  payrollDecideCompensation: { mode: 'permission', resource: 'payroll.compensation', action: 'approve', scope: 'active' },
  payrollCreateBenefitPlan: { mode: 'permission', resource: 'payroll.benefit-plan', action: 'create', scope: 'active' },
  payrollDecideBenefitPlan: { mode: 'permission', resource: 'payroll.benefit-plan', action: 'approve', scope: 'active' },
  payrollCreateBenefitEnrollment: { mode: 'permission', resource: 'payroll.benefit-enrollment', action: 'create', scope: 'active' },
  payrollDecideBenefitEnrollment: { mode: 'permission', resource: 'payroll.benefit-enrollment', action: 'approve', scope: 'active' },
  payrollCreateRun: { mode: 'permission', resource: 'payroll.run', action: 'create', scope: 'active' },
  payrollDecideRun: { mode: 'permission', resource: 'payroll.run', action: 'approve', scope: 'active' },
  payrollFinalizeRun: { mode: 'permission', resource: 'payroll.run', action: 'post', scope: 'active' },
  payrollUpdateObligation: { mode: 'permission', resource: 'payroll.obligation', action: 'post', scope: 'active' },
  payrollCreateExpense: { mode: 'permission', resource: 'payroll.expense-claim', action: 'create', scope: 'active' },
  payrollDecideExpense: { mode: 'permission', resource: 'payroll.expense-claim', action: 'approve', scope: 'active' },
  payrollReimburseExpense: { mode: 'permission', resource: 'payroll.expense-claim', action: 'post', scope: 'active' },
  workforceRecordAttendance: { mode: 'permission', resource: 'workforce.attendance', action: 'create', scope: 'active' },
  workforceDecideAttendance: { mode: 'permission', resource: 'workforce.attendance', action: 'approve', scope: 'active' },
  workforceCreateLeaveType: { mode: 'permission', resource: 'workforce.leave-type', action: 'create', scope: 'active' },
  workforceDecideLeaveType: { mode: 'permission', resource: 'workforce.leave-type', action: 'approve', scope: 'active' },
  workforceCreateLeaveApplication: { mode: 'permission', resource: 'workforce.leave-application', action: 'create', scope: 'active' },
  workforceDecideLeaveApplication: { mode: 'permission', resource: 'workforce.leave-application', action: 'approve', scope: 'active' },
  payrollCreateAdjustment: { mode: 'permission', resource: 'payroll.adjustment', action: 'create', scope: 'active' },
  payrollDecideAdjustment: { mode: 'permission', resource: 'payroll.adjustment', action: 'approve', scope: 'active' },
  payrollCreateTaxDeclaration: { mode: 'permission', resource: 'payroll.tax-declaration', action: 'create', scope: 'active' },
  payrollDecideTaxDeclaration: { mode: 'permission', resource: 'payroll.tax-declaration', action: 'approve', scope: 'active' },
  payrollPublishPayslip: { mode: 'permission', resource: 'payroll.payslip', action: 'post', scope: 'active' },
  payrollAcknowledgePayslip: { mode: 'permission', resource: 'payroll.payslip', action: 'update', scope: 'active' },
  authChangePassword: {
    mode: 'delegated',
    reason: 'The authenticated password-change handler is self-bound to the active session token.',
  },
  authMfaStatus: {
    mode: 'delegated',
    reason: 'The authenticated MFA status handler is self-bound to the active session token.',
  },
  authMfaBeginEnrollment: {
    mode: 'delegated',
    reason: 'The authenticated MFA enrollment handler is self-bound to the active session token.',
  },
  authMfaConfirmEnrollment: {
    mode: 'delegated',
    reason: 'The authenticated MFA confirmation handler is self-bound to the active session token.',
  },
  authMfaDisable: {
    mode: 'delegated',
    reason: 'The authenticated MFA disable handler is self-bound to the active session token.',
  },
  revenueOpsCreateStockLocation: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  revenueOpsRecordStockMovement: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  revenueOpsReserveStock: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  revenueOpsReleaseStockReservation: { mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active' },
  revenueOpsCreateShipmentPackage: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  revenueOpsTransitionShipment: { mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active' },
  revenueOpsConfigureCarrierAdapter: { mode: 'permission', resource: 'inventory.execution', action: 'admin', scope: 'active' },
  revenueOpsCreateReturnAuthorization: { mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'active' },
  revenueOpsDecideReturnAuthorization: { mode: 'permission', resource: 'inventory.execution', action: 'approve', scope: 'active' },
  revenueOpsReceiveReturn: { mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active' },
  revenueOpsInspectReturn: { mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'active' },
  procurementUpdateRetailPriceForTargetMargin: { mode: 'permission', resource: 'inventory.price-list', action: 'update', scope: 'active' },
  financialDecideBillingPlan: { mode: 'permission', resource: 'financial.billing-plan', action: 'approve', scope: 'active' },
  financialDecideBillingClaim: { mode: 'permission', resource: 'financial.billing-claim', action: 'approve', scope: 'active' },
  financialDecideClosePeriod: { mode: 'permission', resource: 'financial.close-period', action: 'approve', scope: 'active' },
  financialReopenClosePeriod: { mode: 'permission', resource: 'financial.close-period', action: 'approve', scope: 'active' },
  kernelSnapshot: { mode: 'permission', resource: 'kernel.configuration', action: 'admin', scope: 'active' },
  kernelCreateCompany: { mode: 'permission', resource: 'kernel.company', action: 'admin', scope: 'active' },
  kernelUpdateCompany: { mode: 'permission', resource: 'kernel.company', action: 'admin', scope: 'active' },
  kernelCreateBranch: { mode: 'permission', resource: 'kernel.branch', action: 'admin', scope: 'active' },
  kernelUpdateBranch: { mode: 'permission', resource: 'kernel.branch', action: 'admin', scope: 'active' },
  kernelCreateUser: { mode: 'permission', resource: 'kernel.user', action: 'admin', scope: 'active' },
  kernelCreateRole: { mode: 'permission', resource: 'kernel.role', action: 'admin', scope: 'active' },
  kernelUpdateRolePolicy: { mode: 'permission', resource: 'kernel.role', action: 'admin', scope: 'active' },
  kernelUpsertFieldAccessRule: { mode: 'permission', resource: 'kernel.field-access', action: 'admin', scope: 'active' },
  kernelUpdateApprovalPolicy: { mode: 'permission', resource: 'kernel.approval-policy', action: 'admin', scope: 'active' },
  kernelAssignRole: { mode: 'permission', resource: 'kernel.user', action: 'admin', scope: 'active' },
  kernelIssueNumber: { mode: 'permission', resource: 'kernel.number-sequence', action: 'admin', scope: 'active' },
  kernelRegisterCustomField: { mode: 'permission', resource: 'kernel.custom-field', action: 'admin', scope: 'active' },
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
  revenueOpsListRetailCutoverPlans: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  revenueOpsFetchRetailHubCutoverAssessment: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  revenueOpsFetchRetailHubDeploymentPreflight: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  revenueOpsFetchRetailHubShadowImportPreflight: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  revenueOpsFetchRetailHubShadowImportSourceStatus: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  revenueOpsFetchRetailHubShadowImportPullReceipts: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  revenueOpsFetchRetailHubStoreEdgeWorkerMetrics: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  revenueOpsFetchRetailHubCoverageMap: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
  },
  revenueOpsCreateRetailCutoverPlan: {
    mode: 'permission', resource: 'release.control', action: 'create', scope: 'active',
  },
  revenueOpsCreateRetailCutoverPlanFromHubAssessment: {
    mode: 'permission', resource: 'release.control', action: 'create', scope: 'active',
  },
  revenueOpsAdvanceRetailCutover: {
    mode: 'permission', resource: 'release.control', action: 'approve', scope: 'active',
  },
  revenueOpsImportRetailProductPack: {
    mode: 'permission', resource: 'sales.catalog', action: 'create', scope: 'active',
  },
  revenueOpsCreateGstRegistration: {
    mode: 'permission', resource: 'sales.catalog', action: 'create', scope: 'active',
  },
  revenueOpsCreatePlaceOfSupplyReview: {
    mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'active',
  },
  revenueOpsDecidePlaceOfSupplyReview: {
    mode: 'permission', resource: 'sales.commercial', action: 'approve', scope: 'active',
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
    mode: 'permission', resource: 'finance.chart-of-accounts', action: 'admin', scope: 'ledger-bound',
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
  kernelTransitionWorkflow: {
    mode: 'permission', resource: 'kernel.workflow', action: 'update', scope: 'active',
  },
  kernelDecideApproval: {
    mode: 'permission', resource: 'kernel.approval', action: 'approve', scope: 'active',
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
  integrationVerifyProviderCertification: {
    mode: 'permission', resource: 'release.control', action: 'read', scope: 'active',
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
  financialCreateClosePeriod: {
    mode: 'permission', resource: 'finance.period', action: 'create', scope: 'active',
  },
  financialConsumeEntitlement: {
    mode: 'permission', resource: 'finance.entitlement', action: 'update', scope: 'active',
  },
  commercialCreateExchangeRate: {
    mode: 'permission', resource: 'commercial.currency', action: 'create', scope: 'active',
  },
  commercialDecideExchangeRate: {
    mode: 'permission', resource: 'commercial.currency', action: 'approve', scope: 'active',
  },
  commercialCreateCurrencyProfile: {
    mode: 'permission', resource: 'commercial.currency', action: 'create', scope: 'active',
  },
  commercialDecideCurrencyProfile: {
    mode: 'permission', resource: 'commercial.currency', action: 'approve', scope: 'active',
  },
  commercialCreateVariation: {
    mode: 'permission', resource: 'commercial.contract', action: 'create', scope: 'active',
  },
  commercialDecideVariation: {
    mode: 'permission', resource: 'commercial.contract', action: 'approve', scope: 'active',
  },
  commercialCreateRetainer: {
    mode: 'permission', resource: 'commercial.retainer', action: 'create', scope: 'active',
  },
  commercialDecideRetainer: {
    mode: 'permission', resource: 'commercial.retainer', action: 'approve', scope: 'active',
  },
  commercialCreateDrawdown: {
    mode: 'permission', resource: 'commercial.retainer', action: 'create', scope: 'active',
  },
  commercialDecideDrawdown: {
    mode: 'permission', resource: 'commercial.retainer', action: 'approve', scope: 'active',
  },
  commercialCreateResourcePlan: {
    mode: 'permission', resource: 'commercial.resource-plan', action: 'create', scope: 'active',
  },
  commercialDecideResourcePlan: {
    mode: 'permission', resource: 'commercial.resource-plan', action: 'approve', scope: 'active',
  },
  commercialGenerateMarginReview: {
    mode: 'permission', resource: 'commercial.margin', action: 'create', scope: 'active',
  },
  commercialReviewMargin: {
    mode: 'permission', resource: 'commercial.margin', action: 'approve', scope: 'active',
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
});

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

/**
 * Revenue Operations mutations often return a full snapshot or an envelope
 * containing one. A handler can be delegated because it resolves the exact
 * target record itself, but that never permits an unfiltered snapshot to
 * cross IPC. Keep this rule next to the route classification so new delegated
 * retail routes cannot bypass the response projection boundary.
 */
export function requiresRevenueOperationsResponseProjection(
  channel: string,
  policy: IpcAuthorizationPolicy,
): boolean {
  const isRevenueOperationsRoute = REVENUE_OPERATIONS_BOUND_PREFIXES.some(
    (prefix) => channel.startsWith(prefix),
  );
  return isRevenueOperationsRoute && policy.mode !== 'trusted';
}

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
