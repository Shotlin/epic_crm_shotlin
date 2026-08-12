import { CheckCircle2, CircleAlert, Inbox, Link2, ShieldCheck } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type {
  CompleteRetailUnifiedOrderPickTasksInput,
  CompleteRetailUnifiedOrderShipmentPackageInput,
  ConfirmRetailUnifiedOrderDeliveryInput,
  CreateRetailUnifiedOrderPickTasksInput,
  CreateRetailUnifiedOrderShipmentPackageInput,
  DecideRetailOrderFulfilmentHandoffInput,
  DispatchRetailUnifiedOrderInput,
  IngestRetailOrderSourceEventInput,
  PrepareRetailOrderFulfilmentHandoffInput,
  PrepareRetailOrderGovernedHandoffInput,
  PrepareRetailOrderHubHandoffInput,
  PrepareRetailUnifiedOrderDispatchInput,
  ReconcileRetailUnifiedOrderReturnInput,
  ReconcileRetailUnifiedOrderRtoInput,
  ReconcileRetailUnifiedOrderCancellationInput,
  RecordRetailOrderHubHandoffResultInput,
  RecordRetailUnifiedOrderCarrierCallbackInput,
  ReserveRetailUnifiedOrderStockInput,
} from '../shared/retail-unified-order-contracts';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export interface RetailUnifiedOrderInboxPanelProps {
  revenue: Pick<RevenueOpsSnapshot, 'retailUnifiedOrderIngestion' | 'salesOrders' | 'stockLocations' | 'warehouseTasks' | 'shipmentPackages' | 'deliveryPromises' | 'carrierAdapters' | 'retailReturns' | 'retailCreditNoteReconciliations'>;
  busy: boolean;
  activeActorId: string;
  /** Retained for the main-process contract. The renderer intentionally never calls it. */
  onIngest?: (input: IngestRetailOrderSourceEventInput) => Promise<void>;
  onPrepareHandoff?: (input: PrepareRetailOrderGovernedHandoffInput) => Promise<void>;
  onPrepareHubHandoff?: (input: PrepareRetailOrderHubHandoffInput) => Promise<void>;
  /** Retained for the Hub adapter boundary. The renderer intentionally never calls it. */
  onRecordHubHandoffResult?: (input: RecordRetailOrderHubHandoffResultInput) => Promise<void>;
  onPrepareFulfilmentHandoff?: (input: PrepareRetailOrderFulfilmentHandoffInput) => Promise<void>;
  onDecideFulfilmentHandoff?: (input: DecideRetailOrderFulfilmentHandoffInput) => Promise<void>;
  /** Retained for governed warehouse workbenches. The renderer intentionally never calls it. */
  onReserveFulfilmentStock?: (input: ReserveRetailUnifiedOrderStockInput) => Promise<void>;
  onCreatePickTasks?: (input: CreateRetailUnifiedOrderPickTasksInput) => Promise<void>;
  onCompletePickTasks?: (input: CompleteRetailUnifiedOrderPickTasksInput) => Promise<void>;
  onCreateShipmentPackage?: (input: CreateRetailUnifiedOrderShipmentPackageInput) => Promise<void>;
  onCompleteShipmentPackage?: (input: CompleteRetailUnifiedOrderShipmentPackageInput) => Promise<void>;
  onPrepareDispatch?: (input: PrepareRetailUnifiedOrderDispatchInput) => Promise<void>;
  onDispatch?: (input: DispatchRetailUnifiedOrderInput) => Promise<void>;
  /** Retained for a future signed delivery-evidence adapter. The renderer intentionally never calls it. */
  onConfirmDelivery?: (input: ConfirmRetailUnifiedOrderDeliveryInput) => Promise<void>;
  onReconcileRto?: (input: ReconcileRetailUnifiedOrderRtoInput) => Promise<void>;
  onReconcileCancellation?: (input: ReconcileRetailUnifiedOrderCancellationInput) => Promise<void>;
  onReconcileReturn?: (input: ReconcileRetailUnifiedOrderReturnInput) => Promise<void>;
  /** Retained for the carrier callback adapter boundary. The renderer intentionally never calls it. */
  onRecordCarrierCallback?: (input: RecordRetailUnifiedOrderCarrierCallbackInput) => Promise<void>;
}

type LocalDraft = {
  approvalEvidence: string;
  mappingEvidence: string;
  salesOrderId: string;
  decision: DecideRetailOrderFulfilmentHandoffInput['decision'];
  decisionRemarks: string;
  cancellationStockEvidence: string;
  cancellationPaymentEvidence: string;
};

