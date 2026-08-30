import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailGstOverviewPanel } from './RetailGstOverviewPanel';

afterEach(() => cleanup());

describe('RetailGstOverviewPanel', () => {
  it('keeps an empty statutory view honest and makes no portal claim', () => {
    render(<RetailGstOverviewPanel revenue={{ invoices: [], creditDebitNotes: [], gstRegistrations: [] } as Pick<RevenueOpsSnapshot, 'invoices' | 'creditDebitNotes' | 'gstRegistrations'>} onOpenAdvanced={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Keep GST evidence ready. Do not guess portal truth.' })).toBeTruthy();
    expect(screen.getByText(/does not confirm an external portal result/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /file|submit|acknowledge/i })).toBeNull();
  });
});
