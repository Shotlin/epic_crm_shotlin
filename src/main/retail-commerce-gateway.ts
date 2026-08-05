import type { RetailCommerceOrderStatus, RetailCommerceSyncStatus } from '../shared/retail-commerce-contracts';
import type { ProviderJsonResponse } from './provider-gateway-service';

export interface NormalizedRetailCommerceResponse {
  status: Exclude<RetailCommerceSyncStatus, 'prepared'>;
  evidenceReference: string;
  providerReference?: string;
  remoteCursor?: string;
  recordsRead: number;
  recordsAccepted: number;
  recordsRejected: number;
  responseChecksum: string;
  responseByteLength: number;
  orders?: NormalizedRetailCommerceOrder[];
  settlements?: NormalizedRetailCommerceSettlement[];
}

export interface NormalizedRetailCommercePushResponse {
  status: 'acknowledged' | 'failed';
  evidenceReference: string;
  providerReference?: string;
  payloadChecksum?: string;
  recordsAccepted: number;
  responseChecksum: string;
  responseByteLength: number;
}

export interface NormalizedRetailCommerceOrder {
  remoteOrderId: string;
  orderNumber: string;
  remoteCreatedAt: string;
  remoteStatus?: RetailCommerceOrderStatus;
  lines: Array<{ itemVariantId?: string; remoteSku?: string; quantity: number; unitPrice: number; gstRate: number }>;
}

export interface NormalizedRetailCommerceSettlement {
  settlementReference: string;
  periodFrom: string;
  periodTo: string;
  grossAmount: number;
  refundAmount: number;
  feeAmount: number;
  taxWithheldAmount: number;
  remoteOrderIds: string[];
}

