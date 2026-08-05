import { browserChecksum } from '../shared/browser-checksum';
import type { ConsolidationControlResult, ConsolidationMapping } from './finance-consolidation';

export interface FinanceDimensionLine { accountCode: string; amount: number; costCenter?: string; profitCenter?: string; project?: string; department?: string; }
export interface FinanceDimensionSummary { costCenters: number; profitCenters: number; projects: number; departments: number; assignedLines: number; unassignedLines: number; }
export interface ConsolidationEntity { companyId: string; currencyCode: string; closingBalance: number; ownershipPercent: number; }
export interface ConsolidationResult { entityCount: number; translatedTotal: number; eliminations: number; consolidatedTotal: number; currencyCode: string; checksum: string; }
export interface FxValuationResult { currencyCode: string; baseCurrency: string; sourceBalance: number; openingRate: number; rate: number; translatedBalance: number; unrealizedGainLoss: number; rateEvidence: string; }
export interface GstReturnWorkpaper { period: string; gstr1Taxable: number; gstr1Tax: number; gstr3bOutputTax: number; gstr3bInputCredit: number; netCashPayable: number; invoiceCount: number; purchaseCount: number; exceptionCount: number; }
export interface LandedCostWorkpaper { receiptCount: number; allocatedCharges: number; inventoryValue: number; allocationCoverage: number; exceptions: number; }
export interface PeoplePostingReadiness { payrollFinalized: number; expensesReimbursed: number; readyForGl: number; blocked: number; }
export interface FinanceCompletionSnapshot { dimensions: FinanceDimensionSummary; dimensionCatalog?: Array<{ id: string; type: string; code: string; name: string; companyId: string; branchId: string; active: boolean }>; consolidation: ConsolidationResult; consolidationControl?: ConsolidationControlResult; consolidationMappings?: Array<ConsolidationMapping & { childBalance: number }>; consolidationEliminations?: EliminationRule[]; fx: FxValuationResult[]; gst: GstReturnBreakdown; landedCost: LandedCostWorkpaper; people: PeoplePostingReadiness; checksum: string; }

export interface GstReturnBreakdown extends GstReturnWorkpaper {
  b2bTaxable: number; b2cTaxable: number; exportTaxable: number; nilRatedTaxable: number;
  reverseChargeTax: number; itcReversal: number; hsnSummaryRows: number; filingReadiness: 'ready' | 'review' | 'blocked';
}
export interface FxRevaluationLine { currencyCode: string; closingBalance: number; openingRate: number; closingRate: number; gainLoss: number; evidenceReference: string; }
export interface EliminationRule { id: string; description: string; debitAccountCode: string; creditAccountCode: string; amount: number; evidenceReference: string; }
export interface LandedCostAllocationLine { receiptLineId: string; basisAmount: number; sharePercent: number; allocatedCharge: number; }
export interface PeoplePostingEvidence { sourceType: 'payroll' | 'expense'; sourceId: string; grossOrClaimAmount: number; statutoryAmount: number; payableOrCashAmount: number; balanced: boolean; evidenceReference: string; }
export interface DimensionStatementLine { dimensionId: string; accountCode: string; debit: number; credit: number; balance: number; }
export interface DimensionStatement { dimensionType: 'costCenterId' | 'profitCenterId' | 'departmentId' | 'projectId'; asOfDate: string; lines: DimensionStatementLine[]; totalDebit: number; totalCredit: number; balanced: boolean; }

function round(value: number): number { return Math.round(value * 100) / 100; }
function finite(value: number): number { return Number.isFinite(value) ? value : 0; }

export function summarizeDimensions(lines: FinanceDimensionLine[]): FinanceDimensionSummary {
  const unique = (key: keyof FinanceDimensionLine) => new Set(lines.map((line) => line[key]).filter((value): value is string => typeof value === 'string' && value.length > 0)).size;
  const assignedLines = lines.filter((line) => Boolean(line.costCenter || line.profitCenter || line.project || line.department)).length;
  return { costCenters: unique('costCenter'), profitCenters: unique('profitCenter'), projects: unique('project'), departments: unique('department'), assignedLines, unassignedLines: Math.max(0, lines.length - assignedLines) };
}

