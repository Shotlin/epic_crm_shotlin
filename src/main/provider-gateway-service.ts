import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { CanonicalProviderStatus, ConfigureProviderCredentialsInput, ProviderConnector, ProviderSubmission } from '../shared/provider-contracts';
import type { BusinessDatabase, StoredProviderSecret } from './database';
import { ACTIVE_ARTIFACT_KEY_VERSION, assertSupportedArtifactKeyVersion, deriveArtifactKey } from './artifact-key';

interface ProviderCredentials {
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  bearerToken?: string;
  signingKey?: string;
}

/**
 * Credential envelopes are versioned independently from the OS keyring.  A
 * future rotation must explicitly migrate every stored secret before this
 * value changes; accepting an unknown version would risk decrypting an
 * artifact with the wrong derived key and silently widening the blast radius.
 */
export const ACTIVE_CREDENTIAL_KEY_VERSION = ACTIVE_ARTIFACT_KEY_VERSION;

export interface ProviderJsonResponse {
  statusCode: number;
  ok: boolean;
  bodyText: string;
  responseChecksum: string;
  responseByteLength: number;
  contentType?: string;
}

const digest = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const aad = (connectorId: string): Buffer => Buffer.from(`epic-bos\0provider-connector\0${connectorId}`, 'utf8');

/**
 * A deliberately narrow transport boundary. Provider-specific request signing and
 * submission packs belong outside this generic kernel; only an approved pack can
 * move a prepared handoff to an external system. This service holds secrets and
 * performs bounded status pulls without exposing either to the renderer.
 */
export class ProviderGatewayService {
  private readonly masterKey: Buffer;

  public constructor(private readonly database: BusinessDatabase, masterKey: Buffer, private readonly fetcher: typeof fetch = fetch) {
    if (masterKey.length !== 32) throw new Error('Provider vault requires a 256-bit master key.');
    this.masterKey = Buffer.from(masterKey);
  }

