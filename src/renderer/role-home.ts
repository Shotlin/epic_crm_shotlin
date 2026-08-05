import type { KernelSnapshot } from '../shared/kernel-contracts';
import type { AdvancedWorkspaceId } from './RetailWorkspaceNavigation';

export type RoleHomeWorkspace = 'command' | 'crm' | 'sales' | 'finance' | 'operations' | 'people' | 'service' | 'intelligence';

const priority: Array<{ workspace: RoleHomeWorkspace; resources: string[] }> = [
  { workspace: 'finance', resources: ['finance.journal', 'finance.control', 'treasury.payment'] },
  { workspace: 'operations', resources: ['inventory.execution', 'procurement.execution', 'manufacturing.execution'] },
  { workspace: 'people', resources: ['people.payroll', 'people.attendance', 'people.leave'] },
  { workspace: 'service', resources: ['delivery.project', 'service.case', 'field-service.dispatch'] },
  { workspace: 'sales', resources: ['sales.quote', 'sales.order', 'sales.opportunity'] },
  { workspace: 'crm', resources: ['crm.lead', 'crm.account', 'crm.opportunity'] },
  { workspace: 'intelligence', resources: ['intelligence.read'] },
];

const advancedWorkspaceOrder: readonly AdvancedWorkspaceId[] = [
  'command',
  'crm',
  'sales',
  'finance',
  'operations',
  'people',
  'service',
  'intelligence',
  'settings',
];

const advancedWorkspaceResourcePrefixes: Readonly<Record<AdvancedWorkspaceId, readonly string[]>> = {
  command: ['kernel.', 'approval.', 'audit.', 'workflow.'],
  crm: ['crm.', 'party.'],
  sales: ['sales.', 'quote.', 'pricing.'],
  finance: ['finance.', 'treasury.', 'collections.', 'statutory.', 'ledger.'],
  operations: ['inventory.', 'warehouse.', 'procurement.', 'manufacturing.', 'asset.'],
  people: ['people.', 'payroll.', 'hr.'],
  service: ['service.', 'field-service.', 'delivery.', 'project.'],
  intelligence: ['intelligence.', 'analytics.', 'report.'],
  settings: ['company.', 'branch.', 'role.', 'integration.', 'release.', 'backup.', 'attachment.'],
};

function grantedResourcesForUser(snapshot: KernelSnapshot, userId: string): ReadonlySet<string> {
  const user = snapshot.users.find(({ id }) => id === userId);
  if (!user) return new Set();
  const grantsById = new Map(snapshot.grants.map((grant) => [grant.id, grant]));
  const resources = snapshot.roles
    .filter(({ id }) => user.roleIds.includes(id))
    .flatMap(({ grantIds }) => grantIds)
    .map((grantId) => grantsById.get(grantId)?.resource)
    .filter((resource): resource is string => Boolean(resource));
  return new Set(resources);
}

/**
 * Advanced ERP workbenches are intentionally opt-in from the actual signed-in
 * policy. The retail rail stays simple for everyone; a cross-industry panel
 * only appears when the current role has a concrete governed reason to use it.
 */
export function advancedRetailWorkspacesForUser(snapshot: KernelSnapshot, userId: string): readonly AdvancedWorkspaceId[] {
  const user = snapshot.users.find(({ id }) => id === userId);
  if (!user) return [];
  if (user.roleIds.includes('role-workspace-owner')) return advancedWorkspaceOrder;
  const resources = grantedResourcesForUser(snapshot, userId);
  return advancedWorkspaceOrder.filter((workspace) =>
    advancedWorkspaceResourcePrefixes[workspace].some((prefix) =>
      [...resources].some((resource) => resource.startsWith(prefix)),
    ),
  );
}

export function preferredWorkspaceForUser(snapshot: KernelSnapshot, userId: string): RoleHomeWorkspace {
  const user = snapshot.users.find(({ id }) => id === userId);
  if (!user) return 'crm';
  // A retail workspace owner needs an immediate, plain-language operating
  // picture rather than a technical CRM landing page. Explicit provisioned
  // roles still receive their role-directed starting workspace below.
  if (user.roleIds.includes('role-workspace-owner')) return 'command';
  const grants = grantedResourcesForUser(snapshot, userId);
  return priority.find(({ resources }) => resources.some((resource) => grants.has(resource)))?.workspace ?? 'crm';
}
