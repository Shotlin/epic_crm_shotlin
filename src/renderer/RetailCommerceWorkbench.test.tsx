import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import { RetailCommerceWorkbench } from './RetailCommerceWorkbench';

const generatedAt = '2026-08-04T10:00:00.000Z';

function emptyRevenue() {
  return getRevenueOpsSnapshot(
    createInitialRevenueOpsState(),
    { opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [] },
    generatedAt,
  );
}

afterEach(() => cleanup());

describe('RetailCommerceWorkbench production boundary', () => {
  it('shows an honest read-only commerce boundary instead of demo values or direct provider writes', () => {
    const onCreateOcr = vi.fn();
    const onCreateConnector = vi.fn();
    const onImportOrder = vi.fn();
    const onCreateSettlement = vi.fn();

    render(
      <RetailCommerceWorkbench
        revenue={emptyRevenue()}
        busy={false}
        activeActorId="operator-1"
        onCreateOcr={onCreateOcr}
        onCreateConnector={onCreateConnector}
        onImportOrder={onImportOrder}
        onCreateSettlement={onCreateSettlement}
      />,
    );

    expect(screen.getByRole('heading', { name: 'External commerce status' })).toBeTruthy();
    expect(screen.getByText(/provider and hub responses are the only source for external orders/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /capture OCR|register connector|import order|capture settlement|resolve variance/i })).toBeNull();
    expect(screen.queryByDisplayValue('ONDC-SELLER')).toBeNull();
    expect(screen.queryByDisplayValue('REMOTE-100')).toBeNull();
    expect(screen.queryByDisplayValue('SETTLE-100')).toBeNull();
    expect(onCreateOcr).not.toHaveBeenCalled();
    expect(onCreateConnector).not.toHaveBeenCalled();
    expect(onImportOrder).not.toHaveBeenCalled();
    expect(onCreateSettlement).not.toHaveBeenCalled();
  });
});
