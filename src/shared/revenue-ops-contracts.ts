import type { DashboardSnapshot, Opportunity } from './contracts';
import type { RetailCutoverPlan } from './retail-cutover-contracts';
import type { PartyAccount, PartyAddress, PartyContact } from './party-contracts';
import type {
  BinBalance,
  CycleCountPlan,
  InventoryBatch,
  InventoryCostLayer,
  InventoryDisposition,
  InventoryItem,
  InventoryLedgerEntry,
  InventoryTransfer,
  InventoryValuationReview,
  ItemVariant,
  ReorderPolicy,
  ReorderProposal,
  SerialUnit,
  StorageBin,
  UnitOfMeasure,
  UomConversion,
  Warehouse,
  WarehouseTask,
  WarehouseZone,
} from './inventory-contracts';
import type { RetailCashierShift, RetailCounter, RetailReturn, RetailSale, RetailStoreCredit } from './retail-pos-contracts';
import type {
  RetailBarcodeSequence,
  RetailCatalogBrand,
  RetailCatalogCategory,
  RetailLabelPrintRun,
  RetailMerchandisingProfile,
  RetailProductCombo,
} from './retail-catalog-contracts';
import type { RetailExchange } from './retail-exchange-contracts';
import type { RetailCreditNoteReconciliation } from './retail-credit-note-contracts';
import type { RetailInterBranchTransfer } from './retail-interbranch-contracts';
import type { RetailCatalogBulkEdit, RetailLabelPrintDispatch, RetailPrinterAdapter, RetailScaleProfile } from './retail-catalog-operations-contracts';
import type { RetailLoyaltyAccount, RetailLoyaltyLedgerEntry, RetailVoucher } from './retail-loyalty-contracts';
import type { RetailCommissionPayoutBatch, RetailCustomerVisit, RetailSalesCommission } from './retail-customer-ops-contracts';
import type { RetailPromotionRedemption } from './retail-promotion-contracts';
import type { RetailCommerceCatalogMapping, RetailCommerceConflictResolution, RetailCommerceConformanceCase, RetailCommerceConnector, RetailCommerceOrder, RetailCommercePushBatch, RetailCommerceSyncRun, RetailOcrProviderProfile, RetailPurchaseException, RetailPurchaseOcrDocument, RetailPurchaseOcrMapping, RetailSettlementAllocationPack, RetailSettlementReconciliation, RetailSettlementWithholdingEvidence } from './retail-commerce-contracts';
import type { RetailOfflineSaleQueueItem, RetailOfflineSyncReceipt } from './retail-offline-sync-contracts';
import type { RetailDeviceTransportEvidence, RetailDeviceTransportPreflightResult } from './retail-device-transport-contracts';
import type { RetailDeviceAdapterProfile } from './retail-device-profile-contracts';
import type { RetailOrderIngestionState } from './retail-unified-order-contracts';
import type {
  ConsolidatedEwayBill,
  DigitalSignatureEvidence,
  PortalReconciliationRun,
  StatutoryAdapter,
  StatutoryOperation,
} from './statutory-contracts';
import type {
  ProviderConformanceCase,
  ProviderConnector,
  ProviderPreflightEvidence,
  ProviderReconciliationRun,
  ProviderSubmission,
} from './provider-contracts';
import type {
  GoodsReceipt,
  LandedCostAllocation,
  PurchaseOrder,
  PurchaseRequisition,
  RequestForQuotation,
  Supplier,
  SupplierInvoice,
  SupplierQuotation,
  ThreeWayMatch,
} from './procurement-contracts';
import type {
  BankAccountControl,
  BankStatementImport,
  BankStatementLine,
  CollectionActivity,
  CreditLimitControl,
  DunningCase,
  ReceivableDispute,
  WithholdingEntry,
  WithholdingPolicy,
  WriteOffRequest,
  ZeroRatedSupplyReview,
} from './collections-finance-contracts';
import type {
  BankCharge,
  CashForecastRun,
  LiquiditySweep,
  PaymentProposal,
  SettlementException,
  TreasuryPosition,
} from './treasury-contracts';
import type {
  BillOfMaterialRevision,
  Nonconformance,
  ProductionMaterialIssue,
  ProductionOutput,
  QualityInspection,
  QualityPlan,
  WorkCenter,
  WorkOrder,
} from './manufacturing-contracts';
import type {
  AssetCapitalization,
  AssetCategory,
  AssetCustodyTransfer,
  AssetComponentization,
  AssetComponentAllocation,
  AssetTransferAccounting,
  AssetSaleDisposal,
  AssetImpairmentReview,
  AssetRevaluation,
  AssetWarranty,
  AssetAmcContract,
  AssetMeter,
  AssetMeterReading,
  CorrectiveMaintenanceRequest,
  AssetCalibrationRecord,
  AssetSparePart,
  AssetSpareIssue,
  FleetVehicle,
  FleetTrip,
  AssetInstalledBaseEvent,
  AssetDepreciationPolicy,
  AssetDepreciationRun,
  AssetRetirement,
  ManagedAsset,
  MaintenanceWorkOrder,
  PreventiveMaintenancePlan,
} from './assets-maintenance-contracts';
import type {
  DeliveryProject,
  FieldServiceJob,
  ProjectTask,
  ServiceAgreement,
  SupportTicket,
  TimeEntry,
} from './delivery-contracts';
import type {
  ProjectedDeliveryProject,
  ProjectedTimeEntry,
} from './delivery-read-projection-contracts';
import type {
  WorkforceAllocation,
  WorkforceAvailability,
  WorkforceProfile,
} from './workforce-contracts';
import type {
  AccountingClosePeriod,
  ProjectBillingClaim,
  ProjectBillingPlan,
  RevenueRecognitionEvent,
  ServiceEntitlementUsage,
} from './financial-close-contracts';
import type {
  ProjectContractVariation,
  ProjectCurrencyProfile,
  ProjectExchangeRate,
  ProjectMarginReview,
  ProjectResourcePlan,
  ProjectRetainer,
  RetainerDrawdown,
} from './project-commercial-contracts';
import type {
  BenefitEnrollment,
  BenefitPlan,
  EmployerRegistration,
  ExpenseClaim,
  PayrollCompensation,
  PayrollAdjustment,
  PayrollPolicy,
  PayrollRun,
  PayrollSlip,
  PayrollStatutoryObligation,
  AttendanceRecord,
  LeaveApplication,
  LeaveType,
  PayslipDelivery,
  TaxDeclaration,
} from './payroll-contracts';

export type IndiaRegion = 'north' | 'west' | 'south' | 'east-northeast' | 'national';

export interface IndiaBusinessProfile {
  id: string;
  legalName: string;
  tradeName: string;
  gstRegistered: boolean;
  gstin: string;
  pan: string;
  udyamNumber: string;
  defaultStateCode: string;
  currency: 'INR';
  fiscalYearStartMonth: 4;
  /** Scoped finance master used for invoice payment instructions and treasury evidence. */
  primaryBankAccountId?: string;
  version: number;
}

export interface Territory {
  id: string;
  code: string;
  name: string;
  region: IndiaRegion;
  stateCodes: string[];
  managerUserId: string;
  active: boolean;
  version: number;
}

export interface AssignmentRule {
  id: string;
  name: string;
  field: 'stateCode' | 'source' | 'value';
  operator: 'equals' | 'in' | 'gte';
  value: string;
  territoryId: string;
  assigneeUserId: string;
  priority: number;
  active: boolean;
  version: number;
}

export interface OpportunityAssignment {
  id: string;
  opportunityId: string;
  territoryId: string;
  assigneeUserId: string;
  source: 'automatic' | 'manual';
  assignedAt: string;
  version: number;
}

export interface AudienceSegment {
  id: string;
  name: string;
  resource: 'account' | 'contact' | 'opportunity';
  stateCodes: string[];
  industries: string[];
  relationships: Array<PartyAccount['relationship']>;
  territoryIds: string[];
  minimumOpportunityValue: number;
  shared: boolean;
  active: boolean;
  version: number;
}

export interface ResolvedAudienceSegment extends AudienceSegment {
  memberIds: string[];
  memberCount: number;
}

export interface ProductInterest {
  id: string;
  opportunityId: string;
  accountId: string;
  name: string;
  kind: 'goods' | 'service';
  hsnSac: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  notes: string;
  catalogProductId?: string;
  version: number;
}

export type QuoteStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'converted';

export interface QuoteLine {
  id: string;
  productInterestId: string;
  description: string;
  hsnSac: string;
  quantity: number;
  unitPrice: number;
  taxableValue: number;
  gstRate: number;
  catalogProductId?: string;
  taxCodeId?: string;
  priceListEntryId?: string;
  listUnitPrice?: number;
  discountAmount?: number;
}

export interface QuoteTaxPreview {
  treatment: 'intra-state' | 'inter-state';
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** Optional for legacy commercial documents; retail pricing always snapshots it. */
  cess?: number;
  totalTax: number;
  grandTotal: number;
  determination: 'commercial-estimate';
}

export interface OperatingRecordScope {
  companyId: string;
  branchId: string;
}

export interface QuoteDraft {
  id: string;
  number: string;
  opportunityId: string;
  accountId: string;
  contactId?: string;
  placeOfSupplyStateCode: string;
  recipientTreatment: 'registered' | 'unregistered' | 'export';
  recipientGstin: string;
  currency: 'INR';
  status: QuoteStatus;
  validUntil: string;
  lines: QuoteLine[];
  taxPreview: QuoteTaxPreview;
  priceListId?: string;
  discountPolicyIds: string[];
  subtotal: number;
  discountTotal: number;
  pricingAsOf: string;
  revisionNumber: number;
  approvalRequestId?: string;
  createdBy: string;
  createdAt: string;
  scope?: OperatingRecordScope;
  version: number;
}

export type EffectiveReviewStatus = 'draft' | 'verified' | 'retired';

