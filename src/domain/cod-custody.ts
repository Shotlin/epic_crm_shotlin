import { randomUUID } from 'node:crypto';
import { toIndiaBusinessDate } from '../shared/india-business-date';
import type {
  CloseCodShortfallInput,
  CodAmountEvidence,
  CodBankMatchEvidence,
  CodCollectionCase,
  CodCustodyEvidence,
  CreateCodCollectionCaseInput,
  MatchCodBankInput,
  RecordCodCarrierCollectionInput,
  RecordCodExceptionInput,
  RecordCodHandoverInput,
  RecordCodRemittanceInput,
  RevenueOpsState,
} from '../shared/revenue-ops-contracts';

type ScopedRecord = { scope?: { companyId: string; branchId: string } };
type VersionedRecord = ScopedRecord & { id: string; version: number };

const MAX_INR_AMOUNT = 1_000_000_000_000;

function exactScope(state: RevenueOpsState, record: ScopedRecord | undefined, label: string): asserts record is ScopedRecord & { scope: RevenueOpsState['scope'] } {
  if (
    !record?.scope
    || record.scope.companyId !== state.scope.companyId
    || record.scope.branchId !== state.scope.branchId
  ) {
    throw new Error(`${label} is unavailable outside the active company and branch scope.`);
  }
}

function requireVersion(record: VersionedRecord, expectedVersion: number, label: string): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0 || record.version !== expectedVersion) {
    throw new Error(`${label} changed. Refresh and retry.`);
  }
}

function clean(value: string, label: string, minimum = 3, maximum = 300): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  }
  return normalized;
}

function instant(value: string, label: string): string {
  // Date-only values are deliberately rejected: custody and bank evidence
  // need an auditable instant with an explicit UTC offset.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO-8601 instant with an explicit offset.`);
  }
  return value;
}

function inr(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_INR_AMOUNT) {
    throw new Error(`${label} must be a positive finite INR amount within the supported range.`);
  }
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - value) > 0.000_001) {
    throw new Error(`${label} must not use fractions of an INR paisa.`);
  }
  return rounded;
}

function sameMoney(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.005;
}

function fiscalNumber(sequence: number, at: string): string {
  const [year, month] = toIndiaBusinessDate(instant(at, 'COD case timestamp')).split('-').map(Number);
  const fiscalStart = month! >= 4 ? year! : year! - 1;
  return `COD-${String(fiscalStart).slice(-2)}-${String(fiscalStart + 1).slice(-2)}-${String(sequence).padStart(5, '0')}`;
}

function immutableEvidence(
  reference: string,
  occurredAt: string,
  actorId: string,
  now: string,
): CodCustodyEvidence {
  return {
    reference: clean(reference, 'Custody evidence reference', 3, 240),
    occurredAt: instant(occurredAt, 'Custody evidence timestamp'),
    recordedBy: clean(actorId, 'Evidence recorder', 1, 100),
    recordedAt: instant(now, 'Evidence recorded timestamp'),
  };
}

function requireCase(
  state: RevenueOpsState,
  id: string,
  expectedVersion: number,
  status: CodCollectionCase['status'] | CodCollectionCase['status'][],
): CodCollectionCase {
  const item = state.codCollectionCases.find((candidate) => candidate.id === id);
  exactScope(state, item, 'COD collection case');
  requireVersion(item, expectedVersion, 'COD collection case');
  const allowed = Array.isArray(status) ? status : [status];
  if (!allowed.includes(item.status)) {
    throw new Error(`COD collection case cannot move from ${item.status}.`);
  }
  return item;
}

function replaceCase(state: RevenueOpsState, updated: CodCollectionCase): RevenueOpsState {
  return {
    ...state,
    revision: state.revision + 1,
    codCollectionCases: state.codCollectionCases.map((candidate) => candidate.id === updated.id ? updated : candidate),
  };
}

