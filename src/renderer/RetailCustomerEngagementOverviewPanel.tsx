import { ArrowRight, CheckCircle2, DatabaseBackup, Megaphone, MessageSquareText, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { CrmDepthSnapshot } from '../shared/crm-depth-contracts';

export type RetailCustomerEngagementMode = 'campaigns' | 'data-quality';

export interface RetailCustomerEngagementOverviewPanelProps {
  mode: RetailCustomerEngagementMode;
  depth: Pick<CrmDepthSnapshot, 'campaigns' | 'importJobs' | 'adapters' | 'communications' | 'metrics'>;
  onOpenAdvanced: () => void;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** A small, truthful front door for customer outreach and record-quality work. */
export function RetailCustomerEngagementOverviewPanel({ mode, depth, onOpenAdvanced }: RetailCustomerEngagementOverviewPanelProps): ReactNode {
  const campaigns = useMemo(() => [...depth.campaigns].sort((left, right) => right.startsAt.localeCompare(left.startsAt)), [depth.campaigns]);
  const imports = useMemo(() => [...depth.importJobs].sort((left, right) => right.createdAt.localeCompare(left.createdAt)), [depth.importJobs]);
  const isCampaigns = mode === 'campaigns';
  const activeCampaigns = campaigns.filter(({ status }) => status === 'active');
  const consentedMembers = campaigns.filter(({ consentPurpose }) => consentPurpose === 'marketing').reduce((total, campaign) => total + campaign.memberContactIds.length, 0);
  const spend = campaigns.reduce((total, campaign) => total + campaign.spent, 0);
  const rejectedRows = imports.reduce((total, job) => total + job.rejectedRows, 0);
  const connectedAdapters = depth.adapters.filter(({ status }) => status === 'healthy').length;
  const metrics = isCampaigns
    ? [
      { label: 'Active campaigns', value: activeCampaigns.length, detail: 'recorded campaign state', Icon: Megaphone, alert: false },
      { label: 'Consented members', value: consentedMembers, detail: 'marketing-purpose audiences only', Icon: ShieldCheck, alert: false },
      { label: 'Recorded spend', value: inr.format(spend), detail: 'not a payment settlement', Icon: DatabaseBackup, alert: false },
      { label: 'Healthy channels', value: connectedAdapters, detail: 'provider status from local evidence', Icon: MessageSquareText, alert: depth.adapters.length > connectedAdapters },
    ]
    : [
      { label: 'Import jobs', value: imports.length, detail: 'preview or committed evidence', Icon: DatabaseBackup, alert: false },
      { label: 'Rows needing review', value: rejectedRows, detail: 'rejected before any write', Icon: TriangleAlert, alert: rejectedRows > 0 },
      { label: 'Import exceptions', value: depth.metrics.importExceptions, detail: 'current source snapshot', Icon: TriangleAlert, alert: depth.metrics.importExceptions > 0 },
      { label: 'Healthy channels', value: connectedAdapters, detail: 'customer communication evidence', Icon: MessageSquareText, alert: depth.adapters.length > connectedAdapters },
    ];
  const title = isCampaigns ? 'Reach customers only when their permission says you can.' : 'Keep customer records clean before they reach the counter.';
  const description = isCampaigns ? 'Review consent-led audiences, campaign state and recorded communication evidence before opening outreach controls.' : 'Review import evidence and exceptions before opening the governed import and merge controls.';
  const action = isCampaigns ? 'Open campaign controls' : 'Open customer data controls';

  return <section className="retail-insights-overview" data-testid={`retail-customer-${mode}-overview`} aria-labelledby={`retail-customer-${mode}-overview-title`}>
    <header className="retail-insights-overview__header"><div><span className="eyebrow">{isCampaigns ? <Megaphone size={14} aria-hidden="true" /> : <DatabaseBackup size={14} aria-hidden="true" />} Customer {isCampaigns ? 'engagement' : 'data quality'}</span><h1 id={`retail-customer-${mode}-overview-title`} className="retail-front-door__title">{title}</h1><p>{description}</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>{action} <ArrowRight size={14} aria-hidden="true" /></button></header>
    <div className="retail-insights-overview__metrics" aria-label={`Customer ${mode} summary`} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>{metrics.map(({ label, value, detail, Icon, alert }) => <div key={label} data-alert={alert}><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</strong><small>{detail}</small></div>)}</div>
    <div className="retail-insights-overview__grid"><article className="retail-insights-overview__attention"><header><div><span className="eyebrow">{isCampaigns ? 'Campaign review' : 'Import review'}</span><h3>{isCampaigns ? 'What is currently in market' : 'What needs data review'}</h3></div>{isCampaigns ? <Megaphone size={18} aria-hidden="true" /> : <DatabaseBackup size={18} aria-hidden="true" />}</header>{isCampaigns ? (campaigns.length ? <div className="retail-insights-overview__queue">{campaigns.slice(0, 8).map((campaign) => <div key={campaign.id} data-severity={campaign.status === 'active' ? undefined : 'attention'}><span>{campaign.status}</span><strong>{campaign.name}</strong><small>{campaign.channel} · {campaign.consentPurpose} consent · {campaign.memberContactIds.length} members · {inr.format(campaign.spent)} recorded spend</small></div>)}</div> : <Empty icon={<Megaphone size={20} aria-hidden="true" />} title="No campaign is recorded" detail="Create a campaign only after its audience and consent purpose are verified." />) : (imports.length ? <div className="retail-insights-overview__queue">{imports.slice(0, 8).map((job) => <div key={job.id} data-severity={job.rejectedRows ? 'attention' : undefined}><span>{job.status}</span><strong>{job.fileName}</strong><small>{job.acceptedRows} accepted · {job.rejectedRows} rejected · {job.rowCount} rows · created {job.createdAt.slice(0, 10)}</small></div>)}</div> : <Empty icon={<DatabaseBackup size={20} aria-hidden="true" />} title="No import job is recorded" detail="Preview verified source rows before committing any customer import." />)}</article>
    <article className="retail-insights-overview__chart"><header><div><span className="eyebrow">Safety boundary</span><h3>{isCampaigns ? 'Communication stays accountable' : 'Records stay reconcilable'}</h3></div><ShieldCheck size={18} aria-hidden="true" /></header><div className="retail-insights-overview__queue"><div><span>1</span><strong>{isCampaigns ? 'Confirm audience consent' : 'Preview source rows'}</strong><small>{isCampaigns ? 'Marketing outreach requires a recorded, granted purpose.' : 'Rejected rows remain outside the customer master.'}</small></div><div><span>2</span><strong>{isCampaigns ? 'Review channel health' : 'Resolve duplicates with evidence'}</strong><small>{isCampaigns ? 'A configured adapter is not proof of provider delivery.' : 'A merge stays separately governed and auditable.'}</small></div><div><span>3</span><strong>Open the accountable controls</strong><small>This front door is intentionally read-only; it never creates outreach, imports, or changes a customer.</small></div></div></article></div>
    <footer className="retail-insights-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> This view {isCampaigns ? 'does not send a message, enrol a customer, or change consent.' : 'does not import, merge, or alter a customer record.'}</footer>
  </section>;
}

function Empty({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }): ReactNode {
  return <div className="retail-insights-overview__empty">{icon}<strong>{title}</strong><span>{detail}</span></div>;
}
