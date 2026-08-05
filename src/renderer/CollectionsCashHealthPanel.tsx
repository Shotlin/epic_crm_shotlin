import {
  ArrowRight,
  BadgeIndianRupee,
  CalendarDays,
  CreditCard,
  Landmark,
  ReceiptIndianRupee,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import {
  buildCollectionsCashHealth,
  type BankMatchStatusRow,
  type CollectionsCashAmountMeasure,
  type CollectionsCashCountMeasure,
  type CollectionsCashSection,
  type DunningWorkQueueRow,
  type ReceiptMethodMixRow,
  type ReceivableAgingRow,
} from '../domain/collections-cash-health';
import { computeRetailTenderSettlementReconciliation, type RetailTenderSettlementReconciliationReport } from '../domain/retail-reports';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export interface CollectionsCashHealthPanelProps {
  revenue: RevenueOpsSnapshot;
  /** Opens the accountable write workbench; this decision surface is read-only. */
  onOpenDesk: (desk: 'recovery' | 'bank') => void;
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const fullInrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const methodLabel: Record<ReceiptMethodMixRow['method'], string> = {
  'bank-transfer': 'Bank transfer',
  upi: 'UPI',
  cheque: 'Cheque',
  cash: 'Cash',
  other: 'Other evidence',
};

function formatIndiaDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function measureAmount(measure: CollectionsCashAmountMeasure): string {
  if (measure.state === 'restricted') return 'Restricted';
  if (measure.state === 'empty' || measure.amount === null) return 'Awaiting evidence';
  return fullInrFormatter.format(measure.amount);
}

function measureCount(measure: CollectionsCashCountMeasure): string {
  if (measure.state === 'restricted') return 'Restricted';
  if (measure.state === 'empty' || measure.count === null) return 'Awaiting evidence';
  return measure.count.toLocaleString('en-IN');
}

function measureEvidence(measure: CollectionsCashAmountMeasure | CollectionsCashCountMeasure, noun: string): string {
  if (measure.state !== 'ready') return measure.emptyMessage;
  const count = 'recordCount' in measure ? measure.recordCount : measure.count;
  if (count === null) return 'Source evidence withheld.';
  return `${count.toLocaleString('en-IN')} ${noun}${count === 1 ? '' : 's'} in scope`;
}

const tenderSettlementLabel: Record<RetailTenderSettlementReconciliationReport['rows'][number]['method'], string> = {
  upi: 'UPI',
  card: 'Card',
  'bank-transfer': 'Bank transfer',
  cash: 'Cash drawer',
};

function ElectronicTenderCard({ report, onOpenBank }: { report: RetailTenderSettlementReconciliationReport; onOpenBank: () => void }): ReactNode {
  return <article className="collections-cash-health__card collections-cash-health__card--queue" aria-label="Electronic tender settlement"><span className="collections-cash-health__card-icon"><CreditCard size={17} aria-hidden="true" /></span><header><div><span>Electronic tender settlement</span><strong>{report.actionRequired ? 'Settlement proof still needed' : 'Electronic tenders reconciled'}</strong></div><button type="button" onClick={onOpenBank}>Open matching <ArrowRight size={14} aria-hidden="true" /></button></header><p>Recorded UPI, card and bank-transfer receipts stay separate from imported bank evidence until an exact matched line exists.</p><div className="collections-cash-health__bank-list">{report.rows.map((row) => <div key={row.method}><div><strong>{tenderSettlementLabel[row.method]}</strong><small>{row.recordedAmount ? `${fullInrFormatter.format(row.recordedAmount)} recorded · ${fullInrFormatter.format(row.bankMatchedAmount)} matched` : row.nextAction}</small></div><em data-status={row.status}>{row.status === 'not-applicable' ? 'not applicable' : row.gapAmount > 0 ? `${fullInrFormatter.format(row.gapAmount)} gap` : 'ready'}</em></div>)}</div>{report.nextActions.map((action) => <small key={action} className="collections-cash-health__settlement">Next: {action}</small>)}</article>;
}

function SectionNotice<Row>({ section }: { section: CollectionsCashSection<Row> }): ReactNode {
  if (section.state === 'restricted') {
    return <p className="collections-cash-health__notice" data-state="restricted">This evidence is protected by your active role policy. Open the accountable workbench with the required access.</p>;
  }
  return <p className="collections-cash-health__notice">{section.emptyMessage}</p>;
}

function HealthMetric({
  label,
  detail,
  measure,
  kind,
}: {
  label: string;
  detail: string;
  measure: CollectionsCashAmountMeasure | CollectionsCashCountMeasure;
  kind: 'amount' | 'count';
}): ReactNode {
  const value = kind === 'amount'
    ? measureAmount(measure as CollectionsCashAmountMeasure)
    : measureCount(measure as CollectionsCashCountMeasure);
  const noun = kind === 'amount' ? 'source document' : 'case';

  return <article className="collections-cash-health__metric" data-state={measure.state}>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
    <em>{measureEvidence(measure, noun)}</em>
  </article>;
}

function ReceiptMixCard({ section }: { section: CollectionsCashSection<ReceiptMethodMixRow> }): ReactNode {
  const maximum = Math.max(1, ...section.rows.map((row) => row.recordedAmount));
  return <article className="collections-cash-health__card">
    <header>
      <span className="collections-cash-health__card-icon"><ReceiptIndianRupee size={17} aria-hidden="true" /></span>
      <div><span>RECEIPT EVIDENCE</span><h3>How customers paid</h3></div>
    </header>
    {section.state === 'ready' ? <ol className="collections-cash-health__list">
      {section.rows.map((row) => <li key={row.method}>
        <div><strong>{methodLabel[row.method]}</strong><small>{row.receiptCount} receipt{row.receiptCount === 1 ? '' : 's'} · allocated {inrFormatter.format(row.allocatedAmount)} · unapplied {inrFormatter.format(row.unappliedAmount)}</small><span aria-hidden="true"><i style={{ width: `${Math.max(7, Math.round(row.recordedAmount / maximum * 100))}%` }} /></span></div>
        <b>{inrFormatter.format(row.recordedAmount)}</b>
      </li>)}
    </ol> : <SectionNotice section={section} />}
  </article>;
}

function AgingCard({ section, unclassifiable }: {
  section: CollectionsCashSection<ReceivableAgingRow>;
  unclassifiable: CollectionsCashAmountMeasure;
}): ReactNode {
  const maximum = Math.max(1, ...section.rows.map((row) => row.outstandingAmount));
  return <article className="collections-cash-health__card">
    <header>
      <span className="collections-cash-health__card-icon"><BadgeIndianRupee size={17} aria-hidden="true" /></span>
      <div><span>RECEIVABLE EXPOSURE</span><h3>Open receivable aging</h3></div>
    </header>
    {section.state === 'ready' ? <ol className="collections-cash-health__list">
      {section.rows.map((row) => <li key={row.bucket}>
        <div><strong>{row.label}</strong><small>{row.receivableCount} open receivable{row.receivableCount === 1 ? '' : 's'}</small><span aria-hidden="true"><i style={{ width: `${Math.max(7, Math.round(row.outstandingAmount / maximum * 100))}%` }} /></span></div>
        <b>{inrFormatter.format(row.outstandingAmount)}</b>
      </li>)}
    </ol> : <SectionNotice section={section} />}
    {unclassifiable.state === 'ready' ? <p className="collections-cash-health__warning">{inrFormatter.format(unclassifiable.amount ?? 0)} needs a valid due date before it can enter aging.</p> : null}
  </article>;
}

function DunningCard({
  section,
  onOpenRecovery,
}: {
  section: CollectionsCashSection<DunningWorkQueueRow>;
  onOpenRecovery: () => void;
}): ReactNode {
  return <article className="collections-cash-health__card collections-cash-health__card--queue">
    <header>
      <span className="collections-cash-health__card-icon"><ShieldCheck size={17} aria-hidden="true" /></span>
      <div><span>RECOVERY QUEUE</span><h3>Next collection actions</h3></div>
      <button type="button" onClick={onOpenRecovery}>Open recovery <ArrowRight size={14} aria-hidden="true" /></button>
    </header>
    {section.state === 'ready' ? <ol className="collections-cash-health__queue">
      {section.rows.slice(0, 5).map((row) => <li key={row.id} data-stage={row.stage}>
        <span>{row.daysOverdue}D</span>
        <div><strong>{row.number}</strong><small>{row.stage.replaceAll('-', ' ')} · next {row.nextActionAt}</small></div>
        <b>{inrFormatter.format(row.actionableAmount)}</b>
      </li>)}
    </ol> : <SectionNotice section={section} />}
  </article>;
}

function BankEvidenceCard({
  section,
  settlementOpen,
  onOpenBank,
}: {
  section: CollectionsCashSection<BankMatchStatusRow>;
  settlementOpen: CollectionsCashAmountMeasure;
  onOpenBank: () => void;
}): ReactNode {
  return <article className="collections-cash-health__card collections-cash-health__card--queue">
    <header>
      <span className="collections-cash-health__card-icon"><Landmark size={17} aria-hidden="true" /></span>
      <div><span>BANK + SETTLEMENT EVIDENCE</span><h3>What still needs confirmation</h3></div>
      <button type="button" onClick={onOpenBank}>Open matching <ArrowRight size={14} aria-hidden="true" /></button>
    </header>
    {section.state === 'ready' ? <ol className="collections-cash-health__bank-list">
      {section.rows.map((row) => <li key={row.matchStatus} data-status={row.matchStatus}>
        <div><strong>{row.matchStatus}</strong><small>{row.lineCount} bank line{row.lineCount === 1 ? '' : 's'} · inbound {inrFormatter.format(row.inboundAmount)}</small></div>
        <b>{inrFormatter.format(row.outboundAmount)} out</b>
      </li>)}
    </ol> : <SectionNotice section={section} />}
    <p className="collections-cash-health__settlement" data-state={settlementOpen.state}><span>Outgoing settlement exceptions</span><strong>{measureAmount(settlementOpen)}</strong><small>Treasury owns this separate supplier-payment investigation queue.</small></p>
  </article>;
}

/**
 * Native, read-only cash-health workbench. It makes collection evidence easy
 * to inspect without inventing a sales number or merging customer cash with
 * bank and treasury settlement truth.
 */
export function CollectionsCashHealthPanel({ revenue, onOpenDesk }: CollectionsCashHealthPanelProps): ReactNode {
  const health = useMemo(() => buildCollectionsCashHealth({ revenue }), [revenue]);
  const tenderSettlement = useMemo(() => computeRetailTenderSettlementReconciliation({ receipts: revenue.paymentReceipts, bankLines: revenue.bankStatementLines }), [revenue.paymentReceipts, revenue.bankStatementLines]);

  return <section className="collections-cash-health" aria-labelledby="collections-cash-health-title" data-testid="collections-cash-health">
    <header className="collections-cash-health__masthead">
      <div>
        <span className="collections-cash-health__eyebrow"><span /> Cash health</span>
        <h2 id="collections-cash-health-title">What arrived, what was applied, and what still needs proof.</h2>
        <p>As of {formatIndiaDate(health.asOfDate)} · receipt period {formatIndiaDate(health.period.start)} – {formatIndiaDate(health.period.end)} · Asia/Kolkata. Customer receipts, bank matching and supplier-payment settlement remain distinct evidence streams.</p>
      </div>
      <div className="collections-cash-health__period"><CalendarDays size={16} aria-hidden="true" /><span>INR decision view</span><strong>Revenue revision {health.source.revenueRevision}</strong></div>
    </header>

    <div className="collections-cash-health__signal-bar" aria-label="Cash health evidence boundary">
      <span><BadgeIndianRupee size={15} aria-hidden="true" /> INR domestic collections</span>
      <span><ReceiptIndianRupee size={15} aria-hidden="true" /> Recorded/reconciled customer receipts only</span>
      <span><ShieldCheck size={15} aria-hidden="true" /> Read-only decision view</span>
    </div>

    <div className="collections-cash-health__metrics" aria-label="Collections and cash measures">
      <HealthMetric label="Period receipts" detail="Recorded or reconciled customer cash" measure={health.receipts.recorded} kind="amount" />
      <HealthMetric label="Applied to receivables" detail="Documented receipt allocations" measure={health.receipts.allocated} kind="amount" />
      <HealthMetric label="Unapplied cash" detail="Receipt cash awaiting allocation" measure={health.receipts.unapplied} kind="amount" />
      <HealthMetric label="Open receivables" detail="Active company and branch scope" measure={health.receivables.openOutstanding} kind="amount" />
      <HealthMetric label="Active recovery cases" detail="Open or paused dunning cases" measure={health.dunning.activeCaseCount} kind="count" />
      <HealthMetric label="Open disputes" detail="Customer collection exceptions" measure={health.disputes.openCount} kind="count" />
      <HealthMetric label="Unmatched bank inflow" detail="Imported inbound statement evidence" measure={health.bankReconciliation.unmatchedInbound} kind="amount" />
      <HealthMetric label="Allocation controls" detail="Receipts with an amount variance" measure={health.receipts.allocationMismatchCount} kind="count" />
    </div>

    <div className="collections-cash-health__cards">
      <ReceiptMixCard section={health.receipts.methodMix} />
      <AgingCard section={health.receivables.aging} unclassifiable={health.receivables.unclassifiableAging} />
      <DunningCard section={health.dunning.workQueue} onOpenRecovery={() => onOpenDesk('recovery')} />
      <BankEvidenceCard section={health.bankReconciliation.byMatchStatus} settlementOpen={health.settlementExceptions.openAmount} onOpenBank={() => onOpenDesk('bank')} />
      <ElectronicTenderCard report={tenderSettlement} onOpenBank={() => onOpenDesk('bank')} />
    </div>

    <footer className="collections-cash-health__boundary"><Landmark size={16} aria-hidden="true" /><span>“Receipt recorded” does not mean a bank, UPI provider, payment gateway, or supplier beneficiary independently confirmed settlement. Those evidence boundaries remain visible and actionable in their accountable workbenches.</span></footer>
  </section>;
}
