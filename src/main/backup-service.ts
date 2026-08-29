import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  app,
  dialog,
  type BrowserWindow,
  type MessageBoxOptions,
} from 'electron';
import type { BackupInventoryEntry, BackupRewrapReceipt, DatabaseBackupReceipt, RestoreDrillReceipt, RestoreReceipt } from '../shared/storage-contracts';
import type { BusinessDatabase } from './database';
import { EncryptedFileEnvelope } from './encrypted-file-envelope';
import { ACTIVE_ARTIFACT_KEY_VERSION } from './artifact-key';

export class BackupService {
  public constructor(
    private readonly database: BusinessDatabase,
    private readonly backupDirectory: string,
    encryptionKey?: Buffer,
  ) {
    this.envelope = encryptionKey
      ? EncryptedFileEnvelope.forArtifact(encryptionKey, 'database-backup', ACTIVE_ARTIFACT_KEY_VERSION)
      : null;
  }

  private readonly envelope: EncryptedFileEnvelope | null;

  public async createInteractive(parent: BrowserWindow | null): Promise<DatabaseBackupReceipt | null> {
    await mkdir(this.backupDirectory, { recursive: true });
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const options = {
      title: 'Create verified Epic BOS backup',
      defaultPath: path.join(this.backupDirectory, `Epic-BOS-${timestamp}.${this.envelope ? 'epicbackup' : 'sqlite3'}`),
      filters: [{ name: 'Epic BOS database', extensions: this.envelope ? ['epicbackup', 'sqlite3', 'db'] : ['sqlite3', 'db'] }],
      properties: ['createDirectory' as const, 'showOverwriteConfirmation' as const],
    };
    const choice = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
    if (choice.canceled || !choice.filePath) return null;
    await rm(choice.filePath, { force: true });
    await this.createBackupFile(choice.filePath);
    const receipt = await this.inspect(choice.filePath, now.toISOString());
    this.database.recordBackup(
      receipt.fileName,
      receipt.createdAt,
      receipt.sha256,
      receipt.size,
      receipt.verifiedAt,
      receipt.keyVersion,
    );
    return receipt;
  }

