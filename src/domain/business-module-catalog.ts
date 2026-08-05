export type ModuleDeliveryState = 'live' | 'skeleton' | 'external-gate';

export interface BusinessModuleCatalogEntry {
  id: string;
  phase: string;
  area: string;
  label: string;
  submodules: string[];
  /** Named roadmap areas retained in the catalog but not yet usable in the product. */
  plannedSubmodules?: string[];
  state: ModuleDeliveryState;
  indiaPriority: 'core' | 'high' | 'extended';
  ownerWorkspace: 'command' | 'crm' | 'sales' | 'finance' | 'operations' | 'people' | 'service' | 'intelligence';
}

/** Rapid-skeleton catalog: every planned business area has a named place in the Electron shell. */
export const BUSINESS_MODULE_CATALOG: readonly BusinessModuleCatalogEntry[] = [
  { id: 'kernel', phase: 'Phase 1', area: 'Business kernel', label: 'Companies, branches + governance', submodules: ['users', 'RBAC', 'field permissions', 'approvals', 'workflows', 'audit', 'backup/restore', 'custom fields'], state: 'live', indiaPriority: 'core', ownerWorkspace: 'command' },
  { id: 'crm', phase: 'Phase 2', area: 'CRM + party master', label: 'Customer relationship command', submodules: ['accounts', 'contacts', 'leads', 'opportunities', 'campaigns', 'consent', 'deduplication', 'scoring', 'saved views', 'imports'], state: 'live', indiaPriority: 'core', ownerWorkspace: 'crm' },
  { id: 'sales', phase: 'Phase 3', area: 'Sales + commerce', label: 'Quote-to-cash commercial flow', submodules: ['products', 'variants', 'GST/HSN', 'price lists', 'discounts', 'quotations', 'sales orders', 'POS', 'returns'], plannedSubmodules: ['returns'], state: 'live', indiaPriority: 'core', ownerWorkspace: 'sales' },
  { id: 'finance', phase: 'Phase 3', area: 'Finance + treasury', label: 'Canonical financial control', submodules: ['general ledger', 'AR/AP', 'collections', 'dunning', 'TDS/TCS', 'bank reconciliation', 'cash forecasting', 'fixed assets', 'financial close'], state: 'live', indiaPriority: 'core', ownerWorkspace: 'finance' },
  { id: 'statutory', phase: 'Phase 3', area: 'India statutory', label: 'GST + statutory evidence', submodules: ['e-invoice', 'e-way bill', 'GSTR workpapers', 'GSP/IRP adapters', 'digital signatures', 'portal reconciliation'], state: 'external-gate', indiaPriority: 'core', ownerWorkspace: 'finance' },
  { id: 'inventory', phase: 'Phase 4', area: 'Inventory + warehouse', label: 'Stock truth and fulfilment', submodules: ['UOM', 'variants', 'warehouses', 'zones/bins', 'batches', 'serials', 'putaway', 'picking', 'transfers', 'cycle counts', 'reorder', 'valuation'], state: 'live', indiaPriority: 'core', ownerWorkspace: 'operations' },
  { id: 'procurement', phase: 'Phase 4', area: 'Procurement + supply chain', label: 'Supplier-to-receipt control', submodules: ['suppliers', 'RFQ', 'purchase orders', 'receipts', 'three-way match', 'landed cost', 'supplier portal', 'scorecards'], state: 'live', indiaPriority: 'high', ownerWorkspace: 'operations' },
  { id: 'manufacturing', phase: 'Phase 4', area: 'Manufacturing + quality', label: 'Plan, make, release', submodules: ['BOM', 'MRP/MPS', 'work orders', 'finite scheduling', 'OEE', 'quality inspection', 'CAPA', 'subcontracting'], state: 'live', indiaPriority: 'high', ownerWorkspace: 'operations' },
  { id: 'people', phase: 'Phase 5', area: 'HR + payroll', label: 'People ledger', submodules: ['employees', 'attendance', 'leave', 'expenses', 'loans', 'recruitment', 'salary', 'payroll', 'benefits', 'statutory obligations'], state: 'live', indiaPriority: 'core', ownerWorkspace: 'people' },
  { id: 'service', phase: 'Phase 5', area: 'Projects + service', label: 'Delivery and field execution', submodules: ['projects', 'tasks', 'time', 'billing plans', 'SLA', 'support cases', 'field dispatch', 'fleet', 'maintenance', 'calibration'], state: 'live', indiaPriority: 'high', ownerWorkspace: 'service' },
  { id: 'intelligence', phase: 'Phase 6', area: 'Analytics + AI', label: 'Decision intelligence', submodules: ['semantic metrics', 'report packs', 'saved reports', 'anomaly queue', 'scenarios', 'automation', 'scheduler', 'AI review queues'], state: 'live', indiaPriority: 'extended', ownerWorkspace: 'intelligence' },
  { id: 'ecosystem', phase: 'Phase 6', area: 'Ecosystem + integrations', label: 'Provider and platform fabric', submodules: ['API keys', 'webhooks', 'banking', 'payroll providers', 'messaging', 'logistics', 'marketplaces', 'connector health'], state: 'external-gate', indiaPriority: 'extended', ownerWorkspace: 'intelligence' },
];

export function summarizeBusinessModuleCatalog(catalog: readonly BusinessModuleCatalogEntry[] = BUSINESS_MODULE_CATALOG): { total: number; live: number; skeleton: number; externalGate: number; submoduleCount: number } {
  return { total: catalog.length, live: catalog.filter(({ state }) => state === 'live').length, skeleton: catalog.filter(({ state }) => state === 'skeleton').length, externalGate: catalog.filter(({ state }) => state === 'external-gate').length, submoduleCount: catalog.reduce((count, module) => count + module.submodules.length, 0) };
}
