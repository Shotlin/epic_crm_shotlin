import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { PartyAccount } from '../shared/party-contracts';
import type { SupportTicket } from '../shared/delivery-contracts';

export interface CustomerPortalOrder {
  id: string;
  number: string;
  orderDate: string;
  requiredBy: string;
  status: RevenueOpsState['salesOrders'][number]['status'];
  fulfilmentStatus: RevenueOpsState['salesOrders'][number]['fulfilmentStatus'];
  amount: number;
  lines: Array<{ description: string; quantity: number; unitPrice: number; totalAmount: number }>;
  fulfilment: Array<{ kind: RevenueOpsState['fulfilmentTasks'][number]['kind']; title: string; status: RevenueOpsState['fulfilmentTasks'][number]['status']; dueAt: string }>;
  deliveryEvidence: Array<{ type: RevenueOpsState['deliveryEvidence'][number]['type']; reference: string; occurredAt: string }>;
}

export interface CustomerPortalInvoice {
  id: string;
  number: string;
  invoiceDate: string;
  dueDate: string;
  status: RevenueOpsState['invoices'][number]['status'];
  amountDue: number;
  outstandingAmount: number;
  currency: 'INR';
}

export interface CustomerPortalTicket {
  id: string;
  number: string;
  title: string;
  priority: SupportTicket['priority'];
  status: SupportTicket['status'];
  responseDueAt: string;
  resolutionDueAt: string;
  resolvedAt?: string;
}

export interface CustomerPortalSnapshot {
  accountId: string;
  accountName: string;
  generatedAt: string;
  orders: CustomerPortalOrder[];
  invoices: CustomerPortalInvoice[];
  tickets: CustomerPortalTicket[];
}

type CustomerPortalSource = Pick<RevenueOpsSnapshot, 'scope' | 'salesOrders' | 'fulfilmentTasks' | 'deliveryEvidence' | 'invoices' | 'receivables' | 'supportTickets'> & { accounts: PartyAccount[] };

function inScope(state: CustomerPortalSource, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

/** Customer-facing read model: commercial progress and service commitments only. */
export function buildCustomerPortalSnapshot(state: CustomerPortalSource, accountId: string, generatedAt = new Date().toISOString()): CustomerPortalSnapshot | null {
  const account = state.accounts.find((candidate) => candidate.id === accountId && candidate.relationship === 'customer' && candidate.status === 'active' && candidate.companyId === state.scope.companyId);
  if (!account) return null;
  const orders = state.salesOrders.filter((order) => order.accountId === account.id && inScope(state, order) && order.status !== 'cancelled').map((order) => ({
    id: order.id,
    number: order.number,
    orderDate: order.orderDate,
    requiredBy: order.requiredBy,
    status: order.status,
    fulfilmentStatus: order.fulfilmentStatus,
    amount: order.subtotal + order.taxPreview.totalTax - order.discountTotal,
    lines: order.lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, totalAmount: line.taxableValue + line.taxableValue * (line.gstRate + (line.cessRate ?? 0)) / 100 })),
    fulfilment: state.fulfilmentTasks.filter((task) => task.salesOrderId === order.id && inScope(state, task)).map((task) => ({ kind: task.kind, title: task.title, status: task.status, dueAt: task.dueAt })),
    deliveryEvidence: state.deliveryEvidence.filter((evidence) => evidence.salesOrderId === order.id && inScope(state, evidence)).map((evidence) => ({ type: evidence.type, reference: evidence.reference, occurredAt: evidence.occurredAt })),
  })).sort((left, right) => right.orderDate.localeCompare(left.orderDate) || left.number.localeCompare(right.number));
  const orderIds = new Set(orders.map(({ id }) => id));
  const invoices = state.invoices.filter((invoice) => invoice.accountId === account.id && Boolean(invoice.salesOrderId) && orderIds.has(invoice.salesOrderId!) && inScope(state, invoice) && invoice.status !== 'draft' && invoice.status !== 'cancelled').map((invoice) => {
    const receivable = state.receivables.find((item) => item.invoiceId === invoice.id && inScope(state, item));
    return { id: invoice.id, number: invoice.number, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, status: invoice.status, amountDue: invoice.amountDue, outstandingAmount: receivable?.outstandingAmount ?? invoice.amountDue, currency: 'INR' as const };
  }).sort((left, right) => right.invoiceDate.localeCompare(left.invoiceDate) || left.number.localeCompare(right.number));
  const tickets = state.supportTickets.filter((ticket) => ticket.accountId === account.id && inScope(state, ticket) && !['cancelled', 'closed'].includes(ticket.status)).map((ticket) => ({ id: ticket.id, number: ticket.number, title: ticket.title, priority: ticket.priority, status: ticket.status, responseDueAt: ticket.responseDueAt, resolutionDueAt: ticket.resolutionDueAt, resolvedAt: ticket.resolvedAt })).sort((left, right) => left.resolutionDueAt.localeCompare(right.resolutionDueAt) || left.number.localeCompare(right.number));
  return { accountId: account.id, accountName: account.displayName || account.legalName, generatedAt, orders, invoices, tickets };
}
