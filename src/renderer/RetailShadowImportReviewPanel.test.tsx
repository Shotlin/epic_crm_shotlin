import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RetailShadowImportReviewPanel } from './RetailShadowImportReviewPanel';

afterEach(() => cleanup());

describe('RetailShadowImportReviewPanel', () => {
  it('previews a Bakaloo export without presenting an import action', async () => {
    const user = userEvent.setup();
    render(<RetailShadowImportReviewPanel />);
    const file = new File([JSON.stringify({ format: 'epic-bos-shadow-import', version: 1, evidence: { source: 'bakaloo', batchId: 'batch-1', observedAt: '2026-08-03T09:00:00Z', cursor: { value: 'orders:1' }, declaredChecksum: 'a'.repeat(64), declaredCounts: { order: 1 }, records: [{ entity: 'order', externalId: 'order-1' }] } })], 'bakaloo.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('shadow-import-file'), file);
    await waitFor(() => expect(screen.getByText('batch-1')).toBeTruthy());
    expect(screen.getByText('Hub verification required')).toBeTruthy();
    expect(screen.getByText('0 mapped')).toBeTruthy();
    expect(screen.getByText('1 require review')).toBeTruthy();
    expect(screen.getByText(/resolve the 1 identity review item/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /import|sync/i })).toBeNull();
  });

  it('surfaces duplicate external identities before Hub registration', async () => {
    const user = userEvent.setup();
    render(<RetailShadowImportReviewPanel />);
    const file = new File([JSON.stringify({ format: 'epic-bos-shadow-import', version: 1, evidence: { source: 'bakaloo', batchId: 'batch-duplicate', observedAt: '2026-08-03T09:00:00Z', cursor: { value: 'orders:2' }, declaredChecksum: 'b'.repeat(64), declaredCounts: { order: 2 }, records: [{ entity: 'order', externalId: 'order-1', epicBosId: 'sale-1' }, { entity: 'order', externalId: 'order-1', epicBosId: 'sale-1' }] } })], 'bakaloo-duplicate.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('shadow-import-file'), file);
    await waitFor(() => expect(screen.getByText('batch-duplicate')).toBeTruthy());
    expect(screen.getByText('2 mapped')).toBeTruthy();
    expect(screen.getByText(/duplicate external identities/)).toBeTruthy();
    expect(screen.getByText(/resolve the 1 identity review item/)).toBeTruthy();
  });

  it('fails closed for a non-Bakaloo export', async () => {
    const user = userEvent.setup();
    render(<RetailShadowImportReviewPanel />);
    const file = new File([JSON.stringify({ format: 'epic-bos-shadow-import', version: 1, evidence: { source: 'other', batchId: 'batch-1', records: [] } })], 'other.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('shadow-import-file'), file);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Bakaloo/));
  });

  it('shows server-owned Hub import readiness without enabling write-back', async () => {
    const user = userEvent.setup();
    const onFetchHubPreflight = async () => ({
      status: 'ready-for-review' as const,
      writeBackAllowed: false as const,
      checks: [{ id: 'plan-integrity', status: 'pass' as const, summary: 'Checksum verified.' }],
      blockers: [],
    });
    render(<RetailShadowImportReviewPanel onFetchHubPreflight={onFetchHubPreflight} />);
    const file = new File([JSON.stringify({ format: 'epic-bos-shadow-import', version: 1, evidence: { source: 'bakaloo', batchId: 'batch-ready', records: [{ entity: 'order', externalId: 'order-1' }] } })], 'bakaloo-ready.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('shadow-import-file'), file);
    await waitFor(() => expect(screen.getByText('batch-ready')).toBeTruthy());
    await user.type(screen.getByLabelText('Retail Hub HTTPS URL'), 'https://hub.example');
    await user.click(screen.getByRole('button', { name: 'Check Hub import readiness' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Retail Hub shadow-import readiness result' }).textContent).toMatch(/ready-for-review/));
    expect(screen.getByText(/write-back disabled/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /execute cutover|import records|sync now/i })).toBeNull();
  });

  it('shows source health and safe pull-receipt evidence', async () => {
    const user = userEvent.setup();
    render(<RetailShadowImportReviewPanel
      onFetchHubSourceStatus={async () => ({ sourceStatus: { status: 'reachable', credentialRevision: 3, checkedAt: '2026-08-06T12:00:00.000Z' }, writeBackAllowed: false })}
      onFetchHubPullReceipts={async () => ({ receipts: [{ id: 'receipt-1', source: 'bakaloo', batchId: 'batch-status', observedAt: '2026-08-06T12:00:00.000Z', registeredAt: '2026-08-06T12:01:00.000Z', pagesFetched: 1, recordsFetched: 2, planChecksum: 'a'.repeat(64), writeBackAllowed: false, version: 1 }], writeBackAllowed: false })}
    />);
    const file = new File([JSON.stringify({ format: 'epic-bos-shadow-import', version: 1, evidence: { source: 'bakaloo', batchId: 'batch-status', records: [{ entity: 'order', externalId: 'order-1' }] } })], 'bakaloo-status.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('shadow-import-file'), file);
    await waitFor(() => expect(screen.getByText('batch-status')).toBeTruthy());
    await user.type(screen.getByLabelText('Retail Hub HTTPS URL'), 'https://hub.example');
    await user.click(screen.getByRole('button', { name: 'Check source health' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Retail Hub source status' }).textContent).toMatch(/reachable/));
    await user.click(screen.getByRole('button', { name: 'Load pull receipts' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Retail Hub pull receipts' }).textContent).toMatch(/2 records evidenced/));
    expect(screen.getByRole('status', { name: 'Retail Hub source status' }).textContent).toMatch(/write-back disabled/);
    expect(screen.getByRole('status', { name: 'Retail Hub pull receipts' }).textContent).toMatch(/write-back disabled/);
  });

  it('shows Store Edge worker health as read-only operational evidence', async () => {
    const user = userEvent.setup();
    render(<RetailShadowImportReviewPanel onFetchHubWorkerMetrics={async () => ({ metrics: { runs: 4, claimed: 12, completed: 10, retryable: 1, deadLetter: 1 }, observedAt: '2026-08-06T12:00:00.000Z', writeBackAllowed: false })} />);
    const file = new File([JSON.stringify({ format: 'epic-bos-shadow-import', version: 1, evidence: { source: 'bakaloo', batchId: 'batch-worker', records: [{ entity: 'order', externalId: 'order-1' }] } })], 'bakaloo-worker.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('shadow-import-file'), file);
    await waitFor(() => expect(screen.getByText('batch-worker')).toBeTruthy());
    await user.type(screen.getByLabelText('Retail Hub HTTPS URL'), 'https://hub.example');
    await user.click(screen.getByRole('button', { name: 'Check Store Edge worker' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Retail Hub Store Edge worker metrics' }).textContent).toMatch(/review required/));
    expect(screen.getByRole('status', { name: 'Retail Hub Store Edge worker metrics' }).textContent).toMatch(/write-back disabled/);
    expect(screen.queryByRole('button', { name: /retry all|replay/i })).toBeNull();
  });
});
