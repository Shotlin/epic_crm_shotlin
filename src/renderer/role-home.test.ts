import { describe, expect, it } from 'vitest';
import type { KernelSnapshot } from '../shared/kernel-contracts';
import { advancedRetailWorkspacesForUser, preferredWorkspaceForUser } from './role-home';

const snapshot = { users: [{ id: 'finance-user', email: 'f@example.test', displayName: 'Finance', status: 'active', roleIds: ['finance-role'], companyIds: ['company'], branchIds: ['branch'], version: 1 }], roles: [{ id: 'finance-role', name: 'Finance', description: '', grantIds: ['finance-grant'], system: false, version: 1 }], grants: [{ id: 'finance-grant', resource: 'finance.journal', actions: ['read'] }], } as unknown as KernelSnapshot;

describe('role-aware home workspace', () => {
  it('opens the retail workspace owner at the simple command centre', () => {
    const ownerSnapshot = {
      users: [{ id: 'owner-user', email: 'owner@example.test', displayName: 'Owner', status: 'active', roleIds: ['role-workspace-owner'], companyIds: ['company'], branchIds: ['branch'], version: 1 }],
      roles: [],
      grants: [],
    } as unknown as KernelSnapshot;

    expect(preferredWorkspaceForUser(ownerSnapshot, 'owner-user')).toBe('command');
  });

  it('opens a user at the workspace matching the strongest governed role', () => {
    expect(preferredWorkspaceForUser(snapshot, 'finance-user')).toBe('finance');
  });

  it('grants specialist retail extensions from the signed-in user policy, not from a generic left rail default', () => {
    expect(advancedRetailWorkspacesForUser(snapshot, 'finance-user')).toEqual(['finance']);

    const ownerSnapshot = {
      users: [{ id: 'owner-user', email: 'owner@example.test', displayName: 'Owner', status: 'active', roleIds: ['role-workspace-owner'], companyIds: ['company'], branchIds: ['branch'], version: 1 }],
      roles: [],
      grants: [],
    } as unknown as KernelSnapshot;
    expect(advancedRetailWorkspacesForUser(ownerSnapshot, 'owner-user')).toEqual([
      'command', 'crm', 'sales', 'finance', 'operations', 'people', 'service', 'intelligence', 'settings',
    ]);
    expect(advancedRetailWorkspacesForUser(snapshot, 'unknown')).toEqual([]);
  });
  it('fails safely to CRM for unknown users', () => {
    expect(preferredWorkspaceForUser(snapshot, 'unknown')).toBe('crm');
  });
});
