import { createHash } from 'node:crypto';
import { readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import {
  assignRole,
  applyAuthorizationFoundation,
  applyAssetCapitalizationAuthorization,
  applyAssetCustodyTransferAuthorization,
  applyAssetComponentizationAuthorization,
  applyAssetComponentAllocationAuthorization,
  applyAssetTransferAccountingAuthorization,
  applyAssetSaleDisposalAuthorization,
  applyAssetLifecycleAuthorization,
  applyAssetDepreciationAuthorization,
  applyAssetRetirementAuthorization,
  applyAssetMaintenanceAuthorization,
  applyCrmCommunicationAuthorization,
  applyCrmConfigurationAuthorization,
  applyCrmImportAuthorization,
  applyDeliveryAuthorization,
  applyGeneralLedgerAuthorization,
  applyInventoryWarehouseAuthorization,
  applyIndiaDemoLocalization,
  applyManufacturingAuthorization,
  applyPartyMasterAuthorization,
  applyProcurementAuthorization,
  applyProcurementRequisitionAuthorization,
  applyReceivablesAuthorization,
  applySalesCommercialAuthorization,
  applySalesGeographyAuthorization,
  applySalesMasterDataAuthorization,
  applyWorkforceAuthorization,
  adoptBootstrapOwnerIdentity,
  createBranch,
  createCleanKernelState,
  createCompany,
  createRole,
  createUser,
  decideApproval,
  getAccessDecision,
  getKernelSnapshot,
  issueDocumentNumber,
  registerCustomField,
  transitionWorkflow,
  updateApprovalPolicy,
  updateBranch,
  updateCompany,
  updateRolePolicy,
  updateTenantIdentity,
  upsertFieldAccessRule,
  verifyAuditChain,
  WORKSPACE_OWNER_ID,
  WORKSPACE_OWNER_ROLE_ID,
} from '../domain/kernel';
import type {
  AccessDecision,
  AssignRoleInput,
  CreateBranchInput,
  CreateCompanyInput,
  CreateRoleInput,
  CreateUserInput,
  DecideApprovalInput,
  IssueNumberInput,
  IssueNumberResult,
  KernelSnapshot,
  KernelState,
  BusinessAction,
  RegisterCustomFieldInput,
  TransitionWorkflowInput,
  UpdateApprovalPolicyInput,
  UpdateBranchInput,
  UpdateCompanyInput,
  UpdateRolePolicyInput,
  UpdateTenantIdentityInput,
  UpsertFieldAccessRuleInput,
  OperationalHealthSnapshot,
  OutboxReplayPlan,
  ExecuteOutboxReplayInput,
  ResolveOutboxConflictInput,
} from '../shared/kernel-contracts';
import type { BusinessDatabase } from './database';

function isKernelState(value: unknown): value is KernelState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<KernelState>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.revision === 'number' &&
    Array.isArray(candidate.companies) &&
    Array.isArray(candidate.users) &&
    Array.isArray(candidate.roles) &&
    Array.isArray(candidate.audit) &&
    Array.isArray(candidate.outbox) &&
    Array.isArray(candidate.migrations)
  );
}

export class KernelStore {
  private readonly filePath: string;
  private readonly database: BusinessDatabase;
  private state: KernelState = createCleanKernelState();
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(database: BusinessDatabase, dataDirectory: string) {
    this.database = database;
    this.filePath = path.join(dataDirectory, 'kernel-state.v1.json');
  }

