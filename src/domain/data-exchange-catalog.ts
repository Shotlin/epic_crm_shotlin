export type DataExchangeState = 'ready' | 'skeleton' | 'external-gate';

export interface DataExchangeDefinition {
  id: string;
  area: string;
  label: string;
  resource: string;
  columns: readonly string[];
  state: DataExchangeState;
  ownerWorkspace: 'crm' | 'sales' | 'finance' | 'operations' | 'people' | 'service' | 'intelligence';
}

export const DATA_EXCHANGE_CATALOG: readonly DataExchangeDefinition[] = [
  { id: 'party-import', area: 'CRM', label: 'Accounts and contacts', resource: 'party', columns: ['name', 'email', 'phone', 'gstin', 'consent'], state: 'ready', ownerWorkspace: 'crm' },
  { id: 'lead-import', area: 'CRM', label: 'Leads and opportunities', resource: 'lead', columns: ['name', 'company', 'email', 'stage', 'value'], state: 'ready', ownerWorkspace: 'crm' },
  { id: 'product-import', area: 'Sales', label: 'Products, GST and HSN', resource: 'product', columns: ['sku', 'name', 'hsn', 'gstRate', 'uom'], state: 'ready', ownerWorkspace: 'sales' },
  { id: 'opening-balances', area: 'Finance', label: 'Opening balances', resource: 'journal', columns: ['accountCode', 'debit', 'credit', 'postingDate', 'reference'], state: 'skeleton', ownerWorkspace: 'finance' },
  { id: 'stock-opening', area: 'Operations', label: 'Opening stock and batches', resource: 'inventory', columns: ['sku', 'warehouse', 'bin', 'batch', 'quantity', 'expiry'], state: 'skeleton', ownerWorkspace: 'operations' },
  { id: 'employee-import', area: 'People', label: 'Employees and compensation', resource: 'employee', columns: ['employeeCode', 'name', 'department', 'basic', 'effectiveFrom'], state: 'skeleton', ownerWorkspace: 'people' },
  { id: 'service-assets', area: 'Service', label: 'Installed base and service assets', resource: 'asset', columns: ['assetTag', 'customer', 'serial', 'warrantyTo', 'servicePlan'], state: 'skeleton', ownerWorkspace: 'service' },
  { id: 'provider-reconciliation', area: 'Ecosystem', label: 'Provider reconciliation', resource: 'provider-response', columns: ['provider', 'externalId', 'status', 'receivedAt', 'checksum'], state: 'external-gate', ownerWorkspace: 'intelligence' },
];

export function summarizeDataExchangeCatalog(entries: readonly DataExchangeDefinition[] = DATA_EXCHANGE_CATALOG): { total: number; ready: number; skeleton: number; externalGate: number; columns: number } {
  return {
    total: entries.length,
    ready: entries.filter(({ state }) => state === 'ready').length,
    skeleton: entries.filter(({ state }) => state === 'skeleton').length,
    externalGate: entries.filter(({ state }) => state === 'external-gate').length,
    columns: entries.reduce((sum, entry) => sum + entry.columns.length, 0),
  };
}
