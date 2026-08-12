export type RecordStatus = 'active' | 'inactive';
export type FiscalPeriodStatus = 'open' | 'soft-closed' | 'closed';
export type BusinessAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'submit'
  | 'approve'
  | 'post'
  | 'export'
  | 'admin';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: RecordStatus;
  version: number;
}

export interface Company {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  legalName: string;
  countryCode: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  /** India-first legal/contact identity kept with the legal entity, not the workspace label. */
  profile?: CompanyProfile;
  status: RecordStatus;
  version: number;
}

export interface CompanyProfile {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateCode: string;
  postalCode: string;
  email?: string;
  phone?: string;
  website?: string;
  gstin?: string;
  pan?: string;
  logoAttachmentId?: string;
}

export interface Branch {
  id: string;
  companyId: string;
  code: string;
  name: string;
  timezone: string;
  status: RecordStatus;
  version: number;
}

export interface BusinessUser {
  id: string;
  email: string;
  displayName: string;
  status: RecordStatus;
  roleIds: string[];
  companyIds: string[];
  branchIds: string[];
  version: number;
}

export interface PermissionGrant {
  id: string;
  resource: string;
  actions: Array<BusinessAction | '*'>;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  grantIds: string[];
  system: boolean;
  version: number;
}

export interface FieldAccessRule {
  id: string;
  roleId: string;
  resource: string;
  deniedFields: string[];
  readOnlyFields: string[];
}

export interface SegregationRule {
  id: string;
  name: string;
  leftGrantId: string;
  rightGrantId: string;
  reason: string;
  enabled: boolean;
}

export interface CurrencyDefinition {
  code: string;
  name: string;
  symbol: string;
  minorUnits: number;
  active: boolean;
}

export interface FiscalPeriod {
  id: string;
  companyId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalPeriodStatus;
  version: number;
}

export interface NumberSequence {
  id: string;
  companyId: string;
  fiscalPeriodId: string;
  documentType: string;
  prefix: string;
  nextValue: number;
  padding: number;
  version: number;
}

export interface WorkflowTransition {
  id: string;
  from: string;
  to: string;
  requiredResource: string;
  requiredAction: BusinessAction;
  approvalPolicyId?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  resource: string;
  states: string[];
  transitions: WorkflowTransition[];
  version: number;
}

export interface ApprovalPolicy {
  id: string;
  name: string;
  approverRoleIds: string[];
  approvalsRequired: number;
  allowSelfApproval: boolean;
  version: number;
}

export interface WorkflowInstance {
  id: string;
  workflowId: string;
  documentId: string;
  state: string;
  version: number;
}

export interface ApprovalRequest {
  id: string;
  workflowInstanceId: string;
  transitionId: string;
  policyId: string;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  version: number;
}

export interface CustomFieldDefinition {
  id: string;
  resource: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'reference';
  required: boolean;
  options: string[];
  version: number;
}

export interface AttachmentMetadata {
  id: string;
  resource: string;
  resourceId: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  storageKey: string;
  createdBy: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  occurredAt: string;
  actorId: string;
  action: string;
  resource: string;
  resourceId: string;
  reason: string;
  before: unknown;
  after: unknown;
  previousHash: string;
  hash: string;
}

export interface DomainEvent {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'published' | 'failed';
  attempts: number;
}

export interface MigrationRecord {
  id: string;
  appliedAt: string;
  checksum: string;
}

export interface KernelContext {
  tenantId: string;
  companyId: string;
  branchId: string;
  actorId: string;
}

export interface KernelState {
  schemaVersion: 1;
  revision: number;
  context: KernelContext;
  tenant: Tenant;
  companies: Company[];
  branches: Branch[];
  users: BusinessUser[];
  roles: Role[];
  grants: PermissionGrant[];
  fieldAccessRules: FieldAccessRule[];
  segregationRules: SegregationRule[];
  currencies: CurrencyDefinition[];
  fiscalPeriods: FiscalPeriod[];
  numberSequences: NumberSequence[];
  workflowDefinitions: WorkflowDefinition[];
  approvalPolicies: ApprovalPolicy[];
  workflowInstances: WorkflowInstance[];
  approvalRequests: ApprovalRequest[];
  customFields: CustomFieldDefinition[];
  attachments: AttachmentMetadata[];
  audit: AuditEntry[];
  outbox: DomainEvent[];
  migrations: MigrationRecord[];
}

export interface AccessRequest {
  userId: string;
  companyId: string;
  branchId?: string;
  resource: string;
  action: BusinessAction;
  fields?: string[];
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  deniedFields: string[];
  readOnlyFields: string[];
  matchedRoleIds: string[];
}

