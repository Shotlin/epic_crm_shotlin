import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { EncryptedFileEnvelope } from './encrypted-file-envelope';
import { ACTIVE_ARTIFACT_KEY_VERSION } from './artifact-key';

export type RuntimeDatabasePreparation =
  | 'encrypted-persisted'
  | 'recovered-runtime'
  | 'legacy-plaintext-migrated'
  | 'new-runtime';

export interface SealedDatabaseReceipt {
  encryptedPath: string;
  plaintextRemoved: boolean;
  bytes: number;
}

export interface RotatedDatabaseReceipt {
  encryptedPath: string;
  previousKeyRejected: boolean;
  plaintextRemoved: boolean;
}

/**
 * Protects the on-disk Store Edge database while retaining node:sqlite as the
 * runtime engine. The runtime file exists only while the app is open; normal
 * shutdown seals it with the OS-protected key. This is an at-rest lifecycle
 * boundary, not a replacement for a native SQLCipher runtime.
 */
export class ProtectedDatabaseFile {
  public readonly runtimePath: string;
  public readonly encryptedPath: string;
  private readonly envelope: EncryptedFileEnvelope;

  public constructor(private readonly legacyPath: string, key: Buffer) {
    this.runtimePath = `${legacyPath}.runtime`;
    this.encryptedPath = `${legacyPath}.enc`;
    this.envelope = EncryptedFileEnvelope.forArtifact(key, 'runtime-database', ACTIVE_ARTIFACT_KEY_VERSION);
  }

  public async prepareRuntime(): Promise<RuntimeDatabasePreparation> {
    await mkdir(path.dirname(this.legacyPath), { recursive: true });
    if (await this.exists(this.runtimePath)) {
      this.assertHealthy(this.runtimePath);
      return 'recovered-runtime';
    }

    if (await this.exists(this.encryptedPath)) {
      await this.envelope.open(this.encryptedPath, this.runtimePath);
      this.assertHealthy(this.runtimePath);
      return 'encrypted-persisted';
    }

    if (await this.exists(this.legacyPath)) {
      await copyFile(this.legacyPath, this.runtimePath);
      this.assertHealthy(this.runtimePath);
      // Once the copied runtime has passed an integrity check, remove the
      // legacy plaintext source immediately. Keeping it beside the protected
      // runtime would leave a second database copy exposed during the normal
      // session and would make a later crash unnecessarily leak plaintext.
      await this.removePlaintextPath(this.legacyPath);
      return 'legacy-plaintext-migrated';
    }

    return 'new-runtime';
  }

  public async sealRuntime(): Promise<SealedDatabaseReceipt | null> {
    if (!(await this.exists(this.runtimePath))) return null;
    this.assertHealthy(this.runtimePath);
    await this.envelope.seal(this.runtimePath, this.encryptedPath);
    await this.removePlaintextArtifacts();
    const encryptedStat = await stat(this.encryptedPath);
    return {
      encryptedPath: this.encryptedPath,
      plaintextRemoved: !(await this.exists(this.runtimePath)),
      bytes: encryptedStat.size,
    };
  }

  /**
   * Re-encrypts the persisted database with a new OS-protected key. The new
   * envelope is authenticated and opened into a temporary SQLite file before
   * the encrypted file is swapped. If the swap fails, the previous envelope
   * is restored; a successful rotation removes the old encrypted copy.
   */
  public async rotateKey(nextKey: Buffer): Promise<RotatedDatabaseReceipt> {
    const nextEnvelope = EncryptedFileEnvelope.forArtifact(nextKey, 'runtime-database', ACTIVE_ARTIFACT_KEY_VERSION);
    const rotationPath = `${this.encryptedPath}.rotation`;
    const verificationPath = `${this.runtimePath}.rotation-check`;
    const previousPath = `${this.encryptedPath}.previous`;
    const hasRuntime = await this.exists(this.runtimePath);
    const hasEncrypted = await this.exists(this.encryptedPath);
    if (hasRuntime) throw new Error('Rotate the protected database key only after the runtime database has been sealed.');
    if (!hasEncrypted) throw new Error('Cannot rotate a database key before a protected database exists.');

    await rm(rotationPath, { force: true });
    await rm(verificationPath, { force: true });
    await rm(previousPath, { force: true });

    await this.envelope.open(this.encryptedPath, verificationPath);
    this.assertHealthy(verificationPath);
    await nextEnvelope.seal(verificationPath, rotationPath);
    await rm(verificationPath, { force: true });

    await nextEnvelope.open(rotationPath, verificationPath);
    this.assertHealthy(verificationPath);
    await rm(verificationPath, { force: true });

    await rename(this.encryptedPath, previousPath);
    try {
      await rename(rotationPath, this.encryptedPath);
    } catch (error) {
      await rename(previousPath, this.encryptedPath);
      throw error;
    }
    await rm(previousPath, { force: true });
    return {
      encryptedPath: this.encryptedPath,
      previousKeyRejected: true,
      plaintextRemoved: !(await this.exists(this.runtimePath)) && !(await this.exists(this.legacyPath)),
    };
  }

  public async removePlaintextArtifacts(): Promise<void> {
    await rm(this.runtimePath, { force: true });
    for (const filePath of [
      `${this.runtimePath}-wal`,
      `${this.runtimePath}-shm`,
      this.legacyPath,
      `${this.legacyPath}-wal`,
      `${this.legacyPath}-shm`,
      `${this.runtimePath}.next`,
    ]) {
      await rm(filePath, { force: true });
    }
  }

  public async removePlaintextPath(filePath: string): Promise<void> {
    await rm(filePath, { force: true });
    await rm(`${filePath}-wal`, { force: true });
    await rm(`${filePath}-shm`, { force: true });
  }

  private assertHealthy(filePath: string): void {
    const database = new DatabaseSync(filePath, { readOnly: true, allowExtension: false });
    try {
      const result = database.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      if (result.integrity_check !== 'ok') throw new Error('Protected database integrity check failed.');
    } finally {
      database.close();
    }
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
