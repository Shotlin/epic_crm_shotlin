import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Globe2, ShieldCheck } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { computeRetailChannelHealth } from '../domain/retail-channel-health';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export interface RetailChannelHealthOverviewPanelProps {
  revenue: Pick<RevenueOpsSnapshot, 'retailCommerceConnectors' | 'retailCommerceSyncRuns' | 'retailCommerceOrders' | 'retailSettlementReconciliations' | 'retailCommerceConflictResolutions' | 'generatedAt'>;
  onOpenAdvanced: () => void;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** Read-only channel health for operators; provider authority and conflict writes stay in advanced controls. */
export function RetailChannelHealthOverviewPanel({ revenue, onOpenAdvanced }: RetailChannelHealthOverviewPanelProps): ReactNode {
  const report = useMemo(() => computeRetailChannelHealth({
    connectors: [...revenue.retailCommerceConnectors],
    syncRuns: [...revenue.retailCommerceSyncRuns],
    orders: [...revenue.retailCommerceOrders],
    settlements: [...revenue.retailSettlementReconciliations],
    resolutions: [...revenue.retailCommerceConflictResolutions],
    generatedAt: revenue.generatedAt,
  }), [revenue]);
  const conflicts = report.conflicts.slice(0, 3);
  const certifiedLabel = report.connectorCount ? `${report.certifiedConnectorCount}/${report.connectorCount}` : '0';

  return <section className="retail-channel-health-overview" data-testid="retail-channel-health-overview" aria-labelledby="retail-channel-health-overview-title">
    <header className="retail-channel-health-overview__header"><div><span className="eyebrow"><Globe2 size={14} aria-hidden="true" /> Deliver / channel health</span><h2 id="retail-channel-health-overview-title">Keep every channel accountable</h2><p>Website, marketplace, ONDC, and WhatsApp evidence is checked locally before anyone treats a remote order or payout as complete.</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open channel controls <ArrowRight size={14} aria-hidden="true" /></button></header>
    <div className="retail-channel-health-overview__metrics" aria-label="Channel health summary"><div><ShieldCheck size={17} aria-hidden="true" /><span>Certified connectors</span><strong>{certifiedLabel}</strong><small>{report.connectorCount ? 'credentials and conformance evidence' : 'No connector configured'}</small></div><div><Activity size={17} aria-hidden="true" /><span>Sync evidence</span><strong>{report.syncRunCount}</strong><small>{report.syncRunCount ? 'pull/push runs recorded' : 'No provider run recorded'}</small></div><div data-alert={report.openConflictCount > 0}><AlertTriangle size={17} aria-hidden="true" /><span>Open conflicts</span><strong>{report.openConflictCount}</strong><small>{report.openConflictCount ? 'review before fulfilment or close' : 'No unresolved conflict'}</small></div><div data-alert={report.settlementVarianceTotal > 0}><Activity size={17} aria-hidden="true" /><span>Settlement variance</span><strong>{inr.format(report.settlementVarianceTotal)}</strong><small>{report.settlementCount ? `${report.settlementCount} payout record${report.settlementCount === 1 ? '' : 's'}` : 'No payout evidence'}</small></div></div>
    {conflicts.length ? <div className="retail-channel-health-overview__conflicts" aria-label="Top channel conflicts">{conflicts.map((conflict) => <article key={conflict.id} data-severity={conflict.severity}><div><span>{conflict.connectorCode} · {conflict.channel}</span><strong>{conflict.title}</strong><small>{conflict.detail}</small></div><em>{conflict.suggestedAction}</em></article>)}</div> : <div className="retail-channel-health-overview__clear"><CheckCircle2 size={16} aria-hidden="true" /><span>No unresolved channel conflict is present in this evidence scope. New provider outcomes will appear only after an authenticated pull or push is recorded.</span></div>}
    <footer className="retail-channel-health-overview__footer">This is a local evidence projection. It does not call a provider, move stock, approve a conflict, or claim that an external order was accepted.</footer>
  </section>;
}
