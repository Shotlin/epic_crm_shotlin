import { ArrowRight, Database, HardDrive, LockKeyhole, Radio, Settings2, ShieldAlert, ShieldCheck, Store, Users, Wrench } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { RetailWorkspaceStatus, SystemInfo } from '../shared/contracts';
import type { OperationalHealthSnapshot } from '../shared/kernel-contracts';
import type { RetailDeviceAdapterProfile } from '../shared/retail-device-profile-contracts';

export type RetailSetupDestination = 'organization' | 'access' | 'devices' | 'integration' | 'storage' | 'release';

export interface RetailSetupOverviewPanelProps {
  workspaceStatus: RetailWorkspaceStatus | null;
  systemInfo: SystemInfo | null;
  health: OperationalHealthSnapshot | null;
  deviceProfiles?: readonly RetailDeviceAdapterProfile[];
  /** Exact controlled destination for a visible setup task. */
  onOpenDestination?: (destination: RetailSetupDestination) => void;
  /** @deprecated Retained only for existing callers during the route migration. */
  onOpenAdvanced?: () => void;
}

type SetupState = 'complete' | 'review' | 'unavailable';
type SetupCheck = { id: string; label: string; detail: string; state: SetupState; Icon: typeof Store };

const setupDestinationByCheck: Record<string, RetailSetupDestination> = {
  classification: 'organization',
  provenance: 'organization',
  migrations: 'storage',
  audit: 'access',
  payments: 'integration',
  devices: 'devices',
  access: 'access',
  recovery: 'storage',
  hub: 'integration',
};

const setupDestinationByControl: Record<string, RetailSetupDestination> = {
  'Access & approvals': 'access',
  Devices: 'devices',
  Integrations: 'integration',
  'Data & backup': 'storage',
  'Retail Hub': 'integration',
  Release: 'release',
};

function healthLabel(health: OperationalHealthSnapshot | null): string {
  if (!health) return 'Health evidence unavailable';
  if (health.status === 'healthy') return 'All local checks are healthy';
  if (health.status === 'degraded') return 'Some checks need attention';
  return 'A critical local check needs attention';
}

function stateLabel(state: SetupState): string {
  return state === 'complete' ? 'Complete' : state === 'review' ? 'Review' : 'Needs setup';
}

/**
 * Setup stays a status-led front door: it points to the governed control room
 * rather than pretending that provider credentials, drivers, or recovery
 * evidence have been supplied.
 */
