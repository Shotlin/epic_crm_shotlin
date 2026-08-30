import { ArrowRight, CheckCircle2, CloudCog, DatabaseBackup, LockKeyhole, ShieldAlert, ShieldCheck, WifiOff } from 'lucide-react';
import { type ReactNode } from 'react';
import type { RetailWorkspaceStatus, SystemInfo } from '../shared/contracts';
import type { OperationalHealthSnapshot } from '../shared/kernel-contracts';

export type RetailSetupReadinessMode = 'integrations' | 'recovery';

export interface RetailSetupReadinessOverviewPanelProps {
  mode: RetailSetupReadinessMode;
  workspaceStatus: RetailWorkspaceStatus | null;
  systemInfo: SystemInfo | null;
  health: OperationalHealthSnapshot | null;
  onOpenAdvanced: () => void;
}

/** Read-only Setup front door for provider integration and recovery evidence. */
export function RetailSetupReadinessOverviewPanel({ mode, workspaceStatus, systemInfo, health, onOpenAdvanced }: RetailSetupReadinessOverviewPanelProps): ReactNode {
  const integrations = mode === 'integrations';
  const title = integrations ? 'Connect only what you can verify.' : 'Recover the store before you need to.';
  const description = integrations ? 'Review local connection policy and readiness before opening provider, map, payment, or Retail Hub controls.' : 'Review local health, audit, migration, and outbox evidence before opening backup and restore controls.';
  const metrics = integrations ? [
    ['External writes', workspaceStatus?.externalWritePolicy === 'blocked' ? 'Blocked' : 'Governed', 'no provider mutation from this view', ShieldCheck],
    ['Workspace mode', workspaceStatus?.mode ?? 'Unknown', 'source mode only', CloudCog],
    ['Hub status', workspaceStatus?.status ?? 'Unknown', 'does not prove remote reachability', WifiOff],
    ['Provider evidence', 'Required', 'credentials and acknowledgements remain external', LockKeyhole],
  ] as const : [
    ['Database', health?.databaseIntegrity ? 'Healthy' : 'Review', 'local integrity check', DatabaseBackup],
    ['Audit chain', health?.auditChainValid ? 'Valid' : 'Review', 'recent event evidence', ShieldCheck],
    ['Migrations', health?.migrationsValid ? `${health.appliedMigrations} applied` : 'Review', 'schema state', DatabaseBackup],
    ['Restore drill', 'Not implied', 'a healthy check is not a restore', ShieldAlert],
  ] as const;
  return <section className="retail-insights-overview" data-testid={`retail-setup-${mode}-overview`} aria-labelledby={`retail-setup-${mode}-overview-title`}>
    <header className="retail-insights-overview__header"><div><span className="eyebrow">{integrations ? <CloudCog size={14} aria-hidden="true" /> : <DatabaseBackup size={14} aria-hidden="true" />} Setup · {integrations ? 'integrations' : 'recovery'}</span><h1 id={`retail-setup-${mode}-overview-title`} className="retail-front-door__title">{title}</h1><p>{description}</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open {integrations ? 'integration' : 'recovery'} controls <ArrowRight size={14} aria-hidden="true" /></button></header>
    <div className="retail-insights-overview__metrics" aria-label={`${mode} readiness summary`} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>{metrics.map(([label, value, detail, Icon]) => <div key={label}><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</div>
    <div className="retail-insights-overview__grid"><article className="retail-insights-overview__attention"><header><div><span className="eyebrow">Readiness review</span><h3>{integrations ? 'Before connecting a provider' : 'Before restoring a store'}</h3></div>{integrations ? <CloudCog size={18} aria-hidden="true" /> : <DatabaseBackup size={18} aria-hidden="true" />}</header><div className="retail-insights-overview__queue"><div><span>1</span><strong>{integrations ? 'Confirm tenant and outlet scope' : 'Confirm the backup identity'}</strong><small>{integrations ? 'Every provider request must be bound to the active business scope.' : 'A backup must be selected and verified before any restore operation.'}</small></div><div><span>2</span><strong>{integrations ? 'Bind credential evidence' : 'Run an isolated restore drill'}</strong><small>{integrations ? 'Provider credentials stay out of the renderer and require certification.' : 'A local health check cannot substitute for a tested, recorded recovery.'}</small></div><div><span>3</span><strong>{integrations ? 'Reconcile the external response' : 'Keep rollback evidence'}</strong><small>{integrations ? 'Portal, bank, map and channel responses remain authoritative outside this screen.' : 'Never overwrite a live workspace without an approved recovery procedure.'}</small></div></div></article><article className="retail-insights-overview__chart"><header><div><span className="eyebrow">Current boundary</span><h3>{integrations ? 'No remote claim is made' : 'No recovery claim is made'}</h3></div><ShieldAlert size={18} aria-hidden="true" /></header><div className="retail-insights-overview__empty"><ShieldCheck size={22} aria-hidden="true" /><strong>{integrations ? 'Local readiness only' : 'Local health only'}</strong><span>{integrations ? 'This workspace does not authenticate, submit, or acknowledge a provider action.' : `This workspace does not claim a completed restore drill. ${systemInfo ? `Running Epic BOS ${systemInfo.version} locally.` : ''}`}</span></div></article></div>
    <footer className="retail-insights-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> {integrations ? 'Provider credentials, map/GPS, payments, messaging, marketplace and Hub certification remain external.' : 'Backups, restores, rollback and disaster-recovery evidence remain governed controls.'}</footer>
  </section>;
}
