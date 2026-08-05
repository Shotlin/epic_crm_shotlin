import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Cable, CheckCircle2, CircleAlert, ShieldCheck, Usb } from 'lucide-react';
import type {
  ActivateRetailDeviceAdapterProfileInput,
  ApproveRetailDeviceAdapterProfileInput,
  CreateRetailDeviceAdapterProfileInput,
  RecordRetailDeviceAdapterAcknowledgementInput,
  RetailDeviceAdapterProfile,
  RetailDeviceDriverBoundary,
  SuspendRetailDeviceAdapterProfileInput,
} from '../shared/retail-device-profile-contracts';
import type { PrepareRetailDeviceTransportInput } from '../shared/retail-device-transport-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import './RetailDeviceSetupPanel.css';

const deviceNames = {
  'barcode-scanner': 'Barcode scanner',
  'escpos-printer': 'Receipt printer',
  'cash-drawer': 'Cash drawer',
  'weighing-scale': 'Weighing scale',
} as const;

const primaryCapability = {
  'barcode-scanner': 'barcode-input',
  'escpos-printer': 'receipt-print',
  'cash-drawer': 'drawer-pulse',
  'weighing-scale': 'weight-read',
} as const;

const commandForDevice = {
  'barcode-scanner': 'scan',
  'escpos-printer': 'print',
  'cash-drawer': 'open-drawer',
  'weighing-scale': 'read-weight',
} as const;

const boundaryForConnection: Record<'usb' | 'bluetooth' | 'network' | 'manual', RetailDeviceDriverBoundary> = {
  usb: 'web-serial-diagnostic-only',
  bluetooth: 'web-bluetooth-diagnostic-only',
  network: 'network-tcp-boundary',
  manual: 'manual-evidence-only',
};

function boundaryLabel(boundary: RetailDeviceDriverBoundary): string {
  if (boundary === 'network-tcp-boundary') return 'Network command boundary';
  if (boundary === 'web-serial-diagnostic-only') return 'USB diagnostic only';
  if (boundary === 'web-bluetooth-diagnostic-only') return 'Bluetooth diagnostic only';
  if (boundary === 'native-driver-required') return 'Native driver required';
  return 'Manual evidence only';
}

function boundaryExplanation(boundary: RetailDeviceDriverBoundary): string {
  if (boundary === 'network-tcp-boundary') return 'A controlled TCP command can be evidenced after independent review.';
  if (boundary === 'web-serial-diagnostic-only') return 'The current USB path only performs a bounded serial diagnostic. It is not a live device driver.';
  if (boundary === 'web-bluetooth-diagnostic-only') return 'The current Bluetooth path is a bounded, user-authorized GATT diagnostic. It is not a native driver or live device activation.';
  if (boundary === 'native-driver-required') return 'A tested native Bluetooth driver and the actual device are required before this device can be live.';
  return 'This profile records a documented manual procedure; it does not connect to hardware.';
}

export interface RetailDeviceSetupPanelProps {
  revenue: RevenueOpsSnapshot;
  activeActorId: string;
  busy: boolean;
  onCreate: (input: CreateRetailDeviceAdapterProfileInput) => Promise<void>;
  onApprove: (input: ApproveRetailDeviceAdapterProfileInput) => Promise<void>;
  onPrepare: (input: PrepareRetailDeviceTransportInput) => Promise<void>;
  onRecordAcknowledgement: (input: RecordRetailDeviceAdapterAcknowledgementInput) => Promise<void>;
  onActivate: (input: ActivateRetailDeviceAdapterProfileInput) => Promise<void>;
  onSuspend: (input: SuspendRetailDeviceAdapterProfileInput) => Promise<void>;
}

