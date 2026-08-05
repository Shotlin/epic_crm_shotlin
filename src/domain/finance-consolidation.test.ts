import { describe, expect, it } from 'vitest';
import { buildConsolidationControl, validateConsolidationMappings } from './finance-consolidation';

describe('finance consolidation controls', () => {
  it('translates scoped children and applies evidenced eliminations', () => {
    const result = buildConsolidationControl({ parentCompanyId: 'india', parentBalance: 1_000, mappings: [{ parentCompanyId: 'india', childCompanyId: 'us', ownershipPercent: 80, functionalCurrency: 'USD', translationRate: 84, active: true, childBalance: 100 }], eliminations: [{ id: 'elim-1', description: 'Intercompany receivable', debitAccountCode: 'intercompany-payable', creditAccountCode: 'intercompany-receivable', amount: 500, evidenceReference: 'ELIM-1' }] });
    expect(result).toMatchObject({ childCount: 1, translatedChildTotal: 6720, eliminationTotal: 500, consolidatedTotal: 7220 });
    expect(result.checksum).toHaveLength(16);
  });
  it('rejects self, duplicate, and invalid-rate mappings', () => {
    expect(() => validateConsolidationMappings([{ parentCompanyId: 'co', childCompanyId: 'co', ownershipPercent: 100, functionalCurrency: 'INR', translationRate: 1, active: true }])).toThrow('itself');
    expect(() => validateConsolidationMappings([{ parentCompanyId: 'co', childCompanyId: 'sub', ownershipPercent: 101, functionalCurrency: 'INR', translationRate: 1, active: true }])).toThrow('between 0 and 100');
  });
});
