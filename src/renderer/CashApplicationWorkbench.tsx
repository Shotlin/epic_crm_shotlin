import { Plus, ReceiptIndianRupee, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { PartySnapshot } from '../shared/party-contracts';
import type { ApplyUnappliedReceiptInput, RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

type ApplicationRow = {
  receivableId: string;
  amount: string;
};

export interface CashApplicationWorkbenchProps {
  revenue: RevenueOpsSnapshot;
  party: PartySnapshot;
  busy: boolean;
  onApplyUnappliedReceipt: (input: ApplyUnappliedReceiptInput) => Promise<void>;
}

function isOpenReceivable(status: RevenueOpsSnapshot['receivables'][number]['status']): boolean {
  return ['current', 'due', 'overdue', 'partially-paid'].includes(status);
}

/**
 * Reclassifies already-recorded cash inside its original draft payment journal.
 * It intentionally cannot create a new receipt, cross a customer/scope boundary,
 * or alter reconciled/exported evidence.
 */
export function CashApplicationWorkbench({ revenue, party, busy, onApplyUnappliedReceipt }: CashApplicationWorkbenchProps): ReactNode {
  const unappliedReceipts = useMemo(
    () => revenue.paymentReceipts.filter((receipt) => receipt.status === 'recorded' && receipt.unappliedAmount > 0),
    [revenue.paymentReceipts],
  );
  const [selectedReceiptId, setSelectedReceiptId] = useState('');
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [evidenceReference, setEvidenceReference] = useState('');
  const [message, setMessage] = useState('');
  const previousReceiptRef = useRef<{ id: string; version: number } | null>(null);
  const receiptIds = unappliedReceipts.map(({ id }) => id).join('|');

  useEffect(() => {
    setSelectedReceiptId((current) => unappliedReceipts.some(({ id }) => id === current) ? current : unappliedReceipts[0]?.id ?? '');
  }, [receiptIds, unappliedReceipts]);

  const receipt = unappliedReceipts.find(({ id }) => id === selectedReceiptId);
  const eligibleReceivables = useMemo(
    () => receipt
      ? revenue.receivables.filter((receivable) => receivable.accountId === receipt.accountId && receivable.outstandingAmount > 0 && isOpenReceivable(receivable.status))
      : [],
    [receipt, revenue.receivables],
  );
  const paymentJournal = receipt
    ? revenue.journalDrafts.find((draft) => draft.sourceType === 'payment' && draft.sourceId === receipt.id)
    : undefined;

  useEffect(() => {
    const previous = previousReceiptRef.current;
    if (previous && receipt && previous.id === receipt.id && previous.version !== receipt.version) {
      setRows([]);
      setEvidenceReference('');
      setMessage('Receipt updated. Add only the remaining unapplied amount with new allocation evidence.');
    }
    previousReceiptRef.current = receipt ? { id: receipt.id, version: receipt.version } : null;
  }, [receipt?.id, receipt?.version]);

  const total = rows.reduce((sum, row) => {
    const amount = Number(row.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const hasDistinctReceivables = new Set(rows.map(({ receivableId }) => receivableId)).size === rows.length;
  const isValid = Boolean(receipt && paymentJournal?.status === 'draft') &&
    rows.length > 0 &&
    hasDistinctReceivables &&
    rows.every((row) => {
      const receivable = eligibleReceivables.find(({ id }) => id === row.receivableId);
      const amount = Number(row.amount);
      return Boolean(receivable && Number.isFinite(amount) && amount > 0 && amount <= receivable.outstandingAmount);
    }) &&
    total <= (receipt?.unappliedAmount ?? 0);
  const remaining = Math.max(0, (receipt?.unappliedAmount ?? 0) - total);
  const availableRecipientCount = eligibleReceivables.filter((candidate) => !rows.some(({ receivableId }) => receivableId === candidate.id)).length;

  function selectReceipt(receiptId: string): void {
    const nextReceipt = unappliedReceipts.find(({ id }) => id === receiptId);
    const firstReceivable = nextReceipt
      ? revenue.receivables.find((candidate) => candidate.accountId === nextReceipt.accountId && candidate.outstandingAmount > 0 && isOpenReceivable(candidate.status))
      : undefined;
    setSelectedReceiptId(receiptId);
    setRows(firstReceivable ? [{ receivableId: firstReceivable.id, amount: '' }] : []);
    setEvidenceReference('');
    setMessage('');
  }

  function updateRow(index: number, patch: Partial<ApplicationRow>): void {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    setMessage('');
  }

  function addRecipient(): void {
    const next = eligibleReceivables.find((candidate) => !rows.some(({ receivableId }) => receivableId === candidate.id));
    if (next) setRows((current) => [...current, { receivableId: next.id, amount: '' }]);
  }

  function removeRecipient(index: number): void {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
    setMessage('');
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!receipt || !paymentJournal || !isValid) {
      setMessage('Choose a recorded receipt, complete valid invoice allocations, and keep the total within its unapplied balance.');
      return;
    }
    const normalizedEvidenceReference = evidenceReference.trim();
    if (normalizedEvidenceReference.length < 3) {
      setMessage('Add a concise bank, UTR, remittance, or allocation evidence reference.');
      return;
    }
    setMessage('');
    void onApplyUnappliedReceipt({
      id: receipt.id,
      expectedVersion: receipt.version,
      expectedJournalVersion: paymentJournal.version,
      evidenceReference: normalizedEvidenceReference,
      allocations: rows.map((row) => {
        const receivable = eligibleReceivables.find(({ id }) => id === row.receivableId)!;
        return { receivableId: receivable.id, amount: Number(row.amount), expectedVersion: receivable.version };
      }),
    });
  }

  if (!unappliedReceipts.length) {
    return <aside className="cash-application-workbench cash-application-workbench--empty"><ReceiptIndianRupee size={17} aria-hidden="true" /><div><strong>Cash application desk is clear</strong><span>Recorded receipts with an unapplied balance will appear here for documented allocation.</span></div></aside>;
  }

  return <section className="cash-application-workbench" aria-labelledby="cash-application-title">
    <header>
      <div><span>APPLY EXISTING CASH</span><h5 id="cash-application-title">Allocate unapplied receipts without duplicating money.</h5></div>
      {receipt ? <b>{inrFormatter.format(receipt.unappliedAmount)} available</b> : null}
    </header>
    <p>One recorded receipt can be applied across open invoices for the same customer. Epic BOS retains the original receipt and reclassifies its draft payment journal in place.</p>
    <form onSubmit={submit}>
      <label>Recorded receipt<select aria-label="Recorded receipt with unapplied cash" value={selectedReceiptId} onChange={(event) => selectReceipt(event.target.value)}>
        <option value="">Select a recorded receipt</option>
        {unappliedReceipts.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.number} · {candidate.reference} · {inrFormatter.format(candidate.unappliedAmount)} unapplied</option>)}
      </select></label>
      {receipt ? <><div className="cash-application-workbench__receipt-meta"><span>{party.accounts.find(({ id }) => id === receipt.accountId)?.displayName ?? receipt.accountId}</span><span>{receipt.method.replace(/-/g, ' ')}</span><span>{paymentJournal?.status === 'draft' ? 'Draft journal available' : 'Journal is not available for reclassification'}</span></div>
        <label>Allocation evidence reference<input minLength={3} name="evidenceReference" onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Remittance / UTR / bank matching evidence" required value={evidenceReference} /></label>
        <div className="cash-application-workbench__allocations" aria-label="Invoice allocations">
          <div><span>Open receivable</span><span>Amount (₹)</span><span aria-hidden="true" /></div>
          {rows.map((row, index) => <div key={`${row.receivableId}-${index}`}><select aria-label={`Open receivable ${index + 1}`} value={row.receivableId} onChange={(event) => updateRow(index, { receivableId: event.target.value })}>
            <option value="">Select an open invoice</option>
            {eligibleReceivables.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={candidate.id !== row.receivableId && rows.some(({ receivableId }) => receivableId === candidate.id)}>{candidate.invoiceNumber} · {inrFormatter.format(candidate.outstandingAmount)} outstanding</option>)}
          </select><input aria-label={`Allocation amount ${index + 1}`} inputMode="decimal" min="0.01" onChange={(event) => updateRow(index, { amount: event.target.value })} placeholder="0.00" step="0.01" type="number" value={row.amount} />{rows.length > 1 ? <button type="button" aria-label={`Remove allocation ${index + 1}`} onClick={() => removeRecipient(index)}><X size={14} aria-hidden="true" /></button> : <span />}</div>)}
        </div>
        <div className="cash-application-workbench__summary"><span>Application total <strong>{inrFormatter.format(total)}</strong></span><span>Receipt remaining <strong>{inrFormatter.format(remaining)}</strong></span><button type="button" disabled={busy || availableRecipientCount === 0} onClick={addRecipient}><Plus size={14} aria-hidden="true" /> Add invoice</button></div>
        {message ? <p className="cash-application-workbench__message" role="status">{message}</p> : null}
        <button className="button button--primary" disabled={busy || !isValid} type="submit">Apply recorded cash</button>
        <small>Only unreconciled receipts with one draft journal can be reclassified. Customer, company, branch, open balance, and optimistic-lock checks run again when you submit.</small>
      </> : <p className="cash-application-workbench__message" role="status">Select a recorded receipt to see its eligible invoices.</p>}
    </form>
  </section>;
}
