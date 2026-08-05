import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CrmStore } from './crm-store';
import { CrmDepthStore } from './crm-depth-store';
import { BusinessDatabase } from './database';
import { PartyStore } from './party-store';
import { RetailWorkspaceModeStore } from './retail-workspace-mode-store';

let directory = '';
let database: BusinessDatabase;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-workspace-mode-'));
  database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3'));
  await database.initialize();
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

describe('RetailWorkspaceModeStore', () => {
  it('creates an explicit clean mode for a fresh workspace and never hydrates fictional CRM records', async () => {
    const modeStore = new RetailWorkspaceModeStore(database);
    await modeStore.initialize('2026-08-03T10:00:00.000Z');
    const crmStore = new CrmStore(database, directory);
    const partyStore = new PartyStore(database);
    await crmStore.initialize();
    await partyStore.initialize();
    const crmDepthStore = new CrmDepthStore(database, crmStore, partyStore);
    await crmDepthStore.initialize();

    expect(modeStore.getProjection()).toMatchObject({
      status: 'configured',
      mode: 'clean',
      externalWritePolicy: 'blocked',
    });
    expect(crmStore.getSnapshot()).toMatchObject({
      leads: [],
      opportunities: [],
      activities: [],
      sources: [],
      revenueSeries: [],
    });
    expect(partyStore.getSnapshot()).toMatchObject({
      accounts: [],
      contacts: [],
      addresses: [],
      consents: [],
    });
    expect(crmDepthStore.getSnapshot()).toMatchObject({
      campaigns: [],
      savedViews: [],
      adapters: [],
      communications: [],
    });
  });

  it('marks an existing unclassified workspace as protected instead of guessing that it is clean', async () => {
    database.saveState('crm', 1, 1, { schemaVersion: 1, revision: 1 });
    const modeStore = new RetailWorkspaceModeStore(database);
    await modeStore.initialize('2026-08-03T10:00:00.000Z');

    expect(modeStore.getProjection()).toMatchObject({
      status: 'requires-classification',
      mode: null,
      externalWritePolicy: 'blocked',
      requiresReconciliation: true,
    });
  });
});
