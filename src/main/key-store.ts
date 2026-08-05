import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { safeStorage } from 'electron';

export class ProtectedKeyStore {
  private readonly keyPath: string;

  public constructor(dataDirectory: string) {
    this.keyPath = path.join(dataDirectory, 'secrets', 'vault-key.v1.bin');
  }

  public async getOrCreateKey(): Promise<Buffer> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('The operating-system credential vault is unavailable.');
    }
    try {
      const protectedKey = await readFile(this.keyPath);
      const key = Buffer.from(safeStorage.decryptString(protectedKey), 'base64');
      if (key.length !== 32) throw new Error('Attachment vault key is invalid.');
      return key;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code !== 'ENOENT') throw error;
    }

    const key = randomBytes(32);
    const protectedKey = safeStorage.encryptString(key.toString('base64'));
    await mkdir(path.dirname(this.keyPath), { recursive: true });
    const temporaryPath = this.keyPath + '.next';
    await writeFile(temporaryPath, protectedKey, { mode: 0o600 });
    await rename(temporaryPath, this.keyPath);
    return key;
  }
}
