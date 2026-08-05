import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from '../domain/revenue-ops';
import { BusinessDatabase } from './database';
import { GeneralLedgerStore } from './general-ledger-store';
import { KernelStore } from './kernel-store';
import type { RevenueOpsStore } from './revenue-ops-store';
import type {
  AccountingJournalDraft,
  PaymentReceipt,
  Receivable,
  RevenueOpsSnapshot,
  TaxInvoice,
} from '../shared/revenue-ops-contracts';
import type {
  GoodsReceipt,
  LandedCostAllocation,
  PurchaseOrder,
  Supplier,
  SupplierInvoice,
  ThreeWayMatch,
} from '../shared/procurement-contracts';
import type {
  ProjectBillingClaim,
  ProjectBillingPlan,
  RevenueRecognitionEvent,
} from '../shared/financial-close-contracts';
import type { DeliveryProject } from '../shared/delivery-contracts';
import type { AssetCapitalization, AssetDepreciationPolicy, AssetDepreciationRun, AssetRetirement, ManagedAsset } from '../shared/assets-maintenance-contracts';
import type { BankAccountControl, WithholdingEntry, WithholdingPolicy, WriteOffRequest } from '../shared/collections-finance-contracts';
import type { BankCharge, PaymentProposal } from '../shared/treasury-contracts';
import type { ProductionMaterialIssue, ProductionOutput, WorkOrder } from '../shared/manufacturing-contracts';
import type { ExpenseClaim, PayrollRun } from '../shared/payroll-contracts';
import type { RetailCommissionPayoutBatch, RetailSalesCommission } from '../shared/retail-customer-ops-contracts';

let directory = '';
let database: BusinessDatabase;
let kernelStore: KernelStore;
let ledgerStore: GeneralLedgerStore;
let revenueSnapshot: Pick<
  RevenueOpsSnapshot,
  | 'profile'
  | 'receivables'
  | 'invoices'
  | 'paymentReceipts'
  | 'journalDrafts'
  | 'suppliers'
  | 'supplierInvoices'
  | 'threeWayMatches'
  | 'purchaseOrders'
  | 'goodsReceipts'
  | 'projectBillingPlans'
  | 'projectBillingClaims'
  | 'revenueRecognitionEvents'
  | 'deliveryProjects'
  | 'managedAssets'
  | 'assetCapitalizations'
  | 'assetDepreciationPolicies'
  | 'assetDepreciationRuns'
  | 'assetRetirements'
  | 'writeOffRequests'
  | 'withholdingPolicies'
  | 'withholdingEntries'
  | 'bankAccounts'
  | 'paymentProposals'
  | 'bankCharges'
  | 'liquiditySweeps'
  | 'workOrders'
  | 'productionMaterialIssues'
  | 'productionOutputs'
  | 'landedCostAllocations'
  | 'payrollRuns'
  | 'expenseClaims'
  | 'retailCommissionPayoutBatches'
  | 'retailSalesCommissions'
>;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-ledger-'));
  database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3'));
  await database.initialize();
  kernelStore = new KernelStore(database, path.join(directory, 'data'));
  await kernelStore.initialize();
  const profile = createInitialRevenueOpsState().profile;
  revenueSnapshot = {
    profile,
    receivables: [],
    invoices: [],
    paymentReceipts: [],
    journalDrafts: [],
    suppliers: [],
    supplierInvoices: [],
    threeWayMatches: [],
    purchaseOrders: [],
    goodsReceipts: [],
    projectBillingPlans: [],
    projectBillingClaims: [],
    revenueRecognitionEvents: [],
    deliveryProjects: [],
    managedAssets: [],
    assetCapitalizations: [],
    assetDepreciationPolicies: [],
    assetDepreciationRuns: [],
    assetRetirements: [],
    writeOffRequests: [],
    withholdingPolicies: [],
    withholdingEntries: [],
    bankAccounts: [],
    paymentProposals: [],
    bankCharges: [],
    liquiditySweeps: [],
    workOrders: [],
    productionMaterialIssues: [],
    productionOutputs: [],
    landedCostAllocations: [],
    payrollRuns: [],
    expenseClaims: [],
    retailCommissionPayoutBatches: [],
    retailSalesCommissions: [],
  };
  const revenueOps = {
    getSnapshot: () => revenueSnapshot,
  } as unknown as RevenueOpsStore;
  ledgerStore = new GeneralLedgerStore(database, kernelStore, revenueOps);
  await ledgerStore.initialize();
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

async function bindIndiaBooks(): Promise<{
  companyId: string;
  branchId: string;
  checkerId: string;
}> {
  await kernelStore.addCompany(
    {
      code: 'EPICIN',
      name: 'Epic India',
      legalName: 'Epic India Private Limited',
      countryCode: 'IN',
      baseCurrency: 'INR',
      fiscalYearStartMonth: 4,
    },
    'user-avery',
  );
  const company = kernelStore
    .getSnapshot()
    .companies.find(({ code }) => code === 'EPICIN');
  if (!company) throw new Error('Expected India legal entity.');
  await kernelStore.addBranch(
    { companyId: company.id, code: 'BLR', name: 'Bengaluru', timezone: 'Asia/Kolkata' },
    'user-avery',
  );
  const branch = kernelStore
    .getSnapshot()
    .branches.find(({ companyId, code }) => companyId === company.id && code === 'BLR');
  if (!branch) throw new Error('Expected India branch.');
  ledgerStore.bindCompany({ companyId: company.id, branchId: branch.id }, 'user-avery');
  await kernelStore.addUser(
    {
      email: 'checker@epic.example',
      displayName: 'Ledger Checker',
      temporaryPassword: 'Checker#2026Secure',
      roleIds: ['role-finance-approver'],
      companyIds: [company.id],
      branchIds: [branch.id],
    },
    'user-avery',
  );
  const checker = kernelStore
    .getSnapshot()
    .users.find(({ email }) => email === 'checker@epic.example');
  if (!checker) throw new Error('Expected finance checker.');
  return { companyId: company.id, branchId: branch.id, checkerId: checker.id };
}

function revenueHandoffChecksum(source: AccountingJournalDraft): string {
  const lines = source.lines.map((line) => ({
    ...line,
    debit: Math.round(line.debit * 100) / 100,
    credit: Math.round(line.credit * 100) / 100,
  }));
  const unsigned = {
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceNumber: source.sourceNumber,
    postingDate: source.postingDate,
    lines,
    totalDebit: Math.round(lines.reduce((total, line) => total + line.debit, 0) * 100) / 100,
    totalCredit: Math.round(lines.reduce((total, line) => total + line.credit, 0) * 100) / 100,
  };
  return createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
}

function issuedInvoiceFor(
  source: AccountingJournalDraft,
  scope: { companyId: string; branchId: string },
): TaxInvoice {
  return {
    id: source.sourceId,
    number: source.sourceNumber,
    documentKind: 'tax-invoice',
    salesOrderId: 'sales-order-1001',
    quoteId: 'quote-1001',
    accountId: 'account-northstar',
    recipientTreatment: 'registered',
    recipientGstin: '29ABCDE1234F1Z5',
    placeOfSupplyStateCode: '29',
    reverseCharge: false,
    currency: 'INR',
    invoiceDate: source.postingDate,
    dueDate: '2026-08-14',
    paymentTermId: 'payment-term-net-30',
    status: 'issued',
    irpStatus: 'not-applicable',
    serviceMilestoneIds: [],
    shipmentPackageIds: [],
    lines: [{
      id: 'invoice-line-1001',
      productInterestId: 'interest-1001',
      description: 'Governed business operating system subscription',
      hsnSac: '998314',
      quantity: 1,
      unitPrice: 100,
      taxableValue: 100,
      gstRate: 18,
    }],
    subtotal: 100,
    discountTotal: 0,
    taxPreview: {
      treatment: 'intra-state',
      taxableValue: 100,
      cgst: 9,
      sgst: 9,
      igst: 0,
      totalTax: 18,
      grandTotal: 118,
      determination: 'commercial-estimate',
    },
    amountDue: 118,
    createdBy: 'user-avery',
    createdAt: '2026-07-15T08:00:00.000Z',
    issuedBy: 'user-checker',
    issuedAt: '2026-07-15T09:00:00.000Z',
    scope,
    version: 1,
  };
}