const clean = (value: unknown, label: string, minimum = 4, maximum = 300): string => {
  if (typeof value !== 'string') throw new Error(`${label} is required in the canonical provider response.`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
};

const count = (value: unknown, label: string): number => {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative integer in the canonical provider response.`);
  return value as number;
};

const orderText = (value: unknown, label: string, minimum = 2, maximum = 120): string => clean(value, label, minimum, maximum);

function normalizeOrders(payload: Record<string, unknown>, recordsRead: number): NormalizedRetailCommerceOrder[] | undefined {
  if (payload.orders === undefined) return undefined;
  if (!Array.isArray(payload.orders) || payload.orders.length > 500 || payload.orders.length > recordsRead) throw new Error('Canonical provider order payload is inconsistent with recordsRead.');
  return payload.orders.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(`Canonical order ${index + 1} must be an object.`);
    const order = candidate as Record<string, unknown>;
    const remoteCreatedAt = orderText(order.remoteCreatedAt, `Order ${index + 1} remoteCreatedAt`, 20, 80);
    if (!Number.isFinite(Date.parse(remoteCreatedAt))) throw new Error(`Order ${index + 1} remoteCreatedAt must be an ISO timestamp.`);
    if (!Array.isArray(order.lines) || !order.lines.length || order.lines.length > 100) throw new Error(`Order ${index + 1} must contain 1-100 lines.`);
    const lines = order.lines.map((lineCandidate, lineIndex) => {
      if (!lineCandidate || typeof lineCandidate !== 'object' || Array.isArray(lineCandidate)) throw new Error(`Order ${index + 1} line ${lineIndex + 1} must be an object.`);
      const line = lineCandidate as Record<string, unknown>;
      const remoteSku = typeof line.remoteSku === 'string' && line.remoteSku.trim() ? orderText(line.remoteSku, `Order ${index + 1} line ${lineIndex + 1} remoteSku`, 1, 120).toUpperCase() : undefined;
      const itemVariantId = typeof line.itemVariantId === 'string' && line.itemVariantId.trim() ? orderText(line.itemVariantId, `Order ${index + 1} line ${lineIndex + 1} itemVariantId`, 1, 120) : undefined;
      if (!remoteSku && !itemVariantId) throw new Error(`Order ${index + 1} line ${lineIndex + 1} needs a remote SKU or local variant identity.`);
      if (!Number.isFinite(line.quantity) || (line.quantity as number) <= 0 || !Number.isFinite(line.unitPrice) || (line.unitPrice as number) < 0 || !Number.isFinite(line.gstRate) || (line.gstRate as number) < 0 || (line.gstRate as number) > 100) throw new Error(`Order ${index + 1} line ${lineIndex + 1} has invalid quantity, price, or GST.`);
      return { itemVariantId, remoteSku, quantity: line.quantity as number, unitPrice: line.unitPrice as number, gstRate: line.gstRate as number };
    });
    const remoteStatusValue = order.remoteStatus ?? order.status;
    const remoteStatus = remoteStatusValue === undefined ? undefined : orderText(remoteStatusValue, `Order ${index + 1} remoteStatus`, 3, 30) as RetailCommerceOrderStatus;
    if (remoteStatus !== undefined && !['imported', 'confirmed', 'fulfilled', 'cancelled', 'return-requested', 'returned', 'rto'].includes(remoteStatus)) throw new Error(`Order ${index + 1} remoteStatus is not a supported canonical lifecycle status.`);
    return { remoteOrderId: orderText(order.remoteOrderId, `Order ${index + 1} remoteOrderId`), orderNumber: orderText(order.orderNumber, `Order ${index + 1} orderNumber`), remoteCreatedAt, remoteStatus, lines };
  });
}

const settlementAmount = (value: unknown, label: string): number => {
  if (!Number.isFinite(value) || (value as number) < 0) throw new Error(`${label} must be a finite non-negative number in the canonical provider response.`);
  return Math.round((value as number) * 100) / 100;
};

const settlementDate = (value: unknown, label: string): string => {
  const normalized = clean(value, label, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(Date.parse(`${normalized}T00:00:00.000Z`))) throw new Error(`${label} must be an ISO business date.`);
  return normalized;
};

function normalizeSettlements(payload: Record<string, unknown>, recordsRead: number): NormalizedRetailCommerceSettlement[] | undefined {
  if (payload.settlements === undefined) return undefined;
  if (!Array.isArray(payload.settlements) || payload.settlements.length > 500 || payload.settlements.length > recordsRead) throw new Error('Canonical provider settlement payload is inconsistent with recordsRead.');
  return payload.settlements.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(`Settlement ${index + 1} must be an object.`);
    const settlement = candidate as Record<string, unknown>;
    const periodFrom = settlementDate(settlement.periodFrom, `Settlement ${index + 1} periodFrom`);
    const periodTo = settlementDate(settlement.periodTo, `Settlement ${index + 1} periodTo`);
    if (periodFrom > periodTo) throw new Error(`Settlement ${index + 1} period is inverted.`);
    const remoteOrderIds = settlement.remoteOrderIds === undefined ? [] : settlement.remoteOrderIds;
    if (!Array.isArray(remoteOrderIds) || remoteOrderIds.length > 1000) throw new Error(`Settlement ${index + 1} remoteOrderIds must contain 0-1000 IDs.`);
    return {
      settlementReference: orderText(settlement.settlementReference, `Settlement ${index + 1} settlementReference`, 3, 160),
      periodFrom,
      periodTo,
      grossAmount: settlementAmount(settlement.grossAmount, `Settlement ${index + 1} grossAmount`),
      refundAmount: settlementAmount(settlement.refundAmount ?? 0, `Settlement ${index + 1} refundAmount`),
      feeAmount: settlementAmount(settlement.feeAmount, `Settlement ${index + 1} feeAmount`),
      taxWithheldAmount: settlementAmount(settlement.taxWithheldAmount, `Settlement ${index + 1} taxWithheldAmount`),
      remoteOrderIds: remoteOrderIds.map((value, orderIndex) => orderText(value, `Settlement ${index + 1} remoteOrderIds[${orderIndex}]`, 2, 120)),
    };
  });
}

/**
 * Converts an adapter response into the only commerce sync shape the domain can accept.
 * Provider-specific adapters may transform their native payload into this envelope; the
 * generic transport never assumes that an arbitrary 2xx body means a successful sync.
 */
export function normalizeRetailCommerceResponse(response: ProviderJsonResponse): NormalizedRetailCommerceResponse {
  if (!response.ok) {
    return {
      status: 'failed',
      evidenceReference: `HTTP-${response.statusCode}`,
      recordsRead: 0,
      recordsAccepted: 0,
      recordsRejected: 0,
      responseChecksum: response.responseChecksum,
      responseByteLength: response.responseByteLength,
    };
  }
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(response.bodyText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Canonical response must be a JSON object.');
    payload = parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Provider response is not a canonical JSON envelope: ${error instanceof Error ? error.message : 'invalid JSON'}`);
  }
  const status = payload.status;
  if (status !== 'completed' && status !== 'completed-with-exceptions' && status !== 'failed') throw new Error('Provider response must declare a canonical completed, completed-with-exceptions, or failed status.');
  const recordsRead = count(payload.recordsRead, 'recordsRead');
  const recordsAccepted = count(payload.recordsAccepted, 'recordsAccepted');
  const recordsRejected = count(payload.recordsRejected, 'recordsRejected');
  if (recordsAccepted + recordsRejected > recordsRead) throw new Error('Canonical provider response counts are inconsistent.');
  return {
    status,
    evidenceReference: clean(payload.evidenceReference ?? payload.providerReference ?? payload.reference, 'Provider evidence reference'),
    providerReference: typeof payload.providerReference === 'string' ? payload.providerReference.trim() || undefined : undefined,
    remoteCursor: typeof payload.remoteCursor === 'string' ? payload.remoteCursor.trim() || undefined : undefined,
    recordsRead,
    recordsAccepted,
    recordsRejected,
    responseChecksum: response.responseChecksum,
    responseByteLength: response.responseByteLength,
    orders: normalizeOrders(payload, recordsRead),
    settlements: normalizeSettlements(payload, recordsRead),
  };
}

