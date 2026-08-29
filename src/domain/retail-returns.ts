import { createHash, randomUUID } from 'node:crypto';
import type {
  AccountingJournalDraft,
  JournalLine,
  QuoteTaxPreview,
  RevenueOpsState,
} from '../shared/revenue-ops-contracts';
import type {
  ConfirmRetailReturnProviderRefundInput,
  CreateRetailReturnRequestInput,
  DecideRetailReturnSettlementInput,
  DecideRetailReturnInput,
  InspectRetailReturnInput,
  RequestRetailReturnSettlementInput,
  RetailReturn,
  RetailReturnFinancialCredit,
  RetailReturnGstCreditEvidence,
  RetailReturnLine,
  RetailReturnOriginalSaleLineSnapshot,
  RetailReturnSettlement,
  RetailReturnValueSnapshot,
  RetailSale,
  RetailSaleLine,
  RetailStoreCredit,
} from '../shared/retail-pos-contracts';
import { toIndiaBusinessDate } from '../shared/india-business-date';
import { returnRetailInventoryAtCounter } from './inventory-warehouse';

const money = (value: number): number => Math.round(value * 100) / 100;
const quantity = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive.`);
  return Number(value.toFixed(6));
};
const clean = (value: string, label: string, minimum = 2, maximum = 240): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
};
const checksum = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function mutate(state: RevenueOpsState): RevenueOpsState {
  const next = structuredClone(state);
  next.revision += 1;
  return next;
}

function sameScope(state: RevenueOpsState, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

function assertScope(state: RevenueOpsState, records: Array<{ scope?: RevenueOpsState['scope'] }>, label: string): void {
  if (records.some((record) => !sameScope(state, record))) {
    throw new Error(`${label} must belong to the active company and branch scope.`);
  }
}

function fiscalNumber(prefix: string, sequence: number, at: string): string {
  const [yearToken, monthToken] = toIndiaBusinessDate(at).split('-');
  const year = Number(yearToken);
  const month = Number(monthToken);
  if (!Number.isInteger(year) || !Number.isInteger(month)) throw new Error('Retail return business date is invalid.');
  const financialYear = month >= 4 ? year : year - 1;
  return `${prefix}/${String(financialYear).slice(-2)}-${String(financialYear + 1).slice(-2)}/${String(sequence).padStart(5, '0')}`;
}

function durableKey(value: string): string {
  const key = clean(value, 'Retail return transaction key', 6, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(key)) {
    throw new Error('Retail return transaction key may use only letters, numbers, colon, underscore, and dash.');
  }
  return key;
}

function requestChecksum(input: CreateRetailReturnRequestInput, transactionKey: string, reason: string): string {
  return checksum({
    retailSaleId: input.retailSaleId,
    transactionKey,
    reason,
    lines: input.lines.map((line) => ({
      retailSaleLineId: line.retailSaleLineId,
      quantity: line.quantity,
      serialUnitIds: [...line.serialUnitIds].sort(),
    })).sort((left, right) => left.retailSaleLineId.localeCompare(right.retailSaleLineId)),
  });
}

function exactSameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && [...left].sort().every((id, index) => id === [...right].sort()[index]);
}

function requiredCompletedSale(state: RevenueOpsState, id: string): RetailSale {
  const sale = state.retailSales.find((candidate) => candidate.id === id && candidate.status === 'completed');
  if (!sale || !sameScope(state, sale)) throw new Error('Completed retail sale not found in the active operating scope.');
  return sale;
}

function requiredReturn(state: RevenueOpsState, id: string): RetailReturn {
  const returnCase = state.retailReturns.find((candidate) => candidate.id === id);
  if (!returnCase || !sameScope(state, returnCase)) throw new Error('Retail return not found in the active operating scope.');
  return returnCase;
}

function originalSnapshot(line: RetailSaleLine): RetailReturnOriginalSaleLineSnapshot {
  return {
    itemVariantId: line.itemVariantId,
    catalogProductId: line.catalogProductId,
    binId: line.binId,
    batchId: line.batchId,
    serialUnitIds: [...line.serialUnitIds],
    description: line.description,
    hsnSac: line.hsnSac,
    quantity: line.quantity,
    listUnitPrice: line.listUnitPrice,
    unitPrice: line.unitPrice,
    taxableValue: line.taxableValue,
    gstRate: line.gstRate,
    gstAmount: line.gstAmount ?? money(line.taxableValue * line.gstRate / 100),
    taxCodeId: line.taxCodeId,
    priceListEntryId: line.priceListEntryId,
    discountAmount: line.discountAmount,
    cessRate: line.cessRate,
    cessAmount: line.cessAmount,
    lineTotal: line.lineTotal,
    lineCostTotal: line.lineCostTotal,
  };
}

function returnedQuantity(state: RevenueOpsState, retailSaleId: string, retailSaleLineId: string): number {
  return Number(state.retailReturns
    .filter((returnCase) => returnCase.retailSaleId === retailSaleId && returnCase.status !== 'rejected' && sameScope(state, returnCase))
    .flatMap((returnCase) => returnCase.lines)
    .filter((line) => line.retailSaleLineId === retailSaleLineId)
    .reduce((total, line) => total + line.quantity, 0)
    .toFixed(6));
}

function priorReturnValues(state: RevenueOpsState, retailSaleId: string, retailSaleLineId: string): RetailReturnValueSnapshot[] {
  return state.retailReturns
    .filter((returnCase) => returnCase.retailSaleId === retailSaleId && returnCase.status !== 'rejected' && sameScope(state, returnCase))
    .flatMap((returnCase) => returnCase.lines)
    .filter((line) => line.retailSaleLineId === retailSaleLineId)
    .map((line) => line.returnValues);
}

function activeReturnSerialUnitIds(state: RevenueOpsState, retailSaleId: string, retailSaleLineId: string): Set<string> {
  return new Set(state.retailReturns
    .filter((returnCase) => returnCase.retailSaleId === retailSaleId && returnCase.status !== 'rejected' && sameScope(state, returnCase))
    .flatMap((returnCase) => returnCase.lines)
    .filter((line) => line.retailSaleLineId === retailSaleLineId)
    .flatMap((line) => line.serialUnitIds));
}

function allocatedValue(
  original: RetailReturnOriginalSaleLineSnapshot,
  returned: number,
  previousQuantity: number,
  previous: RetailReturnValueSnapshot[],
): RetailReturnValueSnapshot {
  const remaining = Number((original.quantity - previousQuantity).toFixed(6));
  const finalPortion = returned === remaining;
  const previousValue = (field: keyof RetailReturnValueSnapshot): number => money(previous.reduce((total, value) => total + value[field], 0));
  const portion = (value: number, field: keyof RetailReturnValueSnapshot): number => finalPortion
    ? money(value - previousValue(field))
    : money(value * returned / original.quantity);
  return {
    taxableValue: portion(original.taxableValue, 'taxableValue'),
    discountAmount: portion(original.discountAmount, 'discountAmount'),
    gstAmount: portion(original.gstAmount, 'gstAmount'),
    cessAmount: portion(original.cessAmount, 'cessAmount'),
    lineTotal: portion(original.lineTotal, 'lineTotal'),
    lineCostTotal: portion(original.lineCostTotal, 'lineCostTotal'),
  };
}

function returnTaxPreview(sale: RetailSale, lines: RetailReturnLine[]): QuoteTaxPreview {
  const taxableValue = money(lines.reduce((total, line) => total + line.returnValues.taxableValue, 0));
  const gstTotal = money(lines.reduce((total, line) => total + line.returnValues.gstAmount, 0));
  const cess = money(lines.reduce((total, line) => total + line.returnValues.cessAmount, 0));
  const intraState = sale.taxPreview.treatment === 'intra-state';
  const cgst = intraState ? money(gstTotal / 2) : 0;
  const sgst = intraState ? money(gstTotal - cgst) : 0;
  const igst = intraState ? 0 : gstTotal;
  return {
    treatment: sale.taxPreview.treatment,
    taxableValue,
    cgst,
    sgst,
    igst,
    cess,
    totalTax: money(gstTotal + cess),
    grandTotal: money(lines.reduce((total, line) => total + line.returnValues.lineTotal, 0)),
    determination: 'commercial-estimate',
  };
}

function cogsReversalDraft(returnCase: RetailReturn, postingDate: string): AccountingJournalDraft {
  const totalCost = money(returnCase.lines.reduce((total, line) => total + line.returnValues.lineCostTotal, 0));
  if (totalCost <= 0) throw new Error('Retail return requires positive original cost evidence before COGS can be reversed.');
  const lines: JournalLine[] = [
    { accountCode: 'inventory-asset', debit: totalCost, credit: 0, memo: returnCase.number },
    { accountCode: 'cost-of-goods-sold', debit: 0, credit: totalCost, memo: returnCase.number },
  ];
  const unsigned = {
    sourceType: 'retail-return-cost' as const,
    sourceId: returnCase.id,
    sourceNumber: returnCase.number,
    postingDate,
    lines,
    totalDebit: totalCost,
    totalCredit: totalCost,
  };
  return {
    id: randomUUID(),
    ...unsigned,
    status: 'ready',
    checksum: checksum(unsigned),
    version: 1,
  };
}

function settlementJournalDraft(
  settlement: RetailReturnSettlement,
  gstEvidence: RetailReturnGstCreditEvidence,
  postingDate: string,
): AccountingJournalDraft {
  const creditRatio = gstEvidence.totalCredit > 0 ? settlement.amount / gstEvidence.totalCredit : 1;
  const taxCredit = money(gstEvidence.totalTax * creditRatio);
  const revenueCredit = money(settlement.amount - taxCredit);

  const creditAccount = settlement.method === 'cash-refund'
    ? 'cash-on-hand'
    : settlement.method === 'store-credit'
      ? 'unapplied-cash'
      : 'card-clearing';

  const lines: JournalLine[] = [
    { accountCode: 'sales-adjustment', debit: revenueCredit, credit: 0, memo: `${settlement.number} return revenue adjustment` },
    { accountCode: 'output-cgst', debit: taxCredit, credit: 0, memo: `${settlement.number} GST tax reversal` },
    { accountCode: creditAccount, debit: 0, credit: settlement.amount, memo: `${settlement.number} ${settlement.method}` },
  ];

  const unsigned = {
    sourceType: 'retail-return-settlement' as const,
    sourceId: settlement.id,
    sourceNumber: settlement.number,
    postingDate,
    lines,
    totalDebit: settlement.amount,
    totalCredit: settlement.amount,
  };

  return {
    id: randomUUID(),
    ...unsigned,
    status: 'ready',
    checksum: checksum(unsigned),
    version: 1,
  };
}

function positiveMoney(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || money(value) !== value) {
    throw new Error(`${label} must be a positive amount in paise.`);
  }
  return value;
}

function requiredApprovedReturn(state: RevenueOpsState, id: string): RetailReturn {
  const returnCase = requiredReturn(state, id);
  if (returnCase.status !== 'approved' || !returnCase.financialCredit) {
    throw new Error('Retail return must be independently approved before a financial credit can be settled.');
  }
  return returnCase;
}

function taxEvidenceForApprovedReturn(
  state: RevenueOpsState,
  returnCase: RetailReturn,
  actorId: string,
  now: string,
): RetailReturnGstCreditEvidence {
  const invoice = state.invoices.find((candidate) => candidate.id === returnCase.invoiceId && sameScope(state, candidate));
  if (!invoice || !['issued', 'partially-paid', 'paid'].includes(invoice.status)) {
    throw new Error('Retail return GST credit requires its original issued retail invoice evidence.');
  }
  if (!state.profile.gstRegistered || !state.profile.gstin) {
    throw new Error('Retail return GST credit requires a GST-registered supplier profile.');
  }
  const intraState = returnCase.taxPreview.treatment === 'intra-state';
  let allocatedCgst = 0;
  let allocatedSgst = 0;
  const lines = returnCase.lines.map((line, index) => {
    const finalLine = index === returnCase.lines.length - 1;
    const gstAmount = line.returnValues.gstAmount;
    const cgst = intraState
      ? (finalLine ? money(returnCase.taxPreview.cgst - allocatedCgst) : money(gstAmount / 2))
      : 0;
    const sgst = intraState
      ? (finalLine ? money(returnCase.taxPreview.sgst - allocatedSgst) : money(gstAmount - cgst))
      : 0;
    allocatedCgst = money(allocatedCgst + cgst);
    allocatedSgst = money(allocatedSgst + sgst);
    const igst = intraState ? 0 : gstAmount;
    const cess = line.returnValues.cessAmount;
    const totalTax = money(cgst + sgst + igst + cess);
    return {
      retailReturnLineId: line.id,
      retailSaleLineId: line.retailSaleLineId,
      hsnSac: line.original.hsnSac,
      quantity: line.quantity,
      taxableValue: line.returnValues.taxableValue,
      cgst,
      sgst,
      igst,
      cess,
      totalTax,
      totalCredit: line.returnValues.lineTotal,
    };
  });
  const taxableValue = money(lines.reduce((total, line) => total + line.taxableValue, 0));
  const cgst = money(lines.reduce((total, line) => total + line.cgst, 0));
  const sgst = money(lines.reduce((total, line) => total + line.sgst, 0));
  const igst = money(lines.reduce((total, line) => total + line.igst, 0));
  const cess = money(lines.reduce((total, line) => total + line.cess, 0));
  const totalTax = money(cgst + sgst + igst + cess);
  const totalCredit = money(lines.reduce((total, line) => total + line.totalCredit, 0));
  if (
    taxableValue !== returnCase.taxPreview.taxableValue ||
    cgst !== returnCase.taxPreview.cgst ||
    sgst !== returnCase.taxPreview.sgst ||
    igst !== returnCase.taxPreview.igst ||
    cess !== returnCase.taxPreview.cess ||
    totalTax !== returnCase.taxPreview.totalTax ||
    totalCredit !== returnCase.taxPreview.grandTotal
  ) {
    throw new Error('Retail return GST credit evidence does not reconcile to the frozen approved return values.');
  }
  const unsigned = {
    id: randomUUID(),
    number: fiscalNumber('RTGSTC', state.retailReturns.filter((candidate) => candidate.financialCredit && sameScope(state, candidate)).length + 1, now),
    retailReturnId: returnCase.id,
    retailReturnNumber: returnCase.number,
    sourceInvoiceId: invoice.id,
    sourceInvoiceNumber: invoice.number,
    sourceInvoiceDate: invoice.invoiceDate,
    supplierGstin: state.profile.gstin,
    treatment: returnCase.taxPreview.treatment,
    taxableValue,
    cgst,
    sgst,
    igst,
    cess,
    totalTax,
    totalCredit,
    lines,
    frozenBy: actorId,
    frozenAt: now,
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

function financialCreditForApprovedReturn(
  state: RevenueOpsState,
  returnCase: RetailReturn,
  actorId: string,
  now: string,
): RetailReturnFinancialCredit {
  const issuedAmount = returnCase.taxPreview.grandTotal;
  if (issuedAmount <= 0) throw new Error('Retail return credit requires a positive approved return value.');
  return {
    id: randomUUID(),
    number: fiscalNumber('RTRC', state.retailReturns.filter((candidate) => candidate.financialCredit && sameScope(state, candidate)).length + 1, now),
    retailReturnId: returnCase.id,
    customerAccountId: returnCase.customerAccountId,
    issuedAmount,
    availableAmount: issuedAmount,
    reservedAmount: 0,
    settledAmount: 0,
    status: 'open',
    gstCreditEvidence: taxEvidenceForApprovedReturn(state, returnCase, actorId, now),
    settlements: [],
    issuedBy: actorId,
    issuedAt: now,
    scope: structuredClone(returnCase.scope ?? state.scope),
    version: 1,
  };
}

function settlementRequestChecksum(input: RequestRetailReturnSettlementInput, transactionKey: string): string {
  return checksum({
    retailReturnId: input.retailReturnId,
    transactionKey,
    method: input.method,
    amount: input.amount,
    cashierShiftId: input.cashierShiftId ?? '',
    providerMethod: input.providerMethod ?? '',
    providerReference: input.providerReference?.trim().toUpperCase() ?? '',
    storeCreditAccountId: input.storeCreditAccountId?.trim() ?? '',
    evidenceReference: input.evidenceReference.trim().toUpperCase(),
  });
}

function providerConfirmationChecksum(input: ConfirmRetailReturnProviderRefundInput, transactionKey: string): string {
  return checksum({
    retailReturnId: input.retailReturnId,
    settlementId: input.settlementId,
    transactionKey,
    decision: input.decision,
    providerConfirmationReference: input.providerConfirmationReference.trim().toUpperCase(),
  });
}

function creditWithBalances(credit: RetailReturnFinancialCredit, settlements: RetailReturnSettlement[]): RetailReturnFinancialCredit {
  const settledAmount = money(settlements
    .filter((settlement) => ['cash-refunded', 'provider-refunded', 'store-credit-issued'].includes(settlement.status))
    .reduce((total, settlement) => total + settlement.amount, 0));
  const reservedAmount = money(settlements
    .filter((settlement) => ['requested', 'provider-refund-pending'].includes(settlement.status))
    .reduce((total, settlement) => total + settlement.amount, 0));
  const availableAmount = money(credit.issuedAmount - settledAmount - reservedAmount);
  if (availableAmount < 0 || settledAmount < 0 || reservedAmount < 0) {
    throw new Error('Retail return financial credit cannot exceed its approved frozen value.');
  }
  const status = availableAmount === 0 && reservedAmount === 0
    ? 'settled' as const
    : settledAmount > 0 || reservedAmount > 0
      ? 'partially-settled' as const
      : 'open' as const;
  return {
    ...credit,
    availableAmount,
    reservedAmount,
    settledAmount,
    status,
    settlements,
    version: credit.version + 1,
  };
}

function returnWithCredit(state: RevenueOpsState, returnCase: RetailReturn, credit: RetailReturnFinancialCredit): RevenueOpsState {
  const next = mutate(state);
  next.retailReturns = next.retailReturns.map((candidate) => candidate.id === returnCase.id
    ? { ...candidate, financialCredit: credit, version: candidate.version + 1 }
    : candidate);
  return next;
}

function activeSettlementExposure(state: RevenueOpsState, retailSaleId: string, method: 'cash' | 'upi' | 'card'): number {
  return money(state.retailReturns
    .filter((returnCase) => returnCase.retailSaleId === retailSaleId && returnCase.status === 'approved' && sameScope(state, returnCase))
    .flatMap((returnCase) => returnCase.financialCredit?.settlements ?? [])
    .filter((settlement) => {
      if (['rejected', 'provider-refund-rejected'].includes(settlement.status)) return false;
      return method === 'cash'
        ? settlement.method === 'cash-refund'
        : settlement.method === 'provider-refund' && settlement.providerMethod === method;
    })
    .reduce((total, settlement) => total + settlement.amount, 0));
}

function assertSettlementTenderCapacity(state: RevenueOpsState, returnCase: RetailReturn, method: 'cash' | 'upi' | 'card', amount: number): void {
  const sale = requiredCompletedSale(state, returnCase.retailSaleId);
  const tendered = money(sale.tenders.filter((tender) => tender.method === method).reduce((total, tender) => total + tender.amount, 0));
  const committed = activeSettlementExposure(state, sale.id, method);
  if (money(committed + amount) > tendered) {
    throw new Error(`Retail return ${method} refund exceeds the original evidenced tender capacity.`);
  }
}

function assertCashierShiftForRefund(state: RevenueOpsState, returnCase: RetailReturn, cashierShiftId: string, actorId?: string): void {
  const shift = state.retailCashierShifts.find((candidate) => candidate.id === cashierShiftId && sameScope(state, candidate));
  if (!shift || shift.counterId !== returnCase.counterId || shift.status !== 'open') {
    throw new Error('Cash retail return refund requires the active open cashier drawer for the original counter.');
  }
  if (actorId && shift.cashierId !== actorId) {
    throw new Error('Cash retail return refund must be requested by the assigned cashier who controls the drawer.');
  }
}

/**
 * Records a customer-facing counter-return request without moving stock,
 * issuing a credit note, or refunding a tender. The immutable source-line
 * snapshot makes the subsequent financial workflow auditable even if current
 * catalogue prices or GST rules later change.
 */
export function createRetailReturnRequest(
  state: RevenueOpsState,
  input: CreateRetailReturnRequestInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): RevenueOpsState {
  const sale = requiredCompletedSale(state, input.retailSaleId);
  const transactionKey = durableKey(input.transactionKey);
  const reason = clean(input.reason, 'Retail return reason', 4, 500);
  const payloadChecksum = requestChecksum(input, transactionKey, reason);
  const replay = state.retailReturns.find((returnCase) => returnCase.transactionKey === transactionKey && sameScope(state, returnCase));
  if (replay) {
    if (replay.requestChecksum !== payloadChecksum) throw new Error('Retail return idempotency key is already used with a different request.');
    return state;
  }
  if (!input.lines.length || input.lines.length > 500) throw new Error('Retail return requires between 1 and 500 source sale lines.');
  const distinctSourceLines = new Set(input.lines.map((line) => line.retailSaleLineId));
  if (distinctSourceLines.size !== input.lines.length) throw new Error('Retail return cannot repeat a source retail sale line.');
  const counter = state.retailCounters.find((candidate) => candidate.id === sale.counterId);
  if (!counter) throw new Error('Original retail counter configuration is unavailable for this return.');
  assertScope(state, [sale, counter], 'Retail return source');

  const lines = input.lines.map((requestedLine): RetailReturnLine => {
    const source = sale.lines.find((line) => line.id === requestedLine.retailSaleLineId);
    if (!source) throw new Error('Retail return line must reference an original line from the completed retail sale.');
    const requestedQuantity = quantity(requestedLine.quantity, 'Retail return quantity');
    const variant = state.itemVariants.find((candidate) => candidate.id === source.itemVariantId && candidate.active);
    const item = variant && state.inventoryItems.find((candidate) => candidate.id === variant.itemId && candidate.active);
    if (!variant || !item) throw new Error('Retail return requires an active traceable inventory variant.');
    assertScope(state, [variant, item], 'Retail return inventory');
    const previousQuantity = returnedQuantity(state, sale.id, source.id);
    if (Number((previousQuantity + requestedQuantity).toFixed(6)) > source.quantity) {
      throw new Error('Retail return quantity exceeds the original retail sale line quantity after prior return cases.');
    }
    const serialUnitIds = [...requestedLine.serialUnitIds];
    if (item.tracking === 'serial') {
      if (
        requestedQuantity !== Math.trunc(requestedQuantity) ||
        serialUnitIds.length !== requestedQuantity ||
        new Set(serialUnitIds).size !== serialUnitIds.length ||
        serialUnitIds.some((serialId) => !source.serialUnitIds.includes(serialId))
      ) {
        throw new Error('Serial retail return requires original issued serial identities exactly once.');
      }
      const claimedSerialUnitIds = activeReturnSerialUnitIds(state, sale.id, source.id);
      if (serialUnitIds.some((serialId) => claimedSerialUnitIds.has(serialId))) {
        throw new Error('Serial retail return unit is already claimed by another active counter-return case for this sale line.');
      }
    } else if (serialUnitIds.length) {
      throw new Error('Serial identities are only allowed for serial-controlled retail returns.');
    }
    const original = originalSnapshot(source);
    return {
      id: randomUUID(),
      retailSaleLineId: source.id,
      sourceLineQuantity: source.quantity,
      quantity: requestedQuantity,
      serialUnitIds,
      original,
      returnValues: allocatedValue(original, requestedQuantity, previousQuantity, priorReturnValues(state, sale.id, source.id)),
    };
  });
  const returnCase: RetailReturn = {
    id,
    number: fiscalNumber('RTRN', state.retailReturns.filter((candidate) => sameScope(state, candidate)).length + 1, now),
    retailSaleId: sale.id,
    retailSaleNumber: sale.number,
    invoiceId: sale.invoiceId,
    counterId: sale.counterId,
    warehouseId: counter.warehouseId,
    customerAccountId: sale.customerAccountId,
    transactionKey,
    requestChecksum: payloadChecksum,
    reason,
    lines,
    taxPreview: returnTaxPreview(sale, lines),
    status: 'requested',
    requestedBy: actorId,
    requestedAt: now,
    scope: structuredClone(sale.scope ?? state.scope),
    version: 1,
  };
  const next = mutate(state);
  next.retailReturns = [returnCase, ...next.retailReturns];
  return next;
}

/**
 * Records the condition decision and destination while stock remains unchanged.
 * The later independent approval is the sole gate that invokes the inventory
 * receipt helper, so failed/abandoned inspections never inflate availability.
 */
export function inspectRetailReturn(
  state: RevenueOpsState,
  input: InspectRetailReturnInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const returnCase = requiredReturn(state, input.id);
  if (returnCase.status !== 'requested' || returnCase.version !== input.expectedVersion) {
    throw new Error('Retail return is stale or no longer awaiting inspection.');
  }
  const inspectionReference = clean(input.inspectionReference, 'Retail return inspection reference', 3, 160);
  if (input.lines.length !== returnCase.lines.length) throw new Error('Retail return inspection must cover every requested return line exactly once.');
  const lineIds = new Set(input.lines.map((line) => line.retailReturnLineId));
  if (lineIds.size !== input.lines.length || returnCase.lines.some((line) => !lineIds.has(line.id))) {
    throw new Error('Retail return inspection must cover every requested return line exactly once.');
  }
  const inspectedLines = returnCase.lines.map((line) => {
    const inspection = input.lines.find((candidate) => candidate.retailReturnLineId === line.id)!;
    if (!['resalable', 'quarantine', 'damaged'].includes(inspection.outcome)) throw new Error('Retail return inspection outcome is invalid.');
    const serialUnitIds = [...inspection.serialUnitIds];
    if (!exactSameIds(serialUnitIds, line.serialUnitIds)) {
      throw new Error('Retail return inspection serial identities must exactly match the original return request.');
    }
    return {
      ...line,
      inspection: {
        outcome: inspection.outcome,
        destinationBinId: clean(inspection.destinationBinId, 'Retail return destination bin', 2, 120),
        serialUnitIds,
        conditionNotes: clean(inspection.conditionNotes, 'Retail return condition notes', 4, 600),
        inspectedBy: actorId,
        inspectedAt: now,
      },
    };
  });
  const next = mutate(state);
  next.retailReturns = next.retailReturns.map((candidate) => candidate.id === returnCase.id
    ? {
      ...candidate,
      lines: inspectedLines,
      status: 'inspected' as const,
      inspectedBy: actorId,
      inspectedAt: now,
      inspectionReference,
      version: candidate.version + 1,
    }
    : candidate);
  return next;
}

/**
 * Independently decides an inspected return. Approval atomically re-enters
 * the physical item into sellable stock or quarantine and emits a ready COGS
 * reversal draft, a frozen GST credit evidence record, and a return-specific
 * financial credit balance. No cash, provider, or store-credit settlement is
 * performed here; each later settlement must independently approve this proof.
 */
export function decideRetailReturn(
  state: RevenueOpsState,
  input: DecideRetailReturnInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const returnCase = requiredReturn(state, input.id);
  if (returnCase.status !== 'inspected' || returnCase.version !== input.expectedVersion) {
    throw new Error('Retail return is stale or has not completed inspection.');
  }
  if (returnCase.requestedBy === actorId || returnCase.inspectedBy === actorId) {
    throw new Error('Retail return approval requires an independent approver who did not request or inspect it.');
  }
  const evidenceReference = clean(input.evidenceReference, input.decision === 'approved' ? 'Retail return approval evidence' : 'Retail return rejection reason', 4, 500);
  if (input.decision === 'rejected') {
    const next = mutate(state);
    next.retailReturns = next.retailReturns.map((candidate) => candidate.id === returnCase.id
      ? {
        ...candidate,
        status: 'rejected' as const,
        rejectedBy: actorId,
        rejectedAt: now,
        rejectionReason: evidenceReference,
        version: candidate.version + 1,
      }
      : candidate);
    return next;
  }

  let next = state;
  for (const line of returnCase.lines) {
    if (!line.inspection) throw new Error('Retail return cannot be approved before every line is inspected.');
    if (line.returnValues.lineCostTotal <= 0) throw new Error('Retail return requires positive original cost evidence before stock can be re-entered.');
    const receipt = returnRetailInventoryAtCounter(next, {
      warehouseId: returnCase.warehouseId,
      destinationBinId: line.inspection.destinationBinId,
      itemVariantId: line.original.itemVariantId,
      batchId: line.original.batchId,
      serialUnitIds: line.inspection.serialUnitIds,
      quantity: line.quantity,
      unitCost: line.returnValues.lineCostTotal / line.quantity,
      reference: returnCase.number,
      occurredAt: now,
      outcome: line.inspection.outcome,
    }, actorId);
    if (money(receipt.totalCost) !== money(line.returnValues.lineCostTotal)) {
      throw new Error('Retail return physical cost does not reconcile to its immutable sale-line cost evidence.');
    }
    next = receipt.state;
  }
  const current = next.retailReturns.find((candidate) => candidate.id === returnCase.id)!;
  const draft = cogsReversalDraft(current, toIndiaBusinessDate(now));
  const financialCredit = financialCreditForApprovedReturn(next, current, actorId, now);
  next = {
    ...next,
    revision: next.revision + 1,
    journalDrafts: [draft, ...next.journalDrafts],
    retailReturns: next.retailReturns.map((candidate) => candidate.id === returnCase.id
      ? {
        ...candidate,
        status: 'approved' as const,
        approvedBy: actorId,
        approvedAt: now,
        approvalEvidenceReference: evidenceReference,
        cogsReversalJournalDraftId: draft.id,
        financialCredit,
        version: candidate.version + 1,
      }
      : candidate),
  };
  return next;
}

/**
 * Reserves an independently approved retail-return credit for one settlement
 * method. It records intent only: cash and store credit still need an
 * independent decision, while provider refunds remain held until confirmation.
 */
export function requestRetailReturnSettlement(
  state: RevenueOpsState,
  input: RequestRetailReturnSettlementInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): RevenueOpsState {
  const returnCase = requiredApprovedReturn(state, input.retailReturnId);
  const credit = returnCase.financialCredit!;
  const transactionKey = durableKey(input.transactionKey);
  const evidenceReference = clean(input.evidenceReference, 'Retail return settlement request evidence', 3, 160);
  const providerReference = input.providerReference
    ? clean(input.providerReference, 'Retail return provider refund reference', 6, 160).toUpperCase()
    : undefined;
  const storeCreditAccountId = input.storeCreditAccountId
    ? clean(input.storeCreditAccountId, 'Retail store credit customer account', 2, 120)
    : undefined;
  const cashierShiftId = input.cashierShiftId
    ? clean(input.cashierShiftId, 'Retail return cashier shift', 2, 120)
    : undefined;
  const normalizedInput = {
    ...input,
    transactionKey,
    evidenceReference,
    providerReference,
    storeCreditAccountId,
    cashierShiftId,
  };
  const payloadChecksum = settlementRequestChecksum(normalizedInput, transactionKey);
  const existing = state.retailReturns
    .filter((candidate) => sameScope(state, candidate))
    .flatMap((candidate) => candidate.financialCredit?.settlements ?? [])
    .find((settlement) => settlement.transactionKey === transactionKey);
  if (existing) {
    if (existing.requestChecksum !== payloadChecksum) throw new Error('Retail return settlement idempotency key is already used with a different request.');
    return state;
  }
  if (returnCase.version !== input.expectedVersion) throw new Error('Retail return changed. Refresh before creating a settlement request.');
  const amount = positiveMoney(input.amount, 'Retail return settlement amount');
  if (amount > credit.availableAmount) throw new Error('Retail return settlement amount exceeds the available approved financial credit balance.');
  const counter = state.retailCounters.find((candidate) => candidate.id === returnCase.counterId && sameScope(state, candidate));
  if (!counter) throw new Error('Retail return settlement requires the original counter configuration.');

  let providerMethod: RetailReturnSettlement['providerMethod'];
  if (input.method === 'cash-refund') {
    if (!cashierShiftId || providerReference || storeCreditAccountId || input.providerMethod) {
      throw new Error('Cash retail return refund requires only an active cashier shift and controlled cash evidence.');
    }
    assertCashierShiftForRefund(state, returnCase, cashierShiftId, actorId);
    assertSettlementTenderCapacity(state, returnCase, 'cash', amount);
  } else if (input.method === 'provider-refund') {
    if (cashierShiftId || storeCreditAccountId || !providerReference || !input.providerMethod) {
      throw new Error('Provider retail return refund requires one original UPI or card rail and provider evidence.');
    }
    if (input.providerMethod !== 'upi' && input.providerMethod !== 'card') {
      throw new Error('Retail return provider refund method must be UPI or card.');
    }
    providerMethod = input.providerMethod;
    assertSettlementTenderCapacity(state, returnCase, providerMethod, amount);
  } else if (input.method === 'store-credit') {
    if (!storeCreditAccountId || cashierShiftId || providerReference || input.providerMethod) {
      throw new Error('Retail store credit requires only the named customer account and controlled evidence.');
    }
    if (returnCase.customerAccountId === counter.walkInAccountId || storeCreditAccountId !== returnCase.customerAccountId) {
      throw new Error('Retail store credit can only be issued to the return\'s named customer account.');
    }
  } else {
    throw new Error('Retail return settlement method is invalid.');
  }

  const settlement: RetailReturnSettlement = {
    id,
    number: fiscalNumber('RTRS', state.retailReturns
      .filter((candidate) => sameScope(state, candidate))
      .reduce((count, candidate) => count + (candidate.financialCredit?.settlements.length ?? 0), 0) + 1, now),
    retailReturnId: returnCase.id,
    financialCreditId: credit.id,
    transactionKey,
    requestChecksum: payloadChecksum,
    method: input.method,
    amount,
    cashierShiftId,
    providerMethod,
    providerReference,
    storeCreditAccountId,
    status: 'requested',
    requestedBy: actorId,
    requestedAt: now,
    requestEvidenceReference: evidenceReference,
    version: 1,
  };
  return returnWithCredit(state, returnCase, creditWithBalances(credit, [...credit.settlements, settlement]));
}

/**
 * Independently approves or rejects a settlement request. Cash refunds are
 * linked to a live drawer; provider refunds wait for a separate provider
 * confirmation; store credit creates its own customer-liability record.
 */
export function decideRetailReturnSettlement(
  state: RevenueOpsState,
  input: DecideRetailReturnSettlementInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const returnCase = requiredApprovedReturn(state, input.retailReturnId);
  const credit = returnCase.financialCredit!;
  if (returnCase.version !== input.expectedVersion) throw new Error('Retail return changed. Refresh before deciding a settlement request.');
  const settlement = credit.settlements.find((candidate) => candidate.id === input.settlementId);
  if (!settlement || settlement.retailReturnId !== returnCase.id) throw new Error('Retail return settlement request was not found.');
  if (settlement.status !== 'requested') throw new Error('Only a requested retail return settlement can be independently decided.');
  if (settlement.requestedBy === actorId || returnCase.requestedBy === actorId || returnCase.inspectedBy === actorId) {
    throw new Error('Retail return settlement requires an independent approver.');
  }
  if (input.decision !== 'approved' && input.decision !== 'rejected') throw new Error('Retail return settlement decision is invalid.');
  const evidenceReference = clean(input.evidenceReference, input.decision === 'approved' ? 'Retail return settlement approval evidence' : 'Retail return settlement rejection reason', 3, 240);
  if (input.decision === 'rejected') {
    const settlements = credit.settlements.map((candidate) => candidate.id === settlement.id
      ? {
        ...candidate,
        status: 'rejected' as const,
        decidedBy: actorId,
        decidedAt: now,
        decisionEvidenceReference: evidenceReference,
        rejectionReason: evidenceReference,
        version: candidate.version + 1,
      }
      : candidate);
    return returnWithCredit(state, returnCase, creditWithBalances(credit, settlements));
  }

  let storeCredit: RetailStoreCredit | undefined;
  const settlements = credit.settlements.map((candidate) => {
    if (candidate.id !== settlement.id) return candidate;
    if (candidate.method === 'cash-refund') {
      if (!candidate.cashierShiftId) throw new Error('Cash retail return refund has no cashier shift evidence.');
      assertCashierShiftForRefund(state, returnCase, candidate.cashierShiftId);
      return {
        ...candidate,
        status: 'cash-refunded' as const,
        decidedBy: actorId,
        decidedAt: now,
        decisionEvidenceReference: evidenceReference,
        version: candidate.version + 1,
      };
    }
    if (candidate.method === 'provider-refund') {
      if (!candidate.providerMethod || !candidate.providerReference) throw new Error('Provider retail return refund has no controlled provider evidence.');
      return {
        ...candidate,
        status: 'provider-refund-pending' as const,
        decidedBy: actorId,
        decidedAt: now,
        decisionEvidenceReference: evidenceReference,
        version: candidate.version + 1,
      };
    }
    if (!candidate.storeCreditAccountId) throw new Error('Retail store credit has no named customer account evidence.');
    storeCredit = {
      id: randomUUID(),
      number: fiscalNumber('STCR', state.retailStoreCredits.filter((candidate) => sameScope(state, candidate)).length + 1, now),
      retailReturnId: returnCase.id,
      retailReturnSettlementId: candidate.id,
      customerAccountId: candidate.storeCreditAccountId,
      issuedAmount: candidate.amount,
      availableAmount: candidate.amount,
      status: 'active',
      evidenceReference,
      issuedBy: actorId,
      issuedAt: now,
      scope: structuredClone(returnCase.scope ?? state.scope),
      version: 1,
    };
    return {
      ...candidate,
      storeCreditId: storeCredit.id,
      status: 'store-credit-issued' as const,
      decidedBy: actorId,
      decidedAt: now,
      decisionEvidenceReference: evidenceReference,
      version: candidate.version + 1,
    };
  });
  const next = returnWithCredit(state, returnCase, creditWithBalances(credit, settlements));
  if (storeCredit) next.retailStoreCredits = [storeCredit, ...next.retailStoreCredits];
  if (returnCase.financialCredit?.gstCreditEvidence && input.decision === 'approved' && settlement.method !== 'provider-refund') {
    const journalDraft = settlementJournalDraft(settlement, returnCase.financialCredit.gstCreditEvidence, toIndiaBusinessDate(now));
    next.journalDrafts = [journalDraft, ...next.journalDrafts];
  }
  return next;
}

/**
 * Finalises the asynchronous provider result. Provider rejection releases the
 * reserved return balance; confirmation consumes it. Neither path ever moves
 * cash in the cashier drawer.
 */
export function confirmRetailReturnProviderRefund(
  state: RevenueOpsState,
  input: ConfirmRetailReturnProviderRefundInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const returnCase = requiredApprovedReturn(state, input.retailReturnId);
  const credit = returnCase.financialCredit!;
  const transactionKey = durableKey(input.transactionKey);
  const providerConfirmationReference = clean(input.providerConfirmationReference, 'Retail provider refund confirmation reference', 6, 160).toUpperCase();
  const normalizedInput = { ...input, transactionKey, providerConfirmationReference };
  const confirmationChecksum = providerConfirmationChecksum(normalizedInput, transactionKey);
  const replay = credit.settlements.find((candidate) => candidate.confirmationTransactionKey === transactionKey);
  if (replay) {
    if (replay.confirmationChecksum !== confirmationChecksum) throw new Error('Retail provider refund confirmation idempotency key is already used with a different request.');
    return state;
  }
  if (returnCase.version !== input.expectedVersion) throw new Error('Retail return changed. Refresh before confirming the provider refund.');
  const settlement = credit.settlements.find((candidate) => candidate.id === input.settlementId);
  if (!settlement || settlement.retailReturnId !== returnCase.id || settlement.method !== 'provider-refund') {
    throw new Error('Retail provider refund settlement was not found.');
  }
  if (settlement.status !== 'provider-refund-pending') throw new Error('Only a pending provider retail refund can be confirmed.');
  if (settlement.requestedBy === actorId || settlement.decidedBy === actorId) {
    throw new Error('Retail provider refund confirmation requires an independent reconciler.');
  }
  if (input.decision !== 'confirmed' && input.decision !== 'rejected') throw new Error('Retail provider refund confirmation decision is invalid.');
  const settlements = credit.settlements.map((candidate) => candidate.id === settlement.id
    ? {
      ...candidate,
      status: input.decision === 'confirmed' ? 'provider-refunded' as const : 'provider-refund-rejected' as const,
      confirmationTransactionKey: transactionKey,
      confirmationChecksum,
      providerConfirmationReference,
      confirmedBy: actorId,
      confirmedAt: now,
      confirmationRejectionReason: input.decision === 'rejected' ? providerConfirmationReference : undefined,
      version: candidate.version + 1,
    }
    : candidate);
  const next = returnWithCredit(state, returnCase, creditWithBalances(credit, settlements));
  if (returnCase.financialCredit?.gstCreditEvidence && input.decision === 'confirmed') {
    const journalDraft = settlementJournalDraft(settlement, returnCase.financialCredit.gstCreditEvidence, toIndiaBusinessDate(now));
    next.journalDrafts = [journalDraft, ...next.journalDrafts];
  }
  return next;
}
