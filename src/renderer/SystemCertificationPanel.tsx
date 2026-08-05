/**
 * The go-live checklist is intentionally a read-only evidence projection.
 * It never creates a recovery drill, provider approval, or readiness score.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, ClipboardCopy, ShieldCheck } from 'lucide-react';
import type { RetailCertificationFreshnessReport } from '../domain/retail-certification-freshness';
import type { RetailProductionExitGateReport, RetailRolloutReadinessReport } from '../domain/retail-reports';
import './SystemCertificationPanel.css';

export interface SystemCertificationPanelProps {
  exitGate: RetailProductionExitGateReport;
  rolloutReadiness: RetailRolloutReadinessReport;
  certificationFreshness: RetailCertificationFreshnessReport;
  /** Test seam and optional desktop integration override for copying the evidence packet. */
  onCopy?: (packet: string) => Promise<void> | void;
}

type CheckStatus = 'ready' | 'blocked' | 'external-certification';

function statusLabel(status: CheckStatus): string {
  if (status === 'ready') return 'Ready';
  if (status === 'blocked') return 'Needs action';
  return 'External approval';
}

function itemLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function uniqueActions(actions: string[]): string[] {
  return actions.filter((action, index, all) => Boolean(action.trim()) && all.indexOf(action) === index);
}

