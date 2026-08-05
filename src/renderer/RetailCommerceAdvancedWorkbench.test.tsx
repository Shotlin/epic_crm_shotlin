import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { RetailCommercePushBatch } from '../shared/retail-commerce-contracts';
import { RetailCommerceAdvancedWorkbench } from './RetailCommerceAdvancedWorkbench';

const generatedAt = '2026-08-04T10:00:00.000Z';

function revenueWithPreparedPush() {
  const revenue = getRevenueOpsSnapshot(
    createInitialRevenueOpsState(),
    { opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [] },
    generatedAt,
  );
  const preparedPush: RetailCommercePushBatch = {
    id: 'push-1',
    number: 'PUSH-0001',
    connectorId: 'connector-1',
    kind: 'catalog',
    records: [],
    payloadChecksum: 'a'.repeat(64),
    status: 'prepared',
    requestedBy: 'other-user',
    requestedAt: generatedAt,
    version: 1,
  };
  revenue.retailCommercePushBatches = [preparedPush];
  return revenue;
}

beforeEach(() => {
  Object.assign(window, {
    epicBos: {
      integration: { getRetailCertificationPack: async () => null },
    },
  });
});

afterEach(() => cleanup());

describe('RetailCommerceAdvancedWorkbench external provider boundary', () => {
  it('does not let the renderer send a prepared marketplace payload or manufacture its acknowledgement', () => {
    const executePush = vi.fn();

    render(
      <RetailCommerceAdvancedWorkbench
        revenue={revenueWithPreparedPush()}
        busy={false}
        activeActorId="operator-1"
        onExecutePushBatch={executePush}
      />,
    );

    expect(screen.queryByRole('button', { name: /send live push/i })).toBeNull();
    expect(screen.getByText(/certified provider adapter.*authoritative/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /record received provider response/i })).toBeTruthy();
    expect(executePush).not.toHaveBeenCalled();
  });
});
