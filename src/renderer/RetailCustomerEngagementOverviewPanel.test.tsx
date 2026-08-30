import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CrmDepthSnapshot } from '../shared/crm-depth-contracts';
import { RetailCustomerEngagementOverviewPanel } from './RetailCustomerEngagementOverviewPanel';

afterEach(() => cleanup());

const emptyDepth = {
  campaigns: [],
  importJobs: [],
  adapters: [],
  communications: [],
  metrics: { activeCampaigns: 0, importExceptions: 0, communicationCoverage: 0 },
} as Pick<CrmDepthSnapshot, 'campaigns' | 'importJobs' | 'adapters' | 'communications' | 'metrics'>;

describe('RetailCustomerEngagementOverviewPanel', () => {
  it('keeps campaign work consent-led and read-first', () => {
    render(<RetailCustomerEngagementOverviewPanel mode="campaigns" depth={emptyDepth} onOpenAdvanced={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Reach customers only when their permission says you can.' })).toBeTruthy();
    expect(screen.getByText(/does not send a message, enrol a customer, or change consent/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /send|launch|create campaign/i })).toBeNull();
  });

  it('keeps data quality review read-only before the governed import desk', () => {
    render(<RetailCustomerEngagementOverviewPanel mode="data-quality" depth={emptyDepth} onOpenAdvanced={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Keep customer records clean before they reach the counter.' })).toBeTruthy();
    expect(screen.getByText(/does not import, merge, or alter a customer record/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /commit import|merge records/i })).toBeNull();
  });
});