export function SystemCertificationPanel({ exitGate, rolloutReadiness, certificationFreshness, onCopy }: SystemCertificationPanelProps): ReactNode {
  const [copyNotice, setCopyNotice] = useState('');
  const nextActions = useMemo(() => uniqueActions([
    ...rolloutReadiness.nextActions,
    ...exitGate.nextActions,
    ...certificationFreshness.rows.filter((row) => row.status !== 'current').map((row) => row.nextAction),
  ]).slice(0, 4), [certificationFreshness.rows, exitGate.nextActions, rolloutReadiness.nextActions]);
  const packet = useMemo(() => JSON.stringify({
    asOfDate: certificationFreshness.asOfDate,
    decision: rolloutReadiness.goNoGo,
    rolloutReadiness,
    retailExitGate: exitGate,
    currentCredentialGenerationEvidence: certificationFreshness,
    nextActions,
  }, null, 2), [certificationFreshness, exitGate, nextActions, rolloutReadiness]);

  async function handleCopyChecklist(): Promise<void> {
    try {
      if (onCopy) {
        await onCopy(packet);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(packet);
      } else {
        setCopyNotice('Copy is unavailable on this device. Use the report export from the Control Room.');
        return;
      }
      setCopyNotice('Checklist copied for the rollout review.');
    } catch {
      setCopyNotice('Checklist could not be copied. Please try again from the Control Room.');
    }
  }

  const decision = rolloutReadiness.goNoGo === 'go' ? 'GO' : 'HOLD';
  const decisionMessage = decision === 'GO'
    ? 'All currently configured rollout checks are clear.'
    : 'Do not roll out until the listed actions are resolved or independently approved.';

  return (
    <section className="sys-cert-panel" aria-labelledby="sys-cert-title" data-testid="system-certification-panel">
      <header className="sys-cert-panel__masthead">
        <div className="sys-cert-panel__intro">
          <span className="sys-cert-panel__eyebrow"><ShieldCheck size={15} aria-hidden="true" /> Release control</span>
          <h2 id="sys-cert-title">Go-live checklist</h2>
          <p>One clear answer for the store owner: what is ready, what needs action, and what still requires a real external provider or hardware approval.</p>
        </div>
        <div className="sys-cert-panel__decision" data-status={rolloutReadiness.status} aria-label={`Rollout decision: ${decision}`}>
          <span>Rollout decision</span>
          <strong>{decision}</strong>
          <small>{decisionMessage}</small>
        </div>
      </header>

      <div className="sys-cert-panel__summary" aria-label="Go-live summary">
        <article className="sys-cert-panel__metric" data-status="ready"><span>Ready now</span><strong>{itemLabel(rolloutReadiness.readyCheckCount, 'check')}</strong><small>Current local evidence</small></article>
        <article className="sys-cert-panel__metric" data-status="blocked"><span>Local actions</span><strong>{itemLabel(rolloutReadiness.blockedCheckCount, 'local action')}</strong><small>Fix before rollout</small></article>
        <article className="sys-cert-panel__metric" data-status="external-certification"><span>External approval</span><strong>{itemLabel(rolloutReadiness.externalCertificationCheckCount, 'external approval')}</strong><small>Credentials, provider, or device proof</small></article>
        <article className="sys-cert-panel__metric" data-status={certificationFreshness.hardGateCount > 0 ? 'blocked' : 'ready'}><span>Credential evidence</span><strong>{itemLabel(certificationFreshness.currentCount, 'current replay')}</strong><small>{itemLabel(certificationFreshness.hardGateCount, 'hard gate')}</small></article>
      </div>

      <div className="sys-cert-panel__work-area">
        <section className="sys-cert-panel__actions" aria-labelledby="sys-cert-actions-title">
          <div className="sys-cert-panel__section-heading">
            <div><span>Start here</span><h3 id="sys-cert-actions-title">Next actions</h3></div>
            <button type="button" className="sys-cert-panel__copy" onClick={() => void handleCopyChecklist()}><ClipboardCopy size={16} aria-hidden="true" />Copy checklist</button>
          </div>
          {copyNotice ? <p className="sys-cert-panel__notice" role="status">{copyNotice}</p> : null}
          {nextActions.length ? <ol className="sys-cert-panel__action-list">{nextActions.map((action, index) => <li key={action}><span aria-hidden="true">{index + 1}</span><p>{action}</p></li>)}</ol> : <p className="sys-cert-panel__empty"><CheckCircle2 size={17} aria-hidden="true" />No open actions are reported by the current evidence.</p>}
        </section>

        <section className="sys-cert-panel__checks" aria-labelledby="sys-cert-checks-title">
          <div className="sys-cert-panel__section-heading"><div><span>Every release check</span><h3 id="sys-cert-checks-title">Rollout checks</h3></div></div>
          <ul>{rolloutReadiness.checks.map((check) => <li key={check.id} data-status={check.status}><div className="sys-cert-panel__check-title"><strong>{check.label}</strong><span>{statusLabel(check.status)}</span></div><p>{check.summary}</p><small><b>Next:</b> {check.nextAction}</small></li>)}</ul>
        </section>
      </div>

      <details className="sys-cert-panel__details" open>
        <summary><span>Retail and credential details</span><small>{itemLabel(exitGate.checks.length, 'retail check')} · current credential generation</small></summary>
        <div className="sys-cert-panel__details-body">
          <section aria-labelledby="sys-cert-retail-title"><h3 id="sys-cert-retail-title">Retail execution</h3><ul>{exitGate.checks.map((check) => <li key={check.id} data-status={check.status}><strong>{check.label}</strong><span>{statusLabel(check.status)}</span><p>{check.summary}</p><small><b>Next:</b> {check.nextAction}</small></li>)}</ul></section>
          <section aria-labelledby="sys-cert-credential-title"><h3 id="sys-cert-credential-title">Current credential generation</h3><p>Rotating a provider secret makes old approval evidence unusable for this checklist. Old evidence remains in the audit trail, but a fresh, independently assessed replay is required.</p><dl><div><dt>Current</dt><dd>{certificationFreshness.currentCount}</dd></div><div><dt>Renewal due</dt><dd>{certificationFreshness.renewalDueCount}</dd></div><div><dt>Expired or missing</dt><dd>{certificationFreshness.hardGateCount}</dd></div></dl>{certificationFreshness.rows.length ? <ul className="sys-cert-panel__evidence-list">{certificationFreshness.rows.filter((row) => row.status !== 'current').slice(0, 5).map((row) => <li key={`${row.source}:${row.ownerId}:${row.capability}`} data-status={row.status === 'renewal-due' ? 'blocked' : 'external-certification'}><strong>{row.ownerCode} · {row.capability.replaceAll('-', ' ')}</strong><span>{row.status.replaceAll('-', ' ')}</span><small>{row.nextAction}</small></li>)}</ul> : <p className="sys-cert-panel__empty"><CircleAlert size={17} aria-hidden="true" />No production provider or API OCR certification is configured yet.</p>}</section>
        </div>
      </details>
    </section>
  );
}
