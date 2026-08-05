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
});
