import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Globe2, PackageCheck, RefreshCw } from 'lucide-react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { RetailCommerceChannel } from '../shared/retail-commerce-contracts';
import { computeRetailOmnichannelDesk, type RetailOmnichannelDeskFilter, type RetailOmnichannelDeskRow } from '../domain/retail-omnichannel-desk';
import './RetailOmnichannelOrderDesk.css';

const labels: Record<RetailCommerceChannel, string> = { marketplace: 'Marketplace', ondc: 'ONDC', website: 'Website', whatsapp: 'WhatsApp' };
const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function RetailOmnichannelOrderDesk({ revenue }: { revenue: RevenueOpsSnapshot }): ReactNode {
  const [filter, setFilter] = useState<RetailOmnichannelDeskFilter>('all');
  const report = useMemo(() => computeRetailOmnichannelDesk({ orders: revenue.retailCommerceOrders, connectors: revenue.retailCommerceConnectors, salesOrders: revenue.salesOrders, reservations: revenue.stockReservations, generatedAt: revenue.generatedAt }), [revenue]);
  const rows = filter === 'all' ? report.rows : report.rows.filter((row) => row.channel === filter);
  return <section className="retail-omnichannel-desk" aria-labelledby="retail-omnichannel-desk-title">
    <header className="retail-omnichannel-desk__header"><div><span><Globe2 size={14} aria-hidden="true" /> ONE ORDER DESK</span><h4 id="retail-omnichannel-desk-title">Every channel, one clear next step</h4><p>POS, marketplace, ONDC, website, and WhatsApp orders are shown together. Provider status never silently overwrites local stock custody.</p></div><div className="retail-omnichannel-desk__stamp"><RefreshCw size={14} /> {report.summary.totalOrders} order{report.summary.totalOrders === 1 ? '' : 's'}</div></header>
    <div className="retail-omnichannel-desk__metrics"><article><span>Open demand</span><strong>{report.summary.openOrders}</strong><small>{money(report.summary.openValue)} awaiting completion</small></article><article data-alert={report.summary.attentionCount > 0}><span>Needs attention</span><strong>{report.summary.attentionCount}</strong><small>conflicts, handoffs, stock, or return evidence</small></article><article><span>Stock-ready</span><strong>{report.rows.filter((row) => row.reservationReady).length}</strong><small>confirmed orders with packed stock</small></article></div>
    <nav className="retail-omnichannel-desk__filters" aria-label="Order channels"><button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>All channels</button>{(Object.keys(labels) as RetailCommerceChannel[]).map((channel) => <button type="button" key={channel} className={filter === channel ? 'is-active' : ''} onClick={() => setFilter(channel)}>{labels[channel]} <b>{report.summary.byChannel[channel].count}</b></button>)}</nav>
    <div className="retail-omnichannel-desk__channels">{(Object.keys(labels) as RetailCommerceChannel[]).map((channel) => <div key={channel}><span>{labels[channel]}</span><strong>{money(report.summary.byChannel[channel].value)}</strong><small>{report.summary.byChannel[channel].attention ? `${report.summary.byChannel[channel].attention} need review` : 'No open exception'}</small></div>)}</div>
    <div className="retail-omnichannel-desk__table-wrap"><table><thead><tr><th>Order</th><th>Channel</th><th>State</th><th>Stock</th><th>Next step</th></tr></thead><tbody>{rows.slice(0, 12).map((row) => <OrderRow key={row.orderId} row={row} />)}</tbody></table>{!rows.length ? <p className="retail-omnichannel-desk__empty">No channel orders in this view.</p> : null}</div>
    <footer><CheckCircle2 size={14} /> This desk is an evidence projection. Use the detailed lifecycle controls below to hand off, reserve, fulfil, return, or resolve a conflict.</footer>
  </section>;
}

function OrderRow({ row }: { row: RetailOmnichannelDeskRow }): ReactNode {
  return <tr data-severity={row.severity}><td><strong>{row.orderNumber}</strong><small>{row.connectorCode} · {row.lineCount} line{row.lineCount === 1 ? '' : 's'} · {money(row.totalAmount)}</small></td><td><span className="retail-omnichannel-desk__channel">{labels[row.channel]}</span></td><td><span className="retail-omnichannel-desk__status">{row.status.replaceAll('-', ' ')}</span>{row.remoteStatus && row.remoteStatus !== row.status ? <small><AlertTriangle size={12} /> provider: {row.remoteStatus}</small> : null}</td><td>{row.reservationCount ? <span className="retail-omnichannel-desk__stock"><PackageCheck size={13} /> {row.reservationReady ? 'Packed' : 'Reserved'}</span> : <small>Not reserved</small>}</td><td><strong>{row.nextAction}</strong>{row.blockers.length ? <small className="retail-omnichannel-desk__blockers">{row.blockers[0]}</small> : null}</td></tr>;
}
