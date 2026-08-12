import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type { PrepareRetailDeviceTransportInput, RecordRetailDeviceTransportInput, RecordRetailNativeDeviceDriverResultInput, RetryRetailDeviceTransportInput, RetailDeviceAcknowledgementSource, RetailDeviceResponseProtocol, RetailDeviceTransportCommand, RetailDeviceTransportEvidence, RetailPhysicalDeviceKind } from '../shared/retail-device-transport-contracts';
import { RETAIL_DEVICE_PRIMARY_CAPABILITY, type RetailDeviceAdapterProfile } from '../shared/retail-device-profile-contracts';

const checksum = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const clean = (value: string, label: string, minimum = 3, maximum = 240) => {
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
};
const sameScope = (state: RevenueOpsState, record: { scope?: RevenueOpsState['scope'] }) => {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};
const commandForKind: Record<RetailPhysicalDeviceKind, RetailDeviceTransportCommand> = {
  'barcode-scanner': 'scan',
  'escpos-printer': 'print',
  'cash-drawer': 'open-drawer',
  'weighing-scale': 'read-weight',
};
const responseProtocolForKind: Record<RetailPhysicalDeviceKind, RetailDeviceResponseProtocol> = {
  'barcode-scanner': 'barcode-scanner-status-v1',
  'escpos-printer': 'escpos-status-v1',
  'cash-drawer': 'cash-drawer-status-v1',
  'weighing-scale': 'weighing-scale-reading-v1',
};
const NATIVE_ATTESTATION_MAX_SKEW_MS = 5 * 60 * 1000;
const BASE64_SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const FINGERPRINT = /^[a-f0-9]{64}$/i;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * All live TCP commands must be tied to one reviewed device profile. The
 * profile is the authority for device identity and endpoint configuration;
 * the renderer must never turn an arbitrary host/port into a store command.
 */
function currentProfileForTransport(
  state: RevenueOpsState,
  profileId: string | undefined,
  kind: RetailPhysicalDeviceKind,
  deviceCode: string,
  connection: PrepareRetailDeviceTransportInput['connection'],
) {
  const profile = profileId
    ? (state.retailDeviceAdapterProfiles ?? []).find((candidate) => candidate.id === profileId && sameScope(state, candidate))
    : undefined;
  if (connection === 'network' && !profile) throw new Error('A network device command requires a current approved or operational device adapter profile. Set up and approve the device first.');
  if (profileId && !profile) throw new Error('The selected retail device adapter profile was not found in the current company and branch.');
  if (!profile) return undefined;
  if (profile.status !== 'approved' && profile.status !== 'operational') throw new Error('A profile-bound device transport command requires an approved or operational adapter profile.');
  if (profile.kind !== kind || profile.deviceCode !== deviceCode || profile.connection !== connection) throw new Error('Device transport does not match the selected adapter profile kind, code, or connection.');
  if (!profile.capabilities.includes(RETAIL_DEVICE_PRIMARY_CAPABILITY[kind])) throw new Error('The selected adapter profile does not declare the required device capability.');
  return profile;
}

export function prepareRetailDeviceTransport(state: RevenueOpsState, input: PrepareRetailDeviceTransportInput, actorId: string, now = new Date().toISOString(), id: string = randomUUID()): RevenueOpsState {
  if (commandForKind[input.kind] !== input.command) throw new Error(`The ${input.kind} device only accepts the ${commandForKind[input.kind]} command.`);
  const deviceCode = clean(input.deviceCode, 'Device code', 2, 80).toUpperCase();
  const payload = clean(input.payload, 'Device payload', 1, 20_000);
  const profile = currentProfileForTransport(state, input.profileId, input.kind, deviceCode, input.connection);
  if (state.retailDeviceTransportEvidence.some((record) => record.deviceCode === deviceCode && record.status === 'prepared' && sameScope(state, record))) throw new Error('This device already has a prepared transport command. Acknowledge or fail it before sending another.');
  const next = structuredClone(state);
  next.revision += 1;
  const evidence: RetailDeviceTransportEvidence = {
    id,
    kind: input.kind,
    deviceCode,
    connection: input.connection,
    command: input.command,
    profileId: profile?.id,
    profileVersion: profile?.version,
    payloadChecksum: checksum(payload),
    payloadByteLength: Buffer.byteLength(payload, 'utf8'),
    status: 'prepared',
    requestedBy: actorId,
    requestedAt: now,
    scope: structuredClone(next.scope),
    version: 1,
  };
  next.retailDeviceTransportEvidence.unshift(evidence);
  return next;
}

