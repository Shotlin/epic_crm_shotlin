import { createHash, randomUUID } from 'node:crypto';
import type {
  AccessDecision,
  AccessRequest,
  ApprovalRequest,
  AssignRoleInput,
  AuditEntry,
  BusinessUser,
  Branch,
  Company,
  CompanyProfile,
  CreateBranchInput,
  CreateCompanyInput,
  CreateRoleInput,
  CreateUserInput,
  CustomFieldDefinition,
  DecideApprovalInput,
  DomainEvent,
  IssueNumberInput,
  KernelBackup,
  KernelSnapshot,
  KernelState,
  PermissionGrant,
  RegisterCustomFieldInput,
  Role,
  TransitionWorkflowInput,
  UpdateApprovalPolicyInput,
  UpdateBranchInput,
  UpdateCompanyInput,
  UpdateTenantIdentityInput,
  UpdateRolePolicyInput,
  UpsertFieldAccessRuleInput,
  WorkflowInstance,
} from '../shared/kernel-contracts';

const GENESIS_HASH = '0'.repeat(64);
const AUTHORIZATION_FOUNDATION_MIGRATION_ID = '002-workspace-owner-authorization';
const GENERAL_LEDGER_AUTHORIZATION_MIGRATION_ID = '003-general-ledger-authorization';
const PARTY_MASTER_AUTHORIZATION_MIGRATION_ID = '004-party-master-authorization';
const SALES_COMMERCIAL_AUTHORIZATION_MIGRATION_ID = '005-sales-commercial-authorization';
const RECEIVABLES_AUTHORIZATION_MIGRATION_ID = '006-receivables-authorization';
const SALES_MASTER_DATA_AUTHORIZATION_MIGRATION_ID = '007-sales-master-data-authorization';
const SALES_GEOGRAPHY_AUTHORIZATION_MIGRATION_ID = '008-sales-geography-authorization';
const CRM_CONFIGURATION_AUTHORIZATION_MIGRATION_ID = '009-crm-configuration-authorization';
const CRM_IMPORT_AUTHORIZATION_MIGRATION_ID = '010-crm-import-authorization';
const CRM_COMMUNICATION_AUTHORIZATION_MIGRATION_ID = '011-crm-communication-authorization';
const INVENTORY_WAREHOUSE_AUTHORIZATION_MIGRATION_ID = '012-inventory-warehouse-authorization';
const PROCUREMENT_AUTHORIZATION_MIGRATION_ID = '013-procurement-authorization';
const MANUFACTURING_AUTHORIZATION_MIGRATION_ID = '014-manufacturing-authorization';
const DELIVERY_AUTHORIZATION_MIGRATION_ID = '015-delivery-authorization';
const WORKFORCE_AUTHORIZATION_MIGRATION_ID = '016-workforce-authorization';
const ASSET_MAINTENANCE_AUTHORIZATION_MIGRATION_ID = '017-asset-maintenance-authorization';
const ASSET_CAPITALIZATION_AUTHORIZATION_MIGRATION_ID = '018-asset-capitalization-authorization';
const ASSET_DEPRECIATION_AUTHORIZATION_MIGRATION_ID = '019-asset-depreciation-authorization';
const ASSET_RETIREMENT_AUTHORIZATION_MIGRATION_ID = '020-asset-retirement-authorization';
const ASSET_CUSTODY_TRANSFER_AUTHORIZATION_MIGRATION_ID = '021-asset-custody-transfer-authorization';
const ASSET_COMPONENTIZATION_AUTHORIZATION_MIGRATION_ID = '022-asset-componentization-authorization';
const ASSET_COMPONENT_ALLOCATION_AUTHORIZATION_MIGRATION_ID = '023-asset-component-allocation-authorization';
const ASSET_TRANSFER_ACCOUNTING_AUTHORIZATION_MIGRATION_ID = '024-asset-transfer-accounting-authorization';
const ASSET_SALE_DISPOSAL_AUTHORIZATION_MIGRATION_ID = '025-asset-sale-disposal-authorization';
const ASSET_LIFECYCLE_AUTHORIZATION_MIGRATION_ID = '026-asset-lifecycle-authorization';
const PROCUREMENT_REQUISITION_AUTHORIZATION_MIGRATION_ID = '027-procurement-requisition-authorization';
const INDIA_DEMO_LOCALIZATION_MIGRATION_ID = '028-india-demo-localization';
export const WORKSPACE_OWNER_ROLE_ID = 'role-workspace-owner';
export const WORKSPACE_OWNER_ID = 'user-avery';
const WORKSPACE_OWNER_GRANTS: ReadonlyArray<PermissionGrant> = [
  {
    id: 'grant-workspace-read',
    resource: 'operations.workspace',
    actions: ['read'],
  },
  {
    id: 'grant-workspace-payroll',
    resource: 'payroll.*',
    actions: ['read', 'create', 'update', 'submit', 'approve', 'post', 'export', 'admin'],
  },
  {
    id: 'grant-workspace-workforce',
    resource: 'workforce.*',
    actions: ['read', 'create', 'update', 'submit', 'approve', 'post', 'export', 'admin'],
  },
  {
    id: 'grant-workspace-finance',
    resource: 'finance.*',
    actions: ['read', 'create', 'update', 'submit', 'approve', 'post', 'export', 'admin'],
  },
  {
    id: 'grant-workspace-treasury',
    resource: 'treasury.*',
    actions: ['read', 'create', 'update', 'submit', 'approve', 'post', 'export', 'admin'],
  },
  {
    id: 'grant-workspace-statutory',
    resource: 'statutory.*',
    actions: ['read', 'create', 'update', 'submit', 'approve', 'post', 'export', 'admin'],
  },
  {
    id: 'grant-workspace-provider',
    resource: 'provider.*',
    actions: ['read', 'create', 'update', 'submit', 'approve', 'post', 'export', 'admin'],
  },
];
const WORKSPACE_OWNER_GRANT_IDS = WORKSPACE_OWNER_GRANTS.map(({ id }) => id);
const WORKSPACE_OWNER_ROLE: Role = {
  id: WORKSPACE_OWNER_ROLE_ID,
  name: 'Workspace owner',
  description: 'Bootstrap owner access to protected operational workspaces during the authorization rollout.',
  grantIds: [...WORKSPACE_OWNER_GRANT_IDS],
  system: true,
  version: 1,
};
const AUTHORIZATION_FOUNDATION_CHECKSUM = sha256(
  JSON.stringify({
    ownerId: WORKSPACE_OWNER_ID,
    role: WORKSPACE_OWNER_ROLE,
    grants: WORKSPACE_OWNER_GRANTS,
  }),
);
const GENERAL_LEDGER_GRANTS: ReadonlyArray<PermissionGrant> = [
  {
    id: 'grant-journal-prepare',
    resource: 'finance.journal',
    actions: ['read', 'create', 'update', 'submit'],
  },
  {
    id: 'grant-journal-post',
    resource: 'finance.journal',
    actions: ['read', 'approve', 'post'],
  },
];
const GENERAL_LEDGER_AUTHORIZATION_CHECKSUM = sha256(
  JSON.stringify(GENERAL_LEDGER_GRANTS),
);
const PARTY_MASTER_GRANT: PermissionGrant = {
  id: 'grant-party-master',
  resource: 'crm.party',
  actions: ['read', 'create', 'update'],
};
const PARTY_MASTER_AUTHORIZATION_CHECKSUM = sha256(
  JSON.stringify({ grant: PARTY_MASTER_GRANT, roleId: 'role-sales-operator' }),
);
const SALES_COMMERCIAL_GRANTS: ReadonlyArray<PermissionGrant> = [
  {
    id: 'grant-sales-commercial-operator',
    resource: 'sales.commercial',
    actions: ['read', 'create', 'update', 'submit', 'export'],
  },
  {
    id: 'grant-sales-commercial-approver',
    resource: 'sales.commercial',
    actions: ['read', 'approve'],
  },
];
const SALES_COMMERCIAL_AUTHORIZATION_CHECKSUM = sha256(
  JSON.stringify({
    grants: SALES_COMMERCIAL_GRANTS,
    roleGrants: {
      'role-sales-operator': 'grant-sales-commercial-operator',
      'role-finance-approver': 'grant-sales-commercial-approver',
    },
  }),
);
const RECEIVABLES_GRANTS: ReadonlyArray<PermissionGrant> = [
  {
    id: 'grant-receivables-preparer',
    resource: 'finance.receivable',
    actions: ['read', 'create', 'update', 'submit', 'export'],
  },
  {
    id: 'grant-receivables-controller',
    resource: 'finance.receivable',
    actions: ['read', 'create', 'approve', 'post', 'export'],
  },
];
const RECEIVABLES_AUTHORIZATION_CHECKSUM = sha256(
  JSON.stringify({
    grants: RECEIVABLES_GRANTS,
    roleGrants: {
      'role-sales-operator': 'grant-receivables-preparer',
      'role-finance-approver': 'grant-receivables-controller',
    },
  }),
);
const SALES_MASTER_DATA_GRANTS: ReadonlyArray<PermissionGrant> = [
  {
    id: 'grant-sales-catalog-maintainer',
    resource: 'sales.catalog',
    actions: ['read', 'create', 'update'],
  },
  {
    id: 'grant-sales-pricing-preparer',
    resource: 'sales.pricing',
    actions: ['read', 'create', 'update', 'submit'],
  },
  {
    id: 'grant-sales-pricing-approver',
    resource: 'sales.pricing',
    actions: ['read', 'approve'],
  },
];
const SALES_MASTER_DATA_AUTHORIZATION_CHECKSUM = sha256(
  JSON.stringify({
    grants: SALES_MASTER_DATA_GRANTS,
    roleGrants: {
      'role-sales-operator': [
        'grant-sales-catalog-maintainer',
        'grant-sales-pricing-preparer',
      ],
      'role-finance-approver': ['grant-sales-pricing-approver'],
    },
  }),
);
const SALES_GEOGRAPHY_GRANT: PermissionGrant = {
  id: 'grant-sales-geography-governance',
  resource: 'sales.geography',
  actions: ['read', 'create', 'update'],
};
const SALES_GEOGRAPHY_AUTHORIZATION_CHECKSUM = sha256(
  JSON.stringify({ grant: SALES_GEOGRAPHY_GRANT, roleId: 'role-kernel-admin' }),
);
const CRM_CONFIGURATION_GRANT: PermissionGrant = {
  id: 'grant-crm-configuration-governance',
  resource: 'crm.configuration',
  actions: ['read', 'create', 'update'],
};
const CRM_CONFIGURATION_AUTHORIZATION_CHECKSUM = sha256(
  JSON.stringify({ grant: CRM_CONFIGURATION_GRANT, roleId: 'role-kernel-admin' }),
);
const CRM_IMPORT_GRANT: PermissionGrant = {
  id: 'grant-crm-import-governance',
  resource: 'crm.import',
  actions: ['create', 'submit'],
};
const CRM_IMPORT_AUTHORIZATION_CHECKSUM = sha256(
  JSON.stringify({ grant: CRM_IMPORT_GRANT, roleId: 'role-kernel-admin' }),
);
const CRM_COMMUNICATION_GRANTS: ReadonlyArray<PermissionGrant> = [
  {
    id: 'grant-crm-integration-governance',
    resource: 'crm.integration',
    actions: ['read', 'create', 'update'],
  },
  {
    id: 'grant-crm-communication-capture',
    resource: 'crm.communication',
    actions: ['create'],
  },
];
const CRM_COMMUNICATION_AUTHORIZATION_CHECKSUM = sha256(
  JSON.stringify({
    grants: CRM_COMMUNICATION_GRANTS,
    roleGrants: {
      'role-kernel-admin': 'grant-crm-integration-governance',
      'role-sales-operator': 'grant-crm-communication-capture',
    },
  }),
);
const INVENTORY_WAREHOUSE_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-inventory-master-governance', resource: 'inventory.master', actions: ['read', 'create', 'update'] },
  { id: 'grant-inventory-execution-governance', resource: 'inventory.execution', actions: ['read', 'create', 'update', 'approve'] },
];
const INVENTORY_WAREHOUSE_AUTHORIZATION_CHECKSUM = sha256(
  JSON.stringify({ grants: INVENTORY_WAREHOUSE_GRANTS, roleId: 'role-kernel-admin' }),
);
const PROCUREMENT_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-procurement-supplier-prepare', resource: 'procurement.supplier', actions: ['read', 'create'] },
  { id: 'grant-procurement-supplier-approve', resource: 'procurement.supplier', actions: ['read', 'approve'] },
  { id: 'grant-procurement-sourcing-prepare', resource: 'procurement.sourcing', actions: ['read', 'create', 'update', 'submit'] },
  { id: 'grant-procurement-sourcing-approve', resource: 'procurement.sourcing', actions: ['read', 'approve'] },
  { id: 'grant-procurement-receiving-prepare', resource: 'procurement.receiving', actions: ['read', 'create'] },
  { id: 'grant-procurement-receiving-approve', resource: 'procurement.receiving', actions: ['read', 'approve'] },
  { id: 'grant-procurement-payable-prepare', resource: 'procurement.payable', actions: ['read', 'create'] },
  { id: 'grant-procurement-payable-approve', resource: 'procurement.payable', actions: ['read', 'approve'] },
];
const PROCUREMENT_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({ grants: PROCUREMENT_GRANTS, roleGrants: { 'role-procurement-requester': ['grant-procurement-supplier-prepare', 'grant-procurement-sourcing-prepare', 'grant-procurement-receiving-prepare', 'grant-procurement-payable-prepare'], 'role-finance-approver': ['grant-procurement-supplier-approve', 'grant-procurement-sourcing-approve', 'grant-procurement-receiving-approve', 'grant-procurement-payable-approve'] } }));
const PROCUREMENT_REQUISITION_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-procurement-requisition-prepare', resource: 'procurement.requisition', actions: ['read', 'create'] },
  { id: 'grant-procurement-requisition-approve', resource: 'procurement.requisition', actions: ['read', 'approve'] },
];
const PROCUREMENT_REQUISITION_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({ grants: PROCUREMENT_REQUISITION_GRANTS, roleGrants: { 'role-procurement-requester': ['grant-procurement-requisition-prepare'], 'role-finance-approver': ['grant-procurement-requisition-approve'] } }));
const MANUFACTURING_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-manufacturing-engineering', resource: 'manufacturing.engineering', actions: ['read', 'create', 'update'] },
  { id: 'grant-manufacturing-execution', resource: 'manufacturing.execution', actions: ['read', 'create', 'update'] },
  { id: 'grant-manufacturing-quality-record', resource: 'manufacturing.quality', actions: ['read', 'create'] },
  { id: 'grant-manufacturing-quality-approve', resource: 'manufacturing.quality', actions: ['read', 'approve'] },
  { id: 'grant-manufacturing-release', resource: 'manufacturing.release', actions: ['read', 'approve'] },
];
const MANUFACTURING_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({ grants: MANUFACTURING_GRANTS, roles: ['role-production-operator', 'role-quality-controller'] }));
const DELIVERY_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-delivery-project-operate', resource: 'delivery.project', actions: ['read', 'create', 'update', 'approve'] },
  { id: 'grant-delivery-project-approve', resource: 'delivery.project', actions: ['read', 'approve'] },
  { id: 'grant-delivery-service-operate', resource: 'delivery.service', actions: ['read', 'create', 'update'] },
  { id: 'grant-delivery-service-approve', resource: 'delivery.service', actions: ['read', 'approve'] },
];
const DELIVERY_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({ grants: DELIVERY_GRANTS, roles: ['role-delivery-operator', 'role-service-controller'] }));
const WORKFORCE_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-workforce-profile-prepare', resource: 'workforce.profile', actions: ['read', 'create'] },
  { id: 'grant-workforce-profile-approve', resource: 'workforce.profile', actions: ['read', 'approve'] },
  { id: 'grant-workforce-availability-submit', resource: 'workforce.availability', actions: ['create'] },
  { id: 'grant-workforce-availability-approve', resource: 'workforce.availability', actions: ['read', 'approve'] },
  { id: 'grant-workforce-allocation-operate', resource: 'workforce.allocation', actions: ['read', 'create', 'update'] },
];
const WORKFORCE_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({ grants: WORKFORCE_GRANTS, roles: ['role-workforce-member', 'role-workforce-coordinator', 'role-workforce-reviewer'] }));
const ASSET_MAINTENANCE_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-asset-category-maintain', resource: 'finance.asset-category', actions: ['read', 'create', 'update'] },
  { id: 'grant-asset-register-maintain', resource: 'finance.asset-register', actions: ['read', 'create', 'update', 'submit'] },
  { id: 'grant-asset-register-approve', resource: 'finance.asset-register', actions: ['read', 'approve'] },
  { id: 'grant-maintenance-plan-maintain', resource: 'maintenance.plan', actions: ['read', 'create', 'update'] },
  { id: 'grant-maintenance-work-order-schedule', resource: 'maintenance.work-order', actions: ['read', 'create'] },
  { id: 'grant-maintenance-work-order-execute', resource: 'maintenance.work-order', actions: ['read', 'update'] },
  { id: 'grant-maintenance-work-order-verify', resource: 'maintenance.work-order', actions: ['read', 'approve'] },
];
const ASSET_MAINTENANCE_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({
  grants: ASSET_MAINTENANCE_GRANTS,
  roles: ['role-asset-steward', 'role-asset-controller', 'role-maintenance-technician'],
}));
const ASSET_CAPITALIZATION_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-asset-capitalization-submit', resource: 'finance.asset-capitalization', actions: ['read', 'create', 'submit'] },
  { id: 'grant-asset-capitalization-approve', resource: 'finance.asset-capitalization', actions: ['read', 'approve'] },
];
const ASSET_CAPITALIZATION_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({
  grants: ASSET_CAPITALIZATION_GRANTS,
  roles: ['role-asset-capitalization-maker', 'role-asset-capitalization-approver'],
}));
const ASSET_DEPRECIATION_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-asset-depreciation-policy-maintain', resource: 'finance.asset-depreciation-policy', actions: ['read', 'create', 'submit'] },
  { id: 'grant-asset-depreciation-policy-approve', resource: 'finance.asset-depreciation-policy', actions: ['read', 'approve'] },
  { id: 'grant-asset-depreciation-run-maintain', resource: 'finance.asset-depreciation-run', actions: ['read', 'create', 'submit'] },
  { id: 'grant-asset-depreciation-run-approve', resource: 'finance.asset-depreciation-run', actions: ['read', 'approve'] },
];
const ASSET_DEPRECIATION_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({
  grants: ASSET_DEPRECIATION_GRANTS,
  roles: ['role-asset-depreciation-maker', 'role-asset-depreciation-approver'],
}));
const ASSET_RETIREMENT_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-asset-retirement-submit', resource: 'finance.asset-retirement', actions: ['read', 'create', 'submit'] },
  { id: 'grant-asset-retirement-approve', resource: 'finance.asset-retirement', actions: ['read', 'approve'] },
];
const ASSET_RETIREMENT_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({
  grants: ASSET_RETIREMENT_GRANTS,
  roles: ['role-asset-retirement-maker', 'role-asset-retirement-approver'],
}));
const ASSET_CUSTODY_TRANSFER_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-asset-custody-transfer-submit', resource: 'maintenance.asset-transfer', actions: ['read', 'create'] },
  { id: 'grant-asset-custody-transfer-approve', resource: 'maintenance.asset-transfer', actions: ['read', 'approve'] },
  { id: 'grant-asset-custody-transfer-receive', resource: 'maintenance.asset-transfer', actions: ['read', 'update'] },
];
const ASSET_CUSTODY_TRANSFER_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({
  grants: ASSET_CUSTODY_TRANSFER_GRANTS,
  roles: ['role-asset-custody-transfer-maker', 'role-asset-custody-transfer-approver', 'role-asset-custody-transfer-receiver'],
}));
const ASSET_COMPONENTIZATION_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-asset-componentization-submit', resource: 'maintenance.asset-componentization', actions: ['read', 'create'] },
  { id: 'grant-asset-componentization-approve', resource: 'maintenance.asset-componentization', actions: ['read', 'approve'] },
];
const ASSET_COMPONENTIZATION_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({
  grants: ASSET_COMPONENTIZATION_GRANTS,
  roles: ['role-asset-componentization-maker', 'role-asset-componentization-approver'],
}));
const ASSET_COMPONENT_ALLOCATION_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-asset-component-allocation-submit', resource: 'finance.asset-component-allocation', actions: ['read', 'create'] },
  { id: 'grant-asset-component-allocation-approve', resource: 'finance.asset-component-allocation', actions: ['read', 'approve'] },
];
const ASSET_COMPONENT_ALLOCATION_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({
  grants: ASSET_COMPONENT_ALLOCATION_GRANTS,
  roles: ['role-asset-component-allocation-maker', 'role-asset-component-allocation-approver'],
}));
const ASSET_TRANSFER_ACCOUNTING_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-asset-transfer-accounting-submit', resource: 'finance.asset-transfer-accounting', actions: ['read', 'create'] },
  { id: 'grant-asset-transfer-accounting-approve', resource: 'finance.asset-transfer-accounting', actions: ['read', 'approve'] },
  { id: 'grant-asset-transfer-accounting-move', resource: 'finance.asset-transfer-accounting', actions: ['read', 'update'] },
];
const ASSET_TRANSFER_ACCOUNTING_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({ grants: ASSET_TRANSFER_ACCOUNTING_GRANTS, roles: ['role-asset-transfer-accounting-maker', 'role-asset-transfer-accounting-approver', 'role-asset-transfer-accounting-logistics'] }));
const ASSET_SALE_DISPOSAL_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-asset-sale-disposal-submit', resource: 'finance.asset-sale-disposal', actions: ['read', 'create'] },
  { id: 'grant-asset-sale-disposal-approve', resource: 'finance.asset-sale-disposal', actions: ['read', 'approve'] },
  { id: 'grant-asset-sale-disposal-complete', resource: 'finance.asset-sale-disposal', actions: ['read', 'update'] },
];
const ASSET_SALE_DISPOSAL_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({ grants: ASSET_SALE_DISPOSAL_GRANTS, roles: ['role-asset-sale-disposal-maker', 'role-asset-sale-disposal-approver', 'role-asset-sale-disposal-completer'] }));
const ASSET_LIFECYCLE_GRANTS: ReadonlyArray<PermissionGrant> = [
  { id: 'grant-asset-lifecycle-operate', resource: 'maintenance.asset-lifecycle', actions: ['read', 'create', 'approve', 'update'] },
  { id: 'grant-asset-lifecycle-impairment-read', resource: 'finance.asset-impairment', actions: ['read'] },
  { id: 'grant-asset-lifecycle-revaluation-read', resource: 'finance.asset-revaluation', actions: ['read'] },
  { id: 'grant-asset-lifecycle-warranty-read', resource: 'maintenance.asset-warranty', actions: ['read'] },
  { id: 'grant-asset-lifecycle-amc-read', resource: 'maintenance.asset-amc', actions: ['read'] },
  { id: 'grant-asset-lifecycle-meter-read', resource: 'maintenance.asset-meter', actions: ['read'] },
  { id: 'grant-asset-lifecycle-meter-reading-read', resource: 'maintenance.asset-meter-reading', actions: ['read'] },
  { id: 'grant-asset-lifecycle-corrective-read', resource: 'maintenance.corrective', actions: ['read'] },
  { id: 'grant-asset-lifecycle-calibration-read', resource: 'maintenance.calibration', actions: ['read'] },
  { id: 'grant-asset-lifecycle-spare-read', resource: 'maintenance.asset-spare', actions: ['read'] },
  { id: 'grant-asset-lifecycle-spare-issue-read', resource: 'maintenance.asset-spare-issue', actions: ['read'] },
  { id: 'grant-asset-lifecycle-fleet-read', resource: 'maintenance.fleet-vehicle', actions: ['read'] },
  { id: 'grant-asset-lifecycle-trip-read', resource: 'maintenance.fleet-trip', actions: ['read'] },
  { id: 'grant-asset-lifecycle-history-read', resource: 'maintenance.installed-base-history', actions: ['read'] },
];
const ASSET_LIFECYCLE_AUTHORIZATION_CHECKSUM = sha256(JSON.stringify({ grants: ASSET_LIFECYCLE_GRANTS, roles: ['role-asset-lifecycle-maker', 'role-asset-lifecycle-approver', 'role-asset-lifecycle-operator'] }));
const RESERVED_CUSTOM_FIELD_KEYS = new Set([
  'id',
  'version',
  'createdAt',
  'updatedAt',
  'tenantId',
  'companyId',
]);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const INDIA_DEMO_LOCALIZATION_CHECKSUM = sha256(
  INDIA_DEMO_LOCALIZATION_MIGRATION_ID,
);

