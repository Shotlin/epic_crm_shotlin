import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildGstReturnWorkpaper, calculateConsolidation, summarizeDimensions, summarizePeoplePosting, buildLandedCostWorkpaper, type FinanceCompletionSnapshot } from '../domain/finance-completion';
import { BusinessDatabase } from './database';
import { FinanceCompletionStore } from './finance-completion-store';

let directory: string; let database: BusinessDatabase;
beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-finance-')); database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3')); await database.initialize(); });
afterEach(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });

function snapshot(): FinanceCompletionSnapshot { return { dimensions: summarizeDimensions([]), consolidation: calculateConsolidation([{ companyId: 'co-1', currencyCode: 'INR', closingBalance: 100, ownershipPercent: 100 }]), fx: [], gst: { ...buildGstReturnWorkpaper({ period: '2026-06', outwardTaxable: 100, outputTax: 18, inputCredit: 5, invoiceCount: 1, purchaseCount: 1 }), b2bTaxable: 100, b2cTaxable: 0, exportTaxable: 0, nilRatedTaxable: 0, reverseChargeTax: 0, itcReversal: 0, hsnSummaryRows: 1, filingReadiness: 'ready' }, landedCost: buildLandedCostWorkpaper({ receiptCount: 0, costedReceiptCount: 0, allocatedCharges: 0, inventoryValue: 0 }), people: summarizePeoplePosting({ finalizedPayroll: 0, reimbursedExpenses: 0, readyPayroll: 0, readyExpenses: 0 }), checksum: 'demo' }; }

describe('finance completion persistence', () => {
  it('persists exact-scope, checksum-protected workpapers and enforces review before approval', () => {
    const store = new FinanceCompletionStore(database); const scope = { companyId: 'co-1', branchId: 'br-1' }; const first = store.save(scope, 'finance-1', snapshot(), 'maker');
    expect(store.list(scope)).toHaveLength(1);
    expect(() => store.save(scope, 'finance-1', first, 'maker', 'approved', 1)).toThrow('independently reviewed');
    const reviewed = store.save(scope, 'finance-1', first, 'checker', 'reviewed', 1);
    expect(() => store.save(scope, 'finance-1', reviewed, 'checker', 'approved', 2)).toThrow('reviewer cannot approve');
    expect(store.save(scope, 'finance-1', reviewed, 'approver', 'approved', 2)).toBeTruthy();
    expect(() => store.save({ companyId: 'co-2', branchId: 'br-1' }, 'finance-1', first, 'other')).toThrow('outside');
  });

  it('blocks approval when statutory, landed-cost, people, or FX evidence is incomplete', () => {
    const store = new FinanceCompletionStore(database); const scope = { companyId: 'co-1', branchId: 'br-1' };
    const incomplete = { ...snapshot(), fx: [{ currencyCode: 'USD', baseCurrency: 'INR', sourceBalance: 100, openingRate: 0, rate: 0, translatedBalance: 0, unrealizedGainLoss: 0, rateEvidence: '' }] };
    const draft = store.save(scope, 'finance-incomplete', incomplete, 'maker');
    store.save(scope, 'finance-incomplete', draft, 'checker', 'reviewed', 1);
    expect(() => store.save(scope, 'finance-incomplete', draft, 'approver', 'approved', 2)).toThrow('FX workpaper');
  });
});
