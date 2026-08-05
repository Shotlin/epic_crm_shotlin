import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Boxes, CheckCircle2, GitBranch, ShieldCheck } from 'lucide-react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type {
  CreateRetailInterBranchTransferInput,
  DecideRetailInterBranchTransferInput,
  DispatchRetailInterBranchTransferInput,
  ReceiveRetailInterBranchTransferInput,
} from '../shared/retail-interbranch-contracts';

function inr(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The inter-branch action could not be completed.';
}

type EvidenceByRecord = Record<string, string>;
type ArrivalEvidence = { quantities: string; scanReference: string };

export function RetailInterBranchWorkbench({
  revenue,
  busy,
  activeActorId,
  onCreate,
  onDecide,
  onDispatch,
  onReceive,
}: {
  revenue: RevenueOpsSnapshot;
  busy: boolean;
  activeActorId: string;
  onCreate?: (input: CreateRetailInterBranchTransferInput) => Promise<void>;
  onDecide?: (input: DecideRetailInterBranchTransferInput) => Promise<void>;
  onDispatch?: (input: DispatchRetailInterBranchTransferInput) => Promise<void>;
  onReceive?: (input: ReceiveRetailInterBranchTransferInput) => Promise<void>;
}): ReactNode {
  const warehouses = useMemo(() => revenue.warehouses.filter((item) => item.active), [revenue.warehouses]);
  const variants = useMemo(() => revenue.itemVariants.filter((item) => item.active), [revenue.itemVariants]);
  const [direction, setDirection] = useState<'outbound' | 'return-to-ho'>('outbound');
  const [destinationBranchId, setDestinationBranchId] = useState('branch-head-office');
  const [sourceWarehouseId, setSourceWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState(warehouses[1]?.id ?? warehouses[0]?.id ?? '');
  const [sourceBinId, setSourceBinId] = useState('');
  const [destinationBinId, setDestinationBinId] = useState('');
  const [itemVariantId, setItemVariantId] = useState(variants[0]?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  const [notice, setNotice] = useState('');
  const [approvalEvidence, setApprovalEvidence] = useState<EvidenceByRecord>({});
  const [dispatchManifestEvidence, setDispatchManifestEvidence] = useState<EvidenceByRecord>({});
  const [dispatchScanEvidence, setDispatchScanEvidence] = useState<EvidenceByRecord>({});
  const [arrivalEvidence, setArrivalEvidence] = useState<Record<string, ArrivalEvidence>>({});

  const sourceBins = revenue.storageBins.filter((bin) => (
    revenue.warehouseZones.find((zone) => zone.id === bin.zoneId)?.warehouseId === sourceWarehouseId
    && bin.status === 'available'
  ));
  const destinationBins = revenue.storageBins.filter((bin) => (
    revenue.warehouseZones.find((zone) => zone.id === bin.zoneId)?.warehouseId === destinationWarehouseId
    && bin.status === 'available'
  ));

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!onCreate || !sourceWarehouseId || !destinationWarehouseId || !sourceBinId || !destinationBinId || !itemVariantId) return;
    try {
      await onCreate({
        direction,
        destinationBranchId,
        sourceWarehouseId,
        destinationWarehouseId,
        sourceBinId,
        destinationBinId,
        lines: [{ itemVariantId, quantity: Number(quantity), serialUnitIds: [] }],
      });
      setNotice('Transfer request submitted. It remains locked until an independent reviewer records approval evidence.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function decideTransfer(transfer: RevenueOpsSnapshot['retailInterBranchTransfers'][number]): Promise<void> {
    const evidenceReference = approvalEvidence[transfer.id]?.trim() ?? '';
    if (!onDecide || evidenceReference.length < 3) return;
    try {
      await onDecide({ id: transfer.id, decision: 'approved', evidenceReference, expectedVersion: transfer.version });
      setApprovalEvidence((current) => ({ ...current, [transfer.id]: '' }));
      setNotice('Independent transfer approval recorded with the evidence you entered.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function dispatchTransfer(transfer: RevenueOpsSnapshot['retailInterBranchTransfers'][number]): Promise<void> {
    const manifest = dispatchManifestEvidence[transfer.id]?.trim() ?? '';
    const scanner = dispatchScanEvidence[transfer.id]?.trim() ?? '';
    if (!onDispatch || manifest.length < 3 || scanner.length < 3) return;
    try {
      await onDispatch({
        id: transfer.id,
        evidenceReference: `Manifest ${manifest}; source scan/seal ${scanner}`,
        expectedVersion: transfer.version,
      });
      setDispatchManifestEvidence((current) => ({ ...current, [transfer.id]: '' }));
      setDispatchScanEvidence((current) => ({ ...current, [transfer.id]: '' }));
      setNotice('Dispatch custody recorded using the manifest and source-scanner evidence you entered.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function receiveTransfer(transfer: RevenueOpsSnapshot['retailInterBranchTransfers'][number]): Promise<void> {
    const evidence = arrivalEvidence[transfer.id] ?? { quantities: '', scanReference: '' };
    const quantities = evidence.quantities.trim();
    const scanner = evidence.scanReference.trim();
    if (!onReceive || quantities.length < 3 || scanner.length < 3) return;
    try {
      await onReceive({
        id: transfer.id,
        evidenceReference: `Received quantities ${quantities}; destination scan/count ${scanner}`,
        expectedVersion: transfer.version,
      });
      setArrivalEvidence((current) => ({ ...current, [transfer.id]: { quantities: '', scanReference: '' } }));
      setNotice('Destination arrival recorded using the received-quantity and scanner/count evidence you entered.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  return <section className="retail-returns-workbench__settlement-panel" aria-labelledby="retail-interbranch-title">
    <header>
      <div>
        <span><GitBranch size={14} aria-hidden="true" /> 06 / Inter-branch stock control</span>
        <h4 id="retail-interbranch-title">Dispatch, verify arrival, and preserve inventory custody</h4>
      </div>
      <ShieldCheck size={19} aria-hidden="true" />
    </header>
    <p className="retail-returns-workbench__settlement-intro">Branch transfers use the traceable stock engine and an independent approval, manifest, scan, and receiving-evidence chain. “Return to HO” is a directional, auditable transfer—not a silent quantity adjustment.</p>

    {onCreate ? <form className="retail-exchange-form" onSubmit={(event) => void submit(event)}>
      <div className="retail-exchange-form__row">
        <label>Movement<select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="outbound">Branch outbound</option><option value="return-to-ho">Return to head office</option></select></label>
        <label>Destination branch<input value={destinationBranchId} onChange={(event) => setDestinationBranchId(event.target.value)} placeholder="branch-head-office" required /></label>
      </div>
      <div className="retail-exchange-form__row">
        <label>Source warehouse<select value={sourceWarehouseId} onChange={(event) => { setSourceWarehouseId(event.target.value); setSourceBinId(''); }}>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label>Source bin<select value={sourceBinId} onChange={(event) => setSourceBinId(event.target.value)}><option value="">Choose source bin</option>{sourceBins.map((bin) => <option key={bin.id} value={bin.id}>{bin.code} · {bin.name}</option>)}</select></label>
      </div>
      <div className="retail-exchange-form__row">
        <label>Destination warehouse<select value={destinationWarehouseId} onChange={(event) => { setDestinationWarehouseId(event.target.value); setDestinationBinId(''); }}>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label>Destination bin<select value={destinationBinId} onChange={(event) => setDestinationBinId(event.target.value)}><option value="">Choose destination bin</option>{destinationBins.map((bin) => <option key={bin.id} value={bin.id}>{bin.code} · {bin.name}</option>)}</select></label>
      </div>
      <div className="retail-exchange-form__row">
        <label>SKU<select value={itemVariantId} onChange={(event) => setItemVariantId(event.target.value)}>{variants.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></label>
        <label>Quantity<input type="number" min="0.001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      </div>
      <button className="button button--primary" disabled={busy || !sourceBinId || !destinationBinId || !variants.length}>Create governed transfer request</button>
    </form> : null}

    <div className="retail-returns-workbench__history-list">
      {revenue.retailInterBranchTransfers.slice(0, 12).map((transfer) => {
        const approvalEligible = transfer.requestedBy !== activeActorId;
        const dispatchEligible = transfer.approvedBy !== activeActorId;
        const arrivalEligible = transfer.dispatchedBy !== activeActorId;
        const approval = approvalEvidence[transfer.id] ?? '';
        const manifest = dispatchManifestEvidence[transfer.id] ?? '';
        const sourceScan = dispatchScanEvidence[transfer.id] ?? '';
        const arrival = arrivalEvidence[transfer.id] ?? { quantities: '', scanReference: '' };
        return <div key={transfer.id} data-status={transfer.status}>
          <div>
            <strong>{transfer.number} · {transfer.direction === 'return-to-ho' ? 'Return to HO' : 'Outbound'}</strong>
            <small>{transfer.originBranchId} → {transfer.destinationBranchId} · {transfer.lines.length} line(s) · {inr(transfer.totalValue)}</small>
            <small>{transfer.status === 'arrived' ? `Received by ${transfer.arrivedBy}` : transfer.status === 'dispatched' ? `Dispatched by ${transfer.dispatchedBy}` : 'Awaiting next custody gate'}</small>
          </div>
          <div>
            <em>{transfer.status}</em>
            {transfer.status === 'draft' && onDecide ? <div className="retail-returns-workbench__settlement-decision">
              <label>Independent approval evidence<input value={approval} minLength={3} maxLength={180} onChange={(event) => setApprovalEvidence((current) => ({ ...current, [transfer.id]: event.target.value }))} placeholder={approvalEligible ? 'Approval ticket, signed checklist, or stock accountability review' : 'Independent reviewer required'} disabled={busy || !approvalEligible} /></label>
              <button type="button" disabled={busy || !approvalEligible || approval.trim().length < 3} onClick={() => void decideTransfer(transfer)}>Approve with evidence</button>
              {!approvalEligible ? <small>The transfer requester cannot approve it.</small> : null}
            </div> : null}
            {transfer.status === 'approved' && onDispatch ? <div className="retail-returns-workbench__settlement-decision">
              <label>Dispatch manifest reference<input value={manifest} minLength={3} maxLength={100} onChange={(event) => setDispatchManifestEvidence((current) => ({ ...current, [transfer.id]: event.target.value }))} placeholder={dispatchEligible ? 'Manifest / vehicle / seal reference' : 'Independent logistics operator required'} disabled={busy || !dispatchEligible} /></label>
              <label>Source scanner or seal evidence<input value={sourceScan} minLength={3} maxLength={100} onChange={(event) => setDispatchScanEvidence((current) => ({ ...current, [transfer.id]: event.target.value }))} placeholder={dispatchEligible ? 'Scanner batch, scan log, or seal record' : 'Independent logistics operator required'} disabled={busy || !dispatchEligible} /></label>
              <button type="button" disabled={busy || !dispatchEligible || manifest.trim().length < 3 || sourceScan.trim().length < 3} onClick={() => void dispatchTransfer(transfer)}><ArrowUpFromLine size={14} /> Record dispatch custody</button>
              {!dispatchEligible ? <small>The approver cannot dispatch this transfer.</small> : null}
            </div> : null}
            {transfer.status === 'dispatched' && onReceive ? <div className="retail-returns-workbench__settlement-decision">
              <label>Received quantities evidence<input value={arrival.quantities} minLength={3} maxLength={100} onChange={(event) => setArrivalEvidence((current) => ({ ...current, [transfer.id]: { ...arrival, quantities: event.target.value } }))} placeholder={arrivalEligible ? 'Per-SKU received counts / discrepancy record' : 'Destination custodian required'} disabled={busy || !arrivalEligible} /></label>
              <label>Destination scanner or count evidence<input value={arrival.scanReference} minLength={3} maxLength={100} onChange={(event) => setArrivalEvidence((current) => ({ ...current, [transfer.id]: { ...arrival, scanReference: event.target.value } }))} placeholder={arrivalEligible ? 'Scanner batch, count sheet, or receiving log' : 'Destination custodian required'} disabled={busy || !arrivalEligible} /></label>
              <button type="button" disabled={busy || !arrivalEligible || arrival.quantities.trim().length < 3 || arrival.scanReference.trim().length < 3} onClick={() => void receiveTransfer(transfer)}><ArrowDownToLine size={14} /> Verify arrival with evidence</button>
              {!arrivalEligible ? <small>The dispatch operator cannot verify destination arrival.</small> : null}
            </div> : null}
            {transfer.status === 'arrived' ? <CheckCircle2 size={16} aria-label="Arrived" /> : null}
          </div>
        </div>;
      })}
    </div>
    <small className="retail-returns-workbench__guard"><Boxes size={14} aria-hidden="true" /> No transfer is treated as received until a different destination custodian records received-quantity and scanner/count evidence and the in-transit accounting handoff balances.</small>
    {notice ? <p className="retail-returns-workbench__notice" role="status">{notice}</p> : null}
  </section>;
}
