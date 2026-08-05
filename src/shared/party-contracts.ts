import type { AuditEntry, DomainEvent, RecordStatus } from './kernel-contracts';

export interface PartyAccount {
  id: string;
  tenantId: string;
  companyId: string;
  displayName: string;
  legalName: string;
  domain: string;
  industry: string;
  relationship: 'prospect' | 'customer' | 'partner' | 'supplier';
  ownerId: string;
  status: RecordStatus;
  version: number;
}

export interface PartyContact {
  id: string;
  accountId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  ownerId: string;
  status: RecordStatus;
  version: number;
}

export interface PartyAddress {
  id: string;
  accountId?: string;
  contactId?: string;
  type: 'billing' | 'shipping' | 'office' | 'home';
  label: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  primary: boolean;
  status: RecordStatus;
  version: number;
}

export interface ContactPoint {
  id: string;
  contactId: string;
  type: 'email' | 'phone' | 'mobile' | 'website' | 'linkedin';
  label: string;
  value: string;
  primary: boolean;
  verifiedAt?: string;
  status: RecordStatus;
  version: number;
}

export interface PartyRelationship {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  type: 'parent' | 'subsidiary' | 'partner' | 'supplier' | 'customer';
  status: RecordStatus;
  version: number;
}

export interface LeadConversion {
  id: string;
  leadId: string;
  accountId: string;
  contactId: string;
  createdAccount: boolean;
  createdContact: boolean;
  convertedBy: string;
  convertedAt: string;
}

export interface PartyMerge {
  id: string;
  entityType: 'account' | 'contact';
  survivorId: string;
  mergedId: string;
  movedReferences: number;
  mergedBy: string;
  mergedAt: string;
}

export interface ConsentRecord {
  id: string;
  contactId: string;
  channel: 'email' | 'phone' | 'sms';
  purpose: 'marketing' | 'transactional';
  status: 'granted' | 'withdrawn' | 'unknown';
  source: string;
  capturedAt: string;
  expiresAt?: string;
  recordedBy: string;
  version: number;
}

export interface DuplicateCandidate {
  id: string;
  entityType: 'account' | 'contact';
  leftId: string;
  rightId: string;
  score: number;
  reasons: string[];
  status: 'open' | 'not-duplicate' | 'merged';
  resolvedBy?: string;
  resolvedAt?: string;
  version: number;
}

export interface PartyState {
  schemaVersion: 2;
  tenantId: string;
  companyId: string;
  revision: number;
  accounts: PartyAccount[];
  contacts: PartyContact[];
  addresses: PartyAddress[];
  contactPoints: ContactPoint[];
  relationships: PartyRelationship[];
  leadConversions: LeadConversion[];
  merges: PartyMerge[];
  consents: ConsentRecord[];
  duplicateCandidates: DuplicateCandidate[];
  audit: AuditEntry[];
  outbox: DomainEvent[];
}

export interface PartySnapshot {
  revision: number;
  generatedAt: string;
  accounts: PartyAccount[];
  contacts: PartyContact[];
  addresses: PartyAddress[];
  contactPoints: ContactPoint[];
  relationships: PartyRelationship[];
  leadConversions: LeadConversion[];
  merges: PartyMerge[];
  consents: ConsentRecord[];
  duplicateCandidates: DuplicateCandidate[];
  metrics: {
    activeAccounts: number;
    activeContacts: number;
    marketableContacts: number;
    openDuplicates: number;
    completeAddresses: number;
    verifiedContactPoints: number;
  };
}

export interface CreateAccountInput {
  displayName: string;
  legalName: string;
  domain: string;
  industry: string;
  relationship: PartyAccount['relationship'];
  ownerId: string;
}

export interface CreateContactInput {
  accountId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  ownerId: string;
}

export interface RecordConsentInput {
  contactId: string;
  channel: ConsentRecord['channel'];
  purpose: ConsentRecord['purpose'];
  status: ConsentRecord['status'];
  source: string;
  expiresAt?: string;
  expectedContactVersion: number;
}

export interface ResolveDuplicateInput {
  id: string;
  resolution: 'not-duplicate' | 'merged';
  expectedVersion: number;
}

export interface AddAddressInput {
  accountId?: string;
  contactId?: string;
  type: PartyAddress['type'];
  label: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  primary: boolean;
}

export interface AddContactPointInput {
  contactId: string;
  type: ContactPoint['type'];
  label: string;
  value: string;
  primary: boolean;
  verified: boolean;
  expectedContactVersion: number;
}

export interface CreateRelationshipInput {
  fromAccountId: string;
  toAccountId: string;
  type: PartyRelationship['type'];
}

export interface ExecuteMergeInput {
  entityType: PartyMerge['entityType'];
  survivorId: string;
  mergedId: string;
  survivorVersion: number;
  mergedVersion: number;
}

export interface ConvertLeadInput {
  leadId: string;
  expectedLeadVersion: number;
  accountMode: 'create' | 'existing';
  accountId?: string;
  accountDomain?: string;
  industry?: string;
  jobTitle: string;
}

export interface ConvertLeadPartyInput extends ConvertLeadInput {
  leadName: string;
  leadCompany: string;
  leadEmail: string;
  ownerId: string;
}