export function RetailSetupOverviewPanel({
  workspaceStatus,
  systemInfo,
  health,
  deviceProfiles = [],
  onOpenDestination,
  onOpenAdvanced,
}: RetailSetupOverviewPanelProps): ReactNode {
  const operationalDevices = deviceProfiles.filter((profile) => profile.status === 'operational').length;
  const isBlocked = workspaceStatus?.externalWritePolicy === 'blocked';
  const dataLabel = workspaceStatus?.dataStatus === 'sample'
    ? 'Legacy sample cleanup required'
    : workspaceStatus?.dataStatus === 'shadow-imported'
      ? 'Imported records need review'
      : workspaceStatus?.dataStatus === 'live'
        ? 'Live operations are governed'
        : workspaceStatus?.dataStatus === 'empty'
          ? 'Ready for your first setup'
          : 'Workspace provenance needs review';
  const checks = useMemo<SetupCheck[]>(() => [
    { id: 'classification', label: 'Workspace classification', detail: workspaceStatus?.status === 'configured' ? workspaceStatus.label : 'Classify the active retail workspace before connecting data.', state: workspaceStatus?.status === 'configured' ? 'complete' : 'review', Icon: Store },
    { id: 'provenance', label: 'Data provenance', detail: dataLabel, state: workspaceStatus && workspaceStatus.dataStatus !== 'sample' && workspaceStatus.dataStatus !== 'unclassified' ? 'complete' : 'review', Icon: Database },
    { id: 'migrations', label: 'Database migrations', detail: health ? `${health.appliedMigrations} applied migration${health.appliedMigrations === 1 ? '' : 's'}` : 'Run a local health check to verify migrations.', state: health?.migrationsValid ? 'complete' : health ? 'review' : 'unavailable', Icon: Database },
    { id: 'audit', label: 'Audit history', detail: health?.auditChainValid ? 'Audit chain checks are valid' : 'Audit-chain evidence needs review.', state: health?.auditChainValid ? 'complete' : health ? 'review' : 'unavailable', Icon: ShieldCheck },
    { id: 'payments', label: 'Payment methods', detail: 'Review tender and settlement policy in governed money controls.', state: 'unavailable', Icon: LockKeyhole },
    { id: 'devices', label: 'Printer, scanner & scale', detail: deviceProfiles.length ? `${operationalDevices}/${deviceProfiles.length} device profile${deviceProfiles.length === 1 ? '' : 's'} operational` : 'No device profile is recorded.', state: operationalDevices > 0 ? 'complete' : deviceProfiles.length ? 'review' : 'unavailable', Icon: Wrench },
    { id: 'access', label: 'Users, roles & approvals', detail: 'Review separation of duties and approval evidence in Access & approvals.', state: 'unavailable', Icon: Users },
    { id: 'recovery', label: 'Data & recovery', detail: health?.databaseIntegrity ? 'Database integrity is currently valid; verify a restore drill separately.' : 'Recovery evidence has not been verified.', state: health?.databaseIntegrity ? 'review' : 'unavailable', Icon: HardDrive },
    { id: 'hub', label: 'Retail Hub connection', detail: workspaceStatus?.mode === 'live' ? 'Live workspace mode requires connector conformance evidence.' : 'No live Hub connection is implied by this workspace.', state: 'unavailable', Icon: Radio },
  ], [dataLabel, deviceProfiles.length, health, operationalDevices, workspaceStatus]);
  const complete = checks.filter((check) => check.state === 'complete').length;
  const progress = Math.round((complete / checks.length) * 100);
  const controls = [
    { title: 'Access & approvals', detail: 'Roles · SoD · step-up auth', Icon: Users },
    { title: 'Devices', detail: 'Printer · scanner · drawer · scale', Icon: Wrench },
    { title: 'Integrations', detail: 'Payments · GST · maps · channels', Icon: Radio },
    { title: 'Data & backup', detail: 'Encryption · backup · restore', Icon: HardDrive },
    { title: 'Retail Hub', detail: 'Sync · conflicts · migration', Icon: Database },
    { title: 'Release', detail: 'Certification · update · rollback', Icon: ShieldCheck },
  ] as const;
  const openDestination = (destination: RetailSetupDestination): void => {
    if (onOpenDestination) {
      onOpenDestination(destination);
      return;
    }
    onOpenAdvanced?.();
  };

  return <section className="retail-setup-overview" data-testid="retail-setup-overview" aria-labelledby="retail-setup-overview-title">
    <header className="retail-setup-overview__header">
      <div>
        <span className="eyebrow"><Settings2 size={14} aria-hidden="true" /> Store setup</span>
        <h1 id="retail-setup-overview-title" className="retail-front-door__title">Configure once. Operate safely every day.</h1>
        <p>A guided setup checklist; complex control-room functions stay out of the daily store path.</p>
      </div>
      <div className="retail-setup-overview__progress" aria-label={`${progress}% of setup evidence complete`}>
        <strong>{progress}% complete</strong><span>{complete} / {checks.length} checks evidenced</span>
      </div>
    </header>

    <section className="retail-setup-overview__status" aria-label="Workspace safety status">
      <StatusCard icon={<Store size={18} aria-hidden="true" />} label="Workspace" value={workspaceStatus?.label ?? 'Status unavailable'} detail={dataLabel} />
      <StatusCard icon={<HardDrive size={18} aria-hidden="true" />} label="Devices" value={deviceProfiles.length ? `${operationalDevices}/${deviceProfiles.length} operational` : 'No device profiles'} detail={deviceProfiles.length ? 'Profile status, not a claimed driver certification.' : 'Add a scanner, printer, drawer, or scale through setup.'} />
      <StatusCard icon={isBlocked ? <ShieldCheck size={18} aria-hidden="true" /> : <ShieldAlert size={18} aria-hidden="true" />} label="External writes" value={isBlocked ? 'Blocked' : workspaceStatus ? 'Governed' : 'Unknown'} detail={workspaceStatus?.nextAction ?? 'Review workspace provenance before connecting data.'} />
      <StatusCard icon={<Database size={18} aria-hidden="true" />} label="Local health" value={healthLabel(health)} detail={health ? `${health.appliedMigrations} migrations · ${health.pendingOutboxEvents} pending sync event${health.pendingOutboxEvents === 1 ? '' : 's'}` : 'Run the full setup control room to inspect health.'} />
    </section>

    <div className="retail-setup-overview__main">
      <section className="retail-setup-overview__tasks" aria-labelledby="setup-checklist-title">
        <header><span className="eyebrow">Setup checklist</span><h2 id="setup-checklist-title">Evidence before go-live</h2></header>
        {checks.map((check, index) => <button type="button" key={check.id} className="retail-setup-overview__check" data-state={check.state} onClick={() => openDestination(setupDestinationByCheck[check.id] ?? 'organization')}>
          <span className="retail-setup-overview__index">{index + 1}</span>
          <span className="retail-setup-overview__icon"><check.Icon size={17} aria-hidden="true" /></span>
          <span className="retail-setup-overview__check-copy"><strong>{check.label}</strong><small>{check.detail}</small></span>
          <em>{stateLabel(check.state)}</em><ArrowRight size={15} aria-hidden="true" />
        </button>)}
      </section>
      <aside className="retail-setup-overview__tasks" aria-labelledby="admin-controls-title">
        <header><span className="eyebrow">Admin & controls</span><h2 id="admin-controls-title">Keep advanced work separate</h2><p>Open a control only when it is needed.</p></header>
        {controls.map(({ title, detail, Icon }) => <button type="button" key={title} className="retail-setup-overview__control" onClick={() => openDestination(setupDestinationByControl[title] ?? 'organization')}>
          <span className="retail-setup-overview__icon"><Icon size={17} aria-hidden="true" /></span><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={15} aria-hidden="true" />
        </button>)}
        <p className="retail-setup-overview__guard"><LockKeyhole size={14} aria-hidden="true" /> Provider secrets never enter renderer code.</p>
      </aside>
    </div>

    <details className="retail-setup-overview__footer"><summary>Technical context</summary><p>Setup actions remain approval-gated. Provider credentials, device drivers, recovery drills, and live imports are never implied by this screen. {systemInfo ? `Epic BOS ${systemInfo.version} · ${systemInfo.platform} · ${systemInfo.dataMode}.` : 'Build information unavailable.'}</p></details>
  </section>;
}

function StatusCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }): ReactNode {
  return <article className="retail-setup-overview__status-card"><span className="retail-setup-overview__icon">{icon}</span><div><span className="eyebrow">{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}
