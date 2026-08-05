import { createHash, randomUUID } from 'node:crypto';
import type { AuditEntry, DomainEvent } from '../shared/kernel-contracts';
import type {
  AddAddressInput,
  AddContactPointInput,
  ContactPoint,
  ConvertLeadPartyInput,
  CreateAccountInput,
  CreateContactInput,
  CreateRelationshipInput,
  DuplicateCandidate,
  ExecuteMergeInput,
  LeadConversion,
  PartyAddress,
  PartyAccount,
  PartyContact,
  PartyMerge,
  PartyRelationship,
  PartySnapshot,
  PartyState,
  RecordConsentInput,
  ResolveDuplicateInput,
} from '../shared/party-contracts';

const GENESIS_HASH = '0'.repeat(64);

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function cleanName(value: string, label: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 2 || normalized.length > 160) {
    throw new Error(`${label} must contain 2-160 characters.`);
  }
  return normalized;
}

function cleanDomain(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? '';
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,63}$/.test(normalized)) {
    throw new Error('Enter a valid company domain.');
  }
  return normalized;
}

function cleanEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid contact email.');
  return email;
}

function appendMutation(
  state: PartyState,
  next: PartyState,
  actorId: string,
  action: string,
  resource: string,
  resourceId: string,
  before: unknown,
  after: unknown,
  now: string,
): PartyState {
  const previousHash = state.audit.at(-1)?.hash ?? GENESIS_HASH;
  const unsigned = {
    id: randomUUID(), occurredAt: now, actorId, action, resource, resourceId,
    reason: action.replaceAll('.', ' '), before, after, previousHash,
  };
  const audit: AuditEntry = { ...unsigned, hash: digest(JSON.stringify(unsigned)) };
  const event: DomainEvent = {
    id: randomUUID(), type: `${resource}.${action}.v1`, aggregateType: resource,
    aggregateId: resourceId, occurredAt: now, payload: { resourceId },
    status: 'pending', attempts: 0,
  };
  return { ...next, revision: state.revision + 1, audit: [...state.audit, audit], outbox: [...state.outbox, event] };
}

