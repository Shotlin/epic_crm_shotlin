import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { UI_ACCEPTANCE_CATALOG, type UiAcceptanceEvidence, type UiAcceptancePersona, type UiAcceptanceReadinessReport, type UiAcceptanceRoute } from '../domain/ui-acceptance-readiness';
import type { DecideUiAcceptanceEvidenceInput, RecordUiAcceptanceEvidenceInput } from '../shared/ui-acceptance-contracts';
import './UiAcceptancePanel.css';

const PERSONAS: Array<{ id: UiAcceptancePersona; label: string }> = [
  { id: 'cashier', label: 'Cashier' },
  { id: 'store-manager', label: 'Store manager' },
  { id: 'hq-finance', label: 'HQ / finance' },
  { id: 'administrator', label: 'Admin' },
];

const labelStatus = (status: string): string => status.replaceAll('-', ' ');
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'This acceptance record could not be saved.';

export interface UiAcceptancePanelProps {
  readiness: UiAcceptanceReadinessReport;
  evidence: UiAcceptanceEvidence[];
  activeActorId: string;
  busy: boolean;
  onRecord?: (input: RecordUiAcceptanceEvidenceInput) => Promise<void>;
  onDecide?: (input: DecideUiAcceptanceEvidenceInput) => Promise<void>;
  onOpenRoute?: (route: UiAcceptanceRoute) => void;
}

