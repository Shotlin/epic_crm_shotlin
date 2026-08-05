import { describe, expect, it } from 'vitest';

import { buildShadowImportPlan, checksumShadowImportEvidence } from './shadow-import';

describe('Bakaloo shadow-import contract', () => {
  it('creates a read-only, checksum-verified import batch with mappings and reconciliation evidence', () => {
    const evidence = {
      batchId: 'bakaloo-2026-08-03-001',
      source: 'bakaloo' as const,
      observedAt: '2026-08-03T10:15:00.000Z',
      cursor: {
        value: 'orders:0000042',
        observedAt: '2026-08-03T10:15:00.000Z',
      },
      declaredCounts: { order: 1, customer: 1 },
      records: [
        {
          entity: 'customer' as const,
          externalId: 'customer_42',
          epicBosId: 'party-42',
          payload: { phone: '+919999999999' },
        },
        {
          entity: 'order' as const,
          externalId: 'order_42',
          epicBosId: 'sales-order-42',
          payload: { totalInrMinor: 12500 },
        },
      ],
    };

    const plan = buildShadowImportPlan({
      ...evidence,
      declaredChecksum: checksumShadowImportEvidence(evidence),
    });

    expect(plan.batch).toMatchObject({
      id: 'bakaloo-2026-08-03-001',
      source: 'bakaloo',
      mode: 'shadow-read-only',
      writeBackAllowed: false,
      integrity: { checksumVerified: true },
    });
    expect(plan.externalIdMaps).toEqual([
      expect.objectContaining({ externalId: 'customer_42', epicBosId: 'party-42' }),
      expect.objectContaining({ externalId: 'order_42', epicBosId: 'sales-order-42' }),
    ]);
    expect(plan.cursors).toEqual([
      expect.objectContaining({ value: 'orders:0000042', source: 'bakaloo' }),
    ]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.reconciliation).toMatchObject({
      status: 'reconciled',
      entities: [
        expect.objectContaining({ entity: 'customer', declared: 1, observed: 1, variance: 0 }),
        expect.objectContaining({ entity: 'order', declared: 1, observed: 1, variance: 0 }),
      ],
    });
  });

  it('blocks a batch with an incorrect source checksum instead of treating it as imported data', () => {
    const plan = buildShadowImportPlan({
      batchId: 'bakaloo-2026-08-03-002',
      source: 'bakaloo',
      observedAt: '2026-08-03T10:20:00.000Z',
      cursor: { value: 'orders:0000043', observedAt: '2026-08-03T10:20:00.000Z' },
      declaredCounts: { order: 1 },
      records: [{
        entity: 'order',
        externalId: 'order_43',
        epicBosId: 'sales-order-43',
        payload: { totalInrMinor: 9900 },
      }],
      declaredChecksum: 'source-checksum-that-does-not-match',
    });

    expect(plan.batch).toMatchObject({
      status: 'blocked',
      integrity: { checksumVerified: false },
    });
    expect(plan.reconciliation.status).toBe('blocked');
    expect(plan.conflicts).toEqual([
      expect.objectContaining({ kind: 'checksum-mismatch', status: 'open' }),
    ]);
  });
});
