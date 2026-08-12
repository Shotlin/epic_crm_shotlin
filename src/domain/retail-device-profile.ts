import { createHash, createPublicKey, randomUUID } from 'node:crypto';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import {
  RETAIL_DEVICE_PRIMARY_CAPABILITY,
  type ActivateRetailDeviceAdapterProfileInput,
  type ApproveRetailDeviceAdapterProfileInput,
  type CreateRetailDeviceAdapterProfileInput,
  type RecordRetailDeviceAdapterAcknowledgementInput,
  type RetailDeviceAdapterProfile,
  type RetailDeviceAdapterReadiness,
  type RetailDeviceCapability,
  type RetailDeviceDriverBoundary,
  type RetailDeviceDriverDescriptor,
  type RetailDeviceProfileConfiguration,
  type SuspendRetailDeviceAdapterProfileInput,
} from '../shared/retail-device-profile-contracts';

const checksum = (value: unknown): string => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

const clean = (value: string, label: string, minimum = 2, maximum = 180): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
};

const code = (value: string, label: string): string => {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,63}$/.test(normalized)) throw new Error(`${label} must use 2-64 capital letters, numbers, or dashes.`);
  return normalized;
};

const sameScope = (state: RevenueOpsState, record: { scope?: RevenueOpsState['scope'] }): boolean => {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};

const allowedCapabilities: Readonly<Record<CreateRetailDeviceAdapterProfileInput['kind'], readonly RetailDeviceCapability[]>> = {
  'barcode-scanner': ['barcode-input', 'status-read'],
  'escpos-printer': ['receipt-print', 'status-read'],
  'cash-drawer': ['drawer-pulse', 'status-read'],
  'weighing-scale': ['weight-read', 'status-read'],
};

const allowedBoundaries: Readonly<Record<CreateRetailDeviceAdapterProfileInput['connection'], readonly RetailDeviceDriverBoundary[]>> = {
  usb: ['native-driver-required', 'web-serial-diagnostic-only'],
  bluetooth: ['native-driver-required', 'web-bluetooth-diagnostic-only'],
  network: ['network-tcp-boundary'],
  manual: ['manual-evidence-only'],
};