function normalizeCode(value: string, label: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]{1,15}$/.test(code)) {
    throw new Error(
      `${label} must start with a letter and contain 2-16 letters, numbers, underscores, or dashes.`,
    );
  }
  return code;
}

function normalizeName(value: string, label: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 160) {
    throw new Error(`${label} must contain 2-160 characters.`);
  }
  return name;
}

function optionalText(value: string | undefined, label: string, max = 160): string | undefined {
  if (value === undefined || !value.trim()) return undefined;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length > max) throw new Error(`${label} must contain at most ${max} characters.`);
  return normalized;
}

function normalizeCompanyProfile(profile: CompanyProfile | undefined, countryCode: string): CompanyProfile | undefined {
  if (!profile) return undefined;
  const addressLine1 = normalizeName(profile.addressLine1, 'Company address');
  const city = normalizeName(profile.city, 'Company city');
  const stateCode = profile.stateCode.trim().toUpperCase();
  if (!/^\d{2}$/.test(stateCode)) throw new Error('Company state code must use the two-digit Indian GST state code.');
  const postalCode = profile.postalCode.trim();
  if (!/^\d{6}$/.test(postalCode)) throw new Error('Company postal code must use six digits.');
  const email = optionalText(profile.email, 'Company email', 254)?.toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Company email is invalid.');
  const phone = optionalText(profile.phone, 'Company phone', 32);
  if (phone && !/^[+0-9 ()-]{7,32}$/.test(phone)) throw new Error('Company phone may contain only phone characters.');
  const website = optionalText(profile.website, 'Company website', 240);
  if (website) {
    let parsed: URL;
    try { parsed = new URL(website); } catch { throw new Error('Company website must be a valid HTTPS URL.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Company website must use HTTPS without embedded credentials.');
  }
  const gstin = optionalText(profile.gstin, 'Company GSTIN', 15)?.toUpperCase();
  if (gstin && (!/^\d{2}[A-Z0-9]{13}$/.test(gstin) || gstin.slice(0, 2) !== stateCode)) throw new Error('Company GSTIN must be 15 characters and match the state code.');
  const pan = optionalText(profile.pan, 'Company PAN', 10)?.toUpperCase();
  if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) throw new Error('Company PAN must use the Indian PAN format.');
  const logoAttachmentId = optionalText(profile.logoAttachmentId, 'Company logo attachment', 120);
  if (countryCode !== 'IN' && gstin) throw new Error('GSTIN is only accepted for an India company profile.');
  return {
    addressLine1,
    addressLine2: optionalText(profile.addressLine2, 'Company address line 2'),
    city,
    stateCode,
    postalCode,
    email,
    phone,
    website,
    gstin,
    pan,
    logoAttachmentId,
  };
}

function normalizeTenantSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 80) {
    throw new Error('Workspace slug must contain 2-80 lower-case letters, numbers, and single dashes.');
  }
  return slug;
}

function assertKernelAdmin(state: KernelState, resource: string): void {
  const decision = getAccessDecision(state, {
    userId: state.context.actorId,
    companyId: state.context.companyId,
    branchId: state.context.branchId,
    resource,
    action: 'admin',
  });
  if (!decision.allowed) throw new Error(decision.reason);
}

function normalizedUnique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function cloneWorkspaceOwnerGrant(grant: PermissionGrant): PermissionGrant {
  return { ...grant, actions: [...grant.actions] };
}

function cloneWorkspaceOwnerRole(): Role {
  return { ...WORKSPACE_OWNER_ROLE, grantIds: [...WORKSPACE_OWNER_ROLE.grantIds] };
}

function hasExpectedGrantDefinition(
  candidate: PermissionGrant | undefined,
  expected: PermissionGrant,
): boolean {
  return Boolean(
    candidate &&
      candidate.resource === expected.resource &&
      sameStringSet([...candidate.actions], [...expected.actions]),
  );
}

function hasExpectedRoleDefinition(candidate: Role | undefined): boolean {
  return Boolean(
    candidate &&
      candidate.name === WORKSPACE_OWNER_ROLE.name &&
      candidate.description === WORKSPACE_OWNER_ROLE.description &&
      candidate.system === WORKSPACE_OWNER_ROLE.system &&
      candidate.version === WORKSPACE_OWNER_ROLE.version &&
      sameStringSet(candidate.grantIds, WORKSPACE_OWNER_ROLE.grantIds),
  );
}

function assertWorkspaceOwnerRoleUntouched(state: KernelState): void {
  if (
    state.fieldAccessRules.some(
      ({ roleId }) => roleId === WORKSPACE_OWNER_ROLE_ID,
    )
  ) {
    throw new Error('Authorization migration does not allow field policies on the immutable workspace-owner role.');
  }
}

function assertNoSegregationConflict(
  state: KernelState,
  grantIds: string[],
): void {
  const grants = new Set(grantIds);
  const conflict = state.segregationRules.find(
    (rule) =>
      rule.enabled &&
      grants.has(rule.leftGrantId) &&
      grants.has(rule.rightGrantId),
  );
  if (conflict) {
    throw new Error(`Segregation-of-duties conflict: ${conflict.reason}`);
  }
}

interface MutationEvidence {
  actorId?: string;
  action: string;
  resource: string;
  resourceId: string;
  reason: string;
  before: unknown;
  after: unknown;
  eventType: string;
  payload?: Record<string, unknown>;
}

function appendEvidence(
  previous: KernelState,
  next: KernelState,
  evidence: MutationEvidence,
  now: string,
  auditId: string,
  eventId: string,
): KernelState {
  const previousHash =
    previous.audit.at(-1)?.hash ?? GENESIS_HASH;
  const unsignedAudit = {
    id: auditId,
    occurredAt: now,
    actorId: evidence.actorId ?? previous.context.actorId,
    action: evidence.action,
    resource: evidence.resource,
    resourceId: evidence.resourceId,
    reason: evidence.reason,
    before: evidence.before,
    after: evidence.after,
    previousHash,
  };
  const audit: AuditEntry = {
    ...unsignedAudit,
    hash: sha256(JSON.stringify(unsignedAudit)),
  };
  const event: DomainEvent = {
    id: eventId,
    type: evidence.eventType,
    aggregateType: evidence.resource,
    aggregateId: evidence.resourceId,
    occurredAt: now,
    payload: evidence.payload ?? {},
    status: 'pending',
    attempts: 0,
  };

  return {
    ...next,
    revision: previous.revision + 1,
    audit: [...previous.audit, audit],
    outbox: [...previous.outbox, event],
  };
}

/**
 * New-install starter state only. These friendly labels are deliberately
 * generic and India-first; persisted workspaces retain their own identity.
 * Technical IDs remain stable because the other bounded contexts use them as
 * durable scope references.
 */
export function createInitialKernelState(): KernelState {
  const initializedAt = '2026-07-15T06:00:00.000Z';
  const unsignedAudit = {
    id: 'audit-kernel-initialized',
    occurredAt: initializedAt,
    actorId: 'user-avery',
    action: 'kernel.initialized',
    resource: 'kernel',
    resourceId: 'tenant-northstar',
    reason: 'Created the Phase 1 business kernel baseline.',
    before: null,
    after: { schemaVersion: 1 },
    previousHash: GENESIS_HASH,
  };

  return {
    schemaVersion: 1,
    revision: 1,
    context: {
      tenantId: 'tenant-northstar',
      companyId: 'company-northstar-us',
      branchId: 'branch-northstar-hq',
      actorId: 'user-avery',
    },
    tenant: {
      id: 'tenant-northstar',
      name: 'Epic BOS India Starter',
      slug: 'epic-bos-india-starter',
      status: 'active',
      version: 1,
    },
    companies: [
      {
        id: 'company-northstar-us',
        tenantId: 'tenant-northstar',
        // The technical identifier stays stable for existing local state,
        // while the supplied demo legal entity is India-first.
        code: 'NSIN',
        name: 'Epic BOS India Starter Business',
        legalName: 'Epic BOS India Starter Business Private Limited',
        countryCode: 'IN',
        baseCurrency: 'INR',
        fiscalYearStartMonth: 4,
        status: 'active',
        version: 1,
      },
    ],
    branches: [
      {
        id: 'branch-northstar-hq',
        companyId: 'company-northstar-us',
        code: 'MUM',
        name: 'Mumbai HQ',
        timezone: 'Asia/Kolkata',
        status: 'active',
        version: 1,
      },
    ],
    users: [
      {
        id: 'user-avery',
        email: 'avery@northstar.example',
        displayName: 'Avery Morgan',
        status: 'active',
        roleIds: [
          'role-kernel-admin',
          WORKSPACE_OWNER_ROLE_ID,
          'role-sales-operator',
          'role-procurement-requester',
        ],
        companyIds: ['company-northstar-us'],
        branchIds: ['branch-northstar-hq'],
        version: 1,
      },
      {
        id: 'user-priya',
        email: 'priya@northstar.example',
        displayName: 'Priya Shah',
        status: 'active',
        roleIds: ['role-finance-approver'],
        companyIds: ['company-northstar-us'],
        branchIds: ['branch-northstar-hq'],
        version: 1,
      },
      {
        id: 'user-lee',
        email: 'lee@northstar.example',
        displayName: 'Lee Chen',
        status: 'active',
        roleIds: [],
        companyIds: ['company-northstar-us'],
        branchIds: ['branch-northstar-hq'],
        version: 1,
      },
    ],
    grants: [
      { id: 'grant-kernel-admin', resource: 'kernel.*', actions: ['admin'] },
      {
        id: 'grant-company-manage',
        resource: 'kernel.company',
        actions: ['create', 'read', 'update'],
      },
      {
        id: 'grant-crm-read',
        resource: 'crm.opportunity',
        actions: ['read'],
      },
      {
        id: 'grant-crm-write',
        resource: 'crm.opportunity',
        actions: ['create', 'update', 'submit'],
      },
      { ...PARTY_MASTER_GRANT, actions: [...PARTY_MASTER_GRANT.actions] },
      ...SALES_COMMERCIAL_GRANTS.map((grant) => ({
        ...grant,
        actions: [...grant.actions],
      })),
      ...RECEIVABLES_GRANTS.map((grant) => ({
        ...grant,
        actions: [...grant.actions],
      })),
      ...SALES_MASTER_DATA_GRANTS.map((grant) => ({
        ...grant,
        actions: [...grant.actions],
      })),
      { ...SALES_GEOGRAPHY_GRANT, actions: [...SALES_GEOGRAPHY_GRANT.actions] },
      { ...CRM_CONFIGURATION_GRANT, actions: [...CRM_CONFIGURATION_GRANT.actions] },
      { ...CRM_IMPORT_GRANT, actions: [...CRM_IMPORT_GRANT.actions] },
      ...CRM_COMMUNICATION_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] })),
      ...INVENTORY_WAREHOUSE_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] })),
      ...PROCUREMENT_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] })),
      {
        id: 'grant-po-submit',
        resource: 'procurement.purchase-order',
        actions: ['create', 'update', 'submit'],
      },
      {
        id: 'grant-po-approve',
        resource: 'procurement.purchase-order',
        actions: ['approve'],
      },
      {
        id: 'grant-journal-prepare',
        resource: 'finance.journal',
        actions: ['read', 'create', 'update', 'submit'],
      },
      {
        id: 'grant-journal-post',
        resource: 'finance.journal',
        actions: ['read', 'approve', 'post'],
      },
      ...WORKSPACE_OWNER_GRANTS.map(cloneWorkspaceOwnerGrant),
    ],
    roles: [
      {
        id: 'role-kernel-admin',
        name: 'Kernel administrator',
        description: 'Manages organizational and access-control configuration.',
        grantIds: [
          'grant-kernel-admin',
          'grant-company-manage',
          'grant-sales-geography-governance',
          'grant-crm-configuration-governance',
          'grant-crm-import-governance',
          'grant-crm-integration-governance',
          'grant-inventory-master-governance',
          'grant-inventory-execution-governance',
        ],
        system: true,
        version: 1,
      },
      cloneWorkspaceOwnerRole(),
      {
        id: 'role-sales-operator',
        name: 'Sales operator',
        description: 'Operates leads and commercial opportunities.',
        grantIds: [
          'grant-crm-read',
          'grant-crm-write',
          'grant-party-master',
          'grant-sales-commercial-operator',
          'grant-receivables-preparer',
          'grant-sales-catalog-maintainer',
          'grant-sales-pricing-preparer',
          'grant-crm-communication-capture',
        ],
        system: false,
        version: 1,
      },
      {
        id: 'role-procurement-requester',
        name: 'Procurement requester',
        description: 'Prepares purchase orders and draft journals.',
        grantIds: ['grant-po-submit', 'grant-journal-prepare', 'grant-procurement-supplier-prepare', 'grant-procurement-sourcing-prepare', 'grant-procurement-receiving-prepare', 'grant-procurement-payable-prepare'],
        system: false,
        version: 1,
      },
      {
        id: 'role-finance-approver',
        name: 'Finance approver',
        description: 'Approves purchasing and posts financial journals.',
        grantIds: [
          'grant-po-approve',
          'grant-journal-post',
          'grant-sales-commercial-approver',
          'grant-receivables-controller',
          'grant-sales-pricing-approver',
          'grant-procurement-supplier-approve',
          'grant-procurement-sourcing-approve',
          'grant-procurement-receiving-approve',
          'grant-procurement-payable-approve',
        ],
        system: false,
        version: 1,
      },
    ],
    fieldAccessRules: [
      {
        id: 'field-rule-sales-margin',
        roleId: 'role-sales-operator',
        resource: 'crm.opportunity',
        deniedFields: ['internalCost', 'grossMargin'],
        readOnlyFields: ['ownerId', 'probabilityMode'],
      },
    ],
    segregationRules: [
      {
        id: 'sod-journal-prepare-post',
        name: 'Journal preparation vs. posting',
        leftGrantId: 'grant-journal-prepare',
        rightGrantId: 'grant-journal-post',
        reason: 'A user who prepares a journal cannot also approve and post it.',
        enabled: true,
      },
      {
        id: 'sod-po-submit-approve',
        name: 'Purchase order request vs. approval',
        leftGrantId: 'grant-po-submit',
        rightGrantId: 'grant-po-approve',
        reason: 'A purchase-order requester cannot approve the same control class.',
        enabled: true,
      },
    ],
    currencies: [
      { code: 'INR', name: 'Indian Rupee', symbol: '₹', minorUnits: 2, active: true },
      { code: 'USD', name: 'US Dollar', symbol: '$', minorUnits: 2, active: true },
      { code: 'EUR', name: 'Euro', symbol: '€', minorUnits: 2, active: true },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥', minorUnits: 0, active: true },
    ],
    fiscalPeriods: [
      {
        id: 'period-nsus-2026',
        companyId: 'company-northstar-us',
        name: 'FY 2026-27',
        startDate: '2026-04-01',
        endDate: '2027-03-31',
        status: 'open',
        version: 1,
      },
    ],
    numberSequences: [
      {
        id: 'sequence-sales-order-2026',
        companyId: 'company-northstar-us',
        fiscalPeriodId: 'period-nsus-2026',
        documentType: 'sales-order',
        prefix: 'SO-26-27-',
        nextValue: 1,
        padding: 5,
        version: 1,
      },
    ],
    workflowDefinitions: [
      {
        id: 'workflow-purchase-order',
        name: 'Purchase order control',
        resource: 'procurement.purchase-order',
        states: ['draft', 'submitted', 'approved', 'rejected'],
        transitions: [
          {
            id: 'transition-po-submit',
            from: 'draft',
            to: 'submitted',
            requiredResource: 'procurement.purchase-order',
            requiredAction: 'submit',
          },
          {
            id: 'transition-po-approve',
            from: 'submitted',
            to: 'approved',
            requiredResource: 'procurement.purchase-order',
            requiredAction: 'submit',
            approvalPolicyId: 'approval-po-finance',
          },
        ],
        version: 1,
      },
    ],
    approvalPolicies: [
      {
        id: 'approval-po-finance',
        name: 'Finance approval for purchase orders',
        approverRoleIds: ['role-finance-approver'],
        approvalsRequired: 1,
        allowSelfApproval: false,
        version: 1,
      },
    ],
    workflowInstances: [
      {
        id: 'workflow-instance-po-1007',
        workflowId: 'workflow-purchase-order',
        documentId: 'PO-2026-01007',
        state: 'submitted',
        version: 1,
      },
    ],
    approvalRequests: [],
    customFields: [
      {
        id: 'custom-opportunity-region',
        resource: 'crm.opportunity',
        key: 'operatingRegion',
        label: 'Operating region',
        type: 'select',
        required: false,
        options: [
          'North India',
          'South India',
          'East India',
          'West India',
          'Central India',
          'Pan-India',
        ],
        version: 1,
      },
    ],
    attachments: [],
    audit: [
      {
        ...unsignedAudit,
        hash: sha256(JSON.stringify(unsignedAudit)),
      },
    ],
    outbox: [
      {
        id: 'event-kernel-initialized',
        type: 'kernel.initialized.v1',
        aggregateType: 'kernel',
        aggregateId: 'tenant-northstar',
        occurredAt: initializedAt,
        payload: { schemaVersion: 1 },
        status: 'pending',
        attempts: 0,
      },
    ],
    migrations: [
      {
        id: '001-initialize-business-kernel',
        appliedAt: initializedAt,
        checksum: sha256('001-initialize-business-kernel'),
      },
      {
        id: AUTHORIZATION_FOUNDATION_MIGRATION_ID,
        appliedAt: initializedAt,
        checksum: AUTHORIZATION_FOUNDATION_CHECKSUM,
      },
    ],
  };
}

/**
 * A provisionable India-first kernel with no sample organisation or employee
 * records.  Durable scope IDs and the complete RBAC/control template are kept
 * intact so every bounded context can be initialized atomically without an
 * ID remap.  The bootstrap owner remains a technical authority only and is
 * deliberately anonymous until the real owner adopts their identity.
 */
export function createCleanKernelState(): KernelState {
  const template = createInitialKernelState();
  const company = template.companies.find(({ id }) => id === template.context.companyId);
  const branch = template.branches.find(({ id }) => id === template.context.branchId);
  const owner = template.users.find(({ id }) => id === WORKSPACE_OWNER_ID);
  const inr = template.currencies.find(({ code }) => code === 'INR');
  if (!company || !branch || !owner || !inr) {
    throw new Error('Clean kernel starter requires the canonical India scope and bootstrap owner.');
  }

  const initializedAt = '2026-07-15T06:00:00.000Z';
  const unsignedAudit = {
    id: 'audit-kernel-clean-starter-initialized',
    occurredAt: initializedAt,
    actorId: 'system:provisioner',
    action: 'kernel.clean-starter.initialized',
    resource: 'kernel',
    resourceId: template.tenant.id,
    reason: 'Created an empty India-first business kernel baseline.',
    before: null,
    after: { schemaVersion: 1, starter: 'clean' },
    previousHash: GENESIS_HASH,
  };

  return {
    ...template,
    tenant: {
      ...template.tenant,
      name: 'Your India workspace',
      slug: 'your-india-workspace',
    },
    companies: [{
      ...company,
      code: 'YOURCO',
      name: 'Your business',
      legalName: '',
      countryCode: 'IN',
      baseCurrency: 'INR',
      fiscalYearStartMonth: 4,
    }],
    branches: [{
      ...branch,
      code: 'PRIMARY',
      name: 'Primary branch',
      timezone: 'Asia/Kolkata',
    }],
    users: [{
      ...owner,
      email: 'workspace-owner@local.invalid',
      displayName: 'Workspace administrator',
    }],
    currencies: [{
      ...inr,
      name: 'Indian Rupee',
      symbol: '₹',
    }],
    workflowInstances: [],
    approvalRequests: [],
    attachments: [],
    audit: [{ ...unsignedAudit, hash: sha256(JSON.stringify(unsignedAudit)) }],
    outbox: [{
      id: 'event-kernel-clean-starter-initialized',
      type: 'kernel.clean-starter.initialized.v1',
      aggregateType: 'kernel',
      aggregateId: template.tenant.id,
      occurredAt: initializedAt,
      payload: { schemaVersion: 1, starter: 'clean' },
      status: 'pending',
      attempts: 0,
    }],
  };
}

