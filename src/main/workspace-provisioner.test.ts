import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth-service';
import { BusinessDatabase } from './database';
import type { KernelState } from '../shared/kernel-contracts';
import type { CrmState } from '../shared/contracts';
import type { PartyState } from '../shared/party-contracts';
import type { CrmDepthState } from '../shared/crm-depth-contracts';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { RetailWorkspaceModeState } from '../domain/retail-workspace-mode';
import {
  PRIMARY_WORKSPACE_ID,
  WorkspaceProvisioner,
  type WorkspaceStoreHydrator,
} from './workspace-provisioner';

describe('WorkspaceProvisioner', () => {
  let database: BusinessDatabase;
  let authService: AuthService;
  let stores: WorkspaceStoreHydrator;

  beforeEach(async () => {
    database = new BusinessDatabase(':memory:');
    await database.initialize();
    authService = new AuthService(database);
    stores = {
      crmStore: { initialize: vi.fn(async () => undefined) },
      kernelStore: { initialize: vi.fn(async () => undefined) },
      partyStore: { initialize: vi.fn(async () => undefined) },
      crmDepthStore: { initialize: vi.fn(async () => undefined) },
      revenueOpsStore: { initialize: vi.fn(async () => undefined) },
      generalLedgerStore: { initialize: vi.fn(async () => undefined) },
    };
  });

  afterEach(() => database.close());

  it('atomically provisions a clean India-first workspace and hydrates stores after commit', async () => {
    const provisioner = new WorkspaceProvisioner(database, authService, stores);
    expect(provisioner.canProvisionFreshWorkspace()).toBe(true);

    const result = await provisioner.provisionFreshOwner(
      {
        email: 'founder@kaveri.in',
        displayName: 'Riya Sharma',
        password: 'Kaveri!2026Secure',
        starterMode: 'clean',
      },
      new Date().toISOString(),
    );

    expect(result.starterMode).toBe('clean');
    expect(authService.getStatus(result.authenticated.token).session).toMatchObject({
      email: 'founder@kaveri.in',
      displayName: 'Riya Sharma',
    });
    expect(database.getWorkspaceBootstrapGuard(PRIMARY_WORKSPACE_ID)).toMatchObject({
      status: 'provisioned',
      starterMode: 'clean',
    });
    const kernel = database.loadState<KernelState>('kernel')?.payload;
    const crm = database.loadState<CrmState>('crm')?.payload;
    const party = database.loadState<PartyState>('party')?.payload;
    const crmDepth = database.loadState<CrmDepthState>('crm-depth')?.payload;
    const revenueOps = database.loadState<RevenueOpsState>('revenue-ops-india')?.payload;
    const workspaceMode = database.loadState<RetailWorkspaceModeState>(
      'retail-workspace-mode',
    )?.payload;
    expect(kernel).toMatchObject({
      tenant: { name: 'Your India workspace' },
      users: [{ email: 'founder@kaveri.in', displayName: 'Riya Sharma' }],
    });
    expect(crm?.leads).toEqual([]);
    expect(party?.accounts).toEqual([]);
    expect(crmDepth?.campaigns).toEqual([]);
    expect(revenueOps).toMatchObject({
      profile: { currency: 'INR', legalName: '', gstin: '' },
      products: [],
      invoices: [],
    });
    expect(workspaceMode).toMatchObject({
      status: 'configured',
      mode: 'clean',
      seed: 'empty',
    });
    for (const store of Object.values(stores)) {
      expect(store.initialize).toHaveBeenCalledTimes(1);
    }
    expect(provisioner.canProvisionFreshWorkspace()).toBe(false);
  });

  it('fails closed to a clean workspace when an obsolete sample-mode caller reaches the provisioner', async () => {
    const provisioner = new WorkspaceProvisioner(database, authService, stores);

    const obsoleteSampleCaller = {
        email: 'owner@riverstone.in',
        displayName: 'Aarav Mehta',
        password: 'Riverstone!2026',
        starterMode: 'sample',
      } as unknown as import('../shared/auth-contracts').BootstrapOwnerInput;
    const result = await provisioner.provisionFreshOwner(
      obsoleteSampleCaller,
      new Date().toISOString(),
    );

    expect(result.starterMode).toBe('clean');
    expect(database.getWorkspaceBootstrapGuard(PRIMARY_WORKSPACE_ID)).toMatchObject({
      status: 'provisioned',
      starterMode: 'clean',
    });
    expect(database.loadState<CrmState>('crm')?.payload.leads).toEqual([]);
    expect(database.loadState<PartyState>('party')?.payload.accounts).toEqual([]);
    expect(database.loadState<RevenueOpsState>('revenue-ops-india')?.payload.products).toEqual([]);
    expect(database.loadState<RetailWorkspaceModeState>('retail-workspace-mode')?.payload).toMatchObject({
      status: 'configured',
      mode: 'clean',
      seed: 'empty',
    });
  });
});
