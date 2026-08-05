import { describe, expect, it } from 'vitest';
import {
  createRetailDeviceAdapterProfileIpcSchema,
  prepareRetailDeviceTransportIpcSchema,
} from './retail-device-profile-ipc-schemas';

describe('retail device adapter IPC schemas', () => {
  it('preserves an approved-profile binding on a prepared hardware command', () => {
    const prepared = prepareRetailDeviceTransportIpcSchema.parse({
      profileId: 'profile-scale-01',
      kind: 'weighing-scale',
      deviceCode: 'SCALE-01',
      connection: 'network',
      command: 'read-weight',
      payload: 'READ_WEIGHT',
    });

    expect(prepared.profileId).toBe('profile-scale-01');
  });

  it('rejects a network command unless the renderer names its approved device profile', () => {
    const prepared = prepareRetailDeviceTransportIpcSchema.safeParse({
      kind: 'escpos-printer',
      deviceCode: 'PRINTER-01',
      connection: 'network',
      command: 'print',
      payload: 'RECEIPT',
    });

    expect(prepared.success).toBe(false);
  });

  it('rejects a profile configuration that does not match its selected transport', () => {
    const parsed = createRetailDeviceAdapterProfileIpcSchema.safeParse({
      code: 'SCALE-NETWORK-01',
      name: 'Counter scale',
      kind: 'weighing-scale',
      deviceCode: 'SCALE-01',
      connection: 'network',
      driver: {
        code: 'SCALE-TCP',
        version: '1.0.0',
        boundary: 'network-tcp-boundary',
      },
      capabilities: ['weight-read'],
      configuration: {
        connection: 'usb',
        vendorId: '1A2B',
        productId: '3C4D',
      },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects unexpected renderer fields instead of passing them into the device registry', () => {
    const parsed = prepareRetailDeviceTransportIpcSchema.safeParse({
      kind: 'escpos-printer',
      deviceCode: 'PRINTER-01',
      connection: 'network',
      command: 'print',
      payload: 'RECEIPT',
      rawNativeHandle: 'do-not-forward',
    });

    expect(parsed.success).toBe(false);
  });
});
