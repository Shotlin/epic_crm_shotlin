import { useMemo, type ReactNode } from 'react';
import { AlertOctagon, BadgeIndianRupee, ShieldAlert, UserRoundSearch } from 'lucide-react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { scanLossPreventionAnomalies, type LossAnomalyKind } from '../domain/loss-prevention';
import './RetailLossPreventionPanel.css';

type Props = { revenue: RevenueOpsSnapshot };
const formatInr = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const labels = { 'cashier-cash-variance': 'Cashier variance', 'excessive-manual-discount': 'High discount', 'margin-erosion': 'Margin erosion', 'suspicious-refund-frequency': 'Repeat refunds', 'negative-stock-attempt': 'Stock override', 'repeated-cart-voids': 'Repeated cart voids' } as const;
const nextAction = (kind: LossAnomalyKind) => kind === 'cashier-cash-variance' ? 'Next: review cashier shift close and tender reconciliation.' : kind === 'excessive-manual-discount' ? 'Next: review receipt discount evidence and approval policy.' : kind === 'margin-erosion' ? 'Next: review cost, price, and discount evidence before releasing the sale margin.' : 'Next: review the governed return and customer history.';

export function RetailLossPreventionPanel({ revenue }: Props): ReactNode {
  const report = useMemo(() => scanLossPreventionAnomalies(revenue), [revenue]);
  const topCashiers = Object.entries(report.cashierRiskScores).sort(([, left], [, right]) => right - left).slice(0, 3);
  return <section className="retail-loss-panel" aria-label="Retail loss-prevention watch">
    <header><div><span><ShieldAlert size={14} aria-hidden="true" /> 11 / Retail safeguards</span><h4>Make revenue leakage visible before it becomes normal</h4><p>Scans governed shifts, completed sales and return requests for review signals. It does not accuse a customer or cashier, and it never resolves an exception automatically.</p></div><strong data-risk={report.highRiskCount > 0 ? 'high' : 'clear'}>{report.highRiskCount ? `${report.highRiskCount} high risk` : 'No high risk'}</strong></header>
    <div className="retail-loss-panel__metrics"><article><span><AlertOctagon size={15} aria-hidden="true" /> Open review signals</span><strong>{report.totalAnomaliesCount}</strong><small>Evidence needs a human review</small></article><article><span><BadgeIndianRupee size={15} aria-hidden="true" /> Financial exposure</span><strong>{formatInr(report.totalFinancialExposure)}</strong><small>May overlap between signals; not a booked loss</small></article><article><span><UserRoundSearch size={15} aria-hidden="true" /> Highest risk score</span><strong>{topCashiers[0]?.[1] ?? 0}/100</strong><small>{topCashiers[0] ? `Cashier reference ${topCashiers[0][0].slice(0, 10)}` : 'No evidence currently raises a score'}</small></article></div>
    {report.anomalies.length ? <div className="retail-loss-panel__queue">{report.anomalies.map((item) => <article key={item.id} data-severity={item.severity}><div><strong>{labels[item.kind]}</strong><small>{item.summary}</small><small>Evidence: {item.evidenceReference} · cashier {item.cashierId.slice(0, 10)}</small></div><div><b>{formatInr(item.amount)}</b><em>{item.severity}</em></div><p>{nextAction(item.kind)}</p></article>)}</div> : <p className="retail-loss-panel__empty">No current loss-prevention signal crosses the configured review thresholds.</p>}
    <footer>Control boundary: these are review signals from local evidence, not fraud findings or automatic disciplinary actions.</footer>
  </section>;
}
