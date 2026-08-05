import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  app,
  dialog,
  type BrowserWindow,
  type MessageBoxOptions,
} from 'electron';
import type { DatabaseBackupReceipt, RestoreDrillReceipt, RestoreReceipt } from '../shared/storage-contracts';
import type { BusinessDatabase } from './database';

export class BackupService {
  public constructor(
    private readonly database: BusinessDatabase,
    private readonly backupDirectory: string,
  ) {}

  public async createInteractive(parent: BrowserWindow | null): Promise<DatabaseBackupReceipt | null> {
    await mkdir(this.backupDirectory, { recursive: true });
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const options = {
      title: 'Create verified Epic BOS backup',
      defaultPath: path.join(this.backupDirectory, `Epic-BOS-${timestamp}.sqlite3`),
      filters: [{ name: 'Epic BOS database', extensions: ['sqlite3'] }],
      properties: ['createDirectory' as const, 'showOverwriteConfirmation' as const],
    };
    const choice = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
    if (choice.canceled || !choice.filePath) return null;
    await rm(choice.filePath, { force: true });
    await this.database.createOnlineBackup(choice.filePath);
    const receipt = await this.inspect(choice.filePath, now.toISOString());
    this.database.recordBackup(
      receipt.fileName,
      receipt.createdAt,
      receipt.sha256,
      receipt.size,
      receipt.verifiedAt,
    );
    return receipt;
  }

  public async restoreInteractive(parent: BrowserWindow | null): Promise<RestoreReceipt | null> {
    const options = {
      title: 'Restore Epic BOS database',
      filters: [{ name: 'Epic BOS database', extensions: ['sqlite3', 'db'] }],
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
    const safetyPath = path.join(this.backupDirectory, `pre-restore-${timestamp}.sqlite3`);
    await this.database.createOnlineBackup(safetyPath);
    await this.inspect(safetyPath, new Date().toISOString());
    const stagedPath = this.database.path + '.restore-next';
    await rm(stagedPath, { force: true });
    await copyFile(sourcePath, stagedPath);
    await this.inspect(stagedPath, new Date().toISOString());

    const receipt: RestoreReceipt = {
      fileName: inspected.fileName,
      safetyBackupFileName: path.basename(safetyPath),
      verifiedAt: inspected.verifiedAt,
      restartScheduled: true,
    };
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
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
    const sourcePath = path.join(drillDirectory, 'source.sqlite3');
    const restoredPath = path.join(drillDirectory, 'restored.sqlite3');
    const startedAt = new Date().toISOString();
    const id = randomUUID();
    try {
      await this.database.createOnlineBackup(sourcePath);
      const sourceBackup = await this.inspect(sourcePath, startedAt);
      await copyFile(sourcePath, restoredPath);
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

  private async inspect(filePath: string, createdAt: string): Promise<DatabaseBackupReceipt> {
    const database = new DatabaseSync(filePath, { readOnly: true, allowExtension: false });
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
    }
    const [contents, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
    return {
      fileName: path.basename(filePath),
      createdAt,
      sha256: createHash('sha256').update(contents).digest('hex'),
      size: fileStat.size,
      verifiedAt: new Date().toISOString(),
    };
  }
}