export function createInitialPartyState(): PartyState {
  const occurredAt = '2026-07-15T06:00:00.000Z';
  const accounts: PartyAccount[] = [
    { id: 'account-kestrel', tenantId: 'tenant-northstar', companyId: 'company-northstar-us', displayName: 'Aranya Industrial Systems', legalName: 'Aranya Industrial Systems Private Limited', domain: 'aranyaindustrial.example', industry: 'Industrial manufacturing', relationship: 'prospect', ownerId: 'user-avery', status: 'active', version: 1 },
    { id: 'account-luma', tenantId: 'tenant-northstar', companyId: 'company-northstar-us', displayName: 'Nadi Hospitality Group', legalName: 'Nadi Hospitality & Experiences Private Limited', domain: 'nadihospitality.example', industry: 'Hospitality', relationship: 'prospect', ownerId: 'user-avery', status: 'active', version: 1 },
    { id: 'account-northwind', tenantId: 'tenant-northstar', companyId: 'company-northstar-us', displayName: 'Arogyam Care Network', legalName: 'Arogyam Care Network Private Limited', domain: 'arogyamcare.example', industry: 'Healthcare', relationship: 'customer', ownerId: 'user-avery', status: 'active', version: 1 },
    { id: 'account-sahyadri', tenantId: 'tenant-northstar', companyId: 'company-northstar-us', displayName: 'Sahyadri Retail Network', legalName: 'Sahyadri Retail Network Private Limited', domain: 'sahyadriretail.in', industry: 'Retail and distribution', relationship: 'prospect', ownerId: 'user-avery', status: 'active', version: 1 },
  ];
  const contacts: PartyContact[] = [
    { id: 'contact-maya', accountId: 'account-kestrel', firstName: 'Kavya', lastName: 'Iyer', email: 'kavya@aranyaindustrial.example', phone: '+91 98201 44231', jobTitle: 'Vice President, Operations', ownerId: 'user-avery', status: 'active', version: 1 },
    { id: 'contact-daniel', accountId: 'account-luma', firstName: 'Ishita', lastName: 'Menon', email: 'ishita@nadihospitality.example', phone: '+91 98450 11872', jobTitle: 'Chief Commercial Officer', ownerId: 'user-avery', status: 'active', version: 1 },
    { id: 'contact-amara', accountId: 'account-northwind', firstName: 'Dr. Meera', lastName: 'Shah', email: 'meera@arogyamcare.example', phone: '+91 98702 66189', jobTitle: 'Transformation Director', ownerId: 'user-avery', status: 'active', version: 1 },
    { id: 'contact-ananya', accountId: 'account-sahyadri', firstName: 'Ananya', lastName: 'Rao', email: 'ananya@sahyadriretail.in', phone: '+91 98765 43210', jobTitle: 'Director, Network Transformation', ownerId: 'user-avery', status: 'active', version: 1 },
  ];
  const unsigned = { id: 'audit-party-initialized', occurredAt, actorId: 'user-avery', action: 'party.initialized', resource: 'party.master', resourceId: 'tenant-northstar', reason: 'party initialized', before: null, after: { accounts: 4, contacts: 4 }, previousHash: GENESIS_HASH };
  return {
    schemaVersion: 2, tenantId: 'tenant-northstar', companyId: 'company-northstar-us', revision: 1,
    accounts, contacts,
    addresses: [
      { id: 'address-kestrel-hq', accountId: 'account-kestrel', type: 'office', label: 'Pune works office', line1: 'MIDC Industrial Estate', line2: 'Chakan', city: 'Pune', region: '27', postalCode: '410501', countryCode: 'IN', primary: true, status: 'active', version: 1 },
      { id: 'address-luma-hq', accountId: 'account-luma', type: 'billing', label: 'Bengaluru corporate office', line1: 'Outer Ring Road', line2: 'Bellandur', city: 'Bengaluru', region: '29', postalCode: '560103', countryCode: 'IN', primary: true, status: 'active', version: 1 },
      { id: 'address-sahyadri-hq', accountId: 'account-sahyadri', type: 'office', label: 'Mumbai office', line1: 'Bandra Kurla Complex', line2: '', city: 'Mumbai', region: '27', postalCode: '400051', countryCode: 'IN', primary: true, status: 'active', version: 1 },
    ],
    contactPoints: contacts.flatMap((contact) => [
      { id: `point-${contact.id}-email`, contactId: contact.id, type: 'email' as const, label: 'Work', value: contact.email, primary: true, verifiedAt: occurredAt, status: 'active' as const, version: 1 },
      { id: `point-${contact.id}-phone`, contactId: contact.id, type: 'phone' as const, label: 'Work', value: contact.phone, primary: true, status: 'active' as const, version: 1 },
    ]),
    relationships: [],
    leadConversions: [],
    merges: [],
    consents: [
      { id: 'consent-maya-transactional', contactId: 'contact-maya', channel: 'email', purpose: 'transactional', status: 'granted', source: 'contract', capturedAt: occurredAt, recordedBy: 'user-avery', version: 1 },
      { id: 'consent-amara-marketing', contactId: 'contact-amara', channel: 'email', purpose: 'marketing', status: 'granted', source: 'web-form', capturedAt: occurredAt, recordedBy: 'user-avery', version: 1 },
      { id: 'consent-ananya-transactional', contactId: 'contact-ananya', channel: 'email', purpose: 'transactional', status: 'granted', source: 'commercial-enquiry', capturedAt: occurredAt, recordedBy: 'user-avery', version: 1 },
    ],
    duplicateCandidates: [],
    audit: [{ ...unsigned, hash: digest(JSON.stringify(unsigned)) }],
    outbox: [{ id: 'event-party-initialized', type: 'party.master.initialized.v1', aggregateType: 'party.master', aggregateId: 'tenant-northstar', occurredAt, payload: { accounts: 4, contacts: 4 }, status: 'pending', attempts: 0 }],
  };
}

