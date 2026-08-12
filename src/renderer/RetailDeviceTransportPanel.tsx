import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Cable, ShieldCheck } from 'lucide-react';
import type { RetailDeviceAdapterProfile } from '../shared/retail-device-profile-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type {
  ExecuteRetailDeviceTransportInput,
  PrepareRetailDeviceTransportInput,
  PreflightRetailDeviceTransportInput,
  RecordRetailDevicePreflightEvidenceInput,
  RecordRetailDeviceTransportInput,
  RetailDeviceResponseProtocol,
  RetailDeviceTransportEvidence,
  RetryRetailDeviceTransportInput,
  RetailDeviceTransportPreflightResult,
  RetailPhysicalDeviceKind,
} from '../shared/retail-device-transport-contracts';
import { computeRetailStoreExecutionReadiness } from '../domain/retail-reports';
import { runRetailBluetoothPreflight, runRetailBluetoothTransport, type RetailBluetoothNavigatorLike } from './retail-bluetooth-preflight';
import { runRetailSerialPreflight, runRetailSerialTransport, type RetailSerialNavigatorLike } from './retail-serial-preflight';

export interface RetailDeviceTransportPanelProps {
  revenue: RevenueOpsSnapshot;
  busy: boolean;
  activeActorId: string;
  onPrepare: (input: PrepareRetailDeviceTransportInput) => Promise<void>;
  onRecord: (input: RecordRetailDeviceTransportInput) => Promise<void>;
  onExecute: (input: ExecuteRetailDeviceTransportInput) => Promise<void>;
  onRetry: (input: RetryRetailDeviceTransportInput) => Promise<void>;
  onPreflight: (input: PreflightRetailDeviceTransportInput) => Promise<RetailDeviceTransportPreflightResult>;
  onRecordPreflight: (input: RecordRetailDevicePreflightEvidenceInput) => Promise<RetailDeviceTransportPreflightResult>;
}

const commands: Record<RetailPhysicalDeviceKind, PrepareRetailDeviceTransportInput['command']> = {
  'barcode-scanner': 'scan',
  'escpos-printer': 'print',
  'cash-drawer': 'open-drawer',
  'weighing-scale': 'read-weight',
};

const names: Record<RetailPhysicalDeviceKind, string> = {
  'barcode-scanner': 'Barcode scanner',
  'escpos-printer': 'ESC/POS printer',
  'cash-drawer': 'Cash drawer',
  'weighing-scale': 'Weighing scale',
};

const responseProtocols: Record<RetailPhysicalDeviceKind, RetailDeviceResponseProtocol> = {
  'barcode-scanner': 'barcode-scanner-status-v1',
  'escpos-printer': 'escpos-status-v1',
  'cash-drawer': 'cash-drawer-status-v1',
  'weighing-scale': 'weighing-scale-reading-v1',
};

interface NetworkCommandTarget {
  profileCode: string;
  profileName: string;
  host: string;
  port: number;
}

function getNetworkCommandTarget(
  record: RetailDeviceTransportEvidence,
  profiles: readonly RetailDeviceAdapterProfile[],
): NetworkCommandTarget | undefined {
  if (!record.profileId || record.profileVersion === undefined) return undefined;

  const profile = profiles.find((candidate) => candidate.id === record.profileId);
  if (
    !profile
    || profile.version !== record.profileVersion
    || !['approved', 'operational'].includes(profile.status)
    || profile.connection !== 'network'
    || profile.configuration.connection !== 'network'
  ) return undefined;

  return {
    profileCode: profile.code,
    profileName: profile.name,
    host: profile.configuration.host,
    port: profile.configuration.port,
  };
}

function getUsbCommandProfile(
  record: RetailDeviceTransportEvidence,
  profiles: readonly RetailDeviceAdapterProfile[],
): RetailDeviceAdapterProfile | undefined {
  if (record.connection !== 'usb' || !record.profileId || record.profileVersion === undefined) return undefined;
  const profile = profiles.find((candidate) => candidate.id === record.profileId);
  if (
    !profile
    || profile.version !== record.profileVersion
    || !['approved', 'operational'].includes(profile.status)
    || profile.connection !== 'usb'
    || profile.kind !== record.kind
    || profile.deviceCode !== record.deviceCode
  ) return undefined;
  return profile;
}

