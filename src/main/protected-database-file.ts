import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { EncryptedFileEnvelope } from './encrypted-file-envelope';
import { ACTIVE_ARTIFACT_KEY_VERSION } from './artifact-key';

export type RuntimeDatabasePreparation =
  | 'encrypted-persisted'
  | 'recovered-runtime'
  | 'legacy-plaintext-migrated'
  | 'new-runtime';

/**
 * Restore staging is a separate at-rest boundary from the active runtime.
 * The normal application path writes an encrypted stage; a plaintext stage is
 * accepted only to complete a migration from older desktop builds.
 */
export type RestoreStagePreparation =
  | 'none'
  | 'encrypted-staged'
  | 'legacy-plaintext-staged';

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
  private readonly restoreEnvelope: EncryptedFileEnvelope;

  public constructor(private readonly legacyPath: string, key: Buffer) {
    this.runtimePath = `${legacyPath}.runtime`;
    this.encryptedPath = `${legacyPath}.enc`;
    this.envelope = EncryptedFileEnvelope.forArtifact(key, 'runtime-database', ACTIVE_ARTIFACT_KEY_VERSION);
    // Restore candidates use the same versioned backup namespace as
    // BackupService. This lets the active database remain protected until the
    // candidate has been authenticated and is about to be atomically applied.
    this.restoreEnvelope = EncryptedFileEnvelope.forArtifact(key, 'database-backup', ACTIVE_ARTIFACT_KEY_VERSION);
  }

  /** A plaintext SQLite file exists here only for the immediate apply step. */
  public get stagedRestorePath(): string {
    return `${this.runtimePath}.restore-next`;
  }

  /** Durable restore staging is always this authenticated envelope path. */
  public get encryptedStagedRestorePath(): string {
    return `${this.stagedRestorePath}.enc`;
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

  /**
   * Materializes a verified restore candidate only immediately before its
   * local rename sequence.
   *
   * A prior build could leave a plaintext `${runtime}.restore-next` file
   * across a power loss. We preserve that legacy candidate long enough to
   * apply it, but never create a new one when the protected key is available.
   * If a crash interrupted the short materialization window, both copies must
   * be byte-identical; otherwise we stop rather than guessing which record is
   * authoritative.
   */
  public async prepareStagedRestore(): Promise<RestoreStagePreparation> {
    const plaintextExists = await this.exists(this.stagedRestorePath);
    const encryptedExists = await this.exists(this.encryptedStagedRestorePath);
    if (!encryptedExists) {
      if (!plaintextExists) return 'none';
      this.assertHealthy(this.stagedRestorePath);
      return 'legacy-plaintext-staged';
    }

    if (plaintextExists) {
      await this.assertEquivalentStagedRestore();
      await this.removePlaintextPath(this.stagedRestorePath);
    }

    await this.restoreEnvelope.open(this.encryptedStagedRestorePath, this.stagedRestorePath);
    try {
      this.assertHealthy(this.stagedRestorePath);
    } catch (error) {
      await this.removePlaintextPath(this.stagedRestorePath);
      throw error;
    }
    return 'encrypted-staged';
  }

  /**
   * Applies a previously verified restore stage without creating a plaintext
   * rollback archive. Before replacing an existing runtime, the old runtime
   * is checkpointed and sealed as the encrypted rollback copy. This makes a
   * failed rename recoverable from the protected envelope rather than from a
   * lingering `.before-restore-*` SQLite file.
   */
  public async applyPreparedStagedRestore(): Promise<boolean> {
    if (!(await this.exists(this.stagedRestorePath))) return false;
    this.assertHealthy(this.stagedRestorePath);
    const hadRuntime = await this.exists(this.runtimePath);
    if (hadRuntime) {
      this.checkpointRuntime(this.runtimePath);
      this.assertHealthy(this.runtimePath);
      await this.envelope.seal(this.runtimePath, this.encryptedPath);
      await this.removePlaintextPath(this.runtimePath);
    }

    try {
      await rename(this.stagedRestorePath, this.runtimePath);
      this.assertHealthy(this.runtimePath);
      return true;
    } catch (error) {
      // The encrypted restore candidate remains in place until finalization.
      // Restore the prior active runtime if this swap had already removed it.
      if (hadRuntime && await this.exists(this.encryptedPath)) {
        await this.removePlaintextPath(this.runtimePath);
        await this.envelope.open(this.encryptedPath, this.runtimePath);
        this.assertHealthy(this.runtimePath);
      }
      throw error;
    }
  }

  /**
   * Older builds could leave a plaintext rollback archive if power failed
   * between a restore rename and its cleanup. It is safe to retire such an
   * archive only when there is an active runtime, no pending restore candidate
   * and a freshly sealed current copy. Any other combination is ambiguous and
   * deliberately blocks startup without deleting forensic evidence.
   */
  public async reconcileLegacyRestoreArchives(): Promise<void> {
    const directory = path.dirname(this.runtimePath);
    const prefix = `${path.basename(this.runtimePath)}.before-restore-`;
    const archives = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
      .map((entry) => path.join(directory, entry.name));
    if (!archives.length) return;

    const hasPendingCandidate = await this.exists(this.stagedRestorePath)
      || await this.exists(this.encryptedStagedRestorePath);
    if (hasPendingCandidate || !(await this.exists(this.runtimePath))) {
      throw new Error('Ambiguous legacy restore artifacts found; recovery stopped without deleting any plaintext evidence.');
    }

    this.checkpointRuntime(this.runtimePath);
    this.assertHealthy(this.runtimePath);
    await this.envelope.seal(this.runtimePath, this.encryptedPath);
    await Promise.all(archives.map((archivePath) => this.removePlaintextPath(archivePath)));
  }

  /**
   * Deletes an encrypted restore candidate only after its plaintext sibling
   * has been consumed by the atomic restore swap. The check prevents an
   * unexpected filesystem race from turning an interrupted restore into data
   * loss.
   */
  public async finalizeStagedRestore(): Promise<void> {
    if (await this.exists(this.stagedRestorePath)) {
      throw new Error('Restore staging was not consumed; the encrypted candidate was retained.');
    }
    await rm(this.encryptedStagedRestorePath, { force: true });
  }

  public async sealRuntime(): Promise<SealedDatabaseReceipt | null> {
    if (!(await this.exists(this.runtimePath))) return null;
    this.checkpointRuntime(this.runtimePath);
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

  private checkpointRuntime(filePath: string): void {
    const database = new DatabaseSync(filePath, { allowExtension: false });
    try {
      database.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } finally {
      database.close();
    }
  }

  private async assertEquivalentStagedRestore(): Promise<void> {
    const verificationPath = `${this.stagedRestorePath}.verification`;
    await rm(verificationPath, { force: true });
    try {
      this.assertHealthy(this.stagedRestorePath);
      await this.restoreEnvelope.open(this.encryptedStagedRestorePath, verificationPath);
      this.assertHealthy(verificationPath);
      const [plaintext, encryptedProjection] = await Promise.all([
        readFile(this.stagedRestorePath),
        readFile(verificationPath),
      ]);
      if (!plaintext.equals(encryptedProjection)) {
        throw new Error('Restore staging copies differ; recovery stopped without discarding either candidate.');
      }
    } finally {
      await rm(verificationPath, { force: true });
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