/**
 * Empty party-master state for a newly provisioned India-first workspace.
 *
 * Parties, contact points, consent, address records, merge history and
 * duplicate evidence all belong to the customer.  A clean workspace must not
 * manufacture any of those records merely to make a screen look populated.
 * The initialization audit and outbox record establish a valid evidence
 * baseline without claiming commercial activity.
 */
export function createCleanPartyState(): PartyState {
  const occurredAt = '2026-07-15T06:00:00.000Z';
  const unsigned = {
    id: 'audit-party-clean-starter-initialized',
    occurredAt,
    actorId: 'system:provisioner',
    action: 'party.clean-starter.initialized',
    resource: 'party.master',
    resourceId: 'tenant-northstar',
    reason: 'Created an empty party-master baseline for an India-first workspace.',
    before: null,
    after: { accounts: 0, contacts: 0 },
    previousHash: GENESIS_HASH,
  };

  return {
    schemaVersion: 2,
    tenantId: 'tenant-northstar',
    companyId: 'company-northstar-us',
    revision: 1,
    accounts: [],
    contacts: [],
    addresses: [],
    contactPoints: [],
    relationships: [],
    leadConversions: [],
    merges: [],
    consents: [],
    duplicateCandidates: [],
    audit: [{ ...unsigned, hash: digest(JSON.stringify(unsigned)) }],
    outbox: [{
      id: 'event-party-clean-starter-initialized',
      type: 'party.master.clean-starter.initialized.v1',
      aggregateType: 'party.master',
      aggregateId: 'tenant-northstar',
      occurredAt,
      payload: { accounts: 0, contacts: 0 },
      status: 'pending',
      attempts: 0,
    }],
  };
}

function isUntouchedLegacyGlobalPartyDemo(state: PartyState): boolean {
  const legacyAccounts: Readonly<Record<string, readonly [string, string, string]>> = {
    'account-kestrel': ['Kestrel Labs', 'Kestrel Labs, Inc.', 'kestrellabs.com'],
    'account-luma': ['Luma Hotels', 'Luma Hotels Group, LLC', 'lumahotels.com'],
    'account-northwind': ['Northwind Health', 'Northwind Health Systems', 'northwindhealth.com'],
    'account-sahyadri': ['Sahyadri Retail Network', 'Sahyadri Retail Network Private Limited', 'sahyadriretail.in'],
  };
  const legacyContacts: Readonly<Record<string, readonly [string, string, string, string]>> = {
    'contact-maya': ['Maya', 'Ortiz', 'maya@kestrellabs.com', '+1 415 555 0142'],
    'contact-daniel': ['Daniel', 'Kim', 'daniel@lumahotels.com', '+1 212 555 0199'],
    'contact-amara': ['Amara', 'Singh', 'amara@northwindhealth.com', '+1 617 555 0168'],
    'contact-ananya': ['Ananya', 'Rao', 'ananya@sahyadriretail.in', '+91 98765 43210'],
  };
  const legacyAddresses: Readonly<Record<string, readonly [string, string, string, string]>> = {
    'address-kestrel-hq': ['San Francisco', 'CA', '94104', 'US'],
    'address-luma-hq': ['New York', 'NY', '10010', 'US'],
    'address-sahyadri-hq': ['Mumbai', '27', '400051', 'IN'],
  };

  return state.schemaVersion === 2 &&
    state.revision === 1 &&
    state.accounts.length === 4 &&
    state.contacts.length === 4 &&
    state.addresses.length === 3 &&
    state.contactPoints.length === 8 &&
    state.relationships.length === 0 &&
    state.leadConversions.length === 0 &&
    state.merges.length === 0 &&
    state.duplicateCandidates.length === 0 &&
    state.consents.length === 3 &&
    state.audit.length === 1 &&
    state.audit[0]?.id === 'audit-party-initialized' &&
    state.outbox.length === 1 &&
    state.outbox[0]?.id === 'event-party-initialized' &&
    state.accounts.every((account) => {
      const signature = legacyAccounts[account.id];
      if (!signature) return false;
      return account.version === 1 && account.displayName === signature[0] &&
        account.legalName === signature[1] && account.domain === signature[2];
    }) &&
    state.contacts.every((contact) => {
      const signature = legacyContacts[contact.id];
      if (!signature) return false;
      return contact.version === 1 && contact.firstName === signature[0] &&
        contact.lastName === signature[1] && contact.email === signature[2] && contact.phone === signature[3];
    }) &&
    state.addresses.every((address) => {
      const signature = legacyAddresses[address.id];
      if (!signature) return false;
      return address.version === 1 && address.city === signature[0] && address.region === signature[1] &&
        address.postalCode === signature[2] && address.countryCode === signature[3];
    }) &&
    state.contactPoints.every((point) => {
      const contact = legacyContacts[point.contactId];
      const expected = point.type === 'email' ? contact?.[2] : point.type === 'phone' ? contact?.[3] : undefined;
      return Boolean(expected) && point.version === 1 && point.value === expected;
    });
}

