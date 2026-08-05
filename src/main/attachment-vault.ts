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
import type { BusinessDatabase, StoredAttachment } from './database';

const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;

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
  ) {
    if (key.length !== 32) throw new Error('Attachment vault requires a 256-bit key.');
  }

  public list(resource: string, resourceId: string): AttachmentMetadata[] {
    return this.database.listAttachments(resource, resourceId).map(this.toMetadata);
  }

  public get(id: string): AttachmentMetadata | null {
    const record = this.database.getAttachment(id);
    return record ? this.toMetadata(record) : null;
  }

  public async addFromPath(
    sourcePath: string,
    resource: string,
    resourceId: string,
    actorId: string,
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
      fileName: path.basename(sourcePath),
      mimeType: MIME_TYPES[path.extname(sourcePath).toLowerCase()] ?? 'application/octet-stream',
      size: plaintext.length,
      sha256: createHash('sha256').update(plaintext).digest('hex'),
      storageKey,
      encryptedPath,
      iv: iv.toString('base64'),
      authTag: '',
      keyVersion: 1,
      createdBy: actorId,
      createdAt: new Date().toISOString(),
    };
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
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

  public async exportToPath(id: string, targetPath: string): Promise<void> {
    const record = this.database.getAttachment(id);
    if (!record) throw new Error('Attachment not found.');
    const ciphertext = await readFile(record.encryptedPath);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
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
