import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { BusinessDatabase } from './database';
import { EncryptedFileEnvelope } from './encrypted-file-envelope';
import { ProtectedDatabaseFile } from './protected-database-file';

describe('ProtectedDatabaseFile', () => {
  it('seals a runtime database and restores it on the next launch', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-protected-db-'));
    const databasePath = path.join(directory, 'epic-bos.sqlite3');
    const key = randomBytes(32);
    try {
      const database = new BusinessDatabase(databasePath);
      await database.initialize();
      database.close();

      const protection = new ProtectedDatabaseFile(databasePath, key);
      expect(await protection.prepareRuntime()).toBe('legacy-plaintext-migrated');
      await expect(readFile(databasePath)).rejects.toMatchObject({ code: 'ENOENT' });
      const sealed = await protection.sealRuntime();
      expect(sealed?.plaintextRemoved).toBe(true);
      expect(EncryptedFileEnvelope.isEncrypted(await readFile(protection.encryptedPath))).toBe(true);

      const reopened = new ProtectedDatabaseFile(databasePath, key);
      expect(await reopened.prepareRuntime()).toBe('encrypted-persisted');
      const restoredDatabase = new BusinessDatabase(reopened.runtimePath);
      await restoredDatabase.initialize();
      expect(restoredDatabase.verifyIntegrity()).toBe(true);
      restoredDatabase.close();
      await reopened.removePlaintextArtifacts();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('opens a legacy v1 encrypted database after the v2 migration', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-protected-db-v1-compat-'));
    const databasePath = path.join(directory, 'epic-bos.sqlite3');
    const key = randomBytes(32);
    try {
      const database = new BusinessDatabase(databasePath);
      await database.initialize();
      database.close();

      const legacyEnvelope = new EncryptedFileEnvelope(key);
      await legacyEnvelope.seal(databasePath, `${databasePath}.enc`);
      await rm(databasePath, { force: true });

      const protection = new ProtectedDatabaseFile(databasePath, key);
      expect(await protection.prepareRuntime()).toBe('encrypted-persisted');
      const restored = new BusinessDatabase(protection.runtimePath);
      await restored.initialize();
      expect(restored.verifyIntegrity()).toBe(true);
      restored.close();
      await protection.removePlaintextArtifacts();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('recovers an unsealed runtime after an interrupted shutdown without discarding it', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-protected-db-recovery-'));
    const databasePath = path.join(directory, 'epic-bos.sqlite3');
    const key = randomBytes(32);
    try {
      const protection = new ProtectedDatabaseFile(databasePath, key);
      await mkdir(path.dirname(protection.runtimePath), { recursive: true });
      const raw = new DatabaseSync(protection.runtimePath);
      raw.exec('CREATE TABLE recovery_marker(value TEXT NOT NULL); INSERT INTO recovery_marker VALUES (\'kept\');');
      raw.close();

      expect(await protection.prepareRuntime()).toBe('recovered-runtime');
      const recovered = new DatabaseSync(protection.runtimePath, { readOnly: true, allowExtension: false });
      expect((recovered.prepare('SELECT value FROM recovery_marker').get() as { value: string }).value).toBe('kept');
      recovered.close();
      await protection.removePlaintextArtifacts();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('recovers committed WAL data after a simulated power-loss termination', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-protected-db-power-loss-'));
    const databasePath = path.join(directory, 'epic-bos.sqlite3');
    const key = randomBytes(32);
    const protection = new ProtectedDatabaseFile(databasePath, key);
    const childScript = `
      const { DatabaseSync } = require('node:sqlite');
      const database = new DatabaseSync(process.argv[1]);
      database.exec("PRAGMA journal_mode=WAL; CREATE TABLE power_loss_marker(value TEXT NOT NULL); INSERT INTO power_loss_marker VALUES ('committed-before-power-loss');");
      process.stdout.write('ready\\n');
      setInterval(() => {}, 1000);
    `;
    const child = spawn(process.execPath, ['-e', childScript, protection.runtimePath], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    try {
      await once(child.stdout!, 'data');
      child.kill('SIGKILL');
      await once(child, 'exit');

      expect(await protection.prepareRuntime()).toBe('recovered-runtime');
      const recovered = new DatabaseSync(protection.runtimePath, { readOnly: true, allowExtension: false });
      expect((recovered.prepare('SELECT value FROM power_loss_marker').get() as { value: string }).value).toBe('committed-before-power-loss');
      expect((recovered.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check).toBe('ok');
      recovered.close();
    } finally {
      if (!child.killed) child.kill('SIGKILL');
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rotates the persisted key atomically and rejects the previous key', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-protected-db-rotation-'));
    const databasePath = path.join(directory, 'epic-bos.sqlite3');
    const oldKey = randomBytes(32);
    const newKey = randomBytes(32);
    try {
      const database = new BusinessDatabase(databasePath);
      await database.initialize();
      database.close();

      const original = new ProtectedDatabaseFile(databasePath, oldKey);
      expect(await original.prepareRuntime()).toBe('legacy-plaintext-migrated');
      expect(await original.sealRuntime()).not.toBeNull();

      const rotating = new ProtectedDatabaseFile(databasePath, oldKey);
      expect(await rotating.prepareRuntime()).toBe('encrypted-persisted');
      const restored = new BusinessDatabase(rotating.runtimePath);
      await restored.initialize();
      restored.close();
      expect(await rotating.sealRuntime()).not.toBeNull();
      const receipt = await rotating.rotateKey(newKey);
      expect(receipt.previousKeyRejected).toBe(true);
      expect(receipt.plaintextRemoved).toBe(true);

      const reopened = new ProtectedDatabaseFile(databasePath, newKey);
      expect(await reopened.prepareRuntime()).toBe('encrypted-persisted');
      const verified = new BusinessDatabase(reopened.runtimePath);
      await verified.initialize();
      expect(verified.verifyIntegrity()).toBe(true);
      verified.close();
      await reopened.removePlaintextArtifacts();

      const oldKeyView = new ProtectedDatabaseFile(databasePath, oldKey);
      await expect(oldKeyView.prepareRuntime()).rejects.toThrow(/authentication failed/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fails closed when a stale runtime is corrupted during recovery', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-protected-db-corrupt-runtime-'));
    const databasePath = path.join(directory, 'epic-bos.sqlite3');
    const key = randomBytes(32);
    try {
      const database = new BusinessDatabase(databasePath);
      await database.initialize();
      database.close();

      const protection = new ProtectedDatabaseFile(databasePath, key);
      expect(await protection.prepareRuntime()).toBe('legacy-plaintext-migrated');
      expect(await protection.sealRuntime()).not.toBeNull();
      await writeFile(protection.runtimePath, Buffer.from('corrupted runtime bytes'));

      await expect(protection.prepareRuntime()).rejects.toThrow(/integrity check failed|not a database/i);
      expect(EncryptedFileEnvelope.isEncrypted(await readFile(protection.encryptedPath))).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('applies an encrypted restore candidate and removes it only after the local swap consumes it', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-protected-db-encrypted-restore-'));
    const databasePath = path.join(directory, 'epic-bos.sqlite3');
    const restoreSourcePath = path.join(directory, 'restore-source.sqlite3');
    const key = randomBytes(32);
    try {
      const original = new BusinessDatabase(databasePath);
      await original.initialize();
      original.close();

      const protection = new ProtectedDatabaseFile(databasePath, key);
      expect(await protection.prepareRuntime()).toBe('legacy-plaintext-migrated');

      const restoreSource = new DatabaseSync(restoreSourcePath);
      restoreSource.exec("CREATE TABLE restored_marker(value TEXT NOT NULL); INSERT INTO restored_marker VALUES ('encrypted-stage');");
      restoreSource.close();
      const restoreEnvelope = EncryptedFileEnvelope.forArtifact(key, 'database-backup');
      await restoreEnvelope.seal(restoreSourcePath, protection.encryptedStagedRestorePath);

      const sealedCandidate = await readFile(protection.encryptedStagedRestorePath);
      expect(EncryptedFileEnvelope.isEncrypted(sealedCandidate)).toBe(true);
      expect(sealedCandidate.includes(Buffer.from('encrypted-stage'))).toBe(false);
      expect(await protection.prepareStagedRestore()).toBe('encrypted-staged');

      expect(await protection.applyPreparedStagedRestore()).toBe(true);
      await protection.finalizeStagedRestore();

      await expect(readFile(protection.stagedRestorePath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(protection.encryptedStagedRestorePath)).rejects.toMatchObject({ code: 'ENOENT' });
      const restored = new DatabaseSync(protection.runtimePath, { readOnly: true, allowExtension: false });
      expect((restored.prepare('SELECT value FROM restored_marker').get() as { value: string }).value).toBe('encrypted-stage');
      restored.close();
      await protection.removePlaintextArtifacts();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('checkpoints a recovered WAL before sealing so committed data survives the encrypted restart', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-protected-db-wal-seal-'));
    const databasePath = path.join(directory, 'epic-bos.sqlite3');
    const key = randomBytes(32);
    const protection = new ProtectedDatabaseFile(databasePath, key);
    const childScript = `
      const { DatabaseSync } = require('node:sqlite');
      const database = new DatabaseSync(process.argv[1]);
      database.exec("PRAGMA journal_mode=WAL; CREATE TABLE seal_marker(value TEXT NOT NULL); INSERT INTO seal_marker VALUES ('checkpointed-before-seal');");
      process.stdout.write('ready\\n');
      setInterval(() => {}, 1000);
    `;
    const child = spawn(process.execPath, ['-e', childScript, protection.runtimePath], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    try {
      await once(child.stdout!, 'data');
      child.kill('SIGKILL');
      await once(child, 'exit');

      expect(await protection.prepareRuntime()).toBe('recovered-runtime');
      expect(await protection.sealRuntime()).not.toBeNull();
      const reopened = new ProtectedDatabaseFile(databasePath, key);
      expect(await reopened.prepareRuntime()).toBe('encrypted-persisted');
      const verified = new DatabaseSync(reopened.runtimePath, { readOnly: true, allowExtension: false });
      expect((verified.prepare('SELECT value FROM seal_marker').get() as { value: string }).value).toBe('checkpointed-before-seal');
      verified.close();
      await reopened.removePlaintextArtifacts();
    } finally {
      if (!child.killed) child.kill('SIGKILL');
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('retires an old plaintext restore archive only after sealing the current runtime', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-protected-db-archive-cleanup-'));
    const databasePath = path.join(directory, 'epic-bos.sqlite3');
    const key = randomBytes(32);
    try {
      const initial = new BusinessDatabase(databasePath);
      await initial.initialize();
      initial.close();

      const protection = new ProtectedDatabaseFile(databasePath, key);
      expect(await protection.prepareRuntime()).toBe('legacy-plaintext-migrated');
      expect(await protection.sealRuntime()).not.toBeNull();
      expect(await protection.prepareRuntime()).toBe('encrypted-persisted');
      const archivePath = `${protection.runtimePath}.before-restore-legacy`;
      await copyFile(protection.runtimePath, archivePath);

      await protection.reconcileLegacyRestoreArchives();

      await expect(readFile(archivePath)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(EncryptedFileEnvelope.isEncrypted(await readFile(protection.encryptedPath))).toBe(true);
      await protection.removePlaintextArtifacts();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('recovers an interrupted encrypted-stage materialization only when the two candidates match', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-protected-db-stage-recovery-'));
    const databasePath = path.join(directory, 'epic-bos.sqlite3');
    const sourcePath = path.join(directory, 'restore-source.sqlite3');
    const key = randomBytes(32);
    try {
      const source = new DatabaseSync(sourcePath);
      source.exec("CREATE TABLE recovery_marker(value TEXT NOT NULL); INSERT INTO recovery_marker VALUES ('same-candidate');");
      source.close();

      const protection = new ProtectedDatabaseFile(databasePath, key);
      const restoreEnvelope = EncryptedFileEnvelope.forArtifact(key, 'database-backup');
      await restoreEnvelope.seal(sourcePath, protection.encryptedStagedRestorePath);
      // This models a power loss after the encrypted stage was opened but
      // before the atomic restore swap began.
      await restoreEnvelope.open(protection.encryptedStagedRestorePath, protection.stagedRestorePath);

      expect(await protection.prepareStagedRestore()).toBe('encrypted-staged');
      const recovered = new DatabaseSync(protection.stagedRestorePath, { readOnly: true, allowExtension: false });
      expect((recovered.prepare('SELECT value FROM recovery_marker').get() as { value: string }).value).toBe('same-candidate');
      recovered.close();
      await protection.removePlaintextPath(protection.stagedRestorePath);
      await protection.finalizeStagedRestore();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fails closed and retains both candidates when interrupted restore staging diverges', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-protected-db-stage-conflict-'));
    const databasePath = path.join(directory, 'epic-bos.sqlite3');
    const sourcePath = path.join(directory, 'restore-source.sqlite3');
    const key = randomBytes(32);
    try {
      const source = new DatabaseSync(sourcePath);
      source.exec("CREATE TABLE recovery_marker(value TEXT NOT NULL); INSERT INTO recovery_marker VALUES ('sealed-candidate');");
      source.close();

      const protection = new ProtectedDatabaseFile(databasePath, key);
      const restoreEnvelope = EncryptedFileEnvelope.forArtifact(key, 'database-backup');
      await restoreEnvelope.seal(sourcePath, protection.encryptedStagedRestorePath);
      const divergent = new DatabaseSync(protection.stagedRestorePath);
      divergent.exec("CREATE TABLE recovery_marker(value TEXT NOT NULL); INSERT INTO recovery_marker VALUES ('different-plaintext');");
      divergent.close();

      await expect(protection.prepareStagedRestore()).rejects.toThrow(/copies differ/i);
      await expect(readFile(protection.stagedRestorePath)).resolves.toBeInstanceOf(Buffer);
      await expect(readFile(protection.encryptedStagedRestorePath)).resolves.toBeInstanceOf(Buffer);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
