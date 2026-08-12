import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { safeStorage } from 'electron';

const KEYRING_SCHEMA = 'epic-bos/protected-keyring';
const KEYRING_VERSION = 2;
const ACTIVE_KEY_ID = 'local-master-v1';
const ACTIVE_KEY_VERSION = 1;

type LinuxSafeStorageBackend = 'basic_text' | 'gnome_libsecret' | 'kwallet' | 'kwallet5' | 'kwallet6' | 'unknown';

/**
 * The small main-process-only subset of Electron safeStorage used for master
 * key protection. It is injectable solely for deterministic unit tests; no
 * renderer or preload module imports this contract.
 */
export interface ProtectedKeyStoreSafeStorage {
  isEncryptionAvailable(): boolean;
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(plaintext: string): Promise<Buffer>;
  decryptStringAsync(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
  getSelectedStorageBackend(): LinuxSafeStorageBackend;
}

export interface ProtectedKeyMaterial {
  /** Main-process-only AES-256 material. Never expose this value over IPC. */
  key: Buffer;
  /** Stable identifier for artifacts encrypted under the currently supported key. */
  keyId: typeof ACTIVE_KEY_ID;
  /** Artifact-key version, deliberately separate from the keyring file schema. */
  keyVersion: typeof ACTIVE_KEY_VERSION;
  /** True only when an existing v1 safeStorage blob was copied into v2 keyring metadata. */
  migratedFromLegacy: boolean;
  /** True when Electron reported that the OS protection should be refreshed. */
  rewrapped: boolean;
}

interface PersistedKeyringV2 {
  schema: typeof KEYRING_SCHEMA;
  version: typeof KEYRING_VERSION;
  activeKeyId: typeof ACTIVE_KEY_ID;
  keys: [PersistedKeyringEntry];
}

interface PersistedKeyringEntry {
  id: typeof ACTIVE_KEY_ID;
  keyVersion: typeof ACTIVE_KEY_VERSION;
  /** Base64 representation of the OS-protected safeStorage blob, never plaintext key material. */
  protectedKey: string;
  createdAt: string;
  rewrappedAt?: string;
}

export interface ProtectedKeyStoreOptions {
  safeStorage?: ProtectedKeyStoreSafeStorage;
  /** Injectable for tests; production uses the actual operating-system platform. */
  platform?: NodeJS.Platform;
  /** Electron main is `browser`; renderer invocation is always rejected. */
  processType?: string | undefined;
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function fromBase64(value: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Protected keyring contains an invalid safeStorage blob.');
  }
  const decoded = Buffer.from(value, 'base64');
  if (!decoded.length || decoded.toString('base64') !== value) {
    throw new Error('Protected keyring contains an invalid safeStorage blob.');
  }
  return decoded;
}

function parseKeyring(contents: Buffer): PersistedKeyringV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents.toString('utf8')) as unknown;
  } catch {
    throw new Error('Protected keyring is not valid JSON.');
  }
  if (!isRecord(parsed)
    || parsed.schema !== KEYRING_SCHEMA
    || parsed.version !== KEYRING_VERSION
    || parsed.activeKeyId !== ACTIVE_KEY_ID
    || !Array.isArray(parsed.keys)
    || parsed.keys.length !== 1
    || !isRecord(parsed.keys[0])) {
    throw new Error('Protected keyring schema is unsupported.');
  }
  const entry = parsed.keys[0];
  if (entry.id !== ACTIVE_KEY_ID
    || entry.keyVersion !== ACTIVE_KEY_VERSION
    || typeof entry.protectedKey !== 'string'
    || !isIsoDate(entry.createdAt)
    || (entry.rewrappedAt !== undefined && !isIsoDate(entry.rewrappedAt))) {
    throw new Error('Protected keyring entry is invalid.');
  }
  // Validate before calling the OS vault. This avoids accepting a malformed
  // blob which a future Electron version might otherwise coerce differently.
  fromBase64(entry.protectedKey);
  return {
    schema: KEYRING_SCHEMA,
    version: KEYRING_VERSION,
    activeKeyId: ACTIVE_KEY_ID,
    keys: [{
      id: ACTIVE_KEY_ID,
      keyVersion: ACTIVE_KEY_VERSION,
      protectedKey: entry.protectedKey,
      createdAt: entry.createdAt,
      ...(entry.rewrappedAt ? { rewrappedAt: entry.rewrappedAt } : {}),
    }],
  };
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
}

/**
 * Main-process keyring for the one local master key used by the database,
 * backups, attachment vault, statutory adapters and provider connectors.
 *
 * v1 stored only a raw Electron `safeStorage` blob. v2 wraps that same blob in
 * versioned metadata. The v1 file is deliberately retained after a successful
 * migration: every current encrypted database, attachment, backup and provider
 * secret remains decryptable because the underlying 32-byte key never changes.
 * The artifact services now provide a separate v1→v2 envelope rewrap
 * operation; this class still does not rotate the OS-protected master key or
 * claim native SQLite page encryption.
 */
export class ProtectedKeyStore {
  private readonly legacyKeyPath: string;
  private readonly keyringPath: string;
  private readonly storage: ProtectedKeyStoreSafeStorage;
  private readonly platform: NodeJS.Platform;
  private readonly processType: string | undefined;
  private readonly now: () => Date;

