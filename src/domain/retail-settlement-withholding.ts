import { randomUUID } from 'node:crypto';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { CreateRetailSettlementWithholdingEvidenceInput, DecideRetailSettlementWithholdingEvidenceInput, RetailSettlementWithholdingEvidence } from '../shared/retail-commerce-contracts';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const mutate = (state: RevenueOpsState) => ({ ...structuredClone(state), revision: state.revision + 1 });
const scoped = (state: RevenueOpsState, record?: { scope?: RevenueOpsState['scope'] }) => {
  const scope = record?.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};
const date = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) throw new Error(`${label} must use YYYY-MM-DD.`);
  return value;
};
const reference = (value: string, label: string) => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 3 || normalized.length > 160) throw new Error(`${label} must contain 3-160 characters.`);
  return normalized;
};
const evidence = (value: string) => reference(value, 'Withholding decision evidence');

export function createRetailSettlementWithholdingEvidence(state: RevenueOpsState, input: CreateRetailSettlementWithholdingEvidenceInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const settlement = state.retailSettlementReconciliations.find((item) => item.id === input.settlementId && scoped(state, item));
  if (!settlement || settlement.status === 'rejected') throw new Error('Settlement is unavailable for withholding evidence.');
  if (!(settlement.taxWithheldAmount > 0)) throw new Error('Withholding evidence is only required when the settlement contains TDS/TCS.');
  if (input.periodFrom !== settlement.periodFrom || input.periodTo !== settlement.periodTo) throw new Error('Withholding period must match the marketplace settlement period.');
  date(input.periodFrom, 'Withholding period start'); date(input.periodTo, 'Withholding period end');
  if (input.periodFrom > input.periodTo) throw new Error('Withholding period is inverted.');
  if (!Number.isFinite(input.amount) || input.amount < 0 || Math.abs(money(input.amount) - settlement.taxWithheldAmount) > 0.01) throw new Error('Withholding amount must exactly reconcile to the settlement tax withheld amount.');
  if (state.retailSettlementWithholdingEvidence.some((item) => item.settlementId === settlement.id && item.status !== 'rejected' && scoped(state, item))) throw new Error('An active withholding evidence pack already exists for this settlement.');
  const next = mutate(state);
  const record: RetailSettlementWithholdingEvidence = { id, settlementId: settlement.id, connectorId: settlement.connectorId, taxType: input.taxType, periodFrom: input.periodFrom, periodTo: input.periodTo, amount: money(input.amount), certificateReference: reference(input.certificateReference, 'Withholding certificate reference'), challanReference: input.challanReference ? reference(input.challanReference, 'Withholding challan reference') : undefined, status: 'prepared', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 };
  next.retailSettlementWithholdingEvidence.unshift(record);
  return next;
}

export function decideRetailSettlementWithholdingEvidence(state: RevenueOpsState, input: DecideRetailSettlementWithholdingEvidenceInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const record = state.retailSettlementWithholdingEvidence.find((item) => item.id === input.id && item.status === 'prepared' && scoped(state, item));
  if (!record || record.version !== input.expectedVersion) throw new Error('Withholding evidence is stale or already decided.');
  if (record.requestedBy === actorId) throw new Error('Withholding evidence maker cannot decide the same pack.');
  const next = mutate(state);
  next.retailSettlementWithholdingEvidence = next.retailSettlementWithholdingEvidence.map((item) => item.id === record.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionEvidence: evidence(input.evidence), version: item.version + 1 } : item);
  if (input.decision === 'approved') next.retailSettlementReconciliations = next.retailSettlementReconciliations.map((item) => item.id === record.settlementId ? { ...item, withholdingEvidenceId: record.id, version: item.version + 1 } : item);
  return next;
}
