import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { RetailDeviceAdapterProfile } from '../shared/retail-device-profile-contracts';
import type { RetailDeviceTransportEvidence } from '../shared/retail-device-transport-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailDeviceTransportPanel, type RetailDeviceTransportPanelProps } from './RetailDeviceTransportPanel';

const generatedAt = '2026-08-03T12:00:00.000Z';

function revenueWithDeviceCommands(
  evidence: RetailDeviceTransportEvidence[] = [],
  profiles: RetailDeviceAdapterProfile[] = [],
): RevenueOpsSnapshot {
  const state = createInitialRevenueOpsState();
  state.retailDeviceTransportEvidence = evidence;
  state.retailDeviceAdapterProfiles = profiles;
  return getRevenueOpsSnapshot(state, {
    opportunities: [],
    accounts: [],
    contacts: [],
    addresses: [],
    activeUserIds: [],
  }, generatedAt);
}

const networkProfile: RetailDeviceAdapterProfile = {
  id: 'device-profile-printer-1',
  code: 'PRINTER-TCP-01',
  name: 'Counter receipt printer',
  kind: 'escpos-printer',
  deviceCode: 'RECEIPT-01',
  connection: 'network',
  driver: { code: 'GENERIC-ESC-POS-TCP', version: '1.0.0', boundary: 'network-tcp-boundary' },
  capabilities: ['receipt-print', 'status-read'],
  configuration: { connection: 'network', host: '192.168.10.42', port: 9100 },
  configurationChecksum: 'a'.repeat(64),
  status: 'operational',
  createdBy: 'maker-1',
  createdAt: generatedAt,
  version: 4,
};

const usbProfile: RetailDeviceAdapterProfile = {
  id: 'device-profile-usb-1',
  code: 'PRINTER-USB-01',
  name: 'USB receipt printer',
  kind: 'escpos-printer',
  deviceCode: 'USB-RECEIPT-01',
  connection: 'usb',
  driver: { code: 'WEB-SERIAL-DIAGNOSTIC', version: '1.0.0', boundary: 'web-serial-diagnostic-only' },
  capabilities: ['receipt-print', 'status-read'],
  configuration: { connection: 'usb', vendorId: '1234', productId: '5678', baudRate: 9_600 },
  configurationChecksum: 'e'.repeat(64),
  status: 'approved',
  createdBy: 'maker-1',
  createdAt: generatedAt,
  approvedBy: 'reviewer-1',
  approvedAt: generatedAt,
  version: 2,
};

const bluetoothProfile: RetailDeviceAdapterProfile = {
  id: 'device-profile-bluetooth-1',
  code: 'PRINTER-BT-01',
  name: 'Bluetooth receipt printer',
  kind: 'escpos-printer',
  deviceCode: 'BT-RECEIPT-01',
  connection: 'bluetooth',
  driver: { code: 'WEB-BLUETOOTH-DIAGNOSTIC', version: '1.0.0', boundary: 'web-bluetooth-diagnostic-only' },
  capabilities: ['receipt-print', 'status-read'],
  configuration: { connection: 'bluetooth', serviceUuid: '18f0', characteristicUuid: '2af1' },
  configurationChecksum: 'g'.repeat(64),
  status: 'approved',
  createdBy: 'maker-1',
  createdAt: generatedAt,
  approvedBy: 'reviewer-1',
  approvedAt: generatedAt,
  version: 2,
};

const nativeProfile: RetailDeviceAdapterProfile = {
  id: 'device-profile-native-1',
  code: 'SCANNER-HID-01',
  name: 'Native barcode scanner',
  kind: 'barcode-scanner',
  deviceCode: 'HID-SCAN-01',
  connection: 'usb',
  driver: { code: 'EPIC-HID-BRIDGE', version: '2.0.0', boundary: 'native-driver-required' },
  capabilities: ['barcode-input', 'status-read'],
  configuration: { connection: 'usb', vendorId: '1234', productId: '5678' },
  configurationChecksum: 'h'.repeat(64),
  status: 'approved',
  createdBy: 'maker-1',
  createdAt: generatedAt,
  approvedBy: 'reviewer-1',
  approvedAt: generatedAt,
  version: 2,
};

function preparedNetworkCommand(overrides: Partial<RetailDeviceTransportEvidence> = {}): RetailDeviceTransportEvidence {
  return {
    id: 'device-command-printer-1',
    kind: 'escpos-printer',
    deviceCode: 'RECEIPT-01',
    connection: 'network',
    command: 'print',
    profileId: networkProfile.id,
    profileVersion: networkProfile.version,
    payloadChecksum: 'b'.repeat(64),
    payloadByteLength: 12,
    status: 'prepared',
    requestedBy: 'operator-1',
    requestedAt: generatedAt,
    version: 3,
    ...overrides,
  };
}

