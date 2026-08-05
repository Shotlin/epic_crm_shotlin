import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BusinessDatabase } from './database';
import { BackupService } from './backup-service';

let directory = '';
let database: BusinessDatabase;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-restore-drill-test-'));
  database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3'));
  await database.initialize();
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

describe('isolated restore drill', () => {
  it('verifies a copied online backup without changing the active database', async () => {
    const service = new BackupService(database, path.join(directory, 'backups'));
    const beforePath = database.path;
    const result = await service.runRestoreDrill();

    expect(result).toMatchObject({ status: 'passed', isolated: true });
    expect(result.sourceBackup?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.restoredCopy?.sha256).toBe(result.sourceBackup?.sha256);
    expect(database.path).toBe(beforePath);
    expect(database.verifyIntegrity()).toBe(true);
    database.recordRestoreDrill({ ...result, actorId: 'user-owner' });
    expect(database.listRestoreDrills()).toMatchObject([{ id: result.id, actorId: 'user-owner', status: 'passed' }]);
  });
});
