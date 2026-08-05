/**
 * The small, retailer-first route vocabulary shown throughout Epic BOS.
 *
 * These route IDs are deliberately independent of the older ERP shell tabs so
 * new operator-facing navigation can remain plain-language while the shell is
 * migrated behind it.
 */
export const RETAIL_WORKSPACE_ROUTE_IDS = [
  'home',
  'sell',
  'stock',
  'deliver',
  'customers',
  'money',
  'insights',
  'setup',
] as const;

export type RetailWorkspaceRouteId = (typeof RETAIL_WORKSPACE_ROUTE_IDS)[number];

export type RetailWorkbenchId =
  | 'retail-command'
  | 'retail-pos'
  | 'retail-stock'
  | 'retail-delivery'
  | 'retail-customers'
  | 'retail-cash'
  | 'retail-reports'
  | 'retail-setup';

/** Existing App.tsx workspace IDs. They stay behind the retail labels. */
export type RetailShellWorkspaceId =
  | 'command'
  | 'crm'
  | 'sales'
  | 'finance'
  | 'operations'
  | 'people'
  | 'service'
  | 'intelligence';

export type RetailBharatTab =
  | 'commerce'
  | 'warehouse'
  | 'fulfilment'
  | 'cash'
  | 'intelligence';

/**
 * Retail operators always enter the customer master. The former generic CRM
 * overview was a demo pipeline and must never become an accidental retail
 * destination through a route adapter or deep link.
 */
export type RetailCrmSurface = 'party';
export type RetailCommandSurface = 'overview' | 'governance' | 'control';
export type RetailCommandControlTab = 'organization' | 'access' | 'approvals' | 'storage' | 'release' | 'integration';

/**
 * The adapter target matches the existing Electron shell without leaking its
 * generic navigation names into the retailer-facing UI. App.tsx can branch on
 * `kind` and forward the supplied fields directly to its current navigator.
 */
export type RetailWorkspaceAdapterTarget =
  | {
      kind: 'command';
      workspaceId: 'command';
      commandSurface: RetailCommandSurface;
      commandControlTab?: RetailCommandControlTab;
    }
  | {
      kind: 'crm-surface';
      workspaceId: 'crm';
      crmSurface: RetailCrmSurface;
    }
  | {
      kind: 'bharat';
      workspaceId: Extract<RetailShellWorkspaceId, 'sales' | 'operations' | 'finance' | 'intelligence'>;
      bharatTab: RetailBharatTab;
    };

export interface RetailWorkspaceAdapterDescriptor {
  key: RetailWorkspaceRouteId;
  label: string;
  target: RetailWorkspaceAdapterTarget;
}

export interface RetailWorkspaceRoute {
  id: RetailWorkspaceRouteId;
  label: string;
  description: string;
  workbenchId: RetailWorkbenchId;
  adapter: RetailWorkspaceAdapterDescriptor;
}

export const RETAIL_WORKSPACE_ROUTES: readonly RetailWorkspaceRoute[] = Object.freeze([
  {
    id: 'home',
    label: 'Home',
    description: 'See what needs attention across the store.',
    workbenchId: 'retail-command',
    adapter: {
      key: 'home',
      label: 'Home',
      target: { kind: 'command', workspaceId: 'command', commandSurface: 'overview' },
    },
  },
  {
    id: 'sell',
    label: 'Sell',
    description: 'Make a sale, manage orders, and handle returns.',
    workbenchId: 'retail-pos',
    adapter: {
      key: 'sell',
      label: 'Sell',
      target: { kind: 'bharat', workspaceId: 'sales', bharatTab: 'commerce' },
    },
  },
  {
    id: 'stock',
    label: 'Stock',
    description: 'Check products, quantities, expiry, and replenishment.',
    workbenchId: 'retail-stock',
    adapter: {
      key: 'stock',
      label: 'Stock',
      target: { kind: 'bharat', workspaceId: 'operations', bharatTab: 'warehouse' },
    },
  },
  {
    id: 'deliver',
    label: 'Deliver',
    description: 'Pack orders, manage delivery, and keep custody clear.',
    workbenchId: 'retail-delivery',
    adapter: {
      key: 'deliver',
      label: 'Deliver',
      target: { kind: 'bharat', workspaceId: 'operations', bharatTab: 'fulfilment' },
    },
  },
  {
    id: 'customers',
    label: 'Customers',
    description: 'Look after customer history, loyalty, and consent.',
    workbenchId: 'retail-customers',
    adapter: {
      key: 'customers',
      label: 'Customers',
      target: { kind: 'crm-surface', workspaceId: 'crm', crmSurface: 'party' },
    },
  },
  {
    id: 'money',
    label: 'Money',
    description: 'Close cash, review payments, and reconcile settlements.',
    workbenchId: 'retail-cash',
    adapter: {
      key: 'money',
      label: 'Money',
      target: { kind: 'bharat', workspaceId: 'finance', bharatTab: 'cash' },
    },
  },
  {
    id: 'insights',
    label: 'Insights',
    description: 'Understand sales, margin, stock risk, and store performance.',
    workbenchId: 'retail-reports',
    adapter: {
      key: 'insights',
      label: 'Insights',
      target: { kind: 'bharat', workspaceId: 'intelligence', bharatTab: 'intelligence' },
    },
  },
  {
    id: 'setup',
    label: 'Setup',
    description: 'Set up stores, devices, people, and safe integrations.',
    workbenchId: 'retail-setup',
    adapter: {
      key: 'setup',
      label: 'Setup',
      target: {
        kind: 'command',
        workspaceId: 'command',
        commandSurface: 'control',
        commandControlTab: 'organization',
      },
    },
  },
]);

const routeById = new Map<RetailWorkspaceRouteId, RetailWorkspaceRoute>(
  RETAIL_WORKSPACE_ROUTES.map((route) => [route.id, route]),
);

const routeAliases: Readonly<Record<string, RetailWorkspaceRouteId>> = Object.freeze({
  retail: 'home',
  'retail/home': 'home',
  'retail/sell': 'sell',
  'retail/stock': 'stock',
  'retail/deliver': 'deliver',
  'retail/customers': 'customers',
  'retail/money': 'money',
  'retail/insights': 'insights',
  'retail/setup': 'setup',
});

function normalizeRetailWorkspaceRoute(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Resolves a direct retail route from a persisted navigation value or deep
 * link. Unknown values always return Home, preventing a generic legacy view
 * from becoming the accidental default.
 */
export function resolveRetailWorkspaceRoute(value: unknown): RetailWorkspaceRoute {
  if (typeof value !== 'string') return RETAIL_WORKSPACE_ROUTES[0]!;

  const normalized = normalizeRetailWorkspaceRoute(value);
  const id = routeAliases[normalized] ?? normalized;
  if (!RETAIL_WORKSPACE_ROUTE_IDS.includes(id as RetailWorkspaceRouteId)) {
    return RETAIL_WORKSPACE_ROUTES[0]!;
  }

  return routeById.get(id as RetailWorkspaceRouteId) ?? RETAIL_WORKSPACE_ROUTES[0]!;
}