/**
 * Upgrade only the exact bootstrap entity shipped by pre-India-first builds.
 * This is intentionally narrow: real legal entities and posted commercial
 * data must retain their own currency until an evidenced FX migration is
 * explicitly approved.
 */
export function applyIndiaDemoLocalization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  if (state.migrations.some(({ id }) => id === INDIA_DEMO_LOCALIZATION_MIGRATION_ID)) {
    return state;
  }

  const company = state.companies.find(({ id }) => id === 'company-northstar-us');
  const branch = state.branches.find(({ id }) => id === 'branch-northstar-hq');
  const fiscalPeriod = state.fiscalPeriods.find(({ id }) => id === 'period-nsus-2026');
  const sequence = state.numberSequences.find(({ id }) => id === 'sequence-sales-order-2026');
  const isUntouchedUsdBootstrap =
    state.companies.length === 1 &&
    state.branches.length === 1 &&
    state.fiscalPeriods.length === 1 &&
    state.numberSequences.length === 1 &&
    company?.code === 'NSUS' &&
    company.name === 'Northstar US' &&
    company.legalName === 'Northstar Group, Inc.' &&
    company.countryCode === 'US' &&
    company.baseCurrency === 'USD' &&
    company.fiscalYearStartMonth === 1 &&
    branch?.code === 'HQ' &&
    branch.name === 'New York HQ' &&
    branch.timezone === 'America/New_York' &&
    fiscalPeriod?.name === 'FY 2026' &&
    fiscalPeriod.startDate === '2026-01-01' &&
    fiscalPeriod.endDate === '2026-12-31' &&
    sequence?.prefix === 'SO-2026-' &&
    sequence.nextValue === 1;

  if (!isUntouchedUsdBootstrap || !company || !branch || !fiscalPeriod || !sequence) {
    return state;
  }

  const localizedCompany = {
    ...company,
    code: 'NSIN',
    name: 'Epic BOS India Starter Business',
    legalName: 'Epic BOS India Starter Business Private Limited',
    countryCode: 'IN',
    baseCurrency: 'INR',
    fiscalYearStartMonth: 4,
    version: company.version + 1,
  };
  const localizedBranch = {
    ...branch,
    code: 'MUM',
    name: 'Mumbai HQ',
    timezone: 'Asia/Kolkata',
    version: branch.version + 1,
  };
  const localizedPeriod = {
    ...fiscalPeriod,
    name: 'FY 2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    version: fiscalPeriod.version + 1,
  };
  const localizedSequence = {
    ...sequence,
    prefix: 'SO-26-27-',
    version: sequence.version + 1,
  };
  const next: KernelState = {
    ...state,
    companies: state.companies.map((candidate) =>
      candidate.id === localizedCompany.id ? localizedCompany : candidate,
    ),
    branches: state.branches.map((candidate) =>
      candidate.id === localizedBranch.id ? localizedBranch : candidate,
    ),
    currencies: [
      ...state.currencies.filter(({ code }) => code === 'INR'),
      ...state.currencies.filter(({ code }) => code !== 'INR'),
    ],
    fiscalPeriods: state.fiscalPeriods.map((candidate) =>
      candidate.id === localizedPeriod.id ? localizedPeriod : candidate,
    ),
    numberSequences: state.numberSequences.map((candidate) =>
      candidate.id === localizedSequence.id ? localizedSequence : candidate,
    ),
    migrations: [
      ...state.migrations,
      {
        id: INDIA_DEMO_LOCALIZATION_MIGRATION_ID,
        appliedAt: now,
        checksum: INDIA_DEMO_LOCALIZATION_CHECKSUM,
      },
    ],
  };

  return appendEvidence(
    state,
    next,
    {
      action: 'kernel.india-demo-localized',
      resource: 'kernel',
      resourceId: state.tenant.id,
      reason: 'Localized the untouched Epic BOS bootstrap organization for India-first operations.',
      before: { company, branch, fiscalPeriod, sequence },
      after: {
        company: localizedCompany,
        branch: localizedBranch,
        fiscalPeriod: localizedPeriod,
        sequence: localizedSequence,
      },
      eventType: 'kernel.india-demo-localized.v1',
      payload: {
        companyId: localizedCompany.id,
        branchId: localizedBranch.id,
        baseCurrency: localizedCompany.baseCurrency,
      },
    },
    now,
    'audit-kernel-india-demo-localization',
    'event-kernel-india-demo-localization',
  );
}

function assertAuthorizationFoundationInvariant(state: KernelState): void {
  const migration = state.migrations.find(
    ({ id }) => id === AUTHORIZATION_FOUNDATION_MIGRATION_ID,
  );
  if (!migration || migration.checksum !== AUTHORIZATION_FOUNDATION_CHECKSUM) {
    throw new Error('Authorization foundation migration evidence is missing or invalid.');
  }

  const owner = state.users.find(({ id }) => id === WORKSPACE_OWNER_ID);
  if (!owner || owner.status !== 'active') {
    throw new Error('Authorization migration requires active bootstrap owner user-avery.');
  }
  if (!owner.roleIds.includes(WORKSPACE_OWNER_ROLE_ID)) {
    throw new Error('Authorization migration is missing the bootstrap owner role assignment.');
  }
  for (const expected of WORKSPACE_OWNER_GRANTS) {
    const actual = state.grants.find(({ id }) => id === expected.id);
    if (!hasExpectedGrantDefinition(actual, expected)) {
      throw new Error(`Authorization grant ${expected.id} differs from its immutable migration definition.`);
    }
  }
  if (!hasExpectedRoleDefinition(state.roles.find(({ id }) => id === WORKSPACE_OWNER_ROLE_ID))) {
    throw new Error('Authorization workspace-owner role differs from its immutable migration definition.');
  }
  assertWorkspaceOwnerRoleUntouched(state);

  const effectiveGrantIds = state.roles
    .filter(({ id }) => owner.roleIds.includes(id))
    .flatMap(({ grantIds }) => grantIds);
  assertNoSegregationConflict(state, effectiveGrantIds);
}

/**
 * Adds the narrow bootstrap-owner grants needed while operational IPC
 * authorization is rolled out. It is a data migration, not a schema change:
 * backups remain format v1 and older valid state is upgraded at load/restore.
 */
export function applyAuthorizationFoundation(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  if (state.migrations.some(({ id }) => id === AUTHORIZATION_FOUNDATION_MIGRATION_ID)) {
    assertAuthorizationFoundationInvariant(state);
    return state;
  }

  const owner = state.users.find(({ id }) => id === WORKSPACE_OWNER_ID);
  if (!owner || owner.status !== 'active') {
    throw new Error('Authorization migration requires active bootstrap owner user-avery.');
  }
  assertWorkspaceOwnerRoleUntouched(state);

  for (const expected of WORKSPACE_OWNER_GRANTS) {
    const existing = state.grants.find(({ id }) => id === expected.id);
    if (existing && !hasExpectedGrantDefinition(existing, expected)) {
      throw new Error(`Authorization grant collision for ${expected.id}.`);
    }
  }
  const existingRole = state.roles.find(({ id }) => id === WORKSPACE_OWNER_ROLE_ID);
  if (existingRole && !hasExpectedRoleDefinition(existingRole)) {
    throw new Error('Authorization workspace-owner role collision.');
  }

  const ownerRoleIds = normalizedUnique([
    ...owner.roleIds,
    WORKSPACE_OWNER_ROLE_ID,
  ]);
  const rolesAfterMigration = existingRole
    ? state.roles
    : [...state.roles, cloneWorkspaceOwnerRole()];
  const effectiveGrantIds = rolesAfterMigration
    .filter(({ id }) => ownerRoleIds.includes(id))
    .flatMap(({ grantIds }) => grantIds);
  assertNoSegregationConflict(state, effectiveGrantIds);

  const missingGrants = WORKSPACE_OWNER_GRANTS.filter(
    ({ id }) => !state.grants.some((grant) => grant.id === id),
  ).map(cloneWorkspaceOwnerGrant);
  const ownerNeedsRole = !owner.roleIds.includes(WORKSPACE_OWNER_ROLE_ID);
  const next = {
    ...state,
    users: ownerNeedsRole
      ? state.users.map((user) =>
          user.id === WORKSPACE_OWNER_ID
            ? { ...user, roleIds: ownerRoleIds, version: user.version + 1 }
            : user,
        )
      : state.users,
    roles: rolesAfterMigration,
    grants: [...state.grants, ...missingGrants],
    migrations: [
      ...state.migrations,
      {
        id: AUTHORIZATION_FOUNDATION_MIGRATION_ID,
        appliedAt: now,
        checksum: AUTHORIZATION_FOUNDATION_CHECKSUM,
      },
    ],
  };

  return appendEvidence(
    state,
    next,
    {
      actorId: 'system:migration',
      action: 'authorization.foundation-migrated',
      resource: 'kernel.authorization',
      resourceId: AUTHORIZATION_FOUNDATION_MIGRATION_ID,
      reason: 'Installed the versioned workspace-owner authorization foundation.',
      before: {
        ownerId: WORKSPACE_OWNER_ID,
        ownerRoleIds: owner.roleIds,
        authorizationGrantIds: state.grants
          .filter((grant) => WORKSPACE_OWNER_GRANT_IDS.includes(grant.id))
          .map(({ id }) => id),
      },
      after: {
        ownerId: WORKSPACE_OWNER_ID,
        ownerRoleIds,
        authorizationGrantIds: WORKSPACE_OWNER_GRANT_IDS,
      },
      eventType: 'kernel.authorization.foundation-migrated.v1',
      payload: { ownerId: WORKSPACE_OWNER_ID, roleId: WORKSPACE_OWNER_ROLE_ID },
    },
    now,
    `audit-${AUTHORIZATION_FOUNDATION_MIGRATION_ID}`,
    `event-${AUTHORIZATION_FOUNDATION_MIGRATION_ID}`,
  );
}

function hasExpectedGeneralLedgerGrant(
  candidate: PermissionGrant | undefined,
  expected: PermissionGrant,
): boolean {
  return Boolean(
    candidate &&
      candidate.resource === expected.resource &&
      sameStringSet(candidate.actions, expected.actions),
  );
}

function hasRequiredRoleGrant(role: Role | undefined, grantId: string): boolean {
  return Boolean(role?.grantIds.includes(grantId));
}

/**
 * Expands the existing journal maker and checker grants with read access.
 * The immutable ledger uses a shared read model; denying it to an otherwise
 * permitted maker/checker would leave the role able to mutate a book it could
 * not inspect. This migration only touches the two seeded system grants.
 */
export function applyGeneralLedgerAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existingMigration = state.migrations.find(
    ({ id }) => id === GENERAL_LEDGER_AUTHORIZATION_MIGRATION_ID,
  );
  if (existingMigration) {
    if (existingMigration.checksum !== GENERAL_LEDGER_AUTHORIZATION_CHECKSUM) {
      throw new Error('General-ledger authorization migration evidence is invalid.');
    }
    for (const expected of GENERAL_LEDGER_GRANTS) {
      if (!hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === expected.id), expected)) {
        throw new Error(`General-ledger authorization grant ${expected.id} is invalid.`);
      }
    }
    return state;
  }

  for (const expected of GENERAL_LEDGER_GRANTS) {
    const existing = state.grants.find(({ id }) => id === expected.id);
    if (existing && existing.resource !== expected.resource) {
      throw new Error(`General-ledger authorization grant collision for ${expected.id}.`);
    }
  }
  const before = state.grants
    .filter(({ id }) => GENERAL_LEDGER_GRANTS.some((grant) => grant.id === id))
    .map((grant) => ({ id: grant.id, resource: grant.resource, actions: [...grant.actions] }));
  const next = {
    ...state,
    grants: [
      ...state.grants.filter(
        ({ id }) => !GENERAL_LEDGER_GRANTS.some((grant) => grant.id === id),
      ),
      ...GENERAL_LEDGER_GRANTS.map((grant) => ({
        ...grant,
        actions: [...grant.actions],
      })),
    ],
    migrations: [
      ...state.migrations,
      {
        id: GENERAL_LEDGER_AUTHORIZATION_MIGRATION_ID,
        appliedAt: now,
        checksum: GENERAL_LEDGER_AUTHORIZATION_CHECKSUM,
      },
    ],
  };
  return appendEvidence(
    state,
    next,
    {
      actorId: 'system:migration',
      action: 'authorization.general-ledger-migrated',
      resource: 'kernel.authorization',
      resourceId: GENERAL_LEDGER_AUTHORIZATION_MIGRATION_ID,
      reason: 'Expanded seeded finance journal grants for the canonical general-ledger read model.',
      before,
      after: GENERAL_LEDGER_GRANTS,
      eventType: 'kernel.authorization.general-ledger-migrated.v1',
      payload: { grantIds: GENERAL_LEDGER_GRANTS.map(({ id }) => id) },
    },
    now,
    `audit-${GENERAL_LEDGER_AUTHORIZATION_MIGRATION_ID}`,
    `event-${GENERAL_LEDGER_AUTHORIZATION_MIGRATION_ID}`,
  );
}

/**
 * Promotes Party Master from a session-only workspace to a CRM resource. The
 * existing sales operator owns this shared customer/contact capability, so the
 * migration adds one narrowly-scoped grant without widening unrelated roles.
 */
export function applyPartyMasterAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existingMigration = state.migrations.find(
    ({ id }) => id === PARTY_MASTER_AUTHORIZATION_MIGRATION_ID,
  );
  const salesRole = state.roles.find(({ id }) => id === 'role-sales-operator');
  const existingGrant = state.grants.find(({ id }) => id === PARTY_MASTER_GRANT.id);
  const grantValid = hasExpectedGeneralLedgerGrant(existingGrant, PARTY_MASTER_GRANT);
  const roleValid = Boolean(salesRole?.grantIds.includes(PARTY_MASTER_GRANT.id));
  if (existingMigration) {
    if (existingMigration.checksum !== PARTY_MASTER_AUTHORIZATION_CHECKSUM) {
      throw new Error('Party-master authorization migration evidence is invalid.');
    }
    if (!grantValid || !roleValid) {
      throw new Error('Party-master authorization migration state is invalid.');
    }
    return state;
  }
  if (existingGrant && !grantValid) {
    throw new Error(`Party-master authorization grant collision for ${PARTY_MASTER_GRANT.id}.`);
  }
  if (!salesRole) throw new Error('Party-master authorization requires the sales-operator role.');

  const next: KernelState = {
    ...state,
    grants: [
      ...state.grants.filter(({ id }) => id !== PARTY_MASTER_GRANT.id),
      { ...PARTY_MASTER_GRANT, actions: [...PARTY_MASTER_GRANT.actions] },
    ],
    roles: state.roles.map((role) =>
      role.id === salesRole.id && !role.grantIds.includes(PARTY_MASTER_GRANT.id)
        ? {
            ...role,
            grantIds: [...role.grantIds, PARTY_MASTER_GRANT.id],
            version: role.version + 1,
          }
        : role,
    ),
    migrations: [
      ...state.migrations,
      {
        id: PARTY_MASTER_AUTHORIZATION_MIGRATION_ID,
        appliedAt: now,
        checksum: PARTY_MASTER_AUTHORIZATION_CHECKSUM,
      },
    ],
  };
  return appendEvidence(
    state,
    next,
    {
      actorId: 'system:migration',
      action: 'authorization.party-master-migrated',
      resource: 'kernel.authorization',
      resourceId: PARTY_MASTER_AUTHORIZATION_MIGRATION_ID,
      reason: 'Promoted Party Master to the sales operator resource policy.',
      before: {
        grant: existingGrant ?? null,
        salesRoleGrantIds: [...salesRole.grantIds],
      },
      after: {
        grant: PARTY_MASTER_GRANT,
        salesRoleGrantIds: [
          ...new Set([...salesRole.grantIds, PARTY_MASTER_GRANT.id]),
        ],
      },
      eventType: 'kernel.authorization.party-master-migrated.v1',
      payload: { grantId: PARTY_MASTER_GRANT.id, roleId: salesRole.id },
    },
    now,
    `audit-${PARTY_MASTER_AUTHORIZATION_MIGRATION_ID}`,
    `event-${PARTY_MASTER_AUTHORIZATION_MIGRATION_ID}`,
  );
}

/**
 * Separates the commercial maker and checker boundary from CRM and from the
 * finance journal. Sales can prepare, submit and render commercial documents;
 * the finance-approver role is the independent quote-approval checker. The
 * later invoice/receivable policy is intentionally a separate finance slice.
 */
export function applySalesCommercialAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existingMigration = state.migrations.find(
    ({ id }) => id === SALES_COMMERCIAL_AUTHORIZATION_MIGRATION_ID,
  );
  const salesRole = state.roles.find(({ id }) => id === 'role-sales-operator');
  const financeRole = state.roles.find(({ id }) => id === 'role-finance-approver');
  const grantsValid = SALES_COMMERCIAL_GRANTS.every((expected) =>
    hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === expected.id), expected),
  );
  const rolesValid = hasRequiredRoleGrant(salesRole, 'grant-sales-commercial-operator') &&
    hasRequiredRoleGrant(financeRole, 'grant-sales-commercial-approver');
  if (existingMigration) {
    if (existingMigration.checksum !== SALES_COMMERCIAL_AUTHORIZATION_CHECKSUM) {
      throw new Error('Sales-commercial authorization migration evidence is invalid.');
    }
    if (!grantsValid || !rolesValid) {
      throw new Error('Sales-commercial authorization migration state is invalid.');
    }
    return state;
  }
  if (!salesRole || !financeRole) {
    throw new Error('Sales-commercial authorization requires sales and finance-approver roles.');
  }
  for (const expected of SALES_COMMERCIAL_GRANTS) {
    const existing = state.grants.find(({ id }) => id === expected.id);
    if (existing && !hasExpectedGeneralLedgerGrant(existing, expected)) {
      throw new Error(`Sales-commercial authorization grant collision for ${expected.id}.`);
    }
  }

  const roleGrantIds = new Map([
    [salesRole.id, 'grant-sales-commercial-operator'],
    [financeRole.id, 'grant-sales-commercial-approver'],
  ]);
  const next: KernelState = {
    ...state,
    grants: [
      ...state.grants.filter(
        ({ id }) => !SALES_COMMERCIAL_GRANTS.some((grant) => grant.id === id),
      ),
      ...SALES_COMMERCIAL_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] })),
    ],
    roles: state.roles.map((role) => {
      const grantId = roleGrantIds.get(role.id);
      return grantId && !role.grantIds.includes(grantId)
        ? { ...role, grantIds: [...role.grantIds, grantId], version: role.version + 1 }
        : role;
    }),
    migrations: [
      ...state.migrations,
      {
        id: SALES_COMMERCIAL_AUTHORIZATION_MIGRATION_ID,
        appliedAt: now,
        checksum: SALES_COMMERCIAL_AUTHORIZATION_CHECKSUM,
      },
    ],
  };
  return appendEvidence(
    state,
    next,
    {
      actorId: 'system:migration',
      action: 'authorization.sales-commercial-migrated',
      resource: 'kernel.authorization',
      resourceId: SALES_COMMERCIAL_AUTHORIZATION_MIGRATION_ID,
      reason: 'Promoted quotation and sales-order controls to separated commercial maker/checker grants.',
      before: {
        grants: state.grants.filter(({ id }) => SALES_COMMERCIAL_GRANTS.some((grant) => grant.id === id)),
        salesRoleGrantIds: [...salesRole.grantIds],
        financeRoleGrantIds: [...financeRole.grantIds],
      },
      after: {
        grants: SALES_COMMERCIAL_GRANTS,
        salesRoleGrantIds: [...new Set([...salesRole.grantIds, 'grant-sales-commercial-operator'])],
        financeRoleGrantIds: [...new Set([...financeRole.grantIds, 'grant-sales-commercial-approver'])],
      },
      eventType: 'kernel.authorization.sales-commercial-migrated.v1',
      payload: { roleGrantIds: Object.fromEntries(roleGrantIds) },
    },
    now,
    `audit-${SALES_COMMERCIAL_AUTHORIZATION_MIGRATION_ID}`,
    `event-${SALES_COMMERCIAL_AUTHORIZATION_MIGRATION_ID}`,
  );
}

/**
 * Governs the receivables lifecycle independently from quotation control and
 * the general ledger. Commercial users may prepare invoice evidence; finance
 * retains issue/post, reconciliation, and external-export authority. This
 * keeps a customer document from becoming an accounting posting by a single
 * sales-only permission.
 */
