import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RetailOrderIngestionState } from '../shared/retail-unified-order-contracts';
import { RetailUnifiedOrderInboxPanel } from './RetailUnifiedOrderInboxPanel';

const emptyState = (): RetailOrderIngestionState => ({
  orders: [],
  conflicts: [],
  reservationIntents: [],
  reconciliationRequirements: [],
  hubHandoffs: [],
  fulfilmentHandoffs: [],
  stockReservationExecutions: [],
  pickTaskExecutions: [],
  shipmentPackageExecutions: [],
  dispatchReadinessExecutions: [],
  carrierDispatchExecutions: [],
  deliveryExecutions: [],
  rtoReconciliationExecutions: [],
  returnReconciliationExecutions: [],
  cancellationReconciliationExecutions: [],
  carrierCallbackEvidence: [],
});

const revenueFor = (retailUnifiedOrderIngestion: RetailOrderIngestionState) => ({
  salesOrders: [],
  stockLocations: [],
  warehouseTasks: [],
  shipmentPackages: [],
  deliveryPromises: [],
  carrierAdapters: [],
  retailReturns: [],
  retailCreditNoteReconciliations: [],
  retailUnifiedOrderIngestion,
});

describe('RetailUnifiedOrderInboxPanel', () => {
  afterEach(cleanup);

  it('keeps an empty order scope simple and honest', () => {
    render(<RetailUnifiedOrderInboxPanel revenue={revenueFor(emptyState())} busy={false} activeActorId="store-observer" onIngest={vi.fn()} onPrepareHandoff={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'One queue for every verified order' })).toBeTruthy();
    expect(screen.getByText('No verified order envelopes yet')).toBeTruthy();
    expect(screen.getByText(/never accepts manually typed provider orders/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Store order evidence' })).toBeNull();
  });

  it('renders Hub envelopes read-only and exposes only a checksum-bound local handoff preparation', async () => {
    const user = userEvent.setup();
    const sourceDigest = 'a'.repeat(64);
    const ingestion = emptyState();
    ingestion.orders.push({
      id: 'unified-order-1',
      identityKey: 'website:bakaloo:WEB-1001',
      source: { channel: 'website', connectionId: 'bakaloo-retail-hub' },
      externalOrderId: 'WEB-1001',
      observedStatus: 'received',
      handlingState: 'awaiting-local-handoff',
      currency: 'INR',
      totalAmountPaise: 11800,
      lines: [{ externalLineId: 'line-1', sku: 'BAK-TEA-100', quantity: 1, unitAmountPaise: 11800 }],
      sourceDigest,
      sourceEvents: [{ externalEventId: 'hub-event-1', sourceDigest, occurredAt: '2026-08-04T09:00:00.000Z', observedStatus: 'received', receivedAt: '2026-08-04T09:00:05.000Z' }],
      governedHandoff: { approvedBy: 'retail-reviewer', approvedAt: '2026-08-04T09:01:00.000Z', approvalEvidenceReference: 'LOCAL-REVIEW-1', approvedSourceDigest: sourceDigest },
    });
    const onIngest = vi.fn();
    const onPrepareHubHandoff = vi.fn().mockResolvedValue(undefined);
    const onRecordHubHandoffResult = vi.fn();
    const onRecordCarrierCallback = vi.fn();
    const onConfirmDelivery = vi.fn();

    render(<RetailUnifiedOrderInboxPanel
      revenue={revenueFor(ingestion)}
      busy={false}
      activeActorId="hub-preparer"
      onIngest={onIngest}
      onPrepareHubHandoff={onPrepareHubHandoff}
      onRecordHubHandoffResult={onRecordHubHandoffResult}
      onRecordCarrierCallback={onRecordCarrierCallback}
      onConfirmDelivery={onConfirmDelivery}
    />);

    expect(screen.getByText(/Provider and Hub envelope boundary/i)).toBeTruthy();
    expect(screen.getByText('WEB-1001')).toBeTruthy();
    expect(screen.getByText(/Hub observed status: received/i)).toBeTruthy();
    expect(screen.queryByLabelText('Channel')).toBeNull();
    expect(screen.queryByLabelText('External order ID')).toBeNull();
    expect(screen.queryByLabelText('Event ID')).toBeNull();
    expect(screen.queryByLabelText('Status')).toBeNull();
    expect(screen.queryByLabelText('SKU')).toBeNull();
    expect(screen.queryByLabelText(/Unit price/i)).toBeNull();
    expect(screen.queryByLabelText(/Total/i)).toBeNull();
    expect(screen.queryByText('Record Hub response')).toBeNull();
    expect(screen.queryByText('Record provider callback')).toBeNull();
    expect(screen.queryByText('Confirm delivery')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Prepare Hub envelope' }));
    expect(onPrepareHubHandoff).toHaveBeenCalledWith({ orderId: 'unified-order-1', expectedSourceDigest: sourceDigest });
    expect(onIngest).not.toHaveBeenCalled();
    expect(onRecordHubHandoffResult).not.toHaveBeenCalled();
    expect(onRecordCarrierCallback).not.toHaveBeenCalled();
    expect(onConfirmDelivery).not.toHaveBeenCalled();
  });

  it('exposes cancellation evidence capture without offering a provider-side cancellation action', async () => {
    const user = userEvent.setup();
    const sourceDigest = 'c'.repeat(64);
    const ingestion = emptyState();
    ingestion.orders.push({
      id: 'unified-cancel-1',
      identityKey: 'website:bakaloo:WEB-CANCEL-1',
      source: { channel: 'website', connectionId: 'bakaloo-retail-hub' },
      externalOrderId: 'WEB-CANCEL-1',
      observedStatus: 'cancelled',
      handlingState: 'awaiting-local-handoff',
      currency: 'INR',
      totalAmountPaise: 5000,
      lines: [{ externalLineId: 'line-cancel-1', sku: 'BAK-MILK-1L', quantity: 1, unitAmountPaise: 5000 }],
      sourceDigest,
      sourceEvents: [{ externalEventId: 'hub-cancel-event-1', sourceDigest, occurredAt: '2026-08-04T10:00:00.000Z', observedStatus: 'cancelled', receivedAt: '2026-08-04T10:00:05.000Z' }],
    });
    ingestion.reconciliationRequirements.push({
      id: 'reconciliation-cancel-1',
      orderId: 'unified-cancel-1',
      externalOrderId: 'WEB-CANCEL-1',
      sourceDigest,
      kind: 'cancellation',
      status: 'required',
      actions: ['release-or-confirm-no-stock-reservation', 'reconcile-payment-or-wallet-reversal'],
      requiredAt: '2026-08-04T10:00:05.000Z',
      boundary: 'requires-approved-stock-payment-and-tax-workflows',
    });
    const onReconcileCancellation = vi.fn().mockResolvedValue(undefined);

    render(<RetailUnifiedOrderInboxPanel
      revenue={revenueFor(ingestion)}
      busy={false}
      activeActorId="cancellation-reviewer"
      onIngest={vi.fn()}
      onReconcileCancellation={onReconcileCancellation}
    />);

    expect(screen.getByText('Reconcile cancelled order')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /cancel provider order/i })).toBeNull();
    await user.type(screen.getByLabelText('Stock release / no-reservation evidence'), 'stock-review-cancel-1');
    await user.type(screen.getByLabelText('Payment / wallet reversal evidence'), 'payment-review-cancel-1');
    await user.click(screen.getByRole('button', { name: 'Record cancellation reconciliation' }));
    expect(onReconcileCancellation).toHaveBeenCalledWith({
      orderId: 'unified-cancel-1',
      expectedSourceDigest: sourceDigest,
      stockEvidenceReference: 'stock-review-cancel-1',
      paymentEvidenceReference: 'payment-review-cancel-1',
    });
  });
});