function recordDeviceTransport(
  state: RevenueOpsState,
  input: RecordRetailDeviceTransportInput,
  actorId: string,
  acknowledgementSource: RetailDeviceAcknowledgementSource,
  now = new Date().toISOString(),
  nativeEvidence?: Pick<RetailDeviceTransportEvidence, 'nativeDriverStatus' | 'nativeDriverCode' | 'nativeDriverVersion' | 'nativeAttestationKeyFingerprint' | 'nativeAttestationNonce' | 'nativeAttestedAt' | 'nativeAttestationSignature'>,
  failureReasonOverride?: string,
): RevenueOpsState {
  const record = state.retailDeviceTransportEvidence.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!record || record.status !== 'prepared' || record.version !== input.expectedVersion) throw new Error('Device transport evidence is stale or no longer awaiting acknowledgement.');
  if (record.requestedBy === actorId) throw new Error('Device acknowledgement requires an independent operator.');
  const boundProfile = record.profileId
    ? (state.retailDeviceAdapterProfiles ?? []).find((candidate) => candidate.id === record.profileId && sameScope(state, candidate))
    : undefined;
  if (boundProfile?.driver.boundary === 'native-driver-required' && !nativeEvidence) {
    throw new Error('Native USB/Bluetooth evidence must be submitted by the installed main-process bridge, not operator acknowledgement.');
  }
  const responseReference = clean(input.responseReference, 'Device response reference', 4, 240);
  if (input.responseProtocol !== responseProtocolForKind[record.kind]) throw new Error(`This ${record.kind} command requires ${responseProtocolForKind[record.kind]} response evidence.`);
  if (input.result === 'acknowledged' && (!input.responseChecksum || !/^[a-f0-9]{64}$/i.test(input.responseChecksum))) throw new Error('A successful device acknowledgement requires a 64-character response checksum.');
  if (input.result === 'acknowledged' && (!Number.isInteger(input.responseByteLength) || (input.responseByteLength ?? 0) <= 0 || (input.responseByteLength ?? 0) > 65_536)) throw new Error('A successful device acknowledgement requires a positive response byte length up to 65536.');
  const responseChecksum = input.responseChecksum?.trim().toLowerCase();
  const attestationNonce = nativeEvidence?.nativeAttestationNonce;
  const replayed = acknowledgementSource !== 'network-tcp-execution' && state.retailDeviceTransportEvidence.some((candidate) => candidate.id !== record.id && sameScope(state, candidate) && candidate.status !== 'prepared' && (candidate.responseReference === responseReference || Boolean(responseChecksum && candidate.responseChecksum === responseChecksum) || Boolean(attestationNonce && candidate.nativeAttestationNonce === attestationNonce)));
  if (replayed) throw new Error('Device response evidence has already been used for another command; possible replay.');
  const next = structuredClone(state);
  next.revision += 1;
  next.retailDeviceTransportEvidence = next.retailDeviceTransportEvidence.map((candidate) => candidate.id === record.id ? {
    ...candidate,
    status: input.result,
    acknowledgedBy: actorId,
    acknowledgedAt: now,
    acknowledgementSource: input.result === 'acknowledged' ? acknowledgementSource : undefined,
    responseReference,
    responseChecksum,
    responseProtocol: input.responseProtocol,
    responseByteLength: input.responseByteLength,
    failureReason: input.result === 'failed' ? failureReasonOverride ?? responseReference : undefined,
    ...nativeEvidence,
    version: candidate.version + 1,
  } : candidate);
  return next;
}

/** Manual/operator evidence must remain one-command-only to expose accidental replay. */
export function recordRetailDeviceTransport(state: RevenueOpsState, input: RecordRetailDeviceTransportInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  return recordDeviceTransport(state, input, actorId, 'operator-evidence', now);
}

/**
 * Used only by the main-process bounded TCP executor after it has opened a
 * network socket and captured the response. Renderer-supplied acknowledgement
 * evidence intentionally remains tagged as operator evidence.
 */