export function calculateConsolidation(entities: ConsolidationEntity[], baseCurrency = 'INR', eliminations = 0): ConsolidationResult {
  const translatedTotal = round(entities.reduce((sum, entity) => sum + finite(entity.closingBalance) * Math.max(0, Math.min(100, entity.ownershipPercent)) / 100, 0));
  const consolidatedTotal = round(translatedTotal - finite(eliminations));
  const payload = JSON.stringify({ entities, baseCurrency, eliminations, translatedTotal, consolidatedTotal });
  return { entityCount: entities.length, translatedTotal, eliminations: round(eliminations), consolidatedTotal, currencyCode: baseCurrency, checksum: browserChecksum(payload) };
}

export function calculateFxValuation(input: { currencyCode: string; baseCurrency?: string; balance: number; closingRate: number; openingRate?: number; rateEvidence: string }): FxValuationResult {
  const baseCurrency = input.baseCurrency ?? 'INR';
  const translatedBalance = round(finite(input.balance) * finite(input.closingRate));
  const unrealizedGainLoss = round(finite(input.balance) * (finite(input.closingRate) - finite(input.openingRate ?? input.closingRate)));
  if (!input.rateEvidence.trim()) throw new Error('FX valuation requires rate evidence.');
  return { currencyCode: input.currencyCode, baseCurrency, sourceBalance: round(input.balance), openingRate: round(input.openingRate ?? input.closingRate), rate: input.closingRate, translatedBalance, unrealizedGainLoss, rateEvidence: input.rateEvidence.trim() };
}

export function buildGstReturnWorkpaper(input: { period: string; outwardTaxable: number; outputTax: number; inputCredit: number; invoiceCount: number; purchaseCount: number; exceptionCount?: number }): GstReturnWorkpaper {
  const outputTax = finite(input.outputTax); const inputCredit = Math.max(0, finite(input.inputCredit));
  return { period: input.period, gstr1Taxable: round(input.outwardTaxable), gstr1Tax: round(outputTax), gstr3bOutputTax: round(outputTax), gstr3bInputCredit: round(inputCredit), netCashPayable: round(outputTax - inputCredit), invoiceCount: Math.max(0, input.invoiceCount), purchaseCount: Math.max(0, input.purchaseCount), exceptionCount: Math.max(0, input.exceptionCount ?? 0) };
}

export function buildDetailedGstWorkpaper(input: { period: string; b2bTaxable: number; b2cTaxable: number; exportTaxable: number; nilRatedTaxable?: number; outputTax: number; inputCredit: number; reverseChargeTax?: number; itcReversal?: number; invoiceCount: number; purchaseCount: number; hsnSummaryRows: number; exceptionCount?: number }): GstReturnBreakdown {
  const reverseChargeTax = Math.max(0, finite(input.reverseChargeTax ?? 0));
  const itcReversal = Math.max(0, finite(input.itcReversal ?? 0));
  const base = buildGstReturnWorkpaper({ period: input.period, outwardTaxable: finite(input.b2bTaxable) + finite(input.b2cTaxable) + finite(input.exportTaxable) + finite(input.nilRatedTaxable ?? 0), outputTax: input.outputTax, inputCredit: Math.max(0, input.inputCredit - itcReversal), invoiceCount: input.invoiceCount, purchaseCount: input.purchaseCount, exceptionCount: input.exceptionCount });
  const netCashPayable = round(base.netCashPayable + reverseChargeTax);
  return { ...base, netCashPayable, b2bTaxable: round(input.b2bTaxable), b2cTaxable: round(input.b2cTaxable), exportTaxable: round(input.exportTaxable), nilRatedTaxable: round(input.nilRatedTaxable ?? 0), reverseChargeTax: round(reverseChargeTax), itcReversal: round(itcReversal), hsnSummaryRows: Math.max(0, input.hsnSummaryRows), filingReadiness: (input.exceptionCount ?? 0) > 0 || input.hsnSummaryRows === 0 ? 'review' : 'ready' };
}

