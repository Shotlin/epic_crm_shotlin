import { describe, expect, it } from 'vitest';
import { runRetailBluetoothPreflight, runRetailBluetoothTransport, type RetailBluetoothDeviceLike } from './retail-bluetooth-preflight';

function device(response?: Uint8Array): RetailBluetoothDeviceLike & { connected: boolean; disconnected: boolean; written?: Uint8Array } {
  const result = {
    id: 'store-printer-01',
    connected: false,
    disconnected: false,
    written: undefined as Uint8Array | undefined,
    gatt: {
      connect: async () => {
        result.connected = true;
        return {
          getPrimaryService: async () => ({
            getCharacteristic: async () => ({
              writeValueWithResponse: async (value: Uint8Array) => { result.written = value; },
              readValue: response ? async () => response : undefined,
            }),
          }),
        };
      },
      disconnect: () => { result.disconnected = true; },
    },
  };
  return result;
}

describe('retail Web Bluetooth preflight', () => {
  it('reports unsupported when the runtime has no Web Bluetooth capability', async () => {
    await expect(runRetailBluetoothPreflight({}, 'barcode-scanner', 'PING', '18f0', '2af1')).resolves.toMatchObject({ status: 'unsupported', responseReference: 'driver-required:web-bluetooth' });
  });

  it('selects one device, writes the bounded payload, reads a response, and disconnects', async () => {
    const selected = device(new TextEncoder().encode('PONG'));
    const result = await runRetailBluetoothPreflight({ bluetooth: { requestDevice: async (options) => {
      expect(options.filters[0]?.services).toEqual(['18f0']);
      return selected;
    } } }, 'escpos-printer', 'PING', '18F0', '2AF1');
    expect(result).toMatchObject({ connection: 'bluetooth', status: 'reachable', responseReference: 'bluetooth://store-printer-01/18f0/2af1', responseByteLength: 4 });
    expect(selected.connected).toBe(true);
    expect(selected.disconnected).toBe(true);
    expect(new TextDecoder().decode(selected.written)).toBe('PING');
    expect(result.responseChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not turn a write without response bytes into a Bluetooth acknowledgement', async () => {
    const selected = device();
    const result = await runRetailBluetoothTransport({ bluetooth: { requestDevice: async () => selected } }, 'cash-drawer', 'OPEN', '1812', '2af1');
    expect(result).toMatchObject({ status: 'failed', responseByteLength: 0 });
    expect(result.errorMessage).toMatch(/no response/i);
    expect(selected.disconnected).toBe(true);
  });

  it('keeps a cancelled picker as failed evidence', async () => {
    const result = await runRetailBluetoothPreflight({ bluetooth: { requestDevice: async () => { throw new Error('cancelled'); } } }, 'weighing-scale', 'READ', '1812', '2af1');
    expect(result).toMatchObject({ status: 'failed', responseReference: 'bluetooth://request-cancelled', errorMessage: 'cancelled' });
  });
});
