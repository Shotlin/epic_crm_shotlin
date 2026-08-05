/**
 * Browser-safe ESC/POS label payload compiler.
 *
 * The compiler deliberately stops at a deterministic byte payload.  Sending
 * those bytes over USB, Bluetooth, or TCP is a device-adapter concern and is
 * never claimed by this module.  The resulting payload can therefore be
 * checksummed, reviewed, replayed, and certified against a real printer later.
 */

export type RetailEscPosTemplate = 'shelf' | 'barcode' | 'price-tag';

export interface RetailEscPosLabelInput {
  template: RetailEscPosTemplate;
  sku: string;
  name: string;
  barcode: string;
  quantity: number;
}

export interface RetailEscPosPayload {
  protocol: 'escpos-thermal-v1';
  bytes: number[];
  base64: string;
  byteLength: number;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function cleanText(value: string, label: string, max = 96): string {
  const normalized = value.trim().replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ');
  if (!normalized || normalized.length > max) throw new Error(`${label} must contain 1-${max} printable characters.`);
  return normalized;
}

function printableBarcode(value: string): string {
  const barcode = value.trim();
  if (!/^[\x20-\x7e]{1,64}$/.test(barcode)) throw new Error('Retail ESC/POS barcode must contain 1-64 printable characters.');
  return barcode;
}

function base64(bytes: number[]): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Build a Code 128 ESC/POS label payload with deterministic template text. */
export function buildRetailEscPosLabelPayload(input: RetailEscPosLabelInput): RetailEscPosPayload {
  if (!['shelf', 'barcode', 'price-tag'].includes(input.template)) throw new Error('Retail ESC/POS template is invalid.');
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 1_000_000) throw new Error('Retail ESC/POS quantity must be a positive integer.');
  const sku = cleanText(input.sku, 'Retail ESC/POS SKU');
  const name = cleanText(input.name, 'Retail ESC/POS item name');
  const barcode = printableBarcode(input.barcode);
  const encoder = new TextEncoder();
  const text = (value: string) => [...encoder.encode(`${value}\n`)];
  const command = (...values: number[]) => values;
  const bytes: number[] = [
    ESC, 0x40, // initialize
    ESC, 0x61, 0x01, // center
    ...text(input.template === 'price-tag' ? 'PRICE TAG' : input.template === 'shelf' ? 'SHELF LABEL' : 'BARCODE LABEL'),
    ESC, 0x61, 0x00, // left
    ...text(name),
    ...text(`SKU: ${sku}`),
  ];
  if (input.template === 'price-tag') bytes.push(...text(`QTY: ${input.quantity}`));
  bytes.push(
    GS, 0x48, 0x02, // HRI below barcode
    GS, 0x68, 0x50, // barcode height
    GS, 0x77, 0x02, // barcode width
    GS, 0x6b, 0x49, barcode.length, ...encoder.encode(barcode), LF,
    ...text(`PRINT QTY: ${input.quantity}`),
    ...command(ESC, 0x64, 0x03), // feed three lines
    GS, 0x56, 0x42, 0x00, // partial cut; adapters may reject if unsupported
  );
  return { protocol: 'escpos-thermal-v1', bytes, base64: base64(bytes), byteLength: bytes.length };
}
