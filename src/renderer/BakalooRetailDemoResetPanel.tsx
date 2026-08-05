import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type {
  ApplyBakalooRetailDemoResetInput,
  BakalooRetailDemoResetPreview,
} from '../shared/bakaloo-retail-reset-contracts';

export interface BakalooRetailDemoResetPanelProps {
  /**
   * This panel is deliberately absent until the main process has positively
   * identified the exact, known generic Epic BOS demo.
   */
  preview: BakalooRetailDemoResetPreview | null;
  busy: boolean;
  message?: string;
  onApply: (input: ApplyBakalooRetailDemoResetInput) => void;
}

/**
 * A narrow acknowledgement surface for replacing only the verified generic
 * demo with a clean Bakaloo retail starter. It is not a general deletion UI.
 */
export function BakalooRetailDemoResetPanel({
  preview,
  busy,
  message,
  onApply,
}: BakalooRetailDemoResetPanelProps): ReactNode {
  const [confirmation, setConfirmation] = useState('');
  const confirmationId = useId();
  const helpId = useId();
  const errorId = useId();

  if (!preview?.eligible) return null;

  const phraseMatches = confirmation === preview.confirmationPhrase;
  const showMismatch = confirmation.length > 0 && !phraseMatches;
  const canApply = phraseMatches && !busy;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canApply) return;
    onApply({ confirmation });
  }

  return (
    <section className="bakaloo-reset" aria-labelledby="bakaloo-reset-title">
      <header className="bakaloo-reset__header">
        <div className="bakaloo-reset__title">
          <span className="bakaloo-reset__eyebrow"><ShieldAlert size={15} aria-hidden="true" /> Known demo cleanup</span>
          <h2 id="bakaloo-reset-title">Start with a clean Bakaloo retail workspace</h2>
          <p>This action removes only the verified generic Epic BOS sample below and replaces it with an empty Indian retail starter.</p>
        </div>
        <ShieldCheck className="bakaloo-reset__header-icon" size={22} aria-hidden="true" />
      </header>

      <div className="bakaloo-reset__protection" aria-label="What stays protected">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>Your sign-in stays in place.</strong>
          <p>A verified backup is required before this controlled replacement runs. Your login and current session are preserved; the known demo’s old records and local event history are retired together.</p>
        </div>
      </div>

      <section className="bakaloo-reset__records" aria-labelledby="bakaloo-reset-records-title">
        <div className="bakaloo-reset__section-heading">
          <div>
            <span className="bakaloo-reset__eyebrow">Known sample only</span>
            <h3 id="bakaloo-reset-records-title">These generic demo records will be removed</h3>
          </div>
          <span className="bakaloo-reset__record-count">{preview.recordGroups.reduce((total, group) => total + group.count, 0)} records</span>
        </div>
        <ul className="bakaloo-reset__record-list">
          {preview.recordGroups.map((group) => (
            <li key={group.id}>
              <span className="bakaloo-reset__group-count" aria-label={`${group.count} records`}>{group.count}</span>
              <div>
                <strong>{group.label}</strong>
                <p>{group.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <form className="bakaloo-reset__confirmation" onSubmit={submit} noValidate>
        <label htmlFor={confirmationId}>Type the confirmation phrase</label>
        <p id={helpId}>Enter <kbd>{preview.confirmationPhrase}</kbd> exactly to unlock this one-time cleanup.</p>
        <input
          id={confirmationId}
          className="bakaloo-reset__input"
          type="text"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          aria-describedby={showMismatch ? `${helpId} ${errorId}` : helpId}
          aria-invalid={showMismatch}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={preview.confirmationPhrase}
        />
        {showMismatch ? <p id={errorId} className="bakaloo-reset__error" role="alert">The confirmation phrase does not match yet. Check the spelling and spaces.</p> : null}
        <button type="submit" className="button button--danger bakaloo-reset__submit" disabled={!canApply}>
          {busy ? 'Creating clean workspace…' : 'Create clean Bakaloo retail workspace'}
        </button>
        <p className="bakaloo-reset__footnote">This cannot run for a workspace with records outside the known generic demo.</p>
      </form>

      {message ? <p className="bakaloo-reset__message" role="status">{message}</p> : null}
    </section>
  );
}
