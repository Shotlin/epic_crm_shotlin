import { createCipheriv, createDecipheriv, createHash, createVerify, randomBytes, X509Certificate } from 'node:crypto';
import type { StatutoryExchange } from '../shared/revenue-ops-contracts';
import type { CanonicalPortalStatus, ConfigureStatutoryCredentialsInput, StatutoryAdapter, VerifyStatutorySignatureInput } from '../shared/statutory-contracts';
import type { VerifiedSignatureResult } from '../domain/statutory-control';
import type { BusinessDatabase, StoredAdapterSecret } from './database';
import { ACTIVE_ARTIFACT_KEY_VERSION, assertSupportedArtifactKeyVersion, deriveArtifactKey } from './artifact-key';

interface AdapterCredentials {
  clientId?: string; clientSecret?: string; username?: string; password?: string; apiKey?: string; bearerToken?: string;
}

/** See the provider vault: unknown envelope versions are never downgraded. */
export const ACTIVE_CREDENTIAL_KEY_VERSION = ACTIVE_ARTIFACT_KEY_VERSION;

function digest(value: Buffer | string): string { return createHash('sha256').update(value).digest('hex'); }
function aad(adapterId: string): Buffer { return Buffer.from(`epic-bos\0statutory-adapter\0${adapterId}`, 'utf8'); }

export class StatutoryGatewayService {
  private readonly masterKey: Buffer;

  public constructor(private readonly database: BusinessDatabase, masterKey: Buffer, private readonly fetcher: typeof fetch = fetch) {
    if (masterKey.length !== 32) throw new Error('Statutory vault requires a 256-bit master key.');
    this.masterKey = Buffer.from(masterKey);
  }