/** Validates the provider receipt for a catalog/inventory push. A 2xx response
 * is not acceptance unless it names the exact prepared payload checksum and
 * confirms every record in the batch. */
export function normalizeRetailCommercePushResponse(response: ProviderJsonResponse, expectedPayloadChecksum: string, expectedRecordCount: number): NormalizedRetailCommercePushResponse {
  if (!response.ok) return { status: 'failed', evidenceReference: `HTTP-${response.statusCode}`, recordsAccepted: 0, responseChecksum: response.responseChecksum, responseByteLength: response.responseByteLength };
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(response.bodyText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Canonical push response must be a JSON object.');
    payload = parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Provider push response is not canonical JSON: ${error instanceof Error ? error.message : 'invalid JSON'}`);
  }
  const status = payload.status;
  if (status !== 'acknowledged' && status !== 'failed') throw new Error('Provider push response must declare acknowledged or failed status.');
  const evidenceReference = clean(payload.evidenceReference ?? payload.providerReference ?? payload.reference, 'Provider push evidence reference');
  const payloadChecksum = payload.payloadChecksum === undefined ? undefined : String(payload.payloadChecksum).trim().toLowerCase();
  if (payloadChecksum !== undefined && !/^[a-f0-9]{64}$/.test(payloadChecksum)) throw new Error('Provider push payload checksum must be a SHA-256 value.');
  if (status === 'acknowledged' && payloadChecksum !== expectedPayloadChecksum.toLowerCase()) throw new Error('Provider push acknowledgement references a different prepared payload checksum.');
  const recordsAccepted = count(payload.recordsAccepted, 'recordsAccepted');
  if (status === 'acknowledged' && recordsAccepted !== expectedRecordCount) throw new Error('Provider push acknowledgement does not cover every prepared SKU record.');
  return { status, evidenceReference, providerReference: typeof payload.providerReference === 'string' ? payload.providerReference.trim() || undefined : undefined, payloadChecksum, recordsAccepted, responseChecksum: response.responseChecksum, responseByteLength: response.responseByteLength };
}
