import {
  BanknoteArrowDown,
  Check,
  CircleAlert,
  Landmark,
  PackageCheck,
  ReceiptIndianRupee,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  formatIndiaDateTime,
  formatIndiaDateTimeLocal,
  parseIndiaDateTimeLocal,
} from '../shared/india-business-date';
import type {
  CloseCodShortfallInput,
  CodCollectionCase,
  CreateCodCollectionCaseInput,
  MatchCodBankInput,
  RecordCodCarrierCollectionInput,
  RecordCodExceptionInput,
  RecordCodHandoverInput,
  RecordCodRemittanceInput,
  RevenueOpsSnapshot,
} from '../shared/revenue-ops-contracts';
import './CodCustodyWorkbench.css';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const lifecycle = [
  ['expected', 'Expected'],
  ['handed-to-carrier', 'Handover'],
  ['carrier-collected', 'Collected'],
  ['remitted', 'Remitted'],
  ['bank-matched', 'Bank matched'],
] as const;

type CodCustodyWorkbenchProps = {
  revenue: RevenueOpsSnapshot;
  busy: boolean;
  onCreateCase: (input: CreateCodCollectionCaseInput) => Promise<void>;
  onRecordHandover: (input: RecordCodHandoverInput) => Promise<void>;
  onRecordCarrierCollection: (input: RecordCodCarrierCollectionInput) => Promise<void>;
  onRecordRemittance: (input: RecordCodRemittanceInput) => Promise<void>;
  onMatchBank: (input: MatchCodBankInput) => Promise<void>;
  onCloseShortfall: (input: CloseCodShortfallInput) => Promise<void>;
  onRecordException: (input: RecordCodExceptionInput) => Promise<void>;
};

type CodCreateCandidate = {
  promise: RevenueOpsSnapshot['deliveryPromises'][number];
  shipment: RevenueOpsSnapshot['shipmentPackages'][number];
  order: RevenueOpsSnapshot['salesOrders'][number];
  carrier: RevenueOpsSnapshot['carrierAdapters'][number];
  receivable: RevenueOpsSnapshot['receivables'][number];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The COD custody action could not be completed.';
}

function titleCase(value: string): string {
  return value.split('-').map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(' ');
}

function formatInstant(value: string | undefined): string {
  if (!value) return 'awaiting evidence';
  try {
    return formatIndiaDateTime(value);
  } catch {
    return value;
  }
}

function caseTone(status: CodCollectionCase['status']): 'neutral' | 'watch' | 'positive' | 'critical' {
  if (status === 'bank-matched') return 'positive';
  if (status === 'shortfall' || status === 'refused-rto' || status === 'cancelled') return 'critical';
  if (status === 'remitted' || status === 'carrier-collected') return 'watch';
  return 'neutral';
}

function currentLifecycleIndex(item: CodCollectionCase): number {
  if (item.status === 'bank-matched') return 4;
  if (item.remittanceEvidence) return 3;
  if (item.carrierCollectionEvidence) return 2;
  if (item.handoverEvidence) return 1;
  return 0;
}

/**
 * An evidence-only domestic COD workbench. It deliberately does not book
 * cash, call carriers, or create a bank match: each stage joins records that
 * were already governed by its owning physical, AR, and bank workflows.
 */
