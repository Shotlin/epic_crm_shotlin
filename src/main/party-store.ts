import {
  createAccount,
  createContact,
  createRelationship,
  createCleanPartyState,
  getPartySnapshot,
  localizeInitialPartyStateForIndia,
  recordConsent,
  resolveDuplicate,
  addAddress,
  addContactPoint,
  convertLeadToParty,
  executeMerge,
} from '../domain/party';
import type {
  AddAddressInput,
  AddContactPointInput,
  ConvertLeadPartyInput,
  CreateAccountInput,
  CreateContactInput,
  CreateRelationshipInput,
  ExecuteMergeInput,
  PartySnapshot,
  PartyState,
  RecordConsentInput,
  ResolveDuplicateInput,
} from '../shared/party-contracts';
import type { BusinessDatabase } from './database';

function isPartyState(value: unknown): value is PartyState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PartyState>;
  return candidate.schemaVersion === 2 && typeof candidate.revision === 'number' &&
    Array.isArray(candidate.accounts) && Array.isArray(candidate.contacts) &&
    Array.isArray(candidate.addresses) && Array.isArray(candidate.contactPoints) &&
    Array.isArray(candidate.relationships) && Array.isArray(candidate.leadConversions) &&
    Array.isArray(candidate.merges) &&
    Array.isArray(candidate.consents) && Array.isArray(candidate.duplicateCandidates) &&
    Array.isArray(candidate.audit) && Array.isArray(candidate.outbox);
}

function migratePartyState(value: unknown): PartyState | null {
  if (isPartyState(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const legacy = value as Record<string, unknown>;
  if (
    legacy.schemaVersion !== 1 ||
    !Array.isArray(legacy.accounts) ||
    !Array.isArray(legacy.contacts) ||
    !Array.isArray(legacy.consents) ||
    !Array.isArray(legacy.duplicateCandidates) ||
    !Array.isArray(legacy.audit) ||
    !Array.isArray(legacy.outbox)
  ) return null;
  const contacts = legacy.contacts as PartyState['contacts'];
  return {
    ...(legacy as unknown as Omit<PartyState, 'schemaVersion' | 'addresses' | 'contactPoints' | 'relationships' | 'leadConversions' | 'merges'>),
    schemaVersion: 2,
    addresses: [],
    contactPoints: contacts.flatMap((contact) => [
      { id: `point-${contact.id}-email`, contactId: contact.id, type: 'email' as const, label: 'Work', value: contact.email, primary: true, status: 'active' as const, version: 1 },
      ...(contact.phone ? [{ id: `point-${contact.id}-phone`, contactId: contact.id, type: 'phone' as const, label: 'Work', value: contact.phone, primary: true, status: 'active' as const, version: 1 }] : []),
    ]),
    relationships: [],
    leadConversions: [],
    merges: [],
  };
}

export class PartyStore {
  private state: PartyState = createCleanPartyState();
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(private readonly database: BusinessDatabase) {}

  public async initialize(): Promise<void> {
    const stored = this.database.loadState<PartyState>('party');
    const migrated = stored ? migratePartyState(stored.payload) : null;
    // A missing Party Master document must not manufacture customers,
    // consent, addresses, or contacts from the illustrative sample.
    this.state = localizeInitialPartyStateForIndia(migrated ?? createCleanPartyState());
    if (!stored || stored.payload !== this.state) await this.persist();
  }

  public getSnapshot(): PartySnapshot {
    return getPartySnapshot(this.state);
  }

  public getCompanyId(): string {
    return this.state.companyId;
  }

  public addAccount(input: CreateAccountInput, actorId: string): Promise<PartySnapshot> {
    return this.mutate((state) => createAccount(state, input, actorId));
  }

  public addContact(input: CreateContactInput, actorId: string): Promise<PartySnapshot> {
    return this.mutate((state) => createContact(state, input, actorId));
  }

  public addConsent(input: RecordConsentInput, actorId: string): Promise<PartySnapshot> {
    return this.mutate((state) => recordConsent(state, input, actorId));
  }

  public resolveDuplicate(input: ResolveDuplicateInput, actorId: string): Promise<PartySnapshot> {
    return this.mutate((state) => resolveDuplicate(state, input, actorId));
  }

  public addAddress(input: AddAddressInput, actorId: string): Promise<PartySnapshot> {
    return this.mutate((state) => addAddress(state, input, actorId));
  }

  public addContactPoint(input: AddContactPointInput, actorId: string): Promise<PartySnapshot> {
    return this.mutate((state) => addContactPoint(state, input, actorId));
  }

  public addRelationship(input: CreateRelationshipInput, actorId: string): Promise<PartySnapshot> {
    return this.mutate((state) => createRelationship(state, input, actorId));
  }

  public convertLead(input: ConvertLeadPartyInput, actorId: string): Promise<PartySnapshot> {
    return this.mutate((state) => convertLeadToParty(state, input, actorId));
  }

  public merge(input: ExecuteMergeInput, actorId: string): Promise<PartySnapshot> {
    return this.mutate((state) => executeMerge(state, input, actorId));
  }

  private mutate(operation: (state: PartyState) => PartyState): Promise<PartySnapshot> {
    const task = async () => {
      this.state = operation(this.state);
      await this.persist();
      return this.getSnapshot();
    };
    const result = this.writeQueue.then(task, task);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async persist(): Promise<void> {
    this.database.saveState('party', this.state.schemaVersion, this.state.revision, this.state);
  }
}