function requireShipmentForCase(
  state: RevenueOpsState,
  item: CodCollectionCase,
  expectedVersion: number,
) {
  const shipment = state.shipmentPackages.find((candidate) => candidate.id === item.shipmentPackageId);
  exactScope(state, shipment, 'COD shipment package');
  requireVersion(shipment, expectedVersion, 'COD shipment package');
  if (shipment.salesOrderId !== item.salesOrderId || shipment.deliveryPromiseId !== item.deliveryPromiseId) {
    throw new Error('COD shipment no longer matches the delivery promise and sales order.');
  }
  if (shipment.carrierAdapterId !== item.carrierAdapterId) {
    throw new Error('COD shipment carrier does not match the custody case.');
  }
  return shipment;
}

function requireReceivableForCase(
  state: RevenueOpsState,
  item: CodCollectionCase,
  expectedVersion?: number,
) {
  const receivable = state.receivables.find((candidate) => candidate.id === item.receivableId);
  exactScope(state, receivable, 'COD receivable');
  if (expectedVersion !== undefined) requireVersion(receivable, expectedVersion, 'COD receivable');
  const invoice = state.invoices.find((candidate) => candidate.id === receivable.invoiceId);
  exactScope(state, invoice, 'COD invoice');
  const order = state.salesOrders.find((candidate) => candidate.id === item.salesOrderId);
  exactScope(state, order, 'COD sales order');
  if (
    invoice.salesOrderId !== item.salesOrderId
    || invoice.accountId !== order.accountId
    || receivable.accountId !== order.accountId
    || invoice.currency !== 'INR'
  ) {
    throw new Error('COD receivable does not match the scoped sales-order customer and invoice.');
  }
  return { receivable, invoice, order };
}

function assertEvidenceChronology(before: CodCustodyEvidence, afterAt: string, label: string): void {
  if (Date.parse(afterAt) < Date.parse(before.occurredAt)) {
    throw new Error(`${label} cannot predate the preceding COD custody evidence.`);
  }
}

function assertNoBankEvidenceReuse(
  state: RevenueOpsState,
  item: CodCollectionCase,
  paymentReceiptId: string,
  bankStatementLineId: string,
): void {
  if (state.codCollectionCases.some((candidate) => candidate.id !== item.id && (
    candidate.bankMatchEvidence?.paymentReceiptId === paymentReceiptId
    || candidate.bankMatchEvidence?.bankStatementLineId === bankStatementLineId
  ))) {
    throw new Error('Bank receipt evidence is already linked to another COD custody case.');
  }
}

function verifiedBankEvidence(
  state: RevenueOpsState,
  item: CodCollectionCase,
  paymentReceiptId: string,
  bankStatementLineId: string,
  expectedPaymentReceiptVersion: number,
  expectedBankStatementLineVersion: number,
  expectedAmount: number,
  now: string,
): CodBankMatchEvidence {
  const receipt = state.paymentReceipts.find((candidate) => candidate.id === paymentReceiptId);
  exactScope(state, receipt, 'COD payment receipt');
  requireVersion(receipt, expectedPaymentReceiptVersion, 'COD payment receipt');
  const line = state.bankStatementLines.find((candidate) => candidate.id === bankStatementLineId);
  exactScope(state, line, 'COD bank statement line');
  requireVersion(line, expectedBankStatementLineVersion, 'COD bank statement line');
  const importRecord = state.bankStatementImports.find((candidate) => candidate.id === line.statementImportId);
  exactScope(state, importRecord, 'COD bank statement import');
  const { receivable, order } = requireReceivableForCase(state, item);

  if (
    receipt.status !== 'reconciled'
    || !receipt.reconciledAt
    || !receipt.reconciledBy
    || receipt.accountId !== order.accountId
    || !receipt.allocations.some((allocation) => allocation.receivableId === receivable.id && sameMoney(allocation.amount, expectedAmount))
  ) {
    throw new Error('COD bank evidence requires an already reconciled receipt allocated to the exact case receivable.');
  }
  if (!sameMoney(receipt.amount, expectedAmount)) {
    throw new Error('COD bank evidence amount must exactly match the governed custody amount.');
  }
  if (
    importRecord.status !== 'committed'
    || line.matchStatus !== 'matched'
    || line.matchedPaymentReceiptId !== receipt.id
    || !line.matchedAt
    || !line.matchedBy
    || !sameMoney(line.credit, expectedAmount)
  ) {
    throw new Error('COD bank evidence requires a committed, exact-amount bank line already matched to the receipt.');
  }
  const occurredAt = instant(line.matchedAt, 'Bank-match evidence timestamp');
  if (item.remittanceEvidence) assertEvidenceChronology(item.remittanceEvidence, occurredAt, 'Bank-match evidence');
  assertNoBankEvidenceReuse(state, item, receipt.id, line.id);

  return {
    reference: clean(line.reference, 'Bank statement reference', 3, 240),
    occurredAt,
    recordedBy: line.matchedBy,
    recordedAt: instant(now, 'Bank evidence recorded timestamp'),
    paymentReceiptId: receipt.id,
    paymentReceiptVersion: receipt.version,
    bankStatementLineId: line.id,
    bankStatementLineVersion: line.version,
    bankStatementReference: clean(line.reference, 'Bank statement reference', 3, 240),
  };
}

