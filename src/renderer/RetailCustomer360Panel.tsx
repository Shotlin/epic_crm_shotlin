import { ArrowRight, CheckCircle2, MapPin, Search, ShieldCheck, ShoppingBag, UsersRound, XCircle } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { PartySnapshot } from '../shared/party-contracts';
import type { RetailCustomerVisit } from '../shared/retail-customer-ops-contracts';
import type { RetailLoyaltyAccount } from '../shared/retail-loyalty-contracts';
import type { RetailSale } from '../shared/retail-pos-contracts';

export interface RetailCustomer360PanelProps {
  party: PartySnapshot;
  sales: readonly RetailSale[];
  loyaltyAccounts: readonly RetailLoyaltyAccount[];
  visits: readonly RetailCustomerVisit[];
  /** Opens the governed import/quality workspace; this view never invents a customer. */
  onOpenCustomerData: () => void;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** Plain-language retail customer view; mutation remains in the governed customer-data workspace. */
export function RetailCustomer360Panel({ party, sales, loyaltyAccounts, visits, onOpenCustomerData }: RetailCustomer360PanelProps): ReactNode {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(party.accounts[0]?.id ?? null);
  const hasCustomers = party.accounts.length > 0;
  const filteredAccounts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return party.accounts;
    return party.accounts.filter((account) => {
      const contacts = party.contacts.filter((contact) => contact.accountId === account.id);
      return [account.displayName, account.legalName, account.domain, ...contacts.flatMap((contact) => [contact.firstName, contact.lastName, contact.email, contact.phone])].join(' ').toLowerCase().includes(normalized);
    });
  }, [party.accounts, party.contacts, query]);
  const selected = filteredAccounts.find((account) => account.id === selectedId) ?? filteredAccounts[0];
  const selectedContacts = selected ? party.contacts.filter((contact) => contact.accountId === selected.id) : [];
  const selectedContact = selectedContacts[0];
  const selectedAddresses = selected ? party.addresses.filter((address) => address.accountId === selected.id) : [];
  const selectedSales = selected ? sales.filter((sale) => sale.customerAccountId === selected.id && sale.status === 'completed') : [];
  const selectedVisits = selected ? visits.filter((visit) => visit.customerAccountId === selected.id) : [];
  const selectedLoyalty = selected ? loyaltyAccounts.find((account) => account.customerAccountId === selected.id) : undefined;
  const marketable = selectedContact ? party.consents.some((consent) => consent.contactId === selectedContact.id && consent.purpose === 'marketing' && consent.status === 'granted') : false;
  const totalSpend = selectedSales.reduce((sum, sale) => sum + sale.taxPreview.grandTotal, 0);

  return (
    <section className="customer360" data-testid="retail-customer-360" aria-labelledby="retail-customer-360-title">
      <header className="customer360__header">
        <div><span className="eyebrow">Customers / Customer 360</span><h2 id="retail-customer-360-title">Look after every customer</h2><p>Identity, consent, visits, loyalty, and local purchase history in one calm view.</p></div>
        <button type="button" className="button button--quiet" onClick={onOpenCustomerData}>Open customer data <ArrowRight size={14} aria-hidden="true" /></button>
      </header>
      <div className="customer360__metrics" aria-label="Customer overview">
        <div><UsersRound size={17} aria-hidden="true" /><span>Customers</span><strong>{party.metrics.activeAccounts}</strong></div>
        <div><ShieldCheck size={17} aria-hidden="true" /><span>Marketable contacts</span><strong>{party.metrics.marketableContacts}</strong></div>
        <div><MapPin size={17} aria-hidden="true" /><span>Complete addresses</span><strong>{party.metrics.completeAddresses}</strong></div>
        <div><ShoppingBag size={17} aria-hidden="true" /><span>Local sales</span><strong>{sales.filter((sale) => sale.status === 'completed').length}</strong></div>
      </div>
      <div className="customer360__body">
        <div className="customer360__list">
          <label className="customer360__search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search customers</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, email…" aria-label="Search customers" /></label>
          {filteredAccounts.length ? filteredAccounts.map((account) => {
            const contact = party.contacts.find((candidate) => candidate.accountId === account.id);
            const count = sales.filter((sale) => sale.customerAccountId === account.id && sale.status === 'completed').length;
            return <button type="button" key={account.id} className={selected?.id === account.id ? 'customer360__customer customer360__customer--selected' : 'customer360__customer'} onClick={() => setSelectedId(account.id)} aria-pressed={selected?.id === account.id}><span className="customer360__avatar">{account.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{account.displayName}</strong><small>{contact ? `${contact.firstName} ${contact.lastName}` : 'No primary contact'} · {count} sale{count === 1 ? '' : 's'}</small></span><ArrowRight size={15} aria-hidden="true" /></button>;
          }) : <div className="bharat-empty"><UsersRound size={21} aria-hidden="true" /><strong>{hasCustomers ? 'No customer matches' : 'No customers in this workspace yet'}</strong><span>{hasCustomers ? 'Try a name, phone number, or email.' : 'Import verified customer records or create a real customer record. Epic BOS never creates fictional customers.'}</span>{hasCustomers ? null : <button type="button" className="button button--quiet" onClick={onOpenCustomerData}>Open customer data <ArrowRight size={14} aria-hidden="true" /></button>}</div>}
        </div>
        {selected ? <article className="customer360__detail" aria-label={`Customer details for ${selected.displayName}`}>
          <div className="customer360__detail-head"><div><span className="eyebrow">Customer profile</span><h3>{selected.displayName}</h3><p>{selected.relationship} · {selected.domain || 'Retail customer'}</p></div><span className={marketable ? 'customer360__consent customer360__consent--yes' : 'customer360__consent'}>{marketable ? <CheckCircle2 size={14} aria-hidden="true" /> : <XCircle size={14} aria-hidden="true" />} {marketable ? 'Marketing consent' : 'Marketing restricted'}</span></div>
          <div className="customer360__facts"><div><span>Primary contact</span><strong>{selectedContact ? `${selectedContact.firstName} ${selectedContact.lastName}` : 'Not added'}</strong><small>{selectedContact?.phone || selectedContact?.email || 'Add a phone or email in customer controls.'}</small></div><div><span>Loyalty</span><strong>{selectedLoyalty ? `${selectedLoyalty.tier} · ${selectedLoyalty.pointsBalance.toLocaleString('en-IN')} points` : 'Not enrolled'}</strong><small>{selectedLoyalty ? `${selectedLoyalty.lifetimePointsEarned.toLocaleString('en-IN')} lifetime points earned` : 'Enrollment remains approval-governed.'}</small></div><div><span>Purchase history</span><strong>{inr.format(totalSpend)}</strong><small>{selectedSales.length} completed sale{selectedSales.length === 1 ? '' : 's'} recorded locally</small></div><div><span>Visits</span><strong>{selectedVisits.length}</strong><small>{selectedVisits.length ? 'Recorded store and online interactions' : 'No visit history recorded'}</small></div></div>
          <div className="customer360__addresses"><span className="eyebrow">Saved addresses</span>{selectedAddresses.length ? selectedAddresses.map((address) => <div key={address.id}><MapPin size={15} aria-hidden="true" /><span><strong>{address.label || address.type}</strong><small>{[address.line1, address.line2, address.city, address.region, address.postalCode].filter(Boolean).join(', ')}</small></span>{address.primary ? <em>Primary</em> : null}</div>) : <p>No address is recorded for this customer.</p>}</div>
        </article> : <div className="bharat-empty customer360__detail"><UsersRound size={24} aria-hidden="true" /><strong>{hasCustomers ? 'Select a customer' : 'Ready for your first verified customer'}</strong><span>{hasCustomers ? 'Choose a customer to see their governed retail context.' : 'Start with an import or a real customer record; this workspace stays empty until then.'}</span>{hasCustomers ? null : <button type="button" className="button button--primary" onClick={onOpenCustomerData}>Open customer data <ArrowRight size={14} aria-hidden="true" /></button>}</div>}
      </div>
    </section>
  );
}
