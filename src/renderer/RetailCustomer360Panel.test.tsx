import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PartySnapshot } from '../shared/party-contracts';
import type { RetailSale } from '../shared/retail-pos-contracts';
import { createCleanPartyState, getPartySnapshot } from '../domain/party';
import { RetailCustomer360Panel } from './RetailCustomer360Panel';

const party = {
  revision: 2, generatedAt: '2026-08-03T09:00:00Z',
  accounts: [{ id: 'account-1', tenantId: 't', companyId: 'c', displayName: 'Asha Retail', legalName: 'Asha Retail', domain: 'Grocery', industry: 'Retail', relationship: 'customer', ownerId: 'owner', status: 'active', version: 1 }],
  contacts: [{ id: 'contact-1', accountId: 'account-1', firstName: 'Asha', lastName: 'Kumar', email: 'asha@example.in', phone: '+919999999999', jobTitle: 'Owner', ownerId: 'owner', status: 'active', version: 1 }],
  addresses: [{ id: 'address-1', accountId: 'account-1', type: 'shipping', label: 'Store', line1: '1 Market Road', line2: '', city: 'Kolkata', region: 'WB', postalCode: '700001', countryCode: 'IN', primary: true, status: 'active', version: 1 }],
  contactPoints: [], relationships: [], leadConversions: [], merges: [], duplicateCandidates: [],
  consents: [{ id: 'consent-1', contactId: 'contact-1', channel: 'whatsapp', purpose: 'marketing', status: 'granted', source: 'store', capturedAt: '2026-08-03T09:00:00Z', recordedBy: 'owner', version: 1 }],
  metrics: { activeAccounts: 1, activeContacts: 1, marketableContacts: 1, openDuplicates: 0, completeAddresses: 1, verifiedContactPoints: 0 },
} as unknown as PartySnapshot;

const sale = { id: 'sale-1', customerAccountId: 'account-1', status: 'completed', taxPreview: { grandTotal: 1250 } } as unknown as RetailSale;

afterEach(() => cleanup());

describe('RetailCustomer360Panel', () => {
  it('shows a simple customer profile with INR history and consent', () => {
    render(<RetailCustomer360Panel party={party} sales={[sale]} loyaltyAccounts={[]} visits={[]} onOpenCustomerData={vi.fn()} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Know the customer without losing the retail context.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Asha Retail' })).toBeTruthy();
    expect(screen.getByText('Marketing consent')).toBeTruthy();
    expect(screen.getAllByText(/1,250/).length).toBeGreaterThan(0);
    expect(screen.queryByText('$')).toBeNull();
  });

  it('filters customers and keeps governed customer data behind one explicit action', async () => {
    const user = userEvent.setup();
    const onOpenCustomerData = vi.fn();
    render(<RetailCustomer360Panel party={party} sales={[]} loyaltyAccounts={[]} visits={[]} onOpenCustomerData={onOpenCustomerData} />);
    await user.type(screen.getByRole('textbox', { name: 'Search customers' }), 'missing');
    expect(screen.getByText('No customer matches')).toBeTruthy();
    await user.clear(screen.getByRole('textbox', { name: 'Search customers' }));
    await user.click(screen.getByRole('button', { name: /Open customer data/ }));
    expect(onOpenCustomerData).toHaveBeenCalledTimes(1);
  });

  it('uses progressive customer tabs instead of mixing every record on one screen', async () => {
    const user = userEvent.setup();
    render(<RetailCustomer360Panel party={party} sales={[sale]} loyaltyAccounts={[]} visits={[]} onOpenCustomerData={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Orders' }));
    expect(screen.getByRole('heading', { name: 'Completed retail orders' })).toBeTruthy();
    expect(screen.getAllByText('sale-1')[0]).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Consent' }));
    expect(screen.getByRole('heading', { name: 'Recorded communication permission' })).toBeTruthy();
  });

  it('shows a truthful import-empty state instead of fictional retail customers', async () => {
    const user = userEvent.setup();
    const onOpenCustomerData = vi.fn();
    const cleanParty = getPartySnapshot(createCleanPartyState());

    render(<RetailCustomer360Panel party={cleanParty} sales={[]} loyaltyAccounts={[]} visits={[]} onOpenCustomerData={onOpenCustomerData} />);

    expect(screen.getByText('No customers in this workspace yet')).toBeTruthy();
    expect(screen.getByText(/Epic BOS never creates fictional customers/i)).toBeTruthy();
    expect(screen.getByText('Ready for your first verified customer')).toBeTruthy();
    expect(screen.queryByText('Commercial flow')).toBeNull();
    await user.click(screen.getAllByRole('button', { name: /Open customer data/ })[0]!);
    expect(onOpenCustomerData).toHaveBeenCalledTimes(1);
  });

  it('keeps malformed legacy activity timestamps visible without crashing Customer 360', () => {
    const malformedSale = { ...sale, saleAt: 'not-a-date', completedAt: 'not-a-date', number: 'SALE-LEGACY' } as RetailSale;
    render(<RetailCustomer360Panel party={party} sales={[malformedSale]} loyaltyAccounts={[]} visits={[]} onOpenCustomerData={vi.fn()} />);

    expect(screen.getAllByText('SALE-LEGACY')).toHaveLength(2);
    expect(screen.getAllByText(/Date unavailable/i)).toHaveLength(2);
  });
});
