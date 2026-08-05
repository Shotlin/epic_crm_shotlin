import type { IpcMain } from 'electron';
import {
  IPC_CHANNELS,
  type RetailWorkspaceStatus,
} from '../shared/contracts';

/**
 * The renderer may see a workspace's provenance decision, but never the
 * underlying provider credentials, payloads, or customer records. The caller
 * supplies the policy-aware IPC registrar, so authentication and RBAC are
 * enforced before this read-only projection is reached.
 */
export function registerRetailWorkspaceStatusIpc(
  ipcMain: Pick<IpcMain, 'handle'>,
  workspaceModeStore: {
    getProjection: () => RetailWorkspaceStatus;
  },
): void {
  ipcMain.handle(IPC_CHANNELS.retailWorkspaceGetStatus, () =>
    workspaceModeStore.getProjection(),
  );
}