function preparedUsbCommand(overrides: Partial<RetailDeviceTransportEvidence> = {}): RetailDeviceTransportEvidence {
  return {
    id: 'device-command-usb-1',
    kind: 'escpos-printer',
    deviceCode: 'USB-RECEIPT-01',
    connection: 'usb',
    command: 'print',
    profileId: usbProfile.id,
    profileVersion: usbProfile.version,
    payloadChecksum: 'f'.repeat(64),
    payloadByteLength: 5,
    status: 'prepared',
    requestedBy: 'operator-1',
    requestedAt: generatedAt,
    version: 2,
    ...overrides,
  };
}

function preparedBluetoothCommand(overrides: Partial<RetailDeviceTransportEvidence> = {}): RetailDeviceTransportEvidence {
  return {
    id: 'device-command-bluetooth-1',
    kind: 'escpos-printer',
    deviceCode: 'BT-RECEIPT-01',
    connection: 'bluetooth',
    command: 'print',
    profileId: bluetoothProfile.id,
    profileVersion: bluetoothProfile.version,
    payloadChecksum: 'f'.repeat(64),
    payloadByteLength: 5,
    status: 'prepared',
    requestedBy: 'operator-1',
    requestedAt: generatedAt,
    version: 2,
    ...overrides,
  };
}

function preparedNativeCommand(overrides: Partial<RetailDeviceTransportEvidence> = {}): RetailDeviceTransportEvidence {
  return {
    id: 'device-command-native-1',
    kind: 'barcode-scanner',
    deviceCode: 'HID-SCAN-01',
    connection: 'usb',
    command: 'scan',
    profileId: nativeProfile.id,
    profileVersion: nativeProfile.version,
    payloadChecksum: 'a'.repeat(64),
    payloadByteLength: 4,
    status: 'prepared',
    requestedBy: 'operator-1',
    requestedAt: generatedAt,
    version: 1,
    ...overrides,
  };
}

function renderPanel(
  revenue = revenueWithDeviceCommands(),
  onExecute: RetailDeviceTransportPanelProps['onExecute'] = vi.fn().mockResolvedValue(undefined),
  onRecord: RetailDeviceTransportPanelProps['onRecord'] = vi.fn().mockResolvedValue(undefined),
) {
  return render(
    <RetailDeviceTransportPanel
      revenue={revenue}
      busy={false}
      activeActorId="operator-2"
      onPrepare={vi.fn().mockResolvedValue(undefined)}
      onRecord={onRecord}
      onExecute={onExecute}
      onRetry={vi.fn().mockResolvedValue(undefined)}
      onPreflight={vi.fn().mockResolvedValue({
        kind: 'escpos-printer',
        connection: 'network',
        status: 'reachable',
        responseReference: 'tcp://192.168.10.42:9100/check',
        responseChecksum: 'c'.repeat(64),
        responseByteLength: 1,
        elapsedMs: 20,
      })}
      onRecordPreflight={vi.fn().mockResolvedValue({
        kind: 'escpos-printer',
        connection: 'usb',
        status: 'reachable',
        responseReference: 'web-serial://device',
        responseChecksum: 'd'.repeat(64),
        responseByteLength: 1,
        elapsedMs: 20,
      })}
    />,
  );
}

afterEach(() => cleanup());

