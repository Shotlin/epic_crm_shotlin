import { createHash, randomUUID } from 'node:crypto';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { CreateRetailSettlementAllocationPackInput, DecideRetailSettlementAllocationPackInput, RetailSettlementAllocationPack } from '../shared/retail-commerce-contracts';
import { assertRetailSettlementOrderClosure } from './retail-commerce';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const mutate = (state: RevenueOpsState) => ({ ...structuredClone(state), revision: state.revision + 1 });
const scoped = (state: RevenueOpsState, record?: { scope?: RevenueOpsState['scope'] }) => {
  const scope = record?.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};
const cleanEvidence = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 4 || normalized.length > 500) throw new Error('Settlement allocation evidence must contain 4-500 characters.');
  return normalized;
};
const checksum = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Builds a review-only allocation proposal from an authoritative aggregate
 * settlement. Refunds are assigned only to returned/RTO orders; fees and
 * withholding are distributed by gross share. The proposal is intentionally
 * not an approval or journal posting and returns undefined when the provider
 * payload cannot be safely explained by the scoped order set.
 */
export function proposeRetailSettlementAllocations(state: RevenueOpsState, settlementId: string): RetailSettlementAllocationPack['allocations'] | undefined {
  const settlement = state.retailSettlementReconciliations.find((item) => item.id === settlementId && scoped(state, item));
  if (!settlement || !settlement.orderIds.length) return undefined;
  const orders = settlement.orderIds.map((orderId) => state.retailCommerceOrders.find((order) => order.id === orderId && order.connectorId === settlement.connectorId && scoped(state, order)));
  if (orders.some((order) => !order)) return undefined;
  const resolvedOrders = orders as Array<NonNullable<typeof orders[number]>>;
  const localGross = money(resolvedOrders.reduce((total, order) => total + order.totalAmount, 0));
  if (localGross <= 0 || settlement.grossAmount > localGross + 0.01) return undefined;
  const refundAmount = settlement.refundAmount ?? 0;
  const refundOrders = resolvedOrders.filter((order) => ['returned', 'rto'].includes(order.status));
  if (refundAmount > 0 && !refundOrders.length) return undefined;
  const refundGross = money(refundOrders.reduce((total, order) => total + order.totalAmount, 0));
  if (refundAmount > refundGross + 0.01) return undefined;
  let allocatedGross = 0;
  let allocatedRefund = 0;
  let allocatedFee = 0;
  let allocatedTax = 0;
  const allocations = resolvedOrders.map((order, index) => {
    const last = index === resolvedOrders.length - 1;
    const grossAmount = last ? money(settlement.grossAmount - allocatedGross) : money(settlement.grossAmount * order.totalAmount / localGross);
    const refundEligible = ['returned', 'rto'].includes(order.status);
    const refundIndex = refundEligible ? refundOrders.findIndex((candidate) => candidate.id === order.id) : -1;
    const refundAmountForOrder = !refundEligible ? 0 : (refundIndex === refundOrders.length - 1 ? money(refundAmount - allocatedRefund) : money(refundAmount * order.totalAmount / refundGross));
    const feeAmount = last ? money(settlement.feeAmount - allocatedFee) : money(settlement.feeAmount * grossAmount / Math.max(settlement.grossAmount, 0.01));
    const taxWithheldAmount = last ? money(settlement.taxWithheldAmount - allocatedTax) : money(settlement.taxWithheldAmount * grossAmount / Math.max(settlement.grossAmount, 0.01));
    allocatedGross = money(allocatedGross + grossAmount);
    allocatedRefund = money(allocatedRefund + refundAmountForOrder);
    allocatedFee = money(allocatedFee + feeAmount);
    allocatedTax = money(allocatedTax + taxWithheldAmount);
    return { orderId: order.id, grossAmount, refundAmount: refundAmountForOrder, feeAmount, taxWithheldAmount, netAmount: money(grossAmount - refundAmountForOrder - feeAmount - taxWithheldAmount) };
  });
  if (allocations.some((allocation) => allocation.netAmount < -0.01)) return undefined;
  return allocations;
}

