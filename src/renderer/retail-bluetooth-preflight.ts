const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_READ_TIMEOUT_MS = 2_000;

export type RetailBluetoothPreflightStatus = 'reachable' | 'unsupported' | 'failed';

export interface RetailBluetoothCharacteristicLike {
  writeValueWithResponse?: (value: Uint8Array) => Promise<void>;
  writeValue?: (value: Uint8Array) => Promise<void>;
  readValue?: () => Promise<DataView | ArrayBuffer | Uint8Array>;
}

export interface RetailBluetoothServiceLike {
  getCharacteristic: (uuid: string) => Promise<RetailBluetoothCharacteristicLike>;
}

export interface RetailBluetoothServerLike {
  getPrimaryService: (uuid: string) => Promise<RetailBluetoothServiceLike>;
}

export interface RetailBluetoothDeviceLike {
  id?: string;
  name?: string;
  gatt?: {
    connect: () => Promise<RetailBluetoothServerLike>;
    disconnect?: () => void;
  };
}

export interface RetailBluetoothNavigatorLike {
  bluetooth?: {
    requestDevice: (options: {
      filters: Array<{ services: string[] }>;
      optionalServices?: string[];
    }) => Promise<RetailBluetoothDeviceLike>;
  };
}

export interface RetailBluetoothPreflightResult {
  connection: 'bluetooth';
  status: RetailBluetoothPreflightStatus;
  elapsedMs: number;
  responseReference: string;
  responseChecksum: string;
  responseByteLength: number;
  errorMessage?: string;
}

export interface RetailBluetoothTransportResult extends RetailBluetoothPreflightResult {
  serviceUuid: string;
  characteristicUuid: string;
}

async function digest(value: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', value as unknown as BufferSource);
  return Array.from(new Uint8Array(hash), (item) => item.toString(16).padStart(2, '0')).join('');
}

function asBytes(value: DataView | ArrayBuffer | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof DataView) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(value);
}

function cleanUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  const short = /^[0-9a-f]{4}$/.test(normalized);
  const full = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized);
  if (!short && !full) throw new Error(`${label} must be a four-character UUID or a standard UUID.`);
  return normalized;
}

