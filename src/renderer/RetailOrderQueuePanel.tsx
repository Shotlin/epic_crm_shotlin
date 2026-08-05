import { AlertTriangle, ArrowRight, CheckCircle2, Globe2, PackageCheck, ShoppingBag } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { computeRetailOmnichannelDesk, type RetailOmnichannelDeskFilter, type RetailOmnichannelDeskRow } from '../domain/retail-omnichannel-desk';
import type { RevenueOpsSnapshot, SalesOrder, StockReservation } from '../shared/revenue-ops-contracts';
import type { RetailCommerceConnector, RetailCommerceOrder } from '../shared/retail-commerce-contracts';

type QueueFilter = 'all' | 'attention' | 'ready';

const channelLabels: Record<RetailOmnichannelDeskFilter, string> = {
  all: 'All orders',
  marketplace: 'Marketplaces',
  ondc: 'ONDC',
  website: 'Website',
  whatsapp: 'WhatsApp',
};

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export interface RetailOrderQueuePanelProps {
  orders: readonly RetailCommerceOrder[];
  connectors: readonly RetailCommerceConnector[];
  salesOrders: readonly SalesOrder[];
  reservations: readonly StockReservation[];
  generatedAt?: string;
  onOpenAdvanced: () => void;
}

/**
 * The Deliver front door. This is deliberately a read-only projection: all
 * mutations remain in the governed fulfilment workbench opened by the CTA.
 */
export function RetailOrderQueuePanel({ orders, connectors, salesOrders, reservations, generatedAt, onOpenAdvanced }: RetailOrderQueuePanelProps): ReactNode {
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [channel, setChannel] = useState<RetailOmnichannelDeskFilter>('all');
  const report = useMemo(() => computeRetailOmnichannelDesk({
    orders: [...orders],
    connectors: [...connectors],
    salesOrders: [...salesOrders],
    reservations: [...reservations],
    generatedAt,
  }), [channel, connectors, generatedAt, orders, reservations, salesOrders]);
  const rows = report.rows.filter((row) => {
    if (channel !== 'all' && row.channel !== channel) return false;
    if (filter === 'attention') return row.blockers.length > 0;
    if (filter === 'ready') return row.reservationReady;
    return true;
  });
  const selected = rows[0];

  return <section className="retail-order-queue" data-testid="retail-order-queue" aria-labelledby="retail-order-queue-title">
    <header className="retail-order-queue__header">
      <div><span className="eyebrow"><ShoppingBag size={14} aria-hidden="true" /> Deliver / Orders</span><h2 id="retail-order-queue-title">Pack today’s orders</h2><p>Every channel in one queue. Read the next step clearly, then open fulfilment controls when you are ready to act.</p></div>
      <button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open fulfilment controls <ArrowRight size={14} aria-hidden="true" /></button>
    </header>
    <div className="retail-order-queue__metrics" aria-label="Order queue overview">
      <div><ShoppingBag size={17} aria-hidden="true" /><span>Open orders</span><strong>{report.summary.openOrders}</strong><small>{inr.format(report.summary.openValue)} in open demand</small></div>
      <div data-alert={report.summary.attentionCount > 0}><AlertTriangle size={17} aria-hidden="true" /><span>Needs attention</span><strong>{report.summary.attentionCount}</strong><small>conflict, handoff, stock, or return evidence</small></div>
      <div><PackageCheck size={17} aria-hidden="true" /><span>Ready to dispatch</span><strong>{report.rows.filter((row) => row.reservationReady).length}</strong><small>packed stock evidence recorded</small></div>
    </div>
    <nav className="retail-order-queue__filters" aria-label="Order queue filters">
      {([['all', 'All orders'], ['attention', 'Needs attention'], ['ready', 'Ready to dispatch']] as const).map(([value, label]) => <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>)}
      <span className="retail-order-queue__divider" aria-hidden="true" />
      {(Object.keys(channelLabels) as RetailOmnichannelDeskFilter[]).map((value) => <button type="button" key={value} className={channel === value ? 'is-active' : ''} onClick={() => setChannel(value)} aria-pressed={channel === value}><Globe2 size={13} aria-hidden="true" />{channelLabels[value]}</button>)}
    </nav>
    <div className="retail-order-queue__body">
      <div className="retail-order-queue__list" role="list" aria-label="Orders to pack">
        {rows.map((row) => <OrderQueueRow key={row.orderId} row={row} selected={selected?.orderId === row.orderId} />)}
        {!rows.length ? <div className="bharat-empty"><ShoppingBag size={22} aria-hidden="true" /><strong>No orders in this view</strong><span>When governed orders arrive, they will appear here without inventing activity.</span></div> : null}
      </div>
      {selected ? <OrderQueueDetail row={selected} onOpenAdvanced={onOpenAdvanced} /> : null}
    </div>
    <footer className="retail-order-queue__footer"><CheckCircle2 size={14} aria-hidden="true" /> Status is evidence from the local order and stock records. Nothing on this screen writes to Bakaloo or a provider.</footer>
  </section>;
}