export interface GstInvoiceEvidence { id: string; recipientTreatment: 'registered' | 'unregistered' | 'export'; reverseCharge: boolean; taxableValue: number; totalTax: number; lines: Array<{ taxableValue: number; gstRate: number; hsnSac: string }>; }
export interface GstAdjustmentEvidence { invoiceId: string; type: 'credit' | 'debit'; taxableValue: number; taxAmount: number; }

/** Builds a GSTR review workpaper from issued invoice evidence and governed commercial adjustments. */
export function buildGstEvidenceWorkpaper(input: { period: string; invoices: GstInvoiceEvidence[]; adjustments?: GstAdjustmentEvidence[]; ledgerOutputTax: number; inputCredit: number; purchaseCount: number; itcReversal?: number }): GstReturnBreakdown {
  const invoiceIds = new Set(input.invoices.map(({ id }) => id));
  const adjustments = (input.adjustments ?? []).filter(({ invoiceId }) => invoiceIds.has(invoiceId));
  const signedAdjustment = (invoiceId: string, field: 'taxableValue' | 'taxAmount') => adjustments.filter((note) => note.invoiceId === invoiceId).reduce((sum, note) => sum + finite(note[field]) * (note.type === 'credit' ? -1 : 1), 0);
  const taxableFor = (treatment: GstInvoiceEvidence['recipientTreatment']) => input.invoices.filter((invoice) => invoice.recipientTreatment === treatment).reduce((sum, invoice) => sum + finite(invoice.taxableValue) + signedAdjustment(invoice.id, 'taxableValue'), 0);
  const outputTax = input.invoices.reduce((sum, invoice) => sum + finite(invoice.totalTax) + signedAdjustment(invoice.id, 'taxAmount'), 0);
  const reverseChargeTax = input.invoices.filter(({ reverseCharge }) => reverseCharge).reduce((sum, invoice) => sum + finite(invoice.totalTax) + signedAdjustment(invoice.id, 'taxAmount'), 0);
  const nilRatedTaxable = input.invoices.flatMap(({ lines }) => lines).filter(({ gstRate }) => finite(gstRate) === 0).reduce((sum, line) => sum + finite(line.taxableValue), 0);
  const hsnSummaryRows = new Set(input.invoices.flatMap(({ lines }) => lines.map(({ hsnSac }) => hsnSac.trim()).filter(Boolean))).size;
  return buildDetailedGstWorkpaper({ period: input.period, b2bTaxable: taxableFor('registered'), b2cTaxable: taxableFor('unregistered'), exportTaxable: taxableFor('export'), nilRatedTaxable, outputTax, inputCredit: input.inputCredit, reverseChargeTax, itcReversal: input.itcReversal, invoiceCount: input.invoices.length + adjustments.length, purchaseCount: input.purchaseCount, hsnSummaryRows, exceptionCount: Math.abs(outputTax - finite(input.ledgerOutputTax)) > 0.01 ? 1 : 0 });
}

export function calculateFxRevaluation(lines: Array<{ currencyCode: string; balance: number; openingRate: number; closingRate: number; evidenceReference: string }>): FxRevaluationLine[] {
  return lines.map((line) => { if (!line.evidenceReference.trim() || line.openingRate <= 0 || line.closingRate <= 0) throw new Error('FX revaluation requires positive rates and evidence.'); return { currencyCode: line.currencyCode, closingBalance: round(line.balance), openingRate: line.openingRate, closingRate: line.closingRate, gainLoss: round(line.balance * (line.closingRate - line.openingRate)), evidenceReference: line.evidenceReference.trim() }; });
}

export function allocateLandedCost(input: { chargeAmount: number; basis: 'value' | 'quantity' | 'equal'; lines: Array<{ receiptLineId: string; value: number; quantity: number }> }): LandedCostAllocationLine[] {
  const totalBasis = input.lines.reduce((sum, line) => sum + (input.basis === 'value' ? line.value : input.basis === 'quantity' ? line.quantity : 1), 0);
  if (input.chargeAmount < 0 || !input.lines.length || totalBasis <= 0) throw new Error('Landed-cost allocation requires positive charge and basis lines.');
  let allocated = 0;
  return input.lines.map((line, index) => { const basisAmount = input.basis === 'value' ? line.value : input.basis === 'quantity' ? line.quantity : 1; const sharePercent = round(basisAmount / totalBasis * 100); const allocatedCharge = index === input.lines.length - 1 ? round(input.chargeAmount - allocated) : round(input.chargeAmount * sharePercent / 100); allocated += allocatedCharge; return { receiptLineId: line.receiptLineId, basisAmount, sharePercent, allocatedCharge }; });
}