  public async initialize(): Promise<void> {
    const databaseState = this.database.loadState<KernelState>('kernel');
    if (
      databaseState &&
      isKernelState(databaseState.payload) &&
      verifyAuditChain(databaseState.payload)
    ) {
      this.state = applyAssetComponentizationAuthorization(applyAssetCustodyTransferAuthorization(applyAssetRetirementAuthorization(applyAssetDepreciationAuthorization(applyAssetCapitalizationAuthorization(applyAssetMaintenanceAuthorization(applyWorkforceAuthorization(applyDeliveryAuthorization(applyManufacturingAuthorization(applyProcurementAuthorization(applyInventoryWarehouseAuthorization(
        applyCrmCommunicationAuthorization(
          applyCrmImportAuthorization(
          applyCrmConfigurationAuthorization(
            applySalesGeographyAuthorization(
              applySalesMasterDataAuthorization(
                applyReceivablesAuthorization(
                  applySalesCommercialAuthorization(
                    applyPartyMasterAuthorization(
                      applyGeneralLedgerAuthorization(
                        applyAuthorizationFoundation(databaseState.payload),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      )))))))))));
      this.state = applyAssetComponentAllocationAuthorization(this.state);
      this.state = applyAssetTransferAccountingAuthorization(this.state);
      this.state = applyAssetSaleDisposalAuthorization(this.state);
      this.state = applyAssetLifecycleAuthorization(this.state);
      this.state = applyProcurementRequisitionAuthorization(this.state);
      this.state = applyIndiaDemoLocalization(this.state);
      if (this.state !== databaseState.payload) await this.persist();
      return;
    }

    let stored: KernelState | null = null;
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const candidate: unknown = JSON.parse(raw);
      if (!isKernelState(candidate) || !verifyAuditChain(candidate)) {
        throw new Error('Stored kernel data failed shape or audit verification.');
      }
      stored = candidate;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : '';
      if (code !== 'ENOENT') await this.backupCorruptState();
      this.state = applyAssetComponentizationAuthorization(applyAssetCustodyTransferAuthorization(applyAssetRetirementAuthorization(applyAssetDepreciationAuthorization(applyAssetCapitalizationAuthorization(applyAssetMaintenanceAuthorization(applyWorkforceAuthorization(applyDeliveryAuthorization(applyManufacturingAuthorization(applyProcurementAuthorization(applyInventoryWarehouseAuthorization(
        applyCrmCommunicationAuthorization(
          applyCrmImportAuthorization(
          applyCrmConfigurationAuthorization(
            applySalesGeographyAuthorization(
              applySalesMasterDataAuthorization(
                applyReceivablesAuthorization(
                  applySalesCommercialAuthorization(
                    applyPartyMasterAuthorization(
                      applyGeneralLedgerAuthorization(
                        applyAuthorizationFoundation(createCleanKernelState()),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      )))))))))));
      this.state = applyAssetComponentAllocationAuthorization(this.state);
      this.state = applyAssetTransferAccountingAuthorization(this.state);
      this.state = applyAssetSaleDisposalAuthorization(this.state);
      this.state = applyAssetLifecycleAuthorization(this.state);
      this.state = applyProcurementRequisitionAuthorization(this.state);
      this.state = applyIndiaDemoLocalization(this.state);
      await this.persist();
      return;
    }

    this.state = applyAssetComponentizationAuthorization(applyAssetCustodyTransferAuthorization(applyAssetRetirementAuthorization(applyAssetDepreciationAuthorization(applyAssetCapitalizationAuthorization(applyAssetMaintenanceAuthorization(applyWorkforceAuthorization(applyDeliveryAuthorization(applyManufacturingAuthorization(applyProcurementAuthorization(applyInventoryWarehouseAuthorization(
      applyCrmCommunicationAuthorization(
        applyCrmImportAuthorization(
        applyCrmConfigurationAuthorization(
          applySalesGeographyAuthorization(
            applySalesMasterDataAuthorization(
              applyReceivablesAuthorization(
                applySalesCommercialAuthorization(
                  applyPartyMasterAuthorization(
                    applyGeneralLedgerAuthorization(
                      applyAuthorizationFoundation(stored),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    )))))))))));
    this.state = applyAssetComponentAllocationAuthorization(this.state);
    this.state = applyAssetTransferAccountingAuthorization(this.state);
    this.state = applyAssetSaleDisposalAuthorization(this.state);
    this.state = applyAssetLifecycleAuthorization(this.state);
    this.state = applyProcurementRequisitionAuthorization(this.state);
    this.state = applyIndiaDemoLocalization(this.state);
    await this.persist();
    await this.archiveMigratedState();
  }

  public getSnapshot(): KernelSnapshot {
    return getKernelSnapshot(this.state);
  }

  public getOperationalHealth(): OperationalHealthSnapshot {
    const databaseIntegrity = this.database.verifyIntegrity();
    const auditChainValid = verifyAuditChain(this.state);
    const migrations = this.database.getAppliedMigrations();
    const migrationsValid = migrations.length > 0 && migrations.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum));
    const pendingOutboxEvents = this.state.outbox.filter(({ status }) => status === 'pending').length;
    const failedOutboxEvents = this.state.outbox.filter(({ status }) => status === 'failed').length;
    const status = !databaseIntegrity || !auditChainValid || !migrationsValid || failedOutboxEvents > 0
      ? 'critical'
      : pendingOutboxEvents > 0
        ? 'degraded'
        : 'healthy';
    return {
      checkedAt: new Date().toISOString(),
      status,
      databaseIntegrity,
      auditChainValid,
      migrationsValid,
      appliedMigrations: migrations.length,
      pendingOutboxEvents,
      failedOutboxEvents,
      recentAuditEvents: this.state.audit.length,
    };
  }

  public getOutboxReplayPlan(): OutboxReplayPlan {
    const seenAggregates = new Set<string>();
    const items = this.state.outbox
      .filter(({ status }) => status !== 'published')
      .slice()
      .sort((left, right) => `${left.occurredAt}:${left.id}`.localeCompare(`${right.occurredAt}:${right.id}`))
      .map((event) => {
        const aggregateKey = `${event.aggregateType}:${event.aggregateId}`;
        const duplicate = seenAggregates.has(aggregateKey);
        seenAggregates.add(aggregateKey);
        const classification = duplicate || event.attempts >= 5
          ? 'conflict' as const
          : event.status === 'failed'
            ? 'retryable' as const
            : 'ready' as const;
        return {
          id: event.id,
          type: event.type,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          occurredAt: event.occurredAt,
          attempts: event.attempts,
          classification,
          reason: duplicate
            ? 'A newer unsent event targets the same aggregate; reconcile before replay.'
            : event.attempts >= 5
              ? 'Retry budget exhausted; operator review required.'
              : event.status === 'failed'
                ? 'Previous delivery failed; deterministic retry is allowed.'
                : 'Ready in deterministic occurred-at and event-id order.',
        };
      });
    const generatedAt = new Date().toISOString();
    const checkpointRevision = this.state.revision;
    const signature = createHash('sha256')
      .update(JSON.stringify({ checkpointRevision, items }))
      .digest('hex');
    return { generatedAt, checkpointRevision, signature, items };
  }

  public executeOutboxReplay(input: ExecuteOutboxReplayInput, actorId: string): Promise<KernelSnapshot> {
    return this.enqueue(async () => {
      this.activateActor(actorId);
      const plan = this.getOutboxReplayPlan();
      if (input.checkpointRevision !== plan.checkpointRevision || input.signature !== plan.signature) {
        throw new Error('Replay checkpoint is stale or has an invalid signature. Generate a new plan before execution.');
      }
      const allowed = new Map(plan.items.map((item) => [item.id, item.classification]));
      const outcomes = new Map(input.outcomes.map(({ eventId, result }) => [eventId, result]));
      const now = new Date().toISOString();
      const previousHash = this.state.audit.at(-1)?.hash ?? 'GENESIS';
      const unsignedAudit = {
        id: `audit-outbox-replay-${this.state.revision + 1}`,
        occurredAt: now,
        actorId,
        action: 'outbox.replay-executed',
        resource: 'outbox',
        resourceId: `checkpoint-${input.checkpointRevision}`,
        reason: 'Executed a signed deterministic replay checkpoint with explicit per-event outcomes.',
        before: { checkpointRevision: input.checkpointRevision, outcomes: input.outcomes },
        after: { published: input.outcomes.filter(({ result }) => result === 'published').length, failed: input.outcomes.filter(({ result }) => result === 'failed').length },
        previousHash,
      };
      const audit = { ...unsignedAudit, hash: createHash('sha256').update(JSON.stringify(unsignedAudit)).digest('hex') };
      this.state = {
        ...this.state,
        revision: this.state.revision + 1,
        outbox: this.state.outbox.map((event) => {
          const result = outcomes.get(event.id);
          const classification = allowed.get(event.id);
          if (!result || !classification || classification === 'conflict') return event;
          return { ...event, status: result, attempts: event.attempts + 1 };
        }),
        audit: [...this.state.audit, audit],
      };
      await this.persist();
      return this.getSnapshot();
    });
  }

  public resolveOutboxConflict(input: ResolveOutboxConflictInput, actorId: string): Promise<KernelSnapshot> {
    return this.enqueue(async () => {
      this.activateActor(actorId);
      const plan = this.getOutboxReplayPlan();
      const item = plan.items.find(({ id }) => id === input.eventId);
      if (!item || item.classification !== 'conflict') throw new Error('Only a current conflict-classified outbox event can be resolved.');
      const now = new Date().toISOString();
      const previousHash = this.state.audit.at(-1)?.hash ?? 'GENESIS';
      const unsignedAudit = {
        id: `audit-outbox-conflict-${this.state.revision + 1}`,
        occurredAt: now,
        actorId,
        action: 'outbox.conflict-resolved',
        resource: 'outbox',
        resourceId: input.eventId,
        reason: input.reason,
        before: { classification: item.classification, attempts: item.attempts },
        after: { resolution: input.resolution },
        previousHash,
      };
      const audit = { ...unsignedAudit, hash: createHash('sha256').update(JSON.stringify(unsignedAudit)).digest('hex') };
      this.state = {
        ...this.state,
        revision: this.state.revision + 1,
        outbox: this.state.outbox.map((event) => event.id !== input.eventId ? event : input.resolution === 'requeue'
          ? { ...event, status: 'pending', attempts: 0 }
          : { ...event, status: 'published' }),
        audit: [...this.state.audit, audit],
      };
      await this.persist();
      return this.getSnapshot();
    });
  }

  /**
   * Central policy facade for main-process IPC. Operational records are not
   * yet individually company-scoped, so this applies the active kernel
   * company/branch boundary while record-level scope is introduced.
   */
  public getAccessDecision(
    actorId: string,
    resource: string,
    action: BusinessAction,
    fields?: string[],
  ): AccessDecision {
    return this.getAccessDecisionInScope(
      actorId,
      this.state.context.companyId,
      this.state.context.branchId,
      resource,
      action,
      fields,
    );
  }

  public assertAuthorized(
    actorId: string,
    resource: string,
    action: BusinessAction,
    fields?: string[],
  ): void {
    const decision = this.getAccessDecision(actorId, resource, action, fields);
    if (!decision.allowed) throw new Error(decision.reason);
  }

  /**
   * Authorize an explicitly company-scoped record. Most legacy operational
   * records still use the active workspace context, but canonical books must
   * be checked against the company and branch that own the journal itself.
   */
  public getAccessDecisionInScope(
    actorId: string,
    companyId: string,
    branchId: string | undefined,
    resource: string,
    action: BusinessAction,
    fields?: string[],
  ): AccessDecision {
    return getAccessDecision(this.state, {
      userId: actorId,
      companyId,
      branchId,
      resource,
      action,
      fields,
    });
  }

  public assertAuthorizedInScope(
    actorId: string,
    companyId: string,
    branchId: string | undefined,
    resource: string,
    action: BusinessAction,
    fields?: string[],
  ): void {
    const decision = this.getAccessDecisionInScope(
      actorId,
      companyId,
      branchId,
      resource,
      action,
      fields,
    );
    if (!decision.allowed) throw new Error(decision.reason);
  }

  /**
   * Transitional compatibility check for the immutable bootstrap owner.
   * A reusable workspace-read grant is intentionally not treated as elevated
   * finance authority because it can also be assigned to a viewer role.
   */
  public isBootstrapWorkspaceOwner(actorId: string): boolean {
    const owner = this.state.users.find(({ id }) => id === WORKSPACE_OWNER_ID);
    return Boolean(
      actorId === WORKSPACE_OWNER_ID &&
        owner?.status === 'active' &&
        owner.roleIds.includes(WORKSPACE_OWNER_ROLE_ID),
    );
  }

  public getActiveUserIdsForRoles(roleIds: readonly string[]): string[] {
    const roles = new Set(roleIds);
    return this.state.users
      .filter((user) => user.status === 'active' && user.roleIds.some((roleId) => roles.has(roleId)))
      .map(({ id }) => id);
  }

  public getActiveUserIdsForCompany(companyId: string): string[] {
    return this.state.users
      .filter((user) => user.status === 'active' && user.companyIds.includes(companyId))
      .map(({ id }) => id);
  }

  public getActiveUserIdsForBranch(branchId: string): string[] {
    return this.state.users
      .filter((user) => user.status === 'active' && user.branchIds.includes(branchId))
      .map(({ id }) => id);
  }

  public getApprovalPolicyApproverRoleIds(id: string): string[] {
    return this.state.approvalPolicies.find((policy) => policy.id === id)?.approverRoleIds ?? [];
  }

  public addCompany(
    input: CreateCompanyInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.enqueue(async () => {
      this.activateActor(actorId);
      this.state = createCompany(this.state, input);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public updateCompany(
    input: UpdateCompanyInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.mutate(actorId, (state) => updateCompany(state, input));
  }

  public updateTenantIdentity(
    input: UpdateTenantIdentityInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.mutate(actorId, (state) => updateTenantIdentity(state, input));
  }

  public adoptBootstrapOwnerIdentity(
    email: string,
    displayName: string,
    actorId = WORKSPACE_OWNER_ID,
  ): Promise<KernelSnapshot> {
    return this.mutate(
      actorId,
      (state) => adoptBootstrapOwnerIdentity(state, email, displayName),
    );
  }

  public addBranch(
    input: CreateBranchInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.mutate(actorId, (state) => createBranch(state, input));
  }

  public updateBranch(
    input: UpdateBranchInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.mutate(actorId, (state) => updateBranch(state, input));
  }

  public addUser(
    input: CreateUserInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.mutate(actorId, (state) => createUser(state, input));
  }

  public addRole(
    input: CreateRoleInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.mutate(actorId, (state) => createRole(state, input));
  }

  public updateRolePolicy(
    input: UpdateRolePolicyInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.mutate(actorId, (state) => updateRolePolicy(state, input));
  }

  public upsertFieldAccessRule(
    input: UpsertFieldAccessRuleInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.mutate(actorId, (state) => upsertFieldAccessRule(state, input));
  }

  public updateApprovalPolicy(
    input: UpdateApprovalPolicyInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.mutate(actorId, (state) => updateApprovalPolicy(state, input));
  }

  public addRoleToUser(
    input: AssignRoleInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.enqueue(async () => {
      this.activateActor(actorId);
      this.state = assignRole(this.state, input);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public issueNumber(
    input: IssueNumberInput,
    actorId = this.state.context.actorId,
  ): Promise<IssueNumberResult> {
    return this.enqueue(async () => {
      this.activateActor(actorId);
      const issued = issueDocumentNumber(this.state, input);
      this.state = issued.state;
      await this.persist();
      return { issuedNumber: issued.issuedNumber, snapshot: this.getSnapshot() };
    });
  }

  public moveWorkflow(
    input: TransitionWorkflowInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.enqueue(async () => {
      this.activateActor(actorId);
      this.state = transitionWorkflow(this.state, input);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public decideApproval(
    input: DecideApprovalInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.enqueue(async () => {
      this.activateActor(actorId);
      this.state = decideApproval(this.state, input);
      await this.persist();
      return this.getSnapshot();
    });
  }

  public addCustomField(
    input: RegisterCustomFieldInput,
    actorId = this.state.context.actorId,
  ): Promise<KernelSnapshot> {
    return this.enqueue(async () => {
      this.activateActor(actorId);
      this.state = registerCustomField(this.state, input);
      await this.persist();
      return this.getSnapshot();
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(task, task);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private mutate(
    actorId: string,
    operation: (state: KernelState) => KernelState,
  ): Promise<KernelSnapshot> {
    return this.enqueue(async () => {
      this.activateActor(actorId);
      this.state = operation(this.state);
      await this.persist();
      return this.getSnapshot();
    });
  }

  private activateActor(actorId: string): void {
    if (!this.state.users.some((user) => user.id === actorId)) {
      throw new Error('The authenticated user is not active in this tenant.');
    }
    this.state = {
      ...this.state,
      context: { ...this.state.context, actorId },
    };
  }

  private async persist(): Promise<void> {
    this.database.saveState(
      'kernel',
      this.state.schemaVersion,
      this.state.revision,
      this.state,
    );
  }

  private async backupCorruptState(): Promise<void> {
    try {
      await rename(
        this.filePath,
        this.filePath + '.corrupt-' + String(Date.now()),
      );
    } catch {
      // Recovery must remain available even if a locked file cannot be moved.
    }
  }

  private async archiveMigratedState(): Promise<void> {
    try {
      await rename(
        this.filePath,
        this.filePath + '.migrated-' + String(Date.now()),
      );
    } catch {
      // A locked legacy file does not invalidate the committed SQLite import.
    }
  }
}
