import { describe, expect, it } from 'vitest';
import type { CheckoutRetailSaleInput, RetailSale } from '../shared/retail-pos-contracts';
import { createInitialRevenueOpsState } from './revenue-ops';
import { buildRetailHubStoreEdgeSaleEvent, enqueueRetailOfflineSale, planRetailOfflineSync, resolveRetailOfflineSale, syncRetailOfflineQueue, syncRetailOfflineSale } from './retail-offline-sync';

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
  it('projects only completed sale evidence into a checksum-bound Hub event', () => {
    const sale = {
      id: 'sale-001', number: 'INV-001', counterId: 'counter-store', cashierShiftId: 'shift-store', cashierId: 'cashier-1', customerAccountId: 'walk-in', transactionKey: 'POS-OFFLINE-001', requestChecksum: 'a'.repeat(64), saleAt: '2026-07-31T10:00:00.000Z', invoiceId: 'invoice-001', paymentReceiptIds: ['payment-001'], lines: [{ id: 'line-001', itemVariantId: 'variant-tea', catalogProductId: 'product-tea', binId: 'bin-shelf', serialUnitIds: [], description: 'Tea', hsnSac: '0902', quantity: 2, listUnitPrice: 100, unitPrice: 100, taxableValue: 200, gstRate: 5, taxCodeId: 'gst-5', priceListEntryId: 'price-1', discountAmount: 0, cessRate: 0, cessAmount: 0, lineTotal: 210, costValue: 120 }], subtotal: 200, discountTotal: 0, taxPreview: { treatment: 'intra-state', taxableValue: 200, cgst: 5, sgst: 5, igst: 0, totalTax: 10, grandTotal: 210, determination: 'commercial-estimate' }, tenders: [{ id: 'tender-001', method: 'cash', amount: 210, reference: 'CASH-001' }], costTotal: 120, status: 'completed', completedAt: '2026-07-31T10:00:02.000Z', scope: { companyId: 'company-bakaloo', branchId: 'branch-pune' }, version: 1,
    } satisfies RetailSale;
    const event = buildRetailHubStoreEdgeSaleEvent(sale, 7);
    expect(event).toMatchObject({ eventId: 'retail-sale:sale-001:v1', eventType: 'retail.sale.completed', aggregateId: 'sale-001', sequence: 7, payload: { schema: 'epic-bos.retail-sale.v1', saleId: 'sale-001', transactionKey: 'POS-OFFLINE-001' } });
    expect(event.payloadChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(() => buildRetailHubStoreEdgeSaleEvent({ ...sale, status: 'processing' }, 7)).toThrow(/completed/i);
  });

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