export function createRetailSettlementAllocationPack(state: RevenueOpsState, input: CreateRetailSettlementAllocationPackInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const settlement = state.retailSettlementReconciliations.find((item) => item.id === input.settlementId && scoped(state, item));
  if (!settlement || !['matched', 'variance-review'].includes(settlement.status)) throw new Error('Settlement must have authoritative net evidence before allocation review.');
  if (!settlement.orderIds.length) throw new Error('Provider settlement has no order membership; an allocation pack cannot introduce unverified local orders.');
  if (!input.allocations.length || input.allocations.length > 500) throw new Error('Settlement allocation pack requires 1-500 order allocations.');
  if (new Set(input.allocations.map((allocation) => allocation.orderId)).size !== input.allocations.length) throw new Error('Settlement allocation orders must be unique.');
  const expectedOrderIds = new Set(settlement.orderIds);
  const actualOrderIds = new Set(input.allocations.map((allocation) => allocation.orderId));
  if (actualOrderIds.size !== expectedOrderIds.size || [...expectedOrderIds].some((orderId) => !actualOrderIds.has(orderId))) throw new Error('Settlement allocation must cover every provider-linked order exactly once.');
  if (state.retailSettlementAllocationPacks.some((pack) => pack.settlementId === settlement.id && pack.status !== 'rejected' && scoped(state, pack))) throw new Error('An active allocation pack already exists for this settlement.');
  const allocations = input.allocations.map((allocation) => {
    const order = state.retailCommerceOrders.find((item) => item.id === allocation.orderId && item.connectorId === settlement.connectorId && scoped(state, item));
    if (!order) throw new Error('Every settlement allocation must reference an order from the same connector and branch.');
    const amounts = [allocation.grossAmount, allocation.refundAmount, allocation.feeAmount, allocation.taxWithheldAmount, allocation.netAmount];
    if (!amounts.every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Settlement allocation amounts must be finite and non-negative.');
    const expectedNet = money(allocation.grossAmount - allocation.refundAmount - allocation.feeAmount - allocation.taxWithheldAmount);
    if (Math.abs(expectedNet - allocation.netAmount) > 0.01) throw new Error(`Settlement allocation for ${order.orderNumber} does not balance to net amount.`);
    if (allocation.grossAmount > order.totalAmount + 0.01) throw new Error(`Settlement allocation gross amount exceeds ${order.orderNumber}.`);
    return { orderId: order.id, grossAmount: money(allocation.grossAmount), refundAmount: money(allocation.refundAmount), feeAmount: money(allocation.feeAmount), taxWithheldAmount: money(allocation.taxWithheldAmount), netAmount: money(allocation.netAmount) };
  });
  const totals = allocations.reduce((total, allocation) => ({ gross: money(total.gross + allocation.grossAmount), refund: money(total.refund + allocation.refundAmount), fee: money(total.fee + allocation.feeAmount), tax: money(total.tax + allocation.taxWithheldAmount), net: money(total.net + allocation.netAmount) }), { gross: 0, refund: 0, fee: 0, tax: 0, net: 0 });
  if (Math.abs(totals.net - settlement.netAmount) > 0.01) throw new Error(`Allocation net ${totals.net.toFixed(2)} does not reconcile to settlement net ${settlement.netAmount.toFixed(2)}.`);
  const next = mutate(state);
  const pack: RetailSettlementAllocationPack = { id, settlementId: settlement.id, connectorId: settlement.connectorId, allocations, allocatedGrossAmount: totals.gross, allocatedRefundAmount: totals.refund, allocatedFeeAmount: totals.fee, allocatedTaxWithheldAmount: totals.tax, allocatedNetAmount: totals.net, payloadChecksum: checksum({ settlementId: settlement.id, connectorId: settlement.connectorId, allocations }), status: 'prepared', requestedBy: actorId, requestedAt: now, scope: structuredClone(next.scope), version: 1 };
  next.retailSettlementAllocationPacks.unshift(pack);
  return next;
}

export function decideRetailSettlementAllocationPack(state: RevenueOpsState, input: DecideRetailSettlementAllocationPackInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const pack = state.retailSettlementAllocationPacks.find((item) => item.id === input.id && item.status === 'prepared' && scoped(state, item));
  if (!pack || pack.version !== input.expectedVersion) throw new Error('Settlement allocation pack is stale or already decided.');
  if (pack.requestedBy === actorId) throw new Error('Allocation-pack maker cannot decide the same pack.');
  const settlement = state.retailSettlementReconciliations.find((item) => item.id === pack.settlementId && scoped(state, item));
  if (!settlement) throw new Error('Settlement allocation pack has no current settlement evidence.');
  if (input.decision === 'approved') {
    assertRetailSettlementOrderClosure(state, settlement);
    if (Math.abs(pack.allocatedRefundAmount - (settlement.refundAmount ?? 0)) > 0.01) throw new Error(`Settlement refund/RTO allocation ${pack.allocatedRefundAmount.toFixed(2)} does not reconcile to provider refund ${((settlement.refundAmount ?? 0)).toFixed(2)}.`);
    if (Math.abs(pack.allocatedGrossAmount - settlement.grossAmount) > 0.01 || Math.abs(pack.allocatedFeeAmount - settlement.feeAmount) > 0.01 || Math.abs(pack.allocatedTaxWithheldAmount - settlement.taxWithheldAmount) > 0.01 || Math.abs(pack.allocatedNetAmount - settlement.netAmount) > 0.01) throw new Error('Settlement allocation totals do not reconcile to the authoritative provider settlement.');
  }
  const next = mutate(state);
  next.retailSettlementAllocationPacks = next.retailSettlementAllocationPacks.map((item) => item.id === pack.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionEvidence: cleanEvidence(input.evidence), version: item.version + 1 } : item);
  if (input.decision === 'approved') next.retailSettlementReconciliations = next.retailSettlementReconciliations.map((item) => item.id === pack.settlementId ? { ...item, allocationPackId: pack.id, version: item.version + 1 } : item);
  return next;
}
