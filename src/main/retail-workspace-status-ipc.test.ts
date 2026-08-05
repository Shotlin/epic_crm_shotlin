import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS, type RetailWorkspaceStatus } from '../shared/contracts';
import { registerRetailWorkspaceStatusIpc } from './retail-workspace-status-ipc';

describe('retail workspace status IPC', () => {
  it('registers one read-only renderer route and returns only the safe workspace projection', async () => {
    const handlers = new Map<string, (event: IpcMainInvokeEvent) => unknown>();
    const projection: RetailWorkspaceStatus = {
      status: 'configured',
      mode: 'imported',
      dataStatus: 'shadow-imported',
      label: 'Imported - review required',
      description: 'Imported records remain read-only until evidence reconciles.',
      sourceSystem: 'bakaloo',
      evidenceReference: 'SHADOW-IMPORT-42',
      externalWritePolicy: 'blocked',
      requiresReconciliation: true,
      nextAction: 'Review the import before cutover.',
      updatedAt: '2026-08-03T10:00:00.000Z',
    };
    const ipcMain = {
      handle: ((channel: string, handler: (event: IpcMainInvokeEvent) => unknown) => {
        handlers.set(channel, handler);
      }) as IpcMain['handle'],
    } as Pick<IpcMain, 'handle'>;

    registerRetailWorkspaceStatusIpc(ipcMain, {
      getProjection: () => projection,
    });

    expect([...handlers.keys()]).toEqual([IPC_CHANNELS.retailWorkspaceGetStatus]);
    const handler = handlers.get(IPC_CHANNELS.retailWorkspaceGetStatus);
    expect(handler).toBeDefined();
    await expect(
      Promise.resolve(handler!({} as IpcMainInvokeEvent)),
    ).resolves.toEqual(projection);
  });
});
