import type { OperatingRecordScope, QuoteLine, QuoteTaxPreview } from './revenue-ops-contracts';

/**
 * A governed store counter. It is deliberately tied to one physical sell-from
 * bin, price list and walk-in customer so a retail checkout cannot silently
 * choose stock, price, or receivable ownership outside its configured scope.
 */
export interface RetailCounter {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  sellFromBinId: string;
  priceListId: string;
  walkInAccountId: string;
  paymentTermId: string;
  active: boolean;
  scope?: OperatingRecordScope;
  version: number;
}

export type RetailCashierShiftStatus = 'open' | 'close-requested' | 'closed';
export type RetailCashierVarianceResolutionStatus = 'requested' | 'approved' | 'rejected';

/**
 * Cash custody is separated from the retail sale. A cashier can request a
 * close, but an independent reviewer must decide it before the drawer closes.
 */
export interface RetailCashierShift {
  id: string;
  number: string;
  counterId: string;
  cashierId: string;
  openedAt: string;
  openingCash: number;
  status: RetailCashierShiftStatus;
  closeRequestedBy?: string;
  closeRequestedAt?: string;
  declaredCash?: number;
  expectedCash?: number;
  variance?: number;
  /** Tender-by-tender expected vs declared evidence captured at close. */
  tenderReconciliation?: RetailTenderReconciliation[];
  /** Sum of absolute tender variances; approval is blocked unless it is zero. */
  tenderVariance?: number;
  /** A separate finance maker-checker record can authorize a documented variance. */
  varianceResolutionStatus?: RetailCashierVarianceResolutionStatus;
  varianceResolutionReason?: string;
  varianceResolutionReference?: string;
  varianceResolutionRequestedBy?: string;
  varianceResolutionRequestedAt?: string;
  varianceResolutionDecidedBy?: string;
  varianceResolutionDecidedAt?: string;
  closeEvidenceReference?: string;
  closedBy?: string;
  closedAt?: string;
  reviewerEvidenceReference?: string;
  rejectionReason?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export type RetailTenderMethod = 'cash' | 'upi' | 'card' | 'cheque' | 'store-credit' | 'customer-credit' | 'other';

export interface RetailTenderReconciliation {
  method: RetailTenderMethod;
  expected: number;
  declared: number;
  variance: number;
}

export interface RetailTenderDeclarationInput {
  method: RetailTenderMethod;
  amount: number;
}

export interface RetailTender {
  id: string;
  method: RetailTenderMethod;
  amount: number;
  reference: string;
}

/** A retail line captures the price, tax and physical allocation at checkout. */
export interface RetailSaleLine {
  id: string;
  itemVariantId: string;
  catalogProductId: string;
  binId: string;
  batchId?: string;
  serialUnitIds: string[];
  description: string;
  hsnSac: string;
  quantity: number;
  listUnitPrice: number;
  unitPrice: number;
  taxableValue: number;
  gstRate: number;
  taxCodeId: string;
  priceListEntryId: string;
  discountAmount: number;
  cessRate: number;
  cessAmount: number;
  lineTotal: number;
  costValue: number;
  /** Promotion evidence for an automatically issued zero-price gift line. */
  isGift?: boolean;
  promotionPolicyId?: string;
}

/**
 * Immutable proof of the single persisted voucher that changed this sale.
 * The checkout command records the version it validated before consumption;
 * later voucher edits or usage-count increments cannot rewrite sale history.
 */
export interface RetailVoucherRedemptionEvidence {
  voucherId: string;
  voucherCode: string;
  voucherVersion: number;
  discountAmount: number;
  eligibleSubtotal: number;
  redeemedAt: string;
}

/**
 * A completed sale points to the canonical order, invoice, receipt and stock
 * ledger evidence. It is immutable in normal checkout; returns use a later
 * controlled credit/refund flow rather than mutating this record.
 */
export interface RetailSale {
  id: string;
  number: string;
  counterId: string;
  cashierShiftId: string;
  cashierId: string;
  customerAccountId: string;
  /** Tax-invoice recipient snapshot for B2C or registered B2B counter sales. */
  recipientTreatment?: 'registered' | 'unregistered';
  recipientGstin?: string;
  placeOfSupplyStateCode?: string;
  transactionKey: string;
  requestChecksum: string;
  saleAt: string;
  invoiceId: string;
  /** Filled only after the atomic invoice issuance creates the AR record. */
  receivableId?: string;
  paymentReceiptIds: string[];
  lines: RetailSaleLine[];
  subtotal: number;
  discountTotal: number;
  taxPreview: QuoteTaxPreview;
  /** Present only when one persisted, scoped voucher completed with this sale. */
  voucherRedemption?: RetailVoucherRedemptionEvidence;
  tenders: RetailTender[];
  costTotal: number;
  status: 'processing' | 'completed';
  completedAt?: string;
  scope?: OperatingRecordScope;
  version: number;
}

/**
 * A retail return never edits its source sale. It progresses from a customer
 * request through a physical inspection to an independently decided stock
 * receipt. Approval freezes a dedicated GST credit basis and return-credit
 * balance; no source sale, generic receipt, or generic credit note is edited.
 */
export type RetailReturnStatus = 'requested' | 'inspected' | 'approved' | 'rejected';
export type RetailReturnOutcome = 'resalable' | 'quarantine' | 'damaged';
export type RetailReturnFinancialCreditStatus = 'open' | 'partially-settled' | 'settled';
export type RetailReturnSettlementMethod = 'cash-refund' | 'provider-refund' | 'store-credit';
export type RetailReturnSettlementStatus =
  | 'requested'
  | 'rejected'
  | 'cash-refunded'
  | 'provider-refund-pending'
  | 'provider-refunded'
  | 'provider-refund-rejected'
  | 'store-credit-issued';
export type RetailReturnProviderMethod = 'upi' | 'card';

/** Full immutable commercial evidence taken from the original POS line. */
export interface RetailReturnOriginalSaleLineSnapshot {
  itemVariantId: string;
  catalogProductId: string;
  binId: string;
  batchId?: string;
  serialUnitIds: string[];
  description: string;
  hsnSac: string;
  quantity: number;
  listUnitPrice: number;
  unitPrice: number;
  taxableValue: number;
  gstRate: number;
  gstAmount: number;
  taxCodeId: string;
  priceListEntryId: string;
  discountAmount: number;
  cessRate: number;
  cessAmount: number;
  lineTotal: number;
  costValue: number;
}

/**
 * The immutable pro-rata part of the original line that this return controls.
 * The final permitted return for a source line receives residual paise so all
 * accepted returns reconcile exactly back to the original sale evidence.
 */
export interface RetailReturnValueSnapshot {
  taxableValue: number;
  discountAmount: number;
  gstAmount: number;
  cessAmount: number;
  lineTotal: number;
  costValue: number;
}

export interface RetailReturnInspection {
  outcome: RetailReturnOutcome;
  destinationBinId: string;
  serialUnitIds: string[];
  conditionNotes: string;
  inspectedBy: string;
  inspectedAt: string;
}

export interface RetailReturnLine {
  id: string;
  /** Immutable link to the exact completed counter-sale line. */
  retailSaleLineId: string;
  sourceLineQuantity: number;
  quantity: number;
  /** Exact serial identities declared at the counter, empty for non-serial stock. */
  serialUnitIds: string[];
  original: RetailReturnOriginalSaleLineSnapshot;
  returnValues: RetailReturnValueSnapshot;
  inspection?: RetailReturnInspection;
}

/**
 * A frozen, return-specific GST credit record. It preserves the approved
 * return's tax basis rather than rebuilding tax from today's HSN or rate
 * configuration, and is not a generic Accounts Receivable credit note.
 */
export interface RetailReturnGstCreditLineEvidence {
  retailReturnLineId: string;
  retailSaleLineId: string;
  hsnSac: string;
  quantity: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  totalCredit: number;
}

export interface RetailReturnGstCreditEvidence {
  id: string;
  number: string;
  retailReturnId: string;
  retailReturnNumber: string;
  sourceInvoiceId: string;
  sourceInvoiceNumber: string;
  sourceInvoiceDate: string;
  supplierGstin: string;
  treatment: QuoteTaxPreview['treatment'];
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  totalCredit: number;
  lines: RetailReturnGstCreditLineEvidence[];
  frozenBy: string;
  frozenAt: string;
  checksum: string;
}

/**
 * A request and its controlled outcome against a single approved return
 * credit. Entries are append-only; balance fields are derived from them by
 * the domain workflow and never use the generic receipt/credit-note flow.
 */
export interface RetailReturnSettlement {
  id: string;
  number: string;
  retailReturnId: string;
  financialCreditId: string;
  transactionKey: string;
  requestChecksum: string;
  method: RetailReturnSettlementMethod;
  amount: number;
  cashierShiftId?: string;
  providerMethod?: RetailReturnProviderMethod;
  providerReference?: string;
  storeCreditAccountId?: string;
  storeCreditId?: string;
  status: RetailReturnSettlementStatus;
  requestedBy: string;
  requestedAt: string;
  requestEvidenceReference: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionEvidenceReference?: string;
  rejectionReason?: string;
  confirmationTransactionKey?: string;
  confirmationChecksum?: string;
  providerConfirmationReference?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  confirmationRejectionReason?: string;
  version: number;
}

/**
 * A retained retail liability for a named Party Master customer. Redemption is
 * intentionally a later POS step; issuing this record never invents a cash
 * receipt or changes the source invoice's receivable.
 */
export interface RetailStoreCredit {
  id: string;
  number: string;
  retailReturnId: string;
  retailReturnSettlementId: string;
  customerAccountId: string;
  issuedAmount: number;
  availableAmount: number;
  status: 'active' | 'redeemed' | 'expired' | 'cancelled';
  evidenceReference: string;
  issuedBy: string;
  issuedAt: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface RetailReturnFinancialCredit {
  id: string;
  number: string;
  retailReturnId: string;
  customerAccountId: string;
  issuedAmount: number;
  availableAmount: number;
  reservedAmount: number;
  settledAmount: number;
  status: RetailReturnFinancialCreditStatus;
  gstCreditEvidence: RetailReturnGstCreditEvidence;
  settlements: RetailReturnSettlement[];
  issuedBy: string;
  issuedAt: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface RetailReturn {
  id: string;
  number: string;
  retailSaleId: string;
  retailSaleNumber: string;
  invoiceId: string;
  counterId: string;
  warehouseId: string;
  customerAccountId: string;
  /** Caller-owned durable key. Replays must have the exact same checksum. */
  transactionKey: string;
  requestChecksum: string;
  reason: string;
  lines: RetailReturnLine[];
  taxPreview: QuoteTaxPreview;
  status: RetailReturnStatus;
  requestedBy: string;
  requestedAt: string;
  inspectedBy?: string;
  inspectedAt?: string;
  inspectionReference?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalEvidenceReference?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  /** Ready-only accounting evidence: not a refund, credit note or settlement. */
  cogsReversalJournalDraftId?: string;
  /** Created atomically with independent approval; later settlements consume it. */
  financialCredit?: RetailReturnFinancialCredit;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreateRetailCounterInput {
  code: string;
  name: string;
  warehouseId: string;
  sellFromBinId: string;
  priceListId: string;
  walkInAccountId: string;
  paymentTermId: string;
}

export interface OpenRetailCashierShiftInput {
  counterId: string;
  openingCash: number;
}

export interface RetailCheckoutLineInput {
  itemVariantId: string;
  binId: string;
  batchId?: string;
  serialUnitIds: string[];
  quantity: number;
}

export interface CheckoutRetailSaleInput {
  counterId: string;
  cashierShiftId: string;
  /** Caller-generated durable idempotency key; retries replay the original sale only. */
  transactionKey: string;
  customerAccountId?: string;
  /** Optional registered B2B invoice capture; omitted means the governed B2C flow. */
  recipientTreatment?: 'registered' | 'unregistered';
  recipientGstin?: string;
  placeOfSupplyStateCode?: string;
  loyaltyPointsToRedeem?: number;
  loyaltyAccountVersion?: number;
  /** One configured voucher only; the trusted checkout boundary validates it again. */
  voucherCode?: string;
  /** Optimistic version captured with voucherCode to reject stale checkout payloads. */
  voucherVersion?: number;
  saleAt: string;
  lines: RetailCheckoutLineInput[];
  discountPolicyIds: string[];
  tenders: Array<Omit<RetailTender, 'id'>>;
}

export interface RequestRetailCashierShiftCloseInput {
  id: string;
  declaredCash: number;
  evidenceReference: string;
  expectedVersion: number;
  /** When provided, every tender rail must be declared; legacy cash-only callers remain supported. */
  declaredTenders?: RetailTenderDeclarationInput[];
}

export interface RequestRetailCashierShiftVarianceResolutionInput {
  id: string;
  reason: string;
  evidenceReference: string;
  expectedVersion: number;
}

export interface DecideRetailCashierShiftVarianceResolutionInput {
  id: string;
  decision: 'approved' | 'rejected';
  evidenceReference: string;
  expectedVersion: number;
}

export interface DecideRetailCashierShiftCloseInput {
  id: string;
  decision: 'approved' | 'rejected';
  evidenceReference: string;
  expectedVersion: number;
}

export interface RetailReturnRequestLineInput {
  retailSaleLineId: string;
  quantity: number;
  /** Mandatory, exact source identities only for serial-controlled stock. */
  serialUnitIds: string[];
}

export interface CreateRetailReturnRequestInput {
  retailSaleId: string;
  transactionKey: string;
  reason: string;
  lines: RetailReturnRequestLineInput[];
}

export interface RetailReturnInspectionLineInput {
  retailReturnLineId: string;
  outcome: RetailReturnOutcome;
  destinationBinId: string;
  /** Must exactly match the serial identities declared on the request. */
  serialUnitIds: string[];
  conditionNotes: string;
}

export interface InspectRetailReturnInput {
  id: string;
  inspectionReference: string;
  lines: RetailReturnInspectionLineInput[];
  expectedVersion: number;
}

export interface DecideRetailReturnInput {
  id: string;
  decision: 'approved' | 'rejected';
  evidenceReference: string;
  expectedVersion: number;
}

export interface RequestRetailReturnSettlementInput {
  retailReturnId: string;
  expectedVersion: number;
  /** Caller-owned durable idempotency key. */
  transactionKey: string;
  method: RetailReturnSettlementMethod;
  amount: number;
  /** Required for a cash refund and must be the active drawer at this counter. */
  cashierShiftId?: string;
  /** Required for a provider refund; only the original UPI/card tender rail is allowed. */
  providerMethod?: RetailReturnProviderMethod;
  providerReference?: string;
  /** Required for store credit and must equal the return's named customer. */
  storeCreditAccountId?: string;
  evidenceReference: string;
}

export interface DecideRetailReturnSettlementInput {
  retailReturnId: string;
  settlementId: string;
  expectedVersion: number;
  decision: 'approved' | 'rejected';
  evidenceReference: string;
}

export interface ConfirmRetailReturnProviderRefundInput {
  retailReturnId: string;
  settlementId: string;
  expectedVersion: number;
  /** Separate durable key from the original refund request. */
  transactionKey: string;
  decision: 'confirmed' | 'rejected';
  providerConfirmationReference: string;
}

/**
 * Invoice lines retain the established commercial contract. Keeping this
 * conversion explicit prevents a retail sale from masquerading as a quote.
 */
export function retailSaleLineToInvoiceLine(line: RetailSaleLine): QuoteLine {
  return {
    id: line.id,
    productInterestId: `retail-sale:${line.id}`,
    description: line.description,
    hsnSac: line.hsnSac,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxableValue: line.taxableValue,
    gstRate: line.gstRate,
    catalogProductId: line.catalogProductId,
    taxCodeId: line.taxCodeId,
    priceListEntryId: line.priceListEntryId,
    listUnitPrice: line.listUnitPrice,
    discountAmount: line.discountAmount,
  };
}
