/**
 * retail-exchange-contracts.ts
 *
 * Phase R7 – Retail Counter Exchange Conversion
 *
 * An exchange converts an approved retail return credit into a replacement
 * sale at the same counter. It is deliberately NOT a mutation of the original
 * sale or return record; it is its own governed, append-only evidence chain.
 *
 * Flow:
 *   1. Cashier creates an exchange request against an approved RetailReturn
 *      that has an open financial credit.
 *   2. The domain computes the net payable / net credit based on replacement
 *      line prices vs the available return credit.
 *   3. A reviewer approves or rejects the exchange.
 *   4. On approval the domain atomically:
 *        a. Consumes the return financial credit (fully or partially).
 *        b. Checks out the replacement items from the counter's sell-from bin.
 *        c. If net_payable > 0: records a tender entry (customer pays top-up).
 *        d. If net_credit  > 0: issues a new RetailStoreCredit for the remainder.
 */

import type { OperatingRecordScope, QuoteTaxPreview } from './revenue-ops-contracts';
import type { RetailTenderMethod } from './retail-pos-contracts';

// ---------------------------------------------------------------------------
// Status lifecycle
// ---------------------------------------------------------------------------

export type RetailExchangeStatus =
  | 'requested'    // cashier has submitted replacement lines
  | 'approved'     // reviewer approved; stock moved + credit consumed
  | 'rejected';    // reviewer rejected; credit untouched

// ---------------------------------------------------------------------------
// A single replacement line the customer is exchanging into
// ---------------------------------------------------------------------------

export interface RetailExchangeReplacementLine {
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
  /** Rounded GST evidence carried from the governed replacement price. */
  gstAmount?: number;
  taxCodeId: string;
  priceListEntryId: string;
  discountAmount: number;
  cessRate: number;
  cessAmount: number;
  lineTotal: number;
  /** Actual total cost of the whole replacement line for COGS purposes. */
  lineCostTotal: number;
}

// ---------------------------------------------------------------------------
// Top-up tender when replacement value > return credit
// ---------------------------------------------------------------------------

export interface RetailExchangeTopUpTender {
  id: string;
  method: RetailTenderMethod;
  amount: number;
  reference: string;
}

// ---------------------------------------------------------------------------
// Core exchange record
// ---------------------------------------------------------------------------

export interface RetailExchange {
  id: string;
  number: string;

  /** Source return that provides the financial credit. */
  retailReturnId: string;
  retailReturnNumber: string;

  /** The financial credit being consumed by this exchange. */
  financialCreditId: string;
  /** Version of the source credit observed at request time. */
  sourceCreditVersion: number;

  counterId: string;
  cashierShiftId: string;
  cashierId: string;
  customerAccountId: string;

  /** Caller-owned durable idempotency key. */
  transactionKey: string;
  requestChecksum: string;

  /** Replacement items the customer is exchanging into. */
  replacementLines: RetailExchangeReplacementLine[];

  /** Aggregated replacement value (incl. GST). */
  replacementSubtotal: number;
  replacementTaxPreview: QuoteTaxPreview;
  replacementGrandTotal: number;
  replacementCostTotal: number;

  /** Credit from the approved return being applied. */
  creditApplied: number;

  /**
   * Positive → customer owes this amount (replacement > credit).
   * Zero     → even exchange.
   * Negative → should never occur; excess is issued as store credit.
   */
  netTopUp: number;

  /** If netTopUp > 0, the cashier records tender evidence. */
  topUpTender?: RetailExchangeTopUpTender;

  /**
   * If credit > replacement, the remainder is issued as a new store credit.
   * This ID points to the RetailStoreCredit record created on approval.
   */
  remainderStoreCreditId?: string;
  replacementSaleId?: string;
  replacementInvoiceId?: string;
  replacementPaymentReceiptIds?: string[];
  replacementCostJournalDraftId?: string;

  status: RetailExchangeStatus;
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalEvidenceReference?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;

  scope?: OperatingRecordScope;
  version: number;
}

// ---------------------------------------------------------------------------
// Input contracts
// ---------------------------------------------------------------------------

export interface RetailExchangeReplacementLineInput {
  itemVariantId: string;
  binId: string;
  batchId?: string;
  serialUnitIds: string[];
  quantity: number;
}

export interface CreateRetailExchangeInput {
  /** Must be an approved RetailReturn with an open financial credit. */
  retailReturnId: string;
  counterId: string;
  cashierShiftId: string;
  transactionKey: string;
  replacementLines: RetailExchangeReplacementLineInput[];
  /**
   * Top-up tender required only when replacementGrandTotal > creditApplied.
   * Omit or pass empty when exchange is even or credit exceeds replacement.
   */
  topUpTender?: Omit<RetailExchangeTopUpTender, 'id'>;
}

export interface DecideRetailExchangeInput {
  id: string;
  decision: 'approved' | 'rejected';
  evidenceReference: string;
  expectedVersion: number;
}
