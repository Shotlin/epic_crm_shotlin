import type { OperatingRecordScope } from './revenue-ops-contracts';

export type RetailPhysicalDeviceKind = 'barcode-scanner' | 'escpos-printer' | 'cash-drawer' | 'weighing-scale';
export type RetailDeviceConnection = 'usb' | 'network' | 'bluetooth' | 'manual';
export type RetailDeviceTransportCommand = 'scan' | 'print' | 'open-drawer' | 'read-weight';
export type RetailDeviceTransportStatus = 'prepared' | 'acknowledged' | 'failed';
/** Result reported by a real native USB/Bluetooth bridge. Unsupported is kept
 * distinct from a transport failure so rollout tooling cannot mistake a
 * missing driver for a tested device. */
export type RetailNativeDriverResultStatus = 'acknowledged' | 'failed' | 'unsupported';
/** The app records whether an acknowledgement came from an operator or the bounded TCP executor. */
export type RetailDeviceAcknowledgementSource = 'operator-evidence' | 'network-tcp-execution';
export type RetailDeviceResponseProtocol = 'barcode-scanner-status-v1' | 'escpos-status-v1' | 'cash-drawer-status-v1' | 'weighing-scale-reading-v1';

export interface RetailDeviceTransportEvidence {
  id: string;
  kind: RetailPhysicalDeviceKind;
  deviceCode: string;
  connection: RetailDeviceConnection;
  command: RetailDeviceTransportCommand;
  /** Optional binding to an approved immutable adapter profile. */
  profileId?: string;
  /** Profile version in force when the command was prepared. */
  profileVersion?: number;
  payloadChecksum: string;
  payloadByteLength: number;
  status: RetailDeviceTransportStatus;
  requestedBy: string;
  requestedAt: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  acknowledgementSource?: RetailDeviceAcknowledgementSource;
  responseReference?: string;
  responseChecksum?: string;
  responseProtocol?: RetailDeviceResponseProtocol;
  responseByteLength?: number;
  nativeDriverStatus?: RetailNativeDriverResultStatus;
  nativeDriverCode?: string;
  nativeDriverVersion?: string;
  failureReason?: string;
  retryOfId?: string;
  retryReason?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface PrepareRetailDeviceTransportInput {
  profileId?: string;
  kind: RetailPhysicalDeviceKind;
  deviceCode: string;
  connection: RetailDeviceConnection;
  command: RetailDeviceTransportCommand;
  payload: string;
}

export interface RecordRetailDeviceTransportInput {
  id: string;
  result: 'acknowledged' | 'failed';
  responseReference: string;
  responseProtocol: RetailDeviceResponseProtocol;
  responseChecksum?: string;
  responseByteLength?: number;
  expectedVersion: number;
}

/**
 * Main-process-only evidence from a provider-neutral native device bridge.
 * The bridge returns metadata and checksums; raw USB/Bluetooth bytes never
 * cross into renderer state or the audit log.
 */
export interface RecordRetailNativeDeviceDriverResultInput {
  id: string;
  result: RetailNativeDriverResultStatus;
  driverCode: string;
  driverVersion: string;
  responseReference: string;
  responseProtocol: RetailDeviceResponseProtocol;
  responseChecksum?: string;
  responseByteLength?: number;
  errorMessage?: string;
  expectedVersion: number;
}

/** Executes a prepared network command with the supplied payload and records the bounded response. */
export interface ExecuteRetailDeviceTransportInput {
  id: string;
  host: string;
  port: number;
  payload: string;
  timeoutMs?: number;
  expectedVersion: number;
}

export interface RetryRetailDeviceTransportInput {
  id: string;
  payload: string;
  reason: string;
  expectedVersion: number;
}

/** A bounded, non-certifying connectivity check for a network-attached device. */
export interface PreflightRetailDeviceTransportInput {
  kind: RetailPhysicalDeviceKind;
  connection: RetailDeviceConnection;
  host?: string;
  port?: number;
  payload: string;
  timeoutMs?: number;
}

export interface RetailDeviceTransportPreflightResult {
  kind: RetailPhysicalDeviceKind;
  connection: RetailDeviceConnection;
  status: 'reachable' | 'failed' | 'unsupported';
  host?: string;
  port?: number;
  responseReference: string;
  responseChecksum: string;
  responseByteLength: number;
  elapsedMs: number;
  errorMessage?: string;
}

/**
 * Result captured by the user-initiated Web Serial path. The main process
 * stores only bounded diagnostic metadata; this is never a certification
 * acknowledgement and never contains raw device bytes.
 */
export interface RecordRetailDevicePreflightEvidenceInput {
  source: 'web-serial' | 'web-bluetooth';
  result: RetailDeviceTransportPreflightResult;
}
