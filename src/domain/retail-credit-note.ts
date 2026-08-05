import { createHash, randomUUID } from 'node:crypto';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { PrepareRetailCreditNoteReconciliationInput, RecordRetailCreditNotePortalResponseInput, RetailCreditNoteReconciliation } from '../shared/retail-credit-note-contracts';

const checksum = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value: string, label: string, min = 2, max = 180) => { const v = value.trim().replace(/\s+/g, ' '); if (v.length < min || v.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`); return v; };
const mutate = (state: RevenueOpsState) => { const next = structuredClone(state); next.revision += 1; return next; };
const sameScope = (state: RevenueOpsState, record: { scope?: RevenueOpsState['scope'] }) => { const scope = record.scope ?? state.scope; return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId; };
const fiscalNumber = (index: number, period: string) => `RCN/${period.replace('-', '')}/${String(index).padStart(5, '0')}`;

export function prepareRetailCreditNoteReconciliation(state: RevenueOpsState, input: PrepareRetailCreditNoteReconciliationInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.filingPeriod)) throw new Error('Credit-note filing period must use YYYY-MM.');
  const source = state.retailReturns.find((candidate) => candidate.id === input.retailReturnId && sameScope(state, candidate));
  if (!source || source.status !== 'approved' || !source.financialCredit?.gstCreditEvidence) throw new Error('Credit-note reconciliation requires an approved return with frozen GST evidence.');
  if (state.retailCreditNoteReconciliations.some((candidate) => candidate.retailReturnId === source.id && candidate.filingPeriod === input.filingPeriod && sameScope(state, candidate))) throw new Error('A credit-note reconciliation pack already exists for this return and filing period.');
  const evidence = source.financialCredit.gstCreditEvidence;
  const payload = { retailReturnId: source.id, evidenceId: evidence.id, sourceInvoiceId: evidence.sourceInvoiceId, filingPeriod: input.filingPeriod, taxableValue: evidence.taxableValue, cgst: evidence.cgst, sgst: evidence.sgst, igst: evidence.igst, cess: evidence.cess, totalTax: evidence.totalTax, totalCredit: evidence.totalCredit, lines: evidence.lines };
  const record: RetailCreditNoteReconciliation = { id, number: fiscalNumber(state.retailCreditNoteReconciliations.length + 1, input.filingPeriod), retailReturnId: source.id, retailReturnNumber: source.number, gstCreditEvidenceId: evidence.id, gstCreditEvidenceNumber: evidence.number, sourceInvoiceId: evidence.sourceInvoiceId, sourceInvoiceNumber: evidence.sourceInvoiceNumber, filingPeriod: input.filingPeriod, taxableValue: evidence.taxableValue, cgst: evidence.cgst, sgst: evidence.sgst, igst: evidence.igst, cess: evidence.cess, totalTax: evidence.totalTax, totalCredit: evidence.totalCredit, payloadChecksum: checksum(payload), status: 'prepared', requestedBy: actorId, requestedAt: now, scope: structuredClone(state.scope), version: 1 };
  const next = mutate(state); next.retailCreditNoteReconciliations.unshift(record); return next;
}

export function recordRetailCreditNotePortalResponse(state: RevenueOpsState, input: RecordRetailCreditNotePortalResponseInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const current = state.retailCreditNoteReconciliations.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!current || current.version !== input.expectedVersion) throw new Error('Credit-note reconciliation evidence is stale or missing.');
  if (current.status !== 'prepared' && current.status !== 'drift') throw new Error('Credit-note reconciliation is already final.');
  const remoteChecksum = input.remotePayloadChecksum?.trim();
  if (input.remoteStatus === 'accepted' && !remoteChecksum) throw new Error('Accepted portal responses require the provider payload checksum.');
  const status = input.remoteStatus === 'accepted' ? (remoteChecksum === current.payloadChecksum ? 'matched' : 'drift') : input.remoteStatus;
  const next = mutate(state);
  next.retailCreditNoteReconciliations = next.retailCreditNoteReconciliations.map((candidate) => candidate.id === current.id ? { ...candidate, status, externalReference: input.externalReference?.trim() || undefined, portalPayloadChecksum: remoteChecksum, responseMessage: input.responseMessage ? clean(input.responseMessage, 'Portal response message', 2, 500) : undefined, submittedAt: now, reconciledBy: actorId, reconciledAt: now, version: candidate.version + 1 } : candidate);
  return next;
}
