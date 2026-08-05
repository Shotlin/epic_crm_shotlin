import {
  createHash,
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
  SessionInfo,
} from '../shared/auth-contracts';
import { PRIMARY_WORKSPACE_ID } from '../shared/workspace-identity';
import type {
  BusinessDatabase,
  CredentialRecord,
  SessionRecord,
} from './database';

const PASSWORD_BYTES = 32;
const SESSION_HOURS = 8;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
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

export class AuthService {
  public constructor(private readonly database: BusinessDatabase) {}

  public getStatus(token?: string): AuthStatus {
    const starterMode = this.database.findWorkspaceBootstrapGuard(
      PRIMARY_WORKSPACE_ID,
    )?.starterMode;
    const status: AuthStatus = {
      configured: this.database.countCredentials() > 0,
      session: token ? this.resolveSession(token) : null,
    };
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

    this.database.clearAuthenticationFailures(
      credential.userId,
      now.toISOString(),
    );
    return this.createSession(credential, now.toISOString());
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
