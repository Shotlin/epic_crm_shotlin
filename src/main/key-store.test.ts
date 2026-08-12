import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    isAsyncEncryptionAvailable: async () => false,
    encryptStringAsync: async () => Buffer.alloc(0),
    decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
    getSelectedStorageBackend: () => 'unknown',
  },
}));

import { EncryptedFileEnvelope } from './encrypted-file-envelope';
import { ProtectedKeyStore, type ProtectedKeyStoreSafeStorage } from './key-store';

class TestSafeStorage implements ProtectedKeyStoreSafeStorage {
  public encryptionAvailable = true;
  public asyncEncryptionAvailable = true;
  public backend: ReturnType<ProtectedKeyStoreSafeStorage['getSelectedStorageBackend']> = 'gnome_libsecret';
  public decryptCalls = 0;
  public encryptCalls = 0;
  public shouldReEncryptNextDecrypt = false;

  public isEncryptionAvailable(): boolean {
    return this.encryptionAvailable;
  }

  public async isAsyncEncryptionAvailable(): Promise<boolean> {
    return this.asyncEncryptionAvailable;
  }

  public async encryptStringAsync(plaintext: string): Promise<Buffer> {
    this.encryptCalls += 1;
    return Buffer.from(`wrapped-${this.encryptCalls}:${Buffer.from(plaintext, 'utf8').toString('base64')}`, 'utf8');
  }

  public async decryptStringAsync(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }> {
    this.decryptCalls += 1;
    const encoded = encrypted.toString('utf8').split(':', 2)[1];
    if (!encoded) throw new Error('Test safeStorage blob is invalid.');
    const shouldReEncrypt = this.shouldReEncryptNextDecrypt;
    this.shouldReEncryptNextDecrypt = false;
    return { result: Buffer.from(encoded, 'base64').toString('utf8'), shouldReEncrypt };
  }

  public getSelectedStorageBackend(): ReturnType<ProtectedKeyStoreSafeStorage['getSelectedStorageBackend']> {
    return this.backend;
  }
}

const fixedNow = (): Date => new Date('2026-08-07T12:00:00.000Z');

function keyStore(directory: string, storage: TestSafeStorage, overrides: Partial<ConstructorParameters<typeof ProtectedKeyStore>[1]> = {}): ProtectedKeyStore {
  return new ProtectedKeyStore(directory, {
    safeStorage: storage,
    platform: 'win32',
    processType: 'browser',
    now: fixedNow,
    ...overrides,
  });
}

