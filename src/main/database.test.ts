import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInitialKernelState } from '../domain/kernel';
import type { KernelState } from '../shared/kernel-contracts';
import {
  BusinessDatabase,
  type WorkspaceBootstrapManifest,
} from './database';

let directory = '';
let database: BusinessDatabase;

function createWorkspaceBootstrapManifest(
  workspaceId = 'tenant-fresh-bootstrap',
): WorkspaceBootstrapManifest {
  return {
    starterMode: 'clean',
    stateDocuments: [
      {
        namespace: 'kernel',
        schemaVersion: 1,
        revision: 1,
        payload: {
          tenant: { id: workspaceId, name: 'Fresh India Business' },
          audit: [
            {
              id: 'audit-bootstrap-kernel',
              occurredAt: '2026-07-21T11:00:00.000Z',
              actorId: 'user-owner',
              action: 'workspace.bootstrap',
              resource: 'kernel.workspace',
              resourceId: workspaceId,
              reason: 'Fresh workspace bootstrap',
              before: null,
              after: { workspaceId },
              previousHash: '0'.repeat(64),
              hash: 'a'.repeat(64),
            },
          ],
          outbox: [
            {
              id: 'event-bootstrap-kernel',
              type: 'kernel.workspace.bootstrapped.v1',
              aggregateType: 'workspace',
              aggregateId: workspaceId,
              occurredAt: '2026-07-21T11:00:00.000Z',
              payload: { workspaceId },
              status: 'pending',
              attempts: 0,
            },
          ],
        },
      },
      {
        namespace: 'crm',
        schemaVersion: 1,
        revision: 1,
        payload: {
          tenantId: workspaceId,
          audit: [],
          outbox: [],
        },
      },
    ],
    credential: {
      userId: 'user-owner',
      email: 'owner@example.in',
      displayName: 'Workspace Owner',
      passwordHash: 'derived-hash',
      salt: 'random-salt',
      algorithm: 'scrypt-v1',
      parameters: '{"cost":32768,"blockSize":8,"parallelization":1}',
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: '2026-07-21T11:00:00.000Z',
    },
    session: {
      id: 'session-owner',
      userId: 'user-owner',
      tokenHash: 'sha256-session-token-hash',
      createdAt: '2026-07-21T11:00:00.000Z',
      expiresAt: '2026-07-21T19:00:00.000Z',
      lastSeenAt: '2026-07-21T11:00:00.000Z',
      revokedAt: null,
    },
  };
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-db-'));
  database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3'));
  await database.initialize();
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

describe('BusinessDatabase', () => {
  it('applies checksum-tracked migrations and enables integrity checks', () => {
    const migrations = database.getAppliedMigrations();

    expect(migrations.map(({ id }) => id)).toEqual([
      '001-core-state-ledgers',
      '002-authentication-sessions',
      '003-encrypted-attachments-backups',
      '004-statutory-adapter-secrets',
      '005-provider-connector-secrets',
      '006-general-ledger-foundation',
      '007-general-ledger-control-hardening',
      '008-public-api-key-administration',
      '009-release-gate-evidence',
      '010-restore-drill-evidence',
      '011-intelligence-evidence',
      '012-automation-run-ledger',
      '013-automation-schedules',
      '014-automation-scheduler-failures',
      '015-automation-scheduler-action-ledger',
      '016-finance-completion-workpapers',
      '017-finance-journal-dimensions',
      '018-workspace-bootstrap-guard',
      '019-intelligence-report-delivery',
      '020-release-artifact-evidence',
      '021-release-update-evidence',
      '022-release-build-identity-binding',
      '023-ui-acceptance-evidence',
      '024-restore-drill-history',
      '025-attachment-operating-scope',
      '026-encrypted-mfa-factors',
      '027-backup-envelope-key-version',
    ]);
    expect(migrations.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum))).toBe(
      true,
    );
    expect(database.verifyIntegrity()).toBe(true);
  });

  it('makes starter-mode selection one-way and persists the provisioned guard', () => {
    const pending = database.beginWorkspaceBootstrap(
      'tenant-fresh-india',
      'clean',
      '2026-07-21T09:00:00.000Z',
    );
    expect(pending).toMatchObject({
      workspaceId: 'tenant-fresh-india',
      status: 'pending',
      starterMode: 'clean',
      provisionedAt: null,
    });
    expect(
      database.beginWorkspaceBootstrap(
        'tenant-fresh-india',
        'clean',
        '2026-07-21T09:01:00.000Z',
      ),
    ).toEqual(pending);
    expect(() =>
      database.beginWorkspaceBootstrap(
        'tenant-fresh-india',
        'sample',
        '2026-07-21T09:02:00.000Z',
      ),
    ).toThrow('starter mode is immutable');

    const provisioned = database.markWorkspaceBootstrapProvisioned(
      'tenant-fresh-india',
      '2026-07-21T09:03:00.000Z',
    );
    expect(provisioned).toMatchObject({
      status: 'provisioned',
      starterMode: 'clean',
      updatedAt: '2026-07-21T09:03:00.000Z',
      provisionedAt: '2026-07-21T09:03:00.000Z',
    });
    expect(
      database.markWorkspaceBootstrapProvisioned(
        'tenant-fresh-india',
        '2026-07-21T09:04:00.000Z',
      ),
    ).toEqual(provisioned);
    expect(() =>
      database.beginWorkspaceBootstrap(
        'tenant-fresh-india',
        'clean',
        '2026-07-21T09:05:00.000Z',
      ),
    ).toThrow('already been provisioned');
  });

  it('atomically claims a fresh workspace with its documents, credential, session, and guard', () => {
    const manifest = createWorkspaceBootstrapManifest('tenant-bootstrap-atomic');

    const guard = database.bootstrapFreshWorkspace(
      'tenant-bootstrap-atomic',
      manifest,
      '2026-07-21T11:01:00.000Z',
    );

    expect(guard).toMatchObject({
      workspaceId: 'tenant-bootstrap-atomic',
      starterMode: 'clean',
      status: 'provisioned',
      provisionedAt: '2026-07-21T11:01:00.000Z',
    });
    expect(database.loadState<{ tenant: { id: string } }>('kernel')).toMatchObject({
      schemaVersion: 1,
      revision: 1,
      payload: { tenant: { id: 'tenant-bootstrap-atomic' } },
    });
    expect(database.loadState<{ tenantId: string }>('crm')).toMatchObject({
      payload: { tenantId: 'tenant-bootstrap-atomic' },
    });
    expect(database.getCredentialByEmail('OWNER@EXAMPLE.IN')).toMatchObject({
      userId: 'user-owner',
      failedAttempts: 0,
    });
    expect(
      database.getSessionByTokenHash('sha256-session-token-hash'),
    ).toMatchObject({
      id: 'session-owner',
      userId: 'user-owner',
      revokedAt: null,
    });
  });

  it('offers a read-only fresh-workspace preflight without claiming the workspace', () => {
    expect(database.findWorkspaceBootstrapGuard('tenant-preflight')).toBeNull();
    expect(database.canBootstrapFreshWorkspace('tenant-preflight')).toBe(true);
    expect(database.canBootstrapFreshWorkspace('tenant-preflight')).toBe(true);
    expect(database.findWorkspaceBootstrapGuard('tenant-preflight')).toBeNull();

    database.bootstrapFreshWorkspace(
      'tenant-preflight',
      createWorkspaceBootstrapManifest('tenant-preflight'),
      '2026-07-21T11:01:30.000Z',
    );

    expect(database.canBootstrapFreshWorkspace('tenant-preflight')).toBe(false);
  });

  it('fails closed when credentials already exist', () => {
    const credentialManifest = createWorkspaceBootstrapManifest(
      'tenant-credential-existing',
    );
    database.upsertCredential(credentialManifest.credential);
    expect(() =>
      database.bootstrapFreshWorkspace(
        'tenant-credential-existing',
        credentialManifest,
        '2026-07-21T11:02:00.000Z',
      ),
    ).toThrow('credentials already exist');
    expect(database.loadState('kernel')).toBeNull();
    expect(
      database.getSessionByTokenHash('sha256-session-token-hash'),
    ).toBeNull();
  });

  it('fails closed when state documents already exist', async () => {
    database.saveState('existing-state', 1, 1, {
      audit: [],
      outbox: [],
    });
    const manifest = createWorkspaceBootstrapManifest('tenant-state-existing');

    expect(() =>
      database.bootstrapFreshWorkspace(
        'tenant-state-existing',
        manifest,
        '2026-07-21T11:03:00.000Z',
      ),
    ).toThrow('state documents already exist');
    expect(database.getCredentialByEmail('owner@example.in')).toBeNull();
    expect(
      database.getSessionByTokenHash('sha256-session-token-hash'),
    ).toBeNull();
  });

  it('fails closed when a protected workspace guard already exists', () => {
    database.getWorkspaceBootstrapGuard('tenant-protected-existing');
    const manifest = createWorkspaceBootstrapManifest(
      'tenant-protected-existing',
    );

    expect(() =>
      database.bootstrapFreshWorkspace(
        'tenant-protected-existing',
        manifest,
        '2026-07-21T11:04:00.000Z',
      ),
    ).toThrow('protected because existing data');
    expect(database.loadState('kernel')).toBeNull();
    expect(database.getCredentialByEmail('owner@example.in')).toBeNull();
  });

  it('rolls back every bootstrap write when provisioning fails after documents and authentication records', async () => {
    const guardedPath = database.path;
    database.close();

    const rawDatabase = new DatabaseSync(guardedPath);
    rawDatabase.exec(`
      CREATE TRIGGER workspace_bootstrap_test_abort
      BEFORE UPDATE OF status ON workspace_bootstrap_guards
      WHEN NEW.status = 'provisioned'
      BEGIN
        SELECT RAISE(ABORT, 'injected bootstrap failure');
      END;
    `);
    rawDatabase.close();

    database = new BusinessDatabase(guardedPath);
    await database.initialize();

    expect(() =>
      database.bootstrapFreshWorkspace(
        'tenant-rollback-bootstrap',
        createWorkspaceBootstrapManifest('tenant-rollback-bootstrap'),
        '2026-07-21T11:05:00.000Z',
      ),
    ).toThrow('injected bootstrap failure');

    expect(database.loadState('kernel')).toBeNull();
    expect(database.loadState('crm')).toBeNull();
    expect(database.getCredentialByEmail('owner@example.in')).toBeNull();
    expect(
      database.getSessionByTokenHash('sha256-session-token-hash'),
    ).toBeNull();

    database.close();
    const verifier = new DatabaseSync(guardedPath);
    for (const table of [
      'workspace_bootstrap_guards',
      'state_documents',
      'credentials',
      'sessions',
      'audit_ledger',
      'outbox_events',
    ]) {
      const row = verifier
        .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
        .get() as { count: number };
      expect(Number(row.count)).toBe(0);
    }
    verifier.close();
  });

  it('enforces starter-mode immutability in SQLite, not only through the helper API', async () => {
    database.beginWorkspaceBootstrap(
      'tenant-sqlite-guard',
      'clean',
      '2026-07-21T09:30:00.000Z',
    );
    const guardedPath = database.path;
    database.close();

    const rawDatabase = new DatabaseSync(guardedPath);
    expect(() =>
      rawDatabase
        .prepare(`
          UPDATE workspace_bootstrap_guards
          SET starter_mode = 'sample'
          WHERE workspace_id = 'tenant-sqlite-guard'
        `)
        .run(),
    ).toThrow('starter mode is immutable');
    rawDatabase.close();

    database = new BusinessDatabase(guardedPath);
    await database.initialize();
    expect(database.getWorkspaceBootstrapGuard('tenant-sqlite-guard')).toMatchObject({
      status: 'pending',
      starterMode: 'clean',
    });
  });

  it('fails closed for unknown or abandoned workspaces without inventing a starter mode', () => {
    const protectedUnknown = database.getWorkspaceBootstrapGuard(
      'tenant-existing-india',
    );
    expect(protectedUnknown).toMatchObject({
      status: 'protected-existing',
      starterMode: null,
    });
    expect(() =>
      database.beginWorkspaceBootstrap(
        'tenant-existing-india',
        'sample',
        '2026-07-21T10:01:00.000Z',
      ),
    ).toThrow('protected because existing data');

    database.beginWorkspaceBootstrap(
      'tenant-abandoned',
      'sample',
      '2026-07-21T10:02:00.000Z',
    );
    const protectedAbandoned = database.protectWorkspaceBootstrap(
      'tenant-abandoned',
      '2026-07-21T10:03:00.000Z',
    );
    expect(protectedAbandoned).toMatchObject({
      status: 'protected-existing',
      starterMode: 'sample',
      provisionedAt: null,
    });
    expect(() =>
      database.markWorkspaceBootstrapProvisioned(
        'tenant-abandoned',
        '2026-07-21T10:04:00.000Z',
      ),
    ).toThrow('protected workspace');
  });

  it('migrates an existing kernel record to a durable protected workspace guard', async () => {
    const state = createInitialKernelState();
    database.saveState('kernel', state.schemaVersion, state.revision, state);
    const legacyPath = database.path;
    database.close();

    // Simulate a database created before migration 018, without fabricating a
    // first-run choice for the persisted workspace.
    const legacyDatabase = new DatabaseSync(legacyPath);
    legacyDatabase.exec(`
      DROP TABLE workspace_bootstrap_guards;
      DELETE FROM schema_migrations WHERE id = '018-workspace-bootstrap-guard';
    `);
    legacyDatabase.close();

    database = new BusinessDatabase(legacyPath);
    await database.initialize();

    expect(database.getWorkspaceBootstrapGuard(state.tenant.id)).toMatchObject({
      workspaceId: state.tenant.id,
      status: 'protected-existing',
      starterMode: null,
    });
  });

  it('persists state, audit, and event evidence transactionally', () => {
    const state = createInitialKernelState();
    database.saveState('kernel', state.schemaVersion, state.revision, state);

    const stored = database.loadState<KernelState>('kernel');
    expect(stored?.schemaVersion).toBe(1);
    expect(stored?.revision).toBe(1);
    expect(stored?.payload.tenant.name).toBe('Epic BOS India Starter');
    expect(stored?.payload.audit).toHaveLength(1);
    expect(stored?.payload.outbox).toHaveLength(1);
  });

  it('will not overwrite a newer revision with stale state', () => {
    const state = createInitialKernelState();
    const newer = { ...state, revision: 3, tenant: { ...state.tenant, name: 'New' } };
    database.saveState('kernel', 1, newer.revision, newer);
    database.saveState('kernel', 1, state.revision, state);

    expect(database.loadState<KernelState>('kernel')).toMatchObject({
      revision: 3,
      payload: { tenant: { name: 'New' } },
    });
  });

  it('replaces a coordinated set of state documents in one all-or-nothing operation', () => {
    database.saveState('kernel', 1, 3, { tenant: { name: 'Old workspace' }, audit: [], outbox: [] });
    database.saveState('crm', 1, 5, { opportunities: ['OLD-OPPORTUNITY'], audit: [], outbox: [] });

    database.replaceStateDocumentsAtomically([
      { namespace: 'kernel', schemaVersion: 1, revision: 4, payload: { tenant: { name: 'Bakaloo Retail' }, audit: [], outbox: [] } },
      { namespace: 'crm', schemaVersion: 1, revision: 6, payload: { opportunities: [], audit: [], outbox: [] } },
    ], '2026-08-03T12:00:00.000Z');

    expect(database.loadState<{ tenant: { name: string } }>('kernel')).toMatchObject({
      revision: 4,
      payload: { tenant: { name: 'Bakaloo Retail' } },
    });
    expect(database.loadState<{ opportunities: string[] }>('crm')).toMatchObject({
      revision: 6,
      payload: { opportunities: [] },
    });
  });

  it('retires superseded outbox events only when a controlled replacement explicitly requests it', () => {
    database.saveState('kernel', 1, 3, {
      tenant: { name: 'Generic demo' },
      audit: [{
        id: 'audit-generic-demo-kernel',
        occurredAt: '2026-08-03T11:00:00.000Z',
        actorId: 'user-demo',
        action: 'kernel.demo.seeded',
        resource: 'kernel.workspace',
        resourceId: 'tenant-generic',
        reason: 'Generic demo seed',
        before: null,
        after: { tenant: 'Generic demo' },
        previousHash: '0'.repeat(64),
        hash: '1'.repeat(64),
      }],
      outbox: [{
        id: 'event-generic-demo-kernel',
        type: 'kernel.demo.seeded.v1',
        aggregateType: 'workspace',
        aggregateId: 'tenant-generic',
        occurredAt: '2026-08-03T11:00:00.000Z',
        payload: {},
        status: 'pending',
        attempts: 0,
      }],
    });
    database.saveState('crm', 1, 3, {
      opportunities: ['GENERIC-OPPORTUNITY'],
      audit: [{
        id: 'audit-generic-demo-crm',
        occurredAt: '2026-08-03T11:00:00.000Z',
        actorId: 'user-demo',
        action: 'crm.demo.seeded',
        resource: 'crm.opportunity',
        resourceId: 'GENERIC-OPPORTUNITY',
        reason: 'Generic demo seed',
        before: null,
        after: { opportunity: 'GENERIC-OPPORTUNITY' },
        previousHash: '1'.repeat(64),
        hash: '2'.repeat(64),
      }],
      outbox: [{
        id: 'event-generic-demo-crm',
        type: 'crm.demo.seeded.v1',
        aggregateType: 'opportunity',
        aggregateId: 'GENERIC-OPPORTUNITY',
        occurredAt: '2026-08-03T11:00:00.000Z',
        payload: {},
        status: 'pending',
        attempts: 0,
      }],
    });

    database.replaceStateDocumentsAtomically([
      { namespace: 'kernel', schemaVersion: 1, revision: 4, payload: { tenant: { name: 'Bakaloo Retail' }, audit: [], outbox: [] } },
      { namespace: 'crm', schemaVersion: 1, revision: 4, payload: { opportunities: [], audit: [], outbox: [] } },
    ], '2026-08-03T12:00:00.000Z', {
      retireAuditForReplacedNamespaces: true,
      retireOutboxForReplacedNamespaces: true,
    });

    const raw = new DatabaseSync(database.path, { allowExtension: false });
    const rows = raw.prepare(`SELECT namespace, event_type FROM outbox_events ORDER BY namespace, event_type`).all();
    const auditRows = raw.prepare(`SELECT namespace, action FROM audit_ledger ORDER BY namespace, action`).all();
    raw.close();
    expect(rows).toEqual([]);
    expect(auditRows).toEqual([]);
  });

  it('leaves every document untouched when any coordinated replacement is stale', () => {
    database.saveState('kernel', 1, 3, { tenant: { name: 'Protected workspace' }, audit: [], outbox: [] });
    database.saveState('crm', 1, 5, { opportunities: ['KEEP-ME'], audit: [], outbox: [] });

    expect(() => database.replaceStateDocumentsAtomically([
      { namespace: 'kernel', schemaVersion: 1, revision: 3, payload: { tenant: { name: 'Should not replace' }, audit: [], outbox: [] } },
      { namespace: 'crm', schemaVersion: 1, revision: 6, payload: { opportunities: [], audit: [], outbox: [] } },
    ], '2026-08-03T12:01:00.000Z')).toThrow(/newer revision/i);

    expect(database.loadState<{ tenant: { name: string } }>('kernel')).toMatchObject({
      revision: 3,
      payload: { tenant: { name: 'Protected workspace' } },
    });
    expect(database.loadState<{ opportunities: string[] }>('crm')).toMatchObject({
      revision: 5,
      payload: { opportunities: ['KEEP-ME'] },
    });
  });

  it('stores credentials, lockout state, and sessions without raw tokens', () => {
    database.upsertCredential({
      userId: 'user-avery',
      email: 'avery@northstar.example',
      displayName: 'Avery Morgan',
      passwordHash: 'derived-hash',
      salt: 'random-salt',
      algorithm: 'scrypt-v1',
      parameters: '{"cost":32768}',
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: '2026-07-15T12:00:00.000Z',
    });
    database.recordAuthenticationFailure(
      'user-avery',
      5,
      '2026-07-15T12:15:00.000Z',
      '2026-07-15T12:05:00.000Z',
    );
    database.insertSession({
      id: 'session-1',
      userId: 'user-avery',
      tokenHash: 'sha256-token-only',
      createdAt: '2026-07-15T12:00:00.000Z',
      expiresAt: '2026-07-15T20:00:00.000Z',
      lastSeenAt: '2026-07-15T12:00:00.000Z',
      revokedAt: null,
    });
    database.insertSession({
      id: 'session-2',
      userId: 'user-avery',
      tokenHash: 'sha256-second-device-token',
      createdAt: '2026-07-15T12:01:00.000Z',
      expiresAt: '2026-07-15T20:01:00.000Z',
      lastSeenAt: '2026-07-15T12:01:00.000Z',
      revokedAt: null,
    });

    expect(database.countCredentials()).toBe(1);
    expect(database.getCredentialByEmail('AVERY@NORTHSTAR.EXAMPLE')).toMatchObject({
      userId: 'user-avery',
      failedAttempts: 5,
      lockedUntil: '2026-07-15T12:15:00.000Z',
    });
    expect(database.getSessionByTokenHash('sha256-token-only')).toMatchObject({
      id: 'session-1',
      userId: 'user-avery',
    });
    database.revokeSession('session-1', '2026-07-15T12:10:00.000Z');
    expect(database.getSessionByTokenHash('sha256-token-only')?.revokedAt).toBe(
      '2026-07-15T12:10:00.000Z',
    );
    database.revokeSessionsForUser('user-avery', '2026-07-15T12:11:00.000Z');
    expect(database.getSessionByTokenHash('sha256-token-only')?.revokedAt).toBe(
      '2026-07-15T12:10:00.000Z',
    );
    expect(database.getSessionByTokenHash('sha256-second-device-token')?.revokedAt).toBe(
      '2026-07-15T12:11:00.000Z',
    );
  });

  it('stores encrypted attachment metadata independently of file contents', () => {
    database.insertAttachment({
      id: 'attachment-1',
      resource: 'crm.opportunity',
      resourceId: 'opportunity-1',
      fileName: 'proposal.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      sha256: 'a'.repeat(64),
      storageKey: 'attachment-1.bin',
      encryptedPath: path.join(directory, 'vault', 'attachment-1.bin'),
      iv: 'base64-iv',
      authTag: 'base64-auth-tag',
      keyVersion: 1,
      createdBy: 'user-avery',
      createdAt: '2026-07-15T12:00:00.000Z',
    });

    expect(
      database.listAttachments('crm.opportunity', 'opportunity-1'),
    ).toHaveLength(1);
    expect(database.getAttachment('attachment-1')).toMatchObject({
      fileName: 'proposal.pdf',
      keyVersion: 1,
    });
  });

  it('creates a consistent online SQLite backup', async () => {
    const state = createInitialKernelState();
    database.saveState('kernel', 1, state.revision, state);
    const backupPath = path.join(directory, 'backup.sqlite3');

    const pages = await database.createOnlineBackup(backupPath);
    const backupDatabase = new BusinessDatabase(backupPath);
    await backupDatabase.initialize();
    const backupState = backupDatabase.loadState<KernelState>('kernel');
    const backupStat = await stat(backupPath);

    expect(pages).toBeGreaterThan(0);
    expect(backupStat.size).toBeGreaterThan(0);
    expect(backupDatabase.verifyIntegrity()).toBe(true);
    expect(backupState?.payload.tenant.id).toBe('tenant-northstar');
    backupDatabase.close();
  });

  it('persists and revokes scoped API key records without storing the secret', () => {
    database.createApiKey({ id: 'api-key-1', label: 'Warehouse reporting', companyId: 'company-india', branchId: 'branch-mumbai', scopes: ['inventory.read'], keyPrefix: 'epic_abcdef123456', secretHash: 'a'.repeat(64), createdBy: 'user-avery', createdAt: '2026-07-17T12:00:00.000Z', revokedBy: null, revokedAt: null });
    expect(database.listApiKeys('company-india', 'branch-mumbai')).toMatchObject([{ id: 'api-key-1', scopes: ['inventory.read'], revokedAt: null }]);
    expect(database.revokeApiKey('api-key-1', 'user-avery', '2026-07-17T12:01:00.000Z')).toBe(true);
    expect(database.revokeApiKey('api-key-1', 'user-avery', '2026-07-17T12:02:00.000Z')).toBe(false);
    expect(database.listApiKeys('company-india', 'branch-mumbai')[0]).toMatchObject({ revokedBy: 'user-avery', revokedAt: '2026-07-17T12:01:00.000Z' });
  });
});
