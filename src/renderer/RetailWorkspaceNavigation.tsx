import {
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  ContactRound,
  LayoutDashboard,
  LifeBuoy,
  PackageCheck,
  Settings2,
  ShoppingBag,
  Store,
  Truck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import {
  RETAIL_WORKSPACE_ROUTES,
  resolveRetailWorkspaceRoute,
  type RetailWorkspaceRoute,
  type RetailWorkspaceRouteId,
} from './RetailWorkspaceRoute';

const routeIcons: Readonly<Record<RetailWorkspaceRouteId, LucideIcon>> = {
  home: LayoutDashboard,
  sell: ShoppingBag,
  stock: Boxes,
  deliver: Truck,
  customers: UsersRound,
  money: CircleDollarSign,
  insights: BarChart3,
  setup: Settings2,
};

export type AdvancedWorkspaceId =
  | 'command'
  | 'crm'
  | 'sales'
  | 'finance'
  | 'operations'
  | 'people'
  | 'service'
  | 'intelligence'
  | 'settings';

export interface RetailWorkspaceSubmodule {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface RetailWorkspaceSubmoduleNavigation {
  route: RetailWorkspaceRoute;
  submodule: RetailWorkspaceSubmodule;
}

const submodulesByRoute = {
  home: [
    { id: 'overview', label: 'Overview', description: 'Today’s store pulse', icon: LayoutDashboard },
    { id: 'attention', label: 'Attention queue', description: 'Open exceptions and approvals', icon: ClipboardCheck },
    { id: 'store-pulse', label: 'Store pulse', description: 'Sales, stock, cash and service', icon: BarChart3 },
  ],
  sell: [
    { id: 'pos', label: 'Point of sale', description: 'Start a counter sale', icon: ShoppingBag },
    { id: 'orders', label: 'Online orders', description: 'Review and pack orders', icon: PackageCheck },
    { id: 'returns', label: 'Returns & exchanges', description: 'Resolve customer returns', icon: ClipboardCheck },
    { id: 'pricing', label: 'Products & pricing', description: 'Catalog, GST and price rules', icon: Boxes },
  ],
  stock: [
    { id: 'products', label: 'Products & variants', description: 'Catalog, barcodes and UOM', icon: Boxes },
    { id: 'control', label: 'Stock control', description: 'Bins, batches and expiry', icon: Store },
    { id: 'purchasing', label: 'Purchasing', description: 'Suppliers, POs and receiving', icon: BriefcaseBusiness },
    { id: 'replenishment', label: 'Replenishment', description: 'Reorder before stockouts', icon: BarChart3 },
  ],
  deliver: [
    { id: 'queue', label: 'Order queue', description: 'Pick, pack and dispatch', icon: PackageCheck },
    { id: 'dispatch', label: 'Delivery control', description: 'Riders, custody and proof', icon: Truck },
    { id: 'branches', label: 'Branch transfers', description: 'Send and receive stock', icon: Store },
    { id: 'returns', label: 'RTO & returns', description: 'Close the delivery loop', icon: ClipboardCheck },
  ],
  customers: [
    { id: 'customer-360', label: 'Customer 360', description: 'History, consent and addresses', icon: ContactRound },
    { id: 'loyalty', label: 'Loyalty & vouchers', description: 'Points, tiers and offers', icon: BarChart3 },
    { id: 'campaigns', label: 'Campaigns', description: 'Consent-led outreach', icon: UsersRound },
    { id: 'data-quality', label: 'Data quality', description: 'Duplicates and imports', icon: ClipboardCheck },
  ],
  money: [
    { id: 'cash', label: 'Cash register', description: 'Open, count and close cash', icon: CircleDollarSign },
    { id: 'settlements', label: 'Payments & settlements', description: 'UPI, card and bank matching', icon: BriefcaseBusiness },
    { id: 'gst', label: 'GST & invoices', description: 'Tax evidence and credit notes', icon: ClipboardCheck },
    { id: 'close', label: 'Finance close', description: 'Review posting and controls', icon: BarChart3 },
  ],
  insights: [
    { id: 'executive', label: 'Executive dashboard', description: 'What needs attention now', icon: LayoutDashboard },
    { id: 'sales-margin', label: 'Sales & margin', description: 'Revenue, tender and profit', icon: BarChart3 },
    { id: 'stock-risk', label: 'Stock & expiry', description: 'Risk, cover and sell-through', icon: Boxes },
    { id: 'outlets', label: 'Outlets & team', description: 'Branch and staff performance', icon: Store },
  ],
  setup: [
    { id: 'stores', label: 'Stores & users', description: 'Branches, roles and access', icon: Store },
    { id: 'devices', label: 'Devices', description: 'Printers, scanners and tills', icon: BriefcaseBusiness },
    { id: 'integrations', label: 'Integrations', description: 'Provider credentials and sync', icon: Truck },
    { id: 'recovery', label: 'Recovery & release', description: 'Backups, updates and evidence', icon: ClipboardCheck },
  ],
} as const satisfies Readonly<Record<RetailWorkspaceRouteId, readonly RetailWorkspaceSubmodule[]>>;

/**
 * A checked link between the labels shown in the retail rail and the shell
 * destinations that own their actions. App.tsx uses this union to make an
 * omitted destination a compile-time error instead of a silent fallback.
 */
export type RetailWorkspaceSubmoduleKey = {
  [RouteId in RetailWorkspaceRouteId]: `${RouteId}:${(typeof submodulesByRoute)[RouteId][number]['id']}`;
}[RetailWorkspaceRouteId];

const advancedWorkspaces: readonly { id: AdvancedWorkspaceId; label: string; description: string; icon: LucideIcon }[] = [
  { id: 'command', label: 'Command', description: 'Governance and operating control', icon: LayoutDashboard },
  { id: 'crm', label: 'CRM', description: 'Customer and pipeline depth', icon: ContactRound },
  { id: 'sales', label: 'Sales', description: 'Commercial workbenches', icon: ShoppingBag },
  { id: 'finance', label: 'Finance', description: 'Ledger and statutory control', icon: CircleDollarSign },
  { id: 'operations', label: 'Operations', description: 'Inventory and procurement', icon: Boxes },
  { id: 'people', label: 'People', description: 'Workforce and payroll', icon: UsersRound },
  { id: 'service', label: 'Service', description: 'Projects and field work', icon: LifeBuoy },
  { id: 'intelligence', label: 'Intelligence', description: 'Analytics and AI controls', icon: BarChart3 },
  { id: 'settings', label: 'Settings', description: 'Workspace preferences and safety', icon: Settings2 },
];

export interface RetailWorkspaceNavigationProps {
  /** The selected plain-language retail route; unknown values safely show Home. */
  activeRoute?: RetailWorkspaceRouteId | string | null;
  /** Called with the full route contract so callers can select an exact workbench. */
  onNavigate: (route: RetailWorkspaceRoute) => void;
  /** Opens a concrete task from the expanded rail rather than merely reopening its parent overview. */
  onNavigateSubmodule?: (input: RetailWorkspaceSubmoduleNavigation) => void;
  /** Optional legacy/advanced workspace handoff for administrators. */
  onAdvancedNavigate?: (workspace: AdvancedWorkspaceId) => void;
  /**
   * Specialist workspaces explicitly authorised for this signed-in user.
   * This fails closed: omitting the policy keeps cross-industry workbenches
   * out of a retail operator's rail until the host has resolved their grants.
   */
  advancedWorkspaceIds?: readonly AdvancedWorkspaceId[];
  className?: string;
}

/**
 * The operator rail keeps the first eight tasks plain-language and reveals
 * their submodules in the same left column. Advanced ERP areas remain
 * available to authorised users without crowding a new cashier's workspace.
 */
export function RetailWorkspaceNavigation({
  activeRoute,
  onNavigate,
  onNavigateSubmodule,
  onAdvancedNavigate,
  advancedWorkspaceIds,
  className,
}: RetailWorkspaceNavigationProps): ReactNode {
  const selectedRoute = resolveRetailWorkspaceRoute(activeRoute);
  const navigationClassName = ['retail-workspace-navigation', className].filter(Boolean).join(' ');
  const [expandedRoutes, setExpandedRoutes] = useState<Set<RetailWorkspaceRouteId>>(() => new Set([selectedRoute.id]));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const permittedAdvancedWorkspaceIds = new Set(advancedWorkspaceIds ?? []);
  const permittedAdvancedWorkspaces = advancedWorkspaces.filter(({ id }) => permittedAdvancedWorkspaceIds.has(id));
  const canOpenRetailExtensions = Boolean(onAdvancedNavigate) && permittedAdvancedWorkspaces.length > 0;

  useEffect(() => {
    setExpandedRoutes((current) => {
      if (current.has(selectedRoute.id)) return current;
      const next = new Set(current);
      next.add(selectedRoute.id);
      return next;
    });
  }, [selectedRoute.id]);

  function toggleRoute(routeId: RetailWorkspaceRouteId): void {
    setExpandedRoutes((current) => {
      const next = new Set(current);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  }

  return (
    <nav className={navigationClassName} aria-label="Retail workspaces" data-testid="retail-workspace-navigation">
      <div className="retail-workspace-navigation__heading">
        <span>Retail workspace</span>
        <strong>Run the store</strong>
      </div>
      <ul className="retail-workspace-navigation__items">
        {RETAIL_WORKSPACE_ROUTES.map((route, index) => {
          const Icon = routeIcons[route.id];
          const selected = selectedRoute.id === route.id;
          const expanded = expandedRoutes.has(route.id);
          const submodules = submodulesByRoute[route.id];
          return (
            <li key={route.id} className="retail-workspace-navigation__group" data-expanded={expanded ? 'true' : 'false'}>
              <button
                type="button"
                className="retail-workspace-navigation__item"
                aria-current={selected ? 'page' : undefined}
                aria-expanded={expanded}
                aria-label={route.label}
                aria-keyshortcuts={`Alt+${index + 1}`}
                data-route={route.id}
                data-active={selected ? 'true' : 'false'}
                title={route.description}
                onClick={() => { onNavigate(route); toggleRoute(route.id); }}
              >
                <span className="retail-workspace-navigation__icon" aria-hidden="true"><Icon size={19} strokeWidth={2} /></span>
                <span className="retail-workspace-navigation__copy"><strong>{route.label}</strong><small>{route.description}</small></span>
                <ChevronDown className="retail-workspace-navigation__chevron" size={16} aria-hidden="true" />
              </button>
              {expanded ? (
                <ul className="retail-workspace-navigation__subitems" aria-label={`${route.label} submodules`}>
                  {submodules.map((submodule) => {
                    const SubmoduleIcon = submodule.icon;
                    return <li key={submodule.id}>
                      <button type="button" className="retail-workspace-navigation__subitem" aria-label={`Open ${submodule.label}`} onClick={() => onNavigateSubmodule ? onNavigateSubmodule({ route, submodule }) : onNavigate(route)} title={submodule.description}>
                        <SubmoduleIcon size={14} aria-hidden="true" />
                        <span><strong>{submodule.label}</strong><small>{submodule.description}</small></span>
                      </button>
                    </li>;
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canOpenRetailExtensions ? <div className="retail-workspace-navigation__advanced">
        <button type="button" className="retail-workspace-navigation__advanced-toggle" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}>
          <BriefcaseBusiness size={16} aria-hidden="true" /><span>Retail extensions</span><ChevronDown size={15} aria-hidden="true" />
        </button>
        {advancedOpen ? <ul className="retail-workspace-navigation__advanced-items" aria-label="Retail extensions">
          {permittedAdvancedWorkspaces.map(({ id, label, description, icon: Icon }) => <li key={id}>
            <button type="button" className="retail-workspace-navigation__advanced-item" aria-label={label} onClick={() => onAdvancedNavigate?.(id)}>
              <Icon size={15} aria-hidden="true" /><span><strong>{label}</strong><small>{description}</small></span>
            </button>
          </li>)}
        </ul> : null}
      </div> : null}
    </nav>
  );
}
