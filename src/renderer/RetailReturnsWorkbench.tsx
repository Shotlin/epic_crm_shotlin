import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Box,
  CircleAlert,
  ClipboardCheck,
  FileSearch,
  FileSpreadsheet,
  PackageCheck,
  RefreshCcwDot,
  ScanLine,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type {
  ConfirmRetailReturnProviderRefundInput,
  CreateRetailReturnRequestInput,
  DecideRetailReturnInput,
  DecideRetailReturnSettlementInput,
  InspectRetailReturnInput,
  RetailReturnOutcome,
  RequestRetailReturnSettlementInput,
} from '../shared/retail-pos-contracts';
import type { CreateRetailExchangeInput, DecideRetailExchangeInput } from '../shared/retail-exchange-contracts';
import type { PrepareRetailCreditNoteReconciliationInput, RecordRetailCreditNotePortalResponseInput } from '../shared/retail-credit-note-contracts';
import './RetailReturnsWorkbench.css';

type RetailSale = RevenueOpsSnapshot['retailSales'][number];
type RetailReturn = RevenueOpsSnapshot['retailReturns'][number];
type RequestLineDraft = { selected: boolean; quantity: string; serialUnitIds: string[] };
type InspectionLineDraft = { outcome: RetailReturnOutcome; destinationBinId: string; conditionNotes: string };
type PortalResponseDraft = {
  remoteStatus: '' | RecordRetailCreditNotePortalResponseInput['remoteStatus'];
  externalReference: string;
  remotePayloadChecksum: string;
  responseMessage: string;
};

export interface RetailReturnsWorkbenchProps {
  revenue: RevenueOpsSnapshot;
  busy: boolean;
  activeActorId: string;
  onCreateRetailReturnRequest: (input: CreateRetailReturnRequestInput) => Promise<void>;
  onInspectRetailReturn: (input: InspectRetailReturnInput) => Promise<void>;
  onDecideRetailReturn: (input: DecideRetailReturnInput) => Promise<void>;
  onRequestRetailReturnSettlement: (input: RequestRetailReturnSettlementInput) => Promise<void>;
  onDecideRetailReturnSettlement: (input: DecideRetailReturnSettlementInput) => Promise<void>;
  onConfirmRetailReturnProviderRefund: (input: ConfirmRetailReturnProviderRefundInput) => Promise<void>;
  onCreateRetailExchange?: (input: CreateRetailExchangeInput) => Promise<void>;
  onDecideRetailExchange?: (input: DecideRetailExchangeInput) => Promise<void>;
  onPrepareRetailCreditNoteReconciliation?: (input: PrepareRetailCreditNoteReconciliationInput) => Promise<void>;
  onRecordRetailCreditNotePortalResponse?: (input: RecordRetailCreditNotePortalResponseInput) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The counter-return action could not be completed.';
}

function newReturnTransactionKey(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return `RTRN-${id}`;
}

function newSettlementTransactionKey(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return `${prefix}-${id}`;
}

function formatInr(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

function indiaDate(timestamp: string | undefined): string {
  if (!timestamp) return 'Pending evidence';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(timestamp));
}

function sourceRequestDraft(sale: RetailSale | undefined): Record<string, RequestLineDraft> {
  if (!sale) return {};
  return Object.fromEntries(sale.lines.map((line) => [line.id, {
    selected: false,
    quantity: String(line.quantity),
    serialUnitIds: [],
  }]));
}

function retailLineName(revenue: RevenueOpsSnapshot, itemVariantId: string, fallback: string): string {
  return revenue.itemVariants.find(({ id }) => id === itemVariantId)?.name ?? fallback;
}

function retailLineSku(revenue: RevenueOpsSnapshot, itemVariantId: string): string | undefined {
  return revenue.itemVariants.find(({ id }) => id === itemVariantId)?.sku;
}

function returnStatusLabel(status: RetailReturn['status']): string {
  return status.replaceAll('-', ' ');
}

function outcomeLabel(outcome: RetailReturnOutcome): string {
  return outcome === 'resalable' ? 'Resalable stock' : outcome === 'quarantine' ? 'Quarantine' : 'Damaged / isolate';
}

