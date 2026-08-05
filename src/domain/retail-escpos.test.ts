import { describe, expect, it } from 'vitest';
import { buildRetailEscPosLabelPayload } from './retail-escpos';

describe('retail ESC/POS payload compiler', () => {
  it('builds deterministic Code 128 payloads for each retail template', () => {
    const input = { template: 'barcode' as const, sku: 'RICE-5KG-REG', name: 'Basmati rice 5 kg', barcode: '890100000001', quantity: 10 };
    const first = buildRetailEscPosLabelPayload(input);
    const second = buildRetailEscPosLabelPayload(input);
    expect(first).toEqual(second);
    expect(first.protocol).toBe('escpos-thermal-v1');
    expect(first.bytes.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x61, 0x01]);
    expect(first.bytes).toContain(0x49);
    expect(first.byteLength).toBe(first.bytes.length);
    expect(first.base64.length).toBeGreaterThan(20);
  });

  it('fails closed for invalid identity or quantity instead of producing unsafe bytes', () => {
    expect(() => buildRetailEscPosLabelPayload({ template: 'shelf', sku: 'SKU', name: 'Rice', barcode: 'bad\nbarcode', quantity: 1 })).toThrow('barcode');
    expect(() => buildRetailEscPosLabelPayload({ template: 'shelf', sku: 'SKU', name: 'Rice', barcode: '123', quantity: 0 })).toThrow('quantity');
    expect(() => buildRetailEscPosLabelPayload({ template: 'shelf', sku: 'SKU', name: 'Rice', barcode: '123', quantity: 1.2 })).toThrow('quantity');
  });
});