export function recordNetworkExecutedRetailDeviceTransport(state: RevenueOpsState, input: RecordRetailDeviceTransportInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const record = state.retailDeviceTransportEvidence.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!record || record.connection !== 'network') throw new Error('Network execution evidence can only be recorded for a prepared network device command.');
  // A bounded TCP response may legitimately be identical for recurring
  // commands (for example a stable printer status). The command ID, profile
  // version, endpoint, and main-process executor remain the evidence binding.
  return recordDeviceTransport(state, input, actorId, 'network-tcp-execution', now);
}

function nativeProfileForTransport(state: RevenueOpsState, record: RetailDeviceTransportEvidence): RetailDeviceAdapterProfile {
  if (record.connection !== 'usb' && record.connection !== 'bluetooth') {
    throw new Error('Native driver evidence is only valid for USB or Bluetooth device commands.');
  }
  if (!record.profileId || record.profileVersion === undefined) {
    throw new Error('A native driver result must be bound to an approved device adapter profile.');
  }
  const profile = (state.retailDeviceAdapterProfiles ?? []).find((candidate) => candidate.id === record.profileId && sameScope(state, candidate));
  if (!profile || profile.version !== record.profileVersion || (profile.status !== 'approved' && profile.status !== 'operational')) {
    throw new Error('The native driver result is not bound to the current approved device profile revision.');
  }
  if (profile.connection !== record.connection || profile.kind !== record.kind || profile.deviceCode !== record.deviceCode || profile.driver.boundary !== 'native-driver-required') {
    throw new Error('The selected device profile is not certified for this native driver boundary.');
  }
  return profile;
}

/**
 * Builds the exact detached message a native bridge must sign. Keeping this
 * canonical representation in the main-process domain prevents a bridge from
 * signing one command while the store records another response envelope.
 */
export function buildRetailNativeDeviceAttestationMessage(record: RetailDeviceTransportEvidence, input: RecordRetailNativeDeviceDriverResultInput): string {
  return JSON.stringify({
    schema: 'epic-bos.native-device-attestation.v1',
    profileId: record.profileId ?? null,
    profileVersion: record.profileVersion ?? null,
    commandId: record.id,
    commandVersion: record.version,
    kind: record.kind,
    deviceCode: record.deviceCode,
    command: record.command,
    payloadChecksum: record.payloadChecksum,
    result: input.result,
    driverCode: input.driverCode.trim().toUpperCase(),
    driverVersion: input.driverVersion.trim(),
    responseReference: input.responseReference.trim(),
    responseProtocol: input.responseProtocol,
    responseChecksum: input.responseChecksum?.trim().toLowerCase() ?? null,
    responseByteLength: input.responseByteLength ?? null,
    errorMessage: input.errorMessage?.trim() || null,
    signedAt: input.attestation.signedAt,
    nonce: input.attestation.nonce,
  });
}