export function applyReceivablesAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existingMigration = state.migrations.find(
    ({ id }) => id === RECEIVABLES_AUTHORIZATION_MIGRATION_ID,
  );
  const salesRole = state.roles.find(({ id }) => id === 'role-sales-operator');
  const financeRole = state.roles.find(({ id }) => id === 'role-finance-approver');
  const grantsValid = RECEIVABLES_GRANTS.every((expected) =>
    hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === expected.id), expected),
  );
  const rolesValid = hasRequiredRoleGrant(salesRole, 'grant-receivables-preparer') &&
    hasRequiredRoleGrant(financeRole, 'grant-receivables-controller');
  if (existingMigration) {
    if (existingMigration.checksum !== RECEIVABLES_AUTHORIZATION_CHECKSUM) {
      throw new Error('Receivables authorization migration evidence is invalid.');
    }
    if (!grantsValid || !rolesValid) {
      throw new Error('Receivables authorization migration state is invalid.');
    }
    return state;
  }
  if (!salesRole || !financeRole) {
    throw new Error('Receivables authorization requires sales and finance-approver roles.');
  }
  for (const expected of RECEIVABLES_GRANTS) {
    const existing = state.grants.find(({ id }) => id === expected.id);
    if (existing && !hasExpectedGeneralLedgerGrant(existing, expected)) {
      throw new Error(`Receivables authorization grant collision for ${expected.id}.`);
    }
  }

  const roleGrantIds = new Map([
    [salesRole.id, 'grant-receivables-preparer'],
    [financeRole.id, 'grant-receivables-controller'],
  ]);
  const next: KernelState = {
    ...state,
    grants: [
      ...state.grants.filter(
        ({ id }) => !RECEIVABLES_GRANTS.some((grant) => grant.id === id),
      ),
      ...RECEIVABLES_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] })),
    ],
    roles: state.roles.map((role) => {
      const grantId = roleGrantIds.get(role.id);
      return grantId && !role.grantIds.includes(grantId)
        ? { ...role, grantIds: [...role.grantIds, grantId], version: role.version + 1 }
        : role;
    }),
    migrations: [
      ...state.migrations,
      {
        id: RECEIVABLES_AUTHORIZATION_MIGRATION_ID,
        appliedAt: now,
        checksum: RECEIVABLES_AUTHORIZATION_CHECKSUM,
      },
    ],
  };
  return appendEvidence(
    state,
    next,
    {
      actorId: 'system:migration',
      action: 'authorization.receivables-migrated',
      resource: 'kernel.authorization',
      resourceId: RECEIVABLES_AUTHORIZATION_MIGRATION_ID,
      reason: 'Promoted invoice, receivable, receipt, reconciliation, and export controls to finance receivable policy.',
      before: {
        grants: state.grants.filter(({ id }) => RECEIVABLES_GRANTS.some((grant) => grant.id === id)),
        salesRoleGrantIds: [...salesRole.grantIds],
        financeRoleGrantIds: [...financeRole.grantIds],
      },
      after: {
        grants: RECEIVABLES_GRANTS,
        salesRoleGrantIds: [...new Set([...salesRole.grantIds, 'grant-receivables-preparer'])],
        financeRoleGrantIds: [...new Set([...financeRole.grantIds, 'grant-receivables-controller'])],
      },
      eventType: 'kernel.authorization.receivables-migrated.v1',
      payload: { roleGrantIds: Object.fromEntries(roleGrantIds) },
    },
    now,
    `audit-${RECEIVABLES_AUTHORIZATION_MIGRATION_ID}`,
    `event-${RECEIVABLES_AUTHORIZATION_MIGRATION_ID}`,
  );
}

/**
 * Applies least-privilege control to commercial master data. Product and GST
 * catalog maintenance are separate from price-list and discount policy work;
 * pricing preparation and pricing approval remain split across sales and
 * finance roles.
 */
export function applySalesMasterDataAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existingMigration = state.migrations.find(
    ({ id }) => id === SALES_MASTER_DATA_AUTHORIZATION_MIGRATION_ID,
  );
  const salesRole = state.roles.find(({ id }) => id === 'role-sales-operator');
  const financeRole = state.roles.find(({ id }) => id === 'role-finance-approver');
  const grantsValid = SALES_MASTER_DATA_GRANTS.every((expected) =>
    hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === expected.id), expected),
  );
  const rolesValid = hasRequiredRoleGrant(salesRole, 'grant-sales-catalog-maintainer') &&
    hasRequiredRoleGrant(salesRole, 'grant-sales-pricing-preparer') &&
    hasRequiredRoleGrant(financeRole, 'grant-sales-pricing-approver');
  if (existingMigration) {
    if (existingMigration.checksum !== SALES_MASTER_DATA_AUTHORIZATION_CHECKSUM) {
      throw new Error('Sales-master-data authorization migration evidence is invalid.');
    }
    if (!grantsValid || !rolesValid) {
      throw new Error('Sales-master-data authorization migration state is invalid.');
    }
    return state;
  }
  if (!salesRole || !financeRole) {
    throw new Error('Sales-master-data authorization requires sales and finance-approver roles.');
  }
  for (const expected of SALES_MASTER_DATA_GRANTS) {
    const existing = state.grants.find(({ id }) => id === expected.id);
    if (existing && !hasExpectedGeneralLedgerGrant(existing, expected)) {
      throw new Error(`Sales-master-data authorization grant collision for ${expected.id}.`);
    }
  }

  const roleGrantIds = new Map<string, ReadonlyArray<string>>([
    [salesRole.id, ['grant-sales-catalog-maintainer', 'grant-sales-pricing-preparer']],
    [financeRole.id, ['grant-sales-pricing-approver']],
  ]);
  const next: KernelState = {
    ...state,
    grants: [
      ...state.grants.filter(
        ({ id }) => !SALES_MASTER_DATA_GRANTS.some((grant) => grant.id === id),
      ),
      ...SALES_MASTER_DATA_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] })),
    ],
    roles: state.roles.map((role) => {
      const grantIds = roleGrantIds.get(role.id);
      const missingGrantIds = grantIds?.filter((grantId) => !role.grantIds.includes(grantId)) ?? [];
      return missingGrantIds.length
        ? { ...role, grantIds: [...role.grantIds, ...missingGrantIds], version: role.version + 1 }
        : role;
    }),
    migrations: [
      ...state.migrations,
      {
        id: SALES_MASTER_DATA_AUTHORIZATION_MIGRATION_ID,
        appliedAt: now,
        checksum: SALES_MASTER_DATA_AUTHORIZATION_CHECKSUM,
      },
    ],
  };
  return appendEvidence(
    state,
    next,
    {
      actorId: 'system:migration',
      action: 'authorization.sales-master-data-migrated',
      resource: 'kernel.authorization',
      resourceId: SALES_MASTER_DATA_AUTHORIZATION_MIGRATION_ID,
      reason: 'Promoted catalog, tax-code, pricing, and discount master data to governed sales policy.',
      before: {
        grants: state.grants.filter(({ id }) => SALES_MASTER_DATA_GRANTS.some((grant) => grant.id === id)),
        salesRoleGrantIds: [...salesRole.grantIds],
        financeRoleGrantIds: [...financeRole.grantIds],
      },
      after: {
        grants: SALES_MASTER_DATA_GRANTS,
        salesRoleGrantIds: [...new Set([...salesRole.grantIds, ...(roleGrantIds.get(salesRole.id) ?? [])])],
        financeRoleGrantIds: [...new Set([...financeRole.grantIds, ...(roleGrantIds.get(financeRole.id) ?? [])])],
      },
      eventType: 'kernel.authorization.sales-master-data-migrated.v1',
      payload: { roleGrantIds: Object.fromEntries(roleGrantIds) },
    },
    now,
    `audit-${SALES_MASTER_DATA_AUTHORIZATION_MIGRATION_ID}`,
    `event-${SALES_MASTER_DATA_AUTHORIZATION_MIGRATION_ID}`,
  );
}

/**
 * Keeps legal trading-profile, territory, and routing configuration under a
 * dedicated governance resource. These settings determine where demand is
 * routed and should not be silently mutable by every sales operator.
 */
export function applySalesGeographyAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existingMigration = state.migrations.find(
    ({ id }) => id === SALES_GEOGRAPHY_AUTHORIZATION_MIGRATION_ID,
  );
  const adminRole = state.roles.find(({ id }) => id === 'role-kernel-admin');
  const existingGrant = state.grants.find(({ id }) => id === SALES_GEOGRAPHY_GRANT.id);
  const grantValid = hasExpectedGeneralLedgerGrant(existingGrant, SALES_GEOGRAPHY_GRANT);
  const roleValid = hasRequiredRoleGrant(adminRole, SALES_GEOGRAPHY_GRANT.id);
  if (existingMigration) {
    if (existingMigration.checksum !== SALES_GEOGRAPHY_AUTHORIZATION_CHECKSUM) {
      throw new Error('Sales-geography authorization migration evidence is invalid.');
    }
    if (!grantValid || !roleValid) {
      throw new Error('Sales-geography authorization migration state is invalid.');
    }
    return state;
  }
  if (existingGrant && !grantValid) {
    throw new Error(`Sales-geography authorization grant collision for ${SALES_GEOGRAPHY_GRANT.id}.`);
  }
  if (!adminRole) throw new Error('Sales-geography authorization requires the kernel-admin role.');

  const next: KernelState = {
    ...state,
    grants: [
      ...state.grants.filter(({ id }) => id !== SALES_GEOGRAPHY_GRANT.id),
      { ...SALES_GEOGRAPHY_GRANT, actions: [...SALES_GEOGRAPHY_GRANT.actions] },
    ],
    roles: state.roles.map((role) =>
      role.id === adminRole.id && !role.grantIds.includes(SALES_GEOGRAPHY_GRANT.id)
        ? { ...role, grantIds: [...role.grantIds, SALES_GEOGRAPHY_GRANT.id], version: role.version + 1 }
        : role,
    ),
    migrations: [
      ...state.migrations,
      {
        id: SALES_GEOGRAPHY_AUTHORIZATION_MIGRATION_ID,
        appliedAt: now,
        checksum: SALES_GEOGRAPHY_AUTHORIZATION_CHECKSUM,
      },
    ],
  };
  return appendEvidence(
    state,
    next,
    {
      actorId: 'system:migration',
      action: 'authorization.sales-geography-migrated',
      resource: 'kernel.authorization',
      resourceId: SALES_GEOGRAPHY_AUTHORIZATION_MIGRATION_ID,
      reason: 'Promoted commercial identity, territory, and routing configuration to sales geography governance.',
      before: { grant: existingGrant ?? null, adminRoleGrantIds: [...adminRole.grantIds] },
      after: {
        grant: SALES_GEOGRAPHY_GRANT,
        adminRoleGrantIds: [...new Set([...adminRole.grantIds, SALES_GEOGRAPHY_GRANT.id])],
      },
      eventType: 'kernel.authorization.sales-geography-migrated.v1',
      payload: { grantId: SALES_GEOGRAPHY_GRANT.id, roleId: adminRole.id },
    },
    now,
    `audit-${SALES_GEOGRAPHY_AUTHORIZATION_MIGRATION_ID}`,
    `event-${SALES_GEOGRAPHY_AUTHORIZATION_MIGRATION_ID}`,
  );
}

/**
 * Treats CRM administration as a configuration concern rather than a side
 * effect of being able to work an opportunity. Pipeline probabilities,
 * scoring rules, campaigns, shared views, and audience segments can change
 * how every commercial user operates, so they require a governed authority.
 */
export function applyCrmConfigurationAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existingMigration = state.migrations.find(
    ({ id }) => id === CRM_CONFIGURATION_AUTHORIZATION_MIGRATION_ID,
  );
  const adminRole = state.roles.find(({ id }) => id === 'role-kernel-admin');
  const existingGrant = state.grants.find(({ id }) => id === CRM_CONFIGURATION_GRANT.id);
  const grantValid = hasExpectedGeneralLedgerGrant(existingGrant, CRM_CONFIGURATION_GRANT);
  const roleValid = hasRequiredRoleGrant(adminRole, CRM_CONFIGURATION_GRANT.id);
  if (existingMigration) {
    if (existingMigration.checksum !== CRM_CONFIGURATION_AUTHORIZATION_CHECKSUM) {
      throw new Error('CRM-configuration authorization migration evidence is invalid.');
    }
    if (!grantValid || !roleValid) {
      throw new Error('CRM-configuration authorization migration state is invalid.');
    }
    return state;
  }
  if (existingGrant && !grantValid) {
    throw new Error(`CRM-configuration authorization grant collision for ${CRM_CONFIGURATION_GRANT.id}.`);
  }
  if (!adminRole) throw new Error('CRM-configuration authorization requires the kernel-admin role.');

  const next: KernelState = {
    ...state,
    grants: [
      ...state.grants.filter(({ id }) => id !== CRM_CONFIGURATION_GRANT.id),
      { ...CRM_CONFIGURATION_GRANT, actions: [...CRM_CONFIGURATION_GRANT.actions] },
    ],
    roles: state.roles.map((role) =>
      role.id === adminRole.id && !role.grantIds.includes(CRM_CONFIGURATION_GRANT.id)
        ? { ...role, grantIds: [...role.grantIds, CRM_CONFIGURATION_GRANT.id], version: role.version + 1 }
        : role,
    ),
    migrations: [
      ...state.migrations,
      {
        id: CRM_CONFIGURATION_AUTHORIZATION_MIGRATION_ID,
        appliedAt: now,
        checksum: CRM_CONFIGURATION_AUTHORIZATION_CHECKSUM,
      },
    ],
  };
  return appendEvidence(
    state,
    next,
    {
      actorId: 'system:migration',
      action: 'authorization.crm-configuration-migrated',
      resource: 'kernel.authorization',
      resourceId: CRM_CONFIGURATION_AUTHORIZATION_MIGRATION_ID,
      reason: 'Promoted CRM pipeline, scoring, campaign, shared-view, and audience-segment configuration to governed policy.',
      before: { grant: existingGrant ?? null, adminRoleGrantIds: [...adminRole.grantIds] },
      after: {
        grant: CRM_CONFIGURATION_GRANT,
        adminRoleGrantIds: [...new Set([...adminRole.grantIds, CRM_CONFIGURATION_GRANT.id])],
      },
      eventType: 'kernel.authorization.crm-configuration-migrated.v1',
      payload: { grantId: CRM_CONFIGURATION_GRANT.id, roleId: adminRole.id },
    },
    now,
    `audit-${CRM_CONFIGURATION_AUTHORIZATION_MIGRATION_ID}`,
    `event-${CRM_CONFIGURATION_AUTHORIZATION_MIGRATION_ID}`,
  );
}

/**
 * Governs high-volume CRM ingestion independently from individual lead work.
 * The import boundary controls preview and commit of external data; commit
 * additionally checks the normal opportunity-create entitlement at the IPC
 * command, so an import governor cannot create leads by permission alone.
 */
export function applyCrmImportAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existingMigration = state.migrations.find(
    ({ id }) => id === CRM_IMPORT_AUTHORIZATION_MIGRATION_ID,
  );
  const adminRole = state.roles.find(({ id }) => id === 'role-kernel-admin');
  const existingGrant = state.grants.find(({ id }) => id === CRM_IMPORT_GRANT.id);
  const grantValid = hasExpectedGeneralLedgerGrant(existingGrant, CRM_IMPORT_GRANT);
  const roleValid = hasRequiredRoleGrant(adminRole, CRM_IMPORT_GRANT.id);
  if (existingMigration) {
    if (existingMigration.checksum !== CRM_IMPORT_AUTHORIZATION_CHECKSUM) {
      throw new Error('CRM-import authorization migration evidence is invalid.');
    }
    if (!grantValid || !roleValid) {
      throw new Error('CRM-import authorization migration state is invalid.');
    }
    return state;
  }
  if (existingGrant && !grantValid) {
    throw new Error(`CRM-import authorization grant collision for ${CRM_IMPORT_GRANT.id}.`);
  }
  if (!adminRole) throw new Error('CRM-import authorization requires the kernel-admin role.');

  const next: KernelState = {
    ...state,
    grants: [
      ...state.grants.filter(({ id }) => id !== CRM_IMPORT_GRANT.id),
      { ...CRM_IMPORT_GRANT, actions: [...CRM_IMPORT_GRANT.actions] },
    ],
    roles: state.roles.map((role) =>
      role.id === adminRole.id && !role.grantIds.includes(CRM_IMPORT_GRANT.id)
        ? { ...role, grantIds: [...role.grantIds, CRM_IMPORT_GRANT.id], version: role.version + 1 }
        : role,
    ),
    migrations: [
      ...state.migrations,
      {
        id: CRM_IMPORT_AUTHORIZATION_MIGRATION_ID,
        appliedAt: now,
        checksum: CRM_IMPORT_AUTHORIZATION_CHECKSUM,
      },
    ],
  };
  return appendEvidence(
    state,
    next,
    {
      actorId: 'system:migration',
      action: 'authorization.crm-import-migrated',
      resource: 'kernel.authorization',
      resourceId: CRM_IMPORT_AUTHORIZATION_MIGRATION_ID,
      reason: 'Promoted lead-import preview and commit authority to governed CRM import policy.',
      before: { grant: existingGrant ?? null, adminRoleGrantIds: [...adminRole.grantIds] },
      after: {
        grant: CRM_IMPORT_GRANT,
        adminRoleGrantIds: [...new Set([...adminRole.grantIds, CRM_IMPORT_GRANT.id])],
      },
      eventType: 'kernel.authorization.crm-import-migrated.v1',
      payload: { grantId: CRM_IMPORT_GRANT.id, roleId: adminRole.id },
    },
    now,
    `audit-${CRM_IMPORT_AUTHORIZATION_MIGRATION_ID}`,
    `event-${CRM_IMPORT_AUTHORIZATION_MIGRATION_ID}`,
  );
}

/**
 * Separates connector control from everyday relationship work. Only kernel
 * administration can change the state of an integration; sales users can
 * capture a communication only when their existing Party Master scope allows
 * them to work with the related account or contact.
 */
export function applyCrmCommunicationAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existingMigration = state.migrations.find(
    ({ id }) => id === CRM_COMMUNICATION_AUTHORIZATION_MIGRATION_ID,
  );
  const adminRole = state.roles.find(({ id }) => id === 'role-kernel-admin');
  const salesRole = state.roles.find(({ id }) => id === 'role-sales-operator');
  const grantsValid = CRM_COMMUNICATION_GRANTS.every((expected) =>
    hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === expected.id), expected),
  );
  const rolesValid = hasRequiredRoleGrant(adminRole, 'grant-crm-integration-governance') &&
    hasRequiredRoleGrant(salesRole, 'grant-crm-communication-capture');
  if (existingMigration) {
    if (existingMigration.checksum !== CRM_COMMUNICATION_AUTHORIZATION_CHECKSUM) {
      throw new Error('CRM-communication authorization migration evidence is invalid.');
    }
    if (!grantsValid || !rolesValid) {
      throw new Error('CRM-communication authorization migration state is invalid.');
    }
    return state;
  }
  if (!adminRole || !salesRole) {
    throw new Error('CRM-communication authorization requires kernel-admin and sales-operator roles.');
  }
  for (const expected of CRM_COMMUNICATION_GRANTS) {
    const existing = state.grants.find(({ id }) => id === expected.id);
    if (existing && !hasExpectedGeneralLedgerGrant(existing, expected)) {
      throw new Error(`CRM-communication authorization grant collision for ${expected.id}.`);
    }
  }

  const roleGrantIds = new Map([
    [adminRole.id, 'grant-crm-integration-governance'],
    [salesRole.id, 'grant-crm-communication-capture'],
  ]);
  const next: KernelState = {
    ...state,
    grants: [
      ...state.grants.filter(
        ({ id }) => !CRM_COMMUNICATION_GRANTS.some((grant) => grant.id === id),
      ),
      ...CRM_COMMUNICATION_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] })),
    ],
    roles: state.roles.map((role) => {
      const grantId = roleGrantIds.get(role.id);
      return grantId && !role.grantIds.includes(grantId)
        ? { ...role, grantIds: [...role.grantIds, grantId], version: role.version + 1 }
        : role;
    }),
    migrations: [
      ...state.migrations,
      {
        id: CRM_COMMUNICATION_AUTHORIZATION_MIGRATION_ID,
        appliedAt: now,
        checksum: CRM_COMMUNICATION_AUTHORIZATION_CHECKSUM,
      },
    ],
  };
  return appendEvidence(
    state,
    next,
    {
      actorId: 'system:migration',
      action: 'authorization.crm-communication-migrated',
      resource: 'kernel.authorization',
      resourceId: CRM_COMMUNICATION_AUTHORIZATION_MIGRATION_ID,
      reason: 'Promoted CRM connector configuration and relationship communication capture to distinct governed policies.',
      before: {
        grants: state.grants.filter(({ id }) => CRM_COMMUNICATION_GRANTS.some((grant) => grant.id === id)),
        adminRoleGrantIds: [...adminRole.grantIds],
        salesRoleGrantIds: [...salesRole.grantIds],
      },
      after: {
        grants: CRM_COMMUNICATION_GRANTS,
        adminRoleGrantIds: [...new Set([...adminRole.grantIds, 'grant-crm-integration-governance'])],
        salesRoleGrantIds: [...new Set([...salesRole.grantIds, 'grant-crm-communication-capture'])],
      },
      eventType: 'kernel.authorization.crm-communication-migrated.v1',
      payload: { roleGrantIds: Object.fromEntries(roleGrantIds) },
    },
    now,
    `audit-${CRM_COMMUNICATION_AUTHORIZATION_MIGRATION_ID}`,
    `event-${CRM_COMMUNICATION_AUTHORIZATION_MIGRATION_ID}`,
  );
}

