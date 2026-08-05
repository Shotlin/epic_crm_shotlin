import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Filter,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import {
  buildCommerceExceptionQueue,
  type CommerceException,
  type CommerceExceptionCategory,
  type CommerceExceptionDestination,
  type CommerceExceptionSeverity,
} from '../domain/commerce-exceptions';
import { formatIndiaBusinessDate, formatIndiaDateTime } from '../shared/india-business-date';
import type { KernelSnapshot } from '../shared/kernel-contracts';
import type { PartySnapshot } from '../shared/party-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

const CATEGORY_LABELS: Record<CommerceExceptionCategory, string> = {
  fulfilment: 'Fulfilment',
  inventory: 'Inventory',
  collections: 'Collections',
  approval: 'Approvals',
  service: 'Service',
};

function formatExceptionDueAt(value: string | undefined): string {
  if (!value) return 'No dated commitment recorded';
  try {
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? formatIndiaBusinessDate(value)
      : formatIndiaDateTime(value, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return 'Timing evidence needs review';
  }
}

function severityLabel(severity: CommerceExceptionSeverity): string {
  return severity === 'critical' ? 'Critical' : 'Attention';
}

export function CommerceExceptionWorkbench({
  revenue,
  party,
  kernel,
  onOpenSource,
}: {
  revenue: RevenueOpsSnapshot;
  party: PartySnapshot;
  kernel: KernelSnapshot;
  onOpenSource: (destination: CommerceExceptionDestination, exception: CommerceException) => void;
}): ReactNode {
  const queue = useMemo(
    () => buildCommerceExceptionQueue({ revenue, party, kernel }),
    [kernel, party, revenue],
  );
  const [category, setCategory] = useState<'all' | CommerceExceptionCategory>('all');
  const [severity, setSeverity] = useState<'all' | CommerceExceptionSeverity>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase('en-IN');
  const filtered = queue.exceptions.filter((exception) => (
    (category === 'all' || exception.category === category)
    && (severity === 'all' || exception.severity === severity)
    && (!normalizedQuery || [
      exception.title,
      exception.detail,
      exception.businessReference,
      exception.category,
    ].join(' ').toLocaleLowerCase('en-IN').includes(normalizedQuery))
  ));
  const selected = filtered.find(({ id }) => id === selectedId) ?? null;
  const critical = queue.exceptions.filter(({ severity: itemSeverity }) => itemSeverity === 'critical').length;
  const attention = queue.exceptions.length - critical;
  const scopeVerified = queue.scopeChecks.kernelContextMatchesRevenue
    && queue.scopeChecks.revenueReadProjectionMatchesRevenue;

  return (
    <section className="exception-workbench" data-testid="commerce-exception-workbench" aria-labelledby="commerce-exception-title">
      <header className="exception-workbench__header">
        <div>
          <span className="eyebrow">Operational control desk</span>
          <h2 id="commerce-exception-title">Real exceptions, routed to their owner</h2>
          <p>
            This is an evidence-led queue across fulfilment, inventory, collections,
            approvals, and service. It does not create, close, or disguise business records.
          </p>
        </div>
        <div className="exception-workbench__scope" data-verified={scopeVerified}>
          <ShieldCheck size={18} aria-hidden="true" />
          <span>{scopeVerified ? 'Scope verified' : 'Scope withheld'}</span>
          <small>{scopeVerified ? 'company and branch match' : 'context mismatch'}</small>
        </div>
      </header>

      <div className="exception-workbench__metrics" aria-label="Exception summary">
        <div><span>Open</span><strong>{queue.exceptions.length}</strong><small>live governed records</small></div>
        <div data-severity="critical"><span>Critical</span><strong>{critical}</strong><small>needs prompt review</small></div>
        <div data-severity="attention"><span>Attention</span><strong>{attention}</strong><small>tracked next step</small></div>
      </div>

      <div className="exception-workbench__toolbar">
        <div className="exception-workbench__filters" aria-label="Exception category filters">
          <Filter size={15} aria-hidden="true" />
          {(['all', 'fulfilment', 'inventory', 'collections', 'approval', 'service'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={category === option}
              onClick={() => setCategory(option)}
            >
              {option === 'all' ? 'All' : CATEGORY_LABELS[option]}
            </button>
          ))}
        </div>
        <label className="exception-workbench__search">
          <span className="sr-only">Search operational exceptions</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search reference or issue"
          />
        </label>
        <div className="exception-workbench__severity" aria-label="Exception severity filters">
          {(['all', 'critical', 'attention'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={severity === option}
              onClick={() => setSeverity(option)}
            >
              {option === 'all' ? 'All severities' : severityLabel(option)}
            </button>
          ))}
        </div>
      </div>

      {!scopeVerified ? (
        <div className="exception-workbench__empty" role="status">
          <ShieldCheck size={22} />
          <div>
            <strong>Exception rows are withheld.</strong>
            <span>Restore a matching company and branch scope before reviewing operational records.</span>
          </div>
        </div>
      ) : filtered.length ? (
        <div className="exception-workbench__body">
          <div className="exception-workbench__list" aria-label="Live operational exceptions">
            {filtered.map((exception) => (
              <article
                key={exception.id}
                className="exception-row"
                data-severity={exception.severity}
                data-selected={selected?.id === exception.id}
              >
                <span className="exception-row__signal" aria-hidden="true">
                  <AlertTriangle size={16} />
                </span>
                <div className="exception-row__copy">
                  <div>
                    <span>{CATEGORY_LABELS[exception.category]}</span>
                    <em>{severityLabel(exception.severity)}</em>
                  </div>
                  <strong>{exception.title}</strong>
                  <p>{exception.detail}</p>
                  <small>{exception.businessReference} · {formatExceptionDueAt(exception.dueAt)}</small>
                </div>
                <div className="exception-row__actions">
                  <button type="button" className="button button--quiet" onClick={() => setSelectedId(exception.id)}>
                    Review
                  </button>
                  <button type="button" className="button button--primary" onClick={() => onOpenSource(exception.destination, exception)}>
                    Open source <ArrowUpRight size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>

          {selected ? (
            <aside className="exception-detail" aria-label="Selected exception detail">
              <div className="exception-detail__header">
                <div>
                  <span>{CATEGORY_LABELS[selected.category]} exception</span>
                  <h3>{selected.title}</h3>
                </div>
                <button type="button" className="icon-button" aria-label="Close exception detail" onClick={() => setSelectedId(null)}>
                  <X size={16} />
                </button>
              </div>
              <p>{selected.detail}</p>
              <dl>
                <div><dt>Business reference</dt><dd>{selected.businessReference}</dd></div>
                <div><dt>Timing</dt><dd>{formatExceptionDueAt(selected.dueAt)}</dd></div>
                <div><dt>Evidence records</dt><dd>{selected.sourceRecordIds.length} scoped record{selected.sourceRecordIds.length === 1 ? '' : 's'}</dd></div>
              </dl>
              <p className="exception-detail__boundary">
                <ShieldCheck size={15} aria-hidden="true" />
                This review only exposes exact-scope evidence. The owning workbench performs any permitted change.
              </p>
              <button type="button" className="button button--primary" onClick={() => onOpenSource(selected.destination, selected)}>
                Open accountable workbench <ArrowUpRight size={15} />
              </button>
            </aside>
          ) : (
            <aside className="exception-detail exception-detail--hint" aria-label="Exception review guidance">
              <Clock3 size={20} />
              <div>
                <strong>Choose an exception to inspect its evidence.</strong>
                <span>Every source action stays in the workbench that owns its workflow and permissions.</span>
              </div>
            </aside>
          )}
        </div>
      ) : (
        <div className="exception-workbench__empty" role="status">
          <CheckCircle2 size={23} />
          <div>
            <strong>{queue.exceptions.length ? 'No exceptions match these filters.' : 'No live operational exceptions.'}</strong>
            <span>{queue.exceptions.length ? 'Change a filter or search phrase to review another live record.' : 'As your business records are created, accountable exceptions will appear here.'}</span>
          </div>
        </div>
      )}
    </section>
  );
}
