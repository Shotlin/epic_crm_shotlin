import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../shared/contracts';
import { getIpcAuthorizationPolicy } from './ipc-authorization-policy';
import { projectIpcResponseForPolicy } from './ipc-response-projection';

describe('IPC response projection', () => {
  it('redacts a delegated retail response before it reaches a limited actor', () => {
    const raw = {
      revenue: {
        inventoryItems: [{ id: 'item-1', cost: 100 }],
        payrollCompensations: [{ id: 'comp-1', monthlyBasic: 55_000 }],
      },
    };
    const project = vi.fn((response: typeof raw, actorId: string) => ({
      ...response,
      revenue: {
        ...response.revenue,
        payrollCompensations: [],
        projectedFor: actorId,
      },
    }));

    const result = projectIpcResponseForPolicy(
      IPC_CHANNELS.retailSyncOfflineQueue,
      getIpcAuthorizationPolicy(IPC_CHANNELS.retailSyncOfflineQueue),
      'cashier-limited',
      raw,
      project,
    );

    expect(project).toHaveBeenCalledWith(raw, 'cashier-limited');
    expect(result.revenue.payrollCompensations).toEqual([]);
    expect(result.revenue).toHaveProperty('projectedFor', 'cashier-limited');
  });

  it('does not alter a trusted bootstrap response', () => {
    const raw = { version: '0.1.77' };
    const project = vi.fn((response: typeof raw) => ({ ...response, version: 'redacted' }));

    expect(
      projectIpcResponseForPolicy(
        IPC_CHANNELS.authLogin,
        getIpcAuthorizationPolicy(IPC_CHANNELS.authLogin),
        undefined,
        raw,
        project,
      ),
    ).toEqual(raw);
    expect(project).not.toHaveBeenCalled();
  });
});
