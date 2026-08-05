import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessDatabase } from './database';
import { ApiKeyStore } from './api-key-store';

let directory = '';
let database: BusinessDatabase;

beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-api-key-')); database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3')); await database.initialize(); });
afterEach(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });

describe('ApiKeyStore', () => {
  it('issues a one-time token and lists only non-secret administration evidence', () => {
    const store = new ApiKeyStore(database);
    const issued = store.issue({ label: 'Warehouse reporting', companyId: 'company-india', branchId: 'branch-mumbai', scopes: ['inventory.read'] }, 'user-avery');
    expect(store.list('company-india', 'branch-mumbai')).toMatchObject([{ id: issued.record.id, keyPrefix: issued.record.keyPrefix, scopes: ['inventory.read'] }]);
    expect(JSON.stringify(store.list('company-india', 'branch-mumbai'))).not.toContain(issued.token);
    store.revoke(issued.record.id, 'user-avery');
    expect(store.list('company-india', 'branch-mumbai')[0]?.revokedAt).toBeTruthy();
  });
});