/** Separates warehouse topology/master maintenance from stock execution. */
export function applyInventoryWarehouseAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existingMigration = state.migrations.find(({ id }) => id === INVENTORY_WAREHOUSE_AUTHORIZATION_MIGRATION_ID);
  const adminRole = state.roles.find(({ id }) => id === 'role-kernel-admin');
  const grantsValid = INVENTORY_WAREHOUSE_GRANTS.every((expected) =>
    hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === expected.id), expected),
  );
  const rolesValid = INVENTORY_WAREHOUSE_GRANTS.every((grant) => hasRequiredRoleGrant(adminRole, grant.id));
  if (existingMigration) {
    if (existingMigration.checksum !== INVENTORY_WAREHOUSE_AUTHORIZATION_CHECKSUM) throw new Error('Inventory-warehouse authorization migration evidence is invalid.');
    if (!grantsValid || !rolesValid) throw new Error('Inventory-warehouse authorization migration state is invalid.');
    return state;
  }
  if (!adminRole) throw new Error('Inventory-warehouse authorization requires the kernel-admin role.');
  for (const expected of INVENTORY_WAREHOUSE_GRANTS) {
    const existing = state.grants.find(({ id }) => id === expected.id);
    if (existing && !hasExpectedGeneralLedgerGrant(existing, expected)) throw new Error(`Inventory-warehouse authorization grant collision for ${expected.id}.`);
  }
  const next: KernelState = {
    ...state,
    grants: [...state.grants.filter(({ id }) => !INVENTORY_WAREHOUSE_GRANTS.some((grant) => grant.id === id)), ...INVENTORY_WAREHOUSE_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))],
    roles: state.roles.map((role) => role.id === adminRole.id
      ? { ...role, grantIds: [...new Set([...role.grantIds, ...INVENTORY_WAREHOUSE_GRANTS.map(({ id }) => id)])], version: role.version + 1 }
      : role),
    migrations: [...state.migrations, { id: INVENTORY_WAREHOUSE_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: INVENTORY_WAREHOUSE_AUTHORIZATION_CHECKSUM }],
  };
  return appendEvidence(state, next, {
    actorId: 'system:migration', action: 'authorization.inventory-warehouse-migrated', resource: 'kernel.authorization', resourceId: INVENTORY_WAREHOUSE_AUTHORIZATION_MIGRATION_ID,
    reason: 'Promoted inventory master data, warehouse topology, stock movement, counts, replenishment, and valuation controls to inventory policy.',
    before: { grants: state.grants.filter(({ id }) => INVENTORY_WAREHOUSE_GRANTS.some((grant) => grant.id === id)), adminRoleGrantIds: [...adminRole.grantIds] },
    after: { grants: INVENTORY_WAREHOUSE_GRANTS, adminRoleGrantIds: [...new Set([...adminRole.grantIds, ...INVENTORY_WAREHOUSE_GRANTS.map(({ id }) => id)])] },
    eventType: 'kernel.authorization.inventory-warehouse-migrated.v1', payload: { grantIds: INVENTORY_WAREHOUSE_GRANTS.map(({ id }) => id), roleId: adminRole.id },
  }, now, `audit-${INVENTORY_WAREHOUSE_AUTHORIZATION_MIGRATION_ID}`, `event-${INVENTORY_WAREHOUSE_AUTHORIZATION_MIGRATION_ID}`);
}

export function applyProcurementAuthorization(state: KernelState, now = new Date().toISOString()): KernelState {
  const existingMigration = state.migrations.find(({ id }) => id === PROCUREMENT_AUTHORIZATION_MIGRATION_ID);
  const requester = state.roles.find(({ id }) => id === 'role-procurement-requester');
  const approver = state.roles.find(({ id }) => id === 'role-finance-approver');
  const requesterGrantIds = ['grant-procurement-supplier-prepare', 'grant-procurement-sourcing-prepare', 'grant-procurement-receiving-prepare', 'grant-procurement-payable-prepare'];
  const approverGrantIds = ['grant-procurement-supplier-approve', 'grant-procurement-sourcing-approve', 'grant-procurement-receiving-approve', 'grant-procurement-payable-approve'];
  const grantsValid = PROCUREMENT_GRANTS.every((expected) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === expected.id), expected));
  const rolesValid = requesterGrantIds.every((id) => hasRequiredRoleGrant(requester, id)) && approverGrantIds.every((id) => hasRequiredRoleGrant(approver, id));
  if (existingMigration) {
    if (existingMigration.checksum !== PROCUREMENT_AUTHORIZATION_CHECKSUM) throw new Error('Procurement authorization migration evidence is invalid.');
    if (!grantsValid || !rolesValid) throw new Error('Procurement authorization migration state is invalid.');
    return state;
  }
  if (!requester || !approver) throw new Error('Procurement authorization requires requester and finance-approver roles.');
  for (const expected of PROCUREMENT_GRANTS) { const existing = state.grants.find(({ id }) => id === expected.id); if (existing && !hasExpectedGeneralLedgerGrant(existing, expected)) throw new Error(`Procurement authorization grant collision for ${expected.id}.`); }
  const next: KernelState = {
    ...state,
    grants: [...state.grants.filter(({ id }) => !PROCUREMENT_GRANTS.some((grant) => grant.id === id)), ...PROCUREMENT_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))],
    roles: state.roles.map((role) => role.id === requester.id ? { ...role, grantIds: [...new Set([...role.grantIds, ...requesterGrantIds])], version: role.version + 1 } : role.id === approver.id ? { ...role, grantIds: [...new Set([...role.grantIds, ...approverGrantIds])], version: role.version + 1 } : role),
    migrations: [...state.migrations, { id: PROCUREMENT_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: PROCUREMENT_AUTHORIZATION_CHECKSUM }],
  };
  return appendEvidence(state, next, { actorId: 'system:migration', action: 'authorization.procurement-migrated', resource: 'kernel.authorization', resourceId: PROCUREMENT_AUTHORIZATION_MIGRATION_ID, reason: 'Promoted supplier, sourcing, receiving, and AP evidence into independent procurement maker/checker policies.', before: { grants: state.grants.filter(({ id }) => PROCUREMENT_GRANTS.some((grant) => grant.id === id)) }, after: { grants: PROCUREMENT_GRANTS }, eventType: 'kernel.authorization.procurement-migrated.v1', payload: { requesterGrantIds, approverGrantIds } }, now, `audit-${PROCUREMENT_AUTHORIZATION_MIGRATION_ID}`, `event-${PROCUREMENT_AUTHORIZATION_MIGRATION_ID}`);
}

export function applyManufacturingAuthorization(state: KernelState, now = new Date().toISOString()): KernelState {
  const existing = state.migrations.find(({ id }) => id === MANUFACTURING_AUTHORIZATION_MIGRATION_ID);
  const production = state.roles.find(({ id }) => id === 'role-production-operator');
  const quality = state.roles.find(({ id }) => id === 'role-quality-controller');
  const grantsValid = MANUFACTURING_GRANTS.every((grant) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant));
  if (existing) { if (existing.checksum !== MANUFACTURING_AUTHORIZATION_CHECKSUM || !production || !quality || !grantsValid) throw new Error('Manufacturing authorization migration state is invalid.'); return state; }
  if (state.roles.some(({ id }) => ['role-production-operator', 'role-quality-controller'].includes(id))) throw new Error('Manufacturing authorization role collision.');
  const next: KernelState = {
    ...state,
    grants: [...state.grants, ...MANUFACTURING_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))],
    roles: [...state.roles,
      { id: 'role-production-operator', name: 'Production operator', description: 'Maintains manufacturing engineering and executes released production.', grantIds: ['grant-manufacturing-engineering', 'grant-manufacturing-execution', 'grant-manufacturing-quality-record'], system: false, version: 1 },
      { id: 'role-quality-controller', name: 'Quality controller', description: 'Independently releases manufacturing controls and resolves nonconformance.', grantIds: ['grant-manufacturing-quality-approve', 'grant-manufacturing-release'], system: false, version: 1 }],
    users: state.users.map((user) => user.id === 'user-avery' ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-production-operator'])], version: user.version + 1 } : user.id === 'user-lee' ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-quality-controller'])], version: user.version + 1 } : user),
    migrations: [...state.migrations, { id: MANUFACTURING_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: MANUFACTURING_AUTHORIZATION_CHECKSUM }],
  };
  return appendEvidence(state, next, { actorId: 'system:migration', action: 'authorization.manufacturing-migrated', resource: 'kernel.authorization', resourceId: MANUFACTURING_AUTHORIZATION_MIGRATION_ID, reason: 'Created independent production and quality roles for governed manufacturing execution.', before: null, after: { roles: ['role-production-operator', 'role-quality-controller'] }, eventType: 'kernel.authorization.manufacturing-migrated.v1' }, now, `audit-${MANUFACTURING_AUTHORIZATION_MIGRATION_ID}`, `event-${MANUFACTURING_AUTHORIZATION_MIGRATION_ID}`);
}

export function applyDeliveryAuthorization(state: KernelState, now = new Date().toISOString()): KernelState {
  const existing = state.migrations.find(({ id }) => id === DELIVERY_AUTHORIZATION_MIGRATION_ID);
  const grantsValid = DELIVERY_GRANTS.every((grant) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant));
  const operator = state.roles.find(({ id }) => id === 'role-delivery-operator'); const controller = state.roles.find(({ id }) => id === 'role-service-controller');
  if (existing) { if (existing.checksum !== DELIVERY_AUTHORIZATION_CHECKSUM || !grantsValid || !operator || !controller) throw new Error('Delivery authorization migration state is invalid.'); return state; }
  if (operator || controller) throw new Error('Delivery authorization role collision.');
  const next: KernelState = {
    ...state, grants: [...state.grants, ...DELIVERY_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))],
    roles: [...state.roles,
      { id: 'role-delivery-operator', name: 'Delivery operator', description: 'Operates projects, task delivery, time, service, and field work.', grantIds: ['grant-delivery-project-operate', 'grant-delivery-service-operate'], system: false, version: 1 },
      { id: 'role-service-controller', name: 'Service controller', description: 'Independently activates projects and service agreements.', grantIds: ['grant-delivery-project-approve', 'grant-delivery-service-approve'], system: false, version: 1 }],
    users: state.users.map((user) => user.id === 'user-avery' ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-delivery-operator'])], version: user.version + 1 } : user.id === 'user-lee' ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-service-controller'])], version: user.version + 1 } : user),
    migrations: [...state.migrations, { id: DELIVERY_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: DELIVERY_AUTHORIZATION_CHECKSUM }],
  };
  return appendEvidence(state, next, { actorId: 'system:migration', action: 'authorization.delivery-migrated', resource: 'kernel.authorization', resourceId: DELIVERY_AUTHORIZATION_MIGRATION_ID, reason: 'Created delivery and service-controller roles for governed project and field-service execution.', before: null, after: { roles: ['role-delivery-operator', 'role-service-controller'] }, eventType: 'kernel.authorization.delivery-migrated.v1' }, now, `audit-${DELIVERY_AUTHORIZATION_MIGRATION_ID}`, `event-${DELIVERY_AUTHORIZATION_MIGRATION_ID}`);
}

export function applyWorkforceAuthorization(state: KernelState, now = new Date().toISOString()): KernelState {
  const existing = state.migrations.find(({ id }) => id === WORKFORCE_AUTHORIZATION_MIGRATION_ID);
  const grantsValid = WORKFORCE_GRANTS.every((grant) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant));
  if (existing) { if (existing.checksum !== WORKFORCE_AUTHORIZATION_CHECKSUM || !grantsValid) throw new Error('Workforce authorization migration state is invalid.'); return state; }
  if (state.roles.some(({ id }) => ['role-workforce-member', 'role-workforce-coordinator', 'role-workforce-reviewer'].includes(id))) throw new Error('Workforce authorization role collision.');
  const next: KernelState = { ...state, grants: [...state.grants, ...WORKFORCE_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))], roles: [...state.roles,
    { id: 'role-workforce-member', name: 'Workforce member', description: 'Submits personal availability exceptions.', grantIds: ['grant-workforce-availability-submit'], system: false, version: 1 },
    { id: 'role-workforce-coordinator', name: 'Workforce coordinator', description: 'Prepares workforce profiles and delivery allocations.', grantIds: ['grant-workforce-profile-prepare', 'grant-workforce-allocation-operate'], system: false, version: 1 },
    { id: 'role-workforce-reviewer', name: 'Workforce reviewer', description: 'Independently approves workforce profile and availability changes.', grantIds: ['grant-workforce-profile-approve', 'grant-workforce-availability-approve'], system: false, version: 1 }],
    users: state.users.map((user) => ({ ...user, roleIds: [...new Set([...user.roleIds, 'role-workforce-member', ...(user.id === 'user-avery' ? ['role-workforce-coordinator'] : user.id === 'user-lee' ? ['role-workforce-reviewer'] : [])])], version: user.version + 1 })), migrations: [...state.migrations, { id: WORKFORCE_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: WORKFORCE_AUTHORIZATION_CHECKSUM }] };
  return appendEvidence(state, next, { actorId: 'system:migration', action: 'authorization.workforce-migrated', resource: 'kernel.authorization', resourceId: WORKFORCE_AUTHORIZATION_MIGRATION_ID, reason: 'Created member, coordinator, and reviewer workforce boundaries.', before: null, after: { roles: ['role-workforce-member', 'role-workforce-coordinator', 'role-workforce-reviewer'] }, eventType: 'kernel.authorization.workforce-migrated.v1' }, now, `audit-${WORKFORCE_AUTHORIZATION_MIGRATION_ID}`, `event-${WORKFORCE_AUTHORIZATION_MIGRATION_ID}`);
}

/**
 * Separates physical installed-asset stewardship, finance activation, and
 * maintenance execution. Domain-level maker/checker checks remain the final
 * control; these roles keep the normal operating paths distinct as well.
 */
export function applyAssetMaintenanceAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existing = state.migrations.find(({ id }) => id === ASSET_MAINTENANCE_AUTHORIZATION_MIGRATION_ID);
  const roleIds = ['role-asset-steward', 'role-asset-controller', 'role-maintenance-technician'];
  const [steward, controller, technician] = roleIds.map((id) => state.roles.find((role) => role.id === id));
  const grantsValid = ASSET_MAINTENANCE_GRANTS.every((grant) =>
    hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant),
  );
  const rolesValid = Boolean(steward && controller && technician) &&
    hasRequiredRoleGrant(steward, 'grant-asset-category-maintain') &&
    hasRequiredRoleGrant(steward, 'grant-asset-register-maintain') &&
    hasRequiredRoleGrant(steward, 'grant-maintenance-plan-maintain') &&
    hasRequiredRoleGrant(steward, 'grant-maintenance-work-order-schedule') &&
    hasRequiredRoleGrant(controller, 'grant-asset-register-approve') &&
    hasRequiredRoleGrant(controller, 'grant-maintenance-work-order-verify') &&
    hasRequiredRoleGrant(technician, 'grant-maintenance-work-order-execute');
  if (existing) {
    if (existing.checksum !== ASSET_MAINTENANCE_AUTHORIZATION_CHECKSUM || !grantsValid || !rolesValid) {
      throw new Error('Asset-maintenance authorization migration state is invalid.');
    }
    return state;
  }
  if (state.roles.some(({ id }) => roleIds.includes(id))) {
    throw new Error('Asset-maintenance authorization role collision.');
  }
  for (const expected of ASSET_MAINTENANCE_GRANTS) {
    const candidate = state.grants.find(({ id }) => id === expected.id);
    if (candidate && !hasExpectedGeneralLedgerGrant(candidate, expected)) {
      throw new Error(`Asset-maintenance authorization grant collision for ${expected.id}.`);
    }
  }
  const next: KernelState = {
    ...state,
    grants: [
      ...state.grants,
      ...ASSET_MAINTENANCE_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] })),
    ],
    roles: [
      ...state.roles,
      {
        id: 'role-asset-steward',
        name: 'Asset steward',
        description: 'Maintains controlled installed-asset records and preventive maintenance plans.',
        grantIds: [
          'grant-asset-category-maintain',
          'grant-asset-register-maintain',
          'grant-maintenance-plan-maintain',
          'grant-maintenance-work-order-schedule',
        ],
        system: false,
        version: 1,
      },
      {
        id: 'role-asset-controller',
        name: 'Asset controller',
        description: 'Independently activates installed assets and verifies controlled maintenance work.',
        grantIds: ['grant-asset-register-approve', 'grant-maintenance-work-order-verify'],
        system: false,
        version: 1,
      },
      {
        id: 'role-maintenance-technician',
        name: 'Maintenance technician',
        description: 'Executes assigned preventive maintenance work and records completion evidence.',
        grantIds: ['grant-maintenance-work-order-execute'],
        system: false,
        version: 1,
      },
    ],
    users: state.users.map((user) => user.id === 'user-avery'
      ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-asset-steward'])], version: user.version + 1 }
      : user.id === 'user-priya'
        ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-asset-controller'])], version: user.version + 1 }
        : user.id === 'user-lee'
          ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-maintenance-technician'])], version: user.version + 1 }
          : user),
    migrations: [
      ...state.migrations,
      {
        id: ASSET_MAINTENANCE_AUTHORIZATION_MIGRATION_ID,
        appliedAt: now,
        checksum: ASSET_MAINTENANCE_AUTHORIZATION_CHECKSUM,
      },
    ],
  };
  return appendEvidence(
    state,
    next,
    {
      actorId: 'system:migration',
      action: 'authorization.asset-maintenance-migrated',
      resource: 'kernel.authorization',
      resourceId: ASSET_MAINTENANCE_AUTHORIZATION_MIGRATION_ID,
      reason: 'Created independent installed-asset, maintenance scheduling, execution, and verification authorization boundaries.',
      before: null,
      after: { roles: roleIds, grants: ASSET_MAINTENANCE_GRANTS.map(({ id }) => id) },
      eventType: 'kernel.authorization.asset-maintenance-migrated.v1',
      payload: { roleIds, grantIds: ASSET_MAINTENANCE_GRANTS.map(({ id }) => id) },
    },
    now,
    `audit-${ASSET_MAINTENANCE_AUTHORIZATION_MIGRATION_ID}`,
    `event-${ASSET_MAINTENANCE_AUTHORIZATION_MIGRATION_ID}`,
  );
}

/**
 * Adds a narrow maker/checker boundary for the procurement-to-fixed-assets
 * handoff. Journal preparation and posting remain under the existing ledger
 * permissions, so no capitalisation approver can silently post their own
 * accounting entry.
 */
export function applyAssetCapitalizationAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existing = state.migrations.find(({ id }) => id === ASSET_CAPITALIZATION_AUTHORIZATION_MIGRATION_ID);
  const roleIds = ['role-asset-capitalization-maker', 'role-asset-capitalization-approver'];
  const [maker, approver] = roleIds.map((id) => state.roles.find((role) => role.id === id));
  const grantsValid = ASSET_CAPITALIZATION_GRANTS.every((grant) =>
    hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant),
  );
  const rolesValid = Boolean(maker && approver) &&
    hasRequiredRoleGrant(maker, 'grant-asset-capitalization-submit') &&
    hasRequiredRoleGrant(approver, 'grant-asset-capitalization-approve');
  if (existing) {
    if (existing.checksum !== ASSET_CAPITALIZATION_AUTHORIZATION_CHECKSUM || !grantsValid || !rolesValid) {
      throw new Error('Asset-capitalisation authorization migration state is invalid.');
    }
    return state;
  }
  if (state.roles.some(({ id }) => roleIds.includes(id))) {
    throw new Error('Asset-capitalisation authorization role collision.');
  }
  for (const expected of ASSET_CAPITALIZATION_GRANTS) {
    const candidate = state.grants.find(({ id }) => id === expected.id);
    if (candidate && !hasExpectedGeneralLedgerGrant(candidate, expected)) {
      throw new Error(`Asset-capitalisation authorization grant collision for ${expected.id}.`);
    }
  }
  const next: KernelState = {
    ...state,
    grants: [...state.grants, ...ASSET_CAPITALIZATION_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))],
    roles: [
      ...state.roles,
      { id: 'role-asset-capitalization-maker', name: 'Asset capitalisation maker', description: 'Submits controlled procurement-to-fixed-asset capitalisation requests.', grantIds: ['grant-asset-capitalization-submit'], system: false, version: 1 },
      { id: 'role-asset-capitalization-approver', name: 'Asset capitalisation approver', description: 'Independently approves or rejects controlled fixed-asset capitalisation requests.', grantIds: ['grant-asset-capitalization-approve'], system: false, version: 1 },
    ],
    users: state.users.map((user) => user.id === 'user-avery'
      ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-asset-capitalization-maker'])], version: user.version + 1 }
      : user.id === 'user-priya'
        ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-asset-capitalization-approver'])], version: user.version + 1 }
        : user),
    migrations: [...state.migrations, { id: ASSET_CAPITALIZATION_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: ASSET_CAPITALIZATION_AUTHORIZATION_CHECKSUM }],
  };
  return appendEvidence(state, next, {
    actorId: 'system:migration', action: 'authorization.asset-capitalization-migrated', resource: 'kernel.authorization', resourceId: ASSET_CAPITALIZATION_AUTHORIZATION_MIGRATION_ID,
    reason: 'Created independent procurement-to-fixed-asset capitalisation maker and approver boundaries.', before: null,
    after: { roles: roleIds, grants: ASSET_CAPITALIZATION_GRANTS.map(({ id }) => id) }, eventType: 'kernel.authorization.asset-capitalization-migrated.v1',
    payload: { roleIds, grantIds: ASSET_CAPITALIZATION_GRANTS.map(({ id }) => id) },
  }, now, `audit-${ASSET_CAPITALIZATION_AUTHORIZATION_MIGRATION_ID}`, `event-${ASSET_CAPITALIZATION_AUTHORIZATION_MIGRATION_ID}`);
}

/**
 * Separates accounting assumptions and monthly depreciation proposals from
 * their approval. Canonical journal preparation/posting remain guarded by
 * finance.journal, preventing this role from writing the ledger directly.
 */