function projectRecognitionEvidence(
  scope: { companyId: string; branchId: string },
  checkerId: string,
): {
  source: AccountingJournalDraft;
  plan: ProjectBillingPlan;
  claim: ProjectBillingClaim;
  event: RevenueRecognitionEvent;
  project: DeliveryProject;
} {
  const source: AccountingJournalDraft = {
    id: 'handoff-project-recognition-sequence',
    sourceType: 'revenue-recognition',
    sourceId: 'billing-claim-sequence',
    sourceNumber: 'RRE-26-27-00009',
    postingDate: '2026-07-31',
    lines: [
      { accountCode: 'unbilled-revenue', debit: 8000, credit: 0, memo: 'Approved project revenue recognition' },
      { accountCode: 'sales-revenue', debit: 0, credit: 8000, memo: 'Approved project revenue recognition' },
    ],
    totalDebit: 8000,
    totalCredit: 8000,
    status: 'ready',
    checksum: '',
    version: 1,
  };
  source.checksum = revenueHandoffChecksum(source);
  const plan: ProjectBillingPlan = {
    id: 'billing-plan-sequence',
    number: 'BPL-26-27-00009',
    projectId: 'project-sequence',
    salesOrderId: 'sales-order-sequence',
    salesOrderLineId: 'sales-order-line-sequence',
    billingModel: 'time-and-materials',
    billRate: 1000,
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-09-30',
    status: 'active',
    requestedBy: 'user-avery',
    requestedAt: '2026-07-01T08:00:00.000Z',
    decidedBy: checkerId,
    decidedAt: '2026-07-01T09:00:00.000Z',
    decisionRemarks: 'Independent commercial review approved this billing plan.',
    scope,
    version: 2,
  };
  const claim: ProjectBillingClaim = {
    id: source.sourceId,
    number: 'BCL-26-27-00009',
    planId: plan.id,
    projectId: plan.projectId,
    salesOrderId: plan.salesOrderId,
    salesOrderLineId: plan.salesOrderLineId,
    billingPeriodFrom: '2026-07-01',
    billingPeriodTo: source.postingDate,
    timeEntryIds: ['time-entry-sequence'],
    milestoneIds: [],
    recognizedAmount: 8000,
    status: 'invoiced',
    requestedBy: 'user-avery',
    requestedAt: '2026-07-31T08:00:00.000Z',
    recognizedBy: checkerId,
    recognizedAt: '2026-07-31T09:00:00.000Z',
    recognitionRemarks: 'Independent finance approval confirms the billable delivery evidence.',
    recognitionEventId: 'recognition-event-sequence',
    invoiceId: 'invoice-project-sequence',
    scope,
    version: 3,
  };
  const event: RevenueRecognitionEvent = {
    id: claim.recognitionEventId!,
    number: source.sourceNumber,
    claimId: claim.id,
    projectId: claim.projectId,
    recognitionDate: source.postingDate,
    amount: claim.recognizedAmount,
    journalDraftId: source.id,
    recognizedBy: checkerId,
    recognizedAt: claim.recognizedAt!,
    scope,
    version: 1,
  };
  const project: DeliveryProject = {
    id: plan.projectId,
    number: 'PRJ-26-27-00009',
    accountId: 'account-northstar',
    salesOrderId: plan.salesOrderId,
    name: 'Project invoice sequencing',
    deliveryModel: 'time-and-materials',
    budgetAmount: 250000,
    plannedHours: 250,
    startDate: '2026-07-01',
    targetDate: '2026-09-30',
    managerUserId: 'user-avery',
    status: 'active',
    requestedBy: 'user-avery',
    requestedAt: '2026-07-01T08:00:00.000Z',
    decidedBy: checkerId,
    decidedAt: '2026-07-01T09:00:00.000Z',
    decisionRemarks: 'Project charter independently activated.',
    scope,
    version: 2,
  };
  return { source, plan, claim, event, project };
}

