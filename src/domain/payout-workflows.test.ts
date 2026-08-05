/**
 * payout-workflows.test.ts
 *
 * Unit tests for payout workflows & accounting ledger integration.
 */

import { describe, it, expect } from 'vitest';
import {
  getTdsRate,
  processPayoutBatch,
  type PayoutItemInput,
} from './payout-workflows';

describe('payout-workflows domain', () => {
  it('returns correct standard TDS rates based on section and PAN availability', () => {
    expect(getTdsRate('194H', true)).toBe(5.0);
    expect(getTdsRate('194Q', true)).toBe(0.1);
    expect(getTdsRate('194C', true)).toBe(1.0);
    expect(getTdsRate('194H', false)).toBe(20.0); // No PAN penalty
    expect(getTdsRate('none', true)).toBe(0);
  });

  it('processes commission payout batch and produces balanced journal draft', () => {
    const items: PayoutItemInput[] = [
      {
        id: 'item-1',
        recipientId: 'agent-1',
        recipientName: 'Rahul Sharma',
        recipientPan: 'ABCDE1234F',
        grossAmount: 50000,
        tdsSection: '194H',
        referenceNumber: 'COMM-001',
      },
      {
        id: 'item-2',
        recipientId: 'agent-2',
        recipientName: 'Priya Patel',
        recipientPan: 'FGHIJ5678K',
        grossAmount: 30000,
        tdsSection: '194H',
        referenceNumber: 'COMM-002',
      },
    ];

    const result = processPayoutBatch('batch-101', 'sales-commission', items);

    expect(result.itemCount).toBe(2);
    expect(result.totalGrossAmount).toBe(80000);
    // 5% of 80,000 = 4,000 TDS withheld
    expect(result.totalTdsWithheld).toBe(4000);
    expect(result.totalNetPayoutAmount).toBe(76000);

    // Verify double-entry journal balance
    const journal = result.journalDraft;
    expect(journal.totalDebit).toBe(journal.totalCredit);
    expect(journal.totalDebit).toBe(80000);
    expect(journal.lines).toHaveLength(3);
  });
});