export function applyAssetDepreciationAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existing = state.migrations.find(({ id }) => id === ASSET_DEPRECIATION_AUTHORIZATION_MIGRATION_ID);
  const roleIds = ['role-asset-depreciation-maker', 'role-asset-depreciation-approver'];
  const [maker, approver] = roleIds.map((id) => state.roles.find((role) => role.id === id));
  const grantsValid = ASSET_DEPRECIATION_GRANTS.every((grant) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant));
  const rolesValid = Boolean(maker && approver) &&
    hasRequiredRoleGrant(maker, 'grant-asset-depreciation-policy-maintain') &&
    hasRequiredRoleGrant(maker, 'grant-asset-depreciation-run-maintain') &&
    hasRequiredRoleGrant(approver, 'grant-asset-depreciation-policy-approve') &&
    hasRequiredRoleGrant(approver, 'grant-asset-depreciation-run-approve');
  if (existing) {
    if (existing.checksum !== ASSET_DEPRECIATION_AUTHORIZATION_CHECKSUM || !grantsValid || !rolesValid) {
      throw new Error('Asset-depreciation authorization migration state is invalid.');
    }
    return state;
  }
  if (state.roles.some(({ id }) => roleIds.includes(id))) throw new Error('Asset-depreciation authorization role collision.');
  for (const expected of ASSET_DEPRECIATION_GRANTS) {
    const candidate = state.grants.find(({ id }) => id === expected.id);
    if (candidate && !hasExpectedGeneralLedgerGrant(candidate, expected)) throw new Error(`Asset-depreciation authorization grant collision for ${expected.id}.`);
  }
  const next: KernelState = {
    ...state,
    grants: [...state.grants, ...ASSET_DEPRECIATION_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))],
    roles: [
      ...state.roles,
      { id: 'role-asset-depreciation-maker', name: 'Asset depreciation maker', description: 'Maintains effective-dated asset policies and submits monthly depreciation proposals.', grantIds: ['grant-asset-depreciation-policy-maintain', 'grant-asset-depreciation-run-maintain'], system: false, version: 1 },
      { id: 'role-asset-depreciation-approver', name: 'Asset depreciation approver', description: 'Independently approves fixed-asset policies and monthly depreciation proposals.', grantIds: ['grant-asset-depreciation-policy-approve', 'grant-asset-depreciation-run-approve'], system: false, version: 1 },
    ],
    users: state.users.map((user) => user.id === 'user-avery'
      ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-asset-depreciation-maker'])], version: user.version + 1 }
      : user.id === 'user-priya'
        ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-asset-depreciation-approver'])], version: user.version + 1 }
        : user),
    migrations: [...state.migrations, { id: ASSET_DEPRECIATION_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: ASSET_DEPRECIATION_AUTHORIZATION_CHECKSUM }],
  };
  return appendEvidence(state, next, {
    actorId: 'system:migration', action: 'authorization.asset-depreciation-migrated', resource: 'kernel.authorization', resourceId: ASSET_DEPRECIATION_AUTHORIZATION_MIGRATION_ID,
    reason: 'Created independent fixed-asset policy and depreciation-run maker/checker boundaries.', before: null,
    after: { roles: roleIds, grants: ASSET_DEPRECIATION_GRANTS.map(({ id }) => id) }, eventType: 'kernel.authorization.asset-depreciation-migrated.v1',
    payload: { roleIds, grantIds: ASSET_DEPRECIATION_GRANTS.map(({ id }) => id) },
  }, now, `audit-${ASSET_DEPRECIATION_AUTHORIZATION_MIGRATION_ID}`, `event-${ASSET_DEPRECIATION_AUTHORIZATION_MIGRATION_ID}`);
}

/**
 * Separates loss-bearing fixed-asset retirement from both depreciation policy
 * maintenance and canonical journal preparation. The ledger retains its own
 * maker/checker boundary; this migration controls only the source event.
 */
export function applyAssetRetirementAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existing = state.migrations.find(({ id }) => id === ASSET_RETIREMENT_AUTHORIZATION_MIGRATION_ID);
  const roleIds = ['role-asset-retirement-maker', 'role-asset-retirement-approver'];
  const [maker, approver] = roleIds.map((id) => state.roles.find((role) => role.id === id));
  const grantsValid = ASSET_RETIREMENT_GRANTS.every((grant) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant));
  const rolesValid = Boolean(maker && approver) &&
    hasRequiredRoleGrant(maker, 'grant-asset-retirement-submit') &&
    hasRequiredRoleGrant(approver, 'grant-asset-retirement-approve');
  if (existing) {
    if (existing.checksum !== ASSET_RETIREMENT_AUTHORIZATION_CHECKSUM || !grantsValid || !rolesValid) {
      throw new Error('Asset-retirement authorization migration state is invalid.');
    }
    return state;
  }
  if (state.roles.some(({ id }) => roleIds.includes(id))) throw new Error('Asset-retirement authorization role collision.');
  for (const expected of ASSET_RETIREMENT_GRANTS) {
    const candidate = state.grants.find(({ id }) => id === expected.id);
    if (candidate && !hasExpectedGeneralLedgerGrant(candidate, expected)) throw new Error(`Asset-retirement authorization grant collision for ${expected.id}.`);
  }
  const next: KernelState = {
    ...state,
    grants: [...state.grants, ...ASSET_RETIREMENT_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))],
    roles: [
      ...state.roles,
      { id: 'role-asset-retirement-maker', name: 'Asset retirement maker', description: 'Submits no-proceeds retirement evidence using the reconciled fixed-asset book.', grantIds: ['grant-asset-retirement-submit'], system: false, version: 1 },
      { id: 'role-asset-retirement-approver', name: 'Asset retirement approver', description: 'Independently approves no-proceeds fixed-asset retirement events and completion.', grantIds: ['grant-asset-retirement-approve'], system: false, version: 1 },
    ],
    users: state.users.map((user) => user.id === 'user-avery'
      ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-asset-retirement-maker'])], version: user.version + 1 }
      : user.id === 'user-priya'
        ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-asset-retirement-approver'])], version: user.version + 1 }
        : user),
    migrations: [...state.migrations, { id: ASSET_RETIREMENT_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: ASSET_RETIREMENT_AUTHORIZATION_CHECKSUM }],
  };
  return appendEvidence(state, next, {
    actorId: 'system:migration', action: 'authorization.asset-retirement-migrated', resource: 'kernel.authorization', resourceId: ASSET_RETIREMENT_AUTHORIZATION_MIGRATION_ID,
    reason: 'Created independent no-proceeds fixed-asset retirement maker/checker boundaries.', before: null,
    after: { roles: roleIds, grants: ASSET_RETIREMENT_GRANTS.map(({ id }) => id) }, eventType: 'kernel.authorization.asset-retirement-migrated.v1',
    payload: { roleIds, grantIds: ASSET_RETIREMENT_GRANTS.map(({ id }) => id) },
  }, now, `audit-${ASSET_RETIREMENT_AUTHORIZATION_MIGRATION_ID}`, `event-${ASSET_RETIREMENT_AUTHORIZATION_MIGRATION_ID}`);
}

/**
 * Separates source custody request, independent release, and destination
 * receipt. The record is operational only: accounting transfer boundaries
 * remain a later financial-control slice.
 */
export function applyAssetCustodyTransferAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existing = state.migrations.find(({ id }) => id === ASSET_CUSTODY_TRANSFER_AUTHORIZATION_MIGRATION_ID);
  const roleIds = ['role-asset-custody-transfer-maker', 'role-asset-custody-transfer-approver', 'role-asset-custody-transfer-receiver'];
  const [maker, approver, receiver] = roleIds.map((id) => state.roles.find((role) => role.id === id));
  const grantsValid = ASSET_CUSTODY_TRANSFER_GRANTS.every((grant) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant));
  const rolesValid = Boolean(maker && approver && receiver) &&
    hasRequiredRoleGrant(maker, 'grant-asset-custody-transfer-submit') &&
    hasRequiredRoleGrant(approver, 'grant-asset-custody-transfer-approve') &&
    hasRequiredRoleGrant(receiver, 'grant-asset-custody-transfer-receive');
  if (existing) {
    if (existing.checksum !== ASSET_CUSTODY_TRANSFER_AUTHORIZATION_CHECKSUM || !grantsValid || !rolesValid) {
      throw new Error('Asset-custody-transfer authorization migration state is invalid.');
    }
    return state;
  }
  if (state.roles.some(({ id }) => roleIds.includes(id))) throw new Error('Asset-custody-transfer authorization role collision.');
  for (const expected of ASSET_CUSTODY_TRANSFER_GRANTS) {
    const candidate = state.grants.find(({ id }) => id === expected.id);
    if (candidate && !hasExpectedGeneralLedgerGrant(candidate, expected)) {
      throw new Error(`Asset-custody-transfer authorization grant collision for ${expected.id}.`);
    }
  }
  const next: KernelState = {
    ...state,
    grants: [...state.grants, ...ASSET_CUSTODY_TRANSFER_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))],
    roles: [
      ...state.roles,
      { id: 'role-asset-custody-transfer-maker', name: 'Asset transfer maker', description: 'Submits within-branch asset custody transfer evidence from the current source location.', grantIds: ['grant-asset-custody-transfer-submit'], system: false, version: 1 },
      { id: 'role-asset-custody-transfer-approver', name: 'Asset transfer approver', description: 'Independently releases controlled within-branch asset custody transfers.', grantIds: ['grant-asset-custody-transfer-approve'], system: false, version: 1 },
      { id: 'role-asset-custody-transfer-receiver', name: 'Asset transfer receiver', description: 'Receives approved assets at the frozen destination and confirms custody evidence.', grantIds: ['grant-asset-custody-transfer-receive'], system: false, version: 1 },
    ],
    users: state.users.map((user) => user.id === 'user-avery'
      ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-asset-custody-transfer-maker'])], version: user.version + 1 }
      : user.id === 'user-priya'
        ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-asset-custody-transfer-approver'])], version: user.version + 1 }
        : user.id === 'user-lee'
          ? { ...user, roleIds: [...new Set([...user.roleIds, 'role-asset-custody-transfer-receiver'])], version: user.version + 1 }
          : user),
    migrations: [...state.migrations, { id: ASSET_CUSTODY_TRANSFER_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: ASSET_CUSTODY_TRANSFER_AUTHORIZATION_CHECKSUM }],
  };
  return appendEvidence(state, next, {
    actorId: 'system:migration', action: 'authorization.asset-custody-transfer-migrated', resource: 'kernel.authorization', resourceId: ASSET_CUSTODY_TRANSFER_AUTHORIZATION_MIGRATION_ID,
    reason: 'Created maker, approver, and destination-receiver boundaries for controlled asset custody transfers.', before: null,
    after: { roles: roleIds, grants: ASSET_CUSTODY_TRANSFER_GRANTS.map(({ id }) => id) }, eventType: 'kernel.authorization.asset-custody-transfer-migrated.v1',
    payload: { roleIds, grantIds: ASSET_CUSTODY_TRANSFER_GRANTS.map(({ id }) => id) },
  }, now, `audit-${ASSET_CUSTODY_TRANSFER_AUTHORIZATION_MIGRATION_ID}`, `event-${ASSET_CUSTODY_TRANSFER_AUTHORIZATION_MIGRATION_ID}`);
}

export function applyAssetComponentizationAuthorization(
  state: KernelState,
  now = new Date().toISOString(),
): KernelState {
  const existing = state.migrations.find(({ id }) => id === ASSET_COMPONENTIZATION_AUTHORIZATION_MIGRATION_ID);
  const roleIds = ['role-asset-componentization-maker', 'role-asset-componentization-approver'];
  const [maker, approver] = roleIds.map((id) => state.roles.find((role) => role.id === id));
  const grantsValid = ASSET_COMPONENTIZATION_GRANTS.every((grant) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant));
  const rolesValid = Boolean(maker && approver) && hasRequiredRoleGrant(maker, 'grant-asset-componentization-submit') && hasRequiredRoleGrant(approver, 'grant-asset-componentization-approve');
  if (existing) {
    if (existing.checksum !== ASSET_COMPONENTIZATION_AUTHORIZATION_CHECKSUM || !grantsValid || !rolesValid) throw new Error('Asset-componentization authorization migration state is invalid.');
    return state;
  }
  if (state.roles.some(({ id }) => roleIds.includes(id))) throw new Error('Asset-componentization authorization role collision.');
  const next: KernelState = {
    ...state,
    grants: [...state.grants, ...ASSET_COMPONENTIZATION_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))],
    roles: [
      ...state.roles,
      { id: roleIds[0]!, name: 'Asset componentization maker', description: 'Submits physical component identity and evidence for an installed asset.', grantIds: ['grant-asset-componentization-submit'], system: false, version: 1 },
      { id: roleIds[1]!, name: 'Asset componentization approver', description: 'Independently approves physical component identity evidence.', grantIds: ['grant-asset-componentization-approve'], system: false, version: 1 },
    ],
    users: state.users.map((user) => user.id === 'user-avery'
      ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[0]!])], version: user.version + 1 }
      : user.id === 'user-priya'
        ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[1]!])], version: user.version + 1 }
        : user),
    migrations: [...state.migrations, { id: ASSET_COMPONENTIZATION_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: ASSET_COMPONENTIZATION_AUTHORIZATION_CHECKSUM }],
  };
  return appendEvidence(state, next, {
    actorId: 'system:migration', action: 'authorization.asset-componentization-migrated', resource: 'kernel.authorization', resourceId: ASSET_COMPONENTIZATION_AUTHORIZATION_MIGRATION_ID,
    reason: 'Created maker and approver boundaries for physical asset componentization.', before: null,
    after: { roles: roleIds, grants: ASSET_COMPONENTIZATION_GRANTS.map(({ id }) => id) }, eventType: 'kernel.authorization.asset-componentization-migrated.v1', payload: { roleIds, grantIds: ASSET_COMPONENTIZATION_GRANTS.map(({ id }) => id) },
  }, now, `audit-${ASSET_COMPONENTIZATION_AUTHORIZATION_MIGRATION_ID}`, `event-${ASSET_COMPONENTIZATION_AUTHORIZATION_MIGRATION_ID}`);
}

export function applyAssetComponentAllocationAuthorization(state: KernelState, now = new Date().toISOString()): KernelState {
  const existing = state.migrations.find(({ id }) => id === ASSET_COMPONENT_ALLOCATION_AUTHORIZATION_MIGRATION_ID);
  const roleIds = ['role-asset-component-allocation-maker', 'role-asset-component-allocation-approver'];
  const [maker, approver] = roleIds.map((id) => state.roles.find((role) => role.id === id));
  const grantsValid = ASSET_COMPONENT_ALLOCATION_GRANTS.every((grant) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant));
  const rolesValid = Boolean(maker && approver) && hasRequiredRoleGrant(maker, 'grant-asset-component-allocation-submit') && hasRequiredRoleGrant(approver, 'grant-asset-component-allocation-approve');
  if (existing) {
    if (existing.checksum !== ASSET_COMPONENT_ALLOCATION_AUTHORIZATION_CHECKSUM || !grantsValid || !rolesValid) throw new Error('Asset-component-allocation authorization migration state is invalid.');
    return state;
  }
  if (state.roles.some(({ id }) => roleIds.includes(id))) throw new Error('Asset-component-allocation authorization role collision.');
  const next: KernelState = {
    ...state,
    grants: [...state.grants, ...ASSET_COMPONENT_ALLOCATION_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))],
    roles: [...state.roles,
      { id: roleIds[0]!, name: 'Asset component allocation maker', description: 'Proposes reconciled component cost attribution.', grantIds: ['grant-asset-component-allocation-submit'], system: false, version: 1 },
      { id: roleIds[1]!, name: 'Asset component allocation approver', description: 'Independently approves component cost attribution.', grantIds: ['grant-asset-component-allocation-approve'], system: false, version: 1 }],
    users: state.users.map((user) => user.id === 'user-avery'
      ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[0]!])], version: user.version + 1 }
      : user.id === 'user-priya'
        ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[1]!])], version: user.version + 1 }
        : user),
    migrations: [...state.migrations, { id: ASSET_COMPONENT_ALLOCATION_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: ASSET_COMPONENT_ALLOCATION_AUTHORIZATION_CHECKSUM }],
  };
  return appendEvidence(state, next, {
    actorId: 'system:migration', action: 'authorization.asset-component-allocation-migrated', resource: 'kernel.authorization', resourceId: ASSET_COMPONENT_ALLOCATION_AUTHORIZATION_MIGRATION_ID,
    reason: 'Created maker and approver boundaries for component cost attribution.', before: null,
    after: { roles: roleIds, grants: ASSET_COMPONENT_ALLOCATION_GRANTS.map(({ id }) => id) }, eventType: 'kernel.authorization.asset-component-allocation-migrated.v1', payload: { roleIds, grantIds: ASSET_COMPONENT_ALLOCATION_GRANTS.map(({ id }) => id) },
  }, now, `audit-${ASSET_COMPONENT_ALLOCATION_AUTHORIZATION_MIGRATION_ID}`, `event-${ASSET_COMPONENT_ALLOCATION_AUTHORIZATION_MIGRATION_ID}`);
}

export function applyAssetTransferAccountingAuthorization(state: KernelState, now = new Date().toISOString()): KernelState {
  const existing = state.migrations.find(({ id }) => id === ASSET_TRANSFER_ACCOUNTING_AUTHORIZATION_MIGRATION_ID);
  const roleIds = ['role-asset-transfer-accounting-maker', 'role-asset-transfer-accounting-approver', 'role-asset-transfer-accounting-logistics'];
  const [maker, approver, logistics] = roleIds.map((id) => state.roles.find((role) => role.id === id));
  const grantsValid = ASSET_TRANSFER_ACCOUNTING_GRANTS.every((grant) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant));
  const rolesValid = Boolean(maker && approver && logistics) && hasRequiredRoleGrant(maker, 'grant-asset-transfer-accounting-submit') && hasRequiredRoleGrant(approver, 'grant-asset-transfer-accounting-approve') && hasRequiredRoleGrant(logistics, 'grant-asset-transfer-accounting-move');
  if (existing) {
    if (existing.checksum !== ASSET_TRANSFER_ACCOUNTING_AUTHORIZATION_CHECKSUM || !grantsValid || !rolesValid) throw new Error('Asset-transfer accounting authorization migration state is invalid.');
    return state;
  }
  if (state.roles.some(({ id }) => roleIds.includes(id))) throw new Error('Asset-transfer accounting authorization role collision.');
  const next: KernelState = {
    ...state,
    grants: [...state.grants, ...ASSET_TRANSFER_ACCOUNTING_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))],
    roles: [...state.roles,
      { id: roleIds[0]!, name: 'Asset transfer accounting maker', description: 'Submits cross-branch asset book and destination evidence.', grantIds: ['grant-asset-transfer-accounting-submit'], system: false, version: 1 },
      { id: roleIds[1]!, name: 'Asset transfer accounting approver', description: 'Approves the frozen source book and transfer handoff.', grantIds: ['grant-asset-transfer-accounting-approve'], system: false, version: 1 },
      { id: roleIds[2]!, name: 'Asset transfer logistics', description: 'Dispatches and receives a released inter-branch asset.', grantIds: ['grant-asset-transfer-accounting-move'], system: false, version: 1 }],
    users: state.users.map((user) => user.id === 'user-avery'
      ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[0]!])], version: user.version + 1 }
      : user.id === 'user-priya'
        ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[1]!])], version: user.version + 1 }
        : user.id === 'user-lee'
          ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[2]!])], version: user.version + 1 }
          : user),
    migrations: [...state.migrations, { id: ASSET_TRANSFER_ACCOUNTING_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: ASSET_TRANSFER_ACCOUNTING_AUTHORIZATION_CHECKSUM }],
  };
  return appendEvidence(state, next, { actorId: 'system:migration', action: 'authorization.asset-transfer-accounting-migrated', resource: 'kernel.authorization', resourceId: ASSET_TRANSFER_ACCOUNTING_AUTHORIZATION_MIGRATION_ID, reason: 'Created maker, approver, and logistics boundaries for inter-branch asset accounting.', before: null, after: { roles: roleIds, grants: ASSET_TRANSFER_ACCOUNTING_GRANTS.map(({ id }) => id) }, eventType: 'kernel.authorization.asset-transfer-accounting-migrated.v1', payload: { roleIds, grantIds: ASSET_TRANSFER_ACCOUNTING_GRANTS.map(({ id }) => id) } }, now, `audit-${ASSET_TRANSFER_ACCOUNTING_AUTHORIZATION_MIGRATION_ID}`, `event-${ASSET_TRANSFER_ACCOUNTING_AUTHORIZATION_MIGRATION_ID}`);
}