/** Creates an expected COD custody case from only exact, already governed evidence. */
export function createCodCollectionCase(
  state: RevenueOpsState,
  input: CreateCodCollectionCaseInput,
  actorId: string,
  id = randomUUID(),
  now = new Date().toISOString(),
): RevenueOpsState {
  const promise = state.deliveryPromises.find((candidate) => candidate.id === input.deliveryPromiseId);
  exactScope(state, promise, 'COD delivery promise');
  requireVersion(promise, input.expectedDeliveryPromiseVersion, 'COD delivery promise');
  const shipment = state.shipmentPackages.find((candidate) => candidate.id === input.shipmentPackageId);
  exactScope(state, shipment, 'COD shipment package');
  requireVersion(shipment, input.expectedShipmentVersion, 'COD shipment package');
  const order = state.salesOrders.find((candidate) => candidate.id === input.salesOrderId);
  exactScope(state, order, 'COD sales order');
  requireVersion(order, input.expectedSalesOrderVersion, 'COD sales order');
  const carrier = state.carrierAdapters.find((candidate) => candidate.id === input.carrierAdapterId);
  exactScope(state, carrier, 'COD carrier');
  requireVersion(carrier, input.expectedCarrierVersion, 'COD carrier');
  const receivable = state.receivables.find((candidate) => candidate.id === input.receivableId);
  exactScope(state, receivable, 'COD receivable');
  requireVersion(receivable, input.expectedReceivableVersion, 'COD receivable');
  const invoice = state.invoices.find((candidate) => candidate.id === receivable.invoiceId);
  exactScope(state, invoice, 'COD invoice');

  const expectedAmount = inr(promise.orderValue, 'COD expected amount');
  if (
    promise.status !== 'active'
    || promise.paymentMode !== 'cod'
    || promise.salesOrderId !== order.id
    || shipment.salesOrderId !== order.id
    || shipment.deliveryPromiseId !== promise.id
    || promise.carrierAdapterId !== carrier.id
    || (shipment.carrierAdapterId !== undefined && shipment.carrierAdapterId !== carrier.id)
    || ['disabled', 'degraded'].includes(carrier.status)
  ) {
    throw new Error('COD custody requires an active exact-scope COD delivery promise, package, and usable carrier boundary.');
  }
  if (
    invoice.salesOrderId !== order.id
    || invoice.accountId !== order.accountId
    || invoice.currency !== 'INR'
    || receivable.accountId !== order.accountId
    || !['current', 'due', 'overdue', 'partially-paid'].includes(receivable.status)
    || !sameMoney(inr(receivable.outstandingAmount, 'COD receivable amount'), expectedAmount)
  ) {
    throw new Error('COD custody requires one open INR receivable exactly equal to the delivery-promise amount.');
  }
  if (state.codCollectionCases.some((candidate) => candidate.shipmentPackageId === shipment.id || candidate.deliveryPromiseId === promise.id || candidate.receivableId === receivable.id)) {
    throw new Error('This COD shipment, delivery promise, or receivable already has a custody case.');
  }

  const item: CodCollectionCase = {
    id,
    number: fiscalNumber(state.codCollectionCases.length + 1, now),
    currency: 'INR',
    deliveryPromiseId: promise.id,
    shipmentPackageId: shipment.id,
    salesOrderId: order.id,
    carrierAdapterId: carrier.id,
    receivableId: receivable.id,
    expectedAmount,
    status: 'expected',
    createdBy: clean(actorId, 'COD case creator', 1, 100),
    createdAt: instant(now, 'COD case timestamp'),
    scope: structuredClone(state.scope),
    version: 1,
  };
  return { ...state, revision: state.revision + 1, codCollectionCases: [item, ...state.codCollectionCases] };
}

