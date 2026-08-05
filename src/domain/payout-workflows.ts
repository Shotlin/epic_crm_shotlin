/**
 * payout-workflows.ts
 *
 * Phase R8 – Complete Payout Workflows & Accounting Integration Engine
 *
 * Provides batch payout processing, TDS withholding calculation, and automated
 * double-entry accounting journal entry generation for commission and vendor payouts.
 */

import type { AccountingJournalDraft, JournalLine } from '../shared/revenue-ops-contracts';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type PayoutType = 'sales-commission' | 'supplier-vendor' | 'partner-rebate';

export interface PayoutItemInput {
  id: string;
  recipientId: string;
  recipientName: string;
  recipientPan?: string;
  grossAmount: number;
  tdsSection?: '194H' | '194Q' | '194C' | 'none';
  customTdsRatePct?: number; // e.g. 5% for 194H, 0.1% for 194Q
  referenceNumber: string;
}

export interface ProcessedPayoutItem {
  id: string;
  recipientId: string;
  recipientName: string;
  recipientPan?: string;
  grossAmount: number;
  tdsSection: '194H' | '194Q' | '194C' | 'none';
  tdsRatePct: number;
  tdsWithheldAmount: number;
  netPayoutAmount: number;
  referenceNumber: string;
}

export interface PayoutBatchResult {
  batchId: string;
  payoutType: PayoutType;
  processedAt: string;
  itemCount: number;
  totalGrossAmount: number;
  totalTdsWithheld: number;
  totalNetPayoutAmount: number;
  items: ProcessedPayoutItem[];
  journalDraft: AccountingJournalDraft;
}

/**
 * Gets standard TDS rate for a given section under India Income Tax Act.
 */
export function getTdsRate(section: PayoutItemInput['tdsSection'], hasPan = true): number {
  if (!section || section === 'none') return 0;
  if (!hasPan) return 20; // Section 206AA flat 20% if no PAN

  switch (section) {
    case '194H': return 5.0;  // Commission & brokerage
    case '194Q': return 0.1;  // Purchase of goods
    case '194C': return 1.0;  // Individual/HUF contractor (or 2% company)
    default: return 0;
  }
}

/**
 * Processes a batch of payout items, calculates TDS withholding, and generates the balanced accounting journal draft.
 */
export function processPayoutBatch(
  batchId: string,
  payoutType: PayoutType,
  items: PayoutItemInput[],
  bankAccountId = 'acc-bank-primary',
  processedAt = new Date().toISOString(),
): PayoutBatchResult {
  const processedItems: ProcessedPayoutItem[] = items.map((item) => {
    const hasPan = Boolean(item.recipientPan && item.recipientPan.trim().length === 10);
    const section = item.tdsSection ?? (payoutType === 'sales-commission' ? '194H' : '194Q');
    const tdsRatePct = item.customTdsRatePct ?? getTdsRate(section, hasPan);
    const grossAmount = round2(item.grossAmount);
    const tdsWithheldAmount = round2((grossAmount * tdsRatePct) / 100);
    const netPayoutAmount = round2(grossAmount - tdsWithheldAmount);

    return {
      id: item.id,
      recipientId: item.recipientId,
      recipientName: item.recipientName,
      recipientPan: item.recipientPan,
      grossAmount,
      tdsSection: section,
      tdsRatePct,
      tdsWithheldAmount,
      netPayoutAmount,
      referenceNumber: item.referenceNumber,
    };
  });

  const totalGrossAmount = round2(processedItems.reduce((s, i) => s + i.grossAmount, 0));
  const totalTdsWithheld = round2(processedItems.reduce((s, i) => s + i.tdsWithheldAmount, 0));
  const totalNetPayoutAmount = round2(processedItems.reduce((s, i) => s + i.netPayoutAmount, 0));

  // Generate double-entry accounting journal lines
  const journalLines: JournalLine[] = [];

  // Line 1: Debit Expense or Accounts Payable (Gross amount)
  const debitAccount: JournalLine['accountCode'] = payoutType === 'sales-commission' ? 'employee-expense' : 'accounts-payable';
  journalLines.push({
    accountCode: debitAccount,
    memo: `Gross Payout Release - Batch ${batchId} (${payoutType})`,
    debit: totalGrossAmount,
    credit: 0,
  });

  // Line 2: Credit Bank Account (Net amount paid out)
  journalLines.push({
    accountCode: 'cash-at-bank',
    memo: `Net Bank Payment (${bankAccountId}) - Batch ${batchId}`,
    debit: 0,
    credit: totalNetPayoutAmount,
  });

  // Line 3: Credit TDS Payable Account (Tax withheld)
  if (totalTdsWithheld > 0) {
    journalLines.push({
      accountCode: 'tds-payable',
      memo: `TDS Withheld on Payout - Batch ${batchId}`,
      debit: 0,
      credit: totalTdsWithheld,
    });
  }

  const checksumStr = `checksum-payout-${batchId}-${totalGrossAmount}`;

  const journalDraft: AccountingJournalDraft = {
    id: `jrn-${batchId}`,
    sourceType: 'expense-reimbursement',
    sourceId: batchId,
    sourceNumber: `JRN-PO-${batchId.slice(-6).toUpperCase()}`,
    postingDate: processedAt.slice(0, 10),
    lines: journalLines,
    totalDebit: totalGrossAmount,
    totalCredit: round2(totalNetPayoutAmount + totalTdsWithheld),
    status: 'draft',
    checksum: checksumStr,
    version: 1,
  };

  return {
    batchId,
    payoutType,
    processedAt,
    itemCount: items.length,
    totalGrossAmount,
    totalTdsWithheld,
    totalNetPayoutAmount,
    items: processedItems,
    journalDraft,
  };
}