export function applyAssetSaleDisposalAuthorization(state: KernelState, now = new Date().toISOString()): KernelState {
  const existing = state.migrations.find(({ id }) => id === ASSET_SALE_DISPOSAL_AUTHORIZATION_MIGRATION_ID);
  const roleIds = ['role-asset-sale-disposal-maker', 'role-asset-sale-disposal-approver', 'role-asset-sale-disposal-completer'];
  const [maker, approver, completer] = roleIds.map((id) => state.roles.find((role) => role.id === id));
  const grantsValid = ASSET_SALE_DISPOSAL_GRANTS.every((grant) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant));
  const rolesValid = Boolean(maker && approver && completer) && hasRequiredRoleGrant(maker, 'grant-asset-sale-disposal-submit') && hasRequiredRoleGrant(approver, 'grant-asset-sale-disposal-approve') && hasRequiredRoleGrant(completer, 'grant-asset-sale-disposal-complete');
  if (existing) { if (existing.checksum !== ASSET_SALE_DISPOSAL_AUTHORIZATION_CHECKSUM || !grantsValid || !rolesValid) throw new Error('Asset-sale disposal authorization migration state is invalid.'); return state; }
  if (state.roles.some(({ id }) => roleIds.includes(id))) throw new Error('Asset-sale disposal authorization role collision.');
  const next: KernelState = { ...state, grants: [...state.grants, ...ASSET_SALE_DISPOSAL_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))], roles: [...state.roles,
    { id: roleIds[0]!, name: 'Asset sale disposal maker', description: 'Submits customer, GST, proceeds, and book evidence for asset sale.', grantIds: ['grant-asset-sale-disposal-submit'], system: false, version: 1 },
    { id: roleIds[1]!, name: 'Asset sale disposal approver', description: 'Independently approves the sale and gain/loss handoff.', grantIds: ['grant-asset-sale-disposal-approve'], system: false, version: 1 },
    { id: roleIds[2]!, name: 'Asset sale disposal completer', description: 'Completes physical disposal after canonical posting.', grantIds: ['grant-asset-sale-disposal-complete'], system: false, version: 1 }],
    users: state.users.map((user) => user.id === 'user-avery' ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[0]!])], version: user.version + 1 } : user.id === 'user-priya' ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[1]!])], version: user.version + 1 } : user.id === 'user-lee' ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[2]!])], version: user.version + 1 } : user), migrations: [...state.migrations, { id: ASSET_SALE_DISPOSAL_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: ASSET_SALE_DISPOSAL_AUTHORIZATION_CHECKSUM }] };
  return appendEvidence(state, next, { actorId: 'system:migration', action: 'authorization.asset-sale-disposal-migrated', resource: 'kernel.authorization', resourceId: ASSET_SALE_DISPOSAL_AUTHORIZATION_MIGRATION_ID, reason: 'Created maker, approver, and completer boundaries for sale disposal.', before: null, after: { roles: roleIds, grants: ASSET_SALE_DISPOSAL_GRANTS.map(({ id }) => id) }, eventType: 'kernel.authorization.asset-sale-disposal-migrated.v1', payload: { roleIds, grantIds: ASSET_SALE_DISPOSAL_GRANTS.map(({ id }) => id) } }, now, `audit-${ASSET_SALE_DISPOSAL_AUTHORIZATION_MIGRATION_ID}`, `event-${ASSET_SALE_DISPOSAL_AUTHORIZATION_MIGRATION_ID}`);
}

export function applyProcurementRequisitionAuthorization(state: KernelState, now = new Date().toISOString()): KernelState {
  const existingMigration = state.migrations.find(({ id }) => id === PROCUREMENT_REQUISITION_AUTHORIZATION_MIGRATION_ID);
  const requester = state.roles.find(({ id }) => id === 'role-procurement-requester');
  const approver = state.roles.find(({ id }) => id === 'role-finance-approver');
  const requesterGrantIds = ['grant-procurement-requisition-prepare'];
  const approverGrantIds = ['grant-procurement-requisition-approve'];
  const grantsValid = PROCUREMENT_REQUISITION_GRANTS.every((expected) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === expected.id), expected));
  const rolesValid = requesterGrantIds.every((id) => hasRequiredRoleGrant(requester, id)) && approverGrantIds.every((id) => hasRequiredRoleGrant(approver, id));
  if (existingMigration) {
    if (existingMigration.checksum !== PROCUREMENT_REQUISITION_AUTHORIZATION_CHECKSUM) throw new Error('Procurement requisition authorization migration evidence is invalid.');
    if (!grantsValid || !rolesValid) throw new Error('Procurement requisition authorization migration state is invalid.');
    return state;
  }
  if (!requester || !approver) throw new Error('Procurement requisition authorization requires requester and finance-approver roles.');
  for (const expected of PROCUREMENT_REQUISITION_GRANTS) { const existing = state.grants.find(({ id }) => id === expected.id); if (existing && !hasExpectedGeneralLedgerGrant(existing, expected)) throw new Error(`Procurement requisition authorization grant collision for ${expected.id}.`); }
  const next: KernelState = {
    ...state,
    grants: [...state.grants.filter(({ id }) => !PROCUREMENT_REQUISITION_GRANTS.some((grant) => grant.id === id)), ...PROCUREMENT_REQUISITION_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))],
    roles: state.roles.map((role) => role.id === requester.id ? { ...role, grantIds: [...new Set([...role.grantIds, ...requesterGrantIds])], version: role.version + 1 } : role.id === approver.id ? { ...role, grantIds: [...new Set([...role.grantIds, ...approverGrantIds])], version: role.version + 1 } : role),
    migrations: [...state.migrations, { id: PROCUREMENT_REQUISITION_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: PROCUREMENT_REQUISITION_AUTHORIZATION_CHECKSUM }],
  };
  return appendEvidence(state, next, { actorId: 'system:migration', action: 'authorization.procurement-requisition-migrated', resource: 'kernel.authorization', resourceId: PROCUREMENT_REQUISITION_AUTHORIZATION_MIGRATION_ID, reason: 'Promoted purchase requisition demand capture and approval into maker/checker procurement policy.', before: { grants: state.grants.filter(({ id }) => PROCUREMENT_REQUISITION_GRANTS.some((grant) => grant.id === id)) }, after: { grants: PROCUREMENT_REQUISITION_GRANTS }, eventType: 'kernel.authorization.procurement-requisition-migrated.v1', payload: { requesterGrantIds, approverGrantIds } }, now, `audit-${PROCUREMENT_REQUISITION_AUTHORIZATION_MIGRATION_ID}`, `event-${PROCUREMENT_REQUISITION_AUTHORIZATION_MIGRATION_ID}`);
}

export function applyAssetLifecycleAuthorization(state: KernelState, now = new Date().toISOString()): KernelState {
  const existing = state.migrations.find(({ id }) => id === ASSET_LIFECYCLE_AUTHORIZATION_MIGRATION_ID);
  const roleIds = ['role-asset-lifecycle-maker', 'role-asset-lifecycle-approver', 'role-asset-lifecycle-operator'];
  const roles = roleIds.map((id) => state.roles.find((role) => role.id === id));
  const grantsValid = ASSET_LIFECYCLE_GRANTS.every((grant) => hasExpectedGeneralLedgerGrant(state.grants.find(({ id }) => id === grant.id), grant));
  const rolesValid = roles.every((role) => Boolean(role && hasRequiredRoleGrant(role, 'grant-asset-lifecycle-operate')));
  if (existing) { if (existing.checksum !== ASSET_LIFECYCLE_AUTHORIZATION_CHECKSUM || !grantsValid || !rolesValid) throw new Error('Asset-lifecycle authorization migration state is invalid.'); return state; }
  if (state.roles.some(({ id }) => roleIds.includes(id))) throw new Error('Asset-lifecycle authorization role collision.');
  const next: KernelState = { ...state, grants: [...state.grants, ...ASSET_LIFECYCLE_GRANTS.map((grant) => ({ ...grant, actions: [...grant.actions] }))], roles: [...state.roles,
    { id: roleIds[0]!, name: 'Asset lifecycle maker', description: 'Creates service, valuation, fleet, spares, meter and warranty evidence.', grantIds: ASSET_LIFECYCLE_GRANTS.map(({ id }) => id), system: false, version: 1 },
    { id: roleIds[1]!, name: 'Asset lifecycle approver', description: 'Reviews controlled asset lifecycle decisions.', grantIds: ASSET_LIFECYCLE_GRANTS.map(({ id }) => id), system: false, version: 1 },
    { id: roleIds[2]!, name: 'Asset lifecycle operator', description: 'Executes service, calibration, fleet and evidence completion.', grantIds: ASSET_LIFECYCLE_GRANTS.map(({ id }) => id), system: false, version: 1 }],
    users: state.users.map((user) => user.id === 'user-avery' ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[0]!])], version: user.version + 1 } : user.id === 'user-priya' ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[1]!])], version: user.version + 1 } : user.id === 'user-lee' ? { ...user, roleIds: [...new Set([...user.roleIds, roleIds[2]!])], version: user.version + 1 } : user), migrations: [...state.migrations, { id: ASSET_LIFECYCLE_AUTHORIZATION_MIGRATION_ID, appliedAt: now, checksum: ASSET_LIFECYCLE_AUTHORIZATION_CHECKSUM }] };
  return appendEvidence(state, next, { actorId: 'system:migration', action: 'authorization.asset-lifecycle-migrated', resource: 'kernel.authorization', resourceId: ASSET_LIFECYCLE_AUTHORIZATION_MIGRATION_ID, reason: 'Created maker, approver, and operator boundaries for full asset lifecycle controls.', before: null, after: { roles: roleIds, grants: ASSET_LIFECYCLE_GRANTS.map(({ id }) => id) }, eventType: 'kernel.authorization.asset-lifecycle-migrated.v1', payload: { roleIds, grantIds: ASSET_LIFECYCLE_GRANTS.map(({ id }) => id) } }, now, `audit-${ASSET_LIFECYCLE_AUTHORIZATION_MIGRATION_ID}`, `event-${ASSET_LIFECYCLE_AUTHORIZATION_MIGRATION_ID}`);
}

export function getAccessDecision(
  state: KernelState,
  request: AccessRequest,
): AccessDecision {
  const user = state.users.find(({ id }) => id === request.userId);
  if (!user || user.status !== 'active') {
    return {
      allowed: false,
      reason: 'The user is missing or inactive.',
      deniedFields: request.fields ?? [],
      readOnlyFields: [],
      matchedRoleIds: [],
    };
  }
  if (!user.companyIds.includes(request.companyId)) {
    return {
      allowed: false,
      reason: 'The user is outside the requested company scope.',
      deniedFields: request.fields ?? [],
      readOnlyFields: [],
      matchedRoleIds: [],
    };
  }
  if (request.branchId && !user.branchIds.includes(request.branchId)) {
    return {
      allowed: false,
      reason: 'The user is outside the requested branch scope.',
      deniedFields: request.fields ?? [],
      readOnlyFields: [],
      matchedRoleIds: [],
    };
  }

  const roles = state.roles.filter(({ id }) => user.roleIds.includes(id));
  const grants = state.grants.filter((grant) =>
    roles.some((role) => role.grantIds.includes(grant.id)),
  );
  const matchedGrants = grants.filter(
    (grant) =>
      (grant.resource === request.resource ||
        grant.resource === '*' ||
        (grant.resource.endsWith('.*') &&
          request.resource.startsWith(grant.resource.slice(0, -1)))) &&
      (grant.actions.includes(request.action) || grant.actions.includes('*')),
  );
  const matchedRoleIds = roles
    .filter((role) =>
      role.grantIds.some((id) => matchedGrants.some((grant) => grant.id === id)),
    )
    .map(({ id }) => id);

  if (matchedGrants.length === 0) {
    return {
      allowed: false,
      reason: 'No role grants this action. Epic BOS defaults to deny.',
      deniedFields: request.fields ?? [],
      readOnlyFields: [],
      matchedRoleIds: [],
    };
  }

  const fieldRules = state.fieldAccessRules.filter(
    (rule) =>
      matchedRoleIds.includes(rule.roleId) && rule.resource === request.resource,
  );
  const deniedFields = [
    ...new Set(fieldRules.flatMap(({ deniedFields: fields }) => fields)),
  ];
  const readOnlyFields = [
    ...new Set(fieldRules.flatMap(({ readOnlyFields: fields }) => fields)),
  ];
  const requestedDeniedFields = (request.fields ?? []).filter((field) =>
    deniedFields.includes(field),
  );

  return {
    allowed: requestedDeniedFields.length === 0,
    reason:
      requestedDeniedFields.length === 0
        ? 'Access granted by an explicit role and scope.'
        : `Field access denied: ${requestedDeniedFields.join(', ')}.`,
    deniedFields,
    readOnlyFields,
    matchedRoleIds,
  };
}

export function createCompany(
  state: KernelState,
  input: CreateCompanyInput,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): KernelState {
  const code = normalizeCode(input.code, 'Company code');
  if (state.companies.some((company) => company.code === code)) {
    throw new Error(`Company code ${code} already exists.`);
  }
  const baseCurrency = input.baseCurrency.trim().toUpperCase();
  if (!state.currencies.some(({ code: currency, active }) => currency === baseCurrency && active)) {
    throw new Error(`Currency ${baseCurrency} is not active.`);
  }
  const countryCode = input.countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error('Country code must use two ISO letters.');
  }
  if (
    !Number.isInteger(input.fiscalYearStartMonth) ||
    input.fiscalYearStartMonth < 1 ||
    input.fiscalYearStartMonth > 12
  ) {
    throw new Error('Fiscal year start month must be between 1 and 12.');
  }
  const profile = normalizeCompanyProfile(input.profile, countryCode);
  const decision = getAccessDecision(state, {
    userId: state.context.actorId,
    companyId: state.context.companyId,
    branchId: state.context.branchId,
    resource: 'kernel.company',
    action: 'create',
  });
  if (!decision.allowed) {
    throw new Error(decision.reason);
  }

  const company: Company = {
    id,
    tenantId: state.context.tenantId,
    code,
    name: normalizeName(input.name, 'Company name'),
    legalName: normalizeName(input.legalName, 'Legal name'),
    countryCode,
    baseCurrency,
    fiscalYearStartMonth: input.fiscalYearStartMonth,
    profile,
    status: 'active',
    version: 1,
  };
  const users = state.users.map((user) =>
    user.id === state.context.actorId
      ? {
          ...user,
          companyIds: normalizedUnique([...user.companyIds, company.id]),
          version: user.version + 1,
        }
      : user,
  );
  const next = {
    ...state,
    companies: [...state.companies, company],
    users,
  };

  return appendEvidence(
    state,
    next,
    {
      action: 'company.created',
      resource: 'kernel.company',
      resourceId: company.id,
      reason: 'Created a legal company in the active tenant.',
      before: null,
      after: company,
      eventType: 'kernel.company.created.v1',
      payload: {
        companyId: company.id,
        code: company.code,
        initialAdministratorId: state.context.actorId,
      },
    },
    now,
    `audit-${id}`,
    `event-${id}`,
  );
}

/**
 * Rename the workspace without changing legal entities or their statutory
 * records. Tenant identifiers remain immutable scope keys across bounded
 * contexts, so this operation is intentionally label-only and versioned.
 */
export function updateTenantIdentity(
  state: KernelState,
  input: UpdateTenantIdentityInput,
  now = new Date().toISOString(),
  auditId: string = randomUUID(),
  eventId: string = randomUUID(),
): KernelState {
  assertKernelAdmin(state, 'kernel.tenant');
  if (state.tenant.version !== input.expectedVersion) {
    throw new Error('The workspace identity changed. Refresh and retry.');
  }
  const updated = {
    ...state.tenant,
    name: normalizeName(input.name, 'Workspace name'),
    slug: normalizeTenantSlug(input.slug),
    version: state.tenant.version + 1,
  };
  return appendEvidence(
    state,
    { ...state, tenant: updated },
    {
      action: 'tenant.identity.updated',
      resource: 'kernel.tenant',
      resourceId: state.tenant.id,
      reason: 'Updated workspace identity without changing legal-entity or statutory records.',
      before: state.tenant,
      after: updated,
      eventType: 'kernel.tenant.identity-updated.v1',
      payload: { tenantId: state.tenant.id, slug: updated.slug },
    },
    now,
    auditId,
    eventId,
  );
}

/**
 * First-run enrollment adopts the human owner identity into the durable kernel
 * record. It is only called by the trusted bootstrap path; normal profile
 * changes remain a separate governed concern.
 */
export function adoptBootstrapOwnerIdentity(
  state: KernelState,
  email: string,
  displayName: string,
  now = new Date().toISOString(),
  auditId: string = randomUUID(),
  eventId: string = randomUUID(),
): KernelState {
  const owner = state.users.find(({ id }) => id === WORKSPACE_OWNER_ID);
  if (!owner) throw new Error('The immutable workspace owner record is missing.');
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Workspace owner email must be valid.');
  }
  if (state.users.some((user) => user.id !== owner.id && user.email.toLowerCase() === normalizedEmail)) {
    throw new Error('A governed user already uses this email address.');
  }
  const normalizedDisplayName = normalizeName(displayName, 'Workspace owner name');
  if (owner.email === normalizedEmail && owner.displayName === normalizedDisplayName) return state;
  const updated = {
    ...owner,
    email: normalizedEmail,
    displayName: normalizedDisplayName,
    version: owner.version + 1,
  };
  return appendEvidence(
    state,
    {
      ...state,
      users: state.users.map((user) => user.id === owner.id ? updated : user),
    },
    {
      action: 'workspace.owner.identity-adopted',
      resource: 'kernel.user',
      resourceId: owner.id,
      reason: 'Adopted the verified first-run owner identity into the workspace.',
      before: owner,
      after: updated,
      eventType: 'kernel.workspace-owner.identity-adopted.v1',
      payload: { userId: owner.id },
    },
    now,
    auditId,
    eventId,
  );
}

export function updateCompany(
  state: KernelState,
  input: UpdateCompanyInput,
  now = new Date().toISOString(),
  auditId: string = randomUUID(),
  eventId: string = randomUUID(),
): KernelState {
  assertKernelAdmin(state, 'kernel.company');
  const company = state.companies.find(({ id }) => id === input.id);
  if (!company) throw new Error('Company not found.');
  if (company.version !== input.expectedVersion) {
    throw new Error('The company changed. Refresh and retry.');
  }
  const code = normalizeCode(input.code, 'Company code');
  if (state.companies.some((candidate) => candidate.id !== company.id && candidate.code === code)) {
    throw new Error(`Company code ${code} already exists.`);
  }
  const baseCurrency = input.baseCurrency.trim().toUpperCase();
  if (!state.currencies.some(({ code: currency, active }) => currency === baseCurrency && active)) {
    throw new Error(`Currency ${baseCurrency} is not active.`);
  }
  const countryCode = input.countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('Country code must use two ISO letters.');
  if (!Number.isInteger(input.fiscalYearStartMonth) || input.fiscalYearStartMonth < 1 || input.fiscalYearStartMonth > 12) throw new Error('Fiscal year start month must be between 1 and 12.');
  if (company.id === state.context.companyId && input.status !== 'active') {
    throw new Error('The active company cannot be deactivated. Switch context first.');
  }
  const updated: Company = {
    ...company,
    code,
    name: normalizeName(input.name, 'Company name'),
    legalName: normalizeName(input.legalName, 'Legal name'),
    countryCode,
    baseCurrency,
    fiscalYearStartMonth: input.fiscalYearStartMonth,
    profile: normalizeCompanyProfile(input.profile, countryCode),
    status: input.status,
    version: company.version + 1,
  };
  return appendEvidence(
    state,
    { ...state, companies: state.companies.map((candidate) => candidate.id === updated.id ? updated : candidate) },
    {
      action: 'company.updated', resource: 'kernel.company', resourceId: company.id,
      reason: 'Updated legal-entity administration.', before: company, after: updated,
      eventType: 'kernel.company.updated.v1', payload: { companyId: company.id },
    },
    now, auditId, eventId,
  );
}

export function createBranch(
  state: KernelState,
  input: CreateBranchInput,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): KernelState {
  assertKernelAdmin(state, 'kernel.branch');
  const company = state.companies.find(({ id: companyId }) => companyId === input.companyId);
  if (!company || company.status !== 'active') throw new Error('Select an active company.');
  const code = normalizeCode(input.code, 'Branch code');
  if (state.branches.some((branch) => branch.companyId === company.id && branch.code === code)) {
    throw new Error(`Branch code ${code} already exists in ${company.name}.`);
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }).format();
  } catch {
    throw new Error('Timezone must be a valid IANA timezone.');
  }
  const branch: Branch = {
    id,
    companyId: company.id,
    code,
    name: normalizeName(input.name, 'Branch name'),
    timezone: input.timezone,
    status: 'active',
    version: 1,
  };
  const actor = state.users.find(({ id: userId }) => userId === state.context.actorId);
  const users = state.users.map((user) =>
    user.id === actor?.id
      ? {
          ...user,
          companyIds: [...new Set([...user.companyIds, company.id])],
          branchIds: [...new Set([...user.branchIds, branch.id])],
          version: user.version + 1,
        }
      : user,
  );
  return appendEvidence(
    state,
    { ...state, branches: [...state.branches, branch], users },
    {
      action: 'branch.created', resource: 'kernel.branch', resourceId: branch.id,
      reason: `Created an operating branch for ${company.name}.`, before: null, after: branch,
      eventType: 'kernel.branch.created.v1', payload: { companyId: company.id, branchId: branch.id },
    },
    now, `audit-${id}`, `event-${id}`,
  );
}

export function updateBranch(
  state: KernelState,
  input: UpdateBranchInput,
  now = new Date().toISOString(),
  auditId: string = randomUUID(),
  eventId: string = randomUUID(),
): KernelState {
  assertKernelAdmin(state, 'kernel.branch');
  const branch = state.branches.find(({ id }) => id === input.id);
  if (!branch) throw new Error('Branch not found.');
  if (branch.version !== input.expectedVersion) throw new Error('The branch changed. Refresh and retry.');
  if (!state.companies.some(({ id, status }) => id === input.companyId && status === 'active')) {
    throw new Error('Select an active company.');
  }
  const code = normalizeCode(input.code, 'Branch code');
  if (state.branches.some((candidate) => candidate.id !== branch.id && candidate.companyId === input.companyId && candidate.code === code)) {
    throw new Error(`Branch code ${code} already exists in this company.`);
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }).format();
  } catch {
    throw new Error('Timezone must be a valid IANA timezone.');
  }
  if (branch.id === state.context.branchId && input.status !== 'active') {
    throw new Error('The active branch cannot be deactivated. Switch context first.');
  }
  const updated: Branch = {
    ...branch,
    companyId: input.companyId,
    code,
    name: normalizeName(input.name, 'Branch name'),
    timezone: input.timezone,
    status: input.status,
    version: branch.version + 1,
  };
  return appendEvidence(
    state,
    { ...state, branches: state.branches.map((candidate) => candidate.id === updated.id ? updated : candidate) },
    {
      action: 'branch.updated', resource: 'kernel.branch', resourceId: branch.id,
      reason: 'Updated operating-branch administration.', before: branch, after: updated,
      eventType: 'kernel.branch.updated.v1', payload: { branchId: branch.id },
    },
    now, auditId, eventId,
  );
}

