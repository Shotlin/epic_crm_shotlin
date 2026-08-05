import {
  createCleanRetailWorkspaceModeState,
  createUnclassifiedRetailWorkspaceModeState,
  isRetailWorkspaceModeState,
  projectRetailWorkspaceMode,
  transitionRetailWorkspaceMode,
  type RetailWorkspaceModeProjection,
  type RetailWorkspaceModeState,
  type TransitionRetailWorkspaceModeInput,
} from '../domain/retail-workspace-mode';
import type { BusinessDatabase } from './database';

export const RETAIL_WORKSPACE_MODE_NAMESPACE = 'retail-workspace-mode';

const LEGACY_WORKSPACE_NAMESPACES = [
  'kernel',
  'crm',
  'party',
  'crm-depth',
  'revenue-ops-india',
] as const;

/**
 * Owns only the provenance decision. It never imports, deletes, or mutates
 * business records, and keeps unknown legacy data fail-closed.
 */
export class RetailWorkspaceModeStore {
  private state: RetailWorkspaceModeState | null = null;

  public constructor(private readonly database: BusinessDatabase) {}

  public async initialize(now = new Date().toISOString()): Promise<void> {
    const stored = this.database.loadState<RetailWorkspaceModeState>(
      RETAIL_WORKSPACE_MODE_NAMESPACE,
    );
    if (stored && isRetailWorkspaceModeState(stored.payload)) {
      this.state = structuredClone(stored.payload);
      return;
    }

    const hasLegacyWorkspaceState = LEGACY_WORKSPACE_NAMESPACES.some(
      (namespace) => this.database.loadState(namespace) !== null,
    );
    this.state = hasLegacyWorkspaceState
      ? createUnclassifiedRetailWorkspaceModeState(now)
      : createCleanRetailWorkspaceModeState(now);
    this.persist();
  }

  public getProjection(): RetailWorkspaceModeProjection {
    return projectRetailWorkspaceMode(this.requireState());
  }

  public markImported(
    input: Omit<TransitionRetailWorkspaceModeInput, 'mode'>,
    actorId: string,
    now = new Date().toISOString(),
  ): RetailWorkspaceModeProjection {
    return this.transition({ ...input, mode: 'imported' }, actorId, now);
  }

  public markLive(
    input: Omit<TransitionRetailWorkspaceModeInput, 'mode'>,
    actorId: string,
    now = new Date().toISOString(),
  ): RetailWorkspaceModeProjection {
    return this.transition({ ...input, mode: 'live' }, actorId, now);
  }

  private transition(
    input: TransitionRetailWorkspaceModeInput,
    actorId: string,
    now: string,
  ): RetailWorkspaceModeProjection {
    this.state = transitionRetailWorkspaceMode(
      this.requireState(),
      input,
      actorId,
      now,
    );
    this.persist();
    return this.getProjection();
  }

  private persist(): void {
    const state = this.requireState();
    this.database.saveState(
      RETAIL_WORKSPACE_MODE_NAMESPACE,
      state.schemaVersion,
      state.revision,
      state,
    );
  }

  private requireState(): RetailWorkspaceModeState {
    if (!this.state) {
      throw new Error('Retail workspace mode has not been initialized.');
    }
    return this.state;
  }
}
