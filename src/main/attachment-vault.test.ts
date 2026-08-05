import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AttachmentVault } from './attachment-vault';
import { BusinessDatabase } from './database';

describe('encrypted attachment vault', () => {
  let directory: string;
  let database: BusinessDatabase;
  let vault: AttachmentVault;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'epic-bos-vault-'));
    database = new BusinessDatabase(path.join(directory, 'test.sqlite3'));
    await database.initialize();
    vault = new AttachmentVault(database, path.join(directory, 'vault'), Buffer.alloc(32, 7));
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('encrypts bytes at rest and decrypts only through verified export', async () => {
    const source = path.join(directory, 'contract.txt');
    const target = path.join(directory, 'exported.txt');
    await writeFile(source, 'confidential commercial terms', 'utf8');
    const metadata = await vault.addFromPath(
      source,
      'crm.opportunity',
      'opp-kestrel',
      'user-avery',
    );
    const stored = database.getAttachment(metadata.id);
    expect(stored).toBeTruthy();
    expect((await readFile(stored!.encryptedPath, 'utf8'))).not.toContain('confidential');
    expect(vault.list('crm.opportunity', 'opp-kestrel')).toHaveLength(1);

    await vault.exportToPath(metadata.id, target);
    expect(await readFile(target, 'utf8')).toBe('confidential commercial terms');
  });

  it('rejects tampered ciphertext before writing plaintext', async () => {
    const source = path.join(directory, 'evidence.txt');
    await writeFile(source, 'audit evidence', 'utf8');
    const metadata = await vault.addFromPath(source, 'kernel.audit', 'audit-1', 'user-avery');
    const stored = database.getAttachment(metadata.id)!;
    const bytes = await readFile(stored.encryptedPath);
    bytes[0] = bytes[0]! ^ 0xff;
    await writeFile(stored.encryptedPath, bytes);

    await expect(vault.exportToPath(metadata.id, path.join(directory, 'bad.txt'))).rejects.toThrow();
  });
});