describe('ProtectedKeyStore v2', () => {
  it('creates a versioned main-process keyring without writing raw master material', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-keyring-new-'));
    const storage = new TestSafeStorage();
    try {
      const first = await keyStore(directory, storage).getOrCreateKeyMaterial();
      const keyringPath = path.join(directory, 'secrets', 'keyring.v2.json');
      const rawKeyring = await readFile(keyringPath, 'utf8');
      const persisted = JSON.parse(rawKeyring) as { schema: string; version: number; activeKeyId: string; keys: Array<{ keyVersion: number; protectedKey: string }> };

      expect(first.key).toHaveLength(32);
      expect(first).toMatchObject({ keyId: 'local-master-v1', keyVersion: 1, migratedFromLegacy: false, rewrapped: false });
      expect(persisted).toMatchObject({ schema: 'epic-bos/protected-keyring', version: 2, activeKeyId: 'local-master-v1' });
      expect(persisted.keys).toHaveLength(1);
      expect(persisted.keys[0]).toMatchObject({ keyVersion: 1 });
      expect(persisted.keys[0]?.protectedKey).not.toBe(first.key.toString('base64'));

      const reopened = await keyStore(directory, storage).getOrCreateKeyMaterial();
      expect(reopened.key.equals(first.key)).toBe(true);
      expect(reopened.migratedFromLegacy).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('migrates a v1 safeStorage blob without orphaning an encrypted persisted artifact or deleting the v1 fallback', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-keyring-legacy-'));
    const storage = new TestSafeStorage();
    const legacyKey = randomBytes(32);
    try {
      const secretsDirectory = path.join(directory, 'secrets');
      const legacyPath = path.join(secretsDirectory, 'vault-key.v1.bin');
      const sourcePath = path.join(directory, 'database.sqlite3');
      const sealedPath = path.join(directory, 'database.sqlite3.enc');
      const restoredPath = path.join(directory, 'restored.sqlite3');
      const legacyBlob = await storage.encryptStringAsync(legacyKey.toString('base64'));
      await mkdir(secretsDirectory, { recursive: true });
      await writeFile(legacyPath, legacyBlob, { mode: 0o600 });
      await writeFile(sourcePath, 'pre-existing encrypted database evidence', 'utf8');
      await new EncryptedFileEnvelope(legacyKey).seal(sourcePath, sealedPath);

      const material = await keyStore(directory, storage).getOrCreateKeyMaterial();
      expect(material.key.equals(legacyKey)).toBe(true);
      expect(material.migratedFromLegacy).toBe(true);
      await expect(readFile(legacyPath)).resolves.toEqual(legacyBlob);
      await expect(readFile(path.join(secretsDirectory, 'keyring.v2.json'))).resolves.toBeTruthy();

      await new EncryptedFileEnvelope(material.key).open(sealedPath, restoredPath);
      await expect(readFile(restoredPath, 'utf8')).resolves.toBe('pre-existing encrypted database evidence');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses Electron shouldReEncrypt guidance, performs a stable second decrypt, and atomically refreshes the v2 blob', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-keyring-rewrap-'));
    const storage = new TestSafeStorage();
    try {
      const first = await keyStore(directory, storage).getOrCreateKeyMaterial();
      const keyringPath = path.join(directory, 'secrets', 'keyring.v2.json');
      const before = JSON.parse(await readFile(keyringPath, 'utf8')) as { keys: Array<{ protectedKey: string; createdAt: string }> };
      storage.decryptCalls = 0;
      storage.shouldReEncryptNextDecrypt = true;

      const refreshed = await keyStore(directory, storage).getOrCreateKeyMaterial();
      const after = JSON.parse(await readFile(keyringPath, 'utf8')) as { keys: Array<{ protectedKey: string; createdAt: string; rewrappedAt?: string }> };

      expect(refreshed.key.equals(first.key)).toBe(true);
      expect(refreshed.rewrapped).toBe(true);
      expect(storage.decryptCalls).toBe(2);
      expect(after.keys[0]?.protectedKey).not.toBe(before.keys[0]?.protectedKey);
      expect(after.keys[0]).toMatchObject({ createdAt: '2026-08-07T12:00:00.000Z', rewrappedAt: '2026-08-07T12:00:00.000Z' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fails closed when Linux safeStorage selects basic_text or is not ready to identify a protected backend', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-keyring-linux-'));
    const storage = new TestSafeStorage();
    try {
      storage.backend = 'basic_text';
      await expect(keyStore(directory, storage, { platform: 'linux' }).getOrCreateKey()).rejects.toThrow(/GNOME Keyring or KWallet/i);
      storage.backend = 'unknown';
      await expect(keyStore(directory, storage, { platform: 'linux' }).getOrCreateKey()).rejects.toThrow(/GNOME Keyring or KWallet/i);
      await expect(readFile(path.join(directory, 'secrets', 'keyring.v2.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects renderer access and a malformed v2 keyring instead of silently creating a different master key', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-keyring-fail-closed-'));
    const storage = new TestSafeStorage();
    try {
      await expect(keyStore(directory, storage, { processType: 'renderer' }).getOrCreateKey()).rejects.toThrow(/main process/i);
      const secretsDirectory = path.join(directory, 'secrets');
      await mkdir(secretsDirectory, { recursive: true });
      await writeFile(path.join(secretsDirectory, 'keyring.v2.json'), '{not-json', { mode: 0o600 });
      await expect(keyStore(directory, storage).getOrCreateKey()).rejects.toThrow(/not valid JSON/i);
      await expect(readFile(path.join(secretsDirectory, 'keyring.v2.json'), 'utf8')).resolves.toBe('{not-json');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