export function createUser(
  state: KernelState,
  input: CreateUserInput,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): KernelState {
  assertKernelAdmin(state, 'kernel.user');
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid work email.');
  if (state.users.some((user) => user.email.toLowerCase() === email)) throw new Error('A user with this email already exists.');
  const roleIds = normalizedUnique(input.roleIds);
  const companyIds = normalizedUnique(input.companyIds);
  const branchIds = normalizedUnique(input.branchIds);
  if (roleIds.includes(WORKSPACE_OWNER_ROLE_ID)) {
    throw new Error('The bootstrap workspace-owner role cannot be assigned to provisioned users.');
  }
  if (roleIds.some((roleId) => !state.roles.some(({ id: candidate }) => candidate === roleId))) throw new Error('One or more roles do not exist.');
  if (companyIds.length === 0 || companyIds.some((companyId) => !state.companies.some(({ id: candidate, status }) => candidate === companyId && status === 'active'))) throw new Error('Select at least one active company.');
  if (branchIds.some((branchId) => !state.branches.some((branch) => branch.id === branchId && branch.status === 'active' && companyIds.includes(branch.companyId)))) throw new Error('Every branch must be active and belong to a selected company.');
  const effectiveGrants = state.roles.filter(({ id: roleId }) => roleIds.includes(roleId)).flatMap(({ grantIds }) => grantIds);
  assertNoSegregationConflict(state, effectiveGrants);
  const user: BusinessUser = {
    id, email, displayName: normalizeName(input.displayName, 'Display name'), status: 'active',
    roleIds, companyIds, branchIds, version: 1,
  };
  return appendEvidence(
    state,
    { ...state, users: [...state.users, user] },
    {
      action: 'user.created', resource: 'kernel.user', resourceId: user.id,
      reason: 'Provisioned a business identity and operating scope.', before: null, after: user,
      eventType: 'kernel.user.created.v1', payload: { userId: user.id },
    },
    now, `audit-${id}`, `event-${id}`,
  );
}

export function createRole(
  state: KernelState,
  input: CreateRoleInput,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): KernelState {
  assertKernelAdmin(state, 'kernel.role');
  const name = normalizeName(input.name, 'Role name');
  if (state.roles.some((role) => role.name.toLowerCase() === name.toLowerCase())) throw new Error('A role with this name already exists.');
  const grantIds = normalizedUnique(input.grantIds);
  if (grantIds.some((grantId) => !state.grants.some(({ id: candidate }) => candidate === grantId))) throw new Error('One or more grants do not exist.');
  assertNoSegregationConflict(state, grantIds);
  const role: Role = { id, name, description: normalizeName(input.description, 'Role description'), grantIds, system: false, version: 1 };
  return appendEvidence(
    state,
    { ...state, roles: [...state.roles, role] },
    {
      action: 'role.created', resource: 'kernel.role', resourceId: role.id,
      reason: 'Created an explicit least-privilege role.', before: null, after: role,
      eventType: 'kernel.role.created.v1', payload: { roleId: role.id },
    },
    now, `audit-${id}`, `event-${id}`,
  );
}

export function updateRolePolicy(
  state: KernelState,
  input: UpdateRolePolicyInput,
  now = new Date().toISOString(),
  auditId: string = randomUUID(),
  eventId: string = randomUUID(),
): KernelState {
  assertKernelAdmin(state, 'kernel.role');
  const role = state.roles.find(({ id }) => id === input.id);
  if (!role) throw new Error('Role not found.');
  if (role.id === WORKSPACE_OWNER_ROLE_ID) {
    throw new Error('The bootstrap workspace-owner role is immutable.');
  }
  if (role.version !== input.expectedVersion) throw new Error('The role changed. Refresh and retry.');
  const grantIds = normalizedUnique(input.grantIds);
  if (grantIds.some((grantId) => !state.grants.some(({ id: candidate }) => candidate === grantId))) throw new Error('One or more grants do not exist.');
  assertNoSegregationConflict(state, grantIds);
  const updated: Role = {
    ...role,
    name: normalizeName(input.name, 'Role name'),
    description: normalizeName(input.description, 'Role description'),
    grantIds,
    version: role.version + 1,
  };
  return appendEvidence(
    state,
    { ...state, roles: state.roles.map((candidate) => candidate.id === updated.id ? updated : candidate) },
    {
      action: 'role.policy-updated', resource: 'kernel.role', resourceId: role.id,
      reason: 'Updated the role permission policy.', before: role, after: updated,
      eventType: 'kernel.role.policy-updated.v1', payload: { roleId: role.id },
    },
    now, auditId, eventId,
  );
}

export function upsertFieldAccessRule(
  state: KernelState,
  input: UpsertFieldAccessRuleInput,
  id: string = input.id ?? randomUUID(),
  now = new Date().toISOString(),
): KernelState {
  assertKernelAdmin(state, 'kernel.field-access');
  if (!state.roles.some(({ id: roleId }) => roleId === input.roleId)) throw new Error('Role not found.');
  if (input.roleId === WORKSPACE_OWNER_ROLE_ID) {
    throw new Error('Field policies cannot be attached to the immutable workspace-owner role.');
  }
  const resource = input.resource.trim().toLowerCase();
  if (!/^[a-z][a-z0-9.-]{2,119}$/.test(resource)) throw new Error('Enter a valid resource key.');
  const previous = state.fieldAccessRules.find((rule) => rule.id === id) ?? null;
  if (input.id && !previous) throw new Error('Field-access rule not found.');
  const rule = {
    id,
    roleId: input.roleId,
    resource,
    deniedFields: normalizedUnique(input.deniedFields),
    readOnlyFields: normalizedUnique(input.readOnlyFields),
  };
  return appendEvidence(
    state,
    { ...state, fieldAccessRules: previous ? state.fieldAccessRules.map((candidate) => candidate.id === id ? rule : candidate) : [...state.fieldAccessRules, rule] },
    {
      action: previous ? 'field-access.updated' : 'field-access.created', resource: 'kernel.field-access', resourceId: id,
      reason: 'Applied field-level data minimization.', before: previous, after: rule,
      eventType: 'kernel.field-access.changed.v1', payload: { roleId: input.roleId, resource },
    },
    now, `audit-${id}-${state.revision}`, `event-${id}-${state.revision}`,
  );
}

export function updateApprovalPolicy(
  state: KernelState,
  input: UpdateApprovalPolicyInput,
  now = new Date().toISOString(),
  auditId: string = randomUUID(),
  eventId: string = randomUUID(),
): KernelState {
  assertKernelAdmin(state, 'kernel.approval-policy');
  const policy = state.approvalPolicies.find(({ id }) => id === input.id);
  if (!policy) throw new Error('Approval policy not found.');
  if (policy.version !== input.expectedVersion) throw new Error('The approval policy changed. Refresh and retry.');
  const approverRoleIds = normalizedUnique(input.approverRoleIds);
  if (approverRoleIds.length === 0 || approverRoleIds.some((roleId) => !state.roles.some(({ id: candidate }) => candidate === roleId))) throw new Error('Select at least one valid approver role.');
  if (approverRoleIds.includes(WORKSPACE_OWNER_ROLE_ID)) {
    throw new Error('The bootstrap workspace-owner role cannot be used as an approval route.');
  }
  if (!Number.isInteger(input.approvalsRequired) || input.approvalsRequired < 1 || input.approvalsRequired > approverRoleIds.length) throw new Error('Required approvals must be between one and the approver-role count.');
  const updated = {
    ...policy,
    name: normalizeName(input.name, 'Approval policy name'),
    approverRoleIds,
    approvalsRequired: input.approvalsRequired,
    allowSelfApproval: input.allowSelfApproval,
    version: policy.version + 1,
  };
  return appendEvidence(
    state,
    { ...state, approvalPolicies: state.approvalPolicies.map((candidate) => candidate.id === updated.id ? updated : candidate) },
    {
      action: 'approval-policy.updated', resource: 'kernel.approval-policy', resourceId: policy.id,
      reason: 'Updated approval routing and independence controls.', before: policy, after: updated,
      eventType: 'kernel.approval-policy.updated.v1', payload: { policyId: policy.id },
    },
    now, auditId, eventId,
  );
}

export function assignRole(
  state: KernelState,
  input: AssignRoleInput,
  now = new Date().toISOString(),
  auditId: string = randomUUID(),
  eventId: string = randomUUID(),
): KernelState {
  assertKernelAdmin(state, 'kernel.user');
  const user = state.users.find(({ id }) => id === input.userId);
  const role = state.roles.find(({ id }) => id === input.roleId);
  if (!user) throw new Error('User not found.');
  if (!role) throw new Error('Role not found.');
  if (role.id === WORKSPACE_OWNER_ROLE_ID) {
    throw new Error('The bootstrap workspace-owner role cannot be assigned manually.');
  }
  if (user.version !== input.expectedVersion) {
    throw new Error('The user changed before this role assignment. Refresh and retry.');
  }
  if (user.roleIds.includes(role.id)) {
    return state;
  }

  const roleIds = [...user.roleIds, role.id];
  const effectiveGrantIds = new Set(
    state.roles
      .filter(({ id }) => roleIds.includes(id))
      .flatMap(({ grantIds }) => grantIds),
  );
  const conflict = state.segregationRules.find(
    (rule) =>
      rule.enabled &&
      effectiveGrantIds.has(rule.leftGrantId) &&
      effectiveGrantIds.has(rule.rightGrantId),
  );
  if (conflict) {
    throw new Error(`Segregation-of-duties conflict: ${conflict.reason}`);
  }

  const updated: BusinessUser = {
    ...user,
    roleIds,
    version: user.version + 1,
  };
  const next = {
    ...state,
    users: state.users.map((candidate) =>
      candidate.id === updated.id ? updated : candidate,
    ),
  };

  return appendEvidence(
    state,
    next,
    {
      action: 'role.assigned',
      resource: 'kernel.user',
      resourceId: user.id,
      reason: `Assigned ${role.name}.`,
      before: user,
      after: updated,
      eventType: 'kernel.user.role-assigned.v1',
      payload: { userId: user.id, roleId: role.id },
    },
    now,
    auditId,
    eventId,
  );
}

export function issueDocumentNumber(
  state: KernelState,
  input: IssueNumberInput,
  now = new Date().toISOString(),
  auditId: string = randomUUID(),
  eventId: string = randomUUID(),
): { state: KernelState; issuedNumber: string } {
  assertKernelAdmin(state, 'kernel.number-sequence');
  const sequence = state.numberSequences.find(({ id }) => id === input.sequenceId);
  if (!sequence) throw new Error('Number sequence not found.');
  if (sequence.version !== input.expectedVersion) {
    throw new Error('The number sequence changed. Refresh and retry.');
  }
  const period = state.fiscalPeriods.find(({ id }) => id === sequence.fiscalPeriodId);
  if (!period || period.status !== 'open') {
    throw new Error('Documents cannot be numbered outside an open fiscal period.');
  }
  const date = now.slice(0, 10);
  if (date < period.startDate || date > period.endDate) {
    throw new Error('The issue date is outside the sequence fiscal period.');
  }
  const issuedNumber =
    sequence.prefix + String(sequence.nextValue).padStart(sequence.padding, '0');
  const updated = {
    ...sequence,
    nextValue: sequence.nextValue + 1,
    version: sequence.version + 1,
  };
  const next = {
    ...state,
    numberSequences: state.numberSequences.map((candidate) =>
      candidate.id === updated.id ? updated : candidate,
    ),
  };

  return {
    issuedNumber,
    state: appendEvidence(
      state,
      next,
      {
        action: 'number.issued',
        resource: 'kernel.number-sequence',
        resourceId: sequence.id,
        reason: `Issued ${sequence.documentType} number.`,
        before: sequence,
        after: updated,
        eventType: 'kernel.document-number.issued.v1',
        payload: { issuedNumber, documentType: sequence.documentType },
      },
      now,
      auditId,
      eventId,
    ),
  };
}

export function transitionWorkflow(
  state: KernelState,
  input: TransitionWorkflowInput,
  now = new Date().toISOString(),
  requestId: string = randomUUID(),
  auditId: string = randomUUID(),
  eventId: string = randomUUID(),
): KernelState {
  const instance = state.workflowInstances.find(({ id }) => id === input.instanceId);
  if (!instance) throw new Error('Workflow instance not found.');
  if (instance.version !== input.expectedVersion) {
    throw new Error('The workflow changed. Refresh and retry.');
  }
  const workflow = state.workflowDefinitions.find(({ id }) => id === instance.workflowId);
  const transition = workflow?.transitions.find(({ id }) => id === input.transitionId);
  if (!workflow || !transition || transition.from !== instance.state) {
    throw new Error('This workflow transition is not available from the current state.');
  }
  const decision = getAccessDecision(state, {
    userId: state.context.actorId,
    companyId: state.context.companyId,
    branchId: state.context.branchId,
    resource: transition.requiredResource,
    action: transition.requiredAction,
  });
  if (!decision.allowed) throw new Error(decision.reason);

  if (transition.approvalPolicyId) {
    const duplicate = state.approvalRequests.some(
      (request) =>
        request.workflowInstanceId === instance.id &&
        request.transitionId === transition.id &&
        request.status === 'pending',
    );
    if (duplicate) throw new Error('An approval request is already pending.');
    const request: ApprovalRequest = {
      id: requestId,
      workflowInstanceId: instance.id,
      transitionId: transition.id,
      policyId: transition.approvalPolicyId,
      requestedBy: state.context.actorId,
      requestedAt: now,
      status: 'pending',
      version: 1,
    };
    return appendEvidence(
      state,
      { ...state, approvalRequests: [...state.approvalRequests, request] },
      {
        action: 'approval.requested',
        resource: workflow.resource,
        resourceId: instance.documentId,
        reason: `Requested transition from ${transition.from} to ${transition.to}.`,
        before: instance,
        after: request,
        eventType: 'kernel.approval.requested.v1',
        payload: { requestId: request.id, transitionId: transition.id },
      },
      now,
      auditId,
      eventId,
    );
  }

  const updated: WorkflowInstance = {
    ...instance,
    state: transition.to,
    version: instance.version + 1,
  };
  return appendEvidence(
    state,
    {
      ...state,
      workflowInstances: state.workflowInstances.map((candidate) =>
        candidate.id === updated.id ? updated : candidate,
      ),
    },
    {
      action: 'workflow.transitioned',
      resource: workflow.resource,
      resourceId: instance.documentId,
      reason: `Transitioned from ${transition.from} to ${transition.to}.`,
      before: instance,
      after: updated,
      eventType: 'kernel.workflow.transitioned.v1',
      payload: { from: transition.from, to: transition.to },
    },
    now,
    auditId,
    eventId,
  );
}

export function decideApproval(
  state: KernelState,
  input: DecideApprovalInput,
  now = new Date().toISOString(),
  auditId: string = randomUUID(),
  eventId: string = randomUUID(),
): KernelState {
  const request = state.approvalRequests.find(({ id }) => id === input.requestId);
  if (!request) throw new Error('Approval request not found.');
  if (request.version !== input.expectedVersion || request.status !== 'pending') {
    throw new Error('The approval request is no longer pending at this version.');
  }
  const policy = state.approvalPolicies.find(({ id }) => id === request.policyId);
  const actor = state.users.find(({ id }) => id === state.context.actorId);
  if (!policy || !actor) throw new Error('Approval policy or actor not found.');
  if (!actor.roleIds.some((roleId) => policy.approverRoleIds.includes(roleId))) {
    throw new Error('The active user is not an authorized approver.');
  }
  if (!policy.allowSelfApproval && request.requestedBy === actor.id) {
    throw new Error('Self-approval is prohibited by this approval policy.');
  }
  const instance = state.workflowInstances.find(
    ({ id }) => id === request.workflowInstanceId,
  );
  const workflow = state.workflowDefinitions.find(
    ({ id }) => id === instance?.workflowId,
  );
  const transition = workflow?.transitions.find(({ id }) => id === request.transitionId);
  if (!instance || !workflow || !transition || instance.state !== transition.from) {
    throw new Error('The workflow state no longer matches this approval request.');
  }

  const decided: ApprovalRequest = {
    ...request,
    status: input.decision,
    decidedBy: actor.id,
    decidedAt: now,
    version: request.version + 1,
  };
  const updatedInstance: WorkflowInstance =
    input.decision === 'approved'
      ? { ...instance, state: transition.to, version: instance.version + 1 }
      : instance;
  const next = {
    ...state,
    approvalRequests: state.approvalRequests.map((candidate) =>
      candidate.id === decided.id ? decided : candidate,
    ),
    workflowInstances: state.workflowInstances.map((candidate) =>
      candidate.id === updatedInstance.id ? updatedInstance : candidate,
    ),
  };

  return appendEvidence(
    state,
    next,
    {
      action: `approval.${input.decision}`,
      resource: workflow.resource,
      resourceId: instance.documentId,
      reason: `${actor.displayName} ${input.decision} the requested transition.`,
      before: { request, instance },
      after: { request: decided, instance: updatedInstance },
      eventType: `kernel.approval.${input.decision}.v1`,
      payload: { requestId: request.id, decision: input.decision },
    },
    now,
    auditId,
    eventId,
  );
}

export function registerCustomField(
  state: KernelState,
  input: RegisterCustomFieldInput,
  id: string = randomUUID(),
  now = new Date().toISOString(),
): KernelState {
  const resource = input.resource.trim().toLowerCase();
  const key = input.key.trim();
  if (!/^[a-z][A-Za-z0-9]{1,63}$/.test(key)) {
    throw new Error('Custom-field key must be camelCase and contain 2-64 characters.');
  }
  if (RESERVED_CUSTOM_FIELD_KEYS.has(key)) {
    throw new Error(`${key} is a reserved system field.`);
  }
  if (
    state.customFields.some(
      (field) => field.resource === resource && field.key.toLowerCase() === key.toLowerCase(),
    )
  ) {
    throw new Error(`Custom field ${resource}.${key} already exists.`);
  }
  const field: CustomFieldDefinition = {
    id,
    resource,
    key,
    label: normalizeName(input.label, 'Field label'),
    type: input.type,
    required: input.required,
    options: [...new Set(input.options.map((option) => option.trim()).filter(Boolean))],
    version: 1,
  };
  return appendEvidence(
    state,
    { ...state, customFields: [...state.customFields, field] },
    {
      action: 'custom-field.registered',
      resource: 'kernel.custom-field',
      resourceId: field.id,
      reason: `Extended ${resource} without a source-code fork.`,
      before: null,
      after: field,
      eventType: 'kernel.custom-field.registered.v1',
      payload: { resource, key },
    },
    now,
    `audit-${id}`,
    `event-${id}`,
  );
}

export function getKernelSnapshot(
  state: KernelState,
  generatedAt = new Date().toISOString(),
): KernelSnapshot {
  return {
    revision: state.revision,
    generatedAt,
    context: { ...state.context },
    tenant: { ...state.tenant },
    companies: state.companies.map((company) => ({ ...company })),
    branches: state.branches.map((branch) => ({ ...branch })),
    users: state.users.map((user) => ({ ...user, roleIds: [...user.roleIds] })),
    roles: state.roles.map((role) => ({ ...role, grantIds: [...role.grantIds] })),
    grants: state.grants.map((grant) => ({ ...grant, actions: [...grant.actions] })),
    fieldAccessRules: state.fieldAccessRules.map((rule) => ({
      ...rule,
      deniedFields: [...rule.deniedFields],
      readOnlyFields: [...rule.readOnlyFields],
    })),
    segregationRules: state.segregationRules.map((rule) => ({ ...rule })),
    currencies: state.currencies.map((currency) => ({ ...currency })),
    fiscalPeriods: state.fiscalPeriods.map((period) => ({ ...period })),
    numberSequences: state.numberSequences.map((sequence) => ({ ...sequence })),
    workflowDefinitions: state.workflowDefinitions.map((workflow) => ({
      ...workflow,
      states: [...workflow.states],
      transitions: workflow.transitions.map((transition) => ({ ...transition })),
    })),
    approvalPolicies: state.approvalPolicies.map((policy) => ({
      ...policy,
      approverRoleIds: [...policy.approverRoleIds],
    })),
    workflowInstances: state.workflowInstances.map((instance) => ({ ...instance })),
    approvalRequests: state.approvalRequests.map((request) => ({ ...request })),
    customFields: state.customFields.map((field) => ({
      ...field,
      options: [...field.options],
    })),
    recentAudit: state.audit.slice(-12).reverse().map((entry) => ({ ...entry })),
    pendingEvents: state.outbox.filter(({ status }) => status === 'pending').length,
    controlMetrics: {
      activeCompanies: state.companies.filter(({ status }) => status === 'active').length,
      activeUsers: state.users.filter(({ status }) => status === 'active').length,
      permissionRoles: state.roles.length,
      openPeriods: state.fiscalPeriods.filter(({ status }) => status === 'open').length,
    },
  };
}

export function verifyAuditChain(state: KernelState): boolean {
  let previousHash = GENESIS_HASH;
  for (const entry of state.audit) {
    if (entry.previousHash !== previousHash) return false;
    const { hash, ...unsigned } = entry;
    if (sha256(JSON.stringify(unsigned)) !== hash) return false;
    previousHash = hash;
  }
  return true;
}

export function createKernelBackup(
  state: KernelState,
  createdAt = new Date().toISOString(),
): KernelBackup {
  const backupState = structuredClone(state);
  return {
    formatVersion: 1,
    createdAt,
    state: backupState,
    checksum: sha256(JSON.stringify(backupState)),
  };
}

export function restoreKernelBackup(backup: KernelBackup): KernelState {
  if (backup.formatVersion !== 1 || backup.state.schemaVersion !== 1) {
    throw new Error('Unsupported Epic BOS backup format.');
  }
  if (sha256(JSON.stringify(backup.state)) !== backup.checksum) {
    throw new Error('Backup checksum verification failed.');
  }
  if (!verifyAuditChain(backup.state)) {
    throw new Error('Backup audit-chain verification failed.');
  }
  return structuredClone(backup.state);
}
