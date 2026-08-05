import {
  ArrowRight,
  BadgeIndianRupee,
  Boxes,
  ChartNoAxesCombined,
  CircleAlert,
  ClipboardList,
  PackageCheck,
  ReceiptIndianRupee,
  Truck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import {
  buildIndiaCommerceInsights,
  type CommerceInsightRoute,
  type CommerceInsightSection,
  type CollectionInsightRow,
  type CustomerConcentrationInsightRow,
  type FulfilmentInsightRow,
  type ProductDemandInsightRow,
  type StockExceptionInsightRow,
} from '../domain/commerce-insights';
import type { DashboardSnapshot } from '../shared/contracts';
import type { PartySnapshot } from '../shared/party-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export interface CommerceInsightsPanelProps {
  dashboard: DashboardSnapshot;
  revenue: RevenueOpsSnapshot;
  party: PartySnapshot;
  onNavigate: (route: CommerceInsightRoute) => void;
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const compactInrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function displayAmount(value: number, compact = true): string {
  return (compact ? compactInrFormatter : inrFormatter).format(value);
}

function displayDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  }).format(parsed);
}

type InsightSectionMeta = Pick<CommerceInsightSection<never>, 'state' | 'route' | 'emptyMessage' | 'restrictedCollections'>;

function StateNotice({ section }: { section: InsightSectionMeta }): ReactNode | null {
  if (section.state === 'ready') return null;
  if (section.state === 'restricted') {
    return <p className="commerce-insights__notice" data-state="restricted">Protected by your role policy. Open the source desk to request or use the appropriate access.</p>;
  }
  return <p className="commerce-insights__notice" data-state="empty">{section.emptyMessage}</p>;
}

function EvidenceHeader({
  icon: Icon,
  eyebrow,
  title,
  section,
  onNavigate,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  section: InsightSectionMeta;
  onNavigate: (route: CommerceInsightRoute) => void;
}): ReactNode {
  return (
    <header className="commerce-insights__card-header">
      <span className="commerce-insights__icon"><Icon size={17} aria-hidden="true" /></span>
      <div>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
      </div>
      <button type="button" onClick={() => onNavigate(section.route)} aria-label={`Open ${title}`}>
        Open <ArrowRight size={14} aria-hidden="true" />
      </button>
    </header>
  );
}

function DemandColumn({
  label,
  detail,
  section,
  onNavigate,
}: {
  label: string;
  detail: string;
  section: CommerceInsightSection<ProductDemandInsightRow>;
  onNavigate: (route: CommerceInsightRoute) => void;
}): ReactNode {
  return (
    <article className="commerce-insights__demand-column" data-state={section.state}>
      <button type="button" onClick={() => onNavigate(section.route)}>
        <span>{label}</span>
        <ArrowRight size={14} aria-hidden="true" />
      </button>
      <p>{detail}</p>
      {section.state === 'ready' ? (
        <ol>
          {section.rows.slice(0, 3).map((row) => (
            <li key={row.id}>
              <div><strong>{row.name}</strong><small>{row.quantity.toLocaleString('en-IN')} units / {row.recordCount} governed record{row.recordCount === 1 ? '' : 's'}</small></div>
              <b>{displayAmount(row.amount)}</b>
            </li>
          ))}
        </ol>
      ) : <StateNotice section={section} />}
    </article>
  );
}

function CustomerColumn({
  label,
  section,
  onNavigate,
}: {
  label: string;
  section: CommerceInsightSection<CustomerConcentrationInsightRow>;
  onNavigate: (route: CommerceInsightRoute) => void;
}): ReactNode {
  return (
    <article className="commerce-insights__customer-column" data-state={section.state}>
      <button type="button" onClick={() => onNavigate(section.route)}>
        <span>{label}</span>
        <ArrowRight size={14} aria-hidden="true" />
      </button>
      {section.state === 'ready' ? (
        <ol>
          {section.rows.slice(0, 4).map((row) => (
            <li key={row.id}>
              <div>
                <strong>{row.name}</strong>
                <small>{row.identity === 'party-master' ? 'Party master matched' : row.identity === 'crm-only' ? 'CRM-only identity' : 'Unlinked master identity'}</small>
              </div>
              <b>{displayAmount(row.amount)}</b>
            </li>
          ))}
        </ol>
      ) : <StateNotice section={section} />}
    </article>
  );
}