export function CodCustodyWorkbench({
  revenue,
  busy,
  onCreateCase,
  onRecordHandover,
  onRecordCarrierCollection,
  onRecordRemittance,
  onMatchBank,
  onCloseShortfall,
  onRecordException,
}: CodCustodyWorkbenchProps): ReactNode {
  const candidates = useMemo<CodCreateCandidate[]>(() => {
    const existingPromiseIds = new Set(revenue.codCollectionCases.map(({ deliveryPromiseId }) => deliveryPromiseId));
    return revenue.deliveryPromises.flatMap((promise) => {
      if (promise.paymentMode !== 'cod' || promise.status !== 'active' || existingPromiseIds.has(promise.id)) return [];
      const shipment = revenue.shipmentPackages.find((item) => item.deliveryPromiseId === promise.id && !['cancelled', 'returned'].includes(item.status));
      const order = revenue.salesOrders.find(({ id }) => id === promise.salesOrderId);
      const carrierId = promise.carrierAdapterId;
      const carrier = carrierId ? revenue.carrierAdapters.find(({ id }) => id === carrierId) : undefined;
      const invoice = shipment && order
        ? revenue.invoices.find((item) => item.salesOrderId === order.id && item.shipmentPackageIds.includes(shipment.id) && !['draft', 'cancelled'].includes(item.status))
        : undefined;
      const receivable = invoice
        ? revenue.receivables.find((item) => item.invoiceId === invoice.id && item.outstandingAmount > 0 && !['paid', 'written-off'].includes(item.status))
        : undefined;
      return shipment && order && carrier && !['disabled', 'degraded'].includes(carrier.status) &&
        (!shipment.carrierAdapterId || shipment.carrierAdapterId === carrier.id) && receivable
        ? [{ promise, shipment, order, carrier, receivable }]
        : [];
    });
  }, [revenue]);
  const cases = useMemo(
    () => [...revenue.codCollectionCases].sort((left, right) => `${right.createdAt}${right.number}`.localeCompare(`${left.createdAt}${left.number}`)),
    [revenue.codCollectionCases],
  );
  const [candidatePromiseId, setCandidatePromiseId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setCandidatePromiseId((current) => candidates.some(({ promise }) => promise.id === current) ? current : candidates[0]?.promise.id ?? '');
  }, [candidates]);

  useEffect(() => {
    setCaseId((current) => cases.some(({ id }) => id === current) ? current : cases[0]?.id ?? '');
  }, [cases]);

  const selectedCandidate = candidates.find(({ promise }) => promise.id === candidatePromiseId);
  const selected = cases.find(({ id }) => id === caseId) ?? cases[0];
  const selectedShipment = selected ? revenue.shipmentPackages.find(({ id }) => id === selected.shipmentPackageId) : undefined;
  const selectedReceivable = selected ? revenue.receivables.find(({ id }) => id === selected.receivableId) : undefined;
  const selectedOrder = selected ? revenue.salesOrders.find(({ id }) => id === selected.salesOrderId) : undefined;
  const selectedCarrier = selected ? revenue.carrierAdapters.find(({ id }) => id === selected.carrierAdapterId) : undefined;
  const reconciledReceipts = useMemo(
    () => selected
      ? revenue.paymentReceipts.filter((receipt) => receipt.status === 'reconciled' && receipt.amount > 0 && receipt.allocations.some(({ receivableId }) => receivableId === selected.receivableId))
      : [],
    [revenue.paymentReceipts, selected],
  );
  const selectedReceipt = reconciledReceipts[0];
  const matchedLines = useMemo(
    () => selectedReceipt
      ? revenue.bankStatementLines.filter((line) => line.matchStatus === 'matched' && line.matchedPaymentReceiptId === selectedReceipt.id)
      : [],
    [revenue.bankStatementLines, selectedReceipt],
  );
  const selectedBankLine = matchedLines[0];

  const totals = useMemo(() => {
    const byStatus = (statuses: CodCollectionCase['status'][]): number => cases
      .filter(({ status }) => statuses.includes(status))
      .reduce((sum, item) => sum + item.expectedAmount, 0);
    return {
      expected: byStatus(['expected', 'handed-to-carrier']),
      collected: byStatus(['carrier-collected']),
      remitted: byStatus(['remitted']),
      matched: byStatus(['bank-matched']),
      attention: byStatus(['shortfall', 'refused-rto', 'cancelled']),
    };
  }, [cases]);

  function run(action: () => Promise<void>, success: string): void {
    setMessage('');
    void action().then(() => setMessage(success)).catch((error: unknown) => setMessage(errorMessage(error)));
  }

  function createCase(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selectedCandidate) return;
    run(
      () => onCreateCase({
        deliveryPromiseId: selectedCandidate.promise.id,
        shipmentPackageId: selectedCandidate.shipment.id,
        salesOrderId: selectedCandidate.order.id,
        carrierAdapterId: selectedCandidate.carrier.id,
        receivableId: selectedCandidate.receivable.id,
        expectedDeliveryPromiseVersion: selectedCandidate.promise.version,
        expectedShipmentVersion: selectedCandidate.shipment.version,
        expectedSalesOrderVersion: selectedCandidate.order.version,
        expectedCarrierVersion: selectedCandidate.carrier.version,
        expectedReceivableVersion: selectedCandidate.receivable.version,
      }),
      'COD case created from current promise, shipment, carrier, and receivable evidence.',
    );
  }

  function recordHandover(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selected || !selectedShipment) return;
    const data = new FormData(event.currentTarget);
    let handedOverAt: string;
    try { handedOverAt = parseIndiaDateTimeLocal(String(data.get('occurredAt'))); } catch (error) { setMessage(errorMessage(error)); return; }
    run(
      () => onRecordHandover({
        id: selected.id,
        evidenceReference: String(data.get('evidenceReference')).trim(),
        handedOverAt,
        expectedVersion: selected.version,
        expectedShipmentVersion: selectedShipment.version,
      }),
      'Carrier handover evidence recorded. Collection remains unproven until a separate collection record arrives.',
    );
  }

  function recordCollection(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selected || !selectedShipment) return;
    const data = new FormData(event.currentTarget);
    let collectedAt: string;
    try { collectedAt = parseIndiaDateTimeLocal(String(data.get('occurredAt'))); } catch (error) { setMessage(errorMessage(error)); return; }
    run(
      () => onRecordCarrierCollection({
        id: selected.id,
        evidenceReference: String(data.get('evidenceReference')).trim(),
        collectedAt,
        collectedAmount: Number(data.get('amount')),
        expectedVersion: selected.version,
        expectedShipmentVersion: selectedShipment.version,
      }),
      'Carrier collection evidence recorded. It is not yet remittance or bank settlement proof.',
    );
  }

  function recordRemittance(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selected || !selectedReceivable) return;
    const data = new FormData(event.currentTarget);
    let remittedAt: string;
    try { remittedAt = parseIndiaDateTimeLocal(String(data.get('occurredAt'))); } catch (error) { setMessage(errorMessage(error)); return; }
    run(
      () => onRecordRemittance({
        id: selected.id,
        evidenceReference: String(data.get('evidenceReference')).trim(),
        remittedAt,
        remittedAmount: Number(data.get('amount')),
        expectedVersion: selected.version,
        expectedReceivableVersion: selectedReceivable.version,
      }),
      'Carrier remittance evidence recorded. Bank match is still a separate control.',
    );
  }

  function matchBank(event: FormEvent<HTMLFormElement>, shortfall: boolean): void {
    event.preventDefault();
    if (!selected || !selectedReceipt || !selectedBankLine) return;
    const data = new FormData(event.currentTarget);
    if (shortfall) {
      run(
        () => onCloseShortfall({
          id: selected.id,
          paymentReceiptId: selectedReceipt.id,
          bankStatementLineId: selectedBankLine.id,
          resolutionReference: String(data.get('resolutionReference')).trim(),
          expectedVersion: selected.version,
          expectedPaymentReceiptVersion: selectedReceipt.version,
          expectedBankStatementLineVersion: selectedBankLine.version,
        }),
        'Documented partial bank evidence linked to the shortfall closure.',
      );
      return;
    }
    run(
      () => onMatchBank({
        id: selected.id,
        paymentReceiptId: selectedReceipt.id,
        bankStatementLineId: selectedBankLine.id,
        expectedVersion: selected.version,
        expectedPaymentReceiptVersion: selectedReceipt.version,
        expectedBankStatementLineVersion: selectedBankLine.version,
      }),
      'COD case linked to an already reconciled payment receipt and matched bank-statement line.',
    );
  }

  function recordException(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selected || !selectedShipment) return;
    const data = new FormData(event.currentTarget);
    let occurredAt: string;
    try { occurredAt = parseIndiaDateTimeLocal(String(data.get('occurredAt'))); } catch (error) { setMessage(errorMessage(error)); return; }
    run(
      () => onRecordException({
        id: selected.id,
        outcome: String(data.get('outcome')) as RecordCodExceptionInput['outcome'],
        evidenceReference: String(data.get('evidenceReference')).trim(),
        occurredAt,
        reason: String(data.get('reason')).trim(),
        expectedVersion: selected.version,
        expectedShipmentVersion: selectedShipment.version,
      }),
      'COD exception recorded with shipment evidence. No cash outcome was fabricated.',
    );
  }

  return <section className="cod-custody-workbench" aria-labelledby="cod-custody-title">
    <header className="cod-custody-workbench__hero">
      <div>
        <span>02B / Domestic collection evidence</span>
        <h4 id="cod-custody-title">Cash-on-delivery custody desk</h4>
        <p>Trace the same INR commitment from dispatch handover to carrier collection, remittance, and an already matched bank line—without calling any stage settled too early.</p>
      </div>
      <div className="cod-custody-workbench__boundary"><ShieldCheck size={17} aria-hidden="true" /><span>Evidence-only<br /><strong>no gateway or carrier claim</strong></span></div>
    </header>

    <div className="cod-custody-workbench__metrics" aria-label="COD custody status totals">
      <div><span>Awaiting custody</span><strong>{inr.format(totals.expected)}</strong><small>expected or handed over</small></div>
      <div><span>Carrier collected</span><strong>{inr.format(totals.collected)}</strong><small>not yet remitted</small></div>
      <div><span>Remitted</span><strong>{inr.format(totals.remitted)}</strong><small>bank proof pending</small></div>
      <div data-tone="positive"><span>Bank matched</span><strong>{inr.format(totals.matched)}</strong><small>reconciled evidence</small></div>
      <div data-tone={totals.attention > 0 ? 'critical' : 'neutral'}><span>Attention</span><strong>{inr.format(totals.attention)}</strong><small>shortfall or RTO</small></div>
    </div>

    <div className="cod-custody-workbench__grid">
      <article className="cod-custody-workbench__create">
        <header><PackageCheck size={18} aria-hidden="true" /><div><span>Open a custody case</span><h5>Start from live operational evidence</h5></div></header>
        <p>A case can only join an active COD delivery promise, linked package, configured carrier, issued receivable, and current record versions.</p>
        {candidates.length ? <form onSubmit={createCase}>
          <label>Eligible COD commitment<select aria-label="Eligible COD commitment" value={candidatePromiseId} onChange={(event) => { setCandidatePromiseId(event.target.value); setMessage(''); }}>
            {candidates.map(({ promise, shipment, order, carrier, receivable }) => <option key={promise.id} value={promise.id}>{order.number} · {shipment.number} · {carrier.code} · {inr.format(receivable.outstandingAmount)}</option>)}
          </select></label>
          {selectedCandidate ? <dl><div><dt>Promise</dt><dd>{selectedCandidate.promise.ruleCode} · delivery {selectedCandidate.promise.deliveryTo}</dd></div><div><dt>Receivable</dt><dd>{selectedCandidate.receivable.invoiceNumber} · {inr.format(selectedCandidate.receivable.outstandingAmount)}</dd></div></dl> : null}
          <button className="button button--primary" disabled={busy} type="submit">Open evidence case</button>
        </form> : <div className="cod-custody-workbench__empty"><ReceiptIndianRupee size={18} aria-hidden="true" /><span>No eligible COD route is ready. Create a COD promise, linked package, carrier boundary, issued invoice, and open receivable first.</span></div>}
      </article>

      <article className="cod-custody-workbench__queue">
        <header><Truck size={18} aria-hidden="true" /><div><span>Active custody queue</span><h5>Every case stays attached to its source records</h5></div></header>
        {cases.length ? <div className="cod-custody-workbench__case-list">{cases.map((item) => {
          const order = revenue.salesOrders.find(({ id }) => id === item.salesOrderId);
          const shipment = revenue.shipmentPackages.find(({ id }) => id === item.shipmentPackageId);
          return <button type="button" className="cod-custody-case" key={item.id} data-selected={item.id === selected?.id} onClick={() => { setCaseId(item.id); setMessage(''); }}>
            <span className="cod-custody-case__mark" data-tone={caseTone(item.status)} aria-hidden="true" />
            <span><strong>{item.number}</strong><small>{order?.number ?? 'restricted order'} · {shipment?.number ?? 'restricted package'}</small></span>
            <b>{inr.format(item.expectedAmount)}</b><em data-tone={caseTone(item.status)}>{titleCase(item.status)}</em>
          </button>;
        })}</div> : <div className="cod-custody-workbench__empty"><BanknoteArrowDown size={18} aria-hidden="true" /><span>No COD custody cases are in scope. The queue stays empty instead of inventing a settlement total.</span></div>}
      </article>
    </div>

    {selected ? <article className="cod-custody-workbench__detail" aria-live="polite">
      <header>
        <div><span>Custody case / {selected.number}</span><h5>{selectedOrder?.number ?? 'Scoped sales order'} <i>→</i> {selectedShipment?.number ?? 'Scoped package'}</h5></div>
        <div className="cod-custody-workbench__detail-total"><span>Expected INR</span><strong>{inr.format(selected.expectedAmount)}</strong><em data-tone={caseTone(selected.status)}>{titleCase(selected.status)}</em></div>
      </header>
      <p className="cod-custody-workbench__detail-meta">{selectedCarrier?.name ?? 'Carrier record restricted'} · Receivable {selectedReceivable?.invoiceNumber ?? 'restricted'} · outstanding {inr.format(selectedReceivable?.outstandingAmount ?? 0)}</p>

      <ol className="cod-custody-workbench__rail" aria-label="COD custody lifecycle">
        {lifecycle.map(([status, label], index) => <li key={status} data-state={index < currentLifecycleIndex(selected) ? 'complete' : index === currentLifecycleIndex(selected) ? 'current' : 'pending'}><i>{index < currentLifecycleIndex(selected) ? <Check size={12} aria-hidden="true" /> : index + 1}</i><span>{label}</span></li>)}
      </ol>

      <div className="cod-custody-workbench__evidence-grid">
        <div><span>Handover</span><strong>{selected.handoverEvidence?.reference ?? 'awaiting evidence'}</strong><small>{formatInstant(selected.handoverEvidence?.occurredAt)}</small></div>
        <div><span>Carrier collection</span><strong>{selected.carrierCollectionEvidence ? inr.format(selected.carrierCollectionEvidence.amount) : 'awaiting evidence'}</strong><small>{selected.carrierCollectionEvidence ? `${selected.carrierCollectionEvidence.reference} · ${formatInstant(selected.carrierCollectionEvidence.occurredAt)}` : 'carrier tracking is not cash proof'}</small></div>
        <div><span>Remittance</span><strong>{selected.remittanceEvidence ? inr.format(selected.remittanceEvidence.amount) : 'awaiting evidence'}</strong><small>{selected.remittanceEvidence ? `${selected.remittanceEvidence.reference} · ${formatInstant(selected.remittanceEvidence.occurredAt)}` : 'remittance evidence required'}</small></div>
        <div><span>Bank match</span><strong>{selected.bankMatchEvidence?.bankStatementReference ?? 'awaiting bank evidence'}</strong><small>{selected.bankMatchEvidence ? selected.bankMatchEvidence.reference : 'existing bank reconciliation required'}</small></div>
      </div>

      <div className="cod-custody-workbench__action">
        {selected.status === 'expected' ? <form onSubmit={recordHandover}><header><Truck size={17} aria-hidden="true" /><div><strong>Record carrier handover</strong><small>Use dispatch/handover evidence; this does not prove collection.</small></div></header><label>Evidence reference<input name="evidenceReference" minLength={3} placeholder="Manifest / seal / carrier handover reference" required /></label><label>Handed over at <small>(Asia/Kolkata)</small><input name="occurredAt" type="datetime-local" defaultValue={formatIndiaDateTimeLocal(Date.now())} required /></label><button className="button button--primary" disabled={busy}>Record handover</button></form> : null}
        {selected.status === 'handed-to-carrier' ? <form onSubmit={recordCollection}><header><ReceiptIndianRupee size={17} aria-hidden="true" /><div><strong>Record carrier collection</strong><small>A delivery scan alone is not collection evidence.</small></div></header><label>Collection reference<input name="evidenceReference" minLength={3} placeholder="Carrier collection / settlement manifest reference" required /></label><div className="cod-custody-workbench__action-row"><label>Collected INR<input name="amount" defaultValue={selected.expectedAmount} min="0.01" step="0.01" type="number" required /></label><label>Collected at <small>(Asia/Kolkata)</small><input name="occurredAt" type="datetime-local" defaultValue={formatIndiaDateTimeLocal(Date.now())} required /></label></div><button className="button button--primary" disabled={busy}>Record collection evidence</button></form> : null}
        {selected.status === 'carrier-collected' ? <form onSubmit={recordRemittance}><header><Landmark size={17} aria-hidden="true" /><div><strong>Record carrier remittance</strong><small>Remittance is still not bank reconciliation.</small></div></header><label>Remittance reference<input name="evidenceReference" minLength={3} placeholder="Carrier remittance / settlement advice reference" required /></label><div className="cod-custody-workbench__action-row"><label>Remitted INR<input name="amount" defaultValue={selected.expectedAmount} min="0.01" step="0.01" type="number" required /></label><label>Remitted at <small>(Asia/Kolkata)</small><input name="occurredAt" type="datetime-local" defaultValue={formatIndiaDateTimeLocal(Date.now())} required /></label></div><button className="button button--primary" disabled={busy}>Record remittance evidence</button></form> : null}
        {selected.status === 'remitted' ? <form onSubmit={(event) => matchBank(event, false)}><header><Landmark size={17} aria-hidden="true" /><div><strong>Link bank-reconciled evidence</strong><small>Only a receipt already reconciled to a matched bank line can complete this case.</small></div></header>{selectedReceipt && selectedBankLine ? <><div className="cod-custody-workbench__bank-proof"><span>{selectedReceipt.number} · {inr.format(selectedReceipt.amount)}</span><span>{selectedBankLine.reference} · {inr.format(selectedBankLine.credit)}</span></div><button className="button button--primary" disabled={busy}>Mark bank matched</button></> : <p className="cod-custody-workbench__blocked"><CircleAlert size={16} aria-hidden="true" />No reconciled receipt and matching bank line are available for this receivable. Complete those controlled finance records first.</p>}</form> : null}
        {selected.status === 'shortfall' && !selected.shortfallClosedAt ? <form onSubmit={(event) => matchBank(event, true)}><header><CircleAlert size={17} aria-hidden="true" /><div><strong>Close a bank-evidenced shortfall</strong><small>Only documented partial cash and a previously reconciled bank line can close the case.</small></div></header>{selectedReceipt && selectedBankLine ? <><label>Resolution reference<input name="resolutionReference" minLength={3} placeholder="Approved shortfall resolution reference" required /></label><div className="cod-custody-workbench__bank-proof"><span>{selectedReceipt.number} · {inr.format(selectedReceipt.amount)}</span><span>{selectedBankLine.reference} · {inr.format(selectedBankLine.credit)}</span></div><button className="button button--primary" disabled={busy}>Close with bank evidence</button></> : <p className="cod-custody-workbench__blocked"><CircleAlert size={16} aria-hidden="true" />A partial payment receipt and matched bank line must exist before a shortfall can be closed.</p>}</form> : null}
        {['bank-matched', 'refused-rto', 'cancelled'].includes(selected.status) || Boolean(selected.shortfallClosedAt) ? <div className="cod-custody-workbench__closed"><ShieldCheck size={18} aria-hidden="true" /><div><strong>{selected.status === 'bank-matched' ? 'Custody chain evidenced' : selected.shortfallClosedAt ? 'Shortfall closure evidenced' : `Custody exception: ${titleCase(selected.status)}`}</strong><span>{selected.status === 'bank-matched' ? 'Carrier, remittance, and bank evidence remain individually inspectable. No additional cash entry was created.' : selected.shortfallClosedAt ? `${selected.shortfallClosureReference ?? 'Approved resolution evidence'} · closed ${formatInstant(selected.shortfallClosedAt)}` : `${selected.exceptionEvidence?.reason ?? 'Documented operational outcome.'} · ${selected.exceptionEvidence?.reference ?? 'evidence reference unavailable'}`}</span></div></div> : null}
        {['expected', 'handed-to-carrier', 'carrier-collected'].includes(selected.status) ? <details className="cod-custody-workbench__exception"><summary>Record RTO or cancellation exception</summary><form onSubmit={recordException}><label>Outcome<select name="outcome"><option value="refused-rto">Customer refused / RTO</option><option value="cancelled">Cancelled</option></select></label><label>Evidence reference<input name="evidenceReference" minLength={3} placeholder="RTO scan / cancellation approval reference" required /></label><label>Reason<textarea name="reason" minLength={3} placeholder="Observed reason and affected delivery evidence" required /></label><label>Occurred at <small>(Asia/Kolkata)</small><input name="occurredAt" type="datetime-local" defaultValue={formatIndiaDateTimeLocal(Date.now())} required /></label><button type="submit" disabled={busy}>Record exception</button></form></details> : null}
      </div>
    </article> : null}
    {message ? <p className="cod-custody-workbench__message" role="status">{message}</p> : null}
  </section>;
}