function OrderQueueRow({ row, selected }: { row: RetailOmnichannelDeskRow; selected: boolean }): ReactNode {
  return <article className={`retail-order-queue__row${selected ? ' is-selected' : ''}`} data-severity={row.severity} role="listitem"><div><span className="retail-order-queue__order-number">{row.orderNumber}</span><span className="retail-order-queue__channel">{channelLabels[row.channel]}</span></div><strong>{inr.format(row.totalAmount)}</strong><small>{row.lineCount} line{row.lineCount === 1 ? '' : 's'} · {row.status.replaceAll('-', ' ')}</small><span className="retail-order-queue__next">{row.reservationReady ? <PackageCheck size={14} aria-hidden="true" /> : row.blockers.length ? <AlertTriangle size={14} aria-hidden="true" /> : <ShoppingBag size={14} aria-hidden="true" />}{row.nextAction}</span></article>;
}

function OrderQueueDetail({ row, onOpenAdvanced }: { row: RetailOmnichannelDeskRow; onOpenAdvanced: () => void }): ReactNode {
  return <article className="retail-order-queue__detail" aria-label={`Order details for ${row.orderNumber}`}><span className="eyebrow">Selected order</span><h3>{row.orderNumber}</h3><p>{channelLabels[row.channel]} · {row.status.replaceAll('-', ' ')}</p><div className="retail-order-queue__detail-facts"><div><span>Value</span><strong>{inr.format(row.totalAmount)}</strong></div><div><span>Stock custody</span><strong>{row.reservationReady ? 'Packed' : row.reservationCount ? 'Reserved' : 'Not reserved'}</strong></div><div><span>Next step</span><strong>{row.nextAction}</strong></div></div>{row.blockers.length ? <div className="retail-order-queue__blockers"><strong>Review before dispatch</strong>{row.blockers.map((blocker) => <p key={blocker}><AlertTriangle size={14} aria-hidden="true" />{blocker}</p>)}</div> : <p className="retail-order-queue__clear"><CheckCircle2 size={15} aria-hidden="true" /> No exception is recorded in this local view.</p>}<button type="button" className="button button--primary" onClick={onOpenAdvanced}>Open governed action <ArrowRight size={14} aria-hidden="true" /></button></article>;
}

export function RetailOrderQueueFromRevenue({ revenue, onOpenAdvanced }: { revenue: RevenueOpsSnapshot; onOpenAdvanced: () => void }): ReactNode {
  return <RetailOrderQueuePanel orders={revenue.retailCommerceOrders} connectors={revenue.retailCommerceConnectors} salesOrders={revenue.salesOrders} reservations={revenue.stockReservations} generatedAt={revenue.generatedAt} onOpenAdvanced={onOpenAdvanced} />;
}