/** Appends signed/manifest handover evidence; it does not imply collection. */
export function recordCodHandover(
  state: RevenueOpsState,
  input: RecordCodHandoverInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const item = requireCase(state, input.id, input.expectedVersion, 'expected');
  if (item.handoverEvidence) throw new Error('COD handover evidence is immutable and already recorded.');
  const shipment = requireShipmentForCase(state, item, input.expectedShipmentVersion);
  if (!['dispatched', 'in-transit', 'delivered'].includes(shipment.status)) {
    throw new Error('COD handover requires a dispatched shipment with the linked carrier.');
  }
  const handoverEvidence = immutableEvidence(input.evidenceReference, input.handedOverAt, actorId, now);
  const updated: CodCollectionCase = {
    ...item,
    status: 'handed-to-carrier',
    handoverEvidence,
    version: item.version + 1,
  };
  return replaceCase(state, updated);
}

/** Records independent carrier cash evidence. A carrier delivery/tracking status alone can never invoke this transition. */
export function recordCodCarrierCollection(
  state: RevenueOpsState,
  input: RecordCodCarrierCollectionInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const item = requireCase(state, input.id, input.expectedVersion, 'handed-to-carrier');
  if (!item.handoverEvidence || item.carrierCollectionEvidence) throw new Error('COD collection evidence is immutable and requires a recorded handover.');
  const shipment = requireShipmentForCase(state, item, input.expectedShipmentVersion);
  if (shipment.status !== 'delivered') throw new Error('COD collection evidence requires the linked package to be recorded as delivered.');
  const collectedAt = instant(input.collectedAt, 'Carrier collection timestamp');
  assertEvidenceChronology(item.handoverEvidence, collectedAt, 'Carrier collection');
  const collectedAmount = inr(input.collectedAmount, 'Carrier-collected amount');
  if (collectedAmount > item.expectedAmount) throw new Error('Carrier-collected amount cannot exceed the governed COD expectation.');
  const carrierCollectionEvidence: CodAmountEvidence = {
    ...immutableEvidence(input.evidenceReference, collectedAt, actorId, now),
    amount: collectedAmount,
  };
  return replaceCase(state, {
    ...item,
    status: 'carrier-collected',
    carrierCollectionEvidence,
    version: item.version + 1,
  });
}

/** Records carrier remittance custody evidence. It never records a customer receipt or creates a journal. */
export function recordCodRemittance(
  state: RevenueOpsState,
  input: RecordCodRemittanceInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const item = requireCase(state, input.id, input.expectedVersion, 'carrier-collected');
  if (!item.carrierCollectionEvidence || item.remittanceEvidence) throw new Error('COD remittance evidence is immutable and requires carrier-collection evidence.');
  const { receivable } = requireReceivableForCase(state, item, input.expectedReceivableVersion);
  const remittedAt = instant(input.remittedAt, 'Carrier remittance timestamp');
  assertEvidenceChronology(item.carrierCollectionEvidence, remittedAt, 'Carrier remittance');
  const remittedAmount = inr(input.remittedAmount, 'Carrier-remitted amount');
  if (remittedAmount > item.carrierCollectionEvidence.amount) {
    throw new Error('Carrier remittance cannot exceed the separately evidenced carrier collection.');
  }
  if (remittedAmount > inr(receivable.outstandingAmount, 'COD receivable amount')) {
    throw new Error('Carrier remittance exceeds the current scoped receivable evidence.');
  }
  const remittanceEvidence: CodAmountEvidence = {
    ...immutableEvidence(input.evidenceReference, remittedAt, actorId, now),
    amount: remittedAmount,
  };
  const full = sameMoney(remittedAmount, item.expectedAmount)
    && sameMoney(item.carrierCollectionEvidence.amount, item.expectedAmount);
  return replaceCase(state, {
    ...item,
    status: full ? 'remitted' : 'shortfall',
    remittanceEvidence,
    shortfallAmount: full ? undefined : Math.round((item.expectedAmount - remittedAmount) * 100) / 100,
    version: item.version + 1,
  });
}

