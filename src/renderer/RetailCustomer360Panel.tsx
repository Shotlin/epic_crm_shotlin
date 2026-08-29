import { ArrowRight, CheckCircle2, CircleAlert, Clock3, MapPin, MessageSquareText, Search, ShieldCheck, ShoppingBag, Sparkles, UsersRound, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PartySnapshot } from '../shared/party-contracts';
import type { RetailCustomerVisit } from '../shared/retail-customer-ops-contracts';
import type { RetailLoyaltyAccount } from '../shared/retail-loyalty-contracts';
import type { RetailSale } from '../shared/retail-pos-contracts';
import { BarChart, type ChartDatum } from './ExecutiveCharts';

export interface RetailCustomer360PanelProps {
  party: PartySnapshot;
  sales: readonly RetailSale[];
  loyaltyAccounts: readonly RetailLoyaltyAccount[];
  visits: readonly RetailCustomerVisit[];
  /** Opens the governed import/quality workspace; this view never invents a customer. */
  onOpenCustomerData: () => void;
  /** Lets a direct rail task open its exact evidence tab. */
  initialTab?: RetailCustomerTab;
}

export type RetailCustomerTab = 'overview' | 'orders' | 'loyalty' | 'support' | 'messages' | 'consent';
const tabs: Array<{ id: RetailCustomerTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders', label: 'Orders' },
  { id: 'loyalty', label: 'Loyalty' },
  { id: 'support', label: 'Support' },
  { id: 'messages', label: 'Messages' },
  { id: 'consent', label: 'Consent' },
];
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });

function saleDate(sale: RetailSale): string | undefined {
  return sale.completedAt ?? sale.saleAt;
}

function formatEvidenceDate(value: string | undefined): string {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : dateFormatter.format(parsed);
}

function customerSales(sales: readonly RetailSale[], accountId: string): RetailSale[] {
  return sales.filter((sale) => sale.customerAccountId === accountId && sale.status === 'completed');
}

