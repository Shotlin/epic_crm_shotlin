import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BusinessDatabase } from './database';
import { BackupService } from './backup-service';
import { EncryptedFileEnvelope } from './encrypted-file-envelope';

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
    expect(result.restoredCopy?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.restoredCopy?.sha256).toBe(result.sourceBackup?.sha256);
    expect(database.path).toBe(beforePath);
    expect(database.verifyIntegrity()).toBe(true);
    database.recordRestoreDrill({ ...result, actorId: 'user-owner' });
    expect(database.listRestoreDrills()).toMatchObject([{ id: result.id, actorId: 'user-owner', status: 'passed' }]);
  });

  it('runs the restore drill through an encrypted backup envelope when a protected key is supplied', async () => {
    const service = new BackupService(database, path.join(directory, 'encrypted-backups'), Buffer.alloc(32, 7));
    const result = await service.runRestoreDrill();

    expect(result).toMatchObject({ status: 'passed', isolated: true });
    expect(result.sourceBackup?.fileName).toBe('source.epicbackup');
    expect(result.restoredCopy?.fileName).toBe('restored.epicbackup');
    expect(result.sourceBackup?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.restoredCopy?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.restoredCopy?.sha256).not.toBe(result.sourceBackup?.sha256);
    expect(database.verifyIntegrity()).toBe(true);
  });

  it('inventories and rewraps plaintext and legacy v1 files in the managed folder', async () => {
    const backupDirectory = path.join(directory, 'managed-backups');
    await mkdir(backupDirectory, { recursive: true });
    const plaintextPath = path.join(backupDirectory, 'old.sqlite3');
    const legacyPath = path.join(backupDirectory, 'old.epicbackup');
    await database.createOnlineBackup(plaintextPath);
    await new EncryptedFileEnvelope(Buffer.alloc(32, 7)).seal(plaintextPath, legacyPath);

    const service = new BackupService(database, backupDirectory, Buffer.alloc(32, 7));
    const result = await service.rewrapLocalBackups();

    expect(result).toMatchObject({ scanned: 2, migrated: 2, remainingLegacy: 0, invalid: 0, verified: true });
    expect(result.entries.map(({ fileName }) => fileName)).toEqual(['old.epicbackup', 'old.sqlite3']);
    expect(EncryptedFileEnvelope.getVersion(await readFile(plaintextPath))).toBe(2);
    expect(EncryptedFileEnvelope.getVersion(await readFile(legacyPath))).toBe(2);
  });
});