/**
 * Links a case to a real bank reconciliation already completed elsewhere.
 * It intentionally does not create a receipt, change a receivable, or trust
 * a carrier response as proof of cash.
 */
export function matchCodBank(
  state: RevenueOpsState,
  input: MatchCodBankInput,
  _actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const item = requireCase(state, input.id, input.expectedVersion, 'remitted');
  if (!item.remittanceEvidence || item.bankMatchEvidence || !sameMoney(item.remittanceEvidence.amount, item.expectedAmount)) {
    throw new Error('Only a fully remitted COD case without prior bank evidence can be bank matched.');
  }
  const bankMatchEvidence = verifiedBankEvidence(
    state,
    item,
    input.paymentReceiptId,
    input.bankStatementLineId,
    input.expectedPaymentReceiptVersion,
    input.expectedBankStatementLineVersion,
    item.expectedAmount,
    now,
  );
  return replaceCase(state, {
    ...item,
    status: 'bank-matched',
    bankMatchEvidence,
    version: item.version + 1,
  });
}

/**
 * A shortfall remains a shortfall even after the actual partial cash reaches
 * the bank. Closing this custody review requires a different checker and
 * preserves the existing AR/write-off workflow as the only accounting path.
 */
export function closeCodShortfall(
  state: RevenueOpsState,
  input: CloseCodShortfallInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const item = requireCase(state, input.id, input.expectedVersion, 'shortfall');
  if (!item.remittanceEvidence || !item.shortfallAmount || item.bankMatchEvidence || item.shortfallClosedAt) {
    throw new Error('COD shortfall is unavailable for variance closure.');
  }
  if (item.remittanceEvidence.recordedBy === actorId) {
    throw new Error('COD remittance maker cannot close the same custody shortfall.');
  }
  const bankMatchEvidence = verifiedBankEvidence(
    state,
    item,
    input.paymentReceiptId,
    input.bankStatementLineId,
    input.expectedPaymentReceiptVersion,
    input.expectedBankStatementLineVersion,
    item.remittanceEvidence.amount,
    now,
  );
  return replaceCase(state, {
    ...item,
    bankMatchEvidence,
    shortfallClosedBy: clean(actorId, 'COD shortfall checker', 1, 100),
    shortfallClosedAt: instant(now, 'COD shortfall closure timestamp'),
    shortfallClosureReference: clean(input.resolutionReference, 'COD shortfall closure reference', 3, 240),
    version: item.version + 1,
  });
}

/** Records non-cash terminal paths without manufacturing a refund, receipt, or provider response. */
export function recordCodException(
  state: RevenueOpsState,
  input: RecordCodExceptionInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const item = requireCase(state, input.id, input.expectedVersion, ['expected', 'handed-to-carrier']);
  if (item.exceptionEvidence || item.remittanceEvidence || item.bankMatchEvidence) {
    throw new Error('COD exception evidence is immutable and unavailable after cash custody begins.');
  }
  const shipment = requireShipmentForCase(state, item, input.expectedShipmentVersion);
  if (input.outcome === 'refused-rto' && !['return-in-progress', 'returned'].includes(shipment.status)) {
    throw new Error('COD refused/RTO evidence requires the linked shipment return to be in progress or received.');
  }
  if (input.outcome === 'cancelled' && shipment.status !== 'cancelled') {
    throw new Error('COD cancellation evidence requires the linked shipment to be cancelled.');
  }
  const exceptionEvidence: NonNullable<CodCollectionCase['exceptionEvidence']> = {
    ...immutableEvidence(input.evidenceReference, input.occurredAt, actorId, now),
    kind: input.outcome,
    reason: clean(input.reason, 'COD exception reason', 4, 500),
  };
  if (item.handoverEvidence) assertEvidenceChronology(item.handoverEvidence, exceptionEvidence.occurredAt, 'COD exception');
  return replaceCase(state, {
    ...item,
    status: input.outcome,
    exceptionEvidence,
    version: item.version + 1,
  });
}