/** Retail-first customer 360: high-signal facts first, full evidence on an intentional tab. */
export function RetailCustomer360Panel({ party, sales, loyaltyAccounts, visits, onOpenCustomerData, initialTab = 'overview' }: RetailCustomer360PanelProps): ReactNode {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(party.accounts[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<RetailCustomerTab>(initialTab);
  useEffect(() => setActiveTab(initialTab), [initialTab]);
  const hasCustomers = party.accounts.length > 0;
  const completedSales = useMemo(() => sales.filter((sale) => sale.status === 'completed'), [sales]);
  const filteredAccounts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('en-IN');
    if (!normalized) return party.accounts;
    return party.accounts.filter((account) => {
      const contacts = party.contacts.filter((contact) => contact.accountId === account.id);
      return [account.displayName, account.legalName, account.domain, ...contacts.flatMap((contact) => [contact.firstName, contact.lastName, contact.email, contact.phone])]
        .join(' ')
        .toLocaleLowerCase('en-IN')
        .includes(normalized);
    });
  }, [party.accounts, party.contacts, query]);
  const selected = filteredAccounts.find((account) => account.id === selectedId) ?? filteredAccounts[0];
  const selectedContacts = selected ? party.contacts.filter((contact) => contact.accountId === selected.id) : [];
  const selectedContact = selectedContacts[0];
  const selectedAddresses = selected ? party.addresses.filter((address) => address.accountId === selected.id) : [];
  const selectedSales = selected ? customerSales(completedSales, selected.id) : [];
  const selectedVisits = selected ? visits.filter((visit) => visit.customerAccountId === selected.id) : [];
  const selectedLoyalty = selected ? loyaltyAccounts.find((account) => account.customerAccountId === selected.id) : undefined;
  const marketable = selectedContact
    ? party.consents.some((consent) => consent.contactId === selectedContact.id && consent.purpose === 'marketing' && consent.status === 'granted')
    : false;
  const totalSpend = selectedSales.reduce((sum, sale) => sum + sale.taxPreview.grandTotal, 0);
  const averageBasket = selectedSales.length ? totalSpend / selectedSales.length : undefined;
  const lastSale = [...selectedSales].sort((left, right) => (saleDate(right) ?? '').localeCompare(saleDate(left) ?? ''))[0];
  const salesByAccount = useMemo(() => new Map(party.accounts.map((account) => [account.id, customerSales(completedSales, account.id)])), [completedSales, party.accounts]);
  const accountsWithSales = party.accounts.filter((account) => (salesByAccount.get(account.id)?.length ?? 0) > 0);
  const repeatCustomers = accountsWithSales.filter((account) => (salesByAccount.get(account.id)?.length ?? 0) > 1).length;
  const repeatRate = accountsWithSales.length ? (repeatCustomers / accountsWithSales.length) * 100 : undefined;
  const pointsBalance = loyaltyAccounts.reduce((sum, account) => sum + account.pointsBalance, 0);
  const noSaleRecords = party.accounts.filter((account) => (salesByAccount.get(account.id)?.length ?? 0) === 0).length;
  const categoryData = useMemo<ChartDatum[]>(() => {
    const totals = new Map<string, number>();
    for (const sale of selectedSales) {
      for (const line of sale.lines ?? []) {
        const label = line.description?.trim() || 'Unspecified item';
        totals.set(label, (totals.get(label) ?? 0) + (line.lineTotal ?? line.taxableValue ?? 0));
      }
    }
    return [...totals.entries()].sort(([, left], [, right]) => right - left).slice(0, 5).map(([label, value]) => ({ label, value, color: '#7257D5' }));
  }, [selectedSales]);
  const activity = useMemo(() => [
    ...selectedSales.map((sale) => ({ id: `sale-${sale.id}`, at: saleDate(sale), title: sale.number ?? sale.id, detail: `${inr.format(sale.taxPreview.grandTotal)} completed sale`, kind: 'sale' as const })),
    ...selectedVisits.map((visit) => ({ id: `visit-${visit.id}`, at: visit.visitedAt, title: `${visit.purpose[0]?.toUpperCase() ?? ''}${visit.purpose.slice(1)} via ${visit.channel}`, detail: visit.notes || visit.sourceReference || 'Customer interaction recorded', kind: 'visit' as const })),
  ].sort((left, right) => (right.at ?? '').localeCompare(left.at ?? '')).slice(0, 6), [selectedSales, selectedVisits]);

  return <section className="customer360" data-testid="retail-customer-360" aria-labelledby="retail-customer-360-title">
    <header className="customer360__header">
      <div><span className="eyebrow"><UsersRound size={14} aria-hidden="true" /> Customer 360</span><h1 id="retail-customer-360-title" className="retail-front-door__title">Know the customer without losing the retail context.</h1><p>Identity, consent, purchases, loyalty and service evidence—kept together without inventing activity.</p></div>
      <button type="button" className="button button--quiet" onClick={onOpenCustomerData}>Open customer data <ArrowRight size={14} aria-hidden="true" /></button>
    </header>

    <div className="customer360__metrics customer360__metrics--adaptive" aria-label="Customer overview" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>
      <Metric icon={<UsersRound size={17} aria-hidden="true" />} label="Active customers" value={party.metrics.activeAccounts.toLocaleString('en-IN')} detail={`${party.metrics.activeContacts.toLocaleString('en-IN')} contacts`} />
      <Metric icon={<ShoppingBag size={17} aria-hidden="true" />} label="Repeat rate" value={repeatRate === undefined ? '—' : `${repeatRate.toFixed(1)}%`} detail={repeatRate === undefined ? 'No completed sales' : `${repeatCustomers} repeat customer${repeatCustomers === 1 ? '' : 's'}`} />
      <Metric icon={<Sparkles size={17} aria-hidden="true" />} label="Average basket" value={completedSales.length ? inr.format(completedSales.reduce((sum, sale) => sum + sale.taxPreview.grandTotal, 0) / completedSales.length) : '—'} detail={completedSales.length ? `${completedSales.length} completed sale${completedSales.length === 1 ? '' : 's'}` : 'No sale evidence'} />
      <Metric icon={<ShieldCheck size={17} aria-hidden="true" />} label="Loyalty points" value={pointsBalance.toLocaleString('en-IN')} detail={`${loyaltyAccounts.length} enrolled account${loyaltyAccounts.length === 1 ? '' : 's'}`} />
      <Metric icon={<CircleAlert size={17} aria-hidden="true" />} label="Needs first sale" value={noSaleRecords.toLocaleString('en-IN')} detail="Customer records without a completed sale" />
    </div>

    <div className="customer360__body">
      <div className="customer360__list" aria-label="Customers">
        <strong>Customers</strong>
        <label className="customer360__search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search customers</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search phone, name or customer ID" aria-label="Search customers" /></label>
        {filteredAccounts.length ? filteredAccounts.map((account) => {
          const contact = party.contacts.find((candidate) => candidate.accountId === account.id);
          const count = salesByAccount.get(account.id)?.length ?? 0;
          const loyalty = loyaltyAccounts.find((candidate) => candidate.customerAccountId === account.id);
          return <button type="button" key={account.id} className={selected?.id === account.id ? 'customer360__customer customer360__customer--selected' : 'customer360__customer'} onClick={() => { setSelectedId(account.id); setActiveTab('overview'); }} aria-pressed={selected?.id === account.id}>
            <span className="customer360__avatar">{account.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{account.displayName}</strong><small>{contact?.phone || contact?.email || 'No contact point'} · {count} order{count === 1 ? '' : 's'}</small></span>{loyalty ? <em className="customer360__consent customer360__consent--yes">{loyalty.tier}</em> : <ArrowRight size={15} aria-hidden="true" />}
          </button>;
        }) : <div className="bharat-empty"><UsersRound size={21} aria-hidden="true" /><strong>{hasCustomers ? 'No customer matches' : 'No customers in this workspace yet'}</strong><span>{hasCustomers ? 'Try a name, phone number, or email.' : 'Import verified customer records or create a real customer record. Epic BOS never creates fictional customers.'}</span>{hasCustomers ? null : <button type="button" className="button button--quiet" onClick={onOpenCustomerData}>Open customer data <ArrowRight size={14} aria-hidden="true" /></button>}</div>}
      </div>

      {selected ? <article className="customer360__detail" aria-label={`Customer details for ${selected.displayName}`}>
        <div className="customer360__detail-head"><div><span className="eyebrow">Customer profile</span><h3>{selected.displayName}</h3><p>{selectedContact?.phone || selected.domain || 'Retail customer'} · {selected.relationship}</p></div><div>{marketable ? <span className="customer360__consent customer360__consent--yes"><CheckCircle2 size={14} aria-hidden="true" /> Marketing consent</span> : <span className="customer360__consent"><XCircle size={14} aria-hidden="true" /> Marketing restricted</span>} {selectedLoyalty ? <span className="customer360__consent customer360__consent--yes">{selectedLoyalty.tier}</span> : null}</div></div>
        <div className="customer360__facts customer360__facts--adaptive" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))' }}>
          <Fact label="LTV" value={inr.format(totalSpend)} detail="Completed retail sales" />
          <Fact label="Orders" value={selectedSales.length.toLocaleString('en-IN')} detail="Completed only" />
          <Fact label="Avg basket" value={averageBasket === undefined ? '—' : inr.format(averageBasket)} detail="Per completed sale" />
          <Fact label="Last order" value={lastSale ? formatEvidenceDate(saleDate(lastSale)) : '—'} detail={lastSale ? lastSale.number ?? lastSale.id : 'No sale recorded'} />
          <Fact label="Points" value={selectedLoyalty ? selectedLoyalty.pointsBalance.toLocaleString('en-IN') : '—'} detail={selectedLoyalty ? `${selectedLoyalty.tier} tier` : 'Not enrolled'} />
        </div>
        <nav className="customer360__tabs" aria-label="Customer record sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
          {tabs.map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? 'button button--quiet is-active' : 'button button--quiet'} onClick={() => setActiveTab(tab.id)} aria-pressed={activeTab === tab.id}>{tab.label}</button>)}
        </nav>
        {activeTab === 'overview' ? <div className="customer360__tab-grid customer360__tab-grid--overview" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14, paddingTop: 16 }}>
          <BarChart title="Purchased items by recorded value" data={categoryData} formatValue={(value) => inr.format(value)} />
          <section className="customer360__addresses" aria-labelledby="customer-activity-title"><span className="eyebrow">Recent activity</span><h4 id="customer-activity-title">Evidence timeline</h4>{activity.length ? activity.map((item) => <div key={item.id}><span className="customer360__avatar"><Clock3 size={14} aria-hidden="true" /></span><span><strong>{item.title}</strong><small>{formatEvidenceDate(item.at)} · {item.detail}</small></span></div>) : <p>No purchase or visit evidence has been recorded for this customer.</p>}</section>
        </div> : null}
        {activeTab === 'orders' ? <CustomerOrders sales={selectedSales} /> : null}
        {activeTab === 'loyalty' ? <section className="customer360__addresses"><span className="eyebrow">Loyalty evidence</span>{selectedLoyalty ? <><div><Sparkles size={15} aria-hidden="true" /><span><strong>{selectedLoyalty.pointsBalance.toLocaleString('en-IN')} available points</strong><small>{selectedLoyalty.tier} · {selectedLoyalty.lifetimePointsEarned.toLocaleString('en-IN')} earned · {selectedLoyalty.lifetimePointsRedeemed.toLocaleString('en-IN')} redeemed</small></span></div><small>Redemption remains a governed checkout action.</small></> : <p>This customer has no enrolled loyalty account.</p>}</section> : null}
        {activeTab === 'support' ? <CustomerVisits title="Support and return interactions" visits={selectedVisits.filter((visit) => visit.purpose === 'service' || visit.purpose === 'return')} /> : null}
        {activeTab === 'messages' ? <section className="customer360__addresses"><span className="eyebrow"><MessageSquareText size={14} aria-hidden="true" /> Messages</span><p>No message event is fabricated here. Connect a consented communication provider and import its governed message evidence through customer data.</p><button type="button" className="button button--quiet" onClick={onOpenCustomerData}>Open customer data <ArrowRight size={14} aria-hidden="true" /></button></section> : null}
        {activeTab === 'consent' ? <CustomerConsent party={party} contactId={selectedContact?.id} /> : null}
        <details className="customer360__addresses"><summary>Addresses and contact points</summary>{selectedAddresses.length ? selectedAddresses.map((address) => <div key={address.id}><MapPin size={15} aria-hidden="true" /><span><strong>{address.label || address.type}</strong><small>{[address.line1, address.line2, address.city, address.region, address.postalCode].filter(Boolean).join(', ')}</small></span>{address.primary ? <em>Primary</em> : null}</div>) : <p>No address is recorded for this customer.</p>}</details>
      </article> : <div className="bharat-empty customer360__detail"><UsersRound size={24} aria-hidden="true" /><strong>{hasCustomers ? 'Select a customer' : 'Ready for your first verified customer'}</strong><span>{hasCustomers ? 'Choose a customer to see their governed retail context.' : 'Start with an import or a real customer record; this workspace stays empty until then.'}</span>{hasCustomers ? null : <button type="button" className="button button--primary" onClick={onOpenCustomerData}>Open customer data <ArrowRight size={14} aria-hidden="true" /></button>}</div>}
    </div>
  </section>;
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }): ReactNode {
  return <div>{icon}<span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Fact({ label, value, detail }: { label: string; value: string; detail: string }): ReactNode {
  return <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function CustomerOrders({ sales }: { sales: readonly RetailSale[] }): ReactNode {
  return <section className="customer360__addresses" aria-labelledby="customer-orders-title"><span className="eyebrow">Orders</span><h4 id="customer-orders-title">Completed retail orders</h4>{sales.length ? <div className="customer360__order-list" style={{ display: 'grid', gap: 8 }} role="list">{sales.map((sale) => <div key={sale.id} role="listitem"><ShoppingBag size={15} aria-hidden="true" /><span><strong>{sale.number ?? sale.id}</strong><small>{formatEvidenceDate(saleDate(sale))} · {sale.tenders?.map((tender) => tender.method).join(', ') || 'Tender not recorded'}</small></span><em>{inr.format(sale.taxPreview.grandTotal)}</em></div>)}</div> : <p>No completed retail order is linked to this customer.</p>}</section>;
}

function CustomerVisits({ title, visits }: { title: string; visits: readonly RetailCustomerVisit[] }): ReactNode {
  return <section className="customer360__addresses"><span className="eyebrow">Support</span><h4>{title}</h4>{visits.length ? visits.map((visit) => <div key={visit.id}><Clock3 size={15} aria-hidden="true" /><span><strong>{visit.purpose} via {visit.channel}</strong><small>{formatEvidenceDate(visit.visitedAt)} · {visit.notes || visit.sourceReference || 'No note attached'}</small></span></div>) : <p>No service or return interaction is recorded.</p>}</section>;
}

function CustomerConsent({ party, contactId }: { party: PartySnapshot; contactId?: string }): ReactNode {
  const consents = contactId ? party.consents.filter((consent) => consent.contactId === contactId) : [];
  return <section className="customer360__addresses"><span className="eyebrow">Consent</span><h4>Recorded communication permission</h4>{consents.length ? consents.map((consent) => <div key={consent.id}><ShieldCheck size={15} aria-hidden="true" /><span><strong>{consent.purpose} · {consent.status}</strong><small>{consent.channel} · source: {consent.source} · recorded {formatEvidenceDate(consent.capturedAt)}</small></span></div>) : <p>No consent record is available for the selected primary contact.</p>}</section>;
}