function CollectionsList({
  section,
  onNavigate,
}: {
  section: CommerceInsightSection<CollectionInsightRow>;
  onNavigate: (route: CommerceInsightRoute) => void;
}): ReactNode {
  return (
    <article className="commerce-insights__card commerce-insights__card--collections" data-state={section.state}>
      <EvidenceHeader icon={ReceiptIndianRupee} eyebrow="COLLECTIONS" title="Open customer balances" section={section} onNavigate={onNavigate} />
      {section.state === 'ready' ? (
        <div className="commerce-insights__collection-list">
          {section.rows.slice(0, 5).map((row) => (
            <button key={row.id} type="button" onClick={() => onNavigate(section.route)}>
              <span data-status={row.status} aria-hidden="true" />
              <div>
                <strong>{row.accountName}</strong>
                <small>{row.invoiceNumber} / {row.status}{row.dunningStage ? ` / ${row.dunningStage}` : ''}{row.disputeCount ? ` / ${row.disputeCount} dispute${row.disputeCount === 1 ? '' : 's'}` : ''}</small>
              </div>
              <div><b>{displayAmount(row.outstandingAmount)}</b>{row.nextActionAt ? <small>next {displayDate(row.nextActionAt)}</small> : <small>review required</small>}</div>
            </button>
          ))}
        </div>
      ) : <StateNotice section={section} />}
    </article>
  );
}