export interface KernelSnapshot {
  revision: number;
  generatedAt: string;
  context: KernelContext;
  tenant: Tenant;
  companies: Company[];
  branches: Branch[];
  users: BusinessUser[];
  roles: Role[];
  grants: PermissionGrant[];
  fieldAccessRules: FieldAccessRule[];
  segregationRules: SegregationRule[];
  currencies: CurrencyDefinition[];
  fiscalPeriods: FiscalPeriod[];
  numberSequences: NumberSequence[];
  workflowDefinitions: WorkflowDefinition[];
  approvalPolicies: ApprovalPolicy[];
  workflowInstances: WorkflowInstance[];
  approvalRequests: ApprovalRequest[];
  customFields: CustomFieldDefinition[];
  recentAudit: AuditEntry[];
  pendingEvents: number;
  controlMetrics: {
    activeCompanies: number;
    activeUsers: number;
    permissionRoles: number;
    openPeriods: number;
  };
}

export interface OperationalHealthSnapshot {
  checkedAt: string;
  status: 'healthy' | 'degraded' | 'critical';
  databaseIntegrity: boolean;
  auditChainValid: boolean;
  migrationsValid: boolean;
  appliedMigrations: number;
  pendingOutboxEvents: number;
  failedOutboxEvents: number;
  recentAuditEvents: number;
  runtimeDatabaseEncryption?: RuntimeDatabaseEncryptionEvidence;
}

export type RuntimeDatabaseEncryptionStatus = 'native-encrypted' | 'interim-persisted-envelope' | 'unknown';

export interface RuntimeDatabaseEncryptionEvidence {
  status: RuntimeDatabaseEncryptionStatus;
  driver: string;
  statement: string;
  checkedAt: string;
}

export interface OutboxReplayPlan {
  generatedAt: string;
  checkpointRevision: number;
  signature: string;
  items: Array<{
    id: string;
    type: string;
    aggregateType: string;
    aggregateId: string;
    occurredAt: string;
    attempts: number;
    classification: 'ready' | 'retryable' | 'conflict';
    reason: string;
  }>;
}

export interface ExecuteOutboxReplayInput {
  checkpointRevision: number;
  signature: string;
  outcomes: Array<{ eventId: string; result: 'published' | 'failed' }>;
}

export interface ResolveOutboxConflictInput {
  eventId: string;
  resolution: 'requeue' | 'supersede';
  reason: string;
}

/**
 * A workspace identity is deliberately separate from a legal entity. It may be
 * updated without silently renaming companies, GST registrations, documents,
 * or any foreign-keyed record.
 */
export interface UpdateTenantIdentityInput {
  name: string;
  slug: string;
  expectedVersion: number;
}

export interface CreateCompanyInput {
  code: string;
  name: string;
  legalName: string;
  countryCode: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  profile?: CompanyProfile;
}

export interface UpdateCompanyInput extends CreateCompanyInput {
  id: string;
  status: RecordStatus;
  expectedVersion: number;
}

export interface CreateBranchInput {
  companyId: string;
  code: string;
  name: string;
  timezone: string;
}

export interface UpdateBranchInput extends CreateBranchInput {
  id: string;
  status: RecordStatus;
  expectedVersion: number;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  temporaryPassword: string;
  roleIds: string[];
  companyIds: string[];
  branchIds: string[];
}

export interface CreateRoleInput {
  name: string;
  description: string;
  grantIds: string[];
}

export interface UpdateRolePolicyInput extends CreateRoleInput {
  id: string;
  expectedVersion: number;
}

export interface UpsertFieldAccessRuleInput {
  id?: string;
  roleId: string;
  resource: string;
  deniedFields: string[];
  readOnlyFields: string[];
}

export interface UpdateApprovalPolicyInput {
  id: string;
  name: string;
  approverRoleIds: string[];
  approvalsRequired: number;
  allowSelfApproval: boolean;
  expectedVersion: number;
}

export interface AssignRoleInput {
  userId: string;
  roleId: string;
  expectedVersion: number;
}

export interface IssueNumberInput {
  sequenceId: string;
  expectedVersion: number;
}

export interface IssueNumberResult {
  issuedNumber: string;
  snapshot: KernelSnapshot;
}

export interface TransitionWorkflowInput {
  instanceId: string;
  transitionId: string;
  expectedVersion: number;
}

export interface DecideApprovalInput {
  requestId: string;
  decision: 'approved' | 'rejected';
  expectedVersion: number;
}

export interface RegisterCustomFieldInput {
  resource: string;
  key: string;
  label: string;
  type: CustomFieldDefinition['type'];
  required: boolean;
  options: string[];
}

export interface KernelBackup {
  formatVersion: 1;
  createdAt: string;
  state: KernelState;
  checksum: string;
}

export interface BackupReceipt {
  fileName: string;
  createdAt: string;
  checksum: string;
}

export interface RestoreBackupInput {
  serializedBackup: string;
}
