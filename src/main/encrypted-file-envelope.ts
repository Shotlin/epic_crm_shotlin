import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import {
  ACTIVE_ARTIFACT_KEY_VERSION,
  assertSupportedArtifactKeyVersion,
  deriveArtifactKey,
  LEGACY_ARTIFACT_KEY_VERSION,
} from './artifact-key';

const MAGIC = Buffer.from('EPIC-BOS-ENCRYPTED-FILE\0', 'utf8');
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const AAD_BY_VERSION: Record<number, Buffer> = {
  [LEGACY_ARTIFACT_KEY_VERSION]: Buffer.from('epic-bos/encrypted-file/v1', 'utf8'),
  [ACTIVE_ARTIFACT_KEY_VERSION]: Buffer.from('epic-bos/encrypted-file/v2', 'utf8'),
};

function assertKey(key: Buffer): void {
  if (key.length !== 32) throw new Error('Encrypted file envelope requires a 256-bit key.');
}

function isMagic(contents: Buffer): boolean {
  return contents.subarray(0, MAGIC.length).equals(MAGIC);
}

/**
 * AES-256-GCM envelope for backup/export files. The key is derived from the
 * operating-system protected master key for v2 namespaces; v1 direct-key
 * envelopes remain readable for migration. Plaintext is only materialized in
 * a caller-owned temporary path while an SQLite inspection is in progress.
 */
export class EncryptedFileEnvelope {
  private readonly writeVersion: number;
  private readonly resolveKey: (version: number) => Buffer;

  public constructor(
    private readonly key: Buffer,
    options: {
      writeVersion?: number;
      resolveKey?: (version: number) => Buffer;
    } = {},
  ) {
    assertKey(key);
    this.writeVersion = options.writeVersion ?? LEGACY_ARTIFACT_KEY_VERSION;
    assertSupportedArtifactKeyVersion(this.writeVersion);
    this.resolveKey = options.resolveKey ?? (() => this.key);
  }

  /**
   * Creates an envelope which writes with a namespace-separated v2 key while
   * retaining a v1 direct-key reader for files from older builds. This is a
   * key-derivation migration, not OS master-key rotation or SQLCipher.
   */
  public static forArtifact(
    masterKey: Buffer,
    namespace: string,
    writeVersion = ACTIVE_ARTIFACT_KEY_VERSION,
  ): EncryptedFileEnvelope {
    const activeKey = deriveArtifactKey(masterKey, namespace, writeVersion);
    return new EncryptedFileEnvelope(activeKey, {
      writeVersion,
      resolveKey: (version) => version === LEGACY_ARTIFACT_KEY_VERSION
        ? masterKey
        : deriveArtifactKey(masterKey, namespace, version),
    });
  }

  public static isEncrypted(contents: Buffer): boolean {
    return isMagic(contents);
  }

  /** Returns 0 for plaintext, or the authenticated envelope format version. */
  public static getVersion(contents: Buffer): number {
    if (!isMagic(contents)) return 0;
    const version = contents[MAGIC.length];
    if (version === undefined) throw new Error('Encrypted file envelope version is unsupported.');
    try {
      assertSupportedArtifactKeyVersion(version);
    } catch {
      throw new Error('Encrypted file envelope version is unsupported.');
    }
    return version;
  }

  public async seal(sourcePath: string, targetPath: string): Promise<void> {
    const plaintext = await readFile(sourcePath);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(this.aad(this.writeVersion));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = Buffer.concat([
      MAGIC,
      Buffer.from([this.writeVersion]),
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]);
    await this.writeAtomic(targetPath, envelope);
  }

  public async open(sourcePath: string, targetPath: string): Promise<void> {
    const envelope = await readFile(sourcePath);
    if (!isMagic(envelope)) throw new Error('Encrypted file envelope header is missing.');
    const versionOffset = MAGIC.length;
    const version = envelope[versionOffset];
    if (version === undefined) throw new Error('Encrypted file envelope version is unsupported.');
    try {
      assertSupportedArtifactKeyVersion(version);
    } catch {
      throw new Error('Encrypted file envelope version is unsupported.');
    }
    const ivOffset = versionOffset + 1;
    const tagOffset = ivOffset + IV_BYTES;
    const ciphertextOffset = tagOffset + AUTH_TAG_BYTES;
    if (envelope.length <= ciphertextOffset) throw new Error('Encrypted file envelope is truncated.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.resolveKey(version),
      envelope.subarray(ivOffset, tagOffset),
    );
    decipher.setAAD(this.aad(version));
    decipher.setAuthTag(envelope.subarray(tagOffset, ciphertextOffset));
    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([
        decipher.update(envelope.subarray(ciphertextOffset)),
        decipher.final(),
      ]);
    } catch {
      throw new Error('Encrypted file envelope authentication failed.');
    }
    await this.writeAtomic(targetPath, plaintext);
  }

  private aad(version: number): Buffer {
    const aad = AAD_BY_VERSION[version];
    if (!aad) throw new Error('Encrypted file envelope version is unsupported.');
    return aad;
  }

  private async writeAtomic(targetPath: string, contents: Buffer): Promise<void> {
    const temporaryPath = `${targetPath}.next`;
    await rm(temporaryPath, { force: true });
    await writeFile(temporaryPath, contents, { flag: 'wx', mode: 0o600 });
    await rename(temporaryPath, targetPath);
    const targetStat = await stat(targetPath);
    if (targetStat.size !== contents.length) throw new Error('Encrypted file envelope write was truncated.');
  }
}