/**
 * Replaces only the exact, untouched pre-India global demonstration seed.
 * The migration retains technical IDs, preserves historical evidence byte for
 * byte, and records a new linked audit/outbox event. It never touches actual
 * parties, including Indian companies with legitimate overseas customers.
 */
export function localizeInitialPartyStateForIndia(
  state: PartyState,
  now = new Date().toISOString(),
): PartyState {
  if (!isUntouchedLegacyGlobalPartyDemo(state)) return state;

  const indiaDemo = createInitialPartyState();
  const accountById = new Map(indiaDemo.accounts.map((account) => [account.id, account]));
  const contactById = new Map(indiaDemo.contacts.map((contact) => [contact.id, contact]));
  const addressById = new Map(indiaDemo.addresses.map((address) => [address.id, address]));
  const contactPointById = new Map(indiaDemo.contactPoints.map((point) => [point.id, point]));
  const localized: PartyState = {
    ...state,
    accounts: state.accounts.map((account) => {
      const replacement = accountById.get(account.id)!;
      return {
        ...account,
        displayName: replacement.displayName,
        legalName: replacement.legalName,
        domain: replacement.domain,
        industry: replacement.industry,
        version: account.version + 1,
      };
    }),
    contacts: state.contacts.map((contact) => {
      const replacement = contactById.get(contact.id)!;
      return {
        ...contact,
        firstName: replacement.firstName,
        lastName: replacement.lastName,
        email: replacement.email,
        phone: replacement.phone,
        jobTitle: replacement.jobTitle,
        version: contact.version + 1,
      };
    }),
    addresses: state.addresses.map((address) => {
      const replacement = addressById.get(address.id)!;
      return {
        ...address,
        label: replacement.label,
        line1: replacement.line1,
        line2: replacement.line2,
        city: replacement.city,
        region: replacement.region,
        postalCode: replacement.postalCode,
        countryCode: replacement.countryCode,
        version: address.version + 1,
      };
    }),
    contactPoints: state.contactPoints.map((point) => {
      const replacement = contactPointById.get(point.id)!;
      return {
        ...point,
        label: replacement.label,
        value: replacement.value,
        verifiedAt: replacement.verifiedAt,
        version: point.version + 1,
      };
    }),
  };

  return appendMutation(
    state,
    localized,
    'system:migration',
    'demo.localized',
    'party.master',
    state.tenantId,
    { seed: 'global-party-demo-v1', scope: 'visible-reference-data' },
    { seed: 'india-party-demo-v1', scope: 'visible-reference-data', countryCode: 'IN' },
    now,
  );
}

