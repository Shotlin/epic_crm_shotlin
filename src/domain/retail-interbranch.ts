import { createHash, randomUUID } from 'node:crypto';
import type { AccountingJournalDraft, RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { CreateRetailInterBranchTransferInput, DecideRetailInterBranchTransferInput, DispatchRetailInterBranchTransferInput, ReceiveRetailInterBranchTransferInput, RetailInterBranchTransfer } from '../shared/retail-interbranch-contracts';
import { createInventoryTransfer, transitionInventoryTransfer } from './inventory-warehouse';
import { toIndiaBusinessDate } from '../shared/india-business-date';

const money = (value: number) => Math.round(value * 100) / 100;
const checksum = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value: string, label: string, min = 2, max = 240) => { const normalized = value.trim().replace(/\s+/g, ' '); if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`); return normalized; };
const mutate = (state: RevenueOpsState) => { const next = structuredClone(state); next.revision += 1; return next; };
const sameScope = (state: RevenueOpsState, record: { scope?: RevenueOpsState['scope'] }) => { const scope = record.scope ?? state.scope; return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId; };
const fiscalNumber = (prefix: string, sequence: number, at: string) => { const [yearToken, monthToken] = toIndiaBusinessDate(at).split('-'); const year = Number(yearToken); const month = Number(monthToken); const start = month >= 4 ? year : year - 1; return `${prefix}/${String(start).slice(-2)}-${String(start + 1).slice(-2)}/${String(sequence).padStart(5, '0')}`; };

function transferOrThrow(state: RevenueOpsState, id: string): RetailInterBranchTransfer {
  const transfer = state.retailInterBranchTransfers.find((candidate) => candidate.id === id && sameScope(state, candidate));
  if (!transfer) throw new Error('Inter-branch transfer was not found in the active company and branch.');
  return transfer;
}

function journal(transfer: RetailInterBranchTransfer, phase: 'dispatch' | 'arrival', at: string, actorId: string): AccountingJournalDraft {
  const amount = transfer.totalValue;
  const lines = phase === 'dispatch'
    ? [{ accountCode: 'inventory-in-transit' as const, debit: amount, credit: 0, memo: `${transfer.number} dispatched to ${transfer.destinationBranchId}` }, { accountCode: 'inventory-asset' as const, debit: 0, credit: amount, memo: `${transfer.number} source branch custody released` }]
    : [{ accountCode: 'inventory-asset' as const, debit: amount, credit: 0, memo: `${transfer.number} received at ${transfer.destinationBranchId}` }, { accountCode: 'inventory-in-transit' as const, debit: 0, credit: amount, memo: `${transfer.number} transit custody cleared` }];
  return { id: randomUUID(), sourceType: 'retail-inter-branch-transfer', sourceId: transfer.id, sourceNumber: transfer.number, postingDate: toIndiaBusinessDate(at), lines, totalDebit: amount, totalCredit: amount, status: 'ready', checksum: checksum({ transferId: transfer.id, phase, lines, actorId }), version: 1 };
}

export function createRetailInterBranchTransfer(state: RevenueOpsState, input: CreateRetailInterBranchTransferInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const destinationBranchId = clean(input.destinationBranchId, 'Destination branch', 2, 120);
  if (destinationBranchId === state.scope.branchId) throw new Error('Inter-branch transfer destination must differ from the active branch.');
  if (!input.lines.length) throw new Error('Inter-branch transfer requires at least one item line.');
  const inventoryTransferId = randomUUID();
  const provisional = createInventoryTransfer(state, { fromWarehouseId: input.sourceWarehouseId, toWarehouseId: input.destinationWarehouseId, fromBinId: input.sourceBinId, toBinId: input.destinationBinId, lines: input.lines }, actorId, inventoryTransferId, now);
  const inventoryTransfer = provisional.inventoryTransfers.find((candidate) => candidate.id === inventoryTransferId)!;
  const lines = inventoryTransfer.lines.map((line) => ({ ...line }));
  const transfer: RetailInterBranchTransfer = { id, number: fiscalNumber(input.direction === 'return-to-ho' ? 'RHO' : 'IBT', state.retailInterBranchTransfers.length + 1, now), direction: input.direction, originBranchId: state.scope.branchId, destinationBranchId, sourceWarehouseId: input.sourceWarehouseId, destinationWarehouseId: input.destinationWarehouseId, sourceBinId: input.sourceBinId, destinationBinId: input.destinationBinId, inventoryTransferId, lines, totalValue: money(lines.reduce((total, line) => total + line.quantity * line.unitCost, 0)), status: 'draft', requestedBy: actorId, requestedAt: now, scope: structuredClone(state.scope), version: 1 };
  const next = mutate(provisional); next.retailInterBranchTransfers.unshift(transfer); return next;
}

export function decideRetailInterBranchTransfer(state: RevenueOpsState, input: DecideRetailInterBranchTransferInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const transfer = transferOrThrow(state, input.id);
  if (transfer.status !== 'draft' || transfer.version !== input.expectedVersion) throw new Error('Inter-branch transfer is stale or no longer awaiting approval.');
  const evidence = clean(input.evidenceReference, 'Transfer decision evidence', 3, 240);
  if (transfer.requestedBy === actorId) throw new Error('Inter-branch transfer approval requires an independent reviewer.');
  const next = mutate(state);
  next.retailInterBranchTransfers = next.retailInterBranchTransfers.map((candidate) => candidate.id === transfer.id ? (input.decision === 'approved' ? { ...candidate, status: 'approved' as const, approvedBy: actorId, approvedAt: now, approvalEvidenceReference: evidence, version: candidate.version + 1 } : { ...candidate, status: 'rejected' as const, rejectionReason: evidence, approvedBy: undefined, version: candidate.version + 1 }) : candidate);
  return next;
}

export function dispatchRetailInterBranchTransfer(state: RevenueOpsState, input: DispatchRetailInterBranchTransferInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const transfer = transferOrThrow(state, input.id);
  if (transfer.status !== 'approved' || transfer.version !== input.expectedVersion) throw new Error('Only an approved inter-branch transfer can be dispatched.');
  if (transfer.approvedBy === actorId) throw new Error('Dispatch must be performed by logistics independent of approval.');
  const evidence = clean(input.evidenceReference, 'Dispatch evidence', 3, 240);
  let next = transitionInventoryTransfer(state, { id: transfer.inventoryTransferId, toStatus: 'released', expectedVersion: 1 }, actorId, now);
  next = transitionInventoryTransfer(next, { id: transfer.inventoryTransferId, toStatus: 'in-transit', expectedVersion: 2 }, actorId, now);
  const draft = journal(transfer, 'dispatch', now, actorId); next.journalDrafts.unshift(draft);
  next.retailInterBranchTransfers = next.retailInterBranchTransfers.map((candidate) => candidate.id === transfer.id ? { ...candidate, status: 'dispatched' as const, dispatchedBy: actorId, dispatchedAt: now, dispatchEvidenceReference: evidence, dispatchJournalDraftId: draft.id, version: candidate.version + 1 } : candidate);
  return next;
}

export function receiveRetailInterBranchTransfer(state: RevenueOpsState, input: ReceiveRetailInterBranchTransferInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const transfer = transferOrThrow(state, input.id);
  if (transfer.status !== 'dispatched' || transfer.version !== input.expectedVersion) throw new Error('Only a dispatched inter-branch transfer can be received.');
  if (transfer.dispatchedBy === actorId) throw new Error('Arrival verification must be performed by the destination custodian.');
  const evidence = clean(input.evidenceReference, 'Arrival evidence', 3, 240);
  const next = transitionInventoryTransfer(state, { id: transfer.inventoryTransferId, toStatus: 'received', expectedVersion: 3 }, actorId, now);
  const draft = journal(transfer, 'arrival', now, actorId); next.journalDrafts.unshift(draft);
  next.retailInterBranchTransfers = next.retailInterBranchTransfers.map((candidate) => candidate.id === transfer.id ? { ...candidate, status: 'arrived' as const, arrivedBy: actorId, arrivedAt: now, arrivalEvidenceReference: evidence, arrivalJournalDraftId: draft.id, version: candidate.version + 1 } : candidate);
  return next;
}
