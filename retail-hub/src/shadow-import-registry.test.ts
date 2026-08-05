import { describe, expect, it } from 'vitest';

import { buildShadowImportPlan, checksumShadowImportEvidence } from './shadow-import';
import { createShadowImportRegistry } from './shadow-import-registry';

describe('shadow-import registry seam', () => {
  it('serves cloned evidence and prevents duplicate batch identities', () => {
    const plan = verifiedPlan('bakaloo-2026-08-03-001');
    const registry = createShadowImportRegistry([plan]);

    const listed = registry.listPlans();
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toBe(plan);
    expect(registry.getPlan(plan.batch.id)).toMatchObject({ batch: { id: plan.batch.id } });

    expect(() => createShadowImportRegistry([plan, plan])).toThrow(
      'Duplicate shadow-import batch id',
    );
  });

  it('upserts one local evidence plan without exposing a mutable reference', () => {
    const registry = createShadowImportRegistry([verifiedPlan('bakaloo-2026-08-03-001')]);
    const replacement = verifiedPlan('bakaloo-2026-08-03-002');

    registry.replacePlan(replacement);
    expect(registry.listPlans().map((plan) => plan.batch.id)).toEqual([
      'bakaloo-2026-08-03-001',
      'bakaloo-2026-08-03-002',
    ]);

    const fetched = registry.getPlan(replacement.batch.id);
    expect(fetched).toBeDefined();
    if (fetched) {
      fetched.batch.status = 'blocked';
    }
    expect(registry.getPlan(replacement.batch.id)?.batch.status).toBe('ready-for-review');
  });

  it('rejects immutable registration of an existing batch', () => {
    const existing = verifiedPlan('bakaloo-2026-08-03-001');
    const registry = createShadowImportRegistry([existing]);
    expect(() => registry.registerPlan(existing)).toThrow(/already exists/i);
    expect(registry.getPlan(existing.batch.id)?.batch.observedAt).toBe(existing.batch.observedAt);
  });

  it('keeps a blocked checksum plan blocked when it is registered', () => {
    const blocked = buildShadowImportPlan({
      batchId: 'bakaloo-2026-08-03-blocked',
      source: 'bakaloo',
      observedAt: '2026-08-03T10:15:00.000Z',
      cursor: { value: 'orders:blocked', observedAt: '2026-08-03T10:15:00.000Z' },
      declaredCounts: { order: 1 },
      records: [{
        entity: 'order',
        externalId: 'order-blocked',
        epicBosId: 'sales-order-blocked',
        payload: { totalInrMinor: 12500 },
      }],
      declaredChecksum: 'not-the-observed-checksum',
    });
    const registry = createShadowImportRegistry([blocked]);

    expect(registry.getPlan('bakaloo-2026-08-03-blocked')?.batch.status).toBe('blocked');
    expect(registry.getPlan('bakaloo-2026-08-03-blocked')?.reconciliation.status).toBe('blocked');
  });
});

function verifiedPlan(batchId: string) {
  const evidence = {
    batchId,
    source: 'bakaloo' as const,
    observedAt: '2026-08-03T10:15:00.000Z',
    cursor: { value: `orders:${batchId}`, observedAt: '2026-08-03T10:15:00.000Z' },
    declaredCounts: { order: 1 },
    records: [{
      entity: 'order' as const,
      externalId: `${batchId}-order`,
      epicBosId: `${batchId}-sales-order`,
      payload: { totalInrMinor: 12500 },
    }],
  };
  return buildShadowImportPlan({
    ...evidence,
    declaredChecksum: checksumShadowImportEvidence(evidence),
  });
}