describe('RetailDeviceTransportPanel network command boundary', () => {
  it('keeps the generic prepare form away from unbound network commands', () => {
    renderPanel();

    const connection = screen.getByLabelText('Connection') as HTMLSelectElement;
    expect(Array.from(connection.options, (option) => option.value)).toEqual(['usb', 'bluetooth', 'manual']);
    expect(screen.getByText(/Network commands are prepared from an approved device setup/i)).toBeTruthy();
  });

  it('locks a profile-bound network command to its configured host and port', async () => {
    const user = userEvent.setup();
    const onExecute = vi.fn().mockResolvedValue(undefined);
    renderPanel(revenueWithDeviceCommands([preparedNetworkCommand()], [networkProfile]), onExecute);

    expect(screen.getByLabelText('Reviewed network endpoint').textContent).toContain('192.168.10.42:9100');

    await user.type(screen.getByLabelText('Exact prepared payload'), 'RECEIPT TEST');
    await user.click(screen.getByRole('button', { name: 'Send through reviewed device' }));

    expect(onExecute).toHaveBeenCalledWith({
      id: 'device-command-printer-1',
      host: '192.168.10.42',
      port: 9100,
      payload: 'RECEIPT TEST',
      timeoutMs: 5000,
      expectedVersion: 3,
    });
  });

  it('stops a legacy unbound network command and tells the operator to re-prepare it', () => {
    renderPanel(revenueWithDeviceCommands([
      preparedNetworkCommand({ id: 'legacy-network-command', profileId: undefined, profileVersion: undefined }),
    ]));

    expect(screen.getByText(/Network command needs re-preparation/i)).toBeTruthy();
    expect(screen.getByText(/does not have a current approved or operational profile-bound endpoint/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send through reviewed device' })).toBeNull();
  });

  it('does not expose an execution control when the device profile is not currently approved or operational', () => {
    renderPanel(revenueWithDeviceCommands(
      [preparedNetworkCommand()],
      [{ ...networkProfile, status: 'acknowledged' }],
    ));

    expect(screen.getByText(/Network command needs re-preparation/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send through reviewed device' })).toBeNull();
  });

  it('sends an exact prepared USB payload through Web Serial and records the response', async () => {
    const user = userEvent.setup();
    const selected = {
      opened: false,
      closed: false,
      getInfo: () => ({ usbVendorId: 0x1234, usbProductId: 0x5678 }),
      open: async () => { selected.opened = true; },
      close: async () => { selected.closed = true; },
      writable: { getWriter: () => ({ write: async () => undefined, releaseLock: () => undefined }) },
      readable: { getReader: () => ({ read: async () => ({ value: new TextEncoder().encode('ACK'), done: false }), cancel: async () => undefined, releaseLock: () => undefined }) },
    };
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => selected } });
    const onRecord = vi.fn().mockResolvedValue(undefined);
    const payload = 'PRINT';
    const payloadChecksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))), (value) => value.toString(16).padStart(2, '0')).join('');
    renderPanel(revenueWithDeviceCommands([preparedUsbCommand({ payloadChecksum })], [usbProfile]), undefined, onRecord);
    // The exact payload is checked before the port is opened.
    await user.type(screen.getByLabelText('Exact prepared payload'), payload);
    await user.click(screen.getByRole('button', { name: 'Choose USB device and send' }));
    expect(selected.opened).toBe(true);
    expect(selected.closed).toBe(true);
    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({
      id: 'device-command-usb-1',
      result: 'acknowledged',
      responseReference: 'serial://usb/1234:5678/command',
      responseByteLength: 3,
    }));
  });

  it('sends an exact prepared Bluetooth payload through Web Bluetooth and records the response', async () => {
    const user = userEvent.setup();
    const selected = {
      id: 'store-printer-01',
      gatt: {
        connect: async () => ({
          getPrimaryService: async () => ({
            getCharacteristic: async () => ({
              writeValueWithResponse: async () => undefined,
              readValue: async () => new TextEncoder().encode('ACK'),
            }),
          }),
        }),
        disconnect: vi.fn(),
      },
    };
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice: async () => selected } });
    const onRecord = vi.fn().mockResolvedValue(undefined);
    const payload = 'PRINT';
    const payloadChecksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))), (value) => value.toString(16).padStart(2, '0')).join('');
    renderPanel(revenueWithDeviceCommands([preparedBluetoothCommand({ payloadChecksum })], [bluetoothProfile]), undefined, onRecord);
    await user.type(screen.getByLabelText('Exact prepared payload'), payload);
    await user.click(screen.getByRole('button', { name: 'Choose Bluetooth device and send' }));
    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({
      id: 'device-command-bluetooth-1',
      result: 'acknowledged',
      responseReference: 'bluetooth://store-printer-01/18f0/2af1',
      responseByteLength: 3,
    }));
  });

  it('does not expose a renderer form for native bridge evidence', () => {
    render(
      <RetailDeviceTransportPanel
        revenue={revenueWithDeviceCommands([preparedNativeCommand()], [nativeProfile])}
        busy={false}
        activeActorId="operator-2"
        onPrepare={vi.fn().mockResolvedValue(undefined)}
        onRecord={vi.fn().mockResolvedValue(undefined)}
        onExecute={vi.fn().mockResolvedValue(undefined)}
        onRetry={vi.fn().mockResolvedValue(undefined)}
        onPreflight={vi.fn().mockResolvedValue({ kind: 'barcode-scanner', connection: 'network', status: 'unsupported', responseReference: 'driver-required:test', responseChecksum: '0'.repeat(64), responseByteLength: 0, elapsedMs: 0 })}
        onRecordPreflight={vi.fn().mockResolvedValue({ kind: 'barcode-scanner', connection: 'usb', status: 'unsupported', responseReference: 'driver-required:web-serial', responseChecksum: '0'.repeat(64), responseByteLength: 0, elapsedMs: 0 })}
      />,
    );
    expect(screen.getByText('Native bridge result required')).toBeTruthy();
    expect(screen.getByText(/cannot be acknowledged from the renderer/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record native bridge result' })).toBeNull();
  });
});
