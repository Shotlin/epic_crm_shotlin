import type {
  RetailCommerceChannel,
  RetailCommerceConnector,
  RetailCommerceOrder,
  RetailCommerceOrderStatus,
} from '../shared/retail-commerce-contracts';
import type { SalesOrder, StockReservation } from '../shared/revenue-ops-contracts';

export type RetailOmnichannelDeskSeverity = 'critical' | 'high' | 'medium' | 'low';
export type RetailOmnichannelDeskFilter = 'all' | RetailCommerceChannel;

export interface RetailOmnichannelDeskRow {
  orderId: string;
  orderNumber: string;
  channel: RetailCommerceChannel;
  connectorCode: string;
  status: RetailCommerceOrderStatus;
  remoteStatus?: RetailCommerceOrderStatus;
  totalAmount: number;
  lineCount: number;
  localSalesOrderId?: string;
  reservationCount: number;
  reservationReady: boolean;
  severity: RetailOmnichannelDeskSeverity;
  nextAction: string;
  blockers: string[];
}

export interface RetailOmnichannelDeskSummary {
  totalOrders: number;
  openOrders: number;
  attentionCount: number;
  openValue: number;
  byChannel: Record<RetailCommerceChannel, { count: number; value: number; attention: number }>;
}

export interface RetailOmnichannelDeskReport {
  generatedAt: string;
  summary: RetailOmnichannelDeskSummary;
  rows: RetailOmnichannelDeskRow[];
}

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const openStatuses = new Set<RetailCommerceOrderStatus>(['imported', 'confirmed', 'return-requested']);
const terminalStatuses = new Set<RetailCommerceOrderStatus>(['fulfilled', 'cancelled', 'returned', 'rto']);
const channels: RetailCommerceChannel[] = ['marketplace', 'ondc', 'website', 'whatsapp'];

function channelOf(connector: RetailCommerceConnector | undefined): RetailCommerceChannel {
  return connector?.channel ?? 'marketplace';
}

function severityRank(value: RetailOmnichannelDeskSeverity): number {
  return value === 'critical' ? 4 : value === 'high' ? 3 : value === 'medium' ? 2 : 1;
}

/**
 * Builds one plain-language order desk from every remote channel. It is a
 * read projection only: it never changes stock, sales orders, or provider
 * state. A remote status is evidence, not permission to overwrite local
 * custody, so divergences become blockers for an operator to review.
 */
export function computeRetailOmnichannelDesk({
  orders,
  connectors,
  salesOrders = [],
  reservations = [],
  generatedAt = new Date().toISOString(),
}: {
  orders: RetailCommerceOrder[];
  connectors: RetailCommerceConnector[];
  salesOrders?: SalesOrder[];
  reservations?: StockReservation[];
  generatedAt?: string;
}): RetailOmnichannelDeskReport {
  const connectorById = new Map(connectors.map((connector) => [connector.id, connector]));
  const salesOrderById = new Map(salesOrders.map((order) => [order.id, order]));
  const reservationsByOrder = new Map<string, StockReservation[]>();
  reservations.forEach((reservation) => {
    const current = reservationsByOrder.get(reservation.salesOrderId) ?? [];
    current.push(reservation);
    reservationsByOrder.set(reservation.salesOrderId, current);
  });
  const rows = orders.map((order): RetailOmnichannelDeskRow => {
    const connector = connectorById.get(order.connectorId);
    const channel = channelOf(connector);
    const orderReservations = order.localSalesOrderId ? reservationsByOrder.get(order.localSalesOrderId) ?? [] : [];
    const activeReservations = orderReservations.filter(({ status }) => status !== 'released' && status !== 'consumed');
    const reservationReady = activeReservations.length > 0 && activeReservations.every(({ status }) => status === 'packed');
    const blockers: string[] = [];

    if (order.remoteStatus && terminalStatuses.has(order.remoteStatus) && order.remoteStatus !== order.status) {
      blockers.push(`Channel says ${order.remoteStatus}, but the local order is still ${order.status}.`);
    }
    if (['imported', 'confirmed'].includes(order.status) && !order.localSalesOrderId) {
      blockers.push('No local sales-order handoff exists.');
    }
    if (order.status === 'confirmed' && order.localSalesOrderId && !activeReservations.length) {
      blockers.push('Stock is not reserved for this order.');
    }
    if (order.status === 'fulfilled' && activeReservations.some(({ status }) => status === 'reserved')) {
      blockers.push('The order is marked fulfilled while stock is still only reserved.');
    }
    if (['returned', 'rto'].includes(order.status) && (!order.retailReturnId || !order.creditNoteReconciliationId || !order.inventoryEvidenceReference)) {
      blockers.push('Return/RTO is missing local return, GST credit-note, or inventory evidence.');
    }
    const salesOrder = order.localSalesOrderId ? salesOrderById.get(order.localSalesOrderId) : undefined;
    if (order.localSalesOrderId && !salesOrder) blockers.push('The linked local sales order is outside the current view.');

    let severity: RetailOmnichannelDeskSeverity = 'low';
    if (blockers.some((blocker) => blocker.includes('Channel says'))) severity = 'critical';
    else if (blockers.some((blocker) => blocker.includes('Return/RTO') || blocker.includes('fulfilled'))) severity = 'high';
    else if (blockers.length) severity = 'medium';

    let nextAction = terminalStatuses.has(order.status) ? 'Review evidence and close the channel record.' : 'Review order details.';
    if (blockers.some((blocker) => blocker.includes('Channel says'))) nextAction = 'Compare provider evidence, then approve a lifecycle conflict decision.';
    else if (blockers.some((blocker) => blocker.includes('handoff'))) nextAction = 'Match this order to an approved local sales order.';
    else if (blockers.some((blocker) => blocker.includes('not reserved'))) nextAction = 'Reserve available stock before accepting fulfilment.';
    else if (blockers.some((blocker) => blocker.includes('only reserved'))) nextAction = 'Complete packing or issuing evidence before marking fulfilled.';
    else if (blockers.some((blocker) => blocker.includes('Return/RTO'))) nextAction = 'Link the approved return, GST credit note, and inventory receipt.';
    else if (order.status === 'imported') nextAction = 'Confirm the order after local validation.';
    else if (order.status === 'confirmed' && reservationReady) nextAction = 'Send the packed order to fulfilment.';

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel,
      connectorCode: connector?.code ?? order.connectorId,
      status: order.status,
      remoteStatus: order.remoteStatus,
      totalAmount: money(order.totalAmount),
      lineCount: order.lines.length,
      localSalesOrderId: order.localSalesOrderId,
      reservationCount: activeReservations.length,
      reservationReady,
      severity,
      nextAction,
      blockers,
    };
  }).sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || right.totalAmount - left.totalAmount || left.orderNumber.localeCompare(right.orderNumber));

  const byChannel = channels.reduce((result, channel) => {
    const channelRows = rows.filter((row) => row.channel === channel);
    result[channel] = {
      count: channelRows.length,
      value: money(channelRows.filter((row) => openStatuses.has(row.status)).reduce((total, row) => total + row.totalAmount, 0)),
      attention: channelRows.filter((row) => row.blockers.length > 0).length,
    };
    return result;
  }, {} as RetailOmnichannelDeskSummary['byChannel']);
  const openRows = rows.filter((row) => openStatuses.has(row.status));
  return {
    generatedAt,
    summary: {
      totalOrders: rows.length,
      openOrders: openRows.length,
      attentionCount: rows.filter((row) => row.blockers.length > 0).length,
      openValue: money(openRows.reduce((total, row) => total + row.totalAmount, 0)),
      byChannel,
    },
    rows,
  };
}
