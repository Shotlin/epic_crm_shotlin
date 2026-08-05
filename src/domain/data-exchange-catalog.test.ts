import { describe, expect, it } from 'vitest';
import { DATA_EXCHANGE_CATALOG, summarizeDataExchangeCatalog } from './data-exchange-catalog';

describe('data exchange catalog', () => {
  it('covers the major import/export families', () => {
    expect(DATA_EXCHANGE_CATALOG.map(({ resource }) => resource)).toEqual(expect.arrayContaining(['party', 'lead', 'product', 'journal', 'inventory', 'employee']));
  });

  it('separates ready, skeleton, and provider-gated packs', () => {
    const summary = summarizeDataExchangeCatalog();
    expect(summary.total).toBeGreaterThan(6);
    expect(summary.columns).toBeGreaterThan(summary.total);
    expect(summary.externalGate).toBe(1);
  });
});
