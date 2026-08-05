import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInitialCrmState } from '../domain/crm';
import { createInitialCrmDepthState } from '../domain/crm-depth';
import type { CrmDepthState } from '../shared/crm-depth-contracts';
import type { CrmState } from '../shared/contracts';
import { BusinessDatabase } from './database';
import { CrmDepthStore } from './crm-depth-store';
import { CrmStore } from './crm-store';
import { PartyStore } from './party-store';

describe('company-owned CRM and Party Master state', () => {
  let directory = '';
  let database: BusinessDatabase;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-company-scope-'));
    database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3'));
    await database.initialize();
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('upgrades only known starter CRM scope aliases to the canonical workspace scope', async () => {
    const legacy = createInitialCrmState();
    legacy.tenantId = 'tenant-epic';
    legacy.companyId = 'company-northstar';
    database.saveState('crm', legacy.schemaVersion, legacy.revision, legacy);

    const store = new CrmStore(database, path.join(directory, 'data'));
    await store.initialize();

    expect(store.getCompanyId()).toBe('company-northstar-us');
    expect(store.getAuthorizationScope()).toEqual({ companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' });
    const persisted = database.loadState<CrmState>('crm');
    expect(persisted?.payload.tenantId).toBe('tenant-northstar');
    expect(persisted?.payload.companyId).toBe('company-northstar-us');
    expect(persisted?.payload.branchId).toBe('branch-northstar-hq');
    expect(persisted?.revision).toBe(legacy.revision + 1);
  });

  it('does not rewrite a non-starter tenant scope during CRM initialization', async () => {
    const customerOwned = createInitialCrmState();
    customerOwned.tenantId = 'tenant-customer-owned';
    database.saveState('crm', customerOwned.schemaVersion, customerOwned.revision, customerOwned);

    const store = new CrmStore(database, path.join(directory, 'data'));
    await store.initialize();

    expect(database.loadState<CrmState>('crm')?.payload.tenantId).toBe('tenant-customer-owned');
  });

  it('exposes Party Master under its persisted company scope', async () => {
    const store = new PartyStore(database);
    await store.initialize();

    expect(store.getCompanyId()).toBe('company-northstar-us');
  });

  it('keeps CRM configuration bound to matching CRM and Party Master companies', async () => {
    const crmStore = new CrmStore(database, path.join(directory, 'data'));
    const partyStore = new PartyStore(database);
    await Promise.all([crmStore.initialize(), partyStore.initialize()]);
    const depthStore = new CrmDepthStore(database, crmStore, partyStore);
    await depthStore.initialize();

    expect(depthStore.getCompanyId()).toBe('company-northstar-us');
    expect(depthStore.getAuthorizationScope()).toEqual({ companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' });
  });

  it('upgrades legacy CRM-depth configuration into the CRM engagement branch', async () => {
    const crmStore = new CrmStore(database, path.join(directory, 'data'));
    const partyStore = new PartyStore(database);
    await Promise.all([crmStore.initialize(), partyStore.initialize()]);
    const legacy = createInitialCrmDepthState() as CrmDepthState;
    delete (legacy as Partial<CrmDepthState>).branchId;
    database.saveState('crm-depth', legacy.schemaVersion, legacy.revision, legacy);

    const depthStore = new CrmDepthStore(database, crmStore, partyStore);
    await depthStore.initialize();

    expect(depthStore.getAuthorizationScope()).toEqual({ companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' });
    expect(database.loadState<CrmDepthState>('crm-depth')?.payload.branchId).toBe('branch-northstar-hq');
  });

  it('fails closed when CRM and Party Master belong to different companies', async () => {
    const crm = createInitialCrmState();
    crm.companyId = 'company-other';
    database.saveState('crm', crm.schemaVersion, crm.revision, crm);
    const crmStore = new CrmStore(database, path.join(directory, 'data'));
    const partyStore = new PartyStore(database);
    await Promise.all([crmStore.initialize(), partyStore.initialize()]);
    const depthStore = new CrmDepthStore(database, crmStore, partyStore);
    await depthStore.initialize();

    expect(() => depthStore.getCompanyId()).toThrow('CRM and Party Master company scopes do not match.');
  });
});
