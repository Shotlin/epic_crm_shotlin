import { createHash, randomUUID } from 'node:crypto';
import type {
  BindLedgerCompanyInput,
  CancelLedgerJournalInput,
  CreateLedgerJournalInput,
  GeneralLedgerSnapshot,
  FinancialStatements,
  SubledgerRollforward,
  GstWorkpaper,
  FixedAssetRollforward,
  LedgerCloseBlocker,
  LedgerCloseReadiness,
  LedgerAccount,
  LedgerCompanyBinding,
  LedgerJournal,
  LedgerJournalLine,
  LedgerPeriod,
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
  PrepareAssetCapitalizationPostingInput,
  PrepareAssetDepreciationPostingInput,
  PrepareAssetRetirementPostingInput,
  PrepareAssetSaleDisposalPostingInput,
  PrepareAssetLifecyclePostingInput,
  PrepareProjectRevenueRecognitionPostingInput,
  PrepareSupplierInvoicePostingInput,
  ReverseLedgerJournalInput,
  TrialBalanceRow,
} from '../shared/general-ledger-contracts';
import type { Company, KernelSnapshot } from '../shared/kernel-contracts';
import type {
  AssetCapitalization,
  AssetBookValue,
  AssetDepreciationPolicy,
  AssetDepreciationRun,
  AssetRetirement,
  AssetSaleDisposal,
} from '../shared/assets-maintenance-contracts';
import type {
  AccountingJournalDraft,
  IndiaBusinessProfile,
  TaxInvoice,
  PaymentReceipt,
  CreditDebitNote,
  Receivable,
  RevenueOpsSnapshot,
} from '../shared/revenue-ops-contracts';
import type {
  WithholdingEntry,
  WithholdingPolicy,
  WriteOffRequest,
} from '../shared/collections-finance-contracts';
import type {
  BankCharge,
  LiquiditySweep,
  PaymentProposal,
} from '../shared/treasury-contracts';
import type {
  GoodsReceipt,
  LandedCostAllocation,
  PurchaseOrder,
  Supplier,
  SupplierInvoice,
  ThreeWayMatch,
} from '../shared/procurement-contracts';
import type { ProductionMaterialIssue, ProductionOutput, WorkOrder } from '../shared/manufacturing-contracts';
import type {
  ProjectBillingClaim,
  ProjectBillingPlan,
  RevenueRecognitionEvent,
} from '../shared/financial-close-contracts';
import type { DeliveryProject } from '../shared/delivery-contracts';
import type { ExpenseClaim, PayrollRun } from '../shared/payroll-contracts';
import type { RetailReturn, RetailSale } from '../shared/retail-pos-contracts';
import type { RetailCommissionPayoutBatch } from '../shared/retail-customer-ops-contracts';
import { toIndiaBusinessDate } from '../shared/india-business-date';
import type {
  StoredLedgerAccount,
  StoredLedgerBinding,
  StoredLedgerJournal,
  StoredLedgerPeriod,
} from './database';
import { BusinessDatabase } from './database';
import type { KernelStore } from './kernel-store';
import type { RevenueOpsStore } from './revenue-ops-store';

type SeedAccount = Omit<
  StoredLedgerAccount,
  'id' | 'companyId' | 'createdBy' | 'createdAt'
>;

const CLOSE_BLOCKER_LIMIT = 25;
const CANONICAL_CLOSE_SOURCE_TYPES = new Set<AccountingJournalDraft['sourceType']>([
  'invoice',
  'payment',
  'credit-note',
  'debit-note',
  'supplier-invoice',
  'write-off',
  'withholding',
  'asset-capitalization',
  'asset-depreciation',
  'asset-retirement',
  'asset-sale-disposal',
  'asset-impairment',
  'asset-revaluation',
  'revenue-recognition',
  'treasury-payment',
  'bank-charge',
  'liquidity-sweep-release',
  'liquidity-sweep-settlement',
  'production-issue',
  'production-output',
  'landed-cost',
  'payroll-finalization',
  'expense-reimbursement',
  'retail-sale-cost',
  'retail-return-cost',
  'retail-commerce-settlement',
  'retail-commission-payout',
  'retail-inter-branch-transfer',
  'retail-cashier-variance',
]);

const INDIA_COA: SeedAccount[] = [
  { code: 'cash-at-bank', name: 'Cash at bank', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'cash-on-hand', name: 'Retail cash on hand', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'bank-clearing', name: 'Bank clearing', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'upi-clearing', name: 'UPI clearing', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'card-clearing', name: 'Card clearing', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'cash-in-transit', name: 'Cash in transit', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'inventory-in-transit', name: 'Inventory in transit', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'accounts-receivable', name: 'Accounts receivable', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'unbilled-revenue', name: 'Unbilled revenue', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'unapplied-cash', name: 'Unapplied customer cash', accountType: 'liability', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'tds-receivable', name: 'TDS receivable', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'inventory-asset', name: 'Inventory asset', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'accumulated-depreciation', name: 'Accumulated depreciation', accountType: 'asset', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'fixed-assets', name: 'Fixed assets — cost', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'input-cgst', name: 'Input CGST', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'input-sgst', name: 'Input SGST', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'input-igst', name: 'Input IGST', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'work-in-progress', name: 'Work in progress', accountType: 'asset', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'accounts-payable', name: 'Accounts payable', accountType: 'liability', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'payroll-payable', name: 'Payroll payable', accountType: 'liability', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'statutory-payable', name: 'Statutory payable', accountType: 'liability', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'output-cgst', name: 'Output CGST', accountType: 'liability', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'output-sgst', name: 'Output SGST', accountType: 'liability', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'output-igst', name: 'Output IGST', accountType: 'liability', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'output-cess', name: 'Output cess', accountType: 'liability', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'tds-payable', name: 'TDS payable', accountType: 'liability', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'tcs-payable', name: 'TCS payable', accountType: 'liability', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'landed-cost-clearing', name: 'Landed-cost clearing', accountType: 'liability', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'sales-revenue', name: 'Sales revenue', accountType: 'income', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'sales-adjustment', name: 'Sales adjustment', accountType: 'income', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'cash-variance-expense', name: 'Cashier over / short variance', accountType: 'expense', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'cost-of-goods-sold', name: 'Cost of goods sold', accountType: 'expense', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'bad-debt-expense', name: 'Bad-debt expense', accountType: 'expense', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'bank-charges-expense', name: 'Bank-charges expense', accountType: 'expense', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'manufacturing-variance', name: 'Manufacturing variance', accountType: 'expense', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'payroll-expense', name: 'Payroll expense', accountType: 'expense', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'employer-contribution-expense', name: 'Employer contribution expense', accountType: 'expense', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'employee-expense', name: 'Employee expense', accountType: 'expense', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'depreciation-expense', name: 'Depreciation expense', accountType: 'expense', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'asset-retirement-loss', name: 'Asset retirement loss', accountType: 'expense', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'impairment-loss', name: 'Asset impairment loss', accountType: 'expense', normalBalance: 'debit', isPostable: true, active: true },
  { code: 'impairment-reversal-income', name: 'Impairment reversal income', accountType: 'income', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'revaluation-surplus', name: 'Asset revaluation surplus', accountType: 'equity', normalBalance: 'credit', isPostable: true, active: true },
  { code: 'revaluation-loss', name: 'Asset revaluation loss', accountType: 'expense', normalBalance: 'debit', isPostable: true, active: true },
];