function DeviceProfileCard({
  profile,
  revenue,
  activeActorId,
  busy,
  onApprove,
  onPrepare,
  onRecordAcknowledgement,
  onActivate,
  onSuspend,
  setNotice,
}: {
  profile: RetailDeviceAdapterProfile;
  revenue: RevenueOpsSnapshot;
  activeActorId: string;
  busy: boolean;
  onApprove: RetailDeviceSetupPanelProps['onApprove'];
  onPrepare: RetailDeviceSetupPanelProps['onPrepare'];
  onRecordAcknowledgement: RetailDeviceSetupPanelProps['onRecordAcknowledgement'];
  onActivate: RetailDeviceSetupPanelProps['onActivate'];
  onSuspend: RetailDeviceSetupPanelProps['onSuspend'];
  setNotice: (notice: string) => void;
}): ReactNode {
  const [ackEvidence, setAckEvidence] = useState('');
  const matchingAcknowledgement = revenue.retailDeviceTransportEvidence.find((record) =>
    record.profileId === profile.id
    && record.profileVersion === profile.version
    && record.status === 'acknowledged',
  );
  const canApprove = profile.status === 'draft' && profile.createdBy !== activeActorId;
  const canCertifyAcknowledgement = profile.status === 'approved'
    && Boolean(matchingAcknowledgement)
    && ![profile.createdBy, profile.approvedBy, matchingAcknowledgement?.requestedBy, matchingAcknowledgement?.acknowledgedBy].includes(activeActorId);
  const canActivate = profile.status === 'acknowledged'
    && profile.driver.boundary === 'network-tcp-boundary'
    && ![profile.createdBy, profile.approvedBy, profile.acknowledgedBy].includes(activeActorId);

  async function submitApproval(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const evidenceReference = String(new FormData(event.currentTarget).get('evidenceReference') ?? '');
    try {
      await onApprove({ id: profile.id, evidenceReference, expectedVersion: profile.version });
      setNotice(`${profile.name} configuration approved. Record a real device response next.`);
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Device configuration could not be approved.');
    }
  }

  async function prepareCheck(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const payload = String(new FormData(event.currentTarget).get('payload') ?? '');
    try {
      await onPrepare({
        profileId: profile.id,
        kind: profile.kind,
        deviceCode: profile.deviceCode,
        connection: profile.connection,
        command: commandForDevice[profile.kind],
        payload,
      });
      setNotice(`${profile.name} check prepared. A different operator must capture the actual response.`);
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Device check could not be prepared.');
    }
  }

  async function certifyAcknowledgement(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!matchingAcknowledgement) return;
    try {
      await onRecordAcknowledgement({
        id: profile.id,
        deviceAcknowledgementId: matchingAcknowledgement.id,
        evidenceReference: ackEvidence,
        expectedVersion: profile.version,
      });
      setAckEvidence('');
      setNotice(`${profile.name} acknowledgement is recorded. It is not live until the permitted final review.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Device acknowledgement could not be certified.');
    }
  }

  async function activate(): Promise<void> {
    try {
      await onActivate({ id: profile.id, expectedVersion: profile.version });
      setNotice(`${profile.name} was enabled after independent network evidence review.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Device could not be enabled.');
    }
  }

  async function suspend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '');
    try {
      await onSuspend({ id: profile.id, reason, expectedVersion: profile.version });
      setNotice(`${profile.name} is on hold until the incident is resolved.`);
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Device could not be placed on hold.');
    }
  }

  return (
    <article className="retail-device-setup__profile" data-status={profile.status}>
      <header>
        <div>
          <span>{deviceNames[profile.kind]} · {profile.connection}</span>
          <h4>{profile.name}</h4>
          <small>{profile.deviceCode} · {profile.driver.code} {profile.driver.version}</small>
        </div>
        <em>{profile.status.replaceAll('-', ' ')}</em>
      </header>
      <p><strong>{boundaryLabel(profile.driver.boundary)}.</strong> {boundaryExplanation(profile.driver.boundary)}</p>
      {profile.status === 'draft' && !canApprove ? <small className="retail-device-setup__wait">Waiting for a different reviewer to approve this setup.</small> : null}
      {canApprove ? <form onSubmit={(event) => void submitApproval(event)}><label>Approval evidence reference<input name="evidenceReference" minLength={4} placeholder="DEVICE-APPROVAL-001" required /></label><button type="submit" className="button button--quiet" disabled={busy}>Approve setup</button></form> : null}
      {profile.status === 'approved' ? <form onSubmit={(event) => void prepareCheck(event)}><label>Test command payload<input name="payload" defaultValue="DEVICE_TEST" minLength={1} maxLength={20000} required /></label><button type="submit" className="button button--quiet" disabled={busy}>Prepare device check</button><small>A different operator must record the hardware response in the device command list.</small></form> : null}
      {profile.status === 'approved' && !matchingAcknowledgement ? <small className="retail-device-setup__wait">No matching real response is available yet.</small> : null}
      {canCertifyAcknowledgement ? <form onSubmit={(event) => void certifyAcknowledgement(event)}><label>Independent acknowledgement reference<input value={ackEvidence} onChange={(event) => setAckEvidence(event.target.value)} minLength={4} placeholder="DEVICE-ACK-001" required /></label><button type="submit" className="button button--quiet" disabled={busy}>Record acknowledgement</button></form> : null}
      {profile.status === 'acknowledged' && profile.driver.boundary !== 'network-tcp-boundary' ? <small className="retail-device-setup__hold">This device cannot be marked live until a real native driver is implemented and certified.</small> : null}
      {canActivate ? <button type="button" className="button button--primary" disabled={busy} onClick={() => void activate()}>Enable device</button> : null}
      {profile.status === 'operational' ? <small className="retail-device-setup__live"><CheckCircle2 size={15} aria-hidden="true" /> Network command boundary enabled with recorded evidence.</small> : null}
      {profile.status !== 'suspended' ? <details className="retail-device-setup__hold-details"><summary>Put device on hold</summary><form onSubmit={(event) => void suspend(event)}><label>Reason<input name="reason" minLength={8} placeholder="Paper jam or device fault" required /></label><button type="submit" className="button button--quiet" disabled={busy}>Hold device</button></form></details> : <small className="retail-device-setup__hold">This device is on hold. Create a new approved setup after the incident is resolved.</small>}
    </article>
  );
}

