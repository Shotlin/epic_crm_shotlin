import { browserChecksum } from '../shared/browser-checksum';

export interface ConsolidationMapping { parentCompanyId: string; childCompanyId: string; ownershipPercent: number; functionalCurrency: string; translationRate: number; active: boolean; }
export interface EliminationRule { id: string; description: string; debitAccountCode: string; creditAccountCode: string; amount: number; evidenceReference: string; }
export interface ConsolidationControlResult { parentCompanyId: string; childCount: number; translatedChildTotal: number; eliminationTotal: number; consolidatedTotal: number; blockedMappings: string[]; checksum: string; }

function round(value: number): number { return Math.round(value * 100) / 100; }

export function validateConsolidationMappings(mappings: ConsolidationMapping[]): void {
  const seen = new Set<string>();
  for (const mapping of mappings) {
    if (!mapping.active) continue;
    if (mapping.parentCompanyId === mapping.childCompanyId) throw new Error('A consolidation entity cannot consolidate itself.');
    if (mapping.ownershipPercent <= 0 || mapping.ownershipPercent > 100) throw new Error('Ownership percentage must be between 0 and 100.');
    if (mapping.translationRate <= 0) throw new Error('Consolidation translation rate must be positive.');
    const key = `${mapping.parentCompanyId}/${mapping.childCompanyId}`; if (seen.has(key)) throw new Error(`Duplicate consolidation mapping ${key}.`); seen.add(key);
  }
}

export function buildConsolidationControl(input: { parentCompanyId: string; parentBalance: number; mappings: Array<ConsolidationMapping & { childBalance: number }>; eliminations: EliminationRule[] }): ConsolidationControlResult {
  validateConsolidationMappings(input.mappings);
  const blockedMappings = input.mappings.filter((mapping) => mapping.active && (!mapping.functionalCurrency || mapping.translationRate <= 0)).map(({ childCompanyId }) => childCompanyId);
  const translatedChildTotal = round(input.mappings.filter(({ active }) => active).reduce((sum, mapping) => sum + mapping.childBalance * mapping.translationRate * mapping.ownershipPercent / 100, 0));
  const eliminationTotal = round(input.eliminations.reduce((sum, rule) => { if (!rule.evidenceReference.trim() || rule.amount < 0 || !rule.debitAccountCode || !rule.creditAccountCode) throw new Error('Elimination evidence, accounts, and amount are required.'); return sum + rule.amount; }, 0));
  const consolidatedTotal = round(input.parentBalance + translatedChildTotal - eliminationTotal);
  const checksum = browserChecksum(JSON.stringify({ parentCompanyId: input.parentCompanyId, parentBalance: input.parentBalance, mappings: input.mappings, eliminations: input.eliminations, consolidatedTotal }));
  return { parentCompanyId: input.parentCompanyId, childCount: input.mappings.filter(({ active }) => active).length, translatedChildTotal, eliminationTotal, consolidatedTotal, blockedMappings, checksum };
}
