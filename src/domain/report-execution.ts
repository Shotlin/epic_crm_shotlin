import { createHash } from 'node:crypto';
import type { OperatingRecordScope } from '../shared/revenue-ops-contracts';
import type { ReportPack } from './report-packs';

export type ReportExecutionStatus = 'ready' | 'partial' | 'blocked';

export interface ReportExecutionRow {
  key: string;
  label: string;
  value: number;
  unit: string;
  sensitivity: string;
  sourceCollections: string[];
}

export interface GovernedReportExecution {
  id: string;
  packId: string;
  scope: OperatingRecordScope;
  generatedAt: string;
  executedBy: string;
  status: ReportExecutionStatus;
  rows: ReportExecutionRow[];
  missingMetricKeys: string[];
  blockedReason?: string;
  checksum: string;
}

function canonicalPayload(execution: Omit<GovernedReportExecution, 'checksum'>): string {
  return JSON.stringify(execution);
}

function sameScope(left: OperatingRecordScope, right: OperatingRecordScope): boolean {
  return left.companyId === right.companyId && left.branchId === right.branchId;
}

/**
 * Executes only the metrics already approved by a report pack. Restricted or
 * unavailable dependencies are omitted and reported; values are never guessed.
 */
export function executeGovernedReport(input: {
  pack: ReportPack;
  catalogScope: OperatingRecordScope;
  requestedScope: OperatingRecordScope;
  executedBy: string;
  generatedAt?: string;
}): GovernedReportExecution {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('Report execution timestamp is invalid.');
  if (!input.executedBy.trim()) throw new Error('Report executor is required.');
  if (!sameScope(input.catalogScope, input.requestedScope)) throw new Error('Report scope does not match the governed catalog scope.');
  const rows = input.pack.metrics.filter((metric) => metric.available && metric.value !== null).map((metric) => ({ key: metric.key, label: metric.label, value: metric.value!, unit: metric.unit, sensitivity: metric.sensitivity, sourceCollections: [...metric.sourceCollections].sort() }));
  const status: ReportExecutionStatus = input.pack.readiness === 'blocked' ? 'blocked' : input.pack.readiness === 'partial' ? 'partial' : 'ready';
  const executionWithoutChecksum: Omit<GovernedReportExecution, 'checksum'> = {
    id: `report-${input.pack.id}-${generatedAt.replace(/[^0-9]/g, '').slice(0, 14)}`,
    packId: input.pack.id,
    scope: { ...input.requestedScope },
    generatedAt,
    executedBy: input.executedBy.trim(),
    status,
    rows,
    missingMetricKeys: [...input.pack.missingMetricKeys].sort(),
    ...(status === 'blocked' ? { blockedReason: 'All governed metric dependencies are unavailable or restricted.' } : {}),
  };
  return { ...executionWithoutChecksum, checksum: createHash('sha256').update(canonicalPayload(executionWithoutChecksum), 'utf8').digest('hex') };
}

export function verifyGovernedReportExecution(execution: GovernedReportExecution): boolean {
  const withoutChecksum: Omit<GovernedReportExecution, 'checksum'> = {
    id: execution.id,
    packId: execution.packId,
    scope: execution.scope,
    generatedAt: execution.generatedAt,
    executedBy: execution.executedBy,
    status: execution.status,
    rows: execution.rows,
    missingMetricKeys: execution.missingMetricKeys,
    ...(execution.blockedReason ? { blockedReason: execution.blockedReason } : {}),
  };
  const expected = createHash('sha256').update(canonicalPayload(withoutChecksum), 'utf8').digest('hex');
  return execution.checksum === expected;
}