export interface GstTaxCode {
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  kind: 'HSN' | 'SAC';
  description: string;
  gstRate: number;
  cessRate: number;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceLabel: string;
  sourceUrl: string;
  reviewStatus: EffectiveReviewStatus;
  reviewedAt?: string;
  version: number;
}

export interface CatalogProduct {
  scope?: OperatingRecordScope;
  id: string;
  sku: string;
  name: string;
  description: string;
  kind: 'goods' | 'service';
  uom: string;
  taxCodeId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  active: boolean;
  version: number;
}

export interface PriceList {
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  currency: 'INR';
  channel: 'all' | 'direct' | 'partner' | 'retail';
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'draft' | 'submitted' | 'active' | 'rejected';
  active: boolean;
  approvalRequestId?: string;
  submittedBy?: string;
  submittedAt?: string;
  activatedBy?: string;
  activatedAt?: string;
  version: number;
}

export interface PriceListApprovalRequest {
  scope?: OperatingRecordScope;
  id: string;
  priceListId: string;
  requestedBy: string;
  requestedAt: string;
  reason: string;
  eligibleApproverIds: string[];
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  remarks?: string;
  version: number;
}

export interface PriceListEntry {
  scope?: OperatingRecordScope;
  id: string;
  priceListId: string;
  productId: string;
  unitPrice: number;
  /** Legacy commercial prices are exclusive unless the price tier says otherwise. */
  taxMode?: 'inclusive' | 'exclusive';
  minimumQuantity: number;
  effectiveFrom: string;
  effectiveTo?: string;
  version: number;
}

export interface DiscountPolicy {
  /** Branch ownership. `scope` below remains the commercial calculation scope. */
  operatingScope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  scope: 'order' | 'product';
  productId?: string;
  method: 'percentage' | 'fixed';
  value: number;
  minimumTaxableValue: number;
  maximumDiscountAmount: number;
  stackable: boolean;
  approvalThresholdPercent: number;
  /** Retail promotion extensions. Legacy policies default to `discount`. */
    promotionType?: 'discount' | 'bogo' | 'gift';
  eligibleCustomerAccountIds?: string[];
    eligibleLoyaltyTiers?: Array<'silver' | 'gold' | 'platinum'>;
    /** Retail shelf/rack campaign targeting. Empty means all retail merchandise. */
    eligibleRetailCategoryIds?: string[];
    eligibleRetailBrandIds?: string[];
    eligibleRetailRackBinIds?: string[];
    buyQuantity?: number;
    freeQuantity?: number;
    /** Gift SKU delivered at zero selling price when the qualifying policy fires. */
    giftItemVariantId?: string;
    giftQuantity?: number;
  campaignCode?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  active: boolean;
  version: number;
}

export interface QuoteApprovalRequest {
  scope?: OperatingRecordScope;
  id: string;
  quoteId: string;
  requestedBy: string;
  requestedAt: string;
  reason: string;
  eligibleApproverIds: string[];
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  remarks?: string;
  version: number;
}

export type SalesOrderStatus = 'confirmed' | 'fulfilling' | 'on-hold' | 'completed' | 'cancelled';
export type FulfilmentStatus = 'planned' | 'ready' | 'in-progress' | 'blocked' | 'completed';

