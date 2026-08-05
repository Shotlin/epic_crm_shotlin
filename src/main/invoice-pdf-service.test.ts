import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {},
  dialog: {},
}));

import { invoiceSourceLabel } from './invoice-pdf-service';

describe('invoice PDF source copy', () => {
  it('keeps Indian statutory exports free from mojibake separators', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/main/invoice-pdf-service.ts'), 'utf8');

    expect(source).toContain(' \u00B7 ');
    expect(source).toContain(' \u00D7 ');
    for (const mojibake of [
      '\u00C2\u00B7',
      '\u00C3\u0097',
      '\u00C3\u0082\u00C2\u00B7',
      '\u00E2\u0080\u00A6',
      '\u00E2\u0080\u0094',
      '\u00E2\u0086\u0092',
    ]) {
      expect(source).not.toContain(mojibake);
    }
  });

  it('identifies an in-person retail invoice from its retail-sale evidence, never as a sales order', () => {
    const label = invoiceSourceLabel({
      sourceKind: 'retail-sale',
      retailSaleId: 'retail-sale-0001',
      salesOrderId: undefined,
    });

    expect(label).toBe('Retail counter sale retail-sale-0001');
    expect(label).not.toMatch(/sales order/i);
  });

  it('keeps the established sales-order source wording for legacy invoices', () => {
    expect(invoiceSourceLabel({ sourceKind: 'sales-order', salesOrderId: 'sales-order-0001', retailSaleId: undefined })).toBe('Source order sales-order-0001');
  });

  it('uses retail-sale evidence even when a migrated invoice predates sourceKind', () => {
    expect(invoiceSourceLabel({ sourceKind: undefined, salesOrderId: undefined, retailSaleId: 'retail-sale-legacy-0001' })).toBe('Retail counter sale retail-sale-legacy-0001');
  });

  it('renders only the configured masked primary bank master on payment instructions', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/main/invoice-pdf-service.ts'), 'utf8');
    expect(source).toContain('Payment instructions');
    expect(source).toContain('bankAccount.maskedAccountNumber');
    expect(source).not.toContain('accountNumber');
  });
});
