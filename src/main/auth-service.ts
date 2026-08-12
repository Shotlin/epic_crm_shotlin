import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import type {
  AuthStatus,
  BootstrapOwnerInput,
  ChangePasswordInput,
  LoginInput,
  MfaEnrollment,
  MfaStatus,
  SessionInfo,
} from '../shared/auth-contracts';
import { PRIMARY_WORKSPACE_ID } from '../shared/workspace-identity';
import type {
  BusinessDatabase,
  CredentialRecord,
  SessionRecord,
  StoredMfaFactor,
} from './database';
import { ACTIVE_ARTIFACT_KEY_VERSION, assertSupportedArtifactKeyVersion, deriveArtifactKey } from './artifact-key';

const PASSWORD_BYTES = 32;
const SESSION_HOURS = 8;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const MFA_KEY_VERSION = ACTIVE_ARTIFACT_KEY_VERSION;
const MFA_DIGITS = 6;
const MFA_PERIOD_SECONDS = 30;
const MFA_RECOVERY_CODE_COUNT = 8;
interface ScryptOptions {
  N: number;
  r: number;
  p: number;
  maxmem: number;
}

const SCRYPT_PARAMETERS: Readonly<ScryptOptions> = Object.freeze({
  N: 32_768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});

function deriveKey(
  password: string,
  salt: Buffer,
  length: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export interface AuthenticatedSession {
  token: string;
  info: SessionInfo;
}

/**
 * First-run enrollment is prepared before it is persisted so the workspace
 * provisioner can commit the owner credential, active session, and all
 * business state in one database transaction. The raw session token stays in
 * memory and is never stored in this shape.
 */
export interface PreparedOwnerBootstrap {
  credential: CredentialRecord;
  session: SessionRecord;
  authenticated: AuthenticatedSession;
}

export class MfaRequiredError extends Error {
  public readonly code = 'MFA_REQUIRED';

  public constructor(message = 'Multi-factor authentication code required.') {
    super(message);
    this.name = 'MfaRequiredError';
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function assertStrongPassword(password: string): void {
  if (password.length < 12 || password.length > 256) {
    throw new Error('Password must contain between 12 and 256 characters.');
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    throw new Error('Password must contain upper- and lower-case letters.');
  }
  if (!/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('Password must contain a number and a symbol.');
  }
}

function base32Encode(value: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let buffer = 0;
  let bits = 0;
  let output = '';
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function base32Decode(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = value.replace(/=+$/u, '').replace(/\s+/gu, '').toUpperCase();
  let buffer = 0;
  let bits = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('The MFA secret is not valid base32.');
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function safeEqualText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createTotpCode(secret: string, atMs = Date.now()): string {
  const counter = Math.max(0, Math.floor(atMs / 1000 / MFA_PERIOD_SECONDS));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const byte0 = digest[offset] ?? 0;
  const byte1 = digest[offset + 1] ?? 0;
  const byte2 = digest[offset + 2] ?? 0;
  const byte3 = digest[offset + 3] ?? 0;
  const binary =
    ((byte0 & 0x7f) << 24) |
    ((byte1 & 0xff) << 16) |
    ((byte2 & 0xff) << 8) |
    (byte3 & 0xff);
  return String(binary % 10 ** MFA_DIGITS).padStart(MFA_DIGITS, '0');
}

function encryptMfaSecret(secret: string, key: Buffer): Pick<StoredMfaFactor, 'encryptedSecret' | 'iv' | 'authTag'> {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return {
    encryptedSecret: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptMfaSecret(record: StoredMfaFactor, key: Buffer): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(record.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.encryptedSecret, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function normalizeMfaCode(code: string): string {
  return code.trim().replace(/[\s-]/gu, '').toUpperCase();
}

export class AuthService {
  private readonly masterKey: Buffer | null;

  public constructor(
    private readonly database: BusinessDatabase,
    masterKey?: Buffer,
  ) {
    this.masterKey = masterKey && masterKey.length === 32
      ? Buffer.from(masterKey)
      : null;
  }

  public getStatus(token?: string): AuthStatus {
    const starterMode = this.database.findWorkspaceBootstrapGuard(
      PRIMARY_WORKSPACE_ID,
    )?.starterMode;
    const session = token ? this.resolveSession(token) : null;
    const status: AuthStatus = {
      configured: this.database.countCredentials() > 0,
      session,
    };
    if (session) status.mfaEnabled = Boolean(this.database.getMfaFactor(session.userId)?.enabled);
    if (starterMode) status.workspaceStarterMode = starterMode;
    return status;
  }

  public async bootstrapOwner(
    input: BootstrapOwnerInput,
  ): Promise<AuthenticatedSession> {
    const prepared = await this.prepareBootstrapOwner(input);
    this.database.upsertCredential(prepared.credential);
    this.database.insertSession(prepared.session);
    return prepared.authenticated;
  }

  /**
   * Create, but do not persist, the first owner identity. This is the only
   * safe hand-off point for fresh-workspace provisioning: callers can either
   * atomically commit the complete manifest or leave no credential/session
   * behind at all.
   */
  public async prepareBootstrapOwner(
    input: BootstrapOwnerInput,
    now = new Date().toISOString(),
  ): Promise<PreparedOwnerBootstrap> {
    if (this.database.countCredentials() > 0) {
      throw new Error('Owner enrollment has already been completed.');
    }
    assertStrongPassword(input.password);
    const credential = await this.createCredential(
      'user-avery',
      input.email,
      input.displayName,
      input.password,
      false,
      now,
    );
    const issued = this.issueSession(credential, now);
    return {
      credential,
      session: issued.record,
      authenticated: issued.authenticated,
    };
  }

  public async login(input: LoginInput): Promise<AuthenticatedSession> {
    const credential = this.database.getCredentialByEmail(input.email);
    if (!credential) {
      await this.burnEquivalentWork(input.password);
      throw new Error('The email or password is incorrect.');
    }

    const now = new Date();
    if (
      credential.lockedUntil &&
      new Date(credential.lockedUntil).getTime() > now.getTime()
    ) {
      throw new Error(
        `This account is locked until ${new Date(credential.lockedUntil).toLocaleTimeString()}.`,
      );
    }

    const matches = await this.verifyPassword(input.password, credential);
    if (!matches) {
      const failures = credential.failedAttempts + 1;
      const lockedUntil =
        failures >= MAX_FAILURES
          ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString()
          : null;
      this.database.recordAuthenticationFailure(
        credential.userId,
        failures,
        lockedUntil,
        now.toISOString(),
      );
      throw new Error(
        lockedUntil
          ? `Too many failed attempts. This account is locked for ${LOCK_MINUTES} minutes.`
          : 'The email or password is incorrect.',
      );
    }

    const factor = this.database.getMfaFactor(credential.userId);
    if (factor?.enabled) {
      const factorNow = now.toISOString();
      if (factor.lockedUntil && new Date(factor.lockedUntil).getTime() > now.getTime()) {
        throw new Error(`Multi-factor authentication is locked until ${new Date(factor.lockedUntil).toLocaleTimeString()}.`);
      }
      const code = input.mfaCode ? normalizeMfaCode(input.mfaCode) : '';
      if (!code) throw new MfaRequiredError();
      const secret = this.decryptFactorSecret(factor);
      const validTotp = /^\d{6}$/u.test(code) && [-1, 0, 1].some((offset) =>
        safeEqualText(createTotpCode(secret, now.getTime() + offset * MFA_PERIOD_SECONDS * 1000), code));
      let recoveryIndex = -1;
      if (!validTotp) {
        const candidateHash = hashRecoveryCode(code);
        recoveryIndex = factor.recoveryCodeHashes.findIndex((hash) => safeEqualText(hash, candidateHash));
      }
      if (!validTotp && recoveryIndex < 0) {
        const failures = factor.failedAttempts + 1;
        const lockedUntil = failures >= MAX_FAILURES
          ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString()
          : null;
        this.database.upsertMfaFactor({ ...factor, failedAttempts: failures, lockedUntil, updatedAt: factorNow });
        throw new Error(lockedUntil
          ? `Too many invalid MFA attempts. Multi-factor authentication is locked for ${LOCK_MINUTES} minutes.`
          : 'The multi-factor authentication code is incorrect.');
      }
      this.database.upsertMfaFactor({
        ...factor,
        recoveryCodeHashes: recoveryIndex >= 0
          ? factor.recoveryCodeHashes.filter((_, index) => index !== recoveryIndex)
          : factor.recoveryCodeHashes,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: factorNow,
      });
    }

    this.database.clearAuthenticationFailures(credential.userId, now.toISOString());
    return this.createSession(credential, now.toISOString());
  }

  public getMfaStatus(token: string): MfaStatus {
    const session = this.resolveSession(token);
    if (!session) throw new Error('Your session has expired. Sign in again.');
    const factor = this.database.getMfaFactor(session.userId);
    return { enabled: Boolean(factor?.enabled), pending: Boolean(factor && !factor.enabled) };
  }

  public beginMfaEnrollment(token: string): MfaEnrollment {
    const session = this.resolveSession(token);
    if (!session) throw new Error('Your session has expired. Sign in again.');
    if (!this.masterKey) throw new Error('The MFA vault is unavailable because no protected key is loaded.');
    const existing = this.database.getMfaFactor(session.userId);
    if (existing?.enabled) throw new Error('Multi-factor authentication is already enabled.');
    const secret = base32Encode(randomBytes(20));
    const recoveryCodes = Array.from({ length: MFA_RECOVERY_CODE_COUNT }, () => randomBytes(5).toString('hex').toUpperCase());
    const encrypted = encryptMfaSecret(secret, this.mfaKeyForVersion(MFA_KEY_VERSION));
    const now = new Date().toISOString();
    this.database.upsertMfaFactor({
      userId: session.userId,
      ...encrypted,
      keyVersion: MFA_KEY_VERSION,
      enabled: false,
      recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    return {
      secret,
      otpauthUri: `otpauth://totp/${encodeURIComponent('Epic BOS')}:${encodeURIComponent(session.email)}?secret=${secret}&issuer=${encodeURIComponent('Epic BOS')}&algorithm=SHA1&digits=${MFA_DIGITS}&period=${MFA_PERIOD_SECONDS}`,
      recoveryCodes,
    };
  }

  public confirmMfaEnrollment(token: string, code: string): MfaStatus {
    const session = this.resolveSession(token);
    if (!session) throw new Error('Your session has expired. Sign in again.');
    const factor = this.database.getMfaFactor(session.userId);
    if (!factor || factor.enabled) throw new Error('Start a new MFA enrollment before confirming it.');
    const normalized = normalizeMfaCode(code);
    if (!/^\d{6}$/u.test(normalized) || ![-1, 0, 1].some((offset) => safeEqualText(createTotpCode(this.decryptFactorSecret(factor), Date.now() + offset * MFA_PERIOD_SECONDS * 1000), normalized))) {
      throw new Error('Enter the current six-digit code from your authenticator app.');
    }
    this.database.upsertMfaFactor({ ...factor, enabled: true, updatedAt: new Date().toISOString() });
    return { enabled: true, pending: false };
  }

  public async disableMfa(token: string, currentPassword: string): Promise<void> {
    const session = this.resolveSession(token);
    if (!session) throw new Error('Your session has expired. Sign in again.');
    const credential = this.database.getCredentialByUserId(session.userId);
    if (!credential || !(await this.verifyPassword(currentPassword, credential))) {
      throw new Error('The current password is incorrect.');
    }
    this.database.deleteMfaFactor(session.userId);
    this.database.revokeSessionsForUser(session.userId, new Date().toISOString());
  }

  /** Re-encrypts every stored authenticator secret with the active envelope key version. */
  public rewrapMfaEnvelopes(actorId = 'system-key-rotation', targetVersion = MFA_KEY_VERSION, now = new Date().toISOString()): number {
    assertSupportedArtifactKeyVersion(targetVersion);
    let migrated = 0;
    for (const factor of this.database.listMfaFactors()) {
      if (factor.keyVersion === targetVersion) continue;
      const secret = decryptMfaSecret(factor, this.mfaKeyForVersion(factor.keyVersion));
      const encrypted = encryptMfaSecret(secret, this.mfaKeyForVersion(targetVersion));
      this.database.upsertMfaFactor({
        ...factor,
        ...encrypted,
        keyVersion: targetVersion,
        updatedAt: now,
      });
      migrated += 1;
    }
    void actorId;
    return migrated;
  }

  public async provisionUser(
    userId: string,
    email: string,
    displayName: string,
    temporaryPassword: string,
  ): Promise<void> {
    if (
      this.database.getCredentialByUserId(userId) ||
      this.database.getCredentialByEmail(email)
    ) {
      throw new Error('Authentication credentials already exist for this user.');
    }
    assertStrongPassword(temporaryPassword);
    this.database.upsertCredential(
      await this.createCredential(
        userId,
        email,
        displayName,
        temporaryPassword,
        true,
        new Date().toISOString(),
      ),
    );
  }

  public resolveSession(token: string): SessionInfo | null {
    const now = new Date();
    const record = this.database.getSessionByTokenHash(hashToken(token));
    if (
      !record ||
      record.revokedAt ||
      new Date(record.expiresAt).getTime() <= now.getTime()
    ) {
      return null;
    }
    const credential = this.database.getCredentialByUserId(record.userId);
    if (!credential) return null;
    const lastSeenAt = now.toISOString();
    this.database.touchSession(record.id, lastSeenAt);
    return this.toSessionInfo(record, credential, lastSeenAt);
  }

  public logout(token: string): void {
    const record = this.database.getSessionByTokenHash(hashToken(token));
    if (record && !record.revokedAt) {
      this.database.revokeSession(record.id, new Date().toISOString());
    }
  }

  /**
   * Authorization changes take effect by forcing every affected device to
   * establish a fresh session. This avoids carrying an old access decision
   * forward after a role, company, branch, or field-policy change.
   */
  public revokeSessionsForUsers(userIds: readonly string[]): void {
    const now = new Date().toISOString();
    for (const userId of new Set(userIds)) {
      this.database.revokeSessionsForUser(userId, now);
    }
  }

  public async changePassword(
    token: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    const session = this.resolveSession(token);
    if (!session) throw new Error('Your session has expired. Sign in again.');
    const credential = this.database.getCredentialByUserId(session.userId);
    if (!credential) throw new Error('The signed-in account no longer exists.');
    if (!(await this.verifyPassword(input.currentPassword, credential))) {
      throw new Error('The current password is incorrect.');
    }
    assertStrongPassword(input.newPassword);
    if (input.currentPassword === input.newPassword) {
      throw new Error('The new password must be different.');
    }
    const changedAt = new Date().toISOString();
    this.database.upsertCredential(
      await this.createCredential(
        credential.userId,
        credential.email,
        credential.displayName,
        input.newPassword,
        false,
        changedAt,
      ),
    );
    // Password replacement is a credential-security event, not merely a
    // profile edit. Every existing device session must authenticate again.
    this.database.revokeSessionsForUser(credential.userId, changedAt);
  }

  public pruneSessions(): void {
    this.database.deleteExpiredSessions(new Date().toISOString());
  }

  private async createCredential(
    userId: string,
    email: string,
    displayName: string,
    password: string,
    mustChangePassword: boolean,
    now: string,
  ): Promise<CredentialRecord> {
    const salt = randomBytes(16);
    const passwordHash = await deriveKey(
      password,
      salt,
      PASSWORD_BYTES,
      SCRYPT_PARAMETERS,
    );
    return {
      userId,
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      passwordHash: passwordHash.toString('base64'),
      salt: salt.toString('base64'),
      algorithm: 'scrypt-v1',
      parameters: JSON.stringify(SCRYPT_PARAMETERS),
      mustChangePassword,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    };
  }

  private async verifyPassword(
    password: string,
    credential: CredentialRecord,
  ): Promise<boolean> {
    const expected = Buffer.from(credential.passwordHash, 'base64');
    const parameters = JSON.parse(credential.parameters) as {
      N: number;
      r: number;
      p: number;
      maxmem: number;
    };
    const actual = await deriveKey(
      password,
      Buffer.from(credential.salt, 'base64'),
      expected.length,
      parameters,
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private async burnEquivalentWork(password: string): Promise<void> {
    await deriveKey(password, Buffer.alloc(16), PASSWORD_BYTES, SCRYPT_PARAMETERS);
  }

  private decryptFactorSecret(factor: StoredMfaFactor): string {
    if (!this.masterKey) throw new Error('The MFA vault is unavailable because no protected key is loaded.');
    try {
      assertSupportedArtifactKeyVersion(factor.keyVersion);
    } catch {
      throw new Error(`MFA factor uses unsupported key version ${factor.keyVersion}; rotate it before use.`);
    }
    return decryptMfaSecret(factor, this.mfaKeyForVersion(factor.keyVersion));
  }

  private mfaKeyForVersion(version: number): Buffer {
    if (!this.masterKey) throw new Error('The MFA vault is unavailable because no protected key is loaded.');
    return deriveArtifactKey(this.masterKey, 'epic-bos/mfa-secrets', version);
  }

  private createSession(
    credential: CredentialRecord,
    createdAt: string,
  ): AuthenticatedSession {
    const issued = this.issueSession(credential, createdAt);
    this.database.insertSession(issued.record);
    return issued.authenticated;
  }

  private issueSession(
    credential: CredentialRecord,
    createdAt: string,
  ): { record: SessionRecord; authenticated: AuthenticatedSession } {
    const token = randomBytes(32).toString('base64url');
    const record: SessionRecord = {
      id: randomUUID(),
      userId: credential.userId,
      tokenHash: hashToken(token),
      createdAt,
      expiresAt: new Date(
        new Date(createdAt).getTime() + SESSION_HOURS * 60 * 60_000,
      ).toISOString(),
      lastSeenAt: createdAt,
      revokedAt: null,
    };
    return {
      record,
      authenticated: {
        token,
        info: this.toSessionInfo(record, credential, createdAt),
      },
    };
  }

  private toSessionInfo(
    record: SessionRecord,
    credential: CredentialRecord,
    lastSeenAt: string,
  ): SessionInfo {
    return {
      id: record.id,
      userId: credential.userId,
      email: credential.email,
      displayName: credential.displayName,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      lastSeenAt,
      mustChangePassword: credential.mustChangePassword,
    };
  }
}
