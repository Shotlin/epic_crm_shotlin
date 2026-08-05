import { describe, expect, it } from 'vitest';
import { createShadowImportRegistry } from './shadow-import-registry';
import { pullAndRegisterShadowImport } from './shadow-import-pull-runtime';
import type { ShadowImportSourceAdapter } from './shadow-import-source-adapter';

function adapter(batchId: string): ShadowImportSourceAdapter {
  return {
    source: 'bakaloo',
    credentialRevision: 7,
    async pullPage() {
      return {
        cursor: { value: `${batchId}:final`, observedAt: '2026-08-04T10:00:00.000Z' },
        observedAt: '2026-08-04T10:00:00.000Z',
        declaredCounts: { customer: 1 },
        records: [{ entity: 'customer', externalId: `${batchId}:customer`, epicBosId: 'party-1', payload: { name: 'Asha' } }],
        done: true,
      };
    },
  };
}

describe('server-side shadow-import pull runtime', () => {
  it('registers a bounded checksummed plan only after the complete pull succeeds', async () => {
    const registry = createShadowImportRegistry();
    const result = await pullAndRegisterShadowImport(adapter('batch-runtime-1'), registry, { batchId: 'batch-runtime-1', observedAt: '2026-08-04T10:00:00.000Z' }, '2026-08-04T10:01:00Z');
    expect(result).toMatchObject({ pagesFetched: 1, recordsFetched: 1, registeredAt: '2026-08-04T10:01:00.000Z', plan: { batch: { id: 'batch-runtime-1', credentialRevision: 7, writeBackAllowed: false } } });
    expect(registry.listPlans()).toHaveLength(1);
  });

  it('never overwrites an existing batch and leaves the registry unchanged on duplicate pulls', async () => {
    const registry = createShadowImportRegistry();
    await pullAndRegisterShadowImport(adapter('batch-runtime-2'), registry, { batchId: 'batch-runtime-2', observedAt: '2026-08-04T10:00:00.000Z' });
    let pullCalls = 0;
    const duplicateAdapter = { ...adapter('batch-runtime-2'), pullPage: async () => { pullCalls += 1; return adapter('batch-runtime-2').pullPage({}); } };
    await expect(pullAndRegisterShadowImport(duplicateAdapter, registry, { batchId: 'batch-runtime-2', observedAt: '2026-08-04T10:05:00.000Z' })).rejects.toThrow(/already exists|new batch ID/i);
    expect(pullCalls).toBe(0);
    expect(registry.listPlans()).toHaveLength(1);
    expect(registry.getPlan('batch-runtime-2')?.batch.observedAt).toBe('2026-08-04T10:00:00.000Z');
  });

  it('rejects invalid registration timestamps before any success is reported', async () => {
    const registry = createShadowImportRegistry();
    await expect(pullAndRegisterShadowImport(adapter('batch-runtime-3'), registry, { batchId: 'batch-runtime-3', observedAt: '2026-08-04T10:00:00.000Z' }, 'not-a-timestamp')).rejects.toThrow(/registration time/i);
    expect(registry.listPlans()).toHaveLength(0);
  });
});
