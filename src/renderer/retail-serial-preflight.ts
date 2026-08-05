import type { RetailDeviceTransportPreflightResult, RetailPhysicalDeviceKind } from '../shared/retail-device-transport-contracts';

const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_READ_TIMEOUT_MS = 2_000;

interface SerialPortInfoLike {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialWriterLike {
  write(data: Uint8Array): Promise<void>;
  releaseLock(): void;
}

interface SerialReaderLike {
  read(): Promise<{ value?: Uint8Array; done: boolean }>;
  cancel(): Promise<void>;
  releaseLock(): void;
}

export interface RetailSerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo?: () => SerialPortInfoLike;
  writable?: { getWriter(): SerialWriterLike };
  readable?: { getReader(): SerialReaderLike };
}

export interface RetailSerialNavigatorLike {
  serial?: { requestPort(): Promise<RetailSerialPortLike> };
}

function digest(bytes: Uint8Array): Promise<string> {
  return crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource).then((hash) => Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join(''));
}

function unsupported(kind: RetailPhysicalDeviceKind, message: string): RetailDeviceTransportPreflightResult {
  return { kind, connection: 'usb', status: 'unsupported', responseReference: 'driver-required:web-serial', responseChecksum: '0'.repeat(64), responseByteLength: 0, elapsedMs: 0, errorMessage: message };
}

/**
 * Runs a user-initiated Web Serial diagnostic. It intentionally does not
 * identify the device as certified: it only proves that the selected serial
 * port opened and accepted a bounded test payload.
 */
export async function runRetailSerialPreflight(
  navigatorLike: RetailSerialNavigatorLike,
  kind: RetailPhysicalDeviceKind,
  payload: string,
  baudRate: number,
  readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
): Promise<RetailDeviceTransportPreflightResult> {
  const startedAt = Date.now();
  const encoded = new TextEncoder().encode(payload);
  if (!encoded.length || encoded.byteLength > MAX_PAYLOAD_BYTES) throw new Error(`Serial preflight payload must contain 1-${MAX_PAYLOAD_BYTES} bytes.`);
  if (!Number.isInteger(baudRate) || baudRate < 300 || baudRate > 4_000_000) throw new Error('Serial baud rate must be an integer from 300 to 4000000.');
  if (!Number.isInteger(readTimeoutMs) || readTimeoutMs < 250 || readTimeoutMs > 15_000) throw new Error('Serial read timeout must be between 250 and 15000 milliseconds.');
  if (!navigatorLike.serial) return unsupported(kind, 'This Epic BOS build has no Web Serial support. Install a store-approved native driver or use a network device adapter.');

  let port: RetailSerialPortLike;
  try {
    port = await navigatorLike.serial.requestPort();
  } catch (error) {
    return { kind, connection: 'usb', status: 'failed', responseReference: 'serial://request-cancelled', responseChecksum: '0'.repeat(64), responseByteLength: 0, elapsedMs: Date.now() - startedAt, errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Serial port selection was cancelled.' };
  }

  const info = port.getInfo?.() ?? {};
  const reference = `serial://usb/${info.usbVendorId?.toString(16) ?? 'unknown'}:${info.usbProductId?.toString(16) ?? 'unknown'}`;
  let writer: SerialWriterLike | undefined;
  let reader: SerialReaderLike | undefined;
  try {
    await port.open({ baudRate });
    if (!port.writable) throw new Error('Selected serial port is not writable.');
    writer = port.writable.getWriter();
    await writer.write(encoded);
    writer.releaseLock();
    writer = undefined;

    const chunks: Uint8Array[] = [];
    let responseByteLength = 0;
    if (port.readable) {
      reader = port.readable.getReader();
      const read = await Promise.race([
        reader.read(),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), readTimeoutMs)),
      ]);
      if (read && !read.done && read.value) {
        const bounded = read.value.subarray(0, MAX_RESPONSE_BYTES);
        chunks.push(bounded);
        responseByteLength = bounded.byteLength;
      }
      if (read === null) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      reader = undefined;
    }
    const response = new Uint8Array(responseByteLength);
    let offset = 0;
    for (const chunk of chunks) { response.set(chunk, offset); offset += chunk.byteLength; }
    return { kind, connection: 'usb', status: 'reachable', responseReference: reference, responseChecksum: await digest(response), responseByteLength, elapsedMs: Date.now() - startedAt };
  } catch (error) {
    return { kind, connection: 'usb', status: 'failed', responseReference: reference, responseChecksum: '0'.repeat(64), responseByteLength: 0, elapsedMs: Date.now() - startedAt, errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Serial preflight failed.' };
  } finally {
    try { reader?.releaseLock(); } catch { /* already released */ }
    try { writer?.releaseLock(); } catch { /* already released */ }
    await port.close().catch(() => undefined);
  }
}

/**
 * Executes one prepared USB command through the user-authorized Web Serial
 * boundary. This intentionally reuses the bounded diagnostic exchange: the
 * renderer never receives an unbounded byte stream and the result remains
 * operator evidence until the normal independent-review workflow accepts it.
 */
export async function runRetailSerialTransport(
  navigatorLike: RetailSerialNavigatorLike,
  kind: RetailPhysicalDeviceKind,
  payload: string,
  baudRate: number,
  readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
): Promise<RetailDeviceTransportPreflightResult> {
  const result = await runRetailSerialPreflight(navigatorLike, kind, payload, baudRate, readTimeoutMs);
  if (result.status === 'reachable' && result.responseByteLength === 0) {
    return {
      ...result,
      status: 'failed',
      errorMessage: 'USB command was written, but the device returned no response bytes. Record a failure or retry after checking the device.'
    };
  }
  if (result.status === 'reachable') {
    return {
      ...result,
      responseReference: `${result.responseReference}/command`,
    };
  }
  return result;
}
