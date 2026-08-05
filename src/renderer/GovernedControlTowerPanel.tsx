import { ArrowRight, Gauge, ShieldAlert } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import {
  buildGovernedControlTower,
  type ControlTowerWorkspace,
} from '../domain/control-tower-read-projection';
import type { DashboardSnapshot } from '../shared/contracts';
import type { KernelSnapshot } from '../shared/kernel-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export interface GovernedControlTowerPanelProps {
  dashboard: DashboardSnapshot;
  revenue: RevenueOpsSnapshot;
  kernel: KernelSnapshot;
  onNavigate: (workspace: ControlTowerWorkspace) => void;
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function indiaDate(value: string | undefined): string {
  if (!value) return 'No date recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * A true cross-module queue. It only projects records already authorized for
 * the active user; it never pretends that a dashboard click resolved a source
 * workflow or wrote business evidence.
 */
export function GovernedControlTowerPanel({
  dashboard,
  revenue,
  kernel,
  onNavigate,
}: GovernedControlTowerPanelProps): ReactNode {
  const projection = useMemo(
    () => buildGovernedControlTower({ dashboard, revenue, kernel }),
    [dashboard, kernel, revenue],
  );
  const openRows = projection.rows.filter(({ status }) => status !== 'resolved');
  const scopeMismatch = projection.restrictedSources.includes('scope-mismatch');
  const company = kernel.companies.find(({ id }) => id === projection.scope.companyId);
  const branch = kernel.branches.find(({ id }) => id === projection.scope.branchId);
  const visibleScope = [company?.code ?? 'Company', branch?.code ?? 'Branch'].join(' / ');

  return (
    <article className="panel panel--wide governed-tower" data-testid="governed-control-tower-panel">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Live governed control tower</span>
          <h2>One real attention queue for the business</h2>
          <p>
            {scopeMismatch
              ? 'Source scopes do not agree, so the queue is closed until the data boundary is repaired.'
              : `${openRows.length} actionable record${openRows.length === 1 ? '' : 's'} from approved source workbenches. Opening a row never bypasses its workflow.`}
          </p>
        </div>
        <Gauge size={19} aria-hidden="true" />
      </div>

      {scopeMismatch ? (
        <div className="governed-tower__closed"><ShieldAlert size={18} aria-hidden="true" /><div><strong>Scope mismatch protected</strong><small>CRM, Revenue Operations, and the active kernel context must agree on company and branch before a combined queue is shown.</small></div></div>
      ) : openRows.length ? (
        <div className="ledger-register governed-tower__rows">
          {openRows.slice(0, 10).map((row) => (
            <div key={row.id} data-severity={row.severity}>
              <div>
                <span>{row.area} / due {indiaDate(row.dueAt)}</span>
                <strong>{row.title}</strong>
                <small>{row.detail}{row.amount === undefined ? '' : ` / ${inrFormatter.format(row.amount)}`}</small>
              </div>
              <em data-status={row.severity}>{row.severity}</em>
              <button type="button" className="button button--quiet" onClick={() => onNavigate(row.ownerWorkspace)}>
                Open source <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="governed-tower__clear"><span aria-hidden="true" /><div><strong>No actionable record in this scope</strong><small>The source workbenches currently show no at-risk INR CRM item, pending approval, collection escalation, stock exception, submitted payroll, or breached service ticket.</small></div></div>
      )}

      <div className="bharat-panel__actions governed-tower__footer">
        <span className="policy-chip">SCOPE {visibleScope}</span>
        {projection.restrictedSources.length ? <span className="policy-chip">PROTECTED {projection.restrictedSources.join(', ')}</span> : null}
        {projection.hiddenRows ? <span className="policy-chip">WITHHELD SOURCES {projection.hiddenRows}</span> : null}
        <span className="governed-tower__boundary">Queue is read-only. Source workbenches remain accountable for every decision and state change.</span>
      </div>
    </article>
  );
}
