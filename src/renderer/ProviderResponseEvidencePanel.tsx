import { useState } from 'react';
import { CheckCircle2, RadioTower } from 'lucide-react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { RecordProviderSubmissionResponseInput } from '../shared/provider-contracts';

type Props = {
  revenue: RevenueOpsSnapshot;
  actorId: string;
  busy: boolean;
  onRecord: (input: RecordProviderSubmissionResponseInput) => Promise<void>;
};

const isChecksum = (value: string) => /^[a-f0-9]{64}$/i.test(value.trim());

/** Explicit response evidence entry point; no provider acknowledgement is inferred locally. */
export function ProviderResponseEvidencePanel({ revenue, actorId, busy, onRecord }: Props) {
  const [reference, setReference] = useState('');
  const [checksum, setChecksum] = useState('');
  const [outcome, setOutcome] = useState<'acknowledged' | 'failed'>('acknowledged');
  const [errorCode, setErrorCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const pending = revenue.providerSubmissions.filter((submission) => submission.status === 'handed-off');
  const ready = isChecksum(checksum) && (outcome === 'acknowledged' ? reference.trim().length >= 3 : errorMessage.trim().length >= 4);

  const record = async (submission: typeof pending[number]) => {
    if (!ready || submission.handedOffBy === actorId) return;
    try {
      await onRecord({
        id: submission.id,
        outcome,
        externalReference: reference.trim() || undefined,
        responseChecksum: checksum.trim().toLowerCase(),
        errorCode: errorCode.trim() || undefined,
        errorMessage: errorMessage.trim() || undefined,
        receivedAt: new Date().toISOString(),
        expectedVersion: submission.version,
      });
      setNotice(`${outcome === 'acknowledged' ? 'Acknowledgement' : 'Failure'} evidence recorded for ${submission.number}.`);
      setReference('');
      setChecksum('');
      setErrorCode('');
      setErrorMessage('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Provider response could not be recorded.');
    }
  };

  return <article className="statutory-console provider-fabric__console provider-response-evidence-panel" data-testid="provider-response-evidence-panel">
    <div className="statutory-console__head"><div><span>06 / RESPONSE EVIDENCE</span><h4>Record the provider's real response</h4><p>A handoff is not a payment or delivery. Paste the external reference, outcome, and response checksum only after the provider has answered.</p></div><RadioTower size={18} /></div>
    <div className="statutory-form">
      <label>Provider outcome<select aria-label="Provider outcome" value={outcome} onChange={(event) => setOutcome(event.target.value as 'acknowledged' | 'failed')}><option value="acknowledged">Acknowledged</option><option value="failed">Failed</option></select></label>
      <label>External response reference<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder={outcome === 'acknowledged' ? 'BANK-ACK-2026-001' : 'BANK-FAIL-2026-001'} /></label>
      <label>Response payload SHA-256<input value={checksum} onChange={(event) => setChecksum(event.target.value)} placeholder="64-character provider response checksum" inputMode="text" /></label>
      {outcome === 'failed' ? <><label>Provider error code<input value={errorCode} onChange={(event) => setErrorCode(event.target.value)} placeholder="BANK-REJECTED" /></label><label>Provider error message<input value={errorMessage} onChange={(event) => setErrorMessage(event.target.value)} placeholder="Explain the provider rejection" /></label></> : null}
    </div>
    <div className="provider-fabric__manifest">{pending.length ? pending.slice(0, 8).map((submission) => <div key={submission.id}><div><span>{submission.number} · {submission.capability}</span><strong>Awaiting external response</strong><small>Handoff {submission.requestReference ?? 'not referenced'} · maker {submission.handedOffBy ?? 'unknown'}</small></div>{submission.handedOffBy === actorId ? <em>Independent reviewer required</em> : <button type="button" className="statutory-action" disabled={busy || !ready} onClick={() => void record(submission)}><CheckCircle2 size={14} />{outcome === 'acknowledged' ? 'Record acknowledgement' : 'Record provider failure'}</button>}</div>) : <p className="people-empty">No handed-off provider requests are waiting for response evidence.</p>}</div>
    {notice ? <p className="retail-returns-workbench__notice" role="status">{notice}</p> : null}
  </article>;
}
