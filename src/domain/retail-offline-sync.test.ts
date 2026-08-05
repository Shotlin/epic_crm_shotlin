import { describe, expect, it } from 'vitest';
import type { CheckoutRetailSaleInput } from '../shared/retail-pos-contracts';
import { createInitialRevenueOpsState } from './revenue-ops';
import { enqueueRetailOfflineSale, planRetailOfflineSync, resolveRetailOfflineSale, syncRetailOfflineQueue, syncRetailOfflineSale } from './retail-offline-sync';

const input = (transactionKey = 'POS-OFFLINE-001'): CheckoutRetailSaleInput => ({
  counterId: 'counter-store',
  cashierShiftId: 'shift-store',
  transactionKey,
  saleAt: '2026-07-31T10:00:00.000Z',
  lines: [{ itemVariantId: 'variant-tea', binId: 'bin-shelf', serialUnitIds: [], quantity: 2 }],
  discountPolicyIds: [],
  tenders: [{ method: 'cash', amount: 200, reference: 'CASH-OFFLINE-001' }],
});

describe('retail offline POS synchronization', () => {
  it('queues an immutable checkout payload idempotently and exposes it as sync-ready', () => {
    let state = createInitialRevenueOpsState();
    state = enqueueRetailOfflineSale(state, input(), 'cashier-1', '2026-07-31T10:01:00.000Z', 'offline-1');
    const revision = state.revision;
    state = enqueueRetailOfflineSale(state, input(), 'cashier-1', '2026-07-31T10:02:00.000Z', 'offline-ignored');

    expect(state.revision).toBe(revision);
    expect(state.retailOfflineSaleQueue).toHaveLength(1);
    expect(state.retailOfflineSaleQueue[0]).toEqual(expect.objectContaining({
      id: 'offline-1',
      status: 'queued',
      transactionKey: 'POS-OFFLINE-001',
      attempts: 0,
      payloadChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(state.retailOfflineSyncReceipts).toEqual([expect.objectContaining({
      queueItemId: 'offline-1',
      status: 'queued',
      actorId: 'cashier-1',
      attempt: 0,
      queueVersion: 1,
      payloadChecksum: state.retailOfflineSaleQueue[0]!.payloadChecksum,
    })]);
    expect(planRetailOfflineSync(state)).toEqual(expect.objectContaining({
      ready: ['offline-1'],
      conflicts: [],
      synced: [],
    }));
  });

  it('fails closed when the same transaction key carries a different offline payload', () => {
    let state = createInitialRevenueOpsState();
    state = enqueueRetailOfflineSale(state, input(), 'cashier-1', '2026-07-31T10:01:00.000Z', 'offline-1');
    expect(() => enqueueRetailOfflineSale(state, { ...input(), tenders: [{ method: 'cash', amount: 201, reference: 'CASH-OFFLINE-001' }] }, 'cashier-1', '2026-07-31T10:02:00.000Z', 'offline-2')).toThrow(/different payload/i);
  });

  it('retains a voucher code and version in the immutable offline payload and rejects a changed replay', () => {
    const voucherInput: CheckoutRetailSaleInput = {
      ...input('POS-OFFLINE-VOUCHER-001'),
      voucherCode: 'monsoon20',
      voucherVersion: 7,
    };
    let state = createInitialRevenueOpsState();
    state = enqueueRetailOfflineSale(state, voucherInput, 'cashier-1', '2026-07-31T10:01:00.000Z', 'offline-voucher');
    const queued = state.retailOfflineSaleQueue[0]!;

    expect(queued.input).toMatchObject({ voucherCode: 'MONSOON20', voucherVersion: 7 });
    expect(() => enqueueRetailOfflineSale(createInitialRevenueOpsState(), { ...voucherInput, voucherVersion: undefined }, 'cashier-1')).toThrow(/voucher code and version/i);

    state = {
      ...state,
      retailOfflineSaleQueue: [{ ...queued, input: { ...queued.input, voucherVersion: 8 } }],
    };
    state = syncRetailOfflineSale(state, { id: 'offline-voucher', expectedVersion: 1 }, 'cashier-1', '2026-07-31T10:03:00.000Z');

    expect(state.retailSales).toHaveLength(0);
    expect(state.retailOfflineSaleQueue[0]).toMatchObject({ status: 'conflict', conflictReason: expect.stringMatching(/checksum|payload/i) });
  });

  it('turns a failed sync into an explicit conflict that can be requeued with evidence', () => {
    let state = createInitialRevenueOpsState();
    state = enqueueRetailOfflineSale(state, input(), 'cashier-1', '2026-07-31T10:01:00.000Z', 'offline-1');
    state = syncRetailOfflineSale(state, { id: 'offline-1', expectedVersion: 1 }, 'cashier-1', '2026-07-31T10:03:00.000Z');
    expect(state.retailOfflineSaleQueue[0]).toEqual(expect.objectContaining({ status: 'conflict', attempts: 1, conflictReason: expect.any(String), version: 3 }));
    expect(() => resolveRetailOfflineSale(state, { id: 'offline-1', resolution: 'requeue', reason: 'Cashier cannot close their own recovery conflict.', recoveryEvidenceReference: 'POWER-FAIL-STORE-001', expectedVersion: 3 }, 'cashier-1', '2026-07-31T10:04:00.000Z')).toThrow(/independent supervisor/i);
    expect(() => resolveRetailOfflineSale(state, { id: 'offline-1', resolution: 'requeue', reason: 'Supervisor reviewed the conflict.', recoveryEvidenceReference: 'short', expectedVersion: 3 }, 'supervisor-1', '2026-07-31T10:04:00.000Z')).toThrow(/recovery evidence/i);
    state = resolveRetailOfflineSale(state, { id: 'offline-1', resolution: 'requeue', reason: 'Stock and shift evidence corrected after store recovery.', recoveryEvidenceReference: 'POWER-FAIL-STORE-001', expectedVersion: 3 }, 'supervisor-1', '2026-07-31T10:04:00.000Z');
    expect(state.retailOfflineSaleQueue[0]).toEqual(expect.objectContaining({ status: 'queued', resolutionReason: expect.stringContaining('Stock'), resolutionEvidenceReference: 'POWER-FAIL-STORE-001', version: 4 }));
    expect(state.retailOfflineSyncReceipts?.map(({ status, actorId, evidenceReference }) => ({ status, actorId, evidenceReference }))).toEqual([
      { status: 'queued', actorId: 'cashier-1', evidenceReference: undefined },
      { status: 'syncing', actorId: 'cashier-1', evidenceReference: undefined },
      { status: 'conflict', actorId: 'cashier-1', evidenceReference: undefined },
      { status: 'requeued', actorId: 'supervisor-1', evidenceReference: 'POWER-FAIL-STORE-001' },
    ]);
  });

  it('runs a bounded background pass only for the active cashier and preserves explicit conflicts', () => {
    let state = createInitialRevenueOpsState();
    state = enqueueRetailOfflineSale(state, input('POS-OFFLINE-A'), 'cashier-1', '2026-07-31T10:01:00.000Z', 'offline-a');
    state = enqueueRetailOfflineSale(state, input('POS-OFFLINE-B'), 'cashier-2', '2026-07-31T10:02:00.000Z', 'offline-b');
    state = syncRetailOfflineQueue(state, { limit: 1 }, 'cashier-1', '2026-07-31T10:03:00.000Z');
    expect(state.retailOfflineSaleQueue.find((item) => item.id === 'offline-a')).toMatchObject({ status: 'conflict', attempts: 1 });
    expect(state.retailOfflineSaleQueue.find((item) => item.id === 'offline-b')).toMatchObject({ status: 'queued', attempts: 0 });
  });

  it('does not post a recovered queue item when its payload no longer matches its checksum', () => {
    let state = createInitialRevenueOpsState();
    state = enqueueRetailOfflineSale(state, input(), 'cashier-1', '2026-07-31T10:01:00.000Z', 'offline-tampered');
    state = { ...state, retailOfflineSaleQueue: [{ ...state.retailOfflineSaleQueue[0]!, input: { ...state.retailOfflineSaleQueue[0]!.input, tenders: [{ method: 'cash', amount: 999, reference: 'CASH-OFFLINE-001' }] } }] };
    state = syncRetailOfflineSale(state, { id: 'offline-tampered', expectedVersion: 1 }, 'cashier-1', '2026-07-31T10:03:00.000Z');
    expect(state.retailSales).toHaveLength(0);
    expect(state.retailOfflineSaleQueue[0]).toMatchObject({ status: 'conflict', attempts: 1, conflictReason: expect.stringMatching(/checksum|payload/i) });
    expect(state.retailOfflineSyncReceipts?.at(-1)).toEqual(expect.objectContaining({ status: 'conflict', reason: expect.stringMatching(/checksum|payload/i) }));
  });

  it('allows an independent supervisor to recover a cashier queue only with evidence', () => {
    let state = createInitialRevenueOpsState();
    state = enqueueRetailOfflineSale(state, input('POS-POWER-FAIL-001'), 'cashier-1', '2026-07-31T10:01:00.000Z', 'offline-recovery');
    expect(() => syncRetailOfflineSale(state, { id: 'offline-recovery', expectedVersion: 1 }, 'supervisor-1', '2026-07-31T10:03:00.000Z')).toThrow(/recovery evidence/i);

    state = syncRetailOfflineSale(state, { id: 'offline-recovery', expectedVersion: 1, recoveryEvidenceReference: 'POWER-FAIL-STORE-001' }, 'supervisor-1', '2026-07-31T10:03:00.000Z');
    expect(state.retailOfflineSaleQueue[0]).toMatchObject({
      status: 'conflict',
      lastSyncActorId: 'supervisor-1',
      lastSyncMode: 'recovery',
      lastSyncEvidenceReference: 'POWER-FAIL-STORE-001',
    });
  });
});
