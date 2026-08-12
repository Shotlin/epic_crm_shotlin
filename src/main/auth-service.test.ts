import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BusinessDatabase } from './database';
import { AuthService, createTotpCode } from './auth-service';

describe('authentication and sessions', () => {
  let database: BusinessDatabase;
  let auth: AuthService;

  beforeEach(async () => {
    database = new BusinessDatabase(':memory:');
    await database.initialize();
    auth = new AuthService(database);
  });

  afterEach(() => database.close());

  it('matches the RFC 6238 SHA-1 reference vector', () => {
    expect(createTotpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000)).toBe('287082');
  });

  it('enrolls the first owner without shipping a default password', async () => {
    expect(auth.getStatus().configured).toBe(false);
    const session = await auth.bootstrapOwner({
      email: 'owner@example.com',
      displayName: 'Owner Operator',
      password: 'Northstar!2026',
    });

    expect(auth.getStatus(session.token).session?.email).toBe(
      'owner@example.com',
    );
    await expect(
      auth.bootstrapOwner({
        email: 'second@example.com',
        displayName: 'Second Owner',
        password: 'SecondOwner!2026',
      }),
    ).rejects.toThrow('already');
  });

  it('can prepare first-run credentials and a session without persisting either', async () => {
    const prepared = await auth.prepareBootstrapOwner(
      {
        email: 'founder@kaveri.in',
        displayName: 'Riya Sharma',
        password: 'Kaveri!2026Secure',
        starterMode: 'clean',
      },
      '2026-07-21T09:00:00.000Z',
    );

    expect(prepared.credential.email).toBe('founder@kaveri.in');
    expect(prepared.session.userId).toBe(prepared.credential.userId);
    expect(prepared.authenticated.info.id).toBe(prepared.session.id);
    expect(auth.getStatus(prepared.authenticated.token)).toEqual({
      configured: false,
      session: null,
    });
    expect(database.countCredentials()).toBe(0);
  });

  it('rejects weak owner credentials', async () => {
    await expect(
      auth.bootstrapOwner({
        email: 'owner@example.com',
        displayName: 'Owner',
        password: 'password',
      }),
    ).rejects.toThrow('between 12 and 256');
  });

  it('signs in, resolves, and revokes a session without exposing its hash', async () => {
    const enrolled = await auth.bootstrapOwner({
      email: 'owner@example.com',
      displayName: 'Owner Operator',
      password: 'Northstar!2026',
    });
    auth.logout(enrolled.token);
    expect(auth.resolveSession(enrolled.token)).toBeNull();

    const signedIn = await auth.login({
      email: 'OWNER@example.com',
      password: 'Northstar!2026',
    });
    expect(signedIn.info.displayName).toBe('Owner Operator');
    expect(signedIn.token).not.toBe(
      database.getSessionByTokenHash(signedIn.token)?.tokenHash,
    );
  });

  it('locks an account after five invalid passwords', async () => {
    await auth.bootstrapOwner({
      email: 'owner@example.com',
      displayName: 'Owner Operator',
      password: 'Northstar!2026',
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        auth.login({ email: 'owner@example.com', password: 'Wrong!123456' }),
      ).rejects.toThrow('incorrect');
    }
    await expect(
      auth.login({ email: 'owner@example.com', password: 'Wrong!123456' }),
    ).rejects.toThrow('locked for 15 minutes');
    await expect(
      auth.login({ email: 'owner@example.com', password: 'Northstar!2026' }),
    ).rejects.toThrow('locked until');
  });

  it('changes a password only for an authenticated session', async () => {
    const enrolled = await auth.bootstrapOwner({
      email: 'owner@example.com',
      displayName: 'Owner Operator',
      password: 'Northstar!2026',
    });
    await auth.changePassword(enrolled.token, {
      currentPassword: 'Northstar!2026',
      newPassword: 'Northstar!2027',
    });
    expect(auth.resolveSession(enrolled.token)).toBeNull();
    await expect(
      auth.login({ email: 'owner@example.com', password: 'Northstar!2027' }),
    ).resolves.toBeTruthy();
  });

  it('revokes every active session after an authorization policy change', async () => {
    const first = await auth.bootstrapOwner({
      email: 'owner@example.com',
      displayName: 'Owner Operator',
      password: 'Northstar!2026',
    });
    const second = await auth.login({
      email: 'owner@example.com',
      password: 'Northstar!2026',
    });
    auth.revokeSessionsForUsers([first.info.userId, first.info.userId]);
    expect(auth.resolveSession(first.token)).toBeNull();
    expect(auth.resolveSession(second.token)).toBeNull();
  });

  it('provisions temporary credentials that require replacement', async () => {
    await auth.provisionUser(
      'user-priya',
      'priya@example.com',
      'Priya Shah',
      'Temporary!2026',
    );
    const session = await auth.login({
      email: 'priya@example.com',
      password: 'Temporary!2026',
    });
    expect(session.info.mustChangePassword).toBe(true);
    await auth.changePassword(session.token, {
      currentPassword: 'Temporary!2026',
      newPassword: 'Permanent!2026',
    });
    expect(auth.getStatus(session.token).session).toBeNull();
    const refreshed = await auth.login({
      email: 'priya@example.com',
      password: 'Permanent!2026',
    });
    expect(refreshed.info.mustChangePassword).toBe(false);
  });

  it('enrolls encrypted TOTP MFA, requires the challenge, and consumes recovery codes once', async () => {
    const secureAuth = new AuthService(database, Buffer.alloc(32, 7));
    const enrolled = await secureAuth.bootstrapOwner({
      email: 'secure@example.com',
      displayName: 'Secure Operator',
      password: 'Secure!2026Owner',
    });
    const setup = secureAuth.beginMfaEnrollment(enrolled.token);
    expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/u);
    expect(setup.otpauthUri).toContain('otpauth://totp/');
    expect(setup.recoveryCodes).toHaveLength(8);
    expect(secureAuth.confirmMfaEnrollment(enrolled.token, createTotpCode(setup.secret))).toEqual({ enabled: true, pending: false });
    expect(secureAuth.getStatus(enrolled.token).mfaEnabled).toBe(true);

    const persisted = database.getMfaFactor(enrolled.info.userId);
    expect(persisted).not.toBeNull();
    database.upsertMfaFactor({ ...persisted!, keyVersion: 99 });
    await expect(secureAuth.login({ email: 'secure@example.com', password: 'Secure!2026Owner', mfaCode: createTotpCode(setup.secret) })).rejects.toThrow('unsupported key version');
    database.upsertMfaFactor(persisted!);

    secureAuth.logout(enrolled.token);
    await expect(secureAuth.login({ email: 'secure@example.com', password: 'Secure!2026Owner' })).rejects.toThrow('code required');
    const recovery = setup.recoveryCodes[0];
    const signedIn = await secureAuth.login({ email: 'secure@example.com', password: 'Secure!2026Owner', mfaCode: recovery });
    expect(signedIn.info.email).toBe('secure@example.com');
    secureAuth.logout(signedIn.token);
    await expect(secureAuth.login({ email: 'secure@example.com', password: 'Secure!2026Owner', mfaCode: recovery })).rejects.toThrow('incorrect');
  });

  it('revokes sessions when MFA is disabled with the current password', async () => {
    const secureAuth = new AuthService(database, Buffer.alloc(32, 8));
    const enrolled = await secureAuth.bootstrapOwner({
      email: 'disable@example.com',
      displayName: 'Disable Operator',
      password: 'Disable!2026Owner',
    });
    const setup = secureAuth.beginMfaEnrollment(enrolled.token);
    secureAuth.confirmMfaEnrollment(enrolled.token, createTotpCode(setup.secret));
    await secureAuth.disableMfa(enrolled.token, 'Disable!2026Owner');
    expect(secureAuth.resolveSession(enrolled.token)).toBeNull();
    expect(database.getMfaFactor(enrolled.info.userId)).toBeNull();
  });
});