export function createAccount(state: PartyState, input: CreateAccountInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): PartyState {
  const displayName = cleanName(input.displayName, 'Account name');
  const domain = cleanDomain(input.domain);
  const account: PartyAccount = {
    id, tenantId: state.tenantId, companyId: state.companyId, displayName,
    legalName: cleanName(input.legalName, 'Legal name'), domain,
    industry: cleanName(input.industry, 'Industry'), relationship: input.relationship,
    ownerId: input.ownerId, status: 'active', version: 1,
  };
  const candidates: DuplicateCandidate[] = [];
  for (const existing of state.accounts) {
    const reasons: string[] = [];
    let score = 0;
    if (existing.domain === domain) { score += 0.75; reasons.push('same-domain'); }
    if (existing.displayName.toLowerCase() === displayName.toLowerCase()) { score += 0.35; reasons.push('same-name'); }
    if (score >= 0.7) candidates.push({ id: randomUUID(), entityType: 'account', leftId: existing.id, rightId: id, score: Math.min(score, 1), reasons, status: 'open', version: 1 });
  }
  return appendMutation(state, { ...state, accounts: [...state.accounts, account], duplicateCandidates: [...state.duplicateCandidates, ...candidates] }, actorId, 'account.created', 'party.account', id, null, account, now);
}

export function createContact(state: PartyState, input: CreateContactInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): PartyState {
  const email = cleanEmail(input.email);
  const exact = state.contacts.find((contact) => contact.email === email);
  if (exact) throw new Error(`A contact with this email already exists: ${exact.id}.`);
  if (input.accountId && !state.accounts.some(({ id: accountId }) => accountId === input.accountId)) throw new Error('Account not found.');
  const contact: PartyContact = {
    id, accountId: input.accountId, firstName: cleanName(input.firstName, 'First name'),
    lastName: cleanName(input.lastName, 'Last name'), email, phone: input.phone.trim(),
    jobTitle: cleanName(input.jobTitle, 'Job title'), ownerId: input.ownerId, status: 'active', version: 1,
  };
  return appendMutation(state, { ...state, contacts: [...state.contacts, contact] }, actorId, 'contact.created', 'party.contact', id, null, contact, now);
}

export function recordConsent(state: PartyState, input: RecordConsentInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): PartyState {
  const contact = state.contacts.find(({ id: contactId }) => contactId === input.contactId);
  if (!contact) throw new Error('Contact not found.');
  if (contact.version !== input.expectedContactVersion) throw new Error('The contact changed. Refresh and retry.');
  if (input.expiresAt && input.expiresAt <= now) throw new Error('Consent expiry must be in the future.');
  const consent = { id, contactId: contact.id, channel: input.channel, purpose: input.purpose, status: input.status, source: cleanName(input.source, 'Consent source'), capturedAt: now, expiresAt: input.expiresAt, recordedBy: actorId, version: 1 };
  return appendMutation(state, { ...state, consents: [...state.consents, consent] }, actorId, 'consent.recorded', 'party.consent', id, null, consent, now);
}

export function resolveDuplicate(state: PartyState, input: ResolveDuplicateInput, actorId: string, now = new Date().toISOString()): PartyState {
  const candidate = state.duplicateCandidates.find(({ id }) => id === input.id);
  if (!candidate) throw new Error('Duplicate candidate not found.');
  if (candidate.version !== input.expectedVersion || candidate.status !== 'open') throw new Error('Duplicate candidate changed. Refresh and retry.');
  const resolved: DuplicateCandidate = { ...candidate, status: input.resolution, resolvedBy: actorId, resolvedAt: now, version: candidate.version + 1 };
  return appendMutation(state, { ...state, duplicateCandidates: state.duplicateCandidates.map((item) => item.id === resolved.id ? resolved : item) }, actorId, 'duplicate.resolved', 'party.duplicate', candidate.id, candidate, resolved, now);
}

