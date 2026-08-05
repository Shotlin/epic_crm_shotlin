import { describe, expect, it } from 'vitest';
import { collectShadowImportEvidence, type ShadowImportSourceAdapter, type ShadowImportSourcePage } from './shadow-import-source-adapter';

const page = (cursor: string, done: boolean, records: ShadowImportSourcePage['records'], nextCursor?: string): ShadowImportSourcePage => ({
  cursor: { value: cursor, observedAt: '2026-08-04T09:00:00.000Z' },
  observedAt: '2026-08-04T09:00:00.000Z',
  records,
  declaredCounts: { customer: 2 },
  nextCursor: nextCursor ? { value: nextCursor, observedAt: '2026-08-04T09:00:00.000Z' } : undefined,
  done,
});

describe('server-side Bakaloo shadow-import source adapter', () => {
  it('pulls bounded pages and produces the existing reconciled review plan', async () => {
    const calls: Array<string | undefined> = [];
    const adapter: ShadowImportSourceAdapter = {
      source: 'bakaloo',
      async pullPage(input) {
        calls.push(input.cursor);
        return input.cursor === undefined
          ? page('cursor-1', false, [{ entity: 'customer', externalId: 'customer-1', epicBosId: 'party-1', payload: { name: 'Asha' } }], 'cursor-2')
          : page('cursor-2', true, [{ entity: 'customer', externalId: 'customer-2', epicBosId: 'party-2', payload: { name: 'Ravi' } }]);
      },
    };
    const result = await collectShadowImportEvidence(adapter, { batchId: 'batch-pull-1', observedAt: '2026-08-04T09:00:00.000Z' });
    expect(calls).toEqual([undefined, 'cursor-2']);
    expect(result).toMatchObject({ pagesFetched: 2, recordsFetched: 2, plan: { batch: { status: 'ready-for-review' }, reconciliation: { status: 'reconciled' } } });
    expect(result.evidence.declaredChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.evidence.records).toHaveLength(2);
  });

  it('fails closed when the source does not advance its cursor or declare totals', async () => {
    const stalled: ShadowImportSourceAdapter = { source: 'bakaloo', async pullPage(input) { return page(input.cursor ?? 'cursor-1', false, [], 'cursor-1'); } };
    await expect(collectShadowImportEvidence(stalled, { batchId: 'batch-stalled', observedAt: '2026-08-04T09:00:00.000Z' })).rejects.toThrow(/did not advance|next cursor/i);
    const noTotals: ShadowImportSourceAdapter = { source: 'bakaloo', async pullPage() { return { ...page('cursor-1', true, []), declaredCounts: undefined }; } };
    await expect(collectShadowImportEvidence(noTotals, { batchId: 'batch-no-totals', observedAt: '2026-08-04T09:00:00.000Z' })).rejects.toThrow(/declared snapshot totals/i);
  });

  it('rejects credential-like payload keys and bounded-limit violations before planning', async () => {
    const unsafe: ShadowImportSourceAdapter = { source: 'bakaloo', async pullPage() { return page('cursor-1', true, [{ entity: 'customer', externalId: 'customer-1', epicBosId: 'party-1', payload: { apiKey: 'never-store' } }]); } };
    await expect(collectShadowImportEvidence(unsafe, { batchId: 'batch-unsafe', observedAt: '2026-08-04T09:00:00.000Z' })).rejects.toThrow(/credential-like/i);
    const endless: ShadowImportSourceAdapter = { source: 'bakaloo', async pullPage(input) { const cursor = input.cursor ? `${input.cursor}-next` : 'cursor-1'; return page(cursor, false, [], `${cursor}-next`); } };
    await expect(collectShadowImportEvidence(endless, { batchId: 'batch-limit', observedAt: '2026-08-04T09:00:00.000Z', maxPages: 2 })).rejects.toThrow(/page safety limit/i);
  });
});
