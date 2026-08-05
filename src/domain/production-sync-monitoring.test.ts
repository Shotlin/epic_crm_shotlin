/**
 * production-sync-monitoring.test.ts
 *
 * Unit tests for production sync monitoring & backup/restore recovery drills.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateMultiBranchSync,
  runBackupRestoreDrill,
  type BranchSyncNode,
} from './production-sync-monitoring';

const mockNodes: BranchSyncNode[] = [
  {
    branchId: 'branch-hq',
    branchName: 'Mumbai Central HQ',
    isHeadquarters: true,
    localRevision: 1050,
    syncedRevision: 1050,
    replicationLagSeconds: 0,
    lastSyncAt: '2025-01-15T10:00:00Z',
    syncStatus: 'in-sync',
    pendingTransactionsCount: 0,
  },
  {
    branchId: 'branch-delhi',
    branchName: 'Delhi Retail Flagship',
    isHeadquarters: false,
    localRevision: 1048,
    syncedRevision: 1048,
    replicationLagSeconds: 12,
    lastSyncAt: '2025-01-15T09:59:48Z',
    syncStatus: 'in-sync',
    pendingTransactionsCount: 2,
  },
  {
    branchId: 'branch-blore',
    branchName: 'Bengaluru Tech Store',
    isHeadquarters: false,
    localRevision: 1020,
    syncedRevision: 1000,
    replicationLagSeconds: 350,
    lastSyncAt: '2025-01-15T09:54:10Z',
    syncStatus: 'lagging',
    pendingTransactionsCount: 20,
  },
];

describe('production-sync-monitoring domain', () => {
  it('evaluates multi-branch sync status accurately', () => {
    const summary = evaluateMultiBranchSync(mockNodes);

    expect(summary.totalBranches).toBe(3);
    expect(summary.branchesInSyncCount).toBe(2);
    expect(summary.branchesLaggingCount).toBe(1);
    expect(summary.overallSyncHealthPct).toBeCloseTo(66.67, 1);
    expect(summary.maxReplicationLagSeconds).toBe(350);
    expect(summary.operationalStatus).toBe('degraded'); // lagging branch
  });

  it('runs backup/restore recovery drill and validates RTO/RPO compliance', () => {
    const drill = runBackupRestoreDrill(
      'drill-2025-001',
      'a1b2c3d4e5f678901234567890abcdef',
      52428800, // 50MB
      45, // 45 seconds restore time
      15000, // 15,000 records
      120, // 2 minutes since backup
      300, // RTO target 5 mins
      900, // RPO target 15 mins
    );

    expect(drill.integrityVerificationStatus).toBe('passed');
    expect(drill.rtoCompliant).toBe(true);
    expect(drill.rpoCompliant).toBe(true);
    expect(drill.achievedRtoSeconds).toBe(45);
  });
});