export function addAddress(
  state: PartyState,
  input: AddAddressInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): PartyState {
  if (Boolean(input.accountId) === Boolean(input.contactId)) {
    throw new Error('An address must belong to exactly one account or contact.');
  }
  if (input.accountId && !state.accounts.some(({ id: accountId, status }) => accountId === input.accountId && status === 'active')) throw new Error('Active account not found.');
  if (input.contactId && !state.contacts.some(({ id: contactId, status }) => contactId === input.contactId && status === 'active')) throw new Error('Active contact not found.');
  const countryCode = input.countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('Country code must use two ISO letters.');
  const address: PartyAddress = {
    id, accountId: input.accountId, contactId: input.contactId, type: input.type,
    label: cleanName(input.label, 'Address label'), line1: cleanName(input.line1, 'Address line'),
    line2: input.line2.trim(), city: cleanName(input.city, 'City'), region: input.region.trim(),
    postalCode: input.postalCode.trim(), countryCode, primary: input.primary, status: 'active', version: 1,
  };
  const addresses = state.addresses.map((candidate) =>
    input.primary && candidate.status === 'active' && candidate.type === input.type &&
    candidate.accountId === input.accountId && candidate.contactId === input.contactId
      ? { ...candidate, primary: false, version: candidate.version + 1 }
      : candidate,
  );
  return appendMutation(state, { ...state, addresses: [...addresses, address] }, actorId, 'address.created', 'party.address', id, null, address, now);
}

export function addContactPoint(
  state: PartyState,
  input: AddContactPointInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): PartyState {
  const contact = state.contacts.find(({ id: contactId }) => contactId === input.contactId);
  if (!contact || contact.status !== 'active') throw new Error('Active contact not found.');
  if (contact.version !== input.expectedContactVersion) throw new Error('The contact changed. Refresh and retry.');
  const value = input.type === 'email' ? cleanEmail(input.value) : input.value.trim();
  if (value.length < 3 || value.length > 500) throw new Error('Contact-point value must contain 3-500 characters.');
  if (state.contactPoints.some((point) => point.type === input.type && point.value.toLowerCase() === value.toLowerCase() && point.status === 'active')) throw new Error('This contact point already exists.');
  const point: ContactPoint = {
    id, contactId: contact.id, type: input.type, label: cleanName(input.label, 'Contact-point label'),
    value, primary: input.primary, verifiedAt: input.verified ? now : undefined, status: 'active', version: 1,
  };
  const contactPoints = state.contactPoints.map((candidate) =>
    input.primary && candidate.contactId === contact.id && candidate.type === input.type && candidate.status === 'active'
      ? { ...candidate, primary: false, version: candidate.version + 1 }
      : candidate,
  );
  const updatedContact = { ...contact, version: contact.version + 1 };
  return appendMutation(state, {
    ...state,
    contacts: state.contacts.map((candidate) => candidate.id === updatedContact.id ? updatedContact : candidate),
    contactPoints: [...contactPoints, point],
  }, actorId, 'contact-point.created', 'party.contact-point', id, null, point, now);
}

export function createRelationship(
  state: PartyState,
  input: CreateRelationshipInput,
  actorId: string,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): PartyState {
  if (input.fromAccountId === input.toAccountId) throw new Error('An account cannot relate to itself.');
  if (![input.fromAccountId, input.toAccountId].every((accountId) => state.accounts.some(({ id: candidate, status }) => candidate === accountId && status === 'active'))) throw new Error('Both relationship accounts must be active.');
  if (state.relationships.some((relationship) => relationship.fromAccountId === input.fromAccountId && relationship.toAccountId === input.toAccountId && relationship.type === input.type && relationship.status === 'active')) throw new Error('This relationship already exists.');
  const relationship: PartyRelationship = { id, ...input, status: 'active', version: 1 };
  return appendMutation(state, { ...state, relationships: [...state.relationships, relationship] }, actorId, 'relationship.created', 'party.relationship', id, null, relationship, now);
}