function getBluetoothCommandProfile(
  record: RetailDeviceTransportEvidence,
  profiles: readonly RetailDeviceAdapterProfile[],
): RetailDeviceAdapterProfile | undefined {
  if (record.connection !== 'bluetooth' || !record.profileId || record.profileVersion === undefined) return undefined;
  const profile = profiles.find((candidate) => candidate.id === record.profileId);
  if (
    !profile
    || profile.version !== record.profileVersion
    || !['approved', 'operational'].includes(profile.status)
    || profile.driver.boundary !== 'web-bluetooth-diagnostic-only'
    || profile.connection !== 'bluetooth'
    || profile.kind !== record.kind
    || profile.deviceCode !== record.deviceCode
    || profile.configuration.connection !== 'bluetooth'
    || !profile.configuration.characteristicUuid
  ) return undefined;
  return profile;
}

function getNativeCommandProfile(
  record: RetailDeviceTransportEvidence,
  profiles: readonly RetailDeviceAdapterProfile[],
): RetailDeviceAdapterProfile | undefined {
  if ((record.connection !== 'usb' && record.connection !== 'bluetooth') || !record.profileId || record.profileVersion === undefined) return undefined;
  const profile = profiles.find((candidate) => candidate.id === record.profileId);
  if (
    !profile
    || profile.version !== record.profileVersion
    || !['approved', 'operational'].includes(profile.status)
    || profile.driver.boundary !== 'native-driver-required'
    || profile.connection !== record.connection
    || profile.kind !== record.kind
    || profile.deviceCode !== record.deviceCode
  ) return undefined;
  return profile;
}

