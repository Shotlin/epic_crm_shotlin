import { useEffect, useMemo, useState } from 'react';
import type { CreditLimitControl, DunningCase, ReceivableDispute } from '../shared/collections-finance-contracts';
import type { Receivable } from '../shared/revenue-ops-contracts';
import { determineApprovalRequirement, simulateCreditScenario, type SimulationScenarioType } from '../domain/credit-policy-simulation';

type AccountOption = { id: string; displayName: string };

type Props = {
  accounts: AccountOption[];
  controls: CreditLimitControl[];
  receivables: Receivable[];
  dunningCases: DunningCase[];
  disputes: ReceivableDispute[];
};

const inr = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const scenarioLabels: Array<[SimulationScenarioType, string]> = [
  ['conservative', 'Protect cash'],
  ['standard', 'Balanced'],
  ['aggressive', 'Growth push'],
];

function daysBetween(from: string, to: string): number {
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 86_400_000)) : 30;
}

export function CreditPolicySimulationPanel({ accounts, controls, receivables, dunningCases, disputes }: Props) {
  const eligibleAccounts = useMemo(() => accounts.filter((account) => controls.some((control) => control.accountId === account.id && control.status === 'approved') && receivables.some((receivable) => receivable.accountId === account.id)), [accounts, controls, receivables]);
  const [accountId, setAccountId] = useState(eligibleAccounts[0]?.id ?? '');
  const [scenario, setScenario] = useState<SimulationScenarioType>('standard');
  useEffect(() => {
    if (!eligibleAccounts.some((account) => account.id === accountId)) setAccountId(eligibleAccounts[0]?.id ?? '');
  }, [accountId, eligibleAccounts]);
  const selected = eligibleAccounts.find((account) => account.id === accountId);
  const control = controls.find((candidate) => candidate.accountId === accountId && candidate.status === 'approved');
  const history = useMemo(() => {
    const customerReceivables = receivables.filter((receivable) => receivable.accountId === accountId);
    const customerDunning = dunningCases.filter((item) => item.accountId === accountId);
    const customerDisputes = disputes.filter((item) => item.accountId === accountId && ['open', 'under-review'].includes(item.status));
    const averageOrderValue = customerReceivables.length ? customerReceivables.reduce((total, item) => total + item.originalAmount, 0) / customerReceivables.length : 0;
    const termDays = customerReceivables.length ? customerReceivables.reduce((total, item) => total + daysBetween(item.invoiceDate, item.dueDate), 0) / customerReceivables.length : 30;
    const onTimeCount = customerReceivables.filter((item) => !['overdue', 'disputed'].includes(item.status)).length;
    return {
      accountId,
      accountName: selected?.displayName ?? accountId,
      lifetimeRevenue: customerReceivables.reduce((total, item) => total + item.originalAmount, 0),
      averageOrderValue,
      averageDaysToPay: termDays,
      onTimePaymentRate: customerReceivables.length ? (onTimeCount / customerReceivables.length) * 100 : 0,
      totalDunningCases: customerDunning.length,
      openDisputeAmount: customerDisputes.reduce((total, item) => total + item.amount, 0),
      currentExposure: customerReceivables.reduce((total, item) => total + item.outstandingAmount, 0),
      existingCreditLimit: control?.creditLimit ?? 0,
      currentRiskGrade: control?.riskGrade ?? 'C' as const,
    };
  }, [accountId, control?.creditLimit, control?.riskGrade, dunningCases, disputes, receivables, selected?.displayName]);
  const result = useMemo(() => simulateCreditScenario(history, scenario), [history, scenario]);
  const approval = useMemo(() => control ? determineApprovalRequirement(control, { ...control, creditLimit: result.proposedCreditLimit, graceDays: result.simulatedGraceDays, warningThresholdPercent: result.simulatedWarningThresholdPct }) : null, [control, result]);

  return <article className="collections-sheet collections-sheet--wide credit-simulation" aria-label="Credit policy what-if simulation">
    <header><div><span>DECISION PREVIEW / READ-ONLY</span><h4>What happens if we change this customer’s credit line?</h4><p>Use real receivables and collection evidence to compare a cash-protection, balanced, or growth scenario. Nothing is submitted or approved here.</p></div><strong data-status={result.recommendation}>{result.recommendation}</strong></header>
    {eligibleAccounts.length ? <>
      <div className="credit-simulation__controls"><label>Customer<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}</select></label><label>Scenario<select value={scenario} onChange={(event) => setScenario(event.target.value as SimulationScenarioType)}>{scenarioLabels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <div className="credit-simulation__metrics"><div><span>Proposed limit</span><strong>{inr(result.proposedCreditLimit)}</strong><small>current {inr(history.existingCreditLimit)}</small></div><div><span>Projected exposure</span><strong>{inr(result.projectedExposure)}</strong><small>{result.projectedUtilizationPct.toFixed(1)}% utilisation</small></div><div><span>Expected loss</span><strong>{inr(result.expectedLossAmount)}</strong><small>{result.expectedLossRatePct.toFixed(2)}% rate</small></div><div><span>Approval path</span><strong>{approval?.tierRequired ?? 'review'}</strong><small>{approval?.limitChangePercentage.toFixed(1) ?? '0.0'}% limit change</small></div></div>
      <div className="credit-simulation__footer"><span>{history.onTimePaymentRate.toFixed(0)}% on-time evidence · {history.totalDunningCases} dunning case{history.totalDunningCases === 1 ? '' : 's'} · {inr(history.openDisputeAmount)} open disputes</span><strong>{result.rationale}</strong></div>
    </> : <p className="collections-empty">Approve a customer credit control and record receivables before running a decision preview.</p>}
  </article>;
}
