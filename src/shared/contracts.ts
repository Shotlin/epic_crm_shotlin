export type PipelineStageId = string;

export type OpportunityHealth = 'on-track' | 'attention' | 'at-risk';
export type LeadStatus = 'new' | 'working' | 'qualified' | 'converted';
export type ActivityType = 'call' | 'email' | 'meeting' | 'task';

export interface Owner {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  source: string;
  owner: Owner;
  status: LeadStatus;
  createdAt: string;
  version: number;
  convertedAccountId?: string;
  convertedContactId?: string;
}

export interface Opportunity {
  id: string;
  accountId?: string;
  contactId?: string;
  territoryId?: string;
  title: string;
  account: string;
  contact: string;
  owner: Owner;
  stage: PipelineStageId;
  value: number;
  currency: string;
  probability: number;
  probabilityMode: 'automatic' | 'manual';
  expectedClose: string;
  nextStep: string;
  lastActivity: string;
  health: OpportunityHealth;
  source: string;
  tags: string[];
  updatedAt: string;
  version: number;
}

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  subject: string;
  owner: Owner;
  dueAt: string;
  status: 'open' | 'completed';
  priority: 'normal' | 'high';
  version: number;
}

export interface SourceMetric {
  source: string;
  pipeline: number;
  conversion: number;
  trend: number;
}

export interface RevenuePoint {
  label: string;
  actual: number;
  target: number;
}

export interface CrmState {
  schemaVersion: 1;
  tenantId: string;
  companyId: string;
  /** The CRM engagement workspace is branch-owned; party master stays company-owned. */
  branchId: string;
  revision: number;
  closedWon: number;
  closedLost: number;
  averageCycleDays: number;
  leads: Lead[];
  opportunities: Opportunity[];
  activities: Activity[];
  sources: SourceMetric[];
  revenueSeries: RevenuePoint[];
}

export interface Metric {
  label: string;
  value: number;
  format: 'currency' | 'percentage' | 'days' | 'number';
  trend: number;
  context: string;
}

export interface DashboardSnapshot {
  revision: number;
  generatedAt: string;
  metrics: {
    pipeline: Metric;
    weightedForecast: Metric;
    winRate: Metric;
    salesCycle: Metric;
  };
  leads: Lead[];
  opportunities: Opportunity[];
  activities: Activity[];
  sources: SourceMetric[];
  revenueSeries: RevenuePoint[];
}

export interface CreateLeadInput {
  name: string;
  company: string;
  email: string;
  source: string;
}

export interface CreateOpportunityInput {
  accountId?: string;
  contactId?: string;
  territoryId?: string;
  title: string;
  account: string;
  contact: string;
  owner: Owner;
  stage: PipelineStageId;
  value: number;
  currency: string;
  probability: number;
  expectedClose: string;
  nextStep: string;
  source: string;
  tags: string[];
}

export interface MoveOpportunityInput {
  id: string;
  toStage: PipelineStageId;
  expectedVersion: number;
}

export interface CompleteActivityInput {
  id: string;
  expectedVersion: number;
}

export interface SystemInfo {
  productName: string;
  version: string;
  platform: NodeJS.Platform;
  dataMode: 'local-first';
}

/**
 * Renderer-safe provenance for the active retail workspace. This deliberately
 * excludes import payloads, customer data, connector URLs, and credentials.
 */
export interface RetailWorkspaceStatus {
  status: 'configured' | 'requires-classification';
  mode: 'clean' | 'imported' | 'live' | null;
  dataStatus: 'empty' | 'sample' | 'shadow-imported' | 'live' | 'unclassified';
  label: string;
  description: string;
  sourceSystem: string | null;
  evidenceReference: string | null;
  externalWritePolicy: 'blocked' | 'governed';
  requiresReconciliation: boolean;
  nextAction: string;
  updatedAt: string;
}

export interface RetailWorkspaceStatusBridge {
  /** Read-only workspace provenance after the normal Electron session/RBAC gate. */
  getStatus: () => Promise<RetailWorkspaceStatus>;
}