function OperationsList({
  title,
  eyebrow,
  icon,
  section,
  onNavigate,
}: {
  title: string;
  eyebrow: string;
  icon: LucideIcon;
  section: CommerceInsightSection<StockExceptionInsightRow> | CommerceInsightSection<FulfilmentInsightRow>;
  onNavigate: (route: CommerceInsightRoute) => void;
}): ReactNode {
  return (
    <article className="commerce-insights__card commerce-insights__card--operations" data-state={section.state}>
      <EvidenceHeader icon={icon} eyebrow={eyebrow} title={title} section={section} onNavigate={onNavigate} />
      {section.state === 'ready' ? (
        <div className="commerce-insights__operations-list">
          {section.rows.slice(0, 4).map((row) => (
            <button key={row.id} type="button" onClick={() => onNavigate(section.route)}>
              <span data-severity={'severity' in row ? row.severity : undefined} data-status={'status' in row ? row.status : undefined} aria-hidden="true" />
              <div><strong>{row.title}</strong><small>{row.detail}</small></div>
              {row.dueAt ? <em>{displayDate(row.dueAt)}</em> : <ArrowRight size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      ) : <StateNotice section={section} />}
    </article>
  );
}

/**
 * A Bakaloo-inspired decision view, adapted to Epic BOS's governed sources.
 * It uses no demo commerce figures: empty and access-controlled sources remain
 * explicitly empty or protected rather than becoming decorative zero charts.
 */
export function CommerceInsightsPanel({ dashboard, revenue, party, onNavigate }: CommerceInsightsPanelProps): ReactNode {
  const insights = useMemo(
    () => buildIndiaCommerceInsights({ dashboard, revenue, party }),
    [dashboard, party, revenue],
  );
  const pipelineTotal = insights.productDemand.pipeline.rows.reduce((total, row) => total + row.amount, 0);
  const openCollections = insights.collections.rows.reduce((total, row) => total + row.outstandingAmount, 0);
  const exceptions = insights.stockExceptions.rows.length + insights.fulfilment.rows.length;

  return (
    <section className="commerce-insights" aria-labelledby="commerce-insights-title" data-testid="commerce-insights">
      <header className="commerce-insights__masthead">
        <div>
          <span className="commerce-insights__eyebrow"><span /> Commerce intelligence</span>
          <h2 id="commerce-insights-title">Turn operating evidence into the next right move.</h2>
          <p>India-first demand, customer, cash and fulfilment intelligence. Every number stays tied to a governed Epic BOS record.</p>
        </div>
        <button type="button" className="commerce-insights__masthead-action" onClick={() => onNavigate('pursuits')}>
          Open pursuits <ArrowRight size={15} aria-hidden="true" />
        </button>
      </header>

      <div className="commerce-insights__signals" aria-label="Commerce decision signals">
        <button type="button" onClick={() => onNavigate(insights.productDemand.pipeline.route)}>
          <BadgeIndianRupee size={17} aria-hidden="true" /><span>Pipeline product demand</span><strong>{insights.productDemand.pipeline.state === 'ready' ? displayAmount(pipelineTotal) : insights.productDemand.pipeline.state === 'restricted' ? 'Restricted' : 'Awaiting data'}</strong><small>Unbooked INR demand only</small>
        </button>
        <button type="button" onClick={() => onNavigate(insights.collections.route)}>
          <ReceiptIndianRupee size={17} aria-hidden="true" /><span>Open collections</span><strong>{insights.collections.state === 'ready' ? displayAmount(openCollections) : insights.collections.state === 'restricted' ? 'Restricted' : 'Awaiting data'}</strong><small>Receivables, not pipeline</small>
        </button>
        <button type="button" onClick={() => onNavigate(insights.stockExceptions.route)}>
          <CircleAlert size={17} aria-hidden="true" /><span>Execution exceptions</span><strong>{insights.stockExceptions.state === 'restricted' || insights.fulfilment.state === 'restricted' ? 'Protected' : exceptions.toLocaleString('en-IN')}</strong><small>Stock and fulfilment evidence</small>
        </button>
      </div>

      <div className="commerce-insights__demand-card">
        <div className="commerce-insights__section-heading"><div><span>DEMAND EVIDENCE</span><h3>Keep commercial certainty visible</h3></div><ChartNoAxesCombined size={19} aria-hidden="true" /></div>
        <div className="commerce-insights__demand-grid">
          <DemandColumn label="Pipeline demand" detail="Qualified product interest, not revenue." section={insights.productDemand.pipeline} onNavigate={onNavigate} />
          <DemandColumn label="Sales-order demand" detail="Non-cancelled order lines." section={insights.productDemand.orders} onNavigate={onNavigate} />
          <DemandColumn label="Taxable billed" detail="Issued invoice line evidence." section={insights.productDemand.billed} onNavigate={onNavigate} />
        </div>
      </div>

      <div className="commerce-insights__split-grid">
        <article className="commerce-insights__card commerce-insights__card--customers">
          <EvidenceHeader icon={UsersRound} eyebrow="CUSTOMER CONCENTRATION" title="Who drives the business" section={insights.customerConcentration.pipeline} onNavigate={onNavigate} />
          <div className="commerce-insights__customer-grid">
            <CustomerColumn label="INR pipeline" section={insights.customerConcentration.pipeline} onNavigate={onNavigate} />
            <CustomerColumn label="Issued billing" section={insights.customerConcentration.billed} onNavigate={onNavigate} />
            <CustomerColumn label="Outstanding receivable" section={insights.customerConcentration.receivables} onNavigate={onNavigate} />
          </div>
        </article>

        <article className="commerce-insights__card commerce-insights__card--funnel" data-state={insights.funnel.state}>
          <EvidenceHeader icon={ClipboardList} eyebrow="FUNNEL PROOF" title="Stage evidence, not a guessed conversion rate" section={insights.funnel} onNavigate={onNavigate} />
          {insights.funnel.state === 'ready' ? (
            <div className="commerce-insights__funnel-list">
              {insights.funnel.rows.slice(0, 9).map((row) => (
                <button key={row.id} type="button" onClick={() => onNavigate(insights.funnel.route)}>
                  <span>{row.source.replace('-', ' ')}</span><strong>{row.label}</strong><b>{row.count.toLocaleString('en-IN')}</b>{row.amount !== undefined ? <em>{displayAmount(row.amount)}</em> : <em>count</em>}
                </button>
              ))}
            </div>
          ) : <StateNotice section={insights.funnel} />}
        </article>
      </div>

      <div className="commerce-insights__operations-grid">
        <CollectionsList section={insights.collections} onNavigate={onNavigate} />
        <OperationsList title="Inventory watch" eyebrow="STOCK EXCEPTIONS" icon={Boxes} section={insights.stockExceptions} onNavigate={onNavigate} />
        <OperationsList title="Fulfilment in motion" eyebrow="DELIVERY EVIDENCE" icon={Truck} section={insights.fulfilment} onNavigate={onNavigate} />
      </div>

      <footer className="commerce-insights__boundary"><PackageCheck size={16} aria-hidden="true" /><span>These are read-only decision aids. Creating quotes, posting invoices, moving stock, and changing fulfilment remain in their accountable source workbenches.</span></footer>
    </section>
  );
}