function timeoutError(label: string): Error {
  return new Error(`${label} timed out before the Bluetooth device responded.`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(label)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function failedResult(
  startedAt: number,
  responseReference: string,
  serviceUuid: string,
  characteristicUuid: string,
  errorMessage: string,
  status: RetailBluetoothPreflightStatus = 'failed',
): Promise<RetailBluetoothTransportResult> {
  return {
    connection: 'bluetooth',
    status,
    elapsedMs: Math.max(0, Date.now() - startedAt),
    responseReference,
    responseChecksum: await digest(new Uint8Array()),
    responseByteLength: 0,
    serviceUuid,
    characteristicUuid,
    errorMessage,
  };
}

/**
 * Runs a bounded, user-authorized Web Bluetooth diagnostic. It is deliberately
 * not a native driver: the browser picker selects one device, one approved
 * service and one characteristic, then the connection is closed in finally.
 */
export async function runRetailBluetoothPreflight(
  navigatorLike: RetailBluetoothNavigatorLike,
  kind: string,
  payload: string,
  serviceUuidInput: string,
  characteristicUuidInput: string,
  readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
): Promise<RetailBluetoothPreflightResult> {
  const serviceUuid = cleanUuid(serviceUuidInput, 'Bluetooth service UUID');
  const characteristicUuid = cleanUuid(characteristicUuidInput, 'Bluetooth characteristic UUID');
  return runRetailBluetoothTransport(navigatorLike, kind, payload, serviceUuid, characteristicUuid, readTimeoutMs);
}

export async function runRetailBluetoothTransport(
  navigatorLike: RetailBluetoothNavigatorLike,
  kind: string,
  payload: string,
  serviceUuidInput: string,
  characteristicUuidInput: string,
  readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
): Promise<RetailBluetoothTransportResult> {
  const startedAt = Date.now();
  const serviceUuid = cleanUuid(serviceUuidInput, 'Bluetooth service UUID');
  const characteristicUuid = cleanUuid(characteristicUuidInput, 'Bluetooth characteristic UUID');
  const normalizedPayload = payload.trim();
  const payloadBytes = new TextEncoder().encode(normalizedPayload);
  if (!normalizedPayload) return failedResult(startedAt, 'bluetooth://invalid-payload', serviceUuid, characteristicUuid, 'Bluetooth test payload must not be empty.');
  if (payloadBytes.byteLength > MAX_PAYLOAD_BYTES) return failedResult(startedAt, 'bluetooth://payload-too-large', serviceUuid, characteristicUuid, `Bluetooth payload exceeds ${MAX_PAYLOAD_BYTES} bytes.`);
  if (!Number.isFinite(readTimeoutMs) || readTimeoutMs < 250 || readTimeoutMs > 15_000) return failedResult(startedAt, 'bluetooth://invalid-timeout', serviceUuid, characteristicUuid, 'Bluetooth read timeout must be between 250 and 15000 ms.');

  if (!navigatorLike.bluetooth?.requestDevice) {
    return failedResult(startedAt, 'driver-required:web-bluetooth', serviceUuid, characteristicUuid, 'This runtime does not expose Web Bluetooth. A certified native Bluetooth driver is still required.', 'unsupported');
  }

  let device: RetailBluetoothDeviceLike | undefined;
  try {
    device = await navigatorLike.bluetooth.requestDevice({
      filters: [{ services: [serviceUuid] }],
      optionalServices: [serviceUuid],
    });
  } catch (error) {
    return failedResult(startedAt, 'bluetooth://request-cancelled', serviceUuid, characteristicUuid, error instanceof Error ? error.message : 'Bluetooth device selection was cancelled or failed.');
  }

  const deviceReference = (device.id || device.name || 'selected-device').trim().replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'selected-device';
  const responseReference = `bluetooth://${deviceReference}/${serviceUuid}/${characteristicUuid}`;
  if (!device.gatt?.connect) return failedResult(startedAt, responseReference, serviceUuid, characteristicUuid, 'Selected Bluetooth device does not expose a GATT connection.');

  try {
    const server = await withTimeout(device.gatt.connect(), readTimeoutMs, 'Bluetooth connection');
    const service = await withTimeout(server.getPrimaryService(serviceUuid), readTimeoutMs, 'Bluetooth service lookup');
    const characteristic = await withTimeout(service.getCharacteristic(characteristicUuid), readTimeoutMs, 'Bluetooth characteristic lookup');
    const write = characteristic.writeValueWithResponse ?? characteristic.writeValue;
    if (!write) return failedResult(startedAt, responseReference, serviceUuid, characteristicUuid, 'Selected Bluetooth characteristic cannot accept a bounded write.');
    await withTimeout(write.call(characteristic, payloadBytes), readTimeoutMs, 'Bluetooth write');
    if (!characteristic.readValue) return failedResult(startedAt, responseReference, serviceUuid, characteristicUuid, 'The Bluetooth diagnostic requires a readable response characteristic; no response was available.');
    const response = asBytes(await withTimeout(characteristic.readValue(), readTimeoutMs, 'Bluetooth response'));
    if (response.byteLength < 1) return failedResult(startedAt, responseReference, serviceUuid, characteristicUuid, 'Bluetooth device returned no response bytes.');
    if (response.byteLength > MAX_RESPONSE_BYTES) return failedResult(startedAt, responseReference, serviceUuid, characteristicUuid, `Bluetooth response exceeds ${MAX_RESPONSE_BYTES} bytes.`);
    return {
      connection: 'bluetooth',
      status: 'reachable',
      elapsedMs: Math.max(0, Date.now() - startedAt),
      responseReference,
      responseChecksum: await digest(response),
      responseByteLength: response.byteLength,
      serviceUuid,
      characteristicUuid,
    };
  } catch (error) {
    return failedResult(startedAt, responseReference, serviceUuid, characteristicUuid, error instanceof Error ? error.message : 'Bluetooth diagnostic failed.');
  } finally {
    try { device.gatt?.disconnect?.(); } catch { /* best effort disconnect */ }
  }
}