export function RetailDeviceSetupPanel({
  revenue,
  activeActorId,
  busy,
  onCreate,
  onApprove,
  onPrepare,
  onRecordAcknowledgement,
  onActivate,
  onSuspend,
}: RetailDeviceSetupPanelProps): ReactNode {
  const [kind, setKind] = useState<CreateRetailDeviceAdapterProfileInput['kind']>('barcode-scanner');
  const [connection, setConnection] = useState<CreateRetailDeviceAdapterProfileInput['connection']>('network');
  const [notice, setNotice] = useState('');
  const boundary = boundaryForConnection[connection];
  const profiles = useMemo(() => revenue.retailDeviceAdapterProfiles ?? [], [revenue.retailDeviceAdapterProfiles]);

  async function createProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const configuration = connection === 'network'
      ? { connection, host: String(data.get('host')), port: Number(data.get('port')) }
      : connection === 'usb'
        ? { connection, vendorId: String(data.get('vendorId')), productId: String(data.get('productId')), baudRate: Number(data.get('baudRate')) || undefined }
        : connection === 'bluetooth'
          ? { connection, serviceUuid: String(data.get('serviceUuid')), characteristicUuid: String(data.get('characteristicUuid')).trim() || undefined, deviceAddress: String(data.get('deviceAddress')).trim() || undefined }
          : { connection, procedureReference: String(data.get('procedureReference')) };
    try {
      await onCreate({
        code: String(data.get('code')),
        name: String(data.get('name')),
        kind,
        deviceCode: String(data.get('deviceCode')),
        connection,
        driver: {
          code: String(data.get('driverCode')),
          version: String(data.get('driverVersion')),
          boundary,
        },
        capabilities: [primaryCapability[kind], 'status-read'],
        configuration,
      });
      setNotice('Device setup saved. It is not approved or live yet.');
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Device setup could not be saved.');
    }
  }

  return (
    <section className="retail-device-setup" aria-labelledby="retail-device-setup-title">
      <header className="retail-device-setup__hero">
        <div>
          <span><Cable size={14} aria-hidden="true" /> Device setup</span>
          <h3 id="retail-device-setup-title">Set up store devices safely</h3>
          <p>Save the exact device and connection first. This does not install a USB or Bluetooth driver, pair hardware, print a receipt, open a drawer, or read a weight.</p>
        </div>
        <div className="retail-device-setup__steps" aria-label="Device setup steps"><span>1. Save</span><span>2. Approve</span><span>3. Test</span><span>4. Enable network only</span></div>
      </header>

      <form className="retail-device-setup__form" onSubmit={(event) => void createProfile(event)}>
        <div className="retail-device-setup__section-heading"><div><span>New setup</span><h4>One device at a time</h4></div><Usb size={18} aria-hidden="true" /></div>
        <div className="retail-device-setup__grid">
          <label>Device type<select value={kind} onChange={(event) => setKind(event.target.value as CreateRetailDeviceAdapterProfileInput['kind'])}>{Object.entries(deviceNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Connection<select value={connection} onChange={(event) => setConnection(event.target.value as CreateRetailDeviceAdapterProfileInput['connection'])}><option value="network">Network</option><option value="usb">USB</option><option value="bluetooth">Bluetooth</option><option value="manual">Manual procedure</option></select></label>
          <label>Setup code<input name="code" minLength={2} maxLength={64} placeholder="PRINTER-TCP-01" required /></label>
          <label>Device name<input name="name" minLength={2} placeholder="Counter receipt printer" required /></label>
          <label>Device code<input name="deviceCode" minLength={2} placeholder="RECEIPT-01" required /></label>
          <label>Driver code<input name="driverCode" minLength={2} placeholder="MANUFACTURER-DRIVER" required /></label>
          <label>Driver version<input name="driverVersion" defaultValue="1.0.0" minLength={1} required /></label>
        </div>
        {connection === 'network' ? <div className="retail-device-setup__grid"><label>Network host<input name="host" placeholder="192.168.10.42" required /></label><label>Network port<input name="port" type="number" min="1" max="65535" defaultValue="9100" required /></label></div> : null}
        {connection === 'usb' ? <div className="retail-device-setup__grid"><label>USB vendor ID<input name="vendorId" placeholder="1A2B" pattern="[0-9A-Fa-f]{4}" required /></label><label>USB product ID<input name="productId" placeholder="3C4D" pattern="[0-9A-Fa-f]{4}" required /></label><label>Baud rate<input name="baudRate" type="number" min="300" max="3000000" defaultValue="9600" /></label></div> : null}
        {connection === 'bluetooth' ? <div className="retail-device-setup__grid"><label>Bluetooth service UUID<input name="serviceUuid" placeholder="18f0 or full UUID" required /></label><label>Bluetooth characteristic UUID<input name="characteristicUuid" placeholder="2af1 or full UUID" required /></label><label>Bluetooth address (optional)<input name="deviceAddress" placeholder="AA:BB:CC:DD:EE:FF" /></label></div> : null}
        {connection === 'manual' ? <label>Procedure reference<input name="procedureReference" minLength={4} placeholder="STORE-HARDWARE-PROCEDURE-001" required /></label> : null}
        <p className="retail-device-setup__boundary"><CircleAlert size={16} aria-hidden="true" /><strong>{boundaryLabel(boundary)}.</strong> {boundaryExplanation(boundary)}</p>
        <button type="submit" className="button button--primary" disabled={busy}>Save device setup</button>
      </form>

      <section className="retail-device-setup__profiles" aria-labelledby="retail-device-profile-list-title">
        <div className="retail-device-setup__section-heading"><div><span>Saved devices</span><h4 id="retail-device-profile-list-title">What is actually ready</h4></div><ShieldCheck size={18} aria-hidden="true" /></div>
        {profiles.length ? profiles.map((profile) => <DeviceProfileCard key={profile.id} profile={profile} revenue={revenue} activeActorId={activeActorId} busy={busy} onApprove={onApprove} onPrepare={onPrepare} onRecordAcknowledgement={onRecordAcknowledgement} onActivate={onActivate} onSuspend={onSuspend} setNotice={setNotice} />) : <p className="retail-device-setup__empty">No device setup saved yet. Add the exact store device before anyone tries to use it.</p>}
      </section>
      {notice ? <p className="retail-device-setup__notice" role="status">{notice}</p> : null}
    </section>
  );
}
