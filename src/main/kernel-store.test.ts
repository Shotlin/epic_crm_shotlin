import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInitialKernelState } from '../domain/kernel';
import type { KernelState } from '../shared/kernel-contracts';
import { BusinessDatabase } from './database';
import { KernelStore } from './kernel-store';

let directory = '';
let database: BusinessDatabase;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-kernel-store-'));
  database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3'));
  await database.initialize();
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

function createLegacyKernelState(): KernelState {
  const legacy = structuredClone(createInitialKernelState());
  legacy.users = legacy.users.map((user) =>
    user.id === 'user-avery'
      ? {
          ...user,
          roleIds: user.roleIds.filter(
            (roleId) => roleId !== 'role-workspace-owner',
          ),
        }
      : user,
  );
  legacy.roles = legacy.roles.filter(({ id }) => id !== 'role-workspace-owner');
  legacy.grants = legacy.grants.filter(
    ({ id }) => !id.startsWith('grant-workspace-'),
  );
  legacy.migrations = legacy.migrations.filter(
    ({ id }) => id !== '002-workspace-owner-authorization',
  );
  return legacy;
}

describe('KernelStore authorization foundation', () => {
  it('upgrades the exact legacy USD bootstrap entity to the India-first demo safely', async () => {
    const legacy = structuredClone(createInitialKernelState());
    legacy.companies[0] = {
      ...legacy.companies[0]!,
      code: 'NSUS',
      name: 'Northstar US',
      legalName: 'Northstar Group, Inc.',
      countryCode: 'US',
      baseCurrency: 'USD',
      fiscalYearStartMonth: 1,
    };
    legacy.branches[0] = {
      ...legacy.branches[0]!,
      code: 'HQ',
      name: 'New York HQ',
      timezone: 'America/New_York',
    };
    legacy.fiscalPeriods[0] = {
      ...legacy.fiscalPeriods[0]!,
      name: 'FY 2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    };
    legacy.numberSequences[0] = {
      ...legacy.numberSequences[0]!,
      prefix: 'SO-2026-',
    };
    legacy.currencies = [
      ...legacy.currencies.filter(({ code }) => code === 'USD'),
      ...legacy.currencies.filter(({ code }) => code !== 'USD'),
    ];
    database.saveState('kernel', legacy.schemaVersion, legacy.revision, legacy);

    const store = new KernelStore(database, path.join(directory, 'data'));
    await store.initialize();

    const localized = store.getSnapshot();
    expect(localized.companies[0]).toMatchObject({
      code: 'NSIN',
      countryCode: 'IN',
      baseCurrency: 'INR',
      fiscalYearStartMonth: 4,
    });
    expect(localized.branches[0]).toMatchObject({ code: 'MUM', timezone: 'Asia/Kolkata' });
    expect(localized.fiscalPeriods[0]).toMatchObject({ name: 'FY 2026-27', startDate: '2026-04-01', endDate: '2027-03-31' });
    expect(localized.numberSequences[0]?.prefix).toBe('SO-26-27-');
    expect(localized.currencies[0]?.code).toBe('INR');
    const persisted = database.loadState<KernelState>('kernel')?.payload;
    expect(persisted?.audit.filter(({ action }) => action === 'kernel.india-demo-localized')).toHaveLength(1);

    const revisionAfterMigration = localized.revision;
    const restarted = new KernelStore(database, path.join(directory, 'data'));
    await restarted.initialize();
    expect(restarted.getSnapshot().revision).toBe(revisionAfterMigration);
    expect(database.loadState<KernelState>('kernel')?.payload.audit.filter(({ action }) => action === 'kernel.india-demo-localized')).toHaveLength(1);
  });

  it('migrates legacy persisted state once and preserves the policy across restart', async () => {
    const legacy = createLegacyKernelState();
    database.saveState('kernel', legacy.schemaVersion, legacy.revision, legacy);
    const dataDirectory = path.join(directory, 'data');

    const firstStore = new KernelStore(database, dataDirectory);
    await firstStore.initialize();

    const migrated = database.loadState<KernelState>('kernel');
    expect(migrated?.revision).toBe(legacy.revision + 27);
    expect(
      migrated?.payload.audit.filter(
        ({ action }) => action === 'authorization.foundation-migrated',
      ),
    ).toHaveLength(1);
    expect(
      migrated?.payload.audit.filter(
        ({ action }) => action === 'authorization.general-ledger-migrated',
      ),
    ).toHaveLength(1);
    expect(
      migrated?.payload.audit.filter(
        ({ action }) => action === 'authorization.party-master-migrated',
      ),
    ).toHaveLength(1);
    expect(
      migrated?.payload.audit.filter(
        ({ action }) => action === 'authorization.sales-commercial-migrated',
      ),
    ).toHaveLength(1);
    expect(
      migrated?.payload.audit.filter(
        ({ action }) => action === 'authorization.receivables-migrated',
      ),
    ).toHaveLength(1);
    expect(
      migrated?.payload.audit.filter(
        ({ action }) => action === 'authorization.sales-master-data-migrated',
      ),
    ).toHaveLength(1);
    expect(
      migrated?.payload.audit.filter(
        ({ action }) => action === 'authorization.sales-geography-migrated',
      ),
    ).toHaveLength(1);
    expect(
      migrated?.payload.audit.filter(
        ({ action }) => action === 'authorization.crm-configuration-migrated',
      ),
    ).toHaveLength(1);
    expect(
      migrated?.payload.audit.filter(
        ({ action }) => action === 'authorization.crm-import-migrated',
      ),
    ).toHaveLength(1);
    expect(
      migrated?.payload.audit.filter(
        ({ action }) => action === 'authorization.crm-communication-migrated',
      ),
    ).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.inventory-warehouse-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.manufacturing-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.delivery-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.workforce-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.asset-maintenance-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.asset-capitalization-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.asset-depreciation-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.asset-retirement-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.asset-custody-transfer-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.asset-componentization-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.asset-component-allocation-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.procurement-requisition-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.filter(({ action }) => action === 'authorization.workspace-owner-runtime-migrated')).toHaveLength(1);
    expect(migrated?.payload.audit.at(-1)?.actorId).toBe('system:migration');
    expect(() =>
      firstStore.assertAuthorized('user-avery', 'payroll.run', 'post'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-lee', 'payroll.run', 'post'),
    ).toThrow('defaults to deny');
    expect(() =>
      firstStore.assertAuthorized('user-priya', 'finance.journal', 'read'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-priya', 'finance.journal', 'post'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-avery', 'crm.opportunity', 'create'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-avery', 'crm.opportunity', 'read'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-lee', 'crm.opportunity', 'create'),
    ).toThrow('defaults to deny');
    expect(() =>
      firstStore.assertAuthorized('user-lee', 'crm.opportunity', 'read'),
    ).toThrow('defaults to deny');
    const activeScope = firstStore.getSnapshot().context;
    // The dynamic attachment IPC channels use this same scoped decision for
    // their client-selected resource. A valid role may read in its active
    // company/branch, while a role without the grant or a different tenant or
    // branch is denied before the vault is consulted.
    expect(() =>
      firstStore.assertAuthorizedInScope(
        'user-avery',
        activeScope.companyId,
        activeScope.branchId,
        'crm.opportunity',
        'read',
      ),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorizedInScope(
        'user-lee',
        activeScope.companyId,
        activeScope.branchId,
        'crm.opportunity',
        'read',
      ),
    ).toThrow('defaults to deny');
    expect(() =>
      firstStore.assertAuthorizedInScope(
        'user-avery',
        'company-not-owned',
        activeScope.branchId,
        'crm.opportunity',
        'read',
      ),
    ).toThrow();
    expect(() =>
      firstStore.assertAuthorizedInScope(
        'user-avery',
        activeScope.companyId,
        'branch-not-owned',
        'crm.opportunity',
        'read',
      ),
    ).toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-avery', 'crm.party', 'update'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-lee', 'crm.party', 'read'),
    ).toThrow('defaults to deny');
    expect(() =>
      firstStore.assertAuthorized('user-avery', 'sales.commercial', 'submit'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-priya', 'sales.commercial', 'approve'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-avery', 'finance.receivable', 'create'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-priya', 'finance.receivable', 'post'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-avery', 'sales.catalog', 'create'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-priya', 'sales.pricing', 'approve'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-avery', 'sales.geography', 'update'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-lee', 'sales.geography', 'create'),
    ).toThrow('defaults to deny');
    expect(() =>
      firstStore.assertAuthorized('user-avery', 'crm.configuration', 'update'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-lee', 'crm.configuration', 'create'),
    ).toThrow('defaults to deny');
    expect(() =>
      firstStore.assertAuthorized('user-avery', 'crm.import', 'submit'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-lee', 'crm.import', 'create'),
    ).toThrow('defaults to deny');
    expect(() =>
      firstStore.assertAuthorized('user-avery', 'crm.integration', 'update'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-priya', 'crm.integration', 'update'),
    ).toThrow('defaults to deny');
    expect(() =>
      firstStore.assertAuthorized('user-avery', 'crm.communication', 'create'),
    ).not.toThrow();
    expect(() =>
      firstStore.assertAuthorized('user-lee', 'crm.communication', 'create'),
    ).toThrow('defaults to deny');
    expect(() => firstStore.assertAuthorized('user-avery', 'inventory.master', 'create')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-avery', 'inventory.execution', 'approve')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-lee', 'inventory.execution', 'create')).toThrow('defaults to deny');
    expect(() => firstStore.assertAuthorized('user-avery', 'manufacturing.execution', 'create')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-lee', 'manufacturing.release', 'approve')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-avery', 'delivery.service', 'create')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-lee', 'delivery.service', 'approve')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-avery', 'workforce.profile', 'create')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-lee', 'workforce.profile', 'approve')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-priya', 'workforce.availability', 'create')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-avery', 'finance.asset-register', 'submit')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-priya', 'finance.asset-register', 'approve')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-lee', 'maintenance.work-order', 'update')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-avery', 'maintenance.asset-transfer', 'create')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-priya', 'maintenance.asset-transfer', 'approve')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-lee', 'maintenance.asset-transfer', 'update')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-avery', 'finance.asset-sale-disposal', 'create')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-priya', 'finance.asset-sale-disposal', 'approve')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-lee', 'finance.asset-sale-disposal', 'update')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-avery', 'maintenance.asset-lifecycle', 'create')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-priya', 'maintenance.asset-lifecycle', 'create')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-lee', 'maintenance.asset-lifecycle', 'create')).not.toThrow();
    expect(() => firstStore.assertAuthorized('user-lee', 'maintenance.work-order', 'approve')).toThrow('defaults to deny');

    const secondStore = new KernelStore(database, dataDirectory);
    await secondStore.initialize();

    const restarted = database.loadState<KernelState>('kernel');
    expect(restarted?.revision).toBe(migrated?.revision);
    expect(
      restarted?.payload.audit.filter(
        ({ action }) => action === 'authorization.foundation-migrated',
      ),
    ).toHaveLength(1);
    expect(restarted?.payload.audit.filter(({ action }) => action === 'authorization.workspace-owner-runtime-migrated')).toHaveLength(1);
    expect(
      restarted?.payload.audit.filter(
        ({ action }) => action === 'authorization.general-ledger-migrated',
      ),
    ).toHaveLength(1);
    expect(
      restarted?.payload.audit.filter(
        ({ action }) => action === 'authorization.party-master-migrated',
      ),
    ).toHaveLength(1);
    expect(
      restarted?.payload.audit.filter(
        ({ action }) => action === 'authorization.sales-commercial-migrated',
      ),
    ).toHaveLength(1);
    expect(
      restarted?.payload.audit.filter(
        ({ action }) => action === 'authorization.receivables-migrated',
      ),
    ).toHaveLength(1);
    expect(
      restarted?.payload.audit.filter(
        ({ action }) => action === 'authorization.sales-master-data-migrated',
      ),
    ).toHaveLength(1);
    expect(
      restarted?.payload.audit.filter(
        ({ action }) => action === 'authorization.sales-geography-migrated',
      ),
    ).toHaveLength(1);
    expect(
      restarted?.payload.audit.filter(
        ({ action }) => action === 'authorization.crm-configuration-migrated',
      ),
    ).toHaveLength(1);
    expect(
      restarted?.payload.audit.filter(
        ({ action }) => action === 'authorization.crm-import-migrated',
      ),
    ).toHaveLength(1);
    expect(
      restarted?.payload.audit.filter(
        ({ action }) => action === 'authorization.crm-communication-migrated',
      ),
    ).toHaveLength(1);
    expect(restarted?.payload.audit.filter(({ action }) => action === 'authorization.inventory-warehouse-migrated')).toHaveLength(1);
    expect(restarted?.payload.audit.filter(({ action }) => action === 'authorization.asset-maintenance-migrated')).toHaveLength(1);
    expect(() =>
      secondStore.assertAuthorized('user-avery', 'payroll.run', 'post'),
    ).not.toThrow();
    expect(() =>
      secondStore.assertAuthorized('user-lee', 'payroll.run', 'post'),
    ).toThrow('defaults to deny');
  });

  it('recognizes only the immutable bootstrap owner and has no legacy JSON backup surface', async () => {
    const state = createInitialKernelState();
    state.grants.push({
      id: 'grant-test-workspace-read',
      resource: 'operations.workspace',
      actions: ['read'],
    });
    state.roles.push({
      id: 'role-test-workspace-reader',
      name: 'Test workspace reader',
      description: 'Read-only access used to prevent privilege fallback regressions.',
      grantIds: ['grant-test-workspace-read'],
      system: false,
      version: 1,
    });
    state.users = state.users.map((user) =>
      user.id === 'user-priya'
        ? { ...user, roleIds: ['role-test-workspace-reader'] }
        : user,
    );
    database.saveState('kernel', state.schemaVersion, state.revision, state);

    const store = new KernelStore(database, path.join(directory, 'data'));
    await store.initialize();

    expect(
      store.getAccessDecision('user-priya', 'operations.workspace', 'read').allowed,
    ).toBe(true);
    expect(store.isBootstrapWorkspaceOwner('user-avery')).toBe(true);
    expect(store.isBootstrapWorkspaceOwner('user-priya')).toBe(false);
    expect(store.isBootstrapWorkspaceOwner('user-lee')).toBe(false);

    const legacySurface = store as unknown as Record<string, unknown>;
    expect('createBackup' in legacySurface).toBe(false);
    expect('restoreBackup' in legacySurface).toBe(false);
  });

  it('persists workspace identity and bootstrap owner adoption without renaming a legal company', async () => {
    const store = new KernelStore(database, path.join(directory, 'data'));
    await store.initialize();
    const before = store.getSnapshot();

    const renamedWorkspace = await store.updateTenantIdentity(
      {
        name: 'Kaveri Foods Operating System',
        slug: 'kaveri-foods',
        expectedVersion: before.tenant.version,
      },
      'user-avery',
    );
    const adoptedOwner = await store.adoptBootstrapOwnerIdentity(
      'founder@kaveri.in',
      'Riya Sharma',
      'user-avery',
    );

    expect(renamedWorkspace.tenant).toMatchObject({
      id: before.tenant.id,
      name: 'Kaveri Foods Operating System',
      slug: 'kaveri-foods',
      version: before.tenant.version + 1,
    });
    expect(adoptedOwner.companies).toEqual(before.companies);
    expect(adoptedOwner.context.tenantId).toBe(before.context.tenantId);
    expect(adoptedOwner.users.find(({ id }) => id === 'user-avery')).toMatchObject({
      id: 'user-avery',
      email: 'founder@kaveri.in',
      displayName: 'Riya Sharma',
    });

    const persisted = database.loadState<KernelState>('kernel')?.payload;
    expect(persisted?.audit.filter(({ action }) => action === 'tenant.identity.updated')).toHaveLength(1);
    expect(persisted?.audit.filter(({ action }) => action === 'workspace.owner.identity-adopted')).toHaveLength(1);
    expect(persisted?.outbox.find(({ type }) => type === 'kernel.tenant.identity-updated.v1')).toMatchObject({
      aggregateId: before.tenant.id,
    });
    expect(persisted?.outbox.find(({ type }) => type === 'kernel.workspace-owner.identity-adopted.v1')).toMatchObject({
      aggregateId: 'user-avery',
    });

    const restarted = new KernelStore(database, path.join(directory, 'data'));
    await restarted.initialize();
    const restored = restarted.getSnapshot();
    expect(restored.tenant).toMatchObject({
      name: 'Kaveri Foods Operating System',
      slug: 'kaveri-foods',
    });
    expect(restored.users.find(({ id }) => id === 'user-avery')).toMatchObject({
      email: 'founder@kaveri.in',
      displayName: 'Riya Sharma',
    });
  });

  it('reports database, audit, migration, and outbox health for operators', async () => {
    const store = new KernelStore(database, path.join(directory, 'data'));
    await store.initialize();
    const health = store.getOperationalHealth();
    expect(['healthy', 'degraded']).toContain(health.status);
    expect(health).toMatchObject({ databaseIntegrity: true, auditChainValid: true, migrationsValid: true, failedOutboxEvents: 0 });
    expect(health.appliedMigrations).toBeGreaterThanOrEqual(3);
    expect(health.recentAuditEvents).toBeGreaterThan(0);
  });

  it('builds a deterministic replay plan and classifies duplicate or exhausted events', async () => {
    const state = createInitialKernelState();
    state.outbox = [
      { id: 'event-b', type: 'company.updated', aggregateType: 'company', aggregateId: 'company-1', occurredAt: '2026-07-15T08:00:01.000Z', payload: {}, status: 'failed', attempts: 1 },
      { id: 'event-a', type: 'company.created', aggregateType: 'company', aggregateId: 'company-1', occurredAt: '2026-07-15T08:00:00.000Z', payload: {}, status: 'pending', attempts: 0 },
      { id: 'event-c', type: 'branch.updated', aggregateType: 'branch', aggregateId: 'branch-1', occurredAt: '2026-07-15T08:00:02.000Z', payload: {}, status: 'failed', attempts: 5 },
    ];
    database.saveState('kernel', state.schemaVersion, state.revision, state);
    const store = new KernelStore(database, path.join(directory, 'data'));
    await store.initialize();
    const plan = store.getOutboxReplayPlan();
    expect(plan.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.items.slice(0, 3).map(({ id }) => id)).toEqual(['event-a', 'event-b', 'event-c']);
    expect(plan.items.slice(0, 3).map(({ classification }) => classification)).toEqual(['ready', 'conflict', 'conflict']);
  });

  it('executes only a signed, current replay checkpoint and records outcomes', async () => {
    const state = createInitialKernelState();
    state.outbox = [{ id: 'event-replay', type: 'company.created', aggregateType: 'company', aggregateId: 'company-replay', occurredAt: '2026-07-15T08:00:00.000Z', payload: {}, status: 'pending', attempts: 0 }];
    database.saveState('kernel', state.schemaVersion, state.revision, state);
    const store = new KernelStore(database, path.join(directory, 'data'));
    await store.initialize();
    const plan = store.getOutboxReplayPlan();
    await store.executeOutboxReplay({ checkpointRevision: plan.checkpointRevision, signature: plan.signature, outcomes: [{ eventId: 'event-replay', result: 'published' }] }, 'user-avery');
    expect(store.getOutboxReplayPlan().items.some(({ id }) => id === 'event-replay')).toBe(false);
    await expect(store.executeOutboxReplay({ checkpointRevision: plan.checkpointRevision, signature: plan.signature, outcomes: [] }, 'user-avery')).rejects.toThrow('stale');
  });

  it('allows an administrator to requeue a conflict with immutable resolution evidence', async () => {
    const state = createInitialKernelState();
    state.outbox = [
      { id: 'event-primary', type: 'company.created', aggregateType: 'company', aggregateId: 'company-recovery', occurredAt: '2026-07-15T08:00:00.000Z', payload: {}, status: 'pending', attempts: 0 },
      { id: 'event-conflict', type: 'company.updated', aggregateType: 'company', aggregateId: 'company-recovery', occurredAt: '2026-07-15T08:00:01.000Z', payload: {}, status: 'failed', attempts: 2 },
    ];
    database.saveState('kernel', state.schemaVersion, state.revision, state);
    const store = new KernelStore(database, path.join(directory, 'data'));
    await store.initialize();
    await store.resolveOutboxConflict({ eventId: 'event-conflict', resolution: 'requeue', reason: 'Confirmed aggregate ordering with the downstream connector.' }, 'user-avery');
    const plan = store.getOutboxReplayPlan();
    expect(plan.items.find(({ id }) => id === 'event-conflict')).toMatchObject({ classification: 'conflict', attempts: 0 });
    expect(store.getOperationalHealth().auditChainValid).toBe(true);
  });
});
