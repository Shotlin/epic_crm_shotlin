import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EncryptedFileEnvelope } from './encrypted-file-envelope';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('encrypted file envelope', () => {
  it('seals and authenticates a file without leaving plaintext in the envelope', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-envelope-'));
    directories.push(directory);
    const sourcePath = path.join(directory, 'source.sqlite3');
    const sealedPath = path.join(directory, 'backup.epicbackup');
    const restoredPath = path.join(directory, 'restored.sqlite3');
    const plaintext = Buffer.from('SQLite format 3\0\nretail-evidence');
    await writeFile(sourcePath, plaintext);
    const envelope = new EncryptedFileEnvelope(randomBytes(32));

    await envelope.seal(sourcePath, sealedPath);
    const sealed = await readFile(sealedPath);
    expect(EncryptedFileEnvelope.isEncrypted(sealed)).toBe(true);
    expect(sealed.includes(plaintext)).toBe(false);
    await envelope.open(sealedPath, restoredPath);
    await expect(readFile(restoredPath)).resolves.toEqual(plaintext);
  });

  it('fails closed when the key or envelope is tampered with', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-envelope-tamper-'));
    directories.push(directory);
    const sourcePath = path.join(directory, 'source.sqlite3');
    const sealedPath = path.join(directory, 'backup.epicbackup');
    const restoredPath = path.join(directory, 'restored.sqlite3');
    await writeFile(sourcePath, Buffer.from('private business data'));
    const envelope = new EncryptedFileEnvelope(randomBytes(32));
    await envelope.seal(sourcePath, sealedPath);
    const tampered = await readFile(sealedPath);
    const lastByte = tampered.length - 1;
    tampered[lastByte] = (tampered[lastByte] ?? 0) ^ 1;
    await writeFile(sealedPath, tampered);
    await expect(envelope.open(sealedPath, restoredPath)).rejects.toThrow(/authentication failed/i);
  });

  it('writes a namespace-separated v2 envelope and still reads a legacy v1 file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-envelope-rotation-'));
    directories.push(directory);
    const sourcePath = path.join(directory, 'source.sqlite3');
    const legacyPath = path.join(directory, 'legacy.epicbackup');
    const activePath = path.join(directory, 'active.epicbackup');
    const restoredLegacyPath = path.join(directory, 'restored-legacy.sqlite3');
    const restoredActivePath = path.join(directory, 'restored-active.sqlite3');
    const plaintext = Buffer.from('versioned retail backup');
    const masterKey = randomBytes(32);
    await writeFile(sourcePath, plaintext);

    await new EncryptedFileEnvelope(masterKey).seal(sourcePath, legacyPath);
    const active = EncryptedFileEnvelope.forArtifact(masterKey, 'database-backup');
    await active.open(legacyPath, restoredLegacyPath);
    await active.seal(sourcePath, activePath);
    await active.open(activePath, restoredActivePath);

    const activeEnvelope = await readFile(activePath);
    expect(activeEnvelope[Buffer.from('EPIC-BOS-ENCRYPTED-FILE\0').length]).toBe(2);
    await expect(readFile(restoredLegacyPath)).resolves.toEqual(plaintext);
    await expect(readFile(restoredActivePath)).resolves.toEqual(plaintext);
  });
});
