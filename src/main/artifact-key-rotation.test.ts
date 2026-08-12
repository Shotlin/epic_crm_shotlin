import { createCipheriv, createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AttachmentVault } from './attachment-vault';
import { ArtifactKeyRotationService } from './artifact-key-rotation';
import { deriveArtifactKey } from './artifact-key';
import { AuthService } from './auth-service';
import { BusinessDatabase } from './database';
import { ProviderGatewayService } from './provider-gateway-service';
import { StatutoryGatewayService } from './statutory-gateway-service';

const masterKey = Buffer.alloc(32, 41);
const now = '2026-08-07T00:00:00.000Z';

function seal(namespace: string, id: string, value: unknown): { encryptedPayload: string; iv: string; authTag: string; checksum: string } {
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const iv = Buffer.alloc(12, 9);
  const cipher = createCipheriv('aes-256-gcm', deriveArtifactKey(masterKey, namespace, 1), iv);
  cipher.setAAD(Buffer.from(`epic-bos\0${namespace.includes('provider') ? 'provider-connector' : 'statutory-adapter'}\0${id}`, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { encryptedPayload: encrypted.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), checksum: createHash('sha256').update(plaintext).digest('hex') };
}

describe('artifact envelope rotation', () => {
  let directory: string;
  let database: BusinessDatabase;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'epic-bos-key-rotation-'));
    database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3'));
    await database.initialize();
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('rewraps legacy provider, statutory, MFA, and attachment records and verifies the cutover', async () => {
    const providerId = 'provider-legacy';
    const providerPlaintext = { bearerToken: 'legacy-provider-secret' };
    const providerEnvelope = seal('epic-bos/provider-connector-secrets', providerId, providerPlaintext);
    database.upsertProviderSecret({ connectorId: providerId, ...providerEnvelope, keyVersion: 1, updatedBy: 'legacy', updatedAt: now });

    const adapterId = 'adapter-legacy';
    const adapterPlaintext = { bearerToken: 'legacy-gsp-secret' };
    const adapterEnvelope = seal('epic-bos/statutory-adapter-secrets', adapterId, adapterPlaintext);
    database.upsertStatutoryAdapterSecret({ adapterId, ...adapterEnvelope, keyVersion: 1, updatedBy: 'legacy', updatedAt: now });

    const auth = new AuthService(database, masterKey);
    const owner = await auth.bootstrapOwner({ email: 'legacy@example.com', displayName: 'Legacy Owner', password: 'LegacyOwner!2026' });
    const mfaSecret = { secret: 'JBSWY3DPEHPK3PXP' };
    const mfaPlaintext = Buffer.from(mfaSecret.secret, 'utf8');
    const mfaIv = Buffer.alloc(12, 10);
    const mfaCipher = createCipheriv('aes-256-gcm', deriveArtifactKey(masterKey, 'epic-bos/mfa-secrets', 1), mfaIv);
    const mfaEncrypted = Buffer.concat([mfaCipher.update(mfaPlaintext), mfaCipher.final()]);
    database.upsertMfaFactor({ userId: owner.info.userId, encryptedSecret: mfaEncrypted.toString('base64'), iv: mfaIv.toString('base64'), authTag: mfaCipher.getAuthTag().toString('base64'), keyVersion: 1, enabled: true, recoveryCodeHashes: [], failedAttempts: 0, lockedUntil: null, createdAt: now, updatedAt: now });

    const sourcePath = path.join(directory, 'evidence.txt');
    await writeFile(sourcePath, 'legacy attachment evidence', 'utf8');
    const legacyVault = new AttachmentVault(database, path.join(directory, 'attachments'), masterKey, 1);
    const attachment = await legacyVault.addFromPath(sourcePath, 'kernel.audit', 'legacy-record', 'user-legacy');

    const provider = new ProviderGatewayService(database, masterKey);
    const statutory = new StatutoryGatewayService(database, masterKey);
    const rotation = new ArtifactKeyRotationService(database, provider, statutory, auth, legacyVault);
    const report = await rotation.rotate('security-admin', now);

    expect(report).toMatchObject({ targetVersion: 2, migrated: { providerCredentials: 1, statutoryCredentials: 1, mfaFactors: 1, attachments: 1 }, remainingLegacy: 0, verified: true });
    expect(database.getProviderSecret(providerId)?.keyVersion).toBe(2);
    expect(database.getStatutoryAdapterSecret(adapterId)?.keyVersion).toBe(2);
    expect(database.getMfaFactor(owner.info.userId)?.keyVersion).toBe(2);
    expect(database.getAttachment(attachment.id)?.keyVersion).toBe(2);
    expect(await legacyVault.exportToPath(attachment.id, path.join(directory, 'exported.txt'))).toBeUndefined();
  });
});