export function convertLeadToParty(
  state: PartyState,
  input: ConvertLeadPartyInput,
  actorId: string,
  now = new Date().toISOString(),
): PartyState {
  if (state.leadConversions.some(({ leadId }) => leadId === input.leadId)) return state;
  let next = state;
  let accountId = input.accountId;
  let createdAccount = false;
  if (input.accountMode === 'existing') {
    if (!accountId || !state.accounts.some(({ id, status }) => id === accountId && status === 'active')) throw new Error('Select an active account for conversion.');
  } else {
    if (!input.accountDomain || !input.industry) throw new Error('A domain and industry are required for a new account.');
    accountId = randomUUID();
    next = createAccount(next, {
      displayName: input.leadCompany,
      legalName: input.leadCompany,
      domain: input.accountDomain,
      industry: input.industry,
      relationship: 'prospect',
      ownerId: input.ownerId,
    }, actorId, accountId, now);
    createdAccount = true;
  }
  const existingContact = next.contacts.find(({ email, status }) => email === input.leadEmail.toLowerCase() && status === 'active');
  let contactId = existingContact?.id;
  let createdContact = false;
  if (!contactId) {
    const nameParts = input.leadName.trim().split(/\s+/);
    contactId = randomUUID();
    next = createContact(next, {
      accountId,
      firstName: nameParts[0] ?? 'Lead',
      lastName: nameParts.slice(1).join(' ') || 'Contact',
      email: input.leadEmail,
      phone: '',
      jobTitle: input.jobTitle,
      ownerId: input.ownerId,
    }, actorId, contactId, now);
    createdContact = true;
  }
  const conversion: LeadConversion = {
    id: randomUUID(), leadId: input.leadId, accountId, contactId,
    createdAccount, createdContact, convertedBy: actorId, convertedAt: now,
  };
  return appendMutation(next, { ...next, leadConversions: [...next.leadConversions, conversion] }, actorId, 'lead.converted', 'party.lead-conversion', conversion.id, null, conversion, now);
}