function clean(value: string, label: string, min: number, max: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${label} must contain ${min}-${max} characters.`);
  }
  return normalized;
}

function dateOnly(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function toMinor(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 9_000_000_000_000) {
    throw new Error(`${label} is outside the supported monetary range.`);
  }
  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`${label} cannot be represented safely in minor units.`);
  }
  return minor;
}

function fromMinor(value: number): number {
  return value / 100;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Matches the checksum shape of the Revenue Ledger's immutable handoff. The
 * adapter refuses any record whose signed source payload no longer matches.
 */
function revenueHandoffChecksum(source: AccountingJournalDraft): string {
  const lines = source.lines.map((line) => ({
    ...line,
    debit: money(line.debit),
    credit: money(line.credit),
  }));
  const unsigned = {
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceNumber: source.sourceNumber,
    postingDate: source.postingDate,
    lines,
    totalDebit: money(lines.reduce((total, line) => total + line.debit, 0)),
    totalCredit: money(lines.reduce((total, line) => total + line.credit, 0)),
  };
  return createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
}

const REVENUE_INVOICE_ACCOUNT_CODES = new Set([
  'accounts-receivable',
  'sales-revenue',
  'unbilled-revenue',
  'output-cgst',
  'output-sgst',
  'output-igst',
  'output-cess',
]);

const WRITE_OFF_ACCOUNT_CODES = new Set(['bad-debt-expense', 'accounts-receivable']);
const WITHHOLDING_ACCOUNT_CODES = new Set(['tds-receivable', 'tds-payable', 'accounts-receivable']);
const TREASURY_ACCOUNT_CODES = new Set(['accounts-payable', 'bank-charges-expense', 'input-igst', 'cash-at-bank', 'cash-in-transit']);

function validateTreasuryHandoff(
  source: AccountingJournalDraft,
  proposal: PaymentProposal | undefined,
  charge: BankCharge | undefined,
  sweep: LiquiditySweep | undefined,
  currencyCode: string,
): void {
  if (currencyCode !== 'INR' || !TREASURY_ACCOUNT_CODES.size) throw new Error('Treasury canonical posting requires INR books.');
  if (source.lines.some((line) => !TREASURY_ACCOUNT_CODES.has(line.accountCode))) throw new Error('Treasury handoffs contain an unsupported canonical account.');
  const amount = (code: string, side: 'debit' | 'credit') => Math.round(source.lines.filter(({ accountCode }) => accountCode === code).reduce((total, line) => total + line[side], 0) * 100);
  const ensureBalanced = (): void => {
    const debit = Math.round(source.lines.reduce((total, line) => total + line.debit, 0) * 100);
    const credit = Math.round(source.lines.reduce((total, line) => total + line.credit, 0) * 100);
    if (!source.lines.length || debit <= 0 || debit !== credit) throw new Error('Treasury handoff is not exactly balanced.');
  };
  ensureBalanced();
  if (source.sourceType === 'treasury-payment' && proposal) {
    const expected = Math.round(proposal.amount * 100);
    if (!['released', 'settled'].includes(proposal.status) || proposal.journalId !== source.id || source.sourceId !== proposal.id || source.sourceNumber !== proposal.number || amount('accounts-payable', 'debit') !== expected || amount('cash-at-bank', 'credit') !== expected || source.lines.length !== 2) throw new Error('Treasury payment does not match released payment evidence.');
    return;
  }
  if (source.sourceType === 'bank-charge' && charge) {
    const expected = Math.round(charge.amount * 100);
    const tax = Math.round(charge.taxAmount * 100);
    if (!['recorded', 'reconciled'].includes(charge.status) || charge.journalId !== source.id || source.sourceId !== charge.id || source.sourceNumber !== charge.number || amount('bank-charges-expense', 'debit') !== expected - tax || amount('input-igst', 'debit') !== tax || amount('cash-at-bank', 'credit') !== expected || source.lines.length !== (tax ? 3 : 2)) throw new Error('Bank charge does not match recorded charge evidence.');
    return;
  }
  if ((source.sourceType === 'liquidity-sweep-release' || source.sourceType === 'liquidity-sweep-settlement') && sweep) {
    const expected = Math.round(sweep.amount * 100);
    const journalId = source.sourceType === 'liquidity-sweep-release' ? sweep.releaseJournalId : sweep.settlementJournalId;
    const status = source.sourceType === 'liquidity-sweep-release' ? ['released', 'settled'] : ['settled'];
    const debitCode = source.sourceType === 'liquidity-sweep-release' ? 'cash-in-transit' : 'cash-at-bank';
    const creditCode = source.sourceType === 'liquidity-sweep-release' ? 'cash-at-bank' : 'cash-in-transit';
    if (!status.includes(sweep.status) || journalId !== source.id || source.sourceId !== sweep.id || source.sourceNumber !== sweep.number || amount(debitCode, 'debit') !== expected || amount(creditCode, 'credit') !== expected || source.lines.length !== 2) throw new Error('Liquidity sweep does not match its release or settlement evidence.');
    return;
  }
  throw new Error('Treasury handoff source does not match a supported treasury record.');
}

function validateManufacturingHandoff(
  source: AccountingJournalDraft,
  issue: ProductionMaterialIssue | undefined,
  output: ProductionOutput | undefined,
  order: WorkOrder | undefined,
  currencyCode: string,
): void {
  if (currencyCode !== 'INR' || source.lines.length !== 2 || source.lines.some((line) => !['work-in-progress', 'inventory-asset'].includes(line.accountCode))) throw new Error('Manufacturing handoffs require two-line INR inventory/WIP evidence.');
  const debit = (code: string) => Math.round(source.lines.filter(({ accountCode }) => accountCode === code).reduce((total, line) => total + line.debit, 0) * 100);
  const credit = (code: string) => Math.round(source.lines.filter(({ accountCode }) => accountCode === code).reduce((total, line) => total + line.credit, 0) * 100);
  if (source.sourceType === 'production-issue' && issue && order) {
    const expected = Math.round(issue.totalCost * 100);
    if (issue.journalId !== source.id || issue.number !== source.sourceNumber || issue.workOrderId !== order.id || issue.scope?.companyId !== order.scope?.companyId || issue.scope?.branchId !== order.scope?.branchId || source.postingDate !== issue.issuedAt.slice(0, 10) || debit('work-in-progress') !== expected || credit('inventory-asset') !== expected) throw new Error('Production material issue does not match work-order cost evidence.');
    return;
  }
  if (source.sourceType === 'production-output' && output && order) {
    const expected = Math.round((output.materialCost + output.operationCost) * 100);
    if (output.journalId !== source.id || output.number !== source.sourceNumber || output.workOrderId !== order.id || output.itemVariantId !== order.outputVariantId || output.scope?.companyId !== order.scope?.companyId || output.scope?.branchId !== order.scope?.branchId || source.postingDate !== output.recordedAt.slice(0, 10) || debit('inventory-asset') !== expected || credit('work-in-progress') !== expected) throw new Error('Production output does not match work-order cost evidence.');
    return;
  }
  throw new Error('Manufacturing handoff source does not match a supported production record.');
}

function validateLandedCostHandoff(source: AccountingJournalDraft, allocation: LandedCostAllocation | undefined, receipt: GoodsReceipt | undefined, currencyCode: string): void {
  if (currencyCode !== 'INR' || !allocation || !receipt || source.sourceType !== 'landed-cost' || source.sourceId !== allocation.id || source.sourceNumber !== allocation.number || source.lines.length !== 2 || allocation.status !== 'approved' || receipt.status !== 'costed') throw new Error('Landed-cost handoff is not an approved and costed INR allocation.');
  const total = Math.round(allocation.totalAmount * 100);
  const allocated = Math.round(allocation.allocations.reduce((sum, item) => sum + item.amount, 0) * 100);
  const debit = Math.round(source.lines.filter(({ accountCode }) => accountCode === 'inventory-asset').reduce((sum, line) => sum + line.debit, 0) * 100);
  const credit = Math.round(source.lines.filter(({ accountCode }) => accountCode === 'landed-cost-clearing').reduce((sum, line) => sum + line.credit, 0) * 100);
  if (total <= 0 || allocated !== total || debit !== total || credit !== total) throw new Error('Landed-cost amounts do not reconcile to the approved allocation.');
}

function validatePeopleHandoff(source: AccountingJournalDraft, run: PayrollRun | undefined, expense: ExpenseClaim | undefined, currencyCode: string): void {
  if (currencyCode !== 'INR' || source.lines.some((line) => !['payroll-expense', 'employer-contribution-expense', 'payroll-payable', 'statutory-payable', 'employee-expense', 'cash-at-bank'].includes(line.accountCode))) throw new Error('People handoffs contain an unsupported canonical account.');
  const amount = (code: string, side: 'debit' | 'credit') => Math.round(source.lines.filter(({ accountCode }) => accountCode === code).reduce((sum, line) => sum + line[side], 0) * 100);
  if (source.sourceType === 'payroll-finalization' && run) {
    if (run.status !== 'finalized' || source.lines.length !== 4 || run.journalDraftId !== source.id || source.sourceId !== run.id || source.sourceNumber !== run.number || source.postingDate !== run.paymentDate || amount('payroll-expense', 'debit') !== Math.round(run.totalGrossPay * 100) || amount('employer-contribution-expense', 'debit') !== Math.round(run.totalEmployerContributions * 100) || amount('payroll-payable', 'credit') !== Math.round(run.totalNetPay * 100) || amount('statutory-payable', 'credit') !== Math.round((run.totalEmployeeDeductions + run.totalEmployerContributions) * 100)) throw new Error('Payroll finalization does not match its frozen run totals.');
    return;
  }
  if (source.sourceType === 'expense-reimbursement' && expense) {
    const expected = Math.round(expense.amount * 100);
    if (expense.status !== 'reimbursed' || expense.journalDraftId !== source.id || source.sourceId !== expense.id || source.sourceNumber !== expense.number || amount('employee-expense', 'debit') !== expected || amount('cash-at-bank', 'credit') !== expected || source.lines.length !== 2) throw new Error('Expense reimbursement does not match approved claim evidence.');
    return;
  }
  throw new Error('People handoff source does not match a supported payroll or expense record.');
}

function validateWriteOffHandoff(
  source: AccountingJournalDraft,
  request: WriteOffRequest,
  receivable: Receivable,
  currencyCode: string,
): void {
  if (
    source.sourceType !== 'write-off' ||
    source.sourceId !== request.id ||
    source.sourceNumber !== request.number ||
    request.status !== 'approved' ||
    request.journalId !== source.id ||
    receivable.id !== request.receivableId ||
    receivable.accountId !== request.accountId ||
    currencyCode !== 'INR'
  ) {
    throw new Error('The write-off handoff no longer matches approved receivable evidence.');
  }
  if (source.lines.some((line) => !WRITE_OFF_ACCOUNT_CODES.has(line.accountCode))) {
    throw new Error('Write-off handoffs contain an unsupported canonical account.');
  }
  const debit = Math.round(source.lines.filter(({ accountCode }) => accountCode === 'bad-debt-expense').reduce((total, line) => total + line.debit, 0) * 100);
  const credit = Math.round(source.lines.filter(({ accountCode }) => accountCode === 'accounts-receivable').reduce((total, line) => total + line.credit, 0) * 100);
  const amount = Math.round(request.amount * 100);
  if (debit !== amount || credit !== amount || source.lines.length !== 2 || (receivable.writtenOffAmount ?? 0) < request.amount) {
    throw new Error('Write-off amounts do not match the approved receivable evidence.');
  }
}

function validateWithholdingHandoff(
  source: AccountingJournalDraft,
  entry: WithholdingEntry,
  policy: WithholdingPolicy,
  receivable: Receivable | undefined,
  currencyCode: string,
): void {
  if (
    source.sourceType !== 'withholding' ||
    source.sourceId !== entry.id ||
    source.sourceNumber !== entry.number ||
    source.postingDate !== entry.eventDate ||
    entry.journalId !== source.id ||
    !policy.active ||
    policy.kind !== (entry.direction === 'company-collected-tcs' ? 'TCS' : 'TDS') ||
    currencyCode !== 'INR'
  ) {
    throw new Error('The withholding handoff no longer matches effective TDS/TCS evidence.');
  }
  if (!receivable || receivable.accountId !== entry.accountId) {
    throw new Error('Withholding posting requires the linked receivable to remain in the same account.');
  }
  if (source.lines.some((line) => !WITHHOLDING_ACCOUNT_CODES.has(line.accountCode))) {
    throw new Error('Withholding handoffs contain an unsupported canonical account.');
  }
  const taxAmount = Math.round(entry.taxAmount * 100);
  const debit = (code: string) => Math.round(source.lines.filter(({ accountCode }) => accountCode === code).reduce((total, line) => total + line.debit, 0) * 100);
  const credit = (code: string) => Math.round(source.lines.filter(({ accountCode }) => accountCode === code).reduce((total, line) => total + line.credit, 0) * 100);
  const expected = entry.direction === 'company-collected-tcs'
    ? debit('accounts-receivable') === taxAmount && credit('tcs-payable') === taxAmount
    : debit('tds-receivable') === taxAmount && credit('accounts-receivable') === taxAmount;
  if (!expected || source.lines.length !== 2) {
    throw new Error('Withholding amounts do not match the recognized TDS/TCS evidence.');
  }
}

function validateCashReceiptHandoff(source: AccountingJournalDraft, receipt: PaymentReceipt, currencyCode: string): void {
  if (receipt.id !== source.sourceId || receipt.number !== source.sourceNumber || source.postingDate !== receipt.receivedAt.slice(0, 10) || currencyCode !== 'INR' || receipt.status !== 'reconciled') throw new Error('The reconciled cash receipt no longer matches its Revenue Ledger handoff.');
  // Existing receipts predate tender metadata and remain bank-clearing. New
  // retail cash is explicitly held in the controlled cash drawer account.
  const clearingAccount = receipt.settlementAccount ?? 'bank-clearing';
  const allowed = new Set([clearingAccount, 'accounts-receivable', 'unapplied-cash']);
  if (source.lines.some((line) => !allowed.has(line.accountCode))) throw new Error('Cash-receipt handoffs contain an unsupported canonical account.');
  const sum = (code: string, side: 'debit' | 'credit') => source.lines.filter((line) => line.accountCode === code).reduce((total, line) => total + line[side], 0);
  const allocated = receipt.allocations.reduce((total, allocation) => total + allocation.amount, 0);
  if (sum(clearingAccount, 'debit') !== receipt.amount || sum(clearingAccount, 'credit') !== 0 || sum('accounts-receivable', 'credit') !== allocated || sum('accounts-receivable', 'debit') !== 0 || sum('unapplied-cash', 'credit') !== receipt.unappliedAmount || sum('unapplied-cash', 'debit') !== 0 || Math.round((allocated + receipt.unappliedAmount) * 100) !== Math.round(receipt.amount * 100)) throw new Error('Cash-receipt handoff totals do not match reconciled receipt evidence.');
}

/** Repeats the operational proof before retail cost reaches the canonical book. */
function validateRetailSaleCostHandoff(
  source: AccountingJournalDraft,
  sale: RetailSale,
  revenue: RevenueOpsSnapshot,
  currencyCode: string,
): void {
  if (
    currencyCode !== 'INR' ||
    source.sourceType !== 'retail-sale-cost' ||
    source.sourceId !== sale.id ||
    source.sourceNumber !== sale.number ||
    source.postingDate !== toIndiaBusinessDate(sale.saleAt) ||
    sale.status !== 'completed' ||
    !sale.invoiceId ||
    !sale.receivableId ||
    source.lines.length !== 2
  ) {
    throw new Error('Retail cost handoff is not tied to a completed in-scope retail sale.');
  }
  const expected = toMinor(sale.costTotal, 'Retail sale cost');
  const lineCost = sale.lines.reduce((total, line) => total + toMinor(line.costValue, 'Retail line cost'), 0);
  const inventoryCost = revenue.inventoryLedger
    .filter((entry) => entry.type === 'retail-sale' && entry.reference === sale.number)
    .reduce((total, entry) => total + Math.round(Math.abs(entry.value) * 100), 0);
  const debit = source.lines.filter(({ accountCode }) => accountCode === 'cost-of-goods-sold').reduce((total, line) => total + toMinor(line.debit, 'Retail COGS debit'), 0);
  const credit = source.lines.filter(({ accountCode }) => accountCode === 'inventory-asset').reduce((total, line) => total + toMinor(line.credit, 'Retail inventory credit'), 0);
  if (
    expected <= 0 ||
    lineCost !== expected ||
    inventoryCost !== expected ||
    source.lines.some((line) => !['cost-of-goods-sold', 'inventory-asset'].includes(line.accountCode)) ||
    debit !== expected ||
    credit !== expected ||
    toMinor(source.totalDebit, 'Retail cost handoff debit total') !== expected ||
    toMinor(source.totalCredit, 'Retail cost handoff credit total') !== expected
  ) {
    throw new Error('Retail cost handoff does not reconcile to its stock ledger and completed sale evidence.');
  }
}

/** Repeats the immutable stock proof before a counter-return COGS reversal posts. */
function validateRetailReturnCostHandoff(
  source: AccountingJournalDraft,
  returnCase: RetailReturn,
  revenue: RevenueOpsSnapshot,
  currencyCode: string,
): void {
  if (
    currencyCode !== 'INR' ||
    source.sourceType !== 'retail-return-cost' ||
    source.sourceId !== returnCase.id ||
    source.sourceNumber !== returnCase.number ||
    !returnCase.approvedAt ||
    source.postingDate !== toIndiaBusinessDate(returnCase.approvedAt) ||
    returnCase.status !== 'approved' ||
    returnCase.cogsReversalJournalDraftId !== source.id ||
    source.lines.length !== 2
  ) {
    throw new Error('Retail return cost handoff is not tied to an approved in-scope counter return.');
  }
  const expected = returnCase.lines.reduce((total, line) => total + toMinor(line.returnValues.costValue, 'Retail return line cost'), 0);
  const inventoryCost = revenue.inventoryLedger
    .filter((entry) => entry.type === 'return' && entry.reference === returnCase.number)
    .reduce((total, entry) => total + Math.round(entry.value * 100), 0);
  const debit = source.lines.filter(({ accountCode }) => accountCode === 'inventory-asset').reduce((total, line) => total + toMinor(line.debit, 'Retail return inventory debit'), 0);
  const credit = source.lines.filter(({ accountCode }) => accountCode === 'cost-of-goods-sold').reduce((total, line) => total + toMinor(line.credit, 'Retail return COGS credit'), 0);
  if (
    expected <= 0 ||
    inventoryCost !== expected ||
    source.lines.some((line) => !['inventory-asset', 'cost-of-goods-sold'].includes(line.accountCode)) ||
    debit !== expected ||
    credit !== expected ||
    toMinor(source.totalDebit, 'Retail return cost handoff debit total') !== expected ||
    toMinor(source.totalCredit, 'Retail return cost handoff credit total') !== expected
  ) {
    throw new Error('Retail return cost handoff does not reconcile to approved physical stock evidence.');
  }
}

/** Repeats payout evidence before a released commission batch reaches the canonical book. */
function validateRetailCommissionPayoutHandoff(
  source: AccountingJournalDraft,
  batch: RetailCommissionPayoutBatch,
  revenue: RevenueOpsSnapshot,
  currencyCode: string,
): void {
  if (
    currencyCode !== 'INR' ||
    source.sourceType !== 'retail-commission-payout' ||
    source.sourceId !== batch.id ||
    source.sourceNumber !== batch.number ||
    source.postingDate !== batch.payoutDate ||
    batch.status !== 'released' ||
    batch.journalDraftId !== source.id ||
    !batch.releaseReference ||
    source.externalReference !== batch.releaseReference ||
    source.lines.length !== 2
  ) {
    throw new Error('Retail commission payout handoff is not tied to a released batch and bank evidence.');
  }
  const commissions = batch.commissionIds.map((id) => revenue.retailSalesCommissions.find((candidate) => candidate.id === id));
  const expected = toMinor(batch.totalAmount, 'Retail commission payout total');
  const actual = commissions.reduce((total, commission) => total + (commission ? toMinor(commission.commissionAmount, 'Retail commission amount') : 0), 0);
  const debit = source.lines.filter(({ accountCode }) => accountCode === 'employee-expense').reduce((total, line) => total + toMinor(line.debit, 'Commission expense debit'), 0);
  const credit = source.lines.filter(({ accountCode }) => accountCode === 'cash-at-bank').reduce((total, line) => total + toMinor(line.credit, 'Commission bank credit'), 0);
  if (
    expected <= 0 ||
    commissions.some((commission) => !commission || commission.status !== 'paid' || commission.payoutBatchId !== batch.id || !commission.payoutReference?.includes(batch.releaseReference!)) ||
    actual !== expected ||
    source.lines.some((line) => !['employee-expense', 'cash-at-bank'].includes(line.accountCode)) ||
    debit !== expected ||
    credit !== expected ||
    toMinor(source.totalDebit, 'Commission payout debit total') !== expected ||
    toMinor(source.totalCredit, 'Commission payout credit total') !== expected
  ) {
    throw new Error('Retail commission payout amounts do not match its released batch evidence.');
  }
}

function validateCommercialAdjustmentHandoff(source: AccountingJournalDraft, note: CreditDebitNote, currencyCode: string): void {
  if (!['credit-note', 'debit-note'].includes(source.sourceType) || source.sourceId !== note.id || source.sourceNumber !== note.number || source.postingDate !== note.noteDate || currencyCode !== 'INR') throw new Error('The commercial adjustment no longer matches its Revenue Ledger handoff.');
  const allowed = new Set(['accounts-receivable', 'sales-adjustment', 'output-cgst', 'output-sgst', 'output-igst']);
  if (source.lines.some((line) => !allowed.has(line.accountCode))) throw new Error('Commercial adjustment handoffs contain an unsupported canonical account.');
  const amount = (code: string, side: 'debit' | 'credit') => Math.round(source.lines.filter((line) => line.accountCode === code).reduce((total, line) => total + line[side], 0) * 100);
  const tax = amount('output-cgst', note.type === 'credit' ? 'debit' : 'credit') + amount('output-sgst', note.type === 'credit' ? 'debit' : 'credit') + amount('output-igst', note.type === 'credit' ? 'debit' : 'credit');
  const debit = note.type === 'credit' ? 'debit' : 'credit'; const credit = note.type === 'credit' ? 'credit' : 'debit';
  if (amount('sales-adjustment', debit) !== Math.round(note.taxableValue * 100) || amount('accounts-receivable', credit) !== Math.round(note.totalAmount * 100) || tax !== Math.round(note.taxAmount * 100)) throw new Error('Commercial adjustment amounts do not match its taxable, GST, and receivable evidence.');
}

const SUPPLIER_INVOICE_ACCOUNT_CODES = new Set([
  'inventory-asset',
  'input-cgst',
  'input-sgst',
  'input-igst',
  'accounts-payable',
]);

/**
 * The procurement module produces a balanced operational handoff. This
 * boundary repeats its accounting proof against the accepted supplier invoice
 * and the governing three-way match before it reaches canonical AP.
 */
function validateSupplierInvoiceHandoff(
  source: AccountingJournalDraft,
  invoice: SupplierInvoice,
  match: ThreeWayMatch,
  supplier: Supplier,
  purchaseOrder: PurchaseOrder,
  receipt: GoodsReceipt,
  profile: IndiaBusinessProfile,
  currencyCode: string,
): void {
  if (
    source.sourceType !== 'supplier-invoice' ||
    source.sourceId !== match.id ||
    source.sourceNumber !== invoice.number ||
    source.postingDate !== invoice.invoiceDate ||
    match.supplierInvoiceId !== invoice.id ||
    match.journalId !== source.id ||
    invoice.purchaseOrderId !== purchaseOrder.id ||
    invoice.goodsReceiptId !== receipt.id ||
    match.purchaseOrderId !== purchaseOrder.id ||
    match.goodsReceiptId !== receipt.id ||
    receipt.purchaseOrderId !== purchaseOrder.id ||
    supplier.id !== purchaseOrder.supplierId ||
    supplier.id !== receipt.supplierId ||
    !['matched', 'approved'].includes(match.status) ||
    supplier.id !== invoice.supplierId ||
    supplier.status !== 'approved' ||
    currencyCode !== 'INR'
  ) {
    throw new Error('The supplier-invoice handoff no longer matches approved three-way-match evidence.');
  }
  if (
    match.status === 'approved' &&
    (!match.decidedBy || !match.decidedAt || match.decidedBy === match.createdBy)
  ) {
    throw new Error('The supplier-invoice variance approval is not independently evidenced.');
  }
  if (
    !invoice.scope ||
    !match.scope ||
    !purchaseOrder.scope ||
    !receipt.scope ||
    invoice.scope.companyId !== match.scope.companyId ||
    invoice.scope.branchId !== match.scope.branchId ||
    invoice.scope.companyId !== purchaseOrder.scope.companyId ||
    invoice.scope.branchId !== purchaseOrder.scope.branchId ||
    invoice.scope.companyId !== receipt.scope.companyId ||
    invoice.scope.branchId !== receipt.scope.branchId
  ) {
    throw new Error('The supplier invoice, match, purchase order, and goods receipt must share one company and branch scope.');
  }

  if (!['partially-received', 'received', 'closed'].includes(purchaseOrder.status)) {
    throw new Error('Supplier-invoice posting requires a received purchase order.');
  }

  const invoiceLineIds = new Set<string>();
  for (const line of invoice.lines) {
    if (invoiceLineIds.has(line.purchaseOrderLineId)) {
      throw new Error('Supplier invoice evidence cannot contain duplicate purchase-order lines.');
    }
    invoiceLineIds.add(line.purchaseOrderLineId);
    const purchaseOrderLine = purchaseOrder.lines.find(({ id }) => id === line.purchaseOrderLineId);
    const receiptLines = receipt.lines.filter(
      ({ purchaseOrderLineId }) => purchaseOrderLineId === line.purchaseOrderLineId,
    );
    const receivedQuantity = receiptLines.reduce(
      (total, receiptLine) => total + receiptLine.quantity,
      0,
    );
    if (
      !purchaseOrderLine ||
      receiptLines.length === 0 ||
      receiptLines.some(
        ({ itemVariantId }) => itemVariantId !== purchaseOrderLine.itemVariantId,
      ) ||
      line.quantity > receivedQuantity ||
      line.quantity > purchaseOrderLine.receivedQuantity ||
      line.quantity > purchaseOrderLine.invoicedQuantity
    ) {
      throw new Error('Supplier invoice lines must be supported by the matched purchase-order and goods-receipt evidence.');
    }
  }

  const taxable = money(
    invoice.lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0),
  );
  for (const line of invoice.lines) {
    if (
      !Number.isFinite(line.quantity) ||
      !Number.isFinite(line.unitPrice) ||
      !Number.isFinite(line.gstRate) ||
      line.quantity <= 0 ||
      line.unitPrice <= 0 ||
      line.gstRate < 0 ||
      line.gstRate > 100 ||
      toMinor(line.totalAmount, 'Supplier invoice line total') !==
        toMinor(
          money(line.quantity * line.unitPrice * (1 + line.gstRate / 100)),
          'Supplier invoice expected line total',
        )
    ) {
      throw new Error('Supplier invoice line evidence is internally inconsistent.');
    }
  }
  const taxableMinor = toMinor(taxable, 'Supplier invoice taxable value');
  const totalMinor = toMinor(invoice.totalAmount, 'Supplier invoice total amount');
  const taxMinor = totalMinor - taxableMinor;
  if (taxMinor < 0) {
    throw new Error('Supplier invoice tax evidence cannot be negative.');
  }
  const taxAmount = fromMinor(taxMinor);
  const expectedTax = supplier.stateCode === profile.defaultStateCode
    ? new Map<string, number>([
      ['input-cgst', toMinor(money(taxAmount / 2), 'Supplier invoice CGST')],
      ['input-sgst', taxMinor - toMinor(money(taxAmount / 2), 'Supplier invoice CGST')],
      ['input-igst', 0],
    ])
    : new Map<string, number>([
      ['input-cgst', 0],
      ['input-sgst', 0],
      ['input-igst', taxMinor],
    ]);

  const byAccount = new Map<string, Array<{ debit: number; credit: number }>>();
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of source.lines) {
    if (!SUPPLIER_INVOICE_ACCOUNT_CODES.has(line.accountCode)) {
      throw new Error(`Supplier-invoice handoffs cannot post ${line.accountCode}.`);
    }
    const debit = toMinor(line.debit, 'Supplier invoice debit');
    const credit = toMinor(line.credit, 'Supplier invoice credit');
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      throw new Error('Each supplier-invoice handoff line must contain one positive debit or credit.');
    }
    debitTotal += debit;
    creditTotal += credit;
    const lines = byAccount.get(line.accountCode) ?? [];
    lines.push({ debit, credit });
    byAccount.set(line.accountCode, lines);
  }
  const oneDebit = (accountCode: string, expected: number): void => {
    const lines = byAccount.get(accountCode) ?? [];
    const [line] = lines;
    if (lines.length !== 1 || !line || line.credit !== 0 || line.debit !== expected) {
      throw new Error(`Supplier invoice ${accountCode} does not match accepted payable evidence.`);
    }
  };
  const oneCredit = (accountCode: string, expected: number): void => {
    const lines = byAccount.get(accountCode) ?? [];
    const [line] = lines;
    if (lines.length !== 1 || !line || line.debit !== 0 || line.credit !== expected) {
      throw new Error(`Supplier invoice ${accountCode} does not match accepted payable evidence.`);
    }
  };
  const optionalDebit = (accountCode: string, expected: number): void => {
    const lines = byAccount.get(accountCode) ?? [];
    if (expected === 0) {
      if (lines.length) {
        throw new Error(`${accountCode} is not allowed for this supplier invoice tax treatment.`);
      }
      return;
    }
    oneDebit(accountCode, expected);
  };

  if (
    debitTotal !== totalMinor ||
    creditTotal !== totalMinor ||
    toMinor(source.totalDebit, 'Supplier-invoice handoff debit total') !== totalMinor ||
    toMinor(source.totalCredit, 'Supplier-invoice handoff credit total') !== totalMinor
  ) {
    throw new Error('Supplier-invoice handoff is not an exactly balanced payable posting.');
  }
  oneDebit('inventory-asset', taxableMinor);
  oneCredit('accounts-payable', totalMinor);
  for (const [accountCode, expected] of expectedTax) {
    optionalDebit(accountCode, expected);
  }
}

function validateRevenueInvoiceHandoff(
  source: AccountingJournalDraft,
  invoice: TaxInvoice,
  currencyCode: string,
): void {
  if (
    invoice.id !== source.sourceId ||
    invoice.number !== source.sourceNumber ||
    invoice.invoiceDate !== source.postingDate ||
    invoice.currency !== currencyCode ||
    invoice.irpStatus === 'cancelled'
  ) {
    throw new Error('The Revenue Ledger handoff no longer matches its issued invoice evidence.');
  }
  const expectedRevenueCode = invoice.projectBillingClaimIds?.length
    ? 'unbilled-revenue'
    : 'sales-revenue';
  const expectedTax = new Map<string, number>([
    ['output-cgst', invoice.reverseCharge ? 0 : toMinor(invoice.taxPreview.cgst, 'Invoice CGST')],
    ['output-sgst', invoice.reverseCharge ? 0 : toMinor(invoice.taxPreview.sgst, 'Invoice SGST')],
    ['output-igst', invoice.reverseCharge ? 0 : toMinor(invoice.taxPreview.igst, 'Invoice IGST')],
    ['output-cess', invoice.reverseCharge ? 0 : toMinor(invoice.taxPreview.cess ?? 0, 'Invoice cess')],
  ]);
  const taxable = toMinor(invoice.taxPreview.taxableValue, 'Invoice taxable value');
  const amountDue = toMinor(invoice.amountDue, 'Invoice amount due');
  const taxTotal = toMinor(invoice.taxPreview.totalTax, 'Invoice total tax');
  const grandTotal = toMinor(invoice.taxPreview.grandTotal, 'Invoice grand total');
  const componentTaxTotal = [...expectedTax.values()].reduce((total, tax) => total + tax, 0);
  if (
    taxTotal !== componentTaxTotal ||
    grandTotal !== amountDue ||
    taxable + componentTaxTotal !== amountDue
  ) {
    throw new Error('The issued invoice tax evidence is internally inconsistent.');
  }
  const byAccount = new Map<string, Array<{ debit: number; credit: number }>>();
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of source.lines) {
    if (!REVENUE_INVOICE_ACCOUNT_CODES.has(line.accountCode)) {
      throw new Error(`Revenue invoice handoffs cannot post ${line.accountCode}.`);
    }
    const debit = toMinor(line.debit, 'Revenue invoice debit');
    const credit = toMinor(line.credit, 'Revenue invoice credit');
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      throw new Error('Each Revenue Ledger invoice line must contain one positive debit or credit.');
    }
    debitTotal += debit;
    creditTotal += credit;
    const bucket = byAccount.get(line.accountCode) ?? [];
    bucket.push({ debit, credit });
    byAccount.set(line.accountCode, bucket);
  }
  const oneDebit = (accountCode: string): number => {
    const lines = byAccount.get(accountCode) ?? [];
    const [line] = lines;
    if (lines.length !== 1 || !line || line.credit !== 0) {
      throw new Error(`Revenue invoice requires one debit ${accountCode} line.`);
    }
    return line.debit;
  };
  const oneCredit = (accountCode: string, expected: number): void => {
    const lines = byAccount.get(accountCode) ?? [];
    if (expected === 0) {
      if (lines.length) throw new Error(`${accountCode} is not allowed for this invoice tax treatment.`);
      return;
    }
    const [line] = lines;
    if (lines.length !== 1 || !line || line.debit !== 0 || line.credit !== expected) {
      throw new Error(`Revenue invoice ${accountCode} does not match the issued invoice tax evidence.`);
    }
  };
  if (
    oneDebit('accounts-receivable') !== amountDue ||
    debitTotal !== amountDue ||
    creditTotal !== amountDue ||
    toMinor(source.totalDebit, 'Revenue handoff debit total') !== amountDue ||
    toMinor(source.totalCredit, 'Revenue handoff credit total') !== amountDue
  ) {
    throw new Error('Revenue invoice receivable and handoff totals do not match the issued invoice.');
  }
  oneCredit(expectedRevenueCode, taxable);
  oneCredit(expectedRevenueCode === 'sales-revenue' ? 'unbilled-revenue' : 'sales-revenue', 0);
  for (const [accountCode, expected] of expectedTax) oneCredit(accountCode, expected);
}

const PROJECT_REVENUE_RECOGNITION_ACCOUNT_CODES = new Set([
  'unbilled-revenue',
  'sales-revenue',
]);

type ProjectRecognitionProjectEvidence = Pick<
  DeliveryProject,
  'id' | 'salesOrderId' | 'scope'
>;

/**
 * Revenue recognition is operationally approved before it reaches this
 * adapter. The ledger nevertheless repeats the source-chain proof so an
 * altered claim, recognition event, or handoff cannot manufacture revenue.
 */
function validateProjectRevenueRecognitionHandoff(
  source: AccountingJournalDraft,
  claim: ProjectBillingClaim,
  event: RevenueRecognitionEvent,
  plan: ProjectBillingPlan,
  project: ProjectRecognitionProjectEvidence,
  currencyCode: string,
): void {
  if (
    source.sourceType !== 'revenue-recognition' ||
    source.sourceId !== claim.id ||
    source.sourceNumber !== event.number ||
    source.postingDate !== event.recognitionDate ||
    event.claimId !== claim.id ||
    event.projectId !== claim.projectId ||
    event.journalDraftId !== source.id ||
    claim.recognitionEventId !== event.id ||
    !['recognized', 'invoiced'].includes(claim.status) ||
    plan.id !== claim.planId ||
    plan.projectId !== claim.projectId ||
    plan.salesOrderId !== claim.salesOrderId ||
    plan.salesOrderLineId !== claim.salesOrderLineId ||
    project.id !== claim.projectId ||
    project.salesOrderId !== claim.salesOrderId ||
    currencyCode !== 'INR'
  ) {
    throw new Error('The project revenue-recognition handoff no longer matches its approved claim evidence.');
  }

  if (
    !claim.recognizedBy ||
    !claim.recognizedAt ||
    claim.recognizedBy === claim.requestedBy ||
    claim.recognizedBy !== event.recognizedBy ||
    claim.recognizedAt !== event.recognizedAt
  ) {
    throw new Error('Project revenue recognition requires independently recorded claim approval evidence.');
  }

  const claimScope = claim.scope;
  if (
    !claimScope ||
    !event.scope ||
    !plan.scope ||
    !project.scope ||
    event.scope.companyId !== claimScope.companyId ||
    event.scope.branchId !== claimScope.branchId ||
    plan.scope.companyId !== claimScope.companyId ||
    plan.scope.branchId !== claimScope.branchId ||
    project.scope.companyId !== claimScope.companyId ||
    project.scope.branchId !== claimScope.branchId
  ) {
    throw new Error('The project claim, recognition event, plan, and project must share one company and branch scope.');
  }

  const amountMinor = toMinor(event.amount, 'Revenue-recognition event amount');
  if (
    amountMinor <= 0 ||
    amountMinor !== toMinor(claim.recognizedAmount, 'Revenue-recognition claim amount')
  ) {
    throw new Error('Project revenue-recognition event amount does not match the approved claim.');
  }

  const byAccount = new Map<string, Array<{ debit: number; credit: number }>>();
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of source.lines) {
    if (!PROJECT_REVENUE_RECOGNITION_ACCOUNT_CODES.has(line.accountCode)) {
      throw new Error(`Project revenue-recognition handoffs cannot post ${line.accountCode}.`);
    }
    const debit = toMinor(line.debit, 'Project revenue-recognition debit');
    const credit = toMinor(line.credit, 'Project revenue-recognition credit');
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      throw new Error('Each project revenue-recognition handoff line must contain one positive debit or credit.');
    }
    debitTotal += debit;
    creditTotal += credit;
    const lines = byAccount.get(line.accountCode) ?? [];
    lines.push({ debit, credit });
    byAccount.set(line.accountCode, lines);
  }

  const oneDebit = (accountCode: string, expected: number): void => {
    const lines = byAccount.get(accountCode) ?? [];
    const [line] = lines;
    if (lines.length !== 1 || !line || line.credit !== 0 || line.debit !== expected) {
      throw new Error(`Project revenue recognition ${accountCode} does not match approved claim evidence.`);
    }
  };
  const oneCredit = (accountCode: string, expected: number): void => {
    const lines = byAccount.get(accountCode) ?? [];
    const [line] = lines;
    if (lines.length !== 1 || !line || line.debit !== 0 || line.credit !== expected) {
      throw new Error(`Project revenue recognition ${accountCode} does not match approved claim evidence.`);
    }
  };

  if (
    debitTotal !== amountMinor ||
    creditTotal !== amountMinor ||
    toMinor(source.totalDebit, 'Project revenue-recognition handoff debit total') !== amountMinor ||
    toMinor(source.totalCredit, 'Project revenue-recognition handoff credit total') !== amountMinor
  ) {
    throw new Error('Project revenue-recognition handoff is not an exactly balanced approved posting.');
  }
  oneDebit('unbilled-revenue', amountMinor);
  oneCredit('sales-revenue', amountMinor);
}

function fiscalPeriodFor(date: string, fiscalYearStartMonth: number): {
  label: string;
  startDate: string;
  endDate: string;
} {
  const parts = date.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const startYear = month < fiscalYearStartMonth ? year - 1 : year;
  const startDate = `${startYear}-${String(fiscalYearStartMonth).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(startYear + 1, fiscalYearStartMonth - 1, 0));
  const endDate = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}`;
  return {
    label: `FY${startYear}-${String(startYear + 1).slice(-2)}`,
    startDate,
    endDate,
  };
}

export class GeneralLedgerStore {
  public constructor(
    private readonly database: BusinessDatabase,
    private readonly kernelStore: KernelStore,
    private readonly revenueOpsStore: RevenueOpsStore,
  ) {}

  public async initialize(): Promise<void> {
    const profile = this.revenueOpsStore.getSnapshot().profile;
    const binding = this.database.getLedgerBinding(profile.id);
    if (!binding) return;
    const resolution = this.resolveBinding(binding, this.kernelStore.getSnapshot(), profile);
    if (resolution.problem || !resolution.company) return;
    this.ensureFoundation(
      resolution.company,
      binding,
      profile,
      binding.boundBy,
      binding.boundAt,
      false,
    );
  }

  /**
   * Canonical books are company-owned, not workspace-context-owned. IPC uses
   * this boundary to authorize a finance user against the legal entity and
   * branch that actually own the journals.
   */
  public getBoundAuthorizationScope(): {
    companyId: string;
    branchId: string;
  } | null {
    const kernel = this.kernelStore.getSnapshot();
    const profile = this.revenueOpsStore.getSnapshot().profile;
    const binding = this.database.getLedgerBinding(profile.id);
    if (!binding) return null;
    const resolution = this.resolveBinding(binding, kernel, profile);
    if (resolution.problem || !resolution.company) return null;
    return {
      companyId: binding.companyId,
      branchId: binding.branchId,
    };
  }

  /**
   * Returns the canonical close proof for an arbitrary date window. The
   * composition root uses this aggregate-only boundary during close approval;
   * the renderer receives the same evidence per ledger period through the
   * regular snapshot.
   */
  public getCloseReadiness(periodFrom: string, periodTo: string): LedgerCloseReadiness {
    const normalizedFrom = dateOnly(periodFrom, 'Close-period from date');
    const normalizedTo = dateOnly(periodTo, 'Close-period to date');
    if (normalizedFrom > normalizedTo) {
      throw new Error('Close-period end date must not precede its start date.');
    }
    const profile = this.revenueOpsStore.getSnapshot().profile;
    const binding = this.database.getLedgerBinding(profile.id);
    if (!binding) {
      return {
        periodFrom: normalizedFrom,
        periodTo: normalizedTo,
        status: 'blocked',
        sourceDrafts: 0,
        sourceHandoffsReady: 0,
        sourceHandoffsBlocked: 1,
        journals: 0,
        postedJournals: 0,
        unpostedJournals: 0,
        reversalDrafts: 0,
        orphanReversals: 0,
        blockerCount: 1,
        blockers: [{
          code: 'source-handoff',
          reference: 'finance-binding',
          detail: 'Bind the India operating profile to a legal entity and branch before closing a period.',
        }],
      };
    }
    const journals = this.database.listLedgerJournals(binding.companyId, binding.branchId);
    const resolution = this.resolveBinding(binding, this.kernelStore.getSnapshot(), profile);
    if (resolution.problem || !resolution.company) {
      return {
        periodFrom: normalizedFrom,
        periodTo: normalizedTo,
        status: 'blocked',
        sourceDrafts: 0,
        sourceHandoffsReady: 0,
        sourceHandoffsBlocked: 1,
        journals: 0,
        postedJournals: 0,
        unpostedJournals: 0,
        reversalDrafts: 0,
        orphanReversals: 0,
        blockerCount: 1,
        blockers: [{
          code: 'source-handoff',
          reference: 'finance-binding',
          detail: resolution.problem ?? 'The finance binding is invalid.',
        }],
      };
    }
    return this.buildCloseReadiness(
      normalizedFrom,
      normalizedTo,
      journals,
      this.revenueOpsStore.getSnapshot(),
    );
  }

  public getSnapshot(): GeneralLedgerSnapshot {
    const kernel = this.kernelStore.getSnapshot();
    const revenue = this.revenueOpsStore.getSnapshot();
    const profile = revenue.profile;
    const binding = this.database.getLedgerBinding(profile.id);
    if (!binding) return this.blockedSnapshot(profile.id, 'Bind the India operating profile to a matching INR legal entity and branch before creating the canonical books.');
    const resolution = this.resolveBinding(binding, kernel, profile);
    if (resolution.problem || !resolution.company) {
      return this.blockedSnapshot(profile.id, resolution.problem ?? 'The finance binding is not valid.');
    }
    const accounts = this.database.listLedgerAccounts(binding.companyId).map(mapAccount);
    const periods = this.database.listLedgerPeriods(binding.companyId).map(mapPeriod);
    const storedJournals = this.database.listLedgerJournals(binding.companyId, binding.branchId);
    const journals = storedJournals.map(mapJournal);
    const trialBalance = this.database
      .listLedgerTrialBalance(binding.companyId, binding.branchId)
      .map((row) => ({
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      accountType: row.accountType,
      normalBalance: row.normalBalance,
      debit: fromMinor(row.debitMinor),
      credit: fromMinor(row.creditMinor),
      balance: fromMinor(row.balanceMinor),
    } satisfies TrialBalanceRow));
    const debit = trialBalance.reduce((total, row) => total + row.debit, 0);
    const credit = trialBalance.reduce((total, row) => total + row.credit, 0);
    const netAssets = trialBalance
      .filter(({ accountType }) => accountType === 'asset')
      .reduce((total, row) => total + row.balance, 0);
    const income = trialBalance
      .filter(({ accountType }) => accountType === 'income')
      .reduce((total, row) => total + (row.credit - row.debit), 0);
    const expenses = trialBalance
      .filter(({ accountType }) => accountType === 'expense')
      .reduce((total, row) => total + (row.debit - row.credit), 0);
    const financialStatements = this.buildFinancialStatements(trialBalance, storedJournals);
    const accountsReceivableRollforward = this.buildReceivableRollforward(revenue);
    const accountsPayableRollforward = this.buildPayableRollforward(revenue);
    const gstWorkpaper = this.buildGstWorkpaper(revenue);
    const closeReadiness = periods.map((period) => this.buildCloseReadiness(
      period.startDate,
      period.endDate,
      storedJournals,
      this.revenueOpsStore.getSnapshot(),
    ));
    return {
      generatedAt: new Date().toISOString(),
      profileId: profile.id,
      binding: mapBinding(binding),
      status: 'ready',
      blockingReason: null,
      accounts,
      periods,
      journals,
      trialBalance,
      financialStatements,
      accountsReceivableRollforward,
      accountsPayableRollforward,
      gstWorkpaper,
      fixedAssetRollforward: this.buildFixedAssetRollforward(storedJournals),
      closeReadiness,
      totals: {
        debit: Math.round(debit * 100) / 100,
        credit: Math.round(credit * 100) / 100,
        netAssets: Math.round(netAssets * 100) / 100,
        netIncome: Math.round((income - expenses) * 100) / 100,
      },
      integrityVerified: this.database.verifyLedgerChain(binding.companyId),
    };
  }

  private buildReceivableRollforward(revenue: RevenueOpsSnapshot): SubledgerRollforward {
    const additions = revenue.invoices.filter(({ status }) => status !== 'draft' && status !== 'cancelled').reduce((sum, invoice) => sum + invoice.amountDue, 0);
    const settlements = revenue.paymentReceipts.filter(({ status }) => status === 'reconciled').reduce((sum, receipt) => sum + receipt.amount, 0);
    const adjustments = revenue.receivables.reduce((sum, receivable) => sum + receivable.adjustmentAmount + (receivable.writtenOffAmount ?? 0), 0);
    const closing = revenue.receivables.reduce((sum, receivable) => sum + receivable.outstandingAmount, 0);
    return { opening: 0, additions, settlements, adjustments, closing, evidenceCount: revenue.invoices.length + revenue.paymentReceipts.length + revenue.receivables.length };
  }

  private buildPayableRollforward(revenue: RevenueOpsSnapshot): SubledgerRollforward {
    const additions = revenue.supplierInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const settlements = revenue.paymentProposals.filter(({ status }) => status === 'settled').reduce((sum, payment) => sum + payment.amount, 0);
    const closing = Math.max(0, additions - settlements);
    return { opening: 0, additions, settlements, adjustments: 0, closing, evidenceCount: revenue.supplierInvoices.length + revenue.paymentProposals.length };
  }

  private buildGstWorkpaper(revenue: RevenueOpsSnapshot): GstWorkpaper {
    const outward = revenue.invoices.filter(({ status }) => status !== 'draft' && status !== 'cancelled').reduce((sum, invoice) => ({ taxable: sum.taxable + invoice.taxPreview.taxableValue, cgst: sum.cgst + invoice.taxPreview.cgst, sgst: sum.sgst + invoice.taxPreview.sgst, igst: sum.igst + invoice.taxPreview.igst }), { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
    const inward = revenue.supplierInvoices.reduce((sum, invoice) => invoice.lines.reduce((lineSum, line) => { const tax = line.totalAmount - (line.totalAmount / (1 + line.gstRate / 100)); const half = tax / 2; return { taxable: lineSum.taxable + line.totalAmount - tax, cgst: lineSum.cgst + half, sgst: lineSum.sgst + half, igst: lineSum.igst }; }, sum), { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
    return { outwardTaxable: outward.taxable, outputCgst: outward.cgst, outputSgst: outward.sgst, outputIgst: outward.igst, inwardTaxable: inward.taxable, inputCgst: inward.cgst, inputSgst: inward.sgst, inputIgst: inward.igst, netPayable: outward.cgst + outward.sgst + outward.igst - inward.cgst - inward.sgst - inward.igst, invoiceEvidenceCount: revenue.invoices.length, supplierEvidenceCount: revenue.supplierInvoices.length };
  }

  private buildFinancialStatements(
    trialBalance: TrialBalanceRow[],
    journals: StoredLedgerJournal[],
  ): FinancialStatements {
    const round = (value: number) => Math.round(value * 100) / 100;
    const lines = (accountType: TrialBalanceRow['accountType'], direction: 'debit' | 'credit') =>
      trialBalance
        .filter((row) => row.accountType === accountType)
        .map((row) => ({
          accountId: row.accountId,
          accountCode: row.accountCode,
          accountName: row.accountName,
          amount: round(direction === 'debit' ? row.debit - row.credit : row.credit - row.debit),
        }))
        .filter(({ amount }) => amount !== 0);
    const income = lines('income', 'credit');
    const expenses = lines('expense', 'debit');
    const assets = lines('asset', 'debit');
    const liabilities = lines('liability', 'credit');
    const equity = lines('equity', 'credit');
    const totalIncome = round(income.reduce((sum, line) => sum + line.amount, 0));
    const totalExpenses = round(expenses.reduce((sum, line) => sum + line.amount, 0));
    const totalAssets = round(assets.reduce((sum, line) => sum + line.amount, 0));
    const totalLiabilities = round(liabilities.reduce((sum, line) => sum + line.amount, 0));
    const totalEquity = round(equity.reduce((sum, line) => sum + line.amount, 0) + totalIncome - totalExpenses);
    const cashAccountIds = new Set(trialBalance
      .filter((row) => row.accountCode.startsWith('1000') || /cash|bank/i.test(row.accountName))
      .map(({ accountId }) => accountId));
    let operating = 0;
    let investing = 0;
    let financing = 0;
    for (const journal of journals.filter(({ status }) => status === 'posted')) {
      const cashImpact = journal.lines
        .filter(({ accountId }) => cashAccountIds.has(accountId))
        .reduce((sum, line) => sum + fromMinor(line.debitMinor) - fromMinor(line.creditMinor), 0);
      if (cashImpact === 0) continue;
      const source = journal.sourceType.toLowerCase();
      if (/asset|capital|depreciation|disposal|manufacturing|inventory/.test(source)) investing += cashImpact;
      else if (/loan|treasury|payment|sweep|capital/.test(source)) financing += cashImpact;
      else operating += cashImpact;
    }
    operating = round(operating);
    investing = round(investing);
    financing = round(financing);
    return {
      asOfDate: journals.reduce((latest, journal) => journal.postingDate > latest ? journal.postingDate : latest, ''),
      profitAndLoss: { income, expenses, totalIncome, totalExpenses, netProfit: round(totalIncome - totalExpenses) },
      balanceSheet: {
        assets,
        liabilities,
        equity,
        totalAssets,
        totalLiabilities,
        totalEquity,
        balanceCheck: round(totalAssets - totalLiabilities - totalEquity),
      },
      cashFlow: {
        operating,
        investing,
        financing,
        netChange: round(operating + investing + financing),
        evidenceJournalCount: journals.filter(({ status }) => status === 'posted').length,
      },
    };
  }

  public bindCompany(
    input: BindLedgerCompanyInput,
    actorId: string,
  ): GeneralLedgerSnapshot {
    const kernel = this.kernelStore.getSnapshot();
    const profile = this.revenueOpsStore.getSnapshot().profile;
    const company = kernel.companies.find(({ id }) => id === input.companyId);
    const branch = kernel.branches.find(({ id }) => id === input.branchId);
    const actor = kernel.users.find(({ id, status }) => id === actorId && status === 'active');
    if (!company || company.status !== 'active') {
      throw new Error('Select an active legal entity for the India finance binding.');
    }
    if (!branch || branch.status !== 'active' || branch.companyId !== company.id) {
      throw new Error('Select an active branch that belongs to the selected legal entity.');
    }
    if (!actor || !actor.companyIds.includes(company.id) || !actor.branchIds.includes(branch.id)) {
      throw new Error('Your finance session is not scoped to the selected company and branch.');
    }
    if (company.countryCode !== 'IN' || company.baseCurrency !== profile.currency || company.fiscalYearStartMonth !== profile.fiscalYearStartMonth) {
      throw new Error('India books require an active India company with INR base currency and an April fiscal-year start.');
    }
    const now = new Date().toISOString();
    const binding: StoredLedgerBinding = {
      profileId: profile.id,
      companyId: company.id,
      branchId: branch.id,
      currencyCode: profile.currency,
      boundBy: actorId,
      boundAt: now,
    };
    this.database.upsertLedgerBinding(binding);
    this.ensureFoundation(company, binding, profile, actorId, now, true);
    return this.getSnapshot();
  }

  public createJournal(
    input: CreateLedgerJournalInput,
    actorId: string,
  ): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const postingDate = dateOnly(input.postingDate, 'Posting date');
    const memo = clean(input.memo, 'Journal memo', 4, 500);
    if (input.lines.length < 2 || input.lines.length > 50) {
      throw new Error('A manual journal requires 2-50 lines.');
    }
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the selected posting date.');
    const accounts = new Map(
      this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.id, account]),
    );
    const lines = input.lines.map((line) => {
      const account = accounts.get(line.accountId);
      if (!account || !account.active || !account.isPostable) {
        throw new Error('Choose an active postable account for every journal line.');
      }
      const debitMinor = toMinor(line.debit, 'Debit');
      const creditMinor = toMinor(line.credit, 'Credit');
      if ((debitMinor > 0 && creditMinor > 0) || (debitMinor === 0 && creditMinor === 0)) {
        throw new Error('Each journal line requires either a debit or a credit.');
      }
      return {
        id: randomUUID(),
        accountId: account.id,
        debitMinor,
        creditMinor,
        memo: clean(line.memo || memo, 'Line memo', 2, 280),
        costCenterId: line.costCenterId,
        profitCenterId: line.profitCenterId,
        departmentId: line.departmentId,
        projectId: line.projectId,
      };
    });
    const debit = lines.reduce((total, line) => total + line.debitMinor, 0);
    const credit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (debit !== credit || debit === 0) {
      throw new Error('Manual journal debits and credits must balance exactly.');
    }
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    const now = new Date().toISOString();
    this.database.createLedgerJournal({
      id: randomUUID(),
      companyId: bound.binding.companyId,
      branchId: bound.binding.branchId,
      fiscalLabel: fiscal.label,
      postingDate,
      periodId: period.id,
      sourceType: 'manual',
      kind: 'manual',
      currencyCode: bound.binding.currencyCode,
      memo,
      createdBy: actorId,
      createdAt: now,
      lines,
    });
    return this.getSnapshot();
  }

  /**
   * Project invoices clear the contract asset only after the separately
   * approved recognition entry is present in the immutable, posted GL chain.
   * That preserves the required sequence: recognition first, billing second.
   */
  private assertProjectInvoiceRecognitionPosted(
    invoice: TaxInvoice,
    revenue: RevenueOpsSnapshot,
    companyId: string,
    branchId: string,
    currencyCode: string,
  ): void {
    const claimIds = invoice.projectBillingClaimIds ?? [];
    if (!claimIds.length) return;
    if (new Set(claimIds).size !== claimIds.length) {
      throw new Error('Project-claim invoice evidence cannot contain duplicate billing claims.');
    }

    let recognizedMinor = 0;
    for (const claimId of claimIds) {
      const claim = revenue.projectBillingClaims.find(({ id }) => id === claimId);
      const plan = claim
        ? revenue.projectBillingPlans.find(({ id }) => id === claim.planId)
        : undefined;
      const event = claim?.recognitionEventId
        ? revenue.revenueRecognitionEvents.find(({ id }) => id === claim.recognitionEventId)
        : undefined;
      const project = claim
        ? revenue.deliveryProjects.find(({ id }) => id === claim.projectId)
        : undefined;
      const handoff = event
        ? revenue.journalDrafts.find(({ id }) => id === event.journalDraftId)
        : undefined;
      if (
        !claim ||
        !plan ||
        !event ||
        !project ||
        !handoff ||
        claim.status !== 'invoiced' ||
        claim.invoiceId !== invoice.id ||
        claim.salesOrderId !== invoice.salesOrderId ||
        claim.scope?.companyId !== companyId ||
        claim.scope?.branchId !== branchId ||
        plan.scope?.companyId !== companyId ||
        plan.scope?.branchId !== branchId ||
        event.scope?.companyId !== companyId ||
        event.scope?.branchId !== branchId ||
        project.scope?.companyId !== companyId ||
        project.scope?.branchId !== branchId
      ) {
        throw new Error('Project-claim invoice evidence is unavailable, unapproved, or outside the bound company and branch.');
      }

      validateProjectRevenueRecognitionHandoff(
        handoff,
        claim,
        event,
        plan,
        project,
        currencyCode,
      );
      const checksum = revenueHandoffChecksum(handoff);
      if (checksum !== handoff.checksum) {
        throw new Error('The linked project recognition handoff checksum is invalid.');
      }
      const canonical = this.database.getLedgerJournalBySource(
        companyId,
        'project-revenue-recognition',
        claim.id,
      );
      if (
        !canonical ||
        canonical.branchId !== branchId ||
        canonical.status !== 'posted' ||
        canonical.sourceNumber !== event.number ||
        canonical.sourceChecksum !== checksum
      ) {
        throw new Error('Project invoices cannot clear unbilled revenue until each linked recognition journal is canonically posted.');
      }
      recognizedMinor += toMinor(claim.recognizedAmount, 'Project billing claim amount');
    }

    if (recognizedMinor !== toMinor(invoice.taxPreview.taxableValue, 'Project invoice taxable value')) {
      throw new Error('Project-claim invoice taxable value must equal the linked recognized-claim total.');
    }
  }

  /**
   * First governed subledger bridge: a ready, issued Revenue Ledger invoice
   * becomes a canonical source draft. It is replay-safe by source identity and
   * checksum; an independent checker still posts the resulting GL journal.
   */
  public prepareRevenueInvoicePosting(
    input: PrepareRevenueInvoicePostingInput,
    actorId: string,
  ): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(
      ({ id }) => id === input.journalDraftId,
    );
    if (!source || source.version !== input.expectedVersion) {
      throw new Error('The Revenue Ledger handoff is stale or unavailable. Refresh and retry.');
    }
    if (source.sourceType !== 'invoice' || source.status !== 'ready') {
      throw new Error('Only a ready issued-invoice handoff can prepare a canonical revenue journal.');
    }
    const invoice = revenue.invoices.find(({ id }) => id === source.sourceId);
    if (!invoice || ['draft', 'cancelled'].includes(invoice.status)) {
      throw new Error('The source invoice is not issued and eligible for canonical posting.');
    }
    if (
      invoice.scope?.companyId !== bound.binding.companyId ||
      invoice.scope?.branchId !== bound.binding.branchId
    ) {
      throw new Error('Only an issued invoice from the bound company and branch can prepare a canonical revenue journal.');
    }
    this.assertProjectInvoiceRecognitionPosted(
      invoice,
      revenue,
      bound.binding.companyId,
      bound.binding.branchId,
      bound.binding.currencyCode,
    );
    if (input.expectedChecksum !== source.checksum) {
      throw new Error('The Revenue Ledger handoff changed before canonical preparation. Refresh and retry.');
    }
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) {
      throw new Error('The Revenue Ledger handoff checksum is invalid and cannot be posted.');
    }
    validateRevenueInvoiceHandoff(source, invoice, bound.binding.currencyCode);

    const existing = this.database.getLedgerJournalBySource(
      bound.binding.companyId,
      'revenue-invoice',
      source.sourceId,
    );
    if (existing) {
      if (
        existing.branchId !== bound.binding.branchId ||
        existing.sourceChecksum !== checksum ||
        existing.sourceNumber !== source.sourceNumber
      ) {
        throw new Error('The invoice source has changed after canonical journal preparation. Reverse through the governed ledger workflow before correcting it.');
      }
      return this.getSnapshot();
    }

    const postingDate = dateOnly(source.postingDate, 'Revenue invoice posting date');
    const period = this.database.getOpenLedgerPeriod(
      bound.binding.companyId,
      postingDate,
    );
    if (!period) {
      throw new Error('No open general-ledger period covers the revenue invoice date.');
    }
    const accounts = new Map(
      this.database
        .listLedgerAccounts(bound.binding.companyId)
        .map((account) => [account.code, account]),
    );
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account || !account.active || !account.isPostable) {
        throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      }
      return {
        id: randomUUID(),
        accountId: account.id,
        debitMinor: toMinor(line.debit, 'Revenue invoice debit'),
        creditMinor: toMinor(line.credit, 'Revenue invoice credit'),
        memo: clean(line.memo || source.sourceNumber, 'Revenue invoice line memo', 2, 280),
      };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0);
    const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) {
      throw new Error('The Revenue Ledger handoff is not an exactly balanced canonical posting.');
    }
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    const now = new Date().toISOString();
    this.database.createLedgerJournal({
      id: randomUUID(),
      companyId: bound.binding.companyId,
      branchId: bound.binding.branchId,
      fiscalLabel: fiscal.label,
      postingDate,
      periodId: period.id,
      sourceType: 'revenue-invoice',
      sourceId: source.sourceId,
      sourceNumber: source.sourceNumber,
      sourceChecksum: checksum,
      kind: 'source',
      currencyCode: bound.binding.currencyCode,
      memo: `Revenue invoice ${source.sourceNumber}`,
      createdBy: actorId,
      createdAt: now,
      lines,
    });
    return this.getSnapshot();
  }

  /** Reconciled customer cash reaches the canonical book only once, by receipt identity. */
  public prepareCashReceiptPosting(input: PrepareCashReceiptPostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const receipt = source ? revenue.paymentReceipts.find(({ id }) => id === source.sourceId) : undefined;
    if (!source || !receipt || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum) throw new Error('The cash-receipt handoff is stale or unavailable. Refresh and retry.');
    if (source.sourceType !== 'payment' || source.status !== 'ready' || receipt.scope?.companyId !== bound.binding.companyId || receipt.scope?.branchId !== bound.binding.branchId) throw new Error('Only a ready reconciled receipt from the bound company and branch can prepare a canonical cash journal.');
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) throw new Error('The cash-receipt handoff checksum is invalid and cannot be posted.');
    validateCashReceiptHandoff(source, receipt, bound.binding.currencyCode);
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, 'revenue-cash-receipt', receipt.id);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum) throw new Error('The cash-receipt source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      return this.getSnapshot();
    }
    const postingDate = dateOnly(source.postingDate, 'Cash receipt posting date');
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the cash receipt date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Cash receipt debit'), creditMinor: toMinor(line.credit, 'Cash receipt credit'), memo: clean(line.memo || source.sourceNumber, 'Cash receipt line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0); const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The cash-receipt handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth); const now = new Date().toISOString();
    this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: 'revenue-cash-receipt', sourceId: receipt.id, sourceNumber: source.sourceNumber, sourceChecksum: checksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `Cash receipt ${source.sourceNumber}`, createdBy: actorId, createdAt: now, lines });
    return this.getSnapshot();
  }

  /**
   * Promotes an approved receivable write-off into one canonical bad-debt
   * journal. The receivable balance was already reduced by the governed
   * approval; this adapter only books the immutable expense/control transfer.
   */
  public prepareWriteOffPosting(input: PrepareWriteOffPostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const request = source
      ? revenue.writeOffRequests.find(({ id }) => id === source.sourceId)
      : undefined;
    const receivable = request
      ? revenue.receivables.find(({ id }) => id === request.receivableId)
      : undefined;
    if (
      !source ||
      !request ||
      !receivable ||
      source.version !== input.expectedVersion ||
      input.expectedChecksum !== source.checksum
    ) {
      throw new Error('The write-off handoff is stale or unavailable. Refresh and retry.');
    }
    if (
      source.status !== 'ready' ||
      !request.scope ||
      !receivable.scope ||
      request.scope.companyId !== bound.binding.companyId ||
      request.scope.branchId !== bound.binding.branchId ||
      receivable.scope.companyId !== bound.binding.companyId ||
      receivable.scope.branchId !== bound.binding.branchId
    ) {
      throw new Error('Only an approved write-off from the bound company and branch can prepare a canonical journal.');
    }
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) throw new Error('The write-off handoff checksum is invalid and cannot be posted.');
    validateWriteOffHandoff(source, request, receivable, bound.binding.currencyCode);
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, 'collections-write-off', request.id);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum || existing.sourceNumber !== source.sourceNumber) {
        throw new Error('The write-off source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      }
      return this.getSnapshot();
    }
    const postingDate = dateOnly(source.postingDate, 'Write-off posting date');
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the write-off date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Write-off debit'), creditMinor: toMinor(line.credit, 'Write-off credit'), memo: clean(line.memo || source.sourceNumber, 'Write-off line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0);
    const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The write-off handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: 'collections-write-off', sourceId: request.id, sourceNumber: source.sourceNumber, sourceChecksum: checksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `Write-off ${request.number}`, createdBy: actorId, createdAt: new Date().toISOString(), lines });
    return this.getSnapshot();
  }

  /** Promotes a recognized TDS/TCS entry into one canonical statutory journal. */
  public prepareWithholdingPosting(input: PrepareWithholdingPostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const entry = source
      ? revenue.withholdingEntries.find(({ id }) => id === source.sourceId)
      : undefined;
    const policy = entry
      ? revenue.withholdingPolicies.find(({ id }) => id === entry.policyId)
      : undefined;
    const receivable = entry?.receivableId
      ? revenue.receivables.find(({ id }) => id === entry.receivableId)
      : undefined;
    if (
      !source ||
      !entry ||
      !policy ||
      source.version !== input.expectedVersion ||
      input.expectedChecksum !== source.checksum
    ) {
      throw new Error('The withholding handoff is stale or unavailable. Refresh and retry.');
    }
    if (
      source.status !== 'ready' ||
      !entry.scope ||
      !policy.scope ||
      entry.scope.companyId !== bound.binding.companyId ||
      entry.scope.branchId !== bound.binding.branchId ||
      policy.scope.companyId !== bound.binding.companyId ||
      policy.scope.branchId !== bound.binding.branchId ||
      (receivable && (!receivable.scope || receivable.scope.companyId !== bound.binding.companyId || receivable.scope.branchId !== bound.binding.branchId))
    ) {
      throw new Error('Only recognized withholding evidence from the bound company and branch can prepare a canonical journal.');
    }
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) throw new Error('The withholding handoff checksum is invalid and cannot be posted.');
    validateWithholdingHandoff(source, entry, policy, receivable, bound.binding.currencyCode);
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, 'finance-withholding', entry.id);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum || existing.sourceNumber !== source.sourceNumber) {
        throw new Error('The withholding source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      }
      return this.getSnapshot();
    }
    const postingDate = dateOnly(source.postingDate, 'Withholding posting date');
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the withholding event date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Withholding debit'), creditMinor: toMinor(line.credit, 'Withholding credit'), memo: clean(line.memo || source.sourceNumber, 'Withholding line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0);
    const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The withholding handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: 'finance-withholding', sourceId: entry.id, sourceNumber: source.sourceNumber, sourceChecksum: checksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `${policy.kind} ${entry.number}`, createdBy: actorId, createdAt: new Date().toISOString(), lines });
    return this.getSnapshot();
  }

  /** Promotes released treasury evidence into one canonical bank/control journal. */
  public prepareTreasuryPosting(input: PrepareTreasuryPostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const proposal = source?.sourceType === 'treasury-payment' ? revenue.paymentProposals.find(({ id }) => id === source.sourceId) : undefined;
    const supplierInvoice = proposal ? revenue.supplierInvoices.find(({ id }) => id === proposal.supplierInvoiceId) : undefined;
    const supplier = supplierInvoice ? revenue.suppliers.find(({ id }) => id === supplierInvoice.supplierId) : undefined;
    const charge = source?.sourceType === 'bank-charge' ? revenue.bankCharges.find(({ id }) => id === source.sourceId) : undefined;
    const sweep = source && ['liquidity-sweep-release', 'liquidity-sweep-settlement'].includes(source.sourceType)
      ? revenue.liquiditySweeps.find(({ id }) => id === source.sourceId)
      : undefined;
    const bankAccountId = proposal?.bankAccountId ?? charge?.bankAccountId ?? (source?.sourceType === 'liquidity-sweep-release' || source?.sourceType === 'liquidity-sweep-settlement' ? sweep?.fromBankAccountId : undefined);
    const bank = bankAccountId ? revenue.bankAccounts.find(({ id }) => id === bankAccountId) : undefined;
    const destinationBank = sweep ? revenue.bankAccounts.find(({ id }) => id === sweep.toBankAccountId) : undefined;
    const recordScope = proposal?.scope ?? charge?.scope ?? sweep?.scope;
    if (!source || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum) throw new Error('The treasury handoff is stale or unavailable. Refresh and retry.');
    if (source.status !== 'ready' || !recordScope || recordScope.companyId !== bound.binding.companyId || recordScope.branchId !== bound.binding.branchId || (proposal && (!supplierInvoice || !supplier || supplierInvoice.supplierId !== proposal.supplierId || !supplierInvoice.scope || supplierInvoice.scope.companyId !== bound.binding.companyId || supplierInvoice.scope.branchId !== bound.binding.branchId || !supplier.scope || supplier.scope.companyId !== bound.binding.companyId || supplier.scope.branchId !== bound.binding.branchId)) || !bank || !bank.active || bank.currency !== 'INR' || bank.scope?.companyId !== bound.binding.companyId || bank.scope?.branchId !== bound.binding.branchId || (sweep && (!destinationBank || !destinationBank.active || destinationBank.currency !== 'INR' || destinationBank.scope?.companyId !== bound.binding.companyId || destinationBank.scope?.branchId !== bound.binding.branchId))) throw new Error('Only ready treasury evidence from the bound company, branch, and active INR bank account can prepare a canonical journal.');
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) throw new Error('The treasury handoff checksum is invalid and cannot be posted.');
    validateTreasuryHandoff(source, proposal, charge, sweep, bound.binding.currencyCode);
    const canonicalSourceType = source.sourceType === 'bank-charge'
      ? 'treasury-bank-charge'
      : source.sourceType === 'liquidity-sweep-release'
        ? 'treasury-sweep-release'
        : source.sourceType === 'liquidity-sweep-settlement'
          ? 'treasury-sweep-settlement'
          : 'treasury-payment';
    const sourceId = source.sourceId;
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, canonicalSourceType, sourceId);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum || existing.sourceNumber !== source.sourceNumber) throw new Error('The treasury source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      return this.getSnapshot();
    }
    const postingDate = dateOnly(source.postingDate, 'Treasury posting date');
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the treasury evidence date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Treasury debit'), creditMinor: toMinor(line.credit, 'Treasury credit'), memo: clean(line.memo || source.sourceNumber, 'Treasury line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0); const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The treasury handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: canonicalSourceType, sourceId, sourceNumber: source.sourceNumber, sourceChecksum: checksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `Treasury ${source.sourceNumber}`, createdBy: actorId, createdAt: new Date().toISOString(), lines });
    return this.getSnapshot();
  }

  /** Promotes production material consumption/output into canonical inventory/WIP GL. */
  public prepareManufacturingPosting(input: PrepareManufacturingPostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const issue = source?.sourceType === 'production-issue' ? revenue.productionMaterialIssues.find(({ id }) => id === source.sourceId) : undefined;
    const output = source?.sourceType === 'production-output' ? revenue.productionOutputs.find(({ id }) => id === source.sourceId) : undefined;
    const workOrderId = issue?.workOrderId ?? output?.workOrderId;
    const order = workOrderId ? revenue.workOrders.find(({ id }) => id === workOrderId) : undefined;
    const recordScope = issue?.scope ?? output?.scope;
    if (!source || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum) throw new Error('The manufacturing handoff is stale or unavailable. Refresh and retry.');
    if (!['production-issue', 'production-output'].includes(source.sourceType) || source.status !== 'ready' || !recordScope || recordScope.companyId !== bound.binding.companyId || recordScope.branchId !== bound.binding.branchId || !order || !order.scope || order.scope.companyId !== bound.binding.companyId || order.scope.branchId !== bound.binding.branchId) throw new Error('Only ready production evidence from the bound company and branch can prepare a canonical inventory/WIP journal.');
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) throw new Error('The manufacturing handoff checksum is invalid and cannot be posted.');
    validateManufacturingHandoff(source, issue, output, order, bound.binding.currencyCode);
    const canonicalSourceType = source.sourceType === 'production-issue' ? 'manufacturing-production-issue' : 'manufacturing-production-output';
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, canonicalSourceType, source.sourceId);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum || existing.sourceNumber !== source.sourceNumber) throw new Error('The manufacturing source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      return this.getSnapshot();
    }
    const postingDate = dateOnly(source.postingDate, 'Manufacturing posting date');
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the manufacturing evidence date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Manufacturing debit'), creditMinor: toMinor(line.credit, 'Manufacturing credit'), memo: clean(line.memo || source.sourceNumber, 'Manufacturing line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0); const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The manufacturing handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: canonicalSourceType, sourceId: source.sourceId, sourceNumber: source.sourceNumber, sourceChecksum: checksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `Manufacturing ${source.sourceNumber}`, createdBy: actorId, createdAt: new Date().toISOString(), lines });
    return this.getSnapshot();
  }

  /** Promotes approved landed-cost evidence into canonical inventory valuation GL. */
  public prepareLandedCostPosting(input: PrepareLandedCostPostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const allocation = source?.sourceType === 'landed-cost' ? revenue.landedCostAllocations.find(({ id }) => id === source.sourceId) : undefined;
    const receipt = allocation ? revenue.goodsReceipts.find(({ id }) => id === allocation.goodsReceiptId) : undefined;
    const scope = allocation?.scope ?? receipt?.scope;
    if (!source || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum) throw new Error('The landed-cost handoff is stale or unavailable. Refresh and retry.');
    if (source.status !== 'ready' || !scope || scope.companyId !== bound.binding.companyId || scope.branchId !== bound.binding.branchId || !allocation || !receipt || !receipt.scope || receipt.scope.companyId !== bound.binding.companyId || receipt.scope.branchId !== bound.binding.branchId) throw new Error('Only ready landed-cost evidence from the bound company and branch can prepare a canonical journal.');
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) throw new Error('The landed-cost handoff checksum is invalid and cannot be posted.');
    validateLandedCostHandoff(source, allocation, receipt, bound.binding.currencyCode);
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, 'procurement-landed-cost', allocation.id);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum || existing.sourceNumber !== source.sourceNumber) throw new Error('The landed-cost source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      return this.getSnapshot();
    }
    const postingDate = dateOnly(source.postingDate, 'Landed-cost posting date');
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the landed-cost evidence date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Landed-cost debit'), creditMinor: toMinor(line.credit, 'Landed-cost credit'), memo: clean(line.memo || source.sourceNumber, 'Landed-cost line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0); const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The landed-cost handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: 'procurement-landed-cost', sourceId: allocation.id, sourceNumber: source.sourceNumber, sourceChecksum: checksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `Landed cost ${allocation.number}`, createdBy: actorId, createdAt: new Date().toISOString(), lines });
    return this.getSnapshot();
  }

  /** Promotes one completed retail sale's immutable COGS / inventory handoff. */
  public prepareRetailSaleCostPosting(input: PrepareRetailSaleCostPostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const sale = source?.sourceType === 'retail-sale-cost'
      ? revenue.retailSales.find(({ id }) => id === source.sourceId)
      : undefined;
    if (!source || !sale || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum) {
      throw new Error('The retail cost handoff is stale or unavailable. Refresh and retry.');
    }
    if (source.status !== 'ready' || sale.scope?.companyId !== bound.binding.companyId || sale.scope?.branchId !== bound.binding.branchId) {
      throw new Error('Only ready retail cost evidence from the bound company and branch can prepare a canonical journal.');
    }
    const sourceChecksum = revenueHandoffChecksum(source);
    if (sourceChecksum !== source.checksum) throw new Error('The retail cost handoff checksum is invalid and cannot be posted.');
    validateRetailSaleCostHandoff(source, sale, revenue, bound.binding.currencyCode);
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, 'retail-sale-cost', sale.id);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== sourceChecksum || existing.sourceNumber !== source.sourceNumber) {
        throw new Error('The retail cost source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      }
      return this.getSnapshot();
    }
    const postingDate = dateOnly(source.postingDate, 'Retail cost posting date');
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the retail cost evidence date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Retail cost debit'), creditMinor: toMinor(line.credit, 'Retail cost credit'), memo: clean(line.memo || source.sourceNumber, 'Retail cost line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0);
    const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The retail cost handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: 'retail-sale-cost', sourceId: sale.id, sourceNumber: source.sourceNumber, sourceChecksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `Retail cost ${source.sourceNumber}`, createdBy: actorId, createdAt: new Date().toISOString(), lines });
    return this.getSnapshot();
  }

  /** Promotes one approved counter-return's immutable inventory / COGS reversal. */
  public prepareRetailReturnCostPosting(input: PrepareRetailReturnCostPostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const returnCase = source?.sourceType === 'retail-return-cost'
      ? revenue.retailReturns.find(({ id }) => id === source.sourceId)
      : undefined;
    if (!source || !returnCase || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum) {
      throw new Error('The retail return cost handoff is stale or unavailable. Refresh and retry.');
    }
    if (source.status !== 'ready' || returnCase.scope?.companyId !== bound.binding.companyId || returnCase.scope?.branchId !== bound.binding.branchId) {
      throw new Error('Only ready retail-return cost evidence from the bound company and branch can prepare a canonical journal.');
    }
    const sourceChecksum = revenueHandoffChecksum(source);
    if (sourceChecksum !== source.checksum) throw new Error('The retail return cost handoff checksum is invalid and cannot be posted.');
    validateRetailReturnCostHandoff(source, returnCase, revenue, bound.binding.currencyCode);
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, 'retail-return-cost', returnCase.id);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== sourceChecksum || existing.sourceNumber !== source.sourceNumber) {
        throw new Error('The retail return cost source changed after canonical journal preparation. Reverse through the governed ledger workflow before correcting it.');
      }
      return this.getSnapshot();
    }
    const postingDate = dateOnly(source.postingDate, 'Retail return cost posting date');
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the retail return cost evidence date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Retail return cost debit'), creditMinor: toMinor(line.credit, 'Retail return cost credit'), memo: clean(line.memo || source.sourceNumber, 'Retail return cost line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0);
    const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The retail return cost handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: 'retail-return-cost', sourceId: returnCase.id, sourceNumber: source.sourceNumber, sourceChecksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `Retail return cost ${source.sourceNumber}`, createdBy: actorId, createdAt: new Date().toISOString(), lines });
    return this.getSnapshot();
  }

  /** Promotes a matched marketplace settlement into a replay-safe canonical GL journal. */
  public prepareRetailCommerceSettlementPosting(input: PrepareRetailCommerceSettlementPostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const settlement = source?.sourceType === 'retail-commerce-settlement'
      ? revenue.retailSettlementReconciliations.find(({ id }) => id === source.sourceId)
      : undefined;
    if (!source || !settlement || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum) {
      throw new Error('The marketplace settlement handoff is stale or unavailable. Refresh and retry.');
    }
    if (source.status !== 'ready' || settlement.journalDraftId !== source.id || !['matched', 'resolved'].includes(settlement.status)
      || settlement.scope?.companyId !== bound.binding.companyId || settlement.scope?.branchId !== bound.binding.branchId) {
      throw new Error('Only ready marketplace settlement evidence from the bound company and branch can prepare a canonical journal.');
    }
    const sourceChecksum = revenueHandoffChecksum(source);
    if (sourceChecksum !== source.checksum) throw new Error('The marketplace settlement handoff checksum is invalid and cannot be posted.');
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, 'retail-commerce-settlement', settlement.id);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== sourceChecksum || existing.sourceNumber !== source.sourceNumber) {
        throw new Error('The marketplace settlement source changed after canonical journal preparation. Reverse through the governed ledger workflow before correcting it.');
      }
      return this.getSnapshot();
    }
    const postingDate = dateOnly(source.postingDate, 'Marketplace settlement posting date');
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the marketplace settlement evidence date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Marketplace settlement debit'), creditMinor: toMinor(line.credit, 'Marketplace settlement credit'), memo: clean(line.memo || source.sourceNumber, 'Marketplace settlement line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0);
    const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The marketplace settlement handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: 'retail-commerce-settlement', sourceId: settlement.id, sourceNumber: source.sourceNumber, sourceChecksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `Marketplace settlement ${settlement.settlementReference}`, createdBy: actorId, createdAt: new Date().toISOString(), lines });
    return this.getSnapshot();
  }

  /** Promotes one released retail commission payout into canonical expense/bank GL. */
  public prepareRetailCommissionPayoutPosting(input: PrepareRetailCommissionPayoutPostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const batch = source?.sourceType === 'retail-commission-payout'
      ? revenue.retailCommissionPayoutBatches.find(({ id }) => id === source.sourceId)
      : undefined;
    if (!source || !batch || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum) {
      throw new Error('The retail commission payout handoff is stale or unavailable. Refresh and retry.');
    }
    const scope = batch.scope;
    if (source.status !== 'ready' || !scope || scope.companyId !== bound.binding.companyId || scope.branchId !== bound.binding.branchId) {
      throw new Error('Only a ready released payout from the bound company and branch can prepare a canonical journal.');
    }
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) throw new Error('The retail commission payout checksum is invalid and cannot be posted.');
    validateRetailCommissionPayoutHandoff(source, batch, revenue, bound.binding.currencyCode);
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, 'retail-commission-payout', batch.id);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum || existing.sourceNumber !== source.sourceNumber) {
        throw new Error('The retail commission payout source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      }
      return this.getSnapshot();
    }
    const postingDate = dateOnly(source.postingDate, 'Retail commission payout posting date');
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the retail commission payout date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Commission payout debit'), creditMinor: toMinor(line.credit, 'Commission payout credit'), memo: clean(line.memo || source.sourceNumber, 'Commission payout line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0);
    const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The retail commission payout handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: 'retail-commission-payout', sourceId: batch.id, sourceNumber: source.sourceNumber, sourceChecksum: checksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `Retail commission payout ${batch.number}`, createdBy: actorId, createdAt: new Date().toISOString(), lines });
    return this.getSnapshot();
  }

  /** Promotes finalized payroll or reimbursed expense evidence into canonical GL. */
  public preparePeoplePosting(input: PreparePeoplePostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const run = source?.sourceType === 'payroll-finalization' ? revenue.payrollRuns.find(({ id }) => id === source.sourceId) : undefined;
    const expense = source?.sourceType === 'expense-reimbursement' ? revenue.expenseClaims.find(({ id }) => id === source.sourceId) : undefined;
    const scope = run?.scope ?? expense?.scope;
    if (!source || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum) throw new Error('The payroll/expense handoff is stale or unavailable. Refresh and retry.');
    if (!['payroll-finalization', 'expense-reimbursement'].includes(source.sourceType) || source.status !== 'ready' || !scope || scope.companyId !== bound.binding.companyId || scope.branchId !== bound.binding.branchId) throw new Error('Only ready payroll or expense evidence from the bound company and branch can prepare a canonical journal.');
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) throw new Error('The payroll/expense handoff checksum is invalid and cannot be posted.');
    validatePeopleHandoff(source, run as PayrollRun | undefined, expense, bound.binding.currencyCode);
    const canonicalSourceType = source.sourceType === 'payroll-finalization' ? 'people-payroll-finalization' : 'people-expense-reimbursement';
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, canonicalSourceType, source.sourceId);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum || existing.sourceNumber !== source.sourceNumber) throw new Error('The payroll/expense source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      return this.getSnapshot();
    }
    const postingDate = dateOnly(source.postingDate, 'Payroll/expense posting date');
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the payroll/expense evidence date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Payroll/expense debit'), creditMinor: toMinor(line.credit, 'Payroll/expense credit'), memo: clean(line.memo || source.sourceNumber, 'Payroll/expense line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0); const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The payroll/expense handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: canonicalSourceType, sourceId: source.sourceId, sourceNumber: source.sourceNumber, sourceChecksum: checksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `People ${source.sourceNumber}`, createdBy: actorId, createdAt: new Date().toISOString(), lines });
    return this.getSnapshot();
  }

  public prepareCommercialAdjustmentPosting(input: PrepareCommercialAdjustmentPostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId); const revenue = this.revenueOpsStore.getSnapshot(); const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId); const note = source ? revenue.creditDebitNotes.find(({ id }) => id === source.sourceId) : undefined;
    if (!source || !note || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum) throw new Error('The commercial adjustment handoff is stale or unavailable. Refresh and retry.');
    if (source.status !== 'ready' || note.scope?.companyId !== bound.binding.companyId || note.scope?.branchId !== bound.binding.branchId) throw new Error('Only a ready commercial adjustment from the bound company and branch can prepare a canonical journal.');
    const checksum = revenueHandoffChecksum(source); if (checksum !== source.checksum) throw new Error('The commercial adjustment checksum is invalid and cannot be posted.'); validateCommercialAdjustmentHandoff(source, note, bound.binding.currencyCode);
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, 'revenue-commercial-adjustment', note.id); if (existing) { if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum) throw new Error('The commercial adjustment changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.'); return this.getSnapshot(); }
    const postingDate = dateOnly(source.postingDate, 'Commercial adjustment posting date'); const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate); if (!period) throw new Error('No open general-ledger period covers the commercial adjustment date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account])); const lines = source.lines.map((line) => { const account = accounts.get(line.accountCode); if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`); return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Commercial adjustment debit'), creditMinor: toMinor(line.credit, 'Commercial adjustment credit'), memo: clean(line.memo || source.sourceNumber, 'Commercial adjustment line memo', 2, 280) }; });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0); const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0); if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The commercial adjustment handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth); const now = new Date().toISOString(); this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: 'revenue-commercial-adjustment', sourceId: note.id, sourceNumber: source.sourceNumber, sourceChecksum: checksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `${note.type === 'credit' ? 'Credit' : 'Debit'} note ${source.sourceNumber}`, createdBy: actorId, createdAt: now, lines }); return this.getSnapshot();
  }

  /**
   * A supplier invoice is uniquely claimed by its business identity, while its
   * originating three-way match remains embedded in the checksum-protected
   * handoff. A second user must still post the resulting source draft.
   */
  public prepareSupplierInvoicePosting(
    input: PrepareSupplierInvoicePostingInput,
    actorId: string,
  ): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const match = source
      ? revenue.threeWayMatches.find(({ id }) => id === source.sourceId)
      : undefined;
    const invoice = match
      ? revenue.supplierInvoices.find(({ id }) => id === match.supplierInvoiceId)
      : undefined;
    const supplier = invoice
      ? revenue.suppliers.find(({ id }) => id === invoice.supplierId)
      : undefined;
    const purchaseOrder = invoice
      ? revenue.purchaseOrders.find(({ id }) => id === invoice.purchaseOrderId)
      : undefined;
    const receipt = invoice
      ? revenue.goodsReceipts.find(({ id }) => id === invoice.goodsReceiptId)
      : undefined;
    if (
      !source ||
      !match ||
      !invoice ||
      !supplier ||
      !purchaseOrder ||
      !receipt ||
      source.version !== input.expectedVersion ||
      input.expectedChecksum !== source.checksum
    ) {
      throw new Error('The supplier-invoice handoff is stale or unavailable. Refresh and retry.');
    }
    if (
      source.status !== 'ready' ||
      invoice.scope?.companyId !== bound.binding.companyId ||
      invoice.scope?.branchId !== bound.binding.branchId ||
      match.scope?.companyId !== bound.binding.companyId ||
      match.scope?.branchId !== bound.binding.branchId ||
      supplier.scope?.companyId !== bound.binding.companyId ||
      supplier.scope?.branchId !== bound.binding.branchId ||
      purchaseOrder.scope?.companyId !== bound.binding.companyId ||
      purchaseOrder.scope?.branchId !== bound.binding.branchId ||
      receipt.scope?.companyId !== bound.binding.companyId ||
      receipt.scope?.branchId !== bound.binding.branchId
    ) {
      throw new Error('Only a ready matched supplier invoice from the bound company and branch can prepare a canonical payable journal.');
    }
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) {
      throw new Error('The supplier-invoice handoff checksum is invalid and cannot be posted.');
    }
    validateSupplierInvoiceHandoff(
      source,
      invoice,
      match,
      supplier,
      purchaseOrder,
      receipt,
      revenue.profile,
      bound.binding.currencyCode,
    );

    const existing = this.database.getLedgerJournalBySource(
      bound.binding.companyId,
      'procurement-supplier-invoice',
      invoice.id,
    );
    if (existing) {
      if (
        existing.branchId !== bound.binding.branchId ||
        existing.sourceChecksum !== checksum ||
        existing.sourceNumber !== source.sourceNumber
      ) {
        throw new Error('The supplier-invoice source changed after canonical journal preparation. Reverse through the governed ledger workflow before correcting it.');
      }
      return this.getSnapshot();
    }

    const postingDate = dateOnly(source.postingDate, 'Supplier invoice posting date');
    const period = this.database.getOpenLedgerPeriod(
      bound.binding.companyId,
      postingDate,
    );
    if (!period) {
      throw new Error('No open general-ledger period covers the supplier invoice date.');
    }
    const accounts = new Map(
      this.database
        .listLedgerAccounts(bound.binding.companyId)
        .map((account) => [account.code, account]),
    );
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account || !account.active || !account.isPostable) {
        throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      }
      return {
        id: randomUUID(),
        accountId: account.id,
        debitMinor: toMinor(line.debit, 'Supplier invoice debit'),
        creditMinor: toMinor(line.credit, 'Supplier invoice credit'),
        memo: clean(line.memo || source.sourceNumber, 'Supplier invoice line memo', 2, 280),
      };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0);
    const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) {
      throw new Error('The supplier-invoice handoff is not an exactly balanced canonical posting.');
    }
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    const now = new Date().toISOString();
    this.database.createLedgerJournal({
      id: randomUUID(),
      companyId: bound.binding.companyId,
      branchId: bound.binding.branchId,
      fiscalLabel: fiscal.label,
      postingDate,
      periodId: period.id,
      sourceType: 'procurement-supplier-invoice',
      sourceId: invoice.id,
      sourceNumber: source.sourceNumber,
      sourceChecksum: checksum,
      kind: 'source',
      currencyCode: bound.binding.currencyCode,
      memo: `Supplier invoice ${source.sourceNumber} / ${invoice.supplierInvoiceNumber}`,
      createdBy: actorId,
      createdAt: now,
      lines,
    });
    return this.getSnapshot();
  }

  /**
   * Moves only the recoverable-GST-free cost of an independently approved,
   * already-posted supplier invoice from inventory into the fixed-assets cost
   * account. The operational asset register is evidence only; this method is
   * the sole P2C.2 accounting boundary.
   */
  public prepareAssetCapitalizationPosting(
    input: PrepareAssetCapitalizationPostingInput,
    actorId: string,
  ): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const capitalization: AssetCapitalization | undefined = source
      ? revenue.assetCapitalizations.find(({ id }) => id === source.sourceId)
      : undefined;
    const asset = capitalization
      ? revenue.managedAssets.find(({ id }) => id === capitalization.assetId)
      : undefined;
    const invoice = capitalization
      ? revenue.supplierInvoices.find(({ id }) => id === capitalization.supplierInvoiceId)
      : undefined;
    const match = capitalization
      ? revenue.threeWayMatches.find(({ id }) => id === capitalization.threeWayMatchId)
      : undefined;
    const purchaseOrder = capitalization
      ? revenue.purchaseOrders.find(({ id }) => id === capitalization.purchaseOrderId)
      : undefined;
    const receipt = capitalization
      ? revenue.goodsReceipts.find(({ id }) => id === capitalization.goodsReceiptId)
      : undefined;
    if (
      !source || !capitalization || !asset || !invoice || !match || !purchaseOrder || !receipt ||
      source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum
    ) {
      throw new Error('The asset-capitalisation handoff is stale or unavailable. Refresh and retry.');
    }
    const inBoundScope = (record: { scope?: { companyId: string; branchId: string } }) =>
      record.scope?.companyId === bound.binding.companyId && record.scope?.branchId === bound.binding.branchId;
    if (
      source.sourceType !== 'asset-capitalization' || source.status !== 'ready' ||
      capitalization.status !== 'approved' || capitalization.journalDraftId !== source.id ||
      !capitalization.decidedBy || !capitalization.decidedAt || capitalization.decidedBy === capitalization.requestedBy ||
      asset.status !== 'in-service' ||
      match.supplierInvoiceId !== invoice.id || match.purchaseOrderId !== purchaseOrder.id ||
      match.goodsReceiptId !== receipt.id || invoice.purchaseOrderId !== purchaseOrder.id ||
      invoice.goodsReceiptId !== receipt.id || receipt.purchaseOrderId !== purchaseOrder.id ||
      !['matched', 'approved'].includes(match.status) ||
      ![capitalization, asset, invoice, match, purchaseOrder, receipt].every(inBoundScope)
    ) {
      throw new Error('Only independently approved asset capitalisation evidence from the bound company and branch can prepare a canonical fixed-asset journal.');
    }
    if (source.sourceId !== capitalization.id || source.sourceNumber !== capitalization.number || source.postingDate !== capitalization.capitalizationDate) {
      throw new Error('The asset-capitalisation source identity no longer matches its approved evidence.');
    }
    const taxableInvoiceAmount = money(invoice.lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0));
    const allocatedAmount = money(revenue.assetCapitalizations
      .filter((item) => item.supplierInvoiceId === invoice.id && item.status !== 'rejected' && inBoundScope(item))
      .reduce((total, item) => total + item.taxableAmount, 0));
    if (
      capitalization.taxableAmount <= 0 || allocatedAmount > taxableInvoiceAmount ||
      source.lines.length !== 2 ||
      source.lines.some((line) => !['fixed-assets', 'inventory-asset'].includes(line.accountCode)) ||
      source.lines.filter((line) => line.accountCode === 'fixed-assets').length !== 1 ||
      source.lines.filter((line) => line.accountCode === 'inventory-asset').length !== 1
    ) {
      throw new Error('The asset-capitalisation source amount or account mapping is invalid.');
    }
    const fixedAssetLine = source.lines.find((line) => line.accountCode === 'fixed-assets')!;
    const inventoryLine = source.lines.find((line) => line.accountCode === 'inventory-asset')!;
    if (
      fixedAssetLine.debit !== capitalization.taxableAmount || fixedAssetLine.credit !== 0 ||
      inventoryLine.debit !== 0 || inventoryLine.credit !== capitalization.taxableAmount ||
      source.totalDebit !== capitalization.taxableAmount || source.totalCredit !== capitalization.taxableAmount
    ) {
      throw new Error('The asset-capitalisation journal must debit fixed assets and credit inventory for the approved taxable amount.');
    }
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) {
      throw new Error('The asset-capitalisation handoff checksum is invalid and cannot be posted.');
    }
    const payableJournal = this.database.getLedgerJournalBySource(
      bound.binding.companyId,
      'procurement-supplier-invoice',
      invoice.id,
    );
    if (!payableJournal || payableJournal.branchId !== bound.binding.branchId || payableJournal.status !== 'posted') {
      throw new Error('Asset capitalisation requires the linked supplier invoice to be canonically posted first.');
    }
    const existing = this.database.getLedgerJournalBySource(
      bound.binding.companyId,
      'asset-capitalization',
      capitalization.id,
    );
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum || existing.sourceNumber !== source.sourceNumber) {
        throw new Error('The asset-capitalisation source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      }
      return this.getSnapshot();
    }
    const postingDate = dateOnly(source.postingDate, 'Asset capitalisation posting date');
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the asset capitalisation date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account || !account.active || !account.isPostable) {
        throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      }
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Asset capitalisation debit'), creditMinor: toMinor(line.credit, 'Asset capitalisation credit'), memo: clean(line.memo || source.sourceNumber, 'Asset capitalisation line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0);
    const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (totalDebit !== totalCredit || totalDebit === 0) throw new Error('The asset-capitalisation handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({
      id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId,
      fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: 'asset-capitalization',
      sourceId: capitalization.id, sourceNumber: source.sourceNumber, sourceChecksum: checksum,
      kind: 'source', currencyCode: bound.binding.currencyCode,
      memo: `Asset capitalisation ${source.sourceNumber} / ${asset.assetTag}`,
      createdBy: actorId, createdAt: new Date().toISOString(), lines,
    });
    return this.getSnapshot();
  }

  /**
   * Promotes an independently approved, full-month straight-line
   * depreciation proposal only after rechecking every component against the
   * posted fixed-asset source chain. The schedule remains a subledger record;
   * this is the sole canonical accounting boundary for its expense entry.
   */
  public prepareAssetDepreciationPosting(
    input: PrepareAssetDepreciationPostingInput,
    actorId: string,
  ): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const run: AssetDepreciationRun | undefined = source
      ? revenue.assetDepreciationRuns.find(({ id }) => id === source.sourceId)
      : undefined;
    if (!source || !run || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum) {
      throw new Error('The asset-depreciation handoff is stale or unavailable. Refresh and retry.');
    }
    const inBoundScope = (record: { scope?: { companyId: string; branchId: string } }) =>
      record.scope?.companyId === bound.binding.companyId && record.scope?.branchId === bound.binding.branchId;
    if (
      source.sourceType !== 'asset-depreciation' || source.status !== 'ready' ||
      run.status !== 'approved' || run.journalDraftId !== source.id ||
      !run.decidedBy || !run.decidedAt || run.decidedBy === run.requestedBy ||
      !inBoundScope(run) || source.sourceId !== run.id || source.sourceNumber !== run.number || source.postingDate !== run.periodEnd
    ) {
      throw new Error('Only an independently approved depreciation run from the bound company and branch can prepare a canonical journal.');
    }
    const periodStart = dateOnly(run.periodStart, 'Depreciation period start');
    const periodEnd = dateOnly(run.periodEnd, 'Depreciation period end');
    const expectedPeriodEnd = new Date(`${periodStart}T00:00:00.000Z`);
    expectedPeriodEnd.setUTCMonth(expectedPeriodEnd.getUTCMonth() + 1, 0);
    if (periodStart.slice(8) !== '01' || expectedPeriodEnd.toISOString().slice(0, 10) !== periodEnd || run.method !== 'straight-line' || run.convention !== 'full-month') {
      throw new Error('The depreciation run does not represent one valid full-month straight-line period.');
    }
    if (!run.lines.length || run.lines.length > 2_000) throw new Error('A depreciation run requires one to 2,000 supported asset lines.');
    const seenCapitalizations = new Set<string>();
    let totalMinor = 0;
    for (const line of run.lines) {
      if (seenCapitalizations.has(line.assetCapitalizationId)) throw new Error('A depreciation run cannot charge one asset capitalisation twice.');
      seenCapitalizations.add(line.assetCapitalizationId);
      const capitalization = revenue.assetCapitalizations.find(({ id }) => id === line.assetCapitalizationId);
      const asset = capitalization ? revenue.managedAssets.find(({ id }) => id === capitalization.assetId) : undefined;
      const policy: AssetDepreciationPolicy | undefined = revenue.assetDepreciationPolicies.find(({ id }) => id === line.policyId);
      const capitalizationSource = capitalization?.journalDraftId
        ? revenue.journalDrafts.find(({ id }) => id === capitalization.journalDraftId)
        : undefined;
      if (
        !capitalization || !asset || !policy || !capitalizationSource ||
        ![capitalization, asset, policy].every(inBoundScope) ||
        capitalization.status !== 'approved' || capitalizationSource.sourceType !== 'asset-capitalization' ||
        capitalizationSource.sourceId !== capitalization.id ||
        policy.status !== 'approved' || policy.method !== 'straight-line' || policy.convention !== 'full-month' ||
        line.assetId !== asset.id || line.capitalizedCost !== capitalization.taxableAmount ||
        policy.categoryId !== asset.categoryId || policy.effectiveFrom > asset.availableForUseOn
      ) {
        throw new Error('A depreciation line no longer matches its approved asset, capitalisation, and effective policy evidence.');
      }
      const capitalisationJournal = this.database.getLedgerJournalBySource(bound.binding.companyId, 'asset-capitalization', capitalization.id);
      if (!capitalisationJournal || capitalisationJournal.branchId !== bound.binding.branchId || capitalisationJournal.status !== 'posted') {
        throw new Error('Each depreciation line requires a posted canonical asset-capitalisation journal.');
      }
      const capitalisationMonth = new Date(`${capitalization.capitalizationDate.slice(0, 7)}-01T00:00:00.000Z`);
      const runMonth = new Date(`${periodStart}T00:00:00.000Z`);
      const serviceMonthIndex = ((runMonth.getUTCFullYear() - capitalisationMonth.getUTCFullYear()) * 12) + runMonth.getUTCMonth() - capitalisationMonth.getUTCMonth() + 1;
      const costMinor = toMinor(capitalization.taxableAmount, 'Capitalised asset cost');
      const residualMinor = Math.round(costMinor * policy.residualValuePercent / 100);
      const depreciableMinor = costMinor - residualMinor;
      const baseMinor = Math.floor(depreciableMinor / policy.usefulLifeMonths);
      const remainderMinor = depreciableMinor % policy.usefulLifeMonths;
      const expectedDepreciationMinor = serviceMonthIndex >= 1 && serviceMonthIndex <= policy.usefulLifeMonths
        ? baseMinor + (serviceMonthIndex <= remainderMinor ? 1 : 0)
        : 0;
      if (
        line.serviceMonthIndex !== serviceMonthIndex ||
        toMinor(line.residualValue, 'Depreciation residual value') !== residualMinor ||
        toMinor(line.depreciationAmount, 'Depreciation line amount') !== expectedDepreciationMinor ||
        expectedDepreciationMinor <= 0
      ) {
        throw new Error('A depreciation-line amount or service-month index does not match the approved straight-line policy.');
      }
      const duplicateRun = revenue.assetDepreciationRuns.some((candidate) => candidate.id !== run.id && candidate.periodEnd === run.periodEnd && candidate.status !== 'rejected' && inBoundScope(candidate) && candidate.lines.some((candidateLine) => candidateLine.assetCapitalizationId === capitalization.id));
      if (duplicateRun) throw new Error('Another active depreciation run already controls this asset capitalisation for the same period.');
      totalMinor += expectedDepreciationMinor;
    }
    if (toMinor(run.totalDepreciation, 'Depreciation run total') !== totalMinor) {
      throw new Error('The depreciation-run total does not equal its independently recomputed line total.');
    }
    const debitLine = source.lines.find(({ accountCode }) => accountCode === 'depreciation-expense');
    const creditLine = source.lines.find(({ accountCode }) => accountCode === 'accumulated-depreciation');
    if (
      source.lines.length !== 2 || !debitLine || !creditLine ||
      toMinor(debitLine.debit, 'Depreciation expense debit') !== totalMinor || debitLine.credit !== 0 ||
      debitLine.memo !== `${run.number} / ${run.periodEnd}` ||
      creditLine.debit !== 0 || toMinor(creditLine.credit, 'Accumulated depreciation credit') !== totalMinor ||
      creditLine.memo !== `${run.number} / ${run.periodEnd}` ||
      toMinor(source.totalDebit, 'Depreciation handoff debit total') !== totalMinor ||
      toMinor(source.totalCredit, 'Depreciation handoff credit total') !== totalMinor
    ) {
      throw new Error('The depreciation handoff must debit expense and credit accumulated depreciation for the approved run total.');
    }
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) throw new Error('The asset-depreciation handoff checksum is invalid and cannot be posted.');
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, 'asset-depreciation', run.id);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum || existing.sourceNumber !== source.sourceNumber) {
        throw new Error('The asset-depreciation source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      }
      return this.getSnapshot();
    }
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, periodEnd);
    if (!period) throw new Error('No open general-ledger period covers the depreciation period end.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account || !account.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Depreciation debit'), creditMinor: toMinor(line.credit, 'Depreciation credit'), memo: clean(line.memo, 'Depreciation line memo', 2, 280) };
    });
    const fiscal = fiscalPeriodFor(periodEnd, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({
      id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId,
      fiscalLabel: fiscal.label, postingDate: periodEnd, periodId: period.id, sourceType: 'asset-depreciation',
      sourceId: run.id, sourceNumber: source.sourceNumber, sourceChecksum: checksum, kind: 'source',
      currencyCode: bound.binding.currencyCode, memo: `Depreciation ${run.number} / ${run.periodEnd}`,
      createdBy: actorId, createdAt: new Date().toISOString(), lines,
    });
    return this.getSnapshot();
  }

  /**
   * Returns a deliberately small, aggregate-only fixed-asset book summary to
   * the operational asset register. Source journal lines never leave the GL
   * boundary. A summary is unavailable if the capitalisation chain is not
   * currently posted, or if any included posting has itself been reversed.
   */
  public getAssetCapitalizationBookValue(capitalizationId: string): AssetBookValue | null {
    const revenue = this.revenueOpsStore.getSnapshot();
    const binding = this.database.getLedgerBinding(revenue.profile.id);
    if (!binding || !capitalizationId.trim()) return null;
    const resolution = this.resolveBinding(binding, this.kernelStore.getSnapshot(), revenue.profile);
    if (resolution.problem || !resolution.company) return null;

    const capitalization = revenue.assetCapitalizations.find(({ id }) => id === capitalizationId);
    const asset = capitalization
      ? revenue.managedAssets.find(({ id }) => id === capitalization.assetId)
      : undefined;
    const capitalizationSource = capitalization?.journalDraftId
      ? revenue.journalDrafts.find(({ id }) => id === capitalization.journalDraftId)
      : undefined;
    if (
      !capitalization || !asset || !capitalizationSource ||
      capitalization.status !== 'approved' ||
      capitalization.scope?.companyId !== binding.companyId || capitalization.scope?.branchId !== binding.branchId ||
      asset.scope?.companyId !== binding.companyId || asset.scope?.branchId !== binding.branchId ||
      capitalizationSource.sourceType !== 'asset-capitalization' ||
      capitalizationSource.sourceId !== capitalization.id
    ) {
      return null;
    }

    const capitalizationJournal = this.database.getLedgerJournalBySource(
      binding.companyId,
      'asset-capitalization',
      capitalization.id,
    );
    if (!this.isActivePostedJournal(capitalizationJournal, binding.companyId, binding.branchId)) return null;

    const grossMinor = toMinor(capitalization.taxableAmount, 'Capitalised asset cost');
    let accumulatedMinor = 0;
    let asOfDate = capitalizationJournal.postingDate;
    for (const run of revenue.assetDepreciationRuns) {
      const line = run.lines.find(({ assetCapitalizationId }) => assetCapitalizationId === capitalization.id);
      if (!line || run.status !== 'approved' || run.scope?.companyId !== binding.companyId || run.scope?.branchId !== binding.branchId) continue;
      const handoff = run.journalDraftId
        ? revenue.journalDrafts.find(({ id }) => id === run.journalDraftId)
        : undefined;
      if (!handoff || handoff.sourceType !== 'asset-depreciation' || handoff.sourceId !== run.id) continue;
      const journal = this.database.getLedgerJournalBySource(binding.companyId, 'asset-depreciation', run.id);
      if (!this.isActivePostedJournal(journal, binding.companyId, binding.branchId)) continue;
      accumulatedMinor += toMinor(line.depreciationAmount, 'Posted depreciation amount');
      if (journal.postingDate > asOfDate) asOfDate = journal.postingDate;
    }
    if (accumulatedMinor < 0 || accumulatedMinor > grossMinor) return null;
    return {
      capitalizationId: capitalization.id,
      grossCost: fromMinor(grossMinor),
      accumulatedDepreciation: fromMinor(accumulatedMinor),
      netBookValue: fromMinor(grossMinor - accumulatedMinor),
      asOfDate,
    };
  }

  /**
   * Prepares a no-proceeds retirement only after independently revalidating
   * the live, unreversed fixed-asset source chain. The source draft remains
   * an instruction until this canonical journal is posted by a separate GL
   * checker; physical asset completion is intentionally a later action.
   */
  public prepareAssetRetirementPosting(
    input: PrepareAssetRetirementPostingInput,
    actorId: string,
  ): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const retirement: AssetRetirement | undefined = source
      ? revenue.assetRetirements.find(({ id }) => id === source.sourceId)
      : undefined;
    const capitalization = retirement
      ? revenue.assetCapitalizations.find(({ id }) => id === retirement.capitalizationId)
      : undefined;
    const asset = retirement
      ? revenue.managedAssets.find(({ id }) => id === retirement.assetId)
      : undefined;
    if (
      !source || !retirement || !capitalization || !asset ||
      source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum
    ) {
      throw new Error('The asset-retirement handoff is stale or unavailable. Refresh and retry.');
    }
    const inBoundScope = (record: { scope?: { companyId: string; branchId: string } }) =>
      record.scope?.companyId === bound.binding.companyId && record.scope?.branchId === bound.binding.branchId;
    if (
      source.sourceType !== 'asset-retirement' || source.status !== 'ready' ||
      retirement.status !== 'approved' || retirement.journalDraftId !== source.id ||
      !retirement.decidedBy || !retirement.decidedAt || retirement.decidedBy === retirement.requestedBy ||
      source.sourceId !== retirement.id || source.sourceNumber !== retirement.number ||
      source.postingDate !== retirement.retirementDate ||
      capitalization.id !== retirement.capitalizationId || capitalization.assetId !== asset.id ||
      capitalization.status !== 'approved' || asset.status !== 'in-service' ||
      ![retirement, capitalization, asset].every(inBoundScope)
    ) {
      throw new Error('Only an independently approved no-proceeds asset retirement for an in-service asset can prepare a canonical journal.');
    }
    const retirementDate = dateOnly(retirement.retirementDate, 'Asset retirement date');
    const book = this.getAssetCapitalizationBookValue(capitalization.id);
    if (
      !book || retirementDate < book.asOfDate ||
      book.grossCost !== retirement.grossCost ||
      book.accumulatedDepreciation !== retirement.accumulatedDepreciation ||
      book.netBookValue !== retirement.netBookValue
    ) {
      throw new Error('The fixed-asset book changed after approval. Submit a new retirement request with current book evidence.');
    }
    const grossMinor = toMinor(retirement.grossCost, 'Retirement gross cost');
    const accumulatedMinor = toMinor(retirement.accumulatedDepreciation, 'Retirement accumulated depreciation');
    const lossMinor = toMinor(retirement.netBookValue, 'Retirement loss');
    if (grossMinor <= 0 || accumulatedMinor + lossMinor !== grossMinor) {
      throw new Error('The retirement book values do not reconcile to the capitalised asset cost.');
    }
    const debitAccumulated = source.lines.find(({ accountCode }) => accountCode === 'accumulated-depreciation');
    const debitLoss = source.lines.find(({ accountCode }) => accountCode === 'asset-retirement-loss');
    const creditCost = source.lines.find(({ accountCode }) => accountCode === 'fixed-assets');
    const requiredLineCount = 1 + (accumulatedMinor > 0 ? 1 : 0) + (lossMinor > 0 ? 1 : 0);
    if (
      source.lines.length !== requiredLineCount || !creditCost ||
      (accumulatedMinor > 0 ? !debitAccumulated : Boolean(debitAccumulated)) ||
      (lossMinor > 0 ? !debitLoss : Boolean(debitLoss)) ||
      (debitAccumulated && (toMinor(debitAccumulated.debit, 'Retirement accumulated-depreciation debit') !== accumulatedMinor || debitAccumulated.credit !== 0 || debitAccumulated.memo !== retirement.number)) ||
      (debitLoss && (toMinor(debitLoss.debit, 'Retirement loss debit') !== lossMinor || debitLoss.credit !== 0 || debitLoss.memo !== retirement.number)) ||
      creditCost.debit !== 0 || toMinor(creditCost.credit, 'Retirement fixed-asset credit') !== grossMinor || creditCost.memo !== retirement.number ||
      toMinor(source.totalDebit, 'Retirement handoff debit total') !== grossMinor ||
      toMinor(source.totalCredit, 'Retirement handoff credit total') !== grossMinor
    ) {
      throw new Error('The retirement handoff must remove the cost, clear posted depreciation, and recognise only the remaining book value as loss.');
    }
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) throw new Error('The asset-retirement handoff checksum is invalid and cannot be posted.');
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, 'asset-retirement', retirement.id);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum || existing.sourceNumber !== source.sourceNumber) {
        throw new Error('The asset-retirement source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      }
      return this.getSnapshot();
    }
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, retirementDate);
    if (!period) throw new Error('No open general-ledger period covers the asset retirement date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return {
        id: randomUUID(),
        accountId: account.id,
        debitMinor: toMinor(line.debit, 'Retirement debit'),
        creditMinor: toMinor(line.credit, 'Retirement credit'),
        memo: clean(line.memo, 'Retirement line memo', 2, 280),
      };
    });
    const fiscal = fiscalPeriodFor(retirementDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({
      id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId,
      fiscalLabel: fiscal.label, postingDate: retirementDate, periodId: period.id,
      sourceType: 'asset-retirement', sourceId: retirement.id, sourceNumber: source.sourceNumber,
      sourceChecksum: checksum, kind: 'source', currencyCode: bound.binding.currencyCode,
      memo: `Asset retirement ${retirement.number} / ${asset.assetTag}`,
      createdBy: actorId, createdAt: new Date().toISOString(), lines,
    });
    return this.getSnapshot();
  }

  /**
   * Promotes an independently approved sale-for-proceeds disposal into the
   * canonical ledger. The Revenue Operations draft is only an immutable
   * instruction; the live asset book, GST evidence and balanced lines are
   * independently revalidated at the accounting boundary.
   */
  public prepareAssetSaleDisposalPosting(
    input: PrepareAssetSaleDisposalPostingInput,
    actorId: string,
  ): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const sale: AssetSaleDisposal | undefined = source
      ? revenue.assetSaleDisposals.find(({ id }) => id === source.sourceId)
      : undefined;
    const capitalization = sale
      ? revenue.assetCapitalizations.find(({ id }) => id === sale.capitalizationId)
      : undefined;
    const asset = sale
      ? revenue.managedAssets.find(({ id }) => id === sale.assetId)
      : undefined;
    if (!source || !sale || !capitalization || !asset || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum) {
      throw new Error('The asset-sale handoff is stale or unavailable. Refresh and retry.');
    }
    const inBoundScope = (record: { scope?: { companyId: string; branchId: string } }) =>
      record.scope?.companyId === bound.binding.companyId && record.scope?.branchId === bound.binding.branchId;
    if (
      source.sourceType !== 'asset-sale-disposal' || source.status !== 'ready' ||
      sale.status !== 'approved' || sale.journalDraftId !== source.id ||
      !sale.decidedBy || !sale.decidedAt || sale.decidedBy === sale.requestedBy ||
      source.sourceId !== sale.id || source.sourceNumber !== sale.number || source.postingDate !== sale.saleDate ||
      capitalization.status !== 'approved' || asset.status !== 'in-service' ||
      ![sale, capitalization, asset].every(inBoundScope)
    ) {
      throw new Error('Only an independently approved sale-for-proceeds disposal for an in-service asset can prepare a canonical journal.');
    }
    const saleDate = dateOnly(sale.saleDate, 'Asset sale date');
    const book = this.getAssetCapitalizationBookValue(capitalization.id);
    if (!book || saleDate < book.asOfDate || book.grossCost !== sale.grossCost || book.accumulatedDepreciation !== sale.accumulatedDepreciation || book.netBookValue !== sale.netBookValue) {
      throw new Error('The fixed-asset book changed after sale approval. Submit a new disposal request with current book evidence.');
    }
    const grossMinor = toMinor(sale.grossCost, 'Sale gross cost');
    const accumulatedMinor = toMinor(sale.accumulatedDepreciation, 'Sale accumulated depreciation');
    const nbvMinor = toMinor(sale.netBookValue, 'Sale net book value');
    const taxableMinor = toMinor(sale.taxableProceeds, 'Sale taxable proceeds');
    const gstMinor = toMinor(sale.gstAmount, 'Sale GST amount');
    const totalMinor = toMinor(sale.totalProceeds, 'Sale total proceeds');
    const gainLossMinor = Math.round(sale.gainLoss * 100);
    if (grossMinor <= 0 || accumulatedMinor + nbvMinor !== grossMinor || taxableMinor <= 0 || gstMinor < 0 || totalMinor !== taxableMinor + gstMinor || gainLossMinor !== taxableMinor - nbvMinor) {
      throw new Error('The asset-sale book values, proceeds, GST and gain/loss do not reconcile.');
    }
    const requiredCodes = new Set(['accounts-receivable', 'accumulated-depreciation', 'fixed-assets']);
    if (gstMinor > 0) {
      if (sale.supplyType === 'inter-state') requiredCodes.add('output-igst');
      else {
        requiredCodes.add('output-cgst');
        requiredCodes.add('output-sgst');
      }
    }
    requiredCodes.add(gainLossMinor < 0 ? 'asset-retirement-loss' : 'sales-revenue');
    const hasCode = (code: string) => source.lines.some((line) => line.accountCode === code);
    if (source.lines.some((line) => !requiredCodes.has(line.accountCode)) || [...requiredCodes].some((code) => !hasCode(code))) {
      throw new Error('The asset-sale handoff contains an unsupported or missing canonical account line.');
    }
    const expectedDebit = totalMinor + accumulatedMinor + (gainLossMinor < 0 ? -gainLossMinor : 0);
    const expectedCredit = grossMinor + gstMinor + (gainLossMinor > 0 ? gainLossMinor : 0);
    const debitTotal = toMinor(source.totalDebit, 'Sale handoff debit total');
    const creditTotal = toMinor(source.totalCredit, 'Sale handoff credit total');
    if (debitTotal !== expectedDebit || creditTotal !== expectedCredit || debitTotal !== creditTotal) throw new Error('The asset-sale handoff is not exactly balanced.');
    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) throw new Error('The asset-sale handoff checksum is invalid and cannot be posted.');
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, 'asset-sale-disposal', sale.id);
    if (existing) {
      if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum || existing.sourceNumber !== source.sourceNumber) throw new Error('The asset-sale source changed after canonical preparation. Reverse through the governed ledger workflow before correcting it.');
      return this.getSnapshot();
    }
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, saleDate);
    if (!period) throw new Error('No open general-ledger period covers the asset sale date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account]));
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Sale debit'), creditMinor: toMinor(line.credit, 'Sale credit'), memo: clean(line.memo || source.sourceNumber, 'Sale line memo', 2, 280) };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0);
    const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit !== expectedDebit) throw new Error('The asset-sale handoff is not an exactly balanced canonical posting.');
    const fiscal = fiscalPeriodFor(saleDate, bound.company.fiscalYearStartMonth);
    this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate: saleDate, periodId: period.id, sourceType: 'asset-sale-disposal', sourceId: sale.id, sourceNumber: source.sourceNumber, sourceChecksum: checksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `Asset sale ${sale.number} / ${asset.assetTag}`, createdBy: actorId, createdAt: new Date().toISOString(), lines });
    return this.getSnapshot();
  }

  /** Canonical adapter for impairment and revaluation source drafts. */
  public prepareAssetLifecyclePosting(input: PrepareAssetLifecyclePostingInput, actorId: string): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    if (!source || source.version !== input.expectedVersion || input.expectedChecksum !== source.checksum || !['asset-impairment', 'asset-revaluation'].includes(source.sourceType)) throw new Error('The asset lifecycle handoff is stale or unavailable. Refresh and retry.');
    const review = source.sourceType === 'asset-impairment' ? revenue.assetImpairmentReviews.find(({ id }) => id === source.sourceId) : revenue.assetRevaluations.find(({ id }) => id === source.sourceId);
    const asset = review ? revenue.managedAssets.find(({ id }) => id === review.assetId) : undefined;
    if (!review || !asset || review.status !== 'approved' || review.journalDraftId !== source.id || asset.status !== 'in-service' || review.scope?.companyId !== bound.binding.companyId || review.scope?.branchId !== bound.binding.branchId || asset.scope?.companyId !== bound.binding.companyId || asset.scope?.branchId !== bound.binding.branchId) throw new Error('Only an approved, in-scope asset lifecycle adjustment can prepare a canonical journal.');
    const checksum = revenueHandoffChecksum(source); if (checksum !== source.checksum) throw new Error('The asset lifecycle handoff checksum is invalid and cannot be posted.');
    const totalDebit = source.lines.reduce((sum, line) => sum + toMinor(line.debit, 'Lifecycle debit'), 0); const totalCredit = source.lines.reduce((sum, line) => sum + toMinor(line.credit, 'Lifecycle credit'), 0); if (!source.lines.length || totalDebit !== totalCredit || totalDebit === 0) throw new Error('The asset lifecycle handoff is not exactly balanced.');
    const existing = this.database.getLedgerJournalBySource(bound.binding.companyId, source.sourceType, source.sourceId); if (existing) { if (existing.branchId !== bound.binding.branchId || existing.sourceChecksum !== checksum || existing.sourceNumber !== source.sourceNumber) throw new Error('The asset lifecycle source changed after canonical preparation.'); return this.getSnapshot(); }
    const postingDate = dateOnly(source.postingDate, 'Asset lifecycle posting date'); const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate); if (!period) throw new Error('No open general-ledger period covers the asset lifecycle posting date.');
    const accounts = new Map(this.database.listLedgerAccounts(bound.binding.companyId).map((account) => [account.code, account])); const lines = source.lines.map((line) => { const account = accounts.get(line.accountCode); if (!account?.active || !account.isPostable) throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`); return { id: randomUUID(), accountId: account.id, debitMinor: toMinor(line.debit, 'Lifecycle debit'), creditMinor: toMinor(line.credit, 'Lifecycle credit'), memo: clean(line.memo || source.sourceNumber, 'Lifecycle line memo', 2, 280) }; });
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth); this.database.createLedgerJournal({ id: randomUUID(), companyId: bound.binding.companyId, branchId: bound.binding.branchId, fiscalLabel: fiscal.label, postingDate, periodId: period.id, sourceType: source.sourceType, sourceId: source.sourceId, sourceNumber: source.sourceNumber, sourceChecksum: checksum, kind: 'source', currencyCode: bound.binding.currencyCode, memo: `Asset lifecycle ${source.sourceNumber} / ${asset.assetTag}`, createdBy: actorId, createdAt: new Date().toISOString(), lines }); return this.getSnapshot();
  }

  /**
   * Finance-approved project claims enter the canonical book through their
   * immutable recognition event. The claim remains the replay identity while
   * the event number and checksum preserve its original accounting evidence.
   */
  public prepareProjectRevenueRecognitionPosting(
    input: PrepareProjectRevenueRecognitionPostingInput,
    actorId: string,
  ): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const revenue = this.revenueOpsStore.getSnapshot();
    const source = revenue.journalDrafts.find(({ id }) => id === input.journalDraftId);
    const claim = source
      ? revenue.projectBillingClaims.find(({ id }) => id === source.sourceId)
      : undefined;
    const event = claim?.recognitionEventId
      ? revenue.revenueRecognitionEvents.find(({ id }) => id === claim.recognitionEventId)
      : undefined;
    const plan = claim
      ? revenue.projectBillingPlans.find(({ id }) => id === claim.planId)
      : undefined;
    const project = claim
      ? revenue.deliveryProjects.find(({ id }) => id === claim.projectId)
      : undefined;

    if (
      !source ||
      !claim ||
      !event ||
      !plan ||
      !project ||
      source.version !== input.expectedVersion ||
      input.expectedChecksum !== source.checksum
    ) {
      throw new Error('The project revenue-recognition handoff is stale or unavailable. Refresh and retry.');
    }
    if (
      source.sourceType !== 'revenue-recognition' ||
      source.status !== 'ready' ||
      claim.scope?.companyId !== bound.binding.companyId ||
      claim.scope?.branchId !== bound.binding.branchId ||
      event.scope?.companyId !== bound.binding.companyId ||
      event.scope?.branchId !== bound.binding.branchId ||
      plan.scope?.companyId !== bound.binding.companyId ||
      plan.scope?.branchId !== bound.binding.branchId ||
      project.scope?.companyId !== bound.binding.companyId ||
      project.scope?.branchId !== bound.binding.branchId
    ) {
      throw new Error('Only a ready project recognition from the bound company and branch can prepare a canonical revenue journal.');
    }

    const checksum = revenueHandoffChecksum(source);
    if (checksum !== source.checksum) {
      throw new Error('The project revenue-recognition handoff checksum is invalid and cannot be posted.');
    }
    validateProjectRevenueRecognitionHandoff(
      source,
      claim,
      event,
      plan,
      project,
      bound.binding.currencyCode,
    );

    const existing = this.database.getLedgerJournalBySource(
      bound.binding.companyId,
      'project-revenue-recognition',
      claim.id,
    );
    if (existing) {
      if (
        existing.branchId !== bound.binding.branchId ||
        existing.sourceChecksum !== checksum ||
        existing.sourceNumber !== source.sourceNumber
      ) {
        throw new Error('The project revenue-recognition source changed after canonical journal preparation. Reverse through the governed ledger workflow before correcting it.');
      }
      return this.getSnapshot();
    }

    const postingDate = dateOnly(source.postingDate, 'Project revenue-recognition posting date');
    const period = this.database.getOpenLedgerPeriod(
      bound.binding.companyId,
      postingDate,
    );
    if (!period) {
      throw new Error('No open general-ledger period covers the project revenue-recognition date.');
    }
    const accounts = new Map(
      this.database
        .listLedgerAccounts(bound.binding.companyId)
        .map((account) => [account.code, account]),
    );
    const lines = source.lines.map((line) => {
      const account = accounts.get(line.accountCode);
      if (!account || !account.active || !account.isPostable) {
        throw new Error(`The canonical chart does not contain an active postable ${line.accountCode} account.`);
      }
      return {
        id: randomUUID(),
        accountId: account.id,
        debitMinor: toMinor(line.debit, 'Project revenue-recognition debit'),
        creditMinor: toMinor(line.credit, 'Project revenue-recognition credit'),
        memo: clean(
          line.memo || source.sourceNumber,
          'Project revenue-recognition line memo',
          2,
          280,
        ),
      };
    });
    const totalDebit = lines.reduce((total, line) => total + line.debitMinor, 0);
    const totalCredit = lines.reduce((total, line) => total + line.creditMinor, 0);
    if (!lines.length || totalDebit !== totalCredit || totalDebit === 0) {
      throw new Error('The project revenue-recognition handoff is not an exactly balanced canonical posting.');
    }
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    const now = new Date().toISOString();
    this.database.createLedgerJournal({
      id: randomUUID(),
      companyId: bound.binding.companyId,
      branchId: bound.binding.branchId,
      fiscalLabel: fiscal.label,
      postingDate,
      periodId: period.id,
      sourceType: 'project-revenue-recognition',
      sourceId: claim.id,
      sourceNumber: source.sourceNumber,
      sourceChecksum: checksum,
      kind: 'source',
      currencyCode: bound.binding.currencyCode,
      memo: `Project revenue recognition ${event.number} / ${claim.number}`,
      createdBy: actorId,
      createdAt: now,
      lines,
    });
    return this.getSnapshot();
  }

  /**
   * The legacy Revenue Ledger export is intentionally blocked after a
   * canonical invoice draft exists, preventing parallel external and EPIC GL
   * books for the same invoice. It reveals no journal contents.
   */
  public hasCanonicalRevenueInvoicePosting(invoiceId: string): boolean {
    return this.hasCanonicalSourcePosting('revenue-invoice', invoiceId);
  }

  /**
   * Allows a source module to prevent a legacy export after its business event
   * has been claimed by any canonical adapter. Only the boolean is exposed;
   * no cross-company ledger detail leaves the accounting boundary.
   */
  public hasCanonicalSourcePosting(sourceType: string, sourceId: string): boolean {
    const normalizedSourceType = sourceType.trim();
    const normalizedSourceId = sourceId.trim();
    return Boolean(
      normalizedSourceType &&
      normalizedSourceId &&
      this.database.hasLedgerJournalSource(normalizedSourceType, normalizedSourceId),
    );
  }

  /**
   * Used only by the close controller. A source handoff is close-complete when
   * its matching canonical journal has reached the immutable posted chain in
   * the currently bound company and branch. Preparation alone never passes.
   */
  public isCanonicalHandoffPosted(source: AccountingJournalDraft): boolean {
    const revenue = this.revenueOpsStore.getSnapshot();
    const binding = this.database.getLedgerBinding(revenue.profile.id);
    if (!binding) return false;

    let sourceType: string;
    let sourceId: string;
    switch (source.sourceType) {
      case 'invoice':
        sourceType = 'revenue-invoice';
        sourceId = source.sourceId;
        break;
      case 'payment':
        sourceType = 'revenue-cash-receipt';
        sourceId = source.sourceId;
        break;
      case 'retail-sale-cost':
      case 'retail-return-cost':
      case 'retail-commission-payout':
        sourceType = source.sourceType;
        sourceId = source.sourceId;
        break;
      case 'credit-note':
      case 'debit-note':
        sourceType = 'revenue-commercial-adjustment';
        sourceId = source.sourceId;
        break;
      case 'supplier-invoice': {
        const match = revenue.threeWayMatches.find(({ id }) => id === source.sourceId);
        if (!match) return false;
        sourceType = 'procurement-supplier-invoice';
        sourceId = match.supplierInvoiceId;
        break;
      }
      case 'write-off':
        sourceType = 'collections-write-off';
        sourceId = source.sourceId;
        break;
      case 'withholding':
        sourceType = 'finance-withholding';
        sourceId = source.sourceId;
        break;
      case 'treasury-payment':
        sourceType = 'treasury-payment';
        sourceId = source.sourceId;
        break;
      case 'bank-charge':
        sourceType = 'treasury-bank-charge';
        sourceId = source.sourceId;
        break;
      case 'liquidity-sweep-release':
        sourceType = 'treasury-sweep-release';
        sourceId = source.sourceId;
        break;
      case 'liquidity-sweep-settlement':
        sourceType = 'treasury-sweep-settlement';
        sourceId = source.sourceId;
        break;
      case 'production-issue':
        sourceType = 'manufacturing-production-issue';
        sourceId = source.sourceId;
        break;
      case 'production-output':
        sourceType = 'manufacturing-production-output';
        sourceId = source.sourceId;
        break;
      case 'landed-cost':
        sourceType = 'procurement-landed-cost';
        sourceId = source.sourceId;
        break;
      case 'payroll-finalization':
        sourceType = 'people-payroll-finalization';
        sourceId = source.sourceId;
        break;
      case 'expense-reimbursement':
        sourceType = 'people-expense-reimbursement';
        sourceId = source.sourceId;
        break;
      case 'asset-capitalization':
        sourceType = 'asset-capitalization';
        sourceId = source.sourceId;
        break;
      case 'asset-depreciation':
        sourceType = 'asset-depreciation';
        sourceId = source.sourceId;
        break;
      case 'asset-retirement':
        sourceType = 'asset-retirement';
        sourceId = source.sourceId;
        break;
      case 'asset-sale-disposal':
        sourceType = 'asset-sale-disposal';
        sourceId = source.sourceId;
        break;
      case 'asset-impairment':
      case 'asset-revaluation':
        sourceType = source.sourceType;
        sourceId = source.sourceId;
        break;
      case 'revenue-recognition':
        sourceType = 'project-revenue-recognition';
        sourceId = source.sourceId;
        break;
      default:
        return false;
    }

    const journal = this.database.getLedgerJournalBySource(
      binding.companyId,
      sourceType,
      sourceId,
    );
    return Boolean(
      this.isActivePostedJournal(journal, binding.companyId, binding.branchId),
    );
  }

  public postJournal(
    id: string,
    expectedVersion: number,
    actorId: string,
  ): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const journal = this.database.getLedgerJournal(id);
    if (
      !journal ||
      journal.companyId !== bound.binding.companyId ||
      journal.branchId !== bound.binding.branchId
    ) {
      throw new Error('General-ledger journal not found in the bound company.');
    }
    this.database.postLedgerJournal(id, expectedVersion, actorId, new Date().toISOString());
    return this.getSnapshot();
  }

  public reverseJournal(
    input: ReverseLedgerJournalInput,
    actorId: string,
  ): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const original = this.database.getLedgerJournal(input.id);
    if (
      !original ||
      original.companyId !== bound.binding.companyId ||
      original.branchId !== bound.binding.branchId ||
      original.status !== 'posted' ||
      original.version !== input.expectedVersion
    ) {
      throw new Error('The posted journal is stale or unavailable for reversal.');
    }
    if (original.kind === 'reversal') {
      throw new Error('A reversal journal cannot be reversed again. Correct the original business entry with reviewed evidence.');
    }
    if (original.postedBy === actorId) {
      throw new Error('The journal poster cannot prepare its reversal.');
    }
    const hasReversal = this.database
      .listLedgerJournals(bound.binding.companyId, bound.binding.branchId)
      .some(({ reversesJournalId }) => reversesJournalId === original.id);
    if (hasReversal) throw new Error('This posted journal already has a reversal entry.');
    const postingDate = dateOnly(input.postingDate, 'Reversal date');
    const reason = clean(input.reason, 'Reversal reason', 4, 500);
    const period = this.database.getOpenLedgerPeriod(bound.binding.companyId, postingDate);
    if (!period) throw new Error('No open general-ledger period covers the reversal date.');
    const fiscal = fiscalPeriodFor(postingDate, bound.company.fiscalYearStartMonth);
    const now = new Date().toISOString();
    this.database.createLedgerJournal({
      id: randomUUID(),
      companyId: bound.binding.companyId,
      branchId: bound.binding.branchId,
      fiscalLabel: fiscal.label,
      postingDate,
      periodId: period.id,
      sourceType: 'ledger-reversal',
      sourceId: original.id,
      sourceNumber: original.number,
      sourceChecksum: original.hash,
      kind: 'reversal',
      currencyCode: bound.binding.currencyCode,
      memo: `Reversal of ${original.number}: ${reason}`,
      createdBy: actorId,
      createdAt: now,
      reversesJournalId: original.id,
      lines: original.lines.map((line) => ({
        id: randomUUID(),
        accountId: line.accountId,
        debitMinor: line.creditMinor,
        creditMinor: line.debitMinor,
        memo: `Reversal · ${line.memo}`,
      })),
    });
    return this.getSnapshot();
  }

  public cancelReversalJournal(
    input: CancelLedgerJournalInput,
    actorId: string,
  ): GeneralLedgerSnapshot {
    const bound = this.requireBoundScope(actorId);
    const journal = this.database.getLedgerJournal(input.id);
    if (
      !journal ||
      journal.companyId !== bound.binding.companyId ||
      journal.branchId !== bound.binding.branchId
    ) {
      throw new Error('Reversal draft not found in the bound company and branch.');
    }
    this.database.voidLedgerJournal(
      input.id,
      input.expectedVersion,
      actorId,
      clean(input.reason, 'Cancellation reason', 4, 500),
      new Date().toISOString(),
    );
    return this.getSnapshot();
  }

  private requireBoundScope(actorId: string): {
    binding: StoredLedgerBinding;
    company: Company;
  } {
    const kernel = this.kernelStore.getSnapshot();
    const profile = this.revenueOpsStore.getSnapshot().profile;
    const binding = this.database.getLedgerBinding(profile.id);
    if (!binding) throw new Error('Bind a matching India legal entity before using the general ledger.');
    const resolution = this.resolveBinding(binding, kernel, profile);
    if (resolution.problem || !resolution.company) throw new Error(resolution.problem ?? 'The finance binding is invalid.');
    const actor = kernel.users.find(({ id, status }) => id === actorId && status === 'active');
    if (!actor || !actor.companyIds.includes(binding.companyId) || !actor.branchIds.includes(binding.branchId)) {
      throw new Error('Your finance session is outside the bound company or branch scope.');
    }
    return { binding, company: resolution.company };
  }

  /** A reversed source journal is never usable as current subledger evidence. */
  private isActivePostedJournal(
    journal: StoredLedgerJournal | null,
    companyId: string,
    branchId: string,
  ): journal is StoredLedgerJournal {
    return Boolean(
      journal &&
      journal.companyId === companyId &&
      journal.branchId === branchId &&
      journal.status === 'posted' &&
      !this.database.listLedgerJournals(companyId, branchId).some(
        (candidate) => candidate.status === 'posted' && candidate.reversesJournalId === journal.id,
      ),
    );
  }

  /**
   * Reconciles current fixed-asset balances from active, immutable source
   * journals. Reversal pairs are excluded as a pair. A manual journal that
   * touches a fixed-asset control account is deliberately surfaced as an
   * unresolved movement: it may be valid opening-balance or correction work,
   * but it cannot be silently mapped to an asset without source evidence.
   */
  private buildFixedAssetRollforward(journals: StoredLedgerJournal[]): FixedAssetRollforward {
    const postedReversalTargets = new Set(
      journals
        .filter((journal) => journal.status === 'posted' && journal.reversesJournalId)
        .map((journal) => journal.reversesJournalId as string),
    );
    const active = journals.filter((journal) => (
      journal.status === 'posted' &&
      journal.kind !== 'reversal' &&
      !postedReversalTargets.has(journal.id)
    ));
    let capitalizedCostMinor = 0;
    let retiredCostMinor = 0;
    let manualGrossCostMovementMinor = 0;
    let depreciationChargeMinor = 0;
    let retirementAccumulatedDepreciationReleaseMinor = 0;
    let manualAccumulatedDepreciationMovementMinor = 0;
    let retirementLossMinor = 0;
    let asOfDate: string | null = null;
    const unlinkedJournalIds = new Set<string>();
    let capitalizations = 0;
    let depreciationRuns = 0;
    let retirements = 0;

    for (const journal of active) {
      const grossMovementMinor = journal.lines
        .filter((line) => line.accountCode === 'fixed-assets')
        .reduce((total, line) => total + line.debitMinor - line.creditMinor, 0);
      const accumulatedMovementMinor = journal.lines
        .filter((line) => line.accountCode === 'accumulated-depreciation')
        .reduce((total, line) => total + line.creditMinor - line.debitMinor, 0);
      const retirementLossMovementMinor = journal.lines
        .filter((line) => line.accountCode === 'asset-retirement-loss')
        .reduce((total, line) => total + line.debitMinor - line.creditMinor, 0);
      if (!grossMovementMinor && !accumulatedMovementMinor && !retirementLossMovementMinor) continue;
      if (!asOfDate || journal.postingDate > asOfDate) asOfDate = journal.postingDate;

      if (journal.sourceType === 'asset-capitalization') {
        capitalizedCostMinor += grossMovementMinor;
        capitalizations += 1;
      } else if (journal.sourceType === 'asset-depreciation') {
        depreciationChargeMinor += accumulatedMovementMinor;
        depreciationRuns += 1;
      } else if (journal.sourceType === 'asset-retirement' || journal.sourceType === 'asset-sale-disposal') {
        retiredCostMinor += Math.max(0, -grossMovementMinor);
        retirementAccumulatedDepreciationReleaseMinor += Math.max(0, -accumulatedMovementMinor);
        retirementLossMinor += retirementLossMovementMinor;
        retirements += 1;
      } else {
        manualGrossCostMovementMinor += grossMovementMinor;
        manualAccumulatedDepreciationMovementMinor += accumulatedMovementMinor;
        unlinkedJournalIds.add(journal.id);
      }
    }
    const endingGrossCostMinor = capitalizedCostMinor - retiredCostMinor + manualGrossCostMovementMinor;
    const endingAccumulatedDepreciationMinor = depreciationChargeMinor - retirementAccumulatedDepreciationReleaseMinor + manualAccumulatedDepreciationMovementMinor;
    const endingNetBookValueMinor = endingGrossCostMinor - endingAccumulatedDepreciationMinor;
    return {
      asOfDate,
      capitalizedCost: fromMinor(capitalizedCostMinor),
      retiredCost: fromMinor(retiredCostMinor),
      manualGrossCostMovement: fromMinor(manualGrossCostMovementMinor),
      endingGrossCost: fromMinor(endingGrossCostMinor),
      depreciationCharge: fromMinor(depreciationChargeMinor),
      retirementAccumulatedDepreciationRelease: fromMinor(retirementAccumulatedDepreciationReleaseMinor),
      manualAccumulatedDepreciationMovement: fromMinor(manualAccumulatedDepreciationMovementMinor),
      endingAccumulatedDepreciation: fromMinor(endingAccumulatedDepreciationMinor),
      retirementLoss: fromMinor(retirementLossMinor),
      endingNetBookValue: fromMinor(endingNetBookValueMinor),
      sourceJournalCounts: { capitalizations, depreciationRuns, retirements },
      unlinkedFixedAssetJournalCount: unlinkedJournalIds.size,
      reconciliationStatus: unlinkedJournalIds.size === 0 && endingGrossCostMinor >= 0 && endingAccumulatedDepreciationMinor >= 0 && endingNetBookValueMinor >= 0
        ? 'reconciled'
        : 'attention',
    };
  }

  /**
   * Produces the evidence that the accounting-close controller needs without
   * exposing a second, mutable close state. Source drafts are complete only
   * after their supported canonical handoff is actively posted; legacy source
   * drafts must at least be explicitly exported until their adapter is
   * certified. Every journal draft in the window blocks close, including a
   * reversal draft that has not reached the immutable chain.
   */
  private buildCloseReadiness(
    periodFrom: string,
    periodTo: string,
    journals: StoredLedgerJournal[],
    revenue: RevenueOpsSnapshot,
  ): LedgerCloseReadiness {
    const sourceDrafts = revenue.journalDrafts.filter((draft) => (
      draft.postingDate >= periodFrom && draft.postingDate <= periodTo
    ));
    const sourceBlockers: LedgerCloseBlocker[] = [];
    let sourceHandoffsReady = 0;
    for (const draft of sourceDrafts) {
      const canonicalSource = CANONICAL_CLOSE_SOURCE_TYPES.has(draft.sourceType);
      const complete = canonicalSource
        ? this.isCanonicalHandoffPosted(draft)
        : draft.status === 'exported';
      if (complete) {
        sourceHandoffsReady += 1;
      } else {
        sourceBlockers.push({
          code: 'source-handoff',
          reference: draft.sourceNumber,
          detail: canonicalSource
            ? 'Canonical source journal is not actively posted.'
            : 'Source draft has not been exported or certified through a canonical adapter.',
        });
      }
    }

    const periodJournals = journals.filter((journal) => (
      journal.postingDate >= periodFrom && journal.postingDate <= periodTo
    ));
    const reversalDrafts = periodJournals.filter((journal) => (
      journal.kind === 'reversal' && journal.status === 'draft'
    ));
    const orphanReversals = periodJournals.filter((journal) => (
      journal.kind === 'reversal' &&
      journal.status === 'posted' &&
      Boolean(journal.reversesJournalId) &&
      !journals.some((candidate) => candidate.id === journal.reversesJournalId)
    ));
    const journalBlockers: LedgerCloseBlocker[] = periodJournals
      .filter((journal) => journal.status !== 'posted')
      .map((journal) => ({
        code: 'unposted-journal' as const,
        reference: journal.number,
        detail: journal.kind === 'reversal'
          ? 'Reversal is prepared but has not been posted by an independent checker.'
          : 'Journal is prepared but has not been posted by an independent checker.',
      }));
    const orphanBlockers: LedgerCloseBlocker[] = orphanReversals.map((journal) => ({
      code: 'orphan-reversal',
      reference: journal.number,
      detail: 'Posted reversal points to a missing original journal.',
    }));
    const blockers = [...sourceBlockers, ...journalBlockers, ...orphanBlockers];
    const postedJournals = periodJournals.filter(({ status }) => status === 'posted').length;
    return {
      periodFrom,
      periodTo,
      status: blockers.length === 0 ? 'ready' : 'blocked',
      sourceDrafts: sourceDrafts.length,
      sourceHandoffsReady,
      sourceHandoffsBlocked: sourceBlockers.length,
      journals: periodJournals.length,
      postedJournals,
      unpostedJournals: periodJournals.length - postedJournals,
      reversalDrafts: reversalDrafts.length,
      orphanReversals: orphanReversals.length,
      blockerCount: blockers.length,
      blockers: blockers.slice(0, CLOSE_BLOCKER_LIMIT),
    };
  }

  private resolveBinding(
    binding: StoredLedgerBinding,
    kernel: KernelSnapshot,
    profile: IndiaBusinessProfile,
  ): { company: Company | null; problem: string | null } {
    const company = kernel.companies.find(({ id }) => id === binding.companyId) ?? null;
    const branch = kernel.branches.find(({ id }) => id === binding.branchId);
    if (!company || company.status !== 'active') return { company: null, problem: 'The bound legal entity is missing or inactive.' };
    if (!branch || branch.status !== 'active' || branch.companyId !== company.id) return { company: null, problem: 'The bound operating branch is missing, inactive, or outside the legal entity.' };
    if (company.countryCode !== 'IN' || company.baseCurrency !== profile.currency || company.fiscalYearStartMonth !== profile.fiscalYearStartMonth) {
      return { company: null, problem: 'The bound legal entity no longer matches the India profile’s country, INR currency, or April fiscal year.' };
    }
    return { company, problem: null };
  }

  private ensureFoundation(
    company: Company,
    binding: StoredLedgerBinding,
    profile: IndiaBusinessProfile,
    actorId: string,
    now: string,
    provisionInitialPeriod: boolean,
  ): void {
    this.database.ensureLedgerAccounts(
      INDIA_COA.map((account) => ({
        ...account,
        id: `${company.id}:coa:${account.code}`,
        companyId: company.id,
        createdBy: actorId,
        createdAt: now,
      })),
    );
    if (
      provisionInitialPeriod &&
      this.database.listLedgerPeriods(company.id).length === 0
    ) {
      this.ensurePeriod(company, new Date().toISOString().slice(0, 10));
    }
    if (binding.currencyCode !== profile.currency) {
      throw new Error('Finance binding currency does not match the India operating profile.');
    }
  }

  private ensurePeriod(company: Company, date: string): void {
    const fiscal = fiscalPeriodFor(date, company.fiscalYearStartMonth);
    this.database.ensureLedgerPeriod({
      id: `${company.id}:period:${fiscal.startDate}`,
      companyId: company.id,
      name: fiscal.label,
      startDate: fiscal.startDate,
      endDate: fiscal.endDate,
      status: 'open',
    });
  }

  private blockedSnapshot(profileId: string, reason: string): GeneralLedgerSnapshot {
    return {
      generatedAt: new Date().toISOString(),
      profileId,
      binding: null,
      status: 'binding-required',
      blockingReason: reason,
      accounts: [],
      periods: [],
      journals: [],
      trialBalance: [],
      totals: { debit: 0, credit: 0, netAssets: 0, netIncome: 0 },
      integrityVerified: false,
    };
  }
}

function mapBinding(binding: StoredLedgerBinding): LedgerCompanyBinding {
  return {
    profileId: binding.profileId,
    companyId: binding.companyId,
    branchId: binding.branchId,
    currencyCode: binding.currencyCode,
    boundBy: binding.boundBy,
    boundAt: binding.boundAt,
  };
}

function mapAccount(account: StoredLedgerAccount): LedgerAccount {
  return {
    id: account.id,
    companyId: account.companyId,
    code: account.code,
    name: account.name,
    accountType: account.accountType,
    normalBalance: account.normalBalance,
    isPostable: account.isPostable,
    active: account.active,
  };
}

function mapPeriod(period: StoredLedgerPeriod): LedgerPeriod {
  return {
    id: period.id,
    companyId: period.companyId,
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
  };
}

function mapJournal(journal: StoredLedgerJournal): LedgerJournal {
  return {
    id: journal.id,
    companyId: journal.companyId,
    branchId: journal.branchId,
    number: journal.number,
    postingDate: journal.postingDate,
    periodId: journal.periodId,
    sourceType: journal.sourceType,
    sourceId: journal.sourceId,
    sourceNumber: journal.sourceNumber,
    sourceChecksum: journal.sourceChecksum,
    kind: journal.kind,
    currencyCode: journal.currencyCode,
    memo: journal.memo,
    status: journal.status,
    createdBy: journal.createdBy,
    createdAt: journal.createdAt,
    postedBy: journal.postedBy,
    postedAt: journal.postedAt,
    reversesJournalId: journal.reversesJournalId,
    previousHash: journal.previousHash,
    hash: journal.hash,
    version: journal.version,
    totalDebit: fromMinor(journal.totalDebitMinor),
    totalCredit: fromMinor(journal.totalCreditMinor),
    lines: journal.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      accountId: line.accountId,
      accountCode: line.accountCode,
      accountName: line.accountName,
      debit: fromMinor(line.debitMinor),
      credit: fromMinor(line.creditMinor),
      memo: line.memo,
      costCenterId: line.costCenterId,
      profitCenterId: line.profitCenterId,
      departmentId: line.departmentId,
      projectId: line.projectId,
    } satisfies LedgerJournalLine)),
  };
}
