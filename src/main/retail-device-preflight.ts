import { createHash } from 'node:crypto';
import net from 'node:net';
import type {
  PreflightRetailDeviceTransportInput,
  RetailDeviceTransportPreflightResult,
} from '../shared/retail-device-transport-contracts';

const digest = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;

function cleanHost(value: string | undefined): string | undefined {
  const host = value?.trim();
  if (!host || host.length > 253 || /[\s/\\:@]/.test(host)) throw new Error('Device host must be a hostname or IP address without a path or credentials.');
  return host;
}

function cleanPort(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 65_535) throw new Error('Device port must be an integer from 1 to 65535.');
  return value;
}

function cleanTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeout) || timeout < 250 || timeout > 15_000) throw new Error('Device preflight timeout must be between 250 and 15000 milliseconds.');
  return timeout;
}

function failedResult(input: PreflightRetailDeviceTransportInput, elapsedMs: number, errorMessage: string, host?: string, port?: number): RetailDeviceTransportPreflightResult {
  return {
    kind: input.kind,
    connection: input.connection,
    status: 'failed',
    host,
    port,
    responseReference: `tcp://${host ?? 'unknown'}:${port ?? 'unknown'}`,
    responseChecksum: digest(''),
    responseByteLength: 0,
    elapsedMs,
    errorMessage: errorMessage.slice(0, 500),
  };
}

/**
 * Checks a store device without turning connectivity into certification.
 * Network devices use a short-lived TCP socket; USB/Bluetooth/manual devices
 * intentionally remain an explicit driver/evidence boundary until a native
 * transport is selected and installed for the target store.
 */
export async function preflightRetailDeviceTransport(input: PreflightRetailDeviceTransportInput): Promise<RetailDeviceTransportPreflightResult> {
  const payload = Buffer.from(input.payload ?? '', 'utf8');
  if (!payload.length || payload.length > MAX_PAYLOAD_BYTES) throw new Error(`Device preflight payload must contain 1-${MAX_PAYLOAD_BYTES} bytes.`);
  const startedAt = Date.now();
  if (input.connection !== 'network') {
    return {
      kind: input.kind,
      connection: input.connection,
      status: 'unsupported',
      responseReference: `driver-required:${input.connection}`,
      responseChecksum: digest(''),
      responseByteLength: 0,
      elapsedMs: Date.now() - startedAt,
      errorMessage: 'This connection needs a store-approved native driver. No hardware success was inferred.',
    };
  }
  const host = cleanHost(input.host);
  const port = cleanPort(input.port);
  if (!host || port === undefined) throw new Error('Network device preflight requires a host and port.');
  const timeoutMs = cleanTimeout(input.timeoutMs);
  return await new Promise<RetailDeviceTransportPreflightResult>((resolve) => {
    const chunks: Buffer[] = [];
    let responseBytes = 0;
    let connected = false;
    let settled = false;
    const socket = net.createConnection({ host, port });
    const finish = (result: RetailDeviceTransportPreflightResult): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish(connected
      ? {
          kind: input.kind,
          connection: input.connection,
          status: 'reachable',
          host,
          port,
          responseReference: `tcp://${host}:${port}`,
          responseChecksum: digest(Buffer.concat(chunks)),
          responseByteLength: responseBytes,
          elapsedMs: Date.now() - startedAt,
        }
      : failedResult(input, Date.now() - startedAt, 'Device connection timed out.', host, port)), timeoutMs);
    socket.once('connect', () => {
      connected = true;
      socket.write(payload, (error) => {
        if (error) finish(failedResult(input, Date.now() - startedAt, error.message, host, port));
        else socket.end();
      });
    });
    socket.on('data', (chunk: Buffer) => {
      if (responseBytes >= MAX_RESPONSE_BYTES) return;
      const remaining = MAX_RESPONSE_BYTES - responseBytes;
      const bounded = chunk.subarray(0, remaining);
      chunks.push(bounded);
      responseBytes += bounded.length;
    });
    socket.once('end', () => finish({
      kind: input.kind,
      connection: input.connection,
      status: 'reachable',
      host,
      port,
      responseReference: `tcp://${host}:${port}`,
      responseChecksum: digest(Buffer.concat(chunks)),
      responseByteLength: responseBytes,
      elapsedMs: Date.now() - startedAt,
    }));
    socket.once('error', (error) => finish(failedResult(input, Date.now() - startedAt, error.message, host, port)));
    socket.once('close', () => clearTimeout(timer));
  });
}