export function buildPeoplePostingEvidence(input: { sourceType: 'payroll' | 'expense'; sourceId: string; grossOrClaimAmount: number; employeeDeductions?: number; employerContributions?: number; evidenceReference: string }): PeoplePostingEvidence {
  const statutoryAmount = round(Math.max(0, input.employeeDeductions ?? 0) + Math.max(0, input.employerContributions ?? 0));
  const payableOrCashAmount = input.sourceType === 'payroll' ? round(input.grossOrClaimAmount - Math.max(0, input.employeeDeductions ?? 0)) : round(input.grossOrClaimAmount);
  if (!input.evidenceReference.trim() || input.grossOrClaimAmount < 0) throw new Error('Payroll or expense posting requires amount and evidence.');
  return { sourceType: input.sourceType, sourceId: input.sourceId, grossOrClaimAmount: round(input.grossOrClaimAmount), statutoryAmount, payableOrCashAmount, balanced: input.sourceType === 'expense' ? payableOrCashAmount === round(input.grossOrClaimAmount) : round(input.grossOrClaimAmount + Math.max(0, input.employerContributions ?? 0)) === round(payableOrCashAmount + statutoryAmount), evidenceReference: input.evidenceReference.trim() };
}

export function buildDimensionStatement(input: { dimensionType: DimensionStatement['dimensionType']; asOfDate: string; lines: Array<{ accountCode: string; debit: number; credit: number; dimensions?: Partial<Record<DimensionStatement['dimensionType'], string | null>> }> }): DimensionStatement {
  const grouped = new Map<string, DimensionStatementLine>();
  for (const line of input.lines) {
    const dimensionId = line.dimensions?.[input.dimensionType]; if (!dimensionId) continue;
    const current = grouped.get(`${dimensionId}/${line.accountCode}`) ?? { dimensionId, accountCode: line.accountCode, debit: 0, credit: 0, balance: 0 };
    current.debit = round(current.debit + line.debit); current.credit = round(current.credit + line.credit); current.balance = round(current.debit - current.credit); grouped.set(`${dimensionId}/${line.accountCode}`, current);
  }
  const result = [...grouped.values()].sort((left, right) => `${left.dimensionId}/${left.accountCode}`.localeCompare(`${right.dimensionId}/${right.accountCode}`));
  const totalDebit = round(result.reduce((sum, line) => sum + line.debit, 0)); const totalCredit = round(result.reduce((sum, line) => sum + line.credit, 0));
  return { dimensionType: input.dimensionType, asOfDate: input.asOfDate, lines: result, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export function buildLandedCostWorkpaper(input: { receiptCount: number; allocatedCharges: number; inventoryValue: number; costedReceiptCount: number; exceptions?: number }): LandedCostWorkpaper {
  const receiptCount = Math.max(0, input.receiptCount); const coverage = receiptCount ? round(Math.min(100, Math.max(0, input.costedReceiptCount) / receiptCount * 100)) : 100;
  return { receiptCount, allocatedCharges: round(input.allocatedCharges), inventoryValue: round(input.inventoryValue), allocationCoverage: coverage, exceptions: Math.max(0, input.exceptions ?? 0) };
}

export function summarizePeoplePosting(input: { finalizedPayroll: number; reimbursedExpenses: number; readyPayroll: number; readyExpenses: number }): PeoplePostingReadiness {
  const payrollFinalized = Math.max(0, input.finalizedPayroll); const expensesReimbursed = Math.max(0, input.reimbursedExpenses); const readyForGl = Math.max(0, input.readyPayroll) + Math.max(0, input.readyExpenses);
  return { payrollFinalized, expensesReimbursed, readyForGl, blocked: Math.max(0, payrollFinalized + expensesReimbursed - readyForGl) };
}
