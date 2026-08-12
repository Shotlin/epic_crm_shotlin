import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { activateRetailDeviceAdapterProfile, approveRetailDeviceAdapterProfile, createRetailDeviceAdapterProfile, recordRetailDeviceAdapterAcknowledgement } from './retail-device-profile';
import { buildRetailNativeDeviceAttestationMessage, prepareRetailDeviceTransport, recordNetworkExecutedRetailDeviceTransport, recordRetailDeviceTransport, recordRetailNativeDeviceDriverResult, retryRetailDeviceTransport } from './retail-device-transport';
import type { RecordRetailNativeDeviceDriverResultInput, RetailDeviceTransportEvidence } from '../shared/retail-device-transport-contracts';

const nativeKeyPair = generateKeyPairSync('ed25519');
const nativePublicKeyPem = nativeKeyPair.publicKey.export({ format: 'pem', type: 'spki' }).toString();
const nativeKeyFingerprint = createHash('sha256').update(nativeKeyPair.publicKey.export({ format: 'der', type: 'spki' })).digest('hex');

function attestNativeResult(
  record: RetailDeviceTransportEvidence,
  input: Omit<RecordRetailNativeDeviceDriverResultInput, 'attestation'>,
  signedAt: string,
  nonce: string,
): RecordRetailNativeDeviceDriverResultInput {
  const unsigned = {
    ...input,
    attestation: {
      algorithm: 'ed25519' as const,
      keyFingerprint: nativeKeyFingerprint,
      signature: '',
      signedAt,
      nonce,
    },
  };
  return {
    ...unsigned,
    attestation: {
      ...unsigned.attestation,
      signature: sign(null, Buffer.from(buildRetailNativeDeviceAttestationMessage(record, unsigned), 'utf8'), nativeKeyPair.privateKey).toString('base64'),
    },
  };
}