  public configureCredentials(input: ConfigureStatutoryCredentialsInput, actorId: string, now = new Date().toISOString()): string {
    const credentials: AdapterCredentials = Object.fromEntries(Object.entries({ clientId: input.clientId, clientSecret: input.clientSecret, username: input.username, password: input.password, apiKey: input.apiKey, bearerToken: input.bearerToken }).filter(([, value]) => typeof value === 'string' && value.trim()).map(([key, value]) => [key, value!.trim()]));
    if (!Object.keys(credentials).length) throw new Error('Provide at least one adapter credential.');
    for (const value of Object.values(credentials)) if (value.length > 4096) throw new Error('A credential value exceeds the 4096-character limit.');
    const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8');
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.keyForVersion(ACTIVE_CREDENTIAL_KEY_VERSION), iv); cipher.setAAD(aad(input.adapterId));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const record: StoredAdapterSecret = { adapterId: input.adapterId, encryptedPayload: encrypted.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), keyVersion: ACTIVE_CREDENTIAL_KEY_VERSION, checksum: digest(plaintext), updatedBy: actorId, updatedAt: now };
    this.database.upsertStatutoryAdapterSecret(record);
    return record.checksum.slice(0, 16);
  }

  public hasCredentials(adapterId: string): boolean { return this.database.getStatutoryAdapterSecret(adapterId) !== null; }

  /** Re-encrypts every statutory adapter secret with the active envelope key version. */
  public rewrapCredentialEnvelopes(actorId = 'system-key-rotation', targetVersion = ACTIVE_CREDENTIAL_KEY_VERSION, now = new Date().toISOString()): number {
    assertSupportedArtifactKeyVersion(targetVersion);
    let migrated = 0;
    for (const record of this.database.listStatutoryAdapterSecrets()) {
      if (record.keyVersion === targetVersion) continue;
      const credentials = this.decryptRecord(record);
      const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.keyForVersion(targetVersion), iv);
      cipher.setAAD(aad(record.adapterId));
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      this.database.upsertStatutoryAdapterSecret({
        ...record,
        encryptedPayload: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        keyVersion: targetVersion,
        checksum: digest(plaintext),
        updatedBy: actorId,
        updatedAt: now,
      });
      migrated += 1;
    }
    return migrated;
  }

  public async pullStatuses(adapter: StatutoryAdapter, exchanges: StatutoryExchange[]): Promise<CanonicalPortalStatus[]> {
    if (!adapter.capabilities.includes('status-pull')) throw new Error('Adapter does not support status pull.');
    const credentials = this.decrypt(adapter.id);
    const results: CanonicalPortalStatus[] = [];
    for (const exchange of exchanges) {
      try {
        const number = exchange.externalNumber ?? exchange.sourceNumber;
        const path = adapter.statusPathTemplate.replaceAll('{kind}', encodeURIComponent(exchange.kind)).replaceAll('{number}', encodeURIComponent(number));
        const url = new URL(path, adapter.baseUrl);
        if (url.origin !== new URL(adapter.baseUrl).origin || url.protocol !== 'https:') throw new Error('Adapter status path escaped its configured HTTPS origin.');
        const response = await this.fetcher(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: this.headers(credentials) });
        const text = await response.text();
        if (text.length > 1024 * 1024) throw new Error('Adapter response exceeded 1 MB.');
        if (!response.ok) throw new Error(`Adapter returned HTTP ${response.status}.`);
        const payload = JSON.parse(text) as Record<string, unknown>;
        const remoteStatus = String(payload.status ?? payload.remoteStatus ?? '').toLowerCase();
        if (!['active', 'cancelled', 'closed', 'not-found'].includes(remoteStatus)) throw new Error('Adapter returned an unsupported canonical status.');
        results.push({ exchangeId: exchange.id, remoteStatus: remoteStatus as CanonicalPortalStatus['remoteStatus'], externalNumber: this.optional(payload.externalNumber), acknowledgementNumber: this.optional(payload.acknowledgementNumber), acknowledgedAt: this.iso(payload.acknowledgedAt), validUntil: this.iso(payload.validUntil), remotePayloadChecksum: this.optional(payload.payloadChecksum) ?? digest(text) });
      } catch (error) {
        results.push({ exchangeId: exchange.id, remoteStatus: 'error', errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) });
      }
    }
    return results;
  }

  public verifySignature(input: VerifyStatutorySignatureInput): VerifiedSignatureResult {
    const payload = Buffer.from(input.payloadBase64, 'base64'); const signature = Buffer.from(input.signatureBase64, 'base64');
    if (!payload.length || payload.length > 5 * 1024 * 1024) throw new Error('Signed payload must contain 1 byte to 5 MB.');
    if (!signature.length || signature.length > 16384) throw new Error('Signature is empty or too large.');
    if (input.certificatePem.length > 32768) throw new Error('Certificate exceeds 32 KB.');
    const certificate = new X509Certificate(input.certificatePem);
    const algorithm = input.algorithm === 'RSA-SHA512' ? 'RSA-SHA512' : input.algorithm === 'ECDSA-SHA256' ? 'SHA256' : 'RSA-SHA256';
    const verifier = createVerify(algorithm); verifier.update(payload); verifier.end();
    const verified = verifier.verify(certificate.publicKey, signature);
    return { exchangeId: input.exchangeId, adapterId: input.adapterId, artifact: input.artifact, algorithm: input.algorithm, certificateFingerprint: certificate.fingerprint256.replaceAll(':', '').toLowerCase(), certificateSubject: certificate.subject.slice(0, 500), certificateIssuer: certificate.issuer.slice(0, 500), certificateValidFrom: new Date(certificate.validFrom).toISOString(), certificateValidTo: new Date(certificate.validTo).toISOString(), payloadChecksum: digest(payload), signatureChecksum: digest(signature), verified, verificationSource: 'local-certificate' };
  }

  private decrypt(adapterId: string): AdapterCredentials {
    const record = this.database.getStatutoryAdapterSecret(adapterId);
    if (!record) throw new Error('Encrypted adapter credentials are missing.');
    return this.decryptRecord(record);
  }

  private decryptRecord(record: StoredAdapterSecret): AdapterCredentials {
    try {
      assertSupportedArtifactKeyVersion(record.keyVersion);
    } catch {
      throw new Error(`Encrypted adapter credentials use unsupported key version ${record.keyVersion}; rotate them before use.`);
    }
    const decipher = createDecipheriv('aes-256-gcm', this.keyForVersion(record.keyVersion), Buffer.from(record.iv, 'base64')); decipher.setAAD(aad(record.adapterId)); decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(record.encryptedPayload, 'base64')), decipher.final()]);
    if (digest(plaintext) !== record.checksum) throw new Error('Adapter credential integrity verification failed.');
    return JSON.parse(plaintext.toString('utf8')) as AdapterCredentials;
  }

  private keyForVersion(version: number): Buffer {
    return deriveArtifactKey(this.masterKey, 'epic-bos/statutory-adapter-secrets', version);
  }

  private headers(credentials: AdapterCredentials): Headers {
    const headers = new Headers({ Accept: 'application/json' });
    if (credentials.clientId) headers.set('client-id', credentials.clientId);
    if (credentials.clientSecret) headers.set('client-secret', credentials.clientSecret);
    if (credentials.username) headers.set('x-api-username', credentials.username);
    if (credentials.password) headers.set('x-api-password', credentials.password);
    if (credentials.apiKey) headers.set('x-api-key', credentials.apiKey);
    if (credentials.bearerToken) headers.set('Authorization', `Bearer ${credentials.bearerToken}`);
    return headers;
  }

  private optional(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim().slice(0, 4000) : undefined; }
  private iso(value: unknown): string | undefined { const candidate = this.optional(value); return candidate && Number.isFinite(Date.parse(candidate)) ? new Date(candidate).toISOString() : undefined; }
}