const emptyLocalDraft = (): LocalDraft => ({
  approvalEvidence: '',
  mappingEvidence: '',
  salesOrderId: '',
  decision: 'approved',
  decisionRemarks: '',
  cancellationStockEvidence: '',
  cancellationPaymentEvidence: '',
});

/**
 * Read-only projection of Retail Hub envelopes plus the few local, governed
 * preparation steps that Electron can safely perform. Provider facts enter
 * through a signed Hub/adapter envelope only; they cannot be typed here.
 */
export function RetailUnifiedOrderInboxPanel({
  revenue,
  busy,
  activeActorId,
  onPrepareHandoff,
  onPrepareHubHandoff,
  onPrepareFulfilmentHandoff,
  onDecideFulfilmentHandoff,
  onReconcileCancellation,
}: RetailUnifiedOrderInboxPanelProps): ReactNode {
  const [drafts, setDrafts] = useState<Record<string, LocalDraft>>({});
  const state = revenue.retailUnifiedOrderIngestion ?? {
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
  };
  const activeSalesOrders = useMemo(
    () => revenue.salesOrders.filter((order) => !['cancelled', 'completed'].includes(order.status)),
    [revenue.salesOrders],
  );
  const orders = useMemo(() => [...state.orders].slice(0, 24), [state.orders]);

  const updateDraft = (orderId: string, update: Partial<LocalDraft>): void => {
    setDrafts((current) => ({
      ...current,
      [orderId]: { ...(current[orderId] ?? emptyLocalDraft()), ...update },
    }));
  };

  return <section className="retail-unified-order-inbox" data-testid="retail-unified-order-inbox" aria-labelledby="retail-unified-order-inbox-title">
    <header className="retail-unified-order-inbox__header">
      <div>
        <span className="eyebrow"><Inbox size={14} aria-hidden="true" /> Deliver / unified orders</span>
        <h2 id="retail-unified-order-inbox-title">One queue for every verified order</h2>
        <p>Website, app, WhatsApp, ONDC, marketplace, and carrier facts are read from immutable Retail Hub envelopes. This desktop screen cannot create or alter those facts.</p>
      </div>
      <div className="retail-unified-order-inbox__guard" aria-label="Retail Hub is authoritative">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>Hub authoritative</span>
        <small>No manual provider write</small>
      </div>
    </header>

    <div className="retail-unified-order-inbox__metrics" aria-label="Unified order evidence summary">
      <div><span>Orders observed</span><strong>{state.orders.length}</strong><small>Hub-envelope records</small></div>
      <div data-alert={state.conflicts.length > 0}><span>Open conflicts</span><strong>{state.conflicts.length}</strong><small>{state.conflicts.length ? 'review before local handoff' : 'nothing blocked'}</small></div>
      <div><span>Local stock queue</span><strong>{state.reservationIntents.filter((item) => item.status === 'pending').length}</strong><small>governed requests only</small></div>
      <div data-alert={state.hubHandoffs.some((item) => item.status === 'prepared' || item.status === 'retryable')}><span>Hub outbox</span><strong>{state.hubHandoffs.filter((item) => item.status === 'prepared' || item.status === 'retryable').length}</strong><small>awaiting Hub adapter result</small></div>
    </div>

    <aside className="retail-unified-order-inbox__hub" aria-label="Provider and Hub boundary">
      <div>
        <strong>Provider and Hub envelope boundary</strong>
        <small>Order IDs, status, SKU lines, prices, timestamps, payment, callback, and delivery outcomes arrive only through a verified Hub/provider envelope. A local operator may prepare an internal approval or a local sales-order mapping, but cannot type an external outcome.</small>
      </div>
      <span className="retail-unified-order-inbox__pending">Read-only external facts</span>
    </aside>

    <div className="retail-unified-order-inbox__list" aria-label="Verified order records">
      {orders.length ? orders.map((order) => {
        const draft = drafts[order.id] ?? emptyLocalDraft();
        const hubHandoff = state.hubHandoffs.find((candidate) => candidate.orderId === order.id && candidate.sourceDigest === order.sourceDigest);
        const fulfilmentHandoff = state.fulfilmentHandoffs.find((candidate) => candidate.orderId === order.id && candidate.sourceDigest === order.sourceDigest);
        const stockExecution = state.stockReservationExecutions.find((candidate) => candidate.orderId === order.id && candidate.sourceDigest === order.sourceDigest && candidate.status === 'completed');
        const pickExecution = state.pickTaskExecutions.find((candidate) => candidate.orderId === order.id && candidate.sourceDigest === order.sourceDigest);
        const packageExecution = state.shipmentPackageExecutions.find((candidate) => candidate.orderId === order.id && candidate.sourceDigest === order.sourceDigest);
        const dispatchExecution = state.dispatchReadinessExecutions.find((candidate) => candidate.orderId === order.id && candidate.sourceDigest === order.sourceDigest);
        const carrierDispatchExecution = state.carrierDispatchExecutions.find((candidate) => candidate.orderId === order.id && candidate.sourceDigest === order.sourceDigest);
        const deliveryExecution = state.deliveryExecutions.find((candidate) => candidate.orderId === order.id && candidate.sourceDigest === order.sourceDigest);
        const rtoExecution = state.rtoReconciliationExecutions.find((candidate) => candidate.orderId === order.id && candidate.sourceDigest === order.sourceDigest);
        const returnExecution = state.returnReconciliationExecutions.find((candidate) => candidate.orderId === order.id && candidate.sourceDigest === order.sourceDigest);
        const cancellationExecution = state.cancellationReconciliationExecutions.find((candidate) => candidate.orderId === order.id && candidate.sourceDigest === order.sourceDigest);
        const latestSourceEvent = [...order.sourceEvents].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))[0];
        const latestCarrierCallback = (state.carrierCallbackEvidence ?? [])
          .filter((candidate) => candidate.orderId === order.id && candidate.sourceDigest === order.sourceDigest)
          .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))[0];
        const localStatus = [
          stockExecution ? 'stock reserved' : undefined,
          pickExecution ? `pick ${pickExecution.status}` : undefined,
          packageExecution ? `package ${packageExecution.status}` : undefined,
          dispatchExecution ? 'dispatch ready' : undefined,
          carrierDispatchExecution ? 'local carrier custody recorded' : undefined,
          deliveryExecution ? 'local delivery closure recorded' : undefined,
          rtoExecution ? 'RTO reconciliation recorded' : undefined,
          returnExecution ? 'return reconciliation recorded' : undefined,
          cancellationExecution ? 'cancellation reconciliation recorded' : undefined,
        ].filter((item): item is string => Boolean(item));

        return <article key={order.id} className="retail-unified-order-inbox__order">
          <div className="retail-unified-order-inbox__order-main">
            <div>
              <span className="retail-unified-order-inbox__channel">{order.source.channel} / {order.source.connectionId}</span>
              <strong>{order.externalOrderId}</strong>
              <small>Hub observed status: {order.observedStatus} / local state: {order.handlingState}</small>
            </div>
            <b>{order.currency === 'INR' ? inr.format(order.totalAmountPaise / 100) : `${order.currency} ${(order.totalAmountPaise / 100).toLocaleString('en-IN')}`}</b>
          </div>

          <div className="retail-unified-order-inbox__order-meta">
            <span>Envelope checksum {order.sourceDigest.slice(0, 12)}...</span>
            <span>{order.lines.length} verified line{order.lines.length === 1 ? '' : 's'}</span>
            {latestSourceEvent ? <span>Last Hub receipt {latestSourceEvent.receivedAt}</span> : <span>Awaiting source receipt metadata</span>}
            {order.governedHandoff
              ? <span className="retail-unified-order-inbox__approved"><CheckCircle2 size={13} aria-hidden="true" /> local handoff approved by {order.governedHandoff.approvedBy}</span>
              : <span className="retail-unified-order-inbox__pending"><CircleAlert size={13} aria-hidden="true" /> local handoff awaits review</span>}
          </div>

          <div className="retail-unified-order-inbox__source-lines" aria-label={`Verified items for ${order.externalOrderId}`}>
            {order.lines.map((line) => <span key={line.externalLineId}>{line.sku} x {line.quantity} / {inr.format(line.unitAmountPaise / 100)}</span>)}
          </div>

          {order.observedStatus === 'cancelled' && !cancellationExecution && onReconcileCancellation ? <form className="retail-unified-order-inbox__handoff retail-unified-order-inbox__hub" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!draft.cancellationStockEvidence.trim() || !draft.cancellationPaymentEvidence.trim()) return;
            await onReconcileCancellation({
              orderId: order.id,
              expectedSourceDigest: order.sourceDigest,
              stockEvidenceReference: draft.cancellationStockEvidence.trim(),
              paymentEvidenceReference: draft.cancellationPaymentEvidence.trim(),
            });
            updateDraft(order.id, { cancellationStockEvidence: '', cancellationPaymentEvidence: '' });
          }}>
            <div><strong>Reconcile cancelled order</strong><small>Link proof that stock was released or never reserved and that payment/wallet reversal was handled. This local evidence does not cancel the provider order again.</small></div>
            <label htmlFor={`cancellation-stock-${order.id}`}>Stock release / no-reservation evidence<input id={`cancellation-stock-${order.id}`} value={draft.cancellationStockEvidence} onChange={(event) => updateDraft(order.id, { cancellationStockEvidence: event.target.value })} placeholder="Stock evidence reference" required /></label>
            <label htmlFor={`cancellation-payment-${order.id}`}>Payment / wallet reversal evidence<input id={`cancellation-payment-${order.id}`} value={draft.cancellationPaymentEvidence} onChange={(event) => updateDraft(order.id, { cancellationPaymentEvidence: event.target.value })} placeholder="Payment evidence reference" required /></label>
            <button className="button button--quiet" type="submit" disabled={busy}><CheckCircle2 size={14} aria-hidden="true" /> Record cancellation reconciliation</button>
          </form> : null}
          {cancellationExecution ? <div className="retail-unified-order-inbox__approved"><CheckCircle2 size={13} aria-hidden="true" /> Cancellation reconciled by {cancellationExecution.reconciledBy} / stock {cancellationExecution.stockEvidenceReference} / payment {cancellationExecution.paymentEvidenceReference}</div> : null}

          {hubHandoff ? <div className={hubHandoff.status === 'acknowledged' ? 'retail-unified-order-inbox__approved' : 'retail-unified-order-inbox__pending'}>
            <Link2 size={13} aria-hidden="true" /> Hub envelope: {hubHandoff.status} / attempt {hubHandoff.attempt}
            {hubHandoff.responseReference ? <small>Inbound adapter receipt {hubHandoff.responseReference} / checksum {hubHandoff.responseChecksum?.slice(0, 12)}...</small> : <small>Awaiting an adapter-recorded Hub result. This Electron screen cannot record one.</small>}
          </div> : null}

          {!order.governedHandoff && onPrepareHandoff ? <form className="retail-unified-order-inbox__handoff" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!draft.approvalEvidence.trim()) return;
            await onPrepareHandoff({
              orderId: order.id,
              expectedSourceDigest: order.sourceDigest,
              approvalEvidenceReference: draft.approvalEvidence.trim(),
            });
            updateDraft(order.id, { approvalEvidence: '' });
          }}>
            <div><strong>Prepare local handoff</strong><small>Reference an internal review record only. This does not acknowledge, accept, cancel, or edit the external order.</small></div>
            <label htmlFor={`local-approval-${order.id}`}>Internal review reference<input id={`local-approval-${order.id}`} value={draft.approvalEvidence} onChange={(event) => updateDraft(order.id, { approvalEvidence: event.target.value })} placeholder="Internal review ticket or signed note" required /></label>
            <button className="button button--quiet" type="submit" disabled={busy}><Link2 size={14} aria-hidden="true" /> Approve local handoff</button>
          </form> : null}

          {order.governedHandoff && onPrepareHubHandoff && !hubHandoff ? <div className="retail-unified-order-inbox__hub">
            <div><strong>Prepare immutable Hub envelope</strong><small>Creates only a checksum-bound local outbox record. A certified Hub transport owns submission and its response.</small></div>
            <button className="button button--quiet" type="button" disabled={busy} onClick={() => { void onPrepareHubHandoff({ orderId: order.id, expectedSourceDigest: order.sourceDigest }); }}><Link2 size={14} aria-hidden="true" /> Prepare Hub envelope</button>
          </div> : null}

          {fulfilmentHandoff ? <div className={fulfilmentHandoff.status === 'approved' ? 'retail-unified-order-inbox__approved' : 'retail-unified-order-inbox__pending'}>
            <Link2 size={13} aria-hidden="true" /> Local fulfilment mapping: {fulfilmentHandoff.status} / sales order {fulfilmentHandoff.salesOrderId}
          </div> : null}

          {order.governedHandoff && !fulfilmentHandoff && onPrepareFulfilmentHandoff && activeSalesOrders.length ? <form className="retail-unified-order-inbox__handoff retail-unified-order-inbox__hub" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!draft.salesOrderId || !draft.mappingEvidence.trim()) return;
            await onPrepareFulfilmentHandoff({
              orderId: order.id,
              expectedSourceDigest: order.sourceDigest,
              salesOrderId: draft.salesOrderId,
              evidenceReference: draft.mappingEvidence.trim(),
            });
            updateDraft(order.id, { mappingEvidence: '' });
          }}>
            <div><strong>Prepare local fulfilment mapping</strong><small>Links this verified envelope to an existing Epic BOS sales order. Stock, payment, carrier, and delivery facts remain unchanged.</small></div>
            <label htmlFor={`sales-order-${order.id}`}>Existing Epic BOS sales order<select id={`sales-order-${order.id}`} value={draft.salesOrderId} onChange={(event) => updateDraft(order.id, { salesOrderId: event.target.value })} required>
              <option value="">Choose an existing sales order</option>
              {activeSalesOrders.map((salesOrder) => <option key={salesOrder.id} value={salesOrder.id}>{salesOrder.number} / {salesOrder.status}</option>)}
            </select></label>
            <label htmlFor={`mapping-evidence-${order.id}`}>Internal mapping review<input id={`mapping-evidence-${order.id}`} value={draft.mappingEvidence} onChange={(event) => updateDraft(order.id, { mappingEvidence: event.target.value })} placeholder="Internal mapping ticket" required /></label>
            <button className="button button--quiet" type="submit" disabled={busy}><Link2 size={14} aria-hidden="true" /> Prepare mapping</button>
          </form> : null}

          {fulfilmentHandoff?.status === 'prepared' && onDecideFulfilmentHandoff ? <form className="retail-unified-order-inbox__handoff retail-unified-order-inbox__hub" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!draft.decisionRemarks.trim()) return;
            await onDecideFulfilmentHandoff({
              id: fulfilmentHandoff.id,
              expectedVersion: fulfilmentHandoff.version,
              decision: draft.decision,
              remarks: draft.decisionRemarks.trim(),
            });
            updateDraft(order.id, { decisionRemarks: '' });
          }}>
            <div><strong>Review local mapping</strong><small>This independent local decision only governs the Epic BOS mapping. It does not change the source order or Hub envelope.</small></div>
            <label htmlFor={`mapping-decision-${order.id}`}>Local decision<select id={`mapping-decision-${order.id}`} value={draft.decision} onChange={(event) => updateDraft(order.id, { decision: event.target.value as DecideRetailOrderFulfilmentHandoffInput['decision'] })}>
              <option value="approved">Approve mapping</option>
              <option value="rejected">Reject mapping</option>
            </select></label>
            <label htmlFor={`mapping-remarks-${order.id}`}>Independent review note<input id={`mapping-remarks-${order.id}`} value={draft.decisionRemarks} onChange={(event) => updateDraft(order.id, { decisionRemarks: event.target.value })} placeholder="Internal approval or rejection note" required /></label>
            <button className="button button--quiet" type="submit" disabled={busy}><CheckCircle2 size={14} aria-hidden="true" /> Record local decision</button>
          </form> : null}

          {latestCarrierCallback ? <div className="retail-unified-order-inbox__approved"><CheckCircle2 size={13} aria-hidden="true" /> Carrier callback observed by Hub: {latestCarrierCallback.providerStatus} / {latestCarrierCallback.callbackReference} / checksum {latestCarrierCallback.payloadChecksum.slice(0, 12)}...</div> : null}
          {localStatus.length ? <div className="retail-unified-order-inbox__pending"><CircleAlert size={13} aria-hidden="true" /> Local operations: {localStatus.join(' / ')}. Warehouse, dispatch, delivery, RTO, and return evidence are displayed here only after their governed workbench or Hub adapter records them.</div> : null}
        </article>;
      }) : <div className="retail-unified-order-inbox__empty"><Inbox size={18} aria-hidden="true" /><strong>No verified order envelopes yet</strong><span>Connect a certified Retail Hub adapter in Setup. This screen never accepts manually typed provider orders.</span></div>}
    </div>

    <footer className="retail-unified-order-inbox__footer">
      Signed Hub/provider envelopes are authoritative for external orders and outcomes. Electron may prepare auditable local handoffs and mappings only; it cannot ingest external order data, record a Hub response, callback, delivery, cancellation, return, or RTO result.
      {activeActorId ? ` Current local actor: ${activeActorId}.` : ''}
    </footer>
  </section>;
}