describe('retail physical-device transport evidence', () => {
  it('prepares a command with a deterministic payload checksum and device-specific command gate', () => {
    let state = createInitialRevenueOpsState();
    state = prepareRetailDeviceTransport(state, { kind: 'cash-drawer', deviceCode: 'DRAWER-01', connection: 'usb', command: 'open-drawer', payload: 'OPEN_DRAWER' }, 'cashier-1', '2026-07-31T11:00:00.000Z', 'device-job-1');
    expect(state.retailDeviceTransportEvidence[0]).toEqual(expect.objectContaining({ id: 'device-job-1', status: 'prepared', kind: 'cash-drawer', payloadByteLength: 11, payloadChecksum: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(() => prepareRetailDeviceTransport(state, { kind: 'weighing-scale', deviceCode: 'SCALE-01', connection: 'usb', command: 'open-drawer', payload: 'OPEN_DRAWER' }, 'cashier-1')).toThrow(/command/i);
  });

  it('requires an independent acknowledgement and preserves response evidence', () => {
    let state = createInitialRevenueOpsState();
    state = prepareRetailDeviceTransport(state, { kind: 'weighing-scale', deviceCode: 'SCALE-01', connection: 'bluetooth', command: 'read-weight', payload: 'READ_WEIGHT' }, 'cashier-1', '2026-07-31T11:00:00.000Z', 'device-job-1');
    expect(() => recordRetailDeviceTransport(state, { id: 'device-job-1', result: 'acknowledged', responseReference: 'SCALE-ACK-1', responseProtocol: 'weighing-scale-reading-v1', responseChecksum: 'a'.repeat(64), responseByteLength: 12, expectedVersion: 1 }, 'cashier-1')).toThrow(/independent/i);
    state = recordRetailDeviceTransport(state, { id: 'device-job-1', result: 'acknowledged', responseReference: 'SCALE-ACK-1', responseProtocol: 'weighing-scale-reading-v1', responseChecksum: 'a'.repeat(64), responseByteLength: 12, expectedVersion: 1 }, 'checker-1', '2026-07-31T11:01:00.000Z');
    expect(state.retailDeviceTransportEvidence[0]).toEqual(expect.objectContaining({ status: 'acknowledged', acknowledgedBy: 'checker-1', responseReference: 'SCALE-ACK-1', responseChecksum: 'a'.repeat(64), version: 2 }));
  });

  it('requires the protocol envelope and positive response length for a successful acknowledgement', () => {
    let state = createInitialRevenueOpsState();
    state = prepareRetailDeviceTransport(state, { kind: 'cash-drawer', deviceCode: 'DRAWER-PROTOCOL-01', connection: 'usb', command: 'open-drawer', payload: 'OPEN_DRAWER' }, 'cashier-1', '2026-07-31T11:00:00.000Z', 'device-protocol-1');
    expect(() => recordRetailDeviceTransport(state, { id: 'device-protocol-1', result: 'acknowledged', responseReference: 'DRAWER-ACK-1', responseProtocol: 'escpos-status-v1', responseChecksum: 'c'.repeat(64), responseByteLength: 4, expectedVersion: 1 }, 'checker-1')).toThrow(/requires cash-drawer-status-v1/i);
    expect(() => recordRetailDeviceTransport(state, { id: 'device-protocol-1', result: 'acknowledged', responseReference: 'DRAWER-ACK-1', responseProtocol: 'cash-drawer-status-v1', responseChecksum: 'c'.repeat(64), responseByteLength: 0, expectedVersion: 1 }, 'checker-1')).toThrow(/positive response byte length/i);
  });

  it('records a failed hardware response without fabricating a success checksum', () => {
    let state = createInitialRevenueOpsState();
    state = createRetailDeviceAdapterProfile(state, {
      code: 'PRINTER-NETWORK-FAILURE-01',
      name: 'Failure-path printer',
      kind: 'escpos-printer',
      deviceCode: 'PRINTER-01',
      connection: 'network',
      driver: { code: 'GENERIC-ESC-POS-TCP', version: '1.0.0', boundary: 'network-tcp-boundary' },
      capabilities: ['receipt-print', 'status-read'],
      configuration: { connection: 'network', host: '192.168.10.99', port: 9100 },
    }, 'maker-1', '2026-07-31T10:59:00.000Z', 'device-profile-failure-1');
    state = approveRetailDeviceAdapterProfile(state, { id: 'device-profile-failure-1', evidenceReference: 'PRINTER-PROFILE-APPROVAL-FAILURE-001', expectedVersion: 1 }, 'approver-1', '2026-07-31T10:59:30.000Z');
    state = prepareRetailDeviceTransport(state, { profileId: 'device-profile-failure-1', kind: 'escpos-printer', deviceCode: 'PRINTER-01', connection: 'network', command: 'print', payload: 'RECEIPT_TEST' }, 'cashier-1', '2026-07-31T11:00:00.000Z', 'device-job-failure');
    state = recordRetailDeviceTransport(state, { id: 'device-job-failure', result: 'failed', responseReference: 'PRINTER-TIMEOUT-1', responseProtocol: 'escpos-status-v1', expectedVersion: 1 }, 'checker-1', '2026-07-31T11:01:00.000Z');
    expect(state.retailDeviceTransportEvidence[0]).toEqual(expect.objectContaining({ status: 'failed', failureReason: 'PRINTER-TIMEOUT-1', responseReference: 'PRINTER-TIMEOUT-1', responseChecksum: undefined, acknowledgedBy: 'checker-1' }));
  });

  it('rejects replayed hardware response evidence on a different command', () => {
    let state = createInitialRevenueOpsState();
    state = prepareRetailDeviceTransport(state, { kind: 'barcode-scanner', deviceCode: 'SCAN-REPLAY-01', connection: 'usb', command: 'scan', payload: 'SCAN_ONE' }, 'cashier-1', '2026-07-31T11:00:00.000Z', 'device-replay-1');
    state = recordRetailDeviceTransport(state, { id: 'device-replay-1', result: 'acknowledged', responseReference: 'SCAN-ACK-REPLAY', responseProtocol: 'barcode-scanner-status-v1', responseChecksum: 'b'.repeat(64), responseByteLength: 6, expectedVersion: 1 }, 'checker-1', '2026-07-31T11:01:00.000Z');
    state = prepareRetailDeviceTransport(state, { kind: 'barcode-scanner', deviceCode: 'SCAN-REPLAY-01', connection: 'usb', command: 'scan', payload: 'SCAN_TWO' }, 'cashier-1', '2026-07-31T11:02:00.000Z', 'device-replay-2');
    expect(() => recordRetailDeviceTransport(state, { id: 'device-replay-2', result: 'acknowledged', responseReference: 'SCAN-ACK-REPLAY', responseProtocol: 'barcode-scanner-status-v1', responseChecksum: 'b'.repeat(64), responseByteLength: 6, expectedVersion: 1 }, 'checker-2', '2026-07-31T11:03:00.000Z')).toThrow(/already used|replay/i);
  });

  it('requeues a failed command through an independent, evidence-backed retry', () => {
    let state = createInitialRevenueOpsState();
    state = prepareRetailDeviceTransport(state, { kind: 'barcode-scanner', deviceCode: 'SCAN-01', connection: 'usb', command: 'scan', payload: 'SCAN_TEST' }, 'cashier-1', '2026-07-31T11:00:00.000Z', 'device-job-retry');
    state = recordRetailDeviceTransport(state, { id: 'device-job-retry', result: 'failed', responseReference: 'SCAN-DISCONNECTED-1', responseProtocol: 'barcode-scanner-status-v1', expectedVersion: 1 }, 'checker-1', '2026-07-31T11:01:00.000Z');
    expect(() => retryRetailDeviceTransport(state, { id: 'device-job-retry', payload: 'SCAN_RETRY', reason: 'Reconnect USB device after operator inspection.', expectedVersion: 2 }, 'checker-1')).toThrow(/cannot requeue/i);
    state = retryRetailDeviceTransport(state, { id: 'device-job-retry', payload: 'SCAN_RETRY', reason: 'Reconnect USB device after operator inspection.', expectedVersion: 2 }, 'supervisor-1', '2026-07-31T11:02:00.000Z', 'device-job-retry-2');
    expect(state.retailDeviceTransportEvidence[0]).toMatchObject({ id: 'device-job-retry-2', status: 'prepared', retryOfId: 'device-job-retry', retryReason: 'Reconnect USB device after operator inspection.', command: 'scan' });
  });

  it('preserves the approved profile and exact profile revision when a profile-bound command is retried', () => {
    let state = createInitialRevenueOpsState();
    state = createRetailDeviceAdapterProfile(state, {
      code: 'RETRY-SCALE-USB-01',
      name: 'Retry-safe weighing scale',
      kind: 'weighing-scale',
      deviceCode: 'SCALE-RETRY-01',
      connection: 'usb',
      driver: { code: 'SCALE-SERIAL', version: '1.0.0', boundary: 'web-serial-diagnostic-only' },
      capabilities: ['weight-read', 'status-read'],
      configuration: { connection: 'usb', vendorId: '1A2B', productId: '3C4D', baudRate: 9600 },
    }, 'maker-1', '2026-08-03T10:00:00.000Z', 'device-profile-retry-1');
    state = approveRetailDeviceAdapterProfile(state, { id: 'device-profile-retry-1', evidenceReference: 'SCALE-PROFILE-APPROVAL-001', expectedVersion: 1 }, 'approver-1', '2026-08-03T10:01:00.000Z');

    state = prepareRetailDeviceTransport(state, {
      profileId: 'device-profile-retry-1',
      kind: 'weighing-scale',
      deviceCode: 'SCALE-RETRY-01',
      connection: 'usb',
      command: 'read-weight',
      payload: 'READ_WEIGHT',
    }, 'cashier-1', '2026-08-03T10:02:00.000Z', 'device-profile-retry-command-1');
    state = recordRetailDeviceTransport(state, {
      id: 'device-profile-retry-command-1',
      result: 'failed',
      responseReference: 'SCALE-RETRY-DISCONNECTED-001',
      responseProtocol: 'weighing-scale-reading-v1',
      expectedVersion: 1,
    }, 'witness-1', '2026-08-03T10:03:00.000Z');

    state = retryRetailDeviceTransport(state, {
      id: 'device-profile-retry-command-1',
      payload: 'READ_WEIGHT_RETRY',
      reason: 'Store manager inspected the scale cable and approved a controlled retry.',
      expectedVersion: 2,
    }, 'manager-1', '2026-08-03T10:04:00.000Z', 'device-profile-retry-command-2');

    expect(state.retailDeviceTransportEvidence[0]).toMatchObject({
      id: 'device-profile-retry-command-2',
      retryOfId: 'device-profile-retry-command-1',
      profileId: 'device-profile-retry-1',
      profileVersion: 2,
      status: 'prepared',
    });
  });

  it('requires a network command to use a current approved or operational device profile', () => {
    let state = createInitialRevenueOpsState();

    expect(() => prepareRetailDeviceTransport(state, {
      kind: 'escpos-printer',
      deviceCode: 'RECEIPT-UNBOUND-01',
      connection: 'network',
      command: 'print',
      payload: 'RECEIPT TEST',
    }, 'operator-1')).toThrow(/network.*profile/i);

    state = createRetailDeviceAdapterProfile(state, {
      code: 'PRINTER-TCP-OP-01',
      name: 'Operational counter printer',
      kind: 'escpos-printer',
      deviceCode: 'RECEIPT-OP-01',
      connection: 'network',
      driver: { code: 'GENERIC-ESC-POS-TCP', version: '1.0.0', boundary: 'network-tcp-boundary' },
      capabilities: ['receipt-print', 'status-read'],
      configuration: { connection: 'network', host: '192.168.10.42', port: 9100 },
    }, 'maker-1', '2026-08-03T12:00:00.000Z', 'device-profile-operational-1');
    state = approveRetailDeviceAdapterProfile(state, { id: 'device-profile-operational-1', evidenceReference: 'PRINTER-PROFILE-APPROVAL-001', expectedVersion: 1 }, 'approver-1', '2026-08-03T12:01:00.000Z');
    state = prepareRetailDeviceTransport(state, {
      profileId: 'device-profile-operational-1',
      kind: 'escpos-printer',
      deviceCode: 'RECEIPT-OP-01',
      connection: 'network',
      command: 'print',
      payload: 'INITIAL RECEIPT TEST',
    }, 'operator-1', '2026-08-03T12:02:00.000Z', 'device-command-operational-1');
    state = recordNetworkExecutedRetailDeviceTransport(state, {
      id: 'device-command-operational-1',
      result: 'acknowledged',
      responseReference: 'tcp://192.168.10.42:9100/initial',
      responseProtocol: 'escpos-status-v1',
      responseChecksum: 'd'.repeat(64),
      responseByteLength: 2,
      expectedVersion: 1,
    }, 'witness-1', '2026-08-03T12:03:00.000Z');
    state = recordRetailDeviceAdapterAcknowledgement(state, {
      id: 'device-profile-operational-1',
      deviceAcknowledgementId: 'device-command-operational-1',
      evidenceReference: 'PRINTER-DEVICE-ACK-001',
      expectedVersion: 2,
    }, 'certifier-1', '2026-08-03T12:04:00.000Z');
    state = activateRetailDeviceAdapterProfile(state, { id: 'device-profile-operational-1', expectedVersion: 3 }, 'release-1', '2026-08-03T12:05:00.000Z');

    state = prepareRetailDeviceTransport(state, {
      profileId: 'device-profile-operational-1',
      kind: 'escpos-printer',
      deviceCode: 'RECEIPT-OP-01',
      connection: 'network',
      command: 'print',
      payload: 'FOLLOW-UP RECEIPT TEST',
    }, 'operator-1', '2026-08-03T12:06:00.000Z', 'device-command-operational-2');

    expect(state.retailDeviceTransportEvidence[0]).toMatchObject({
      id: 'device-command-operational-2',
      profileId: 'device-profile-operational-1',
      profileVersion: 4,
      status: 'prepared',
    });
  });

  it('records native USB/Bluetooth driver identity and keeps unsupported hardware explicit', () => {
    let state = createInitialRevenueOpsState();
    state = createRetailDeviceAdapterProfile(state, {
      code: 'SCANNER-NATIVE-01',
      name: 'Native barcode scanner',
      kind: 'barcode-scanner',
      deviceCode: 'SCAN-NATIVE-01',
      connection: 'usb',
      driver: { code: 'EPIC-HID-BRIDGE', version: '0.1.0', boundary: 'native-driver-required', attestationPublicKeyPem: nativePublicKeyPem },
      capabilities: ['barcode-input', 'status-read'],
      configuration: { connection: 'usb', vendorId: '1A2B', productId: '3C4D' },
    }, 'maker-1', '2026-08-04T10:00:00.000Z', 'native-profile-1');
    state = approveRetailDeviceAdapterProfile(state, { id: 'native-profile-1', evidenceReference: 'NATIVE-PROFILE-APPROVAL-001', expectedVersion: 1 }, 'approver-1', '2026-08-04T10:01:00.000Z');
    state = prepareRetailDeviceTransport(state, { profileId: 'native-profile-1', kind: 'barcode-scanner', deviceCode: 'SCAN-NATIVE-01', connection: 'usb', command: 'scan', payload: 'SCAN' }, 'cashier-1', '2026-08-04T10:02:00.000Z', 'native-job-1');
    expect(() => recordRetailDeviceTransport(state, { id: 'native-job-1', result: 'acknowledged', responseReference: 'renderer-forged', responseProtocol: 'barcode-scanner-status-v1', responseChecksum: 'f'.repeat(64), responseByteLength: 16, expectedVersion: 1 }, 'checker-1', '2026-08-04T10:02:30.000Z')).toThrow(/main-process bridge/i);
    const firstNativeRecord = state.retailDeviceTransportEvidence.find((record) => record.id === 'native-job-1');
    if (!firstNativeRecord) throw new Error('Native command fixture was not created.');
    const firstNativeInput = attestNativeResult(firstNativeRecord, { id: 'native-job-1', result: 'acknowledged', driverCode: 'EPIC-HID-BRIDGE', driverVersion: '0.1.0', responseReference: 'native://scan/1', responseProtocol: 'barcode-scanner-status-v1', responseChecksum: 'e'.repeat(64), responseByteLength: 16, expectedVersion: 1 }, '2026-08-04T10:03:00.000Z', 'native-nonce-000001');
    expect(() => recordRetailNativeDeviceDriverResult(state, { ...firstNativeInput, responseReference: 'native://tampered' }, 'checker-1', '2026-08-04T10:03:00.000Z')).toThrow(/signature/i);
    state = recordRetailNativeDeviceDriverResult(state, firstNativeInput, 'checker-1', '2026-08-04T10:03:00.000Z');
    expect(state.retailDeviceTransportEvidence[0]).toMatchObject({ status: 'acknowledged', acknowledgementSource: 'native-driver-attestation', nativeDriverStatus: 'acknowledged', nativeDriverCode: 'EPIC-HID-BRIDGE', nativeDriverVersion: '0.1.0', nativeAttestationKeyFingerprint: nativeKeyFingerprint, nativeAttestationNonce: 'native-nonce-000001' });

    state = prepareRetailDeviceTransport(state, { profileId: 'native-profile-1', kind: 'barcode-scanner', deviceCode: 'SCAN-NATIVE-01', connection: 'usb', command: 'scan', payload: 'SCAN-2' }, 'cashier-1', '2026-08-04T10:04:00.000Z', 'native-job-2');
    const secondNativeRecord = state.retailDeviceTransportEvidence.find((record) => record.id === 'native-job-2');
    if (!secondNativeRecord) throw new Error('Second native command fixture was not created.');
    const replayedNativeInput = attestNativeResult(secondNativeRecord, { id: 'native-job-2', result: 'acknowledged', driverCode: 'EPIC-HID-BRIDGE', driverVersion: '0.1.0', responseReference: 'native://scan/replay', responseProtocol: 'barcode-scanner-status-v1', responseChecksum: 'd'.repeat(64), responseByteLength: 16, expectedVersion: 1 }, '2026-08-04T10:05:00.000Z', 'native-nonce-000001');
    expect(() => recordRetailNativeDeviceDriverResult(state, replayedNativeInput, 'checker-1', '2026-08-04T10:05:00.000Z')).toThrow(/already been used|replay/i);
    state = recordRetailNativeDeviceDriverResult(state, attestNativeResult(secondNativeRecord, { id: 'native-job-2', result: 'unsupported', driverCode: 'EPIC-HID-BRIDGE', driverVersion: '0.1.0', responseReference: 'native://scan/unsupported', responseProtocol: 'barcode-scanner-status-v1', errorMessage: 'Driver returned no HID device.', expectedVersion: 1 }, '2026-08-04T10:05:00.000Z', 'native-nonce-000002'), 'checker-1', '2026-08-04T10:05:00.000Z');
    expect(state.retailDeviceTransportEvidence[0]).toMatchObject({ status: 'failed', nativeDriverStatus: 'unsupported', failureReason: 'Native driver unsupported: Driver returned no HID device.' });
  });
});
