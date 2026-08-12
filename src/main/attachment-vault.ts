import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AttachmentMetadata } from '../shared/kernel-contracts';
import type { OperatingRecordScope } from '../shared/revenue-ops-contracts';
import type { BusinessDatabase, StoredAttachment } from './database';
import { ACTIVE_ARTIFACT_KEY_VERSION, assertSupportedArtifactKeyVersion, deriveArtifactKey } from './artifact-key';

const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;
type AttachmentScope = Pick<OperatingRecordScope, 'companyId' | 'branchId'>;
export const ACTIVE_ATTACHMENT_KEY_VERSION = ACTIVE_ARTIFACT_KEY_VERSION;

const MIME_TYPES: Record<string, string> = {
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function associatedData(record: Pick<StoredAttachment, 'id' | 'resource' | 'resourceId' | 'fileName'>): Buffer {
  return Buffer.from(`${record.id}\0${record.resource}\0${record.resourceId}\0${record.fileName}`, 'utf8');
}

export class AttachmentVault {
  public constructor(
    private readonly database: BusinessDatabase,
    private readonly vaultDirectory: string,
    private readonly key: Buffer,
    private readonly keyVersion = 1,
  ) {
    if (key.length !== 32) throw new Error('Attachment vault requires a 256-bit key.');
    assertSupportedArtifactKeyVersion(keyVersion);
  }

  public list(resource: string, resourceId: string, scope?: AttachmentScope): AttachmentMetadata[] {
    return this.database.listAttachments(resource, resourceId, scope).map(this.toMetadata);
  }

  public get(id: string, scope?: AttachmentScope): AttachmentMetadata | null {
    const record = this.database.getAttachment(id, scope);
    return record ? this.toMetadata(record) : null;
  }

  public async addFromPath(
    sourcePath: string,
    resource: string,
    resourceId: string,
    actorId: string,
    scope?: AttachmentScope,
  ): Promise<AttachmentMetadata> {
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile()) throw new Error('Select a regular file.');
    if (sourceStat.size <= 0) throw new Error('Empty files cannot be attached.');
    if (sourceStat.size > MAX_ATTACHMENT_SIZE) throw new Error('Attachments cannot exceed 50 MB.');
    const normalizedResource = resource.trim().toLowerCase();
    const normalizedResourceId = resourceId.trim();
    if (!/^[a-z][a-z0-9.-]{2,119}$/.test(normalizedResource) || !normalizedResourceId) {
      throw new Error('Attachment resource and record are required.');
    }

    const plaintext = await readFile(sourcePath);
    const id = randomUUID();
    const storageKey = randomUUID();
    const encryptedPath = path.join(this.vaultDirectory, storageKey + '.epicvault');
    const temporaryPath = encryptedPath + '.next';
    const iv = randomBytes(12);
    const record: StoredAttachment = {
      id,
      resource: normalizedResource,
      resourceId: normalizedResourceId,
      companyId: scope?.companyId ?? null,
      branchId: scope?.branchId ?? null,
      fileName: path.basename(sourcePath),
      mimeType: MIME_TYPES[path.extname(sourcePath).toLowerCase()] ?? 'application/octet-stream',
      size: plaintext.length,
      sha256: createHash('sha256').update(plaintext).digest('hex'),
      storageKey,
      encryptedPath,
      iv: iv.toString('base64'),
      authTag: '',
      keyVersion: this.keyVersion,
      createdBy: actorId,
      createdAt: new Date().toISOString(),
    };
    const cipher = createCipheriv('aes-256-gcm', this.keyForVersion(record.keyVersion), iv);
    cipher.setAAD(associatedData(record));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    record.authTag = cipher.getAuthTag().toString('base64');
    await mkdir(this.vaultDirectory, { recursive: true });
    await writeFile(temporaryPath, ciphertext, { flag: 'wx', mode: 0o600 });
    await rename(temporaryPath, encryptedPath);
    try {
      this.database.insertAttachment(record);
    } catch (error) {
      await rm(encryptedPath, { force: true });
      throw error;
    }
    return this.toMetadata(record);
  }

  public async exportToPath(id: string, targetPath: string, scope?: AttachmentScope): Promise<void> {
    const record = this.database.getAttachment(id, scope);
    if (!record) throw new Error('Attachment not found.');
    assertSupportedArtifactKeyVersion(record.keyVersion);
    const ciphertext = await readFile(record.encryptedPath);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.keyForVersion(record.keyVersion),
      Buffer.from(record.iv, 'base64'),
    );
    decipher.setAAD(associatedData(record));
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const checksum = createHash('sha256').update(plaintext).digest('hex');
    if (checksum !== record.sha256 || plaintext.length !== record.size) {
      throw new Error('Attachment integrity verification failed.');
    }
    const temporaryPath = targetPath + '.epic-next';
    await writeFile(temporaryPath, plaintext, { flag: 'wx' });
    await rename(temporaryPath, targetPath);
  }

  /**
   * Re-encrypts attachment files one at a time.  Each file is verified before
   * and after the write; the database pointer is updated only after the new
   * ciphertext has been atomically installed.
   */
  public async rewrapEnvelopes(targetVersion = this.keyVersion): Promise<number> {
    assertSupportedArtifactKeyVersion(targetVersion);
    let migrated = 0;
    for (const record of this.database.listAllAttachments()) {
      if (record.keyVersion === targetVersion) continue;
      const plaintext = await this.decryptAndVerify(record);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.keyForVersion(targetVersion), iv);
      cipher.setAAD(associatedData(record));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const temporaryPath = record.encryptedPath + '.rotation-next';
      await writeFile(temporaryPath, ciphertext, { flag: 'wx', mode: 0o600 });
      const rotatedPath = record.encryptedPath + '.rotation';
      const previousPath = record.encryptedPath + '.rotation-old';
      try {
        await rm(rotatedPath, { force: true });
        await rm(previousPath, { force: true });
        await rename(temporaryPath, rotatedPath);
        const verified = await this.decryptBytes(rotatedPath, { ...record, iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), keyVersion: targetVersion });
        if (createHash('sha256').update(verified).digest('hex') !== record.sha256 || verified.length !== record.size) {
          throw new Error('Rotated attachment integrity verification failed.');
        }
        await rename(record.encryptedPath, previousPath);
        await rename(rotatedPath, record.encryptedPath);
        await rm(previousPath, { force: true });
        this.database.updateAttachmentEncryption(record.id, record.encryptedPath, iv.toString('base64'), cipher.getAuthTag().toString('base64'), targetVersion);
        migrated += 1;
      } catch (error) {
        await rm(temporaryPath, { force: true });
        await rm(rotatedPath, { force: true });
        if (!(await stat(record.encryptedPath).catch(() => null))) {
          await rename(previousPath, record.encryptedPath).catch(() => undefined);
        }
        throw error;
      }
    }
    return migrated;
  }

  private async decryptAndVerify(record: StoredAttachment): Promise<Buffer> {
    const plaintext = await this.decryptBytes(record.encryptedPath, record);
    const checksum = createHash('sha256').update(plaintext).digest('hex');
    if (checksum !== record.sha256 || plaintext.length !== record.size) throw new Error('Attachment integrity verification failed.');
    return plaintext;
  }

  private async decryptBytes(filePath: string, record: StoredAttachment): Promise<Buffer> {
    assertSupportedArtifactKeyVersion(record.keyVersion);
    const ciphertext = await readFile(filePath);
    const decipher = createDecipheriv('aes-256-gcm', this.keyForVersion(record.keyVersion), Buffer.from(record.iv, 'base64'));
    decipher.setAAD(associatedData(record));
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  private keyForVersion(version: number): Buffer {
    assertSupportedArtifactKeyVersion(version);
    return version === 1 ? this.key : deriveArtifactKey(this.key, 'epic-bos/attachment-vault', version);
  }

  private toMetadata(record: StoredAttachment): AttachmentMetadata {
    return {
      id: record.id,
      resource: record.resource,
      resourceId: record.resourceId,
      fileName: record.fileName,
      mimeType: record.mimeType,
      size: record.size,
      sha256: record.sha256,
      storageKey: record.storageKey,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
    };
  }
}
