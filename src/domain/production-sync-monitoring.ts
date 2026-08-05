/**
 * production-sync-monitoring.ts
 *
 * Phase R9 – Production Sync, Monitoring, Multi-Branch Rollout & Recovery Drill Engine
 *
 * Provides multi-branch data synchronization tracking, replication lag monitoring,
 * automated database backup/restore recovery drill verification, and RPO/RTO metrics.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface BranchSyncNode {
  branchId: string;
  branchName: string;
  isHeadquarters: boolean;
  localRevision: number;
  syncedRevision: number;
  replicationLagSeconds: number;
  lastSyncAt: string;
  syncStatus: 'in-sync' | 'lagging' | 'offline' | 'conflict-detected';
  pendingTransactionsCount: number;
}

export interface BackupRestoreDrillRecord {
  drillId: string;
  executedAt: string;
  backupFileChecksum: string;
  backupSizeBytes: number;
  restoreTimeSeconds: number;
  integrityVerificationStatus: 'passed' | 'failed' | 'corrupted';
  recoveredRecordsCount: number;
  targetRtoSeconds: number; // max allowable Recovery Time Objective
  achievedRtoSeconds: number;
  targetRpoSeconds: number; // max allowable Recovery Point Objective
  achievedRpoSeconds: number;
  rpoCompliant: boolean;
  rtoCompliant: boolean;
  executedBy: string;
}

export interface MultiBranchSyncSummary {
  headquartersBranchId: string;
  totalBranches: number;
  branchesInSyncCount: number;
  branchesLaggingCount: number;
  branchesOfflineCount: number;
  overallSyncHealthPct: number;
  maxReplicationLagSeconds: number;
  nodes: BranchSyncNode[];
  latestBackupDrill?: BackupRestoreDrillRecord;
  operationalStatus: 'healthy' | 'degraded' | 'critical';
}

/**
 * Evaluates the synchronization health of a multi-branch retail network.
 */
export function evaluateMultiBranchSync(
  nodes: BranchSyncNode[],
  latestBackupDrill?: BackupRestoreDrillRecord,
): MultiBranchSyncSummary {
  const hqNode = nodes.find((n) => n.isHeadquarters) ?? nodes[0];
  const hqBranchId = hqNode?.branchId ?? 'branch-hq';

  const branchesInSyncCount = nodes.filter((n) => n.syncStatus === 'in-sync').length;
  const branchesLaggingCount = nodes.filter((n) => n.syncStatus === 'lagging').length;
  const branchesOfflineCount = nodes.filter((n) => n.syncStatus === 'offline' || n.syncStatus === 'conflict-detected').length;

  const maxReplicationLagSeconds = nodes.reduce((max, n) => Math.max(max, n.replicationLagSeconds), 0);
  const overallSyncHealthPct = nodes.length > 0 ? round2((branchesInSyncCount / nodes.length) * 100) : 100;

  let operationalStatus: MultiBranchSyncSummary['operationalStatus'] = 'healthy';
  if (branchesOfflineCount > 0 || (latestBackupDrill && !latestBackupDrill.rtoCompliant)) {
    operationalStatus = 'critical';
  } else if (branchesLaggingCount > 0 || maxReplicationLagSeconds > 300) {
    operationalStatus = 'degraded';
  }

  return {
    headquartersBranchId: hqBranchId,
    totalBranches: nodes.length,
    branchesInSyncCount,
    branchesLaggingCount,
    branchesOfflineCount,
    overallSyncHealthPct,
    maxReplicationLagSeconds,
    nodes,
    latestBackupDrill,
    operationalStatus,
  };
}

/**
 * Runs a simulated database backup and restore recovery drill to verify RPO/RTO compliance.
 */
export function runBackupRestoreDrill(
  drillId: string,
  backupFileChecksum: string,
  backupSizeBytes: number,
  restoreTimeSeconds: number,
  recoveredRecordsCount: number,
  timeSinceLastBackupSeconds: number,
  targetRtoSeconds = 300, // 5 minutes
  targetRpoSeconds = 900, // 15 minutes
  executedBy = 'system-operator',
  executedAt = new Date().toISOString(),
): BackupRestoreDrillRecord {
  const achievedRtoSeconds = restoreTimeSeconds;
  const achievedRpoSeconds = timeSinceLastBackupSeconds;

  const rtoCompliant = achievedRtoSeconds <= targetRtoSeconds;
  const rpoCompliant = achievedRpoSeconds <= targetRpoSeconds;
  const integrityVerificationStatus = backupFileChecksum.length >= 32 ? 'passed' : 'failed';

  return {
    drillId,
    executedAt,
    backupFileChecksum,
    backupSizeBytes,
    restoreTimeSeconds,
    integrityVerificationStatus,
    recoveredRecordsCount,
    targetRtoSeconds,
    achievedRtoSeconds,
    targetRpoSeconds,
    achievedRpoSeconds,
    rpoCompliant,
    rtoCompliant,
    executedBy,
  };
}