  public constructor(dataDirectory: string, options: ProtectedKeyStoreOptions = {}) {
    const secretsDirectory = path.join(dataDirectory, 'secrets');
    this.legacyKeyPath = path.join(secretsDirectory, 'vault-key.v1.bin');
    this.keyringPath = path.join(secretsDirectory, 'keyring.v2.json');
    this.storage = options.safeStorage ?? safeStorage;
    this.platform = options.platform ?? process.platform;
    this.processType = options.processType ?? process.type;
    this.now = options.now ?? (() => new Date());
  }

  /** Compatibility API for existing main-process services. */
  public async getOrCreateKey(): Promise<Buffer> {
    return (await this.getOrCreateKeyMaterial()).key;
  }

  /**
   * Returns versioned main-process material. This must only be passed to local
   * main-process cryptographic services; it must never cross preload/IPC.
   */
  public async getOrCreateKeyMaterial(): Promise<ProtectedKeyMaterial> {
    this.assertMainProcess();
    await this.assertSecureStorage();

    const current = await this.readKeyring();
    if (current) return this.openCurrentKeyring(current);

    const legacy = await this.readLegacyKey();
    if (legacy) {
      const decrypted = await this.decryptProtectedKey(legacy);
      const key = this.parseMasterKey(decrypted.value);
      // Preserve v1 on disk. The v2 write is atomic, so a process interruption
      // leaves the known-good v1 material available on the next launch.
      await this.writeKeyring(await this.createKeyring(key, decrypted.rewrapRequired));
      return this.material(key, true, decrypted.rewrapRequired);
    }

    const key = randomBytes(32);
    await this.writeKeyring(await this.createKeyring(key, false));
    return this.material(key, false, false);
  }

  private async openCurrentKeyring(keyring: PersistedKeyringV2): Promise<ProtectedKeyMaterial> {
    const entry = keyring.keys[0];
    const decrypted = await this.decryptProtectedKey(fromBase64(entry.protectedKey));
    const key = this.parseMasterKey(decrypted.value);
    if (decrypted.rewrapRequired) {
      await this.writeKeyring(await this.createKeyring(key, true, entry.createdAt));
    }
    return this.material(key, false, decrypted.rewrapRequired);
  }

  private async readKeyring(): Promise<PersistedKeyringV2 | null> {
    try {
      return parseKeyring(await readFile(this.keyringPath));
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return null;
      throw error;
    }
  }

  private async readLegacyKey(): Promise<Buffer | null> {
    try {
      return await readFile(this.legacyKeyPath);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return null;
      throw error;
    }
  }

  private async assertSecureStorage(): Promise<void> {
    if (!this.storage.isEncryptionAvailable()) {
      throw new Error('The operating-system credential vault is unavailable.');
    }
    if (!(await this.storage.isAsyncEncryptionAvailable())) {
      throw new Error('The operating-system credential vault cannot provide asynchronous encryption.');
    }
    if (this.platform !== 'linux') return;
    const backend = this.storage.getSelectedStorageBackend();
    if (backend === 'basic_text' || backend === 'unknown') {
      throw new Error('Epic BOS requires GNOME Keyring or KWallet on Linux; the selected safeStorage backend does not protect secrets.');
    }
  }

  private assertMainProcess(): void {
    if (this.processType === 'renderer') {
      throw new Error('The protected keyring is available only in the Electron main process.');
    }
  }

  private async decryptProtectedKey(protectedKey: Buffer): Promise<{ value: string; rewrapRequired: boolean }> {
    const first = await this.storage.decryptStringAsync(protectedKey);
    if (!first.shouldReEncrypt) return { value: first.result, rewrapRequired: false };

    // Electron's async API instructs callers to decrypt a second time after a
    // key rotation/security-level change before re-encrypting persisted data.
    const refreshed = await this.storage.decryptStringAsync(protectedKey);
    if (refreshed.shouldReEncrypt) {
      throw new Error('The operating-system credential vault key rotation did not stabilize.');
    }
    if (refreshed.result !== first.result) {
      throw new Error('The operating-system credential vault returned inconsistent key material during re-encryption.');
    }
    return { value: refreshed.result, rewrapRequired: true };
  }

  private parseMasterKey(encoded: string): Buffer {
    const key = fromBase64(encoded);
    if (key.length !== 32) throw new Error('Protected master key is invalid.');
    return key;
  }

  private async createKeyring(key: Buffer, rewrapped: boolean, createdAt = this.now().toISOString()): Promise<PersistedKeyringV2> {
    const protectedKey = await this.storage.encryptStringAsync(key.toString('base64'));
    return {
      schema: KEYRING_SCHEMA,
      version: KEYRING_VERSION,
      activeKeyId: ACTIVE_KEY_ID,
      keys: [{
        id: ACTIVE_KEY_ID,
        keyVersion: ACTIVE_KEY_VERSION,
        protectedKey: protectedKey.toString('base64'),
        createdAt,
        ...(rewrapped ? { rewrappedAt: this.now().toISOString() } : {}),
      }],
    };
  }

  private async writeKeyring(keyring: PersistedKeyringV2): Promise<void> {
    await mkdir(path.dirname(this.keyringPath), { recursive: true });
    const temporaryPath = `${this.keyringPath}.next`;
    await rm(temporaryPath, { force: true });
    await writeFile(temporaryPath, `${JSON.stringify(keyring)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporaryPath, this.keyringPath);
  }

  private material(key: Buffer, migratedFromLegacy: boolean, rewrapped: boolean): ProtectedKeyMaterial {
    return { key, keyId: ACTIVE_KEY_ID, keyVersion: ACTIVE_KEY_VERSION, migratedFromLegacy, rewrapped };
  }
}