export interface SalesOrder {
  id: string;
  number: string;
  /** Quote-originated orders retain quote evidence; counter orders do not invent it. */
  source?: 'quote' | 'retail-pos';
  quoteId?: string;
  quoteNumber?: string;
  retailSaleId?: string;
  accountId: string;
  contactId?: string;
  recipientTreatment?: QuoteDraft['recipientTreatment'];
  recipientGstin?: string;
  placeOfSupplyStateCode?: string;
  currency: 'INR';
  orderDate: string;
  requiredBy: string;
  status: SalesOrderStatus;
  fulfilmentStatus: FulfilmentStatus;
  lines: QuoteLine[];
  subtotal: number;
  discountTotal: number;
  taxPreview: QuoteTaxPreview;
  approvedQuoteVersion: number;
  createdBy: string;
  createdAt: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface FulfilmentTask {
  scope?: OperatingRecordScope;
  id: string;
  salesOrderId: string;
  lineId: string;
  kind: 'allocation' | 'dispatch' | 'delivery' | 'kickoff' | 'service-delivery' | 'acceptance';
  title: string;
  ownerUserId: string;
  dueAt: string;
  status: FulfilmentStatus;
  blockedReason?: string;
  version: number;
}

export interface QuoteDocumentReceipt {
  scope?: OperatingRecordScope;
  id: string;
  quoteId: string;
  quoteVersion: number;
  fileName: string;
  size: number;
  sha256: string;
  generatedBy: string;
  generatedAt: string;
}

export interface PaymentTerm {
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  dueDays: number;
  earlyPaymentDays: number;
  earlyPaymentDiscountPercent: number;
  active: boolean;
  version: number;
}

export interface DeliveryEvidence {
  scope?: OperatingRecordScope;
  id: string;
  salesOrderId: string;
  fulfilmentTaskId?: string;
  type: 'dispatch' | 'delivery' | 'customer-acceptance' | 'service-acceptance';
  reference: string;
  occurredAt: string;
  notes: string;
  capturedBy: string;
  capturedAt: string;
}

export type ServiceMilestoneStatus = 'planned' | 'ready' | 'accepted' | 'invoiced';

export interface ServiceMilestone {
  scope?: OperatingRecordScope;
  id: string;
  salesOrderId: string;
  lineId: string;
  name: string;
  percentage: number;
  dueDate: string;
  status: ServiceMilestoneStatus;
  acceptanceReference?: string;
  version: number;
}

export type InvoiceDocumentKind = 'tax-invoice' | 'bill-of-supply';
export type InvoiceStatus = 'draft' | 'issued' | 'partially-paid' | 'paid' | 'written-off' | 'cancelled';
export type IrpStatus = 'not-applicable' | 'required-review' | 'ready-to-report' | 'registered' | 'failed' | 'cancelled';

export interface TaxInvoice {
  id: string;
  number: string;
  documentKind: InvoiceDocumentKind;
  /** Omitted only for an in-person retail sale; legacy invoices are sales-order based. */
  sourceKind?: 'sales-order' | 'retail-sale';
  salesOrderId?: string;
  quoteId?: string;
  /** Present only for an atomic counter sale; it is never a substitute for a quote. */
  retailSaleId?: string;
  accountId: string;
  contactId?: string;
  recipientTreatment: QuoteDraft['recipientTreatment'];
  recipientGstin: string;
  placeOfSupplyStateCode: string;
  reverseCharge: boolean;
  currency: 'INR';
  invoiceDate: string;
  dueDate: string;
  paymentTermId: string;
  status: InvoiceStatus;
  irpStatus: IrpStatus;
  irn?: string;
  irpAcknowledgementNumber?: string;
  irpAcknowledgedAt?: string;
  zeroRatedSupplyId?: string;
  exportEndorsement?: string;
  destinationCountryCode?: string;
  lutBondNumber?: string;
  serviceMilestoneIds: string[];
  shipmentPackageIds: string[];
  projectBillingClaimIds?: string[];
  lines: QuoteLine[];
  subtotal: number;
  discountTotal: number;
  taxPreview: QuoteTaxPreview;
  amountDue: number;
  createdBy: string;
  createdAt: string;
  issuedBy?: string;
  issuedAt?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreditDebitNote {
  id: string;
  number: string;
  type: 'credit' | 'debit';
  invoiceId: string;
  reason: string;
  taxableValue: number;
  gstRate: number;
  taxAmount: number;
  totalAmount: number;
  noteDate: string;
  irpStatus: IrpStatus;
  createdBy: string;
  createdAt: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface Receivable {
  id: string;
  invoiceId: string;
  accountId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  originalAmount: number;
  adjustmentAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  withheldAmount?: number;
  writtenOffAmount?: number;
  status: 'current' | 'due' | 'overdue' | 'partially-paid' | 'paid' | 'disputed' | 'written-off';
  scope?: OperatingRecordScope;
  version: number;
}

export interface PaymentAllocation {
  receivableId: string;
  amount: number;
}

/**
 * An append-only allocation event for customer cash that was initially held
 * as unapplied. It records the evidence and before/after values needed to
 * explain a later AR application without inventing another cash receipt.
 */
export interface UnappliedCashApplication {
  id: string;
  evidenceReference: string;
  appliedBy: string;
  appliedAt: string;
  paymentJournalId: string;
  journalVersionBefore: number;
  journalVersionAfter: number;
  allocations: Array<{
    receivableId: string;
    amount: number;
    receivableVersionBefore: number;
    receivableVersionAfter: number;
    outstandingAmountBefore: number;
    outstandingAmountAfter: number;
  }>;
}

export interface PaymentReceipt {
  id: string;
  number: string;
  accountId: string;
  receivedAt: string;
  method: 'bank-transfer' | 'upi' | 'card' | 'cheque' | 'cash' | 'store-credit' | 'other';
  /** Cash is held in the controlled drawer; electronic tenders remain in clearing pending reconciliation. */
  settlementAccount?: 'cash-on-hand' | 'upi-clearing' | 'card-clearing' | 'bank-clearing';
  retailSaleId?: string;
  retailCashierShiftId?: string;
  reference: string;
  amount: number;
  allocations: PaymentAllocation[];
  unappliedAmount: number;
  status: 'recorded' | 'reconciled' | 'reversed';
  recordedBy: string;
  reconciledBy?: string;
  reconciledAt?: string;
  /** Existing receipts may omit this field; new applications always append evidence. */
  unappliedCashApplications?: UnappliedCashApplication[];
  scope?: OperatingRecordScope;
  version: number;
}

export interface JournalLine {
  accountCode: 'accounts-receivable' | 'sales-revenue' | 'unbilled-revenue' | 'output-cgst' | 'output-sgst' | 'output-igst' | 'output-cess' | 'bank-clearing' | 'cash-on-hand' | 'upi-clearing' | 'card-clearing' | 'unapplied-cash' | 'sales-adjustment' | 'cash-variance-expense' | 'cost-of-goods-sold' | 'bad-debt-expense' | 'asset-retirement-loss' | 'impairment-loss' | 'impairment-reversal-income' | 'revaluation-surplus' | 'revaluation-loss' | 'tds-receivable' | 'tds-payable' | 'tcs-payable' | 'inventory-asset' | 'inventory-in-transit' | 'fixed-assets' | 'accumulated-depreciation' | 'depreciation-expense' | 'input-cgst' | 'input-sgst' | 'input-igst' | 'accounts-payable' | 'landed-cost-clearing' | 'cash-at-bank' | 'cash-in-transit' | 'bank-charges-expense' | 'work-in-progress' | 'manufacturing-variance' | 'payroll-expense' | 'employer-contribution-expense' | 'payroll-payable' | 'statutory-payable' | 'employee-expense';
  debit: number;
  credit: number;
  memo: string;
}

export interface AccountingJournalDraft {
  id: string;
  sourceType: 'invoice' | 'credit-note' | 'debit-note' | 'payment' | 'retail-sale-cost' | 'retail-return-cost' | 'retail-return-settlement' | 'retail-commerce-settlement' | 'retail-commission-payout' | 'retail-inter-branch-transfer' | 'retail-cashier-variance' | 'write-off' | 'withholding' | 'supplier-invoice' | 'asset-capitalization' | 'asset-depreciation' | 'asset-retirement' | 'asset-transfer' | 'asset-sale-disposal' | 'asset-impairment' | 'asset-revaluation' | 'landed-cost' | 'treasury-payment' | 'bank-charge' | 'liquidity-sweep-release' | 'liquidity-sweep-settlement' | 'production-issue' | 'production-output' | 'revenue-recognition' | 'payroll-finalization' | 'expense-reimbursement';
  sourceId: string;
  sourceNumber: string;
  postingDate: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  status: 'draft' | 'ready' | 'exported';
  externalReference?: string;
  exportedAt?: string;
  exportedBy?: string;
  checksum: string;
  version: number;
}

export interface InvoiceDocumentReceipt {
  id: string;
  invoiceId: string;
  invoiceVersion: number;
  fileName: string;
  size: number;
  sha256: string;
  generatedBy: string;
  generatedAt: string;
}

export interface GstRegistration {
  id: string;
  label: string;
  gstin: string;
  stateCode: string;
  branchCode: string;
  address: string;
  primary: boolean;
  active: boolean;
  version: number;
}

export type PlaceOfSupplyReviewStatus = 'pending' | 'approved' | 'rejected';

export interface PlaceOfSupplyReview {
  id: string;
  salesOrderId: string;
  supplierRegistrationId: string;
  shipFromStateCode: string;
  shipToStateCode: string;
  shipToGstin?: string;
  placeOfSupplyStateCode: string;
  treatment: 'intra-state' | 'inter-state';
  basis: 'movement-terminates' | 'bill-to-ship-to' | 'registered-service-recipient' | 'manual-review';
  rationale: string;
  status: PlaceOfSupplyReviewStatus;
  requestedBy: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewEvidence?: string;
  version: number;
}

export interface StockLocation {
  /** Company and branch ownership for physical inventory custody. */
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  stateCode: string;
  gstRegistrationId?: string;
  active: boolean;
  version: number;
}

export interface StockPosition {
  /** Company and branch ownership for the derived legacy stock position. */
  scope?: OperatingRecordScope;
  id: string;
  locationId: string;
  productId: string;
  onHand: number;
  reserved: number;
  available: number;
  version: number;
}

export interface StockMovement {
  /** Company and branch ownership for immutable stock movement evidence. */
  scope?: OperatingRecordScope;
  id: string;
  locationId: string;
  productId: string;
  type: 'receipt' | 'adjustment-in' | 'adjustment-out' | 'reservation' | 'release' | 'issue' | 'return';
  quantity: number;
  reference: string;
  occurredAt: string;
  recordedBy: string;
  resultingOnHand: number;
  resultingReserved: number;
}

export interface StockReservation {
  /** Company and branch ownership for an order-locked stock allocation. */
  scope?: OperatingRecordScope;
  id: string;
  salesOrderId: string;
  lineId: string;
  locationId: string;
  productId: string;
  quantity: number;
  status: 'reserved' | 'packed' | 'released' | 'consumed';
  reservedBy: string;
  reservedAt: string;
  version: number;
}

export interface ShipmentPackageItem {
  reservationId: string;
  lineId: string;
  productId: string;
  quantity: number;
}

export type ShipmentStatus = 'planned' | 'packed' | 'ready-to-dispatch' | 'dispatched' | 'in-transit' | 'delivered' | 'return-in-progress' | 'returned' | 'cancelled';

export interface ShipmentPackage {
  /** Company and branch ownership for the physical dispatch package. */
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  salesOrderId: string;
  fromLocationId: string;
  shipToAddressId?: string;
  /** Immutable address evidence when a package is tied to a delivery promise. */
  shipToAddressSnapshot?: FrozenDeliveryAddress;
  deliveryPromiseId?: string;
  items: ShipmentPackageItem[];
  grossWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  status: ShipmentStatus;
  ewayBillRequired: boolean;
  carrierAdapterId?: string;
  trackingNumber?: string;
  vehicleNumber?: string;
  transportDocumentNumber?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  createdBy: string;
  createdAt: string;
  version: number;
}

export interface ShipmentEvent {
  /** Company and branch ownership for package movement evidence. */
  scope?: OperatingRecordScope;
  id: string;
  shipmentPackageId: string;
  status: ShipmentStatus;
  occurredAt: string;
  location: string;
  notes: string;
  source: 'operator' | 'carrier-adapter';
  recordedBy: string;
}

export interface CarrierAdapter {
  /** Company and branch ownership for carrier configuration metadata. */
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  mode: 'manual' | 'api';
  status: 'configured' | 'healthy' | 'degraded' | 'disabled';
  capability: Array<'booking' | 'tracking' | 'label' | 'proof-of-delivery'>;
  lastHealthCheckAt?: string;
  version: number;
}

export type DeliveryServiceLevel = 'standard' | 'express' | 'freight';
export type DeliveryPaymentMode = 'prepaid' | 'cod';
export type PincodeMatchKind = 'exact' | 'prefix' | 'range';
export type PincodeServiceabilityRuleStatus = 'draft' | 'active' | 'suspended';
export type DeliveryPromiseStatus = 'active' | 'superseded' | 'fulfilled' | 'cancelled';
export type ServiceabilityWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/**
 * A Party Master address frozen at promise/package time.  Party addresses can
 * evolve; a customer commitment and its dispatch evidence must not.
 */
export interface FrozenDeliveryAddress {
  addressId: string;
  label: string;
  line1: string;
  line2: string;
  city: string;
  stateCode: string;
  postalCode: string;
  countryCode: string;
  sourceVersion: number;
  capturedAt: string;
}

/** Effective-dated India domestic PIN-code policy, never a live carrier ETA. */
export interface PincodeServiceabilityRule {
  scope?: OperatingRecordScope;
  id: string;
  code: string;
  name: string;
  originLocationId: string;
  carrierAdapterId?: string;
  destinationStateCode?: string;
  pinMatchKind: PincodeMatchKind;
  pinStart: string;
  pinEnd?: string;
  serviceLevel: DeliveryServiceLevel;
  serviceable: boolean;
  codAllowed: boolean;
  codMaximumAmount?: number;
  maximumWeightKg?: number;
  cutoffLocalTime?: string;
  dispatchLeadBusinessDays: number;
  transitMinBusinessDays: number;
  transitMaxBusinessDays: number;
  workingDays: ServiceabilityWeekday[];
  priority: number;
  effectiveFrom: string;
  effectiveTo?: string;
  evidenceReference: string;
  status: PincodeServiceabilityRuleStatus;
  createdBy: string;
  createdAt: string;
  activatedBy?: string;
  activatedAt?: string;
  suspendedBy?: string;
  suspendedAt?: string;
  decisionRationale?: string;
  version: number;
}

/**
 * A deterministic, internal-policy promise. `calendarBasis` deliberately
 * states that public holidays and carrier feeds are not fabricated here.
 */
export interface DeliveryPromise {
  scope?: OperatingRecordScope;
  id: string;
  salesOrderId: string;
  shipToAddress: FrozenDeliveryAddress;
  originLocationId: string;
  carrierAdapterId?: string;
  ruleId: string;
  ruleCode: string;
  ruleVersion: number;
  serviceLevel: DeliveryServiceLevel;
  paymentMode: DeliveryPaymentMode;
  estimatedWeightKg: number;
  orderValue: number;
  dispatchBy: string;
  deliveryFrom: string;
  deliveryTo: string;
  timeZone: 'Asia/Kolkata';
  calendarBasis: 'weekly-policy-only';
  calculationFingerprint: string;
  status: DeliveryPromiseStatus;
  createdBy: string;
  createdAt: string;
  supersededAt?: string;
  fulfilledAt?: string;
  cancelledAt?: string;
  version: number;
}

/**
 * Immutable, human-verifiable custody evidence.  COD v1 intentionally keeps
 * this separate from carrier tracking: a tracking update is never cash
 * evidence, and a cash event is never a substitute for a bank match.
 */
export interface CodCustodyEvidence {
  reference: string;
  /** Exact ISO-8601 instant supplied with the underlying evidence. */
  occurredAt: string;
  /** Actor who recorded the evidence in Epic BOS. */
  recordedBy: string;
  /** Server-side append instant for the immutable evidence record. */
  recordedAt: string;
}

export interface CodAmountEvidence extends CodCustodyEvidence {
  amount: number;
}

export interface CodBankMatchEvidence extends CodCustodyEvidence {
  paymentReceiptId: string;
  paymentReceiptVersion: number;
  bankStatementLineId: string;
  bankStatementLineVersion: number;
  bankStatementReference: string;
}

export type CodCollectionCaseStatus =
  | 'expected'
  | 'handed-to-carrier'
  | 'carrier-collected'
  | 'remitted'
  | 'bank-matched'
  | 'shortfall'
  | 'refused-rto'
  | 'cancelled';

/**
 * An evidence-only cash-on-delivery custody case.
 *
 * It is deliberately not a consumer checkout, payment gateway, refund, or
 * carrier-integration record.  The case only connects already governed
 * physical, AR, payment, and bank evidence in one company and branch.
 */
export interface CodCollectionCase {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  currency: 'INR';
  deliveryPromiseId: string;
  shipmentPackageId: string;
  salesOrderId: string;
  carrierAdapterId: string;
  receivableId: string;
  expectedAmount: number;
  status: CodCollectionCaseStatus;
  handoverEvidence?: CodCustodyEvidence;
  carrierCollectionEvidence?: CodAmountEvidence;
  remittanceEvidence?: CodAmountEvidence;
  bankMatchEvidence?: CodBankMatchEvidence;
  shortfallAmount?: number;
  shortfallClosedBy?: string;
  shortfallClosedAt?: string;
  shortfallClosureReference?: string;
  exceptionEvidence?: CodCustodyEvidence & {
    kind: 'refused-rto' | 'cancelled';
    reason: string;
  };
  createdBy: string;
  createdAt: string;
  version: number;
}

export interface ReturnAuthorizationItem {
  lineId: string;
  productId: string;
  quantity: number;
}

export interface ReturnAuthorization {
  /** Company and branch ownership for the controlled return case. */
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  shipmentPackageId: string;
  reason: string;
  items: ReturnAuthorizationItem[];
  status: 'requested' | 'approved' | 'rejected' | 'received' | 'closed';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  inspectionStatus?: 'pending' | 'passed' | 'failed';
  disposition?: 'restock' | 'quarantine' | 'scrap' | 'return-to-vendor';
  inspectionEvidenceReference?: string;
  inspectionNotes?: string;
  inspectedBy?: string;
  inspectedAt?: string;
  version: number;
}

export type StatutoryExchangeStatus = 'prepared' | 'submitted' | 'acknowledged' | 'failed' | 'cancelled' | 'closed';

export interface StatutoryExchange {
  scope?: OperatingRecordScope;
  id: string;
  kind: 'e-invoice' | 'e-way-bill';
  sourceId: string;
  sourceNumber: string;
  gstRegistrationId: string;
  idempotencyKey: string;
  payloadChecksum: string;
  status: StatutoryExchangeStatus;
  requestReference?: string;
  externalNumber?: string;
  acknowledgementNumber?: string;
  acknowledgedAt?: string;
  validUntil?: string;
  qrPayload?: string;
  signedPayloadChecksum?: string;
  portalStatus?: 'unknown' | 'active' | 'cancelled' | 'closed' | 'not-found' | 'error';
  reconciliationState?: 'unverified' | 'matched' | 'drift' | 'missing' | 'error';
  lastPulledAt?: string;
  portalPayloadChecksum?: string;
  errorCode?: string;
  errorMessage?: string;
  vehicleNumber?: string;
  transportDocumentNumber?: string;
  preparedBy: string;
  preparedAt: string;
  submittedBy?: string;
  submittedAt?: string;
  version: number;
}

export interface RevenueOpsState {
  schemaVersion: 54;
  revision: number;
  scope: OperatingRecordScope;
  profile: IndiaBusinessProfile;
  territories: Territory[];
  assignmentRules: AssignmentRule[];
  assignments: OpportunityAssignment[];
  segments: AudienceSegment[];
  productInterests: ProductInterest[];
  quotes: QuoteDraft[];
  taxCodes: GstTaxCode[];
  products: CatalogProduct[];
  priceLists: PriceList[];
  priceListEntries: PriceListEntry[];
  priceListApprovalRequests: PriceListApprovalRequest[];
  discountPolicies: DiscountPolicy[];
  quoteApprovalRequests: QuoteApprovalRequest[];
  salesOrders: SalesOrder[];
  fulfilmentTasks: FulfilmentTask[];
  quoteDocuments: QuoteDocumentReceipt[];
  paymentTerms: PaymentTerm[];
  deliveryEvidence: DeliveryEvidence[];
  serviceMilestones: ServiceMilestone[];
  invoices: TaxInvoice[];
  creditDebitNotes: CreditDebitNote[];
  receivables: Receivable[];
  paymentReceipts: PaymentReceipt[];
  journalDrafts: AccountingJournalDraft[];
  invoiceDocuments: InvoiceDocumentReceipt[];
  gstRegistrations: GstRegistration[];
  placeOfSupplyReviews: PlaceOfSupplyReview[];
  stockLocations: StockLocation[];
  stockPositions: StockPosition[];
  stockMovements: StockMovement[];
  stockReservations: StockReservation[];
  shipmentPackages: ShipmentPackage[];
  shipmentEvents: ShipmentEvent[];
  carrierAdapters: CarrierAdapter[];
  pincodeServiceabilityRules: PincodeServiceabilityRule[];
  deliveryPromises: DeliveryPromise[];
  codCollectionCases: CodCollectionCase[];
  returnAuthorizations: ReturnAuthorization[];
  statutoryExchanges: StatutoryExchange[];
  uoms: UnitOfMeasure[];
  uomConversions: UomConversion[];
  inventoryItems: InventoryItem[];
  itemVariants: ItemVariant[];
  warehouses: Warehouse[];
  warehouseZones: WarehouseZone[];
  storageBins: StorageBin[];
  inventoryBatches: InventoryBatch[];
  serialUnits: SerialUnit[];
  binBalances: BinBalance[];
  inventoryCostLayers: InventoryCostLayer[];
  inventoryLedger: InventoryLedgerEntry[];
  warehouseTasks: WarehouseTask[];
  inventoryTransfers: InventoryTransfer[];
  cycleCountPlans: CycleCountPlan[];
  reorderPolicies: ReorderPolicy[];
  reorderProposals: ReorderProposal[];
  inventoryValuationReviews: InventoryValuationReview[];
  inventoryDispositions: InventoryDisposition[];
  retailCounters: RetailCounter[];
  retailCashierShifts: RetailCashierShift[];
  retailSales: RetailSale[];
  retailOfflineSaleQueue: RetailOfflineSaleQueueItem[];
  /** Append-only local recovery journal; absent on legacy snapshots. */
  retailOfflineSyncReceipts?: RetailOfflineSyncReceipt[];
  /** Source-neutral POS/web/app/WhatsApp/ONDC/marketplace order evidence. */
  retailUnifiedOrderIngestion?: RetailOrderIngestionState;
  retailDeviceTransportEvidence: RetailDeviceTransportEvidence[];
  retailDevicePreflightEvidence: Array<RetailDeviceTransportPreflightResult & { id: string; actorId: string; recordedAt: string; scope?: OperatingRecordScope; version: number }>;
  retailDeviceAdapterProfiles: RetailDeviceAdapterProfile[];
  retailReturns: RetailReturn[];
  retailExchanges: RetailExchange[];
  retailCreditNoteReconciliations: RetailCreditNoteReconciliation[];
  retailInterBranchTransfers: RetailInterBranchTransfer[];
  retailScaleProfiles: RetailScaleProfile[];
  retailPrinterAdapters: RetailPrinterAdapter[];
  retailLabelPrintDispatches: RetailLabelPrintDispatch[];
  retailCatalogBulkEdits: RetailCatalogBulkEdit[];
  retailStoreCredits: RetailStoreCredit[];
  retailCatalogCategories: RetailCatalogCategory[];
  retailCatalogBrands: RetailCatalogBrand[];
  retailMerchandisingProfiles: RetailMerchandisingProfile[];
  retailBarcodeSequences: RetailBarcodeSequence[];
  retailLabelPrintRuns: RetailLabelPrintRun[];
  retailProductCombos: RetailProductCombo[];
  retailLoyaltyAccounts: RetailLoyaltyAccount[];
  retailLoyaltyLedger: RetailLoyaltyLedgerEntry[];
  retailVouchers: RetailVoucher[];
  retailCustomerVisits: RetailCustomerVisit[];
  retailSalesCommissions: RetailSalesCommission[];
  retailCommissionPayoutBatches: RetailCommissionPayoutBatch[];
  retailPromotionRedemptions: RetailPromotionRedemption[];
  retailPurchaseOcrDocuments: RetailPurchaseOcrDocument[];
  retailCommerceConnectors: RetailCommerceConnector[];
  retailCommerceSyncRuns: RetailCommerceSyncRun[];
  retailCommerceOrders: RetailCommerceOrder[];
  retailCommerceCatalogMappings: RetailCommerceCatalogMapping[];
  retailSettlementReconciliations: RetailSettlementReconciliation[];
  retailSettlementAllocationPacks: RetailSettlementAllocationPack[];
  retailCommerceConflictResolutions: RetailCommerceConflictResolution[];
  retailSettlementWithholdingEvidence: RetailSettlementWithholdingEvidence[];
  retailOcrProviderProfiles: RetailOcrProviderProfile[];
  retailPurchaseOcrMappings: RetailPurchaseOcrMapping[];
  retailCommercePushBatches: RetailCommercePushBatch[];
  retailCommerceConformanceCases: RetailCommerceConformanceCase[];
  retailPurchaseExceptions: RetailPurchaseException[];
  /** Capability cutover plans are optional for backward-compatible state upgrades. */
  retailCutoverPlans?: RetailCutoverPlan[];
  statutoryAdapters: StatutoryAdapter[];
  statutoryOperations: StatutoryOperation[];
  consolidatedEwayBills: ConsolidatedEwayBill[];
  digitalSignatureEvidence: DigitalSignatureEvidence[];
  portalReconciliationRuns: PortalReconciliationRun[];
  providerConnectors: ProviderConnector[];
  providerConformanceCases: ProviderConformanceCase[];
  providerPreflightEvidence: ProviderPreflightEvidence[];
  providerSubmissions: ProviderSubmission[];
  providerReconciliationRuns: ProviderReconciliationRun[];
  creditLimitControls: CreditLimitControl[];
  dunningCases: DunningCase[];
  collectionActivities: CollectionActivity[];
  receivableDisputes: ReceivableDispute[];
  writeOffRequests: WriteOffRequest[];
  withholdingPolicies: WithholdingPolicy[];
  withholdingEntries: WithholdingEntry[];
  zeroRatedSupplyReviews: ZeroRatedSupplyReview[];
  bankAccounts: BankAccountControl[];
  bankStatementImports: BankStatementImport[];
  bankStatementLines: BankStatementLine[];
  purchaseRequisitions: PurchaseRequisition[];
  suppliers: Supplier[];
  requestForQuotations: RequestForQuotation[];
  supplierQuotations: SupplierQuotation[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  landedCostAllocations: LandedCostAllocation[];
  supplierInvoices: SupplierInvoice[];
  threeWayMatches: ThreeWayMatch[];
  treasuryPositions: TreasuryPosition[];
  cashForecastRuns: CashForecastRun[];
  paymentProposals: PaymentProposal[];
  bankCharges: BankCharge[];
  settlementExceptions: SettlementException[];
  liquiditySweeps: LiquiditySweep[];
  workCenters: WorkCenter[];
  assetCategories: AssetCategory[];
  managedAssets: ManagedAsset[];
  assetCapitalizations: AssetCapitalization[];
  assetDepreciationPolicies: AssetDepreciationPolicy[];
  assetDepreciationRuns: AssetDepreciationRun[];
  assetRetirements: AssetRetirement[];
  assetCustodyTransfers: AssetCustodyTransfer[];
  assetComponentizations: AssetComponentization[];
  assetComponentAllocations: AssetComponentAllocation[];
  assetTransferAccountings: AssetTransferAccounting[];
  assetSaleDisposals: AssetSaleDisposal[];
  assetImpairmentReviews: AssetImpairmentReview[];
  assetRevaluations: AssetRevaluation[];
  assetWarranties: AssetWarranty[];
  assetAmcContracts: AssetAmcContract[];
  assetMeters: AssetMeter[];
  assetMeterReadings: AssetMeterReading[];
  correctiveMaintenanceRequests: CorrectiveMaintenanceRequest[];
  assetCalibrations: AssetCalibrationRecord[];
  assetSpareParts: AssetSparePart[];
  assetSpareIssues: AssetSpareIssue[];
  fleetVehicles: FleetVehicle[];
  fleetTrips: FleetTrip[];
  assetInstalledBaseEvents: AssetInstalledBaseEvent[];
  preventiveMaintenancePlans: PreventiveMaintenancePlan[];
  maintenanceWorkOrders: MaintenanceWorkOrder[];
  bomRevisions: BillOfMaterialRevision[];
  qualityPlans: QualityPlan[];
  workOrders: WorkOrder[];
  productionMaterialIssues: ProductionMaterialIssue[];
  qualityInspections: QualityInspection[];
  nonconformances: Nonconformance[];
  productionOutputs: ProductionOutput[];
  deliveryProjects: DeliveryProject[];
  projectTasks: ProjectTask[];
  timeEntries: TimeEntry[];
  serviceAgreements: ServiceAgreement[];
  supportTickets: SupportTicket[];
  fieldServiceJobs: FieldServiceJob[];
  workforceProfiles: WorkforceProfile[];
  workforceAvailabilities: WorkforceAvailability[];
  workforceAllocations: WorkforceAllocation[];
  projectBillingPlans: ProjectBillingPlan[];
  projectBillingClaims: ProjectBillingClaim[];
  revenueRecognitionEvents: RevenueRecognitionEvent[];
  serviceEntitlementUsage: ServiceEntitlementUsage[];
  accountingClosePeriods: AccountingClosePeriod[];
  projectExchangeRates: ProjectExchangeRate[];
  projectCurrencyProfiles: ProjectCurrencyProfile[];
  projectContractVariations: ProjectContractVariation[];
  projectRetainers: ProjectRetainer[];
  retainerDrawdowns: RetainerDrawdown[];
  projectResourcePlans: ProjectResourcePlan[];
  projectMarginReviews: ProjectMarginReview[];
  employerRegistrations: EmployerRegistration[];
  payrollPolicies: PayrollPolicy[];
  payrollCompensations: PayrollCompensation[];
  benefitPlans: BenefitPlan[];
  benefitEnrollments: BenefitEnrollment[];
  payrollRuns: PayrollRun[];
  payrollSlips: PayrollSlip[];
  payrollStatutoryObligations: PayrollStatutoryObligation[];
  expenseClaims: ExpenseClaim[];
  attendanceRecords: AttendanceRecord[];
  leaveTypes: LeaveType[];
  leaveApplications: LeaveApplication[];
  payrollAdjustments: PayrollAdjustment[];
  taxDeclarations: TaxDeclaration[];
  payslipDeliveries: PayslipDelivery[];
}

export interface TerritoryPerformance {
  territoryId: string;
  pipelineValue: number;
  weightedValue: number;
  opportunityCount: number;
  atRiskCount: number;
}

export interface RevenueOpsReadProjection {
  companyId: string;
  branchId: string;
  generatedForUserId?: string;
  hiddenCollections: string[];
  redactedFields: Record<string, string[]>;
  redactedMetrics: string[];
}

type ReadRedacted<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type ProjectedWorkforceProfile = ReadRedacted<WorkforceProfile, 'hourlyCost'>;
export type ProjectedPayrollCompensation = ReadRedacted<PayrollCompensation, 'monthlyBasic' | 'monthlyAllowances' | 'paymentReferenceToken'>;
export type ProjectedPayrollRun = ReadRedacted<PayrollRun, 'totalGrossPay' | 'totalEmployeeDeductions' | 'totalEmployerContributions' | 'totalNetPay' | 'paymentReference'>;
export type ProjectedPayrollSlip = ReadRedacted<PayrollSlip, 'lines' | 'grossPay' | 'employeeDeductions' | 'employerContributions' | 'netPay'>;
export type ProjectedTaxDeclaration = ReadRedacted<TaxDeclaration, 'taxRegime' | 'items' | 'totalDeclaredAmount'>;

export interface RevenueOpsMetrics {
  assignedCoverage: number;
  indiaPipeline: number;
  quoteValue: number;
  segmentReach: number;
  atRiskValue: number;
  pendingApprovals: number;
  confirmedOrderValue: number;
  fulfilmentCompletion: number;
  billedValue: number;
  outstandingReceivables: number;
  overdueReceivables: number;
  unappliedCash: number;
  availableStock: number;
  reservedStock: number;
  activeShipments: number;
  statutoryExceptions: number;
  inventoryValue: number;
  expiringQuantity: number;
  countVariance: number;
  reorderAlerts: number;
  warehouseTaskBacklog: number;
  statutoryCredentialGaps: number;
  portalDrift: number;
  expiringEwayBills: number;
  unverifiedSignatures: number;
  creditLimitBreaches: number;
  collectionsAtRisk: number;
  openDisputes: number;
  pendingWriteOffs: number;
  withholdingOpen: number;
  zeroRatedPending: number;
  bankUnmatched: number;
  requisitionsAwaitingApproval: number;
  supplierQualificationPending: number;
  rfqInMarket: number;
  purchaseOrderCommitment: number;
  receiptAwaitingCost: number;
  threeWayVariance: number;
  liquidityAvailable: number;
  forecastLowPoint: number;
  paymentAwaitingApproval: number;
  paymentAwaitingRelease: number;
  settlementExceptionsOpen: number;
  bankChargesMonth: number;
  productionReleased: number;
  productionInProgress: number;
  capacityLoadPercent: number;
  qualityHolds: number;
  openNonconformances: number;
  productionOutputValue: number;
  activeProjects: number;
  projectBudgetAtRisk: number;
  approvedBillableHours: number;
  supportOpen: number;
  slaBreaches: number;
  activeWorkforce: number;
  fieldEligibleWorkforce: number;
  approvedUnavailableHours: number;
  reservedWorkforceHours: number;
  approvedDeliveryCost: number;
  activeBillingPlans: number;
  recognizedUnbilledRevenue: number;
  entitlementHoursRemaining: number;
  entitlementOverageHours: number;
  closePeriodsPending: number;
  closedClosePeriods: number;
  projectVariationsAwaitingApproval: number;
  activeRetainerValue: number;
  retainerDrawdownsAwaitingReview: number;
  activeResourcePlans: number;
  projectMarginAtRisk: number;
  foreignCurrencyProjects: number;
  projectFxRateGaps: number;
  payrollAwaitingApproval: number;
  payrollFinalizedThisMonth: number;
  payrollNetPayThisMonth: number;
  statutoryObligationsOpen: number;
  expensesAwaitingApproval: number;
  expensesAwaitingReimbursement: number;
  activeBenefitEnrollments: number;
  attendanceAwaitingReview: number;
  leaveAwaitingReview: number;
  approvedLeaveDaysThisYear: number;
  payrollAdjustmentsAwaitingApproval: number;
  taxDeclarationsAwaitingReview: number;
  releasedPayslipsUndelivered: number;
  providerCredentialGaps: number;
  providerConformanceGaps: number;
  providerHandoffsAwaitingEvidence: number;
  providerReconciliationExceptions: number;
  fieldJobsActive: number;
  fieldJobsCompleted: number;
}

export type PeopleRestrictedMetric =
  | 'activeWorkforce'
  | 'fieldEligibleWorkforce'
  | 'approvedUnavailableHours'
  | 'reservedWorkforceHours'
  | 'approvedDeliveryCost'
  | 'payrollAwaitingApproval'
  | 'payrollFinalizedThisMonth'
  | 'payrollNetPayThisMonth'
  | 'statutoryObligationsOpen'
  | 'expensesAwaitingApproval'
  | 'expensesAwaitingReimbursement'
  | 'activeBenefitEnrollments'
  | 'attendanceAwaitingReview'
  | 'leaveAwaitingReview'
  | 'approvedLeaveDaysThisYear'
  | 'payrollAdjustmentsAwaitingApproval'
  | 'taxDeclarationsAwaitingReview'
  | 'releasedPayslipsUndelivered';

export type DeliveryRestrictedMetric =
  | 'activeProjects'
  | 'projectBudgetAtRisk'
  | 'approvedBillableHours'
  | 'approvedDeliveryCost'
  | 'supportOpen'
  | 'slaBreaches'
  | 'fieldJobsActive'
  | 'fieldJobsCompleted';

export type FinanceRestrictedMetric =
  | 'billedValue'
  | 'outstandingReceivables'
  | 'overdueReceivables'
  | 'unappliedCash'
  | 'creditLimitBreaches'
  | 'collectionsAtRisk'
  | 'openDisputes'
  | 'pendingWriteOffs'
  | 'withholdingOpen'
  | 'zeroRatedPending'
  | 'bankUnmatched'
  | 'liquidityAvailable'
  | 'forecastLowPoint'
  | 'paymentAwaitingApproval'
  | 'paymentAwaitingRelease'
  | 'settlementExceptionsOpen'
  | 'bankChargesMonth';

export type SupplyChainRestrictedMetric =
  | 'availableStock'
  | 'reservedStock'
  | 'activeShipments'
  | 'inventoryValue'
  | 'expiringQuantity'
  | 'countVariance'
  | 'reorderAlerts'
  | 'warehouseTaskBacklog'
  | 'requisitionsAwaitingApproval'
  | 'supplierQualificationPending'
  | 'rfqInMarket'
  | 'purchaseOrderCommitment'
  | 'receiptAwaitingCost'
  | 'threeWayVariance';

export type StatutoryProviderRestrictedMetric =
  | 'statutoryExceptions'
  | 'statutoryCredentialGaps'
  | 'portalDrift'
  | 'expiringEwayBills'
  | 'unverifiedSignatures'
  | 'providerCredentialGaps'
  | 'providerConformanceGaps'
  | 'providerHandoffsAwaitingEvidence'
  | 'providerReconciliationExceptions';

export type ManufacturingRestrictedMetric =
  | 'productionReleased'
  | 'productionInProgress'
  | 'capacityLoadPercent'
  | 'qualityHolds'
  | 'openNonconformances'
  | 'productionOutputValue';

export type ProjectFinanceRestrictedMetric =
  | 'activeBillingPlans' | 'recognizedUnbilledRevenue' | 'entitlementHoursRemaining' | 'entitlementOverageHours'
  | 'closePeriodsPending' | 'closedClosePeriods' | 'projectVariationsAwaitingApproval' | 'activeRetainerValue'
  | 'retainerDrawdownsAwaitingReview' | 'activeResourcePlans' | 'projectMarginAtRisk' | 'foreignCurrencyProjects' | 'projectFxRateGaps';

export type SalesRestrictedMetric =
  | 'quoteValue'
  | 'pendingApprovals'
  | 'confirmedOrderValue';

type ReadRestrictedMetric = PeopleRestrictedMetric | DeliveryRestrictedMetric | FinanceRestrictedMetric | SupplyChainRestrictedMetric | StatutoryProviderRestrictedMetric | ManufacturingRestrictedMetric | ProjectFinanceRestrictedMetric | SalesRestrictedMetric;

export type ProjectedRevenueOpsMetrics = Omit<RevenueOpsMetrics, ReadRestrictedMetric>
  & Partial<Pick<RevenueOpsMetrics, ReadRestrictedMetric>>;

export interface RevenueOpsSnapshot {
  revision: number;
  generatedAt: string;
  scope: OperatingRecordScope;
  readProjection: RevenueOpsReadProjection;
  profile: IndiaBusinessProfile;
  territories: Territory[];
  assignmentRules: AssignmentRule[];
  assignments: OpportunityAssignment[];
  segments: ResolvedAudienceSegment[];
  productInterests: ProductInterest[];
  quotes: QuoteDraft[];
  taxCodes: GstTaxCode[];
  products: CatalogProduct[];
  priceLists: PriceList[];
  priceListEntries: PriceListEntry[];
  priceListApprovalRequests: PriceListApprovalRequest[];
  discountPolicies: DiscountPolicy[];
  quoteApprovalRequests: QuoteApprovalRequest[];
  salesOrders: SalesOrder[];
  fulfilmentTasks: FulfilmentTask[];
  quoteDocuments: QuoteDocumentReceipt[];
  paymentTerms: PaymentTerm[];
  deliveryEvidence: DeliveryEvidence[];
  serviceMilestones: ServiceMilestone[];
  invoices: TaxInvoice[];
  creditDebitNotes: CreditDebitNote[];
  receivables: Receivable[];
  paymentReceipts: PaymentReceipt[];
  journalDrafts: AccountingJournalDraft[];
  invoiceDocuments: InvoiceDocumentReceipt[];
  gstRegistrations: GstRegistration[];
  placeOfSupplyReviews: PlaceOfSupplyReview[];
  stockLocations: StockLocation[];
  stockPositions: StockPosition[];
  stockMovements: StockMovement[];
  stockReservations: StockReservation[];
  shipmentPackages: ShipmentPackage[];
  shipmentEvents: ShipmentEvent[];
  carrierAdapters: CarrierAdapter[];
  pincodeServiceabilityRules: PincodeServiceabilityRule[];
  deliveryPromises: DeliveryPromise[];
  codCollectionCases: CodCollectionCase[];
  returnAuthorizations: ReturnAuthorization[];
  statutoryExchanges: StatutoryExchange[];
  uoms: UnitOfMeasure[];
  uomConversions: UomConversion[];
  inventoryItems: InventoryItem[];
  itemVariants: ItemVariant[];
  warehouses: Warehouse[];
  warehouseZones: WarehouseZone[];
  storageBins: StorageBin[];
  inventoryBatches: InventoryBatch[];
  serialUnits: SerialUnit[];
  binBalances: BinBalance[];
  inventoryCostLayers: InventoryCostLayer[];
  inventoryLedger: InventoryLedgerEntry[];
  warehouseTasks: WarehouseTask[];
  inventoryTransfers: InventoryTransfer[];
  cycleCountPlans: CycleCountPlan[];
  reorderPolicies: ReorderPolicy[];
  reorderProposals: ReorderProposal[];
  inventoryValuationReviews: InventoryValuationReview[];
  inventoryDispositions: InventoryDisposition[];
  retailCounters: RetailCounter[];
  retailCashierShifts: RetailCashierShift[];
  retailSales: RetailSale[];
  retailOfflineSaleQueue: RetailOfflineSaleQueueItem[];
  /** Append-only local recovery journal; absent on legacy snapshots. */
  retailOfflineSyncReceipts?: RetailOfflineSyncReceipt[];
  /** Source-neutral POS/web/app/WhatsApp/ONDC/marketplace order evidence. */
  retailUnifiedOrderIngestion?: RetailOrderIngestionState;
  retailDeviceTransportEvidence: RetailDeviceTransportEvidence[];
  retailDevicePreflightEvidence: Array<RetailDeviceTransportPreflightResult & { id: string; actorId: string; recordedAt: string; scope?: OperatingRecordScope; version: number }>;
  retailDeviceAdapterProfiles: RetailDeviceAdapterProfile[];
  retailReturns: RetailReturn[];
  retailExchanges: RetailExchange[];
  retailCreditNoteReconciliations: RetailCreditNoteReconciliation[];
  retailInterBranchTransfers: RetailInterBranchTransfer[];
  retailScaleProfiles: RetailScaleProfile[];
  retailPrinterAdapters: RetailPrinterAdapter[];
  retailLabelPrintDispatches: RetailLabelPrintDispatch[];
  retailCatalogBulkEdits: RetailCatalogBulkEdit[];
  retailStoreCredits: RetailStoreCredit[];
  retailCatalogCategories: RetailCatalogCategory[];
  retailCatalogBrands: RetailCatalogBrand[];
  retailMerchandisingProfiles: RetailMerchandisingProfile[];
  retailBarcodeSequences: RetailBarcodeSequence[];
  retailLabelPrintRuns: RetailLabelPrintRun[];
  retailProductCombos: RetailProductCombo[];
  retailLoyaltyAccounts: RetailLoyaltyAccount[];
  retailLoyaltyLedger: RetailLoyaltyLedgerEntry[];
  retailVouchers: RetailVoucher[];
  retailCustomerVisits: RetailCustomerVisit[];
  retailSalesCommissions: RetailSalesCommission[];
  retailCommissionPayoutBatches: RetailCommissionPayoutBatch[];
  retailPromotionRedemptions: RetailPromotionRedemption[];
  retailPurchaseOcrDocuments: RetailPurchaseOcrDocument[];
  retailCommerceConnectors: RetailCommerceConnector[];
  retailCommerceSyncRuns: RetailCommerceSyncRun[];
  retailCommerceOrders: RetailCommerceOrder[];
  retailCommerceCatalogMappings: RetailCommerceCatalogMapping[];
  retailSettlementReconciliations: RetailSettlementReconciliation[];
  retailSettlementAllocationPacks: RetailSettlementAllocationPack[];
  retailCommerceConflictResolutions: RetailCommerceConflictResolution[];
  retailSettlementWithholdingEvidence: RetailSettlementWithholdingEvidence[];
  retailOcrProviderProfiles: RetailOcrProviderProfile[];
  retailPurchaseOcrMappings: RetailPurchaseOcrMapping[];
  retailCommercePushBatches: RetailCommercePushBatch[];
  retailCommerceConformanceCases: RetailCommerceConformanceCase[];
  retailPurchaseExceptions: RetailPurchaseException[];
  statutoryAdapters: StatutoryAdapter[];
  statutoryOperations: StatutoryOperation[];
  consolidatedEwayBills: ConsolidatedEwayBill[];
  digitalSignatureEvidence: DigitalSignatureEvidence[];
  portalReconciliationRuns: PortalReconciliationRun[];
  providerConnectors: ProviderConnector[];
  providerConformanceCases: ProviderConformanceCase[];
  providerPreflightEvidence: ProviderPreflightEvidence[];
  providerSubmissions: ProviderSubmission[];
  providerReconciliationRuns: ProviderReconciliationRun[];
  creditLimitControls: CreditLimitControl[];
  dunningCases: DunningCase[];
  collectionActivities: CollectionActivity[];
  receivableDisputes: ReceivableDispute[];
  writeOffRequests: WriteOffRequest[];
  withholdingPolicies: WithholdingPolicy[];
  withholdingEntries: WithholdingEntry[];
  zeroRatedSupplyReviews: ZeroRatedSupplyReview[];
  bankAccounts: BankAccountControl[];
  bankStatementImports: BankStatementImport[];
  bankStatementLines: BankStatementLine[];
  purchaseRequisitions: PurchaseRequisition[];
  suppliers: Supplier[];
  requestForQuotations: RequestForQuotation[];
  supplierQuotations: SupplierQuotation[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  landedCostAllocations: LandedCostAllocation[];
  supplierInvoices: SupplierInvoice[];
  threeWayMatches: ThreeWayMatch[];
  treasuryPositions: TreasuryPosition[];
  cashForecastRuns: CashForecastRun[];
  paymentProposals: PaymentProposal[];
  bankCharges: BankCharge[];
  settlementExceptions: SettlementException[];
  liquiditySweeps: LiquiditySweep[];
  workCenters: WorkCenter[];
  assetCategories: AssetCategory[];
  managedAssets: ManagedAsset[];
  assetCapitalizations: AssetCapitalization[];
  assetDepreciationPolicies: AssetDepreciationPolicy[];
  assetDepreciationRuns: AssetDepreciationRun[];
  assetRetirements: AssetRetirement[];
  assetCustodyTransfers: AssetCustodyTransfer[];
  assetComponentizations: AssetComponentization[];
  assetComponentAllocations: AssetComponentAllocation[];
  assetTransferAccountings: AssetTransferAccounting[];
  assetSaleDisposals: AssetSaleDisposal[];
  assetImpairmentReviews: AssetImpairmentReview[];
  assetRevaluations: AssetRevaluation[];
  assetWarranties: AssetWarranty[];
  assetAmcContracts: AssetAmcContract[];
  assetMeters: AssetMeter[];
  assetMeterReadings: AssetMeterReading[];
  correctiveMaintenanceRequests: CorrectiveMaintenanceRequest[];
  assetCalibrations: AssetCalibrationRecord[];
  assetSpareParts: AssetSparePart[];
  assetSpareIssues: AssetSpareIssue[];
  fleetVehicles: FleetVehicle[];
  fleetTrips: FleetTrip[];
  assetInstalledBaseEvents: AssetInstalledBaseEvent[];
  preventiveMaintenancePlans: PreventiveMaintenancePlan[];
  maintenanceWorkOrders: MaintenanceWorkOrder[];
  bomRevisions: BillOfMaterialRevision[];
  qualityPlans: QualityPlan[];
  workOrders: WorkOrder[];
  productionMaterialIssues: ProductionMaterialIssue[];
  qualityInspections: QualityInspection[];
  nonconformances: Nonconformance[];
  productionOutputs: ProductionOutput[];
  deliveryProjects: ProjectedDeliveryProject[];
  projectTasks: ProjectTask[];
  timeEntries: ProjectedTimeEntry[];
  serviceAgreements: ServiceAgreement[];
  supportTickets: SupportTicket[];
  fieldServiceJobs: FieldServiceJob[];
  workforceProfiles: ProjectedWorkforceProfile[];
  workforceAvailabilities: WorkforceAvailability[];
  workforceAllocations: WorkforceAllocation[];
  projectBillingPlans: ProjectBillingPlan[];
  projectBillingClaims: ProjectBillingClaim[];
  revenueRecognitionEvents: RevenueRecognitionEvent[];
  serviceEntitlementUsage: ServiceEntitlementUsage[];
  accountingClosePeriods: AccountingClosePeriod[];
  projectExchangeRates: ProjectExchangeRate[];
  projectCurrencyProfiles: ProjectCurrencyProfile[];
  projectContractVariations: ProjectContractVariation[];
  projectRetainers: ProjectRetainer[];
  retainerDrawdowns: RetainerDrawdown[];
  projectResourcePlans: ProjectResourcePlan[];
  projectMarginReviews: ProjectMarginReview[];
  employerRegistrations: EmployerRegistration[];
  payrollPolicies: PayrollPolicy[];
  payrollCompensations: ProjectedPayrollCompensation[];
  benefitPlans: BenefitPlan[];
  benefitEnrollments: BenefitEnrollment[];
  payrollRuns: ProjectedPayrollRun[];
  payrollSlips: ProjectedPayrollSlip[];
  payrollStatutoryObligations: PayrollStatutoryObligation[];
  expenseClaims: ExpenseClaim[];
  attendanceRecords: AttendanceRecord[];
  leaveTypes: LeaveType[];
  leaveApplications: LeaveApplication[];
  payrollAdjustments: PayrollAdjustment[];
  taxDeclarations: ProjectedTaxDeclaration[];
  payslipDeliveries: PayslipDelivery[];
  territoryPerformance: TerritoryPerformance[];
  metrics: ProjectedRevenueOpsMetrics;
}

export interface RevenueOpsContext {
  opportunities: Opportunity[];
  accounts: PartyAccount[];
  contacts: PartyContact[];
  addresses: PartyAddress[];
  activeUserIds: string[];
}

export interface UpdateIndiaProfileInput {
  legalName: string;
  tradeName: string;
  gstRegistered: boolean;
  gstin: string;
  pan: string;
  udyamNumber: string;
  defaultStateCode: string;
  primaryBankAccountId?: string;
  expectedVersion: number;
}

export interface CreateTerritoryInput {
  code: string;
  name: string;
  region: IndiaRegion;
  stateCodes: string[];
  managerUserId: string;
}

export interface CreateAssignmentRuleInput {
  name: string;
  field: AssignmentRule['field'];
  operator: AssignmentRule['operator'];
  value: string;
  territoryId: string;
  assigneeUserId: string;
  priority: number;
}

export interface BulkAssignInput {
  opportunityIds: string[];
  expectedVersions: Record<string, number>;
  territoryId: string;
  assigneeUserId: string;
}

export interface CreateAudienceSegmentInput {
  name: string;
  resource: AudienceSegment['resource'];
  stateCodes: string[];
  industries: string[];
  relationships: AudienceSegment['relationships'];
  territoryIds: string[];
  minimumOpportunityValue: number;
  shared: boolean;
}

export interface CreateIndiaOpportunityInput {
  title: string;
  accountId: string;
  contactId?: string;
  stateCode: string;
  source: string;
  value: number;
  expectedClose: string;
  nextStep: string;
  productName: string;
  productKind: ProductInterest['kind'];
  hsnSac: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
}

export interface RegisterIndiaOpportunityInput extends CreateIndiaOpportunityInput {
  opportunityId: string;
  actorId: string;
  assignedUserId: string;
  territoryId: string;
  assignmentSource: OpportunityAssignment['source'];
}

export interface CreateQuoteInput {
  opportunityId: string;
  contactId?: string;
  placeOfSupplyStateCode: string;
  recipientTreatment: QuoteDraft['recipientTreatment'];
  recipientGstin: string;
  validUntil: string;
  priceListId?: string;
  discountPolicyIds?: string[];
}

export interface CreateGstTaxCodeInput {
  code: string;
  kind: GstTaxCode['kind'];
  description: string;
  gstRate: number;
  cessRate: number;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceLabel: string;
  sourceUrl: string;
  reviewStatus: EffectiveReviewStatus;
}

export interface CreateCatalogProductInput {
  sku: string;
  name: string;
  description: string;
  kind: CatalogProduct['kind'];
  uom: string;
  taxCodeId: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

/** Raw, maker-checker controlled product-pack execution input. The main process
 * revalidates the CSV against the current catalog revision before mutating it. */
export interface ImportRetailProductPackInput {
  csv: string;
  expectedRevision: number;
  checkerId: string;
  evidenceReference: string;
  now?: string;
}

export interface CreatePriceListInput {
  code: string;
  name: string;
  channel: PriceList['channel'];
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface CreatePriceListEntryInput {
  priceListId: string;
  productId: string;
  unitPrice: number;
  /** Retail shelves can publish GST-inclusive prices; commercial tiers remain exclusive by default. */
  taxMode?: PriceListEntry['taxMode'];
  minimumQuantity: number;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface CreateDiscountPolicyInput {
  code: string;
  name: string;
  scope: DiscountPolicy['scope'];
  productId?: string;
  method: DiscountPolicy['method'];
  value: number;
  minimumTaxableValue: number;
  maximumDiscountAmount: number;
  stackable: boolean;
  approvalThresholdPercent: number;
  promotionType?: DiscountPolicy['promotionType'];
  eligibleCustomerAccountIds?: string[];
  eligibleLoyaltyTiers?: DiscountPolicy['eligibleLoyaltyTiers'];
  eligibleRetailCategoryIds?: DiscountPolicy['eligibleRetailCategoryIds'];
  eligibleRetailBrandIds?: DiscountPolicy['eligibleRetailBrandIds'];
  eligibleRetailRackBinIds?: DiscountPolicy['eligibleRetailRackBinIds'];
  buyQuantity?: number;
  freeQuantity?: number;
  giftItemVariantId?: DiscountPolicy['giftItemVariantId'];
  giftQuantity?: DiscountPolicy['giftQuantity'];
  campaignCode?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface SubmitPriceListForApprovalInput {
  id: string;
  expectedVersion: number;
  reason: string;
}

export interface DecidePriceListApprovalInput {
  requestId: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface SubmitQuoteForApprovalInput {
  id: string;
  expectedVersion: number;
  reason: string;
}

export interface DecideQuoteApprovalInput {
  requestId: string;
  decision: 'approved' | 'rejected';
  remarks: string;
  expectedVersion: number;
}

export interface ConvertQuoteToSalesOrderInput {
  quoteId: string;
  expectedVersion: number;
  orderDate: string;
  requiredBy: string;
}

export interface TransitionSalesOrderInput {
  id: string;
  toStatus: SalesOrderStatus;
  expectedVersion: number;
}

export interface UpdateFulfilmentTaskInput {
  id: string;
  toStatus: FulfilmentStatus;
  blockedReason?: string;
  expectedVersion: number;
}

export interface ExportQuotePdfInput {
  quoteId: string;
}

export interface CreatePaymentTermInput {
  code: string;
  name: string;
  dueDays: number;
  earlyPaymentDays: number;
  earlyPaymentDiscountPercent: number;
}

export interface RecordDeliveryEvidenceInput {
  salesOrderId: string;
  fulfilmentTaskId?: string;
  type: DeliveryEvidence['type'];
  reference: string;
  occurredAt: string;
  notes: string;
}

export interface CreateServiceMilestoneInput {
  salesOrderId: string;
  lineId: string;
  name: string;
  percentage: number;
  dueDate: string;
}

export interface TransitionServiceMilestoneInput {
  id: string;
  toStatus: ServiceMilestoneStatus;
  acceptanceReference?: string;
  expectedVersion: number;
}

export interface CreateInvoiceDraftInput {
  salesOrderId: string;
  documentKind: InvoiceDocumentKind;
  invoiceDate: string;
  paymentTermId: string;
  reverseCharge: boolean;
  basis: 'order-completion' | 'accepted-milestones' | 'shipment-package' | 'project-claims';
  milestoneIds: string[];
  shipmentPackageIds?: string[];
  projectBillingClaimIds?: string[];
}

export interface IssueInvoiceInput {
  id: string;
  expectedVersion: number;
}

export interface CreateCreditDebitNoteInput {
  invoiceId: string;
  type: CreditDebitNote['type'];
  reason: string;
  taxableValue: number;
  gstRate: number;
  noteDate: string;
}

export interface RecordPaymentInput {
  accountId: string;
  receivedAt: string;
  method: PaymentReceipt['method'];
  settlementAccount?: PaymentReceipt['settlementAccount'];
  /** A counter checkout can tag its canonical receipt without creating a parallel payment record. */
  retailSaleId?: string;
  retailCashierShiftId?: string;
  reference: string;
  amount: number;
  allocations: PaymentAllocation[];
}

export interface ApplyUnappliedReceiptInput {
  /** Payment receipt ID. The receipt must remain recorded and unexported. */
  id: string;
  expectedVersion: number;
  /** Optimistic lock for the existing payment journal that will be reclassified in place. */
  expectedJournalVersion: number;
  evidenceReference: string;
  allocations: Array<{
    receivableId: string;
    amount: number;
    expectedVersion: number;
  }>;
}

export interface ReconcilePaymentInput {
  id: string;
  expectedVersion: number;
}

export interface ExportJournalInput {
  id: string;
  externalReference: string;
  expectedVersion: number;
}

export interface ExportInvoicePdfInput {
  invoiceId: string;
}

export interface CreateGstRegistrationInput {
  label: string;
  gstin: string;
  stateCode: string;
  branchCode: string;
  address: string;
  primary: boolean;
}

export interface CreatePlaceOfSupplyReviewInput {
  salesOrderId: string;
  supplierRegistrationId: string;
  shipFromStateCode: string;
  shipToStateCode: string;
  shipToGstin?: string;
  placeOfSupplyStateCode: string;
  basis: PlaceOfSupplyReview['basis'];
  rationale: string;
}

export interface DecidePlaceOfSupplyReviewInput {
  id: string;
  decision: 'approved' | 'rejected';
  evidence: string;
  expectedVersion: number;
}

export interface CreateStockLocationInput {
  code: string;
  name: string;
  stateCode: string;
  gstRegistrationId?: string;
}

export interface RecordStockMovementInput {
  locationId: string;
  productId: string;
  type: 'receipt' | 'adjustment-in' | 'adjustment-out';
  quantity: number;
  reference: string;
  occurredAt: string;
}

export interface ReserveStockInput {
  salesOrderId: string;
  lineId: string;
  locationId: string;
  quantity: number;
}

export interface ReleaseStockReservationInput {
  id: string;
  expectedVersion: number;
}

export interface CreateShipmentPackageInput {
  salesOrderId: string;
  fromLocationId: string;
  shipToAddressId?: string;
  deliveryPromiseId?: string;
  reservationIds: string[];
  grossWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  ewayBillRequired: boolean;
}

export interface CreatePincodeServiceabilityRuleInput {
  code: string;
  name: string;
  originLocationId: string;
  carrierAdapterId?: string;
  destinationStateCode?: string;
  pinMatchKind: PincodeMatchKind;
  pinStart: string;
  pinEnd?: string;
  serviceLevel: DeliveryServiceLevel;
  serviceable: boolean;
  codAllowed: boolean;
  codMaximumAmount?: number;
  maximumWeightKg?: number;
  cutoffLocalTime?: string;
  dispatchLeadBusinessDays: number;
  transitMinBusinessDays: number;
  transitMaxBusinessDays: number;
  workingDays: ServiceabilityWeekday[];
  priority: number;
  effectiveFrom: string;
  effectiveTo?: string;
  evidenceReference: string;
}

export interface DecidePincodeServiceabilityRuleInput {
  id: string;
  decision: 'activate' | 'suspend';
  rationale: string;
  expectedVersion: number;
}

export interface CreateDeliveryPromiseInput {
  salesOrderId: string;
  shipToAddressId: string;
  originLocationId: string;
  carrierAdapterId?: string;
  serviceLevel: DeliveryServiceLevel;
  paymentMode: DeliveryPaymentMode;
  estimatedWeightKg: number;
  requestedAt?: string;
}

/** All linked versions are required so a COD custody case cannot be created from stale route or AR evidence. */
export interface CreateCodCollectionCaseInput {
  deliveryPromiseId: string;
  shipmentPackageId: string;
  salesOrderId: string;
  carrierAdapterId: string;
  receivableId: string;
  expectedDeliveryPromiseVersion: number;
  expectedShipmentVersion: number;
  expectedSalesOrderVersion: number;
  expectedCarrierVersion: number;
  expectedReceivableVersion: number;
}

export interface RecordCodHandoverInput {
  id: string;
  evidenceReference: string;
  handedOverAt: string;
  expectedVersion: number;
  expectedShipmentVersion: number;
}

export interface RecordCodCarrierCollectionInput {
  id: string;
  evidenceReference: string;
  collectedAt: string;
  collectedAmount: number;
  expectedVersion: number;
  expectedShipmentVersion: number;
}

export interface RecordCodRemittanceInput {
  id: string;
  evidenceReference: string;
  remittedAt: string;
  remittedAmount: number;
  expectedVersion: number;
  expectedReceivableVersion: number;
}

/**
 * This command consumes a bank line that has already been confirmed by the
 * ordinary bank-reconciliation workflow. It never calls a provider or
 * fabricates a receipt.
 */
export interface MatchCodBankInput {
  id: string;
  paymentReceiptId: string;
  bankStatementLineId: string;
  expectedVersion: number;
  expectedPaymentReceiptVersion: number;
  expectedBankStatementLineVersion: number;
}

/** A checker can close a documented custody shortfall only after actual partial bank evidence exists. */
export interface CloseCodShortfallInput {
  id: string;
  paymentReceiptId: string;
  bankStatementLineId: string;
  resolutionReference: string;
  expectedVersion: number;
  expectedPaymentReceiptVersion: number;
  expectedBankStatementLineVersion: number;
}

export interface RecordCodExceptionInput {
  id: string;
  outcome: 'refused-rto' | 'cancelled';
  evidenceReference: string;
  occurredAt: string;
  reason: string;
  expectedVersion: number;
  expectedShipmentVersion: number;
}

export interface TransitionShipmentInput {
  id: string;
  toStatus: ShipmentStatus;
  carrierAdapterId?: string;
  trackingNumber?: string;
  vehicleNumber?: string;
  transportDocumentNumber?: string;
  location: string;
  notes: string;
  expectedVersion: number;
}

export interface ConfigureCarrierAdapterInput {
  code: string;
  name: string;
  mode: CarrierAdapter['mode'];
  status: CarrierAdapter['status'];
  capability: CarrierAdapter['capability'];
}

export interface CreateReturnAuthorizationInput {
  shipmentPackageId: string;
  reason: string;
  items: ReturnAuthorizationItem[];
}

export interface DecideReturnAuthorizationInput {
  id: string;
  decision: 'approved' | 'rejected';
  expectedVersion: number;
}

export interface ReceiveReturnInput {
  id: string;
  reference: string;
  receivedAt: string;
  expectedVersion: number;
}

export interface InspectReturnInput {
  id: string;
  disposition: 'restock' | 'quarantine' | 'scrap' | 'return-to-vendor';
  evidenceReference: string;
  notes: string;
  expectedVersion: number;
}

export interface PrepareStatutoryExchangeInput {
  kind: StatutoryExchange['kind'];
  sourceId: string;
  gstRegistrationId: string;
}

export interface SubmitStatutoryExchangeInput {
  id: string;
  requestReference: string;
  expectedVersion: number;
}

export interface RecordStatutoryResponseInput {
  id: string;
  outcome: 'acknowledged' | 'failed';
  externalNumber?: string;
  acknowledgementNumber?: string;
  acknowledgedAt?: string;
  validUntil?: string;
  qrPayload?: string;
  signedPayloadChecksum?: string;
  errorCode?: string;
  errorMessage?: string;
  expectedVersion: number;
}

export interface TransitionQuoteInput {
  id: string;
  toStatus: QuoteStatus;
  expectedVersion: number;
}

export interface OpportunityCreationResult {
  crm: DashboardSnapshot;
  revenue: RevenueOpsSnapshot;
}

export interface RevenueOpsPartyContext {
  accounts: PartyAccount[];
  contacts: PartyContact[];
  addresses: PartyAddress[];
}
