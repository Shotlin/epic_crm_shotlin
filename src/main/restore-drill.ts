import { createHash } from 'node:crypto';

export type RestoreDrillStatus = 'passed' | 'blocked';

export interface RestoreDrillEvidence {
  id: string;
  backupReference: string;
  backupChecksum: string;
  restoredDatabaseChecksum: string;
  target: 'isolated-test-database';
  operatorId: string;
  startedAt: string;
  completedAt: string;
  durationBudgetMs: number;
  integrityVerified: boolean;
  auditChainVerified: boolean;
  migrationsVerified: boolean;
  status: RestoreDrillStatus;
  checksum: string;
}

export interface RestoreDrillValidation {
  ready: boolean;
  durationMs: number | null;
  blockers: string[];
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

/** Builds a checksum-addressed restore drill record; it never restores a live database itself. */
export function createRestoreDrillEvidence(input: Omit<RestoreDrillEvidence, 'status' | 'checksum'>): RestoreDrillEvidence {
  const validation = validateRestoreDrillEvidence(input);
  const unsigned = { ...input, status: validation.ready ? 'passed' as const : 'blocked' as const };
  return { ...unsigned, checksum: digest(unsigned) };
}

export function validateRestoreDrillEvidence(input: Omit<RestoreDrillEvidence, 'status' | 'checksum'> | RestoreDrillEvidence): RestoreDrillValidation {
  const blockers: string[] = [];
  const started = Date.parse(input.startedAt);
  const completed = Date.parse(input.completedAt);
  const durationMs = Number.isFinite(started) && Number.isFinite(completed) && completed >= started ? completed - started : null;
  if (!input.id.trim()) blockers.push('Drill identity is missing.');
  if (!input.backupReference.trim()) blockers.push('Backup reference is missing.');
  if (!/^[a-f0-9]{64}$/i.test(input.backupChecksum) || !/^[a-f0-9]{64}$/i.test(input.restoredDatabaseChecksum)) blockers.push('Backup and restored database checksums must be SHA-256 digests.');
  if (input.target !== 'isolated-test-database') blockers.push('Restore target must be an isolated test database.');
  if (!input.operatorId.trim()) blockers.push('Restore operator is missing.');
  if (durationMs === null) blockers.push('Drill timestamps are invalid.');
  if (!Number.isFinite(input.durationBudgetMs) || input.durationBudgetMs <= 0 || (durationMs !== null && durationMs > input.durationBudgetMs)) blockers.push('Restore drill exceeded its duration budget.');
  if (!input.integrityVerified) blockers.push('SQLite integrity verification is missing.');
  if (!input.auditChainVerified) blockers.push('Audit-chain verification is missing.');
  if (!input.migrationsVerified) blockers.push('Migration verification is missing.');
  return { ready: blockers.length === 0, durationMs, blockers };
}

export function verifyRestoreDrillEvidence(evidence: RestoreDrillEvidence): boolean {
  const { checksum, ...unsigned } = evidence;
  return Boolean(checksum) && checksum === digest(unsigned) && evidence.status === (validateRestoreDrillEvidence(unsigned).ready ? 'passed' : 'blocked');
}