  public async restoreInteractive(parent: BrowserWindow | null): Promise<RestoreReceipt | null> {
    const options = {
      title: 'Restore Epic BOS database',
      filters: [{ name: 'Epic BOS database', extensions: ['epicbackup', 'sqlite3', 'db'] }],
      properties: ['openFile' as const],
    };
    const choice = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (choice.canceled || !choice.filePaths[0]) return null;
    const sourcePath = choice.filePaths[0];
    const inspected = await this.inspect(sourcePath, new Date().toISOString());
    const confirmationOptions: MessageBoxOptions = {
      type: 'warning',
      title: 'Replace the active business database?',
      message: `Restore ${inspected.fileName}?`,
      detail: 'Epic BOS will create a pre-restore safety backup, verify the selected database, and restart.',
      buttons: ['Cancel', 'Restore and restart'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    const confirmation = parent
      ? await dialog.showMessageBox(parent, confirmationOptions)
      : await dialog.showMessageBox(confirmationOptions);
    if (confirmation.response !== 1) return null;

    await mkdir(this.backupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safetyPath = path.join(this.backupDirectory, `pre-restore-${timestamp}.${this.envelope ? 'epicbackup' : 'sqlite3'}`);
    await this.createBackupFile(safetyPath);
    await this.inspect(safetyPath, new Date().toISOString());
    const stagedPath = this.database.path + '.restore-next';
    const encryptedStagedPath = `${stagedPath}.enc`;
    await rm(stagedPath, { force: true });
    await rm(encryptedStagedPath, { force: true });

    if (this.envelope) {
      // Do not persist a plaintext restore candidate beside the active Store
      // Edge runtime. The candidate is only materialized during the immediate
      // startup swap by ProtectedDatabaseFile, after its envelope has been
      // authenticated.
      const stageDirectory = await mkdtemp(path.join(tmpdir(), 'epic-bos-restore-stage-'));
      const rawStagePath = path.join(stageDirectory, 'candidate.sqlite3');
      try {
        if (await this.isEncryptedPath(sourcePath)) {
          await this.envelope.open(sourcePath, rawStagePath);
        } else {
          await copyFile(sourcePath, rawStagePath);
        }
        // Re-inspect the exact bytes that will be sealed. This protects the
        // short interval after the operator selected the source file.
        await this.inspect(rawStagePath, new Date().toISOString());
        await this.envelope.seal(rawStagePath, encryptedStagedPath);
        await this.inspect(encryptedStagedPath, new Date().toISOString());
      } finally {
        await rm(stageDirectory, { recursive: true, force: true });
      }
    } else {
      // Compatibility only for an older unprotected runtime. The packaged
      // Electron main process always supplies the OS-protected key.
      if (await this.isEncryptedPath(sourcePath)) {
        throw new Error('The selected encrypted backup cannot be opened because the protected key vault is unavailable.');
      }
      await copyFile(sourcePath, stagedPath);
      await this.inspect(stagedPath, new Date().toISOString());
    }

    const receipt: RestoreReceipt = {
      fileName: inspected.fileName,
      safetyBackupFileName: path.basename(safetyPath),
      verifiedAt: inspected.verifiedAt,
      restartScheduled: true,
    };
    setTimeout(() => {
      app.relaunch();
      // Do not call app.exit() here: Electron bypasses before-quit for that
      // fast path, which would skip ProtectedDatabaseFile.sealRuntime and
      // leave the active SQLite runtime plaintext across the restart. The
      // main-process before-quit handler owns the authenticated seal and then
      // exits after it succeeds.
      app.quit();
    }, 300);
    return receipt;
  }

  /**
   * Runs a complete restore drill without touching the active workspace:
   * create an online backup, copy it to a second isolated database, and run
   * the same integrity/schema inspection used by interactive restore.
   */
  public async runRestoreDrill(): Promise<RestoreDrillReceipt> {
    const drillDirectory = await mkdtemp(path.join(tmpdir(), 'epic-bos-restore-drill-'));
    const sourceRawPath = path.join(drillDirectory, 'source.sqlite3');
    const sourcePath = path.join(drillDirectory, this.envelope ? 'source.epicbackup' : 'source.sqlite3');
    const restoredRawPath = path.join(drillDirectory, 'restored.sqlite3');
    const restoredPath = path.join(drillDirectory, this.envelope ? 'restored.epicbackup' : 'restored.sqlite3');
    const startedAt = new Date().toISOString();
    const id = randomUUID();
    try {
      await this.database.createOnlineBackup(sourceRawPath);
      if (this.envelope) await this.envelope.seal(sourceRawPath, sourcePath);
      const sourceBackup = await this.inspect(sourcePath, startedAt);
      if (this.envelope) {
        await this.envelope.open(sourcePath, restoredRawPath);
        await this.envelope.seal(restoredRawPath, restoredPath);
      } else {
        await copyFile(sourcePath, restoredPath);
      }
      const restoredCopy = await this.inspect(restoredPath, new Date().toISOString());
      return {
        id,
        startedAt,
        status: 'passed',
        isolated: true,
        sourceBackup,
        restoredCopy,
        verifiedAt: new Date().toISOString(),
        message: 'Isolated backup and restore verification passed; the active database was not changed.',
      };
    } catch (error) {
      return {
        id,
        startedAt,
        status: 'failed',
        isolated: true,
        verifiedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'The isolated restore drill failed.',
      };
    } finally {
      await rm(drillDirectory, { recursive: true, force: true });
    }
  }

  /**
   * Inventories the app-managed backup directory and migrates plaintext/v1
   * files to the active v2 envelope. Only files in this known local directory
   * are considered; backups saved elsewhere require a separate operator run.
   * Every replacement is authenticated before the old file is removed.
   */
  public async rewrapLocalBackups(): Promise<BackupRewrapReceipt> {
    const completedAt = new Date().toISOString();
    await mkdir(this.backupDirectory, { recursive: true });
    const candidates = (await readdir(this.backupDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && ['.epicbackup', '.sqlite3', '.db'].some((extension) => entry.name.toLowerCase().endsWith(extension)))
      .sort((left, right) => left.name.localeCompare(right.name));
    const entries: BackupInventoryEntry[] = [];

    for (const candidate of candidates) {
      const filePath = path.join(this.backupDirectory, candidate.name);
      try {
        const receipt = await this.inspect(filePath, completedAt);
        const status: BackupInventoryEntry['status'] = receipt.keyVersion === ACTIVE_ARTIFACT_KEY_VERSION
          ? 'active-v2'
          : receipt.keyVersion === 1
            ? 'legacy-v1'
            : 'plaintext';
        if (status !== 'active-v2' && this.envelope) {
          await this.rewrapFile(filePath);
          const verified = await this.inspect(filePath, new Date().toISOString());
          if (verified.keyVersion !== ACTIVE_ARTIFACT_KEY_VERSION) {
            throw new Error('Backup rewrap did not produce the active envelope version.');
          }
          this.database.recordBackup(
            verified.fileName,
            verified.createdAt,
            verified.sha256,
            verified.size,
            verified.verifiedAt,
            verified.keyVersion,
          );
          entries.push({
            fileName: candidate.name,
            status: 'active-v2',
            keyVersion: verified.keyVersion,
            sha256: verified.sha256,
            size: verified.size,
            message: `Migrated from ${status === 'legacy-v1' ? 'v1' : 'plaintext'} and verified.`,
          });
        } else {
          entries.push({
            fileName: candidate.name,
            status,
            keyVersion: receipt.keyVersion,
            sha256: receipt.sha256,
            size: receipt.size,
            ...(status !== 'active-v2' ? { message: 'Protected key vault unavailable; migration was not attempted.' } : {}),
          });
        }
      } catch (error) {
        entries.push({
          fileName: candidate.name,
          status: 'invalid',
          keyVersion: -1,
          message: error instanceof Error ? error.message : 'Backup inspection failed.',
        });
      }
    }

    const remainingLegacy = entries.filter(({ status }) => status === 'legacy-v1' || status === 'plaintext').length;
    const invalid = entries.filter(({ status }) => status === 'invalid').length;
    return {
      scanned: entries.length,
      migrated: entries.filter(({ message }) => message?.startsWith('Migrated from')).length,
      remainingLegacy,
      invalid,
      verified: invalid === 0 && remainingLegacy === 0,
      entries,
      completedAt,
    };
  }

  private async inspect(filePath: string, createdAt: string): Promise<DatabaseBackupReceipt> {
    const contents = await readFile(filePath);
    const keyVersion = EncryptedFileEnvelope.getVersion(contents);
    const encrypted = keyVersion > 0;
    if (encrypted && !this.envelope) throw new Error('The encrypted backup key is unavailable.');
    const temporaryDirectory = encrypted ? await mkdtemp(path.join(tmpdir(), 'epic-bos-backup-inspect-')) : null;
    const inspectionPath = temporaryDirectory ? path.join(temporaryDirectory, 'database.sqlite3') : filePath;
    if (encrypted) {
      await this.envelope!.open(filePath, inspectionPath);
    }
    const database = new DatabaseSync(inspectionPath, { readOnly: true, allowExtension: false });
    try {
      const integrity = database.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      if (integrity.integrity_check !== 'ok') throw new Error('Database integrity check failed.');
      const tables = database.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name IN ('schema_migrations', 'state_documents', 'credentials')
      `).all() as Array<{ name: string }>;
      if (tables.length !== 3) throw new Error('The selected file is not a complete Epic BOS database.');
    } finally {
      database.close();
      if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    }
    const fileStat = await stat(filePath);
    return {
      fileName: path.basename(filePath),
      createdAt,
      sha256: createHash('sha256').update(contents).digest('hex'),
      size: fileStat.size,
      verifiedAt: new Date().toISOString(),
      keyVersion,
    };
  }

  private async rewrapFile(filePath: string): Promise<void> {
    if (!this.envelope) throw new Error('The protected key vault is unavailable.');
    const workingDirectory = await mkdtemp(path.join(tmpdir(), 'epic-bos-backup-rewrap-'));
    const rawPath = path.join(workingDirectory, 'database.sqlite3');
    const nextPath = `${filePath}.v2-next`;
    const previousPath = `${filePath}.pre-v2`;
    try {
      await rm(nextPath, { force: true });
      await rm(previousPath, { force: true });
      const source = await readFile(filePath);
      if (EncryptedFileEnvelope.isEncrypted(source)) {
        await this.envelope.open(filePath, rawPath);
      } else {
        await copyFile(filePath, rawPath);
      }
      await this.envelope.seal(rawPath, nextPath);
      await rename(filePath, previousPath);
      try {
        await rename(nextPath, filePath);
      } catch (error) {
        await rename(previousPath, filePath);
        throw error;
      }
      await rm(previousPath, { force: true });
    } finally {
      await rm(nextPath, { force: true });
      await rm(previousPath, { force: true });
      await rm(workingDirectory, { recursive: true, force: true });
    }
  }

  private async createBackupFile(targetPath: string): Promise<void> {
    const workingDirectory = await mkdtemp(path.join(tmpdir(), 'epic-bos-backup-create-'));
    const rawPath = path.join(workingDirectory, 'database.sqlite3');
    try {
      await this.database.createOnlineBackup(rawPath);
      if (this.envelope) {
        await this.envelope.seal(rawPath, targetPath);
      } else {
        await copyFile(rawPath, targetPath);
      }
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  }

  private async isEncryptedPath(filePath: string): Promise<boolean> {
    return EncryptedFileEnvelope.isEncrypted(await readFile(filePath));
  }
}
