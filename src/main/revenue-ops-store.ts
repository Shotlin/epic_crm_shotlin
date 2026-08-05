import { createHash, randomUUID } from 'node:crypto';
import {
  bulkAssignOpportunities,
  createAssignmentRule,
  createAudienceSegment,
  createCleanRevenueOpsState,
  createInitialRevenueOpsState,
  createQuote,
  createTerritory,
  getRevenueOpsSnapshot,
  registerIndiaOpportunity,
  resolveOpportunityAssignment,
  transitionQuote,
  updateIndiaProfile,
} from '../domain/revenue-ops';
import { createPeopleReadProjection } from '../domain/people-read-projection';
import { createDeliveryReadProjection } from '../domain/delivery-read-projection';
import { createFinanceReadProjection } from '../domain/finance-read-projection';
import { createSupplyChainReadProjection } from '../domain/supply-chain-read-projection';
import { createStatutoryProviderReadProjection } from '../domain/statutory-provider-read-projection';
import { createManufacturingReadProjection } from '../domain/manufacturing-read-projection';
import { createAssetMaintenanceReadProjection } from '../domain/asset-maintenance-read-projection';
import { createProjectFinanceReadProjection } from '../domain/project-finance-read-projection';
import { createSalesReadProjection } from '../domain/sales-read-projection';
import {
  applyDeliveryReadProjectionToSnapshot,
  applyFinanceReadProjectionToSnapshot,
  applySupplyChainReadProjectionToSnapshot,
  applyStatutoryProviderReadProjectionToSnapshot,
  applyManufacturingReadProjectionToSnapshot,
  applyAssetMaintenanceReadProjectionToSnapshot,
  applyProjectFinanceReadProjectionToSnapshot,
  applyPeopleReadProjectionToSnapshot,
  applySalesReadProjectionToSnapshot,
  normalizeRevenueOpsResponse,
} from './revenue-ops-response-normalizer';
import {
  convertQuoteToSalesOrder,
  createCatalogProduct,
  createDiscountPolicy,
  createGstTaxCode,
  createPriceList,
  createPriceListEntry,
  decidePriceListApproval,
  decideQuoteApproval,
  recordQuoteDocument,
  submitQuoteForApproval,
  submitPriceListForApproval,
  transitionSalesOrder,
  updateFulfilmentTask,
} from '../domain/commercial';
import { validateRetailProductImport } from '../domain/retail-product-import';
import { executeRetailProductImport, prepareRetailProductImport } from '../domain/retail-product-import-execution';
import {
  applyUnappliedReceipt,
  createCreditDebitNote,
  createInvoiceDraft,
  createPaymentTerm,
  createServiceMilestone,
  exportJournal,
  issueInvoice,
  reconcilePayment,
  recordDeliveryEvidence,
  recordInvoiceDocument,
  recordPayment,
  transitionServiceMilestone,
} from '../domain/order-to-cash';
import {
  configureCarrierAdapter,
  createGstRegistration,
  createPlaceOfSupplyReview,
  createReturnAuthorization,
  createShipmentPackage,
  createStockLocation,
  decidePlaceOfSupplyReview,
  decideReturnAuthorization,
  inspectReturn,
  prepareStatutoryExchange,
  receiveReturn,
  recordStatutoryResponse,
  recordStockMovement,
  releaseStockReservation,
  reserveStock,
  submitStatutoryExchange,
  transitionShipment,
} from '../domain/fulfilment-control';
import { advanceRetailCutover, createRetailCutoverPlan, createRetailCutoverPlanFromHubAssessment } from '../domain/retail-cutover';
import {
  createDeliveryPromise,
  createPincodeServiceabilityRule,
  decidePincodeServiceabilityRule,
  freezeDeliveryAddress,
} from '../domain/pincode-serviceability';
import {
  closeCodShortfall,
  createCodCollectionCase,
  matchCodBank,
  recordCodCarrierCollection,
  recordCodException,
  recordCodHandover,
  recordCodRemittance,
} from '../domain/cod-custody';
import {
  createCycleCount,
  createInventoryItem,
  createInventoryDisposition,
  createInventoryTransfer,
  createInventoryValuationReview,
  createItemVariant,
  createPickTask,
  createPutawayTask,
  createReorderPolicy,
  createStorageBin,
  createUom,
  createUomConversion,
  createWarehouse,
  createWarehouseZone,
  decideCycleCount,
  decideInventoryValuationReview,
  decideInventoryDisposition,
  decideReorderProposal,
  generateReorderProposals,
  issuePickedInventory,
  receiveInventory,
  postInventoryDisposition,
  recordCycleCount,
  transitionInventoryTransfer,
  transitionWarehouseTask,
} from '../domain/inventory-warehouse';
import {
  checkoutRetailSale,
  createRetailCounter,
  decideRetailCashierShiftClose,
  decideRetailCashierShiftVarianceResolution,
  openRetailCashierShift,
  requestRetailCashierShiftClose,
  requestRetailCashierShiftVarianceResolution,
} from '../domain/retail-pos';
import { enqueueRetailOfflineSale, resolveRetailOfflineSale, syncRetailOfflineQueue, syncRetailOfflineSale } from '../domain/retail-offline-sync';
import { completeRetailUnifiedOrderPickTasks, completeRetailUnifiedOrderShipmentPackage, confirmRetailUnifiedOrderDelivery, createRetailUnifiedOrderPickTasks, createRetailUnifiedOrderShipmentPackage, decideRetailOrderFulfilmentHandoff, dispatchRetailUnifiedOrder, ingestRetailOrderSourceEvent, prepareRetailOrderForGovernedHandoff, prepareRetailOrderFulfilmentHandoff, prepareRetailOrderHubHandoff, prepareRetailUnifiedOrderDispatch, recordRetailOrderHubHandoffResult, recordRetailUnifiedOrderCarrierCallback, reconcileRetailUnifiedOrderReturn, reconcileRetailUnifiedOrderRto, reserveRetailUnifiedOrderStock } from '../domain/retail-unified-order-ingestion';
import { prepareRetailDeviceTransport, recordNetworkExecutedRetailDeviceTransport, recordRetailDeviceTransport, recordRetailNativeDeviceDriverResult, retryRetailDeviceTransport } from '../domain/retail-device-transport';
import { activateRetailDeviceAdapterProfile, approveRetailDeviceAdapterProfile, assertRetailDeviceProfileNetworkEndpoint, createRetailDeviceAdapterProfile, recordRetailDeviceAdapterAcknowledgement, suspendRetailDeviceAdapterProfile } from '../domain/retail-device-profile';
import { preflightRetailDeviceTransport } from './retail-device-preflight';
import { createRetailExchange, decideRetailExchange } from '../domain/retail-exchange';
import { createRetailLoyaltyAccount, redeemRetailLoyaltyPoints } from '../domain/retail-loyalty-promotions';
import { createRetailCommissionPayoutBatch, createRetailCustomerVisit, createRetailSalesCommission, decideRetailCommissionPayoutBatch, decideRetailSalesCommission, linkRetailCustomerVisitToSale, payRetailSalesCommission, releaseRetailCommissionPayoutBatch } from '../domain/retail-customer-ops';
import { prepareRetailCreditNoteReconciliation, recordRetailCreditNotePortalResponse } from '../domain/retail-credit-note';
import { createRetailInterBranchTransfer, decideRetailInterBranchTransfer, dispatchRetailInterBranchTransfer, receiveRetailInterBranchTransfer } from '../domain/retail-interbranch';
import { applyRetailCatalogBulkEdit, createRetailLabelPrintDispatch, createRetailPrinterAdapter, createRetailScaleProfile, decideRetailLabelPrintDispatch, prepareRetailCatalogBulkEdit, testRetailPrinterAdapter } from '../domain/retail-catalog-operations';
import { configureRetailCommerceCredentials, convertRetailPurchaseOcr, createRetailCommerceConnector, createRetailCommerceSyncRun, createRetailPurchaseOcrDocument, createRetailSettlementReconciliation, decideRetailPurchaseOcr, decideRetailSettlementReconciliation, handoffRetailCommerceOrder, importRetailCommerceOrder, recordRetailCommerceRemoteStatus, recordRetailCommerceSync } from '../domain/retail-commerce';
import { applyRetailPurchaseOcrMapping, configureRetailOcrProvider, createRetailCommerceConformanceCase, createRetailOcrProviderProfile, decideRetailCommercePushBatch, linkRetailCommerceReturn, planRetailCommerceConformancePack, prepareRetailCommercePushBatch, prepareRetailPurchaseOcrMapping, prepareRetailSettlementJournal, recordRetailCommerceConformance, reserveRetailCommerceOrder, resolveRetailPurchaseException, scanRetailPurchaseExceptions, testRetailOcrProvider, transitionRetailCommerceOrder } from '../domain/retail-commerce-advanced';
import { createRetailCommerceCatalogMapping, decideRetailCommerceCatalogMapping, disableRetailCommerceCatalogMapping } from '../domain/retail-commerce-mapping';
import { createRetailSettlementAllocationPack, decideRetailSettlementAllocationPack, proposeRetailSettlementAllocations } from '../domain/retail-settlement-allocation';
import { createRetailCommerceConflictResolution, decideRetailCommerceConflictResolution } from '../domain/retail-commerce-conflicts';
import { createRetailSettlementWithholdingEvidence, decideRetailSettlementWithholdingEvidence } from '../domain/retail-settlement-withholding';
import {
  confirmRetailReturnProviderRefund,
  createRetailReturnRequest,
  decideRetailReturnSettlement,
  decideRetailReturn,
  inspectRetailReturn,
  requestRetailReturnSettlement,
} from '../domain/retail-returns';
import {
  assignRetailBarcode,
  createRetailBarcodeSequence,
  createRetailCatalogBrand,
  createRetailCatalogCategory,
  createRetailLabelPrintRun,
  createRetailProductCombo,
  resetRetailBarcodeSequence,
  saveRetailMerchandisingProfile,
} from '../domain/retail-catalog';
import {
  applyPortalReconciliation,
  configureStatutoryAdapter,
  markStatutoryCredentials,
  prepareConsolidatedEwayBill,
  prepareStatutoryOperation,
  recordConsolidatedEwayBillResponse,
  recordDigitalSignatureEvidence,
  recordStatutoryOperationResponse,
  submitConsolidatedEwayBill,
  submitStatutoryOperation,
} from '../domain/statutory-control';
import {
  applyProviderReconciliation,
  approveProviderConnector,
  configureProviderConnector,
  createProviderConformanceCase,
  handOffProviderSubmission,
  markProviderCredentials,
  planProviderConformancePack,
  prepareProviderSubmission,
  recordProviderConformanceResult,
  recordProviderSubmissionResponse,
} from '../domain/provider-control';
import type { ProviderMessagingSourceContext } from '../domain/provider-control';
import {
  commitBankStatement,
  confirmBankMatch,
  createBankAccount,
  createWithholdingPolicy,
  decideCreditLimit,
  decideWriteOff,
  decideZeroRatedSupply,
  excludeBankLine,
  openReceivableDispute,
  prepareZeroRatedSupply,
  previewBankStatement,
  proposeCreditLimit,
  recordCollectionActivity,
  recordWithholdingEntry,
  requestWriteOff,
  resolveReceivableDispute,
  runDunning,
  transitionWithholdingEntry,
} from '../domain/collections-finance';
import {
  awardRfq,
  createLandedCost,
  createPurchaseOrderFromReorder,
  createPurchaseOrderFromRfq,
  createPurchaseRequisition,
  createRfq,
  createRfqFromRequisition,
  createSupplier,
  decideLandedCost,
  decidePurchaseOrder,
  decidePurchaseRequisition,
  decideSupplier,
  decideThreeWayMatch,
  issueRfq,
  recordGoodsReceipt,
  recordSupplierInvoice,
  recordSupplierQuotation,
  updateRetailPriceForTargetMargin,
} from '../domain/procurement';
import {
  createLiquiditySweep,
  createPaymentProposal,
  decideLiquiditySweep,
  decidePaymentProposal,
  openSettlementException,
  reconcileBankCharge,
  recordBankCharge,
  recordTreasuryPosition,
  releaseLiquiditySweep,
  releasePaymentProposal,
  resolveSettlementException,
  runCashForecast,
  settleLiquiditySweep,
  settlePaymentProposal,
} from '../domain/treasury';
import {
  createBomRevision,
  createQualityPlan,
  createWorkCenter,
  createWorkOrder,
  decideBomRevision,
  decideQualityPlan,
  decideWorkOrder,
  issueWorkOrderMaterial,
  recordProductionOutput,
  recordQualityInspection,
  resolveNonconformance,
  startWorkOrder,
} from '../domain/manufacturing';
import {
  completeMaintenanceWorkOrder,
  createAssetCapitalization,
  createAssetDepreciationPolicy,
  createAssetDepreciationRun,
  createAssetRetirement,
  createAssetCustodyTransfer,
  createAssetComponentization,
  createAssetComponentAllocation,
  completeAssetRetirement,
  createAssetCategory,
  createManagedAsset,
  createPreventiveMaintenancePlan,
  decideManagedAsset,
  decideAssetCapitalization,
  decideAssetDepreciationPolicy,
  decideAssetDepreciationRun,
  decideAssetRetirement,
  decideAssetCustodyTransfer,
  decideAssetComponentization,
  decideAssetComponentAllocation,
  createAssetTransferAccounting,
  decideAssetTransferAccounting,
  dispatchAssetTransferAccounting,
  receiveAssetTransferAccounting,
  createAssetSaleDisposal,
  decideAssetSaleDisposal,
  completeAssetSaleDisposal,
  createAssetImpairmentReview,
  decideAssetImpairmentReview,
  completeAssetImpairmentReview,
  createAssetRevaluation,
  decideAssetRevaluation,
  completeAssetRevaluation,
  createAssetWarranty,
  updateAssetWarrantyStatus,
  createAssetAmcContract,
  decideAssetAmcContract,
  updateAssetAmcStatus,
  createAssetMeter,
  recordAssetMeterReading,
  createCorrectiveMaintenanceRequest,
  transitionCorrectiveMaintenance,
  createAssetCalibration,
  decideAssetCalibration,
  createAssetSparePart,
  issueAssetSpare,
  createFleetVehicle,
  updateFleetVehicle,
  createFleetTrip,
  completeFleetTrip,
  generateDueMaintenanceWorkOrder,
  startMaintenanceWorkOrder,
  submitManagedAsset,
  receiveAssetCustodyTransfer,
  verifyMaintenanceWorkOrder,
} from '../domain/assets-maintenance';
import {
  createFieldServiceJob,
  createProject,
  createProjectTask,
  createServiceAgreement,
  createSupportTicket,
  decideProject,
  decideServiceAgreement,
  decideTimeEntry,
  recordTimeEntry,
  transitionFieldServiceJob,
  transitionProject,
  transitionProjectTask,
  transitionSupportTicket,
} from '../domain/delivery';
import {
  cancelWorkforceAllocation,
  createWorkforceAllocation,
  createWorkforceProfile,
  decideWorkforceAvailability,
  decideWorkforceProfile,
  recordWorkforceAvailability,
  workforceCapacityProfiles,
} from '../domain/workforce';
import {
  consumeServiceEntitlement,
  createAccountingClosePeriod,
  createProjectBillingClaim,
  createProjectBillingPlan,
  decideAccountingClosePeriod,
  decideProjectBillingClaim,
  decideProjectBillingPlan,
  reopenAccountingClosePeriod,
} from '../domain/financial-close';
import {
  createProjectContractVariation,
  createProjectCurrencyProfile,
  createProjectExchangeRate,
  createProjectResourcePlan,
  createProjectRetainer,
  createRetainerDrawdown,
  decideProjectContractVariation,
  decideProjectCurrencyProfile,
  decideProjectExchangeRate,
  decideProjectResourcePlan,
  decideProjectRetainer,
  decideRetainerDrawdown,
  generateProjectMarginReview,
  reviewProjectMargin,
} from '../domain/project-commercial';
import {
  createBenefitEnrollment,
  createBenefitPlan,
  createEmployerRegistration,
  createExpenseClaim,
  createPayrollCompensation,
  createPayrollPolicy,
  createPayrollRun,
  decideBenefitEnrollment,
  decideBenefitPlan,
  decideEmployerRegistration,
  decideExpenseClaim,
  decidePayrollCompensation,
  decidePayrollPolicy,
  decidePayrollRun,
  finalizePayrollRun,
  reimburseExpenseClaim,
  updatePayrollObligation,
} from '../domain/payroll';
import {
  acknowledgePayslip,
  createLeaveApplication,
  createLeaveType,
  createPayrollAdjustment,
  createTaxDeclaration,
  decideAttendance,
  decideLeaveApplication,
  decideLeaveType,
  decidePayrollAdjustment,
  decideTaxDeclaration,
  publishPayslip,
  recordAttendance,
} from '../domain/workforce-ledger';
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
} from '../shared/inventory-contracts';
import type {
  CheckoutRetailSaleInput,
  ConfirmRetailReturnProviderRefundInput,
  CreateRetailCounterInput,
  CreateRetailReturnRequestInput,
  DecideRetailCashierShiftCloseInput,
  DecideRetailCashierShiftVarianceResolutionInput,
  DecideRetailReturnInput,
  DecideRetailReturnSettlementInput,
  InspectRetailReturnInput,
  OpenRetailCashierShiftInput,
  RequestRetailCashierShiftCloseInput,
  RequestRetailCashierShiftVarianceResolutionInput,
  RequestRetailReturnSettlementInput,
} from '../shared/retail-pos-contracts';
import type { ResolveRetailOfflineSaleInput, SyncRetailOfflineQueueInput, SyncRetailOfflineSaleInput } from '../shared/retail-offline-sync-contracts';
import type { CompleteRetailUnifiedOrderPickTasksInput, CompleteRetailUnifiedOrderShipmentPackageInput, ConfirmRetailUnifiedOrderDeliveryInput, CreateRetailUnifiedOrderPickTasksInput, CreateRetailUnifiedOrderShipmentPackageInput, DecideRetailOrderFulfilmentHandoffInput, DispatchRetailUnifiedOrderInput, IngestRetailOrderSourceEventInput, PrepareRetailOrderFulfilmentHandoffInput, PrepareRetailOrderGovernedHandoffInput, PrepareRetailOrderHubHandoffInput, PrepareRetailUnifiedOrderDispatchInput, RecordRetailUnifiedOrderCarrierCallbackInput, ReconcileRetailUnifiedOrderReturnInput, ReconcileRetailUnifiedOrderRtoInput, RecordRetailOrderHubHandoffResultInput, ReserveRetailUnifiedOrderStockInput } from '../shared/retail-unified-order-contracts';
import type { ExecuteRetailDeviceTransportInput, PrepareRetailDeviceTransportInput, PreflightRetailDeviceTransportInput, RecordRetailDevicePreflightEvidenceInput, RecordRetailDeviceTransportInput, RecordRetailNativeDeviceDriverResultInput, RetryRetailDeviceTransportInput, RetailDeviceTransportPreflightResult } from '../shared/retail-device-transport-contracts';
import type { ActivateRetailDeviceAdapterProfileInput, ApproveRetailDeviceAdapterProfileInput, CreateRetailDeviceAdapterProfileInput, RecordRetailDeviceAdapterAcknowledgementInput, SuspendRetailDeviceAdapterProfileInput } from '../shared/retail-device-profile-contracts';
import type { CreateRetailExchangeInput, DecideRetailExchangeInput } from '../shared/retail-exchange-contracts';
import type { CreateRetailLoyaltyAccountInput, RedeemRetailLoyaltyPointsInput } from '../shared/retail-loyalty-contracts';
import type { CreateRetailCommissionPayoutBatchInput, CreateRetailCustomerVisitInput, CreateRetailSalesCommissionInput, DecideRetailCommissionPayoutBatchInput, DecideRetailSalesCommissionInput, LinkRetailCustomerVisitInput, PayRetailSalesCommissionInput, ReleaseRetailCommissionPayoutBatchInput } from '../shared/retail-customer-ops-contracts';
import type { PrepareRetailCreditNoteReconciliationInput, RecordRetailCreditNotePortalResponseInput } from '../shared/retail-credit-note-contracts';
import type { CreateRetailInterBranchTransferInput, DecideRetailInterBranchTransferInput, DispatchRetailInterBranchTransferInput, ReceiveRetailInterBranchTransferInput } from '../shared/retail-interbranch-contracts';
import type { ApplyRetailCatalogBulkEditInput, CreateRetailLabelPrintDispatchInput, CreateRetailPrinterAdapterInput, CreateRetailScaleProfileInput, DecideRetailLabelPrintDispatchInput, PrepareRetailCatalogBulkEditInput, TestRetailPrinterAdapterInput } from '../shared/retail-catalog-operations-contracts';
import type {
  AssignRetailBarcodeInput,
  CreateRetailBarcodeSequenceInput,
  CreateRetailCatalogBrandInput,
  CreateRetailCatalogCategoryInput,
  CreateRetailLabelPrintRunInput,
  CreateRetailProductComboInput,
  ResetRetailBarcodeSequenceInput,
  RetailMerchandisingImageDescriptor,
  SaveRetailMerchandisingProfileInput,
} from '../shared/retail-catalog-contracts';
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
  ConvertQuoteToSalesOrderInput,
  AccountingJournalDraft,
  QuoteDocumentReceipt,
  CreateTerritoryInput,
  OpportunityCreationResult,
  RevenueOpsContext,
  RevenueOpsSnapshot,
  RevenueOpsState,
  TransitionQuoteInput,
  TransitionSalesOrderInput,
  UpdateFulfilmentTaskInput,
  SubmitQuoteForApprovalInput,
  SubmitPriceListForApprovalInput,
  CreateCreditDebitNoteInput,
  CreateInvoiceDraftInput,
  CreatePaymentTermInput,
  CreateServiceMilestoneInput,
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
  ReconcilePaymentInput,
  TransitionServiceMilestoneInput,
  UpdateIndiaProfileInput,
  ApplyUnappliedReceiptInput,
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
} from '../shared/revenue-ops-contracts';
import type { AdvanceRetailCutoverInput, CreateRetailCutoverPlanFromAssessmentInput, CreateRetailCutoverPlanInput, RetailCutoverPlan } from '../shared/retail-cutover-contracts';
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
} from '../shared/payroll-contracts';
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
} from '../shared/statutory-contracts';
import type {
  ApproveProviderConnectorInput,
  ConfigureProviderConnectorInput,
  ConfigureProviderCredentialsInput,
  CreateProviderConformanceCaseInput,
  ExecuteProviderPreflightInput,
  PlanProviderConformancePackInput,
  HandOffProviderSubmissionInput,
  PrepareProviderSubmissionInput,
  RecordProviderConformanceResultInput,
  RecordProviderSubmissionResponseInput,
  RunProviderReconciliationInput,
} from '../shared/provider-contracts';
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
} from '../shared/collections-finance-contracts';
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
} from '../shared/procurement-contracts';
import type {
  ApplyRetailPurchaseOcrMappingInput,
  ConfigureRetailOcrProviderInput,
  ConfigureRetailCommerceCredentialsInput,
  ConvertRetailPurchaseOcrInput,
  CreateRetailCommerceConformanceCaseInput,
  PlanRetailCommerceConformancePackInput,
  CreateRetailCommerceCatalogMappingInput,
  DecideRetailCommerceCatalogMappingInput,
  CreateRetailCommerceConnectorInput,
  CreateRetailSettlementAllocationPackInput,
  CreateRetailCommerceConflictResolutionInput,
  CreateRetailSettlementWithholdingEvidenceInput,
  CreateRetailCommerceSyncInput,
  ExecuteRetailCommerceSyncInput,
  ExecuteRetailOcrInput,
  CreateRetailOcrProviderProfileInput,
  CreateRetailPurchaseOcrInput,
  CreateRetailSettlementReconciliationInput,
  DecideRetailCommercePushInput,
  ExecuteRetailCommercePushInput,
  DisableRetailCommerceCatalogMappingInput,
  DecideRetailPurchaseOcrInput,
  DecideRetailSettlementReconciliationInput,
  DecideRetailSettlementAllocationPackInput,
  DecideRetailCommerceConflictResolutionInput,
  DecideRetailSettlementWithholdingEvidenceInput,
  ImportRetailCommerceOrderInput,
  HandoffRetailCommerceOrderInput,
  ReserveRetailCommerceOrderInput,
  LinkRetailCommerceReturnInput,
  PrepareRetailCommercePushInput,
  PrepareRetailPurchaseOcrMappingInput,
  RecordRetailCommerceConformanceInput,
  RecordRetailCommerceSyncInput,
  PrepareRetailSettlementJournalInput,
  ResolveRetailPurchaseExceptionInput,
  ScanRetailPurchaseExceptionsInput,
  TestRetailOcrProviderInput,
  TransitionRetailCommerceOrderInput,
} from '../shared/retail-commerce-contracts';
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
} from '../shared/treasury-contracts';
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
} from '../shared/manufacturing-contracts';
import type {
  CompleteMaintenanceWorkOrderInput,
  CreateAssetCapitalizationInput,
  CreateAssetDepreciationPolicyInput,
  CreateAssetDepreciationRunInput,
  CreateAssetRetirementInput,
  CreateAssetCustodyTransferInput,
  CreateAssetComponentizationInput,
  CreateAssetComponentAllocationInput,
  CompleteAssetRetirementInput,
  CreateAssetCategoryInput,
  CreateManagedAssetInput,
  CreatePreventiveMaintenancePlanInput,
  DecideManagedAssetInput,
  DecideAssetCapitalizationInput,
  DecideAssetDepreciationPolicyInput,
  DecideAssetDepreciationRunInput,
  DecideAssetRetirementInput,
  DecideAssetCustodyTransferInput,
  DecideAssetComponentizationInput,
  DecideAssetComponentAllocationInput,
  CreateAssetTransferAccountingInput,
  DecideAssetTransferAccountingInput,
  DispatchAssetTransferAccountingInput,
  ReceiveAssetTransferAccountingInput,
  CreateAssetSaleDisposalInput,
  DecideAssetSaleDisposalInput,
  CompleteAssetSaleDisposalInput,
  AssetBookValue,
  ReceiveAssetCustodyTransferInput,
  GenerateDueMaintenanceWorkOrderInput,
  StartMaintenanceWorkOrderInput,
  SubmitManagedAssetInput,
  VerifyMaintenanceWorkOrderInput,
  AssetLifecycleActionInput,
} from '../shared/assets-maintenance-contracts';
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
} from '../shared/delivery-contracts';
import type {
  CancelWorkforceAllocationInput,
  CreateWorkforceAllocationInput,
  CreateWorkforceProfileInput,
  DecideWorkforceAvailabilityInput,
  DecideWorkforceProfileInput,
  RecordWorkforceAvailabilityInput,
} from '../shared/workforce-contracts';
import type {
  ConsumeServiceEntitlementInput,
  CreateAccountingClosePeriodInput,
  CreateProjectBillingClaimInput,
  CreateProjectBillingPlanInput,
  DecideAccountingClosePeriodInput,
  DecideProjectBillingClaimInput,
  DecideProjectBillingPlanInput,
  ReopenAccountingClosePeriodInput,
} from '../shared/financial-close-contracts';
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
} from '../shared/project-commercial-contracts';
import type { BusinessDatabase } from './database';
import type { CrmDepthStore } from './crm-depth-store';
import type { CrmStore } from './crm-store';
import type { KernelStore } from './kernel-store';
import type { PartyStore } from './party-store';
import type { StatutoryGatewayService } from './statutory-gateway-service';
import type { ProviderGatewayService } from './provider-gateway-service';
import { normalizeRetailCommercePushResponse, normalizeRetailCommerceResponse } from './retail-commerce-gateway';
import { normalizeRetailOcrResponse } from './retail-ocr-gateway';
import type { PeopleReadProjection } from '../shared/people-read-projection-contracts';

type RevenueOperationsScope = { companyId: string; branchId: string };

function isRevenueOperationsScope(value: unknown): value is RevenueOperationsScope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RevenueOperationsScope>;
  return typeof candidate.companyId === 'string' && candidate.companyId.length > 0 &&
    typeof candidate.branchId === 'string' && candidate.branchId.length > 0;
}