export interface EpicBosBridge {
  system: {
    getInfo: () => Promise<SystemInfo>;
    getBuildProvenance: () => Promise<BuildProvenance>;
  };
  auth: {
    getStatus: () => Promise<AuthStatus>;
    bootstrapOwner: (input: BootstrapOwnerInput) => Promise<AuthStatus>;
    login: (input: LoginInput) => Promise<AuthStatus>;
    logout: () => Promise<AuthStatus>;
    lock: () => Promise<AuthStatus>;
    changePassword: (input: ChangePasswordInput) => Promise<void>;
  };
  storage: StorageBridge;
  retailWorkspace: import('./bakaloo-retail-reset-contracts').BakalooRetailWorkspaceBridge & RetailWorkspaceStatusBridge;
  integration: {
    listApiKeys: (scope: { companyId: string; branchId: string }) => Promise<ApiKeyRecord[]>;
    issueApiKey: (input: IssueApiKeyInput) => Promise<IssuedApiKey>;
    revokeApiKey: (input: RevokeApiKeyInput) => Promise<void>;
    exportApiKeyInventory: (scope: { companyId: string; branchId: string }) => Promise<GovernedExportReceipt | null>;
    exportProviderCertificationPackage: (input: ProviderCertificationHandoff) => Promise<ProviderCertificationExportReceipt | null>;
    getRetailCertificationPack: () => Promise<import('./retail-certification-pack-contracts').RetailCertificationPack>;
    exportRetailCertificationPack: () => Promise<import('./retail-certification-pack-contracts').RetailCertificationPackReceipt | null>;
  };
  release: {
    listGates: () => Promise<ReleaseGateEvidence[]>;
    recordGate: (input: ReleaseGateEvidence) => Promise<ReleaseGateEvidence>;
    listArtifactEvidence: () => Promise<import('./release-artifact-contracts').ReleaseArtifactEvidence[]>;
    recordArtifactEvidence: (input: import('./release-artifact-contracts').RecordReleaseArtifactEvidenceInput) => Promise<import('./release-artifact-contracts').ReleaseArtifactEvidence>;
    decideArtifactEvidence: (input: import('./release-artifact-contracts').DecideReleaseArtifactEvidenceInput) => Promise<import('./release-artifact-contracts').ReleaseArtifactEvidence>;
    listUpdateEvidence: () => Promise<import('./release-update-contracts').ReleaseUpdateEvidence[]>;
    recordUpdateEvidence: (input: import('./release-update-contracts').RecordReleaseUpdateEvidenceInput) => Promise<import('./release-update-contracts').ReleaseUpdateEvidence>;
    decideUpdateEvidence: (input: import('./release-update-contracts').DecideReleaseUpdateEvidenceInput) => Promise<import('./release-update-contracts').ReleaseUpdateEvidence>;
    getAutoUpdateStatus: () => Promise<import('./auto-update-contracts').AutoUpdateStatus>;
    listUiAcceptanceEvidence: () => Promise<import('./ui-acceptance-contracts').UiAcceptanceEvidence[]>;
    recordUiAcceptanceEvidence: (input: import('./ui-acceptance-contracts').RecordUiAcceptanceEvidenceInput) => Promise<import('./ui-acceptance-contracts').UiAcceptanceEvidence>;
    decideUiAcceptanceEvidence: (input: import('./ui-acceptance-contracts').DecideUiAcceptanceEvidenceInput) => Promise<import('./ui-acceptance-contracts').UiAcceptanceEvidence>;
    getUiAcceptanceReadiness: () => Promise<import('../domain/ui-acceptance-readiness').UiAcceptanceReadinessReport>;
    getReadiness: () => Promise<ReleaseReadiness>;
    createReadinessReport: () => Promise<ReleaseReadinessReport>;
    createSupportDiagnostics: () => Promise<SupportDiagnostics>;
  };
  intelligence?: {
    listAnomalies: () => Promise<import('../domain/governed-anomaly-queue').GovernedAnomaly[]>;
    saveAnomaly: (input: import('../domain/governed-anomaly-queue').GovernedAnomaly) => Promise<import('../domain/governed-anomaly-queue').GovernedAnomaly>;
    reviewAnomaly: (input: import('../domain/governed-anomaly-queue').AnomalyReviewInput & { id: string }) => Promise<import('../domain/governed-anomaly-queue').GovernedAnomaly>;
    listReportExecutions: () => Promise<import('../domain/report-execution').GovernedReportExecution[]>;
    saveReportExecution: (input: import('../domain/report-execution').GovernedReportExecution) => Promise<import('../domain/report-execution').GovernedReportExecution>;
    listReportDeliveryPlans: () => Promise<import('./report-delivery-contracts').RetailReportDeliveryPlan[]>;
    listReportDeliveryAttempts: () => Promise<import('./report-delivery-contracts').RetailReportDeliveryAttempt[]>;
    createReportDeliveryPlan: (input: import('./report-delivery-contracts').CreateRetailReportDeliveryPlanInput) => Promise<import('./report-delivery-contracts').RetailReportDeliveryPlan>;
    decideReportDeliveryPlan: (input: import('./report-delivery-contracts').DecideRetailReportDeliveryPlanInput) => Promise<import('./report-delivery-contracts').RetailReportDeliveryPlan>;
    prepareReportDeliveryAttempt: (input: import('./report-delivery-contracts').PrepareRetailReportDeliveryAttemptInput) => Promise<import('./report-delivery-contracts').RetailReportDeliveryAttempt>;
    recordReportDeliveryResult: (input: import('./report-delivery-contracts').RecordRetailReportDeliveryResultInput) => Promise<import('./report-delivery-contracts').RetailReportDeliveryAttempt>;
  };
  automation?: {
    listRuns: () => Promise<import('../domain/workflow-execution').AutomationRun[]>;
    proposeRun: (input: { idempotencyKey: string; workflowInstanceId: string; transitionId: string }) => Promise<import('../domain/workflow-execution').AutomationRun>;
    approveRun: (input: { id: string }) => Promise<import('../domain/workflow-execution').AutomationRun>;
    startRun: (input: { id: string }) => Promise<import('../domain/workflow-execution').AutomationRun>;
    retryRun: (input: { id: string; reason: string }) => Promise<import('../domain/workflow-execution').AutomationRun>;
    completeRun: (input: import('../domain/workflow-execution').AutomationRunOutcome & { id: string }) => Promise<import('../domain/workflow-execution').AutomationRun>;
  };
  automationSchedules?: {
    list: () => Promise<import('../domain/automation-schedules').AutomationSchedule[]>;
    listTriggerHistory: () => Promise<import('../domain/automation-schedules').ScheduleTriggerRecord[]>;
    listFailures: () => Promise<import('../domain/automation-schedules').AutomationSchedulerFailure[]>;
    resolveFailure: (input: { id: string; resolutionReference: string }) => Promise<import('../domain/automation-schedules').AutomationSchedulerFailure>;
    getOperations: () => Promise<import('../domain/automation-scheduler-operations').SchedulerOperationsReport>;
    retryFailure: (input: { id: string; reason: string }) => Promise<import('../domain/workflow-execution').AutomationRun>;
    acknowledgeEscalation: (input: { id: string; reason: string }) => Promise<import('../domain/automation-schedules').AutomationSchedulerAction>;
    listActions: () => Promise<import('../domain/automation-schedules').AutomationSchedulerAction[]>;
    save: (input: import('../domain/automation-schedules').AutomationSchedule) => Promise<import('../domain/automation-schedules').AutomationSchedule>;
    evaluate: (input: { id: string; now?: string }) => Promise<import('../domain/automation-schedules').ScheduleTriggerRecord>;
    tick: (input?: { now?: string }) => Promise<Array<import('../domain/automation-schedules').ScheduleTriggerRecord & { automationRunId?: string }>>;
  };
  party: {
    getSnapshot: () => Promise<PartySnapshot>;
    createAccount: (input: CreateAccountInput) => Promise<PartySnapshot>;
    createContact: (input: CreateContactInput) => Promise<PartySnapshot>;
    recordConsent: (input: RecordConsentInput) => Promise<PartySnapshot>;
    resolveDuplicate: (input: ResolveDuplicateInput) => Promise<PartySnapshot>;
    addAddress: (input: AddAddressInput) => Promise<PartySnapshot>;
    addContactPoint: (input: AddContactPointInput) => Promise<PartySnapshot>;
    createRelationship: (input: CreateRelationshipInput) => Promise<PartySnapshot>;
    executeMerge: (input: ExecuteMergeInput) => Promise<PartySnapshot>;
    convertLead: (input: ConvertLeadInput) => Promise<LeadConversionResult>;
  };
  crmDepth: {
    getSnapshot: () => Promise<CrmDepthSnapshot>;
    updatePipeline: (input: UpdatePipelineInput) => Promise<CrmDepthSnapshot>;
    createScoringRule: (input: CreateScoringRuleInput) => Promise<CrmDepthSnapshot>;
    createCampaign: (input: CreateCampaignInput) => Promise<CrmDepthSnapshot>;
    transitionCampaign: (input: TransitionCampaignInput) => Promise<CrmDepthSnapshot>;
    createSavedView: (input: CreateSavedViewInput) => Promise<CrmDepthSnapshot>;
    previewLeadImport: () => Promise<CrmDepthSnapshot | null>;
    commitImport: (input: CommitImportInput) => Promise<ImportCommitResult>;
    configureAdapter: (input: ConfigureAdapterInput) => Promise<CrmDepthSnapshot>;
    recordCommunication: (input: RecordCommunicationInput) => Promise<CrmDepthSnapshot>;
    recordCommunicationDelivery: (input: import('./crm-depth-contracts').RecordCommunicationDeliveryInput) => Promise<CrmDepthSnapshot>;
  };
  revenueOps: {
    getSnapshot: () => Promise<RevenueOpsSnapshot>;
    listRetailCutoverPlans: () => Promise<import('./retail-cutover-contracts').RetailCutoverPlan[]>;
    fetchRetailHubCutoverAssessment: (input: import('./retail-cutover-contracts').FetchRetailHubCutoverAssessmentInput) => Promise<import('./retail-cutover-contracts').RetailHubCutoverAssessment>;
    createRetailCutoverPlan: (input: import('./retail-cutover-contracts').CreateRetailCutoverPlanInput) => Promise<import('./retail-cutover-contracts').RetailCutoverPlan>;
    createRetailCutoverPlanFromHubAssessment: (input: import('./retail-cutover-contracts').CreateRetailCutoverPlanFromAssessmentInput) => Promise<import('./retail-cutover-contracts').RetailCutoverPlan>;
    advanceRetailCutover: (input: import('./retail-cutover-contracts').AdvanceRetailCutoverInput & { id: string }) => Promise<import('./retail-cutover-contracts').RetailCutoverPlan>;
    getPeopleReadProjection: () => Promise<PeopleReadProjection>;
    updateProfile: (input: UpdateIndiaProfileInput) => Promise<RevenueOpsSnapshot>;
    createTerritory: (input: CreateTerritoryInput) => Promise<RevenueOpsSnapshot>;
    createAssignmentRule: (input: CreateAssignmentRuleInput) => Promise<RevenueOpsSnapshot>;
    bulkAssign: (input: BulkAssignInput) => Promise<OpportunityCreationResult>;
    createSegment: (input: CreateAudienceSegmentInput) => Promise<RevenueOpsSnapshot>;
    createOpportunity: (input: CreateIndiaOpportunityInput) => Promise<OpportunityCreationResult>;
    createQuote: (input: CreateQuoteInput) => Promise<RevenueOpsSnapshot>;
    transitionQuote: (input: TransitionQuoteInput) => Promise<RevenueOpsSnapshot>;
    createGstTaxCode: (input: CreateGstTaxCodeInput) => Promise<RevenueOpsSnapshot>;
    createCatalogProduct: (input: CreateCatalogProductInput) => Promise<RevenueOpsSnapshot>;
    importRetailProductPack: (input: ImportRetailProductPackInput) => Promise<RevenueOpsSnapshot>;
    createPriceList: (input: CreatePriceListInput) => Promise<RevenueOpsSnapshot>;
    createPriceListEntry: (input: CreatePriceListEntryInput) => Promise<RevenueOpsSnapshot>;
    createDiscountPolicy: (input: CreateDiscountPolicyInput) => Promise<RevenueOpsSnapshot>;
    submitPriceListForApproval: (input: SubmitPriceListForApprovalInput) => Promise<RevenueOpsSnapshot>;
    decidePriceListApproval: (input: DecidePriceListApprovalInput) => Promise<RevenueOpsSnapshot>;
    submitQuoteForApproval: (input: SubmitQuoteForApprovalInput) => Promise<RevenueOpsSnapshot>;
    decideQuoteApproval: (input: DecideQuoteApprovalInput) => Promise<RevenueOpsSnapshot>;
    exportQuotePdf: (input: ExportQuotePdfInput) => Promise<QuoteDocumentReceipt | null>;
    convertQuoteToSalesOrder: (input: ConvertQuoteToSalesOrderInput) => Promise<RevenueOpsSnapshot>;
    transitionSalesOrder: (input: TransitionSalesOrderInput) => Promise<RevenueOpsSnapshot>;
    updateFulfilmentTask: (input: UpdateFulfilmentTaskInput) => Promise<RevenueOpsSnapshot>;
    createPaymentTerm: (input: CreatePaymentTermInput) => Promise<RevenueOpsSnapshot>;
    createRetailCounter: (input: CreateRetailCounterInput) => Promise<RevenueOpsSnapshot>;
    openRetailCashierShift: (input: OpenRetailCashierShiftInput) => Promise<RevenueOpsSnapshot>;
    checkoutRetailSale: (input: CheckoutRetailSaleInput) => Promise<RevenueOpsSnapshot>;
    enqueueRetailOfflineSale: (input: CheckoutRetailSaleInput) => Promise<RevenueOpsSnapshot>;
    syncRetailOfflineSale: (input: import('./retail-offline-sync-contracts').SyncRetailOfflineSaleInput) => Promise<RevenueOpsSnapshot>;
    syncRetailOfflineQueue: (input: import('./retail-offline-sync-contracts').SyncRetailOfflineQueueInput) => Promise<RevenueOpsSnapshot>;
    resolveRetailOfflineSale: (input: import('./retail-offline-sync-contracts').ResolveRetailOfflineSaleInput) => Promise<RevenueOpsSnapshot>;
    ingestRetailUnifiedOrder: (input: import('./retail-unified-order-contracts').IngestRetailOrderSourceEventInput) => Promise<RevenueOpsSnapshot>;
    prepareRetailUnifiedOrderHandoff: (input: import('./retail-unified-order-contracts').PrepareRetailOrderGovernedHandoffInput) => Promise<RevenueOpsSnapshot>;
    prepareRetailOrderHubHandoff: (input: import('./retail-unified-order-contracts').PrepareRetailOrderHubHandoffInput) => Promise<RevenueOpsSnapshot>;
    recordRetailOrderHubHandoffResult: (input: import('./retail-unified-order-contracts').RecordRetailOrderHubHandoffResultInput) => Promise<RevenueOpsSnapshot>;
    prepareRetailOrderFulfilmentHandoff: (input: import('./retail-unified-order-contracts').PrepareRetailOrderFulfilmentHandoffInput) => Promise<RevenueOpsSnapshot>;
    decideRetailOrderFulfilmentHandoff: (input: import('./retail-unified-order-contracts').DecideRetailOrderFulfilmentHandoffInput) => Promise<RevenueOpsSnapshot>;
    reserveRetailUnifiedOrderStock: (input: import('./retail-unified-order-contracts').ReserveRetailUnifiedOrderStockInput) => Promise<RevenueOpsSnapshot>;
    createRetailUnifiedOrderPickTasks: (input: import('./retail-unified-order-contracts').CreateRetailUnifiedOrderPickTasksInput) => Promise<RevenueOpsSnapshot>;
    completeRetailUnifiedOrderPickTasks: (input: import('./retail-unified-order-contracts').CompleteRetailUnifiedOrderPickTasksInput) => Promise<RevenueOpsSnapshot>;
    createRetailUnifiedOrderShipmentPackage: (input: import('./retail-unified-order-contracts').CreateRetailUnifiedOrderShipmentPackageInput) => Promise<RevenueOpsSnapshot>;
    completeRetailUnifiedOrderShipmentPackage: (input: import('./retail-unified-order-contracts').CompleteRetailUnifiedOrderShipmentPackageInput) => Promise<RevenueOpsSnapshot>;
    prepareRetailUnifiedOrderDispatch: (input: import('./retail-unified-order-contracts').PrepareRetailUnifiedOrderDispatchInput) => Promise<RevenueOpsSnapshot>;
    dispatchRetailUnifiedOrder: (input: import('./retail-unified-order-contracts').DispatchRetailUnifiedOrderInput) => Promise<RevenueOpsSnapshot>;
    confirmRetailUnifiedOrderDelivery: (input: import('./retail-unified-order-contracts').ConfirmRetailUnifiedOrderDeliveryInput) => Promise<RevenueOpsSnapshot>;
    reconcileRetailUnifiedOrderRto: (input: import('./retail-unified-order-contracts').ReconcileRetailUnifiedOrderRtoInput) => Promise<RevenueOpsSnapshot>;
    reconcileRetailUnifiedOrderReturn: (input: import('./retail-unified-order-contracts').ReconcileRetailUnifiedOrderReturnInput) => Promise<RevenueOpsSnapshot>;
    recordRetailUnifiedOrderCarrierCallback: (input: import('./retail-unified-order-contracts').RecordRetailUnifiedOrderCarrierCallbackInput) => Promise<RevenueOpsSnapshot>;
    prepareRetailDeviceTransport: (input: import('./retail-device-transport-contracts').PrepareRetailDeviceTransportInput) => Promise<RevenueOpsSnapshot>;
    recordRetailDeviceTransport: (input: import('./retail-device-transport-contracts').RecordRetailDeviceTransportInput) => Promise<RevenueOpsSnapshot>;
    recordRetailNativeDeviceDriverResult: (input: import('./retail-device-transport-contracts').RecordRetailNativeDeviceDriverResultInput) => Promise<RevenueOpsSnapshot>;
    executeRetailDeviceTransport: (input: import('./retail-device-transport-contracts').ExecuteRetailDeviceTransportInput) => Promise<RevenueOpsSnapshot>;
    retryRetailDeviceTransport: (input: import('./retail-device-transport-contracts').RetryRetailDeviceTransportInput) => Promise<RevenueOpsSnapshot>;
    preflightRetailDeviceTransport: (input: import('./retail-device-transport-contracts').PreflightRetailDeviceTransportInput) => Promise<import('./retail-device-transport-contracts').RetailDeviceTransportPreflightResult>;
    recordRetailDevicePreflightEvidence: (input: import('./retail-device-transport-contracts').RecordRetailDevicePreflightEvidenceInput) => Promise<import('./retail-device-transport-contracts').RetailDeviceTransportPreflightResult>;
    createRetailDeviceAdapterProfile: (input: import('./retail-device-profile-contracts').CreateRetailDeviceAdapterProfileInput) => Promise<RevenueOpsSnapshot>;
    approveRetailDeviceAdapterProfile: (input: import('./retail-device-profile-contracts').ApproveRetailDeviceAdapterProfileInput) => Promise<RevenueOpsSnapshot>;
    recordRetailDeviceAdapterAcknowledgement: (input: import('./retail-device-profile-contracts').RecordRetailDeviceAdapterAcknowledgementInput) => Promise<RevenueOpsSnapshot>;
    activateRetailDeviceAdapterProfile: (input: import('./retail-device-profile-contracts').ActivateRetailDeviceAdapterProfileInput) => Promise<RevenueOpsSnapshot>;
    suspendRetailDeviceAdapterProfile: (input: import('./retail-device-profile-contracts').SuspendRetailDeviceAdapterProfileInput) => Promise<RevenueOpsSnapshot>;
    createRetailLoyaltyAccount: (input: import('./retail-loyalty-contracts').CreateRetailLoyaltyAccountInput) => Promise<RevenueOpsSnapshot>;
    redeemRetailLoyaltyPoints: (input: import('./retail-loyalty-contracts').RedeemRetailLoyaltyPointsInput) => Promise<RevenueOpsSnapshot>;
    createRetailCustomerVisit: (input: import('./retail-customer-ops-contracts').CreateRetailCustomerVisitInput) => Promise<RevenueOpsSnapshot>;
    linkRetailCustomerVisitToSale: (input: import('./retail-customer-ops-contracts').LinkRetailCustomerVisitInput) => Promise<RevenueOpsSnapshot>;
    createRetailSalesCommission: (input: import('./retail-customer-ops-contracts').CreateRetailSalesCommissionInput) => Promise<RevenueOpsSnapshot>;
    decideRetailSalesCommission: (input: import('./retail-customer-ops-contracts').DecideRetailSalesCommissionInput) => Promise<RevenueOpsSnapshot>;
    payRetailSalesCommission: (input: import('./retail-customer-ops-contracts').PayRetailSalesCommissionInput) => Promise<RevenueOpsSnapshot>;
    createRetailCommissionPayoutBatch: (input: import('./retail-customer-ops-contracts').CreateRetailCommissionPayoutBatchInput) => Promise<RevenueOpsSnapshot>;
    decideRetailCommissionPayoutBatch: (input: import('./retail-customer-ops-contracts').DecideRetailCommissionPayoutBatchInput) => Promise<RevenueOpsSnapshot>;
    releaseRetailCommissionPayoutBatch: (input: import('./retail-customer-ops-contracts').ReleaseRetailCommissionPayoutBatchInput) => Promise<RevenueOpsSnapshot>;
    requestRetailCashierShiftClose: (input: RequestRetailCashierShiftCloseInput) => Promise<RevenueOpsSnapshot>;
    decideRetailCashierShiftClose: (input: DecideRetailCashierShiftCloseInput) => Promise<RevenueOpsSnapshot>;
    requestRetailCashierShiftVarianceResolution: (input: RequestRetailCashierShiftVarianceResolutionInput) => Promise<RevenueOpsSnapshot>;
    decideRetailCashierShiftVarianceResolution: (input: DecideRetailCashierShiftVarianceResolutionInput) => Promise<RevenueOpsSnapshot>;
    createRetailReturnRequest: (input: CreateRetailReturnRequestInput) => Promise<RevenueOpsSnapshot>;
    createRetailExchange: (input: import('./retail-exchange-contracts').CreateRetailExchangeInput) => Promise<RevenueOpsSnapshot>;
    decideRetailExchange: (input: import('./retail-exchange-contracts').DecideRetailExchangeInput) => Promise<RevenueOpsSnapshot>;
    prepareRetailCreditNoteReconciliation: (input: import('./retail-credit-note-contracts').PrepareRetailCreditNoteReconciliationInput) => Promise<RevenueOpsSnapshot>;
    recordRetailCreditNotePortalResponse: (input: import('./retail-credit-note-contracts').RecordRetailCreditNotePortalResponseInput) => Promise<RevenueOpsSnapshot>;
    createRetailInterBranchTransfer: (input: import('./retail-interbranch-contracts').CreateRetailInterBranchTransferInput) => Promise<RevenueOpsSnapshot>;
    decideRetailInterBranchTransfer: (input: import('./retail-interbranch-contracts').DecideRetailInterBranchTransferInput) => Promise<RevenueOpsSnapshot>;
    dispatchRetailInterBranchTransfer: (input: import('./retail-interbranch-contracts').DispatchRetailInterBranchTransferInput) => Promise<RevenueOpsSnapshot>;
    receiveRetailInterBranchTransfer: (input: import('./retail-interbranch-contracts').ReceiveRetailInterBranchTransferInput) => Promise<RevenueOpsSnapshot>;
    createRetailScaleProfile: (input: import('./retail-catalog-operations-contracts').CreateRetailScaleProfileInput) => Promise<RevenueOpsSnapshot>;
    createRetailPrinterAdapter: (input: import('./retail-catalog-operations-contracts').CreateRetailPrinterAdapterInput) => Promise<RevenueOpsSnapshot>;
    testRetailPrinterAdapter: (input: import('./retail-catalog-operations-contracts').TestRetailPrinterAdapterInput) => Promise<RevenueOpsSnapshot>;
    createRetailLabelPrintDispatch: (input: import('./retail-catalog-operations-contracts').CreateRetailLabelPrintDispatchInput) => Promise<RevenueOpsSnapshot>;
    decideRetailLabelPrintDispatch: (input: import('./retail-catalog-operations-contracts').DecideRetailLabelPrintDispatchInput) => Promise<RevenueOpsSnapshot>;
    prepareRetailCatalogBulkEdit: (input: import('./retail-catalog-operations-contracts').PrepareRetailCatalogBulkEditInput) => Promise<RevenueOpsSnapshot>;
    applyRetailCatalogBulkEdit: (input: import('./retail-catalog-operations-contracts').ApplyRetailCatalogBulkEditInput) => Promise<RevenueOpsSnapshot>;
    createRetailPurchaseOcrDocument: (input: import('./retail-commerce-contracts').CreateRetailPurchaseOcrInput) => Promise<RevenueOpsSnapshot>;
    decideRetailPurchaseOcr: (input: import('./retail-commerce-contracts').DecideRetailPurchaseOcrInput) => Promise<RevenueOpsSnapshot>;
    convertRetailPurchaseOcr: (input: import('./retail-commerce-contracts').ConvertRetailPurchaseOcrInput) => Promise<RevenueOpsSnapshot>;
    createRetailCommerceConnector: (input: import('./retail-commerce-contracts').CreateRetailCommerceConnectorInput) => Promise<RevenueOpsSnapshot>;
    configureRetailCommerceCredentials: (input: import('./retail-commerce-contracts').ConfigureRetailCommerceCredentialsInput) => Promise<RevenueOpsSnapshot>;
    createRetailCommerceSyncRun: (input: import('./retail-commerce-contracts').CreateRetailCommerceSyncInput) => Promise<RevenueOpsSnapshot>;
    executeRetailCommerceSync: (input: import('./retail-commerce-contracts').ExecuteRetailCommerceSyncInput) => Promise<RevenueOpsSnapshot>;
    recordRetailCommerceSync: (input: import('./retail-commerce-contracts').RecordRetailCommerceSyncInput) => Promise<RevenueOpsSnapshot>;
    importRetailCommerceOrder: (input: import('./retail-commerce-contracts').ImportRetailCommerceOrderInput) => Promise<RevenueOpsSnapshot>;
    handoffRetailCommerceOrder: (input: import('./retail-commerce-contracts').HandoffRetailCommerceOrderInput) => Promise<RevenueOpsSnapshot>;
    reserveRetailCommerceOrder: (input: import('./retail-commerce-contracts').ReserveRetailCommerceOrderInput) => Promise<RevenueOpsSnapshot>;
    createRetailSettlementReconciliation: (input: import('./retail-commerce-contracts').CreateRetailSettlementReconciliationInput) => Promise<RevenueOpsSnapshot>;
    decideRetailSettlementReconciliation: (input: import('./retail-commerce-contracts').DecideRetailSettlementReconciliationInput) => Promise<RevenueOpsSnapshot>;
    createRetailSettlementAllocationPack: (input: import('./retail-commerce-contracts').CreateRetailSettlementAllocationPackInput) => Promise<RevenueOpsSnapshot>;
    decideRetailSettlementAllocationPack: (input: import('./retail-commerce-contracts').DecideRetailSettlementAllocationPackInput) => Promise<RevenueOpsSnapshot>;
    createRetailCommerceConflictResolution: (input: import('./retail-commerce-contracts').CreateRetailCommerceConflictResolutionInput) => Promise<RevenueOpsSnapshot>;
    decideRetailCommerceConflictResolution: (input: import('./retail-commerce-contracts').DecideRetailCommerceConflictResolutionInput) => Promise<RevenueOpsSnapshot>;
    createRetailSettlementWithholdingEvidence: (input: import('./retail-commerce-contracts').CreateRetailSettlementWithholdingEvidenceInput) => Promise<RevenueOpsSnapshot>;
    decideRetailSettlementWithholdingEvidence: (input: import('./retail-commerce-contracts').DecideRetailSettlementWithholdingEvidenceInput) => Promise<RevenueOpsSnapshot>;
    prepareRetailSettlementJournal: (input: import('./retail-commerce-contracts').PrepareRetailSettlementJournalInput) => Promise<RevenueOpsSnapshot>;
    linkRetailCommerceReturn: (input: import('./retail-commerce-contracts').LinkRetailCommerceReturnInput) => Promise<RevenueOpsSnapshot>;
    createRetailOcrProviderProfile: (input: import('./retail-commerce-contracts').CreateRetailOcrProviderProfileInput) => Promise<RevenueOpsSnapshot>;
    configureRetailOcrProvider: (input: import('./retail-commerce-contracts').ConfigureRetailOcrProviderInput) => Promise<RevenueOpsSnapshot>;
    executeRetailOcr: (input: import('./retail-commerce-contracts').ExecuteRetailOcrInput) => Promise<RevenueOpsSnapshot>;
    testRetailOcrProvider: (input: import('./retail-commerce-contracts').TestRetailOcrProviderInput) => Promise<RevenueOpsSnapshot>;
    prepareRetailPurchaseOcrMapping: (input: import('./retail-commerce-contracts').PrepareRetailPurchaseOcrMappingInput) => Promise<RevenueOpsSnapshot>;
    applyRetailPurchaseOcrMapping: (input: import('./retail-commerce-contracts').ApplyRetailPurchaseOcrMappingInput) => Promise<RevenueOpsSnapshot>;
    prepareRetailCommercePushBatch: (input: import('./retail-commerce-contracts').PrepareRetailCommercePushInput) => Promise<RevenueOpsSnapshot>;
    decideRetailCommercePushBatch: (input: import('./retail-commerce-contracts').DecideRetailCommercePushInput) => Promise<RevenueOpsSnapshot>;
    executeRetailCommercePushBatch: (input: import('./retail-commerce-contracts').ExecuteRetailCommercePushInput) => Promise<RevenueOpsSnapshot>;
    createRetailCommerceCatalogMapping: (input: import('./retail-commerce-contracts').CreateRetailCommerceCatalogMappingInput) => Promise<RevenueOpsSnapshot>;
    decideRetailCommerceCatalogMapping: (input: import('./retail-commerce-contracts').DecideRetailCommerceCatalogMappingInput) => Promise<RevenueOpsSnapshot>;
    disableRetailCommerceCatalogMapping: (input: import('./retail-commerce-contracts').DisableRetailCommerceCatalogMappingInput) => Promise<RevenueOpsSnapshot>;
    transitionRetailCommerceOrder: (input: import('./retail-commerce-contracts').TransitionRetailCommerceOrderInput) => Promise<RevenueOpsSnapshot>;
    createRetailCommerceConformanceCase: (input: import('./retail-commerce-contracts').CreateRetailCommerceConformanceCaseInput) => Promise<RevenueOpsSnapshot>;
    planRetailCommerceConformancePack: (input: import('./retail-commerce-contracts').PlanRetailCommerceConformancePackInput) => Promise<RevenueOpsSnapshot>;
    recordRetailCommerceConformance: (input: import('./retail-commerce-contracts').RecordRetailCommerceConformanceInput) => Promise<RevenueOpsSnapshot>;
    scanRetailPurchaseExceptions: (input: import('./retail-commerce-contracts').ScanRetailPurchaseExceptionsInput) => Promise<RevenueOpsSnapshot>;
    resolveRetailPurchaseException: (input: import('./retail-commerce-contracts').ResolveRetailPurchaseExceptionInput) => Promise<RevenueOpsSnapshot>;
    inspectRetailReturn: (input: InspectRetailReturnInput) => Promise<RevenueOpsSnapshot>;
    decideRetailReturn: (input: DecideRetailReturnInput) => Promise<RevenueOpsSnapshot>;
    requestRetailReturnSettlement: (input: RequestRetailReturnSettlementInput) => Promise<RevenueOpsSnapshot>;
    decideRetailReturnSettlement: (input: DecideRetailReturnSettlementInput) => Promise<RevenueOpsSnapshot>;
    confirmRetailReturnProviderRefund: (input: ConfirmRetailReturnProviderRefundInput) => Promise<RevenueOpsSnapshot>;
    createRetailCatalogCategory: (input: CreateRetailCatalogCategoryInput) => Promise<RevenueOpsSnapshot>;
    createRetailCatalogBrand: (input: CreateRetailCatalogBrandInput) => Promise<RevenueOpsSnapshot>;
    saveRetailMerchandisingProfile: (input: SaveRetailMerchandisingProfileInput) => Promise<RevenueOpsSnapshot>;
    createRetailBarcodeSequence: (input: CreateRetailBarcodeSequenceInput) => Promise<RevenueOpsSnapshot>;
    resetRetailBarcodeSequence: (input: ResetRetailBarcodeSequenceInput) => Promise<RevenueOpsSnapshot>;
    assignRetailBarcode: (input: AssignRetailBarcodeInput) => Promise<RevenueOpsSnapshot>;
    createRetailLabelPrintRun: (input: CreateRetailLabelPrintRunInput) => Promise<RevenueOpsSnapshot>;
    createRetailProductCombo: (input: CreateRetailProductComboInput) => Promise<RevenueOpsSnapshot>;
    recordDeliveryEvidence: (input: RecordDeliveryEvidenceInput) => Promise<RevenueOpsSnapshot>;
    createServiceMilestone: (input: CreateServiceMilestoneInput) => Promise<RevenueOpsSnapshot>;
    transitionServiceMilestone: (input: TransitionServiceMilestoneInput) => Promise<RevenueOpsSnapshot>;
    createInvoiceDraft: (input: CreateInvoiceDraftInput) => Promise<RevenueOpsSnapshot>;
    issueInvoice: (input: IssueInvoiceInput) => Promise<RevenueOpsSnapshot>;
    createCreditDebitNote: (input: CreateCreditDebitNoteInput) => Promise<RevenueOpsSnapshot>;
    recordPayment: (input: RecordPaymentInput) => Promise<RevenueOpsSnapshot>;
    applyUnappliedReceipt: (input: ApplyUnappliedReceiptInput) => Promise<RevenueOpsSnapshot>;
    reconcilePayment: (input: ReconcilePaymentInput) => Promise<RevenueOpsSnapshot>;
    exportJournal: (input: ExportJournalInput) => Promise<RevenueOpsSnapshot>;
    exportInvoicePdf: (input: ExportInvoicePdfInput) => Promise<InvoiceDocumentReceipt | null>;
    createGstRegistration: (input: CreateGstRegistrationInput) => Promise<RevenueOpsSnapshot>;
    createPlaceOfSupplyReview: (input: CreatePlaceOfSupplyReviewInput) => Promise<RevenueOpsSnapshot>;
    decidePlaceOfSupplyReview: (input: DecidePlaceOfSupplyReviewInput) => Promise<RevenueOpsSnapshot>;
    createStockLocation: (input: CreateStockLocationInput) => Promise<RevenueOpsSnapshot>;
    recordStockMovement: (input: RecordStockMovementInput) => Promise<RevenueOpsSnapshot>;
    reserveStock: (input: ReserveStockInput) => Promise<RevenueOpsSnapshot>;
    releaseStockReservation: (input: ReleaseStockReservationInput) => Promise<RevenueOpsSnapshot>;
    createPincodeServiceabilityRule: (input: CreatePincodeServiceabilityRuleInput) => Promise<RevenueOpsSnapshot>;
    decidePincodeServiceabilityRule: (input: DecidePincodeServiceabilityRuleInput) => Promise<RevenueOpsSnapshot>;
    createDeliveryPromise: (input: CreateDeliveryPromiseInput) => Promise<RevenueOpsSnapshot>;
    createCodCollectionCase: (input: CreateCodCollectionCaseInput) => Promise<RevenueOpsSnapshot>;
    recordCodHandover: (input: RecordCodHandoverInput) => Promise<RevenueOpsSnapshot>;
    recordCodCarrierCollection: (input: RecordCodCarrierCollectionInput) => Promise<RevenueOpsSnapshot>;
    recordCodRemittance: (input: RecordCodRemittanceInput) => Promise<RevenueOpsSnapshot>;
    matchCodBank: (input: MatchCodBankInput) => Promise<RevenueOpsSnapshot>;
    closeCodShortfall: (input: CloseCodShortfallInput) => Promise<RevenueOpsSnapshot>;
    recordCodException: (input: RecordCodExceptionInput) => Promise<RevenueOpsSnapshot>;
    createShipmentPackage: (input: CreateShipmentPackageInput) => Promise<RevenueOpsSnapshot>;
    transitionShipment: (input: TransitionShipmentInput) => Promise<RevenueOpsSnapshot>;
    configureCarrierAdapter: (input: ConfigureCarrierAdapterInput) => Promise<RevenueOpsSnapshot>;
    createReturnAuthorization: (input: CreateReturnAuthorizationInput) => Promise<RevenueOpsSnapshot>;
    decideReturnAuthorization: (input: DecideReturnAuthorizationInput) => Promise<RevenueOpsSnapshot>;
    receiveReturn: (input: ReceiveReturnInput) => Promise<RevenueOpsSnapshot>;
    inspectReturn: (input: InspectReturnInput) => Promise<RevenueOpsSnapshot>;
    prepareStatutoryExchange: (input: PrepareStatutoryExchangeInput) => Promise<RevenueOpsSnapshot>;
    submitStatutoryExchange: (input: SubmitStatutoryExchangeInput) => Promise<RevenueOpsSnapshot>;
    recordStatutoryResponse: (input: RecordStatutoryResponseInput) => Promise<RevenueOpsSnapshot>;
    configureStatutoryAdapter: (input: ConfigureStatutoryAdapterInput) => Promise<RevenueOpsSnapshot>;
    configureStatutoryCredentials: (input: ConfigureStatutoryCredentialsInput) => Promise<RevenueOpsSnapshot>;
    prepareStatutoryOperation: (input: PrepareStatutoryOperationInput) => Promise<RevenueOpsSnapshot>;
    submitStatutoryOperation: (input: SubmitStatutoryOperationInput) => Promise<RevenueOpsSnapshot>;
    recordStatutoryOperationResponse: (input: RecordStatutoryOperationResponseInput) => Promise<RevenueOpsSnapshot>;
    prepareConsolidatedEwayBill: (input: PrepareConsolidatedEwayBillInput) => Promise<RevenueOpsSnapshot>;
    submitConsolidatedEwayBill: (input: SubmitConsolidatedEwayBillInput) => Promise<RevenueOpsSnapshot>;
    recordConsolidatedEwayBillResponse: (input: RecordConsolidatedEwayBillResponseInput) => Promise<RevenueOpsSnapshot>;
    verifyStatutorySignature: (input: VerifyStatutorySignatureInput) => Promise<RevenueOpsSnapshot>;
    runPortalReconciliation: (input: RunPortalReconciliationInput) => Promise<RevenueOpsSnapshot>;
    configureProviderConnector: (input: ConfigureProviderConnectorInput) => Promise<RevenueOpsSnapshot>;
    configureProviderCredentials: (input: ConfigureProviderCredentialsInput) => Promise<RevenueOpsSnapshot>;
    createProviderConformanceCase: (input: CreateProviderConformanceCaseInput) => Promise<RevenueOpsSnapshot>;
    planProviderConformancePack: (input: PlanProviderConformancePackInput) => Promise<RevenueOpsSnapshot>;
    executeProviderPreflight: (input: import('./provider-contracts').ExecuteProviderPreflightInput) => Promise<RevenueOpsSnapshot>;
    recordProviderConformanceResult: (input: RecordProviderConformanceResultInput) => Promise<RevenueOpsSnapshot>;
    approveProviderConnector: (input: ApproveProviderConnectorInput) => Promise<RevenueOpsSnapshot>;
    prepareProviderSubmission: (input: PrepareProviderSubmissionInput) => Promise<RevenueOpsSnapshot>;
    handOffProviderSubmission: (input: HandOffProviderSubmissionInput) => Promise<RevenueOpsSnapshot>;
    recordProviderSubmissionResponse: (input: RecordProviderSubmissionResponseInput) => Promise<RevenueOpsSnapshot>;
    runProviderReconciliation: (input: RunProviderReconciliationInput) => Promise<RevenueOpsSnapshot>;
    proposeCreditLimit: (input: ProposeCreditLimitInput) => Promise<RevenueOpsSnapshot>;
    decideCreditLimit: (input: DecideCreditLimitInput) => Promise<RevenueOpsSnapshot>;
    runDunning: (input: RunDunningInput) => Promise<RevenueOpsSnapshot>;
    recordCollectionActivity: (input: RecordCollectionActivityInput) => Promise<RevenueOpsSnapshot>;
    openReceivableDispute: (input: OpenReceivableDisputeInput) => Promise<RevenueOpsSnapshot>;
    resolveReceivableDispute: (input: ResolveReceivableDisputeInput) => Promise<RevenueOpsSnapshot>;
    requestWriteOff: (input: RequestWriteOffInput) => Promise<RevenueOpsSnapshot>;
    decideWriteOff: (input: DecideWriteOffInput) => Promise<RevenueOpsSnapshot>;
    createWithholdingPolicy: (input: CreateWithholdingPolicyInput) => Promise<RevenueOpsSnapshot>;
    recordWithholdingEntry: (input: RecordWithholdingEntryInput) => Promise<RevenueOpsSnapshot>;
    transitionWithholdingEntry: (input: TransitionWithholdingEntryInput) => Promise<RevenueOpsSnapshot>;
    prepareZeroRatedSupply: (input: PrepareZeroRatedSupplyInput) => Promise<RevenueOpsSnapshot>;
    decideZeroRatedSupply: (input: DecideZeroRatedSupplyInput) => Promise<RevenueOpsSnapshot>;
    createBankAccount: (input: CreateBankAccountInput) => Promise<RevenueOpsSnapshot>;
    previewBankStatement: (input: PreviewBankStatementInput) => Promise<RevenueOpsSnapshot>;
    commitBankStatement: (input: CommitBankStatementInput) => Promise<RevenueOpsSnapshot>;
    confirmBankMatch: (input: ConfirmBankMatchInput) => Promise<RevenueOpsSnapshot>;
    excludeBankLine: (input: ExcludeBankLineInput) => Promise<RevenueOpsSnapshot>;
    createPurchaseRequisition: (input: CreatePurchaseRequisitionInput) => Promise<RevenueOpsSnapshot>;
    decidePurchaseRequisition: (input: DecidePurchaseRequisitionInput) => Promise<RevenueOpsSnapshot>;
    createRfqFromRequisition: (input: CreateRfqFromRequisitionInput) => Promise<RevenueOpsSnapshot>;
    createSupplier: (input: CreateSupplierInput) => Promise<RevenueOpsSnapshot>;
    decideSupplier: (input: DecideSupplierInput) => Promise<RevenueOpsSnapshot>;
    createRfq: (input: CreateRfqInput) => Promise<RevenueOpsSnapshot>;
    issueRfq: (input: IssueRfqInput) => Promise<RevenueOpsSnapshot>;
    recordSupplierQuotation: (input: RecordSupplierQuotationInput) => Promise<RevenueOpsSnapshot>;
    awardRfq: (input: AwardRfqInput) => Promise<RevenueOpsSnapshot>;
    createPurchaseOrderFromRfq: (input: CreatePurchaseOrderFromRfqInput) => Promise<RevenueOpsSnapshot>;
    createPurchaseOrderFromReorder: (input: CreatePurchaseOrderFromReorderInput) => Promise<RevenueOpsSnapshot>;
    decidePurchaseOrder: (input: DecidePurchaseOrderInput) => Promise<RevenueOpsSnapshot>;
    recordGoodsReceipt: (input: RecordGoodsReceiptInput) => Promise<RevenueOpsSnapshot>;
    createLandedCost: (input: CreateLandedCostInput) => Promise<RevenueOpsSnapshot>;
    decideLandedCost: (input: DecideLandedCostInput) => Promise<RevenueOpsSnapshot>;
    updateRetailPriceForTargetMargin: (input: UpdateRetailPriceForTargetMarginInput) => Promise<RevenueOpsSnapshot>;
    recordSupplierInvoice: (input: RecordSupplierInvoiceInput) => Promise<RevenueOpsSnapshot>;
    decideThreeWayMatch: (input: DecideThreeWayMatchInput) => Promise<RevenueOpsSnapshot>;
    recordTreasuryPosition: (input: RecordTreasuryPositionInput) => Promise<RevenueOpsSnapshot>;
    runCashForecast: (input: RunCashForecastInput) => Promise<RevenueOpsSnapshot>;
    createPaymentProposal: (input: CreatePaymentProposalInput) => Promise<RevenueOpsSnapshot>;
    decidePaymentProposal: (input: DecidePaymentProposalInput) => Promise<RevenueOpsSnapshot>;
    releasePaymentProposal: (input: ReleasePaymentProposalInput) => Promise<RevenueOpsSnapshot>;
    settlePaymentProposal: (input: SettlePaymentProposalInput) => Promise<RevenueOpsSnapshot>;
    recordBankCharge: (input: RecordBankChargeInput) => Promise<RevenueOpsSnapshot>;
    reconcileBankCharge: (input: ReconcileBankChargeInput) => Promise<RevenueOpsSnapshot>;
    openSettlementException: (input: OpenSettlementExceptionInput) => Promise<RevenueOpsSnapshot>;
    resolveSettlementException: (input: ResolveSettlementExceptionInput) => Promise<RevenueOpsSnapshot>;
    createLiquiditySweep: (input: CreateLiquiditySweepInput) => Promise<RevenueOpsSnapshot>;
    decideLiquiditySweep: (input: DecideLiquiditySweepInput) => Promise<RevenueOpsSnapshot>;
    releaseLiquiditySweep: (input: ReleaseLiquiditySweepInput) => Promise<RevenueOpsSnapshot>;
    settleLiquiditySweep: (input: SettleLiquiditySweepInput) => Promise<RevenueOpsSnapshot>;
    createWorkCenter: (input: CreateWorkCenterInput) => Promise<RevenueOpsSnapshot>;
    createBomRevision: (input: CreateBomRevisionInput) => Promise<RevenueOpsSnapshot>;
    decideBomRevision: (input: DecideBomRevisionInput) => Promise<RevenueOpsSnapshot>;
    createQualityPlan: (input: CreateQualityPlanInput) => Promise<RevenueOpsSnapshot>;
    decideQualityPlan: (input: DecideQualityPlanInput) => Promise<RevenueOpsSnapshot>;
    createWorkOrder: (input: CreateWorkOrderInput) => Promise<RevenueOpsSnapshot>;
    decideWorkOrder: (input: DecideWorkOrderInput) => Promise<RevenueOpsSnapshot>;
    startWorkOrder: (input: StartWorkOrderInput) => Promise<RevenueOpsSnapshot>;
    issueWorkOrderMaterial: (input: IssueWorkOrderMaterialInput) => Promise<RevenueOpsSnapshot>;
    recordQualityInspection: (input: RecordQualityInspectionInput) => Promise<RevenueOpsSnapshot>;
    resolveNonconformance: (input: ResolveNonconformanceInput) => Promise<RevenueOpsSnapshot>;
    recordProductionOutput: (input: RecordProductionOutputInput) => Promise<RevenueOpsSnapshot>;
    createAssetCategory: (input: CreateAssetCategoryInput) => Promise<RevenueOpsSnapshot>;
    createManagedAsset: (input: CreateManagedAssetInput) => Promise<RevenueOpsSnapshot>;
    submitManagedAsset: (input: SubmitManagedAssetInput) => Promise<RevenueOpsSnapshot>;
    decideManagedAsset: (input: DecideManagedAssetInput) => Promise<RevenueOpsSnapshot>;
    createAssetCapitalization: (input: CreateAssetCapitalizationInput) => Promise<RevenueOpsSnapshot>;
    decideAssetCapitalization: (input: DecideAssetCapitalizationInput) => Promise<RevenueOpsSnapshot>;
    createAssetDepreciationPolicy: (input: CreateAssetDepreciationPolicyInput) => Promise<RevenueOpsSnapshot>;
    decideAssetDepreciationPolicy: (input: DecideAssetDepreciationPolicyInput) => Promise<RevenueOpsSnapshot>;
    createAssetDepreciationRun: (input: CreateAssetDepreciationRunInput) => Promise<RevenueOpsSnapshot>;
    decideAssetDepreciationRun: (input: DecideAssetDepreciationRunInput) => Promise<RevenueOpsSnapshot>;
    createAssetRetirement: (input: CreateAssetRetirementInput) => Promise<RevenueOpsSnapshot>;
    decideAssetRetirement: (input: DecideAssetRetirementInput) => Promise<RevenueOpsSnapshot>;
    completeAssetRetirement: (input: CompleteAssetRetirementInput) => Promise<RevenueOpsSnapshot>;
    createAssetCustodyTransfer: (input: CreateAssetCustodyTransferInput) => Promise<RevenueOpsSnapshot>;
    decideAssetCustodyTransfer: (input: DecideAssetCustodyTransferInput) => Promise<RevenueOpsSnapshot>;
    receiveAssetCustodyTransfer: (input: ReceiveAssetCustodyTransferInput) => Promise<RevenueOpsSnapshot>;
    createAssetComponentization: (input: CreateAssetComponentizationInput) => Promise<RevenueOpsSnapshot>;
    decideAssetComponentization: (input: DecideAssetComponentizationInput) => Promise<RevenueOpsSnapshot>;
    createAssetComponentAllocation: (input: CreateAssetComponentAllocationInput) => Promise<RevenueOpsSnapshot>;
    decideAssetComponentAllocation: (input: DecideAssetComponentAllocationInput) => Promise<RevenueOpsSnapshot>;
    createAssetTransferAccounting: (input: CreateAssetTransferAccountingInput) => Promise<RevenueOpsSnapshot>;
    decideAssetTransferAccounting: (input: DecideAssetTransferAccountingInput) => Promise<RevenueOpsSnapshot>;
    dispatchAssetTransferAccounting: (input: DispatchAssetTransferAccountingInput) => Promise<RevenueOpsSnapshot>;
    receiveAssetTransferAccounting: (input: ReceiveAssetTransferAccountingInput) => Promise<RevenueOpsSnapshot>;
    createAssetSaleDisposal: (input: CreateAssetSaleDisposalInput) => Promise<RevenueOpsSnapshot>;
    decideAssetSaleDisposal: (input: DecideAssetSaleDisposalInput) => Promise<RevenueOpsSnapshot>;
    completeAssetSaleDisposal: (input: CompleteAssetSaleDisposalInput) => Promise<RevenueOpsSnapshot>;
    runAssetLifecycleAction: (input: AssetLifecycleActionInput) => Promise<RevenueOpsSnapshot>;
    createPreventiveMaintenancePlan: (input: CreatePreventiveMaintenancePlanInput) => Promise<RevenueOpsSnapshot>;
    generateDueMaintenanceWorkOrder: (input: GenerateDueMaintenanceWorkOrderInput) => Promise<RevenueOpsSnapshot>;
    startMaintenanceWorkOrder: (input: StartMaintenanceWorkOrderInput) => Promise<RevenueOpsSnapshot>;
    completeMaintenanceWorkOrder: (input: CompleteMaintenanceWorkOrderInput) => Promise<RevenueOpsSnapshot>;
    verifyMaintenanceWorkOrder: (input: VerifyMaintenanceWorkOrderInput) => Promise<RevenueOpsSnapshot>;
    createProject: (input: CreateProjectInput) => Promise<RevenueOpsSnapshot>;
    decideProject: (input: DecideProjectInput) => Promise<RevenueOpsSnapshot>;
    transitionProject: (input: TransitionProjectInput) => Promise<RevenueOpsSnapshot>;
    createProjectTask: (input: CreateProjectTaskInput) => Promise<RevenueOpsSnapshot>;
    transitionProjectTask: (input: TransitionProjectTaskInput) => Promise<RevenueOpsSnapshot>;
    recordTimeEntry: (input: RecordTimeEntryInput) => Promise<RevenueOpsSnapshot>;
    decideTimeEntry: (input: DecideTimeEntryInput) => Promise<RevenueOpsSnapshot>;
    createServiceAgreement: (input: CreateServiceAgreementInput) => Promise<RevenueOpsSnapshot>;
    decideServiceAgreement: (input: DecideServiceAgreementInput) => Promise<RevenueOpsSnapshot>;
    createSupportTicket: (input: CreateSupportTicketInput) => Promise<RevenueOpsSnapshot>;
    transitionSupportTicket: (input: TransitionSupportTicketInput) => Promise<RevenueOpsSnapshot>;
    createFieldServiceJob: (input: CreateFieldServiceJobInput) => Promise<RevenueOpsSnapshot>;
    transitionFieldServiceJob: (input: TransitionFieldServiceJobInput) => Promise<RevenueOpsSnapshot>;
    createWorkforceProfile: (input: CreateWorkforceProfileInput) => Promise<RevenueOpsSnapshot>;
    decideWorkforceProfile: (input: DecideWorkforceProfileInput) => Promise<RevenueOpsSnapshot>;
    recordWorkforceAvailability: (input: RecordWorkforceAvailabilityInput) => Promise<RevenueOpsSnapshot>;
    decideWorkforceAvailability: (input: DecideWorkforceAvailabilityInput) => Promise<RevenueOpsSnapshot>;
    createWorkforceAllocation: (input: CreateWorkforceAllocationInput) => Promise<RevenueOpsSnapshot>;
    cancelWorkforceAllocation: (input: CancelWorkforceAllocationInput) => Promise<RevenueOpsSnapshot>;
    createEmployerRegistration: (input: CreateEmployerRegistrationInput) => Promise<RevenueOpsSnapshot>;
    decideEmployerRegistration: (input: DecideEmployerRegistrationInput) => Promise<RevenueOpsSnapshot>;
    createPayrollPolicy: (input: CreatePayrollPolicyInput) => Promise<RevenueOpsSnapshot>;
    decidePayrollPolicy: (input: DecidePayrollPolicyInput) => Promise<RevenueOpsSnapshot>;
    createPayrollCompensation: (input: CreatePayrollCompensationInput) => Promise<RevenueOpsSnapshot>;
    decidePayrollCompensation: (input: DecidePayrollCompensationInput) => Promise<RevenueOpsSnapshot>;
    createBenefitPlan: (input: CreateBenefitPlanInput) => Promise<RevenueOpsSnapshot>;
    decideBenefitPlan: (input: DecideBenefitPlanInput) => Promise<RevenueOpsSnapshot>;
    createBenefitEnrollment: (input: CreateBenefitEnrollmentInput) => Promise<RevenueOpsSnapshot>;
    decideBenefitEnrollment: (input: DecideBenefitEnrollmentInput) => Promise<RevenueOpsSnapshot>;
    createPayrollRun: (input: CreatePayrollRunInput) => Promise<RevenueOpsSnapshot>;
    decidePayrollRun: (input: DecidePayrollRunInput) => Promise<RevenueOpsSnapshot>;
    finalizePayrollRun: (input: FinalizePayrollRunInput) => Promise<RevenueOpsSnapshot>;
    updatePayrollObligation: (input: UpdatePayrollObligationInput) => Promise<RevenueOpsSnapshot>;
    createExpenseClaim: (input: CreateExpenseClaimInput) => Promise<RevenueOpsSnapshot>;
    decideExpenseClaim: (input: DecideExpenseClaimInput) => Promise<RevenueOpsSnapshot>;
    reimburseExpenseClaim: (input: ReimburseExpenseClaimInput) => Promise<RevenueOpsSnapshot>;
    recordAttendance: (input: RecordAttendanceInput) => Promise<RevenueOpsSnapshot>;
    decideAttendance: (input: DecideAttendanceInput) => Promise<RevenueOpsSnapshot>;
    createLeaveType: (input: CreateLeaveTypeInput) => Promise<RevenueOpsSnapshot>;
    decideLeaveType: (input: DecideLeaveTypeInput) => Promise<RevenueOpsSnapshot>;
    createLeaveApplication: (input: CreateLeaveApplicationInput) => Promise<RevenueOpsSnapshot>;
    decideLeaveApplication: (input: DecideLeaveApplicationInput) => Promise<RevenueOpsSnapshot>;
    createPayrollAdjustment: (input: CreatePayrollAdjustmentInput) => Promise<RevenueOpsSnapshot>;
    decidePayrollAdjustment: (input: DecidePayrollAdjustmentInput) => Promise<RevenueOpsSnapshot>;
    createTaxDeclaration: (input: CreateTaxDeclarationInput) => Promise<RevenueOpsSnapshot>;
    decideTaxDeclaration: (input: DecideTaxDeclarationInput) => Promise<RevenueOpsSnapshot>;
    publishPayslip: (input: PublishPayslipInput) => Promise<RevenueOpsSnapshot>;
    acknowledgePayslip: (input: AcknowledgePayslipInput) => Promise<RevenueOpsSnapshot>;
    createProjectBillingPlan: (input: CreateProjectBillingPlanInput) => Promise<RevenueOpsSnapshot>;
    decideProjectBillingPlan: (input: DecideProjectBillingPlanInput) => Promise<RevenueOpsSnapshot>;
    createProjectBillingClaim: (input: CreateProjectBillingClaimInput) => Promise<RevenueOpsSnapshot>;
    decideProjectBillingClaim: (input: DecideProjectBillingClaimInput) => Promise<RevenueOpsSnapshot>;
    consumeServiceEntitlement: (input: ConsumeServiceEntitlementInput) => Promise<RevenueOpsSnapshot>;
    createAccountingClosePeriod: (input: CreateAccountingClosePeriodInput) => Promise<RevenueOpsSnapshot>;
    decideAccountingClosePeriod: (input: DecideAccountingClosePeriodInput) => Promise<RevenueOpsSnapshot>;
    reopenAccountingClosePeriod: (input: ReopenAccountingClosePeriodInput) => Promise<RevenueOpsSnapshot>;
    createProjectExchangeRate: (input: CreateProjectExchangeRateInput) => Promise<RevenueOpsSnapshot>;
    decideProjectExchangeRate: (input: DecideProjectExchangeRateInput) => Promise<RevenueOpsSnapshot>;
    createProjectCurrencyProfile: (input: CreateProjectCurrencyProfileInput) => Promise<RevenueOpsSnapshot>;
    decideProjectCurrencyProfile: (input: DecideProjectCurrencyProfileInput) => Promise<RevenueOpsSnapshot>;
    createProjectContractVariation: (input: CreateProjectContractVariationInput) => Promise<RevenueOpsSnapshot>;
    decideProjectContractVariation: (input: DecideProjectContractVariationInput) => Promise<RevenueOpsSnapshot>;
    createProjectRetainer: (input: CreateProjectRetainerInput) => Promise<RevenueOpsSnapshot>;
    decideProjectRetainer: (input: DecideProjectRetainerInput) => Promise<RevenueOpsSnapshot>;
    createRetainerDrawdown: (input: CreateRetainerDrawdownInput) => Promise<RevenueOpsSnapshot>;
    decideRetainerDrawdown: (input: DecideRetainerDrawdownInput) => Promise<RevenueOpsSnapshot>;
    createProjectResourcePlan: (input: CreateProjectResourcePlanInput) => Promise<RevenueOpsSnapshot>;
    decideProjectResourcePlan: (input: DecideProjectResourcePlanInput) => Promise<RevenueOpsSnapshot>;
    generateProjectMarginReview: (input: GenerateProjectMarginReviewInput) => Promise<RevenueOpsSnapshot>;
    reviewProjectMargin: (input: ReviewProjectMarginInput) => Promise<RevenueOpsSnapshot>;
    createUom: (input: CreateUomInput) => Promise<RevenueOpsSnapshot>;
    createUomConversion: (input: CreateUomConversionInput) => Promise<RevenueOpsSnapshot>;
    createInventoryItem: (input: CreateInventoryItemInput) => Promise<RevenueOpsSnapshot>;
    createItemVariant: (input: CreateItemVariantInput) => Promise<RevenueOpsSnapshot>;
    createWarehouse: (input: CreateWarehouseInput) => Promise<RevenueOpsSnapshot>;
    createWarehouseZone: (input: CreateWarehouseZoneInput) => Promise<RevenueOpsSnapshot>;
    createStorageBin: (input: CreateStorageBinInput) => Promise<RevenueOpsSnapshot>;
    receiveInventory: (input: ReceiveInventoryInput) => Promise<RevenueOpsSnapshot>;
    createPutawayTask: (input: CreatePutawayTaskInput) => Promise<RevenueOpsSnapshot>;
    createPickTask: (input: CreatePickTaskInput) => Promise<RevenueOpsSnapshot>;
    transitionWarehouseTask: (input: TransitionWarehouseTaskInput) => Promise<RevenueOpsSnapshot>;
    createInventoryTransfer: (input: CreateInventoryTransferInput) => Promise<RevenueOpsSnapshot>;
    transitionInventoryTransfer: (input: TransitionInventoryTransferInput) => Promise<RevenueOpsSnapshot>;
    createCycleCount: (input: CreateCycleCountInput) => Promise<RevenueOpsSnapshot>;
    recordCycleCount: (input: RecordCycleCountInput) => Promise<RevenueOpsSnapshot>;
    decideCycleCount: (input: DecideCycleCountInput) => Promise<RevenueOpsSnapshot>;
    createReorderPolicy: (input: CreateReorderPolicyInput) => Promise<RevenueOpsSnapshot>;
    generateReorderProposals: () => Promise<RevenueOpsSnapshot>;
    decideReorderProposal: (input: DecideReorderProposalInput) => Promise<RevenueOpsSnapshot>;
    createInventoryValuationReview: (input: CreateInventoryValuationReviewInput) => Promise<RevenueOpsSnapshot>;
    decideInventoryValuationReview: (input: DecideInventoryValuationReviewInput) => Promise<RevenueOpsSnapshot>;
    createInventoryDisposition: (input: CreateInventoryDispositionInput) => Promise<RevenueOpsSnapshot>;
    decideInventoryDisposition: (input: DecideInventoryDispositionInput) => Promise<RevenueOpsSnapshot>;
    postInventoryDisposition: (input: PostInventoryDispositionInput) => Promise<RevenueOpsSnapshot>;
  };
  generalLedger: {
    getSnapshot: () => Promise<GeneralLedgerSnapshot>;
    bindCompany: (input: BindLedgerCompanyInput) => Promise<GeneralLedgerSnapshot>;
    createJournal: (input: CreateLedgerJournalInput) => Promise<GeneralLedgerSnapshot>;
    prepareRevenueInvoicePosting: (input: PrepareRevenueInvoicePostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareCashReceiptPosting: (input: PrepareCashReceiptPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareWriteOffPosting: (input: PrepareWriteOffPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareWithholdingPosting: (input: PrepareWithholdingPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareTreasuryPosting: (input: PrepareTreasuryPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareManufacturingPosting: (input: PrepareManufacturingPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareLandedCostPosting: (input: PrepareLandedCostPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareRetailSaleCostPosting: (input: PrepareRetailSaleCostPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareRetailReturnCostPosting: (input: PrepareRetailReturnCostPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareRetailCommerceSettlementPosting: (input: PrepareRetailCommerceSettlementPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareRetailCommissionPayoutPosting: (input: PrepareRetailCommissionPayoutPostingInput) => Promise<GeneralLedgerSnapshot>;
    preparePeoplePosting: (input: PreparePeoplePostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareCommercialAdjustmentPosting: (input: PrepareCommercialAdjustmentPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareSupplierInvoicePosting: (input: PrepareSupplierInvoicePostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareAssetCapitalizationPosting: (input: PrepareAssetCapitalizationPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareAssetDepreciationPosting: (input: PrepareAssetDepreciationPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareAssetRetirementPosting: (input: PrepareAssetRetirementPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareAssetSaleDisposalPosting: (input: PrepareAssetSaleDisposalPostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareAssetLifecyclePosting: (input: PrepareAssetLifecyclePostingInput) => Promise<GeneralLedgerSnapshot>;
    prepareProjectRevenueRecognitionPosting: (input: PrepareProjectRevenueRecognitionPostingInput) => Promise<GeneralLedgerSnapshot>;
    postJournal: (input: PostLedgerJournalInput) => Promise<GeneralLedgerSnapshot>;
    reverseJournal: (input: ReverseLedgerJournalInput) => Promise<GeneralLedgerSnapshot>;
    cancelReversalJournal: (input: CancelLedgerJournalInput) => Promise<GeneralLedgerSnapshot>;
  };
  financeCompletion?: {
    list: () => Promise<FinanceCompletionSnapshot[]>;
    save: (input: { id: string; snapshot: FinanceCompletionSnapshot; status?: 'draft' | 'reviewed' | 'approved'; expectedVersion?: number }) => Promise<FinanceCompletionSnapshot>;
  };
  crm: {
    getSnapshot: () => Promise<DashboardSnapshot>;
    createLead: (input: CreateLeadInput) => Promise<DashboardSnapshot>;
    moveOpportunity: (
      input: MoveOpportunityInput,
    ) => Promise<DashboardSnapshot>;
    completeActivity: (
      input: CompleteActivityInput,
    ) => Promise<DashboardSnapshot>;
  };
  kernel: {
    getSnapshot: () => Promise<KernelSnapshot>;
    getOperationalHealth: () => Promise<OperationalHealthSnapshot>;
    getOutboxReplayPlan: () => Promise<OutboxReplayPlan>;
    executeOutboxReplay: (input: ExecuteOutboxReplayInput) => Promise<KernelSnapshot>;
    resolveOutboxConflict: (input: ResolveOutboxConflictInput) => Promise<KernelSnapshot>;
    updateTenantIdentity: (input: UpdateTenantIdentityInput) => Promise<KernelSnapshot>;
    createCompany: (input: CreateCompanyInput) => Promise<KernelSnapshot>;
    updateCompany: (input: UpdateCompanyInput) => Promise<KernelSnapshot>;
    createBranch: (input: CreateBranchInput) => Promise<KernelSnapshot>;
    updateBranch: (input: UpdateBranchInput) => Promise<KernelSnapshot>;
    createUser: (input: CreateUserInput) => Promise<KernelSnapshot>;
    createRole: (input: CreateRoleInput) => Promise<KernelSnapshot>;
    updateRolePolicy: (input: UpdateRolePolicyInput) => Promise<KernelSnapshot>;
    upsertFieldAccessRule: (input: UpsertFieldAccessRuleInput) => Promise<KernelSnapshot>;
    updateApprovalPolicy: (input: UpdateApprovalPolicyInput) => Promise<KernelSnapshot>;
    assignRole: (input: AssignRoleInput) => Promise<KernelSnapshot>;
    issueNumber: (input: IssueNumberInput) => Promise<IssueNumberResult>;
    transitionWorkflow: (
      input: TransitionWorkflowInput,
    ) => Promise<KernelSnapshot>;
    decideApproval: (input: DecideApprovalInput) => Promise<KernelSnapshot>;
    registerCustomField: (
      input: RegisterCustomFieldInput,
    ) => Promise<KernelSnapshot>;
  };
}

export const IPC_CHANNELS = {
  systemInfo: 'epic-bos:system:info',
  systemBuildProvenance: 'epic-bos:system:build-provenance',
  authStatus: 'epic-bos:auth:status',
  authBootstrapOwner: 'epic-bos:auth:bootstrap-owner',
  authLogin: 'epic-bos:auth:login',
  authLogout: 'epic-bos:auth:logout',
  authLock: 'epic-bos:auth:lock',
  authChangePassword: 'epic-bos:auth:change-password',
  storageListAttachments: 'epic-bos:storage:list-attachments',
  storageAddAttachment: 'epic-bos:storage:add-attachment',
  storageExportAttachment: 'epic-bos:storage:export-attachment',
  storageCreateDatabaseBackup: 'epic-bos:storage:create-database-backup',
  storageRestoreDatabaseBackup: 'epic-bos:storage:restore-database-backup',
  storageListRestoreDrills: 'epic-bos:storage:list-restore-drills',
  storageRunRestoreDrill: 'epic-bos:storage:run-restore-drill',
  retailWorkspaceGetStatus: 'epic-bos:retail-workspace:get-status',
  retailWorkspaceGetDemoResetPreview: 'epic-bos:retail-workspace:get-demo-reset-preview',
  retailWorkspaceApplyDemoReset: 'epic-bos:retail-workspace:apply-demo-reset',
  integrationListApiKeys: 'epic-bos:integration:list-api-keys',
  integrationIssueApiKey: 'epic-bos:integration:issue-api-key',
  integrationRevokeApiKey: 'epic-bos:integration:revoke-api-key',
  integrationExportApiKeyInventory: 'epic-bos:integration:export-api-key-inventory',
  integrationExportProviderCertification: 'epic-bos:integration:export-provider-certification',
  integrationGetRetailCertificationPack: 'epic-bos:integration:get-retail-certification-pack',
  integrationExportRetailCertificationPack: 'epic-bos:integration:export-retail-certification-pack',
  releaseListGates: 'epic-bos:release:list-gates',
  releaseRecordGate: 'epic-bos:release:record-gate',
  releaseListArtifactEvidence: 'epic-bos:release:list-artifact-evidence',
  releaseRecordArtifactEvidence: 'epic-bos:release:record-artifact-evidence',
  releaseDecideArtifactEvidence: 'epic-bos:release:decide-artifact-evidence',
  releaseListUpdateEvidence: 'epic-bos:release:list-update-evidence',
  releaseRecordUpdateEvidence: 'epic-bos:release:record-update-evidence',
  releaseDecideUpdateEvidence: 'epic-bos:release:decide-update-evidence',
  releaseAutoUpdateStatus: 'epic-bos:release:auto-update-status',
  releaseListUiAcceptanceEvidence: 'epic-bos:release:list-ui-acceptance-evidence',
  releaseRecordUiAcceptanceEvidence: 'epic-bos:release:record-ui-acceptance-evidence',
  releaseDecideUiAcceptanceEvidence: 'epic-bos:release:decide-ui-acceptance-evidence',
  releaseUiAcceptanceReadiness: 'epic-bos:release:ui-acceptance-readiness',
  releaseReadiness: 'epic-bos:release:readiness',
  releaseReadinessReport: 'epic-bos:release:readiness-report',
  releaseSupportDiagnostics: 'epic-bos:release:support-diagnostics',
  intelligenceListAnomalies: 'epic-bos:intelligence:list-anomalies',
  intelligenceSaveAnomaly: 'epic-bos:intelligence:save-anomaly',
  intelligenceReviewAnomaly: 'epic-bos:intelligence:review-anomaly',
  intelligenceListReportExecutions: 'epic-bos:intelligence:list-report-executions',
  intelligenceSaveReportExecution: 'epic-bos:intelligence:save-report-execution',
  intelligenceListReportDeliveryPlans: 'epic-bos:intelligence:list-report-delivery-plans',
  intelligenceListReportDeliveryAttempts: 'epic-bos:intelligence:list-report-delivery-attempts',
  intelligenceCreateReportDeliveryPlan: 'epic-bos:intelligence:create-report-delivery-plan',
  intelligenceDecideReportDeliveryPlan: 'epic-bos:intelligence:decide-report-delivery-plan',
  intelligencePrepareReportDeliveryAttempt: 'epic-bos:intelligence:prepare-report-delivery-attempt',
  intelligenceRecordReportDeliveryResult: 'epic-bos:intelligence:record-report-delivery-result',
  automationListRuns: 'epic-bos:automation:list-runs',
  automationProposeRun: 'epic-bos:automation:propose-run',
  automationApproveRun: 'epic-bos:automation:approve-run',
  automationStartRun: 'epic-bos:automation:start-run',
  automationRetryRun: 'epic-bos:automation:retry-run',
  automationCompleteRun: 'epic-bos:automation:complete-run',
  automationScheduleList: 'epic-bos:automation-schedule:list',
  automationScheduleTriggerHistory: 'epic-bos:automation-schedule:trigger-history',
  automationScheduleFailures: 'epic-bos:automation-schedule:failures',
  automationScheduleResolveFailure: 'epic-bos:automation-schedule:resolve-failure',
  automationScheduleOperations: 'epic-bos:automation-schedule:operations',
  automationScheduleRetryFailure: 'epic-bos:automation-schedule:retry-failure',
  automationScheduleAcknowledgeEscalation: 'epic-bos:automation-schedule:acknowledge-escalation',
  automationScheduleActions: 'epic-bos:automation-schedule:actions',
  automationScheduleSave: 'epic-bos:automation-schedule:save',
  automationScheduleEvaluate: 'epic-bos:automation-schedule:evaluate',
  automationScheduleTick: 'epic-bos:automation-schedule:tick',
  partySnapshot: 'epic-bos:party:snapshot',
  partyCreateAccount: 'epic-bos:party:create-account',
  partyCreateContact: 'epic-bos:party:create-contact',
  partyRecordConsent: 'epic-bos:party:record-consent',
  partyResolveDuplicate: 'epic-bos:party:resolve-duplicate',
  partyAddAddress: 'epic-bos:party:add-address',
  partyAddContactPoint: 'epic-bos:party:add-contact-point',
  partyCreateRelationship: 'epic-bos:party:create-relationship',
  partyExecuteMerge: 'epic-bos:party:execute-merge',
  partyConvertLead: 'epic-bos:party:convert-lead',
  crmDepthSnapshot: 'epic-bos:crm-depth:snapshot',
  crmDepthUpdatePipeline: 'epic-bos:crm-depth:update-pipeline',
  crmDepthCreateScoringRule: 'epic-bos:crm-depth:create-scoring-rule',
  crmDepthCreateCampaign: 'epic-bos:crm-depth:create-campaign',
  crmDepthTransitionCampaign: 'epic-bos:crm-depth:transition-campaign',
  crmDepthCreateSavedView: 'epic-bos:crm-depth:create-saved-view',
  crmDepthPreviewLeadImport: 'epic-bos:crm-depth:preview-lead-import',
  crmDepthCommitImport: 'epic-bos:crm-depth:commit-import',
  crmDepthConfigureAdapter: 'epic-bos:crm-depth:configure-adapter',
  crmDepthRecordCommunication: 'epic-bos:crm-depth:record-communication',
  crmDepthRecordCommunicationDelivery: 'epic-bos:crm-depth:record-communication-delivery',
  generalLedgerSnapshot: 'epic-bos:general-ledger:snapshot',
  generalLedgerBindCompany: 'epic-bos:general-ledger:bind-company',
  generalLedgerCreateJournal: 'epic-bos:general-ledger:create-journal',
  generalLedgerPrepareRevenueInvoicePosting: 'epic-bos:general-ledger:prepare-revenue-invoice-posting',
  generalLedgerPrepareCashReceiptPosting: 'epic-bos:general-ledger:prepare-cash-receipt-posting',
  generalLedgerPrepareWriteOffPosting: 'epic-bos:general-ledger:prepare-write-off-posting',
  generalLedgerPrepareWithholdingPosting: 'epic-bos:general-ledger:prepare-withholding-posting',
  generalLedgerPrepareTreasuryPosting: 'epic-bos:general-ledger:prepare-treasury-posting',
  generalLedgerPrepareManufacturingPosting: 'epic-bos:general-ledger:prepare-manufacturing-posting',
  generalLedgerPrepareLandedCostPosting: 'epic-bos:general-ledger:prepare-landed-cost-posting',
  generalLedgerPrepareRetailSaleCostPosting: 'epic-bos:general-ledger:prepare-retail-sale-cost-posting',
  generalLedgerPrepareRetailReturnCostPosting: 'epic-bos:general-ledger:prepare-retail-return-cost-posting',
  generalLedgerPrepareRetailCommerceSettlementPosting: 'epic-bos:general-ledger:prepare-retail-commerce-settlement-posting',
  generalLedgerPrepareRetailCommissionPayoutPosting: 'epic-bos:general-ledger:prepare-retail-commission-payout-posting',
  generalLedgerPreparePeoplePosting: 'epic-bos:general-ledger:prepare-people-posting',
  generalLedgerPrepareCommercialAdjustmentPosting: 'epic-bos:general-ledger:prepare-commercial-adjustment-posting',
  generalLedgerPrepareSupplierInvoicePosting: 'epic-bos:general-ledger:prepare-supplier-invoice-posting',
  generalLedgerPrepareAssetCapitalizationPosting: 'epic-bos:general-ledger:prepare-asset-capitalization-posting',
  generalLedgerPrepareAssetDepreciationPosting: 'epic-bos:general-ledger:prepare-asset-depreciation-posting',
  generalLedgerPrepareAssetRetirementPosting: 'epic-bos:general-ledger:prepare-asset-retirement-posting',
  generalLedgerPrepareAssetSaleDisposalPosting: 'epic-bos:general-ledger:prepare-asset-sale-disposal-posting',
  generalLedgerPrepareAssetLifecyclePosting: 'epic-bos:general-ledger:prepare-asset-lifecycle-posting',
  generalLedgerPrepareProjectRevenueRecognitionPosting: 'epic-bos:general-ledger:prepare-project-revenue-recognition-posting',
  generalLedgerPostJournal: 'epic-bos:general-ledger:post-journal',
  generalLedgerReverseJournal: 'epic-bos:general-ledger:reverse-journal',
  generalLedgerCancelReversalJournal: 'epic-bos:general-ledger:cancel-reversal-journal',
  financeCompletionList: 'epic-bos:finance-completion:list',
  financeCompletionSave: 'epic-bos:finance-completion:save',
  revenueOpsSnapshot: 'epic-bos:revenue-ops:snapshot',
    revenueOpsListRetailCutoverPlans: 'epic-bos:revenue-ops:list-retail-cutover-plans',
    revenueOpsFetchRetailHubCutoverAssessment: 'epic-bos:revenue-ops:fetch-retail-hub-cutover-assessment',
    revenueOpsCreateRetailCutoverPlan: 'epic-bos:revenue-ops:create-retail-cutover-plan',
    revenueOpsCreateRetailCutoverPlanFromHubAssessment: 'epic-bos:revenue-ops:create-retail-cutover-plan-from-hub-assessment',
    revenueOpsAdvanceRetailCutover: 'epic-bos:revenue-ops:advance-retail-cutover',
  revenueOpsPeopleReadProjection: 'epic-bos:revenue-ops:people-read-projection',
  revenueOpsUpdateProfile: 'epic-bos:revenue-ops:update-profile',
  revenueOpsCreateTerritory: 'epic-bos:revenue-ops:create-territory',
  revenueOpsCreateAssignmentRule: 'epic-bos:revenue-ops:create-assignment-rule',
  revenueOpsBulkAssign: 'epic-bos:revenue-ops:bulk-assign',
  revenueOpsCreateSegment: 'epic-bos:revenue-ops:create-segment',
  revenueOpsCreateOpportunity: 'epic-bos:revenue-ops:create-opportunity',
  revenueOpsCreateQuote: 'epic-bos:revenue-ops:create-quote',
  revenueOpsTransitionQuote: 'epic-bos:revenue-ops:transition-quote',
  revenueOpsCreateGstTaxCode: 'epic-bos:revenue-ops:create-gst-tax-code',
  revenueOpsCreateCatalogProduct: 'epic-bos:revenue-ops:create-catalog-product',
  revenueOpsImportRetailProductPack: 'epic-bos:revenue-ops:import-retail-product-pack',
  revenueOpsCreatePriceList: 'epic-bos:revenue-ops:create-price-list',
  revenueOpsCreatePriceListEntry: 'epic-bos:revenue-ops:create-price-list-entry',
  revenueOpsCreateDiscountPolicy: 'epic-bos:revenue-ops:create-discount-policy',
  revenueOpsSubmitPriceListForApproval: 'epic-bos:revenue-ops:submit-price-list-for-approval',
  revenueOpsDecidePriceListApproval: 'epic-bos:revenue-ops:decide-price-list-approval',
  revenueOpsSubmitQuoteForApproval: 'epic-bos:revenue-ops:submit-quote-for-approval',
  revenueOpsDecideQuoteApproval: 'epic-bos:revenue-ops:decide-quote-approval',
  revenueOpsExportQuotePdf: 'epic-bos:revenue-ops:export-quote-pdf',
  revenueOpsConvertQuoteToSalesOrder: 'epic-bos:revenue-ops:convert-quote-to-sales-order',
  revenueOpsTransitionSalesOrder: 'epic-bos:revenue-ops:transition-sales-order',
  revenueOpsUpdateFulfilmentTask: 'epic-bos:revenue-ops:update-fulfilment-task',
  revenueOpsCreatePaymentTerm: 'epic-bos:revenue-ops:create-payment-term',
  retailCreateCounter: 'epic-bos:retail:create-counter',
  retailOpenCashierShift: 'epic-bos:retail:open-cashier-shift',
  retailCheckout: 'epic-bos:retail:checkout',
  retailEnqueueOfflineSale: 'epic-bos:retail:enqueue-offline-sale',
  retailSyncOfflineSale: 'epic-bos:retail:sync-offline-sale',
  retailSyncOfflineQueue: 'epic-bos:retail:sync-offline-queue',
  retailResolveOfflineSale: 'epic-bos:retail:resolve-offline-sale',
  retailIngestUnifiedOrder: 'epic-bos:retail:ingest-unified-order',
  retailPrepareUnifiedOrderHandoff: 'epic-bos:retail:prepare-unified-order-handoff',
  retailPrepareOrderHubHandoff: 'epic-bos:retail:prepare-order-hub-handoff',
  retailRecordOrderHubHandoffResult: 'epic-bos:retail:record-order-hub-handoff-result',
  retailPrepareOrderFulfilmentHandoff: 'epic-bos:retail:prepare-order-fulfilment-handoff',
  retailDecideOrderFulfilmentHandoff: 'epic-bos:retail:decide-order-fulfilment-handoff',
  retailReserveUnifiedOrderStock: 'epic-bos:retail:reserve-unified-order-stock',
  retailCreateUnifiedOrderPickTasks: 'epic-bos:retail:create-unified-order-pick-tasks',
  retailCompleteUnifiedOrderPickTasks: 'epic-bos:retail:complete-unified-order-pick-tasks',
  retailCreateUnifiedOrderShipmentPackage: 'epic-bos:retail:create-unified-order-shipment-package',
  retailCompleteUnifiedOrderShipmentPackage: 'epic-bos:retail:complete-unified-order-shipment-package',
  retailPrepareUnifiedOrderDispatch: 'epic-bos:retail:prepare-unified-order-dispatch',
  retailDispatchUnifiedOrder: 'epic-bos:retail:dispatch-unified-order',
  retailConfirmUnifiedOrderDelivery: 'epic-bos:retail:confirm-unified-order-delivery',
  retailReconcileUnifiedOrderRto: 'epic-bos:retail:reconcile-unified-order-rto',
  retailReconcileUnifiedOrderReturn: 'epic-bos:retail:reconcile-unified-order-return',
  retailRecordUnifiedOrderCarrierCallback: 'epic-bos:retail:record-unified-order-carrier-callback',
  retailPrepareDeviceTransport: 'epic-bos:retail:prepare-device-transport',
  retailRecordDeviceTransport: 'epic-bos:retail:record-device-transport',
  retailRecordNativeDeviceDriverResult: 'epic-bos:retail:record-native-device-driver-result',
  retailExecuteDeviceTransport: 'epic-bos:retail:execute-device-transport',
  retailRetryDeviceTransport: 'epic-bos:retail:retry-device-transport',
  retailPreflightDeviceTransport: 'epic-bos:retail:preflight-device-transport',
  retailRecordDevicePreflightEvidence: 'epic-bos:retail:record-device-preflight-evidence',
  retailCreateDeviceAdapterProfile: 'epic-bos:retail:create-device-adapter-profile',
  retailApproveDeviceAdapterProfile: 'epic-bos:retail:approve-device-adapter-profile',
  retailRecordDeviceAdapterAcknowledgement: 'epic-bos:retail:record-device-adapter-acknowledgement',
  retailActivateDeviceAdapterProfile: 'epic-bos:retail:activate-device-adapter-profile',
  retailSuspendDeviceAdapterProfile: 'epic-bos:retail:suspend-device-adapter-profile',
  retailCreateLoyaltyAccount: 'epic-bos:retail:create-loyalty-account',
  retailRedeemLoyaltyPoints: 'epic-bos:retail:redeem-loyalty-points',
  retailCreateCustomerVisit: 'epic-bos:retail:create-customer-visit',
  retailLinkCustomerVisitToSale: 'epic-bos:retail:link-customer-visit-to-sale',
  retailCreateSalesCommission: 'epic-bos:retail:create-sales-commission',
  retailDecideSalesCommission: 'epic-bos:retail:decide-sales-commission',
  retailPaySalesCommission: 'epic-bos:retail:pay-sales-commission',
  retailCreateCommissionPayoutBatch: 'epic-bos:retail:create-commission-payout-batch',
  retailDecideCommissionPayoutBatch: 'epic-bos:retail:decide-commission-payout-batch',
  retailReleaseCommissionPayoutBatch: 'epic-bos:retail:release-commission-payout-batch',
  retailRequestCashierShiftClose: 'epic-bos:retail:request-cashier-shift-close',
  retailDecideCashierShiftClose: 'epic-bos:retail:decide-cashier-shift-close',
  retailRequestCashierShiftVarianceResolution: 'epic-bos:retail:request-cashier-shift-variance-resolution',
  retailDecideCashierShiftVarianceResolution: 'epic-bos:retail:decide-cashier-shift-variance-resolution',
  retailCreateReturnRequest: 'epic-bos:retail:create-return-request',
  retailCreateExchange: 'epic-bos:retail:create-exchange',
  retailDecideExchange: 'epic-bos:retail:decide-exchange',
  retailPrepareCreditNoteReconciliation: 'epic-bos:retail:prepare-credit-note-reconciliation',
  retailRecordCreditNotePortalResponse: 'epic-bos:retail:record-credit-note-portal-response',
  retailCreateInterBranchTransfer: 'epic-bos:retail:create-inter-branch-transfer',
  retailDecideInterBranchTransfer: 'epic-bos:retail:decide-inter-branch-transfer',
  retailDispatchInterBranchTransfer: 'epic-bos:retail:dispatch-inter-branch-transfer',
  retailReceiveInterBranchTransfer: 'epic-bos:retail:receive-inter-branch-transfer',
  retailCreateScaleProfile: 'epic-bos:retail:create-scale-profile',
  retailCreatePrinterAdapter: 'epic-bos:retail:create-printer-adapter',
  retailTestPrinterAdapter: 'epic-bos:retail:test-printer-adapter',
  retailCreateLabelPrintDispatch: 'epic-bos:retail:create-label-print-dispatch',
  retailDecideLabelPrintDispatch: 'epic-bos:retail:decide-label-print-dispatch',
  retailPrepareCatalogBulkEdit: 'epic-bos:retail:prepare-catalog-bulk-edit',
  retailApplyCatalogBulkEdit: 'epic-bos:retail:apply-catalog-bulk-edit',
  retailCreatePurchaseOcrDocument: 'epic-bos:retail:create-purchase-ocr-document',
  retailDecidePurchaseOcr: 'epic-bos:retail:decide-purchase-ocr',
  retailConvertPurchaseOcr: 'epic-bos:retail:convert-purchase-ocr',
  retailCreateCommerceConnector: 'epic-bos:retail:create-commerce-connector',
  retailConfigureCommerceCredentials: 'epic-bos:retail:configure-commerce-credentials',
  retailCreateCommerceSyncRun: 'epic-bos:retail:create-commerce-sync-run',
  retailExecuteCommerceSync: 'epic-bos:retail:execute-commerce-sync',
  retailRecordCommerceSync: 'epic-bos:retail:record-commerce-sync',
  retailImportCommerceOrder: 'epic-bos:retail:import-commerce-order',
  retailHandoffCommerceOrder: 'epic-bos:retail:handoff-commerce-order',
  retailReserveCommerceOrder: 'epic-bos:retail:reserve-commerce-order',
  retailCreateSettlementReconciliation: 'epic-bos:retail:create-settlement-reconciliation',
  retailDecideSettlementReconciliation: 'epic-bos:retail:decide-settlement-reconciliation',
  retailCreateSettlementAllocationPack: 'epic-bos:retail:create-settlement-allocation-pack',
  retailDecideSettlementAllocationPack: 'epic-bos:retail:decide-settlement-allocation-pack',
  retailCreateCommerceConflictResolution: 'epic-bos:retail:create-commerce-conflict-resolution',
  retailDecideCommerceConflictResolution: 'epic-bos:retail:decide-commerce-conflict-resolution',
  retailCreateSettlementWithholdingEvidence: 'epic-bos:retail:create-settlement-withholding-evidence',
  retailDecideSettlementWithholdingEvidence: 'epic-bos:retail:decide-settlement-withholding-evidence',
  retailPrepareSettlementJournal: 'epic-bos:retail:prepare-settlement-journal',
  retailLinkCommerceReturn: 'epic-bos:retail:link-commerce-return',
  retailCreateOcrProviderProfile: 'epic-bos:retail:create-ocr-provider-profile',
  retailConfigureOcrProvider: 'epic-bos:retail:configure-ocr-provider',
  retailExecuteOcr: 'epic-bos:retail:execute-ocr',
  retailTestOcrProvider: 'epic-bos:retail:test-ocr-provider',
  retailPreparePurchaseOcrMapping: 'epic-bos:retail:prepare-purchase-ocr-mapping',
  retailApplyPurchaseOcrMapping: 'epic-bos:retail:apply-purchase-ocr-mapping',
  retailPrepareCommercePushBatch: 'epic-bos:retail:prepare-commerce-push-batch',
  retailDecideCommercePushBatch: 'epic-bos:retail:decide-commerce-push-batch',
  retailExecuteCommercePushBatch: 'epic-bos:retail:execute-commerce-push-batch',
  retailCreateCommerceCatalogMapping: 'epic-bos:retail:create-commerce-catalog-mapping',
  retailDecideCommerceCatalogMapping: 'epic-bos:retail:decide-commerce-catalog-mapping',
  retailDisableCommerceCatalogMapping: 'epic-bos:retail:disable-commerce-catalog-mapping',
  retailTransitionCommerceOrder: 'epic-bos:retail:transition-commerce-order',
  retailCreateCommerceConformanceCase: 'epic-bos:retail:create-commerce-conformance-case',
  retailPlanCommerceConformancePack: 'epic-bos:retail:plan-commerce-conformance-pack',
  retailRecordCommerceConformance: 'epic-bos:retail:record-commerce-conformance',
  retailScanPurchaseExceptions: 'epic-bos:retail:scan-purchase-exceptions',
  retailResolvePurchaseException: 'epic-bos:retail:resolve-purchase-exception',
  retailInspectReturn: 'epic-bos:retail:inspect-return',
  retailDecideReturn: 'epic-bos:retail:decide-return',
  retailRequestReturnSettlement: 'epic-bos:retail:request-return-settlement',
  retailDecideReturnSettlement: 'epic-bos:retail:decide-return-settlement',
  retailConfirmReturnProviderRefund: 'epic-bos:retail:confirm-return-provider-refund',
  retailCreateCatalogCategory: 'epic-bos:retail:create-catalog-category',
  retailCreateCatalogBrand: 'epic-bos:retail:create-catalog-brand',
  retailSaveMerchandisingProfile: 'epic-bos:retail:save-merchandising-profile',
  retailCreateBarcodeSequence: 'epic-bos:retail:create-barcode-sequence',
  retailResetBarcodeSequence: 'epic-bos:retail:reset-barcode-sequence',
  retailAssignBarcode: 'epic-bos:retail:assign-barcode',
  retailCreateLabelPrintRun: 'epic-bos:retail:create-label-print-run',
  retailCreateProductCombo: 'epic-bos:retail:create-product-combo',
  revenueOpsRecordDeliveryEvidence: 'epic-bos:revenue-ops:record-delivery-evidence',
  revenueOpsCreateServiceMilestone: 'epic-bos:revenue-ops:create-service-milestone',
  revenueOpsTransitionServiceMilestone: 'epic-bos:revenue-ops:transition-service-milestone',
  revenueOpsCreateInvoiceDraft: 'epic-bos:revenue-ops:create-invoice-draft',
  revenueOpsIssueInvoice: 'epic-bos:revenue-ops:issue-invoice',
  revenueOpsCreateCreditDebitNote: 'epic-bos:revenue-ops:create-credit-debit-note',
  revenueOpsRecordPayment: 'epic-bos:revenue-ops:record-payment',
  revenueOpsApplyUnappliedReceipt: 'epic-bos:revenue-ops:apply-unapplied-receipt',
  revenueOpsReconcilePayment: 'epic-bos:revenue-ops:reconcile-payment',
  revenueOpsExportJournal: 'epic-bos:revenue-ops:export-journal',
  revenueOpsExportInvoicePdf: 'epic-bos:revenue-ops:export-invoice-pdf',
  revenueOpsCreateGstRegistration: 'epic-bos:revenue-ops:create-gst-registration',
  revenueOpsCreatePlaceOfSupplyReview: 'epic-bos:revenue-ops:create-place-of-supply-review',
  revenueOpsDecidePlaceOfSupplyReview: 'epic-bos:revenue-ops:decide-place-of-supply-review',
  revenueOpsCreateStockLocation: 'epic-bos:revenue-ops:create-stock-location',
  revenueOpsRecordStockMovement: 'epic-bos:revenue-ops:record-stock-movement',
  revenueOpsReserveStock: 'epic-bos:revenue-ops:reserve-stock',
  revenueOpsReleaseStockReservation: 'epic-bos:revenue-ops:release-stock-reservation',
  revenueOpsCreatePincodeServiceabilityRule: 'epic-bos:revenue-ops:create-pincode-serviceability-rule',
  revenueOpsDecidePincodeServiceabilityRule: 'epic-bos:revenue-ops:decide-pincode-serviceability-rule',
  revenueOpsCreateDeliveryPromise: 'epic-bos:revenue-ops:create-delivery-promise',
  revenueOpsCreateCodCollectionCase: 'epic-bos:revenue-ops:create-cod-collection-case',
  revenueOpsRecordCodHandover: 'epic-bos:revenue-ops:record-cod-handover',
  revenueOpsRecordCodCarrierCollection: 'epic-bos:revenue-ops:record-cod-carrier-collection',
  financeRecordCodRemittance: 'epic-bos:finance:record-cod-remittance',
  financeMatchCodBank: 'epic-bos:finance:match-cod-bank',
  financeCloseCodShortfall: 'epic-bos:finance:close-cod-shortfall',
  revenueOpsRecordCodException: 'epic-bos:revenue-ops:record-cod-exception',
  revenueOpsCreateShipmentPackage: 'epic-bos:revenue-ops:create-shipment-package',
  revenueOpsTransitionShipment: 'epic-bos:revenue-ops:transition-shipment',
  revenueOpsConfigureCarrierAdapter: 'epic-bos:revenue-ops:configure-carrier-adapter',
  revenueOpsCreateReturnAuthorization: 'epic-bos:revenue-ops:create-return-authorization',
  revenueOpsDecideReturnAuthorization: 'epic-bos:revenue-ops:decide-return-authorization',
  revenueOpsReceiveReturn: 'epic-bos:revenue-ops:receive-return',
  revenueOpsInspectReturn: 'epic-bos:revenue-ops:inspect-return',
  revenueOpsPrepareStatutoryExchange: 'epic-bos:revenue-ops:prepare-statutory-exchange',
  revenueOpsSubmitStatutoryExchange: 'epic-bos:revenue-ops:submit-statutory-exchange',
  revenueOpsRecordStatutoryResponse: 'epic-bos:revenue-ops:record-statutory-response',
  statutoryConfigureAdapter: 'epic-bos:statutory:configure-adapter',
  statutoryConfigureCredentials: 'epic-bos:statutory:configure-credentials',
  statutoryPrepareOperation: 'epic-bos:statutory:prepare-operation',
  statutorySubmitOperation: 'epic-bos:statutory:submit-operation',
  statutoryRecordOperationResponse: 'epic-bos:statutory:record-operation-response',
  statutoryPrepareConsolidatedEwb: 'epic-bos:statutory:prepare-consolidated-ewb',
  statutorySubmitConsolidatedEwb: 'epic-bos:statutory:submit-consolidated-ewb',
  statutoryRecordConsolidatedEwbResponse: 'epic-bos:statutory:record-consolidated-ewb-response',
  statutoryVerifySignature: 'epic-bos:statutory:verify-signature',
  statutoryRunPortalReconciliation: 'epic-bos:statutory:run-portal-reconciliation',
  providerConfigureConnector: 'epic-bos:provider:configure-connector',
  providerConfigureCredentials: 'epic-bos:provider:configure-credentials',
  providerCreateConformanceCase: 'epic-bos:provider:create-conformance-case',
  providerPlanConformancePack: 'epic-bos:provider:plan-conformance-pack',
  providerExecutePreflight: 'epic-bos:provider:execute-preflight',
  providerRecordConformanceResult: 'epic-bos:provider:record-conformance-result',
  providerApproveConnector: 'epic-bos:provider:approve-connector',
  providerPrepareSubmission: 'epic-bos:provider:prepare-submission',
  providerHandOffSubmission: 'epic-bos:provider:hand-off-submission',
  providerRecordSubmissionResponse: 'epic-bos:provider:record-submission-response',
  providerRunReconciliation: 'epic-bos:provider:run-reconciliation',
  collectionsProposeCreditLimit: 'epic-bos:collections:propose-credit-limit',
  collectionsDecideCreditLimit: 'epic-bos:collections:decide-credit-limit',
  collectionsRunDunning: 'epic-bos:collections:run-dunning',
  collectionsRecordActivity: 'epic-bos:collections:record-activity',
  collectionsOpenDispute: 'epic-bos:collections:open-dispute',
  collectionsResolveDispute: 'epic-bos:collections:resolve-dispute',
  collectionsRequestWriteOff: 'epic-bos:collections:request-write-off',
  collectionsDecideWriteOff: 'epic-bos:collections:decide-write-off',
  financeCreateWithholdingPolicy: 'epic-bos:finance:create-withholding-policy',
  financeRecordWithholdingEntry: 'epic-bos:finance:record-withholding-entry',
  financeTransitionWithholdingEntry: 'epic-bos:finance:transition-withholding-entry',
  financePrepareZeroRatedSupply: 'epic-bos:finance:prepare-zero-rated-supply',
  financeDecideZeroRatedSupply: 'epic-bos:finance:decide-zero-rated-supply',
  financeCreateBankAccount: 'epic-bos:finance:create-bank-account',
  financePreviewBankStatement: 'epic-bos:finance:preview-bank-statement',
  financeCommitBankStatement: 'epic-bos:finance:commit-bank-statement',
  financeConfirmBankMatch: 'epic-bos:finance:confirm-bank-match',
  financeExcludeBankLine: 'epic-bos:finance:exclude-bank-line',
  procurementCreateRequisition: 'epic-bos:procurement:create-requisition',
  procurementDecideRequisition: 'epic-bos:procurement:decide-requisition',
  procurementCreateRfqFromRequisition: 'epic-bos:procurement:create-rfq-from-requisition',
  procurementCreateSupplier: 'epic-bos:procurement:create-supplier',
  procurementDecideSupplier: 'epic-bos:procurement:decide-supplier',
  procurementCreateRfq: 'epic-bos:procurement:create-rfq',
  procurementIssueRfq: 'epic-bos:procurement:issue-rfq',
  procurementRecordQuotation: 'epic-bos:procurement:record-quotation',
  procurementAwardRfq: 'epic-bos:procurement:award-rfq',
  procurementCreatePoFromRfq: 'epic-bos:procurement:create-po-from-rfq',
  procurementCreatePoFromReorder: 'epic-bos:procurement:create-po-from-reorder',
  procurementDecidePo: 'epic-bos:procurement:decide-po',
  procurementRecordGoodsReceipt: 'epic-bos:procurement:record-goods-receipt',
  procurementCreateLandedCost: 'epic-bos:procurement:create-landed-cost',
  procurementDecideLandedCost: 'epic-bos:procurement:decide-landed-cost',
  procurementUpdateRetailPriceForTargetMargin: 'epic-bos:procurement:update-retail-price-for-target-margin',
  procurementRecordSupplierInvoice: 'epic-bos:procurement:record-supplier-invoice',
  procurementDecideThreeWayMatch: 'epic-bos:procurement:decide-three-way-match',
  treasuryRecordPosition: 'epic-bos:treasury:record-position',
  treasuryRunCashForecast: 'epic-bos:treasury:run-cash-forecast',
  treasuryCreatePaymentProposal: 'epic-bos:treasury:create-payment-proposal',
  treasuryDecidePaymentProposal: 'epic-bos:treasury:decide-payment-proposal',
  treasuryReleasePaymentProposal: 'epic-bos:treasury:release-payment-proposal',
  treasurySettlePaymentProposal: 'epic-bos:treasury:settle-payment-proposal',
  treasuryRecordBankCharge: 'epic-bos:treasury:record-bank-charge',
  treasuryReconcileBankCharge: 'epic-bos:treasury:reconcile-bank-charge',
  treasuryOpenSettlementException: 'epic-bos:treasury:open-settlement-exception',
  treasuryResolveSettlementException: 'epic-bos:treasury:resolve-settlement-exception',
  treasuryCreateLiquiditySweep: 'epic-bos:treasury:create-liquidity-sweep',
  treasuryDecideLiquiditySweep: 'epic-bos:treasury:decide-liquidity-sweep',
  treasuryReleaseLiquiditySweep: 'epic-bos:treasury:release-liquidity-sweep',
  treasurySettleLiquiditySweep: 'epic-bos:treasury:settle-liquidity-sweep',
  manufacturingCreateWorkCenter: 'epic-bos:manufacturing:create-work-center',
  manufacturingCreateBomRevision: 'epic-bos:manufacturing:create-bom-revision',
  manufacturingDecideBomRevision: 'epic-bos:manufacturing:decide-bom-revision',
  manufacturingCreateQualityPlan: 'epic-bos:manufacturing:create-quality-plan',
  manufacturingDecideQualityPlan: 'epic-bos:manufacturing:decide-quality-plan',
  manufacturingCreateWorkOrder: 'epic-bos:manufacturing:create-work-order',
  manufacturingDecideWorkOrder: 'epic-bos:manufacturing:decide-work-order',
  manufacturingStartWorkOrder: 'epic-bos:manufacturing:start-work-order',
  manufacturingIssueMaterial: 'epic-bos:manufacturing:issue-material',
  manufacturingRecordInspection: 'epic-bos:manufacturing:record-inspection',
  manufacturingResolveNonconformance: 'epic-bos:manufacturing:resolve-nonconformance',
  manufacturingRecordOutput: 'epic-bos:manufacturing:record-output',
  assetCreateCategory: 'epic-bos:asset:create-category',
  assetCreateManagedAsset: 'epic-bos:asset:create-managed-asset',
  assetSubmitManagedAsset: 'epic-bos:asset:submit-managed-asset',
  assetDecideManagedAsset: 'epic-bos:asset:decide-managed-asset',
  assetCreateCapitalization: 'epic-bos:asset:create-capitalization',
  assetDecideCapitalization: 'epic-bos:asset:decide-capitalization',
  assetCreateDepreciationPolicy: 'epic-bos:asset:create-depreciation-policy',
  assetDecideDepreciationPolicy: 'epic-bos:asset:decide-depreciation-policy',
  assetCreateDepreciationRun: 'epic-bos:asset:create-depreciation-run',
  assetDecideDepreciationRun: 'epic-bos:asset:decide-depreciation-run',
  assetCreateRetirement: 'epic-bos:asset:create-retirement',
  assetDecideRetirement: 'epic-bos:asset:decide-retirement',
  assetCompleteRetirement: 'epic-bos:asset:complete-retirement',
  assetCreateCustodyTransfer: 'epic-bos:asset:create-custody-transfer',
  assetDecideCustodyTransfer: 'epic-bos:asset:decide-custody-transfer',
  assetReceiveCustodyTransfer: 'epic-bos:asset:receive-custody-transfer',
  assetCreateComponentization: 'epic-bos:asset:create-componentization',
  assetDecideComponentization: 'epic-bos:asset:decide-componentization',
  assetCreateComponentAllocation: 'epic-bos:asset:create-component-allocation',
  assetDecideComponentAllocation: 'epic-bos:asset:decide-component-allocation',
  assetCreateTransferAccounting: 'epic-bos:asset:create-transfer-accounting',
  assetDecideTransferAccounting: 'epic-bos:asset:decide-transfer-accounting',
  assetDispatchTransferAccounting: 'epic-bos:asset:dispatch-transfer-accounting',
  assetReceiveTransferAccounting: 'epic-bos:asset:receive-transfer-accounting',
  assetCreateSaleDisposal: 'epic-bos:asset:create-sale-disposal',
  assetDecideSaleDisposal: 'epic-bos:asset:decide-sale-disposal',
  assetCompleteSaleDisposal: 'epic-bos:asset:complete-sale-disposal',
  assetRunLifecycleAction: 'epic-bos:asset:run-lifecycle-action',
  maintenanceCreatePreventivePlan: 'epic-bos:maintenance:create-preventive-plan',
  maintenanceGenerateDueWorkOrder: 'epic-bos:maintenance:generate-due-work-order',
  maintenanceStartWorkOrder: 'epic-bos:maintenance:start-work-order',
  maintenanceCompleteWorkOrder: 'epic-bos:maintenance:complete-work-order',
  maintenanceVerifyWorkOrder: 'epic-bos:maintenance:verify-work-order',
  deliveryCreateProject: 'epic-bos:delivery:create-project',
  deliveryDecideProject: 'epic-bos:delivery:decide-project',
  deliveryTransitionProject: 'epic-bos:delivery:transition-project',
  deliveryCreateTask: 'epic-bos:delivery:create-task',
  deliveryTransitionTask: 'epic-bos:delivery:transition-task',
  deliveryRecordTime: 'epic-bos:delivery:record-time',
  deliveryDecideTime: 'epic-bos:delivery:decide-time',
  deliveryCreateAgreement: 'epic-bos:delivery:create-agreement',
  deliveryDecideAgreement: 'epic-bos:delivery:decide-agreement',
  deliveryCreateTicket: 'epic-bos:delivery:create-ticket',
  deliveryTransitionTicket: 'epic-bos:delivery:transition-ticket',
  deliveryCreateFieldJob: 'epic-bos:delivery:create-field-job',
  deliveryTransitionFieldJob: 'epic-bos:delivery:transition-field-job',
  workforceCreateProfile: 'epic-bos:workforce:create-profile',
  workforceDecideProfile: 'epic-bos:workforce:decide-profile',
  workforceRecordAvailability: 'epic-bos:workforce:record-availability',
  workforceDecideAvailability: 'epic-bos:workforce:decide-availability',
  workforceCreateAllocation: 'epic-bos:workforce:create-allocation',
  workforceCancelAllocation: 'epic-bos:workforce:cancel-allocation',
  payrollCreateRegistration: 'epic-bos:payroll:create-registration',
  payrollDecideRegistration: 'epic-bos:payroll:decide-registration',
  payrollCreatePolicy: 'epic-bos:payroll:create-policy',
  payrollDecidePolicy: 'epic-bos:payroll:decide-policy',
  payrollCreateCompensation: 'epic-bos:payroll:create-compensation',
  payrollDecideCompensation: 'epic-bos:payroll:decide-compensation',
  payrollCreateBenefitPlan: 'epic-bos:payroll:create-benefit-plan',
  payrollDecideBenefitPlan: 'epic-bos:payroll:decide-benefit-plan',
  payrollCreateBenefitEnrollment: 'epic-bos:payroll:create-benefit-enrollment',
  payrollDecideBenefitEnrollment: 'epic-bos:payroll:decide-benefit-enrollment',
  payrollCreateRun: 'epic-bos:payroll:create-run',
  payrollDecideRun: 'epic-bos:payroll:decide-run',
  payrollFinalizeRun: 'epic-bos:payroll:finalize-run',
  payrollUpdateObligation: 'epic-bos:payroll:update-obligation',
  payrollCreateExpense: 'epic-bos:payroll:create-expense',
  payrollDecideExpense: 'epic-bos:payroll:decide-expense',
  payrollReimburseExpense: 'epic-bos:payroll:reimburse-expense',
  workforceRecordAttendance: 'epic-bos:workforce:record-attendance',
  workforceDecideAttendance: 'epic-bos:workforce:decide-attendance',
  workforceCreateLeaveType: 'epic-bos:workforce:create-leave-type',
  workforceDecideLeaveType: 'epic-bos:workforce:decide-leave-type',
  workforceCreateLeaveApplication: 'epic-bos:workforce:create-leave-application',
  workforceDecideLeaveApplication: 'epic-bos:workforce:decide-leave-application',
  payrollCreateAdjustment: 'epic-bos:payroll:create-adjustment',
  payrollDecideAdjustment: 'epic-bos:payroll:decide-adjustment',
  payrollCreateTaxDeclaration: 'epic-bos:payroll:create-tax-declaration',
  payrollDecideTaxDeclaration: 'epic-bos:payroll:decide-tax-declaration',
  payrollPublishPayslip: 'epic-bos:payroll:publish-payslip',
  payrollAcknowledgePayslip: 'epic-bos:payroll:acknowledge-payslip',
  financialCreateBillingPlan: 'epic-bos:financial:create-billing-plan',
  financialDecideBillingPlan: 'epic-bos:financial:decide-billing-plan',
  financialCreateBillingClaim: 'epic-bos:financial:create-billing-claim',
  financialDecideBillingClaim: 'epic-bos:financial:decide-billing-claim',
  financialConsumeEntitlement: 'epic-bos:financial:consume-entitlement',
  financialCreateClosePeriod: 'epic-bos:financial:create-close-period',
  financialDecideClosePeriod: 'epic-bos:financial:decide-close-period',
  financialReopenClosePeriod: 'epic-bos:financial:reopen-close-period',
  commercialCreateExchangeRate: 'epic-bos:commercial:create-exchange-rate',
  commercialDecideExchangeRate: 'epic-bos:commercial:decide-exchange-rate',
  commercialCreateCurrencyProfile: 'epic-bos:commercial:create-currency-profile',
  commercialDecideCurrencyProfile: 'epic-bos:commercial:decide-currency-profile',
  commercialCreateVariation: 'epic-bos:commercial:create-variation',
  commercialDecideVariation: 'epic-bos:commercial:decide-variation',
  commercialCreateRetainer: 'epic-bos:commercial:create-retainer',
  commercialDecideRetainer: 'epic-bos:commercial:decide-retainer',
  commercialCreateDrawdown: 'epic-bos:commercial:create-drawdown',
  commercialDecideDrawdown: 'epic-bos:commercial:decide-drawdown',
  commercialCreateResourcePlan: 'epic-bos:commercial:create-resource-plan',
  commercialDecideResourcePlan: 'epic-bos:commercial:decide-resource-plan',
  commercialGenerateMarginReview: 'epic-bos:commercial:generate-margin-review',
  commercialReviewMargin: 'epic-bos:commercial:review-margin',
  inventoryCreateUom: 'epic-bos:inventory:create-uom',
  inventoryCreateUomConversion: 'epic-bos:inventory:create-uom-conversion',
  inventoryCreateItem: 'epic-bos:inventory:create-item',
  inventoryCreateVariant: 'epic-bos:inventory:create-variant',
  inventoryCreateWarehouse: 'epic-bos:inventory:create-warehouse',
  inventoryCreateZone: 'epic-bos:inventory:create-zone',
  inventoryCreateBin: 'epic-bos:inventory:create-bin',
  inventoryReceive: 'epic-bos:inventory:receive',
  inventoryCreatePutaway: 'epic-bos:inventory:create-putaway',
  inventoryCreatePick: 'epic-bos:inventory:create-pick',
  inventoryTransitionTask: 'epic-bos:inventory:transition-task',
  inventoryCreateTransfer: 'epic-bos:inventory:create-transfer',
  inventoryTransitionTransfer: 'epic-bos:inventory:transition-transfer',
  inventoryCreateCycleCount: 'epic-bos:inventory:create-cycle-count',
  inventoryRecordCycleCount: 'epic-bos:inventory:record-cycle-count',
  inventoryDecideCycleCount: 'epic-bos:inventory:decide-cycle-count',
  inventoryCreateReorderPolicy: 'epic-bos:inventory:create-reorder-policy',
  inventoryGenerateReorderProposals: 'epic-bos:inventory:generate-reorder-proposals',
  inventoryDecideReorderProposal: 'epic-bos:inventory:decide-reorder-proposal',
  inventoryCreateValuationReview: 'epic-bos:inventory:create-valuation-review',
  inventoryDecideValuationReview: 'epic-bos:inventory:decide-valuation-review',
  inventoryCreateDisposition: 'epic-bos:inventory:create-disposition',
  inventoryDecideDisposition: 'epic-bos:inventory:decide-disposition',
  inventoryPostDisposition: 'epic-bos:inventory:post-disposition',
  crmSnapshot: 'epic-bos:crm:snapshot',
  crmCreateLead: 'epic-bos:crm:create-lead',
  crmMoveOpportunity: 'epic-bos:crm:move-opportunity',
  crmCompleteActivity: 'epic-bos:crm:complete-activity',
  kernelSnapshot: 'epic-bos:kernel:snapshot',
  kernelOperationalHealth: 'epic-bos:kernel:operational-health',
  kernelOutboxReplayPlan: 'epic-bos:kernel:outbox-replay-plan',
  kernelExecuteOutboxReplay: 'epic-bos:kernel:execute-outbox-replay',
  kernelResolveOutboxConflict: 'epic-bos:kernel:resolve-outbox-conflict',
  kernelUpdateTenantIdentity: 'epic-bos:kernel:update-tenant-identity',
  kernelCreateCompany: 'epic-bos:kernel:create-company',
  kernelUpdateCompany: 'epic-bos:kernel:update-company',
  kernelCreateBranch: 'epic-bos:kernel:create-branch',
  kernelUpdateBranch: 'epic-bos:kernel:update-branch',
  kernelCreateUser: 'epic-bos:kernel:create-user',
  kernelCreateRole: 'epic-bos:kernel:create-role',
  kernelUpdateRolePolicy: 'epic-bos:kernel:update-role-policy',
  kernelUpsertFieldAccessRule: 'epic-bos:kernel:upsert-field-access-rule',
  kernelUpdateApprovalPolicy: 'epic-bos:kernel:update-approval-policy',
  kernelAssignRole: 'epic-bos:kernel:assign-role',
  kernelIssueNumber: 'epic-bos:kernel:issue-number',
  kernelTransitionWorkflow: 'epic-bos:kernel:transition-workflow',
  kernelDecideApproval: 'epic-bos:kernel:decide-approval',
  kernelRegisterCustomField: 'epic-bos:kernel:register-custom-field',
} as const;
import type { StorageBridge } from './storage-contracts';
import type {
  AddAddressInput,
  AddContactPointInput,
  CreateAccountInput,
  CreateContactInput,
  CreateRelationshipInput,
  ConvertLeadInput,
  ExecuteMergeInput,
  PartySnapshot,
  RecordConsentInput,
  ResolveDuplicateInput,
} from './party-contracts';
import type {
  CommitImportInput,
  ConfigureAdapterInput,
  CreateCampaignInput,
  CreateSavedViewInput,
  CreateScoringRuleInput,
  CrmDepthSnapshot,
  RecordCommunicationInput,
  TransitionCampaignInput,
  UpdatePipelineInput,
} from './crm-depth-contracts';
import type {
  BulkAssignInput,
  CreateAssignmentRuleInput,
  CreateAudienceSegmentInput,
  CreateIndiaOpportunityInput,
  CreateQuoteInput,
  CreateCatalogProductInput,
  ImportRetailProductPackInput,
  CreateDiscountPolicyInput,
  CreateGstTaxCodeInput,
  CreatePriceListEntryInput,
  CreatePriceListInput,
  DecidePriceListApprovalInput,
  DecideQuoteApprovalInput,
  ExportQuotePdfInput,
  QuoteDocumentReceipt,
  ConvertQuoteToSalesOrderInput,
  CreateTerritoryInput,
  OpportunityCreationResult,
  RevenueOpsSnapshot,
  TransitionQuoteInput,
  TransitionSalesOrderInput,
  UpdateFulfilmentTaskInput,
  SubmitQuoteForApprovalInput,
  SubmitPriceListForApprovalInput,
  CreateCreditDebitNoteInput,
  CreateInvoiceDraftInput,
  CreatePaymentTermInput,
  CreateServiceMilestoneInput,
  ExportInvoicePdfInput,
  ExportJournalInput,
  InvoiceDocumentReceipt,
  IssueInvoiceInput,
  MatchCodBankInput,
  RecordCodCarrierCollectionInput,
  RecordCodExceptionInput,
  RecordCodHandoverInput,
  RecordCodRemittanceInput,
  RecordDeliveryEvidenceInput,
  RecordPaymentInput,
  ApplyUnappliedReceiptInput,
  ReconcilePaymentInput,
  TransitionServiceMilestoneInput,
  UpdateIndiaProfileInput,
  CloseCodShortfallInput,
  ConfigureCarrierAdapterInput,
  CreateCodCollectionCaseInput,
  CreateDeliveryPromiseInput,
  CreateGstRegistrationInput,
  CreatePincodeServiceabilityRuleInput,
  CreatePlaceOfSupplyReviewInput,
  CreateReturnAuthorizationInput,
  CreateShipmentPackageInput,
  CreateStockLocationInput,
  DecidePlaceOfSupplyReviewInput,
  DecidePincodeServiceabilityRuleInput,
  DecideReturnAuthorizationInput,
  InspectReturnInput,
  PrepareStatutoryExchangeInput,
  ReceiveReturnInput,
  RecordStatutoryResponseInput,
  RecordStockMovementInput,
  ReleaseStockReservationInput,
  ReserveStockInput,
  SubmitStatutoryExchangeInput,
  TransitionShipmentInput,
} from './revenue-ops-contracts';
import type {
  CreateRetailCounterInput,
  OpenRetailCashierShiftInput,
  CheckoutRetailSaleInput,
  RequestRetailCashierShiftCloseInput,
  DecideRetailCashierShiftCloseInput,
  RequestRetailCashierShiftVarianceResolutionInput,
  DecideRetailCashierShiftVarianceResolutionInput,
  CreateRetailReturnRequestInput,
  InspectRetailReturnInput,
  DecideRetailReturnInput,
  RequestRetailReturnSettlementInput,
  DecideRetailReturnSettlementInput,
  ConfirmRetailReturnProviderRefundInput,
} from './retail-pos-contracts';
import type {
  AssignRetailBarcodeInput,
  CreateRetailBarcodeSequenceInput,
  CreateRetailCatalogBrandInput,
  CreateRetailCatalogCategoryInput,
  CreateRetailLabelPrintRunInput,
  CreateRetailProductComboInput,
  ResetRetailBarcodeSequenceInput,
  SaveRetailMerchandisingProfileInput,
} from './retail-catalog-contracts';
import type { PeopleReadProjection } from './people-read-projection-contracts';
import type {
  CreateCycleCountInput,
  CreateInventoryDispositionInput,
  CreateInventoryItemInput,
  CreateInventoryTransferInput,
  CreateInventoryValuationReviewInput,
  CreateItemVariantInput,
  CreatePickTaskInput,
  CreatePutawayTaskInput,
  CreateReorderPolicyInput,
  CreateStorageBinInput,
  CreateUomConversionInput,
  CreateUomInput,
  CreateWarehouseInput,
  CreateWarehouseZoneInput,
  DecideCycleCountInput,
  DecideInventoryDispositionInput,
  DecideInventoryValuationReviewInput,
  DecideReorderProposalInput,
  ReceiveInventoryInput,
  PostInventoryDispositionInput,
  RecordCycleCountInput,
  TransitionInventoryTransferInput,
  TransitionWarehouseTaskInput,
} from './inventory-contracts';
import type {
  ConfigureStatutoryAdapterInput,
  ConfigureStatutoryCredentialsInput,
  PrepareConsolidatedEwayBillInput,
  PrepareStatutoryOperationInput,
  RecordConsolidatedEwayBillResponseInput,
  RecordStatutoryOperationResponseInput,
  RunPortalReconciliationInput,
  SubmitConsolidatedEwayBillInput,
  SubmitStatutoryOperationInput,
  VerifyStatutorySignatureInput,
} from './statutory-contracts';
import type {
  ApproveProviderConnectorInput,
  ConfigureProviderConnectorInput,
  ConfigureProviderCredentialsInput,
  CreateProviderConformanceCaseInput,
  PlanProviderConformancePackInput,
  HandOffProviderSubmissionInput,
  PrepareProviderSubmissionInput,
  RecordProviderConformanceResultInput,
  RecordProviderSubmissionResponseInput,
  RunProviderReconciliationInput,
} from './provider-contracts';
import type {
  CommitBankStatementInput,
  ConfirmBankMatchInput,
  CreateBankAccountInput,
  CreateWithholdingPolicyInput,
  DecideCreditLimitInput,
  DecideWriteOffInput,
  DecideZeroRatedSupplyInput,
  ExcludeBankLineInput,
  OpenReceivableDisputeInput,
  PrepareZeroRatedSupplyInput,
  PreviewBankStatementInput,
  ProposeCreditLimitInput,
  RecordCollectionActivityInput,
  RecordWithholdingEntryInput,
  RequestWriteOffInput,
  ResolveReceivableDisputeInput,
  RunDunningInput,
  TransitionWithholdingEntryInput,
} from './collections-finance-contracts';
import type {
  AwardRfqInput,
  CreateLandedCostInput,
  CreatePurchaseOrderFromReorderInput,
  CreatePurchaseOrderFromRfqInput,
  CreatePurchaseRequisitionInput,
  CreateRfqFromRequisitionInput,
  CreateRfqInput,
  CreateSupplierInput,
  DecideLandedCostInput,
  DecidePurchaseOrderInput,
  DecidePurchaseRequisitionInput,
  DecideSupplierInput,
  DecideThreeWayMatchInput,
  IssueRfqInput,
  RecordGoodsReceiptInput,
  RecordSupplierInvoiceInput,
  RecordSupplierQuotationInput,
  UpdateRetailPriceForTargetMarginInput,
} from './procurement-contracts';
import type {
  CreateLiquiditySweepInput,
  CreatePaymentProposalInput,
  DecideLiquiditySweepInput,
  DecidePaymentProposalInput,
  OpenSettlementExceptionInput,
  ReconcileBankChargeInput,
  RecordBankChargeInput,
  RecordTreasuryPositionInput,
  ReleaseLiquiditySweepInput,
  ReleasePaymentProposalInput,
  ResolveSettlementExceptionInput,
  RunCashForecastInput,
  SettleLiquiditySweepInput,
  SettlePaymentProposalInput,
} from './treasury-contracts';
import type {
  CreateBomRevisionInput,
  CreateQualityPlanInput,
  CreateWorkCenterInput,
  CreateWorkOrderInput,
  DecideBomRevisionInput,
  DecideQualityPlanInput,
  DecideWorkOrderInput,
  IssueWorkOrderMaterialInput,
  RecordProductionOutputInput,
  RecordQualityInspectionInput,
  ResolveNonconformanceInput,
  StartWorkOrderInput,
} from './manufacturing-contracts';
import type {
  CompleteMaintenanceWorkOrderInput,
  CreateAssetCapitalizationInput,
  CreateAssetDepreciationPolicyInput,
  CreateAssetDepreciationRunInput,
  CreateAssetRetirementInput,
  CreateAssetCustodyTransferInput,
  CreateAssetCategoryInput,
  CreateManagedAssetInput,
  CreatePreventiveMaintenancePlanInput,
  DecideManagedAssetInput,
  DecideAssetCapitalizationInput,
  DecideAssetDepreciationPolicyInput,
  DecideAssetDepreciationRunInput,
  DecideAssetRetirementInput,
  DecideAssetCustodyTransferInput,
  CompleteAssetRetirementInput,
  ReceiveAssetCustodyTransferInput,
  CreateAssetComponentizationInput,
  DecideAssetComponentizationInput,
  CreateAssetComponentAllocationInput,
  DecideAssetComponentAllocationInput,
  CreateAssetTransferAccountingInput,
  DecideAssetTransferAccountingInput,
  DispatchAssetTransferAccountingInput,
  ReceiveAssetTransferAccountingInput,
  CreateAssetSaleDisposalInput,
  DecideAssetSaleDisposalInput,
  CompleteAssetSaleDisposalInput,
  AssetLifecycleActionInput,
  GenerateDueMaintenanceWorkOrderInput,
  StartMaintenanceWorkOrderInput,
  SubmitManagedAssetInput,
  VerifyMaintenanceWorkOrderInput,
} from './assets-maintenance-contracts';
import type {
  CreateFieldServiceJobInput,
  CreateProjectInput,
  CreateProjectTaskInput,
  CreateServiceAgreementInput,
  CreateSupportTicketInput,
  DecideProjectInput,
  DecideServiceAgreementInput,
  DecideTimeEntryInput,
  RecordTimeEntryInput,
  TransitionFieldServiceJobInput,
  TransitionProjectInput,
  TransitionProjectTaskInput,
  TransitionSupportTicketInput,
} from './delivery-contracts';
import type {
  CancelWorkforceAllocationInput,
  CreateWorkforceAllocationInput,
  CreateWorkforceProfileInput,
  DecideWorkforceAvailabilityInput,
  DecideWorkforceProfileInput,
  RecordWorkforceAvailabilityInput,
} from './workforce-contracts';
import type {
  ConsumeServiceEntitlementInput,
  CreateAccountingClosePeriodInput,
  CreateProjectBillingClaimInput,
  CreateProjectBillingPlanInput,
  DecideAccountingClosePeriodInput,
  DecideProjectBillingClaimInput,
  DecideProjectBillingPlanInput,
  ReopenAccountingClosePeriodInput,
} from './financial-close-contracts';
import type {
  BindLedgerCompanyInput,
  CancelLedgerJournalInput,
  CreateLedgerJournalInput,
  GeneralLedgerSnapshot,
  PostLedgerJournalInput,
  PrepareRevenueInvoicePostingInput,
  PrepareCashReceiptPostingInput,
  PrepareWriteOffPostingInput,
  PrepareWithholdingPostingInput,
  PrepareTreasuryPostingInput,
  PrepareManufacturingPostingInput,
  PrepareLandedCostPostingInput,
  PrepareRetailSaleCostPostingInput,
  PrepareRetailReturnCostPostingInput,
  PrepareRetailCommerceSettlementPostingInput,
  PrepareRetailCommissionPayoutPostingInput,
  PreparePeoplePostingInput,
  PrepareCommercialAdjustmentPostingInput,
  PrepareSupplierInvoicePostingInput,
  PrepareAssetCapitalizationPostingInput,
  PrepareAssetDepreciationPostingInput,
  PrepareAssetRetirementPostingInput,
  PrepareAssetSaleDisposalPostingInput,
  PrepareAssetLifecyclePostingInput,
  PrepareProjectRevenueRecognitionPostingInput,
  ReverseLedgerJournalInput,
} from './general-ledger-contracts';
import type { FinanceCompletionSnapshot } from '../domain/finance-completion';
import type {
  CreateProjectContractVariationInput,
  CreateProjectCurrencyProfileInput,
  CreateProjectExchangeRateInput,
  CreateProjectResourcePlanInput,
  CreateProjectRetainerInput,
  CreateRetainerDrawdownInput,
  DecideProjectContractVariationInput,
  DecideProjectCurrencyProfileInput,
  DecideProjectExchangeRateInput,
  DecideProjectResourcePlanInput,
  DecideProjectRetainerInput,
  DecideRetainerDrawdownInput,
  GenerateProjectMarginReviewInput,
  ReviewProjectMarginInput,
} from './project-commercial-contracts';
import type {
  CreateBenefitEnrollmentInput,
  CreateBenefitPlanInput,
  CreateEmployerRegistrationInput,
  CreateExpenseClaimInput,
  CreatePayrollCompensationInput,
  CreatePayrollPolicyInput,
  CreatePayrollRunInput,
  DecideBenefitEnrollmentInput,
  DecideBenefitPlanInput,
  DecideEmployerRegistrationInput,
  DecideExpenseClaimInput,
  DecidePayrollCompensationInput,
  DecidePayrollPolicyInput,
  DecidePayrollRunInput,
  FinalizePayrollRunInput,
  ReimburseExpenseClaimInput,
  UpdatePayrollObligationInput,
  AcknowledgePayslipInput,
  CreateLeaveApplicationInput,
  CreateLeaveTypeInput,
  CreatePayrollAdjustmentInput,
  CreateTaxDeclarationInput,
  DecideAttendanceInput,
  DecideLeaveApplicationInput,
  DecideLeaveTypeInput,
  DecidePayrollAdjustmentInput,
  DecideTaxDeclarationInput,
  PublishPayslipInput,
  RecordAttendanceInput,
} from './payroll-contracts';

export interface LeadConversionResult {
  crm: DashboardSnapshot;
  party: PartySnapshot;
}

export interface ImportCommitResult {
  crm: DashboardSnapshot;
  depth: CrmDepthSnapshot;
}
import type {
  AuthStatus,
  BootstrapOwnerInput,
  ChangePasswordInput,
  LoginInput,
} from './auth-contracts';
import type {
  AssignRoleInput,
  CreateBranchInput,
  CreateCompanyInput,
  CreateRoleInput,
  CreateUserInput,
  DecideApprovalInput,
  IssueNumberInput,
  IssueNumberResult,
  KernelSnapshot,
  OperationalHealthSnapshot,
  OutboxReplayPlan,
  ExecuteOutboxReplayInput,
  ResolveOutboxConflictInput,
  RegisterCustomFieldInput,
  TransitionWorkflowInput,
  UpdateApprovalPolicyInput,
  UpdateBranchInput,
  UpdateCompanyInput,
  UpdateRolePolicyInput,
  UpdateTenantIdentityInput,
  UpsertFieldAccessRuleInput,
} from './kernel-contracts';
import type { ApiKeyRecord, GovernedExportReceipt, IssueApiKeyInput, IssuedApiKey, RevokeApiKeyInput } from './integration-contracts';
import type { ProviderCertificationExportReceipt, ProviderCertificationHandoff } from './provider-certification-contract';
import type { BuildProvenance, ReleaseGateEvidence, ReleaseReadiness, ReleaseReadinessReport, SupportDiagnostics } from './release-control-contracts';