/** A deliberately plain evidence desk for human UAT, not a simulated test runner. */
export function UiAcceptancePanel({ readiness, evidence, activeActorId, busy, onRecord, onDecide, onOpenRoute }: UiAcceptancePanelProps): ReactNode {
  const [persona, setPersona] = useState<UiAcceptancePersona>('cashier');
  const [selectedScenarioId, setSelectedScenarioId] = useState(UI_ACCEPTANCE_CATALOG.find((scenario) => scenario.persona === 'cashier')?.id ?? '');
  const [notice, setNotice] = useState('');
  const visibleRows = useMemo(() => readiness.rows.filter((row) => row.persona === persona), [persona, readiness.rows]);
  const visibleScenarios = useMemo(() => UI_ACCEPTANCE_CATALOG.filter((scenario) => scenario.persona === persona), [persona]);
  const selectedScenario = visibleScenarios.find((scenario) => scenario.id === selectedScenarioId) ?? visibleScenarios[0];

  function selectPersona(nextPersona: UiAcceptancePersona): void {
    setPersona(nextPersona);
    const firstScenario = UI_ACCEPTANCE_CATALOG.find((scenario) => scenario.persona === nextPersona);
    if (firstScenario) setSelectedScenarioId(firstScenario.id);
  }

  async function submitRecord(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!onRecord) return;
    const data = new FormData(event.currentTarget);
    const input: RecordUiAcceptanceEvidenceInput = {
      scenarioId: String(data.get('scenarioId')),
      result: String(data.get('result')) as RecordUiAcceptanceEvidenceInput['result'],
      evidenceReference: String(data.get('evidenceReference')),
      notes: String(data.get('notes') ?? '').trim() || undefined,
    };
    try {
      await onRecord(input);
      setNotice('Check recorded for independent review. It is not certified until a different reviewer verifies it.');
      event.currentTarget.reset();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function decide(id: string, decision: 'verified' | 'rejected'): Promise<void> {
    if (!onDecide) return;
    try {
      await onDecide({ id, decision });
      setNotice(decision === 'verified' ? 'Independent review recorded.' : 'The check was rejected and remains open.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  return (
    <section className="ui-acceptance-panel" aria-labelledby="ui-acceptance-title">
      <header className="ui-acceptance-panel__header">
        <div><span><ClipboardCheck size={15} aria-hidden="true" /> Screen acceptance</span><h3 id="ui-acceptance-title">Test the real work, one simple journey at a time</h3><p>No screen is called certified until a real tester records evidence and a different reviewer verifies it for this release.</p></div>
        <div className="ui-acceptance-panel__score" data-status={readiness.status}><strong>{readiness.verifiedPassedCount} / {readiness.requiredCount} verified</strong><small>{readiness.pendingReviewCount} waiting for review · {readiness.staleCount} stale</small></div>
      </header>

      <div className="ui-acceptance-panel__roles" role="tablist" aria-label="Acceptance roles">
        {PERSONAS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={persona === item.id} onClick={() => selectPersona(item.id)}>{item.label}<small>{readiness.rows.filter((row) => row.persona === item.id && row.status === 'verified').length}/{readiness.rows.filter((row) => row.persona === item.id).length}</small></button>)}
      </div>

      <div className="ui-acceptance-panel__grid">
        <section className="ui-acceptance-panel__journeys" aria-labelledby="ui-acceptance-journeys-title"><div className="ui-acceptance-panel__heading"><div><span>{PERSONAS.find((item) => item.id === persona)?.label} checklist</span><h4 id="ui-acceptance-journeys-title">What to check</h4></div><ShieldCheck size={18} aria-hidden="true" /></div><ol>{visibleRows.map((row, index) => <li key={row.id} data-status={row.status}><span>{index + 1}</span><div><strong>{row.title}</strong><p>{row.expectedOutcome}</p><small><b>{labelStatus(row.status)}:</b> {row.nextAction}</small></div></li>)}</ol></section>

        <aside className="ui-acceptance-panel__record" aria-label="Record acceptance check"><div className="ui-acceptance-panel__heading"><div><span>One guided mission</span><h4>Follow the steps, then record it</h4></div></div>{selectedScenario ? <div className="ui-acceptance-panel__mission"><strong>{selectedScenario.title}</strong><p>{selectedScenario.setup}</p><small>Surface: {selectedScenario.surfaceId}</small><button type="button" className="button button--quiet ui-acceptance-panel__open-route" disabled={!onOpenRoute} onClick={() => onOpenRoute?.(selectedScenario.route)}>Open this workbench <ArrowRight size={14} aria-hidden="true" /></button><ol>{selectedScenario.steps.map((step) => <li key={step.order}><b>Step {step.order}</b><span>{step.instruction}</span><small>Check: {step.expectedCheckpoint}</small></li>)}</ol></div> : null}<p>Use a ticket, photo, signed sheet, test-run ID, or other evidence someone else can review.</p><form onSubmit={(event) => void submitRecord(event)}><label>Acceptance journey<select name="scenarioId" aria-label="Acceptance journey" value={selectedScenario?.id ?? ''} onChange={(event) => setSelectedScenarioId(event.target.value)}>{visibleScenarios.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Result<select name="result"><option value="passed">Passed</option><option value="failed">Failed</option><option value="blocked">Blocked</option></select></label><label>Acceptance evidence reference<input name="evidenceReference" aria-label="Acceptance evidence reference" placeholder="UAT-POS-OPEN-001" minLength={4} required /></label><label>Notes (optional)<textarea name="notes" placeholder="What happened, in plain language?" maxLength={1_000} /></label><button type="submit" className="button button--primary" disabled={busy || !onRecord}>Record this check</button></form>{notice ? <p className="ui-acceptance-panel__notice" role="status">{notice}</p> : null}</aside>
      </div>

      <section className="ui-acceptance-panel__review" aria-labelledby="ui-acceptance-review-title"><div className="ui-acceptance-panel__heading"><div><span>Independent review</span><h4 id="ui-acceptance-review-title">Evidence waiting for a different person</h4></div></div>{evidence.length ? <div>{evidence.slice(0, 8).map((item) => <article key={item.id} data-status={item.status}><div><strong>{UI_ACCEPTANCE_CATALOG.find((scenario) => scenario.id === item.scenarioId)?.title ?? item.scenarioId}</strong><small>{item.result} · {item.evidenceReference} · tester {item.submittedBy}</small></div><em>{labelStatus(item.status)}</em>{item.status === 'submitted' && item.submittedBy !== activeActorId && onDecide ? <div className="ui-acceptance-panel__review-actions"><button type="button" disabled={busy} onClick={() => void decide(item.id, 'verified')}>Verify</button><button type="button" disabled={busy} onClick={() => void decide(item.id, 'rejected')}>Reject</button></div> : null}{item.status === 'submitted' && item.submittedBy === activeActorId ? <small className="ui-acceptance-panel__maker-note">Waiting for a different reviewer</small> : null}</article>)}</div> : <p className="ui-acceptance-panel__empty">No acceptance evidence has been submitted for this release.</p>}</section>
    </section>
  );
}
