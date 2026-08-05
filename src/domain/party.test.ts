import { describe, expect, it } from 'vitest';
import {
  addAddress,
  addContactPoint,
  convertLeadToParty,
  createAccount,
  createCleanPartyState,
  createContact,
  createInitialPartyState,
  executeMerge,
  getPartySnapshot,
  localizeInitialPartyStateForIndia,
  recordConsent,
  resolveDuplicate,
} from './party';

describe('party master', () => {
  it('starts with unified account, contact, and consent metrics', () => {
    const snapshot = getPartySnapshot(createInitialPartyState(), '2026-07-15T12:00:00.000Z');
    expect(snapshot.metrics).toEqual({ activeAccounts: 4, activeContacts: 4, marketableContacts: 1, openDuplicates: 0, completeAddresses: 3, verifiedContactPoints: 4 });
  });

  it('creates a clean party master with no customer, contact, consent, or communication evidence', () => {
    const state = createCleanPartyState();
    const snapshot = getPartySnapshot(state, '2026-07-15T12:00:00.000Z');

    expect(state).toMatchObject({
      schemaVersion: 2,
      tenantId: 'tenant-northstar',
      companyId: 'company-northstar-us',
      revision: 1,
    });
    expect(state.accounts).toEqual([]);
    expect(state.contacts).toEqual([]);
    expect(state.addresses).toEqual([]);
    expect(state.contactPoints).toEqual([]);
    expect(state.relationships).toEqual([]);
    expect(state.leadConversions).toEqual([]);
    expect(state.merges).toEqual([]);
    expect(state.consents).toEqual([]);
    expect(state.duplicateCandidates).toEqual([]);
    expect(state.audit[0]).toMatchObject({
      id: 'audit-party-clean-starter-initialized',
      action: 'party.clean-starter.initialized',
      previousHash: '0'.repeat(64),
    });
    expect(state.outbox[0]).toMatchObject({ type: 'party.master.clean-starter.initialized.v1' });
    expect(snapshot.metrics).toEqual({
      activeAccounts: 0,
      activeContacts: 0,
      marketableContacts: 0,
      openDuplicates: 0,
      completeAddresses: 0,
      verifiedContactPoints: 0,
    });
    expect(state.accounts.map(({ id }) => id)).not.toEqual(expect.arrayContaining(['account-kestrel', 'account-sahyadri']));
  });

  it('uses India-first reference data while retaining stable party identifiers', () => {
    const state = createInitialPartyState();
    expect(state.accounts.find(({ id }) => id === 'account-kestrel')).toMatchObject({
      displayName: 'Aranya Industrial Systems',
      legalName: 'Aranya Industrial Systems Private Limited',
      domain: 'aranyaindustrial.example',
    });
    expect(state.contacts.every(({ phone }) => phone.startsWith('+91'))).toBe(true);
    expect(state.addresses).toHaveLength(3);
    expect(state.addresses.every(({ countryCode, postalCode }) => countryCode === 'IN' && /^\d{6}$/.test(postalCode))).toBe(true);
    expect(state.contactPoints.find(({ id }) => id === 'point-contact-maya-email')?.value).toBe('kavya@aranyaindustrial.example');
  });

  it('audits exactly the untouched legacy global party seed before localizing it once', () => {
    const india = createInitialPartyState();
    const legacyAccountFields: Record<string, readonly [string, string, string]> = {
      'account-kestrel': ['Kestrel Labs', 'Kestrel Labs, Inc.', 'kestrellabs.com'],
      'account-luma': ['Luma Hotels', 'Luma Hotels Group, LLC', 'lumahotels.com'],
      'account-northwind': ['Northwind Health', 'Northwind Health Systems', 'northwindhealth.com'],
      'account-sahyadri': ['Sahyadri Retail Network', 'Sahyadri Retail Network Private Limited', 'sahyadriretail.in'],
    };
    const legacyContactFields: Record<string, readonly [string, string, string, string]> = {
      'contact-maya': ['Maya', 'Ortiz', 'maya@kestrellabs.com', '+1 415 555 0142'],
      'contact-daniel': ['Daniel', 'Kim', 'daniel@lumahotels.com', '+1 212 555 0199'],
      'contact-amara': ['Amara', 'Singh', 'amara@northwindhealth.com', '+1 617 555 0168'],
      'contact-ananya': ['Ananya', 'Rao', 'ananya@sahyadriretail.in', '+91 98765 43210'],
    };
    const legacyAddressFields: Record<string, readonly [string, string, string, string]> = {
      'address-kestrel-hq': ['San Francisco', 'CA', '94104', 'US'],
      'address-luma-hq': ['New York', 'NY', '10010', 'US'],
      'address-sahyadri-hq': ['Mumbai', '27', '400051', 'IN'],
    };
    const legacy = {
      ...india,
      accounts: india.accounts.map((account) => {
        const values = legacyAccountFields[account.id]!;
        return { ...account, displayName: values[0], legalName: values[1], domain: values[2] };
      }),
      contacts: india.contacts.map((contact) => {
        const values = legacyContactFields[contact.id]!;
        return { ...contact, firstName: values[0], lastName: values[1], email: values[2], phone: values[3] };
      }),
      addresses: india.addresses.map((address) => {
        const values = legacyAddressFields[address.id]!;
        return { ...address, city: values[0], region: values[1], postalCode: values[2], countryCode: values[3] };
      }),
      contactPoints: india.contactPoints.map((point) => {
        const values = legacyContactFields[point.contactId]!;
        return { ...point, value: point.type === 'email' ? values[2] : values[3] };
      }),
    };
    const priorAudit = structuredClone(legacy.audit);
    const priorOutbox = structuredClone(legacy.outbox);

    const localized = localizeInitialPartyStateForIndia(legacy, '2026-07-21T09:00:00.000Z');

    expect(localized).not.toBe(legacy);
    expect(localized.revision).toBe(2);
    expect(localized.accounts.find(({ id }) => id === 'account-kestrel')?.displayName).toBe('Aranya Industrial Systems');
    expect(localized.contacts.find(({ id }) => id === 'contact-maya')?.phone).toBe('+91 98201 44231');
    expect(localized.audit.slice(0, -1)).toEqual(priorAudit);
    expect(localized.outbox.slice(0, -1)).toEqual(priorOutbox);
    expect(localized.audit.at(-1)).toMatchObject({ actorId: 'system:migration', action: 'demo.localized', previousHash: priorAudit.at(-1)?.hash });
    expect(localized.outbox.at(-1)?.type).toBe('party.master.demo.localized.v1');
    expect(localizeInitialPartyStateForIndia(localized, '2026-07-21T09:01:00.000Z')).toBe(localized);
    const customerChanged = { ...legacy, accounts: [...legacy.accounts, { ...legacy.accounts[0]!, id: 'customer-party' }] };
    expect(localizeInitialPartyStateForIndia(customerChanged)).toBe(customerChanged);
  });

  it('governs primary addresses and verified typed contact points', () => {
    const withAddress = addAddress(createInitialPartyState(), {
      accountId: 'account-kestrel', type: 'billing', label: 'Finance office',
      line1: 'Hinjawadi IT Park', line2: '', city: 'Pune', region: '27',
      postalCode: '411057', countryCode: 'in', primary: true,
    }, 'user-avery', 'address-kestrel-billing');
    const withPoint = addContactPoint(withAddress, {
      contactId: 'contact-maya', type: 'linkedin', label: 'Professional profile',
      value: 'https://linkedin.com/in/kavya-iyer', primary: true, verified: true,
      expectedContactVersion: 1,
    }, 'user-avery', 'point-maya-linkedin');
    expect(withPoint.addresses.at(-1)).toMatchObject({ countryCode: 'IN', primary: true });
    expect(withPoint.contactPoints.at(-1)).toMatchObject({ type: 'linkedin', primary: true });
    expect(withPoint.contacts.find(({ id }) => id === 'contact-maya')?.version).toBe(2);
  });

  it('converts a lead idempotently into linked party records', () => {
    const input = {
      leadId: 'lead-101', expectedLeadVersion: 1, accountMode: 'create' as const,
      accountDomain: 'saffronfoods.example', industry: 'Food manufacturing', jobTitle: 'Operations Director',
      leadName: 'Kavya Iyer', leadCompany: 'Saffron Foods & Beverages', leadEmail: 'kavya@saffronfoods.example', ownerId: 'user-avery',
    };
    const converted = convertLeadToParty(createInitialPartyState(), input, 'user-avery', '2026-07-15T13:00:00.000Z');
    const retried = convertLeadToParty(converted, input, 'user-avery', '2026-07-15T13:01:00.000Z');
    expect(converted.leadConversions).toHaveLength(1);
    expect(retried).toEqual(converted);
    expect(converted.contacts.at(-1)?.accountId).toBe(converted.accounts.at(-1)?.id);
  });

  it('executes a version-safe account merge and moves dependent references', () => {
    const duplicate = createAccount(createInitialPartyState(), {
      displayName: 'Aranya Industrial Systems West', legalName: 'Aranya Industrial Systems West Private Limited',
      domain: 'aranyaindustrialwest.example', industry: 'Technology', relationship: 'prospect', ownerId: 'user-avery',
    }, 'user-avery', 'account-kestrel-west');
    const linked = createContact(duplicate, {
      accountId: 'account-kestrel-west', firstName: 'Jatin', lastName: 'West',
      email: 'jatin@aranyaindustrialwest.example', phone: '', jobTitle: 'Director', ownerId: 'user-avery',
    }, 'user-avery', 'contact-jordan');
    const merged = executeMerge(linked, {
      entityType: 'account', survivorId: 'account-kestrel', mergedId: 'account-kestrel-west',
      survivorVersion: 1, mergedVersion: 1,
    }, 'user-avery');
    expect(merged.accounts.find(({ id }) => id === 'account-kestrel-west')?.status).toBe('inactive');
    expect(merged.contacts.find(({ id }) => id === 'contact-jordan')?.accountId).toBe('account-kestrel');
    expect(merged.merges[0]?.movedReferences).toBe(1);
  });

  it('normalizes domains and creates explainable duplicate candidates', () => {
    const next = createAccount(createInitialPartyState(), {
      displayName: 'Aranya Industrial Systems', legalName: 'Aranya Industrial Systems Private Limited',
      domain: 'https://www.aranyaindustrial.example/about', industry: 'Technology',
      relationship: 'customer', ownerId: 'user-avery',
    }, 'user-avery', 'account-kestrel-copy');
    expect(next.accounts.at(-1)?.domain).toBe('aranyaindustrial.example');
    expect(next.duplicateCandidates[0]).toMatchObject({ score: 1, reasons: ['same-domain', 'same-name'], status: 'open' });
  });

  it('prevents exact-email duplicates before contact creation', () => {
    expect(() => createContact(createInitialPartyState(), {
      accountId: 'account-kestrel', firstName: 'Kavya', lastName: 'Iyer',
      email: 'KAVYA@ARANYAINDUSTRIAL.EXAMPLE', phone: '', jobTitle: 'VP Operations', ownerId: 'user-avery',
    }, 'user-avery')).toThrow('already exists');
  });

  it('records consent provenance and resolves duplicate review', () => {
    const initial = createInitialPartyState();
    const consented = recordConsent(initial, {
      contactId: 'contact-daniel', channel: 'email', purpose: 'marketing', status: 'granted',
      source: 'Preference center', expectedContactVersion: 1,
    }, 'user-avery', 'consent-daniel', '2026-07-15T12:00:00.000Z');
    expect(getPartySnapshot(consented, '2026-07-15T12:01:00.000Z').metrics.marketableContacts).toBe(2);

    const withDuplicate = createAccount(consented, {
      displayName: 'Nadi Hospitality Group', legalName: 'Nadi Hospitality Group Private Limited', domain: 'nadihospitality.example',
      industry: 'Hospitality', relationship: 'customer', ownerId: 'user-avery',
    }, 'user-avery', 'account-luma-copy');
    const candidate = withDuplicate.duplicateCandidates[0]!;
    const resolved = resolveDuplicate(withDuplicate, { id: candidate.id, resolution: 'not-duplicate', expectedVersion: 1 }, 'user-avery');
    expect(resolved.duplicateCandidates[0]).toMatchObject({ status: 'not-duplicate', version: 2 });
  });
});