function verifyNativeDeviceAttestation(
  record: RetailDeviceTransportEvidence,
  profile: RetailDeviceAdapterProfile,
  input: RecordRetailNativeDeviceDriverResultInput,
  now: string,
): Pick<RetailDeviceTransportEvidence, 'nativeAttestationKeyFingerprint' | 'nativeAttestationNonce' | 'nativeAttestedAt' | 'nativeAttestationSignature'> {
  const attestation = input.attestation;
  if (attestation.algorithm !== 'ed25519') throw new Error('Native device attestation must use Ed25519.');
  if (!FINGERPRINT.test(attestation.keyFingerprint)) throw new Error('Native device attestation key fingerprint is invalid.');
  if (!BASE64_SIGNATURE.test(attestation.signature)) throw new Error('Native device attestation signature is invalid.');
  if (!NONCE.test(attestation.nonce)) throw new Error('Native device attestation nonce is invalid.');
  const signedAtMs = Date.parse(attestation.signedAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(signedAtMs) || !Number.isFinite(nowMs) || Math.abs(nowMs - signedAtMs) > NATIVE_ATTESTATION_MAX_SKEW_MS) {
    throw new Error('Native device attestation is stale or outside the allowed clock window.');
  }
  if (!profile.driver.attestationPublicKeyPem) {
    throw new Error('The native device profile has no attestation public key; install a signed bridge profile before recording hardware evidence.');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(profile.driver.attestationPublicKeyPem);
  } catch (error) {
    throw new Error(`Native device attestation public key is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const fingerprint = createHash('sha256').update(publicKey.export({ format: 'der', type: 'spki' })).digest('hex');
  if (fingerprint !== attestation.keyFingerprint.toLowerCase()) throw new Error('Native device attestation key fingerprint does not match the approved profile.');
  const valid = verify(null, Buffer.from(buildRetailNativeDeviceAttestationMessage(record, input), 'utf8'), publicKey, Buffer.from(attestation.signature, 'base64'));
  if (!valid) throw new Error('Native device attestation signature is invalid for this command and response envelope.');
  return {
    nativeAttestationKeyFingerprint: fingerprint,
    nativeAttestationNonce: attestation.nonce,
    nativeAttestedAt: attestation.signedAt,
    nativeAttestationSignature: attestation.signature,
  };
}

/**
 * Records a result from a future native USB/Bluetooth bridge. This is an
 * explicit seam, not a simulated driver: the bridge must supply its own
 * driver identity and bounded response metadata. Unsupported results remain
 * failed transport records with nativeDriverStatus='unsupported'.
 */
export function recordRetailNativeDeviceDriverResult(
  state: RevenueOpsState,
  input: RecordRetailNativeDeviceDriverResultInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const record = state.retailDeviceTransportEvidence.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!record || record.status !== 'prepared' || record.version !== input.expectedVersion) throw new Error('Native device command is stale or no longer awaiting a driver result.');
  const profile = nativeProfileForTransport(state, record);
  const driverCode = clean(input.driverCode, 'Native driver code', 2, 80).toUpperCase();
  const driverVersion = clean(input.driverVersion, 'Native driver version', 1, 40);
  if (driverCode !== profile.driver.code || driverVersion !== profile.driver.version) throw new Error('Native driver identity does not match the approved device profile.');
  if (record.requestedBy === actorId) throw new Error('Native device acknowledgement requires an independent operator.');
  const attestation = verifyNativeDeviceAttestation(record, profile, { ...input, driverCode, driverVersion }, now);
  const result = input.result === 'acknowledged' ? 'acknowledged' : 'failed';
  const failureReason = input.result === 'unsupported'
    ? `Native driver unsupported: ${clean(input.errorMessage ?? '', 'Native driver reason', 4, 500)}`
    : input.errorMessage?.trim();
  return recordDeviceTransport(
    state,
    { id: input.id, result, responseReference: input.responseReference, responseProtocol: input.responseProtocol, responseChecksum: input.responseChecksum, responseByteLength: input.responseByteLength, expectedVersion: input.expectedVersion },
    actorId,
    'native-driver-attestation',
    now,
    { nativeDriverStatus: input.result, nativeDriverCode: driverCode, nativeDriverVersion: driverVersion, ...attestation },
    failureReason,
  );
}

export function retryRetailDeviceTransport(state: RevenueOpsState, input: RetryRetailDeviceTransportInput, actorId: string, now = new Date().toISOString(), id: string = randomUUID()): RevenueOpsState {
  const record = state.retailDeviceTransportEvidence.find((candidate) => candidate.id === input.id && sameScope(state, candidate));
  if (!record || record.status !== 'failed' || record.version !== input.expectedVersion) throw new Error('Only a current failed device command can be retried.');
  if (record.acknowledgedBy === actorId) throw new Error('The operator who recorded the device failure cannot requeue the same command.');
  const reason = clean(input.reason, 'Retry reason', 8, 500);
  const payload = clean(input.payload, 'Device payload', 1, 20_000);
  const profile = currentProfileForTransport(state, record.profileId, record.kind, record.deviceCode, record.connection);
  if (state.retailDeviceTransportEvidence.some((candidate) => candidate.deviceCode === record.deviceCode && candidate.status === 'prepared' && sameScope(state, candidate))) throw new Error('This device already has a prepared transport command. Acknowledge or fail it before retrying.');
  const next = structuredClone(state);
  next.revision += 1;
  next.retailDeviceTransportEvidence.unshift({ id, kind: record.kind, deviceCode: record.deviceCode, connection: record.connection, command: record.command, profileId: profile?.id, profileVersion: profile?.version, payloadChecksum: checksum(payload), payloadByteLength: Buffer.byteLength(payload, 'utf8'), status: 'prepared', requestedBy: actorId, requestedAt: now, retryOfId: record.id, retryReason: reason, scope: structuredClone(next.scope), version: 1 });
  return next;
}