function withOperatingRecordScopes(state: RevenueOpsState): RevenueOpsState {
  const scoped = <T extends { scope?: RevenueOperationsScope }>(record: T): T =>
    isRevenueOperationsScope(record.scope)
      ? record
      : { ...record, scope: structuredClone(state.scope) };

  return {
    ...state,
    quotes: state.quotes.map(scoped),
    taxCodes: state.taxCodes.map(scoped),
    products: state.products.map(scoped),
    priceLists: state.priceLists.map(scoped),
    priceListEntries: state.priceListEntries.map(scoped),
    priceListApprovalRequests: state.priceListApprovalRequests.map(scoped),
    discountPolicies: state.discountPolicies.map((policy) => isRevenueOperationsScope(policy.operatingScope)
      ? policy
      : { ...policy, operatingScope: structuredClone(state.scope) }),
    quoteApprovalRequests: state.quoteApprovalRequests.map(scoped),
    salesOrders: state.salesOrders.map(scoped),
    fulfilmentTasks: state.fulfilmentTasks.map(scoped),
    quoteDocuments: state.quoteDocuments.map(scoped),
    paymentTerms: state.paymentTerms.map(scoped),
    deliveryEvidence: state.deliveryEvidence.map(scoped),
    serviceMilestones: state.serviceMilestones.map(scoped),
    invoices: state.invoices.map(scoped),
    creditDebitNotes: state.creditDebitNotes.map(scoped),
    receivables: state.receivables.map(scoped),
    paymentReceipts: state.paymentReceipts.map(scoped),
    // These records predate the scoped operating-record convention. Keep a
    // valid foreign scope intact so downstream projections can fail closed;
    // attach the active state scope only for legacy records that have none.
    stockLocations: state.stockLocations.map(scoped),
    stockPositions: state.stockPositions.map(scoped),
    stockMovements: state.stockMovements.map(scoped),
    stockReservations: state.stockReservations.map(scoped),
    shipmentPackages: state.shipmentPackages.map(scoped),
    shipmentEvents: state.shipmentEvents.map(scoped),
    carrierAdapters: state.carrierAdapters.map(scoped),
    returnAuthorizations: state.returnAuthorizations.map(scoped),
    pincodeServiceabilityRules: state.pincodeServiceabilityRules.map(scoped),
    deliveryPromises: state.deliveryPromises.map(scoped),
    codCollectionCases: state.codCollectionCases.map(scoped),
    uoms: state.uoms.map(scoped),
    uomConversions: state.uomConversions.map(scoped),
    inventoryItems: state.inventoryItems.map(scoped),
    itemVariants: state.itemVariants.map(scoped),
    warehouses: state.warehouses.map(scoped),
    warehouseZones: state.warehouseZones.map(scoped),
    storageBins: state.storageBins.map(scoped),
    inventoryBatches: state.inventoryBatches.map(scoped),
    serialUnits: state.serialUnits.map(scoped),
    binBalances: state.binBalances.map(scoped),
    inventoryCostLayers: state.inventoryCostLayers.map(scoped),
    inventoryLedger: state.inventoryLedger.map(scoped),
    warehouseTasks: state.warehouseTasks.map(scoped),
    inventoryTransfers: state.inventoryTransfers.map(scoped),
    cycleCountPlans: state.cycleCountPlans.map(scoped),
    reorderPolicies: state.reorderPolicies.map(scoped),
    reorderProposals: state.reorderProposals.map(scoped),
    inventoryValuationReviews: state.inventoryValuationReviews.map(scoped),
    inventoryDispositions: state.inventoryDispositions.map(scoped),
    retailCounters: state.retailCounters.map(scoped),
    retailCashierShifts: state.retailCashierShifts.map(scoped),
    retailSales: state.retailSales.map(scoped),
    retailOfflineSaleQueue: (state.retailOfflineSaleQueue ?? []).map(scoped),
    retailOfflineSyncReceipts: (state.retailOfflineSyncReceipts ?? []).map(scoped),
    retailUnifiedOrderIngestion: state.retailUnifiedOrderIngestion ? { ...state.retailUnifiedOrderIngestion, hubHandoffs: state.retailUnifiedOrderIngestion.hubHandoffs ?? [], fulfilmentHandoffs: state.retailUnifiedOrderIngestion.fulfilmentHandoffs ?? [], stockReservationExecutions: state.retailUnifiedOrderIngestion.stockReservationExecutions ?? [], pickTaskExecutions: state.retailUnifiedOrderIngestion.pickTaskExecutions ?? [], shipmentPackageExecutions: state.retailUnifiedOrderIngestion.shipmentPackageExecutions ?? [], dispatchReadinessExecutions: state.retailUnifiedOrderIngestion.dispatchReadinessExecutions ?? [], carrierDispatchExecutions: state.retailUnifiedOrderIngestion.carrierDispatchExecutions ?? [], deliveryExecutions: state.retailUnifiedOrderIngestion.deliveryExecutions ?? [], rtoReconciliationExecutions: state.retailUnifiedOrderIngestion.rtoReconciliationExecutions ?? [], returnReconciliationExecutions: state.retailUnifiedOrderIngestion.returnReconciliationExecutions ?? [], carrierCallbackEvidence: state.retailUnifiedOrderIngestion.carrierCallbackEvidence ?? [] } : { orders: [], conflicts: [], reservationIntents: [], reconciliationRequirements: [], hubHandoffs: [], fulfilmentHandoffs: [], stockReservationExecutions: [], pickTaskExecutions: [], shipmentPackageExecutions: [], dispatchReadinessExecutions: [], carrierDispatchExecutions: [], deliveryExecutions: [], rtoReconciliationExecutions: [], returnReconciliationExecutions: [], carrierCallbackEvidence: [] },
    retailDeviceTransportEvidence: (state.retailDeviceTransportEvidence ?? []).map(scoped),
    retailDevicePreflightEvidence: (state.retailDevicePreflightEvidence ?? []).map(scoped),
    retailDeviceAdapterProfiles: (state.retailDeviceAdapterProfiles ?? []).map(scoped),
    retailReturns: state.retailReturns.map(scoped),
    retailExchanges: state.retailExchanges.map(scoped),
    retailCreditNoteReconciliations: state.retailCreditNoteReconciliations.map(scoped),
    retailInterBranchTransfers: state.retailInterBranchTransfers.map(scoped),
    retailScaleProfiles: state.retailScaleProfiles.map(scoped),
    retailPrinterAdapters: state.retailPrinterAdapters.map(scoped),
    retailLabelPrintDispatches: state.retailLabelPrintDispatches.map(scoped),
    retailCatalogBulkEdits: state.retailCatalogBulkEdits.map(scoped),
    retailStoreCredits: state.retailStoreCredits.map(scoped),
    retailCatalogCategories: state.retailCatalogCategories.map(scoped),
    retailCatalogBrands: state.retailCatalogBrands.map(scoped),
    retailMerchandisingProfiles: state.retailMerchandisingProfiles.map(scoped),
    retailBarcodeSequences: state.retailBarcodeSequences.map(scoped),
    retailLabelPrintRuns: state.retailLabelPrintRuns.map(scoped),
    retailProductCombos: state.retailProductCombos.map(scoped),
    retailLoyaltyAccounts: state.retailLoyaltyAccounts.map(scoped),
    retailLoyaltyLedger: state.retailLoyaltyLedger.map(scoped),
    retailVouchers: state.retailVouchers.map(scoped),
    retailCustomerVisits: state.retailCustomerVisits.map(scoped),
    retailSalesCommissions: state.retailSalesCommissions.map(scoped),
    retailCommissionPayoutBatches: state.retailCommissionPayoutBatches.map(scoped),
    retailPromotionRedemptions: state.retailPromotionRedemptions.map(scoped),
    retailPurchaseOcrDocuments: state.retailPurchaseOcrDocuments.map(scoped),
    retailCommerceConnectors: state.retailCommerceConnectors.map(scoped),
    retailCommerceSyncRuns: state.retailCommerceSyncRuns.map(scoped),
    retailCommerceOrders: state.retailCommerceOrders.map(scoped),
    retailCommerceCatalogMappings: state.retailCommerceCatalogMappings.map(scoped),
    retailSettlementReconciliations: state.retailSettlementReconciliations.map(scoped),
    retailSettlementAllocationPacks: state.retailSettlementAllocationPacks.map(scoped),
    retailCommerceConflictResolutions: state.retailCommerceConflictResolutions.map(scoped),
    retailSettlementWithholdingEvidence: state.retailSettlementWithholdingEvidence.map(scoped),
    retailOcrProviderProfiles: state.retailOcrProviderProfiles.map(scoped),
    retailPurchaseOcrMappings: state.retailPurchaseOcrMappings.map(scoped),
    retailCommercePushBatches: state.retailCommercePushBatches.map(scoped),
    retailCommerceConformanceCases: state.retailCommerceConformanceCases.map(scoped),
    retailPurchaseExceptions: state.retailPurchaseExceptions.map(scoped),
    retailCutoverPlans: (state.retailCutoverPlans ?? []).map(scoped),
    purchaseRequisitions: state.purchaseRequisitions.map(scoped),
    suppliers: state.suppliers.map(scoped),
    requestForQuotations: state.requestForQuotations.map(scoped),
    supplierQuotations: state.supplierQuotations.map(scoped),
    purchaseOrders: state.purchaseOrders.map(scoped),
    goodsReceipts: state.goodsReceipts.map(scoped),
    landedCostAllocations: state.landedCostAllocations.map(scoped),
    supplierInvoices: state.supplierInvoices.map(scoped),
    threeWayMatches: state.threeWayMatches.map(scoped),
    workCenters: state.workCenters.map(scoped),
    bomRevisions: state.bomRevisions.map(scoped),
    qualityPlans: state.qualityPlans.map(scoped),
    workOrders: state.workOrders.map(scoped),
    productionMaterialIssues: state.productionMaterialIssues.map(scoped),
    qualityInspections: state.qualityInspections.map(scoped),
    nonconformances: state.nonconformances.map(scoped),
    productionOutputs: state.productionOutputs.map(scoped),
    deliveryProjects: state.deliveryProjects.map(scoped),
    projectTasks: state.projectTasks.map(scoped),
    timeEntries: state.timeEntries.map(scoped),
    serviceAgreements: state.serviceAgreements.map(scoped),
    supportTickets: state.supportTickets.map(scoped),
    fieldServiceJobs: state.fieldServiceJobs.map(scoped),
    workforceProfiles: state.workforceProfiles.map(scoped),
    workforceAvailabilities: state.workforceAvailabilities.map(scoped),
    workforceAllocations: state.workforceAllocations.map(scoped),
    employerRegistrations: state.employerRegistrations.map(scoped),
    payrollPolicies: state.payrollPolicies.map(scoped),
    payrollCompensations: state.payrollCompensations.map(scoped),
    benefitPlans: state.benefitPlans.map(scoped),
    benefitEnrollments: state.benefitEnrollments.map(scoped),
    payrollRuns: state.payrollRuns.map(scoped),
    payrollSlips: state.payrollSlips.map(scoped),
    payrollStatutoryObligations: state.payrollStatutoryObligations.map(scoped),
    expenseClaims: state.expenseClaims.map(scoped),
    attendanceRecords: state.attendanceRecords.map(scoped),
    leaveTypes: state.leaveTypes.map(scoped),
    leaveApplications: state.leaveApplications.map(scoped),
    payrollAdjustments: state.payrollAdjustments.map(scoped),
    taxDeclarations: state.taxDeclarations.map(scoped),
    payslipDeliveries: state.payslipDeliveries.map(scoped),
    creditLimitControls: state.creditLimitControls.map(scoped),
    dunningCases: state.dunningCases.map(scoped),
    collectionActivities: state.collectionActivities.map(scoped),
    receivableDisputes: state.receivableDisputes.map(scoped),
    writeOffRequests: state.writeOffRequests.map(scoped),
    withholdingPolicies: state.withholdingPolicies.map(scoped),
    withholdingEntries: state.withholdingEntries.map(scoped),
    zeroRatedSupplyReviews: state.zeroRatedSupplyReviews.map(scoped),
    bankAccounts: state.bankAccounts.map(scoped),
    bankStatementImports: state.bankStatementImports.map(scoped),
    bankStatementLines: state.bankStatementLines.map(scoped),
    treasuryPositions: state.treasuryPositions.map(scoped),
    cashForecastRuns: state.cashForecastRuns.map(scoped),
    paymentProposals: state.paymentProposals.map(scoped),
    bankCharges: state.bankCharges.map(scoped),
    settlementExceptions: state.settlementExceptions.map(scoped),
    liquiditySweeps: state.liquiditySweeps.map(scoped),
    projectBillingPlans: state.projectBillingPlans.map(scoped),
    projectBillingClaims: state.projectBillingClaims.map(scoped),
    revenueRecognitionEvents: state.revenueRecognitionEvents.map(scoped),
    serviceEntitlementUsage: state.serviceEntitlementUsage.map(scoped),
    accountingClosePeriods: state.accountingClosePeriods.map(scoped),
    projectExchangeRates: state.projectExchangeRates.map(scoped),
    projectCurrencyProfiles: state.projectCurrencyProfiles.map(scoped),
    projectContractVariations: state.projectContractVariations.map(scoped),
    projectRetainers: state.projectRetainers.map(scoped),
    retainerDrawdowns: state.retainerDrawdowns.map(scoped),
    projectResourcePlans: state.projectResourcePlans.map(scoped),
    projectMarginReviews: state.projectMarginReviews.map(scoped),
    statutoryExchanges: state.statutoryExchanges.map(scoped),
    statutoryAdapters: state.statutoryAdapters.map(scoped),
    statutoryOperations: state.statutoryOperations.map(scoped),
    consolidatedEwayBills: state.consolidatedEwayBills.map(scoped),
    digitalSignatureEvidence: state.digitalSignatureEvidence.map(scoped),
    portalReconciliationRuns: state.portalReconciliationRuns.map(scoped),
    providerConnectors: state.providerConnectors.map(scoped),
    providerConformanceCases: state.providerConformanceCases.map(scoped),
    providerPreflightEvidence: (state.providerPreflightEvidence ?? []).map(scoped),
    providerSubmissions: state.providerSubmissions.map(scoped),
    providerReconciliationRuns: state.providerReconciliationRuns.map(scoped),
    assetCategories: state.assetCategories.map(scoped),
    managedAssets: state.managedAssets.map(scoped),
    preventiveMaintenancePlans: state.preventiveMaintenancePlans.map(scoped),
    maintenanceWorkOrders: state.maintenanceWorkOrders.map(scoped),
    assetCapitalizations: state.assetCapitalizations.map(scoped),
    assetDepreciationPolicies: state.assetDepreciationPolicies.map(scoped),
    assetDepreciationRuns: state.assetDepreciationRuns.map(scoped),
    assetRetirements: state.assetRetirements.map(scoped),
    assetCustodyTransfers: state.assetCustodyTransfers.map(scoped),
    assetComponentizations: state.assetComponentizations.map(scoped),
    assetComponentAllocations: state.assetComponentAllocations.map(scoped),
    assetTransferAccountings: state.assetTransferAccountings.map(scoped),
    assetSaleDisposals: state.assetSaleDisposals.map(scoped),
    assetImpairmentReviews: state.assetImpairmentReviews.map(scoped),
    assetRevaluations: state.assetRevaluations.map(scoped),
    assetWarranties: state.assetWarranties.map(scoped),
    assetAmcContracts: state.assetAmcContracts.map(scoped),
    assetMeters: state.assetMeters.map(scoped),
    assetMeterReadings: state.assetMeterReadings.map(scoped),
    correctiveMaintenanceRequests: state.correctiveMaintenanceRequests.map(scoped),
    assetCalibrations: state.assetCalibrations.map(scoped),
    assetSpareParts: state.assetSpareParts.map(scoped),
    assetSpareIssues: state.assetSpareIssues.map(scoped),
    fleetVehicles: state.fleetVehicles.map(scoped),
    fleetTrips: state.fleetTrips.map(scoped),
    assetInstalledBaseEvents: state.assetInstalledBaseEvents.map(scoped),
  };
}

/**
 * Version 40 makes scopes durable for the legacy physical fulfilment chain
 * and its COD custody cases. We retain this check for malformed v40 payloads
 * as well, so an interrupted
 * write cannot leave otherwise-valid physical evidence invisible forever.
 */
function hasUnscopedPhysicalFulfilmentRecords(state: RevenueOpsState): boolean {
  return [
    ...state.stockLocations,
    ...state.stockPositions,
    ...state.stockMovements,
    ...state.stockReservations,
    ...state.shipmentPackages,
    ...state.shipmentEvents,
    ...state.carrierAdapters,
    ...state.codCollectionCases,
    ...state.returnAuthorizations,
    ...state.inventoryDispositions,
    ...state.retailCounters,
    ...state.retailCashierShifts,
    ...state.retailSales,
    ...(state.retailOfflineSaleQueue ?? []),
    ...(state.retailOfflineSyncReceipts ?? []),
    ...(state.retailDeviceTransportEvidence ?? []),
    ...(state.retailDevicePreflightEvidence ?? []),
    ...(state.retailDeviceAdapterProfiles ?? []),
    ...state.retailReturns,
    ...state.retailExchanges,
    ...state.retailCreditNoteReconciliations,
    ...state.retailInterBranchTransfers,
    ...state.retailScaleProfiles,
    ...state.retailPrinterAdapters,
    ...state.retailLabelPrintDispatches,
    ...state.retailCatalogBulkEdits,
    ...state.retailStoreCredits,
    ...state.retailCatalogCategories,
    ...state.retailCatalogBrands,
    ...state.retailMerchandisingProfiles,
    ...state.retailBarcodeSequences,
    ...state.retailLabelPrintRuns,
    ...state.retailPurchaseOcrDocuments,
    ...state.retailCommerceConnectors,
    ...state.retailCommerceSyncRuns,
    ...state.retailCommerceOrders,
    ...state.retailCommerceCatalogMappings,
    ...state.retailSettlementReconciliations,
    ...state.retailSettlementAllocationPacks,
    ...state.retailCommerceConflictResolutions,
    ...state.retailSettlementWithholdingEvidence,
    ...state.retailOcrProviderProfiles,
    ...state.retailPurchaseOcrMappings,
    ...state.retailCommercePushBatches,
    ...state.retailCommerceConformanceCases,
    ...state.retailPurchaseExceptions,
    ...state.retailLoyaltyAccounts,
    ...state.retailLoyaltyLedger,
    ...state.retailVouchers,
  ].some((record) => !isRevenueOperationsScope(record.scope));
}

function isRevenueOpsState(value: unknown): value is RevenueOpsState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RevenueOpsState>;
  return Number(candidate.schemaVersion) === 54 && typeof candidate.revision === 'number' &&
    Array.isArray(candidate.purchaseRequisitions) &&
    isRevenueOperationsScope(candidate.scope) &&
    Boolean(candidate.profile) && Array.isArray(candidate.territories) &&
    Array.isArray(candidate.assignmentRules) && Array.isArray(candidate.assignments) &&
    Array.isArray(candidate.segments) && Array.isArray(candidate.productInterests) &&
    Array.isArray(candidate.quotes) && Array.isArray(candidate.taxCodes) &&
    Array.isArray(candidate.products) && Array.isArray(candidate.priceLists) &&
    Array.isArray(candidate.priceListEntries) && Array.isArray(candidate.priceListApprovalRequests) && Array.isArray(candidate.discountPolicies) &&
    Array.isArray(candidate.quoteApprovalRequests) && Array.isArray(candidate.salesOrders) &&
    Array.isArray(candidate.fulfilmentTasks) && Array.isArray(candidate.quoteDocuments) &&
    Array.isArray(candidate.paymentTerms) && Array.isArray(candidate.deliveryEvidence) &&
    Array.isArray(candidate.serviceMilestones) && Array.isArray(candidate.invoices) &&
    Array.isArray(candidate.creditDebitNotes) && Array.isArray(candidate.receivables) &&
    Array.isArray(candidate.paymentReceipts) && Array.isArray(candidate.journalDrafts) &&
    Array.isArray(candidate.invoiceDocuments) && Array.isArray(candidate.gstRegistrations) &&
    Array.isArray(candidate.placeOfSupplyReviews) && Array.isArray(candidate.stockLocations) &&
    Array.isArray(candidate.stockPositions) && Array.isArray(candidate.stockMovements) &&
    Array.isArray(candidate.stockReservations) && Array.isArray(candidate.shipmentPackages) &&
    Array.isArray(candidate.shipmentEvents) && Array.isArray(candidate.carrierAdapters) &&
    Array.isArray(candidate.pincodeServiceabilityRules) && Array.isArray(candidate.deliveryPromises) &&
    Array.isArray(candidate.codCollectionCases) &&
    Array.isArray(candidate.returnAuthorizations) && Array.isArray(candidate.statutoryExchanges) &&
    Array.isArray(candidate.uoms) && Array.isArray(candidate.uomConversions) &&
    Array.isArray(candidate.inventoryItems) && Array.isArray(candidate.itemVariants) &&
    Array.isArray(candidate.warehouses) && Array.isArray(candidate.warehouseZones) &&
    Array.isArray(candidate.storageBins) && Array.isArray(candidate.inventoryBatches) &&
    Array.isArray(candidate.serialUnits) && Array.isArray(candidate.binBalances) &&
    Array.isArray(candidate.inventoryCostLayers) && Array.isArray(candidate.inventoryLedger) &&
    Array.isArray(candidate.warehouseTasks) && Array.isArray(candidate.inventoryTransfers) &&
    Array.isArray(candidate.cycleCountPlans) && Array.isArray(candidate.reorderPolicies) &&
    Array.isArray(candidate.reorderProposals) && Array.isArray(candidate.inventoryValuationReviews) && Array.isArray(candidate.inventoryDispositions) &&
    Array.isArray(candidate.retailCounters) && Array.isArray(candidate.retailCashierShifts) && Array.isArray(candidate.retailSales) && Array.isArray(candidate.retailReturns) && Array.isArray(candidate.retailExchanges) && Array.isArray(candidate.retailCreditNoteReconciliations) && Array.isArray(candidate.retailInterBranchTransfers) && Array.isArray(candidate.retailScaleProfiles) && Array.isArray(candidate.retailPrinterAdapters) && Array.isArray(candidate.retailLabelPrintDispatches) && Array.isArray(candidate.retailCatalogBulkEdits) && Array.isArray(candidate.retailStoreCredits) && Array.isArray(candidate.retailCatalogCategories) && Array.isArray(candidate.retailCatalogBrands) && Array.isArray(candidate.retailMerchandisingProfiles) && Array.isArray(candidate.retailBarcodeSequences) && Array.isArray(candidate.retailLabelPrintRuns) && Array.isArray(candidate.retailProductCombos) && Array.isArray(candidate.retailLoyaltyAccounts) && Array.isArray(candidate.retailLoyaltyLedger) && Array.isArray(candidate.retailVouchers) && Array.isArray(candidate.retailCustomerVisits) && Array.isArray(candidate.retailSalesCommissions) && Array.isArray(candidate.retailCommissionPayoutBatches) && Array.isArray(candidate.retailPromotionRedemptions) && Array.isArray(candidate.retailPurchaseOcrDocuments) && Array.isArray(candidate.retailCommerceConnectors) && Array.isArray(candidate.retailCommerceSyncRuns) && Array.isArray(candidate.retailCommerceOrders) && Array.isArray(candidate.retailCommerceCatalogMappings) && Array.isArray(candidate.retailSettlementReconciliations) && Array.isArray(candidate.retailSettlementAllocationPacks) && Array.isArray(candidate.retailCommerceConflictResolutions) && Array.isArray(candidate.retailSettlementWithholdingEvidence) && Array.isArray(candidate.retailOcrProviderProfiles) && Array.isArray(candidate.retailPurchaseOcrMappings) && Array.isArray(candidate.retailCommercePushBatches) && Array.isArray(candidate.retailCommerceConformanceCases) && Array.isArray(candidate.retailPurchaseExceptions) &&
    Array.isArray(candidate.statutoryAdapters) && Array.isArray(candidate.statutoryOperations) &&
    Array.isArray(candidate.consolidatedEwayBills) && Array.isArray(candidate.digitalSignatureEvidence) &&
    Array.isArray(candidate.portalReconciliationRuns) && Array.isArray(candidate.providerConnectors) &&
    Array.isArray(candidate.providerConformanceCases) && Array.isArray(candidate.providerPreflightEvidence) && Array.isArray(candidate.providerSubmissions) &&
    Array.isArray(candidate.providerReconciliationRuns) && Array.isArray(candidate.creditLimitControls) &&
    Array.isArray(candidate.dunningCases) && Array.isArray(candidate.collectionActivities) &&
    Array.isArray(candidate.receivableDisputes) && Array.isArray(candidate.writeOffRequests) &&
    Array.isArray(candidate.withholdingPolicies) && Array.isArray(candidate.withholdingEntries) &&
    Array.isArray(candidate.zeroRatedSupplyReviews) && Array.isArray(candidate.bankAccounts) &&
    Array.isArray(candidate.bankStatementImports) && Array.isArray(candidate.bankStatementLines) &&
    Array.isArray(candidate.suppliers) && Array.isArray(candidate.requestForQuotations) &&
    Array.isArray(candidate.supplierQuotations) && Array.isArray(candidate.purchaseOrders) &&
    Array.isArray(candidate.goodsReceipts) && Array.isArray(candidate.landedCostAllocations) &&
    Array.isArray(candidate.supplierInvoices) && Array.isArray(candidate.threeWayMatches) &&
    Array.isArray(candidate.treasuryPositions) && Array.isArray(candidate.cashForecastRuns) &&
    Array.isArray(candidate.paymentProposals) && Array.isArray(candidate.bankCharges) &&
    Array.isArray(candidate.settlementExceptions) && Array.isArray(candidate.liquiditySweeps) &&
    Array.isArray(candidate.workCenters) && Array.isArray(candidate.bomRevisions) &&
    Array.isArray(candidate.assetCategories) && Array.isArray(candidate.managedAssets) && Array.isArray(candidate.assetCapitalizations) &&
    Array.isArray(candidate.assetDepreciationPolicies) && Array.isArray(candidate.assetDepreciationRuns) &&
    Array.isArray(candidate.assetRetirements) &&
    Array.isArray(candidate.assetCustodyTransfers) &&
    Array.isArray(candidate.assetComponentizations) &&
    Array.isArray(candidate.assetComponentAllocations) &&
    Array.isArray(candidate.assetTransferAccountings) &&
    Array.isArray(candidate.assetSaleDisposals) &&
    Array.isArray(candidate.assetImpairmentReviews) && Array.isArray(candidate.assetRevaluations) &&
    Array.isArray(candidate.assetWarranties) && Array.isArray(candidate.assetAmcContracts) &&
    Array.isArray(candidate.assetMeters) && Array.isArray(candidate.assetMeterReadings) &&
    Array.isArray(candidate.correctiveMaintenanceRequests) && Array.isArray(candidate.assetCalibrations) &&
    Array.isArray(candidate.assetSpareParts) && Array.isArray(candidate.assetSpareIssues) &&
    Array.isArray(candidate.fleetVehicles) && Array.isArray(candidate.fleetTrips) && Array.isArray(candidate.assetInstalledBaseEvents) &&
    Array.isArray(candidate.preventiveMaintenancePlans) && Array.isArray(candidate.maintenanceWorkOrders) &&
    Array.isArray(candidate.qualityPlans) && Array.isArray(candidate.workOrders) &&
    Array.isArray(candidate.productionMaterialIssues) && Array.isArray(candidate.qualityInspections) &&
    Array.isArray(candidate.nonconformances) && Array.isArray(candidate.productionOutputs) &&
    Array.isArray(candidate.deliveryProjects) && Array.isArray(candidate.projectTasks) &&
    Array.isArray(candidate.timeEntries) && Array.isArray(candidate.serviceAgreements) &&
    Array.isArray(candidate.supportTickets) && Array.isArray(candidate.fieldServiceJobs) &&
    Array.isArray(candidate.workforceProfiles) && Array.isArray(candidate.workforceAvailabilities) && Array.isArray(candidate.workforceAllocations) &&
    Array.isArray(candidate.projectBillingPlans) && Array.isArray(candidate.projectBillingClaims) && Array.isArray(candidate.revenueRecognitionEvents) &&
    Array.isArray(candidate.serviceEntitlementUsage) && Array.isArray(candidate.accountingClosePeriods) &&
    Array.isArray(candidate.projectExchangeRates) && Array.isArray(candidate.projectCurrencyProfiles) && Array.isArray(candidate.projectContractVariations) &&
    Array.isArray(candidate.projectRetainers) && Array.isArray(candidate.retainerDrawdowns) && Array.isArray(candidate.projectResourcePlans) && Array.isArray(candidate.projectMarginReviews) &&
    Array.isArray(candidate.employerRegistrations) && Array.isArray(candidate.payrollPolicies) &&
    Array.isArray(candidate.payrollCompensations) && Array.isArray(candidate.benefitPlans) &&
    Array.isArray(candidate.benefitEnrollments) && Array.isArray(candidate.payrollRuns) &&
    Array.isArray(candidate.payrollSlips) && Array.isArray(candidate.payrollStatutoryObligations) &&
    Array.isArray(candidate.expenseClaims) && Array.isArray(candidate.attendanceRecords) &&
    Array.isArray(candidate.leaveTypes) && Array.isArray(candidate.leaveApplications) &&
    Array.isArray(candidate.payrollAdjustments) && Array.isArray(candidate.taxDeclarations) &&
    Array.isArray(candidate.payslipDeliveries);
}