function normalizeDriver(connection: CreateRetailDeviceAdapterProfileInput['connection'], driver: RetailDeviceDriverDescriptor): RetailDeviceDriverDescriptor {
  const attestationPublicKeyPem = driver.attestationPublicKeyPem?.trim();
  let normalizedAttestationPublicKey: string | undefined;
  if (attestationPublicKeyPem) {
    try {
      const publicKey = createPublicKey(attestationPublicKeyPem);
      if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('The attestation key must be Ed25519.');
      normalizedAttestationPublicKey = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    } catch (error) {
      throw new Error(`Device attestation public key is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const normalized: RetailDeviceDriverDescriptor = {
    code: code(driver.code, 'Device driver code'),
    version: clean(driver.version, 'Device driver version', 1, 40),
    boundary: driver.boundary,
    ...(normalizedAttestationPublicKey ? { attestationPublicKeyPem: normalizedAttestationPublicKey } : {}),
  };
  if (!allowedBoundaries[connection].includes(normalized.boundary)) {
    throw new Error(`The ${connection} transport cannot use the ${normalized.boundary} driver boundary.`);
  }
  return normalized;
}

function normalizeCapabilities(kind: CreateRetailDeviceAdapterProfileInput['kind'], values: readonly RetailDeviceCapability[]): RetailDeviceCapability[] {
  const normalized = [...new Set(values)];
  if (!normalized.length) throw new Error('A device adapter profile must declare at least one capability.');
  const required = RETAIL_DEVICE_PRIMARY_CAPABILITY[kind];
  if (!normalized.includes(required)) throw new Error(`The ${kind} profile must declare the ${required} capability.`);
  if (normalized.some((capability) => !allowedCapabilities[kind].includes(capability))) {
    throw new Error(`The ${kind} profile declares a capability that this device cannot safely perform.`);
  }
  return normalized;
}

function normalizeNetworkHost(value: string): string {
  const host = value.trim();
  if (!host || host.length > 253 || /[\s/\\:@]/.test(host)) throw new Error('Device network host must be a hostname or IP address without a path or credentials.');
  return host;
}

function normalizeConfiguration(connection: CreateRetailDeviceAdapterProfileInput['connection'], configuration: RetailDeviceProfileConfiguration): RetailDeviceProfileConfiguration {
  if (configuration.connection !== connection) throw new Error('Device configuration connection must match the selected device transport.');
  if (configuration.connection === 'network') {
    if (!Number.isInteger(configuration.port) || configuration.port < 1 || configuration.port > 65_535) throw new Error('Device network port must be an integer from 1 to 65535.');
    return { connection: 'network', host: normalizeNetworkHost(configuration.host), port: configuration.port };
  }
  if (configuration.connection === 'usb') {
    const vendorId = configuration.vendorId.trim().toUpperCase().replace(/^0X/, '');
    const productId = configuration.productId.trim().toUpperCase().replace(/^0X/, '');
    if (!/^[0-9A-F]{4}$/.test(vendorId) || !/^[0-9A-F]{4}$/.test(productId)) throw new Error('USB vendor and product IDs must each be four hexadecimal characters.');
    if (configuration.serialNumber && !/^[A-Za-z0-9._-]{1,80}$/.test(configuration.serialNumber.trim())) throw new Error('USB serial number must use only letters, numbers, dots, underscores, or dashes.');
    if (configuration.baudRate !== undefined && (!Number.isInteger(configuration.baudRate) || configuration.baudRate < 300 || configuration.baudRate > 3_000_000)) throw new Error('USB baud rate must be an integer from 300 to 3000000.');
    return {
      connection: 'usb',
      vendorId,
      productId,
      serialNumber: configuration.serialNumber?.trim() || undefined,
      baudRate: configuration.baudRate,
    };
  }
  if (configuration.connection === 'bluetooth') {
    const serviceUuid = configuration.serviceUuid.trim().toLowerCase();
    const isShortUuid = /^[0-9a-f]{4}$/.test(serviceUuid);
    const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(serviceUuid);
    if (!isShortUuid && !isFullUuid) throw new Error('Bluetooth service UUID must be a four-character service UUID or a standard UUID.');
    const characteristicUuid = configuration.characteristicUuid?.trim().toLowerCase();
    if (characteristicUuid) {
      const isShortCharacteristicUuid = /^[0-9a-f]{4}$/.test(characteristicUuid);
      const isFullCharacteristicUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(characteristicUuid);
      if (!isShortCharacteristicUuid && !isFullCharacteristicUuid) throw new Error('Bluetooth characteristic UUID must be a four-character UUID or a standard UUID.');
    }
    const deviceAddress = configuration.deviceAddress?.trim().toUpperCase();
    if (deviceAddress && !/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(deviceAddress)) throw new Error('Bluetooth device address must use the AA:BB:CC:DD:EE:FF format.');
    return { connection: 'bluetooth', serviceUuid, characteristicUuid: characteristicUuid || undefined, deviceAddress: deviceAddress || undefined };
  }
  return { connection: 'manual', procedureReference: clean(configuration.procedureReference, 'Manual device procedure reference', 4, 240) };
}

/**
 * A profile-bound network command must not be redirected to a different host
 * or port by a renderer form. This is deliberately a narrow TCP endpoint
 * guard, not a claim of a vendor-specific device protocol.
 */
export function assertRetailDeviceProfileNetworkEndpoint(profile: RetailDeviceAdapterProfile, host: string, port: number): void {
  if (profile.connection !== 'network' || profile.configuration.connection !== 'network' || profile.driver.boundary !== 'network-tcp-boundary') {
    throw new Error('Only a reviewed network TCP adapter profile can execute a profile-bound network command.');
  }
  const requestedHost = normalizeNetworkHost(host).toLowerCase();
  const configuredHost = profile.configuration.host.toLowerCase();
  if (!Number.isInteger(port) || port < 1 || port > 65_535 || requestedHost !== configuredHost || port !== profile.configuration.port) {
    throw new Error('The requested network endpoint does not match the approved profile configuration.');
  }
}

function profileFor(state: RevenueOpsState, id: string): RetailDeviceAdapterProfile {
  const profile = (state.retailDeviceAdapterProfiles ?? []).find((candidate) => candidate.id === id && sameScope(state, candidate));
  if (!profile) throw new Error('Retail device adapter profile was not found in the current company and branch.');
  return profile;
}

function mutate(state: RevenueOpsState): RevenueOpsState {
  const next = structuredClone(state);
  next.revision += 1;
  next.retailDeviceAdapterProfiles ??= [];
  return next;
}

/**
 * Creates an immutable, non-operational adapter profile. A profile only
 * describes a planned device/driver boundary; it does not assert hardware is
 * installed, reachable, paired, or safe for production use.
 */
export function createRetailDeviceAdapterProfile(
  state: RevenueOpsState,
  input: CreateRetailDeviceAdapterProfileInput,
  actorId: string,
  now = new Date().toISOString(),
  id: string = randomUUID(),
): RevenueOpsState {
  const normalizedCode = code(input.code, 'Retail device adapter profile code');
  if ((state.retailDeviceAdapterProfiles ?? []).some((profile) => profile.code === normalizedCode && sameScope(state, profile))) {
    throw new Error('Retail device adapter profile code already exists in this company and branch.');
  }
  const deviceCode = code(input.deviceCode, 'Retail device code');
  const driver = normalizeDriver(input.connection, input.driver);
  const capabilities = normalizeCapabilities(input.kind, input.capabilities);
  const configuration = normalizeConfiguration(input.connection, input.configuration);
  const next = mutate(state);
  const profile: RetailDeviceAdapterProfile = {
    id,
    code: normalizedCode,
    name: clean(input.name, 'Retail device adapter profile name'),
    kind: input.kind,
    deviceCode,
    connection: input.connection,
    driver,
    capabilities,
    configuration,
    configurationChecksum: checksum({ kind: input.kind, deviceCode, connection: input.connection, driver, capabilities, configuration }),
    status: 'draft',
    createdBy: clean(actorId, 'Device profile maker', 1, 160),
    createdAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  };
  next.retailDeviceAdapterProfiles.unshift(profile);
  return next;
}

export function approveRetailDeviceAdapterProfile(
  state: RevenueOpsState,
  input: ApproveRetailDeviceAdapterProfileInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const profile = profileFor(state, input.id);
  if (profile.status !== 'draft' || profile.version !== input.expectedVersion) throw new Error('Retail device adapter profile is stale or no longer awaiting approval.');
  if (profile.createdBy === actorId) throw new Error('Device profile approval requires an independent reviewer.');
  const next = mutate(state);
  next.retailDeviceAdapterProfiles = next.retailDeviceAdapterProfiles.map((candidate) => candidate.id === profile.id ? {
    ...candidate,
    status: 'approved' as const,
    approvalEvidenceReference: clean(input.evidenceReference, 'Device profile approval evidence', 4, 240),
    approvedBy: clean(actorId, 'Device profile approver', 1, 160),
    approvedAt: now,
    version: candidate.version + 1,
  } : candidate);
  return next;
}

/**
 * Records a real, profile-bound acknowledgement. USB/Bluetooth/manual
 * profiles remain acknowledgement-only because this build contains no native
 * driver or pairing implementation for them.
 */
export function recordRetailDeviceAdapterAcknowledgement(
  state: RevenueOpsState,
  input: RecordRetailDeviceAdapterAcknowledgementInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const profile = profileFor(state, input.id);
  if (profile.status !== 'approved' || profile.version !== input.expectedVersion) throw new Error('Retail device adapter profile is stale or no longer awaiting device acknowledgement.');
  const acknowledgement = state.retailDeviceTransportEvidence.find((record) => record.id === input.deviceAcknowledgementId && sameScope(state, record));
  if (!acknowledgement || acknowledgement.status !== 'acknowledged' || acknowledgement.profileId !== profile.id || acknowledgement.profileVersion !== profile.version) {
    throw new Error('A current acknowledged device response bound to this approved profile is required.');
  }
  if (acknowledgement.kind !== profile.kind || acknowledgement.deviceCode !== profile.deviceCode || acknowledgement.connection !== profile.connection) {
    throw new Error('Device acknowledgement does not match the approved adapter profile.');
  }
  if (new Set([profile.createdBy, profile.approvedBy, acknowledgement.requestedBy, acknowledgement.acknowledgedBy]).has(actorId)) {
    throw new Error('Device acknowledgement certification requires an independent reviewer.');
  }
  const next = mutate(state);
  next.retailDeviceAdapterProfiles = next.retailDeviceAdapterProfiles.map((candidate) => candidate.id === profile.id ? {
    ...candidate,
    status: 'acknowledged' as const,
    acknowledgementEvidenceId: acknowledgement.id,
    acknowledgementEvidenceReference: clean(input.evidenceReference, 'Device acknowledgement evidence', 4, 240),
    acknowledgedBy: clean(actorId, 'Device acknowledgement reviewer', 1, 160),
    acknowledgedAt: now,
    version: candidate.version + 1,
  } : candidate);
  return next;
}

/**
 * Activates only a profile backed by the actual, bounded TCP execution path.
 * This deliberately refuses USB/Bluetooth/manual activation: this project has
 * no native USB/Bluetooth transport, pairing, scanner HID, drawer-pulse, or
 * scale protocol implementation to certify.
 */
export function activateRetailDeviceAdapterProfile(
  state: RevenueOpsState,
  input: ActivateRetailDeviceAdapterProfileInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const profile = profileFor(state, input.id);
  if (profile.status !== 'acknowledged' || profile.version !== input.expectedVersion) throw new Error('Retail device adapter profile is stale or missing recorded acknowledgement evidence.');
  if (profile.driver.boundary !== 'network-tcp-boundary') throw new Error('This adapter profile cannot be marked operational until its real native device driver is implemented and certified.');
  const acknowledgement = profile.acknowledgementEvidenceId
    ? state.retailDeviceTransportEvidence.find((record) => record.id === profile.acknowledgementEvidenceId && sameScope(state, record))
    : undefined;
  if (!acknowledgement || acknowledgement.status !== 'acknowledged' || acknowledgement.acknowledgementSource !== 'network-tcp-execution') {
    throw new Error('Operational activation requires a recorded network TCP execution acknowledgement.');
  }
  if (new Set([profile.createdBy, profile.approvedBy, profile.acknowledgedBy, acknowledgement.requestedBy, acknowledgement.acknowledgedBy]).has(actorId)) {
    throw new Error('Operational activation requires an independent release reviewer.');
  }
  const next = mutate(state);
  next.retailDeviceAdapterProfiles = next.retailDeviceAdapterProfiles.map((candidate) => candidate.id === profile.id ? {
    ...candidate,
    status: 'operational' as const,
    activatedBy: clean(actorId, 'Device profile release reviewer', 1, 160),
    activatedAt: now,
    version: candidate.version + 1,
  } : candidate);
  return next;
}

export function suspendRetailDeviceAdapterProfile(
  state: RevenueOpsState,
  input: SuspendRetailDeviceAdapterProfileInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const profile = profileFor(state, input.id);
  if (profile.status === 'suspended' || profile.version !== input.expectedVersion) throw new Error('Retail device adapter profile is stale or already suspended.');
  const next = mutate(state);
  next.retailDeviceAdapterProfiles = next.retailDeviceAdapterProfiles.map((candidate) => candidate.id === profile.id ? {
    ...candidate,
    status: 'suspended' as const,
    suspendedBy: clean(actorId, 'Device profile suspension reviewer', 1, 160),
    suspendedAt: now,
    suspensionReason: clean(input.reason, 'Device profile suspension reason', 8, 500),
    version: candidate.version + 1,
  } : candidate);
  return next;
}

export function getRetailDeviceAdapterReadiness(state: RevenueOpsState, profileId: string): RetailDeviceAdapterReadiness {
  const profile = profileFor(state, profileId);
  const acknowledgement = profile.acknowledgementEvidenceId
    ? state.retailDeviceTransportEvidence.find((record) => record.id === profile.acknowledgementEvidenceId && sameScope(state, record))
    : undefined;
  if (profile.status === 'draft') return { profileId, status: 'awaiting-approval', operational: false, driverBoundary: profile.driver.boundary, nextAction: 'Have an independent reviewer approve the driver/profile configuration.' };
  if (profile.status === 'approved') return { profileId, status: 'awaiting-device-acknowledgement', operational: false, driverBoundary: profile.driver.boundary, nextAction: 'Record a real device response that is bound to this approved profile.' };
  if (profile.status === 'suspended') return { profileId, status: 'suspended', operational: false, driverBoundary: profile.driver.boundary, acknowledgementSource: acknowledgement?.acknowledgementSource, nextAction: 'Resolve the suspension and create a new approved profile before using this device.' };
  if (profile.status === 'operational') return { profileId, status: 'operational', operational: true, driverBoundary: profile.driver.boundary, acknowledgementSource: acknowledgement?.acknowledgementSource, nextAction: 'Monitor the device response evidence and suspend the profile on any store incident.' };
  return {
    profileId,
    status: 'acknowledged',
    operational: false,
    driverBoundary: profile.driver.boundary,
    acknowledgementSource: acknowledgement?.acknowledgementSource,
    nextAction: profile.driver.boundary === 'network-tcp-boundary'
      ? 'Have an independent release reviewer activate the recorded TCP device response.'
      : 'Native USB/Bluetooth drivers are not implemented in this build; retain this acknowledgement as evidence, not as an operational certification.',
  };
}
