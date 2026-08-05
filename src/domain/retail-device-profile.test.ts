import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import {
  activateRetailDeviceAdapterProfile,
  assertRetailDeviceProfileNetworkEndpoint,
  approveRetailDeviceAdapterProfile,
  createRetailDeviceAdapterProfile,
  getRetailDeviceAdapterReadiness,
  recordRetailDeviceAdapterAcknowledgement,
} from './retail-device-profile';
import {
  prepareRetailDeviceTransport,
  recordRetailDeviceTransport,
  recordNetworkExecutedRetailDeviceTransport,
} from './retail-device-transport';

describe('retail device adapter profiles', () => {
  it('does not call an approved network profile operational before a profile-bound device acknowledgement', () => {
    let state = createInitialRevenueOpsState();
    state = createRetailDeviceAdapterProfile(state, {
      code: 'PRINTER-TCP-01',
      name: 'Counter receipt printer',
      kind: 'escpos-printer',
      deviceCode: 'RECEIPT-01',
      connection: 'network',
      driver: { code: 'GENERIC-ESC-POS-TCP', version: '1.0.0', boundary: 'network-tcp-boundary' },
      capabilities: ['receipt-print', 'status-read'],
      configuration: { connection: 'network', host: '192.168.10.42', port: 9100 },
    }, 'maker-1', '2026-08-02T10:00:00.000Z', 'device-profile-1');

    expect(getRetailDeviceAdapterReadiness(state, 'device-profile-1')).toMatchObject({ status: 'awaiting-approval', operational: false });
    expect(() => approveRetailDeviceAdapterProfile(state, { id: 'device-profile-1', evidenceReference: 'DEVICE-APPROVAL-001', expectedVersion: 1 }, 'maker-1')).toThrow(/independent/i);

    state = approveRetailDeviceAdapterProfile(state, { id: 'device-profile-1', evidenceReference: 'DEVICE-APPROVAL-001', expectedVersion: 1 }, 'approver-1', '2026-08-02T10:01:00.000Z');
    expect(getRetailDeviceAdapterReadiness(state, 'device-profile-1')).toMatchObject({ status: 'awaiting-device-acknowledgement', operational: false });
    expect(() => activateRetailDeviceAdapterProfile(state, { id: 'device-profile-1', expectedVersion: 2 }, 'release-1')).toThrow(/acknowledgement/i);

    state = prepareRetailDeviceTransport(state, {
      profileId: 'device-profile-1',
      kind: 'escpos-printer',
      deviceCode: 'RECEIPT-01',
      connection: 'network',
      command: 'print',
      payload: 'RECEIPT TEST',
    }, 'operator-1', '2026-08-02T10:02:00.000Z', 'device-command-1');
    state = recordNetworkExecutedRetailDeviceTransport(state, {
      id: 'device-command-1',
      result: 'acknowledged',
      responseReference: 'tcp://192.168.10.42:9100/test-1',
      responseProtocol: 'escpos-status-v1',
      responseChecksum: 'a'.repeat(64),
      responseByteLength: 2,
      expectedVersion: 1,
    }, 'device-witness-1', '2026-08-02T10:03:00.000Z');
    state = recordRetailDeviceAdapterAcknowledgement(state, {
      id: 'device-profile-1',
      deviceAcknowledgementId: 'device-command-1',
      evidenceReference: 'DEVICE-ACK-001',
      expectedVersion: 2,
    }, 'certifier-1', '2026-08-02T10:04:00.000Z');

    expect(getRetailDeviceAdapterReadiness(state, 'device-profile-1')).toMatchObject({ status: 'acknowledged', operational: false });
    state = activateRetailDeviceAdapterProfile(state, { id: 'device-profile-1', expectedVersion: 3 }, 'release-1', '2026-08-02T10:05:00.000Z');
    expect(getRetailDeviceAdapterReadiness(state, 'device-profile-1')).toMatchObject({ status: 'operational', operational: true, acknowledgementSource: 'network-tcp-execution' });
  });

  it('validates each transport boundary and refuses to turn USB acknowledgement into a native-driver certification', () => {
    let state = createInitialRevenueOpsState();
    expect(() => createRetailDeviceAdapterProfile(state, {
      code: 'BAD-SCAN-01',
      name: 'Unsafe scanner profile',
      kind: 'barcode-scanner',
      deviceCode: 'SCAN-01',
      connection: 'usb',
      driver: { code: 'GENERIC-SCANNER', version: '1.0.0', boundary: 'network-tcp-boundary' },
      capabilities: ['receipt-print'],
      configuration: { connection: 'usb', vendorId: 'ZZZZ', productId: '1234' },
    }, 'maker-1')).toThrow(/usb transport|capability/i);

    state = createRetailDeviceAdapterProfile(state, {
      code: 'SCAN-USB-01',
      name: 'Counter barcode scanner',
      kind: 'barcode-scanner',
      deviceCode: 'SCAN-01',
      connection: 'usb',
      driver: { code: 'GENERIC-SCANNER', version: '1.0.0', boundary: 'web-serial-diagnostic-only' },
      capabilities: ['barcode-input', 'status-read'],
      configuration: { connection: 'usb', vendorId: '0x1a2b', productId: '3c4d', baudRate: 9600 },
    }, 'maker-1', '2026-08-02T11:00:00.000Z', 'device-profile-usb-1');
    state = approveRetailDeviceAdapterProfile(state, { id: 'device-profile-usb-1', evidenceReference: 'DEVICE-APPROVAL-USB-001', expectedVersion: 1 }, 'approver-1', '2026-08-02T11:01:00.000Z');
    state = prepareRetailDeviceTransport(state, {
      profileId: 'device-profile-usb-1',
      kind: 'barcode-scanner',
      deviceCode: 'SCAN-01',
      connection: 'usb',
      command: 'scan',
      payload: 'SCAN TEST',
    }, 'operator-1', '2026-08-02T11:02:00.000Z', 'device-command-usb-1');
    state = recordRetailDeviceTransport(state, {
      id: 'device-command-usb-1',
      result: 'acknowledged',
      responseReference: 'USB-SCAN-ACK-001',
      responseProtocol: 'barcode-scanner-status-v1',
      responseChecksum: 'b'.repeat(64),
      responseByteLength: 12,
      expectedVersion: 1,
    }, 'device-witness-1', '2026-08-02T11:03:00.000Z');
    state = recordRetailDeviceAdapterAcknowledgement(state, {
      id: 'device-profile-usb-1',
      deviceAcknowledgementId: 'device-command-usb-1',
      evidenceReference: 'DEVICE-ACK-USB-001',
      expectedVersion: 2,
    }, 'certifier-1', '2026-08-02T11:04:00.000Z');

    expect(getRetailDeviceAdapterReadiness(state, 'device-profile-usb-1')).toMatchObject({ status: 'acknowledged', operational: false, driverBoundary: 'web-serial-diagnostic-only', acknowledgementSource: 'operator-evidence' });
    expect(() => activateRetailDeviceAdapterProfile(state, { id: 'device-profile-usb-1', expectedVersion: 3 }, 'release-1')).toThrow(/native device driver/i);
  });

  it('keeps the four retail device kinds and four connection types as explicit, validated profile records', () => {
    let state = createInitialRevenueOpsState();
    const profiles = [
      {
        code: 'SCANNER-USB-02', name: 'USB scanner', kind: 'barcode-scanner' as const, deviceCode: 'SCAN-02', connection: 'usb' as const,
        driver: { code: 'SCANNER-USB', version: '2.0.0', boundary: 'native-driver-required' as const }, capabilities: ['barcode-input'] as const,
        configuration: { connection: 'usb' as const, vendorId: '1234', productId: 'ABCD' },
      },
      {
        code: 'PRINTER-NET-02', name: 'Network printer', kind: 'escpos-printer' as const, deviceCode: 'PRINT-02', connection: 'network' as const,
        driver: { code: 'ESC-POS-TCP', version: '2.0.0', boundary: 'network-tcp-boundary' as const }, capabilities: ['receipt-print'] as const,
        configuration: { connection: 'network' as const, host: '10.0.0.12', port: 9100 },
      },
      {
        code: 'DRAWER-BT-02', name: 'Bluetooth drawer', kind: 'cash-drawer' as const, deviceCode: 'DRAWER-02', connection: 'bluetooth' as const,
        driver: { code: 'DRAWER-BT', version: '2.0.0', boundary: 'native-driver-required' as const }, capabilities: ['drawer-pulse'] as const,
        configuration: { connection: 'bluetooth' as const, serviceUuid: '1812', deviceAddress: 'AA:BB:CC:DD:EE:FF' },
      },
      {
        code: 'SCALE-MANUAL-02', name: 'Manual scale', kind: 'weighing-scale' as const, deviceCode: 'SCALE-02', connection: 'manual' as const,
        driver: { code: 'SCALE-CHECKLIST', version: '2.0.0', boundary: 'manual-evidence-only' as const }, capabilities: ['weight-read'] as const,
        configuration: { connection: 'manual' as const, procedureReference: 'SCALE-PROCEDURE-002' },
      },
    ];

    for (const input of profiles) state = createRetailDeviceAdapterProfile(state, input, 'maker-1');

    expect(state.retailDeviceAdapterProfiles.map((profile) => `${profile.kind}:${profile.connection}`).sort()).toEqual([
      'barcode-scanner:usb',
      'cash-drawer:bluetooth',
      'escpos-printer:network',
      'weighing-scale:manual',
    ]);
  });

  it('normalizes a Web Bluetooth diagnostic profile without making it operational', () => {
    let state = createInitialRevenueOpsState();
    state = createRetailDeviceAdapterProfile(state, {
      code: 'PRINTER-BT-DIAG-01',
      name: 'Bluetooth diagnostic printer',
      kind: 'escpos-printer',
      deviceCode: 'BT-PRINT-01',
      connection: 'bluetooth',
      driver: { code: 'WEB-BLUETOOTH-DIAGNOSTIC', version: '1.0.0', boundary: 'web-bluetooth-diagnostic-only' },
      capabilities: ['receipt-print', 'status-read'],
      configuration: { connection: 'bluetooth', serviceUuid: '18F0', characteristicUuid: '2AF1', deviceAddress: 'aa:bb:cc:dd:ee:ff' },
    }, 'maker-1', '2026-08-04T11:00:00.000Z', 'device-profile-bluetooth-1');
    expect(state.retailDeviceAdapterProfiles[0]?.configuration).toMatchObject({ connection: 'bluetooth', serviceUuid: '18f0', characteristicUuid: '2af1', deviceAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(getRetailDeviceAdapterReadiness(state, 'device-profile-bluetooth-1')).toMatchObject({ status: 'awaiting-approval', operational: false, driverBoundary: 'web-bluetooth-diagnostic-only' });
  });

  it('keeps a profile-bound network command on its reviewed device endpoint', () => {
    let state = createInitialRevenueOpsState();
    state = createRetailDeviceAdapterProfile(state, {
      code: 'DRAWER-TCP-01',
      name: 'Counter cash drawer bridge',
      kind: 'cash-drawer',
      deviceCode: 'DRAWER-01',
      connection: 'network',
      driver: { code: 'GENERIC-ESC-POS-TCP', version: '1.0.0', boundary: 'network-tcp-boundary' },
      capabilities: ['drawer-pulse', 'status-read'],
      configuration: { connection: 'network', host: '192.168.10.20', port: 9100 },
    }, 'maker-1', '2026-08-02T12:00:00.000Z', 'device-profile-drawer-1');
    const profile = state.retailDeviceAdapterProfiles[0]!;

    expect(() => assertRetailDeviceProfileNetworkEndpoint(profile, '192.168.10.20', 9100)).not.toThrow();
    expect(() => assertRetailDeviceProfileNetworkEndpoint(profile, '192.168.10.21', 9100)).toThrow(/approved profile/i);
    expect(() => assertRetailDeviceProfileNetworkEndpoint(profile, '192.168.10.20', 9101)).toThrow(/approved profile/i);
  });
});