export function executeMerge(
  state: PartyState,
  input: ExecuteMergeInput,
  actorId: string,
  now = new Date().toISOString(),
): PartyState {
  if (input.survivorId === input.mergedId) throw new Error('Merge records must be different.');
  let movedReferences = 0;
  let next = state;
  if (input.entityType === 'account') {
    const survivor = state.accounts.find(({ id }) => id === input.survivorId);
    const merged = state.accounts.find(({ id }) => id === input.mergedId);
    if (!survivor || !merged || survivor.status !== 'active' || merged.status !== 'active') throw new Error('Both accounts must be active.');
    if (survivor.version !== input.survivorVersion || merged.version !== input.mergedVersion) throw new Error('An account changed. Refresh and retry.');
    const contacts = state.contacts.map((contact) => {
      if (contact.accountId !== merged.id) return contact;
      movedReferences += 1;
      return { ...contact, accountId: survivor.id, version: contact.version + 1 };
    });
    const addresses = state.addresses.map((address) => {
      if (address.accountId !== merged.id) return address;
      movedReferences += 1;
      return { ...address, accountId: survivor.id, version: address.version + 1 };
    });
    const relationships = state.relationships.map((relationship) => {
      if (relationship.fromAccountId !== merged.id && relationship.toAccountId !== merged.id) return relationship;
      movedReferences += 1;
      return { ...relationship, fromAccountId: relationship.fromAccountId === merged.id ? survivor.id : relationship.fromAccountId, toAccountId: relationship.toAccountId === merged.id ? survivor.id : relationship.toAccountId, version: relationship.version + 1 };
    }).filter((relationship) => relationship.fromAccountId !== relationship.toAccountId);
    next = { ...state, accounts: state.accounts.map((account) => account.id === survivor.id ? { ...survivor, version: survivor.version + 1 } : account.id === merged.id ? { ...merged, status: 'inactive', version: merged.version + 1 } : account), contacts, addresses, relationships };
  } else {
    const survivor = state.contacts.find(({ id }) => id === input.survivorId);
    const merged = state.contacts.find(({ id }) => id === input.mergedId);
    if (!survivor || !merged || survivor.status !== 'active' || merged.status !== 'active') throw new Error('Both contacts must be active.');
    if (survivor.version !== input.survivorVersion || merged.version !== input.mergedVersion) throw new Error('A contact changed. Refresh and retry.');
    const contactPoints = state.contactPoints.map((point) => {
      if (point.contactId !== merged.id) return point;
      movedReferences += 1;
      return { ...point, contactId: survivor.id, version: point.version + 1 };
    });
    const addresses = state.addresses.map((address) => {
      if (address.contactId !== merged.id) return address;
      movedReferences += 1;
      return { ...address, contactId: survivor.id, version: address.version + 1 };
    });
    const consents = state.consents.map((consent) => {
      if (consent.contactId !== merged.id) return consent;
      movedReferences += 1;
      return { ...consent, contactId: survivor.id, version: consent.version + 1 };
    });
    next = { ...state, contacts: state.contacts.map((contact) => contact.id === survivor.id ? { ...survivor, version: survivor.version + 1 } : contact.id === merged.id ? { ...merged, status: 'inactive', version: merged.version + 1 } : contact), contactPoints, addresses, consents };
  }
  const merge: PartyMerge = { id: randomUUID(), entityType: input.entityType, survivorId: input.survivorId, mergedId: input.mergedId, movedReferences, mergedBy: actorId, mergedAt: now };
  const candidates = next.duplicateCandidates.map((candidate) =>
    candidate.status === 'open' && [candidate.leftId, candidate.rightId].includes(input.mergedId)
      ? { ...candidate, status: 'merged' as const, resolvedBy: actorId, resolvedAt: now, version: candidate.version + 1 }
      : candidate,
  );
  return appendMutation(next, { ...next, duplicateCandidates: candidates, merges: [...next.merges, merge] }, actorId, 'merge.executed', `party.${input.entityType}`, input.survivorId, null, merge, now);
}

export function getPartySnapshot(state: PartyState, generatedAt = new Date().toISOString()): PartySnapshot {
  const latestConsent = new Map<string, typeof state.consents[number]>();
  for (const consent of state.consents) latestConsent.set(`${consent.contactId}:${consent.channel}:${consent.purpose}`, consent);
  return {
    revision: state.revision, generatedAt,
    accounts: structuredClone(state.accounts), contacts: structuredClone(state.contacts),
    addresses: structuredClone(state.addresses), contactPoints: structuredClone(state.contactPoints),
    relationships: structuredClone(state.relationships), leadConversions: structuredClone(state.leadConversions),
    merges: structuredClone(state.merges),
    consents: structuredClone(state.consents), duplicateCandidates: structuredClone(state.duplicateCandidates),
    metrics: {
      activeAccounts: state.accounts.filter(({ status }) => status === 'active').length,
      activeContacts: state.contacts.filter(({ status }) => status === 'active').length,
      marketableContacts: new Set([...latestConsent.values()].filter((consent) => consent.purpose === 'marketing' && consent.status === 'granted' && (!consent.expiresAt || consent.expiresAt > generatedAt)).map(({ contactId }) => contactId)).size,
      openDuplicates: state.duplicateCandidates.filter(({ status }) => status === 'open').length,
      completeAddresses: state.addresses.filter(({ status, line1, city, countryCode }) => status === 'active' && Boolean(line1 && city && countryCode)).length,
      verifiedContactPoints: state.contactPoints.filter(({ status, verifiedAt }) => status === 'active' && Boolean(verifiedAt)).length,
    },
  };
}
