import { ArrowRight, CheckCircle2, CircleAlert, Printer, ScanBarcode, Scale, Usb, WalletCards, Wrench } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { RetailPhysicalDeviceKind } from '../shared/retail-device-transport-contracts';

export interface RetailDeviceReadinessOverviewPanelProps {
  revenue: Pick<RevenueOpsSnapshot, 'retailDeviceAdapterProfiles' | 'retailDeviceTransportEvidence'>;
  onOpenAdvanced: () => void;
}

const deviceLabel: Record<RetailPhysicalDeviceKind, string> = {
  'barcode-scanner': 'Barcode scanner',
  'escpos-printer': 'Receipt printer',
  'cash-drawer': 'Cash drawer',
  'weighing-scale': 'Weighing scale',
};
const deviceIcon: Record<RetailPhysicalDeviceKind, typeof ScanBarcode> = {
  'barcode-scanner': ScanBarcode,
  'escpos-printer': Printer,
  'cash-drawer': WalletCards,
  'weighing-scale': Scale,
};

/** Store-facing device status. Diagnostics and activation stay in the controlled hardware desk. */
export function RetailDeviceReadinessOverviewPanel({ revenue, onOpenAdvanced }: RetailDeviceReadinessOverviewPanelProps): ReactNode {
  const profiles = useMemo(() => [...revenue.retailDeviceAdapterProfiles].sort((left, right) => left.name.localeCompare(right.name, 'en-IN')), [revenue.retailDeviceAdapterProfiles]);
  const operational = profiles.filter(({ status }) => status === 'operational');
  const awaiting = profiles.filter(({ status }) => status === 'draft' || status === 'approved' || status === 'acknowledged');
  const failedEvidence = revenue.retailDeviceTransportEvidence.filter(({ status }) => status === 'failed');
  const nativeRequired = profiles.filter(({ driver }) => driver.boundary === 'native-driver-required').length;
  const metrics = [
    { label: 'Operational profiles', value: operational.length, detail: 'acknowledged local profile state', Icon: CheckCircle2, alert: false },
    { label: 'Needs evidence', value: awaiting.length, detail: 'approval or acknowledgement pending', Icon: CircleAlert, alert: awaiting.length > 0 },
    { label: 'Failed checks', value: failedEvidence.length, detail: 'recorded transport failures', Icon: CircleAlert, alert: failedEvidence.length > 0 },
    { label: 'Native driver gates', value: nativeRequired, detail: 'USB/Bluetooth needs real driver evidence', Icon: Usb, alert: nativeRequired > 0 },
  ] as const;

  return <section className="retail-insights-overview" data-testid="retail-device-readiness-overview" aria-labelledby="retail-device-readiness-overview-title">
    <header className="retail-insights-overview__header"><div><span className="eyebrow"><Wrench size={14} aria-hidden="true" /> Device readiness</span><h1 id="retail-device-readiness-overview-title" className="retail-front-door__title">Know what is connected before you open the counter.</h1><p>Review scanner, printer, drawer and scale evidence without treating a profile as a live hardware guarantee.</p></div><button type="button" className="button button--quiet" onClick={onOpenAdvanced}>Open device controls <ArrowRight size={14} aria-hidden="true" /></button></header>
    <div className="retail-insights-overview__metrics" aria-label="Device readiness summary" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>{metrics.map(({ label, value, detail, Icon, alert }) => <div key={label} data-alert={alert}><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{value.toLocaleString('en-IN')}</strong><small>{detail}</small></div>)}</div>
    <div className="retail-insights-overview__grid"><article className="retail-insights-overview__attention"><header><div><span className="eyebrow">Device profiles</span><h3>What the store can evidence</h3></div><Wrench size={18} aria-hidden="true" /></header>{profiles.length ? <div className="retail-insights-overview__queue">{profiles.slice(0, 8).map((profile) => { const Icon = deviceIcon[profile.kind]; return <div key={profile.id} data-severity={profile.status === 'operational' ? undefined : 'attention'}><span><Icon size={14} aria-hidden="true" /> {profile.status}</span><strong>{profile.name}</strong><small>{deviceLabel[profile.kind]} · {profile.connection} · {profile.driver.boundary.replaceAll('-', ' ')}</small></div>; })}</div> : <Empty title="No device profile is recorded" detail="Add the real scanner, printer, drawer, or scale through controlled setup before relying on it at the counter." />}</article>
    <article className="retail-insights-overview__chart"><header><div><span className="eyebrow">Safety boundary</span><h3>What this status does not mean</h3></div><Usb size={18} aria-hidden="true" /></header><div className="retail-insights-overview__queue"><div><span>1</span><strong>A profile is not a device connection</strong><small>Profiles record a scoped configuration and approval path.</small></div><div><span>2</span><strong>USB and Bluetooth remain driver-gated</strong><small>Web diagnostics never substitute for a native, signed driver and hardware evidence.</small></div><div><span>3</span><strong>Network acknowledgement is still reviewed</strong><small>A bounded response must be captured and independently acknowledged before activation.</small></div></div></article></div>
    <footer className="retail-insights-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> This view does not connect a device or certify a driver. It only reports recorded profile and transport evidence.</footer>
  </section>;
}

function Empty({ title, detail }: { title: string; detail: string }): ReactNode {
  return <div className="retail-insights-overview__empty"><Wrench size={20} aria-hidden="true" /><strong>{title}</strong><span>{detail}</span></div>;
}
