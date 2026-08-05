import {
  adoptBootstrapOwnerIdentity,
  createCleanKernelState,
} from '../domain/kernel';
import { createCleanCrmState } from '../domain/crm';
import {
  createCleanPartyState,
} from '../domain/party';
import {
  createCleanCrmDepthState,
} from '../domain/crm-depth';
import { createCleanRetailWorkspaceModeState } from '../domain/retail-workspace-mode';
import {
  createCleanRevenueOpsState,
} from '../domain/revenue-ops';
import type { BootstrapOwnerInput } from '../shared/auth-contracts';
import { PRIMARY_WORKSPACE_ID } from '../shared/workspace-identity';
import type { AuthenticatedSession, AuthService } from './auth-service';
import type {
  BusinessDatabase,
  WorkspaceBootstrapStateDocument,
  WorkspaceStarterMode,
} from './database';
import type { CrmDepthStore } from './crm-depth-store';
import type { CrmStore } from './crm-store';
import type { GeneralLedgerStore } from './general-ledger-store';
import type { KernelStore } from './kernel-store';
import type { PartyStore } from './party-store';
import type { RevenueOpsStore } from './revenue-ops-store';

export { PRIMARY_WORKSPACE_ID } from '../shared/workspace-identity';

export interface WorkspaceStoreHydrator {
  crmStore: Pick<CrmStore, 'initialize'>;
  kernelStore: Pick<KernelStore, 'initialize'>;
  partyStore: Pick<PartyStore, 'initialize'>;
  crmDepthStore: Pick<CrmDepthStore, 'initialize'>;
  revenueOpsStore: Pick<RevenueOpsStore, 'initialize'>;
  generalLedgerStore: Pick<GeneralLedgerStore, 'initialize'>;
}

export interface FreshWorkspaceProvisionResult {
  starterMode: WorkspaceStarterMode;
  authenticated: AuthenticatedSession;
}

function starterModeFrom(input: BootstrapOwnerInput): WorkspaceStarterMode {
  // This is intentionally defensive: an obsolete caller compiled against an
  // older contract cannot resurrect fictional operating data in production.
  void input;
  return 'clean';
}

function createStateDocuments(
  input: BootstrapOwnerInput,
  now: string,
): WorkspaceBootstrapStateDocument[] {
  const kernelBase = createCleanKernelState();
  const kernel = adoptBootstrapOwnerIdentity(
    kernelBase,
    input.email,
    input.displayName,
    now,
  );
  const crm = createCleanCrmState();
  const party = createCleanPartyState();
  const crmDepth = createCleanCrmDepthState();
  const revenueOps = createCleanRevenueOpsState();
  const workspaceMode = createCleanRetailWorkspaceModeState(now, 'empty');

  return [
    {
      namespace: 'kernel',
      schemaVersion: kernel.schemaVersion,
      revision: kernel.revision,
      payload: kernel,
    },
    {
      namespace: 'crm',
      schemaVersion: crm.schemaVersion,
      revision: crm.revision,
      payload: crm,
    },
    {
      namespace: 'party',
      schemaVersion: party.schemaVersion,
      revision: party.revision,
      payload: party,
    },
    {
      namespace: 'crm-depth',
      schemaVersion: crmDepth.schemaVersion,
      revision: crmDepth.revision,
      payload: crmDepth,
    },
    {
      namespace: 'revenue-ops-india',
      schemaVersion: revenueOps.schemaVersion,
      revision: revenueOps.revision,
      payload: revenueOps,
    },
    {
      namespace: 'retail-workspace-mode',
      schemaVersion: workspaceMode.schemaVersion,
      revision: workspaceMode.revision,
      payload: workspaceMode,
    },
  ];
}

/**
 * Orchestrates a fresh owner enrollment without ever allowing half-built
 * state to become visible. The database owns the atomic commit; this service
 * only prepares trusted state and then hydrates the regular stores after a
 * successful commit.
 */
export class WorkspaceProvisioner {
  public constructor(
    private readonly database: BusinessDatabase,
    private readonly authService: AuthService,
    private readonly stores: WorkspaceStoreHydrator,
  ) {}

  public canProvisionFreshWorkspace(): boolean {
    return this.database.canBootstrapFreshWorkspace(PRIMARY_WORKSPACE_ID);
  }

  public async provisionFreshOwner(
    input: BootstrapOwnerInput,
    now = new Date().toISOString(),
  ): Promise<FreshWorkspaceProvisionResult> {
    const starterMode = starterModeFrom(input);
    const prepared = await this.authService.prepareBootstrapOwner(input, now);
    const stateDocuments = createStateDocuments(input, now);

    this.database.bootstrapFreshWorkspace(
      PRIMARY_WORKSPACE_ID,
      {
        starterMode,
        stateDocuments,
        credential: prepared.credential,
        session: prepared.session,
      },
      now,
    );

    await this.hydrateProvisionedStores();
    return { starterMode, authenticated: prepared.authenticated };
  }

  private async hydrateProvisionedStores(): Promise<void> {
    const {
      crmStore,
      kernelStore,
      partyStore,
      crmDepthStore,
      revenueOpsStore,
      generalLedgerStore,
    } = this.stores;
    await Promise.all([
      crmStore.initialize(),
      kernelStore.initialize(),
      partyStore.initialize(),
    ]);
    await crmDepthStore.initialize();
    await revenueOpsStore.initialize();
    await generalLedgerStore.initialize();
  }
}