export function RetailReturnsWorkbench({
  revenue,
  busy,
  activeActorId,
  onCreateRetailReturnRequest,
  onInspectRetailReturn,
  onDecideRetailReturn,
  onRequestRetailReturnSettlement,
  onDecideRetailReturnSettlement,
  onConfirmRetailReturnProviderRefund,
  onCreateRetailExchange,
  onDecideRetailExchange,
  onPrepareRetailCreditNoteReconciliation,
  onRecordRetailCreditNotePortalResponse,
}: RetailReturnsWorkbenchProps): ReactNode {
  const completedSales = useMemo(
    () => revenue.retailSales.filter((sale) => sale.status === 'completed'),
    [revenue.retailSales],
  );
  const [selectedSaleId, setSelectedSaleId] = useState(completedSales[0]?.id ?? '');
  const selectedSale = completedSales.find(({ id }) => id === selectedSaleId) ?? completedSales[0];
  const [requestLines, setRequestLines] = useState<Record<string, RequestLineDraft>>(() => sourceRequestDraft(selectedSale));
  const [returnTransactionKey, setReturnTransactionKey] = useState(newReturnTransactionKey);
  const [notice, setNotice] = useState('');
  const [inspectionReturnId, setInspectionReturnId] = useState('');
  const [inspectionReference, setInspectionReference] = useState('');
  const [inspectionLines, setInspectionLines] = useState<Record<string, InspectionLineDraft>>({});

  useEffect(() => {
    setSelectedSaleId((current) => completedSales.some(({ id }) => id === current) ? current : completedSales[0]?.id ?? '');
  }, [completedSales]);

  useEffect(() => {
    setRequestLines(sourceRequestDraft(selectedSale));
    setReturnTransactionKey(newReturnTransactionKey());
  }, [selectedSale?.id]);

  const requestedReturns = useMemo(
    () => revenue.retailReturns.filter((returnCase) => returnCase.status === 'requested'),
    [revenue.retailReturns],
  );
  const selectedInspection = requestedReturns.find(({ id }) => id === inspectionReturnId) ?? requestedReturns[0];

  const eligibleBins = (returnCase: RetailReturn, outcome: RetailReturnOutcome) => revenue.storageBins.filter((bin) => {
    if (bin.status !== 'available') return false;
    const zone = revenue.warehouseZones.find(({ id }) => id === bin.zoneId);
    if (!zone || !zone.active || zone.warehouseId !== returnCase.warehouseId) return false;
    return outcome === 'resalable'
      ? zone.purpose === 'storage' || zone.purpose === 'picking'
      : zone.purpose === 'quarantine';
  });

  function inspectionDraft(returnCase: RetailReturn | undefined): Record<string, InspectionLineDraft> {
    if (!returnCase) return {};
    return Object.fromEntries(returnCase.lines.map((line) => {
      const bins = eligibleBins(returnCase, 'resalable');
      return [line.id, { outcome: 'resalable' as const, destinationBinId: bins[0]?.id ?? '', conditionNotes: '' }];
    }));
  }

  useEffect(() => {
    setInspectionReturnId((current) => requestedReturns.some(({ id }) => id === current) ? current : requestedReturns[0]?.id ?? '');
  }, [requestedReturns]);

  useEffect(() => {
    setInspectionReference('');
    setInspectionLines(inspectionDraft(selectedInspection));
  }, [selectedInspection?.id]);

  const independentReviews = useMemo(
    () => revenue.retailReturns.filter((returnCase) => returnCase.status === 'inspected'),
    [revenue.retailReturns],
  );
  const approvedFinancialReturns = useMemo(
    () => revenue.retailReturns.filter((returnCase) => returnCase.status === 'approved' && returnCase.financialCredit),
    [revenue.retailReturns],
  );
  const latestReturns = useMemo(() => revenue.retailReturns.slice(0, 10), [revenue.retailReturns]);

  function updateRequestLine(line: RetailSale['lines'][number], patch: Partial<RequestLineDraft>): void {
    setRequestLines((current) => ({
      ...current,
      [line.id]: { ...current[line.id] ?? { selected: false, quantity: String(line.quantity), serialUnitIds: [] }, ...patch },
    }));
  }

  function toggleRequestLine(line: RetailSale['lines'][number], selected: boolean): void {
    updateRequestLine(line, {
      selected,
      quantity: String(line.quantity),
      serialUnitIds: selected ? [...line.serialUnitIds] : [],
    });
  }

  function toggleRequestSerial(line: RetailSale['lines'][number], serialUnitId: string, selected: boolean): void {
    const draft = requestLines[line.id] ?? { selected: true, quantity: String(line.quantity), serialUnitIds: [] };
    const serialUnitIds = line.serialUnitIds.filter((id) => selected ? id === serialUnitId || draft.serialUnitIds.includes(id) : id !== serialUnitId && draft.serialUnitIds.includes(id));
    updateRequestLine(line, { selected: true, quantity: String(serialUnitIds.length), serialUnitIds });
  }

  async function submitReturnRequest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedSale) return;
    // Keep a stable reference across the async IPC call. React may clear the
    // synthetic event's currentTarget after the await, so calling reset on
    // event.currentTarget later can turn a committed request into a false UI
    // error notice.
    const form = event.currentTarget;
    const data = new FormData(form);
    const lines = selectedSale.lines.flatMap((line) => {
      const draft = requestLines[line.id];
      if (!draft?.selected) return [];
      const quantity = Number(draft.quantity);
      return Number.isFinite(quantity) && quantity > 0
        ? [{ retailSaleLineId: line.id, quantity, serialUnitIds: [...draft.serialUnitIds] }]
        : [];
    });
    if (!lines.length) {
      setNotice('Select at least one original receipt line and its return quantity before recording a counter-return request.');
      return;
    }
    setNotice('');
    try {
      await onCreateRetailReturnRequest({
        retailSaleId: selectedSale.id,
        transactionKey: returnTransactionKey,
        reason: String(data.get('reason') ?? ''),
        lines,
      });
      setNotice('Counter-return request recorded from the immutable POS receipt. No stock, refund, settlement, or GST credit note was created.');
      setRequestLines(sourceRequestDraft(selectedSale));
      setReturnTransactionKey(newReturnTransactionKey());
      form.reset();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  function changeInspectionOutcome(returnCase: RetailReturn, lineId: string, outcome: RetailReturnOutcome): void {
    const firstBin = eligibleBins(returnCase, outcome)[0];
    setInspectionLines((current) => ({
      ...current,
      [lineId]: { ...current[lineId] ?? { outcome, destinationBinId: '', conditionNotes: '' }, outcome, destinationBinId: firstBin?.id ?? '' },
    }));
  }

  async function submitInspection(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedInspection) return;
    const lines = selectedInspection.lines.map((line) => {
      const draft = inspectionLines[line.id];
      return {
        retailReturnLineId: line.id,
        outcome: draft?.outcome ?? 'resalable',
        destinationBinId: draft?.destinationBinId ?? '',
        serialUnitIds: [...line.serialUnitIds],
        conditionNotes: draft?.conditionNotes ?? '',
      };
    });
    if (lines.some((line) => !line.destinationBinId || line.conditionNotes.trim().length < 4)) {
      setNotice('Every returned line needs an eligible physical destination and condition notes before inspection can be recorded.');
      return;
    }
    setNotice('');
    try {
      await onInspectRetailReturn({
        id: selectedInspection.id,
        expectedVersion: selectedInspection.version,
        inspectionReference,
        lines,
      });
      setNotice('Inspection captured. Stock still has not moved; a separate independent decision is now required.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function decideReturn(returnCase: RetailReturn, decision: 'approved' | 'rejected', evidenceReference: string): Promise<void> {
    setNotice('');
    try {
      await onDecideRetailReturn({
        id: returnCase.id,
        decision,
        evidenceReference,
        expectedVersion: returnCase.version,
      });
      setNotice(decision === 'approved'
        ? 'Counter return approved. Only the inspected physical stock and COGS-reversal draft were prepared; customer refund and GST credit note remain separate controls.'
        : 'Counter return rejected with independent evidence. The original POS sale remains immutable.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  return <section className="retail-returns-workbench" aria-labelledby="retail-returns-title">
    <header className="retail-returns-workbench__hero">
      <div>
        <span className="retail-returns-workbench__eyebrow"><Undo2 size={14} aria-hidden="true" /> Counter-return control</span>
        <h3 id="retail-returns-title">Return the receipt, inspect the goods, then let a different person decide.</h3>
        <p>This is the retail counter path for completed POS receipts only. It is intentionally separate from delivery shipment RMAs and reverse logistics; GST credit evidence and settlement become available only after physical approval.</p>
      </div>
      <div className="retail-returns-workbench__boundary"><ShieldCheck size={18} aria-hidden="true" /><span><strong>Control boundary</strong>Request creates evidence. Inspection classifies goods. Independent approval alone moves stock.</span></div>
    </header>

    <div className="retail-returns-workbench__steps" aria-label="Counter-return workflow">
      <div data-step="request"><span>01</span><strong>Receipt request</strong><small>No stock or money changes</small></div>
      <ArrowRight aria-hidden="true" />
      <div data-step="inspect"><span>02</span><strong>Physical inspection</strong><small>Destination and condition evidence</small></div>
      <ArrowRight aria-hidden="true" />
      <div data-step="decide"><span>03</span><strong>Independent decision</strong><small>Stock re-entry or rejection</small></div>
    </div>

    <div className="retail-returns-workbench__grid">
      <article className="retail-returns-workbench__request">
        <header><div><span>01 / Receipt request</span><h4>Start from an immutable POS receipt</h4></div><ScanLine size={19} aria-hidden="true" /></header>
        <form onSubmit={(event) => void submitReturnRequest(event)}>
          <label>Completed counter receipt<select value={selectedSale?.id ?? ''} onChange={(event) => setSelectedSaleId(event.target.value)} disabled={busy || !completedSales.length}>
            {completedSales.length ? completedSales.map((sale) => <option key={sale.id} value={sale.id}>{sale.number} · {indiaDate(sale.completedAt ?? sale.saleAt)} · invoice {sale.invoiceId}</option>) : <option value="">No completed POS receipt in this scope</option>}
          </select></label>
          {selectedSale ? <div className="retail-returns-workbench__receipt-summary"><div><span>Counter</span><strong>{revenue.retailCounters.find(({ id }) => id === selectedSale.counterId)?.name ?? selectedSale.counterId}</strong></div><div><span>Customer</span><strong>{selectedSale.customerAccountId}</strong></div><div><span>Receipt evidence</span><strong>{selectedSale.paymentReceiptIds.length} tender record{selectedSale.paymentReceiptIds.length === 1 ? '' : 's'}</strong></div></div> : <p className="retail-returns-workbench__empty">Complete a governed retail checkout first. Shipment RMA cases cannot be opened from this workbench.</p>}

          <fieldset disabled={busy || !selectedSale}><legend>Original receipt lines</legend>
            {selectedSale?.lines.map((line) => {
              const draft = requestLines[line.id] ?? { selected: false, quantity: String(line.quantity), serialUnitIds: [] };
              const sku = retailLineSku(revenue, line.itemVariantId);
              const serialControlled = line.serialUnitIds.length > 0;
              return <div className="retail-returns-workbench__source-line" key={line.id} data-selected={draft.selected}>
                <label className="retail-returns-workbench__line-toggle"><input type="checkbox" checked={draft.selected} onChange={(event) => toggleRequestLine(line, event.target.checked)} /><span><strong>{retailLineName(revenue, line.itemVariantId, line.description)}</strong><small>{sku ? `${sku} · ` : ''}{line.quantity} sold{line.batchId ? ` · original batch ${revenue.inventoryBatches.find(({ id }) => id === line.batchId)?.batchNumber ?? line.batchId}` : ''}</small></span></label>
                <label>Return quantity<input type="number" min={serialControlled ? 1 : 0.001} max={line.quantity} step={serialControlled ? 1 : 'any'} value={draft.quantity} disabled={!draft.selected || serialControlled} onChange={(event) => updateRequestLine(line, { quantity: event.target.value })} required={draft.selected} /></label>
                {serialControlled ? <details className="retail-returns-workbench__serials" open={draft.selected}><summary>Match issued serials <small>{draft.serialUnitIds.length} selected of {line.serialUnitIds.length}</small></summary><div>{line.serialUnitIds.map((serialId) => <label key={serialId}><input type="checkbox" checked={draft.serialUnitIds.includes(serialId)} disabled={!draft.selected} onChange={(event) => toggleRequestSerial(line, serialId, event.target.checked)} />{revenue.serialUnits.find(({ id }) => id === serialId)?.serialNumber ?? serialId}</label>)}</div><small>Serial-controlled returns must carry exactly the serial identities printed on this POS receipt.</small></details> : null}
              </div>;
            })}
          </fieldset>
          <label>Return reason<textarea name="reason" minLength={4} maxLength={500} placeholder="Customer stated reason; do not enter refund instructions here." required /></label>
          <div className="retail-returns-workbench__request-footer"><span>Durable request key <code>{returnTransactionKey}</code></span><button className="button button--primary" disabled={busy || !selectedSale}>Record counter-return request <ArrowRight size={16} /></button></div>
          <small className="retail-returns-workbench__guard">This action preserves the original sale and creates no refund, store credit, tender reversal, stock movement, or GST credit note.</small>
        </form>
      </article>

      <article className="retail-returns-workbench__inspection">
        <header><div><span>02 / Physical inspection</span><h4>Classify every returned line</h4></div><FileSearch size={19} aria-hidden="true" /></header>
        {requestedReturns.length ? <form onSubmit={(event) => void submitInspection(event)}>
          <label>Return case awaiting inspection<select value={selectedInspection?.id ?? ''} onChange={(event) => setInspectionReturnId(event.target.value)} disabled={busy}>
            {requestedReturns.map((returnCase) => <option key={returnCase.id} value={returnCase.id}>{returnCase.number} · receipt {returnCase.retailSaleNumber}</option>)}
          </select></label>
          <label>Inspection reference<input value={inspectionReference} minLength={3} maxLength={160} onChange={(event) => setInspectionReference(event.target.value)} placeholder="GRN, quality sheet, or counter inspection record" required /></label>
          {selectedInspection?.lines.map((line) => {
            const draft = inspectionLines[line.id] ?? { outcome: 'resalable' as const, destinationBinId: '', conditionNotes: '' };
            const bins = eligibleBins(selectedInspection, draft.outcome);
            const sku = retailLineSku(revenue, line.original.itemVariantId);
            return <div className="retail-returns-workbench__inspection-line" key={line.id} data-outcome={draft.outcome}>
              <div className="retail-returns-workbench__inspection-heading"><div><strong>{retailLineName(revenue, line.original.itemVariantId, line.original.description)}</strong><small>{sku ? `${sku} · ` : ''}{line.quantity} returned · source {line.retailSaleLineId.slice(0, 8)}</small></div><BadgeCheck size={17} aria-hidden="true" /></div>
              <div className="retail-returns-workbench__inspection-inputs"><label>Condition outcome<select value={draft.outcome} onChange={(event) => changeInspectionOutcome(selectedInspection, line.id, event.target.value as RetailReturnOutcome)}><option value="resalable">Resalable stock</option><option value="quarantine">Quarantine</option><option value="damaged">Damaged / isolate</option></select></label><label>Physical destination<select value={draft.destinationBinId} onChange={(event) => setInspectionLines((current) => ({ ...current, [line.id]: { ...draft, destinationBinId: event.target.value } }))} required><option value="">Choose an eligible bin</option>{bins.map((bin) => { const zone = revenue.warehouseZones.find(({ id }) => id === bin.zoneId); return <option key={bin.id} value={bin.id}>{bin.code} · {bin.name} ({zone?.purpose ?? 'unknown'} zone)</option>; })}</select></label></div>
              {line.serialUnitIds.length ? <p className="retail-returns-workbench__serial-proof"><PackageCheck size={15} aria-hidden="true" /> Exact issued serials locked: {line.serialUnitIds.map((serialId) => revenue.serialUnits.find(({ id }) => id === serialId)?.serialNumber ?? serialId).join(', ')}</p> : null}
              <label>Condition notes<textarea value={draft.conditionNotes} minLength={4} maxLength={600} onChange={(event) => setInspectionLines((current) => ({ ...current, [line.id]: { ...draft, conditionNotes: event.target.value } }))} placeholder={draft.outcome === 'resalable' ? 'Packaging, seal, expiry and saleable condition checked.' : 'Describe the isolation reason and observed condition.'} required /></label>
              <small>{draft.outcome === 'resalable' ? 'Resalable goods can only target an available storage or picking bin.' : 'Quarantined and damaged goods can only target an available quarantine bin.'}</small>
            </div>;
          })}
          <button className="button button--primary" disabled={busy || !selectedInspection}>Record complete inspection <ArrowRight size={16} /></button>
          <small className="retail-returns-workbench__guard">Inspection classifies the goods but does not change availability. All lines must be inspected exactly once.</small>
        </form> : <p className="retail-returns-workbench__empty">No POS counter-return request is waiting for inspection. Delivery shipment RMAs remain governed in the fulfilment workbench.</p>}
      </article>
    </div>

    <div className="retail-returns-workbench__lower-grid">
      <article className="retail-returns-workbench__review-panel">
        <header><div><span>03 / Independent decision</span><h4>Approve physical stock only with separate custody</h4></div><ClipboardCheck size={19} aria-hidden="true" /></header>
        {independentReviews.length ? <div className="retail-returns-workbench__review-list">{independentReviews.map((returnCase) => <ReturnDecisionCard key={returnCase.id} returnCase={returnCase} activeActorId={activeActorId} busy={busy} revenue={revenue} onDecide={decideReturn} />)}</div> : <p className="retail-returns-workbench__empty">No inspected counter return is waiting for an independent decision.</p>}
        <p className="retail-returns-workbench__review-note"><ShieldCheck size={15} aria-hidden="true" /> The requester and inspector cannot approve the same counter return. Approval prepares physical re-entry, a COGS-reversal draft, and frozen return-credit evidence; settlement stays separately controlled.</p>
      </article>

      <article className="retail-returns-workbench__history">
        <header><div><span>Immutable return evidence</span><h4>Latest counter-return cases</h4></div><RefreshCcwDot size={19} aria-hidden="true" /></header>
        {latestReturns.length ? <div className="retail-returns-workbench__history-list">{latestReturns.map((returnCase) => <div key={returnCase.id} data-status={returnCase.status}><div><strong>{returnCase.number}</strong><small>{returnCase.retailSaleNumber} · invoice {returnCase.invoiceId}</small><small>{returnCase.reason}</small></div><div><em>{returnStatusLabel(returnCase.status)}</em><small>{indiaDate(returnCase.approvedAt ?? returnCase.rejectedAt ?? returnCase.inspectedAt ?? returnCase.requestedAt)}</small></div><div className="retail-returns-workbench__history-lines">{returnCase.lines.map((line) => <span key={line.id}>{line.quantity} × {retailLineName(revenue, line.original.itemVariantId, line.original.description)}{line.inspection ? ` · ${outcomeLabel(line.inspection.outcome)}` : ''}</span>)}</div>{returnCase.status === 'approved' && returnCase.financialCredit ? <small className="retail-returns-workbench__approved-note">GST credit evidence {returnCase.financialCredit.gstCreditEvidence.number} frozen · {formatInr(returnCase.financialCredit.availableAmount)} still available for a separately governed settlement.</small> : null}{returnCase.status === 'rejected' ? <small className="retail-returns-workbench__rejected-note">Rejected: {returnCase.rejectionReason}</small> : null}</div>)}</div> : <p className="retail-returns-workbench__empty">Counter-return evidence will appear here after a request is recorded.</p>}
      </article>
    </div>

    <article className="retail-returns-workbench__settlement-panel">
      <header><div><span>04 / Financial settlement</span><h4>Use the frozen return credit — never alter the original bill</h4></div><BadgeCheck size={19} aria-hidden="true" /></header>
      <p className="retail-returns-workbench__settlement-intro">Approval freezes GST/cess credit evidence at the original invoice values. Cash refunds, provider refunds, and store credit each have their own evidence, maker-checker and reconciliation controls.</p>
      {approvedFinancialReturns.length ? <div className="retail-returns-workbench__settlement-list">{approvedFinancialReturns.map((returnCase) => <ReturnSettlementCard
        key={returnCase.id}
        returnCase={returnCase}
        revenue={revenue}
        busy={busy}
        activeActorId={activeActorId}
        onRequest={onRequestRetailReturnSettlement}
        onDecide={onDecideRetailReturnSettlement}
        onConfirmProvider={onConfirmRetailReturnProviderRefund}
      />)}</div> : <p className="retail-returns-workbench__empty">Financial settlement appears only after a counter return has passed inspection and independent physical approval.</p>}
      <p className="retail-returns-workbench__review-note"><ShieldCheck size={15} aria-hidden="true" /> A provider reference is a request, not proof of money movement. UPI and card refunds remain pending until a different reconciler confirms the provider outcome.</p>
    </article>

    <RetailExchangePanel revenue={revenue} busy={busy} activeActorId={activeActorId} onCreate={onCreateRetailExchange} onDecide={onDecideRetailExchange} onPrepareCreditNote={onPrepareRetailCreditNoteReconciliation} onRecordCreditNote={onRecordRetailCreditNotePortalResponse} />

    {notice ? <p className="retail-returns-workbench__notice" role="status">{notice}</p> : null}
  </section>;
}

function RetailExchangePanel({ revenue, busy, activeActorId, onCreate, onDecide, onPrepareCreditNote, onRecordCreditNote }: { revenue: RevenueOpsSnapshot; busy: boolean; activeActorId: string; onCreate?: (input: CreateRetailExchangeInput) => Promise<void>; onDecide?: (input: DecideRetailExchangeInput) => Promise<void>; onPrepareCreditNote?: (input: PrepareRetailCreditNoteReconciliationInput) => Promise<void>; onRecordCreditNote?: (input: RecordRetailCreditNotePortalResponseInput) => Promise<void>; }): ReactNode {
  const eligibleReturns = revenue.retailReturns.filter((item) => item.status === 'approved' && (item.financialCredit?.availableAmount ?? 0) > 0);
  const first = eligibleReturns[0];
  const counter = first ? revenue.retailCounters.find((item) => item.id === first.counterId) : undefined;
  const shift = counter ? revenue.retailCashierShifts.find((item) => item.counterId === counter.id && item.status === 'open' && item.cashierId === activeActorId) : undefined;
  const sellBin = counter ? revenue.storageBins.find((item) => item.id === counter.sellFromBinId) : undefined;
  const [notice, setNotice] = useState('');
  const [returnId, setReturnId] = useState(first?.id ?? '');
  const [variantId, setVariantId] = useState(revenue.itemVariants.find((item) => item.active)?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  const [topUpMethod, setTopUpMethod] = useState<'cash' | 'upi' | 'card' | 'cheque' | 'other'>('cash');
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpReference, setTopUpReference] = useState('');
  const [exchangeDecisionEvidence, setExchangeDecisionEvidence] = useState<Record<string, string>>({});
  const [creditNoteReturnId, setCreditNoteReturnId] = useState('');
  const [creditNotePeriod, setCreditNotePeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [portalResponseDrafts, setPortalResponseDrafts] = useState<Record<string, PortalResponseDraft>>({});
  const selectedReturn = eligibleReturns.find((item) => item.id === returnId) ?? first;
  const submitExchange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onCreate || !selectedReturn || !counter || !shift || !sellBin) return;
    try {
      await onCreate({
        retailReturnId: selectedReturn.id,
        counterId: counter.id,
        cashierShiftId: shift.id,
        transactionKey: `EXCH-${Date.now()}`,
        replacementLines: [{ itemVariantId: variantId, binId: sellBin.id, serialUnitIds: [], quantity: Number(quantity) }],
        topUpTender: Number(topUpAmount) > 0 ? { method: topUpMethod, amount: Number(topUpAmount), reference: topUpReference } : undefined,
      });
      setNotice('Exchange request submitted for independent approval.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  async function decideExchange(
    exchange: RevenueOpsSnapshot['retailExchanges'][number],
    decision: DecideRetailExchangeInput['decision'],
  ): Promise<void> {
    const evidenceReference = exchangeDecisionEvidence[exchange.id]?.trim() ?? '';
    if (!onDecide || evidenceReference.length < 3) return;
    try {
      await onDecide({ id: exchange.id, decision, evidenceReference, expectedVersion: exchange.version });
      setExchangeDecisionEvidence((current) => ({ ...current, [exchange.id]: '' }));
      setNotice(decision === 'approved'
        ? 'Exchange approval recorded with the independent evidence you entered.'
        : 'Exchange rejection recorded with the independent evidence you entered.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function prepareCreditNoteWorkpaper(): Promise<void> {
    if (!onPrepareCreditNote || !creditNoteReturnId || !creditNotePeriod) return;
    try {
      await onPrepareCreditNote({ retailReturnId: creditNoteReturnId, filingPeriod: creditNotePeriod });
      setNotice('GST credit-note workpaper prepared locally. It has not been submitted to a government portal.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  function updatePortalResponseDraft(id: string, patch: Partial<PortalResponseDraft>): void {
    setPortalResponseDrafts((current) => ({
      ...current,
      [id]: {
        remoteStatus: '',
        externalReference: '',
        remotePayloadChecksum: '',
        responseMessage: '',
        ...current[id],
        ...patch,
      },
    }));
  }

  async function recordObservedPortalResponse(
    reconciliation: RevenueOpsSnapshot['retailCreditNoteReconciliations'][number],
  ): Promise<void> {
    const draft = portalResponseDrafts[reconciliation.id] ?? {
      remoteStatus: '', externalReference: '', remotePayloadChecksum: '', responseMessage: '',
    };
    const externalReference = draft.externalReference.trim();
    const remotePayloadChecksum = draft.remotePayloadChecksum.trim();
    const responseMessage = draft.responseMessage.trim();
    if (!onRecordCreditNote || !draft.remoteStatus || externalReference.length < 3 || responseMessage.length < 2) {
      setNotice('Record only a provider response you actually received: select its observed status and enter its reference and response detail.');
      return;
    }
    if (draft.remoteStatus === 'accepted' && remotePayloadChecksum.length < 16) {
      setNotice('An observed accepted response requires the provider payload checksum; do not substitute the local workpaper checksum.');
      return;
    }
    try {
      await onRecordCreditNote({
        id: reconciliation.id,
        expectedVersion: reconciliation.version,
        remoteStatus: draft.remoteStatus,
        externalReference,
        remotePayloadChecksum: remotePayloadChecksum || undefined,
        responseMessage,
      });
      setPortalResponseDrafts((current) => ({ ...current, [reconciliation.id]: { remoteStatus: '', externalReference: '', remotePayloadChecksum: '', responseMessage: '' } }));
      setNotice('Observed provider response recorded as local evidence. This workbench did not submit a filing or fabricate a provider result.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  return <article className="retail-returns-workbench__settlement-panel">
    <header>
      <div><span>05 / Exchange + GST credit-note evidence</span><h4>Convert approved return credit into a replacement sale</h4></div>
      <ArrowRight size={19} aria-hidden="true" />
    </header>
    <p className="retail-returns-workbench__settlement-intro">Replacement pricing is recomputed from the current GST/price book while the source credit stays frozen. Independent approval creates the replacement invoice and stock issue. This workbench prepares GST workpapers locally; it never submits or fabricates a portal response.</p>

    {onCreate ? <form className="retail-exchange-form" onSubmit={(event) => void submitExchange(event)}>
      <label>Approved return<select value={selectedReturn?.id ?? ''} onChange={(event) => setReturnId(event.target.value)}><option value="">Choose return credit</option>{eligibleReturns.map((item) => <option key={item.id} value={item.id}>{item.number} · {formatInr(item.financialCredit?.availableAmount ?? 0)} available</option>)}</select></label>
      <div className="retail-exchange-form__row">
        <label>Replacement SKU<select value={variantId} onChange={(event) => setVariantId(event.target.value)}>{revenue.itemVariants.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></label>
        <label>Quantity<input type="number" min="0.001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      </div>
      <div className="retail-exchange-form__row">
        <label>Top-up method<select value={topUpMethod} onChange={(event) => setTopUpMethod(event.target.value as typeof topUpMethod)}><option>cash</option><option>upi</option><option>card</option><option>cheque</option><option>other</option></select></label>
        <label>Top-up amount<input type="number" min="0" step="0.01" value={topUpAmount} onChange={(event) => setTopUpAmount(event.target.value)} placeholder="Only if replacement costs more" /></label>
        <label>Reference<input value={topUpReference} onChange={(event) => setTopUpReference(event.target.value)} placeholder="Tender reference" /></label>
      </div>
      <button className="button button--primary" disabled={busy || !selectedReturn || !shift || !variantId}>Submit exchange request</button>
      {!shift ? <small className="retail-returns-workbench__guard">Open cashier shift for this counter and actor is required.</small> : null}
    </form> : <p className="retail-returns-workbench__empty">Exchange actions are unavailable in this session.</p>}

    <div className="retail-returns-workbench__history-list">
      {revenue.retailExchanges.slice(0, 8).map((exchange) => {
        const independentReviewer = exchange.requestedBy !== activeActorId;
        const evidence = exchangeDecisionEvidence[exchange.id] ?? '';
        return <div key={exchange.id} data-status={exchange.status}>
          <div>
            <strong>{exchange.number}</strong>
            <small>{exchange.retailReturnNumber} → {formatInr(exchange.replacementGrandTotal)} replacement</small>
            <small>{exchange.replacementSaleId ? `Sale ${exchange.replacementSaleId}` : 'Awaiting independent approval'}</small>
          </div>
          <div>
            <em>{exchange.status}</em>
            {exchange.status === 'requested' && onDecide ? <div className="retail-returns-workbench__settlement-decision">
              <label>Independent exchange decision evidence<input value={evidence} minLength={3} maxLength={180} onChange={(event) => setExchangeDecisionEvidence((current) => ({ ...current, [exchange.id]: event.target.value }))} placeholder={independentReviewer ? 'Approval ticket, signed review, or replacement verification' : 'Independent reviewer required'} disabled={busy || !independentReviewer} /></label>
              <div>
                <button type="button" disabled={busy || !independentReviewer || evidence.trim().length < 3} onClick={() => void decideExchange(exchange, 'approved')}>Approve exchange</button>
                <button type="button" className="retail-returns-workbench__reject" disabled={busy || !independentReviewer || evidence.trim().length < 3} onClick={() => void decideExchange(exchange, 'rejected')}>Reject exchange</button>
              </div>
              {!independentReviewer ? <small>The exchange requester cannot approve or reject it.</small> : null}
            </div> : null}
          </div>
        </div>;
      })}
    </div>

    <div className="retail-exchange-credit-note">
      <strong>GST credit-note reconciliation</strong>
      <div className="retail-exchange-form__row">
        <label>Approved return<select value={creditNoteReturnId} onChange={(event) => setCreditNoteReturnId(event.target.value)}><option value="">Choose return</option>{revenue.retailReturns.filter((item) => item.status === 'approved' && item.financialCredit).map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label>
        <label>Filing period<input type="month" value={creditNotePeriod} onChange={(event) => setCreditNotePeriod(event.target.value)} /></label>
        <button type="button" disabled={busy || !onPrepareCreditNote || !creditNoteReturnId || !creditNotePeriod} onClick={() => void prepareCreditNoteWorkpaper()}>Prepare local workpaper</button>
      </div>
      <small>This creates an internal workpaper only. No GSP/IRP or GST portal submission is attempted from this screen.</small>

      {revenue.retailCreditNoteReconciliations.slice(0, 8).map((item) => {
        const draft = portalResponseDrafts[item.id] ?? { remoteStatus: '', externalReference: '', remotePayloadChecksum: '', responseMessage: '' };
        const canRecord = Boolean(
          draft.remoteStatus
          && draft.externalReference.trim().length >= 3
          && draft.responseMessage.trim().length >= 2
          && (draft.remoteStatus !== 'accepted' || draft.remotePayloadChecksum.trim().length >= 16),
        );
        return <div key={item.id}>
          <small>{item.number} · {item.status} · {item.totalCredit.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} · local checksum {item.payloadChecksum.slice(0, 10)}</small>
          {onRecordCreditNote && (item.status === 'prepared' || item.status === 'drift') ? <form className="retail-returns-workbench__settlement-decision" onSubmit={(event) => { event.preventDefault(); void recordObservedPortalResponse(item); }}>
            <label>Observed provider status<select value={draft.remoteStatus} onChange={(event) => updatePortalResponseDraft(item.id, { remoteStatus: event.target.value as PortalResponseDraft['remoteStatus'] })} disabled={busy}><option value="">Choose an actually received status</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="missing">Missing / not found</option></select></label>
            <label>Provider response reference<input value={draft.externalReference} minLength={3} maxLength={180} onChange={(event) => updatePortalResponseDraft(item.id, { externalReference: event.target.value })} placeholder="Provider ticket, ARN, or response reference" disabled={busy} required /></label>
            <label>Provider payload checksum{draft.remoteStatus === 'accepted' ? <input value={draft.remotePayloadChecksum} minLength={16} maxLength={180} onChange={(event) => updatePortalResponseDraft(item.id, { remotePayloadChecksum: event.target.value })} placeholder="Copy from the received provider response" disabled={busy} required /> : <input value={draft.remotePayloadChecksum} maxLength={180} onChange={(event) => updatePortalResponseDraft(item.id, { remotePayloadChecksum: event.target.value })} placeholder="Optional response checksum, if one was received" disabled={busy} />}</label>
            <label>Provider response detail<input value={draft.responseMessage} minLength={2} maxLength={500} onChange={(event) => updatePortalResponseDraft(item.id, { responseMessage: event.target.value })} placeholder="Copy or accurately summarize the received response" disabled={busy} required /></label>
            <button type="submit" disabled={busy || !canRecord}>Record received provider response</button>
            <small>Enter only evidence you actually received from the chosen provider. This records local reconciliation evidence; it does not submit, certify, or invent a portal result.</small>
          </form> : null}
        </div>;
      })}
    </div>

    {notice ? <p className="retail-returns-workbench__notice" role="status">{notice}</p> : null}
  </article>;
}

function ReturnDecisionCard({
  returnCase,
  activeActorId,
  busy,
  revenue,
  onDecide,
}: {
  returnCase: RetailReturn;
  activeActorId: string;
  busy: boolean;
  revenue: RevenueOpsSnapshot;
  onDecide: (returnCase: RetailReturn, decision: 'approved' | 'rejected', evidenceReference: string) => Promise<void>;
}): ReactNode {
  const [evidenceReference, setEvidenceReference] = useState('');
  const independent = returnCase.requestedBy !== activeActorId && returnCase.inspectedBy !== activeActorId;
  return <div className="retail-returns-workbench__decision-card" data-eligible={independent}>
    <div className="retail-returns-workbench__decision-header"><div><strong>{returnCase.number}</strong><small>Receipt {returnCase.retailSaleNumber} · requested by {returnCase.requestedBy} · inspected by {returnCase.inspectedBy ?? 'unrecorded'}</small></div><span>{returnCase.lines.length} line{returnCase.lines.length === 1 ? '' : 's'}</span></div>
    <div className="retail-returns-workbench__decision-lines">{returnCase.lines.map((line) => <div key={line.id}><Box size={15} aria-hidden="true" /><span><strong>{line.quantity} × {retailLineName(revenue, line.original.itemVariantId, line.original.description)}</strong><small>{line.inspection ? `${outcomeLabel(line.inspection.outcome)} to ${line.inspection.destinationBinId}` : 'Inspection missing'}</small></span></div>)}</div>
    <label>Independent decision evidence / rejection reason<input value={evidenceReference} minLength={4} maxLength={500} onChange={(event) => setEvidenceReference(event.target.value)} placeholder={independent ? 'Approval evidence or clear rejection reason' : 'Independent actor required'} disabled={!independent || busy} /></label>
    <div className="retail-returns-workbench__decision-actions"><button type="button" disabled={!independent || busy || evidenceReference.trim().length < 4} onClick={() => void onDecide(returnCase, 'approved', evidenceReference)}>Approve physical re-entry</button><button type="button" className="retail-returns-workbench__reject" disabled={!independent || busy || evidenceReference.trim().length < 4} onClick={() => void onDecide(returnCase, 'rejected', evidenceReference)}>Reject return</button></div>
    {!independent ? <small className="retail-returns-workbench__guard"><CircleAlert size={13} aria-hidden="true" /> You cannot decide this case because you requested or inspected it.</small> : null}
  </div>;
}

function ReturnSettlementCard({
  returnCase,
  revenue,
  busy,
  activeActorId,
  onRequest,
  onDecide,
  onConfirmProvider,
}: {
  returnCase: RetailReturn;
  revenue: RevenueOpsSnapshot;
  busy: boolean;
  activeActorId: string;
  onRequest: (input: RequestRetailReturnSettlementInput) => Promise<void>;
  onDecide: (input: DecideRetailReturnSettlementInput) => Promise<void>;
  onConfirmProvider: (input: ConfirmRetailReturnProviderRefundInput) => Promise<void>;
}): ReactNode {
  // Parent selection guarantees the financial credit exists; retaining the
  // invariant here keeps hook order stable across rerenders.
  const credit = returnCase.financialCredit!;
  const counter = revenue.retailCounters.find(({ id }) => id === returnCase.counterId);
  const namedCustomer = Boolean(counter && returnCase.customerAccountId !== counter.walkInAccountId);
  const openCashierShifts = revenue.retailCashierShifts.filter((shift) => (
    shift.counterId === returnCase.counterId && shift.status === 'open' && shift.cashierId === activeActorId
  ));
  const [method, setMethod] = useState<RequestRetailReturnSettlementInput['method']>('cash-refund');
  const [amount, setAmount] = useState(String(credit.availableAmount));
  const [cashierShiftId, setCashierShiftId] = useState(openCashierShifts[0]?.id ?? '');
  const [providerMethod, setProviderMethod] = useState<'upi' | 'card'>('upi');
  const [providerReference, setProviderReference] = useState('');
  const [requestEvidence, setRequestEvidence] = useState('');
  const [requestKey, setRequestKey] = useState(() => newSettlementTransactionKey('RTRS'));
  const [decisionEvidence, setDecisionEvidence] = useState<Record<string, string>>({});
  const [confirmationReference, setConfirmationReference] = useState<Record<string, string>>({});
  const [confirmationKeys, setConfirmationKeys] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setAmount(String(credit.availableAmount));
  }, [credit.availableAmount, returnCase.id]);

  useEffect(() => {
    if (openCashierShifts.some(({ id }) => id === cashierShiftId)) return;
    setCashierShiftId(openCashierShifts[0]?.id ?? '');
  }, [cashierShiftId, openCashierShifts]);

  const gst = credit.gstCreditEvidence;
  const activeStoreCredits = revenue.retailStoreCredits.filter((storeCredit) => storeCredit.retailReturnId === returnCase.id);

  async function submitSettlementRequest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const requestedAmount = Number(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      setNotice('Enter the requested amount in INR. The server will validate it against the frozen available return credit.');
      return;
    }
    if (method === 'cash-refund' && !cashierShiftId) {
      setNotice('Cash refund requires the active cashier drawer for this counter.');
      return;
    }
    if (method === 'store-credit' && !namedCustomer) {
      setNotice('Store credit can only be issued to a named customer, not a walk-in account.');
      return;
    }
    setNotice('');
    try {
      await onRequest({
        retailReturnId: returnCase.id,
        expectedVersion: returnCase.version,
        transactionKey: requestKey,
        method,
        amount: requestedAmount,
        cashierShiftId: method === 'cash-refund' ? cashierShiftId : undefined,
        providerMethod: method === 'provider-refund' ? providerMethod : undefined,
        providerReference: method === 'provider-refund' ? providerReference : undefined,
        storeCreditAccountId: method === 'store-credit' ? returnCase.customerAccountId : undefined,
        evidenceReference: requestEvidence,
      });
      setRequestKey(newSettlementTransactionKey('RTRS'));
      setRequestEvidence('');
      setProviderReference('');
      setNotice('Settlement request recorded. It remains unavailable for further use until the required independent decision or provider confirmation is complete.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function decideSettlement(settlementId: string, decision: 'approved' | 'rejected'): Promise<void> {
    const evidenceReference = decisionEvidence[settlementId] ?? '';
    setNotice('');
    try {
      await onDecide({
        retailReturnId: returnCase.id,
        settlementId,
        expectedVersion: returnCase.version,
        decision,
        evidenceReference,
      });
      setDecisionEvidence((current) => ({ ...current, [settlementId]: '' }));
      setNotice(decision === 'approved'
        ? 'Independent settlement approval recorded. Cash is now reflected in drawer custody; provider refunds still need provider confirmation.'
        : 'Settlement request rejected. The reserved frozen return credit was released without changing the original sale.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function confirmProvider(settlementId: string, decision: 'confirmed' | 'rejected'): Promise<void> {
    const providerConfirmationReference = confirmationReference[settlementId] ?? '';
    // Keep the visible durable key stable across a retry. The backend will
    // replay only an identical confirmation payload for this key.
    const transactionKey = confirmationKeys[settlementId] ?? `RTRPC-${settlementId}`;
    setNotice('');
    try {
      await onConfirmProvider({
        retailReturnId: returnCase.id,
        settlementId,
        expectedVersion: returnCase.version,
        transactionKey,
        decision,
        providerConfirmationReference,
      });
      setConfirmationReference((current) => ({ ...current, [settlementId]: '' }));
      setConfirmationKeys((current) => ({ ...current, [settlementId]: newSettlementTransactionKey('RTRPC') }));
      setNotice(decision === 'confirmed'
        ? 'Provider refund confirmation recorded. The frozen return credit is now settled for this amount.'
        : 'Provider refund rejection recorded. The reserved frozen return credit is available for a new governed settlement request.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  return <section className="retail-returns-workbench__settlement-card">
    <header className="retail-returns-workbench__settlement-card-head">
      <div><span>{returnCase.number} · Frozen financial credit</span><h5>{gst.number} · {formatInr(credit.issuedAmount)}</h5><small>Source invoice {gst.sourceInvoiceNumber} dated {gst.sourceInvoiceDate} · GSTIN {gst.supplierGstin}</small></div>
      <em data-status={credit.status}>{credit.status.replaceAll('-', ' ')}</em>
    </header>

    <dl className="retail-returns-workbench__credit-balances">
      <div><dt>Available</dt><dd>{formatInr(credit.availableAmount)}</dd></div>
      <div><dt>Reserved</dt><dd>{formatInr(credit.reservedAmount)}</dd></div>
      <div><dt>Settled</dt><dd>{formatInr(credit.settledAmount)}</dd></div>
      <div><dt>GST + cess</dt><dd>{formatInr(gst.totalTax)}</dd></div>
    </dl>

    <details className="retail-returns-workbench__gst-proof">
      <summary>Frozen GST credit evidence · taxable {formatInr(gst.taxableValue)} · CGST {formatInr(gst.cgst)} · SGST {formatInr(gst.sgst)} · IGST {formatInr(gst.igst)} · cess {formatInr(gst.cess)}</summary>
      <div>{gst.lines.map((line) => <span key={line.retailReturnLineId}>{line.hsnSac} · {line.quantity} unit{line.quantity === 1 ? '' : 's'} · tax {formatInr(line.totalTax)} · credit {formatInr(line.totalCredit)}</span>)}</div>
      <small>Checksum {gst.checksum.slice(0, 16)}… · frozen {indiaDate(gst.frozenAt)} by {gst.frozenBy}</small>
      <div style={{ marginTop: '8px' }}>
        <button
          type="button"
          className="button button--quiet"
          style={{ fontSize: '0.66rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          onClick={() => {
            const workpaper = {
              gstin: gst.supplierGstin,
              creditNoteNumber: gst.number,
              creditNoteDate: gst.frozenAt,
              originalInvoiceNumber: gst.sourceInvoiceNumber,
              originalInvoiceDate: gst.sourceInvoiceDate,
              treatment: gst.treatment,
              taxableValue: gst.taxableValue,
              cgst: gst.cgst,
              sgst: gst.sgst,
              igst: gst.igst,
              cess: gst.cess,
              totalCredit: gst.totalCredit,
              lines: gst.lines,
              gstr1Table: '9B - Credit/Debit Notes (Registered/Unregistered)',
              checksum: gst.checksum,
            };
            void navigator.clipboard.writeText(JSON.stringify(workpaper, null, 2));
            setNotice(`GSTR-1 Table 9B Credit Note JSON workpaper (${gst.number}) copied to clipboard.`);
          }}
        >
          <FileSpreadsheet size={13} /> Copy GSTR-1 Table 9B Workpaper JSON
        </button>
      </div>
    </details>

    {credit.availableAmount > 0 ? <form className="retail-returns-workbench__settlement-request" onSubmit={(event) => void submitSettlementRequest(event)}>
      <div className="retail-returns-workbench__settlement-fields">
        <label>Settlement method<select value={method} onChange={(event) => setMethod(event.target.value as RequestRetailReturnSettlementInput['method'])} disabled={busy}>
          <option value="cash-refund">Cash refund from current drawer</option>
          <option value="provider-refund">UPI / card provider refund</option>
          <option value="store-credit" disabled={!namedCustomer}>Named-customer store credit{namedCustomer ? '' : ' (walk-in not eligible)'}</option>
        </select></label>
        <label>Requested amount (INR)<input type="number" min="0.01" step="0.01" max={credit.availableAmount} value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} required /></label>
      </div>
      {method === 'cash-refund' ? <label>Active drawer under your custody<select value={cashierShiftId} onChange={(event) => setCashierShiftId(event.target.value)} disabled={busy} required><option value="">Choose open cashier shift</option>{openCashierShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.number} · opened {indiaDate(shift.openedAt)}</option>)}</select><small>Only the assigned cashier may request a cash refund. The server rechecks counter, custody and open-drawer state.</small></label> : null}
      {method === 'provider-refund' ? <div className="retail-returns-workbench__settlement-fields"><label>Original tender rail<select value={providerMethod} onChange={(event) => setProviderMethod(event.target.value as 'upi' | 'card')} disabled={busy}><option value="upi">UPI</option><option value="card">Card</option></select></label><label>Provider request reference<input value={providerReference} minLength={6} maxLength={160} onChange={(event) => setProviderReference(event.target.value)} placeholder="Refund request / provider reference" disabled={busy} required /></label></div> : null}
      {method === 'store-credit' ? <p className="retail-returns-workbench__store-credit-note"><BadgeCheck size={15} aria-hidden="true" /> Store credit will be issued only to the named account <strong>{returnCase.customerAccountId}</strong>. It is a dedicated liability, not an AR adjustment or cash payment.</p> : null}
      <label>Request evidence reference<input value={requestEvidence} minLength={3} maxLength={160} onChange={(event) => setRequestEvidence(event.target.value)} placeholder="Return voucher, cashier record, or provider request evidence" disabled={busy} required /></label>
      <div className="retail-returns-workbench__request-footer"><span>Durable settlement key <code>{requestKey}</code></span><button type="submit" className="button button--primary" disabled={busy}>Record governed settlement request <ArrowRight size={16} /></button></div>
    </form> : <p className="retail-returns-workbench__settled-note">No available balance remains. The server-derived settlement history below is the source of truth.</p>}

    {credit.settlements.length ? <div className="retail-returns-workbench__settlement-history"><h6>Settlement history</h6>{credit.settlements.map((settlement) => {
      const independentDecision = settlement.requestedBy !== activeActorId && returnCase.requestedBy !== activeActorId && returnCase.inspectedBy !== activeActorId;
      const independentConfirmation = settlement.requestedBy !== activeActorId && settlement.decidedBy !== activeActorId;
      const decisionValue = decisionEvidence[settlement.id] ?? '';
      const confirmationValue = confirmationReference[settlement.id] ?? '';
      const confirmationKey = confirmationKeys[settlement.id] ?? `RTRPC-${settlement.id}`;
      return <div key={settlement.id} className="retail-returns-workbench__settlement-entry" data-status={settlement.status}>
        <div><strong>{settlement.number} · {settlement.method.replaceAll('-', ' ')}</strong><small>{formatInr(settlement.amount)} · requested by {settlement.requestedBy} · {indiaDate(settlement.requestedAt)}</small><small>Request evidence: {settlement.requestEvidenceReference}</small></div>
        <em>{settlement.status.replaceAll('-', ' ')}</em>
        {settlement.status === 'requested' ? <div className="retail-returns-workbench__settlement-decision"><label>Independent decision evidence<input value={decisionValue} minLength={3} maxLength={240} onChange={(event) => setDecisionEvidence((current) => ({ ...current, [settlement.id]: event.target.value }))} placeholder={independentDecision ? 'Approval evidence or rejection reason' : 'Independent actor required'} disabled={busy || !independentDecision} /></label><div><button type="button" disabled={busy || !independentDecision || decisionValue.trim().length < 3} onClick={() => void decideSettlement(settlement.id, 'approved')}>Approve settlement</button><button type="button" className="retail-returns-workbench__reject" disabled={busy || !independentDecision || decisionValue.trim().length < 3} onClick={() => void decideSettlement(settlement.id, 'rejected')}>Reject settlement</button></div>{!independentDecision ? <small><CircleAlert size={13} aria-hidden="true" /> The requester, return requester, and inspector cannot decide this settlement.</small> : null}</div> : null}
        {settlement.status === 'provider-refund-pending' ? <div className="retail-returns-workbench__settlement-decision"><label>Provider confirmation / rejection reference<input value={confirmationValue} minLength={6} maxLength={160} onChange={(event) => setConfirmationReference((current) => ({ ...current, [settlement.id]: event.target.value }))} placeholder="Provider transaction / reconciliation evidence" disabled={busy || !independentConfirmation} /></label><small>Durable confirmation key <code>{confirmationKey}</code></small><div><button type="button" disabled={busy || !independentConfirmation || confirmationValue.trim().length < 6} onClick={() => void confirmProvider(settlement.id, 'confirmed')}>Confirm provider refund</button><button type="button" className="retail-returns-workbench__reject" disabled={busy || !independentConfirmation || confirmationValue.trim().length < 6} onClick={() => void confirmProvider(settlement.id, 'rejected')}>Record provider rejection</button></div>{!independentConfirmation ? <small><CircleAlert size={13} aria-hidden="true" /> A different reconciler must confirm this provider result.</small> : null}</div> : null}
        {settlement.status === 'cash-refunded' ? <small className="retail-returns-workbench__settled-note">Cash drawer movement is complete and will reduce the expected close balance for shift {settlement.cashierShiftId}.</small> : null}
        {settlement.status === 'provider-refund-pending' ? <small className="retail-returns-workbench__pending-note">Provider refund has been approved but is not settled until the provider outcome is independently confirmed.</small> : null}
      </div>;
    })}</div> : null}

    {activeStoreCredits.length ? <div className="retail-returns-workbench__store-credit-ledger"><h6>Issued customer store credit</h6>{activeStoreCredits.map((storeCredit) => <div key={storeCredit.id}><span><strong>{storeCredit.number}</strong><small>{storeCredit.customerAccountId} · issued {indiaDate(storeCredit.issuedAt)} · evidence {storeCredit.evidenceReference}</small></span><em>{formatInr(storeCredit.availableAmount)} available</em></div>)}</div> : null}
    {notice ? <p className="retail-returns-workbench__notice" role="status">{notice}</p> : null}
  </section>;
}
