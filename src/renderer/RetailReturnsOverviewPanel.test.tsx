import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailReturnsOverviewPanel } from './RetailReturnsOverviewPanel';

afterEach(() => cleanup());

describe('RetailReturnsOverviewPanel', () => {
  it('shows an honest empty return queue and keeps controls in the governed desk', () => {
    render(<RetailReturnsOverviewPanel revenue={{ retailReturns: [] } as Pick<RevenueOpsSnapshot, 'retailReturns'>} onOpenAdvanced={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Resolve a return without losing the original sale.' })).toBeTruthy();
    expect(screen.getByText('No retail return is open')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /approve|refund|inspect/i })).toBeNull();
  });
});
