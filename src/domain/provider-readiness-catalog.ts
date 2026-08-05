export type ProviderReadinessState = 'adapter-ready' | 'sandbox-needed' | 'production-gate';

export interface ProviderReadinessEntry {
  id: string;
  category: string;
  label: string;
  capabilities: readonly string[];
  state: ProviderReadinessState;
  evidence: readonly string[];
  ownerWorkspace: 'finance' | 'people' | 'service' | 'intelligence';
}

export const PROVIDER_READINESS_CATALOG: readonly ProviderReadinessEntry[] = [
  { id: 'gsp-irp', category: 'Statutory', label: 'GSP / IRP', capabilities: ['e-invoice', 'e-way bill', 'GSTR reconciliation'], state: 'production-gate', evidence: ['sandbox credentials', 'sample IRN', 'signed conformance pack'], ownerWorkspace: 'finance' },
  { id: 'banking', category: 'Treasury', label: 'Banking partner', capabilities: ['statement pull', 'payment initiation', 'webhook verification'], state: 'sandbox-needed', evidence: ['approved merchant account', 'sandbox statement', 'reconciliation evidence'], ownerWorkspace: 'finance' },
  { id: 'payroll', category: 'People', label: 'Payroll provider', capabilities: ['salary disbursement', 'TDS filing', 'payslip delivery'], state: 'sandbox-needed', evidence: ['test employee', 'payroll run proof', 'provider approval'], ownerWorkspace: 'people' },
  { id: 'messaging', category: 'Engagement', label: 'Messaging provider', capabilities: ['email', 'SMS', 'WhatsApp templates'], state: 'adapter-ready', evidence: ['template approval', 'delivery callback', 'opt-out proof'], ownerWorkspace: 'intelligence' },
  { id: 'logistics', category: 'Fulfilment', label: 'Logistics partner', capabilities: ['rate quote', 'label generation', 'tracking events'], state: 'sandbox-needed', evidence: ['sandbox shipment', 'tracking callback', 'delivery proof'], ownerWorkspace: 'service' },
  { id: 'marketplaces', category: 'Commerce', label: 'Marketplace adapters', capabilities: ['catalog sync', 'order import', 'settlement reconciliation'], state: 'production-gate', evidence: ['seller credentials', 'order replay', 'settlement match'], ownerWorkspace: 'intelligence' },
];

export function summarizeProviderReadiness(entries: readonly ProviderReadinessEntry[] = PROVIDER_READINESS_CATALOG): { total: number; adapterReady: number; sandboxNeeded: number; productionGate: number; capabilities: number } {
  return {
    total: entries.length,
    adapterReady: entries.filter(({ state }) => state === 'adapter-ready').length,
    sandboxNeeded: entries.filter(({ state }) => state === 'sandbox-needed').length,
    productionGate: entries.filter(({ state }) => state === 'production-gate').length,
    capabilities: entries.reduce((count, entry) => count + entry.capabilities.length, 0),
  };
}
