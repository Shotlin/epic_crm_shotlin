import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { preflightRetailDeviceTransport } from './retail-device-preflight';

const servers: net.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('retail device connectivity preflight', () => {
  it('reports a bounded TCP device response without claiming certification', async () => {
    const server = net.createServer((socket) => {
      socket.on('data', (payload) => {
        expect(payload.toString('utf8')).toBe('PING');
        socket.end('ACK');
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test device did not bind to a TCP port.');

    const result = await preflightRetailDeviceTransport({ kind: 'escpos-printer', connection: 'network', host: '127.0.0.1', port: address.port, payload: 'PING' });
    expect(result).toMatchObject({ status: 'reachable', responseByteLength: 3, responseReference: `tcp://127.0.0.1:${address.port}` });
    expect(result.responseChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps USB, Bluetooth, and manual connections explicitly driver-gated', async () => {
    await expect(preflightRetailDeviceTransport({ kind: 'barcode-scanner', connection: 'usb', payload: 'SCAN' })).resolves.toMatchObject({ status: 'unsupported', responseReference: 'driver-required:usb' });
  });

  it('returns a failed result for an unreachable network device', async () => {
    const result = await preflightRetailDeviceTransport({ kind: 'weighing-scale', connection: 'network', host: '127.0.0.1', port: 65_534, payload: 'READ', timeoutMs: 500 });
    expect(result).toMatchObject({ status: 'failed', responseByteLength: 0 });
    expect(result.errorMessage).toEqual(expect.any(String));
  });
});
