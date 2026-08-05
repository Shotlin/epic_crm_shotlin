import { ArrowRight, Database, HardDrive, LockKeyhole, Settings2, ShieldCheck, Store, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RetailWorkspaceStatus, SystemInfo } from '../shared/contracts';
import type { OperationalHealthSnapshot } from '../shared/kernel-contracts';
import type { RetailDeviceAdapterProfile } from '../shared/retail-device-profile-contracts';

export interface RetailSetupOverviewPanelProps {
  workspaceStatus: RetailWorkspaceStatus | null;
  systemInfo: SystemInfo | null;
  health: OperationalHealthSnapshot | null;
  deviceProfiles?: readonly RetailDeviceAdapterProfile[];
  onOpenAdvanced: () => void;
}

function healthLabel(health: OperationalHealthSnapshot | null): string {
  if (!health) return 'Health check not available';
  if (health.status === 'healthy') return 'All local checks are healthy';
  if (health.status === 'degraded') return 'Some checks need attention';
  return 'A critical local check needs attention';
}

/** A small setup front door. It exposes status and one governed handoff, not fake configuration controls. */
export function RetailSetupOverviewPanel({ workspaceStatus, systemInfo, health, deviceProfiles = [], onOpenAdvanced }: RetailSetupOverviewPanelProps): ReactNode {
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
  const operationalDevices = deviceProfiles.filter((profile) => profile.status === 'operational').length;

  return <section className="retail-setup-overview" data-testid="retail-setup-overview" aria-labelledby="retail-setup-overview-title">
    <header className="retail-setup-overview__header">
      <div>
        <span className="eyebrow"><Settings2 size={14} aria-hidden="true" /> Setup / keep the store safe</span>
        <h2 id="retail-setup-overview-title">Set up Epic BOS with confidence</h2>
        <p>Configure stores, people, devices, backups, and integrations from one governed control room. Nothing is sent to Bakaloo or a provider from this summary.</p>
      </div>
      <button type="button" className="button button--primary" onClick={onOpenAdvanced}>Open full setup <ArrowRight size={14} aria-hidden="true" /></button>
    </header>

    <div className="retail-setup-overview__status" aria-label="Workspace setup status">
      <article className="retail-setup-overview__status-card">
        <span className="retail-setup-overview__icon"><Store size={18} aria-hidden="true" /></span>
        <div><span className="eyebrow">Workspace</span><strong>{workspaceStatus?.label ?? 'Status unavailable'}</strong><small>{dataLabel}</small></div>
      </article>
      <article className="retail-setup-overview__status-card">
        <span className="retail-setup-overview__icon"><HardDrive size={18} aria-hidden="true" /></span>
        <div><span className="eyebrow">Devices</span><strong>{deviceProfiles.length ? `${operationalDevices}/${deviceProfiles.length} operational` : 'No device profiles'}</strong><small>{deviceProfiles.length ? 'USB, Bluetooth, network, or manual evidence' : 'Add a scanner, printer, drawer, or scale through governed setup.'}</small></div>
      </article>
      <article className="retail-setup-overview__status-card">
        <span className="retail-setup-overview__icon"><ShieldCheck size={18} aria-hidden="true" /></span>
        <div><span className="eyebrow">Safe boundary</span><strong>{isBlocked ? 'External writes blocked' : 'Governed writes enabled'}</strong><small>{workspaceStatus?.nextAction ?? 'Review workspace provenance before connecting data.'}</small></div>
      </article>
      <article className="retail-setup-overview__status-card">
        <span className="retail-setup-overview__icon"><Database size={18} aria-hidden="true" /></span>
        <div><span className="eyebrow">Local health</span><strong>{healthLabel(health)}</strong><small>{health ? `${health.appliedMigrations} migrations · ${health.pendingOutboxEvents} pending sync events` : 'Run the full setup control room to inspect health.'}</small></div>
      </article>
    </div>

    <div className="retail-setup-overview__tasks" aria-label="Setup areas">
      <div><Users size={17} aria-hidden="true" /><strong>People & access</strong><span>Roles, approvals, and separation of duties.</span></div>
      <div><HardDrive size={17} aria-hidden="true" /><strong>Backups & recovery</strong><span>Verified backups and restore evidence.</span></div>
      <div><LockKeyhole size={17} aria-hidden="true" /><strong>Integrations & devices</strong><span>Credential versions and hardware certification.</span></div>
    </div>

    <footer className="retail-setup-overview__footer">Setup actions remain approval-gated. Provider credentials, device drivers, and live imports are never implied by this screen. {systemInfo ? `Epic BOS ${systemInfo.version} · ${systemInfo.platform} · ${systemInfo.dataMode}` : 'Build information unavailable.'}</footer>
  </section>;
}
