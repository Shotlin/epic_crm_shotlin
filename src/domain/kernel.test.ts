import { describe, expect, it } from 'vitest';
import {
  adoptBootstrapOwnerIdentity,
  assignRole,
  applyAuthorizationFoundation,
  applyWorkspaceOwnerRuntimeAuthorization,
  applyIndiaDemoLocalization,
  createBranch,
  createCompany,
  createCleanKernelState,
  createInitialKernelState,
  createKernelBackup,
  createRole,
  createUser,
  decideApproval,
  getAccessDecision,
  getKernelSnapshot,
  issueDocumentNumber,
  registerCustomField,
  restoreKernelBackup,
  transitionWorkflow,
  updateApprovalPolicy,
  updateBranch,
  updateTenantIdentity,
  updateRolePolicy,
  upsertFieldAccessRule,
  verifyAuditChain,
} from './kernel';

describe('business kernel', () => {
  it('starts with a coherent tenant, company, branch, and control context', () => {
    const state = createInitialKernelState();
    const snapshot = getKernelSnapshot(state, '2026-07-15T07:00:00.000Z');

    expect(snapshot.tenant.name).toBe('Epic BOS India Starter');
    expect(snapshot.companies[0]).toMatchObject({
      id: 'company-northstar-us',
      code: 'NSIN',
      name: 'Epic BOS India Starter Business',
      countryCode: 'IN',
      baseCurrency: 'INR',
    });
    expect(snapshot.currencies.find(({ code }) => code === 'INR')?.symbol).toBe('₹');
    expect(snapshot.customFields.find(({ key }) => key === 'operatingRegion')?.options).toEqual([
      'North India',
      'South India',
      'East India',
      'West India',
      'Central India',
      'Pan-India',
    ]);
    expect(snapshot.context.companyId).toBe('company-northstar-us');
    expect(snapshot.controlMetrics).toEqual({
      activeCompanies: 1,
      activeUsers: 3,
      permissionRoles: 5,
      openPeriods: 1,
    });
    expect(snapshot.pendingEvents).toBe(1);
  });

  it('creates a clean India-first kernel without seeded people or workflow evidence', () => {
    const state = createCleanKernelState();
    const snapshot = getKernelSnapshot(state, '2026-07-15T07:00:00.000Z');

    expect(state.context).toEqual({
      tenantId: 'tenant-northstar',
      companyId: 'company-northstar-us',
      branchId: 'branch-northstar-hq',
      actorId: 'user-avery',
    });
    expect(state.tenant).toMatchObject({
      id: 'tenant-northstar',
      name: 'Your India workspace',
      slug: 'your-india-workspace',
    });
    expect(state.companies).toEqual([expect.objectContaining({
      id: 'company-northstar-us',
      code: 'YOURCO',
      name: 'Your business',
      legalName: '',
      countryCode: 'IN',
      baseCurrency: 'INR',
    })]);
    expect(state.users).toEqual([expect.objectContaining({
      id: 'user-avery',
      displayName: 'Workspace administrator',
      email: 'workspace-owner@local.invalid',
    })]);
    expect(state.users.map(({ id }) => id)).not.toEqual(expect.arrayContaining(['user-priya', 'user-lee']));
    expect(state.currencies).toEqual([expect.objectContaining({ code: 'INR', symbol: '₹' })]);
    expect(state.workflowInstances).toEqual([]);
    expect(state.approvalRequests).toEqual([]);
    expect(state.attachments).toEqual([]);
    expect(state.audit[0]).toMatchObject({
      action: 'kernel.clean-starter.initialized',
      actorId: 'system:provisioner',
      previousHash: '0'.repeat(64),
    });
    expect(state.outbox[0]).toMatchObject({ type: 'kernel.clean-starter.initialized.v1' });
    expect(snapshot.controlMetrics.activeUsers).toBe(1);
    expect(verifyAuditChain(state)).toBe(true);
    expect(getAccessDecision(state, {
      userId: 'user-avery',
      companyId: state.context.companyId,
      branchId: state.context.branchId,
      resource: 'finance.journal',
      action: 'post',
    }).allowed).toBe(true);
  });

  it('does not rewrite the India starter organisation while evaluating the legacy USD migration', () => {
    const starter = createInitialKernelState();
    const evaluated = applyIndiaDemoLocalization(starter, '2026-07-22T00:00:00.000Z');

    expect(evaluated).toBe(starter);
    expect(evaluated.tenant.name).toBe('Epic BOS India Starter');
    expect(evaluated.companies[0]?.name).toBe('Epic BOS India Starter Business');
    expect(evaluated.audit).toHaveLength(1);
    expect(evaluated.migrations.some(({ id }) => id === '028-india-demo-localization')).toBe(false);
  });

  it('updates workspace identity with evidence without changing legal entities or durable scope keys', () => {
    const state = createInitialKernelState();
    const originalCompanies = structuredClone(state.companies);
    const originalContext = structuredClone(state.context);

    const next = updateTenantIdentity(
      state,
      {
        name: '  Kaveri Foods Operating System  ',
        slug: 'Kaveri-Foods',
        expectedVersion: state.tenant.version,
      },
      '2026-07-21T04:30:00.000Z',
      'audit-tenant-identity',
      'event-tenant-identity',
    );

    expect(state.tenant).toMatchObject({
      id: 'tenant-northstar',
      name: 'Epic BOS India Starter',
      slug: 'epic-bos-india-starter',
      version: 1,
    });
    expect(next.tenant).toMatchObject({
      id: 'tenant-northstar',
      name: 'Kaveri Foods Operating System',
      slug: 'kaveri-foods',
      version: 2,
    });
    expect(next.companies).toEqual(originalCompanies);
    expect(next.context).toEqual(originalContext);
    expect(next.revision).toBe(state.revision + 1);
    expect(next.audit.at(-1)).toMatchObject({
      id: 'audit-tenant-identity',
      action: 'tenant.identity.updated',
      resource: 'kernel.tenant',
      resourceId: state.tenant.id,
    });
    expect(next.outbox.at(-1)).toMatchObject({
      id: 'event-tenant-identity',
      type: 'kernel.tenant.identity-updated.v1',
      aggregateId: state.tenant.id,
    });
    expect(verifyAuditChain(next)).toBe(true);

    expect(() =>
      updateTenantIdentity(next, {
        name: 'Another workspace name',
        slug: 'another-workspace',
        expectedVersion: state.tenant.version,
      }),
    ).toThrow('changed');
  });

  it('adopts a verified bootstrap owner identity without changing its immutable id or access scope', () => {
    const state = createInitialKernelState();
    const originalOwner = state.users.find(({ id }) => id === 'user-avery');
    expect(originalOwner).toBeDefined();

    const next = adoptBootstrapOwnerIdentity(
      state,
      ' Founder@Kaveri.in ',
      ' Riya   Sharma ',
      '2026-07-21T04:31:00.000Z',
      'audit-owner-identity',
      'event-owner-identity',
    );
    const owner = next.users.find(({ id }) => id === 'user-avery');

    expect(state.users.find(({ id }) => id === 'user-avery')).toEqual(originalOwner);
    expect(owner).toMatchObject({
      id: originalOwner!.id,
      email: 'founder@kaveri.in',
      displayName: 'Riya Sharma',
      roleIds: originalOwner!.roleIds,
      companyIds: originalOwner!.companyIds,
      branchIds: originalOwner!.branchIds,
      version: originalOwner!.version + 1,
    });
    expect(next.companies).toEqual(state.companies);
    expect(next.context).toEqual(state.context);
    expect(next.audit.at(-1)).toMatchObject({
      id: 'audit-owner-identity',
      action: 'workspace.owner.identity-adopted',
      resource: 'kernel.user',
      resourceId: originalOwner!.id,
    });
    expect(next.outbox.at(-1)).toMatchObject({
      id: 'event-owner-identity',
      type: 'kernel.workspace-owner.identity-adopted.v1',
      aggregateId: originalOwner!.id,
    });
    expect(verifyAuditChain(next)).toBe(true);

    expect(
      adoptBootstrapOwnerIdentity(
        next,
        'founder@kaveri.in',
        'Riya Sharma',
        '2026-07-21T04:32:00.000Z',
        'audit-owner-identity-again',
        'event-owner-identity-again',
      ),
    ).toBe(next);
    expect(() =>
      adoptBootstrapOwnerIdentity(state, 'priya@northstar.example', 'Riya Sharma'),
    ).toThrow('already uses this email');
  });

  it('defaults to deny when no role grants an action', () => {
    const state = createInitialKernelState();
    const decision = getAccessDecision(state, {
      userId: 'user-lee',
      companyId: 'company-northstar-us',
      resource: 'finance.journal',
      action: 'post',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('defaults to deny');
    expect(decision.matchedRoleIds).toEqual([]);
  });

  it('upgrades a legacy owner once while preserving default-deny access for other users', () => {
    const legacy = structuredClone(createInitialKernelState());
    legacy.users = legacy.users.map((user) =>
      user.id === 'user-avery'
        ? {
            ...user,
            roleIds: user.roleIds.filter((roleId) => roleId !== 'role-workspace-owner'),
          }
        : user.id === 'user-lee'
          ? { ...user, roleIds: ['role-kernel-admin'] }
          : user,
    );
    legacy.roles = legacy.roles.filter(({ id }) => id !== 'role-workspace-owner');
    legacy.grants = legacy.grants.filter(({ id }) => !id.startsWith('grant-workspace-'));
    legacy.migrations = legacy.migrations.filter(
      ({ id }) => id !== '002-workspace-owner-authorization',
    );

    const migrated = applyAuthorizationFoundation(
      legacy,
      '2026-07-16T00:00:00.000Z',
    );
    const owner = migrated.users.find(({ id }) => id === 'user-avery');

    expect(owner?.roleIds).toContain('role-workspace-owner');
    expect(owner?.roleIds).toContain('role-kernel-admin');
    expect(getAccessDecision(migrated, {
      userId: 'user-avery',
      companyId: 'company-northstar-us',
      branchId: 'branch-northstar-hq',
      resource: 'payroll.run',
      action: 'post',
    }).allowed).toBe(true);
    expect(getAccessDecision(migrated, {
      userId: 'user-lee',
      companyId: 'company-northstar-us',
      branchId: 'branch-northstar-hq',
      resource: 'payroll.run',
      action: 'post',
    }).allowed).toBe(false);
    expect(migrated.audit.at(-1)?.actorId).toBe('system:migration');
    expect(verifyAuditChain(migrated)).toBe(true);

    const again = applyAuthorizationFoundation(
      migrated,
      '2026-07-16T01:00:00.000Z',
    );
    expect(again).toBe(migrated);
  });

  it('fails closed for an incomplete or conflicting authorization migration', () => {
    const incomplete = structuredClone(createInitialKernelState());
    incomplete.users = incomplete.users.map((user) =>
      user.id === 'user-avery'
        ? {
            ...user,
            roleIds: user.roleIds.filter((roleId) => roleId !== 'role-workspace-owner'),
          }
        : user,
    );
    expect(() => applyAuthorizationFoundation(incomplete)).toThrow(
      'missing the bootstrap owner role assignment',
    );

    const legacy = structuredClone(createInitialKernelState());
    legacy.users = legacy.users.map((user) =>
      user.id === 'user-avery'
        ? {
            ...user,
            roleIds: user.roleIds
              .filter((roleId) => roleId !== 'role-workspace-owner')
              .concat('role-finance-approver'),
          }
        : user,
    );
    legacy.roles = legacy.roles.filter(({ id }) => id !== 'role-workspace-owner');
    legacy.grants = legacy.grants.filter(({ id }) => !id.startsWith('grant-workspace-'));
    legacy.migrations = legacy.migrations.filter(
      ({ id }) => id !== '002-workspace-owner-authorization',
    );
    expect(() => applyAuthorizationFoundation(legacy)).toThrow(
      'Segregation-of-duties conflict',
    );
  });

  it('adds governed runtime visibility to the owner without changing the immutable foundation', () => {
    const state = createCleanKernelState();
    const migrated = applyWorkspaceOwnerRuntimeAuthorization(
      state,
      '2026-08-06T00:00:00.000Z',
    );
    const owner = migrated.users.find(({ id }) => id === 'user-avery');

    expect(owner?.roleIds).toContain('role-workspace-owner-runtime');
    expect(getAccessDecision(migrated, {
      userId: 'user-avery',
      companyId: migrated.context.companyId,
      branchId: migrated.context.branchId,
      resource: 'kernel.configuration',
      action: 'read',
    }).allowed).toBe(true);
    expect(getAccessDecision(migrated, {
      userId: 'user-avery',
      companyId: migrated.context.companyId,
      branchId: migrated.context.branchId,
      resource: 'release.control',
      action: 'read',
    }).allowed).toBe(true);
    expect(getAccessDecision(migrated, {
      userId: 'user-avery',
      companyId: migrated.context.companyId,
      branchId: migrated.context.branchId,
      resource: 'release.control',
      action: 'approve',
    }).allowed).toBe(true);
    expect(getAccessDecision(migrated, {
      userId: 'user-lee',
      companyId: migrated.context.companyId,
      branchId: migrated.context.branchId,
      resource: 'release.control',
      action: 'read',
    }).allowed).toBe(false);
    expect(migrated.migrations.at(-1)?.id).toBe('029-workspace-owner-runtime-authorization');
    expect(migrated.audit.at(-1)?.action).toBe('authorization.workspace-owner-runtime-migrated');
    expect(verifyAuditChain(migrated)).toBe(true);
    expect(applyWorkspaceOwnerRuntimeAuthorization(migrated)).toBe(migrated);
  });

  it('fails closed when runtime authorization evidence is tampered', () => {
    const migrated = applyWorkspaceOwnerRuntimeAuthorization(createCleanKernelState());
    const tampered = structuredClone(migrated);
    tampered.grants = tampered.grants.map((grant) =>
      grant.id === 'grant-workspace-runtime-release'
        ? { ...grant, actions: ['read'] }
        : grant,
    );

    expect(() => applyWorkspaceOwnerRuntimeAuthorization(tampered)).toThrow(
      'runtime authorization migration state is invalid',
    );
  });

  it('keeps the bootstrap workspace-owner role immutable and unassignable', () => {
    const state = createInitialKernelState();
    const ownerRole = state.roles.find(({ id }) => id === 'role-workspace-owner');

    expect(ownerRole).toBeDefined();
    expect(() =>
      updateRolePolicy(state, {
        id: 'role-workspace-owner',
        name: ownerRole!.name,
        description: ownerRole!.description,
        grantIds: ownerRole!.grantIds.slice(0, -1),
        expectedVersion: ownerRole!.version,
      }),
    ).toThrow('immutable');
    expect(() =>
      assignRole(state, {
        userId: 'user-lee',
        roleId: 'role-workspace-owner',
        expectedVersion: 1,
      }),
    ).toThrow('cannot be assigned manually');
    expect(() =>
      createUser(
        state,
        {
          email: 'owner-copy@northstar.example',
          displayName: 'Owner Copy',
          temporaryPassword: 'Owner-copy-2026!',
          roleIds: ['role-workspace-owner'],
          companyIds: ['company-northstar-us'],
          branchIds: ['branch-northstar-hq'],
        },
      ),
    ).toThrow('cannot be assigned to provisioned users');
    expect(() =>
      upsertFieldAccessRule(state, {
        roleId: 'role-workspace-owner',
        resource: 'payroll.run',
        deniedFields: [],
        readOnlyFields: ['netPay'],
      }),
    ).toThrow('immutable workspace-owner role');
  });

  it('enforces company and branch scope before permissions', () => {
    const state = createInitialKernelState();

    expect(
      getAccessDecision(state, {
        userId: 'user-avery',
        companyId: 'company-outside',
        resource: 'crm.opportunity',
        action: 'read',
      }).reason,
    ).toContain('company scope');
    expect(
      getAccessDecision(state, {
        userId: 'user-avery',
        companyId: 'company-northstar-us',
        branchId: 'branch-outside',
        resource: 'crm.opportunity',
        action: 'read',
      }).reason,
    ).toContain('branch scope');
  });

  it('applies field-level restrictions to otherwise permitted records', () => {
    const state = createInitialKernelState();
    const decision = getAccessDecision(state, {
      userId: 'user-avery',
      companyId: 'company-northstar-us',
      branchId: 'branch-northstar-hq',
      resource: 'crm.opportunity',
      action: 'update',
      fields: ['title', 'grossMargin'],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.deniedFields).toContain('grossMargin');
    expect(decision.readOnlyFields).toContain('ownerId');
    expect(decision.matchedRoleIds).toContain('role-sales-operator');
  });

  it('creates a normalized company with audit and outbox evidence', () => {
    const state = createInitialKernelState();
    const next = createCompany(
      state,
      {
        code: 'nsi',
        name: 'Epic BOS India Starter Business',
        legalName: 'Epic BOS India Starter Business Private Limited',
        countryCode: 'in',
        baseCurrency: 'inr',
        fiscalYearStartMonth: 4,
      },
      'company-northstar-in',
      '2026-07-15T08:00:00.000Z',
    );

    expect(state.companies).toHaveLength(1);
    expect(next.companies).toHaveLength(2);
    expect(next.companies[1]).toMatchObject({
      code: 'NSI',
      countryCode: 'IN',
      baseCurrency: 'INR',
    });
    expect(next.revision).toBe(2);
    expect(next.audit.at(-1)?.action).toBe('company.created');
    expect(next.outbox.at(-1)?.type).toBe('kernel.company.created.v1');
    expect(verifyAuditChain(next)).toBe(true);
  });

  it('governs an India company legal/contact profile without mixing it with workspace identity', () => {
    const state = createInitialKernelState();
    const next = createCompany(state, {
      code: 'NSP',
      name: 'Profile Shop',
      legalName: 'Profile Shop Private Limited',
      countryCode: 'IN',
      baseCurrency: 'INR',
      fiscalYearStartMonth: 4,
      profile: {
        addressLine1: '12 Market Road',
        city: 'Mumbai',
        stateCode: '27',
        postalCode: '400001',
        email: 'Accounts@Profile.in',
        website: 'https://profile.in',
        gstin: '27ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
      },
    }, 'company-profile', '2026-07-15T08:00:00.000Z');
    expect(next.companies.at(-1)?.profile).toMatchObject({ city: 'Mumbai', stateCode: '27', email: 'accounts@profile.in', gstin: '27ABCDE1234F1Z5' });
    expect(next.tenant.name).toBe(state.tenant.name);
    expect(verifyAuditChain(next)).toBe(true);
    expect(() => createCompany(state, {
      code: 'BADPROFILE', name: 'Bad Profile', legalName: 'Bad Profile Private Limited', countryCode: 'IN', baseCurrency: 'INR', fiscalYearStartMonth: 4,
      profile: { addressLine1: '12 Market Road', city: 'Mumbai', stateCode: '29', postalCode: '400001', gstin: '27ABCDE1234F1Z5' },
    })).toThrow('match the state code');
  });

  it('rejects duplicate companies and inactive or unknown currencies', () => {
    const state = createInitialKernelState();
    const input = {
      code: 'NSIN',
      name: 'Duplicate Northstar',
      legalName: 'Duplicate Northstar LLC',
      countryCode: 'IN',
      baseCurrency: 'INR',
      fiscalYearStartMonth: 4,
    };

    expect(() => createCompany(state, input)).toThrow('already exists');
    expect(() =>
      createCompany(state, { ...input, code: 'NSGB', baseCurrency: 'GBP' }),
    ).toThrow('not active');
  });

  it('assigns a compatible role immutably with optimistic concurrency', () => {
    const state = createInitialKernelState();
    const next = assignRole(
      state,
      { userId: 'user-lee', roleId: 'role-sales-operator', expectedVersion: 1 },
      '2026-07-15T08:10:00.000Z',
      'audit-role-sales',
      'event-role-sales',
    );

    expect(state.users[2]?.roleIds).toEqual([]);
    expect(next.users[2]?.roleIds).toEqual(['role-sales-operator']);
    expect(next.users[2]?.version).toBe(2);
    expect(() =>
      assignRole(next, {
        userId: 'user-lee',
        roleId: 'role-kernel-admin',
        expectedVersion: 1,
      }),
    ).toThrow('changed');
  });

  it('blocks conflicting duties before a role is assigned', () => {
    const state = createInitialKernelState();
    const requester = assignRole(
      state,
      {
        userId: 'user-lee',
        roleId: 'role-procurement-requester',
        expectedVersion: 1,
      },
      '2026-07-15T08:20:00.000Z',
      'audit-requester',
      'event-requester',
    );

    expect(() =>
      assignRole(requester, {
        userId: 'user-lee',
        roleId: 'role-finance-approver',
        expectedVersion: 2,
      }),
    ).toThrow('Segregation-of-duties conflict');
  });

  it('issues gap-controlled document numbers only in an open fiscal period', () => {
    const state = createInitialKernelState();
    const issued = issueDocumentNumber(
      state,
      { sequenceId: 'sequence-sales-order-2026', expectedVersion: 1 },
      '2026-07-15T09:00:00.000Z',
      'audit-number',
      'event-number',
    );

    expect(issued.issuedNumber).toBe('SO-26-27-00001');
    expect(issued.state.numberSequences[0]).toMatchObject({
      nextValue: 2,
      version: 2,
    });
    const closed = {
      ...state,
      fiscalPeriods: state.fiscalPeriods.map((period) => ({
        ...period,
        status: 'closed' as const,
      })),
    };
    expect(() =>
      issueDocumentNumber(closed, {
        sequenceId: 'sequence-sales-order-2026',
        expectedVersion: 1,
      }),
    ).toThrow('open fiscal period');
  });

  it('creates a pending approval instead of bypassing controlled workflow', () => {
    const state = createInitialKernelState();
    const next = transitionWorkflow(
      state,
      {
        instanceId: 'workflow-instance-po-1007',
        transitionId: 'transition-po-approve',
        expectedVersion: 1,
      },
      '2026-07-15T10:00:00.000Z',
      'approval-po-1007',
      'audit-approval-request',
      'event-approval-request',
    );

    expect(next.workflowInstances[0]?.state).toBe('submitted');
    expect(next.approvalRequests[0]).toMatchObject({
      id: 'approval-po-1007',
      status: 'pending',
      requestedBy: 'user-avery',
    });
    expect(() =>
      transitionWorkflow(next, {
        instanceId: 'workflow-instance-po-1007',
        transitionId: 'transition-po-approve',
        expectedVersion: 1,
      }),
    ).toThrow('already pending');
  });

  it('requires an independent authorized approver to complete the transition', () => {
    const state = transitionWorkflow(
      createInitialKernelState(),
      {
        instanceId: 'workflow-instance-po-1007',
        transitionId: 'transition-po-approve',
        expectedVersion: 1,
      },
      '2026-07-15T10:00:00.000Z',
      'approval-po-1007',
      'audit-approval-request',
      'event-approval-request',
    );

    expect(() =>
      decideApproval(state, {
        requestId: 'approval-po-1007',
        decision: 'approved',
        expectedVersion: 1,
      }),
    ).toThrow('not an authorized approver');

    const approverState = {
      ...state,
      context: { ...state.context, actorId: 'user-priya' },
    };
    const approved = decideApproval(
      approverState,
      {
        requestId: 'approval-po-1007',
        decision: 'approved',
        expectedVersion: 1,
      },
      '2026-07-15T10:15:00.000Z',
      'audit-approved',
      'event-approved',
    );

    expect(approved.approvalRequests[0]).toMatchObject({
      status: 'approved',
      decidedBy: 'user-priya',
    });
    expect(approved.workflowInstances[0]).toMatchObject({
      state: 'approved',
      version: 2,
    });
  });

  it('registers governed custom fields and protects reserved keys', () => {
    const state = createInitialKernelState();
    const next = registerCustomField(
      state,
      {
        resource: 'sales.order',
        key: 'customerProgram',
        label: 'Customer program',
        type: 'select',
        required: false,
        options: ['Strategic', 'Standard', 'Strategic'],
      },
      'custom-sales-program',
      '2026-07-15T11:00:00.000Z',
    );

    expect(next.customFields.at(-1)?.options).toEqual(['Strategic', 'Standard']);
    expect(next.audit.at(-1)?.resource).toBe('kernel.custom-field');
    expect(() =>
      registerCustomField(state, {
        resource: 'sales.order',
        key: 'companyId',
        label: 'Company',
        type: 'text',
        required: false,
        options: [],
      }),
    ).toThrow('reserved');
  });

  it('administers branches and automatically extends the owner scope', () => {
    const state = createInitialKernelState();
    const created = createBranch(
      state,
      {
        companyId: 'company-northstar-us',
        code: 'WEST',
        name: 'Western Operations',
        timezone: 'America/Los_Angeles',
      },
      'branch-west',
      '2026-07-15T11:10:00.000Z',
    );
    expect(created.branches.at(-1)).toMatchObject({
      id: 'branch-west',
      code: 'WEST',
      version: 1,
    });
    expect(
      created.users.find(({ id }) => id === 'user-avery')?.branchIds,
    ).toContain('branch-west');

    const updated = updateBranch(created, {
      id: 'branch-west',
      companyId: 'company-northstar-us',
      code: 'PACIFIC',
      name: 'Pacific Operations',
      timezone: 'America/Los_Angeles',
      status: 'active',
      expectedVersion: 1,
    });
    expect(updated.branches.at(-1)).toMatchObject({ code: 'PACIFIC', version: 2 });
  });

  it('creates scoped users and blocks conflicting duties at policy design time', () => {
    const state = createInitialKernelState();
    const next = createUser(
      state,
      {
        email: 'operator@example.com',
        displayName: 'Control Operator',
        temporaryPassword: 'Temporary!2026',
        roleIds: ['role-sales-operator'],
        companyIds: ['company-northstar-us'],
        branchIds: ['branch-northstar-hq'],
      },
      'user-control',
    );
    expect(next.users.at(-1)?.email).toBe('operator@example.com');

    expect(() =>
      createRole(state, {
        name: 'Unsafe journal superuser',
        description: 'Combines preparation and posting duties.',
        grantIds: ['grant-journal-prepare', 'grant-journal-post'],
      }),
    ).toThrow('Segregation-of-duties');
  });

  it('edits role, field, and approval policies through versioned controls', () => {
    const state = createInitialKernelState();
    const roleUpdated = updateRolePolicy(state, {
      id: 'role-sales-operator',
      name: 'Revenue operator',
      description: 'Operates CRM records with governed field access.',
      grantIds: ['grant-crm-read', 'grant-crm-write'],
      expectedVersion: 1,
    });
    const fieldUpdated = upsertFieldAccessRule(roleUpdated, {
      roleId: 'role-sales-operator',
      resource: 'crm.account',
      deniedFields: ['creditLimit'],
      readOnlyFields: ['ownerId'],
    }, 'field-account-credit');
    const approvalUpdated = updateApprovalPolicy(fieldUpdated, {
      id: 'approval-po-finance',
      name: 'Independent finance approval',
      approverRoleIds: ['role-finance-approver'],
      approvalsRequired: 1,
      allowSelfApproval: false,
      expectedVersion: 1,
    });

    expect(approvalUpdated.roles.find(({ id }) => id === 'role-sales-operator')).toMatchObject({
      name: 'Revenue operator',
      version: 2,
    });
    expect(approvalUpdated.fieldAccessRules.at(-1)?.deniedFields).toEqual(['creditLimit']);
    expect(approvalUpdated.approvalPolicies[0]).toMatchObject({
      name: 'Independent finance approval',
      version: 2,
    });
    expect(verifyAuditChain(approvalUpdated)).toBe(true);
  });

  it('detects any mutation in the append-only audit chain', () => {
    const state = createCompany(
      createInitialKernelState(),
      {
        code: 'NSI',
        name: 'Epic BOS India Starter Business',
        legalName: 'Epic BOS India Starter Business Private Limited',
        countryCode: 'IN',
        baseCurrency: 'INR',
        fiscalYearStartMonth: 4,
      },
      'company-northstar-in',
    );
    const tampered = structuredClone(state);
    tampered.audit[0]!.reason = 'Rewritten history';

    expect(verifyAuditChain(state)).toBe(true);
    expect(verifyAuditChain(tampered)).toBe(false);
  });

  it('creates checksum-verified, isolated backups and rejects tampering', () => {
    const state = createInitialKernelState();
    const backup = createKernelBackup(state, '2026-07-15T12:00:00.000Z');
    const restored = restoreKernelBackup(backup);

    expect(backup.formatVersion).toBe(1);
    expect(backup.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(restored).toEqual(state);
    expect(restored).not.toBe(state);

    const tampered = structuredClone(backup);
    tampered.state.tenant.name = 'Tampered tenant';
    expect(() => restoreKernelBackup(tampered)).toThrow('checksum');
  });
});