export function RetailDeviceTransportPanel({
  revenue,
  busy,
  activeActorId,
  onPrepare,
  onRecord,
  onExecute,
  onRetry,
  onPreflight,
  onRecordPreflight,
}: RetailDeviceTransportPanelProps): ReactNode {
  const [kind, setKind] = useState<RetailPhysicalDeviceKind>('barcode-scanner');
  const [notice, setNotice] = useState('');
  const storeReadiness = useMemo(
    () => computeRetailStoreExecutionReadiness({
      offlineQueue: revenue.retailOfflineSaleQueue,
      syncReceipts: revenue.retailOfflineSyncReceipts ?? [],
      deviceEvidence: revenue.retailDeviceTransportEvidence,
      preflightEvidence: revenue.retailDevicePreflightEvidence,
    }),
    [revenue.retailOfflineSaleQueue, revenue.retailOfflineSyncReceipts, revenue.retailDeviceTransportEvidence, revenue.retailDevicePreflightEvidence],
  );
  const adapterProfiles = revenue.retailDeviceAdapterProfiles ?? [];
  const preparedNetworkCommands = revenue.retailDeviceTransportEvidence
    .filter((record) => record.status === 'prepared' && record.connection === 'network')
    .slice(0, 4);
  const preparedUsbCommands = revenue.retailDeviceTransportEvidence
    .filter((record) => record.status === 'prepared' && record.connection === 'usb')
    .slice(0, 4);
  const preparedBluetoothCommands = revenue.retailDeviceTransportEvidence
    .filter((record) => record.status === 'prepared' && record.connection === 'bluetooth')
    .slice(0, 4);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const connection = String(data.get('connection')) as PrepareRetailDeviceTransportInput['connection'];
    if (connection === 'network') {
      setNotice('Network commands must be prepared from an approved device setup, never from this generic form.');
      return;
    }

    try {
      await onPrepare({
        kind,
        deviceCode: String(data.get('deviceCode')),
        connection,
        command: commands[kind],
        payload: String(data.get('payload')),
      });
      setNotice('Command prepared. Hardware success will appear only after an independent acknowledgement.');
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Device command could not be prepared.');
    }
  }

  async function recordEvidence(event: FormEvent<HTMLFormElement>, id: string, expectedVersion: number): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = String(data.get('result')) as RecordRetailDeviceTransportInput['result'];
    const record = revenue.retailDeviceTransportEvidence.find((candidate) => candidate.id === id);
    if (!record) {
      setNotice('Device command is no longer available. Refresh the evidence queue.');
      return;
    }

    try {
      await onRecord({
        id,
        result,
        responseReference: String(data.get('responseReference')),
        responseProtocol: responseProtocols[record.kind],
        responseChecksum: String(data.get('responseChecksum') || '').trim().toLowerCase() || undefined,
        responseByteLength: Number(data.get('responseByteLength')) || undefined,
        expectedVersion,
      });
      setNotice(result === 'acknowledged' ? 'Independent device acknowledgement recorded.' : 'Device failure recorded for recovery review.');
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Device evidence could not be recorded.');
    }
  }

  async function retryEvidence(event: FormEvent<HTMLFormElement>, id: string, expectedVersion: number): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await onRetry({
        id,
        payload: String(data.get('payload')),
        reason: String(data.get('reason')),
        expectedVersion,
      });
      setNotice('Retry command prepared. An independent operator must acknowledge the new hardware response.');
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Device retry could not be prepared.');
    }
  }

  async function executeNetwork(
    event: FormEvent<HTMLFormElement>,
    id: string,
    expectedVersion: number,
    target: NetworkCommandTarget,
  ): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await onExecute({
        id,
        host: target.host,
        port: target.port,
        payload: String(data.get('payload')),
        timeoutMs: Number(data.get('timeoutMs')),
        expectedVersion,
      });
      setNotice('Network device response recorded against the prepared command checksum.');
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Network device command could not execute.');
    }
  }

  async function executeUsb(
    event: FormEvent<HTMLFormElement>,
    id: string,
    expectedVersion: number,
    profile: RetailDeviceAdapterProfile,
  ): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const record = revenue.retailDeviceTransportEvidence.find((candidate) => candidate.id === id);
    if (!record) {
      setNotice('USB command is no longer available. Refresh the evidence queue.');
      return;
    }
    const baudRate = Number(data.get('baudRate')) || (profile.configuration.connection === 'usb' ? profile.configuration.baudRate ?? 9_600 : 9_600);
    const payload = String(data.get('payload'));
    try {
      const payloadHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))), (value) => value.toString(16).padStart(2, '0')).join('');
      if (payloadHash !== record.payloadChecksum) throw new Error('The USB payload must match the prepared command exactly.');
      const result = await runRetailSerialTransport(
        navigator as unknown as RetailSerialNavigatorLike,
        record.kind,
        payload,
        baudRate,
        Number(data.get('serialTimeoutMs')) || 2_000,
      );
      await onRecord({
        id,
        result: result.status === 'reachable' ? 'acknowledged' : 'failed',
        responseReference: result.responseReference,
        responseProtocol: responseProtocols[record.kind],
        responseChecksum: result.responseChecksum,
        responseByteLength: result.responseByteLength,
        expectedVersion,
      });
      setNotice(result.status === 'reachable'
        ? 'USB response recorded from the selected device. This is real Web Serial evidence; native-driver certification and live activation remain separate.'
        : result.errorMessage ?? 'USB command failed; recovery evidence was recorded.');
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'USB device command could not execute.');
    }
  }

  async function executeBluetooth(
    event: FormEvent<HTMLFormElement>,
    id: string,
    expectedVersion: number,
    profile: RetailDeviceAdapterProfile,
  ): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const record = revenue.retailDeviceTransportEvidence.find((candidate) => candidate.id === id);
    if (!record || profile.configuration.connection !== 'bluetooth' || !profile.configuration.characteristicUuid) {
      setNotice('Bluetooth command is no longer available with a complete diagnostic profile. Refresh Device setup.');
      return;
    }
    const payload = String(data.get('payload'));
    try {
      const payloadHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))), (value) => value.toString(16).padStart(2, '0')).join('');
      if (payloadHash !== record.payloadChecksum) throw new Error('The Bluetooth payload must match the prepared command exactly.');
      const result = await runRetailBluetoothTransport(
        navigator as unknown as RetailBluetoothNavigatorLike,
        record.kind,
        payload,
        profile.configuration.serviceUuid,
        profile.configuration.characteristicUuid,
        Number(data.get('bluetoothTimeoutMs')) || 2_000,
      );
      await onRecord({
        id,
        result: result.status === 'reachable' ? 'acknowledged' : 'failed',
        responseReference: result.responseReference,
        responseProtocol: responseProtocols[record.kind],
        responseChecksum: result.responseChecksum,
        responseByteLength: result.responseByteLength,
        expectedVersion,
      });
      setNotice(result.status === 'reachable'
        ? 'Bluetooth response recorded from the selected device. This is Web Bluetooth diagnostic evidence; native-driver certification and live activation remain separate.'
        : result.errorMessage ?? 'Bluetooth command failed; recovery evidence was recorded.');
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Bluetooth device command could not execute.');
    }
  }

  async function runPreflight(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await onPreflight({
        kind,
        connection: 'network',
        host: String(data.get('host')),
        port: Number(data.get('port')),
        payload: String(data.get('payload')),
        timeoutMs: Number(data.get('timeoutMs')),
      });
      setNotice(result.status === 'reachable'
        ? `Network device responded in ${result.elapsedMs} ms (${result.responseByteLength} response bytes). This is connectivity evidence only.`
        : result.errorMessage ?? `Device preflight ${result.status}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Device preflight could not run.');
    }
  }

  async function runSerialPreflight(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await runRetailSerialPreflight(
        navigator as unknown as import('./retail-serial-preflight').RetailSerialNavigatorLike,
        kind,
        String(data.get('serialPayload')),
        Number(data.get('baudRate')),
        Number(data.get('serialTimeoutMs')),
      );
      await onRecordPreflight({ source: 'web-serial', result });
      setNotice(result.status === 'reachable'
        ? `Serial device accepted the test payload in ${result.elapsedMs} ms. This is diagnostic evidence only; independent certification is still required.`
        : result.errorMessage ?? 'Serial device preflight did not complete.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Serial device preflight could not run.');
    }
  }

  async function runBluetoothPreflight(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await runRetailBluetoothPreflight(
        navigator as unknown as RetailBluetoothNavigatorLike,
        kind,
        String(data.get('bluetoothPayload')),
        String(data.get('serviceUuid')),
        String(data.get('characteristicUuid')),
        Number(data.get('bluetoothTimeoutMs')),
      );
      await onRecordPreflight({ source: 'web-bluetooth', result: {
        kind,
        connection: 'bluetooth',
        status: result.status,
        responseReference: result.responseReference,
        responseChecksum: result.responseChecksum,
        responseByteLength: result.responseByteLength,
        elapsedMs: result.elapsedMs,
        errorMessage: result.errorMessage,
      } });
      setNotice(result.status === 'reachable'
        ? `Bluetooth device accepted the test payload in ${result.elapsedMs} ms. This is diagnostic evidence only; independent certification is still required.`
        : result.errorMessage ?? 'Bluetooth device preflight did not complete.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Bluetooth device preflight could not run.');
    }
  }

  return (
    <section className="retail-returns-workbench__settlement-panel" aria-labelledby="retail-device-transport-title">
      <header>
        <div>
          <span><Cable size={14} aria-hidden="true" /> 08 / Physical device transport</span>
          <h4 id="retail-device-transport-title">Connect store hardware safely</h4>
        </div>
        <ShieldCheck size={19} aria-hidden="true" />
      </header>
      <p className="retail-returns-workbench__settlement-intro">Prepare a scan, print, drawer-open or weight-read command. Epic BOS never turns a local handoff into a false device success.</p>

      <section className="retail-commerce-health" aria-label="Store execution readiness">
        <header>
          <div>
            <span>STORE EXECUTION</span>
            <h4>{storeReadiness.actionRequired ? 'Attention needed before store operation' : 'Store execution is ready'}</h4>
          </div>
          <strong>{storeReadiness.offline.queuedCount + storeReadiness.offline.conflictCount} offline attention</strong>
        </header>
        <div className="retail-exchange-form__row">
          <div><strong>Offline POS</strong><small>{storeReadiness.offline.queuedCount} queued · {storeReadiness.offline.conflictCount} conflicts · {storeReadiness.offline.recoveryAttemptCount} recovery attempts</small><small>{storeReadiness.offline.staleQueueCount} stale · {storeReadiness.offline.journalGapCount} journal gaps · {storeReadiness.offline.recoveryEvidenceGapCount} evidence gaps</small></div>
          <div><strong>Hardware commands</strong><small>{storeReadiness.device.acknowledgedCount} acknowledged · {storeReadiness.device.preparedCount} awaiting response · {storeReadiness.device.failedCount} failed</small></div>
          <div><strong>Connectivity</strong><small>{storeReadiness.device.reachablePreflightCount} reachable checks · {storeReadiness.device.failedPreflightCount} failed checks</small></div>
        </div>
        <div className="retail-returns-workbench__history-list">
          {storeReadiness.deviceRows.map((row) => (
            <div key={row.kind} data-status={row.status}>
              <div>
                <strong>{names[row.kind]} · {row.status.replaceAll('-', ' ')}</strong>
                <small>{row.preparedCount} prepared · {row.acknowledgedCount} acknowledged · {row.failedCount} failed{row.lastResponseReference ? ` · ${row.lastResponseReference}` : ''}</small>
              </div>
              <em data-status={row.status}>{row.nextAction}</em>
            </div>
          ))}
        </div>
        {storeReadiness.nextActions.map((action) => <p key={action} className="retail-returns-workbench__settlement-intro">Next: {action}</p>)}
      </section>

      <form className="retail-exchange-form" onSubmit={(event) => void submit(event)}>
        <strong>Prepare a non-network device command</strong>
        <p className="retail-returns-workbench__settlement-intro">Network commands are prepared from an approved device setup, where the store endpoint is locked to that device. Use this form only for USB, Bluetooth, or manual handoff evidence.</p>
        <div className="retail-exchange-form__row">
          <label>Device<select value={kind} onChange={(event) => setKind(event.target.value as RetailPhysicalDeviceKind)}>{Object.keys(names).map((id) => <option key={id} value={id}>{names[id as RetailPhysicalDeviceKind]}</option>)}</select></label>
          <label>Device code<input name="deviceCode" defaultValue="COUNTER-DEVICE-01" minLength={2} required /></label>
        </div>
        <div className="retail-exchange-form__row">
          <label>Connection<select name="connection"><option value="usb">USB</option><option value="bluetooth">Bluetooth</option><option value="manual">Manual handoff</option></select></label>
          <label>Payload<input name="payload" defaultValue="DEVICE_TEST" minLength={1} required /></label>
        </div>
        <button className="button button--primary" disabled={busy}>Prepare {names[kind]} command</button>
      </form>

      <form className="retail-exchange-form" onSubmit={(event) => void runPreflight(event)}>
        <strong>Diagnostic network connectivity check</strong>
        <p className="retail-returns-workbench__settlement-intro">Use a store-approved address only. This bounded check does not prepare or send an operating command, enable a device, or record certification or acknowledgement.</p>
        <div className="retail-exchange-form__row">
          <label>Host<input name="host" defaultValue="127.0.0.1" required /></label>
          <label>Port<input name="port" type="number" min="1" max="65535" defaultValue="9100" required /></label>
          <label>Timeout<input name="timeoutMs" type="number" min="250" max="15000" defaultValue="5000" required /></label>
        </div>
        <label>Test payload<input name="payload" defaultValue="DEVICE_PREFLIGHT" minLength={1} maxLength={65536} required /></label>
        <button type="submit" disabled={busy}>Test network connection</button>
      </form>

      {preparedNetworkCommands.map((record) => {
        const target = getNetworkCommandTarget(record, adapterProfiles);
        if (!target) {
          return (
            <article key={`blocked-network-${record.id}`} className="retail-exchange-form" data-status="blocked">
              <strong>Network command needs re-preparation</strong>
              <p className="retail-returns-workbench__settlement-intro">This prepared command does not have a current approved or operational profile-bound endpoint. Do not send it. Re-prepare it from Device setup after the correct device profile is approved.</p>
              <small>{record.deviceCode} · checksum {record.payloadChecksum.slice(0, 12)}</small>
            </article>
          );
        }

        if (record.requestedBy === activeActorId) {
          return (
            <article key={`waiting-network-${record.id}`} className="retail-exchange-form" data-status="waiting">
              <strong>Network command is waiting for an independent operator</strong>
              <small>{record.deviceCode} · {target.profileName} · target locked to {target.host}:{target.port}</small>
            </article>
          );
        }

        return (
          <form key={`execute-${record.id}`} className="retail-exchange-form" onSubmit={(event) => void executeNetwork(event, record.id, record.version, target)}>
            <strong>Send prepared {names[record.kind]} command</strong>
            <small>{record.deviceCode} · {target.profileName} ({target.profileCode}) · checksum {record.payloadChecksum.slice(0, 12)} · payload must match the prepared command exactly</small>
            <div className="retail-exchange-form__row">
              <div>
                <strong>Reviewed endpoint</strong>
                <output aria-label="Reviewed network endpoint">{target.host}:{target.port}</output>
                <small>Locked by Device setup</small>
              </div>
              <label>Execution timeout<input name="timeoutMs" type="number" min="250" max="15000" defaultValue="5000" required /></label>
            </div>
            <label>Exact prepared payload<input name="payload" minLength={1} maxLength={20000} required /></label>
            <button className="button button--primary" type="submit" disabled={busy}>Send through reviewed device</button>
          </form>
        );
      })}

      {revenue.retailDeviceTransportEvidence.filter((record) => record.status === 'prepared' && (record.connection === 'usb' || record.connection === 'bluetooth')).slice(0, 4).map((record) => {
        const profile = getNativeCommandProfile(record, adapterProfiles);
        if (!profile) return null;
        if (record.requestedBy === activeActorId) {
          return <article key={`waiting-native-${record.id}`} className="retail-exchange-form" data-status="waiting"><strong>Native driver command is waiting for an independent operator</strong><small>{record.deviceCode} · {profile.name} · the bridge operator must be different from the command maker</small></article>;
        }
        return (
          <article key={`native-${record.id}`} className="retail-exchange-form" data-status="blocked">
            <strong>Native bridge result required</strong>
            <small>{record.deviceCode} · {profile.name} · {profile.driver.code} {profile.driver.version} · checksum {record.payloadChecksum.slice(0, 12)}</small>
            <p className="retail-returns-workbench__settlement-intro">This prepared USB/Bluetooth command cannot be acknowledged from the renderer. A store-approved, signed native bridge must submit the bounded response through the main-process service seam; no operator-entered result can activate this device.</p>
          </article>
        );
      })}

      {preparedUsbCommands.map((record) => {
        if (getNativeCommandProfile(record, adapterProfiles)) return null;
        const profile = getUsbCommandProfile(record, adapterProfiles);
        if (!profile) {
          return (
            <article key={`blocked-usb-${record.id}`} className="retail-exchange-form" data-status="blocked">
              <strong>USB command needs a current approved profile</strong>
              <p className="retail-returns-workbench__settlement-intro">This command is not bound to a current approved or operational USB setup. Do not choose a port for it. Re-prepare the command from Device setup after the profile is reviewed.</p>
              <small>{record.deviceCode} · checksum {record.payloadChecksum.slice(0, 12)}</small>
            </article>
          );
        }

        if (record.requestedBy === activeActorId) {
          return (
            <article key={`waiting-usb-${record.id}`} className="retail-exchange-form" data-status="waiting">
              <strong>USB command is waiting for an independent operator</strong>
              <small>{record.deviceCode} · {profile.name} · choose the physical port from the other operator account</small>
            </article>
          );
        }

        return (
          <form key={`execute-usb-${record.id}`} className="retail-exchange-form" onSubmit={(event) => void executeUsb(event, record.id, record.version, profile)}>
            <strong>Send prepared {names[record.kind]} command over USB</strong>
            <small>{record.deviceCode} · {profile.name} · checksum {record.payloadChecksum.slice(0, 12)} · exact payload required</small>
            <div className="retail-exchange-form__row">
              <label>Baud rate<input name="baudRate" type="number" min="300" max="4000000" step="1" defaultValue={profile.configuration.connection === 'usb' ? profile.configuration.baudRate ?? 9600 : 9600} required /></label>
              <label>Read timeout<input name="serialTimeoutMs" type="number" min="250" max="15000" defaultValue="2000" required /></label>
            </div>
            <label>Exact prepared payload<input name="payload" minLength={1} maxLength={20000} required /></label>
            <button className="button button--primary" type="submit" disabled={busy}>Choose USB device and send</button>
            <small>Web Serial sends one bounded command and records response checksum evidence. It does not install a native driver or make USB live.</small>
          </form>
        );
      })}

      {preparedBluetoothCommands.map((record) => {
        if (getNativeCommandProfile(record, adapterProfiles)) return null;
        const profile = getBluetoothCommandProfile(record, adapterProfiles);
        if (!profile || profile.configuration.connection !== 'bluetooth' || !profile.configuration.characteristicUuid) {
          return (
            <article key={`blocked-bluetooth-${record.id}`} className="retail-exchange-form" data-status="blocked">
              <strong>Bluetooth command needs a Web Bluetooth diagnostic profile</strong>
              <p className="retail-returns-workbench__settlement-intro">This command is not bound to a current approved Bluetooth diagnostic profile with a characteristic UUID. Do not choose a device for it. Re-prepare the command from Device setup after review.</p>
              <small>{record.deviceCode} · checksum {record.payloadChecksum.slice(0, 12)}</small>
            </article>
          );
        }
        if (record.requestedBy === activeActorId) {
          return (
            <article key={`waiting-bluetooth-${record.id}`} className="retail-exchange-form" data-status="waiting">
              <strong>Bluetooth command is waiting for an independent operator</strong>
              <small>{record.deviceCode} · {profile.name} · choose the physical device from the other operator account</small>
            </article>
          );
        }
        return (
          <form key={`execute-bluetooth-${record.id}`} className="retail-exchange-form" onSubmit={(event) => void executeBluetooth(event, record.id, record.version, profile)}>
            <strong>Send prepared {names[record.kind]} command over Bluetooth</strong>
            <small>{record.deviceCode} · {profile.name} · service {profile.configuration.serviceUuid} · characteristic {profile.configuration.characteristicUuid} · checksum {record.payloadChecksum.slice(0, 12)}</small>
            <label>Response timeout<input name="bluetoothTimeoutMs" type="number" min="250" max="15000" defaultValue="2000" required /></label>
            <label>Exact prepared payload<input name="payload" minLength={1} maxLength={20000} required /></label>
            <button className="button button--primary" type="submit" disabled={busy}>Choose Bluetooth device and send</button>
            <small>Web Bluetooth sends one bounded GATT command and records response checksum evidence. It does not install a native driver or make Bluetooth live.</small>
          </form>
        );
      })}

      <form className="retail-exchange-form" onSubmit={(event) => void runSerialPreflight(event)}>
        <strong>USB / serial diagnostic</strong>
        <p className="retail-returns-workbench__settlement-intro">Choose one connected serial adapter from the system picker. Epic BOS sends a bounded test payload, closes the port, and stores only checksum evidence.</p>
        <div className="retail-exchange-form__row">
          <label>Baud rate<input name="baudRate" type="number" min="300" max="4000000" step="1" defaultValue="9600" required /></label>
          <label>Read timeout<input name="serialTimeoutMs" type="number" min="250" max="15000" defaultValue="2000" required /></label>
        </div>
        <label>Serial test payload<input name="serialPayload" defaultValue="DEVICE_PREFLIGHT" minLength={1} maxLength={65536} required /></label>
        <button type="submit" disabled={busy}>Choose USB device and test</button>
      </form>

      <form className="retail-exchange-form" onSubmit={(event) => void runBluetoothPreflight(event)}>
        <strong>Bluetooth / GATT diagnostic</strong>
        <p className="retail-returns-workbench__settlement-intro">Choose one connected device from the browser picker. Epic BOS writes one bounded payload to the reviewed characteristic, reads a bounded response, closes the connection, and stores checksum evidence only.</p>
        <div className="retail-exchange-form__row">
          <label>Service UUID<input name="serviceUuid" defaultValue="18f0" required /></label>
          <label>Characteristic UUID<input name="characteristicUuid" defaultValue="2af1" required /></label>
          <label>Read timeout<input name="bluetoothTimeoutMs" type="number" min="250" max="15000" defaultValue="2000" required /></label>
        </div>
        <label>Bluetooth test payload<input name="bluetoothPayload" defaultValue="DEVICE_PREFLIGHT" minLength={1} maxLength={65536} required /></label>
        <button type="submit" disabled={busy}>Choose Bluetooth device and test</button>
      </form>

      <div className="retail-returns-workbench__history-list" aria-label="Device preflight history">
        {revenue.retailDevicePreflightEvidence.slice(0, 6).map((evidence) => (
          <div key={evidence.id}>
            <div><strong>{evidence.kind} · {evidence.status}</strong><small>{evidence.responseReference} · {evidence.responseByteLength} bytes · {evidence.elapsedMs} ms · {evidence.responseChecksum.slice(0, 12)}</small></div>
            <em data-status={evidence.status}>{evidence.status}</em>
          </div>
        ))}
      </div>

      <div className="retail-returns-workbench__history-list">
        {revenue.retailDeviceTransportEvidence.slice(0, 8).map((record) => (
          <div key={record.id}>
            <div><strong>{names[record.kind]} · {record.status}</strong><small>{record.deviceCode} · {record.command} · {record.payloadChecksum.slice(0, 10)}{record.responseProtocol ? ` · ${record.responseProtocol}` : ''}{record.responseByteLength ? ` · ${record.responseByteLength} response bytes` : ''}</small></div>
            {record.status === 'prepared' && record.connection === 'network' ? (
              <small>Network responses are captured only through the reviewed device command above. Manual acknowledgement cannot activate a network device.</small>
            ) : record.status === 'prepared' && getNativeCommandProfile(record, adapterProfiles) ? (
              <small>Native bridge required. Renderer acknowledgement is disabled; use the signed main-process bridge seam after hardware certification.</small>
            ) : record.status === 'prepared' && record.requestedBy !== activeActorId ? (
              <form onSubmit={(event) => void recordEvidence(event, record.id, record.version)}>
                <select name="result" aria-label={`Device result for ${record.deviceCode}`}><option value="acknowledged">Acknowledged</option><option value="failed">Failed</option></select>
                <input name="responseReference" placeholder="Real response or failure reference" minLength={4} required />
                <input name="responseByteLength" type="number" min={1} max={65536} placeholder="Response bytes (required for success)" />
                <input name="responseChecksum" placeholder="SHA-256 for acknowledgement" pattern="[a-fA-F0-9]{64}" maxLength={64} inputMode="text" />
                <button type="submit" disabled={busy}>Record result</button>
              </form>
            ) : null}
          </div>
        ))}
      </div>

      {revenue.retailDeviceTransportEvidence.filter((record) => record.status === 'failed' && record.acknowledgedBy !== activeActorId).slice(0, 4).map((record) => (
        <form key={`retry-${record.id}`} className="retail-exchange-form" onSubmit={(event) => void retryEvidence(event, record.id, record.version)}>
          <strong>Recover failed {names[record.kind]} command</strong>
          <small>{record.deviceCode} · failure {record.failureReason ?? record.responseReference ?? 'recorded'}</small>
          <input name="payload" placeholder="Replacement command payload" required />
          <input name="reason" placeholder="Why this retry is authorised" minLength={8} required />
          <button type="submit" disabled={busy}>Prepare controlled retry</button>
        </form>
      ))}

      {notice ? <p className="retail-returns-workbench__notice" role="status">{notice}</p> : null}
    </section>
  );
}