  public configureCredentials(input: ConfigureProviderCredentialsInput, actorId: string, now = new Date().toISOString()): string {
    const credentials: ProviderCredentials = Object.fromEntries(Object.entries({ clientId: input.clientId, clientSecret: input.clientSecret, apiKey: input.apiKey, bearerToken: input.bearerToken, signingKey: input.signingKey }).filter(([, value]) => typeof value === 'string' && value.trim()).map(([key, value]) => [key, value!.trim()]));
    if (!Object.keys(credentials).length) throw new Error('Provide at least one provider credential.');
    for (const value of Object.values(credentials)) if (value.length > 8192) throw new Error('A provider credential exceeds the 8192-character limit.');
    const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8');
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.keyForVersion(ACTIVE_CREDENTIAL_KEY_VERSION), iv); cipher.setAAD(aad(input.connectorId));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const record: StoredProviderSecret = { connectorId: input.connectorId, encryptedPayload: encrypted.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), keyVersion: ACTIVE_CREDENTIAL_KEY_VERSION, checksum: digest(plaintext), updatedBy: actorId, updatedAt: now };
    this.database.upsertProviderSecret(record);
    return record.checksum.slice(0, 16);
  }

  /** Returns only the integrity checksum for a vaulted connector; secret material never leaves this service. */
  public getCredentialChecksum(connectorId: string): string {
    const record = this.database.getProviderSecret(connectorId);
    if (!record) throw new Error('Encrypted provider credentials are missing.');
    return record.checksum;
  }

  /** Re-encrypts every provider secret with the active envelope key version. */
  public rewrapCredentialEnvelopes(actorId = 'system-key-rotation', targetVersion = ACTIVE_CREDENTIAL_KEY_VERSION, now = new Date().toISOString()): number {
    assertSupportedArtifactKeyVersion(targetVersion);
    let migrated = 0;
    for (const record of this.database.listProviderSecrets()) {
      if (record.keyVersion === targetVersion) continue;
      const credentials = this.decryptRecord(record);
      const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.keyForVersion(targetVersion), iv);
      cipher.setAAD(aad(record.connectorId));
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      this.database.upsertProviderSecret({
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

  /** Executes one bounded same-origin JSON request for a certified commerce adapter. */
  public async requestJson(
    connectorId: string,
    baseUrl: string,
    path: string,
    method: 'GET' | 'POST',
    body?: string,
    idempotencyKey?: string,
  ): Promise<ProviderJsonResponse> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('://') || path.includes('..')) throw new Error('Provider request path must be a relative HTTPS path without traversal.');
    const base = new URL(baseUrl);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Provider base URL must be a credential-free HTTPS origin.');
    const url = new URL(path, base);
    if (url.origin !== base.origin || url.protocol !== 'https:') throw new Error('Provider request path escaped its configured HTTPS origin.');
    const credentials = this.decrypt(connectorId);
    const headers = this.headers(credentials);
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await this.fetcher(url, { method, redirect: 'error', signal: AbortSignal.timeout(15000), headers, body: method === 'POST' ? body : undefined });
    const bodyText = await response.text();
    if (bodyText.length > 1024 * 1024) throw new Error('Provider response exceeded 1 MB.');
    return { statusCode: response.status, ok: response.ok, bodyText, responseChecksum: digest(bodyText), responseByteLength: Buffer.byteLength(bodyText, 'utf8'), contentType: response.headers.get('content-type') ?? undefined };
  }

  public async pullStatuses(connector: ProviderConnector, submissions: ProviderSubmission[]): Promise<CanonicalProviderStatus[]> {
    const pullCapability = connector.domain === 'banking' ? 'payment-status-pull' : connector.domain === 'payroll' ? 'payroll-status-pull' : 'statutory-status-pull';
    if (!connector.capabilities.includes(pullCapability)) throw new Error('Connector does not support status pull for its domain.');
    const credentials = this.decrypt(connector.id);
    const results: CanonicalProviderStatus[] = [];
    for (const submission of submissions) {
      try {
        const reference = submission.externalReference ?? submission.requestReference ?? submission.number;
        const path = connector.statusPathTemplate.replaceAll('{reference}', encodeURIComponent(reference));
        const url = new URL(path, connector.baseUrl);
        if (url.origin !== new URL(connector.baseUrl).origin || url.protocol !== 'https:') throw new Error('Provider status path escaped its configured HTTPS origin.');
        const response = await this.fetcher(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: this.headers(credentials) });
        const text = await response.text();
        if (text.length > 1024 * 1024) throw new Error('Provider response exceeded 1 MB.');
        if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
        const payload = JSON.parse(text) as Record<string, unknown>;
        const remoteStatus = String(payload.status ?? payload.remoteStatus ?? '').toLowerCase();
        if (!['pending', 'acknowledged', 'failed'].includes(remoteStatus)) throw new Error('Provider returned an unsupported canonical status.');
        results.push({ submissionId: submission.id, remoteStatus: remoteStatus as CanonicalProviderStatus['remoteStatus'], externalReference: this.optional(payload.externalReference) ?? this.optional(payload.reference), remotePayloadChecksum: this.optional(payload.payloadChecksum) ?? digest(text), errorMessage: this.optional(payload.errorMessage) });
      } catch (error) {
        results.push({ submissionId: submission.id, remoteStatus: 'error', errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) });
      }
    }
    return results;
  }

  private decrypt(connectorId: string): ProviderCredentials {
    const record = this.database.getProviderSecret(connectorId);
    if (!record) throw new Error('Encrypted provider credentials are missing.');
    return this.decryptRecord(record);
  }

  private decryptRecord(record: StoredProviderSecret): ProviderCredentials {
    try {
      assertSupportedArtifactKeyVersion(record.keyVersion);
    } catch {
      throw new Error(`Encrypted provider credentials use unsupported key version ${record.keyVersion}; rotate them before use.`);
    }
    const decipher = createDecipheriv('aes-256-gcm', this.keyForVersion(record.keyVersion), Buffer.from(record.iv, 'base64')); decipher.setAAD(aad(record.connectorId)); decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(record.encryptedPayload, 'base64')), decipher.final()]);
    if (digest(plaintext) !== record.checksum) throw new Error('Provider credential integrity verification failed.');
    return JSON.parse(plaintext.toString('utf8')) as ProviderCredentials;
  }

  private keyForVersion(version: number): Buffer {
    return deriveArtifactKey(this.masterKey, 'epic-bos/provider-connector-secrets', version);
  }

  private headers(credentials: ProviderCredentials): Headers {
    const headers = new Headers({ Accept: 'application/json' });
    if (credentials.clientId) headers.set('client-id', credentials.clientId);
    if (credentials.clientSecret) headers.set('client-secret', credentials.clientSecret);
    if (credentials.apiKey) headers.set('x-api-key', credentials.apiKey);
    if (credentials.bearerToken) headers.set('Authorization', `Bearer ${credentials.bearerToken}`);
    return headers;
  }

  private optional(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim().slice(0, 4000) : undefined; }
}