describe('GeneralLedgerStore', () => {
  it('exposes balanced financial statements with journal evidence metadata', async () => {
    await bindIndiaBooks();
    const snapshot = ledgerStore.getSnapshot();
    expect(snapshot.financialStatements).toBeDefined();
    expect(snapshot.financialStatements?.balanceSheet.balanceCheck).toBe(0);
    expect(snapshot.financialStatements?.cashFlow.evidenceJournalCount).toBe(0);
    expect(snapshot.financialStatements?.asOfDate).toBe('');
  });

  it('prepares a matched supplier invoice exactly once with three-way and payable evidence', async () => {
    const { companyId, branchId, checkerId } = await bindIndiaBooks();
    const scope = { companyId, branchId };
    const source: AccountingJournalDraft = {
      id: 'handoff-supplier-invoice-1',
      sourceType: 'supplier-invoice',
      sourceId: 'three-way-match-1',
      sourceNumber: 'VIN-26-27-00001',
      postingDate: '2026-07-15',
      lines: [
        { accountCode: 'inventory-asset', debit: 100, credit: 0, memo: 'Inventory receipt' },
        { accountCode: 'input-cgst', debit: 9, credit: 0, memo: 'Input CGST' },
        { accountCode: 'input-sgst', debit: 9, credit: 0, memo: 'Input SGST' },
        { accountCode: 'accounts-payable', debit: 0, credit: 118, memo: 'Supplier payable' },
      ],
      totalDebit: 118,
      totalCredit: 118,
      status: 'ready',
      checksum: '',
      version: 1,
    };
    source.checksum = revenueHandoffChecksum(source);
    const supplier: Supplier = {
      id: 'supplier-1',
      code: 'GLOBEX',
      legalName: 'Globex Supplies Private Limited',
      stateCode: revenueSnapshot.profile.defaultStateCode,
      email: 'ap@globex.example',
      paymentTermDays: 30,
      categories: ['Components'],
      status: 'approved',
      riskRating: 'low',
      qualificationEvidence: 'GST and quality documentation reviewed.',
      requestedBy: 'user-avery',
      requestedAt: '2026-07-01T08:00:00.000Z',
      decidedBy: checkerId,
      decidedAt: '2026-07-01T09:00:00.000Z',
      scope,
      version: 2,
    };
    const invoice: SupplierInvoice = {
      id: 'supplier-invoice-1',
      number: source.sourceNumber,
      supplierId: supplier.id,
      purchaseOrderId: 'purchase-order-1',
      goodsReceiptId: 'goods-receipt-1',
      supplierInvoiceNumber: 'GLOBEX-771',
      invoiceDate: source.postingDate,
      lines: [{ purchaseOrderLineId: 'purchase-order-line-1', quantity: 1, unitPrice: 100, gstRate: 18, totalAmount: 118 }],
      totalAmount: 118,
      recordedBy: 'user-avery',
      recordedAt: '2026-07-15T08:30:00.000Z',
      scope,
      version: 1,
    };
    const match: ThreeWayMatch = {
      id: source.sourceId,
      number: '3WM-26-27-00001',
      purchaseOrderId: invoice.purchaseOrderId,
      goodsReceiptId: invoice.goodsReceiptId,
      supplierInvoiceId: invoice.id,
      quantityVariance: 0,
      priceVariance: 0,
      status: 'matched',
      tolerancePercent: 1,
      createdBy: 'user-avery',
      createdAt: '2026-07-15T08:30:00.000Z',
      journalId: source.id,
      scope,
      version: 1,
    };
    const purchaseOrder: PurchaseOrder = {
      id: invoice.purchaseOrderId,
      number: 'PO-26-27-00001',
      supplierId: supplier.id,
      warehouseId: 'warehouse-1',
      deliveryBy: '2026-07-15',
      paymentTermDays: 30,
      status: 'received',
      lines: [{
        id: 'purchase-order-line-1',
        itemVariantId: 'variant-1',
        description: 'Approved inventory component',
        quantity: 1,
        unitPrice: 100,
        gstRate: 18,
        taxableValue: 100,
        taxAmount: 18,
        totalAmount: 118,
        receivedQuantity: 1,
        invoicedQuantity: 1,
      }],
      taxableValue: 100,
      taxAmount: 18,
      totalAmount: 118,
      createdBy: 'user-avery',
      createdAt: '2026-07-01T08:00:00.000Z',
      decidedBy: checkerId,
      decidedAt: '2026-07-01T09:00:00.000Z',
      decisionRemarks: 'Approved procurement commitment.',
      scope,
      version: 2,
    };
    const receipt: GoodsReceipt = {
      id: invoice.goodsReceiptId,
      number: 'GRN-26-27-00001',
      purchaseOrderId: purchaseOrder.id,
      supplierId: supplier.id,
      warehouseId: purchaseOrder.warehouseId,
      receivingBinId: 'bin-1',
      receivedAt: '2026-07-15',
      lines: [{
        id: 'goods-receipt-line-1',
        purchaseOrderLineId: purchaseOrder.lines[0]!.id,
        itemVariantId: purchaseOrder.lines[0]!.itemVariantId,
        quantity: 1,
        unitPrice: 100,
        inventoryReference: 'receipt-ledger-1',
        serialNumbers: [],
      }],
      status: 'costed',
      receivedBy: 'user-avery',
      receivedAtRecorded: '2026-07-15T08:15:00.000Z',
      scope,
      version: 1,
    };
    revenueSnapshot = {
      ...revenueSnapshot,
      suppliers: [supplier],
      supplierInvoices: [invoice],
      threeWayMatches: [{ ...match, status: 'variance-review' }],
      purchaseOrders: [purchaseOrder],
      goodsReceipts: [receipt],
      journalDrafts: [source],
    };

    expect(() => ledgerStore.prepareSupplierInvoicePosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery')).toThrow(/approved three-way-match/i);

    revenueSnapshot = {
      ...revenueSnapshot,
      supplierInvoices: [{ ...invoice, scope: { companyId, branchId: 'branch-outside-bound-scope' } }],
    };
    expect(() => ledgerStore.prepareSupplierInvoicePosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery')).toThrow(/bound company and branch/i);

    revenueSnapshot = {
      ...revenueSnapshot,
      supplierInvoices: [invoice],
      threeWayMatches: [match],
      goodsReceipts: [{
        ...receipt,
        lines: [{
          ...receipt.lines[0]!,
          purchaseOrderLineId: 'purchase-order-line-outside-chain',
        }],
      }],
    };
    expect(() => ledgerStore.prepareSupplierInvoicePosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery')).toThrow(/purchase-order and goods-receipt evidence/i);

    revenueSnapshot = {
      ...revenueSnapshot,
      goodsReceipts: [receipt],
    };
    const prepared = ledgerStore.prepareSupplierInvoicePosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery');
    const canonical = prepared.journals.find(({ sourceType }) => sourceType === 'procurement-supplier-invoice');
    if (!canonical) throw new Error('Expected canonical supplier-invoice draft.');
    expect(canonical.sourceId).toBe(invoice.id);
    expect(canonical.lines.map(({ accountCode }) => accountCode)).toEqual([
      'inventory-asset',
      'input-cgst',
      'input-sgst',
      'accounts-payable',
    ]);
    expect(ledgerStore.prepareSupplierInvoicePosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery').journals.filter(({ sourceType }) => sourceType === 'procurement-supplier-invoice')).toHaveLength(1);

    const asset: ManagedAsset = {
      id: 'asset-1', number: 'AST-26-27-00001', assetTag: 'MIX-001', categoryId: 'category-1', name: 'Primary mixing vessel',
      sourceType: 'procurement-evidence', sourceEvidenceReference: receipt.number, acquiredOn: '2026-07-15', availableForUseOn: '2026-07-15', custodyLabel: 'Bengaluru plant', criticality: 'critical', financialStatus: 'unbooked', status: 'in-service', createdBy: 'user-avery', createdAt: '2026-07-15T08:00:00.000Z', submittedBy: 'user-avery', submittedAt: '2026-07-15T08:05:00.000Z', decidedBy: checkerId, decidedAt: '2026-07-15T08:10:00.000Z', decisionRemarks: 'Physical identity verified.', scope, version: 3,
    };
    const capitalisation: AssetCapitalization = {
      id: 'capitalisation-1', number: 'CAP-26-27-00001', assetId: asset.id, supplierInvoiceId: invoice.id, threeWayMatchId: match.id, purchaseOrderId: purchaseOrder.id, goodsReceiptId: receipt.id, capitalizationDate: '2026-07-15', taxableAmount: 100, status: 'approved', requestedBy: 'user-avery', requestedAt: '2026-07-15T08:20:00.000Z', decidedBy: checkerId, decidedAt: '2026-07-15T08:25:00.000Z', decisionRemarks: 'Taxable-cost allocation independently verified.', journalDraftId: 'handoff-capitalisation-1', scope, version: 2,
    };
    const capitalisationSource: AccountingJournalDraft = {
      id: capitalisation.journalDraftId!, sourceType: 'asset-capitalization', sourceId: capitalisation.id, sourceNumber: capitalisation.number, postingDate: capitalisation.capitalizationDate,
      lines: [{ accountCode: 'fixed-assets', debit: 100, credit: 0, memo: capitalisation.number }, { accountCode: 'inventory-asset', debit: 0, credit: 100, memo: capitalisation.number }],
      totalDebit: 100, totalCredit: 100, status: 'ready', checksum: '', version: 1,
    };
    capitalisationSource.checksum = revenueHandoffChecksum(capitalisationSource);
    revenueSnapshot = { ...revenueSnapshot, managedAssets: [asset], assetCapitalizations: [capitalisation], journalDrafts: [source, capitalisationSource] };
    expect(() => ledgerStore.prepareAssetCapitalizationPosting({ journalDraftId: capitalisationSource.id, expectedVersion: 1, expectedChecksum: capitalisationSource.checksum }, 'user-avery')).toThrow(/supplier invoice to be canonically posted first/i);

    expect(ledgerStore.postJournal(canonical.id, canonical.version, checkerId).journals.find(({ id }) => id === canonical.id)?.status).toBe('posted');
    const capitalisationPrepared = ledgerStore.prepareAssetCapitalizationPosting({ journalDraftId: capitalisationSource.id, expectedVersion: 1, expectedChecksum: capitalisationSource.checksum }, 'user-avery');
    const capitalisationJournal = capitalisationPrepared.journals.find(({ sourceType }) => sourceType === 'asset-capitalization');
    expect(capitalisationJournal).toMatchObject({ sourceId: capitalisation.id, sourceNumber: capitalisation.number, status: 'draft' });
    expect(capitalisationJournal?.lines.map(({ accountCode }) => accountCode)).toEqual(['fixed-assets', 'inventory-asset']);

    const policy: AssetDepreciationPolicy = {
      id: 'depreciation-policy-1', number: 'ADP-26-27-00001', categoryId: asset.categoryId, effectiveFrom: '2026-07-01', usefulLifeMonths: 1, residualValuePercent: 0, method: 'straight-line', convention: 'full-month', status: 'approved', requestedBy: 'user-avery', requestedAt: '2026-07-15T08:30:00.000Z', decidedBy: checkerId, decidedAt: '2026-07-15T08:35:00.000Z', decisionRemarks: 'Life and residual independently verified.', scope, version: 2,
    };
    const run: AssetDepreciationRun = {
      id: 'depreciation-run-1', number: 'DEP-26-27-00001', periodStart: '2026-07-01', periodEnd: '2026-07-31', method: 'straight-line', convention: 'full-month', totalDepreciation: 100,
      lines: [{ id: 'depreciation-line-1', assetCapitalizationId: capitalisation.id, assetId: asset.id, policyId: policy.id, serviceMonthIndex: 1, capitalizedCost: 100, residualValue: 0, depreciationAmount: 100 }],
      status: 'approved', requestedBy: 'user-avery', requestedAt: '2026-07-31T08:00:00.000Z', decidedBy: checkerId, decidedAt: '2026-07-31T08:10:00.000Z', decisionRemarks: 'Posted cost and full-month schedule independently verified.', journalDraftId: 'handoff-depreciation-1', scope, version: 2,
    };
    const depreciationSource: AccountingJournalDraft = {
      id: run.journalDraftId!, sourceType: 'asset-depreciation', sourceId: run.id, sourceNumber: run.number, postingDate: run.periodEnd,
      lines: [{ accountCode: 'depreciation-expense', debit: 100, credit: 0, memo: 'DEP-26-27-00001 / 2026-07-31' }, { accountCode: 'accumulated-depreciation', debit: 0, credit: 100, memo: 'DEP-26-27-00001 / 2026-07-31' }],
      totalDebit: 100, totalCredit: 100, status: 'ready', checksum: '', version: 1,
    };
    depreciationSource.checksum = revenueHandoffChecksum(depreciationSource);
    revenueSnapshot = { ...revenueSnapshot, assetDepreciationPolicies: [policy], assetDepreciationRuns: [run], journalDrafts: [source, capitalisationSource, depreciationSource] };
    expect(() => ledgerStore.prepareAssetDepreciationPosting({ journalDraftId: depreciationSource.id, expectedVersion: 1, expectedChecksum: depreciationSource.checksum }, 'user-avery')).toThrow(/posted canonical asset-capitalisation/i);
    ledgerStore.postJournal(capitalisationJournal!.id, capitalisationJournal!.version, checkerId);
    const depreciationPrepared = ledgerStore.prepareAssetDepreciationPosting({ journalDraftId: depreciationSource.id, expectedVersion: 1, expectedChecksum: depreciationSource.checksum }, 'user-avery');
    const depreciationJournal = depreciationPrepared.journals.find(({ sourceType }) => sourceType === 'asset-depreciation');
    expect(depreciationJournal).toMatchObject({ sourceId: run.id, sourceNumber: run.number, status: 'draft' });
    expect(depreciationJournal?.lines.map(({ accountCode }) => accountCode)).toEqual(['depreciation-expense', 'accumulated-depreciation']);
    ledgerStore.postJournal(depreciationJournal!.id, depreciationJournal!.version, checkerId);
    expect(ledgerStore.getAssetCapitalizationBookValue(capitalisation.id)).toEqual({
      capitalizationId: capitalisation.id, grossCost: 100, accumulatedDepreciation: 100, netBookValue: 0, asOfDate: '2026-07-31',
    });

    const retirement: AssetRetirement = {
      id: 'retirement-1', number: 'RET-26-27-00001', assetId: asset.id, capitalizationId: capitalisation.id, retirementDate: '2026-07-31',
      reason: 'Beyond economical repair after engineering condition assessment.', evidenceReference: 'SCRAP-2026-041', grossCost: 100, accumulatedDepreciation: 100, netBookValue: 0,
      status: 'approved', requestedBy: 'user-avery', requestedAt: '2026-07-31T11:00:00.000Z', decidedBy: checkerId, decidedAt: '2026-07-31T11:10:00.000Z', decisionRemarks: 'No-proceeds scope and reconciled book independently verified.', journalDraftId: 'handoff-retirement-1', scope, version: 2,
    };
    const retirementSource: AccountingJournalDraft = {
      id: retirement.journalDraftId!, sourceType: 'asset-retirement', sourceId: retirement.id, sourceNumber: retirement.number, postingDate: retirement.retirementDate,
      lines: [{ accountCode: 'accumulated-depreciation', debit: 100, credit: 0, memo: retirement.number }, { accountCode: 'fixed-assets', debit: 0, credit: 100, memo: retirement.number }],
      totalDebit: 100, totalCredit: 100, status: 'ready', checksum: '', version: 1,
    };
    retirementSource.checksum = revenueHandoffChecksum(retirementSource);
    revenueSnapshot = { ...revenueSnapshot, assetRetirements: [retirement], journalDrafts: [source, capitalisationSource, depreciationSource, retirementSource] };
    const retirementPrepared = ledgerStore.prepareAssetRetirementPosting({ journalDraftId: retirementSource.id, expectedVersion: 1, expectedChecksum: retirementSource.checksum }, 'user-avery');
    const retirementJournal = retirementPrepared.journals.find(({ sourceType }) => sourceType === 'asset-retirement');
    expect(retirementJournal).toMatchObject({ sourceId: retirement.id, sourceNumber: retirement.number, status: 'draft' });
    expect(retirementJournal?.lines.map(({ accountCode }) => accountCode)).toEqual(['accumulated-depreciation', 'fixed-assets']);
    expect(ledgerStore.prepareAssetRetirementPosting({ journalDraftId: retirementSource.id, expectedVersion: 1, expectedChecksum: retirementSource.checksum }, 'user-avery').journals.filter(({ sourceType }) => sourceType === 'asset-retirement')).toHaveLength(1);
    const postedRetirement = ledgerStore.postJournal(retirementJournal!.id, retirementJournal!.version, checkerId);
    expect(postedRetirement.fixedAssetRollforward).toMatchObject({
      capitalizedCost: 100,
      retiredCost: 100,
      manualGrossCostMovement: 0,
      endingGrossCost: 0,
      depreciationCharge: 100,
      retirementAccumulatedDepreciationRelease: 100,
      manualAccumulatedDepreciationMovement: 0,
      endingAccumulatedDepreciation: 0,
      retirementLoss: 0,
      endingNetBookValue: 0,
      sourceJournalCounts: { capitalizations: 1, depreciationRuns: 1, retirements: 1 },
      unlinkedFixedAssetJournalCount: 0,
      reconciliationStatus: 'reconciled',
    });
  });

  it('flags manual fixed-asset control-account movements and removes both sides of a posted reversal pair', async () => {
    const { checkerId } = await bindIndiaBooks();
    const accounts = ledgerStore.getSnapshot().accounts;
    const fixedAssets = accounts.find(({ code }) => code === 'fixed-assets');
    const bankClearing = accounts.find(({ code }) => code === 'bank-clearing');
    if (!fixedAssets || !bankClearing) throw new Error('Expected fixed-assets and bank-clearing accounts.');

    const manualDraft = ledgerStore.createJournal(
      {
        postingDate: '2026-08-01',
        memo: 'Unlinked fixed-asset adjustment for reconciliation control.',
        lines: [
          { accountId: fixedAssets.id, debit: 20, credit: 0, memo: 'Unlinked fixed asset movement', costCenterId: 'cc-ops', projectId: 'project-1' },
          { accountId: bankClearing.id, debit: 0, credit: 20, memo: 'Bank clearing', costCenterId: 'cc-ops' },
        ],
      },
      'user-avery',
    ).journals.find(({ status }) => status === 'draft');
    if (!manualDraft) throw new Error('Expected manual journal draft.');
    const postedManual = ledgerStore.postJournal(manualDraft.id, manualDraft.version, checkerId);
    expect(postedManual.journals.find(({ id }) => id === manualDraft.id)?.lines[0]).toMatchObject({ costCenterId: 'cc-ops', projectId: 'project-1' });
    expect(postedManual.fixedAssetRollforward).toMatchObject({
      manualGrossCostMovement: 20,
      endingGrossCost: 20,
      unlinkedFixedAssetJournalCount: 1,
      reconciliationStatus: 'attention',
    });

    const manualJournal = postedManual.journals.find(({ id }) => id === manualDraft.id);
    if (!manualJournal) throw new Error('Expected posted manual journal.');
    const reversalDraft = ledgerStore.reverseJournal(
      {
        id: manualJournal.id,
        expectedVersion: manualJournal.version,
        postingDate: '2026-08-02',
        reason: 'This adjustment belongs in the governed asset subledger.',
      },
      'user-avery',
    ).journals.find(({ reversesJournalId }) => reversesJournalId === manualJournal.id);
    if (!reversalDraft) throw new Error('Expected reversal draft.');
    const reversed = ledgerStore.postJournal(reversalDraft.id, reversalDraft.version, checkerId);
    expect(reversed.fixedAssetRollforward).toMatchObject({
      manualGrossCostMovement: 0,
      endingGrossCost: 0,
      unlinkedFixedAssetJournalCount: 0,
      reconciliationStatus: 'reconciled',
    });
    const postedReversal = reversed.journals.find(({ id }) => id === reversalDraft.id);
    if (!postedReversal) throw new Error('Expected the posted reversal journal.');
    expect(() => ledgerStore.reverseJournal({
      id: postedReversal.id,
      expectedVersion: postedReversal.version,
      postingDate: '2026-08-03',
      reason: 'Attempt to reverse an already reversing journal.',
    }, 'user-avery')).toThrow(/cannot be reversed again/i);
  });

  it('prepares a reconciled customer receipt exactly once with bound scope and checksum proof', async () => {
    const { companyId, branchId, checkerId } = await bindIndiaBooks();
    const source: AccountingJournalDraft = { id: 'handoff-receipt-1', sourceType: 'payment', sourceId: 'receipt-1', sourceNumber: 'RCPT-26-27-00001', postingDate: '2026-07-15', lines: [{ accountCode: 'bank-clearing', debit: 118, credit: 0, memo: 'Cash received' }, { accountCode: 'accounts-receivable', debit: 0, credit: 100, memo: 'Applied AR' }, { accountCode: 'unapplied-cash', debit: 0, credit: 18, memo: 'Unapplied cash' }], totalDebit: 118, totalCredit: 118, status: 'ready', checksum: '', version: 1 };
    source.checksum = revenueHandoffChecksum(source);
    const receipt: PaymentReceipt = { id: 'receipt-1', number: source.sourceNumber, accountId: 'account-1', receivedAt: '2026-07-15T10:00:00.000Z', method: 'bank-transfer', reference: 'UTR-1', amount: 118, allocations: [{ receivableId: 'receivable-1', amount: 100 }], unappliedAmount: 18, status: 'reconciled', recordedBy: 'user-avery', reconciledBy: checkerId, reconciledAt: '2026-07-15T10:05:00.000Z', scope: { companyId, branchId }, version: 2 };
    revenueSnapshot = { ...revenueSnapshot, paymentReceipts: [receipt], journalDrafts: [source] };
    const prepared = ledgerStore.prepareCashReceiptPosting({ journalDraftId: source.id, expectedVersion: 1, expectedChecksum: source.checksum }, 'user-avery');
    const canonical = prepared.journals.find(({ sourceType }) => sourceType === 'revenue-cash-receipt');
    expect(canonical?.lines.map(({ accountCode }) => accountCode)).toEqual(['bank-clearing', 'accounts-receivable', 'unapplied-cash']);
    expect(ledgerStore.prepareCashReceiptPosting({ journalDraftId: source.id, expectedVersion: 1, expectedChecksum: source.checksum }, 'user-avery').journals.filter(({ sourceType }) => sourceType === 'revenue-cash-receipt')).toHaveLength(1);
    const blockedReadiness = ledgerStore.getSnapshot().closeReadiness?.find(({ periodFrom, periodTo }) => periodFrom <= source.postingDate && periodTo >= source.postingDate);
    expect(blockedReadiness).toMatchObject({ status: 'blocked', sourceHandoffsBlocked: 1, unpostedJournals: 1 });
    expect(ledgerStore.postJournal(canonical!.id, canonical!.version, checkerId).journals.find(({ id }) => id === canonical!.id)?.status).toBe('posted');
    const readyReadiness = ledgerStore.getSnapshot().closeReadiness?.find(({ periodFrom, periodTo }) => periodFrom <= source.postingDate && periodTo >= source.postingDate);
    expect(readyReadiness).toMatchObject({ status: 'ready', sourceHandoffsReady: 1, sourceHandoffsBlocked: 0, unpostedJournals: 0 });
  });

  it('prepares approved write-offs and recognized TDS evidence exactly once in the canonical book', async () => {
    const { companyId, branchId, checkerId } = await bindIndiaBooks();
    const scope = { companyId, branchId };
    const receivable: Receivable = {
      id: 'receivable-writeoff-1', invoiceId: 'invoice-writeoff-1', accountId: 'account-writeoff-1', invoiceNumber: 'INV-WOF-1', invoiceDate: '2026-07-15', dueDate: '2026-07-15', originalAmount: 1000, adjustmentAmount: 0, paidAmount: 0, outstandingAmount: 750, withheldAmount: 0, writtenOffAmount: 250, status: 'partially-paid', scope, version: 2,
    };
    const writeOff: WriteOffRequest = {
      scope, id: 'writeoff-1', number: 'WOF-26-27-00001', receivableId: receivable.id, accountId: receivable.accountId, amount: 250, reason: 'Customer insolvency evidence approved by collections control.', evidenceReference: 'LEGAL-WOF-1', status: 'approved', requestedBy: 'user-avery', requestedAt: '2026-07-15T08:00:00.000Z', decidedBy: checkerId, decidedAt: '2026-07-15T08:10:00.000Z', decisionRemarks: 'Independent write-off approval recorded.', journalId: 'handoff-writeoff-1', version: 2,
    };
    const writeOffSource: AccountingJournalDraft = {
      id: writeOff.journalId!, sourceType: 'write-off', sourceId: writeOff.id, sourceNumber: writeOff.number, postingDate: '2026-07-15', lines: [{ accountCode: 'bad-debt-expense', debit: 250, credit: 0, memo: writeOff.number }, { accountCode: 'accounts-receivable', debit: 0, credit: 250, memo: writeOff.number }], totalDebit: 250, totalCredit: 250, status: 'ready', checksum: '', version: 1,
    };
    writeOffSource.checksum = revenueHandoffChecksum(writeOffSource);
    revenueSnapshot = { ...revenueSnapshot, receivables: [receivable], writeOffRequests: [writeOff], journalDrafts: [writeOffSource] };
    const preparedWriteOff = ledgerStore.prepareWriteOffPosting({ journalDraftId: writeOffSource.id, expectedVersion: 1, expectedChecksum: writeOffSource.checksum }, 'user-avery');
    const writeOffJournal = preparedWriteOff.journals.find(({ sourceType }) => sourceType === 'collections-write-off');
    expect(writeOffJournal).toMatchObject({ sourceId: writeOff.id, status: 'draft' });
    expect(ledgerStore.prepareWriteOffPosting({ journalDraftId: writeOffSource.id, expectedVersion: 1, expectedChecksum: writeOffSource.checksum }, 'user-avery').journals.filter(({ sourceType }) => sourceType === 'collections-write-off')).toHaveLength(1);
    ledgerStore.postJournal(writeOffJournal!.id, writeOffJournal!.version, checkerId);
    expect(ledgerStore.isCanonicalHandoffPosted(writeOffSource)).toBe(true);

    const policy: WithholdingPolicy = {
      scope, id: 'policy-tds-1', code: 'TDS-194J', name: 'Professional services TDS', kind: 'TDS', lawVersion: 'income-tax-act-2025', sectionReference: '393(1)', tableItem: 'Professional services', trigger: 'earlier-credit-payment', ratePercent: 1, thresholdAmount: 100, effectiveFrom: '2026-04-01', sourceUrl: 'https://incometaxindia.gov.in/tds/393', active: true, createdBy: 'user-avery', createdAt: '2026-07-15T08:00:00.000Z', version: 1,
    };
    const withholding: WithholdingEntry = {
      scope, id: 'withholding-1', number: 'TDS-26-27-00001', policyId: policy.id, accountId: receivable.accountId, receivableId: receivable.id, direction: 'customer-deducted-tds', eventDate: '2026-07-15', baseAmount: 1000, ratePercent: 1, taxAmount: 10, counterpartyPan: 'ABCDE1234F', certificateOrChallanReference: undefined, status: 'recognized', journalId: 'handoff-withholding-1', recordedBy: 'user-avery', recordedAt: '2026-07-15T08:00:00.000Z', version: 1,
    };
    const withholdingSource: AccountingJournalDraft = {
      id: withholding.journalId!, sourceType: 'withholding', sourceId: withholding.id, sourceNumber: withholding.number, postingDate: withholding.eventDate, lines: [{ accountCode: 'tds-receivable', debit: 10, credit: 0, memo: withholding.number }, { accountCode: 'accounts-receivable', debit: 0, credit: 10, memo: withholding.number }], totalDebit: 10, totalCredit: 10, status: 'ready', checksum: '', version: 1,
    };
    withholdingSource.checksum = revenueHandoffChecksum(withholdingSource);
    revenueSnapshot = { ...revenueSnapshot, withholdingPolicies: [policy], withholdingEntries: [withholding], journalDrafts: [withholdingSource] };
    const preparedWithholding = ledgerStore.prepareWithholdingPosting({ journalDraftId: withholdingSource.id, expectedVersion: 1, expectedChecksum: withholdingSource.checksum }, 'user-avery');
    const withholdingJournal = preparedWithholding.journals.find(({ sourceType }) => sourceType === 'finance-withholding');
    expect(withholdingJournal).toMatchObject({ sourceId: withholding.id, status: 'draft' });
    ledgerStore.postJournal(withholdingJournal!.id, withholdingJournal!.version, checkerId);
    expect(ledgerStore.isCanonicalHandoffPosted(withholdingSource)).toBe(true);
  });

  it('prepares released treasury payment and bank-charge evidence exactly once in the canonical book', async () => {
    const { companyId, branchId, checkerId } = await bindIndiaBooks();
    const scope = { companyId, branchId };
    const bank: BankAccountControl = { id: 'bank-treasury-1', code: 'HDFC-001', name: 'HDFC operating account', bankName: 'HDFC Bank', maskedAccountNumber: 'XXXX1234', ifsc: 'HDFC0000001', currency: 'INR', active: true, createdAt: '2026-07-15T08:00:00.000Z', scope, version: 1 };
    const supplier: Supplier = { id: 'supplier-treasury-1', code: 'SUP-001', legalName: 'Treasury Supplier Private Limited', stateCode: '29', email: 'ap@supplier.example', paymentTermDays: 30, categories: ['services'], status: 'approved', riskRating: 'low', qualificationEvidence: 'KYC-TREASURY-1', requestedBy: 'user-avery', requestedAt: '2026-07-15T08:00:00.000Z', decidedBy: checkerId, decidedAt: '2026-07-15T08:10:00.000Z', scope, version: 2 };
    const supplierInvoice: SupplierInvoice = { id: 'supplier-invoice-treasury-1', number: 'PINV-26-27-00001', supplierId: supplier.id, purchaseOrderId: 'po-treasury-1', goodsReceiptId: 'grn-treasury-1', supplierInvoiceNumber: 'SUP-INV-1', invoiceDate: '2026-07-15', lines: [], totalAmount: 500, recordedBy: 'user-avery', recordedAt: '2026-07-15T08:00:00.000Z', scope, version: 1 };
    const paymentSource: AccountingJournalDraft = { id: 'handoff-treasury-payment-1', sourceType: 'treasury-payment', sourceId: 'payment-treasury-1', sourceNumber: 'PAY-26-27-00001', postingDate: '2026-07-15', lines: [{ accountCode: 'accounts-payable', debit: 500, credit: 0, memo: 'PAY-26-27-00001' }, { accountCode: 'cash-at-bank', debit: 0, credit: 500, memo: 'BANK-PAY-1' }], totalDebit: 500, totalCredit: 500, status: 'ready', checksum: '', version: 1 };
    paymentSource.checksum = revenueHandoffChecksum(paymentSource);
    const proposal: PaymentProposal = { id: paymentSource.sourceId, number: paymentSource.sourceNumber, supplierInvoiceId: supplierInvoice.id, supplierId: supplier.id, bankAccountId: bank.id, paymentDate: paymentSource.postingDate, amount: 500, paymentReference: 'UTR-PAY-1', purpose: 'Supplier settlement', status: 'released', requestedBy: 'user-avery', requestedAt: '2026-07-15T08:00:00.000Z', approvedBy: checkerId, approvedAt: '2026-07-15T08:10:00.000Z', releasedBy: checkerId, releasedAt: '2026-07-15T08:20:00.000Z', bankReleaseReference: 'BANK-PAY-1', journalId: paymentSource.id, version: 2, scope };
    const chargeSource: AccountingJournalDraft = { id: 'handoff-bank-charge-1', sourceType: 'bank-charge', sourceId: 'bank-charge-1', sourceNumber: 'BCH-26-27-00001', postingDate: '2026-07-15', lines: [{ accountCode: 'bank-charges-expense', debit: 90, credit: 0, memo: 'BCH-26-27-00001' }, { accountCode: 'input-igst', debit: 10, credit: 0, memo: 'BCH-26-27-00001 tax' }, { accountCode: 'cash-at-bank', debit: 0, credit: 100, memo: 'BANK-CHARGE-1' }], totalDebit: 100, totalCredit: 100, status: 'ready', checksum: '', version: 1 };
    chargeSource.checksum = revenueHandoffChecksum(chargeSource);
    const charge: BankCharge = { id: chargeSource.sourceId, number: chargeSource.sourceNumber, bankAccountId: bank.id, chargeDate: chargeSource.postingDate, category: 'transaction-fee', amount: 100, taxAmount: 10, reference: 'BANK-CHARGE-1', status: 'reconciled', recordedBy: 'user-avery', recordedAt: '2026-07-15T08:00:00.000Z', reconciledBy: checkerId, reconciledAt: '2026-07-15T08:10:00.000Z', journalId: chargeSource.id, version: 2, scope };
    revenueSnapshot = { ...revenueSnapshot, bankAccounts: [bank], suppliers: [supplier], supplierInvoices: [supplierInvoice], paymentProposals: [proposal], bankCharges: [charge], journalDrafts: [paymentSource, chargeSource] };
    const prepared = ledgerStore.prepareTreasuryPosting({ journalDraftId: paymentSource.id, expectedVersion: 1, expectedChecksum: paymentSource.checksum }, 'user-avery');
    const paymentJournal = prepared.journals.find(({ sourceType }) => sourceType === 'treasury-payment');
    expect(paymentJournal).toMatchObject({ sourceId: paymentSource.sourceId, status: 'draft' });
    expect(ledgerStore.prepareTreasuryPosting({ journalDraftId: paymentSource.id, expectedVersion: 1, expectedChecksum: paymentSource.checksum }, 'user-avery').journals.filter(({ sourceType }) => sourceType === 'treasury-payment')).toHaveLength(1);
    ledgerStore.postJournal(paymentJournal!.id, paymentJournal!.version, checkerId);
    expect(ledgerStore.isCanonicalHandoffPosted(paymentSource)).toBe(true);
    const preparedCharge = ledgerStore.prepareTreasuryPosting({ journalDraftId: chargeSource.id, expectedVersion: 1, expectedChecksum: chargeSource.checksum }, 'user-avery');
    const chargeJournal = preparedCharge.journals.find(({ sourceType }) => sourceType === 'treasury-bank-charge');
    expect(chargeJournal?.lines.map(({ accountCode }) => accountCode)).toEqual(['bank-charges-expense', 'input-igst', 'cash-at-bank']);
    ledgerStore.postJournal(chargeJournal!.id, chargeJournal!.version, checkerId);
    expect(ledgerStore.isCanonicalHandoffPosted(chargeSource)).toBe(true);
  });

  it('prepares production issue and output evidence exactly once in canonical inventory/WIP', async () => {
    const { companyId, branchId, checkerId } = await bindIndiaBooks();
    const scope = { companyId, branchId };
    const order = { id: 'wo-ledger-1', number: 'WO-26-27-00001', outputVariantId: 'variant-output-1', scope } as unknown as WorkOrder;
    const issueSource: AccountingJournalDraft = { id: 'handoff-production-issue-1', sourceType: 'production-issue', sourceId: 'pmi-ledger-1', sourceNumber: 'PMI-26-27-00001', postingDate: '2026-07-15', lines: [{ accountCode: 'work-in-progress', debit: 80, credit: 0, memo: order.number }, { accountCode: 'inventory-asset', debit: 0, credit: 80, memo: order.number }], totalDebit: 80, totalCredit: 80, status: 'ready', checksum: '', version: 1 };
    issueSource.checksum = revenueHandoffChecksum(issueSource);
    const issue = { id: issueSource.sourceId, number: issueSource.sourceNumber, workOrderId: order.id, totalCost: 80, journalId: issueSource.id, issuedAt: '2026-07-15T10:00:00.000Z', scope } as unknown as ProductionMaterialIssue;
    const outputSource: AccountingJournalDraft = { id: 'handoff-production-output-1', sourceType: 'production-output', sourceId: 'prod-ledger-1', sourceNumber: 'PROD-26-27-00001', postingDate: '2026-07-15', lines: [{ accountCode: 'inventory-asset', debit: 100, credit: 0, memo: order.number }, { accountCode: 'work-in-progress', debit: 0, credit: 100, memo: order.number }], totalDebit: 100, totalCredit: 100, status: 'ready', checksum: '', version: 1 };
    outputSource.checksum = revenueHandoffChecksum(outputSource);
    const output = { id: outputSource.sourceId, number: outputSource.sourceNumber, workOrderId: order.id, itemVariantId: order.outputVariantId, materialCost: 80, operationCost: 20, journalId: outputSource.id, recordedAt: '2026-07-15T11:00:00.000Z', scope } as unknown as ProductionOutput;
    revenueSnapshot = { ...revenueSnapshot, workOrders: [order], productionMaterialIssues: [issue], productionOutputs: [output], journalDrafts: [issueSource, outputSource] };
    const preparedIssue = ledgerStore.prepareManufacturingPosting({ journalDraftId: issueSource.id, expectedVersion: 1, expectedChecksum: issueSource.checksum }, 'user-avery');
    const issueJournal = preparedIssue.journals.find(({ sourceType }) => sourceType === 'manufacturing-production-issue');
    expect(issueJournal).toMatchObject({ sourceId: issueSource.sourceId, status: 'draft' });
    expect(ledgerStore.prepareManufacturingPosting({ journalDraftId: issueSource.id, expectedVersion: 1, expectedChecksum: issueSource.checksum }, 'user-avery').journals.filter(({ sourceType }) => sourceType === 'manufacturing-production-issue')).toHaveLength(1);
    ledgerStore.postJournal(issueJournal!.id, issueJournal!.version, checkerId);
    expect(ledgerStore.isCanonicalHandoffPosted(issueSource)).toBe(true);
    const preparedOutput = ledgerStore.prepareManufacturingPosting({ journalDraftId: outputSource.id, expectedVersion: 1, expectedChecksum: outputSource.checksum }, 'user-avery');
    const outputJournal = preparedOutput.journals.find(({ sourceType }) => sourceType === 'manufacturing-production-output');
    expect(outputJournal?.lines.map(({ accountCode }) => accountCode)).toEqual(['inventory-asset', 'work-in-progress']);
    ledgerStore.postJournal(outputJournal!.id, outputJournal!.version, checkerId);
    expect(ledgerStore.isCanonicalHandoffPosted(outputSource)).toBe(true);
  });

  it('prepares approved landed-cost evidence exactly once in canonical inventory valuation', async () => {
    const { companyId, branchId, checkerId } = await bindIndiaBooks();
    const scope = { companyId, branchId };
    const receipt = { id: 'grn-landed-1', number: 'GRN-26-27-00001', receivedAt: '2026-07-15', status: 'costed', scope } as unknown as GoodsReceipt;
    const allocation: LandedCostAllocation = { id: 'lca-1', number: 'LCA-26-27-00001', goodsReceiptId: receipt.id, basis: 'value', charges: [{ description: 'Freight', amount: 60 }], totalAmount: 60, allocations: [{ goodsReceiptLineId: 'grn-line-1', amount: 60, adjustedUnitCost: 1060 }], status: 'approved', requestedBy: 'user-avery', requestedAt: '2026-07-15T08:00:00.000Z', decidedBy: checkerId, decidedAt: '2026-07-15T08:10:00.000Z', decisionRemarks: 'Cost allocation approved.', scope, version: 2 };
    const source: AccountingJournalDraft = { id: 'handoff-landed-1', sourceType: 'landed-cost', sourceId: allocation.id, sourceNumber: allocation.number, postingDate: '2026-07-15', lines: [{ accountCode: 'inventory-asset', debit: 60, credit: 0, memo: allocation.number }, { accountCode: 'landed-cost-clearing', debit: 0, credit: 60, memo: allocation.number }], totalDebit: 60, totalCredit: 60, status: 'ready', checksum: '', version: 1 };
    source.checksum = revenueHandoffChecksum(source);
    revenueSnapshot = { ...revenueSnapshot, goodsReceipts: [receipt], landedCostAllocations: [allocation], journalDrafts: [source] };
    const prepared = ledgerStore.prepareLandedCostPosting({ journalDraftId: source.id, expectedVersion: 1, expectedChecksum: source.checksum }, 'user-avery');
    const journal = prepared.journals.find(({ sourceType }) => sourceType === 'procurement-landed-cost');
    expect(journal).toMatchObject({ sourceId: allocation.id, status: 'draft' });
    expect(ledgerStore.prepareLandedCostPosting({ journalDraftId: source.id, expectedVersion: 1, expectedChecksum: source.checksum }, 'user-avery').journals.filter(({ sourceType }) => sourceType === 'procurement-landed-cost')).toHaveLength(1);
    ledgerStore.postJournal(journal!.id, journal!.version, checkerId);
    expect(ledgerStore.isCanonicalHandoffPosted(source)).toBe(true);
  });

  it('prepares finalized payroll and reimbursed expense evidence exactly once', async () => {
    const { companyId, branchId, checkerId } = await bindIndiaBooks();
    const scope = { companyId, branchId };
    const run = { id: 'payroll-ledger-1', number: 'PAYRUN-26-27-00001', paymentDate: '2026-07-15', totalGrossPay: 1000, totalEmployeeDeductions: 100, totalEmployerContributions: 200, totalNetPay: 900, status: 'finalized', journalDraftId: 'handoff-payroll-1', scope } as unknown as PayrollRun;
    const payrollSource: AccountingJournalDraft = { id: run.journalDraftId!, sourceType: 'payroll-finalization', sourceId: run.id, sourceNumber: run.number, postingDate: run.paymentDate, lines: [{ accountCode: 'payroll-expense', debit: 1000, credit: 0, memo: run.number }, { accountCode: 'employer-contribution-expense', debit: 200, credit: 0, memo: run.number }, { accountCode: 'payroll-payable', debit: 0, credit: 900, memo: run.number }, { accountCode: 'statutory-payable', debit: 0, credit: 300, memo: run.number }], totalDebit: 1200, totalCredit: 1200, status: 'ready', checksum: '', version: 1 };
    payrollSource.checksum = revenueHandoffChecksum(payrollSource);
    const expense = { id: 'expense-ledger-1', number: 'EXP-26-27-00001', amount: 75, status: 'reimbursed', journalDraftId: 'handoff-expense-1', scope } as unknown as ExpenseClaim;
    const expenseSource: AccountingJournalDraft = { id: expense.journalDraftId!, sourceType: 'expense-reimbursement', sourceId: expense.id, sourceNumber: expense.number, postingDate: '2026-07-15', lines: [{ accountCode: 'employee-expense', debit: 75, credit: 0, memo: expense.number }, { accountCode: 'cash-at-bank', debit: 0, credit: 75, memo: expense.number }], totalDebit: 75, totalCredit: 75, status: 'ready', checksum: '', version: 1 };
    expenseSource.checksum = revenueHandoffChecksum(expenseSource);
    revenueSnapshot = { ...revenueSnapshot, payrollRuns: [run], expenseClaims: [expense], journalDrafts: [payrollSource, expenseSource] };
    const preparedPayroll = ledgerStore.preparePeoplePosting({ journalDraftId: payrollSource.id, expectedVersion: 1, expectedChecksum: payrollSource.checksum }, 'user-avery');
    const payrollJournal = preparedPayroll.journals.find(({ sourceType }) => sourceType === 'people-payroll-finalization');
    expect(payrollJournal).toMatchObject({ sourceId: run.id, status: 'draft' });
    ledgerStore.postJournal(payrollJournal!.id, payrollJournal!.version, checkerId);
    expect(ledgerStore.isCanonicalHandoffPosted(payrollSource)).toBe(true);
    const preparedExpense = ledgerStore.preparePeoplePosting({ journalDraftId: expenseSource.id, expectedVersion: 1, expectedChecksum: expenseSource.checksum }, 'user-avery');
    const expenseJournal = preparedExpense.journals.find(({ sourceType }) => sourceType === 'people-expense-reimbursement');
    expect(expenseJournal?.lines.map(({ accountCode }) => accountCode)).toEqual(['employee-expense', 'cash-at-bank']);
    ledgerStore.postJournal(expenseJournal!.id, expenseJournal!.version, checkerId);
    expect(ledgerStore.isCanonicalHandoffPosted(expenseSource)).toBe(true);
  });

  it('prepares a released retail commission payout exactly once with batch and bank evidence', async () => {
    const { companyId, branchId, checkerId } = await bindIndiaBooks();
    const scope = { companyId, branchId };
    const batch: RetailCommissionPayoutBatch = {
      id: 'commission-batch-ledger-1', number: 'PAYB-26-27-00001', commissionIds: ['commission-ledger-1'], payoutDate: '2026-07-15', totalAmount: 250,
      notes: 'July store incentives', status: 'released', submittedBy: 'finance-maker', submittedAt: '2026-07-15T08:00:00.000Z', approvedBy: 'finance-checker', approvedAt: '2026-07-15T08:10:00.000Z', releasedBy: 'treasury-releaser', releasedAt: '2026-07-15T08:20:00.000Z', releaseReference: 'BANK-COMM-001', journalDraftId: 'handoff-commission-payout-1', scope, version: 3,
    };
    const commission = { id: 'commission-ledger-1', saleId: 'sale-ledger-1', salespersonUserId: 'associate-1', basisAmount: 5000, ratePercent: 5, commissionAmount: 250, status: 'paid', payoutReference: 'BANK-COMM-001 / PAYB-26-27-00001', payoutBatchId: batch.id, scope, version: 4 } as unknown as RetailSalesCommission;
    const source: AccountingJournalDraft = {
      id: batch.journalDraftId!, sourceType: 'retail-commission-payout', sourceId: batch.id, sourceNumber: batch.number, postingDate: batch.payoutDate,
      lines: [{ accountCode: 'employee-expense', debit: 250, credit: 0, memo: 'PAYB-26-27-00001 commission expense' }, { accountCode: 'cash-at-bank', debit: 0, credit: 250, memo: 'PAYB-26-27-00001 paid BANK-COMM-001' }],
      totalDebit: 250, totalCredit: 250, status: 'ready', externalReference: batch.releaseReference, checksum: '', version: 1,
    };
    source.checksum = revenueHandoffChecksum(source);
    revenueSnapshot = { ...revenueSnapshot, retailCommissionPayoutBatches: [batch], retailSalesCommissions: [commission], journalDrafts: [source] };
    const prepared = ledgerStore.prepareRetailCommissionPayoutPosting({ journalDraftId: source.id, expectedVersion: 1, expectedChecksum: source.checksum }, 'user-avery');
    const journal = prepared.journals.find(({ sourceType }) => sourceType === 'retail-commission-payout');
    expect(journal).toMatchObject({ sourceId: batch.id, sourceNumber: batch.number, status: 'draft', totalDebit: 250, totalCredit: 250 });
    expect(ledgerStore.prepareRetailCommissionPayoutPosting({ journalDraftId: source.id, expectedVersion: 1, expectedChecksum: source.checksum }, 'user-avery').journals.filter(({ sourceType }) => sourceType === 'retail-commission-payout')).toHaveLength(1);
    ledgerStore.postJournal(journal!.id, journal!.version, checkerId);
    expect(ledgerStore.isCanonicalHandoffPosted(source)).toBe(true);
  });

  it('prepares one independently approved project-recognition event with scope, claim, checksum, and replay proof', async () => {
    const { companyId, branchId, checkerId } = await bindIndiaBooks();
    const scope = { companyId, branchId };
    const source: AccountingJournalDraft = {
      id: 'handoff-project-recognition-1',
      sourceType: 'revenue-recognition',
      sourceId: 'billing-claim-1',
      sourceNumber: 'RRE-26-27-00001',
      postingDate: '2026-07-31',
      lines: [
        { accountCode: 'unbilled-revenue', debit: 8000, credit: 0, memo: 'Approved project revenue recognition' },
        { accountCode: 'sales-revenue', debit: 0, credit: 8000, memo: 'Approved project revenue recognition' },
      ],
      totalDebit: 8000,
      totalCredit: 8000,
      status: 'ready',
      checksum: '',
      version: 1,
    };
    source.checksum = revenueHandoffChecksum(source);
    const plan: ProjectBillingPlan = {
      id: 'billing-plan-1',
      number: 'BPL-26-27-00001',
      projectId: 'project-1',
      salesOrderId: 'sales-order-1',
      salesOrderLineId: 'sales-order-line-1',
      billingModel: 'time-and-materials',
      billRate: 1000,
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-09-30',
      status: 'active',
      requestedBy: 'user-avery',
      requestedAt: '2026-07-01T08:00:00.000Z',
      decidedBy: checkerId,
      decidedAt: '2026-07-01T09:00:00.000Z',
      decisionRemarks: 'Commercial review approved the project billing plan.',
      scope,
      version: 2,
    };
    const claim: ProjectBillingClaim = {
      id: source.sourceId,
      number: 'BCL-26-27-00001',
      planId: plan.id,
      projectId: plan.projectId,
      salesOrderId: plan.salesOrderId,
      salesOrderLineId: plan.salesOrderLineId,
      billingPeriodFrom: '2026-07-01',
      billingPeriodTo: source.postingDate,
      timeEntryIds: ['time-entry-1'],
      milestoneIds: [],
      recognizedAmount: 8000,
      status: 'recognized',
      requestedBy: 'user-avery',
      requestedAt: '2026-07-31T08:00:00.000Z',
      recognizedBy: checkerId,
      recognizedAt: '2026-07-31T09:00:00.000Z',
      recognitionRemarks: 'Independent finance approval confirms the billable delivery evidence.',
      recognitionEventId: 'recognition-event-1',
      scope,
      version: 2,
    };
    const event: RevenueRecognitionEvent = {
      id: claim.recognitionEventId!,
      number: source.sourceNumber,
      claimId: claim.id,
      projectId: claim.projectId,
      recognitionDate: source.postingDate,
      amount: claim.recognizedAmount,
      journalDraftId: source.id,
      recognizedBy: checkerId,
      recognizedAt: claim.recognizedAt!,
      scope,
      version: 1,
    };
    const project: DeliveryProject = {
      id: plan.projectId,
      number: 'PRJ-26-27-00001',
      accountId: 'account-northstar',
      salesOrderId: plan.salesOrderId,
      name: 'Northstar implementation',
      deliveryModel: 'time-and-materials',
      budgetAmount: 250000,
      plannedHours: 250,
      startDate: '2026-07-01',
      targetDate: '2026-09-30',
      managerUserId: 'user-avery',
      status: 'active',
      requestedBy: 'user-avery',
      requestedAt: '2026-07-01T08:00:00.000Z',
      decidedBy: checkerId,
      decidedAt: '2026-07-01T09:00:00.000Z',
      decisionRemarks: 'Project charter independently activated.',
      scope,
      version: 2,
    };
    revenueSnapshot = {
      ...revenueSnapshot,
      projectBillingPlans: [plan],
      projectBillingClaims: [claim],
      revenueRecognitionEvents: [{ ...event, scope: { companyId, branchId: 'branch-outside-bound-scope' } }],
      deliveryProjects: [project],
      journalDrafts: [source],
    };

    expect(() => ledgerStore.prepareProjectRevenueRecognitionPosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery')).toThrow(/bound company and branch/i);

    revenueSnapshot = {
      ...revenueSnapshot,
      revenueRecognitionEvents: [{ ...event, amount: 7999 }],
    };
    expect(() => ledgerStore.prepareProjectRevenueRecognitionPosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery')).toThrow(/event amount does not match/i);

    revenueSnapshot = {
      ...revenueSnapshot,
      revenueRecognitionEvents: [event],
    };
    const prepared = ledgerStore.prepareProjectRevenueRecognitionPosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery');
    const canonical = prepared.journals.find(({ sourceType }) => sourceType === 'project-revenue-recognition');
    if (!canonical) throw new Error('Expected canonical project-recognition draft.');
    expect(canonical.sourceId).toBe(claim.id);
    expect(canonical.lines.map(({ accountCode }) => accountCode)).toEqual([
      'unbilled-revenue',
      'sales-revenue',
    ]);
    expect(ledgerStore.hasCanonicalSourcePosting('project-revenue-recognition', claim.id)).toBe(true);
    expect(ledgerStore.prepareProjectRevenueRecognitionPosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery').journals.filter(({ sourceType }) => sourceType === 'project-revenue-recognition')).toHaveLength(1);
    expect(ledgerStore.postJournal(canonical.id, canonical.version, checkerId).journals.find(({ id }) => id === canonical.id)?.status).toBe('posted');
  });

  it('requires project recognition to be canonically posted before an invoice clears unbilled revenue', async () => {
    const { companyId, branchId, checkerId } = await bindIndiaBooks();
    const scope = { companyId, branchId };
    const { source, plan, claim, event, project } = projectRecognitionEvidence(scope, checkerId);
    const invoiceSource: AccountingJournalDraft = {
      id: 'handoff-project-invoice-sequence',
      sourceType: 'invoice',
      sourceId: 'invoice-project-sequence',
      sourceNumber: 'INV-26-27-02009',
      postingDate: '2026-08-01',
      lines: [
        { accountCode: 'accounts-receivable', debit: 8000, credit: 0, memo: 'Project invoice receivable' },
        { accountCode: 'unbilled-revenue', debit: 0, credit: 8000, memo: 'Clear recognized project revenue' },
      ],
      totalDebit: 8000,
      totalCredit: 8000,
      status: 'ready',
      checksum: '',
      version: 1,
    };
    invoiceSource.checksum = revenueHandoffChecksum(invoiceSource);
    const invoice: TaxInvoice = {
      ...issuedInvoiceFor(invoiceSource, scope),
      salesOrderId: plan.salesOrderId,
      documentKind: 'bill-of-supply',
      projectBillingClaimIds: [claim.id],
      lines: [{
        id: 'invoice-line-project-sequence',
        productInterestId: 'interest-project-sequence',
        description: 'Approved project delivery services',
        hsnSac: '998314',
        quantity: 1,
        unitPrice: 8000,
        taxableValue: 8000,
        gstRate: 0,
      }],
      subtotal: 8000,
      discountTotal: 0,
      taxPreview: {
        treatment: 'intra-state',
        taxableValue: 8000,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalTax: 0,
        grandTotal: 8000,
        determination: 'commercial-estimate',
      },
      amountDue: 8000,
    };
    revenueSnapshot = {
      ...revenueSnapshot,
      invoices: [invoice],
      projectBillingPlans: [plan],
      projectBillingClaims: [claim],
      revenueRecognitionEvents: [event],
      deliveryProjects: [project],
      journalDrafts: [invoiceSource, source],
    };

    expect(() => ledgerStore.prepareRevenueInvoicePosting({
      journalDraftId: invoiceSource.id,
      expectedVersion: invoiceSource.version,
      expectedChecksum: invoiceSource.checksum,
    }, 'user-avery')).toThrow(/recognition journal is canonically posted/i);

    const recognitionDraft = ledgerStore.prepareProjectRevenueRecognitionPosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery').journals.find(({ sourceType }) => sourceType === 'project-revenue-recognition');
    if (!recognitionDraft) throw new Error('Expected project-recognition canonical draft.');

    expect(() => ledgerStore.prepareRevenueInvoicePosting({
      journalDraftId: invoiceSource.id,
      expectedVersion: invoiceSource.version,
      expectedChecksum: invoiceSource.checksum,
    }, 'user-avery')).toThrow(/recognition journal is canonically posted/i);

    ledgerStore.postJournal(recognitionDraft.id, recognitionDraft.version, checkerId);
    const preparedInvoice = ledgerStore.prepareRevenueInvoicePosting({
      journalDraftId: invoiceSource.id,
      expectedVersion: invoiceSource.version,
      expectedChecksum: invoiceSource.checksum,
    }, 'user-avery').journals.find(({ sourceType }) => sourceType === 'revenue-invoice');
    expect(preparedInvoice?.lines.map(({ accountCode }) => accountCode)).toEqual([
      'accounts-receivable',
      'unbilled-revenue',
    ]);
  });

  it('binds the supplied India-first demo company to canonical books', () => {
    const initial = ledgerStore.getSnapshot();
    expect(initial.status).toBe('binding-required');
    expect(initial.blockingReason).toContain('Bind the India operating profile');

    const bound = ledgerStore.bindCompany(
      { companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' },
      'user-avery',
    );
    expect(bound.status).toBe('ready');
    expect(bound.binding).toMatchObject({ currencyCode: 'INR' });
  });

  it('seeds a scoped chart and posts only balanced maker-checker journals', async () => {
    const { checkerId } = await bindIndiaBooks();
    const bound = ledgerStore.getSnapshot();
    expect(bound.status).toBe('ready');
    expect(bound.accounts.some(({ code }) => code === 'accounts-receivable')).toBe(true);
    expect(bound.accounts.some(({ code }) => code === 'sales-revenue')).toBe(true);

    const receivable = bound.accounts.find(({ code }) => code === 'accounts-receivable');
    const revenue = bound.accounts.find(({ code }) => code === 'sales-revenue');
    if (!receivable || !revenue) throw new Error('Expected canonical AR and revenue accounts.');

    expect(() =>
      ledgerStore.createJournal(
        {
          postingDate: '2026-07-15',
          memo: 'Unbalanced commercial posting',
          lines: [
            { accountId: receivable.id, debit: 100.01, credit: 0, memo: 'AR' },
            { accountId: revenue.id, debit: 0, credit: 100, memo: 'Revenue' },
          ],
        },
        'user-avery',
      ),
    ).toThrow(/balance exactly/i);

    const drafted = ledgerStore.createJournal(
      {
        postingDate: '2026-07-15',
        memo: 'Certified AR revenue handoff',
        lines: [
          { accountId: receivable.id, debit: 100.01, credit: 0, memo: 'Customer receivable' },
          { accountId: revenue.id, debit: 0, credit: 100.01, memo: 'Recognized revenue' },
        ],
      },
      'user-avery',
    );
    const draft = drafted.journals.find(({ status }) => status === 'draft');
    if (!draft) throw new Error('Expected draft journal.');
    expect(draft.number).toMatch(/^GL-FY2026-27-00001$/);

    expect(() => ledgerStore.postJournal(draft.id, draft.version, 'user-avery')).toThrow(
      /maker cannot post/i,
    );

    const postedSnapshot = ledgerStore.postJournal(
      draft.id,
      draft.version,
      checkerId,
    );
    const posted = postedSnapshot.journals.find(({ id }) => id === draft.id);
    if (!posted) throw new Error('Expected posted journal.');
    expect(posted.status).toBe('posted');
    expect(posted.totalDebit).toBe(100.01);
    expect(posted.previousHash).toBe('0'.repeat(64));
    expect(posted.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(postedSnapshot.totals.debit).toBe(100.01);
    expect(postedSnapshot.totals.credit).toBe(100.01);
    expect(postedSnapshot.integrityVerified).toBe(true);
  });

  it('creates a separate immutable reversal and returns the trial balance to zero', async () => {
    const { checkerId } = await bindIndiaBooks();
    const bound = ledgerStore.getSnapshot();
    const receivable = bound.accounts.find(({ code }) => code === 'accounts-receivable');
    const revenue = bound.accounts.find(({ code }) => code === 'sales-revenue');
    if (!receivable || !revenue) throw new Error('Expected accounts.');

    const created = ledgerStore.createJournal(
      {
        postingDate: '2026-07-15',
        memo: 'Original revenue entry',
        lines: [
          { accountId: receivable.id, debit: 250, credit: 0, memo: 'AR' },
          { accountId: revenue.id, debit: 0, credit: 250, memo: 'Revenue' },
        ],
      },
      'user-avery',
    );
    const draft = created.journals.find(({ status }) => status === 'draft');
    if (!draft) throw new Error('Expected draft.');
    const posted = ledgerStore
      .postJournal(draft.id, draft.version, checkerId)
      .journals.find(({ id }) => id === draft.id);
    if (!posted) throw new Error('Expected posted journal.');

    const reversalDraft = ledgerStore.reverseJournal(
      {
        id: posted.id,
        expectedVersion: posted.version,
        postingDate: '2026-07-16',
        reason: 'Customer contract was rescinded.',
      },
      'user-avery',
    ).journals.find(({ reversesJournalId }) => reversesJournalId === posted.id);
    if (!reversalDraft) throw new Error('Expected reversal draft.');
    expect(reversalDraft.status).toBe('draft');
    expect(reversalDraft.totalDebit).toBe(250);

    const reversed = ledgerStore.postJournal(
      reversalDraft.id,
      reversalDraft.version,
      checkerId,
    );
    expect(reversed.integrityVerified).toBe(true);
    expect(reversed.totals.debit).toBe(500);
    expect(reversed.totals.credit).toBe(500);
    expect(
      reversed.trialBalance.find(({ accountCode }) => accountCode === 'accounts-receivable')?.balance,
    ).toBe(0);
    expect(
      reversed.trialBalance.find(({ accountCode }) => accountCode === 'sales-revenue')?.balance,
    ).toBe(0);
    expect(() =>
      ledgerStore.reverseJournal(
        {
          id: posted.id,
          expectedVersion: posted.version,
          postingDate: '2026-07-16',
          reason: 'Duplicate reversal attempt.',
        },
        'user-avery',
      ),
    ).toThrow(/already has a reversal/i);
  });

  it('prepares an issued Revenue Ledger invoice exactly once with source checksum replay protection', async () => {
    const { companyId, branchId, checkerId } = await bindIndiaBooks();
    const source: AccountingJournalDraft = {
      id: 'handoff-invoice-1001',
      sourceType: 'invoice',
      sourceId: 'invoice-1001',
      sourceNumber: 'INV-26-27-01001',
      postingDate: '2026-07-15',
      lines: [
        { accountCode: 'accounts-receivable', debit: 118, credit: 0, memo: 'Invoice receivable' },
        { accountCode: 'sales-revenue', debit: 0, credit: 100, memo: 'Taxable revenue' },
        { accountCode: 'output-cgst', debit: 0, credit: 9, memo: 'CGST' },
        { accountCode: 'output-sgst', debit: 0, credit: 9, memo: 'SGST' },
      ],
      totalDebit: 118,
      totalCredit: 118,
      status: 'ready',
      checksum: '',
      version: 1,
    };
    source.checksum = revenueHandoffChecksum(source);
    const invoice = issuedInvoiceFor(source, { companyId, branchId });
    revenueSnapshot = {
      ...revenueSnapshot,
      invoices: [invoice],
      journalDrafts: [source],
    };

    revenueSnapshot = {
      ...revenueSnapshot,
      invoices: [{ ...invoice, scope: { companyId, branchId: 'branch-outside-bound-scope' } }],
    };
    expect(() => ledgerStore.prepareRevenueInvoicePosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery')).toThrow(/bound company and branch/i);
    revenueSnapshot = { ...revenueSnapshot, invoices: [invoice] };

    expect(() => ledgerStore.prepareRevenueInvoicePosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: 'f'.repeat(64),
    }, 'user-avery')).toThrow(/changed/i);

    const prepared = ledgerStore.prepareRevenueInvoicePosting(
      {
        journalDraftId: source.id,
        expectedVersion: source.version,
        expectedChecksum: source.checksum,
      },
      'user-avery',
    );
    const canonical = prepared.journals.find(
      ({ sourceType }) => sourceType === 'revenue-invoice',
    );
    if (!canonical) throw new Error('Expected canonical revenue invoice draft.');
    expect(ledgerStore.hasCanonicalRevenueInvoicePosting(source.sourceId)).toBe(true);
    expect(ledgerStore.isCanonicalHandoffPosted(source)).toBe(false);
    expect(canonical.kind).toBe('source');
    expect(canonical.status).toBe('draft');
    expect(canonical.totalDebit).toBe(118);
    expect(canonical.lines.map(({ accountCode }) => accountCode)).toEqual([
      'accounts-receivable',
      'sales-revenue',
      'output-cgst',
      'output-sgst',
    ]);

    const replayed = ledgerStore.prepareRevenueInvoicePosting(
      {
        journalDraftId: source.id,
        expectedVersion: source.version,
        expectedChecksum: source.checksum,
      },
      'user-avery',
    );
    expect(
      replayed.journals.filter(({ sourceType }) => sourceType === 'revenue-invoice'),
    ).toHaveLength(1);
    expect(
      ledgerStore.postJournal(canonical.id, canonical.version, checkerId).journals.find(
        ({ id }) => id === canonical.id,
      )?.status,
    ).toBe('posted');
    expect(ledgerStore.isCanonicalHandoffPosted(source)).toBe(true);

    revenueSnapshot = {
      ...revenueSnapshot,
      journalDrafts: [{ ...source, checksum: 'f'.repeat(64) }],
    };
    expect(() =>
      ledgerStore.prepareRevenueInvoicePosting(
        {
          journalDraftId: source.id,
          expectedVersion: source.version,
          expectedChecksum: 'f'.repeat(64),
        },
        'user-avery',
      ),
    ).toThrow(/checksum/i);
  });

  it('rejects a checksummed invoice handoff that attempts a non-revenue account', async () => {
    const { companyId, branchId } = await bindIndiaBooks();
    const source: AccountingJournalDraft = {
      id: 'handoff-invoice-invalid-account',
      sourceType: 'invoice',
      sourceId: 'invoice-invalid-account',
      sourceNumber: 'INV-26-27-01002',
      postingDate: '2026-07-15',
      lines: [
        { accountCode: 'accounts-receivable', debit: 118, credit: 0, memo: 'Invoice receivable' },
        { accountCode: 'cash-at-bank', debit: 0, credit: 118, memo: 'Invalid invoice account' },
      ],
      totalDebit: 118,
      totalCredit: 118,
      status: 'ready',
      checksum: '',
      version: 1,
    };
    source.checksum = revenueHandoffChecksum(source);
    revenueSnapshot = {
      ...revenueSnapshot,
      invoices: [issuedInvoiceFor(source, { companyId, branchId })],
      journalDrafts: [source],
    };

    expect(() => ledgerStore.prepareRevenueInvoicePosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery')).toThrow(/cash-at-bank/i);
    expect(ledgerStore.getSnapshot().journals).toHaveLength(0);
  });

  it('rejects inconsistent invoice tax evidence before creating a source journal', async () => {
    const { companyId, branchId } = await bindIndiaBooks();
    const source: AccountingJournalDraft = {
      id: 'handoff-invoice-invalid-tax',
      sourceType: 'invoice',
      sourceId: 'invoice-invalid-tax',
      sourceNumber: 'INV-26-27-01003',
      postingDate: '2026-07-15',
      lines: [
        { accountCode: 'accounts-receivable', debit: 118, credit: 0, memo: 'Invoice receivable' },
        { accountCode: 'sales-revenue', debit: 0, credit: 100, memo: 'Taxable revenue' },
        { accountCode: 'output-cgst', debit: 0, credit: 9, memo: 'CGST' },
        { accountCode: 'output-sgst', debit: 0, credit: 9, memo: 'SGST' },
      ],
      totalDebit: 118,
      totalCredit: 118,
      status: 'ready',
      checksum: '',
      version: 1,
    };
    source.checksum = revenueHandoffChecksum(source);
    const invoice = issuedInvoiceFor(source, { companyId, branchId });
    revenueSnapshot = {
      ...revenueSnapshot,
      invoices: [{ ...invoice, taxPreview: { ...invoice.taxPreview, totalTax: 17 } }],
      journalDrafts: [source],
    };

    expect(() => ledgerStore.prepareRevenueInvoicePosting({
      journalDraftId: source.id,
      expectedVersion: source.version,
      expectedChecksum: source.checksum,
    }, 'user-avery')).toThrow(/internally inconsistent/i);
    expect(ledgerStore.getSnapshot().journals).toHaveLength(0);
  });
});