export function upgradeStoredState(value: unknown): RevenueOpsState | null {
  if (isRevenueOpsState(value)) return withOperatingRecordScopes(value);
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const storedVersion = Number(candidate.schemaVersion);
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54].includes(storedVersion) || !Array.isArray(candidate.quotes) || !Array.isArray(candidate.productInterests)) return null;
  const baseline = createInitialRevenueOpsState();
  const quotes = storedVersion === 1 ? (candidate.quotes as Array<Record<string, unknown>>).map((quote) => {
    const lines = Array.isArray(quote.lines) ? quote.lines as Array<Record<string, unknown>> : [];
    const subtotal = lines.reduce((total, line) => total + Number(line.taxableValue ?? 0), 0);
    return { ...quote, discountPolicyIds: [], subtotal, discountTotal: 0, pricingAsOf: String(quote.createdAt ?? new Date().toISOString()).slice(0, 10), revisionNumber: 1 };
  }) : candidate.quotes;
  return withOperatingRecordScopes({
    ...baseline,
    ...(candidate as Partial<RevenueOpsState>),
    schemaVersion: 54,
    revision: Number(candidate.revision ?? 0) + 1,
    scope: isRevenueOperationsScope(candidate.scope) ? candidate.scope : baseline.scope,
    productInterests: storedVersion === 1 ? (candidate.productInterests as RevenueOpsState['productInterests']).map((interest) => interest.hsnSac === '998314' ? { ...interest, catalogProductId: 'product-distributor-platform' } : interest) : candidate.productInterests as RevenueOpsState['productInterests'],
    quotes: quotes as unknown as RevenueOpsState['quotes'],
    priceLists: (Array.isArray(candidate.priceLists) ? candidate.priceLists : baseline.priceLists).map((priceList) => ({ ...priceList, status: priceList.status ?? (priceList.active ? 'active' : 'draft'), active: priceList.status ? priceList.status === 'active' && Boolean(priceList.active) : Boolean(priceList.active) })) as RevenueOpsState['priceLists'],
    priceListApprovalRequests: Array.isArray(candidate.priceListApprovalRequests) ? candidate.priceListApprovalRequests as RevenueOpsState['priceListApprovalRequests'] : [],
    paymentTerms: storedVersion >= 3 ? candidate.paymentTerms as RevenueOpsState['paymentTerms'] : baseline.paymentTerms,
    deliveryEvidence: storedVersion >= 3 ? candidate.deliveryEvidence as RevenueOpsState['deliveryEvidence'] : [],
    serviceMilestones: storedVersion >= 3 ? candidate.serviceMilestones as RevenueOpsState['serviceMilestones'] : [],
    invoices: storedVersion >= 3 ? (candidate.invoices as RevenueOpsState['invoices']).map((invoice) => ({ ...invoice, shipmentPackageIds: invoice.shipmentPackageIds ?? [], projectBillingClaimIds: invoice.projectBillingClaimIds ?? [] })) : [],
    creditDebitNotes: storedVersion >= 3 ? candidate.creditDebitNotes as RevenueOpsState['creditDebitNotes'] : [],
    receivables: storedVersion >= 3 ? candidate.receivables as RevenueOpsState['receivables'] : [],
    paymentReceipts: storedVersion >= 3 ? candidate.paymentReceipts as RevenueOpsState['paymentReceipts'] : [],
    journalDrafts: storedVersion >= 3 ? candidate.journalDrafts as RevenueOpsState['journalDrafts'] : [],
    invoiceDocuments: storedVersion >= 3 ? candidate.invoiceDocuments as RevenueOpsState['invoiceDocuments'] : [],
    gstRegistrations: storedVersion >= 4 ? candidate.gstRegistrations as RevenueOpsState['gstRegistrations'] : [],
    placeOfSupplyReviews: storedVersion >= 4 ? candidate.placeOfSupplyReviews as RevenueOpsState['placeOfSupplyReviews'] : [],
    stockLocations: storedVersion >= 4 ? candidate.stockLocations as RevenueOpsState['stockLocations'] : [],
    stockPositions: storedVersion >= 4 ? candidate.stockPositions as RevenueOpsState['stockPositions'] : [],
    stockMovements: storedVersion >= 4 ? candidate.stockMovements as RevenueOpsState['stockMovements'] : [],
    stockReservations: storedVersion >= 4 ? candidate.stockReservations as RevenueOpsState['stockReservations'] : [],
    shipmentPackages: storedVersion >= 4 ? candidate.shipmentPackages as RevenueOpsState['shipmentPackages'] : [],
    shipmentEvents: storedVersion >= 4 ? candidate.shipmentEvents as RevenueOpsState['shipmentEvents'] : [],
    carrierAdapters: storedVersion >= 4 ? candidate.carrierAdapters as RevenueOpsState['carrierAdapters'] : baseline.carrierAdapters,
    pincodeServiceabilityRules: storedVersion >= 38 && Array.isArray(candidate.pincodeServiceabilityRules) ? candidate.pincodeServiceabilityRules as RevenueOpsState['pincodeServiceabilityRules'] : [],
    deliveryPromises: storedVersion >= 38 && Array.isArray(candidate.deliveryPromises) ? candidate.deliveryPromises as RevenueOpsState['deliveryPromises'] : [],
    // v40 is evidence-only: historical rows must never invent COD collection
    // or bank events. Legacy workspaces therefore begin with an empty register.
    codCollectionCases: storedVersion >= 40 && Array.isArray(candidate.codCollectionCases) ? candidate.codCollectionCases as RevenueOpsState['codCollectionCases'] : [],
    returnAuthorizations: storedVersion >= 4 ? candidate.returnAuthorizations as RevenueOpsState['returnAuthorizations'] : [],
    statutoryExchanges: storedVersion >= 4 ? candidate.statutoryExchanges as RevenueOpsState['statutoryExchanges'] : [],
    uoms: storedVersion >= 5 ? candidate.uoms as RevenueOpsState['uoms'] : baseline.uoms,
    uomConversions: storedVersion >= 5 ? candidate.uomConversions as RevenueOpsState['uomConversions'] : [],
    inventoryItems: storedVersion >= 5 ? candidate.inventoryItems as RevenueOpsState['inventoryItems'] : [],
    itemVariants: storedVersion >= 5 ? candidate.itemVariants as RevenueOpsState['itemVariants'] : [],
    warehouses: storedVersion >= 5 ? candidate.warehouses as RevenueOpsState['warehouses'] : [],
    warehouseZones: storedVersion >= 5 ? candidate.warehouseZones as RevenueOpsState['warehouseZones'] : [],
    storageBins: storedVersion >= 5 ? candidate.storageBins as RevenueOpsState['storageBins'] : [],
    inventoryBatches: storedVersion >= 5 ? candidate.inventoryBatches as RevenueOpsState['inventoryBatches'] : [],
    serialUnits: storedVersion >= 5 ? candidate.serialUnits as RevenueOpsState['serialUnits'] : [],
    binBalances: storedVersion >= 5 ? candidate.binBalances as RevenueOpsState['binBalances'] : [],
    inventoryCostLayers: storedVersion >= 5 ? candidate.inventoryCostLayers as RevenueOpsState['inventoryCostLayers'] : [],
    inventoryLedger: storedVersion >= 5 ? candidate.inventoryLedger as RevenueOpsState['inventoryLedger'] : [],
    warehouseTasks: storedVersion >= 5 ? candidate.warehouseTasks as RevenueOpsState['warehouseTasks'] : [],
    inventoryTransfers: storedVersion >= 5 ? candidate.inventoryTransfers as RevenueOpsState['inventoryTransfers'] : [],
    cycleCountPlans: storedVersion >= 5 ? candidate.cycleCountPlans as RevenueOpsState['cycleCountPlans'] : [],
    reorderPolicies: storedVersion >= 5 ? candidate.reorderPolicies as RevenueOpsState['reorderPolicies'] : [],
    reorderProposals: storedVersion >= 5 ? candidate.reorderProposals as RevenueOpsState['reorderProposals'] : [],
    inventoryValuationReviews: storedVersion >= 5 ? candidate.inventoryValuationReviews as RevenueOpsState['inventoryValuationReviews'] : [],
    inventoryDispositions: storedVersion >= 41 && Array.isArray(candidate.inventoryDispositions) ? candidate.inventoryDispositions as RevenueOpsState['inventoryDispositions'] : [],
    // v42 introduces the retail counter aggregate. Older data must start with
    // no counter, shift, sale, tender or stock evidence fabricated by migration.
    retailCounters: storedVersion >= 42 && Array.isArray(candidate.retailCounters) ? candidate.retailCounters as RevenueOpsState['retailCounters'] : [],
    retailCashierShifts: storedVersion >= 42 && Array.isArray(candidate.retailCashierShifts) ? candidate.retailCashierShifts as RevenueOpsState['retailCashierShifts'] : [],
    retailSales: storedVersion >= 42 && Array.isArray(candidate.retailSales) ? candidate.retailSales as RevenueOpsState['retailSales'] : [],
    retailOfflineSaleQueue: Array.isArray(candidate.retailOfflineSaleQueue) ? candidate.retailOfflineSaleQueue as RevenueOpsState['retailOfflineSaleQueue'] : [],
    retailOfflineSyncReceipts: Array.isArray(candidate.retailOfflineSyncReceipts) ? candidate.retailOfflineSyncReceipts as NonNullable<RevenueOpsState['retailOfflineSyncReceipts']> : [],
    retailUnifiedOrderIngestion: candidate.retailUnifiedOrderIngestion && typeof candidate.retailUnifiedOrderIngestion === 'object'
      ? { ...(candidate.retailUnifiedOrderIngestion as NonNullable<RevenueOpsState['retailUnifiedOrderIngestion']>), hubHandoffs: Array.isArray((candidate.retailUnifiedOrderIngestion as { hubHandoffs?: unknown }).hubHandoffs) ? (candidate.retailUnifiedOrderIngestion as NonNullable<RevenueOpsState['retailUnifiedOrderIngestion']>).hubHandoffs : [], fulfilmentHandoffs: Array.isArray((candidate.retailUnifiedOrderIngestion as { fulfilmentHandoffs?: unknown }).fulfilmentHandoffs) ? (candidate.retailUnifiedOrderIngestion as NonNullable<RevenueOpsState['retailUnifiedOrderIngestion']>).fulfilmentHandoffs : [], carrierDispatchExecutions: Array.isArray((candidate.retailUnifiedOrderIngestion as { carrierDispatchExecutions?: unknown }).carrierDispatchExecutions) ? (candidate.retailUnifiedOrderIngestion as NonNullable<RevenueOpsState['retailUnifiedOrderIngestion']>).carrierDispatchExecutions : [], deliveryExecutions: Array.isArray((candidate.retailUnifiedOrderIngestion as { deliveryExecutions?: unknown }).deliveryExecutions) ? (candidate.retailUnifiedOrderIngestion as NonNullable<RevenueOpsState['retailUnifiedOrderIngestion']>).deliveryExecutions : [], rtoReconciliationExecutions: Array.isArray((candidate.retailUnifiedOrderIngestion as { rtoReconciliationExecutions?: unknown }).rtoReconciliationExecutions) ? (candidate.retailUnifiedOrderIngestion as NonNullable<RevenueOpsState['retailUnifiedOrderIngestion']>).rtoReconciliationExecutions : [], returnReconciliationExecutions: Array.isArray((candidate.retailUnifiedOrderIngestion as { returnReconciliationExecutions?: unknown }).returnReconciliationExecutions) ? (candidate.retailUnifiedOrderIngestion as NonNullable<RevenueOpsState['retailUnifiedOrderIngestion']>).returnReconciliationExecutions : [], carrierCallbackEvidence: Array.isArray((candidate.retailUnifiedOrderIngestion as { carrierCallbackEvidence?: unknown }).carrierCallbackEvidence) ? (candidate.retailUnifiedOrderIngestion as NonNullable<RevenueOpsState['retailUnifiedOrderIngestion']>).carrierCallbackEvidence : [] }
      : { orders: [], conflicts: [], reservationIntents: [], reconciliationRequirements: [], hubHandoffs: [], fulfilmentHandoffs: [], stockReservationExecutions: [], pickTaskExecutions: [], shipmentPackageExecutions: [], dispatchReadinessExecutions: [], carrierDispatchExecutions: [], deliveryExecutions: [], rtoReconciliationExecutions: [], returnReconciliationExecutions: [], carrierCallbackEvidence: [] },
    retailDeviceTransportEvidence: Array.isArray(candidate.retailDeviceTransportEvidence) ? candidate.retailDeviceTransportEvidence as RevenueOpsState['retailDeviceTransportEvidence'] : [],
    retailDevicePreflightEvidence: Array.isArray(candidate.retailDevicePreflightEvidence) ? candidate.retailDevicePreflightEvidence as RevenueOpsState['retailDevicePreflightEvidence'] : [],
    retailDeviceAdapterProfiles: Array.isArray(candidate.retailDeviceAdapterProfiles) ? candidate.retailDeviceAdapterProfiles as RevenueOpsState['retailDeviceAdapterProfiles'] : [],
    // v43 introduces the governed counter-return aggregate. Historical POS
    // sales remain intact; migration never invents a physical return, credit,
    // refund, or cost reversal that was not evidenced in the source data.
    retailReturns: storedVersion >= 43 && Array.isArray(candidate.retailReturns) ? candidate.retailReturns as RevenueOpsState['retailReturns'] : [],
    retailExchanges: storedVersion >= 46 && Array.isArray(candidate.retailExchanges) ? candidate.retailExchanges as RevenueOpsState['retailExchanges'] : [],
    retailCreditNoteReconciliations: storedVersion >= 47 && Array.isArray(candidate.retailCreditNoteReconciliations) ? candidate.retailCreditNoteReconciliations as RevenueOpsState['retailCreditNoteReconciliations'] : [],
    retailInterBranchTransfers: storedVersion >= 48 && Array.isArray(candidate.retailInterBranchTransfers) ? candidate.retailInterBranchTransfers as RevenueOpsState['retailInterBranchTransfers'] : [],
    retailScaleProfiles: storedVersion >= 49 && Array.isArray(candidate.retailScaleProfiles) ? candidate.retailScaleProfiles as RevenueOpsState['retailScaleProfiles'] : [],
    retailPrinterAdapters: storedVersion >= 49 && Array.isArray(candidate.retailPrinterAdapters) ? candidate.retailPrinterAdapters as RevenueOpsState['retailPrinterAdapters'] : [],
    retailLabelPrintDispatches: storedVersion >= 49 && Array.isArray(candidate.retailLabelPrintDispatches) ? candidate.retailLabelPrintDispatches as RevenueOpsState['retailLabelPrintDispatches'] : [],
    retailCatalogBulkEdits: storedVersion >= 49 && Array.isArray(candidate.retailCatalogBulkEdits) ? candidate.retailCatalogBulkEdits as RevenueOpsState['retailCatalogBulkEdits'] : [],
    retailPurchaseOcrDocuments: storedVersion >= 50 && Array.isArray(candidate.retailPurchaseOcrDocuments) ? candidate.retailPurchaseOcrDocuments as RevenueOpsState['retailPurchaseOcrDocuments'] : [],
    retailCommerceConnectors: storedVersion >= 50 && Array.isArray(candidate.retailCommerceConnectors) ? candidate.retailCommerceConnectors as RevenueOpsState['retailCommerceConnectors'] : [],
    retailCommerceSyncRuns: storedVersion >= 50 && Array.isArray(candidate.retailCommerceSyncRuns) ? candidate.retailCommerceSyncRuns as RevenueOpsState['retailCommerceSyncRuns'] : [],
    retailCommerceOrders: storedVersion >= 50 && Array.isArray(candidate.retailCommerceOrders) ? candidate.retailCommerceOrders as RevenueOpsState['retailCommerceOrders'] : [],
    retailCommerceCatalogMappings: Array.isArray(candidate.retailCommerceCatalogMappings) ? candidate.retailCommerceCatalogMappings as RevenueOpsState['retailCommerceCatalogMappings'] : [],
    retailSettlementReconciliations: storedVersion >= 50 && Array.isArray(candidate.retailSettlementReconciliations) ? candidate.retailSettlementReconciliations as RevenueOpsState['retailSettlementReconciliations'] : [],
    retailSettlementAllocationPacks: Array.isArray(candidate.retailSettlementAllocationPacks) ? candidate.retailSettlementAllocationPacks as RevenueOpsState['retailSettlementAllocationPacks'] : [],
    retailCommerceConflictResolutions: Array.isArray(candidate.retailCommerceConflictResolutions) ? candidate.retailCommerceConflictResolutions as RevenueOpsState['retailCommerceConflictResolutions'] : [],
    retailSettlementWithholdingEvidence: Array.isArray(candidate.retailSettlementWithholdingEvidence) ? candidate.retailSettlementWithholdingEvidence as RevenueOpsState['retailSettlementWithholdingEvidence'] : [],
    retailOcrProviderProfiles: storedVersion >= 51 && Array.isArray(candidate.retailOcrProviderProfiles) ? candidate.retailOcrProviderProfiles as RevenueOpsState['retailOcrProviderProfiles'] : [],
    retailPurchaseOcrMappings: storedVersion >= 51 && Array.isArray(candidate.retailPurchaseOcrMappings) ? candidate.retailPurchaseOcrMappings as RevenueOpsState['retailPurchaseOcrMappings'] : [],
    retailCommercePushBatches: storedVersion >= 51 && Array.isArray(candidate.retailCommercePushBatches) ? candidate.retailCommercePushBatches as RevenueOpsState['retailCommercePushBatches'] : [],
    retailCommerceConformanceCases: storedVersion >= 51 && Array.isArray(candidate.retailCommerceConformanceCases) ? candidate.retailCommerceConformanceCases as RevenueOpsState['retailCommerceConformanceCases'] : [],
    retailPurchaseExceptions: storedVersion >= 52 && Array.isArray(candidate.retailPurchaseExceptions) ? candidate.retailPurchaseExceptions as RevenueOpsState['retailPurchaseExceptions'] : [],
    retailCutoverPlans: Array.isArray(candidate.retailCutoverPlans)
      ? (candidate.retailCutoverPlans as NonNullable<RevenueOpsState['retailCutoverPlans']>).map((plan) => ({
        ...plan,
        transitions: Array.isArray(plan.transitions) ? plan.transitions : [],
      }))
      : [],
    // v44 introduces customer-liability store-credit evidence. A legacy
    // return never implies a customer credit balance, so preserve only records
    // explicitly persisted by the v44 workflow.
    retailStoreCredits: storedVersion >= 44 && Array.isArray(candidate.retailStoreCredits) ? candidate.retailStoreCredits as RevenueOpsState['retailStoreCredits'] : [],
    // v45 adds retail merchandising master data. Existing item, barcode and
    // stock records remain unchanged; no category, brand, shelf, sequence or
    // label evidence is fabricated during an upgrade.
    retailCatalogCategories: storedVersion >= 45 && Array.isArray(candidate.retailCatalogCategories) ? candidate.retailCatalogCategories as RevenueOpsState['retailCatalogCategories'] : [],
    retailCatalogBrands: storedVersion >= 45 && Array.isArray(candidate.retailCatalogBrands) ? candidate.retailCatalogBrands as RevenueOpsState['retailCatalogBrands'] : [],
    retailMerchandisingProfiles: storedVersion >= 45 && Array.isArray(candidate.retailMerchandisingProfiles) ? candidate.retailMerchandisingProfiles as RevenueOpsState['retailMerchandisingProfiles'] : [],
    retailBarcodeSequences: storedVersion >= 45 && Array.isArray(candidate.retailBarcodeSequences) ? candidate.retailBarcodeSequences as RevenueOpsState['retailBarcodeSequences'] : [],
    retailLabelPrintRuns: storedVersion >= 45 && Array.isArray(candidate.retailLabelPrintRuns) ? candidate.retailLabelPrintRuns as RevenueOpsState['retailLabelPrintRuns'] : [],
    retailProductCombos: storedVersion >= 46 && Array.isArray(candidate.retailProductCombos) ? candidate.retailProductCombos as RevenueOpsState['retailProductCombos'] : [],
    retailLoyaltyAccounts: Array.isArray(candidate.retailLoyaltyAccounts) ? candidate.retailLoyaltyAccounts as RevenueOpsState['retailLoyaltyAccounts'] : [],
    retailLoyaltyLedger: Array.isArray(candidate.retailLoyaltyLedger) ? candidate.retailLoyaltyLedger as RevenueOpsState['retailLoyaltyLedger'] : [],
    retailVouchers: Array.isArray(candidate.retailVouchers) ? candidate.retailVouchers as RevenueOpsState['retailVouchers'] : [],
    retailCustomerVisits: Array.isArray(candidate.retailCustomerVisits) ? candidate.retailCustomerVisits as RevenueOpsState['retailCustomerVisits'] : [],
    retailSalesCommissions: Array.isArray(candidate.retailSalesCommissions) ? candidate.retailSalesCommissions as RevenueOpsState['retailSalesCommissions'] : [],
    retailPromotionRedemptions: Array.isArray(candidate.retailPromotionRedemptions) ? candidate.retailPromotionRedemptions as RevenueOpsState['retailPromotionRedemptions'] : [],
    statutoryAdapters: storedVersion >= 6 ? candidate.statutoryAdapters as RevenueOpsState['statutoryAdapters'] : [],
    statutoryOperations: storedVersion >= 6 ? candidate.statutoryOperations as RevenueOpsState['statutoryOperations'] : [],
    consolidatedEwayBills: storedVersion >= 6 ? candidate.consolidatedEwayBills as RevenueOpsState['consolidatedEwayBills'] : [],
    digitalSignatureEvidence: storedVersion >= 6 ? candidate.digitalSignatureEvidence as RevenueOpsState['digitalSignatureEvidence'] : [],
    portalReconciliationRuns: storedVersion >= 6 ? candidate.portalReconciliationRuns as RevenueOpsState['portalReconciliationRuns'] : [],
    creditLimitControls: storedVersion >= 7 ? candidate.creditLimitControls as RevenueOpsState['creditLimitControls'] : [],
    dunningCases: storedVersion >= 7 ? candidate.dunningCases as RevenueOpsState['dunningCases'] : [],
    collectionActivities: storedVersion >= 7 ? candidate.collectionActivities as RevenueOpsState['collectionActivities'] : [],
    receivableDisputes: storedVersion >= 7 ? candidate.receivableDisputes as RevenueOpsState['receivableDisputes'] : [],
    writeOffRequests: storedVersion >= 7 ? candidate.writeOffRequests as RevenueOpsState['writeOffRequests'] : [],
    withholdingPolicies: storedVersion >= 7 ? candidate.withholdingPolicies as RevenueOpsState['withholdingPolicies'] : [],
    withholdingEntries: storedVersion >= 7 ? candidate.withholdingEntries as RevenueOpsState['withholdingEntries'] : [],
    zeroRatedSupplyReviews: storedVersion >= 7 ? candidate.zeroRatedSupplyReviews as RevenueOpsState['zeroRatedSupplyReviews'] : [],
    bankAccounts: storedVersion >= 7 ? candidate.bankAccounts as RevenueOpsState['bankAccounts'] : [],
    bankStatementImports: storedVersion >= 7 ? candidate.bankStatementImports as RevenueOpsState['bankStatementImports'] : [],
    bankStatementLines: storedVersion >= 7 ? candidate.bankStatementLines as RevenueOpsState['bankStatementLines'] : [],
    purchaseRequisitions: storedVersion >= 37 && Array.isArray(candidate.purchaseRequisitions) ? candidate.purchaseRequisitions as RevenueOpsState['purchaseRequisitions'] : [],
    suppliers: storedVersion >= 8 ? candidate.suppliers as RevenueOpsState['suppliers'] : [],
    requestForQuotations: storedVersion >= 8 ? candidate.requestForQuotations as RevenueOpsState['requestForQuotations'] : [],
    supplierQuotations: storedVersion >= 8 ? candidate.supplierQuotations as RevenueOpsState['supplierQuotations'] : [],
    purchaseOrders: storedVersion >= 8 ? candidate.purchaseOrders as RevenueOpsState['purchaseOrders'] : [],
    goodsReceipts: storedVersion >= 8 ? candidate.goodsReceipts as RevenueOpsState['goodsReceipts'] : [],
    landedCostAllocations: storedVersion >= 8 ? candidate.landedCostAllocations as RevenueOpsState['landedCostAllocations'] : [],
    supplierInvoices: storedVersion >= 8 ? candidate.supplierInvoices as RevenueOpsState['supplierInvoices'] : [],
    threeWayMatches: storedVersion >= 8 ? candidate.threeWayMatches as RevenueOpsState['threeWayMatches'] : [],
    treasuryPositions: storedVersion >= 9 ? candidate.treasuryPositions as RevenueOpsState['treasuryPositions'] : [],
    cashForecastRuns: storedVersion >= 9 ? candidate.cashForecastRuns as RevenueOpsState['cashForecastRuns'] : [],
    paymentProposals: storedVersion >= 9 ? candidate.paymentProposals as RevenueOpsState['paymentProposals'] : [],
    bankCharges: storedVersion >= 9 ? candidate.bankCharges as RevenueOpsState['bankCharges'] : [],
    settlementExceptions: storedVersion >= 9 ? candidate.settlementExceptions as RevenueOpsState['settlementExceptions'] : [],
    liquiditySweeps: storedVersion >= 9 ? candidate.liquiditySweeps as RevenueOpsState['liquiditySweeps'] : [],
    workCenters: storedVersion >= 10 ? candidate.workCenters as RevenueOpsState['workCenters'] : [],
    assetCategories: storedVersion >= 27 && Array.isArray(candidate.assetCategories) ? candidate.assetCategories as RevenueOpsState['assetCategories'] : [],
    managedAssets: storedVersion >= 27 && Array.isArray(candidate.managedAssets) ? candidate.managedAssets as RevenueOpsState['managedAssets'] : [],
    assetCapitalizations: storedVersion >= 28 && Array.isArray(candidate.assetCapitalizations) ? candidate.assetCapitalizations as RevenueOpsState['assetCapitalizations'] : [],
    assetDepreciationPolicies: storedVersion >= 29 && Array.isArray(candidate.assetDepreciationPolicies) ? candidate.assetDepreciationPolicies as RevenueOpsState['assetDepreciationPolicies'] : [],
    assetDepreciationRuns: storedVersion >= 29 && Array.isArray(candidate.assetDepreciationRuns) ? candidate.assetDepreciationRuns as RevenueOpsState['assetDepreciationRuns'] : [],
    assetRetirements: storedVersion >= 30 && Array.isArray(candidate.assetRetirements) ? candidate.assetRetirements as RevenueOpsState['assetRetirements'] : [],
    assetCustodyTransfers: storedVersion >= 31 && Array.isArray(candidate.assetCustodyTransfers) ? candidate.assetCustodyTransfers as RevenueOpsState['assetCustodyTransfers'] : [],
    assetComponentizations: storedVersion >= 32 && Array.isArray(candidate.assetComponentizations) ? candidate.assetComponentizations as RevenueOpsState['assetComponentizations'] : [],
    assetComponentAllocations: storedVersion >= 33 && Array.isArray(candidate.assetComponentAllocations) ? candidate.assetComponentAllocations as RevenueOpsState['assetComponentAllocations'] : [],
    assetTransferAccountings: storedVersion >= 34 && Array.isArray(candidate.assetTransferAccountings) ? candidate.assetTransferAccountings as RevenueOpsState['assetTransferAccountings'] : [],
    assetSaleDisposals: storedVersion >= 35 && Array.isArray(candidate.assetSaleDisposals) ? candidate.assetSaleDisposals as RevenueOpsState['assetSaleDisposals'] : [],
    assetImpairmentReviews: storedVersion >= 36 && Array.isArray(candidate.assetImpairmentReviews) ? candidate.assetImpairmentReviews as RevenueOpsState['assetImpairmentReviews'] : [],
    assetRevaluations: storedVersion >= 36 && Array.isArray(candidate.assetRevaluations) ? candidate.assetRevaluations as RevenueOpsState['assetRevaluations'] : [],
    assetWarranties: storedVersion >= 36 && Array.isArray(candidate.assetWarranties) ? candidate.assetWarranties as RevenueOpsState['assetWarranties'] : [],
    assetAmcContracts: storedVersion >= 36 && Array.isArray(candidate.assetAmcContracts) ? candidate.assetAmcContracts as RevenueOpsState['assetAmcContracts'] : [],
    assetMeters: storedVersion >= 36 && Array.isArray(candidate.assetMeters) ? candidate.assetMeters as RevenueOpsState['assetMeters'] : [],
    assetMeterReadings: storedVersion >= 36 && Array.isArray(candidate.assetMeterReadings) ? candidate.assetMeterReadings as RevenueOpsState['assetMeterReadings'] : [],
    correctiveMaintenanceRequests: storedVersion >= 36 && Array.isArray(candidate.correctiveMaintenanceRequests) ? candidate.correctiveMaintenanceRequests as RevenueOpsState['correctiveMaintenanceRequests'] : [],
    assetCalibrations: storedVersion >= 36 && Array.isArray(candidate.assetCalibrations) ? candidate.assetCalibrations as RevenueOpsState['assetCalibrations'] : [],
    assetSpareParts: storedVersion >= 36 && Array.isArray(candidate.assetSpareParts) ? candidate.assetSpareParts as RevenueOpsState['assetSpareParts'] : [],
    assetSpareIssues: storedVersion >= 36 && Array.isArray(candidate.assetSpareIssues) ? candidate.assetSpareIssues as RevenueOpsState['assetSpareIssues'] : [],
    fleetVehicles: storedVersion >= 36 && Array.isArray(candidate.fleetVehicles) ? candidate.fleetVehicles as RevenueOpsState['fleetVehicles'] : [],
    fleetTrips: storedVersion >= 36 && Array.isArray(candidate.fleetTrips) ? candidate.fleetTrips as RevenueOpsState['fleetTrips'] : [],
    assetInstalledBaseEvents: storedVersion >= 36 && Array.isArray(candidate.assetInstalledBaseEvents) ? candidate.assetInstalledBaseEvents as RevenueOpsState['assetInstalledBaseEvents'] : [],
    preventiveMaintenancePlans: storedVersion >= 27 && Array.isArray(candidate.preventiveMaintenancePlans) ? candidate.preventiveMaintenancePlans as RevenueOpsState['preventiveMaintenancePlans'] : [],
    maintenanceWorkOrders: storedVersion >= 27 && Array.isArray(candidate.maintenanceWorkOrders) ? candidate.maintenanceWorkOrders as RevenueOpsState['maintenanceWorkOrders'] : [],
    bomRevisions: storedVersion >= 10 ? candidate.bomRevisions as RevenueOpsState['bomRevisions'] : [],
    qualityPlans: storedVersion >= 10 ? candidate.qualityPlans as RevenueOpsState['qualityPlans'] : [],
    workOrders: storedVersion >= 10 ? candidate.workOrders as RevenueOpsState['workOrders'] : [],
    productionMaterialIssues: storedVersion >= 10 ? candidate.productionMaterialIssues as RevenueOpsState['productionMaterialIssues'] : [],
    qualityInspections: storedVersion >= 10 ? candidate.qualityInspections as RevenueOpsState['qualityInspections'] : [],
    nonconformances: storedVersion >= 10 ? candidate.nonconformances as RevenueOpsState['nonconformances'] : [],
    productionOutputs: storedVersion >= 10 ? candidate.productionOutputs as RevenueOpsState['productionOutputs'] : [],
    deliveryProjects: storedVersion >= 11 ? candidate.deliveryProjects as RevenueOpsState['deliveryProjects'] : [],
    projectTasks: storedVersion >= 11 ? candidate.projectTasks as RevenueOpsState['projectTasks'] : [],
    timeEntries: storedVersion >= 11 ? (candidate.timeEntries as RevenueOpsState['timeEntries']).map((entry) => ({ ...entry, hourlyCost: entry.hourlyCost ?? 0, costAmount: entry.costAmount ?? 0 })) : [],
    serviceAgreements: storedVersion >= 11 ? candidate.serviceAgreements as RevenueOpsState['serviceAgreements'] : [],
    supportTickets: storedVersion >= 11 ? candidate.supportTickets as RevenueOpsState['supportTickets'] : [],
    fieldServiceJobs: storedVersion >= 11 ? candidate.fieldServiceJobs as RevenueOpsState['fieldServiceJobs'] : [],
    workforceProfiles: storedVersion >= 12 ? candidate.workforceProfiles as RevenueOpsState['workforceProfiles'] : [],
    workforceAvailabilities: storedVersion >= 12 ? candidate.workforceAvailabilities as RevenueOpsState['workforceAvailabilities'] : [],
    workforceAllocations: storedVersion >= 12 ? candidate.workforceAllocations as RevenueOpsState['workforceAllocations'] : [],
    projectBillingPlans: storedVersion >= 13 ? candidate.projectBillingPlans as RevenueOpsState['projectBillingPlans'] : [],
    projectBillingClaims: storedVersion >= 13 ? candidate.projectBillingClaims as RevenueOpsState['projectBillingClaims'] : [],
    revenueRecognitionEvents: storedVersion >= 13 ? candidate.revenueRecognitionEvents as RevenueOpsState['revenueRecognitionEvents'] : [],
    serviceEntitlementUsage: storedVersion >= 13 ? candidate.serviceEntitlementUsage as RevenueOpsState['serviceEntitlementUsage'] : [],
    accountingClosePeriods: storedVersion >= 13 ? candidate.accountingClosePeriods as RevenueOpsState['accountingClosePeriods'] : [],
    projectExchangeRates: storedVersion >= 17 ? candidate.projectExchangeRates as RevenueOpsState['projectExchangeRates'] : [],
    projectCurrencyProfiles: storedVersion >= 17 ? candidate.projectCurrencyProfiles as RevenueOpsState['projectCurrencyProfiles'] : [],
    projectContractVariations: storedVersion >= 17 ? candidate.projectContractVariations as RevenueOpsState['projectContractVariations'] : [],
    projectRetainers: storedVersion >= 17 ? candidate.projectRetainers as RevenueOpsState['projectRetainers'] : [],
    retainerDrawdowns: storedVersion >= 17 ? candidate.retainerDrawdowns as RevenueOpsState['retainerDrawdowns'] : [],
    projectResourcePlans: storedVersion >= 17 ? candidate.projectResourcePlans as RevenueOpsState['projectResourcePlans'] : [],
    projectMarginReviews: storedVersion >= 17 ? candidate.projectMarginReviews as RevenueOpsState['projectMarginReviews'] : [],
    employerRegistrations: storedVersion >= 14 ? candidate.employerRegistrations as RevenueOpsState['employerRegistrations'] : [],
    payrollPolicies: storedVersion >= 14 ? candidate.payrollPolicies as RevenueOpsState['payrollPolicies'] : [],
    payrollCompensations: storedVersion >= 14 ? candidate.payrollCompensations as RevenueOpsState['payrollCompensations'] : [],
    benefitPlans: storedVersion >= 14 ? candidate.benefitPlans as RevenueOpsState['benefitPlans'] : [],
    benefitEnrollments: storedVersion >= 14 ? candidate.benefitEnrollments as RevenueOpsState['benefitEnrollments'] : [],
    payrollRuns: storedVersion >= 14 ? (candidate.payrollRuns as RevenueOpsState['payrollRuns']).map((run) => ({ ...run, adjustmentIds: run.adjustmentIds ?? [] })) : [],
    payrollSlips: storedVersion >= 14 ? candidate.payrollSlips as RevenueOpsState['payrollSlips'] : [],
    payrollStatutoryObligations: storedVersion >= 14 ? candidate.payrollStatutoryObligations as RevenueOpsState['payrollStatutoryObligations'] : [],
    expenseClaims: storedVersion >= 14 ? candidate.expenseClaims as RevenueOpsState['expenseClaims'] : [],
    attendanceRecords: [],
    leaveTypes: [],
    leaveApplications: [],
    payrollAdjustments: [],
    taxDeclarations: [],
    payslipDeliveries: [],
    providerConnectors: [],
    providerConformanceCases: [],
    providerPreflightEvidence: Array.isArray(candidate.providerPreflightEvidence) ? candidate.providerPreflightEvidence as RevenueOpsState['providerPreflightEvidence'] : [],
    providerSubmissions: [],
    providerReconciliationRuns: [],
  });
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export class RevenueOpsStore {
  private state: RevenueOpsState = createCleanRevenueOpsState();
  private writeQueue: Promise<void> = Promise.resolve();
  private canonicalHandoffPostingResolver?: (draft: AccountingJournalDraft) => boolean;
  private accountingCloseReadinessResolver?: (periodFrom: string, periodTo: string) => {
    status: 'ready' | 'blocked';
    blockers: Array<{ reference: string; detail: string }>;
  };
  private assetBookValueResolver?: (capitalizationId: string) => AssetBookValue | null;

  public constructor(
    private readonly database: BusinessDatabase,
    private readonly crmStore: CrmStore,
    private readonly partyStore: PartyStore,
    private readonly kernelStore: KernelStore,
    private readonly crmDepthStore: CrmDepthStore,
    private readonly statutoryGateway: StatutoryGatewayService,
    private readonly providerGateway: ProviderGatewayService,
  ) {}

  public async initialize(): Promise<void> {
    const stored = this.database.loadState<RevenueOpsState>('revenue-ops-india');
    const upgraded = stored ? upgradeStoredState(stored.payload) : null;
    // A missing operations document is an empty workspace, not a reason to
    // regenerate sample orders, products, invoices, or stock records.
    this.state = withOperatingRecordScopes(upgraded ?? createCleanRevenueOpsState());
    if (!stored || !isRevenueOpsState(stored.payload) || hasUnscopedPhysicalFulfilmentRecords(stored.payload)) await this.persist();
  }

  public getSnapshot(): RevenueOpsSnapshot {
    return getRevenueOpsSnapshot(this.state, this.context());
  }

  /** Returns only cutover plans belonging to the active company and branch. */
  public getRetailCutoverPlans(): RetailCutoverPlan[] {
    return structuredClone((this.state.retailCutoverPlans ?? []).filter((plan) => plan.scope.companyId === this.state.scope.companyId && plan.scope.branchId === this.state.scope.branchId));
  }

    public createRetailCutoverPlan(input: CreateRetailCutoverPlanInput, actorId: string): Promise<RetailCutoverPlan> {
    return this.enqueue(async () => {
      if (input.scope.companyId !== this.state.scope.companyId || input.scope.branchId !== this.state.scope.branchId) throw new Error('Cutover plan scope must match the active company and branch.');
      const plans = this.state.retailCutoverPlans ?? [];
      if (plans.some((plan) => plan.capability === input.capability && plan.scope.companyId === input.scope.companyId && plan.scope.branchId === input.scope.branchId && !['retired', 'rolled-back', 'blocked'].includes(plan.phase))) throw new Error('An active cutover plan already exists for this capability.');
      const plan = createRetailCutoverPlan(input, actorId);
      this.state = withOperatingRecordScopes({ ...this.state, revision: this.state.revision + 1, retailCutoverPlans: [plan, ...plans] });
      await this.persist();
      return structuredClone(plan);
    });
  }

  public advanceRetailCutover(input: AdvanceRetailCutoverInput & { id: string }, actorId: string): Promise<RetailCutoverPlan> {
    return this.enqueue(async () => {
      const plans = this.state.retailCutoverPlans ?? [];
      const current = plans.find((plan) => plan.id === input.id && plan.scope.companyId === this.state.scope.companyId && plan.scope.branchId === this.state.scope.branchId);
      if (!current) throw new Error('Cutover plan was not found in the active company and branch.');
      const next = advanceRetailCutover(current, input, actorId);
      this.state = withOperatingRecordScopes({ ...this.state, revision: this.state.revision + 1, retailCutoverPlans: plans.map((plan) => plan.id === next.id ? next : plan) });
      await this.persist();
      return structuredClone(next);
    });
  }

  public createRetailCutoverPlanFromHubAssessment(input: CreateRetailCutoverPlanFromAssessmentInput, actorId: string): Promise<RetailCutoverPlan> {
    return this.enqueue(async () => {
      if (input.scope.companyId !== this.state.scope.companyId || input.scope.branchId !== this.state.scope.branchId) throw new Error('Cutover assessment scope must match the active company and branch.');
      const plans = this.state.retailCutoverPlans ?? [];
      const capability = input.assessment.capability === 'catalog' || input.assessment.capability === 'inventory'
        ? 'catalog-inventory'
        : input.assessment.capability === 'settlements'
          ? 'finance'
          : input.assessment.capability === 'customers' || input.assessment.capability === 'campaigns' || input.assessment.capability === 'storefront'
            ? 'analytics'
            : input.assessment.capability;
      if (plans.some((plan) => plan.capability === capability && plan.scope.companyId === input.scope.companyId && plan.scope.branchId === input.scope.branchId && !['retired', 'rolled-back', 'blocked'].includes(plan.phase))) throw new Error('An active cutover plan already exists for this capability.');
      const plan = createRetailCutoverPlanFromHubAssessment(input, actorId);
      this.state = withOperatingRecordScopes({ ...this.state, revision: this.state.revision + 1, retailCutoverPlans: [plan, ...plans] });
      await this.persist();
      return structuredClone(plan);
    });
  }

  /**
   * Canonical GL sources are deliberately not rewritten as legacy exports.
   * The ledger injects a narrow, status-only resolver so financial close can
   * accept a source only after its immutable canonical journal is posted.
   */
  public setCanonicalHandoffPostingResolver(
    resolver: (draft: AccountingJournalDraft) => boolean,
  ): void {
    this.canonicalHandoffPostingResolver = resolver;
  }

  /**
   * Injects aggregate-only canonical-book evidence into close approval. The
   * domain close rules remain usable in isolation; the Electron composition
   * root adds the real ledger gate so a close cannot pass with a GL draft.
   */
  public setAccountingCloseReadinessResolver(
    resolver: (periodFrom: string, periodTo: string) => {
      status: 'ready' | 'blocked';
      blockers: Array<{ reference: string; detail: string }>;
    },
  ): void {
    this.accountingCloseReadinessResolver = resolver;
  }

  /** Supplies a narrow, aggregate-only book-value boundary from canonical GL. */
  public setAssetBookValueResolver(
    resolver: (capitalizationId: string) => AssetBookValue | null,
  ): void {
    this.assetBookValueResolver = resolver;
  }

  public getPeopleReadProjection(actorId: string): PeopleReadProjection {
    return this.getPeopleReadProjectionFor(this.state, actorId);
  }

  public projectResponseForActor<T>(response: T, actorId: string): T {
    return normalizeRevenueOpsResponse(response, (snapshot) => (
      applyDeliveryReadProjectionToSnapshot(
        applyProjectFinanceReadProjectionToSnapshot(
          applyAssetMaintenanceReadProjectionToSnapshot(
            applyManufacturingReadProjectionToSnapshot(
            applyStatutoryProviderReadProjectionToSnapshot(
              applySupplyChainReadProjectionToSnapshot(
                applyFinanceReadProjectionToSnapshot(
                  applySalesReadProjectionToSnapshot(
                    applyPeopleReadProjectionToSnapshot(
                    snapshot,
                    this.getPeopleReadProjectionFor(snapshot, actorId),
                    actorId,
                    ),
                    this.getSalesReadProjectionFor(snapshot, actorId),
                    actorId,
                  ),
                  this.getFinanceReadProjectionFor(snapshot, actorId),
                  actorId,
                ),
                this.getSupplyChainReadProjectionFor(snapshot, actorId),
                actorId,
              ),
              this.getStatutoryProviderReadProjectionFor(snapshot, actorId),
              actorId,
            ),
            this.getManufacturingReadProjectionFor(snapshot, actorId),
            actorId,
          ),
          this.getAssetMaintenanceReadProjectionFor(snapshot, actorId),
          actorId,
        ),
          this.getProjectFinanceReadProjectionFor(snapshot, actorId),
          actorId,
        ),
        this.getDeliveryReadProjectionFor(snapshot, actorId),
        actorId,
      )
    ));
  }

  private getPeopleReadProjectionFor(
    source: Parameters<typeof createPeopleReadProjection>[0],
    actorId: string,
  ): PeopleReadProjection {
    const scope = source.scope;
    const branch = this.kernelStore
      .getSnapshot()
      .branches.find(({ id, status }) => id === scope.branchId && status === 'active');
    if (!branch || branch.companyId !== scope.companyId) {
      throw new Error('People read projection references an inactive or mismatched branch.');
    }
    return createPeopleReadProjection(source, (resource) => {
      const decision = this.kernelStore.getAccessDecisionInScope(actorId, scope.companyId, scope.branchId, resource, 'read');
      return { allowed: decision.allowed, deniedFields: decision.deniedFields };
    });
  }

  private getSalesReadProjectionFor(
    source: Parameters<typeof createSalesReadProjection>[0],
    actorId: string,
  ) {
    const scope = source.scope;
    const branch = this.kernelStore.getSnapshot().branches
      .find(({ id, status }) => id === scope.branchId && status === 'active');
    if (!branch || branch.companyId !== scope.companyId) {
      throw new Error('Sales read projection references an inactive or mismatched branch.');
    }
    return createSalesReadProjection(source, (resource) => {
      const decision = this.kernelStore.getAccessDecisionInScope(actorId, scope.companyId, scope.branchId, resource, 'read');
      return { allowed: decision.allowed, deniedFields: decision.deniedFields };
    });
  }

  private getDeliveryReadProjectionFor(
    source: Parameters<typeof createDeliveryReadProjection>[0],
    actorId: string,
  ) {
    const scope = source.scope;
    const branch = this.kernelStore
      .getSnapshot()
      .branches.find(({ id, status }) => id === scope.branchId && status === 'active');
    if (!branch || branch.companyId !== scope.companyId) {
      throw new Error('Delivery read projection references an inactive or mismatched branch.');
    }
    return createDeliveryReadProjection(source, (resource) => {
      const decision = this.kernelStore.getAccessDecisionInScope(actorId, scope.companyId, scope.branchId, resource, 'read');
      return { allowed: decision.allowed, deniedFields: decision.deniedFields };
    });
  }

  private getFinanceReadProjectionFor(
    source: Parameters<typeof createFinanceReadProjection>[0],
    actorId: string,
  ) {
    const scope = source.scope;
    const branch = this.kernelStore
      .getSnapshot()
      .branches.find(({ id, status }) => id === scope.branchId && status === 'active');
    if (!branch || branch.companyId !== scope.companyId) {
      throw new Error('Finance read projection references an inactive or mismatched branch.');
    }
    return createFinanceReadProjection(source, (resource) => {
      const decision = this.kernelStore.getAccessDecisionInScope(actorId, scope.companyId, scope.branchId, resource, 'read');
      return { allowed: decision.allowed, deniedFields: decision.deniedFields };
    });
  }

  private getSupplyChainReadProjectionFor(
    source: Parameters<typeof createSupplyChainReadProjection>[0],
    actorId: string,
  ) {
    const scope = source.scope;
    const branch = this.kernelStore.getSnapshot().branches.find(({ id, status }) => id === scope.branchId && status === 'active');
    if (!branch || branch.companyId !== scope.companyId) throw new Error('Supply-chain read projection references an inactive or mismatched branch.');
    return createSupplyChainReadProjection(source, (resource) => {
      const decision = this.kernelStore.getAccessDecisionInScope(actorId, scope.companyId, scope.branchId, resource, 'read');
      return { allowed: decision.allowed, deniedFields: decision.deniedFields };
    });
  }

  private getStatutoryProviderReadProjectionFor(source: Parameters<typeof createStatutoryProviderReadProjection>[0], actorId: string) {
    const scope = source.scope;
    const branch = this.kernelStore.getSnapshot().branches.find(({ id, status }) => id === scope.branchId && status === 'active');
    if (!branch || branch.companyId !== scope.companyId) throw new Error('Statutory/provider read projection references an inactive or mismatched branch.');
    return createStatutoryProviderReadProjection(source, (resource) => {
      const decision = this.kernelStore.getAccessDecisionInScope(actorId, scope.companyId, scope.branchId, resource, 'read');
      return { allowed: decision.allowed, deniedFields: decision.deniedFields };
    });
  }

  private getManufacturingReadProjectionFor(source: Parameters<typeof createManufacturingReadProjection>[0], actorId: string) {
    const scope = source.scope;
    const branch = this.kernelStore.getSnapshot().branches.find(({ id, status }) => id === scope.branchId && status === 'active');
    if (!branch || branch.companyId !== scope.companyId) throw new Error('Manufacturing read projection references an inactive or mismatched branch.');
    return createManufacturingReadProjection(source, (resource) => {
      const decision = this.kernelStore.getAccessDecisionInScope(actorId, scope.companyId, scope.branchId, resource, 'read');
      return { allowed: decision.allowed, deniedFields: decision.deniedFields };
    });
  }

  private getAssetMaintenanceReadProjectionFor(
    source: Parameters<typeof createAssetMaintenanceReadProjection>[0],
    actorId: string,
  ) {
    const scope = source.scope;
    const branch = this.kernelStore.getSnapshot().branches.find(({ id, status }) => id === scope.branchId && status === 'active');
    if (!branch || branch.companyId !== scope.companyId) {
      throw new Error('Asset-maintenance read projection references an inactive or mismatched branch.');
    }
    return createAssetMaintenanceReadProjection(source, (resource) => {
      const decision = this.kernelStore.getAccessDecisionInScope(actorId, scope.companyId, scope.branchId, resource, 'read');
      return { allowed: decision.allowed, deniedFields: decision.deniedFields };
    });
  }

  private getProjectFinanceReadProjectionFor(source: Parameters<typeof createProjectFinanceReadProjection>[0], actorId: string) {
    const scope = source.scope; const branch = this.kernelStore.getSnapshot().branches.find(({ id, status }) => id === scope.branchId && status === 'active');
    if (!branch || branch.companyId !== scope.companyId) throw new Error('Project-finance read projection references an inactive or mismatched branch.');
    return createProjectFinanceReadProjection(source, (resource) => { const decision = this.kernelStore.getAccessDecisionInScope(actorId, scope.companyId, scope.branchId, resource, 'read'); return { allowed: decision.allowed, deniedFields: decision.deniedFields }; });
  }

  public getAuthorizationScope(): RevenueOperationsScope {
    const scope = this.state.scope;
    if (scope.companyId !== this.crmDepthStore.getCompanyId()) {
      throw new Error('Revenue Operations scope does not match CRM and Party Master data. Resolve the data scope before continuing.');
    }
    const branch = this.kernelStore
      .getSnapshot()
      .branches.find(({ id, status }) => id === scope.branchId && status === 'active');
    if (!branch || branch.companyId !== scope.companyId) {
      throw new Error('Revenue Operations scope references an inactive or mismatched branch. Resolve the data scope before continuing.');
    }
    return { ...scope };
  }

  public getCommercialRecordAuthorizationScope(
    kind: 'quote' | 'quote-approval' | 'sales-order' | 'fulfilment-task' |
      'service-milestone' | 'invoice' | 'payment-receipt' | 'receivable',
    id: string,
  ): RevenueOperationsScope {
    const quoteForApproval = this.state.quoteApprovalRequests.find((request) => request.id === id);
    const task = this.state.fulfilmentTasks.find((candidate) => candidate.id === id);
    const milestone = this.state.serviceMilestones.find((candidate) => candidate.id === id);
    const record = kind === 'quote'
      ? this.state.quotes.find((quote) => quote.id === id)
      : kind === 'quote-approval'
        ? this.state.quotes.find((quote) => quote.id === quoteForApproval?.quoteId)
        : kind === 'sales-order'
          ? this.state.salesOrders.find((order) => order.id === id)
          : kind === 'fulfilment-task'
            ? this.state.salesOrders.find((order) => order.id === task?.salesOrderId)
            : kind === 'service-milestone'
              ? this.state.salesOrders.find((order) => order.id === milestone?.salesOrderId)
              : kind === 'invoice'
                ? this.state.invoices.find((invoice) => invoice.id === id)
                : kind === 'payment-receipt'
                  ? this.state.paymentReceipts.find((receipt) => receipt.id === id)
                  : this.state.receivables.find((receivable) => receivable.id === id);
    if (!record) throw new Error('The commercial record was not found. Refresh and retry.');
    if (!isRevenueOperationsScope(record.scope)) {
      throw new Error('The commercial record is missing its record scope. Refresh and retry.');
    }
    const stateScope = this.getAuthorizationScope();
    if (
      record.scope.companyId !== stateScope.companyId ||
      record.scope.branchId !== stateScope.branchId
    ) {
      throw new Error('The commercial record scope does not match the active operating state.');
    }
    return { ...record.scope };
  }

  /**
   * Physical fulfilment evidence is authorised at its own record boundary.
   * The state has one active operating scope, but this explicit resolver
   * prevents an identifier from being used to cross a retained foreign scope
   * before a domain mutator or a read projection gets involved.
   */
  public getPhysicalFulfilmentRecordAuthorizationScope(
    kind: 'stock-location' | 'stock-position' | 'stock-movement' | 'stock-reservation' |
      'shipment-package' | 'shipment-event' | 'carrier-adapter' | 'delivery-promise' | 'return-authorization',
    id: string,
  ): RevenueOperationsScope {
    const record = kind === 'stock-location'
      ? this.state.stockLocations.find((candidate) => candidate.id === id)
      : kind === 'stock-position'
        ? this.state.stockPositions.find((candidate) => candidate.id === id)
        : kind === 'stock-movement'
          ? this.state.stockMovements.find((candidate) => candidate.id === id)
          : kind === 'stock-reservation'
            ? this.state.stockReservations.find((candidate) => candidate.id === id)
            : kind === 'shipment-package'
              ? this.state.shipmentPackages.find((candidate) => candidate.id === id)
              : kind === 'shipment-event'
                ? this.state.shipmentEvents.find((candidate) => candidate.id === id)
                : kind === 'carrier-adapter'
                  ? this.state.carrierAdapters.find((candidate) => candidate.id === id)
                  : kind === 'delivery-promise'
                    ? this.state.deliveryPromises.find((candidate) => candidate.id === id)
                    : this.state.returnAuthorizations.find((candidate) => candidate.id === id);
    if (!record || !isRevenueOperationsScope(record.scope)) {
      throw new Error('The physical fulfilment record is unavailable or missing its record scope. Refresh and retry.');
    }
    const stateScope = this.getAuthorizationScope();
    if (record.scope.companyId !== stateScope.companyId || record.scope.branchId !== stateScope.branchId) {
      throw new Error('The physical fulfilment record scope does not match the active operating state.');
    }
    return { ...record.scope };
  }

  /**
   * COD custody is a dual physical/finance record. Resolve it independently
   * before each IPC command so an identifier cannot be replayed against a
   * retained foreign company or branch.
   */
  public getCodCollectionCaseAuthorizationScope(id: string): RevenueOperationsScope {
    const record = this.state.codCollectionCases.find((candidate) => candidate.id === id);
    if (!record || !isRevenueOperationsScope(record.scope)) {
      throw new Error('The COD custody case is unavailable or missing its record scope. Refresh and retry.');
    }
    const stateScope = this.getAuthorizationScope();
    if (record.scope.companyId !== stateScope.companyId || record.scope.branchId !== stateScope.branchId) {
      throw new Error('The COD custody case scope does not match the active operating state.');
    }
    return { ...record.scope };
  }

  /**
   * Accounting handoffs do not own a scope themselves. Resolve their scope
   * from the governed operational evidence before an export or handoff action
   * is authorised. New journal kinds must be added here deliberately rather
   * than silently falling back to the broad active workspace.
   */
  public getJournalDraftAuthorizationScope(id: string): RevenueOperationsScope {
    const draft = this.state.journalDrafts.find((candidate) => candidate.id === id);
    if (!draft) {
      throw new Error('The accounting journal handoff was not found. Refresh and retry.');
    }

    switch (draft.sourceType) {
      case 'invoice':
        return this.getCommercialRecordAuthorizationScope('invoice', draft.sourceId);
      case 'credit-note':
      case 'debit-note': {
        const note = this.state.creditDebitNotes.find((candidate) => candidate.id === draft.sourceId);
        if (!note || !isRevenueOperationsScope(note.scope)) {
          throw new Error('The commercial adjustment is unavailable or missing its record scope. Refresh and retry.');
        }
        const invoiceScope = this.getCommercialRecordAuthorizationScope('invoice', note.invoiceId);
        if (
          note.scope.companyId !== invoiceScope.companyId ||
          note.scope.branchId !== invoiceScope.branchId
        ) {
          throw new Error('The commercial adjustment scope does not match its issued invoice. Refresh and retry.');
        }
        return invoiceScope;
      }
      case 'payment':
        return this.getCommercialRecordAuthorizationScope('payment-receipt', draft.sourceId);
      case 'retail-sale-cost':
        return this.getRetailPosRecordAuthorizationScope('sale', draft.sourceId);
      case 'retail-return-cost':
      case 'retail-return-settlement':
        return this.getRetailPosRecordAuthorizationScope('return', draft.sourceId);
      case 'retail-commerce-settlement':
        return this.getRetailCommerceSettlementAuthorizationScope(draft.sourceId);
      case 'retail-commission-payout': {
        const batch = this.state.retailCommissionPayoutBatches.find((candidate) => candidate.id === draft.sourceId);
        if (!batch || !isRevenueOperationsScope(batch.scope)) throw new Error('Retail commission payout is unavailable or missing its record scope. Refresh and retry.');
        const stateScope = this.getAuthorizationScope();
        if (batch.scope.companyId !== stateScope.companyId || batch.scope.branchId !== stateScope.branchId) throw new Error('Retail commission payout scope does not match the active operating state.');
        return { ...batch.scope };
      }
      case 'retail-inter-branch-transfer':
        return this.getRetailPosRecordAuthorizationScope('inter-branch-transfer', draft.sourceId);
      case 'retail-cashier-variance':
        return this.getRetailPosRecordAuthorizationScope('cashier-shift', draft.sourceId);
      case 'supplier-invoice':
        return this.getProcurementRecordAuthorizationScope('three-way-match', draft.sourceId);
      case 'asset-capitalization':
        return this.getAssetMaintenanceRecordAuthorizationScope('asset-capitalization', draft.sourceId);
      case 'asset-depreciation':
        return this.getAssetMaintenanceRecordAuthorizationScope('asset-depreciation-run', draft.sourceId);
      case 'asset-retirement':
        return this.getAssetMaintenanceRecordAuthorizationScope('asset-retirement', draft.sourceId);
      case 'asset-transfer':
        return this.getAssetMaintenanceRecordAuthorizationScope('asset-transfer-accounting', draft.sourceId);
      case 'asset-sale-disposal':
        return this.getAssetMaintenanceRecordAuthorizationScope('asset-sale-disposal', draft.sourceId);
      case 'asset-impairment':
        return this.getAssetMaintenanceRecordAuthorizationScope('asset-impairment', draft.sourceId);
      case 'asset-revaluation':
        return this.getAssetMaintenanceRecordAuthorizationScope('asset-revaluation', draft.sourceId);
      case 'landed-cost':
        return this.getProcurementRecordAuthorizationScope('landed-cost', draft.sourceId);
      case 'production-issue':
        return this.getManufacturingRecordAuthorizationScope('material-issue', draft.sourceId);
      case 'production-output':
        return this.getManufacturingRecordAuthorizationScope('production-output', draft.sourceId);
      case 'payroll-finalization':
      case 'expense-reimbursement':
        return this.getWorkforcePayrollRecordAuthorizationScope(draft.sourceId);
      case 'write-off':
      case 'withholding':
      case 'treasury-payment':
      case 'bank-charge':
      case 'liquidity-sweep-release':
      case 'liquidity-sweep-settlement':
      case 'revenue-recognition':
        return this.getFinanceControlRecordAuthorizationScope(draft.sourceId);
    }
  }

  public getRetailCommerceSettlementAuthorizationScope(id: string): RevenueOperationsScope {
    const settlement = this.state.retailSettlementReconciliations.find((candidate) => candidate.id === id);
    if (!settlement || !isRevenueOperationsScope(settlement.scope)) throw new Error('Marketplace settlement is unavailable or missing its record scope. Refresh and retry.');
    const stateScope = this.getAuthorizationScope();
    if (settlement.scope.companyId !== stateScope.companyId || settlement.scope.branchId !== stateScope.branchId) throw new Error('Marketplace settlement scope does not match the active operating state.');
    return { ...settlement.scope };
  }

  public getPaymentCaptureAuthorizationScope(receivableIds: string[]): RevenueOperationsScope {
    const uniqueIds = [...new Set(receivableIds)];
    if (uniqueIds.length === 0) return this.getAuthorizationScope();
    const scopes = uniqueIds.map((id) => this.getCommercialRecordAuthorizationScope('receivable', id));
    const receiptScope = scopes[0]!;
    if (scopes.some((scope) => scope.companyId !== receiptScope.companyId || scope.branchId !== receiptScope.branchId)) {
      throw new Error('Payment allocations must belong to one company and branch scope.');
    }
    return { ...receiptScope };
  }

  /**
   * Resolve the receipt and every target receivable before authorising an
   * unapplied-cash application. This prevents a broad workspace grant from
   * silently crossing a company, branch, or customer-account boundary.
   */
  public getUnappliedReceiptApplicationAuthorizationScope(
    receiptId: string,
    receivableIds: string[],
  ): RevenueOperationsScope {
    const receipt = this.state.paymentReceipts.find((candidate) => candidate.id === receiptId);
    if (!receipt) throw new Error('Payment receipt not found.');
    const receiptScope = this.getCommercialRecordAuthorizationScope('payment-receipt', receiptId);
    const uniqueReceivableIds = [...new Set(receivableIds)];
    if (uniqueReceivableIds.length === 0) throw new Error('At least one receivable is required for a cash application.');
    const receivables = uniqueReceivableIds.map((id) => this.state.receivables.find((candidate) => candidate.id === id));
    if (receivables.some((item) => !item)) throw new Error('Receivable not found.');
    if (receivables.some((item) => item!.accountId !== receipt.accountId)) {
      throw new Error('Cash applications must stay within the payment receipt customer account.');
    }
    const scopes = uniqueReceivableIds.map((id) => this.getCommercialRecordAuthorizationScope('receivable', id));
    if (scopes.some((scope) => scope.companyId !== receiptScope.companyId || scope.branchId !== receiptScope.branchId)) {
      throw new Error('Cash applications must stay within the payment receipt company and branch scope.');
    }
    return { ...receiptScope };
  }

  public getInventoryRecordAuthorizationScope(
    kind: 'uom' | 'inventory-item' | 'item-variant' | 'warehouse' | 'warehouse-zone' |
      'storage-bin' | 'warehouse-task' | 'inventory-transfer' | 'cycle-count' |
      'reorder-policy' | 'reorder-proposal' | 'valuation-review' | 'inventory-disposition',
    id: string,
  ): RevenueOperationsScope {
    const record = kind === 'uom'
      ? this.state.uoms.find((candidate) => candidate.id === id)
      : kind === 'inventory-item'
        ? this.state.inventoryItems.find((candidate) => candidate.id === id)
        : kind === 'item-variant'
          ? this.state.itemVariants.find((candidate) => candidate.id === id)
          : kind === 'warehouse'
            ? this.state.warehouses.find((candidate) => candidate.id === id)
            : kind === 'warehouse-zone'
              ? this.state.warehouseZones.find((candidate) => candidate.id === id)
              : kind === 'storage-bin'
                ? this.state.storageBins.find((candidate) => candidate.id === id)
                : kind === 'warehouse-task'
                  ? this.state.warehouseTasks.find((candidate) => candidate.id === id)
                  : kind === 'inventory-transfer'
                    ? this.state.inventoryTransfers.find((candidate) => candidate.id === id)
                    : kind === 'cycle-count'
                      ? this.state.cycleCountPlans.find((candidate) => candidate.id === id)
                      : kind === 'reorder-policy'
                        ? this.state.reorderPolicies.find((candidate) => candidate.id === id)
                        : kind === 'reorder-proposal'
                        ? this.state.reorderProposals.find((candidate) => candidate.id === id)
                        : kind === 'valuation-review'
                          ? this.state.inventoryValuationReviews.find((candidate) => candidate.id === id)
                          : this.state.inventoryDispositions.find((candidate) => candidate.id === id);
    if (!record) throw new Error('The inventory record was not found. Refresh and retry.');
    if (!isRevenueOperationsScope(record.scope)) {
      throw new Error('The inventory record is missing its record scope. Refresh and retry.');
    }
    const stateScope = this.getAuthorizationScope();
    if (record.scope.companyId !== stateScope.companyId || record.scope.branchId !== stateScope.branchId) {
      throw new Error('The inventory record scope does not match the active operating state.');
    }
    return { ...record.scope };
  }

  /** Retail POS records carry their own operating scope and cannot be reached through a broad sales grant. */
  public getRetailPosRecordAuthorizationScope(
    kind: 'counter' | 'cashier-shift' | 'sale' | 'return' | 'exchange' | 'credit-note-reconciliation' | 'inter-branch-transfer',
    id: string,
  ): RevenueOperationsScope {
    const record = kind === 'counter'
      ? this.state.retailCounters.find((candidate) => candidate.id === id)
      : kind === 'cashier-shift'
        ? this.state.retailCashierShifts.find((candidate) => candidate.id === id)
        : kind === 'sale'
          ? this.state.retailSales.find((candidate) => candidate.id === id)
          : kind === 'return'
            ? this.state.retailReturns.find((candidate) => candidate.id === id)
            : kind === 'exchange'
              ? this.state.retailExchanges.find((candidate) => candidate.id === id)
              : kind === 'credit-note-reconciliation'
                ? this.state.retailCreditNoteReconciliations.find((candidate) => candidate.id === id)
                : this.state.retailInterBranchTransfers.find((candidate) => candidate.id === id);
    if (!record || !isRevenueOperationsScope(record.scope)) {
      throw new Error('The retail POS record is unavailable or missing its record scope. Refresh and retry.');
    }
    const stateScope = this.getAuthorizationScope();
    if (record.scope.companyId !== stateScope.companyId || record.scope.branchId !== stateScope.branchId) {
      throw new Error('The retail POS record scope does not match the active operating state.');
    }
    return { ...record.scope };
  }

  public getInventoryTransferAuthorizationScope(warehouseIds: string[]): RevenueOperationsScope {
    const scopes = [...new Set(warehouseIds)].map((id) => this.getInventoryRecordAuthorizationScope('warehouse', id));
    const scope = scopes[0] ?? this.getAuthorizationScope();
    if (scopes.some((candidate) => candidate.companyId !== scope.companyId || candidate.branchId !== scope.branchId)) {
      throw new Error('Inventory transfer warehouses must belong to one company and branch scope.');
    }
    return { ...scope };
  }

  public getProcurementRecordAuthorizationScope(
    kind: 'purchase-requisition' | 'supplier' | 'rfq' | 'supplier-quotation' | 'purchase-order' | 'goods-receipt' |
      'landed-cost' | 'supplier-invoice' | 'three-way-match',
    id: string,
  ): RevenueOperationsScope {
    const record = kind === 'purchase-requisition'
      ? this.state.purchaseRequisitions.find((candidate) => candidate.id === id)
      : kind === 'supplier'
      ? this.state.suppliers.find((candidate) => candidate.id === id)
      : kind === 'rfq'
        ? this.state.requestForQuotations.find((candidate) => candidate.id === id)
        : kind === 'supplier-quotation'
          ? this.state.supplierQuotations.find((candidate) => candidate.id === id)
          : kind === 'purchase-order'
            ? this.state.purchaseOrders.find((candidate) => candidate.id === id)
            : kind === 'goods-receipt'
              ? this.state.goodsReceipts.find((candidate) => candidate.id === id)
              : kind === 'landed-cost'
                ? this.state.landedCostAllocations.find((candidate) => candidate.id === id)
                : kind === 'supplier-invoice'
                  ? this.state.supplierInvoices.find((candidate) => candidate.id === id)
                  : this.state.threeWayMatches.find((candidate) => candidate.id === id);
    if (!record) throw new Error('The procurement record was not found. Refresh and retry.');
    if (!isRevenueOperationsScope(record.scope)) {
      throw new Error('The procurement record is missing its record scope. Refresh and retry.');
    }
    const stateScope = this.getAuthorizationScope();
    if (record.scope.companyId !== stateScope.companyId || record.scope.branchId !== stateScope.branchId) {
      throw new Error('The procurement record scope does not match the active operating state.');
    }
    return { ...record.scope };
  }

  public getManufacturingRecordAuthorizationScope(
    kind: 'work-center' | 'bom' | 'quality-plan' | 'work-order' | 'material-issue' |
      'inspection' | 'nonconformance' | 'production-output',
    id: string,
  ): RevenueOperationsScope {
    const record = kind === 'work-center' ? this.state.workCenters.find((item) => item.id === id)
      : kind === 'bom' ? this.state.bomRevisions.find((item) => item.id === id)
        : kind === 'quality-plan' ? this.state.qualityPlans.find((item) => item.id === id)
          : kind === 'work-order' ? this.state.workOrders.find((item) => item.id === id)
            : kind === 'material-issue' ? this.state.productionMaterialIssues.find((item) => item.id === id)
              : kind === 'inspection' ? this.state.qualityInspections.find((item) => item.id === id)
                : kind === 'nonconformance' ? this.state.nonconformances.find((item) => item.id === id)
                  : this.state.productionOutputs.find((item) => item.id === id);
    if (!record || !isRevenueOperationsScope(record.scope)) throw new Error('The manufacturing record is unavailable or missing its record scope. Refresh and retry.');
    const stateScope = this.getAuthorizationScope();
    if (record.scope.companyId !== stateScope.companyId || record.scope.branchId !== stateScope.branchId) throw new Error('The manufacturing record scope does not match the active operating state.');
    return { ...record.scope };
  }

  /**
   * Installed assets have their own record boundary: the physical register
   * and maintenance evidence are deliberately not inferred from inventory
   * serials or finance journals. This keeps later capitalisation work from
   * weakening current operational custody controls.
   */
  public getAssetMaintenanceRecordAuthorizationScope(
    kind: 'asset-category' | 'managed-asset' | 'asset-capitalization' | 'asset-depreciation-policy' | 'asset-depreciation-run' | 'asset-retirement' | 'asset-custody-transfer' | 'asset-componentization' | 'asset-component-allocation' | 'asset-transfer-accounting' | 'asset-sale-disposal' | 'asset-impairment' | 'asset-revaluation' | 'maintenance-plan' | 'maintenance-work-order',
    id: string,
  ): RevenueOperationsScope {
    const record = kind === 'asset-category'
      ? this.state.assetCategories.find((item) => item.id === id)
      : kind === 'managed-asset'
        ? this.state.managedAssets.find((item) => item.id === id)
        : kind === 'asset-capitalization'
          ? this.state.assetCapitalizations.find((item) => item.id === id)
          : kind === 'asset-depreciation-policy'
            ? this.state.assetDepreciationPolicies.find((item) => item.id === id)
            : kind === 'asset-depreciation-run'
              ? this.state.assetDepreciationRuns.find((item) => item.id === id)
              : kind === 'asset-retirement'
                ? this.state.assetRetirements.find((item) => item.id === id)
                : kind === 'asset-custody-transfer'
                  ? this.state.assetCustodyTransfers.find((item) => item.id === id)
                  : kind === 'asset-componentization'
                    ? this.state.assetComponentizations.find((item) => item.id === id)
                    : kind === 'asset-component-allocation'
                      ? this.state.assetComponentAllocations.find((item) => item.id === id)
                      : kind === 'asset-transfer-accounting'
                        ? this.state.assetTransferAccountings.find((item) => item.id === id)
                        : kind === 'asset-sale-disposal'
                          ? this.state.assetSaleDisposals.find((item) => item.id === id)
                          : kind === 'asset-impairment'
                            ? this.state.assetImpairmentReviews.find((item) => item.id === id)
                            : kind === 'asset-revaluation'
                              ? this.state.assetRevaluations.find((item) => item.id === id)
          : kind === 'maintenance-plan'
          ? this.state.preventiveMaintenancePlans.find((item) => item.id === id)
          : this.state.maintenanceWorkOrders.find((item) => item.id === id);
    if (!record || !isRevenueOperationsScope(record.scope)) {
      throw new Error('The installed-asset or maintenance record is unavailable or missing its record scope. Refresh and retry.');
    }
    const stateScope = this.getAuthorizationScope();
    if (record.scope.companyId !== stateScope.companyId || record.scope.branchId !== stateScope.branchId) {
      throw new Error('The installed-asset or maintenance record scope does not match the active operating state.');
    }
    return { ...record.scope };
  }

  public getWorkforcePayrollRecordAuthorizationScope(id: string): RevenueOperationsScope {
    const record = [
      ...this.state.workforceProfiles, ...this.state.workforceAvailabilities, ...this.state.workforceAllocations,
      ...this.state.employerRegistrations, ...this.state.payrollPolicies, ...this.state.payrollCompensations,
      ...this.state.benefitPlans, ...this.state.benefitEnrollments, ...this.state.payrollRuns, ...this.state.payrollSlips,
      ...this.state.payrollStatutoryObligations, ...this.state.expenseClaims, ...this.state.attendanceRecords,
      ...this.state.leaveTypes, ...this.state.leaveApplications, ...this.state.payrollAdjustments,
      ...this.state.taxDeclarations, ...this.state.payslipDeliveries,
    ].find((item) => item.id === id);
    if (!record || !isRevenueOperationsScope(record.scope)) throw new Error('The workforce or payroll record is unavailable or missing its record scope. Refresh and retry.');
    const stateScope = this.getAuthorizationScope();
    if (record.scope.companyId !== stateScope.companyId || record.scope.branchId !== stateScope.branchId) throw new Error('The workforce or payroll record scope does not match the active operating state.');
    return { ...record.scope };
  }

  public getDeliveryRecordAuthorizationScope(
    kind: 'project' | 'task' | 'time-entry' | 'service-agreement' | 'support-ticket' | 'field-service-job',
    id: string,
  ): RevenueOperationsScope {
    const record = kind === 'project' ? this.state.deliveryProjects.find((item) => item.id === id)
      : kind === 'task' ? this.state.projectTasks.find((item) => item.id === id)
        : kind === 'time-entry' ? this.state.timeEntries.find((item) => item.id === id)
          : kind === 'service-agreement' ? this.state.serviceAgreements.find((item) => item.id === id)
            : kind === 'support-ticket' ? this.state.supportTickets.find((item) => item.id === id)
              : this.state.fieldServiceJobs.find((item) => item.id === id);
    if (!record || !isRevenueOperationsScope(record.scope)) throw new Error('The delivery or service record is unavailable or missing its record scope. Refresh and retry.');
    const stateScope = this.getAuthorizationScope();
    if (record.scope.companyId !== stateScope.companyId || record.scope.branchId !== stateScope.branchId) throw new Error('The delivery or service record scope does not match the active operating state.');
    return { ...record.scope };
  }

  public getFinanceControlRecordAuthorizationScope(id: string): RevenueOperationsScope {
    const record = [
      ...this.state.creditLimitControls, ...this.state.dunningCases, ...this.state.collectionActivities,
      ...this.state.receivableDisputes, ...this.state.writeOffRequests, ...this.state.withholdingPolicies,
      ...this.state.withholdingEntries, ...this.state.zeroRatedSupplyReviews, ...this.state.bankAccounts,
      ...this.state.bankStatementImports, ...this.state.bankStatementLines, ...this.state.treasuryPositions,
      ...this.state.cashForecastRuns, ...this.state.paymentProposals, ...this.state.bankCharges,
      ...this.state.settlementExceptions, ...this.state.liquiditySweeps, ...this.state.projectBillingPlans,
      ...this.state.projectBillingClaims, ...this.state.revenueRecognitionEvents, ...this.state.serviceEntitlementUsage,
      ...this.state.accountingClosePeriods, ...this.state.projectExchangeRates, ...this.state.projectCurrencyProfiles,
      ...this.state.projectContractVariations, ...this.state.projectRetainers, ...this.state.retainerDrawdowns,
      ...this.state.projectResourcePlans, ...this.state.projectMarginReviews,
    ].find((item) => item.id === id);
    if (!record || !isRevenueOperationsScope(record.scope)) throw new Error('The finance-control record is unavailable or missing its record scope. Refresh and retry.');
    const stateScope = this.getAuthorizationScope();
    if (record.scope.companyId !== stateScope.companyId || record.scope.branchId !== stateScope.branchId) throw new Error('The finance-control record scope does not match the active operating state.');
    return { ...record.scope };
  }

  public getStatutoryProviderRecordAuthorizationScope(id: string): RevenueOperationsScope {
    const record = [
      ...this.state.statutoryExchanges, ...this.state.statutoryAdapters, ...this.state.statutoryOperations,
      ...this.state.consolidatedEwayBills, ...this.state.digitalSignatureEvidence, ...this.state.portalReconciliationRuns,
      ...this.state.providerConnectors, ...this.state.providerConformanceCases, ...this.state.providerSubmissions,
      ...this.state.providerReconciliationRuns,
    ].find((item) => item.id === id);
    if (!record || !isRevenueOperationsScope(record.scope)) throw new Error('The statutory or provider record is unavailable or missing its record scope. Refresh and retry.');
    const stateScope = this.getAuthorizationScope();
    if (record.scope.companyId !== stateScope.companyId || record.scope.branchId !== stateScope.branchId) throw new Error('The statutory or provider record scope does not match the active operating state.');
    return { ...record.scope };
  }

  public getDocumentAuthorizationScope(
    kind: 'quote' | 'invoice',
    id: string,
  ): RevenueOperationsScope {
    return this.getCommercialRecordAuthorizationScope(kind, id);
  }

  public updateProfile(input: UpdateIndiaProfileInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => updateIndiaProfile(state, input));
  }

  public addTerritory(input: CreateTerritoryInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createTerritory(state, input, this.context().activeUserIds));
  }

  public addAssignmentRule(input: CreateAssignmentRuleInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createAssignmentRule(state, input, this.context().activeUserIds));
  }

  public bulkAssign(input: BulkAssignInput): Promise<OpportunityCreationResult> {
    return this.enqueue(async () => {
      const context = this.context();
      const user = this.kernelStore.getSnapshot().users.find(({ id, status }) => id === input.assigneeUserId && status === 'active');
      if (!user) throw new Error('Assignee must be an active user.');
      const planned = bulkAssignOpportunities(this.state, input, context);
      const crm = await this.crmStore.bulkAssignOpportunities(input.opportunityIds, input.expectedVersions, input.territoryId, { id: user.id, name: user.displayName, initials: initials(user.displayName), color: '#dc6d2e' });
      this.state = planned;
      await this.persist();
      return { crm, revenue: this.getSnapshot() };
    });
  }

  public addSegment(input: CreateAudienceSegmentInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createAudienceSegment(state, input));
  }

  public createQuote(input: CreateQuoteInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createQuote(state, input, this.context(), actorId));
  }

  public moveQuote(input: TransitionQuoteInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => transitionQuote(state, input));
  }

  public addGstTaxCode(input: CreateGstTaxCodeInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createGstTaxCode(state, input));
  }

  public addCatalogProduct(input: CreateCatalogProductInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createCatalogProduct(state, input));
  }

  public importRetailProductPack(input: ImportRetailProductPackInput, makerId: string): Promise<RevenueOpsSnapshot> {
    return this.enqueue(async () => {
      const checker = this.kernelStore.getSnapshot().users.find(({ id, status }) => id === input.checkerId && status === 'active');
      if (!checker) throw new Error('Product import checker must be an active user.');
      const report = validateRetailProductImport(input.csv, this.state.products.map(({ sku }) => sku));
      const plan = prepareRetailProductImport(this.state, report, input.now ?? new Date().toISOString());
      if (plan.expectedRevision !== input.expectedRevision) throw new Error('The catalog changed after this import was prepared. Re-validate the pack.');
      const executed = executeRetailProductImport(this.state, { plan, makerId, checkerId: checker.id, evidenceReference: input.evidenceReference, now: input.now });
      this.state = withOperatingRecordScopes(executed.state);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public addPriceList(input: CreatePriceListInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createPriceList(state, input));
  }

  public addPriceListEntry(input: CreatePriceListEntryInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createPriceListEntry(state, input));
  }

  public addDiscountPolicy(input: CreateDiscountPolicyInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createDiscountPolicy(state, input));
  }

  public submitPriceList(input: SubmitPriceListForApprovalInput, actorId: string): Promise<RevenueOpsSnapshot> {
    const approvers = this.kernelStore.getSnapshot().users.filter(({ status, roleIds }) => status === 'active' && roleIds.includes('role-finance-approver')).map(({ id }) => id);
    return this.mutate((state) => submitPriceListForApproval(state, input, actorId, approvers));
  }

  public decidePriceList(input: DecidePriceListApprovalInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decidePriceListApproval(state, input, actorId));
  }

  public submitQuote(input: SubmitQuoteForApprovalInput, actorId: string): Promise<RevenueOpsSnapshot> {
    const approvers = this.kernelStore.getSnapshot().users.filter(({ status, roleIds }) => status === 'active' && roleIds.includes('role-finance-approver')).map(({ id }) => id);
    return this.mutate((state) => submitQuoteForApproval(state, input, actorId, approvers));
  }

  public decideQuote(input: DecideQuoteApprovalInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decideQuoteApproval(state, input, actorId));
  }

  public convertQuote(input: ConvertQuoteToSalesOrderInput, actorId: string): Promise<RevenueOpsSnapshot> {
    const ownerUserId = this.state.assignments.find(({ opportunityId }) => opportunityId === this.state.quotes.find(({ id }) => id === input.quoteId)?.opportunityId)?.assigneeUserId ?? actorId;
    return this.mutate((state) => convertQuoteToSalesOrder(state, input, actorId, ownerUserId));
  }

  public moveSalesOrder(input: TransitionSalesOrderInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => transitionSalesOrder(state, input));
  }

  public moveFulfilmentTask(input: UpdateFulfilmentTaskInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => updateFulfilmentTask(state, input));
  }

  public getQuoteBundle(quoteId: string) {
    const quote = this.state.quotes.find(({ id }) => id === quoteId);
    if (!quote) throw new Error('Quotation not found.');
    const party = this.partyStore.getSnapshot();
    return {
      quote: structuredClone(quote),
      profile: structuredClone(this.state.profile),
      account: structuredClone(party.accounts.find(({ id }) => id === quote.accountId)),
      contact: structuredClone(party.contacts.find(({ id }) => id === quote.contactId)),
      taxCodes: structuredClone(this.state.taxCodes.filter(({ id }) => quote.lines.some(({ taxCodeId }) => taxCodeId === id))),
    };
  }

  public recordQuotePdf(receipt: QuoteDocumentReceipt): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordQuoteDocument(state, receipt));
  }

  public addPaymentTerm(input: CreatePaymentTermInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createPaymentTerm(state, input));
  }

  public addDeliveryEvidence(input: RecordDeliveryEvidenceInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordDeliveryEvidence(state, input, actorId));
  }

  public addServiceMilestone(input: CreateServiceMilestoneInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createServiceMilestone(state, input));
  }

  public moveServiceMilestone(input: TransitionServiceMilestoneInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => transitionServiceMilestone(state, input));
  }

  public addInvoiceDraft(input: CreateInvoiceDraftInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createInvoiceDraft(state, input, actorId));
  }

  public issueInvoice(input: IssueInvoiceInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Invoice issue');
    return this.mutate((state) => issueInvoice(state, input, actorId));
  }

  public addCreditDebitNote(input: CreateCreditDebitNoteInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createCreditDebitNote(state, input, actorId));
  }

  public addPayment(input: RecordPaymentInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordPayment(state, input, actorId));
  }

  public applyUnappliedReceipt(input: ApplyUnappliedReceiptInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => applyUnappliedReceipt(state, input, actorId));
  }

  public reconcilePayment(input: ReconcilePaymentInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => reconcilePayment(state, input, actorId));
  }

  public exportJournal(input: ExportJournalInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => exportJournal(state, input, actorId));
  }

  public getInvoiceBundle(invoiceId: string) {
    const invoice = this.state.invoices.find(({ id }) => id === invoiceId);
    if (!invoice) throw new Error('Invoice not found.');
    const party = this.partyStore.getSnapshot();
    return {
      invoice: structuredClone(invoice),
      profile: structuredClone(this.state.profile),
      bankAccount: structuredClone(this.state.bankAccounts.find(({ id, active }) => id === this.state.profile.primaryBankAccountId && active)),
      account: structuredClone(party.accounts.find(({ id }) => id === invoice.accountId)),
      contact: structuredClone(party.contacts.find(({ id }) => id === invoice.contactId)),
      paymentTerm: structuredClone(this.state.paymentTerms.find(({ id }) => id === invoice.paymentTermId)),
      receivable: structuredClone(this.state.receivables.find(({ invoiceId: id }) => id === invoice.id)),
    };
  }

  public recordInvoicePdf(receipt: InvoiceDocumentReceipt): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordInvoiceDocument(state, receipt));
  }

  public addGstRegistration(input: CreateGstRegistrationInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createGstRegistration(state, input)); }
  public addPlaceOfSupplyReview(input: CreatePlaceOfSupplyReviewInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createPlaceOfSupplyReview(state, input, actorId)); }
  public decidePlaceOfSupplyReview(input: DecidePlaceOfSupplyReviewInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Place-of-supply decision');
    return this.mutate((state) => decidePlaceOfSupplyReview(state, input, actorId));
  }
  public addStockLocation(input: CreateStockLocationInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createStockLocation(state, input)); }
  public addStockMovement(input: RecordStockMovementInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => recordStockMovement(state, input, actorId)); }
  public reserveStock(input: ReserveStockInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => reserveStock(state, input, actorId)); }
  public releaseStockReservation(input: ReleaseStockReservationInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => releaseStockReservation(state, input, actorId)); }
  public addPincodeServiceabilityRule(input: CreatePincodeServiceabilityRuleInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createPincodeServiceabilityRule(state, input, actorId));
  }
  public decidePincodeServiceabilityRule(input: DecidePincodeServiceabilityRuleInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decidePincodeServiceabilityRule(state, input, actorId));
  }
  public createDeliveryPromise(input: CreateDeliveryPromiseInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createDeliveryPromise(
      state,
      input,
      this.resolveDeliveryAddressForOrder(state, input.salesOrderId, input.shipToAddressId),
      actorId,
    ));
  }
  public createCodCollectionCase(input: CreateCodCollectionCaseInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createCodCollectionCase(state, input, actorId));
  }
  public recordCodHandover(input: RecordCodHandoverInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordCodHandover(state, input, actorId));
  }
  public recordCodCarrierCollection(input: RecordCodCarrierCollectionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordCodCarrierCollection(state, input, actorId));
  }
  public recordCodRemittance(input: RecordCodRemittanceInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordCodRemittance(state, input, actorId));
  }
  public matchCodBank(input: MatchCodBankInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'COD bank-match confirmation');
    return this.mutate((state) => matchCodBank(state, input, actorId));
  }
  public closeCodShortfall(input: CloseCodShortfallInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'COD shortfall variance closure');
    return this.mutate((state) => closeCodShortfall(state, input, actorId));
  }
  public recordCodException(input: RecordCodExceptionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordCodException(state, input, actorId));
  }
  public addShipmentPackage(input: CreateShipmentPackageInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createShipmentPackage(
      state,
      input,
      actorId,
      undefined,
      undefined,
      input.shipToAddressId ? this.resolveDeliveryAddressForOrder(state, input.salesOrderId, input.shipToAddressId) : undefined,
    ));
  }
  public moveShipment(input: TransitionShipmentInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => {
      let next = transitionShipment(state, input, actorId);
      if (input.toStatus === 'dispatched') {
        const shipment = state.shipmentPackages.find(({ id }) => id === input.id);
        for (const item of shipment?.items ?? []) next = issuePickedInventory(next, item.reservationId, actorId, shipment!.number);
      }
      return next;
    });
  }
  public addCarrierAdapter(input: ConfigureCarrierAdapterInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => configureCarrierAdapter(state, input)); }
  public addReturnAuthorization(input: CreateReturnAuthorizationInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createReturnAuthorization(state, input, actorId)); }
  public decideReturnAuthorization(input: DecideReturnAuthorizationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Return decision');
    return this.mutate((state) => decideReturnAuthorization(state, input, actorId));
  }
  public receiveReturn(input: ReceiveReturnInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => receiveReturn(state, input, actorId)); }
  public inspectReturn(input: InspectReturnInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => inspectReturn(state, input, actorId)); }
  public prepareStatutoryExchange(input: PrepareStatutoryExchangeInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Statutory exchange preparation');
    return this.mutate((state) => prepareStatutoryExchange(state, input, actorId));
  }
  public submitStatutoryExchange(input: SubmitStatutoryExchangeInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Statutory exchange submission');
    return this.mutate((state) => submitStatutoryExchange(state, input, actorId));
  }
  public recordStatutoryResponse(input: RecordStatutoryResponseInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Statutory response reconciliation');
    return this.mutate((state) => recordStatutoryResponse(state, input));
  }

  public addStatutoryAdapter(input: ConfigureStatutoryAdapterInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Statutory adapter configuration');
    return this.mutate((state) => configureStatutoryAdapter(state, input, actorId));
  }

  public configureStatutoryCredentials(input: ConfigureStatutoryCredentialsInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Statutory credential configuration');
    return this.enqueue(async () => {
      if (!this.state.statutoryAdapters.some(({ id, active }) => id === input.adapterId && active)) throw new Error('Active statutory adapter not found.');
      const fingerprint = this.statutoryGateway.configureCredentials(input, actorId);
      this.state = markStatutoryCredentials(this.state, input.adapterId, fingerprint);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public addStatutoryOperation(input: PrepareStatutoryOperationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Statutory operation preparation');
    return this.mutate((state) => prepareStatutoryOperation(state, input, actorId));
  }

  public submitStatutoryOperation(input: SubmitStatutoryOperationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Statutory operation submission');
    return this.mutate((state) => submitStatutoryOperation(state, input, actorId));
  }

  public recordStatutoryOperationResponse(input: RecordStatutoryOperationResponseInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Statutory operation reconciliation');
    return this.mutate((state) => recordStatutoryOperationResponse(state, input));
  }

  public addConsolidatedEwayBill(input: PrepareConsolidatedEwayBillInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Consolidated E-way Bill preparation');
    return this.mutate((state) => prepareConsolidatedEwayBill(state, input, actorId));
  }

  public submitConsolidatedEwayBill(input: SubmitConsolidatedEwayBillInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Consolidated E-way Bill submission');
    return this.mutate((state) => submitConsolidatedEwayBill(state, input, actorId));
  }

  public recordConsolidatedEwayBillResponse(input: RecordConsolidatedEwayBillResponseInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Consolidated E-way Bill reconciliation');
    return this.mutate((state) => recordConsolidatedEwayBillResponse(state, input));
  }

  public verifyStatutorySignature(input: VerifyStatutorySignatureInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Statutory signature verification');
    return this.enqueue(async () => {
      const result = this.statutoryGateway.verifySignature(input);
      this.state = recordDigitalSignatureEvidence(this.state, result, actorId);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public runPortalReconciliation(input: RunPortalReconciliationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Portal reconciliation');
    return this.enqueue(async () => {
      const adapter = this.state.statutoryAdapters.find(({ id, active }) => id === input.adapterId && active);
      if (!adapter) throw new Error('Active statutory adapter not found.');
      const exchangeIds = [...new Set(input.exchangeIds)];
      if (!exchangeIds.length || exchangeIds.length !== input.exchangeIds.length || exchangeIds.length > 100) throw new Error('Choose 1-100 unique statutory exchanges.');
      const exchanges = exchangeIds.map((id) => this.state.statutoryExchanges.find((exchange) => exchange.id === id));
      if (exchanges.some((exchange) => !exchange)) throw new Error('Portal reconciliation contains an unknown exchange.');
      const statuses = await this.statutoryGateway.pullStatuses(adapter, exchanges as RevenueOpsState['statutoryExchanges']);
      this.state = applyPortalReconciliation(this.state, adapter.id, statuses, actorId);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public addProviderConnector(input: ConfigureProviderConnectorInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Provider connector configuration');
    return this.mutate((state) => configureProviderConnector(state, input, actorId));
  }

  public configureProviderCredentials(input: ConfigureProviderCredentialsInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Provider credential configuration');
    return this.enqueue(async () => {
      if (!this.state.providerConnectors.some(({ id, active }) => id === input.connectorId && active)) throw new Error('Active provider connector not found.');
      const fingerprint = this.providerGateway.configureCredentials(input, actorId);
      this.state = markProviderCredentials(this.state, input.connectorId, fingerprint);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public createProviderConformanceCase(input: CreateProviderConformanceCaseInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Provider conformance preparation');
    return this.mutate((state) => createProviderConformanceCase(state, input, actorId));
  }

  public planProviderConformancePack(input: PlanProviderConformancePackInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Provider conformance pack preparation');
    return this.mutate((state) => planProviderConformancePack(state, input, actorId));
  }

  public executeProviderPreflight(input: ExecuteProviderPreflightInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Provider connectivity preflight');
    return this.enqueue(async () => {
      const connector = this.state.providerConnectors.find(({ id, active }) => id === input.connectorId && active);
      if (!connector) throw new Error('Active provider connector not found.');
      if (connector.version !== input.expectedConnectorVersion) throw new Error('Provider connector changed; reload the readiness screen and try again.');
      const evidenceReference = input.evidenceReference.trim();
      if (evidenceReference.length < 4 || evidenceReference.length > 240) throw new Error('Evidence reference must be 4-240 characters.');
      let body: string | undefined;
      if (input.method === 'POST') {
        if (!input.payloadJson?.trim()) throw new Error('POST preflight requests require a JSON object body.');
        let parsed: unknown;
        try { parsed = JSON.parse(input.payloadJson); } catch { throw new Error('POST preflight body must be valid JSON.'); }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('POST preflight body must be a JSON object.');
        body = JSON.stringify(parsed);
      } else if (input.payloadJson?.trim()) {
        throw new Error('GET preflight requests cannot include a request body.');
      }
      const requestChecksum = createHash('sha256').update(JSON.stringify({ connectorId: connector.id, method: input.method, path: input.path, body: body ?? null })).digest('hex');
      const requestedAt = new Date().toISOString();
      try {
        const response = await this.providerGateway.requestJson(connector.id, connector.baseUrl, input.path, input.method, body, requestChecksum);
        const evidence = {
          scope: this.state.scope,
          id: randomUUID(),
          connectorId: connector.id,
          method: input.method,
          path: input.path,
          requestChecksum,
          responseChecksum: response.responseChecksum,
          responseByteLength: response.responseByteLength,
          statusCode: response.statusCode,
          status: response.ok ? 'succeeded' as const : 'failed' as const,
          evidenceReference,
          credentialRevision: connector.credentialRevision,
          ...(response.ok ? {} : { errorMessage: `Provider returned HTTP ${response.statusCode}.` }),
          requestedBy: actorId,
          requestedAt,
          version: 1,
        };
        this.state = { ...this.state, providerPreflightEvidence: [...(this.state.providerPreflightEvidence ?? []), evidence] };
      } catch (error) {
        const evidence = {
          scope: this.state.scope,
          id: randomUUID(),
          connectorId: connector.id,
          method: input.method,
          path: input.path,
          requestChecksum,
          status: 'failed' as const,
          evidenceReference,
          credentialRevision: connector.credentialRevision,
          errorMessage: (error instanceof Error ? error.message : String(error)).slice(0, 500),
          requestedBy: actorId,
          requestedAt,
          version: 1,
        };
        this.state = { ...this.state, providerPreflightEvidence: [...(this.state.providerPreflightEvidence ?? []), evidence] };
      }
      await this.persist();
      return this.getSnapshot();
    });
  }

  public recordProviderConformanceResult(input: RecordProviderConformanceResultInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Provider conformance assessment');
    return this.mutate((state) => recordProviderConformanceResult(state, input, actorId));
  }

  public approveProviderConnector(input: ApproveProviderConnectorInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Provider production activation');
    return this.mutate((state) => approveProviderConnector(state, input, actorId));
  }

  public prepareProviderSubmission(input: PrepareProviderSubmissionInput, actorId: string, messagingSources?: ProviderMessagingSourceContext): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Provider handoff preparation');
    return this.mutate((state) => prepareProviderSubmission(state, input, actorId, undefined, undefined, messagingSources));
  }

  public handOffProviderSubmission(input: HandOffProviderSubmissionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Provider handoff release');
    return this.mutate((state) => handOffProviderSubmission(state, input, actorId));
  }

  public recordProviderSubmissionResponse(input: RecordProviderSubmissionResponseInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Provider response reconciliation');
    return this.mutate((state) => recordProviderSubmissionResponse(state, input, new Date().toISOString(), actorId));
  }

  public runProviderReconciliation(input: RunProviderReconciliationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Provider pull reconciliation');
    return this.enqueue(async () => {
      const connector = this.state.providerConnectors.find(({ id, active }) => id === input.connectorId && active);
      if (!connector) throw new Error('Active provider connector not found.');
      const submissionIds = [...new Set(input.submissionIds)];
      if (!submissionIds.length || submissionIds.length !== input.submissionIds.length || submissionIds.length > 100) throw new Error('Choose 1-100 unique provider handoffs.');
      const submissions = submissionIds.map((id) => this.state.providerSubmissions.find((item) => item.id === id && item.connectorId === connector.id));
      if (submissions.some((item) => !item)) throw new Error('Provider reconciliation contains an unknown connector handoff.');
      const statuses = await this.providerGateway.pullStatuses(connector, submissions as RevenueOpsState['providerSubmissions']);
      this.state = applyProviderReconciliation(this.state, connector.id, statuses, actorId);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public proposeCreditLimit(input: ProposeCreditLimitInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => proposeCreditLimit(state, input, actorId, this.context().accounts.map(({ id }) => id)));
  }

  public decideCreditLimit(input: DecideCreditLimitInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Credit-limit decision');
    return this.mutate((state) => decideCreditLimit(state, input, actorId));
  }

  public runDunning(input: RunDunningInput): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => runDunning(state, input, this.context().activeUserIds));
  }

  public recordCollectionActivity(input: RecordCollectionActivityInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordCollectionActivity(state, input, actorId));
  }

  public openReceivableDispute(input: OpenReceivableDisputeInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => openReceivableDispute(state, input, actorId, this.context().activeUserIds));
  }

  public resolveReceivableDispute(input: ResolveReceivableDisputeInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Dispute resolution');
    return this.mutate((state) => resolveReceivableDispute(state, input, actorId));
  }

  public requestWriteOff(input: RequestWriteOffInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => requestWriteOff(state, input, actorId));
  }

  public decideWriteOff(input: DecideWriteOffInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Write-off decision');
    return this.mutate((state) => decideWriteOff(state, input, actorId));
  }

  public createWithholdingPolicy(input: CreateWithholdingPolicyInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Withholding policy creation');
    return this.mutate((state) => createWithholdingPolicy(state, input, actorId));
  }

  public recordWithholdingEntry(input: RecordWithholdingEntryInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Withholding recognition');
    return this.mutate((state) => recordWithholdingEntry(state, input, actorId));
  }

  public transitionWithholdingEntry(input: TransitionWithholdingEntryInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Withholding compliance transition');
    return this.mutate((state) => transitionWithholdingEntry(state, input, actorId));
  }

  public prepareZeroRatedSupply(input: PrepareZeroRatedSupplyInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => prepareZeroRatedSupply(state, input, actorId));
  }

  public decideZeroRatedSupply(input: DecideZeroRatedSupplyInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Zero-rated supply decision');
    return this.mutate((state) => decideZeroRatedSupply(state, input, actorId));
  }

  public createBankAccount(input: CreateBankAccountInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Bank account configuration');
    return this.mutate((state) => createBankAccount(state, input));
  }

  public previewBankStatement(input: PreviewBankStatementInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Bank statement import');
    return this.mutate((state) => previewBankStatement(state, input, actorId));
  }

  public commitBankStatement(input: CommitBankStatementInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Bank statement commit');
    return this.mutate((state) => commitBankStatement(state, input, actorId));
  }

  public confirmBankMatch(input: ConfirmBankMatchInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Bank match confirmation');
    return this.mutate((state) => confirmBankMatch(state, input, actorId));
  }

  public excludeBankLine(input: ExcludeBankLineInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Bank line exclusion');
    return this.mutate((state) => excludeBankLine(state, input, actorId));
  }

  public createPurchaseRequisition(input: CreatePurchaseRequisitionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createPurchaseRequisition(state, input, actorId));
  }

  public decidePurchaseRequisition(input: DecidePurchaseRequisitionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decidePurchaseRequisition(state, input, actorId));
  }

  public createRfqFromRequisition(input: CreateRfqFromRequisitionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createRfqFromRequisition(state, input, actorId));
  }

  public createSupplier(input: CreateSupplierInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createSupplier(state, input, actorId));
  }

  public decideSupplier(input: DecideSupplierInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Supplier qualification decision');
    return this.mutate((state) => decideSupplier(state, input, actorId));
  }

  public createRfq(input: CreateRfqInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createRfq(state, input, actorId));
  }

  public issueRfq(input: IssueRfqInput, actorId: string): Promise<RevenueOpsSnapshot> {
    void actorId;
    return this.mutate((state) => issueRfq(state, input));
  }

  public recordSupplierQuotation(input: RecordSupplierQuotationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordSupplierQuotation(state, input, actorId));
  }

  public awardRfq(input: AwardRfqInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'RFQ award');
    return this.mutate((state) => awardRfq(state, input, actorId));
  }

  public createPurchaseOrderFromRfq(input: CreatePurchaseOrderFromRfqInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createPurchaseOrderFromRfq(state, input, actorId));
  }

  public createPurchaseOrderFromReorder(input: CreatePurchaseOrderFromReorderInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createPurchaseOrderFromReorder(state, input, actorId));
  }

  public decidePurchaseOrder(input: DecidePurchaseOrderInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Purchase-order decision');
    return this.mutate((state) => decidePurchaseOrder(state, input, actorId));
  }

  public recordGoodsReceipt(input: RecordGoodsReceiptInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordGoodsReceipt(state, input, actorId));
  }

  public createLandedCost(input: CreateLandedCostInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createLandedCost(state, input, actorId));
  }

  public decideLandedCost(input: DecideLandedCostInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Landed-cost decision');
    return this.mutate((state) => decideLandedCost(state, input, actorId));
  }

  public recordSupplierInvoice(input: RecordSupplierInvoiceInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Supplier invoice recording');
    return this.mutate((state) => recordSupplierInvoice(state, input, actorId));
  }

  public decideThreeWayMatch(input: DecideThreeWayMatchInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Three-way match decision');
    return this.mutate((state) => decideThreeWayMatch(state, input, actorId));
  }

  public updateRetailPriceForTargetMargin(input: UpdateRetailPriceForTargetMarginInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Retail price margin adjustment');
    return this.mutate((state) => updateRetailPriceForTargetMargin(state, input.itemVariantId, input.targetUnitPrice, actorId));
  }

  public recordTreasuryPosition(input: RecordTreasuryPositionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Treasury position recording');
    return this.mutate((state) => recordTreasuryPosition(state, input, actorId));
  }

  public runCashForecast(input: RunCashForecastInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Cash forecasting');
    return this.mutate((state) => runCashForecast(state, input, actorId));
  }

  public createPaymentProposal(input: CreatePaymentProposalInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createPaymentProposal(state, input, actorId));
  }

  public decidePaymentProposal(input: DecidePaymentProposalInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Payment proposal decision');
    return this.mutate((state) => decidePaymentProposal(state, input, actorId));
  }

  public releasePaymentProposal(input: ReleasePaymentProposalInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Payment proposal release');
    return this.mutate((state) => releasePaymentProposal(state, input, actorId));
  }

  public settlePaymentProposal(input: SettlePaymentProposalInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Payment settlement evidence');
    return this.mutate((state) => settlePaymentProposal(state, input, actorId));
  }

  public recordBankCharge(input: RecordBankChargeInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Bank-charge recording');
    return this.mutate((state) => recordBankCharge(state, input, actorId));
  }

  public reconcileBankCharge(input: ReconcileBankChargeInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Bank-charge reconciliation');
    return this.mutate((state) => reconcileBankCharge(state, input, actorId));
  }

  public openSettlementException(input: OpenSettlementExceptionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => openSettlementException(state, input, actorId, this.context().activeUserIds));
  }

  public resolveSettlementException(input: ResolveSettlementExceptionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Settlement-exception resolution');
    return this.mutate((state) => resolveSettlementException(state, input, actorId));
  }

  public createLiquiditySweep(input: CreateLiquiditySweepInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Liquidity sweep creation');
    return this.mutate((state) => createLiquiditySweep(state, input, actorId));
  }

  public decideLiquiditySweep(input: DecideLiquiditySweepInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Liquidity sweep decision');
    return this.mutate((state) => decideLiquiditySweep(state, input, actorId));
  }

  public releaseLiquiditySweep(input: ReleaseLiquiditySweepInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Liquidity sweep release');
    return this.mutate((state) => releaseLiquiditySweep(state, input, actorId));
  }

  public settleLiquiditySweep(input: SettleLiquiditySweepInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Liquidity sweep settlement');
    return this.mutate((state) => settleLiquiditySweep(state, input, actorId));
  }

  public createWorkCenter(input: CreateWorkCenterInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Work-center configuration');
    return this.mutate((state) => createWorkCenter(state, input));
  }

  public createBomRevision(input: CreateBomRevisionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createBomRevision(state, input, actorId));
  }

  public decideBomRevision(input: DecideBomRevisionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'BOM revision decision');
    return this.mutate((state) => decideBomRevision(state, input, actorId));
  }

  public createQualityPlan(input: CreateQualityPlanInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createQualityPlan(state, input, actorId));
  }

  public decideQualityPlan(input: DecideQualityPlanInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Quality-plan decision');
    return this.mutate((state) => decideQualityPlan(state, input, actorId));
  }

  public createWorkOrder(input: CreateWorkOrderInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createWorkOrder(state, input, actorId));
  }

  public decideWorkOrder(input: DecideWorkOrderInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Work-order decision');
    return this.mutate((state) => decideWorkOrder(state, input, actorId));
  }

  public startWorkOrder(input: StartWorkOrderInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => startWorkOrder(state, input, actorId));
  }

  public issueWorkOrderMaterial(input: IssueWorkOrderMaterialInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => issueWorkOrderMaterial(state, input, actorId));
  }

  public recordQualityInspection(input: RecordQualityInspectionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordQualityInspection(state, input, actorId));
  }

  public resolveNonconformance(input: ResolveNonconformanceInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Nonconformance resolution');
    return this.mutate((state) => resolveNonconformance(state, input, actorId));
  }

  public recordProductionOutput(input: RecordProductionOutputInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordProductionOutput(state, input, actorId));
  }

  public createAssetCategory(input: CreateAssetCategoryInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createAssetCategory(state, input, actorId));
  }

  public createManagedAsset(input: CreateManagedAssetInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createManagedAsset(state, input, actorId));
  }

  public submitManagedAsset(input: SubmitManagedAssetInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => submitManagedAsset(state, input, actorId));
  }

  public decideManagedAsset(input: DecideManagedAssetInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decideManagedAsset(state, input, actorId));
  }

  public createAssetCapitalization(input: CreateAssetCapitalizationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createAssetCapitalization(state, input, actorId));
  }

  public decideAssetCapitalization(input: DecideAssetCapitalizationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decideAssetCapitalization(state, input, actorId));
  }

  public createAssetDepreciationPolicy(input: CreateAssetDepreciationPolicyInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createAssetDepreciationPolicy(state, input, actorId));
  }

  public decideAssetDepreciationPolicy(input: DecideAssetDepreciationPolicyInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decideAssetDepreciationPolicy(state, input, actorId));
  }

  public createAssetDepreciationRun(input: CreateAssetDepreciationRunInput, actorId: string): Promise<RevenueOpsSnapshot> {
    if (!this.canonicalHandoffPostingResolver) {
      throw new Error('The canonical ledger posting resolver is unavailable; depreciation cannot be generated safely.');
    }
    return this.mutate((state) => createAssetDepreciationRun(state, input, actorId, this.canonicalHandoffPostingResolver!));
  }

  public decideAssetDepreciationRun(input: DecideAssetDepreciationRunInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decideAssetDepreciationRun(state, input, actorId));
  }

  public createAssetRetirement(input: CreateAssetRetirementInput, actorId: string): Promise<RevenueOpsSnapshot> {
    if (!this.assetBookValueResolver) throw new Error('The canonical fixed-asset book resolver is unavailable; retirement cannot be initiated safely.');
    return this.mutate((state) => createAssetRetirement(state, input, actorId, this.assetBookValueResolver!));
  }

  public decideAssetRetirement(input: DecideAssetRetirementInput, actorId: string): Promise<RevenueOpsSnapshot> {
    if (!this.assetBookValueResolver) throw new Error('The canonical fixed-asset book resolver is unavailable; retirement cannot be approved safely.');
    return this.mutate((state) => decideAssetRetirement(state, input, actorId, this.assetBookValueResolver!));
  }

  public completeAssetRetirement(input: CompleteAssetRetirementInput, actorId: string): Promise<RevenueOpsSnapshot> {
    if (!this.canonicalHandoffPostingResolver) throw new Error('The canonical ledger posting resolver is unavailable; retirement cannot be completed safely.');
    return this.mutate((state) => completeAssetRetirement(state, input, actorId, this.canonicalHandoffPostingResolver!));
  }

  public createAssetCustodyTransfer(input: CreateAssetCustodyTransferInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createAssetCustodyTransfer(state, input, actorId));
  }

  public decideAssetCustodyTransfer(input: DecideAssetCustodyTransferInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decideAssetCustodyTransfer(state, input, actorId));
  }

  public receiveAssetCustodyTransfer(input: ReceiveAssetCustodyTransferInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => receiveAssetCustodyTransfer(state, input, actorId));
  }

  public createAssetComponentization(input: CreateAssetComponentizationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createAssetComponentization(state, input, actorId));
  }

  public decideAssetComponentization(input: DecideAssetComponentizationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decideAssetComponentization(state, input, actorId));
  }

  public createAssetComponentAllocation(input: CreateAssetComponentAllocationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createAssetComponentAllocation(state, input, actorId));
  }

  public decideAssetComponentAllocation(input: DecideAssetComponentAllocationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decideAssetComponentAllocation(state, input, actorId));
  }

  public createAssetTransferAccounting(input: CreateAssetTransferAccountingInput, actorId: string): Promise<RevenueOpsSnapshot> {
    if (!this.assetBookValueResolver) throw new Error('The canonical fixed-asset book resolver is unavailable; transfer cannot be created safely.');
    return this.mutate((state) => createAssetTransferAccounting(state, input, actorId, this.assetBookValueResolver!));
  }

  public decideAssetTransferAccounting(input: DecideAssetTransferAccountingInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decideAssetTransferAccounting(state, input, actorId));
  }

  public dispatchAssetTransferAccounting(input: DispatchAssetTransferAccountingInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => dispatchAssetTransferAccounting(state, input, actorId));
  }

  public receiveAssetTransferAccounting(input: ReceiveAssetTransferAccountingInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => receiveAssetTransferAccounting(state, input, actorId));
  }

  public createAssetSaleDisposal(input: CreateAssetSaleDisposalInput, actorId: string): Promise<RevenueOpsSnapshot> {
    if (!this.assetBookValueResolver) throw new Error('The canonical fixed-asset book resolver is unavailable; sale cannot be created safely.');
    return this.mutate((state) => createAssetSaleDisposal(state, input, actorId, this.assetBookValueResolver!));
  }

  public decideAssetSaleDisposal(input: DecideAssetSaleDisposalInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decideAssetSaleDisposal(state, input, actorId));
  }

  public completeAssetSaleDisposal(input: CompleteAssetSaleDisposalInput, actorId: string): Promise<RevenueOpsSnapshot> {
    if (!this.canonicalHandoffPostingResolver) throw new Error('The canonical ledger posting resolver is unavailable; sale cannot be completed safely.');
    return this.mutate((state) => completeAssetSaleDisposal(state, input, actorId, this.canonicalHandoffPostingResolver!));
  }

  /** One governed bridge for the remaining asset lifecycle controls. The
   * discriminated action keeps IPC/preload/UI wiring small without weakening
   * each domain function's maker/checker and evidence rules. */
  public runAssetLifecycleAction(action: AssetLifecycleActionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    switch (action.kind) {
      case 'create-impairment':
        if (!this.assetBookValueResolver) throw new Error('The canonical fixed-asset book resolver is unavailable; impairment cannot be created safely.');
        return this.mutate((state) => createAssetImpairmentReview(state, action.input, actorId, this.assetBookValueResolver!));
      case 'decide-impairment': return this.mutate((state) => decideAssetImpairmentReview(state, action.input, actorId));
      case 'complete-impairment':
        if (!this.canonicalHandoffPostingResolver) throw new Error('The canonical ledger posting resolver is unavailable; impairment cannot be completed safely.');
        return this.mutate((state) => completeAssetImpairmentReview(state, action.input, actorId, this.canonicalHandoffPostingResolver!));
      case 'create-revaluation':
        if (!this.assetBookValueResolver) throw new Error('The canonical fixed-asset book resolver is unavailable; revaluation cannot be created safely.');
        return this.mutate((state) => createAssetRevaluation(state, action.input, actorId, this.assetBookValueResolver!));
      case 'decide-revaluation': return this.mutate((state) => decideAssetRevaluation(state, action.input, actorId));
      case 'complete-revaluation':
        if (!this.canonicalHandoffPostingResolver) throw new Error('The canonical ledger posting resolver is unavailable; revaluation cannot be completed safely.');
        return this.mutate((state) => completeAssetRevaluation(state, action.input, actorId, this.canonicalHandoffPostingResolver!));
      case 'create-warranty': return this.mutate((state) => createAssetWarranty(state, action.input, actorId));
      case 'update-warranty': return this.mutate((state) => updateAssetWarrantyStatus(state, action.input, actorId));
      case 'create-amc': return this.mutate((state) => createAssetAmcContract(state, action.input, actorId));
      case 'decide-amc': return this.mutate((state) => decideAssetAmcContract(state, action.input, actorId));
      case 'update-amc': return this.mutate((state) => updateAssetAmcStatus(state, action.input));
      case 'create-meter': return this.mutate((state) => createAssetMeter(state, action.input, actorId));
      case 'record-meter': return this.mutate((state) => recordAssetMeterReading(state, action.input, actorId));
      case 'create-corrective': return this.mutate((state) => createCorrectiveMaintenanceRequest(state, action.input, actorId));
      case 'transition-corrective': return this.mutate((state) => transitionCorrectiveMaintenance(state, action.input, actorId));
      case 'create-calibration': return this.mutate((state) => createAssetCalibration(state, action.input, actorId));
      case 'decide-calibration': return this.mutate((state) => decideAssetCalibration(state, action.input, actorId));
      case 'create-spare': return this.mutate((state) => createAssetSparePart(state, action.input, actorId));
      case 'issue-spare': return this.mutate((state) => issueAssetSpare(state, action.input, actorId));
      case 'create-fleet-vehicle': return this.mutate((state) => createFleetVehicle(state, action.input, actorId));
      case 'update-fleet-vehicle': return this.mutate((state) => updateFleetVehicle(state, action.input));
      case 'create-fleet-trip': return this.mutate((state) => createFleetTrip(state, action.input, actorId));
      case 'complete-fleet-trip': return this.mutate((state) => completeFleetTrip(state, action.input, actorId));
    }
  }

  public createPreventiveMaintenancePlan(
    input: CreatePreventiveMaintenancePlanInput,
    actorId: string,
  ): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createPreventiveMaintenancePlan(state, input, actorId));
  }

  public generateDueMaintenanceWorkOrder(
    input: GenerateDueMaintenanceWorkOrderInput,
    actorId: string,
  ): Promise<RevenueOpsSnapshot> {
    this.assertMaintenanceTechnician(input.technicianUserId);
    return this.mutate((state) => generateDueMaintenanceWorkOrder(state, input, actorId));
  }

  public startMaintenanceWorkOrder(
    input: StartMaintenanceWorkOrderInput,
    actorId: string,
  ): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => startMaintenanceWorkOrder(state, input, actorId));
  }

  public completeMaintenanceWorkOrder(
    input: CompleteMaintenanceWorkOrderInput,
    actorId: string,
  ): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => completeMaintenanceWorkOrder(state, input, actorId));
  }

  public verifyMaintenanceWorkOrder(
    input: VerifyMaintenanceWorkOrderInput,
    actorId: string,
  ): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => verifyMaintenanceWorkOrder(state, input, actorId));
  }

  public createProject(input: CreateProjectInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createProject(state, input, actorId, this.deliveryContext()));
  }

  public decideProject(input: DecideProjectInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Project decision');
    return this.mutate((state) => decideProject(state, input, actorId));
  }

  public transitionProject(input: TransitionProjectInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => transitionProject(state, input, actorId));
  }

  public createProjectTask(input: CreateProjectTaskInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createProjectTask(state, input, actorId, this.deliveryContext()));
  }

  public transitionProjectTask(input: TransitionProjectTaskInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => transitionProjectTask(state, input, actorId));
  }

  public recordTimeEntry(input: RecordTimeEntryInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordTimeEntry(state, input, actorId, this.deliveryContext()));
  }

  public decideTimeEntry(input: DecideTimeEntryInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => decideTimeEntry(state, input, actorId));
  }

  public createServiceAgreement(input: CreateServiceAgreementInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createServiceAgreement(state, input, actorId, this.deliveryContext()));
  }

  public decideServiceAgreement(input: DecideServiceAgreementInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Service-agreement decision');
    return this.mutate((state) => decideServiceAgreement(state, input, actorId));
  }

  public createSupportTicket(input: CreateSupportTicketInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createSupportTicket(state, input, actorId, this.deliveryContext()));
  }

  public transitionSupportTicket(input: TransitionSupportTicketInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => transitionSupportTicket(state, input, actorId, this.deliveryContext()));
  }

  public createFieldServiceJob(input: CreateFieldServiceJobInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createFieldServiceJob(state, input, actorId, this.deliveryContext()));
  }

  public transitionFieldServiceJob(input: TransitionFieldServiceJobInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => transitionFieldServiceJob(state, input, actorId));
  }

  public createWorkforceProfile(input: CreateWorkforceProfileInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Workforce profile configuration');
    return this.mutate((state) => createWorkforceProfile(state, input, actorId, { activeUserIds: this.context().activeUserIds }));
  }

  public decideWorkforceProfile(input: DecideWorkforceProfileInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Workforce profile decision');
    return this.mutate((state) => decideWorkforceProfile(state, input, actorId));
  }

  public recordWorkforceAvailability(input: RecordWorkforceAvailabilityInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordWorkforceAvailability(state, input, actorId));
  }

  public decideWorkforceAvailability(input: DecideWorkforceAvailabilityInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Workforce availability decision');
    return this.mutate((state) => decideWorkforceAvailability(state, input, actorId));
  }

  public createWorkforceAllocation(input: CreateWorkforceAllocationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createWorkforceAllocation(state, input, actorId));
  }

  public cancelWorkforceAllocation(input: CancelWorkforceAllocationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => cancelWorkforceAllocation(state, input, actorId));
  }

  public createEmployerRegistration(input: CreateEmployerRegistrationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Employer registration submission');
    return this.mutate((state) => createEmployerRegistration(state, input, actorId));
  }

  public decideEmployerRegistration(input: DecideEmployerRegistrationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Employer registration decision');
    return this.mutate((state) => decideEmployerRegistration(state, input, actorId));
  }

  public createPayrollPolicy(input: CreatePayrollPolicyInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Payroll policy submission');
    return this.mutate((state) => createPayrollPolicy(state, input, actorId));
  }

  public decidePayrollPolicy(input: DecidePayrollPolicyInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Payroll policy decision');
    return this.mutate((state) => decidePayrollPolicy(state, input, actorId));
  }

  public createPayrollCompensation(input: CreatePayrollCompensationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Compensation schedule submission');
    return this.mutate((state) => createPayrollCompensation(state, input, actorId));
  }

  public decidePayrollCompensation(input: DecidePayrollCompensationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Compensation schedule decision');
    return this.mutate((state) => decidePayrollCompensation(state, input, actorId));
  }

  public createBenefitPlan(input: CreateBenefitPlanInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Benefit plan submission');
    return this.mutate((state) => createBenefitPlan(state, input, actorId));
  }

  public decideBenefitPlan(input: DecideBenefitPlanInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Benefit plan decision');
    return this.mutate((state) => decideBenefitPlan(state, input, actorId));
  }

  public createBenefitEnrollment(input: CreateBenefitEnrollmentInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createBenefitEnrollment(state, input, actorId));
  }

  public decideBenefitEnrollment(input: DecideBenefitEnrollmentInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Benefit enrollment decision');
    return this.mutate((state) => decideBenefitEnrollment(state, input, actorId));
  }

  public createPayrollRun(input: CreatePayrollRunInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Payroll run submission');
    return this.mutate((state) => createPayrollRun(state, input, actorId));
  }

  public decidePayrollRun(input: DecidePayrollRunInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Payroll run decision');
    return this.mutate((state) => decidePayrollRun(state, input, actorId));
  }

  public finalizePayrollRun(input: FinalizePayrollRunInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Payroll run finalization');
    return this.mutate((state) => finalizePayrollRun(state, input, actorId));
  }

  public updatePayrollObligation(input: UpdatePayrollObligationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Payroll statutory obligation update');
    return this.mutate((state) => updatePayrollObligation(state, input, actorId));
  }

  public createExpenseClaim(input: CreateExpenseClaimInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createExpenseClaim(state, input, actorId));
  }

  public decideExpenseClaim(input: DecideExpenseClaimInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Expense claim decision');
    return this.mutate((state) => decideExpenseClaim(state, input, actorId));
  }

  public reimburseExpenseClaim(input: ReimburseExpenseClaimInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Expense reimbursement');
    return this.mutate((state) => reimburseExpenseClaim(state, input, actorId));
  }

  public recordAttendance(input: RecordAttendanceInput, actorId: string): Promise<RevenueOpsSnapshot> {
    if (input.source !== 'self-attested') this.assertWorkforceApprover(actorId, 'Manager or imported attendance record');
    return this.mutate((state) => recordAttendance(state, input, actorId));
  }

  public decideAttendance(input: DecideAttendanceInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Attendance decision');
    return this.mutate((state) => decideAttendance(state, input, actorId));
  }

  public createLeaveType(input: CreateLeaveTypeInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Leave type submission');
    return this.mutate((state) => createLeaveType(state, input, actorId));
  }

  public decideLeaveType(input: DecideLeaveTypeInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Leave type decision');
    return this.mutate((state) => decideLeaveType(state, input, actorId));
  }

  public createLeaveApplication(input: CreateLeaveApplicationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createLeaveApplication(state, input, actorId));
  }

  public decideLeaveApplication(input: DecideLeaveApplicationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Leave application decision');
    return this.mutate((state) => decideLeaveApplication(state, input, actorId));
  }

  public createPayrollAdjustment(input: CreatePayrollAdjustmentInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertWorkforceApprover(actorId, 'Payroll adjustment submission');
    return this.mutate((state) => createPayrollAdjustment(state, input, actorId));
  }

  public decidePayrollAdjustment(input: DecidePayrollAdjustmentInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Payroll adjustment decision');
    return this.mutate((state) => decidePayrollAdjustment(state, input, actorId));
  }

  public createTaxDeclaration(input: CreateTaxDeclarationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createTaxDeclaration(state, input, actorId));
  }

  public decideTaxDeclaration(input: DecideTaxDeclarationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Tax declaration decision');
    return this.mutate((state) => decideTaxDeclaration(state, input, actorId));
  }

  public publishPayslip(input: PublishPayslipInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Payslip publication');
    return this.mutate((state) => publishPayslip(state, input, actorId));
  }

  public acknowledgePayslip(input: AcknowledgePayslipInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => acknowledgePayslip(state, input, actorId));
  }

  public createProjectBillingPlan(input: CreateProjectBillingPlanInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createProjectBillingPlan(state, input, actorId));
  }

  public decideProjectBillingPlan(input: DecideProjectBillingPlanInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Project billing-plan decision');
    return this.mutate((state) => decideProjectBillingPlan(state, input, actorId));
  }

  public createProjectBillingClaim(input: CreateProjectBillingClaimInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createProjectBillingClaim(state, input, actorId));
  }

  public decideProjectBillingClaim(input: DecideProjectBillingClaimInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Project billing-claim recognition');
    return this.mutate((state) => decideProjectBillingClaim(state, input, actorId));
  }

  public consumeServiceEntitlement(input: ConsumeServiceEntitlementInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => consumeServiceEntitlement(state, input, actorId));
  }

  public createAccountingClosePeriod(input: CreateAccountingClosePeriodInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Accounting close-period submission');
    return this.mutate((state) => createAccountingClosePeriod(state, input, actorId));
  }

  public decideAccountingClosePeriod(input: DecideAccountingClosePeriodInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Accounting close-period decision');
    return this.mutate((state) => {
      const closePeriod = state.accountingClosePeriods.find(({ id }) => id === input.id);
      if (
        input.decision === 'closed' &&
        closePeriod?.status === 'submitted' &&
        closePeriod.version === input.expectedVersion &&
        closePeriod.requestedBy !== actorId &&
        this.accountingCloseReadinessResolver
      ) {
        const readiness = this.accountingCloseReadinessResolver(
          closePeriod.periodFrom,
          closePeriod.periodTo,
        );
        if (readiness.status === 'blocked') {
          const blocker = readiness.blockers[0];
          throw new Error(
            blocker
              ? `Close is blocked by canonical ledger readiness: ${blocker.reference} — ${blocker.detail}`
              : 'Close is blocked by canonical ledger readiness.',
          );
        }
      }
      return decideAccountingClosePeriod(
        state,
        input,
        actorId,
        undefined,
        (draft) => draft.status === 'exported' || Boolean(
          this.canonicalHandoffPostingResolver?.(draft),
        ),
      );
    });
  }

  public reopenAccountingClosePeriod(input: ReopenAccountingClosePeriodInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Accounting close-period reopen');
    return this.mutate((state) => reopenAccountingClosePeriod(state, input, actorId));
  }

  public createProjectExchangeRate(input: CreateProjectExchangeRateInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Project exchange-rate submission');
    return this.mutate((state) => createProjectExchangeRate(state, input, actorId));
  }

  public decideProjectExchangeRate(input: DecideProjectExchangeRateInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Project exchange-rate verification');
    return this.mutate((state) => decideProjectExchangeRate(state, input, actorId));
  }

  public createProjectCurrencyProfile(input: CreateProjectCurrencyProfileInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createProjectCurrencyProfile(state, input, actorId));
  }

  public decideProjectCurrencyProfile(input: DecideProjectCurrencyProfileInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Project currency-profile decision');
    return this.mutate((state) => decideProjectCurrencyProfile(state, input, actorId));
  }

  public createProjectContractVariation(input: CreateProjectContractVariationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createProjectContractVariation(state, input, actorId));
  }

  public decideProjectContractVariation(input: DecideProjectContractVariationInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Project contract-variation decision');
    return this.mutate((state) => decideProjectContractVariation(state, input, actorId));
  }

  public createProjectRetainer(input: CreateProjectRetainerInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createProjectRetainer(state, input, actorId));
  }

  public decideProjectRetainer(input: DecideProjectRetainerInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Project retainer decision');
    return this.mutate((state) => decideProjectRetainer(state, input, actorId));
  }

  public createRetainerDrawdown(input: CreateRetainerDrawdownInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createRetainerDrawdown(state, input, actorId));
  }

  public decideRetainerDrawdown(input: DecideRetainerDrawdownInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Retainer-drawdown decision');
    return this.mutate((state) => decideRetainerDrawdown(state, input, actorId));
  }

  public createProjectResourcePlan(input: CreateProjectResourcePlanInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createProjectResourcePlan(state, input, actorId));
  }

  public decideProjectResourcePlan(input: DecideProjectResourcePlanInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Project resource-plan decision');
    return this.mutate((state) => decideProjectResourcePlan(state, input, actorId));
  }

  public generateProjectMarginReview(input: GenerateProjectMarginReviewInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => generateProjectMarginReview(state, input, actorId));
  }

  public reviewProjectMargin(input: ReviewProjectMarginInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Project margin review');
    return this.mutate((state) => reviewProjectMargin(state, input, actorId));
  }

  public addUom(input: CreateUomInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createUom(state, input)); }
  public addUomConversion(input: CreateUomConversionInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createUomConversion(state, input)); }
  public addInventoryItem(input: CreateInventoryItemInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createInventoryItem(state, input)); }
  public addItemVariant(input: CreateItemVariantInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createItemVariant(state, input)); }
  public addWarehouse(input: CreateWarehouseInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createWarehouse(state, input)); }
  public addWarehouseZone(input: CreateWarehouseZoneInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createWarehouseZone(state, input)); }
  public addStorageBin(input: CreateStorageBinInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createStorageBin(state, input)); }
  public receiveInventory(input: ReceiveInventoryInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => receiveInventory(state, input, actorId)); }
  public addPutawayTask(input: CreatePutawayTaskInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createPutawayTask(state, input, actorId)); }
  public addPickTask(input: CreatePickTaskInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createPickTask(state, input, actorId)); }
  public moveWarehouseTask(input: TransitionWarehouseTaskInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => transitionWarehouseTask(state, input, actorId)); }
  public addInventoryTransfer(input: CreateInventoryTransferInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createInventoryTransfer(state, input, actorId)); }
  public moveInventoryTransfer(input: TransitionInventoryTransferInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => transitionInventoryTransfer(state, input, actorId)); }
  public addCycleCount(input: CreateCycleCountInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createCycleCount(state, input, actorId)); }
  public recordCycleCount(input: RecordCycleCountInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => recordCycleCount(state, input)); }
  public decideCycleCount(input: DecideCycleCountInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideCycleCount(state, input, actorId)); }
  public addReorderPolicy(input: CreateReorderPolicyInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createReorderPolicy(state, input)); }
  public generateReorderProposals(): Promise<RevenueOpsSnapshot> { return this.mutate((state) => generateReorderProposals(state)); }
  public decideReorderProposal(input: DecideReorderProposalInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideReorderProposal(state, input, actorId)); }
  public addInventoryValuationReview(input: CreateInventoryValuationReviewInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createInventoryValuationReview(state, input, actorId)); }
  public decideInventoryValuationReview(input: DecideInventoryValuationReviewInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideInventoryValuationReview(state, input, actorId)); }
  public createInventoryDisposition(input: CreateInventoryDispositionInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createInventoryDisposition(state, input, actorId)); }
  public decideInventoryDisposition(input: DecideInventoryDispositionInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideInventoryDisposition(state, input, actorId)); }
  public postInventoryDisposition(input: PostInventoryDispositionInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => postInventoryDisposition(state, input, actorId)); }
  private assertRetailCustomerAccount(accountId: string, label: string): void {
    const account = this.partyStore.getSnapshot().accounts.find(({ id, companyId, relationship, status }) =>
      id === accountId && companyId === this.state.scope.companyId && relationship === 'customer' && status === 'active',
    );
    if (!account) throw new Error(`${label} must be an active Party Master customer account in the current legal entity.`);
  }

  public createRetailCounter(input: CreateRetailCounterInput, _actorId: string): Promise<RevenueOpsSnapshot> {
    void _actorId;
    this.assertRetailCustomerAccount(input.walkInAccountId, 'Retail counter walk-in customer');
    return this.mutate((state) => createRetailCounter(state, input));
  }
  public openRetailCashierShift(input: OpenRetailCashierShiftInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => openRetailCashierShift(state, input, actorId)); }
  public checkoutRetailSale(input: CheckoutRetailSaleInput, actorId: string): Promise<RevenueOpsSnapshot> {
    const counter = this.state.retailCounters.find(({ id, active, scope }) =>
      id === input.counterId && active && (scope ?? this.state.scope).companyId === this.state.scope.companyId && (scope ?? this.state.scope).branchId === this.state.scope.branchId,
    );
    if (!counter) throw new Error('Active retail counter not found in the current operating scope.');
    this.assertRetailCustomerAccount(input.customerAccountId ?? counter.walkInAccountId, 'Retail checkout customer');
    return this.mutate((state) => checkoutRetailSale(state, input, actorId));
  }
  public enqueueRetailOfflineSale(input: CheckoutRetailSaleInput, actorId: string): Promise<RevenueOpsSnapshot> {
    const counter = this.state.retailCounters.find(({ id, active, scope }) => id === input.counterId && active && (scope ?? this.state.scope).companyId === this.state.scope.companyId && (scope ?? this.state.scope).branchId === this.state.scope.branchId);
    if (!counter) throw new Error('Offline sale requires an active retail counter in the current operating scope.');
    this.assertRetailCustomerAccount(input.customerAccountId ?? counter.walkInAccountId, 'Offline checkout customer');
    return this.mutate((state) => enqueueRetailOfflineSale(state, input, actorId));
  }
  public syncRetailOfflineSale(input: SyncRetailOfflineSaleInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => syncRetailOfflineSale(state, input, actorId)); }
  public syncRetailOfflineQueue(input: SyncRetailOfflineQueueInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => syncRetailOfflineQueue(state, input, actorId)); }
  public resolveRetailOfflineSale(input: ResolveRetailOfflineSaleInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => resolveRetailOfflineSale(state, input, actorId)); }
  public ingestRetailUnifiedOrder(input: IngestRetailOrderSourceEventInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => {
      const current = state.retailUnifiedOrderIngestion ?? { orders: [], conflicts: [], reservationIntents: [], reconciliationRequirements: [], hubHandoffs: [], fulfilmentHandoffs: [], stockReservationExecutions: [], pickTaskExecutions: [], shipmentPackageExecutions: [], dispatchReadinessExecutions: [], carrierDispatchExecutions: [], deliveryExecutions: [], rtoReconciliationExecutions: [], returnReconciliationExecutions: [] };
      const result = ingestRetailOrderSourceEvent(current, input.event, { mode: input.mode, receivedAt: input.receivedAt, actorId });
      return result.outcome === 'idempotent'
        ? state
        : { ...state, revision: state.revision + 1, retailUnifiedOrderIngestion: result.state };
    });
  }
  public prepareRetailUnifiedOrderHandoff(input: PrepareRetailOrderGovernedHandoffInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => {
      const current = state.retailUnifiedOrderIngestion ?? { orders: [], conflicts: [], reservationIntents: [], reconciliationRequirements: [], hubHandoffs: [], fulfilmentHandoffs: [], stockReservationExecutions: [], pickTaskExecutions: [], shipmentPackageExecutions: [], dispatchReadinessExecutions: [], carrierDispatchExecutions: [], deliveryExecutions: [], rtoReconciliationExecutions: [], returnReconciliationExecutions: [] };
      const result = prepareRetailOrderForGovernedHandoff(current, { ...input, approvedBy: actorId });
      return { ...state, revision: state.revision + 1, retailUnifiedOrderIngestion: result.state };
    });
  }
  public prepareRetailOrderHubHandoff(input: PrepareRetailOrderHubHandoffInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => {
      const current = state.retailUnifiedOrderIngestion ?? { orders: [], conflicts: [], reservationIntents: [], reconciliationRequirements: [], hubHandoffs: [], fulfilmentHandoffs: [], stockReservationExecutions: [], pickTaskExecutions: [], shipmentPackageExecutions: [], dispatchReadinessExecutions: [], carrierDispatchExecutions: [], deliveryExecutions: [], rtoReconciliationExecutions: [], returnReconciliationExecutions: [] };
      const result = prepareRetailOrderHubHandoff(current, input, actorId);
      return { ...state, revision: state.revision + 1, retailUnifiedOrderIngestion: result.state };
    });
  }
  public recordRetailOrderHubHandoffResult(input: RecordRetailOrderHubHandoffResultInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => {
      const current = state.retailUnifiedOrderIngestion ?? { orders: [], conflicts: [], reservationIntents: [], reconciliationRequirements: [], hubHandoffs: [], fulfilmentHandoffs: [], stockReservationExecutions: [], pickTaskExecutions: [], shipmentPackageExecutions: [], dispatchReadinessExecutions: [], carrierDispatchExecutions: [], deliveryExecutions: [], rtoReconciliationExecutions: [], returnReconciliationExecutions: [] };
      const result = recordRetailOrderHubHandoffResult(current, input, actorId);
      return { ...state, revision: state.revision + 1, retailUnifiedOrderIngestion: result.state };
    });
  }
  public prepareRetailOrderFulfilmentHandoff(input: PrepareRetailOrderFulfilmentHandoffInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => {
      const salesOrder = state.salesOrders.find((candidate) => candidate.id === input.salesOrderId && (candidate.scope ?? state.scope).companyId === state.scope.companyId && (candidate.scope ?? state.scope).branchId === state.scope.branchId);
      if (!salesOrder) throw new Error('Selected sales order is not available in the current operating scope.');
      const current = state.retailUnifiedOrderIngestion ?? { orders: [], conflicts: [], reservationIntents: [], reconciliationRequirements: [], hubHandoffs: [], fulfilmentHandoffs: [], stockReservationExecutions: [], pickTaskExecutions: [], shipmentPackageExecutions: [], dispatchReadinessExecutions: [], carrierDispatchExecutions: [], deliveryExecutions: [], rtoReconciliationExecutions: [], returnReconciliationExecutions: [] };
      const result = prepareRetailOrderFulfilmentHandoff(current, input, salesOrder, actorId);
      return { ...state, revision: state.revision + 1, retailUnifiedOrderIngestion: result.state };
    });
  }
  public decideRetailOrderFulfilmentHandoff(input: DecideRetailOrderFulfilmentHandoffInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => {
      const current = state.retailUnifiedOrderIngestion ?? { orders: [], conflicts: [], reservationIntents: [], reconciliationRequirements: [], hubHandoffs: [], fulfilmentHandoffs: [], stockReservationExecutions: [], pickTaskExecutions: [], shipmentPackageExecutions: [], dispatchReadinessExecutions: [], carrierDispatchExecutions: [], deliveryExecutions: [], rtoReconciliationExecutions: [], returnReconciliationExecutions: [] };
      const result = decideRetailOrderFulfilmentHandoff(current, input, actorId);
      return { ...state, revision: state.revision + 1, retailUnifiedOrderIngestion: result.state };
    });
  }
  public reserveRetailUnifiedOrderStock(input: ReserveRetailUnifiedOrderStockInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => reserveRetailUnifiedOrderStock(state, input, actorId));
  }
  public createRetailUnifiedOrderPickTasks(input: CreateRetailUnifiedOrderPickTasksInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => createRetailUnifiedOrderPickTasks(state, input, actorId));
  }
  public completeRetailUnifiedOrderPickTasks(input: CompleteRetailUnifiedOrderPickTasksInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => completeRetailUnifiedOrderPickTasks(state, input, actorId));
  }
  public createRetailUnifiedOrderShipmentPackage(input: CreateRetailUnifiedOrderShipmentPackageInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => {
      const fulfilment = state.retailUnifiedOrderIngestion?.fulfilmentHandoffs.find((candidate) => candidate.orderId === input.orderId && candidate.status === 'approved');
      const shipToAddressSnapshot = input.shipToAddressId && fulfilment ? this.resolveDeliveryAddressForOrder(state, fulfilment.salesOrderId, input.shipToAddressId) : undefined;
      return createRetailUnifiedOrderShipmentPackage(state, input, actorId, undefined, shipToAddressSnapshot);
    });
  }
  public completeRetailUnifiedOrderShipmentPackage(input: CompleteRetailUnifiedOrderShipmentPackageInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => completeRetailUnifiedOrderShipmentPackage(state, input, actorId));
  }
  public prepareRetailUnifiedOrderDispatch(input: PrepareRetailUnifiedOrderDispatchInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => prepareRetailUnifiedOrderDispatch(state, input, actorId));
  }
  public dispatchRetailUnifiedOrder(input: DispatchRetailUnifiedOrderInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => dispatchRetailUnifiedOrder(state, input, actorId));
  }
  public confirmRetailUnifiedOrderDelivery(input: ConfirmRetailUnifiedOrderDeliveryInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => confirmRetailUnifiedOrderDelivery(state, input, actorId));
  }
  public reconcileRetailUnifiedOrderRto(input: ReconcileRetailUnifiedOrderRtoInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => reconcileRetailUnifiedOrderRto(state, input, actorId));
  }
  public reconcileRetailUnifiedOrderReturn(input: ReconcileRetailUnifiedOrderReturnInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => reconcileRetailUnifiedOrderReturn(state, input, actorId));
  }
  public recordRetailUnifiedOrderCarrierCallback(input: RecordRetailUnifiedOrderCarrierCallbackInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.mutate((state) => recordRetailUnifiedOrderCarrierCallback(state, input, actorId));
  }
  public createRetailDeviceAdapterProfile(input: CreateRetailDeviceAdapterProfileInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailDeviceAdapterProfile(state, input, actorId)); }
  public approveRetailDeviceAdapterProfile(input: ApproveRetailDeviceAdapterProfileInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => approveRetailDeviceAdapterProfile(state, input, actorId)); }
  public recordRetailDeviceAdapterAcknowledgement(input: RecordRetailDeviceAdapterAcknowledgementInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => recordRetailDeviceAdapterAcknowledgement(state, input, actorId)); }
  public activateRetailDeviceAdapterProfile(input: ActivateRetailDeviceAdapterProfileInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => activateRetailDeviceAdapterProfile(state, input, actorId)); }
  public suspendRetailDeviceAdapterProfile(input: SuspendRetailDeviceAdapterProfileInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => suspendRetailDeviceAdapterProfile(state, input, actorId)); }
  public prepareRetailDeviceTransport(input: PrepareRetailDeviceTransportInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => prepareRetailDeviceTransport(state, input, actorId)); }
  public recordRetailDeviceTransport(input: RecordRetailDeviceTransportInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => recordRetailDeviceTransport(state, input, actorId)); }
  public recordRetailNativeDeviceDriverResult(input: RecordRetailNativeDeviceDriverResultInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => recordRetailNativeDeviceDriverResult(state, input, actorId)); }
  public executeRetailDeviceTransport(input: ExecuteRetailDeviceTransportInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.enqueue(async () => {
      const record = this.state.retailDeviceTransportEvidence.find((candidate) => candidate.id === input.id && candidate.status === 'prepared' && (candidate.scope ?? this.state.scope).companyId === this.state.scope.companyId && (candidate.scope ?? this.state.scope).branchId === this.state.scope.branchId);
      if (!record || record.version !== input.expectedVersion) throw new Error('Device command is stale or no longer awaiting a response. Refresh the hardware queue.');
      if (record.requestedBy === actorId) throw new Error('The command maker cannot execute and acknowledge the same device response.');
      if (record.connection !== 'network') throw new Error('Live execution is currently available only for network devices; use the approved USB/Bluetooth driver or manual evidence path.');
      if (!record.profileId) throw new Error('This legacy network command has no approved device profile. Re-prepare it from Device setup before sending anything.');
      const profile = this.state.retailDeviceAdapterProfiles.find((candidate) => candidate.id === record.profileId && (candidate.scope ?? this.state.scope).companyId === this.state.scope.companyId && (candidate.scope ?? this.state.scope).branchId === this.state.scope.branchId);
      if (!profile || profile.version !== record.profileVersion || (profile.status !== 'approved' && profile.status !== 'operational')) throw new Error('The profile-bound device command is no longer tied to the current approved or operational device setup. Prepare a new check.');
      assertRetailDeviceProfileNetworkEndpoint(profile, input.host, input.port);
      const payload = input.payload.trim();
      if (!payload || payload.length > 20_000) throw new Error('Device payload must contain 1-20000 characters.');
      const payloadChecksum = createHash('sha256').update(payload, 'utf8').digest('hex');
      if (payloadChecksum !== record.payloadChecksum) throw new Error('Execution payload does not match the prepared device command checksum.');
      const response = await preflightRetailDeviceTransport({ kind: record.kind, connection: 'network', host: input.host, port: input.port, payload, timeoutMs: input.timeoutMs });
      const responseProtocol = ({ 'barcode-scanner': 'barcode-scanner-status-v1', 'escpos-printer': 'escpos-status-v1', 'cash-drawer': 'cash-drawer-status-v1', 'weighing-scale': 'weighing-scale-reading-v1' } as const)[record.kind];
      this.state = recordNetworkExecutedRetailDeviceTransport(this.state, { id: record.id, result: response.status === 'reachable' && response.responseByteLength > 0 ? 'acknowledged' : 'failed', responseReference: response.responseReference, responseProtocol, responseChecksum: response.responseChecksum, responseByteLength: response.responseByteLength, expectedVersion: record.version }, actorId);
      await this.persist();
      return this.getSnapshot();
    });
  }
  public retryRetailDeviceTransport(input: RetryRetailDeviceTransportInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => retryRetailDeviceTransport(state, input, actorId)); }
  public preflightRetailDeviceTransport(input: PreflightRetailDeviceTransportInput, actorId: string): Promise<RetailDeviceTransportPreflightResult> {
    return this.enqueue(async () => {
      const result = await preflightRetailDeviceTransport(input);
      this.state = { ...this.state, revision: this.state.revision + 1, retailDevicePreflightEvidence: [{ id: randomUUID(), ...result, actorId, recordedAt: new Date().toISOString(), scope: structuredClone(this.state.scope), version: 1 }, ...(this.state.retailDevicePreflightEvidence ?? [])] };
      await this.persist();
      return result;
    });
  }
  public recordRetailDevicePreflightEvidence(input: RecordRetailDevicePreflightEvidenceInput, actorId: string): Promise<RetailDeviceTransportPreflightResult> {
    return this.enqueue(async () => {
      if (input.source === 'web-serial' && input.result.connection !== 'usb') {
        throw new Error('Web Serial preflight evidence must use the USB connection.');
      }
      if (input.source === 'web-bluetooth' && input.result.connection !== 'bluetooth') {
        throw new Error('Web Bluetooth preflight evidence must use the Bluetooth connection.');
      }
      const result = structuredClone(input.result);
      this.state = {
        ...this.state,
        revision: this.state.revision + 1,
        retailDevicePreflightEvidence: [
          { id: randomUUID(), ...result, actorId, recordedAt: new Date().toISOString(), scope: structuredClone(this.state.scope), version: 1 },
          ...(this.state.retailDevicePreflightEvidence ?? []),
        ],
      };
      await this.persist();
      return result;
    });
  }
  public createRetailLoyaltyAccount(input: CreateRetailLoyaltyAccountInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertRetailCustomerAccount(input.customerAccountId, 'Loyalty customer');
    return this.mutate((state) => createRetailLoyaltyAccount(state, input, actorId));
  }
  public redeemRetailLoyaltyPoints(input: RedeemRetailLoyaltyPointsInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertRetailCustomerAccount(input.customerAccountId, 'Loyalty redemption customer');
    return this.mutate((state) => redeemRetailLoyaltyPoints(state, input, actorId));
  }
  public createRetailCustomerVisit(input: CreateRetailCustomerVisitInput, actorId: string): Promise<RevenueOpsSnapshot> {
    if (input.customerAccountId) this.assertRetailCustomerAccount(input.customerAccountId, 'Retail visit customer');
    return this.mutate((state) => createRetailCustomerVisit(state, input, actorId));
  }
  public linkRetailCustomerVisitToSale(input: LinkRetailCustomerVisitInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => linkRetailCustomerVisitToSale(state, input, actorId)); }
  public createRetailSalesCommission(input: CreateRetailSalesCommissionInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailSalesCommission(state, input)); }
  public decideRetailSalesCommission(input: DecideRetailSalesCommissionInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailSalesCommission(state, input, actorId)); }
  public payRetailSalesCommission(input: PayRetailSalesCommissionInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => payRetailSalesCommission(state, input, actorId)); }
  public createRetailCommissionPayoutBatch(input: CreateRetailCommissionPayoutBatchInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailCommissionPayoutBatch(state, input, actorId)); }
  public decideRetailCommissionPayoutBatch(input: DecideRetailCommissionPayoutBatchInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Retail commission payout batch approval');
    return this.mutate((state) => decideRetailCommissionPayoutBatch(state, input, actorId));
  }
  public releaseRetailCommissionPayoutBatch(input: ReleaseRetailCommissionPayoutBatchInput, actorId: string): Promise<RevenueOpsSnapshot> {
    this.assertFinanceApprover(actorId, 'Retail commission payout batch release');
    return this.mutate((state) => releaseRetailCommissionPayoutBatch(state, input, actorId));
  }
  public requestRetailCashierShiftClose(input: RequestRetailCashierShiftCloseInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => requestRetailCashierShiftClose(state, input, actorId)); }
  public decideRetailCashierShiftClose(input: DecideRetailCashierShiftCloseInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailCashierShiftClose(state, input, actorId)); }
  public requestRetailCashierShiftVarianceResolution(input: RequestRetailCashierShiftVarianceResolutionInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => requestRetailCashierShiftVarianceResolution(state, input, actorId)); }
  public decideRetailCashierShiftVarianceResolution(input: DecideRetailCashierShiftVarianceResolutionInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailCashierShiftVarianceResolution(state, input, actorId)); }
  public createRetailReturnRequest(input: CreateRetailReturnRequestInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailReturnRequest(state, input, actorId)); }
  public createRetailExchange(input: CreateRetailExchangeInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailExchange(state, input, actorId)); }
  public decideRetailExchange(input: DecideRetailExchangeInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailExchange(state, input, actorId)); }
  public prepareRetailCreditNoteReconciliation(input: PrepareRetailCreditNoteReconciliationInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => prepareRetailCreditNoteReconciliation(state, input, actorId)); }
  public recordRetailCreditNotePortalResponse(input: RecordRetailCreditNotePortalResponseInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => recordRetailCreditNotePortalResponse(state, input, actorId)); }
  public createRetailInterBranchTransfer(input: CreateRetailInterBranchTransferInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailInterBranchTransfer(state, input, actorId)); }
  public decideRetailInterBranchTransfer(input: DecideRetailInterBranchTransferInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailInterBranchTransfer(state, input, actorId)); }
  public dispatchRetailInterBranchTransfer(input: DispatchRetailInterBranchTransferInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => dispatchRetailInterBranchTransfer(state, input, actorId)); }
  public receiveRetailInterBranchTransfer(input: ReceiveRetailInterBranchTransferInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => receiveRetailInterBranchTransfer(state, input, actorId)); }
  public inspectRetailReturn(input: InspectRetailReturnInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => inspectRetailReturn(state, input, actorId)); }
  public decideRetailReturn(input: DecideRetailReturnInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailReturn(state, input, actorId)); }
  public requestRetailReturnSettlement(input: RequestRetailReturnSettlementInput, actorId: string): Promise<RevenueOpsSnapshot> {
    if (input.method === 'store-credit' && input.storeCreditAccountId) {
      this.assertRetailCustomerAccount(input.storeCreditAccountId, 'Retail store-credit customer');
    }
    return this.mutate((state) => requestRetailReturnSettlement(state, input, actorId));
  }
  public decideRetailReturnSettlement(input: DecideRetailReturnSettlementInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailReturnSettlement(state, input, actorId)); }
  public confirmRetailReturnProviderRefund(input: ConfirmRetailReturnProviderRefundInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => confirmRetailReturnProviderRefund(state, input, actorId)); }
  public createRetailCatalogCategory(input: CreateRetailCatalogCategoryInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailCatalogCategory(state, input)); }
  public createRetailCatalogBrand(input: CreateRetailCatalogBrandInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailCatalogBrand(state, input)); }
  public saveRetailMerchandisingProfile(input: SaveRetailMerchandisingProfileInput, imageDescriptor?: RetailMerchandisingImageDescriptor): Promise<RevenueOpsSnapshot> { return this.mutate((state) => saveRetailMerchandisingProfile(state, input, imageDescriptor)); }
  public createRetailBarcodeSequence(input: CreateRetailBarcodeSequenceInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailBarcodeSequence(state, input)); }
  public resetRetailBarcodeSequence(input: ResetRetailBarcodeSequenceInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => resetRetailBarcodeSequence(state, input, actorId)); }
  public assignRetailBarcode(input: AssignRetailBarcodeInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => assignRetailBarcode(state, input)); }
  public createRetailLabelPrintRun(input: CreateRetailLabelPrintRunInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailLabelPrintRun(state, input, actorId)); }
  public createRetailProductCombo(input: CreateRetailProductComboInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailProductCombo(state, input)); }
  public createRetailScaleProfile(input: CreateRetailScaleProfileInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailScaleProfile(state, input)); }
  public createRetailPrinterAdapter(input: CreateRetailPrinterAdapterInput): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailPrinterAdapter(state, input)); }
  public testRetailPrinterAdapter(input: TestRetailPrinterAdapterInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => testRetailPrinterAdapter(state, input, actorId)); }
  public createRetailLabelPrintDispatch(input: CreateRetailLabelPrintDispatchInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailLabelPrintDispatch(state, input, actorId)); }
  public decideRetailLabelPrintDispatch(input: DecideRetailLabelPrintDispatchInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailLabelPrintDispatch(state, input, actorId)); }
  public prepareRetailCatalogBulkEdit(input: PrepareRetailCatalogBulkEditInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => prepareRetailCatalogBulkEdit(state, input, actorId)); }
  public applyRetailCatalogBulkEdit(input: ApplyRetailCatalogBulkEditInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => applyRetailCatalogBulkEdit(state, input, actorId)); }
  public createRetailPurchaseOcrDocument(input: CreateRetailPurchaseOcrInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailPurchaseOcrDocument(state, input, actorId)); }
  public decideRetailPurchaseOcr(input: DecideRetailPurchaseOcrInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailPurchaseOcr(state, input, actorId)); }
  public convertRetailPurchaseOcr(input: ConvertRetailPurchaseOcrInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => convertRetailPurchaseOcr(state, input, actorId)); }
  public createRetailCommerceConnector(input: CreateRetailCommerceConnectorInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailCommerceConnector(state, input, actorId)); }
  public configureRetailCommerceCredentials(input: ConfigureRetailCommerceCredentialsInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.enqueue(async () => {
      const connector = this.state.retailCommerceConnectors.find((item) => item.id === input.connectorId && item.status !== 'suspended');
      if (!connector) throw new Error('Active retail commerce connector not found.');
      const secretMaterial = [input.clientId, input.clientSecret, input.apiKey, input.bearerToken, input.signingKey].some((value) => Boolean(value?.trim()));
      const fingerprint = secretMaterial
        ? (() => {
            this.providerGateway.configureCredentials({ connectorId: input.connectorId, clientId: input.clientId, clientSecret: input.clientSecret, apiKey: input.apiKey, bearerToken: input.bearerToken, signingKey: input.signingKey }, actorId);
            return this.providerGateway.getCredentialChecksum(input.connectorId);
          })()
        : input.fingerprint;
      this.state = configureRetailCommerceCredentials(this.state, { ...input, fingerprint });
      await this.persist();
      return this.getSnapshot();
    });
  }
  public createRetailCommerceSyncRun(input: CreateRetailCommerceSyncInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailCommerceSyncRun(state, input, actorId)); }
  public recordRetailCommerceSync(input: RecordRetailCommerceSyncInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => recordRetailCommerceSync(state, input, actorId)); }
  public executeRetailCommerceSync(input: ExecuteRetailCommerceSyncInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.enqueue(async () => {
      const run = this.state.retailCommerceSyncRuns.find((candidate) => candidate.id === input.id && candidate.status === 'prepared');
      if (!run || run.version !== input.expectedVersion) throw new Error('Commerce sync run is stale or no longer awaiting provider execution.');
      if (run.requestedBy === actorId) throw new Error('Sync request maker cannot execute and certify the same provider run.');
      const connector = this.state.retailCommerceConnectors.find((candidate) => candidate.id === run.connectorId && ['configured', 'certified'].includes(candidate.status) && candidate.credentialStatus === 'configured');
      if (!connector) throw new Error('A configured connector with vaulted credentials is required for provider execution.');
      if (input.method === 'GET' && input.payloadJson) throw new Error('GET provider requests cannot include a JSON body.');
      if (input.method === 'POST' && !input.payloadJson) throw new Error('POST provider requests require an explicit JSON body.');
      let body: string | undefined;
      if (input.payloadJson) {
        try {
          const parsed: unknown = JSON.parse(input.payloadJson);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Provider request body must be a JSON object.');
          body = JSON.stringify(parsed);
        } catch (error) {
          throw new Error(`Provider request body is invalid JSON: ${error instanceof Error ? error.message : 'invalid JSON'}`);
        }
      }
      const response = await this.providerGateway.requestJson(connector.id, connector.baseUrl, input.path, input.method, body, run.requestChecksum);
      const normalized = normalizeRetailCommerceResponse(response);
      if (input.applyOrders && input.applySettlements) throw new Error('A commerce sync execution can import orders or settlements, not both.');
      if (input.applyOrders && run.kind !== 'orders') throw new Error('Order import can only be applied to an order-pull sync.');
      if (input.applySettlements && run.kind !== 'settlement') throw new Error('Settlement import can only be applied to a settlement-pull sync.');
      let accepted = normalized.recordsAccepted;
      let rejected = normalized.recordsRejected;
      let status = normalized.status;
      let evidenceReference = normalized.evidenceReference;
      if (input.applyOrders && normalized.status !== 'failed') {
        if (!normalized.orders) throw new Error('Canonical order-pull response did not include an orders array.');
        accepted = 0;
        rejected = 0;
        for (const order of normalized.orders) {
          try {
            const remotePayloadChecksum = createHash('sha256').update(JSON.stringify(order), 'utf8').digest('hex');
            const existing = this.state.retailCommerceOrders.find((candidate) => candidate.connectorId === connector.id && candidate.remoteOrderId === order.remoteOrderId && candidate.scope?.companyId === this.state.scope.companyId && candidate.scope?.branchId === this.state.scope.branchId);
            if (existing && order.remoteStatus) {
              const remoteStatusChecksum = createHash('sha256').update(JSON.stringify({ remoteOrderId: order.remoteOrderId, remoteStatus: order.remoteStatus }), 'utf8').digest('hex');
              this.state = recordRetailCommerceRemoteStatus(this.state, { id: existing.id, remoteStatus: order.remoteStatus, remoteStatusChecksum, evidence: normalized.evidenceReference, expectedVersion: existing.version }, actorId);
            } else {
              const remoteStatusChecksum = order.remoteStatus ? createHash('sha256').update(JSON.stringify({ remoteOrderId: order.remoteOrderId, remoteStatus: order.remoteStatus }), 'utf8').digest('hex') : undefined;
              this.state = importRetailCommerceOrder(this.state, { connectorId: connector.id, remoteOrderId: order.remoteOrderId, orderNumber: order.orderNumber, remoteCreatedAt: order.remoteCreatedAt, remotePayloadChecksum, remoteStatus: order.remoteStatus, remoteStatusEvidence: order.remoteStatus ? normalized.evidenceReference : undefined, remoteStatusChecksum, lines: order.lines }, actorId);
            }
            accepted += 1;
          } catch {
            rejected += 1;
          }
        }
        if (rejected > 0 || accepted !== normalized.recordsAccepted) status = 'completed-with-exceptions';
        rejected = Math.min(Math.max(rejected, normalized.recordsRejected), Math.max(0, normalized.recordsRead - accepted));
        evidenceReference = rejected > 0 ? `${normalized.evidenceReference}-ORDER-EXCEPTIONS`.slice(0, 300) : normalized.evidenceReference;
      }
      if (input.applySettlements && normalized.status !== 'failed') {
        if (!normalized.settlements) throw new Error('Canonical settlement-pull response did not include a settlements array.');
        accepted = 0;
        rejected = 0;
        for (const settlement of normalized.settlements) {
          try {
            if (this.state.retailSettlementReconciliations.some((item) => item.connectorId === connector.id && item.settlementReference === settlement.settlementReference && item.scope?.branchId === this.state.scope.branchId)) throw new Error('Settlement reference was already imported for this connector.');
            const remoteOrderIds = [...settlement.remoteOrderIds];
            if (new Set(remoteOrderIds).size !== remoteOrderIds.length) throw new Error(`Settlement ${settlement.settlementReference} contains duplicate remote order references.`);
            const matchedOrders = remoteOrderIds.map((remoteOrderId) => this.state.retailCommerceOrders.find((order) => order.connectorId === connector.id && order.remoteOrderId === remoteOrderId && order.scope?.companyId === this.state.scope.companyId && order.scope?.branchId === this.state.scope.branchId));
            if (matchedOrders.some((order) => !order)) throw new Error(`Settlement ${settlement.settlementReference} references an order that is not imported in the active branch. Pull the order page before accepting settlement evidence.`);
            const orderIds = matchedOrders.map((order) => order!.id);
            const localNetAmount = this.state.retailCommerceOrders.filter((order) => orderIds.includes(order.id)).reduce((total, order) => total + order.totalAmount, 0);
            const remotePayloadChecksum = createHash('sha256').update(JSON.stringify(settlement), 'utf8').digest('hex');
            this.state = createRetailSettlementReconciliation(this.state, { connectorId: connector.id, settlementReference: settlement.settlementReference, periodFrom: settlement.periodFrom, periodTo: settlement.periodTo, grossAmount: settlement.grossAmount, refundAmount: settlement.refundAmount, feeAmount: settlement.feeAmount, taxWithheldAmount: settlement.taxWithheldAmount, localNetAmount, orderIds, remotePayloadChecksum }, actorId);
            const importedOrders = settlement.remoteOrderIds.map((remoteOrderId) => this.state.retailCommerceOrders.find((order) => order.connectorId === connector.id && order.remoteOrderId === remoteOrderId && order.scope?.branchId === this.state.scope.branchId)).filter((order): order is NonNullable<typeof order> => Boolean(order));
            const settlementRecord = this.state.retailSettlementReconciliations.find((record) => record.connectorId === connector.id && record.settlementReference === settlement.settlementReference && record.scope?.branchId === this.state.scope.branchId);
            if (settlementRecord && importedOrders.length === settlement.remoteOrderIds.length && settlement.remoteOrderIds.length > 0 && new Set(settlement.remoteOrderIds).size === settlement.remoteOrderIds.length) {
              const allocations = proposeRetailSettlementAllocations(this.state, settlementRecord.id);
              if (allocations) {
                try {
                  this.state = createRetailSettlementAllocationPack(this.state, { settlementId: settlementRecord.id, allocations }, actorId);
                } catch {
                  // A non-balancing provider payload remains a manual allocation task.
                }
              }
            }
            accepted += 1;
          } catch {
            rejected += 1;
          }
        }
        if (rejected > 0 || accepted !== normalized.recordsAccepted) status = 'completed-with-exceptions';
        rejected = Math.min(Math.max(rejected, normalized.recordsRejected), Math.max(0, normalized.recordsRead - accepted));
        evidenceReference = rejected > 0 ? `${normalized.evidenceReference}-SETTLEMENT-EXCEPTIONS`.slice(0, 300) : normalized.evidenceReference;
      }
      this.state = recordRetailCommerceSync(this.state, { id: run.id, status, evidenceReference, providerReference: normalized.providerReference, responseChecksum: normalized.responseChecksum, responseByteLength: normalized.responseByteLength, recordsRead: normalized.recordsRead, recordsAccepted: accepted, recordsRejected: rejected, remoteCursor: normalized.remoteCursor, expectedVersion: run.version }, actorId);
      const conflictKind = status === 'failed' ? 'sync-failed' : status === 'completed-with-exceptions' ? 'sync-exceptions' : undefined;
      if (conflictKind && !this.state.retailCommerceConflictResolutions.some((resolution) => resolution.conflictId === `${conflictKind}:${run.id}` && resolution.status !== 'rejected')) {
        this.state = createRetailCommerceConflictResolution(this.state, {
          conflictId: `${conflictKind}:${run.id}`,
          kind: conflictKind,
          sourceId: run.id,
          connectorId: connector.id,
          decision: conflictKind === 'sync-failed' ? 'retry' : 'accepted',
          evidence: conflictKind === 'sync-failed' ? `Provider execution failed for ${run.id}; independent retry approval is required.` : `${rejected} order or provider records require independent reconciliation for ${run.id}.`,
        }, actorId);
      }
      await this.persist();
      return this.getSnapshot();
    });
  }
  public importRetailCommerceOrder(input: ImportRetailCommerceOrderInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => importRetailCommerceOrder(state, input, actorId)); }
  public handoffRetailCommerceOrder(input: HandoffRetailCommerceOrderInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => handoffRetailCommerceOrder(state, input, actorId)); }
  public reserveRetailCommerceOrder(input: ReserveRetailCommerceOrderInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => reserveRetailCommerceOrder(state, input, actorId)); }
  public createRetailSettlementReconciliation(input: CreateRetailSettlementReconciliationInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailSettlementReconciliation(state, input, actorId)); }
  public decideRetailSettlementReconciliation(input: DecideRetailSettlementReconciliationInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailSettlementReconciliation(state, input, actorId)); }
  public createRetailSettlementAllocationPack(input: CreateRetailSettlementAllocationPackInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailSettlementAllocationPack(state, input, actorId)); }
  public decideRetailSettlementAllocationPack(input: DecideRetailSettlementAllocationPackInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailSettlementAllocationPack(state, input, actorId)); }
  public createRetailCommerceConflictResolution(input: CreateRetailCommerceConflictResolutionInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailCommerceConflictResolution(state, input, actorId)); }
  public decideRetailCommerceConflictResolution(input: DecideRetailCommerceConflictResolutionInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.enqueue(async () => {
      const pending = this.state.retailCommerceConflictResolutions.find((resolution) => resolution.id === input.id && resolution.status === 'prepared' && resolution.scope?.companyId === this.state.scope.companyId && resolution.scope?.branchId === this.state.scope.branchId);
      if (!pending) throw new Error('Conflict resolution pack is stale or already decided.');
      this.state = decideRetailCommerceConflictResolution(this.state, input, actorId);
      if (input.decision === 'approved' && pending.decision === 'retry' && ['sync-failed', 'sync-exceptions', 'sync-pending'].includes(pending.kind)) {
        const source = this.state.retailCommerceSyncRuns.find((run) => run.id === pending.sourceId && run.connectorId === pending.connectorId && run.scope?.companyId === this.state.scope.companyId && run.scope?.branchId === this.state.scope.branchId);
        if (!source) throw new Error('The approved retry resolution no longer has a scoped source sync run.');
        const retryChecksum = createHash('sha256').update(JSON.stringify({ sourceRunId: source.id, resolutionId: pending.id, requestChecksum: source.requestChecksum, decisionEvidence: input.evidence }), 'utf8').digest('hex');
        this.state = createRetailCommerceSyncRun(this.state, { connectorId: source.connectorId, kind: source.kind, requestChecksum: retryChecksum }, actorId);
      }
      await this.persist();
      return this.getSnapshot();
    });
  }
  public createRetailSettlementWithholdingEvidence(input: CreateRetailSettlementWithholdingEvidenceInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailSettlementWithholdingEvidence(state, input, actorId)); }
  public decideRetailSettlementWithholdingEvidence(input: DecideRetailSettlementWithholdingEvidenceInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailSettlementWithholdingEvidence(state, input, actorId)); }
  public prepareRetailSettlementJournal(input: PrepareRetailSettlementJournalInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => prepareRetailSettlementJournal(state, input, actorId)); }
  public createRetailOcrProviderProfile(input: CreateRetailOcrProviderProfileInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailOcrProviderProfile(state, input, actorId)); }
  public configureRetailOcrProvider(input: ConfigureRetailOcrProviderInput, actorId = 'system'): Promise<RevenueOpsSnapshot> {
    return this.enqueue(async () => {
      const hasSecrets = Boolean(input.clientId || input.clientSecret || input.apiKey || input.bearerToken || input.signingKey);
      const fingerprint = hasSecrets
        ? (this.providerGateway.configureCredentials({ connectorId: input.id, clientId: input.clientId, clientSecret: input.clientSecret, apiKey: input.apiKey, bearerToken: input.bearerToken, signingKey: input.signingKey }, actorId), this.providerGateway.getCredentialChecksum(input.id))
        : input.credentialFingerprint;
      if (!fingerprint) throw new Error('An OCR credential fingerprint or secret material is required.');
      this.state = configureRetailOcrProvider(this.state, { id: input.id, credentialFingerprint: fingerprint });
      await this.persist();
      return this.getSnapshot();
    });
  }
  public executeRetailOcr(input: ExecuteRetailOcrInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.enqueue(async () => {
      const profile = this.state.retailOcrProviderProfiles.find((candidate) => candidate.id === input.providerId && candidate.scope?.companyId === this.state.scope.companyId && candidate.scope?.branchId === this.state.scope.branchId);
      if (!profile || profile.version !== input.expectedProviderVersion || profile.mode !== 'api' || profile.status !== 'certified' || profile.credentialStatus !== 'configured' || !profile.baseUrl) throw new Error('A certified API OCR provider with vaulted credentials and a current profile version is required.');
      if (!/^[a-f0-9]{64}$/i.test(input.fileChecksum)) throw new Error('OCR source file checksum must be a SHA-256 value.');
      if (input.method === 'GET' && input.payloadJson) throw new Error('GET OCR requests cannot include a JSON body.');
      if (input.method === 'POST' && !input.payloadJson) throw new Error('POST OCR requests require an explicit JSON body.');
      let body: string | undefined;
      if (input.payloadJson) {
        try {
          const parsed: unknown = JSON.parse(input.payloadJson);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('OCR request body must be a JSON object.');
          body = JSON.stringify(parsed);
        } catch (error) {
          throw new Error(`OCR request body is invalid JSON: ${error instanceof Error ? error.message : 'invalid JSON'}`);
        }
      }
      const requestChecksum = createHash('sha256').update(JSON.stringify({ providerId: profile.id, method: input.method, path: input.path, body, fileChecksum: input.fileChecksum }), 'utf8').digest('hex');
      const response = await this.providerGateway.requestJson(profile.id, profile.baseUrl, input.path, input.method, body, requestChecksum);
      const normalized = normalizeRetailOcrResponse(response);
      if (normalized.status === 'failed' || !normalized.document) throw new Error(`OCR provider execution failed: ${normalized.evidenceReference}.`);
      this.state = createRetailPurchaseOcrDocument(this.state, { source: input.source, fileName: input.fileName, fileChecksum: input.fileChecksum, supplierId: input.supplierId, purchaseOrderId: input.purchaseOrderId, goodsReceiptId: input.goodsReceiptId, ocrProviderProfileId: profile.id, providerResponseReference: normalized.evidenceReference, providerResponseChecksum: normalized.responseChecksum, providerResponseByteLength: normalized.responseByteLength, extractedInvoiceNumber: normalized.document.extractedInvoiceNumber, extractedInvoiceDate: normalized.document.extractedInvoiceDate, extractedSupplierGstin: normalized.document.extractedSupplierGstin, extractedTotalAmount: normalized.document.extractedTotalAmount, extractionConfidence: normalized.document.extractionConfidence, lines: normalized.document.lines }, actorId);
      await this.persist();
      return this.getSnapshot();
    });
  }
  public testRetailOcrProvider(input: TestRetailOcrProviderInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => testRetailOcrProvider(state, input, actorId)); }
  public prepareRetailPurchaseOcrMapping(input: PrepareRetailPurchaseOcrMappingInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => prepareRetailPurchaseOcrMapping(state, input, actorId)); }
  public applyRetailPurchaseOcrMapping(input: ApplyRetailPurchaseOcrMappingInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => applyRetailPurchaseOcrMapping(state, input, actorId)); }
  public prepareRetailCommercePushBatch(input: PrepareRetailCommercePushInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => prepareRetailCommercePushBatch(state, input, actorId)); }
  public decideRetailCommercePushBatch(input: DecideRetailCommercePushInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailCommercePushBatch(state, input, actorId)); }
  public executeRetailCommercePushBatch(input: ExecuteRetailCommercePushInput, actorId: string): Promise<RevenueOpsSnapshot> {
    return this.enqueue(async () => {
      const batch = this.state.retailCommercePushBatches.find((candidate) => candidate.id === input.id && candidate.status === 'prepared' && candidate.scope?.companyId === this.state.scope.companyId && candidate.scope?.branchId === this.state.scope.branchId);
      if (!batch || batch.version !== input.expectedVersion) throw new Error('Commerce push batch is stale or no longer awaiting provider execution.');
      if (batch.requestedBy === actorId) throw new Error('Push batch maker cannot execute and certify the same provider delivery.');
      const connector = this.state.retailCommerceConnectors.find((candidate) => candidate.id === batch.connectorId && ['configured', 'certified'].includes(candidate.status) && candidate.credentialStatus === 'configured' && candidate.scope?.companyId === this.state.scope.companyId && candidate.scope?.branchId === this.state.scope.branchId);
      if (!connector) throw new Error('A configured connector with vaulted credentials is required for push execution.');
      let body = JSON.stringify({ kind: batch.kind, payloadChecksum: batch.payloadChecksum, records: batch.records });
      if (input.payloadJson) {
        try {
          const parsed: unknown = JSON.parse(input.payloadJson);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Provider push body must be a JSON object.');
          const candidate = parsed as Record<string, unknown>;
          if (candidate.payloadChecksum !== batch.payloadChecksum) throw new Error('Provider push body must carry the prepared payload checksum.');
          body = JSON.stringify(candidate);
        } catch (error) {
          throw new Error(`Provider push request body is invalid: ${error instanceof Error ? error.message : 'invalid JSON'}`);
        }
      }
      const response = await this.providerGateway.requestJson(connector.id, connector.baseUrl, input.path, input.method, body, batch.payloadChecksum);
      const normalized = normalizeRetailCommercePushResponse(response, batch.payloadChecksum, batch.records.length);
      const providerPayloadChecksum = normalized.payloadChecksum ?? batch.payloadChecksum;
      this.state = decideRetailCommercePushBatch(this.state, { id: batch.id, decision: normalized.status, evidence: normalized.evidenceReference, providerPayloadChecksum, responseChecksum: normalized.responseChecksum, responseByteLength: normalized.responseByteLength, providerReference: normalized.providerReference, expectedVersion: batch.version }, actorId);
      await this.persist();
      return this.getSnapshot();
    });
  }
  public createRetailCommerceCatalogMapping(input: CreateRetailCommerceCatalogMappingInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailCommerceCatalogMapping(state, input, actorId)); }
  public decideRetailCommerceCatalogMapping(input: DecideRetailCommerceCatalogMappingInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => decideRetailCommerceCatalogMapping(state, input, actorId)); }
  public disableRetailCommerceCatalogMapping(input: DisableRetailCommerceCatalogMappingInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => disableRetailCommerceCatalogMapping(state, input, actorId)); }
  public transitionRetailCommerceOrder(input: TransitionRetailCommerceOrderInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => transitionRetailCommerceOrder(state, input, actorId)); }
  public linkRetailCommerceReturn(input: LinkRetailCommerceReturnInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => linkRetailCommerceReturn(state, input, actorId)); }
  public createRetailCommerceConformanceCase(input: CreateRetailCommerceConformanceCaseInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => createRetailCommerceConformanceCase(state, input, actorId)); }
  public planRetailCommerceConformancePack(input: PlanRetailCommerceConformancePackInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => planRetailCommerceConformancePack(state, input, actorId)); }
  public recordRetailCommerceConformance(input: RecordRetailCommerceConformanceInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => recordRetailCommerceConformance(state, input, actorId)); }
  public scanRetailPurchaseExceptions(input: ScanRetailPurchaseExceptionsInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => scanRetailPurchaseExceptions(state, input, actorId)); }
  public resolveRetailPurchaseException(input: ResolveRetailPurchaseExceptionInput, actorId: string): Promise<RevenueOpsSnapshot> { return this.mutate((state) => resolveRetailPurchaseException(state, input, actorId)); }

  public createOpportunity(input: CreateIndiaOpportunityInput, actorId: string): Promise<OpportunityCreationResult> {
    return this.enqueue(async () => {
      const context = this.context();
      const account = context.accounts.find(({ id, status }) => id === input.accountId && status === 'active');
      if (!account) throw new Error('Active opportunity account not found.');
      const contact = input.contactId ? context.contacts.find(({ id, accountId, status }) => id === input.contactId && accountId === account.id && status === 'active') : undefined;
      if (input.contactId && !contact) throw new Error('Opportunity contact must belong to the account.');
      const assignment = resolveOpportunityAssignment(this.state, input, context.activeUserIds);
      const kernel = this.kernelStore.getSnapshot();
      const user = kernel.users.find(({ id, status }) => id === assignment.assigneeUserId && status === 'active');
      if (!user) throw new Error('Resolved opportunity owner is not active.');
      const firstStage = [...this.crmDepthStore.getSnapshot().activePipeline.stages].filter(({ active }) => active).sort((left, right) => left.position - right.position)[0];
      if (!firstStage) throw new Error('Active CRM pipeline has no entry stage.');
      const opportunityId = randomUUID();
      const planned = registerIndiaOpportunity(this.state, { ...input, opportunityId, actorId, assignedUserId: user.id, territoryId: assignment.territoryId, assignmentSource: assignment.source });
      const crm = await this.crmStore.createOpportunity({
        accountId: account.id,
        contactId: contact?.id,
        territoryId: assignment.territoryId,
        title: input.title,
        account: account.displayName,
        contact: contact ? `${contact.firstName} ${contact.lastName}` : 'Buying committee',
        owner: { id: user.id, name: user.displayName, initials: initials(user.displayName), color: '#dc6d2e' },
        stage: firstStage.id,
        value: input.value,
        currency: 'INR',
        probability: firstStage.probability,
        expectedClose: input.expectedClose,
        nextStep: input.nextStep,
        source: input.source,
        tags: ['India', input.productKind === 'service' ? 'Service' : 'Goods'],
      }, opportunityId);
      this.state = planned;
      await this.persist();
      return { crm, revenue: this.getSnapshot() };
    });
  }

  private resolveDeliveryAddressForOrder(
    state: RevenueOpsState,
    salesOrderId: string,
    addressId: string,
  ) {
    const order = state.salesOrders.find((candidate) => candidate.id === salesOrderId);
    if (!order) throw new Error('Sales order was not found while resolving the delivery address.');
    const address = this.partyStore.getSnapshot().addresses.find((candidate) =>
      candidate.id === addressId && candidate.status === 'active' && candidate.accountId === order.accountId,
    );
    if (!address) throw new Error('Ship-to address must be an active Party Master address owned by the sales-order customer.');
    return freezeDeliveryAddress(address);
  }

  private context(): RevenueOpsContext {
    const crm = this.crmStore.getSnapshot();
    const party = this.partyStore.getSnapshot();
    const kernel = this.kernelStore.getSnapshot();
    return {
      opportunities: crm.opportunities,
      accounts: party.accounts.filter(({ status }) => status === 'active'),
      contacts: party.contacts.filter(({ status }) => status === 'active'),
      addresses: party.addresses.filter(({ status }) => status === 'active'),
      activeUserIds: kernel.users.filter(({ status }) => status === 'active').map(({ id }) => id),
    };
  }

  private assertMaintenanceTechnician(userId: string): void {
    const scope = this.getAuthorizationScope();
    const user = this.kernelStore.getSnapshot().users.find(({ id }) => id === userId);
    if (
      !user || user.status !== 'active'
      || !user.companyIds.includes(scope.companyId)
      || !user.branchIds.includes(scope.branchId)
      || !user.roleIds.includes('role-maintenance-technician')
    ) {
      throw new Error('Assigned maintenance technician must hold the active maintenance-technician role in the current company and branch.');
    }
  }

  private deliveryContext() {
    const context = this.context();
    const approvedAvailabilityHours = Object.fromEntries(this.state.workforceAvailabilities.filter(({ status }) => status === 'approved').map((entry) => [`${entry.userId}:${entry.workDate}`, entry.availableHours]));
    const reservedAllocationHours = this.state.workforceAllocations.filter(({ status }) => status === 'reserved').reduce<Record<string, number>>((totals, allocation) => { const key = `${allocation.userId}:${allocation.workDate}`; totals[key] = (totals[key] ?? 0) + allocation.allocatedHours; return totals; }, {});
    return { activeAccountIds: context.accounts.map(({ id }) => id), activeAddressIds: context.addresses.map(({ id }) => id), addressAccountIds: Object.fromEntries(context.addresses.map((address) => [address.id, address.accountId])), activeUserIds: context.activeUserIds, workforceProfiles: workforceCapacityProfiles(this.state), approvedAvailabilityHours, reservedAllocationHours };
  }

  private assertFinanceApprover(actorId: string, action: string): void {
    const financeApprover = this.kernelStore
      .getSnapshot()
      .users.some(
        ({ id, status, roleIds }) =>
          id === actorId &&
          status === 'active' &&
          roleIds.includes('role-finance-approver'),
      );
    const bootstrapOwner = this.kernelStore.isBootstrapWorkspaceOwner(actorId);
    if (!financeApprover && !bootstrapOwner) {
      throw new Error(`${action} requires an active finance approver.`);
    }
  }

  private assertWorkforceApprover(actorId: string, action: string): void {
    if (!this.kernelStore.getSnapshot().users.some(({ id, status, roleIds }) => id === actorId && status === 'active' && (roleIds.includes('role-kernel-admin') || roleIds.includes('role-finance-approver')))) throw new Error(`${action} requires an active workforce-control approver.`);
  }

  private mutate(operation: (state: RevenueOpsState) => RevenueOpsState): Promise<RevenueOpsSnapshot> {
    return this.enqueue(async () => {
      this.state = withOperatingRecordScopes(operation(this.state));
      await this.persist();
      return this.getSnapshot();
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(task, task);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async persist(): Promise<void> {
    this.database.saveState('revenue-ops-india', this.state.schemaVersion, this.state.revision, this.state);
  }
}
