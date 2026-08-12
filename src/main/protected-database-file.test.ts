import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
});
