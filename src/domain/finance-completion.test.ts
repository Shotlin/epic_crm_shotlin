import { describe, expect, it } from 'vitest';
import { allocateLandedCost, buildDetailedGstWorkpaper, buildDimensionStatement, buildGstEvidenceWorkpaper, buildGstReturnWorkpaper, buildLandedCostWorkpaper, buildPeoplePostingEvidence, calculateConsolidation, calculateFxRevaluation, calculateFxValuation, summarizeDimensions, summarizePeoplePosting } from './finance-completion';

describe('finance completion workpapers', () => {
  it('summarizes dimensions and governed people handoffs', () => {
    expect(summarizeDimensions([{ accountCode: 'sales', amount: 100, costCenter: 'CC-1', department: 'Sales' }, { accountCode: 'expense', amount: 10 }])).toMatchObject({ assignedLines: 1, unassignedLines: 1, costCenters: 1 });
    expect(summarizePeoplePosting({ finalizedPayroll: 2, reimbursedExpenses: 3, readyPayroll: 2, readyExpenses: 1 })).toMatchObject({ readyForGl: 3, blocked: 2 });
  });
  it('produces GST, landed-cost, FX, and consolidation evidence', () => {
    expect(buildGstReturnWorkpaper({ period: '2026-06', outwardTaxable: 100000, outputTax: 18000, inputCredit: 7000, invoiceCount: 4, purchaseCount: 3 })).toMatchObject({ netCashPayable: 11000, gstr1Tax: 18000 });
    expect(buildLandedCostWorkpaper({ receiptCount: 4, costedReceiptCount: 3, allocatedCharges: 5000, inventoryValue: 25000 })).toMatchObject({ allocationCoverage: 75 });
    expect(calculateFxValuation({ currencyCode: 'USD', balance: 100, closingRate: 84, openingRate: 82, rateEvidence: 'RBI-2026-06-30' })).toMatchObject({ translatedBalance: 8400, unrealizedGainLoss: 200 });
    const result = calculateConsolidation([{ companyId: 'india', currencyCode: 'INR', closingBalance: 1000, ownershipPercent: 100 }, { companyId: 'us', currencyCode: 'USD', closingBalance: 100, ownershipPercent: 80 }], 'INR', 50);
    expect(result).toMatchObject({ entityCount: 2, translatedTotal: 1080, consolidatedTotal: 1030 });
    expect(result.checksum).toHaveLength(16);
  });
  it('covers detailed statutory sections, FX batches, allocations, and people evidence', () => {
    expect(buildDetailedGstWorkpaper({ period: '2026-06', b2bTaxable: 80000, b2cTaxable: 10000, exportTaxable: 5000, outputTax: 17100, inputCredit: 6000, reverseChargeTax: 500, itcReversal: 500, invoiceCount: 6, purchaseCount: 4, hsnSummaryRows: 3 })).toMatchObject({ b2bTaxable: 80000, netCashPayable: 12100, filingReadiness: 'ready' });
    expect(calculateFxRevaluation([{ currencyCode: 'USD', balance: 100, openingRate: 82, closingRate: 84, evidenceReference: 'RATE-1' }])[0]).toMatchObject({ gainLoss: 200 });
    expect(allocateLandedCost({ chargeAmount: 100, basis: 'value', lines: [{ receiptLineId: 'a', value: 1, quantity: 1 }, { receiptLineId: 'b', value: 3, quantity: 1 }] })).toMatchObject([{ allocatedCharge: 25 }, { allocatedCharge: 75 }]);
    expect(buildPeoplePostingEvidence({ sourceType: 'payroll', sourceId: 'run-1', grossOrClaimAmount: 1000, employeeDeductions: 100, employerContributions: 100, evidenceReference: 'PAY-1' }).balanced).toBe(true);
    const dimensionStatement = buildDimensionStatement({ dimensionType: 'costCenterId', asOfDate: '2026-06-30', lines: [{ accountCode: 'expense', debit: 100, credit: 0, dimensions: { costCenterId: 'cc-1' } }, { accountCode: 'payable', debit: 0, credit: 100, dimensions: { costCenterId: 'cc-1' } }, { accountCode: 'sales', debit: 50, credit: 0, dimensions: { costCenterId: 'cc-2' } }] });
    expect(dimensionStatement).toMatchObject({ totalDebit: 150, totalCredit: 100, balanced: false });
    expect(dimensionStatement.lines[0]).toMatchObject({ dimensionId: 'cc-1' });
  });
  it('classifies issued invoices and governed notes into a reconciled GST evidence workpaper', () => {
    const workpaper = buildGstEvidenceWorkpaper({ period: '2026-06', ledgerOutputTax: 18, inputCredit: 4, purchaseCount: 2, invoices: [
      { id: 'b2b', recipientTreatment: 'registered', reverseCharge: false, taxableValue: 100, totalTax: 18, lines: [{ taxableValue: 100, gstRate: 18, hsnSac: '9983' }] },
      { id: 'b2c', recipientTreatment: 'unregistered', reverseCharge: false, taxableValue: 50, totalTax: 0, lines: [{ taxableValue: 50, gstRate: 0, hsnSac: '9983' }] },
      { id: 'export', recipientTreatment: 'export', reverseCharge: true, taxableValue: 40, totalTax: 0, lines: [{ taxableValue: 40, gstRate: 0, hsnSac: '8471' }] },
    ], adjustments: [{ invoiceId: 'b2b', type: 'credit', taxableValue: 20, taxAmount: 3.6 }] });
    expect(workpaper).toMatchObject({ b2bTaxable: 80, b2cTaxable: 50, exportTaxable: 40, nilRatedTaxable: 90, reverseChargeTax: 0, invoiceCount: 4, hsnSummaryRows: 2, filingReadiness: 'review' });
    expect(workpaper.exceptionCount).toBe(1);
  });
});
