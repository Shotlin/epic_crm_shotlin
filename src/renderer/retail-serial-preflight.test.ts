import { describe, expect, it } from 'vitest';
import { runRetailSerialPreflight, runRetailSerialTransport, type RetailSerialPortLike } from './retail-serial-preflight';

function port(response?: Uint8Array): RetailSerialPortLike & { opened: boolean; closed: boolean; written?: Uint8Array } {
  const result = {
    opened: false,
    closed: false,
    written: undefined as Uint8Array | undefined,
    getInfo: () => ({ usbVendorId: 0x1234, usbProductId: 0x5678 }),
    open: async () => { result.opened = true; },
    close: async () => { result.closed = true; },
    writable: { getWriter: () => ({ write: async (data: Uint8Array) => { result.written = data; }, releaseLock: () => undefined }) },
    readable: response ? { getReader: () => ({ read: async () => ({ value: response, done: false }), cancel: async () => undefined, releaseLock: () => undefined }) } : undefined,
  };
  return result;
}

describe('retail Web Serial preflight', () => {
  it('reports unsupported when Chromium has no Web Serial capability', async () => {
    await expect(runRetailSerialPreflight({}, 'barcode-scanner', 'PING', 9_600)).resolves.toMatchObject({ status: 'unsupported', responseReference: 'driver-required:web-serial' });
  });

  it('opens the selected port, writes a bounded payload, and returns diagnostic evidence', async () => {
    const selected = port(new TextEncoder().encode('PONG'));
    const result = await runRetailSerialPreflight({ serial: { requestPort: async () => selected } }, 'escpos-printer', 'PING', 9_600);
    expect(result).toMatchObject({ connection: 'usb', status: 'reachable', responseReference: 'serial://usb/1234:5678', responseByteLength: 4 });
    expect(selected.opened).toBe(true);
    expect(selected.closed).toBe(true);
    expect(new TextDecoder().decode(selected.written)).toBe('PING');
    expect(result.responseChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps a cancelled picker as failed evidence without pretending a device exists', async () => {
    const result = await runRetailSerialPreflight({ serial: { requestPort: async () => { throw new Error('cancelled'); } } }, 'weighing-scale', 'READ', 9_600);
    expect(result).toMatchObject({ status: 'failed', responseReference: 'serial://request-cancelled', errorMessage: 'cancelled' });
  });

  it('executes a bounded USB command only when the device returns response bytes', async () => {
    const selected = port(new TextEncoder().encode('ACK'));
    const result = await runRetailSerialTransport({ serial: { requestPort: async () => selected } }, 'escpos-printer', 'PRINT', 9_600);
    expect(result).toMatchObject({ status: 'reachable', responseReference: 'serial://usb/1234:5678/command', responseByteLength: 3 });
    expect(new TextDecoder().decode(selected.written)).toBe('PRINT');
  });

  it('does not turn a write with no response into a false USB acknowledgement', async () => {
    const selected = port();
    const result = await runRetailSerialTransport({ serial: { requestPort: async () => selected } }, 'cash-drawer', 'OPEN', 9_600);
    expect(result).toMatchObject({ status: 'failed', responseReference: 'serial://usb/1234:5678', responseByteLength: 0 });
    expect(result.errorMessage).toMatch(/no response bytes/i);
  });
});
